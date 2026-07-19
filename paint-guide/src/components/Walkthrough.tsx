import {
  recipeTransition,
  recipeItems,
  rgbToHex,
  luminance,
  PALETTE,
  type Guide,
} from '../engine'
import type { AmountWording } from '../db/types'
import { amountLabel, QUALITY_CLASS, coordLabel } from '../lib/format'

interface Props {
  guide: Guide
  pos: number
  doneByColor: number[]
  wording: AmountWording
  onPrev: () => void
  onNext: () => void
  onMarkDone: () => void
  onMarkUndone: () => void
  onWording: (w: AmountWording) => void
  onOpenSheet: () => void
  onExpand: () => void
}

export default function Walkthrough({
  guide,
  pos,
  doneByColor,
  wording,
  onPrev,
  onNext,
  onMarkDone,
  onMarkUndone,
  onWording,
  onOpenSheet,
  onExpand,
}: Props) {
  const total = guide.order.length
  const colorIndex = guide.order[pos]
  const color = guide.colors[colorIndex]
  if (!color) return null

  const match = color.match
  const items = recipeItems(match.parts)
  const prevColor = pos > 0 ? guide.colors[guide.order[pos - 1]] : null
  const trans = prevColor
    ? recipeTransition(prevColor.match.parts, color.match.parts, prevColor.lab, color.lab)
    : null

  const doneCount = doneByColor[colorIndex] ?? 0
  const allDone = doneCount >= color.count
  const colorPct = color.count > 0 ? Math.round((doneCount / color.count) * 100) : 0

  return (
    <div className="section">
      <div className="wt-head">
        <h3 style={{ fontSize: 15 }}>
          Colour {pos + 1}{' '}
          <span className="muted" style={{ fontWeight: 400 }}>
            of {total}
          </span>
        </h3>
        {!color.custom && (
          <span className={'badge ' + QUALITY_CLASS[match.quality]}>
            {match.quality} · ΔE {match.deltaE.toFixed(1)}
          </span>
        )}
      </div>

      <div className="tiny muted" style={{ marginTop: -4 }}>
        Starts at{' '}
        <b style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
          {coordLabel(color.firstRow, color.firstCol)}
        </b>{' '}
        · {color.count} {color.count === 1 ? 'cell' : 'cells'}
      </div>

      <div
        className="paint-swatch"
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

      <button
        className="btn primary"
        style={{ width: '100%', justifyContent: 'center' }}
        onClick={onOpenSheet}
      >
        ▸ Open checklist — tick off each cell
      </button>

      <div>
        <div className="h" style={{ marginBottom: 8, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-2)', fontWeight: 650 }}>
          {color.custom ? 'Order' : 'Mix'}
        </div>
        {color.custom ? (
          <div className="notice info">
            <span>
              Order a <b>Coloursmith custom pot</b> of this exact colour (
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{rgbToHex(color.rgb).toUpperCase()}</b>
              ) — no mixing. Use <b>Order pack</b> (top bar) to send them all at once.
            </span>
          </div>
        ) : (
          <div className="recipe">
            {items.map((it) => (
              <span className="chip" key={it.key}>
                <span className="dot" style={{ background: rgbToHex(PALETTE[it.key].rgb) }} />
                {it.name} <span className="x"><b>{amountLabel(it.count, wording)}</b></span>
              </span>
            ))}
          </div>
        )}
      </div>

      {!color.custom && prevColor && trans && (
        <div>
          <div className="h" style={{ marginBottom: 8, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-2)', fontWeight: 650 }}>
            From the last colour
          </div>
          {trans.same ? (
            <div className="notice info">Same mix as the last colour — keep going.</div>
          ) : trans.mixFresh ? (
            <div className="notice info">
              Quite different from the last colour — easier to mix this one fresh from
              the recipe above.
            </div>
          ) : (
            <div className="adjust">
              <div className="inline tiny muted">
                <span
                  className="dot"
                  style={{ width: 14, height: 14, borderRadius: 4, background: rgbToHex(prevColor.rgb), display: 'inline-block', border: '1px solid rgba(255,255,255,0.2)' }}
                />
                Adjust the previous mix:
              </div>
              {trans.steps.map((s) => (
                <div className="step" key={s.key}>
                  <span className="ic">{s.delta > 0 ? '＋' : '−'}</span>
                  <span>{s.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="inline" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="tiny muted">This colour</span>
          <span className="tiny muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {doneCount} / {color.count} px · {colorPct}%
          </span>
        </div>
        <div className={'bar' + (allDone ? ' good' : '')}>
          <i style={{ width: `${colorPct}%` }} />
        </div>
      </div>

      <div className="nav-row">
        {allDone ? (
          <button className="btn" onClick={onMarkUndone}>
            Un-mark colour
          </button>
        ) : (
          <button className="btn" onClick={onMarkDone}>
            ✓ Mark all {color.count} done
          </button>
        )}
      </div>

      <div className="nav-row">
        <button className="btn" onClick={onPrev} disabled={pos <= 0}>
          ← Prev
        </button>
        <button className="btn" onClick={onNext} disabled={pos >= total - 1}>
          Next →
        </button>
      </div>

      <div className="inline" style={{ justifyContent: 'space-between' }}>
        <span className="tiny muted">
          <span className="kbd">←</span> <span className="kbd">→</span> to move ·{' '}
          <span className="kbd">D</span> marks done
        </span>
        <span className="seg" style={{ transform: 'scale(0.92)', transformOrigin: 'right' }}>
          <button className={wording === 'parts' ? 'on' : ''} onClick={() => onWording('parts')}>
            ×n
          </button>
          <button className={wording === 'touch' ? 'on' : ''} onClick={() => onWording('touch')}>
            touch
          </button>
        </span>
      </div>
    </div>
  )
}
