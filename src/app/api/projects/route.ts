import { NextRequest, NextResponse } from 'next/server'
import { projects as codeProjects } from '@/data/projects'
import { readJsonBlob, writeJsonBlob } from '@/lib/blobStore'
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
  const data = await readJsonBlob<AdminData | Record<string, unknown>[]>(
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
    return obj
  }
  return data as AdminData
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
      await writeJsonBlob(BLOB_KEY, adminData)
      return NextResponse.json({ success: true, projects: getMergedProjects(adminData) })
    }

    if (action === 'update') {
      const targetSlug = slug || project?.slug
      if (!targetSlug) return NextResponse.json({ error: 'No slug provided' }, { status: 400 })
      adminData[targetSlug] = { ...(adminData[targetSlug] || {}), ...project, slug: targetSlug }
      await writeJsonBlob(BLOB_KEY, adminData)
      return NextResponse.json({ success: true, projects: getMergedProjects(adminData) })
    }

    if (action === 'reorder-featured') {
      const { slugs } = body
      if (!slugs || !Array.isArray(slugs)) return NextResponse.json({ error: 'slugs array required' }, { status: 400 })
      slugs.forEach((s: string, i: number) => {
        adminData[s] = { ...(adminData[s] || {}), featuredOrder: i }
      })
      await writeJsonBlob(BLOB_KEY, adminData)
      return NextResponse.json({ success: true, projects: getMergedProjects(adminData) })
    }

    if (action === 'delete') {
      const isCodeProject = codeProjects.some(p => p.slug === slug)
      if (isCodeProject) {
        adminData[slug] = { __deleted: true }
      } else {
        delete adminData[slug]
      }
      await writeJsonBlob(BLOB_KEY, adminData)
      return NextResponse.json({ success: true, projects: getMergedProjects(adminData) })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('API projects error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
