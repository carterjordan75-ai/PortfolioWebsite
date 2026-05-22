'use client'

import { useEffect } from 'react'

/**
 * Site-wide guard that disables right-click "Save image/video as…" and
 * drag-to-desktop on every <video> and <img>. The watermarked Download
 * button on project pages is the only intended way to pull media off
 * the site.
 *
 * This won't stop a determined user with DevTools — they can always
 * read the asset URL out of the DOM — but it blocks the casual save
 * flow that 99% of visitors would attempt. Belt-and-braces alongside
 * the `video, img { -webkit-touch-callout: none }` rule in globals.css
 * (which kills iOS long-press save) and `controlsList="nodownload"` on
 * the lightbox video.
 */
export default function MediaProtect() {
  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) return
      const tag = t.tagName
      if (tag === 'VIDEO' || tag === 'IMG') e.preventDefault()
    }
    const onDragStart = (e: DragEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) return
      if (t.tagName === 'IMG') e.preventDefault()
    }
    document.addEventListener('contextmenu', onContext)
    document.addEventListener('dragstart', onDragStart)
    return () => {
      document.removeEventListener('contextmenu', onContext)
      document.removeEventListener('dragstart', onDragStart)
    }
  }, [])
  return null
}
