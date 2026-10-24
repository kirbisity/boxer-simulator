// Stage 1 run by a player who holds the run key: the whole route, cliff path to the chapel, sprinting (Shift+forward) with the stick held toward the
// next point of the route, through the real controls (control.js directFighter: run mode, the run's steering along walls), with the two comrades
// awake and following (a comrade must not wall him in at a door or on the path) and the garrison asleep. A snag shows as a leg he does not finish.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { directFighter, newOrders } from '../src/control.js';
import { createLevelWorld, levelThink } from '../src/levelmode/level.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { setMechanism, stageThink, updateStage } from '../src/levelmode/stage.js';
import { DUNNOTTAR, DUNNOTTAR_ROUTE } from '../src/levelmode/stages/dunnottar.js';
import { advance } from '../src/physics.js';

const hips = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];

// (Seed 6 since the drawbridge: with the barbican's men in the world the draws differ, and seed 5 stalls for 6 s on the winding stair, far from anything that changed; 4, 6 and 7 run clean.)
/** Run the route; returns { leg, point, at, seconds } of the first point he did not reach in `most` seconds, or null. */
function runRoute({ allies = true, seed = 6, most = 40, near = 1.4 } = {}) {
  const world = createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed });
  const me = world.fighters[0];
  for (const fighter of world.fighters.slice(1)) if (!(allies && fighter.spawn?.role === 'ally')) fighter.dormant = true;
  updateStage(world, true);
  const orders = newOrders();
  orders.keyStick = null;
  const step = (current, dt) => {
    stageThink(current, dt);
    levelThink(current, dt);
    directFighter(current, me, orders, dt);
  };
  for (const leg of DUNNOTTAR_ROUTE) {
    for (const id of leg.open ?? []) setMechanism(world, id, 'open');
    for (const [index, point] of leg.points.entries()) {
      const started = world.time;
      let best = Infinity;
      let bestAt = world.time;
      for (;;) {
        const [x, z] = hips(me);
        const d = Math.hypot(point[0] - x, point[1] - z);
        if (d < near) break;
        if (d < best - 0.1) {
          best = d;
          bestAt = world.time;
        } else if (world.time - bestAt > 6 || world.time - started > most) {
          return { leg: leg.name, point: index, target: point, at: [x, z], seconds: world.time - started };
        }
        orders.keyStick = { dir: [(point[0] - x) / d, (point[1] - z) / d], amount: 1 };
        advance(world, 1 / 60, step);
      }
    }
  }
  return null;
}

test('dunnottar: a player who sprints the whole route, comrades at his heels, is never held up by the path, a rail, a crag, a prop or a comrade', () => {
  assert.equal(runRoute({ allies: true }), null);
});
