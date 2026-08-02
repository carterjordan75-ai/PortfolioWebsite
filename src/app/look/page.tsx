'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useDarkMode } from '@/contexts/DarkModeContext'
import PageTransition from '@/components/PageTransition'
import PageLoader from '@/components/PageLoader'
import EmailPopup from '@/components/EmailPopup'
import AdminPortal from '@/components/AdminPortal'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { motion, AnimatePresence } from 'framer-motion'

type GalleryItem = {
  src: string
  type: 'image' | 'video'
  cols: number
  rows: number
  credit: string
  source?: string
}

type RawItem = Omit<GalleryItem, 'cols' | 'rows'>

// Measure a media item's natural aspect ratio (w/h) by preloading it.
// Falls back to 4:3 (images) / 16:9 (videos) on error or after 4s so a
// single broken URL can't hold the whole gallery hostage.
const measureAspect = (item: RawItem): Promise<number> =>
  new Promise(resolve => {
    let settled = false
    const settle = (v: number) => {
      if (!settled) { settled = true; resolve(v) }
    }
    const fallback = setTimeout(() => settle(item.type === 'video' ? 16 / 9 : 4 / 3), 4000)
    if (item.type === 'image') {
      const img = new window.Image()
      img.onload = () => { clearTimeout(fallback); settle(img.naturalWidth / Math.max(1, img.naturalHeight)) }
      img.onerror = () => { clearTimeout(fallback); settle(4 / 3) }
      img.src = item.src
    } else {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.muted = true
      v.onloadedmetadata = () => { clearTimeout(fallback); settle(v.videoWidth / Math.max(1, v.videoHeight)) }
      v.onerror = () => { clearTimeout(fallback); settle(16 / 9) }
      v.src = item.src
    }
  })

// Pick the tile span whose cell shape sits closest to the media's true
// aspect ratio — portrait images get tall cells, wides get wide ones —
// so object-cover only ever crops a sliver. Cell shapes are computed
// from a FIXED design basis (1440×900 desktop → a 1×1 cell is ~1.82:1)
// rather than the live viewport, so the choice is deterministic and
// doesn't wobble with window size or measure-time quirks. Log-distance
// compares ratios symmetrically; the small area penalty stops
// everything from grabbing the biggest cell on near-ties.
const chooseSpan = (aspect: number, index: number): { cols: number; rows: number } => {
  const CELL_W = 1440 / 4
  const CELL_H = 900 * 0.22
  const candidates = [
    { cols: 1, rows: 1 }, { cols: 2, rows: 1 }, { cols: 1, rows: 2 },
    { cols: 1, rows: 3 }, { cols: 2, rows: 3 },
  ]
  let best = candidates[0]
  let bestScore = Infinity
  for (const c of candidates) {
    const cellAspect = (c.cols * CELL_W) / (c.rows * CELL_H)
    const score = Math.abs(Math.log(cellAspect / Math.max(0.01, aspect))) + c.cols * c.rows * 0.02
    if (score < bestScore) { bestScore = score; best = c }
  }
  // Rhythm: every 5th item that landed on a 1×1 doubles to 2×2 — the
  // shape (and therefore the crop) is identical, it's purely a scale
  // statement to keep the mosaic lively.
  if (best.cols === 1 && best.rows === 1 && index % 5 === 0) {
    return { cols: 2, rows: 2 }
  }
  return best
}

// Look gallery is admin-only — there is no default / fallback list. Items come
// from /api/look, which reads per-file metadata stored in Vercel Blob.

