import type { AmountWording } from '../db/types'
import type { Quality } from '../engine'

// Render a part count as "×2" or, in 'touch' mode, as words.
export function amountLabel(count: number, wording: AmountWording): string {
  if (wording === 'parts') return '×' + count
  if (count === 1) return 'a touch'
  if (count === 2) return 'a dab'
  if (count === 3) return 'a part'
  return count + ' parts'
}

export const QUALITY_CLASS: Record<Quality, string> = {
  Excellent: 'excellent',
  Good: 'good',
  Close: 'close',
  Approximate: 'approximate',
}

// Grid coordinate as "V14,H78" — V = vertical (row, how far down), H =
// horizontal (column, how far across). 1-based.
export function coordLabel(row: number, col: number): string {
  return `V${row + 1},H${col + 1}`
}
