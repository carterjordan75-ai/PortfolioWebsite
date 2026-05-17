'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { startAmbientAudio } from '@/lib/ambientAudio'

export default function GatePage() {
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      })
      if (res.ok) {
        // Kick off the ambient drone while the click gesture is still "live"
        // in the browser's activation tracking — this is the only window where
        // unmuted autoplay is allowed. The home page then adopts the same
        // singleton audio element instead of creating a fresh one.
        startAmbientAudio()
        router.push('/')
        router.refresh()
      } else {
        setError('Incorrect passcode')
        setSubmitting(false)
      }
    } catch {
      setError('Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <main
      className="fixed inset-0 flex items-center justify-center px-6 overflow-hidden"
      style={{ background: '#000', color: '#fff' }}
    >
      {/* Blurred home video backdrop. Path is the bonfire home-video that's
          already shipped in /public/assets/home-videos and served by the
          /assets/* static route (which middleware lets through unauthed, so
          this works on the gate page before login). The blur + slight scale
          gives a soft, painterly backdrop without crisp edges. */}
      <video
        autoPlay
        muted
        loop
        playsInline
        src="/assets/home-videos/jordan-carter-home-videos-bonfire01webm-bonfire01-mozqomuj.webm"
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          filter: 'blur(48px) saturate(1.4) brightness(0.55)',
          transform: 'scale(1.15)',
          willChange: 'transform, filter',
        }}
      />
      {/* Soft dark overlay — adds extra contrast for white text without
          crushing the warm orange of the fire underneath. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)' }}
      />

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-sm flex flex-col items-center text-center"
      >
        {/* XOXO wordmark — inverted to white via CSS filter so the same
            artwork works on the dark backdrop. */}
        <div
          role="img"
          aria-label="XOXO"
          className="block mb-6"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          style={{
            backgroundImage: 'url(/assets/Logos/xoxo_Logo_001.png)',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundSize: 'contain',
            height: 'clamp(2rem, 5vw, 3.5rem)',
            width: 'clamp(12rem, 30vw, 22rem)',
            filter: 'invert(1)',
          }}
        />

        <p
          className="text-[9px] md:text-[10px] uppercase tracking-[0.22em] font-bold mb-6"
          style={{ opacity: 0.75, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}
        >
          Currently under construction
        </p>

        <input
          type="password"
          value={passcode}
          onChange={(e) => { setPasscode(e.target.value); setError('') }}
          placeholder="Enter passcode"
          autoFocus
          className="w-full text-center text-[12px] uppercase tracking-[0.18em] font-bold py-3 px-4 rounded-full outline-none"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: `1px solid ${error ? '#ff6666' : 'rgba(255,255,255,0.22)'}`,
            color: '#fff',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            transition: 'border-color 0.18s ease-out, background 0.18s ease-out',
          }}
        />

        {error && (
          <p className="text-[10px] uppercase tracking-[0.15em] font-bold mt-3" style={{ color: '#ff8080', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !passcode}
          className="mt-4 py-2.5 px-8 rounded-full text-[10px] uppercase tracking-[0.18em] font-bold transition-all hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: 'rgba(255,255,255,0.92)',
            color: '#0a0a0a',
            border: 'none',
          }}
        >
          {submitting ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </main>
  )
}
