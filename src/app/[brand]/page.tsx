'use client'

import ProjectPage from '../work/[slug]/page'

/**
 * A project at its brand address: xoxo.studio/nike.
 *
 * This renders the same page as /work/<slug> rather than a copy of it —
 * one implementation, two entrances. The project view resolves either
 * name, so the segment can be a brand or a stored slug and both land.
 *
 * Being the only dynamic route at the root, this also catches anything
 * that matches no static route. Static routes are matched first, so
 * /misc and /look are unaffected; anything genuinely unknown falls
 * through to the same notFound() a bad slug has always produced.
 */
export default function BrandProjectPage({ params }: { params: { brand: string } }) {
  return <ProjectPage params={{ slug: params.brand }} />
}
