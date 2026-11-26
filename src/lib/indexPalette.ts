/**
 * The Index hover palette.
 *
 * One row = one colour, assigned by position (`hoverColors[i % length]`)
 * over the featured list in API order. The full index page and the
 * miniature index on every project page both draw from here, so a row
 * keeps the same colour wherever it appears — change the palette in one
 * place and both views follow.
 */
export const hoverColors = [
  '#e94560', '#ff6b35', '#00b4d8', '#7209b7', '#06d6a0',
  '#fb5607', '#3a86ff', '#8338ec', '#ff006e', '#38b000',
  '#f72585', '#4cc9f0', '#ef476f', '#ffd166', '#118ab2',
]
