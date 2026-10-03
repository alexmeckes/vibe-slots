// The terminal scene, drawn as true-color pixel art on a Raster: each cell is
// two stacked pixels (a half block), so a 64 x 7 cell canvas is 64 x 14 pixels.
// Text cells can be laid over the pixels for labels.
import type { Show, Tier } from '../types'
import { drawClawd } from './clawd'
import type { Look } from './clawd'
import { SLOT_PX, STRIP_PX, lockFrames, mod, reelMotion, stopFrame } from './motion'

export const SCENE_COLUMNS = 64
export const SCENE_ROWS = 7
const W = SCENE_COLUMNS
const H = SCENE_ROWS * 2

const NONE = 0x01000000

// ---------------------------------------------------------------- palette

const rgb = (hex: string) => parseInt(hex.slice(1), 16)

export const INK = {
  bodyTop: rgb('#9c2a4c'),
  bodyBottom: rgb('#4f1230'),
  bodyEdge: rgb('#2e0a1d'),
  gold: rgb('#f2c14e'),
  goldLight: rgb('#ffe9a3'),
  goldDark: rgb('#8a6116'),
  bulbOff: rgb('#5a3b14'),
  glass: rgb('#fbf6ea'),
  glassEdge: rgb('#b9ad94'),
  steel: rgb('#8d99ae'),
  steelDark: rgb('#4a5263'),
  knob: rgb('#ef476f'),
  knobLight: rgb('#ffb3c6'),
  panel: rgb('#1b0e16'),
  text: rgb('#e9e4dc'),
  textDim: rgb('#8c8279'),
  clawd: rgb('#d97757'),
  clawdShade: rgb('#a9553a'),
  eye: rgb('#1e1714'),
  wood: rgb('#9b6534'),
  woodDark: rgb('#5d3a1b'),
  tilt: rgb('#ff3b3b'),
}

export const TIER_INK: Record<Tier, { light: number; mid: number; dark: number }> = {
  common: { light: rgb('#f4f4f4'), mid: rgb('#b7b7b7'), dark: rgb('#6e6e6e') },
  rare: { light: rgb('#b5ecff'), mid: rgb('#3fa7f5'), dark: rgb('#1c5ea8') },
  epic: { light: rgb('#f3c2ff'), mid: rgb('#b45cf0'), dark: rgb('#6a2a9e') },
  legendary: { light: rgb('#fff3b0'), mid: rgb('#ffc23d'), dark: rgb('#c27a00') },
}

export function mix(a: number, b: number, t: number): number {
  if (a === NONE) return b
  if (b === NONE) return a
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

const grey = (c: number) => {
  const l = Math.round(((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11)
  return (l << 16) | (l << 8) | l
}

function hash(a: number, b: number, c = 0): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

// ---------------------------------------------------------------- canvas

type Glyph = { cp: number; fg: number; bg: number }

export class Canvas {
  readonly px = new Uint32Array(W * H).fill(NONE)
  readonly glyphs = new Map<number, Glyph>()

  get(x: number, y: number): number {
    return x < 0 || y < 0 || x >= W || y >= H ? NONE : this.px[y * W + x]!
  }

  set(x: number, y: number, c: number): void {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= W || y >= H || c === NONE) return
    this.px[y * W + x] = c
  }

  /** Blends a color over what is there; over empty pixels it lands only when strong. */
  tint(x: number, y: number, c: number, t: number): void {
    const base = this.get(Math.round(x), Math.round(y))
    if (base === NONE) {
      if (t >= 0.5) this.set(x, y, c)
    } else this.set(x, y, mix(base, c, t))
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c)
  }

  /** Draws a sprite: one string per row, '.' transparent, other chars looked up in `ink`. */
  sprite(x: number, y: number, rows: readonly string[], ink: Record<string, number>, map?: (c: number) => number): void {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const k = row[i]!
        if (k === '.') continue
        const c = ink[k]
        if (c !== undefined) this.set(x + i, y + j, map ? map(c) : c)
      }
    })
  }

  /** Lays text over cells (column, cell row), one glyph per cell. */
  text(col: number, row: number, s: string, fg: number, bg = NONE): void {
    let i = 0
    for (const ch of s) {
      const x = col + i++
      if (x < 0 || x >= W || row < 0 || row >= SCENE_ROWS) continue
      this.glyphs.set(row * W + x, { cp: ch.codePointAt(0)!, fg, bg })
    }
  }

  /** Packs the cells as RasterProps.cells: base64 of [codePoint, fg, bg] u32 triplets. */
  encode(): string {
    const words = new Uint32Array(W * SCENE_ROWS * 3)
    for (let row = 0; row < SCENE_ROWS; row++) {
      for (let x = 0; x < W; x++) {
        const i = (row * W + x) * 3
        const g = this.glyphs.get(row * W + x)
        if (g) {
          words[i] = g.cp
          words[i + 1] = g.fg
          words[i + 2] = g.bg
          continue
        }
        const top = this.px[row * 2 * W + x]!
        const bottom = this.px[(row * 2 + 1) * W + x]!
        if (top === NONE && bottom === NONE) {
          words.set([0x20, NONE, NONE], i)
        } else if (top === NONE) {
          words.set([0x2584, bottom, NONE], i) // ▄
        } else if (bottom === NONE || bottom === top) {
          words.set(bottom === top ? [0x2588, top, NONE] : [0x2580, top, NONE], i) // █ ▀
        } else {
          words.set([0x2580, top, bottom], i)
        }
      }
    }
    return base64(new Uint8Array(words.buffer))
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += b === undefined ? '=' : B64[(n >> 6) & 63]!
    out += c === undefined ? '=' : B64[n & 63]!
  }
  return out
}

