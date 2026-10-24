// The jump by build (physics/jump.js, WORLD.jump): the body's numbers (force in body weights, takeoff speed, height, flight,
// stamina) and a jump simulated on the flat (the hips' rise measured, the flight, the landing's speed, force and ratio, what
// came of it). `node tools/jump.js`.

import { PRESETS, normaliseInputs } from '../src/body.js';
import { advance, createWorld, jumpNow, placeFighter, startJump } from '../src/physics.js';
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
  console.log('\njumping down (the landing model, legs fresh): drop m -> landing m/s; each build: ratio and what comes of it (b buckle, s stumble, F falls, +x leg damage)');
  const drops = [0.5, 1, 1.5, 2, 3];
  console.log(`${'build'.padEnd(34)} ${drops.map((drop) => `${drop} m ${Math.sqrt(2 * 9.81 * drop).toFixed(1)}`.padStart(13)).join('')}`);
  for (const [name, build] of Object.entries(JUMP_BUILDS)) {
    const { me } = jumper(build);
    const cells = drops.map((drop) => {
      const l = jumpLanding(me, Math.sqrt(2 * 9.81 * drop));
      const mark = l.fall ? 'F' : l.stumble ? 's' : l.buckle ? 'b' : '';
      return `${l.ratio.toFixed(2)}${mark}${l.legDamage > 0 ? `+${l.legDamage.toFixed(1)}` : ''}`.padStart(13);
    });
    console.log(`${name.padEnd(34)} ${cells.join('')}`);
  }
}
