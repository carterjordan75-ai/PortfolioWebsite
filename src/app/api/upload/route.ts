import { NextResponse } from 'next/server'

/**
 * /api/upload — placeholder.
 *
 * The original implementation wrote uploaded files to `public/assets/{section}/`
 * via `fs/promises` + `sharp` for image processing. That works in local dev but
 * Vercel's serverless runtime has an ephemeral filesystem — writes don't
 * persist across invocations, so any upload would appear to succeed and then
 * vanish on the next cold start.
 *
 * Until uploads are migrated to a persistent store (Vercel Blob / KV / S3),
 * this route returns 503 so the admin UI shows a clear error instead of
 * silently losing user data. To restore local-dev uploads, check git history
 * for the previous version of this file (`git log -- src/app/api/upload`).
 *
 * Removing the `sharp` import was also necessary because it pulled ~50MB of
 * native binaries into every serverless function bundle, which together with
 * the rest of `node_modules` pushed the function over Vercel's 250MB cap.
 */
const DISABLED_MESSAGE =
  'Uploads are disabled on this deployment. To add media, place files in public/assets/ locally and push to git, or wire up Vercel Blob.'

export async function POST() {
  return NextResponse.json({ error: DISABLED_MESSAGE }, { status: 503 })
}

export async function DELETE() {
  return NextResponse.json({ error: DISABLED_MESSAGE }, { status: 503 })
}

export async function GET() {
  return NextResponse.json({ error: DISABLED_MESSAGE }, { status: 503 })
}
