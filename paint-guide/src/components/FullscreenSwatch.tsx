import { useEffect, useState } from 'react'
import { recipeItems, rgbToHex, luminance, type Guide } from '../engine'
import type { AmountWording } from '../db/types'
import { amountLabel, coordLabel } from '../lib/format'

interface Props {
  guide: Guide
  pos: number
  wording: AmountWording
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
  onClose: () => void
}

// Fills the screen with the colour to paint — for holding a chip or wet paint
// against the display. Arrows step colours, I toggles the info, Esc closes.
export default function FullscreenSwatch({
  guide,
  pos,
  wording,
  onPrev,
  onNext,
  canPrev,
  canNext,
  onClose,
}: Props) {
  const [info, setInfo] = useState(true)
  const color = guide.colors[guide.order[pos]]

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') onNext()
      else if (e.key === 'ArrowLeft') onPrev()
      else if (e.key === 'i' || e.key === 'I') setInfo((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNext, onPrev])

  if (!color) return null

  const ink = luminance(color.rgb) > 0.5 ? '#14151a' : '#ffffff'
  const items = recipeItems(color.match.parts)

  return (
    <div className="fs-swatch" style={{ background: rgbToHex(color.rgb), color: ink }}>
      <div className="fs-top">
        <div className="fs-title">
          Colour {pos + 1}{' '}
          <span style={{ opacity: 0.6 }}>
            of {guide.order.length} · {coordLabel(color.firstRow, color.firstCol)}
          </span>
        </div>
        <div className="fs-actions">
          <button className="fs-btn" onClick={() => setInfo((v) => !v)} title="Toggle info (I)">
            {info ? 'Hide info' : 'Show info'}
          </button>
          <button className="fs-btn" onClick={onClose} title="Close (Esc)">
            ✕ Close
          </button>
        </div>
      </div>

      <button className="fs-nav fs-left" onClick={onPrev} disabled={!canPrev} aria-label="Previous colour">
        ‹
      </button>
      <button className="fs-nav fs-right" onClick={onNext} disabled={!canNext} aria-label="Next colour">
        ›
      </button>

      {info && (
        <div className="fs-info">
          <div className="fs-code">{rgbToHex(color.rgb).toUpperCase()}</div>
          <div className="fs-mix">
            {color.custom ? (
              `Coloursmith custom pot — order this exact colour, no mixing`
            ) : (
              <>
                Mix:{' '}
                {items.map((it, i) => (
                  <span key={it.key}>
                    {i > 0 ? ' · ' : ''}
                    {it.name} {amountLabel(it.count, wording)}
                  </span>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
