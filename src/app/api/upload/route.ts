import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, unlink, readFile } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'

const IMAGE_EXTS = /\.(jpg|jpeg|png|gif|bmp|tiff|tif|avif|heic|heif|webp)$/i
const VIDEO_EXTS = /\.(mp4|webm|mov|avi|mkv)$/i

// Generate SEO-friendly filename
function generateSeoFileName(originalName: string, credits: string, section: string, forceWebp: boolean): string {
  const rawBase = originalName.replace(/\.[^.]+$/, '')
  const ext = forceWebp ? '.webp' : (path.extname(originalName).toLowerCase() || '.webp')

  const parts: string[] = []

  // Add credits/title as primary descriptor
  if (credits) {
    parts.push(credits.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 40))
  }

  // Add cleaned original filename
  const cleanBase = rawBase.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30)
  if (cleanBase && cleanBase !== parts[0]) {
    parts.push(cleanBase)
  }

  // Add section context for SEO
  const sectionSlug = section.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
  if (sectionSlug && sectionSlug !== 'look' && sectionSlug !== 'misc') {
    parts.unshift(`jordan-carter-${sectionSlug}`)
  } else {
    parts.unshift('jordan-carter')
  }

  // Short timestamp for uniqueness
  const ts = Date.now().toString(36)
  parts.push(ts)

  return parts.filter(Boolean).join('-') + ext
}

// Generate SEO metadata
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

    // Type cast to Buffer<ArrayBuffer> — sharp's pipeline.toBuffer() returns this
    // specific subtype which differs from the wider Buffer<ArrayBufferLike> that
    // Buffer.from() returns by default. Both are runtime-identical Buffers.
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

        // Resize if very large (max 2400px on longest edge)
        let pipeline = sharp(buffer)
        if ((width && width > 2400) || (height && height > 2400)) {
          pipeline = pipeline.resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
        }

        // Auto-convert logos to pure black & white (threshold, not grey)
        if (isLogoUpload) {
          pipeline = pipeline.grayscale().threshold(240)
        }

        finalBuffer = await pipeline
          .webp({ quality: 82, effort: 4 })
          .toBuffer()

        // Get final dimensions
        const finalMeta = await sharp(finalBuffer).metadata()
        width = finalMeta.width
        height = finalMeta.height
      } catch (convErr) {
        console.warn('WebP conversion failed, storing original:', convErr)
        // Fall back to original buffer
        finalBuffer = buffer
      }
    } else if (isAlreadyWebp) {
      // Already WebP — get dimensions, grayscale if logo
      try {
        const meta = await sharp(buffer).metadata()
        width = meta.width
        height = meta.height
        if (isLogoUpload) {
          finalBuffer = await sharp(buffer).grayscale().threshold(240).webp({ quality: 82 }).toBuffer()
        }
      } catch {}
    }

    // Generate SEO filename (force .webp for images)
    const fileName = generateSeoFileName(file.name, credits, section, convertToWebp)
    const seo = generateSeoMetadata(fileName, credits, section, file.name, width, height)

    // 1. Write to public/assets/{section}/
    const publicDir = path.join(process.cwd(), 'public', 'assets', section)
    await mkdir(publicDir, { recursive: true })
    await writeFile(path.join(publicDir, fileName), finalBuffer)

    // 2. Write backup to Assets/{section}/
    const assetsDir = path.join(process.cwd(), 'Assets', section)
    await mkdir(assetsDir, { recursive: true })
    await writeFile(path.join(assetsDir, fileName), finalBuffer)

    // 3. Save SEO metadata JSON
    const metaDir = path.join(publicDir, '_meta')
    await mkdir(metaDir, { recursive: true })
    const metaFileName = fileName.replace(/\.[^.]+$/, '') + '.json'
    const metadata = {
      fileName,
      originalName: file.name,
      credits,
      link,
      section,
      uploadedAt: new Date().toISOString(),
      path: `/assets/${section}/${fileName}`,
      seo,
      converted: convertToWebp,
      originalSize: buffer.length,
      finalSize: finalBuffer.length,
      compressionRatio: convertToWebp ? `${Math.round((1 - finalBuffer.length / buffer.length) * 100)}% smaller` : 'n/a',
    }
    await writeFile(path.join(metaDir, metaFileName), JSON.stringify(metadata, null, 2))

    return NextResponse.json({
      success: true,
      fileName,
      path: `/assets/${section}/${fileName}`,
      metadata,
      seo,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed: ' + String(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { section, fileName } = await request.json()
    if (!section || !fileName) return NextResponse.json({ error: 'section and fileName required' }, { status: 400 })

    const filePath = path.join(process.cwd(), 'public', 'assets', section, fileName)
    try { await unlink(filePath) } catch {}

    // Remove metadata
    const metaDir = path.join(process.cwd(), 'public', 'assets', section, '_meta')
    const metaPath = path.join(metaDir, `${fileName}.json`)
    try { await unlink(metaPath) } catch {}

    // Also remove from Assets source folder
    const srcPath = path.join(process.cwd(), 'Assets', section.charAt(0).toUpperCase() + section.slice(1), fileName)
    try { await unlink(srcPath) } catch {}

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { section, fileName, credits, link } = await request.json()
    if (!section || !fileName) return NextResponse.json({ error: 'section and fileName required' }, { status: 400 })

    const metaDir = path.join(process.cwd(), 'public', 'assets', section, '_meta')
    const metaPath = path.join(metaDir, `${fileName}.json`)

    let meta: Record<string, string> = {}
    try {
      const existing = await readFile(metaPath, 'utf8')
      meta = JSON.parse(existing)
    } catch {}

    if (credits !== undefined) meta.credits = credits
    if (link !== undefined) meta.link = link

    await mkdir(metaDir, { recursive: true })
    await writeFile(metaPath, JSON.stringify(meta, null, 2))

    return NextResponse.json({ success: true, meta })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
