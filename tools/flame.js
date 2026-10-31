// The flamethrower proof of concept, in Node (physics/flame.js): one man with the flamethrower (the special forces preset, the tanks
// on his back) against four with swords, stepped as the page steps; prints what happened and what the fire cost.
//
//   node tools/flame.js [seed] [seconds]

import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { createWorld, step } from '../src/physics.js';
import { stepFlame, withTanks } from '../src/physics/flame.js';

/** The demo fight: the flamethrower against a knight in plate, a samurai, a sword-and-shield man and a ghazi, on open ground. */
export function flameDemo(seed = 1) {
  const swords = ['knight', 'samurai', 'swordShield', 'gaziAlp'];
  return createWorld([
    { inputs: withTanks({ ...structuredClone(PRESETS.rifle), style: 'flamethrower' }), corner: 'red' },
    ...swords.map((key) => ({ inputs: structuredClone(PRESETS[key]), corner: 'blue' })),
  ], { seed, arena: { halfX: 30, halfZ: 30 } });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seed = Number(process.argv[2] ?? 1);
  const seconds = Number(process.argv[3] ?? 30);
  const world = flameDemo(seed);
  const dt = 1 / 60;
  let cursor = 0;
  let fireMs = 0;
  let allMs = 0;
  let most = 0;
  for (let t = 0; t < seconds; t += dt) {
    const started = performance.now();
    thinkAll(world, dt);
    // (The fire stepped apart from the rest, to time it.)
    const flame = world.flame;
    world.flame = undefined;
    step(world, dt);
    // (A trigger pulled in the step made a fresh fire state: its valves taken into the one kept aside.)
    const pulled = world.flame;
    world.flame = flame ?? pulled;
    if (flame && pulled) {
      for (const [id, valve] of pulled.valves) {
        const kept = flame.valves.get(id);
        if (!kept) flame.valves.set(id, valve);
        else {
          if (!(kept.until > world.time - dt)) kept.burst += 1;
          kept.until = valve.until;
        }
      }
    }
    const fired = performance.now();
    if (world.flame) stepFlame(world, dt);
    fireMs += performance.now() - fired;
    allMs += performance.now() - started;
    most = Math.max(most, world.flame?.blobs.length ?? 0);
    for (; cursor < world.events.length; cursor += 1) {
      const event = world.events[cursor];
      if (['panic', 'fell', 'knockout', 'killed', 'ammoEmpty', 'dropped'].includes(event.kind) || event.effects?.some((effect) => /fire|burn|injur/.test(effect))) console.log(event.time.toFixed(2), event.kind, event.fighter ?? event.defender ?? '', event.effects?.join('; '));
    }
  }
  const [shooter, ...men] = world.fighters;
  console.log('rounds left', shooter.rounds, 'state', shooter.state);
  for (const man of men) console.log(man.id, man.style, man.state, 'panicked', Boolean(man.panicked), 'trunk trauma', (man.trauma?.trunk ?? 0).toFixed(2), 'fear', (man.fear ?? 0).toFixed(2));
  const steps = seconds / dt;
  console.log('ms a step: all', (allMs / steps).toFixed(3), 'the fire', (fireMs / steps).toFixed(3), 'most lumps in flight', most, 'patches now', world.flame?.patches.length ?? 0);
}
