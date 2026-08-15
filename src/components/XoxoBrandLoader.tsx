'use client'

import { memo, useId } from 'react'
import { useDarkMode } from '@/contexts/DarkModeContext'
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
 * It paints the mark and nothing else. No background, ever: a loader that
 * brought its own would be a coloured screen with a mark on it.
 *
 * A mark exported in a single greyscale colour is treated as "the ink"
 * rather than as white or black, and follows the site's light/dark mode.
 * One with a colour or a gradient keeps exactly what it was given.
 */
/**
 * The stylesheet and the mark itself, held apart from everything that
 * changes around them.
 *
 * Both are injected as raw HTML, and React rewrites raw HTML whenever
 * the string it is handed differs. Rewriting the stylesheet redefines
 * every @keyframes in it, and redefining a keyframes rule restarts every
 * animation using it — from zero, part way through the run, with the
 * elements themselves untouched so nothing looks like it moved.
 *
 * Memoised on the two strings, so a re-render for any other reason —
 * the theme resolving, the parent's loading flag flipping, a parent
 * re-rendering for reasons of its own — cannot reach them. The ink and
 * knockout colours live on the wrapper outside this, where they can
 * change freely without touching the animation.
 */
const Art = memo(function Art({ id, css, svg }: { id: string; css: string; svg: string }) {
  return (
    <>
      <style data-xoxo-brand={id} dangerouslySetInnerHTML={{ __html: css }} />
      <div className="xoxo-brand-art" dangerouslySetInnerHTML={{ __html: svg }} />
    </>
  )
})

export default function XoxoBrandLoader({
  className = '',
  /**
   * Which animation to play. Defaults to the one compiled into the
   * bundle; the site passes whichever the loader pool picked.
   */
  art = BUILT_IN,
  /**
   * Force the ink colour, overriding the light/dark inversion. For
   * surfaces that know what they are — a dark gate, a preview swatch —
   * rather than following the viewer's own theme.
   */
  ink,
  /**
   * Colour the arc knockout paints in.
   *
   * The exported artwork can have arcs that cross the letterforms, and it
   * separates them by painting a wider stroke of the background colour
   * underneath — which only works if you can name that colour. With no
   * background you can't, so this defaults to `transparent`: the arcs
   * then simply meet the letters instead of cutting through them. Set it
   * when the loader sits on a solid ground.
   */
  knockout = 'transparent',
}: {
  className?: string
  art?: LoaderArt
  ink?: string
  knockout?: string
}) {
  // One <style> per mount would duplicate ~200KB if two instances ever
  // rendered together. The id keeps that honest — React dedupes identical
  // keys, not identical content.
  const id = useId()
  const { dark } = useDarkMode()

  // Only a mono mark takes a colour from here; anything else carries its
  // own and must not be overpainted.
  const colour = ink ?? (art.mono ? (dark ? '#ffffff' : '#111111') : undefined)

  return (
    <div
      className={`xoxo-brand ${className}`}
      style={{ ...(colour ? { color: colour } : null), ['--bg' as string]: knockout }}
      role="img"
      aria-label="XOXO"
    >
      <Art id={id} css={art.css} svg={art.svg} />
    </div>
  )
}
