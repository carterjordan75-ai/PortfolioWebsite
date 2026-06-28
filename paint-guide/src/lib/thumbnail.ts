import { loadImage } from '../engine'

export interface ThumbResult {
  dataUrl: string
  width: number // natural image width
  height: number
}

// Make a small JPEG thumbnail (white-backed so transparent PNGs don't go
// black) and report the image's natural dimensions.
export async function makeThumbnail(blob: Blob, max = 360): Promise<ThumbResult> {
  const img = await loadImage(blob)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const scale = Math.min(1, max / Math.max(w, h))
  const tw = Math.max(1, Math.round(w * scale))
  const th = Math.max(1, Math.round(h * scale))
  const c = document.createElement('canvas')
  c.width = tw
  c.height = th
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, tw, th)
  ctx.drawImage(img, 0, 0, tw, th)
  return { dataUrl: c.toDataURL('image/jpeg', 0.82), width: w, height: h }
}
