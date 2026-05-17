'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PageTransition from '@/components/PageTransition'
import PageLoader from '@/components/PageLoader'
import EmailPopup from '@/components/EmailPopup'
import AdminPortal from '@/components/AdminPortal'
import FooterBlurb from '@/components/FooterBlurb'
import { useDarkMode } from '@/contexts/DarkModeContext'

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
}: {
  media: MediaItem[]
  side: 'left' | 'right'
  dark: boolean
  expanded: boolean
  otherExpanded: boolean
  onToggleExpand: () => void
  otherIndex: number
  otherMedia: MediaItem[]
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
  const [galleryView, setGalleryView] = useState(false)
  // Which thumbnail (if any) is currently hovered in the gallery grid. Drives
  // a magnetic-repulsion effect on the surrounding tiles — every other tile
  // gets pushed away from the hovered one, with the push amount falling off
  // by distance so adjacent tiles move most and distant tiles barely react.
  const [hoveredTile, setHoveredTile] = useState<number | null>(null)
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pushOffsets, setPushOffsets] = useState<{ x: number; y: number }[]>([])
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

      {/* Bottom left — prev arrow */}
      <button
        onClick={() => { prev(); resetTimer() }}
        className="absolute bottom-4 left-4 z-10 w-10 h-10 rounded-full flex items-center justify-center text-white text-[14px] transition-all hover:scale-110 active:scale-95"
        style={{
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.15)',
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
                onClick={(e) => {
                  e.stopPropagation()
                  setIndex(i)
                  setPrevIndex(null)
                  setAnimating(false)
                  setGalleryView(false)
                }}
                onMouseEnter={() => setHoveredTile(i)}
                className="relative aspect-square overflow-hidden group cursor-pointer hover:scale-[1.24] hover:-translate-y-3 hover:z-10 hover:shadow-[0_56px_128px_rgba(0,0,0,0.55),0_20px_44px_rgba(0,0,0,0.35)] active:scale-[1.12] active:-translate-y-1"
                style={{
                  background: '#000',
                  borderRadius: '8px',
                  willChange: 'transform, box-shadow',
                  // Magnetic push: inline transform only applies when a
                  // neighbor is hovered. When this tile itself is hovered,
                  // inline is undefined so Tailwind's hover:scale-* /
                  // hover:-translate-y-* compose naturally.
                  transform: isOtherHovered && offset
                    ? `translate(${offset.x.toFixed(2)}px, ${offset.y.toFixed(2)}px)`
                    : undefined,
                  // Spring-out easing with a subtle overshoot for a tactile "pop" —
                  // same curve used on the site's other interactive controls so the
                  // motion vocabulary stays consistent. Doubled lift + translate
                  // make the tile clearly leave the grid surface on hover.
                  transition: 'transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 420ms cubic-bezier(0.34, 1.56, 0.64, 1)',
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
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.src}
                      alt={item.title || ''}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                </div>
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
        </div>
      )}
      {/* ====== /GALLERY VIEW ====== */}

      {/* Bottom center — Gallery + (Audio) + Expand circular buttons. Same
          w-10 h-10 footprint as the prev/next arrows so the whole bottom row
          reads as one consistent control strip. The audio button slides in
          between Gallery and Expand whenever the current media has audio —
          `layout` on the surrounding buttons makes them glide apart smoothly
          rather than jumping. */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-3 items-center">
        <motion.button
          layout
          transition={{ layout: { duration: 0.42, ease: [0.34, 1.56, 0.64, 1] } }}
          onClick={(e) => { e.stopPropagation(); setGalleryView(v => !v) }}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:scale-110 active:scale-95"
          style={{
            color: galleryView && !dark ? '#000000' : '#ffffff',
            background: galleryView && !dark ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: `1px solid ${galleryView && !dark ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'}`,
            transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.18s ease-out, color 0.18s ease-out, border-color 0.18s ease-out',
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
              animate={{ opacity: 1, scale: 1, width: 40 }}
              exit={{ opacity: 0, scale: 0, width: 0 }}
              transition={{ duration: 0.42, ease: [0.34, 1.56, 0.64, 1] }}
              onClick={(e) => { e.stopPropagation(); setAudioOn(v => !v) }}
              className="h-10 rounded-full flex items-center justify-center text-white hover:scale-110 active:scale-95"
              style={{
                overflow: 'hidden',
                flexShrink: 0,
                background: 'rgba(255,255,255,0.1)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.15)',
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
                        background: '#ffffff',
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
          className="w-10 h-10 rounded-full flex items-center justify-center hover:scale-110 active:scale-95"
          style={{
            color: galleryView && !dark ? '#000000' : '#ffffff',
            background: galleryView && !dark ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: `1px solid ${galleryView && !dark ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'}`,
            transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.18s ease-out, color 0.18s ease-out, border-color 0.18s ease-out',
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
          className="absolute bottom-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center text-white text-[14px] transition-all hover:scale-110 active:scale-95"
          style={{
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.15)',
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
  const [left, setLeft] = useState<MediaItem[]>([])
  const [right, setRight] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/misc')
      .then(r => r.json())
      .then(data => {
        if (data.items?.length) {
          const items = data.items as MediaItem[]
          // KEEPING the medium-based split: left = Generative, right = everything else.
          // Order is preserved exactly as it appears in the admin panel so the
          // slideshow and gallery views both match the admin sequence.
          setLeft(items.filter(isGenerative))
          setRight(items.filter(m => !isGenerative(m)))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
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
          />
        </div>

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
