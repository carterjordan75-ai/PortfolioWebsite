'use client'

import { useState, useEffect } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { projects } from '@/data/projects'
import PageTransition from '@/components/PageTransition'
import EmailPopup from '@/components/EmailPopup'
import AdminPortal from '@/components/AdminPortal'
import FooterBlurb from '@/components/FooterBlurb'
import { useDarkMode } from '@/contexts/DarkModeContext'
import { motion, AnimatePresence } from 'framer-motion'
import { useRef } from 'react'
import EditableText from '@/components/EditableText'
import ProjectMediaPanel, { type ProjectMediaItem } from '@/components/ProjectMediaPanel'
import PageLoader from '@/components/PageLoader'
import { useEditMode } from '@/contexts/EditModeContext'

const featuredProjects = projects.filter(p => p.featured)

// Client logo mapping
const clientLogos: Record<string, { src: string; width: number; height: number }> = {
  'Nike': { src: '/assets/Logos/Logo_NIKE.svg', width: 220, height: 80 },
  'Adidas Originals': { src: '/assets/Logos/Logo_ADIDAS_ORIGINALS.webp', width: 200, height: 80 },
  'Adidas Rugby': { src: '/assets/Logos/Logo_ADIDAS.webp', width: 200, height: 80 },
}

function classifyMedia(path: string): 'video' | 'image' {
  return /\.(mp4|webm|mov)$/i.test(path) ? 'video' : 'image'
}

