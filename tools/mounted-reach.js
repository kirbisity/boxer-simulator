// Blows from the saddle at men on foot, measured: how many a rider lands
// per pass and per minute, with a short weapon (a sabre, a long sword) and a
// long one (a lance). Three ways of riding at the man:
//   ai      the riding AI (riding.js ride) against him, as in any fight;
//   player  the player's own controls, ridden as a player would: the stick
//           at the gallop on a line that takes him past the man on his
//           weapon side, the attack tapped (the fight pad's tap,
//           orders.requests) once he is within the move's reach, on through,
//           wheeled round, again;
//   early   the same, the attack tapped while the man is still `early` m
//           (8) ahead: the blow readied for the pass, the reins kept;
//   assist  the player taps the attack once while the man is far off and
//           lets the assisted charge (control.js chargeOrder) ride him
//           down and make the blow; a new tap when it hands control back.
//           Per tap: whether it landed, the time from the tap to the blow,
//           and how the rider was left (his horse's pace, the man ahead of
//           him or not).
// A bout runs until the man is out or the rider is off his horse (or the time
// is up): per minute is per minute of a rider at a man. A blow "connects"
// when it meets the man or his guard (landed or blocked);
// a blow on his horse does not count (these men have none).
// Usage: node tools/mounted-reach.js [seeds] [seconds] [mode ...] [-- rider ...]
//   modes: ai player early assist (all four by default)
//   riders: sabre sword lance (all by default); the men on foot: a yari man and a knight on foot (long sword, plate)

import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { directFighter, newOrders } from '../src/control.js';
import { MOVES, STYLES, moveRange } from '../src/moves.js';
import { advance, createWorld, point } from '../src/physics.js';
import { vec, yawRotate } from '../src/pose.js';

const args = process.argv.slice(2);
const split = args.indexOf('--');
const [seedsArg = '12', secondsArg = '60', ...modeArgs] = split < 0 ? args : args.slice(0, split);
const riderArgs = split < 0 ? [] : args.slice(split + 1);
const seeds = Number(seedsArg) || 12;
const seconds = Number(secondsArg) || 60;
const FIELD = { halfX: 30, halfZ: 20 };

export const RIDERS = {
  sabre: { label: 'sabre (kheshig, steppe horse)', inputs: { ...PRESETS.saber, style: 'saberShield' }, move: 'gladiusCut' },
  sword: { label: 'long sword (Sir Edric, destrier)', inputs: { ...PRESETS.knight }, move: 'oberhau' },
  lance: { label: 'lance (Maximilian, destrier)', inputs: { ...PRESETS.maximilian }, move: 'lanceThrust' },
};
export const MEN = {
  yari: { label: 'yari man', inputs: { ...PRESETS.yari } },
  knight: { label: 'knight on foot', inputs: { ...PRESETS.knight } },
};

/** A world of one rider (red, the player in the player's modes) and one man on foot. */
export function riderAndMan(riderKey, manKey, seed) {
  const sides = [
    { inputs: { ...structuredClone(RIDERS[riderKey].inputs), mounted: true }, corner: 'red' },
    { inputs: structuredClone(MEN[manKey].inputs), corner: 'blue' },
  ];
  return createWorld(sides, { seed, arena: FIELD });
}

/**
 * Run a bout a step at a time with `think` until `length` s, or until the man is out or the rider off his horse (what is
 * measured is a rider at a man): the time it ran.
 */
function runWhile(world, length, think) {
  const [rider, man] = world.fighters;
  while (world.time < length - 1e-9 && rider.mount && man.state !== 'out') advance(world, 1 / 60, think);
  return world.time;
}
const connects = (world, attacker, since = -Infinity) => world.events.filter((event) => event.time >= since && (event.kind === 'landed' || event.kind === 'blocked') && event.attacker === attacker).length;

