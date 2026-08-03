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

// ── brute-force lockout ─────────────────────────────────────────────
//
// A short numeric password is a small keyspace, and a fixed delay per
// request doesn't protect it — an attacker just fires requests in
// parallel and eats the whole space in seconds. What actually costs them
// is a cap on ATTEMPTS, so failures are counted per IP and the account
// locks for a spell once they pile up.
//
// The counter lives in module memory, which on serverless means per
// instance and cleared on cold start. That's a real limit: a determined
// attacker spraying across instances gets more tries than the numbers
// below suggest. It still turns "brute-forced in seconds" into something
// slow and noisy, and it needs no extra infrastructure. If the portal
// ever holds something worth real money, move the password back to
// something long and random — that, not this, is the actual defence.

const MAX_ATTEMPTS = 8
const LOCKOUT_MS = 15 * 60 * 1000
const WINDOW_MS = 15 * 60 * 1000
const FAILURE_DELAY_MS = 600

type Record = { failures: number; first: number; lockedUntil: number }
const attempts = new Map<string, Record>()

function clientKey(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for') || ''
  return fwd.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown'
}

/** Drop stale records so the map can't grow without bound. */
function prune(now: number) {
  if (attempts.size < 500) return
  for (const [key, rec] of Array.from(attempts.entries())) {
    if (now > rec.lockedUntil && now - rec.first > WINDOW_MS) attempts.delete(key)
  }
}

function lockedFor(key: string, now: number): number {
  const rec = attempts.get(key)
  return rec && now < rec.lockedUntil ? Math.ceil((rec.lockedUntil - now) / 1000) : 0
}

function recordFailure(key: string, now: number) {
  const rec = attempts.get(key)
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(key, { failures: 1, first: now, lockedUntil: 0 })
    return
  }
  rec.failures += 1
  if (rec.failures >= MAX_ATTEMPTS) {
    rec.lockedUntil = now + LOCKOUT_MS
    rec.failures = 0
    rec.first = now
  }
}

export async function GET(request: Request) {
  return NextResponse.json({ authenticated: await checkSession(request) })
}

export async function POST(request: Request) {
  const now = Date.now()
  const key = clientKey(request)
  prune(now)

  const wait = lockedFor(key, now)
  if (wait > 0) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} min.` },
      { status: 429 },
    )
  }

  let password = ''
  try {
    const body = await request.json()
    password = typeof body?.password === 'string' ? body.password : ''
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!(await verifyPassword(password))) {
    recordFailure(key, now)
    await new Promise(r => setTimeout(r, FAILURE_DELAY_MS))
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
  }

  attempts.delete(key)

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
