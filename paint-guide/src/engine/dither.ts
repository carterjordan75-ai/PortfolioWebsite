import type { RGB } from './color'

// Master dot palette, ordered by importance: the first ~18 are the vivid core
// (white/black/skin + saturated primaries & secondaries), then neutrals, warm
// tones, and deep/pale variants fill in. Taking the first N gives a sensible
// palette at any size — small N is poppy and limited, large N is smoother.
export const DOT_PALETTE_FULL: RGB[] = [
  [255, 255, 255], // white
  [26, 26, 26], // black
  [240, 200, 168], // skin
  [224, 32, 32], // red
  [28, 55, 165], // blue
  [245, 210, 30], // yellow
  [31, 160, 60], // green
  [55, 195, 220], // cyan
  [205, 30, 120], // magenta
  [240, 130, 20], // orange
  [136, 136, 136], // mid grey
  [120, 65, 35], // brown
  [20, 138, 123], // teal
  [70, 150, 225], // sky
  [120, 55, 170], // violet
  [130, 200, 40], // lime
  [240, 120, 160], // pink
  [210, 210, 210], // light grey
  // --- first 18 ≈ the original vivid look ---
  [214, 170, 120], // tan
  [75, 75, 75], // dark grey
  [140, 32, 36], // maroon
  [20, 42, 120], // navy
  [20, 80, 40], // deep green
  [75, 45, 28], // deep brown
  [168, 200, 230], // pale blue
  [242, 192, 204], // pale pink
  [242, 230, 160], // pale yellow
  [160, 224, 192], // mint
  [14, 90, 80], // dark teal
  [75, 30, 110], // deep purple
  [240, 168, 120], // peach
  [128, 128, 60], // olive
  [180, 80, 40], // rust
  [90, 110, 130], // slate
  [40, 90, 50], // forest
  [130, 50, 90], // plum
  [245, 234, 210], // cream
  [48, 48, 48], // charcoal
  [190, 170, 225], // lavender
  [200, 150, 40], // ochre
]

export const DITHER_MIN = 6
export const DITHER_MAX = DOT_PALETTE_FULL.length

// Kept for back-compat / tests: the master palette.
export const DOT_PALETTE = DOT_PALETTE_FULL

const clampN = (n: number) => (n < DITHER_MIN ? DITHER_MIN : n > DITHER_MAX ? DITHER_MAX : Math.round(n))

// The first N colours of the master palette.
export function ditherPalette(n: number): RGB[] {
  return DOT_PALETTE_FULL.slice(0, clampN(n))
}

// Median-cut: pick the `n` colours that best represent the image, so a reduced
// palette still looks realistic (far better than uniform rounding). Each box is
// repeatedly split along its widest channel at the median until we have n boxes;
// each box's average colour becomes a palette entry.
export function medianCutPalette(
  cellRGBA: Uint8ClampedArray | number[],
  cols: number,
  rows: number,
  n: number,
  alphaThreshold = 8,
): RGB[] {
  const N = cols * rows
  const px: [number, number, number][] = []
  for (let i = 0; i < N; i++) {
    if (cellRGBA[i * 4 + 3] < alphaThreshold) continue
    px.push([cellRGBA[i * 4], cellRGBA[i * 4 + 1], cellRGBA[i * 4 + 2]])
  }
  if (px.length === 0) return [[0, 0, 0]]
  const target = Math.max(2, Math.min(4096, Math.round(n)))

  let boxes: [number, number, number][][] = [px]
  while (boxes.length < target) {
    let bestIdx = -1
    let bestScore = 0
    let bestCh = 0
    for (let bI = 0; bI < boxes.length; bI++) {
      const box = boxes[bI]
      if (box.length < 2) continue
      const mn = [255, 255, 255]
      const mx = [0, 0, 0]
      for (const p of box) {
        for (let c = 0; c < 3; c++) {
          if (p[c] < mn[c]) mn[c] = p[c]
          if (p[c] > mx[c]) mx[c] = p[c]
        }
      }
      // This box's widest channel...
      let ch = 0
      let range = 0
      for (let c = 0; c < 3; c++) {
        const r = mx[c] - mn[c]
        if (r > range) {
          range = r
          ch = c
        }
      }
      // ...weighted by how many cells live in it, so large shadow/flat regions
      // get their fair share of the colour budget instead of being starved by a
      // few high-contrast highlights. (Pure-range median-cut bands the darks.)
      const score = range * Math.sqrt(box.length)
      if (score > bestScore) {
        bestScore = score
        bestIdx = bI
        bestCh = ch
      }
    }
    if (bestIdx < 0) break // every box is a single colour
    const box = boxes[bestIdx]
    box.sort((a, b) => a[bestCh] - b[bestCh])
    const mid = box.length >> 1
    boxes.splice(bestIdx, 1, box.slice(0, mid), box.slice(mid))
  }

  return boxes.map((box) => {
    let r = 0
    let g = 0
    let b = 0
    for (const p of box) {
      r += p[0]
      g += p[1]
      b += p[2]
    }
    const k = box.length || 1
    return [Math.round(r / k), Math.round(g / k), Math.round(b / k)] as RGB
  })
}

