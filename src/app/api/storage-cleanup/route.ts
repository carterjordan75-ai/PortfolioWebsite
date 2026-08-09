import { NextResponse } from 'next/server'
import { list } from '@vercel/blob'
import { readJsonBlob, readVersionedJsonMeta, listBlobs, deleteBlob } from '@/lib/blobStore'
import { listProjects, listEntries } from '@/lib/dailies'
import seedAdminProjects from '../../../../public/assets/_data/admin-projects.json'
import seedPages from '../../../../data/pages.json'
import seedMisc from '../../../../data/misc.json'

/**
 * Orphan sweep. Walks admin state for referenced media URLs, lists the
 * bucket, and reports blobs that nothing points at any more.
 *
 * It DELETES NOTHING unless the caller passes `{ confirm: true }`. Opening
 * the admin panel only asks for the report; removing the files is a button
 * you press. This endpoint has destroyed live media twice by running as an
 * invisible side effect of a page load, and both times the bug was upstream
 * of the delete — a document it couldn't read, then a folder it had never
 * heard of. Nothing about that class of mistake is detectable from in here,
 * so the last line of defence is that a human sees the list first.
 *
 * Two rules keep the blast radius small:
 *
 *   SWEEPABLE — the sweep only considers folders it can actually check,
 *   i.e. ones whose contents are referenced by a document listed below.
 *   A folder it doesn't recognise is left alone and counted in `skipped`.
 *   "I don't know what this is" must never resolve to "delete it": that is
 *   exactly how every file the render PC uploaded to media/dailies/ was
 *   destroyed, because the sweep had no idea dailies state existed.
 *
 *   GRACE_HOURS — even inside a sweepable folder, a blob younger than the
 *   window is kept, so an upload that's mid-flow to being saved into state
 *   isn't taken out from under whoever is uploading it.
 *
 * Adding a new media folder means adding its state document to the refs
 * gathered in POST *and* its prefix to SWEEPABLE — in that order. Miss the
 * first and the second deletes the folder.
 */

export const dynamic = 'force-dynamic'
const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

const GRACE_HOURS = 6

/**
 * Folders whose every file is accounted for by a document read below.
 *
 * `media/dailies/` is deliberately absent. Its refs ARE gathered now, so
 * listing it here would be correct today — but it fills from an unattended
 * machine at 3am, and a sweep that runs while a project is mid-upload has
 * more ways to be wrong than a few stale renders are worth.
 */
const SWEEPABLE = ['media/projects/', 'media/Misc/', 'media/home-videos/']

function collectUrls(node: unknown, out: Set<string>): void {
  if (!node) return
  if (typeof node === 'string') {
    const isBlob = /^https?:\/\/[^/]*(vercel-storage|public\.blob\.vercel)/.test(node)
    const isLocalAsset = /^\/assets\/[^?#]+\.(jpe?g|png|gif|webp|avif|svg|mp4|webm|mov|m4v)$/i.test(node)
    if (isBlob || isLocalAsset) out.add(node)
    return
  }
  if (Array.isArray(node)) {
    for (const v of node) collectUrls(v, out)
    return
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node as Record<string, unknown>)) {
      collectUrls(v, out)
    }
  }
}

