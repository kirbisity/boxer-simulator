// How often a knockout by a heavy blow to the head knocks the helmet off, by how the helmet is held (outfits.js HELMETS
// `hold`; physics.js knockHelmetOff, WORLD.helmetOff). Heavy weapons, big punches, kicks, knees and elbows from several
// attackers, thrown at the head of an unresisting man in each helmet, fresh or already worn down (a hurt chin, knockdowns
// taken: the knockout later in a fight, to a lesser blow), over seeds and ranges. Of the blows that knock him out: how many
// took the helmet with them. Calibrates WORLD.helmetOff (aim: open ~50%, half-enclosed ~20%, enclosed under 2%).
// (--slip quantiles are of the slip over each helmet's hold, scaled to its class's hold: J for a helmet of `refKg`.)
// Usage: node tools/helmet-off.js [seeds=10] [--slip]   (helmets measured in parallel, a process each)
//   (--slip: the slip energy of each class's knockouts, in quantiles, J)

import { PRESETS } from '../src/body.js';
import { MOVES } from '../src/moves.js';
import { advance, createWorld, placeFighter, reachOf, throwPunch, WORLD } from '../src/physics.js';
import { gearTraits, helmetNameOf } from '../src/outfits.js';

// Who strikes: a style, a build, the heavy head blows of his style.
export const ATTACKERS = [
  { style: 'boxing', preset: 'heavy', moves: ['cross', 'hook', 'uppercut'] },
  { style: 'boxing', preset: 'contender', moves: ['cross', 'hook', 'uppercut'] },
  { style: 'kickboxing', preset: 'contender', moves: ['roundhouse', 'hook'] },
  { style: 'muayThai', preset: 'heavy', moves: ['roundhouse', 'knee', 'elbow'] },
  { style: 'taekwondo', preset: 'light', moves: ['roundhouse', 'spinKick'] },
  { style: 'warhammer', preset: 'knight', moves: ['hammerOverhead', 'hammerSide'] },
  { style: 'kanabo', preset: 'heavy', moves: ['hammerOverhead', 'hammerSide'] },
  { style: 'mace', preset: 'contender', moves: ['maceOverhead', 'maceSide'] },
  { style: 'bat', preset: 'contender', moves: ['hammerSide', 'hammerOverhead'] },
  { style: 'commodus', preset: 'heavy', moves: ['maceOverhead', 'maceSide'] },
  { style: 'staff', preset: 'contender', moves: ['naginataSweep', 'staffButt'] },
];

// Whom: one kit for each helmet, by its hold.
export const HELMS = [
  { kind: 'footman', design: 0 }, { kind: 'ashigaru', design: 0 }, { kind: 'mingBrigandine', design: 0 }, { kind: 'mingBrigandine', design: 1 },
  { kind: 'conquistadorPlate', design: 0 }, { kind: 'conquistadorPlate', design: 2 }, { kind: 'conquistadorPlate', design: 3 }, { kind: 'levy', design: 1 },
  { kind: 'samurai', design: 0 }, { kind: 'samuraiTosei', design: 0 }, { kind: 'mingElite', design: 0 }, { kind: 'mingElite', design: 2 }, { kind: 'footman', design: 1 }, { kind: 'cumanHeavy', design: 0 },
  { kind: 'knight', design: 0 }, { kind: 'knight', design: 1 }, { kind: 'knight', design: 3 }, { kind: 'templar', design: 0 }, { kind: 'swat', design: 0 }, { kind: 'infantry', design: 0 },
];

// How worn he is when the blow lands: head damage taken and knockdowns already.
const WEAR = [{ head: 0, knockdowns: 0 }, { head: 0.4, knockdowns: 1 }, { head: 0.7, knockdowns: 2 }];
const RANGES = [0.8, 0.9, 1.0];

/** One blow: the knockout it caused (or none), whether it took the helmet, and its slip (energy over the hold). */
export function blowAt(attacker, move, helm, wear, range, seed) {
  const world = createWorld([{ ...PRESETS[attacker.preset], style: attacker.style }, { ...PRESETS.contender, style: 'passive', outfit: { kind: helm.kind, design: helm.design } }], { seed });
  const [striker, man] = world.fighters;
  const distance = reachOf(striker) * range;
  placeFighter(striker, -distance / 2, 0);
  placeFighter(man, distance / 2, 0);
  advance(world, 0.6);
  man.damage.head = wear.head;
  man.knockdowns = wear.knockdowns;
  world.events.length = 0;
  // (Thrown as it comes, not loaded up: a heavy one telegraphed is seen and covered even by a passive man.)
  throwPunch(world, striker, move, 'head');
  advance(world, MOVES[move].duration + 0.3);
  const hit = world.events.find((event) => event.kind === 'landed' && event.attacker === striker.id && event.target === 'head');
  if (!hit) return null;
  const ko = world.events.some((event) => event.kind === 'knockout' && event.fighter === man.id && event.time === hit.time);
  const off = world.events.some((event) => event.kind === 'accessory' && event.helmet && event.fighter === man.id && event.time === hit.time);
  return { ko, off, slip: hit.helmetSlip ?? 0, deltaV: hit.headDeltaV };
}

