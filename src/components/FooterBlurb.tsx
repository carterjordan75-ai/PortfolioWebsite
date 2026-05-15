'use client'

import { useState, useEffect } from 'react'

const DEFAULT_BLURB = 'A multidisciplinary creative practice spanning motion design, 3D environments, generative art, and illustration. Every project merges craft with experimentation.'

export default function FooterBlurb({ pageId, className = '', style = {} }: { pageId?: string; className?: string; style?: React.CSSProperties }) {
  const [blurb, setBlurb] = useState(DEFAULT_BLURB)

  useEffect(() => {
    fetch('/api/pages')
      .then(r => r.json())
      .then(data => {
        const pages = data.pages || {}
        // Check page-specific footer blurb first, then fall back to global
        const pageSpecific = pageId ? pages[pageId]?.footerBlurb : null
        const global = pages['info-popup']?.footerBlurb
        if (pageSpecific) setBlurb(pageSpecific)
        else if (global) setBlurb(global)
      })
      .catch(() => {})
  }, [pageId])

  return (
    <p className={className} style={style}>
      {blurb}
    </p>
  )
}
