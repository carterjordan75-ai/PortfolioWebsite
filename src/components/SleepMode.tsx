'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import XoxoBrandLoader from './XoxoBrandLoader'
import { useDarkMode } from '@/contexts/DarkModeContext'
import { sleepArt } from '@/lib/sleepPool'
import type { LoaderArt } from '@/lib/loaderPool'
import { scaled } from '@/lib/logoScale'

/**
 * The screensaver: after a while alone, the site drifts off.
 *
 * It sits OVER the page rather than replacing it, on a blurred and
 * partly transparent ground, so what the viewer was looking at is still
 * there behind — the same treatment the gate uses. That is the whole
 * difference in feel between this and the loader: a loader hides a page
 * that is not ready, this one softens a page that is.
 */

const IDLE_MS = 45_000

/**
 * Above everything, including the header.
 *
 * The navigation sits at 10000 and its open dropdowns reach 10002, so at
 * 9998 the screensaver was drawn UNDER the site chrome — the one thing
 * that is meant to cover the whole page was the one thing showing
 * through it. Anything that covers the page has to clear that stack, not
 * sit next to it, so this is deliberately well above rather than one
 * more than the current highest.
 */
const OVER_EVERYTHING = 10_100

/** Wider than the loader's mark. Nothing is waiting on it, so it can breathe. */
const MARK_WIDTH = scaled('min(46vw, 460px)', 'loader')

/**
 * Where sleep would be a nuisance rather than a flourish.
 *
 * The tuners animate constantly and are used by leaving them running and
 * watching; covering them after 45 seconds would make them unusable. The
 * gate is already a full-screen mark, so a second one over the top is
 * just two animations fighting.
 */
const NEVER = ['/logo', '/character', '/gate', '/mobile-lock', '/loaders']

export default function SleepMode() {
  const pathname = usePathname()
  const { dark } = useDarkMode()
  const [art, setArt] = useState<LoaderArt | null>(null)
  const [asleep, setAsleep] = useState(false)

  // Held in a ref as well as state: the event listener below is attached
  // once and must be able to read "are we asleep" without being torn down
  // and rebuilt every time that changes.
  const asleepRef = useRef(false)
  asleepRef.current = asleep

  /**
   * Reduced motion means no screensaver at all.
   *
   * Not a smaller one, and not a still one. The two render paths get this
   * wrong in opposite directions if left alone: the rewrite path forces
   * iteration-count to 1, so the mark arrives and then freezes, and sits
   * frozen until the mouse moves — a screensaver that has stopped, which
   * is worse than none. The verbatim path carries no such rule at all, so
   * it animates in full at someone who explicitly asked it not to.
   *
   * A loader is different and stays: it covers a wait that is happening
   * whether or not it is drawn. This is decoration that appears
   * unprompted, so the honest reading of the preference is not to.
   *
   * Watched rather than read once — the preference can change while the
   * page is open, and a session started before it was turned on should
   * respect it from that moment.
   */
  const [lessMotion, setLessMotion] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)')
    const read = () => setLessMotion(q.matches)
    read()
    q.addEventListener('change', read)
    return () => q.removeEventListener('change', read)
  }, [])

  const blocked = lessMotion
    || NEVER.some(p => pathname === p || pathname.startsWith(p + '/'))

  useEffect(() => {
    if (blocked) { setAsleep(false); return }

    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const sleep = () => {
      // Fetched at the moment it is needed rather than on page load: most
      // visits never idle this long, and this is a few hundred KB that
      // would otherwise be pulled on every single page view for nothing.
      void sleepArt(dark ? 'dark' : 'light').then(a => {
        // The theme can change, or the viewer can come back, between
        // asking and being answered. Only fall asleep if neither happened
        // — otherwise the mark appears after the mouse already moved.
        if (cancelled || !a) return
        setArt(a)
        setAsleep(true)
      })
    }

    const wake = () => {
      if (asleepRef.current) setAsleep(false)
      clearTimeout(timer)
      timer = setTimeout(sleep, IDLE_MS)
    }

    // Touch and keys count as activity too. The brief says the mouse, but
    // a reader scrolling an article on a trackpad or tabbing through with
    // a keyboard is plainly not idle, and putting them to sleep mid-read
    // would be a bug rather than a feature.
    const EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
    EVENTS.forEach(e => window.addEventListener(e, wake, { passive: true }))
    // A tab in the background does not fire any of them, so a page left
    // in another window would come back already asleep. Restart the clock
    // when it becomes visible instead.
    const onVisible = () => { if (!document.hidden) wake() }
    document.addEventListener('visibilitychange', onVisible)

    timer = setTimeout(sleep, IDLE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
      EVENTS.forEach(e => window.removeEventListener(e, wake))
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [blocked, dark, pathname])

  if (blocked) return null

  // Enough to read as a veil rather than a wall: the page behind stays
  // legible in outline, which is what makes it read as the site resting
  // rather than as a new screen having opened.
  // Same as the loader: a pinned mark decides its own ground, so light
  // means it is always shown light rather than only shown to people
  // already browsing in light mode.
  const pinnedDark = art?.modes === 'dark' ? true : art?.modes === 'light' ? false : dark
  const ground = pinnedDark ? 'rgba(10,10,10,0.62)' : 'rgba(255,255,255,0.62)'

  return (
    <AnimatePresence>
      {asleep && art && (
        <motion.div
          key="xoxo-sleep"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // Slow in, quick out. Drifting off should be gentle; coming
          // back should feel like the site got out of the way at once.
          transition={{ duration: asleep ? 0.9 : 0.25, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: OVER_EVERYTHING,
            background: ground,
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // The whole point is that any movement dismisses it, so it
            // must not eat the event that does so.
            pointerEvents: 'none',
          }}
          aria-hidden
        >
          {/*
            Only for marks that were NOT built to loop.

            A tuner sleep mark already repeats the parts that should —
            the eyes, the drift, any spin — and deliberately does not
            repeat its entrance, so forcing it here would drag the
            entrance back into the loop and have the mark reassemble
            itself every few seconds instead of resting. A loader
            reassigned to sleep has no looping parts at all, and without
            this would play once and sit on a still frame, which is a
            screensaver that has stopped.
          */}
          {!art.loop && (
            <style dangerouslySetInnerHTML={{ __html:
              '.xoxo-sleep-mark .xoxo-brand *{animation-iteration-count:infinite!important}' }} />
          )}
          <div className="xoxo-sleep-mark" style={{ width: MARK_WIDTH }}>
            <XoxoBrandLoader art={art} knockout="transparent" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
