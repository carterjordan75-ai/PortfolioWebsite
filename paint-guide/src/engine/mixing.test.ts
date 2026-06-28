import { describe, it, expect } from 'vitest'
import { rgbToLab, deltaE76, type RGB } from './color'
import {
  mixParts,
  buildCandidates,
  findRecipe,
  qualityFor,
  recipeItems,
} from './mixing'
import { PALETTE } from './palette'
import { orderBySimilarColour } from './order'
import { adjustmentFrom } from './adjust'
import { buildGuide, quantizeChannel } from './guide'
import { recipeTransition } from './transition'
import { DOT_PALETTE, floydSteinbergIndices, medianCutPalette } from './dither'

describe('colour conversions', () => {
  it('black is L*≈0, white is L*≈100', () => {
    expect(rgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 1)
    expect(rgbToLab([255, 255, 255])[0]).toBeCloseTo(100, 1)
  })

  it('ΔE of a colour with itself is 0 and is symmetric', () => {
    const a = rgbToLab([120, 60, 200])
    const b = rgbToLab([10, 200, 90])
    expect(deltaE76(a, a)).toBe(0)
    expect(deltaE76(a, b)).toBeCloseTo(deltaE76(b, a), 10)
  })
})

describe('mixing model', () => {
  it('a single paint reproduces its own masstone (white, unaffected by floor)', () => {
    expect(mixParts({ cw: 1 })).toEqual(PALETTE.cw.rgb)
  })

  it('empty mix is guarded to black', () => {
    expect(mixParts({})).toEqual([0, 0, 0])
  })

  it('is scale-independent — only ratios matter', () => {
    expect(mixParts({ rw: 1, cw: 1 })).toEqual(mixParts({ rw: 2, cw: 2 }))
    expect(mixParts({ rw: 1, bw: 3 })).toEqual(mixParts({ rw: 2, bw: 6 }))
  })

  it('is order-independent', () => {
    expect(mixParts({ rw: 1, bw: 2 })).toEqual(mixParts({ bw: 2, rw: 1 }))
  })

  it('adding white raises lightness (L*)', () => {
    const red = rgbToLab(mixParts({ rw: 1 }))
    const tint = rgbToLab(mixParts({ rw: 1, cw: 5 }))
    expect(tint[0]).toBeGreaterThan(red[0])
  })

  it('yellow + blue kills the blue channel (warm olive, classic subtractive)', () => {
    const mix = mixParts({ yl: 1, bw: 1 })
    expect(mix[2]).toBeLessThan(mix[0])
    expect(mix[2]).toBeLessThan(mix[1])
  })
})

describe('quality bands', () => {
  it('maps ΔE to the spec bands', () => {
    expect(qualityFor(0)).toBe('Excellent')
    expect(qualityFor(3)).toBe('Excellent')
    expect(qualityFor(3.01)).toBe('Good')
    expect(qualityFor(7)).toBe('Good')
    expect(qualityFor(13)).toBe('Close')
    expect(qualityFor(13.01)).toBe('Approximate')
  })
})

describe('recipe search', () => {
  it('matches pure white excellently and includes white in the recipe', () => {
    const cands = buildCandidates(false)
    const m = findRecipe([252, 252, 250], cands)
    expect(m.deltaE).toBeLessThan(3)
    expect(m.quality).toBe('Excellent')
    expect(Object.keys(m.parts)).toContain('cw')
  })

  it('finds a usable mix for every tube masstone', () => {
    const cands = buildCandidates(true)
    for (const p of Object.values(PALETTE)) {
      const m = findRecipe(p.rgb as RGB, cands)
      // saturated cadmiums are hard, but we should at least land "Close".
      expect(m.deltaE).toBeLessThanOrEqual(13)
    }
  })

  it('enabling black improves neutral-grey matches', () => {
    const grey: RGB = [128, 128, 128]
    const without = findRecipe(grey, buildCandidates(false)).deltaE
    const wi = findRecipe(grey, buildCandidates(true)).deltaE
    expect(wi).toBeLessThanOrEqual(without)
  })

  it('caches candidate sets (same reference across calls)', () => {
    expect(buildCandidates(false)).toBe(buildCandidates(false))
    expect(buildCandidates(true)).toBe(buildCandidates(true))
  })
})

describe('recipe formatting', () => {
  it('reduces ratios by their gcd and orders colour → white → black', () => {
    const items = recipeItems({ rw: 2, cw: 6, bk: 2 })
    expect(items.map((i) => [i.key, i.count])).toEqual([
      ['rw', 1],
      ['cw', 3],
      ['bk', 1],
    ])
  })
})

describe('painting order', () => {
  it('starts at the darkest colour and visits every colour once', () => {
    const labs = [
      rgbToLab([255, 255, 255]),
      rgbToLab([10, 10, 10]), // darkest
      rgbToLab([200, 30, 30]),
      rgbToLab([30, 30, 200]),
    ]
    const order = orderBySimilarColour(labs)
    expect(order[0]).toBe(1)
    expect([...order].sort()).toEqual([0, 1, 2, 3])
  })
})

describe('adjustment guidance', () => {
  it('recommends adding white when the next colour is lighter', () => {
    const adj = adjustmentFrom(rgbToLab([80, 40, 40]), rgbToLab([180, 120, 120]))
    expect(adj.steps[0].axis).toBe('L')
    expect(adj.steps[0].text.toLowerCase()).toContain('white')
  })

  it('flags a huge jump as "mix fresh"', () => {
    const adj = adjustmentFrom(rgbToLab([10, 10, 10]), rgbToLab([250, 250, 60]))
    expect(adj.mixFresh).toBe(true)
  })
})


