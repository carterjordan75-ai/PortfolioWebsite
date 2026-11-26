'use client'

import { useEffect, useRef, useState } from 'react'

export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const arrowsRef = useRef<HTMLDivElement>(null)
  // 'resize' wins over 'hover': anything tagged data-cursor="col-resize"
  // (the project-page split handle) flanks the dot with ◀ ▶ so the
  // resize affordance lives on the cursor itself — the native
  // col-resize arrows can never appear under the global cursor: none.
  const [mode, setMode] = useState<'default' | 'hover' | 'resize'>('default')
  const hovering = mode === 'hover'

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const x = `${e.clientX}px`
      const y = `${e.clientY}px`
      if (dotRef.current) { dotRef.current.style.left = x; dotRef.current.style.top = y }
      if (ringRef.current) { ringRef.current.style.left = x; ringRef.current.style.top = y }
      if (arrowsRef.current) { arrowsRef.current.style.left = x; arrowsRef.current.style.top = y }
    }

    const checkHover = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-cursor="col-resize"]')) {
        setMode('resize')
        return
      }
      const isClickable = target.closest('a, button, [role="button"], input, select, textarea, label[for], [data-card], [data-heart], [data-slider], .cursor-pointer, .animated-border-btn')
      setMode(isClickable ? 'hover' : 'default')
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseover', checkHover)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseover', checkHover)
    }
  }, [])

  return (
    <>
      {/* Outer animated ring — spinning highlight, only on hover */}
      <div
        ref={ringRef}
        className="pointer-events-none fixed z-[99998]"
        style={{
          transform: 'translate(-50%, -50%)',
          width: hovering ? '36px' : '0px',
          height: hovering ? '36px' : '0px',
          borderRadius: '50%',
          opacity: hovering ? 1 : 0,
          transition: 'width 0.15s ease, height 0.15s ease, opacity 0.15s ease',
          background: 'conic-gradient(from var(--border-angle, 0deg), transparent 55%, rgba(204,34,34,0.2) 70%, #cc2222 82%, #ff6666 88%, #ffffff 92%, #ff6666 95%, #cc2222 100%)',
          animation: 'borderSpin 1.2s linear infinite',
          WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
          mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
        }}
      />
      {/* Resize arrows — flank the dot while over a split handle.
          White + difference so they read on any background in either
          theme. */}
      <div
        ref={arrowsRef}
        className="pointer-events-none fixed z-[99999]"
        style={{
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          alignItems: 'center',
          gap: mode === 'resize' ? '30px' : '14px',
          opacity: mode === 'resize' ? 1 : 0,
          transition: 'opacity 0.12s ease, gap 0.15s ease',
          color: '#ffffff',
          mixBlendMode: 'difference',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 900, lineHeight: 1 }}>◀</span>
        <span style={{ fontSize: '12px', fontWeight: 900, lineHeight: 1 }}>▶</span>
      </div>
      {/* Inner dot */}
      <div
        ref={dotRef}
        className="pointer-events-none fixed z-[99999]"
        style={{
          transform: 'translate(-50%, -50%)',
          transition: 'width 0.15s ease, height 0.15s ease',
          width: hovering ? '24px' : '14px',
          height: hovering ? '24px' : '14px',
          borderRadius: '50%',
          background: '#cc2222',
          mixBlendMode: hovering ? 'difference' : 'normal',
          opacity: hovering ? 0.9 : 0.8,
        }}
      />
    </>
  )
}
