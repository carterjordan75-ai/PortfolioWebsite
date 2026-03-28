'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useDarkMode } from '@/contexts/DarkModeContext'
import PageTransition from '@/components/PageTransition'

type GalleryItem = {
  src: string
  type: 'image' | 'video'
  cols: number
  rows: number
  credit: string
  source?: string
}

const galleryItems: GalleryItem[] = [
  { src: '/assets/TestMedia/Image_01.avif', type: 'image', cols: 2, rows: 2, credit: 'Nike Running — Brand Campaign', source: 'https://nike.com' },
  { src: '/assets/TestMedia/video_01.mp4', type: 'video', cols: 1, rows: 1, credit: 'Reel — Motion Study 001' },
  { src: '/assets/TestMedia/Image_02.avif', type: 'image', cols: 1, rows: 1, credit: 'Helmut Newton — Fashion Editorial', source: 'https://helmut-newton.com' },
  { src: '/assets/TestMedia/video_02.mp4', type: 'video', cols: 1, rows: 2, credit: 'Onesal Studio — Type in Motion', source: 'https://onesal.com' },
  { src: '/assets/TestMedia/Image_03.avif', type: 'image', cols: 1, rows: 1, credit: 'Peter Saville — Album Artwork', source: 'https://petersaville.info' },
  { src: '/assets/TestMedia/PolaroidTest.webp', type: 'image', cols: 1, rows: 1, credit: 'Andy Warhol — Polaroid Series' },
  { src: '/assets/TestMedia/video_03.mp4', type: 'video', cols: 2, rows: 1, credit: 'Builders Club — Motion Reel', source: 'https://builders-club.com' },
  { src: '/assets/TestMedia/Image_01.avif', type: 'image', cols: 1, rows: 1, credit: 'Virgil Abloh — Off-White SS20' },
  { src: '/assets/TestMedia/Image_02.avif', type: 'image', cols: 1, rows: 2, credit: 'Irving Penn — Still Life', source: 'https://irvingpenn.org' },
  { src: '/assets/TestMedia/video_01.mp4', type: 'video', cols: 1, rows: 1, credit: 'Gmunk — Oblivion Title Sequence', source: 'https://gmunk.com' },
  { src: '/assets/TestMedia/Image_03.avif', type: 'image', cols: 2, rows: 1, credit: 'Neville Brody — Typography', source: 'https://brodyassociates.com' },
  { src: '/assets/TestMedia/video_02.mp4', type: 'video', cols: 1, rows: 1, credit: 'ManvsMachine — Nike Air Max', source: 'https://manvsmachine.co.uk' },
  { src: '/assets/TestMedia/PolaroidTest.webp', type: 'image', cols: 1, rows: 1, credit: 'Juergen Teller — Portrait Study' },
  { src: '/assets/TestMedia/Image_01.avif', type: 'image', cols: 1, rows: 1, credit: 'Comme des Garcons — Campaign' },
  { src: '/assets/TestMedia/video_03.mp4', type: 'video', cols: 2, rows: 2, credit: 'Buck Design — Branded Content', source: 'https://buck.co' },
  { src: '/assets/TestMedia/Image_02.avif', type: 'image', cols: 1, rows: 1, credit: 'David Carson — Ray Gun Magazine' },
  { src: '/assets/TestMedia/Image_03.avif', type: 'image', cols: 1, rows: 1, credit: 'Josef Muller-Brockmann — Grid Systems' },
  { src: '/assets/TestMedia/video_01.mp4', type: 'video', cols: 1, rows: 1, credit: 'Ash Thorp — Ghost in the Shell', source: 'https://ashthorp.com' },
  { src: '/assets/TestMedia/Image_01.avif', type: 'image', cols: 2, rows: 1, credit: 'Massimo Vignelli — NYC Subway Map' },
  { src: '/assets/TestMedia/video_02.mp4', type: 'video', cols: 1, rows: 2, credit: 'Territory Studio — UI Concepts', source: 'https://territorystudio.com' },
  { src: '/assets/TestMedia/Image_02.avif', type: 'image', cols: 1, rows: 1, credit: 'Wolfgang Tillmans — Exhibitions' },
  { src: '/assets/TestMedia/Image_03.avif', type: 'image', cols: 1, rows: 1, credit: 'Sagmeister & Walsh — Beauty' },
  { src: '/assets/TestMedia/video_03.mp4', type: 'video', cols: 1, rows: 1, credit: 'Tendril — Experimental 3D', source: 'https://tendril.ca' },
  { src: '/assets/TestMedia/PolaroidTest.webp', type: 'image', cols: 1, rows: 1, credit: 'Nan Goldin — The Ballad' },
  { src: '/assets/TestMedia/Image_01.avif', type: 'image', cols: 1, rows: 1, credit: 'Tadao Ando — Light & Concrete' },
  { src: '/assets/TestMedia/video_01.mp4', type: 'video', cols: 2, rows: 1, credit: 'Beeple — Everydays', source: 'https://beeple-crap.com' },
  { src: '/assets/TestMedia/Image_02.avif', type: 'image', cols: 1, rows: 2, credit: 'Richard Avedon — Portraits' },
  { src: '/assets/TestMedia/Image_03.avif', type: 'image', cols: 1, rows: 1, credit: 'Dieter Rams — Braun Products' },
  { src: '/assets/TestMedia/video_02.mp4', type: 'video', cols: 1, rows: 1, credit: 'Romain Laurent — Loop Series', source: 'https://romainlaurent.com' },
  { src: '/assets/TestMedia/Image_01.avif', type: 'image', cols: 2, rows: 2, credit: 'Nike — Art of Victory Campaign', source: 'https://nike.com' },
]

