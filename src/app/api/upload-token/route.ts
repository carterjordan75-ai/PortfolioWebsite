import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'

/**
 * Signs short-lived upload tokens so the browser can PUT a file directly
 * to Vercel Blob — bypassing this function entirely. That sidesteps the
 * 4.5 MB function-payload cap on Vercel Hobby (any file going through
 * /api/upload as FormData hits that wall; direct-to-Blob can carry up to
 * 500 MB).
 *
 * The client uses @vercel/blob/client's `upload(pathname, file, { ... })`
 * which calls this route twice during the lifecycle: once to mint the
 * token before uploading, once to confirm completion. handleUpload()
 * handles both transparently.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: ['image/*', 'video/*'],
          // Cap at 500 MB so a runaway upload can't consume the whole Blob
          // quota. Misc videos are typically 5-50 MB; this leaves headroom.
          maximumSizeInBytes: 500 * 1024 * 1024,
          addRandomSuffix: false,
          allowOverwrite: true,
        }
      },
      onUploadCompleted: async () => {
        // No-op. The browser receives the blob URL from `upload()`'s return
        // value and writes the new MiscItem to /api/misc itself.
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 })
  }
}
