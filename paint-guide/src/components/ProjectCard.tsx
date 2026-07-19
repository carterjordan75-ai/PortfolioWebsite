import type { ProjectMeta } from '../db/types'
import { pct, timeAgo } from '../lib/count'

interface Props {
  meta: ProjectMeta
  donePixels: number
  onOpen: () => void
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
}

export default function ProjectCard({
  meta,
  donePixels,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: Props) {
  const total = meta.cols * meta.rows
  const percent = pct(donePixels, total)

  return (
    <div className="card">
      {meta.thumbDataUrl ? (
        <img className="thumb" src={meta.thumbDataUrl} alt={meta.name} onClick={onOpen} />
      ) : (
        <div className="thumb" onClick={onOpen} />
      )}
      <div className="body">
        <div className="name" onClick={onOpen} title={meta.name}>
          {meta.name}
        </div>
        <div className="meta-row">
          <span>
            {meta.cols} × {meta.rows} · {total.toLocaleString()} px
          </span>
          <span>{timeAgo(meta.lastOpenedAt)}</span>
        </div>
        <div className={'bar' + (percent === 100 ? ' good' : '')}>
          <i style={{ width: `${percent}%` }} />
        </div>
        <div className="meta-row">
          <span>{percent}% painted</span>
          <span>
            {donePixels.toLocaleString()} / {total.toLocaleString()}
          </span>
        </div>
        <div className="actions">
          <button className="btn sm primary" onClick={onOpen}>
            Open
          </button>
          <button className="btn sm icon ghost" title="Rename" onClick={onRename}>
            ✎
          </button>
          <button className="btn sm icon ghost" title="Duplicate" onClick={onDuplicate}>
            ⧉
          </button>
          <button className="btn sm icon ghost danger" title="Delete" onClick={onDelete}>
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
