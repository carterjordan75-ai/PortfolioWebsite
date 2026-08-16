'use client'

import {
  XOXO_BRAND_CSS,
  XOXO_BRAND_SVG,
  XOXO_BRAND_DURATION,
  XOXO_BRAND_MONO,
} from '@/components/xoxoBrandLoaderAssets'

export type LoaderArt = {
  css: string
  svg: string
  duration: number
  /**
   * Built in the tuner's sleep mode: its ambient parts already repeat and
   * its entrance is meant to arrive once and stay. Absent on everything
   * else, which the sleep overlay has to force into looping itself.
   */
  loop?: boolean
  /** The exported file, verbatim. Played as-is when present. */
  html?: string
  /** Paints in one greyscale colour, so it follows the theme rather than
   *  carrying a colour of its own. */
  mono: boolean
}

/**
 * Kept only so the gate and the mobile lock — which show a finished mark
 * as a brand lockup rather than as a loading animation — still have
 * something to draw. Nothing on the loading path uses it.
 */
export const BUILT_IN: LoaderArt = {
  css: XOXO_BRAND_CSS,
  svg: XOXO_BRAND_SVG,
  duration: XOXO_BRAND_DURATION,
  mono: XOXO_BRAND_MONO,
}

const CACHE_KEY = 'xoxoLoaderPick'

/**
 * The pick, held once known, so the mark cannot change identity during a
 * run — rewriting its stylesheet redefines every @keyframes and restarts
 * the animation from zero.
 */
let resolved: LoaderArt | null = null

/**
 * The pool's pick, or nothing.
 *
 * There is deliberately no fallback mark. The loaders that play are the
 * ones in the admin panel and only those — a compiled-in default is a
 * second, invisible place the site's look is decided from, and the one
 * that used to live here shipped on every page whether it was wanted or
 * not. With no pick yet, the loading screen shows its ground and no
 * mark, which is quieter than showing the wrong one.
 */
export function currentLoader(): LoaderArt | null {
  if (typeof window === 'undefined') return null
  if (resolved) return resolved
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const art = JSON.parse(raw) as LoaderArt
    // Either representation counts: the file itself, or the older
    // css/svg rewrite for artwork saved before the file was kept.
    if (!art || !(art.html || (art.css && art.svg))) return null
    return (resolved = art)
  } catch {
    return null
  }
}

let primed = false
/** Remembered so a re-prime after an admin change asks for the same
 *  theme the page is actually in. */
let currentMode: 'light' | 'dark' | undefined

/**
 * Fetch a pick and store it.
 *
 * Runs on every page load, not only when nothing is stored. The stored
 * pick is what the NEXT load shows, so priming every time is what makes
 * randomise actually reroll, and what makes a newly added loader turn
 * up without anyone clearing anything.
 *
 * localStorage rather than sessionStorage so a pick survives the tab
 * being closed — otherwise every new visit starts with no mark at all
 * and the pool is only ever seen by people who navigate twice.
 */
export async function primeLoaderPool(mode?: 'light' | 'dark'): Promise<void> {
  if (primed || typeof window === 'undefined') return
  primed = true
  currentMode = mode ?? currentMode

  try {
    // The mode goes with the request: a loader can be restricted to one
    // theme, and only the browser knows which theme it is in.
    const res = await fetch(
      '/api/loaders?pick=1' + (mode ? '&mode=' + mode : ''),
      { cache: 'no-store' },
    )
    if (!res.ok) return
    const data = (await res.json()) as { art: LoaderArt | null }
    if (!data.art?.html && !(data.art?.css && data.art?.svg)) {
      // The pool is empty or everything in it is disabled — drop any
      // stale pick, so a loader retired in the panel stops playing
      // instead of lingering in whoever's browser already had it.
      try { localStorage.removeItem(CACHE_KEY) } catch { /* nothing to clear */ }
      return
    }
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data.art))
    } catch {
      // Over quota. The screen still covers the page without a mark, so
      // this is a miss rather than a failure.
    }
  } catch {
    /* offline or the route is down: the screen shows its ground */
  }
}

/**
 * Drop the pick and fetch a fresh one straight away.
 *
 * Called by the admin panel after the pool changes. Re-priming rather
 * than only clearing is what lets a newly added loader show on the very
 * next page load instead of the one after it.
 */
export function clearLoaderPick() {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* nothing to clear */
  }
  resolved = null
  primed = false
  void primeLoaderPool(currentMode)
}
