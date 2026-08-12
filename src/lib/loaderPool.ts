'use client'

import {
  XOXO_BRAND_CSS,
  XOXO_BRAND_SVG,
  XOXO_BRAND_DURATION,
} from '@/components/xoxoBrandLoaderAssets'

export type LoaderArt = { css: string; svg: string; duration: number }

/**
 * The loader compiled into the bundle. Always available, needs no
 * network, and is what shows if the pool is empty or has not arrived.
 */
export const BUILT_IN: LoaderArt = {
  css: XOXO_BRAND_CSS,
  svg: XOXO_BRAND_SVG,
  duration: XOXO_BRAND_DURATION,
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
export function currentLoader(): LoaderArt {
  if (typeof window === 'undefined') return BUILT_IN
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return BUILT_IN
    const art = JSON.parse(raw) as LoaderArt
    return art && art.css && art.svg ? art : BUILT_IN
  } catch {
    return BUILT_IN
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
}
