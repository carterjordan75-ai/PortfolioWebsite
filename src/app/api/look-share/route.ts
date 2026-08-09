import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { putMediaBlob, readVersionedJson, writeVersionedJson } from '@/lib/blobStore'

export const dynamic = 'force-dynamic'
export const revalidate = 0
// HLS stitching downloads a playlist + every segment — allow up to a
// minute rather than the default function budget.
export const maxDuration = 60

/**
 * "Send to Look" — push media onto the /look moodboard from anywhere,
 * primarily the iOS share sheet via a Shortcut. Two modes:
 *
 *   1. IMAGE mode (multipart/form-data): fields
 *        token  — must equal SITE_PASSCODE
 *        file   — the image itself (share a saved photo / screenshot)
 *        credit — optional credit line  (defaults "Instagram")
 *        link   — optional source URL for the lightbox's Visit Source
 *      100% reliable for Instagram, where pages are login-walled.
 *
 *   2. URL mode (application/json): { token, url, credit? }
 *      Fetches the page, extracts its og:image, downloads that.
 *      Works for most of the open web (Behance, Are.na, articles…);
 *      Instagram links frequently fail here — use image mode for IG.
 *
 * Saves into the SAME storage the Look admin uses (media/look/ file +
 * meta/look/ metadata + prepended to the order list), so shared items
 * appear on /look immediately alongside admin uploads, with credits
 * and source links intact.
 *
 * Auth is the shared passcode, NOT the gate cookie — the middleware
 * exempts this route so the phone Shortcut can reach it. Every request
 * is checked against SITE_PASSCODE before anything is written.
 */

const META_PREFIX = 'meta/look/'
const ORDER_KEY = 'state/look-order.json'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

function extFor(mime: string | null, fallbackName?: string): string {
  if (mime && EXT_BY_MIME[mime.toLowerCase().split(';')[0].trim()]) {
    return EXT_BY_MIME[mime.toLowerCase().split(';')[0].trim()]
  }
  const fromName = fallbackName?.match(/\.([a-z0-9]{2,5})(?:$|\?)/i)?.[1]?.toLowerCase()
  return fromName || 'jpg'
}

// Cross-origin access: the Pinterest video bookmarklet runs on
// pinterest.com and POSTs here, so the response must carry CORS
// headers for the browser to let the bookmarklet read the result.
// (The request itself is sent as text/plain — a "simple request" —
// so no preflight is needed; OPTIONS is handled anyway for safety.)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

/**
 * Stitch a Pinterest CMAF/HLS stream into a single playable fMP4 file.
 *
 * Modern video pins have NO progressive mp4 — only an HLS master
 * playlist whose variants reference fragmented-MP4 video segments
 * (.cmfv) plus a SEPARATE audio rendition (.cmfa). Fragmented MP4 is
 * concatenation-friendly: init segment + media segments in order = a
 * valid file browsers play natively. Audio would need real muxing
 * (ffmpeg-grade), so imports are VIDEO-ONLY — fine for the moodboard,
 * where the grid autoplays muted anyway.
 */
