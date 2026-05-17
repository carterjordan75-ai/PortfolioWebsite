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

async function getFFmpeg(onStatus?: (msg: string) => void): Promise<unknown> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      onStatus?.('Loading converter…')
      const { FFmpeg } = await import('@ffmpeg/ffmpeg')
      const { toBlobURL } = await import('@ffmpeg/util')
      const ffmpeg = new FFmpeg()
      // Surface ffmpeg's own stderr (codec messages, errors) to the console.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ffmpeg.on('log', (e: any) => {
        if (typeof e?.message === 'string') console.log('[ffmpeg]', e.message)
      })
      // Single-threaded build — no SharedArrayBuffer / COOP-COEP needed.
      //
      // Worker is loaded from our own /public/ffmpeg/ (same-origin static
      // assets). We need the ESM build of worker.js — the UMD build's
      // dynamic-import fallback is a webpack stub that always throws
      // "Cannot find module", which is exactly the error we hit when we
      // first tried pointing classWorkerURL at the UMD bundle. The ESM
      // worker does a real `import()` at runtime.
      //
      // worker.js has relative imports (./const.js, ./errors.js) so we ship
      // all three files together under /ffmpeg/.
      //
      // Core + wasm are still pulled from unpkg and wrapped in Blob URLs.
      // We use the ESM core (not UMD) because the worker dynamic-imports it
      // and looks for `.default` — the UMD core has no ES module exports.
      const coreVer = '0.12.6'
      const baseCore = `https://unpkg.com/@ffmpeg/core@${coreVer}/dist/esm`
      // classWorkerURL must be a complete URL — FFmpeg internally does
      // `new URL(classWorkerURL, hardcodedFileBase)` against a base URL
      // that's the @ffmpeg author's local dev path (file:///Users/focus/...
      // in the published UMD bundle). With a path-only classWorkerURL the
      // result was file:///ffmpeg/worker.js and Worker construction was
      // blocked as cross-origin. Build the URL with `new URL(...).href`
      // against location.href so it's airtight — string is fully absolute,
      // no resolution surprises.
      const workerHref = new URL('/ffmpeg/worker.js', window.location.href).href
      // Log so we can verify in production devtools what's actually being
      // passed to the Worker constructor.
      console.log('[ffmpeg] classWorkerURL =', workerHref)
      await ffmpeg.load({
        classWorkerURL: workerHref,
        coreURL: await toBlobURL(`${baseCore}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseCore}/ffmpeg-core.wasm`, 'application/wasm'),
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
  onStatus?: (msg: string) => void,
): Promise<File> {
  const { fetchFile } = await import('@ffmpeg/util')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ffmpeg = (await getFFmpeg(onStatus)) as any

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
    // VP8 (libvpx), not VP9 (libvpx-vp9). VP9 ran the single-threaded WASM
    // heap out of bounds on real portfolio MP4s ("memory access out of
    // bounds"). VP8 needs ~3-5× less working memory at comparable quality
    // and encodes faster too. Output is still a valid WebM that the site's
    // <video> tag plays natively.
    //
    // -vf scale='min(1920,iw)':-2  — cap width at 1920 (1080p horizontal),
    //   keep aspect, round height to even. Skips scaling for already-small
    //   inputs because min() picks iw. Hero-cinema 4K/5K inputs are the
    //   ones that triggered OOM, so this is the main relief.
    const exitCode = await ffmpeg.exec([
      '-i', inputName,
      '-vf', "scale='min(1920,iw)':-2",
      '-c:v', 'libvpx',
      // VP8 needs an explicit target bitrate even when using CRF — without
      // -b:v it caps quality very low. 1.5 Mbps is a sensible default for
      // 1080p web video.
      '-b:v', '1500k',
      '-crf', '30',
      '-cpu-used', '3',
      '-deadline', 'good',
      '-c:a', 'libvorbis',
      '-b:a', '128k',
      outputName,
    ])
    // exec() resolves with the ffmpeg process exit code. Non-zero = the
    // encoder bailed (codec error, corrupt input, OOM caught internally,
    // etc.) and the output file is either missing or unusable. Throw so
    // the caller's catch surfaces it instead of us shipping a 0-byte WebM.
    if (typeof exitCode === 'number' && exitCode !== 0) {
      throw new Error(`ffmpeg exit ${exitCode}`)
    }
    const data = await ffmpeg.readFile(outputName)
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(0)
    if (bytes.byteLength === 0) {
      throw new Error('ffmpeg produced an empty WebM')
    }
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
  onStatus?.(`Preparing ${file.name}…`)
  try {
    const converted = await convertMp4ToWebm(
      file,
      (ratio) => onStatus?.(`Converting ${file.name} — ${Math.round(ratio * 100)}%`),
      onStatus,
    )
    onStatus?.(`✓ Converted ${file.name} → ${converted.name}`)
    return converted
  } catch (err) {
    console.error('MP4 → WebM conversion failed, uploading original:', err)
    const msg = err instanceof Error ? err.message : String(err)
    onStatus?.(`Conversion failed (${msg}) — uploading original`)
    return file
  }
}
