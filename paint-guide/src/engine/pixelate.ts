import { srgbToLinear, linearToSrgb, round255 } from './color'

// DOM-only helpers: turn an image into a grid of per-cell RGBA. Kept out of the
// pure engine so the rest stays unit-testable in Node.

// Cap the working resolution so huge photos don't blow up memory/time.
const RES_CAP = 1600

// Precomputed sRGB→linear lookup for the 256 byte values.
const LIN_LUT = (() => {
  const t = new Float32Array(256)
  for (let i = 0; i < 256; i++) t[i] = srgbToLinear(i / 255)
  return t
})()

// Down-sample an image to cols×rows by **area-averaging in linear light**.
// Averaging gamma-encoded sRGB (what a plain canvas drawImage does) visibly
// darkens the result; doing it in linear space keeps the grid as bright as the
// source.
export function imageToCellRGBA(
  source: CanvasImageSource,
  cols: number,
  rows: number,
): Uint8ClampedArray {
  const anySrc = source as unknown as { naturalWidth?: number; width?: number; naturalHeight?: number; height?: number }
  const sw = anySrc.naturalWidth || anySrc.width || cols
  const sh = anySrc.naturalHeight || anySrc.height || rows

  // Draw at (capped) native resolution — no browser downscale, so getImageData
  // returns true source pixels we can average ourselves.
  const fit = Math.min(1, RES_CAP / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * fit))
  const h = Math.max(1, Math.round(sh * fit))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not get 2D canvas context')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(source, 0, 0, w, h)
  const src = ctx.getImageData(0, 0, w, h).data

  const out = new Uint8ClampedArray(cols * rows * 4)
  for (let cy = 0; cy < rows; cy++) {
    const y0 = Math.floor((cy * h) / rows)
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * h) / rows))
    for (let cx = 0; cx < cols; cx++) {
      const x0 = Math.floor((cx * w) / cols)
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * w) / cols))

      let r = 0
      let g = 0
      let b = 0
      let aSum = 0 // sum of alpha (0..255) for output alpha
      let wSum = 0 // sum of alpha weight (0..1) for un-premultiply
      for (let y = y0; y < y1; y++) {
        let p = (y * w + x0) * 4
        for (let x = x0; x < x1; x++) {
          const al = src[p + 3] / 255
          r += LIN_LUT[src[p]] * al
          g += LIN_LUT[src[p + 1]] * al
          b += LIN_LUT[src[p + 2]] * al
          aSum += src[p + 3]
          wSum += al
          p += 4
        }
      }
      const i = (cy * cols + cx) * 4
      const count = (y1 - y0) * (x1 - x0)
      if (wSum < 1e-6) {
        out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0
        continue
      }
      out[i] = round255(linearToSrgb(r / wSum) * 255)
      out[i + 1] = round255(linearToSrgb(g / wSum) * 255)
      out[i + 2] = round255(linearToSrgb(b / wSum) * 255)
      out[i + 3] = Math.round(aSum / count)
    }
  }
  return out
}

// Load a Blob/File into an HTMLImageElement (resolved once decoded).
export function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src)
    const img = new Image()
    img.onload = () => {
      if (typeof src !== 'string') URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      if (typeof src !== 'string') URL.revokeObjectURL(url)
      reject(new Error('Could not load image'))
    }
    img.src = url
  })
}
