/**
 * Browser-side image → WebP conversion via canvas.toBlob.
 *
 * Why browser-side: Vercel Hobby capped FormData at 4.5 MB and Pro at 50 MB,
 * but direct-to-Blob uploads have no size cap. Doing this in the browser
 * keeps the upload path consistent (always direct-to-Blob) and lets us
 * convert images of any size without paying a function invocation.
 *
 * WebP at quality 0.85 is visually indistinguishable from the source for
 * portfolio-quality images and typically 30-60% smaller than PNG / JPG.
 *
 * Skipped formats:
 *   - .webp  — already optimal
 *   - .gif   — preserves animation (toBlob on canvas loses frames)
 *   - .svg   — vector, lossless; rasterising loses scalability
 *   - HEIC   — browsers can't decode HEIC natively
 */

const CONVERTIBLE = /\.(jpe?g|png|bmp|tiff?|avif)$/i

export function isConvertibleImage(file: File): boolean {
  return CONVERTIBLE.test(file.name) || (
    file.type.startsWith('image/') &&
    !['image/webp', 'image/gif', 'image/svg+xml', 'image/heic', 'image/heif'].includes(file.type)
  )
}

/**
 * Convert an image File to a WebP File. Throws if the source can't be
 * decoded (which happens for HEIC and the occasional malformed file);
 * the upload pipeline catches and falls back to uploading the original.
 *
 * The image is downscaled to MAX_DIM on its longest edge before encoding.
 * Hero portfolio images are typically 3-5K pixels wide — 2400 still looks
 * great on retina without the bandwidth/storage of the source.
 */
export async function convertImageToWebp(
  file: File,
  quality = 0.85,
  maxDim = 2400,
): Promise<File> {
  // FileReader → data URL → HTMLImageElement is the broadest-compatible
  // decode path. createImageBitmap is faster but has gaps on Safari for
  // certain inputs.
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('FileReader failed'))
    reader.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error(`Couldn't decode ${file.name} (HEIC or corrupt source?)`))
    im.src = dataUrl
  })

  let w = img.naturalWidth
  let h = img.naturalHeight
  if (Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context not available')
  ctx.drawImage(img, 0, 0, w, h)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error('canvas.toBlob returned null (browser may not support WebP encoding)')),
      'image/webp',
      quality,
    )
  })

  const newName = file.name.replace(/\.[^.]+$/, '') + '.webp'
  return new File([blob], newName, { type: 'image/webp' })
}