export default function LookPage() {
  const { dark, fg60, borderThick } = useDarkMode()
  const fg = dark ? '#ededed' : '#1a1a1a'
  const scrollRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number>(0)
  const speedRef = useRef(0.5)
  const [activeItem, setActiveItem] = useState<number | null>(null)
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showEmail, setShowEmail] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)

  // Close the isolated (lightbox) view and let the auto-scroll resume.
  // Used by the backdrop click, the Close button, and Escape alike.
  const closeLightbox = useCallback(() => {
    setActiveItem(null)
    setTimeout(() => { speedRef.current = 0.5 }, 500)
  }, [])
  useEscapeToClose(activeItem !== null, closeLightbox)

  // Visibility-gated video playback. The gallery repeats its items to
  // make the loop feel endless, so N videos become 3N <video> elements —
  // far past the browser's concurrent-decoder limit (Safari gives up
  // after a handful), which left most videos frozen on frame one. An
  // IntersectionObserver plays only what's actually on screen and
  // pauses the rest, so the decoder budget is never exceeded. Combined
  // with preload="none" this also stops every clip (one is 24MB) from
  // downloading at once.
  const videoObserverRef = useRef<IntersectionObserver | null>(null)
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const obs = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const video = entry.target as HTMLVideoElement
          if (entry.isIntersecting) {
            video.play().catch(() => { /* autoplay policy / decoder busy */ })
          } else {
            video.pause()
          }
        }
      },
      { root, rootMargin: '200px 0px', threshold: 0.1 },
    )
    videoObserverRef.current = obs
    // Adopt any videos that mounted before the observer existed.
    root.querySelectorAll('video').forEach(v => obs.observe(v))

    // Safety net: kick off playback for the first screenful directly,
    // by geometry, rather than relying on the observer's initial
    // callback. If the observer were ever throttled or delayed, this
    // guarantees the visible tiles still play instead of a gallery of
    // frozen frames.
    const kick = window.setTimeout(() => {
      const rr = root.getBoundingClientRect()
      root.querySelectorAll('video').forEach(v => {
        const r = v.getBoundingClientRect()
        if (r.bottom > rr.top && r.top < rr.bottom) {
          (v as HTMLVideoElement).play().catch(() => {})
        }
      })
    }, 300)

    return () => {
      window.clearTimeout(kick)
      obs.disconnect()
      videoObserverRef.current = null
    }
  }, [galleryItems.length])

  const registerVideo = useCallback((el: HTMLVideoElement | null) => {
    if (el) videoObserverRef.current?.observe(el)
  }, [])

  // Fetch uploaded look items + the Pinterest board feed in parallel
  // (each independently fault-tolerant), then preload every item to
  // measure its NATURAL aspect ratio and give it the closest-matching
  // tile shape. The grid renders once, fully measured — no reflow as
  // images trickle in, and because spans are decided on the base list,
  // every loop-copy lays out identically so the silent scroll-loop
  // jump stays invisible.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [uploadsRes, pinsRes] = await Promise.all([
        fetch('/api/look').then(r => r.json()).catch(() => ({ items: [] })),
        fetch('/api/look-pinterest').then(r => r.json()).catch(() => ({ items: [] })),
      ])
      const raw: RawItem[] = []
      for (const item of (uploadsRes.items || []) as Array<{ path: string; fileName?: string; credits?: string; link?: string }>) {
        if (!item.path) continue
        const isVideo = /\.(mp4|webm|mov)$/i.test(item.fileName || item.path)
        raw.push({
          src: item.path,
          type: isVideo ? 'video' : 'image',
          credit: item.credits || 'Uploaded',
          source: item.link || undefined,
        })
      }
      const pinCredit = pinsRes.boardTitle ? `Pinterest — ${pinsRes.boardTitle}` : 'Pinterest'
      for (const pin of (pinsRes.items || []) as Array<{ src: string; link: string; type?: string }>) {
        // Video pins are imported as self-hosted MP4s by the sync; the
        // feed marks them type: 'video' so they render as <video>.
        raw.push({
          src: pin.src,
          type: pin.type === 'video' ? 'video' : 'image',
          credit: pinCredit,
          source: pin.link,
        })
      }
      // Shuffle the combined list once (Fisher–Yates) so the gallery opens on a
      // fresh order every visit. Done on the base list *before* spanning and the
      // loop-repeat, so each loop-copy still lays out identically and the
      // scroll-loop jump stays invisible.
      for (let i = raw.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[raw[i], raw[j]] = [raw[j], raw[i]]
      }
      const aspects = await Promise.all(raw.map(measureAspect))
      if (cancelled) return
      setGalleryItems(raw.map((r, i) => ({ ...r, ...chooseSpan(aspects[i], i) })))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Repeat the items enough times to make the infinite-scroll loop feel
  // continuous. With a dozen+ items we triple them (existing behaviour);
  // with fewer we multiply more aggressively so 1-2 items still produce
  // a scrollable, looping gallery instead of three sad cells in the
  // top-left.
  const allItems = (() => {
    if (galleryItems.length === 0) return []
    // Aim for ~36 total cells (≈9 rows in the 4-col grid → easy to loop).
    const multiplier = Math.max(3, Math.ceil(36 / galleryItems.length))
    const out: GalleryItem[] = []
    for (let i = 0; i < multiplier; i++) out.push(...galleryItems)
    return out
  })()

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (galleryItems.length === 0) return

    let lastTime = performance.now()

    const animate = (now: number) => {
      const dt = now - lastTime
      lastTime = now
      if (activeItem === null) {
        el.scrollTop += speedRef.current * (dt / 16)
      }
      const totalHeight = el.scrollHeight
      const viewHeight = el.clientHeight
      if (el.scrollTop > totalHeight - viewHeight - 100) {
        el.scrollTop = totalHeight / 3
      }
      animRef.current = requestAnimationFrame(animate)
    }

    el.scrollTop = el.scrollHeight / 3
    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [activeItem, galleryItems.length])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let timeout: ReturnType<typeof setTimeout>
    const onWheel = () => {
      speedRef.current = 0
      clearTimeout(timeout)
      timeout = setTimeout(() => { speedRef.current = 0.5 }, 2000)
    }
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('touchstart', onWheel, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onWheel)
      clearTimeout(timeout)
    }
  }, [])

  const activeData = activeItem !== null ? allItems[activeItem] : null

  return (
    <PageTransition>
      <PageLoader show={loading} mode="data" />
      <div style={{ background: '#000000', minHeight: '100vh' }}>
        <div
          ref={scrollRef}
          className="overflow-y-auto overflow-x-hidden"
          style={{ height: '100vh', paddingTop: '68px' }}
        >
          <div
            className="grid"
            style={{
              gridTemplateColumns: 'repeat(4, 1fr)',
              // Shorter base row so spanned tiles compose nicely: 1×1 tiles
              // are 22vh, the 2-row statements land at 44vh.
              gridAutoRows: '22vh',
              // Backfill gaps left by the span pattern — keeps the mosaic
              // edge-to-edge with no holes.
              gridAutoFlow: 'dense',
              width: '100%',
            }}
          >
            {allItems.map((item, i) => (
              <div
                key={i}
                className="relative overflow-hidden cursor-pointer group"
                style={{
                  gridColumn: `span ${item.cols}`,
                  gridRow: `span ${item.rows}`,
                  transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), z-index 0s',
                  zIndex: 1,
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget
                  el.style.transform = 'scale(1.06)'
                  el.style.zIndex = '20'
                  el.style.boxShadow = '0 8px 40px rgba(0,0,0,0.6)'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget
                  el.style.transform = 'scale(1)'
                  el.style.zIndex = '1'
                  el.style.boxShadow = 'none'
                }}
                onClick={() => {
                  speedRef.current = 0
                  setActiveItem(i)
                }}
              >
                {item.type === 'image' ? (
                  // object-cover in the grid so the mosaic tiles butt up
                  // edge-to-edge with no letterboxing — the lightbox still
                  // shows the full uncropped image (object-contain there).
                  // draggable=false + no context menu: this is other
                  // people's work, so the page displays and credits it
                  // rather than offering it for download.
                  <Image
                    src={item.src}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, 25vw"
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                    unoptimized
                  />
                ) : (
                  // No autoPlay + preload="none": the IntersectionObserver
                  // starts playback only for tiles actually on screen, so
                  // the browser's concurrent-decoder limit is never hit and
                  // off-screen clips cost no bandwidth.
                  <video
                    ref={registerVideo}
                    src={item.src}
                    muted
                    loop
                    playsInline
                    preload="none"
                    disablePictureInPicture
                    onContextMenu={(e) => e.preventDefault()}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}

                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.15)' }}
                />
              </div>
            ))}
          </div>

        </div>

        {/* Fixed bottom text overlay */}
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 text-center pointer-events-auto"
          style={{ zIndex: 50 }}
        >
          <p
            className="text-[7px] uppercase tracking-[0.18em] leading-[1.8] px-6 py-2.5 rounded-full inline-block cursor-default"
            style={{
              color: 'rgba(255,255,255,0.5)',
              background: 'rgba(0,0,0,0.25)',
              backdropFilter: 'blur(40px) saturate(1.8)',
              WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget
              el.style.background = 'rgba(0,0,0,0.65)'
              el.style.color = 'rgba(255,255,255,0.9)'
              el.style.borderColor = 'rgba(255,255,255,0.2)'
              el.style.boxShadow = '0 8px 30px rgba(0,0,0,0.4)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget
              el.style.background = 'rgba(0,0,0,0.25)'
              el.style.color = 'rgba(255,255,255,0.5)'
              el.style.borderColor = 'rgba(255,255,255,0.08)'
              el.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)'
            }}
          >
            A living archive of references, obsessions &amp; visual fragments that shape the work. None of it mine — click any piece, then follow it back to its source.
          </p>
        </div>

        {/* Fullscreen lightbox */}
        <AnimatePresence>
          {activeItem !== null && activeData && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 flex items-center justify-center"
              style={{ zIndex: 10000, background: 'rgba(0,0,0,0.95)', cursor: 'zoom-out' }}
              onClick={closeLightbox}
            >
              {/* NOTE: no stopPropagation on this wrapper. It's a
                  90vw x 85vh box and the media inside is object-contain,
                  so most of it is empty letterbox around a portrait
                  image — swallowing clicks here made "click the empty
                  space" fail across most of the screen. Clicks fall
                  through to the backdrop and close; only the <video>
                  stops propagation, so its controls stay usable. */}
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="relative w-[90vw] h-[85vh] pointer-events-none"
              >
                {activeData.type === 'image' ? (
                  <Image
                    src={activeData.src}
                    alt={activeData.credit}
                    fill
                    className="object-contain"
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                    unoptimized
                  />
                ) : (
                  // controlsList/disablePictureInPicture strip the
                  // download + PiP entries from the native control menu.
                  // This is other people's work — the site shows it and
                  // links back; it doesn't hand out the files.
                  // pointer-events re-enabled + stopPropagation so the
                  // player controls work without closing the lightbox.
                  <video
                    src={activeData.src}
                    autoPlay
                    loop
                    playsInline
                    controls
                    controlsList="nodownload noplaybackrate"
                    disablePictureInPicture
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute inset-0 w-full h-full object-contain pointer-events-auto"
                  />
                )}
              </motion.div>

              {/* Credit overlay at bottom. The credit line IS the link to
                  the original when we have one — one obvious target
                  rather than a separate button. */}
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                transition={{ delay: 0.15, duration: 0.3 }}
                className="fixed bottom-0 left-0 right-0 py-5 px-8 flex items-center justify-between"
                style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' }}
              >
                {activeData.source ? (
                  <a
                    href={activeData.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="group flex items-center gap-2 text-white text-[12px] font-bold uppercase tracking-[0.1em] hover:opacity-80 transition-opacity"
                  >
                    <span style={{ borderBottom: '1px solid rgba(255,255,255,0.35)' }}>
                      {activeData.credit}
                    </span>
                    <span className="text-[10px] font-normal opacity-60 group-hover:opacity-100 transition-opacity">
                      view original ↗
                    </span>
                  </a>
                ) : (
                  <p className="text-white text-[12px] font-bold uppercase tracking-[0.1em]">
                    {activeData.credit}
                  </p>
                )}
                <button
                  onClick={closeLightbox}
                  className="text-[9px] uppercase tracking-[0.15em] text-white/50 px-4 py-1.5 rounded-full hover:text-white transition-all"
                  style={{ border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  Close
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <footer className="px-6 md:px-10 py-5" style={{ borderTop: `3px solid ${borderThick}`, background: dark ? '#0a0a0a' : '#f5f5f0' }}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-3 flex-shrink-0">
              <button onClick={() => setShowEmail(true)} className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}`, color: fg }}>Email</button>
              <a href="https://instagram.com/jordanscarter" target="_blank" rel="noopener noreferrer" className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}`, color: fg }}>Insta</a>
            </div>
            <p className="hidden md:block text-[9px] leading-[1.5] tracking-[0.04em] uppercase max-w-2xl text-center" style={{ color: fg60 }}>
              A curated gallery of visual references and inspirations — collected, not created. All work belongs to its original makers; open any piece to follow it back to the source.
            </p>
            <div className="flex gap-3 flex-shrink-0">
              <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="w-14 h-14 rounded-full flex items-center justify-center text-[16px] hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}`, color: fg }} aria-label="Back to top">↑</button>
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
