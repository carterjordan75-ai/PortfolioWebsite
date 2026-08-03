import { NextResponse } from 'next/server'
import {
  checkApiKey,
  checkSession,
  getEntry,
  isValidDate,
  isValidId,
  listEntries,
  listFeedback,
  saveFeedback,
  type Feedback,
} from '@/lib/dailies'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

/**
 * GET  — machine (Bearer API key). `?since=YYYY-MM-DD` returns every
 *        feedback submitted on/after that date as a bare JSON array.
 *        `?project=<id>` narrows it to one project. Both optional.
 *        Filtering is on submitted_at — "submitted since" — so a
 *        re-reviewed older entry still comes back.
 * POST — human (session cookie). Submits/overwrites the feedback for one
 *        entry. Reference images are uploaded to Blob beforehand via
 *        /api/dailies/upload-url; this call carries their URLs.
 */

export async function GET(request: Request) {
  if (!(await checkApiKey(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  const since = params.get('since')
  const project = params.get('project')
  if (since !== null && !isValidDate(since)) {
    return NextResponse.json({ error: 'since must be YYYY-MM-DD' }, { status: 400 })
  }
  if (project !== null && !isValidId(project)) {
    return NextResponse.json({ error: 'project must be a valid id' }, { status: 400 })
  }

  try {
    const [all, entries] = await Promise.all([listFeedback(), listEntries()])
    const byId = new Map(entries.map(e => [e.id, e]))

    const cutoff = since ? Date.parse(`${since}T00:00:00.000Z`) : null
    const filtered = all.filter(f => {
      if (project && f.project_id !== project) return false
      if (cutoff === null) return true
      const t = Date.parse(f.submitted_at)
      return Number.isNaN(t) ? true : t >= cutoff
    })

    // Bare array. Each item carries enough context that the PC never has
    // to make a second call to work out what was being reviewed.
    return NextResponse.json(
      filtered.map(f => {
        const entry = byId.get(f.entry_id)
        return {
          entry_id: f.entry_id,
          project_id: f.project_id,
          entry_title: entry?.title ?? '',
          date: entry?.date ?? f.submitted_at.slice(0, 10),
          answers: f.answers,
          brief: f.brief,
          reference_images: f.reference_images,
          render_master: f.render_master,
          submitted_at: f.submitted_at,
        }
      }),
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

  if (!isValidId(body.entry_id)) {
    return NextResponse.json({ error: 'entry_id is required' }, { status: 400 })
  }
  const entryId = body.entry_id

  const entry = await getEntry(entryId)
  if (!entry) {
    return NextResponse.json({ error: `No entry ${entryId}` }, { status: 404 })
  }

  // Answers: keep only known question ids so a stale form can't inject
  // arbitrary keys into the PC's payload.
  const known = new Set(entry.questions.map(q => q.id))
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
    entry_id: entryId,
    project_id: entry.project_id,
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
