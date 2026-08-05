'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import {
  Chip, Gate, Header, Page, SCALE, STATUS_OPTIONS, STYLE_GROUPS, card, downloadAsset,
  entryAssets, field, ghostBtn, isVideoRef, label, solidBtn, uploadViaTicket,
  type Asset, type Entry, type EntryAsset, type Project, type ProjectStatus,
} from '../ui'

/**
 * One project: the standing brief, the references the PC builds from,
 * and a grid of everything it has produced.
 *
 * The entries grid is an archive: nothing here deletes, and nothing
 * reorders itself. Pieces are laid out at their own aspect ratio rather
 * than cropped into uniform cells — a 9:16 clip and a wide still are
 * both the finished thing, and squaring them off hides what they are.
 *
 * Two kinds of reference live here and they are not the same thing:
 *   references          standing material for the project — the PC pulls
 *                       these down before it starts work
 *   reference_images    pinned to one piece of feedback — "this is what
 *                       I mean", delivered with that note
 */

export default function ProjectPage() {
  return <Gate>{signOut => <Detail signOut={signOut} />}</Gate>
}

function Detail({ signOut }: { signOut: () => Promise<void> }) {
  const params = useParams<{ project: string }>()
  const router = useRouter()
  const projectId = params?.project
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [openUrl, setOpenUrl] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<string | null>(null)
  const [folder, setFolder] = useState<'wip' | 'final'>('wip')
  const [medium, setMedium] = useState<'all' | 'video' | 'still'>('all')
  const [ratio, setRatio] = useState<string>('all')
  /**
   * url → width/height, filled in as each tile's media loads.
   *
   * Aspect isn't stored anywhere — the machine never sends dimensions —
   * so it's measured off the real pixels. Filtering can only act on what
   * has loaded, which is fine: rendering is what measures it.
   */
  const [dims, setDims] = useState<Record<string, number>>({})
  const measure = useCallback((url: string, w: number, h: number) => {
    if (!w || !h) return
    setDims(prev => (prev[url] ? prev : { ...prev, [url]: w / h }))
  }, [])

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/dailies?project=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const found = (data.projects || [])[0]
      if (!found) { setMissing(true); return }
      setProject(found)
    } catch {
      /* keep whatever is on screen */
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  const toggle = (url: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })

  const endSelecting = () => { setSelecting(false); setSelected(new Set()) }

  /**
   * Delete the ticked files.
   *
   * One at a time on purpose: two files of the same entry would otherwise
   * race on the same record, and the second delete is the one that
   * removes the entry itself.
   */
  const deleteSelected = async (assets: EntryAsset[]) => {
    const chosen = assets.filter(a => selected.has(a.url))
    if (chosen.length === 0) return
    const entriesLost = new Set(
      chosen
        .filter(a => entryAssets(a.entry).every(x => selected.has(x.url)))
        .map(a => a.entry.id),
    ).size
    const tail = entriesLost > 0
      ? `\n\n${entriesLost} ${entriesLost === 1 ? 'entry loses' : 'entries lose'} every file, so ${entriesLost === 1 ? 'it goes' : 'they go'} too.`
      : ''
    if (!confirm(`Delete ${chosen.length} file${chosen.length === 1 ? '' : 's'}?${tail}\n\nThey're removed for good, and taken off Misc if they're there.`)) return

    for (let i = 0; i < chosen.length; i++) {
      const a = chosen[i]
      setDeleting(`${i + 1} of ${chosen.length}`)
      try {
        await fetch(
          `/api/dailies?id=${encodeURIComponent(a.entry.id)}&url=${encodeURIComponent(a.url)}`,
          { method: 'DELETE' },
        )
      } catch {
        /* keep going — one failure shouldn't strand the rest */
      }
    }
    setDeleting(null)
    endSelecting()
    await load()
  }

  /**
   * Empty a whole folder.
   *
   * The point is clearing WIP once the finals are in — forty passes you
   * no longer need, at the size renders come in. Whole entries go, not
   * individual files, because half an entry isn't a thing you'd want.
   */
  const deleteFolder = async (which: 'wip' | 'final') => {
    if (!project) return
    const entries = project.entries.filter(e => (e.stage || 'wip') === which)
    if (entries.length === 0) return
    const files = entries.flatMap(entryAssets).length
    const label = which === 'wip' ? 'WIP' : 'Final'
    if (!confirm(
      `Delete everything in ${label}?\n\n${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}, ${files} ${files === 1 ? 'file' : 'files'}.\n\n` +
      `Removed for good, and taken off Misc if they're there.${which === 'final' ? '' : ' Final is untouched.'}`
    )) return

    for (let i = 0; i < entries.length; i++) {
      setDeleting(`${i + 1} of ${entries.length}`)
      try {
        await fetch(`/api/dailies?id=${encodeURIComponent(entries[i].id)}`, { method: 'DELETE' })
      } catch {
        /* keep going — one failure shouldn't strand the rest */
      }
    }
    setDeleting(null)
    endSelecting()
    await load()
  }

  const removeProject = async () => {
    if (!project) return
    if (!confirm(`Delete "${project.title}" and all ${project.entry_count} of its entries? This can't be undone.`)) return
    await fetch(`/api/dailies/projects?id=${encodeURIComponent(project.id)}`, { method: 'DELETE' })
    router.push('/dailies')
  }

  if (missing) {
    return (
      <Page>
        <Header title="Not found">
          <Link href="/dailies" style={{ ...ghostBtn, textDecoration: 'none' }}>All projects</Link>
        </Header>
        <p style={{ opacity: 0.4, fontSize: 11, textAlign: 'center', padding: '60px 16px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          No project “{projectId}”
        </p>
      </Page>
    )
  }

  if (!project) {
    return (
      <Page>
        <Header title="Motion Dailies" />
        <p style={{ opacity: 0.4, fontSize: 11, textAlign: 'center', padding: '60px 16px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Loading…
        </p>
      </Page>
    )
  }

  // Every media file, flattened: a 9:16 clip and its 1:1 sheet sit side
  // by side in the lineup rather than being folded into one tile.
  const allAssets = project.entries.flatMap(entryAssets)
  const open = allAssets.find(a => a.url === openUrl) || null

  const wip = allAssets.filter(a => (a.entry.stage || 'wip') !== 'final')
  const finals = allAssets.filter(a => (a.entry.stage || 'wip') === 'final')

  // Filters only apply to FINAL — WIP is a running log, not a library.
  const inFolder = folder === 'final' ? finals : wip
  const assets = folder === 'final'
    ? inFolder.filter(a => {
        if (medium !== 'all' && (medium === 'video') !== (a.kind === 'video')) return false
        if (ratio !== 'all' && ratioBucket(dims[a.url]) !== ratio) return false
        return true
      })
    : inFolder

  return (
    <Page>
      <Header eyebrow={`${project.entry_count} ${project.entry_count === 1 ? 'entry' : 'entries'}`} title={project.title}>
        <Link href="/dailies" style={{ ...ghostBtn, textDecoration: 'none' }}>All projects</Link>
        <button onClick={load} style={ghostBtn}>{loading ? '…' : 'Refresh'}</button>
        <button onClick={signOut} style={ghostBtn}>Sign out</button>
      </Header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <Status project={project} onSaved={load} />
        <Brief project={project} onSaved={load} />
        <AssetGrid
          project={project}
          collection="references"
          heading="References — direction, not content"
          blurb="How it should feel. The PC matches these, it doesn't reuse them. Stills or clips."
          onSaved={load}
        />
        <AssetGrid
          project={project}
          collection="sources"
          heading="Source material — what it's built from"
          blurb="The actual footage and plates to work with. Stills or clips."
          onSaved={load}
        />

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ ...label, marginBottom: 0 }}>
              {folder === 'final' ? 'Final' : 'WIP'} {assets.length > 0 && `(${assets.length})`}
            </span>
            {assets.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {selecting ? (
                  <>
                    <button onClick={() => setSelected(new Set(assets.map(a => a.url)))} style={{ ...ghostBtn, padding: '5px 11px' }}>
                      All
                    </button>
                    <button
                      onClick={() => deleteSelected(assets)}
                      disabled={selected.size === 0 || !!deleting}
                      style={{
                        ...ghostBtn, padding: '5px 11px',
                        color: 'rgba(248,113,113,0.85)', borderColor: 'rgba(248,113,113,0.35)',
                        opacity: selected.size === 0 || deleting ? 0.4 : 1,
                      }}
                    >
                      {deleting ? `Deleting ${deleting}…` : `Delete ${selected.size || ''}`.trim()}
                    </button>
                    <button onClick={endSelecting} disabled={!!deleting} style={{ ...ghostBtn, padding: '5px 11px' }}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button onClick={() => setSelecting(true)} style={{ ...ghostBtn, padding: '5px 11px' }}>
                    Select
                  </button>
                )}
              </div>
            )}
          </div>
          <Folders
            folder={folder}
            onFolder={f => { setFolder(f); endSelecting() }}
            wipCount={wip.length}
            finalCount={finals.length}
            medium={medium}
            onMedium={setMedium}
            ratio={ratio}
            onRatio={setRatio}
            ratios={Array.from(new Set(finals.map(a => ratioBucket(dims[a.url])))).filter(Boolean) as string[]}
            onDeleteFolder={() => deleteFolder(folder)}
            deleting={deleting}
          />

          {project.entries.length === 0 ? (
            <p style={{ ...card, padding: 24, textAlign: 'center', fontSize: 11, opacity: 0.4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Nothing yet — the PC hasn&apos;t posted to this project.
            </p>
          ) : assets.length === 0 ? (
            <p style={{ ...card, padding: 24, textAlign: 'center', fontSize: 11, opacity: 0.4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {folder === 'final'
                ? finals.length === 0
                  ? 'No finals yet — approve the project to ask for the masters.'
                  : 'Nothing matches those filters.'
                : 'Nothing in WIP.'}
            </p>
          ) : (
            <div style={{ ...card, overflow: 'hidden' }}>
              {assets.map((asset, i) => (
                <Row
                  key={asset.url}
                  asset={asset}
                  first={i === 0}
                  selecting={selecting}
                  selected={selected.has(asset.url)}
                  ratio={dims[asset.url]}
                  // Only FINAL is filterable, so only FINAL needs measuring —
                  // no reason to pull forty WIP files just to learn their shape.
                  measurable={folder === 'final'}
                  onMeasure={measure}
                  onOpen={() => (selecting ? toggle(asset.url) : setOpenUrl(asset.url))}
                />
              ))}
            </div>
          )}
        </div>

        <button
          onClick={removeProject}
          style={{ ...ghostBtn, alignSelf: 'flex-start', color: 'rgba(248,113,113,0.5)', borderColor: 'rgba(248,113,113,0.18)' }}
        >
          Delete whole project
        </button>
      </main>

      {open && (
        <AssetOverlay asset={open} project={project} onClose={() => setOpenUrl(null)} onSaved={load} />
      )}
    </Page>
  )
}

// ── folders + filters ───────────────────────────────────────────────

/**
 * Aspect buckets, named after the delivery formats.
 *
 * Generous tolerances: a master trimmed to 1918x1080 is still 16:9, and
 * calling it "Other" would be pedantic and useless.
 */
function ratioBucket(r: number | undefined): string | null {
  if (!r || !isFinite(r)) return null
  if (r > 1.6 && r < 2.0) return '16:9'
  if (r > 0.5 && r < 0.65) return '9:16'
  if (r > 0.9 && r < 1.11) return '1:1'
  return r >= 1 ? 'Other landscape' : 'Other portrait'
}

function Folders({
  folder, onFolder, wipCount, finalCount, medium, onMedium, ratio, onRatio, ratios,
  onDeleteFolder, deleting,
}: {
  folder: 'wip' | 'final'
  onFolder: (f: 'wip' | 'final') => void
  wipCount: number
  finalCount: number
  medium: 'all' | 'video' | 'still'
  onMedium: (m: 'all' | 'video' | 'still') => void
  ratio: string
  onRatio: (r: string) => void
  ratios: string[]
  onDeleteFolder: () => void
  deleting: string | null
}) {
  const tab = (id: 'wip' | 'final', text: string, count: number) => {
    const on = folder === id
    return (
      <button
        key={id}
        onClick={() => onFolder(id)}
        style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
          padding: '8px 15px', borderRadius: 999, cursor: 'pointer',
          background: on ? '#fff' : 'transparent',
          color: on ? '#000' : 'rgba(255,255,255,0.6)',
          border: `1px solid ${on ? '#fff' : 'rgba(255,255,255,0.18)'}`,
        }}
      >
        {text} <span style={{ opacity: 0.5 }}>{count}</span>
      </button>
    )
  }

  const pill = (on: boolean, text: string, onClick: () => void) => (
    <button
      key={text}
      onClick={onClick}
      style={{
        fontSize: 10, padding: '6px 11px', borderRadius: 999, cursor: 'pointer',
        background: on ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.05)',
        color: on ? '#000' : 'rgba(255,255,255,0.7)',
        border: `1px solid ${on ? '#fff' : 'rgba(255,255,255,0.14)'}`,
        fontWeight: on ? 700 : 400,
      }}
    >
      {text}
    </button>
  )

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {tab('wip', 'WIP', wipCount)}
        {tab('final', 'Final', finalCount)}
        {(folder === 'wip' ? wipCount : finalCount) > 0 && (
          <button
            onClick={onDeleteFolder}
            disabled={!!deleting}
            style={{
              ...ghostBtn, marginLeft: 'auto', padding: '6px 11px',
              color: 'rgba(248,113,113,0.6)', borderColor: 'rgba(248,113,113,0.22)',
              opacity: deleting ? 0.5 : 1,
            }}
          >
            {deleting ? `Deleting ${deleting}…` : `Empty ${folder === 'wip' ? 'WIP' : 'Final'}`}
          </button>
        )}
      </div>

      {/* Filters belong to Final only — WIP is a running log, not a library. */}
      {folder === 'final' && finalCount > 0 && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ ...label, marginBottom: 0, opacity: 0.35 }}>Medium</span>
            {pill(medium === 'all', 'All', () => onMedium('all'))}
            {pill(medium === 'video', 'Video', () => onMedium('video'))}
            {pill(medium === 'still', 'Still', () => onMedium('still'))}
          </div>
          {ratios.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ ...label, marginBottom: 0, opacity: 0.35 }}>Ratio</span>
              {pill(ratio === 'all', 'All', () => onRatio('all'))}
              {ratios.map(r => pill(ratio === r, r, () => onRatio(r)))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── list row ────────────────────────────────────────────────────────

/**
 * What to call the file in the list.
 *
 * The stored blob is always video.mp4 or contact.png — the path carries
 * the identity, not the filename — so those are useless as names. The
 * entry's title is the real one; the extension keeps it obvious what
 * kind of file it is.
 */
const displayName = (entry: Entry, url: string, kind: 'video' | 'still') => {
  const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase()
  const base = (entry.title || '').trim()
  if (!base) return url.split('?')[0].split('/').pop() || 'file'
  const suffix = kind === 'video' ? 'mp4' : ext || 'png'
  return `${base.replace(/\s+/g, '_')}.${suffix}`
}

/**
 * One file, one line: name, what it is, when it arrived.
 *
 * A list beats a grid once a project holds forty passes — you scan names,
 * not thumbnails. Nothing here loads the media, so a long WIP folder
 * costs nothing to open; FINAL renders an offscreen probe because its
 * ratio filter has to measure real pixels.
 */
function Row({
  asset, first, selecting, selected, ratio, measurable, onMeasure, onOpen,
}: {
  asset: EntryAsset
  first: boolean
  selecting: boolean
  selected: boolean
  ratio?: number
  measurable: boolean
  onMeasure: (url: string, w: number, h: number) => void
  onOpen: () => void
}) {
  const { entry, url, kind } = asset
  const onMisc = entry.in_misc_urls.includes(url)
  const bucket = ratioBucket(ratio)
  const when = new Date(entry.created_at)

  return (
    <div
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer',
        padding: '11px 13px',
        borderTop: first ? 'none' : '1px solid rgba(255,255,255,0.07)',
        background: selected ? 'rgba(255,255,255,0.07)' : 'transparent',
      }}
    >
      {selecting && (
        <span style={{
          flexShrink: 0, width: 17, height: 17, borderRadius: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, lineHeight: 1,
          background: selected ? '#fff' : 'transparent',
          color: selected ? '#000' : 'transparent',
          border: `1.5px solid ${selected ? '#fff' : 'rgba(255,255,255,0.35)'}`,
        }}>
          ✓
        </span>
      )}

      <span style={{ flexShrink: 0, width: 13, textAlign: 'center', fontSize: 10, opacity: 0.45 }}>
        {kind === 'video' ? '▶' : '▣'}
      </span>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, lineHeight: 1.35,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {displayName(entry, url, kind)}
        </div>
        <div style={{ fontSize: 9, letterSpacing: '0.09em', textTransform: 'uppercase', opacity: 0.35, marginTop: 2 }}>
          {kind === 'video' ? 'Video' : 'Still'}
          {bucket && ` · ${bucket}`}
          {onMisc && ' · on misc'}
          {!entry.feedback && ' · awaiting'}
        </div>
      </div>

      <span style={{ flexShrink: 0, fontSize: 10, opacity: 0.4, textAlign: 'right', lineHeight: 1.3 }}>
        {when.toLocaleDateString([], { day: '2-digit', month: 'short' })}
        <br />
        <span style={{ opacity: 0.7 }}>{when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </span>

      {/* Offscreen, and only where the ratio filter needs it. */}
      {measurable && !ratio && (
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
          {kind === 'video' ? (
            <video
              src={`${url}#t=0.1`}
              muted
              preload="metadata"
              onLoadedMetadata={e => onMeasure(url, e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" onLoad={e => onMeasure(url, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} />
          )}
        </span>
      )}
    </div>
  )
}

// ── asset overlay ───────────────────────────────────────────────────

/** One media file, full size, with the entry's feedback attached. */
function AssetOverlay({
  asset, project, onClose, onSaved,
}: { asset: EntryAsset; project: Project; onClose: () => void; onSaved: () => void }) {
  const { entry, url, kind } = asset
  useEscapeToClose(true, onClose)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(6,6,6,0.9)',
        backdropFilter: 'blur(8px)', overflowY: 'auto', padding: '18px 12px 40px',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      }}
    >
      {/* Fixed, so it stays reachable however far down the form you scroll.
          Clicking the space around the panel and Escape both work too. */}
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position: 'fixed', top: 14, right: 14, zIndex: 60,
          width: 38, height: 38, borderRadius: 999, cursor: 'pointer',
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)',
          color: '#fff', fontSize: 17, lineHeight: 1, backdropFilter: 'blur(6px)',
        }}
      >
        ×
      </button>

      <div
        onClick={e => e.stopPropagation()}
        style={{ ...card, width: '100%', maxWidth: 760, background: '#0d0d0d' }}
      >
        <div style={{
          padding: '13px 15px', display: 'flex', alignItems: 'baseline',
          justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.45 }}>
              {kind === 'video' ? 'Video' : 'Still'} · {entry.date}
            </p>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginTop: 3 }}>{entry.title || 'Untitled'}</h3>
          </div>
          <Chip tone={entry.feedback ? 'green' : 'grey'}>{entry.feedback ? 'Feedback sent' : 'Awaiting'}</Chip>
        </div>

        {kind === 'video' ? (
          <Player entry={entry} url={url} project={project} onSaved={onSaved} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" style={{ width: '100%', display: 'block', background: '#000' }} />
        )}

        <div style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <DownloadButton
              url={url}
              filename={`${entry.title || entry.id}${kind === 'video' ? '.mp4' : '.png'}`}
              labelText={kind === 'video' ? 'Download video' : 'Download still'}
            />
          </div>

          <MiscButton entry={entry} url={url} onSaved={onSaved} />
          <DeleteAsset asset={asset} onClose={onClose} onSaved={onSaved} />

          {entry.note && (
            <div>
              <span style={label}>Note</span>
              <p style={{ fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', opacity: 0.9 }}>{entry.note}</p>
            </div>
          )}

          <FeedbackForm entry={entry} projectId={project.id} onSaved={onSaved} />
        </div>
      </div>
    </div>
  )
}

