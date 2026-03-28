'use client'

import { useEffect, useRef } from 'react'

export default function GrainOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    const size = 256

    canvas.width = size
    canvas.height = size

    function renderGrain() {
      const imageData = ctx!.createImageData(size, size)
      const data = imageData.data
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() * 255
        data[i] = v
        data[i + 1] = v
        data[i + 2] = v
        data[i + 3] = 255
      }
      ctx!.putImageData(imageData, 0, 0)
      animId = requestAnimationFrame(renderGrain)
    }

    renderGrain()
    return () => cancelAnimationFrame(animId)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="grain-overlay"
      style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}
    />
  )
}
