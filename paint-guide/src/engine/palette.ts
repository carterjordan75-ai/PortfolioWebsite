import type { RGB } from './color'

// The oil-tube palette, with approximate masstone RGB values (straight from
// the tube, undiluted). These are starting points — real pigments behave
// differently in mixes, which the UI is honest about.

export type PaintKey = 'cw' | 'yl' | 'yd' | 'rw' | 'rc' | 'bw' | 'bc' | 'bk'
export type PaintRole = 'white' | 'colour' | 'black'

export interface Paint {
  key: PaintKey
  name: string
  short: string // compact name for recipe chips
  rgb: RGB
  role: PaintRole
}

export const PALETTE: Record<PaintKey, Paint> = {
  cw: { key: 'cw', name: 'Titanium White', short: 'White', rgb: [252, 252, 250], role: 'white' },
  yl: { key: 'yl', name: 'Cad Yellow Light', short: 'Yellow Lt', rgb: [255, 236, 0], role: 'colour' },
  yd: { key: 'yd', name: 'Cad Yellow Deep', short: 'Yellow Dp', rgb: [255, 170, 0], role: 'colour' },
  rw: { key: 'rw', name: 'Cad Red', short: 'Cad Red', rgb: [227, 38, 32], role: 'colour' },
  rc: { key: 'rc', name: 'Quinacridone Magenta', short: 'Magenta', rgb: [160, 18, 78], role: 'colour' },
  bw: { key: 'bw', name: 'Ultramarine Blue', short: 'Ultramarine', rgb: [38, 40, 128], role: 'colour' },
  bc: { key: 'bc', name: 'Phthalo Blue', short: 'Phthalo', rgb: [10, 58, 116], role: 'colour' },
  bk: { key: 'bk', name: 'Ivory Black', short: 'Black', rgb: [26, 26, 28], role: 'black' },
}

export const PAINT_KEYS = Object.keys(PALETTE) as PaintKey[]
export const COLOUR_KEYS: PaintKey[] = PAINT_KEYS.filter((k) => PALETTE[k].role === 'colour')
export const WHITE_KEY: PaintKey = 'cw'
export const BLACK_KEY: PaintKey = 'bk'
