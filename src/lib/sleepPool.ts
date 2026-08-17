'use client'

import type { LoaderArt } from './loaderPool'

/**
 * The sleep pool: which mark plays when the site is left alone.
 *
 * Deliberately simpler than the loader pool next door. That one has to
 * have an answer ready before the first paint, so it keeps a pick in
 * localStorage and primes the next one in the background. This one gets
 * 45 seconds of warning, so it can just ask when it needs to know, and
 * always shows what the admin panel currently says rather than what it
 * said on some earlier visit.
 *
 * Held per mode, because light and dark can be restricted to different
 * marks and switching theme should get the right one rather than the one
 * already in hand.
 */
const held: Partial<Record<'light' | 'dark', LoaderArt | null>> = {}
const inFlight: Partial<Record<'light' | 'dark', Promise<LoaderArt | null>>> = {}

export function sleepArt(mode: 'light' | 'dark'): Promise<LoaderArt | null> {
  if (mode in held) return Promise.resolve(held[mode] ?? null)
  // One request per mode even if the idle timer and a theme change ask at
  // the same moment — the artwork is a few hundred KB and fetching it
  // twice to throw one away is the kind of thing nobody notices until the
  // month's bandwidth bill.
  const existing = inFlight[mode]
  if (existing) return existing

  const p = fetch(`/api/loaders?pick=1&kind=sleep&mode=${mode}`, { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then((d: { art?: LoaderArt | null } | null) => {
      // Either representation counts. This asked for css AND svg, which
      // was right until the API started serving the exported file
      // verbatim and blanking the rewrite — from then on every sleep mark
      // stored as a file failed this test and sleep silently never
      // happened. The same guard in loaderPool was updated; this copy was
      // missed, which is the cost of having two of them.
      const art = d?.art && (d.art.html || (d.art.css && d.art.svg)) ? d.art : null
      held[mode] = art
      return art
    })
    .catch(() => {
      // Offline, or the route is down. Remember nothing: sleep simply
      // does not happen this time, and the next idle asks again rather
      // than being stuck with a failure for the rest of the session.
      return null
    })
    .finally(() => { delete inFlight[mode] })

  inFlight[mode] = p
  return p
}

/** Forget the picks, so the next sleep asks again. For the admin panel. */
export function clearSleepPool() {
  delete held.light
  delete held.dark
}
