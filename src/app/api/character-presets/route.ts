import { NextResponse } from 'next/server'
import { checkSession } from '@/lib/dailies'
import { readVersionedJson, writeVersionedJson } from '@/lib/blobStore'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_CACHE = { headers: { 'Cache-Control': 'private, no-store' } }

const KEY = 'state/character-presets.json'

/**
 * Saved characters from the animator: the traced outline, where every
 * joint was placed, the face, and the slider settings.
 *
 * Worth keeping server-side rather than in the tool's own localStorage
 * for the same reason the logo presets are — a srcDoc iframe has an
 * opaque origin, so its localStorage is a throwaway that empties on
 * reload. Here they also follow you between machines, which matters
 * more for a character than for a slider preset: placing eighteen
 * joints by hand is not work anyone wants to repeat.
 *
 * Versioned writes, because an unversioned one can be served stale by
 * the CDN and look like the save silently failed.
 */
export async function GET(request: Request) {
  if (!(await checkSession(request))) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401, ...NO_CACHE })
  }
  const presets = await readVersionedJson<Record<string, unknown>>(KEY, {})
  return NextResponse.json({ presets }, NO_CACHE)
}

/** PUT { presets } — the whole set, as the tool holds it. */
export async function PUT(request: Request) {
  if (!(await checkSession(request))) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401, ...NO_CACHE })
  }
  let body: { presets?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, ...NO_CACHE })
  }
  if (!body.presets || typeof body.presets !== 'object') {
    return NextResponse.json({ error: 'No presets' }, { status: 400, ...NO_CACHE })
  }
  await writeVersionedJson(KEY, body.presets)
  return NextResponse.json({ ok: true, count: Object.keys(body.presets).length }, NO_CACHE)
}
