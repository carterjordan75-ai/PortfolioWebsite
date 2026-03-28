'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDarkMode } from '@/contexts/DarkModeContext'

const navItems = [
  { href: '/archive', label: 'Index' },
  { href: '/experiments', label: 'Misc' },
  { href: '/look', label: 'Look' },
  { href: '/info', label: 'Info' },
]

export default function Navigation() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { dark, setDark, fg } = useDarkMode()
  const [audioOn, setAudioOn] = useState(true)
  const [heartCount, setHeartCount] = useState(0)
  const [showInfo, setShowInfo] = useState(false)
  const [infoDismissable, setInfoDismissable] = useState(false)
  const [visitCount] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = parseInt(localStorage.getItem('jc-visits') || '0', 10)
      const newCount = stored + 1
      localStorage.setItem('jc-visits', String(newCount))
      return newCount
    }
    return 1
  })
  const isArchive = pathname === '/archive'
  const isWork = pathname === '/work'
  const isProjectPage = pathname.startsWith('/work/') && pathname !== '/work'
  const isExperiments = pathname === '/experiments'
  const isAbout = pathname === '/info'
  const isLook = pathname === '/look'
  const isWhitePage = isArchive || isWork || isExperiments || isProjectPage || isAbout || isLook

  // Dispatch audio toggle event to work page
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('ambient-audio', { detail: audioOn }))
  }, [audioOn])

  // Listen for heart count from work page
  useEffect(() => {
    const handler = (e: Event) => {
      setHeartCount((e as CustomEvent).detail)
    }
    window.addEventListener('heart-count', handler)
    return () => window.removeEventListener('heart-count', handler)
  }, [])

  // Sync audio state with work page
  useEffect(() => {
    if (isWork) {
      setAudioOn(true)
    } else {
      setAudioOn(false)
    }
  }, [isWork])


  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 px-6 py-4 md:px-10 md:py-5 ${isWhitePage ? 'archive-nav' : 'mix-blend-difference'}`}
      >
        {/* Toggle — centered in header, archive + work pages */}
        {isWhitePage && (
          <div id="archive-toggle-mount" className="hidden md:flex items-center justify-center gap-5 absolute top-6" style={{ left: '50%', transform: 'translateX(-50%)' }}>
            {/* Dark mode switch */}
            <button
              onClick={() => setDark(!dark)}
              className="w-12 h-6 rounded-full relative transition-colors flex-shrink-0"
              style={{ background: dark ? '#333' : '#e0e0e0' }}
              aria-label="Toggle light/dark mode"
            >
              <span
                className="absolute top-[2px] w-5 h-5 rounded-full transition-all duration-200"
                style={{
                  background: fg,
                  left: dark ? '26px' : '2px',
                }}
              />
            </button>

            {/* Info button — classic circled i */}
            <button
              onClick={(e) => { e.stopPropagation(); setShowInfo(true); setInfoDismissable(false); setTimeout(() => setInfoDismissable(true), 300) }}
              className="flex items-center justify-center rounded-full transition-all duration-300 flex-shrink-0 hover:scale-110 active:scale-95"
              style={{
                width: '22px',
                height: '22px',
                border: `1.5px solid ${dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)'}`,
                color: fg,
                fontSize: '12px',
                fontStyle: 'italic',
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontWeight: 400,
                opacity: 0.5,
              }}
              aria-label="About"
            >
              i
            </button>

            {/* Audio toggle — only on work page */}
            {isWork && (
              <button
                onClick={() => setAudioOn(!audioOn)}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-full transition-all duration-300 flex-shrink-0"
                style={{
                  background: dark
                    ? audioOn ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'
                    : audioOn ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.02)',
                  border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
                }}
                aria-label="Toggle ambient audio"
              >
                <span style={{ fontSize: '10px', opacity: audioOn ? 0.8 : 0.35 }}>♪</span>
                <span
                  className="text-[7px] uppercase tracking-widest font-bold"
                  style={{ color: fg, opacity: audioOn ? 0.5 : 0.3 }}
                >
                  {audioOn ? 'On' : 'Off'}
                </span>
                {audioOn && (
                  <span className="flex gap-[1px] items-end h-2">
                    {[0, 1, 2].map(i => (
                      <span
                        key={i}
                        className="w-[1.5px] rounded-full"
                        style={{
                          background: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)',
                          animationName: 'navAudioBar', animationDuration: '0.7s', animationTimingFunction: 'ease-in-out', animationDelay: `${i * 0.12}s`, animationIterationCount: 'infinite', animationDirection: 'alternate',
                          height: '2px',
                        }}
                      />
                    ))}
                  </span>
                )}
              </button>
            )}
          </div>
        )}

        <div className="flex items-start justify-between">
          {/* Left: Name */}
          {isWhitePage ? (
            <Link href="/work" className="hover:opacity-70 transition-opacity inline-block">
              <span className="font-black text-[clamp(1.4rem,3vw,2.4rem)] uppercase leading-[0.9] tracking-tight block whitespace-nowrap">
                Jordan Carter
              </span>
            </Link>
          ) : (
            <Link href="/work" className="hover:opacity-70 transition-opacity text-white">
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
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-sm font-bold uppercase tracking-wider hover:opacity-70 transition-opacity ${
                    pathname.startsWith(item.href) ? 'opacity-100' : 'opacity-50'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>


            {/* Mobile hamburger */}
            <button
              className={`md:hidden z-50 relative ${isWhitePage ? '' : 'text-white'}`}
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

      </header>

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
                  <span>Melbourne, Aus</span>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                  <span className="font-mono">{new Date().toLocaleTimeString('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                </div>
                <p className="text-[9px] tracking-[0.12em]">carterjordan75@gmail.com</p>
              </div>

              {/* Experimental type — small label */}
              <p
                className="text-center text-[9px] tracking-[0.2em] uppercase font-bold mb-2"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                3D Motion &amp; Generative
              </p>

              {/* Large name — experimental mixed weights */}
              <div className="text-center mb-2" style={{ color: '#ffffff' }}>
                <span className="font-light text-[clamp(1.8rem,5.5vw,3.8rem)] leading-[1] tracking-[-0.01em]">(</span>
                <span className="font-black text-[clamp(2rem,6vw,4.2rem)] leading-[1] tracking-[-0.02em] uppercase">Jordan</span>
                <span className="font-extralight text-[clamp(1.2rem,3.5vw,2.4rem)] leading-[1] tracking-[0.1em] uppercase" style={{ color: 'rgba(255,255,255,0.6)' }}>&apos;</span>
                <span className="font-black text-[clamp(2rem,6vw,4.2rem)] leading-[1] tracking-[-0.02em] uppercase">Carter</span>
                <span className="font-light text-[clamp(1.8rem,5.5vw,3.8rem)] leading-[1] tracking-[-0.01em]">)</span>
              </div>

              {/* Blurb — centred, experimental */}
              <p
                className="text-center text-[9px] leading-[1.7] tracking-[0.06em] uppercase font-bold max-w-[420px] mx-auto mb-5"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                A multidisciplinary creative working at the intersection of technology and craft. Building visual systems that feel alive, intentional, and unmistakably human.
              </p>

              {/* More button — pill, navigates to /info */}
              <div className="flex justify-center mb-5">
                <Link
                  href="/info"
                  onClick={() => setShowInfo(false)}
                  className="px-5 py-1.5 rounded-full text-[8px] uppercase tracking-[0.15em] font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                  style={{
                    border: '1px solid rgba(255,255,255,0.25)',
                    color: 'rgba(255,255,255,0.7)',
                    background: 'rgba(255,255,255,0.05)',
                  }}
                >
                  More
                </Link>
              </div>

              {/* Bottom row — Meta + copyright */}
              <div className="flex justify-between items-center" style={{ color: 'rgba(255,255,255,0.5)', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '0.75rem' }}>
                <div className="flex items-center gap-2">
                  <p className="text-[9px] tracking-[0.1em] uppercase">Currently working at</p>
                  <span className="font-black text-[11px] tracking-[0.08em] uppercase" style={{ color: '#ffffff' }}>META</span>
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
