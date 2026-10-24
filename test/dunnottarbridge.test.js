// Stage 1, Dunnottar: the approach. Between the gorge shelf and the castle rock the sea runs in through a ravine, crossed by a drawbridge from the
// barbican; the great gate is just beyond it, heavily held (archers on the barbican, guards at the bridge's end, the plate knight on the ledge), and
// the sea cave's lit stair down to the old drain is at the bridge's head, in sight of the gate: the choice is shown, and the way round is the plain one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { advance, placeOnFloor } from '../src/physics.js';
import { createLevelWorld, levelThink } from '../src/levelmode/level.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { activeSections, mechanismsOf, stageTerrain, updateStage } from '../src/levelmode/stage.js';
import { DN_BARBICAN, DN_BRIDGE, DN_RAVINE, DN_Y, DUNNOTTAR, DUNNOTTAR_ROUTE, DUNNOTTAR_SEWER_ROUTE } from '../src/levelmode/stages/dunnottar.js';
import { DN_CAVE_STAIR } from '../src/levelmode/stages/dunnottar-sewer.js';
import { floorAt, rayBlocked } from '../src/physics/terrain.js';
import { walk } from './walker.js';

const states = Object.fromEntries(mechanismsOf(DUNNOTTAR).map((mechanism) => [mechanism.id, mechanism.state]));
const terrain = stageTerrain(DUNNOTTAR, DUNNOTTAR.sections.map((section) => section.id), states);
const cliff = DUNNOTTAR.sections.find((section) => section.id === 'cliff');
const spawns = DUNNOTTAR.sections.flatMap((section) => section.spawns);
const spawn = (id) => spawns.find((entry) => entry.id === id);
const pelvisY = (fighter) => fighter.x[P.pelvis * 3 + 1];
const quiet = (world) => {
  for (const fighter of world.fighters.slice(1)) fighter.dormant = true;
};

test('approach: a ravine of the sea, 14 to 20 m wide, between the shelf and the castle rock: nothing to stand on in it but the bridge', () => {
  const width = DN_RAVINE.x1 - DN_RAVINE.x0;
  assert.ok(width >= 14 && width <= 20, `${width} m`);
  for (const z of [39, 42, 50, 54, 58]) {
    for (let x = DN_RAVINE.x0 + 0.5; x < DN_RAVINE.x1 - 0.5; x += 1) assert.equal(floorAt(terrain, x, z, 2), -Infinity, `${x},${z} has a floor`);
  }
  // The deck: timber, level with the shelf, its ends on the rock either side, rails both sides.
  for (let x = DN_RAVINE.x0 - 0.3; x <= DN_RAVINE.x1 + 0.3; x += 0.5) assert.equal(floorAt(terrain, x, (DN_BRIDGE.z0 + DN_BRIDGE.z1) / 2, 2), DN_Y.gorge, `deck at ${x}`);
  assert.ok(cliff.decor.some((decor) => decor.kind === 'prop' && decor.what === 'drawbridge'));
  assert.equal(cliff.decor.filter((decor) => decor.kind === 'fence' && decor.points.every((p) => Math.abs(p[1] - DN_BRIDGE.z0 - 0.05) < 1e-6 || Math.abs(p[1] - DN_BRIDGE.z1 + 0.05) < 1e-6)).length, 2);
  // The sea is the stage's: a man who goes into the ravine is lost to it, as off any cliff.
  assert.equal(DUNNOTTAR.sea, DN_Y.sea);
  assert.ok(DUNNOTTAR.landform.carve.some(([x0, x1, z0, , top]) => x0 <= DN_RAVINE.x0 && x1 >= DN_RAVINE.x1 && z0 <= 38.4 && top < DN_Y.sea), 'the hill is cut away down to the sea there');
});

