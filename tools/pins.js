// Holding down: one man put on the floor, the other holding him there.
// How often the hold lasts its seconds (pinned) or is broken, and whether
// any blow lands on a held man.
// Usage: node tools/pins.js [tries]

import { thinkAll } from '../src/ai.js';
import { PRESETS } from '../src/body.js';
import { advance, boutWinner, createWorld, placeFighter, WORLD } from '../src/physics.js';

export function holdTrial(holder, held, tries = 10, seconds = 15) {
  const tally = { pinned: 0, escaped: 0, holds: 0, breaks: 0, blowsWhileHeld: 0 };
  for (let seed = 0; seed < tries; seed += 1) {
    const world = createWorld([{ ...PRESETS[holder], style: 'boxing' }, { ...PRESETS[held], style: 'boxing' }], { seed: 900 + seed });
    const [top, bottom] = world.fighters;
    placeFighter(top, -0.6, 0);
    placeFighter(bottom, 0.6, 0);
    // Put him down as a fall would: knocked over, a few seconds' count.
    bottom.knock = [-WORLD.balance.speed * 3, 0, 0];
    advance(world, 1 / 60);
    let elapsed = 0;
    let wasHeld = false;
    while (elapsed < seconds && !boutWinner(world)) {
      advance(world, 0.1, (current, dt) => thinkAll(current, dt));
      elapsed += 0.1;
      if (bottom.pinClock > 0) wasHeld = true;
      if (wasHeld && bottom.state === 'up') break;
    }
    const kinds = world.events.map((event) => event.kind);
    tally.holds += kinds.filter((kind) => kind === 'held').length;
    tally.breaks += kinds.filter((kind) => kind === 'pinBroken').length;
    if (kinds.includes('pinned')) tally.pinned += 1;
    else if (bottom.state === 'up') tally.escaped += 1;
    // A blow on him while the clock ran.
    tally.blowsWhileHeld += world.events.filter((event) => event.kind === 'landed' && event.defender === bottom.id && world.events.some((held) => held.kind === 'held' && held.time <= event.time) && !world.events.some((other) => (other.kind === 'pinBroken' || other.kind === 'pinned') && other.time <= event.time)).length;
  }
  return tally;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tries = Number(process.argv[2] ?? 10);
  for (const [holder, held] of [['heavy', 'light'], ['light', 'heavy'], ['contender', 'amateur'], ['amateur', 'contender']]) {
    console.log(`${holder} holding ${held}:`.padEnd(30), JSON.stringify(holdTrial(holder, held, tries)));
  }
}
