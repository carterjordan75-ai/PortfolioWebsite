import {
  type RGB,
  type LAB,
  srgbToLinear,
  linearToSrgb,
  rgbToLab,
  deltaE76,
  round255,
} from './color'
import {
  PALETTE,
  COLOUR_KEYS,
  WHITE_KEY,
  BLACK_KEY,
  type PaintKey,
  type PaintRole,
} from './palette'

// A recipe is a bag of paint parts, e.g. { rw: 2, bw: 1, cw: 3 }.
export type Parts = Partial<Record<PaintKey, number>>

// Reflectance floor from the prototype. Stops a near-zero channel from
// dragging the whole geometric mean to black (subtractive approximation).
const FLOOR = 0.03

// Subtractive mixing model: weighted geometric mean of *linear* reflectance.
// Order- and scale-independent (only the ratios between parts matter).
export function mixParts(parts: Parts): RGB {
  let total = 0
  for (const k of Object.keys(parts) as PaintKey[]) total += parts[k] || 0
  if (total <= 0) return [0, 0, 0]

  const acc = [0, 0, 0]
  for (const key of Object.keys(parts) as PaintKey[]) {
    const count = parts[key] || 0
    if (count <= 0) continue
    const w = count / total
    const rgb = PALETTE[key].rgb
    for (let c = 0; c < 3; c++) {
      const lin = Math.max(FLOOR, srgbToLinear(rgb[c] / 255))
      acc[c] += w * Math.log(lin)
    }
  }
  return [
    round255(linearToSrgb(Math.exp(acc[0])) * 255),
    round255(linearToSrgb(Math.exp(acc[1])) * 255),
    round255(linearToSrgb(Math.exp(acc[2])) * 255),
  ]
}

// ---- Candidate generation -------------------------------------------------

export interface Candidate {
  parts: Parts
  rgb: RGB
  lab: LAB
  complexity: number // number of non-white paints (white is "free" to add)
}

// White is added at Fibonacci-ish levels so tints span the full range cheaply.
const WHITE_LEVELS = [0, 1, 2, 3, 5, 8, 13]
const BLACK_LEVELS = [0, 1, 3]

// "A few ratio splits" for two- and three-paint base mixes.
const PAIR_SPLITS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [2, 1],
  [1, 2],
  [3, 1],
  [1, 3],
]
const TRIPLE_SPLITS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 1],
  [2, 1, 1],
  [1, 2, 1],
  [1, 1, 2],
]

// All singles, pairs and triples of the *colour* paints (white/black added later).
function colourBases(): Parts[] {
  const bases: Parts[] = []
  const C = COLOUR_KEYS

  for (const a of C) {
    const p: Parts = {}
    p[a] = 1
    bases.push(p)
  }
  for (let i = 0; i < C.length; i++) {
    for (let j = i + 1; j < C.length; j++) {
      for (const [x, y] of PAIR_SPLITS) {
        const p: Parts = {}
        p[C[i]] = x
        p[C[j]] = y
        bases.push(p)
      }
    }
  }
  for (let i = 0; i < C.length; i++) {
    for (let j = i + 1; j < C.length; j++) {
      for (let k = j + 1; k < C.length; k++) {
        for (const [x, y, z] of TRIPLE_SPLITS) {
          const p: Parts = {}
          p[C[i]] = x
          p[C[j]] = y
          p[C[k]] = z
          bases.push(p)
        }
      }
    }
  }
  return bases
}

function nonWhiteCount(parts: Parts): number {
  let n = 0
  for (const k of Object.keys(parts) as PaintKey[]) {
    if (k !== WHITE_KEY && (parts[k] || 0) > 0) n++
  }
  return n
}

function makeCandidate(parts: Parts): Candidate {
  const rgb = mixParts(parts)
  return { parts, rgb, lab: rgbToLab(rgb), complexity: nonWhiteCount(parts) }
}

let cacheNoBlack: Candidate[] | null = null
let cacheBlack: Candidate[] | null = null

