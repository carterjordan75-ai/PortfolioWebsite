import { createHash, timingSafeEqual, randomBytes } from 'crypto'
import {
  readVersionedJson,
  writeVersionedJson,
  listVersionedJson,
  listBlobs,
  deleteBlob,
  baseKeyOf,
} from '@/lib/blobStore'

/**
 * Motion Dailies — private review portal.
 *
 * The unit of work is a PROJECT, not a date. An overnight run produces
 * many entries and several projects can be in flight at once, so a date
 * can't be the key — it's just metadata on each entry.
 *
 *   Project ── references[]   material the PC downloads and builds from
 *           └─ Entry[]        what the PC produced (video + sheet + note)
 *                └─ Feedback  the reviewer's answer to that entry
 *
 * Storage layout (Vercel Blob):
 *   state/dailies-auth.json                  { apiKeyHash, passwordHash }
 *   state/dailies-projects/<projectId>.json
 *   state/dailies-entries/<entryId>.json
 *   state/dailies-feedback/<entryId>.json
 *   media/dailies/<projectId>/hero.<ext>
 *   media/dailies/<projectId>/refs/<name>.<ext>
 *   media/dailies/<projectId>/entries/<entryId>/video.mp4
 *   media/dailies/<projectId>/entries/<entryId>/contact.png
 *
 * SECURITY NOTE — why only hashes live in Blob: this store is PUBLIC and
 * its id appears in every media URL on the site, so any state blob is
 * effectively world-readable at a guessable path. Secrets are therefore
 * never stored; we keep SHA-256 of 32-byte random values, which is
 * irreversible. Env vars (DAILIES_API_KEY / DAILIES_PASSWORD) take
 * precedence when set — that's the rotation path.
 */

export const PROJECT_PREFIX = 'state/dailies-projects/'
export const ENTRY_PREFIX = 'state/dailies-entries/'
export const FEEDBACK_PREFIX = 'state/dailies-feedback/'
export const AUTH_KEY = 'state/dailies-auth.json'
export const SESSION_COOKIE = 'dailies_auth'

export type QuestionType = 'choice' | 'scale' | 'text'

export type Question = {
  id: string
  prompt: string
  type: QuestionType
  options?: string[]
}

/** Material the reviewer supplies for the PC to build from. */
export type Reference = {
  url: string
  filename: string
  note: string
  /** Motion references are often the clearest way to say "like this". */
  type: 'image' | 'video'
  added_at: string
}

const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v)(\?|$)/i

/** Older references predate the type field; fall back to the extension. */
export const referenceType = (r: { url: string; type?: string }): 'image' | 'video' =>
  r.type === 'video' || r.type === 'image' ? r.type : VIDEO_EXT_RE.test(r.url) ? 'video' : 'image'

/**
 * Where a project sits in the queue.
 *
 * `draft` exists so finishing one project doesn't immediately hand the
 * machine a half-written brief — a new project stays out of the queue
 * until it's deliberately started.
 */
export type ProjectStatus = 'draft' | 'active' | 'done'
export const PROJECT_STATUSES: ProjectStatus[] = ['draft', 'active', 'done']

export type Project = {
  id: string
  title: string
  brief: string
  hero_url: string | null
  references: Reference[]
  status: ProjectStatus
  created_at: string
  updated_at: string
}

/**
 * The one project the machine should be working on: the oldest that's
 * been started. Single-focus by design — the queue advances only when
 * you mark the current one done.
 */
export function currentProjectId(projects: Project[]): string | null {
  const active = projects
    .filter(p => p.status === 'active')
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
  return active[0]?.id ?? null
}

export type Entry = {
  id: string
  project_id: string
  date: string                 // when it was made — metadata, not identity
  title: string
  note: string
  questions: Question[]
  video_url: string | null
  contact_sheet_url: string | null
  created_at: string
  updated_at: string
}

export type Feedback = {
  entry_id: string
  project_id: string
  answers: Record<string, string | number>
  brief: string
  reference_images: string[]
  render_master: boolean
  submitted_at: string
}

type AuthRecord = { apiKeyHash: string; passwordHash: string; createdAt?: string }

export const sha256 = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex')

/** Constant-time compare of two hex digests. */
export function hashEquals(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

export const isValidDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/**
 * Ids become Blob path segments and URL segments, so they're restricted
 * to lowercase alphanumerics and dashes — nothing that needs escaping and
 * nothing that could climb out of its prefix.
 */
export const isValidId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(v) && !v.includes('--')

/** Turn a title into a usable id. Falls back to a random one. */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')  // strip combining accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48)
    .replace(/-+$/, '')
  return isValidId(slug) ? slug : `p-${randomBytes(5).toString('hex')}`
}

/**
 * Entry ids are minted server-side unless the client supplies one. The
 * leading timestamp keeps them sortable and readable; the random tail
 * stops two entries landing on the same id inside one second.
 */
