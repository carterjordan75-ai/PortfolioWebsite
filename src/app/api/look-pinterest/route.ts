import { NextResponse } from 'next/server'
import { list as listBlobsRaw } from '@vercel/blob'
import { readVersionedJson, writeVersionedJson, putMediaBlob } from '@/lib/blobStore'

// Live feed — never serve from the edge cache; freshness is handled by
// our own blob-backed TTL below.
export const dynamic = 'force-dynamic'
export const revalidate = 0
// Video import downloads MP4s into Blob — allow more than the default.
export const maxDuration = 60
const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

/**
 * Pinterest board → Look page feed.
 *
 * Pinterest's anonymous surfaces (board RSS + the pidgets widget API)
 * only expose the ~25 most recent pins of a PUBLIC board. To serve the
 * WHOLE board anyway, the cache is CUMULATIVE: every sync unions the
 * current feed (RSS ∪ pidgets, deduped by pin id) into the stored set,
 * so any pin that was ever visible in the feed window stays on /look
 * permanently — with 6-hourly auto-refreshes, pins are captured as
 * they pass through the window. Items no longer in the live feed keep
 * their `lastSeenAt` so a future prune could drop board-removed pins.
 *
 * VIDEO PINS: no anonymous surface exposes them at all (RSS emits an
 * empty img, pidgets omits them, the pin page + oEmbed are login-gated).
 * Surfacing even their cover images needs the official OAuth API.
 * Playable video on /look = upload the file via the Look admin panel.
 *
 * The board is intentionally a constant — one personal board feeds the
 * moodboard. Swap the IDs (or lift into admin state) to change it.
 */
const BOARD_RSS = 'https://au.pinterest.com/carterjordan75/widget.rss'
const PIDGETS_URL = 'https://widgets.pinterest.com/v3/pidgets/boards/carterjordan75/widget/pins/'
// The USER feed exposes the 50 newest pins — a much bigger window than
// the board feed (which lags badly: it was serving 8 stale pins while
// the user feed had 50 fresh ones). Filtered to the WIDGET board.
const USER_PIDGETS_URL = 'https://widgets.pinterest.com/v3/pidgets/users/carterjordan75/pins/'
const BOARD_NAME = 'WIDGET'
const BLOB_KEY = 'state/pinterest-feed.json'
const TTL_MS = 6 * 60 * 60 * 1000 // 6 hours
const UA = 'Mozilla/5.0 (compatible; xoxo-studio-look/1.0)'

type PinItem = {
  id: string        // numeric pin id — dedupe key
  src: string       // image URL, animated GIF original, or imported MP4
  link: string      // pin page URL — "Visit Source" in the lightbox
  pubDate: string
  lastSeenAt?: number
  animated?: boolean     // src is an animated GIF original
  gifChecked?: boolean   // originals-.gif probe done — don't re-probe
  type?: 'image' | 'video'
  videoChecked?: boolean // pins/info video lookup done (legacy flag)
  videoCheckV?: number   // extractor version that did the lookup
  poster?: string        // still frame for the imported video
}
type FeedCache = {
  fetchedAt: number
  boardTitle: string
  items: PinItem[]
  // Pin ids the user has hidden from /look (promoted junk that slipped
  // into a feed window, video-pin stills, anything unwanted). Hidden
  // pins stay in the cache so they never resurface via re-capture —
  // GET just filters them out of the response.
  hidden?: string[]
  // Reported by a refresh so the admin can show import progress.
  videoImported?: number
  videoRemaining?: number
}

const EMPTY: FeedCache = { fetchedAt: 0, boardTitle: '', items: [] }

const pinIdFromLink = (link: string): string =>
  link.match(/\/pin\/([^/]+)/)?.[1] || link

/** RSS: latest ~25 pins with thumbnail images. */
async function fetchRss(): Promise<{ boardTitle: string; items: PinItem[] } | null> {
  try {
    const res = await fetch(BOARD_RSS, { cache: 'no-store', headers: { 'User-Agent': UA } })
    if (!res.ok) return null
    const xml = await res.text()
    const boardTitle = (xml.match(/<title>([^<]*)<\/title>/)?.[1] || '').trim()
    const items: PinItem[] = []
    for (const block of xml.match(/<item>[\s\S]*?<\/item>/g) || []) {
      const link = block.match(/<link>([^<]+)<\/link>/)?.[1]?.trim()
      const pubDate = block.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1]?.trim() || ''
      const thumb = block.match(/img src=(?:&quot;|")(https:\/\/i\.pinimg\.com[^"&]+)/)?.[1]
      if (!link || !thumb) continue // video pins arrive with an empty img — skip
      items.push({
        id: pinIdFromLink(link),
        src: thumb.replace('/236x/', '/736x/'),
        link,
        pubDate,
      })
    }
    return items.length > 0 ? { boardTitle, items } : null
  } catch {
    return null
  }
}

