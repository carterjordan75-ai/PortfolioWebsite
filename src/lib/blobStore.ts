/**
 * Vercel Blob helpers.
 *
 * The site used to persist admin state by writing JSON files to disk under
 * data/ + public/assets/. That broke on Vercel because serverless functions
 * have an ephemeral filesystem — any write is gone the next cold start. So we
 * moved all admin-managed state into Vercel Blob.
 *
 * Conventions:
 *   - JSON state (e.g. pages.json, misc.json):  state/<name>.json
 *   - Per-file metadata for uploaded media:     meta/<section>/<filename>.json
 *   - Uploaded media files themselves:          media/<section>/<filename>
 *
 * All blobs are written with `addRandomSuffix: false` + `allowOverwrite: true`
 * so the pathname IS the key — every write to the same key replaces the
 * previous blob in-place. That gives us "S3 with predictable URLs" semantics.
 *
 * For state reads, if a blob doesn't exist yet we fall back to the legacy
 * filesystem JSON that's committed in the repo. This lets us roll out the
 * migration without a separate seeding step: the first time admin writes to a
 * page, the existing committed data is what gets read; the new edit then
 * overwrites it in Blob.
 */

import { put, list, del } from '@vercel/blob'

const HAS_TOKEN = !!process.env.BLOB_READ_WRITE_TOKEN

export function blobConfigured(): boolean {
  return HAS_TOKEN
}

/**
 * Look up the public URL of a blob by its exact pathname. Returns null if
 * not found.
 */
async function findBlobUrl(pathname: string): Promise<string | null> {
  if (!HAS_TOKEN) return null
  try {
    const { blobs } = await list({ prefix: pathname, limit: 5 })
    const match = blobs.find(b => b.pathname === pathname)
    return match ? match.url : null
  } catch {
    return null
  }
}

/**
 * Read a JSON blob by key (e.g. "state/pages.json"). If the blob doesn't
 * exist or the fetch fails, return `fallbackValue` — which callers should
 * supply as the legacy seed data (imported statically at the top of each
 * route so Next.js bundles it).
 *
 * (Earlier versions of this helper tried to read a fallback file from disk
 * via path.join(process.cwd(), '...'). That works in dev but on Vercel the
 * static tracer can't follow that dynamic path, so the seed JSON wasn't in
 * the function bundle and the fallback silently became `{}`. Static imports
 * sidestep the entire tracing question.)
 */
export async function readJsonBlob<T>(
  key: string,
  fallbackValue: T,
): Promise<T> {
  const url = await findBlobUrl(key)
  if (url) {
    try {
      // Cache-buster: overwritten blobs can be served stale by the blob
      // CDN for up to ~a minute. A unique query string forces an edge
      // MISS so read-after-write is immediately consistent — without it,
      // rapid read-modify-write cycles (e.g. hiding two feed pins in
      // quick succession) could clobber each other's writes.
      const busted = `${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}`
      const res = await fetch(busted, { cache: 'no-store' })
      if (res.ok) return (await res.json()) as T
    } catch {
      /* fall through */
    }
  }
  return fallbackValue
}

/**
 * Write a JSON value to Blob under the given key. Overwrites any existing
 * blob at the same key.
 */
export async function writeJsonBlob<T>(key: string, value: T): Promise<void> {
  if (!HAS_TOKEN) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN not configured. Set it in .env.local or in the Vercel project env vars.',
    )
  }
  await put(key, JSON.stringify(value, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    // Without this the CDN caches state JSON for a month. The `?cb=`
    // buster in readJsonBlob does NOT help — Blob's CDN ignores the query
    // string when keying its cache (measured: `x-vercel-cache: HIT`,
    // `age: 93` on a freshly overwritten blob). 60s is the documented
    // floor; it bounds staleness instead of eliminating it. Where
    // read-after-write actually has to hold, use the versioned helpers
    // below rather than relying on this.
    cacheControlMaxAge: 60,
  })
}

// ── versioned JSON: read-after-write consistency ────────────────────
//
// Overwriting a blob keeps the same URL, and that URL sits behind a CDN
// that can serve the previous body for up to a minute. For read-modify-
// write state that's data loss, not just lag: read stale -> add an item
// -> write back -> the item added a moment ago is gone.
//
// The fix is to never overwrite. Each write lands on a NEW pathname
// carrying a timestamp, so its URL has no cache entry and is always
// fresh. Readers use list() — an API call against the control plane,
// which IS immediately consistent — to find the newest version. Older
// versions are pruned after each write.

const VERSION_SEP = '@v'

const versionedName = (key: string, stamp: number, salt: string) => {
  const dot = key.lastIndexOf('.')
  const [stem, ext] = dot === -1 ? [key, ''] : [key.slice(0, dot), key.slice(dot)]
  // Fixed-width so plain lexical ordering matches chronological order.
  return `${stem}${VERSION_SEP}${String(stamp).padStart(14, '0')}-${salt}${ext}`
}

