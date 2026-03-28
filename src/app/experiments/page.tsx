'use client'

import { useState } from 'react'
import PageTransition from '@/components/PageTransition'
import { useDarkMode } from '@/contexts/DarkModeContext'

const leftMedia = [
  { src: '/assets/TestMedia/video_01.mp4', type: 'video' as const, title: 'Particle Drift Study', year: 2024 },
  { src: '/assets/TestMedia/Image_01.avif', type: 'image' as const, title: 'Texture Exploration 01', year: 2023 },
  { src: '/assets/TestMedia/video_02.mp4', type: 'video' as const, title: 'Fluid Morph Test', year: 2024 },
  { src: '/assets/TestMedia/Image_02.avif', type: 'image' as const, title: 'Gradient Fields', year: 2023 },
  { src: '/assets/TestMedia/video_03.mp4', type: 'video' as const, title: 'Recursive Form Generator', year: 2025 },
  { src: '/assets/TestMedia/Image_03.avif', type: 'image' as const, title: 'Noise Pattern Series', year: 2022 },
]

const rightMedia = [
  { src: '/assets/TestMedia/Image_03.avif', type: 'image' as const, title: 'Light Leak Capture', year: 2023 },
  { src: '/assets/TestMedia/video_03.mp4', type: 'video' as const, title: 'Displacement Map Anim', year: 2024 },
  { src: '/assets/TestMedia/Image_01.avif', type: 'image' as const, title: 'Halftone Deconstruct', year: 2022 },
  { src: '/assets/TestMedia/video_01.mp4', type: 'video' as const, title: 'Procedural Growth', year: 2025 },
  { src: '/assets/TestMedia/Image_02.avif', type: 'image' as const, title: 'Colour Field Study', year: 2024 },
  { src: '/assets/TestMedia/video_02.mp4', type: 'video' as const, title: 'Kinetic Typography', year: 2023 },
]

function MediaPanel({
  media,
  side,
  dark,
  fg,
  expanded,
  otherExpanded,
  onToggleExpand,
}: {
  media: typeof leftMedia
  side: 'left' | 'right'
  dark: boolean
  fg: string
  expanded: boolean
  otherExpanded: boolean
  onToggleExpand: () => void
}) {
  const [index, setIndex] = useState(0)
  const current = media[index]

  const next = () => setIndex((i) => (i + 1) % media.length)
  const prev = () => setIndex((i) => (i - 1 + media.length) % media.length)

  return (
    <div
      className="relative h-full overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
      style={{
        width: expanded ? '100%' : otherExpanded ? '0%' : '50%',
        opacity: otherExpanded ? 0 : 1,
        borderRight: side === 'left' && !expanded ? `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` : 'none',
      }}
    >
      {/* Media — full bleed */}
      {current.type === 'video' ? (
        <video
          key={current.src + index}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          src={current.src}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={current.src + index}
          src={current.src}
          alt={current.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Dark overlay for text legibility */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.5) 100%)' }} />

      {/* Top — year + title */}
      <div className="absolute top-4 left-5 right-5 flex items-baseline justify-between z-10">
        <span className="text-[10px] font-mono text-white tracking-[0.1em]" style={{ opacity: 0.6 }}>
          [{current.year}]
        </span>
        <span className="text-[10px] font-bold text-white uppercase tracking-[0.08em]" style={{ opacity: 0.7 }}>
          {current.title}
        </span>
      </div>

      {/* Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <span className="text-[8px] font-mono text-white tracking-[0.15em]" style={{ opacity: 0.3 }}>
          {String(index + 1).padStart(2, '0')} / {String(media.length).padStart(2, '0')}
        </span>
      </div>

      {/* Bottom left — prev arrow */}
      <button
        onClick={prev}
        className="absolute bottom-4 left-4 z-10 w-10 h-10 rounded-full flex items-center justify-center text-white text-[14px] transition-all hover:scale-110 active:scale-95"
        style={{
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.15)',
        }}
      >
        ←
      </button>

      {/* Bottom center — fullscreen pill */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
        <button
          onClick={onToggleExpand}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[8px] font-bold uppercase tracking-[0.12em] text-white transition-all hover:scale-105 active:scale-95"
          style={{
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {/* Bottom right — next arrow */}
      <button
        onClick={next}
        className="absolute bottom-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center text-white text-[14px] transition-all hover:scale-110 active:scale-95"
        style={{
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.15)',
        }}
      >
        →
      </button>
    </div>
  )
}

export default function ExperimentsPage() {
  const { dark, fg } = useDarkMode()
  const [expandedSide, setExpandedSide] = useState<'left' | 'right' | null>(null)

  const toggleLeft = () => setExpandedSide(s => s === 'left' ? null : 'left')
  const toggleRight = () => setExpandedSide(s => s === 'right' ? null : 'right')

  return (
    <PageTransition>
      <div style={{ background: dark ? '#0a0a0a' : '#f5f5f0', color: fg, minHeight: '100vh' }}>
        <div className="flex" style={{ height: '100vh', paddingTop: '68px' }}>
          <MediaPanel
            media={leftMedia}
            side="left"
            dark={dark}
            fg={fg}
            expanded={expandedSide === 'left'}
            otherExpanded={expandedSide === 'right'}
            onToggleExpand={toggleLeft}
          />
          <MediaPanel
            media={rightMedia}
            side="right"
            dark={dark}
            fg={fg}
            expanded={expandedSide === 'right'}
            otherExpanded={expandedSide === 'left'}
            onToggleExpand={toggleRight}
          />
        </div>
      </div>
    </PageTransition>
  )
}