/** One helmet's knockouts over every attacker, move, wear, range and seed: { hold, name, kos, off, slips (J) }. */
export function measureHelm(helm, seeds = 6) {
  const inputs = { outfit: helm };
  const hold = gearTraits(inputs).helmetHold;
  const row = { hold, name: `${helmetNameOf(inputs)} (${helm.kind})`, kos: 0, off: 0, slips: [] };
  for (const attacker of ATTACKERS) for (const move of attacker.moves) for (const wear of WEAR) for (const range of RANGES) for (let seed = 1; seed <= seeds; seed += 1) {
    const blow = blowAt(attacker, move, helm, wear, range, seed);
    if (!blow?.ko) continue;
    row.kos += 1;
    row.off += blow.off ? 1 : 0;
    // (As a 2 kg helmet's: the slip over its hold, times the hold of its class.)
    row.slips.push(blow.slip * (WORLD.helmetOff.holds[hold] / (WORLD.helmetOff.ease || 1)));
  }
  return row;
}

/** Every helmet measured, a few at once (child processes): the rows, by helmet. */
async function measure(seeds, jobs) {
  const { fork } = await import('node:child_process');
  const queue = HELMS.map((helm, index) => index);
  const rows = [];
  const worker = () => new Promise((resolve) => {
    const next = () => {
      if (!queue.length) return resolve();
      const index = queue.shift();
      const child = fork(new URL(import.meta.url).pathname, ['--helm', String(index), String(seeds)], { stdio: ['ignore', 'pipe', 'inherit', 'ipc'] });
      child.on('message', (row) => rows.push({ index, ...row }));
      child.on('exit', next);
    };
    next();
  });
  await Promise.all(Array.from({ length: jobs }, worker));
  return rows.sort((a, b) => a.index - b.index);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = Number(process.argv.find((arg) => /^\d+$/.test(arg)) ?? 10);
  const helmAt = process.argv.indexOf('--helm');
  if (helmAt >= 0) {
    process.send(measureHelm(HELMS[Number(process.argv[helmAt + 1])], Number(process.argv[helmAt + 2])));
    process.exit(0);
  }
  const { availableParallelism } = await import('node:os');
  const rows = await measure(seeds, Math.max(1, availableParallelism() - 1));
  const pct = (row) => `${((100 * row.off) / Math.max(1, row.kos)).toFixed(1).padStart(5)}%`;
  console.log(`WORLD.helmetOff: ease ${WORLD.helmetOff.ease}, holds ${JSON.stringify(WORLD.helmetOff.holds)}; ${seeds} seeds\n`);
  const byHold = {};
  for (const row of rows) {
    const total = (byHold[row.hold] ??= { kos: 0, off: 0, slips: [] });
    total.kos += row.kos;
    total.off += row.off;
    total.slips.push(...row.slips);
  }
  console.log('hold       KOs   came off');
  for (const hold of ['open', 'half', 'enclosed']) if (byHold[hold]) console.log(`${hold.padEnd(9)} ${String(byHold[hold].kos).padStart(5)}  ${pct(byHold[hold])}`);
  console.log('\nby helmet');
  for (const row of rows) console.log(`  ${row.hold.padEnd(9)} ${row.name.padEnd(46)} ${String(row.kos).padStart(4)} ${pct(row)}`);
  if (process.argv.includes('--slip')) {
    console.log('\nslip energy of the knockouts (J), quantiles 2/20/50/70/75/80/85/90/98/99.5%');
    const q = (list, p) => list[Math.min(list.length - 1, Math.floor(p * list.length))] ?? 0;
    for (const [hold, total] of Object.entries(byHold)) {
      const list = total.slips.slice().sort((a, b) => a - b);
      console.log(`  ${hold.padEnd(9)} ${[0.02, 0.2, 0.5, 0.7, 0.75, 0.8, 0.85, 0.9, 0.98, 0.995].map((p) => q(list, p).toFixed(2)).join('  ')}`);
    }
  }
}
