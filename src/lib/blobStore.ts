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
import { readFile } from 'fs/promises'
import path from 'path'

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
 * exist, fall back to reading from `fallbackFilesystemPath` (usually the
 * legacy data/*.json committed in the repo). If neither works, return
 * `fallbackValue`.
 */
export async function readJsonBlob<T>(
  key: string,
  fallbackFilesystemPath: string | null,
  fallbackValue: T,
): Promise<T> {
  // 1. Try Blob
  const url = await findBlobUrl(key)
  if (url) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (res.ok) return (await res.json()) as T
    } catch {
      /* fall through */
    }
  }

  // 2. Try local filesystem (legacy / dev seed)
  if (fallbackFilesystemPath) {
    try {
      const raw = await readFile(
        path.join(process.cwd(), fallbackFilesystemPath),
        'utf-8',
      )
      return JSON.parse(raw) as T
    } catch {
      /* fall through */
    }
  }

  // 3. Final fallback value
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
  })
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
