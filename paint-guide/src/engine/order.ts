import { type LAB, deltaE76 } from './color'

// Greedy nearest-neighbour chain through the colours, starting from the
// darkest (lowest L*). Each colour ends up close to the previous one, which is
// what makes "nudge the last mix into this one" guidance useful.
export function orderBySimilarColour(labs: LAB[]): number[] {
  const n = labs.length
  if (n === 0) return []

  const used = new Array<boolean>(n).fill(false)

  let start = 0
  for (let i = 1; i < n; i++) {
    if (labs[i][0] < labs[start][0]) start = i
  }

  const order = [start]
  used[start] = true

  for (let step = 1; step < n; step++) {
    const last = order[order.length - 1]
    let next = -1
    let nd = Infinity
    for (let i = 0; i < n; i++) {
      if (used[i]) continue
      const d = deltaE76(labs[last], labs[i])
      if (d < nd) {
        nd = d
        next = i
      }
    }
    order.push(next)
    used[next] = true
  }
  return order
}

// Order colours by where they first appear in row-major (reading) order.
// `firstSeen[colourIndex]` is the cell index of that colour's first pixel.
export function orderByReading(firstSeen: number[]): number[] {
  return firstSeen
    .map((_, i) => i)
    .sort((a, b) => firstSeen[a] - firstSeen[b])
}
