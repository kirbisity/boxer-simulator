// The camera's spring arm (src/cameraarm.js) and what it sweeps through: the terrain of a stage (physics/terrain.js sweepReach), the
// voxels of a battle place (src/occluders.js). The camera is never made see-through scenery; it is kept clear of it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARM, armDirection, armPosition, createArm, joinWorlds, roomWorld } from '../src/cameraarm.js';
import { createVoxels } from '../src/occluders.js';
import { ceilingOf, clearOfSolids, createTerrain, floorAt, pushOut, slabOf, solidAt, stairsOf, sweepReach, terrainWorld, wallOf } from '../src/physics/terrain.js';
import { mechanismsOf, stageTerrain } from '../src/levelmode/stage.js';
import { TESTYARD } from '../src/levelmode/stages/testyard.js';

const FRAME = 1 / 60;
/** A man's look point 1.45 m up, the wanted camera 4.2 m behind at 0.26 rad: the follow camera's own. */
const wanted = (over = {}) => ({ target: [0, 1.45, 0], yaw: Math.PI / 2, pitch: 0.26, distance: 4.2, ...over });
/** A flat floor at 0 and what else a test adds. */
const place = (...solids) => terrainWorld(createTerrain([slabOf([0, 0], [120, 120], 0, { id: 'floor' }), ...solids]));
const length = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

test('sweepReach: a ball goes the whole way in the open, stops short of a wall by its radius, and is not stopped by a wall beside its line', () => {
  const t = createTerrain([slabOf([0, 0], [120, 120], 0), wallOf([0, 5], [20, 1], 0, 6)]);
  assert.equal(sweepReach(t, [0, 2, 0], [0, 0, -1], 4, 0.3), 4, 'away from the wall');
  const reach = sweepReach(t, [0, 2, 0], [0, 0, 1], 10, 0.3);
  assert.ok(Math.abs(reach - (4.5 - 0.3)) < 1e-6, `stops ${reach.toFixed(3)} m out, 0.3 short of the wall's face at 4.5`);
  assert.equal(sweepReach(t, [0, 2, 0], [1, 0, 0], 9, 0.3), 9, 'along a wall 4.5 m away');
  const near = sweepReach(t, [0, 2, 4.4], [1, 0, 0], 9, 0.3);
  assert.equal(near, 9, 'a start already within the radius of a wall is not stopped by it for moving along it');
  assert.ok(sweepReach(t, [0, 2, 4.4], [0, 0, 1], 4, 0.3) < 0.2, 'but towards it, it is');
  assert.ok(sweepReach(t, [0, 2, 0], [0, -1, 0], 5, 0.3) < 1.8 + 1e-6, 'the floor stops a ball going down at its radius');
});

test('sweepReach: ceilings stop it going up, a flight of stairs is a floor that rises, a start inside a solid is not a wall', () => {
  const t = createTerrain([slabOf([0, 0], [60, 60], 0), ceilingOf([0, 0], [10, 10], 3), stairsOf([20, 0], [4, 2], 10, 0, 0.3, { yaw: 0 })]);
  assert.ok(Math.abs(sweepReach(t, [0, 1, 0], [0, 1, 0], 5, 0.3) - 1.7) < 1e-6, 'up to the ceiling at 3, less the radius');
  // Walking east along a floor toward the foot of a flight that rises to 3 m: the ball touches it at about its radius short of the first tread.
  const toStairs = sweepReach(t, [14, 1.5, 0], [1, 0, 0], 12, 0.3);
  assert.ok(toStairs < 6.2 && toStairs > 5.4, `the flight is met ${toStairs.toFixed(2)} m out`);
  assert.equal(sweepReach(t, [14, 4.5, 0], [1, 0, 0], 12, 0.3), 12, 'above the top tread (3 m) it is clear');
  const inside = createTerrain([wallOf([0, 0], [2, 2], 0, 3)]);
  assert.equal(sweepReach(inside, [0, 1, 0], [1, 0, 0], 5, 0.3), 5, 'a start inside a part does not see it');
});