/** The riding AI against the man: passes (each time his phase turns to 'past') and blows. */
export function aiBout(riderKey, manKey, seed, length = seconds) {
  const world = riderAndMan(riderKey, manKey, seed);
  const rider = world.fighters[0];
  let passes = 0;
  let phase = null;
  runWhile(world, length, (w, dt) => {
    thinkAll(w, dt);
    const now = rider.mount ? rider.ride?.phase : null;
    if (now === 'past' && phase !== 'past') passes += 1;
    phase = now;
  });
  return { passes, thrown: rider.stats.thrown, connects: connects(world, rider.id), landed: world.events.filter((event) => event.kind === 'landed' && event.attacker === rider.id).length, minutes: world.time / 60 };
}

/**
 * The player's controls, ridden as a player would (see the head of the file): the stick and a tap, nothing else.
 * `side` m: how far to the left of the man the line is ridden (his weapon side, the right, towards the man).
 */
export function playerBout(riderKey, manKey, seed, length = seconds, { side = 1.2, early = null } = {}) {
  const world = riderAndMan(riderKey, manKey, seed);
  const [me, man] = world.fighters;
  const orders = newOrders();
  const spec = MOVES[RIDERS[riderKey].move];
  let phase = 'in';
  let tapped = false;
  let passes = 0;
  runWhile(world, length, (w, dt) => {
    thinkAll(w, dt, new Set([me.id]));
    if (me.mount && man.state === 'up') {
      const horse = me.mount;
      const at = point(man.x, P.pelvis);
      const to = [at[0] - horse.at[0], at[2] - horse.at[1]];
      const distance = Math.hypot(to[0], to[1]);
      const forward = yawRotate([1, 0, 0], horse.yaw);
      if (phase === 'in') {
        const left = [-to[1] / distance, to[0] / distance];
        const pass = [at[0] + left[0] * side - horse.at[0], at[2] + left[1] * side - horse.at[1]];
        const length = Math.hypot(pass[0], pass[1]);
        orders.stick = { dir: [pass[0] / length, pass[1] / length], amount: 1 };
        // The tap, once he is near enough for the pad to throw it at the man (control.js padAttack).
        const hips = point(me.x, P.pelvis);
        const reach = moveRange(spec, me.body, me.weapon?.held ? me.weapon.spec : null) + me.body.lengths.headRadius + (spec.step ?? 0) * 0.5 + 0.3;
        if (!tapped && Math.hypot(at[0] - hips[0], at[2] - hips[2]) <= (early ?? reach)) {
          orders.requests.push({ move: RIDERS[riderKey].move, zone: 'head', strength: 'quick', at: w.time });
          tapped = true;
        }
        if (forward[0] * to[0] + forward[2] * to[1] < 0) {
          phase = 'out';
          passes += 1;
        }
      } else if (phase === 'out') {
        orders.stick = { dir: [forward[0], forward[2]], amount: 1 };
        if (distance > 10) phase = 'turn';
      } else {
        orders.stick = { dir: [to[0] / distance, to[1] / distance], amount: 0.7 };
        if ((forward[0] * to[0] + forward[2] * to[1]) / distance > Math.cos(0.4)) {
          phase = 'in';
          tapped = false;
        }
      }
    } else orders.stick = null;
    directFighter(w, me, orders, dt);
  });
  return { passes, thrown: me.stats.thrown, connects: connects(world, me.id), landed: world.events.filter((event) => event.kind === 'landed' && event.attacker === me.id).length, minutes: world.time / 60 };
}

