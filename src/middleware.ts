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

  // ── Studio tools: the logo tuner and the character animator ──────
  // Exempt from the site passcode for the same reason the dailies portal
  // is: they carry their own password (the dailies one), so the site
  // gate would only be a second, redundant prompt. They are NOT exempt
  // from the phone lock — that block runs above this one and catches
  // phones first, which is right for a desktop tool.
  //
  // The /api/*-tool routes check the dailies session themselves before
  // returning a byte; the pages' gates only decide what to render.
  //
  // The -presets routes have to be exempt too, and for a reason that is
  // easy to miss: the gate answers a blocked request with a REDIRECT to
  // /gate, not an error. A fetch follows it and gets 200 and a page of
  // HTML, so the tool sees a successful reply that will not parse and
  // concludes there is nothing saved. Saving then appears to work and
  // quietly goes nowhere. They check the same dailies session as the
  // tools they belong to, so the passcode adds nothing but that trap.
  if (
    pathname === '/logo' ||
    pathname === '/character' ||
    pathname.startsWith('/api/logo-tool') ||
    pathname.startsWith('/api/logo-presets') ||
    pathname.startsWith('/api/character-tool') ||
    pathname.startsWith('/api/character-presets')
  ) {
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
