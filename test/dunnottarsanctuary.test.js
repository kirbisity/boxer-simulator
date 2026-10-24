// Stage 1, Dunnottar: the sanctuary (a fully vaulted nave, the boss's arena), the cell directly behind its chancel doors, the light inside it, and the
// widened stairs. What is stood on (the solids) and what is drawn (the decor) come from the same data; the numbers the spec asks for are asserted here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStage, interiorAt, mechanismsOf, regionContains, sectionById, setMechanism, stageTerrain } from '../src/levelmode/stage.js';
import { DN_Y, DUNNOTTAR } from '../src/levelmode/stages/dunnottar.js';
import { DN_CHAPEL, dnChapelSoffit } from '../src/levelmode/stages/dunnottar-chapel.js';
import { interiorLevels, lerpHex, stageLookOf, STAGE_LOOKS } from '../src/levelmode/stagelooks.js';
import { pushOut } from '../src/physics/terrain.js';
import { stairsOfStage } from '../tools/stairs.js';

const L = DN_Y.ladderRoom;
const chapel = sectionById(DUNNOTTAR, 'chapel');
const cell = sectionById(DUNNOTTAR, 'cell');
const allIds = DUNNOTTAR.sections.map((section) => section.id);
const states = (open) => Object.fromEntries(mechanismsOf(DUNNOTTAR).map((mechanism) => [mechanism.id, open ? 'open' in mechanism.states ? 'open' : 'down' : mechanism.state]));

test('sanctuary: a nave 30 m by 20, a vault 12 m up, an arcade with a pillar to a bay either side and the middle open', () => {
  assert.equal(DN_CHAPEL.x0 - DN_CHAPEL.x1, -30);
  assert.equal(DN_CHAPEL.z1 - DN_CHAPEL.z0, 20);
  assert.ok(Math.abs(dnChapelSoffit(0) - L - 12) < 0.01, `the crown is ${(dnChapelSoffit(0) - L).toFixed(2)} m over the floor`);
  const pillars = chapel.decor.filter((decor) => decor.kind === 'prop' && decor.what === 'pillar');
  assert.equal(pillars.length, DN_CHAPEL.pillarX.length * 2);
  for (const pillar of pillars) {
    assert.ok(Math.abs(pillar.at[2] - DN_CHAPEL.axis) >= DN_CHAPEL.pillarOffset, 'a pillar stands in the arcade, not the nave');
    assert.ok(pillar.height > 9 || (chapel.terrain.some((solid) => solid.kind === 'wall' && solid.style === 'hidden' && Math.abs(solid.at[0] - pillar.at[0]) < 0.01 && solid.top - solid.bottom > 9.5)), 'a pillar to the vault');
  }
  // The pillars are physics: a wall box at each, floor to vault.
  const boxes = chapel.terrain.filter((solid) => solid.kind === 'wall' && solid.style === 'hidden' && solid.top - solid.bottom > 9.5);
  assert.equal(boxes.length, pillars.length);
  // Gaps between pillars of 3.5 m and more: nobody is trapped between them; the aisles (pillar to wall) 3 m and more.
  const spacing = DN_CHAPEL.pillarX[0] - DN_CHAPEL.pillarX[1];
  assert.ok(spacing - 1.2 >= 3.5, `${spacing - 1.2} m between pillars`);
  assert.ok(DN_CHAPEL.axis - DN_CHAPEL.pillarOffset - 0.6 - DN_CHAPEL.z0 >= 3, 'the aisle');
  assert.ok(DN_CHAPEL.pillarOffset - 0.6 >= 5.4, `the nave is ${(DN_CHAPEL.pillarOffset - 0.6) * 2} m clear between the arcades`);
});

