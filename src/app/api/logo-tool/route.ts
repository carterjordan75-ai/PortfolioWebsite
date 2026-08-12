import { NextResponse } from 'next/server'
import { checkSession } from '@/lib/dailies'
import { LOGO_TOOL_B64 } from './tuner'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Serves the logo tuner to the /logo page's iframe.
 *
 * The tool lives here rather than in public/ for one reason: a file in
 * public/ is served straight off the CDN with nothing in front of it, so
 * anyone who knew the filename could open it. Coming through a route
 * means the same session check the dailies portal uses runs first.
 *
 * The page around it also gates, but that gate is client-side and only
 * decides what to render — it is not what keeps the tool private. This
 * is.
 */
export async function GET(request: Request) {
  if (!(await checkSession(request))) {
    return new NextResponse('Not authorised', {
      status: 401,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return new NextResponse(Buffer.from(LOGO_TOOL_B64, 'base64').toString('utf8'), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Private: it is per-session content, so no shared cache should
      // ever hold a copy.
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
