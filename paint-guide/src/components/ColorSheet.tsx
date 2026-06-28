import { useEffect, useMemo } from 'react'
import { recipeItems, rgbToHex, luminance, PALETTE, type Guide } from '../engine'
import type { AmountWording } from '../db/types'
import { amountLabel, QUALITY_CLASS, coordLabel } from '../lib/format'

interface Props {
  guide: Guide
  colorIndex: number
  done: Uint8Array
  wording: AmountWording
  onToggleCell: (i: number) => void
  onMarkAll: (value: boolean) => void
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
  onClose: () => void
  onExpand: () => void
}

export default function ColorSheet({
  guide,
  colorIndex,
  done,
  wording,
  onToggleCell,
  onMarkAll,
  onPrev,
  onNext,
  canPrev,
  canNext,
  onClose,
  onExpand,
}: Props) {
  const color = guide.colors[colorIndex]
  const orderPos = guide.order.indexOf(colorIndex)

  // All cells of this colour, grouped by grid row (reading order).
  const rows = useMemo(() => {
    const map = new Map<number, number[]>()
    for (let i = 0; i < guide.cells.length; i++) {
      if (guide.cells[i] !== colorIndex) continue
      const r = Math.floor(i / guide.cols)
      const arr = map.get(r)
      if (arr) arr.push(i)
      else map.set(r, [i])
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [guide, colorIndex])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!color) return null

  const match = color.match
  const items = recipeItems(match.parts)
  let doneCount = 0
  for (let i = 0; i < guide.cells.length; i++) {
    if (guide.cells[i] === colorIndex && done[i]) doneCount++
  }
  const allDone = doneCount >= color.count
  const percent = color.count > 0 ? Math.round((doneCount / color.count) * 100) : 0

  return (
    <aside className="sheet">
      <div className="sheet-head">
        <div className="inline" style={{ gap: 10 }}>
          <span className="sheet-dot" style={{ background: rgbToHex(color.rgb) }} />
          <div>
            <div style={{ fontWeight: 650, fontSize: 16 }}>Colour {orderPos + 1}</div>
            <div className="tiny muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
              starts {coordLabel(color.firstRow, color.firstCol)} · {color.count} cells
            </div>
          </div>
        </div>
        <div className="inline" style={{ gap: 6 }}>
          <button className="btn sm icon ghost" title="Previous colour" onClick={onPrev} disabled={!canPrev}>
            ←
          </button>
          <button className="btn sm icon ghost" title="Next colour" onClick={onNext} disabled={!canNext}>
            →
          </button>
          <button className="btn sm icon ghost" title="Close (Esc)" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      <div className="sheet-body">
        <div
          className="paint-swatch big"
          style={{ background: rgbToHex(color.rgb), color: luminance(color.rgb) > 0.5 ? '#15161a' : '#ffffff' }}
        >
          <button className="ps-expand" onClick={onExpand} title="View full screen">
            ⤢
          </button>
          <div className="ps-code">{rgbToHex(color.rgb).toUpperCase()}</div>
          <div className="ps-sub">
            {color.custom ? 'Order as a Coloursmith custom pot' : 'Mix to match this colour'}
          </div>
        </div>

        {color.custom ? (
          <div className="notice info">
            <span>
              Order a <b>Coloursmith custom pot</b> of this exact colour (
              <b>{rgbToHex(color.rgb).toUpperCase()}</b>) — no mixing.
            </span>
          </div>
        ) : (
          <div>
            <div className="inline" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="sheet-label" style={{ margin: 0 }}>
                Mix
              </span>
              <span className={'badge ' + QUALITY_CLASS[match.quality]}>
                {match.quality} · ΔE {match.deltaE.toFixed(1)}
              </span>
            </div>
            <div className="recipe">
              {items.map((it) => (
                <span className="chip" key={it.key}>
                  <span className="dot" style={{ background: rgbToHex(PALETTE[it.key].rgb) }} />
                  {it.name} <span className="x"><b>{amountLabel(it.count, wording)}</b></span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="inline" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="sheet-label" style={{ margin: 0 }}>
              Cells — tick as you paint
            </span>
            <span className="tiny muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {doneCount} / {color.count} · {percent}%
            </span>
          </div>
          <div className={'bar' + (allDone ? ' good' : '')}>
            <i style={{ width: `${percent}%` }} />
          </div>
          <div className="nav-row" style={{ marginTop: 10 }}>
            <button className="btn sm" onClick={() => onMarkAll(true)} disabled={allDone}>
              ✓ Tick all
            </button>
            <button className="btn sm" onClick={() => onMarkAll(false)} disabled={doneCount === 0}>
              Clear all
            </button>
          </div>
        </div>

        <div className="cell-rows">
          {rows.map(([r, idxs]) => (
            <div className="cell-row-grp" key={r}>
              <span className="cell-row-label">V{r + 1}</span>
              <div className="cell-chips">
                {idxs.map((i) => {
                  const c = (i % guide.cols) + 1
                  return (
                    <button
                      key={i}
                      className={'cell-chip' + (done[i] ? ' on' : '')}
                      title={`V${r + 1},H${c}`}
                      onClick={() => onToggleCell(i)}
                    >
                      {done[i] ? '✓' : c}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
