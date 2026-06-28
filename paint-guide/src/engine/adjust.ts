import { type LAB, deltaE76 } from './color'

// "Coming from the last colour" guidance: how to nudge the previous mix into
// the current one, expressed along the three LAB axes.

export type AdjustAxis = 'L' | 'a' | 'b'

export interface AdjustStep {
  axis: AdjustAxis
  magnitude: number
  text: string
}

export interface Adjustment {
  deltaE: number
  mixFresh: boolean // jump is big enough that adjusting isn't worth it
  steps: AdjustStep[] // the 1–2 biggest moves
}

// Above this ΔE the two colours are too far apart to reach by tweaking —
// tell the painter to mix fresh instead.
const MIX_FRESH_THRESHOLD = 22

// Ignore axis moves smaller than this (LAB units) — they're noise.
const MIN_AXIS = 1

export function adjustmentFrom(prev: LAB, next: LAB): Adjustment {
  const dL = next[0] - prev[0]
  const da = next[1] - prev[1]
  const db = next[2] - prev[2]
  const de = deltaE76(prev, next)

  const candidates: AdjustStep[] = [
    {
      axis: 'L',
      magnitude: Math.abs(dL),
      text: dL > 0 ? 'Lighter — add white' : 'Darker — a touch of Ultramarine',
    },
    {
      axis: 'a',
      magnitude: Math.abs(da),
      text:
        da > 0
          ? 'Warmer — a touch of Cad Red'
          : 'Greener — a whisper of Phthalo + Cad Yellow',
    },
    {
      axis: 'b',
      magnitude: Math.abs(db),
      text: db > 0 ? 'Add Cad Yellow' : 'Cooler — a touch of Ultramarine',
    },
  ]

  candidates.sort((x, y) => y.magnitude - x.magnitude)
  const steps = candidates.filter((s) => s.magnitude >= MIN_AXIS).slice(0, 2)

  return { deltaE: de, mixFresh: de > MIX_FRESH_THRESHOLD, steps }
}
