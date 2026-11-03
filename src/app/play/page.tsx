'use client'

import { useState } from 'react'
import { gelHtml } from './gel'
import PageTransition from '@/components/PageTransition'
import EmailPopup from '@/components/EmailPopup'
import AdminPortal from '@/components/AdminPortal'
import { useDarkMode } from '@/contexts/DarkModeContext'

export default function PlayPage() {
  const { dark, fg, fg60, borderThick } = useDarkMode()
  const [showEmail, setShowEmail] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const circle = { border: `1.5px solid ${borderThick}`, color: fg }
  const buttonClass = 'w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform'

  return (
    <PageTransition>
      <div className="flex min-h-screen flex-col" style={{ background: dark ? '#0a0a0a' : '#f5f5f0', color: fg }}>
        <main className="flex-1 px-6 md:px-10 pt-36 pb-24">
          <h1 className="text-[clamp(64px,14vw,220px)] leading-none font-bold tracking-[-0.06em]">Play</h1>
          <p className="mt-8 text-[11px] uppercase tracking-[0.12em]" style={{ color: fg60 }}>Experimental work.</p>
          <section className="mt-16" aria-labelledby="gel-title">
            <div className="mb-4 flex items-center justify-between gap-4 text-[10px] uppercase tracking-[0.12em]" style={{ color: fg60 }}>
              <h2 id="gel-title">Gel</h2>
              <span>Press &amp; drag</span>
            </div>
            <iframe
              srcDoc={gelHtml}
              title="Interactive XOXO gel — press and drag to deform the logo"
              className="w-full border-0"
              style={{ height: 'min(75vh, 900px)', minHeight: 420, background: '#000' }}
            />
          </section>
        </main>
        <footer className="px-6 md:px-10 py-5" style={{ borderTop: `3px solid ${borderThick}` }}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-3">
              <button onClick={() => setShowEmail(true)} className={buttonClass} style={circle}>Email</button>
              <a href="https://instagram.com/jordanscarter" target="_blank" rel="noopener noreferrer" className={buttonClass} style={circle}>Insta</a>
            </div>
            <button onClick={() => setShowAdmin(true)} className={buttonClass} style={{ ...circle, color: fg60 }}>© 2026</button>
          </div>
        </footer>
      </div>
      <EmailPopup show={showEmail} onClose={() => setShowEmail(false)} />
      <AdminPortal show={showAdmin} onClose={() => setShowAdmin(false)} />
    </PageTransition>
  )
}
