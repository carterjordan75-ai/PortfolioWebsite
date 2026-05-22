/**
 * Watermarks a project's media for download.
 *
 *   - Images (jpg / png / webp / etc): loaded into a canvas, the XOXO logo
 *     is tiled across the surface at low opacity rotated 30°, and the
 *     result is exported in the SAME format the source was in.
 *   - Videos (mp4 / webm / mov): re-encoded via ffmpeg.wasm with an
 *     overlay filter that places the XOXO logo in the bottom-right at
 *     ~30% opacity. Audio is copied without re-encode.
 *
 * Each call returns a Blob; the caller stitches them into a ZIP via
 * jszip and triggers the browser download.
 */

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i

const LOGO_URL = '/assets/Logos/xoxo_Logo_001.png'

let cachedLogoImage: HTMLImageElement | null = null
let cachedLogoBytes: Uint8Array | null = null

async function loadLogoImage(): Promise<HTMLImageElement> {
  if (cachedLogoImage) return cachedLogoImage
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Could not load watermark logo'))
    img.src = LOGO_URL
  })
  cachedLogoImage = img
  return img
}

async function loadLogoBytes(): Promise<Uint8Array> {
  if (cachedLogoBytes) return cachedLogoBytes
  const res = await fetch(LOGO_URL)
  if (!res.ok) throw new Error('Could not fetch logo bytes')
  cachedLogoBytes = new Uint8Array(await res.arrayBuffer())
  return cachedLogoBytes
}

function pickImageMime(filename: string): { type: string; ext: string } {
  const ext = (filename.match(/\.([^.]+)$/)?.[1] || 'webp').toLowerCase()
  if (ext === 'png') return { type: 'image/png', ext: 'png' }
  if (ext === 'jpg' || ext === 'jpeg') return { type: 'image/jpeg', ext: 'jpg' }
  if (ext === 'gif') return { type: 'image/png', ext: 'png' } // canvas can't preserve gif animation; fall back to png
  if (ext === 'avif') return { type: 'image/webp', ext: 'webp' } // browsers can't encode avif via toBlob
  return { type: 'image/webp', ext: 'webp' }
}

/**
 * Draw the XOXO logo tiled across the canvas at low opacity, rotated 30°.
 * Tile spacing scales with canvas size so portrait + wide images both look
 * consistent.
 */
function drawTiledWatermark(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  logo: HTMLImageElement,
  opacity = 0.16,
): void {
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.translate(canvasW / 2, canvasH / 2)
  ctx.rotate(-Math.PI / 6)
  // Target watermark logo width ~22% of canvas width — readable, not
  // dominant. Spacing roughly 2× the width on x and 4× the height on y.
  const targetW = Math.max(160, Math.round(canvasW * 0.22))
  const aspect = logo.naturalWidth / Math.max(1, logo.naturalHeight)
  const targetH = Math.round(targetW / aspect)
  const stepX = targetW * 2.2
  const stepY = targetH * 4
  const diag = Math.hypot(canvasW, canvasH)
  for (let y = -diag; y < diag; y += stepY) {
    for (let x = -diag; x < diag; x += stepX) {
      ctx.drawImage(logo, x - targetW / 2, y - targetH / 2, targetW, targetH)
    }
  }
  ctx.restore()
}

export async function watermarkImage(
  src: string,
  filename: string,
): Promise<{ blob: Blob; outName: string }> {
  // Load source image. The crossOrigin attribute lets us read the canvas
  // back; Vercel Blob serves Access-Control-Allow-Origin: * so this works.
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error(`Could not decode ${filename}`))
    im.src = src
  })
  const logo = await loadLogoImage()
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context not available')
  ctx.drawImage(img, 0, 0)
  drawTiledWatermark(ctx, canvas.width, canvas.height, logo)

  const { type, ext } = pickImageMime(filename)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error('toBlob returned null')),
      type,
      0.92,
    )
  })
  const baseName = filename.replace(/\.[^.]+$/, '')
  return { blob, outName: `${baseName}.${ext}` }
}

/**
 * Watermark a video via ffmpeg.wasm. Slow (single-threaded encode) — the
 * UI must show progress per file. The output container matches the input:
 * .webm → libvpx (VP8), .mp4 → libx264, .mov → libx264 in mp4 container.
 *
 * Audio is copied (-c:a copy) so we only pay for re-encoding video.
 */
export async function watermarkVideo(
  src: string,
  filename: string,
  onProgress?: (ratio: number) => void,
): Promise<{ blob: Blob; outName: string }> {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util')

  // Reuse the same load pattern as convertVideo.ts (own-hosted ESM worker
  // + Blob URLs for the core), so we don't re-download the 30 MB core on
  // every download.
  const ffmpeg = new FFmpeg()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ffmpeg.on('progress', (e: any) => {
    const p = typeof e?.progress === 'number' ? e.progress : 0
    onProgress?.(Math.min(1, Math.max(0, p)))
  })
  const coreVer = '0.12.6'
  const baseCore = `https://unpkg.com/@ffmpeg/core@${coreVer}/dist/esm`
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  await ffmpeg.load({
    classWorkerURL: `${origin}/ffmpeg/worker.js`,
    coreURL: await toBlobURL(`${baseCore}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseCore}/ffmpeg-core.wasm`, 'application/wasm'),
  })

  const ext = (filename.match(/\.([^.]+)$/)?.[1] || 'webm').toLowerCase()
  const inputName = `input.${ext}`
  // Output preserves the source container.
  const outExt = ext === 'mov' ? 'mp4' : ext
  const outputName = `output.${outExt}`

  await ffmpeg.writeFile(inputName, await fetchFile(src))
  await ffmpeg.writeFile('logo.png', await loadLogoBytes())

  // Overlay filter: scale logo to ~18% of video width, place at bottom-right
  // with a margin equal to ~3% of width. Opacity 0.35 via colorchannelmixer.
  const filter = '[1:v]scale=iw*0.18:-1,format=rgba,colorchannelmixer=aa=0.35[wm];' +
    '[0:v][wm]overlay=W-w-W*0.03:H-h-W*0.03'
  // Codec per container: VP8 for webm, H.264 for mp4/mov.
  const isWebm = outExt === 'webm'
  const videoCodec = isWebm
    ? ['-c:v', 'libvpx', '-b:v', '1500k', '-cpu-used', '3', '-deadline', 'good']
    : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23']
  await ffmpeg.exec([
    '-i', inputName,
    '-i', 'logo.png',
    '-filter_complex', filter,
    ...videoCodec,
    '-c:a', 'copy',
    outputName,
  ])
  const data = await ffmpeg.readFile(outputName)
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(0)
  if (bytes.byteLength === 0) {
    throw new Error('ffmpeg produced empty output')
  }
  try { await ffmpeg.deleteFile(inputName) } catch {}
  try { await ffmpeg.deleteFile('logo.png') } catch {}
  try { await ffmpeg.deleteFile(outputName) } catch {}
  try { ffmpeg.terminate() } catch {}

  const baseName = filename.replace(/\.[^.]+$/, '')
  const mime = outExt === 'webm' ? 'video/webm' : 'video/mp4'
  const buf = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buf).set(bytes)
  return { blob: new Blob([buf], { type: mime }), outName: `${baseName}.${outExt}` }
}

export function isVideoFile(filename: string): boolean {
  return VIDEO_EXT.test(filename)
}
