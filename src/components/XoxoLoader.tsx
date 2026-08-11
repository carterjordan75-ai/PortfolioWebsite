'use client'

import { XOXO_GLYPHS, XOXO_VIEWBOX } from '@/lib/xoxoGlyphs'

/**
 * Animated XOXO wordmark, four variants, for loading states.
 *
 * Pure SVG + CSS — no JS on the timeline, no library, nothing to fetch.
 * That matters more than usual here: a loader that has to load is a
 * contradiction. The keyframes live in globals.css under `.xoxo-loader`
 * rather than in styled-jsx, because scoped styles inside an <svg>
 * subtree are a fight not worth having.
 *
 * `drop`, `wipe` and `pop` are one-shots that settle on the resting
 * wordmark — for a short wait, or when the loader hands over to a
 * reveal. `wave` loops seamlessly, for an open-ended one.
 */

export type XoxoLoaderVariant = 'drop' | 'wipe' | 'pop' | 'wave'

/** Run time per variant, ms. `wave` is one cycle of a loop. */
export const XOXO_LOADER_DURATION: Record<XoxoLoaderVariant, number> = {
  drop: 1205,
  wipe: 1090,
  pop: 1085,
  wave: 1540,
}

export const XOXO_LOADER_VARIANTS: readonly XoxoLoaderVariant[] = [
  'drop',
  'wipe',
  'pop',
  'wave',
]

let uid = 0

export default function XoxoLoader({
  variant = 'drop',
  className = '',
  style,
  title = 'Loading',
}: {
  variant?: XoxoLoaderVariant
  className?: string
  style?: React.CSSProperties
  /** Announced to screen readers; the mark itself is decorative. */
  title?: string
}) {
  // Only `wipe` needs a clipPath, and its id must be unique per instance
  // — the preview page mounts all four at once, and a duplicated id would
  // have one loader's curtain driving another's.
  const clipId = `xoxo-wipe-${(uid += 1)}`

  return (
    <svg
      className={`xoxo-loader xoxo-${variant} ${className}`.trim()}
      viewBox={XOXO_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      style={style}
    >
      {variant === 'wipe' && (
        <defs>
          <clipPath id={clipId}>
            {/* Taller than the viewBox on purpose: glyphs stretch past the
                box mid-animation and a tight rect would shear them. */}
            <rect className="xoxo-curtain" x="0" y="-40" width="1000" height="480" />
          </clipPath>
        </defs>
      )}
      <g clipPath={variant === 'wipe' ? `url(#${clipId})` : undefined}>
        {XOXO_GLYPHS.map((d, i) => (
          <g key={i} className={`xoxo-g xoxo-g${i}`}>
            <path d={d} />
          </g>
        ))}
      </g>
    </svg>
  )
}
