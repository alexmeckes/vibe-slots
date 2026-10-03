export type Tier = 'common' | 'rare' | 'epic' | 'legendary'

export type Loot = { tier: Tier; item: string; flavor: string }

/**
 * Where the machine is: idle (band hidden), spinning (a turn is running),
 * locking (reels stopping one by one), boom (loot box shakes and explodes),
 * reveal (the prize), tilt (the turn was interrupted).
 */
export type Phase = 'idle' | 'spinning' | 'locking' | 'boom' | 'reveal' | 'tilt'

export type Show = {
  phase: Phase
  /** Animation frame within the phase. */
  frame: number
  /** Tool calls this turn: each one is a coin in the slot. */
  coins: number
  /** Symbol index each reel stops on, set when locking starts. */
  stops: number[]
  loot: Loot | null
}

export type Stash = Record<Tier, number>

declare module 'claude-code' {
  interface PluginState {
    'vibe-slots': { show: Show; stash: Stash }
  }
}
