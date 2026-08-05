import { NextResponse } from 'next/server'
import seedMisc from '../../../../data/misc.json'
import {
  checkApiKey,
  checkSession,
  currentProjectId,
  ENTRY_STAGES,
  deleteAsset,
  deleteEntry,
  entryAssets,
  miscSources,
  getEntry,
  getFeedback,
  getProject,
  isValidDate,
  isValidId,
  listEntries,
  listProjects,
  newEntryId,
  saveEntry,
  saveProject,
  type Entry,
  type EntryStage,
  type Question,
  type QuestionType,
} from '@/lib/dailies'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

/**
 * Entries — a single thing the PC produced inside a project.
 *
 * POST   machine (Bearer). Files go straight to Blob first (see
 *        /api/dailies/upload-url); this call carries the metadata plus
 *        the resulting URLs. An overnight run POSTs many of these, so
 *        nothing here is keyed on the date.
 * GET    human (session). Everything the page needs: projects, their
 *        entries, and the feedback attached to each.
 * DELETE human (session). Removes one entry and its media.
 */

const VALID_TYPES: QuestionType[] = ['choice', 'scale', 'text']

/** Validate + normalise the questions array. */
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

  if (!isValidId(body.project_id)) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
  }
  const projectId = body.project_id

  const project = await getProject(projectId)
  if (!project) {
    return NextResponse.json(
      { error: `No project '${projectId}' — create it with POST /api/dailies/projects first` },
      { status: 404 },
    )
  }

  if (body.date !== undefined && !isValidDate(body.date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }
  if (body.id !== undefined && !isValidId(body.id)) {
    return NextResponse.json({ error: 'id must be a valid slug' }, { status: 400 })
  }

  const parsed = parseQuestions(body.questions)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  // A client-supplied id makes the call idempotent — a retried upload
  // updates the same entry instead of duplicating it. That matters over
  // a six-hour unattended run where nobody is watching for doubles.
  const id = typeof body.id === 'string' ? body.id : newEntryId(projectId)
  const existing = await getEntry(id)
  if (existing && existing.project_id !== projectId) {
    return NextResponse.json({ error: `Entry ${id} belongs to another project` }, { status: 409 })
  }
  const now = new Date().toISOString()

  if (body.stage !== undefined && !ENTRY_STAGES.includes(body.stage as EntryStage)) {
    return NextResponse.json(
      { error: `stage must be one of ${ENTRY_STAGES.join(' | ')}` },
      { status: 400 },
    )
  }

  const entry: Entry = {
    id,
    project_id: projectId,
    date: isValidDate(body.date) ? body.date : existing?.date ?? now.slice(0, 10),
    stage: (body.stage as EntryStage) ?? existing?.stage ?? 'wip',
    title: typeof body.title === 'string' ? body.title : existing?.title ?? '',
    note: typeof body.note === 'string' ? body.note : existing?.note ?? '',
    questions: body.questions !== undefined ? parsed.questions : existing?.questions ?? [],
    video_url: typeof body.video_url === 'string' ? body.video_url : existing?.video_url ?? null,
    contact_sheet_url:
      typeof body.contact_sheet_url === 'string'
        ? body.contact_sheet_url
        : existing?.contact_sheet_url ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  }

  try {
    await saveEntry(entry)
    // Touch the project so the grid sorts by real activity.
    await saveProject({ ...project, updated_at: now })
    return NextResponse.json({ success: true, created: !existing, entry }, NO_CACHE)
  } catch (err) {
    console.error('POST /api/dailies error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(request: Request) {
  if (!(await checkSession(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectFilter = new URL(request.url).searchParams.get('project')
  if (projectFilter !== null && !isValidId(projectFilter)) {
    return NextResponse.json({ error: 'project must be a valid id' }, { status: 400 })
  }

  try {
    const [projects, allEntries] = await Promise.all([listProjects(), listEntries()])
    const entries = projectFilter
      ? allEntries.filter(e => e.project_id === projectFilter)
      : allEntries

    const misc = await miscSources(seedMisc)
    const withFeedback = await Promise.all(
      entries.map(async entry => {
        // Per FILE, not per entry: a video and its contact sheet are
        // published separately, so each needs its own state.
        const urls = entryAssets(entry).map(a => a.url)
        return {
          ...entry,
          feedback: await getFeedback(entry.id),
          in_misc_urls: urls.filter(u => misc.present.has(u)),
          misc_removed_urls: urls.filter(u => misc.tombstoned.has(u)),
        }
      }),
    )

    // Computed across ALL projects, not the filtered view — otherwise a
    // single-project request would always call itself the current one.
    const current = currentProjectId(projects)

    const shaped = projects
      .filter(p => !projectFilter || p.id === projectFilter)
      .map(p => {
        const mine = withFeedback.filter(e => e.project_id === p.id)
        return {
          ...p,
          hero_url: p.hero_url || mine.find(e => e.contact_sheet_url)?.contact_sheet_url || null,
          entry_count: mine.length,
          awaiting_count: mine.filter(e => !e.feedback).length,
          latest_entry_at: mine[0]?.created_at ?? null,
          is_current: p.id === current,
          entries: mine,
        }
      })

    return NextResponse.json({ projects: shaped, current_project_id: current }, NO_CACHE)
  } catch (err) {
    console.error('GET /api/dailies error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * Remove media. `?url=` deletes one file; without it the whole entry
 * goes. Deleting a file that was the entry's last also takes the entry,
 * since a note with nothing attached isn't reviewable.
 *
 * Session only — the render machine can post work, never destroy it.
 */
export async function DELETE(request: Request) {
  if (!(await checkSession(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  const id = params.get('id')
  const url = params.get('url')
  if (!isValidId(id)) {
    return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 })
  }
  const entry = await getEntry(id)
  if (!entry) {
    return NextResponse.json({ error: `No entry ${id}` }, { status: 404 })
  }

  // Only this entry's own files — the parameter can't be pointed at
  // arbitrary blobs.
  if (url && !entryAssets(entry).some(a => a.url === url)) {
    return NextResponse.json({ error: 'url is not one of this entry\'s files' }, { status: 400 })
  }

  try {
    if (url) {
      const what = await deleteAsset(entry, url, seedMisc)
      return NextResponse.json({ success: true, deleted: what }, NO_CACHE)
    }
    await deleteEntry(entry)
    return NextResponse.json({ success: true, deleted: 'entry' }, NO_CACHE)
  } catch (err) {
    console.error('DELETE /api/dailies error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