export async function POST(request: Request) {
  // Report unless explicitly told to delete. A bare POST — which is what
  // the admin panel sends — is a question, not an instruction.
  let confirm = false
  try {
    confirm = (await request.json())?.confirm === true
  } catch {
    /* no body: report only */
  }

  try {
    // 1. Gather every URL referenced by admin state.
    const [pages, miscRead, adminProjects, lookOrder] = await Promise.all([
      readJsonBlob<Record<string, unknown>>('state/pages.json', seedPages as Record<string, unknown>),
      // Versioned — /api/misc writes it that way, and reading the bare
      // path here silently returned the 9-item seed instead of the live
      // store, which made every real Misc file look like an orphan.
      readVersionedJsonMeta<{ items: unknown[] }>('state/misc.json', seedMisc as { items: unknown[] }),
      readJsonBlob<Record<string, unknown>>(
        'state/admin-projects.json',
        seedAdminProjects as Record<string, unknown>,
      ),
      readJsonBlob<string[] | null>('state/look-order.json', null),
    ])
    const misc = miscRead.value

    // A sweep that can't see the state it's checking against cannot tell
    // "orphaned" from "unreadable", and the failure mode is deleting live
    // media. If the store exists but didn't load, do nothing.
    if (!miscRead.found && (await listBlobs('state/misc')).length > 0) {
      return NextResponse.json(
        {
          error: 'Refusing to sweep: the misc store exists but could not be read.',
          deleted: 0, kept: 0, freedBytes: 0, totalBytes: 0, deletedPaths: [],
        },
        { status: 503, ...NO_CACHE },
      )
    }
    const lookMetas = await listBlobs('meta/look/')
    const lookItems = await Promise.all(
      lookMetas
        .filter(b => b.pathname.endsWith('.json'))
        .map(async b => {
          try {
            const res = await fetch(b.url, { cache: 'no-store' })
            return res.ok ? await res.json() : null
          } catch { return null }
        }),
    )
    // Dailies keeps its media in media/dailies/ and its refs in a store
    // this sweep didn't used to read at all. It isn't sweepable, so these
    // aren't load-bearing today — they're here so the day someone adds the
    // prefix to SWEEPABLE, the refs are already correct.
    const [dailiesProjects, dailiesEntries] = await Promise.all([
      listProjects(),
      listEntries(),
    ])

    const refs = new Set<string>()
    collectUrls(pages, refs)
    collectUrls(misc, refs)
    collectUrls(adminProjects, refs)
    collectUrls(lookOrder, refs)
    collectUrls(lookItems, refs)
    collectUrls(dailiesProjects, refs)
    collectUrls(dailiesEntries, refs)

    // 2. Walk every blob and decide.
    const cutoff = Date.now() - GRACE_HOURS * 60 * 60 * 1000
    let cursor: string | undefined
    let deleted = 0
    let kept = 0
    let skipped = 0
    let freedBytes = 0
    let totalBytes = 0
    const deletedPaths: string[] = []
    const skippedFolders = new Set<string>()

    do {
      const page = await list({ cursor, limit: 1000 })
      for (const b of page.blobs) {
        totalBytes += b.size
        // Infrastructure blobs (state JSON, look meta) stay forever.
        if (b.pathname.startsWith('state/') || b.pathname.startsWith('meta/')) {
          kept++
          continue
        }
        // Anything outside media/* we leave alone (e.g. legacy uploads at
        // the bucket root, public assets) — only sweep the media folder.
        if (!b.pathname.startsWith('media/')) {
          kept++
          continue
        }
        // A media folder no state document accounts for. Everything in it
        // looks unreferenced whether it's an orphan or not, so the sweep
        // has nothing to reason with and keeps its hands off.
        if (!SWEEPABLE.some(prefix => b.pathname.startsWith(prefix))) {
          kept++
          skipped++
          skippedFolders.add(b.pathname.split('/').slice(0, 2).join('/'))
          continue
        }
        // Referenced → keep.
        if (refs.has(b.url)) {
          kept++
          continue
        }
        // Grace window — never delete freshly uploaded blobs.
        const uploadedMs = b.uploadedAt ? new Date(b.uploadedAt).getTime() : NaN
        if (!Number.isFinite(uploadedMs) || uploadedMs > cutoff) {
          kept++
          continue
        }
        // Orphan + old. Report it; only remove it if that was asked for.
        if (!confirm) {
          deleted++
          freedBytes += b.size
          deletedPaths.push(b.pathname)
          continue
        }
        const ok = await deleteBlob(b.url)
        if (ok) {
          deleted++
          freedBytes += b.size
          deletedPaths.push(b.pathname)
        } else {
          kept++
        }
      }
      cursor = page.cursor
    } while (cursor)

    return NextResponse.json(
      {
        // `deleted` counts what a confirmed run WOULD remove when this was
        // only a report; `dryRun` says which of the two you're looking at.
        dryRun: !confirm,
        deleted,
        kept,
        skipped,
        skippedFolders: Array.from(skippedFolders).sort(),
        freedBytes,
        totalBytes,
        deletedPaths,
        graceHours: GRACE_HOURS,
      },
      NO_CACHE,
    )
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
