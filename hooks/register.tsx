import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Show, Stash } from '../types'
import { EMPTY_STASH, IDLE, bandRows, captionRow, rollLoot, step, stopsFor } from './art'
import type { Seg } from './art'
import { FRAME_MS } from './motion'
import { SCENE_COLUMNS, SCENE_ROWS, sceneCells } from './pixels'

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
    await update($, show, s => (s.phase === 'spinning' ? { ...s, coins: s.coins + 1, coinFrame: s.frame } : s))
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
    const current = await read($, show)
    if (current.phase === 'idle') return next(e)
    const owned = await read($, stash)
    const { maxRows, bodyColumns } = e.props

    const { Box, Text } = $.ui.resolve(e)
    const paint = (seg: Seg, i: number) => (
      <Text key={String(i)} color={seg.c} bold={seg.b} dimColor={seg.d} italic={seg.i} wrap="truncate">
        {seg.t}
      </Text>
    )

    // The pixel scene where the terminal has room for it; text art everywhere else.
    if (e.surface === 'terminal' && maxRows >= SCENE_ROWS + 1 && bodyColumns >= SCENE_COLUMNS + 2) {
      const { Raster } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Raster key="scene" columns={SCENE_COLUMNS} rows={SCENE_ROWS} cells={sceneCells(current)} />
          <Box key="caption" flexDirection="row">
            {captionRow(current, owned).map(paint)}
          </Box>
        </Box>
      )
    }

    const rows = bandRows(current, owned, maxRows, bodyColumns)
    if (rows === null) return next(e)
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
