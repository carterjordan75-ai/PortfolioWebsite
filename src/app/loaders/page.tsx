'use client'

import { useState } from 'react'
import XoxoLoader, {
  XOXO_LOADER_DURATION,
  XOXO_LOADER_VARIANTS,
  type XoxoLoaderVariant,
} from '@/components/XoxoLoader'

/**
 * Side-by-side preview of the four loader animations.
 *
 * Internal — not linked from anywhere, and behind the site gate like
 * every other route. It exists so the four can be compared honestly:
 * at the same size, on both backgrounds, replaying together.
 */

const NOTES: Record<XoxoLoaderVariant, string> = {
  drop: 'Falls in staggered, lands heavy, rebounds and settles. The squash on contact is volume-preserving — it spreads as it flattens.',
  wipe: 'A curtain uncovers the wordmark; each letter gives a kick as it clears the edge, which is what stops a wipe feeling mechanical.',
  pop: 'Scales up from nothing with the rotation alternating letter to letter, so it reads as a hand placing each one down.',
  wave: 'The looping one. A squash travels left to right and the word breathes — no entrance or exit, so it runs indefinitely without a seam.',
}

export default function LoadersPage() {
  const [dark, setDark] = useState(true)
  const [small, setSmall] = useState(false)
  // Remounting every card restarts the CSS animations in lockstep.
  const [run, setRun] = useState(0)

  const fg = dark ? '#ffffff' : '#0a0a0a'
  const bg = dark ? '#0a0a0a' : '#f5f5f0'
  const line = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'

  const btn: React.CSSProperties = {
    font: 'inherit',
    fontSize: 9,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    fontWeight: 700,
    color: fg,
    background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
    border: `1px solid ${line}`,
    borderRadius: 99,
    padding: '7px 15px',
    cursor: 'pointer',
  }

  return (
    <div // Top padding clears the fixed site nav, which overlays every route.
      style={{ minHeight: '100vh', background: bg, color: fg, padding: '120px 26px 26px' }}>
      <p
        style={{
          fontSize: 10,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          opacity: 0.45,
          fontWeight: 700,
          margin: '0 0 18px',
        }}
      >
        XOXO loaders — four takes
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 22, flexWrap: 'wrap' }}>
        <button style={btn} onClick={() => setRun(r => r + 1)}>↻ Replay all</button>
        <button style={btn} onClick={() => setDark(d => !d)}>
          {dark ? 'Light' : 'Dark'}
        </button>
        <button style={btn} onClick={() => setSmall(s => !s)}>
          {small ? 'Large' : 'Actual loader size'}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
          gap: 18,
          maxWidth: 1200,
        }}
      >
        {XOXO_LOADER_VARIANTS.map(v => (
          <figure
            key={`${v}-${run}`}
            style={{
              margin: 0,
              border: `1px solid ${line}`,
              borderRadius: 14,
              overflow: 'hidden',
              background: dark ? '#000' : '#fff',
            }}
          >
            <div
              style={{
                display: 'grid',
                placeItems: 'center',
                height: 210,
                padding: '30px 38px',
              }}
            >
              <XoxoLoader variant={v} style={{ maxWidth: small ? 150 : 380 }} />
            </div>
            <figcaption
              style={{
                padding: '11px 15px 14px',
                borderTop: `1px solid ${line}`,
                fontSize: 11,
                lineHeight: 1.55,
              }}
            >
              <b style={{ letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: 10 }}>
                {v}
              </b>
              <span
                style={{
                  opacity: 0.4,
                  fontFamily: 'ui-monospace, monospace',
                  marginLeft: 8,
                  fontSize: 10,
                }}
              >
                {v === 'wave'
                  ? `${XOXO_LOADER_DURATION[v]}ms · loops`
                  : `${XOXO_LOADER_DURATION[v]}ms`}
              </span>
              <br />
              <span style={{ opacity: 0.45 }}>{NOTES[v]}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}
