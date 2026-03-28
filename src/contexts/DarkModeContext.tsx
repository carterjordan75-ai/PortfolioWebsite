'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

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
  const [dark, setDarkState] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Read from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('dark-mode')
    if (stored === 'true') setDarkState(true)
    setHydrated(true)
  }, [])

  // Persist to localStorage and sync body class
  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem('dark-mode', String(dark))
    document.body.classList.toggle('archive-dark', dark)
    document.body.classList.toggle('archive-light', !dark)
  }, [dark, hydrated])

  const setDark = (v: boolean) => setDarkState(v)

  const fg = dark ? '#ffffff' : '#000000'
  const fg60 = dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)'
  const borderThick = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.9)'

  return (
    <DarkModeContext.Provider value={{ dark, setDark, fg, fg60, borderThick }}>
      {children}
    </DarkModeContext.Provider>
  )
}
