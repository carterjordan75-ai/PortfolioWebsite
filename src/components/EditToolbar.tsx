'use client'

import { useState } from 'react'
import { useEditMode } from '@/contexts/EditModeContext'
import { motion, AnimatePresence } from 'framer-motion'

export default function EditToolbar() {
  const { editMode, setEditMode, pendingChanges, clearChanges, changeCount } = useEditMode()
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [savedCount, setSavedCount] = useState(0)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  const handleSave = async () => {
    setSaveState('saving')
    setErrorDetail(null)
    try {
      const pageKeys = ['info-page', 'look-page', 'experiments-page', 'work-page']

      let ok = 0
      const failed: string[] = []
      for (const [slug, fields] of Object.entries(pendingChanges)) {
        if (pageKeys.includes(slug)) {
          const res = await fetch('/api/pages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId: slug, fields }),
          })
          if (res.ok) ok++
          else {
            console.error('Page save failed:', slug, await res.text())
            failed.push(slug)
          }
        } else {
          const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'update',
              slug,
              project: fields,
            }),
          })
          if (res.ok) ok++
          else {
            console.error('Project save failed:', slug, await res.text())
            failed.push(slug)
          }
        }
      }
      setSavedCount(ok)
      if (failed.length > 0) {
        setErrorDetail(`${failed.length} failed: ${failed.join(', ')}`)
        setSaveState('error')
        // Don't auto-clear failures — user needs to see them.
      } else {
        setSaveState('saved')
        clearChanges()
        // Tell anyone listening (project page, etc.) to refetch their
        // admin-managed data. Without this, EditableText's defaultValue
        // stayed stale and saved edits looked like they reverted as soon
        // as pendingChanges cleared.
        window.dispatchEvent(new CustomEvent('admin-saved', { detail: { savedCount: ok } }))
        // Stay in edit mode after save so the user can keep editing. The
        // pill shows ✓ Saved for 4s, then fades back to idle.
        setTimeout(() => setSaveState('idle'), 4000)
      }
    } catch (err) {
      setErrorDetail(String(err))
      setSaveState('error')
    }
  }

  const handleCancel = () => {
    clearChanges()
    setEditMode(false)
  }

  // Exit edit mode WITHOUT touching pendingChanges — so a user who just
  // wants to preview the page can flip back to view mode and re-enter
  // edit mode later with their unsaved edits intact. If there are unsaved
  // changes we confirm before leaving so they don't lose work by accident.
  const handleExitToView = () => {
    if (changeCount > 0) {
      const ok = window.confirm(
        `You have ${changeCount} unsaved change${changeCount === 1 ? '' : 's'}. Exit anyway? Your edits will be kept until you save or discard.`,
      )
      if (!ok) return
    }
    setEditMode(false)
  }

  return (
    <AnimatePresence>
      {editMode && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-4 px-6 py-3 rounded-full"
          style={{
            background: 'rgba(0, 0, 0, 0.9)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              saveState === 'saving' ? 'bg-blue-300 animate-ping' :
              saveState === 'saved' ? 'bg-green-400' :
              saveState === 'error' ? 'bg-red-400' :
              'bg-blue-400 animate-pulse'
            }`} />
            <span className="text-white/70 text-[10px] uppercase tracking-[0.12em] font-bold">Edit Mode</span>
          </div>

          {saveState === 'idle' && changeCount > 0 && (
            <span className="text-yellow-400/80 text-[9px] font-mono">
              {changeCount} pending
            </span>
          )}

          {saveState === 'saved' && (
            <span className="text-green-400 text-[10px] font-bold uppercase tracking-[0.1em]">
              ✓ Saved {savedCount} change{savedCount !== 1 ? 's' : ''}
            </span>
          )}

          {saveState === 'error' && (
            <span className="text-red-400 text-[10px] font-bold uppercase tracking-[0.1em]" title={errorDetail || undefined}>
              ✗ Save failed{errorDetail ? ` (${errorDetail.slice(0, 40)}${errorDetail.length > 40 ? '…' : ''})` : ''}
            </span>
          )}

          <div className="w-px h-4 bg-white/15" />

          <button
            onClick={handleSave}
            disabled={saveState === 'saving' || (changeCount === 0 && saveState === 'idle')}
            className="px-4 py-1.5 rounded-full text-[9px] uppercase tracking-[0.1em] font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background:
                saveState === 'saved' ? 'rgba(34,197,94,0.85)' :
                saveState === 'error' ? 'rgba(248,113,113,0.85)' :
                saveState === 'saving' ? 'rgba(59, 130, 246, 0.5)' :
                changeCount > 0 ? 'rgba(59, 130, 246, 0.8)' : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
            }}
          >
            {saveState === 'saving' && '⟳ Saving…'}
            {saveState === 'saved' && '✓ Saved'}
            {saveState === 'error' && '↻ Retry'}
            {saveState === 'idle' && 'Save All'}
          </button>

          <button
            onClick={handleExitToView}
            title="Exit edit mode (keep any unsaved edits in memory)"
            className="px-4 py-1.5 rounded-full text-[9px] uppercase tracking-[0.1em] font-bold text-white/70 hover:text-white transition-all hover:scale-105 active:scale-95"
            style={{ border: '1px solid rgba(255, 255, 255, 0.2)' }}
          >
            ← View
          </button>

          <button
            onClick={handleCancel}
            title="Discard all pending changes and exit edit mode"
            className="px-4 py-1.5 rounded-full text-[9px] uppercase tracking-[0.1em] font-bold text-white/50 hover:text-white/80 transition-all hover:scale-105 active:scale-95"
            style={{ border: '1px solid rgba(255, 255, 255, 0.15)' }}
          >
            Discard
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
