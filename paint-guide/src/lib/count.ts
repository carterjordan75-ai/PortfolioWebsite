// Count painted cells in a done-bitmask (one byte per cell, 0/1).
export function countDone(done: Uint8Array | undefined): number {
  if (!done) return 0
  let n = 0
  for (let i = 0; i < done.length; i++) if (done[i]) n++
  return n
}

export function pct(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = s / 60
  if (m < 60) return `${Math.floor(m)}m ago`
  const h = m / 60
  if (h < 24) return `${Math.floor(h)}h ago`
  const d = h / 24
  if (d < 7) return `${Math.floor(d)}d ago`
  return `${Math.floor(d / 7)}w ago`
}
