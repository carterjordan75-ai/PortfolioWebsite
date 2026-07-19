import { recipeItems, rgbToHex, PALETTE, type Guide } from '../engine'
import { coordLabel } from '../lib/format'

interface Props {
  guide: Guide
  pos: number
  doneByColor: number[]
  hideCompleted: boolean
  onOpen: (pos: number) => void
}

export default function ColorList({ guide, pos, doneByColor, hideCompleted, onOpen }: Props) {
  return (
    <div className="colors">
      {guide.order.map((colorIndex, k) => {
        const color = guide.colors[colorIndex]
        const doneCount = doneByColor[colorIndex] ?? 0
        const allDone = doneCount >= color.count
        const isActive = k === pos
        if (hideCompleted && allDone && !isActive) return null
        const items = recipeItems(color.match.parts).slice(0, 4)
        const pctTxt = color.count > 0 ? Math.round((doneCount / color.count) * 100) : 0
        return (
          <div
            key={colorIndex}
            className={'color-row' + (isActive ? ' active' : '') + (allDone ? ' done' : '')}
            onClick={() => onOpen(k)}
            title="Open checklist"
          >
            <span className="sw" style={{ background: rgbToHex(color.rgb) }} />
            <span className="lab">
              <div className="nm">
                Colour {k + 1}
                <span className="muted" style={{ marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>
                  {coordLabel(color.firstRow, color.firstCol)}
                </span>
              </div>
              {color.custom ? (
                <div
                  className="sub"
                  style={{
                    marginTop: 3,
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 10.5,
                    color: 'var(--muted-2)',
                  }}
                >
                  {rgbToHex(color.rgb).toUpperCase()}
                </div>
              ) : (
                <div className="sub" style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                  {items.map((it) => (
                    <span
                      key={it.key}
                      title={it.name + ' ×' + it.count}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 3,
                        background: rgbToHex(PALETTE[it.key].rgb),
                        border: '1px solid rgba(255,255,255,0.18)',
                      }}
                    />
                  ))}
                </div>
              )}
            </span>
            <span className="pct">
              {allDone ? '✓' : `${pctTxt}%`}
              <div className="tiny" style={{ color: 'var(--muted-2)' }}>
                {color.count}px
              </div>
            </span>
          </div>
        )
      })}
    </div>
  )
}
