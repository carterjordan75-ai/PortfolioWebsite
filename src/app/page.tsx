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
  useDarkMode() // home page is dark-mode only; we don't read its colors but the hook keeps the context active.

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

  // Dot nav: native scrollIntoView. CSS scroll-snap snaps the result.
  const goTo = (target: number) => {
    const el = sectionRefs.current[target]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Loop wrap: when the user is on the last video and tries to advance, jump
  // to the first video (and vice versa for scrolling up from the first). The
  // jump is instant (no smooth) so the loop feels seamless — the user sees
  // a snap into the next section without a long animation through the whole
  // page height.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || playlist.length < 2) return

    const wrap = (dir: 1 | -1) => {
      const targetIdx = dir > 0 ? 0 : playlist.length - 1
      const el = sectionRefs.current[targetIdx]
      if (!el) return
      // Instant jump — no smooth scroll — so the wrap is invisible/snappy.
      container.scrollTo({ top: el.offsetTop, behavior: 'instant' as ScrollBehavior })
    }

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 12) return
      const atLast = activeIdx === playlist.length - 1
      const atFirst = activeIdx === 0
      if (e.deltaY > 0 && atLast) {
        e.preventDefault()
        wrap(1)
      } else if (e.deltaY < 0 && atFirst) {
        e.preventDefault()
        wrap(-1)
      }
    }
    container.addEventListener('wheel', handleWheel, { passive: false })

    let touchStartY = 0
    const handleTouchStart = (e: TouchEvent) => { touchStartY = e.touches[0].clientY }
    const handleTouchEnd = (e: TouchEvent) => {
      const dy = touchStartY - e.changedTouches[0].clientY
      if (Math.abs(dy) < 40) return
      const atLast = activeIdx === playlist.length - 1
      const atFirst = activeIdx === 0
      if (dy > 0 && atLast) wrap(1)
      else if (dy < 0 && atFirst) wrap(-1)
    }
    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        if (activeIdx === playlist.length - 1) {
          e.preventDefault()
          wrap(1)
        } else {
          e.preventDefault()
          goTo(activeIdx + 1)
        }
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        if (activeIdx === 0) {
          e.preventDefault()
          wrap(-1)
        } else {
          e.preventDefault()
          goTo(activeIdx - 1)
        }
      }
    }
    window.addEventListener('keydown', handleKey)

    return () => {
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('keydown', handleKey)
    }
  }, [activeIdx, playlist.length])

  return (
    <PageTransition>
      <PageLoader show={loading} mode="data" />
      <div
        ref={scrollContainerRef}
        className="relative h-screen overflow-y-auto bg-black"
        // Native scroll-snap-y: every wheel / touch / keyboard scroll lands
        // on a section boundary. `scroll-snap-stop: always` (set per-section
        // below) limits each gesture to advancing by exactly one section, so
        // a fast trackpad flick can't skip past a video. The keyboard arrow
        // handler above uses scrollIntoView smooth which the browser also
        // snap-aligns.
        style={{
          scrollSnapType: 'y mandatory',
          scrollBehavior: 'smooth',
          overscrollBehavior: 'contain',
        }}
      >
        {/* Vertical stack of full-viewport video sections. Each section
            takes one viewport height and snaps to the top of the scroll
            container. */}
        {playlist.map((v, i) => (
          <section
            key={`${v.src}-${i}`}
            ref={(el) => { sectionRefs.current[i] = el }}
            className="relative w-full h-screen overflow-hidden bg-black"
            style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
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

      </div>

      {/* Floating action overlay — bottom-center pill with the actions that
          used to live in the footer section. Always visible on top of every
          video so the user can email / open insta / hit admin from any frame
          without needing to scroll out of the reel. The reel itself now
          loops infinitely so there's no footer-as-end-of-scroll. */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
        <button
          onClick={() => setShowEmail(true)}
          className="w-11 h-11 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold backdrop-blur-md transition-all hover:scale-105"
          style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' }}
        >
          Email
        </button>
        <a
          href="https://instagram.com/jordanscarter"
          target="_blank"
          rel="noopener noreferrer"
          className="w-11 h-11 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold backdrop-blur-md transition-all hover:scale-105"
          style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' }}
        >
          Insta
        </a>
        <button
          onClick={() => setShowAdmin(true)}
          className="w-11 h-11 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold backdrop-blur-md transition-all hover:scale-105"
          style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' }}
        >
          © 2026
        </button>
      </div>

      {/* The blurb that used to sit centred in the footer — kept here as a
          subtle mid-page tagline that fades out once the user starts scrolling.
          Hidden behind the floating action pill so they don't overlap. */}
      {activeIdx === 0 && (
        <FooterBlurb
          pageId="work"
          className="hidden md:block fixed bottom-20 left-1/2 -translate-x-1/2 z-20 text-[8px] leading-[1.5] tracking-[0.08em] uppercase max-w-md text-center pointer-events-none"
          style={{ color: 'rgba(255,255,255,0.55)', textShadow: '0 1px 6px rgba(0,0,0,0.6)', transition: 'opacity 0.4s' }}
        />
      )}

      <EmailPopup show={showEmail} onClose={() => setShowEmail(false)} />
      <AdminPortal show={showAdmin} onClose={() => setShowAdmin(false)} />
    </PageTransition>
  )
}
