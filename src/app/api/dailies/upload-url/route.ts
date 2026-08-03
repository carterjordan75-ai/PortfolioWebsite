import { NextResponse } from 'next/server'
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client'
import { checkApiKey, checkSession, isValidDate } from '@/lib/dailies'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Issue a short-lived, path-scoped upload ticket so the client can PUT
 * the file DIRECTLY to Vercel Blob.
 *
 * Why direct-to-Blob rather than posting the file to this API: Vercel
 * caps serverless request bodies at 4.5 MB, and dailies are 10-60 MB.
 * Blob's multipart API can't rescue a proxy design either — its parts
 * must be >= 5 MB, which no request can carry. The client token is
 * scoped to one exact pathname + content type and expires in an hour,
 * so handing it out is safe.
 *
 * Used by BOTH clients:
 *   - the render PC (Bearer API key) for video + contact sheet
 *   - the review page (session cookie) for reference images
 */

const ONE_HOUR = 60 * 60 * 1000

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
}

export async function POST(request: Request) {
  const machine = await checkApiKey(request)
  const human = machine ? false : await checkSession(request)
  if (!machine && !human) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { date?: string; kind?: string; content_type?: string; filename?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const kind = body.kind
  if (kind !== 'video' && kind !== 'contact_sheet' && kind !== 'reference') {
    return NextResponse.json(
      { error: "kind must be 'video', 'contact_sheet' or 'reference'" },
      { status: 400 },
    )
  }
  // Reference images come from the page (session); the PC only sends
  // the daily's own two files.
  if (kind === 'reference' ? machine : human) {
    return NextResponse.json({ error: `kind '${kind}' not allowed for this credential` }, { status: 403 })
  }
  if (!isValidDate(body.date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }
  const date = body.date

  let pathname: string
  let contentType: string
  let addRandomSuffix = false

  if (kind === 'video') {
    contentType = body.content_type || 'video/mp4'
    if (!contentType.startsWith('video/')) {
      return NextResponse.json({ error: 'content_type must be video/*' }, { status: 400 })
    }
    pathname = `media/dailies/${date}/video.mp4`
  } else if (kind === 'contact_sheet') {
    contentType = body.content_type || 'image/png'
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'content_type must be image/*' }, { status: 400 })
    }
    pathname = `media/dailies/${date}/contact.png`
  } else {
    contentType = body.content_type || 'image/jpeg'
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'content_type must be image/*' }, { status: 400 })
    }
    const ext = EXT_BY_TYPE[contentType.toLowerCase().split(';')[0].trim()] || 'jpg'
    const safe = (body.filename || 'ref')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9-]+/g, '-')
      .slice(0, 40) || 'ref'
    // Random suffix keeps reference-image URLs unguessable, so the PC
    // can fetch them without auth but nobody can enumerate them.
    pathname = `media/dailies/refs/${date}/${safe}.${ext}`
    addRandomSuffix = true
  }

  try {
    const token = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN,
      pathname,
      allowedContentTypes: [contentType],
      addRandomSuffix,
      allowOverwrite: !addRandomSuffix,
      validUntil: Date.now() + ONE_HOUR,
    })

    return NextResponse.json({
      // Everything needed for a plain HTTP PUT — no SDK required.
      put_url: `https://blob.vercel-storage.com/?pathname=${encodeURIComponent(pathname)}`,
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'x-api-version': '12',
        'x-content-type': contentType,
        'x-vercel-blob-access': 'public',
      },
      pathname,
      expires_in_seconds: ONE_HOUR / 1000,
      // The PUT responds with JSON containing the final public `url` —
      // read it from there (it's the only source of truth when a random
      // suffix is applied) and pass it back to POST /api/dailies.
      read_public_url_from: 'PUT response body .url',
    })
  } catch (err) {
    console.error('upload-url error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
