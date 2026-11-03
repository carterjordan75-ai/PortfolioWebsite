'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { usePathname } from 'next/navigation'

interface DarkModeContextType {
  dark: boolean
  setDark: (v: boolean) => void
  fg: string
  fg60: string
  borderThick: string
}

const DarkModeContext = createContext<DarkModeContextType>({
  dark: false,
  setDark: () => {},
  fg: '#000000',
  fg60: 'rgba(0,0,0,0.6)',
  borderThick: 'rgba(0,0,0,0.5)',
})

export function useDarkMode() {
  return useContext(DarkModeContext)
}

export function DarkModeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [darkPref, setDarkPref] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Read the user's dark-mode preference from localStorage on mount.
  useEffect(() => {
    const stored = localStorage.getItem('dark-mode')
    if (stored === 'true') setDarkPref(true)
    setHydrated(true)
  }, [])

  // Home page (`/`) is always rendered in light mode, regardless of the user's
  // saved preference. Toggling dark mode on Index/Misc still works, but doesn't
  // bleed onto the home page where the design assumes a light backdrop.
  const dark = pathname === '/' ? false : darkPref

  // Persist preference + sync body class to the EFFECTIVE dark state (so the
  // home page gets archive-light styling even when the user's stored pref is dark).
  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem('dark-mode', String(darkPref))
    document.body.classList.toggle('archive-dark', dark)
    document.body.classList.toggle('archive-light', !dark)
  }, [dark, darkPref, hydrated])

  const setDark = (v: boolean) => setDarkPref(v)

  const fg = dark ? '#ffffff' : '#000000'
  const fg60 = dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)'
  const borderThick = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.9)'

  return (
    <DarkModeContext.Provider value={{ dark, setDark, fg, fg60, borderThick }}>
      {children}
    </DarkModeContext.Provider>
  )
}
