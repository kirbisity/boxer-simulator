// Fear and confidence in mismatched bouts: each fighter's confidence, how
// much he presses forward, how often he throws and defends — with the
// mechanism on, and with it off (confidence held at 0) for comparison.
// Usage: node tools/fear.js [bouts] [seconds]

import { PRESETS } from '../src/body.js';
import { AI, confidence, thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld } from '../src/physics.js';

export const MISMATCHES = [['heavy', 'amateur'], ['heavy', 'light'], ['contender', 'amateur']];

/** Per fighter of a pairing: confidence, share of time advancing, strikes and defences a minute. */
export function fearProfile(pair, { bouts = 6, seconds = 60, enabled = true, style = 'boxing' } = {}) {
  const saved = { ...AI.confidence };
  if (!enabled) for (const key of Object.keys(AI.confidence)) AI.confidence[key] = 0;
  // Pressing and defending are counted only while both stand: time spent
  // waiting out a knockdown is neither.
  const rows = pair.map(() => ({ confidence: 0, advancing: 0, thrown: 0, defences: 0, frames: 0, standing: 0, minutes: 0 }));
  try {
    for (let bout = 0; bout < bouts; bout += 1) {
      const world = createWorld(pair.map((key) => ({ ...PRESETS[key], style })), { seed: 600 + bout });
      const seen = new Set();
      let elapsed = 0;
      while (elapsed < seconds && !boutWinner(world)) {
        advance(world, 1 / 30, (current, dt) => thinkAll(current, dt));
        elapsed += 1 / 30;
        world.fighters.forEach((fighter, index) => {
          const row = rows[index];
          row.frames += 1;
          row.confidence += confidence(fighter, world.fighters[1 - index]);
          const bothUp = world.fighters.every((each) => each.state === 'up');
          if (bothUp) row.standing += 1;
          if (bothUp && fighter.move > 0.3) row.advancing += 1;
          for (const thing of [fighter.punch, fighter.defence]) {
            if (thing && !seen.has(thing)) {
              seen.add(thing);
              if (thing === fighter.punch) row.thrown += 1;
              else row.defences += 1;
            }
          }
        });
      }
      for (const row of rows) row.minutes += elapsed / 60;
    }
  } finally {
    Object.assign(AI.confidence, saved);
  }
  return rows.map((row) => ({ confidence: row.confidence / row.frames, advancing: row.advancing / Math.max(1, row.standing), perMinute: row.thrown / row.minutes, defencesPerMinute: row.defences / (row.standing / 30 / 60 || 1) }));
}

if (process.argv[1]?.endsWith('fear.js')) {
  const [bouts = '6', seconds = '60'] = process.argv.slice(2);
  for (const pair of MISMATCHES) {
    const on = fearProfile(pair, { bouts: Number(bouts), seconds: Number(seconds) });
    const off = fearProfile(pair, { bouts: Number(bouts), seconds: Number(seconds), enabled: false });
    pair.forEach((key, index) => {
      const fmt = (row) => `conf ${row.confidence.toFixed(2)}  advancing ${(row.advancing * 100).toFixed(0)}%  strikes/min ${row.perMinute.toFixed(1)}  defences/min ${row.defencesPerMinute.toFixed(1)}`;
      console.log(`${pair.join(' v ')} · ${key.padEnd(9)} on:  ${fmt(on[index])}`);
      console.log(`${' '.repeat(pair.join(' v ').length)} · ${''.padEnd(9)} off: ${fmt(off[index])}`);
    });
  }
}
