'use client'

import { useEffect, useRef, useState } from 'react'

export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const [hovering, setHovering] = useState(false)

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const x = `${e.clientX}px`
      const y = `${e.clientY}px`
      if (dotRef.current) { dotRef.current.style.left = x; dotRef.current.style.top = y }
      if (ringRef.current) { ringRef.current.style.left = x; ringRef.current.style.top = y }
    }

    const checkHover = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const isClickable = target.closest('a, button, [role="button"], input, select, textarea, label[for], [data-card], [data-heart], [data-slider], .cursor-pointer, .animated-border-btn')
      setHovering(!!isClickable)
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
