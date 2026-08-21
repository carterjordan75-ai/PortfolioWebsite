'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import XoxoBrandLoader from './XoxoBrandLoader'
import {
  applyLogoScales, readLogoScales, DEFAULT_LOGO_SCALES,
  LOGO_SCALE_PAGE, type LogoScales,
} from '@/lib/logoScale'
import { clearLoaderPick } from '@/lib/loaderPool'
import { clearSleepPool } from '@/lib/sleepPool'
import { upload } from '@vercel/blob/client'
import { useEditMode } from '@/contexts/EditModeContext'
import { downloadAssetsZip } from '@/lib/downloadZip'
import { prepareForUpload, isMp4 } from '@/lib/convertVideo'
import { deleteBlobUrls } from '@/lib/blobClient'
import { mirrorToMisc } from '@/lib/miscMirror'
import MediaLibraryPicker from './MediaLibraryPicker'

const ADMIN_PASSWORD = '3432'

type Section = 'dashboard' | 'work' | 'archive' | 'employment' | 'experiments' | 'look' | 'info' | 'logo' | 'loaders' | 'storage'

/**
 * Direct-to-Blob file upload. Used by every admin panel that accepts file
 * uploads. The browser PUTs the file straight to Vercel Blob via a
 * short-lived token from /api/upload-token, completely bypassing Vercel
 * Hobby's 4.5 MB function-payload cap (the previous FormData -> /api/upload
 * route hit that wall on anything but tiny logos).
 *
 * `section` becomes the blob's parent folder (e.g. 'home-videos', 'look',
 * 'info-videos'). `credits` is used to build a slug for the filename — pass
 * the project client name, the file's own name, or a short descriptor.
 *
 * Returns the public Blob URL plus the resulting pathname/filename. Callers
 * typically only need `url` — use that as the `src` in saved state.
 */
async function uploadFileToBlob(
  file: File,
  section: string,
  credits?: string,
  onStatus?: (msg: string) => void,
): Promise<{ url: string; pathname: string; fileName: string }> {
  // Pre-upload: MP4s are auto-converted to WebM in the browser via
  // ffmpeg.wasm. Non-MP4 files pass straight through unchanged.
  const ready = await prepareForUpload(file, onStatus)
  const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'file'
  const extMatch = ready.name.match(/\.[^.]+$/)
  const ext = extMatch ? extMatch[0].toLowerCase() : ''
  const slug = slugify(credits || ready.name.replace(/\.[^.]+$/, ''))
  const pathname = `media/${section}/${slug}-${Date.now().toString(36)}${ext}`
  const blob = await upload(pathname, ready, {
    access: 'public',
    handleUploadUrl: '/api/upload-token',
  })
  return {
    url: blob.url,
    pathname: blob.pathname,
    fileName: blob.pathname.split('/').pop() || pathname.split('/').pop() || ready.name,
  }
}

