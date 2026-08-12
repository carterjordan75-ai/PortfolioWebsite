'use client'

import { useId } from 'react'
import {
  XOXO_BRAND_CSS,
  XOXO_BRAND_SVG,
  XOXO_BRAND_DURATION,
} from './xoxoBrandLoaderAssets'

export { XOXO_BRAND_DURATION }

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
 * The stylesheet is injected per-instance rather than living in
 * globals.css because it is ~200KB of generated keyframes that only two
 * or three routes ever need. Selectors are namespaced to `.xoxo-brand`
 * and keyframes to `xb-` at build time (see the assets module), so it
 * cannot reach anything else on the page.
 */
export default function XoxoBrandLoader({
  className = '',
  /** Background behind the mark. Null leaves it transparent. */
  background = null,
}: {
  className?: string
  background?: string | null
}) {
  // One <style> per mount would duplicate 200KB if two instances ever
  // rendered together. They don't today, but the id keeps it honest if
  // that changes — React dedupes identical keys, not identical content.
  const id = useId()

  return (
    <div
      className={`xoxo-brand ${className}`}
      style={background ? { background } : undefined}
      role="img"
      aria-label="XOXO"
    >
      <style
        data-xoxo-brand={id}
        dangerouslySetInnerHTML={{ __html: XOXO_BRAND_CSS }}
      />
      <div
        className="xoxo-brand-art"
        dangerouslySetInnerHTML={{ __html: XOXO_BRAND_SVG }}
      />
    </div>
  )
}
