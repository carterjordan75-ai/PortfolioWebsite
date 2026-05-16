import { NextRequest, NextResponse } from 'next/server'
import { readJsonBlob, writeJsonBlob } from '@/lib/blobStore'

/**
 * On-disk shape (legacy data/pages.json): { [pageId]: { ...fields } }
 * API surface:
 *   GET  → { pages: { [pageId]: { ...fields } } }
 *   POST { pageId, fields } → merges fields into pages[pageId]
 */

const BLOB_KEY = 'state/pages.json'
const FALLBACK_FILE = 'data/pages.json'

type PagesData = Record<string, Record<string, unknown>>

async function getPagesData(): Promise<PagesData> {
  return readJsonBlob<PagesData>(BLOB_KEY, FALLBACK_FILE, {})
}

export async function GET() {
  const data = await getPagesData()
  return NextResponse.json({ pages: data })
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

    await writeJsonBlob(BLOB_KEY, data)

    return NextResponse.json({ success: true, pages: data })
  } catch (err) {
    console.error('Pages API error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
