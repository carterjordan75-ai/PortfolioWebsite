'use client'

import { memo, useId } from 'react'
import { useDarkMode } from '@/contexts/DarkModeContext'
import { BUILT_IN, type LoaderArt } from '@/lib/loaderPool'
import { XOXO_BRAND_DURATION } from './xoxoBrandLoaderAssets'
import { solidO } from '@/lib/solidO'

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

/**
 * The exported file, played as its own document.
 *
 * The alternative — the Art path above — renders a REWRITE of the file:
 * rescoped, renamed, minified, re-rounded. Every visual bug this loader
 * has had was that rewrite disagreeing with the artwork it came from,
 * and the last one made the pupils nine times rougher than the file they
 * were exported from. An iframe removes the reason the rewrite existed:
 * the only thing it was ever solving is that a stylesheet full of `.b0`
 * and `@keyframes k0` cannot safely share a document with the site. Give
 * it its own document and it can.
 *
 * The theme still has to reach it, and that is the one thing the file
 * cannot know. It arrives as a stylesheet APPENDED after the export's
 * own — additive, never a rewrite, so the artwork keeps every rule it
 * shipped with and this only decides the things a standalone page had no
 * way to be told. That is the whole contract, and it is small enough to
 * hold in your head, which the rewrite never was.
 */
/**
 * The export's frame — its viewBox — is the crop the piece was framed
 * with in the tuner (dragged and zoomed there, saved with it). The
 * iframe takes that shape, so the frame shows whole: at a fixed 4:3 a
 * tall frame, which a sleep mark with arms reaching up and down always
 * is, was cut off top and bottom at the document's edge.
 */
function frameRatio(html: string): string {
  const m = /viewBox="\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*"/.exec(html)
  if (!m) return '1 / 0.75'
  const w = parseFloat(m[3]), h = parseFloat(m[4])
  if (!(w > 0) || !(h > 0)) return '1 / 0.75'
  return `${w} / ${h}`
}

const Framed = memo(function Framed({
  html, ink, knockout, title,
}: { html: string; ink?: string; knockout: string; title: string }) {
  const doc =
    html +
    '<style>' +
    // The export centres itself in a viewport it assumed it owned. It
    // does own this one — but the page behind must show through, and a
    // declared color-scheme makes the browser paint its own canvas.
    'html,body{background:transparent!important;height:100%;margin:0}' +
    ':root{color-scheme:normal}' +
    // Arcs and accents throw well outside the wordmark's box; a document
    // this size would clip them at the edge.
    'body{overflow:visible!important}' +
    // The export sizes itself against a viewport it picked — min(70vw,520px)
    // — but this frame is not that viewport, it is whatever box the caller
    // gave the loader. So the mark fills the frame and the FRAME carries
    // the proportion instead, below. Callers keep asking for a width and
    // getting a mark that wide, which is what they meant.
    // Both ways, so the frame is letterboxed whole inside whatever box
    // the iframe ends up with — never cut at the document's edge.
    '.xl{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important}' +
    (ink ? 'body,.xl{color:' + ink + '!important}' : '') +
    '.xl{--bg:' + knockout + '}' +
    '</style>'

  return (
    <iframe
      // No scripts: the artwork is CSS and SVG, so nothing needs to run,
      // and a loader is not a place to widen what an uploaded file may
      // do. An empty sandbox also gives it an opaque origin, so it
      // cannot reach back into the page that framed it.
      sandbox=""
      srcDoc={doc}
      title={title}
      aria-hidden
      style={{
        display: 'block', width: '100%', border: 0, background: 'transparent',
        // The frame is the export's own: whatever crop the piece was
        // framed with in the tuner, shown whole. (A document clips at its
        // own edge, so the box must be the frame's shape, not a guess.)
        aspectRatio: frameRatio(html),
        // A frame taller than the window is shown whole, smaller, rather
        // than running off the top and bottom of it.
        maxHeight: '100vh',
        // It is decoration over a page, and an iframe would otherwise
        // swallow the movement that dismisses the sleep overlay.
        pointerEvents: 'none',
      }}
    />
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

  // A mark can be pinned to a look regardless of the site's theme — for
  // artwork built for one ground that would read wrong on the other. The
  // explicit `ink` prop still wins, since a surface that knows what it is
  // (the gate, a preview swatch) is more specific than either.
  const pinned = art.modes === 'light' ? false : art.modes === 'dark' ? true : dark
  // Mono by its flag, or by its own file: a mono export carries a rule
  // that follows the viewer's OS theme, and a mark that does that has to
  // be told its ink here — left alone it paints itself by the visitor's
  // OS rather than by the ground it is on. (Sleep marks with arms were
  // filed as coloured by the importer and went black on light-mode
  // laptops; reading the file makes the flag irrelevant.)
  const mono = art.mono || (!!art.html && /prefers-color-scheme/.test(art.html))
  const colour = ink ?? (mono ? (pinned ? '#ffffff' : '#111111') : undefined)

  return (
    <div
      className={`xoxo-brand ${className}`}
      style={{
        ...(colour ? { color: colour } : null),
        ['--bg' as string]: knockout,
        // The framed path injects no stylesheet into THIS document, so
        // the wrapper rules that used to come with the artwork are not
        // here. Without a width the frame collapses.
        ...(art.html ? { display: 'block', width: '100%' } : null),
      }}
      role="img"
      aria-label="XOXO"
    >
      {/*
        Play the file itself whenever we still have it. The css/svg pair
        is the old rewrite path, kept only for artwork saved before the
        file was stored — re-upload one of those and it moves over.
      */}
      {art.html
        ? <Framed html={solidO(art.html)} ink={colour} knockout={knockout} title="XOXO" />
        : <Art id={id} css={art.css} svg={solidO(art.svg)} />}
    </div>
  )
}