test('approach: the bridge is walked end to end, and a man who steps off it beside its rail falls to the sea and is lost', () => {
  const w = createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed: 4 });
  w.stage.ghost = true;
  const me = w.fighters[0];
  quiet(w);
  placeOnFloor(me, -36, 46.2, DN_Y.gorge, 0);
  updateStage(w, true);
  const think = (current, dt) => {
    quiet(current);
    levelThink(current, dt);
  };
  const result = walk(w, me, [[-30, 46.2], [-24, 46.2], [-19, 46.2], [-14, 46.2], [-10.4, 46.2], [-8.4, 50.4], [-8.2, 54]], { seconds: 60, think });
  assert.equal(result.reached, 7, `stuck near ${result.stuckAt?.map((v) => v.toFixed(1))}`);
  assert.ok(pelvisY(me) > 0.4, 'on his feet at the ledge');
  // Off the bridge: set down over the water beside it, he falls and the sea has him.
  const v = createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed: 4 });
  const man = v.fighters[0];
  quiet(v);
  placeOnFloor(man, -19, 41, DN_Y.gorge + 0.2, 0);
  advance(v, 4, (current, dt) => {
    quiet(current);
    levelThink(current, dt);
  });
  assert.ok(pelvisY(man) < DN_Y.gorge - 3 || man.state === 'out', `he fell (at ${pelvisY(man).toFixed(2)})`);
});

test('approach: the gate is close to the sea cave\'s stair head and in sight of it; the stair head does not wake the gatehouse', () => {
  const head = [DN_CAVE_STAIR.head + 1.7, 57.6];
  const gate = [-6, 46.2];
  const apart = Math.hypot(head[0] - gate[0], head[1] - gate[1]);
  assert.ok(apart >= 15 && apart <= 25, `${apart.toFixed(1)} m from the stair head to the great gate`);
  // From the bridge's far end (the barbican's arch) the stair head is in sight, and from the bridge's head both the gate and the stair.
  assert.ok(!rayBlocked(terrain, [DN_BARBICAN.x0 - 0.5, 46.2], head, 1.6, 1.6), 'the stair head from the bridge\'s far end');
  assert.ok(!rayBlocked(terrain, [-28, 46.2], [gate[0] - 1, gate[1]], 1.6, 1.6), 'the gate from the bridge\'s head');
  assert.ok(!rayBlocked(terrain, [-28, 46.2], head, 1.6, 1.0), 'the stair head from the bridge\'s head');
  assert.ok(!activeSections(DUNNOTTAR, [head[0], 0.95, 56.5]).includes('gate'));
  assert.ok(activeSections(DUNNOTTAR, [-20, 0.95, 46.2]).includes('gate'), 'the gatehouse wakes as he steps onto the bridge');
  // The way round is lit and marked at its head, and the front is marked as a way to die: a lantern and a brazier lit at the stair head, a sign, the note
  // on the dead levy at the bridge's head; a sign with a skull at the bridge.
  const near = (decor, [x, z], reach) => Math.hypot(decor.at[0] - x, decor.at[2] - z) < reach;
  const props = cliff.decor.filter((decor) => decor.kind === 'prop');
  assert.ok(props.some((decor) => decor.what === 'lantern' && near(decor, head, 4)), 'a lantern at the stair head');
  assert.ok(props.some((decor) => decor.what === 'brazier' && decor.lit && near(decor, head, 6)), 'a lit brazier at the stair head');
  assert.ok(props.some((decor) => decor.what === 'sign' && !decor.warn && near(decor, head, 4)), 'a sign pointing down the stair');
  assert.ok(props.some((decor) => decor.what === 'sign' && decor.warn && near(decor, [DN_RAVINE.x0, 46.2], 3)), 'a warning at the bridge');
  assert.ok(cliff.items.some((item) => item.note === 'bridge' && Math.hypot(item.at[0] - DN_RAVINE.x0, item.at[2] - 46.2) < 6), 'the dead levy\'s note at the bridge\'s head');
  // The worn way: the way-marks of the shelf lead to the stair head, none to the bridge.
  const marks = cliff.decor.filter((decor) => decor.kind === 'waymarks').flatMap((decor) => decor.points);
  assert.ok(marks.some(([x, z]) => Math.hypot(x - head[0], z - head[1]) < 3.5));
  assert.ok(!marks.some(([x, z]) => x > DN_RAVINE.x0 - 1 && x < DN_RAVINE.x1 && z > 40 && z < 52), 'no way-mark on the bridge');
});