test('clearOfSolids: a look point over a man'.concat("'s shoulder that is in a wall is moved out of it, sideways"), () => {
  const t = createTerrain([slabOf([0, 0], [60, 60], 0), wallOf([0.6, 0], [0.8, 20], 0, 3)]);
  const moved = clearOfSolids(t, [0.4, 1.5, 0], 0.3);
  assert.ok(moved[0] < 0.2 + 1e-6, `moved to x ${moved[0].toFixed(2)}, off the wall's face at 0.2`);
  assert.equal(moved[1], 1.5);
  assert.deepEqual(clearOfSolids(t, [-4, 1.5, 0], 0.3), [-4, 1.5, 0], 'in the open: unmoved');
});

test('open space: the camera is where it was wanted, unchanged, frame after frame', () => {
  const arm = createArm();
  const world = place();
  for (let frame = 0; frame < 120; frame += 1) {
    const input = wanted({ yaw: 1 + frame * 0.01, distance: 3 + (frame % 5) * 0.2 });
    const seen = arm.solve(input, world, FRAME);
    const at = armPosition(input.target, input.yaw, input.pitch, input.distance);
    assert.ok(length(seen.position, at) < 1e-9, `frame ${frame}`);
    assert.equal(seen.pulled, 0);
  }
});

test('a wall behind him: the camera comes in to its margin from the wall, not into it, still looking down the same line', () => {
  // He looks toward +z... the wanted camera is at -z of him (yaw -pi/2), and a wall stands 2.7 m behind that side.
  const world = place(wallOf([0, -3], [30, 0.6], 0, 6));
  const arm = createArm();
  let seen;
  for (let frame = 0; frame < 90; frame += 1) seen = arm.solve(wanted({ yaw: -Math.PI / 2 }), world, FRAME);
  const [x, y, z] = seen.position;
  assert.ok(z > -2.7 + ARM.hardRadius - 1e-6, `the camera at z ${z.toFixed(2)} keeps its near plane off the wall's face at -2.7`);
  assert.ok(seen.distance > 1.9 && seen.distance < 3.0, `${seen.distance.toFixed(2)} m out: in, but not on top of him`);
  assert.ok(Math.abs(x) < 1.6, 'and not slid far to a side: the wall is square to the view');
  assert.ok(y > 1.45, 'above his look point, as a third-person camera is');
});

test('a low ceiling above: the view flattens, the camera stays under the roof and never goes top-down', () => {
  // A roof 2.3 m up over the floor; he looks at 1.45; the view wanted is 0.4 rad up, which would go through the roof 1.1 m out.
  const world = place(ceilingOf([0, 0], [30, 30], 2.3));
  const arm = createArm();
  let seen;
  for (let frame = 0; frame < 90; frame += 1) seen = arm.solve(wanted({ pitch: 0.4, distance: 4.2 }), world, FRAME);
  assert.ok(seen.position[1] <= 2.3 - ARM.hardRadius + 1e-6, `the camera at ${seen.position[1].toFixed(2)} is under the roof`);
  assert.ok(seen.pitch < 0.3 && seen.pitch >= ARM.pitchMin, `the pitch is ${seen.pitch.toFixed(2)}, flatter than wanted`);
  assert.ok(seen.distance > 2.4, `and the camera still stands ${seen.distance.toFixed(2)} m back, not on top of him`);
});

test('a corridor: the camera stays behind him down it, even when the view is not square to it', () => {
  // Walls at x -1.7 and 1.7 (3.4 m between them) as the old drain, a roof at 3.2 over a floor at 0; he stands in the middle looking down it.
  const world = place(wallOf([-2.2, 0], [1, 40], 0, 6), wallOf([2.2, 0], [1, 40], 0, 6), ceilingOf([0, 0], [8, 40], 3.2));
  for (const off of [0, 0.15, 0.3, -0.3, 0.45]) {
    const arm = createArm();
    let seen;
    for (let frame = 0; frame < 90; frame += 1) seen = arm.solve(wanted({ yaw: Math.PI / 2 + off, target: [0.45, 1.85, 0] }), world, FRAME);
    assert.ok(seen.distance > 2.9, `view ${off} rad off the corridor: ${seen.distance.toFixed(2)} m back`);
    assert.ok(Math.abs(seen.position[0]) < 1.3, `view ${off} rad off: the camera at x ${seen.position[0].toFixed(2)} is in the corridor, behind him`);
    assert.ok(seen.position[2] > 2.5, 'and behind, not beside him');
    assert.ok(seen.pitch >= 0.1 && seen.pitch < 0.6, `pitch ${seen.pitch.toFixed(2)}: a third-person view`);
  }
});