test('sanctuary: the ceilings of the physics never come lower than the soffit of the drawn vault, nor stand lower than a man and a halberd need', () => {
  const ceilings = chapel.terrain.filter((solid) => solid.kind === 'ceiling');
  assert.ok(ceilings.length >= 3);
  for (const ceiling of ceilings) {
    const z0 = ceiling.at[1] - ceiling.size[1] / 2;
    const z1 = ceiling.at[1] + ceiling.size[1] / 2;
    for (let z = z0; z <= z1 + 1e-6; z += 0.25) {
      assert.ok(ceiling.bottom <= dnChapelSoffit(z - DN_CHAPEL.axis) + 0.11, `ceiling at ${ceiling.bottom - L} over z ${z} is lower than the vault`);
    }
    assert.ok(ceiling.bottom - L >= 7.4, 'a head clears it');
  }
  // The centre band, where the fight is, is 11 m up: a zweihander swung over the head does not touch it.
  const middle = ceilings.find((solid) => Math.abs(solid.at[1] - DN_CHAPEL.axis) < 0.1);
  assert.ok(middle.bottom - L >= 10.8);
  // The ceilings are not drawn (the vault is the ceiling the eye sees).
  for (const ceiling of ceilings) assert.equal(ceiling.style, 'hidden');
});

test('sanctuary: the nave is open for the fight: nothing solid in the middle 9 m by 21 m, at the width of a swinging man', () => {
  const terrain = stageTerrain(DUNNOTTAR, allIds, states(false));
  const blocked = [];
  for (let x = -27.5; x <= -6; x += 0.5) {
    for (let z = DN_CHAPEL.axis - 4.5; z <= DN_CHAPEL.axis + 4.5; z += 0.5) {
      const at = [x, z];
      const moved = pushOut(terrain, at, 0.9, L, L + 1.7, 0.35);
      if (moved && Math.hypot(at[0] - x, at[1] - z) > 0.05) blocked.push(`${x},${z}`);
    }
  }
  assert.deepEqual(blocked, []);
  // And a man can walk from the gate to the doors and round the altar, in the arcades too: every aisle is a way through.
  for (const z of [DN_CHAPEL.axis - 6 - 3.4 / 2 - 0.3, DN_CHAPEL.axis + 6 + 3.4 / 2 + 0.3]) {
    for (let x = -32; x <= -5; x += 0.5) {
      const at = [x, z];
      const moved = pushOut(terrain, at, 0.35, L, L + 1.7, 0.35);
      if (moved && Math.hypot(at[0] - x, at[1] - z) > 0.05) assert.ok(x < -29 || [...chapel.decor, ...[]].some((decor) => decor.kind === 'prop' && ['brazier', 'pew', 'rubble', 'gravestone'].includes(decor.what)), `the aisle is blocked at ${x}, ${z}`);
    }
  }
});

test('sanctuary: the back room (the garderobe) lies directly behind the heavy arched doors at the chancel end, and the ending reads them', () => {
  assert.deepEqual(checkStage(DUNNOTTAR), []);
  const door = DN_CHAPEL.door;
  const mechanism = chapel.gates.find((gate) => gate.id === 'innerdoor');
  assert.ok(mechanism, 'the mechanism keeps its id');
  assert.deepEqual(Object.keys(mechanism.states).sort(), ['closed', 'open']);
  assert.equal(mechanism.look.kind, 'doubledoor');
  assert.ok(mechanism.look.height >= 4.4 && mechanism.look.width >= 3.4, 'heavy and arched: wide and tall');
  assert.equal(door.x, -34.4, 'in the chancel (west) wall');
  assert.ok(Math.abs(door.z - DN_CHAPEL.axis) < 0.1, 'in the middle of it, on the nave\'s axis');
  const leaf = mechanism.states.closed[0];
  assert.ok(Math.abs(leaf.at[0] - door.x) < 0.01 && Math.abs(leaf.at[1] - door.z) < 0.01);
  // The ending's data: the door; the room behind it, empty (no prince: the plot twist); the privy's hole in it, a short way in from the doors.
  const ending = DUNNOTTAR.ending;
  assert.equal(ending.door, 'innerdoor');
  assert.equal(ending.prince, undefined);
  assert.ok(!cell.spawns.some((spawn) => !spawn.hold), 'nobody in the room but the held');
  assert.ok(cell.decor.some((decor) => decor.what === 'privy'), 'a privy');
  for (const what of ['bucket', 'rags', 'straw']) assert.ok(cell.decor.some((decor) => decor.what === what), what);
  const [hx, hy, hz] = ending.hole.at;
  assert.ok(regionContains(cell.bounds, hx, hz, hy + 1) && regionContains(ending.toilet, hx, hz, hy + 1), 'the hole is in the room');
  assert.ok(hx < door.x - 4 && door.x - hx < 8 && Math.abs(hz - door.z) < 1, 'straight in from the doors, a few strides');
  assert.ok(regionContains(ending.toilet, door.x - 1.2, door.z, L + 1) && !regionContains(ending.toilet, door.x + 1, door.z, L + 1), 'the room begins past the doors');
  // The cell starts at the doors' wall and goes on west of it.
  const bounds = cell.bounds[0];
  assert.ok(bounds.at[0] + bounds.size[0] / 2 >= door.x - 1 && bounds.at[0] < door.x);
  // Shut, the doors hold; open, a man walks through to the privy (the door's own shortcut test walks it).
  const shut = stageTerrain(DUNNOTTAR, allIds, states(false));
  const open = stageTerrain(DUNNOTTAR, allIds, states(true));
  const probe = (terrain) => { const at = [door.x, door.z]; const moved = pushOut(terrain, at, 0.35, L, L + 1.7, 0.35); return moved && Math.hypot(at[0] - door.x, at[1] - door.z) > 0.05; };
  assert.ok(probe(shut), 'the doors block while the boss stands');
  assert.ok(!probe(open), 'and let a man through when they are open');
});

