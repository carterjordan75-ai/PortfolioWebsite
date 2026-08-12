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

  return { css, svg, duration: longestEnd(css), mono }
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
