'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
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
  // Slug of a featured project. When set, the video shows a pill
  // linking through to /work/<slug>.
  projectSlug?: string
}

// ─── Scroll-reactive number rail ─────────────────────────────────────
// Fixed to the left edge, vertically centred. Shows the 1-based number of
// the video currently in view (01..N). Driven by a rAF loop that reads the
// scroll container directly and writes styles straight to the DOM — zero
// React re-renders while scrolling.
//
// Motion model — TENSION + RELEASE, not 1:1 tracking:
//   - `railPos` (what the strip displays) chases the real scroll position
//     through an underdamped spring. While the scroll travels to the next
//     video, railPos lags behind — the gap between them is "tension".
//   - The centre digit stretches (scaleY) with that tension, like it's
//     being pulled toward the incoming video. When the scroll lands, the
//     spring releases: railPos catches up, overshoots a touch, and pings
//     into place while the stretch snaps back through <1 (squash).
//   - Neighbours above/below fade AND shrink progressively with distance
//     from the centre — ±1 clearly readable, ±2 a whisper, ±3 gone.
//   - The rail fades up while scrolling / settling and rests at a subtle
//     residue on the current number when idle.
// Works in playlist space (position mod N) so the triple-playlist silent
// shift is invisible to it, and the numbers wrap N→1 seamlessly.
function ScrollNumberRail({
  containerRef,
  count,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  count: number
}) {
  const numberRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    if (count <= 1) return
    const container = containerRef.current
    if (!container) return

    const SPACING = 116       // px between adjacent numbers on the strip
    const RAIL_K = 0.055      // spring pull of railPos toward the scroll pos
    const RAIL_DAMP = 0.78    // heavier damping → ping lands with little recoil
    const TENSION_S = 2.8     // tension gap (sections) → extra scaleY
    const MAX_EXTRA = 1.8     // cap: scaleY tops out at 2.8 (exaggerated pull)
    const STIFFNESS = 0.18    // stretch spring pull toward its target
    const DAMPING = 0.70      // stretch spring damping (quick, quiet release)

    let raf = 0
    let lastRawPos: number | null = null
    let railPos = 0           // sprung display position (tripled space)
    let railVel = 0
    let stretch = 1
    let stretchVel = 0
    let energy = 0            // 0..1 scroll-activity, drives the fade
    let lastScrollTs = 0

    const onScroll = () => { lastScrollTs = performance.now() }
    container.addEventListener('scroll', onScroll, { passive: true })

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const h = container.clientHeight
      if (h <= 0) return
      const pos = container.scrollTop / h            // float, tripled space

      // First frame: adopt the position outright (no fly-in). On the
      // silent-shift teleport (scrollTop jumps ±count sections in one
      // frame) carry railPos along by the same delta so the gap — and
      // therefore the animation — is continuous across the shift.
      if (lastRawPos === null) {
        railPos = pos
      } else {
        const rawDelta = pos - lastRawPos
        if (Math.abs(rawDelta) > count / 2) railPos += rawDelta
      }
      lastRawPos = pos

      // Rail spring: railPos chases pos. The lag IS the tension; the
      // underdamped catch-up IS the ping into place.
      railVel = (railVel + (pos - railPos) * RAIL_K) * RAIL_DAMP
      railPos += railVel
      const gap = pos - railPos

      // Stretch follows the tension through its own underdamped spring —
      // build while the gap grows, snap back through <1 when it releases.
      const target = 1 + Math.min(Math.abs(gap) * TENSION_S, MAX_EXTRA)
      stretchVel = (stretchVel + (target - stretch) * STIFFNESS) * DAMPING
      stretch += stretchVel

      // Activity: recent scroll OR the rail still settling.
      // Asymmetric lerp — fast fade-in, slow fade-out (site-wide motif).
      const activeNow = (performance.now() - lastScrollTs < 400)
        || Math.abs(gap) > 0.02
        || Math.abs(railVel) > 0.003
      energy = energy + ((activeNow ? 1 : 0) - energy) * (activeNow ? 0.16 : 0.05)

      const p = ((railPos % count) + count) % count  // wrapped playlist space

      for (let i = 0; i < count; i++) {
        const el = numberRefs.current[i]
        if (!el) continue
        // Signed wrapped distance from the centre position — handles the
        // N→1 wrap so between the last and first video both are adjacent.
        let d = (i - p) % count
        if (d > count / 2) d -= count
        if (d < -count / 2) d += count
        const dist = Math.abs(d)
        // Continuous falloff with distance: further = fainter, smaller,
        // and LIGHTER. Only the centre number is bold.
        //   opacity: 1 → ~0.32 (±1) → ~0.04 (±2) → 0 (±2.4)
        //   size:    1 → 0.55 (±1) → 0.24 (±2), floored at 0.24
        //   weight:  900 centre → 400 by ±1 (Inter is a variable font,
        //            so the weight interpolates as numbers pass through)
        const fall = Math.max(0, 1 - dist * 0.42)
        const activeO = Math.pow(fall, 1.6)
        const sizeScale = Math.max(0.24, 1 - dist * 0.45)
        const weight = Math.round(900 - Math.min(dist, 1) * 500)
        // Idle: subtle residue on the centre number only.
        const idleO = dist < 0.5 ? 0.3 : 0
        const o = idleO + (activeO - idleO) * energy
        // The tension stretch belongs to the centre digit — neighbours
        // only carry a fraction of it, tapering to none past ±1.6.
        const stretchWeight = Math.max(0, 1 - dist * 0.6)
        const digitStretch = 1 + (stretch - 1) * stretchWeight
        el.style.opacity = o.toFixed(3)
        el.style.fontWeight = String(weight)
        el.style.transform =
          `translate3d(0, ${(d * SPACING).toFixed(2)}px, 0)` +
          ` scale(${sizeScale.toFixed(3)}) scaleY(${digitStretch.toFixed(3)})`
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      container.removeEventListener('scroll', onScroll)
    }
  }, [containerRef, count])

  if (count <= 1) return null
  return (
    <div className="fixed left-6 top-1/2 z-20 pointer-events-none" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          ref={(el) => { numberRefs.current[i] = el }}
          className="absolute left-0 flex items-center text-white leading-none text-[44px] md:text-[56px]"
          style={{
            top: -42,
            height: 84,
            letterSpacing: '-0.02em',
            opacity: 0,
            // Weight is driven per-frame by the rail loop (900 at centre
            // tapering to 400 for neighbours — Inter is variable so it
            // interpolates smoothly). 900 initial matches the idle state.
            fontWeight: 900,
            textShadow: '0 2px 14px rgba(0,0,0,0.55)',
            willChange: 'transform, opacity',
          }}
        >
          {String(i + 1).padStart(2, '0')}
        </div>
      ))}
    </div>
  )
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

  // playlist-index for UI (scroll cue / tagline visibility) — wraps the
  // tripled section index back into 0..N-1.
  const playlistIdx = N > 0 ? ((activeIdx % N) + N) % N : 0

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

            {/* Through to the project this clip came from. Sits centre-right,
                mirroring the scroll number rail on the left — the rail is
                `fixed left-6 top-1/2`, and each section is exactly one
                viewport tall, so centring inside the section lands on the
                same line without needing to be fixed itself (which would
                stack all three tripled copies on top of each other). */}
            {v.projectSlug && (
              <div className="absolute right-6 top-1/2 -translate-y-1/2 z-10">
                <Link
                  href={`/work/${v.projectSlug}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[9px] uppercase tracking-[0.16em] font-bold text-white transition-all hover:scale-105 active:scale-95"
                  style={{
                    border: '1px solid rgba(255,255,255,0.45)',
                    background: 'rgba(0,0,0,0.28)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    textShadow: '0 1px 6px rgba(0,0,0,0.6)',
                  }}
                >
                  View project <span aria-hidden="true">→</span>
                </Link>
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

      </div>

      {/* Left-rail scroll-reactive video number (01..N). Fixed overlay,
          sibling of the scroll container so it never scrolls away. */}
      <ScrollNumberRail containerRef={scrollContainerRef} count={N} />

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
