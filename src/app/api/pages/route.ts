import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import path from 'path'

const PAGES_PATH = path.join(process.cwd(), 'data', 'pages.json')

async function getPagesData(): Promise<Record<string, Record<string, string>>> {
  try {
    const raw = await readFile(PAGES_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
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

    await mkdir(path.dirname(PAGES_PATH), { recursive: true })
    await writeFile(PAGES_PATH, JSON.stringify(data, null, 2))

    return NextResponse.json({ success: true, pages: data })
  } catch (err) {
    console.error('Pages API error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
