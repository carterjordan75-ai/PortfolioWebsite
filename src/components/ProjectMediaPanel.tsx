'use client'

import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { upload } from '@vercel/blob/client'
import { downloadAssetsZip } from '@/lib/downloadZip'
import { prepareForUpload } from '@/lib/convertVideo'

/**
 * In-page media manager for a single featured project.
 *
 * Opens as a right-side drawer on the project page when in edit mode. Lists
 * every media item the admin has uploaded for this project, with:
 *   - drag handle to reorder
 *   - "Replace" to upload a new file in place
 *   - delete (✕)
 *   - "Add" button at the end to extend the list
 *
 * Every mutation persists immediately to /api/projects via the `update`
 * action (no batched save). Local state mirrors the saved list so the page
 * reflects changes instantly.
 *
 * Files are uploaded direct-to-Blob via /api/upload-token (the browser PUTs
 * straight to Vercel Blob, sidestepping the 4.5MB Vercel-Hobby payload cap).
 */

export type ProjectMediaItem = {
  name?: string
  path?: string
  aspect?: string
  // Items sharing the same `rowId` render in one row on the project page
  // (side-by-side, equal-width via flex). Set by the "Group as row" action.
  rowId?: string
}

// Common aspect ratios offered in the per-item dropdown. The `value` is what
// gets stored (a CSS aspect-ratio string); the `label` is what the user sees.
const ASPECT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '16/9',  label: '16:9  · Landscape' },
  { value: '21/9',  label: '21:9  · Cinematic' },
  { value: '1/1',   label: '1:1   · Square' },
  { value: '4/5',   label: '4:5   · Portrait (IG)' },
  { value: '9/16',  label: '9:16  · Vertical' },
  { value: '4/3',   label: '4:3   · Classic' },
  { value: '3/4',   label: '3:4   · Tall' },
  { value: '16/10', label: '16:10 · Wide' },
]

type Props = {
  slug: string
  client: string
  open: boolean
  onClose: () => void
  media: ProjectMediaItem[]
  onChange: (next: ProjectMediaItem[]) => void
}

function slugify(s: string, max = 50): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'file'
}

function isVideo(path: string | undefined): boolean {
  return !!path && /\.(mp4|webm|mov)$/i.test(path)
}

