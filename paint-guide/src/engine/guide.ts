import { type RGB, type LAB, rgbToLab, clamp } from './color'
import { buildCandidates, findRecipe, type RecipeMatch } from './mixing'
import { orderBySimilarColour, orderByReading } from './order'
import {
  ditherPalette,
  floydSteinbergIndices,
  medianCutPalette,
  nearestPaletteIndices,
} from './dither'
import { type PaintSetId } from './paintsets'

// A single paintable colour: the quantised target, how many cells use it, and a
// recipe to mix it from primaries (mix mode) or a Coloursmith custom pot to order.
export interface ColorInfo {
  index: number
  rgb: RGB
  lab: LAB
  count: number
  match: RecipeMatch
  paintBrand?: string // "Coloursmith" for custom pots; undefined for mix-your-own
  custom?: boolean // Coloursmith: this exact colour is ordered as a custom pot (no mixing)
  firstRow: number // 0-based grid coords of this colour's first cell (reading order)
  firstCol: number
}

export interface Guide {
  cols: number
  rows: number
  // colour index per cell (row-major); -1 = transparent / skipped
  cells: Int32Array
  colors: ColorInfo[]
  order: number[] // colour indices, in painting order
}

export type OrderMode = 'similar' | 'reading'

export interface GuideOptions {
  colorStep: number // quantisation step (1 = none, bigger = fewer colours)
  black: boolean
  order: OrderMode
  dither?: boolean // Floyd–Steinberg error diffusion (dot optical-blend)
  ditherColors?: number // vivid-palette size when dithering (default 18)
  reduce?: boolean // smart palette reduction (median-cut from the image)
  maxColors?: number // target colour count when reducing (default 64)
  paintSet?: PaintSetId // 'coloursmith' = keep exact colours as custom pots
  alphaThreshold?: number // alpha below this → skip the cell
}

// Round a channel to the nearest `step`, merging similar shades together.
export function quantizeChannel(v: number, step: number): number {
  if (step <= 1) return clamp(Math.round(v), 0, 255)
  return clamp(Math.round(v / step) * step, 0, 255)
}

// Turn a grid of per-cell RGBA into a full paint guide: unique colours,
// per-colour recipes, and a painting order. This is the one expensive call;
// callers cache its result and only re-run when inputs change.
export function buildGuide(
  cellRGBA: Uint8ClampedArray | number[],
  cols: number,
  rows: number,
  opts: GuideOptions,
): Guide {
  const n = cols * rows
  const cells = new Int32Array(n).fill(-1)
  const alphaT = opts.alphaThreshold ?? 8

  // Group cells into paintable colours. Palette paths:
  //  • coloursmith → keep each cluster's exact colour (median-cut), ordered as a pot.
  //  • reduce      → median-cut the image to a target count (mix-your-own).
  //  • dither      → Floyd–Steinberg to a fixed vivid palette (dot optical-blend).
  //  • default     → group by the true quantised colour (keep the full range).
  const groupToColor = new Map<number, number>()
  const buckets: {
    r: number
    g: number
    b: number
    count: number
    first: number
    paintBrand?: string
    custom?: boolean
  }[] = []
  const paintSet: PaintSetId = opts.paintSet ?? 'mix'
  const dither = opts.dither ?? false
  const reduce = opts.reduce ?? false
  const isColoursmith = paintSet === 'coloursmith'

  let palette: RGB[] | null = null
  let brand: string | undefined
  let custom = false
  if (isColoursmith) {
    // Keep each cluster's exact colour — ordered as a custom Coloursmith pot.
    palette = medianCutPalette(cellRGBA, cols, rows, opts.maxColors ?? 64, alphaT)
    brand = 'Coloursmith'
    custom = true
  } else if (reduce) {
    palette = medianCutPalette(cellRGBA, cols, rows, opts.maxColors ?? 64, alphaT)
  } else if (dither) {
    palette = ditherPalette(opts.ditherColors ?? 18)
  }

  if (palette) {
    const idx =
      dither && !isColoursmith
        ? floydSteinbergIndices(cellRGBA, cols, rows, palette, alphaT)
        : nearestPaletteIndices(cellRGBA, cols, rows, palette, alphaT)
    for (let i = 0; i < n; i++) {
      const p = idx[i]
      if (p < 0) continue
      let ci = groupToColor.get(p)
      if (ci === undefined) {
        ci = buckets.length
        groupToColor.set(p, ci)
        const c = palette[p]
        buckets.push({ r: c[0], g: c[1], b: c[2], count: 0, first: i, paintBrand: brand, custom })
      }
      buckets[ci].count++
      cells[i] = ci
    }
  } else {
    for (let i = 0; i < n; i++) {
      const a = cellRGBA[i * 4 + 3]
      if (a < alphaT) continue
      const r = quantizeChannel(cellRGBA[i * 4], opts.colorStep)
      const g = quantizeChannel(cellRGBA[i * 4 + 1], opts.colorStep)
      const b = quantizeChannel(cellRGBA[i * 4 + 2], opts.colorStep)
      const qkey = (r << 16) | (g << 8) | b
      let ci = groupToColor.get(qkey)
      if (ci === undefined) {
        ci = buckets.length
        groupToColor.set(qkey, ci)
        buckets.push({ r, g, b, count: 0, first: i })
      }
      buckets[ci].count++
      cells[i] = ci
    }
  }

  const candidates = buildCandidates(opts.black)
  const colors: ColorInfo[] = buckets.map((b, index) => {
    const rgb: RGB = [b.r, b.g, b.b]
    return {
      index,
      rgb,
      lab: rgbToLab(rgb),
      count: b.count,
      match: findRecipe(rgb, candidates),
      paintBrand: b.paintBrand,
      custom: b.custom,
      firstRow: Math.floor(b.first / cols),
      firstCol: b.first % cols,
    }
  })

  const order =
    opts.order === 'reading'
      ? orderByReading(buckets.map((b) => b.first))
      : orderBySimilarColour(colors.map((c) => c.lab))

  return { cols, rows, cells, colors, order }
}
