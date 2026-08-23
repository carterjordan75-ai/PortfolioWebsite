import { NextRequest, NextResponse } from 'next/server'
import { projects as codeProjects } from '@/data/projects'
import { readVersionedJson, writeVersionedJson } from '@/lib/blobStore'
import { assignBrands, resolveProject } from '@/lib/projectUrl'
import seedAdminProjects from '../../../../public/assets/_data/admin-projects.json'

// Opt out of Next.js's default route-handler caching. Without this, the GET
// response was being cached on Vercel's edge, and admin edits to a project
// title weren't visible on /work/[slug] until the cache expired. The data
// lives in Blob and changes on every admin write, so the route must always
// rerun.
export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_CACHE = { headers: { 'Cache-Control': 'no-store, max-age=0' } }

/**
 * Project admin data — slug-keyed overrides + additions + tombstones.
 *
 *   { "slug":           { ...field overrides },
 *     "__added__slug":  { ...new project },
 *     "slug":           { "__deleted": true } }
 *
 * Migrated from disk (public/assets/_data/admin-projects.json) to Vercel Blob
 * at state/admin-projects.json. The committed JSON is statically imported
 * above and acts as the first-read fallback until the first POST lands in Blob.
 */

const BLOB_KEY = 'state/admin-projects.json'

type AdminData = Record<string, Record<string, unknown>>

async function getAdminData(): Promise<AdminData> {
  const data = await readVersionedJson<AdminData | Record<string, unknown>[]>(
    BLOB_KEY,
    seedAdminProjects as AdminData | Record<string, unknown>[],
  )

  // Migrate legacy array format on the fly
  if (Array.isArray(data)) {
    const obj: AdminData = {}
    for (const p of data) {
      const slug = (p as Record<string, unknown>).slug as string | undefined
      if (slug) obj[slug] = p as Record<string, unknown>
    }
    return foldStrays(obj)
  }
  return foldStrays(data as AdminData)
}

/**
 * The stored slug a write is meant for.
 *
 * A project answers to two names — the slug it is filed under and the
 * brand address it is advertised at (/on-running for on-running-campaign)
 * — and a caller holding the address must not be able to file a record
 * under it: that is a second, nameless project, not an edit. Addresses
 * (numbered ones included) resolve to the project they belong to; a name
 * nothing answers to is taken as a new slug, as before.
 */
function storedSlugFor(adminData: AdminData, name: string): string {
  if (!name) return name
  if (adminData[name] && !isStray(adminData[name])) return name
  if (codeProjects.some(p => p.slug === name)) return name
  const owner = resolveProject(getMergedProjects(adminData) as Array<{ slug?: string; client?: string }>, name)
  return owner?.slug || name
}

/**
 * A record that is only a slug and some media, with no name of its own —
 * the shape the project page's media drawer wrote when it saved under
 * the brand address instead of the stored slug.
 */
function isStray(rec: Record<string, unknown> | undefined): boolean {
  if (!rec || rec.__deleted) return false
  if (rec.client || rec.title) return false
  return Array.isArray(rec.media)
}

/**
 * Fold strays back into the projects they were meant for.
 *
 * Media saved under an address (see storedSlugFor) landed in nameless
 * records keyed by that address — and a nameless record keyed by a brand
 * then CLAIMS the brand, so the real project is renumbered to /<brand>-2
 * and the next save strands a second copy there. The address of a stray
 * — with any such number stripped — names its owner among the real
 * projects; its media joins the owner's, each file once, and the stray
 * goes. Runs on every read, so the site is right at once; the next write
 * of any kind persists it.
 */
function foldStrays(adminData: AdminData): AdminData {
  const strays = Object.keys(adminData).filter(k => isStray(adminData[k]))
  if (strays.length === 0) return adminData
  const real = getMergedProjects(
    Object.fromEntries(Object.entries(adminData).filter(([k]) => !strays.includes(k))),
  ) as Array<{ slug: string; client?: string }>
  const brands = assignBrands(real)
  const ownerOf = (key: string) => {
    const byBrand = (b: string) => real.find(p => brands.get(p.slug) === b)
    const direct = byBrand(key)
    if (direct) return direct
    const m = /^(.*)-(\d+)$/.exec(key)
    return m ? byBrand(m[1]) : undefined
  }
  for (const key of strays) {
    const owner = ownerOf(key)
    if (!owner || owner.slug === key) continue
    const rec = adminData[owner.slug] || {}
    const have = Array.isArray(rec.media) ? (rec.media as Array<Record<string, unknown>>) : []
    const seen = new Set(have.map(m => String(m.path || '')))
    const extra = (adminData[key].media as Array<Record<string, unknown>>).filter(m => {
      const path = String(m.path || '')
      if (!path || seen.has(path)) return false
      seen.add(path)
      return true
    })
    adminData[owner.slug] = { ...rec, slug: owner.slug, media: [...have, ...extra] }
    delete adminData[key]
  }
  return adminData
}

