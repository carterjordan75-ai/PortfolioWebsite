import { type LAB, deltaE76 } from './color'
import { PALETTE, type PaintKey } from './palette'
import { type Parts } from './mixing'

export interface TransitionStep {
  key: PaintKey
  name: string
  delta: number // + = add more, − = use less
  text: string
}

export interface Transition {
  steps: TransitionStep[]
  mixFresh: boolean
  same: boolean
}

// Normalise a recipe to a fixed batch so two mixes can be compared as
// "how much more/less of each paint."
function normalize(parts: Parts, base = 12): Map<PaintKey, number> {
  let total = 0
  for (const k of Object.keys(parts) as PaintKey[]) total += parts[k] || 0
  const m = new Map<PaintKey, number>()
  if (total <= 0) return m
  for (const k of Object.keys(parts) as PaintKey[]) {
    const v = parts[k] || 0
    if (v > 0) m.set(k, Math.round((v / total) * base))
  }
  return m
}

const MIX_FRESH_DE = 26

// How to get from the previous mix to this one, as per-paint nudges. A big
// jump (or too many changes) says to mix fresh from the full recipe instead.
export function recipeTransition(
  prevParts: Parts,
  nextParts: Parts,
  prevLab: LAB,
  nextLab: LAB,
): Transition {
  const a = normalize(prevParts)
  const b = normalize(nextParts)
  const keys = new Set<PaintKey>([...a.keys(), ...b.keys()])
  const steps: TransitionStep[] = []
  for (const k of keys) {
    const pv = a.get(k) || 0
    const nv = b.get(k) || 0
    const delta = nv - pv
    if (delta === 0) continue
    const name = PALETTE[k].name
    const text = pv === 0 ? `Add ${name}` : nv === 0 ? `Drop the ${name}` : `${delta > 0 ? 'More' : 'Less'} ${name}`
    steps.push({ key: k, name, delta, text })
  }
  steps.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
  const de = deltaE76(prevLab, nextLab)
  return {
    steps: steps.slice(0, 3),
    mixFresh: de > MIX_FRESH_DE || steps.length > 4,
    same: steps.length === 0,
  }
}
