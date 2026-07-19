import { useEffect, useRef, useState } from 'react'
import { createProject } from '../db/db'
import { makeThumbnail } from '../lib/thumbnail'

interface Props {
  onClose: () => void
  onCreated: (id: string) => void
}

export default function NewProjectDialog({ onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function pickFile(f: File | null | undefined) {
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setErr('Please choose an image file.')
      return
    }
    setErr('')
    setFile(f)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(f))
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
  }

  async function create() {
    if (!file || busy) return
    setBusy(true)
    setErr('')
    try {
      const { dataUrl, width, height } = await makeThumbnail(file)
      const meta = await createProject(name, file, width, height, dataUrl)
      onCreated(meta.id)
    } catch (e) {
      setErr('Could not read that image. Try a different file.')
      setBusy(false)
    }
  }

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>New painting</h2>

        <div className="field">
          <label>Project name</label>
          <input
            className="input"
            value={name}
            autoFocus
            placeholder="e.g. Harbour at dusk"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && file && create()}
          />
        </div>

        <div className="field">
          <label>Reference image</label>
          <div
            className={'dropzone' + (over ? ' over' : '')}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              pickFile(e.dataTransfer.files?.[0])
            }}
          >
            {previewUrl ? (
              <img src={previewUrl} alt="preview" />
            ) : (
              <>
                <div style={{ fontSize: 24, marginBottom: 6 }}>🖼️</div>
                <div>Drop an image here, or click to browse</div>
                <div className="tiny muted" style={{ marginTop: 6 }}>
                  Simpler, lower-colour images work best for fine pixel sizes.
                </div>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </div>

        {err && <div className="notice warn">⚠ {err}</div>}

        <div className="row-end">
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={create} disabled={!file || busy}>
            {busy ? 'Creating…' : 'Create painting'}
          </button>
        </div>
      </div>
    </div>
  )
}
