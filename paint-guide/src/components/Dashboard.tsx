import { useCallback, useEffect, useState } from 'react'
import {
  deleteProject,
  duplicateProject,
  getProgress,
  listProjects,
  renameProject,
} from '../db/db'
import type { ProjectMeta } from '../db/types'
import { countDone } from '../lib/count'
import ProjectCard from './ProjectCard'
import NewProjectDialog from './NewProjectDialog'
import BackupDialog from './BackupDialog'

interface Row {
  meta: ProjectMeta
  donePixels: number
}

export default function Dashboard({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [showBackup, setShowBackup] = useState(false)

  const refresh = useCallback(async () => {
    const metas = await listProjects()
    const withProgress = await Promise.all(
      metas.map(async (meta) => ({
        meta,
        donePixels: countDone(await getProgress(meta.id)),
      })),
    )
    setRows(withProgress)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleRename(meta: ProjectMeta) {
    const next = window.prompt('Rename painting', meta.name)
    if (next != null && next.trim()) {
      await renameProject(meta.id, next.trim())
      refresh()
    }
  }

  async function handleDuplicate(id: string) {
    await duplicateProject(id)
    refresh()
  }

  async function handleDelete(meta: ProjectMeta) {
    if (window.confirm(`Delete "${meta.name}"? This can't be undone.`)) {
      await deleteProject(meta.id)
      refresh()
    }
  }

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <h1 className="title">Oil Pixel Painting Guide</h1>
          <p className="sub">
            Turn a reference image into a paint-by-pixel guide — real-world size,
            mixed colour by colour, ticked off as you go.
          </p>
        </div>
        <div className="inline" style={{ gap: 8 }}>
          <button className="btn" onClick={() => setShowBackup(true)} title="Back up or restore your paintings">
            ⤓ Backup
          </button>
          <button className="btn primary" onClick={() => setShowNew(true)}>
            + New painting
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : (
        <div className="grid">
          {rows.map(({ meta, donePixels }) => (
            <ProjectCard
              key={meta.id}
              meta={meta}
              donePixels={donePixels}
              onOpen={() => onOpen(meta.id)}
              onRename={() => handleRename(meta)}
              onDuplicate={() => handleDuplicate(meta.id)}
              onDelete={() => handleDelete(meta)}
            />
          ))}
          <button className="card-new" onClick={() => setShowNew(true)}>
            <span className="plus">+</span>
            <span>New painting</span>
          </button>
        </div>
      )}

      {showNew && (
        <NewProjectDialog
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false)
            onOpen(id)
          }}
        />
      )}

      {showBackup && (
        <BackupDialog onClose={() => setShowBackup(false)} onImported={refresh} />
      )}
    </div>
  )
}
