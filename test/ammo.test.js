import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs, P, PRESETS } from '../src/body.js';
import { think, thinkAll } from '../src/ai.js';
import { advance, createWorld, placeFighter, throwPunch } from '../src/physics.js';
import { ammoLeft, loose } from '../src/physics/ranged.js';
import { MATCHLOCK, SUPPLY, WEAPONS } from '../src/weapons.js';

const standing = () => normaliseInputs({ ...structuredClone(PRESETS.contender), sex: 'male', heightCm: 176, style: 'unskilled', accessories: [] });

/** A shooter (red) and a man (blue) `apart` m off; `between`: a comrade of the shooter's half way. */
function range(shooter, { apart = 12, between = false, seed = 1 } = {}) {
  const entries = [{ inputs: normaliseInputs(structuredClone(shooter)), corner: 'red' }, { inputs: standing(), corner: 'blue' }];
  if (between) entries.push({ inputs: standing(), corner: 'red' });
  const world = createWorld(entries, { seed, arena: { halfX: 14, halfZ: 6 } });
  placeFighter(world.fighters[0], -apart / 2, 0);
  placeFighter(world.fighters[1], apart / 2, 0);
  if (between) placeFighter(world.fighters[2], 0, 0);
  advance(world, 0.5);
  return world;
}

const apartOf = (a, b) => Math.hypot(a.x[P.pelvis * 3] - b.x[P.pelvis * 3], a.x[P.pelvis * 3 + 2] - b.x[P.pelvis * 3 + 2]);

test('a foot archer carries his bow\'s sheaves and no more: the last arrow loosed, his quiver is empty and the bow spent', () => {
  const world = range(PRESETS.longbow);
  const archer = world.fighters[0];
  const carried = WEAPONS.longbow.ammo;
  assert.ok(Number.isFinite(carried) && carried >= 24);
  assert.equal(ammoLeft(archer), carried);
  for (let shot = 0; shot < carried; shot += 1) {
    archer.punch = { aim: null };
    loose(world, archer);
  }
  archer.punch = null;
  assert.equal(archer.arrows, 0);
  assert.ok(archer.weapon.spent);
  assert.ok(world.events.some((event) => event.kind === 'quiverEmpty' && event.fighter === archer.id));
  const flying = world.arrows.length;
  archer.punch = { aim: null };
  loose(world, archer);
  assert.equal(world.arrows.length, flying, 'no arrow left to nock');
});

test('in his side\'s formation his sheaves are brought up to him, a few times, and then that is all', () => {
  const world = range(PRESETS.longbow);
  const archer = world.fighters[0];
  archer.slot = { row: 0, column: 0 };
  let loads = 0;
  for (let shot = 0; shot < WEAPONS.longbow.ammo * (SUPPLY.loads + 1); shot += 1) {
    archer.punch = { aim: null };
    loose(world, archer);
  }
  loads = world.events.filter((event) => event.kind === 'resupplied' && event.fighter === archer.id).length;
  assert.equal(loads, SUPPLY.loads);
  assert.equal(archer.arrows, 0);
  assert.ok(archer.weapon.spent);
});

test('a spent archer lets the bow fall, draws his sidearm and goes in to fight', () => {
  const world = range(PRESETS.longbow, { apart: 9 });
  const [archer, enemy] = world.fighters;
  const sidearm = archer.body.gear.sidearm;
  assert.ok(sidearm, 'the archer\'s kit has a sidearm');
  archer.arrows = 1;
  let struck = false;
  let cursor = 0;
  for (let t = 0; t < 20 && !struck; t += 0.1) {
    advance(world, 0.1, (w, dt) => thinkAll(w, dt));
    for (; cursor < world.events.length; cursor += 1) {
      const event = world.events[cursor];
      if (event.attacker === archer.id && event.punch && event.kind !== 'loosed') struck = true;
    }
  }
  assert.ok(world.events.some((event) => event.kind === 'quiverEmpty' && event.fighter === archer.id), 'he shot his last arrow');
  assert.ok(world.events.some((event) => event.kind === 'drew' && event.fighter === archer.id), 'and drew');
  assert.ok(archer.weapon?.held && !archer.weapon.spec.ranged, `a weapon in hand to fight with: ${archer.weapon?.kind}`);
  assert.ok(struck || apartOf(archer, enemy) < 2.5, 'he went to fight');
});

test('a gunner with a comrade between him and his man holds his fire; the line clear, he fires', () => {
  const world = range(PRESETS.matchlock, { apart: 12, between: true });
  const [gunner, , comrade] = world.fighters;
  const thinkGunner = (w, dt) => think(w, gunner, dt);
  for (let t = 0; t < 6; t += 0.1) {
    advance(world, 0.1, thinkGunner);
    // The two others stand where they are.
    comrade.move = 0;
  }
  assert.ok(!world.events.some((event) => event.kind === 'shot' && event.attacker === gunner.id), 'no shot past his own man');
  assert.ok(gunner.weapon.loaded);
  placeFighter(comrade, -4, 5);
  for (let t = 0; t < 6 && !world.events.some((event) => event.kind === 'shot' && event.attacker === gunner.id); t += 0.1) advance(world, 0.1, thinkGunner);
  assert.ok(world.events.some((event) => (event.kind === 'shot' || event.kind === 'misfire') && (event.attacker ?? event.fighter) === gunner.id), 'the line clear, he fires');
});

test('a gun\'s charges are counted: the last one fired, his powder and shot are spent', () => {
  const world = range(PRESETS.matchlock, { apart: 12 });
  const gunner = world.fighters[0];
  assert.equal(ammoLeft(gunner), MATCHLOCK.ammo);
  gunner.rounds = 1;
  assert.ok(throwPunch(world, gunner, 'fireLong', 'body'));
  advance(world, 2);
  assert.equal(gunner.rounds, 0);
  assert.ok(gunner.weapon.spent);
  assert.ok(world.events.some((event) => event.kind === 'ammoEmpty' && event.fighter === gunner.id));
});
