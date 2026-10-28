// A behaviour fingerprint: fixed fights at fixed seeds, every body's
// particles hashed as the fight runs, and the time the simulation took.
// A refactor that should change nothing must leave every hash as it was;
// a deliberate change to the physics shows which fights it moved.
//
// Usage: node tools/fingerprint.js            (print)
//        node tools/fingerprint.js save FILE  (write the hashes to FILE)
//        node tools/fingerprint.js check FILE (compare against FILE; exit 1 if any differ)
//        ... --ear                            (with an ear on the first fighter's head each step, hearing 20 m round: the
//                                              sound log recording, which must leave every hash as it was without it)

import { readFileSync, writeFileSync } from 'node:fs';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, seededRandom } from '../src/physics.js';
import { SCENARIOS } from '../src/scenarios.js';

const duel = (red, blue, extra = {}) => () => createWorld([{ inputs: structuredClone(PRESETS[red]), corner: 'red' }, { inputs: structuredClone(PRESETS[blue]), corner: 'blue' }], { seed: 7, ...extra });
const level = (key) => () => {
  const scenario = SCENARIOS[key];
  const cast = scenario.cast(seededRandom(7));
  return createWorld([...cast.red.map((inputs) => ({ inputs, corner: 'red' })), ...cast.blue.map((inputs) => ({ inputs, corner: 'blue' }))], { seed: 7, arena: scenario.arena, formation: scenario.formation });
};

// What is fingerprinted: each kind of fight the game has, for `seconds`.
const FIGHTS = {
  'boxing duel': [duel('heavy', 'light'), 20],
  'muay thai v sumo': [duel('muayThai', 'sumo'), 20],
  'knight v samurai': [duel('knight', 'samurai'), 20],
  'iron pagoda v kanabo': [duel('ironPagoda', 'kanabo'), 20],
  'archers': [duel('steppeBow', 'bow', { distance: 10 }), 15],
  'rifle v shotgun': [duel('rifle', 'shotgun', { distance: 8 }), 10],
  'police v katana': [duel('police', 'katana', { distance: 6 }), 15],
  'rhodes 1522': [level('rhodes'), 12],
  'sekigahara': [level('sekigahara'), 6],
  // The big battles: the legion's march and first melee, and the proxies and crossbows with it.
  'legion': [level('legion'), 30],
  // The ambush at Cajamarca: hidden men, the signal, horses and guns among a crowd.
  'cajamarca': [level('cajamarca'), 10],
};

/** A 32-bit FNV-1a hash of a world's particles (rounded to 0.1 mm) and its event count. */
function hashWorld(world, hash) {
  let value = hash;
  const mix = (number) => {
    value ^= number & 0xffffffff;
    value = Math.imul(value, 16777619) >>> 0;
  };
  for (const fighter of world.fighters) for (const coordinate of fighter.x) mix(Math.round(coordinate * 10000));
  mix(world.events.length);
  return value;
}

// The listener the audio engine would set: on the first fighter's head (src/audio/log.js world.ear).
function listen(world) {
  const head = world.fighters[0].x;
  world.ear = { x: head[P.head * 3], y: head[P.head * 3 + 1], z: head[P.head * 3 + 2], radius: 20 };
}

function run(ear) {
  const results = {};
  for (const [name, [make, seconds]] of Object.entries(FIGHTS)) {
    const world = make();
    let hash = 2166136261;
    const started = performance.now();
    for (let second = 0; second < seconds; second += 1) {
      advance(world, 1, (current, dt) => {
        if (ear) listen(current);
        thinkAll(current, dt);
      });
      hash = hashWorld(world, hash);
    }
    results[name] = { hash: hash.toString(16).padStart(8, '0'), ms: Math.round(performance.now() - started), events: world.events.length, sounds: world.soundsCount ?? 0 };
  }
  return results;
}

const ear = process.argv.includes('--ear');
const [mode, file] = process.argv.slice(2).filter((arg) => arg !== '--ear');
const results = run(ear);
for (const [name, result] of Object.entries(results)) console.log(`${name.padEnd(22)} ${result.hash}  ${String(result.ms).padStart(6)} ms  ${result.events} events${ear ? `  ${result.sounds} sounds` : ''}`);
console.log(`total ${Object.values(results).reduce((sum, result) => sum + result.ms, 0)} ms`);
if (mode === 'save') writeFileSync(file, JSON.stringify(results, null, 2));
if (mode === 'check') {
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  const changed = Object.keys(results).filter((name) => saved[name]?.hash !== results[name].hash);
  console.log(changed.length ? `changed: ${changed.join(', ')}` : 'identical to the saved fingerprint');
  if (changed.length) process.exitCode = 1;
}
