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
//
// Alone (node tools/getting-up.js alone [seeds] [seconds]): each of a set of
// characters, nobody near, knocked over by a shove to the trunk (its way
// turned with the seed) and left to get up. Per character:
//   up       — share of falls he got up from within `seconds`
//   time     — mean seconds from starting to rise to standing (those who stood)
//   tries    — mean attempts (a sink back beaten and a fresh try is one more)
//   stalls   — where the failed attempts sank back (stage: count)
//   legs/W   — what both legs can push through the feet at full strength, over
//              his weight with his gear (body + armour, × g)
//   arms/W   — the same for both arms pushing (hands on the floor or a knee,
//              at WORLD.rise.pushShare)
//   budget   — per stage, what the floor could push back through what touched
//              it over his weight, mean over the stage (rising.js supportLimit,
//              with his strength then): below 1 he cannot lift himself there

import { P, PARTICLES, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, breakJoint, createWorld, deliverImpulse, placeFighter, point, WORLD } from '../src/physics.js';
import { GAIT_BUILDS } from './gait.js';
import { fighterFor } from './weapons.js';
import { jointViolations } from './anatomy.js';
import { liftMargin } from '../src/physics/rising.js';

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

// The men who get up alone: the unarmoured, the armoured, the heaviest, and
// one who should not (old and unfit in the jousting harness).
export const ALONE = {
  boxer: PRESETS.heavy,
  knight: PRESETS.knight,
  templar: PRESETS.templar,
  'samurai (tōsei)': PRESETS.odachi,
  'Tametomo (ō-yoroi)': PRESETS.tametomo,
  'Iron Pagoda': PRESETS.ironPagoda,
  'Maximilian (Stechzeug)': PRESETS.maximilian,
  kheshig: PRESETS.saberShield,
  legionary: PRESETS.legionary,
  'combat bot': PRESETS.combatBot,
  gorilla: PRESETS.gorilla,
  'old man (Stechzeug)': { ...PRESETS.passive, name: 'Old man', age: 72, exercise: 0.05, calories: 2200, outfit: { kind: 'tournament', design: 5 } },
};

/** Lying face up (the chest's normal up) at the moment he starts to rise? */
function faceUp(fighter) {
  const pelvis = point(fighter.x, P.pelvis);
  const axis = vecNorm(sub(point(fighter.x, P.neck), pelvis));
  const left = sub(point(fighter.x, P.lHip), point(fighter.x, P.rHip));
  const front = [axis[1] * left[2] - axis[2] * left[1], axis[2] * left[0] - axis[0] * left[2], axis[0] * left[1] - axis[1] * left[0]];
  return front[1] > 0;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vecNorm = (a) => {
  const length = Math.hypot(...a) || 1;
  return a.map((value) => value / length);
};

/**
 * One man knocked over with nobody near, and how he gets up. `setup(world, fighter)` is called once he is down (an
 * injury, his stamina spent). Per run: whether he stood, the time from starting to rise to standing, the attempts,
 * where failed ones sank back, the floor's budget by stage, the seconds spent in each stage (summed over attempts),
 * whether he lay face up when he started, whether a hand pressed on a knee, and whether he ended up crawling.
 */
export function riseAlone(inputs, seed, seconds = 30, { setup } = {}) {
  const world = createWorld([inputs, PRESETS.light], { seed: 700 + seed });
  const fighter = world.fighters[0];
  placeFighter(world.fighters[1], 4);
  advance(world, 0.5);
  const angle = seed * 2.4;
  const shove = fighter.body.masses.reduce((sum, mass) => sum + mass, 0) * 3.5;
  deliverImpulse({ fighter, shares: [[P.neck, 1], [P.lShoulder, 0.5], [P.rShoulder, 0.5], [P.pelvis, 0.3]], direction: [Math.cos(angle), 0.1, Math.sin(angle)], impulse: shove });
  const out = { fell: false, stood: false, time: null, tries: 0, stalls: {}, budget: {}, stages: {}, faceUp: null, braced: false, crawling: false };
  let started = null;
  let stage = null;
  let hurt = false;
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) {
    advance(world, 1 / 60);
    if (fighter.state === 'down') out.fell = true;
    if (out.fell && !hurt && setup) {
      setup(world, fighter);
      hurt = true;
    }
    if (fighter.state === 'rising' && fighter.rise) {
      if (stage === null) {
        out.tries += 1;
        out.faceUp ??= faceUp(fighter);
      }
      started ??= elapsed;
      stage = fighter.rise.stage;
      out.stages[stage] = (out.stages[stage] ?? 0) + 1 / 60;
      if (fighter.rise.braced) out.braced = true;
      const budget = fighter.riseBudget;
      if (budget) (out.budget[stage] ??= []).push(budget.support / budget.weight);
    } else if (stage !== null) {
      if (fighter.state === 'up' && !fighter.crawling) {
        out.stood = true;
        out.time = elapsed - started;
        break;
      }
      if (fighter.crawling) out.crawling = true;
      out.stalls[stage] = (out.stalls[stage] ?? 0) + 1;
      stage = null;
    }
  }
  if (fighter.crawling) out.crawling = true;
  return out;
}

