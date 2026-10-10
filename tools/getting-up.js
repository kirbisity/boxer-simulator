// Falling, lying and getting up, as the eye sees it, in real bouts. Per
// pairing, over every time a fighter goes down:
//   jitter   — velocity reversals per particle-second while down and while
//              rising (a part's frame-to-frame motion turning back on itself
//              at more than 0.1 m/s each way: a shiver, not a fall)
//   restless — mean particle speed (m/s) once down for a second, until he moves to rise
//   early    — share of rises begun while a part still moves faster than 0.5 m/s
//   stood    — rises that ended standing (hips up at 0.9 of a standing man's)
//   planted  — share of those with a hand on the floor (within 4 cm) while the hips came up
//   lifted   — share of rising frames where the body's centre of mass goes up
//              while it is not over what touches the floor (its support,
//              widened by 10 cm), or nothing does: hauled up, not pushed up
//   twisted  — joint-range violations per down-or-rising second: an elbow or
//              knee bent backwards past 15°, or a forearm turned past what the
//              shoulder can rotate (anatomy.js armRange)
//   rise     — mean seconds from starting to rise to the hips up (the whole
//              rise, whatever the state says: 'up' with the hips still low counts)
// Each pairing is fought as it is (the last man down is held down: pins)
// and again with no pins, so that men get up unhindered.
// Usage: node tools/getting-up.js [bouts] [seconds]

import { P, PARTICLES } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld, point } from '../src/physics.js';
import { fighterFor } from './weapons.js';
import { jointViolations } from './anatomy.js';

export const FALL_PAIRINGS = [
  ['light:kickboxing', 'heavy:kickboxing'],
  ['heavy:boxing', 'light:boxing'],
  ['contender:warhammer', 'contender:katana:knight'],
  ['contender:warhammer', 'contender:boxing'],
  ['contender:muayThai', 'contender:street'],
];

const COUNT = PARTICLES.length;
const CONTACT = 0.04;

function centreOfMass(fighter) {
  const at = [0, 0, 0];
  let mass = 0;
  for (let index = 0; index < COUNT; index += 1) {
    const kg = 1 / fighter.invMass[index];
    mass += kg;
    for (let axis = 0; axis < 3; axis += 1) at[axis] += fighter.x[index * 3 + axis] * kg;
  }
  return at.map((value) => value / mass);
}

/** Is a floor point inside the convex hull of `points` (x, z), widened by `margin`? */
function overSupport(at, points, margin) {
  if (!points.length) return false;
  if (points.length < 3) return points.some((p) => Math.hypot(p[0] - at[0], p[2] - at[2]) < margin) || (points.length === 2 && segmentDistance(at, points[0], points[1]) < margin);
  const hull = convexHull(points.map((p) => [p[0], p[2]]));
  let inside = true;
  for (let index = 0; index < hull.length; index += 1) {
    const a = hull[index];
    const b = hull[(index + 1) % hull.length];
    if ((b[0] - a[0]) * (at[2] - a[1]) - (b[1] - a[1]) * (at[0] - a[0]) < 0) inside = false;
  }
  if (inside) return true;
  return hull.some((a, index) => segmentDistance(at, [a[0], 0, a[1]], [hull[(index + 1) % hull.length][0], 0, hull[(index + 1) % hull.length][1]]) < margin);
}

function segmentDistance(at, a, b) {
  const ab = [b[0] - a[0], b[2] - a[2]];
  const length = ab[0] * ab[0] + ab[1] * ab[1];
  const t = length > 1e-9 ? Math.max(0, Math.min(1, ((at[0] - a[0]) * ab[0] + (at[2] - a[2]) * ab[1]) / length)) : 0;
  return Math.hypot(at[0] - a[0] - ab[0] * t, at[2] - a[2] - ab[1] * t);
}

