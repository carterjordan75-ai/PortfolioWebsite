'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Motion Dailies — private review portal.
 *
 * Not linked anywhere on the site and excluded from sitemaps/robots via
 * the metadata in layout.tsx. Auth is its own password (independent of
 * the site-wide gate), held in an httpOnly cookie.
 *
 * Reference images upload straight to Blob using a scoped ticket from
 * /api/dailies/upload-url — same mechanism the render PC uses — because
 * a serverless request body can't carry them (4.5 MB cap).
 */

type Question = {
  id: string
  prompt: string
  type: 'choice' | 'scale' | 'text'
  options?: string[]
}

type Feedback = {
  date: string
  answers: Record<string, string | number>
  brief: string
  reference_images: string[]
  render_master: boolean
  submitted_at: string
}

type Daily = {
  date: string
  title: string
  note: string
  questions: Question[]
  video_url: string | null
  contact_sheet_url: string | null
  created_at: string
  updated_at: string
  feedback: Feedback | null
}

const SCALE = [1, 2, 3, 4, 5]

export default function DailiesPage() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const [dailies, setDailies] = useState<Daily[]>([])
  const [loading, setLoading] = useState(false)

  const loadDailies = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dailies', { cache: 'no-store' })
      if (res.status === 401) { setAuthed(false); return }
      const data = await res.json()
      setDailies(data.dailies || [])
      setAuthed(true)
    } catch {
      /* leave whatever is on screen */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch('/api/dailies/login', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        setAuthed(!!d.authenticated)
        if (d.authenticated) loadDailies()
      })
      .catch(() => setAuthed(false))
  }, [loadDailies])

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoggingIn(true)
    setLoginError(null)
    try {
      const res = await fetch('/api/dailies/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) { setLoginError('Wrong password'); return }
      setPassword('')
      setAuthed(true)
      await loadDailies()
    } catch {
      setLoginError('Could not reach the server')
    } finally {
      setLoggingIn(false)
    }
  }

  const logout = async () => {
    await fetch('/api/dailies/login', { method: 'DELETE' })
    setAuthed(false)
    setDailies([])
  }

  // ── login ────────────────────────────────────────────────────────
  if (authed === null) {
    return (
      <Shell>
        <p style={{ opacity: 0.5, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Checking…</p>
      </Shell>
    )
  }

  if (!authed) {
    return (
      <Shell>
        <form onSubmit={submitLogin} style={{ width: '100%', maxWidth: 320 }}>
          <h1 style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>
            Motion Dailies
          </h1>
          <p style={{ fontSize: 10, opacity: 0.45, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 22 }}>
            Private review portal
          </p>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            style={{
              width: '100%', padding: '11px 14px', fontSize: 14, borderRadius: 10,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
              color: '#fff', outline: 'none', marginBottom: 10,
            }}
          />
          <button
            type="submit"
            disabled={loggingIn || !password}
            style={{
              width: '100%', padding: '11px 14px', fontSize: 10, fontWeight: 800,
              letterSpacing: '0.14em', textTransform: 'uppercase', borderRadius: 10,
              background: '#fff', color: '#000', border: 'none',
              cursor: loggingIn || !password ? 'default' : 'pointer',
              opacity: loggingIn || !password ? 0.4 : 1,
            }}
          >
            {loggingIn ? 'Checking…' : 'Enter'}
          </button>
          {loginError && (
            <p style={{ color: '#f87171', fontSize: 10, marginTop: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {loginError}
            </p>
          )}
        </form>
      </Shell>
    )
  }

  // ── portal ───────────────────────────────────────────────────────
  return (
    <div style={{ background: '#0a0a0a', color: '#ededed', minHeight: '100vh', paddingBottom: 80 }}>
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 10, display: 'flex',
          alignItems: 'baseline', justifyContent: 'space-between', gap: 16,
          padding: '18px 20px', background: 'rgba(10,10,10,0.92)',
          backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div>
          <h1 style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
            Motion Dailies
          </h1>
          <p style={{ fontSize: 9, opacity: 0.4, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 3 }}>
            {dailies.length} {dailies.length === 1 ? 'daily' : 'dailies'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadDailies} style={ghostBtn}>{loading ? '…' : 'Refresh'}</button>
          <button onClick={logout} style={ghostBtn}>Sign out</button>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '22px 16px', display: 'flex', flexDirection: 'column', gap: 26 }}>
        {dailies.length === 0 && !loading && (
          <p style={{ opacity: 0.4, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center', padding: '40px 0' }}>
            No dailies yet — the render PC hasn&apos;t posted one.
          </p>
        )}
        {dailies.map(daily => (
          <DailyCard key={daily.date} daily={daily} onSaved={loadDailies} />
        ))}
      </main>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#0a0a0a', color: '#ededed', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      {children}
    </div>
  )
}

const ghostBtn: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
  padding: '7px 12px', borderRadius: 999, background: 'transparent',
  border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.75)', cursor: 'pointer',
}

const label: React.CSSProperties = {
  fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
  textTransform: 'uppercase', opacity: 0.5, display: 'block', marginBottom: 8,
}

const field: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)',
  color: '#fff', outline: 'none', fontFamily: 'inherit',
}