describe('recipe transition guidance', () => {
  it('tells you to add more of the paint a colour gains', () => {
    const t = recipeTransition(
      { yl: 1, cw: 3 },
      { yl: 3, cw: 2 },
      rgbToLab([200, 180, 90]),
      rgbToLab([225, 210, 60]),
    )
    expect(t.same).toBe(false)
    const yellow = t.steps.find((s) => s.text.toLowerCase().includes('yellow'))
    expect(yellow).toBeTruthy()
    expect(yellow!.delta).toBeGreaterThan(0)
  })

  it('flags a big colour change as mix-fresh', () => {
    const t = recipeTransition(
      { bw: 1 },
      { yl: 1 },
      rgbToLab([30, 40, 128]),
      rgbToLab([255, 236, 0]),
    )
    expect(t.mixFresh).toBe(true)
  })
})

describe('guide building + quantisation', () => {
  it('rounds channels to the step', () => {
    expect(quantizeChannel(130, 32)).toBe(128)
    expect(quantizeChannel(200, 1)).toBe(200)
    expect(quantizeChannel(255, 32)).toBe(255)
  })

  it('groups a 2×2 image into its unique quantised colours', () => {
    // two reddish + two near-white pixels; reds merge under a coarse step.
    const rgba = new Uint8ClampedArray([
      230, 20, 20, 255, // red
      226, 24, 18, 255, // red (merges with above at step 32)
      250, 250, 250, 255, // white
      0, 0, 0, 0, // transparent → skipped
    ])
    const g = buildGuide(rgba, 2, 2, { colorStep: 32, black: true, order: 'reading' })
    expect(g.colors.length).toBe(2)
    expect(g.cells[3]).toBe(-1) // transparent skipped
    const total = g.colors.reduce((s, c) => s + c.count, 0)
    expect(total).toBe(3)
    expect(g.order.length).toBe(2)
  })

  it('keeps the true image colour in plain quantise mode', () => {
    const rgba = new Uint8ClampedArray([40, 90, 160, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const g = buildGuide(rgba, 2, 2, { colorStep: 1, black: false, order: 'reading' })
    expect(g.colors.length).toBe(1)
    expect([...g.colors[0].rgb]).toEqual([40, 90, 160])
    expect(g.colors[0].custom).toBeFalsy()
  })
})

describe('dither (dot optical-blend)', () => {
  it('floyd–steinberg maps every opaque cell to a palette index', () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4)
    for (let i = 0; i < 16; i++) {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = (i * 16) % 256
      rgba[i * 4 + 3] = 255
    }
    const idx = floydSteinbergIndices(rgba, 4, 4, DOT_PALETTE)
    for (const v of idx) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(DOT_PALETTE.length)
    }
  })

  it('buildGuide dither mode yields a limited palette of real palette colours', () => {
    const rgba = new Uint8ClampedArray(8 * 8 * 4)
    for (let i = 0; i < 64; i++) {
      rgba[i * 4] = (i * 37) % 256
      rgba[i * 4 + 1] = (i * 91) % 256
      rgba[i * 4 + 2] = (i * 53) % 256
      rgba[i * 4 + 3] = 255
    }
    const g = buildGuide(rgba, 8, 8, { colorStep: 24, black: false, order: 'reading', dither: true })
    expect(g.colors.length).toBeGreaterThan(1)
    expect(g.colors.length).toBeLessThanOrEqual(DOT_PALETTE.length)
    const palette = new Set(DOT_PALETTE.map((c) => c.join(',')))
    for (const c of g.colors) expect(palette.has([...c.rgb].join(','))).toBe(true)
  })
})

describe('smart palette reduction (median-cut)', () => {
  function gradientRgba(w: number, h: number): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = (i * 7) % 256
      rgba[i * 4 + 1] = (i * 13) % 256
      rgba[i * 4 + 2] = (i * 29) % 256
      rgba[i * 4 + 3] = 255
    }
    return rgba
  }

  it('median-cut returns at most the target number of colours', () => {
    const pal = medianCutPalette(gradientRgba(10, 10), 10, 10, 16)
    expect(pal.length).toBeGreaterThan(1)
    expect(pal.length).toBeLessThanOrEqual(16)
  })

  it('buildGuide reduce mode yields ≤ target colours (flat, realistic)', () => {
    const g = buildGuide(gradientRgba(10, 10), 10, 10, {
      colorStep: 24,
      black: false,
      order: 'reading',
      reduce: true,
      maxColors: 12,
    })
    expect(g.colors.length).toBeGreaterThan(1)
    expect(g.colors.length).toBeLessThanOrEqual(12)
  })

  it('coloursmith mode keeps exact colours as custom pots (no names/mixing)', () => {
    const g = buildGuide(gradientRgba(10, 10), 10, 10, {
      colorStep: 24,
      black: false,
      order: 'reading',
      paintSet: 'coloursmith',
      maxColors: 12,
    })
    expect(g.colors.length).toBeGreaterThan(1)
    for (const c of g.colors) {
      expect(c.custom).toBe(true)
      expect(c.paintBrand).toBe('Coloursmith')
    }
  })
})
