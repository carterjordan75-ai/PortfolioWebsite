import { NextRequest, NextResponse } from 'next/server'
import { readVersionedJson, writeVersionedJson } from '@/lib/blobStore'
import { importLoaderHtml, type LoaderArt } from '@/lib/loaderImport'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

/**
 * The loader pool: which wordmark animations the site can show.
 *
 * Split across two kinds of blob on purpose. The index is small and read
 * on every page load; each loader's artwork is ~400KB and only the one
 * being shown is ever fetched. Keeping them in one document would mean
 * pulling every loader to decide which single one to play.
 *
 * Versioned writes, like the rest of the site's state — an overwritten
 * blob keeps its URL and can serve a stale body from CDN cache for a
 * long while, which for "which loader is live" would look like the admin
 * panel silently not saving.
 *
 * Auth: none beyond the site passcode, matching the other admin routes
 * (/api/projects, /api/pages). Worth revisiting for all of them together
 * rather than making this one the odd one out.
 */

const INDEX_KEY = 'state/loaders.json'
const artKey = (id: string) => `state/loader-art/${id}.json`

export type LoaderMeta = {
  id: string
  name: string
  enabled: boolean
  duration: number
  bytes: number
  createdAt: string
}

export type LoaderIndex = {
  /** Pick at random from the enabled loaders on each page load. */
  randomise: boolean
  /** Used when randomise is off. Falls back to the first enabled one. */
  pinnedId: string | null
  items: LoaderMeta[]
}

const EMPTY: LoaderIndex = { randomise: true, pinnedId: null, items: [] }

const readIndex = () => readVersionedJson<LoaderIndex>(INDEX_KEY, EMPTY)

function newId() {
  return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/**
 * GET            → the index
 * GET ?id=<id>   → one loader's artwork
 * GET ?pick=1    → the index plus the artwork of whichever loader should
 *                  play now, so a client needs one round trip rather than
 *                  two before it can show anything
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  const pick = request.nextUrl.searchParams.get('pick')

  if (id) {
    const art = await readVersionedJson<LoaderArt | null>(artKey(id), null)
    if (!art) return NextResponse.json({ error: 'Not found' }, { status: 404, ...NO_CACHE })
    return NextResponse.json(art, NO_CACHE)
  }

  const index = await readIndex()
  if (!pick) return NextResponse.json(index, NO_CACHE)

  const live = index.items.filter(i => i.enabled)
  if (!live.length) return NextResponse.json({ index, chosen: null, art: null }, NO_CACHE)

  const chosen = index.randomise
    ? live[Math.floor(Math.random() * live.length)]
    : live.find(i => i.id === index.pinnedId) || live[0]

  const art = await readVersionedJson<LoaderArt | null>(artKey(chosen.id), null)
  return NextResponse.json({ index, chosen, art }, NO_CACHE)
}

/** POST { name, html } — html is a loader exported from the tuner. */
export async function POST(request: Request) {
  let body: { name?: string; html?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, ...NO_CACHE })
  }

  const name = (body.name || '').trim()
  const html = body.html || ''
  if (!name) return NextResponse.json({ error: 'Give it a name' }, { status: 400, ...NO_CACHE })

  let art: LoaderArt
  try {
    art = importLoaderHtml(html)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not read that file' },
      { status: 400, ...NO_CACHE },
    )
  }

  const id = newId()
  await writeVersionedJson(artKey(id), art)

  const index = await readIndex()
  index.items.push({
    id,
    name,
    enabled: true,
    duration: art.duration,
    bytes: art.css.length + art.svg.length,
    createdAt: new Date().toISOString(),
  })
  await writeVersionedJson(INDEX_KEY, index)

  return NextResponse.json({ ok: true, id, duration: art.duration }, NO_CACHE)
}

/** PATCH { randomise?, pinnedId?, items?: [{id, name?, enabled?}] } */
export async function PATCH(request: Request) {
  let body: Partial<LoaderIndex> & { items?: Array<Partial<LoaderMeta> & { id: string }> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, ...NO_CACHE })
  }

  const index = await readIndex()
  if (typeof body.randomise === 'boolean') index.randomise = body.randomise
  if ('pinnedId' in body) index.pinnedId = body.pinnedId ?? null

  for (const patch of body.items || []) {
    const item = index.items.find(i => i.id === patch.id)
    if (!item) continue
    if (typeof patch.name === 'string' && patch.name.trim()) item.name = patch.name.trim()
    if (typeof patch.enabled === 'boolean') item.enabled = patch.enabled
  }

  await writeVersionedJson(INDEX_KEY, index)
  return NextResponse.json(index, NO_CACHE)
}

/** DELETE ?id=<id> — drops it from the index. */
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Which one?' }, { status: 400, ...NO_CACHE })

  const index = await readIndex()
  const before = index.items.length
  index.items = index.items.filter(i => i.id !== id)
  if (index.pinnedId === id) index.pinnedId = null
  if (index.items.length === before) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, ...NO_CACHE })
  }

  // The artwork blob is left where it is. Versioned writes prune old
  // versions but there is no delete here, and an orphaned body costs
  // nothing next to the risk of removing one that is still referenced.
  await writeVersionedJson(INDEX_KEY, index)
  return NextResponse.json(index, NO_CACHE)
}
