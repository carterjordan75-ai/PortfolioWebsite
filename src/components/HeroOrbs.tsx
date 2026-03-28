'use client'

import { useEffect, useRef } from 'react'

interface Orb {
  x: number
  y: number
  targetX: number
  targetY: number
  baseX: number
  baseY: number
  radius: number
  color: string
  driftSpeed: number
  driftAngle: number
}

export default function HeroOrbs() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({ x: 0.5, y: 0.5 })
  const orbs = useRef<Orb[]>([])
  const time = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    orbs.current = [
      {
        x: 0.3, y: 0.4, targetX: 0.3, targetY: 0.4,
        baseX: 0.3, baseY: 0.4,
        radius: Math.min(canvas.width, canvas.height) * 0.35,
        color: isDark ? 'rgba(120, 80, 220, 0.4)' : 'rgba(180, 140, 255, 0.3)',
        driftSpeed: 0.0003, driftAngle: 0,
      },
      {
        x: 0.7, y: 0.3, targetX: 0.7, targetY: 0.3,
        baseX: 0.7, baseY: 0.3,
        radius: Math.min(canvas.width, canvas.height) * 0.3,
        color: isDark ? 'rgba(40, 200, 180, 0.35)' : 'rgba(80, 220, 200, 0.25)',
        driftSpeed: 0.0004, driftAngle: 2,
      },
      {
        x: 0.5, y: 0.7, targetX: 0.5, targetY: 0.7,
        baseX: 0.5, baseY: 0.7,
        radius: Math.min(canvas.width, canvas.height) * 0.28,
        color: isDark ? 'rgba(240, 160, 60, 0.35)' : 'rgba(255, 180, 100, 0.25)',
        driftSpeed: 0.00035, driftAngle: 4,
      },
    ]

    const onMouseMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX / window.innerWidth
      mouse.current.y = e.clientY / window.innerHeight
    }
    window.addEventListener('mousemove', onMouseMove)

    let animId: number
    const render = () => {
      time.current++
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      orbs.current.forEach((orb) => {
        orb.driftAngle += orb.driftSpeed
        const driftX = Math.sin(orb.driftAngle) * 0.05
        const driftY = Math.cos(orb.driftAngle * 0.7) * 0.05

        orb.targetX = orb.baseX + driftX + (mouse.current.x - 0.5) * 0.08
        orb.targetY = orb.baseY + driftY + (mouse.current.y - 0.5) * 0.08

        orb.x += (orb.targetX - orb.x) * 0.02
        orb.y += (orb.targetY - orb.y) * 0.02

        const cx = orb.x * canvas.width
        const cy = orb.y * canvas.height

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, orb.radius)
        gradient.addColorStop(0, orb.color)
        gradient.addColorStop(1, 'transparent')

        ctx.beginPath()
        ctx.arc(cx, cy, orb.radius, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()
      })

      animId = requestAnimationFrame(render)
    }
    render()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ filter: 'blur(80px)' }}
    />
  )
}
