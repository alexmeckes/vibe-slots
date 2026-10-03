// Pure drawing and loot logic: every function here maps state to rows of
// colored text segments, so the hooks module only paints and the tests can
// check frames without a surface.
import type { Loot, Show, Stash, Tier } from '../types'

export type Seg = { t: string; c?: string; b?: boolean; d?: boolean; i?: boolean }
export type Row = Seg[]

export const COLORS = {
  red: '#ff5f5f',
  yellow: '#ffd75f',
  cyan: '#5fd7ff',
  green: '#87d75f',
  magenta: '#d787ff',
  blue: '#5f87ff',
  gold: '#ffaf00',
  gray: '#8a8a8a',
  white: '#e4e4e4',
} as const

export const SYMBOLS: readonly { ch: string; c: string }[] = [
  { ch: '7', c: COLORS.red },
  { ch: '★', c: COLORS.yellow },
  { ch: '♦', c: COLORS.cyan },
  { ch: '♣', c: COLORS.green },
  { ch: '♥', c: COLORS.magenta },
  { ch: '$', c: COLORS.gold },
  { ch: '@', c: COLORS.blue },
]

export const TIERS: readonly Tier[] = ['common', 'rare', 'epic', 'legendary']

export const TIER_STYLE: Record<Tier, { c: string; stars: number; call: string }> = {
  common: { c: COLORS.white, stars: 1, call: 'NO MATCH · consolation prize' },
  rare: { c: COLORS.cyan, stars: 2, call: 'TWO OF A KIND' },
  epic: { c: COLORS.magenta, stars: 3, call: 'TRIPLE!' },
  legendary: { c: COLORS.gold, stars: 4, call: '7 7 7  J A C K P O T' },
}

export const LOOT: Record<Tier, readonly [string, string][]> = {
  common: [
    ['Slightly Used Rubber Duck', 'It has heard things.'],
    ['Half a Stack Overflow Answer', 'The accepted half, at least.'],
    ['console.log("here")', 'Load-bearing. Do not remove.'],
    ['TODO Comment (2019)', 'Someday.'],
    ['A Single Passing Test', 'Cherish it.'],
    ['Pile of Lint Warnings', 'Mostly about trailing commas.'],
  ],
  rare: [
    ['Off-by-One Amulet', 'Grants +1 to every loop. Or -1.'],
    ['Cache Invalidation Charm', 'Works until it does not.'],
    ['Well-Named Variable', 'Not "data2". A real name.'],
    ['Green CI Badge', 'Screenshot it before it flakes.'],
    ['Reproducible Bug Report', 'Steps 1 through 3, and they work.'],
  ],
  epic: [
    ['Zero-Diff Refactor', 'Everything changed. Nothing changed.'],
    ['Flaky Test Exorcism Kit', 'Holy water sold separately.'],
    ['The 2,000-Line Deletion', 'The best code is no code.'],
    ['Rubber Duck That Talks Back', 'It has opinions about your naming.'],
  ],
  legendary: [
    ['Regex That Works First Try', 'Scholars will study this day.'],
    ['Merge With No Conflicts', 'The rebase gods smile upon you.'],
    ['The Golden Semicolon', 'Compiles on the first try.'],
    ['Docs That Match The Code', 'Thought to be a myth.'],
    ['Friday Deploy, Zero Pages', 'Legends speak of this.'],
  ],
}

export const EMPTY_STASH: Stash = { common: 0, rare: 0, epic: 0, legendary: 0 }

export const IDLE: Show = { phase: 'idle', frame: 0, coins: 0, stops: [], loot: null }

/** Frames each animated phase runs for at the ticker's rate. */
export const LOCK_FRAMES = 12
export const BOOM_FRAMES = 15
export const REVEAL_FRAMES = 24
export const FRAME_MS = 90

const LOCK_AT = [3, 6, 9]

export type Rand = () => number

const pick = <T>(rand: Rand, list: readonly T[]): T => list[Math.floor(rand() * list.length) % list.length]!

/** Rolls a tier: every coin (tool call) nudges the jackpot odds up a little. */
export function rollTier(rand: Rand, coins: number): Tier {
  const legendary = Math.min(0.03 + 0.005 * coins, 0.1)
  const r = rand()
  if (r < legendary) return 'legendary'
  if (r < legendary + 0.12) return 'epic'
  if (r < legendary + 0.37) return 'rare'
  return 'common'
}

export function rollLoot(rand: Rand, coins: number): Loot {
  const tier = rollTier(rand, coins)
  const [item, flavor] = pick(rand, LOOT[tier])
  return { tier, item, flavor }
}

