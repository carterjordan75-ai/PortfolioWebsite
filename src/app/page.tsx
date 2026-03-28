'use client'

import HeroOrbs from '@/components/HeroOrbs'
import PageTransition from '@/components/PageTransition'

export default function Home() {
  return (
    <PageTransition>
      <main className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
        <HeroOrbs />

        <div className="relative z-10 px-6 text-center max-w-4xl">
          <h1 className="font-[family-name:var(--font-display)] text-6xl sm:text-7xl md:text-8xl lg:text-9xl leading-[0.9] mb-6">
            [Your Name]
          </h1>
          <p className="text-lg md:text-xl text-[var(--muted)] tracking-widest uppercase">
            Motion · 3D · Generative · Illustration
          </p>
        </div>

        <div className="absolute bottom-20 z-10 max-w-xl px-6 text-center">
          <p className="text-base md:text-lg text-[var(--muted)] leading-relaxed">
            [PLACEHOLDER — A multidisciplinary creative working across motion, 3D, generative art, and illustration. Currently available for freelance projects.]
          </p>
        </div>
      </main>
    </PageTransition>
  )
}