function DailyCard({ daily, onSaved }: { daily: Daily; onSaved: () => void }) {
  const existing = daily.feedback
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
    const uploaded: string[] = []
    try {
      for (const file of Array.from(files)) {
        // Ticket → direct PUT to Blob (bypasses the 4.5 MB body cap).
        const ticketRes = await fetch('/api/dailies/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: daily.date, kind: 'reference',
            content_type: file.type || 'image/jpeg', filename: file.name,
          }),
        })
        if (!ticketRes.ok) throw new Error((await ticketRes.json()).error || 'ticket failed')
        const ticket = await ticketRes.json()
        const put = await fetch(ticket.put_url, { method: 'PUT', headers: ticket.headers, body: file })
        if (!put.ok) throw new Error(`upload failed (${put.status})`)
        const blob = await put.json()
        uploaded.push(blob.url)
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
          date: daily.date, answers, brief,
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
    <section style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div>
          <p style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.45 }}>{daily.date}</p>
          <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 3 }}>{daily.title || 'Untitled'}</h2>
        </div>
        <span
          style={{
            flexShrink: 0, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em',
            textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999,
            background: existing ? 'rgba(34,197,94,0.16)' : 'rgba(255,255,255,0.07)',
            color: existing ? 'rgb(74,222,128)' : 'rgba(255,255,255,0.5)',
            border: `1px solid ${existing ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.14)'}`,
          }}
        >
          {existing ? 'Feedback sent' : 'Awaiting feedback'}
        </span>
      </div>

      {daily.video_url && (
        <video
          src={daily.video_url}
          controls
          playsInline
          preload="metadata"
          poster={daily.contact_sheet_url || undefined}
          style={{ width: '100%', display: 'block', background: '#000', maxHeight: '70vh' }}
        />
      )}

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {daily.note && (
          <div>
            <span style={label}>Note</span>
            <p style={{ fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', opacity: 0.9 }}>{daily.note}</p>
          </div>
        )}

        {daily.contact_sheet_url && (
          <div>
            <span style={label}>Contact sheet</span>
            <a href={daily.contact_sheet_url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={daily.contact_sheet_url}
                alt="Contact sheet of alternate directions"
                style={{ width: '100%', borderRadius: 8, display: 'block', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </a>
          </div>
        )}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
          {daily.questions.map(q => (
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit" disabled={saving || uploading}
              style={{
                padding: '11px 22px', fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
                textTransform: 'uppercase', borderRadius: 999, border: 'none',
                background: '#fff', color: '#000',
                cursor: saving || uploading ? 'default' : 'pointer',
                opacity: saving || uploading ? 0.5 : 1,
              }}
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
      </div>
    </section>
  )
}
