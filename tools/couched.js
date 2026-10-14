// The same weapon on foot and from the saddle, measured: the first blow of
// each attacker against a man standing still (bare, or Sir Edric in plate):
// the closing speed at the point, the mass behind it, the energy the
// collision took up, what went in (pierce, cut, blunt), and what became of
// him. The couched lance on foot (Maximilian, running) against the same
// lance from a destrier at the gallop; a spear and a sabre from the saddle.
// A rider is ridden straight at the gallop on a line that brings his weapon
// to the man (no steering to miss: this measures the blow, not the aim).
// Usage: node tools/couched.js [seeds] [target ...]

import { P, PRESETS } from '../src/body.js';
import { think } from '../src/ai.js';
import { MOVES } from '../src/moves.js';
import { advance, aimPoint, createWorld, point, throwPunch, toLocal } from '../src/physics.js';
import { vec } from '../src/pose.js';

const FIELD = { halfX: 30, halfZ: 20 };
// Each attacker: inputs (with a style and a ride if any), and for a rider the blow he makes in passing and how far to the side the man stands (m).
export const ATTACKERS = [
  ['Maximilian, lance, on foot', { ...PRESETS.maximilian }, null],
  ['Maximilian, lance, destrier', { ...PRESETS.maximilian, mounted: true }, { move: 'lanceCharge', side: 0.5 }],
  ['horseman, yari, steppe horse', { ...PRESETS.kheshig, style: 'yari', mounted: true }, { move: 'spearThrust', side: 0.9 }],
  ['knight, spear, destrier', { ...PRESETS.knight, style: 'spear', mounted: true }, { move: 'spearThrust', side: 0.9 }],
  ['kheshig, sabre, steppe horse', { ...PRESETS.saber, style: 'saberShield', mounted: true }, null],
  ['Sir Edric, long sword, destrier', { ...PRESETS.knight, mounted: true }, null],
];
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : NaN;
};
const fmt = (value, digits = 0) => (Number.isFinite(value) ? value.toFixed(digits) : '-');
const isBody = (event) => event.attacker === 0 && (event.kind === 'landed' || event.kind === 'blocked') && (event.target === 'trunk' || event.target === 'head');

/** The attacker's first blow on a man standing still's body or head: the event, and how far he went in the 3 s after. */
export function firstBlow(attackerInputs, targetKey, seed, pass) {
  const world = createWorld([attackerInputs, { ...PRESETS[targetKey], style: 'unskilled' }], { seed, arena: FIELD });
  const [attacker, man] = world.fighters;
  const horse = attacker.mount;
  // The man off to the weapon side by the distance a rider passes him at (RIDING).
  if (pass && horse) {
    // (Spread a little across the seeds: a couched point's height and line wander, and a man's width is not much.)
    const side = -(pass.side + (pass.move === 'lanceCharge' ? 0.04 : 0.06) * ((seed % 5) - 2));
    man.root[1] += side;
    for (let index = 0; index < man.x.length; index += 3) {
      man.x[index + 2] += side;
      man.prev[index + 2] += side;
    }
  }
  let hit = null;
  let thrown = false;
  for (let t = 0; t < 20 && !hit; t += 1 / 60) {
    man.move = 0;
    advance(world, 1 / 60, (current, dt) => {
      if (!pass || !horse) {
        think(current, attacker, dt);
        return;
      }
      horse.goal = { heading: 0, speed: horse.paces.gallop };
      horse.goalAt = world.time + 1;
      attacker.cooldown = 1;
      const spec = MOVES[pass.move];
      const mark = aimPoint(man, 'body');
      const shoulder = point(attacker.x, P.rShoulder);
      const ahead = mark[0] - shoulder[0];
      const lands = spec.extendUntil;
      if (thrown || attacker.punch) return;
      if (pass.move === 'lanceCharge') {
        // (Laid a little low: the heavy shaft's point trails the line it is laid on.)
        if (ahead < 3.8 + 0.9 * horse.speed) thrown = throwPunch(world, attacker, pass.move, 'body', { at: vec.add(mark, [0, -0.3, 0]) });
      } else if (ahead <= horse.speed * (lands + 0.15) + 0.3 && ahead > 0) {
        thrown = throwPunch(world, attacker, pass.move, 'body');
        if (thrown) {
          attacker.punch.aim = toLocal(attacker, vec.sub(mark, vec.scale(horse.velocity, lands)));
          attacker.punch.rideOffset = attacker.yaw - horse.yaw;
        }
      }
    });
    hit = world.events.find(isBody);
  }
  if (!hit) return null;
  const start = point(man.x, P.pelvis);
  advance(world, 3, (current, dt) => {
    if (!pass || !horse) think(current, attacker, dt);
  });
  const end = point(man.x, P.pelvis);
  return { hit, state: man.state, thrown: Math.hypot(end[0] - start[0], end[2] - start[2]) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [seedsArg = '8', ...named] = process.argv.slice(2);
  const seeds = Number(seedsArg);
  const targets = named.length ? named : ['street', 'knight'];
  console.log(`first blow at a man standing still, median of ${seeds} seeds`);
  for (const targetKey of targets) {
    console.log(`\nagainst ${targetKey}`);
    console.log('attacker                              closing  mass kg   energy J   pierce J   cut J   blunt J   outcome');
    for (const [label, inputs, pass] of ATTACKERS) {
      const rows = [];
      for (let seed = 0; seed < seeds; seed += 1) {
        const row = firstBlow(inputs, targetKey, 3000 + seed, pass);
        if (row) rows.push(row);
      }
      if (!rows.length) {
        console.log(`${label.padEnd(36)}  no blow`);
        continue;
      }
      const of = (pick) => median(rows.map(pick));
      const effects = new Map();
      for (const row of rows) {
        for (const effect of row.hit.effects) {
          const name = effect.replace(/\s*\(.*\)/, '');
          effects.set(name, (effects.get(name) ?? 0) + 1);
        }
      }
      const common = [...effects].filter(([, n]) => n >= rows.length / 2).map(([name]) => name).join(', ');
      console.log(`${label.padEnd(36)} ${fmt(of((r) => r.hit.speed), 1).padStart(6)} ${fmt(of((r) => r.hit.strikeMass)).padStart(8)} ${fmt(of((r) => r.hit.energy)).padStart(10)} ${fmt(of((r) => r.hit.pierce)).padStart(10)} ${fmt(of((r) => r.hit.cut)).padStart(7)} ${fmt(of((r) => (r.hit.harm ?? 0) * (r.hit.energy ?? 0))).padStart(9)}   ${rows.length}/${seeds} landed; ${common || '-'}`);
    }
  }
}
