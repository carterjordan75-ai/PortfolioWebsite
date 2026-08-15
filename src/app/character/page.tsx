'use client'

import { useEffect, useState } from 'react'
import { Gate } from '../dailies/ui'

/**
 * The character animator — import a shape, rig it, pick a looping action.
 *
 * Hidden the same way /logo is: nothing links to it, and it carries the
 * dailies password rather than a third one, so there is still only one
 * credential to remember.
 *
 * The tool is a self-contained page, so it runs in an iframe rather
 * than being rewritten as components — what you see here is exactly
 * what a downloaded copy does, with no second implementation to drift.
 *
 * It is fetched and handed to the frame as srcDoc rather than pointed
 * at with src. A plain src makes the frame issue its own request, with
 * its own cookie and header rules, and it fails silently with a
 * broken-file icon when anything is off. Fetching means an ordinary
 * same-origin request whose failures can actually be reported.
 */
export default function CharacterToolPage() {
  return (
    <Gate title="Character" subtitle="Animator">
      {signOut => <Tool signOut={signOut} />}
    </Gate>
  )
}

function Tool({ signOut }: { signOut: () => Promise<void> }) {
  const [doc, setDoc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The tool cannot store saved characters itself: a srcDoc frame has an
  // opaque origin, so its localStorage is a throwaway that empties on
  // reload. It asks through here instead, and this side does the fetch
  // from a real origin with a real session.
  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      const msg = e.data
      if (!msg || typeof msg !== 'object' || msg.chan !== 'xoxo-characters') return
      const reply = (payload: unknown) =>
        (e.source as Window | null)?.postMessage(
          { chan: 'xoxo-characters', id: msg.id, payload }, '*',
        )
      try {
        if (msg.op === 'load') {
          const r = await fetch('/api/character-presets', { cache: 'no-store' })
          reply(r.ok ? (await r.json()).presets ?? {} : {})
        } else if (msg.op === 'save') {
          const r = await fetch('/api/character-presets', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ presets: msg.presets }),
          })
          reply({ ok: r.ok })
        }
      } catch {
        reply(msg.op === 'load' ? {} : { ok: false })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    let alive = true
    fetch('/api/character-tool', { cache: 'no-store', credentials: 'same-origin' })
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
          Character
        </span>
        <span style={{ fontSize: 9, opacity: 0.4, letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: 'auto' }}>
          Animator
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
          Loading the animator…
        </div>
      ) : (
        <iframe
          srcDoc={doc}
          title="Character animator"
          style={{ flex: 1, width: '100%', border: 0, display: 'block' }}
        />
      )}
    </div>
  )
}