/** Where the reels stop, so the payline agrees with the tier. */
export function stopsFor(rand: Rand, tier: Tier): number[] {
  const n = SYMBOLS.length
  const nonSeven = () => 1 + Math.floor(rand() * (n - 1)) % (n - 1)
  if (tier === 'legendary') return [0, 0, 0]
  if (tier === 'epic') {
    const k = nonSeven()
    return [k, k, k]
  }
  if (tier === 'rare') {
    const k = nonSeven()
    let other = nonSeven()
    if (other === k) other = (k % (n - 1)) + 1
    const odd = Math.floor(rand() * 3) % 3
    return [0, 1, 2].map(i => (i === odd ? other : k))
  }
  const a = nonSeven()
  const b = (a % (n - 1)) + 1
  const c = (b % (n - 1)) + 1
  return [a, b, c]
}

const mod = (a: number, n: number) => ((a % n) + n) % n

function reelAt(show: Show, reel: number): number | null {
  if (show.phase === 'locking' && show.frame >= LOCK_AT[reel]!) return show.stops[reel] ?? 0
  const f = show.phase === 'locking' ? show.frame + 200 : show.frame
  return mod(f * (reel + 2) + reel * 3, SYMBOLS.length)
}

function symbol(idx: number, row: -1 | 0 | 1): Seg {
  const s = SYMBOLS[mod(idx + row, SYMBOLS.length)]!
  return row === 0 ? { t: s.ch, c: s.c, b: true } : { t: s.ch, c: s.c, d: true }
}

function marquee(frame: number): Row {
  const title = 'V I B E   S L O T S'
  const lights = [COLORS.red, COLORS.yellow, COLORS.cyan]
  return [...title].map((ch, i) => ({ t: ch, c: ch === ' ' ? undefined : lights[mod(i + frame, 3)], b: true }))
}

// Clawd, the Claude Code mascot, as on the welcome screen: nine cells by three rows.
export const CLAWD_COLOR = '#d77757'
export type Pose = 'idle' | 'blink' | 'crouch' | 'cheer'
const CLAWD: Record<Pose, readonly string[]> = {
  idle: [' ▐▛███▜▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  '],
  blink: [' ▐█████▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  '],
  crouch: ['         ', ' ▐▛███▜▌ ', '▝▜▘▘ ▝▝▛▘'],
  cheer: ['▗▐▛███▜▌▖', ' ▜█████▛ ', '  ▘▘ ▝▝  '],
}

export function clawd(pose: Pose): Seg[] {
  return CLAWD[pose].map(t => ({ t, c: CLAWD_COLOR }))
}

/** Puts Clawd to the left of a five-row scene, on its middle three rows. */
function withClawd(rows: Row[], pose: Pose): Row[] {
  const sprite = clawd(pose)
  return rows.map((row, y) => {
    const cell = y >= 1 && y <= 3 ? sprite[y - 1]! : { t: '         ' }
    return [{ t: '  ' }, cell, { t: ' ' }, ...row]
  })
}

const SPIN_QUIPS = ['pulling the lever', 'feeding the machine', 'chasing the jackpot', 'one more spin', 'vibes compiling']

function coinTrail(coins: number): Seg {
  const shown = Math.min(coins, 8)
  return { t: '◉'.repeat(shown) + (coins > 8 ? '…' : '') || '·', c: COLORS.gold }
}

/** The slot machine: five rows of cabinet plus a status row. */
export function machineRows(show: Show): Row[] {
  const { frame } = show
  const locking = show.phase === 'locking'
  const reels = [0, 1, 2].map(i => reelAt(show, i)!)
  const frameColor = COLORS.gray
  // A coin drops down the left side at the start of the spin.
  const coinRow = show.phase === 'spinning' && frame < 4 ? Math.min(frame, 2) : -1
  // The lever is pulled on the first frames of a spin.
  const pulled = show.phase === 'spinning' && frame < 3
  const lever = pulled ? ['  ', '  ', '─o'] : [' o', ' │', '─┘']
  const leverColor = COLORS.red

  // Clawd stands by the lever: blinks while it waits, ducks as it pulls.
  const pose: Pose = pulled ? 'crouch' : frame % 16 < 2 ? 'blink' : 'idle'
  const sprite = clawd(pose)

  const reelLine = (r: -1 | 0 | 1): Row => {
    const segs: Row = [
      { t: coinRow === r + 1 ? '◉' : ' ', c: COLORS.gold, b: true },
      { t: r === 0 ? '▶' : ' ', c: COLORS.yellow, b: true },
      { t: '│ ', c: frameColor },
    ]
    reels.forEach((idx, i) => {
      segs.push(symbol(idx, r))
      segs.push({ t: i < 2 ? ' │ ' : ' │', c: frameColor })
    })
    segs.push({ t: r === 0 ? '◀' : ' ', c: COLORS.yellow, b: true })
    segs.push({ t: lever[r + 1]!, c: leverColor, b: true })
    segs.push({ t: ' ' }, sprite[r + 1]!)
    return segs
  }

  const status: Row = locking
    ? [{ t: '  STOPPING', c: COLORS.yellow, b: true }, { t: '.'.repeat(1 + (frame % 3)), c: COLORS.yellow }]
    : [
        { t: '  ' },
        coinTrail(show.coins),
        { t: ` ×${show.coins} ` , c: COLORS.gold },
        { t: SPIN_QUIPS[Math.floor(frame / 25) % SPIN_QUIPS.length]!, d: true },
        { t: '.'.repeat(1 + (frame % 3)), d: true },
      ]

  return [
    [{ t: '  ╭───┬───┬───╮   ', c: frameColor }, ...marquee(frame)],
    reelLine(-1),
    reelLine(0),
    reelLine(1),
    [{ t: '  ╰───┴───┴───╯', c: frameColor }],
    status,
  ]
}

