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
 * Pulls the public RSS feed of the user's Pinterest board and normalises
 * it into gallery items for /look. Pinterest's RSS only surfaces the
 * ~25 most recent pins of a PUBLIC board — good enough for a living
 * moodboard. Results are cached in Blob (state/pinterest-feed.json) and
 * refreshed at most once per TTL window, so page loads are instant and
 * Pinterest sees at most a handful of requests per day. If a refresh
 * fails (Pinterest down, rate limit, ...), the stale cache is served.
 *
 * The board is intentionally a constant — one personal board feeds the
 * moodboard. Swap the URL (or lift it into admin state) to change it.
 */
const BOARD_RSS = 'https://au.pinterest.com/carterjordan75/widget.rss'
const BLOB_KEY = 'state/pinterest-feed.json'
const TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

type PinItem = {
  src: string      // image URL (736x upgrade of the RSS thumbnail)
  link: string     // pin page URL — used as "Visit Source" in the lightbox
  pubDate: string
}
type FeedCache = {
  fetchedAt: number
  boardTitle: string
  items: PinItem[]
}

const EMPTY: FeedCache = { fetchedAt: 0, boardTitle: '', items: [] }

async function fetchBoardFeed(): Promise<FeedCache | null> {
  try {
    const res = await fetch(BOARD_RSS, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; xoxo-studio-look/1.0)' },
    })
    if (!res.ok) return null
    const xml = await res.text()

    const boardTitle = (xml.match(/<title>([^<]*)<\/title>/)?.[1] || '').trim()

    // The feed is machine-generated and flat — regex parsing is fine.
    // Each <item> carries the pin link and a description whose escaped
    // HTML contains the thumbnail <img src="...">.
    const items: PinItem[] = []
    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || []
    for (const block of itemBlocks) {
      const link = block.match(/<link>([^<]+)<\/link>/)?.[1]?.trim()
      const pubDate = block.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1]?.trim() || ''
      // img src sits inside the HTML-escaped description
      const imgMatch = block.match(/img src=(?:&quot;|")(https:\/\/i\.pinimg\.com[^"&]+)/)
      const thumb = imgMatch?.[1]
      // VIDEO PINS: Pinterest's RSS emits them with an EMPTY img src (and
      // no video URL), the public pin page is a login-gated JS shell, and
      // oEmbed redirects — there is no server-accessible media for them,
      // so they're skipped. Playable video on /look = upload the file via
      // the Look admin panel instead.
      if (!link || !thumb) continue
      // RSS thumbnails are 236px wide; the CDN serves the same file at
      // higher widths by swapping the size segment. 736x is reliably
      // available for every pin (originals sometimes 404).
      const src = thumb.replace('/236x/', '/736x/')
      items.push({ src, link, pubDate })
    }
    if (items.length === 0) return null
    return { fetchedAt: Date.now(), boardTitle, items }
  } catch {
    return null
  }
}

export async function GET() {
  const cached = await readJsonBlob<FeedCache>(BLOB_KEY, EMPTY)
  const fresh = cached.items.length > 0 && Date.now() - cached.fetchedAt < TTL_MS
  if (fresh) {
    return NextResponse.json(cached, NO_CACHE)
  }
  const feed = await fetchBoardFeed()
  if (feed) {
    await writeJsonBlob(BLOB_KEY, feed)
    return NextResponse.json(feed, NO_CACHE)
  }
  // Refresh failed — serve whatever we have rather than nothing.
  return NextResponse.json(cached, NO_CACHE)
}

export async function POST(request: Request) {
  // { action: 'sync' } forces a refresh regardless of TTL — for a future
  // "Sync now" button in the Look admin panel.
  try {
    const body = await request.json().catch(() => ({}))
    if (body?.action !== 'sync') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    const feed = await fetchBoardFeed()
    if (!feed) {
      return NextResponse.json({ error: 'Pinterest fetch failed' }, { status: 502 })
    }
    await writeJsonBlob(BLOB_KEY, feed)
    return NextResponse.json({ success: true, ...feed }, NO_CACHE)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
