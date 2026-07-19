import type { OrderMode, PaintSetId } from '../engine'
import type { Unit } from '../lib/sizing'

export type AmountWording = 'parts' | 'touch'

// Everything the user can tune. Changing the grid-affecting fields (image size,
// pixel size) re-pixelates; changing colour fields only re-groups colours.
export interface ProjectSettings {
  unit: Unit
  imageWidthMM: number
  imageHeightMM: number // editable; seeded from the image aspect ratio
  pixelSizeMM: number
  black: boolean // kept for back-compat; black is no longer used in mixes
  colorStep: number // colour-detail quantisation step (1 = max detail)
  dither: boolean // dot optical-blend: vivid palette + Floyd–Steinberg
  ditherColors: number // dither palette size (more = smoother)
  reduce: boolean // smart palette reduction (median-cut) — realistic, fewer colours
  maxColors: number // target colour count when reducing
  paintSet: PaintSetId // mix your own from primaries, or Coloursmith custom pots
  order: OrderMode
  wording: AmountWording
  locked: boolean // lock the grid/pixel/size/detail so they can't change mid-painting
  showGrid: boolean
  showCoords: boolean
  showNumbers: boolean // paint-by-numbers overlay (colour's order number in each cell)
  hideCompleted: boolean
}

export interface ProjectMeta {
  id: string
  name: string
  createdAt: number
  lastOpenedAt: number
  imageW: number // natural image pixels
  imageH: number
  imageType: string
  thumbDataUrl?: string // small preview for the dashboard card
  settings: ProjectSettings
  // Derived grid, cached so the dashboard can show it without the image.
  cols: number
  rows: number
}

export function defaultSettings(imageW: number, imageH: number): ProjectSettings {
  const widthMM = 300 // 30 cm — a common small panel
  const aspect = imageW > 0 ? imageH / imageW : 1
  return {
    unit: 'cm',
    imageWidthMM: widthMM,
    imageHeightMM: Math.round(widthMM * aspect),
    pixelSizeMM: 5,
    black: false,
    colorStep: 24,
    dither: false, // off by default; opt into the dotty Bunney-style look
    ditherColors: 18, // vivid core; scroll up for more / smoother
    reduce: false, // off by default; smart reduction to a target count
    maxColors: 64, // realistic look at a fraction of the raw colour count
    paintSet: 'mix', // mix-your-own by default; switch to Coloursmith custom pots
    order: 'reading', // grid position (left→right, top→bottom) by default
    wording: 'parts',
    locked: false,
    showGrid: true,
    showCoords: true,
    showNumbers: true,
    hideCompleted: false,
  }
}
