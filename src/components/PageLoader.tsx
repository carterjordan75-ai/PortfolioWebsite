'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDarkMode } from '@/contexts/DarkModeContext'

interface PageLoaderProps {
  show: boolean
  onComplete?: () => void
  /**
   * 'transition' (default) — runs the full animation once: grow → split →
   *   brief hold → reveal (XOXO flips) → revealHold (XOXO sits on screen)
   *   → collapse (4 circles converge back to centre, rotation back to
   *   front, scaled down — reading as one dot) → drop (that dot falls
   *   off the bottom) → fade. onComplete fires at the start of reveal
   *   so the parent can navigate while the rest of the moment plays.
   * 'data' — grows → splits → holds on the 4 black circles for as long as
   *   `show` stays true. When `show` goes false, runs reveal →
   *   revealHold → collapse → drop → fade and exits.
   */
  mode?: 'transition' | 'data'
}

const LETTERS = ['X', 'O', 'X', 'O'] as const
// One fill colour per circle — the first four of the site's index-page
// hover palette, so the loader speaks the same colour language.
const FILL_COLORS = ['#e94560', '#ff6b35', '#00b4d8', '#7209b7'] as const
// Circle + gap dimensions. Original was 88 / 28; the row felt too big in
// the viewport, so this is dialed down ~40% across the board.
const CIRCLE_SIZE = 53
const GAP = 17
const COUNT = LETTERS.length
const TOTAL_WIDTH = CIRCLE_SIZE * COUNT + GAP * (COUNT - 1)
const CENTER_X = (TOTAL_WIDTH - CIRCLE_SIZE) / 2

// Animation timing constants — kept short so the whole sequence stays
// under ~3 seconds.
const FLIP_DURATION_S = 0.42
const STAGGER_S = 0.13
const PHASE_MS = (COUNT - 1) * STAGGER_S * 1000 + FLIP_DURATION_S * 1000

// How long XOXO stays visible after the reveal flips finish, before the
// drop kicks in. Short enough not to drag, long enough to register as a
// brand moment.
const REVEAL_HOLD_MS = 520

// Collapse animation — the 4 circles converge back to the centre and
// shrink so the row reads as one compact dot before the drop.
const COLLAPSE_DURATION_S = 0.5
const COLLAPSE_PHASE_MS = COLLAPSE_DURATION_S * 1000

// Drop animation — the (now single-dot) stack falls off the bottom of
// the viewport with a gravity-feeling ease.
const DROP_DURATION_S = 0.55
const DROP_PHASE_MS = DROP_DURATION_S * 1000

type Phase = 'idle' | 'grow' | 'split' | 'hold' | 'reveal' | 'revealHold' | 'collapse' | 'drop' | 'done'

