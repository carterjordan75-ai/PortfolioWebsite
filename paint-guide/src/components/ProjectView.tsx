import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getImageBlob,
  getProgress,
  getProject,
  putProgress,
  putProject,
  touchProject,
} from '../db/db'
import type { ProjectMeta, ProjectSettings } from '../db/types'
import {
  buildGuide,
  imageToCellRGBA,
  loadImage,
  type Guide,
} from '../engine'
import { deriveGrid } from '../lib/sizing'
import { countDone, pct } from '../lib/count'
import SetupPanel from './SetupPanel'
import PreviewCanvas from './PreviewCanvas'
import Walkthrough from './Walkthrough'
import ColorList from './ColorList'
import ColorSheet from './ColorSheet'
import FullscreenSwatch from './FullscreenSwatch'
import ColoursmithOrder from './ColoursmithOrder'

const MAX_CELLS = 200_000

function countsFor(done: Uint8Array, guide: Guide): number[] {
  const arr = new Array<number>(guide.colors.length).fill(0)
  for (let i = 0; i < guide.cells.length; i++) {
    const ci = guide.cells[i]
    if (ci >= 0 && done[i]) arr[ci]++
  }
  return arr
}

export default function ProjectView({
  projectId,
  onBack,
}: {
  projectId: string
  onBack: () => void
}) {
  const [meta, setMeta] = useState<ProjectMeta | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [done, setDone] = useState<Uint8Array | null>(null)
  const [pos, setPos] = useState(0)
  const [isolate, setIsolate] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [fsOpen, setFsOpen] = useState(false)
  const [orderOpen, setOrderOpen] = useState(false)

  // Load project, image and progress.
  useEffect(() => {
    let alive = true
    setMeta(null)
    setImg(null)
    setDone(null)
    ;(async () => {
      const m = await getProject(projectId)
      if (!m || !alive) return
      // Backfill settings added after this project was created.
      if ((m.settings as Partial<ProjectSettings>).showNumbers === undefined) {
        m.settings.showNumbers = true
      }
      if ((m.settings as Partial<ProjectSettings>).dither === undefined) {
        m.settings.dither = false
      }
      if ((m.settings as Partial<ProjectSettings>).ditherColors === undefined) {
        m.settings.ditherColors = 18
      }
      if ((m.settings as Partial<ProjectSettings>).reduce === undefined) {
        m.settings.reduce = false
      }
      if ((m.settings as Partial<ProjectSettings>).maxColors === undefined) {
        m.settings.maxColors = 64
      }
      if ((m.settings as Partial<ProjectSettings>).paintSet === undefined) {
        m.settings.paintSet = 'mix'
      }
      // Porter's / Taubmans were retired — fall back to Coloursmith custom pots.
      if (
        (m.settings.paintSet as string) === 'porters' ||
        (m.settings.paintSet as string) === 'taubmans'
      ) {
        m.settings.paintSet = 'coloursmith'
      }
      // Colour count is now capped at 150 (never more pots than that).
      if (m.settings.maxColors > 150) m.settings.maxColors = 150
      touchProject(projectId)
      const blob = await getImageBlob(projectId)
      const image = blob ? await loadImage(blob) : null
      const prog = await getProgress(projectId)
      const total = m.cols * m.rows
      const d = prog && prog.length === total ? prog : new Uint8Array(total)
      if (!alive) return
      setMeta(m)
      setImg(image)
      setDone(d)
      setPos(0)
    })()
    return () => {
      alive = false
    }
  }, [projectId])

  // Down-sample the image to the grid (only when image or grid dims change).
  const cellRGBA = useMemo(() => {
    if (!img || !meta) return null
    return imageToCellRGBA(img, meta.cols, meta.rows)
  }, [img, meta?.cols, meta?.rows])

  // Build the full guide (only when pixels or colour settings change).
  const guide = useMemo(() => {
    if (!cellRGBA || !meta) return null
    return buildGuide(cellRGBA, meta.cols, meta.rows, {
      colorStep: meta.settings.colorStep,
      black: false, // Ivory Black is no longer used in mixes
      order: meta.settings.order,
      reduce: true, // smart median-cut reduction is the one mix-your-own mode
      maxColors: meta.settings.maxColors,
      paintSet: meta.settings.paintSet,
    })
  }, [
    cellRGBA,
    meta?.cols,
    meta?.rows,
    meta?.settings.maxColors,
    meta?.settings.paintSet,
    meta?.settings.order,
  ])

  const doneByColor = useMemo(() => {
    if (!guide || !done) return [] as number[]
    return countsFor(done, guide)
  }, [guide, done])

  const totalPaintable = useMemo(
    () => (guide ? guide.colors.reduce((s, c) => s + c.count, 0) : 0),
    [guide],
  )
  const doneTotal = useMemo(
    () => doneByColor.reduce((s, n) => s + n, 0),
    [doneByColor],
  )
  const overallPct = pct(doneTotal, totalPaintable)

  // Keep the active position in range as the colour count changes.
  useEffect(() => {
    if (guide && pos > guide.order.length - 1) {
      setPos(Math.max(0, guide.order.length - 1))
    }
  }, [guide, pos])

  // Persist (debounced) + flush on unmount so leaving never loses work.
  useEffect(() => {
    if (!meta) return
    const t = setTimeout(() => putProject(meta), 500)
    return () => clearTimeout(t)
  }, [meta])
  useEffect(() => {
    if (!meta || !done) return
    const id = meta.id
    const t = setTimeout(() => putProgress(id, done), 350)
    return () => clearTimeout(t)
  }, [done, meta?.id])

  const metaRef = useRef(meta)
  metaRef.current = meta
  const doneRef = useRef(done)
  doneRef.current = done
  useEffect(
    () => () => {
      if (metaRef.current) putProject(metaRef.current)
      if (metaRef.current && doneRef.current)
        putProgress(metaRef.current.id, doneRef.current)
    },
    [],
  )

  // ---- Mutations ----
  function updateSettings(patch: Partial<ProjectSettings>) {
    if (!meta) return
    const ns = { ...meta.settings, ...patch }
    const g1 = deriveGrid(ns.imageWidthMM, ns.imageHeightMM, ns.pixelSizeMM)
    const gridChanged = g1.cols !== meta.cols || g1.rows !== meta.rows
    if (gridChanged && g1.cols * g1.rows > MAX_CELLS) {
      window.alert(
        `That pixel size makes an impractically huge grid (${(
          g1.cols * g1.rows
        ).toLocaleString()} pixels). Increase the pixel size.`,
      )
      return
    }
    if (gridChanged && done && countDone(done) > 0) {
      const ok = window.confirm(
        "Changing the size re-grids the painting and clears the pixels you've ticked off so far. Continue?",
      )
      if (!ok) return
    }
    if (gridChanged) {
      setDone(new Uint8Array(g1.cols * g1.rows))
      setPos(0)
    }
    setMeta({ ...meta, settings: ns, cols: g1.cols, rows: g1.rows })
  }

  function toggleCell(i: number) {
    if (!done) return
    const nd = new Uint8Array(done)
    nd[i] = nd[i] ? 0 : 1
    setDone(nd)
  }

  // Clicking the image selects that cell's colour and opens its checklist
  // (ticking happens only in the list, never on the image).
  function pickCellColor(i: number) {
    if (!guide) return
    const ci = guide.cells[i]
    if (ci < 0) return
    const k = guide.order.indexOf(ci)
    if (k >= 0) openSheet(k)
  }

  function markColor(value: boolean) {
    if (!done || !guide) return
    const ci = guide.order[pos]
    if (ci == null) return
    const nd = new Uint8Array(done)
    for (let i = 0; i < guide.cells.length; i++) {
      if (guide.cells[i] === ci) nd[i] = value ? 1 : 0
    }
    setDone(nd)
    if (value) {
      const counts = countsFor(nd, guide)
      let next = pos
      const N = guide.order.length
      for (let k = pos + 1; k < N; k++) {
        const idx = guide.order[k]
        if (counts[idx] < guide.colors[idx].count) {
          next = k
          break
        }
      }
      if (next === pos) {
        for (let k = 0; k < N; k++) {
          const idx = guide.order[k]
          if (counts[idx] < guide.colors[idx].count) {
            next = k
            break
          }
        }
      }
      if (next !== pos) setPos(next)
    }
  }

  function isFullyDone(k: number): boolean {
    if (!guide) return false
    const idx = guide.order[k]
    return (doneByColor[idx] ?? 0) >= guide.colors[idx].count
  }

  function go(dir: 1 | -1) {
    if (!guide) return
    const N = guide.order.length
    let k = pos + dir
    if (meta?.settings.hideCompleted) {
      while (k >= 0 && k < N && isFullyDone(k)) k += dir
    }
    if (k >= 0 && k < N) setPos(k)
  }

  function openSheet(k: number) {
    setPos(k)
    setSheetOpen(true)
    setIsolate(true) // focus the canvas on this colour while you tick its cells
  }

  // Keyboard: arrows move, D marks the colour done.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'))
        return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        go(1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        go(-1)
      } else if (e.key === 'd' || e.key === 'D') {
        markColor(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!meta) {
    return (
      <div className="ws">
        <div className="topbar">
          <button className="btn ghost" onClick={onBack}>
            ← Projects
          </button>
        </div>
        <div className="empty">Loading…</div>
      </div>
    )
  }

  const imageAspect = meta.imageW > 0 ? meta.imageH / meta.imageW : 1

  return (
    <div className="ws">
      <div className="topbar">
        <button className="btn ghost" onClick={onBack}>
          ← Projects
        </button>
        <span className="name">{meta.name}</span>
        <button
          className="btn sm"
          onClick={() => setOrderOpen(true)}
          disabled={!guide}
          title="Order these colours as custom Coloursmith sample pots"
        >
          ◫ Order pack
        </button>
        <div className="grow" />
        <span className="stat">
          {doneTotal.toLocaleString()} / {totalPaintable.toLocaleString()} px ·{' '}
          {overallPct}% painted
        </span>
        <div className={'bar' + (overallPct === 100 ? ' good' : '')} style={{ width: 160 }}>
          <i style={{ width: `${overallPct}%` }} />
        </div>
      </div>

      <div className="ws-body">
        {guide && done ? (
          <PreviewCanvas
            guide={guide}
            done={done}
            activeColorIndex={guide.order[pos] ?? -1}
            settings={meta.settings}
            isolate={isolate}
            onIsolateChange={setIsolate}
            onToggleSetting={updateSettings}
            onPickCell={pickCellColor}
          />
        ) : (
          <div className="stage">
            <div className="empty">Preparing the grid…</div>
          </div>
        )}

        <div className="sidebar">
          <SetupPanel
            settings={meta.settings}
            cols={meta.cols}
            rows={meta.rows}
            colorCount={guide ? guide.colors.length : 0}
            imageAspect={imageAspect}
            onChange={updateSettings}
          />

          {guide && (
            <Walkthrough
              guide={guide}
              pos={pos}
              doneByColor={doneByColor}
              wording={meta.settings.wording}
              onPrev={() => go(-1)}
              onNext={() => go(1)}
              onMarkDone={() => markColor(true)}
              onMarkUndone={() => markColor(false)}
              onWording={(w) => updateSettings({ wording: w })}
              onOpenSheet={() => openSheet(pos)}
              onExpand={() => setFsOpen(true)}
            />
          )}

          {guide && (
            <div className="section">
              <div className="h">
                <span>Colours ({guide.colors.length})</span>
                <button
                  className={'pill' + (meta.settings.hideCompleted ? ' on' : '')}
                  onClick={() => updateSettings({ hideCompleted: !meta.settings.hideCompleted })}
                >
                  Hide done
                </button>
              </div>
              <ColorList
                guide={guide}
                pos={pos}
                doneByColor={doneByColor}
                hideCompleted={meta.settings.hideCompleted}
                onOpen={(k) => openSheet(k)}
              />
            </div>
          )}

          <div className="section">
            <div className="disclaimer">
              <strong style={{ color: 'var(--muted)' }}>A few honest notes.</strong>{' '}
              Recipes approximate real pigment behaviour — treat them as a strong
              starting point and trust your eye in daylight. Oils stay wet for days,
              so adjacent wet pixels can bleed: keep paint stiff, use a small
              palette-knife tip, and work on a smooth panel. Photos make far more
              colours than pixel art — lean on a simpler, lower-colour reference for
              fine pixel sizes.
            </div>
          </div>
        </div>

        {sheetOpen && guide && done && (
          <ColorSheet
            guide={guide}
            colorIndex={guide.order[pos]}
            done={done}
            wording={meta.settings.wording}
            onToggleCell={toggleCell}
            onMarkAll={markColor}
            onPrev={() => go(-1)}
            onNext={() => go(1)}
            canPrev={pos > 0}
            canNext={pos < guide.order.length - 1}
            onClose={() => setSheetOpen(false)}
            onExpand={() => setFsOpen(true)}
          />
        )}

        {fsOpen && guide && (
          <FullscreenSwatch
            guide={guide}
            pos={pos}
            wording={meta.settings.wording}
            onPrev={() => setPos(Math.max(0, pos - 1))}
            onNext={() => setPos(Math.min(guide.order.length - 1, pos + 1))}
            canPrev={pos > 0}
            canNext={pos < guide.order.length - 1}
            onClose={() => setFsOpen(false)}
          />
        )}

        {orderOpen && guide && (
          <ColoursmithOrder meta={meta} guide={guide} onClose={() => setOrderOpen(false)} />
        )}
      </div>
    </div>
  )
}
