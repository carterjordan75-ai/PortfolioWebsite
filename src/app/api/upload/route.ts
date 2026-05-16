import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import sharp from 'sharp'
import { putMediaBlob, deleteBlob, blobConfigured } from '@/lib/blobStore'

const IMAGE_EXTS = /\.(jpg|jpeg|png|gif|bmp|tiff|tif|avif|heic|heif|webp)$/i
const VIDEO_EXTS = /\.(mp4|webm|mov|avi|mkv)$/i

// Generate SEO-friendly filename
function generateSeoFileName(originalName: string, credits: string, section: string, forceWebp: boolean): string {
  const rawBase = originalName.replace(/\.[^.]+$/, '')
  const ext = forceWebp ? '.webp' : (path.extname(originalName).toLowerCase() || '.webp')

  const parts: string[] = []

  if (credits) {
    parts.push(credits.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 40))
  }

  const cleanBase = rawBase.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30)
  if (cleanBase && cleanBase !== parts[0]) {
    parts.push(cleanBase)
  }

  const sectionSlug = section.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
  if (sectionSlug && sectionSlug !== 'look' && sectionSlug !== 'misc') {
    parts.unshift(`jordan-carter-${sectionSlug}`)
  } else {
    parts.unshift('jordan-carter')
  }

  const ts = Date.now().toString(36)
  parts.push(ts)

  return parts.filter(Boolean).join('-') + ext
}

function generateSeoMetadata(fileName: string, credits: string, section: string, originalName: string, width?: number, height?: number) {
  const title = credits || originalName.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ')
  const altText = `${title} — Jordan Carter ${section} portfolio`
  const description = `${title} by Jordan Carter. Creative work spanning 3D, motion design, generative art and illustration.`
  const isVideo = VIDEO_EXTS.test(originalName)

  return {
    title,
    altText,
    description,
    keywords: ['jordan carter', section.toLowerCase(), 'motion design', '3d artist', 'generative art', title.toLowerCase()].filter(Boolean),
    ogType: isVideo ? 'video' : 'image',
    width,
    height,
    format: isVideo ? path.extname(originalName).replace('.', '') : 'webp',
  }
}

export async function POST(request: NextRequest) {
  if (!blobConfigured()) {
    return NextResponse.json(
      { error: 'BLOB_READ_WRITE_TOKEN not configured on the server. Cannot upload.' },
      { status: 503 },
    )
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const credits = formData.get('credits') as string || ''
    const link = formData.get('link') as string || ''
    const section = formData.get('section') as string || 'look'
    const isLogoUpload = section.toLowerCase() === 'logos'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const isImage = IMAGE_EXTS.test(file.name)
    const isAlreadyWebp = file.name.toLowerCase().endsWith('.webp')
    const isGif = file.name.toLowerCase().endsWith('.gif')

    let finalBuffer: Buffer = buffer
    let width: number | undefined
    let height: number | undefined
    const convertToWebp = isImage && !isAlreadyWebp && !isGif

    // Convert images to WebP for speed + SEO
    if (convertToWebp) {
      try {
        const sharpInstance = sharp(buffer)
        const meta = await sharpInstance.metadata()
        width = meta.width
        height = meta.height

        let pipeline = sharp(buffer)
        if ((width && width > 2400) || (height && height > 2400)) {
          pipeline = pipeline.resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
        }

        if (isLogoUpload) {
          pipeline = pipeline.grayscale().threshold(240)
        }

        finalBuffer = await pipeline
          .webp({ quality: 82, effort: 4 })
          .toBuffer()

        const finalMeta = await sharp(finalBuffer).metadata()
        width = finalMeta.width
        height = finalMeta.height
      } catch (convErr) {
        console.warn('WebP conversion failed, storing original:', convErr)
        finalBuffer = buffer
      }
    } else if (isAlreadyWebp) {
      try {
        const meta = await sharp(buffer).metadata()
        width = meta.width
        height = meta.height
        if (isLogoUpload) {
          finalBuffer = await sharp(buffer).grayscale().threshold(240).webp({ quality: 82 }).toBuffer()
        }
      } catch {}
    }

    // Generate SEO filename
    const fileName = generateSeoFileName(file.name, credits, section, convertToWebp)
    const seo = generateSeoMetadata(fileName, credits, section, file.name, width, height)

    // Determine MIME type for the upload
    const ext = path.extname(fileName).toLowerCase()
    const mimeMap: Record<string, string> = {
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.avif': 'image/avif',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
    }
    const contentType = mimeMap[ext] || file.type || 'application/octet-stream'

    // Upload the media file to Blob
    const mediaResult = await putMediaBlob(
      `media/${section}/${fileName}`,
      finalBuffer,
      contentType,
    )

    // Save per-file metadata to Blob too. The pages/sections endpoints read
    // this for things like dimensions, credits, alt text.
    const metadata = {
      fileName,
      originalName: file.name,
      credits,
      link,
      section,
      uploadedAt: new Date().toISOString(),
      url: mediaResult.url,
      // Legacy field — kept for compat with code that still expects /assets/...
      // Components should prefer `url` (the absolute Blob URL).
      path: mediaResult.url,
      seo,
      converted: convertToWebp,
      originalSize: buffer.length,
      finalSize: finalBuffer.length,
      compressionRatio: convertToWebp ? `${Math.round((1 - finalBuffer.length / buffer.length) * 100)}% smaller` : 'n/a',
    }

    const metaFileName = fileName.replace(/\.[^.]+$/, '') + '.json'
    await putMediaBlob(
      `meta/${section}/${metaFileName}`,
      Buffer.from(JSON.stringify(metadata, null, 2)),
      'application/json',
    )

    return NextResponse.json({
      success: true,
      fileName,
      path: mediaResult.url,
      url: mediaResult.url,
      metadata,
      seo,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed: ' + String(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!blobConfigured()) {
    return NextResponse.json(
      { error: 'BLOB_READ_WRITE_TOKEN not configured on the server.' },
      { status: 503 },
    )
  }

  try {
    const { section, fileName, url } = await request.json()
    if (!section || !fileName) {
      return NextResponse.json({ error: 'section and fileName required' }, { status: 400 })
    }

    // Prefer deleting by URL if provided (more reliable for blob lookups);
    // otherwise reconstruct the pathname.
    if (url) {
      await deleteBlob(url)
    } else {
      await deleteBlob(`media/${section}/${fileName}`)
    }

    const metaFileName = fileName.replace(/\.[^.]+$/, '') + '.json'
    await deleteBlob(`meta/${section}/${metaFileName}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: 'Delete failed: ' + String(error) }, { status: 500 })
  }
}
