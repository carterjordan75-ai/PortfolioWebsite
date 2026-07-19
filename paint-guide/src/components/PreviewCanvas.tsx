import { useEffect, useRef, useState } from 'react'
import { luminance, rgbToHex, type Guide } from '../engine'
import { CSS_PX_PER_MM } from '../lib/sizing'
import type { ProjectSettings } from '../db/types'

interface Props {
  guide: Guide
  done: Uint8Array
  activeColorIndex: number
  settings: Pick<ProjectSettings, 'showGrid' | 'showCoords' | 'showNumbers' | 'pixelSizeMM'>
  isolate: boolean
  onIsolateChange: (v: boolean) => void
  onToggleSetting: (patch: Partial<ProjectSettings>) => void
  onPickCell: (i: number) => void
}

const MIN_SCALE = 2
const MAX_SCALE = 80
const NUM_MIN_SCALE = 11

interface Pt {
  x: number
  y: number
}

export default function PreviewCanvas({
  guide,
  done,
  activeColorIndex,
  settings,
  isolate,
  onIsolateChange,
  onToggleSetting,
  onPickCell,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [scale, setScale] = useState(12)
  const [offset, setOffset] = useState<Pt>({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)

  const { cols, rows } = guide
  const GUT = settings.showCoords ? 30 : 0

  // Refs so the native (non-passive) wheel handler reads fresh values.
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const offsetRef = useRef(offset)
  offsetRef.current = offset

  // Keep the grid inside the viewport: centre it if it's smaller, otherwise
  // pin its edges so you can't lose it off-screen.
  function clampOffset(o: Pt, sc: number): Pt {
    const gvw = viewport.w - GUT
    const gvh = viewport.h - GUT
    const gw = cols * sc
    const gh = rows * sc
    const x = gw <= gvw ? (gvw - gw) / 2 : Math.min(0, Math.max(gvw - gw, o.x))
    const y = gh <= gvh ? (gvh - gh) / 2 : Math.min(0, Math.max(gvh - gh, o.y))
    return { x, y }
  }

  function fitTo(vw = viewport.w, vh = viewport.h) {
    const gvw = vw - GUT
    const gvh = vh - GUT
    if (gvw <= 0 || gvh <= 0) return
    const s = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, Math.min((gvw - 16) / cols, (gvh - 16) / rows)),
    )
    setScale(s)
    setOffset({ x: (gvw - cols * s) / 2, y: (gvh - rows * s) / 2 })
  }

  // Zoom toward a point in the viewport (keeps the cell under it fixed).
  function zoomAt(px: number, py: number, ns: number) {
    const sc = scale
    if (ns === sc) return
    const cellX = (px - GUT - offset.x) / sc
    const cellY = (py - GUT - offset.y) / sc
    setScale(ns)
    setOffset(clampOffset({ x: px - GUT - cellX * ns, y: py - GUT - cellY * ns }, ns))
  }

  function zoomButton(dir: 1 | -1) {
    const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, dir > 0 ? scale * 1.25 : scale / 1.25))
    zoomAt(GUT + (viewport.w - GUT) / 2, GUT + (viewport.h - GUT) / 2, ns)
  }

  function actualSize() {
    const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(settings.pixelSizeMM * CSS_PX_PER_MM)))
    zoomAt(GUT + (viewport.w - GUT) / 2, GUT + (viewport.h - GUT) / 2, ns)
  }

  // Track viewport size.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect
      setViewport({ w: Math.floor(cr.width), h: Math.floor(cr.height) })
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // Fit when the grid changes; just re-clamp on plain resize.
  const lastFit = useRef('')
  useEffect(() => {
    if (viewport.w <= 0 || viewport.h <= 0) return
    const key = `${cols}x${rows}`
    if (lastFit.current !== key) {
      lastFit.current = key
      fitTo(viewport.w, viewport.h)
    } else {
      setOffset((o) => clampOffset(o, scaleRef.current))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, rows, viewport.w, viewport.h, GUT])

  // Re-centre on the active colour's first cell when it changes (not on mount).
  const firstActive = useRef(true)
  useEffect(() => {
    if (firstActive.current) {
      firstActive.current = false
      return
    }
    const col = guide.colors[activeColorIndex]
    const gvw = viewport.w - GUT
    const gvh = viewport.h - GUT
    if (!col || gvw <= 0) return
    const sc = scaleRef.current
    setOffset(
      clampOffset(
        { x: gvw / 2 - (col.firstCol + 0.5) * sc, y: gvh / 2 - (col.firstRow + 0.5) * sc },
        sc,
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeColorIndex])

  // Native wheel = zoom toward cursor (non-passive so we can preventDefault).
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const rect = cv!.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      if (px < GUT || py < GUT) return
      const sc = scaleRef.current
      const off = offsetRef.current
      const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, e.deltaY < 0 ? sc * 1.12 : sc / 1.12))
      if (ns === sc) return
      const cellX = (px - GUT - off.x) / sc
      const cellY = (py - GUT - off.y) / sc
      setScale(ns)
      setOffset(clampOffset({ x: px - GUT - cellX * ns, y: py - GUT - cellY * ns }, ns))
    }
    cv.addEventListener('wheel', onWheel, { passive: false })
    return () => cv.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [GUT, cols, rows, viewport.w, viewport.h])

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const vw = viewport.w
    const vh = viewport.h
    if (vw <= 0 || vh <= 0) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(vw * dpr)
    canvas.height = Math.round(vh * dpr)
    canvas.style.width = vw + 'px'
    canvas.style.height = vh + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, vw, vh)

    const cells = guide.cells
    const colors = guide.colors
    const hasActive = activeColorIndex >= 0
    const g = GUT
    const gvw = vw - g
    const gvh = vh - g

    const orderPos = new Array<number>(colors.length).fill(0)
    guide.order.forEach((ci, k) => (orderPos[ci] = k + 1))
    const isLight = colors.map((c) => luminance(c.rgb) > 0.5)
    const numText = isLight.map((l) => (l ? 'rgba(20,20,24,0.92)' : 'rgba(255,255,255,0.94)'))
    const checkCol = isLight.map((l) => (l ? 'rgba(28,28,32,0.85)' : 'rgba(255,255,255,0.9)'))
    const drawNumbers = settings.showNumbers && scale >= NUM_MIN_SCALE

    const c0 = Math.max(0, Math.floor(-offset.x / scale))
    const c1 = Math.min(cols, Math.ceil((gvw - offset.x) / scale))
    const r0 = Math.max(0, Math.floor(-offset.y / scale))
    const r1 = Math.min(rows, Math.ceil((gvh - offset.y) / scale))

    ctx.save()
    ctx.beginPath()
    ctx.rect(g, g, gvw, gvh)
    ctx.clip()

    if (drawNumbers) {
      ctx.font = `${Math.max(7, Math.floor(scale * 0.5))}px ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
    }

    for (let r = r0; r < r1; r++) {
      const y0 = Math.round(g + offset.y + r * scale)
      const y1 = Math.round(g + offset.y + (r + 1) * scale)
      for (let c = c0; c < c1; c++) {
        const i = r * cols + c
        const ci = cells[i]
        if (ci < 0) continue
        const x0 = Math.round(g + offset.x + c * scale)
        const x1 = Math.round(g + offset.x + (c + 1) * scale)
        const w = x1 - x0
        const h = y1 - y0
        ctx.fillStyle = rgbToHex(colors[ci].rgb)
        ctx.fillRect(x0, y0, w, h)
        if (isolate && hasActive && ci !== activeColorIndex) {
          ctx.fillStyle = 'rgba(122,124,128,0.64)'
          ctx.fillRect(x0, y0, w, h)
        }
        if (done[i]) {
          ctx.fillStyle = 'rgba(150,152,156,0.42)'
          ctx.fillRect(x0, y0, w, h)
          drawCheck(ctx, x0, y0, Math.min(w, h), checkCol[ci])
        } else if (drawNumbers) {
          ctx.fillStyle = numText[ci]
          ctx.fillText(String(orderPos[ci]), x0 + w / 2, y0 + h / 2 + 0.5)
        }
        if (hasActive && ci === activeColorIndex && scale >= 5) {
          ctx.strokeStyle = 'rgba(255,255,255,0.55)'
          ctx.lineWidth = 1
          ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1)
        }
      }
    }

    if (settings.showGrid && scale >= 4) {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      const top = Math.max(g, g + offset.y + r0 * scale)
      const bot = Math.min(vh, g + offset.y + r1 * scale)
      const left = Math.max(g, g + offset.x + c0 * scale)
      const right = Math.min(vw, g + offset.x + c1 * scale)
      for (let c = c0; c <= c1; c++) {
        const x = Math.round(g + offset.x + c * scale) + 0.5
        ctx.moveTo(x, top)
        ctx.lineTo(x, bot)
      }
      for (let r = r0; r <= r1; r++) {
        const y = Math.round(g + offset.y + r * scale) + 0.5
        ctx.moveTo(left, y)
        ctx.lineTo(right, y)
      }
      ctx.stroke()
    }

    ctx.restore()

    // Coordinate rulers (screen-space): V = vertical (rows), H = horizontal (cols).
    if (g > 0) {
      ctx.fillStyle = 'rgba(22,23,26,0.92)'
      ctx.fillRect(0, 0, vw, g)
      ctx.fillRect(0, 0, g, vh)
      ctx.fillStyle = 'rgba(160,166,174,0.95)'
      ctx.font = '10px ui-monospace, monospace'
      const step = scale >= 16 ? 5 : 10
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let c = c0; c < c1; c++) {
        if (c % step === 0 || c === cols - 1) {
          const cx = g + offset.x + c * scale + scale / 2
          if (cx > g + 8 && cx < vw - 2) ctx.fillText('H' + (c + 1), cx, g / 2)
        }
      }
      ctx.textAlign = 'right'
      for (let r = r0; r < r1; r++) {
        if (r % step === 0 || r === rows - 1) {
          const cy = g + offset.y + r * scale + scale / 2
          if (cy > g + 6 && cy < vh - 2) ctx.fillText('V' + (r + 1), g - 5, cy)
        }
      }
      ctx.fillStyle = 'rgba(22,23,26,0.98)'
      ctx.fillRect(0, 0, g, g)
      ctx.fillStyle = 'rgba(120,126,134,0.95)'
      ctx.font = '8px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillText('V/H', g / 2, g / 2)
    }
  }, [guide, done, activeColorIndex, scale, offset, viewport, isolate, settings.showGrid, settings.showCoords, settings.showNumbers, GUT])

  // ---- Pan + click ----
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null)

  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y, moved: false }
    setPanning(true)
  }
  function onMouseMove(e: React.MouseEvent) {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    setOffset(clampOffset({ x: d.ox + dx, y: d.oy + dy }, scale))
  }
  function onMouseUp(e: React.MouseEvent) {
    const d = dragRef.current
    dragRef.current = null
    setPanning(false)
    if (!d || d.moved) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left - GUT
    const sy = e.clientY - rect.top - GUT
    if (sx < 0 || sy < 0) return
    const c = Math.floor((sx - offset.x) / scale)
    const r = Math.floor((sy - offset.y) / scale)
    if (c < 0 || c >= cols || r < 0 || r >= rows) return
    const i = r * cols + c
    if (guide.cells[i] >= 0) onPickCell(i)
  }
  function onMouseLeave() {
    if (dragRef.current) {
      dragRef.current = null
      setPanning(false)
    }
  }

  return (
    <div className="stage">
      <div className="stage-tools">
        <div className="seg">
          <button onClick={() => zoomButton(-1)} title="Zoom out">
            −
          </button>
          <button onClick={() => zoomButton(1)} title="Zoom in">
            ＋
          </button>
        </div>
        <button className="btn sm" onClick={() => fitTo()}>
          Fit
        </button>
        <button className="btn sm" onClick={actualSize} title="Approximate real-world size (depends on monitor)">
          Actual size
        </button>
        <span className="stat tiny" style={{ marginLeft: 2 }}>
          {Math.round(scale)}px / cell
        </span>
        <div className="sp" />
        <div className="toggle-pills">
          <button
            className={'pill' + (settings.showNumbers ? ' on' : '')}
            onClick={() => onToggleSetting({ showNumbers: !settings.showNumbers })}
            title="Show each colour's painting-order number in its cells (zoom in to read)"
          >
            Numbers
          </button>
          <button
            className={'pill' + (isolate ? ' on' : '')}
            onClick={() => onIsolateChange(!isolate)}
            title="Mute every colour except the active one"
          >
            Isolate
          </button>
          <button
            className={'pill' + (settings.showGrid ? ' on' : '')}
            onClick={() => onToggleSetting({ showGrid: !settings.showGrid })}
          >
            Grid
          </button>
          <button
            className={'pill' + (settings.showCoords ? ' on' : '')}
            onClick={() => onToggleSetting({ showCoords: !settings.showCoords })}
          >
            Coords
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="canvas-wrap">
        <canvas
          ref={canvasRef}
          className="grid-canvas"
          style={{ cursor: panning ? 'grabbing' : 'grab' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
        />
        <div className="ruler-note">drag to pan · scroll to zoom · click a cell to open its colour · 1 cell = {settings.pixelSizeMM} mm</div>
      </div>
    </div>
  )
}

function drawCheck(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  if (s >= 11) {
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1, s * 0.1)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x + s * 0.26, y + s * 0.54)
    ctx.lineTo(x + s * 0.44, y + s * 0.72)
    ctx.lineTo(x + s * 0.76, y + s * 0.3)
    ctx.stroke()
  } else {
    ctx.fillStyle = color
    const d = Math.max(1.5, s * 0.34)
    ctx.fillRect(x + (s - d) / 2, y + (s - d) / 2, d, d)
  }
}