function hash(x: number, y: number, f: number): number {
  let h = (x * 374761393 + y * 668265263 + f * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

const BOX = ['┌─────────┐', '│▓▓▓ ? ▓▓▓│', '╞═════════╡', '│▓▓▓▓▓▓▓▓▓│', '└─────────┘']
const SHAKE = [4, 6, 3, 7, 4, 6, 5]
const RATTLE = ['*rattle*', '*rattle rattle*', '*RATTLE*']
const W = 31
const HOP: readonly Pose[] = ['idle', 'crouch']
const H = 5

/** The loot box: shakes, cracks with light, then explodes in the tier's color. */
export function boomRows(show: Show): Row[] {
  const f = show.frame
  const tier = show.loot?.tier ?? 'common'
  const glow = TIER_STYLE[tier].c
  if (f < SHAKE.length) {
    // The box glows its tier's color from the fourth shake: the tell.
    const c = f >= 3 ? glow : COLORS.gray
    const pad = ' '.repeat(SHAKE[f]!)
    // Clawd hops with excitement while the box rattles.
    const scene = BOX.map(line => [{ t: pad }, { t: line, c, b: f >= 3 }])
    return [...withClawd(scene, HOP[f % 2]!), [{ t: '                ' + RATTLE[f % RATTLE.length]!, d: true }]]
  }
  if (f < 9) {
    const wide = f > SHAKE.length
    const rays = wide ? [' \\\\   ', '      ', ' ═══  ', '      ', ' //   '] : ['  \\   ', '      ', '  ──  ', '      ', '  /   ']
    const raysR = wide ? ['   // ', '      ', '  ═══ ', '      ', '   \\\\ '] : ['   /  ', '      ', '  ──  ', '      ', '   \\  ']
    const lid = ['┌──╱──────┐', '│▓▓▓ ! ▓▓▓│', '╞═════════╡', '│▓▓▓▓▓▓▓▓▓│', '└─────────┘']
    const scene = lid.map((line, y) => [
      { t: ' ' + rays[y]!, c: glow, b: true },
      { t: line, c: glow, b: true },
      { t: raysR[y]!, c: glow, b: true },
    ])
    return withClawd(scene, 'blink')
  }
  // Particles on an expanding ring, cells being about twice as tall as wide.
  const r = (f - 8) * 1.5
  const cx = (W - 1) / 2
  const cy = (H - 1) / 2
  const sparks = ['✦', '*', '+', '·', '°', '✧']
  const rows: Row[] = []
  for (let y = 0; y < H; y++) {
    const row: Row = []
    for (let x = 0; x < W; x++) {
      const dx = (x - cx) / 2.2
      const dy = y - cy
      const d = Math.sqrt(dx * dx + dy * dy)
      const h = hash(x, y, f)
      if (Math.abs(d - r) < 0.7 && h % 3 !== 0) {
        row.push({ t: sparks[h % sparks.length]!, c: h % 4 === 0 ? COLORS.white : glow, b: true })
      } else if (d < r - 1.2 && h % 17 === 0) {
        row.push({ t: '·', c: glow, d: true })
      } else {
        row.push({ t: ' ' })
      }
    }
    rows.push(row)
  }
  if (f < 11) {
    const word = f === 9 ? ' K-BOOM! ' : ' ✸ ✸ ✸ '
    const mid = rows[2]!
    const start = Math.floor(cx - word.length / 2)
    const head = mid.slice(0, start)
    const tail = mid.slice(start + word.length)
    rows[2] = [...head, { t: word, c: glow, b: true }, ...tail]
  }
  return withClawd(rows, 'cheer')
}

function stashRow(stash: Stash): Row {
  const row: Row = [{ t: '  stash ', d: true }]
  for (const tier of TIERS) {
    row.push({ t: ` ◆ ${stash[tier]} ${tier}`, c: TIER_STYLE[tier].c, d: tier === 'common' })
  }
  return row
}

/** The prize: payline, tier banner, item, flavor and the collection so far. */
export function revealRows(show: Show, stash: Stash, columns = 80): Row[] {
  const loot = show.loot
  if (!loot) return []
  const style = TIER_STYLE[loot.tier]
  const twinkle = ['✦', '✧', '·', '✧']
  const tw = (k: number) => ({ t: twinkle[mod(show.frame + k, twinkle.length)]!, c: style.c })
  const stars = '★'.repeat(style.stars)
  const payline: Row = [{ t: '  │ ', c: COLORS.gray }]
  show.stops.forEach((idx, i) => {
    const s = SYMBOLS[idx]!
    payline.push({ t: s.ch, c: s.c, b: true }, { t: i < 2 ? ' │ ' : ' │  ', c: COLORS.gray })
  })
  payline.push({ t: style.call, c: style.c, b: true })
  const rows: Row[] = [
    payline,
    [{ t: '  ' }, tw(0), { t: ` ${stars} ${loot.tier.toUpperCase()} ${stars} `, c: style.c, b: true }, tw(2)],
    [{ t: '  ' }, { t: loot.item, c: style.c, b: true }],
    [{ t: '  ' }, { t: `"${loot.flavor}"`, i: true, d: true }],
    stashRow(stash),
  ]
  if (columns < 66) return rows
  // Clawd's reaction: a jackpot gets a victory dance, a common prize a shrug of a blink.
  const dance: Pose = loot.tier === 'legendary' ? HOP_CHEER[show.frame % 2]! : loot.tier === 'common' ? (show.frame % 8 < 2 ? 'blink' : 'idle') : 'cheer'
  return withClawd(rows, dance)
}

const HOP_CHEER: readonly Pose[] = ['cheer', 'crouch']

export function tiltRows(): Row[] {
  return [
    [{ t: '  ╳ T I L T ╳ ', c: COLORS.red, b: true }, { t: ' turn interrupted, the house keeps your coins', d: true }],
  ]
}

/** One line for a band too short or narrow for the cabinet. */
export function compactRow(show: Show): Row {
  if (show.phase === 'reveal' && show.loot) {
    const s = TIER_STYLE[show.loot.tier]
    return [{ t: `${'★'.repeat(s.stars)} ${show.loot.tier.toUpperCase()} `, c: s.c, b: true }, { t: show.loot.item, c: s.c }]
  }
  if (show.phase === 'tilt') return tiltRows()[0]!
  if (show.phase === 'boom') return [{ t: '[?] ', c: COLORS.gold, b: true }, { t: show.frame < 9 ? 'rattle rattle' : 'K-BOOM!', b: true }]
  const reels = [0, 1, 2].map(i => SYMBOLS[reelAt(show, i)!]!)
  return [
    { t: '[', c: COLORS.gray },
    ...reels.flatMap((s, i) => [{ t: s.ch, c: s.c, b: true }, { t: i < 2 ? '|' : ']', c: COLORS.gray }]),
    { t: ' ' },
    coinTrail(show.coins),
    { t: show.phase === 'locking' ? ' stopping' : ' spinning', d: true },
  ]
}

/** Rows for the band, or null to leave it to the engine. */
export function bandRows(show: Show, stash: Stash, maxRows: number, columns: number): Row[] | null {
  if (show.phase === 'idle') return null
  if (maxRows < 6 || columns < 44) return [compactRow(show)]
  switch (show.phase) {
    case 'spinning':
    case 'locking':
      return machineRows(show)
    case 'boom':
      return boomRows(show)
    case 'reveal':
      return revealRows(show, stash, columns)
    case 'tilt':
      return tiltRows()
  }
}

/** Advances one frame; answers the next show and whether the ticker can stop. */
export function step(show: Show): { next: Show; done: boolean } {
  const frame = show.frame + 1
  switch (show.phase) {
    case 'spinning':
      return { next: { ...show, frame }, done: false }
    case 'locking':
      return frame >= LOCK_FRAMES
        ? { next: { ...show, phase: 'boom', frame: 0 }, done: false }
        : { next: { ...show, frame }, done: false }
    case 'boom':
      return frame >= BOOM_FRAMES
        ? { next: { ...show, phase: 'reveal', frame: 0 }, done: false }
        : { next: { ...show, frame }, done: false }
    case 'reveal':
      return { next: { ...show, frame }, done: frame >= REVEAL_FRAMES }
    default:
      return { next: show, done: true }
  }
}
