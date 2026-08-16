'use client'

/**
 * How big the wordmark sits, per place it appears.
 *
 * Each surface already has a considered size — the header clamps between
 * two rems, the loader sits at a share of the viewport — and those are
 * responsive rules worth keeping. So this is a MULTIPLIER on each rather
 * than a replacement for it: 1 is whatever the design says, and the dial
 * nudges it without flattening the clamp into a fixed number.
 *
 * It travels as CSS custom properties rather than as props. The wordmark
 * turns up in places that have no route to a shared fetch — the loader
 * covers the gate and the mobile lock, where the navigation is not
 * mounted — and a variable with a default in the `var()` means those
 * surfaces size themselves correctly having never heard of this file.
 */
export type LogoScales = {
  /** Top-left wordmark in the navigation. */
  header: number
  /** Wordmark inside the info / menu popup. */
  popup: number
  /** The animated mark on the loading screen. */
  loader: number
}

export const DEFAULT_LOGO_SCALES: LogoScales = { header: 1, popup: 1, loader: 1 }

/** The page key these live under in pages.json. */
export const LOGO_SCALE_PAGE = 'logo'

const VAR = {
  header: '--logo-scale-header',
  popup: '--logo-scale-popup',
  loader: '--logo-scale-loader',
} as const

/**
 * Sizes are clamped rather than trusted. These come from stored admin
 * data, and a stray value should make the mark a bit wrong, not make it
 * invisible or cover the page.
 */
const clamp = (v: unknown, lo = 0.4, hi = 2.5): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  if (!isFinite(n)) return 1
  return Math.min(hi, Math.max(lo, n))
}

export function readLogoScales(raw: unknown): LogoScales {
  const r = (raw ?? {}) as Partial<Record<keyof LogoScales, unknown>>
  return {
    header: clamp(r.header ?? 1),
    popup: clamp(r.popup ?? 1),
    loader: clamp(r.loader ?? 1),
  }
}

/** Write them to the document so every surface picks them up at once. */
export function applyLogoScales(s: LogoScales): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  ;(Object.keys(VAR) as Array<keyof LogoScales>).forEach(k => {
    root.style.setProperty(VAR[k], String(s[k]))
  })
}

/**
 * A size expression that respects the dial.
 *
 * Wrapping the original rule in a calc keeps the clamp doing its job at
 * every viewport and multiplies the result, so the responsive behaviour
 * survives being scaled.
 */
export const scaled = (css: string, which: keyof LogoScales): string =>
  `calc((${css}) * var(${VAR[which]}, 1))`
