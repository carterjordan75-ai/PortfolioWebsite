'use client'

import { Gate } from '../dailies/ui'

/**
 * The logo tuner — the tool the site's loader animation is designed in.
 *
 * Hidden: nothing links to it, and it carries the dailies password
 * rather than a second one, so there is one credential to remember
 * rather than two.
 *
 * The tool itself is a self-contained page of generated CSS and SVG, so
 * it runs in an iframe instead of being rewritten as components. That is
 * deliberate — it is the same artefact the tuner exports, which means
 * what you see here is exactly what a downloaded copy does, with no
 * second implementation to drift.
 */
export default function LogoToolPage() {
  return (
    <Gate title="Logo" subtitle="Loader tuner">
      {signOut => <Tool signOut={signOut} />}
    </Gate>
  )
}

function Tool({ signOut }: { signOut: () => Promise<void> }) {
  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.12)',
          color: '#ededed', flex: '0 0 auto',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          Logo
        </span>
        <span style={{ fontSize: 9, opacity: 0.4, letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: 'auto' }}>
          Loader tuner
        </span>
        <button
          onClick={signOut}
          style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: '#ededed', background: 'transparent',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: 99,
            padding: '7px 14px', cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </header>
      <iframe
        src="/api/logo-tool"
        title="XOXO loader tuner"
        style={{ flex: 1, width: '100%', border: 0, display: 'block' }}
      />
    </div>
  )
}
