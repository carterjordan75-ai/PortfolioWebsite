/**
 * Module-level singleton for the home-page ambient drone.
 *
 * Why it lives outside the React tree: the audio element used to be conditionally
 * mounted by Navigation (only on `/`). That meant a fresh `<audio>` was created
 * AFTER the gate's `router.push('/')` navigation, so by the time `play()` was
 * called the user's "click submit" gesture had already expired in the browser's
 * activation tracking and autoplay was blocked.
 *
 * By holding the HTMLAudioElement in a module-level variable, we can call
 * `startAmbientAudio()` synchronously from inside the gate's submit handler
 * (still inside the click gesture). The browser allows that play(), the audio
 * survives the client-side navigation, and the home page just adopts the
 * already-playing element.
 *
 * For visitors who arrive at `/` directly (cookie still valid, no gate), the
 * Navigation header tries play() on mount + falls back to "first user
 * interaction" — same as before.
 */

let audio: HTMLAudioElement | null = null

const AUDIO_SRC = '/assets/audio/ambient-drone.m4a'

export function getAmbientAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null
  if (!audio) {
    audio = new Audio(AUDIO_SRC)
    audio.loop = true
    audio.preload = 'auto'
  }
  return audio
}

export async function startAmbientAudio(): Promise<void> {
  const a = getAmbientAudio()
  if (!a) return
  try {
    await a.play()
  } catch {
    // Autoplay blocked. Caller will set up a "first interaction" fallback.
  }
}

export function pauseAmbientAudio(): void {
  const a = getAmbientAudio()
  if (a) a.pause()
}

export function isAmbientPlaying(): boolean {
  const a = getAmbientAudio()
  return a ? !a.paused : false
}
