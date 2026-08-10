import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Please view on a desktop screen',
  robots: { index: false, follow: false },
}

/**
 * Phone lock screen. Phones are rewritten here by the middleware for
 * every route while the mobile experience is unfinished. Static, no JS.
 * Rendered as a fixed full-viewport overlay so the root layout's
 * Navigation (and anything else) stays hidden underneath.
 */
export default function MobileLock() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center gap-8 px-8"
      style={{ background: '#0a0a0a', zIndex: 10050 }}
    >
      {/* The real wordmark, not the loader's X/O circles — for most phone
          visitors this screen is the only page they see, so it should be
          the brand rather than a stand-in for one. Inverted to white for
          the dark background, same treatment as the nav's dark popup. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/Logos/xoxo_Logo_001.png"
        alt="XOXO"
        className="block w-auto"
        style={{ height: 'clamp(2.6rem, 12vw, 4.5rem)', filter: 'invert(1)' }}
      />
      <div className="text-center">
        <p className="text-white font-black uppercase tracking-[0.18em] text-[13px] leading-relaxed">
          Please view on a desktop screen
        </p>
        <p className="text-white/40 uppercase tracking-[0.14em] text-[9px] mt-3">
          The mobile experience is still in the works
        </p>
      </div>
    </div>
  )
}
