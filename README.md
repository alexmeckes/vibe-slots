# vibe-slots

Vibe coding as a slot machine. While Claude works, a slot cabinet spins in the band above the prompt; every tool call drops another coin in. When the turn ends the reels lock one by one, a loot box rattles, glows its rarity color, cracks and explodes, and you get a prize.

- Clawd, the Claude Code mascot, works the machine: blinks while it spins, ducks to pull the lever, hops while the box rattles, cheers at the explosion, and dances for a jackpot (or just blinks at a common prize).
- Rarity: common 60%, rare 25%, epic 12%, legendary 3% (each coin adds +0.5% to legendary, capped at 10%).
- The payline matches the tier: 7-7-7 is legendary, a triple is epic, a pair is rare.
- Your stash of prizes is kept across sessions (`$.store`).
- An interrupted turn shows TILT. Short or narrow terminals get a one-line version.
- The prize clears itself after 20 seconds or on your next prompt.

Try it:

```
git clone https://github.com/alexmeckes/vibe-slots
claude --plugin-dir ./vibe-slots
```

Files: `hooks/art.ts` (all frames and loot tables, pure functions), `hooks/register.tsx` (hooks and ticker), `types/index.d.ts` (state contract), `tests/slots.test.tsx`.

Check: `claude plugin validate .` and `claude plugin test .`
