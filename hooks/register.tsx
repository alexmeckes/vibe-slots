import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Show, Stash } from '../types'
import { EMPTY_STASH, FRAME_MS, IDLE, bandRows, rollLoot, step, stopsFor } from './art'
import type { Seg } from './art'

const show = atom({ plugin: 'vibe-slots', key: 'show' } as const, IDLE)
const stash = atom({ plugin: 'vibe-slots', key: 'stash' } as const, EMPTY_STASH)

const STASH_KEY = 'stash'
const HIDE_AFTER_MS = 20000

// Module timers: a reload drops them along with these variables.
let ticker: Timer | null = null
let hider: Timer | null = null

function stopTicker() {
  ticker?.cancel()
  ticker = null
}

function hideLater($: EngineInterface, ms: number) {
  hider = $.clock.after(ms, () => void update($, show, s => (s.phase === 'reveal' || s.phase === 'tilt' ? IDLE : s)))
}

async function tick($: EngineInterface) {
  let finished = false
  await update($, show, s => {
    const { next, done } = step(s)
    finished = done
    return next
  })
  if (finished) {
    stopTicker()
    hideLater($, HIDE_AFTER_MS)
  }
}

function startTicker($: EngineInterface) {
  hider?.cancel()
  hider = null
  if (ticker) return
  ticker = $.clock.every(FRAME_MS, () => void tick($))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // The collection survives sessions; a reload mid-spin starts the machine clean.
    const saved = (await $.store.get(STASH_KEY)) as Stash | undefined
    await update($, stash, () => ({ ...EMPTY_STASH, ...saved }))
    await update($, show, () => IDLE)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, show, (s): Show => (s.phase === 'spinning' ? s : { ...IDLE, phase: 'spinning' }))
    startTicker($)
    return next(e)
  })

  // Every tool call is another coin in the slot.
  on('tool.call', async ($, e, next) => {
    await update($, show, s => (s.phase === 'spinning' ? { ...s, coins: s.coins + 1 } : s))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const current = await read($, show)
    if (current.phase !== 'spinning') return next(e)

    if (e.isAborted) {
      stopTicker()
      await update($, show, (s): Show => ({ ...s, phase: 'tilt', frame: 0 }))
      hideLater($, HIDE_AFTER_MS / 2)
      return next(e)
    }

    const loot = rollLoot(Math.random, current.coins)
    const stops = stopsFor(Math.random, loot.tier)
    await update($, show, (s): Show => ({ ...s, phase: 'locking', frame: 0, loot, stops }))
    const total = await update($, stash, s => ({ ...s, [loot.tier]: s[loot.tier] + 1 }))
    await $.store.set(STASH_KEY, total)
    if (loot.tier === 'legendary') $.ui.toast(`JACKPOT! ${loot.item}`)
    startTicker($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const rows = bandRows(await read($, show), await read($, stash), e.props.maxRows, e.props.bodyColumns)
    if (rows === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const paint = (seg: Seg, i: number) => (
      <Text key={String(i)} color={seg.c} bold={seg.b} dimColor={seg.d} italic={seg.i} wrap="truncate">
        {seg.t}
      </Text>
    )

    return (
      <Box flexDirection="column">
        {rows.map((row, y) => (
          <Box key={`row${y}`} flexDirection="row">
            {row.map(paint)}
          </Box>
        ))}
      </Box>
    )
  })
}
