import type { Metadata } from 'next'
import XoxoBrandLoader from '@/components/XoxoBrandLoader'

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
      {/* The real wordmark, animated. For most phone visitors this screen
          is the only page they see, so it gets the brand moment rather
          than a still. It plays once on load and holds on the finished
          mark — there is nothing to wait for here, so a loop would just
          be movement for its own sake. */}
      <div style={{ width: 'min(78vw, 26rem)' }}>
        <XoxoBrandLoader />
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
