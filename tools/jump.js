// The jump by build (physics/jump.js, WORLD.jump): the body's numbers (force in body weights, takeoff speed, height, flight,
// stamina) and a jump simulated on the flat (the hips' rise measured, the flight, the landing's speed, force and ratio, what
// came of it). `node tools/jump.js`.

import { P, PRESETS, normaliseInputs } from '../src/body.js';
import { advance, createWorld, jumpNow, placeFighter, placeOnFloor, startJump } from '../src/physics.js';
import { createTerrain, slabOf } from '../src/physics/terrain.js';
import { directFighter, newOrders } from '../src/control.js';
import { LEVEL_PRESETS } from '../src/levelmode/presets.js';
import { jumpLanding } from '../src/physics/jump.js';

/** The builds measured: a preset, changed. */
export const JUMP_BUILDS = {
  'light athletic (Leo, 24, 75 kg)': { preset: 'light' },
  'contender (Ana, 26, 68 kg)': { preset: 'contender' },
  'average (Vinnie, 31, 82 kg)': { preset: 'street' },
  'heavy muscular (Marcus, 118 kg)': { preset: 'heavy' },
  'unfit (Dave, 34, 95 kg, 26% fat)': { preset: 'amateur' },
  'obese (Vinnie at 35% fat)': { preset: 'street', change: { bodyFat: 0.35 } },
  'old (Leo at 75)': { preset: 'light', change: { age: 75 } },
  'sumo (171 kg)': { preset: 'sumo' },
  'mail (legionary)': { preset: 'legionary' },
  'plate (knight)': { preset: 'knight' },
  'heavy plate (Maximilian)': { preset: 'maximilian' },
};

/** A fighter of the build, standing alone on the flat (with a man far off), settled; the player. */
export function jumper({ preset, change = {} }, { seed = 1 } = {}) {
  const raw = { ...structuredClone(PRESETS[preset]), ...change };
  if (change.bodyFat !== undefined) delete raw.calories;
  const world = createWorld([{ inputs: normaliseInputs(raw), corner: 'red' }, { inputs: normaliseInputs(structuredClone(PRESETS.light)), corner: 'blue' }], { seed, arena: { halfX: 30, halfZ: 30 } });
  const me = world.fighters[0];
  me.player = true;
  placeFighter(world.fighters[1], 20, 0);
  for (let index = 0; index < 90; index += 1) advance(world, 1 / 60);
  return { world, me };
}

/** One standing jump, simulated: the plan (jumpNow) and what happened. */
export function measureJump(world, me) {
  const plan = jumpNow(world, me);
  const stamina = me.stamina;
  const ok = startJump(world, me);
  let air = 0;
  for (let index = 0; index < 150 && ok; index += 1) {
    advance(world, 1 / 60);
    if (me.air) air += 1 / 60;
    if (!me.jump && index > 20) break;
  }
  const jump = world.events.filter((event) => event.kind === 'jump').at(-1);
  const land = world.events.filter((event) => event.kind === 'land').at(-1);
  return { plan, ok, jumped: Boolean(jump), rise: land?.height ?? 0, air, land, stamina: stamina - me.stamina, state: me.state };
}

/** Walk (or `run` up) to the edge of a ledge `metres` high (its edge at x = 2) and jump off it with the Jump order (the player's
 * button: control.js directFighter); `after` s once down. A build's `inputs` may be given whole (a level preset). */
export function dropOff(preset, metres, change = {}, after = 5, { run = false, inputs } = {}) {
  const raw = inputs ?? { ...structuredClone(PRESETS[preset]), ...change };
  if (change.bodyFat !== undefined) delete raw.calories;
  const terrain = createTerrain([slabOf([-10, 0], [24, 10], metres), slabOf([12, 0], [20, 20], 0)], { sea: -20 });
  const world = createWorld([{ inputs: normaliseInputs(raw), corner: 'red' }], { seed: 1, arena: { halfX: 500, halfZ: 500, open: true, terrain } });
  const me = world.fighters[0];
  me.player = true;
  placeOnFloor(me, run ? -3 : 1, 0, metres, 0);
  advance(world, 1);
  const orders = newOrders();
  let jumped = false;
  for (let t = 0; t < 4 && !(jumped && !me.jump); t += 1 / 60) {
    orders.stick = { dir: [1, 0], amount: run ? 1 : 0.5 };
    if (!jumped && me.x[P.pelvis * 3] > (run ? 1.3 : 1.85)) orders.jump = true;
    directFighter(world, me, orders, 1 / 60);
    if (me.jump) jumped = true;
    advance(world, 1 / 60);
  }
  orders.stick = null;
  for (let t = 0; t < after; t += 1 / 60) {
    directFighter(world, me, orders, 1 / 60);
    advance(world, 1 / 60);
  }
  return { world, me, landed: world.events.some((event) => event.kind === 'land' && event.speed > 2) };
}