async function stitchHls(playlistUrl: string): Promise<{ bytes: ArrayBuffer } | { error: string }> {
  const MAX_SEGMENTS = 300
  const MAX_BYTES = 80 * 1024 * 1024

  const getText = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' })
      return res.ok ? await res.text() : null
    } catch { return null }
  }

  const master = await getText(playlistUrl)
  if (!master || !master.includes('#EXTM3U')) return { error: 'Playlist fetch failed' }

  // Master playlist → pick the highest-bandwidth video variant.
  let mediaUrl = playlistUrl
  let media = master
  if (master.includes('#EXT-X-STREAM-INF')) {
    const lines = master.split('\n')
    let best: { bw: number; uri: string } | null = null
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue
      const bw = Number(lines[i].match(/BANDWIDTH=(\d+)/)?.[1] || 0)
      const uri = lines.slice(i + 1).find(l => l.trim() && !l.startsWith('#'))?.trim()
      if (uri && (!best || bw > best.bw)) best = { bw, uri }
    }
    if (!best) return { error: 'No variants in master playlist' }
    mediaUrl = new URL(best.uri, playlistUrl).toString()
    const variant = await getText(mediaUrl)
    if (!variant || !variant.includes('#EXTM3U')) return { error: 'Variant playlist fetch failed' }
    media = variant
  }

  // Media playlist → init segment + media segments, in order.
  const initUri = media.match(/#EXT-X-MAP:URI="([^"]+)"/)?.[1]
  const segUris = media.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  if (segUris.length === 0) return { error: 'No segments in playlist' }
  if (segUris.length > MAX_SEGMENTS) return { error: `Too many segments (${segUris.length})` }

  const urls = [
    ...(initUri ? [new URL(initUri, mediaUrl).toString()] : []),
    ...segUris.map(u => new URL(u, mediaUrl).toString()),
  ]
  const chunks: Buffer[] = []
  let total = 0
  for (const url of urls) {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' })
    if (!res.ok) return { error: `Segment fetch failed (${res.status})` }
    const buf = Buffer.from(await res.arrayBuffer())
    total += buf.byteLength
    if (total > MAX_BYTES) return { error: 'Video too large' }
    chunks.push(buf)
  }
  const joined = Buffer.concat(chunks)
  const out = new ArrayBuffer(joined.byteLength)
  new Uint8Array(out).set(joined)
  return { bytes: out }
}

async function registerLookItem(params: {
  bytes: ArrayBuffer
  contentType: string
  ext: string
  credit: string
  link: string
}): Promise<{ fileName: string; path: string }> {
  const fileName = `share-${Date.now().toString(36)}.${params.ext}`
  const { url } = await putMediaBlob(`media/look/${fileName}`, params.bytes, params.contentType)
  const metadata = {
    fileName,
    path: url,
    url,
    credits: params.credit,
    link: params.link,
    uploadedAt: new Date().toISOString(),
  }
  await put(`${META_PREFIX}${fileName}.json`, JSON.stringify(metadata, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  })
  const existing = (await readVersionedJson<string[] | null>(ORDER_KEY, null)) || []
  await writeVersionedJson(ORDER_KEY, [fileName, ...existing.filter(f => f !== fileName)])
  return { fileName, path: url }
}

