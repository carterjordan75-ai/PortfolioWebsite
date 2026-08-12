import { NextResponse } from 'next/server'
import { checkSession } from '@/lib/dailies'
import { readVersionedJson, writeVersionedJson } from '@/lib/blobStore'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_CACHE = { headers: { 'Cache-Control': 'private, no-store' } }

const KEY = 'state/logo-presets.json'

/**
 * Saved versions from the logo tuner.
 *
 * They used to live in the tuner's own localStorage, which worked when it
 * was opened as a file and silently did not when it ran inside /logo: a
 * srcDoc iframe has an opaque origin, so localStorage writes succeed into
 * a throwaway per-document store and are gone on reload. Rather than
 * paper over that, they are kept here — which also means they follow you
 * between browsers and machines.
 *
 * Same session check as the tool itself.
 */
export async function GET(request: Request) {
  if (!(await checkSession(request))) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401, ...NO_CACHE })
  }
  const presets = await readVersionedJson<Record<string, unknown>>(KEY, {})
  return NextResponse.json({ presets }, NO_CACHE)
}

/** PUT { presets } — the whole set, as the tuner holds it. */
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
