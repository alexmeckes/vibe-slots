// Timing and reel physics, shared by the pixel scene and the text fallback so
// both stop the reels on the same frames.
import type { Show } from '../types'

export const FRAME_MS = 70
export const BOOM_FRAMES = 30
export const REVEAL_FRAMES = 40
/** Frames the reels hold still after the last one stops, before the box drops. */
export const LOCK_HOLD = 6

/** Symbols on each reel strip, and the pixel height of one symbol's slot. */
export const STRIP = 7
export const SLOT_PX = 9
export const STRIP_PX = STRIP * SLOT_PX

const SPEED = [5, 6, 7]
const PHASE = [3, 22, 41]
/** The earliest frame each reel may begin to slow, staggered left to right. */
const RELEASE = [3, 8, 13]
/** Frames a reel takes to settle once released. */
const SETTLE = 7

export const mod = (a: number, n: number) => ((a % n) + n) % n

/** Gentle overshoot then settle: the reel clunks past the line and back. */
function easeOutBack(t: number): number {
  const c1 = 1.1
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}

/** Strip position (px) of a reel spinning freely, with a short spin-up after the lever. */
function spinPos(reel: number, f: number): number {
  const v = SPEED[reel]!
  const ramp = 4
  const travel = f < ramp ? (v * f * f) / (2 * ramp) : v * (f - ramp / 2)
  return PHASE[reel]! + travel
}

/** Where a reel stops in strip px: the stop symbol centered on the payline. */
const restPos = (stop: number) => stop * SLOT_PX + (SLOT_PX - 1) / 2

/**
 * The frame a reel starts slowing: the first at or after its release frame
 * from which a short glide lands exactly on its stop symbol.
 */
function releaseFrame(reel: number, stop: number): { at: number; from: number; to: number } {
  const v = SPEED[reel]!
  const want = (v * SETTLE) / 3
  for (let at = RELEASE[reel]!; at < RELEASE[reel]! + STRIP_PX; at++) {
    const from = spinPos(reel, at + 40)
    const gap = mod(restPos(stop) - from, STRIP_PX)
    if (Math.abs(gap - want) <= v / 2 + 0.01) return { at, from, to: from + gap }
  }
  const from = spinPos(reel, RELEASE[reel]! + 40)
  return { at: RELEASE[reel]!, from, to: from + mod(restPos(stop) - from, STRIP_PX) }
}

/** The locking frame on which each reel comes to rest. */
export function stopFrame(show: Show, reel: number): number {
  return releaseFrame(reel, show.stops[reel] ?? 0).at + SETTLE
}

export function lockFrames(show: Show): number {
  return Math.max(...[0, 1, 2].map(i => stopFrame(show, i))) + LOCK_HOLD
}

/** A reel's strip position (px) and speed (px per frame) on this frame. */
export function reelMotion(show: Show, reel: number): { pos: number; speed: number } {
  const f = show.frame
  if (show.phase === 'spinning') {
    return { pos: spinPos(reel, f), speed: spinPos(reel, f) - spinPos(reel, Math.max(0, f - 1)) }
  }
  if (show.phase === 'locking' || show.phase === 'tilt') {
    if (show.phase === 'tilt' || show.stops.length < 3) return { pos: restPos(show.stops[reel] ?? reel * 2), speed: 0 }
    const r = releaseFrame(reel, show.stops[reel]!)
    const at = (g: number) => {
      if (g < r.at) return spinPos(reel, g + 40)
      const t = Math.min(1, (g - r.at) / SETTLE)
      return r.from + (r.to - r.from) * easeOutBack(t)
    }
    return { pos: at(f), speed: Math.abs(at(f) - at(Math.max(0, f - 1))) }
  }
  return { pos: restPos(show.stops[reel] ?? 0), speed: 0 }
}

/** Which symbol a reel shows on the payline, rounding to the nearest slot. */
export function reelSymbol(show: Show, reel: number): number {
  return mod(Math.round((reelMotion(show, reel).pos - (SLOT_PX - 1) / 2) / SLOT_PX), STRIP)
}