function getMergedProjects(adminData: AdminData) {
  const result: Record<string, unknown>[] = []

  for (const p of codeProjects) {
    const override = adminData[p.slug]
    if (override && (override as Record<string, unknown>).__deleted) continue
    if (override) {
      const cleaned: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(override)) {
        if (v === '' || (Array.isArray(v) && v.length === 0)) continue
        cleaned[k] = v
      }
      result.push({ ...p, ...cleaned, slug: p.slug, _source: 'code' })
    } else {
      result.push({ ...p, _source: 'code' })
    }
  }

  // Admin-only projects (slugs not in code)
  const codeSlugs = new Set(codeProjects.map(p => p.slug))
  for (const [slug, data] of Object.entries(adminData)) {
    if (codeSlugs.has(slug)) continue
    if ((data as Record<string, unknown>).__deleted) continue
    result.push({ ...data, slug, _source: 'admin' })
  }

  // Featured order. Gen (generative) projects always sort to the top of
  // the featured group — they're the most recent/personal work and the
  // user wants them above commercial projects like Nike. Within each
  // group (gen / non-gen) we then respect any `featuredOrder` the admin
  // has set via the reorder panel, defaulting to 999 (end of group) for
  // unordered items.
  const featured = result.filter(p => p.featured)
  const nonFeatured = result.filter(p => !p.featured)
  featured.sort((a, b) => {
    const aGen = a.category === 'gen' ? 0 : 1
    const bGen = b.category === 'gen' ? 0 : 1
    if (aGen !== bGen) return aGen - bGen
    const orderA = typeof a.featuredOrder === 'number' ? a.featuredOrder : 999
    const orderB = typeof b.featuredOrder === 'number' ? b.featuredOrder : 999
    return orderA - orderB
  })

  return [...featured, ...nonFeatured]
}

export async function GET() {
  const adminData = await getAdminData()
  const projects = getMergedProjects(adminData)
  return NextResponse.json({ projects }, NO_CACHE)
}

export async function POST(request: NextRequest) {
  try {
    const adminData = await getAdminData()
    const body = await request.json()
    const { action, project, slug } = body

    if (action === 'add') {
      const newSlug = project.slug || `${(project.client || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`
      adminData[newSlug] = { ...project, slug: newSlug }
      await writeVersionedJson(BLOB_KEY, adminData)
      return NextResponse.json({ success: true, projects: getMergedProjects(adminData) })
    }

    if (action === 'update') {
      const targetSlug = storedSlugFor(adminData, slug || project?.slug)
      if (!targetSlug) return NextResponse.json({ error: 'No slug provided' }, { status: 400 })
      adminData[targetSlug] = { ...(adminData[targetSlug] || {}), ...project, slug: targetSlug }
      await writeVersionedJson(BLOB_KEY, adminData)
      return NextResponse.json({ success: true, projects: getMergedProjects(adminData) })
    }

    if (action === 'reorder-featured') {
      const { slugs } = body
      if (!slugs || !Array.isArray(slugs)) return NextResponse.json({ error: 'slugs array required' }, { status: 400 })
      slugs.forEach((s: string, i: number) => {
        adminData[s] = { ...(adminData[s] || {}), featuredOrder: i }
      })
      await writeVersionedJson(BLOB_KEY, adminData)
      return NextResponse.json({ success: true, projects: getMergedProjects(adminData) })
    }

    if (action === 'delete') {
      const isCodeProject = codeProjects.some(p => p.slug === slug)
      if (isCodeProject) {
        adminData[slug] = { __deleted: true }
      } else {
        delete adminData[slug]
      }
      await writeVersionedJson(BLOB_KEY, adminData)
      return NextResponse.json({ success: true, projects: getMergedProjects(adminData) })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('API projects error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
