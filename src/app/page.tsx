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
  // Triple the playlist so we can loop scroll silently. The user always lives
  // in the middle copy (sections [N, 2N-1]); the first copy (0..N-1) and last
  // copy (2N..3N-1) act as buffers. When the user scrolls into a buffer copy,
  // an effect shifts scrollTop back to the equivalent position in the middle
  // copy — instant, invisible. Result: infinite scroll feel, no edge wrap
  // animation, no flicker because the destination already looks identical
  // to where the user was.
  const N = playlist.length
  const tripled: HomeVideo[] = N > 0 ? [...playlist, ...playlist, ...playlist] : []

  // IntersectionObserver tracks which absolute section is currently most
  // visible. Active video (modulo N) is what plays / highlights the dot.
  useEffect(() => {
    if (tripled.length === 0) return
    const root = scrollContainerRef.current
    const obs = new IntersectionObserver((entries) => {
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
  }, [tripled.length])

  // Once the playlist loads, jump the user to the START of the MIDDLE copy
  // (section index N). They have plenty of scroll room in either direction
  // before hitting a buffer-copy boundary.
  useEffect(() => {
    if (N === 0) return
    const container = scrollContainerRef.current
    const el = sectionRefs.current[N]
    if (!container || !el) return
    container.style.scrollBehavior = 'auto'
    container.scrollTop = el.offsetTop
    requestAnimationFrame(() => { container.style.scrollBehavior = '' })
  }, [N])

  // Silent shift: if the user lands in a buffer copy, translate scrollTop by
  // ±N sections so they live in the middle copy. CRITICAL: we wait for the
  // CSS scroll-snap animation to FINISH before shifting — otherwise the
  // teleport happens mid-snap and the user momentarily sees two sections
  // overlap (the buffer copy sliding in + the middle copy popped in). We
  // listen for the native `scrollend` event (Chrome 114+, Safari 17+, FF
  // 109+); on older browsers we fall back to a debounced no-scroll-for-150ms
  // timer.
  useEffect(() => {
    if (N === 0) return
    const container = scrollContainerRef.current
    if (!container) return

    const maybeShift = () => {
      // Read the actual scroll position, not the React state — that way the
      // shift is based on where the snap *settled*, not where the IO last
      // fired (the IO often fires mid-animation).
      const sectionHeight = container.clientHeight
      if (sectionHeight <= 0) return
      const settledIdx = Math.round(container.scrollTop / sectionHeight)
      let shiftTo = -1
      if (settledIdx < N) shiftTo = settledIdx + N
      else if (settledIdx >= 2 * N) shiftTo = settledIdx - N
      if (shiftTo < 0) return
      const el = sectionRefs.current[shiftTo]
      if (!el) return
      const prev = container.style.scrollBehavior
      container.style.scrollBehavior = 'auto'
      container.scrollTop = el.offsetTop
      requestAnimationFrame(() => { container.style.scrollBehavior = prev })
      setActiveIdx(shiftTo)
    }

    // Prefer native scrollend if available (precise; fires once when scroll
    // really stops). Always also attach a debounced scroll listener as a
    // belt-and-suspenders fallback for browsers that don't support scrollend.
    let scrollTimer: ReturnType<typeof setTimeout> | null = null
    const onScroll = () => {
      if (scrollTimer) clearTimeout(scrollTimer)
      scrollTimer = setTimeout(maybeShift, 150)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(container as any).addEventListener('scrollend', maybeShift)
    return () => {
      container.removeEventListener('scroll', onScroll)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(container as any).removeEventListener('scrollend', maybeShift)
      if (scrollTimer) clearTimeout(scrollTimer)
    }
  }, [N])

  // Keep every triple-playlist video playing continuously and synced.
  // Pausing the non-active copies was the source of the loop flicker:
  // when the silent-shift teleported the user from copy 3 to copy 2 of
  // the same video, copy 3 was at currentTime=X (mid-clip) but copy 2
  // had been paused at 0 — the jump from X to 0 was visible.
  // Strategy: make every video play(), then in a separate pass force
  // each playlist[k] copy across the three sections to share the same
  // currentTime, taking the FURTHEST-along copy as the reference. This
  // keeps the three copies of every video in lock-step so the shift is
  // visually invisible. Re-runs on activeIdx so we re-sync after every
  // navigation.
  useEffect(() => {
    if (N === 0) return
    // Phase 1: ensure every video is playing.
    sectionRefs.current.forEach(sec => {
      if (!sec) return
      const v = sec.querySelector('video')
      v?.play().catch(() => {})
    })
    // Phase 2: sync currentTime across the three copies of each video.
    for (let k = 0; k < N; k++) {
      const copies: HTMLVideoElement[] = []
      for (let c = 0; c < 3; c++) {
        const sec = sectionRefs.current[k + c * N]
        const v = sec?.querySelector('video') as HTMLVideoElement | null
        if (v) copies.push(v)
      }
      if (copies.length < 2) continue
      // Use the active section's currentTime as reference when it's one
      // of the copies (so on shift, we sync to the user's last visible
      // playback position).
      const activeCopy = copies.find((_, idx) => {
        const sectionIdx = k + idx * N
        return sectionIdx === activeIdx
      })
      const refTime = (activeCopy ?? copies.reduce((max, v) => v.currentTime > max.currentTime ? v : max, copies[0])).currentTime
      for (const v of copies) {
        if (Math.abs(v.currentTime - refTime) > 0.1) v.currentTime = refTime
      }
    }
  }, [activeIdx, N])

  // playlist-index for UI (which dot to highlight, etc.) — wraps the tripled
  // section index back into 0..N-1.
  const playlistIdx = N > 0 ? ((activeIdx % N) + N) % N : 0

  // Dot nav: scroll to the matching section in the MIDDLE copy. CSS
  // scroll-snap handles the snap; smooth scrollIntoView animates the move.
  const goTo = (playlistIndex: number) => {
    if (N === 0) return
    const el = sectionRefs.current[N + playlistIndex]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Keyboard nav — arrow keys / PageUp/Down / space. No edge-handling needed
  // because the silent-shift effect keeps the user inside the middle copy.
  useEffect(() => {
    if (N === 0) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        const el = sectionRefs.current[activeIdx + 1]
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault()
        const el = sectionRefs.current[activeIdx - 1]
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activeIdx, N])

  return (
    <PageTransition>
      <PageLoader show={loading} mode="data" />
      <div
        ref={scrollContainerRef}
        className="relative h-screen overflow-y-auto bg-black"
        // Native scroll-snap-y: every wheel / touch / keyboard scroll lands
        // on a section boundary. `scroll-snap-stop: always` (set per-section
        // below) limits each gesture to advancing by exactly one section, so
        // a fast trackpad flick can't skip past a video. We intentionally
        // DON'T set scroll-behavior: smooth here — that would slow the native
        // snap from ~200ms to ~500ms and (worse) would override our explicit
        // instant scroll in the loop-wrap handler. The dot-nav handler uses
        // scrollIntoView with smooth explicitly so its animation is still
        // smooth even without the CSS default.
        style={{
          scrollSnapType: 'y mandatory',
          overscrollBehavior: 'contain',
        }}
      >
        {/* Vertical stack of full-viewport video sections — tripled
            playlist so the user can scroll infinitely without ever hitting
            an edge. The silent-shift effect above keeps them in the middle
            copy. */}
        {tripled.map((v, i) => (
          <section
            key={`${v.src}-${i}`}
            ref={(el) => { sectionRefs.current[i] = el }}
            className="relative w-full h-screen overflow-hidden bg-black"
            style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
          >
            <video
              src={v.src}
              autoPlay
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

            {/* Scroll cue on the very first render only (middle copy's
                first section), fades once the user advances. */}
            {i === N && N > 1 && (
              <div
                className="absolute left-1/2 -translate-x-1/2 z-10 pointer-events-none flex flex-col items-center gap-2"
                style={{
                  bottom: '6.5rem',
                  opacity: playlistIdx === 0 ? 0.7 : 0,
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

        {/* Right-rail nav dots — one per UNIQUE video. Active dot is the
            playlist index (active section mod N). */}
        {N > 1 && (
          <div className="fixed right-6 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-3">
            {playlist.map((v, i) => (
              <button
                key={`dot-${v.src}-${i}`}
                aria-label={v.title || v.label || `Video ${i + 1}`}
                onClick={() => goTo(i)}
                className="rounded-full transition-all duration-300"
                style={{
                  width: 8,
                  height: i === playlistIdx ? 28 : 8,
                  background: i === playlistIdx ? '#fff' : 'rgba(255,255,255,0.4)',
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

      {/* Tagline shown on the first video in the playlist (any copy). */}
      {playlistIdx === 0 && (
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
