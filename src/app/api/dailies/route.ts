import { NextResponse } from 'next/server'
import {
  checkApiKey,
  checkSession,
  getDaily,
  getFeedback,
  isValidDate,
  listDailies,
  saveDaily,
  type Daily,
  type Question,
  type QuestionType,
} from '@/lib/dailies'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

/**
 * POST — machine (Bearer API key). Creates or updates the daily for a
 *        date. Files are uploaded straight to Blob first (see
 *        /api/dailies/upload-url); this call carries the metadata plus
 *        the resulting URLs.
 * GET  — human (session cookie). The review page's list: every daily
 *        newest-first, each with its feedback (or null).
 */

const VALID_TYPES: QuestionType[] = ['choice', 'scale', 'text']

/** Validate + normalise the questions array from the contract. */
function parseQuestions(raw: unknown): { questions: Question[] } | { error: string } {
  if (raw === undefined || raw === null) return { questions: [] }
  if (!Array.isArray(raw)) return { error: 'questions must be an array' }
  const questions: Question[] = []
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i]
    if (!q || typeof q !== 'object') return { error: `questions[${i}] must be an object` }
    const { id, prompt, type, options } = q as Record<string, unknown>
    if (typeof id !== 'string' || !id.trim()) return { error: `questions[${i}].id is required` }
    if (typeof prompt !== 'string' || !prompt.trim()) return { error: `questions[${i}].prompt is required` }
    if (typeof type !== 'string' || !VALID_TYPES.includes(type as QuestionType)) {
      return { error: `questions[${i}].type must be one of ${VALID_TYPES.join(' | ')}` }
    }
    if (type === 'choice') {
      if (!Array.isArray(options) || options.length === 0) {
        return { error: `questions[${i}] is type 'choice' and needs a non-empty options array` }
      }
    }
    questions.push({
      id: id.trim(),
      prompt: prompt.trim(),
      type: type as QuestionType,
      ...(Array.isArray(options) ? { options: options.map(String) } : {}),
    })
  }
  return { questions }
}

export async function POST(request: Request) {
  if (!(await checkApiKey(request))) {
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

  const parsed = parseQuestions(body.questions)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const existing = await getDaily(date)
  const now = new Date().toISOString()

  // Partial updates are allowed: omitted fields keep their stored value,
  // so the PC can re-POST just a corrected note without re-uploading.
  const daily: Daily = {
    date,
    title: typeof body.title === 'string' ? body.title : existing?.title ?? '',
    note: typeof body.note === 'string' ? body.note : existing?.note ?? '',
    questions: body.questions !== undefined ? parsed.questions : existing?.questions ?? [],
    video_url:
      typeof body.video_url === 'string' ? body.video_url : existing?.video_url ?? null,
    contact_sheet_url:
      typeof body.contact_sheet_url === 'string'
        ? body.contact_sheet_url
        : existing?.contact_sheet_url ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  }

  try {
    await saveDaily(daily)
    return NextResponse.json({ success: true, created: !existing, daily }, NO_CACHE)
  } catch (err) {
    console.error('POST /api/dailies error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(request: Request) {
  if (!(await checkSession(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const dailies = await listDailies()
    const withFeedback = await Promise.all(
      dailies.map(async daily => ({ ...daily, feedback: await getFeedback(daily.date) })),
    )
    return NextResponse.json({ dailies: withFeedback }, NO_CACHE)
  } catch (err) {
    console.error('GET /api/dailies error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