/** The assist: a tap while it is idle (control.js orders.charge), and what came of each. */
export function assistBout(riderKey, manKey, seed, length = seconds) {
  const world = riderAndMan(riderKey, manKey, seed);
  const [me, man] = world.fighters;
  const orders = newOrders();
  const taps = [];
  let current = null;
  const settle = () => {
    if (!current) return;
    const blows = world.events.filter((event) => event.time >= current.at && (event.kind === 'landed' || event.kind === 'blocked') && event.attacker === me.id);
    current.hit = blows.length > 0;
    current.toHit = blows.length ? blows[0].time - current.at : null;
    current.handedBack = world.time;
    const horse = me.mount;
    if (horse) {
      const at = point(man.x, P.pelvis);
      const forward = yawRotate([1, 0, 0], horse.yaw);
      const to = vec.normalize([at[0] - horse.at[0], 0, at[2] - horse.at[1]]);
      current.pace = Math.abs(horse.speed);
      current.facing = vec.dot(forward, to);
    }
    current.manDown = man.state !== 'up';
    current.end = orders.charged?.end ?? null;
    taps.push(current);
    current = null;
  };
  runWhile(world, length, (w, dt) => {
    thinkAll(w, dt, new Set([me.id]));
    const busy = Boolean(orders.charge);
    if (current && !busy && w.time - current.at > 0.5) settle();
    if (!current && !busy && me.mount && man.state === 'up' && !me.punch) {
      orders.requests.push({ move: RIDERS[riderKey].move, zone: 'head', strength: 'quick', at: w.time });
      const at = point(man.x, P.pelvis);
      current = { at: w.time, from: Math.hypot(at[0] - me.mount.at[0], at[2] - me.mount.at[1]) };
    }
    directFighter(w, me, orders, dt);
  });
  if (current) settle();
  return { taps, connects: connects(world, me.id), minutes: world.time / 60 };
}

const fmt = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : '-');
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : NaN;
};

const modes = modeArgs.length ? modeArgs : ['ai', 'player', 'early', 'assist'];
const riders = riderArgs.length ? riderArgs : Object.keys(RIDERS);
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const mode of modes) {
    for (const riderKey of riders) {
      for (const manKey of Object.keys(MEN)) {
        const label = `${mode.padEnd(6)} ${RIDERS[riderKey].label} v ${MEN[manKey].label}`;
        if (mode === 'assist') {
          const all = [];
          let blows = 0;
          let minutes = 0;
          for (let seed = 1; seed <= seeds; seed += 1) {
            const bout = assistBout(riderKey, manKey, seed);
            all.push(...bout.taps);
            blows += bout.connects;
            minutes += bout.minutes;
          }
          const hits = all.filter((tap) => tap.hit);
          const ends = {};
          for (const tap of all) ends[tap.end ?? 'running'] = (ends[tap.end ?? 'running'] ?? 0) + 1;
          console.log(`${label}: ${all.length} taps, ${hits.length} hit (${fmt((100 * hits.length) / Math.max(1, all.length), 0)} %), tap to blow median ${fmt(median(hits.map((tap) => tap.toHit)), 2)} s (from ${fmt(median(all.map((tap) => tap.from)))} m), tap to reins back median ${fmt(median(all.map((tap) => tap.handedBack - tap.at)))} s, connects per minute ${fmt(blows / minutes)}`);
          console.log(`         ended: ${Object.entries(ends).map(([end, count]) => `${end} ${count}`).join(', ')}; reins back at a median ${fmt(median(all.map((tap) => tap.pace)))} m/s, facing him (within 45°) ${all.filter((tap) => tap.facing > Math.cos(Math.PI / 4)).length} of ${all.length}`);
          continue;
        }
        const tally = { passes: 0, thrown: 0, connects: 0, landed: 0, minutes: 0 };
        for (let seed = 1; seed <= seeds; seed += 1) {
          const bout = mode === 'ai' ? aiBout(riderKey, manKey, seed) : playerBout(riderKey, manKey, seed, seconds, { early: mode === 'early' ? 8 : null });
          for (const key of Object.keys(tally)) tally[key] += bout[key];
        }
        console.log(`${label}: ${tally.passes} passes, ${tally.thrown} blows, ${tally.connects} connect (${tally.landed} landed): ${fmt(tally.connects / Math.max(1, tally.passes), 2)} per pass, ${fmt(tally.connects / tally.minutes)} per minute, ${fmt((100 * tally.connects) / Math.max(1, tally.thrown), 0)} % of blows`);
      }
    }
  }
}
