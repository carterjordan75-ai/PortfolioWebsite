'use client'

import { projectHref } from '@/lib/projectUrl'

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { projects } from '@/data/projects'
import PageTransition from '@/components/PageTransition'
import FooterBlurb from '@/components/FooterBlurb'
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

// Wrap the page in a Suspense boundary so useSearchParams can read query
// params without forcing the whole tree out of static rendering.
export default function ArchivePage() {
  return (
    <Suspense fallback={null}>
      <ArchivePageInner />
    </Suspense>
  )
}

function ArchivePageInner() {
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest')
  const [clientSort, setClientSort] = useState<ClientSort>('az')
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [showEmail, setShowEmail] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showLoader, setShowLoader] = useState(false)
  const [employmentData, setEmploymentData] = useState([
    { company: 'Meta', role: 'Senior 3D & AI Artist', year: '2026', link: 'https://meta.com' },
    { company: 'SouthSouthWest', role: 'Senior 3D Artist', year: '2025', link: 'https://southsouthwest.com.au' },
    { company: 'ANZ', role: 'Senior 3D Designer', year: '2024', link: 'https://anz.com.au' },
    { company: 'Time Based Arts', role: '3D Artist & Art Director', year: '2022–24', link: 'https://timebasedarts.com' },
    { company: 'Aardman Animations', role: '3D Modeller & Texture Artist', year: '2021–22', link: 'https://aardman.com' },
    { company: 'UNIT Film & TV', role: '3D Artist', year: '2019–20', link: '' },
  ])
  const [loaderTarget, setLoaderTarget] = useState<string | null>(null)
  const [adminProjects, setAdminProjects] = useState<typeof projects>([])
  const router = useRouter()
  const searchParams = useSearchParams()
  // `?cat=gen` flips the page to the generative-only variant. Same visual,
  // but EVERY project is rendered as a featured row (no archive section)
  // because generative projects don't have a published / unpublished
  // distinction yet — they're all hero-tier.
  const isGenView = searchParams?.get('cat') === 'gen'
  const { dark, fg, fg60, borderThick } = useDarkMode()

  // Fetch merged projects from API (code + admin overrides)
  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => {
        if (data.projects?.length) {
          const mapped = data.projects.map((p: Record<string, unknown>) => ({
            slug: p.slug as string,
            client: p.client as string,
            title: p.title as string,
            year: p.year as number,
            tags: (p.tags as string[]) || ['Motion'],
            featured: p.featured as boolean || false,
            type: (p.type as string) || 'media-forward',
            thumbnail: (p.thumbnail as string) || '/placeholder/thumb-1.svg',
            heroMedia: (p.heroMedia as string) || '/placeholder/hero-1.svg',
            brief: p.brief as string || undefined,
            role: p.role as string || undefined,
            category: (p.category as '3d' | 'gen' | undefined),
          }))
          setAdminProjects(mapped)
        }
      })
      .catch(() => {})

    // Load employment data
    fetch('/api/pages')
      .then(r => r.json())
      .then(data => {
        const pages = data.pages || data
        if (pages['employment']?.jobs) {
          try { setEmploymentData(JSON.parse(pages['employment'].jobs)) } catch {}
        }
      })
      .catch(() => {})
  }, [])

  const handleFeaturedClick = (target: string) => {
    setLoaderTarget(target)
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

  // In Gen view, only generative projects are visible — and every one of
  // them is rendered as a "featured" row (full hover-colour treatment, no
  // archive section). Otherwise it's the regular split: featured + archive.
  const featured = useMemo(() => {
    const source = adminProjects.length > 0 ? adminProjects : projects
    if (isGenView) {
      return source.filter(p => (p as typeof source[0] & { category?: string }).category === 'gen')
    }
    return source.filter((p) => p.featured)
  }, [adminProjects, isGenView])

  // Archive (non-featured) projects get sorted. Hidden entirely in Gen view.
  const archive = useMemo(() => {
    if (isGenView) return []
    const source = adminProjects.length > 0 ? adminProjects : projects
    const nonFeatured = source.filter((p) => !p.featured)
    nonFeatured.sort((a, b) => {
      const yearDiff = sortOrder === 'latest' ? b.year - a.year : a.year - b.year
      if (yearDiff !== 0) return yearDiff
      const clientDiff = a.client.localeCompare(b.client)
      return clientSort === 'az' ? clientDiff : -clientDiff
    })
    return nonFeatured
  }, [sortOrder, clientSort, adminProjects, isGenView])

  const allProjects = useMemo(() => [...featured, ...archive], [featured, archive])

  const uniqueClients = new Set(allProjects.map((p) => p.client)).size

  const bg = dark ? '#000000' : '#ffffff'
  const borderColor = dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'

  // In Gen view there's no real "client" — these are personal/generative
  // projects — so the title takes the bold first-column slot and the
  // "Project" cell is blank to avoid showing the name twice.
  const RowDesktop = ({ project }: { project: typeof projects[0] }) => (
    <>
      <span className="hidden md:block font-black text-[17px] uppercase tracking-[0.02em] leading-tight">
        {isGenView ? project.title : project.client}
      </span>
      <span className="hidden md:block text-[17px] uppercase tracking-[0.02em] font-black leading-tight">
        {isGenView ? '' : project.title}
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
        <span className="font-black text-[14px] uppercase tracking-[0.02em]">
          {isGenView ? project.title : project.client}
        </span>
        <span className="text-[14px] font-black">{project.year}</span>
      </div>
      {!isGenView && (
        <span className="text-[11px] uppercase tracking-[0.02em] opacity-50 font-black">{project.title}</span>
      )}
    </div>
  )

  return (
    <>
      {/* Outside PageTransition on purpose: the loader is a fixed
          full-screen overlay, and PageTransition animates a transform,
          which makes it the containing block for anything fixed inside
          it. See the note on the home page. */}
      <PageLoader show={showLoader} onComplete={handleLoaderComplete} />
    <PageTransition>
      {/* Full-page theme wrapper — controls nav + page colors. Flex column
          so the footer (which is the last child of <main>) sits at the
          viewport bottom even when the project list is short. */}
      <div
        className={dark ? 'archive-theme-dark' : 'archive-theme-light'}
        style={{
          background: bg,
          color: fg,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >

        <main className="pt-28 md:pt-24 pb-0" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* Subtle stats in square brackets — split left/right. Gen view
              gets a small label + an escape hatch back to the full index. */}
          <div className="flex justify-between items-baseline px-6 md:px-10 pb-2">
            <span className="text-[10px] tracking-[0.15em] uppercase" style={{ color: fg60 }}>
              {isGenView ? (
                <>
                  [generative · {featured.length} projects] <a href="/indexx" className="ml-2 hover:opacity-100 transition-opacity" style={{ opacity: 0.6 }}>← all projects</a>
                </>
              ) : (
                `[${allProjects.length} projects]`
              )}
            </span>
            {!isGenView && (
              <span className="text-[10px] tracking-[0.15em] uppercase" style={{ color: fg60 }}>
                [{uniqueClients} clients]
              </span>
            )}
          </div>

          {/* Table header — in Gen view the "Client" cell becomes "Project"
              (since these projects have no client) and the secondary
              "Project" cell is left blank. Sort buttons stay live for the
              non-Gen archive list and are no-op in Gen view. */}
          <div
            className="hidden md:grid grid-cols-[1.2fr_2fr_1fr_0.4fr] gap-4 px-6 md:px-10 py-2 text-[10px] tracking-[0.2em] uppercase"
            style={{ borderBottom: `2px solid ${borderThick}`, color: fg60 }}
          >
            {isGenView ? (
              <span className="text-left">Project</span>
            ) : (
              <button
                onClick={() => setClientSort(clientSort === 'az' ? 'za' : 'az')}
                className="text-left hover:opacity-80 transition-opacity"
              >
                Client ({clientSort === 'az' ? 'A-Z' : 'Z-A'})
              </button>
            )}
            <span>{isGenView ? '' : 'Project'}</span>
            <span>Category</span>
            {isGenView ? (
              <span className="text-right">Year</span>
            ) : (
              <button
                onClick={() => setSortOrder(sortOrder === 'latest' ? 'earliest' : 'latest')}
                className="text-right hover:opacity-80 transition-opacity"
              >
                Year {sortOrder === 'latest' ? '↓' : '↑'}
              </button>
            )}
          </div>

          {/* Mobile header */}
          <div
            className="md:hidden px-6 py-2 text-[10px] tracking-[0.2em] uppercase flex justify-between"
            style={{ borderBottom: `2px solid ${borderThick}`, color: fg60 }}
          >
            {isGenView ? (
              <span>Project</span>
            ) : (
              <button onClick={() => setClientSort(clientSort === 'az' ? 'za' : 'az')} className="hover:opacity-80">
                Client ({clientSort === 'az' ? 'A-Z' : 'Z-A'})
              </button>
            )}
            {isGenView ? (
              <span>Year</span>
            ) : (
              <button onClick={() => setSortOrder(sortOrder === 'latest' ? 'earliest' : 'latest')} className="hover:opacity-80">
                Year {sortOrder === 'latest' ? '↓' : '↑'}
              </button>
            )}
          </div>

          {/* Featured rows */}
          {featured.map((project, i) => {
            const color = hoverColors[i % hoverColors.length]
            const isHovered = hoveredRow === `f-${project.slug}`
            return (
              <div
                key={project.slug}
                onClick={() => handleFeaturedClick(projectHref(project))}
                className="archive-row block md:grid grid-cols-[1.2fr_2fr_1fr_0.4fr] gap-4 px-6 md:px-10 py-[8px] cursor-pointer items-baseline"
                style={{
                  borderBottom: `2px solid ${borderColor}`,
                  background: isHovered ? color : 'transparent',
                  color: isHovered ? '#ffffff' : undefined,
                  // Asymmetric transition — instant snap when the cursor
                  // ENTERS the row, then a slow 1s ease-out when it leaves.
                  // The transition property is set at the same time as the
                  // new background, so the browser uses the new duration to
                  // animate towards the new value. Combined with the fact
                  // that each row's isHovered is independent, moving the
                  // cursor across rows leaves a trail of fading highlights.
                  transition: isHovered
                    ? 'background 0.08s ease-out, color 0.08s ease-out'
                    : 'background 1s ease-out, color 1s ease-out',
                }}
                onMouseEnter={() => setHoveredRow(`f-${project.slug}`)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <RowDesktop project={project} />
                <RowMobile project={project} />
              </div>
            )
          })}

          {/* Divider with gap — hidden in Gen view since there's no archive
              section below it. */}
          {!isGenView && (
            <div className="py-2" style={{ borderBottom: `3px solid ${borderThick}` }} />
          )}

          {/* Archive rows — not clickable (non-featured). Empty in Gen view
              so the AnimatePresence renders nothing. */}
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
                    transition: isHovered
                      ? 'background 0.08s ease-out, color 0.08s ease-out'
                      : 'background 1s ease-out, color 1s ease-out',
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

          {/* Employment rows — compact. Hidden in Gen view (irrelevant to
              the generative-films-only index). */}
          <div className="mt-3" style={{ display: isGenView ? 'none' : undefined }}>
            {employmentData.map((job, empIdx) => {
              const isHovered = hoveredRow === `emp-${job.company}`
              const hoverColor = hoverColors[empIdx % hoverColors.length]
              return (
                <div
                  key={job.company}
                  className="block md:grid grid-cols-[1.2fr_2fr_1fr_0.4fr] gap-4 px-6 md:px-10 py-[4px] items-baseline"
                  style={{
                    borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                    background: isHovered ? hoverColor : 'transparent',
                    color: isHovered ? '#ffffff' : undefined,
                    transition: isHovered
                      ? 'background 0.08s ease-out, color 0.08s ease-out'
                      : 'background 1s ease-out, color 1s ease-out',
                  }}
                  onMouseEnter={() => setHoveredRow(`emp-${job.company}`)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  {job.link ? (
                    <a href={job.link} target="_blank" rel="noopener noreferrer" className="hidden md:block font-bold text-[11px] uppercase tracking-[0.02em] leading-tight hover:underline">{job.company}</a>
                  ) : (
                    <span className="hidden md:block font-bold text-[11px] uppercase tracking-[0.02em] leading-tight">{job.company}</span>
                  )}
                  <span className="hidden md:block text-[11px] uppercase tracking-[0.02em] font-bold leading-tight" style={{ opacity: 0.5 }}>{job.role}</span>
                  <span className="hidden md:block" />
                  <span className="hidden md:block text-right text-[11px] font-bold leading-tight" style={{ opacity: 0.4 }}>{job.year}</span>
                  <div className="md:hidden">
                    <div className="flex items-baseline justify-between">
                      {job.link ? (
                      <a href={job.link} target="_blank" rel="noopener noreferrer" className="font-bold text-[10px] uppercase hover:underline">{job.company}</a>
                    ) : (
                      <span className="font-bold text-[10px] uppercase">{job.company}</span>
                    )}
                      <span className="text-[10px] font-bold" style={{ opacity: 0.4 }}>{job.year}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer — inline marginTop: auto pushes it to the viewport
              bottom when the project list is shorter than one screen
              (typical for the Gen view). Inline because .glass-footer
              has a shorthand `margin: 0 8px 8px 8px` rule that would
              otherwise override mt-auto. */}
          <footer
            className="px-6 md:px-10 py-5 glass-footer"
            style={{ marginTop: 'auto' }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex gap-3 flex-shrink-0">
                <button onClick={() => setShowEmail(true)} className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}` }}>Email</button>
                <a href="https://instagram.com/jordanscarter" target="_blank" rel="noopener noreferrer" className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}` }}>Insta</a>
              </div>
              <FooterBlurb pageId="archive" className="hidden md:block text-[9px] leading-[1.5] tracking-[0.04em] uppercase max-w-2xl text-center" style={{ color: fg60 }} />
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
    </PageTransition>
    </>
  )
}
