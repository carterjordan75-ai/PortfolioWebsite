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
    const { items } = body
    await writeJsonBlob(BLOB_KEY, { items })
    return NextResponse.json({ success: true, items })
  } catch (err) {
    console.error('Misc API error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