export default function PageLoader({ show, onComplete, mode = 'transition' }: PageLoaderProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const completedRef = useRef(false)
  // Site-wide dark mode — flips the loader from white/black to black/white
  // (background + circles + glyphs). Anchored to the same context the rest
  // of the site uses, so a user who's saved dark mode sees a dark loader
  // on Index / Misc / Look, and the always-light home page gets a light
  // loader regardless of stored preference.
  const { dark } = useDarkMode()
  const bg = dark ? '#0a0a0a' : '#ffffff'
  // Wireframe ring colour for the un-filled entrance state — black rings
  // on the light loader, white rings on the dark one.
  const ringColor = dark ? '#ffffff' : '#000000'
  // Viewport-based scale so the row of circles always fits on screen with a
  // sensible margin — pure CSS scaling instead of recomputing the layout.
  const [scale, setScale] = useState(1)
  // Distance each circle has to translate to clear the bottom edge of the
  // viewport. We use viewport-height + a buffer so the circles fully exit
  // even with the parent transform: scale() in play.
  const [dropDistance, setDropDistance] = useState(900)
  useEffect(() => {
    const update = () => {
      if (typeof window === 'undefined') return
      const w = window.innerWidth
      const h = window.innerHeight
      const margin = 60
      setScale(Math.min(1, Math.max(0.4, (w - margin * 2) / TOTAL_WIDTH)))
      setDropDistance(h + 120)
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
      // Reveal takes the staggered last-circle-finish time. We then sit on
      // 'revealHold' so XOXO is visible as a brand beat before the drop.
      const t = setTimeout(() => setPhase('revealHold'), PHASE_MS + 80)
      return () => clearTimeout(t)
    }
    if (phase === 'revealHold') {
      const t = setTimeout(() => setPhase('collapse'), REVEAL_HOLD_MS)
      return () => clearTimeout(t)
    }
    if (phase === 'collapse') {
      // After the converge, hold a tiny beat on the dot before dropping
      // so the singular-dot read registers.
      const t = setTimeout(() => setPhase('drop'), COLLAPSE_PHASE_MS + 140)
      return () => clearTimeout(t)
    }
    if (phase === 'drop') {
      // Single-dot drop — no stagger, all 4 stacked circles fall together
      // and read as one element exiting the viewport.
      const t = setTimeout(() => setPhase('done'), DROP_PHASE_MS + 80)
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
  // playing through revealHold + drop + fade while the new page mounts
  // underneath.
  useEffect(() => {
    if (phase === 'reveal' && !completedRef.current) {
      completedRef.current = true
      onComplete?.()
    }
  }, [phase, onComplete])

  if (phase === 'idle') return null
  if (phase === 'done' && !show) return null

  // Circles are "split" (spread apart) from the split phase through the
  // revealHold beat. During collapse they slide back to CENTER_X so the
  // stack reads as a single dot before the drop.
  const isSplit = phase === 'split' || phase === 'hold' || phase === 'reveal' || phase === 'revealHold'
  // Rotation target — 0° while the wireframe rings are in, then 180°
  // from reveal onward and it STAYS there: the flip is the "fill"
  // moment (wireframe ring → solid colour + letter), and the colour
  // rides through collapse + drop so the falling dot is a filled one.
  const rotationTarget =
    phase === 'reveal' || phase === 'revealHold' || phase === 'collapse' || phase === 'drop' || phase === 'done'
      ? 180
      : 0
  // Once we've entered collapse the row shrinks down to ~50% scale and
  // stacks at the centre — together it reads as a small, compact dot.
  // The dot scale + position is preserved through drop + done so the
  // exit animation translates that same dot off the bottom.
  const isCollapsed = phase === 'collapse' || phase === 'drop' || phase === 'done'
  // True once we've entered the drop phase — each circle's `y` target
  // jumps to dropDistance so they translate straight off the bottom.
  const shouldDrop = phase === 'drop' || phase === 'done'

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
            background: bg,
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
                  initial={{ x: CENTER_X, y: 0, scale: 0 }}
                  animate={{
                    x: isSplit ? finalX : CENTER_X,
                    y: shouldDrop ? dropDistance : 0,
                    // 0 during grow → 1 once visible → 0.5 during the
                    // collapse so the merged stack reads as a compact dot.
                    scale: isCollapsed ? 0.5 : 1,
                  }}
                  transition={{
                    x: { duration: COLLAPSE_DURATION_S, ease: [0.16, 1, 0.3, 1] },
                    scale: { duration: 0.32, ease: [0.34, 1.5, 0.64, 1] },
                    y: shouldDrop
                      ? {
                          // Gravity-flavoured ease-in. No stagger anymore —
                          // the 4 circles are stacked into one dot by the
                          // time drop fires, so they fall together.
                          duration: DROP_DURATION_S,
                          delay: 0,
                          ease: [0.55, 0.085, 0.68, 0.53],
                        }
                      : { duration: 0 },
                  }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: CIRCLE_SIZE,
                    height: CIRCLE_SIZE,
                    perspective: 600,
                    // Paint order: earlier circles on top, so when the four
                    // stack into the collapse-dot the visible colour is the
                    // first one (the red X), not whichever renders last.
                    zIndex: COUNT - i,
                  }}
                >
                  {/* The flip: rotate the inner wrapper on Y. Reveal takes
                      it to 180° (back with X/O) and the rotation stays
                      there through revealHold + drop — circles fall with
                      X/O still showing. */}
                  <motion.div
                    animate={{ rotateY: rotationTarget }}
                    transition={{
                      duration: FLIP_DURATION_S,
                      delay: phase === 'reveal' ? i * STAGGER_S : 0,
                      ease: [0.4, 0, 0.2, 1],
                    }}
                    style={{
                      width: '100%',
                      height: '100%',
                      position: 'relative',
                      transformStyle: 'preserve-3d',
                    }}
                  >
                    {/* Front face — WIREFRAME: transparent circle with a
                        ring stroke. This is what enters, splits and holds
                        before the fill. */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        background: 'transparent',
                        border: `3px solid ${ringColor}`,
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                      }}
                    />
                    {/* Back face — the FILL: solid colour (one per circle)
                        with the letter in white. Pre-rotated 180° so its
                        content reads right-way-up once the wrapper has
                        flipped — the staggered flip IS the fill moment. */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        background: FILL_COLORS[i % FILL_COLORS.length],
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
                            stroke="#ffffff"
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
                            stroke="#ffffff"
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