test('approach: the front is held: archers on the barbican with lines of fire along the bridge and its head, guards at its end, the knight on the ledge, one alarm', () => {
  const archers = ['archer1', 'archer2', 'archer3'].map(spawn);
  for (const archer of archers) {
    assert.equal(archer.preset, 'dunnottarArcher');
    assert.ok(archer.perch && archer.alarm === 'front');
    assert.equal(archer.post[1], DN_BARBICAN.top);
    // On the platform, inside its parapets (no way down: the platform is walled round and nothing climbs to it).
    assert.equal(floorAt(terrain, archer.post[0], archer.post[2], archer.post[1] + 0.5), DN_BARBICAN.top);
    // Each sees the bridge's head.
    for (const target of [[-25, 46.2], [-28, 47]]) {
      assert.ok(!rayBlocked(terrain, [archer.post[0], archer.post[2]], target, archer.post[1] + 1.5, 1.4), `${archer.id} sees ${target}`);
    }
  }
  // Along the rest of the deck at least one of them has a line (not the end right under the barbican: the arch covers it, and a bow does not shoot down
  // through the parapet at his feet).
  for (const target of [[-22, 46.2], [-19, 46.2], [-19, 45], [-19, 47.4]]) {
    assert.ok(archers.some((archer) => !rayBlocked(terrain, [archer.post[0], archer.post[2]], target, archer.post[1] + 1.5, 1.4)), `someone sees ${target}`);
  }
  assert.equal(floorAt(terrain, DN_BARBICAN.x0 + 1.5, (DN_BARBICAN.z0 + DN_BARBICAN.z1) / 2, 3), DN_Y.gorge, 'under the platform is the arch over the bridge\'s end');
  for (const id of ['bridgeguard1', 'bridgeguard2', 'bridgelevy', 'gateknight']) assert.equal(spawn(id).alarm, 'front', id);
  assert.equal(spawn('gateknight').preset, 'dunnottarPlateKnight');
  // The front's way is the main route's: the bridge, the arch, past the guards, the ledge, the postern.
  const leg = DUNNOTTAR_ROUTE.find((entry) => entry.name === 'the drawbridge and the ledge');
  assert.ok(leg.points.some(([x]) => x > DN_RAVINE.x0 && x < DN_RAVINE.x1));
});

test('approach: one of the front\'s men who sees him raises them all, the archers on the barbican with them', () => {
  const w = createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed: 9 });
  const me = w.fighters[0];
  // On the bridge's head, in front of the guards' eyes (they look west along the bridge).
  placeOnFloor(me, -24, 46.2, DN_Y.gorge, 0);
  updateStage(w, true);
  const front = w.fighters.filter((fighter) => ['archer1', 'archer2', 'archer3', 'bridgeguard1', 'bridgeguard2', 'bridgelevy'].includes(fighter.spawn?.id));
  assert.equal(front.length, 6);
  advance(w, 2, (current, dt) => levelThink(current, dt));
  const minds = w.stage.aware.minds;
  const state = (fighter) => minds[fighter.id]?.state;
  assert.ok(front.every((fighter) => state(fighter) === 'aggro'), front.map((fighter) => `${fighter.spawn.id}: ${state(fighter)}`).join(', '));
});

test('approach: the front watches the bridge, not the way round: no man of it sees the shelf\'s path to the sea cave\'s stair, all of it sees the bridge', () => {
  const front = spawns.filter((entry) => entry.alarm === 'front' && entry.id !== 'gateknight');
  /** Whether a post sees (x, z) at a man's height: within its range, in its cone (120 degrees about its facing), no wall between. */
  const watches = (post, x, z) => {
    const dx = x - post.post[0];
    const dz = z - post.post[2];
    const apart = Math.hypot(dx, dz);
    if (apart > post.vision) return false;
    if ((Math.cos(post.facing) * dx - Math.sin(post.facing) * dz) / apart < Math.cos(Math.PI / 3)) return false;
    return !rayBlocked(terrain, [post.post[0], post.post[2]], [x, z], post.post[1] + 1.6, 1.6);
  };
  const legs = DUNNOTTAR_SEWER_ROUTE.filter((leg) => ['the shelf to the sea cave stair', 'down the stair to the landing'].includes(leg.name));
  assert.equal(legs.length, 2);
  const seen = [];
  for (const leg of legs) {
    for (let i = 0; i + 1 < leg.points.length; i += 1) {
      const [x0, z0] = leg.points[i];
      const [x1, z1] = leg.points[i + 1];
      for (let t = 0; t <= 1; t += 0.1) {
        const [x, z] = [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
        for (const post of front) if (watches(post, x, z)) seen.push(`${post.id} sees ${x.toFixed(1)},${z.toFixed(1)}`);
      }
    }
  }
  assert.deepEqual(seen, []);
  for (let x = DN_RAVINE.x0 + 1; x < DN_RAVINE.x1; x += 2) assert.ok(front.some((post) => watches(post, x, 46.2)), `the bridge at ${x} is watched`);
});
