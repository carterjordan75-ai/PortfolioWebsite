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
  /** Paints in one greyscale colour, so it follows the theme rather than
   *  carrying a colour of its own. */
  mono: boolean
}

/**
 * The loader compiled into the bundle. Always available, needs no
 * network, and is what shows if the pool is empty or has not arrived.
 */
export const BUILT_IN: LoaderArt = {
  css: XOXO_BRAND_CSS,
  svg: XOXO_BRAND_SVG,
  duration: XOXO_BRAND_DURATION,
  mono: XOXO_BRAND_MONO,
}

const CACHE_KEY = 'xoxoLoaderPick'

/**
 * Which loader plays this visit.
 *
 * A loader that has to be fetched before it can be shown is a
 * contradiction, so nothing here blocks on the network: the built-in one
 * is returned immediately, and the pool is primed in the background for
 * the rest of the session. The practical effect is that the first paint
 * of a session uses the built-in and everything after uses the pick —
 * which is also why the pick is per session rather than per navigation.
 * Refreshing rerolls it.
 */
/**
 * The pick, held once it is known.
 *
 * Only a REAL pick is cached. The built-in is a fallback for "the pick
 * has not arrived yet", and caching that was the bug: the store is
 * always empty on a fresh load, because priming fills it a moment
 * later, so the very first call locked the built-in in for the whole
 * page — and client-side navigation kept it, since the module does not
 * re-initialise. A loader added in the admin panel then took two full
 * reloads to appear, which reads as the panel doing nothing.
 *
 * What must not happen is the art changing identity DURING a run: the
 * mark is handed to dangerouslySetInnerHTML, and rewriting its
 * stylesheet redefines every @keyframes, which restarts every animation
 * from zero mid-flight. That is now held where it belongs — PageLoader
 * takes its art in lazy initial state, which React guarantees runs
 * once, rather than relying on this module never changing its answer.
 */
let resolved: LoaderArt | null = null

export function currentLoader(): LoaderArt {
  if (typeof window === 'undefined') return BUILT_IN
  if (resolved) return resolved
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return BUILT_IN
    const art = JSON.parse(raw) as LoaderArt
    if (!art || !art.css || !art.svg) return BUILT_IN
    return (resolved = art)
  } catch {
    return BUILT_IN
  }
}

let primed = false

/**
 * Fetch a pick and store it.
 *
 * Runs on every page load, not only when nothing is stored. The stored
 * pick is what the NEXT load shows, so priming every time is what makes
 * randomise actually reroll, and what makes a newly added loader turn
 * up without anyone clearing anything.
 *
 * localStorage rather than sessionStorage so a pick survives the tab
 * being closed — otherwise every new session starts on the built-in and
 * the pool is only ever seen by people who navigate twice.
 */
export async function primeLoaderPool(): Promise<void> {
  if (primed || typeof window === 'undefined') return
  primed = true

  try {
    const res = await fetch('/api/loaders?pick=1', { cache: 'no-store' })
    if (!res.ok) return
    const data = (await res.json()) as { art: LoaderArt | null }
    if (!data.art?.css || !data.art?.svg) {
      // The pool is empty or everything in it is disabled — drop any
      // stale pick so the built-in comes back rather than a loader the
      // admin panel has already retired.
      try { localStorage.removeItem(CACHE_KEY) } catch { /* nothing to clear */ }
      return
    }
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data.art))
    } catch {
      // Over quota. The built-in still works, so this is a miss, not a
      // failure.
    }
  } catch {
    /* offline or the route is down: the built-in covers it */
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
  void primeLoaderPool()
  resolved = null
}
