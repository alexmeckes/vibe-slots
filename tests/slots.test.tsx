import { expect, mock, test } from 'claude-code/testing'
import type { RenderPropsOf } from 'claude-code'

import { BOOM_FRAMES, FRAME_MS, LOCK_FRAMES, SYMBOLS, TIERS, bandRows, rollTier, stopsFor } from '../hooks/art'
import { EMPTY_STASH, IDLE } from '../hooks/art'
import type { Row } from '../hooks/art'

const BAND = (maxRows = 12, bodyColumns = 100) =>
  ({
    plugin: 'vibe-slots',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: true, maxRows, bodyColumns, scroll: { bodyRows: maxRows, top: 0 }, view: {} },
  }) as unknown as { plugin: string; component: 'AbovePrompt'; props: RenderPropsOf['AbovePrompt'] }

const width = (row: Row) => [...row.map(s => s.t).join('')].length

const seq = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]!
}

test('the payline agrees with the tier', async () => {
  for (const tier of TIERS) {
    for (let k = 0; k < 50; k++) {
      const stops = stopsFor(Math.random, tier)
      const kinds = new Set(stops).size
      expect(stops).toHaveLength(3)
      stops.forEach(s => expect(s >= 0 && s < SYMBOLS.length).toBe(true))
      if (tier === 'legendary') expect(stops).toEqual([0, 0, 0])
      if (tier === 'epic') expect(kinds).toBe(1)
      if (tier === 'rare') expect(kinds).toBe(2)
      if (tier === 'common') expect(kinds).toBe(3)
      if (tier !== 'legendary') expect(stops.includes(0)).toBe(false)
    }
  }
})

test('coins raise the jackpot odds, capped', async () => {
  expect(rollTier(seq(0.05), 0)).toBe('epic')
  expect(rollTier(seq(0.05), 10)).toBe('legendary')
  expect(rollTier(seq(0.11), 100)).not.toBe('legendary')
  expect(rollTier(seq(0.99), 100)).toBe('common')
})

test('every frame fits a 44-column band and the cabinet fits 6 rows', async () => {
  const loot = { tier: 'epic' as const, item: 'Zero-Diff Refactor', flavor: 'Everything changed. Nothing changed.' }
  const shows = [
    ...Array.from({ length: 60 }, (_, frame) => ({ ...IDLE, phase: 'spinning' as const, frame, coins: frame })),
    ...Array.from({ length: LOCK_FRAMES }, (_, frame) => ({ ...IDLE, phase: 'locking' as const, frame, stops: [2, 2, 2], loot })),
    ...Array.from({ length: BOOM_FRAMES }, (_, frame) => ({ ...IDLE, phase: 'boom' as const, frame, stops: [2, 2, 2], loot })),
  ]
  for (const show of shows) {
    const rows = bandRows(show, EMPTY_STASH, 12, 100)!
    expect(rows.length <= 6).toBe(true)
    rows.forEach(r => expect(width(r) <= 44).toBe(true))
  }
  expect(bandRows({ ...IDLE, phase: 'spinning' }, EMPTY_STASH, 3, 100)).toHaveLength(1)
  expect(bandRows(IDLE, EMPTY_STASH, 12, 100)).toBe(null)
})

test('a turn spins the reels, then the loot box explodes into a prize', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('session.start', () => ({ cwd: '/tmp' }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('turn.complete', ($, e) => ({ text: e.answer }) as never)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND(), surface })
    expect(await ui.find({ type: 'Text', text: /V/ })).toBeUndefined()
    await ui.unmount()
  }

  await $.prompt.submit({ text: 'make it pop', wait: false } as never)
  await clock.advance(FRAME_MS * 5)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND(), surface })
    expect(await ui.find({ type: 'Text', text: '▶' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▜█████▛/ })).toBeDefined()
    await ui.unmount()
  }

  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1' } as never)
  await clock.advance(FRAME_MS * (LOCK_FRAMES + BOOM_FRAMES + 3))

  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /COMMON|RARE|EPIC|LEGENDARY/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /stash/ })).toBeDefined()
  await ui.unmount()

  // The prize clears itself after a while.
  await clock.advance(30000)
  const after = await $.ui.mount({ ...BAND(), surface: 'terminal' })
  expect(await after.find({ type: 'Text', text: /stash/ })).toBeUndefined()
  await after.unmount()
})

test('an interrupted turn tilts the machine', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('turn.complete', ($, e) => ({ text: e.answer }) as never)

  await $.prompt.submit({ text: 'go', wait: false } as never)
  await $.turn.complete({ answer: '', durationMs: 10, isAborted: true, turnId: 't2' } as never)
  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /T I L T/ })).toBeDefined()
  await ui.unmount()
})