// ---------------------------------------------------------------- sprites

/** Reel symbols, in the same order as the text SYMBOLS: 7, star, diamond, club, heart, coin, Clawd. */
const SYMBOL_SPRITES: readonly { rows: readonly string[]; ink: Record<string, number> }[] = [
  {
    rows: ['RRRRRRR', 'rrrrrRR', '....RRr', '...RRr.', '..RRr..', '..RR...', '..RR...'],
    ink: { R: rgb('#e63946'), r: rgb('#9d1c2a') },
  },
  {
    rows: ['...Y...', '..YYY..', 'YYYWYYY', '.YYYYY.', '..YYY..', '.YY.YY.', '.Y...Y.'],
    ink: { Y: rgb('#ffc93c'), W: rgb('#fff6c9') },
  },
  {
    rows: ['.......', '.cCCCb.', 'cCCCCCb', '.CCCCb.', '..CCb..', '...b...', '.......'],
    ink: { c: rgb('#d8f6ff'), C: rgb('#4cc9f0'), b: rgb('#2f6fd6') },
  },
  {
    rows: ['..GGG..', '..GGG..', 'GG.G.GG', 'GGGGGGG', 'GG.g.GG', '...g...', '..ggg..'],
    ink: { G: rgb('#52b788'), g: rgb('#2d6a4f') },
  },
  {
    rows: ['.......', '.MM.MM.', 'MWMMMMM', 'MMMMMMM', '.MMMMM.', '..MMM..', '...M...'],
    ink: { M: rgb('#ff5d8f'), W: rgb('#ffd1df') },
  },
  {
    rows: ['.OOOOO.', 'OOdddOO', 'OOdOOOO', 'OOdddOO', 'OOOOdOO', 'OOdddOO', '.OOOOO.'],
    ink: { O: rgb('#f7b32b'), d: rgb('#9a6a00') },
  },
  {
    rows: ['.......', '.KKKKK.', '.KeKeK.', 'KKKKKKK', '.KKKKK.', '.K.K.K.', '.......'],
    ink: { K: INK.clawd, e: INK.eye },
  },
]

const CHEST = [
  '.ddddddddddddd.',
  'dWWWWWWWWWWWWWd',
  'dWWWWWWWWWWWWWd',
  'GGGGGGGLGGGGGGG',
  'dWWWWWWLWWWWWWd',
  'dWWWWWWWWWWWWWd',
  'dWWWWWWWWWWWWWd',
  'dWWWWWWWWWWWWWd',
  '.ddddddddddddd.',
]
const GEM = [
  '...LLLLL...',
  '..LMMMMMD..',
  '.LMMMMMMMD.',
  'LLLLLLLLLDD',
  '.DMMMMMMMD.',
  '..DMMMMMD..',
  '...DMMMD...',
  '....DMD....',
  '.....D.....',
]

// ---------------------------------------------------------------- cabinet

const CAB_X = 1
const CAB_W = 37
const WIN_Y = 3
const WIN_H = 9
const WINDOWS = [4, 15, 26]
const WIN_W = 9
const PAY_Y = WIN_Y + Math.floor(WIN_H / 2)
const CLAWD_X = 43
const GROUND = 12