function convexHull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function riseQuality(pairings = FALL_PAIRINGS, bouts = 4, seconds = 90, rules = {}) {
  const rows = [];
  for (const [red, blue] of pairings) {
    const row = { pairing: `${red} v ${blue}${rules.noPins ? ' (no pins)' : ''}`, downSeconds: 0, risingSeconds: 0, downReversals: 0, risingReversals: 0, restlessSum: 0, restlessFrames: 0, rises: 0, early: 0, planted: 0, liftedFrames: 0, risingFrames: 0, violations: 0, riseSeconds: 0, stood: 0 };
    for (let bout = 0; bout < bouts; bout += 1) {
      const world = createWorld([fighterFor(red), fighterFor(blue)], { seed: 900 + bout, rules });
      const track = world.fighters.map(() => ({ previous: null, velocity: null, state: 'up', downFor: 0, rise: null, com: null, comVelocity: 0 }));
      let elapsed = 0;
      while (elapsed < seconds && !boutWinner(world)) {
        advance(world, 1 / 60, (current, dt) => thinkAll(current, dt));
        elapsed += 1 / 60;
        world.fighters.forEach((fighter, id) => {
          const t = track[id];
          const points = Array.from({ length: COUNT }, (_, index) => point(fighter.x, index));
          const velocity = t.previous ? points.map((at, index) => at.map((value, axis) => (value - t.previous[index][axis]) * 60)) : null;
          const lying = fighter.state === 'down' || fighter.state === 'out';
          const standingPelvis = fighter.body.lengths.thigh + fighter.body.lengths.shank + fighter.body.lengths.ankle;
          const pelvisHeight = points[P.pelvis][1];
          // Getting up, from the moment he starts until his hips are up
          // where a standing man's are (whatever his state says by then).
          if (fighter.state === 'rising' && t.state === 'down') {
            row.rises += 1;
            // How he lay just before he started: the step that starts him moves him.
            const fastest = t.velocity ? Math.max(...t.velocity.map((v) => Math.hypot(...v))) : 0;
            if (fastest > 0.5) row.early += 1;
            t.rise = { started: elapsed, planted: false, startPelvis: pelvisHeight };
          }
          const rising = Boolean(t.rise) && !lying;
          if ((lying || rising) && velocity && t.velocity) {
            let reversals = 0;
            for (let index = 0; index < COUNT; index += 1) {
              for (let axis = 0; axis < 3; axis += 1) {
                const before = t.velocity[index][axis];
                const now = velocity[index][axis];
                if (before * now < 0 && Math.abs(before) > 0.1 && Math.abs(now) > 0.1) reversals += 1;
              }
            }
            if (lying) row.downReversals += reversals;
            else row.risingReversals += reversals;
          }
          if (lying && fighter.state !== 'out') {
            t.downFor += 1 / 60;
            row.downSeconds += 1 / 60;
            if (t.downFor > 1 && velocity) {
              row.restlessSum += velocity.reduce((sum, v) => sum + Math.hypot(...v), 0) / COUNT;
              row.restlessFrames += 1;
            }
          }
          if (lying || rising) row.violations += jointViolations(fighter, points, { arms: true, legs: true });
          if (rising) {
            row.risingSeconds += 1 / 60;
            const touching = points.filter((at, index) => at[1] - fighter.radius[index] < CONTACT);
            const handDown = ['lHand', 'rHand'].some((name) => points[P[name]][1] - fighter.radius[P[name]] < CONTACT);
            if (handDown && pelvisHeight < 0.75 * standingPelvis && pelvisHeight > t.rise.startPelvis + 0.03) t.rise.planted = true;
            const com = centreOfMass(fighter);
            if (t.com) {
              const comVelocity = (com[1] - t.com[1]) * 60;
              row.risingFrames += 1;
              if (comVelocity > 0.05 && !overSupport(com, touching, 0.1)) row.liftedFrames += 1;
            }
            t.com = com;
            if (pelvisHeight > 0.9 * standingPelvis) {
              row.riseSeconds += elapsed - t.rise.started;
              row.stood += 1;
              if (t.rise.planted) row.planted += 1;
              t.rise = null;
              t.com = null;
            }
          } else {
            t.com = null;
            // Back down before he was up: an attempt that failed.
            if (t.rise && lying) t.rise = null;
          }
          if (!lying) t.downFor = 0;
          t.state = fighter.state;
          t.previous = points;
          t.velocity = velocity;
        });
      }
    }
    rows.push(row);
  }
  return rows;
}

export function summarise(rows) {
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  const per = (a, b) => (b > 0 ? a / b : 0);
  return {
    downJitter: per(sum('downReversals'), sum('downSeconds') * COUNT),
    risingJitter: per(sum('risingReversals'), sum('risingSeconds') * COUNT),
    restless: per(sum('restlessSum'), sum('restlessFrames')),
    rises: sum('rises'),
    early: per(sum('early'), sum('rises')),
    stood: sum('stood'),
    planted: per(sum('planted'), sum('stood')),
    lifted: per(sum('liftedFrames'), sum('risingFrames')),
    twisted: per(sum('violations'), sum('downSeconds') + sum('risingSeconds')),
    rise: per(sum('riseSeconds'), sum('stood')),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bouts = Number(process.argv[2] ?? 4);
  const seconds = Number(process.argv[3] ?? 90);
  const rows = [...riseQuality(FALL_PAIRINGS, bouts, seconds), ...riseQuality(FALL_PAIRINGS, bouts, seconds, { noPins: true })];
  for (const row of rows) {
    const one = summarise([row]);
    console.log(row.pairing.padEnd(48), Object.entries(one).map(([key, value]) => `${key} ${Number.isInteger(value) ? value : value.toFixed(2)}`).join('  '));
  }
  const show = (label, subset) => console.log(label.padEnd(48), Object.entries(summarise(subset)).map(([key, value]) => `${key} ${Number.isInteger(value) ? value : value.toFixed(2)}`).join('  '));
  show('all, held down', rows.filter((row) => !row.pairing.includes('no pins')));
  show('all, no pins', rows.filter((row) => row.pairing.includes('no pins')));
  console.log('all'.padEnd(48), Object.entries(summarise(rows)).map(([key, value]) => `${key} ${Number.isInteger(value) ? value : value.toFixed(2)}`).join('  '));
}
