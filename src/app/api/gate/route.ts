import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'xoxo_access'
const SITE_PASSCODE = process.env.SITE_PASSCODE || 'changeme'

export async function POST(req: NextRequest) {
  let passcode: string | undefined
  try {
    const body = await req.json()
    passcode = typeof body?.passcode === 'string' ? body.passcode : undefined
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  if (!passcode || passcode !== SITE_PASSCODE) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, SITE_PASSCODE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    // Session cookie — omitting maxAge / expires means the cookie is cleared
    // when the browser is closed. Each new visit (new browser session) must
    // re-enter the passcode. Within a single session, visitors can navigate
    // freely without being re-prompted. Restore a long maxAge here if you
    // want the previous 30-day "remember me" behaviour.
    path: '/',
  })
  return res
}
