'use client'

import { useState, useEffect, useCallback } from 'react'
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
import ProjectLinks, { type ProjectLink } from '@/components/ProjectLinks'
import PageLoader from '@/components/PageLoader'
import { useEditMode } from '@/contexts/EditModeContext'

// Client logo mapping
const clientLogos: Record<string, { src: string; width: number; height: number }> = {
  'Nike': { src: '/assets/Logos/Logo_NIKE.svg', width: 220, height: 80 },
  'Adidas Originals': { src: '/assets/Logos/Logo_ADIDAS_ORIGINALS.webp', width: 200, height: 80 },
  'Adidas Rugby': { src: '/assets/Logos/Logo_ADIDAS.webp', width: 200, height: 80 },
}

// Keep this list in sync with VIDEO_EXT in MediaLibraryPicker.tsx — any
// extension recognised as a video by the picker must also classify as a
// video here, otherwise picking a .m4v from the library renders it as
// an <img> and shows the browser's broken-image icon.
function classifyMedia(path: string): 'video' | 'image' {
  return /\.(mp4|webm|mov|m4v)$/i.test(path) ? 'video' : 'image'
}

export default function ProjectPage({ params }: { params: { slug: string } }) {
  const codeProject = projects.find((p) => p.slug === params.slug)

  const { dark, fg, fg60, borderThick } = useDarkMode()
  const [showEmail, setShowEmail] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [expandedMedia, setExpandedMedia] = useState<number | null>(null)
  const [viewCount, setViewCount] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<{
    phase: 'image' | 'video' | 'zip'
    name: string
    idx: number
    total: number
    ratio?: number
  } | null>(null)
  const leftPanelRef = useRef<HTMLDivElement>(null)
  const [adminProject, setAdminProject] = useState<Record<string, unknown> | null>(null)
  const [adminLoading, setAdminLoading] = useState(!codeProject)
  // Whether the loader has finished its run. Kept separate from
  // adminLoading because the two answer different questions: one is "is
  // the data here", the other is "has the mark finished". Swapping the
  // page in on the first alone is what cut the animation off.
  const [loaderDone, setLoaderDone] = useState(false)
  // Stable identity: PageLoader schedules its hand-off in an effect that
  // depends on this, and a fresh arrow every render would tear that
  // timer down and rebuild it on every render of a heavy page.
  const handleLoaderDone = useCallback(() => setLoaderDone(true), [])
  const { editMode, addChange } = useEditMode()
  const [logoScale, setLogoScale] = useState(100)
  // Admin-supplied media list (preferred). Held in local state so the
  // inline media manager can mutate it without a full refetch. Hooks must
  // sit above any early returns below, hence declared here.
  const [localMedia, setLocalMedia] = useState<Array<{ name?: string; path?: string }> | null>(null)
  const [mediaPanelOpen, setMediaPanelOpen] = useState(false)
  // Press links, same deal — local so the inline editor reflects a change
  // immediately instead of waiting on a refetch.
  const [localLinks, setLocalLinks] = useState<ProjectLink[]>([])

  // Scroll-driven audio: only one inline video plays audio at a time —
  // whichever is most centered in the right-column scroll container.
  // `pageAudioMuted` is a soft global mute the user can toggle from the
  // active video's audio button.
  const [activeAudioIdx, setActiveAudioIdx] = useState<number | null>(null)
  const [pageAudioMuted, setPageAudioMuted] = useState(false)
  const rightColRef = useRef<HTMLDivElement | null>(null)
  // Map of media idx → its root element, populated by the MediaBlock root
  // ref callback. Used to compute which item is closest to the viewport
  // (here: scroll-container) center on every scroll.
  const mediaBlockRefs = useRef<Map<number, HTMLElement>>(new Map())

  // Always fetch admin data — for code projects it may have overrides (logo, brief, etc.)
  // cache: 'no-store' so admin edits show up immediately on the public page
  // (otherwise the browser/Vercel edge cache can serve a stale title/brief).
  const fetchAdminProject = useCallback(() => {
    return fetch('/api/projects', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        const found = (data.projects || []).find((p: Record<string, unknown>) => p.slug === params.slug)
        setAdminProject(found || null)
        if (found?.logoSize) setLogoScale(Number(found.logoSize))
        setAdminLoading(false)
      })
      .catch(() => setAdminLoading(false))
  }, [params.slug])

  useEffect(() => {
    void fetchAdminProject()
  }, [fetchAdminProject])

  // After the EditToolbar finishes saving, re-fetch so EditableText's
  // `defaultValue` reflects the freshly-persisted brief/title/etc. Without
  // this the displayed text snapped back to the old value as soon as
  // pendingChanges cleared, which made saves look like they didn't take.
  useEffect(() => {
    const onSaved = () => { void fetchAdminProject() }
    window.addEventListener('admin-saved', onSaved)
    return () => window.removeEventListener('admin-saved', onSaved)
  }, [fetchAdminProject])

  // Track page views per project in localStorage
  useEffect(() => {
    const key = `jc-views-${params.slug}`
    const current = parseInt(localStorage.getItem(key) || '0', 10) + 1
    localStorage.setItem(key, String(current))
    setViewCount(current)
  }, [params.slug])

  // Escape closes the expanded-media lightbox, same as clicking off does.
  useEffect(() => {
    if (expandedMedia === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedMedia(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expandedMedia])

  // Scroll-driven audio handoff: whichever MediaBlock's center is closest
  // to the scroll container's center becomes activeAudioIdx — that's the
  // only video that gets to play audio. Listener is rAF-throttled so it
  // doesn't fire on every scroll tick; we also re-run on resize.
  useEffect(() => {
    if (!localMedia || localMedia.length === 0) return
    const container = rightColRef.current
    if (!container) return
    let rafId: number | null = null
    const update = () => {
      rafId = null
      const cRect = container.getBoundingClientRect()
      const centerY = (cRect.top + cRect.bottom) / 2
      let bestIdx: number | null = null
      let bestDistance = Infinity
      mediaBlockRefs.current.forEach((el, idx) => {
        const r = el.getBoundingClientRect()
        // Skip items that are entirely outside the scroll container's
        // visible area — they shouldn't claim the audio focus.
        if (r.bottom < cRect.top || r.top > cRect.bottom) return
        const itemCenter = (r.top + r.bottom) / 2
        const distance = Math.abs(itemCenter - centerY)
        if (distance < bestDistance) {
          bestDistance = distance
          bestIdx = idx
        }
      })
      setActiveAudioIdx(bestIdx)
    }
    const onScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(update)
    }
    update()
    container.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      container.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [localMedia])

  // Mirror the latest admin media into local state — used by the inline
  // media manager + by getProjectMedia() when rendering the page.
  useEffect(() => {
    const m = (adminProject?.media as Array<{ name?: string; path?: string }> | undefined) || null
    setLocalMedia(m)
    const raw = adminProject?.links
    setLocalLinks(
      Array.isArray(raw)
        ? (raw as unknown[])
            .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
            .map(l => ({ label: String(l.label ?? ''), url: String(l.url ?? '') }))
        : [],
    )
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

  // The lightbox video lives in this component rather than inside
  // MediaBlock, so it needs its own ref and bounce driver. Both sit ABOVE
  // the early returns below — a hook after a conditional return changes
  // call order between renders. That's also why this reads `localMedia`
  // straight rather than `allMedia`, which isn't built until later; the
  // filter matches how allMedia is indexed.
  const lightboxVideoRef = useRef<HTMLVideoElement | null>(null)
  const lightboxItem =
    expandedMedia !== null ? (localMedia ?? []).filter(m => !!m.path)[expandedMedia] : undefined
  const lightboxBounces =
    !!lightboxItem?.path &&
    classifyMedia(lightboxItem.path) === 'video' &&
    !!(lightboxItem as { bounce?: boolean }).bounce
  const { canvasRef: lightboxCanvasRef, reversing: lightboxReversing } =
    useBouncePlayback(lightboxVideoRef, lightboxBounces)

  // Cover the page while admin data is in flight.
  //
  // This branch used to end the moment adminLoading flipped, which
  // replaced the whole tree — loader included — so on a fast response
  // the mark was destroyed part way through and the animation just
  // stopped. It now waits for the loader to say it has finished, which
  // is the same rule every other loader on the site keeps: play through
  // once, hold the last frame, then hand over.
  if (adminLoading || !loaderDone) {
    return (
      <div style={{ background: dark ? '#0a0a0a' : '#f5f5f0', minHeight: '100vh' }}>
        <PageLoader
          show={adminLoading}
          mode="data"
          onComplete={handleLoaderDone}
        />
      </div>
    )
  }

  if (!project) return notFound()

  const handleDownload = async () => {
    setDownloading(true)
    setDownloadProgress(null)
    try {
      const [{ default: JSZip }, { watermarkImage, watermarkVideo, isVideoFile }] = await Promise.all([
        import('jszip'),
        import('@/lib/watermarkAssets'),
      ])
      const zip = new JSZip()
      const folderName = `${project.client.replace(/[^a-zA-Z0-9]/g, '_')}_${project.year}_XOXO`
      const folder = zip.folder(folderName)!

      // Collect every uploaded media item that has a real src.
      const items = (localMedia ?? [])
        .map((m, i) => ({ name: m.name || `${String(i + 1).padStart(2, '0')}`, path: m.path }))
        .filter((m): m is { name: string; path: string } => !!m.path)

      const total = items.length || 1
      let done = 0

      for (const item of items) {
        const fname = item.name || item.path.split('/').pop() || 'file'
        setDownloadProgress({ phase: isVideoFile(fname) ? 'video' : 'image', name: fname, idx: done, total })
        try {
          const { blob, outName } = isVideoFile(fname)
            ? await watermarkVideo(item.path, fname, (r) => setDownloadProgress({ phase: 'video', name: fname, idx: done, total, ratio: r }))
            : await watermarkImage(item.path, fname)
          folder.file(`${String(done + 1).padStart(2, '0')}_${outName}`, blob)
        } catch (err) {
          console.error('Watermark failed for', fname, err)
          // Fall back to the unwatermarked original so the user still gets
          // SOMETHING for that slot — better than silently skipping.
          try {
            const res = await fetch(item.path)
            const blob = await res.blob()
            folder.file(`${String(done + 1).padStart(2, '0')}_unwatermarked_${fname}`, blob)
          } catch {}
        }
        done++
      }

      // LICENSE.txt — basic copyright notice.
      const license = `© ${new Date().getFullYear()} JORDAN CARTER / XOXO — ALL RIGHTS RESERVED

Project: ${project.client} — ${project.title}
Year: ${project.year}
${project.role ? `Role: ${project.role}\n` : ''}
This media package is watermarked and distributed for review only.
Unauthorized redistribution, modification or commercial use is prohibited.

Contact: carterjordan75@gmail.com`
      folder.file('LICENSE.txt', license)

      setDownloadProgress({ phase: 'zip', name: '', idx: total, total })
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `${folderName}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed:', err)
    } finally {
      setDownloading(false)
      setDownloadProgress(null)
    }
  }

  const pageBg = dark ? '#0a0a0a' : '#f5f5f0'
  const rule = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'

  // The page renders ONLY admin-uploaded media (no test-pool fallback). When
  // the admin list is empty the right column shows an empty-state hint
  // pointing the user to the admin panel.
  const allMedia: {
    aspect: string; label: string; src: string; mediaType: 'video' | 'image'; bounce?: boolean
  }[] =
    (localMedia ?? [])
      .filter(m => !!m.path)
      .map((m, i) => {
        const mediaType: 'video' | 'image' = classifyMedia(m.path!)
        const aspect = (m as { aspect?: string }).aspect || (mediaType === 'video' ? '16/9' : '4/3')
        return {
          aspect,
          label: String(i + 1).padStart(2, '0'),
          src: m.path!,
          mediaType,
          bounce: (m as { bounce?: boolean }).bounce,
        }
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

              {/* Top row — year, views (edit-mode only), download, featured */}
              <div className="flex items-center gap-3 mb-1">
                <span className="text-[10px] tracking-[0.1em] uppercase">{project.year}</span>
                {editMode && (
                  <>
                    <span className="text-[10px]" style={{ opacity: 0.15 }}>|</span>
                    <span className="text-[9px] font-mono" style={{ opacity: 0.4 }}>[views: {viewCount}]</span>
                  </>
                )}

                {/* Download button — pill style. Watermarks every media
                    item (XOXO logo, tiled on images / bottom-right on
                    videos) before bundling into a ZIP. Videos are
                    re-encoded via ffmpeg.wasm so the progress label
                    surfaces per-file ratio while encoding. */}
                <button
                  className="ml-auto mr-3 flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] tracking-[0.1em] uppercase font-bold transition-all hover:scale-105 active:scale-95"
                  style={{
                    border: `1.5px solid ${dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)'}`,
                    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    opacity: downloading ? 0.85 : 1,
                    pointerEvents: downloading ? 'none' : 'auto',
                  }}
                  onClick={handleDownload}
                  disabled={downloading}
                  title="Download all assets with an XOXO watermark"
                >
                  <span style={{ fontSize: '11px' }}>{downloading ? '⏳' : '↓'}</span>{' '}
                  {!downloading && 'Download'}
                  {downloading && downloadProgress && downloadProgress.phase === 'zip' && 'Zipping…'}
                  {downloading && downloadProgress && downloadProgress.phase === 'video' && (
                    `Video ${downloadProgress.idx + 1}/${downloadProgress.total}${
                      typeof downloadProgress.ratio === 'number' ? ` ${Math.round(downloadProgress.ratio * 100)}%` : ''
                    }`
                  )}
                  {downloading && downloadProgress && downloadProgress.phase === 'image' && (
                    `Image ${downloadProgress.idx + 1}/${downloadProgress.total}`
                  )}
                  {downloading && !downloadProgress && 'Starting…'}
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

              {/* Title — scattered words, mixed weights/sizes. Hidden on
                  Gen projects because client and title are the same value
                  (e.g. SOFTBOYS / SOFTBOYS) so this would just duplicate
                  the headline. */}
              {(project as { category?: string }).category !== 'gen' && (
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
              )}

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

              {/* Press — articles about the work. Sits with the other
                  metadata rather than under the media, and renders nothing
                  at all when a project has no links and you're not editing. */}
              <ProjectLinks
                slug={project.slug}
                links={localLinks}
                editMode={editMode}
                onChange={setLocalLinks}
                rule={rule}
              />

              {/* Bottom — copyright right-aligned */}
              <div className="flex justify-end mb-4">
                <span className="text-[9px] tracking-[0.1em] uppercase" style={{ opacity: 0.35 }}>© 2026</span>
              </div>

              {/* Nav — the index, and only the index.
                  There used to be previous/next arrows flanking this,
                  paging one project to the next. They are gone
                  deliberately: which projects are on show is a decision
                  made in one place, and a reader who can walk sideways
                  out of a project is not reading the set that decision
                  produced. Going back to the index to choose again is
                  the whole navigation. */}
              <div className="flex justify-center items-center pt-3" style={{ borderTop: `1px solid ${rule}` }}>
                <Link href="/indexx" className="text-[10px] uppercase tracking-[0.1em] font-bold hover:opacity-70 transition-opacity" style={{ opacity: 0.5 }}>Index</Link>
              </div>
            </div>
          </div>

          {/* RIGHT — 2/3 — Media with expand. Gap between stacked items is
              4 (16px) and grouped-row gap is 3 (12px) so consecutive media
              don't read as a single edge-to-edge block. The page background
              shows through the gaps, providing a clean visual separator. */}
          <div ref={rightColRef} className="w-full md:w-[67%] overflow-y-auto relative">
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
                      // visible wrapping behaviour). Use marginLeft/Right
                      // ONLY — the shorthand `margin: '0 auto'` was zeroing
                      // out the top/bottom margins, which clobbered the
                      // parent's `space-y-4` gap between items.
                      return (
                        <div
                          key={`r${ri}`}
                          style={{ width: `${widthPct}%`, marginLeft: 'auto', marginRight: 'auto' }}
                        >
                          <MediaBlock
                            idx={idx}
                            aspect={aspect}
                            label={String(idx + 1).padStart(2, '0')}
                            onExpand={() => setExpandedMedia(idx)}
                            dark={dark}
                            mediaSrc={item.path}
                            mediaType={mediaType}
                            objectPos={objectPos}
                            bounce={(item as { bounce?: boolean }).bounce}
                            isLightboxOpen={expandedMedia !== null}
                            audioActive={idx === activeAudioIdx}
                            pageAudioMuted={pageAudioMuted}
                            onAudioToggle={() => setPageAudioMuted(p => !p)}
                            rootRef={(el) => {
                              if (el) mediaBlockRefs.current.set(idx, el)
                              else mediaBlockRefs.current.delete(idx)
                            }}
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
                                bounce={(item as { bounce?: boolean }).bounce}
                                isLightboxOpen={expandedMedia !== null}
                                audioActive={idx === activeAudioIdx}
                                pageAudioMuted={pageAudioMuted}
                                onAudioToggle={() => setPageAudioMuted(p => !p)}
                                rootRef={(el) => {
                                  if (el) mediaBlockRefs.current.set(idx, el)
                                  else mediaBlockRefs.current.delete(idx)
                                }}
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
              {/*
                The box takes its shape from the media, not the other way
                round. It used to force `aspect` onto a full-width frame and
                object-cover the media into it — but `aspect` is only set on
                items that were measured at upload, so nearly everything fell
                back to 16/9 and anything portrait or square got cropped to a
                letterbox. Sizing the media itself against the viewport caps
                needs no stored ratio and no measuring: intrinsic dimensions
                already describe the file exactly, whatever it is.
              */}
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="relative bg-black overflow-hidden leading-none"
                onClick={(e) => e.stopPropagation()}
              >
                {allMedia[expandedMedia]?.mediaType === 'video' ? (
                  <>
                    <video
                      ref={lightboxVideoRef}
                      autoPlay
                      // Bounce needs `ended` to fire, and `loop` swallows it.
                      loop={!lightboxBounces}
                      playsInline
                      controls
                      controlsList="nodownload"
                      disablePictureInPicture
                      className="block max-w-[85vw] max-h-[80vh] w-auto h-auto"
                      style={{ opacity: lightboxReversing ? 0 : 1 }}
                      src={allMedia[expandedMedia]?.src}
                    />
                    {/* Return leg. The wrapper hugs the video exactly, so
                        inset-0 lands on the same box the video occupies. */}
                    {lightboxBounces && (
                      <canvas
                        ref={lightboxCanvasRef}
                        aria-hidden="true"
                        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                        style={{ opacity: lightboxReversing ? 1 : 0 }}
                      />
                    )}
                  </>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={allMedia[expandedMedia]?.src}
                    alt={allMedia[expandedMedia]?.label}
                    className="block max-w-[85vw] max-h-[80vh] w-auto h-auto"
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
/**
 * Play a video forwards, then backwards, forever — instead of cutting back
 * to frame 0 on loop.
 *
 * No browser plays video backwards natively (`playbackRate = -1` is
 * unsupported in Chrome and Safari), and the obvious workaround — stepping
 * `currentTime` down each frame — is what made the first version of this
 * judder. Every assignment is a seek, and a seek means jumping to the
 * previous keyframe and decoding forward to the target. At 30 of those a
 * second the decoder never catches up, so frames get dropped and the
 * motion lurches. Tuning the step rate can't fix it; the seeking is the
 * problem.
 *
 * So don't seek. The forward pass already decodes every frame perfectly —
 * grab them as they go by, then blit them back in reverse off a canvas.
 * The return leg becomes drawImage calls with zero decoding, which is
 * smooth by construction and independent of how the file was encoded.
 *
 * The cost is memory, so there's a frame budget. A clip that doesn't
 * finish caching inside it falls back to the old seek-stepping — steppy,
 * but it still bounces rather than failing outright. Bounce is meant for
 * short loops; the budget is sized for those.
 *
 * Still inherent: the reverse leg is silent, because there's no audio to
 * play off a canvas.
 */
function useBouncePlayback(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Drives the crossfade-free swap between the <video> and the <canvas>.
  const [reversing, setReversing] = useState(false)

  useEffect(() => {
    const v = videoRef.current
    if (!enabled || !v) return

    /**
     * Cached frames are uncompressed, so the budget is real: a second of
     * 960x540 costs ~62 MB. Rather than a fixed cap with a quality cliff,
     * spend the budget across however long the clip is — degrading
     * resolution keeps the motion smooth, which is the whole point, where
     * degrading the frame rate would just reintroduce the judder.
     *
     * From a 1080p source that's roughly 1150px wide for a 1s loop, 830px
     * at 2s, 540px at 5s. Short loops stay effectively sharp; long ones go
     * soft on the way back. Past HARD_MAX_SECONDS nothing is cached and it
     * falls back to seek-stepping, which judders — so bounce is worth
     * ticking on short clips and not on long ones.
     *
     * Per clip, not per page: three bounced videos is three budgets.
     */
    const MEMORY_BUDGET_BYTES = 96 * 1024 * 1024
    const HARD_MAX_SECONDS = 12
    const ASSUMED_FPS = 30
    let maxFrames = 0
    let captureW = 0
    let captureH = 0

    // Worked out once, from metadata — duration and native size are both
    // needed and neither is known at mount.
    const planCapture = (): boolean => {
      const duration = v.duration
      const w = v.videoWidth
      const h = v.videoHeight
      if (!Number.isFinite(duration) || duration <= 0 || !w || !h) return false
      if (duration > HARD_MAX_SECONDS) return false
      maxFrames = Math.ceil(duration * ASSUMED_FPS) + 4
      const bytesEach = MEMORY_BUDGET_BYTES / maxFrames
      const maxPixels = bytesEach / 4
      const scale = Math.min(1, Math.sqrt(maxPixels / (w * h)))
      captureW = Math.max(2, Math.round(w * scale))
      captureH = Math.max(2, Math.round(h * scale))
      return true
    }

    type Frame = { bmp: ImageBitmap; t: number }
    let frames: Frame[] = []
    let capturing = true
    let cacheComplete = false
    let cancelled = false
    let raf = 0
    let vfcHandle = 0

    type VFC = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number
      cancelVideoFrameCallback?: (h: number) => void
    }
    const vfc = v as VFC
    const hasVFC = typeof vfc.requestVideoFrameCallback === 'function'

    const dropFrames = () => {
      for (const f of frames) f.bmp.close?.()
      frames = []
    }

    // ── capture, during ordinary forward playback ──────────────────────
    const scheduleCapture = () => {
      if (cancelled || !capturing) return
      if (hasVFC) vfcHandle = vfc.requestVideoFrameCallback!(() => void capture())
      else raf = requestAnimationFrame(() => void capture())
    }

    const capture = async () => {
      if (cancelled || !capturing) return
      // Nothing decodable yet, or we're on the return leg — check back.
      if (v.readyState < 2 || v.paused || v.ended) return void scheduleCapture()
      // First usable frame: size the cache now that metadata has landed.
      if (captureW === 0 && !planCapture()) {
        // Too long to cache, or metadata still missing. Seek-step instead.
        capturing = false
        return
      }
      const t = v.currentTime
      // requestVideoFrameCallback can fire twice for one frame; rAF
      // certainly will on a 60Hz screen showing 24fps footage.
      if (frames.length > 0 && t <= frames[frames.length - 1].t) {
        return void scheduleCapture()
      }
      if (frames.length >= maxFrames) {
        // Ran past the plan — variable frame rate, or above 30fps. The
        // cache now covers only the FRONT of the clip, and replaying that
        // when the video ends would jump straight to a mid-clip frame.
        // A partial cache is worse than none: drop it and seek instead.
        capturing = false
        dropFrames()
        return
      }
      try {
        const bmp = await createImageBitmap(v, {
          resizeWidth: captureW,
          resizeHeight: captureH,
          resizeQuality: 'medium',
        })
        if (cancelled) return void bmp.close?.()
        frames.push({ bmp, t })
      } catch {
        // createImageBitmap throws on a tainted frame (cross-origin video
        // without CORS). Blob serves access-control-allow-origin: *, so
        // this shouldn't fire — but if it does, fall back rather than die.
        capturing = false
        dropFrames()
        return
      }
      scheduleCapture()
    }

    // ── return leg A: replay cached frames (smooth) ────────────────────
    const playCached = () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx || frames.length < 2) return seekBackwards()

      canvas.width = frames[0].bmp.width
      canvas.height = frames[0].bmp.height
      const lastT = frames[frames.length - 1].t
      const firstT = frames[0].t
      let i = frames.length - 1
      const startedAt = performance.now()

      v.pause()
      setReversing(true)

      const draw = () => {
        if (cancelled) return
        // Walk video-time backwards in real time, then pick the nearest
        // captured frame. Timing comes off the wall clock rather than a
        // frame counter, so a dropped frame costs one frame, not sync.
        const target = lastT - (performance.now() - startedAt) / 1000
        while (i > 0 && frames[i].t > target) i--
        ctx.drawImage(frames[i].bmp, 0, 0)
        if (i <= 0 || target <= firstT) {
          setReversing(false)
          v.currentTime = 0
          v.play().catch(() => {})
          return
        }
        raf = requestAnimationFrame(draw)
      }
      draw()
    }

    // ── return leg B: seek-stepping (fallback, judders) ────────────────
    const MIN_STEP_MS = 1000 / 30
    // Ceiling on one step. rAF is suspended while the tab is hidden, so
    // the first frame back carries however long you were away — unclamped
    // that single step subtracts minutes and slams to frame 0, the exact
    // hard cut bounce exists to avoid.
    const MAX_STEP_S = 0.1
    let last = 0

    const step = (now: number) => {
      if (cancelled) return
      if (now - last < MIN_STEP_MS) {
        raf = requestAnimationFrame(step)
        return
      }
      const dt = Math.min((now - last) / 1000, MAX_STEP_S)
      last = now
      const next = v.currentTime - dt * (v.playbackRate || 1)
      if (next <= 0) {
        v.currentTime = 0
        v.play().catch(() => {})
        return
      }
      v.currentTime = next
      raf = requestAnimationFrame(step)
    }

    const seekBackwards = () => {
      v.pause()
      last = performance.now()
      raf = requestAnimationFrame(step)
    }

    // `ended` only fires because the element renders without `loop` when
    // bounce is on — with loop set the browser wraps silently and this
    // never runs.
    const onEnded = () => {
      // Reaching the end with capture still running means the whole clip
      // fitted in the budget. Freeze the cache and reuse it every cycle.
      if (capturing) {
        capturing = false
        cacheComplete = frames.length >= 2
      }
      if (cacheComplete) playCached()
      else seekBackwards()
    }

    v.addEventListener('ended', onEnded)
    scheduleCapture()

    return () => {
      cancelled = true
      v.removeEventListener('ended', onEnded)
      cancelAnimationFrame(raf)
      if (hasVFC && vfcHandle) vfc.cancelVideoFrameCallback?.(vfcHandle)
      dropFrames()
      setReversing(false)
    }
  }, [enabled, videoRef])

  return { canvasRef, reversing }
}

function MediaBlock({ idx: _idx, aspect, label, onExpand, dark: _dark, mediaSrc, mediaType, objectPos, bounce, isLightboxOpen, audioActive, pageAudioMuted, onAudioToggle, rootRef }: {
  idx: number; aspect: string; label: string; onExpand: () => void; dark: boolean;
  mediaSrc?: string; mediaType?: 'video' | 'image'; objectPos?: string;
  // Ping-pong this video instead of looping it. Per-item, set in the media
  // manager — see useBouncePlayback for why it isn't free.
  bounce?: boolean;
  // When the page-level lightbox is open the inline videos should mute so
  // their audio doesn't overlap with the expanded view's audio.
  isLightboxOpen?: boolean;
  // Audio is scroll-driven — only the most-centered video carries audio.
  // `audioActive` is true for that one MediaBlock at a time. `pageAudioMuted`
  // is a soft global mute the user can toggle from the active block's
  // audio button (lives in onAudioToggle).
  audioActive?: boolean;
  pageAudioMuted?: boolean;
  onAudioToggle?: () => void;
  // Callback so the parent can collect each block's root element into a
  // Map<idx, HTMLElement> for the scroll-position calculation.
  rootRef?: (el: HTMLElement | null) => void;
}) {
  const pos = objectPos || 'center center'
  const videoRef = useRef<HTMLVideoElement | null>(null)
  // Flips to true if the <img> or <video> fires onError — i.e. the blob
  // URL is dead (deleted, 404, network issue). We surface a clear
  // "Media missing" panel instead of the browser's tiny broken-image
  // icon so the issue is obvious in both view and edit mode.
  const [loadFailed, setLoadFailed] = useState(false)
  // Computed mute — videos play silently EXCEPT the centered one (and only
  // if pageAudioMuted is off and the lightbox isn't open).
  const shouldBeMuted = !audioActive || !!pageAudioMuted || !!isLightboxOpen
  // Whenever this video becomes the audio source, try to keep it playing.
  // Setting muted=false on a video can cause the browser to pause it under
  // strict autoplay-with-sound policies; the play() call below re-arms it.
  // If the browser still blocks, we set up a one-shot user-gesture listener
  // so the next click anywhere on the page resumes the audio.
  useEffect(() => {
    if (mediaType !== 'video') return
    const v = videoRef.current
    if (!v) return
    if (shouldBeMuted) return
    v.play().catch(() => {
      const retry = () => {
        v.play().catch(() => {})
        document.removeEventListener('click', retry)
        document.removeEventListener('keydown', retry)
      }
      document.addEventListener('click', retry, { once: true })
      document.addEventListener('keydown', retry, { once: true })
    })
  }, [shouldBeMuted, mediaType])
  const { canvasRef: bounceCanvasRef, reversing } = useBouncePlayback(
    videoRef,
    mediaType === 'video' && !!bounce && !loadFailed,
  )
  return (
    // maxHeight cap so a 16:9 item in the wide media column doesn't fill the
    // viewport on big screens — visually anchored to ~85% of viewport height,
    // which keeps the page scannable. `width: '100%'` keeps the flex layout.
    // For aspect ratios narrower than the column the height cap kicks in;
    // since aspectRatio drives the size, this clamps the larger dimension.
    <div
      ref={rootRef}
      className="relative group bg-black overflow-hidden w-full"
      style={{
        aspectRatio: aspect,
        maxHeight: '85vh',
        // Horizontal centering only — never set top/bottom margin here,
        // it'd clobber the parent's space-y gap between items.
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      {mediaSrc && mediaType === 'video' && !loadFailed && (
        <video
          ref={videoRef}
          autoPlay
          // Only the currently-active (centered) video carries audio. The
          // page-level pageAudioMuted toggle and the lightbox-open guard
          // additionally force a mute regardless of audioActive state.
          muted={shouldBeMuted}
          // Bounce needs `ended` to fire, and `loop` swallows it.
          loop={!bounce}
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: pos, opacity: reversing ? 0 : 1 }}
          src={mediaSrc}
          onError={() => setLoadFailed(true)}
        />
      )}
      {/* The return leg draws here instead of seeking the video. Same box,
          same object-fit, so the swap is invisible — canvas is a replaced
          element, so object-cover/object-position behave as they do on the
          <video> it stands in for. */}
      {mediaSrc && mediaType === 'video' && !loadFailed && bounce && (
        <canvas
          ref={bounceCanvasRef}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ objectPosition: pos, opacity: reversing ? 1 : 0 }}
        />
      )}
      {mediaSrc && mediaType === 'image' && !loadFailed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaSrc}
          alt={label}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: pos }}
          onError={() => setLoadFailed(true)}
        />
      )}
      {loadFailed && (
        // Replaces the browser's tiny broken-image icon with a panel that
        // actually tells you what went wrong. The truncated URL is shown
        // so a quick look in the admin Storage panel can verify whether
        // the blob still exists.
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
          style={{ background: 'rgba(20,20,20,0.95)', color: 'rgba(255,255,255,0.75)' }}
        >
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold mb-1.5" style={{ opacity: 0.9 }}>Media missing</span>
          <span className="text-[9px] uppercase tracking-[0.08em]" style={{ opacity: 0.4 }}>
            {mediaType === 'video' ? 'video' : 'image'} failed to load
          </span>
          {mediaSrc && (
            <span className="text-[8px] font-mono mt-3 max-w-[80%] truncate" style={{ opacity: 0.35 }} title={mediaSrc}>
              {mediaSrc.replace(/^https?:\/\//, '').slice(0, 60)}{mediaSrc.length > 67 ? '…' : ''}
            </span>
          )}
        </div>
      )}
      <span className="absolute top-3 left-3 text-[8px] font-mono font-bold uppercase tracking-widest text-white" style={{ opacity: 0.3, zIndex: 2 }}>
        {label}
      </span>
      {/* Audio toggle — only on the currently-active (centered) video and
          only for video media. Acts as a page-level mute so the user can
          silence playback no matter which video is centered. As they
          scroll, the button moves with the audio focus to whichever video
          is in the middle of the frame. */}
      {mediaType === 'video' && audioActive && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            // Resuming after a mute → unmute requires a user gesture in
            // some browsers, which this click satisfies. The parent's
            // pageAudioMuted state flips here; the audio effect picks
            // it up on next render.
            if (pageAudioMuted) videoRef.current?.play().catch(() => {})
            onAudioToggle?.()
          }}
          aria-label={pageAudioMuted ? 'Unmute page audio' : 'Mute page audio'}
          title={pageAudioMuted ? 'Unmute' : 'Mute'}
          className="absolute bottom-3 left-3 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all hover:scale-110 active:scale-95"
          style={{
            background: pageAudioMuted ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.9)',
            color: pageAudioMuted ? '#fff' : '#000',
            border: '1px solid rgba(255,255,255,0.25)',
            zIndex: 2,
          }}
        >
          {pageAudioMuted ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
          ) : (
            // Three animated bars — matches the home page ambient-audio
            // toggle so the visual language is consistent across the site.
            <span className="flex gap-[2px] items-center" style={{ height: '13px' }}>
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="w-[2px] rounded-full"
                  style={{
                    background: 'currentColor',
                    height: '4px',
                    animationName: 'navAudioBar',
                    animationDuration: '0.7s',
                    animationTimingFunction: 'ease-in-out',
                    animationDelay: `${i * 0.12}s`,
                    animationIterationCount: 'infinite',
                    animationDirection: 'alternate',
                  }}
                />
              ))}
            </span>
          )}
        </button>
      )}
      {/* Full-screen toggle. Clicking the media body no longer expands
          (was too easy to trigger by accident, and the lightbox audio
          collided with the inline video audio). This is the only path
          to the lightbox now. */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onExpand()
        }}
        aria-label="View fullscreen"
        title="View fullscreen"
        className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all hover:scale-110 active:scale-95"
        style={{
          background: 'rgba(0,0,0,0.55)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.25)',
          zIndex: 2,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 3 21 3 21 9"/>
          <polyline points="9 21 3 21 3 15"/>
          <line x1="21" y1="3" x2="14" y2="10"/>
          <line x1="3" y1="21" x2="10" y2="14"/>
        </svg>
      </button>
    </div>
  )
}
