'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const ADMIN_PASSWORD = '3432'

type Section = 'dashboard' | 'work' | 'archive' | 'experiments' | 'look' | 'info'

export default function AdminPortal({ show, onClose }: { show: boolean; onClose: () => void }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [activeSection, setActiveSection] = useState<Section>('dashboard')
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset auth every time portal is closed
  useEffect(() => {
    if (!show) {
      setAuthenticated(false)
      setPassword('')
    }
  }, [show])

  useEffect(() => {
    if (show && !authenticated && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [show, authenticated])

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setAuthenticated(true)
      setError(false)
    } else {
      setError(true)
      setPassword('')
      setTimeout(() => setError(false), 1500)
    }
  }

  const handleLogout = () => {
    setAuthenticated(false)
    setPassword('')
    onClose()
  }

  const sections: { id: Section; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'work', label: 'Work Page' },
    { id: 'archive', label: 'Index / Archive' },
    { id: 'experiments', label: 'Misc' },
    { id: 'look', label: 'Look Gallery' },
    { id: 'info', label: 'Info / About' },
  ]

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '90vw',
              maxWidth: authenticated ? '900px' : '400px',
              maxHeight: '80vh',
              background: '#111111',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.08)',
              overflow: 'hidden',
              cursor: 'default',
            }}
          >
            {!authenticated ? (
              /* Login screen */
              <div className="p-8 flex flex-col items-center">
                <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center mb-4">
                  <span className="text-white/50 text-[14px]">🔒</span>
                </div>
                <p className="text-white/40 text-[9px] uppercase tracking-[0.2em] mb-6">Admin Code</p>
                <input
                  ref={inputRef}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={password}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 4)
                    setPassword(val)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="• • • •"
                  className="w-full max-w-[180px] px-4 py-2.5 rounded-full text-[16px] text-center tracking-[0.5em] bg-white/5 border border-white/10 text-white placeholder-white/20 outline-none focus:border-white/25 transition-colors"
                  style={{
                    animation: error ? 'portalShake 0.4s ease-out' : 'none',
                  }}
                />
                <button
                  onClick={handleLogin}
                  className="mt-4 px-6 py-1.5 rounded-full text-[8px] uppercase tracking-[0.15em] font-bold text-white/60 border border-white/15 hover:border-white/30 hover:text-white/80 transition-all hover:scale-105 active:scale-95"
                >
                  Enter
                </button>
                {error && (
                  <p className="mt-3 text-[9px] text-red-400/70 uppercase tracking-widest">Invalid password</p>
                )}
                <style>{`
                  @keyframes portalShake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-8px); }
                    75% { transform: translateX(8px); }
                  }
                `}</style>
              </div>
            ) : (
              /* Admin dashboard */
              <div className="flex h-[70vh]">
                {/* Sidebar */}
                <div className="w-[200px] border-r border-white/8 py-4 px-3 flex flex-col flex-shrink-0">
                  <p className="text-white/30 text-[8px] uppercase tracking-[0.2em] px-2 mb-3">Manage</p>
                  {sections.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setActiveSection(s.id)}
                      className={`text-left px-3 py-2 rounded-lg text-[10px] uppercase tracking-[0.08em] transition-all mb-0.5 ${
                        activeSection === s.id
                          ? 'bg-white/10 text-white font-bold'
                          : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                  <div className="mt-auto pt-4 border-t border-white/8">
                    <button
                      onClick={handleLogout}
                      className="text-[8px] uppercase tracking-[0.12em] text-red-400/60 hover:text-red-400 transition-colors px-3 py-1"
                    >
                      Logout
                    </button>
                  </div>
                </div>

                {/* Main content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {activeSection === 'dashboard' && (
                    <div>
                      <h2 className="text-white text-[14px] font-bold uppercase tracking-[0.1em] mb-4">Dashboard</h2>
                      <div className="grid grid-cols-3 gap-3 mb-6">
                        <StatCard label="Total Views" value={typeof window !== 'undefined' ? localStorage.getItem('jc-visits') || '0' : '0'} />
                        <StatCard label="Hearts" value={typeof window !== 'undefined' ? localStorage.getItem('jc-hearts') || '0' : '0'} />
                        <StatCard label="Projects" value="7" />
                      </div>
                      <p className="text-white/30 text-[9px] leading-[1.8] uppercase tracking-[0.08em]">
                        Welcome to the admin portal. Use the sidebar to manage content across each section of your site. Upload media, reorder projects, and edit text directly.
                      </p>
                    </div>
                  )}

                  {activeSection === 'work' && (
                    <SectionPanel
                      title="Work Page"
                      description="Manage the carousel cards, person image, and featured project links."
                      fields={[
                        { label: 'Person Image', type: 'file' },
                        { label: 'Card 1 — Video URL', type: 'text' },
                        { label: 'Card 2 — Video URL', type: 'text' },
                        { label: 'Card 3 — Video URL', type: 'text' },
                        { label: 'Carousel Speed', type: 'text' },
                        { label: 'Background Audio', type: 'file' },
                      ]}
                    />
                  )}

                  {activeSection === 'archive' && (
                    <SectionPanel
                      title="Index / Archive"
                      description="Add, remove, or reorder projects. Edit client names, titles, years, and categories."
                      fields={[
                        { label: 'Add New Project', type: 'button' },
                        { label: 'Project Order', type: 'text' },
                        { label: 'Featured Projects (slugs)', type: 'text' },
                        { label: 'Category Filter Options', type: 'text' },
                      ]}
                    />
                  )}

                  {activeSection === 'experiments' && (
                    <SectionPanel
                      title="Misc / Experiments"
                      description="Upload images and videos for the left and right panels."
                      fields={[
                        { label: 'Left Panel — Upload Media', type: 'file' },
                        { label: 'Right Panel — Upload Media', type: 'file' },
                        { label: 'Left Panel Order (JSON)', type: 'text' },
                        { label: 'Right Panel Order (JSON)', type: 'text' },
                      ]}
                    />
                  )}

                  {activeSection === 'look' && (
                    <SectionPanel
                      title="Look Gallery"
                      description="Upload reference images and videos. Add credits and source links."
                      fields={[
                        { label: 'Choose File', type: 'file' },
                        { label: 'Credits', type: 'text' },
                        { label: 'Link', type: 'text' },
                      ]}
                    />
                  )}

                  {activeSection === 'info' && (
                    <SectionPanel
                      title="Info / About"
                      description="Edit bio, experience, recognition, and contact details."
                      fields={[
                        { label: 'Polaroid Image', type: 'file' },
                        { label: 'Role Description', type: 'text' },
                        { label: 'Location', type: 'text' },
                        { label: 'Experience (JSON)', type: 'text' },
                        { label: 'Recognition (JSON)', type: 'text' },
                        { label: 'Bio Blurb', type: 'text' },
                        { label: 'Client Logos — Upload', type: 'file' },
                      ]}
                    />
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-3 border border-white/8 bg-white/3">
      <p className="text-white/30 text-[7px] uppercase tracking-[0.15em] mb-1">{label}</p>
      <p className="text-white text-[22px] font-black tracking-tight">{value}</p>
    </div>
  )
}

function SectionPanel({ title, description, fields }: {
  title: string
  description: string
  fields: { label: string; type: 'text' | 'file' | 'button' }[]
}) {
  return (
    <div>
      <h2 className="text-white text-[14px] font-bold uppercase tracking-[0.1em] mb-1">{title}</h2>
      <p className="text-white/30 text-[9px] leading-[1.6] mb-6">{description}</p>
      <div className="space-y-4">
        {fields.map((field, i) => (
          <div key={i}>
            <label className="text-white/50 text-[8px] uppercase tracking-[0.12em] block mb-1.5">{field.label}</label>
            {field.type === 'text' && (
              <input
                type="text"
                className="w-full px-3 py-2 rounded-lg text-[11px] bg-white/5 border border-white/10 text-white placeholder-white/20 outline-none focus:border-white/25 transition-colors"
                placeholder={`Enter ${field.label.toLowerCase()}...`}
              />
            )}
            {field.type === 'file' && (
              <div className="flex items-center gap-3">
                <label className="px-4 py-2 rounded-full text-[8px] uppercase tracking-[0.12em] font-bold text-white/50 border border-white/15 cursor-pointer hover:border-white/30 hover:text-white/70 transition-all">
                  Choose File
                  <input type="file" className="hidden" accept="image/*,video/*" />
                </label>
                <span className="text-white/20 text-[9px]">No file selected</span>
              </div>
            )}
            {field.type === 'button' && (
              <button className="px-4 py-2 rounded-full text-[8px] uppercase tracking-[0.12em] font-bold text-white/60 border border-white/15 hover:border-white/30 hover:text-white/80 transition-all hover:scale-105 active:scale-95">
                + Add New
              </button>
            )}
          </div>
        ))}
        <div className="pt-4 border-t border-white/8 mt-6">
          <button className="px-5 py-2 rounded-full text-[8px] uppercase tracking-[0.15em] font-bold bg-white text-black hover:scale-105 active:scale-95 transition-all">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