// Map each cell to its nearest palette colour (no dithering — clean flat cells).
export function nearestPaletteIndices(
  cellRGBA: Uint8ClampedArray | number[],
  cols: number,
  rows: number,
  palette: RGB[],
  alphaThreshold = 8,
): Int32Array {
  const n = cols * rows
  const out = new Int32Array(n).fill(-1)
  for (let i = 0; i < n; i++) {
    if (cellRGBA[i * 4 + 3] < alphaThreshold) continue
    const r = cellRGBA[i * 4]
    const g = cellRGBA[i * 4 + 1]
    const b = cellRGBA[i * 4 + 2]
    let bi = 0
    let bd = Infinity
    for (let p = 0; p < palette.length; p++) {
      const dr = r - palette[p][0]
      const dg = g - palette[p][1]
      const db = b - palette[p][2]
      const d = dr * dr + dg * dg + db * db
      if (d < bd) {
        bd = d
        bi = p
      }
    }
    out[i] = bi
  }
  return out
}

// Floyd–Steinberg error diffusion. Returns a palette index per cell (-1 for
// transparent), so each cell becomes ONE flat palette colour — a paintable dot —
// while the diffused error keeps the overall tone smooth.
export function floydSteinbergIndices(
  cellRGBA: Uint8ClampedArray | number[],
  cols: number,
  rows: number,
  palette: RGB[],
  alphaThreshold = 8,
): Int32Array {
  const n = cols * rows
  const buf = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    buf[i * 3] = cellRGBA[i * 4]
    buf[i * 3 + 1] = cellRGBA[i * 4 + 1]
    buf[i * 3 + 2] = cellRGBA[i * 4 + 2]
  }
  const out = new Int32Array(n).fill(-1)

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      if (cellRGBA[i * 4 + 3] < alphaThreshold) continue
      const r = buf[i * 3]
      const g = buf[i * 3 + 1]
      const b = buf[i * 3 + 2]

      let bi = 0
      let bd = Infinity
      for (let p = 0; p < palette.length; p++) {
        const dr = r - palette[p][0]
        const dg = g - palette[p][1]
        const db = b - palette[p][2]
        const d = dr * dr + dg * dg + db * db
        if (d < bd) {
          bd = d
          bi = p
        }
      }
      out[i] = bi

      const er = r - palette[bi][0]
      const eg = g - palette[bi][1]
      const eb = b - palette[bi][2]
      diffuse(buf, cols, rows, x + 1, y, er, eg, eb, 7 / 16)
      diffuse(buf, cols, rows, x - 1, y + 1, er, eg, eb, 3 / 16)
      diffuse(buf, cols, rows, x, y + 1, er, eg, eb, 5 / 16)
      diffuse(buf, cols, rows, x + 1, y + 1, er, eg, eb, 1 / 16)
    }
  }
  return out
}

function diffuse(
  buf: Float32Array,
  cols: number,
  rows: number,
  x: number,
  y: number,
  er: number,
  eg: number,
  eb: number,
  f: number,
): void {
  if (x < 0 || x >= cols || y < 0 || y >= rows) return
  const j = (y * cols + x) * 3
  buf[j] += er * f
  buf[j + 1] += eg * f
  buf[j + 2] += eb * f
}
