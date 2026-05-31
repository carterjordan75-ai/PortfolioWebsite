'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { upload } from '@vercel/blob/client'
import PageTransition from '@/components/PageTransition'
import PageLoader from '@/components/PageLoader'
import EmailPopup from '@/components/EmailPopup'
import AdminPortal from '@/components/AdminPortal'
import FooterBlurb from '@/components/FooterBlurb'
import { useDarkMode } from '@/contexts/DarkModeContext'
import { useEditMode } from '@/contexts/EditModeContext'

type MediaItem = { src: string; type: 'video' | 'image'; title: string; year: number; medium?: string | string[] }

// Split rule: anything tagged "Generative" → LEFT panel; everything else → right.
// Order is whatever the admin panel produced (no shuffling) so both the
// slideshow and the gallery view reflect the exact admin sequence.
const isGenerative = (m: MediaItem) => {
  const mediums = Array.isArray(m.medium) ? m.medium : [m.medium ?? '']
  return mediums.includes('Generative')
}

function MediaPanel({
  media,
  side,
  dark,
  expanded,
  otherExpanded,
  onToggleExpand,
  otherIndex,
  otherMedia,
  editMode = false,
  onDelete,
  onReplace,
  onReorder,
}: {
  media: MediaItem[]
  side: 'left' | 'right'
  dark: boolean
  expanded: boolean
  otherExpanded: boolean
  onToggleExpand: () => void
  otherIndex: number
  otherMedia: MediaItem[]
  // Edit-mode plumbing. When `editMode` is true the gallery tiles render
  // delete + replace + drag-handle controls. All operations route through
  // the parent so the canonical combined list stays the source of truth.
  editMode?: boolean
  onDelete?: (src: string) => void
  onReplace?: (src: string, file: File) => void
  onReorder?: (newOrder: MediaItem[]) => void
}) {
  const [index, setIndex] = useState(0)
  const [prevIndex, setPrevIndex] = useState<number | null>(null)
  const [slideDir, setSlideDir] = useState<'left' | 'right'>('left')
  const [animating, setAnimating] = useState(false)
  // Per-panel audio toggle. Default muted (browsers also require this for autoplay).
  // The button only appears for video items that have an audio track — detected
  // once the video's metadata loads.
  const [audioOn, setAudioOn] = useState(false)
  const [hasAudio, setHasAudio] = useState(false)
  // Gallery view — when true, the panel shows a grid of all items in this side
  // instead of the auto-cycling slideshow.
  // Default to slideshow (full-side single item). Gallery icon toggles to
  // grid. Previously default-on gallery view was a workaround for missing-
  // media; the actual fix landed on /api/misc + project-media surfacing so
  // we can go back to the cleaner slideshow on load.
  const [galleryView, setGalleryView] = useState(false)
  // Which thumbnail (if any) is currently hovered in the gallery grid. Drives
  // a magnetic-repulsion effect on the surrounding tiles — every other tile
  // gets pushed away from the hovered one, with the push amount falling off
  // by distance so adjacent tiles move most and distant tiles barely react.
  const [hoveredTile, setHoveredTile] = useState<number | null>(null)
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pushOffsets, setPushOffsets] = useState<{ x: number; y: number }[]>([])
  // Drag-reorder state — index of the tile being dragged, and the index
  // it's currently hovered over (for the visual drop-indicator). Only
  // populated while editMode is true.
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  // Hidden file input used by the per-tile Replace button. We track which
  // tile triggered the picker so the upload swaps the right item.
  const replaceInputRef = useRef<HTMLInputElement | null>(null)
  const [replaceTargetSrc, setReplaceTargetSrc] = useState<string | null>(null)

  // Whenever the user flips into edit mode, jump to gallery view — slideshow
  // doesn't show enough at once for editing to feel useful.
  useEffect(() => {
    if (editMode) setGalleryView(true)
  }, [editMode])
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const current = media[index]
  const prevMedia = prevIndex !== null ? media[prevIndex] : null

  // Reset hasAudio whenever the current item changes — we re-detect on next
  // loadedmetadata. Reset audioOn too so each new item starts muted.
  useEffect(() => {
    setHasAudio(false)
    setAudioOn(false)
  }, [current?.src])

  // Magnetic-repulsion: when a tile is hovered, compute a translate offset for
  // every other tile that pushes it away from the hovered tile's center. Uses
  // offsetLeft/Top (not getBoundingClientRect) so the source positions ignore
  // any in-flight transforms on the hovered tile itself. Linear falloff means
  // adjacent tiles get the strongest push and distant tiles get almost none.
  useEffect(() => {
    if (hoveredTile === null) {
      setPushOffsets([])
      return
    }
    const hoveredEl = tileRefs.current[hoveredTile]
    if (!hoveredEl) return
    const hCx = hoveredEl.offsetLeft + hoveredEl.offsetWidth / 2
    const hCy = hoveredEl.offsetTop + hoveredEl.offsetHeight / 2
    const maxPush = 8 // px at zero distance — subtle nudge, not a shove
    const falloffDist = 280 // distance (px) where push reaches zero
    const offsets: { x: number; y: number }[] = []
    for (let i = 0; i < media.length; i++) {
      const el = tileRefs.current[i]
      if (i === hoveredTile || !el) {
        offsets[i] = { x: 0, y: 0 }
        continue
      }
      const cx = el.offsetLeft + el.offsetWidth / 2
      const cy = el.offsetTop + el.offsetHeight / 2
      const dx = cx - hCx
      const dy = cy - hCy
      const dist = Math.hypot(dx, dy)
      if (dist < 1) {
        offsets[i] = { x: 0, y: 0 }
        continue
      }
      const factor = Math.max(0, 1 - dist / falloffDist)
      offsets[i] = {
        x: (dx / dist) * maxPush * factor,
        y: (dy / dist) * maxPush * factor,
      }
    }
    setPushOffsets(offsets)
  }, [hoveredTile, media.length])

  // Default auto-slide direction: left panel slides left, right panel slides right
  const autoDir = side === 'left' ? 'left' : 'right'

  const goTo = useCallback((newIdx: number, dir: 'left' | 'right') => {
    if (animating) return
    // Skip if this would show the same media as the other panel
    let idx = newIdx
    const otherSrc = otherMedia[otherIndex]?.src
    let attempts = 0
    while (media[idx]?.src === otherSrc && attempts < media.length) {
      idx = (idx + (dir === 'left' ? 1 : -1) + media.length) % media.length
      attempts++
    }
    setPrevIndex(index)
    setSlideDir(dir)
    setAnimating(true)
    setIndex(idx)
    setTimeout(() => { setAnimating(false); setPrevIndex(null) }, 500)
  }, [index, animating, media, otherMedia, otherIndex])

  const next = useCallback(() => goTo((index + 1) % media.length, autoDir), [index, media.length, goTo, autoDir])
  const prev = useCallback(() => goTo((index - 1 + media.length) % media.length, autoDir === 'left' ? 'right' : 'left'), [index, media.length, goTo, autoDir])

  // Auto-advance — stops when expanded or in gallery view. ONLY for images
  // (5s interval). Videos advance via `onEnded` on the playing element (see
  // renderMedia) so the full clip plays through before moving on.
  const delay = side === 'right' ? 1000 : 0
  useEffect(() => {
    // Always clear any existing interval when state changes
    if (autoTimer.current) {
      clearInterval(autoTimer.current)
      autoTimer.current = null
    }
    if (expanded) return
    if (galleryView) return
    if (current?.type !== 'image') return
    const startTimer = setTimeout(() => {
      autoTimer.current = setInterval(next, 5000)
    }, delay)
    return () => { clearTimeout(startTimer); if (autoTimer.current) clearInterval(autoTimer.current) }
  }, [next, delay, expanded, galleryView, current?.type, index])

  // Reset timer on manual navigation (only relevant for image items)
  const resetTimer = useCallback(() => {
    if (expanded) return
    if (current?.type !== 'image') return
    if (autoTimer.current) clearInterval(autoTimer.current)
    autoTimer.current = setInterval(next, 5000)
  }, [next, expanded, current?.type])

  const renderMedia = (
    item: typeof current,
    suffix: string,
    isExpanded: boolean,
    extraClass = '',
    opts: { loop?: boolean; onEnded?: () => void; muted?: boolean; onLoadedMetadata?: (e: React.SyntheticEvent<HTMLVideoElement>) => void } = {},
  ) => {
    const isBg = suffix.includes('bg')
    const isFg = suffix.includes('fg')
    // Background: always object-cover (fills screen), blur when expanded
    // Foreground: object-contain (shows full media without crop)
    const objectFit = isFg ? 'object-contain' : 'object-cover'
    const blurStyle = isExpanded && isBg ? { filter: 'blur(30px) brightness(0.4)', transform: 'scale(1.15)' } : {}
    const shouldLoop = opts.loop ?? true
    const isMuted = opts.muted ?? true

    return item.type === 'video' ? (
      <video
        key={item.src + suffix}
        autoPlay playsInline
        muted={isMuted}
        loop={shouldLoop}
        onEnded={opts.onEnded}
        onLoadedMetadata={opts.onLoadedMetadata}
        className={`absolute inset-0 w-full h-full ${objectFit} ${extraClass}`}
        src={item.src}
        style={blurStyle}
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={item.src + suffix}
        src={item.src}
        alt={item.title || ''}
        className={`absolute inset-0 w-full h-full ${objectFit} ${extraClass}`}
        style={blurStyle}
      />
    )
  }

  // Empty-state panel: when the admin has uploaded no media for this side,
  // render a clean black panel with a soft "no content yet" label rather than
  // crashing on `current.year` etc. (We accept this is the right behaviour —
  // the user explicitly does not want any default / placeholder media here.)
  if (media.length === 0 || !current) {
    return (
      <div
        className="relative h-full overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] flex items-center justify-center"
        style={{
          width: expanded ? '100%' : otherExpanded ? '0%' : '50%',
          opacity: otherExpanded ? 0 : 1,
          background: '#000',
          borderRight: side === 'left' && !expanded ? `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` : 'none',
        }}
      >
        <span
          className="text-[9px] font-bold uppercase tracking-[0.2em]"
          style={{ color: 'rgba(255,255,255,0.25)' }}
        >
          {side === 'left' ? 'Generative — coming soon' : 'Misc — coming soon'}
        </span>
      </div>
    )
  }

  return (
    <div
      className="relative h-full overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
      style={{
        width: expanded ? '100%' : otherExpanded ? '0%' : '50%',
        opacity: otherExpanded ? 0 : 1,
        borderRight: side === 'left' && !expanded ? `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` : 'none',
      }}
    >
      {/* ====== SLIDESHOW VIEW (hidden when gallery is on) ====== */}
      {!galleryView && (
      <>
      {/* Outgoing slide (previous media) */}
      {animating && prevMedia && (
        <div
          className="absolute inset-0 z-[2]"
          style={{
            animation: `slideOut${slideDir === 'left' ? 'Left' : 'Right'} 0.5s ease-in-out forwards`,
          }}
        >
          {renderMedia(prevMedia, '-out', false)}
        </div>
      )}

      {/* Incoming slide (current media) */}
      <div
        className="absolute inset-0"
        style={animating ? {
          animation: `slideIn${slideDir === 'left' ? 'Left' : 'Right'} 0.5s ease-in-out forwards`,
        } : {}}
      >
        {/* Background layer — for VIDEO items, disable looping and advance to
            the next item when the clip naturally ends. When the panel is
            expanded the visitor is examining the media full-screen, so we keep
            it looping and don't auto-advance. Images use the interval above.
            Also: detect audio tracks on metadata load + reflect the audioOn state. */}
        {renderMedia(current, '-bg', expanded, '', {
          loop: expanded,
          onEnded: expanded ? undefined : next,
          muted: !audioOn,
          onLoadedMetadata: (e) => {
            const v = e.currentTarget as HTMLVideoElement & {
              mozHasAudio?: boolean
              audioTracks?: { length: number }
            }
            if (v.audioTracks && typeof v.audioTracks.length === 'number') {
              setHasAudio(v.audioTracks.length > 0)
            } else if (typeof v.mozHasAudio === 'boolean') {
              setHasAudio(v.mozHasAudio)
            } else {
              // Detection not available in this browser — assume the video has audio
              // and show the toggle. Clicking it on a silent video is harmless.
              setHasAudio(true)
            }
          },
        })}

        {/* Expanded foreground — uncropped, always loops */}
        {expanded && renderMedia(current, '-fg', true, 'z-[1]')}
      </div>

      {/* Dark overlay for text legibility */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.5) 100%)' }} />

      {/* (Audio toggle is now part of the bottom-center cluster below — it
          slides in between Gallery and Expand when the current video has audio.) */}

      {/* Top — year + title */}
      <div className="absolute top-4 left-5 right-5 flex items-baseline justify-between z-10">
        <span className="text-[10px] font-mono text-white tracking-[0.1em]" style={{ opacity: 0.6 }}>
          [{current.year}]
        </span>
        <span className="text-[10px] font-bold text-white uppercase tracking-[0.08em]" style={{ opacity: 0.7 }}>
          {current.title}
        </span>
      </div>

      {/* Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <span className="text-[8px] font-mono text-white tracking-[0.15em]" style={{ opacity: 0.3 }}>
          {String(index + 1).padStart(2, '0')} / {String(media.length).padStart(2, '0')}
        </span>
      </div>

      {/* Medium tag */}
      {current.medium && (
        <div className="absolute bottom-16 left-5 z-10">
          <span className="text-[7px] font-mono uppercase tracking-[0.15em] px-2 py-1 rounded" style={{ background: 'rgba(0,0,0,0.4)', color: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(4px)' }}>
            {Array.isArray(current.medium) ? current.medium.join(' · ') : current.medium}
          </span>
        </div>
      )}

      {/* Bottom left — prev arrow. Solid mode-aware pill so it stays
          visible against every video/image frame. */}
      <button
        onClick={() => { prev(); resetTimer() }}
        className="absolute bottom-4 left-4 z-10 w-10 h-10 rounded-full flex items-center justify-center text-[14px] transition-all hover:scale-110 active:scale-95"
        style={{
          background: dark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.78)',
          color: dark ? '#000000' : '#ffffff',
          border: `1px solid ${dark ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)'}`,
          backdropFilter: 'blur(20px) saturate(140%)',
          WebkitBackdropFilter: 'blur(20px) saturate(140%)',
          boxShadow: dark ? '0 4px 24px rgba(0,0,0,0.18)' : '0 4px 24px rgba(0,0,0,0.45)',
        }}
      >
        ←
      </button>
      </>
      )}
      {/* ====== /SLIDESHOW VIEW ====== */}

      {/* ====== GALLERY VIEW ====== */}
      {galleryView && (
        <div
          className="absolute inset-0 z-[5] overflow-y-auto"
          style={{
            // Light mode = clean white; dark mode = near-black
            background: dark ? '#0a0a0a' : '#ffffff',
            // leave room at the bottom so the toggle pill doesn't overlap content
            paddingBottom: '96px',
          }}
        >
          {/* Gallery header — text + background flip with mode */}
          <div
            className="sticky top-0 z-10 px-5 py-4 flex items-baseline justify-between"
            style={{
              background: dark ? 'rgba(10,10,10,0.85)' : 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
            }}
          >
            <span
              className="text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ color: dark ? '#ffffff' : '#000000', opacity: 0.85 }}
            >
              {side === 'left' ? 'Generative' : 'Misc'} — Gallery
            </span>
            <span
              className="text-[8px] font-mono tracking-[0.15em]"
              style={{ color: dark ? '#ffffff' : '#000000', opacity: 0.5 }}
            >
              {String(media.length).padStart(2, '0')} items
            </span>
          </div>

          {/* Thumbnail grid — comfortable gap so tiles breathe. Grid-level
              onMouseLeave clears the hover index so when the cursor leaves the
              whole gallery (not just one tile) every tile returns to default. */}
          <div
            className="grid gap-2 p-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
            onMouseLeave={() => setHoveredTile(null)}
          >
            {media.map((item, i) => {
              // When ANOTHER tile is hovered, this tile gets pushed away from
              // the hovered tile's center (magnetic-repulsion). When this tile
              // IS hovered, isOtherHovered is false so Tailwind's hover:* takes
              // over uncontested for the pop. No opacity / blur changes —
              // neighbors only translate.
              const isOtherHovered = hoveredTile !== null && hoveredTile !== i
              const offset = pushOffsets[i]
              return (
              <button
                key={item.src + '-thumb-' + i}
                ref={(el) => { tileRefs.current[i] = el }}
                draggable={editMode}
                onDragStart={editMode ? (e) => {
                  setDragFromIdx(i)
                  // Some browsers refuse to start a drag unless data is set.
                  try { e.dataTransfer.setData('text/plain', String(i)) } catch {}
                  e.dataTransfer.effectAllowed = 'move'
                } : undefined}
                onDragOver={editMode ? (e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragFromIdx !== null && dragOverIdx !== i) setDragOverIdx(i)
                } : undefined}
                onDragLeave={editMode ? () => {
                  if (dragOverIdx === i) setDragOverIdx(null)
                } : undefined}
                onDrop={editMode ? (e) => {
                  e.preventDefault()
                  const from = dragFromIdx
                  setDragFromIdx(null)
                  setDragOverIdx(null)
                  if (from === null || from === i) return
                  const next = [...media]
                  const [moved] = next.splice(from, 1)
                  next.splice(i, 0, moved)
                  onReorder?.(next)
                } : undefined}
                onDragEnd={editMode ? () => {
                  setDragFromIdx(null)
                  setDragOverIdx(null)
                } : undefined}
                onClick={(e) => {
                  e.stopPropagation()
                  // In edit mode the tile-body shouldn't open the slideshow —
                  // the user is mid-drag or about to click delete / replace.
                  if (editMode) return
                  setIndex(i)
                  setPrevIndex(null)
                  setAnimating(false)
                  setGalleryView(false)
                }}
                onMouseEnter={() => setHoveredTile(i)}
                className={`relative aspect-square overflow-hidden group ${editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer hover:scale-[1.24] hover:-translate-y-3 hover:z-10 hover:shadow-[0_56px_128px_rgba(0,0,0,0.55),0_20px_44px_rgba(0,0,0,0.35)] active:scale-[1.12] active:-translate-y-1'}`}
                style={{
                  background: '#000',
                  borderRadius: '8px',
                  willChange: 'transform, box-shadow',
                  // Magnetic push: inline transform only applies when a
                  // neighbor is hovered. When this tile itself is hovered,
                  // inline is undefined so Tailwind's hover:scale-* /
                  // hover:-translate-y-* compose naturally. In edit mode we
                  // suppress the magnetic effect entirely so drag-handles
                  // sit still under the cursor.
                  transform: !editMode && isOtherHovered && offset
                    ? `translate(${offset.x.toFixed(2)}px, ${offset.y.toFixed(2)}px)`
                    : undefined,
                  // Visual drop indicator — a bright outline on the tile
                  // the user is currently hovering over with a drag.
                  outline: editMode && dragOverIdx === i && dragFromIdx !== i ? '2px solid rgb(250,204,21)' : undefined,
                  outlineOffset: '2px',
                  opacity: editMode && dragFromIdx === i ? 0.4 : 1,
                  // Spring-out easing with a subtle overshoot for a tactile "pop" —
                  // same curve used on the site's other interactive controls so the
                  // motion vocabulary stays consistent. Doubled lift + translate
                  // make the tile clearly leave the grid surface on hover.
                  transition: 'transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 420ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.15s, outline-color 0.15s',
                }}
              >
                {/* Inner media wrapper — parallax doubled to keep pace with the
                    bigger outer lift. The outer tile springs out 24% with overshoot
                    in 420ms; this slowly opens 14% over 900ms so the imagery keeps
                    unfolding after the tile settles. */}
                <div
                  className="absolute inset-0 transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.14]"
                  style={{ willChange: 'transform' }}
                >
                  {item.type === 'video' ? (
                    <video
                      src={item.src}
                      autoPlay
                      muted
                      loop
                      playsInline
                      // Stop the inner media from capturing the drag itself —
                      // we want dragstart to fire on the BUTTON so the tile is
                      // the drag source. Images are draggable by default in
                      // every browser, hence the explicit false.
                      draggable={false}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.src}
                      alt={item.title || ''}
                      draggable={false}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                </div>
                {/* Edit affordances — delete + replace + drag-handle hint. Only
                    rendered in edit mode. Buttons stopPropagation so they
                    don't trigger tile-click navigation or drag. */}
                {editMode && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm(`Delete "${item.title || 'this item'}" from misc?`)) {
                          onDelete?.(item.src)
                        }
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Delete"
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold text-white"
                      style={{ background: 'rgba(248,113,113,0.9)', border: '1px solid rgba(255,255,255,0.3)', zIndex: 3 }}
                    >
                      ×
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setReplaceTargetSrc(item.src)
                        replaceInputRef.current?.click()
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Replace file"
                      className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full flex items-center justify-center text-white"
                      style={{ background: 'rgba(59,130,246,0.9)', border: '1px solid rgba(255,255,255,0.3)', zIndex: 3 }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10"/>
                        <polyline points="1 20 1 14 7 14"/>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                      </svg>
                    </button>
                    {/* Drag handle hint — bottom-centre dots icon */}
                    <span
                      className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-white pointer-events-none"
                      style={{ opacity: 0.7, fontSize: '14px', lineHeight: 1, zIndex: 3, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
                      aria-hidden="true"
                    >
                      ⠿
                    </span>
                  </>
                )}
                {/* Soft dark vignette + title overlay — slides up and fades in
                    on hover for a more deliberate reveal than a flat opacity flip. */}
                <div
                  className="absolute inset-0 flex flex-col justify-between p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-[350ms] ease-out"
                  style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 40%, transparent 55%, rgba(0,0,0,0.85) 100%)' }}
                >
                  <span
                    className="text-[8px] font-mono text-white tracking-[0.1em] transition-transform duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] -translate-y-1 group-hover:translate-y-0"
                    style={{ opacity: 0.7 }}
                  >
                    [{item.year}]
                  </span>
                  <span
                    className="text-[9px] font-bold text-white uppercase tracking-[0.08em] text-left leading-tight transition-transform duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] translate-y-1 group-hover:translate-y-0"
                  >
                    {item.title}
                  </span>
                </div>
                {/* Current-item indicator — small pink dot in the corner if
                    this is what was last shown in the slideshow. */}
                {i === index && (
                  <div
                    className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
                    style={{ background: '#ff69b4', boxShadow: '0 0 6px rgba(255,105,180,0.8)' }}
                  />
                )}
              </button>
              )
            })}
          </div>
          {/* Hidden file input shared by every tile's Replace button. The
              tile-click sets replaceTargetSrc and then click()s this input;
              onChange fires onReplace with the chosen file. */}
          {editMode && (
            <input
              ref={replaceInputRef}
              type="file"
              accept="image/*,video/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f && replaceTargetSrc) onReplace?.(replaceTargetSrc, f)
                setReplaceTargetSrc(null)
                // Reset so picking the SAME file again still fires onChange.
                if (e.target) e.target.value = ''
              }}
            />
          )}
        </div>
      )}
      {/* ====== /GALLERY VIEW ====== */}

      {/* Bottom center — Gallery + (Audio) + Expand circular buttons. Same
          w-10 h-10 footprint as the prev/next arrows so the whole bottom row
          reads as one consistent control strip. The audio button slides in
          between Gallery and Expand whenever the current media has audio —
          `layout` on the surrounding buttons makes them glide apart smoothly
          rather than jumping. */}
      {/* Bottom controls — wrapped in a single solid pill that's the inverse
          of the page mode, so the buttons inside stay readable against any
          backdrop (gallery thumbnails, video frames, anything). The pill
          itself has a backdrop blur to soften noisy content underneath. */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2 items-center px-2 py-2 rounded-full"
        style={{
          background: dark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.78)',
          color: dark ? '#000000' : '#ffffff',
          border: `1px solid ${dark ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)'}`,
          backdropFilter: 'blur(20px) saturate(140%)',
          WebkitBackdropFilter: 'blur(20px) saturate(140%)',
          boxShadow: dark
            ? '0 4px 24px rgba(0,0,0,0.18)'
            : '0 4px 24px rgba(0,0,0,0.45)',
        }}
      >
        <motion.button
          layout
          transition={{ layout: { duration: 0.42, ease: [0.34, 1.56, 0.64, 1] } }}
          onClick={(e) => { e.stopPropagation(); setGalleryView(v => !v) }}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:scale-110 active:scale-95"
          style={{
            // Icons inherit the pill's `color` — the pill is the inverse
            // of the page mode, so this stays readable regardless of what
            // gallery tile or video frame happens to be behind it.
            color: 'inherit',
            background: 'transparent',
            border: 'none',
            transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
          aria-label={galleryView ? 'Switch to slideshow' : 'Switch to gallery'}
        >
          {galleryView ? (
            // Three horizontal bars = slide list / "back to slideshow"
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <rect x="1" y="1" width="10" height="2" />
              <rect x="1" y="5" width="10" height="2" />
              <rect x="1" y="9" width="10" height="2" />
            </svg>
          ) : (
            // 2×2 grid = "gallery"
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <rect x="0" y="0" width="5" height="5" />
              <rect x="7" y="0" width="5" height="5" />
              <rect x="0" y="7" width="5" height="5" />
              <rect x="7" y="7" width="5" height="5" />
            </svg>
          )}
        </motion.button>

        {/* Audio toggle — slides in between Gallery and Expand when the
            current item is a video with audio. popLayout pops the button out
            of layout flow on exit so the surrounding buttons can close the
            gap immediately while the audio button fades / shrinks out. */}
        <AnimatePresence mode="popLayout" initial={false}>
          {!galleryView && current.type === 'video' && hasAudio && (
            <motion.button
              key="audio-toggle"
              layout
              initial={{ opacity: 0, scale: 0, width: 0 }}
              animate={{ opacity: 1, scale: 1, width: 36 }}
              exit={{ opacity: 0, scale: 0, width: 0 }}
              transition={{ duration: 0.42, ease: [0.34, 1.56, 0.64, 1] }}
              onClick={(e) => { e.stopPropagation(); setAudioOn(v => !v) }}
              className="h-9 rounded-full flex items-center justify-center hover:scale-110 active:scale-95"
              style={{
                overflow: 'hidden',
                flexShrink: 0,
                color: 'inherit',
                background: 'transparent',
                border: 'none',
                transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
              aria-label={audioOn ? 'Mute' : 'Unmute'}
            >
              {audioOn ? (
                <span className="flex gap-[2px] items-center" style={{ height: '12px' }}>
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="w-[2px] rounded-full"
                      style={{
                        background: 'currentColor',
                        animationName: 'navAudioBar',
                        animationDuration: '0.7s',
                        animationTimingFunction: 'ease-in-out',
                        animationDelay: `${i * 0.12}s`,
                        animationIterationCount: 'infinite',
                        animationDirection: 'alternate',
                        height: '4px',
                      }}
                    />
                  ))}
                </span>
              ) : (
                <span style={{ fontSize: '14px', lineHeight: 1 }}>♪</span>
              )}
            </motion.button>
          )}
        </AnimatePresence>

        {/* Expand / Collapse — kept visible in gallery view too. Lets the user
            enter gallery view from expanded mode (fullscreen gallery) and then
            collapse back to half-width gallery, or vice versa, without having
            to leave gallery view first. Flips to dark-on-white when gallery is
            open in light mode so it stays visible against the white grid. */}
        <motion.button
          layout
          transition={{ layout: { duration: 0.42, ease: [0.34, 1.56, 0.64, 1] } }}
          onClick={onToggleExpand}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:scale-110 active:scale-95"
          style={{
            color: 'inherit',
            background: 'transparent',
            border: 'none',
            transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            // Two diagonal corners pointing inward = "collapse"
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" aria-hidden="true">
              <path d="M5 2 V5 H2" />
              <path d="M9 12 V9 H12" />
            </svg>
          ) : (
            // Two diagonal corners pointing outward = "expand"
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" aria-hidden="true">
              <path d="M2 5 V2 H5" />
              <path d="M12 9 V12 H9" />
            </svg>
          )}
        </motion.button>
      </div>

      {/* Bottom right — next arrow (hidden in gallery view) */}
      {!galleryView && (
        <button
          onClick={() => { next(); resetTimer() }}
          className="absolute bottom-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center text-[14px] transition-all hover:scale-110 active:scale-95"
          style={{
            background: dark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.78)',
            color: dark ? '#000000' : '#ffffff',
            border: `1px solid ${dark ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)'}`,
            backdropFilter: 'blur(20px) saturate(140%)',
            WebkitBackdropFilter: 'blur(20px) saturate(140%)',
            boxShadow: dark ? '0 4px 24px rgba(0,0,0,0.18)' : '0 4px 24px rgba(0,0,0,0.45)',
          }}
        >
          →
        </button>
      )}
    </div>
  )
}

