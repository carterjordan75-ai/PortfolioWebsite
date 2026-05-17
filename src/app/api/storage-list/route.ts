import { NextResponse } from 'next/server'
import { list } from '@vercel/blob'
import { readJsonBlob, listBlobs } from '@/lib/blobStore'
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

// Walk an arbitrary JSON value and collect any string that looks like an
// HTTPS URL hosted on Vercel Blob (vercel-storage.com / blob.vercel-storage).
function collectUrls(node: unknown, out: Set<string>): void {
  if (!node) return
  if (typeof node === 'string') {
    if (/^https?:\/\/[^/]*(vercel-storage|public\.blob\.vercel)/.test(node)) {
      out.add(node)
    }
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
      readJsonBlob<{ items: unknown[] }>('state/misc.json', seedMisc as { items: unknown[] }),
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
    do {
      const page = await list({ cursor, limit: 1000 })
      for (const b of page.blobs) {
        totalBytes += b.size
        all.push({
          pathname: b.pathname,
          url: b.url,
          size: b.size,
          uploadedAt: b.uploadedAt ? new Date(b.uploadedAt).toISOString() : undefined,
          referenced: refs.has(b.url),
        })
      }
      cursor = page.cursor
    } while (cursor)

    // Largest first by default — most useful for cleanup.
    all.sort((a, b) => b.size - a.size)
    return NextResponse.json({ items: all, totalBytes, count: all.length }, NO_CACHE)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