export function newEntryId(projectId: string, when = new Date()): string {
  const stamp = when.toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const rand = randomBytes(2).toString('hex')
  // Trim the project half, never the random tail: cutting the tail could
  // leave a trailing dash (invalid) or collide two entries onto one id.
  const head = projectId.slice(0, 64 - stamp.length - rand.length - 2).replace(/-+$/, '')
  return `${head}-${stamp}-${rand}`
}

/**
 * Versioned, not plain: an overwritten blob keeps its URL and can serve
 * the previous body from CDN cache for a long time. For credentials that
 * would mean a rotated password silently not taking effect.
 */
async function authRecord(): Promise<AuthRecord | null> {
  const rec = await readVersionedJson<AuthRecord | null>(AUTH_KEY, null)
  return rec && rec.apiKeyHash && rec.passwordHash ? rec : null
}

/** Machine auth: `Authorization: Bearer <api key>`. */
export async function checkApiKey(request: Request): Promise<boolean> {
  const header = request.headers.get('authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return false
  const presented = match[1].trim()
  if (!presented) return false

  const envKey = process.env.DAILIES_API_KEY
  if (envKey) return hashEquals(sha256(presented), sha256(envKey))

  const rec = await authRecord()
  if (!rec) return false
  return hashEquals(sha256(presented), rec.apiKeyHash)
}

/**
 * Human auth: the session cookie carries the portal password itself
 * (httpOnly + secure + sameSite), verified by hashing. Stateless, so it
 * survives Blob's write-propagation lag — a server-side session store
 * would be unreadable for up to a minute after login.
 */
export async function checkSession(request: Request): Promise<boolean> {
  const cookie = request.headers.get('cookie') || ''
  const value = cookie
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1)
  if (!value) return false
  return verifyPassword(decodeURIComponent(value))
}

export async function verifyPassword(password: string): Promise<boolean> {
  if (!password) return false
  const envPass = process.env.DAILIES_PASSWORD
  if (envPass) return hashEquals(sha256(password), sha256(envPass))
  const rec = await authRecord()
  if (!rec) return false
  return hashEquals(sha256(password), rec.passwordHash)
}

// ── records ─────────────────────────────────────────────────────────

export async function getProject(id: string): Promise<Project | null> {
  return readVersionedJson<Project | null>(`${PROJECT_PREFIX}${id}.json`, null)
}

export async function saveProject(project: Project): Promise<void> {
  await writeVersionedJson(`${PROJECT_PREFIX}${project.id}.json`, project)
}

export async function getEntry(id: string): Promise<Entry | null> {
  return readVersionedJson<Entry | null>(`${ENTRY_PREFIX}${id}.json`, null)
}

export async function saveEntry(entry: Entry): Promise<void> {
  await writeVersionedJson(`${ENTRY_PREFIX}${entry.id}.json`, entry)
}

export async function getFeedback(entryId: string): Promise<Feedback | null> {
  return readVersionedJson<Feedback | null>(`${FEEDBACK_PREFIX}${entryId}.json`, null)
}

export async function saveFeedback(feedback: Feedback): Promise<void> {
  await writeVersionedJson(`${FEEDBACK_PREFIX}${feedback.entry_id}.json`, feedback)
}

/**
 * Every stored record under a prefix, fetched in parallel.
 *
 * listVersionedJson resolves each key to its newest version, so a write
 * that happened a second ago is visible here — the URL it returns is
 * brand new and therefore has nothing cached against it.
 */
async function readAll<T>(prefix: string): Promise<T[]> {
  const entries = await listVersionedJson(prefix)
  const results = await Promise.all(
    entries.map(async ({ url }): Promise<T | null> => {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        return res.ok ? ((await res.json()) as T) : null
      } catch {
        return null
      }
    }),
  )
  return results.filter(r => r !== null) as T[]
}

/** All projects, most recently touched first. */
export async function listProjects(): Promise<Project[]> {
  const projects = await readAll<Project>(PROJECT_PREFIX)
  return projects
    .filter(p => isValidId(p?.id))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
}

/** All entries, newest first. */
export async function listEntries(): Promise<Entry[]> {
  const entries = await readAll<Entry>(ENTRY_PREFIX)
  return entries
    .filter(e => isValidId(e?.id) && isValidId(e?.project_id))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
}

/** All feedback, newest submission first. */
export async function listFeedback(): Promise<Feedback[]> {
  const all = await readAll<Feedback>(FEEDBACK_PREFIX)
  return all
    .filter(f => isValidId(f?.entry_id))
    .sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || ''))
}

// ── mirroring finished work into /misc ──────────────────────────────

const MISC_KEY = 'state/misc.json'

/**
 * The tag that lands an item in the generative panel on /misc. It has to
 * be exactly this string — the page splits on it (see the isGenerative
 * check in src/app/misc/page.tsx), so a looser label would show up but
 * sort onto the wrong side.
 */
