import { NextResponse, userAgent } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE_NAME = 'xoxo_access'
const SITE_PASSCODE = process.env.SITE_PASSCODE || 'changeme'

/**
 * Site-wide passcode gate + phone lock.
 *
 * Phone lock: the site isn't ready for phones yet, so requests whose
 * user-agent classifies as a PHONE (`device.type === 'mobile'`) are
 * rewritten to /mobile-lock — a static "please view on a desktop screen"
 * page. Tablets (iPads report as desktop Safari anyway) and desktops pass
 * straight through. Runs BEFORE the passcode gate so phones see the lock,
 * not the gate. Remove the block below when the mobile experience ships.
 *
 * Passcode gate: anyone else visiting is redirected to /gate unless they
 * have a valid cookie, set by /api/gate after a successful passcode
 * submission. Disable by removing this file once the site is public.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip both checks for asset paths and the gate itself.
  // /api/look-share is exempt because the phone share-sheet Shortcut has
  // no gate cookie — the route authenticates every request itself against
  // SITE_PASSCODE before writing anything.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/gate') ||
    pathname.startsWith('/api/look-share') ||
    pathname === '/gate' ||
    pathname.startsWith('/assets') ||
    pathname.startsWith('/placeholder') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  // ── Phone lock ──────────────────────────────────────────────────
  const isPhone = userAgent(request).device.type === 'mobile'
  if (pathname === '/mobile-lock') {
    // Phones see the lock page; a desktop that lands here directly is
    // bounced to the real site.
    return isPhone
      ? NextResponse.next()
      : NextResponse.redirect(new URL('/', request.url))
  }
  if (isPhone && !pathname.startsWith('/api')) {
    // Rewrite (not redirect) so the visitor keeps the URL they opened —
    // if they reopen it on a desktop later, it just works.
    return NextResponse.rewrite(new URL('/mobile-lock', request.url))
  }

  // ── Passcode gate ───────────────────────────────────────────────
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
