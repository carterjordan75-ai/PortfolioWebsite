import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE_NAME = 'xoxo_access'
const SITE_PASSCODE = process.env.SITE_PASSCODE || 'changeme'

/**
 * Site-wide passcode gate. Anyone visiting the site is redirected to /gate
 * unless they have a valid cookie. The cookie is set by /api/gate after a
 * successful passcode submission. Disable by removing this file (or by setting
 * SITE_PASSCODE='' in the environment, which would still keep it active but
 * with an empty expected passcode — recommended approach is to delete this
 * file once the site is public).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip the gate for asset paths and the gate itself.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/gate') ||
    pathname === '/gate' ||
    pathname.startsWith('/assets') ||
    pathname.startsWith('/placeholder') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  const cookie = request.cookies.get(COOKIE_NAME)
  if (cookie?.value === SITE_PASSCODE) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = '/gate'
  return NextResponse.redirect(url)
}

export const config = {
  // Run on all paths except Next internals and image files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
