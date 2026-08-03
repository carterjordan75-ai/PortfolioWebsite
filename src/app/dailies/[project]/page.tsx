'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  Chip, Gate, Header, Page, SCALE, STATUS_OPTIONS, card, field, ghostBtn, label, solidBtn,
  uploadViaTicket, type Entry, type Project, type ProjectStatus, type Reference,
} from '../ui'

/**
 * One project: the standing brief, the references the PC builds from,
 * and every entry it has produced with a feedback form attached.
 *
 * Two kinds of image live here and they are not the same thing:
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

  return (
    <Page>
      <Header eyebrow={`${project.entry_count} ${project.entry_count === 1 ? 'entry' : 'entries'}`} title={project.title}>
        <Link href="/dailies" style={{ ...ghostBtn, textDecoration: 'none' }}>All projects</Link>
        <button onClick={load} style={ghostBtn}>{loading ? '…' : 'Refresh'}</button>
        <button onClick={signOut} style={ghostBtn}>Sign out</button>
      </Header>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '22px 16px', display: 'flex', flexDirection: 'column', gap: 26 }}>
        <Hero project={project} onSaved={load} />
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              {project.entries.map(entry => (
                <EntryCard key={entry.id} entry={entry} projectId={project.id} onSaved={load} />
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
    </Page>
  )
}

// ── hero ────────────────────────────────────────────────────────────

function Hero({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const url = await uploadViaTicket(file, { project_id: project.id, kind: 'hero' })
      await fetch('/api/dailies/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The hero lives at a fixed path so replacing it doesn't strand
        // the old file — which means the URL never changes and caches
        // would keep serving the previous image. The version marker is
        // what actually makes a replacement visible.
        body: JSON.stringify({ id: project.id, hero_url: `${url}?v=${Date.now()}` }),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <section style={{ ...card, overflow: 'hidden' }}>
      <div style={{
        aspectRatio: '16 / 7', background: 'rgba(255,255,255,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {project.hero_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.hero_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <span style={{ fontSize: 9, opacity: 0.3, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            No hero image
          </span>
        )}
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ ...label, marginBottom: 0 }}>Hero</span>
        <input
          type="file" accept="image/*" disabled={uploading}
          onChange={e => { const f = e.target.files?.[0]; if (f) set(f); e.target.value = '' }}
          style={{ fontSize: 11, opacity: uploading ? 0.5 : 0.75 }}
        />
        {uploading && <span style={{ fontSize: 10, opacity: 0.6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Uploading…</span>}
        {error && <span style={{ fontSize: 10, color: '#f87171' }}>{error}</span>}
      </div>
    </section>
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

  const change = async (status: ProjectStatus) => {
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

  // "In progress" doesn't mean "being worked on" if something older is
  // still open, so the queued warning replaces the generic hint.
  const queued = project.status === 'active' && !project.is_current
  const hint = queued ? null : STATUS_OPTIONS.find(o => o.value === project.status)?.hint

  return (
    <section style={{ ...card, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ ...label, marginBottom: 0 }}>Status</span>
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
    <section style={{ ...card, padding: 16 }}>
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
        added.push({ url, filename: file.name, note: '', added_at: new Date().toISOString() })
      }
      await persist([...project.references, ...added])
      setStatus(`✓ ${added.length} added`)
    } catch (err) {
      setStatus(`✗ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
      setTimeout(() => setStatus(null), 4000)
    }
  }

  const remove = (url: string) => persist(project.references.filter(r => r.url !== url))

  const setNote = (url: string, note: string) =>
    persist(project.references.map(r => (r.url === url ? { ...r, note } : r)))

  return (
    <section style={{ ...card, padding: 16 }}>
      <span style={label}>
        References {project.references.length > 0 && `(${project.references.length})`} — the PC downloads these
      </span>

      {project.references.length > 0 && (
        <div style={{
          display: 'grid', gap: 10, marginBottom: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        }}>
          {project.references.map(ref => (
            <figure key={ref.url} style={{ position: 'relative', margin: 0 }}>
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
              <button
                type="button"
                onClick={() => remove(ref.url)}
                aria-label={`Remove ${ref.filename}`}
                style={{
                  position: 'absolute', top: -6, right: -6, width: 20, height: 20,
                  borderRadius: 999, border: 'none', cursor: 'pointer',
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
          type="file" accept="image/*" multiple disabled={uploading}
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
    </section>
  )
}

// ── entry + feedback ────────────────────────────────────────────────

function EntryCard({ entry, projectId, onSaved }: { entry: Entry; projectId: string; onSaved: () => void }) {
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
      setStatus(`✓ ${uploaded.length} image${uploaded.length === 1 ? '' : 's'} attached`)
    } catch (err) {
      setStatus(`✗ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
      setTimeout(() => setStatus(null), 4000)
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
    onSaved()
  }

  return (
    <section style={card}>
      <div style={{
        padding: '14px 16px', display: 'flex', alignItems: 'baseline',
        justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.45 }}>
            {entry.date} · {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <h3 style={{ fontSize: 15, fontWeight: 800, marginTop: 3 }}>{entry.title || 'Untitled'}</h3>
        </div>
        <Chip tone={existing ? 'green' : 'grey'}>{existing ? 'Feedback sent' : 'Awaiting feedback'}</Chip>
      </div>

      {entry.video_url && (
        <video
          src={entry.video_url}
          controls
          playsInline
          preload="metadata"
          poster={entry.contact_sheet_url || undefined}
          style={{ width: '100%', display: 'block', background: '#000', maxHeight: '70vh' }}
        />
      )}

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {entry.note && (
          <div>
            <span style={label}>Note</span>
            <p style={{ fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', opacity: 0.9 }}>{entry.note}</p>
          </div>
        )}

        {entry.contact_sheet_url && (
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

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" style={{ width: 62, height: 62, objectFit: 'cover', borderRadius: 7, border: '1px solid rgba(255,255,255,0.14)' }} />
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
              type="file" accept="image/*" multiple disabled={uploading}
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
      </div>
    </section>
  )
}
