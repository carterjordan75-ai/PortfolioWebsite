'use client'

import { useState } from 'react'
import PageTransition from '@/components/PageTransition'
import EmailPopup from '@/components/EmailPopup'
import AdminPortal from '@/components/AdminPortal'
import { useDarkMode } from '@/contexts/DarkModeContext'

const clientLogos: { name: string; logo?: string }[] = [
  { name: 'NIKE', logo: '/assets/Logos/Logo_NIKE.svg' },
  { name: 'ADIDAS', logo: '/assets/Logos/Logo_ADIDAS.png' },
  { name: 'KFC' }, { name: 'CAT' }, { name: 'TIFFANY & CO' },
  { name: 'HUNTER' }, { name: 'META' }, { name: 'SAMSUNG' },
  { name: 'HUMANRACE' }, { name: 'FENTY' }, { name: 'UMG' },
  { name: 'MERRELL' }, { name: 'JORDAN' }, { name: 'AMIRI' },
]

export default function AboutPage() {
  const { dark, fg, fg60, borderThick } = useDarkMode()
  const [showEmail, setShowEmail] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)

  const pageBg = dark ? '#0a0a0a' : '#f5f5f0'
  const rule = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
  const dim = dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'
  const vdim = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'

  return (
    <PageTransition>
      <div style={{ background: pageBg, color: fg, minHeight: '100vh' }}>

        <div className="flex" style={{ height: '100vh', paddingTop: '68px' }}>

          {/* LEFT — 2/3 */}
          <div
            className="w-full md:w-[67%] flex-shrink-0 overflow-hidden"
            style={{ borderRight: `1px solid ${rule}` }}
          >
            <div className="h-full flex flex-col justify-between px-6 md:px-8 py-5">

              {/* Top section — image left, schedule-style info right */}
              <div className="flex gap-6 min-h-0">

                {/* Left column — Polaroid + work history */}
                <div className="flex-shrink-0 flex flex-col w-[320px]">
                  <div className="w-full relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/assets/TestMedia/PolaroidTest.webp"
                      alt="Jordan Carter"
                      className="w-full h-auto object-cover"
                    />
                  </div>
                  <span className="text-[7px] font-mono mt-1 mb-3 block" style={{ opacity: 0.2 }}>FIG. 001 — MELBOURNE, 2024</span>

                </div>

                {/* Right column — info list + blurb */}
                <div className="flex-1 flex flex-col">

                  {/* Spacer — push list down ~5% */}
                  <div className="h-[5%]" />

                  {/* Schedule-style info list — progressively indented right */}
                  <div className="space-y-[2px]">
                    <div className="flex items-baseline">
                      <span className="text-[9px] font-bold w-[28px] flex-shrink-0">01</span>
                      <span className="text-[9px] font-black w-[100px] flex-shrink-0 uppercase tracking-[0.02em]">Role</span>
                      <span className="text-[8px] font-mono mr-2" style={{ opacity: 0.3 }}>01.1 /</span>
                      <span className="text-[9px]">Creative Direction, Design</span>
                      <span className="flex-1 border-b mx-2" style={{ borderColor: vdim }} />
                    </div>
                    <div className="flex items-baseline" style={{ paddingLeft: '128px' }}>
                      <span className="text-[8px] font-mono mr-2" style={{ opacity: 0.3 }}>01.2 /</span>
                      <span className="text-[9px]">Motion &amp; 3D Animation</span>
                      <span className="flex-1 border-b mx-2" style={{ borderColor: vdim }} />
                    </div>
                    <div className="flex items-baseline mt-2" style={{ paddingLeft: '12px' }}>
                      <span className="text-[9px] font-bold w-[28px] flex-shrink-0">02</span>
                      <span className="text-[9px] font-black w-[100px] flex-shrink-0 uppercase tracking-[0.02em]">Based</span>
                      <span className="text-[8px] font-mono mr-2" style={{ opacity: 0.3 }}>02.1 /</span>
                      <span className="text-[9px]">Melbourne, Australia</span>
                      <span className="flex-1 border-b mx-2" style={{ borderColor: vdim }} />
                    </div>
                    <div className="flex items-baseline mt-2" style={{ paddingLeft: '28px' }}>
                      <span className="text-[9px] font-bold w-[28px] flex-shrink-0">03</span>
                      <span className="text-[9px] font-black w-[100px] flex-shrink-0 uppercase tracking-[0.02em]">Current</span>
                      <span className="text-[8px] font-mono mr-2" style={{ opacity: 0.3 }}>03.1 /</span>
                      <span className="text-[9px]">META — 2024–Present</span>
                      <span className="flex-1 border-b mx-2" style={{ borderColor: vdim }} />
                    </div>
                    <div className="flex items-baseline" style={{ paddingLeft: '156px' }}>
                      <span className="text-[8px] font-mono mr-2" style={{ opacity: 0.3 }}>03.2 /</span>
                      <span className="text-[9px]">Freelance — Melbourne, London</span>
                      <span className="flex-1 border-b mx-2" style={{ borderColor: vdim }} />
                    </div>
                    <div className="flex items-baseline mt-2" style={{ paddingLeft: '44px' }}>
                      <span className="text-[9px] font-bold w-[28px] flex-shrink-0">04</span>
                      <span className="text-[9px] font-black w-[100px] flex-shrink-0 uppercase tracking-[0.02em]">Education</span>
                      <span className="text-[8px] font-mono mr-2" style={{ opacity: 0.3 }}>04.1 /</span>
                      <span className="text-[9px]">RMIT University</span>
                      <span className="flex-1 border-b mx-2" style={{ borderColor: vdim }} />
                    </div>
                    <div className="flex items-baseline" style={{ paddingLeft: '172px' }}>
                      <span className="text-[8px] font-mono mr-2" style={{ opacity: 0.3 }}>04.2 /</span>
                      <span className="text-[9px]">Communication Design</span>
                      <span className="flex-1 border-b mx-2" style={{ borderColor: vdim }} />
                    </div>
                    <div className="flex items-baseline mt-2" style={{ paddingLeft: '60px' }}>
                      <span className="text-[9px] font-bold w-[28px] flex-shrink-0">05</span>
                      <span className="text-[9px] font-black w-[100px] flex-shrink-0 uppercase tracking-[0.02em]">Status</span>
                      <span className="text-[8px] font-mono mr-2" style={{ opacity: 0.3 }}>05.1 /</span>
                      <span className="text-[9px]">Available for select commissions ✱</span>
                      <span className="flex-1 border-b mx-2" style={{ borderColor: vdim }} />
                    </div>
                    <div className="flex items-baseline mt-2" style={{ paddingLeft: '76px' }}>
                      <span className="text-[9px] font-bold w-[28px] flex-shrink-0">06</span>
                      <span className="text-[9px] font-black w-[100px] flex-shrink-0 uppercase tracking-[0.02em]">Contact</span>
                      <span className="text-[8px] font-mono mr-2" style={{ opacity: 0.3 }}>06.1 /</span>
                      <span className="text-[9px]">carterjordan75@gmail.com</span>
                      <span className="flex-1 border-b mx-2" style={{ borderColor: vdim }} />
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="mt-8 mb-4" style={{ borderTop: `1px solid ${dim}` }} />

                  {/* Blurb — experimental type */}
                  <div className="max-w-[95%]" style={{ opacity: 0.8 }}>
                    <span className="text-[18px] font-black leading-[1.1] tracking-[-0.02em]">A multidisciplinary </span>
                    <span className="text-[10px] leading-[1.5] tracking-[0.01em]">creative practice working at </span>
                    <span className="text-[13px] font-light italic leading-[1.3]">the intersection </span>
                    <span className="text-[10px] leading-[1.5]">of design, technology and motion. </span>
                    <span className="text-[15px] font-black leading-[1.2] tracking-[-0.02em]">Building visual systems </span>
                    <span className="text-[9px] leading-[1.5]">that blur the line between </span>
                    <span className="text-[12px] font-bold leading-[1.3]">commercial storytelling </span>
                    <span className="text-[9px] leading-[1.5]">and </span>
                    <span className="text-[14px] font-light italic leading-[1.2]">experimental art</span>
                    <span className="text-[9px] leading-[1.5]"> — merging organic textures with precise geometric forms. </span>
                    <span className="text-[11px] font-bold leading-[1.3]">Every project starts with a question: </span>
                    <span className="text-[16px] font-black italic leading-[1.1] tracking-[-0.01em]">what would happen </span>
                    <span className="text-[10px] leading-[1.5]">if we pushed this further? </span>
                    <span className="text-[9px] leading-[1.5]" style={{ opacity: 0.5 }}>The work lives in the tension between control and accident.</span>
                  </div>

                </div>
              </div>

              {/* Work history + goals — full width row */}
              <div className="flex gap-6 mt-2">
                {/* Experience — left 50% */}
                <div className="w-1/2 space-y-[1px]">
                  <span className="text-[6px] font-mono uppercase tracking-[0.15em] block mb-1" style={{ opacity: 0.2 }}>Experience</span>
                  {[
                    { role: 'Senior Motion Designer', place: 'META', year: '2024–' },
                    { role: 'Freelance Director', place: 'Various Studios', year: '2021–24' },
                    { role: 'Motion Designer', place: 'Studio Nowhere', year: '2019–21' },
                    { role: 'Junior Designer', place: 'DDB Melbourne', year: '2018–19' },
                    { role: 'Intern', place: 'Clemenger BBDO', year: '2017' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-baseline py-[3px]" style={{ borderBottom: `1px solid ${vdim}` }}>
                      <span className="text-[8px] font-bold uppercase tracking-[0.02em] w-[40%] flex-shrink-0">{item.role}</span>
                      <span className="flex-1 border-b border-dotted mx-2" style={{ borderColor: vdim }} />
                      <span className="text-[8px] mx-2" style={{ opacity: 0.4 }}>{item.place}</span>
                      <span className="text-[7px] font-mono" style={{ opacity: 0.3 }}>{item.year}</span>
                    </div>
                  ))}
                </div>

                {/* Working towards — right 50% */}
                <div className="w-1/2 space-y-[1px]">
                  <span className="text-[6px] font-mono uppercase tracking-[0.15em] block mb-1" style={{ opacity: 0.2 }}>Working Towards</span>
                  {[
                    { goal: 'Real-time generative installations', detail: 'Ongoing', status: '→' },
                    { goal: 'AI-assisted creative tools', detail: 'Research', status: '◐' },
                    { goal: 'Physical-digital hybrid experiences', detail: 'In progress', status: '→' },
                    { goal: 'Open-source motion toolkit', detail: 'Planning', status: '○' },
                    { goal: 'Solo exhibition — Melbourne', detail: '2026', status: '✱' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-baseline py-[3px]" style={{ borderBottom: `1px solid ${vdim}` }}>
                      <span className="text-[8px] font-bold uppercase tracking-[0.02em] w-[45%] flex-shrink-0">{item.goal}</span>
                      <span className="flex-1 border-b border-dotted mx-2" style={{ borderColor: vdim }} />
                      <span className="text-[8px] mx-2" style={{ opacity: 0.4 }}>{item.detail}</span>
                      <span className="text-[7px] font-mono" style={{ opacity: 0.3 }}>{item.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom — tools + client list in schedule style */}
              <div className="mt-3 pt-2" style={{ borderTop: `1px solid ${dim}` }}>

                {/* Tools row */}
                <div className="flex items-baseline mb-1">
                  <span className="text-[8px] font-bold tracking-[0.1em] uppercase w-[52px] flex-shrink-0" style={{ opacity: 0.4 }}>Tools</span>
                  <span className="text-[7px] tracking-[0.03em] uppercase" style={{ opacity: 0.3 }}>
                    Cinema 4D · Redshift · After Effects · TouchDesigner · Figma · Blender · WebGL · React · Three.js · Houdini
                  </span>
                </div>

                {/* Clients row */}
                <div className="flex items-baseline">
                  <span className="text-[8px] font-bold tracking-[0.1em] uppercase w-[52px] flex-shrink-0" style={{ opacity: 0.4 }}>Clients</span>
                  <span className="text-[7px] tracking-[0.03em] uppercase" style={{ opacity: 0.3 }}>
                    Nike · Adidas Originals · KFC · CAT · Tiffany &amp; Co · Hunter Boots · META · Samsung · Humanrace · Fenty · UMG · Merrell · Jordan · Amiri
                  </span>
                </div>


              </div>

            </div>
          </div>

          {/* RIGHT — 1/3 — Client logos grid */}
          <div className="hidden md:flex w-[33%] flex-col justify-center items-center overflow-hidden">
            <div className="px-4 py-4 w-full h-full flex flex-col justify-center">
              <span className="text-[7px] tracking-[0.2em] uppercase font-bold block mb-4 text-center" style={{ opacity: 0.2 }}>
                Selected Clients
              </span>

              <div className="grid grid-cols-2 gap-[1px] w-full">
                {clientLogos.map((client, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-center py-5 px-2 group transition-all hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                    style={{ border: `0.5px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` }}
                  >
                    {client.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={client.logo}
                        alt={client.name}
                        className="h-6 w-auto object-contain transition-opacity duration-200 group-hover:opacity-100"
                        style={{ opacity: 0.7, filter: dark ? 'invert(1)' : 'none' }}
                      />
                    ) : (
                      <span
                        className="font-black tracking-[0.05em] text-center uppercase transition-opacity duration-200 group-hover:opacity-100"
                        style={{
                          fontSize: client.name.length > 10 ? '9px' : client.name.length > 6 ? '11px' : '14px',
                          opacity: 0.7,
                          letterSpacing: '0.1em',
                        }}
                      >
                        {client.name}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <p className="text-[7px] tracking-[0.08em] uppercase text-center mt-4" style={{ opacity: 0.15 }}>
                &amp; more
              </p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <footer className="px-6 md:px-10 py-5" style={{ borderTop: `3px solid ${borderThick}` }}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-3 flex-shrink-0">
              <button onClick={() => setShowEmail(true)} className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}` }}>Email</button>
              <a href="https://instagram.com/jordanscarter" target="_blank" rel="noopener noreferrer" className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}` }}>Insta</a>
            </div>
            <p className="hidden md:block text-[9px] leading-[1.5] tracking-[0.04em] uppercase max-w-2xl text-center" style={{ color: fg60 }}>
              A multidisciplinary creative practice spanning motion design, 3D environments, generative art, and illustration. Every project merges craft with experimentation.
            </p>
            <div className="flex gap-3 flex-shrink-0">
              <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="w-14 h-14 rounded-full flex items-center justify-center text-[16px] hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}` }} aria-label="Back to top">↑</button>
              <button onClick={() => setShowAdmin(true)} className="w-14 h-14 rounded-full flex items-center justify-center text-[8px] uppercase tracking-[0.1em] font-bold hover:scale-105 transition-transform" style={{ border: `1.5px solid ${borderThick}`, color: fg60 }}>© 2026</button>
            </div>
          </div>
        </footer>

        <EmailPopup show={showEmail} onClose={() => setShowEmail(false)} />
        <AdminPortal show={showAdmin} onClose={() => setShowAdmin(false)} />
      </div>
    </PageTransition>
  )
}
