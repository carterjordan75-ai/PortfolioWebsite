/**
 * Turns a loader exported from /logo into something the site can render.
 *
 * The export is a standalone page: a flat stylesheet full of names like
 * .b0, .lf and @keyframes k0, plus one inline <svg>. Those names are fine
 * alone and a collision risk inside an app, so every selector is prefixed
 * with the wrapper class and every keyframe is namespaced — both where it
 * is declared and where an animation references it.
 *
 * This is the TypeScript twin of scratchpad/build_brand_loader.py, which
 * does the same job at build time for the loader compiled into the
 * bundle. Two copies is not ideal; the alternative was making the build
 * script import from here, which would have meant a Node build step in a
 * repo that does not otherwise have one.
 */

export const LOADER_CLASS = 'xoxo-brand'
const KF_PREFIX = 'xb-'

export type LoaderArt = {
  css: string
  svg: string
  /** Longest animation end, ms — how long until the mark is complete. */
  duration: number
  /**
   * Built in the tuner's sleep mode: the ambient parts already repeat
   * and the entrance is meant to arrive once and stay.
   *
   * The sleep overlay needs this to tell such a mark from a loader
   * someone reassigned. It has to force looping on the latter or the
   * screensaver freezes on a still frame — and must NOT on the former,
   * or the entrance is dragged into the loop and the mark reassembles
   * itself every few seconds instead of resting.
   */
  loop?: boolean
  /**
   * True when the mark paints in a single greyscale colour.
   *
   * Such a mark is not "white" or "black", it is "the ink" — it should
   * follow whatever it is placed on, so the colour is stripped and the
   * renderer supplies one from the current theme. Anything with an
   * actual colour, or a gradient, keeps what it was given.
   */
  mono: boolean
}

const isGrey = (hex: string) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  return !!m && m[1].toLowerCase() === m[2].toLowerCase() && m[2].toLowerCase() === m[3].toLowerCase()
}

/** Whole viewBox units. The mark is 1000 wide, so this is sub-pixel. */
const toInt = (t: string) => t.replace(/(-?\d+)\.\d+/g, '$1')

/**
 * Rounds PATH DATA and nothing else.
 *
 * Run over the whole stylesheet this also rewrites cubic-bezier control
 * points, overshoot scales, stroke widths and keyframe percentages — the
 * result still animates, but it is no longer the animation that was
 * exported. Learned the hard way.
 */
function roundPaths(css: string, svg: string) {
  return {
    css: css.replace(/d:\s*path\("([^"]*)"\)/g, (_, d) => `d:path("${toInt(d)}")`),
    svg: svg.replace(/\bd="([^"]*)"/g, (_, d) => `d="${toInt(d)}"`),
  }
}

/**
 * Repairs the 3D shading's output dither in artwork that already exists.
 *
 * The tuner emits this correctly now, but every loader exported before
 * that fix is sitting in Blob with the broken version baked into its SVG,
 * and the only other way to correct one would be to open the tuner and
 * export it again. It is a filter chain, so it can be repaired in place.
 *
 * Two things were wrong, both measured against the real artwork:
 *
 *  - baseFrequency 0.8 gives the noise a period of 1.25 user units. The
 *    mark is 1000 wide shown around 340-520px, which puts that under a
 *    device pixel: it averaged to a flat wash and left the contour
 *    banding exactly as it was. 0.35 puts a period across roughly a pixel
 *    and a half, where it can actually straddle a contour.
 *
 *  - feComposite works on PREMULTIPLIED colour, and the turbulence was
 *    carrying its own alpha averaging ~0.5. So the noise arrived at half
 *    strength while the k4 centring offset — a constant — did not get the
 *    same treatment, and the mismatch dragged the whole surface darker.
 *    Measured at 27% of mean luminance.
 *
 * Measured on the stored loader: pixels sitting in a flat plateau fall
 * from 17.5% to 1.5%, and the longest plateau from 13px to 8px.
 *
 * Idempotent by construction — it matches only the shapes the OLD export
 * produced, so running it twice changes nothing the second time, and it
 * leaves artwork exported since the fix untouched.
 */