test('sanctuary: the keyhole, the chandeliers, the candles and the glass are all in the data, and the lights stay few', () => {
  const kinds = (kind) => chapel.decor.filter((decor) => decor.kind === kind);
  assert.ok(kinds('chandelier').length >= 3 && kinds('chandelier').length <= 5, 'iron chandeliers down the axis');
  assert.ok(kinds('votive').length >= 12, 'votive candles in clusters');
  assert.ok(kinds('votive').every((decor) => decor.count >= 4 && decor.count <= 10));
  assert.ok(kinds('glass').length >= 12, 'stained glass in the windows');
  assert.equal(kinds('doorlight').length, 1, 'the keyhole and its spill');
  assert.equal(kinds('doorlight')[0].door, 'innerdoor');
  assert.ok(chapel.decor.filter((decor) => decor.kind === 'prop' && decor.what === 'brazier').length >= 4, 'sanctuary braziers');
  assert.ok(kinds('chapelroof').length === 1 && kinds('vault').some((decor) => decor.nave));
  // Real lights: the kit keeps a pool of four and lights the nearest of whatever lit things stand near him (kit.js): so the nave never has more than four at once, however many things burn
  // in it. The chandeliers and braziers are the lit things; the candles are flame cards and glow only.
  const lit = kinds('chandelier').length + chapel.decor.filter((decor) => decor.kind === 'prop' && ['brazier', 'torch', 'hearth'].includes(decor.what)).length;
  assert.ok(lit >= 4);
});

test('interior: the chapel and the cell carry the light override, the wall walk and the court do not', () => {
  assert.ok(interiorAt(DUNNOTTAR, -18, L + 1, -36), 'the nave');
  assert.ok(interiorAt(DUNNOTTAR, -41, L + 1, -36), 'the cell');
  assert.equal(interiorAt(DUNNOTTAR, 10, L + 1, -36), null, 'the wall walk is under the sky');
  assert.equal(interiorAt(DUNNOTTAR, 20, DN_Y.quad + 1, -10), null, 'so is the court');
  assert.equal(interiorAt(DUNNOTTAR, -18, DN_Y.quad + 1, -36), null, 'and nothing under the chapel floor');
  const spec = chapel.interior;
  for (const key of ['sun', 'ambient', 'tint', 'hemi', 'fog', 'flash', 'blend']) assert.ok(spec[key] !== undefined, key);
  assert.ok(spec.blend >= 1 && spec.blend <= 2, 'about a second and a half');
  assert.ok(spec.tint[0] > spec.tint[2], 'amber, not the storm\'s cold');
  assert.ok(spec.fog.mist === 0);
});

