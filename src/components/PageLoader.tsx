'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface PageLoaderProps {
  show: boolean
  onComplete?: () => void
  /**
   * 'transition' (default) — the original behaviour. Auto-runs cover → hold
   *   → reveal once `show` goes true; fires onComplete at the start of reveal
   *   so the parent can navigate while the circles shrink away.
   *
   * 'data'       — covers the screen while `show` stays true. When `show`
   *   goes false the loader plays its reveal-and-fade-out animation. Used
   *   for "wait for media to load" overlays where the duration is unknown.
   */
  mode?: 'transition' | 'data'
}

const COLS = 12
const ROWS = 8
const TOTAL = COLS * ROWS

export default function PageLoader({ show, onComplete, mode = 'transition' }: PageLoaderProps) {
  const [phase, setPhase] = useState<'idle' | 'cover' | 'hold' | 'reveal' | 'done'>('idle')
  const completedRef = useRef(false)

  // Pick one random non-edge circle to be red.
  const redIndex = useMemo(() => {
    if (!show) return -1
    const inner: number[] = []
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        inner.push(r * COLS + c)
      }
    }
    return inner[Math.floor(Math.random() * inner.length)]
  }, [show])

  // -------------- transition mode --------------
  useEffect(() => {
    if (mode !== 'transition') return
    if (!show) {
      setPhase('idle')
      completedRef.current = false
      return
    }
    completedRef.current = false
    setPhase('cover')
    const coverTime = (COLS + ROWS) * 12 + 180
    const t1 = setTimeout(() => setPhase('hold'), coverTime)
    return () => clearTimeout(t1)
  }, [show, mode])

  useEffect(() => {
    if (mode !== 'transition') return
    if (phase !== 'hold') return
    const t = setTimeout(() => setPhase('reveal'), 250)
    return () => clearTimeout(t)
  }, [phase, mode])

  useEffect(() => {
    if (mode !== 'transition') return
    if (phase !== 'reveal') return
    if (!completedRef.current) {
      completedRef.current = true
      onComplete?.()
    }
    const revealTime = (COLS + ROWS) * 12 + 200
    const t = setTimeout(() => setPhase('done'), revealTime)
    return () => clearTimeout(t)
  }, [phase, onComplete, mode])

  // -------------- data mode --------------
  // Cover while show=true, reveal when show=false.
  useEffect(() => {
    if (mode !== 'data') return
    if (show) {
      // Either first mount or returning after a previous reveal — kick to cover.
      if (phase === 'idle' || phase === 'reveal' || phase === 'done') setPhase('cover')
    } else {
      // Parent says "data ready" — animate the reveal then finish.
      if (phase === 'cover' || phase === 'hold') setPhase('reveal')
    }
  }, [show, mode, phase])

  useEffect(() => {
    if (mode !== 'data') return
    if (phase !== 'reveal') return
    if (!completedRef.current) {
      completedRef.current = true
      onComplete?.()
    }
    const revealTime = (COLS + ROWS) * 12 + 200
    const t = setTimeout(() => setPhase('done'), revealTime)
    return () => clearTimeout(t)
  }, [phase, onComplete, mode])

  if (phase === 'idle') return null
  if (phase === 'done' && !show) return null

  const growing = phase === 'cover' || phase === 'hold'

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          key="loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.08 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: '#ffffff',
            overflow: 'hidden',
          }}
        >
          {/* Grid of circles — half of them get an X inside (checkerboard
              pattern: (row+col) even = X). The X is rendered as an SVG with
              a white stroke so it reads against both the black and red fills. */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              gridTemplateColumns: `repeat(${COLS}, 1fr)`,
              gridTemplateRows: `repeat(${ROWS}, 1fr)`,
              placeItems: 'center',
              padding: '2vmin',
            }}
          >
            {Array.from({ length: TOTAL }, (_, i) => {
              const row = Math.floor(i / COLS)
              const col = i % COLS
              const stagger = (row + col) * 0.012
              const isRed = i === redIndex
              const hasX = (row + col) % 2 === 0

              return (
                <motion.div
                  key={i}
                  initial={{ scale: 0 }}
                  animate={{ scale: growing ? 1 : 0 }}
                  transition={{
                    duration: 0.18,
                    delay: stagger,
                    ease: growing ? [0.34, 1.2, 0.64, 1] : [0.55, 0, 1, 0.45],
                  }}
                  style={{
                    width: '65%',
                    aspectRatio: '1',
                    borderRadius: '50%',
                    background: isRed ? '#e53e3e' : '#000000',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {hasX && (
                    <svg
                      viewBox="0 0 10 10"
                      width="42%"
                      height="42%"
                      style={{
                        stroke: '#ffffff',
                        strokeWidth: 1.6,
                        strokeLinecap: 'round',
                        fill: 'none',
                      }}
                      aria-hidden="true"
                    >
                      <path d="M2 2 L8 8 M8 2 L2 8" />
                    </svg>
                  )}
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
