/**
 * Module-level singleton for the home-page ambient loop.
 *
 * Why it lives outside the React tree: playback used to start after the
 * gate's `router.push('/')` navigation, by which time the user's "click
 * submit" gesture had expired in the browser's activation tracking and
 * autoplay was blocked. Holding the audio graph in module scope lets the
 * gate call `startAmbientAudio()` synchronously inside the submit
 * handler — the AudioContext is created and resumed while the gesture is
 * still live — and the running graph survives the client-side navigation.
 *
 * Why Web Audio rather than an HTMLAudioElement: the track is a composed
 * 150.000s seamless loop, and an <audio loop> element restarts across the
 * AAC encoder's priming/remainder padding — a ~70ms hiccup at every seam.
 * An AudioBufferSourceNode loops sample-accurately between loopStart and
 * loopEnd, so the seam is inaudible. Decoders disagree about whether the
 * priming is trimmed (Safari trims it, Chrome historically does not), so
 * the loop points are chosen at runtime from the decoded duration.
 *
 * For visitors who arrive at `/` directly (cookie still valid, no gate),
 * the Navigation header tries to start on mount and falls back to "first
 * user interaction" — same behaviour as the old element.
 */

const AUDIO_SRC = '/assets/audio/home-loop.m4a'
const LOOP_SECONDS = 150            // the composition is exactly 64 bars at 102.4bpm
const PRIMING_SECONDS = 2112 / 44100 // AAC encoder delay baked into the file
const VOLUME = 0.9
const FADE_IN = 1.2
const FADE_OUT = 0.3

let ctx: AudioContext | null = null
let gain: GainNode | null = null
let buffer: AudioBuffer | null = null
let loading: Promise<void> | null = null
let srcNode: AudioBufferSourceNode | null = null
let loopStart = 0                   // decided once the buffer is decoded
let startedAt = 0                   // ctx.currentTime when the current source began
let offset = 0                      // position in the loop to resume from
let want = false                    // the caller's intent, across async gaps

const subscribers = new Set<(playing: boolean) => void>()
function emit() {
  subscribers.forEach(cb => cb(isAmbientPlaying()))
}

function ensureGraph(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new AC()
    gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(ctx.destination)
  }
  return ctx
}

function load(): Promise<void> {
  if (!loading) {
    loading = fetch(AUDIO_SRC)
      .then(r => r.arrayBuffer())
      .then(ab => ensureGraph()!.decodeAudioData(ab))
      .then(b => {
        buffer = b
        // If the decoder kept the container padding, the buffer runs
        // longer than the composition — skip the priming so the loop
        // points land on the composed seam.
        loopStart = b.duration - LOOP_SECONDS > 0.03 ? PRIMING_SECONDS : 0
      })
      .catch(() => {
        loading = null // allow a retry on the next start
      })
  }
  return loading
}

export async function startAmbientAudio(): Promise<void> {
  const c = ensureGraph()
  if (!c) return
  want = true
  // Resume inside the caller's gesture — this is the moment autoplay
  // policy cares about. Outside a gesture it may stay suspended; the
  // caller's first-interaction fallback will land here again.
  try { await c.resume() } catch { /* blocked; fall through */ }
  await load()
  if (!want || !buffer || srcNode || c.state !== 'running') return
  const node = c.createBufferSource()
  node.buffer = buffer
  node.loop = true
  node.loopStart = loopStart
  node.loopEnd = loopStart + LOOP_SECONDS
  node.connect(gain!)
  node.start(0, loopStart + (offset % LOOP_SECONDS))
  srcNode = node
  startedAt = c.currentTime
  const g = gain!.gain
  g.cancelScheduledValues(c.currentTime)
  g.setValueAtTime(g.value, c.currentTime)
  g.linearRampToValueAtTime(VOLUME, c.currentTime + FADE_IN)
  emit()
}

export function pauseAmbientAudio(): void {
  want = false
  if (!ctx || !srcNode) return
  const node = srcNode
  srcNode = null
  offset = (offset + ctx.currentTime - startedAt) % LOOP_SECONDS
  const g = gain!.gain
  g.cancelScheduledValues(ctx.currentTime)
  g.setValueAtTime(g.value, ctx.currentTime)
  g.linearRampToValueAtTime(0, ctx.currentTime + FADE_OUT)
  try { node.stop(ctx.currentTime + FADE_OUT + 0.05) } catch { /* already stopped */ }
  emit()
}

export function isAmbientPlaying(): boolean {
  return !!srcNode && !!ctx && ctx.state === 'running'
}

/**
 * The toggle UI follows the singleton through this rather than element
 * events (there is no element any more). Returns an unsubscribe.
 */
export function subscribeAmbient(cb: (playing: boolean) => void): () => void {
  subscribers.add(cb)
  return () => { subscribers.delete(cb) }
}