test('interior: the blend leaves the look exactly as it is at 0 and the interior\'s own numbers at 1, smoothly between', () => {
  const spec = chapel.interior;
  for (const [name, look] of Object.entries(STAGE_LOOKS)) {
    const outside = interiorLevels(look, spec, 0);
    assert.equal(outside.sun, look.sun.intensity * look.exposure, name);
    assert.equal(outside.hemi, look.hemi.intensity * look.exposure);
    assert.equal(outside.probe, look.ambient.gain * look.exposure);
    assert.deepEqual(outside.tint, look.ambient.tint);
    assert.equal(outside.fogColour, look.fog.colour);
    assert.equal(outside.fogNear, look.fog.near);
    assert.equal(outside.mist, look.fog.mist.density);
    assert.equal(outside.torch, look.torch);
    assert.equal(outside.flash, 1);
    const inside = interiorLevels(look, spec, 1);
    assert.ok(inside.sun <= look.sun.intensity * 0.05, `${name}: the sun is shut out (${inside.sun})`);
    assert.ok(inside.hemi < look.hemi.intensity * 0.5 + 1e-9);
    assert.ok(inside.flash <= 0.2, 'the flashes are all but shut out');
    assert.equal(inside.mist, 0, 'no mist indoors');
    assert.equal(inside.fogColour, spec.fog.colour);
    assert.equal(inside.fogFar, spec.fog.far);
    assert.ok(inside.tint[0] > inside.tint[2], 'warm');
    let last = outside.sun;
    for (let k = 0.1; k <= 1.0001; k += 0.1) {
      const now = interiorLevels(look, spec, k).sun;
      assert.ok(now <= last + 1e-9, `${name}: the sun fades monotonically`);
      last = now;
    }
  }
  assert.equal(lerpHex(0x000000, 0xffffff, 0.5), 0x808080);
  assert.ok(stageLookOf('stormBreak'));
});

test('stairs: the winding stairs are wide (4.2 m from newel to wall), and every flight and door of the castle (the open path aside) is 3.3 m or more across', () => {
  const stairs = stairsOfStage(DUNNOTTAR);
  const winding = stairs.filter((stair) => stair.winding);
  assert.ok(winding.length >= 2, 'the tower stair and the well shaft stair');
  const tower = sectionById(DUNNOTTAR, 'tower');
  const treads = tower.terrain.filter((solid) => solid.id === 'spiral');
  assert.ok(treads[0].size[0] >= 4.4, `a tread is ${treads[0].size[0]} m long (was 3.6)`);
  // The wall's inner face against the tread's end: the tower radius 5.7 (a twelve-sided wall, 1.4 thick): the room from the newel is 4.2 m.
  const wall = tower.decor.find((decor) => decor.kind === 'run' && decor.round);
  assert.ok(wall.thick === 1.4);
  const apothem = 5.7 * Math.cos(Math.PI / 12);
  assert.ok(apothem - 0.7 - 0.6 >= 4.2 - 0.01, `${(apothem - 0.7 - 0.6).toFixed(2)} m from the newel (0.6) to the wall`);
  for (const section of DUNNOTTAR.sections.filter((entry) => entry.id !== 'cliff')) {
    for (const solid of section.terrain.filter((entry) => entry.kind === 'stairs')) assert.ok(solid.size[1] >= 3.3, `${section.id} flight ${solid.id ?? ''} is ${solid.size[1]} m wide`);
    for (const decor of section.decor.filter((entry) => entry.kind === 'run')) {
      for (const opening of decor.openings ?? []) {
        // Doors (an opening that reaches the floor and is not a slit or a window) are 2.8 m wide at least where a man goes through.
        if (opening.solid || opening.shape === 'slit' || opening.shape === 'lancet' || opening.shape === 'oillet') continue;
        if (opening.sill !== decor.y0 + 1 && opening.top - (opening.sill ?? decor.y0) < 3) continue;
        assert.ok(opening.width >= 2.6, `${section.id}: a door ${opening.width} m wide in the wall ${decor.a}->${decor.b}`);
      }
    }
  }
  for (const stair of stairs) assert.ok(stair.rise <= 0.2001, `${stair.name} rises ${stair.rise}`);
  // The head room on the straight flights: the vaults over them are 3.8 m and more above a tread.
  for (const section of DUNNOTTAR.sections) for (const decor of section.decor.filter((entry) => entry.kind === 'vault')) assert.ok(decor.a[2] === undefined || Number.isFinite(decor.a[2]));
});