/** The lever's pull, 0 up to 1 fully down, over the first frames of a spin. */
function leverPull(show: Show): number {
  if (show.phase !== 'spinning') return 0
  const f = show.frame
  return f < 3 ? f / 3 : f < 6 ? 1 - (f - 3) / 3 : 0
}

function drawReel(cv: Canvas, show: Show, reel: number, dim: (c: number) => number): void {
  const x0 = WINDOWS[reel]!
  const { pos, speed } = reelMotion(show, reel)
  const blur = speed >= 3
  const landed = show.phase === 'locking' && show.frame >= stopFrame(show, reel)
  const justLanded = show.phase === 'locking' && show.frame - stopFrame(show, reel) < 2 && landed
  const allLanded = show.phase === 'locking' && show.frame >= lockFrames(show) - 6
  const win = allLanded && show.loot && show.loot.tier !== 'common' && show.stops[reel] === show.stops[1]
  const glow = show.loot ? TIER_INK[show.loot.tier] : null

  for (let wy = 0; wy < WIN_H; wy++) {
    // The glass is a cylinder: brightest on the payline, shaded toward the top and bottom.
    const edge = Math.abs(wy - (WIN_H - 1) / 2) / ((WIN_H - 1) / 2)
    let bg = mix(INK.glass, INK.glassEdge, edge ** 1.6)
    if (justLanded) bg = mix(bg, 0xffffff, 0.6)
    if (win && glow && wy >= 1 && wy <= WIN_H - 2) bg = mix(bg, glow.light, show.frame % 4 < 2 ? 0.75 : 0.35)
    for (let wx = 0; wx < WIN_W; wx++) {
      let c = symbolPixel(pos, wy, wx)
      if (blur) {
        const ghost = symbolPixel(pos - speed * 0.5, wy, wx)
        c = c === NONE ? (ghost === NONE ? NONE : mix(bg, ghost, 0.45)) : ghost === NONE ? mix(bg, c, 0.6) : mix(c, ghost, 0.4)
      }
      const pixel = c === NONE ? bg : mix(c, INK.glassEdge, edge ** 2 * 0.55)
      cv.set(x0 + wx, WIN_Y + wy, dim(pixel))
    }
  }
}

/** The color of one window pixel for a strip position, or NONE where the strip is blank. */
function symbolPixel(pos: number, wy: number, wx: number): number {
  const s = mod(Math.round(pos) + wy - Math.floor(WIN_H / 2), STRIP_PX)
  const sym = Math.floor(s / SLOT_PX)
  const row = (s % SLOT_PX) - 1
  const col = wx - 1
  if (row < 0 || row > 6 || col < 0 || col > 6) return NONE
  const art = SYMBOL_SPRITES[sym]!
  const k = art.rows[row]![col]!
  return k === '.' ? NONE : (art.ink[k] ?? NONE)
}

function drawCabinet(cv: Canvas, show: Show, dim: (c: number) => number = c => c): void {
  const f = show.frame
  // Body, with a vertical gradient and a dark outline.
  for (let y = 1; y < H - 1; y++) {
    const c = mix(INK.bodyTop, INK.bodyBottom, (y - 1) / (H - 3))
    cv.rect(CAB_X, y, CAB_W, 1, dim(c))
  }
  // Marquee: the title in chasing lights on a dark sign, gold trim beneath.
  const title = '✦ V I B E   S L O T S ✦'
  const start = CAB_X + Math.floor((CAB_W - title.length) / 2)
  const lights = [INK.goldLight, INK.knob, rgb('#4cc9f0'), INK.gold]
  cv.text(CAB_X, 0, ' '.repeat(CAB_W), INK.text, dim(INK.panel))
  ;[...title].forEach((ch, i) => cv.text(start + i, 0, ch, dim(ch === '✦' ? INK.gold : lights[mod(Math.floor(i / 2) - f, 4)]!), dim(INK.panel)))
  cv.rect(CAB_X, 2, CAB_W, 1, dim(INK.gold))
  // Bulbs chasing down both sides.
  for (let y = 3; y < H - 2; y++) {
    const lit = mod(y + f, 3) === 0
    for (const x of [CAB_X, CAB_X + CAB_W - 1]) cv.set(x, y, dim(lit ? INK.goldLight : INK.bulbOff))
  }
  // Reel windows, each framed in dark trim.
  for (let i = 0; i < 3; i++) {
    cv.rect(WINDOWS[i]! - 1, WIN_Y - 1, WIN_W + 2, WIN_H + 2, dim(INK.bodyEdge))
    drawReel(cv, show, i, dim)
  }
  // Payline pointers either side of the reels.
  for (const [x, dir] of [[3, 1], [35, -1]] as const) {
    cv.set(x, PAY_Y, dim(INK.goldLight))
    cv.set(x - dir, PAY_Y - 1, dim(INK.gold))
    cv.set(x - dir, PAY_Y + 1, dim(INK.gold))
  }
  // Base trim.
  cv.rect(CAB_X, H - 2, CAB_W, 1, dim(INK.gold))
  cv.rect(CAB_X + 1, H - 1, CAB_W - 2, 1, dim(INK.bodyEdge))

  // The lever: pivot on the cabinet's side, a rod, and a knob that swings down.
  const pull = leverPull(show)
  const knobY = Math.round(1 + pull * 8)
  const pivotY = 8
  cv.rect(38, pivotY - 1, 2, 3, dim(INK.steelDark))
  for (let y = Math.min(knobY + 2, pivotY); y <= Math.max(knobY + 2, pivotY); y++) cv.set(40, y, dim(INK.steel))
  cv.sprite(39, knobY, ['.K.', 'KkK', '.K.'], { K: INK.knob, k: INK.knobLight }, dim)
}

