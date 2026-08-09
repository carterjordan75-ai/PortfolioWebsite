import { NextRequest, NextResponse } from 'next/server'
import { readVersionedJson, writeVersionedJson } from '@/lib/blobStore'
// Static import of the committed seed data so Next bundles it into the
// function. The first read on a fresh deploy (when nothing has been written
// to Blob yet) returns this; subsequent writes go to Blob and reads come back
// from there.
import seedPages from '../../../../data/pages.json'

// Live admin data — always rerun, never serve from edge/static cache.
export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

/**
 * On-disk shape (legacy data/pages.json): { [pageId]: { ...fields } }
 * API surface:
 *   GET  → { pages: { [pageId]: { ...fields } } }
 *   POST { pageId, fields } → merges fields into pages[pageId]
 */

const BLOB_KEY = 'state/pages.json'

type PagesData = Record<string, Record<string, unknown>>

async function getPagesData(): Promise<PagesData> {
  return readVersionedJson<PagesData>(BLOB_KEY, seedPages as PagesData)
}

export async function GET() {
  const data = await getPagesData()
  return NextResponse.json({ pages: data }, NO_CACHE)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { pageId, fields } = body

    if (!pageId || !fields) {
      return NextResponse.json({ error: 'pageId and fields required' }, { status: 400 })
    }

    const data = await getPagesData()
    data[pageId] = { ...(data[pageId] || {}), ...fields }

    await writeVersionedJson(BLOB_KEY, data)

    return NextResponse.json({ success: true, pages: data })
  } catch (err) {
    console.error('Pages API error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
