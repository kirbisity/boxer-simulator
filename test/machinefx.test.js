import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs, PRESETS } from '../src/body.js';
import { createWorld } from '../src/physics.js';
import { MACHINE_FX, machineFxBusy, machineFxClear, machineFxCreate, machineFxFor, machineFxHear, machineFxStep } from '../src/machinefx.js';

/** A humanoid robot, a combat bot and a man. */
function cast() {
  const world = createWorld([
    { inputs: structuredClone(PRESETS.humanoid), corner: 'red' },
    { inputs: structuredClone(PRESETS.combatBot), corner: 'red' },
    { inputs: normaliseInputs(structuredClone(PRESETS.contender)), corner: 'blue' },
  ], { seed: 1 });
  // An ear on the field, so the shorts' sounds are logged.
  world.ear = { x: 0, z: 0, radius: 100 };
  return world;
}

/** The sounds logged so far, of a type. */
const heard = (world, type) => (world.sounds ?? []).slice(0, world.soundsCount ?? 0).filter((sound) => sound.type === type);

/** Counts what the emitters ask the view for, `seconds` on from `start`, in frames of `dt`. */
function run(store, start, seconds, dt = 1 / 60) {
  const asked = { flash: 0, sparks: 0, arc: 0 };
  const emit = { flash: () => { asked.flash += 1; }, sparks: (emitter, count) => { asked.sparks += count; }, arc: () => { asked.arc += 1; } };
  for (let t = start; t <= start + seconds; t += dt) machineFxStep(store, t, emit, () => 0.5);
  return asked;
}

test('a robot that dies shorts out: a flash, sparks and arcs for a moment, then nothing, and the short is heard (robotSpark); a man that dies does not', () => {
  const world = cast();
  const [humanoid, bot, man] = world.fighters;
  assert.equal(machineFxFor({ kind: 'killed' }, humanoid), 'death');
  assert.equal(machineFxFor({ kind: 'knockout' }, bot), 'death');
  assert.equal(machineFxFor({ kind: 'killed' }, man), null, 'a man bleeds; he does not spark');
  assert.equal(machineFxFor({ kind: 'landed' }, bot), null, 'struck, not down');
  const store = machineFxCreate();
  assert.equal(machineFxHear(store, { kind: 'killed', fighter: man.id }, world, 0), null);
  assert.equal(machineFxBusy(store), false);
  assert.ok(machineFxHear(store, { kind: 'killed', fighter: humanoid.id }, world, 0));
  assert.equal(machineFxHear(store, { kind: 'killed', fighter: humanoid.id }, world, 0.1), null, 'finished off where it lay, it does not short out again');
  const sounds = heard(world, MACHINE_FX.sound);
  assert.equal(sounds.length, 1, 'one short heard, the robot\'s');
  assert.deepEqual([sounds[0].kind, sounds[0].fighter, sounds[0].intensity], ['death', humanoid.id, MACHINE_FX.intensity.death]);
  assert.ok(Number.isFinite(sounds[0].x) && Number.isFinite(sounds[0].y));
  const asked = run(store, 0, MACHINE_FX.death.seconds);
  assert.equal(asked.flash, 1, 'one hard flash');
  assert.ok(asked.sparks >= MACHINE_FX.death.burst, 'a burst of sparks');
  assert.ok(asked.arc >= 3, `arcs at its joints (${asked.arc})`);
  const after = run(store, MACHINE_FX.death.seconds + 0.05, 1);
  assert.deepEqual(after, { flash: 0, sparks: 0, arc: 0 }, 'over in under a second');
  assert.equal(machineFxBusy(store), false);
});

test('a robot\'s arm cut off sprays sparks from the stump for a while, weaker as it goes; a man\'s does not (he bleeds)', () => {
  const world = cast();
  const [, bot, man] = world.fighters;
  const store = machineFxCreate();
  assert.equal(machineFxHear(store, { kind: 'severed', fighter: man.id, joint: 'elbow', side: 'r' }, world, 0), null);
  const stump = machineFxHear(store, { kind: 'severed', fighter: bot.id, joint: 'shoulder', side: 'l' }, world, 0);
  assert.equal(stump.kind, 'stump');
  assert.deepEqual([stump.joint, stump.side], ['shoulder', 'l'], 'it knows where the stump is');
  assert.deepEqual(heard(world, MACHINE_FX.sound).map((sound) => sound.kind), ['stump'], 'the bot\'s cut heard, the man\'s not');
  const early = run(store, 0, 0.6);
  const late = run(store, 0.6 + 1 / 60, MACHINE_FX.stump.seconds - 0.6 - 1 / 30);
  assert.ok(early.sparks > MACHINE_FX.stump.burst, 'a spray as it parts and bursts after');
  assert.ok(late.sparks > 0, 'still sputtering');
  assert.ok(late.sparks / (MACHINE_FX.stump.seconds - 0.6) < early.sparks / 0.6, 'weaker as it goes');
  assert.deepEqual(run(store, MACHINE_FX.stump.seconds + 0.1, 0.5), { flash: 0, sparks: 0, arc: 0 }, 'then it is spent');
});

test('the pool is fixed: a battle of falling bots never grows it; a new bout clears it', () => {
  const store = machineFxCreate();
  const world = { fighters: Array.from({ length: MACHINE_FX.maxEmitters + 6 }, (_, id) => ({ id, body: { gear: { machine: true } } })) };
  for (const fighter of world.fighters) machineFxHear(store, { kind: 'killed', fighter: fighter.id }, world, fighter.id * 0.01);
  assert.equal(store.pool.length, MACHINE_FX.maxEmitters);
  assert.ok(store.pool.every((emitter) => emitter.live));
  machineFxClear(store);
  assert.equal(machineFxBusy(store), false);
  assert.ok(machineFxHear(store, { kind: 'killed', fighter: 0 }, world, 1), 'a new bout: the same machine may die again');
});
