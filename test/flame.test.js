// The flamethrower proof of concept (physics/flame.js): the jet's reach, the fuel it carries, what it does to a man, the fear of it,
// the AI's use of it, what is heard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { thinkAll } from '../src/ai.js';
import { flameSources } from '../src/audio/flamesound.js';
import { P, PRESETS } from '../src/body.js';
import { createWorld, placeFighter, step } from '../src/physics.js';
import { FLAME, aimJet, flamePulse, stepFlame, withTanks } from '../src/physics/flame.js';
import { WORLD } from '../src/physics/config.js';
import { STYLES } from '../src/moves.js';
import { WEAPONS } from '../src/weapons.js';
import { flameDemo } from '../tools/flame.js';

/** Where a jet aimed `angle` up comes down to the height `rise` (m along the floor), flown as the lumps fly. */
function landing(angle, rise = 0) {
  const dt = 1 / 240;
  const slow = Math.exp(-FLAME.drag * dt);
  const at = [0, 0];
  const v = [Math.cos(angle) * FLAME.speed, Math.sin(angle) * FLAME.speed];
  for (let t = 0; t < 6; t += dt) {
    v[1] -= WORLD.gravity * dt;
    v[0] *= slow;
    v[1] *= slow;
    at[0] += v[0] * dt;
    at[1] += v[1] * dt;
    if (v[1] < 0 && at[1] <= rise) return at[0];
  }
  return at[0];
}

const run = (world, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 60) {
    thinkAll(world, 1 / 60);
    step(world, 1 / 60);
  }
};

/** Two men 6 m apart: a target (the preset given) and the flamethrower facing him, his valve held open at him for `seconds`. */
function douse(preset, seconds = 0.6, setup = () => {}) {
  const world = createWorld([
    { inputs: withTanks({ ...structuredClone(PRESETS.rifle), style: 'flamethrower' }), corner: 'red' },
    { inputs: structuredClone(PRESETS[preset]), corner: 'blue' },
  ], { seed: 3, arena: { halfX: 20, halfZ: 20 } });
  const [shooter, man] = world.fighters;
  placeFighter(shooter, -3, 0);
  placeFighter(man, 3, 0);
  setup(world, man);
  shooter.aimAt = man.id;
  for (let t = 0; t < 4; t += 1 / 60) {
    if (t < seconds) flamePulse(world, shooter, shooter.weapon);
    step(world, 1 / 60);
  }
  return { world, man };
}

test('the jet is aimed up for the range and carries 20-40 m at most, as the M2 did', () => {
  for (const distance of [3, 8, 15, 22]) assert.ok(Math.abs(landing(aimJet(distance, 0)) - distance) < 0.3, `${distance} m`);
  const most = landing(aimJet(200, 0));
  assert.ok(most > 20 && most < 40, `${most.toFixed(1)} m at most`);
});

test('the flamethrower is a heavy automatic weapon with about 7 s of fire, hidden from the pickers, used at 3-20 m', () => {
  const spec = WEAPONS.flamethrower;
  assert.equal(spec.shot.flame, true);
  assert.ok(Math.abs(spec.shot.rounds / spec.shot.automatic.rate - 7) < 0.5);
  assert.equal(STYLES.flamethrower.hidden, true);
  assert.equal(STYLES.flamethrower.ranged.reach, 20);
  assert.equal(STYLES.flamethrower.ranged.flee, 3);
  // The tanks are his kit's weight: ~30 kg more of him to move.
  const plain = createWorld([{ inputs: structuredClone(PRESETS.rifle) }]).fighters[0];
  const laden = createWorld([{ inputs: withTanks(structuredClone(PRESETS.rifle)) }]).fighters[0];
  const mass = (fighter) => fighter.body.masses.reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(mass(laden) - mass(plain) - FLAME.tanksKg) < 5, `${(mass(laden) - mass(plain)).toFixed(1)} kg`);
});

