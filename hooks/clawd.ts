// Clawd, the Claude Code mascot, drawn procedurally so the body can squash,
// stretch, hop and emote: the welcome screen's shape (a wide body, slit eyes,
// side arms, four short legs) at 18 pixels across, with shading and a shadow.

export type Eyes = 'open' | 'blink' | 'happy' | 'wide' | 'sad' | 'half'
export type Arms = 'down' | 'up' | 'wave' | 'flail' | 'reach'

export type Look = {
  eyes: Eyes
  arms: Arms
  /** Where the eyes look: -1 left, 0 ahead, 1 right. */
  gaze?: -1 | 0 | 1
  /** 1 or 2 squashes the body wider and shorter (landing, straining); -1 stretches it. */
  squash?: number
  /** Pixels off the ground; the legs tuck while airborne. */
  lift?: number
  /** A leg (0 to 3) lifted off the ground, for foot taps. */
  tap?: number
  blush?: boolean
  /** Where a reaching arm ends. */
  reach?: { x: number; y: number }
  frame?: number
  /** Recolors every pixel (greyed out, washed by a flash). */
  map?: (c: number) => number
}

type Painter = { set: (x: number, y: number, c: number) => void }

const hex = (s: string) => parseInt(s.slice(1), 16)

export const CLAWD_INK = {
  body: hex('#d97757'),
  light: hex('#eb9878'),
  shade: hex('#b5603f'),
  leg: hex('#8f4630'),
  eye: hex('#1e1714'),
  glint: hex('#ffffff'),
  blush: hex('#f7a1a1'),
  tear: hex('#6ec6ff'),
  shadow: hex('#4a4452'),
}

export const CLAWD_WIDTH = 18

/** Draws Clawd in an 18-pixel-wide box whose left edge is `x`, standing on row `ground`. */
export function drawClawd(cv: Painter, x: number, ground: number, look: Look): void {
  const ink = (c: number) => (look.map ? look.map(c) : c)
  const set = (px: number, py: number, c: number) => cv.set(px, py, ink(c))
  const f = look.frame ?? 0
  const squash = look.squash ?? 0
  const sq = Math.max(0, squash)
  const lift = look.lift ?? 0

  const bodyW = 12 + 2 * sq
  const bodyH = 6 - sq + (squash < 0 ? 1 : 0)
  const legLen = lift > 0 || sq > 0 ? 1 : 2
  const feet = ground - lift
  const bottom = feet - legLen
  const top = bottom - bodyH + 1
  const bl = x + 3 - sq
  const br = bl + bodyW - 1

  // Shadow on the ground, shrinking as Clawd rises.
  const shadowW = Math.max(4, bodyW - 2 - lift * 2)
  const sx = Math.round(x + 9 - shadowW / 2)
  for (let i = 0; i < shadowW; i++) cv.set(sx + i, ground + 1, ink(CLAWD_INK.shadow))

  // Body, lit from the top left.
  for (let py = top; py <= bottom; py++) {
    for (let px = bl; px <= br; px++) {
      const lit = py === top || px === bl
      const dark = py === bottom || px === br
      set(px, py, lit && !dark ? CLAWD_INK.light : dark && !lit ? CLAWD_INK.shade : CLAWD_INK.body)
    }
  }

  // Legs: four short ones; one may tap, all tuck in the air.
  const legX = [bl + 1, bl + 3, br - 3, br - 1]
  legX.forEach((lx, i) => {
    const up = look.tap === i ? 1 : 0
    for (let k = 1; k <= legLen - up; k++) set(lx, bottom + k, CLAWD_INK.leg)
  })

  // Arms.
  const armY = bottom - 1
  const left = (dx: number, dy: number) => set(bl - dx, armY - dy, CLAWD_INK.body)
  const right = (dx: number, dy: number) => set(br + dx, armY - dy, CLAWD_INK.body)
  const nubs = (side: (dx: number, dy: number) => void) => (side(1, 0), side(2, 0))
  const raised = (side: (dx: number, dy: number) => void) => (side(1, 0), side(1, 1), side(2, 2), side(2, 3))
  switch (look.arms) {
    case 'down':
      nubs(left)
      nubs(right)
      break
    case 'up':
      raised(left)
      raised(right)
      break
    case 'wave':
      nubs(left)
      if (f % 6 < 3) raised(right)
      else (right(1, 0), right(2, 1), right(3, 1))
      break
    case 'flail':
      if (f % 2 === 0) (raised(left), nubs(right))
      else (nubs(left), raised(right))
      break
    case 'reach': {
      nubs(right)
      const to = look.reach ?? { x: bl - 3, y: armY }
      const steps = Math.max(Math.abs(bl - 1 - to.x), Math.abs(armY - to.y), 1)
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        set(Math.round(bl - 1 + (to.x - (bl - 1)) * t), Math.round(armY + (to.y - armY) * t), CLAWD_INK.body)
      }
      break
    }
  }

  // Eyes: slits in the face, two pixels tall, set where the welcome screen has them.
  const gaze = look.gaze ?? 0
  const eyeTop = top + 2 - (sq > 0 ? 1 : 0)
  const eyes = [bl + 2 + sq + gaze, br - 2 - sq + gaze]
  eyes.forEach((ex, side) => {
    const out = side === 0 ? -1 : 1
    switch (look.eyes) {
      case 'open':
        set(ex, eyeTop, CLAWD_INK.eye)
        set(ex, eyeTop + 1, CLAWD_INK.eye)
        break
      case 'blink':
        set(ex - 1, eyeTop + 1, CLAWD_INK.eye)
        set(ex, eyeTop + 1, CLAWD_INK.eye)
        set(ex + 1, eyeTop + 1, CLAWD_INK.eye)
        break
      case 'happy':
        set(ex - 1, eyeTop + 1, CLAWD_INK.eye)
        set(ex, eyeTop, CLAWD_INK.eye)
        set(ex + 1, eyeTop + 1, CLAWD_INK.eye)
        break
      case 'wide': {
        const wx = side === 0 ? ex - 1 : ex
        set(wx, eyeTop, CLAWD_INK.glint)
        set(wx + 1, eyeTop, CLAWD_INK.eye)
        set(wx, eyeTop + 1, CLAWD_INK.eye)
        set(wx + 1, eyeTop + 1, CLAWD_INK.eye)
        break
      }
      case 'half':
        set(ex, eyeTop, CLAWD_INK.shade)
        set(ex, eyeTop + 1, CLAWD_INK.eye)
        break
      case 'sad':
        // Heavy lids and a tear rolling down the outside of each eye.
        set(ex, eyeTop, CLAWD_INK.shade)
        set(ex, eyeTop + 1, CLAWD_INK.eye)
        set(ex + out, eyeTop + 1 + (f % 6 < 3 ? 1 : 2), CLAWD_INK.tear)
        break
    }
    if (look.blush) set(ex + out * 2, eyeTop + 2, CLAWD_INK.blush)
  })
}
