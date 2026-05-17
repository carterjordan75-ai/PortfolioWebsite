import { NextRequest, NextResponse } from 'next/server'
import { readJsonBlob, writeJsonBlob } from '@/lib/blobStore'
import seedMisc from '../../../../data/misc.json'

// Live admin data — always rerun, never serve from edge/static cache.
export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

const BLOB_KEY = 'state/misc.json'

type MiscItem = Record<string, unknown>

async function getData(): Promise<{ items: MiscItem[] }> {
  return readJsonBlob<{ items: MiscItem[] }>(BLOB_KEY, seedMisc as { items: MiscItem[] })
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
    // single-user admin tool that's fine.)
    if (body.action === 'append' && Array.isArray(body.items)) {
      const current = await getData()
      const next = [...(current.items || []), ...body.items]
      await writeJsonBlob(BLOB_KEY, { items: next })
      return NextResponse.json({ success: true, items: next })
    }
    const { items } = body
    await writeJsonBlob(BLOB_KEY, { items })
    return NextResponse.json({ success: true, items })
  } catch (err) {
    console.error('Misc API error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
