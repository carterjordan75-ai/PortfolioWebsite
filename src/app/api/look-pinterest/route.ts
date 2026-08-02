import { NextResponse } from 'next/server'
import { readJsonBlob, writeJsonBlob } from '@/lib/blobStore'

// Live feed — never serve from the edge cache; freshness is handled by
// our own blob-backed TTL below.
export const dynamic = 'force-dynamic'
export const revalidate = 0
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
const BLOB_KEY = 'state/pinterest-feed.json'
const TTL_MS = 6 * 60 * 60 * 1000 // 6 hours
const UA = 'Mozilla/5.0 (compatible; xoxo-studio-look/1.0)'

type PinItem = {
  id: string        // numeric pin id — dedupe key
  src: string       // image URL (736x rendition)
  link: string      // pin page URL — "Visit Source" in the lightbox
  pubDate: string
  lastSeenAt?: number
}
type FeedCache = {
  fetchedAt: number
  boardTitle: string
  items: PinItem[]
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

/** Pidgets: same window as RSS but a second net — occasionally differs. */
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

/** Fetch both anonymous surfaces and merge into the cumulative cache. */
async function refreshFeed(cached: FeedCache): Promise<FeedCache | null> {
  const [rss, pidgets] = await Promise.all([fetchRss(), fetchPidgets()])
  if (!rss && !pidgets) return null
  const now = Date.now()

  // Union of the two live windows, RSS order first (it carries pubDates).
  const liveMap = new Map<string, PinItem>()
  for (const item of [...(rss?.items || []), ...(pidgets?.items || [])]) {
    if (!liveMap.has(item.id)) liveMap.set(item.id, { ...item, lastSeenAt: now })
  }

  // Cumulative merge: live items lead (fresh order), then previously
  // cached pins that have rolled out of the feed window — they keep
  // their original relative order and their old lastSeenAt. Legacy
  // cache entries predate the `id` field, so derive it from the link
  // before comparing or they'd duplicate their live twins forever.
  const merged: PinItem[] = Array.from(liveMap.values())
  const seenIds = new Set(Array.from(liveMap.keys()))
  for (const old of cached.items) {
    const oldId = old.id || pinIdFromLink(old.link)
    if (seenIds.has(oldId)) continue
    seenIds.add(oldId)
    merged.push({ ...old, id: oldId })
  }

  return {
    fetchedAt: now,
    boardTitle: rss?.boardTitle || pidgets?.boardTitle || cached.boardTitle,
    items: merged,
  }
}

export async function GET() {
  const cached = await readJsonBlob<FeedCache>(BLOB_KEY, EMPTY)
  const fresh = cached.items.length > 0 && Date.now() - cached.fetchedAt < TTL_MS
  if (fresh) {
    return NextResponse.json(cached, NO_CACHE)
  }
  const feed = await refreshFeed(cached)
  if (feed) {
    await writeJsonBlob(BLOB_KEY, feed)
    return NextResponse.json(feed, NO_CACHE)
  }
  // Refresh failed — serve whatever we have rather than nothing.
  return NextResponse.json(cached, NO_CACHE)
}

export async function POST(request: Request) {
  // { action: 'sync' } forces a refresh regardless of TTL — wired to the
  // "Sync Pinterest" button in the Look admin panel.
  try {
    const body = await request.json().catch(() => ({}))
    if (body?.action !== 'sync') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    const cached = await readJsonBlob<FeedCache>(BLOB_KEY, EMPTY)
    const feed = await refreshFeed(cached)
    if (!feed) {
      return NextResponse.json({ error: 'Pinterest fetch failed' }, { status: 502 })
    }
    await writeJsonBlob(BLOB_KEY, feed)
    return NextResponse.json({ success: true, ...feed }, NO_CACHE)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
