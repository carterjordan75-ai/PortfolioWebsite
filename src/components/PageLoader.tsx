'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import XoxoBrandLoader from './XoxoBrandLoader'
import { currentLoader, primeLoaderPool } from '@/lib/loaderPool'

interface PageLoaderProps {
  show: boolean
  onComplete?: () => void
  /**
   * 'transition' (default) — plays the wordmark once, hands over partway
   *   through so the parent can start navigating, then fades.
   * 'data' — plays once and then holds on the finished mark for as long
   *   as `show` stays true. When `show` goes false it fades out.
   */
  mode?: 'transition' | 'data'
}

/**
 * The site's loading screen: the XOXO wordmark animation, tuned in /logo
 * and exported from there.
 *
 * The mark plays once and stays complete — every animation in the
 * exported stylesheet carries `fill-mode: both`, so there is no loop to
 * stop and no resting state to arrange. A wait longer than the animation
 * simply sits on the finished wordmark, which reads better than a
 * spinner going round for the fourth time.
 *
 * No backdrop: the overlay paints the mark and nothing else, so whatever
 * is behind stays visible. It still covers the viewport, because the
 * point is to hold the pointer off a half-built page, not to hide it.
 *
 * Which animation plays comes from the loader pool — the set managed in
 * the admin panel — falling back to the one compiled into the bundle.
 * Nothing here waits on that: see lib/loaderPool.
 */

/**
 * How wide the mark sits. A loading screen wants the mark legible, not
 * filling the window — the arcs and accents throw well outside the
 * wordmark's own box, so the artwork occupies noticeably more room than
 * this number suggests.
 */
const MARK_WIDTH = 'min(34vw, 340px)'

/**
 * When a transition hands over. Partway through rather than at the end,
 * so the incoming route mounts underneath while the mark finishes — the
 * same trick the previous loader used, and the reason navigation doesn't
 * feel gated on the animation.
 */
const HANDOVER_FRACTION = 0.62

export default function PageLoader({ show, onComplete, mode = 'transition' }: PageLoaderProps) {
  const [visible, setVisible] = useState(show)
  const handedOver = useRef(false)

  // Resolved once per mount, so the mark cannot swap mid-animation if the
  // pool arrives while it is playing.
  const art = useMemo(() => currentLoader(), [])

  // Warm the pool for the rest of the session. Deliberately not awaited:
  // the built-in plays now, the pick applies from the next loader on.
  useEffect(() => {
    primeLoaderPool()
  }, [])

  // When the current run started, so it can always be allowed to finish.
  const startedAt = useRef(0)

  // Any fresh `show` restarts the moment.
  useEffect(() => {
    if (show) {
      handedOver.current = false
      startedAt.current = Date.now()
      setVisible(true)
    }
  }, [show])

  // Transition mode drives itself: hand over partway, then leave.
  useEffect(() => {
    if (!visible || mode !== 'transition') return
    const hand = setTimeout(() => {
      if (!handedOver.current) {
        handedOver.current = true
        onComplete?.()
      }
    }, Math.round(art.duration * HANDOVER_FRACTION))
    const done = setTimeout(() => setVisible(false), art.duration + 120)
    return () => {
      clearTimeout(hand)
      clearTimeout(done)
    }
  }, [visible, mode, onComplete, art.duration])

  // Data mode leaves when the parent says the data is in — but never
  // before the mark has finished. Data usually arrives inside the
  // animation, and cutting it off mid-flight to reveal the page is the
  // one thing that makes a loader read as a glitch rather than a moment.
  // So the exit waits out whatever is left of the run.
  useEffect(() => {
    if (mode !== 'data' || show || !visible) return
    const remaining = Math.max(0, art.duration - (Date.now() - startedAt.current))
    const t = setTimeout(() => setVisible(false), remaining + 80)
    return () => clearTimeout(t)
  }, [show, visible, mode, art.duration])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="xoxo-loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.34, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* The component fills whatever box it is handed, so the size
              decision lives here rather than inside it. */}
          <div style={{ width: MARK_WIDTH }}>
            <XoxoBrandLoader art={art} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