/** The builds jumped off ledges (`node tools/jump.js`): the drop table. */
const DROP_BUILDS = {
  'light athletic': ['light'], average: ['street'], heavy: ['heavy'], obese: ['street', { bodyFat: 0.35 }], 'old (75)': ['light', { age: 75 }],
  'plate knight': ['knight'], 'the Forger': [null, {}, LEVEL_PRESETS.forger], 'Starved Rebel': ['starved'],
};

/** One drop's outcome, in a word or two: soft, buckle, stumble, fall; +BROKEN a joint broken; +OUT out of it. */
function dropOutcome(preset, metres, change, inputs, run) {
  const { world, me } = dropOff(preset, metres, change, 5, { run, inputs: inputs && normaliseInputs(structuredClone(inputs)) });
  const land = world.events.find((event) => event.kind === 'land' && event.speed > 1)?.effects.join(' ') ?? '';
  const word = land.includes('goes over') ? 'fall' : land.includes('stumbles') ? 'stumble' : land.includes('buckle') ? 'buckle' : land ? 'soft' : 'no landing';
  return `${word}${me.broken.size ? '+BROKEN' : ''}${me.state === 'out' ? '+OUT' : ''}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('the model: N both legs\' push in body weights, v takeoff m/s, h height m, flight s on the level, cost stamina (0..1)');
  console.log('simulated: rise of the hips m, s in the air, the landing: speed m/s, force asked of the legs (BW, kN), ratio (over 1 the knees buckle)\n');
  console.log('build                               kg      N     v      h  flight   cost |  rise   air  land   BW    kN  ratio  outcome');
  const f = (value, width, digits = 2) => value.toFixed(digits).padStart(width);
  for (const [name, build] of Object.entries(JUMP_BUILDS)) {
    const { world, me } = jumper(build);
    const r = measureJump(world, me);
    const p = r.plan;
    const landing = r.land ? jumpLanding(me, r.land.speed) : null;
    const outcome = r.land?.effects.join('; ') ?? (r.ok ? '' : `cannot (${p.blocked})`);
    console.log(`${name.padEnd(34)} ${f(me.body.massKg, 4, 0)} ${f(p.force, 6)} ${f(p.v, 5)} ${f(p.height, 6)} ${f(p.flight, 6)} ${f(p.cost, 6, 3)} | ${f(r.rise, 5)} ${f(r.air, 5)} ${f(r.land?.speed ?? 0, 5)} ${f(landing?.force ?? 0, 4, 1)} ${f(landing?.kN ?? 0, 5, 1)} ${f(r.land?.ratio ?? 0, 6)}  ${outcome}`);
  }
  console.log('\njumping down (the landing model, legs fresh): drop m -> landing m/s; each build: ratio and what comes of it (b buckle, s stumble, F falls, +x leg damage: a bruise, or X a fracture likely)');
  const drops = [0.5, 1, 1.5, 2, 3];
  console.log(`${'build'.padEnd(34)} ${drops.map((drop) => `${drop} m ${Math.sqrt(2 * 9.81 * drop).toFixed(1)}`.padStart(13)).join('')}`);
  for (const [name, build] of Object.entries(JUMP_BUILDS)) {
    const { me } = jumper(build);
    const cells = drops.map((drop) => {
      const l = jumpLanding(me, Math.sqrt(2 * 9.81 * drop));
      const mark = l.fall ? 'F' : l.stumble ? 's' : l.buckle ? 'b' : '';
      return `${l.ratio.toFixed(2)}${mark}${l.legDamage > 0 ? `+${l.legDamage.toFixed(1)}` : ''}${l.fracture > 0 ? 'X' : ''}`.padStart(13);
    });
    console.log(`${name.padEnd(34)} ${cells.join('')}`);
  }
  for (const run of [false, true]) {
    const heights = [0.5, 1, 1.5, 2, 2.5, 3, 4, 6];
    console.log(`\njumping off a ledge, simulated (${run ? 'at a run' : 'walking up to the edge'}; the Jump order): what came of it`);
    console.log(`${'build'.padEnd(16)}${heights.map((metres) => `${metres} m`.padStart(15)).join('')}`);
    for (const [name, [preset, change, inputs]] of Object.entries(DROP_BUILDS)) {
      console.log(`${name.padEnd(16)}${heights.map((metres) => dropOutcome(preset, metres, change, inputs, run).padStart(15)).join('')}`);
    }
  }
}