// ---------------------------------------------------------------- scenes

function spinScene(cv: Canvas, show: Show): void {
  drawCabinet(cv, show)
  clawd(cv, spinLook(show))
}

function clawd(cv: Canvas, look: Look): void {
  drawClawd(cv, CLAWD_X, GROUND, look)
}

/** Clawd at the machine: hauls the lever, taps a foot while waiting, cheers each coin. */
function spinLook(show: Show): Look {
  const f = show.frame
  const pull = leverPull(show)
  if (pull > 0) {
    const knobY = Math.round(1 + pull * 8)
    return { eyes: 'open', gaze: -1, arms: 'reach', reach: { x: 41, y: knobY + 1 }, squash: pull > 0.5 ? 1 : 0, frame: f }
  }
  if (show.phase === 'locking') {
    const end = lockFrames(show)
    if (f >= end - 6) {
      const won = show.loot !== null && show.loot.tier !== 'common'
      return won
        ? { eyes: 'happy', arms: 'up', blush: true, lift: f % 4 < 2 ? 1 : 0, frame: f }
        : { eyes: 'half', arms: 'down', gaze: -1, frame: f }
    }
    const landed = [0, 1, 2].some(i => f - stopFrame(show, i) === 0)
    return { eyes: 'wide', gaze: -1, arms: 'down', squash: landed ? 1 : 0, frame: f }
  }
  // A coin just went in: a little hop of joy.
  const since = f - show.coinFrame
  if (show.coins > 0 && since >= 0 && since < 3) {
    return { eyes: 'happy', arms: 'up', lift: since === 1 ? 2 : 1, frame: f }
  }
  // Waiting on the model: glances at the reels, blinks, taps a foot.
  const blink = f % 31 < 2
  const glance = f % 45 >= 30 ? -1 : 0
  return { eyes: blink ? 'blink' : 'open', gaze: glance, arms: 'down', tap: f % 8 < 4 ? 3 : undefined, frame: f }
}

const BOX_X = 17
const BOX_Y = 5
const DROP = [-10, -6, -1, 3, 5]
const JITTER = [0, 1, -1, 1, 0, -1, 1, -1]

function chestInk(t: number, tier: Tier) {
  const g = TIER_INK[tier]
  return {
    W: mix(INK.wood, g.light, t * 0.55),
    d: mix(INK.woodDark, g.dark, t * 0.5),
    G: mix(INK.gold, g.light, t),
    L: mix(INK.goldLight, 0xffffff, t),
  }
}

function particles(cv: Canvas, t: number, tier: Tier, cx: number, cy: number): void {
  const g = TIER_INK[tier]
  for (let i = 0; i < 70; i++) {
    const h = hash(i, 7)
    const angle = -Math.PI * ((h % 1000) / 1000) - 0.15 + ((h >>> 10) % 30) / 100
    const speed = 1.1 + ((h >>> 3) % 100) / 45
    const life = 9 + ((h >>> 7) % 9)
    if (t > life) continue
    const x = cx + Math.cos(angle) * speed * t * 1.9
    const y = cy + Math.sin(angle) * speed * t + 0.11 * t * t
    const age = t / life
    const c = age < 0.3 ? g.light : age < 0.65 ? g.mid : g.dark
    cv.set(x, y, h % 9 === 0 ? 0xffffff : c)
    if (age < 0.5) cv.tint(x - Math.cos(angle), y - Math.sin(angle) * 0.6, c, 0.5)
  }
}

