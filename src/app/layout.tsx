import type { Metadata } from 'next'
import { DM_Serif_Display, Inter, Permanent_Marker } from 'next/font/google'
import './globals.css'
import Navigation from '@/components/Navigation'
import GrainOverlay from '@/components/GrainOverlay'
import { DarkModeProvider } from '@/contexts/DarkModeContext'
import { EditModeProvider } from '@/contexts/EditModeContext'
import EditToolbar from '@/components/EditToolbar'
import CustomCursor from '@/components/CustomCursor'
import MediaProtect from '@/components/MediaProtect'

const displayFont = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
})

const bodyFont = Inter({
  subsets: ['latin'],
  variable: '--font-body',
})

// Marker / hand-drawn font for the Info page's "Jordan Carter" wordmark
const markerFont = Permanent_Marker({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-marker',
})


export const metadata: Metadata = {
  title: {
    default: 'Jordan Carter — 3D Motion & Generative Artist',
    template: '%s — Jordan Carter',
  },
  description: 'Jordan Carter is a multidisciplinary creative specialising in 3D motion design, generative art, and illustration. Based in Melbourne, Australia. Currently at SouthSouthWest.',
  keywords: ['jordan carter', '3d artist', 'motion designer', 'generative art', 'illustration', 'melbourne', 'creative director', 'freelance', 'portfolio'],
  authors: [{ name: 'Jordan Carter', url: 'https://jordanscarter.com' }],
  creator: 'Jordan Carter',
  metadataBase: new URL('https://jordanscarter.com'),
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    siteName: 'Jordan Carter',
    title: 'Jordan Carter — 3D Motion & Generative Artist',
    description: 'Multidisciplinary creative working across 3D, motion design, generative art and illustration.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Jordan Carter — 3D Motion & Generative Artist',
    description: 'Multidisciplinary creative working across 3D, motion design, generative art and illustration.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {},
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable} ${markerFont.variable}`}>
      <body className="antialiased font-[family-name:var(--font-body)]">
        <DarkModeProvider>
          <EditModeProvider>
            <Navigation />
            {children}
            <GrainOverlay />
            <EditToolbar />
            <CustomCursor />
            <MediaProtect />
          </EditModeProvider>
        </DarkModeProvider>
      </body>
    </html>
  )
}