test('the stream sets a man alight: burns to his trunk, fear, and he drops and rolls or runs', () => {
  const { world, man } = douse('swordShield');
  assert.ok((man.trauma?.trunk ?? 0) > 0.05, `trunk ${man.trauma?.trunk}`);
  assert.ok(man.flameFright > 0.3, `fright ${man.flameFright}`);
  assert.ok(world.events.some((event) => event.fighter === man.id && /on fire/.test(event.effects?.join() ?? '')), 'reacted');
  assert.ok(world.flame.patches.length > 0, 'fuel burning on the floor');
});

test('plate keeps most of the heat off; water puts it out sooner', () => {
  const bare = douse('swordShield').man;
  const plate = douse('knight').man;
  assert.ok(plate.trauma.trunk < bare.trauma.trunk * 0.6, `${plate.trauma.trunk} against ${bare.trauma.trunk}`);
  const wet = douse('swordShield', 0.6, (world, man) => { man.wading = { act: 1 }; }).man;
  assert.ok((wet.burning?.fuel ?? 0) < (bare.burning?.fuel ?? 0) || !wet.burning, 'water smothers it');
  assert.ok(wet.trauma.trunk < bare.trauma.trunk, `${wet.trauma.trunk} against ${bare.trauma.trunk}`);
});

test('a man burning frightens the men near him, of either side', () => {
  const world = createWorld([{ inputs: structuredClone(PRESETS.swordShield) }, { inputs: structuredClone(PRESETS.samurai) }, { inputs: structuredClone(PRESETS.samurai) }], { seed: 1, arena: { halfX: 20, halfZ: 20 } });
  const [burning, near, far] = world.fighters;
  placeFighter(burning, 0, 0);
  placeFighter(near, 2, 0);
  placeFighter(far, 15, 0);
  world.flame = { blobs: [], free: [], patches: [], valves: new Map() };
  burning.burning = { fuel: 0.3, clothes: 4, heat: 1, part: 'trunk', reacted: true, rolling: false, rollClock: 0, cryClock: 0, side: 1, since: 0 };
  stepFlame(world, 1 / 60);
  assert.ok(near.flameFright > 0.2, `near ${near.flameFright}`);
  assert.ok(!far.flameFright, `far ${far.flameFright}`);
});

test('the demo: the flamethrower burns in bursts and sets the swords alight; the fire is heard where it is', () => {
  const world = flameDemo(1);
  let opened = 0;
  let wasOpen = false;
  let heard = null;
  for (let t = 0; t < 12; t += 1 / 60) {
    thinkAll(world, 1 / 60);
    step(world, 1 / 60);
    const open = [...(world.flame?.valves.values() ?? [])].some((valve) => valve.open);
    if (open && !wasOpen) opened += 1;
    wasOpen = open;
    if (open && !heard) heard = flameSources(world, { x: 0, y: 1.6, z: 0 });
  }
  assert.ok(opened >= 2, `${opened} bursts`);
  assert.ok(world.fighters.slice(1).filter((man) => (man.trauma?.trunk ?? 0) > 0.05).length >= 2, 'two or more burned');
  assert.equal(heard[0].kind, 'roar');
  assert.ok(world.fighters[0].rounds < WEAPONS.flamethrower.shot.rounds);
});

test('out of the jet\'s reach he walks in and does not fire', () => {
  const world = createWorld([
    { inputs: withTanks({ ...structuredClone(PRESETS.rifle), style: 'flamethrower' }), corner: 'red' },
    { inputs: { ...structuredClone(PRESETS.samurai), style: 'passive' }, corner: 'blue' },
  ], { seed: 2, arena: { halfX: 40, halfZ: 20 } });
  const [shooter, man] = world.fighters;
  placeFighter(shooter, -14, 0);
  placeFighter(man, 14, 0);
  const startedAt = shooter.x[P.pelvis * 3];
  run(world, 2);
  assert.ok(!world.flame, 'no fire at 28 m');
  assert.ok(shooter.x[P.pelvis * 3] > startedAt + 1, 'walked in');
});
