// Bodies meeting, measured: one man charging (the rush) or running into another
// standing, from a few strides off: the closing speed, the impulse and the
// energy the crash took up, the peak force on the chest, the harm each took
// (a share of the trunk's damage capacity: 1 is seriously hurt, 2.5 dead),
// what broke, and who went over. The same rule serves a horse (tools/cavalry.js).
// Usage: node tools/crash.js [seeds] [charger:target[:run] ...]
//   (default pairs: boxer, sumo, gorilla and a running man into the lighter and the heavier)

import { P, PRESETS } from '../src/body.js';
import { advance, createWorld, perform, placeFighter, point } from '../src/physics.js';

const [seedsArg = '5', ...named] = process.argv.slice(2);
const seeds = Number(seedsArg);
const PAIRS = named.length ? named : ['heavy:amateur', 'heavy:light', 'light:heavy', 'sumo:amateur', 'sumo:sumo', 'gorilla:amateur', 'gorilla:heavy', 'heavy:amateur:run', 'amateur:amateur:run', 'sumo:amateur:run'];
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];
const fmt = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : '-');

/** One charge (or run) at a man standing (2 m off for a rush, 7 m for a run): the crash event and the aftermath. */
export function crashOnce(chargerKey, targetKey, how, seed) {
  const world = createWorld([PRESETS[chargerKey], { ...PRESETS[targetKey], style: 'unskilled' }], { seed });
  const [charger, target] = world.fighters;
  placeFighter(charger, how === 'run' ? -7 : -2);
  placeFighter(target, 0);
  advance(world, 0.6);
  if (how !== 'run') perform(world, charger, 'rush');
  for (let frame = 0; frame < 150; frame += 1) {
    if (how === 'run') {
      charger.move = 1;
      charger.running = true;
    }
    target.move = 0;
    advance(world, 1 / 60);
  }
  const hits = world.events.filter((event) => event.kind === 'crash');
  const onTarget = hits.find((event) => event.defender === target.id && event.target === 'trunk');
  const onCharger = hits.find((event) => event.defender === charger.id && event.target === 'trunk');
  return {
    onTarget, onCharger, hits,
    targetState: target.state, chargerState: charger.state,
    targetTrauma: target.trauma?.trunk ?? 0, chargerTrauma: charger.trauma?.trunk ?? 0,
    targetRibs: target.injuries.some((injury) => injury.kind === 'rib'), chargerRibs: charger.injuries.some((injury) => injury.kind === 'rib'),
    pushed: point(target.x, P.pelvis)[0],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`charges and runs at a man standing, median of ${seeds} seeds (harm = trunk trauma, 1 seriously hurt, 2.5 dead)`);
  console.log('charger -> target      reduced kg   closing  impulse N·s  energy J  force kN   harm target / charger   ribs  target');
  for (const pair of PAIRS) {
    const [chargerKey, targetKey, how = 'rush'] = pair.split(':');
    const rows = [];
    for (let seed = 0; seed < seeds; seed += 1) rows.push(crashOnce(chargerKey, targetKey, how, 700 + seed));
    const some = rows.filter((row) => row.onTarget);
    if (!some.length) {
      console.log(`${(`${chargerKey} -> ${targetKey} (${how})`).padEnd(26)} no crash`);
      continue;
    }
    const of = (pick) => median(some.map(pick));
    const states = [...new Set(rows.map((row) => row.targetState))].join('/');
    console.log(`${(`${chargerKey} -> ${targetKey} (${how})`).padEnd(26)} ${`${fmt(PRESETS[chargerKey] && of((row) => row.onTarget.impulse / (row.onTarget.speed * 1.2)), 0)}`.padStart(6)}  ${fmt(of((row) => row.onTarget.speed)).padStart(7)}  ${fmt(of((row) => row.onTarget.impulse), 0).padStart(10)}  ${fmt(of((row) => row.onTarget.energy), 0).padStart(8)}  ${fmt(of((row) => row.onTarget.force / 1000)).padStart(8)}  ${fmt(of((row) => row.targetTrauma), 2).padStart(8)} / ${fmt(of((row) => row.chargerTrauma), 2).padEnd(6)}   ${some.filter((row) => row.targetRibs).length}/${rows.length}   ${states}`);
  }
}
