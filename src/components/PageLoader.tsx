'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface PageLoaderProps {
  show: boolean
  onComplete: () => void
}

const COLS = 12
const ROWS = 8
const TOTAL = COLS * ROWS

export default function PageLoader({ show, onComplete }: PageLoaderProps) {
  const [phase, setPhase] = useState<'idle' | 'cover' | 'hold' | 'reveal' | 'done'>('idle')
  const completedRef = useRef(false)

  // One random non-edge circle is red
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

  useEffect(() => {
    if (!show) {
      setPhase('idle')
      completedRef.current = false
      return
    }
    completedRef.current = false
    setPhase('cover')

    // Cover done: last stagger + grow duration
    const coverTime = (COLS + ROWS) * 12 + 180
    const t1 = setTimeout(() => setPhase('hold'), coverTime)
    return () => clearTimeout(t1)
  }, [show])

  useEffect(() => {
    if (phase !== 'hold') return
    // 250ms pause
    const t = setTimeout(() => setPhase('reveal'), 250)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    if (phase !== 'reveal') return
    // Trigger navigation at the start of reveal so new page loads behind shrinking circles
    if (!completedRef.current) {
      completedRef.current = true
      onComplete()
    }
    const revealTime = (COLS + ROWS) * 12 + 200
    const t = setTimeout(() => {
      setPhase('done')
    }, revealTime)
    return () => clearTimeout(t)
  }, [phase, onComplete])

  if (phase === 'idle' || (phase === 'done' && !show)) return null

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
          {/* Grid of circles */}
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
                  }}
                />
              )
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
