'use client'

import { useEffect, useState } from 'react'
import { Gate } from '../dailies/ui'

/**
 * The logo tuner — the tool the site's loader animations are designed in.
 *
 * Hidden: nothing links to it, and it carries the dailies password rather
 * than a second one, so there is one credential to remember.
 *
 * The tool is a self-contained page of generated CSS and SVG, so it runs
 * in an iframe rather than being rewritten as components. That is
 * deliberate — it is the same artefact the tuner exports, so what you see
 * here is exactly what a downloaded copy does, with no second
 * implementation to drift.
 *
 * It is fetched and handed to the frame as srcDoc rather than pointed at
 * with src. A plain src makes the frame issue its own request, which has
 * its own cookie and header rules and fails silently with a broken-file
 * icon when anything is off. Fetching means the request is an ordinary
 * same-origin one and a failure can actually be reported.
 */
export default function LogoToolPage() {
  return (
    <Gate title="Logo" subtitle="Loader tuner">
      {signOut => <Tool signOut={signOut} />}
    </Gate>
  )
}

function Tool({ signOut }: { signOut: () => Promise<void> }) {
  const [doc, setDoc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/logo-tool', { cache: 'no-store', credentials: 'same-origin' })
      .then(async res => {
        if (!res.ok) throw new Error(`The tool did not load (HTTP ${res.status}).`)
        return res.text()
      })
      .then(html => {
        if (alive) setDoc(html)
      })
      .catch(e => {
        if (alive) setError(e instanceof Error ? e.message : 'The tool did not load.')
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.12)',
          color: '#ededed', flex: '0 0 auto',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          Logo
        </span>
        <span style={{ fontSize: 9, opacity: 0.4, letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: 'auto' }}>
          Loader tuner
        </span>
        <button
          onClick={signOut}
          style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: '#ededed', background: 'transparent',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: 99,
            padding: '7px 14px', cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </header>

      {error ? (
        <div style={{ padding: 24, color: '#f87171', fontSize: 12, lineHeight: 1.6 }}>
          {error}
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
            Try signing out and back in — the session may have expired.
          </p>
        </div>
      ) : doc === null ? (
        <div style={{ padding: 24, color: 'rgba(255,255,255,0.4)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Loading the tuner…
        </div>
      ) : (
        <iframe
          srcDoc={doc}
          title="XOXO loader tuner"
          style={{ flex: 1, width: '100%', border: 0, display: 'block' }}
        />
      )}
    </div>
  )
}
