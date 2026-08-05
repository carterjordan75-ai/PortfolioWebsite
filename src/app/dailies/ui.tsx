'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Shared shell for the private portal: the password gate, the styles both
 * views use, and the direct-to-Blob upload helper.
 *
 * Uploads never post the file to our own API — a serverless request body
 * caps at 4.5 MB. /api/dailies/upload-url hands back a scoped ticket and
 * the browser PUTs straight to Blob, the same path the render PC takes.
 */

export type Question = {
  id: string
  prompt: string
  type: 'choice' | 'scale' | 'text'
  options?: string[]
}

export type Feedback = {
  entry_id: string
  project_id: string
  answers: Record<string, string | number>
  brief: string
  reference_images: string[]
  render_master: boolean
  submitted_at: string
}

export type Entry = {
  id: string
  project_id: string
  date: string
  title: string
  note: string
  questions: Question[]
  video_url: string | null
  contact_sheet_url: string | null
  created_at: string
  updated_at: string
  feedback: Feedback | null
  in_misc_urls: string[]
  misc_removed_urls: string[]
}

/**
 * One media FILE belonging to an entry.
 *
 * A video and its contact sheet are different pictures at different
 * aspect ratios, so they get their own tile, their own download and
 * their own decision about going public. The feedback still belongs to
 * the entry — that's the thing being reviewed.
 */
export type EntryAsset = {
  entry: Entry
  url: string
  kind: 'video' | 'still'
}

export function entryAssets(entry: Entry): EntryAsset[] {
  const out: EntryAsset[] = []
  if (entry.video_url) out.push({ entry, url: entry.video_url, kind: 'video' })
  if (entry.contact_sheet_url) out.push({ entry, url: entry.contact_sheet_url, kind: 'still' })
  return out
}

export type Asset = {
  url: string
  filename: string
  note: string
  type: 'image' | 'video' | 'link'
  added_at: string
  title?: string
  preview_url?: string
  images?: string[]
}

/** Kept as an alias: `references` was the original name for this shape. */
export type Reference = Asset

const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v)(\?|$)/i

/** References saved before `type` existed fall back to the extension. */
export const isVideoRef = (r: { url: string; type?: string }) =>
  r.type === 'video' || (r.type !== 'image' && VIDEO_EXT_RE.test(r.url))

export type ProjectStatus = 'draft' | 'active' | 'done'

/** Ordered as they appear in the dropdown. */
export const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string; hint: string }> = [
  { value: 'draft', label: 'Not started', hint: 'The PC ignores this — time to write the brief' },
  { value: 'active', label: 'In progress', hint: 'The PC works on this one' },
  {
    value: 'done',
    label: 'Done',
    hint: 'Approved — asks the PC for final masters in 16:9, 9:16 and 1:1 plus a square contact sheet, then moves to the next project',
  },
]

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'Not started',
  active: 'In progress',
  done: 'Done',
}

export type Project = {
  id: string
  title: string
  brief: string
  hero_url: string | null
  references: Asset[]
  sources: Asset[]
  styles: string[]
  status: ProjectStatus
  delivery: { requested_at: string | null; done_at: string | null }
  created_at: string
  updated_at: string
  entry_count: number
  awaiting_count: number
  latest_entry_at: string | null
  is_current: boolean
  entries: Entry[]
}

/** Mirrors STYLE_GROUPS in src/lib/dailies.ts — the dropdown's contents. */
export const STYLE_GROUPS: Array<{ group: string; styles: string[] }> = [
  { group: 'Discipline', styles: [
    'Logo Animation', 'Text / Kinetic Typography', 'Character Animation', 'Title Sequence',
    'UI / Product Animation', 'Explainer / Motion Graphics', 'Data Visualisation',
    'Broadcast / Ident', 'Music Video',
  ] },
  { group: 'Tool / technique', styles: [
    'TouchDesigner', 'Houdini', 'Cinema 4D', 'Blender', 'After Effects', 'Unreal Engine',
    'Shader / GLSL', 'AI / Diffusion', 'Photogrammetry / Scan',
  ] },
  { group: 'Simulation', styles: [
    'Particles', 'Fluid / Liquid', 'Cloth / Soft Body', 'Rigid Body / Destruction',
    'Crowd / Flocking', 'Growth / Organic',
  ] },
  { group: 'Look', styles: [
    'Abstract / Generative', 'Photoreal / CGI', 'Glitch / Datamosh', 'Collage / Cutout',
    'Isometric', 'Cel / 2D Frame-by-frame', 'Stop Motion', 'Rotoscope', 'Morphing',
    'Seamless Loop', 'Analogue / Film Grain', 'Minimal / Swiss', 'Maximal / Y2K',
  ] },
]

export const SCALE = [1, 2, 3, 4, 5]

// ── styles ──────────────────────────────────────────────────────────

export const ghostBtn: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
  padding: '7px 12px', borderRadius: 999, background: 'transparent',
  border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.75)', cursor: 'pointer',
}

