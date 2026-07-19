import { useRef, useState } from 'react'
import { exportBackup, importBackup, backupSummary, downloadBlob } from '../db/backup'

type Msg = { kind: 'ok' | 'err'; text: string } | null

// Export / import the whole local library as a file — optionally AES-256
// encrypted with a password. This is the real backup: paintings live only in
// this browser otherwise.
export default function BackupDialog({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: () => void
}) {
  const [exportPw, setExportPw] = useState('')
  const [importPw, setImportPw] = useState('')
  const [replace, setReplace] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const [pending, setPending] = useState<
    { text: string; encrypted: boolean; projects?: number; name: string } | null
  >(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function doExport() {
    setBusy(true)
    setMsg(null)
    try {
      const blob = await exportBackup(exportPw || undefined)
      const stamp = new Date().toISOString().slice(0, 10)
      downloadBlob(blob, `oil-pixel-backup-${stamp}${exportPw ? '-encrypted' : ''}.json`)
      setMsg({
        kind: 'ok',
        text: exportPw ? 'Encrypted backup downloaded — keep the password safe.' : 'Backup downloaded.',
      })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Export failed: ' + (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function onFile(file: File) {
    setMsg(null)
    try {
      const text = await file.text()
      const sum = backupSummary(text)
      setPending({ text, encrypted: sum.encrypted, projects: sum.projects, name: file.name })
      setImportPw('')
    } catch {
      setMsg({ kind: 'err', text: 'That doesn’t look like a backup file.' })
    }
  }

  async function doImport() {
    if (!pending) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await importBackup(pending.text, { password: importPw || undefined, replace })
      setMsg({ kind: 'ok', text: `Restored ${res.projects} painting${res.projects === 1 ? '' : 's'}.` })
      setPending(null)
      onImported()
    } catch (e) {
      const m = (e as Error).message
      setMsg({
        kind: 'err',
        text:
          m === 'PASSWORD_REQUIRED'
            ? 'This backup is encrypted — enter its password.'
            : m === 'BAD_PASSWORD'
              ? 'Wrong password.'
              : 'Import failed: ' + m,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="inline" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Back up &amp; restore</h2>
          <button className="btn sm icon ghost" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="notice info">
          <span>
            Your paintings are saved <b>only in this browser</b>. Export a file to keep them safe or
            move them to another computer. A password encrypts the file (AES-256) — store it
            somewhere safe, there’s no recovery.
          </span>
        </div>

        <div className="field">
          <label>Export — download a backup of everything</label>
          <input
            className="input"
            type="password"
            placeholder="Password to encrypt (recommended)"
            value={exportPw}
            autoComplete="new-password"
            onChange={(e) => setExportPw(e.target.value)}
          />
          <button className="btn primary" style={{ marginTop: 8 }} disabled={busy} onClick={doExport}>
            ⬇ Download backup{exportPw ? ' (encrypted)' : ''}
          </button>
        </div>

        <div className="field">
          <label>Import — restore from a backup file</label>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
              e.target.value = ''
            }}
          />
          <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            Choose backup file…
          </button>
          {pending && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="tiny muted">
                {pending.name} —{' '}
                {pending.encrypted ? 'encrypted' : `${pending.projects} painting(s)`}
              </div>
              {pending.encrypted && (
                <input
                  className="input"
                  type="password"
                  placeholder="Backup password"
                  value={importPw}
                  autoComplete="off"
                  onChange={(e) => setImportPw(e.target.value)}
                />
              )}
              <label className="inline tiny muted" style={{ gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={replace}
                  onChange={(e) => setReplace(e.target.checked)}
                />
                Replace everything (otherwise merge into what’s here)
              </label>
              <button className="btn primary" disabled={busy} onClick={doImport}>
                Restore
              </button>
            </div>
          )}
        </div>

        {msg && (
          <div className={'notice ' + (msg.kind === 'err' ? 'warn' : 'info')}>
            <span>{msg.text}</span>
          </div>
        )}
      </div>
    </div>
  )
}
