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

/**
 * A file the reviewer supplies. Two collections use this shape and the
 * difference matters to whatever is building:
 *
 *   references  direction — "make it feel like this". Not to be reused.
 *   sources     the actual material the piece is built FROM: footage,
 *               plates, stills to composite.
 *
 * Keeping them apart stops a mood clip being treated as usable footage,
 * or a plate being copied as a style cue.
 */
export type Asset = {
  /** The file itself, or — for a link — the page it points at. */
  url: string
  filename: string
  note: string
  /** Motion is often the clearest way to say "like this". */
  type: 'image' | 'video' | 'link'
  added_at: string

  // ── links only ────────────────────────────────────────────────
  /** Resolved page title, so the card reads as something. */
  title?: string
  /** Cover image for the card. Not itself a reference. */
  preview_url?: string
  /**
   * Individual images behind the link, where they could be resolved —
   * a Pinterest board expands to its pins. These ARE references: the
   * machine downloads them. A link that resolves to nothing still has
   * value, since an agent with web access can visit it.
   */
  images?: string[]
}

/** Kept as an alias: `references` was the original name for this shape. */
export type Reference = Asset

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

/**
 * The finishing job, raised once when a project is approved.
 *
 * Approving asks for masters in three shapes rather than one — each
 * recomposed for its frame, not a centre-crop of the same master, and
 * each with its own contact sheet in that same ratio. It fires on the
 * first transition to done and
 * never again, and the project stays the machine's current job until the
 * masters land, so approval doesn't hand the queue on with the finishing
 * work still outstanding.
 */
export type Delivery = {
  requested_at: string | null
  done_at: string | null
}

export const DELIVERY_FORMATS = ['16:9', '9:16', '1:1'] as const

/**
 * A concept, proposed in words before anything is rendered.
 *
 * Renders cost hours; ideas cost nothing. Going straight to production
 * spends the expensive currency on the cheap decision, and it converges
 * on the middle of whatever the brief described. Making the machine
 * commit to an idea and defend it — with a constraint, not just a
 * description — is what moves the work off the default.
 */
export type Pitch = {
  id: string
  title: string
  /** The idea itself. */
  concept: string
  /** The hard rule that forces invention. Descriptions invite defaults. */
  constraint: string
  /** Why it might be good. */
  why: string
  /** What could go wrong — stated up front, not discovered at hour five. */
  risk: string
}

/**
 * Styles a project can be tagged with, grouped as the dropdown shows
 * them. Free text in a brief is easy to be vague in; picking "Character
 * Animation" and "Houdini" tells the machine what KIND of thing this is
 * before it reads a word.
 *
 * A project can carry several — most real work is a discipline plus a
 * tool plus a look.
 */
export const STYLE_GROUPS: Array<{ group: string; styles: string[] }> = [
  {
    group: 'Discipline',
    styles: [
      'Logo Animation',
      'Text / Kinetic Typography',
      'Character Animation',
      'Title Sequence',
      'UI / Product Animation',
      'Explainer / Motion Graphics',
      'Data Visualisation',
      'Broadcast / Ident',
      'Music Video',
    ],
  },
  {
    group: 'Tool / technique',
    styles: [
      'TouchDesigner',
      'Houdini',
      'Cinema 4D',
      'Blender',
      'After Effects',
      'Unreal Engine',
      'Shader / GLSL',
      'AI / Diffusion',
      'Photogrammetry / Scan',
    ],
  },
  {
    group: 'Simulation',
    styles: [
      'Particles',
      'Fluid / Liquid',
      'Cloth / Soft Body',
      'Rigid Body / Destruction',
      'Crowd / Flocking',
      'Growth / Organic',
    ],
  },
  {
    group: 'Look',
    styles: [
      'Abstract / Generative',
      'Photoreal / CGI',
      'Glitch / Datamosh',
      'Collage / Cutout',
      'Isometric',
      'Cel / 2D Frame-by-frame',
      'Stop Motion',
      'Rotoscope',
      'Morphing',
      'Seamless Loop',
      'Analogue / Film Grain',
      'Minimal / Swiss',
      'Maximal / Y2K',
    ],
  },
]

export const ALL_STYLES: string[] = STYLE_GROUPS.flatMap(g => g.styles)

/**
 * The brief, as questions rather than a blank box.
 *
 * A vague brief is what produces competent, uninteresting work — the
 * machine fills the gaps with defaults. These are chosen to force
 * specifics: where it lives changes every decision, and naming what
 * would make it generic is usually sharper than naming what you want.
 *
 * All optional. Answer two and it's still better than a blank page.
 */
export const BRIEF_QUESTIONS: Array<{
  id: string
  question: string
  placeholder: string
  rows: number
}> = [
  {
    id: 'what',
    question: 'In one line, what is it?',
    placeholder: 'A logo that assembles itself out of falling type.',
    rows: 2,
  },
  {
    id: 'where',
    question: 'Where does it end up?',
    placeholder: 'Instagram, muted, autoplay. 6 seconds, seamless loop.',
    rows: 2,
  },
  {
    id: 'feel',
    question: 'How should it move?',
    placeholder: 'Heavy and unhurried. Nothing bounces, nothing eases out.',
    rows: 2,
  },
  {
    id: 'must',
    question: 'Non-negotiables — what must be true?',
    placeholder: 'Logo legible for the last 2s. Two colours only. No shadows.',
    rows: 2,
  },
  {
    id: 'avoid',
    question: 'What would make this generic?',
    placeholder: 'Particles drifting upward. Purple-to-teal gradients. Slow zoom on everything.',
    rows: 2,
  },
]