export default function AdminPortal({ show, onClose }: { show: boolean; onClose: () => void }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [activeSection, setActiveSection] = useState<Section>('dashboard')
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset auth every time portal is closed
  useEffect(() => {
    if (!show) {
      setAuthenticated(false)
      setPassword('')
    }
  }, [show])

  useEffect(() => {
    if (show && !authenticated && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [show, authenticated])

  // Opening the panel ASKS about orphan media — it doesn't remove any.
  // A bare POST is report-only; deleting needs `{ confirm: true }`, which
  // nothing sends automatically. This used to sweep on open, and twice
  // that quietly destroyed live media because the sweep had misread the
  // state it was checking against. Storage costs pennies; the renders it
  // ate don't come back.
  useEffect(() => {
    if (!show || !authenticated) return
    let cancelled = false
    fetch('/api/storage-cleanup', { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d || typeof d.deleted !== 'number') return
        if (d.deleted > 0) {
          const mb = (d.freedBytes / (1024 * 1024)).toFixed(1)
          // eslint-disable-next-line no-console
          console.info(
            `[storage-cleanup] ${d.deleted} orphan${d.deleted === 1 ? '' : 's'} (${mb} MB) — nothing deleted. ` +
            `POST {confirm:true} to remove them.`,
          )
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [show, authenticated])

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setAuthenticated(true)
      setError(false)
    } else {
      setError(true)
      setPassword('')
      setTimeout(() => setError(false), 1500)
    }
  }

  const handleLogout = () => {
    setAuthenticated(false)
    setPassword('')
    onClose()
  }

  const sections: { id: Section; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'work', label: 'Home Page' },
    { id: 'archive', label: 'Index / Archive' },
    { id: 'employment', label: 'Employment' },
    { id: 'experiments', label: 'Misc' },
    { id: 'look', label: 'Look Gallery' },
    { id: 'info', label: 'Info / About' },
    { id: 'logo', label: 'Logo' },
    { id: 'loaders', label: 'Loaders' },
    { id: 'storage', label: 'Storage' },
  ]

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            // Above the site header (10000) and minimize-restore pill (10001)
            // so admin overlays are never obscured by chrome.
            zIndex: 10010,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '90vw',
              maxWidth: authenticated ? '900px' : '400px',
              maxHeight: '80vh',
              background: '#111111',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.08)',
              overflow: 'hidden',
              cursor: 'default',
            }}
          >
            {!authenticated ? (
              /* Login screen */
              <div className="p-8 flex flex-col items-center">
                <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center mb-4">
                  <span className="text-white/50 text-[14px]">🔒</span>
                </div>
                <p className="text-white/40 text-[9px] uppercase tracking-[0.2em] mb-6">Admin Code</p>
                <input
                  ref={inputRef}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={password}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 4)
                    setPassword(val)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="• • • •"
                  className="w-full max-w-[180px] px-4 py-2.5 rounded-full text-[16px] text-center tracking-[0.5em] bg-white/5 border border-white/10 text-white placeholder-white/20 outline-none focus:border-white/25 transition-colors"
                  style={{
                    animation: error ? 'portalShake 0.4s ease-out' : 'none',
                  }}
                />
                <button
                  onClick={handleLogin}
                  className="mt-4 px-6 py-1.5 rounded-full text-[8px] uppercase tracking-[0.15em] font-bold text-white/60 border border-white/15 hover:border-white/30 hover:text-white/80 transition-all hover:scale-105 active:scale-95"
                >
                  Enter
                </button>
                {error && (
                  <p className="mt-3 text-[9px] text-red-400/70 uppercase tracking-widest">Invalid password</p>
                )}
                <style>{`
                  @keyframes portalShake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-8px); }
                    75% { transform: translateX(8px); }
                  }
                `}</style>
              </div>
            ) : (
              /* Admin dashboard */
              <div className="flex h-[70vh]">
                {/* Sidebar */}
                <div className="w-[200px] border-r border-white/8 py-4 px-3 flex flex-col flex-shrink-0">
                  <p className="text-white/30 text-[8px] uppercase tracking-[0.2em] px-2 mb-3">Manage</p>
                  {sections.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setActiveSection(s.id)}
                      className={`text-left px-3 py-2 rounded-lg text-[10px] uppercase tracking-[0.08em] transition-all mb-0.5 ${
                        activeSection === s.id
                          ? 'bg-white/10 text-white font-bold'
                          : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                  <div className="mt-auto pt-4 border-t border-white/8">
                    <button
                      onClick={handleLogout}
                      className="text-[8px] uppercase tracking-[0.12em] text-red-400/60 hover:text-red-400 transition-colors px-3 py-1"
                    >
                      Logout
                    </button>
                  </div>
                </div>

                {/* Main content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {activeSection === 'dashboard' && (
                    <div>
                      <h2 className="text-white text-[14px] font-bold uppercase tracking-[0.1em] mb-4">Dashboard</h2>
                      <div className="grid grid-cols-3 gap-3 mb-6">
                        <StatCard label="Total Views" value={typeof window !== 'undefined' ? localStorage.getItem('jc-visits') || '0' : '0'} />
                        <StatCard label="Hearts" value={typeof window !== 'undefined' ? localStorage.getItem('jc-hearts') || '0' : '0'} />
                        <StatCard label="Projects" value="7" />
                      </div>
                      <p className="text-white/30 text-[9px] leading-[1.8] uppercase tracking-[0.08em]">
                        Welcome to the admin portal. Use the sidebar to manage content across each section of your site. Upload media, reorder projects, and edit text directly.
                      </p>
                    </div>
                  )}

                  {activeSection === 'work' && (
                    <HomePagePanel />
                  )}

                  {activeSection === 'archive' && (
                    <IndexAdminPanel onClose={onClose} />
                  )}

                  {activeSection === 'employment' && (
                    <EmploymentAdminPanel />
                  )}

                  {activeSection === 'experiments' && (
                    <MiscUploadPanel />
                  )}

                  {activeSection === 'look' && (
                    <LookUploadPanel />
                  )}

                  {activeSection === 'info' && (
                    <InfoPopupEditor onClose={onClose} />
                  )}

                  {activeSection === 'logo' && <LogoScalePanel />}
                  {activeSection === 'loaders' && (
                    <LoadersAdminPanel />
                  )}

                  {activeSection === 'storage' && (
                    <StorageAdminPanel />
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-3 border border-white/8 bg-white/3">
      <p className="text-white/30 text-[7px] uppercase tracking-[0.15em] mb-1">{label}</p>
      <p className="text-white text-[22px] font-black tracking-tight">{value}</p>
    </div>
  )
}

type AdminProject = {
  slug: string
  client: string
  title: string
  year: number
  tags: string[]
  featured: boolean
  type: string
  brief?: string
  role?: string
  thumbnail?: string
  heroMedia?: string
  media?: { name: string; path: string }[]
  // Bucket key for the Index hover dropdown + the admin list grouping.
  // 'gen' = generative; anything else (undefined) is treated as '3d'.
  category?: string
  logoPath?: string
  hideLogo?: boolean
}

function EditOnPageButton({ path, onClose }: { path: string; onClose: () => void }) {
  const router = useRouter()
  const { setEditMode } = useEditMode()
  return (
    <button
      onClick={() => {
        onClose()
        setEditMode(true)
        router.push(path)
      }}
      className="px-3 py-1.5 rounded-full text-[7px] uppercase tracking-[0.12em] font-bold text-blue-400/70 border border-blue-400/20 hover:border-blue-400/50 hover:text-blue-400 transition-all hover:scale-105"
    >
      Edit on Page →
    </button>
  )
}

type HomeVideo = {
  src: string
  title?: string
  category?: string         // '3D & Motion' | 'Generative Film'
  year?: string | number
  label?: string            // legacy field — pre-typed videos used `label`; keep for back-compat
  // Slug of a featured project. When set, the video shows a pill
  // linking through to /work/<slug>.
  projectSlug?: string
  // One line under the title on the home page, and nowhere else. It
  // lives on the video rather than on the project on purpose: the home
  // page is a reel, and what a clip needs said about it there is not
  // what the project page says about the work. Keeping it here means it
  // cannot leak onto /work/<slug> by being in scope.
  blurb?: string
}

const HOME_VIDEO_CATEGORIES = ['3D & Motion', 'Generative Film'] as const

// Home Page admin: ordered list of full-screen videos that auto-play / cycle on
// the home page. Upload sends to /api/upload?section=home-videos, which writes the
// file to public/assets/home-videos/ (and a backup in /Assets/home-videos/) and
// returns the served path. Videos are stored in pages.json under home-page.videos.
function HomePagePanel() {
  const [videos, setVideos] = useState<HomeVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  // Site-wide library picker for pulling existing media (e.g. a SOFTBOYS
  // clip) into the home page playlist without re-uploading.
  const [libraryOpen, setLibraryOpen] = useState(false)
  // Projects a home video can link through to. Picked from a list rather
  // than typed: a mistyped slug renders a button that 404s, and nothing
  // on this screen would tell you.
  const [projectOptions, setProjectOptions] = useState<Array<{ slug: string; label: string }>>([])
  useEffect(() => {
    fetch('/api/projects', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const list = (d.projects || []) as Array<Record<string, unknown>>
        setProjectOptions(
          list
            .filter(p => typeof p.slug === 'string' && p.slug)
            .map(p => ({
              slug: String(p.slug),
              label: [p.client, p.title].filter(Boolean).join(' — ') || String(p.slug),
            }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        )
      })
      .catch(() => setProjectOptions([]))
  }, [])

  // Pending upload form — appears after a file is picked, so user can confirm
  // title / category / year before sending the file to the server.
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingTitle, setPendingTitle] = useState('')
  const [pendingCategory, setPendingCategory] = useState<string>(HOME_VIDEO_CATEGORIES[0])
  const [pendingYear, setPendingYear] = useState<string>(String(new Date().getFullYear()))

  // Debounced auto-save for inline-edited rows
  const persistTimerRef = useRef<number | null>(null)

  useEffect(() => {
    fetch('/api/pages')
      .then(r => r.json())
      .then(data => {
        const d = (data.pages || data)['home-page'] || {}
        if (Array.isArray(d.videos)) setVideos(d.videos)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const persistRaw = async (next: HomeVideo[]) => {
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: 'home-page', fields: { videos: next } }),
      })
      setStatus(res.ok ? '✓ Saved' : '✗ Save failed')
    } catch {
      setStatus('✗ Save failed')
    }
    setTimeout(() => setStatus(null), 1500)
  }

  const persist = (next: HomeVideo[]) => {
    setVideos(next)
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current)
    persistTimerRef.current = window.setTimeout(() => persistRaw(next), 500)
  }

  const cancelUpload = () => {
    setPendingFile(null)
    setPendingTitle('')
    setPendingCategory(HOME_VIDEO_CATEGORIES[0])
    setPendingYear(String(new Date().getFullYear()))
  }

  const handleFilePick = (file: File) => {
    setPendingFile(file)
    setPendingTitle(file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 60))
  }

  const handleUpload = async () => {
    if (!pendingFile) return
    setUploading(true)
    setStatus(null)

    // Direct-to-Blob upload (browser PUTs straight to Vercel Blob, bypassing
    // the 4.5 MB Vercel-Hobby function-payload cap that was rejecting the
    // larger home videos through /api/upload).
    // MP4s are auto-converted to WebM in the browser before upload.
    const ready = await prepareForUpload(pendingFile, (msg) => setStatus(msg))
    const slugify = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'video'
    const extMatch = ready.name.match(/\.[^.]+$/)
    const ext = extMatch ? extMatch[0].toLowerCase() : ''
    const pathname = `media/home-videos/${slugify(pendingTitle || ready.name)}-${Date.now().toString(36)}${ext}`

    try {
      const blob = await upload(pathname, ready, {
        access: 'public',
        handleUploadUrl: '/api/upload-token',
      })
      const next: HomeVideo[] = [
        ...videos,
        { src: blob.url, title: pendingTitle, category: pendingCategory, year: pendingYear },
      ]
      await persistRaw(next)
      setVideos(next)
      cancelUpload()
    } catch (err) {
      console.error('Home video upload failed:', err)
      setStatus('✗ Upload failed')
      setTimeout(() => setStatus(null), 1500)
    }
    setUploading(false)
  }

  const remove = (i: number) => {
    const removedSrc = videos[i]?.src
    persist(videos.filter((_, idx) => idx !== i))
    void deleteBlobUrls([removedSrc])
  }

  const move = (i: number, dir: -1 | 1) => {
    const target = i + dir
    if (target < 0 || target >= videos.length) return
    const next = [...videos]
    ;[next[i], next[target]] = [next[target], next[i]]
    persist(next)
  }

  const updateField = <K extends keyof HomeVideo>(i: number, field: K, val: HomeVideo[K]) => {
    const next = videos.map((v, idx) => (idx === i ? { ...v, [field]: val } : v))
    persist(next)
  }

  // Append picks from the site-wide library. We share the existing blob URL
  // rather than re-uploading. Category is best-effort guessed from the source
  // section — items pulled from a /projects/<slug>/ folder where the slug is
  // SOFTBOYS-style → "Generative Film"; everything else falls back to the
  // default "3D & Motion" which the admin can adjust inline.
  const handleLibraryPick = (items: { name: string; url: string }[]) => {
    if (!items.length) return
    const yr = String(new Date().getFullYear())
    const niceTitle = (name: string) =>
      name
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60)
    const guessCategory = (url: string): string => {
      // SOFTBOYS / HIGH DIVE are the gen projects; any URL inside their
      // project media folder probably wants the Generative Film bucket.
      if (/\/media\/projects\/(softboys|high-dive)\//i.test(url)) return 'Generative Film'
      return HOME_VIDEO_CATEGORIES[0]
    }
    const next: HomeVideo[] = [
      ...videos,
      ...items.map(it => ({
        src: it.url,
        title: niceTitle(it.name),
        category: guessCategory(it.url),
        year: yr,
      })),
    ]
    void persistRaw(next)
    setVideos(next)
  }

  const inputBase = 'px-2 py-1 rounded-md text-[10px] bg-white/5 border border-white/10 text-white placeholder-white/20 outline-none focus:border-white/25 transition-colors'

  return (
    <div>
      <h2 className="text-white text-[14px] font-bold uppercase tracking-[0.1em] mb-1">Home Page</h2>
      <p className="text-white/30 text-[9px] mb-4">Full-screen videos that play on the home page, in order. Auto-saved on change.</p>

      {status && <p className={`text-[9px] mb-3 ${status.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{status}</p>}

      {loading ? (
        <p className="text-white/20 text-[9px] py-4 text-center">Loading...</p>
      ) : (
        <div className="space-y-2">
          {videos.length === 0 && !pendingFile && (
            <p className="text-white/20 text-[9px] py-3 text-center border border-dashed border-white/10 rounded-lg">
              No videos yet — upload one below.
            </p>
          )}

          {videos.map((v, i) => (
            <div key={`${v.src}-${i}`} className="p-2 rounded-lg border border-white/8 bg-white/3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-white/30 text-[9px] font-mono w-5 flex-shrink-0">{String(i + 1).padStart(2, '0')}</span>
                <video src={v.src} className="w-16 h-9 object-cover rounded flex-shrink-0 bg-black" muted autoPlay loop playsInline />
                <input
                  type="text"
                  value={v.title || v.label || ''}
                  onChange={(e) => updateField(i, 'title', e.target.value)}
                  placeholder="Untitled"
                  className={`${inputBase} flex-1 min-w-0`}
                />
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="text-white/40 hover:text-white/80 disabled:opacity-15 disabled:cursor-not-allowed text-[10px] w-5 h-5 flex items-center justify-center" aria-label="Move up">↑</button>
                  <button onClick={() => move(i, 1)} disabled={i === videos.length - 1} className="text-white/40 hover:text-white/80 disabled:opacity-15 disabled:cursor-not-allowed text-[10px] w-5 h-5 flex items-center justify-center" aria-label="Move down">↓</button>
                  <button onClick={() => remove(i)} className="text-red-400/40 hover:text-red-400 text-[10px] w-5 h-5 flex items-center justify-center ml-1" aria-label="Remove">✕</button>
                </div>
              </div>
              {/* The line that sits under the title on the home page.
                  Placed directly under the title field here too, so the
                  panel reads in the order the page does. */}
              <div className="flex items-center gap-2 pl-7">
                <input
                  type="text"
                  value={v.blurb || ''}
                  onChange={(e) => updateField(i, 'blurb', e.target.value)}
                  placeholder="Line under the title — home page only"
                  className={`${inputBase} flex-1 min-w-0`}
                  title="Shows under the title on the home page. Does not appear on the project page."
                />
              </div>
              <div className="flex items-center gap-2 pl-7">
                <select
                  value={v.category || HOME_VIDEO_CATEGORIES[0]}
                  onChange={(e) => updateField(i, 'category', e.target.value)}
                  className={`${inputBase} flex-1 min-w-0 cursor-pointer`}
                >
                  {HOME_VIDEO_CATEGORIES.map((c) => (
                    <option key={c} value={c} className="bg-black text-white">{c}</option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="numeric"
                  value={String(v.year ?? '')}
                  onChange={(e) => updateField(i, 'year', e.target.value)}
                  placeholder="Year"
                  className={`${inputBase} w-16`}
                />
              </div>
              {/* Optional "View project →" pill on the home page. Blank =
                  no button, which is the default for a clip that isn't
                  client work. */}
              <div className="flex items-center gap-2 pl-7">
                <label className="text-white/35 text-[7px] uppercase tracking-[0.12em] flex-shrink-0">
                  Button →
                </label>
                <select
                  value={v.projectSlug || ''}
                  onChange={(e) => updateField(i, 'projectSlug', e.target.value)}
                  className={`${inputBase} flex-1 min-w-0 cursor-pointer`}
                  title="Show a pill on this video linking through to a project"
                >
                  <option value="" className="bg-black text-white">No button</option>
                  {projectOptions.map(p => (
                    <option key={p.slug} value={p.slug} className="bg-black text-white">
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}

          {pendingFile ? (
            <div className="p-3 rounded-lg border border-white/15 bg-white/5 space-y-2 mt-3">
              <p className="text-white/55 text-[8px] uppercase tracking-[0.14em] font-bold">New Video</p>
              <p className="text-white/35 text-[9px] truncate font-mono">{pendingFile.name}</p>
              <input
                type="text"
                value={pendingTitle}
                onChange={(e) => setPendingTitle(e.target.value)}
                placeholder="Title"
                className={`${inputBase} w-full`}
              />
              <div className="flex items-center gap-2">
                <select
                  value={pendingCategory}
                  onChange={(e) => setPendingCategory(e.target.value)}
                  className={`${inputBase} flex-1 cursor-pointer`}
                >
                  {HOME_VIDEO_CATEGORIES.map((c) => (
                    <option key={c} value={c} className="bg-black text-white">{c}</option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="numeric"
                  value={pendingYear}
                  onChange={(e) => setPendingYear(e.target.value)}
                  placeholder="Year"
                  className={`${inputBase} w-16`}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="flex-1 py-2 rounded-full text-[9px] uppercase tracking-[0.12em] font-bold transition-all hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.95)' }}
                >
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
                <button
                  onClick={cancelUpload}
                  disabled={uploading}
                  className="px-4 py-2 rounded-full text-[9px] uppercase tracking-[0.12em] font-bold transition-all hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 mt-3">
              <label
                className="block w-full py-3 rounded-full text-[9px] uppercase tracking-[0.12em] font-bold text-center cursor-pointer transition-all hover:scale-[1.01]"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.22)', color: 'rgba(255,255,255,0.85)' }}
              >
                + Upload New Video
                <input
                  type="file"
                  className="hidden"
                  accept="video/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFilePick(f)
                    e.target.value = ''
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => setLibraryOpen(true)}
                className="block w-full py-3 rounded-full text-[9px] uppercase tracking-[0.12em] font-bold text-center transition-all hover:scale-[1.01]"
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.22)', color: 'rgba(255,255,255,0.75)' }}
              >
                ⌕ From Library
              </button>
            </div>
          )}
        </div>
      )}

      <MediaLibraryPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={(items) => {
          handleLibraryPick(items)
          setLibraryOpen(false)
        }}
      />
    </div>
  )
}

/**
 * Admin-only "download all assets" pill. Fetches every media file for a
 * project from its public URL (works for both Vercel Blob URLs and local
 * /assets/* paths), zips them with jszip, and triggers a browser download.
 *
 * The filename pattern preserves the upload order so the receiver can see
 * which file was which slot on the page ("01-<name>", "02-<name>", …).
 *
 * Unlike the per-project page's "Download" button (which generates
 * watermarked low-res placeholders for the public), this pulls the actual
 * source files — admin-only because it's behind the AdminPortal gate.
 */
function DownloadAssetsButton({
  mediaFiles,
  projectSlug,
  projectName,
}: {
  mediaFiles: { name: string; path: string }[]
  projectSlug: string
  projectName: string
}) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const handleDownload = async () => {
    if (!mediaFiles.length || busy) return
    setBusy(true)
    setProgress({ done: 0, total: mediaFiles.length })
    try {
      await downloadAssetsZip(
        mediaFiles.map(m => ({ name: m.name, url: m.path })),
        `${projectName}_${projectSlug}_assets`,
        (done, total) => setProgress({ done, total }),
      )
    } catch (err) {
      console.error('Download all failed:', err)
      // eslint-disable-next-line no-alert
      alert('Download failed — see console for details.')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={busy || mediaFiles.length === 0}
      className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] uppercase tracking-[0.12em] font-bold text-white/70 border border-white/15 hover:border-white/30 hover:text-white/90 hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-wait"
      title="Download every project file as a ZIP (admin only)"
    >
      {busy
        ? (progress ? `⏳ ${progress.done}/${progress.total}` : '⏳ Zipping…')
        : `↓ Download all (${mediaFiles.length})`}
    </button>
  )
}

function IndexAdminPanel({ onClose }: { onClose: () => void }) {
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [mediaFiles, setMediaFiles] = useState<{ name: string; path: string }[]>([])
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  // Snapshot of the project's media + logo URLs as they were when the user
  // opened the editor. On save we diff against current state to find URLs
  // that are no longer referenced and free those Blobs.
  const originalAssetsRef = useRef<{ mediaPaths: string[]; logoPath: string }>({
    mediaPaths: [],
    logoPath: '',
  })

  // Form fields
  const [client, setClient] = useState('')
  const [title, setTitle] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [medium, setMedium] = useState<string[]>([])
  const [featured, setFeatured] = useState(false)
  const [brief, setBrief] = useState('')
  const [role, setRole] = useState('')
  const [logoPath, setLogoPath] = useState('')
  const [showLogoOnAbout, setShowLogoOnAbout] = useState(true)
  const [hideLogo, setHideLogo] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  // Bucket for the Index hover dropdown + admin list grouping.
  const [category, setCategory] = useState<'3d' | 'gen'>('3d')
  // Library picker for the project editor — same picker the inline drawer
  // uses, so the user can avoid re-uploading files that already live in
  // home-videos / misc / another project.
  const [libraryOpen, setLibraryOpen] = useState(false)
  // Layout: 'list' = flat table; 'grid' = thumbnail cards with hero media.
  const [listView, setListView] = useState<'list' | 'grid'>('list')

  const mediumOptions = ['Motion', '3D', 'Generative', 'Illustration']

  const loadProjects = () => {
    setLoading(true)
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => { setProjects(data.projects || []); setLoading(false) })
      .catch(() => { setLoading(false); setStatus('✗ Failed to load projects — server may be down') })
  }

  useEffect(() => { loadProjects() }, [])

  const resetForm = () => {
    setClient(''); setTitle(''); setYear(new Date().getFullYear())
    setMedium([]); setFeatured(false); setBrief(''); setRole('')
    setEditingSlug(null); setShowForm(false); setMediaFiles([])
    setLogoPath(''); setShowLogoOnAbout(true); setHideLogo(false); setCategory('3d')
  }

  const handleSave = async () => {
    if (!client || !title) { setStatus('✗ Client and title required'); return }
    const slug = editingSlug || `${client.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${Date.now().toString(36)}`
    const project: Record<string, unknown> = {
      slug, client, title, year,
      tags: medium.length ? medium : ['Motion'],
      featured,
      type: featured ? 'case-study' : 'media-forward',
    }
    if (brief) project.brief = brief
    if (role) project.role = role
    if (featured && mediaFiles.length > 0) {
      project.media = mediaFiles
      project.thumbnail = mediaFiles[0].path
      project.heroMedia = mediaFiles[0].path
    }
    if (logoPath) {
      project.logoPath = logoPath
      project.showLogoOnAbout = showLogoOnAbout
    }
    // Always persist hideLogo + category (deliberate toggles, even at default)
    project.hideLogo = hideLogo
    project.category = category
    const action = editingSlug ? 'update' : 'add'
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, project, slug }),
      })
      if (!res.ok) {
        setStatus(`✗ Server error: ${res.status}`)
        return
      }
      const data = await res.json()
      if (data.success) {
        setProjects(data.projects)
        setStatus(`✓ Project ${action === 'add' ? 'added' : 'updated'}`)
        // Diff vs originals to find media + logo Blobs that are no longer
        // referenced and free them. (Only runs on an edit since `add` has
        // empty originals.)
        const orig = originalAssetsRef.current
        const keptPaths = new Set(mediaFiles.map(m => m.path))
        const orphans: string[] = []
        for (const p of orig.mediaPaths) {
          if (!keptPaths.has(p)) orphans.push(p)
        }
        if (orig.logoPath && orig.logoPath !== logoPath) orphans.push(orig.logoPath)
        void deleteBlobUrls(orphans)
        resetForm()
      } else {
        setStatus(`✗ ${data.error || 'Unknown error'}`)
      }
    } catch (err) {
      setStatus(`✗ Network error: ${String(err)}`)
    }
  }

  const handleDelete = async (slug: string) => {
    // Collect every Blob URL the project references — media items + logo +
    // thumbnail + hero — so we can free them after the project record is
    // removed.
    const target = projects.find(p => p.slug === slug) as Record<string, unknown> | undefined
    const blobs: Array<string | undefined> = []
    if (target) {
      const media = (target.media as Array<{ path?: string }> | undefined) || []
      for (const m of media) blobs.push(m?.path)
      blobs.push(target.logoPath as string | undefined)
      blobs.push(target.thumbnail as string | undefined)
      blobs.push(target.heroMedia as string | undefined)
    }
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', slug }),
    })
    const data = await res.json()
    if (data.success) {
      setProjects(data.projects)
      setStatus('✓ Project removed')
      void deleteBlobUrls(blobs)
    }
  }

  const startEdit = (p: AdminProject) => {
    setClient(p.client); setTitle(p.title); setYear(p.year)
    setMedium(p.tags); setFeatured(p.featured)
    setBrief(p.brief || ''); setRole(p.role || '')
    setEditingSlug(p.slug); setShowForm(true)
    setMediaFiles(p.media || [])
    setLogoPath((p as Record<string, unknown>).logoPath as string || '')
    setShowLogoOnAbout((p as Record<string, unknown>).showLogoOnAbout !== false)
    setHideLogo(Boolean((p as Record<string, unknown>).hideLogo))
    setCategory(((p as Record<string, unknown>).category as '3d' | 'gen') === 'gen' ? 'gen' : '3d')
    originalAssetsRef.current = {
      mediaPaths: (p.media || []).map(m => m.path).filter(Boolean),
      logoPath: ((p as Record<string, unknown>).logoPath as string) || '',
    }
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  const inputStyle = "w-full px-3 py-2 rounded-lg text-[11px] bg-white/5 border border-white/10 text-white placeholder-white/20 outline-none focus:border-white/25 transition-colors"
  const labelStyle = "text-white/50 text-[8px] uppercase tracking-[0.12em] block mb-1.5"

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-white text-[14px] font-bold uppercase tracking-[0.1em] mb-1">Index / Archive</h2>
            <EditOnPageButton path="/indexx" onClose={onClose} />
          </div>
          <p className="text-white/30 text-[9px]">
            {projects.length} projects
            {projects.length === 0 && !loading && (
              <button onClick={loadProjects} className="ml-2 text-white/40 underline hover:text-white/60">retry</button>
            )}
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm) }}
          className="px-4 py-1.5 rounded-full text-[8px] uppercase tracking-[0.12em] font-bold text-white/70 border border-white/20 hover:border-white/40 transition-all hover:scale-105"
        >
          {showForm ? 'Cancel' : '+ Add Project'}
        </button>
      </div>

      {status && (
        <p className={`text-[9px] mb-3 ${status.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{status}</p>
      )}

      {/* Featured Projects Order — drag to reorder */}
      {(() => {
        const featuredList = projects.filter(p => p.featured)
        if (featuredList.length === 0) return null
        return (
          <div className="mb-5 p-3 rounded-lg border border-pink-500/15 bg-pink-500/3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/60 text-[8px] font-bold uppercase tracking-[0.12em]">Featured Projects Order</span>
              <span className="text-pink-400/40 text-[7px]">{featuredList.length} featured</span>
            </div>
            <div className="space-y-0.5">
              {featuredList.map((p, i) => (
                <div
                  key={p.slug}
                  className="flex items-center gap-2 py-1.5 px-2 rounded bg-white/3 border border-white/5 group"
                >
                  <span className="text-pink-400/40 text-[8px] font-mono w-4">{i + 1}</span>
                  <span className="text-white/50 text-[8px]">★</span>
                  <span className="text-white/80 text-[9px] font-bold uppercase flex-1 truncate">{p.client}</span>
                  <span className="text-white/30 text-[8px] truncate max-w-[120px]">{p.title}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                    {i > 0 && (
                      <button
                        onClick={async () => {
                          const slugs = featuredList.map(f => f.slug)
                          ;[slugs[i - 1], slugs[i]] = [slugs[i], slugs[i - 1]]
                          await fetch('/api/projects', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'reorder-featured', slugs }),
                          })
                          loadProjects()
                        }}
                        className="text-[9px] text-white/30 hover:text-white transition-colors"
                      >↑</button>
                    )}
                    {i < featuredList.length - 1 && (
                      <button
                        onClick={async () => {
                          const slugs = featuredList.map(f => f.slug)
                          ;[slugs[i], slugs[i + 1]] = [slugs[i + 1], slugs[i]]
                          await fetch('/api/projects', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'reorder-featured', slugs }),
                          })
                          loadProjects()
                        }}
                        className="text-[9px] text-white/30 hover:text-white transition-colors"
                      >↓</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Add / Edit form */}
      {showForm && (
        <div ref={formRef} className="mb-6 p-4 rounded-lg border border-white/10 bg-white/3 space-y-3">
          <p className="text-white/60 text-[9px] font-bold uppercase tracking-[0.1em]">
            {editingSlug ? 'Edit Project' : 'New Project'}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelStyle}>Client</label>
              <input type="text" value={client} onChange={e => setClient(e.target.value)} className={inputStyle} placeholder="e.g. Nike" />
            </div>
            <div>
              <label className={labelStyle}>Project Title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={inputStyle} placeholder="e.g. Air Max Campaign" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelStyle}>Year</label>
              <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || 2026)} className={inputStyle} />
            </div>
            <div>
              <label className={labelStyle}>Medium</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {mediumOptions.map(m => (
                  <button
                    key={m}
                    onClick={() => setMedium(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                    className="px-2.5 py-1 rounded-full text-[7px] uppercase tracking-[0.1em] font-bold transition-all"
                    style={{
                      background: medium.includes(m) ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${medium.includes(m) ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                      color: medium.includes(m) ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bucket — drives both the Index hover dropdown grouping and the
              section this project appears under in the admin list. */}
          <div>
            <label className={labelStyle}>Bucket</label>
            <div className="flex gap-1.5 mt-1">
              {(['gen', '3d'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className="px-3 py-1.5 rounded-full text-[8px] uppercase tracking-[0.12em] font-bold transition-all"
                  style={{
                    background: category === c ? (c === 'gen' ? 'rgba(167,139,250,0.22)' : 'rgba(244,114,182,0.22)') : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${category === c ? (c === 'gen' ? 'rgba(167,139,250,0.55)' : 'rgba(244,114,182,0.55)') : 'rgba(255,255,255,0.08)'}`,
                    color: category === c ? '#fff' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {c === 'gen' ? 'Generative' : '3D / Motion'}
                </button>
              ))}
            </div>
          </div>

          {/* Client Logo */}
          <div>
            <label className={labelStyle}>Client Logo</label>
            {/* Hide-logo toggle — useful for Generative projects that don't
                have a client logo. When checked, the project page skips the
                logo area entirely. */}
            <label className="flex items-center gap-2 mb-2 cursor-pointer select-none text-white/65 text-[8px] uppercase tracking-[0.1em]">
              <input
                type="checkbox"
                checked={hideLogo}
                onChange={(e) => setHideLogo(e.target.checked)}
                className="accent-blue-400"
              />
              Hide logo on project page (no client logo)
            </label>
            <div className="flex items-center gap-3" style={{ opacity: hideLogo ? 0.35 : 1, pointerEvents: hideLogo ? 'none' : undefined }}>
              {logoPath ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 flex-1">
                  <img src={logoPath} alt="Logo" className="h-5 w-auto invert opacity-60" />
                  <span className="text-white/40 text-[9px] flex-1 truncate">{logoPath.split('/').pop()}</span>
                  <button onClick={() => setLogoPath('')} className="text-red-400/40 text-[8px] hover:text-red-400">✕</button>
                </div>
              ) : (
                <label className="px-4 py-2 rounded-full text-[8px] uppercase tracking-[0.12em] font-bold text-white/50 border border-white/15 cursor-pointer hover:border-white/30 hover:text-white/70 transition-all">
                  {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/svg+xml,image/png,image/jpeg,image/webp"
                    disabled={uploadingLogo}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setUploadingLogo(true)
                      try {
                        const { url } = await uploadFileToBlob(file, 'Logos', client || 'client')
                        setLogoPath(url)
                      } catch (err) { console.error('Logo upload failed:', err) }
                      setUploadingLogo(false)
                      e.target.value = ''
                    }}
                  />
                </label>
              )}
            </div>
            {logoPath && (
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => setShowLogoOnAbout(!showLogoOnAbout)}
                  className="w-4 h-4 rounded border flex items-center justify-center transition-all"
                  style={{
                    borderColor: showLogoOnAbout ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
                    background: showLogoOnAbout ? 'rgba(255,255,255,0.1)' : 'transparent',
                  }}
                >
                  {showLogoOnAbout && <span className="text-white/80 text-[8px]">✓</span>}
                </button>
                <span className="text-white/40 text-[7px] uppercase tracking-[0.1em]">Show on About page client grid</span>
              </div>
            )}
          </div>

          {/* Featured toggle */}
          <div className="flex items-center gap-3 py-2">
            <button
              onClick={() => setFeatured(!featured)}
              className="w-5 h-5 rounded border flex items-center justify-center transition-all"
              style={{
                borderColor: featured ? 'rgba(255,105,180,0.6)' : 'rgba(255,255,255,0.15)',
                background: featured ? 'rgba(255,105,180,0.15)' : 'transparent',
              }}
            >
              {featured && <span className="text-pink-400 text-[10px]">✓</span>}
            </button>
            <span className="text-white/60 text-[9px] uppercase tracking-[0.1em]">Featured Project</span>
            {featured && <span className="text-pink-400/50 text-[7px]">— will appear on home carousel + index featured</span>}
          </div>

          {/* Extra fields for featured */}
          {featured && (
            <div className="space-y-3 pl-3 border-l border-pink-500/20">
              <div>
                <label className={labelStyle}>Brief / Description</label>
                <textarea
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                  rows={3}
                  className={`${inputStyle} resize-none`}
                  placeholder="A few lines about the project..."
                />
              </div>
              <div>
                <label className={labelStyle}>Role</label>
                <input type="text" value={role} onChange={e => setRole(e.target.value)} className={inputStyle} placeholder="e.g. Director, Motion Designer" />
              </div>

              {/* Media upload for featured projects */}
              <div className="pt-3 border-t border-pink-500/10">
                <label className={labelStyle}>Project Media</label>
                <p className="text-white/20 text-[7px] mb-2">Upload images and videos. Drag to reorder. First item becomes the hero.</p>

                <div className="flex items-center gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setLibraryOpen(true)}
                    className="px-4 py-2 rounded-full text-[8px] uppercase tracking-[0.12em] font-bold text-blue-300/80 border border-blue-300/30 hover:bg-blue-400/10 hover:text-blue-300 transition-all"
                    title="Pick existing files from the site library instead of re-uploading"
                  >
                    ⌕ From Library
                  </button>
                  <label className="px-4 py-2 rounded-full text-[8px] uppercase tracking-[0.12em] font-bold text-white/50 border border-white/15 cursor-pointer hover:border-white/30 hover:text-white/70 transition-all">
                    {uploadingMedia ? 'Uploading...' : '+ Add Media'}
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,video/*"
                      multiple
                      disabled={uploadingMedia}
                      onChange={async (e) => {
                        const files = e.target.files
                        if (!files?.length) return
                        setUploadingMedia(true)
                        const slug = editingSlug || client.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                        for (const file of Array.from(files)) {
                          try {
                            const { url, fileName } = await uploadFileToBlob(file, `projects/${slug}`, client, setStatus)
                            setMediaFiles(prev => [...prev, { name: fileName, path: url }])
                            // Mirror to /misc when the project is featured —
                            // same behaviour as the inline ProjectMediaPanel
                            // drawer. Was missing from this code path which
                            // is why uploads here weren't showing up in misc.
                            if (featured) {
                              const isVideoFile = /\.(mp4|webm|mov|m4v)$/i.test(fileName) || /\.(mp4|webm|mov|m4v)$/i.test(url)
                              void mirrorToMisc({
                                src: url,
                                title: client,
                                year: String(year),
                                medium: (medium && medium.length > 0 ? medium : ['3D']),
                                type: isVideoFile ? 'video' : 'image',
                                fileName,
                              })
                            }
                          } catch (err) { console.error('Project media upload failed:', err) }
                        }
                        setUploadingMedia(false)
                        setStatus(null)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <span className="text-white/20 text-[8px]">{mediaFiles.length} file{mediaFiles.length !== 1 ? 's' : ''}</span>
                  {mediaFiles.length > 0 && (
                    <DownloadAssetsButton
                      mediaFiles={mediaFiles}
                      projectSlug={editingSlug || client.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'project'}
                      projectName={client || 'project'}
                    />
                  )}
                </div>

                {/* Media grid with drag-drop reorder */}
                {mediaFiles.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {mediaFiles.map((f, i) => (
                      <div
                        key={f.path}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('idx', String(i))}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          const fromIdx = parseInt(e.dataTransfer.getData('idx'))
                          if (isNaN(fromIdx) || fromIdx === i) return
                          const arr = [...mediaFiles]
                          const [item] = arr.splice(fromIdx, 1)
                          arr.splice(i, 0, item)
                          setMediaFiles(arr)
                        }}
                        className="relative rounded-lg overflow-hidden cursor-grab active:cursor-grabbing group"
                        style={{ aspectRatio: '16/9', border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        {/\.(mp4|webm|mov)$/i.test(f.path) ? (
                          <video src={f.path} className="w-full h-full object-cover" muted />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.path} alt="" className="w-full h-full object-cover" />
                        )}
                        <div className="absolute top-1 left-1 flex items-center gap-1">
                          <span className="bg-black/60 text-white/60 text-[7px] font-mono px-1.5 py-0.5 rounded">{String(i + 1).padStart(2, '0')}</span>
                          {i === 0 && <span className="bg-pink-500/30 text-pink-300 text-[6px] px-1.5 py-0.5 rounded uppercase">Hero</span>}
                        </div>
                        <button
                          onClick={() => setMediaFiles(prev => prev.filter((_, j) => j !== i))}
                          className="absolute top-1 right-1 bg-black/60 text-red-400/60 hover:text-red-400 text-[8px] w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            onClick={handleSave}
            className="w-full py-2.5 rounded-full text-[9px] uppercase tracking-[0.12em] font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.8)',
            }}
          >
            {editingSlug ? 'Update Project' : 'Add Project'}
          </button>
        </div>
      )}

      {/* Project list — grouped by category (GEN first, then 3D), with a
          list / grid view toggle. Group order matches the public Index
          dropdown so what you see here lines up with what visitors see. */}
      {(() => {
        const sorted = [...projects].sort((a, b) => b.year - a.year)
        const genProjects = sorted.filter(p => p.category === 'gen')
        const threeDProjects = sorted.filter(p => p.category !== 'gen')

        const renderProject = (p: AdminProject) => {
          const heroMedia = p.heroMedia || p.thumbnail || p.media?.[0]?.path
          const isVideo = heroMedia ? /\.(mp4|webm|mov|m4v)$/i.test(heroMedia) : false
          if (listView === 'grid') {
            return (
              <button
                key={p.slug}
                onClick={() => startEdit(p)}
                className="relative aspect-square rounded-lg overflow-hidden bg-black border border-white/10 hover:border-white/30 transition-all group text-left"
              >
                {heroMedia && (isVideo ? (
                  <video src={heroMedia} muted loop playsInline className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={heroMedia} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                ))}
                {!heroMedia && (
                  <div className="absolute inset-0 flex items-center justify-center text-white/20 text-[8px] uppercase tracking-[0.15em]">
                    no hero
                  </div>
                )}
                {/* Bottom-fade overlay with client + project name */}
                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/85 to-transparent">
                  <div className="flex items-center gap-1 mb-0.5">
                    {p.featured && <span className="text-pink-400 text-[8px]">★</span>}
                    <span className="text-white text-[9px] font-bold uppercase tracking-[0.08em] truncate">{p.client}</span>
                  </div>
                  <p className="text-white/55 text-[8px] truncate">{p.title}</p>
                  <p className="text-white/35 text-[7px] font-mono mt-0.5">{p.year}</p>
                </div>
                {/* Delete shortcut — top-right, only on hover */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(p.slug) }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/65 text-red-400/70 hover:text-red-400 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Delete"
                >✕</button>
              </button>
            )
          }
          return (
            <div
              key={p.slug}
              className="flex items-center py-2 border-b border-white/5 hover:bg-white/3 transition-colors group"
            >
              <span className="w-[28%] text-white/80 text-[10px] font-bold uppercase truncate pr-2">
                {p.featured && <span className="text-pink-400 mr-1">★</span>}
                {p.client}
              </span>
              <span className="w-[32%] text-white/50 text-[9px] truncate pr-2">{p.title}</span>
              <span className="w-[12%] text-white/40 text-[9px] font-mono">{p.year}</span>
              <span className="w-[15%] text-white/30 text-[7px] uppercase">{p.tags?.join(' / ')}</span>
              <span className="w-[13%] flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => startEdit(p)} className="text-white/40 text-[8px] hover:text-white">Edit</button>
                <button onClick={() => handleDelete(p.slug)} className="text-red-400/40 text-[8px] hover:text-red-400">✕</button>
              </span>
            </div>
          )
        }

        const Section = ({ title, items, accent }: { title: string; items: AdminProject[]; accent: string }) => (
          <div className="mb-6">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
              <h3 className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>
                {title} <span className="text-white/30 ml-1">{items.length}</span>
              </h3>
            </div>
            {items.length === 0 ? (
              <p className="text-white/20 text-[9px] py-3 text-center">No {title.toLowerCase()} projects yet.</p>
            ) : listView === 'grid' ? (
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                {items.map(renderProject)}
              </div>
            ) : (
              <div>
                <div className="flex items-center text-[7px] uppercase tracking-[0.15em] text-white/25 pb-2 border-b border-white/8 mb-1">
                  <span className="w-[28%]">Client</span>
                  <span className="w-[32%]">Project</span>
                  <span className="w-[12%]">Year</span>
                  <span className="w-[15%]">Medium</span>
                  <span className="w-[13%] text-right">Actions</span>
                </div>
                {items.map(renderProject)}
              </div>
            )}
          </div>
        )

        return (
          <div>
            {/* View toggle — top-right above sections. */}
            <div className="flex items-center justify-end mb-2">
              <div className="inline-flex rounded-full border border-white/15 overflow-hidden">
                {(['list', 'grid'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setListView(v)}
                    className="px-3 py-1 text-[8px] uppercase tracking-[0.12em] font-bold transition-colors"
                    style={{
                      background: listView === v ? 'rgba(255,255,255,0.15)' : 'transparent',
                      color: listView === v ? '#fff' : 'rgba(255,255,255,0.5)',
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {loading && <p className="text-white/20 text-[9px] py-4 text-center">Loading...</p>}
            {!loading && projects.length === 0 && (
              <div className="text-center py-6">
                <p className="text-white/15 text-[9px]">No projects found. Server may have been down.</p>
                <button onClick={loadProjects} className="mt-2 px-4 py-1.5 rounded-full text-[8px] uppercase tracking-[0.12em] text-white/40 border border-white/15 hover:border-white/30 transition-all">
                  Reload
                </button>
              </div>
            )}
            {!loading && projects.length > 0 && (
              <>
                <Section title="Generative" items={genProjects} accent="rgb(167, 139, 250)" />
                <Section title="3D & Motion" items={threeDProjects} accent="rgb(244, 114, 182)" />
              </>
            )}
          </div>
        )
      })()}

      {/* Library picker — opens when "⌕ From Library" is clicked inside the
          project editor. Selected items get appended to mediaFiles with their
          existing Blob URLs (no re-upload), and the mirror-to-misc step is
          skipped because those items already live wherever they came from. */}
      <MediaLibraryPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={(picks) => {
          if (picks.length === 0) return
          setMediaFiles(prev => [
            ...prev,
            ...picks.map(p => ({ name: p.name, path: p.url })),
          ])
          setStatus(`✓ Added ${picks.length} from library`)
          setTimeout(() => setStatus(null), 1800)
        }}
      />
    </div>
  )
}

function EmploymentAdminPanel() {
  type Job = { company: string; role: string; year: string; link: string }
  const defaultJobs: Job[] = [
    { company: 'Meta', role: 'Senior 3D & AI Artist', year: '2026', link: 'https://meta.com' },
    { company: 'SouthSouthWest', role: 'Senior 3D Artist', year: '2025', link: 'https://southsouthwest.com.au' },
    { company: 'ANZ', role: 'Senior 3D Designer', year: '2024', link: 'https://anz.com.au' },
    { company: 'Time Based Arts', role: '3D Artist & Art Director', year: '2022–24', link: 'https://timebasedarts.com' },
    { company: 'Aardman Animations', role: '3D Modeller & Texture Artist', year: '2021–22', link: 'https://aardman.com' },
    { company: 'UNIT Film & TV', role: '3D Artist', year: '2019–20', link: '' },
  ]

  const [jobs, setJobs] = useState<Job[]>(defaultJobs)
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/pages')
      .then(r => r.json())
      .then(data => {
        const pages = data.pages || data
        if (pages['employment']?.jobs) {
          try { setJobs(JSON.parse(pages['employment'].jobs)) } catch {}
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const save = async (updated: Job[]) => {
    setJobs(updated)
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: 'employment', fields: { jobs: JSON.stringify(updated) } }),
      })
      if (res.ok) {
        setStatus('✓ Saved')
      } else {
        const err = await res.text()
        setStatus(`✗ ${err}`)
      }
      setTimeout(() => setStatus(null), 2000)
    } catch (e) {
      setStatus(`✗ ${String(e)}`)
    }
  }

  const moveJob = (from: number, to: number) => {
    const updated = [...jobs]
    const [item] = updated.splice(from, 1)
    updated.splice(to, 0, item)
    save(updated)
  }

  const inputStyle = "w-full px-2 py-1.5 rounded-lg text-[10px] bg-white/5 border border-white/10 text-white placeholder-white/20 outline-none focus:border-white/25"
  const labelStyle = "text-white/40 text-[7px] uppercase tracking-[0.12em] block mb-1"

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-white text-[14px] font-bold uppercase tracking-[0.1em] mb-1">Employment</h2>
          <p className="text-white/30 text-[9px]">{jobs.length} positions</p>
        </div>
        <button
          onClick={() => save([...jobs, { company: '', role: '', year: '', link: '' }])}
          className="px-4 py-1.5 rounded-full text-[8px] uppercase tracking-[0.12em] font-bold text-white/70 border border-white/20 hover:border-white/40 transition-all hover:scale-105"
        >
          + Add Position
        </button>
      </div>

      {status && (
        <p className={`text-[9px] mb-3 ${status.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{status}</p>
      )}

      {loading ? (
        <p className="text-white/20 text-[9px] py-4 text-center">Loading...</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job, i) => (
            <div key={i} className="p-3 rounded-lg border border-white/8 bg-white/3 group">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className={labelStyle}>Company</label>
                  <input
                    type="text"
                    value={job.company}
                    onChange={(e) => { const u = [...jobs]; u[i] = { ...u[i], company: e.target.value }; setJobs(u) }}
                    onBlur={() => save(jobs)}
                    className={inputStyle}
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className={labelStyle}>Role</label>
                  <input
                    type="text"
                    value={job.role}
                    onChange={(e) => { const u = [...jobs]; u[i] = { ...u[i], role: e.target.value }; setJobs(u) }}
                    onBlur={() => save(jobs)}
                    className={inputStyle}
                    placeholder="Job title"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelStyle}>Year</label>
                  <input
                    type="text"
                    value={job.year}
                    onChange={(e) => { const u = [...jobs]; u[i] = { ...u[i], year: e.target.value }; setJobs(u) }}
                    onBlur={() => save(jobs)}
                    className={inputStyle}
                    placeholder="e.g. 2024–25"
                  />
                </div>
                <div>
                  <label className={labelStyle}>Website Link</label>
                  <input
                    type="text"
                    value={job.link}
                    onChange={(e) => { const u = [...jobs]; u[i] = { ...u[i], link: e.target.value }; setJobs(u) }}
                    onBlur={() => save(jobs)}
                    className={inputStyle}
                    placeholder="https://..."
                  />
                </div>
              </div>
              {/* Reorder + Delete */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex gap-2">
                  {i > 0 && (
                    <button onClick={() => moveJob(i, i - 1)}
                      className="text-[8px] text-white/30 hover:text-white transition-colors">↑ Move up</button>
                  )}
                  {i < jobs.length - 1 && (
                    <button onClick={() => moveJob(i, i + 1)}
                      className="text-[8px] text-white/30 hover:text-white transition-colors">↓ Move down</button>
                  )}
                </div>
                <button
                  onClick={() => save(jobs.filter((_, j) => j !== i))}
                  className="text-[8px] text-red-400/50 hover:text-red-400 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save button at bottom */}
      <button
        onClick={() => save(jobs)}
        className="w-full py-2.5 mt-4 rounded-full text-[9px] uppercase tracking-[0.12em] font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)' }}
      >
        Save Employment
      </button>
    </div>
  )
}

function LookUploadPanel() {
  const [credits, setCredits] = useState('')
  const [link, setLink] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [existingItems, setExistingItems] = useState<{ fileName: string; path: string; credits?: string; link?: string }[]>([])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [editingLookIdx, setEditingLookIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Pinterest board sync — forces /api/look-pinterest to refetch the
  // board immediately instead of waiting out the 6-hour TTL.
  const [pinSyncing, setPinSyncing] = useState(false)
  const [pinSyncStatus, setPinSyncStatus] = useState<string | null>(null)
  // The feed items currently showing on /look, for the hide-grid below.
  // hiddenIdsRef mirrors the server's hidden list; on every ✕ the FULL
  // updated list is sent (set-hidden) so rapid consecutive hides can't
  // lose each other to blob-propagation lag.
  const [pinFeed, setPinFeed] = useState<{ id: string; src: string; link: string }[]>([])
  const hiddenIdsRef = useRef<string[]>([])

  useEffect(() => {
    fetch('/api/look-pinterest')
      .then(r => r.json())
      .then(d => {
        setPinFeed(d.items || [])
        hiddenIdsRef.current = Array.isArray(d.hidden) ? d.hidden : []
      })
      .catch(() => {})
  }, [])

  const handlePinterestSync = async () => {
    setPinSyncing(true)
    setPinSyncStatus(null)
    try {
      const res = await fetch('/api/look-pinterest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      // Video pins import a few per run (time budget) — tell the user
      // when another click will pull in more.
      const vid = data.videoImported
        ? ` · ${data.videoImported} video${data.videoImported === 1 ? '' : 's'} imported`
        : ''
      const more = data.videoRemaining ? ` · ${data.videoRemaining} to check — click Sync again` : ''
      setPinSyncStatus(`✓ Synced — ${data.items?.length ?? 0} pins on Look${vid}${more}`)
      if (data.items) setPinFeed(data.items)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPinSyncStatus(`✗ Sync failed: ${msg}`)
    } finally {
      setPinSyncing(false)
      setTimeout(() => setPinSyncStatus(null), 4000)
    }
  }

  // Banish a feed pin from /look permanently (ads that slipped through a
  // feed window, video-pin stills, anything unwanted). Sends the FULL
  // updated hidden list so consecutive clicks compose safely.
  const handleHidePin = async (id: string) => {
    const prev = pinFeed
    const prevHidden = hiddenIdsRef.current
    hiddenIdsRef.current = Array.from(new Set([...prevHidden, id]))
    setPinFeed(list => list.filter(p => p.id !== id))
    try {
      const res = await fetch('/api/look-pinterest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-hidden', hidden: hiddenIdsRef.current }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setPinSyncStatus('✓ Hidden from Look (public page updates within a minute)')
    } catch {
      setPinFeed(prev)
      hiddenIdsRef.current = prevHidden
      setPinSyncStatus('✗ Hide failed')
    } finally {
      setTimeout(() => setPinSyncStatus(null), 3000)
    }
  }

  // Load existing gallery items
  useEffect(() => {
    fetch('/api/look')
      .then(r => r.json())
      .then(data => setExistingItems(data.items || []))
      .catch(() => {})
  }, [])

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    setStatus(null)
    try {
      const { url, fileName } = await uploadFileToBlob(selectedFile, 'look', credits, setStatus)
      // The file is now in Blob, but /api/look GET walks meta blobs to find
      // items — without registering the item server-side it would vanish on
      // reload. Call /api/look with add-item to write the meta blob.
      const regRes = await fetch('/api/look', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add-item',
          fileName,
          path: url,
          credits,
          link,
        }),
      })
      if (!regRes.ok) {
        let detail = `HTTP ${regRes.status}`
        try { detail += ': ' + (await regRes.text()).slice(0, 200) } catch {}
        throw new Error(`Register failed (${detail})`)
      }
      setStatus(`✓ Uploaded: ${fileName}`)
      setExistingItems(prev => [{ fileName, path: url, credits, link }, ...prev])
      setSelectedFile(null)
      setCredits('')
      setLink('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      // Surface the actual reason rather than a generic "Upload failed".
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Look upload failed:', err)
      setStatus(`✗ Upload failed: ${msg}`)
    } finally {
      setUploading(false)
    }
  }

  const saveOrder = async (items: typeof existingItems) => {
    const order = items.map(i => i.fileName)
    await fetch('/api/look', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder', order }),
    })
  }

  const handleDrop = (dropIdx: number) => {
    if (dragIdx === null || dragIdx === dropIdx) return
    const arr = [...existingItems]
    const [item] = arr.splice(dragIdx, 1)
    arr.splice(dropIdx, 0, item)
    setExistingItems(arr)
    saveOrder(arr)
    setDragIdx(null)
    setDragOverIdx(null)
  }

  const isVideo = (path: string) => /\.(mp4|webm|mov)$/i.test(path)

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-white text-[14px] font-bold uppercase tracking-[0.1em]">Look Gallery</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePinterestSync}
            disabled={pinSyncing}
            className="px-3 py-1.5 rounded-full text-[8px] uppercase tracking-[0.12em] font-bold text-white/70 border border-white/15 hover:border-white/30 hover:text-white/90 hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-wait"
            title="Pull the latest pins from the Pinterest board now (otherwise refreshes every 6h)"
          >
            {pinSyncing ? '⏳ Syncing…' : '↻ Sync Pinterest'}
          </button>
          <a href="/look" target="_blank" className="text-white/30 text-[8px] uppercase tracking-[0.1em] hover:text-white/60 transition-colors">
            View Page →
          </a>
        </div>
      </div>
      {pinSyncStatus && (
        <p className={`text-[9px] mb-2 ${pinSyncStatus.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{pinSyncStatus}</p>
      )}
      <p className="text-white/30 text-[9px] leading-[1.6] mb-4">Drag thumbnails to reorder. Upload new files below. Pinterest pins feed in automatically (every 6h or via Sync).</p>

      {/* Pinterest feed — every pin currently showing on /look. The ✕
          hides that pin from the site permanently (ads that snuck into a
          feed window, video-pin stills, anything unwanted). */}
      {pinFeed.length > 0 && (
        <div className="mb-5">
          <p className="text-white/50 text-[8px] uppercase tracking-[0.12em] font-bold mb-2">
            Pinterest feed ({pinFeed.length}) <span className="text-white/25 font-normal normal-case tracking-normal">— ✕ hides a pin from the Look page for good</span>
          </p>
          <div className="grid grid-cols-6 gap-1.5">
            {pinFeed.map(pin => (
              <div
                key={pin.id}
                className="relative rounded-md overflow-hidden group"
                style={{ aspectRatio: '1', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pin.src} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                <button
                  onClick={() => handleHidePin(pin.id)}
                  title="Hide from Look"
                  className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'rgba(248,113,113,0.9)' }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing media — draggable thumbnail grid */}
      {existingItems.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-5">
          {existingItems.map((item, i) => (
            <div
              key={item.fileName}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i) }}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
              className="relative rounded-lg overflow-hidden cursor-grab active:cursor-grabbing group"
              style={{
                aspectRatio: '1',
                opacity: dragIdx === i ? 0.3 : 1,
                border: dragOverIdx === i ? '2px solid rgba(59,130,246,0.6)' : '1px solid rgba(255,255,255,0.08)',
                transition: 'opacity 0.15s, border 0.15s',
              }}
            >
              {isVideo(item.path) ? (
                <video src={item.path} className="w-full h-full object-cover" muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.path} alt="" className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5">
                <span className="text-white/70 text-[7px] font-mono">{String(i + 1).padStart(2, '0')}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingLookIdx(editingLookIdx === i ? null : i) }}
                  className="px-2 py-0.5 rounded text-[6px] uppercase tracking-wider font-bold text-white/70 border border-white/20 hover:bg-white/10 transition-all"
                >
                  Edit
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (!confirm('Delete this item?')) return
                    try {
                      const res = await fetch('/api/look', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          action: 'remove-item',
                          fileName: item.fileName,
                          url: item.path,
                        }),
                      })
                      if (!res.ok) throw new Error(`HTTP ${res.status}`)
                      const updated = existingItems.filter((_, j) => j !== i)
                      setExistingItems(updated)
                      saveOrder(updated)
                      setStatus('✓ Deleted')
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : String(err)
                      setStatus(`✗ Delete failed: ${msg}`)
                    }
                  }}
                  className="px-2 py-0.5 rounded text-[6px] uppercase tracking-wider font-bold text-red-400/70 border border-red-400/20 hover:bg-red-400/10 transition-all"
                >
                  Delete
                </button>
              </div>
              {item.credits && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5">
                  <span className="text-white/50 text-[6px] truncate block">{item.credits}</span>
                </div>
              )}
              {/* Inline edit panel */}
              {editingLookIdx === i && (
                <div
                  className="absolute inset-0 bg-black/90 p-2 flex flex-col gap-1.5 z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    defaultValue={item.credits || ''}
                    placeholder="Credits"
                    onBlur={async (e) => {
                      const newCredits = e.target.value
                      await fetch('/api/look', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'update-item', fileName: item.fileName, credits: newCredits }),
                      })
                      setExistingItems(prev => prev.map((it, j) => j === i ? { ...it, credits: newCredits } : it))
                    }}
                    className="w-full px-2 py-1 rounded text-[8px] bg-white/10 border border-white/15 text-white outline-none"
                  />
                  <input
                    type="text"
                    defaultValue={item.link || ''}
                    placeholder="Link URL"
                    onBlur={async (e) => {
                      const newLink = e.target.value
                      await fetch('/api/look', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'update-item', fileName: item.fileName, link: newLink }),
                      })
                      setExistingItems(prev => prev.map((it, j) => j === i ? { ...it, link: newLink } : it))
                    }}
                    className="w-full px-2 py-1 rounded text-[8px] bg-white/10 border border-white/15 text-white outline-none"
                  />
                  <button
                    onClick={() => setEditingLookIdx(null)}
                    className="text-[7px] text-white/40 hover:text-white/70 uppercase tracking-wider mt-auto"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {existingItems.length === 0 && (
        <p className="text-white/15 text-[9px] py-4 text-center mb-4">No items in gallery yet.</p>
      )}

      {/* Save button */}
      {existingItems.length > 0 && (
        <button
          onClick={async () => {
            await saveOrder(existingItems)
            // Also clean up: tell the API which files should exist
            try {
              await fetch('/api/look', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync', items: existingItems.map(i => i.fileName) }),
              })
            } catch {}
            setStatus('✓ Gallery saved')
            setTimeout(() => setStatus(null), 2000)
          }}
          className="w-full py-2.5 mb-4 rounded-full text-[9px] uppercase tracking-[0.12em] font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)' }}
        >
          Save Gallery
        </button>
      )}

      {/* Upload form */}
      <div className="p-3 rounded-lg border border-white/8 space-y-3">
        <p className="text-white/40 text-[8px] uppercase tracking-[0.1em] font-bold">Add New</p>
        <div className="flex items-center gap-3">
          <label className="px-3 py-1.5 rounded-full text-[8px] uppercase tracking-[0.1em] font-bold text-white/50 border border-white/15 cursor-pointer hover:border-white/30 transition-all">
            Browse
            <input ref={fileRef} type="file" className="hidden" accept="image/*,video/*" onChange={(e) => { if (e.target.files?.[0]) setSelectedFile(e.target.files[0]) }} />
          </label>
          <span className="text-white/30 text-[9px] truncate flex-1">{selectedFile?.name || 'No file'}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="text" value={credits} onChange={(e) => setCredits(e.target.value)} className="px-3 py-1.5 rounded-lg text-[10px] bg-white/5 border border-white/10 text-white placeholder-white/20 outline-none" placeholder="Credits" />
          <input type="text" value={link} onChange={(e) => setLink(e.target.value)} className="px-3 py-1.5 rounded-lg text-[10px] bg-white/5 border border-white/10 text-white placeholder-white/20 outline-none" placeholder="Link URL" />
        </div>
        <button onClick={handleUpload} disabled={!selectedFile || uploading} className="w-full py-2 rounded-full text-[8px] uppercase tracking-[0.1em] font-bold transition-all" style={{ background: selectedFile ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)', color: selectedFile ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)' }}>
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        {status && <p className={`text-[9px] ${status.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{status}</p>}
      </div>
    </div>
  )
}

type MiscItem = {
  src: string
  type: 'image' | 'video'
  title: string
  year: number
  medium: string[]
  fileName: string
}

function MiscUploadPanel() {
  const [items, setItems] = useState<MiscItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newYear, setNewYear] = useState(new Date().getFullYear())
  const [newMedium, setNewMedium] = useState<string[]>(['3D'])
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  // Grid vs list, and which items point at something that is no longer
  // there. Missing is checked on demand rather than on load — it is a
  // request per item, and most of the time you are here to upload.
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const [checking, setChecking] = useState(false)
  const [checked, setChecked] = useState(false)
  const miscFileRef = useRef<HTMLInputElement>(null)
  // Focused when an upload is attempted with no project name, so the
  // message and the field you need to fill are the same place.
  const projectFieldRef = useRef<HTMLInputElement>(null)
  // Drag-to-reorder state
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  // Multi-select for batch operations
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // Index of the most-recently toggled row — anchor for shift-click range selection.
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null)
  // Bulk-edit panel inputs (kept separate from the new-upload form's state)
  const [bulkYear, setBulkYear] = useState<string>('')
  const [bulkMedium, setBulkMedium] = useState<string[]>([])
  const [bulkApplyMedium, setBulkApplyMedium] = useState(false)
  // Project (title) bulk-assignment toggle + value, mirrored to the
  // toolbar so N selected items can be tagged to one project in one
  // commit. Same datalist as the project-rename pills below.
  const [bulkProject, setBulkProject] = useState<string>('')
  // Inline rename UX — `renamingProject` is the title currently being
  // renamed (null = not editing). renameValue holds the new text. Commit
  // cascades through every item that shares that title.
  const [renamingProject, setRenamingProject] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Derive a clean human title from a filename when the user hasn't supplied
  // one — strip the extension, swap separators for spaces, collapse repeats.
  const titleFromFilename = (name: string): string =>
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const mediumOptions = ['3D', 'Generative', 'Motion', 'Illustration', 'Photography', 'Mixed']

  const inputStyle = "w-full px-3 py-2 rounded-lg text-[11px] bg-white/5 border border-white/10 text-white placeholder-white/20 outline-none focus:border-white/25 transition-colors"
  const labelStyle = "text-white/50 text-[8px] uppercase tracking-[0.12em] block mb-1"

  // Load existing items
  useEffect(() => {
    fetch('/api/misc')
      .then(r => r.json())
      .then(data => { setItems(data.items || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Save items with optional tombstones. Tombstones are blob URLs that
  // should NEVER auto-surface back onto /misc — used so user-initiated
  // deletes here stay deleted even when the same URL is also referenced
  // by a featured project (the /misc page falls back to project media
  // for clients that have no explicit misc entries; without tombstones,
  // that fallback resurrects deletions on the next reload).
  /**
   * A failed save used to do nothing at all — no throw, no message, and
   * the optimistic setItems() left the screen showing the edit that never
   * landed. You'd change a name, see it change, reload, and find it gone
   * with no clue why. Failures are loud now, and they say so on screen.
   *
   * Returns whether it saved, so callers can avoid reporting success.
   */
  /**
   * Ask storage which of these actually still exist.
   *
   * A row and the file under it are separate things: uploading to a
   * featured project mirrors a row into Misc pointing at the SAME file,
   * so deleting the media from the project takes the file and leaves the
   * row behind, pointing at nothing. That is what a broken tile here is
   * — not a lost record, a record whose subject is gone.
   */
  const checkMissing = async () => {
    setChecking(true); setStatus(null)
    const dead = new Set<string>()
    await Promise.all(items.map(async it => {
      if (!it.src) return
      try {
        const res = await fetch(it.src, { method: 'HEAD' })
        if (!res.ok) dead.add(it.src)
      } catch {
        dead.add(it.src)
      }
    }))
    setMissing(dead); setChecked(true); setChecking(false)
    setStatus(dead.size
      ? `${dead.size} of ${items.length} point at a file that is gone.`
      : `All ${items.length} are present.`)
  }

  /** Remove every row whose file is gone, tombstoned so the mirror
   *  cannot put them straight back. */
  const deleteMissing = async () => {
    const dead = items.filter(it => missing.has(it.src))
    if (!dead.length) return
    const kept = items.filter(it => !missing.has(it.src))
    const ok = await saveItems(kept, dead.map(d => d.src))
    if (ok) {
      setMissing(new Set())
      setStatus(`Removed ${dead.length}.`)
      window.dispatchEvent(new Event('admin-saved'))
    }
  }

  const saveItems = async (updated: MiscItem[], tombstones: string[] = []): Promise<boolean> => {
    try {
      const res = await fetch('/api/misc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updated, tombstones }),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        setStatus(`✗ NOT SAVED — server said ${res.status}. ${detail.slice(0, 120)}`)
        return false
      }
      const data = await res.json()
      // Trust the server's echo, not the local guess: if the two ever
      // disagree, what's on screen matches what's actually stored.
      setItems(data.items)
      return true
    } catch (err) {
      setStatus(`✗ NOT SAVED — ${String(err).slice(0, 140)}`)
      return false
    }
  }

  // Slugify a string for use as part of a Blob pathname. Lowercase,
  // alphanumerics + hyphens only, length-capped.
  const slugify = (s: string, max = 50): string =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'file'

  // Core bulk upload — accepts a FileList from either the picker or a drop
  // event. Title is optional: when blank, each file's title is derived from
  // its filename (so dragging in 20 files at once just works). Year + medium
  // selections always apply to all files in the batch — to give files
  // different mediums, edit them individually in the list afterwards.
  //
  // Uploads go DIRECTLY from the browser to Vercel Blob via
  // @vercel/blob/client's `upload()` — the file bytes never pass through our
  // serverless function, sidestepping Vercel Hobby's 4.5 MB function-payload
  // cap. Our /api/upload-token route only mints short-lived upload tokens.
  const uploadBatch = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    setUploading(true)
    setUploadProgress({ done: 0, total: list.length })
    setStatus(null)

    let currentItems = [...items]
    let uploadCount = 0

    for (let i = 0; i < list.length; i++) {
      const file = list[i]
      const titleForFile = newTitle.trim() || titleFromFilename(file.name)

      // MP4 → WebM in the browser before upload (no-op for non-MP4 files).
      if (isMp4(file)) {
        setStatus(`(${i + 1}/${list.length}) Converting ${file.name}…`)
      }
      const ready = await prepareForUpload(file, (msg) =>
        setStatus(`(${i + 1}/${list.length}) ${msg}`),
      )

      // Build a stable Blob pathname: media/Misc/<slug>-<timestamp><ext>
      const extMatch = ready.name.match(/\.[^.]+$/)
      const ext = extMatch ? extMatch[0].toLowerCase() : ''
      const pathname = `media/Misc/${slugify(titleForFile)}-${Date.now().toString(36)}${i}${ext}`

      try {
        const blob = await upload(pathname, ready, {
          access: 'public',
          handleUploadUrl: '/api/upload-token',
        })
        const isVideo = ready.type.startsWith('video') || /\.(mp4|webm|mov)$/i.test(ready.name)
        const newItem: MiscItem = {
          src: blob.url,
          type: isVideo ? 'video' : 'image',
          title: titleForFile,
          year: newYear,
          medium: newMedium.length ? newMedium : ['3D'],
          fileName: blob.pathname.split('/').pop() || pathname.split('/').pop() || ready.name,
        }
        currentItems = [...currentItems, newItem]
        uploadCount++
      } catch (err) {
        console.error('Upload failed for', file.name, err)
      }

      // Persist after each file so a network blip mid-batch doesn't lose
      // already-uploaded files; the UI also stays responsive.
      setItems(currentItems)
      setUploadProgress({ done: i + 1, total: list.length })
    }

    if (uploadCount > 0) await saveItems(currentItems)

    setUploading(false)
    setUploadProgress(null)
    setNewTitle('')
    const failed = list.length - uploadCount
    setStatus(
      failed === 0
        ? `✓ Uploaded ${uploadCount} file${uploadCount !== 1 ? 's' : ''}`
        : `✓ ${uploadCount} uploaded · ✗ ${failed} failed`,
    )
    if (miscFileRef.current) miscFileRef.current.value = ''
    setTimeout(() => setStatus(null), 3000)
  }

  /**
   * Nothing gets uploaded without a project name.
   *
   * It used to fall back to the filename, which means every drop landed as
   * its own project called something like `shotc-webm-001-mp94uxzi0` — the
   * project list filled up with 23 one-item projects nobody named. Asking
   * once, before the files go anywhere, costs a sentence and saves the
   * batch-rename afterwards.
   */
  const requireProject = (): boolean => {
    if (newTitle.trim()) return true
    setStatus('✗ Name the project first — the field above the button')
    setTimeout(() => setStatus(null), 3200)
    projectFieldRef.current?.focus()
    return false
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) await uploadBatch(e.target.files)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (!e.dataTransfer.files?.length) return
    if (!requireProject()) return
    await uploadBatch(e.dataTransfer.files)
  }

  const handleDelete = async (idx: number) => {
    const removedSrc = items[idx]?.src
    const updated = items.filter((_, i) => i !== idx)
    setItems(updated)
    // Tombstone the removed URL so the /misc page's auto-surface fallback
    // can't re-add it from a featured project on next reload.
    if (!(await saveItems(updated, removedSrc ? [removedSrc] : []))) return
    void deleteBlobUrls([removedSrc])
    setStatus('✓ Removed')
    setTimeout(() => setStatus(null), 1500)
  }

  // Drag-and-drop reorder. Single-item move: splice from→to. Multi-item move:
  // when the dragged row is part of a selection, all selected items travel as
  // a group to the drop position (in their existing relative order). This
  // matches the bulk-reorder UX the misc panel asks for.
  const reorderItem = async (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return

    // If the dragged row is part of the current selection, treat ALL selected
    // rows as the move set. Otherwise just move the single dragged row.
    const movingIndices = selected.has(from)
      ? Array.from(selected).sort((a, b) => a - b)
      : [from]

    // Pull out the items we're moving (preserve their existing order).
    const movingSet = new Set(movingIndices)
    const movedItems = movingIndices.map(i => items[i])
    const remaining = items.filter((_, i) => !movingSet.has(i))

    // The original `to` was an index into the full array. Adjust for the
    // moving-items removed from positions BEFORE `to`.
    const removedBefore = movingIndices.filter(i => i < to).length
    const insertAt = Math.max(0, Math.min(remaining.length, to - removedBefore))

    const updated = [
      ...remaining.slice(0, insertAt),
      ...movedItems,
      ...remaining.slice(insertAt),
    ]
    setItems(updated)
    await saveItems(updated)

    // Update the selected set so the moved rows stay selected at their new
    // positions (otherwise the highlight follows the original indices).
    if (movingIndices.length > 1) {
      const newSelected = new Set<number>()
      for (let i = 0; i < movedItems.length; i++) newSelected.add(insertAt + i)
      setSelected(newSelected)
      setLastSelectedIdx(insertAt + movedItems.length - 1)
    }
  }

  // Toggle a single row, or shift-click to select the range from the last
  // toggled row to this one. The range fills in everything between (inclusive),
  // matching the standard list-multi-select pattern from native file managers.
  const toggleSelected = (idx: number, shiftKey = false) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (shiftKey && lastSelectedIdx !== null && lastSelectedIdx !== idx) {
        const [lo, hi] = lastSelectedIdx < idx ? [lastSelectedIdx, idx] : [idx, lastSelectedIdx]
        // Decide direction: if the anchor was selected, we ADD the range;
        // otherwise we REMOVE it (so shift-click can also bulk-deselect).
        const adding = prev.has(lastSelectedIdx)
        for (let i = lo; i <= hi; i++) {
          if (adding) next.add(i)
          else next.delete(i)
        }
      } else {
        if (next.has(idx)) next.delete(idx)
        else next.add(idx)
      }
      return next
    })
    setLastSelectedIdx(idx)
  }
  const toggleSelectAll = () => {
    setSelected(prev => (prev.size === items.length ? new Set() : new Set(items.map((_, i) => i))))
    setLastSelectedIdx(null)
  }
  const clearSelected = () => {
    setSelected(new Set())
    setLastSelectedIdx(null)
  }

  // Apply year and/or medium to every selected item. Year only updates if
  // bulkYear is non-empty; medium only updates if `bulkApplyMedium` is on
  // (otherwise medium changes might unintentionally erase existing tags when
  // the user only meant to update the year).
  const applyBulkEdit = async () => {
    if (selected.size === 0) return
    const yearNum = bulkYear.trim() ? parseInt(bulkYear, 10) : null
    const projectTitle = bulkProject.trim()
    const updated = items.map((item, i) => {
      if (!selected.has(i)) return item
      const next = { ...item }
      if (yearNum !== null && !isNaN(yearNum)) next.year = yearNum
      if (bulkApplyMedium) next.medium = bulkMedium.length ? bulkMedium : ['3D']
      if (projectTitle) next.title = projectTitle
      return next
    })
    setItems(updated)
    if (!(await saveItems(updated))) return
    setStatus(`✓ Updated ${selected.size} item${selected.size !== 1 ? 's' : ''}`)
    setBulkYear('')
    setBulkApplyMedium(false)
    setBulkProject('')
    setTimeout(() => setStatus(null), 2000)
  }

  const bulkDelete = async () => {
    if (selected.size === 0) return
    const updated = items.filter((_, i) => !selected.has(i))
    setItems(updated)
    if (!(await saveItems(updated))) return
    setStatus(`✓ Deleted ${selected.size} item${selected.size !== 1 ? 's' : ''}`)
    clearSelected()
    setTimeout(() => setStatus(null), 2000)
  }

  // Bulk download — zips up either the selected items or (if nothing
  // selected) every item in the panel. Pulls the actual source files from
  // Vercel Blob, no watermarking.
  const [downloadingBulk, setDownloadingBulk] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null)
  const bulkDownload = async () => {
    if (downloadingBulk) return
    const targets = selected.size > 0
      ? items.filter((_, i) => selected.has(i))
      : items
    if (targets.length === 0) return
    setDownloadingBulk(true)
    setDownloadProgress({ done: 0, total: targets.length })
    setStatus(null)
    try {
      await downloadAssetsZip(
        targets.map((item, i) => ({
          // Prefer the title slugified, fall back to the stored fileName so
          // the receiver gets meaningful names even if title is blank.
          name: (item.title || item.fileName || `misc_${i + 1}`).toString(),
          url: item.src as string,
        })),
        `misc_${new Date().toISOString().slice(0, 10)}_${targets.length}files`,
        (done, total) => setDownloadProgress({ done, total }),
      )
      setStatus(`✓ Downloaded ${targets.length} file${targets.length !== 1 ? 's' : ''}`)
    } catch (err) {
      console.error('Bulk download failed:', err)
      setStatus('✗ Download failed')
    } finally {
      setDownloadingBulk(false)
      setDownloadProgress(null)
      setTimeout(() => setStatus(null), 2500)
    }
  }

  const handleEditSave = async (idx: number) => {
    const updated = [...items]
    updated[idx] = { ...updated[idx], title: newTitle || updated[idx].title, year: newYear, medium: newMedium }
    setItems(updated)
    if (!(await saveItems(updated))) return
    setEditIdx(null)
    setStatus('✓ Updated')
    setTimeout(() => setStatus(null), 1500)
  }

  // Distinct project titles + how many items use each — drives both the
  // top-of-panel Projects strip (rename in place) and the datalist that
  // feeds the per-item + bulk title editors.
  const projectsList = useMemo(() => {
    const counts = new Map<string, number>()
    items.forEach(item => {
      const t = (item.title || '').trim()
      if (!t) return
      counts.set(t, (counts.get(t) || 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items])

  /**
   * Reshuffle the running order.
   *
   * By PROJECT, not by piece: the projects come out in a new order and
   * each one's pieces travel with it, shuffled among themselves. A flat
   * random sort scatters a project's thirty stills the length of the page,
   * which reads as a mess rather than a reshuffle. Untagged items move
   * together as their own group.
   *
   * Writes the new order rather than randomising on render, so what you
   * approve here is what the page shows — and it survives a reload.
   */
  const shuffleProjects = async () => {
    const groups = new Map<string, MiscItem[]>()
    for (const item of items) {
      const key = (item.title || '').trim()
      const bucket = groups.get(key)
      if (bucket) bucket.push(item)
      else groups.set(key, [item])
    }
    const scramble = <T,>(xs: T[]): T[] => {
      const out = [...xs]
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out
    }
    const shuffled = scramble(Array.from(groups.values())).flatMap(scramble)
    setItems(shuffled)
    // Order is positional, so the selection's indices no longer point at
    // the rows the user picked. Dropping it beats silently reassigning it.
    setSelected(new Set())
    setLastSelectedIdx(null)
    if (!(await saveItems(shuffled))) return
    setStatus(`✓ Shuffled ${groups.size} project${groups.size === 1 ? '' : 's'}`)
    setTimeout(() => setStatus(null), 2200)
  }

  /**
   * Clicking a project selects everything in it.
   *
   * This is how you fold projects together: click the chips you want
   * merged, type the shared name into "Set project", Apply. It's also how
   * you add existing work to a project without hunting for its rows —
   * which matters when the same project's files aren't next to each other
   * in the list. Clicking an already-fully-selected project deselects it.
   */
  const selectProject = (name: string) => {
    const idxs = items
      .map((it, i) => ((it.title || '').trim() === name ? i : -1))
      .filter(i => i >= 0)
    setSelected(prev => {
      const next = new Set(prev)
      const allIn = idxs.every(i => next.has(i))
      for (const i of idxs) {
        if (allIn) next.delete(i)
        else next.add(i)
      }
      return next
    })
    // The anchor belongs to click-a-row ranges; a chip isn't a row.
    setLastSelectedIdx(null)
  }

  /**
   * Delete a project — the grouping, not the work.
   *
   * Its files stay in Misc and become untagged, because "I don't want
   * this project any more" almost never means "destroy the renders". If
   * you do want the files gone, select the rows and use Delete, which
   * says so and removes the blobs.
   */
  const deleteProject = async (name: string, count: number) => {
    const ok = window.confirm(
      `Delete the project "${name}"?\n\n` +
      `Its ${count} file${count === 1 ? '' : 's'} stay in Misc and become untagged — ` +
      `nothing is removed from storage.`,
    )
    if (!ok) return
    const updated = items.map(item =>
      (item.title || '').trim() === name ? { ...item, title: '' } : item,
    )
    setItems(updated)
    if (!(await saveItems(updated))) return
    setStatus(`✓ Deleted project "${name}" — ${count} file${count === 1 ? '' : 's'} kept`)
    setTimeout(() => setStatus(null), 2600)
  }

  // Cascade rename — every item whose title matches `renamingProject`
  // gets the new title. Commits through saveItems so it lands in the
  // misc blob in one write.
  const applyProjectRename = async () => {
    if (!renamingProject) return
    const next = renameValue.trim()
    if (!next || next === renamingProject) {
      setRenamingProject(null)
      return
    }
    const updated = items.map(item =>
      (item.title || '').trim() === renamingProject ? { ...item, title: next } : item,
    )
    setItems(updated)
    if (!(await saveItems(updated))) return
    setRenamingProject(null)
    setStatus(`✓ Renamed "${renamingProject}" → "${next}"`)
    setTimeout(() => setStatus(null), 2200)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-white text-[14px] font-bold uppercase tracking-[0.1em] mb-1">Misc / Experiments</h2>
          <p className="text-white/30 text-[9px]">
            {items.length} pieces — click a row to select, shift+click for a range
          </p>
        </div>
        {/* View + health. Grid is for seeing what is actually in here;
            the check is for finding rows whose file has gone. */}
        {items.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-full border border-white/15 overflow-hidden">
              {(['list', 'grid'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-[8px] uppercase tracking-[0.12em] font-bold transition-colors ${
                    view === v ? 'bg-white text-black' : 'text-white/60 hover:text-white/90'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <button
              onClick={checkMissing}
              disabled={checking}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] uppercase tracking-[0.12em] font-bold text-white/70 border border-white/15 hover:border-white/30 hover:text-white/90 hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-wait"
              title="Ask storage which of these files still exist"
            >
              {checking ? `Checking ${items.length}…` : '⚑ Find missing media'}
            </button>
            {missing.size > 0 && (
              <button
                onClick={deleteMissing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] uppercase tracking-[0.12em] font-bold transition-all"
                style={{ color: '#fca5a5', border: '1px solid rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.08)' }}
                title="Remove those rows and tombstone them so the project mirror cannot re-add them"
              >
                ✕ Delete {missing.size} missing
              </button>
            )}
            {checked && missing.size === 0 && (
              <span className="text-emerald-400/70 text-[8px] uppercase tracking-[0.12em]">All present</span>
            )}
          </div>
        )}

        {/* Grid view — thumbnails, with anything whose file has gone
            called out rather than shown as a silent black square. */}
        {view === 'grid' && items.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {items.map((it, i) => {
              const gone = missing.has(it.src)
              return (
                <div
                  key={it.src + i}
                  className="relative rounded-md overflow-hidden aspect-square"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: gone ? '1px solid rgba(248,113,113,0.55)' : '1px solid rgba(255,255,255,0.08)',
                  }}
                  title={`${it.title || 'Untitled'} — ${it.src.split('/').pop()}`}
                >
                  {it.type === 'video' ? (
                    <video src={it.src} muted playsInline preload="metadata"
                      className="w-full h-full object-cover" style={{ opacity: gone ? 0.15 : 1 }} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.src} alt={it.title || ''} loading="lazy"
                      className="w-full h-full object-cover" style={{ opacity: gone ? 0.15 : 1 }} />
                  )}
                  {gone && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-1"
                      style={{ background: 'rgba(120,20,20,0.35)' }}>
                      <span className="text-[7px] uppercase tracking-[0.14em] font-bold" style={{ color: '#fca5a5' }}>
                        File gone
                      </span>
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 text-[7px] text-white/70 truncate"
                    style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.75))' }}>
                    {it.title || 'Untitled'}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {items.length > 0 && selected.size === 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={shuffleProjects}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] uppercase tracking-[0.12em] font-bold text-white/70 border border-white/15 hover:border-white/30 hover:text-white/90 hover:bg-white/5 transition-all"
              title="Reshuffle which project leads — pieces stay with their project"
            >
              ⤮ Shuffle order
            </button>
            <button
              onClick={bulkDownload}
              disabled={downloadingBulk}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] uppercase tracking-[0.12em] font-bold text-white/70 border border-white/15 hover:border-white/30 hover:text-white/90 hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-wait"
              title="Download every original file in this panel as a ZIP"
            >
              {downloadingBulk
                ? (downloadProgress ? `⏳ ${downloadProgress.done}/${downloadProgress.total}` : '⏳ Zipping…')
                : `↓ Download all (${items.length})`}
            </button>
          </div>
        )}
      </div>

      {status && (
        <p className={`text-[9px] mb-3 ${status.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{status}</p>
      )}

      {/* Datalist feeds every title input below — per-item edit, bulk
          project assignment, and the rename input on the chips. Just one
          DOM node, referenced by id. */}
      <datalist id="misc-admin-project-tags">
        {projectsList.map(p => (
          <option key={p.name} value={p.name} />
        ))}
      </datalist>

      {/* Projects strip — every distinct title currently in the misc set.
          Click a chip to rename the project; the new name cascades to
          every item that shares the old title. The count shows how many
          items the rename will touch. */}
      {projectsList.length > 0 && (
        <div className="mb-5 p-3 rounded-lg border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-white/60 text-[9px] font-bold uppercase tracking-[0.1em] mb-2">
            Projects{' '}
            <span className="text-white/30 font-normal normal-case tracking-normal">
              — Rename retitles every file in the project. Click a chip (or double-click
              to rename) to select its files; to merge projects, select them then type
              the shared name into “Set project”.
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {projectsList.map(p => (
              renamingProject === p.name ? (
                <div key={p.name} className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/10 border border-white/25">
                  <input
                    autoFocus
                    type="text"
                    value={renameValue}
                    list="misc-admin-project-tags"
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') applyProjectRename()
                      if (e.key === 'Escape') setRenamingProject(null)
                    }}
                    className="bg-transparent text-[10px] text-white outline-none w-36"
                  />
                  <button
                    onClick={applyProjectRename}
                    className="text-green-400 text-[11px] hover:text-green-300"
                    title="Rename across all items"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => setRenamingProject(null)}
                    className="text-white/40 text-[11px] hover:text-white/70"
                    title="Cancel"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                (() => {
                  const idxs = items
                    .map((it, i) => ((it.title || '').trim() === p.name ? i : -1))
                    .filter(i => i >= 0)
                  const active = idxs.length > 0 && idxs.every(i => selected.has(i))
                  return (
                    <span
                      key={p.name}
                      className="inline-flex items-center rounded-full border transition-colors"
                      style={{
                        borderColor: active ? '#ff69b4' : 'rgba(255,255,255,0.15)',
                        background: active ? 'rgba(255,105,180,0.14)' : 'transparent',
                      }}
                    >
                      <button
                        onClick={() => selectProject(p.name)}
                        onDoubleClick={() => { setRenamingProject(p.name); setRenameValue(p.name) }}
                        className="pl-2.5 pr-1.5 py-1 text-[9px] uppercase tracking-[0.08em] font-bold text-white/75 hover:text-white"
                        title={`Click: select the ${p.count} file${p.count !== 1 ? 's' : ''} in "${p.name}" · Double-click: rename`}
                      >
                        {p.name} <span className="opacity-50 font-mono ml-1">·{p.count}</span>
                      </button>
                      {/* Spelled out, not a ✎. Clicking the chip used to
                          rename outright; making it select instead moved
                          the most-used action onto a 9px glyph at 35%
                          opacity, which is no better than hiding it. */}
                      <button
                        onClick={() => { setRenamingProject(p.name); setRenameValue(p.name) }}
                        className="px-1.5 py-1 text-[8px] uppercase tracking-[0.08em] font-bold text-white/45 hover:text-white border-l border-white/10"
                        title={`Rename "${p.name}" across ${p.count} item${p.count !== 1 ? 's' : ''}`}
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => deleteProject(p.name, p.count)}
                        className="pl-1.5 pr-2 py-1 text-[10px] text-white/35 hover:text-red-400 border-l border-white/10"
                        title={`Delete the project "${p.name}" — its files stay in Misc`}
                      >
                        ✕
                      </button>
                    </span>
                  )
                })()
              )
            ))}
          </div>
        </div>
      )}

      {/* Upload new — supports drag & drop OR file picker, single OR many.
          When Title is blank, each uploaded file gets a title derived from
          its filename (so dragging 20 files in just works). */}
      <div
        className="mb-5 p-4 rounded-lg border border-white/10 bg-white/3 space-y-3 transition-colors"
        style={dragOver ? { borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)' } : {}}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={(e) => {
          // Only un-highlight if we're leaving the container itself, not a child
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          setDragOver(false)
        }}
        onDrop={handleDrop}
      >
        <p className="text-white/60 text-[9px] font-bold uppercase tracking-[0.1em]">
          Add Pieces <span className="text-white/30 font-normal normal-case tracking-normal">— drop files here or pick below</span>
        </p>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelStyle}>
              Project <span className="text-white/25">(required — existing or new)</span>
            </label>
            <input
              ref={projectFieldRef}
              type="text"
              value={newTitle}
              list="misc-admin-project-tags"
              onChange={e => setNewTitle(e.target.value)}
              className={inputStyle}
              placeholder="e.g. Lay By Nights"
            />
          </div>
          <div>
            <label className={labelStyle}>Year</label>
            <input type="number" value={newYear} onChange={e => setNewYear(parseInt(e.target.value) || 2026)} className={inputStyle} />
          </div>
          <div>
            <label className={labelStyle}>Medium (select multiple)</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {mediumOptions.map(m => (
                <button
                  key={m}
                  onClick={() => setNewMedium(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                  className="px-2.5 py-1 rounded-full text-[7px] uppercase tracking-[0.1em] font-bold transition-all"
                  style={{
                    background: newMedium.includes(m) ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${newMedium.includes(m) ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    color: newMedium.includes(m) ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        <input
          ref={miscFileRef}
          type="file"
          className="hidden"
          accept="image/*,video/*"
          multiple
          onChange={handleUpload}
        />
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (uploading) return
              if (!requireProject()) return
              miscFileRef.current?.click()
            }}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[8px] uppercase tracking-[0.12em] font-bold cursor-pointer transition-all hover:scale-105 text-white/70 disabled:opacity-50 disabled:cursor-wait disabled:hover:scale-100"
            style={{ border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)' }}
          >
            {uploading
              ? uploadProgress
                ? `⏳ ${uploadProgress.done} of ${uploadProgress.total}`
                : '⏳ Uploading…'
              : '+ Choose files (multi-select OK)'}
          </button>
          {uploadProgress && uploadProgress.total > 0 && (
            <div className="flex-1 h-1 rounded-full bg-white/8 overflow-hidden">
              <div
                className="h-full bg-white/60 transition-all duration-200 ease-out"
                style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Bulk-edit toolbar — appears whenever rows are selected */}
      {selected.size > 0 && (
        <div className="mb-3 p-3 rounded-lg border border-white/15 bg-white/5 flex flex-wrap items-center gap-3">
          <span className="text-white/80 text-[9px] font-bold uppercase tracking-[0.1em]">
            {selected.size} selected
          </span>
          {selected.size > 1 && (
            <span className="text-white/35 text-[8px] uppercase tracking-[0.1em]">
              · drag any of them to move all together
            </span>
          )}
          <button onClick={clearSelected} className="text-white/40 text-[8px] uppercase tracking-[0.1em] hover:text-white">
            Clear
          </button>
          <div className="h-3 w-px bg-white/15" />
          {/* No enable-checkbox here. Text in the field IS the intent —
              gating it behind a 7px tickbox made the one control people
              actually came for look broken. Type an existing project to
              add to it, or a new name to start one. Empty = untouched. */}
          <label className="text-white/40 text-[7px] uppercase tracking-[0.12em]">Set project:</label>
          <input
            type="text"
            value={bulkProject}
            list="misc-admin-project-tags"
            onChange={e => setBulkProject(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && bulkProject.trim()) applyBulkEdit() }}
            placeholder={`name for all ${selected.size}`}
            className="w-44 px-2 py-1 rounded text-[10px] bg-white/5 border border-white/10 text-white outline-none focus:border-white/25"
          />
          <div className="h-3 w-px bg-white/15" />
          <label className="text-white/40 text-[7px] uppercase tracking-[0.12em]">Set year:</label>
          <input
            type="number"
            value={bulkYear}
            onChange={e => setBulkYear(e.target.value)}
            placeholder="—"
            className="w-16 px-2 py-1 rounded text-[10px] bg-white/5 border border-white/10 text-white outline-none focus:border-white/25"
          />
          <div className="h-3 w-px bg-white/15" />
          <label className="flex items-center gap-1.5 text-white/40 text-[7px] uppercase tracking-[0.12em] cursor-pointer">
            <input
              type="checkbox"
              checked={bulkApplyMedium}
              onChange={e => setBulkApplyMedium(e.target.checked)}
              className="accent-white"
            />
            Set medium:
          </label>
          <div className={`flex gap-1 ${bulkApplyMedium ? '' : 'opacity-40 pointer-events-none'}`}>
            {mediumOptions.map(m => (
              <button
                key={m}
                onClick={() => setBulkMedium(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                className="px-2 py-0.5 rounded-full text-[6px] uppercase tracking-[0.08em] font-bold transition-all"
                style={{
                  background: bulkMedium.includes(m) ? 'rgba(255,255,255,0.15)' : 'transparent',
                  border: `1px solid ${bulkMedium.includes(m) ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  color: bulkMedium.includes(m) ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
                }}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button
            onClick={applyBulkEdit}
            disabled={!bulkYear.trim() && !bulkApplyMedium && !bulkProject.trim()}
            className="px-3 py-1 rounded text-[8px] font-bold text-green-400 border border-green-400/30 hover:bg-green-400/10 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Apply
          </button>
          <button
            onClick={bulkDownload}
            disabled={downloadingBulk}
            className="px-3 py-1 rounded text-[8px] font-bold text-white/80 border border-white/25 hover:bg-white/10 disabled:opacity-40 disabled:cursor-wait"
            title="Download original files for the selected items as a ZIP"
          >
            {downloadingBulk
              ? (downloadProgress ? `⏳ ${downloadProgress.done}/${downloadProgress.total}` : '⏳ Zipping…')
              : `↓ Download (${selected.size})`}
          </button>
          <button
            onClick={bulkDelete}
            className="px-3 py-1 rounded text-[8px] font-bold text-red-400/80 border border-red-400/30 hover:bg-red-400/10"
          >
            Delete
          </button>
        </div>
      )}

      {/* Existing items */}
      <div className="space-y-0">
        <div className="flex items-center text-[7px] uppercase tracking-[0.15em] text-white/25 pb-2 border-b border-white/8 mb-1">
          <span className="w-[3%]"></span>
          <span className="w-[4%] flex items-center">
            <input
              type="checkbox"
              checked={items.length > 0 && selected.size === items.length}
              onChange={toggleSelectAll}
              className="accent-white cursor-pointer"
            />
          </span>
          <span className="w-[4%]">#</span>
          <span className="w-[6%]">Type</span>
          <span className="w-[27%]">Title</span>
          <span className="w-[8%]">Year</span>
          <span className="w-[14%]">Medium</span>
          <span className="w-[18%]">File</span>
          <span className="w-[16%] text-right">Actions</span>
        </div>

        {loading && <p className="text-white/20 text-[9px] py-4 text-center">Loading...</p>}
        {!loading && items.length === 0 && <p className="text-white/15 text-[9px] py-4 text-center">No pieces yet. Upload above.</p>}

        {view === 'list' && items.map((item, i) => {
          // When the user drags a row that's in the selection, the entire
          // selected group travels together. Compute which rows are "in
          // flight" so we can dim them all uniformly during the drag.
          const isMultiDrag = dragSrcIdx !== null && selected.has(dragSrcIdx)
          const isInFlight = dragSrcIdx === i || (isMultiDrag && selected.has(i))
          const isDraggedOver = dragOverIdx === i && dragSrcIdx !== null && !isInFlight
          // Drop indicator on the top edge when dragging downward, bottom edge upward
          const indicatorAbove = isDraggedOver && (dragSrcIdx as number) > i
          const indicatorBelow = isDraggedOver && (dragSrcIdx as number) < i
          return (
          <div key={i}>
            <div
              draggable
              onDragStart={(e) => {
                setDragSrcIdx(i)
                e.dataTransfer.effectAllowed = 'move'
                // Some browsers require data to be set or the drag is rejected
                try { e.dataTransfer.setData('text/plain', String(i)) } catch {}
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (dragSrcIdx === null) return
                // Don't show a drop indicator on rows that are themselves part
                // of the group being dragged — you can't drop a group onto itself.
                if (selected.has(dragSrcIdx) && selected.has(i)) return
                if (dragSrcIdx === i) return
                setDragOverIdx(i)
              }}
              onDragLeave={(e) => {
                // Only clear if we actually left the row (not a child)
                if (e.currentTarget.contains(e.relatedTarget as Node)) return
                setDragOverIdx(prev => prev === i ? null : prev)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragSrcIdx !== null && !isInFlight) reorderItem(dragSrcIdx, i)
                setDragSrcIdx(null)
                setDragOverIdx(null)
              }}
              onDragEnd={() => {
                setDragSrcIdx(null)
                setDragOverIdx(null)
              }}
              // The whole row selects, not just the checkbox. A 4%-wide box
              // with no label is invisible unless you already know it's
              // there, which made shift+select effectively undiscoverable.
              // Buttons and inputs inside the row stopPropagation, so Edit
              // and ✕ still do their own thing.
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button, input, a')) return
                toggleSelected(i, e.shiftKey)
              }}
              className="flex items-center py-2 border-b border-white/5 hover:bg-white/3 transition-colors group"
              style={{
                opacity: isInFlight ? 0.4 : 1,
                background: selected.has(i) ? 'rgba(255,255,255,0.10)' : undefined,
                boxShadow: selected.has(i) ? 'inset 2px 0 0 #ff69b4' : undefined,
                borderTop: indicatorAbove ? '2px solid rgba(255,255,255,0.7)' : undefined,
                borderBottom: indicatorBelow ? '2px solid rgba(255,255,255,0.7)' : '1px solid rgba(255,255,255,0.05)',
                cursor: isInFlight ? 'grabbing' : 'pointer',
              }}
            >
              {/* Drag handle column */}
              <span
                className="w-[3%] text-white/20 group-hover:text-white/60 text-[12px] flex items-center justify-center"
                style={{ cursor: 'grab', lineHeight: 1 }}
                aria-label={selected.has(i) && selected.size > 1 ? `Drag ${selected.size} selected items` : 'Drag to reorder'}
                title={selected.has(i) && selected.size > 1 ? `Drag ${selected.size} selected items together` : 'Drag to reorder'}
              >
                ⋮⋮
              </span>
              {/* Selection checkbox — supports shift-click to select a range */}
              <span className="w-[4%] flex items-center">
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => { /* state changes handled by onClick to capture shiftKey */ }}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSelected(i, e.shiftKey)
                  }}
                  className="accent-white cursor-pointer"
                  title="Click to toggle · Shift+click to select a range"
                />
              </span>
              <span className="w-[4%] text-white/30 text-[8px] font-mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="w-[6%] text-white/40 text-[8px]">{item.type === 'video' ? '🎬' : '🖼'}</span>
              <span className="w-[27%] text-white/80 text-[10px] font-bold truncate pr-2">{item.title}</span>
              <span className="w-[8%] text-white/40 text-[9px] font-mono">{item.year}</span>
              <span className="w-[14%] text-white/40 text-[8px]">{Array.isArray(item.medium) ? item.medium.join(' · ') : item.medium}</span>
              <span className="w-[18%] text-white/20 text-[7px] font-mono truncate">{item.fileName}</span>
              <div className="w-[16%] flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => { setEditIdx(editIdx === i ? null : i); setNewTitle(item.title); setNewYear(item.year); setNewMedium(Array.isArray(item.medium) ? item.medium : [item.medium]) }} className="text-blue-400/50 text-[8px] hover:text-blue-400 ml-1">Edit</button>
                <button onClick={() => handleDelete(i)} className="text-red-400/40 text-[8px] hover:text-red-400 ml-1">✕</button>
              </div>
            </div>
            {/* Inline edit */}
            {editIdx === i && (
              <div className="flex flex-wrap items-center gap-2 py-2 px-4 bg-white/3 border-b border-white/5">
                <input type="text" value={newTitle} list="misc-admin-project-tags" onChange={e => setNewTitle(e.target.value)} className={`${inputStyle} w-32`} placeholder="Title (project tag)" />
                <input type="number" value={newYear} onChange={e => setNewYear(parseInt(e.target.value) || 2026)} className={`${inputStyle} w-16`} />
                <div className="flex gap-1">
                  {mediumOptions.map(m => (
                    <button
                      key={m}
                      onClick={() => setNewMedium(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                      className="px-2 py-0.5 rounded-full text-[6px] uppercase tracking-[0.08em] font-bold transition-all"
                      style={{
                        background: newMedium.includes(m) ? 'rgba(255,255,255,0.15)' : 'transparent',
                        border: `1px solid ${newMedium.includes(m) ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                        color: newMedium.includes(m) ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <button onClick={() => handleEditSave(i)} className="px-3 py-1 rounded text-[8px] font-bold text-green-400 border border-green-400/20 hover:bg-green-400/10">Save</button>
                <button onClick={() => setEditIdx(null)} className="text-white/30 text-[8px]">Cancel</button>
              </div>
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}

// Legacy generic section panel — kept for future re-use but currently unused.
// Disabled to keep the build clean; uncomment when the section system is wired
// back into a panel.
/* function SectionPanel({ title, description, fields, editPath, onClose }: {
  title: string
  description: string
  fields: { label: string; type: 'text' | 'file' | 'button' }[]
  editPath?: string
  onClose?: () => void
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-white text-[14px] font-bold uppercase tracking-[0.1em]">{title}</h2>
        {editPath && onClose && <EditOnPageButton path={editPath} onClose={onClose} />}
      </div>
      <p className="text-white/30 text-[9px] leading-[1.6] mb-6">{description}</p>
      <div className="space-y-4">
        {fields.map((field, i) => (
          <div key={i}>
            <label className="text-white/50 text-[8px] uppercase tracking-[0.12em] block mb-1.5">{field.label}</label>
            {field.type === 'text' && (
              <input
                type="text"
                className="w-full px-3 py-2 rounded-lg text-[11px] bg-white/5 border border-white/10 text-white placeholder-white/20 outline-none focus:border-white/25 transition-colors"
                placeholder={`Enter ${field.label.toLowerCase()}...`}
              />
            )}
            {field.type === 'file' && (
              <div className="flex items-center gap-3">
                <label className="px-4 py-2 rounded-full text-[8px] uppercase tracking-[0.12em] font-bold text-white/50 border border-white/15 cursor-pointer hover:border-white/30 hover:text-white/70 transition-all">
                  Choose File
                  <input type="file" className="hidden" accept="image/*,video/*" />
                </label>
                <span className="text-white/20 text-[9px]">No file selected</span>
              </div>
            )}
            {field.type === 'button' && (
              <button className="px-4 py-2 rounded-full text-[8px] uppercase tracking-[0.12em] font-bold text-white/60 border border-white/15 hover:border-white/30 hover:text-white/80 transition-all hover:scale-105 active:scale-95">
                + Add New
              </button>
            )}
          </div>
        ))}
        <div className="pt-4 border-t border-white/8 mt-6">
          <button className="px-5 py-2 rounded-full text-[8px] uppercase tracking-[0.15em] font-bold bg-white text-black hover:scale-105 active:scale-95 transition-all">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
} */

// === Info Popup Editor ===
function InfoPopupEditor({ onClose }: { onClose: () => void }) {
  const [blurb, setBlurb] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [currentlyAt, setCurrentlyAt] = useState('')
  const [location, setLocation] = useState('')
  const [email, setEmail] = useState('')
  const [footerBlurb, setFooterBlurb] = useState('')
  const [pageFooters, setPageFooters] = useState<Record<string, string>>({})
  const [improvingField, setImprovingField] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Distinct state for the save button so it can show its own ✓ / ✗ /
  // saving state at the spot the user clicks, without depending on the
  // top-of-form status banner that's often offscreen.
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    fetch('/api/pages')
      .then(r => r.json())
      .then(data => {
        const d = data.pages?.['info-popup'] || {}
        setBlurb(d.blurb || 'A multidisciplinary creative working at the intersection of technology and craft. Building visual systems that feel alive, intentional, and unmistakably human.')
        setSubtitle(d.subtitle || 'Generative & 3D Motion')
        setCurrentlyAt(d.currentlyAt || 'META')
        setLocation(d.location || 'Melbourne, Aus')
        setEmail(d.email || 'carterjordan75@gmail.com')
        setFooterBlurb(d.footerBlurb || 'A multidisciplinary creative practice spanning motion design, 3D environments, generative art, and illustration. Every project merges craft with experimentation.')
        // Load per-page footers
        const allPages = data.pages || {}
        const pf: Record<string, string> = {}
        for (const pid of ['archive', 'work', 'misc', 'info', 'project']) {
          pf[pid] = allPages[pid]?.footerBlurb || ''
        }
        setPageFooters(pf)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Originals snapshot used on save to diff vs current state for blob cleanup.

  const handleSave = async () => {
    setSaveState('saving')
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: 'info-popup',
          fields: { blurb, subtitle, currentlyAt, location, email, footerBlurb },
        }),
      })
      // Save per-page footer blurbs
      for (const [pid, text] of Object.entries(pageFooters)) {
        if (text.trim()) {
          await fetch('/api/pages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId: pid, fields: { footerBlurb: text } }),
          })
        }
      }
      if (res.ok) {
        setStatus('✓ Saved — reload to see changes')
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 2500)
      } else {
        setStatus('✗ Save failed')
        setSaveState('error')
        setTimeout(() => setSaveState('idle'), 3000)
      }
    } catch {
      setStatus('✗ Network error')
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    }
  }

  const inputStyle = "w-full px-3 py-2 rounded-lg text-[11px] bg-white/5 border border-white/10 text-white placeholder-white/20 outline-none focus:border-white/25 transition-colors"
  const labelStyle = "text-white/50 text-[8px] uppercase tracking-[0.12em] block mb-1.5"

  if (loading) return <p className="text-white/20 text-[9px] py-4 text-center">Loading...</p>

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-white text-[14px] font-bold uppercase tracking-[0.1em]">Info / About</h2>
        <EditOnPageButton path="/info" onClose={onClose} />
      </div>
      <p className="text-white/30 text-[9px] leading-[1.6] mb-6">Edit the info popup that appears when clicking the ⓘ button, plus the full info page.</p>

      {status && (
        <p className={`text-[9px] mb-3 ${status.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{status}</p>
      )}

      <div className="space-y-4 p-4 rounded-lg border border-white/10 bg-white/3">
        <p className="text-white/60 text-[9px] font-bold uppercase tracking-[0.1em]">Info Popup Content</p>

        <div>
          <label className={labelStyle}>Subtitle (above name)</label>
          <input type="text" value={subtitle} onChange={e => setSubtitle(e.target.value)} className={inputStyle} placeholder="e.g. Generative & 3D Motion" />
        </div>

        <div>
          <label className={labelStyle}>Main Blurb</label>
          <textarea
            value={blurb}
            onChange={e => setBlurb(e.target.value)}
            rows={3}
            className={`${inputStyle} resize-none`}
            placeholder="A short blurb about yourself..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelStyle}>Currently Working At</label>
            <input type="text" value={currentlyAt} onChange={e => setCurrentlyAt(e.target.value)} className={inputStyle} placeholder="e.g. META" />
          </div>
          <div>
            <label className={labelStyle}>Location</label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} className={inputStyle} placeholder="e.g. Melbourne, Aus" />
          </div>
        </div>

        <div>
          <label className={labelStyle}>Email</label>
          <input type="text" value={email} onChange={e => setEmail(e.target.value)} className={inputStyle} placeholder="e.g. you@email.com" />
        </div>

        <div className="pt-3 mt-3 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-white/60 text-[9px] font-bold uppercase tracking-[0.1em]">Site Footer</p>

          {/* Global default */}
          <div>
            <label className={labelStyle}>Default Footer Blurb (all pages)</label>
            <div className="flex gap-2">
              <textarea
                value={footerBlurb}
                onChange={e => setFooterBlurb(e.target.value)}
                rows={2}
                className={`${inputStyle} resize-none flex-1`}
                placeholder="A short blurb about your practice..."
              />
              <button
                onClick={async () => {
                  setImprovingField('global')
                  try {
                    const res = await fetch('/api/ai-improve', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text: footerBlurb, context: 'footer' }),
                    })
                    const data = await res.json()
                    if (data.improved) setFooterBlurb(data.improved)
                  } catch {}
                  setImprovingField(null)
                }}
                disabled={improvingField === 'global'}
                className="px-2 py-1 rounded-lg text-[7px] uppercase tracking-wider font-bold self-start transition-all hover:scale-105"
                style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: 'rgba(168,85,247,0.8)', minWidth: '32px' }}
                title="AI Improve"
              >
                {improvingField === 'global' ? '...' : '✨'}
              </button>
            </div>
          </div>

          {/* Per-page overrides */}
          <p className="text-white/30 text-[7px] uppercase tracking-[0.12em]">Page-specific overrides (leave blank to use default)</p>
          {[
            { id: 'archive', label: 'Index' },
            { id: 'work', label: 'Work / Home' },
            { id: 'misc', label: 'Misc' },
            { id: 'info', label: 'Info' },
            { id: 'project', label: 'Project Pages' },
          ].map(page => (
            <div key={page.id}>
              <label className={labelStyle}>{page.label}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pageFooters[page.id] || ''}
                  onChange={e => setPageFooters(prev => ({ ...prev, [page.id]: e.target.value }))}
                  className={inputStyle}
                  placeholder={`Leave blank to use default`}
                />
                <button
                  onClick={async () => {
                    const text = pageFooters[page.id] || footerBlurb
                    setImprovingField(page.id)
                    try {
                      const res = await fetch('/api/ai-improve', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text, context: 'footer' }),
                      })
                      const data = await res.json()
                      if (data.improved) setPageFooters(prev => ({ ...prev, [page.id]: data.improved }))
                    } catch {}
                    setImprovingField(null)
                  }}
                  disabled={improvingField === page.id}
                  className="px-2 py-1 rounded-lg text-[7px] uppercase tracking-wider font-bold transition-all hover:scale-105"
                  style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: 'rgba(168,85,247,0.8)', minWidth: '32px' }}
                  title="AI Improve"
                >
                  {improvingField === page.id ? '...' : '✨'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* The Info page video + profile panel used to live here. It
            wrote lightVideoSrc, darkVideoSrc, figCaption, profileLight
            and profileDark, and nothing on the site has read any of them
            since that section of the Info page was removed — uploads
            went to Blob and were never shown. Removed rather than left
            as a control that looks like it does something. */}

        <button
          onClick={handleSave}
          disabled={saveState === 'saving'}
          className={`w-full py-2.5 mt-4 rounded-full text-[9px] uppercase tracking-[0.12em] font-bold transition-all ${
            saveState === 'idle' ? 'hover:scale-[1.02] active:scale-[0.98]' : ''
          } disabled:cursor-wait`}
          style={{
            background:
              saveState === 'saved' ? 'rgba(34,197,94,0.25)' :
              saveState === 'error' ? 'rgba(248,113,113,0.25)' :
              saveState === 'saving' ? 'rgba(255,255,255,0.06)' :
              'rgba(255,255,255,0.1)',
            border:
              saveState === 'saved' ? '1px solid rgba(34,197,94,0.55)' :
              saveState === 'error' ? '1px solid rgba(248,113,113,0.55)' :
              '1px solid rgba(255,255,255,0.2)',
            color:
              saveState === 'saved' ? 'rgb(74,222,128)' :
              saveState === 'error' ? 'rgb(252,165,165)' :
              'rgba(255,255,255,0.8)',
          }}
        >
          {saveState === 'saving' && '⟳ Saving…'}
          {saveState === 'saved' && '✓ Saved'}
          {saveState === 'error' && '✗ Save failed — try again'}
          {saveState === 'idle' && 'Save All Settings'}
        </button>
      </div>
    </div>
  )
}

/**
 * Storage browser — lists every Blob in the project's store with its size,
 * whether it's referenced by admin state, and lets you bulk-delete. Mostly
 * useful for cleaning up failed-upload originals + abandoned drafts that
 * accumulated before the leak fix shipped.
 *
 * Sort and filter: largest first by default (most useful for freeing space).
 * "Show orphans only" hides anything currently in use so you can clear
 * orphans confidently without nuking real assets.
 */
type StorageItem = {
  pathname: string
  url: string
  size: number
  uploadedAt?: string
  referenced: boolean
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/**
 * Loader pool — which wordmark animations the site can play.
 *
 * Loaders are made in /logo and exported from there as a standalone HTML
 * file; this reads that file, strips it down to the stylesheet and the
 * SVG, and stores it. With randomise on, each visit picks one of the
 * enabled loaders.
 *
 * There is always the one compiled into the bundle as well — it is what
 * plays on the very first paint of a session, before a pick can have
 * been fetched, and whenever the pool is empty. So an empty list here
 * means the built-in, not no loader.
 */
/** Mirrors the /api/loaders index. Kept local so a client component does
 *  not import from a route module. */
type LoaderArtShape = { css: string; svg: string; duration: number; mono: boolean }

type LoaderIndexShape = {
  randomise: boolean
  pinnedId: string | null
  items: Array<{ id: string; name: string; enabled: boolean; duration: number; bytes: number;
                 modes?: 'both' | 'light' | 'dark'; kind?: 'loader' | 'sleep'
                 placement?: { x: number; y: number; size: number } }>
}

/**
 * Scale of the wordmark, per place it appears.
 *
 * Each surface keeps its own responsive rule — the header clamps between
 * two rems, the loader sits at a share of the viewport — and this is a
 * multiplier on top, so 1 is the design as drawn and the dial nudges it
 * without flattening the clamp into a fixed size.
 *
 * Changes show immediately on the page behind the panel, because the
 * values are published as CSS variables rather than held in React state.
 * That is also how the loader picks them up: it paints over the gate and
 * the mobile lock, where the navigation that fetches this is not
 * mounted, and a variable with a default means those surfaces size
 * themselves correctly having never heard of any of it.
 */
function LogoScalePanel() {
  const [scales, setScales] = useState<LogoScales>(DEFAULT_LOGO_SCALES)
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    fetch('/api/pages', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d) setScales(readLogoScales(d.pages?.[LOGO_SCALE_PAGE]))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const nudge = (k: keyof LogoScales, v: number) => {
    const next = { ...scales, [k]: v }
    setScales(next)
    applyLogoScales(next)          // live, so the header behind you moves
    setSaveState('idle')
  }

  const save = async () => {
    setSaveState('saving')
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: LOGO_SCALE_PAGE, fields: scales }),
      })
      setSaveState(res.ok ? 'saved' : 'error')
    } catch {
      setSaveState('error')
    }
  }

  const reset = () => {
    setScales(DEFAULT_LOGO_SCALES)
    applyLogoScales(DEFAULT_LOGO_SCALES)
    setSaveState('idle')
  }

  const ROWS: Array<{ k: keyof LogoScales; label: string; hint: string }> = [
    { k: 'header', label: 'Header',     hint: 'Top-left wordmark, every page' },
    { k: 'popup',  label: 'Info popup', hint: 'Inside the menu / info overlay' },
    { k: 'loader', label: 'Loader',     hint: 'The animated mark on the loading screen' },
  ]

  if (loading) return <p className="text-white/30 text-[10px]">Loading…</p>

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <h2 className="text-white text-xs font-bold tracking-[0.14em] uppercase mb-1">Logo scale</h2>
        <p className="text-white/35 text-[10px] leading-relaxed">
          1.00 is the size as designed. Each place keeps its own responsive
          rule — this scales the result, so it still adapts to the window.
        </p>
      </div>

      {ROWS.map(({ k, label, hint }) => (
        <div key={k} className="space-y-1">
          <div className="flex items-baseline justify-between">
            <label className="text-white/70 text-[10px] font-medium">{label}</label>
            <span className="text-white/40 text-[10px] font-mono tabular-nums">
              {scales[k].toFixed(2)}×
            </span>
          </div>
          <input
            type="range" min="0.5" max="1.6" step="0.01" value={scales[k]}
            onChange={e => nudge(k, parseFloat(e.target.value))}
            className="w-full"
          />
          <p className="text-white/25 text-[9px]">{hint}</p>
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={save}
          disabled={saveState === 'saving'}
          className="px-3 py-1.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-white text-black disabled:opacity-40"
        >
          {saveState === 'saving' ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={reset}
          className="px-3 py-1.5 rounded-md text-[10px] tracking-wider uppercase border border-white/15 text-white/60 hover:text-white"
        >
          Reset to 1.00
        </button>
        {saveState === 'saved' && <span className="text-emerald-400/70 text-[10px]">Saved</span>}
        {saveState === 'error' && <span className="text-red-400/70 text-[10px]">Could not save</span>}
      </div>

      <p className="text-white/25 text-[9px] leading-relaxed">
        Unsaved changes still show on the page behind this panel — they are
        live the moment you drag. Reload without saving and they are gone.
      </p>
    </div>
  )
}

function LoadersAdminPanel() {
  const [index, setIndex] = useState<LoaderIndexShape>({ randomise: true, pinnedId: null, items: [] })
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingName, setPendingName] = useState('')
  const [pendingKind, setPendingKind] = useState<'loader' | 'sleep'>('loader')
  const [busy, setBusy] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewArt, setPreviewArt] = useState<LoaderArtShape | null>(null)
  const [previewW, setPreviewW] = useState(320)
  // Loaders carry no background, so a preview has to supply one — and
  // which one matters: a mono mark inverts, so it needs checking on both.
  const [previewBg, setPreviewBg] = useState<'dark' | 'light' | 'none'>('dark')
  /**
   * Where the mark sits in the preview, and how big.
   *
   * Inspecting a loader means getting close to it — the pupils, the edge
   * of the shading — and at that size the interesting part is rarely in
   * the middle. So it can be dragged.
   *
   * Deliberately not stored with the loader. It is how closely someone
   * is looking at the artwork, not a property of the artwork, and the
   * same rule the tuner's viewer zoom follows: nothing here should be
   * able to reach the file.
   */
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [replay, setReplay] = useState(0)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/loaders', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { setIndex(d); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  // The placement being edited. Only one row is open at a time, so one
  // slot is enough — and keeping it here rather than in the tool means a
  // drag can update the live preview without a round trip per frame.
  const [place, setPlace] = useState<{ x: number; y: number; size: number } | null>(null)
  const savePlace = async (id: string, p: { x: number; y: number; size: number }) => {
    await patch({ items: [{ id, placement: p }] })
  }

  const patch = async (body: Record<string, unknown>) => {
    setError(null)
    const res = await fetch('/api/loaders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { setError(`Save failed (HTTP ${res.status})`); return false }
    setIndex(await res.json())
    // The visitor's pick is cached for their session; drop ours so the
    // next loader here reflects the change rather than the old roll.
    clearLoaderPick(); clearSleepPool()
    return true
  }

  const add = async () => {
    if (!pendingFile || !pendingName.trim()) return
    setBusy(true); setError(null); setStatus(null)
    try {
      const html = await pendingFile.text()
      const res = await fetch('/api/loaders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: pendingName.trim(), html, kind: pendingKind }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setStatus(`Added — plays for ${(data.duration / 1000).toFixed(1)}s`)
      setPendingFile(null); setPendingName('')
      clearLoaderPick(); clearSleepPool()
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? The site will stop using it.`)) return
    const res = await fetch(`/api/loaders?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) { setError(`Delete failed (HTTP ${res.status})`); return }
    setIndex(await res.json())
    if (previewId === id) { setPreviewId(null); setPreviewArt(null) }
    clearLoaderPick(); clearSleepPool()
  }

  const preview = async (id: string) => {
    // Clearing the draft placement with the row it belongs to. One slot
    // holds it, so leaving it behind would show the last loader's
    // position on the next one opened — and the first drag would save it.
    if (previewId === id) { setPreviewId(null); setPreviewArt(null); setPlace(null); return }
    setPreviewId(id); setPreviewArt(null); setPlace(null)
    // A fresh loader starts framed, rather than wherever the last one
    // happened to be left.
    setPan({ x: 0, y: 0 })
    const res = await fetch(`/api/loaders?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
    if (res.ok) setPreviewArt(await res.json())
    setReplay(r => r + 1)
  }

  const enabled = index.items.filter(i => i.enabled)

  return (
    <div>
      <h2 className="text-white text-[11px] uppercase tracking-[0.2em] font-black mb-1">Loaders</h2>
      <p className="text-white/35 text-[9px] leading-relaxed mb-5 max-w-lg">
        Made in <span className="text-white/60">/logo</span> and exported from there. With randomise on,
        each visit plays one of the enabled ones. The loader built into the site always covers the first
        paint of a session and any gap, so an empty list here means that one — never nothing.
      </p>

      {error && <p className="text-red-400 text-[9px] mb-3">{error}</p>}
      {status && <p className="text-emerald-400 text-[9px] mb-3">{status}</p>}

      {/* ── add ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 mb-5">
        <p className="text-white/30 text-[7px] uppercase tracking-[0.15em] mb-2">Add a loader</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".html,text/html"
            onChange={e => {
              const f = e.target.files?.[0] || null
              setPendingFile(f)
              if (f && !pendingName) setPendingName(f.name.replace(/\.html?$/i, ''))
            }}
            className="text-white/60 text-[9px] max-w-[210px]"
          />
          <input
            value={pendingName}
            onChange={e => setPendingName(e.target.value)}
            placeholder="Name it"
            className="bg-white/5 border border-white/12 rounded-full px-3 py-1.5 text-white text-[10px] outline-none"
          />
          {/* Chosen on the way in rather than fixed afterwards, so a
              sleep mark never spends a moment in the loader pool — it
              would be picked as a loading screen, loop forever, and the
              page behind it would never be revealed. */}
          <div className="inline-flex rounded-full border border-white/12 overflow-hidden shrink-0">
            {([['loader', 'Loader'], ['sleep', 'Sleep']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setPendingKind(val)}
                className={`px-3 py-1.5 text-[9px] uppercase tracking-[0.12em] font-bold transition-colors ${
                  pendingKind === val ? 'bg-white text-black' : 'text-white/45 hover:text-white/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={add}
            disabled={busy || !pendingFile || !pendingName.trim()}
            className="px-4 py-1.5 rounded-full text-[9px] uppercase tracking-[0.14em] font-bold bg-white text-black disabled:opacity-30"
          >
            {busy ? 'Reading…' : 'Add'}
          </button>
        </div>
      </div>

      {/* ── behaviour ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="flex items-center gap-2 text-white/70 text-[10px] cursor-pointer">
          <input
            type="checkbox"
            checked={index.randomise}
            onChange={e => patch({ randomise: e.target.checked })}
          />
          Randomise — pick one at random each visit
        </label>
        {!index.randomise && (
          <select
            value={index.pinnedId || ''}
            onChange={e => patch({ pinnedId: e.target.value || null })}
            className="bg-white/5 border border-white/12 rounded-full px-3 py-1.5 text-white text-[10px] outline-none"
          >
            <option value="">First enabled</option>
            {enabled.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        )}
      </div>

      {/* ── list ────────────────────────────────────────────── */}
      {loading ? (
        <p className="text-white/30 text-[9px]">Loading…</p>
      ) : !index.items.length ? (
        <p className="text-white/30 text-[9px]">
          Nothing added. The site is using the built-in loader.
        </p>
      ) : (
        <div className="space-y-1.5">
          {index.items.map(item => (
            <div key={item.id} className="rounded-lg border border-white/8 bg-white/[0.02]">
              <div className="flex items-center gap-3 px-3 py-2">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={e => patch({ items: [{ id: item.id, enabled: e.target.checked }] })}
                  title={item.enabled ? 'In the pool' : 'Not in the pool'}
                />
                <input
                  defaultValue={item.name}
                  onBlur={e => {
                    if (e.target.value.trim() && e.target.value !== item.name) {
                      patch({ items: [{ id: item.id, name: e.target.value }] })
                    }
                  }}
                  className="bg-transparent text-white text-[11px] outline-none flex-1 min-w-0 border-b border-transparent focus:border-white/20"
                />
                {/* Which themes this one may appear in. Both is the
                    default and what a mono mark wants — it follows the
                    theme by itself. This is for a loader carrying real
                    colour, which can be built for black and look wrong
                    on white. */}
                <div className="inline-flex rounded-full border border-white/12 overflow-hidden shrink-0">
                  {([
                    ['both', 'Both'],
                    ['light', 'Light'],
                    ['dark', 'Dark'],
                  ] as const).map(([val, label]) => {
                    const on = (item.modes || 'both') === val
                    return (
                      <button
                        key={val}
                        onClick={() => patch({ items: [{ id: item.id, modes: val }] })}
                        className={`px-2 py-1 text-[8px] uppercase tracking-[0.1em] font-bold transition-colors ${
                          on ? 'bg-white text-black' : 'text-white/45 hover:text-white/80'
                        }`}
                        title={val === 'both'
                          ? 'Can play in either theme'
                          : `Only plays in ${val} mode`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                {/* What this mark is FOR. A loader covers a wait and
                    stops when the page is ready; a sleep mark loops over
                    the page until the mouse moves. Same artwork either
                    way — only this decides which pool it is drawn from. */}
                <div className="inline-flex rounded-full border border-white/12 overflow-hidden shrink-0">
                  {([
                    ['loader', 'Loader'],
                    ['sleep', 'Sleep'],
                  ] as const).map(([val, label]) => {
                    const on = (item.kind || 'loader') === val
                    return (
                      <button
                        key={val}
                        onClick={() => patch({ items: [{ id: item.id, kind: val }] })}
                        className={`px-2 py-1 text-[8px] uppercase tracking-[0.1em] font-bold transition-colors ${
                          on ? 'bg-white text-black' : 'text-white/45 hover:text-white/80'
                        }`}
                        title={val === 'loader'
                          ? 'Covers a page while it loads, then stops'
                          : 'Loops over the page after 45s of no movement'}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                <span className="text-white/25 text-[8px] tabular-nums whitespace-nowrap">
                  {(item.duration / 1000).toFixed(1)}s · {Math.round(item.bytes / 1024)}KB
                </span>
                <button
                  onClick={() => preview(item.id)}
                  className="text-white/50 hover:text-white text-[8px] uppercase tracking-[0.12em]"
                >
                  {previewId === item.id ? 'Hide' : 'Play'}
                </button>
                <button
                  onClick={() => remove(item.id, item.name)}
                  className="text-white/30 hover:text-red-400 text-[11px] leading-none"
                  title="Delete"
                >
                  ×
                </button>
              </div>
              {previewId === item.id && (
                <div className="px-3 pb-3">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <label className="flex items-center gap-2 text-white/40 text-[8px] uppercase tracking-[0.12em]">
                      Size
                      <input
                        type="range" min={80} max={2400} step={10}
                        value={previewW}
                        onChange={e => setPreviewW(Number(e.target.value))}
                        className="w-40"
                      />
                      <span className="tabular-nums text-white/30 w-12">{previewW}px</span>
                    </label>
                    <button
                      onClick={() => { setPreviewW(320); setPan({ x: 0, y: 0 }) }}
                      className="text-white/50 hover:text-white text-[8px] uppercase tracking-[0.12em]"
                      title="Back to the framing the site will actually use"
                    >
                      Fit
                    </button>
                    <div className="flex items-center gap-1">
                      {(['dark', 'light', 'none'] as const).map(b => (
                        <button
                          key={b}
                          onClick={() => setPreviewBg(b)}
                          className={`px-2.5 py-1 rounded-full text-[8px] uppercase tracking-[0.12em] border ${
                            previewBg === b
                              ? 'bg-white text-black border-white'
                              : 'text-white/50 border-white/15'
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setReplay(r => r + 1)}
                      className="text-white/50 hover:text-white text-[8px] uppercase tracking-[0.12em]"
                    >
                      ↻ Replay
                    </button>
                  </div>
                  <div
                    className="rounded-md p-5 flex items-center justify-center min-h-[140px] overflow-hidden select-none"
                    onPointerDown={e => {
                      drag.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y }
                      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
                    }}
                    onPointerMove={e => {
                      const d = drag.current
                      if (!d) return
                      setPan({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) })
                    }}
                    onPointerUp={() => { drag.current = null }}
                    onPointerCancel={() => { drag.current = null }}
                    style={{
                      cursor: drag.current ? 'grabbing' : 'grab',
                      background:
                        previewBg === 'dark' ? '#0a0a0a'
                        : previewBg === 'light' ? '#f2f2ef'
                        // A chequerboard, so "no background" reads as
                        // transparent rather than as some third colour.
                        : 'repeating-conic-gradient(#2a2a2a 0% 25%, #1c1c1c 0% 50%) 50%/16px 16px',
                    }}
                  >
                    {previewArt ? (
                      <div
                        style={{
                          width: previewW,
                          // No maxWidth: capping it here would silently
                          // undo the zoom the moment it passed the panel
                          // width, which is exactly when it is wanted.
                          transform: `translate(${pan.x}px, ${pan.y}px)`,
                          flexShrink: 0,
                        }}
                      >
                        <XoxoBrandLoader
                          key={`${item.id}-${replay}-${previewBg}`}
                          art={{ ...previewArt, duration: item.duration }}
                          ink={previewBg === 'light' ? '#111111' : '#ffffff'}
                          knockout={
                            previewBg === 'dark' ? '#0a0a0a'
                            : previewBg === 'light' ? '#f2f2ef'
                            : 'transparent'
                          }
                        />
                      </div>
                    ) : (
                      <span className="text-white/25 text-[9px]">Fetching…</span>
                    )}
                  </div>
                  {previewArt && (
                    <PlacementTool
                      art={previewArt}
                      kind={item.kind || 'loader'}
                      ground={previewBg === 'light' ? '#f2f2ef' : '#0a0a0a'}
                      ink={previewBg === 'light' ? '#111111' : '#ffffff'}
                      value={place || item.placement || {
                        x: 50, y: 50, size: (item.kind || 'loader') === 'sleep' ? 46 : 34,
                      }}
                      onChange={setPlace}
                      onCommit={() => { if (place) savePlace(item.id, place) }}
                    />
                  )}
                  {!previewArt ? null : previewArt.mono ? (
                    <p className="text-white/25 text-[8px] mt-1.5">
                      Mono — follows the site&rsquo;s light / dark mode. Check it on both.
                    </p>
                  ) : (
                    <p className="text-white/25 text-[8px] mt-1.5">
                      Has its own colour — shown as exported, whatever the mode.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


/**
 * Where a mark sits on the screen, set by dragging it.
 *
 * The box is the viewport at 16:9, so a percentage here is the same
 * percentage there — the mark is positioned by its CENTRE, which is what
 * keeps the numbers meaning one thing at every screen size.
 *
 * Guides because placing something by eye against an empty rectangle is
 * guesswork: the centre cross says whether it is actually centred, the
 * thirds are where you put something that should not be, and the safe
 * inset is the margin a mark should not cross on a phone, where the
 * browser chrome eats the edges.
 */
function PlacementTool({
  art, kind, ground, ink, value, onChange, onCommit,
}: {
  art: LoaderArtShape | null
  kind: 'loader' | 'sleep'
  ground: string
  ink: string
  value: { x: number; y: number; size: number }
  onChange: (p: { x: number; y: number; size: number }) => void
  onCommit: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [guides, setGuides] = useState(true)
  const [dragging, setDragging] = useState(false)

  const move = (e: React.PointerEvent) => {
    const b = box.current?.getBoundingClientRect()
    if (!b) return
    onChange({
      ...value,
      x: Math.round(Math.min(100, Math.max(0, ((e.clientX - b.left) / b.width) * 100))),
      y: Math.round(Math.min(100, Math.max(0, ((e.clientY - b.top) / b.height) * 100))),
    })
  }

  const G = 'rgba(255,255,255,0.22)'
  const preset = (x: number, y: number) => () => { onChange({ ...value, x, y }); }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-white/40 text-[8px] uppercase tracking-[0.14em]">Placement</span>
        <button
          onClick={() => setGuides(g => !g)}
          className={`text-[8px] uppercase tracking-[0.12em] ${guides ? 'text-white/70' : 'text-white/30'} hover:text-white`}
        >
          Guides
        </button>
      </div>

      <div
        ref={box}
        onPointerDown={e => {
          setDragging(true)
          ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
          move(e)
        }}
        onPointerMove={e => { if (dragging) move(e) }}
        onPointerUp={() => { if (dragging) { setDragging(false); onCommit() } }}
        onPointerCancel={() => setDragging(false)}
        className="relative w-full overflow-hidden rounded-md border border-white/10 select-none"
        style={{ aspectRatio: '16 / 9', background: ground, cursor: dragging ? 'grabbing' : 'crosshair' }}
      >
        {art && (
          <div
            style={{
              position: 'absolute',
              left: `${value.x}%`,
              top: `${value.y}%`,
              width: `${value.size}%`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }}
          >
            <XoxoBrandLoader art={{ ...art }} ink={ink} knockout={ground} />
          </div>
        )}

        {guides && (
          <svg
            viewBox="0 0 160 90" preserveAspectRatio="none" aria-hidden
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            {/* thirds */}
            <g stroke={G} strokeWidth="0.4" strokeDasharray="2 2">
              <line x1="53.3" y1="0" x2="53.3" y2="90" /><line x1="106.7" y1="0" x2="106.7" y2="90" />
              <line x1="0" y1="30" x2="160" y2="30" /><line x1="0" y1="60" x2="160" y2="60" />
            </g>
            {/* the safe inset — the margin a mark should not cross */}
            <rect x="8" y="4.5" width="144" height="81" fill="none" stroke={G} strokeWidth="0.4" />
            {/* centre, solid so it reads as the one true line */}
            <g stroke="rgba(255,255,255,0.42)" strokeWidth="0.5">
              <line x1="80" y1="0" x2="80" y2="90" /><line x1="0" y1="45" x2="160" y2="45" />
            </g>
          </svg>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2">
        <div className="grid grid-cols-3 gap-[2px] shrink-0">
          {[[10,12],[50,12],[90,12],[10,50],[50,50],[90,50],[10,88],[50,88],[90,88]].map(([x, y]) => (
            <button
              key={`${x}-${y}`}
              onClick={preset(x, y)}
              onPointerUp={onCommit}
              title={`${x}% / ${y}%`}
              className={`w-3 h-3 rounded-[2px] border ${
                Math.abs(value.x - x) < 3 && Math.abs(value.y - y) < 3
                  ? 'border-white/70 bg-white/40' : 'border-white/15 hover:border-white/40'
              }`}
            />
          ))}
        </div>
        <label className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-white/40 text-[8px] uppercase tracking-[0.12em] shrink-0">Size</span>
          <input
            type="range" min={4} max={100} step={1} value={value.size}
            onChange={e => onChange({ ...value, size: +e.target.value })}
            onPointerUp={onCommit}
            className="flex-1 min-w-0 accent-white"
          />
          <span className="text-white/40 text-[8px] tabular-nums w-14 text-right shrink-0">
            {value.size}vw
          </span>
        </label>
      </div>
      <p className="text-white/25 text-[8px] mt-1.5">
        Dragged by its centre, so {value.x}% / {value.y}% means the same thing on any screen.
        Width is capped at {value.size * 10}px, so it stops growing on a wide monitor.
        {kind === 'sleep' ? ' Shown over the page it interrupts.' : ''}
      </p>
    </div>
  )
}

function StorageAdminPanel() {
  const [items, setItems] = useState<StorageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null)
  const [filter, setFilter] = useState('')
  const [orphansOnly, setOrphansOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'size' | 'date' | 'path'>('size')
  const [deleting, setDeleting] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [totalBytes, setTotalBytes] = useState(0)

  const load = () => {
    setLoading(true)
    setError(null)
    fetch('/api/storage-list')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(String(data.error)); setLoading(false); return }
        setItems(data.items || [])
        setTotalBytes(data.totalBytes || 0)
        setSelected(new Set())
        setLastSelectedIdx(null)
        setLoading(false)
      })
      .catch(err => { setError(String(err)); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  // Apply filter + orphan toggle + sort
  const visible = items
    .filter(i => !orphansOnly || !i.referenced)
    .filter(i => !filter || i.pathname.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'size') return b.size - a.size
      if (sortBy === 'date') return (b.uploadedAt || '').localeCompare(a.uploadedAt || '')
      return a.pathname.localeCompare(b.pathname)
    })

  const orphanCount = items.filter(i => !i.referenced).length
  const orphanBytes = items.filter(i => !i.referenced).reduce((sum, i) => sum + i.size, 0)
  const selectedBytes = visible.filter(i => selected.has(i.url)).reduce((sum, i) => sum + i.size, 0)

  const toggleOne = (url: string, idx: number, shiftKey = false) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (shiftKey && lastSelectedIdx !== null && lastSelectedIdx !== idx) {
        const [lo, hi] = lastSelectedIdx < idx ? [lastSelectedIdx, idx] : [idx, lastSelectedIdx]
        const adding = !prev.has(visible[lastSelectedIdx].url)
        for (let i = lo; i <= hi; i++) {
          const u = visible[i].url
          if (adding) next.add(u); else next.delete(u)
        }
      } else {
        if (next.has(url)) next.delete(url); else next.add(url)
      }
      return next
    })
    setLastSelectedIdx(idx)
  }

  const selectAllVisible = () => setSelected(new Set(visible.map(i => i.url)))
  const selectAllOrphans = () => setSelected(new Set(items.filter(i => !i.referenced).map(i => i.url)))
  const clearSelected = () => setSelected(new Set())

  const handleDelete = async () => {
    if (selected.size === 0 || deleting) return
    const willDeleteReferenced = visible.some(i => selected.has(i.url) && i.referenced)
    const msg = `Delete ${selected.size} file${selected.size === 1 ? '' : 's'} (${formatBytes(selectedBytes)})?${
      willDeleteReferenced ? '\n\nWARNING: some of these are still referenced by admin state — deleting them will leave broken links on the site.' : ''
    }`
    if (!confirm(msg)) return
    setDeleting(true)
    setStatus(`Deleting ${selected.size}…`)
    try {
      const res = await fetch('/api/blob-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: Array.from(selected) }),
      })
      const data = await res.json()
      setStatus(`✓ Deleted ${data.deleted}${data.failed ? ` · ${data.failed} failed` : ''}`)
      load()
    } catch (err) {
      setStatus(`✗ Delete failed: ${String(err)}`)
    } finally {
      setDeleting(false)
      setTimeout(() => setStatus(null), 4000)
    }
  }

  const isImage = (path: string) => /\.(jpe?g|png|gif|webp|avif|svg)$/i.test(path)
  const isVideo = (path: string) => /\.(mp4|webm|mov|m4v)$/i.test(path)

  return (
    <div>
      <h2 className="text-white text-[14px] font-bold uppercase tracking-[0.1em] mb-4">Storage</h2>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 rounded-lg border border-white/8 bg-white/3">
          <p className="text-white/40 text-[7px] uppercase tracking-[0.15em]">Total</p>
          <p className="text-white text-[14px] font-bold">{formatBytes(totalBytes)}</p>
          <p className="text-white/30 text-[8px] mt-0.5">{items.length} files</p>
        </div>
        <div className="p-3 rounded-lg border border-amber-400/20 bg-amber-400/5">
          <p className="text-amber-400/60 text-[7px] uppercase tracking-[0.15em]">Orphans</p>
          <p className="text-amber-400 text-[14px] font-bold">{formatBytes(orphanBytes)}</p>
          <p className="text-amber-400/50 text-[8px] mt-0.5">{orphanCount} files unused</p>
        </div>
        <div className="p-3 rounded-lg border border-white/8 bg-white/3">
          <p className="text-white/40 text-[7px] uppercase tracking-[0.15em]">Selected</p>
          <p className="text-white text-[14px] font-bold">{formatBytes(selectedBytes)}</p>
          <p className="text-white/30 text-[8px] mt-0.5">{selected.size} files</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[8px] uppercase tracking-[0.1em]">
        <input
          type="text"
          placeholder="Filter by path…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/20 outline-none focus:border-white/25 text-[10px] tracking-normal normal-case"
        />
        <label className="flex items-center gap-1.5 text-white/60 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={orphansOnly}
            onChange={(e) => setOrphansOnly(e.target.checked)}
            className="accent-amber-400"
          />
          Orphans only
        </label>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'size' | 'date' | 'path')}
          className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 outline-none text-[9px] cursor-pointer"
        >
          <option value="size" className="bg-zinc-900">Sort: Largest</option>
          <option value="date" className="bg-zinc-900">Sort: Newest</option>
          <option value="path" className="bg-zinc-900">Sort: Path</option>
        </select>
        <button
          onClick={load}
          disabled={loading || deleting}
          className="px-2.5 py-1.5 rounded text-[7px] font-bold text-white/60 border border-white/15 hover:border-white/30 hover:text-white/80 disabled:opacity-40"
        >
          {loading ? '⟳…' : '⟳ Refresh'}
        </button>
      </div>

      {/* Bulk toolbar */}
      {(selected.size > 0 || orphanCount > 0) && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-lg border border-white/12 bg-white/5 text-[8px] uppercase tracking-[0.1em]">
          <span className="text-white/70 font-bold">{selected.size} selected</span>
          <button onClick={clearSelected} disabled={selected.size === 0} className="text-white/40 hover:text-white disabled:opacity-30">clear</button>
          <button onClick={selectAllVisible} className="text-white/60 hover:text-white">select visible</button>
          {orphanCount > 0 && (
            <button onClick={selectAllOrphans} className="text-amber-400/80 hover:text-amber-400 font-bold">
              select all orphans ({orphanCount})
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={handleDelete}
            disabled={selected.size === 0 || deleting}
            className="px-3 py-1.5 rounded text-[8px] font-bold text-red-400 border border-red-400/30 hover:bg-red-400/10 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {deleting ? 'Deleting…' : `🗑 Delete ${selected.size} (${formatBytes(selectedBytes)})`}
          </button>
        </div>
      )}

      {status && (
        <p className={`mb-3 text-[9px] ${status.startsWith('✓') ? 'text-green-400' : status.startsWith('✗') ? 'text-red-400' : 'text-white/60'}`}>{status}</p>
      )}

      {error && (
        <p className="text-red-400 text-[9px] mb-3">✗ Failed to load storage: {error}</p>
      )}

      {/* Item grid */}
      {loading ? (
        <p className="text-white/40 text-[9px] py-8 text-center">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-white/30 text-[9px] py-8 text-center">
          {items.length === 0 ? 'No blobs in storage.' : 'No items match the current filters.'}
        </p>
      ) : (
        <div className="space-y-1">
          {visible.map((item, i) => {
            const isOrphan = !item.referenced
            const isSel = selected.has(item.url)
            return (
              <div
                key={item.url}
                className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${
                  isSel ? 'border-white/30 bg-white/8' : 'border-white/8 hover:bg-white/5'
                } ${isOrphan ? 'border-l-2 border-l-amber-400/60' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isSel}
                  onChange={() => {}}
                  onClick={(e) => { e.stopPropagation(); toggleOne(item.url, i, e.shiftKey) }}
                  className="accent-white cursor-pointer flex-shrink-0"
                  title="Click to toggle · Shift+click for range"
                />
                <div className="w-12 h-12 rounded overflow-hidden bg-black flex-shrink-0">
                  {isImage(item.pathname) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : isVideo(item.pathname) ? (
                    <video src={item.url} muted className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/30 text-[8px]">
                      {item.pathname.split('.').pop()?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/85 text-[10px] truncate" title={item.pathname}>
                    {item.pathname}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-[7px] uppercase tracking-[0.1em]">
                    <span className="text-white/40">{formatBytes(item.size)}</span>
                    {item.uploadedAt && (
                      <span className="text-white/30">{new Date(item.uploadedAt).toLocaleDateString()}</span>
                    )}
                    {isOrphan ? (
                      <span className="text-amber-400 font-bold">orphan</span>
                    ) : (
                      <span className="text-green-400/60">referenced</span>
                    )}
                  </div>
                </div>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/40 hover:text-white text-[8px] uppercase tracking-[0.1em] px-2 py-1 border border-white/10 rounded hover:border-white/25"
                  title="Open in new tab"
                >
                  ↗
                </a>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
