'use client'

/**
 * Browser-side MP4 → WebM (VP9) conversion via ffmpeg.wasm.
 *
 * Why: Vercel Hobby caps function payloads at 4.5 MB and would never run
 * ffmpeg server-side anyway. WebM (VP9 + Opus) is meaningfully smaller than
 * H.264 MP4 at the same visual quality, so converting before upload makes
 * the site faster to load.
 *
 * How it works:
 *   - The first call lazy-loads @ffmpeg/ffmpeg + the @ffmpeg/core WASM from
 *     unpkg (~30 MB, cached by the browser).
 *   - The single-threaded core is used so we don't need COOP/COEP headers.
 *   - Each conversion uses VP9 at CRF 35 with `cpu-used 5` / `deadline good`
 *     — a sane speed/quality tradeoff for portfolio video. Audio is Opus
 *     at 128 kbps.
 *   - On any failure we fall through and upload the original MP4 unchanged.
 *
 * Callers should treat this as a black-box "pre-upload" pass: hand it a
 * File, get back a File (possibly converted, possibly the same), then
 * upload that.
 */

// Cached promise so we only load the core once per session.
let ffmpegPromise: Promise<unknown> | null = null

async function getFFmpeg(): Promise<unknown> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg')
      const { toBlobURL } = await import('@ffmpeg/util')
      const ffmpeg = new FFmpeg()
      // Single-threaded core — no SharedArrayBuffer / COOP-COEP needed.
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      return ffmpeg
    })().catch((err) => {
      // Don't poison the cache if load failed — let a later call try again.
      ffmpegPromise = null
      throw err
    })
  }
  return ffmpegPromise
}

export function isMp4(file: File): boolean {
  return /\.mp4$/i.test(file.name) || file.type === 'video/mp4'
}

/**
 * Convert an MP4 File to a WebM File. Throws on failure (caller should
 * catch and fall back to uploading the original).
 */
export async function convertMp4ToWebm(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<File> {
  const { fetchFile } = await import('@ffmpeg/util')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ffmpeg = (await getFFmpeg()) as any

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const progressHandler = (event: any) => {
    const p = typeof event?.progress === 'number' ? event.progress : 0
    onProgress?.(Math.min(1, Math.max(0, p)))
  }
  ffmpeg.on('progress', progressHandler)

  const inputName = 'input.mp4'
  const outputName = 'output.webm'

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file))
    await ffmpeg.exec([
      '-i', inputName,
      // VP9 video, variable bitrate, CRF 35 = visually transparent for web.
      '-c:v', 'libvpx-vp9',
      '-crf', '35',
      '-b:v', '0',
      // Encoder speed knobs — single-threaded ffmpeg.wasm is the bottleneck.
      '-cpu-used', '5',
      '-deadline', 'good',
      '-row-mt', '1',
      // Opus audio at 128 kbps.
      '-c:a', 'libopus',
      '-b:a', '128k',
      outputName,
    ])
    const data = await ffmpeg.readFile(outputName)
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(0)
    const buf = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buf).set(bytes)
    const newName = (file.name.replace(/\.mp4$/i, '.webm')) || 'video.webm'
    return new File([buf], newName, { type: 'video/webm' })
  } finally {
    try { await ffmpeg.deleteFile(inputName) } catch {}
    try { await ffmpeg.deleteFile(outputName) } catch {}
    ffmpeg.off('progress', progressHandler)
  }
}

/**
 * Pre-upload pass. Hand it a File:
 *   - If it's an MP4: converts it to WebM in the browser and returns the
 *     new File. On conversion error, logs and returns the original.
 *   - Otherwise: returns the file unchanged.
 *
 * Pass `onStatus` to surface conversion progress in the UI.
 */
export async function prepareForUpload(
  file: File,
  onStatus?: (msg: string) => void,
): Promise<File> {
  if (!isMp4(file)) return file
  onStatus?.(`Converting ${file.name} to WebM…`)
  try {
    const converted = await convertMp4ToWebm(file, (ratio) => {
      onStatus?.(`Converting ${file.name} — ${Math.round(ratio * 100)}%`)
    })
    onStatus?.(`✓ Converted ${file.name} → ${converted.name}`)
    return converted
  } catch (err) {
    console.error('MP4 → WebM conversion failed, uploading original:', err)
    onStatus?.(`Conversion failed — uploading original ${file.name}`)
    return file
  }
}
