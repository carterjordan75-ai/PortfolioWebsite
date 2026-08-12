import type { Metadata } from 'next'

// Hidden tool: keep it out of search engines entirely. (The page itself
// is a client component, so the metadata lives here.)
export const metadata: Metadata = {
  title: 'Logo',
  robots: { index: false, follow: false, nocache: true },
}

export default function LogoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