export const solidBtn: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
  padding: '11px 22px', borderRadius: 999, border: 'none',
  background: '#fff', color: '#000', cursor: 'pointer',
}

export const label: React.CSSProperties = {
  fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
  textTransform: 'uppercase', opacity: 0.5, display: 'block', marginBottom: 8,
}

export const field: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)',
  color: '#fff', outline: 'none', fontFamily: 'inherit',
}

export const card: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14,
  overflow: 'hidden', background: 'rgba(255,255,255,0.02)',
}

export function Chip({ tone, children }: { tone: 'green' | 'amber' | 'grey'; children: React.ReactNode }) {
  const colours = {
    green: ['rgba(34,197,94,0.16)', 'rgb(74,222,128)', 'rgba(74,222,128,0.35)'],
    amber: ['rgba(251,191,36,0.14)', 'rgb(252,211,77)', 'rgba(252,211,77,0.32)'],
    grey: ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.14)'],
  }[tone]
  return (
    <span style={{
      flexShrink: 0, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em',
      textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999,
      background: colours[0], color: colours[1], border: `1px solid ${colours[2]}`,
    }}>
      {children}
    </span>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#0a0a0a', color: '#ededed', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      {children}
    </div>
  )
}

// ── uploads ─────────────────────────────────────────────────────────

/** Ticket → direct PUT to Blob → public URL. */
export async function uploadViaTicket(
  file: Blob & { name?: string },
  params: { project_id: string; kind: 'reference' | 'source' | 'hero'; entry_id?: string },
): Promise<string> {
  const ticketRes = await fetch('/api/dailies/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      content_type: file.type || 'image/jpeg',
      filename: file.name || 'frame',
    }),
  })
  if (!ticketRes.ok) throw new Error((await ticketRes.json()).error || 'ticket failed')
  const ticket = await ticketRes.json()
  const put = await fetch(ticket.put_url, { method: 'PUT', headers: ticket.headers, body: file })
  if (!put.ok) throw new Error(`upload failed (${put.status})`)
  return (await put.json()).url as string
}

// ── downloads ───────────────────────────────────────────────────────

/**
 * Save an asset to disk.
 *
 * A plain `<a download>` is ignored for cross-origin URLs — the browser
 * navigates to the file instead of saving it. Blob serves these with
 * `access-control-allow-origin: *`, so fetching the bytes and handing
 * over an object URL is what actually produces a download.
 */
export async function downloadAsset(url: string, filename?: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed (${res.status})`)
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename || url.split('?')[0].split('/').pop() || 'download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking immediately can cancel the save on some browsers.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000)
}

// ── auth gate ───────────────────────────────────────────────────────

/**
 * Wraps a view in the password gate. `authed` starts null (unknown) so
 * neither the login form nor the content flashes before we know.
 */
export function Gate({ children }: { children: (signOut: () => Promise<void>) => React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/dailies/login', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setAuthed(!!d.authenticated))
      .catch(() => setAuthed(false))
  }, [])

  const signOut = useCallback(async () => {
    await fetch('/api/dailies/login', { method: 'DELETE' })
    setAuthed(false)
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/dailies/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) { setError('Wrong password'); return }
      setPassword('')
      setAuthed(true)
    } catch {
      setError('Could not reach the server')
    } finally {
      setBusy(false)
    }
  }

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
        <form onSubmit={submit} style={{ width: '100%', maxWidth: 320 }}>
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
            style={{ ...field, padding: '11px 14px', fontSize: 14, borderRadius: 10, marginBottom: 10 }}
          />
          <button
            type="submit"
            disabled={busy || !password}
            style={{
              ...solidBtn, width: '100%', padding: '11px 14px', borderRadius: 10,
              cursor: busy || !password ? 'default' : 'pointer',
              opacity: busy || !password ? 0.4 : 1,
            }}
          >
            {busy ? 'Checking…' : 'Enter'}
          </button>
          {error && (
            <p style={{ color: '#f87171', fontSize: 10, marginTop: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {error}
            </p>
          )}
        </form>
      </Shell>
    )
  }

  return <>{children(signOut)}</>
}

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#0a0a0a', color: '#ededed', minHeight: '100vh', paddingBottom: 80 }}>
      {children}
    </div>
  )
}

export function Header({
  eyebrow, title, children,
}: { eyebrow?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 10, display: 'flex',
      alignItems: 'center', justifyContent: 'space-between', gap: 12,
      // Wraps rather than squeezing: on a phone three buttons would crush
      // the title down to an ellipsis, so they drop to a second line.
      flexWrap: 'wrap',
      padding: '14px 16px', background: 'rgba(10,10,10,0.92)',
      backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ minWidth: 0, flex: '1 1 160px' }}>
        {eyebrow && (
          <p style={{ fontSize: 9, opacity: 0.4, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>
            {eyebrow}
          </p>
        )}
        <h1 style={{
          fontSize: 13, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {title}
        </h1>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>{children}</div>
    </header>
  )
}
