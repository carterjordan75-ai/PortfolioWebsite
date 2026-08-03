import type { Metadata } from 'next'

// The portal is private: keep it out of search engines entirely. (The
// page itself is a client component, so the metadata lives here.)
export const metadata: Metadata = {
  title: 'Motion Dailies',
  robots: { index: false, follow: false, nocache: true },
}

export default function DailiesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
