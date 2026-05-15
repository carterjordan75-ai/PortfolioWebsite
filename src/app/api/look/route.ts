import { NextRequest, NextResponse } from 'next/server'
import { readdir, readFile, writeFile, mkdir, unlink } from 'fs/promises'
import path from 'path'

const META_DIR = path.join(process.cwd(), 'public', 'assets', 'look', '_meta')
const ORDER_PATH = path.join(META_DIR, '_order.json')

export async function GET() {
  try {
    let files: string[] = []
    try {
      files = await readdir(META_DIR)
    } catch {
      return NextResponse.json({ items: [] })
    }

    const items = await Promise.all(
      files
        .filter(f => f.endsWith('.json') && f !== '_order.json')
        .map(async (f) => {
          const content = await readFile(path.join(META_DIR, f), 'utf-8')
          return JSON.parse(content)
        })
    )

    // Check for custom order
    let order: string[] | null = null
    try {
      const raw = await readFile(ORDER_PATH, 'utf-8')
      order = JSON.parse(raw)
    } catch {}

    if (order && Array.isArray(order)) {
      // Sort by custom order, unordered items go to end
      const orderMap = new Map(order.map((fname, i) => [fname, i]))
      items.sort((a, b) => {
        const ai = orderMap.get(a.fileName) ?? 9999
        const bi = orderMap.get(b.fileName) ?? 9999
        return ai - bi
      })
    } else {
      items.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
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
      await mkdir(META_DIR, { recursive: true })
      await writeFile(ORDER_PATH, JSON.stringify(body.order, null, 2))
      return NextResponse.json({ success: true })
    }

    if (body.action === 'sync' && Array.isArray(body.items)) {
      await mkdir(META_DIR, { recursive: true })
      const keepSet = new Set(body.items as string[])
      // Remove metadata for deleted files
      try {
        const metaFiles = await readdir(META_DIR)
        for (const f of metaFiles) {
          if (f === '_order.json' || !f.endsWith('.json')) continue
          const fileName = f.replace('.json', '')
          if (!keepSet.has(fileName)) {
            await unlink(path.join(META_DIR, f)).catch(() => {})
            // Also remove the actual file
            const LOOK_DIR = path.join(process.cwd(), 'public', 'assets', 'look')
            await unlink(path.join(LOOK_DIR, fileName)).catch(() => {})
          }
        }
      } catch {}
      // Update order
      await writeFile(ORDER_PATH, JSON.stringify(body.items, null, 2))
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Look API POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
