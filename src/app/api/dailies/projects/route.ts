import { NextResponse } from 'next/server'
import {
  ALL_STYLES,
  BRIEF_QUESTION_IDS,
  PROJECT_STATUSES,
  referenceType,
  checkApiKey,
  checkSession,
  currentProjectId,
  deleteProject,
  getProject,
  isValidId,
  listEntries,
  listProjects,
  saveProject,
  slugify,
  type Project,
  type ProjectStatus,
  type Asset,
  type Pitch,
} from '@/lib/dailies'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

/**
 * Projects — the container for everything.
 *
 * GET    both credentials. For the render PC this is the work list: what
 *        to build, the standing brief, and the reference URLs to pull
 *        down before it starts. For the page it's the project grid.
 * POST   both credentials. Create or update. The reviewer creates
 *        projects from their phone; the PC can also create one when it
 *        spins up something new.
 * DELETE session only. Destroys the project, its entries and its media —
 *        deliberately not reachable with the machine key, so a buggy
 *        overnight script can't wipe a project.
 */

/** Shared by `references` and `sources` — same shape, different meaning. */
function parseAssets(raw: unknown, field: string): Asset[] | { error: string } {
  if (!Array.isArray(raw)) return { error: `${field} must be an array` }
  const out: Asset[] = []
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]
    if (!r || typeof r !== 'object') return { error: `${field}[${i}] must be an object` }
    const { url, filename, note, type, added_at, title, preview_url, images } =
      r as Record<string, unknown>
    // Links may be http; uploaded files are always https Blob URLs.
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      return { error: `${field}[${i}].url must be an http(s) URL` }
    }
    const isLink = type === 'link'
    out.push({
      url,
      filename: typeof filename === 'string' ? filename.slice(0, 200) : '',
      note: typeof note === 'string' ? note.slice(0, 2000) : '',
      // Trust the sender's label when it's valid, otherwise read it off
      // the URL — references predating this field still render right.
      type: isLink
        ? 'link'
        : referenceType({ url, type: typeof type === 'string' ? type : undefined }),
      added_at: typeof added_at === 'string' ? added_at : new Date().toISOString(),
      ...(isLink
        ? {
            title: typeof title === 'string' ? title.slice(0, 300) : '',
            preview_url: typeof preview_url === 'string' ? preview_url : undefined,
            images: Array.isArray(images)
              ? (images as unknown[])
                  .filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u))
                  .slice(0, 60)
              : [],
          }
        : {}),
    })
  }
  return out.slice(0, 200)
}

