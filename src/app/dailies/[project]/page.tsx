'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import {
  Chip, Gate, Header, Page, SCALE, STATUS_OPTIONS, card, field, ghostBtn, isVideoRef,
  label, solidBtn, uploadViaTicket,
  type Entry, type Project, type ProjectStatus, type Reference,
} from '../ui'

/**
 * One project: the standing brief, the references the PC builds from,
 * and a grid of everything it has produced.
 *
 * Entries are a scrollable grid rather than a stack of full cards — an
 * overnight run makes dozens, and stacked players make that unreadable.
 * Tapping a tile opens the piece with its feedback form.
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
  const [openId, setOpenId] = useState<string | null>(null)

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

  const open = project.entries.find(e => e.id === openId) || null

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
        <References project={project} onSaved={load} />

        <div>
          <span style={{ ...label, marginBottom: 12 }}>
            Entries {project.entries.length > 0 && `(${project.entries.length})`}
          </span>
          {project.entries.length === 0 ? (
            <p style={{ ...card, padding: 24, textAlign: 'center', fontSize: 11, opacity: 0.4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Nothing yet — the PC hasn&apos;t posted to this project.
            </p>
          ) : (
            <div style={{
              display: 'grid', gap: 12,
              gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
            }}>
              {project.entries.map(entry => (
                <Tile key={entry.id} entry={entry} onOpen={() => setOpenId(entry.id)} />
              ))}
            </div>
          )}
        </div>

        <button
          onClick={removeProject}
          style={{ ...ghostBtn, alignSelf: 'flex-start', color: 'rgba(248,113,113,0.8)', borderColor: 'rgba(248,113,113,0.3)' }}
        >
          Delete project
        </button>
      </main>

      {open && (
        <EntryOverlay
          entry={open}
          project={project}
          onClose={() => setOpenId(null)}
          onSaved={load}
        />
      )}
    </Page>
  )
}

// ── grid tile ───────────────────────────────────────────────────────

function Tile({ entry, onOpen }: { entry: Entry; onOpen: () => void }) {
  const poster = entry.contact_sheet_url
  return (
    <button
      onClick={onOpen}
      style={{
        ...card, padding: 0, textAlign: 'left', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', color: 'inherit', font: 'inherit',
      }}
    >
      <div style={{
        position: 'relative', aspectRatio: '16 / 10', background: 'rgba(255,255,255,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : entry.video_url ? (
          // No contact sheet, so let the browser paint the first frame.
          <video
            src={`${entry.video_url}#t=0.1`}
            muted
            playsInline
            preload="metadata"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <span style={{ fontSize: 9, opacity: 0.3, letterSpacing: '0.12em', textTransform: 'uppercase' }}>No media</span>
        )}

        {entry.video_url && (
          <span style={{
            position: 'absolute', left: 8, bottom: 8, width: 22, height: 22, borderRadius: 999,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, color: '#fff', paddingLeft: 2,
          }}>
            ▶
          </span>
        )}
        {!entry.feedback && (
          <span style={{
            position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 999,
            background: 'rgb(252,211,77)', boxShadow: '0 0 0 3px rgba(10,10,10,0.5)',
          }} />
        )}
      </div>

      <div style={{ padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>{entry.title || 'Untitled'}</span>
        <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.35 }}>
          {entry.date}
          {entry.in_misc && ' · on misc'}
        </span>
      </div>
    </button>
  )
}

// ── entry overlay ───────────────────────────────────────────────────

function EntryOverlay({
  entry, project, onClose, onSaved,
}: { entry: Entry; project: Project; onClose: () => void; onSaved: () => void }) {
  useEscapeToClose(true, onClose)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(6,6,6,0.88)',
        backdropFilter: 'blur(8px)', overflowY: 'auto', padding: '24px 12px',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      }}
    >
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
              {entry.date} · {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginTop: 3 }}>{entry.title || 'Untitled'}</h3>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Chip tone={entry.feedback ? 'green' : 'grey'}>{entry.feedback ? 'Feedback sent' : 'Awaiting'}</Chip>
            <button onClick={onClose} style={{ ...ghostBtn, padding: '5px 11px' }}>Close</button>
          </div>
        </div>

        <Player entry={entry} project={project} onSaved={onSaved} />

        <div style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 15 }}>
          {entry.note && (
            <div>
              <span style={label}>Note</span>
              <p style={{ fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', opacity: 0.9 }}>{entry.note}</p>
            </div>
          )}

          {entry.contact_sheet_url && entry.video_url && (
            <div>
              <span style={label}>Contact sheet</span>
              <a href={entry.contact_sheet_url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={entry.contact_sheet_url}
                  alt="Contact sheet"
                  style={{ width: '100%', borderRadius: 8, display: 'block', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </a>
            </div>
          )}

          <MiscButton entry={entry} onSaved={onSaved} />
          <FeedbackForm entry={entry} projectId={project.id} onSaved={onSaved} onClose={onClose} />
        </div>
      </div>
    </div>
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
function Player({ entry, project, onSaved }: { entry: Entry; project: Project; onSaved: () => void }) {
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

  if (!entry.video_url) {
    return entry.contact_sheet_url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={entry.contact_sheet_url} alt="" style={{ width: '100%', display: 'block', background: '#000' }} />
    ) : null
  }

  return (
    <div>
      <video
        ref={videoRef}
        src={entry.video_url}
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

function MiscButton({ entry, onSaved }: { entry: Entry; onSaved: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const push = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/dailies/misc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_id: entry.id }),
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

  if (entry.in_misc) {
    return (
      <p style={{ fontSize: 11, opacity: 0.5, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Chip tone="green">On Misc</Chip>
        <a href="/misc" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>View</a>
      </p>
    )
  }

  if (entry.misc_removed) {
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
  const [mirrored, setMirrored] = useState<number | null>(null)

  const change = async (status: ProjectStatus) => {
    setSaving(true)
    setMirrored(null)
    try {
      const res = await fetch('/api/dailies/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project.id, status }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.mirrored_to_misc) setMirrored(data.mirrored_to_misc)
      onSaved()
    } finally {
      setSaving(false)
    }
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
      {mirrored !== null && (
        <p style={{ fontSize: 11, marginTop: 8, lineHeight: 1.5, color: 'rgb(74,222,128)' }}>
          Published {mirrored} {mirrored === 1 ? 'piece' : 'pieces'} to{' '}
          <a href="/misc" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>Misc</a> as generative.
        </p>
      )}
      {project.status === 'done' && mirrored === null && (
        <p style={{ fontSize: 11, opacity: 0.4, marginTop: 8, lineHeight: 1.5 }}>
          Entries were published to Misc as generative when this was marked Done.
        </p>
      )}
    </section>
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
    </section>
  )
}

// ── references ──────────────────────────────────────────────────────

function References({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const persist = async (references: Reference[]) => {
    await fetch('/api/dailies/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: project.id, references }),
    })
    onSaved()
  }

  const add = async (files: FileList) => {
    setUploading(true)
    setStatus(null)
    try {
      const added: Reference[] = []
      for (const file of Array.from(files)) {
        const url = await uploadViaTicket(file, { project_id: project.id, kind: 'reference' })
        added.push({
          url,
          filename: file.name,
          note: '',
          type: file.type.startsWith('video/') ? 'video' : 'image',
          added_at: new Date().toISOString(),
        })
      }
      await persist([...project.references, ...added])
      setStatus(`✓ ${added.length} added`)
    } catch (err) {
      setStatus(`✗ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
      setTimeout(() => setStatus(null), 5000)
    }
  }

  const remove = (url: string) => persist(project.references.filter(r => r.url !== url))

  const setNote = (url: string, note: string) =>
    persist(project.references.map(r => (r.url === url ? { ...r, note } : r)))

  return (
    <section style={{ ...card, padding: 15 }}>
      <span style={label}>
        References {project.references.length > 0 && `(${project.references.length})`} — the PC downloads these
      </span>

      {project.references.length > 0 && (
        <div style={{
          display: 'grid', gap: 10, marginBottom: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
        }}>
          {project.references.map(ref => (
            <figure key={ref.url} style={{ position: 'relative', margin: 0 }}>
              {isVideoRef(ref) ? (
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
      <p style={{ fontSize: 10, opacity: 0.3, marginTop: 8 }}>Stills or clips — both work.</p>
    </section>
  )
}

// ── feedback ────────────────────────────────────────────────────────

function FeedbackForm({
  entry, projectId, onSaved, onClose,
}: { entry: Entry; projectId: string; onSaved: () => void; onClose: () => void }) {
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

  const remove = async () => {
    if (!confirm('Delete this entry and its video?')) return
    await fetch(`/api/dailies?id=${encodeURIComponent(entry.id)}`, { method: 'DELETE' })
    onClose()
    onSaved()
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
        <button
          type="button" onClick={remove}
          style={{ ...ghostBtn, marginLeft: 'auto', color: 'rgba(248,113,113,0.75)', borderColor: 'rgba(248,113,113,0.28)' }}
        >
          Delete
        </button>
      </div>

      {existing && (
        <p style={{ fontSize: 9, opacity: 0.35, letterSpacing: '0.06em' }}>
          Last submitted {new Date(existing.submitted_at).toLocaleString()}
        </p>
      )}
    </form>
  )
}
