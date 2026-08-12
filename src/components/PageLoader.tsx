'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import XoxoBrandLoader, { XOXO_BRAND_DURATION } from './XoxoBrandLoader'

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
 * The background is the one the mark was designed against rather than
 * the site's dark-mode setting. The artwork is white with a knockout
 * that assumes a dark ground, so following the theme would break it on
 * the light pages.
 */

const BACKDROP = '#0a0a0a'

/**
 * When a transition hands over. Partway through rather than at the end,
 * so the incoming route mounts underneath while the mark finishes — the
 * same trick the previous loader used, and the reason navigation doesn't
 * feel gated on the animation.
 */
const HANDOVER_MS = Math.round(XOXO_BRAND_DURATION * 0.62)

export default function PageLoader({ show, onComplete, mode = 'transition' }: PageLoaderProps) {
  const [visible, setVisible] = useState(show)
  const handedOver = useRef(false)

  // Any fresh `show` restarts the moment.
  useEffect(() => {
    if (show) {
      handedOver.current = false
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
    }, HANDOVER_MS)
    const done = setTimeout(() => setVisible(false), XOXO_BRAND_DURATION + 120)
    return () => {
      clearTimeout(hand)
      clearTimeout(done)
    }
  }, [visible, mode, onComplete])

  // Data mode leaves when the parent says the data is in. If that happens
  // before the mark has finished, it still gets its full run — cutting an
  // animation off mid-flight to reveal a page reads as a glitch.
  useEffect(() => {
    if (mode !== 'data' || show || !visible) return
    const t = setTimeout(() => setVisible(false), 80)
    return () => clearTimeout(t)
  }, [show, visible, mode])

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
            background: BACKDROP,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* The component fills whatever box it is handed, so the size
              decision lives here rather than inside it. */}
          <div style={{ width: 'min(74vw, 860px)' }}>
            <XoxoBrandLoader />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
