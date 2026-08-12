'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import XoxoBrandLoader from './XoxoBrandLoader'
import { useDarkMode } from '@/contexts/DarkModeContext'
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
 * The screen has a ground — black or white with the site's mode — because
 * its job is to cover a half-built page. The mark itself carries no
 * background of its own: that is the artwork's rule, not the screen's,
 * and the two are easy to confuse. Here is where the colour is decided;
 * XoxoBrandLoader never paints one.
 *
 * Having a ground also gives the arc knockout something to knock out to,
 * so it is handed the same colour — otherwise arcs crossing a letterform
 * would merge into it.
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
  const { dark } = useDarkMode()

  // The screen's ground. The mark's ink follows the same mode inside
  // XoxoBrandLoader, so a mono loader lands white-on-black or
  // black-on-white without either end having to know about the other.
  const ground = dark ? '#0a0a0a' : '#ffffff'

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
            background: ground,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* The component fills whatever box it is handed, so the size
              decision lives here rather than inside it. */}
          <div style={{ width: MARK_WIDTH }}>
            <XoxoBrandLoader art={art} knockout={ground} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
