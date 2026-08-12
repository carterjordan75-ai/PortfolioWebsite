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
  //
  // The Motion Dailies portal is likewise exempt from BOTH the site
  // passcode and the phone lock, because:
  //   - it carries its own password (see src/lib/dailies.ts), so the
  //     site gate would just be a second, redundant prompt;
  //   - /api/dailies + /api/feedback are called by the render PC with a
  //     Bearer key and no cookie;
  //   - the portal is explicitly meant to be reviewed on a phone, which
  //     the site-wide mobile lock would otherwise block.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/gate') ||
    pathname.startsWith('/api/look-share') ||
    pathname.startsWith('/api/dailies') ||
    pathname.startsWith('/api/feedback') ||
    pathname === '/dailies' ||
    pathname.startsWith('/dailies/') ||
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

  // ── Logo tuner ──────────────────────────────────────────────────
  // Exempt from the site passcode for the same reason the dailies portal
  // is: it carries its own password (the dailies one), so the site gate
  // would only be a second, redundant prompt. It is NOT exempt from the
  // phone lock — that block runs above this one and catches phones
  // first, which is right for a desktop tool.
  //
  // /api/logo-tool checks the dailies session itself before returning a
  // byte; the page's gate only decides what to render.
  if (pathname === '/logo' || pathname.startsWith('/api/logo-tool')) {
    return NextResponse.next()
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