/**
 * Removing a file is deliberate: it's behind a confirm, it names what
 * goes, and it lives at the bottom rather than beside the buttons you
 * press every day. Deleting the entry's last file takes the entry too.
 */
function DeleteAsset({
  asset, onClose, onSaved,
}: { asset: EntryAsset; onClose: () => void; onSaved: () => void }) {
  const { entry, url, kind } = asset
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const last = entryAssets(entry).length === 1

  const remove = async () => {
    const what = kind === 'video' ? 'video' : 'still'
    const extra = last ? ' This is the only file on it, so the entry goes too.' : ''
    if (!confirm(`Delete the ${what} from “${entry.title || 'Untitled'}”?${extra}\n\nThe file is removed for good, and taken off Misc if it's there.`)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/dailies?id=${encodeURIComponent(entry.id)}&url=${encodeURIComponent(url)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`)
      onClose()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        style={{ ...ghostBtn, color: 'rgba(248,113,113,0.6)', borderColor: 'rgba(248,113,113,0.22)', opacity: busy ? 0.5 : 1 }}
      >
        {busy ? 'Deleting…' : `Delete this ${kind === 'video' ? 'video' : 'still'}`}
      </button>
      {error && <span style={{ fontSize: 10, color: '#f87171' }}>{error}</span>}
    </div>
  )
}

function DownloadButton({ url, filename, labelText }: { url: string; filename: string; labelText: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!url) return null

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        setError(null)
        try {
          await downloadAsset(url, filename)
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setBusy(false)
          setTimeout(() => setError(null), 4000)
        }
      }}
      style={{ ...ghostBtn, opacity: busy ? 0.5 : 1 }}
    >
      {busy ? 'Saving…' : error ? `✗ ${error}` : labelText}
    </button>
  )
}

/**
 * The player, plus "use this frame as the project hero".
 *
 * The frame is grabbed straight off the <video> into a canvas. That only
 * works because Blob serves these with `access-control-allow-origin: *`
 * and the element sets crossOrigin — without both, the canvas would be
 * tainted and toBlob() would throw a security error.
 */
function Player({ entry, url, project, onSaved }: { entry: Entry; url: string; project: Project; onSaved: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const useFrame = async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) {
      setStatus('✗ Let the video load first')
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no canvas context')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.92))
      if (!blob) throw new Error('could not read that frame')

      const url = await uploadViaTicket(blob as Blob & { name?: string }, {
        project_id: project.id, kind: 'hero',
      })
      await fetch('/api/dailies/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The hero sits at a fixed path so replacing it doesn't strand the
        // old file — which means the URL never changes and the browser
        // would keep showing the previous frame. The version marker is
        // what actually makes the swap visible.
        body: JSON.stringify({ id: project.id, hero_url: `${url}?v=${Date.now()}` }),
      })
      setStatus('✓ Hero set')
      onSaved()
    } catch (err) {
      setStatus(`✗ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
      setTimeout(() => setStatus(null), 4000)
    }
  }

  return (
    <div>
      <video
        ref={videoRef}
        src={url}
        controls
        playsInline
        crossOrigin="anonymous"
        preload="metadata"
        poster={entry.contact_sheet_url || undefined}
        style={{ width: '100%', display: 'block', background: '#000', maxHeight: '58vh' }}
      />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap',
        padding: '10px 15px', borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <button onClick={useFrame} disabled={busy} style={{ ...ghostBtn, opacity: busy ? 0.5 : 1 }}>
          {busy ? 'Setting…' : 'Use this frame as hero'}
        </button>
        <span style={{ fontSize: 10, opacity: 0.35, lineHeight: 1.4 }}>
          Scrub to the frame you want, then press this.
        </span>
        {status && (
          <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: status.startsWith('✓') ? 'rgb(74,222,128)' : '#f87171' }}>
            {status}
          </span>
        )}
      </div>
    </div>
  )
}

