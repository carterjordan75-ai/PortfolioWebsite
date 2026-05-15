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
    // 6-hour auth window. After 6 hours the cookie expires and visitors
    // must re-enter the passcode, regardless of whether the browser is
    // still open or has been closed and reopened.
    maxAge: 60 * 60 * 6,
    path: '/',
  })
  return res
}
