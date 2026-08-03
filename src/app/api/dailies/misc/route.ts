import { NextResponse } from 'next/server'
import seedMisc from '../../../../../data/misc.json'
import {
  checkSession,
  entryAssets,
  getEntry,
  getProject,
  isValidId,
  miscSources,
  publishToMisc,
} from '@/lib/dailies'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

/**
 * Publish ONE asset to /misc, tagged generative.
 *
 * The unit is the file, not the entry: a video and its contact sheet are
 * different pictures at different aspect ratios, and only one of them may
 * be worth showing. `url` says which; omit it and the entry's video (or
 * its still, if there's no video) is used.
 *
 * Session only — publishing to the public site is a decision, not
 * something the render machine should reach with its API key.
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

  const assets = entryAssets(entry)
  if (assets.length === 0) {
    return NextResponse.json({ error: 'That entry has no media to publish' }, { status: 400 })
  }

  // Only this entry's own files are publishable through it — otherwise
  // the endpoint would happily put any URL on the public page.
  const asset =
    body.url === undefined
      ? assets[0]
      : assets.find(a => a.url === body.url)
  if (!asset) {
    return NextResponse.json({ error: 'url is not one of this entry\'s files' }, { status: 400 })
  }

  const project = await getProject(entry.project_id)
  if (!project) {
    return NextResponse.json({ error: `No project ${entry.project_id}` }, { status: 404 })
  }

  const { tombstoned } = await miscSources(seedMisc)
  if (tombstoned.has(asset.url)) {
    return NextResponse.json(
      { error: 'This was deleted from Misc — undelete it there rather than re-pushing.' },
      { status: 409 },
    )
  }

  try {
    const added = await publishToMisc(project, entry, asset.url, asset.kind, seedMisc)
    return NextResponse.json({ success: true, added: added ? 1 : 0 }, NO_CACHE)
  } catch (err) {
    console.error('POST /api/dailies/misc error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
