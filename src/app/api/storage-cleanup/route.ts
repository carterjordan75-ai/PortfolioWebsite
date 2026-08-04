import { NextResponse } from 'next/server'
import { list } from '@vercel/blob'
import { readJsonBlob, readVersionedJsonMeta, listBlobs, deleteBlob } from '@/lib/blobStore'
import seedAdminProjects from '../../../../public/assets/_data/admin-projects.json'
import seedPages from '../../../../data/pages.json'
import seedMisc from '../../../../data/misc.json'

/**
 * Auto-cleanup endpoint. Walks all admin state for referenced media URLs,
 * lists every blob in the bucket, and deletes any blob that is:
 *
 *   1. inside `media/*` (we never touch `state/*` or `meta/*` — those are
 *      infrastructure blobs that aren't referenced as media URLs but must
 *      survive),
 *   2. unreferenced by any admin-managed JSON document,
 *   3. older than GRACE_HOURS — so a freshly uploaded blob that's mid-flow
 *      to being saved into state isn't nuked out from under the user.
 *
 * Triggered automatically when the admin panel opens (background fetch);
 * callers can also POST it manually after large remove operations. Returns
 * { deleted, kept, freedBytes, totalBytes } so the UI can surface stats.
 *
 * Safety: never deletes blobs we can't classify (e.g. missing uploadedAt) —
 * those are kept. Errors per-file don't abort the run.
 */

export const dynamic = 'force-dynamic'
const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

const GRACE_HOURS = 6

function collectUrls(node: unknown, out: Set<string>): void {
  if (!node) return
  if (typeof node === 'string') {
    const isBlob = /^https?:\/\/[^/]*(vercel-storage|public\.blob\.vercel)/.test(node)
    const isLocalAsset = /^\/assets\/[^?#]+\.(jpe?g|png|gif|webp|avif|svg|mp4|webm|mov|m4v)$/i.test(node)
    if (isBlob || isLocalAsset) out.add(node)
    return
  }
  if (Array.isArray(node)) {
    for (const v of node) collectUrls(v, out)
    return
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node as Record<string, unknown>)) {
      collectUrls(v, out)
    }
  }
}

export async function POST() {
  try {
    // 1. Gather every URL referenced by admin state.
    const [pages, miscRead, adminProjects, lookOrder] = await Promise.all([
      readJsonBlob<Record<string, unknown>>('state/pages.json', seedPages as Record<string, unknown>),
      // Versioned — /api/misc writes it that way, and reading the bare
      // path here silently returned the 9-item seed instead of the live
      // store, which made every real Misc file look like an orphan.
      readVersionedJsonMeta<{ items: unknown[] }>('state/misc.json', seedMisc as { items: unknown[] }),
      readJsonBlob<Record<string, unknown>>(
        'state/admin-projects.json',
        seedAdminProjects as Record<string, unknown>,
      ),
      readJsonBlob<string[] | null>('state/look-order.json', null),
    ])
    const misc = miscRead.value

    // A sweep that can't see the state it's checking against cannot tell
    // "orphaned" from "unreadable", and the failure mode is deleting live
    // media. If the store exists but didn't load, do nothing.
    if (!miscRead.found && (await listBlobs('state/misc')).length > 0) {
      return NextResponse.json(
        {
          error: 'Refusing to sweep: the misc store exists but could not be read.',
          deleted: 0, kept: 0, freedBytes: 0, totalBytes: 0, deletedPaths: [],
        },
        { status: 503, ...NO_CACHE },
      )
    }
    const lookMetas = await listBlobs('meta/look/')
    const lookItems = await Promise.all(
      lookMetas
        .filter(b => b.pathname.endsWith('.json'))
        .map(async b => {
          try {
            const res = await fetch(b.url, { cache: 'no-store' })
            return res.ok ? await res.json() : null
          } catch { return null }
        }),
    )
    const refs = new Set<string>()
    collectUrls(pages, refs)
    collectUrls(misc, refs)
    collectUrls(adminProjects, refs)
    collectUrls(lookOrder, refs)
    collectUrls(lookItems, refs)

    // 2. Walk every blob and decide.
    const cutoff = Date.now() - GRACE_HOURS * 60 * 60 * 1000
    let cursor: string | undefined
    let deleted = 0
    let kept = 0
    let freedBytes = 0
    let totalBytes = 0
    const deletedPaths: string[] = []

    do {
      const page = await list({ cursor, limit: 1000 })
      for (const b of page.blobs) {
        totalBytes += b.size
        // Infrastructure blobs (state JSON, look meta) stay forever.
        if (b.pathname.startsWith('state/') || b.pathname.startsWith('meta/')) {
          kept++
          continue
        }
        // Anything outside media/* we leave alone (e.g. legacy uploads at
        // the bucket root, public assets) — only sweep the media folder.
        if (!b.pathname.startsWith('media/')) {
          kept++
          continue
        }
        // Referenced → keep.
        if (refs.has(b.url)) {
          kept++
          continue
        }
        // Grace window — never delete freshly uploaded blobs.
        const uploadedMs = b.uploadedAt ? new Date(b.uploadedAt).getTime() : NaN
        if (!Number.isFinite(uploadedMs) || uploadedMs > cutoff) {
          kept++
          continue
        }
        // Orphan + old → delete.
        const ok = await deleteBlob(b.url)
        if (ok) {
          deleted++
          freedBytes += b.size
          deletedPaths.push(b.pathname)
        } else {
          kept++
        }
      }
      cursor = page.cursor
    } while (cursor)

    return NextResponse.json(
      { deleted, kept, freedBytes, totalBytes, deletedPaths, graceHours: GRACE_HOURS },
      NO_CACHE,
    )
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
