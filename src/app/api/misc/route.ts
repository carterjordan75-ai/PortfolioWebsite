import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import path from 'path'

const DATA_PATH = path.join(process.cwd(), 'data', 'misc.json')

type MiscItem = Record<string, unknown>

async function getData(): Promise<{ items: MiscItem[] }> {
  try {
    const raw = await readFile(DATA_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return { items: [] }
  }
}

export async function GET() {
  const data = await getData()
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { items } = body

    await mkdir(path.dirname(DATA_PATH), { recursive: true })
    await writeFile(DATA_PATH, JSON.stringify({ items }, null, 2))
    return NextResponse.json({ success: true, items })
  } catch (err) {
    console.error('Misc API error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
