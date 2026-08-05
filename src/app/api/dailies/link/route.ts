import { NextResponse } from 'next/server'
import { checkSession } from '@/lib/dailies'
import { isSafePublicUrl, resolveLink } from '@/lib/linkPreview'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

/**
 * Resolve a pasted URL into a reference the machine can use.
 *
 * Session only. This makes the server fetch a URL supplied by a browser,
 * so it's gated behind the same login as everything else and the target
 * is checked against private address ranges first.
 */
export async function POST(request: Request) {
  if (!(await checkSession(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const raw = typeof body.url === 'string' ? body.url.trim() : ''

  // A bare "cosmos.so/..." paste is the common case, so assume https —
  // but ONLY when there's no scheme at all. Prefixing something that
  // already has one (file:, javascript:, data:) turns a rejectable input
  // into a URL that parses, which is how a guard gets walked past.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw)
  const url = hasScheme ? raw : raw ? `https://${raw}` : ''

  if (!url || !isSafePublicUrl(url)) {
    return NextResponse.json(
      { error: 'Enter a public http(s) link' },
      { status: 400 },
    )
  }

  try {
    const resolved = await resolveLink(url)
    return NextResponse.json({ success: true, link: resolved }, NO_CACHE)
  } catch (err) {
    console.error('POST /api/dailies/link error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