export async function POST(request: NextRequest) {
  try {
    const expected = process.env.SITE_PASSCODE || 'changeme'
    const contentType = request.headers.get('content-type') || ''

    // ── IMAGE mode (multipart upload from the phone Shortcut) ─────
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      if (String(form.get('token') || '') !== expected) {
        return NextResponse.json({ error: 'Bad token' }, { status: 401, headers: CORS })
      }
      const file = form.get('file')
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: 'No file' }, { status: 400, headers: CORS })
      }
      const bytes = await file.arrayBuffer()
      const mime = file.type || 'image/jpeg'
      const item = await registerLookItem({
        bytes,
        contentType: mime,
        ext: extFor(mime, file.name),
        credit: String(form.get('credit') || 'Instagram'),
        link: String(form.get('link') || ''),
      })
      return NextResponse.json({ success: true, ...item }, { headers: CORS })
    }

    // JSON body — arrives as application/json (Shortcuts) or text/plain
    // (the bookmarklet uses text/plain to stay a CORS "simple request").
    const raw = await request.text()
    let body: { token?: string; url?: string; mediaUrl?: string; hlsUrl?: string; credit?: string; link?: string } | null = null
    try { body = JSON.parse(raw) } catch { body = null }
    if (!body || String(body.token || '') !== expected) {
      return NextResponse.json({ error: 'Bad token' }, { status: 401, headers: CORS })
    }

    // ── HLS STITCH mode (modern Pinterest video pins) ─────────────
    // hlsUrl points at an m3u8 playlist on Pinterest's video CDN. The
    // bookmarklet finds it in the pin page; we assemble the stream's
    // fMP4 segments into one playable (video-only) file.
    if (typeof body.hlsUrl === 'string' && body.hlsUrl) {
      const hlsUrl = body.hlsUrl
      if (!/^https:\/\/v\d*\.pinimg\.com\/.+\.m3u8/i.test(hlsUrl)) {
        return NextResponse.json({ error: 'Not a Pinterest HLS playlist URL' }, { status: 400, headers: CORS })
      }
      const result = await stitchHls(hlsUrl)
      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: 502, headers: CORS })
      }
      const item = await registerLookItem({
        bytes: result.bytes,
        contentType: 'video/mp4',
        ext: 'mp4',
        credit: body.credit || 'Pinterest',
        link: body.link || hlsUrl,
      })
      return NextResponse.json({ success: true, audio: false, ...item }, { headers: CORS })
    }

    // ── DIRECT MEDIA mode (Pinterest video bookmarklet) ───────────
    // mediaUrl points straight at a media FILE (mp4 / image). Download
    // and store it as-is — this is how Pinterest-hosted video gets onto
    // /look: the bookmarklet lifts the CDN URL from the logged-in pin
    // page and hands it here.
    if (body.mediaUrl && /^https?:\/\//i.test(body.mediaUrl)) {
      const mediaRes = await fetch(body.mediaUrl, { headers: { 'User-Agent': UA }, cache: 'no-store' })
      if (!mediaRes.ok) {
        return NextResponse.json({ error: `Media fetch failed (${mediaRes.status})` }, { status: 502, headers: CORS })
      }
      const mime = (mediaRes.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim()
      if (!/^(video|image)\//.test(mime)) {
        return NextResponse.json({ error: `Not a media file (${mime})` }, { status: 422, headers: CORS })
      }
      const bytes = await mediaRes.arrayBuffer()
      if (bytes.byteLength === 0) {
        return NextResponse.json({ error: 'Empty media file' }, { status: 502, headers: CORS })
      }
      const item = await registerLookItem({
        bytes,
        contentType: mime,
        ext: extFor(mime, body.mediaUrl),
        credit: body.credit || 'Pinterest',
        link: body.link || body.mediaUrl,
      })
      return NextResponse.json({ success: true, ...item }, { headers: CORS })
    }

    // ── URL mode (og:image scrape) ────────────────────────────────
    if (!body.url || !/^https?:\/\//i.test(body.url)) {
      return NextResponse.json({ error: 'No url' }, { status: 400, headers: CORS })
    }
    const pageRes = await fetch(body.url, { headers: { 'User-Agent': UA }, cache: 'no-store' })
    if (!pageRes.ok) {
      return NextResponse.json({ error: `Page fetch failed (${pageRes.status})` }, { status: 502, headers: CORS })
    }
    const html = await pageRes.text()
    const ogImage =
      html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/)?.[1] ||
      html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/)?.[1]
    if (!ogImage) {
      return NextResponse.json(
        { error: 'No og:image on that page (Instagram links usually fail — share the image itself instead)' },
        { status: 422, headers: CORS },
      )
    }
    const imgRes = await fetch(ogImage, { headers: { 'User-Agent': UA }, cache: 'no-store' })
    if (!imgRes.ok) {
      return NextResponse.json({ error: `Image fetch failed (${imgRes.status})` }, { status: 502, headers: CORS })
    }
    const mime = imgRes.headers.get('content-type') || 'image/jpeg'
    const bytes = await imgRes.arrayBuffer()
    const item = await registerLookItem({
      bytes,
      contentType: mime.split(';')[0].trim(),
      ext: extFor(mime, ogImage),
      credit: body.credit || new URL(body.url).hostname.replace(/^www\./, ''),
      link: body.url,
    })
    return NextResponse.json({ success: true, ...item }, { headers: CORS })
  } catch (err) {
    console.error('look-share error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500, headers: CORS })
  }
}