export function riseAloneTable(characters = ALONE, seeds = 8, seconds = 30) {
  const STAGES = ['push', 'step', 'kneel', 'stand'];
  const rows = [];
  for (const [label, entry] of Object.entries(characters)) {
    const { inputs, setup } = entry.inputs ? entry : { inputs: entry };
    const runs = Array.from({ length: seeds }, (_, seed) => riseAlone(inputs, seed, seconds, { setup })).filter((run) => run.fell);
    const stood = runs.filter((run) => run.stood);
    const stalls = {};
    const budget = {};
    for (const run of runs) {
      for (const [stage, count] of Object.entries(run.stalls)) stalls[stage] = (stalls[stage] ?? 0) + count;
      for (const [stage, values] of Object.entries(run.budget)) (budget[stage] ??= []).push(...values);
    }
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    rows.push({
      label,
      falls: runs.length,
      up: stood.length / Math.max(1, runs.length),
      time: stood.length ? mean(stood.map((run) => run.time)) : null,
      tries: mean(runs.map((run) => run.tries)),
      up_face: mean(stood.filter((run) => run.faceUp).map((run) => run.time)),
      down_face: mean(stood.filter((run) => !run.faceUp).map((run) => run.time)),
      braced: runs.filter((run) => run.braced).length / Math.max(1, runs.length),
      crawling: runs.filter((run) => run.crawling).length / Math.max(1, runs.length),
      stages: Object.fromEntries(Object.keys(Object.assign({}, ...runs.map((run) => run.stages))).map((name) => [name, mean(runs.map((run) => run.stages[name] ?? 0))])),
      stalls,
      budget: Object.fromEntries(STAGES.filter((stage) => budget[stage]).map((stage) => [stage, mean(budget[stage])])),
    });
  }
  return rows;
}

// By build (tools/gait.js's bodies) and by injury: who gets up how fast from lying, and how.
const hurtLeg = (world, fighter) => {
  fighter.legDamage.r = 1e6;
};
export const RISE_BUILDS = {
  ...Object.fromEntries(Object.entries(GAIT_BUILDS).filter(([label]) => label !== 'gambeson')),
  // Starved further (BMI 13.5): frail.
  frail: { ...GAIT_BUILDS.starved, calories: 1500 },
  maximilian: PRESETS.maximilian,
  'average, broken arm': { inputs: GAIT_BUILDS.average, setup: (world, fighter) => breakJoint(world, fighter, 'rElbow') },
  'average, hurt leg': { inputs: GAIT_BUILDS.average, setup: hurtLeg },
  'average, broken knee': { inputs: GAIT_BUILDS.average, setup: (world, fighter) => breakJoint(world, fighter, 'rKnee') },
  'average, spent': { inputs: GAIT_BUILDS.average, setup: (world, fighter) => { fighter.stamina = 0; } },
};

export function printRiseTable(rows) {
  const fixed = (value, digits = 1) => (value === null || Number.isNaN(value) || value === undefined ? '-' : value.toFixed(digits));
  for (const row of rows) {
    const stalls = Object.entries(row.stalls).map(([stage, count]) => `${stage} ${count}`).join(', ') || '-';
    const stages = Object.entries(row.stages).map(([stage, value]) => `${stage} ${value.toFixed(2)}`).join(' ');
    console.log(`${row.label.padEnd(22)} up ${(100 * row.up).toFixed(0).padStart(3)}% of ${row.falls}  time ${fixed(row.time).padStart(4)} s (face up ${fixed(row.up_face).padStart(4)}, down ${fixed(row.down_face).padStart(4)})  tries ${row.tries.toFixed(1)}  knee-hand ${(100 * row.braced).toFixed(0)}%  crawl ${(100 * row.crawling).toFixed(0)}%  stalls ${stalls}  | ${stages}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === 'builds') {
  const seeds = Number(process.argv[3] ?? 6);
  const seconds = Number(process.argv[4] ?? 30);
  printRiseTable(riseAloneTable(RISE_BUILDS, seeds, seconds));
} else if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === 'alone') {
  const { buildBody } = await import('../src/body.js');
  const seeds = Number(process.argv[3] ?? 8);
  const seconds = Number(process.argv[4] ?? 30);
  for (const row of riseAloneTable(ALONE, seeds, seconds)) {
    const strength = liftMargin(buildBody(ALONE[row.label]));
    const stalls = Object.entries(row.stalls).map(([stage, count]) => `${stage} ${count}`).join(', ') || '-';
    const budget = Object.entries(row.budget).map(([stage, value]) => `${stage} ${value.toFixed(2)}`).join('  ');
    console.log(`${row.label.padEnd(24)} ${strength.kg.toFixed(0).padStart(4)} kg  legs/W ${strength.legs.toFixed(2)}  arms/W ${strength.arms.toFixed(2)}  up ${(100 * row.up).toFixed(0).padStart(3)}% of ${row.falls}  time ${row.time === null ? '  - ' : row.time.toFixed(1).padStart(4)} s  tries ${row.tries.toFixed(1)}  stalls ${stalls.padEnd(18)} budget ${budget}`);
  }
} else if (import.meta.url === `file://${process.argv[1]}`) {
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
