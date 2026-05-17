import { NextRequest, NextResponse } from 'next/server'
import { deleteBlob, blobConfigured } from '@/lib/blobStore'

/**
 * Best-effort deletion of one or more Blob URLs.
 *
 * Body: { urls: string[] }
 *
 * Returns { deleted: number, failed: number } — never errors per file, since
 * a delete-on-cleanup endpoint shouldn't block the user's primary action
 * (replace, remove) if a single blob is already gone. The blobStore helper
 * itself swallows fetch errors and returns false.
 *
 * Auth: same posture as the rest of the admin routes — gated by the
 * password-protected UI rather than per-request server auth. If you want to
 * harden this, add a shared admin token check here.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!blobConfigured()) {
    return NextResponse.json(
      { error: 'BLOB_READ_WRITE_TOKEN not configured on the server.' },
      { status: 503 },
    )
  }
  try {
    const body = await request.json()
    const urls: unknown = body?.urls
    if (!Array.isArray(urls)) {
      return NextResponse.json({ error: 'urls array required' }, { status: 400 })
    }
    let deleted = 0
    let failed = 0
    for (const u of urls) {
      if (typeof u !== 'string' || !u) { failed++; continue }
      const ok = await deleteBlob(u)
      if (ok) deleted++; else failed++
    }
    return NextResponse.json({ deleted, failed })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