export async function GET(request: Request) {
  const machine = await checkApiKey(request)
  if (!machine && !(await checkSession(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [projects, entries] = await Promise.all([listProjects(), listEntries()])
    const current = currentProjectId(projects)

    const withCounts = projects.map(p => {
      const mine = entries.filter(e => e.project_id === p.id)
      return {
        ...p,
        entry_count: mine.length,
        latest_entry_at: mine[0]?.created_at ?? null,
        // The machine works on exactly one project at a time; this is
        // how both the page and the watcher agree on which.
        is_current: p.id === current,
        // A project with no hero still needs a face in the grid: fall
        // back to the newest contact sheet it has produced.
        hero_url: p.hero_url || mine.find(e => e.contact_sheet_url)?.contact_sheet_url || null,
      }
    })

    return NextResponse.json({ projects: withCounts, current_project_id: current }, NO_CACHE)
  } catch (err) {
    console.error('GET /api/dailies/projects error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const machine = await checkApiKey(request)
  if (!machine && !(await checkSession(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // An explicit id updates in place; otherwise the title makes one.
  let id: string
  if (body.id !== undefined) {
    if (!isValidId(body.id)) {
      return NextResponse.json(
        { error: 'id must be lowercase letters, numbers and single dashes (2-64 chars)' },
        { status: 400 },
      )
    }
    id = body.id
  } else if (typeof body.title === 'string' && body.title.trim()) {
    id = slugify(body.title)
  } else {
    return NextResponse.json({ error: 'id or title is required' }, { status: 400 })
  }

  let references: Asset[] | undefined
  if (body.references !== undefined) {
    const parsed = parseAssets(body.references, 'references')
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    references = parsed
  }

  /**
   * The machine posts a round of pitches; the page picks one, or rejects
   * the lot. Rejecting remembers the titles so the next round doesn't
   * come back with the same ideas in different words.
   */
  let pitches: Pitch[] | undefined
  if (body.pitches !== undefined) {
    if (!Array.isArray(body.pitches)) {
      return NextResponse.json({ error: 'pitches must be an array' }, { status: 400 })
    }
    pitches = (body.pitches as unknown[]).slice(0, 8).map((raw, i) => {
      const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
      const str = (v: unknown, cap = 2000) => (typeof v === 'string' ? v.slice(0, cap) : '')
      return {
        id: typeof r.id === 'string' && r.id.trim() ? r.id.slice(0, 64) : `p${i + 1}`,
        title: str(r.title, 200) || `Concept ${i + 1}`,
        concept: str(r.concept),
        constraint: str(r.constraint),
        why: str(r.why),
        risk: str(r.risk),
      }
    })
  }

  let briefAnswers: Record<string, string> | undefined
  if (body.brief_answers !== undefined) {
    const raw = body.brief_answers
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return NextResponse.json({ error: 'brief_answers must be an object' }, { status: 400 })
    }
    // Known question ids only — an unrecognised key would be written and
    // then never read by anything.
    briefAnswers = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!BRIEF_QUESTION_IDS.includes(k)) continue
      if (typeof v === 'string' && v.trim()) briefAnswers[k] = v.slice(0, 4000)
    }
  }

  let styles: string[] | undefined
  if (body.styles !== undefined) {
    if (!Array.isArray(body.styles)) {
      return NextResponse.json({ error: 'styles must be an array' }, { status: 400 })
    }
    // Only from the known vocabulary — an unrecognised label tells the
    // machine nothing and would quietly become a typo nobody notices.
    const unknown = (body.styles as unknown[]).filter(
      s => typeof s !== 'string' || !ALL_STYLES.includes(s),
    )
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: `unknown style: ${String(unknown[0])}` },
        { status: 400 },
      )
    }
    styles = Array.from(new Set(body.styles as string[]))
  }

  let sources: Asset[] | undefined
  if (body.sources !== undefined) {
    const parsed = parseAssets(body.sources, 'sources')
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    sources = parsed
  }

  if (
    body.status !== undefined &&
    !PROJECT_STATUSES.includes(body.status as ProjectStatus)
  ) {
    return NextResponse.json(
      { error: `status must be one of ${PROJECT_STATUSES.join(' | ')}` },
      { status: 400 },
    )
  }

  const existing = await getProject(id)
  const now = new Date().toISOString()
  const wantsDone = (body.status as ProjectStatus | undefined) === 'done'

  // Partial updates: an omitted field keeps its stored value, so the PC
  // can append a reference without resending the brief.
  const project: Project = {
    id,
    title: typeof body.title === 'string' ? body.title : existing?.title ?? id,
    brief: typeof body.brief === 'string' ? body.brief : existing?.brief ?? '',
    hero_url: typeof body.hero_url === 'string' ? body.hero_url : existing?.hero_url ?? null,
    references: references ?? existing?.references ?? [],
    sources: sources ?? existing?.sources ?? [],
    brief_answers: briefAnswers ?? existing?.brief_answers ?? {},
    styles: styles ?? existing?.styles ?? [],
    pitches:
      body.reject_pitches === true ? [] : pitches ?? existing?.pitches ?? [],
    chosen_pitch_id:
      body.reject_pitches === true
        ? null
        : typeof body.chosen_pitch_id === 'string'
          ? body.chosen_pitch_id
          : body.chosen_pitch_id === null
            ? null
            : pitches !== undefined
              // A fresh round supersedes whatever was chosen before.
              ? null
              : existing?.chosen_pitch_id ?? null,
    pitch_round:
      body.reject_pitches === true
        ? (existing?.pitch_round ?? 0) + 1
        : existing?.pitch_round ?? 0,
    rejected_pitches:
      body.reject_pitches === true
        ? Array.from(
            new Set([
              ...(existing?.rejected_pitches ?? []),
              ...(existing?.pitches ?? []).map(p => p.title),
            ]),
          ).slice(-40)
        : existing?.rejected_pitches ?? [],
    learnings:
      typeof body.learnings === 'string'
        ? body.learnings.slice(0, 20_000)
        : existing?.learnings ?? '',
    // New projects start as drafts: nothing enters the queue until you
    // say so, which is what buys the time to write a brief.
    status: (body.status as ProjectStatus) ?? existing?.status ?? 'draft',
    // Approving raises the finishing job once and only once — a later
    // save of an already-approved project must not re-request it.
    delivery: {
      requested_at:
        wantsDone && !existing?.delivery?.requested_at
          ? now
          : existing?.delivery?.requested_at ?? null,
      done_at:
        body.delivery_done === true
          ? existing?.delivery?.done_at ?? now
          : existing?.delivery?.done_at ?? null,
    },
    created_at: existing?.created_at ?? now,
    updated_at: now,
  }

  try {
    await saveProject(project)
    // Finishing a project no longer publishes it automatically. Not
    // everything an overnight run makes belongs on the public site, so
    // the page asks which pieces to send and posts them to
    // /api/dailies/misc individually.
    return NextResponse.json({ success: true, created: !existing, project }, NO_CACHE)
  } catch (err) {
    console.error('POST /api/dailies/projects error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  if (!(await checkSession(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!isValidId(id)) {
    return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 })
  }
  if (!(await getProject(id))) {
    return NextResponse.json({ error: `No project ${id}` }, { status: 404 })
  }

  try {
    const removed = await deleteProject(id)
    return NextResponse.json({ success: true, entries_deleted: removed }, NO_CACHE)
  } catch (err) {
    console.error('DELETE /api/dailies/projects error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