function sparkles(cv: Canvas, f: number, tier: Tier, x0: number, y0: number, w: number, h: number, n: number): void {
  const g = TIER_INK[tier]
  for (let i = 0; i < n; i++) {
    const k = hash(i, Math.floor(f / 3), 99)
    const x = x0 + (k % w)
    const y = y0 + ((k >>> 8) % h)
    const phase = (f + i) % 4
    if (phase === 0) cv.set(x, y, 0xffffff)
    else if (phase === 1) {
      cv.set(x, y, g.light)
      cv.tint(x - 1, y, g.mid, 0.6)
      cv.tint(x + 1, y, g.mid, 0.6)
    } else if (phase === 2) cv.set(x, y, g.mid)
  }
}

function boomScene(cv: Canvas, show: Show): void {
  const f = show.frame
  const tier = show.loot?.tier ?? 'common'
  const g = TIER_INK[tier]
  const centerX = BOX_X + 7
  if (f === 15) {
    // One frame of flash as the box bursts.
    cv.rect(0, 0, W, H, g.light)
    clawd(cv, { eyes: 'happy', arms: 'up', squash: -1, frame: f, map: c => mix(c, g.light, 0.55) })
    return
  }
  if (f < 5) {
    cv.sprite(BOX_X, DROP[f]!, CHEST, chestInk(0, tier))
    if (f === 4) {
      // Dust where it lands.
      for (const dx of [-2, -1, 15, 16]) cv.set(BOX_X + dx, H - 1, INK.textDim)
    }
    // Startled by the box landing.
    clawd(cv, f >= 3 ? { eyes: 'wide', gaze: -1, arms: 'up', squash: f === 3 ? 2 : 1, frame: f } : { eyes: 'wide', gaze: -1, arms: 'down', frame: f })
    return
  }
  if (f < 13) {
    // Shakes harder and glows its rarity: the tell.
    const t = (f - 5) / 8
    cv.sprite(BOX_X + JITTER[f - 5]!, BOX_Y, CHEST, chestInk(t, tier))
    sparkles(cv, f, tier, BOX_X - 4, BOX_Y - 4, 23, 12, Math.round(t * 10))
    // Can't keep still: hops on the spot, arms going.
    const air = f % 2 === 0
    clawd(cv, { eyes: 'wide', gaze: -1, arms: 'flail', lift: air ? 2 : 0, squash: air ? -1 : 1, frame: f })
    return
  }
  if (f < 15) {
    // The lid cracks and light pours out.
    const lift = f - 12
    const body = CHEST.slice(3)
    const lid = CHEST.slice(0, 3)
    cv.sprite(BOX_X, BOX_Y + 3, body, chestInk(1, tier))
    // Rays fanning out of the gap, longer on the second frame.
    const oy = BOX_Y + 3 - lift
    for (let r = 0; r < 9; r++) {
      const a = Math.PI * (1.08 + (r / 8) * 0.84)
      const len = (r % 2 === 0 ? 9 : 6) + lift * 3
      for (let k = 2; k < len; k++) {
        const x = centerX + Math.cos(a) * k * 2
        const y = oy + Math.sin(a) * k
        cv.tint(x, y, k < len / 2 ? 0xffffff : g.light, 0.85 - (k / len) * 0.3)
      }
    }
    cv.rect(BOX_X + 1, oy, 13, lift, g.light)
    cv.sprite(BOX_X, BOX_Y - lift, lid, chestInk(1, tier))
    // Leans back in awe as the light comes out.
    clawd(cv, { eyes: 'wide', gaze: -1, arms: 'up', squash: -1, frame: f })
    return
  }
  // The burst: the open chest, a gem rising out of it, and particles under gravity.
  const t = f - 15
  openChest(cv, tier)
  particles(cv, t, tier, centerX, BOX_Y + 2)
  const rise = Math.min(1, t / 7)
  const gemY = Math.round(BOX_Y + 1 - rise * 6)
  drawGem(cv, centerX - 5, gemY, tier, f)
  const HOPS = [0, 2, 3, 2, 0, 0]
  const k = t % HOPS.length
  const lift = HOPS[k]!
  clawd(cv, { eyes: 'happy', arms: 'flail', blush: true, lift, squash: lift > 0 ? -1 : k === 4 ? 1 : 0, frame: f })
}

