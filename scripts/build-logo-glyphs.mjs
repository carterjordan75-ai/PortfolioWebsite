#!/usr/bin/env node
/**
 * Builds the animator's glyph model from the wordmark SVG.
 *
 * The tuner deforms points, not paths, so it needs each letter as a
 * fixed-length ring of points plus a matching circle to morph to. This
 * derives both from public/assets/Logos/xoxo_Logo_005.svg, which is the
 * one place the mark is defined — change the logo there and re-run this.
 *
 * Two things are read straight out of that file rather than re-traced:
 * the O's are exact circles (a fit to the original trace landed within
 * 0.06%), and both X's are one path definition placed twice. So only
 * the X needs sampling, and the O's are generated analytically, which
 * makes their counters perfectly round.
 *
 *   node scripts/build-logo-glyphs.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SVG = resolve(root, 'public/assets/Logos/xoxo_Logo_005.svg')
const OUT = resolve(root, 'tools/logo/glyphs.json')

const N = 72            // points per ring — the tuner's fixed length
const svg = readFileSync(SVG, 'utf8')

/* ---- read the pieces out of the SVG ---- */
const xd = svg.match(/<path id="x" d="([^"]+)"/)[1]
const uses = [...svg.matchAll(/<use href="#x" x="([-\d.]+)" y="([-\d.]+)"/g)]
  .map(m => [parseFloat(m[1]), parseFloat(m[2])])
// O's: outer circle then counter, both as "M cx-r,cy a r,r ..."
const circles = [...svg.matchAll(/M([-\d.]+),([-\d.]+)a([-\d.]+),/g)]
  .map(m => {
    const r = parseFloat(m[3])
    return { cx: parseFloat(m[1]) + r, cy: parseFloat(m[2]), r }
  })
const Os = [
  { outer: circles[0], hole: circles[1] },
  { outer: circles[2], hole: circles[3] },
]
const viewBox = svg.match(/viewBox="0 0 1000 ([\d.]+)"/)[1]

/* ---- sample the X path ---- */
function parseCubics(d) {
  const nums = d.match(/-?\d*\.?\d+/g).map(Number)
  const start = [nums[0], nums[1]]
  const segs = []
  let cur = start
  for (let i = 2; i + 5 < nums.length; i += 6) {
    const seg = [cur, [nums[i], nums[i+1]], [nums[i+2], nums[i+3]], [nums[i+4], nums[i+5]]]
    segs.push(seg)
    cur = seg[3]
  }
  return segs
}
const at = (s, t) => {
  const u = 1 - t
  return [
    u*u*u*s[0][0] + 3*u*u*t*s[1][0] + 3*u*t*t*s[2][0] + t*t*t*s[3][0],
    u*u*u*s[0][1] + 3*u*u*t*s[1][1] + 3*u*t*t*s[2][1] + t*t*t*s[3][1],
  ]
}
/** Dense polyline, then resample to exactly n points by arc length. */
function sampleClosed(d, n) {
  const segs = parseCubics(d)
  const dense = []
  for (const s of segs) for (let k = 0; k < 24; k++) dense.push(at(s, k/24))
  const m = dense.length
  const seg = [], lens = []
  let total = 0
  for (let i = 0; i < m; i++) {
    const a = dense[i], b = dense[(i+1)%m]
    const L = Math.hypot(b[0]-a[0], b[1]-a[1])
    seg.push(L); total += L; lens.push(total)
  }
  const out = []
  for (let k = 0; k < n; k++) {
    const target = k*total/n
    let j = 0
    while (j < m-1 && lens[j] < target) j++
    const prev = j ? lens[j-1] : 0
    const t = seg[j] ? (target-prev)/seg[j] : 0
    const a = dense[j], b = dense[(j+1)%m]
    out.push([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t])
  }
  return out
}

const circleRing = (cx, cy, r, n, phase = -Math.PI/2) =>
  Array.from({length: n}, (_, k) => {
    const a = phase + k/n*Math.PI*2
    return [cx + Math.cos(a)*r, cy + Math.sin(a)*r]
  })

