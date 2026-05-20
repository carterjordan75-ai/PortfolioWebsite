import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import {
  listBlobs,
  readJsonBlob,
  writeJsonBlob,
  deleteBlob,
} from '@/lib/blobStore'

/**
 * Look gallery items live as one blob per file in `meta/look/`. Their display
 * order is stored separately at `state/look-order.json` (an array of fileNames).
 *
 * Migrating from the previous filesystem layout:
 *   meta/look/<fileName>.json   (was public/assets/look/_meta/<fileName>.json)
 *   state/look-order.json       (was public/assets/look/_meta/_order.json)
 *   media/look/<fileName>       (was public/assets/look/<fileName>)
 */

// Live admin data — always rerun, never serve from edge/static cache.
export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

const META_PREFIX = 'meta/look/'
const ORDER_KEY = 'state/look-order.json'

type MetaItem = {
  fileName: string
  uploadedAt?: string
  [key: string]: unknown
}

async function fetchJsonBlob(url: string): Promise<MetaItem | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as MetaItem
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const blobs = await listBlobs(META_PREFIX)
    const items: MetaItem[] = []
    for (const b of blobs) {
      if (!b.pathname.endsWith('.json')) continue
      const data = await fetchJsonBlob(b.url)
      if (data) items.push(data)
    }

    const order = await readJsonBlob<string[] | null>(ORDER_KEY, null)

    if (order && Array.isArray(order)) {
      const orderMap = new Map(order.map((fname, i) => [fname, i]))
      items.sort((a, b) => {
        const ai = orderMap.get(a.fileName) ?? 9999
        const bi = orderMap.get(b.fileName) ?? 9999
        return ai - bi
      })
    } else {
      items.sort((a, b) => {
        const at = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0
        const bt = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0
        return bt - at
      })
    }

    return NextResponse.json({ items }, NO_CACHE)
  } catch (error) {
    console.error('Look API error:', error)
    return NextResponse.json({ items: [] }, NO_CACHE)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Register a new gallery item by writing its meta blob. Called by the
    // admin Look panel AFTER it has uploaded the file directly to Vercel
    // Blob via /api/upload-token. Without this, the /api/look GET handler
    // (which walks meta blobs) would never see the new item and it would
    // vanish on reload.
    if (body.action === 'add-item' && body.fileName && body.path) {
      const metadata: MetaItem = {
        fileName: body.fileName,
        path: body.path,
        url: body.path,
        credits: body.credits || '',
        link: body.link || '',
        uploadedAt: new Date().toISOString(),
      }
      const metaPath = `${META_PREFIX}${body.fileName}.json`
      await put(metaPath, JSON.stringify(metadata, null, 2), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      })
      // Prepend to the order so it shows first in the gallery.
      const existing = (await readJsonBlob<string[] | null>(ORDER_KEY, null)) || []
      const nextOrder = [body.fileName, ...existing.filter(f => f !== body.fileName)]
      await writeJsonBlob(ORDER_KEY, nextOrder)
      return NextResponse.json({ success: true, item: metadata })
    }

    // Patch an existing item's credits/link by rewriting its meta blob.
    if (body.action === 'update-item' && body.fileName) {
      const metaPath = `${META_PREFIX}${body.fileName}.json`
      // Find the existing meta to merge into.
      const blobs = await listBlobs(metaPath)
      const found = blobs.find(b => b.pathname === metaPath)
      let current: MetaItem = { fileName: body.fileName }
      if (found) {
        try {
          const res = await fetch(found.url, { cache: 'no-store' })
          if (res.ok) current = await res.json() as MetaItem
        } catch {}
      }
      const updated: MetaItem = {
        ...current,
        fileName: body.fileName,
        ...(body.credits !== undefined ? { credits: body.credits } : {}),
        ...(body.link !== undefined ? { link: body.link } : {}),
      }
      await put(metaPath, JSON.stringify(updated, null, 2), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      })
      return NextResponse.json({ success: true, item: updated })
    }

    // Delete an item: removes the meta blob, the media file, and drops the
    // fileName from the order list. Use this from the admin Delete button
    // instead of /api/upload's DELETE (which expects a different request
    // shape and only handles a subset of cleanup).
    if (body.action === 'remove-item' && body.fileName) {
      await deleteBlob(`${META_PREFIX}${body.fileName}.json`)
      await deleteBlob(`media/look/${body.fileName}`)
      // If the meta included a `path` that was a full URL, delete that too.
      if (body.url) await deleteBlob(body.url)
      const existing = (await readJsonBlob<string[] | null>(ORDER_KEY, null)) || []
      const next = existing.filter(f => f !== body.fileName)
      await writeJsonBlob(ORDER_KEY, next)
      return NextResponse.json({ success: true })
    }

    if (body.action === 'reorder' && Array.isArray(body.order)) {
      await writeJsonBlob(ORDER_KEY, body.order)
      return NextResponse.json({ success: true })
    }

    if (body.action === 'sync' && Array.isArray(body.items)) {
      const keepSet = new Set(body.items as string[])
      // Enumerate every meta blob; if its fileName is no longer in the keep
      // set, delete both the meta blob and the corresponding media blob.
      const blobs = await listBlobs(META_PREFIX)
      for (const b of blobs) {
        if (!b.pathname.endsWith('.json')) continue
        // pathname looks like "meta/look/some-file.webp.json"; strip prefix + .json
        const metaName = b.pathname.slice(META_PREFIX.length)
        const fileName = metaName.replace(/\.json$/, '')
        if (!keepSet.has(fileName)) {
          await deleteBlob(b.pathname)
          await deleteBlob(`media/look/${fileName}`)
        }
      }
      await writeJsonBlob(ORDER_KEY, body.items)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Look API POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
