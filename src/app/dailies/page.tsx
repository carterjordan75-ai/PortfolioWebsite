'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Chip, Gate, Header, Page, STATUS_LABEL, card, field, ghostBtn, label, solidBtn,
  type Project,
} from './ui'

/**
 * Project index — the visual browse view.
 *
 * Projects are the container, not dates: an unattended overnight run
 * produces many entries and several projects can be live at once, so a
 * date can't identify anything. Each card leads with its hero image so
 * you can tell at a glance what you're looking at.
 */

export default function DailiesIndex() {
  return <Gate>{signOut => <Index signOut={signOut} />}</Gate>
}

function Index({ signOut }: { signOut: () => Promise<void> }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dailies', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setProjects(data.projects || [])
    } catch {
      /* keep whatever is on screen */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    setError(null)
    try {
      const res = await fetch('/api/dailies/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setNewTitle('')
      setCreating(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const awaiting = projects.reduce((n, p) => n + (p.status === 'done' ? 0 : p.awaiting_count), 0)

  // Fixed order: oldest first, so a new project lands on the end and
  // nothing ever moves. Sorting by status would reshuffle the grid every
  // time something changed, and you'd lose where things are.
  const ordered = [...projects].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))

  return (
    <Page>
      <Header
        eyebrow={
          loading ? 'Loading…'
            : `${projects.length} project${projects.length === 1 ? '' : 's'}${awaiting ? ` · ${awaiting} awaiting` : ''}`
        }
        title="Motion Dailies"
      >
        <button onClick={() => setCreating(c => !c)} style={ghostBtn}>
          {creating ? 'Cancel' : 'New project'}
        </button>
        <button onClick={load} style={ghostBtn}>{loading ? '…' : 'Refresh'}</button>
        <button onClick={signOut} style={ghostBtn}>Sign out</button>
      </Header>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '22px 16px' }}>
        {creating && (
          <form onSubmit={create} style={{ ...card, padding: 16, marginBottom: 22, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Project name"
              autoFocus
              style={{ ...field, flex: '1 1 220px', width: 'auto' }}
            />
            <button type="submit" disabled={!newTitle.trim()} style={{ ...solidBtn, opacity: newTitle.trim() ? 1 : 0.4 }}>
              Create
            </button>
            {error && <p style={{ color: '#f87171', fontSize: 10, width: '100%' }}>{error}</p>}
          </form>
        )}

        {!loading && projects.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ opacity: 0.4, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              No projects yet
            </p>
            <p style={{ opacity: 0.3, fontSize: 11, marginTop: 8 }}>
              Make one here, drop references into it, and point the PC at it.
            </p>
          </div>
        )}

        <div style={{
          display: 'grid', gap: 16,
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        }}>
          {ordered.map(p => (
            <Link key={p.id} href={`/dailies/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <article style={{ ...card, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  aspectRatio: '16 / 10', background: 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}>
                  {p.hero_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.hero_url}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <span style={{ fontSize: 9, opacity: 0.3, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                      No hero yet
                    </span>
                  )}
                </div>
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <h2 style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3 }}>{p.title}</h2>
                    {/* A finished project has been seen — nothing is "new" on it. */}
                    {p.awaiting_count > 0 && p.status !== 'done' && (
                      <Chip tone="amber">{p.awaiting_count} new</Chip>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {p.is_current ? (
                      <Chip tone="green">PC is on this</Chip>
                    ) : p.status === 'active' ? (
                      <Chip tone="amber">Queued</Chip>
                    ) : (
                      <Chip tone="grey">{STATUS_LABEL[p.status]}</Chip>
                    )}
                  </div>
                  {p.brief && (
                    <p style={{
                      fontSize: 11, lineHeight: 1.55, opacity: 0.55,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {p.brief}
                    </p>
                  )}
                  {/* label last would win and reset display to block, killing the gap */}
                  <div style={{ ...label, marginTop: 'auto', marginBottom: 0, display: 'flex', gap: 12, opacity: 0.35 }}>
                    <span>{p.entry_count} {p.entry_count === 1 ? 'entry' : 'entries'}</span>
                    {p.references.length > 0 && <span>{p.references.length} refs</span>}
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </main>
    </Page>
  )
}
