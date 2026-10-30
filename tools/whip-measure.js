// Lashes thrown vs landed: a tap at a man within the whip's reach (standing, moving, guarding), and the AI's own bouts.
// node tools/whip-measure.js [seeds]
import { P } from '../src/body.js';
import { WARRIORS } from '../src/roster.js';
import { MOVES, moveRange } from '../src/moves.js';
import { advance, capsules, createWorld, perform, placeFighter, throwPunch } from '../src/physics.js';
import { thinkAll } from '../src/ai.js';

const by = Object.fromEntries(WARRIORS.map((warrior) => [warrior.key, warrior.inputs]));

/** One tap: the lorarius `distance` m from `opponent` (`what`: standing, moving about, backing off, guarding) throws `move`: did it land (or crack on his shield), the shove's Δv to his body. */
export function tap(opponent, what, seed, distance, move) {
  const world = createWorld([{ inputs: structuredClone(by.lorarius), corner: 'red' }, { inputs: structuredClone(by[opponent]), corner: 'blue' }], { seed });
  const [whip, man] = world.fighters;
  const hold = (current) => {
    Object.assign(man, { move: what === 'moving' ? (seed % 2 ? 1 : -1) * 0.7 : what === 'backing' ? -1 : 0, strafe: what === 'moving' ? 1 : 0, running: false, rush: null, punch: null });
    Object.assign(whip, { move: 0, strafe: 0, running: false });
    if (what === 'guarding' && !man.defence) perform(current, man, 'guard');
    if (what !== 'guarding') man.defence = null;
  };
  placeFighter(man, whip.root[0] + distance, whip.root[1]);
  advance(world, 0.7, hold);
  const apart = Math.hypot(man.x[P.pelvis * 3] - whip.x[P.pelvis * 3], man.x[P.pelvis * 3 + 2] - whip.x[P.pelvis * 3 + 2]);
  if (!throwPunch(world, whip, move, 'body')) return null;
  const from = world.events.length;
  // The shove: the step in his body's knock (the push his legs must take) the frame the lash lands.
  let dv = 0;
  for (let step = 0; step < 60 && whip.punch; step += 1) {
    const count = world.events.length;
    const before = [man.knock[0], man.knock[2]];
    advance(world, 1 / 60, hold);
    if (world.events.slice(count).some((event) => event.weapon === 'whip' && (event.kind === 'landed' || event.kind === 'blocked'))) {
      dv = Math.hypot(man.knock[0] - before[0], man.knock[2] - before[1]);
      break;
    }
  }
  const hit = world.events.slice(from).find((event) => event.weapon === 'whip' && (event.kind === 'landed' || event.kind === 'blocked'));
  // The flinch: the struck part's own Δv (the impulse over the half-share of its two ends' mass).
  const part = hit && capsules(man).find((entry) => entry.key === hit.target);
  const flinch = part ? (hit.transferred ?? 0) / (0.5 * (man.body.masses[part.a] + man.body.masses[part.b])) : 0;
  return { hit: Boolean(hit), dv, flinch, apart };
}

/** The AI's own bout, `seconds` long: his strokes, how many were thrown with his man in reach, and how many of each landed (on him or his shield). */
export function bout(opponent, seed, seconds = 30) {
  const world = createWorld([{ inputs: structuredClone(by.lorarius), corner: 'red' }, { inputs: structuredClone(by[opponent]), corner: 'blue' }], { seed });
  const [whip, man] = world.fighters;
  const range = moveRange(MOVES.overhand, whip.body, whip.weapon.spec);
  const strokes = [];
  let stroke = null;
  for (let step = 0; step < 60 * seconds && !world.over; step += 1) {
    const count = world.events.length;
    advance(world, 1 / 60, (current, dt) => thinkAll(current, dt));
    if (whip.punch && whip.punch !== stroke?.punch) {
      stroke = { punch: whip.punch, inReach: Math.hypot(man.x[P.pelvis * 3] - whip.x[P.pelvis * 3], man.x[P.pelvis * 3 + 2] - whip.x[P.pelvis * 3 + 2]) <= range, landed: false };
      strokes.push(stroke);
    }
    if (stroke && world.events.slice(count).some((event) => event.weapon === 'whip' && (event.kind === 'landed' || event.kind === 'blocked') && event.attacker === whip.id)) stroke.landed = true;
  }
  const near = strokes.filter((entry) => entry.inReach);
  return { thrown: strokes.length, landed: strokes.filter((entry) => entry.landed).length, inReach: near.length, inReachLanded: near.filter((entry) => entry.landed).length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = Number(process.argv[2] ?? 12);
  for (const opponent of ['shaolin', 'plate', 'saladin']) {
    const world = createWorld([{ inputs: structuredClone(by.lorarius), corner: 'red' }, { inputs: structuredClone(by[opponent]), corner: 'blue' }]);
    const range = moveRange(MOVES.overhand, world.fighters[0].body, world.fighters[0].weapon.spec);
    for (const what of ['standing', 'moving', 'backing', 'guarding']) {
      let thrown = 0;
      const dvs = [];
      const flinches = [];
      const missed = [];
      for (let seed = 1; seed <= seeds; seed += 1) {
        for (const move of ['overhand', 'forehand']) {
          const distance = 0.9 + (range - 0.9) * ((seed * 0.618) % 1);
          const result = tap(opponent, what, seed, distance, move);
          // (Only a man in reach as it is thrown: a moving one may have gone out of it while he waited.)
          if (!result || result.apart > range) continue;
          thrown += 1;
          if (result.hit) {
            dvs.push(result.dv);
            flinches.push(result.flinch);
          }
          else missed.push(`${result.apart.toFixed(2)}${move[0]}#${seed}@${distance.toFixed(3)}`);
        }
      }
      const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
      console.log(`${opponent} ${what}: ${dvs.length}/${thrown} landed; shove Δv mean ${mean(dvs).toFixed(3)} max ${Math.max(0, ...dvs).toFixed(3)} m/s, part flinch mean ${mean(flinches).toFixed(2)} m/s (reach ${range.toFixed(2)}); missed at ${missed.join(' ')}`);
    }
    const total = { thrown: 0, landed: 0, inReach: 0, inReachLanded: 0 };
    for (let seed = 1; seed <= 3; seed += 1) {
      const result = bout(opponent, seed);
      for (const key of Object.keys(total)) total[key] += result[key];
    }
    console.log(`${opponent} AI bouts: ${total.landed}/${total.thrown} strokes landed; thrown in reach ${total.inReachLanded}/${total.inReach}`);
  }
}
