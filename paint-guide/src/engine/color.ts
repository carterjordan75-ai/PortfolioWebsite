// Colour-space math: sRGB <-> linear, RGB -> CIELAB, and ΔE76.
// Everything here is pure and framework-agnostic so it can be unit tested.

export type RGB = readonly [number, number, number] // 0..255
export type LAB = readonly [number, number, number] // L 0..100, a/b roughly -128..128

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function round255(v: number): number {
  return clamp(Math.round(v), 0, 255)
}

// sRGB companding. Channel in 0..1.
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function linearToSrgb(l: number): number {
  return l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055
}

// sRGB (0..255, D65) -> CIE XYZ (0..1 reference white).
export function rgbToXyz(rgb: RGB): [number, number, number] {
  const r = srgbToLinear(rgb[0] / 255)
  const g = srgbToLinear(rgb[1] / 255)
  const b = srgbToLinear(rgb[2] / 255)
  const x = r * 0.4124 + g * 0.3576 + b * 0.1805
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722
  const z = r * 0.0193 + g * 0.1192 + b * 0.9505
  return [x, y, z]
}

// D65 reference white.
const Xn = 0.95047
const Yn = 1.0
const Zn = 1.08883

function labF(t: number): number {
  const d = 6 / 29
  return t > d * d * d ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29
}

export function rgbToLab(rgb: RGB): LAB {
  const [x, y, z] = rgbToXyz(rgb)
  const fx = labF(x / Xn)
  const fy = labF(y / Yn)
  const fz = labF(z / Zn)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

// CIE76 colour difference. Good enough for picking a paint mix.
export function deltaE76(a: LAB, b: LAB): number {
  const dl = a[0] - b[0]
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dl * dl + da * da + db * db)
}

// Relative luminance (0..1) in linear light — used to pick legible text colour
// for the paint-by-numbers overlay.
export function luminance(rgb: RGB): number {
  return (
    0.2126 * srgbToLinear(rgb[0] / 255) +
    0.7152 * srgbToLinear(rgb[1] / 255) +
    0.0722 * srgbToLinear(rgb[2] / 255)
  )
}

export function rgbToHex(rgb: RGB): string {
  return (
    '#' +
    rgb
      .map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0'))
      .join('')
  )
}