test('a dead end behind him: the camera goes up and over a low wall, not on top of him', () => {
  // A wall 2 m high whose face is 1.5 m behind where he stands (the camera is wanted at +z, 4.2 m out).
  const world = place(wallOf([0, 1.8], [30, 0.6], 0, 2.0));
  const arm = createArm();
  let seen;
  for (let frame = 0; frame < 90; frame += 1) seen = arm.solve(wanted({ yaw: Math.PI / 2, distance: 4.2 }), world, FRAME);
  assert.ok(seen.distance > 2.3, `${seen.distance.toFixed(2)} m out`);
  assert.ok(seen.pitch > 0.5 && seen.pitch <= ARM.pitchMax, `over the wall at ${seen.pitch.toFixed(2)} rad`);
});

test('the arm comes in fast and goes out slow: with no jump a frame, and nothing at all for a moment after the wall has gone', () => {
  const wall = wallOf([0, 4], [60, 0.6], 0, 6);
  const near = place(wall);
  const open = place();
  const arm = createArm();
  const input = wanted({ yaw: Math.PI / 2 });
  const lengths = [];
  const record = (world) => {
    const seen = arm.solve(input, world, FRAME);
    lengths.push(seen.distance);
  };
  for (let frame = 0; frame < 60; frame += 1) record(open);
  const settled = lengths.at(-1);
  // A wall comes up 0.3 m behind where the camera stood (the wall's face at 3.7).
  for (let frame = 0; frame < 90; frame += 1) record(near);
  const pulled = lengths.at(-1);
  assert.ok(pulled < settled - 0.5, `in to ${pulled.toFixed(2)} from ${settled.toFixed(2)}`);
  for (let frame = 61; frame < lengths.length; frame += 1) assert.ok(Math.abs(lengths[frame] - lengths[frame - 1]) < 0.35, `no step bigger than 0.35 m a frame (frame ${frame})`);
  // The wall goes: no change for `quiet` s, then out at no more than the let-out rate.
  const before = lengths.length;
  for (let frame = 0; frame < 240; frame += 1) record(open);
  const holdFrames = Math.floor(ARM.quiet / FRAME) - 2;
  for (let frame = before; frame < before + holdFrames; frame += 1) assert.ok(Math.abs(lengths[frame] - pulled) < 0.02, `held while the way has not been clear for ${ARM.quiet} s (frame ${frame - before})`);
  for (let frame = before + 1; frame < lengths.length; frame += 1) {
    const step = lengths[frame] - lengths[frame - 1];
    assert.ok(step >= -1e-9 && step < ARM.letOut * 4.2 * FRAME + 1e-6, `out slowly: ${step.toFixed(4)} m a frame`);
  }
  assert.ok(Math.abs(lengths.at(-1) - settled) < 0.05, 'and all the way out in the end');
});

test('a wall just at the arm\'s length does not make the camera breathe', () => {
  // The wall is moved a few millimetres in and out of the arm's reach each frame: the camera does not follow it frame by frame.
  const arm = createArm();
  const input = wanted({ yaw: Math.PI / 2 });
  const lengths = [];
  for (let frame = 0; frame < 300; frame += 1) {
    const face = 4.2 + 0.42 + 0.1 + Math.sin(frame * 1.9) * 0.15;
    const world = place(wallOf([0, face + 0.3], [60, 0.6], 0, 6));
    lengths.push(arm.solve(input, world, FRAME).distance);
  }
  const tail = lengths.slice(120);
  assert.ok(Math.max(...tail) - Math.min(...tail) < 0.25, `spread ${(Math.max(...tail) - Math.min(...tail)).toFixed(3)} m`);
});

