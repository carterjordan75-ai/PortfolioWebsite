'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

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
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{ background: '#f5f3ee', color: '#0a0a0a' }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm flex flex-col items-center text-center"
      >
        {/* XOXO wordmark — same image as the top-left header logo */}
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
          }}
        />

        <p className="text-[9px] md:text-[10px] uppercase tracking-[0.22em] font-bold mb-6" style={{ opacity: 0.5 }}>
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
            background: 'rgba(0,0,0,0.04)',
            border: `1px solid ${error ? '#cc2222' : 'rgba(0,0,0,0.15)'}`,
            color: '#0a0a0a',
            transition: 'border-color 0.18s ease-out',
          }}
        />

        {error && (
          <p className="text-[10px] uppercase tracking-[0.15em] font-bold mt-3" style={{ color: '#cc2222' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !passcode}
          className="mt-4 py-2.5 px-8 rounded-full text-[10px] uppercase tracking-[0.18em] font-bold transition-all hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: '#0a0a0a',
            color: '#f5f3ee',
            border: 'none',
          }}
        >
          {submitting ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </main>
  )
}
