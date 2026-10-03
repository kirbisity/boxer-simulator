// Weapon arms: how often an arm holding a weapon folds back — the elbow
// pointing behind the shoulder, or the hand drawn back past it — measured in
// the fighter's own frame (x forward) over the time he stands holding it.
// Usage: node tools/arms.js [bouts per style] [seconds]

import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, point, toLocal } from '../src/physics.js';

export const ARM_STYLES = ['baton', 'longsword', 'katana', 'knife', 'hoplomachus', 'warhammer', 'naginata', 'spear'];
// How far behind the shoulder counts as folded back (m).
const BEHIND = 0.06;

export function armFolding(style, bouts = 3, seconds = 40) {
  const totals = { samples: 0, elbowBack: 0, handBack: 0, worstElbow: 0 };
  const preset = Object.values(PRESETS).find((entry) => entry.style === style);
  for (let bout = 0; bout < bouts; bout += 1) {
    const world = createWorld([{ ...preset }, { ...PRESETS.contender, style: 'longsword' }], { seed: 300 + bout });
    for (let tick = 0; tick < seconds * 30 && !boutWinner(world); tick += 1) {
      advance(world, 1 / 30, (current, dt) => thinkAll(current, dt));
      for (const fighter of world.fighters) {
        if (fighter.state !== 'up' || !fighter.weapon?.held) continue;
        const sides = fighter.weapon.spec.grip === 'two' || fighter.weapon.twoHanded ? ['l', 'r'] : [fighter.weapon.main];
        for (const side of sides) {
          const shoulder = toLocal(fighter, point(fighter.x, P[`${side}Shoulder`]));
          const elbow = toLocal(fighter, point(fighter.x, P[`${side}Elbow`]));
          const hand = toLocal(fighter, point(fighter.x, P[`${side}Hand`]));
          totals.samples += 1;
          const elbowBehind = shoulder[0] - elbow[0];
          if (elbowBehind > BEHIND) totals.elbowBack += 1;
          if (shoulder[0] - hand[0] > BEHIND) totals.handBack += 1;
          totals.worstElbow = Math.max(totals.worstElbow, elbowBehind);
        }
      }
    }
  }
  return { style, elbowBack: totals.elbowBack / totals.samples, handBack: totals.handBack / totals.samples, worstElbow: totals.worstElbow };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bouts = Number(process.argv[2] ?? 3);
  const seconds = Number(process.argv[3] ?? 40);
  for (const style of ARM_STYLES) {
    const row = armFolding(style, bouts, seconds);
    console.log(`${style.padEnd(12)} elbow behind shoulder ${(row.elbowBack * 100).toFixed(1).padStart(5)}%  hand behind ${(row.handBack * 100).toFixed(1).padStart(5)}%  worst elbow ${(row.worstElbow * 100).toFixed(0)} cm`);
  }
}
