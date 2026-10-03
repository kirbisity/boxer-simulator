// Uneven sides, up to eight a side: how fast the simulation runs, how the
// bout goes, friendly fire, and visible glitches.
// Usage: node tools/crowds.js

import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, point } from '../src/physics.js';
import { boneFrames, coherentFrames } from '../src/rig.js';
import { vec } from '../src/pose.js';

const POOL = ['heavy', 'light', 'amateur', 'veteran', 'contender'];

/** A side of n fighters from the presets, in one style. */
function side(corner, count, style, offset) {
  return Array.from({ length: count }, (_, index) => ({ inputs: { ...PRESETS[POOL[(index + offset) % POOL.length]], style }, corner }));
}

export function crowdBout(red, blue, { seconds = 60, seed = 1, arena } = {}) {
  const world = createWorld([...side('red', red, 'boxing', 0), ...side('blue', blue, 'muayThai', 2)], { seed, arena });
  const previous = world.fighters.map(() => null);
  const tally = { pops: 0, flips: 0, landed: 0, friendly: 0, seconds: 0, wall: 0, winner: null, broken: 0 };
  const started = performance.now();
  while (tally.seconds < seconds && !boutWinner(world)) {
    advance(world, 1 / 60, (current, dt) => thinkAll(current, dt));
    tally.seconds += 1 / 60;
    world.fighters.forEach((fighter, index) => {
      const points = Array.from({ length: 15 }, (_, particle) => point(fighter.x, particle));
      if (points.some((at) => at.some((value) => !Number.isFinite(value)))) tally.broken += 1;
      const frames = coherentFrames(boneFrames(points, fighter.body), previous[index]?.frames);
      if (previous[index]) {
        points.forEach((at, particle) => { if (vec.length(vec.sub(at, previous[index].points[particle])) > 0.4) tally.pops += 1; });
        frames.forEach((bone, bone2) => { if (vec.dot(bone.x, previous[index].frames[bone2].x) < 0.5) tally.flips += 1; });
      }
      previous[index] = { points, frames };
    });
  }
  tally.wall = (performance.now() - started) / 1000;
  tally.winner = boutWinner(world);
  for (const event of world.events) {
    if (event.kind !== 'landed') continue;
    tally.landed += 1;
    if (world.fighters[event.attacker].corner === world.fighters[event.defender].corner) tally.friendly += 1;
  }
  tally.fighterMinutes = (tally.seconds * world.fighters.length) / 60;
  return tally;
}

if (process.argv[1]?.endsWith('crowds.js')) {
  for (const [red, blue, arena] of [[1, 5], [8, 3], [8, 8], [4, 2, { halfX: 4.2, halfZ: 1.35 }]]) {
    const t = crowdBout(red, blue, { seconds: 60, arena });
    console.log(`${red} v ${blue}${arena ? ' (platform)' : ''}: ${t.seconds.toFixed(0)} s simulated in ${t.wall.toFixed(1)} s (${(t.seconds / t.wall).toFixed(1)}× real time), winner ${t.winner ?? 'none'}, friendly fire ${t.friendly}/${t.landed}, pops ${(t.pops / t.fighterMinutes).toFixed(2)} and flips ${(t.flips / t.fighterMinutes).toFixed(2)} per fighter-minute, broken ${t.broken}`);
  }
}
