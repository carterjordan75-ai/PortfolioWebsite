import { createHash, timingSafeEqual } from 'crypto'
import { readJsonBlob, writeJsonBlob, listBlobs } from '@/lib/blobStore'

/**
 * Motion Dailies — private review portal.
 *
 * Storage layout (Vercel Blob):
 *   state/dailies-auth.json          { apiKeyHash, passwordHash }
 *   state/dailies/<date>.json        one daily per date
 *   state/dailies-feedback/<date>.json   one feedback per date
 *   media/dailies/<date>/video.mp4   uploaded by the render PC
 *   media/dailies/<date>/contact.png
 *   media/dailies/refs/...           reference images (random suffix)
 *
 * SECURITY NOTE — why only hashes live in Blob: this store is PUBLIC and
 * its id appears in every media URL on the site, so any state blob is
 * effectively world-readable at a guessable path. Secrets are therefore
 * never stored; we keep SHA-256 of 32-byte random values, which is
 * irreversible. Env vars (DAILIES_API_KEY / DAILIES_PASSWORD) take
 * precedence when set — that's the rotation path.
 */

export const DAILY_PREFIX = 'state/dailies/'
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

export type Daily = {
  date: string                 // YYYY-MM-DD (the record's identity)
  title: string
  note: string
  questions: Question[]
  video_url: string | null
  contact_sheet_url: string | null
  created_at: string
  updated_at: string
}

export type Feedback = {
  date: string
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

async function authRecord(): Promise<AuthRecord | null> {
  const rec = await readJsonBlob<AuthRecord | null>(AUTH_KEY, null)
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

export async function getDaily(date: string): Promise<Daily | null> {
  return readJsonBlob<Daily | null>(`${DAILY_PREFIX}${date}.json`, null)
}

export async function saveDaily(daily: Daily): Promise<void> {
  await writeJsonBlob(`${DAILY_PREFIX}${daily.date}.json`, daily)
}

export async function getFeedback(date: string): Promise<Feedback | null> {
  return readJsonBlob<Feedback | null>(`${FEEDBACK_PREFIX}${date}.json`, null)
}

export async function saveFeedback(feedback: Feedback): Promise<void> {
  await writeJsonBlob(`${FEEDBACK_PREFIX}${feedback.date}.json`, feedback)
}

/** Every stored record under a prefix, fetched in parallel. */
async function readAll<T>(prefix: string): Promise<T[]> {
  const blobs = await listBlobs(prefix)
  const jsonBlobs = blobs.filter(b => b.pathname.endsWith('.json'))
  const results = await Promise.all(
    jsonBlobs.map(async (b): Promise<T | null> => {
      try {
        // Cache-bust: overwritten blobs can serve stale at the edge.
        const res = await fetch(`${b.url}?cb=${Date.now()}`, { cache: 'no-store' })
        return res.ok ? ((await res.json()) as T) : null
      } catch {
        return null
      }
    }),
  )
  return results.filter((r): r is Awaited<T> => r !== null) as T[]
}

/** All dailies, newest first. */
export async function listDailies(): Promise<Daily[]> {
  const dailies = await readAll<Daily>(DAILY_PREFIX)
  return dailies
    .filter(d => isValidDate(d?.date))
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** All feedback, newest first. */
export async function listFeedback(): Promise<Feedback[]> {
  const all = await readAll<Feedback>(FEEDBACK_PREFIX)
  return all
    .filter(f => isValidDate(f?.date))
    .sort((a, b) => b.date.localeCompare(a.date))
}