test('the camera never stands inside a wall, a roof or a floor of the test yard, whatever it is asked for', () => {
  const states = Object.fromEntries(mechanismsOf(TESTYARD).map((mechanism) => [mechanism.id, mechanism.state]));
  const terrain = stageTerrain(TESTYARD, TESTYARD.sections.map((section) => section.id), states);
  const world = terrainWorld(terrain);
  // (A seeded sequence: the same every run.)
  let seed = 12345;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  let tested = 0;
  let pulled = 0;
  for (let sample = 0; sample < 4000; sample += 1) {
    const x = -20 + random() * 70;
    const z = -14 + random() * 28;
    const floor = floorAt(terrain, x, z, random() * 6.5);
    if (!Number.isFinite(floor)) continue;
    // Where a man can stand: not inside a block (the ledges are solid down to the ground) or a wall.
    const feet = [x, z];
    if (pushOut(terrain, feet, 0.3, floor + 0.06, floor + 1.76, 0.45)) continue;
    const input = { target: [x, floor + 1.0 + random() * 0.8, z], yaw: random() * Math.PI * 2, pitch: -0.05 + random() * 1.0, distance: 1.2 + random() * 5.5 };
    // (A look point already inside a wall, a man on the very edge of the maze: moved out of it as the arm does, and then asked about.)
    const arm = createArm();
    let seen;
    for (let frame = 0; frame < 4; frame += 1) seen = arm.solve(input, world, FRAME);
    const [cx, cy, cz] = seen.position;
    // (Never inside: 0.1 m of the ball's own is all that is asked of every sample; its near-plane margin is the arm's job where there is room, and is tested above.)
    const inside = solidAt(terrain, cx, cy, cz, 0.1);
    assert.equal(inside, null, `sample ${sample}: the camera at ${[cx, cy, cz].map((v) => v.toFixed(2))} is in ${inside?.shape} ${inside?.id} (asked ${JSON.stringify(input)})`);
    assert.ok(Number.isFinite(cx + cy + cz));
    tested += 1;
    if (seen.pulled > 0.05) pulled += 1;
  }
  assert.ok(tested > 2500, `${tested} samples`);
  assert.ok(pulled > 200, `${pulled} of them had the arm pulled in or turned: the sweep means something`);
});

test('the pitch stays a third-person pitch whatever the roof does: from the camera between -0.05 and 1.0 rad', () => {
  const states = Object.fromEntries(mechanismsOf(TESTYARD).map((mechanism) => [mechanism.id, mechanism.state]));
  const terrain = stageTerrain(TESTYARD, TESTYARD.sections.map((section) => section.id), states);
  const world = terrainWorld(terrain);
  let seed = 99;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let sample = 0; sample < 1500; sample += 1) {
    const x = 20 + random() * 12;
    const z = -2 + random() * 4;
    const floor = floorAt(terrain, x, z, 0.5);
    if (!Number.isFinite(floor) || pushOut(terrain, [x, z], 0.3, floor + 0.06, floor + 1.76, 0.45)) continue;
    const arm = createArm();
    const seen = arm.solve({ target: [x, floor + 1.4, z], yaw: random() * Math.PI * 2, pitch: 0.26, distance: 4.2 }, world, FRAME);
    assert.ok(seen.pitch >= ARM.pitchMin - 1e-9 && seen.pitch <= ARM.pitchMax + 1e-9, `pitch ${seen.pitch}`);
  }
});

test('free (the player turning the view): the arm only shortens, it does not choose another way', () => {
  const world = place(wallOf([0, 1.0], [30, 0.6], 0, 8));
  const arm = createArm();
  let seen;
  for (let frame = 0; frame < 60; frame += 1) seen = arm.solve(wanted({ yaw: Math.PI / 2 }), world, FRAME, { free: true });
  assert.ok(Math.abs(seen.pitch - 0.26) < 1e-9 && Math.abs(seen.yaw - Math.PI / 2) < 1e-9);
  assert.ok(seen.distance < 1.3);
});

