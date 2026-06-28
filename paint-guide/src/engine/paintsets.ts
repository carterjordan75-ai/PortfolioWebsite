// Paint sets that don't snap to a fixed colour range:
//   'mix'         — a median-cut palette you mix yourself from primaries
//   'coloursmith' — each cell kept as its exact colour, ordered as a custom pot
export type PaintSetId = 'mix' | 'coloursmith'
