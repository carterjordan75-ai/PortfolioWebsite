'use client'

import { useState } from 'react'
import { useEditMode } from '@/contexts/EditModeContext'
import { motion, AnimatePresence } from 'framer-motion'

export default function EditToolbar() {
  const { editMode, setEditMode, pendingChanges, clearChanges, changeCount } = useEditMode()
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      const pageKeys = ['info-page', 'look-page', 'experiments-page', 'work-page']

      let savedCount = 0
      for (const [slug, fields] of Object.entries(pendingChanges)) {
        if (pageKeys.includes(slug)) {
          const res = await fetch('/api/pages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId: slug, fields }),
          })
          if (res.ok) savedCount++
          else console.error('Page save failed:', slug, await res.text())
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
          if (res.ok) savedCount++
          else console.error('Project save failed:', slug, await res.text())
        }
      }
      setStatus(`Saved ${savedCount} change${savedCount !== 1 ? 's' : ''}`)
      clearChanges()
      setTimeout(() => {
        setStatus(null)
        setEditMode(false)
      }, 1500)
    } catch {
      setStatus('Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    clearChanges()
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
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-white/70 text-[10px] uppercase tracking-[0.12em] font-bold">Edit Mode</span>
          </div>

          {changeCount > 0 && (
            <span className="text-yellow-400/80 text-[9px] font-mono">
              {changeCount} pending
            </span>
          )}

          {status && (
            <span className={`text-[9px] font-mono ${status.includes('fail') ? 'text-red-400' : 'text-green-400'}`}>
              {status}
            </span>
          )}

          <div className="w-px h-4 bg-white/15" />

          <button
            onClick={handleSave}
            disabled={saving || changeCount === 0}
            className="px-4 py-1.5 rounded-full text-[9px] uppercase tracking-[0.1em] font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
            style={{
              background: changeCount > 0 ? 'rgba(59, 130, 246, 0.8)' : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
            }}
          >
            {saving ? 'Saving...' : 'Save All'}
          </button>

          <button
            onClick={handleCancel}
            className="px-4 py-1.5 rounded-full text-[9px] uppercase tracking-[0.1em] font-bold text-white/50 hover:text-white/80 transition-all hover:scale-105 active:scale-95"
            style={{ border: '1px solid rgba(255, 255, 255, 0.15)' }}
          >
            Cancel
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
