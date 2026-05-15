import { NextRequest, NextResponse } from 'next/server'

const upgrades: Record<string, string[]> = {
  'good': ['exceptional', 'refined', 'distinctive'],
  'nice': ['elegant', 'considered', 'intentional'],
  'make': ['craft', 'forge', 'build'],
  'making': ['crafting', 'forging', 'building'],
  'work': ['practice', 'output', 'craft'],
  'things': ['systems', 'experiences', 'artifacts'],
  'stuff': ['work', 'output', 'pieces'],
  'cool': ['compelling', 'striking', 'bold'],
  'big': ['ambitious', 'expansive', 'large-scale'],
  'small': ['intimate', 'precise', 'focused'],
  'use': ['employ', 'leverage', 'utilise'],
  'using': ['employing', 'leveraging', 'utilising'],
  'like': ['drawn to', 'compelled by', 'inspired by'],
  'very': ['deeply', 'profoundly', 'intensely'],
  'really': ['genuinely', 'truly', 'fundamentally'],
  'try': ['explore', 'pursue', 'investigate'],
  'trying': ['exploring', 'pursuing', 'investigating'],
  'different': ['diverse', 'varied', 'multifaceted'],
  'new': ['emerging', 'pioneering', 'forward-thinking'],
  'old': ['established', 'time-tested', 'foundational'],
  'help': ['enable', 'empower', 'facilitate'],
  'show': ['reveal', 'illuminate', 'showcase'],
  'think': ['believe', 'envision', 'consider'],
  'get': ['achieve', 'attain', 'cultivate'],
  'create': ['forge', 'construct', 'realise'],
  'creating': ['forging', 'constructing', 'realising'],
  'idea': ['vision', 'concept', 'proposition'],
  'ideas': ['visions', 'concepts', 'propositions'],
  'project': ['endeavour', 'commission', 'body of work'],
  'projects': ['endeavours', 'commissions', 'bodies of work'],
  'design': ['design', 'visual system', 'creative direction'],
  'art': ['art', 'visual language', 'creative expression'],
  'digital': ['digital', 'computational', 'screen-based'],
  'move': ['propel', 'drive', 'animate'],
  'moving': ['propelling', 'driving', 'animating'],
  'change': ['transform', 'evolve', 'reimagine'],
  'start': ['begin', 'initiate', 'catalyse'],
  'end': ['culminate', 'resolve', 'conclude'],
  'look': ['aesthetic', 'visual identity', 'form'],
  'feel': ['sensibility', 'atmosphere', 'presence'],
  'strong': ['bold', 'commanding', 'authoritative'],
  'interesting': ['compelling', 'nuanced', 'provocative'],
  'important': ['essential', 'critical', 'vital'],
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Improve text with vocabulary upgrades
function improveText(text: string, context: string): string {
  // Strip HTML to get plain text
  const plain = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!plain) return text

  const words = plain.split(/\s+/)

  const improved = words.map(word => {
    const lower = word.toLowerCase().replace(/[.,!?;:'"—–\-]/g, '')
    const punct = word.match(/[.,!?;:'"—–\-]+$/)?.[0] || ''
    const clean = word.replace(/[.,!?;:'"—–\-]+$/, '')

    if (upgrades[lower]) {
      const replacement = pick(upgrades[lower])
      const result = clean[0] === clean[0]?.toUpperCase()
        ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
        : replacement
      return result + punct
    }
    return word
  })

  let result = improved.join(' ')

  if (context === 'footer' && result.length < 120) {
    result += pick([
      ' Every project is an invitation to push further.',
      ' Where precision meets experimentation.',
      ' The work lives at the edge of control and accident.',
      ' Rooted in craft, driven by curiosity.',
    ])
  }

  return result.replace(/\s+/g, ' ').trim()
}

// Typography styles for experimental layout
const typoStyles = [
  { size: 'text-[18px]', weight: 'font-black', extra: 'leading-[1.1] tracking-[-0.02em]' },
  { size: 'text-[10px]', weight: '', extra: 'leading-[1.5] tracking-[0.01em]' },
  { size: 'text-[13px]', weight: 'font-light italic', extra: 'leading-[1.3]' },
  { size: 'text-[15px]', weight: 'font-black', extra: 'leading-[1.2] tracking-[-0.02em]' },
  { size: 'text-[9px]', weight: '', extra: 'leading-[1.5]' },
  { size: 'text-[12px]', weight: 'font-bold', extra: 'leading-[1.3]' },
  { size: 'text-[14px]', weight: 'font-light italic', extra: 'leading-[1.2]' },
  { size: 'text-[11px]', weight: 'font-bold', extra: 'leading-[1.3]' },
  { size: 'text-[16px]', weight: 'font-black italic', extra: 'leading-[1.1] tracking-[-0.01em]' },
  { size: 'text-[10px]', weight: '', extra: 'leading-[1.5]' },
  { size: 'text-[8px]', weight: '', extra: 'leading-[1.6]' },
  { size: 'text-[20px]', weight: 'font-black', extra: 'leading-[1.0] tracking-[-0.03em]' },
  { size: 'text-[11px]', weight: 'font-light', extra: 'leading-[1.4]' },
  { size: 'text-[13px]', weight: 'font-bold italic', extra: 'leading-[1.2]' },
]

// Convert plain text into experimental typography HTML
function experimentalLayout(text: string): string {
  const plain = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!plain) return text

  // Split into phrases of 2-5 words
  const words = plain.split(/\s+/)
  const phrases: string[] = []
  let i = 0
  while (i < words.length) {
    const len = 2 + Math.floor(Math.random() * 4)
    phrases.push(words.slice(i, i + len).join(' '))
    i += len
  }

  // Assign random typography style to each phrase
  let styleIdx = 0
  const spans = phrases.map((phrase) => {
    const style = typoStyles[styleIdx % typoStyles.length]
    styleIdx += 1 + Math.floor(Math.random() * 2) // Skip some for variety

    // Occasionally add reduced opacity
    const opacity = Math.random() < 0.12 ? ' style="opacity: 0.5;"' : ''

    return `<span class="${style.size} ${style.weight} ${style.extra}"${opacity}>${phrase} </span>`
  })

  return spans.join('')
}

export async function POST(request: NextRequest) {
  try {
    const { text, context, mode } = await request.json()

    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 })
    }

    if (mode === 'improve') {
      // Just improve the writing
      const improved = improveText(text, context || 'general')
      return NextResponse.json({ success: true, original: text, improved })
    }

    if (mode === 'layout') {
      // Just apply experimental typography to existing text
      const html = experimentalLayout(text)
      return NextResponse.json({ success: true, original: text, html })
    }

    if (mode === 'both' || !mode) {
      // Improve writing + apply experimental typography
      const improved = improveText(text, context || 'general')
      const html = experimentalLayout(improved)
      return NextResponse.json({ success: true, original: text, improved, html })
    }

    return NextResponse.json({ error: 'Unknown mode' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
