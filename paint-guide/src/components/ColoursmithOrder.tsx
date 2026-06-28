import { useMemo, useState } from 'react'
import { rgbToHex, luminance, type Guide } from '../engine'
import type { ProjectMeta } from '../db/types'
import { coordLabel } from '../lib/format'

// Roughly what a Coloursmith sample pot costs — for a ballpark total only.
const POT_PRICE = 4.84
const CREATE_URL = 'https://coloursmith.com.au/colours/create/'

// Turns the painting's colours into an order pack for Coloursmith custom pots:
// a per-colour list (name, hex, coords, cells), a cost estimate, and a
// downloadable flat-swatch image to upload to Coloursmith and tap each colour.
export default function ColoursmithOrder({
  meta,
  guide,
  onClose,
}: {
  meta: ProjectMeta
  guide: Guide
  onClose: () => void
}) {
  const rows = useMemo(
    () =>
      guide.order.map((ci, i) => {
        const c = guide.colors[ci]
        return {
          i,
          rgb: c.rgb,
          name: `${meta.name}_Colour${i + 1}`,
          hex: rgbToHex(c.rgb).toUpperCase(),
          coord: coordLabel(c.firstRow, c.firstCol),
          count: c.count,
        }
      }),
    [guide, meta.name],
  )
  const [ordered, setOrdered] = useState<Set<number>>(new Set())
  const total = rows.length
  const cost = (total * POT_PRICE).toFixed(0)

  function toggle(i: number) {
    setOrdered((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  // Render the palette as labelled flat colour blocks and download as a PNG —
  // upload it to Coloursmith, then tap each block to capture that exact colour.
  function downloadSwatches() {
    const COLS = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(total))))
    const ROWS = Math.ceil(total / COLS)
    const CW = 260
    const CH = 180
    const STRIP = 40
    const canvas = document.createElement('canvas')
    canvas.width = COLS * CW
    canvas.height = ROWS * CH
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    rows.forEach((r, idx) => {
      const x = (idx % COLS) * CW
      const y = Math.floor(idx / COLS) * CH
      // Big pure-colour tap zone.
      ctx.fillStyle = r.hex
      ctx.fillRect(x, y, CW, CH)
      // Legible label strip (kept out of the tap zone).
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(x, y + CH - STRIP, CW, STRIP)
      ctx.fillStyle = '#ffffff'
      ctx.font = '600 16px system-ui, sans-serif'
      ctx.fillText(r.name, x + 12, y + CH - STRIP + 18)
      ctx.font = '13px ui-monospace, monospace'
      ctx.fillText(`${r.hex} · ${r.coord} · ${r.count}px`, x + 12, y + CH - 10)
    })
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${meta.name}-coloursmith-swatches.png`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 660, maxHeight: '88vh', overflowY: 'auto' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="inline" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Order on Coloursmith</h2>
          <button className="btn sm icon ghost" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="notice info">
          <span>
            Each colour below is a <b>custom Coloursmith sample pot</b> — your exact colour, no
            mixing. Coloursmith has no direct import, so: <b>download the swatch image</b>, upload it
            at coloursmith.com.au, tap each block to capture its colour, name it (names suggested
            below), and order the pot.
          </span>
        </div>

        <div className="inline" style={{ gap: 10, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={downloadSwatches}>
            ⬇ Download swatch image ({total})
          </button>
          <a className="btn" href={CREATE_URL} target="_blank" rel="noopener noreferrer">
            Open Coloursmith ↗
          </a>
        </div>

        <div className="tiny muted">
          <b style={{ color: 'var(--text)' }}>{total}</b> custom pots · ≈{' '}
          <b style={{ color: 'var(--text)' }}>${cost}</b> at ~${POT_PRICE.toFixed(2)}/pot · free post
          over 4. Fewer colours = fewer pots (drop the “Number of colours” slider).
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r) => {
            const done = ordered.has(r.i)
            return (
              <button
                key={r.i}
                onClick={() => toggle(r.i)}
                title={done ? 'Mark not ordered' : 'Mark ordered'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--line)',
                  background: done ? 'rgba(120,180,120,0.10)' : 'var(--panel-2, transparent)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  opacity: done ? 0.6 : 1,
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 6,
                    background: r.hex,
                    border: '1px solid rgba(0,0,0,0.2)',
                    flex: '0 0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: luminance(r.rgb) > 0.5 ? '#15161a' : '#fff',
                    fontSize: 14,
                  }}
                >
                  {done ? '✓' : ''}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
                  <div
                    className="tiny muted"
                    style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace, monospace' }}
                  >
                    {r.hex} · {r.coord} · {r.count} cells
                  </div>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