export const BRIEF_QUESTION_IDS = BRIEF_QUESTIONS.map(q => q.id)

export type Project = {
  id: string
  title: string
  brief: string
  hero_url: string | null
  references: Asset[]
  sources: Asset[]
  /** Answers to BRIEF_QUESTIONS, keyed by question id. */
  brief_answers: Record<string, string>
  /** What kind of thing this is — see STYLE_GROUPS. */
  styles: string[]
  /** Concepts on the table. Empty until the machine has pitched. */
  pitches: Pitch[]
  /** The one being built. Nothing is produced until this is set. */
  chosen_pitch_id: string | null
  /** Bumped when you reject a whole round, so it knows to start again. */
  pitch_round: number
  /** Rejected titles, so a later round doesn't re-pitch the same thing. */
  rejected_pitches: string[]
  /**
   * What the machine took away from making this: techniques that
   * worked, dead ends, gotchas. Written on delivery and read back at the
   * start of every later project, so each one begins knowing what the
   * ones before it found out.
   */
  learnings: string
  status: ProjectStatus
  delivery: Delivery
  created_at: string
  updated_at: string
}

export const deliveryPending = (p: Project): boolean =>
  !!p.delivery?.requested_at && !p.delivery?.done_at

/** Nothing gets made until a concept has been picked. */
export const needsPitch = (p: Project): boolean =>
  p.status === 'active' && !p.chosen_pitch_id

/**
 * The one project the machine should be working on: the oldest that's
 * been started. Single-focus by design — the queue advances only when
 * you mark the current one done.
 */
export function currentProjectId(projects: Project[]): string | null {
  const open = projects
    // An approved project still owes its masters, so it keeps the
    // machine until those are delivered.
    .filter(p => p.status === 'active' || (p.status === 'done' && deliveryPending(p)))
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
  return open[0]?.id ?? null
}

/**
 * Which folder an entry lives in.
 *
 * `wip` is the nightly back-and-forth — dozens of them. `final` is the
 * delivered masters. Keeping them apart matters most at the end, when
 * you want the four finished files and not the forty that got you there.
 */
export type EntryStage = 'wip' | 'final'
export const ENTRY_STAGES: EntryStage[] = ['wip', 'final']

export type Entry = {
  id: string
  project_id: string
  date: string                 // when it was made — metadata, not identity
  stage: EntryStage
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

/**
 * Every media file an entry holds, as its own asset. A video and its
 * contact sheet are different pictures at different aspect ratios, so
 * they're listed, published and reviewed separately.
 */
export function entryAssets(entry: Entry): Array<{ url: string; kind: 'video' | 'still' }> {
  const out: Array<{ url: string; kind: 'video' | 'still' }> = []
  if (entry.video_url) out.push({ url: entry.video_url, kind: 'video' })
  if (entry.contact_sheet_url) out.push({ url: entry.contact_sheet_url, kind: 'still' })
  return out
}

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
 * Publish one asset to /misc, tagged generative.
 *
 * Refuses anything already there or tombstoned, so pressing the button
 * twice adds nothing and something deliberately deleted from Misc is
 * never resurrected. Returns whether it actually added anything.
 */
export async function publishToMisc(
  project: Project,
  entry: Entry,
  url: string,
  kind: 'video' | 'still',
  seed: unknown,
): Promise<boolean> {
  const current = await readVersionedJson<MiscData>(MISC_KEY, seed as MiscData)
  const items = Array.isArray(current.items) ? current.items : []
  const tombstones = new Set(current.tombstones || [])
  if (tombstones.has(url) || items.some(i => i.src === url)) return false

  const item: MiscItem = {
    src: url,
    type: kind === 'video' ? 'video' : 'image',
    title: entry.title || project.title,
    year: Number((entry.date || entry.created_at || '').slice(0, 4)) || new Date().getFullYear(),
    medium: [GEN_TAG],
    fileName: fileNameOf(url),
  }

  await writeVersionedJson(MISC_KEY, {
    items: [...items, item],
    tombstones: current.tombstones || [],
  })
  return true
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

/**
 * Remove ONE file from an entry, blob and all.
 *
 * If it was the entry's last file the entry goes with it — an entry with
 * no media is just a stranded note. Also drops the file from /misc,
 * since leaving it there would publish a dead URL.
 */
export async function deleteAsset(entry: Entry, url: string, seed: unknown): Promise<'entry' | 'asset'> {
  const remaining = entryAssets(entry).filter(a => a.url !== url)
  await deleteBlob(url)

  const current = await readVersionedJson<MiscData>(MISC_KEY, seed as MiscData)
  const items = (current.items || []).filter(i => i.src !== url)
  if (items.length !== (current.items || []).length) {
    await writeVersionedJson(MISC_KEY, { items, tombstones: current.tombstones || [] })
  }

  if (remaining.length === 0) {
    await deleteEntry(entry)
    return 'entry'
  }

  await saveEntry({
    ...entry,
    video_url: entry.video_url === url ? null : entry.video_url,
    contact_sheet_url: entry.contact_sheet_url === url ? null : entry.contact_sheet_url,
    updated_at: new Date().toISOString(),
  })
  return 'asset'
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
