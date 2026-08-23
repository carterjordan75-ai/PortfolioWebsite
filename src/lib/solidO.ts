/**
 * The O is a solid disc now. Artwork exported from the tuner before that
 * — every loader and sleep mark stored through the admin panel — still
 * carries the old counter as a second subpath on each O, so whatever
 * plays a stored export runs it through this first. The counter is the
 * only two-subpath letter there is: the X is one subpath, the marks and
 * arms are separate elements, and the eye is its own path. So any `d`
 * with a second `M` after a closed first subpath is an O with a hole,
 * and keeping the first subpath is keeping the disc.
 *
 * Stored, not re-exported, because the exports are the user's uploads
 * and the production store is not something a build should rewrite.
 */
export function solidO(markup: string): string {
  if (!markup) return markup
  return markup.replace(/\bd=(["'])([^"']*?[Zz])\s*M[^"']*\1/g, (_m, q, first) => `d=${q}${first}${q}`)
}