export function upgradeShading(svg: string): string {
  // Everything below is gated on this one signal rather than each fix
  // testing for itself. The amplitude rewrite is the reason: it multiplies
  // whatever number it finds, so on its own it has no way to tell art it
  // has already tripled from art it has not, and running twice would
  // treble the dither again. The old frequency is the marker for "this is
  // pre-fix artwork", and all three repairs move together with it.
  const OLD_DITHER = /(<feTurbulence\b[^>]*?)baseFrequency="0\.8"([^>]*?result="on"\s*\/>)/
  if (!OLD_DITHER.test(svg)) return svg

  // Scoped to the dither chain by its result names (on / ong / dithered)
  // rather than applied to the sheet at large. There are several other
  // feTurbulence and feColorMatrix primitives in here — the brush edge,
  // the surface bumps, the grain — and a looser match would silently
  // retune those too.
  let out = svg.replace(new RegExp(OLD_DITHER.source, 'g'), '$1baseFrequency="0.35"$2')

  out = out.replace(
    /<feColorMatrix in="on" type="saturate" values="0" result="ong"\s*\/>/g,
    '<feColorMatrix in="on" type="matrix" values="' +
      '.33 .33 .33 0 0 .33 .33 .33 0 0 .33 .33 .33 0 0 0 0 0 0 1" result="ong"/>',
  )

  // Amplitude x3, on both the multiplier and the offset that centres it.
  // Read from the file rather than substituted wholesale, because the
  // numbers encode the tuner's dither slider and a fixed pair would
  // flatten everyone's setting to whatever this one loader happened to use.
  out = out.replace(
    /(<feComposite in="ong" in2="shaded" operator="arithmetic" k1="0" k2=")([\d.]+)("\s+k3="1"\s+k4="-)([\d.]+)(")/g,
    (_m, a, k2, b, k4, c) =>
      a + (parseFloat(k2) * 3).toFixed(4) + b + (parseFloat(k4) * 3).toFixed(4) + c,
  )

  return out
}

/** Split a flat stylesheet into top-level rules, respecting nesting. */
function topLevelRules(css: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  let i = 0
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i++
    if (i >= css.length) break
    const brace = css.indexOf('{', i)
    if (brace < 0) break
    const head = css.slice(i, brace).trim()
    let depth = 1
    let j = brace + 1
    while (j < css.length && depth) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    out.push([head, css.slice(brace + 1, j - 1)])
    i = j
  }
  return out
}

