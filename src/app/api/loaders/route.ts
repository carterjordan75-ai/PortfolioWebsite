import { NextRequest, NextResponse } from 'next/server'
import { readVersionedJson, writeVersionedJson } from '@/lib/blobStore'
import { importLoaderHtml, upgradeShading, type LoaderArt } from '@/lib/loaderImport'

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

/**
 * How a mark is PAINTED, not when it is allowed to appear.
 *
 * 'both' follows the viewer's theme, which is what a mono mark wants —
 * it takes its ink from whatever it is placed on. 'light' and 'dark'
 * pin it: a mark built to sit on black is shown on black whatever theme
 * the site is in, rather than being hidden from half the audience.
 *
 * This started life as a filter — light-only meant "only picked in light
 * mode" — which was the wrong reading. It made a perfectly good mark
 * invisible to anyone browsing in the other theme, and if every mark in
 * the pool was pinned the same way, the loader simply did not appear.
 */
export type LoaderModes = 'both' | 'light' | 'dark'

/**
 * What a mark is for.
 *
 * 'loader' covers a wait: it plays once and holds its final frame, and
 * the page appears when it finishes. 'sleep' is the opposite — it has no
 * end to wait for, it loops until the viewer moves the mouse, and it is
 * shown over the page rather than instead of it. Same artwork format and
 * same pool machinery either way, so they live in one index and differ
 * only here.
 */
export type LoaderKind = 'loader' | 'sleep'

/**
 * Where the mark sits on the screen, and how big it is.
 *
 * Both surfaces used to centre everything at a width written into the
 * component — 34vw for a loader, 46vw for a screensaver — which is a
 * reasonable default and a poor rule: a mark with arms reaching in from
 * the left wants to sit right of centre, and a wide arrangement wants
 * more room than a stacked one.
 *
 * x and y are the position of the mark's CENTRE as a percentage of the
 * viewport, so 50/50 is what every existing loader already does and an
 * absent placement needs no migration. `size` is in vw, capped at ten
 * times itself in px — the same relationship the two hard-coded widths
 * had, so 34 and 46 reproduce them exactly.
 */
export type LoaderPlacement = { x: number; y: number; size: number }

const clampPlace = (p: unknown): LoaderPlacement | undefined => {
  if (!p || typeof p !== 'object') return undefined
  const q = p as Record<string, unknown>
  const n = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d
  return { x: n(q.x, 0, 100, 50), y: n(q.y, 0, 100, 50), size: n(q.size, 4, 100, 34) }
}

export type LoaderMeta = {
  id: string
  name: string
  enabled: boolean
  /** Absent on loaders added before this existed — treated as 'both'. */
  modes?: LoaderModes
  /** Absent on everything added before sleep mode — treated as 'loader'. */
  kind?: LoaderKind
  /** Absent means centred at the surface's own default width. */
  placement?: LoaderPlacement
  duration: number
  bytes: number
  createdAt: string
}

export type LoaderIndex = {
  /** Pick at random from the enabled loaders on each page load. */
  randomise: boolean
  /** Used when randomise is off. Falls back to the first enabled one. */
  pinnedId: string | null
  /**
   * The same, for sleep marks. Separate because the two pools are chosen
   * from independently — pinning a loader should not also decide which
   * screensaver runs.
   */
  pinnedSleepId?: string | null
  items: LoaderMeta[]
}

const EMPTY: LoaderIndex = { randomise: true, pinnedId: null, pinnedSleepId: null, items: [] }

const readIndex = () => readVersionedJson<LoaderIndex>(INDEX_KEY, EMPTY)

/**
 * Read one loader's artwork, repairing the shading on the way out.
 *
 * Every loader saved before the dither fix has the broken filter baked
 * into its SVG, and the alternative was asking for each one to be opened
 * in the tuner and exported again. Doing it here means they are all
 * correct from the next page load, with nothing to migrate and no button
 * to remember to press.
 *
 * On read rather than as a one-off rewrite because a write pass over
 * live artwork can half-finish, and this cannot: it is a pure function of
 * the stored bytes, it is idempotent, and if it were ever wrong the fix
 * would be to change it rather than to restore from a backup. New
 * uploads are already repaired at import, so for those this finds
 * nothing to do.
 */
