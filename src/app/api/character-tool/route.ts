import { NextResponse } from 'next/server'
import { checkSession } from '@/lib/dailies'
import { CHARACTER_TOOL_B64 } from './tool'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Serves the character animator to the /character page's iframe.
 *
 * Same arrangement as the logo tuner, for the same reason: a file in
 * public/ is served straight off the CDN with nothing in front of it,
 * so anyone who knew the filename could open it. Coming through a route
 * means the dailies session check runs before a byte is returned.
 *
 * The gate on the page around it is client-side and only decides what
 * to render. This is what keeps the tool private.
 */
export async function GET(request: Request) {
  if (!(await checkSession(request))) {
    return new NextResponse('Not authorised', {
      status: 401,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return new NextResponse(Buffer.from(CHARACTER_TOOL_B64, 'base64').toString('utf8'), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
