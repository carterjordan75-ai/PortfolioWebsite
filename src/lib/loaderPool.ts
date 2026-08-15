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
 * Resolved once and then held.
 *
 * This has to be stable by IDENTITY, not just by value. The mark is
 * painted by handing a stylesheet and an SVG to dangerouslySetInnerHTML,
 * and React rewrites both the moment the strings it is given differ.
 * Rewriting the stylesheet redefines every @keyframes in it, which
 * restarts all 319 animations from zero — mid-run, with no DOM change
 * to show for it.
 *
 * That is exactly what used to happen: this function read sessionStorage
 * on every call and built a new object each time, while primeLoaderPool
 * filled that storage in the background about a second in. Any recompute
 * after it landed handed back a different loader and the mark started
 * again part way through. useMemo was no defence — React is free to
 * discard a memo and recompute it, and it does.
 *
 * Holding the first answer means a run cannot be interrupted by one. A
 * pool pick still applies, from the next full page load.
 */
let resolved: LoaderArt | null = null

export function currentLoader(): LoaderArt {
  if (typeof window === 'undefined') return BUILT_IN
  if (resolved) return resolved
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return (resolved = BUILT_IN)
    const art = JSON.parse(raw) as LoaderArt
    return (resolved = art && art.css && art.svg ? art : BUILT_IN)
  } catch {
    return (resolved = BUILT_IN)
  }
}

let primed = false

/** Fetch this session's pick. Safe to call repeatedly; only runs once. */
export async function primeLoaderPool(): Promise<void> {
  if (primed || typeof window === 'undefined') return
  primed = true
  if (sessionStorage.getItem(CACHE_KEY)) return

  try {
    const res = await fetch('/api/loaders?pick=1', { cache: 'no-store' })
    if (!res.ok) return
    const data = (await res.json()) as { art: LoaderArt | null }
    if (!data.art?.css || !data.art?.svg) return
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(data.art))
    } catch {
      // Over quota — a ~400KB loader can tip a full sessionStorage. The
      // built-in still works, so this is a miss, not a failure.
    }
  } catch {
    /* offline or the route is down: the built-in covers it */
  }
}

/** Drop the cached pick so the next prime rerolls. Used by the admin panel. */
export function clearLoaderPick() {
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {
    /* nothing to clear */
  }
  primed = false
  resolved = null
}