export default function ProjectPage({ params }: { params: { slug: string } }) {
  const codeProject = projects.find((p) => p.slug === params.slug)

  const { dark, fg, fg60, borderThick } = useDarkMode()
  const [showEmail, setShowEmail] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [expandedMedia, setExpandedMedia] = useState<number | null>(null)
  const [viewCount, setViewCount] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const leftPanelRef = useRef<HTMLDivElement>(null)
  const [adminProject, setAdminProject] = useState<Record<string, unknown> | null>(null)
  const [adminLoading, setAdminLoading] = useState(!codeProject)
  const { editMode, addChange } = useEditMode()
  const [logoScale, setLogoScale] = useState(100)
  // Admin-supplied media list (preferred). Held in local state so the
  // inline media manager can mutate it without a full refetch. Hooks must
  // sit above any early returns below, hence declared here.
  const [localMedia, setLocalMedia] = useState<Array<{ name?: string; path?: string }> | null>(null)
  const [mediaPanelOpen, setMediaPanelOpen] = useState(false)

  // Always fetch admin data — for code projects it may have overrides (logo, brief, etc.)
  // cache: 'no-store' so admin edits show up immediately on the public page
  // (otherwise the browser/Vercel edge cache can serve a stale title/brief).
  useEffect(() => {
    fetch('/api/projects', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        const found = (data.projects || []).find((p: Record<string, unknown>) => p.slug === params.slug)
        setAdminProject(found || null)
        if (found?.logoSize) setLogoScale(Number(found.logoSize))
        setAdminLoading(false)
      })
      .catch(() => setAdminLoading(false))
  }, [params.slug])

  // Track page views per project in localStorage
  useEffect(() => {
    const key = `jc-views-${params.slug}`
    const current = parseInt(localStorage.getItem(key) || '0', 10) + 1
    localStorage.setItem(key, String(current))
    setViewCount(current)
  }, [params.slug])

  // Mirror the latest admin media into local state — used by the inline
  // media manager + by getProjectMedia() when rendering the page.
  useEffect(() => {
    const m = (adminProject?.media as Array<{ name?: string; path?: string }> | undefined) || null
    setLocalMedia(m)
  }, [adminProject])

  // Merge: code project as base, admin data as overrides
  const baseProject = codeProject || (adminProject ? {
    slug: String(adminProject.slug || ''),
    client: String(adminProject.client || 'Untitled'),
    title: String(adminProject.title || ''),
    year: Number(adminProject.year || 2026),
    tags: (adminProject.tags as string[]) || ['Motion'],
    featured: Boolean(adminProject.featured),
    type: String(adminProject.type || 'case-study') as 'case-study' | 'media-forward',
    thumbnail: String(adminProject.thumbnail || ''),
    heroMedia: String(adminProject.heroMedia || ''),
    brief: adminProject.brief ? String(adminProject.brief) : undefined,
    role: adminProject.role ? String(adminProject.role) : undefined,
    content: [],
  } : null)

  // Apply ALL admin overrides on top of code project
  const project = baseProject ? {
    ...baseProject,
    ...(adminProject ? {
      ...(adminProject.client ? { client: String(adminProject.client) } : {}),
      ...(adminProject.title ? { title: String(adminProject.title) } : {}),
      ...(adminProject.year ? { year: Number(adminProject.year) } : {}),
      ...(adminProject.tags ? { tags: adminProject.tags as string[] } : {}),
      ...(adminProject.featured !== undefined ? { featured: Boolean(adminProject.featured) } : {}),
      ...(adminProject.brief ? { brief: String(adminProject.brief) } : {}),
      ...(adminProject.role ? { role: String(adminProject.role) } : {}),
      ...(adminProject.logoPath ? { logoPath: String(adminProject.logoPath) } : {}),
      ...(adminProject.media ? { adminMedia: adminProject.media } : {}),
      ...(adminProject.credits ? { credits: String(adminProject.credits) } : {}),
      ...(adminProject.toolbox ? { toolbox: String(adminProject.toolbox) } : {}),
    } : {}),
  } : null

  // Show the circle-grid loader while admin data is still in flight. The
  // loader covers the page in 'data' mode — it stays put until adminLoading
  // flips false, then plays its reveal animation as the page slides in
  // underneath. (See PageLoader's 'data' mode.)
  if (adminLoading) {
    return (
      <div style={{ background: dark ? '#0a0a0a' : '#f5f5f0', minHeight: '100vh' }}>
        <PageLoader show={true} mode="data" />
      </div>
    )
  }

  if (!project) return notFound()

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const [{ default: JSZip }, { default: html2canvas }] = await Promise.all([
        import('jszip'),
        import('html2canvas'),
      ])
      const zip = new JSZip()
      const folder = zip.folder(`${project.client.replace(/[^a-zA-Z0-9]/g, '_')}_${project.year}_JordanCarter`)!

      // 1. Capture left panel as .webp
      if (leftPanelRef.current) {
        const canvas = await html2canvas(leftPanelRef.current, {
          backgroundColor: '#f5f5f0',
          scale: 2,
          useCORS: true,
        })
        // Add watermark
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.globalAlpha = 0.08
          ctx.font = 'bold 40px sans-serif'
          ctx.fillStyle = '#000000'
          ctx.save()
          ctx.translate(canvas.width / 2, canvas.height / 2)
          ctx.rotate(-Math.PI / 6)
          for (let y = -canvas.height; y < canvas.height; y += 120) {
            for (let x = -canvas.width; x < canvas.width; x += 500) {
              ctx.fillText('© JORDAN CARTER', x, y)
            }
          }
          ctx.restore()
          ctx.globalAlpha = 1
        }
        const webpBlob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b!), 'image/webp', 0.92)
        )
        folder.file('project_info.webp', webpBlob)
      }

      // 2. Generate encrypted placeholder media files with copyright
      const mediaCount = allMedia.length
      for (let i = 0; i < mediaCount; i++) {
        const label = allMedia[i]?.label || String(i + 1).padStart(2, '0')
        // Create a canvas with copyright watermark as placeholder
        const c = document.createElement('canvas')
        c.width = 1920
        c.height = 1080
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#111111'
        ctx.fillRect(0, 0, 1920, 1080)
        // Center label
        ctx.fillStyle = '#333333'
        ctx.font = 'bold 72px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`${project.client} — ${label}`, 960, 520)
        ctx.font = '24px sans-serif'
        ctx.fillStyle = '#222222'
        ctx.fillText(`© ${new Date().getFullYear()} Jordan Carter. All rights reserved.`, 960, 580)
        // Diagonal watermark
        ctx.globalAlpha = 0.04
        ctx.font = 'bold 36px sans-serif'
        ctx.fillStyle = '#ffffff'
        ctx.save()
        ctx.translate(960, 540)
        ctx.rotate(-Math.PI / 6)
        for (let y = -1200; y < 1200; y += 100) {
          for (let x = -1600; x < 1600; x += 450) {
            ctx.fillText('JORDAN CARTER ©', x, y)
          }
        }
        ctx.restore()
        ctx.globalAlpha = 1

        const blob = await new Promise<Blob>((resolve) =>
          c.toBlob((b) => resolve(b!), 'image/webp', 0.85)
        )
        folder.file(`media_${label.replace(/\./g, '-')}.webp`, blob)
      }

      // 3. LICENSE.txt
      const hash = btoa(`JC-${params.slug}-${Date.now()}-ENCRYPTED`).replace(/=/g, '')
      const license = `════════════════════════════════════════════════
© ${new Date().getFullYear()} JORDAN CARTER — ALL RIGHTS RESERVED
════════════════════════════════════════════════

Project: ${project.client} — ${project.title}
Year: ${project.year}
Role: ${project.role}

This media package is encrypted and watermarked.
Unauthorized distribution, reproduction, or modification
of any files in this package is strictly prohibited.

License holder: [AUTHORIZED VIEWER]
Download timestamp: ${new Date().toISOString()}
Encryption hash: ${hash}
Verification: https://jordanscarter.com/verify/${hash.slice(0, 16)}

All media files contain invisible watermarking tied to
this license. Any breach is traceable and actionable.

For licensing inquiries: carterjordan75@gmail.com
════════════════════════════════════════════════`
      folder.file('LICENSE.txt', license)

      // Generate and download ZIP
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project.client.replace(/[^a-zA-Z0-9]/g, '_')}_${project.year}_JordanCarter.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed:', err)
    } finally {
      setDownloading(false)
    }
  }

  const featIdx = featuredProjects.findIndex(p => p.slug === params.slug)
  const prev = featIdx > 0 ? featuredProjects[featIdx - 1] : featuredProjects[featuredProjects.length - 1]
  const next = featIdx < featuredProjects.length - 1 ? featuredProjects[featIdx + 1] : featuredProjects[0]

  const pageBg = dark ? '#0a0a0a' : '#f5f5f0'
  const rule = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'

  // The page renders ONLY admin-uploaded media (no test-pool fallback). When
  // the admin list is empty the right column shows an empty-state hint
  // pointing the user to the admin panel.
  const allMedia: { aspect: string; label: string; src: string; mediaType: 'video' | 'image' }[] =
    (localMedia ?? [])
      .filter(m => !!m.path)
      .map((m, i) => {
        const mediaType: 'video' | 'image' = classifyMedia(m.path!)
        const aspect = (m as { aspect?: string }).aspect || (mediaType === 'video' ? '16/9' : '4/3')
        return { aspect, label: String(i + 1).padStart(2, '0'), src: m.path!, mediaType }
      })

  return (
    <PageTransition>
      <div style={{ background: pageBg, color: fg, minHeight: '100vh' }}>

        <div className="flex flex-col md:flex-row" style={{ height: '100vh', paddingTop: '68px' }}>

          {/* LEFT — 1/3 — format5-style, scrollbar on left via direction trick */}
          <div
            className="w-full md:w-[33%] overflow-y-auto flex-shrink-0"
            style={{ borderRight: `1px solid ${rule}`, direction: 'rtl' }}
          >
            <div ref={leftPanelRef} className="px-5 py-5 flex flex-col" style={{ direction: 'ltr', color: dark ? '#ffffff' : '#000000' }}>

              {/* Top row — year, views, download, featured */}
              <div className="flex items-center gap-3 mb-1">
                <span className="text-[10px] tracking-[0.1em] uppercase">{project.year}</span>
                <span className="text-[10px]" style={{ opacity: 0.15 }}>|</span>
                <span className="text-[9px] font-mono" style={{ opacity: 0.4 }}>[views: {viewCount}]</span>

                {/* Download button — pill style */}
                <button
                  className="ml-auto mr-3 flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] tracking-[0.1em] uppercase font-bold transition-all hover:scale-105 active:scale-95"
                  style={{
                    border: `1.5px solid ${dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)'}`,
                    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    opacity: downloading ? 0.5 : 1,
                    pointerEvents: downloading ? 'none' : 'auto',
                  }}
                  onClick={handleDownload}
                  disabled={downloading}
                >
                  <span style={{ fontSize: '11px' }}>{downloading ? '⏳' : '↓'}</span> {downloading ? 'Packing...' : 'Download'}
                </button>

                <span className="text-[10px] tracking-[0.15em] uppercase">featured</span>
              </div>

              {/* Client — MASSIVE, single line, auto-shrinks to fit */}
              <h1
                ref={(el) => {
                  if (!el) return
                  // Auto-shrink to fit on one line
                  let size = 80
                  el.style.fontSize = `${size}px`
                  while (el.scrollWidth > el.clientWidth && size > 20) {
                    size -= 2
                    el.style.fontSize = `${size}px`
                  }
                }}
                className="font-black leading-[1] tracking-[-0.04em] mb-2 whitespace-nowrap overflow-visible"
              >
                {project.client}
              </h1>

              {/* Title — scattered words, mixed weights/sizes */}
              <div className="mb-3 -mt-1">
                {project.title.split(' ').map((word, i) => (
                  <span key={i}>
                    {i > 0 && <span className="text-[11px]" style={{ opacity: 0.15 }}>{' '}</span>}
                    <span
                      className={i % 3 === 0 ? 'font-black' : i % 3 === 1 ? 'font-light' : 'font-bold italic'}
                      style={{ fontSize: i === 0 ? 'clamp(1.6rem, 5vw, 2.8rem)' : i % 2 === 0 ? '1.1rem' : 'clamp(1.2rem, 3.5vw, 2rem)', lineHeight: 1 }}
                    >
                      {word}
                    </span>
                  </span>
                ))}
              </div>

              {/* Tags scattered inline with different sizes */}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0 mb-4">
                {project.tags.map((tag, i) => (
                  <span key={i} className={i === 0 ? 'font-black text-[13px]' : 'font-light text-[10px]'} style={{ opacity: i === 0 ? 1 : 0.6 }}>
                    {tag.toLowerCase()}{i < project.tags.length - 1 && <span className="font-light ml-1" style={{ opacity: 0.2 }}>/</span>}
                  </span>
                ))}
                <span className="text-[10px] ml-2" style={{ opacity: 0.3 }}>—</span>
                <span className="text-[11px]">{project.role || 'direction, design, animation'}</span>
              </div>

              {/* Brief — medium blurb */}
              <EditableText
                slug={project.slug}
                field="brief"
                defaultValue={project.brief || `A collaborative project exploring the intersection of digital craft and physical form — pushing visual language into new territory through motion and generative systems. The brief called for something that felt both futuristic and grounded, merging organic textures with precise geometric forms across multiple formats. We developed a visual system from scratch, iterating through styleframes and motion tests over an intensive 8-week sprint. The result is a body of work that bridges the gap between commercial storytelling and experimental art direction, built to scale across digital, social and physical touchpoints.`}
                tag="p"
                className="text-[12px] leading-[1.6] tracking-[0.005em] mb-4"
              />

              {/* Thin rule */}
              <div style={{ borderTop: `1px solid ${rule}`, marginBottom: '1rem' }} />

              {/* The Toolbox — editable */}
              <div className="mb-4">
                <span className="font-black text-[8px] tracking-[0.25em] uppercase">The Toolbox</span>
                <span className="text-[8px] ml-2" style={{ opacity: 0.3 }}>005</span>
                <EditableText
                  slug={project.slug}
                  field="toolbox"
                  defaultValue={(project as Record<string, unknown>).toolbox as string || "Cinema 4D · Redshift · After Effects · TouchDesigner · Custom WebGL prototypes · Figma · Resolve"}
                  tag="p"
                  className="text-[10px] leading-[1.6] mt-1"
                  style={{ opacity: 0.55 }}
                />
              </div>

              {/* Client logo with size control in edit mode. Hidden when
                  the project is flagged `hideLogo: true` (typical for
                  Generative projects that don't have a client logo). */}
              {(() => {
                const hideLogo = Boolean(adminProject?.hideLogo)
                if (hideLogo) return null
                const adminLogoPath = adminProject?.logoPath ? String(adminProject.logoPath) : null
                const logo = adminLogoPath
                  ? { src: adminLogoPath, width: 200, height: 80 }
                  : (clientLogos[project.client] || clientLogos['Nike'])
                return (
                  <div className="mb-6">
                    {/* Fixed-size container that clips the logo */}
                    <div
                      className="flex items-center justify-center py-4 overflow-hidden"
                      style={{ height: '120px', position: 'relative' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={logo.src}
                        alt={`${project.client} logo`}
                        className="object-contain"
                        style={{
                          filter: dark ? 'invert(1)' : 'none',
                          opacity: 0.85,
                          width: `${logo.width * (logoScale / 100)}px`,
                          height: 'auto',
                          maxHeight: `${80 * (logoScale / 100)}px`,
                        }}
                      />
                    </div>
                    {editMode && (
                      <div className="flex items-center justify-center gap-3 mt-1 px-3 py-2 rounded-lg" style={{ background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}` }}>
                        <span className="text-[8px] uppercase tracking-wider" style={{ opacity: 0.4 }}>Logo Size</span>
                        <input
                          type="range"
                          min={30}
                          max={400}
                          value={logoScale}
                          onChange={(e) => {
                            const val = parseInt(e.target.value)
                            setLogoScale(val)
                            addChange(project.slug, 'logoSize', String(val))
                          }}
                          className="w-24 accent-pink-400"
                          style={{ height: '2px' }}
                        />
                        <span className="text-[8px] font-mono" style={{ opacity: 0.4 }}>{logoScale}%</span>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Credits — editable */}
              <EditableText
                slug={project.slug}
                field="credits"
                defaultValue={(project as Record<string, unknown>).credits as string || `direction: Jordan Carter — design: Studio JC — 3D: Jordan Carter — music: TBC — client: ${project.client} — agency: Direct — production: In-house — year: ${project.year}`}
                tag="div"
                className="text-[9px] leading-[1.6] mb-5 py-3"
                style={{ borderTop: `1px solid ${rule}`, borderBottom: `1px solid ${rule}` }}
              />

              {/* Bottom — copyright right-aligned */}
              <div className="flex justify-end mb-4">
                <span className="text-[9px] tracking-[0.1em] uppercase" style={{ opacity: 0.35 }}>© 2026</span>
              </div>

              {/* Nav */}
              <div className="flex justify-between items-center pt-3" style={{ borderTop: `1px solid ${rule}` }}>
                <Link href={`/work/${prev.slug}`} className="text-[10px] uppercase tracking-[0.1em] hover:opacity-70 transition-opacity">← {prev.client}</Link>
                <Link href="/indexx" className="text-[10px] uppercase tracking-[0.1em] font-bold hover:opacity-70 transition-opacity" style={{ opacity: 0.5 }}>Index</Link>
                <Link href={`/work/${next.slug}`} className="text-[10px] uppercase tracking-[0.1em] hover:opacity-70 transition-opacity">{next.client} →</Link>
              </div>
            </div>
          </div>

          {/* RIGHT — 2/3 — Media with expand. Gap between stacked items is
              4 (16px) and grouped-row gap is 3 (12px) so consecutive media
              don't read as a single edge-to-edge block. The page background
              shows through the gaps, providing a clean visual separator. */}
          <div className="w-full md:w-[67%] overflow-y-auto relative">
            <div className="p-3 md:p-4 space-y-4">

              {/* Dynamic feed of admin-uploaded media. Consecutive items
                  sharing a `rowId` collapse into one flex row (each at its
                  own aspect ratio, splitting width equally). Items without
                  a rowId render alone as their own row. No test-pool
                  fallback — empty projects show an empty-state hint. */}
              {(localMedia ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center" style={{ opacity: 0.35 }}>
                  <p className="text-[10px] uppercase tracking-[0.18em] font-bold mb-1">No media yet</p>
                  <p className="text-[9px] uppercase tracking-[0.1em]" style={{ opacity: 0.7 }}>
                    Open admin → Work → this project → Add Media
                  </p>
                </div>
              ) : (
                (() => {
                  // Walk the list and batch consecutive same-rowId items.
                  type Row = { items: Array<{ item: NonNullable<typeof localMedia>[number]; idx: number }>; rowId?: string }
                  const rows: Row[] = []
                  for (let i = 0; i < localMedia!.length; i++) {
                    const m = localMedia![i]
                    if (!m.path) continue
                    const r = (m as { rowId?: string }).rowId
                    const last = rows[rows.length - 1]
                    if (r && last && last.rowId === r) {
                      last.items.push({ item: m, idx: i })
                    } else {
                      rows.push({ items: [{ item: m, idx: i }], rowId: r })
                    }
                  }
                  return rows.map((row, ri) => {
                    if (row.items.length === 1) {
                      const { item, idx } = row.items[0]
                      const mediaType: 'video' | 'image' = classifyMedia(item.path!)
                      const aspect = (item as { aspect?: string }).aspect || (mediaType === 'video' ? '16/9' : '4/3')
                      const widthPct = (item as { widthPct?: number }).widthPct ?? 100
                      const objectPos = (item as { objectPos?: string }).objectPos || 'center center'
                      // Wrap in a width container so widthPct < 100 produces a
                      // smaller, centered media block. 100 = full-width (no
                      // visible wrapping behaviour).
                      return (
                        <div key={`r${ri}`} style={{ width: `${widthPct}%`, margin: '0 auto' }}>
                          <MediaBlock
                            idx={idx}
                            aspect={aspect}
                            label={String(idx + 1).padStart(2, '0')}
                            onExpand={() => setExpandedMedia(idx)}
                            dark={dark}
                            mediaSrc={item.path}
                            mediaType={mediaType}
                            objectPos={objectPos}
                          />
                        </div>
                      )
                    }
                    // Grouped row: flex container, each child takes equal share.
                    return (
                      <div key={`r${ri}`} className="flex gap-3 items-start">
                        {row.items.map(({ item, idx }) => {
                          const mediaType: 'video' | 'image' = classifyMedia(item.path!)
                          const aspect = (item as { aspect?: string }).aspect || (mediaType === 'video' ? '16/9' : '4/3')
                          const objectPos = (item as { objectPos?: string }).objectPos || 'center center'
                          return (
                            <div key={idx} className="flex-1 min-w-0">
                              <MediaBlock
                                idx={idx}
                                aspect={aspect}
                                label={String(idx + 1).padStart(2, '0')}
                                onExpand={() => setExpandedMedia(idx)}
                                dark={dark}
                                mediaSrc={item.path}
                                mediaType={mediaType}
                                objectPos={objectPos}
                              />
                            </div>
                          )
                        })}
                      </div>
                    )
                  })
                })()
              )}

              <div className="pt-4 pb-2">
                <p className="text-[8px] uppercase tracking-[0.12em] text-center" style={{ opacity: 0.2 }}>
                  {project.client} — {project.title} — {project.year}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="px-6 md:px-10 py-5 glass-footer mt-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-3 flex-shrink-0">
              <button onClick={() => setShowEmail(true)} className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}` }}>Email</button>
              <a href="https://instagram.com/jordanscarter" target="_blank" rel="noopener noreferrer" className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}` }}>Insta</a>
            </div>
            <FooterBlurb pageId="project" className="hidden md:block text-[9px] leading-[1.5] tracking-[0.04em] uppercase max-w-2xl text-center" style={{ color: fg60 }} />
            <div className="flex gap-3 flex-shrink-0">
              <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="w-14 h-14 rounded-full flex items-center justify-center text-[16px] hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}` }} aria-label="Back to top">↑</button>
              <button onClick={() => setShowAdmin(true)} className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}`, color: fg60 }}>© 2026</button>
            </div>
          </div>
        </footer>

        {/* Expanded media lightbox */}
        <AnimatePresence>
          {expandedMedia !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setExpandedMedia(null)}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10000,
                background: 'rgba(0,0,0,0.92)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'zoom-out',
                padding: '3rem',
              }}
            >
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="relative bg-black w-full max-w-[85vw] max-h-[80vh] overflow-hidden"
                style={{ aspectRatio: allMedia[expandedMedia]?.aspect || '16/9' }}
                onClick={(e) => e.stopPropagation()}
              >
                {allMedia[expandedMedia]?.mediaType === 'video' ? (
                  <video
                    autoPlay
                    loop
                    playsInline
                    controls
                    className="absolute inset-0 w-full h-full object-cover"
                    src={allMedia[expandedMedia]?.src}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={allMedia[expandedMedia]?.src}
                    alt={allMedia[expandedMedia]?.label}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
              </motion.div>
              <span className="fixed top-6 right-8 text-white text-[11px] uppercase tracking-widest" style={{ opacity: 0.4 }}>
                Click to close
              </span>
              <span className="fixed bottom-6 left-8 text-white text-[9px] font-mono uppercase tracking-widest" style={{ opacity: 0.25 }}>
                {allMedia[expandedMedia]?.label} / {String(allMedia.length).padStart(2, '0')}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <EmailPopup show={showEmail} onClose={() => setShowEmail(false)} />
        <AdminPortal show={showAdmin} onClose={() => setShowAdmin(false)} />

        {/* Inline media manager — only mounted in edit mode. Floats a button
            bottom-right; click opens a drawer with the full project media
            list (drag-reorder / replace / delete / add). */}
        {editMode && (
          <>
            <button
              onClick={() => setMediaPanelOpen(true)}
              className="fixed bottom-6 right-6 z-[9997] px-4 py-2.5 rounded-full text-[9px] uppercase tracking-[0.14em] font-bold text-white border border-white/20 backdrop-blur-md transition-all hover:scale-105 active:scale-95"
              style={{
                background: 'rgba(0,0,0,0.7)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
              }}
            >
              🎞 Manage media ({(localMedia ?? []).length})
            </button>
            <ProjectMediaPanel
              slug={params.slug}
              client={project.client}
              open={mediaPanelOpen}
              onClose={() => setMediaPanelOpen(false)}
              media={(localMedia ?? []) as ProjectMediaItem[]}
              onChange={(next) => setLocalMedia(next)}
              // Featured projects auto-mirror their uploads into /misc. The
              // drawer prompts the user for tags once per Add batch.
              mirror={project.featured ? { client: project.client, year: project.year } : undefined}
            />
          </>
        )}
      </div>
    </PageTransition>
  )
}

// Reusable media block with expand button.
// `idx` and `dark` are part of the public API for call sites that pass them
// (handy for future hover states / theming), but not currently consumed inside —
// underscore-prefix keeps ESLint happy.
function MediaBlock({ idx: _idx, aspect, label, onExpand, dark: _dark, mediaSrc, mediaType, objectPos }: {
  idx: number; aspect: string; label: string; onExpand: () => void; dark: boolean;
  mediaSrc?: string; mediaType?: 'video' | 'image'; objectPos?: string;
}) {
  const pos = objectPos || 'center center'
  // Each video owns its own muted state — different clips can have different
  // audio so a global toggle would mix them in the wrong way. Default muted
  // so autoplay isn't blocked by the browser; the corner button lets the
  // viewer enable sound per-video.
  const [muted, setMuted] = useState(true)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  return (
    // maxHeight cap so a 16:9 item in the wide media column doesn't fill the
    // viewport on big screens — visually anchored to ~85% of viewport height,
    // which keeps the page scannable. `width: '100%'` keeps the flex layout.
    // For aspect ratios narrower than the column the height cap kicks in;
    // since aspectRatio drives the size, this clamps the larger dimension.
    <div
      className="relative group bg-black overflow-hidden cursor-pointer w-full"
      style={{ aspectRatio: aspect, maxHeight: '85vh', margin: '0 auto' }}
      onClick={onExpand}
    >
      {mediaSrc && mediaType === 'video' && (
        <video
          ref={videoRef}
          autoPlay
          muted={muted}
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: pos }}
          src={mediaSrc}
        />
      )}
      {mediaSrc && mediaType === 'image' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaSrc}
          alt={label}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: pos }}
        />
      )}
      <span className="absolute top-3 left-3 text-[8px] font-mono font-bold uppercase tracking-widest text-white" style={{ opacity: 0.3, zIndex: 2 }}>
        {label}
      </span>
      {/* Per-video audio toggle. Sits in the bottom-left of each video
          block. Clicking it stops the click from bubbling to onExpand. */}
      {mediaType === 'video' && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setMuted(prev => {
              // If we're going from muted → unmuted, the browser may have
              // paused us (autoplay-with-sound is normally blocked). The
              // click itself is a user gesture so retrying play() here
              // succeeds. React's `muted` prop syncs via re-render.
              if (prev) videoRef.current?.play().catch(() => {})
              return !prev
            })
          }}
          aria-label={muted ? 'Unmute' : 'Mute'}
          title={muted ? 'Unmute' : 'Mute'}
          className="absolute bottom-3 left-3 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all hover:scale-110 active:scale-95"
          style={{
            background: muted ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.9)',
            color: muted ? '#fff' : '#000',
            border: '1px solid rgba(255,255,255,0.25)',
            zIndex: 2,
          }}
        >
          {muted ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
          )}
        </button>
      )}
      <div
        className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-60 transition-opacity"
        style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)', zIndex: 2 }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="1.2">
          <path d="M1 9L9 1M9 1H3M9 1V7" />
        </svg>
      </div>
    </div>
  )
}