export default function ExperimentsPage() {
  const { dark, fg, fg60, borderThick } = useDarkMode()
  const [expandedSide, setExpandedSide] = useState<'left' | 'right' | null>(null)
  const [showEmail, setShowEmail] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  // Admin-managed items only — no static fallbacks. Empty arrays until the
  // API responds; if the admin has nothing in a given panel, that side stays
  // blank rather than showing test footage.
  // `originalCombined` is the canonical server state from the last fetch.
  // Edits in edit mode go into `pendingChanges['misc-page'].items` so they
  // travel through the same EditToolbar Save flow as text edits — that way
  // the global Save button enables the moment the user deletes / reorders /
  // replaces an item, and Discard reverts everything cleanly.
  const [originalCombined, setOriginalCombined] = useState<MediaItem[]>([])
  const { editMode, addChange, pendingChanges } = useEditMode()
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)

  // Derived current list: pending edits (if any) win over the server state.
  // When the EditToolbar's Save clears pendingChanges, this falls back to
  // originalCombined — which is refreshed from /api/misc on `admin-saved`.
  // Payload shape is { items, tombstones } so we can carry deleted srcs
  // along with the new items array; older array-only payloads from prior
  // commits still parse correctly via the Array.isArray branch.
  const combined = useMemo<MediaItem[]>(() => {
    const raw = pendingChanges['misc-page']?.items
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed
        if (parsed && Array.isArray(parsed.items)) return parsed.items as MediaItem[]
      } catch { /* fall through */ }
    }
    return originalCombined
  }, [pendingChanges, originalCombined])

  const left = useMemo(() => combined.filter(isGenerative), [combined])
  const right = useMemo(() => combined.filter(m => !isGenerative(m)), [combined])
  const [loading, setLoading] = useState(true)

  // Queue an items change into pendingChanges. Also computes which srcs
  // from the originally-displayed list are missing in the new list —
  // those are the user-deleted items, which get tombstoned so the auto-
  // surface fallback on the load path doesn't bring them back. Stored as
  // a JSON string so it fits the existing PendingChanges shape
  // (Record<string, Record<string, string>>).
  const queueItems = useCallback((next: MediaItem[]) => {
    const nextSrcs = new Set(next.map(m => m.src))
    const tombstones = originalCombined
      .filter(m => !nextSrcs.has(m.src))
      .map(m => m.src)
    addChange('misc-page', 'items', JSON.stringify({ items: next, tombstones }))
  }, [addChange, originalCombined])

  const handleDelete = useCallback((src: string) => {
    queueItems(combined.filter(m => m.src !== src))
  }, [combined, queueItems])

  // Replace still has to upload immediately (the new src isn't knowable
  // before the upload completes), but the items-array swap is queued so
  // the global Save commits it alongside any other pending edits.
  const handleReplace = useCallback(async (src: string, file: File) => {
    setUploadStatus(`⟳ Uploading ${file.name}…`)
    try {
      const extMatch = file.name.match(/\.[^.]+$/)
      const ext = extMatch ? extMatch[0].toLowerCase() : ''
      const pathname = `media/misc/${Date.now().toString(36)}${ext}`
      const blob = await upload(pathname, file, { access: 'public', handleUploadUrl: '/api/upload-token' })
      const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(file.name)
      const next = combined.map(m =>
        m.src === src ? { ...m, src: blob.url, type: (isVideo ? 'video' : 'image') as 'video' | 'image' } : m,
      )
      queueItems(next)
      setUploadStatus('✓ Uploaded — click Save All to commit')
      setTimeout(() => setUploadStatus(null), 2400)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Misc replace upload failed:', err)
      setUploadStatus(`✗ Upload failed: ${msg}`)
      setTimeout(() => setUploadStatus(null), 4000)
    }
  }, [combined, queueItems])

  const handleReorder = useCallback((panelFilter: (m: MediaItem) => boolean, newPanelOrder: MediaItem[]) => {
    let p = 0
    const next = combined.map(m => panelFilter(m) ? newPanelOrder[p++] : m)
    queueItems(next)
  }, [combined, queueItems])

  useEffect(() => {
    // Pull both /api/misc AND /api/projects so we can surface featured-project
    // media on /misc even if the auto-mirror missed a batch (which was the
    // case for the tiffany-holiday-campaign uploads before the AdminPortal
    // upload path was wired to mirror). The union is deduped by `src`.
    Promise.all([
      fetch('/api/misc').then(r => r.json()).catch(() => ({ items: [] })),
      fetch('/api/projects').then(r => r.json()).catch(() => ({ projects: [] })),
    ])
      .then(([miscData, projData]) => {
        const miscItems = (miscData.items || []) as MediaItem[]
        // Tombstones: blob URLs the user has explicitly deleted from
        // misc. We exclude them from the auto-surface fallback below
        // and (defensively) from the seen-set so they can't sneak back
        // in via any future surfacing logic.
        const tombstones = new Set<string>((miscData.tombstones as string[]) || [])
        type AdminProj = {
          slug?: string
          client?: string
          title?: string
          year?: number | string
          featured?: boolean
          tags?: string[]
          media?: Array<{ name?: string; path?: string }>
        }
        const projects = (projData.projects || []) as AdminProj[]
        // Set of client names that already have at least one misc entry —
        // those projects are considered "represented" in misc, so we skip
        // re-adding their project media (the misc list is the user-curated
        // truth for them). Only projects with ZERO misc representation get
        // their media auto-surfaced. This is what stops the same project
        // appearing twice when historical mirror entries already exist.
        const clientsInMisc = new Set(
          miscItems
            .map(m => (typeof m.title === 'string' ? m.title.trim() : ''))
            .filter(Boolean),
        )
        const featuredProjectItems: MediaItem[] = []
        for (const p of projects) {
          if (!p.featured) continue
          const client = (p.client || p.title || '').trim()
          if (client && clientsInMisc.has(client)) continue
          const media = p.media || []
          const tags = p.tags && p.tags.length > 0 ? p.tags : ['3D']
          for (const m of media) {
            if (!m.path) continue
            if (tombstones.has(m.path)) continue
            const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(m.path) || /\.(mp4|webm|mov|m4v)$/i.test(m.name || '')
            featuredProjectItems.push({
              src: m.path,
              type: isVideo ? 'video' : 'image',
              title: client || 'Featured',
              year: Number(p.year) || new Date().getFullYear(),
              medium: tags,
            })
          }
        }
        // Dedupe by src across the union, misc first.
        const seen = new Set(miscItems.map(m => m.src))
        const combined: MediaItem[] = [...miscItems]
        for (const it of featuredProjectItems) {
          if (!seen.has(it.src) && !tombstones.has(it.src)) {
            combined.push(it)
            seen.add(it.src)
          }
        }
        if (combined.length === 0) return
        setOriginalCombined(combined)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // After a Save All, refetch /api/misc so originalCombined reflects what
  // just committed. Without this, the next Discard would revert to whatever
  // the page loaded with — stale by however many save cycles have happened.
  useEffect(() => {
    const onSaved = () => {
      fetch('/api/misc').then(r => r.json()).then(d => {
        const items = (d.items || []) as MediaItem[]
        if (items.length > 0) setOriginalCombined(items)
      }).catch(() => {})
    }
    window.addEventListener('admin-saved', onSaved)
    return () => window.removeEventListener('admin-saved', onSaved)
  }, [])

  // Indices into each side's media list. Setters are unused (no manual cycling
  // — auto-advance is handled inside MediaPanel), so they live as constants.
  const leftIdx = 0
  const rightIdx = 0

  const toggleLeft = () => setExpandedSide(s => s === 'left' ? null : 'left')
  const toggleRight = () => setExpandedSide(s => s === 'right' ? null : 'right')

  // ESC key to collapse expanded view
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expandedSide) setExpandedSide(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [expandedSide])

  return (
    <PageTransition>
      <PageLoader show={loading} mode="data" />
      <div style={{ background: dark ? '#0a0a0a' : '#f5f5f0', color: fg, minHeight: '100vh' }}>
        <div className="flex" style={{ height: '100vh', paddingTop: '68px' }}>
          <MediaPanel
            media={left}
            side="left"
            dark={dark}
            expanded={expandedSide === 'left'}
            otherExpanded={expandedSide === 'right'}
            onToggleExpand={toggleLeft}
            otherIndex={rightIdx}
            otherMedia={right}
            editMode={editMode}
            onDelete={handleDelete}
            onReplace={handleReplace}
            onReorder={(newOrder) => handleReorder(isGenerative, newOrder)}
          />
          <MediaPanel
            media={right}
            side="right"
            dark={dark}
            expanded={expandedSide === 'right'}
            otherExpanded={expandedSide === 'left'}
            onToggleExpand={toggleRight}
            otherIndex={leftIdx}
            otherMedia={left}
            editMode={editMode}
            onDelete={handleDelete}
            onReplace={handleReplace}
            onReorder={(newOrder) => handleReorder(m => !isGenerative(m), newOrder)}
          />
        </div>

        {/* Upload-progress pill — only shown for the Replace flow's in-flight
            upload, since that's the only misc operation that does network IO
            outside the EditToolbar's Save. Delete + Reorder go straight into
            pendingChanges so the EditToolbar's own pill reports their save
            status. */}
        {editMode && uploadStatus && (() => {
          const isOk = uploadStatus.startsWith('✓')
          const isErr = uploadStatus.startsWith('✗')
          const palette = isOk
            ? { bg: 'rgba(34,197,94,0.18)', fg: 'rgb(74,222,128)', border: 'rgba(74,222,128,0.4)' }
            : isErr
              ? { bg: 'rgba(248,113,113,0.18)', fg: 'rgb(248,113,113)', border: 'rgba(248,113,113,0.5)' }
              : { bg: 'rgba(234,179,8,0.15)', fg: 'rgb(250,204,21)', border: 'rgba(250,204,21,0.4)' }
          return (
            <div
              className="fixed top-[80px] left-1/2 -translate-x-1/2 z-[9998] text-[10px] font-bold uppercase tracking-[0.1em] px-3.5 py-1.5 rounded-full"
              style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}`, backdropFilter: 'blur(12px)' }}
            >
              {uploadStatus}
            </div>
          )
        })()}

        {/* Footer — below media, scroll down to see */}
        <footer className="px-6 md:px-10 py-5" style={{ borderTop: `3px solid ${borderThick}` }}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-3 flex-shrink-0">
              <button onClick={() => setShowEmail(true)} className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}` }}>Email</button>
              <a href="https://instagram.com/jordanscarter" target="_blank" rel="noopener noreferrer" className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}` }}>Insta</a>
            </div>
            <FooterBlurb pageId="misc" className="hidden md:block text-[9px] leading-[1.5] tracking-[0.04em] uppercase max-w-2xl text-center" style={{ color: fg60 }} />
            <div className="flex gap-3 flex-shrink-0">
              <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="w-14 h-14 rounded-full flex items-center justify-center text-[16px] hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}` }} aria-label="Back to top">↑</button>
              <button onClick={() => setShowAdmin(true)} className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}`, color: fg60 }}>© 2026</button>
            </div>
          </div>
        </footer>
      </div>
      <EmailPopup show={showEmail} onClose={() => setShowEmail(false)} />
      <AdminPortal show={showAdmin} onClose={() => setShowAdmin(false)} />
    </PageTransition>
  )
}
