// Physical-size helpers. Internally everything is millimetres; cm is purely a
// display toggle.

export type Unit = 'mm' | 'cm'

export const MM_PER_CM = 10

// CSS reference pixel: 96px per inch → px per mm. Used for the (approximate)
// "actual size" view — real on-screen size depends on the monitor.
export const CSS_PX_PER_MM = 96 / 25.4 // ≈ 3.7795

export function toMM(value: number, unit: Unit): number {
  return unit === 'cm' ? value * MM_PER_CM : value
}

export function fromMM(mm: number, unit: Unit): number {
  return unit === 'cm' ? mm / MM_PER_CM : mm
}

export interface Grid {
  cols: number
  rows: number
}

export function deriveGrid(
  imageWidthMM: number,
  imageHeightMM: number,
  pixelSizeMM: number,
): Grid {
  if (!(pixelSizeMM > 0)) return { cols: 1, rows: 1 }
  return {
    cols: Math.max(1, Math.round(imageWidthMM / pixelSizeMM)),
    rows: Math.max(1, Math.round(imageHeightMM / pixelSizeMM)),
  }
}

// Tidy a millimetre value for display (avoid 4.999999 cm etc).
export function fmt(value: number, digits = 2): string {
  const r = Number(value.toFixed(digits))
  return String(r)
}
