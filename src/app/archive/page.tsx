'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { projects } from '@/data/projects'
import PageTransition from '@/components/PageTransition'
import PageLoader from '@/components/PageLoader'
import EmailPopup from '@/components/EmailPopup'
import AdminPortal from '@/components/AdminPortal'
import { useDarkMode } from '@/contexts/DarkModeContext'

type SortOrder = 'latest' | 'earliest'
type ClientSort = 'az' | 'za'

const hoverColors = [
  '#e94560', '#ff6b35', '#00b4d8', '#7209b7', '#06d6a0',
  '#fb5607', '#3a86ff', '#8338ec', '#ff006e', '#38b000',
  '#f72585', '#4cc9f0', '#ef476f', '#ffd166', '#118ab2',
]

export default function ArchivePage() {
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest')
  const [clientSort, setClientSort] = useState<ClientSort>('az')
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [showEmail, setShowEmail] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showLoader, setShowLoader] = useState(false)
  const [loaderTarget, setLoaderTarget] = useState<string | null>(null)
  const router = useRouter()
  const { dark, fg, fg60, borderThick } = useDarkMode()

  const handleFeaturedClick = (slug: string) => {
    setLoaderTarget(`/work/${slug}`)
    setShowLoader(true)
  }

  const handleLoaderComplete = useCallback(() => {
    if (loaderTarget) {
      router.push(loaderTarget)
      setTimeout(() => {
        setShowLoader(false)
        setLoaderTarget(null)
      }, 600)
    } else {
      setShowLoader(false)
      setLoaderTarget(null)
    }
  }, [loaderTarget, router])

  const allProjects = useMemo(() => {
    const copy = [...projects]
    copy.sort((a, b) => {
      const yearDiff = sortOrder === 'latest' ? b.year - a.year : a.year - b.year
      if (yearDiff !== 0) return yearDiff
      const clientDiff = a.client.localeCompare(b.client)
      return clientSort === 'az' ? clientDiff : -clientDiff
    })
    return copy
  }, [sortOrder, clientSort])

  const featured = allProjects.filter((p) => p.featured)
  const archive = allProjects.filter((p) => !p.featured)

  const uniqueClients = new Set(projects.map((p) => p.client)).size

  const bg = dark ? '#000000' : '#ffffff'
  const borderColor = dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'

  const RowDesktop = ({ project }: { project: typeof projects[0] }) => (
    <>
      <span className="hidden md:block font-black text-[17px] uppercase tracking-[0.02em] leading-tight">
        {project.client}
      </span>
      <span className="hidden md:block text-[17px] uppercase tracking-[0.02em] font-black leading-tight">
        {project.title}
      </span>
      <span className="hidden md:block text-[13px] uppercase tracking-[0.06em] font-bold leading-tight" style={{ color: fg60 }}>
        {project.tags.join(' / ')}
      </span>
      <span className="hidden md:block text-right text-[17px] font-black leading-tight">
        {project.year}
      </span>
    </>
  )

  const RowMobile = ({ project }: { project: typeof projects[0] }) => (
    <div className="md:hidden">
      <div className="flex items-baseline justify-between">
        <span className="font-black text-[14px] uppercase tracking-[0.02em]">{project.client}</span>
        <span className="text-[14px] font-black">{project.year}</span>
      </div>
      <span className="text-[11px] uppercase tracking-[0.02em] opacity-50 font-black">{project.title}</span>
    </div>
  )

  return (
    <PageTransition>
      {/* Full-page theme wrapper — controls nav + page colors */}
      <div
        className={dark ? 'archive-theme-dark' : 'archive-theme-light'}
        style={{ background: bg, color: fg, minHeight: '100vh' }}
      >

        <main className="pt-28 md:pt-24 pb-0">

          {/* Subtle stats in square brackets — split left/right */}
          <div className="flex justify-between px-6 md:px-10 pb-2">
            <span className="text-[10px] tracking-[0.15em] uppercase" style={{ color: fg60 }}>
              [{projects.length} projects]
            </span>
            <span className="text-[10px] tracking-[0.15em] uppercase" style={{ color: fg60 }}>
              [{uniqueClients} clients]
            </span>
          </div>

          {/* Table header */}
          <div
            className="hidden md:grid grid-cols-[1.2fr_2fr_1fr_0.4fr] gap-4 px-6 md:px-10 py-2 text-[10px] tracking-[0.2em] uppercase"
            style={{ borderBottom: `2px solid ${borderThick}`, color: fg60 }}
          >
            <button
              onClick={() => setClientSort(clientSort === 'az' ? 'za' : 'az')}
              className="text-left hover:opacity-80 transition-opacity"
            >
              Client ({clientSort === 'az' ? 'A-Z' : 'Z-A'})
            </button>
            <span>Project</span>
            <span>Category</span>
            <button
              onClick={() => setSortOrder(sortOrder === 'latest' ? 'earliest' : 'latest')}
              className="text-right hover:opacity-80 transition-opacity"
            >
              Year {sortOrder === 'latest' ? '↓' : '↑'}
            </button>
          </div>

          {/* Mobile header */}
          <div
            className="md:hidden px-6 py-2 text-[10px] tracking-[0.2em] uppercase flex justify-between"
            style={{ borderBottom: `2px solid ${borderThick}`, color: fg60 }}
          >
            <button onClick={() => setClientSort(clientSort === 'az' ? 'za' : 'az')} className="hover:opacity-80">
              Client ({clientSort === 'az' ? 'A-Z' : 'Z-A'})
            </button>
            <button onClick={() => setSortOrder(sortOrder === 'latest' ? 'earliest' : 'latest')} className="hover:opacity-80">
              Year {sortOrder === 'latest' ? '↓' : '↑'}
            </button>
          </div>

          {/* Featured rows */}
          {featured.map((project, i) => {
            const color = hoverColors[i % hoverColors.length]
            const isHovered = hoveredRow === `f-${project.slug}`
            return (
              <div
                key={project.slug}
                onClick={() => handleFeaturedClick(project.slug)}
                className="archive-row block md:grid grid-cols-[1.2fr_2fr_1fr_0.4fr] gap-4 px-6 md:px-10 py-[8px] cursor-pointer items-baseline"
                style={{
                  borderBottom: `2px solid ${borderColor}`,
                  background: isHovered ? color : 'transparent',
                  color: isHovered ? '#ffffff' : undefined,
                }}
                onMouseEnter={() => setHoveredRow(`f-${project.slug}`)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <RowDesktop project={project} />
                <RowMobile project={project} />
              </div>
            )
          })}

          {/* Divider with gap */}
          <div className="py-2" style={{ borderBottom: `3px solid ${borderThick}` }} />

          {/* Archive rows — not clickable (non-featured) */}
          <AnimatePresence mode="popLayout">
            {archive.map((project) => {
              const isHovered = hoveredRow === `a-${project.slug}`
              return (
              <motion.div
                key={project.slug}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div
                  className="archive-row block md:grid grid-cols-[1.2fr_2fr_1fr_0.4fr] gap-4 px-6 md:px-10 py-[8px] items-baseline"
                  style={{
                    borderBottom: `2px solid ${borderColor}`,
                    background: isHovered ? (dark ? '#ffffff' : '#000000') : 'transparent',
                    color: isHovered ? (dark ? '#000000' : '#ffffff') : undefined,
                    cursor: 'default',
                  }}
                  onMouseEnter={() => setHoveredRow(`a-${project.slug}`)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <RowDesktop project={project} />
                  <RowMobile project={project} />
                </div>
              </motion.div>
              )
            })}
          </AnimatePresence>

          {/* Footer */}
          <footer
            className="mt-0 px-6 md:px-10 py-5"
            style={{ borderTop: `3px solid ${borderThick}` }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex gap-3 flex-shrink-0">
                <button onClick={() => setShowEmail(true)} className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}` }}>Email</button>
                <a href="https://instagram.com/jordanscarter" target="_blank" rel="noopener noreferrer" className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}` }}>Insta</a>
              </div>
              <p className="hidden md:block text-[9px] leading-[1.5] tracking-[0.04em] uppercase max-w-2xl text-center" style={{ color: fg60 }}>
                [PLACEHOLDER] — A multidisciplinary creative practice spanning motion design, 3D environments, generative art, and illustration. Every project is an opportunity to merge craft with experimentation — building visual systems that feel alive, intentional, and unmistakably human.
              </p>
              <div className="flex gap-3 flex-shrink-0">
                <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="w-14 h-14 rounded-full flex items-center justify-center text-[16px] hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}` }} aria-label="Back to top">↑</button>
                <button onClick={() => setShowAdmin(true)} className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}`, color: fg60 }}>© 2026</button>
              </div>
            </div>
          </footer>
        </main>
      </div>
      <EmailPopup show={showEmail} onClose={() => setShowEmail(false)} />
      <AdminPortal show={showAdmin} onClose={() => setShowAdmin(false)} />
      <PageLoader show={showLoader} onComplete={handleLoaderComplete} />
    </PageTransition>
  )
}
