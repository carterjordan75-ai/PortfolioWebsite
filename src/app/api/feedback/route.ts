import { NextResponse } from 'next/server'
import {
  checkApiKey,
  checkSession,
  getDaily,
  isValidDate,
  listFeedback,
  saveFeedback,
  type Feedback,
} from '@/lib/dailies'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

/**
 * GET  — machine (Bearer API key). `?since=YYYY-MM-DD` returns every
 *        feedback submitted on/after that date as a bare JSON array,
 *        matching the agreed contract. `since` is optional (omit for
 *        everything). Filtering is on submitted_at, i.e. "submitted
 *        since", not on the daily's own date.
 * POST — human (session cookie). Submits/overwrites the feedback for a
 *        date. Reference images are uploaded to Blob beforehand via
 *        /api/dailies/upload-url; this call carries their URLs.
 */

export async function GET(request: Request) {
  if (!(await checkApiKey(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const since = new URL(request.url).searchParams.get('since')
  if (since !== null && !isValidDate(since)) {
    return NextResponse.json({ error: 'since must be YYYY-MM-DD' }, { status: 400 })
  }

  try {
    const all = await listFeedback()
    const cutoff = since ? Date.parse(`${since}T00:00:00.000Z`) : null
    const filtered =
      cutoff === null
        ? all
        : all.filter(f => {
            const t = Date.parse(f.submitted_at)
            return Number.isNaN(t) ? f.date >= since! : t >= cutoff
          })

    // Bare array, exactly the agreed shape.
    return NextResponse.json(
      filtered.map(f => ({
        date: f.date,
        answers: f.answers,
        brief: f.brief,
        reference_images: f.reference_images,
        render_master: f.render_master,
        submitted_at: f.submitted_at,
      })),
      NO_CACHE,
    )
  } catch (err) {
    console.error('GET /api/feedback error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!(await checkSession(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isValidDate(body.date)) {
    return NextResponse.json({ error: 'date is required, format YYYY-MM-DD' }, { status: 400 })
  }
  const date = body.date

  const daily = await getDaily(date)
  if (!daily) {
    return NextResponse.json({ error: `No daily exists for ${date}` }, { status: 404 })
  }

  // Answers: keep only known question ids so a stale form can't inject
  // arbitrary keys into the PC's payload.
  const known = new Set(daily.questions.map(q => q.id))
  const rawAnswers = (body.answers && typeof body.answers === 'object' ? body.answers : {}) as Record<string, unknown>
  const answers: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(rawAnswers)) {
    if (!known.has(k)) continue
    if (typeof v === 'number' || typeof v === 'string') answers[k] = v
  }

  const refs = Array.isArray(body.reference_images)
    ? (body.reference_images as unknown[])
        .filter((u): u is string => typeof u === 'string' && /^https:\/\//.test(u))
        .slice(0, 20)
    : []

  const feedback: Feedback = {
    date,
    answers,
    brief: typeof body.brief === 'string' ? body.brief : '',
    reference_images: refs,
    render_master: body.render_master === true,
    submitted_at: new Date().toISOString(),
  }

  try {
    await saveFeedback(feedback)
    return NextResponse.json({ success: true, feedback }, NO_CACHE)
  } catch (err) {
    console.error('POST /api/feedback error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
