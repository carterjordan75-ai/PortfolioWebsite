import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { projects as codeProjects } from '@/data/projects'

const PROJECTS_PATH = path.join(process.cwd(), 'public', 'assets', '_data', 'admin-projects.json')

async function ensureFile() {
  try {
    await readFile(PROJECTS_PATH, 'utf-8')
  } catch {
    await mkdir(path.dirname(PROJECTS_PATH), { recursive: true })
    await writeFile(PROJECTS_PATH, '{}')
  }
}

// Admin JSON stores overrides/additions keyed by slug:
// { "slug": { ...fields }, "__added__slug": { ...newProject } }
// Deleted slugs: { "slug": { "__deleted": true } }

async function getAdminData(): Promise<Record<string, Record<string, unknown>>> {
  await ensureFile()
  const raw = await readFile(PROJECTS_PATH, 'utf-8')
  try {
    const parsed = JSON.parse(raw)
    // Migrate from old array format
    if (Array.isArray(parsed)) {
      const obj: Record<string, Record<string, unknown>> = {}
      for (const p of parsed) obj[p.slug] = p
      await writeFile(PROJECTS_PATH, JSON.stringify(obj, null, 2))
      return obj
    }
    return parsed
  } catch {
    return {}
  }
}

function getMergedProjects(adminData: Record<string, Record<string, unknown>>) {
  // Start with code projects, apply overrides/deletions
  const result: Record<string, unknown>[] = []

  for (const p of codeProjects) {
    const override = adminData[p.slug]
    if (override && (override as Record<string, unknown>).__deleted) continue // deleted
    if (override) {
      // Filter out empty strings/arrays so they don't overwrite code project data
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

  // Add admin-only projects (slugs not in code)
  const codeSlugs = new Set(codeProjects.map(p => p.slug))
  for (const [slug, data] of Object.entries(adminData)) {
    if (codeSlugs.has(slug)) continue
    if ((data as Record<string, unknown>).__deleted) continue
    result.push({ ...data, slug, _source: 'admin' })
  }

  // Sort featured projects by featuredOrder if set
  const featured = result.filter(p => p.featured)
  const nonFeatured = result.filter(p => !p.featured)
  featured.sort((a, b) => {
    const orderA = typeof a.featuredOrder === 'number' ? a.featuredOrder : 999
    const orderB = typeof b.featuredOrder === 'number' ? b.featuredOrder : 999
    return orderA - orderB
  })

  return [...featured, ...nonFeatured]
}

export async function GET() {
  const adminData = await getAdminData()
  const projects = getMergedProjects(adminData)
  return NextResponse.json({ projects })
}

export async function POST(request: NextRequest) {
  const adminData = await getAdminData()
  const body = await request.json()
  const { action, project, slug } = body

  try {
    if (action === 'add') {
      const newSlug = project.slug || `${(project.client || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`
      adminData[newSlug] = { ...project, slug: newSlug }
      await mkdir(path.dirname(PROJECTS_PATH), { recursive: true })
      await writeFile(PROJECTS_PATH, JSON.stringify(adminData, null, 2))
      return NextResponse.json({ success: true, projects: getMergedProjects(adminData) })
    }

    if (action === 'update') {
      const targetSlug = slug || project?.slug
      if (!targetSlug) return NextResponse.json({ error: 'No slug provided' }, { status: 400 })
      adminData[targetSlug] = { ...(adminData[targetSlug] || {}), ...project, slug: targetSlug }
      await mkdir(path.dirname(PROJECTS_PATH), { recursive: true })
      await writeFile(PROJECTS_PATH, JSON.stringify(adminData, null, 2))
      return NextResponse.json({ success: true, projects: getMergedProjects(adminData) })
    }

    if (action === 'reorder-featured') {
      const { slugs } = body
      if (!slugs || !Array.isArray(slugs)) return NextResponse.json({ error: 'slugs array required' }, { status: 400 })
      // Store the featured order — each slug gets a featuredOrder number
      slugs.forEach((s: string, i: number) => {
        adminData[s] = { ...(adminData[s] || {}), featuredOrder: i }
      })
      await mkdir(path.dirname(PROJECTS_PATH), { recursive: true })
      await writeFile(PROJECTS_PATH, JSON.stringify(adminData, null, 2))
      return NextResponse.json({ success: true, projects: getMergedProjects(adminData) })
    }

    if (action === 'delete') {
      const isCodeProject = codeProjects.some(p => p.slug === slug)
      if (isCodeProject) {
        adminData[slug] = { __deleted: true }
      } else {
        delete adminData[slug]
      }
      await mkdir(path.dirname(PROJECTS_PATH), { recursive: true })
      await writeFile(PROJECTS_PATH, JSON.stringify(adminData, null, 2))
      return NextResponse.json({ success: true, projects: getMergedProjects(adminData) })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('API projects error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