function openChest(cv: Canvas, tier: Tier): void {
  const g = TIER_INK[tier]
  cv.sprite(BOX_X, BOX_Y + 3, CHEST.slice(3), chestInk(0.4, tier))
  cv.rect(BOX_X + 1, BOX_Y + 3, 13, 1, g.light)
  // The lid flung back, drawn thin above the rim.
  cv.rect(BOX_X - 1, BOX_Y + 1, 2, 2, chestInk(0.4, tier).d)
}

function drawGem(cv: Canvas, x: number, y: number, tier: Tier, f: number): void {
  const g = TIER_INK[tier]
  cv.sprite(x, y, GEM, { L: g.light, M: g.mid, D: g.dark })
  // A glint that sweeps across the gem.
  const gx = x + mod(f, 14) - 1
  for (let j = 0; j < 4; j++) if (cv.get(gx + j - 1, y + j) !== NONE) cv.tint(gx + j - 1, y + j, 0xffffff, 0.7)
}

function revealScene(cv: Canvas, show: Show): void {
  const tier = show.loot?.tier ?? 'common'
  const g = TIER_INK[tier]
  const f = show.frame
  const alive = f < 40
  openChest(cv, tier)
  drawGem(cv, BOX_X + 2, BOX_Y - 5 + (alive && f % 10 < 5 ? 0 : 1), tier, alive ? f : 0)
  if (alive) sparkles(cv, f, tier, BOX_X - 4, 0, 23, 12, tier === 'legendary' ? 14 : tier === 'epic' ? 10 : 6)
  // Clawd's reaction scales with the prize.
  clawd(cv, revealLook(tier, f, alive))
  // The rarity plate, left of the chest.
  const name = ` ${tier.toUpperCase()} `
  const plateW = 13
  const left = Math.floor((plateW - name.length) / 2)
  cv.text(1, 2, ' '.repeat(left) + name + ' '.repeat(plateW - left - name.length), g.dark, g.light)
  const stars = { common: 1, rare: 2, epic: 3, legendary: 4 }[tier]
  const twinkle = (i: number) => (alive && mod(f - i * 2, 8) < 2 ? 0xffffff : g.mid)
  for (let i = 0; i < stars; i++) cv.text(1 + Math.floor(plateW / 2) - (stars - 1) + i * 2, 4, '✦', twinkle(i))
}

function revealLook(tier: Tier, f: number, alive: boolean): Look {
  if (tier === 'common') {
    // Unimpressed: half-lidded, with the odd shrug.
    const shrug = alive && f % 20 >= 10 && f % 20 < 13
    return { eyes: f % 26 < 2 ? 'blink' : 'half', arms: shrug ? 'up' : 'down', frame: f }
  }
  if (tier === 'legendary') {
    // A victory dance: big hops with a squash on every landing.
    const HOPS = [0, 2, 3, 2, 0, 0]
    const k = f % HOPS.length
    const lift = alive ? HOPS[k]! : 0
    return { eyes: 'happy', arms: alive ? 'flail' : 'up', blush: true, lift, squash: !alive ? 0 : lift > 0 ? -1 : k === 4 ? 1 : 0, frame: f }
  }
  // Rare and epic: a happy wave, and a hop now and then.
  const lift = alive && f % 12 === 1 ? 2 : alive && (f % 12 === 0 || f % 12 === 2) ? 1 : 0
  return { eyes: 'happy', arms: alive ? 'wave' : 'up', blush: tier === 'epic', lift, frame: f }
}

function tiltScene(cv: Canvas, show: Show): void {
  drawCabinet(cv, show, grey)
  cv.text(CAB_X + Math.floor((CAB_W - 11) / 2), 3, '  T I L T  ', 0xffffff, INK.tilt)
  clawd(cv, { eyes: 'sad', arms: 'down', squash: 1, frame: show.frame })
}

/** The scene for a frame on a canvas. */
export function sceneCanvas(show: Show): Canvas {
  const cv = new Canvas()
  if (show.phase === 'boom') boomScene(cv, show)
  else if (show.phase === 'reveal') revealScene(cv, show)
  else if (show.phase === 'tilt') tiltScene(cv, show)
  else if (show.phase !== 'idle') spinScene(cv, show)
  return cv
}

/** The scene for a frame, encoded as a Raster's cells. */
export function sceneCells(show: Show): string {
  return sceneCanvas(show).encode()
}
