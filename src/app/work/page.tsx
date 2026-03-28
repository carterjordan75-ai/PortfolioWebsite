'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import PageTransition from '@/components/PageTransition'
import PageLoader from '@/components/PageLoader'
import EmailPopup from '@/components/EmailPopup'
import AdminPortal from '@/components/AdminPortal'
import { useDarkMode } from '@/contexts/DarkModeContext'
import { projects } from '@/data/projects'

const featuredProjects = projects.filter(p => p.featured)

// Shuffled card-to-project mapping — ensures no adjacent duplicates
function shuffleCards(numCards: number, numProjects: number): number[] {
  const indices: number[] = []
  for (let i = 0; i < numCards; i++) indices.push(i % numProjects)
  // Fisher-Yates shuffle with retry to avoid adjacent duplicates
  for (let attempt = 0; attempt < 20; attempt++) {
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]]
    }
    const hasAdjacentDupes = indices.some((v, i) => i > 0 && v === indices[i - 1])
    if (!hasAdjacentDupes) break
  }
  return indices
}
const localVideos = [
  '/assets/TestMedia/video_01.mp4',
  '/assets/TestMedia/video_02.mp4',
  '/assets/TestMedia/video_03.mp4',
]

const NUM_CARDS = 8
const cardProjectMap = shuffleCards(NUM_CARDS, featuredProjects.length)
const RADIUS_X = 38
const RADIUS_Z = 300
const CARD_W = 253
const CARD_H = 143
const BASE_SPEED = 0.00317

// Dot grid
const DOT_COLS = 14
const DOT_ROWS = 9
const DOT_LAYERS = 10
const seededRand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
const dots: { x: number; y: number; z: number; seed: number }[] = []
for (let layer = 0; layer < DOT_LAYERS; layer++) {
  const zDepth = -400 + layer * (800 / (DOT_LAYERS - 1))
  for (let row = 0; row < DOT_ROWS; row++) {
    for (let col = 0; col < DOT_COLS; col++) {
      const idx = layer * DOT_COLS * DOT_ROWS + row * DOT_COLS + col
      const offsetX = (seededRand(idx * 3.1) - 0.5) * 8
      const offsetY = (seededRand(idx * 7.3) - 0.5) * 8
      dots.push({
        x: (col / (DOT_COLS - 1)) * 140 - 70 + offsetX,
        y: (row / (DOT_ROWS - 1)) * 140 - 70 + offsetY,
        z: zDepth,
        seed: idx,
      })
    }
  }
}

// Mini heart particle type
interface HeartParticle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  opacity: number
  life: number
  maxLife: number
  rotation: number
  rotSpeed: number
}

