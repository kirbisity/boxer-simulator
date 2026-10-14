// The jousting knight's couched charge on foot, measured: bouts of Maximilian
// against each opponent, and what his one charge did in each — met him or
// not, how (point-first, on the shaft, on a shield, parried), how the man
// answered it, the energy going in, whether plate turned it, and whether the
// bout was won by it.
// Usage: node tools/lance.js [bouts] [seconds] [opponent ...]

import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld } from '../src/physics.js';
import { WEAPONS } from '../src/weapons.js';

const [boutsArg = '12', secondsArg = '120', ...named] = process.argv.slice(2);
const opponents = named.length ? named : ['maximus', 'samurai', 'knight', 'templar', 'guanYu', 'ronin'];
const bouts = Number(boutsArg);
const seconds = Number(secondsArg);
const decidedWithin = 12;
const fmt = (value, digits = 0) => (Number.isFinite(value) ? value.toFixed(digits) : '-');
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : NaN;
};

const rows = [];
for (const name of opponents) {
  const tally = { wins: 0, losses: 0, draws: 0, byCharge: 0, contacts: 0, pointFirst: 0, onShield: 0, parried: 0, glanced: 0, gap: 0, runThrough: 0, missed: 0, answers: {}, pierce: [], speed: [], endTime: [] };
  for (let bout = 0; bout < bouts; bout += 1) {
    const world = createWorld([{ ...PRESETS.maximilian }, { ...PRESETS[name] }], { seed: 1000 + bout });
    const [knight, man] = world.fighters;
    let charge = null;
    let elapsed = 0;
    while (elapsed < seconds && !boutWinner(world)) {
      const before = world.events.length;
      advance(world, 1 / 20, (current, dt) => {
        thinkAll(current, dt);
        if (knight.punch?.type === 'lanceCharge') {
          charge ??= { from: world.time, answers: new Set(), runSpeed: 0 };
          if (man.defence) charge.answers.add(man.defence.name);
          charge.runSpeed = Math.max(charge.runSpeed, Math.hypot(knight.rootVelocity[0], knight.rootVelocity[1]));
        }
      });
      elapsed += 1 / 20;
      if (charge && !charge.over && knight.couched === 'done') charge.over = world.time;
      for (const event of world.events.slice(before)) {
        if (event.attacker === 0 && event.punch === 'lanceCharge' && (event.kind === 'landed' || event.kind === 'blocked')) charge.contact ??= event;
        if (event.kind === 'parry' && event.attacker === 0 && event.punch === 'lanceCharge') charge.parried = true;
        if (charge && !charge.over && event.kind === 'clash' && event.fighter === 1) charge.parried = true;
      }
    }
    const winner = boutWinner(world);
    const ended = world.time;
    if (winner === 'red') tally.wins += 1;
    else if (winner === 'blue') tally.losses += 1;
    else tally.draws += 1;
    tally.endTime.push(elapsed);
    if (!charge) continue;
    for (const answer of charge.answers) tally.answers[answer] = (tally.answers[answer] ?? 0) + 1;
    if (!charge.answers.size) tally.answers.none = (tally.answers.none ?? 0) + 1;
    tally.speed.push(charge.runSpeed);
    const hit = charge.contact;
    if (charge.parried) tally.parried += 1;
    if (!hit) {
      if (!charge.parried) tally.missed += 1;
      continue;
    }
    tally.contacts += 1;
    if (hit.target?.startsWith?.('shield') || hit.kind === 'blocked' && /shield/.test(hit.target)) tally.onShield += 1;
    const pointFirst = hit.along > 0.9 && hit.at > WEAPONS.lance.pointFrom;
    if (pointFirst) tally.pointFirst += 1;
    if (hit.effects.includes('glanced off the plate')) tally.glanced += 1;
    if (hit.effects.includes('into a gap in the armour')) tally.gap += 1;
    tally.pierce.push(hit.pierce ?? 0);
    const through = (hit.pierce ?? 0) > 25 || hit.effects.includes('stabbed through the chest');
    if (through) tally.runThrough += 1;
    // Decided by it: run through, and he was out within `decidedWithin` s of it.
    if (through && winner === 'red' && ended - hit.time <= decidedWithin) tally.byCharge += 1;
  }
  rows.push([name, tally]);
}

console.log(`Maximilian (lance) v each, ${bouts} bouts of up to ${seconds}s (byCharge: run through, out within ${decidedWithin} s)`);
console.log('opponent   W-L-D    byCharge contacts pointFirst parried missed glanced gap runThrough pierceMed pierceMax runSpeed  answers');
for (const [name, t] of rows) {
  console.log(
    `${name.padEnd(10)} ${`${t.wins}-${t.losses}-${t.draws}`.padEnd(8)} ${String(t.byCharge).padEnd(8)} ${String(t.contacts).padEnd(8)} ${String(t.pointFirst).padEnd(10)} ${String(t.parried).padEnd(7)} ${String(t.missed).padEnd(6)} ${String(t.glanced).padEnd(7)} ${String(t.gap).padEnd(3)} ${String(t.runThrough).padEnd(10)} ${fmt(median(t.pierce)).padEnd(9)} ${fmt(Math.max(0, ...t.pierce)).padEnd(9)} ${fmt(median(t.speed), 2).padEnd(9)} ${JSON.stringify(t.answers)}`,
  );
}
