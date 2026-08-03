import { NextResponse } from 'next/server'
import seedMisc from '../../../../../data/misc.json'
import {
  checkSession,
  entrySource,
  getEntry,
  getProject,
  isValidId,
  mirrorProjectToMisc,
  miscSources,
} from '@/lib/dailies'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

/**
 * Publish ONE entry to /misc, tagged generative — the per-piece version
 * of what marking a whole project Done does. Session only: publishing to
 * the public site is a decision, not something the render machine should
 * be able to trigger with its API key.
 */
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

  const entry = await getEntry(body.entry_id)
  if (!entry) {
    return NextResponse.json({ error: `No entry ${body.entry_id}` }, { status: 404 })
  }
  const src = entrySource(entry)
  if (!src) {
    return NextResponse.json({ error: 'That entry has no media to publish' }, { status: 400 })
  }

  const project = await getProject(entry.project_id)
  if (!project) {
    return NextResponse.json({ error: `No project ${entry.project_id}` }, { status: 404 })
  }

  const { tombstoned } = await miscSources(seedMisc)
  if (tombstoned.has(src)) {
    return NextResponse.json(
      { error: 'This was deleted from Misc — undelete it there rather than re-pushing.' },
      { status: 409 },
    )
  }

  try {
    // mirrorProjectToMisc already skips duplicates, so a second press is
    // harmless and reports 0 added.
    const added = await mirrorProjectToMisc(project, [entry], seedMisc)
    return NextResponse.json({ success: true, added }, NO_CACHE)
  } catch (err) {
    console.error('POST /api/dailies/misc error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
