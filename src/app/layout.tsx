import type { Metadata } from 'next'
import { DM_Serif_Display, Inter } from 'next/font/google'
import './globals.css'
import Navigation from '@/components/Navigation'
import GrainOverlay from '@/components/GrainOverlay'
import { DarkModeProvider } from '@/contexts/DarkModeContext'

const displayFont = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
})

const bodyFont = Inter({
  subsets: ['latin'],
  variable: '--font-body',
})

export const metadata: Metadata = {
  title: '[Your Name] — Creative Portfolio',
  description: 'Motion · 3D · Generative · Illustration',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body className="antialiased font-[family-name:var(--font-body)]">
        <DarkModeProvider>
          <Navigation />
          {children}
          <GrainOverlay />
        </DarkModeProvider>
      </body>
    </html>
  )
}
