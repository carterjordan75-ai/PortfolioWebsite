import { useEffect } from 'react'

// Close an overlay when Escape is pressed. Pair it with a backdrop `onClick`
// (click-outside) so every isolated view / modal on the site dismisses the
// same basic way: click the space around it, or hit Escape.
export function useEscapeToClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, onClose])
}
