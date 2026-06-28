import { dumpAll, restoreAll, type RawDump } from './db'
import type { ProjectMeta } from './types'

// A portable, optionally-encrypted backup of every project (metadata + the
// original image + painted-cell progress). Blobs/typed-arrays are base64'd so
// the whole thing is plain JSON. With a password it's AES-256-GCM encrypted
// (key stretched from the password with PBKDF2) — real, not theatre.

const MAGIC = 'oilpix-backup'
const VERSION = 1
const PBKDF2_ITERS = 200_000

interface Serialized {
  magic: typeof MAGIC
  version: number
  exportedAt: string
  projects: ProjectMeta[]
  images: { id: string; type: string; b64: string }[]
  progress: { id: string; b64: string }[]
}

interface EncEnvelope {
  magic: typeof MAGIC
  enc: true
  salt: string
  iv: string
  data: string
}

const te = new TextEncoder()
const td = new TextDecoder()

// ---- base64 <-> bytes (chunked, handles large images) ----
function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}
function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function serialize(): Promise<Serialized> {
  const dump = await dumpAll()
  const images = await Promise.all(
    dump.images.map(async (rec) => ({
      id: rec.id,
      type: rec.blob.type || 'image/png',
      b64: bytesToB64(new Uint8Array(await rec.blob.arrayBuffer())),
    })),
  )
  const progress = dump.progress.map((p) => ({ id: p.id, b64: bytesToB64(p.done) }))
  return {
    magic: MAGIC,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    projects: dump.projects,
    images,
    progress,
  }
}

function deserialize(s: Serialized): RawDump {
  return {
    projects: s.projects,
    images: s.images.map((i) => ({
      id: i.id,
      blob: new Blob([b64ToBytes(i.b64)], { type: i.type }),
    })),
    progress: s.progress.map((p) => ({ id: p.id, done: b64ToBytes(p.b64) })),
  }
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', te.encode(password) as BufferSource, 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

// How many projects a backup file holds, without restoring it (for the UI).
export function backupSummary(text: string): { encrypted: boolean; projects?: number } {
  const o = JSON.parse(text)
  if (o && o.enc === true && o.magic === MAGIC) return { encrypted: true }
  if (o && o.magic === MAGIC) return { encrypted: false, projects: (o.projects ?? []).length }
  throw new Error('NOT_A_BACKUP')
}

// Build a downloadable backup Blob. With a password it's encrypted.
export async function exportBackup(password?: string): Promise<Blob> {
  const json = JSON.stringify(await serialize())
  if (!password) return new Blob([json], { type: 'application/json' })
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(json) as BufferSource),
  )
  const envelope: EncEnvelope = {
    magic: MAGIC,
    enc: true,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    data: bytesToB64(cipher),
  }
  return new Blob([JSON.stringify(envelope)], { type: 'application/json' })
}

// Restore a backup file's text into IndexedDB. Throws 'PASSWORD_REQUIRED',
// 'BAD_PASSWORD', or 'NOT_A_BACKUP' so the UI can react.
export async function importBackup(
  text: string,
  opts: { password?: string; replace?: boolean },
): Promise<{ projects: number }> {
  const parsed = JSON.parse(text)
  let json: string
  if (parsed && parsed.enc === true) {
    if (!opts.password) throw new Error('PASSWORD_REQUIRED')
    const key = await deriveKey(opts.password, b64ToBytes(parsed.salt))
    let plain: ArrayBuffer
    try {
      plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b64ToBytes(parsed.iv) },
        key,
        b64ToBytes(parsed.data),
      )
    } catch {
      throw new Error('BAD_PASSWORD')
    }
    json = td.decode(plain)
  } else {
    json = text
  }
  const s = JSON.parse(json) as Serialized
  if (s.magic !== MAGIC) throw new Error('NOT_A_BACKUP')
  const dump = deserialize(s)
  await restoreAll(dump, opts.replace ?? false)
  return { projects: dump.projects.length }
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
