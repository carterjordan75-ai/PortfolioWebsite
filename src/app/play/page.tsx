'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { gelHtml } from './gel'
import EmailPopup from '@/components/EmailPopup'
import AdminPortal from '@/components/AdminPortal'
import { useDarkMode } from '@/contexts/DarkModeContext'

const experiments = [{
  id: 'gel', title: 'Gel', html: gelHtml,
  description: 'A soft, sculptable XOXO. Press into a letter, drag to stretch it, then release and watch it settle back.',
  keyboard: 'Click the gel to focus it. Use ← / → to choose a letter, hold Space to press, and release to let go. Escape returns to the carousel.',
}]

export default function PlayPage() {
  const { dark, fg, fg60, borderThick } = useDarkMode()
  const [index, setIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const interactiveFrame = useRef<HTMLIFrameElement>(null)
  const openButton = useRef<HTMLButtonElement>(null)
  const infoButton = useRef<HTMLButtonElement>(null)
  const infoPanel = useRef<HTMLDivElement>(null)
  const piece = experiments[index]
  const background = dark ? '#0a0a0a' : '#f5f5f0'
  const circle = { border: `1.5px solid ${borderThick}`, color: fg }
  const buttonClass = 'w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform'
  const closeExpanded = useCallback(() => {
    setExpanded(false)
    setShowInfo(false)
    requestAnimationFrame(() => openButton.current?.focus())
  }, [])

  useEffect(() => {
    const escape = () => {
      if (showInfo) { setShowInfo(false); infoButton.current?.focus() }
      else if (expanded) closeExpanded()
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') escape() }
    // Escape from the embedded piece must also return to the carousel.
    const onMessage = (event: MessageEvent) => {
      if (event.source === interactiveFrame.current?.contentWindow && event.data === 'xoxo-play-close') escape()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('message', onMessage)
    }
  }, [expanded, showInfo, closeExpanded])

  useEffect(() => { if (showInfo) infoPanel.current?.focus() }, [showInfo])

  const go = (direction: number) => {
    setIndex(i => (i + direction + experiments.length) % experiments.length)
    setShowInfo(false)
  }

  return (
    <div className={`play-page${expanded ? ' is-expanded' : ''}`} style={{
      background, color: fg, '--play-bg': background, '--play-fg': fg,
      '--play-muted': fg60, '--play-line': dark ? '#ffffff20' : '#00000020',
      '--play-shadow': dark ? '#0005' : '#0000000d',
    } as CSSProperties}>
      <main className="play-stage" aria-label="Experimental work carousel" aria-roledescription="carousel"
        onKeyDown={event => {
          if (expanded || showInfo) return
          if (event.key === 'ArrowRight') go(1)
          if (event.key === 'ArrowLeft') go(-1)
        }}>
        <div className="play-row">
          <article key={piece.id} className="play-panel" aria-roledescription="slide" aria-label={`${index + 1} of ${experiments.length}: ${piece.title}`}>
            <iframe ref={interactiveFrame} key={`${piece.id}-${expanded}`} srcDoc={piece.html}
              title={expanded ? `Interactive ${piece.title} — press and drag` : `${piece.title} preview`}
              tabIndex={expanded ? 0 : -1} aria-hidden={!expanded} className={expanded ? 'play-interactive' : 'play-preview'} />
            {!expanded && <button ref={openButton} type="button" className="play-open"
              onClick={() => { setShowInfo(false); setExpanded(true) }} aria-label={`Open ${piece.title} to play`}>
              <span className="play-open-hint"><strong>{piece.title}</strong><span>Click to open · press &amp; drag to sculpt ↗</span></span>
            </button>}
            <div className="play-piece-tools">
              {expanded && <button type="button" className="play-back" onClick={closeExpanded}>← Back to carousel</button>}
              <button ref={infoButton} type="button" className="play-info-button" aria-label={`How to use ${piece.title}`}
                aria-expanded={showInfo} aria-controls="play-piece-info" onClick={() => setShowInfo(v => !v)}>i</button>
            </div>
            {showInfo && <div ref={infoPanel} id="play-piece-info" className="play-info" role="region" aria-labelledby="play-info-title" tabIndex={-1}>
              <div className="play-info-heading"><h2 id="play-info-title">{piece.title} — how to play</h2>
                <button onClick={() => { setShowInfo(false); infoButton.current?.focus() }} aria-label="Close instructions">×</button>
              </div>
              <p>{piece.description}</p>
              <p className="play-keyboard">{piece.keyboard}</p>
              {!expanded && <button className="play-start" onClick={() => { setShowInfo(false); setExpanded(true) }}>Open to play ↗</button>}
            </div>}
          </article>
        </div>
        <div className="play-caption" aria-live="polite">
          <span>{piece.title}{expanded ? ' · Press & drag' : ''}</span>
          <span>{String(index + 1).padStart(2, '0')} / {String(experiments.length).padStart(2, '0')}</span>
        </div>
        {!expanded && experiments.length > 1 && <div className="play-controls">
          <button onClick={() => go(-1)} aria-label="Previous experiment">←</button>
          <button onClick={() => go(1)} aria-label="Next experiment">→</button>
        </div>}
      </main>
      <footer className="play-footer px-6 md:px-10 py-5" style={{ borderTop: `1px solid ${borderThick}` }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-3">
            <button onClick={() => setShowEmail(true)} className={buttonClass} style={circle}>Email</button>
            <a href="https://instagram.com/jordanscarter" target="_blank" rel="noopener noreferrer" className={buttonClass} style={circle}>Insta</a>
          </div>
          <button onClick={() => setShowAdmin(true)} className={buttonClass} style={{ ...circle, color: fg60 }}>© 2026</button>
        </div>
      </footer>
      <EmailPopup show={showEmail} onClose={() => setShowEmail(false)} />
      <AdminPortal show={showAdmin} onClose={() => setShowAdmin(false)} />
      <style jsx>{`
        .play-page { min-height: 640px; height: 100svh; display: flex; flex-direction: column; }
        .play-stage { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 104px 24px 22px; perspective: 1200px; }
        .play-row { width: min(72vw, calc(100svh - 270px)); aspect-ratio: 1; position: relative; }
        .play-panel { width: 100%; height: 100%; position: relative; border-radius: 16px; overflow: hidden; background: var(--play-bg); border: 1px solid var(--play-line); box-shadow: 0 24px 80px var(--play-shadow); }
        .play-preview, .play-interactive { display: block; width: 100%; height: 100%; border: 0; background: #000; }
        .play-preview { pointer-events: none; }
        .play-open { position: absolute; inset: 0; width: 100%; cursor: pointer; border: 0; background: transparent; color: var(--play-fg); }
        button:focus-visible { outline: 2px solid var(--play-fg); outline-offset: -4px; }
        .play-open:focus-visible { border-radius: 16px; }
        .play-open-hint { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(6px); padding: 14px 20px; border-radius: 12px; background: var(--play-bg); border: 1px solid var(--play-line); opacity: 0; transition: opacity .2s, transform .2s; white-space: nowrap; display: flex; flex-direction: column; gap: 6px; }
        .play-open-hint strong { font-size: 13px; font-weight: 500; }
        .play-open-hint span { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: var(--play-muted); }
        .play-open:hover .play-open-hint, .play-open:focus-visible .play-open-hint { opacity: 1; transform: translateX(-50%) translateY(0); }
        .play-caption { width: min(72vw, calc(100svh - 270px)); display: flex; justify-content: space-between; margin-top: 18px; color: var(--play-muted); font-size: 10px; text-transform: uppercase; letter-spacing: .12em; }
        .play-controls { display: flex; gap: 24px; margin-top: 16px; }
        .play-footer { flex-shrink: 0; background: var(--play-bg); }
        .play-piece-tools { position: absolute; top: 16px; right: 16px; display: flex; align-items: center; gap: 10px; }
        .play-info-button, .play-back { background: var(--play-bg); color: var(--play-fg); border: 1px solid var(--play-line); cursor: pointer; }
        .play-info-button { width: 30px; height: 30px; border-radius: 50%; font: italic 16px Georgia, serif; }
        .play-back { padding: 8px 12px; border-radius: 24px; font-size: 10px; }
        .play-info { position: absolute; right: 16px; top: 58px; width: min(340px, calc(100% - 32px)); max-height: calc(100% - 74px); overflow: auto; padding: 20px; border: 1px solid var(--play-line); border-radius: 14px; background: var(--play-bg); box-shadow: 0 12px 45px var(--play-shadow); outline: none; }
        .play-info-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .play-info-heading h2 { font-size: 13px; font-weight: 500; }
        .play-info-heading button { padding: 4px 8px; font-size: 20px; }
        .play-info p { font-size: 12px; line-height: 1.7; margin-top: 12px; }
        .play-keyboard { color: var(--play-muted); }
        .play-start { font-size: 10px; border-bottom: 1px solid var(--play-line); margin-top: 16px; padding-bottom: 4px; }
        .is-expanded .play-row { flex: 1; width: 100%; aspect-ratio: auto; min-height: 0; }
        .is-expanded .play-caption { width: 100%; }
        @media (max-width: 640px) { .play-row, .play-caption { width: min(88vw, calc(100svh - 270px)); } .play-open-hint { opacity: 1; max-width: calc(100% - 24px); white-space: normal; } .play-piece-tools { top: 12px; right: 12px; } }
        @media (prefers-reduced-motion: reduce) { .play-open-hint { transition: none; } }
      `}</style>
    </div>
  )
}
