import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Please view on a desktop screen',
  robots: { index: false, follow: false },
}

// The four loader colours — same palette as the PageLoader fill and the
// index-page hover rows, so even the lock screen speaks the site's
// colour language.
const CIRCLES = [
  { letter: 'X', color: '#e94560' },
  { letter: 'O', color: '#ff6b35' },
  { letter: 'X', color: '#00b4d8' },
  { letter: 'O', color: '#7209b7' },
] as const

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
      <div className="flex items-center gap-2">
        {CIRCLES.map(({ letter, color }, i) => (
          <div
            key={i}
            className="flex items-center justify-center rounded-full"
            style={{ width: 40, height: 40, background: color }}
            aria-hidden="true"
          >
            {letter === 'X' ? (
              <svg viewBox="0 0 60 60" width="55%" height="55%">
                <path
                  d="M14 14 L46 46 M46 14 L14 46"
                  stroke="#ffffff"
                  strokeWidth="7"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 60 60" width="55%" height="55%">
                <circle cx="30" cy="30" r="16" stroke="#ffffff" strokeWidth="7" fill="none" />
              </svg>
            )}
          </div>
        ))}
      </div>
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
