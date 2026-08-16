'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import XoxoBrandLoader from './XoxoBrandLoader'
import { useDarkMode } from '@/contexts/DarkModeContext'
import { currentLoader, primeLoaderPool, type LoaderArt } from '@/lib/loaderPool'
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

  // When the current run started, so it can always be allowed to finish.
  const startedAt = useRef(0)

  /**
   * Which mark plays, decided on the client and only once.
   *
   * It cannot be decided during render. This component is
   * server-rendered, and on the server there is no localStorage to read
   * the pool's pick out of — so render returns the built-in, hydration
   * keeps the server's markup, and the pool never plays. That is the
   * whole reason the admin panel's loaders appeared to do nothing: the
   * pick was being fetched and stored correctly and then never looked
   * at, because the only look happened somewhere it could not see.
   *
   * Set once, in an effect, so it also cannot swap mid-run — which is
   * the other rule this component keeps. Rewriting the mark's
   * stylesheet redefines every @keyframes in it and restarts the
   * animation from zero.
   */
  // Three states, not two: `undefined` is "not decided yet", `null` is
  // "decided, and there is no loader to play". Collapsing those loses the
  // difference between waiting for an answer and having one — and the
  // handover below has to wait for the first while not waiting for ever
  // on the second.
  const [art, setArt] = useState<LoaderArt | null | undefined>(undefined)
  useEffect(() => {
    setArt(current => (current === undefined ? currentLoader() : current))
    // The run is timed from when the mark appears, not from when the
    // screen does — they are a frame apart and the rule is about the
    // animation completing, not the cover.
    startedAt.current = Date.now()
  }, [])

  // Fetch a pick for next time. Deliberately not awaited — a loader that
  // has to be downloaded before it can be shown is a contradiction — so
  // whatever is already stored plays now and this decides what plays on
  // the next page load.
  useEffect(() => {
    primeLoaderPool()
  }, [])


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
  const msLeftOfRun = () =>
    Math.max(0, (art?.duration ?? 0) - (Date.now() - startedAt.current))

  /**
   * A loader mounted with nothing to cover still owes its caller an
   * answer: the run it would have played is already over.
   *
   * Without this, anything that gates its own render on onComplete waits
   * for ever whenever the data happened to be there already — which is
   * not an edge case, it is the fast path.
   */
  const announcedEmpty = useRef(false)
  useEffect(() => {
    if (show || visible || announcedEmpty.current) return
    announcedEmpty.current = true
    onComplete?.()
  }, [show, visible, onComplete])

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
    if (!visible || art === undefined || mode !== 'transition') return
    const t = setTimeout(() => {
      if (!handedOver.current) {
        handedOver.current = true
        onComplete?.()
      }
      setVisible(false)
    }, msLeftOfRun() + SETTLE_MS)
    return () => clearTimeout(t)
  }, [visible, mode, onComplete, art])

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
    if (mode !== 'data' || show || !visible || art === undefined) return
    const t = setTimeout(() => {
      if (!handedOver.current) {
        handedOver.current = true
        onComplete?.()
      }
      setVisible(false)
    }, msLeftOfRun() + SETTLE_MS)
    return () => clearTimeout(t)
  }, [show, visible, mode, onComplete, art])

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
          {/* The ground paints from the very first frame — it is what
              stops a half-built page showing — while the mark waits for
              the effect that decides which loader it is. They are one
              frame apart, and only the ground has to be there
              instantly. */}
          {art && (
            <div style={{ width: MARK_WIDTH }}>
              <XoxoBrandLoader art={art} knockout={ground} />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