async function readArt(id: string): Promise<LoaderArt | null> {
  const art = await readVersionedJson<LoaderArt | null>(artKey(id), null)
  if (!art) return art
  // One representation over the wire, not three. When the file itself is
  // stored the css/svg rewrite is what the site no longer renders, and
  // sending it anyway doubled the payload — enough that the client's
  // localStorage cache blew its quota and silently kept nothing, so the
  // loader stopped appearing at all. Found by the cache being empty.
  if (art.html) return { ...art, css: '', svg: '' }
  if (!art.svg) return art
  return { ...art, svg: upgradeShading(art.svg) }
}

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
    const art = await readArt(id)
    if (!art) return NextResponse.json({ error: 'Not found' }, { status: 404, ...NO_CACHE })
    return NextResponse.json(art, NO_CACHE)
  }

  const index = await readIndex()
  if (!pick) return NextResponse.json(index, NO_CACHE)

  // Sleep marks and loading marks are different pools and must not leak
  // into each other: a loader shown as a screensaver would stop after one
  // play, and a sleep mark used as a loader would never finish and the
  // page would never appear. An absent kind means 'loader', both on the
  // request and on the stored item.
  const wantKind: LoaderKind = request.nextUrl.searchParams.get('kind') === 'sleep'
    ? 'sleep' : 'loader'
  // Kind is the only filter. Modes used to filter here too, which meant a
  // mark pinned to light was withheld from anyone in dark mode — and a
  // pool where everything was pinned returned nothing at all. It is a
  // painting instruction now and travels with the artwork instead.
  const live = index.items.filter(i =>
    i.enabled && (i.kind || 'loader') === wantKind)
  if (!live.length) return NextResponse.json({ index, chosen: null, art: null }, NO_CACHE)

  const pinned = wantKind === 'sleep' ? index.pinnedSleepId : index.pinnedId
  const chosen = index.randomise
    ? live[Math.floor(Math.random() * live.length)]
    : live.find(i => i.id === pinned) || live[0]

  const art = await readArt(chosen.id)
  // The renderer needs to know how to paint it and where to put it, and
  // only the index knows either — both are presentation choices the admin
  // panel can change without touching the artwork.
  return NextResponse.json(
    { index, chosen,
      art: art ? { ...art, modes: chosen.modes || 'both', placement: chosen.placement } : art },
    NO_CACHE,
  )
}

/** POST { name, html } — html is a loader exported from the tuner. */
export async function POST(request: Request) {
  let body: { name?: string; html?: string; kind?: LoaderKind }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, ...NO_CACHE })
  }

  const name = (body.name || '').trim()
  const html = body.html || ''
  const kind: LoaderKind = body.kind === 'sleep' ? 'sleep' : 'loader'
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
    kind,
    duration: art.duration,
    bytes: (art.html || '').length || art.css.length + art.svg.length,
    createdAt: new Date().toISOString(),
  })
  await writeVersionedJson(INDEX_KEY, index)

  return NextResponse.json({ ok: true, id, duration: art.duration }, NO_CACHE)
}

/** PATCH { randomise?, pinnedId?, items?: [{id, name?, enabled?, modes?, kind?, placement?}] } */
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
  if ('pinnedSleepId' in body) index.pinnedSleepId = body.pinnedSleepId ?? null

  for (const patch of body.items || []) {
    const item = index.items.find(i => i.id === patch.id)
    if (!item) continue
    if (typeof patch.name === 'string' && patch.name.trim()) item.name = patch.name.trim()
    if (typeof patch.enabled === 'boolean') item.enabled = patch.enabled
    if (patch.modes === 'both' || patch.modes === 'light' || patch.modes === 'dark')
      item.modes = patch.modes
    if (patch.kind === 'loader' || patch.kind === 'sleep') item.kind = patch.kind
    if ('placement' in patch) {
      const pl = clampPlace(patch.placement)
      if (pl) item.placement = pl; else delete item.placement
    }
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
  if (index.pinnedSleepId === id) index.pinnedSleepId = null
  if (index.items.length === before) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, ...NO_CACHE })
  }

  // The artwork blob is left where it is. Versioned writes prune old
  // versions but there is no delete here, and an orphaned body costs
  // nothing next to the risk of removing one that is still referenced.
  await writeVersionedJson(INDEX_KEY, index)
  return NextResponse.json(index, NO_CACHE)
}
