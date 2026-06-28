import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { deriveGrid } from '../lib/sizing'
import { defaultSettings, type ProjectMeta } from './types'

// IndexedDB layout: metadata, the original image blob, and completion state are
// kept in separate stores so switching projects only loads what it needs.
interface PaintDB extends DBSchema {
  projects: { key: string; value: ProjectMeta }
  images: { key: string; value: { id: string; blob: Blob } }
  progress: { key: string; value: { id: string; done: Uint8Array } }
}

const DB_NAME = 'oil-pixel-guide'
const DB_VERSION = 1

let dbp: Promise<IDBPDatabase<PaintDB>> | null = null

function db(): Promise<IDBPDatabase<PaintDB>> {
  if (!dbp) {
    dbp = openDB<PaintDB>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        d.createObjectStore('projects', { keyPath: 'id' })
        d.createObjectStore('images', { keyPath: 'id' })
        d.createObjectStore('progress', { keyPath: 'id' })
      },
    })
  }
  return dbp
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'p_' + Math.abs(Date.now() ^ (Math.random() * 1e9)).toString(36)
}

// ---- Projects -------------------------------------------------------------

export async function listProjects(): Promise<ProjectMeta[]> {
  const all = await (await db()).getAll('projects')
  return all.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
}

export async function getProject(id: string): Promise<ProjectMeta | undefined> {
  return (await db()).get('projects', id)
}

export async function putProject(meta: ProjectMeta): Promise<void> {
  await (await db()).put('projects', meta)
}

export async function touchProject(id: string): Promise<void> {
  const m = await getProject(id)
  if (m) {
    m.lastOpenedAt = Date.now()
    await putProject(m)
  }
}

export async function renameProject(id: string, name: string): Promise<void> {
  const m = await getProject(id)
  if (m) {
    m.name = name
    await putProject(m)
  }
}

export async function deleteProject(id: string): Promise<void> {
  const d = await db()
  await Promise.all([
    d.delete('projects', id),
    d.delete('images', id),
    d.delete('progress', id),
  ])
}

export async function createProject(
  name: string,
  blob: Blob,
  imageW: number,
  imageH: number,
  thumbDataUrl: string,
): Promise<ProjectMeta> {
  const id = newId()
  const now = Date.now()
  const settings = defaultSettings(imageW, imageH)
  const { cols, rows } = deriveGrid(
    settings.imageWidthMM,
    settings.imageHeightMM,
    settings.pixelSizeMM,
  )
  const meta: ProjectMeta = {
    id,
    name: name.trim() || 'Untitled',
    createdAt: now,
    lastOpenedAt: now,
    imageW,
    imageH,
    imageType: blob.type || 'image/png',
    thumbDataUrl,
    settings,
    cols,
    rows,
  }
  const d = await db()
  await d.put('projects', meta)
  await d.put('images', { id, blob })
  return meta
}

export async function duplicateProject(id: string): Promise<ProjectMeta | undefined> {
  const src = await getProject(id)
  if (!src) return undefined
  const d = await db()
  const img = await d.get('images', id)
  const prog = await d.get('progress', id)
  const newIdStr = newId()
  const now = Date.now()
  const copy: ProjectMeta = {
    ...src,
    id: newIdStr,
    name: src.name + ' copy',
    createdAt: now,
    lastOpenedAt: now,
    settings: { ...src.settings },
  }
  await d.put('projects', copy)
  if (img) await d.put('images', { id: newIdStr, blob: img.blob })
  if (prog) await d.put('progress', { id: newIdStr, done: new Uint8Array(prog.done) })
  return copy
}

// ---- Images & progress ----------------------------------------------------

export async function getImageBlob(id: string): Promise<Blob | undefined> {
  const rec = await (await db()).get('images', id)
  return rec?.blob
}

export async function getProgress(id: string): Promise<Uint8Array | undefined> {
  const rec = await (await db()).get('progress', id)
  return rec?.done
}

export async function putProgress(id: string, done: Uint8Array): Promise<void> {
  await (await db()).put('progress', { id, done })
}

// ---- Backup (export / import all data) ------------------------------------

export interface RawDump {
  projects: ProjectMeta[]
  images: { id: string; blob: Blob }[]
  progress: { id: string; done: Uint8Array }[]
}

// Read every record from every store — the whole local library.
export async function dumpAll(): Promise<RawDump> {
  const d = await db()
  const [projects, images, progress] = await Promise.all([
    d.getAll('projects'),
    d.getAll('images'),
    d.getAll('progress'),
  ])
  return { projects, images, progress }
}

// Write records back. `replace` wipes everything first (full restore);
// otherwise the records are merged in (existing projects with the same id win
// nothing — they're overwritten by the backup).
export async function restoreAll(dump: RawDump, replace = false): Promise<void> {
  const d = await db()
  if (replace) {
    await Promise.all([d.clear('projects'), d.clear('images'), d.clear('progress')])
  }
  const tx = d.transaction(['projects', 'images', 'progress'], 'readwrite')
  await Promise.all([
    ...dump.projects.map((p) => tx.objectStore('projects').put(p)),
    ...dump.images.map((i) => tx.objectStore('images').put(i)),
    ...dump.progress.map((p) => tx.objectStore('progress').put(p)),
    tx.done,
  ])
}
