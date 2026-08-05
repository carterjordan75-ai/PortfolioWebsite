/**
 * Turn a pasted URL into something a machine can actually use.
 *
 * A bare link is no good to the render machine — it can't see. So a link
 * reference is resolved server-side into a title, a preview image, and
 * where possible the individual images behind it. A Pinterest board is
 * the case that pays: one paste becomes forty references.
 *
 * Anything else (Cosmos, a studio site, an article) resolves to its
 * OpenGraph title and cover. The link itself is always kept, so an agent
 * with web access can go and look properly.
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36'

const FETCH_TIMEOUT_MS = 12_000
const MAX_HTML_BYTES = 1_500_000
const MAX_EXPANDED = 60

export type ResolvedLink = {
  url: string
  title: string
  preview_url: string | null
  images: string[]
  source: 'pinterest' | 'page'
}

/**
 * Reject anything that isn't a public http(s) address.
 *
 * The server is about to fetch a URL a browser handed it, so this is the
 * boundary that stops it being pointed at localhost, link-local metadata
 * endpoints, or private ranges.
 */
export function isSafePublicUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false

  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return false
  if (host === '::1' || host === '[::1]') return false

  // Bare IPv4 in a private or loopback range.
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 10 || a === 127 || a === 0) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 169 && b === 254) return false
  }
  return true
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
    })
    if (!res.ok) return null
    const body = await res.text()
    return body.slice(0, MAX_HTML_BYTES)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .trim()

/** Pull one meta value, tolerating attribute order. */
function meta(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m) return decode(m[1])
  }
  return null
}

/**
 * `pinterest.com/<user>/<board>/` → the board's pins.
 *
 * The pidgets widget API is anonymous and needs no key. It returns up to
 * ~45 pins at thumbnail size; swapping the size segment for `originals`
 * gets the full image.
 */
function pinterestBoard(url: string): { user: string; board: string } | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (!/(^|\.)pinterest\.[a-z.]+$/i.test(u.hostname)) return null
  const parts = u.pathname.split('/').filter(Boolean)
  if (parts.length < 2) return null
  // /pin/<id> is a single pin, not a board.
  if (parts[0] === 'pin') return null
  return { user: parts[0], board: parts[1] }
}

async function resolvePinterest(url: string): Promise<ResolvedLink | null> {
  const board = pinterestBoard(url)
  if (!board) return null

  const endpoint =
    `https://widgets.pinterest.com/v3/pidgets/boards/` +
    `${encodeURIComponent(board.user)}/${encodeURIComponent(board.board)}/pins/`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(endpoint, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      data?: { board?: { name?: string }; pins?: Array<Record<string, unknown>> }
    }
    const pins = json.data?.pins || []
    if (pins.length === 0) return null

    // pidgets only offers thumbnails (236x/564x). Pinterest usually also
    // serves an /originals/ copy, but not for every pin — so ask, and
    // keep the largest thumbnail when it isn't there. Checking beats
    // guessing: a constructed URL that 404s is a silently missing
    // reference on the render machine.
    const candidates: Array<{ best: string; fallback: string }> = []
    for (const pin of pins) {
      const imgs = (pin as { images?: Record<string, { url?: string; width?: number }> }).images || {}
      const sized = Object.values(imgs).filter(v => typeof v?.url === 'string')
      if (sized.length === 0) continue
      const largest = sized.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a))
      const fallback = largest.url as string
      candidates.push({ best: fallback.replace(/\/\d+x\d*\//, '/originals/'), fallback })
      if (candidates.length >= MAX_EXPANDED) break
    }

    const images = await Promise.all(
      candidates.map(async ({ best, fallback }) => {
        if (best === fallback) return fallback
        try {
          const head = await fetch(best, { method: 'HEAD', headers: { 'user-agent': UA } })
          return head.ok ? best : fallback
        } catch {
          return fallback
        }
      }),
    )
    if (images.length === 0) return null

    return {
      url,
      title: json.data?.board?.name
        ? `${json.data.board.name} (Pinterest board)`
        : 'Pinterest board',
      preview_url: images[0],
      images,
      source: 'pinterest',
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function resolvePage(url: string): Promise<ResolvedLink> {
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } })()
  const html = await fetchText(url)
  if (!html) return { url, title: host, preview_url: null, images: [], source: 'page' }

  const title =
    meta(html, 'og:title') ||
    meta(html, 'twitter:title') ||
    decode(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '') ||
    host

  let image = meta(html, 'og:image') || meta(html, 'twitter:image') || null
  if (image && !/^https?:\/\//i.test(image)) {
    try { image = new URL(image, url).toString() } catch { image = null }
  }

  return {
    url,
    title: title.slice(0, 200),
    preview_url: image,
    // A single page's cover is a preview, not a set of references — it's
    // deliberately not added as its own downloadable image.
    images: [],
    source: 'page',
  }
}

export async function resolveLink(url: string): Promise<ResolvedLink> {
  const pins = await resolvePinterest(url)
  if (pins) return pins
  return resolvePage(url)
}
