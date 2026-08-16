'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import XoxoBrandLoader from './XoxoBrandLoader'
import { useDarkMode } from '@/contexts/DarkModeContext'
import { currentLoader, primeLoaderPool } from '@/lib/loaderPool'
import { scaled } from '@/lib/logoScale'

interface PageLoaderProps {
  show: boolean
  onComplete?: () => void
  /**
   * 'transition' (default) — plays the wordmark through, then hands over
   *   and fades.
   * 'data' — plays through, then holds on the finished mark for as long
   *   as `show` stays true. When `show` goes false it fades out.
   *
   * Both obey the same rule: a full play-through, every time, before
   * anything is revealed.
   */
  mode?: 'transition' | 'data'
}

/**
 * The site's loading screen: the XOXO wordmark animation, tuned in /logo
 * and exported from there.
 *
 * The rule it exists to keep: the mark plays through once, completely,
 * and then holds its final frame until the thing it covers is ready. A
 * page is never revealed part way through a run, however quickly it
 * loads — a loader cut off mid-flight reads as a glitch, and one that
 * only sometimes completes reads as a broken one.
 *
 * Holding costs nothing to arrange: every animation in the exported
 * stylesheet carries `fill-mode: both`, so there is no loop to stop. A
 * wait longer than the animation simply sits on the finished wordmark,
 * which reads better than a spinner going round for the fourth time.
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
const MARK_WIDTH = scaled('min(34vw, 340px)', 'loader')

/**
 * A beat after the mark completes, before anything is revealed. Without
 * it the exit begins on the same frame the last keyframe lands, which
 * reads as the animation being cut off at the very end rather than
 * finishing.
 */
const SETTLE_MS = 90

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
  //
  // Lazy initial state rather than useMemo: React may discard a memo and
  // recompute it whenever it likes, and a recompute that returns a
  // different loader rewrites the stylesheet, which redefines every
  // @keyframes and restarts the animation from zero part way through.
  // An initialiser is guaranteed to run once for the life of the mount.
  const [art] = useState(currentLoader)

  // Fetch a pick for next time. Deliberately not awaited — a loader that
  // has to be downloaded before it can be shown is a contradiction — so
  // whatever is already stored plays now and this decides what plays on
  // the next page load.
  useEffect(() => {
    primeLoaderPool()
  }, [])

  // When the current run started, so it can always be allowed to finish.
  const startedAt = useRef(0)

  /**
   * THE RULE, and the only place it lives: a loader plays through once,
   * completely, and then holds its final frame until whatever it covers
   * is ready. Nothing is revealed part way through a run.
   *
   * Everything below asks this how long is left. It reads the clock
   * rather than a timer, so an exit requested at any point — before the
   * mark has started, half way, or long after — resolves to the same
   * answer.
   */
  const msLeftOfRun = () => Math.max(0, art.duration - (Date.now() - startedAt.current))

  // Any fresh `show` restarts the moment.
  useEffect(() => {
    if (show) {
      handedOver.current = false
      startedAt.current = Date.now()
      setVisible(true)
    }
  }, [show])

  // Transition mode drives itself. The handover used to fire at 62% so
  // the incoming route could mount underneath while the mark finished —
  // faster, but it put a half-played loader over a live page, which is
  // exactly what the rule forbids. It now waits for the full run.
  useEffect(() => {
    if (!visible || mode !== 'transition') return
    const t = setTimeout(() => {
      if (!handedOver.current) {
        handedOver.current = true
        onComplete?.()
      }
      setVisible(false)
    }, msLeftOfRun() + SETTLE_MS)
    return () => clearTimeout(t)
  }, [visible, mode, onComplete, art.duration])

  // Data mode leaves when the parent says the data is in — but only once
  // the run is done. Data usually lands inside the animation, so this is
  // the common path, not the edge case.
  //
  // onComplete fires here too, not just in transition mode. A caller that
  // swaps its whole tree when the data arrives needs to be told when the
  // mark has finished, or it tears the loader down mid-run and the
  // animation simply stops partway — which is the rule this component
  // exists to keep.
  useEffect(() => {
    if (mode !== 'data' || show || !visible) return
    const t = setTimeout(() => {
      if (!handedOver.current) {
        handedOver.current = true
        onComplete?.()
      }
      setVisible(false)
    }, msLeftOfRun() + SETTLE_MS)
    return () => clearTimeout(t)
  }, [show, visible, mode, onComplete, art.duration])

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