test('rooms and joined worlds: the arm keeps inside the Colosseum\'s oval and the nearest of the worlds says where it ends', () => {
  const oval = roomWorld((x, z) => (x / 10.1) ** 2 + (z / 6.6) ** 2 < 1);
  const reach = oval.reach([8, 1.4, 0], armDirection(0, 0.2), 4.2, 0.4);
  assert.ok(reach > 1.0 && reach < 2.6, `${reach.toFixed(2)} m to the wall at x ${(8 + reach).toFixed(2)}`);
  const joined = joinWorlds(oval, place(wallOf([8, 0], [0.5, 30], 0, 6)), null);
  assert.ok(joined.reach([4, 1.4, 0], armDirection(0, 0.2), 4.2, 0.4) < 3.6, 'the nearer wall wins');
});

test('voxels: a wall of triangles is occupied, a thin rope is not, the sweep stops at a wall and passes a rope, and trees are posts', () => {
  const voxels = createVoxels();
  // A wall in the plane z = 4, x -3..3, y 0..3, as two triangles.
  voxels.addTriangle(-3, 0, 4, 3, 0, 4, 3, 3, 4);
  voxels.addTriangle(-3, 0, 4, 3, 3, 4, -3, 3, 4);
  // A rope: a sliver 1 cm wide along x at z = -3, y 1.
  voxels.addTriangle(-3, 1, -3, 3, 1, -3, 3, 1.01, -3);
  assert.ok(voxels.occupied > 20, `${voxels.occupied} voxels for the wall`);
  const reach = voxels.reach([0, 1.5, 0], [0, 0, 1], 8, 0.4);
  assert.ok(reach > 2.9 && reach < 3.6, `stops ${reach.toFixed(2)} m out for a wall at 4 (its ball 0.4 and the voxel 0.5)`);
  assert.equal(voxels.reach([0, 1.5, 0], [0, 0, -1], 8, 0.4), 8, 'the rope at z -3 does not close the view');
  assert.equal(voxels.reach([0, 1.5, 0], [1, 0, 0], 8, 0.4), 8, 'along the wall, 4 m away');
  assert.equal(voxels.reach([0, 5, 0], [0, 0, 1], 8, 0.4), 8, 'over the top of it');
  voxels.addPost(10, 0, 1, 0, 8);
  const toTree = voxels.reach([6, 2, 0], [1, 0, 0], 8, 0.4);
  assert.ok(toTree > 2.4 && toTree < 2.7, `a post at 10 of radius 1: ${toTree.toFixed(2)}`);
});

test('the arm runs from the man, not from the look point that lags behind him: a look point left round a corner does not hold the camera in', () => {
  // He has walked through a gap between two blocks; the look point is still back in the gap's side block.
  const world = place(wallOf([-1.5, 0.5], [1.2, 1.2], 0, 4), wallOf([1.5, 0.5], [1.2, 1.2], 0, 4));
  const fromMan = createArm();
  let seen;
  for (let frame = 0; frame < 60; frame += 1) seen = fromMan.solve({ target: [0.7, 1.45, 0.5], subject: [0, 1.9, -1.2], yaw: Math.PI / 2, pitch: 0.26, distance: 4.2 }, world, FRAME);
  const fromLookPoint = createArm().solve({ target: [0.7, 1.45, 0.5], yaw: Math.PI / 2, pitch: 0.26, distance: 4.2 }, world, FRAME);
  assert.ok(seen.distance > 3.5, `from the man, ${seen.distance.toFixed(2)} m of arm`);
  assert.ok(fromLookPoint.distance < seen.distance, 'from the look point, in the block, it is shorter');
});

test('no see-through in the page: the scenery fade is gone, and the frame never calls one', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  assert.equal(existsSync(new URL('../src/seethrough.js', import.meta.url)), false, 'the module is removed');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  for (const gone of ['seethrough', 'seeThrough.update', 'ktSightline', 'createSeeThrough']) assert.ok(!main.includes(gone), `main.js has no ${gone}`);
  assert.ok(main.includes('cameraRig.update('), 'the arm is what keeps the view clear');
  const kit = readFileSync(new URL('../src/levelmode/kittex.js', import.meta.url), 'utf8');
  assert.ok(!/ktSightline|KT_CUTAWAY|uKitOn/.test(kit), 'the castle shader has no cut-away');
  const bundle = readFileSync(new URL('../tools/bundle.js', import.meta.url), 'utf8');
  assert.ok(!bundle.includes("'seethrough'") && bundle.includes("'camerarig'"), 'the bundle carries the arm, not the fade');
});