export const GEN_TAG = 'Generative'

type MiscItem = {
  src: string
  type: 'video' | 'image'
  title: string
  year: number
  medium?: string | string[]
  fileName?: string
}
type MiscData = { items: MiscItem[]; tombstones?: string[] }

const fileNameOf = (url: string) => url.split('?')[0].split('/').pop() || 'file'

/** The source URL an entry publishes as: the piece, not its contact sheet. */
export const entrySource = (entry: Entry): string | null =>
  entry.video_url || entry.contact_sheet_url || null

/**
 * Every source already on /misc, plus every one that's been deleted from
 * it. Used to show which entries have been published, and to stop a
 * "push to Misc" button resurrecting something deliberately removed.
 */
export async function miscSources(
  seed: unknown,
): Promise<{ present: Set<string>; tombstoned: Set<string> }> {
  const current = await readVersionedJson<MiscData>(MISC_KEY, seed as MiscData)
  return {
    present: new Set((current.items || []).map(i => i.src)),
    tombstoned: new Set(current.tombstones || []),
  }
}

/**
 * Copy a finished project's entries onto /misc, tagged generative.
 *
 * One item per entry: the video if there is one, otherwise the contact
 * sheet — pushing both would double up, since the sheet is a working
 * artefact of the same piece. Oldest first, so the run reads as a
 * progression.
 *
 * Skips anything already on /misc and anything tombstoned there, so
 * re-completing a project can't resurrect an item that was deliberately
 * deleted, and can't add it twice.
 */
export async function mirrorProjectToMisc(
  project: Project,
  entries: Entry[],
  seed: unknown,
): Promise<number> {
  const current = await readVersionedJson<MiscData>(MISC_KEY, seed as MiscData)
  const items = Array.isArray(current.items) ? current.items : []
  const tombstones = new Set(current.tombstones || [])
  const present = new Set(items.map(i => i.src))

  const additions: MiscItem[] = []
  const chronological = [...entries].sort((a, b) =>
    (a.created_at || '').localeCompare(b.created_at || ''),
  )

  for (const entry of chronological) {
    const src = entry.video_url || entry.contact_sheet_url
    if (!src || present.has(src) || tombstones.has(src)) continue
    present.add(src)
    additions.push({
      src,
      type: entry.video_url ? 'video' : 'image',
      title: entry.title || project.title,
      year: Number((entry.date || entry.created_at || '').slice(0, 4)) || new Date().getFullYear(),
      medium: [GEN_TAG],
      fileName: fileNameOf(src),
    })
  }

  if (additions.length === 0) return 0

  await writeVersionedJson(MISC_KEY, {
    items: [...items, ...additions],
    tombstones: current.tombstones || [],
  })
  return additions.length
}

// ── deletion ────────────────────────────────────────────────────────
// An unattended overnight run can produce dozens of entries, so pruning
// is a first-class operation, not an afterthought. Deletes take the
// media with them — an orphaned 60 MB video would otherwise sit in Blob
// forever, invisible and still billed.

async function deletePrefix(prefix: string): Promise<number> {
  const blobs = await listBlobs(prefix)
  await Promise.all(blobs.map(b => deleteBlob(b.url).catch(() => false)))
  return blobs.length
}

/**
 * Delete every version of a versioned key. Matching on the base key
 * matters: `state/dailies-entries/foo.json` is stored as
 * `foo@v00001754…-a3f9.json`, so an exact-path delete would miss.
 */
async function deleteAllVersions(key: string): Promise<void> {
  const stem = key.replace(/\.[^.]+$/, '')
  const blobs = await listBlobs(stem)
  await Promise.all(
    blobs
      .filter(b => baseKeyOf(b.pathname) === key)
      .map(b => deleteBlob(b.url).catch(() => false)),
  )
}

/** Remove one entry: its record, its feedback and its media. */
export async function deleteEntry(entry: Entry): Promise<void> {
  await Promise.all([
    deleteAllVersions(`${ENTRY_PREFIX}${entry.id}.json`),
    deleteAllVersions(`${FEEDBACK_PREFIX}${entry.id}.json`),
    deletePrefix(`media/dailies/${entry.project_id}/entries/${entry.id}/`),
  ])
}

/** Remove a project, every entry under it, and all of its media. */
export async function deleteProject(id: string): Promise<number> {
  const entries = (await listEntries()).filter(e => e.project_id === id)
  await Promise.all(
    entries.flatMap(e => [
      deleteAllVersions(`${ENTRY_PREFIX}${e.id}.json`),
      deleteAllVersions(`${FEEDBACK_PREFIX}${e.id}.json`),
    ]),
  )
  // One sweep covers hero, references and every entry's media at once.
  await deletePrefix(`media/dailies/${id}/`)
  await deleteAllVersions(`${PROJECT_PREFIX}${id}.json`)
  return entries.length
}
