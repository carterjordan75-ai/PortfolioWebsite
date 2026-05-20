'use client'

import { useState, useEffect, useRef } from 'react'
import PageTransition from '@/components/PageTransition'
import EmailPopup from '@/components/EmailPopup'
import AdminPortal from '@/components/AdminPortal'
import FooterBlurb from '@/components/FooterBlurb'
import PageLoader from '@/components/PageLoader'
import { useDarkMode } from '@/contexts/DarkModeContext'

type HomeVideo = {
  src: string
  title?: string
  category?: string
  year?: string | number
  label?: string  // legacy fallback
}

export default function Home() {
  const { fg, borderThick } = useDarkMode()

  // Home-page video playlist. Source-of-truth is the admin panel
  // (pages.json → home-page.videos). Starts empty so nothing flashes from
  // local test data while the fetch is in flight — the viewport stays black
  // until the admin list resolves.
  const [homeVideos, setHomeVideos] = useState<HomeVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [showEmail, setShowEmail] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  // Track which section is currently in view so we can pause off-screen
  // videos (saves CPU) and highlight the matching nav dot.
  const [activeIdx, setActiveIdx] = useState(0)
  const sectionRefs = useRef<Array<HTMLElement | null>>([])
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Load admin-managed home video list. The home page intentionally has no
    // other fallback — if the admin list is empty (or the fetch fails), the
    // viewport stays black rather than showing stale test footage.
    fetch('/api/pages')
      .then(r => r.json())
      .then(data => {
        const d = (data.pages || data)['home-page'] || {}
        if (Array.isArray(d.videos)) setHomeVideos(d.videos as HomeVideo[])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const playlist: HomeVideo[] = homeVideos

  // IntersectionObserver: whichever video section is most-visible becomes the
  // active one. Off-screen sections pause their videos to keep CPU/network
  // usage low when scrolling through a long playlist.
  useEffect(() => {
    if (playlist.length === 0) return
    const root = scrollContainerRef.current
    const obs = new IntersectionObserver((entries) => {
      // Pick the entry with the highest intersectionRatio.
      let best: IntersectionObserverEntry | null = null
      for (const e of entries) {
        if (!best || e.intersectionRatio > best.intersectionRatio) best = e
      }
      if (!best || best.intersectionRatio < 0.4) return
      const idx = sectionRefs.current.findIndex(el => el === best!.target)
      if (idx >= 0) setActiveIdx(idx)
    }, {
      root: root || null,
      threshold: [0.4, 0.6, 0.8, 1.0],
    })
    sectionRefs.current.forEach(el => { if (el) obs.observe(el) })
    return () => obs.disconnect()
  }, [playlist.length])

  // Pause every video except the active one. Plays the active one from where
  // it left off so the user sees something already moving when they snap.
  useEffect(() => {
    sectionRefs.current.forEach((sec, i) => {
      if (!sec) return
      const v = sec.querySelector('video')
      if (!v) return
      if (i === activeIdx) {
        v.play().catch(() => {})
      } else {
        v.pause()
      }
    })
  }, [activeIdx])

  // Custom snap-scroller. The browser's `scroll-behavior: smooth` is a slow
  // ~500ms ease-in-out that feels sluggish for a vertical reel. This handler
  // runs our own requestAnimationFrame loop with a tighter 350ms ease-out,
  // and snaps to one section per wheel "burst" / arrow press so the page
  // never lands between sections.
  const animScrollRef = useRef<number | null>(null)
  const isAnimatingRef = useRef(false)
  const snapTo = (target: number) => {
    const container = scrollContainerRef.current
    const el = sectionRefs.current[target]
    if (!container || !el) return
    if (animScrollRef.current) cancelAnimationFrame(animScrollRef.current)
    const start = container.scrollTop
    const distance = el.offsetTop - start
    if (Math.abs(distance) < 1) return
    const duration = 350
    const startTime = performance.now()
    const ease = (t: number) => 1 - Math.pow(1 - t, 3) // ease-out cubic
    isAnimatingRef.current = true
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1)
      container.scrollTop = start + distance * ease(progress)
      if (progress < 1) {
        animScrollRef.current = requestAnimationFrame(step)
      } else {
        animScrollRef.current = null
        // Small cooldown so the wheel event burst that triggered us doesn't
        // immediately fire another snap.
        setTimeout(() => { isAnimatingRef.current = false }, 80)
      }
    }
    animScrollRef.current = requestAnimationFrame(step)
  }

  const goTo = (target: number) => snapTo(target)

  // Wheel + touch input → one snap per gesture. We preventDefault on the
  // wheel/touch events while the snap is animating so the user can't queue
  // up multiple snaps from a single trackpad flick.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || playlist.length === 0) return

    // Always block native scroll. The decision whether to actually snap
    // happens below. Tiny wheel deltas (e.g. trackpad inertia tails) are
    // ignored for snapping but still consumed so they can't accumulate.
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (isAnimatingRef.current) return
      if (Math.abs(e.deltaY) < 12) return
      const dir = e.deltaY > 0 ? 1 : -1
      // playlist.length is the max valid index — that targets the footer
      // section (last entry in sectionRefs), so users can scroll past the
      // last video into the footer.
      const max = playlist.length // not length-1 — the footer takes index `length`
      const next = Math.max(0, Math.min(max, activeIdx + dir))
      if (next !== activeIdx) snapTo(next)
    }
    container.addEventListener('wheel', handleWheel, { passive: false })

    // Touch: track start Y, on end compute swipe direction.
    let touchStartY = 0
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY
    }
    const handleTouchEnd = (e: TouchEvent) => {
      if (isAnimatingRef.current) return
      const dy = touchStartY - e.changedTouches[0].clientY
      if (Math.abs(dy) < 40) return // ignore short taps
      const dir = dy > 0 ? 1 : -1
      const next = Math.max(0, Math.min(playlist.length, activeIdx + dir))
      if (next !== activeIdx) snapTo(next)
    }
    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })

    // Keyboard: arrows + page-down/up + space — same snap behaviour.
    const handleKey = (e: KeyboardEvent) => {
      if (isAnimatingRef.current) return
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        const next = Math.min(playlist.length, activeIdx + 1)
        if (next !== activeIdx) snapTo(next)
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault()
        const next = Math.max(0, activeIdx - 1)
        if (next !== activeIdx) snapTo(next)
      }
    }
    window.addEventListener('keydown', handleKey)

    return () => {
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('keydown', handleKey)
      if (animScrollRef.current) cancelAnimationFrame(animScrollRef.current)
    }
  }, [activeIdx, playlist.length])

  return (
    <PageTransition>
      <PageLoader show={loading} mode="data" />
      <div
        ref={scrollContainerRef}
        className="relative h-screen overflow-hidden bg-black"
        // Native scrolling is fully disabled — every scroll-equivalent gesture
        // (wheel, touch, keyboard) is intercepted in the useEffect below and
        // routed through our requestAnimationFrame snap animator. Without
        // overflow:hidden the browser would respond to tiny wheel deltas on
        // its own and the page would settle between sections.
      >
        {/* Vertical stack of full-viewport video sections. Each section
            takes one viewport height and snaps to the top of the scroll
            container. */}
        {playlist.map((v, i) => (
          <section
            key={`${v.src}-${i}`}
            ref={(el) => { sectionRefs.current[i] = el }}
            className="relative w-full h-screen overflow-hidden bg-black"
          >
            <video
              src={v.src}
              autoPlay={i === 0}
              muted
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Bottom-left: category */}
            {v.category && (
              <div className="absolute bottom-8 left-6 z-10 pointer-events-none">
                <p
                  className="text-[10px] md:text-xs uppercase tracking-[0.22em] text-white font-bold"
                  style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}
                >
                  {v.category}
                </p>
              </div>
            )}

            {/* Bottom-right: title + year */}
            {(v.title || v.label || v.year) && (
              <div className="absolute bottom-8 right-6 z-10 pointer-events-none flex flex-col items-end">
                {(v.title || v.label) && (
                  <h2
                    className="text-xl md:text-3xl font-black uppercase leading-[0.95] tracking-tight text-white"
                    style={{ textShadow: '0 2px 14px rgba(0,0,0,0.55)' }}
                  >
                    {v.title || v.label}
                  </h2>
                )}
                {v.year && (
                  <p
                    className="text-[10px] md:text-xs uppercase tracking-[0.22em] text-white/90 mt-1"
                    style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}
                  >
                    {v.year}
                  </p>
                )}
              </div>
            )}

            {/* Scroll cue on the first section only — fades out once the user
                starts scrolling. */}
            {i === 0 && playlist.length > 1 && (
              <div
                className="absolute left-1/2 -translate-x-1/2 z-10 pointer-events-none flex flex-col items-center gap-2"
                style={{
                  bottom: '6.5rem',
                  opacity: activeIdx === 0 ? 0.7 : 0,
                  transition: 'opacity 0.4s',
                }}
              >
                <span className="text-white text-[8px] uppercase tracking-[0.25em]" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                  Scroll
                </span>
                <span className="text-white text-[18px] animate-bounce">↓</span>
              </div>
            )}
          </section>
        ))}

        {/* Right-rail nav dots — one per video, sticky vertically centered. */}
        {playlist.length > 1 && (
          <div className="fixed right-6 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-3">
            {playlist.map((v, i) => (
              <button
                key={`dot-${v.src}-${i}`}
                aria-label={v.title || v.label || `Video ${i + 1}`}
                onClick={() => goTo(i)}
                className="rounded-full transition-all duration-300"
                style={{
                  width: 8,
                  height: i === activeIdx ? 28 : 8,
                  background: i === activeIdx ? '#fff' : 'rgba(255,255,255,0.4)',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        )}

        {/* Footer section — registered at sectionRefs[playlist.length] so the
            snap handler can scroll to it as a target. Wheel/touch/key gestures
            past the last video land here; the right-rail dots target videos
            only (no dot for the footer itself). */}
        <section
          ref={(el) => { sectionRefs.current[playlist.length] = el }}
          className="relative w-full h-screen overflow-hidden"
        >
          {playlist[Math.min(activeIdx, playlist.length - 1)]?.src && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
              <video
                key={`bg-${playlist[Math.min(activeIdx, playlist.length - 1)].src}`}
                src={playlist[Math.min(activeIdx, playlist.length - 1)].src}
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: 'blur(48px) saturate(1.4)', transform: 'scale(1.2)' }}
              />
            </div>
          )}
          {/* Footer is the shared glass-footer for material/blur, but we override
              border-radius and margins so it spans the full page width with no curved
              corners. All buttons + the blurb use the same `fg` color for uniformity. */}
          <footer
            className="relative px-6 md:px-10 py-5 glass-footer"
            style={{ borderRadius: 0, margin: 0, color: fg }}
          >
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-3 flex-shrink-0">
              <button
                onClick={() => setShowEmail(true)}
                className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform"
                style={{ border: `1.5px solid ${borderThick}`, color: fg }}
              >
                Email
              </button>
              <a
                href="https://instagram.com/jordanscarter"
                target="_blank"
                rel="noopener noreferrer"
                className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform"
                style={{ border: `1.5px solid ${borderThick}`, color: fg }}
              >
                Insta
              </a>
            </div>
            <FooterBlurb
              pageId="work"
              className="hidden md:block text-[9px] leading-[1.5] tracking-[0.04em] uppercase max-w-2xl text-center"
              style={{ color: fg }}
            />
            <div className="flex gap-3 flex-shrink-0">
              <button
                onClick={() => {
                  // Scroll the snap container, not the window — the window
                  // doesn't scroll in the vertical-snap layout.
                  scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="w-14 h-14 rounded-full flex items-center justify-center text-[16px] hover:scale-105 transition-transform"
                style={{ border: `1.5px solid ${borderThick}`, color: fg }}
                aria-label="Back to top"
              >
                ↑
              </button>
              <button
                onClick={() => setShowAdmin(true)}
                className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform"
                style={{ border: `1.5px solid ${borderThick}`, color: fg }}
              >
                © 2026
              </button>
            </div>
          </div>
          </footer>
        </section>
      </div>

      <EmailPopup show={showEmail} onClose={() => setShowEmail(false)} />
      <AdminPortal show={showAdmin} onClose={() => setShowAdmin(false)} />
    </PageTransition>
  )
}
