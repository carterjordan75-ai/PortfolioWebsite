import { NextResponse } from 'next/server'
import { list } from '@vercel/blob'
import { readJsonBlob, readVersionedJson, listBlobs } from '@/lib/blobStore'
import seedAdminProjects from '../../../../public/assets/_data/admin-projects.json'
import seedPages from '../../../../data/pages.json'
import seedMisc from '../../../../data/misc.json'

/**
 * Admin storage browser endpoint.
 *
 * Returns every blob in the project's Blob store (paginated through), plus
 * a `referenced` flag computed by walking every admin-managed JSON document
 * for URLs. A blob is referenced if its URL appears anywhere in admin state;
 * everything else is "orphaned" — typically failed-upload originals,
 * abandoned drafts, or files removed before the leak fix shipped.
 *
 * The Storage Manager panel in admin uses this to surface orphans for bulk
 * deletion.
 */

const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }
export const dynamic = 'force-dynamic'

// Walk an arbitrary JSON value and collect any string that looks like a
// media reference — either an https URL on Vercel Blob OR a local
// /assets/... path. Both contribute to "what's referenced by admin state"
// and both are surfaced as library items so the user can reuse them when
// adding media to a new project.
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

export async function GET() {
  try {
    // Pull every admin-managed JSON, falling back to the committed seed.
    const [pages, misc, adminProjects, lookOrder] = await Promise.all([
      readJsonBlob<Record<string, unknown>>('state/pages.json', seedPages as Record<string, unknown>),
      readVersionedJson<{ items: unknown[] }>('state/misc.json', seedMisc as { items: unknown[] }),
      readJsonBlob<Record<string, unknown>>(
        'state/admin-projects.json',
        seedAdminProjects as Record<string, unknown>,
      ),
      readJsonBlob<string[] | null>('state/look-order.json', null),
    ])
    // Look meta blobs each carry their own URL — pull them all in parallel.
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

    // Now walk every blob in storage and tag it. We pull contentType and
    // uploadedAt from the underlying list() result for better UI.
    type Item = {
      pathname: string
      url: string
      size: number
      uploadedAt?: string
      referenced: boolean
    }
    const all: Item[] = []
    let cursor: string | undefined
    let totalBytes = 0
    const seenBlobUrls = new Set<string>()
    do {
      const page = await list({ cursor, limit: 1000 })
      for (const b of page.blobs) {
        totalBytes += b.size
        seenBlobUrls.add(b.url)
        // `state/*` and `meta/*` blobs are infrastructure (the admin JSON
        // store + per-file metadata that backs the look gallery etc) —
        // they're never referenced as media URLs, so they'd otherwise show
        // up as "orphans" and get nuked by a cleanup run. Treat them as
        // implicitly referenced so they're never tagged orphan.
        const isInfra = b.pathname.startsWith('state/') || b.pathname.startsWith('meta/')
        all.push({
          pathname: b.pathname,
          url: b.url,
          size: b.size,
          uploadedAt: b.uploadedAt ? new Date(b.uploadedAt).toISOString() : undefined,
          referenced: isInfra || refs.has(b.url),
        })
      }
      cursor = page.cursor
    } while (cursor)

    // Surface any /assets/<...> URLs found in admin state as virtual library
    // items so static-file references (like the bonfire home video that lives
    // in public/assets/home-videos/) can be picked from the library. Size
    // and uploadedAt are unknown for these so we leave them at 0 / undefined.
    for (const url of Array.from(refs)) {
      if (url.startsWith('/assets/') && !seenBlobUrls.has(url)) {
        const pathname = url.replace(/^\//, '') // 'assets/home-videos/foo.webm'
        all.push({
          pathname,
          url,
          size: 0,
          referenced: true,
        })
      }
    }

    // Largest first by default — most useful for cleanup.
    all.sort((a, b) => b.size - a.size)
    return NextResponse.json({ items: all, totalBytes, count: all.length }, NO_CACHE)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