const signedArea = p => p.reduce((s, q, i) => {
  const n2 = p[(i+1)%p.length]; return s + q[0]*n2[1] - n2[0]*q[1]
}, 0) / 2

const bbox = p => {
  const xs = p.map(q => q[0]), ys = p.map(q => q[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const y0 = Math.min(...ys), y1 = Math.max(...ys)
  return { cx: (x0+x1)/2, cy: (y0+y1)/2, w: x1-x0, h: y1-y0 }
}

/**
 * The morph target: each point pushed out to a circle of radius w/2
 * along its own direction from the centre. Matching point i to point i
 * by angle is what stops the shape twisting as it morphs.
 */
function morphCircle(p, box) {
  const r = box.w/2
  return p.map(q => {
    const dx = q[0]-box.cx, dy = q[1]-box.cy
    const L = Math.hypot(dx, dy) || 1
    return [box.cx + dx/L*r, box.cy + dy/L*r]
  })
}

const round = p => p.map(q => [+q[0].toFixed(2), +q[1].toFixed(2)])

/* ---- assemble, in reading order: X O X O ---- */
const xRing = sampleClosed(xd, N)
const blobs = []
const order = [
  { kind: 'X', at: uses[0] },
  { kind: 'O', o: Os[0] },
  { kind: 'X', at: uses[1] },
  { kind: 'O', o: Os[1] },
]

order.forEach((item, g) => {
  if (item.kind === 'X') {
    let p = xRing.map(q => [q[0]+item.at[0], q[1]+item.at[1]])
    if (signedArea(p) < 0) p = p.slice().reverse()      // match the O's winding
    const box = bbox(p)
    blobs.push({ g, cx:+box.cx.toFixed(2), cy:+box.cy.toFixed(2),
                 w:+box.w.toFixed(2), h:+box.h.toFixed(2),
                 p: round(p), c: round(morphCircle(p, box)) })
  } else {
    const { outer, hole } = item.o
    let p = circleRing(outer.cx, outer.cy, outer.r, N)
    if (signedArea(p) < 0) p = p.slice().reverse()
    const box = bbox(p)
    // The counter morphs by shrinking to nothing rather than to a ring
    // of its own — a hole that grows open reads as the letter opening,
    // which is what the O should do.
    const hp = circleRing(hole.cx, hole.cy, hole.r, N)
    const hc = circleRing(hole.cx, hole.cy, hole.r*0.06, N)
    blobs.push({ g, cx:+box.cx.toFixed(2), cy:+box.cy.toFixed(2),
                 w:+box.w.toFixed(2), h:+box.h.toFixed(2),
                 p: round(p), c: round(morphCircle(p, box)),
                 hp: round(hp), hc: round(hc) })
  }
})

const lcen = blobs.map(b => [+b.cx.toFixed(2), +b.cy.toFixed(2)])

/* The accent marks — teardrop, spark, scribble and the rest — are the
   tuner's own artwork, nothing to do with the wordmark, and they live
   in the same D object. They are kept beside this script rather than
   regenerated, because there is nothing to generate them from: an
   earlier version of this dropped them and the tool booted to a blank
   stage with an undefined-property error. */
const marks = JSON.parse(readFileSync(resolve(root, 'tools/logo/marks.json'), 'utf8'))
const D = { blobs, lcen, marks }

writeFileSync(OUT, JSON.stringify(D))
console.log(`viewBox 0 0 1000 ${viewBox}`)
blobs.forEach((b, i) => console.log(
  `  blob ${i}: g=${b.g} cx=${b.cx} cy=${b.cy} w=${b.w} h=${b.h}` +
  ` p=${b.p.length}${b.hp ? ` hole=${b.hp.length}` : ''}`))
console.log(`letters ${lcen.length}, centres ${JSON.stringify(lcen)}`)
console.log(`wrote ${OUT.replace(root+'/','')} (${(JSON.stringify(D).length/1024).toFixed(1)}KB)`)
