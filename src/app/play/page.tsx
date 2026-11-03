'use client'

import { useEffect, useRef, useState } from 'react'
import { gelHtml } from './gel'
import EmailPopup from '@/components/EmailPopup'
import AdminPortal from '@/components/AdminPortal'
import { useDarkMode } from '@/contexts/DarkModeContext'

const experiments = [{ id: 'gel', title: 'Gel', html: gelHtml }]

export default function PlayPage() {
  const { fg, fg60, borderThick } = useDarkMode()
  const [index, setIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const interactiveFrame = useRef<HTMLIFrameElement>(null)
  const piece = experiments[index]
  const circle = { border: `1.5px solid ${borderThick}`, color: fg }
  const buttonClass = 'w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform'

  useEffect(() => {
    if (!expanded) return
    const modal = dialog.current
    modal?.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Keyboard events inside an iframe do not bubble into the page.
    const onMessage = (event: MessageEvent) => {
      if (event.source === interactiveFrame.current?.contentWindow && event.data === 'xoxo-play-close') {
        setExpanded(false)
      }
    }
    window.addEventListener('message', onMessage)
    return () => {
      modal?.close()
      document.body.style.overflow = previousOverflow
      window.removeEventListener('message', onMessage)
    }
  }, [expanded])

  const go = (direction: number) => setIndex(i => (i + direction + experiments.length) % experiments.length)

  return (
    <div className="play-page" style={{ background: '#0a0a0a', color: fg }}>
      <main className="play-stage" aria-label="Experimental work carousel" aria-roledescription="carousel"
        onKeyDown={event => {
          if (event.key === 'ArrowRight') go(1)
          if (event.key === 'ArrowLeft') go(-1)
        }}>
        <div className="play-row">
          {experiments.map((experiment, i) => (
            <article key={experiment.id} className="play-panel" hidden={i !== index}
              aria-roledescription="slide" aria-label={`${i + 1} of ${experiments.length}: ${experiment.title}`}>
              {!expanded && <iframe srcDoc={experiment.html} title={`${experiment.title} preview`} tabIndex={-1} aria-hidden="true" className="play-preview" />}
              <button type="button" className="play-open" onClick={() => setExpanded(true)} aria-label={`Open ${experiment.title} full screen`} aria-haspopup="dialog">
                <span className="play-open-hint">Open to play ↗</span>
              </button>
            </article>
          ))}
        </div>
        <div className="play-caption" aria-live="polite">
          <span>{piece.title}</span>
          <span>{String(index + 1).padStart(2, '0')} / {String(experiments.length).padStart(2, '0')}</span>
        </div>
        {experiments.length > 1 && <div className="play-controls">
          <button onClick={() => go(-1)} aria-label="Previous experiment">←</button>
          <button onClick={() => go(1)} aria-label="Next experiment">→</button>
        </div>}
      </main>
      <footer className="px-6 md:px-10 py-5" style={{ borderTop: `1px solid ${borderThick}` }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-3">
            <button onClick={() => setShowEmail(true)} className={buttonClass} style={circle}>Email</button>
            <a href="https://instagram.com/jordanscarter" target="_blank" rel="noopener noreferrer" className={buttonClass} style={circle}>Insta</a>
          </div>
          <button onClick={() => setShowAdmin(true)} className={buttonClass} style={{ ...circle, color: fg60 }}>© 2026</button>
        </div>
      </footer>
      {expanded && <dialog ref={dialog} className="play-fullscreen" aria-label={`${piece.title} — interactive experiment`}
        onCancel={event => { event.preventDefault(); setExpanded(false) }} onClose={() => setExpanded(false)}>
        <iframe ref={interactiveFrame} srcDoc={piece.html} title={`Interactive ${piece.title} — press and drag`} className="play-interactive" />
        <div className="play-fullscreen-label">{piece.title} · Press &amp; drag</div>
        <button autoFocus type="button" className="play-close" onClick={() => setExpanded(false)} aria-label="Close full screen">Close ×</button>
      </dialog>}
      <EmailPopup show={showEmail} onClose={() => setShowEmail(false)} />
      <AdminPortal show={showAdmin} onClose={() => setShowAdmin(false)} />
      <style jsx>{`
        .play-page { min-height: 100svh; }
        .play-stage { min-height: 100svh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 110px 24px 54px; perspective: 1200px; }
        .play-row { width: min(72vw, calc(100svh - 230px)); aspect-ratio: 1; position: relative; }
        .play-panel { width: 100%; height: 100%; position: relative; border-radius: 16px; overflow: hidden; background: #0a0a0a; border: 1px solid #ffffff12; box-shadow: 0 24px 80px #0006; }
        .play-preview, .play-interactive { display: block; width: 100%; height: 100%; border: 0; background: #0a0a0a; }
        .play-preview { pointer-events: none; }
        .play-open { position: absolute; inset: 0; width: 100%; cursor: pointer; border: 0; background: transparent; color: #fff; }
        .play-open:focus-visible { outline: 2px solid #fff; outline-offset: -5px; border-radius: 16px; }
        .play-open-hint { position: absolute; bottom: 22px; left: 50%; transform: translateX(-50%); padding: 10px 16px; border-radius: 24px; background: #ffffff0c; border: 1px solid #ffffff20; font-size: 10px; text-transform: uppercase; letter-spacing: .12em; opacity: 0; transition: opacity .2s; white-space: nowrap; }
        .play-open:hover .play-open-hint, .play-open:focus-visible .play-open-hint { opacity: 1; }
        .play-caption { width: min(72vw, calc(100svh - 230px)); display: flex; justify-content: space-between; margin-top: 22px; color: #ffffff80; font-size: 10px; text-transform: uppercase; letter-spacing: .12em; }
        .play-controls { display: flex; gap: 24px; margin-top: 20px; }
        .play-fullscreen { position: fixed; inset: 0; width: 100vw; max-width: none; height: 100dvh; max-height: none; margin: 0; padding: 0; border: 0; background: #0a0a0a; color: #fff; overflow: hidden; }
        .play-fullscreen::backdrop { background: #0a0a0a; }
        .play-fullscreen-label { position: absolute; top: 28px; left: 28px; pointer-events: none; color: #ffffff80; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; }
        .play-close { position: absolute; top: 18px; right: 22px; padding: 12px 18px; border: 1px solid #ffffff40; border-radius: 24px; background: #0a0a0ae6; color: #fff; font-size: 11px; cursor: pointer; }
        .play-close:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
        @media (max-width: 640px) { .play-row, .play-caption { width: min(88vw, calc(100svh - 230px)); } .play-open-hint { opacity: 1; } }
      `}</style>
    </div>
  )
}
