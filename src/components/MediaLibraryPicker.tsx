'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Drawer-style picker that lists every media file already in the project's
 * Vercel Blob store, lets the user multi-select, and returns the picks as
 * `{ name, url }` pairs the same shape the upload flow produces.
 *
 * Use it from the inline project drawer (ProjectMediaPanel) — clicking
 * "Add from library" opens this panel so the user can pull existing home
 * videos / misc clips / other projects' media into the current project
 * without re-uploading.
 *
 * Important: items added this way SHARE the Blob URL with their original
 * location. Deleting/replacing them from the new project should NOT delete
 * the Blob (since it's still referenced by the original). ProjectMediaPanel
 * handles that by only cascade-deleting blobs whose pathname lives inside
 * `media/projects/<slug>/` — library picks live in other folders so they're
 * safe.
 */

type StorageItem = {
  pathname: string
  url: string
  size: number
  uploadedAt?: string
  referenced?: boolean
}

const MEDIA_EXT = /\.(jpe?g|png|gif|webp|avif|svg|mp4|webm|mov|m4v)$/i
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i

function formatSize(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Group items by their top-level Blob folder so the user can filter by
 * source — e.g. only show home videos, or only show another project's
 * media. The pathname looks like `media/<section>/<file>` so the second
 * segment is the section.
 */
function sectionOf(pathname: string): string {
  const parts = pathname.split('/')
  if (parts[0] !== 'media') return parts[0] || 'other'
  // For projects, surface the slug too so each project is its own group.
  if (parts[1] === 'projects' && parts[2]) return `projects/${parts[2]}`
  return parts[1] || 'other'
}

export default function MediaLibraryPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (items: { name: string; url: string }[]) => void
}) {
  const [items, setItems] = useState<StorageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [section, setSection] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'video' | 'image'>('all')

  // Fetch once per open. Reuses the existing /api/storage-list endpoint that
  // the admin Storage panel uses, so any blob in the store is pickable.
  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    fetch('/api/storage-list')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(String(data.error)); return }
        const all = (data.items || []) as StorageItem[]
        // Only show actual media files. Filter out JSON metadata blobs etc.
        const media = all.filter(it => MEDIA_EXT.test(it.pathname))
        setItems(media)
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [open])

  // Unique section list for the dropdown — derived from current items.
  const sectionOptions = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) set.add(sectionOf(it.pathname))
    return ['all', ...Array.from(set).sort()]
  }, [items])

  const visible = useMemo(() => {
    const q = filter.toLowerCase().trim()
    return items
      .filter(it => section === 'all' || sectionOf(it.pathname) === section)
      .filter(it => typeFilter === 'all'
        || (typeFilter === 'video' && VIDEO_EXT.test(it.pathname))
        || (typeFilter === 'image' && !VIDEO_EXT.test(it.pathname)))
      .filter(it => !q || it.pathname.toLowerCase().includes(q))
  }, [items, filter, section, typeFilter])

  const toggle = (url: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url); else next.add(url)
      return next
    })
  }

  const selectAllVisible = () => setSelected(new Set(visible.map(it => it.url)))
  const clearSelected = () => setSelected(new Set())

  const handleAdd = () => {
    const chosen = visible
      .filter(it => selected.has(it.url))
      .map(it => ({
        name: it.pathname.split('/').pop() || 'file',
        url: it.url,
      }))
    if (chosen.length === 0) return
    onSelect(chosen)
    clearSelected()
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[10020]"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
          />
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="fixed top-0 left-0 bottom-0 z-[10021] flex flex-col"
            style={{
              width: 'min(600px, 96vw)',
              background: '#111',
              color: '#fff',
              borderRight: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '10px 0 40px rgba(0,0,0,0.5)',
            }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h3 className="text-[12px] font-bold uppercase tracking-[0.12em]">Media Library</h3>
                <p className="text-white/40 text-[8px] mt-1 uppercase tracking-[0.1em]">
                  {loading ? 'Loading…' : `${visible.length} of ${items.length} files · pick existing media to reuse`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
              >✕</button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-white/8 text-[8px] uppercase tracking-[0.1em]">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="filter by filename…"
                className="flex-1 min-w-[140px] px-2 py-1.5 rounded bg-white/5 border border-white/10 text-white/80 placeholder-white/25 outline-none focus:border-white/25 text-[10px] tracking-normal normal-case"
              />
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="px-2 py-1.5 rounded bg-white/5 border border-white/10 text-white/70 outline-none cursor-pointer text-[9px]"
              >
                {sectionOptions.map(s => (
                  <option key={s} value={s} className="bg-zinc-900">{s}</option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | 'video' | 'image')}
                className="px-2 py-1.5 rounded bg-white/5 border border-white/10 text-white/70 outline-none cursor-pointer text-[9px]"
              >
                <option value="all" className="bg-zinc-900">all types</option>
                <option value="video" className="bg-zinc-900">videos</option>
                <option value="image" className="bg-zinc-900">images</option>
              </select>
            </div>

            {/* Bulk toolbar */}
            <div className="flex items-center gap-2 px-5 py-2 border-b border-white/8 text-[8px] uppercase tracking-[0.1em]">
              <span className="text-white/70 font-bold">{selected.size} selected</span>
              <button onClick={clearSelected} disabled={selected.size === 0} className="text-white/40 hover:text-white disabled:opacity-30">clear</button>
              <button onClick={selectAllVisible} className="text-white/60 hover:text-white">select visible</button>
              <div className="flex-1" />
              <button
                onClick={handleAdd}
                disabled={selected.size === 0}
                className="px-3 py-1.5 rounded-full text-[8px] font-bold text-white bg-blue-500/85 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                + Add {selected.size} to project
              </button>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-3">
              {loading && (
                <p className="text-white/40 text-[9px] py-8 text-center">Loading library…</p>
              )}
              {error && (
                <p className="text-red-400 text-[9px] py-4">✗ {error}</p>
              )}
              {!loading && !error && visible.length === 0 && (
                <p className="text-white/30 text-[9px] py-8 text-center">No files match the current filters.</p>
              )}
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                {visible.map((it) => {
                  const isSel = selected.has(it.url)
                  const isVideo = VIDEO_EXT.test(it.pathname)
                  return (
                    <button
                      key={it.url}
                      onClick={() => toggle(it.url)}
                      className={`relative aspect-square overflow-hidden rounded-lg border text-left transition-all ${
                        isSel ? 'border-blue-400 ring-2 ring-blue-400/40' : 'border-white/10 hover:border-white/30'
                      }`}
                      style={{ background: '#000' }}
                    >
                      {isVideo ? (
                        <video src={it.url} muted className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.url} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                      )}
                      {/* Tag indicating section + size */}
                      <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 flex items-center justify-between bg-gradient-to-t from-black/85 to-transparent">
                        <span className="text-[7px] uppercase tracking-[0.08em] text-white/80 font-bold truncate">
                          {sectionOf(it.pathname)}
                        </span>
                        <span className="text-[7px] text-white/50 ml-1 flex-shrink-0">{formatSize(it.size)}</span>
                      </div>
                      {/* Selected indicator */}
                      <div
                        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-all"
                        style={{
                          background: isSel ? 'rgb(59, 130, 246)' : 'rgba(0,0,0,0.55)',
                          border: `1px solid ${isSel ? 'rgb(59, 130, 246)' : 'rgba(255,255,255,0.4)'}`,
                          color: '#fff',
                        }}
                      >
                        {isSel && <span className="text-[10px] font-bold">✓</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