export function importLoaderHtml(html: string): LoaderArt {
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/)
  const svgMatch = html.match(/(<svg class="xl"[\s\S]*?<\/svg>)/)
  if (!styleMatch || !svgMatch) {
    throw new Error(
      'That does not look like a loader exported from the tuner — no <style> block or no <svg class="xl">.',
    )
  }

  const rounded = roundPaths(styleMatch[1], svgMatch[1])
  const rules = topLevelRules(rounded.css)
  const kfNames = new Set(
    rules.filter(([h]) => h.startsWith('@keyframes')).map(([h]) => h.split(/\s+/).pop() as string),
  )

  // Namespace keyframe references inside `animation:` shorthands. The
  // name is the first identifier of each comma-separated part.
  const renameAnimations = (body: string) =>
    body.replace(/\b(animation)\s*:\s*([^;}]+)/g, (_, prop, value: string) =>
      `${prop}:${value
        .split(',')
        .map(part => {
          const p = part.trim()
          return kfNames.has(p.split(' ')[0]) ? KF_PREFIX + p : p
        })
        .join(', ')}`,
    )

  // A loader paints the mark and nothing else. The export is a whole
  // page, so it brings page chrome — a body background above all — and
  // scoping that to `.xoxo-brand body` would only turn it into dead
  // rules rather than removing it. Both go: the chrome selectors are
  // dropped, and any background declaration is stripped from what is
  // left, so no export can smuggle one in.
  const isPageChrome = (sel: string) => /^\s*(html|body|:root)\b/.test(sel)
  const dropBackground = (body: string) =>
    body.replace(/(^|;)\s*background(-color)?\s*:[^;]*/gi, '$1').replace(/^;+/, '')

  let css = rules
    .filter(([head]) => head.startsWith('@') || !isPageChrome(head))
    .map(([head, body]) => {
      if (head.startsWith('@keyframes')) {
        return `@keyframes ${KF_PREFIX}${head.split(/\s+/).pop()}{${body}}`
      }
      if (head.startsWith('@')) return `${head}{${renameAnimations(body)}}`
      const sels = head
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .filter(s => !isPageChrome(s))
        .map(s => (s.startsWith(`.${LOADER_CLASS}`) ? s : `.${LOADER_CLASS} ${s}`))
        .join(',')
      if (!sels) return ''
      return `${sels}{${dropBackground(renameAnimations(body))}}`
    })
    .join('')

  css = css.replace(/\s+/g, ' ').replace(/\s*([{};:,>])\s*/g, '$1').replace(/};}/g, '}}')

  css =
    `.${LOADER_CLASS}{display:flex;align-items:center;justify-content:center;width:100%;height:100%}` +
    `.${LOADER_CLASS} .${LOADER_CLASS}-art{display:flex;align-items:center;justify-content:center;width:100%}` +
    `.${LOADER_CLASS} .xl{display:block;width:100%;height:auto;overflow:visible}` +
    `@media (prefers-reduced-motion:reduce){.${LOADER_CLASS} *{animation-duration:1ms!important;` +
    `animation-delay:0ms!important;animation-iteration-count:1!important}}` +
    css

  // Whether the mark carries a colour of its own. A gradient always
  // does; a solid one only if it is not greyscale. Newer exports already
  // omit the colour when they are mono, so an absent one counts as mono.
  const inkMatch = rounded.svg.match(/style="[^"]*color:\s*(#[0-9a-fA-F]{3,8})/)
  const gradient = /<(linear|radial)Gradient/i.test(rounded.svg) || /url\(#inkg\)/.test(css)
  const mono = !gradient && (!inkMatch || isGrey(inkMatch[1]))

  // Strip anything the export baked in that the renderer should decide:
  // the knockout colour always, and the ink too when it is mono. Inline
  // style beats anything a component sets, so leaving them would make
  // the props below silently do nothing.
  let svg = rounded.svg.replace(/(style="[^"]*?);?--bg:[^;"]*/, '$1')
  if (mono) svg = svg.replace(/(style="[^"]*?);?color:[^;"]*/, '$1')
  svg = svg.replace(/ style="\s*"/, '').replace(/>\s+</g, '><').trim()
  // Stored already repaired, so the read path finds nothing left to do.
  svg = upgradeShading(svg)

  return { css, svg, duration: longestEnd(css), mono, loop: /--xoxo-sleep/.test(css) }
}

/**
 * Longest animation end across the sheet. Within one rule animation[k]
 * pairs with animation-delay[k], so they have to be matched up per rule
 * rather than maxed independently — otherwise the slowest animation gets
 * paired with an unrelated element's longest delay.
 */
function longestEnd(css: string): number {
  let total = 0
  const rule = /\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = rule.exec(css)) !== null) {
    const body = m[1]
    const anim = body.match(/animation:([^;}]+)/)
    if (!anim) continue
    const durs = anim[1]
      .split(',')
      .map((p: string) => Number(p.match(/(\d+)ms/)?.[1] ?? 0))
    const dm = body.match(/animation-delay:([^;}]+)/)
    const dels = dm
      ? dm[1].split(',').map((p: string) => Number(p.match(/(-?\d+)ms/)?.[1] ?? 0))
      : []
    durs.forEach((d: number, k: number) => {
      total = Math.max(total, d + (dels[k] ?? dels[0] ?? 0))
    })
  }
  return total
}
