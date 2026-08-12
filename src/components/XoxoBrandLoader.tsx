'use client'

import { useId } from 'react'
import { BUILT_IN, type LoaderArt } from '@/lib/loaderPool'
import { XOXO_BRAND_DURATION } from './xoxoBrandLoaderAssets'

export { XOXO_BRAND_DURATION }
export type { LoaderArt }

/**
 * The XOXO wordmark animation, as tuned and exported from /logo.
 *
 * Pure CSS + inline SVG — no JS on the timeline and nothing to fetch,
 * which matters here more than usual: a loader that has to load is a
 * contradiction. Every animation carries `fill-mode: both`, so the mark
 * plays once and then simply stays on its final frame. That's what makes
 * it usable on a gate as well as a loader — the same component either
 * covers a wait or sits finished behind a form.
 *
 * Transparent by default: it paints the mark and nothing else, so it
 * sits on whatever is behind it.
 *
 * The stylesheet is injected per-instance rather than living in
 * globals.css because it is ~200KB of generated keyframes that only a
 * few routes ever need. Selectors are namespaced to `.xoxo-brand` and
 * keyframes to `xb-` when the loader is imported, so it cannot reach
 * anything else on the page.
 */
export default function XoxoBrandLoader({
  className = '',
  /**
   * Which animation to play. Defaults to the one compiled into the
   * bundle; the site passes whichever the loader pool picked.
   */
  art = BUILT_IN,
  /**
   * Colour the arc knockout paints in.
   *
   * The exported artwork can have arcs that cross the letterforms, and
   * it separates them by painting a wider stroke of the background
   * colour underneath — which only works if you can name that colour. On
   * a transparent loader you can't, so this defaults to `transparent`:
   * the arcs then simply meet the letters instead of cutting through
   * them. Set it to a solid colour when the loader sits on one.
   */
  knockout = 'transparent',
}: {
  className?: string
  art?: LoaderArt
  knockout?: string
}) {
  // One <style> per mount would duplicate ~200KB if two instances ever
  // rendered together. They don't today, but the id keeps it honest if
  // that changes — React dedupes identical keys, not identical content.
  const id = useId()

  return (
    <div
      className={`xoxo-brand ${className}`}
      style={{ ['--bg' as string]: knockout }}
      role="img"
      aria-label="XOXO"
    >
      <style data-xoxo-brand={id} dangerouslySetInnerHTML={{ __html: art.css }} />
      <div className="xoxo-brand-art" dangerouslySetInnerHTML={{ __html: art.svg }} />
    </div>
  )
}