/** Pidgets board feed: same window as RSS but a second net. */
async function fetchPidgets(): Promise<{ boardTitle: string; items: PinItem[] } | null> {
  try {
    const res = await fetch(PIDGETS_URL, { cache: 'no-store', headers: { 'User-Agent': UA } })
    if (!res.ok) return null
    const json = await res.json() as {
      data?: {
        board?: { name?: string }
        pins?: Array<{ id?: string; images?: Record<string, { url?: string }> }>
      }
    }
    const boardTitle = json.data?.board?.name || ''
    const items: PinItem[] = []
    for (const pin of json.data?.pins || []) {
      if (!pin.id) continue
      const anySize = pin.images && Object.values(pin.images)[0]?.url
      if (!anySize) continue
      items.push({
        id: pin.id,
        src: anySize.replace(/\/\d+x\//, '/736x/'),
        link: `https://au.pinterest.com/pin/${pin.id}/`,
        pubDate: '',
      })
    }
    return items.length > 0 ? { boardTitle, items } : null
  } catch {
    return null
  }
}

/** User pidgets feed: the 50 newest pins across the account, filtered to
 *  the WIDGET board — the widest anonymous window Pinterest offers. */
async function fetchUserPidgets(): Promise<{ boardTitle: string; items: PinItem[] } | null> {
  try {
    const res = await fetch(USER_PIDGETS_URL, { cache: 'no-store', headers: { 'User-Agent': UA } })
    if (!res.ok) return null
    const json = await res.json() as {
      data?: {
        pins?: Array<{
          id?: string
          images?: Record<string, { url?: string }>
          board?: { name?: string; url?: string }
        }>
      }
    }
    const items: PinItem[] = []
    for (const pin of json.data?.pins || []) {
      if (!pin.id) continue
      // Exact board-name match ONLY. The account feed carries pins from
      // every board plus the occasional promoted item — anything not
      // verifiably on WIDGET stays out.
      if (pin.board?.name !== BOARD_NAME) continue
      const anySize = pin.images && Object.values(pin.images)[0]?.url
      if (!anySize) continue
      items.push({
        id: pin.id,
        src: anySize.replace(/\/\d+x\//, '/736x/'),
        link: `https://au.pinterest.com/pin/${pin.id}/`,
        pubDate: '',
      })
    }
    return items.length > 0 ? { boardTitle: BOARD_NAME, items } : null
  } catch {
    return null
  }
}

/** Motion support: Pinterest thumbnails are ALWAYS static jpgs, even for
 *  animated GIF pins — but the untouched original survives at
 *  i.pinimg.com/originals/<hash>.gif. Probe once per pin; on a hit the
 *  item's src becomes the animated original (plays natively in <img>).
 *  Results are remembered via gifChecked so each pin is probed exactly
 *  once across all future syncs. */
async function probeGifOriginals(items: PinItem[]): Promise<void> {
  const unchecked = items.filter(i => !i.gifChecked)
  await Promise.all(unchecked.map(async item => {
    item.gifChecked = true
    const hash = item.src.match(/\/(?:\d+x\d*|originals)\/(.+)\.(?:jpg|jpeg|png|webp)$/i)?.[1]
    if (!hash) return
    try {
      const gifUrl = `https://i.pinimg.com/originals/${hash}.gif`
      const res = await fetch(gifUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        item.src = gifUrl
        item.animated = true
      }
    } catch {
      /* static jpg stays */
    }
  }))
}

/**
 * VIDEO PINS — the real solution.
 *
 * Pinterest's widget pin-info endpoint (the one its own embeds use)
 * returns each pin's `video_list` anonymously, and alongside the HLS
 * stream it carries **V_720P: a complete progressive MP4 with audio**.
 * No login, no player scraping, no segment stitching, no silence.
 *
 * So the sync itself imports video pins: batch-query unchecked pins,
 * download any V_720P (or best available) MP4 into our own Blob
 * storage, and flip the item to `type: 'video'` pointing at the stored
 * file. Self-hosting the file means /look keeps working even if the
 * pin is deleted, and Pinterest isn't hotlinked.
 *
 * Capped per run so a sync can't blow the function's time budget;
 * remaining pins are picked up by the next sync (or a second click of
 * the admin's Sync button). `videoChecked` makes every pin cost at
 * most one lookup, ever.
 */
const PIN_INFO_URL = 'https://widgets.pinterest.com/v3/pidgets/pins/info/'
const INFO_BATCH = 8            // pin ids per info request
const MAX_VIDEO_IMPORTS = 5     // MP4 downloads per sync run
// Bump when the video extractor improves — items carrying an older
// version get re-examined once, so pins previously misfiled as
// "checked, no video" are picked up instead of being stuck forever.
const VIDEO_CHECK_VERSION = 2

type VideoRendition = { url: string; width: number; thumbnail?: string }

/**
 * Deep-collect every MP4 rendition anywhere in a pin payload.
 *
 * Pinterest is inconsistent about the shape: some pins give a FLAT
 * video_list ({ V_720P: {url} }), others nest a whole second
 * video_list inside a key of the same name
 * ({ V_720P: { V_720P: {url}, V_HLSV4: {url} } }), and the same pin
 * can carry several copies (story_pin_data.pages[].blocks[].video_data,
 * .../video, page-level .../video). Rather than guess the shape, walk
 * the entire object and take anything that looks like {url: '*.mp4'}.
 */
function collectMp4s(node: unknown, out: VideoRendition[] = [], depth = 0): VideoRendition[] {
  if (!node || typeof node !== 'object' || depth > 12) return out
  if (Array.isArray(node)) {
    for (const v of node) collectMp4s(v, out, depth + 1)
    return out
  }
  const obj = node as Record<string, unknown>
  if (typeof obj.url === 'string' && /\.mp4(?:$|\?)/i.test(obj.url)) {
    out.push({
      url: obj.url,
      width: typeof obj.width === 'number' ? obj.width : 0,
      thumbnail: typeof obj.thumbnail === 'string' ? obj.thumbnail : undefined,
    })
  }
  for (const value of Object.values(obj)) collectMp4s(value, out, depth + 1)
  return out
}

/** Best (widest) MP4 in a pin payload, deduped by URL. */
function pickMp4(pin: unknown): VideoRendition | null {
  const all = collectMp4s(pin)
  if (all.length === 0) return null
  const seen = new Set<string>()
  const unique = all.filter(r => !seen.has(r.url) && seen.add(r.url))
  return unique.sort((a, b) => b.width - a.width)[0]
}

/** Pins needing a (re)check under the current extractor version. */
const needsVideoCheck = (i: PinItem) =>
  i.type !== 'video' && (i.videoCheckV ?? 0) < VIDEO_CHECK_VERSION

// Where imported video pins live. Not in the storage sweep's list of
// folders it may clear (see storage-cleanup) — it was, in effect, for a
// week in August, and that is what happened to the first 24.
const VIDEO_DIR = 'media/look-pins/'

/**
 * An imported video is only as good as its file. The sweep that clears
 * unreferenced media didn't know this feed existed, and took every
 * imported MP4 while the feed went on pointing at them: 24 black tiles
 * on /look, marked as done, never to be imported again. So before each
 * import pass the folder is listed once, and any video whose file is
 * gone goes back to being a still — its cover as the picture, and
 * unchecked, so the next pass imports it afresh. If the listing itself
 * fails nothing is touched: a bad listing must not look like a missing
 * folder.
 */
async function dropLostVideos(items: PinItem[]): Promise<number> {
  const videos = items.filter(i => i.type === 'video')
  if (videos.length === 0) return 0
  // (the raw list, not the store's listBlobs: that one answers every
  // failure with an empty folder, which is the one answer that must
  // not be believed here)
  const present = new Set<string>()
  try {
    let cursor: string | undefined
    do {
      const page = await listBlobsRaw({ prefix: VIDEO_DIR, cursor, limit: 1000 })
      for (const b of page.blobs) present.add(b.pathname)
      cursor = page.cursor
    } while (cursor)
  } catch {
    return 0
  }
  let lost = 0
  for (const item of videos) {
    let pathname = ''
    try { pathname = new URL(item.src).pathname.replace(/^\//, '') } catch { continue }
    if (!pathname.startsWith(VIDEO_DIR) || present.has(pathname)) continue
    delete item.type
    if (item.poster) item.src = item.poster
    item.videoCheckV = 0
    item.videoChecked = false
    lost++
  }
  return lost
}

async function importVideoPins(items: PinItem[]): Promise<{ imported: number; remaining: number }> {
  const unchecked = items.filter(needsVideoCheck)
  if (unchecked.length === 0) return { imported: 0, remaining: 0 }

  let imported = 0
  let budgetHit = false

  for (let i = 0; i < unchecked.length; i += INFO_BATCH) {
    if (budgetHit) break
    const batch = unchecked.slice(i, i + INFO_BATCH)
    let payload: { data?: unknown[] } | null = null
    try {
      const res = await fetch(`${PIN_INFO_URL}?pin_ids=${batch.map(b => b.id).join(',')}`, {
        cache: 'no-store',
        headers: { 'User-Agent': UA },
      })
      if (res.ok) payload = await res.json()
    } catch { /* leave unchecked; next sync retries */ }
    if (!payload?.data) continue

    const byId = new Map(batch.map(b => [b.id, b]))
    for (const pin of payload.data as Array<Record<string, unknown>>) {
      const item = byId.get(String(pin.id))
      if (!item) continue
      item.videoChecked = true
      item.videoCheckV = VIDEO_CHECK_VERSION   // one lookup per pin per version
      const best = pickMp4(pin)
      if (!best?.url) continue          // ordinary image pin

      if (imported >= MAX_VIDEO_IMPORTS) {
        // Out of budget: un-check so a later run imports it.
        item.videoCheckV = 0
        budgetHit = true
        continue
      }
      try {
        const vres = await fetch(best.url, { cache: 'no-store', headers: { 'User-Agent': UA } })
        if (!vres.ok) continue
        const bytes = await vres.arrayBuffer()
        if (bytes.byteLength === 0) continue
        const { url } = await putMediaBlob(`media/look-pins/${item.id}.mp4`, bytes, 'video/mp4')
        item.src = url
        item.type = 'video'
        if (best.thumbnail) item.poster = best.thumbnail
        imported++
      } catch {
        item.videoCheckV = 0            // transient failure — retry later
      }
    }
  }

  const remaining = items.filter(needsVideoCheck).length
  return { imported, remaining }
}

/** Fetch every anonymous surface and merge into the cumulative cache. */
async function refreshFeed(cached: FeedCache): Promise<FeedCache | null> {
  const [rss, pidgets, userPins] = await Promise.all([
    fetchRss(),
    fetchPidgets(),
    fetchUserPidgets(),
  ])
  if (!rss && !pidgets && !userPins) return null
  const now = Date.now()

  // Union of the live windows. The user feed leads (newest 50, freshest
  // ordering), then RSS (carries pubDates), then the board feed.
  const liveMap = new Map<string, PinItem>()
  for (const item of [
    ...(userPins?.items || []),
    ...(rss?.items || []),
    ...(pidgets?.items || []),
  ]) {
    if (!liveMap.has(item.id)) liveMap.set(item.id, { ...item, lastSeenAt: now })
  }

  // Cumulative merge: live items lead (fresh order), then previously
  // cached pins that have rolled out of the feed window — they keep
  // their original relative order, lastSeenAt, and gif-probe results.
  // Legacy cache entries predate the `id` field, so derive it from the
  // link before comparing or they'd duplicate their live twins forever.
  const merged: PinItem[] = Array.from(liveMap.values())
  const seenIds = new Set(Array.from(liveMap.keys()))
  const byId = new Map(merged.map(i => [i.id, i]))
  for (const old of cached.items) {
    const oldId = old.id || pinIdFromLink(old.link)
    if (seenIds.has(oldId)) {
      // Carry earlier probe results onto the fresh copy so each pin is
      // only ever probed/imported once.
      const live = byId.get(oldId)
      if (live) {
        if (old.gifChecked) {
          live.gifChecked = true
          if (old.animated) { live.animated = true; live.src = old.src }
        }
        if (old.videoChecked) live.videoChecked = true
        if (old.videoCheckV) live.videoCheckV = old.videoCheckV
        if (old.type === 'video') {
          // Already-imported video: keep the self-hosted MP4, never let
          // a feed refresh revert it to the static cover image.
          live.type = 'video'
          live.src = old.src
          if (old.poster) live.poster = old.poster
        }
      }
      continue
    }
    seenIds.add(oldId)
    merged.push({ ...old, id: oldId })
  }

  // Import video pins (self-hosted MP4s) — first giving up on any whose
  // file is no longer there, so they are imported again — then probe
  // the remaining still pins for animated GIF originals.
  await dropLostVideos(merged)
  const video = await importVideoPins(merged)
  await probeGifOriginals(merged.filter(i => i.type !== 'video'))

  return {
    fetchedAt: now,
    boardTitle: rss?.boardTitle || pidgets?.boardTitle || userPins?.boardTitle || cached.boardTitle,
    items: merged,
    hidden: cached.hidden || [],
    videoImported: video.imported,
    videoRemaining: video.remaining,
  }
}

/** The public shape: cached feed minus the hidden pins. */
function visibleFeed(cache: FeedCache): FeedCache {
  const hiddenSet = new Set(cache.hidden || [])
  return { ...cache, items: cache.items.filter(i => !hiddenSet.has(i.id)) }
}

export async function GET() {
  const cached = await readVersionedJson<FeedCache>(BLOB_KEY, EMPTY)
  const fresh = cached.items.length > 0 && Date.now() - cached.fetchedAt < TTL_MS
  if (fresh) {
    return NextResponse.json(visibleFeed(cached), NO_CACHE)
  }
  const feed = await refreshFeed(cached)
  if (feed) {
    await writeVersionedJson(BLOB_KEY, feed)
    return NextResponse.json(visibleFeed(feed), NO_CACHE)
  }
  // Refresh failed — serve whatever we have rather than nothing.
  return NextResponse.json(visibleFeed(cached), NO_CACHE)
}

export async function POST(request: Request) {
  // Actions:
  //   { action: 'sync' }             force refresh regardless of TTL
  //   { action: 'hide',   id: ... }  banish a pin from /look permanently
  //   { action: 'unhide', id: ... }  bring it back
  // Wired to the Look admin panel (Sync button + per-tile ✕).
  try {
    const body = await request.json().catch(() => ({}))

    // set-hidden replaces the ENTIRE hidden list. The admin panel is the
    // authority: it loads the current list via GET, tracks changes
    // locally and sends the complete list on every ✕ — so consecutive
    // hides can't clobber each other even though blob overwrites take
    // up to ~60s to propagate at the origin (a server-side
    // read-modify-write of per-id hide/unhide could read stale state
    // and silently drop an earlier hide).
    if (body?.action === 'set-hidden' && Array.isArray(body.hidden)) {
      const cached = await readVersionedJson<FeedCache>(BLOB_KEY, EMPTY)
      const next = { ...cached, hidden: (body.hidden as unknown[]).map(String) }
      await writeVersionedJson(BLOB_KEY, next)
      return NextResponse.json({ success: true, hiddenCount: next.hidden.length, ...visibleFeed(next) }, NO_CACHE)
    }

    if (body?.action === 'hide' || body?.action === 'unhide') {
      const id = String(body.id || '')
      if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })
      const cached = await readVersionedJson<FeedCache>(BLOB_KEY, EMPTY)
      const hidden = new Set(cached.hidden || [])
      if (body.action === 'hide') hidden.add(id)
      else hidden.delete(id)
      const next = { ...cached, hidden: Array.from(hidden) }
      await writeVersionedJson(BLOB_KEY, next)
      return NextResponse.json({ success: true, hiddenCount: next.hidden.length, ...visibleFeed(next) }, NO_CACHE)
    }

    if (body?.action !== 'sync') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    const cached = await readVersionedJson<FeedCache>(BLOB_KEY, EMPTY)
    const feed = await refreshFeed(cached)
    if (!feed) {
      return NextResponse.json({ error: 'Pinterest fetch failed' }, { status: 502 })
    }
    await writeVersionedJson(BLOB_KEY, feed)
    return NextResponse.json({ success: true, ...visibleFeed(feed) }, NO_CACHE)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