// Precompute every candidate mix once (cached per black on/off). Each colour
// base is combined with every white level and (optionally) black level, plus a
// handful of pure neutrals so highlights and greys can be matched too.
export function buildCandidates(black: boolean): Candidate[] {
  if (black && cacheBlack) return cacheBlack
  if (!black && cacheNoBlack) return cacheNoBlack

  const out: Candidate[] = []
  const blackLevels = black ? BLACK_LEVELS : [0]

  for (const base of colourBases()) {
    for (const w of WHITE_LEVELS) {
      for (const bl of blackLevels) {
        const parts: Parts = { ...base }
        if (w > 0) parts[WHITE_KEY] = (parts[WHITE_KEY] || 0) + w
        if (bl > 0) parts[BLACK_KEY] = (parts[BLACK_KEY] || 0) + bl
        out.push(makeCandidate(parts))
      }
    }
  }

  // Neutrals (no colour paint): pure white, and — when black is on — greys
  // and pure black. Photos are full of highlights and shadows.
  out.push(makeCandidate({ [WHITE_KEY]: 1 }))
  if (black) {
    out.push(makeCandidate({ [BLACK_KEY]: 1 }))
    for (const w of [1, 2, 3, 5, 8, 13]) {
      for (const b of [1, 3]) {
        out.push(makeCandidate({ [WHITE_KEY]: w, [BLACK_KEY]: b }))
      }
    }
  }

  if (black) cacheBlack = out
  else cacheNoBlack = out
  return out
}

// ---- Recipe search --------------------------------------------------------

export type Quality = 'Excellent' | 'Good' | 'Close' | 'Approximate'

export function qualityFor(deltaE: number): Quality {
  if (deltaE <= 3) return 'Excellent'
  if (deltaE <= 7) return 'Good'
  if (deltaE <= 13) return 'Close'
  return 'Approximate'
}

export interface RecipeMatch {
  parts: Parts
  rgb: RGB // the colour this mix actually produces
  lab: LAB
  deltaE: number
  quality: Quality
}

// How many ΔE units a simpler mix is "worth" — a 2-paint mix has to beat a
// 1-paint mix by this much to win, so recipes stay practical at the palette knife.
const SIMPLICITY_WEIGHT = 1.6

// Pick the candidate closest to the target, but bias toward fewer paints.
export function findRecipe(target: RGB, candidates: Candidate[]): RecipeMatch {
  const tlab = rgbToLab(target)
  let best = candidates[0]
  let bestScore = Infinity
  let bestD = Infinity
  for (const cand of candidates) {
    const d = deltaE76(tlab, cand.lab)
    const score = d + SIMPLICITY_WEIGHT * Math.max(0, cand.complexity - 1)
    if (score < bestScore) {
      bestScore = score
      bestD = d
      best = cand
    }
  }
  return {
    parts: best.parts,
    rgb: best.rgb,
    lab: best.lab,
    deltaE: bestD,
    quality: qualityFor(bestD),
  }
}

// ---- Recipe formatting ----------------------------------------------------

export interface RecipeItem {
  key: PaintKey
  name: string
  short: string
  count: number
  role: PaintRole
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

// Ordered, gcd-reduced list of parts for display: colours first, then white,
// then black; ties broken by larger count. Reducing by the gcd keeps ratios
// like 2:2:6 readable as 1:1:3.
export function recipeItems(parts: Parts): RecipeItem[] {
  const keys = (Object.keys(parts) as PaintKey[]).filter((k) => (parts[k] || 0) > 0)
  if (keys.length === 0) return []

  let g = 0
  for (const k of keys) g = gcd(g, parts[k] || 0)
  if (g < 1) g = 1

  const roleOrder: PaintRole[] = ['colour', 'white', 'black']
  return keys
    .map((k) => ({
      key: k,
      name: PALETTE[k].name,
      short: PALETTE[k].short,
      count: (parts[k] || 0) / g,
      role: PALETTE[k].role,
    }))
    .sort(
      (a, b) =>
        roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) || b.count - a.count,
    )
}
