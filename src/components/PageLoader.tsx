'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface PageLoaderProps {
  show: boolean
  onComplete?: () => void
  /**
   * 'transition' (default) — runs the full animation once: grow → split →
   *   brief hold → reveal → fade. onComplete fires at the start of reveal
   *   so the parent can navigate while the flips play.
   * 'data' — grows → splits → holds on the 4 black circles for as long as
   *   `show` stays true. When `show` goes false, runs the reveal flips and
   *   fades out.
   */
  mode?: 'transition' | 'data'
}

const LETTERS = ['X', 'O', 'X', 'O'] as const
const CIRCLE_SIZE = 88
const GAP = 28
const COUNT = LETTERS.length
const TOTAL_WIDTH = CIRCLE_SIZE * COUNT + GAP * (COUNT - 1)
const CENTER_X = (TOTAL_WIDTH - CIRCLE_SIZE) / 2

type Phase = 'idle' | 'grow' | 'split' | 'hold' | 'reveal' | 'done'

export default function PageLoader({ show, onComplete, mode = 'transition' }: PageLoaderProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const completedRef = useRef(false)
  // Viewport-based scale so the row of circles always fits on screen with a
  // sensible margin — pure CSS scaling instead of recomputing the layout.
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const update = () => {
      if (typeof window === 'undefined') return
      const w = window.innerWidth
      const margin = 60
      setScale(Math.min(1, Math.max(0.4, (w - margin * 2) / TOTAL_WIDTH)))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Kick off the animation as soon as `show` is true.
  useEffect(() => {
    if (show && (phase === 'idle' || phase === 'done')) {
      completedRef.current = false
      setPhase('grow')
    }
  }, [show, phase])

  // Auto-progress the early phases. Hold is the branch point — in
  // transition mode we auto-advance after a short pause; in data mode we
  // wait for `show` to go false.
  useEffect(() => {
    if (phase === 'grow') {
      const t = setTimeout(() => setPhase('split'), 320)
      return () => clearTimeout(t)
    }
    if (phase === 'split') {
      const t = setTimeout(() => setPhase('hold'), 520)
      return () => clearTimeout(t)
    }
    if (phase === 'hold' && mode === 'transition') {
      const t = setTimeout(() => setPhase('reveal'), 220)
      return () => clearTimeout(t)
    }
    if (phase === 'reveal') {
      // Total reveal time = staggered start of last flip + its duration.
      const t = setTimeout(() => setPhase('done'), (COUNT - 1) * 150 + 520 + 320)
      return () => clearTimeout(t)
    }
    return undefined
  }, [phase, mode])

  // Data mode: when the parent says "done", trigger the reveal flips and
  // exit. If we're still mid-grow/split when this happens, we let the
  // current phase keep running visually — `reveal` will fire from `hold`.
  useEffect(() => {
    if (mode !== 'data') return
    if (!show && phase === 'hold') setPhase('reveal')
  }, [show, phase, mode])

  // onComplete fires once, at the start of the reveal — that's the right
  // moment for a parent route to start navigating (the loader stays up
  // through the flips and the fade).
  useEffect(() => {
    if (phase === 'reveal' && !completedRef.current) {
      completedRef.current = true
      onComplete?.()
    }
  }, [phase, onComplete])

  if (phase === 'idle') return null
  if (phase === 'done' && !show) return null

  // After the early returns, phase is one of grow|split|hold|reveal|done —
  // all of which mean the loader is rendering, so isVisible is constant.
  const isVisible = true
  const isSplit = phase === 'split' || phase === 'hold' || phase === 'reveal'
  const shouldReveal = phase === 'reveal'

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          key="loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: TOTAL_WIDTH,
              height: CIRCLE_SIZE,
              transform: `scale(${scale})`,
              transformOrigin: 'center',
            }}
          >
            {LETTERS.map((letter, i) => {
              const finalX = i * (CIRCLE_SIZE + GAP)
              return (
                <motion.div
                  key={i}
                  initial={{ x: CENTER_X, scale: 0 }}
                  animate={{
                    x: isSplit ? finalX : CENTER_X,
                    scale: isVisible ? 1 : 0,
                  }}
                  transition={{
                    x: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
                    scale: { duration: 0.32, ease: [0.34, 1.5, 0.64, 1] },
                  }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: CIRCLE_SIZE,
                    height: CIRCLE_SIZE,
                    perspective: 600,
                  }}
                >
                  {/* The flip: rotate the inner wrapper 180° on Y. The two
                      faces use backfaceVisibility: hidden so the visible
                      face cleanly swaps at the 90° crossover. */}
                  <motion.div
                    animate={{ rotateY: shouldReveal ? 180 : 0 }}
                    transition={{
                      duration: 0.52,
                      delay: shouldReveal ? i * 0.15 : 0,
                      ease: [0.4, 0, 0.2, 1],
                    }}
                    style={{
                      width: '100%',
                      height: '100%',
                      position: 'relative',
                      transformStyle: 'preserve-3d',
                    }}
                  >
                    {/* Front face — solid black circle, no letter. */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        background: '#000',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                      }}
                    />
                    {/* Back face — same black circle with the letter on
                        top. Pre-rotated 180° so its content reads
                        right-way-up once the parent has flipped. */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        background: '#000',
                        color: '#fff',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      aria-hidden="true"
                    >
                      {letter === 'X' ? (
                        <svg viewBox="0 0 60 60" width="58%" height="58%">
                          <path
                            d="M14 14 L46 46 M46 14 L14 46"
                            stroke="white"
                            strokeWidth="7"
                            strokeLinecap="round"
                            fill="none"
                          />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 60 60" width="58%" height="58%">
                          <circle
                            cx="30"
                            cy="30"
                            r="16"
                            stroke="white"
                            strokeWidth="7"
                            fill="none"
                          />
                        </svg>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