const allItems = [...galleryItems, ...galleryItems, ...galleryItems]

export default function LookPage() {
  const { dark } = useDarkMode()
  const scrollRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number>(0)
  const speedRef = useRef(0.5)
  const [activeItem, setActiveItem] = useState<number | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let lastTime = performance.now()

    const animate = (now: number) => {
      const dt = now - lastTime
      lastTime = now
      if (activeItem === null) {
        el.scrollTop += speedRef.current * (dt / 16)
      }
      const totalHeight = el.scrollHeight
      const viewHeight = el.clientHeight
      if (el.scrollTop > totalHeight - viewHeight - 100) {
        el.scrollTop = totalHeight / 3
      }
      animRef.current = requestAnimationFrame(animate)
    }

    el.scrollTop = el.scrollHeight / 3
    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [activeItem])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let timeout: ReturnType<typeof setTimeout>
    const onWheel = () => {
      speedRef.current = 0
      clearTimeout(timeout)
      timeout = setTimeout(() => { speedRef.current = 0.5 }, 2000)
    }
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('touchstart', onWheel, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onWheel)
      clearTimeout(timeout)
    }
  }, [])

  const activeData = activeItem !== null ? allItems[activeItem] : null

  return (
    <PageTransition>
      <div style={{ background: '#000000', minHeight: '100vh' }}>
        <div
          ref={scrollRef}
          className="overflow-y-auto overflow-x-hidden"
          style={{ height: '100vh', paddingTop: '68px' }}
        >
          <div
            className="grid"
            style={{
              gridTemplateColumns: 'repeat(4, 1fr)',
              gridAutoRows: '25vh',
              width: '100%',
            }}
          >
            {allItems.map((item, i) => (
              <div
                key={i}
                className="relative overflow-hidden cursor-pointer group"
                style={{
                  gridColumn: `span ${item.cols}`,
                  gridRow: `span ${item.rows}`,
                  transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), z-index 0s',
                  zIndex: 1,
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget
                  el.style.transform = 'scale(1.06)'
                  el.style.zIndex = '20'
                  el.style.boxShadow = '0 8px 40px rgba(0,0,0,0.6)'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget
                  el.style.transform = 'scale(1)'
                  el.style.zIndex = '1'
                  el.style.boxShadow = 'none'
                }}
                onClick={() => setActiveItem(activeItem === i ? null : i)}
              >
                {item.type === 'image' ? (
                  <Image
                    src={item.src}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, 25vw"
                    unoptimized
                  />
                ) : (
                  <video
                    src={item.src}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}

                {/* Click overlay — shows credit */}
                {activeItem === i && (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center"
                    style={{
                      background: 'rgba(0,0,0,0.75)',
                      backdropFilter: 'blur(4px)',
                      zIndex: 10,
                    }}
                  >
                    <p className="text-white text-[11px] font-bold uppercase tracking-[0.12em] text-center px-4 mb-2">
                      {item.credit}
                    </p>
                    {item.source && (
                      <a
                        href={item.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[9px] uppercase tracking-[0.15em] text-white px-3 py-1 rounded-full transition-all hover:scale-105"
                        style={{
                          border: '1px solid rgba(255,255,255,0.3)',
                          opacity: 0.7,
                        }}
                      >
                        Visit Source ↗
                      </a>
                    )}
                  </div>
                )}

                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.15)' }}
                />
              </div>
            ))}
          </div>

        </div>

        {/* Fixed bottom text overlay */}
        <div
          className="fixed bottom-0 left-0 right-0 text-center py-4 px-6 pointer-events-none"
          style={{
            zIndex: 50,
            background: 'linear-gradient(transparent 0%, rgba(0,0,0,0.85) 60%, rgba(0,0,0,0.95) 100%)',
          }}
        >
          <p
            className="text-[8px] uppercase tracking-[0.2em] leading-[1.8] max-w-md mx-auto"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            A living archive of references, obsessions &amp; visual fragments that shape the work. Click any image for credit &amp; source.
          </p>
        </div>

        {/* Dismiss overlay if clicking outside */}
        {activeItem !== null && (
          <div
            className="fixed inset-0 z-[5]"
            style={{ pointerEvents: 'none' }}
          />
        )}
      </div>
    </PageTransition>
  )
}
