import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, placeFighter } from '../src/physics.js';
import { placeMounted } from '../src/physics/mounted.js';

/** A knight ridden at three ranks of eight `kind` men `files` m apart, ranks `ranks` m apart: his slowest pace (m/s) from 12 m to 4 m off their front, and his horse's paces. */
function chargeAt(kind, files, ranks) {
  // (His own longsword in the saddle, `rideWith: 'own'`: the horse's nerve is what is tested, not the lance's weight on it.)
  const world = createWorld([{ inputs: { ...structuredClone(PRESETS.knight), mounted: true, rideWith: 'own' }, corner: 'red' }, ...Array.from({ length: 24 }, () => ({ inputs: structuredClone(PRESETS[kind]), corner: 'blue' }))], { seed: 1, arena: { halfX: 45, halfZ: 30 } });
  placeMounted(world.fighters[0], -35, 0, 0);
  world.fighters.slice(1).forEach((man, index) => placeFighter(man, Math.floor(index / 8) * ranks, ((index % 8) - 3.5) * files + (Math.floor(index / 8) % 2) * files / 2));
  const rider = world.fighters[0];
  let slowest = Infinity;
  for (let t = 0; t < 8 && rider.mount; t += 1 / 60) {
    advance(world, 1 / 60, (current, dt) => thinkAll(current, dt));
    if (!rider.mount) break;
    const off = Math.min(...world.fighters.slice(1).filter((man) => man.state === 'up').map((man) => Math.abs(man.x[P.pelvis * 3] - rider.mount.at[0])));
    if (off <= 12 && off >= 4) slowest = Math.min(slowest, rider.mount.speed);
  }
  return { slowest, paces: world.fighters[0].mount?.paces ?? { canter: 5.5, gallop: 10.8 } };
}

test('a horse checks only at a closed hedge of spears; bows, swords and spears in loose order it rides at full', () => {
  const closed = chargeAt('spear', 1, 1);
  assert.ok(closed.slowest <= closed.paces.canter + 0.3, `closed spears: down to ${closed.slowest.toFixed(1)} m/s`);
  for (const [kind, files, ranks] of [['spear', 2.2, 2.4], ['bow', 1.2, 1.2], ['swordShield', 1, 1]]) {
    const { slowest, paces } = chargeAt(kind, files, ranks);
    assert.ok(slowest >= 0.85 * paces.gallop, `${kind} ${files} m apart: down to ${slowest.toFixed(1)} m/s`);
  }
});
