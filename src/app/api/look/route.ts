import { NextRequest, NextResponse } from 'next/server'
import {
  listBlobs,
  readJsonBlob,
  writeJsonBlob,
  deleteBlob,
} from '@/lib/blobStore'

/**
 * Look gallery items live as one blob per file in `meta/look/`. Their display
 * order is stored separately at `state/look-order.json` (an array of fileNames).
 *
 * Migrating from the previous filesystem layout:
 *   meta/look/<fileName>.json   (was public/assets/look/_meta/<fileName>.json)
 *   state/look-order.json       (was public/assets/look/_meta/_order.json)
 *   media/look/<fileName>       (was public/assets/look/<fileName>)
 */

const META_PREFIX = 'meta/look/'
const ORDER_KEY = 'state/look-order.json'

type MetaItem = {
  fileName: string
  uploadedAt?: string
  [key: string]: unknown
}

async function fetchJsonBlob(url: string): Promise<MetaItem | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as MetaItem
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const blobs = await listBlobs(META_PREFIX)
    const items: MetaItem[] = []
    for (const b of blobs) {
      if (!b.pathname.endsWith('.json')) continue
      const data = await fetchJsonBlob(b.url)
      if (data) items.push(data)
    }

    const order = await readJsonBlob<string[] | null>(ORDER_KEY, null)

    if (order && Array.isArray(order)) {
      const orderMap = new Map(order.map((fname, i) => [fname, i]))
      items.sort((a, b) => {
        const ai = orderMap.get(a.fileName) ?? 9999
        const bi = orderMap.get(b.fileName) ?? 9999
        return ai - bi
      })
    } else {
      items.sort((a, b) => {
        const at = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0
        const bt = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0
        return bt - at
      })
    }

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Look API error:', error)
    return NextResponse.json({ items: [] })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (body.action === 'reorder' && Array.isArray(body.order)) {
      await writeJsonBlob(ORDER_KEY, body.order)
      return NextResponse.json({ success: true })
    }

    if (body.action === 'sync' && Array.isArray(body.items)) {
      const keepSet = new Set(body.items as string[])
      // Enumerate every meta blob; if its fileName is no longer in the keep
      // set, delete both the meta blob and the corresponding media blob.
      const blobs = await listBlobs(META_PREFIX)
      for (const b of blobs) {
        if (!b.pathname.endsWith('.json')) continue
        // pathname looks like "meta/look/some-file.webp.json"; strip prefix + .json
        const metaName = b.pathname.slice(META_PREFIX.length)
        const fileName = metaName.replace(/\.json$/, '')
        if (!keepSet.has(fileName)) {
          await deleteBlob(b.pathname)
          await deleteBlob(`media/look/${fileName}`)
        }
      }
      await writeJsonBlob(ORDER_KEY, body.items)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Look API POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
