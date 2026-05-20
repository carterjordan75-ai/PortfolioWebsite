'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { upload } from '@vercel/blob/client'
import { useEditMode } from '@/contexts/EditModeContext'
import { downloadAssetsZip } from '@/lib/downloadZip'
import { prepareForUpload, isMp4 } from '@/lib/convertVideo'
import { deleteBlobUrls } from '@/lib/blobClient'

const ADMIN_PASSWORD = '3432'

type Section = 'dashboard' | 'work' | 'archive' | 'employment' | 'experiments' | 'look' | 'info' | 'storage'

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
            <label
              className="block w-full py-3 mt-3 rounded-full text-[9px] uppercase tracking-[0.12em] font-bold text-center cursor-pointer transition-all hover:scale-[1.01]"
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
          )}
        </div>
      )}
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
  const [uploadingLogo, setUploadingLogo] = useState(false)

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
    setLogoPath(''); setShowLogoOnAbout(true)
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

          {/* Client Logo */}
          <div>
            <label className={labelStyle}>Client Logo</label>
            <div className="flex items-center gap-3">
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

      {/* Project list */}
      <div className="space-y-0">
        <div className="flex items-center text-[7px] uppercase tracking-[0.15em] text-white/25 pb-2 border-b border-white/8 mb-1">
          <span className="w-[28%]">Client</span>
          <span className="w-[32%]">Project</span>
          <span className="w-[12%]">Year</span>
          <span className="w-[15%]">Medium</span>
          <span className="w-[13%] text-right">Actions</span>
        </div>

        {loading && <p className="text-white/20 text-[9px] py-4 text-center">Loading...</p>}

        {[...projects].sort((a, b) => b.year - a.year).map((p) => (
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
              <button
                onClick={() => startEdit(p)}
                className="text-white/40 text-[8px] hover:text-white transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(p.slug)}
                className="text-red-400/40 text-[8px] hover:text-red-400 transition-colors"
              >
                ✕
              </button>
            </span>
          </div>
        ))}

        {!loading && projects.length === 0 && (
          <div className="text-center py-6">
            <p className="text-white/15 text-[9px]">No projects found. Server may have been down.</p>
            <button onClick={loadProjects} className="mt-2 px-4 py-1.5 rounded-full text-[8px] uppercase tracking-[0.12em] text-white/40 border border-white/15 hover:border-white/30 transition-all">
              Reload
            </button>
          </div>
        )}
      </div>
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
        <a href="/look" target="_blank" className="text-white/30 text-[8px] uppercase tracking-[0.1em] hover:text-white/60 transition-colors">
          View Page →
        </a>
      </div>
      <p className="text-white/30 text-[9px] leading-[1.6] mb-4">Drag thumbnails to reorder. Upload new files below.</p>

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
  const miscFileRef = useRef<HTMLInputElement>(null)
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

  const saveItems = async (updated: MiscItem[]) => {
    const res = await fetch('/api/misc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: updated }),
    })
    if (res.ok) {
      const data = await res.json()
      setItems(data.items)
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) await uploadBatch(e.target.files)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) await uploadBatch(e.dataTransfer.files)
  }

  const handleDelete = async (idx: number) => {
    const removedSrc = items[idx]?.src
    const updated = items.filter((_, i) => i !== idx)
    setItems(updated)
    await saveItems(updated)
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
    const updated = items.map((item, i) => {
      if (!selected.has(i)) return item
      const next = { ...item }
      if (yearNum !== null && !isNaN(yearNum)) next.year = yearNum
      if (bulkApplyMedium) next.medium = bulkMedium.length ? bulkMedium : ['3D']
      return next
    })
    setItems(updated)
    await saveItems(updated)
    setStatus(`✓ Updated ${selected.size} item${selected.size !== 1 ? 's' : ''}`)
    setBulkYear('')
    setBulkApplyMedium(false)
    setTimeout(() => setStatus(null), 2000)
  }

  const bulkDelete = async () => {
    if (selected.size === 0) return
    const updated = items.filter((_, i) => !selected.has(i))
    setItems(updated)
    await saveItems(updated)
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
    await saveItems(updated)
    setEditIdx(null)
    setStatus('✓ Updated')
    setTimeout(() => setStatus(null), 1500)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-white text-[14px] font-bold uppercase tracking-[0.1em] mb-1">Misc / Experiments</h2>
          <p className="text-white/30 text-[9px]">{items.length} pieces — displayed on both panels in shuffled order</p>
        </div>
        {items.length > 0 && selected.size === 0 && (
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
        )}
      </div>

      {status && (
        <p className={`text-[9px] mb-3 ${status.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{status}</p>
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
            <label className={labelStyle}>Title <span className="text-white/25">(optional — filename used otherwise)</span></label>
            <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} className={inputStyle} placeholder="Leave blank for filename" />
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
            disabled={!bulkYear.trim() && !bulkApplyMedium}
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

        {items.map((item, i) => {
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
              className="flex items-center py-2 border-b border-white/5 hover:bg-white/3 transition-colors group"
              style={{
                opacity: isInFlight ? 0.4 : 1,
                background: selected.has(i) ? 'rgba(255,255,255,0.04)' : undefined,
                borderTop: indicatorAbove ? '2px solid rgba(255,255,255,0.7)' : undefined,
                borderBottom: indicatorBelow ? '2px solid rgba(255,255,255,0.7)' : '1px solid rgba(255,255,255,0.05)',
                cursor: isInFlight ? 'grabbing' : 'default',
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
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} className={`${inputStyle} w-32`} placeholder="Title" />
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
  const [lightVid, setLightVid] = useState('')
  const [darkVid, setDarkVid] = useState('')
  const [figCaption, setFigCaption] = useState('FIG. 001 — MELBOURNE, 2024')
  const [profileLight, setProfileLight] = useState('')
  const [profileDark, setProfileDark] = useState('')

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
        // Load video panel paths
        const infoPage = allPages['info-page'] || {}
        if (infoPage.lightVideoSrc) setLightVid(infoPage.lightVideoSrc)
        if (infoPage.darkVideoSrc) setDarkVid(infoPage.darkVideoSrc)
        if (infoPage.figCaption) setFigCaption(infoPage.figCaption)
        if (infoPage.profileLight) setProfileLight(infoPage.profileLight)
        if (infoPage.profileDark) setProfileDark(infoPage.profileDark)
        // Snapshot the originals so on Save we can detect which media URLs
        // were removed or replaced and free their Blobs.
        originalMediaRef.current = {
          lightVid: infoPage.lightVideoSrc || '',
          darkVid: infoPage.darkVideoSrc || '',
          profileLight: infoPage.profileLight || '',
          profileDark: infoPage.profileDark || '',
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Originals snapshot used on save to diff vs current state for blob cleanup.
  const originalMediaRef = useRef<{ lightVid: string; darkVid: string; profileLight: string; profileDark: string }>({
    lightVid: '', darkVid: '', profileLight: '', profileDark: '',
  })

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
      // Save video panel paths to info-page (always, so clearing a video
      // also persists — the previous `if (lightVid || darkVid)` guard meant
      // clearing both didn't actually save the empty state).
      await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: 'info-page', fields: { lightVideoSrc: lightVid, darkVideoSrc: darkVid, figCaption, profileLight, profileDark } }),
      })
      // Diff against originals to find media that's no longer referenced and
      // free those Blobs.
      const orig = originalMediaRef.current
      const orphans: string[] = []
      if (orig.lightVid && orig.lightVid !== lightVid) orphans.push(orig.lightVid)
      if (orig.darkVid && orig.darkVid !== darkVid) orphans.push(orig.darkVid)
      if (orig.profileLight && orig.profileLight !== profileLight) orphans.push(orig.profileLight)
      if (orig.profileDark && orig.profileDark !== profileDark) orphans.push(orig.profileDark)
      void deleteBlobUrls(orphans)
      // Update originals so a second save in the same session doesn't re-delete.
      originalMediaRef.current = { lightVid, darkVid, profileLight, profileDark }
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

        {/* Video Panel */}
        <div className="pt-3 mt-3 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-white/60 text-[9px] font-bold uppercase tracking-[0.1em]">Info Page Video Panel</p>
          <p className="text-white/25 text-[7px]">Upload separate videos for light and dark mode. These loop behind the logo grid on the Info page.</p>

          {/* Light mode video */}
          <div className="flex items-center gap-3">
            <label className={labelStyle + ' mb-0 w-[80px] flex-shrink-0'}>Light Mode</label>
            {lightVid ? (
              <div className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <span className="text-white/40 text-[8px] truncate flex-1">{lightVid.split('/').pop()}</span>
                <button onClick={() => setLightVid('')} className="text-red-400/40 text-[7px] hover:text-red-400">✕</button>
              </div>
            ) : (
              <label className="px-3 py-1.5 rounded-full text-[7px] uppercase tracking-[0.1em] font-bold text-white/40 border border-white/12 cursor-pointer hover:border-white/25 transition-all">
                Upload
                <input type="file" className="hidden" accept="video/*" onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return
                  try {
                    const { url } = await uploadFileToBlob(file, 'info-videos', 'light-mode', setStatus)
                    setLightVid(url)
                    setStatus(null)
                  } catch (err) { console.error('Info video upload failed:', err) }
                  e.target.value = ''
                }} />
              </label>
            )}
          </div>

          {/* Dark mode video */}
          <div className="flex items-center gap-3">
            <label className={labelStyle + ' mb-0 w-[80px] flex-shrink-0'}>Dark Mode</label>
            {darkVid ? (
              <div className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <span className="text-white/40 text-[8px] truncate flex-1">{darkVid.split('/').pop()}</span>
                <button onClick={() => setDarkVid('')} className="text-red-400/40 text-[7px] hover:text-red-400">✕</button>
              </div>
            ) : (
              <label className="px-3 py-1.5 rounded-full text-[7px] uppercase tracking-[0.1em] font-bold text-white/40 border border-white/12 cursor-pointer hover:border-white/25 transition-all">
                Upload
                <input type="file" className="hidden" accept="video/*" onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return
                  try {
                    const { url } = await uploadFileToBlob(file, 'info-videos', 'dark-mode', setStatus)
                    setDarkVid(url)
                    setStatus(null)
                  } catch (err) { console.error('Info video upload failed:', err) }
                  e.target.value = ''
                }} />
              </label>
            )}
          </div>
        </div>

        {/* Figure Caption */}
        <div className="pt-3 mt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-white/60 text-[9px] font-bold uppercase tracking-[0.1em] mb-2">Info Page Details</p>
          <div className="mb-3">
            <label className={labelStyle}>Figure Caption (under profile)</label>
            <input type="text" value={figCaption} onChange={e => setFigCaption(e.target.value)} className={inputStyle} placeholder="e.g. FIG. 001 — MELBOURNE, 2024" />
          </div>
        </div>

        {/* Profile Media — light and dark mode */}
        <div className="pt-3 mt-3 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-white/60 text-[9px] font-bold uppercase tracking-[0.1em]">Profile Media (replaces polaroid)</p>
          <p className="text-white/25 text-[7px]">Upload separate videos/images for light and dark mode. WebM with alpha supported.</p>

          {/* Light mode profile */}
          <div className="flex items-center gap-3">
            <label className={labelStyle + ' mb-0 w-[80px] flex-shrink-0'}>Light Mode</label>
            {profileLight ? (
              <div className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <span className="text-white/40 text-[8px] truncate flex-1">{profileLight.split('/').pop()}</span>
                <button onClick={() => setProfileLight('')} className="text-red-400/40 text-[7px] hover:text-red-400">✕</button>
              </div>
            ) : (
              <label className="px-3 py-1.5 rounded-full text-[7px] uppercase tracking-[0.1em] font-bold text-white/40 border border-white/12 cursor-pointer hover:border-white/25 transition-all">
                Upload
                <input type="file" className="hidden" accept="video/*,image/*" onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return
                  try {
                    const { url } = await uploadFileToBlob(file, 'info-profile', 'profile-light', setStatus)
                    setProfileLight(url)
                    setStatus(null)
                  } catch (err) { console.error('Profile upload failed:', err) }
                  e.target.value = ''
                }} />
              </label>
            )}
          </div>

          {/* Dark mode profile */}
          <div className="flex items-center gap-3">
            <label className={labelStyle + ' mb-0 w-[80px] flex-shrink-0'}>Dark Mode</label>
            {profileDark ? (
              <div className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <span className="text-white/40 text-[8px] truncate flex-1">{profileDark.split('/').pop()}</span>
                <button onClick={() => setProfileDark('')} className="text-red-400/40 text-[7px] hover:text-red-400">✕</button>
              </div>
            ) : (
              <label className="px-3 py-1.5 rounded-full text-[7px] uppercase tracking-[0.1em] font-bold text-white/40 border border-white/12 cursor-pointer hover:border-white/25 transition-all">
                Upload
                <input type="file" className="hidden" accept="video/*,image/*" onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return
                  try {
                    const { url } = await uploadFileToBlob(file, 'info-profile', 'profile-dark', setStatus)
                    setProfileDark(url)
                    setStatus(null)
                  } catch (err) { console.error('Profile upload failed:', err) }
                  e.target.value = ''
                }} />
              </label>
            )}
          </div>
        </div>

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
