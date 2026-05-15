'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface EmailPopupProps {
  show: boolean
  onClose: () => void
}

const EMAIL = 'carterjordan75@gmail.com'

// Burst particles — each is either an X or an O (the "xoxo" signoff). Kept the
// `Heart` name for minimal diff; could rename to `Particle` later.
interface Heart {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  size: number
  opacity: number
  rotation: number
  rotSpeed: number
  char: 'X' | 'O'
}

export default function EmailPopup({ show, onClose }: EmailPopupProps) {
  const [copied, setCopied] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [showHearts, setShowHearts] = useState(false)
  const heartIdRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const heartsRef = useRef<Heart[]>([])
  const animRef = useRef<number>(0)

  const spawnHearts = useCallback((cx: number, cy: number) => {
    const newHearts: Heart[] = []
    // Loads of X and O — burst count bumped up so it reads as a confetti shower
    for (let i = 0; i < 70; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 3 + Math.random() * 9
      newHearts.push({
        id: heartIdRef.current++,
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        size: 16 + Math.random() * 18,
        opacity: 1,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 12,
        char: Math.random() < 0.5 ? 'X' : 'O',
      })
    }
    heartsRef.current = [...heartsRef.current, ...newHearts]
    setShowHearts(true)
  }, [])

  // Animate hearts on canvas
  useEffect(() => {
    if (!showHearts) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const alive: Heart[] = []

      for (const h of heartsRef.current) {
        h.x += h.vx
        h.y += h.vy
        h.vy += 0.15 // gravity
        h.vx *= 0.99
        h.opacity -= 0.012
        h.rotation += h.rotSpeed

        if (h.opacity <= 0) continue
        alive.push(h)

        ctx.save()
        ctx.translate(h.x, h.y)
        ctx.rotate((h.rotation * Math.PI) / 180)
        ctx.globalAlpha = Math.max(0, h.opacity)
        // Bold sans for the X/O so they read as crisp typographic confetti
        ctx.font = `900 ${h.size}px ui-sans-serif, -apple-system, "Segoe UI", sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        // Subtle color variance — X's a touch pink, O's pure white
        ctx.fillStyle = h.char === 'X' ? '#ff69b4' : '#ffffff'
        ctx.fillText(h.char, 0, 0)
        ctx.restore()
      }

      heartsRef.current = alive
      if (alive.length > 0) {
        animRef.current = requestAnimationFrame(animate)
      } else {
        setShowHearts(false)
      }
    }

    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [showHearts])

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()

    // Spawn hearts from click position
    spawnHearts(e.clientX, e.clientY)

    try {
      await navigator.clipboard.writeText(EMAIL)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = EMAIL
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }

    setCopied(true)
    // Close after hearts burst and brief "Copied!" display
    setTimeout(() => {
      setCopied(false)
      onClose()
    }, 1200)
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            background: 'rgba(0,0,0,0.3)',
            cursor: 'pointer',
          }}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
            onClick={handleCopy}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{ cursor: 'pointer' }}
          >
            <span
              className="uppercase font-bold"
              style={{
                fontSize: 'clamp(0.9rem, 2.6vw, 1.8rem)',
                letterSpacing: '0.04em',
                lineHeight: 1.5,
                color: copied ? '#ff69b4' : hovered ? '#ff69b4' : '#ffffff',
                transition: 'color 0.15s ease',
                userSelect: 'none',
              }}
            >
              {copied ? 'Copied — XOXO' : EMAIL}
            </span>
          </motion.div>

          {/* Hearts canvas */}
          {showHearts && (
            <canvas
              ref={canvasRef}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10001,
                pointerEvents: 'none',
              }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
