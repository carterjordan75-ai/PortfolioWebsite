'use client'

import { useState } from 'react'

export type ProjectLink = { label: string; url: string }

/**
 * Press / further reading for a project — articles about the work, the
 * client's own case study, a festival page.
 *
 * Persists straight to /api/projects rather than queueing into the
 * EditToolbar, for the same reason the media panel does: pendingChanges
 * is typed `Record<string, string>`, and squeezing an array through it
 * means JSON-in-a-string round-trips on every keystroke.
 */

/**
 * Only http(s) links are allowed out of here.
 *
 * These end up in an `href`, and `javascript:...` in an href executes on
 * click — a stored XSS, even though the only person who can type one is
 * the admin. A bare `example.com/article` is the common case though, so
 * a missing scheme gets https:// rather than a rejection. Note the test
 * is for "has SOME scheme" before prepending: blindly gluing https:// on
 * the front turns `javascript:alert(1)` into a URL that parses fine and
 * sails through the check.
 */
export function safeHref(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  const candidate = hasScheme ? trimmed : `https://${trimmed}`
  try {
    const u = new URL(candidate)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

/** Falls back to the hostname so an unlabelled link still reads as something. */
function displayLabel(link: ProjectLink): string {
  if (link.label.trim()) return link.label.trim()
  const href = safeHref(link.url)
  if (!href) return link.url
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return link.url
  }
}

export default function ProjectLinks({
  slug,
  links,
  editMode,
  onChange,
  rule,
}: {
  slug: string
  links: ProjectLink[]
  editMode: boolean
  onChange: (next: ProjectLink[]) => void
  /** Border colour from the page's theme, so the rule matches its neighbours. */
  rule: string
}) {
  const [status, setStatus] = useState<string | null>(null)

  const persist = async (next: ProjectLink[]) => {
    // Keep every row on screen, but only store the ones with a URL. A
    // half-filled row is someone mid-edit — persist fires on blur, so
    // pruning the local list here would delete the row the moment you
    // tabbed from the label to the URL field. Storing them instead leaves
    // `links: [{label:'',url:''}]` behind, which is an empty section that
    // renders as a heading with nothing under it.
    const storable = next.filter(l => l.url.trim().length > 0)
    onChange(next)
    setStatus('⟳')
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', slug, project: { slug, links: storable } }),
      })
      // fetch only rejects on network failure — a 500 resolves normally.
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`)
      setStatus('✓')
      setTimeout(() => setStatus(null), 1400)
    } catch (err) {
      console.error('Project links save failed:', err)
      setStatus(`✗ ${err instanceof Error ? err.message : String(err)}`)
      setTimeout(() => setStatus(null), 4000)
    }
  }

  const valid = links.filter(l => safeHref(l.url))

  // Nothing to show and nothing to add — stay out of the layout entirely.
  if (!editMode && valid.length === 0) return null

  return (
    <div className="mb-5">
      <div className="flex items-baseline gap-2">
        <span className="font-black text-[8px] tracking-[0.25em] uppercase">Press</span>
        <span className="text-[8px]" style={{ opacity: 0.3 }}>006</span>
        {status && (
          <span
            className="text-[8px] font-mono"
            style={{ opacity: 0.6, color: status.startsWith('✗') ? '#f87171' : undefined }}
          >
            {status}
          </span>
        )}
      </div>

      {!editMode && (
        <ul className="mt-1.5 space-y-1">
          {valid.map((link, i) => (
            <li key={`${link.url}-${i}`}>
              <a
                href={safeHref(link.url)!}
                target="_blank"
                // noopener: without it the opened page gets a handle back
                // to this one via window.opener and can navigate it away.
                rel="noopener noreferrer"
                className="text-[10px] leading-[1.6] hover:opacity-100 transition-opacity inline-flex items-baseline gap-1"
                style={{ opacity: 0.55, textDecoration: 'underline', textUnderlineOffset: '2px' }}
              >
                {displayLabel(link)}
                <span aria-hidden="true" style={{ opacity: 0.6 }}>↗</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {editMode && (
        <div className="mt-1.5 space-y-1.5">
          {links.map((link, i) => {
            const bad = link.url.trim().length > 0 && !safeHref(link.url)
            return (
              <div key={i} className="flex items-center gap-1">
                <input
                  type="text"
                  value={link.label}
                  placeholder="Label (optional)"
                  onChange={e => onChange(links.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))}
                  onBlur={() => persist(links)}
                  className="w-[38%] px-1.5 py-1 text-[9px] rounded-sm outline-none bg-transparent"
                  style={{ border: `1px solid ${rule}` }}
                />
                <input
                  type="text"
                  value={link.url}
                  placeholder="https://…"
                  onChange={e => onChange(links.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))}
                  onBlur={() => persist(links)}
                  className="flex-1 min-w-0 px-1.5 py-1 text-[9px] rounded-sm outline-none bg-transparent"
                  style={{ border: `1px solid ${bad ? '#f87171' : rule}` }}
                  title={bad ? 'Only http(s) links are allowed' : undefined}
                />
                <button
                  onClick={() => persist(links.filter((_, j) => j !== i))}
                  className="px-1 text-[10px] hover:text-red-400"
                  style={{ opacity: 0.4 }}
                  title="Remove this link"
                >
                  ✕
                </button>
              </div>
            )
          })}
          <button
            onClick={() => onChange([...links, { label: '', url: '' }])}
            className="text-[8px] uppercase tracking-[0.12em] font-bold px-2 py-1 rounded-sm"
            style={{ border: `1px solid ${rule}`, opacity: 0.6 }}
          >
            + Add link
          </button>
          {links.some(l => l.url.trim() && !safeHref(l.url)) && (
            <p className="text-[8px]" style={{ color: '#f87171', opacity: 0.9 }}>
              Links in red aren’t http(s) and won’t be shown.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
