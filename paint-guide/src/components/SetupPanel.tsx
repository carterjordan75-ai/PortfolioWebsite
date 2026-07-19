import { useEffect, useState } from 'react'
import type { ProjectSettings } from '../db/types'
import { fmt, fromMM, toMM, type Unit } from '../lib/sizing'

interface Props {
  settings: ProjectSettings
  cols: number
  rows: number
  colorCount: number
  imageAspect: number // height / width
  onChange: (patch: Partial<ProjectSettings>) => void
}

function NumField({
  valueMM,
  unit,
  onCommit,
  disabled = false,
  step = 'any',
}: {
  valueMM: number
  unit: Unit
  onCommit: (mm: number) => void
  disabled?: boolean
  step?: string | number
}) {
  const [str, setStr] = useState(fmt(fromMM(valueMM, unit)))
  useEffect(() => {
    setStr(fmt(fromMM(valueMM, unit)))
  }, [valueMM, unit])
  return (
    <div className="unit-input">
      <input
        className="input num"
        inputMode="decimal"
        step={step}
        value={str}
        disabled={disabled}
        onChange={(e) => {
          setStr(e.target.value)
          const n = parseFloat(e.target.value)
          if (isFinite(n) && n > 0) onCommit(toMM(n, unit))
        }}
        onBlur={() => setStr(fmt(fromMM(valueMM, unit)))}
      />
      <span className="unit">{unit}</span>
    </div>
  )
}

export default function SetupPanel({
  settings,
  cols,
  rows,
  colorCount,
  imageAspect,
  onChange,
}: Props) {
  const [linked, setLinked] = useState(true)
  const unit = settings.unit
  const locked = settings.locked
  const totalPx = cols * rows

  return (
    <div className="section">
      <div className="h">
        <span>Size &amp; grid</span>
        <div className="inline" style={{ gap: 8 }}>
          <button
            className={'pill' + (locked ? ' on' : '')}
            onClick={() => onChange({ locked: !locked })}
            title={locked ? 'Unlock to change the grid' : "Lock the grid so it can't change mid-painting"}
          >
            {locked ? '🔒 Locked' : '🔓 Lock'}
          </button>
          <div className="seg" style={{ transform: 'scale(0.9)', transformOrigin: 'right' }}>
            <button className={unit === 'mm' ? 'on' : ''} onClick={() => onChange({ unit: 'mm' })}>
              mm
            </button>
            <button className={unit === 'cm' ? 'on' : ''} onClick={() => onChange({ unit: 'cm' })}>
              cm
            </button>
          </div>
        </div>
      </div>

      <div className="two">
        <div className="field">
          <label>Painting width</label>
          <NumField
            valueMM={settings.imageWidthMM}
            unit={unit}
            disabled={locked}
            onCommit={(mm) =>
              onChange(
                linked
                  ? { imageWidthMM: mm, imageHeightMM: Math.round(mm * imageAspect) }
                  : { imageWidthMM: mm },
              )
            }
          />
        </div>
        <div className="field">
          <label>
            Height{' '}
            <button
              className="kbd"
              disabled={locked}
              title={linked ? 'Locked to image aspect ratio' : 'Free — click to relink'}
              style={{ cursor: locked ? 'default' : 'pointer', borderColor: linked ? 'var(--accent)' : undefined, color: linked ? 'var(--accent)' : undefined }}
              onClick={() => {
                const next = !linked
                setLinked(next)
                if (next) onChange({ imageHeightMM: Math.round(settings.imageWidthMM * imageAspect) })
              }}
            >
              {linked ? '🔗 aspect' : '🔓 free'}
            </button>
          </label>
          <NumField
            valueMM={settings.imageHeightMM}
            unit={unit}
            disabled={locked}
            onCommit={(mm) => {
              setLinked(false)
              onChange({ imageHeightMM: mm })
            }}
          />
        </div>
      </div>

      <div className="field">
        <label>Pixel size (one square)</label>
        <NumField
          valueMM={settings.pixelSizeMM}
          unit={unit}
          disabled={locked}
          onCommit={(mm) => onChange({ pixelSizeMM: mm })}
        />
      </div>

      <div className="readout">
        <b>{fmt(fromMM(settings.imageWidthMM, unit))}</b> × <b>{fmt(fromMM(settings.imageHeightMM, unit))}</b> {unit} ·
        pixel <b>{fmt(fromMM(settings.pixelSizeMM, unit))}</b> {unit} →{' '}
        <b>{cols} × {rows}</b> grid · <b>{totalPx.toLocaleString()}</b> pixels · ≈{' '}
        <b>{colorCount}</b> colours
      </div>

      {locked && (
        <div className="notice info">🔒 Locked — unlock above to change size, pixel size or colour count.</div>
      )}

      <div className="field">
        <label>Paint set</label>
        <div className="seg" style={{ width: '100%' }}>
          <button
            style={{ flex: 1 }}
            className={settings.paintSet === 'mix' ? 'on' : ''}
            onClick={() => onChange({ paintSet: 'mix' })}
          >
            Mix your own
          </button>
          <button
            style={{ flex: 1 }}
            className={settings.paintSet === 'coloursmith' ? 'on' : ''}
            onClick={() => onChange({ paintSet: 'coloursmith' })}
          >
            Coloursmith
          </button>
        </div>
        <div className="tiny muted">
          {settings.paintSet === 'coloursmith'
            ? 'Every cell kept as its exact colour, made to order as a custom Coloursmith sample pot — no named range, no mixing. Use “Order pack” above.'
            : 'A median-cut palette you mix yourself from primaries.'}
        </div>
      </div>

      <div className="field">
        <label>
          Number of colours — {settings.maxColors}
          {locked && (
            <span className="muted" style={{ fontWeight: 400 }}>
              {' '}· 🔒 locked
            </span>
          )}
        </label>
        <input
          type="range"
          min={8}
          max={150}
          step={1}
          value={settings.maxColors}
          disabled={locked}
          onChange={(e) => onChange({ maxColors: Number(e.target.value) })}
          style={{ width: '100%' }}
        />
        <div className="inline tiny muted" style={{ justifyContent: 'space-between' }}>
          <span>Fewer · simpler</span>
          <span>More · detailed</span>
        </div>
        <div className="tiny muted" style={{ marginTop: 4 }}>
          The <b style={{ color: 'var(--text)' }}>{colorCount}</b>{' '}
          {settings.paintSet === 'coloursmith' ? 'custom pots' : 'colours'} that best fit the photo.
          More = finer detail{settings.paintSet === 'coloursmith' ? ', more pots to order' : ', more to mix'}.
        </div>
      </div>

      <div className="field">
        <label>Painting order</label>
        <div className="seg" style={{ width: '100%' }}>
          <button
            style={{ flex: 1 }}
            className={settings.order === 'reading' ? 'on' : ''}
            disabled={locked}
            onClick={() => onChange({ order: 'reading' })}
          >
            By grid position
          </button>
          <button
            style={{ flex: 1 }}
            className={settings.order === 'similar' ? 'on' : ''}
            disabled={locked}
            onClick={() => onChange({ order: 'similar' })}
          >
            By similar colour
          </button>
        </div>
        <div className="tiny muted">
          {settings.order === 'reading'
            ? 'Work across the grid: left → right, top → bottom (1,1 · 1,8 …).'
            : 'Each mix is close to the last, so you can nudge rather than re-mix.'}
        </div>
      </div>
    </div>
  )
}