export default function ProjectMediaPanel({ slug, client, open, onClose, media, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const replaceFileRef = useRef<HTMLInputElement>(null)
  const [replacingIdx, setReplacingIdx] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [dragSrc, setDragSrc] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  // Multi-select for grouping items into rows
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null)

  // Stable short id for a new row group
  const makeRowId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

  const toggleSelected = (idx: number, shiftKey = false) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (shiftKey && lastSelectedIdx !== null && lastSelectedIdx !== idx) {
        const [lo, hi] = lastSelectedIdx < idx ? [lastSelectedIdx, idx] : [idx, lastSelectedIdx]
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
  const clearSelected = () => { setSelected(new Set()); setLastSelectedIdx(null) }

  // Group the currently-selected items into one row. The selected items are
  // pulled out, given a shared rowId, then reinserted as a contiguous block
  // at the position of the first selected item — so visually they collapse
  // together immediately and the page renders them as one row.
  const groupSelectedAsRow = async () => {
    if (selected.size < 2) return
    const indices = Array.from(selected).sort((a, b) => a - b)
    const rowId = makeRowId()
    const movingSet = new Set(indices)
    const movedItems = indices.map(i => ({ ...media[i], rowId }))
    const remaining = media.filter((_, i) => !movingSet.has(i))
    const insertAt = Math.max(0, Math.min(remaining.length, indices[0]))
    const next = [
      ...remaining.slice(0, insertAt),
      ...movedItems,
      ...remaining.slice(insertAt),
    ]
    await persist(next)
    setSelected(new Set(movedItems.map((_, i) => insertAt + i)))
    setLastSelectedIdx(insertAt + movedItems.length - 1)
  }

  // Strip rowId from all selected items — they go back to one-per-row.
  const ungroupSelected = async () => {
    if (selected.size === 0) return
    const next = media.map((m, i) => selected.has(i) ? { ...m, rowId: undefined } : m)
    await persist(next)
  }

  // Does the current selection contain any grouped items? Drives whether
  // the Ungroup button is enabled.
  const selectionHasGrouped = Array.from(selected).some(i => !!media[i]?.rowId)

  // Bulk download — zips either the selected items or every item in the
  // panel (when nothing is selected). Pulls the actual source files from
  // their public URLs, no watermarking.
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null)
  const runDownload = async (mode: 'selected' | 'all') => {
    if (downloading) return
    const targets = mode === 'selected'
      ? media.filter((_, i) => selected.has(i))
      : media
    const filesWithPath = targets.filter(m => !!m.path)
    if (filesWithPath.length === 0) return
    setDownloading(true)
    setDownloadProgress({ done: 0, total: filesWithPath.length })
    try {
      await downloadAssetsZip(
        filesWithPath.map((m, i) => ({
          name: m.name || m.path!.split('/').pop() || `file_${i + 1}`,
          url: m.path!,
        })),
        `${slug}_${mode === 'selected' ? 'selected' : 'all'}_${filesWithPath.length}files`,
        (done, total) => setDownloadProgress({ done, total }),
      )
    } catch (err) {
      console.error('Project media download failed:', err)
    } finally {
      setDownloading(false)
      setDownloadProgress(null)
    }
  }

  // Persist a media update to the server, then mirror locally.
  const persist = async (next: ProjectMediaItem[]) => {
    onChange(next)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          slug,
          project: { slug, media: next },
        }),
      })
      // fetch() only rejects on network failure — a 500 from the server
      // resolves normally. Surface non-2xx responses so a Blob-token
      // error doesn't look like a successful save.
      if (!res.ok) {
        let detail = `HTTP ${res.status}`
        try { detail += ': ' + (await res.text()).slice(0, 200) } catch {}
        throw new Error(detail)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Project media save failed:', err)
      setStatus(`✗ Save failed: ${msg}`)
      setTimeout(() => setStatus(null), 4000)
    }
  }

  const uploadFile = async (file: File): Promise<ProjectMediaItem | null> => {
    // MP4 → WebM in the browser before upload (no-op for non-MP4 files).
    const ready = await prepareForUpload(file, (msg) => setStatus(msg))
    if (ready.size === 0) {
      const m = `✗ ${ready.name} is empty (0 bytes) — skipped`
      console.error(m)
      setStatus(m)
      return null
    }
    const extMatch = ready.name.match(/\.[^.]+$/)
    const ext = extMatch ? extMatch[0].toLowerCase() : ''
    const pathname = `media/projects/${slug}/${slugify(client || ready.name.replace(/\.[^.]+$/, ''))}-${Date.now().toString(36)}${ext}`
    setStatus(`Uploading ${ready.name} (${Math.round(ready.size / 1024 / 1024)} MB)…`)
    try {
      const blob = await upload(pathname, ready, {
        access: 'public',
        handleUploadUrl: '/api/upload-token',
      })
      return {
        name: blob.pathname.split('/').pop() || pathname.split('/').pop() || ready.name,
        path: blob.url,
      }
    } catch (err) {
      // Surface the error so we can see WHY an upload failed instead of just
      // silently dropping the file. The previous behaviour ate every upload
      // error and only logged to console — the user would see "✓ Added 0"
      // with no clue what broke.
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Project media upload failed:', err)
      setStatus(`✗ Upload failed for ${ready.name}: ${msg}`)
      return null
    }
  }

  const handleAdd = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    setStatus(null)
    const next = [...media]
    let count = 0
    const total = Array.from(files).length
    for (const file of Array.from(files)) {
      const item = await uploadFile(file)
      if (item) { next.push(item); count++ }
      // Persist incrementally so a network blip mid-batch doesn't lose work.
      await persist([...next])
    }
    setUploading(false)
    // Don't overwrite an upload-failure message with a success counter. Only
    // show "✓ Added N" when N > 0; otherwise leave the failure status on
    // screen for the user to read.
    if (count > 0) {
      setStatus(`✓ Added ${count}${count < total ? ` (${total - count} failed)` : ''}`)
      setTimeout(() => setStatus(null), 1800)
    }
  }

  const handleReplace = async (idx: number, file: File) => {
    setUploadingIdx(idx)
    setStatus(null)
    const item = await uploadFile(file)
    if (item) {
      const next = media.map((m, i) => i === idx ? item : m)
      await persist(next)
      setStatus('✓ Replaced')
    } else {
      setStatus('✗ Replace failed')
    }
    setUploadingIdx(null)
    setReplacingIdx(null)
    setTimeout(() => setStatus(null), 1800)
  }

  const handleDelete = async (idx: number) => {
    const next = media.filter((_, i) => i !== idx)
    await persist(next)
  }

  const handleReorder = async (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= media.length || to >= media.length) return
    const next = [...media]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    await persist(next)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[10010]"
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
          />
          {/* Drawer — z-index sits above the site header (10000) and the
              minimized-header restore pill (10001) so admin status messages
              are never obscured. */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="fixed top-0 right-0 bottom-0 z-[10011] flex flex-col"
            style={{
              width: 'min(520px, 94vw)',
              background: '#111',
              color: '#fff',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h3 className="text-[12px] font-bold uppercase tracking-[0.12em]">{client} — Media</h3>
                <p className="text-white/40 text-[8px] mt-1 uppercase tracking-[0.1em]">
                  {media.length} item{media.length !== 1 ? 's' : ''} · drag to reorder
                </p>
              </div>
              <div className="flex items-center gap-2">
                {media.length > 0 && selected.size === 0 && (
                  <button
                    onClick={() => runDownload('all')}
                    disabled={downloading}
                    className="px-2.5 py-1 rounded-full text-[7px] uppercase tracking-[0.1em] font-bold text-white/70 border border-white/20 hover:bg-white/10 hover:text-white transition-all disabled:opacity-40 disabled:cursor-wait"
                    title="Download every file in this project as a ZIP"
                  >
                    {downloading
                      ? (downloadProgress ? `⏳ ${downloadProgress.done}/${downloadProgress.total}` : '⏳')
                      : `↓ Download all (${media.length})`}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {status && (
              <p className={`mx-5 mt-3 text-[9px] ${status.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{status}</p>
            )}

            {/* Grouping toolbar — appears whenever rows are selected */}
            {selected.size > 0 && (
              <div className="mx-5 mt-3 p-2.5 rounded-lg border border-white/15 bg-white/5 flex flex-wrap items-center gap-2 text-[8px] uppercase tracking-[0.1em]">
                <span className="text-white/80 font-bold">{selected.size} selected</span>
                <button onClick={clearSelected} className="text-white/35 hover:text-white">clear</button>
                <div className="flex-1" />
                <button
                  onClick={groupSelectedAsRow}
                  disabled={selected.size < 2}
                  className="px-2.5 py-1 rounded text-[7px] font-bold text-green-400 border border-green-400/30 hover:bg-green-400/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Place selected items side-by-side in one row on the page"
                >
                  Group as row
                </button>
                <button
                  onClick={ungroupSelected}
                  disabled={!selectionHasGrouped}
                  className="px-2.5 py-1 rounded text-[7px] font-bold text-white/70 border border-white/20 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Ungroup
                </button>
                <button
                  onClick={() => runDownload('selected')}
                  disabled={downloading}
                  className="px-2.5 py-1 rounded text-[7px] font-bold text-white/80 border border-white/25 hover:bg-white/10 disabled:opacity-40 disabled:cursor-wait"
                  title="Download original files for the selected items as a ZIP"
                >
                  {downloading
                    ? (downloadProgress ? `⏳ ${downloadProgress.done}/${downloadProgress.total}` : '⏳ Zipping…')
                    : `↓ Download (${selected.size})`}
                </button>
              </div>
            )}

            {/* Item list */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {media.length === 0 && (
                <p className="text-white/30 text-[9px] py-8 text-center">
                  No media yet. Click <span className="text-white/60 font-bold">Add</span> below to upload.
                </p>
              )}
              {/* Compute the visible "Row N" labels — one number per distinct
                  rowId encountered (in order), so the user can see at a glance
                  which items will end up in the same row on the page. */}
              {(() => null)()}
              {media.map((item, i) => {
                const indicatorAbove = dragOver === i && dragSrc !== null && dragSrc > i
                const indicatorBelow = dragOver === i && dragSrc !== null && dragSrc < i
                const inGroup = !!item.rowId
                // Distinct row-index for label/colour: walk earlier items and
                // count distinct rowIds.
                let rowLabel = ''
                let rowColor: string | undefined
                if (inGroup) {
                  const seen: string[] = []
                  for (let k = 0; k <= i; k++) {
                    const r = media[k]?.rowId
                    if (r && !seen.includes(r)) seen.push(r)
                  }
                  const num = seen.indexOf(item.rowId!) + 1
                  rowLabel = `Row ${num}`
                  // Deterministic hue per rowId
                  let h = 0
                  for (const ch of item.rowId!) h = (h * 31 + ch.charCodeAt(0)) & 0xffff
                  rowColor = `hsl(${h % 360} 70% 60%)`
                }
                return (
                  <div
                    key={`${item.path}-${i}`}
                    draggable
                    onDragStart={(e) => {
                      setDragSrc(i)
                      e.dataTransfer.effectAllowed = 'move'
                      try { e.dataTransfer.setData('text/plain', String(i)) } catch {}
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (dragSrc !== null && dragSrc !== i) setDragOver(i)
                    }}
                    onDragLeave={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node)) return
                      setDragOver(prev => prev === i ? null : prev)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (dragSrc !== null && dragSrc !== i) handleReorder(dragSrc, i)
                      setDragSrc(null)
                      setDragOver(null)
                    }}
                    onDragEnd={() => { setDragSrc(null); setDragOver(null) }}
                    className="flex items-center gap-3 p-2 rounded-lg border border-white/8 bg-white/3 hover:bg-white/5 transition-colors group"
                    style={{
                      opacity: dragSrc === i ? 0.4 : 1,
                      borderLeft: inGroup ? `3px solid ${rowColor}` : '3px solid transparent',
                      borderTop: indicatorAbove ? '2px solid rgba(255,255,255,0.6)' : undefined,
                      borderBottom: indicatorBelow ? '2px solid rgba(255,255,255,0.6)' : undefined,
                      cursor: dragSrc === i ? 'grabbing' : 'default',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      onChange={() => { /* state via onClick to capture shiftKey */ }}
                      onClick={(e) => { e.stopPropagation(); toggleSelected(i, e.shiftKey) }}
                      className="accent-white cursor-pointer flex-shrink-0"
                      title="Click to toggle · Shift+click to select a range"
                    />
                    <span className="text-white/30 group-hover:text-white/60 text-[14px] select-none" style={{ cursor: 'grab' }} title="Drag to reorder">
                      ⋮⋮
                    </span>
                    <div className="w-14 h-14 rounded overflow-hidden bg-black flex-shrink-0">
                      {item.path && (isVideo(item.path) ? (
                        <video src={item.path} muted className="w-full h-full object-cover" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.path} alt="" className="w-full h-full object-cover" />
                      ))}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/80 text-[10px] truncate" title={item.name || item.path}>
                        {String(i + 1).padStart(2, '0')} · {item.name || item.path?.split('/').pop()}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-white/30 text-[7px] uppercase tracking-[0.1em] flex-shrink-0">
                          {item.path ? (isVideo(item.path) ? 'Video' : 'Image') : '—'}
                        </span>
                        {rowLabel && (
                          <span
                            className="text-[7px] uppercase tracking-[0.1em] font-bold px-1.5 py-0.5 rounded-sm flex-shrink-0"
                            style={{ background: `${rowColor}22`, color: rowColor, border: `1px solid ${rowColor}66` }}
                          >
                            {rowLabel}
                          </span>
                        )}
                        <select
                          value={item.aspect || '16/9'}
                          onChange={(e) => {
                            const next = media.map((m, j) => j === i ? { ...m, aspect: e.target.value } : m)
                            persist(next)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="text-[8px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/70 outline-none focus:border-white/25 cursor-pointer"
                          title="Aspect ratio on the project page"
                        >
                          {ASPECT_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value} className="bg-zinc-900 text-white">
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setReplacingIdx(i)
                        replaceFileRef.current?.click()
                      }}
                      disabled={uploadingIdx === i}
                      className="px-2.5 py-1 rounded text-[7px] uppercase tracking-[0.1em] font-bold text-blue-400/70 border border-blue-400/20 hover:bg-blue-400/10 transition-all disabled:opacity-40"
                    >
                      {uploadingIdx === i ? '…' : 'Replace'}
                    </button>
                    <button
                      onClick={() => handleDelete(i)}
                      className="px-2 py-1 rounded text-[8px] text-red-400/60 hover:text-red-400 hover:bg-red-400/10 transition-all"
                      aria-label="Delete"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Footer: Add button */}
            <div className="px-5 py-4 border-t border-white/10">
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept="image/*,video/*"
                multiple
                onChange={(e) => {
                  handleAdd(e.target.files)
                  if (fileRef.current) fileRef.current.value = ''
                }}
              />
              <input
                ref={replaceFileRef}
                type="file"
                className="hidden"
                accept="image/*,video/*"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f && replacingIdx !== null) handleReplace(replacingIdx, f)
                  if (replaceFileRef.current) replaceFileRef.current.value = ''
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full py-2.5 rounded-full text-[9px] uppercase tracking-[0.12em] font-bold text-white/80 border border-white/20 hover:bg-white/5 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50"
              >
                {uploading ? 'Uploading…' : '+ Add media (multi-select OK)'}
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
