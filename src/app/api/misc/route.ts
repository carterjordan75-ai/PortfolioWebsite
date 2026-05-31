import { NextRequest, NextResponse } from 'next/server'
import { readJsonBlob, writeJsonBlob } from '@/lib/blobStore'
import seedMisc from '../../../../data/misc.json'

// Live admin data — always rerun, never serve from edge/static cache.
export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

const BLOB_KEY = 'state/misc.json'

type MiscItem = Record<string, unknown>
type MiscData = { items: MiscItem[]; tombstones?: string[] }

// `tombstones` is a list of blob URLs the user has explicitly deleted
// from /misc. The misc page auto-surfaces media from featured projects
// as a fallback when their client isn't represented in the misc store;
// without tombstones, deleting such an item would silently come back on
// the next reload. Tombstones make deletes sticky.

async function getData(): Promise<MiscData> {
  return readJsonBlob<MiscData>(BLOB_KEY, seedMisc as MiscData)
}

export async function GET() {
  const data = await getData()
  return NextResponse.json(data, NO_CACHE)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // `action: 'append'` appends the given items to whatever is currently in
    // Blob without replacing the rest. Used by the auto-mirror flow on
    // featured-project uploads — concurrent appends from a multi-file batch
    // serialize through Blob writes per call. (No write-locking, but for a
    // single-user admin tool that's fine.) Tombstones are preserved on
    // append so a re-uploaded mirror doesn't accidentally clobber them.
    if (body.action === 'append' && Array.isArray(body.items)) {
      const current = await getData()
      const next = [...(current.items || []), ...body.items]
      await writeJsonBlob(BLOB_KEY, { items: next, tombstones: current.tombstones || [] })
      return NextResponse.json({ success: true, items: next })
    }
    // Full-replace path. Tombstones are MERGED with whatever's already in
    // the store — they're append-only from the user's point of view.
    const { items, tombstones } = body
    const current = await getData()
    const existing = current.tombstones || []
    const incoming = Array.isArray(tombstones) ? tombstones : []
    const mergedTombstones = Array.from(new Set([...existing, ...incoming]))
    await writeJsonBlob(BLOB_KEY, { items, tombstones: mergedTombstones })
    return NextResponse.json({ success: true, items, tombstones: mergedTombstones })
  } catch (err) {
    console.error('Misc API error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
