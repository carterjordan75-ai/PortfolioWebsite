/**
 * Public project URLs: xoxo.studio/nike rather than
 * xoxo.studio/work/nike-air-max-campaign.
 *
 * The address is derived from the client name; the project's stored
 * `slug` is left alone. That is deliberate. The slug is a key — it names
 * folders in Blob, it is what admin records are filed under, and it is
 * in every link anyone has ever shared. Renaming it to tidy the address
 * bar would mean rewriting live data to change a string that is only
 * ever read by a router.
 *
 * So a project answers to two names: the slug it is stored as, and the
 * brand it is known by. Both resolve; only the brand is advertised.
 */

/** Route segments that already mean something. A project cannot take one. */
export const RESERVED = new Set([
  'work', 'indexx', 'misc', 'look', 'gate', 'logo', 'character', 'loaders',
  'dailies', 'mobile-lock', 'api', '_next', 'assets', 'placeholder', 'favicon',
])

const slugify = (s: string): string =>
  s.toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export type UrlProject = { slug?: string; client?: string; title?: string }

/**
 * The address a project is advertised at.
 *
 * Falls back to the stored slug when there is no client to name it after,
 * or when the client's name would collide with a real route — better an
 * ugly address than one that resolves to somebody else's page.
 */
export function brandSlug(p: UrlProject): string {
  const stored = (p.slug || '').trim()
  const from = slugify(p.client || '')
  if (!from || RESERVED.has(from)) return stored
  return from
}

/** Where a link to this project should point. */
export function projectHref(p: UrlProject): string {
  return '/' + brandSlug(p)
}

/**
 * Does this project answer to `seg`?
 *
 * Both names are accepted, so every link that has ever been shared keeps
 * working — the old /work/<slug> form redirects here rather than dying,
 * and a slug typed straight into the bar still lands.
 */
export function matchesSegment(p: UrlProject, seg: string): boolean {
  if (!seg) return false
  const s = seg.toLowerCase()
  return (p.slug || '').toLowerCase() === s || brandSlug(p).toLowerCase() === s
}

/**
 * Brands claimed by more than one project, or shadowed by a real route.
 *
 * Two projects for the same client would otherwise silently share an
 * address and one of them would become unreachable. Surfaced rather than
 * resolved, because which one should win is a decision, not a default.
 */
export function urlConflicts(projects: UrlProject[]): {
  duplicates: Array<{ brand: string; slugs: string[] }>
  reserved: Array<{ slug: string; wanted: string }>
} {
  const byBrand = new Map<string, string[]>()
  const reserved: Array<{ slug: string; wanted: string }> = []
  for (const p of projects) {
    const wanted = slugify(p.client || '')
    if (wanted && RESERVED.has(wanted)) reserved.push({ slug: p.slug || '', wanted })
    const b = brandSlug(p)
    byBrand.set(b, [...(byBrand.get(b) || []), p.slug || ''])
  }
  const duplicates: Array<{ brand: string; slugs: string[] }> = []
  byBrand.forEach((slugs, brand) => { if (slugs.length > 1) duplicates.push({ brand, slugs }) })
  return { duplicates, reserved }
}
