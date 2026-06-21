'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface PageLoaderProps {
  show: boolean
  onComplete?: () => void
  /**
   * 'transition' (default) — runs the full animation once: grow → split →
   *   brief hold → reveal (XOXO flips) → whiten (each circle rotates again
   *   to a white face, in order) → fade. onComplete fires at the start of
   *   reveal so the parent can navigate while the rest of the moment plays.
   * 'data' — grows → splits → holds on the 4 black circles for as long as
   *   `show` stays true. When `show` goes false, runs reveal → whiten →
   *   fade and exits.
   */
  mode?: 'transition' | 'data'
}

const LETTERS = ['X', 'O', 'X', 'O'] as const
// Circle + gap dimensions. Original was 88 / 28; the row felt too big in
// the viewport, so this is dialed down ~40% across the board.
const CIRCLE_SIZE = 53
const GAP = 17
const COUNT = LETTERS.length
const TOTAL_WIDTH = CIRCLE_SIZE * COUNT + GAP * (COUNT - 1)
const CENTER_X = (TOTAL_WIDTH - CIRCLE_SIZE) / 2

// Rotation animation constants — kept short so the whole sequence stays
// under ~3 seconds.
const FLIP_DURATION_S = 0.42
const STAGGER_S = 0.13
const PHASE_MS = (COUNT - 1) * STAGGER_S * 1000 + FLIP_DURATION_S * 1000

type Phase = 'idle' | 'grow' | 'split' | 'hold' | 'reveal' | 'whiten' | 'done'

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
      // Reveal takes the staggered last-circle-finish time + a small
      // buffer so the whiten flips don't overlap visually.
      const t = setTimeout(() => setPhase('whiten'), PHASE_MS + 120)
      return () => clearTimeout(t)
    }
    if (phase === 'whiten') {
      // Same shape as reveal — each circle rotates another 180° to its
      // white face, in order. Then fade out.
      const t = setTimeout(() => setPhase('done'), PHASE_MS + 80)
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
  // moment for a parent route to start navigating. The loader keeps
  // playing through whiten + fade while the new page mounts underneath.
  useEffect(() => {
    if (phase === 'reveal' && !completedRef.current) {
      completedRef.current = true
      onComplete?.()
    }
  }, [phase, onComplete])

  if (phase === 'idle') return null
  if (phase === 'done' && !show) return null

  const isSplit = phase === 'split' || phase === 'hold' || phase === 'reveal' || phase === 'whiten'
  // Rotation target — 0° (front, black) for early phases, 180° for reveal
  // (back, X/O), 360° for whiten/done (front again, but recoloured white).
  const rotationTarget =
    phase === 'whiten' || phase === 'done' ? 360 :
    phase === 'reveal' ? 180 :
    0
  // Front face flips to white during the whiten phase. Each circle's
  // colour swap is delayed to roughly the rotation midpoint so the change
  // happens while the face is edge-on (and visually hidden).
  const isWhitened = phase === 'whiten' || phase === 'done'
  const rotationStaggered = phase === 'reveal' || phase === 'whiten'

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
                    scale: 1,
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
                  {/* The flip: rotate the inner wrapper on Y. Reveal takes
                      it to 180° (back with X/O); whiten continues to 360°
                      (front face, now recoloured white). */}
                  <motion.div
                    animate={{ rotateY: rotationTarget }}
                    transition={{
                      duration: FLIP_DURATION_S,
                      delay: rotationStaggered ? i * STAGGER_S : 0,
                      ease: [0.4, 0, 0.2, 1],
                    }}
                    style={{
                      width: '100%',
                      height: '100%',
                      position: 'relative',
                      transformStyle: 'preserve-3d',
                    }}
                  >
                    {/* Front face — black during reveal, swaps to white
                        during whiten. The color change is scheduled at
                        ~40% through the flip so it lands while the face
                        is edge-on (invisible) and the user only sees the
                        final white when it rotates back into view. */}
                    <motion.div
                      initial={{ backgroundColor: '#000000' }}
                      animate={{ backgroundColor: isWhitened ? '#ffffff' : '#000000' }}
                      transition={{
                        delay: isWhitened ? i * STAGGER_S + FLIP_DURATION_S * 0.4 : 0,
                        duration: 0.05,
                      }}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                      }}
                    />
                    {/* Back face — black circle with the letter. Pre-rotated
                        180° so its content reads right-way-up once the
                        wrapper has flipped. */}
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
