import { NextResponse } from 'next/server'
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client'
import { checkApiKey, checkSession, isValidId } from '@/lib/dailies'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Issue a short-lived, path-scoped upload ticket so the client can PUT
 * the file DIRECTLY to Vercel Blob.
 *
 * Why direct-to-Blob rather than posting the file to this API: Vercel
 * caps serverless request bodies at 4.5 MB, and a render is 10-60 MB.
 * Blob's multipart API can't rescue a proxy design either — its parts
 * must be >= 5 MB, which no request can carry. The client token is
 * scoped to one exact pathname + content type and expires in an hour,
 * so handing it out is safe.
 *
 * Which credential may upload what:
 *   video, contact_sheet   machine only — the page can't fake a render
 *   reference              session only — material FOR the PC to build
 *                          from, so the PC has no business writing it
 *   hero                   either — whoever has a good frame for it
 */

const ONE_HOUR = 60 * 60 * 1000

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  // References can be motion too — a clip is often the clearest way to
  // say "like this".
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
}

type Kind = 'video' | 'contact_sheet' | 'reference' | 'hero'
const KINDS: Kind[] = ['video', 'contact_sheet', 'reference', 'hero']
const MACHINE_ONLY: Kind[] = ['video', 'contact_sheet']
const HUMAN_ONLY: Kind[] = ['reference']

/** Filename → a safe, readable path segment. */
const safeName = (raw: string | undefined, fallback: string) =>
  (raw || fallback)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || fallback

export async function POST(request: Request) {
  const machine = await checkApiKey(request)
  const human = machine ? false : await checkSession(request)
  if (!machine && !human) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    project_id?: string
    entry_id?: string
    kind?: string
    content_type?: string
    filename?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const kind = body.kind as Kind
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: `kind must be one of ${KINDS.join(', ')}` }, { status: 400 })
  }
  if ((MACHINE_ONLY.includes(kind) && !machine) || (HUMAN_ONLY.includes(kind) && !human)) {
    return NextResponse.json(
      { error: `kind '${kind}' not allowed for this credential` },
      { status: 403 },
    )
  }
  if (!isValidId(body.project_id)) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
  }
  const projectId = body.project_id

  let pathname: string
  let contentType: string
  let addRandomSuffix = false

  if (kind === 'video' || kind === 'contact_sheet') {
    // Entry media is addressed by the entry id, which the PC mints before
    // uploading and then reuses when it POSTs the entry itself. That's
    // what makes an interrupted upload safe to retry.
    if (!isValidId(body.entry_id)) {
      return NextResponse.json(
        { error: `entry_id is required for kind '${kind}'` },
        { status: 400 },
      )
    }
    const base = `media/dailies/${projectId}/entries/${body.entry_id}`
    if (kind === 'video') {
      contentType = body.content_type || 'video/mp4'
      if (!contentType.startsWith('video/')) {
        return NextResponse.json({ error: 'content_type must be video/*' }, { status: 400 })
      }
      pathname = `${base}/video.mp4`
    } else {
      contentType = body.content_type || 'image/png'
      if (!contentType.startsWith('image/')) {
        return NextResponse.json({ error: 'content_type must be image/*' }, { status: 400 })
      }
      pathname = `${base}/contact.png`
    }
  } else if (kind === 'hero') {
    // The hero is a still — it's either a frame grabbed off a video or an
    // image file, never a clip.
    contentType = body.content_type || 'image/jpeg'
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'content_type must be image/*' }, { status: 400 })
    }
    const ext = EXT_BY_TYPE[contentType.toLowerCase().split(';')[0].trim()] || 'jpg'
    // Fixed path so replacing the hero doesn't strand the old one.
    pathname = `media/dailies/${projectId}/hero.${ext}`
  } else {
    contentType = body.content_type || 'image/jpeg'
    if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
      return NextResponse.json(
        { error: 'content_type must be image/* or video/*' },
        { status: 400 },
      )
    }
    const ext =
      EXT_BY_TYPE[contentType.toLowerCase().split(';')[0].trim()] ||
      (contentType.startsWith('video/') ? 'mp4' : 'jpg')
    {
      // Random suffix keeps reference URLs unguessable, so the PC can
      // fetch them without auth but nobody can enumerate them. It also
      // means two files with the same name both survive.
      pathname = `media/dailies/${projectId}/refs/${safeName(body.filename, 'ref')}.${ext}`
      addRandomSuffix = true
    }
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
      // suffix is applied) and pass it back when you save the record.
      read_public_url_from: 'PUT response body .url',
    })
  } catch (err) {
    console.error('upload-url error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