function MiscButton({ entry, url, onSaved }: { entry: Entry; url: string; onSaved: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const push = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/dailies/misc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_id: entry.id, url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (entry.in_misc_urls.includes(url)) {
    return (
      <p style={{ fontSize: 11, opacity: 0.5, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Chip tone="green">On Misc</Chip>
        <a href="/misc" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>View</a>
      </p>
    )
  }

  if (entry.misc_removed_urls.includes(url)) {
    return (
      <p style={{ fontSize: 11, opacity: 0.4, lineHeight: 1.5 }}>
        You deleted this from Misc. Restore it there rather than pushing again.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
      <button onClick={push} disabled={busy} style={{ ...ghostBtn, opacity: busy ? 0.5 : 1 }}>
        {busy ? 'Pushing…' : 'Push to Misc'}
      </button>
      <span style={{ fontSize: 10, opacity: 0.35 }}>Publishes it to the public Misc page, tagged generative.</span>
      {error && <span style={{ fontSize: 10, color: '#f87171' }}>{error}</span>}
    </div>
  )
}

// ── status ──────────────────────────────────────────────────────────

/**
 * The queue control. The machine works on the oldest project marked
 * "In progress" and nothing else, so marking this one Done is what
 * releases it to the next — and a project sitting in "Not started" is
 * one you can gather a brief and references for at your own pace.
 */
function Status({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState(false)

  const save = async (status: ProjectStatus) => {
    setSaving(true)
    try {
      await fetch('/api/dailies/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project.id, status }),
      })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const change = async (status: ProjectStatus) => {
    // Finishing asks what to publish rather than sending everything: an
    // overnight run makes plenty that shouldn't go on the public site.
    const publishable = project.entries
      .flatMap(entryAssets)
      .filter(a => !a.entry.in_misc_urls.includes(a.url) && !a.entry.misc_removed_urls.includes(a.url))
    if (status === 'done' && publishable.length > 0) {
      setPicking(true)
      return
    }
    await save(status)
  }

  // "In progress" doesn't mean "being worked on" if something older is
  // still open, so the queued warning replaces the generic hint.
  const queued = project.status === 'active' && !project.is_current
  const hint = queued ? null : STATUS_OPTIONS.find(o => o.value === project.status)?.hint

  return (
    <section style={{ ...card, padding: 15 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          {project.hero_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.hero_url}
              alt="Project hero"
              style={{ width: 54, height: 34, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(255,255,255,0.14)' }}
            />
          )}
          <span style={{ ...label, marginBottom: 0 }}>Status</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {project.is_current && <Chip tone="green">PC is on this</Chip>}
          <select
            value={project.status}
            disabled={saving}
            onChange={e => change(e.target.value as ProjectStatus)}
            style={{
              ...field, width: 'auto', padding: '9px 12px', cursor: 'pointer',
              // Native select menus render their options in the OS palette;
              // without this the list is white-on-white on some browsers.
              colorScheme: 'dark',
            }}
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      {hint && (
        <p style={{ fontSize: 11, opacity: 0.45, marginTop: 10, lineHeight: 1.5 }}>
          {saving ? 'Saving…' : hint}
        </p>
      )}
      {queued && (
        <p style={{ fontSize: 11, marginTop: 10, lineHeight: 1.5, color: 'rgb(252,211,77)' }}>
          {saving ? 'Saving…' : 'Queued behind an earlier project — the PC starts this once that one is marked Done.'}
        </p>
      )}
      {project.delivery?.requested_at && !project.delivery?.done_at && (
        <p style={{ fontSize: 11, marginTop: 10, lineHeight: 1.5, color: 'rgb(252,211,77)' }}>
          Final masters requested — 16:9, 9:16 and 1:1, each recomposed to fit,
          plus a 1:1 contact sheet. The PC stays on this until they land.
        </p>
      )}
      {project.delivery?.done_at && (
        <p style={{ fontSize: 11, marginTop: 10, lineHeight: 1.5, color: 'rgb(74,222,128)' }}>
          Final masters delivered.
        </p>
      )}

      {picking && (
        <PublishPicker
          project={project}
          onCancel={() => setPicking(false)}
          onDone={async () => { setPicking(false); await save('done') }}
        />
      )}
    </section>
  )
}

/** Asked when you finish a project: which pieces go public? */
function PublishPicker({
  project, onCancel, onDone,
}: { project: Project; onCancel: () => void; onDone: () => Promise<void> }) {
  const candidates = project.entries
    .flatMap(entryAssets)
    .filter(a => !a.entry.in_misc_urls.includes(a.url) && !a.entry.misc_removed_urls.includes(a.url))
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEscapeToClose(true, onCancel)

  const toggle = (id: string) =>
    setChosen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const finish = async () => {
    setBusy(true)
    setError(null)
    try {
      for (const url of Array.from(chosen)) {
        const asset = candidates.find(a => a.url === url)
        if (!asset) continue
        const res = await fetch('/api/dailies/misc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entry_id: asset.entry.id, url }),
        })
        if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`)
      }
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(6,6,6,0.9)',
        backdropFilter: 'blur(8px)', overflowY: 'auto', padding: '24px 12px 40px',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 620, background: '#0d0d0d', padding: 18 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800 }}>Finishing “{project.title}”</h3>
        <p style={{ fontSize: 12, opacity: 0.55, marginTop: 7, lineHeight: 1.6 }}>
          Which pieces should go on the public Misc page, tagged generative?
          Everything stays in the archive here either way.
        </p>

        <div style={{ display: 'flex', gap: 8, margin: '14px 0 10px' }}>
          <button type="button" onClick={() => setChosen(new Set(candidates.map(a => a.url)))} style={{ ...ghostBtn, padding: '5px 11px' }}>
            Select all
          </button>
          <button type="button" onClick={() => setChosen(new Set())} style={{ ...ghostBtn, padding: '5px 11px' }}>
            Clear
          </button>
        </div>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
          {candidates.map(asset => {
            const entry = asset.entry
            const on = chosen.has(asset.url)
            return (
              <button
                key={asset.url}
                type="button"
                onClick={() => toggle(asset.url)}
                style={{
                  padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit',
                  borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.03)',
                  border: `2px solid ${on ? '#fff' : 'rgba(255,255,255,0.12)'}`,
                }}
              >
                <div style={{ position: 'relative', background: '#000' }}>
                  {asset.kind === 'video' ? (
                    <video src={`${asset.url}#t=0.1`} muted playsInline preload="metadata"
                      style={{ width: '100%', height: 78, objectFit: 'cover', display: 'block', opacity: on ? 1 : 0.5 }} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.url} alt="" style={{ width: '100%', height: 78, objectFit: 'cover', display: 'block', opacity: on ? 1 : 0.5 }} />
                  )}
                  {on && (
                    <span style={{
                      position: 'absolute', top: 5, right: 5, width: 18, height: 18, borderRadius: 999,
                      background: '#fff', color: '#000', fontSize: 11, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>✓</span>
                  )}
                </div>
                <span style={{ display: 'block', padding: '7px 9px', fontSize: 11, fontWeight: 600 }}>
                  {entry.title || 'Untitled'}
                  <span style={{ opacity: 0.4, fontWeight: 400 }}> · {asset.kind === 'video' ? 'video' : 'still'}</span>
                </span>
              </button>
            )
          })}
        </div>

        {error && <p style={{ color: '#f87171', fontSize: 11, marginTop: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={finish} disabled={busy} style={{ ...solidBtn, opacity: busy ? 0.5 : 1 }}>
            {busy
              ? 'Publishing…'
              : chosen.size === 0
                ? 'Mark done, publish nothing'
                : `Publish ${chosen.size} & mark done`}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} style={ghostBtn}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── brief ───────────────────────────────────────────────────────────

function Brief({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [brief, setBrief] = useState(project.brief)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setBrief(project.brief) }, [project.brief])

  const save = async () => {
    setSaving(true)
    try {
      await fetch('/api/dailies/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project.id, brief }),
      })
      setEditing(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section style={{ ...card, padding: 15 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span style={label}>Brief — what the PC is building</span>
        <button onClick={() => setEditing(e => !e)} style={{ ...ghostBtn, padding: '4px 10px' }}>
          {editing ? 'Cancel' : project.brief ? 'Edit' : 'Add'}
        </button>
      </div>
      {editing ? (
        <>
          <textarea
            rows={5}
            value={brief}
            onChange={e => setBrief(e.target.value)}
            placeholder="Standing direction — what this project is, the look, the constraints…"
            style={{ ...field, resize: 'vertical', marginBottom: 10 }}
          />
          <button onClick={save} disabled={saving} style={{ ...solidBtn, opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save brief'}
          </button>
        </>
      ) : (
        <p style={{ fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', opacity: project.brief ? 0.85 : 0.35 }}>
          {project.brief || 'No brief yet.'}
        </p>
      )}
      <Styles project={project} onSaved={onSaved} />
    </section>
  )
}

/**
 * What KIND of thing this is.
 *
 * Prose is easy to be vague in. "Character Animation" + "Houdini" tells
 * the machine the shape of the job before it reads a word of the brief,
 * and most real work is a discipline plus a tool plus a look — so it's
 * a picker that accumulates, not a single choice.
 */
function Styles({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const chosen = project.styles || []
  const [saving, setSaving] = useState(false)

  const save = async (styles: string[]) => {
    setSaving(true)
    try {
      await fetch('/api/dailies/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project.id, styles }),
      })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12 }}>
      <span style={label}>Style {chosen.length > 0 && `(${chosen.length})`}</span>

      {chosen.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {chosen.map(st => (
            <button
              key={st}
              type="button"
              onClick={() => save(chosen.filter(x => x !== st))}
              title="Remove"
              style={{
                fontSize: 10, padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
                background: 'rgba(255,255,255,0.9)', color: '#000', border: 'none', fontWeight: 600,
              }}
            >
              {st} <span style={{ opacity: 0.45 }}>×</span>
            </button>
          ))}
        </div>
      )}

      <select
        value=""
        disabled={saving}
        onChange={e => {
          const v = e.target.value
          if (v && !chosen.includes(v)) save([...chosen, v])
          e.target.value = ''
        }}
        style={{
          ...field, width: 'auto', maxWidth: '100%', padding: '8px 11px', fontSize: 12,
          cursor: 'pointer', colorScheme: 'dark',
        }}
      >
        <option value="">{saving ? 'Saving…' : '+ Add a style'}</option>
        {STYLE_GROUPS.map(g => (
          <optgroup key={g.group} label={g.group}>
            {g.styles.filter(st => !chosen.includes(st)).map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

// ── references ──────────────────────────────────────────────────────

function AssetGrid({
  project, collection, heading, blurb, onSaved,
}: {
  project: Project
  collection: 'references' | 'sources'
  heading: string
  blurb: string
  onSaved: () => void
}) {
  const items = project[collection] || []
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [resolving, setResolving] = useState(false)

  const persist = async (next: Asset[]) => {
    await fetch('/api/dailies/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: project.id, [collection]: next }),
    })
    onSaved()
  }

  const add = async (files: FileList) => {
    setUploading(true)
    setStatus(null)
    try {
      const added: Asset[] = []
      for (const file of Array.from(files)) {
        const url = await uploadViaTicket(file, {
          project_id: project.id,
          kind: collection === 'sources' ? 'source' : 'reference',
        })
        added.push({
          url,
          filename: file.name,
          note: '',
          type: file.type.startsWith('video/') ? 'video' : 'image',
          added_at: new Date().toISOString(),
        })
      }
      await persist([...items, ...added])
      setStatus(`✓ ${added.length} added`)
    } catch (err) {
      setStatus(`✗ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
      setTimeout(() => setStatus(null), 5000)
    }
  }

  /**
   * Paste a board or a page instead of uploading files.
   *
   * The server resolves it: a Pinterest board expands into its pins, so
   * one paste becomes many references; anything else keeps its title and
   * cover. The link is always stored, so an agent with web access can go
   * and look properly.
   */
  const addLink = async () => {
    const raw = linkUrl.trim()
    if (!raw) return
    setResolving(true)
    setStatus(null)
    try {
      const res = await fetch('/api/dailies/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: raw }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const link = data.link
      await persist([
        ...items,
        {
          url: link.url,
          filename: link.title || link.url,
          note: '',
          type: 'link' as const,
          title: link.title,
          preview_url: link.preview_url || undefined,
          images: link.images || [],
          added_at: new Date().toISOString(),
        },
      ])
      setLinkUrl('')
      setStatus(
        link.images?.length
          ? `✓ added — ${link.images.length} images pulled in`
          : '✓ link added',
      )
    } catch (err) {
      setStatus(`✗ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setResolving(false)
      setTimeout(() => setStatus(null), 6000)
    }
  }

  const remove = (url: string) => persist(items.filter(r => r.url !== url))

  const setNote = (url: string, note: string) =>
    persist(items.map(r => (r.url === url ? { ...r, note } : r)))

  return (
    <section style={{ ...card, padding: 15 }}>
      <span style={label}>
        {heading} {items.length > 0 && `(${items.length})`}
      </span>

      {items.length > 0 && (
        <div style={{
          display: 'grid', gap: 10, marginBottom: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
        }}>
          {items.map(ref => (
            <figure key={ref.url} style={{ position: 'relative', margin: 0 }}>
              {ref.type === 'link' ? (
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                >
                  <div style={{
                    width: '100%', aspectRatio: '1 / 1', borderRadius: 8, overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                  }}>
                    {ref.preview_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ref.preview_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 18, opacity: 0.4 }}>↗</span>
                    )}
                    {!!ref.images?.length && (
                      <span style={{
                        position: 'absolute', left: 6, bottom: 6, fontSize: 8, fontWeight: 800,
                        letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 7px',
                        borderRadius: 999, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
                      }}>
                        {ref.images.length} images
                      </span>
                    )}
                  </div>
                  <span style={{
                    display: 'block', fontSize: 10, lineHeight: 1.4, marginTop: 5, opacity: 0.7,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    ↗ {ref.title || ref.url}
                  </span>
                </a>
              ) : isVideoRef(ref) ? (
                <video
                  src={ref.url}
                  controls
                  muted
                  playsInline
                  preload="metadata"
                  style={{
                    width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block',
                    borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', background: '#000',
                  }}
                />
              ) : (
                <a href={ref.url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ref.url}
                    alt={ref.filename}
                    style={{
                      width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block',
                      borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)',
                    }}
                  />
                </a>
              )}
              <button
                type="button"
                onClick={() => remove(ref.url)}
                aria-label={`Remove ${ref.filename}`}
                style={{
                  position: 'absolute', top: -6, right: -6, width: 20, height: 20,
                  borderRadius: 999, border: 'none', cursor: 'pointer', zIndex: 1,
                  background: 'rgba(248,113,113,0.95)', color: '#fff', fontSize: 12, lineHeight: 1,
                }}
              >
                ×
              </button>
              <input
                defaultValue={ref.note}
                onBlur={e => { if (e.target.value !== ref.note) setNote(ref.url, e.target.value) }}
                placeholder="Note…"
                style={{ ...field, padding: '5px 8px', fontSize: 10, marginTop: 5, borderRadius: 6 }}
              />
              {ref.type !== 'link' && (
                <button
                  type="button"
                  onClick={() => downloadAsset(ref.url, ref.filename)}
                  style={{ ...ghostBtn, width: '100%', marginTop: 4, padding: '4px 8px', fontSize: 8 }}
                >
                  Download
                </button>
              )}
            </figure>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          disabled={uploading}
          onChange={e => { if (e.target.files?.length) add(e.target.files); e.target.value = '' }}
          style={{ fontSize: 11, opacity: uploading ? 0.5 : 0.75 }}
        />
        {uploading && <span style={{ fontSize: 10, opacity: 0.6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Uploading…</span>}
        {status && (
          <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: status.startsWith('✓') ? 'rgb(74,222,128)' : '#f87171' }}>
            {status}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <input
          value={linkUrl}
          onChange={e => setLinkUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
          placeholder="…or paste a link — Pinterest board, Cosmos, any page"
          style={{ ...field, flex: '1 1 220px', width: 'auto', fontSize: 12 }}
        />
        <button
          type="button"
          onClick={addLink}
          disabled={resolving || !linkUrl.trim()}
          style={{ ...ghostBtn, opacity: resolving || !linkUrl.trim() ? 0.4 : 1 }}
        >
          {resolving ? 'Reading…' : 'Add link'}
        </button>
      </div>

      <p style={{ fontSize: 10, opacity: 0.3, marginTop: 8, lineHeight: 1.5 }}>{blurb}</p>
    </section>
  )
}

// ── feedback ────────────────────────────────────────────────────────

function FeedbackForm({
  entry, projectId, onSaved,
}: { entry: Entry; projectId: string; onSaved: () => void }) {
  const existing = entry.feedback
  const [answers, setAnswers] = useState<Record<string, string | number>>(existing?.answers || {})
  const [brief, setBrief] = useState(existing?.brief || '')
  const [renderMaster, setRenderMaster] = useState(existing?.render_master ?? false)
  const [refUrls, setRefUrls] = useState<string[]>(existing?.reference_images || [])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const uploadRefs = async (files: FileList) => {
    setUploading(true)
    setStatus(null)
    try {
      const uploaded: string[] = []
      for (const file of Array.from(files)) {
        uploaded.push(await uploadViaTicket(file, { project_id: projectId, kind: 'reference' }))
      }
      setRefUrls(prev => [...prev, ...uploaded])
      setStatus(`✓ ${uploaded.length} attached`)
    } catch (err) {
      setStatus(`✗ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
      setTimeout(() => setStatus(null), 5000)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_id: entry.id, answers, brief,
          reference_images: refUrls, render_master: renderMaster,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setStatus('✓ Feedback saved')
      onSaved()
    } catch (err) {
      setStatus(`✗ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
      setTimeout(() => setStatus(null), 4000)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 15, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 15 }}>
      {entry.questions.map(q => (
        <div key={q.id}>
          <span style={label}>{q.prompt}</span>
          {q.type === 'text' && (
            <textarea
              rows={3}
              value={String(answers[q.id] ?? '')}
              onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
              style={{ ...field, resize: 'vertical' }}
            />
          )}
          {q.type === 'choice' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {(q.options || []).map(opt => {
                const on = answers[q.id] === opt
                return (
                  <button
                    key={opt} type="button"
                    onClick={() => setAnswers(a => ({ ...a, [q.id]: opt }))}
                    style={{
                      fontSize: 11, padding: '8px 13px', borderRadius: 999, cursor: 'pointer',
                      background: on ? '#fff' : 'rgba(255,255,255,0.05)',
                      color: on ? '#000' : 'rgba(255,255,255,0.8)',
                      border: `1px solid ${on ? '#fff' : 'rgba(255,255,255,0.16)'}`,
                      fontWeight: on ? 700 : 400,
                    }}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          )}
          {q.type === 'scale' && (
            <div style={{ display: 'flex', gap: 7 }}>
              {SCALE.map(n => {
                const on = Number(answers[q.id]) === n
                return (
                  <button
                    key={n} type="button"
                    onClick={() => setAnswers(a => ({ ...a, [q.id]: n }))}
                    style={{
                      width: 42, height: 42, borderRadius: 10, fontSize: 13, cursor: 'pointer',
                      background: on ? '#fff' : 'rgba(255,255,255,0.05)',
                      color: on ? '#000' : 'rgba(255,255,255,0.8)',
                      border: `1px solid ${on ? '#fff' : 'rgba(255,255,255,0.16)'}`,
                      fontWeight: on ? 800 : 400,
                    }}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ))}

      <div>
        <span style={label}>Brief — direction / requests</span>
        <textarea
          rows={4}
          value={brief}
          onChange={e => setBrief(e.target.value)}
          placeholder="Where to take it next…"
          style={{ ...field, resize: 'vertical' }}
        />
      </div>

      <div>
        <span style={label}>Reference images {refUrls.length > 0 && `(${refUrls.length})`}</span>
        {refUrls.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 9 }}>
            {refUrls.map(url => (
              <div key={url} style={{ position: 'relative' }}>
                {isVideoRef({ url }) ? (
                  <video src={url} muted playsInline preload="metadata" style={{ width: 62, height: 62, objectFit: 'cover', borderRadius: 7, border: '1px solid rgba(255,255,255,0.14)', background: '#000' }} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" style={{ width: 62, height: 62, objectFit: 'cover', borderRadius: 7, border: '1px solid rgba(255,255,255,0.14)' }} />
                )}
                <button
                  type="button"
                  onClick={() => setRefUrls(prev => prev.filter(u => u !== url))}
                  style={{
                    position: 'absolute', top: -6, right: -6, width: 19, height: 19,
                    borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: 'rgba(248,113,113,0.95)', color: '#fff', fontSize: 11, lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          type="file" accept="image/*,video/*" multiple disabled={uploading}
          onChange={e => { if (e.target.files?.length) uploadRefs(e.target.files); e.target.value = '' }}
          style={{ fontSize: 11, opacity: uploading ? 0.5 : 0.75 }}
        />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
        <input type="checkbox" checked={renderMaster} onChange={e => setRenderMaster(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#fff' }} />
        <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 }}>
          Render full-quality master
        </span>
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="submit" disabled={saving || uploading}
          style={{ ...solidBtn, cursor: saving || uploading ? 'default' : 'pointer', opacity: saving || uploading ? 0.5 : 1 }}
        >
          {saving ? 'Saving…' : existing ? 'Update feedback' : 'Send feedback'}
        </button>
        {status && (
          <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: status.startsWith('✓') ? 'rgb(74,222,128)' : '#f87171' }}>
            {status}
          </span>
        )}
        {uploading && (
          <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.6 }}>Uploading…</span>
        )}
      </div>

      {existing && (
        <p style={{ fontSize: 9, opacity: 0.35, letterSpacing: '0.06em' }}>
          Last submitted {new Date(existing.submitted_at).toLocaleString()}
        </p>
      )}
    </form>
  )
}