/** The original key a versioned pathname belongs to. */
export function baseKeyOf(pathname: string): string {
  const at = pathname.indexOf(VERSION_SEP)
  if (at === -1) return pathname
  const dot = pathname.lastIndexOf('.')
  return dot > at ? pathname.slice(0, at) + pathname.slice(dot) : pathname.slice(0, at)
}

/** Write a new version of `key` and prune the ones it supersedes. */
export async function writeVersionedJson<T>(key: string, value: T): Promise<void> {
  if (!HAS_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN not configured.')
  }
  const salt = Math.random().toString(36).slice(2, 8)
  const pathname = versionedName(key, Date.now(), salt)

  await put(pathname, JSON.stringify(value, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  })

  // Drop every older version of this key, plus any legacy unversioned
  // blob sitting at the bare path. Anything NEWER is a concurrent write
  // and is deliberately left alone.
  try {
    const { blobs } = await list({ prefix: `${key.replace(/\.[^.]+$/, '')}`, limit: 1000 })
    const stale = blobs.filter(
      b => baseKeyOf(b.pathname) === key && b.pathname !== pathname && b.pathname < pathname,
    )
    await Promise.all(stale.map(b => del(b.url).catch(() => undefined)))
  } catch {
    /* pruning is housekeeping — a failure here must not fail the write */
  }
}

/** Read the newest version of `key`, falling back to `fallbackValue`. */
export async function readVersionedJson<T>(key: string, fallbackValue: T): Promise<T> {
  if (!HAS_TOKEN) return fallbackValue
  try {
    const { blobs } = await list({ prefix: `${key.replace(/\.[^.]+$/, '')}`, limit: 1000 })
    const mine = blobs
      .filter(b => baseKeyOf(b.pathname) === key)
      .sort((a, b) => b.pathname.localeCompare(a.pathname))
    if (mine.length === 0) return fallbackValue
    const res = await fetch(mine[0].url, { cache: 'no-store' })
    if (res.ok) return (await res.json()) as T
  } catch {
    /* fall through */
  }
  return fallbackValue
}

/**
 * Newest version of every distinct key under `prefix`, as
 * [baseKey, url] pairs. One list() call for the whole collection.
 */
export async function listVersionedJson(prefix: string): Promise<Array<{ key: string; url: string }>> {
  const blobs = await listBlobs(prefix)
  const newest = new Map<string, { key: string; url: string; pathname: string }>()
  for (const b of blobs) {
    if (!b.pathname.endsWith('.json')) continue
    const key = baseKeyOf(b.pathname)
    const current = newest.get(key)
    if (!current || b.pathname > current.pathname) {
      newest.set(key, { key, url: b.url, pathname: b.pathname })
    }
  }
  return Array.from(newest.values()).map(({ key, url }) => ({ key, url }))
}

/**
 * Upload a binary file (image / video) to Blob and return the resulting
 * public URL. Caller is responsible for choosing the pathname (e.g.
 * "media/home-videos/foo.mp4").
 */
export async function putMediaBlob(
  pathname: string,
  body: Buffer | Blob | ArrayBuffer,
  contentType: string,
): Promise<{ url: string; pathname: string }> {
  if (!HAS_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN not configured.')
  }
  // Normalize ArrayBuffer to Buffer so the @vercel/blob type narrows correctly
  // (PutBody accepts Buffer / Blob / Readable / File / ReadableStream).
  const payload: Buffer | Blob = body instanceof ArrayBuffer ? Buffer.from(body) : body
  const result = await put(pathname, payload, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  })
  return { url: result.url, pathname: result.pathname }
}

/**
 * Delete a blob by its URL. Returns true on success, false on failure.
 */
export async function deleteBlob(urlOrPathname: string): Promise<boolean> {
  if (!HAS_TOKEN) return false
  try {
    await del(urlOrPathname)
    return true
  } catch {
    return false
  }
}

/**
 * List blobs under a prefix. Used for collection endpoints like /api/look
 * that need to enumerate per-file metadata.
 */
export async function listBlobs(prefix: string) {
  if (!HAS_TOKEN) return [] as Array<{ pathname: string; url: string; size: number }>
  try {
    const all: Array<{ pathname: string; url: string; size: number }> = []
    let cursor: string | undefined
    do {
      const page = await list({ prefix, cursor, limit: 1000 })
      all.push(
        ...page.blobs.map(b => ({
          pathname: b.pathname,
          url: b.url,
          size: b.size,
        })),
      )
      cursor = page.cursor
    } while (cursor)
    return all
  } catch {
    return []
  }
}
