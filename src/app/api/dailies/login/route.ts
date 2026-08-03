import { NextResponse } from 'next/server'
import { SESSION_COOKIE, checkSession, verifyPassword } from '@/lib/dailies'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Portal login. POST { password } sets an httpOnly session cookie;
 * GET reports whether the caller is already signed in; DELETE signs out.
 *
 * The cookie carries the password itself (never exposed to JS, sent
 * over HTTPS only) and is verified by hashing — stateless, so it isn't
 * affected by Blob write-propagation lag the way a server-side session
 * store would be.
 */

const THIRTY_DAYS = 60 * 60 * 24 * 30

export async function GET(request: Request) {
  return NextResponse.json({ authenticated: await checkSession(request) })
}

export async function POST(request: Request) {
  let password = ''
  try {
    const body = await request.json()
    password = typeof body?.password === 'string' ? body.password : ''
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!(await verifyPassword(password))) {
    // Blunt the brute-force rate a little; the password is 20+ random
    // chars so this is belt-and-braces.
    await new Promise(r => setTimeout(r, 600))
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
  }

  const res = NextResponse.json({ success: true })
  res.cookies.set(SESSION_COOKIE, password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ success: true })
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
