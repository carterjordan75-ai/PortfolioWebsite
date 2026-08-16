#!/usr/bin/env node
/**
 * Mirrors everything in Blob storage into the repo.
 *
 * Why this is a pull and not a push: uploads cannot be written into the
 * project folder as they arrive. On Vercel the filesystem is read-only
 * and per-invocation, so anything a route writes is gone the moment the
 * function exits — see the note in lib/blobStore.ts, which was written
 * after a fallback that read from disk silently became {} in production.
 * The only place an upload can durably land is Blob. So the copy in the
 * repo is taken afterwards, deliberately, by running this.
 *
 * What it produces is an ARCHIVE, not a live fallback. Records in Blob
 * store absolute blob URLs, so the site keeps serving from Blob; these
 * files are the copy that survives the account, the billing, and an
 * accidental delete. Restoring from them means re-uploading, which is
 * the honest cost of not owning the storage.
 *
 *   node scripts/pull-assets.mjs           # only what is missing or changed
 *   node scripts/pull-assets.mjs --all     # re-download everything
 *   node scripts/pull-assets.mjs --dry     # list, download nothing
 */
import { list } from '@vercel/blob'
import { mkdirSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'assets-backup')

/* The token lives in .env.local, which this reads directly rather than
   asking anyone to export it. It is never printed. */
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  for (const f of ['.env.local', '.env']) {
    const p = join(root, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*BLOB_READ_WRITE_TOKEN\s*=\s*"?([^"\n]+)"?\s*$/)
      if (m) { process.env.BLOB_READ_WRITE_TOKEN = m[1]; break }
    }
    if (process.env.BLOB_READ_WRITE_TOKEN) break
  }
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('No BLOB_READ_WRITE_TOKEN found in the environment or .env.local.')
  process.exit(1)
}

const all = process.argv.includes('--all')
const dry = process.argv.includes('--dry')
const kb = n => n < 1024 ? n + 'B' : n < 1048576 ? (n/1024).toFixed(0)+'KB' : (n/1048576).toFixed(1)+'MB'

/* ---- enumerate ---- */
const blobs = []
let cursor
do {
  const page = await list({ cursor, limit: 1000 })
  blobs.push(...page.blobs)
  cursor = page.hasMore ? page.cursor : undefined
} while (cursor)

blobs.sort((a, b) => a.pathname.localeCompare(b.pathname))
const total = blobs.reduce((s, b) => s + (b.size || 0), 0)
console.log(`${blobs.length} objects in Blob, ${kb(total)} total`)

/* ---- what is worth fetching ---- */
const jobs = blobs.filter(b => {
  if (all) return true
  const dest = join(OUT, b.pathname)
  // Size is the only cheap comparison the listing offers. It will miss an
  // edit that happens to keep the byte count identical, which --all is for.
  return !existsSync(dest) || statSync(dest).size !== b.size
})

if (dry) {
  jobs.forEach(b => console.log(`  would fetch  ${b.pathname}  ${kb(b.size||0)}`))
  console.log(`\n${jobs.length} of ${blobs.length} would be fetched. Nothing written.`)
  process.exit(0)
}
if (!jobs.length) {
  console.log(`assets-backup/ is already up to date.`)
  process.exit(0)
}

/* ---- fetch ---- */
let done = 0, bytes = 0, failed = []
for (const b of jobs) {
  const dest = join(OUT, b.pathname)
  try {
    const res = await fetch(b.downloadUrl || b.url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, buf)
    done++; bytes += buf.length
    process.stdout.write(`\r  ${done}/${jobs.length}  ${kb(bytes)}   `)
  } catch (e) {
    failed.push([b.pathname, e.message])
  }
}
process.stdout.write('\n')

console.log(`pulled ${done} objects, ${kb(bytes)} -> assets-backup/`)
if (failed.length) {
  console.log(`\n${failed.length} failed:`)
  failed.forEach(([p, m]) => console.log(`  ${p} — ${m}`))
  process.exit(1)
}
