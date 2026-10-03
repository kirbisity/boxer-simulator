// How a style fights: strikes per minute, combinations, and how often head
// strikes land clean, are blocked, or are made to miss by head movement.
// Usage: node tools/aggression.js [style] [bouts] [seconds]

import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld } from '../src/physics.js';

/** Play bouts between two fighters of one style and count what they do. */
export function measureStyle(style = 'boxing', bouts = 6, seconds = 60, pair = ['heavy', 'light']) {
  const tally = { minutes: 0, thrown: 0, inCombo: 0, headThrown: 0, headClean: 0, headBlocked: 0, headEvaded: 0, moved: 0, movedEvaded: 0, defences: 0, slips: 0, advancing: 0, frames: 0 };
  for (let bout = 0; bout < bouts; bout += 1) {
    const world = createWorld(pair.map((key) => ({ ...PRESETS[key], style })), { seed: 500 + bout });
    const seen = new Set();
    const resolved = new Set();
    let elapsed = 0;
    while (elapsed < seconds && !boutWinner(world)) {
      advance(world, 1 / 30, (current, dt) => thinkAll(current, dt));
      elapsed += 1 / 30;
      for (const fighter of world.fighters) {
        tally.frames += 1;
        if (fighter.move > 0.3) tally.advancing += 1;
        const punch = fighter.punch;
        if (punch && !seen.has(punch)) {
          seen.add(punch);
          tally.thrown += 1;
          if (fighter.aiComboStep > 0) tally.inCombo += 1;
          if (punch.zone === 'head') tally.headThrown += 1;
          punch.defender = world.fighters[punch.target];
        }
        const defence = fighter.defence;
        if (defence && !seen.has(defence)) {
          seen.add(defence);
          tally.defences += 1;
          if (defence.name === 'slip' || defence.name === 'roll') tally.slips += 1;
          fighter.lastDefence = defence.name;
        }
        // A head strike that finished its reach without touching anything was made to miss.
        for (const old of seen) {
          if (old.spec && old.zone === 'head' && !resolved.has(old) && old.t > old.spec.extendUntil + 0.06) {
            resolved.add(old);
            if (!old.landed) tally.headEvaded += 1;
            // Did the defender move the head while this one was in the air?
            const moved = old.defender?.seenPunch === old && ['slip', 'roll'].includes(old.defender.lastDefence);
            if (moved) {
              tally.moved += 1;
              if (!old.landed) tally.movedEvaded += 1;
            }
          }
        }
      }
      for (const event of world.events.splice(0)) {
        if (event.kind === 'landed' && event.target === 'head') tally.headClean += 1;
        if (event.kind === 'blocked' && (event.punch ?? '').match(/jab|cross|hook|uppercut/)) tally.headBlocked += 1;
      }
    }
    tally.minutes += (elapsed * world.fighters.length) / 60;
  }
  return {
    perMinute: tally.thrown / tally.minutes,
    comboShare: tally.inCombo / Math.max(1, tally.thrown),
    headClean: tally.headClean / Math.max(1, tally.headThrown),
    headEvaded: tally.headEvaded / Math.max(1, tally.headThrown),
    defencesPerMinute: tally.defences / tally.minutes,
    headMoveShare: tally.slips / Math.max(1, tally.defences),
    slipWorks: tally.movedEvaded / Math.max(1, tally.moved),
    slipTried: tally.moved / Math.max(1, tally.headThrown),
    advancing: tally.advancing / tally.frames,
  };
}

if (process.argv[1]?.endsWith('aggression.js')) {
  const [style = 'boxing', bouts = '6', seconds = '60'] = process.argv.slice(2);
  const result = measureStyle(style, Number(bouts), Number(seconds));
  for (const [key, value] of Object.entries(result)) console.log(key.padEnd(18), value.toFixed(2));
}
