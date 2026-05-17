'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useDarkMode } from '@/contexts/DarkModeContext'
import PageTransition from '@/components/PageTransition'
import PageLoader from '@/components/PageLoader'
import EmailPopup from '@/components/EmailPopup'
import AdminPortal from '@/components/AdminPortal'
import { motion, AnimatePresence } from 'framer-motion'

type GalleryItem = {
  src: string
  type: 'image' | 'video'
  cols: number
  rows: number
  credit: string
  source?: string
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
  const [uploadedItems, setUploadedItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showEmail, setShowEmail] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)

  // Fetch uploaded look items from API
  useEffect(() => {
    fetch('/api/look')
      .then(r => r.json())
      .then(data => {
        if (data.items?.length) {
          const mapped: GalleryItem[] = data.items.map((item: { path: string; originalName: string; credits: string; link: string }) => {
            const isVideo = /\.(mp4|webm|mov)$/i.test(item.originalName || item.path)
            return {
              src: item.path,
              type: isVideo ? 'video' as const : 'image' as const,
              cols: 1,
              rows: 1,
              credit: item.credits || 'Uploaded',
              source: item.link || undefined,
            }
          })
          setUploadedItems(mapped)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Only render what the admin has uploaded. Triple the array so the
  // infinite-scroll animation has enough content to loop seamlessly when
  // there's a small number of items. If empty, allItems stays empty too.
  const allItems = uploadedItems.length > 0
    ? [...uploadedItems, ...uploadedItems, ...uploadedItems]
    : []

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

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
  }, [activeItem])

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
              gridAutoRows: '25vh',
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
                  <Image
                    src={item.src}
                    alt=""
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 50vw, 25vw"
                    unoptimized
                  />
                ) : (
                  <video
                    src={item.src}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="absolute inset-0 w-full h-full object-contain"
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
            A living archive of references, obsessions &amp; visual fragments that shape the work. Click any image for credit &amp; source.
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
              onClick={() => {
                setActiveItem(null)
                setTimeout(() => { speedRef.current = 0.5 }, 500)
              }}
            >
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="relative w-[90vw] h-[85vh]"
                onClick={(e) => e.stopPropagation()}
              >
                {activeData.type === 'image' ? (
                  <Image
                    src={activeData.src}
                    alt={activeData.credit}
                    fill
                    className="object-contain"
                    unoptimized
                  />
                ) : (
                  <video
                    src={activeData.src}
                    autoPlay
                    loop
                    playsInline
                    controls
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                )}
              </motion.div>

              {/* Credit overlay at bottom */}
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                transition={{ delay: 0.15, duration: 0.3 }}
                className="fixed bottom-0 left-0 right-0 py-5 px-8 flex items-center justify-between"
                style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' }}
              >
                <p className="text-white text-[12px] font-bold uppercase tracking-[0.1em]">
                  {activeData.credit}
                </p>
                <div className="flex items-center gap-4">
                  {activeData.source && (
                    <a
                      href={activeData.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[9px] uppercase tracking-[0.15em] text-white/70 px-4 py-1.5 rounded-full hover:text-white hover:scale-105 transition-all"
                      style={{ border: '1px solid rgba(255,255,255,0.25)' }}
                    >
                      Visit Source ↗
                    </a>
                  )}
                  <button
                    onClick={() => {
                      setActiveItem(null)
                      setTimeout(() => { speedRef.current = 0.5 }, 500)
                    }}
                    className="text-[9px] uppercase tracking-[0.15em] text-white/50 px-4 py-1.5 rounded-full hover:text-white transition-all"
                    style={{ border: '1px solid rgba(255,255,255,0.15)' }}
                  >
                    Close
                  </button>
                </div>
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
              A curated gallery of visual references, inspirations, and things that catch the eye. A living moodboard.
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