export default function WorkPage() {
  const router = useRouter()
  const { dark, fg } = useDarkMode()
  const timeRef = useRef(0)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const shadowRefs = useRef<(HTMLDivElement | null)[]>([])
  const dotCanvasRef = useRef<HTMLCanvasElement>(null)
  const darkRef = useRef(dark)
  const speedMultiplier = useRef(1)
  const verticalMultiplier = useRef(1)
  const [sliderSpeed, setSliderSpeed] = useState(0)
  const [sliderVertical, setSliderVertical] = useState(0)
  const [hoveredCard, setHoveredCard] = useState<number | null>(null)
  const hoveredRef = useRef<number | null>(null)
  const [heartHovered, setHeartHovered] = useState(false)
  const heartParticles = useRef<HeartParticle[]>([])
  const [heartCount, setHeartCount] = useState(0)
  const [pinkFlash, setPinkFlash] = useState(false)
  const [rippleActive, setRippleActive] = useState(false)
  const [showLover, setShowLover] = useState(false)
  const nextLoverRef = useRef(4 + Math.floor(Math.random() * 12))
  const slowdownRef = useRef(1)
  const [visitCount, setVisitCount] = useState(0)

  // Load persisted counts after mount to avoid hydration mismatch
  useEffect(() => {
    const storedHearts = parseInt(localStorage.getItem('jc-hearts') || '0', 10)
    setHeartCount(storedHearts)
    const storedVisits = parseInt(localStorage.getItem('jc-visits') || '1', 10)
    setVisitCount(storedVisits)
  }, [])
  const [showLoader, setShowLoader] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [loaderTarget, setLoaderTarget] = useState<string | null>(null)
  const [audioOn, setAudioOn] = useState(true)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const dropIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [showShhh, setShowShhh] = useState(false)
  const prevAudioOn = useRef(true)
  const prevDark = useRef(dark)

  // Listen for audio toggle from Navigation
  useEffect(() => {
    const handler = (e: Event) => {
      const newVal = (e as CustomEvent).detail
      // Show "Shhh" when turning OFF
      if (prevAudioOn.current && !newVal) {
        setShowShhh(true)
        setTimeout(() => setShowShhh(false), 800)
      }
      prevAudioOn.current = newVal
      setAudioOn(newVal)
    }
    window.addEventListener('ambient-audio', handler)
    return () => window.removeEventListener('ambient-audio', handler)
  }, [])

  // Light switch sound on dark mode toggle
  useEffect(() => {
    if (prevDark.current === dark) return
    prevDark.current = dark
    if (!audioCtxRef.current || !audioOn) return
    const ctx = audioCtxRef.current
    if (ctx.state === 'suspended') return
    const now = ctx.currentTime
    // Soft toggle — gentle tonal ping, like a premium UI sound
    const ping = ctx.createOscillator()
    ping.type = 'sine'
    ping.frequency.setValueAtTime(dark ? 880 : 660, now)
    const pg = ctx.createGain()
    pg.gain.setValueAtTime(0.04, now)
    pg.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
    ping.connect(pg)
    pg.connect(ctx.destination)
    ping.start(now)
    ping.stop(now + 0.2)
    // Soft harmonic
    const harm = ctx.createOscillator()
    harm.type = 'sine'
    harm.frequency.setValueAtTime(dark ? 1320 : 990, now)
    const hg = ctx.createGain()
    hg.gain.setValueAtTime(0.015, now + 0.02)
    hg.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
    harm.connect(hg)
    hg.connect(ctx.destination)
    harm.start(now + 0.02)
    harm.stop(now + 0.15)
  }, [dark, audioOn])

  const isDragging = useRef(false)
  const lastMouseX = useRef(0)
  const dragVelocity = useRef(0)
  const mainRef = useRef<HTMLDivElement>(null)

  // Persist and broadcast heart count
  useEffect(() => {
    localStorage.setItem('jc-hearts', String(heartCount))
    window.dispatchEvent(new CustomEvent('heart-count', { detail: heartCount }))
  }, [heartCount])

  useEffect(() => { hoveredRef.current = hoveredCard }, [hoveredCard])
  useEffect(() => { darkRef.current = dark }, [dark])
  useEffect(() => { speedMultiplier.current = 1 + (sliderSpeed / 100) * 3 }, [sliderSpeed])
  useEffect(() => { verticalMultiplier.current = 0.2 + (sliderVertical / 100) * 1.8 }, [sliderVertical])

  const spawnHearts = useCallback(() => {
    for (let i = 0; i < 25; i++) {
      const angle = (Math.random() * Math.PI * 2)
      const force = 3 + Math.random() * 6
      heartParticles.current.push({
        x: (Math.random() - 0.5) * 20,
        y: (Math.random() - 0.5) * 10,
        vx: Math.cos(angle) * force,
        vy: -Math.random() * 8 - 3,
        size: 10 + Math.random() * 18,
        opacity: 1,
        life: 0,
        maxLife: 80 + Math.random() * 60,
        rotation: (Math.random() - 0.5) * 0.8,
        rotSpeed: (Math.random() - 0.5) * 0.15,
      })
    }
  }, [])

  // Card click — capture slug on pointerdown (before animation moves card)
  // then navigate on pointerup if mouse didn't move much
  const pendingNav = useRef<string | null>(null)
  const pointerDownSlug = useRef<string | null>(null)
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      pointerDownPos.current = { x: e.clientX, y: e.clientY }
      pointerDownSlug.current = null
      // Method 1: elementsFromPoint
      const els = document.elementsFromPoint(e.clientX, e.clientY)
      for (const el of els) {
        const card = el.closest('[data-card]')
        if (card) {
          pointerDownSlug.current = (card as HTMLElement).dataset.slug || null
          return
        }
      }
      // Method 2: check all card bounding rects (fallback for overlapping elements)
      const cards = document.querySelectorAll('[data-card]')
      for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect()
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          pointerDownSlug.current = (cards[i] as HTMLElement).dataset.slug || null
          return
        }
      }
    }
    const onUp = (e: PointerEvent) => {
      if (!pointerDownSlug.current || !pointerDownPos.current) return
      const dx = e.clientX - pointerDownPos.current.x
      const dy = e.clientY - pointerDownPos.current.y
      if (Math.sqrt(dx * dx + dy * dy) < 12) {
        pendingNav.current = `/work/${pointerDownSlug.current}`
      }
      pointerDownSlug.current = null
      pointerDownPos.current = null
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('pointerup', onUp, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('pointerup', onUp, true)
    }
  }, [])

  // Poll for pending navigation
  useEffect(() => {
    const check = setInterval(() => {
      if (pendingNav.current) {
        const url = pendingNav.current
        pendingNav.current = null
        setLoaderTarget(url)
        setShowLoader(true)
      }
    }, 50)
    return () => clearInterval(check)
  }, [])

  // Mouse drag handlers
  useEffect(() => {
    const el = mainRef.current
    if (!el) return

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-card]') || target.closest('[data-slider]') || target.closest('[data-heart]')) return
      isDragging.current = true
      lastMouseX.current = e.clientX
      dragVelocity.current = 0
      el.style.cursor = 'grabbing'
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const dx = e.clientX - lastMouseX.current
      lastMouseX.current = e.clientX
      dragVelocity.current = dx * 0.00015
    }

    const onMouseUp = () => {
      isDragging.current = false
      if (el) el.style.cursor = 'grab'
    }

    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // Animation loop
  useEffect(() => {
    let animId: number
    const animate = () => {
      if (!isDragging.current) {
        dragVelocity.current *= 0.96
      }

      // Slow down when hovering a card
      const hoverSlow = hoveredRef.current !== null ? 0.25 : 1
      // Lerp slowdown back to 1
      slowdownRef.current += (1 - slowdownRef.current) * 0.02
      timeRef.current += (BASE_SPEED * speedMultiplier.current * hoverSlow * slowdownRef.current) + dragVelocity.current

      const t = timeRef.current
      const hovered = hoveredRef.current
      const vMult = verticalMultiplier.current
      const cardPositions: { px: number; py: number; isBehind: boolean; index: number }[] = []

      const canvas = dotCanvasRef.current
      const cw = canvas?.width || 0
      const ch = canvas?.height || 0

      for (let i = 0; i < NUM_CARDS; i++) {
        const baseAngle = (i / NUM_CARDS) * Math.PI * 2
        const angle = baseAngle + t
        const x = Math.sin(angle) * RADIUS_X
        const z = Math.cos(angle) * RADIUS_Z
        const bobY = (Math.sin(t * 1.2 + i * 1.7) * 55 + Math.cos(t * 0.8 + i * 2.3) * 30) * vMult
        const depthScale = 0.65 + (z + RADIUS_Z) / (RADIUS_Z * 2) * 0.55
        const isBehind = z < -20

        const el = cardRefs.current[i]
        if (!el) continue

        const isHov = hovered === i
        const w = CARD_W * depthScale
        const h = CARD_H * depthScale

        el.style.width = `${w}px`
        el.style.height = `${h}px`
        el.style.left = `calc(50% + ${x}%)`
        el.style.top = `calc(50% + ${bobY}px)`
        el.style.transform = `translate(-50%, -50%) ${isHov ? 'scale(1.3)' : ''}`
        el.style.zIndex = isHov ? '999' : isBehind
          ? `${10 + Math.round((z + RADIUS_Z) / 10)}`
          : `${60 + Math.round((z + RADIUS_Z) / 10)}`
        el.style.opacity = isBehind
          ? `${0.5 + depthScale * 0.4}`
          : `${0.7 + depthScale * 0.3}`

        // Pink halo glow on hover
        if (isHov) {
          el.style.boxShadow = '0 0 35px 10px rgba(255,105,180,0.4), 0 0 70px 25px rgba(255,105,180,0.2), 0 0 120px 50px rgba(255,105,180,0.08)'
        } else {
          const isDk = darkRef.current
          el.style.boxShadow = isDk
            ? '0 12px 35px rgba(255,255,255,0.06)'
            : '0 12px 35px rgba(0,0,0,0.15)'
        }

        cardPositions.push({ px: cw / 2 + (x / 100) * cw, py: ch / 2 + bobY, isBehind, index: i })

      }

      // Draw on canvas
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, cw, ch)
          const isDark = darkRef.current
          const centerX = cw / 2
          const centerY = ch / 2 + 10

          // === Tracking lines — bold, black, animated ===
          for (const card of cardPositions) {
            const lineAlpha = card.isBehind ? 0.15 : 0.4
            const accentAlpha = card.isBehind ? 0.2 : 0.5

            const dx = centerX - card.px
            const dy = centerY - card.py
            const dist = Math.sqrt(dx * dx + dy * dy)

            // Main animated dashed line — thick, black
            ctx.save()
            ctx.setLineDash([4, 4])
            ctx.lineDashOffset = -t * 150 + card.index * 20

            const grad = ctx.createLinearGradient(card.px, card.py, centerX, centerY)
            const lc = isDark ? `rgba(255,255,255,${lineAlpha})` : `rgba(0,0,0,${lineAlpha})`
            grad.addColorStop(0, lc)
            grad.addColorStop(0.6, lc)
            grad.addColorStop(1, 'transparent')

            ctx.beginPath()
            ctx.moveTo(card.px, card.py)
            ctx.lineTo(centerX, centerY)
            ctx.strokeStyle = grad
            ctx.lineWidth = 1.2
            ctx.stroke()
            ctx.restore()

            // Secondary solid line underneath — very faint
            ctx.save()
            const solidGrad = ctx.createLinearGradient(card.px, card.py, centerX, centerY)
            const solidAlpha = card.isBehind ? 0.04 : 0.08
            const slc = isDark ? `rgba(255,255,255,${solidAlpha})` : `rgba(0,0,0,${solidAlpha})`
            solidGrad.addColorStop(0, slc)
            solidGrad.addColorStop(0.7, slc)
            solidGrad.addColorStop(1, 'transparent')
            ctx.beginPath()
            ctx.moveTo(card.px, card.py)
            ctx.lineTo(centerX, centerY)
            ctx.strokeStyle = solidGrad
            ctx.lineWidth = 0.5
            ctx.stroke()
            ctx.restore()

            // Multiple scanning dots — 3 at staggered speeds
            for (let s = 0; s < 3; s++) {
              const speed = 0.5 + s * 0.3
              const offset = s * 0.33
              const scanPos = ((t * speed + card.index * 0.3 + offset) % 1)
              const scanX = card.px + dx * scanPos
              const scanY = card.py + dy * scanPos
              const scanAlpha = accentAlpha * (1 - scanPos * scanPos) * (0.5 + 0.5 * Math.sin(t * 4 + s * 2.5))

              ctx.beginPath()
              ctx.arc(scanX, scanY, 2 - s * 0.4, 0, Math.PI * 2)
              ctx.fillStyle = isDark ? `rgba(255,255,255,${scanAlpha})` : `rgba(0,0,0,${scanAlpha})`
              ctx.fill()
            }

            // Pulsing corner brackets
            const pulse = 0.6 + Math.sin(t * 5 + card.index * 1.5) * 0.4
            const boxSize = 9 * pulse
            const ba = accentAlpha * pulse
            ctx.strokeStyle = isDark ? `rgba(255,255,255,${ba})` : `rgba(0,0,0,${ba})`
            ctx.lineWidth = 1
            ctx.setLineDash([])

            const bx = card.px - boxSize / 2
            const by = card.py - boxSize / 2
            const cornerLen = boxSize * 0.35
            ctx.beginPath()
            ctx.moveTo(bx, by + cornerLen); ctx.lineTo(bx, by); ctx.lineTo(bx + cornerLen, by)
            ctx.moveTo(bx + boxSize - cornerLen, by); ctx.lineTo(bx + boxSize, by); ctx.lineTo(bx + boxSize, by + cornerLen)
            ctx.moveTo(bx + boxSize, by + boxSize - cornerLen); ctx.lineTo(bx + boxSize, by + boxSize); ctx.lineTo(bx + boxSize - cornerLen, by + boxSize)
            ctx.moveTo(bx + cornerLen, by + boxSize); ctx.lineTo(bx, by + boxSize); ctx.lineTo(bx, by + boxSize - cornerLen)
            ctx.stroke()

            // Red anchor dot
            ctx.beginPath()
            ctx.arc(card.px, card.py, 2, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(220,40,40,${ba})`
            ctx.fill()

            // Flickering labels
            const labelFlicker = Math.sin(t * 6 + card.index * 2.7) > -0.2 ? 1 : 0
            if (labelFlicker) {
              const la = (card.isBehind ? 0.1 : 0.25) * pulse
              ctx.font = 'bold 7px monospace'
              ctx.fillStyle = isDark ? `rgba(255,255,255,${la})` : `rgba(0,0,0,${la})`
              ctx.fillText(`x:${Math.round(card.px)} y:${Math.round(card.py)}`, card.px + 10, card.py - 10)

              const analysisTexts = ['TRACKING', 'ANALYZE', 'SCAN', 'DETECT', 'LOCK', 'MAP', 'SYNC', 'READ']
              const textIdx = Math.floor((t * 3 + card.index * 1.3) % analysisTexts.length)
              ctx.fillText(analysisTexts[textIdx], card.px + 10, card.py - 1)
            }

            // Distance readout on line
            const distAlpha = (card.isBehind ? 0.06 : 0.18) * pulse
            ctx.font = 'bold 6px monospace'
            ctx.fillStyle = isDark ? `rgba(255,255,255,${distAlpha})` : `rgba(0,0,0,${distAlpha})`
            const midX = card.px + dx * 0.35
            const midY = card.py + dy * 0.35
            ctx.fillText(`${Math.round(dist)}px`, midX + 5, midY - 3)
          }

          // === Inter-card web lines ===
          for (let a = 0; a < cardPositions.length; a++) {
            for (let b = a + 1; b < cardPositions.length; b++) {
              const ca = cardPositions[a]
              const cb = cardPositions[b]
              const dx = cb.px - ca.px
              const dy = cb.py - ca.py
              const dist = Math.sqrt(dx * dx + dy * dy)
              if (dist > cw * 0.6) continue // skip very far pairs

              const bothBehind = ca.isBehind && cb.isBehind
              const webAlpha = bothBehind ? 0.04 : (ca.isBehind || cb.isBehind ? 0.08 : 0.14)
              const flicker = 0.6 + Math.sin(t * 3.5 + a * 1.7 + b * 2.3) * 0.4

              ctx.save()
              ctx.setLineDash([2, 3])
              ctx.lineDashOffset = -t * 80 + a * 15 + b * 25
              ctx.beginPath()
              ctx.moveTo(ca.px, ca.py)
              ctx.lineTo(cb.px, cb.py)
              ctx.strokeStyle = isDark
                ? `rgba(255,255,255,${webAlpha * flicker})`
                : `rgba(0,0,0,${webAlpha * flicker})`
              ctx.lineWidth = 0.6
              ctx.stroke()
              ctx.restore()

              // Scanning dot along inter-card line
              const scanT = ((t * 0.8 + a * 0.5 + b * 0.7) % 1)
              const sx = ca.px + dx * scanT
              const sy = ca.py + dy * scanT
              const dotAlpha = webAlpha * flicker * (1 - Math.abs(scanT - 0.5) * 2)
              ctx.beginPath()
              ctx.arc(sx, sy, 1.5, 0, Math.PI * 2)
              ctx.fillStyle = isDark
                ? `rgba(255,255,255,${dotAlpha})`
                : `rgba(0,0,0,${dotAlpha})`
              ctx.fill()
            }
          }

          // === Dots — sharp squares ===
          ctx.imageSmoothingEnabled = false
          for (const dot of dots) {
            const driftX = Math.sin(t * 2.5 + dot.seed * 0.37) * 18 + Math.cos(t * 1.6 + dot.seed * 1.13) * 12 + Math.sin(t * 3.8 + dot.seed * 2.1) * 6
            const driftY = Math.cos(t * 2.2 + dot.seed * 0.53) * 16 + Math.sin(t * 1.4 + dot.seed * 0.91) * 10 + Math.cos(t * 3.2 + dot.seed * 1.7) * 5
            const driftZ = Math.sin(t * 0.8 + dot.seed * 0.71) * 50 + Math.cos(t * 1.3 + dot.seed * 1.2) * 25
            const animZ = dot.z + driftZ
            const perspective = 700
            const rawScale = perspective / (perspective + animZ)
            if (rawScale < 0.1 || rawScale > 4) continue
            const px = cw / 2 + (dot.x / 100) * cw * rawScale + driftX
            const py = ch / 2 + (dot.y / 100) * ch * rawScale + driftY
            if (px < -20 || px > cw + 20 || py < -20 || py > ch + 20) continue
            const verticalFade = 1 - Math.max(0, (py / ch - 0.4)) / 0.6
            const clampedFade = Math.max(0, Math.min(1, verticalFade))
            const depthAlpha = Math.min(1, Math.max(0.1, rawScale * 0.5))
            const alpha = (isDark ? depthAlpha * 0.25 : depthAlpha * 0.35) * clampedFade
            if (alpha < 0.01) continue

            const size = Math.max(1, Math.round(rawScale * 1.2))
            ctx.fillStyle = isDark ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`
            ctx.fillRect(Math.round(px), Math.round(py), size, size)
          }
          ctx.imageSmoothingEnabled = true

          // === Heart particles ===
          const particles = heartParticles.current
          for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i]
            p.life++
            p.x += p.vx
            p.y += p.vy
            p.vy += 0.03 // slight gravity
            p.vx *= 0.99
            p.rotation += p.rotSpeed
            p.opacity = 1 - (p.life / p.maxLife)

            if (p.life >= p.maxLife) {
              particles.splice(i, 1)
              continue
            }

            // Draw mini heart
            const hx = cw / 2 + p.x
            const hy = ch - 45 + p.y
            const hs = p.size * p.opacity

            ctx.save()
            ctx.translate(hx, hy)
            ctx.rotate(p.rotation)
            ctx.globalAlpha = p.opacity
            ctx.fillStyle = `rgba(220,40,60,${p.opacity})`
            ctx.beginPath()
            ctx.moveTo(0, hs * 0.3)
            ctx.bezierCurveTo(-hs * 0.5, -hs * 0.3, -hs * 0.5, -hs * 0.6, 0, -hs * 0.35)
            ctx.bezierCurveTo(hs * 0.5, -hs * 0.6, hs * 0.5, -hs * 0.3, 0, hs * 0.3)
            ctx.fill()
            ctx.globalAlpha = 1
            ctx.restore()
          }
        }
      }

      animId = requestAnimationFrame(animate)
    }
    animId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animId)
  }, [])

  // Resize canvas
  useEffect(() => {
    const resize = () => {
      const canvas = dotCanvasRef.current
      const main = mainRef.current
      if (canvas && main) {
        canvas.width = main.clientWidth
        canvas.height = main.clientHeight
      }
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // Refs for reactive audio params
  const padOscsRef = useRef<OscillatorNode[]>([])
  const padGainRef = useRef<GainNode | null>(null)
  const noiseBufferRef = useRef<AudioBuffer | null>(null)
  const reverbRef = useRef<ConvolverNode | null>(null)

  // Play heart sound — seductive deep slide with warmth
  const playHeartSound = useCallback(() => {
    const ctx = audioCtxRef.current
    const master = masterGainRef.current
    if (!ctx || !master || ctx.state !== 'running') return
    const now = ctx.currentTime
    const reverb = reverbRef.current

    // Deep warm bass slide — the heartbeat thump
    const bass = ctx.createOscillator()
    bass.type = 'sine'
    bass.frequency.setValueAtTime(180, now)
    bass.frequency.exponentialRampToValueAtTime(55, now + 0.4)
    const bassG = ctx.createGain()
    bassG.gain.setValueAtTime(0.18, now)
    bassG.gain.linearRampToValueAtTime(0.12, now + 0.15)
    bassG.gain.exponentialRampToValueAtTime(0.001, now + 0.8)
    bass.connect(bassG)
    bassG.connect(master)
    if (reverb) bassG.connect(reverb)
    bass.start(now)
    bass.stop(now + 1)

    // Sultry portamento — slow pitch slide down through minor thirds
    const slide = ctx.createOscillator()
    slide.type = 'triangle'
    slide.frequency.setValueAtTime(440, now + 0.05)
    slide.frequency.exponentialRampToValueAtTime(330, now + 0.25) // A4 → E4
    slide.frequency.exponentialRampToValueAtTime(261, now + 0.5) // → C4
    slide.frequency.exponentialRampToValueAtTime(196, now + 0.9) // → G3
    const slideG = ctx.createGain()
    slideG.gain.setValueAtTime(0, now)
    slideG.gain.linearRampToValueAtTime(0.06, now + 0.08)
    slideG.gain.linearRampToValueAtTime(0.04, now + 0.4)
    slideG.gain.exponentialRampToValueAtTime(0.001, now + 1.2)
    // Warm filter on slide
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(2000, now)
    lp.frequency.exponentialRampToValueAtTime(400, now + 1.0)
    lp.Q.value = 2
    slide.connect(lp)
    lp.connect(slideG)
    slideG.connect(master)
    if (reverb) slideG.connect(reverb)
    slide.start(now + 0.05)
    slide.stop(now + 1.5)

    // Breathy noise layer — soft "ahh" texture
    const noiseLen = ctx.sampleRate
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate)
    const nd = noiseBuf.getChannelData(0)
    for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1
    const breath = ctx.createBufferSource()
    breath.buffer = noiseBuf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 600
    bp.Q.value = 3
    const breathG = ctx.createGain()
    breathG.gain.setValueAtTime(0, now)
    breathG.gain.linearRampToValueAtTime(0.02, now + 0.1)
    breathG.gain.exponentialRampToValueAtTime(0.001, now + 0.7)
    breath.connect(bp)
    bp.connect(breathG)
    breathG.connect(master)
    if (reverb) breathG.connect(reverb)
    breath.start(now)
    breath.stop(now + 0.8)

    // Soft high shimmer — delayed sparkle
    const shimmer = ctx.createOscillator()
    shimmer.type = 'sine'
    shimmer.frequency.setValueAtTime(1318, now + 0.15) // E6
    shimmer.frequency.exponentialRampToValueAtTime(880, now + 0.6) // → A5
    const shimG = ctx.createGain()
    shimG.gain.setValueAtTime(0, now + 0.15)
    shimG.gain.linearRampToValueAtTime(0.025, now + 0.2)
    shimG.gain.exponentialRampToValueAtTime(0.001, now + 0.9)
    shimmer.connect(shimG)
    shimG.connect(master)
    if (reverb) shimG.connect(reverb)
    shimmer.start(now + 0.15)
    shimmer.stop(now + 1.2)
  }, [])

  // Ambient audio engine — reacts to speed & offset sliders
  useEffect(() => {
    if (!audioOn) {
      // Play "shhhh" sound before fading out
      if (audioCtxRef.current && masterGainRef.current) {
        const ctx = audioCtxRef.current
        if (ctx.state === 'suspended') ctx.resume()
        const now = ctx.currentTime

        // "Hushhh" — breathy H onset → sibilant SH → long fading exhale
        const bufSize = ctx.sampleRate * 2
        const shBuf = ctx.createBuffer(2, bufSize, ctx.sampleRate)
        for (let ch = 0; ch < 2; ch++) {
          const d = shBuf.getChannelData(ch)
          for (let i = 0; i < bufSize; i++) {
            d[i] = (Math.random() * 2 - 1) * 0.5
          }
        }

        // === "H" onset — breathy, low-frequency heavy ===
        const hNoise = ctx.createBufferSource()
        hNoise.buffer = shBuf
        const hLp = ctx.createBiquadFilter()
        hLp.type = 'lowpass'
        hLp.frequency.value = 2000
        hLp.Q.value = 0.4
        const hGain = ctx.createGain()
        hGain.gain.setValueAtTime(0, now)
        hGain.gain.linearRampToValueAtTime(0.05, now + 0.03) // fast breathy H
        hGain.gain.linearRampToValueAtTime(0.02, now + 0.12) // fade into SH
        hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
        hNoise.connect(hLp)
        hLp.connect(hGain)
        hGain.connect(ctx.destination)
        hNoise.start(now)
        hNoise.stop(now + 0.25)

        // === "SH" sibilance — overlaps with H tail ===
        const shNoise = ctx.createBufferSource()
        shNoise.buffer = shBuf
        const f1 = ctx.createBiquadFilter()
        f1.type = 'bandpass'
        f1.frequency.value = 3200
        f1.Q.value = 2
        const f2 = ctx.createBiquadFilter()
        f2.type = 'bandpass'
        f2.frequency.value = 6000
        f2.Q.value = 2.5
        const shLp = ctx.createBiquadFilter()
        shLp.type = 'lowpass'
        shLp.frequency.value = 8500
        shLp.Q.value = 0.3
        const mix = ctx.createGain()
        const g1 = ctx.createGain()
        g1.gain.value = 0.6
        const g2 = ctx.createGain()
        g2.gain.value = 0.35
        const shGain = ctx.createGain()
        // SH fades in as H fades, then long exhale tail
        shGain.gain.setValueAtTime(0, now)
        shGain.gain.linearRampToValueAtTime(0.01, now + 0.08)
        shGain.gain.linearRampToValueAtTime(0.035, now + 0.15)
        shGain.gain.setValueAtTime(0.035, now + 0.3)
        shGain.gain.linearRampToValueAtTime(0.02, now + 0.55)
        shGain.gain.linearRampToValueAtTime(0.008, now + 0.75)
        shGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0)

        shNoise.connect(f1)
        shNoise.connect(f2)
        f1.connect(g1)
        f2.connect(g2)
        g1.connect(mix)
        g2.connect(mix)
        mix.connect(shLp)
        shLp.connect(shGain)
        shGain.connect(ctx.destination)
        shNoise.start(now + 0.06)
        shNoise.stop(now + 1.1)

        // Fade out main audio
        masterGainRef.current.gain.linearRampToValueAtTime(0, now + 0.5)
      }
      if (dropIntervalRef.current) {
        clearInterval(dropIntervalRef.current)
        dropIntervalRef.current = null
      }
      return
    }

    // Always create a fresh AudioContext to avoid stale state
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close() } catch {}
    }
    const ctx = new AudioContext()
    audioCtxRef.current = ctx

    // Resume on first user interaction (browsers block AudioContext until gesture)
    const resumeAudio = () => {
      if (ctx.state === 'suspended') ctx.resume()
    }
    resumeAudio()
    window.addEventListener('click', resumeAudio, { once: true })
    window.addEventListener('touchstart', resumeAudio, { once: true })
    window.addEventListener('keydown', resumeAudio, { once: true })

    const master = ctx.createGain()
    master.gain.setValueAtTime(0, ctx.currentTime)
    master.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 1.5)
    master.connect(ctx.destination)
    masterGainRef.current = master

    // === Long lush reverb ===
    const reverbLen = ctx.sampleRate * 4
    const reverbBuf = ctx.createBuffer(2, reverbLen, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = reverbBuf.getChannelData(ch)
      for (let i = 0; i < reverbLen; i++) {
        const decay = Math.pow(1 - i / reverbLen, 1.8)
        d[i] = (Math.random() * 2 - 1) * decay * (1 + Math.sin(i * 0.0001) * 0.3)
      }
    }
    const reverb = ctx.createConvolver()
    reverb.buffer = reverbBuf
    const reverbGain = ctx.createGain()
    reverbGain.gain.value = 0.25
    reverb.connect(reverbGain)
    reverbGain.connect(master)
    reverbRef.current = reverb

    // === Ambient soundscape — muffled bass + evolving textures ===
    const muffle = ctx.createBiquadFilter()
    muffle.type = 'lowpass'
    muffle.frequency.value = 300
    muffle.Q.value = 1
    muffle.connect(master)

    // === Deep sub — warm continuous presence ===
    const subOsc = ctx.createOscillator()
    subOsc.type = 'sine'
    subOsc.frequency.value = 42
    const subGain = ctx.createGain()
    subGain.gain.value = 0.05
    subOsc.connect(subGain)
    subGain.connect(muffle)
    subOsc.start()

    // === Ambient pad — Am7, slow breathing ===
    const padFreqs = [110, 164.8, 220, 329.6]
    const padOscs: OscillatorNode[] = [subOsc]
    const padMix = ctx.createGain()
    padMix.gain.value = 0.03
    padMix.connect(reverb)
    padMix.connect(muffle)
    padFreqs.forEach((f, i) => {
      const osc = ctx.createOscillator()
      osc.type = i < 2 ? 'triangle' : 'sine'
      osc.frequency.value = f + (Math.random() - 0.5) * 1
      const g = ctx.createGain()
      g.gain.value = i === 0 ? 0.3 : 0.15
      osc.connect(g)
      g.connect(padMix)
      osc.start()
      padOscs.push(osc)
    })
    padOscsRef.current = padOscs
    padGainRef.current = padMix

    // === Noise for hats/rain/texture ===
    const noiseBufLen = ctx.sampleRate * 2
    const nBuf = ctx.createBuffer(1, noiseBufLen, ctx.sampleRate)
    const nData = nBuf.getChannelData(0)
    for (let i = 0; i < noiseBufLen; i++) nData[i] = Math.random() * 2 - 1

    // === Vinyl crackle texture ===
    const vinylNoise = ctx.createBufferSource()
    vinylNoise.buffer = nBuf
    vinylNoise.loop = true
    const vinylLp = ctx.createBiquadFilter()
    vinylLp.type = 'lowpass'
    vinylLp.frequency.value = 600
    const vinylG = ctx.createGain()
    vinylG.gain.value = 0.005
    vinylNoise.connect(vinylLp)
    vinylLp.connect(vinylG)
    vinylG.connect(master)
    vinylNoise.start()

    // === Slider reactivity ===
    // Speed → muffle + ambient density, Offset → pitch
    const muffleUpdate = setInterval(() => {
      const spd = speedMultiplier.current
      const off = verticalMultiplier.current
      const pitchMult = 0.8 + off * 0.4
      muffle.frequency.linearRampToValueAtTime(250 + spd * 50, ctx.currentTime + 0.2)
      subOsc.frequency.linearRampToValueAtTime((35 + off * 30), ctx.currentTime + 0.3)
      padOscs.forEach((osc, i) => {
        if (i === 0) return
        osc.frequency.linearRampToValueAtTime(padFreqs[i-1] * pitchMult + (Math.random()-0.5)*2, ctx.currentTime + 0.5)
      })
    }, 200)

    // === Ambient sound layer — speed adds rain/tech sounds ===
    const playAmbientSound = () => {
      if (ctx.state !== 'running') return
      const spd = speedMultiplier.current
      const off = verticalMultiplier.current
      const pitchMult = 0.8 + off * 0.4
      const now = ctx.currentTime
      const type = Math.random()

      if (type < 0.3) {
        // Rain drop — soft filtered noise pip
        const n = ctx.createBufferSource()
        n.buffer = nBuf
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = (3000 + Math.random() * 4000) * pitchMult
        bp.Q.value = 2 + Math.random() * 4
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.008 + Math.random() * 0.008, now)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.02 + Math.random() * 0.02)
        n.connect(bp); bp.connect(g); g.connect(master); g.connect(reverb)
        n.start(now); n.stop(now + 0.05)
      } else if (type < 0.5) {
        // Digital blip — soft sine ping
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = (400 + Math.random() * 800) * pitchMult
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.008 + Math.random() * 0.006, now)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06 + Math.random() * 0.08)
        osc.connect(g); g.connect(reverb)
        osc.start(now); osc.stop(now + 0.15)
      } else if (type < 0.65) {
        // Keyboard tick
        const osc = ctx.createOscillator()
        osc.type = 'square'
        osc.frequency.setValueAtTime((1800 + Math.random() * 800) * pitchMult, now)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.006, now)
        g.gain.setValueAtTime(0, now + 0.003)
        osc.connect(g); g.connect(master)
        osc.start(now); osc.stop(now + 0.005)
      } else if (type < 0.78) {
        // Soft resonant tone — like distant chime
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        const notes = [523.3, 659.3, 784, 1047]
        osc.frequency.value = notes[Math.floor(Math.random() * notes.length)] * pitchMult
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.006, now)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3 + Math.random() * 0.5)
        osc.connect(g); g.connect(reverb)
        osc.start(now); osc.stop(now + 1)
      } else if (type < 0.9) {
        // Paper rustle
        const n = ctx.createBufferSource()
        n.buffer = nBuf
        const hp = ctx.createBiquadFilter()
        hp.type = 'highpass'
        hp.frequency.value = 3000 + Math.random() * 3000
        const g = ctx.createGain()
        const dur = 0.03 + Math.random() * 0.05
        g.gain.setValueAtTime(0.01, now)
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
        n.connect(hp); hp.connect(g); g.connect(master); g.connect(reverb)
        n.start(now); n.stop(now + dur + 0.01)
      } else {
        // Sub pulse
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = (30 + Math.random() * 25) * pitchMult
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.025, now)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
        osc.connect(g); g.connect(master)
        osc.start(now); osc.stop(now + 0.2)
      }
    }

    // Speed controls how often ambient sounds play
    let ambientInterval: ReturnType<typeof setInterval>
    const scheduleAmbient = () => {
      if (ambientInterval) clearInterval(ambientInterval)
      const spd = speedMultiplier.current
      // At speed 1: one sound every ~800ms. At speed 4: every ~150ms
      const interval = Math.max(100, 900 / spd)
      ambientInterval = setInterval(playAmbientSound, interval)
    }
    scheduleAmbient()
    const ambientCheck = setInterval(scheduleAmbient, 1500)

    // === Beat loop — very ambient, barely-there pulse ===
    const BPM = 112
    const beatLen = 60 / BPM
    const barLen = beatLen * 4
    let loopRunning = true
    let barCount = 0

    const scheduleBar = (barStart: number) => {
      if (!loopRunning) return
      barCount++
      const spd = speedMultiplier.current // randomness
      const off = verticalMultiplier.current // pitch
      const pitchMult = 0.8 + off * 0.4 // 0.8x to 1.6x

      for (let beat = 0; beat < 4; beat++) {
        // Speed adds timing randomness
        const jitter = (Math.random() - 0.5) * spd * 0.03
        const t = barStart + beat * beatLen + jitter

        // Kick — soft, only beat 1, occasional beat 3
        if (beat === 0 || (beat === 2 && Math.random() < 0.4)) {
          const kick = ctx.createOscillator()
          kick.type = 'sine'
          const kickPitch = 70 * pitchMult
          kick.frequency.setValueAtTime(kickPitch, t)
          kick.frequency.exponentialRampToValueAtTime(kickPitch * 0.5, t + 0.18)
          const kickG = ctx.createGain()
          kickG.gain.setValueAtTime(0.12, t)
          kickG.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
          kick.connect(kickG)
          kickG.connect(muffle)
          kick.start(t)
          kick.stop(t + 0.45)
        }
      }

      // Bass — pitch shifts with offset
      const bassPatterns = [
        [55, 0, 65.4, 0],
        [55, 55, 0, 73.4],
        [49, 0, 55, 0],
        [55, 0, 0, 82.4],
      ]
      // At high speed, randomly pick a pattern instead of cycling
      const patIdx = spd > 2 ? Math.floor(Math.random() * bassPatterns.length) : barCount % bassPatterns.length
      const pattern = bassPatterns[patIdx]
      pattern.forEach((freq, i) => {
        if (freq === 0) return
        const bT = barStart + i * beatLen
        const bass = ctx.createOscillator()
        bass.type = 'triangle'
        bass.frequency.value = freq * pitchMult
        const bFilt = ctx.createBiquadFilter()
        bFilt.type = 'lowpass'
        bFilt.frequency.setValueAtTime(140, bT)
        bFilt.frequency.linearRampToValueAtTime(250, bT + beatLen * 0.2)
        bFilt.frequency.linearRampToValueAtTime(100, bT + beatLen * 0.85)
        bFilt.Q.value = 3
        const bG = ctx.createGain()
        bG.gain.setValueAtTime(0.07, bT)
        bG.gain.exponentialRampToValueAtTime(0.001, bT + beatLen * 0.9)
        bass.connect(bFilt)
        bFilt.connect(bG)
        bG.connect(muffle)
        bass.start(bT)
        bass.stop(bT + beatLen)
      })

      // Atmospheric stab — more frequent at high speed
      if (Math.random() < 0.1 + spd * 0.05) {
        const stabT = barStart + Math.floor(Math.random() * 4) * beatLen
        const chords = [[220, 261.6, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6]]
        const chord = chords[Math.floor(Math.random() * chords.length)]
        chord.forEach(f => {
          const osc = ctx.createOscillator()
          osc.type = 'sine'
          osc.frequency.value = f * pitchMult
          const sG = ctx.createGain()
          sG.gain.setValueAtTime(0.015, stabT)
          sG.gain.exponentialRampToValueAtTime(0.001, stabT + 1.5)
          osc.connect(sG)
          sG.connect(reverb)
          sG.connect(muffle)
          osc.start(stabT)
          osc.stop(stabT + 2)
        })
      }

      // Schedule next bar
      setTimeout(() => {
        if (loopRunning && ctx.state === 'running') {
          scheduleBar(barStart + barLen)
        }
      }, (barLen - 0.1) * 1000)
    }

    scheduleBar(ctx.currentTime + 0.05)

    // === Noise buffer ===
    const bufferSize = ctx.sampleRate * 2
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1
    }
    noiseBufferRef.current = noiseBuffer

    // Legacy sound function — kept for heart sound compatibility
    const playDroplet = () => {
      if (!ctx || ctx.state !== 'running') return
      const now = ctx.currentTime
      const offsetFactor = verticalMultiplier.current
      const type = Math.random()

      if (type < 0.06) {
        // Paper rustle — shaped noise burst with crinkly high-freq character
        const noise = ctx.createBufferSource()
        noise.buffer = noiseBuffer
        const hp = ctx.createBiquadFilter()
        hp.type = 'highpass'
        hp.frequency.value = 3000 + Math.random() * 4000
        hp.Q.value = 0.5
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 8000 + Math.random() * 4000
        const g = ctx.createGain()
        const dur = 0.04 + Math.random() * 0.08
        const vol = 0.015 + Math.random() * 0.012
        g.gain.setValueAtTime(0, now)
        g.gain.linearRampToValueAtTime(vol, now + 0.005)
        g.gain.setValueAtTime(vol * 0.6, now + dur * 0.3)
        g.gain.linearRampToValueAtTime(vol * 0.9, now + dur * 0.5)
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
        noise.connect(hp)
        hp.connect(lp)
        lp.connect(g)
        g.connect(master)
        g.connect(reverb)
        noise.start(now)
        noise.stop(now + dur + 0.02)

        // Sometimes a second crinkle follows closely — like turning a page
        if (Math.random() < 0.5) {
          const n2 = ctx.createBufferSource()
          n2.buffer = noiseBuffer
          const hp2 = ctx.createBiquadFilter()
          hp2.type = 'highpass'
          hp2.frequency.value = 4000 + Math.random() * 3000
          const g2 = ctx.createGain()
          const d2 = 0.03 + Math.random() * 0.05
          const delay = dur * 0.6 + Math.random() * 0.04
          g2.gain.setValueAtTime(0, now + delay)
          g2.gain.linearRampToValueAtTime(vol * 0.7, now + delay + 0.003)
          g2.gain.exponentialRampToValueAtTime(0.0001, now + delay + d2)
          n2.connect(hp2)
          hp2.connect(g2)
          g2.connect(master)
          g2.connect(reverb)
          n2.start(now + delay)
          n2.stop(now + delay + d2 + 0.01)
        }

      } else if (type < 0.10) {
        // Page fold / heavier paper sound — lower, longer, more body
        const noise = ctx.createBufferSource()
        noise.buffer = noiseBuffer
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = 1200 + Math.random() * 2000
        bp.Q.value = 0.8
        const g = ctx.createGain()
        const dur = 0.08 + Math.random() * 0.12
        const vol = 0.02 + Math.random() * 0.015
        g.gain.setValueAtTime(vol * 0.3, now)
        g.gain.linearRampToValueAtTime(vol, now + dur * 0.2)
        g.gain.linearRampToValueAtTime(vol * 0.5, now + dur * 0.7)
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
        noise.connect(bp)
        bp.connect(g)
        g.connect(master)
        g.connect(reverb)
        noise.start(now)
        noise.stop(now + dur + 0.02)

      } else if (type < 0.16) {
        // Soft UI ping — gentle notification tone
        const notes = [523.3, 659.3, 784, 1047, 1319]
        const freq = notes[Math.floor(Math.random() * notes.length)] * (0.7 + offsetFactor * 0.3)
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, now)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.014 + Math.random() * 0.008, now)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08 + Math.random() * 0.06)
        osc.connect(g)
        g.connect(master)
        g.connect(reverb)
        osc.start(now)
        osc.stop(now + 0.2)

      } else if (type < 0.24) {
        // Digital tick — like a hard drive or clock mechanism
        const osc = ctx.createOscillator()
        osc.type = 'square'
        osc.frequency.setValueAtTime(150 + Math.random() * 200 + offsetFactor * 80, now)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.008 + Math.random() * 0.006, now)
        g.gain.setValueAtTime(0, now + 0.002 + Math.random() * 0.002)
        osc.connect(g)
        g.connect(master)
        osc.start(now)
        osc.stop(now + 0.01)

        // Double tick sometimes
        if (Math.random() < 0.35) {
          const o2 = ctx.createOscillator()
          o2.type = 'square'
          o2.frequency.setValueAtTime(180 + Math.random() * 150, now + 0.06)
          const g2 = ctx.createGain()
          g2.gain.setValueAtTime(0.006, now + 0.06)
          g2.gain.setValueAtTime(0, now + 0.062)
          o2.connect(g2)
          g2.connect(master)
          o2.start(now + 0.06)
          o2.stop(now + 0.07)
        }

      } else if (type < 0.32) {
        // Soft data transmission — filtered sweep, like modem whisper
        const osc = ctx.createOscillator()
        osc.type = 'triangle'
        const startF = 600 + Math.random() * 800 + offsetFactor * 300
        osc.frequency.setValueAtTime(startF, now)
        osc.frequency.exponentialRampToValueAtTime(startF * (1.2 + Math.random() * 0.6), now + 0.06)
        osc.frequency.exponentialRampToValueAtTime(startF * 0.8, now + 0.12)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.01 + Math.random() * 0.008, now)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12 + Math.random() * 0.05)
        osc.connect(g)
        g.connect(reverb)
        osc.start(now)
        osc.stop(now + 0.2)

      } else if (type < 0.48) {
        // Typewriter key — BOOSTED — sharp attack, mechanical feel
        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        const freq = 800 + Math.random() * 600
        osc.frequency.setValueAtTime(freq, now)
        osc.frequency.exponentialRampToValueAtTime(freq * 0.3, now + 0.015)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.018 + Math.random() * 0.008, now)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.02)
        osc.connect(g)
        g.connect(master)
        osc.start(now)
        osc.stop(now + 0.03)
        // Mechanical return spring
        const spring = ctx.createOscillator()
        spring.type = 'sine'
        spring.frequency.setValueAtTime(2200 + Math.random() * 800, now + 0.015)
        const sg = ctx.createGain()
        sg.gain.setValueAtTime(0.005, now + 0.015)
        sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.035)
        spring.connect(sg)
        sg.connect(reverb)
        spring.start(now + 0.015)
        spring.stop(now + 0.05)

      } else if (type < 0.52) {
        // Vinyl crackle — short burst of shaped noise with warmth
        const noise = ctx.createBufferSource()
        noise.buffer = noiseBuffer
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 2000 + Math.random() * 1500
        lp.Q.value = 0.4
        const hp = ctx.createBiquadFilter()
        hp.type = 'highpass'
        hp.frequency.value = 500 + Math.random() * 500
        const g = ctx.createGain()
        const dur = 0.02 + Math.random() * 0.03
        g.gain.setValueAtTime(0.01 + Math.random() * 0.008, now)
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
        noise.connect(hp)
        hp.connect(lp)
        lp.connect(g)
        g.connect(master)
        noise.start(now)
        noise.stop(now + dur + 0.01)
        // Sometimes pop
        if (Math.random() < 0.3) {
          const pop = ctx.createOscillator()
          pop.type = 'sine'
          pop.frequency.setValueAtTime(100 + Math.random() * 80, now + dur)
          const pg = ctx.createGain()
          pg.gain.setValueAtTime(0.025, now + dur)
          pg.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.008)
          pop.connect(pg)
          pg.connect(master)
          pop.start(now + dur)
          pop.stop(now + dur + 0.015)
        }

      } else if (type < 0.56) {
        // Camera shutter — two-phase click
        const click1 = ctx.createOscillator()
        click1.type = 'square'
        click1.frequency.setValueAtTime(400, now)
        const g1 = ctx.createGain()
        g1.gain.setValueAtTime(0.015, now)
        g1.gain.setValueAtTime(0, now + 0.003)
        click1.connect(g1)
        g1.connect(master)
        click1.start(now)
        click1.stop(now + 0.005)
        // Second curtain
        const click2 = ctx.createOscillator()
        click2.type = 'square'
        click2.frequency.setValueAtTime(350, now + 0.04)
        const g2 = ctx.createGain()
        g2.gain.setValueAtTime(0.012, now + 0.04)
        g2.gain.setValueAtTime(0, now + 0.043)
        click2.connect(g2)
        g2.connect(master)
        click2.start(now + 0.04)
        click2.stop(now + 0.05)
        // Mechanical body noise between
        const body = ctx.createBufferSource()
        body.buffer = noiseBuffer
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = 1500
        bp.Q.value = 2
        const bg = ctx.createGain()
        bg.gain.setValueAtTime(0.006, now + 0.003)
        bg.gain.exponentialRampToValueAtTime(0.0001, now + 0.04)
        body.connect(bp)
        bp.connect(bg)
        bg.connect(master)
        body.start(now + 0.003)
        body.stop(now + 0.045)

      } else if (type < 0.72) {
        // Mechanical keyboard typing — clicky key presses with varying pitches
        const keyFreqs = [1800, 2100, 2400, 2700, 3000, 3300, 1500, 2000]
        const freq = keyFreqs[Math.floor(Math.random() * keyFreqs.length)] + (Math.random() - 0.5) * 400
        // Key down click — sharp square wave snap
        const osc = ctx.createOscillator()
        osc.type = 'square'
        osc.frequency.setValueAtTime(freq, now)
        osc.frequency.exponentialRampToValueAtTime(freq * 0.4, now + 0.008)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.02 + Math.random() * 0.01, now)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.015)
        osc.connect(g)
        g.connect(master)
        osc.start(now)
        osc.stop(now + 0.02)

        // Key bottom-out thud — low noise burst
        const thud = ctx.createBufferSource()
        thud.buffer = noiseBuffer
        const thudBp = ctx.createBiquadFilter()
        thudBp.type = 'bandpass'
        thudBp.frequency.value = 800 + Math.random() * 600
        thudBp.Q.value = 1.5
        const thudG = ctx.createGain()
        thudG.gain.setValueAtTime(0.012, now + 0.003)
        thudG.gain.exponentialRampToValueAtTime(0.0001, now + 0.018)
        thud.connect(thudBp)
        thudBp.connect(thudG)
        thudG.connect(master)
        thud.start(now + 0.003)
        thud.stop(now + 0.025)

        // Key up spring — high-pitched tiny click
        const upDelay = 0.025 + Math.random() * 0.02
        const upOsc = ctx.createOscillator()
        upOsc.type = 'square'
        upOsc.frequency.setValueAtTime(freq * 1.3 + Math.random() * 500, now + upDelay)
        const upG = ctx.createGain()
        upG.gain.setValueAtTime(0.008 + Math.random() * 0.005, now + upDelay)
        upG.gain.exponentialRampToValueAtTime(0.0001, now + upDelay + 0.008)
        upOsc.connect(upG)
        upG.connect(master)
        upOsc.start(now + upDelay)
        upOsc.stop(now + upDelay + 0.012)

        // Double-tap for fast typing feel — 40% chance
        if (Math.random() < 0.4) {
          const d2 = 0.06 + Math.random() * 0.04
          const freq2 = keyFreqs[Math.floor(Math.random() * keyFreqs.length)] + (Math.random() - 0.5) * 300
          const o2 = ctx.createOscillator()
          o2.type = 'square'
          o2.frequency.setValueAtTime(freq2, now + d2)
          o2.frequency.exponentialRampToValueAtTime(freq2 * 0.4, now + d2 + 0.008)
          const g2 = ctx.createGain()
          g2.gain.setValueAtTime(0.016 + Math.random() * 0.008, now + d2)
          g2.gain.exponentialRampToValueAtTime(0.0001, now + d2 + 0.015)
          o2.connect(g2)
          g2.connect(master)
          o2.start(now + d2)
          o2.stop(now + d2 + 0.02)
          // Second key thud
          const thud2 = ctx.createBufferSource()
          thud2.buffer = noiseBuffer
          const tbp2 = ctx.createBiquadFilter()
          tbp2.type = 'bandpass'
          tbp2.frequency.value = 900 + Math.random() * 500
          tbp2.Q.value = 1.2
          const tg2 = ctx.createGain()
          tg2.gain.setValueAtTime(0.01, now + d2 + 0.003)
          tg2.gain.exponentialRampToValueAtTime(0.0001, now + d2 + 0.018)
          thud2.connect(tbp2)
          tbp2.connect(tg2)
          tg2.connect(master)
          thud2.start(now + d2 + 0.003)
          thud2.stop(now + d2 + 0.025)
        }

      } else if (type < 0.76) {
        // Footsteps — short low-frequency thuds on wooden floor
        const pan = ctx.createStereoPanner()
        pan.pan.value = Math.random() < 0.3 ? (Math.random() - 0.5) * 1.6 : 0
        const dur = 0.03 + Math.random() * 0.02
        // Low thud body
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(80 + Math.random() * 40, now)
        osc.frequency.exponentialRampToValueAtTime(40, now + dur)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.02 + Math.random() * 0.01, now)
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
        osc.connect(g)
        g.connect(pan)
        pan.connect(master)
        pan.connect(reverb)
        osc.start(now)
        osc.stop(now + dur + 0.01)
        // Woody knock overtone
        const knock = ctx.createOscillator()
        knock.type = 'triangle'
        knock.frequency.setValueAtTime(350 + Math.random() * 150, now)
        knock.frequency.exponentialRampToValueAtTime(120, now + 0.015)
        const kg = ctx.createGain()
        kg.gain.setValueAtTime(0.01, now)
        kg.gain.exponentialRampToValueAtTime(0.0001, now + 0.02)
        knock.connect(kg)
        kg.connect(pan)
        knock.start(now)
        knock.stop(now + 0.03)
        // Second footstep sometimes (walking rhythm)
        if (Math.random() < 0.4) {
          const d2 = 0.12 + Math.random() * 0.08
          const osc2 = ctx.createOscillator()
          osc2.type = 'sine'
          osc2.frequency.setValueAtTime(75 + Math.random() * 35, now + d2)
          osc2.frequency.exponentialRampToValueAtTime(38, now + d2 + dur)
          const g2 = ctx.createGain()
          g2.gain.setValueAtTime(0.016 + Math.random() * 0.008, now + d2)
          g2.gain.exponentialRampToValueAtTime(0.0001, now + d2 + dur)
          osc2.connect(g2)
          g2.connect(pan)
          osc2.start(now + d2)
          osc2.stop(now + d2 + dur + 0.01)
        }

      } else if (type < 0.80) {
        // Pen on paper scratching — short high-frequency noise bursts
        const scratchCount = Math.random() < 0.4 ? (2 + Math.floor(Math.random() * 2)) : 1
        for (let s = 0; s < scratchCount; s++) {
          const delay = s * (0.03 + Math.random() * 0.02)
          const noise = ctx.createBufferSource()
          noise.buffer = noiseBuffer
          const hp = ctx.createBiquadFilter()
          hp.type = 'highpass'
          hp.frequency.value = 5000 + Math.random() * 4000
          hp.Q.value = 1.5
          const lp = ctx.createBiquadFilter()
          lp.type = 'lowpass'
          lp.frequency.value = 12000 + Math.random() * 4000
          const scratchG = ctx.createGain()
          const sDur = 0.01 + Math.random() * 0.02
          const sVol = 0.008 + Math.random() * 0.006
          scratchG.gain.setValueAtTime(0, now + delay)
          scratchG.gain.linearRampToValueAtTime(sVol, now + delay + 0.002)
          scratchG.gain.exponentialRampToValueAtTime(0.0001, now + delay + sDur)
          noise.connect(hp)
          hp.connect(lp)
          lp.connect(scratchG)
          scratchG.connect(master)
          scratchG.connect(reverb)
          noise.start(now + delay)
          noise.stop(now + delay + sDur + 0.01)
        }

      } else if (type < 0.84) {
        // Coffee cup clink — resonant metallic ping
        const freq = 3000 + Math.random() * 1000
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, now)
        osc.frequency.exponentialRampToValueAtTime(freq * 0.85, now + 0.08)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.02 + Math.random() * 0.01, now)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06 + Math.random() * 0.04)
        osc.connect(g)
        g.connect(master)
        g.connect(reverb)
        osc.start(now)
        osc.stop(now + 0.15)
        // Harmonic overtone for ceramic ring
        const harm = ctx.createOscillator()
        harm.type = 'sine'
        harm.frequency.setValueAtTime(freq * 2.3, now)
        harm.frequency.exponentialRampToValueAtTime(freq * 1.8, now + 0.05)
        const hg = ctx.createGain()
        hg.gain.setValueAtTime(0.008, now)
        hg.gain.exponentialRampToValueAtTime(0.0001, now + 0.04)
        harm.connect(hg)
        hg.connect(master)
        harm.start(now)
        harm.stop(now + 0.08)

      } else if (type < 0.93) {
        // Mouse click — two-phase press + release
        const clickOsc = ctx.createOscillator()
        clickOsc.type = 'square'
        clickOsc.frequency.setValueAtTime(2500 + Math.random() * 500, now)
        clickOsc.frequency.exponentialRampToValueAtTime(800, now + 0.003)
        const clickG = ctx.createGain()
        clickG.gain.setValueAtTime(0.015 + Math.random() * 0.008, now)
        clickG.gain.setValueAtTime(0, now + 0.004)
        clickOsc.connect(clickG)
        clickG.connect(master)
        clickOsc.start(now)
        clickOsc.stop(now + 0.006)
        const relDelay = 0.03 + Math.random() * 0.02
        const relOsc = ctx.createOscillator()
        relOsc.type = 'square'
        relOsc.frequency.setValueAtTime(2200 + Math.random() * 400, now + relDelay)
        relOsc.frequency.exponentialRampToValueAtTime(700, now + relDelay + 0.003)
        const relG = ctx.createGain()
        relG.gain.setValueAtTime(0.01 + Math.random() * 0.005, now + relDelay)
        relG.gain.setValueAtTime(0, now + relDelay + 0.003)
        relOsc.connect(relG)
        relG.connect(master)
        relOsc.start(now + relDelay)
        relOsc.stop(now + relDelay + 0.005)

      } else {
        // Cough — breathy noise burst with vocal resonance, rare
        const cNoise = ctx.createBufferSource()
        cNoise.buffer = noiseBuffer
        // Throat resonance
        const throat = ctx.createBiquadFilter()
        throat.type = 'bandpass'
        throat.frequency.value = 500 + Math.random() * 300
        throat.Q.value = 3
        // Upper airway
        const upper = ctx.createBiquadFilter()
        upper.type = 'bandpass'
        upper.frequency.value = 2000 + Math.random() * 1000
        upper.Q.value = 2
        const cMix = ctx.createGain()
        const cG1 = ctx.createGain()
        cG1.gain.value = 0.7
        const cG2 = ctx.createGain()
        cG2.gain.value = 0.3
        // Cough envelope — sharp attack, quick decay, sometimes double
        const cGain = ctx.createGain()
        cGain.gain.setValueAtTime(0, now)
        cGain.gain.linearRampToValueAtTime(0.06, now + 0.01)
        cGain.gain.exponentialRampToValueAtTime(0.02, now + 0.06)
        cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
        cNoise.connect(throat)
        cNoise.connect(upper)
        throat.connect(cG1)
        upper.connect(cG2)
        cG1.connect(cMix)
        cG2.connect(cMix)
        cMix.connect(cGain)
        cGain.connect(master)
        cGain.connect(reverb)
        cNoise.start(now)
        cNoise.stop(now + 0.2)
        // Sometimes a second smaller cough follows
        if (Math.random() < 0.4) {
          const c2 = ctx.createBufferSource()
          c2.buffer = noiseBuffer
          const t2 = ctx.createBiquadFilter()
          t2.type = 'bandpass'
          t2.frequency.value = 600 + Math.random() * 200
          t2.Q.value = 2.5
          const g2 = ctx.createGain()
          g2.gain.setValueAtTime(0, now + 0.2)
          g2.gain.linearRampToValueAtTime(0.03, now + 0.21)
          g2.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
          c2.connect(t2)
          t2.connect(g2)
          g2.connect(master)
          g2.connect(reverb)
          c2.start(now + 0.2)
          c2.stop(now + 0.35)
        }
      }
    }

    // Keep interval ref for cleanup compatibility
    const speedCheck = setInterval(() => {}, 5000)

    return () => {
      window.removeEventListener('click', resumeAudio)
      window.removeEventListener('touchstart', resumeAudio)
      window.removeEventListener('keydown', resumeAudio)
      loopRunning = false
      padOscs.forEach(o => { try { o.stop() } catch {} })
      padOscsRef.current = []
      try { vinylNoise.stop() } catch {}
      clearInterval(muffleUpdate)
      if (ambientInterval) clearInterval(ambientInterval)
      clearInterval(ambientCheck)
      clearInterval(speedCheck)
      if (dropIntervalRef.current) {
        clearInterval(dropIntervalRef.current)
        dropIntervalRef.current = null
      }
      master.disconnect()
    }
  }, [audioOn])


  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close()
        audioCtxRef.current = null
      }
    }
  }, [])

  const handleLoaderComplete = useCallback(() => {
    if (loaderTarget) {
      router.push(loaderTarget)
      // Keep loader visible during navigation — hide after a delay to cover the route change
      setTimeout(() => {
        setShowLoader(false)
        setLoaderTarget(null)
      }, 600)
    } else {
      setShowLoader(false)
      setLoaderTarget(null)
    }
  }, [loaderTarget, router])

  const pageBg = dark ? '#0a0a0a' : '#ffffff'
  const footerBorder = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.9)'
  const footerMuted = dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'

  return (
    <PageTransition>
      <div style={{ background: pageBg, color: fg, minHeight: '100vh' }}>
        <main ref={mainRef} className="relative h-screen" style={{ overflow: 'hidden', cursor: 'grab' }}>

          {/* Counters — below header, in corners */}
          <span
            className="fixed left-[10px] text-[8px] font-mono font-bold tracking-tight select-none pointer-events-none"
            style={{ color: fg, opacity: 0.2, zIndex: 60, top: '70px' }}
          >
            [visits: {visitCount}]
          </span>
          <span
            className="fixed right-[10px] text-[8px] font-mono font-bold tracking-tight select-none pointer-events-none"
            style={{ color: fg, opacity: 0.2, zIndex: 60, top: '70px' }}
          >
            [Lovers: {heartCount}]
          </span>

          {/* Pink flash overlay on heart press */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              zIndex: 300,
              background: 'radial-gradient(ellipse at center, rgba(255,105,180,0.25) 0%, rgba(255,20,147,0.08) 50%, transparent 80%)',
              opacity: pinkFlash ? 1 : 0,
              transition: pinkFlash ? 'opacity 0.05s ease-out' : 'opacity 0.4s ease-out',
            }}
          />

          {/* LOVER BOY text on every 15th heart click */}
          <div
            className="fixed inset-0 flex items-center justify-center pointer-events-none"
            style={{
              zIndex: 400,
              opacity: showLover ? 1 : 0,
              transition: showLover ? 'opacity 0.05s ease-out' : 'opacity 0.6s ease-out',
            }}
          >
            <span
              className="font-black uppercase italic"
              style={{
                fontSize: 'clamp(3rem, 12vw, 10rem)',
                color: 'rgba(255, 80, 130, 0.9)',
                textShadow: '0 0 80px rgba(255,105,180,0.6), 0 0 160px rgba(255,105,180,0.3)',
                letterSpacing: '-0.03em',
                transform: showLover ? 'scale(1)' : 'scale(0.85)',
                transition: showLover ? 'transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'transform 0.6s ease-out',
                whiteSpace: 'nowrap',
              }}
            >
              LOVER BOY
            </span>
          </div>

          {/* "Shhh" text when audio turned off */}
          <div
            className="fixed inset-0 flex items-center justify-center pointer-events-none"
            style={{
              zIndex: 400,
              opacity: showShhh ? 1 : 0,
              transition: showShhh ? 'opacity 0.05s ease-out' : 'opacity 0.5s ease-out',
            }}
          >
            <span
              className="font-black uppercase italic"
              style={{
                fontSize: 'clamp(4rem, 16vw, 14rem)',
                color: 'rgba(255, 105, 180, 0.85)',
                textShadow: '0 0 80px rgba(255,105,180,0.5), 0 0 160px rgba(255,105,180,0.25)',
                letterSpacing: '0.08em',
                transform: showShhh ? 'scale(1)' : 'scale(0.9)',
                transition: showShhh ? 'transform 0.1s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'transform 0.5s ease-out',
              }}
            >
              SHHH
            </span>
          </div>

          {/* Ripple effect on heart press */}
          {rippleActive && (
            <div
              className="absolute pointer-events-none ripple-ring"
              style={{
                zIndex: 299,
                left: '50%',
                bottom: '60px',
                transform: 'translate(-50%, 50%)',
                borderRadius: '50%',
                border: `2px solid ${dark ? 'rgba(255,105,180,0.3)' : 'rgba(255,105,180,0.2)'}`,
              }}
            />
          )}

          <canvas
            ref={dotCanvasRef}
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 100 }}
          />

          <div className="absolute inset-0 flex items-center justify-center">


            {/* All 8 cards */}
            {Array.from({ length: NUM_CARDS }, (_, i) => {
              const videoSrc = localVideos[i % localVideos.length]
              const project = featuredProjects[cardProjectMap[i]]

              return (
                <div
                  key={i}
                  data-card
                  data-slug={project.slug}
                  ref={(el) => { cardRefs.current[i] = el }}
                  className="absolute group"
                  onMouseEnter={() => {
                    setHoveredCard(i)
                    // Unmute this card's video (muffled — volume 15%)
                    const vid = document.getElementById(`vid-card-${i}`) as HTMLVideoElement
                    if (vid) {
                      vid.muted = false
                      vid.volume = 0.15
                    }
                  }}
                  onMouseLeave={() => {
                    setHoveredCard(null)
                    // Re-mute on leave
                    const vid = document.getElementById(`vid-card-${i}`) as HTMLVideoElement
                    if (vid) {
                      vid.muted = true
                    }
                  }}
                  style={{
                    borderRadius: '14px',
                    overflow: 'hidden',
                    transition: 'transform 0.1s ease-out, box-shadow 0.25s ease-out',
                    cursor: 'pointer',
                    border: dark
                      ? '1.5px solid rgba(255,255,255,0.25)'
                      : '1.5px solid rgba(255,255,255,0.6)',
                  }}
                >
                  <video
                    id={`vid-card-${i}`}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    src={videoSrc}
                  />
                  {/* Liquid glass inner highlight */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      zIndex: 11,
                      borderRadius: '13px',
                      boxShadow: dark
                        ? 'inset 0 1px 1px rgba(255,255,255,0.15), inset 0 -1px 1px rgba(255,255,255,0.05)'
                        : 'inset 0 1px 2px rgba(255,255,255,0.5), inset 0 -1px 1px rgba(255,255,255,0.15)',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 30%, transparent 80%, rgba(255,255,255,0.06) 100%)',
                    }}
                  />
                  <div className="absolute inset-0 z-10 cursor-pointer card-click-zone" />
                  {/* Hover title overlay */}
                  <div
                    className="absolute inset-0 flex items-end justify-start p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                    style={{ zIndex: 12, background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)' }}
                  >
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider leading-tight"
                      style={{ color: 'rgba(255,255,255,0.85)' }}
                    >
                      {project.client}
                    </span>
                  </div>
                </div>
              )
            })}

            {/* Person — centered */}
            <div
              className="relative pointer-events-none"
              style={{
                width: 'min(483px, 43.7vw)',
                height: 'min(621px, 71.3vh)',
                zIndex: 50,
                marginTop: '3vh',
              }}
            >
              <Image
                src={dark ? "/placeholder/chair-person-dark.png" : "/placeholder/chair-person.png"}
                alt="Jordan Carter"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>

          {/* Heart button with flanking counters — bottom center */}
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4"
            style={{ zIndex: 201 }}
          >
            {/* Heart */}
            <div
              data-heart
              className="cursor-pointer select-none"
              onMouseEnter={() => setHeartHovered(true)}
              onMouseLeave={() => setHeartHovered(false)}
              onClick={(e) => {
                spawnHearts()
                setHeartCount(c => {
                  const next = c + 1
                  nextLoverRef.current--
                  if (nextLoverRef.current <= 0) {
                    setShowLover(true)
                    setTimeout(() => setShowLover(false), 800)
                    nextLoverRef.current = 4 + Math.floor(Math.random() * 12) // 4–15
                  }
                  return next
                })
                playHeartSound()
                setPinkFlash(true)
                setTimeout(() => setPinkFlash(false), 400)
                slowdownRef.current = 0.1
                setRippleActive(true)
                setTimeout(() => setRippleActive(false), 800)
                const el = e.currentTarget.firstChild as HTMLElement
                if (el) {
                  el.style.transition = 'transform 0.08s ease-out'
                  el.style.transform = 'scale(2.2)'
                  setTimeout(() => {
                    el.style.transition = 'transform 0.15s ease-out'
                    el.style.transform = 'scale(0.6)'
                    setTimeout(() => {
                      el.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                      el.style.transform = heartHovered ? 'scale(1.15)' : 'scale(1)'
                    }, 150)
                  }, 80)
                }
              }}
            >
              <div
                style={{
                  fontSize: '68px',
                  lineHeight: '1',
                  transition: 'transform 0.2s ease-out',
                  transform: heartHovered ? 'scale(1.15)' : 'scale(1)',
                  filter: heartHovered ? 'drop-shadow(0 0 20px rgba(220,40,60,0.7)) drop-shadow(0 0 40px rgba(220,40,60,0.3))' : 'drop-shadow(0 0 6px rgba(220,40,60,0.3))',
                  animation: heartHovered ? 'heartbeat 0.6s ease-in-out infinite' : 'none',
                }}
              >
                ❤️
              </div>
            </div>

          </div>

          {/* Vertical offset slider — bottom left */}
          <div
            data-slider
            className="absolute bottom-6 left-6 flex items-center gap-3"
            style={{ zIndex: 200 }}
          >
            <span className="text-[9px] uppercase tracking-widest font-bold opacity-40" style={{ color: fg }}>Offset</span>
            <input
              type="range"
              min={0}
              max={100}
              value={sliderVertical}
              onChange={(e) => setSliderVertical(Number(e.target.value))}
              className="w-28 h-[2px] appearance-none rounded-full cursor-pointer"
              style={{
                background: dark
                  ? `linear-gradient(to right, rgba(255,255,255,0.5) ${sliderVertical}%, rgba(255,255,255,0.15) ${sliderVertical}%)`
                  : `linear-gradient(to right, rgba(0,0,0,0.5) ${sliderVertical}%, rgba(0,0,0,0.12) ${sliderVertical}%)`,
                accentColor: dark ? '#fff' : '#000',
              }}
            />
            <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 w-6 text-right tabular-nums" style={{ color: fg }}>{sliderVertical}%</span>
          </div>

          {/* Speed slider — bottom right */}
          <div
            data-slider
            className="absolute bottom-6 right-6 flex items-center gap-3"
            style={{ zIndex: 200 }}
          >
            <span className="text-[9px] uppercase tracking-widest font-bold opacity-40" style={{ color: fg }}>Speed</span>
            <input
              type="range"
              min={0}
              max={100}
              value={sliderSpeed}
              onChange={(e) => setSliderSpeed(Number(e.target.value))}
              className="w-28 h-[2px] appearance-none rounded-full cursor-pointer"
              style={{
                background: dark
                  ? `linear-gradient(to right, rgba(255,255,255,0.5) ${sliderSpeed}%, rgba(255,255,255,0.15) ${sliderSpeed}%)`
                  : `linear-gradient(to right, rgba(0,0,0,0.5) ${sliderSpeed}%, rgba(0,0,0,0.12) ${sliderSpeed}%)`,
                accentColor: dark ? '#fff' : '#000',
              }}
            />
            <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 w-6 text-right tabular-nums" style={{ color: fg }}>{(1 + (sliderSpeed / 100) * 3).toFixed(1)}×</span>
          </div>
        </main>

        {/* Footer */}
        <footer className="px-6 md:px-10 py-5 relative z-[200]" style={{ borderTop: `3px solid ${footerBorder}` }}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-3 flex-shrink-0">
              <button onClick={() => setShowEmail(true)} className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${footerBorder}` }}>Email</button>
              <a href="https://instagram.com/jordanscarter" target="_blank" rel="noopener noreferrer" className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${footerBorder}` }}>Insta</a>
            </div>
            <p className="hidden md:block text-[9px] leading-[1.5] tracking-[0.04em] uppercase max-w-2xl text-center" style={{ color: footerMuted }}>
              [PLACEHOLDER] — A multidisciplinary creative practice spanning motion design, 3D environments, generative art, and illustration. Building visual systems that feel alive and unmistakably human.
            </p>
            <div className="flex gap-3 flex-shrink-0">
              <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="w-14 h-14 rounded-full flex items-center justify-center text-[16px] hover:scale-105 transition-transform" style={{ border: `1.5px solid ${footerBorder}` }} aria-label="Back to top">↑</button>
              <button onClick={() => setShowAdmin(true)} className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${footerBorder}`, color: footerMuted }}>© 2026</button>
            </div>
          </div>
        </footer>
      </div>
      <PageLoader show={showLoader} onComplete={handleLoaderComplete} />
      <EmailPopup show={showEmail} onClose={() => setShowEmail(false)} />
      <AdminPortal show={showAdmin} onClose={() => setShowAdmin(false)} />
    </PageTransition>
  )
}
