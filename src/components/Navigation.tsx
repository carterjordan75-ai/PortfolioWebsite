'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useDarkMode } from '@/contexts/DarkModeContext'
import { projects } from '@/data/projects'
import {
  getAmbientAudio,
  startAmbientAudio,
  pauseAmbientAudio,
  isAmbientPlaying,
} from '@/lib/ambientAudio'

const hoverColors = [
  '#e94560', '#ff6b35', '#00b4d8', '#7209b7', '#06d6a0',
  '#fb5607', '#3a86ff', '#8338ec', '#ff006e', '#38b000',
]

const navItems: { href: string; label: string; description?: string }[] = [
  { href: '/indexx', label: 'Index' },
  {
    href: '/misc',
    label: 'Misc',
    description: 'A collection of images from projects, experiments and stills — in no particular order.',
  },
  {
    href: '/look',
    label: 'Look',
    description: 'Moodboard of references that feed the work.',
  },
]

export default function Navigation() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { dark, setDark, fg } = useDarkMode()
  // The toggle's visual state (On/Off + animated bars) reflects the AUDIO ELEMENT'S
  // actual paused/playing state — not a separate flag — so the button never desyncs
  // from reality. The audio itself lives in src/lib/ambientAudio.ts as a module
  // singleton so it survives navigation between pages (and crucially, the user's
  // click gesture on the gate's submit button — see startAmbientAudio call there).
  const [audioOn, setAudioOn] = useState(false)
  const [indexHover, setIndexHover] = useState(false)
  // Tooltip hover — keyed by href. Only one nav item can be hovered at a
  // time, so a single string-or-null state covers Misc + Look (and any
  // future nav item that supplies a `description`).
  const [tipHover, setTipHover] = useState<string | null>(null)
  // Distance to slide the tooltip LEFT so it lines up under the INDEX
  // wrapper rather than under its own item. Captured synchronously when
  // the hover starts so the tooltip mounts already at the right X.
  const [tipOffset, setTipOffset] = useState(0)
  const indexWrapperRef = useRef<HTMLDivElement | null>(null)
  const tipWrapperRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const handleTipEnter = (href: string) => {
    const indexEl = indexWrapperRef.current
    const ownEl = tipWrapperRefs.current[href]
    if (indexEl && ownEl) {
      const offset = indexEl.getBoundingClientRect().left - ownEl.getBoundingClientRect().left
      setTipOffset(offset)
    } else {
      setTipOffset(0)
    }
    setTipHover(href)
  }
  // Active bucket inside the Index hover dropdown. 'gen' is first and the
  // default (visible on open); '3d' is the secondary bucket.
  const [indexCategory, setIndexCategory] = useState<'3d' | 'gen'>('gen')
  // Header minimize state. Only available on the home page. When true, the
  // header slides off-screen and a small floating pill in the top-center
  // restores it on click.
  const [headerMinimized, setHeaderMinimized] = useState(false)
  const [featuredProjects, setFeaturedProjects] = useState(projects.filter(p => p.featured))
  const router = useRouter()

  // Fetch latest featured projects from API (includes admin-added ones).
  // Wrapped so it can re-run — a single mount-time fetch left the dropdown
  // stale when a project was added via the admin modal (no reload happens),
  // so we also refetch every time the INDEX dropdown opens and whenever an
  // admin save broadcasts the `admin-saved` event.
  const fetchFeatured = useCallback(() => {
    fetch('/api/projects', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data.projects) {
          const featured = data.projects.filter((p: Record<string, unknown>) => p.featured)
          if (featured.length > 0) setFeaturedProjects(featured)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchFeatured()
  }, [fetchFeatured])

  useEffect(() => {
    const onSaved = () => fetchFeatured()
    window.addEventListener('admin-saved', onSaved)
    return () => window.removeEventListener('admin-saved', onSaved)
  }, [fetchFeatured])
  const [showInfo, setShowInfo] = useState(false)
  const [infoDismissable, setInfoDismissable] = useState(false)
  const [infoData, setInfoData] = useState<Record<string, string>>({})
  // Info popup → "More" expand state. Clicking More extends the popup down
  // and reveals the client list. Resets to collapsed whenever the popup closes.
  const [infoExpanded, setInfoExpanded] = useState(false)
  const [clientList, setClientList] = useState<string[]>([])

  // Load info popup data + client list from API
  useEffect(() => {
    // Skip on the passcode gate (no cookie there → middleware would redirect
    // the fetch back to /gate, returning HTML the JSON parser chokes on).
    // After auth, the path changes off /gate and this effect re-runs.
    if (pathname === '/gate') return
    // Don't re-fetch once we have the data
    if (Object.keys(infoData).length > 0 && clientList.length > 0) return

    fetch('/api/pages')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) return
        if (data.pages?.['info-popup']) setInfoData(data.pages['info-popup'])
        const raw = data.pages?.['info-page']?.logoOrder
        if (typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed)) setClientList(parsed)
          } catch {}
        }
      })
      .catch(() => {})
  }, [pathname, infoData, clientList.length])
  // Increment the local-storage visit counter on every mount. The counter
  // value isn't displayed anywhere yet, but the increment keeps the data fresh
  // for any future "Nth visit" features.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = parseInt(localStorage.getItem('jc-visits') || '0', 10)
    localStorage.setItem('jc-visits', String(stored + 1))
  }, [])
  const isArchive = pathname === '/indexx'
  const isWork = pathname === '/'
  const isProjectPage = pathname.startsWith('/work/') && pathname !== '/work'
  const isExperiments = pathname === '/misc'
  const isLook = pathname === '/look'
  const isWhitePage = isArchive || isWork || isExperiments || isProjectPage || isLook

  // Keep audioOn synced with the singleton audio element's state — listen to
  // play/pause events so external changes (e.g. browser pausing on tab change,
  // or another component pausing) are reflected in the toggle UI.
  useEffect(() => {
    const a = getAmbientAudio()
    if (!a) return
    setAudioOn(isAmbientPlaying())
    const onPlay = () => setAudioOn(true)
    const onPause = () => setAudioOn(false)
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    return () => {
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
    }
  }, [isWork])

  // Reset Info popup's expanded state whenever it closes
  useEffect(() => {
    if (!showInfo) setInfoExpanded(false)
  }, [showInfo])

  // ESC key closes the Info popup. Listener is only active while the popup
  // is open + dismissable, then cleaned up on close.
  useEffect(() => {
    if (!showInfo || !infoDismissable) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowInfo(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showInfo, infoDismissable])

  // Pages where the minimize affordance is available — currently home and
  // /misc. On any other page, auto-restore so a visitor who minimized
  // somewhere supported then navigated away doesn't land with no header.
  const canMinimize = isWork || isExperiments
  useEffect(() => {
    if (!canMinimize && headerMinimized) setHeaderMinimized(false)
  }, [canMinimize, headerMinimized])

  // Audio lifecycle for the home page:
  // - On entry: ensure the singleton ambient drone is playing. If a fresh
  //   visitor came through the gate, startAmbientAudio() was already called
  //   inside the submit handler's click gesture — so the audio is playing and
  //   this call is a no-op. For direct visits (cookie still valid, no gate),
  //   browsers block unmuted autoplay, so we fall back to "play on first
  //   interaction" the same way the previous implementation did.
  // - On leave: pause the singleton.
  useEffect(() => {
    if (!isWork) {
      pauseAmbientAudio()
      return
    }

    let firstInteractListener: ((e: Event) => void) | null = null

    startAmbientAudio()

    firstInteractListener = (e: Event) => {
      const target = e.target as HTMLElement | null
      // Skip if the audio toggle itself is the first interaction — its own
      // onClick will handle the play, and we don't want to race it.
      const isAudioToggle = !!target?.closest('[aria-label="Toggle ambient audio"]')
      if (!isAudioToggle) startAmbientAudio()
      if (firstInteractListener) {
        document.removeEventListener('pointerdown', firstInteractListener, true)
        document.removeEventListener('keydown', firstInteractListener, true)
        firstInteractListener = null
      }
    }
    document.addEventListener('pointerdown', firstInteractListener, true)
    document.addEventListener('keydown', firstInteractListener, true)

    return () => {
      if (firstInteractListener) {
        document.removeEventListener('pointerdown', firstInteractListener, true)
        document.removeEventListener('keydown', firstInteractListener, true)
      }
      pauseAmbientAudio()
    }
  }, [isWork])


  // No header on the passcode gate — clean, focused screen. (Check is here at
  // the very end so all hooks above always run, preserving React's rules of hooks.)
  // Same for the private Motion Dailies portal: it's an internal tool with its
  // own sticky header, and the public nav would both overlap it and offer
  // links that make no sense from inside a review session.
  if (pathname === '/gate') return null
  if (pathname === '/dailies' || pathname.startsWith('/dailies/')) return null
  // The logo tuner is a full-screen tool behind its own password —
  // the site chrome has nothing to offer it.
  if (pathname === '/logo') return null

  return (
    <>
      <motion.header
        animate={{
          y: headerMinimized ? '-130%' : '0%',
          opacity: headerMinimized ? 0 : 1,
        }}
        transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
        className={`fixed left-0 right-0 px-6 py-4 md:px-10 md:py-5 ${isWhitePage ? 'archive-nav top-2 mx-2' : 'mix-blend-difference top-0'}`}
        style={{ zIndex: 10000 }}
      >
        {/* Centered cluster — info / audio toggles on top, minimize control underneath */}
        {isWhitePage && (
          <div className="hidden md:flex flex-col items-center gap-2 absolute top-6" style={{ left: '50%', transform: 'translateX(-50%)' }}>
          <div id="archive-toggle-mount" className="flex items-center justify-center gap-5">
            {/* Info button — classic circled i. Always first / leftmost.
                Matches the Index/Misc/Look nav-link opacity scale (50% → 70% on hover). */}
            <button
              onClick={(e) => { e.stopPropagation(); setShowInfo(true); setInfoDismissable(false); setTimeout(() => setInfoDismissable(true), 300) }}
              className="flex items-center justify-center rounded-full flex-shrink-0 opacity-50 hover:opacity-70 hover:scale-110"
              style={{
                width: '30px',
                height: '30px',
                border: `1.5px solid ${fg}`,
                color: fg,
                fontSize: '16px',
                lineHeight: 1,
                fontStyle: 'italic',
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontWeight: 400,
                transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.18s ease-out',
              }}
              aria-label="About"
            >
              i
            </button>

            {/* Dark mode toggle — Index + Misc + every featured project page.
                Outer ring + inner filled disc with a 3px gap. Matches the
                nav-link opacity scale (50% → 70% on hover). */}
            {(isArchive || isExperiments || isProjectPage) && (
              <button
                onClick={() => setDark(!dark)}
                className="rounded-full flex-shrink-0 opacity-50 hover:opacity-70 hover:scale-110 flex items-center justify-center"
                style={{
                  width: '30px',
                  height: '30px',
                  border: `1.5px solid ${fg}`,
                  background: 'transparent',
                  padding: '3px',
                  cursor: 'pointer',
                  transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.18s ease-out',
                }}
                aria-label="Toggle light/dark mode"
              >
                <span
                  className="block w-full h-full rounded-full"
                  style={{ background: fg }}
                />
              </button>
            )}

            {/* Audio toggle — home page only. Matches the nav-link opacity scale. */}
            {isWork && (
              <button
                onClick={() => {
                  if (isAmbientPlaying()) {
                    pauseAmbientAudio()
                  } else {
                    startAmbientAudio()
                  }
                }}
                className="flex items-center justify-center rounded-full flex-shrink-0 opacity-50 hover:opacity-70 hover:scale-110"
                style={{
                  width: '30px',
                  height: '30px',
                  border: `1.5px solid ${fg}`,
                  color: fg,
                  transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.18s ease-out',
                }}
                aria-label="Toggle ambient audio"
              >
                {audioOn ? (
                  <span className="flex gap-[2px] items-center" style={{ height: '12px' }}>
                    {[0, 1, 2].map(i => (
                      <span
                        key={i}
                        className="w-[2px] rounded-full"
                        style={{
                          background: fg,
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
              </button>
            )}
          </div>
          {/* Minimize control — home + /misc. Sits below the info/audio
              cluster. Just a dash line, no circle. */}
          {canMinimize && (
            <button
              onClick={() => setHeaderMinimized(true)}
              aria-label="Minimize header"
              className="flex items-center justify-center flex-shrink-0 opacity-50 hover:opacity-70 hover:scale-110"
              style={{
                width: '30px',
                height: '20px',
                background: 'transparent',
                border: 'none',
                padding: 0,
                transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.18s ease-out',
              }}
            >
              <span
                className="block rounded-full"
                style={{ width: '14px', height: '1.5px', background: fg }}
              />
            </button>
          )}
          </div>
        )}

        <div className="flex items-start justify-between">
          {/* Left: Name */}
          {isWhitePage ? (
            <Link
              href="/"
              className="hover:opacity-70 hover:scale-105 inline-block origin-left"
              style={{ transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.18s ease-out' }}
            >
              {/* XOXO wordmark logo. Sized via height (clamp for responsive scale)
                  while keeping the original aspect ratio. Inverts to light fill on dark mode. */}
              <img
                src="/assets/Logos/xoxo_Logo_005.svg"
                alt="xoxo studio"
                className="block w-auto"
                style={{
                  height: 'clamp(1.4rem, 3vw, 2.4rem)',
                  filter: dark ? 'invert(1)' : 'none',
                }}
              />
            </Link>
          ) : (
            <Link
              href="/"
              className="hover:opacity-70 hover:scale-105 text-white origin-left inline-block"
              style={{ transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.18s ease-out' }}
            >
              <span className="text-sm font-black tracking-wider uppercase block">
                JC©
              </span>
              <span className="text-[8px] tracking-[0.1em] uppercase block leading-tight mt-0.5 text-white opacity-50">
                An independent design &amp;<br />
                motion studio focused on<br />
                typographic experimentation.
              </span>
            </Link>
          )}

          {/* Right: nav + blurb */}
          <div className={`${isWhitePage ? 'flex flex-col items-end' : ''}`}>
            {/* Desktop nav */}
            <nav className={`hidden md:flex items-center gap-8 ${isWhitePage ? '' : 'text-white'}`}>
              {navItems.map((item) => (
                item.href === '/indexx' ? (
                  <div
                    key={item.href}
                    ref={indexWrapperRef}
                    className="relative"
                    style={{ zIndex: 10000 }}
                    onMouseEnter={() => { setIndexHover(true); fetchFeatured() }}
                    onMouseLeave={() => setIndexHover(false)}
                  >
                    {/* Index link — visually stays in its hover state (scale + opacity)
                        for as long as the dropdown is open. On hover, the label also
                        slides DOWN ~22px to align with the bottom edge of the header,
                        so the dropdown reads as "dropping out of" the title. */}
                    <Link
                      href={item.href}
                      className={`text-sm font-bold uppercase tracking-wider inline-block ${
                        pathname.startsWith(item.href) ? 'opacity-100' : 'opacity-50'
                      }`}
                      style={{
                        // position+zIndex keeps the INDEX label clickable when its
                        // translated position visually overlaps the hover-bridge.
                        position: 'relative',
                        zIndex: 10000,
                        transition: 'transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s ease-out',
                        transform: indexHover ? 'translateY(22px) scale(1.1)' : 'translateY(0) scale(1)',
                        opacity: indexHover
                          ? 0.85
                          : (pathname.startsWith(item.href) ? 1 : 0.5),
                      }}
                    >
                      {item.label}
                    </Link>
                    {/* Click-affordance line — same idea as Misc/Look: the
                        INDEX label drops down on hover, but a thin line
                        stays at the original position so the user can still
                        click through without chasing the dropped label. */}
                    <AnimatePresence>
                      {indexHover && (
                        <motion.div
                          initial={{ opacity: 0, scaleY: 0 }}
                          animate={{ opacity: 0.55, scaleY: 1 }}
                          exit={{ opacity: 0, scaleY: 0 }}
                          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                          style={{
                            position: 'absolute',
                            top: 2,
                            left: '50%',
                            marginLeft: -1,
                            width: 2,
                            height: 12,
                            borderRadius: 1,
                            background: 'currentColor',
                            transformOrigin: 'center',
                            zIndex: 10001,
                            pointerEvents: 'none',
                          }}
                          aria-hidden="true"
                        />
                      )}
                    </AnimatePresence>
                    {indexHover && (
                      <Link
                        href={item.href}
                        aria-label={item.label}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          height: 18,
                          zIndex: 10002,
                        }}
                      />
                    )}
                    {/* Invisible hover-bridge — fills the visual gap between the
                        translated INDEX label and the dropdown so the cursor can
                        travel down without exiting the wrapper's mouse hit-area.
                        As a child of the wrapper, it counts as "inside" for the
                        parent's onMouseLeave detection. */}
                    {indexHover && (
                      <div
                        aria-hidden
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          width: '240px',
                          height: '60px',
                          zIndex: 9998,
                        }}
                      />
                    )}
                    <AnimatePresence>
                      {indexHover && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                          // Push the dropdown down past the header's bottom edge so
                          // it doesn't overlap the glass. ~38px gap clears the header's
                          // bottom padding + leaves a small visual breath.
                          className="absolute top-full left-0 mt-[38px] rounded-xl min-w-[220px] overflow-hidden"
                          style={{
                            zIndex: 9999,
                            // Lower fill opacity + a soft top→bottom gradient = real glass
                            // refraction. The strong saturate(2.2) boosts whatever colors
                            // sit behind the dropdown so the panel picks up tinted hue
                            // rather than reading as flat white.
                            background: dark
                              ? 'linear-gradient(180deg, rgba(20,20,20,0.42), rgba(0,0,0,0.32))'
                              : 'linear-gradient(180deg, rgba(255,255,255,0.42), rgba(255,255,255,0.22))',
                            backdropFilter: 'blur(48px) saturate(2.2)',
                            WebkitBackdropFilter: 'blur(48px) saturate(2.2)',
                            border: `1px solid ${dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.55)'}`,
                            boxShadow: dark
                              ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 36px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.18)'
                              : 'inset 0 1px 0 rgba(255,255,255,0.65), 0 12px 36px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04)',
                            transformOrigin: 'top left',
                          }}
                        >
                          <div className="py-2 px-1">
                            {/* GENAI / 3D switch — picks which bucket of featured
                                projects the dropdown lists.

                                Drawn as a segmented control inside its own
                                bordered track. The two labels used to sit bare
                                on the panel with the inactive one at 0.3 alpha,
                                which read as a heading you couldn't do anything
                                with — nothing said the dim word was a control
                                until you happened to hover it. The track outline
                                makes it a switch on sight, and the inactive
                                segment is legible now rather than a ghost. */}
                            <div className="px-3 py-1 mb-1">
                              <div
                                role="tablist"
                                aria-label="Project category"
                                className="inline-flex items-center gap-0.5 p-0.5 rounded-full"
                                style={{
                                  border: `1px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)'}`,
                                  background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                }}
                              >
                                {([
                                  { cat: 'gen', label: 'GenAI' },
                                  { cat: '3d', label: '3D' },
                                ] as const).map(({ cat, label }) => {
                                  const active = indexCategory === cat
                                  return (
                                    <button
                                      key={cat}
                                      role="tab"
                                      aria-selected={active}
                                      onClick={() => setIndexCategory(cat)}
                                      onMouseEnter={(e) => {
                                        if (active) return
                                        e.currentTarget.style.opacity = '1'
                                        e.currentTarget.style.background = dark
                                          ? 'rgba(255,255,255,0.09)'
                                          : 'rgba(0,0,0,0.06)'
                                      }}
                                      onMouseLeave={(e) => {
                                        if (active) return
                                        e.currentTarget.style.opacity = '0.6'
                                        e.currentTarget.style.background = 'transparent'
                                      }}
                                      className="text-[8px] uppercase tracking-[0.16em] font-bold px-2.5 py-1 rounded-full cursor-pointer"
                                      style={{
                                        color: active
                                          ? (dark ? '#0a0a0a' : '#ffffff')
                                          : (dark ? '#fff' : '#000'),
                                        opacity: active ? 1 : 0.6,
                                        background: active
                                          ? (dark ? '#ffffff' : '#000000')
                                          : 'transparent',
                                        transition: 'opacity 0.18s ease-out, background 0.18s ease-out, color 0.18s ease-out',
                                      }}
                                    >
                                      {label}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                            {(() => {
                              // Filter featured projects by the active category. Projects
                              // without a `category` field default to '3d' so existing
                              // data continues to show under the 3D bucket.
                              // Clients explicitly hidden from this dropdown
                              const HIDDEN_CLIENTS = new Set(['KFC', 'CAT'])
                              const visible = featuredProjects.filter((p) => {
                                if (HIDDEN_CLIENTS.has(p.client)) return false
                                const cat = ((p as Record<string, unknown>).category as string | undefined) || '3d'
                                return cat === indexCategory
                              })
                              if (visible.length === 0) {
                                return (
                                  <div className="px-3 py-3 text-center">
                                    <p className="text-[8px] uppercase tracking-[0.15em] font-bold" style={{ opacity: 0.35, color: dark ? '#fff' : '#000' }}>
                                      Coming soon
                                    </p>
                                  </div>
                                )
                              }
                              return visible.map((p, i) => (
                                <motion.button
                                  key={`${indexCategory}-${p.slug}`}
                                  initial={{ opacity: 0, x: -8 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ duration: 0.25, delay: 0.08 + i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                                  onClick={() => { setIndexHover(false); router.push(`/work/${p.slug}`) }}
                                  className="w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-[0.02em]"
                                  style={{
                                    color: dark ? '#fff' : '#000',
                                    transformOrigin: 'left center',
                                    transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.18s ease-out, color 0.18s ease-out',
                                  }}
                                  onMouseEnter={(e) => {
                                    const color = hoverColors[i % hoverColors.length]
                                    e.currentTarget.style.background = color
                                    e.currentTarget.style.color = '#ffffff'
                                    e.currentTarget.style.transform = 'scale(1.04)'
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent'
                                    e.currentTarget.style.color = dark ? '#fff' : '#000'
                                    e.currentTarget.style.transform = 'scale(1)'
                                  }}
                                >
                                  {p.client}
                                  <span className="text-[8px] font-normal ml-2" style={{ opacity: 0.4 }}>{p.year}</span>
                                </motion.button>
                              ))
                            })()}
                            <div className="mt-1 px-3 pt-1.5 pb-1" style={{ borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}` }}>
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.2 }}
                              >
                                <Link
                                  // GEN tab → category-filtered index page;
                                  // 3D tab → full /indexx with both buckets.
                                  href={indexCategory === 'gen' ? '/indexx?cat=gen' : '/indexx'}
                                  onClick={() => setIndexHover(false)}
                                  className="text-[8px] uppercase tracking-[0.12em] font-bold hover:opacity-80 hover:scale-110 inline-block origin-left"
                                  style={{
                                    opacity: 0.35,
                                    transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.18s ease-out',
                                  }}
                                >
                                  {indexCategory === 'gen' ? 'See all generative →' : 'See all projects →'}
                                </Link>
                              </motion.div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : item.description ? (
                  // Items with a description (Misc, Look) get the same
                  // "drop down" hover motion as INDEX: the label slides
                  // down + scales up while a small description tooltip
                  // animates open beneath. Bridge div fills the visual
                  // gap so the cursor can travel into the tooltip
                  // without exiting the hover region.
                  <div
                    key={item.href}
                    ref={(el) => { tipWrapperRefs.current[item.href] = el }}
                    className="relative"
                    style={{ zIndex: 10000 }}
                    onMouseEnter={() => handleTipEnter(item.href)}
                    onMouseLeave={() => setTipHover(null)}
                  >
                    <Link
                      href={item.href}
                      className={`text-sm font-bold uppercase tracking-wider inline-block ${
                        pathname.startsWith(item.href) ? 'opacity-100' : 'opacity-50'
                      }`}
                      style={{
                        position: 'relative',
                        zIndex: 10000,
                        transition: 'transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s ease-out',
                        transform: tipHover === item.href ? 'translateY(22px) scale(1.1)' : 'translateY(0) scale(1)',
                        opacity: tipHover === item.href
                          ? 0.85
                          : (pathname.startsWith(item.href) ? 1 : 0.5),
                      }}
                    >
                      {item.label}
                    </Link>
                    {/* Click-affordance line — visible only while hovered.
                        Sits at the title's ORIGINAL top position (where it
                        sat before translateY(22px)) so the user can still
                        click the link without chasing the dropped label. */}
                    <AnimatePresence>
                      {tipHover === item.href && (
                        <motion.div
                          initial={{ opacity: 0, scaleY: 0 }}
                          animate={{ opacity: 0.55, scaleY: 1 }}
                          exit={{ opacity: 0, scaleY: 0 }}
                          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                          style={{
                            position: 'absolute',
                            top: 2,
                            left: '50%',
                            marginLeft: -1,
                            width: 2,
                            height: 12,
                            borderRadius: 1,
                            background: 'currentColor',
                            transformOrigin: 'center',
                            zIndex: 10001,
                            pointerEvents: 'none',
                          }}
                          aria-hidden="true"
                        />
                      )}
                    </AnimatePresence>
                    {tipHover === item.href && (
                      <Link
                        href={item.href}
                        aria-label={item.label}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          height: 18,
                          zIndex: 10002,
                        }}
                      />
                    )}
                    {tipHover === item.href && (
                      <div
                        aria-hidden
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: tipOffset,
                          width: 220,
                          height: 60,
                          zIndex: 9998,
                        }}
                      />
                    )}
                    <AnimatePresence>
                      {tipHover === item.href && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                          // Anchored to INDEX's wrapper position via tipOffset
                          // (measured synchronously on hover-enter). That way
                          // the Misc/Look description box appears at the same
                          // screen X as the INDEX dropdown, matching its
                          // box position exactly.
                          className="absolute top-full mt-[38px] rounded-xl overflow-hidden"
                          style={{
                            zIndex: 9999,
                            left: tipOffset,
                            width: 220,
                            background: dark
                              ? 'linear-gradient(180deg, rgba(20,20,20,0.42), rgba(0,0,0,0.32))'
                              : 'linear-gradient(180deg, rgba(255,255,255,0.42), rgba(255,255,255,0.22))',
                            backdropFilter: 'blur(48px) saturate(2.2)',
                            WebkitBackdropFilter: 'blur(48px) saturate(2.2)',
                            border: `1px solid ${dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.55)'}`,
                            boxShadow: dark
                              ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 36px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.18)'
                              : 'inset 0 1px 0 rgba(255,255,255,0.65), 0 12px 36px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04)',
                          }}
                        >
                          <p
                            className="px-3 py-2.5 text-[9px] leading-[1.5] tracking-[0.06em] uppercase font-bold"
                            style={{ color: dark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.82)' }}
                          >
                            {item.description}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`text-sm font-bold uppercase tracking-wider hover:opacity-70 hover:scale-110 inline-block ${
                      pathname.startsWith(item.href) ? 'opacity-100' : 'opacity-50'
                    }`}
                    style={{ transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.18s ease-out' }}
                  >
                    {item.label}
                  </Link>
                )
              ))}
            </nav>


            {/* Mobile hamburger — visible below md, hidden on desktop */}
            <button
              className={`flex md:hidden z-50 relative ${isWhitePage ? '' : 'text-white'}`}
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              <div className="flex flex-col gap-1.5">
                <motion.span
                  animate={mobileOpen ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
                  className={`block w-6 h-0.5 ${isWhitePage ? 'bg-current' : 'bg-white'}`}
                />
                <motion.span
                  animate={mobileOpen ? { opacity: 0 } : { opacity: 1 }}
                  className={`block w-6 h-0.5 ${isWhitePage ? 'bg-current' : 'bg-white'}`}
                />
                <motion.span
                  animate={mobileOpen ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
                  className={`block w-6 h-0.5 ${isWhitePage ? 'bg-current' : 'bg-white'}`}
                />
              </div>
            </button>
          </div>
        </div>

      </motion.header>

      {/* (Ambient drone audio now lives as a module singleton in
          src/lib/ambientAudio.ts so it survives client-side navigation and can
          be started from the gate's submit handler while the click gesture is
          still active.) */}

      {/* Floating "+" pill — appears at the TOP CENTER when the header is minimized.
          Wrapped in a flex-center row so the centering is independent of the
          motion.button's own animated transform (y / scale). */}
      <AnimatePresence>
        {headerMinimized && (
          <div
            className="fixed top-3 left-0 right-0 flex justify-center pointer-events-none"
            style={{ zIndex: 10001 }}
          >
            <motion.button
              initial={{ opacity: 0, y: -10, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.85 }}
              transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
              onClick={() => setHeaderMinimized(false)}
              aria-label="Restore header"
              className="pointer-events-auto w-9 h-9 flex items-center justify-center hover:scale-110 transition-transform cursor-pointer"
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
              }}
            >
              {/* Hamburger icon — `mix-blend-mode: difference` paints the white bars
                  as the inverse of whatever's behind, so they read on any background
                  without needing a pill / glass backing. */}
              <span
                className="flex flex-col items-center justify-center gap-[4px]"
                style={{ mixBlendMode: 'difference' }}
              >
                <span className="block w-[20px] h-[2px] rounded-full bg-white" />
                <span className="block w-[20px] h-[2px] rounded-full bg-white" />
                <span className="block w-[20px] h-[2px] rounded-full bg-white" />
              </span>
            </motion.button>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-[var(--background)] flex flex-col items-center justify-center gap-8"
          >
            {navItems.map((item, i) => (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-3xl font-bold tracking-wide"
                >
                  {item.label}
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Info popup */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => { if (infoDismissable) setShowInfo(false) }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              background: 'rgba(0,0,0,0.3)',
              cursor: 'pointer',
              padding: '2rem',
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '680px', width: '100%', cursor: 'default', padding: '0 2rem' }}
            >
              {/* Top row — location | time + email */}
              <div className="flex justify-between items-start mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <div className="flex items-center gap-2 text-[9px] tracking-[0.12em] uppercase">
                  <span>{infoData.location || 'Melbourne, Aus'}</span>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                  <span className="font-mono">{new Date().toLocaleTimeString('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                </div>
                <p className="text-[9px] tracking-[0.12em]">{infoData.email || 'carterjordan75@gmail.com'}</p>
              </div>

              {/* Experimental type — small label */}
              <p
                className="text-center text-[9px] tracking-[0.2em] uppercase font-bold mb-2"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                {infoData.subtitle || 'Generative & 3D Motion'}
              </p>

              {/* Large name — experimental mixed weights */}
              <div className="text-center mb-2" style={{ color: '#ffffff' }}>
                <span className="font-light text-[clamp(1.8rem,5.5vw,3.8rem)] leading-[1] tracking-[-0.01em]">(</span>
                <span className="font-black text-[clamp(2rem,6vw,4.2rem)] leading-[1] tracking-[-0.02em] uppercase">Jordan</span>
                <span className="font-extralight text-[clamp(1.2rem,3.5vw,2.4rem)] leading-[1] tracking-[0.1em] uppercase" style={{ color: 'rgba(255,255,255,0.6)' }}>&apos;</span>
                <span className="font-black text-[clamp(2rem,6vw,4.2rem)] leading-[1] tracking-[-0.02em] uppercase">Carter</span>
                <span className="font-light text-[clamp(1.8rem,5.5vw,3.8rem)] leading-[1] tracking-[-0.01em]">)</span>
              </div>

              {/* XOXO wordmark — same logo image as the top-left, inverted to white
                  for the dark popup background. */}
              <div className="flex flex-col items-center mb-5 mt-1">
                <img
                  src="/assets/Logos/xoxo_Logo_005.svg"
                  alt="XOXO"
                  className="block w-auto"
                  style={{
                    height: 'clamp(2.4rem, 5.5vw, 3.6rem)',
                    filter: 'invert(1)',
                  }}
                />
              </div>

              {/* Blurb — centred, experimental */}
              <p
                className="text-center text-[9px] leading-[1.7] tracking-[0.06em] uppercase font-bold max-w-[420px] mx-auto mb-5"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                {infoData.blurb || 'A multidisciplinary creative working at the intersection of technology and craft. Building visual systems that feel alive, intentional, and unmistakably human.'}
              </p>

              {/* More button — pill toggle. Expands the popup down to reveal
                  the client list. Click again (now "Less") to collapse. */}
              <div className="flex justify-center mb-5">
                <button
                  onClick={() => setInfoExpanded(v => !v)}
                  className="px-5 py-1.5 rounded-full text-[8px] uppercase tracking-[0.15em] font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                  style={{
                    border: '1px solid rgba(255,255,255,0.25)',
                    color: 'rgba(255,255,255,0.7)',
                    background: 'rgba(255,255,255,0.05)',
                  }}
                >
                  {infoExpanded ? 'Less' : 'More'}
                </button>
              </div>

              {/* Expandable client list — slides down when "More" is clicked.
                  Uses height: auto via AnimatePresence so the popup grows down
                  smoothly. The list is taken from info-page.logoOrder. */}
              <AnimatePresence initial={false}>
                {infoExpanded && clientList.length > 0 && (
                  <motion.div
                    key="client-list"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="pt-1 pb-4">
                      <p
                        className="text-[7px] uppercase tracking-[0.22em] font-bold text-center mb-3"
                        style={{ color: 'rgba(255,255,255,0.4)' }}
                      >
                        Selected Clients
                      </p>
                      {(() => {
                        // Clients hidden from the popup's Selected Clients list.
                        const HIDDEN = new Set(['MERRELL', 'UMG', 'HUMANRACE', 'FENTY', 'SAMSUNG', 'META'])
                        const visibleClients = clientList.filter(c => !HIDDEN.has(c.toUpperCase()))
                        return (
                          <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-2 max-w-[560px] mx-auto">
                            {visibleClients.map((client, i) => (
                              <span
                                key={`${client}-${i}`}
                                className="text-[10px] uppercase tracking-[0.18em] font-medium inline-flex items-center"
                                style={{ color: 'rgba(255,255,255,0.7)' }}
                              >
                                {client}
                                {i < visibleClients.length - 1 && (
                                  <span
                                    aria-hidden
                                    className="ml-3"
                                    style={{ color: 'rgba(255,255,255,0.3)' }}
                                  >·</span>
                                )}
                              </span>
                            ))}
                          </div>
                        )
                      })()}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bottom row — Meta + copyright */}
              <div className="flex justify-between items-center" style={{ color: 'rgba(255,255,255,0.5)', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '0.75rem' }}>
                <div className="flex items-center gap-2">
                  <p className="text-[9px] tracking-[0.1em] uppercase">Currently working at</p>
                  <span className="font-black text-[11px] tracking-[0.08em] uppercase" style={{ color: '#ffffff' }}>{infoData.currentlyAt || 'META'}</span>
                </div>
                <p className="text-[9px] tracking-[0.1em] uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>2026©</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
