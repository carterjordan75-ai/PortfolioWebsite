'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  const [idx, setIdx] = useState(0)
  const [showEmail, setShowEmail] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Ripple effect for the arrow buttons — each click spawns a short-lived span
  // that animates from the click coordinates outward, then self-cleans up.
  type Ripple = { id: number; x: number; y: number }
  const [leftRipples, setLeftRipples] = useState<Ripple[]>([])
  const [rightRipples, setRightRipples] = useState<Ripple[]>([])
  const rippleIdRef = useRef(0)
  const spawnRipple = (
    e: React.MouseEvent<HTMLButtonElement>,
    setter: React.Dispatch<React.SetStateAction<Ripple[]>>,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const id = ++rippleIdRef.current
    const r: Ripple = { id, x: e.clientX - rect.left, y: e.clientY - rect.top }
    setter(prev => [...prev, r])
    window.setTimeout(() => setter(prev => prev.filter(p => p.id !== id)), 700)
  }

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

  // Admin home-page list is the only playlist source.
  const playlist: HomeVideo[] = homeVideos

  const next = () => setIdx(i => (playlist.length === 0 ? 0 : (i + 1) % playlist.length))
  const prev = () => setIdx(i => (playlist.length === 0 ? 0 : (i - 1 + playlist.length) % playlist.length))
  const goTo = (target: number) => {
    if (playlist.length === 0 || target === safeIdx) return
    setIdx(target)
  }

  // Whenever the active project changes, restart the video from the beginning.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = 0
    v.play().catch(() => {})
  }, [idx])

  // Clamp the cursor so it stays within the playlist after edits / data swaps
  const safeIdx = playlist.length === 0 ? 0 : idx % playlist.length
  const current = playlist[safeIdx]
  const src = current?.src ?? null

  return (
    <PageTransition>
      <PageLoader show={loading} mode="data" />
      <div className="min-h-screen flex flex-col">
        {/* Full-screen video viewport — one screen tall, scroll past to reach footer */}
        <section className="relative w-full h-screen overflow-hidden bg-black">
          {/* Pure crossfade — no slide, no scale. The two videos dissolve into
              each other over ~0.9s with a smooth ease-in-out. */}
          <AnimatePresence mode="sync" initial={false}>
            {src && (
              <motion.div
                key={src}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                className="absolute inset-0"
                style={{ willChange: 'opacity' }}
              >
                <video
                  ref={videoRef}
                  src={src}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Manual nav — left / right arrows. Press reaction = quick scale-down
              compression (CSS :active) + a click-origin ripple span overlay. */}
          <button
            aria-label="Previous video"
            onClick={(e) => { spawnRipple(e, setLeftRipples); prev() }}
            className="home-arrow absolute left-6 top-1/2 -translate-y-1/2"
          >
            <span className="home-arrow-glyph">‹</span>
            {leftRipples.map(r => (
              <span key={r.id} className="home-arrow-ripple" style={{ left: r.x, top: r.y }} />
            ))}
          </button>
          <button
            aria-label="Next video"
            onClick={(e) => { spawnRipple(e, setRightRipples); next() }}
            className="home-arrow absolute right-6 top-1/2 -translate-y-1/2"
          >
            <span className="home-arrow-glyph">›</span>
            {rightRipples.map(r => (
              <span key={r.id} className="home-arrow-ripple" style={{ left: r.x, top: r.y }} />
            ))}
          </button>

          {/* Bottom-left: category (3D & Motion or Generative Film) */}
          {current?.category && (
            <div className="absolute bottom-8 left-6 z-10 pointer-events-none">
              <p
                className="text-[10px] md:text-xs uppercase tracking-[0.22em] text-white font-bold"
                style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}
              >
                {current.category}
              </p>
            </div>
          )}

          {/* Bottom-right: title with year underneath, both right-aligned */}
          {current && (current.title || current.label || current.year) && (
            <div className="absolute bottom-8 right-6 z-10 pointer-events-none flex flex-col items-end">
              {(current.title || current.label) && (
                <h2
                  className="text-xl md:text-3xl font-black uppercase leading-[0.95] tracking-tight text-white"
                  style={{ textShadow: '0 2px 14px rgba(0,0,0,0.55)' }}
                >
                  {current.title || current.label}
                </h2>
              )}
              {current.year && (
                <p
                  className="text-[10px] md:text-xs uppercase tracking-[0.22em] text-white/90 mt-1"
                  style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}
                >
                  {current.year}
                </p>
              )}
            </div>
          )}

          {/* Indicator dots — one per video, click to jump to that video */}
          <div className="absolute inset-x-0 bottom-8 flex justify-center items-center gap-3 z-10">
            {playlist.map((v, i) => (
              <button
                key={`${v.src}-${i}`}
                aria-label={v.title || v.label || `Video ${i + 1}`}
                onClick={() => goTo(i)}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === safeIdx ? 28 : 8,
                  height: 8,
                  background: i === safeIdx ? '#fff' : 'rgba(255,255,255,0.4)',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </section>

        {/* Footer band — blurred copy of the current video sits behind, giving the
            glass footer a soft, color-matched backdrop instead of plain emptiness. */}
        <div className="relative mt-auto">
          {src && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
              <video
                key={`bg-${src}`}
                src={src}
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
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
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
        </div>
      </div>

      <EmailPopup show={showEmail} onClose={() => setShowEmail(false)} />
      <AdminPortal show={showAdmin} onClose={() => setShowAdmin(false)} />

      <style>{`
        .home-arrow {
          width: 44px;
          height: 44px;
          border-radius: 9999px;
          font-size: 24px;
          line-height: 1;
          font-weight: 300;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.16);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.3);
          backdrop-filter: blur(20px) saturate(140%);
          -webkit-backdrop-filter: blur(20px) saturate(140%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 4px 18px rgba(0, 0, 0, 0.1);
          cursor: pointer;
          transition: transform 0.25s ease-out, background 0.25s ease-out;
          z-index: 10;
          overflow: hidden;   /* clip ripples to the circle */
          padding: 0;
        }
        .home-arrow:hover {
          transform: translateY(-50%) scale(1.12);
          background: rgba(255, 255, 255, 0.36);
        }
        /* Press compression — quick scale-down on click. Snappier easing than the
           hover so the press reads as a deliberate "punch". */
        .home-arrow:active {
          transform: translateY(-50%) scale(0.92);
          transition: transform 0.08s cubic-bezier(0.32, 0.72, 0, 1), background 0.25s ease-out;
        }
        /* Glyph kept above the ripple in z-order so the chevron stays visible. */
        .home-arrow-glyph {
          position: relative;
          z-index: 2;
          pointer-events: none;
        }
        /* Ripple — small dot at click origin that expands and fades. */
        .home-arrow-ripple {
          position: absolute;
          width: 14px;
          height: 14px;
          margin-left: -7px;
          margin-top: -7px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.55);
          pointer-events: none;
          z-index: 1;
          animation: home-arrow-ripple 0.65s cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
        }
        @keyframes home-arrow-ripple {
          0%   { transform: scale(0);   opacity: 0.55; }
          60%  {                         opacity: 0.25; }
          100% { transform: scale(7);   opacity: 0;    }
        }
      `}</style>
    </PageTransition>
  )
}
