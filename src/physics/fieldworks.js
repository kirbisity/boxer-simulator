// Fieldworks and soft ground: what a battlefield had dug, planted and soaked
// into it, as the physics meets it. A level's arena may carry `works` (the
// battle maps of Agincourt, Cerignola and Qi Jiguang's trench do; nothing here runs
// for an arena without them):
//
//  - stakes: the English archers' sharpened stakes, driven in at a slant with
//    the point at a horse's chest. A man's parts are kept out of the shaft (he
//    goes between them, slowly, sideways); a horse that runs onto a point is
//    impaled by it: the stake takes from it what speed its shaft holds against
//    (`FIELDWORKS.stake.holds`, as an impulse), and what it took went into the
//    horse as a point does (mounted.js harmHorse, through its barding), which
//    it kills or cripples as any point that deep does; past what it holds the
//    stake breaks and lies (world state, not the level's).
//  - walls: a palisade (Nagashino's umayoke-saku, the horse-stopping fence of
//    posts and rails, with gaps to sally through) or the edge of a wood (the
//    copses of Agincourt and Tramecourt, the undergrowth no horse goes through):
//    a man's parts are kept out, his steps run along it (a man walks along a
//    fence to its gap), and a horse is stopped dead against it, jolted by all
//    the speed it had into it (mounted.js jolt: past what its legs take, down).
//    Shot and arrows go through a palisade's rails, and a spear over and between them.
//  - ditches: a ditch dug with its spoil thrown up into a bank (Cerignola's),
//    as the height of the ground across it (`profile`). The ground is the floor
//    there (physics.js floorUnder, the stance's lift): a man goes down into it
//    and climbs out, slowly as the slope is steep; a horse does not go where the
//    ground falls or rises more than a step at its chest's front, and is
//    stopped at the lip (at a gallop, brought down into it).
//  - soft ground (mud, a stream's bed): a man sinks into it as hard as he presses
//    on it (Bekker's sinkage: deeper the heavier he is, with all his armour, over
//    the soles of his feet; never past the firm layer under it), and it holds his
//    legs as standing water holds them (levelmode/water.js wadeDrag, by how deep he
//    is in it and how thick it is), tires him as he lifts himself out at every step (`slogCost`), takes away
//    footing (`footing`: wet clay grips a foot about as well as ice grips a boot,
//    so a shove puts him down sooner), and his feet stand on the firm ground under
//    it (his stance lowered: drawn, his legs go into the mud; any water standing over the mud, `water`, is over his feet too, and is drawn, rung and splashed as
//    the castle's standing water is: worksview.js). Lying in it, a man
//    presses on it over his whole body and sinks little; face down in it, or
//    under the weight of the men piled on him, he cannot breathe (`smother`).
//    A horse sinks by the pressure under its hooves, and is held by it the same way.
//
// The level gives the works as data (`arena.works`: see `compileWorks` for every
// field); they are compiledWorks once per arena (a WeakMap: the arena is shared by
// every world of a level) and what the battle does to them (a broken stake) is the
// world's (`world.worksState`). Numbers are physical and named here.

import { P, PARTICLES } from '../body.js';
import { wadeDrag } from '../levelmode/water.js';
import { BARDING } from '../horses.js';
import { WORLD } from './config.js';
import { knockOut } from '../physics.js';

export const FIELDWORKS = {
  stake: {
    // An archer's stake: about six feet of green ash or oak "as thick as a man's arm" (~8 cm), sharpened at both ends,
    // driven in a foot and a half at a slant so the upper point stood at a horse's chest. `radius` m of the shaft.
    radius: 0.04,
    // What a stake takes along its line before it gives (buckles, splits, or tears out of soft ground), as an
    // impulse (N·s): an 8 cm shaft 1.4 m out of the ground buckles at ~25 kN (Euler, green wood E ~10 GPa, a
    // post fixed at its foot; ~8 kN for a 6 cm one), over the ~0.15 s a horse's chest takes to drive onto it.
    // Across its line it bends and snaps at a tenth of that (`across`).
    holds: 3600,
    across: 0.1,
    // The part of a horse's front a point meets: chest and neck (the capsules horses.js names), within `reach` m
    // of their surface; the energy a stake's point drives in that counts as the point's (`pierce`), the rest a
    // blow (`blunt`).
    pierce: 0.8,
    blunt: 0.2,
    // A broken stake lies over flat; a horse or a man passes it.
  },
  wall: {
    // A man's part is kept this far (m) from a wall's line beyond its own radius (half a post's thickness).
    thick: 0.08,
    // His steps along a wall: within `near` m of it, his step into it is turned along it (all of it at `touch` m).
    near: 0.9,
    touch: 0.35,
    // His root (where his stance stands) kept this far off a wall.
    root: 0.32,
  },
  horse: {
    // The ground at a horse's front falling or rising more than this (m) is a ditch's lip or a bank's face: it is stopped there.
    step: 0.45,
    // How far ahead of its middle, as a share of its height at the withers, the front of its chest is.
    front: 0.6,
    // A stop faster than this (m/s) is told as an event (a horse run into it, not pressing on it).
    told: 1,
    // A horse will not run onto what it sees before it if it can stop short of it (horseBalks): stake points within
    // `lane` m of its line, a wall, a ditch's lip or a bank's face, looked for up to `look` m ahead; it pulls up to stand
    // `short` m off it, braking as hard as it can (its acceleration × `brake`: a horse sits back on its hocks). One
    // galloping at it from too close to stop is committed, and runs on into it. (A gallop's stopping distance is ~10 m.)
    look: 14,
    lane: 0.7,
    short: 0.5,
    brake: 1.4,
  },
  climb: {
    // A slope slows a man by its grade along his way (rise over run): to 1 / (1 + up × grade) going up, and
    // 1 / (1 + down × grade) going down (a steep bank is climbed with the hands, at a third of a walk at 45 degrees).
    up: 2,
    down: 0.8,
    // The grade is read this far (m) either side of where he stands.
    span: 0.35,
  },
  mud: {
    // Bekker's sinkage, z = depth × (p / pressure)^exponent: a mud's `depth` (m) is how far a man pressing on it
    // `pressure` (Pa) sinks, deeper as he presses harder, to the firm layer `firm` m down (a ploughed field's pan,
    // a stream's gravel). The reference: an 80 kg man with his kit on one foot of ~0.03 m² (he walks on one).
    // The exponent: soft saturated clay, between linear and a square (n ~ 0.8: 1/n).
    footArea: 0.03,
    pressure: 80 * 9.81 / 0.03,
    exponent: 1.25,
    // A horse's hoof, ~13 cm across (0.013 m²), two of its four on the ground at a walk and a trot.
    hoofArea: 0.013,
    hoofs: 2,
    // A horse's leg against a man's: it sinks into the table of levelmode/config.js wade as a man of this height
    // per m of its withers (its leg to the elbow is ~0.6 of the withers, a man's to the hip ~0.53 of his height).
    horseHeight: 1.98,
    // Lying in it, a man presses on it over his whole length (~0.5 m²): he sinks this share of the depth his feet do,
    // by the parts that bear on it (his knees and hands bear harder: on his knees or rising he sinks them in).
    lying: 0.12,
    knee: 0.5,
    hand: 0.4,
    // How fast a man's stance goes down into it as he steps in, and comes up as he steps out (m/s).
    sinkRate: 0.8,
    // A foot stepping into deeper mud goes down at most this far (m) below where his stance has sunk to yet.
    stride: 0.06,
    // A step's length (m) in it, and the pace (m/s) from which slogging through it is labour (fieldworks.js slogCost).
    step: 0.65,
    labour: 0.3,
    // From the edge of a soft place its depth grows over `edge` m (the field's mud thins out at the hedge).
    edge: 1.2,
  },
  smother: {
    // A man lying face down (his chest's normal this near straight down) with his face in the mud (his head's
    // middle less than `mouth` m over the mud's surface), or with more than `pile` kg of other men lying or
    // standing on his trunk (compressive asphyxia: the crushes of Agincourt's heaps, of a crowd), draws no breath.
    prone: 0.5,
    mouth: 0.12,
    pile: 140,
    // Within `on` m across of his trunk's middle and higher than it, a part of another man is on him.
    on: 0.35,
    // Unable to breathe for `seconds` he loses consciousness (after heavy exertion a man holds his breath far less
    // than at rest: 20–40 s), and does not come round there. Breathing again, it is made good `recover` times as fast.
    seconds: 30,
    recover: 3,
    // Looked at this often (s).
    every: 0.25,
  },
};

const compiledWorks = new WeakMap();

/**
 * The works of an arena, compiledWorks (null for an arena without `works`). The level's data:
 * - `stakes`: lines of stakes, each { from: [x, z], to: [x, z], rows, every (m along), rowGap (m back from
 *   the line, a row each), toward (+1 or -1: the way along x the points lean, at the enemy), height (m, the
 *   point's), reach (m, the point's lean out ahead of its foot), stagger (share of `every` each row shifts) }.
 * - `walls`: { points: [[x, z], ...] (a line through them), height (m), kind ('palisade' | 'wood'),
 *   gaps: [[from, to], ...] (m along the line where it is open) }.
 * - `ditches`: { from: [x, z], to: [x, z] (its line), profile: [[offset, height], ...] (m across the line, to its
 *   left looking from `from` to `to`; the ground's height there, 0 beyond the ends of the profile) }.
 * - `soft`: { x: [x0, x1], z: [z0, z1], depth (m, the reference man's sinkage), firm (m, the layer under it),
 *   viscosity (as water's: 1 water, ~2 the cesspool's sludge), footing (share of his grip left), surface ('mud' |
 *   'water': the ear's), water (m of standing water over it), edge (m it deepens over from its sides) }.
 */
export function worksOf(arena) {
  const spec = arena?.works;
  if (!spec) return null;
  let works = compiledWorks.get(spec);
  if (!works) {
    works = compileWorks(spec);
    compiledWorks.set(spec, works);
  }
  return works;
}

function compileWorks(spec) {
  const stakes = [];
  for (const line of spec.stakes ?? []) {
    const dx = line.to[0] - line.from[0];
    const dz = line.to[1] - line.from[1];
    const length = Math.hypot(dx, dz) || 1;
    const count = Math.max(1, Math.floor(length / line.every) + 1);
    for (let row = 0; row < (line.rows ?? 1); row += 1) {
      const shift = ((row % 2) * (line.stagger ?? 0.5)) * line.every;
      for (let k = 0; k < count; k += 1) {
        const along = Math.min(length, k * line.every + shift);
        const foot = [line.from[0] + (dx * along) / length - line.toward * row * line.rowGap, line.from[1] + (dz * along) / length];
        const tip = [foot[0] + line.toward * line.reach, line.height, foot[1]];
        stakes.push({ id: stakes.length, foot, tip });
      }
    }
  }
  const walls = [];
  for (const wall of spec.walls ?? []) {
    const points = wall.points;
    let along = 0;
    for (let k = 0; k + 1 < points.length; k += 1) {
      const a = points[k];
      const b = points[k + 1];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // The gaps of the whole line cut this piece into the stretches that stand.
      let pieces = [[0, length]];
      for (const [g0, g1] of wall.gaps ?? []) {
        const from = g0 - along;
        const to = g1 - along;
        pieces = pieces.flatMap(([p0, p1]) => (to <= p0 || from >= p1 ? [[p0, p1]] : [[p0, Math.max(p0, from)], [Math.min(p1, to), p1]].filter(([s, e]) => e - s > 0.05)));
      }
      for (const [p0, p1] of pieces) {
        const ux = (b[0] - a[0]) / length;
        const uz = (b[1] - a[1]) / length;
        walls.push({ a: [a[0] + ux * p0, a[1] + uz * p0], b: [a[0] + ux * p1, a[1] + uz * p1], u: [ux, uz], length: p1 - p0, height: wall.height ?? 2, kind: wall.kind ?? 'palisade' });
      }
      along += length;
    }
  }
  const ditches = (spec.ditches ?? []).map((ditch) => {
    const dx = ditch.to[0] - ditch.from[0];
    const dz = ditch.to[1] - ditch.from[1];
    const length = Math.hypot(dx, dz) || 1;
    return { from: ditch.from, u: [dx / length, dz / length], left: [dz / length, -dx / length], length, profile: ditch.profile };
  });
  const soft = (spec.soft ?? []).map((area) => ({ surface: 'mud', viscosity: 2, footing: 0.7, firm: 0.5, water: 0, ...area }));
  // A box round everything, to pass over a man far from all of it at once.
  const xs = [];
  const zs = [];
  for (const stake of stakes) xs.push(stake.foot[0], stake.tip[0]), zs.push(stake.foot[1]);
  for (const wall of walls) xs.push(wall.a[0], wall.b[0]), zs.push(wall.a[1], wall.b[1]);
  const near = xs.length ? { x: [Math.min(...xs) - 1.5, Math.max(...xs) + 1.5], z: [Math.min(...zs) - 1.5, Math.max(...zs) + 1.5] } : null;
  return { stakes, walls, ditches, soft, near, spec };
}

/** The world's own state of its works: which stakes are broken. */
function worksStateOf(world) {
  world.worksState ??= { broken: new Set(), smother: 0 };
  return world.worksState;
}

/** Whether a stake still stands in this world. */
export const stakeStanding = (world, stake) => !worksStateOf(world).broken.has(stake.id);

// ---- The ground: relief and soft places --------------------------------------------------

/** The height of the ground at (x, z) the ditches and banks make (0 where there are none). */
export function reliefAt(works, x, z) {
  if (!works?.ditches.length) return 0;
  let height = 0;
  for (const ditch of works.ditches) {
    const rx = x - ditch.from[0];
    const rz = z - ditch.from[1];
    const along = rx * ditch.u[0] + rz * ditch.u[1];
    if (along < 0 || along > ditch.length) continue;
    const across = rx * ditch.left[0] + rz * ditch.left[1];
    const profile = ditch.profile;
    if (across <= profile[0][0] || across >= profile[profile.length - 1][0]) continue;
    for (let k = 1; k < profile.length; k += 1) {
      if (across > profile[k][0]) continue;
      const [o0, h0] = profile[k - 1];
      const [o1, h1] = profile[k];
      height += h0 + ((h1 - h0) * (across - o0)) / (o1 - o0);
      break;
    }
  }
  return height;
}

/** The soft place at (x, z) and how far into it (1 well inside, less within its `edge`), or null. */
export function softAt(works, x, z) {
  if (!works?.soft.length) return null;
  for (const area of works.soft) {
    const inside = Math.min(x - area.x[0], area.x[1] - x, z - area.z[0], area.z[1] - z);
    if (inside <= 0) continue;
    return { area, share: Math.min(1, inside / (area.edge ?? FIELDWORKS.mud.edge)) };
  }
  return null;
}

/** The water standing over a soft place's surface where `soft` ({ area, share }: softAt) is (m; 0 for dry-surfaced mud): the film a night's rain left on the field. */
export function standingWater(soft) {
  return soft ? (soft.area.water ?? 0) * soft.share : 0;
}

/** How deep (m) a load `kg` pressing on `area` m² sinks into a soft place, to its firm layer. */
export function sinkage(area, kg, contact = FIELDWORKS.mud.footArea) {
  const spec = FIELDWORKS.mud;
  const pressure = (kg * WORLD.gravity) / contact;
  return Math.min(area.firm, area.depth * (pressure / spec.pressure) ** spec.exponent);
}

/** How deep a man's feet go into the soft ground under (x, z), all he carries pressing on one foot (0 off it). */
export function footSink(works, fighter, x, z) {
  const soft = softAt(works, x, z);
  if (!soft) return 0;
  return sinkage(soft.area, fighter.body.massKg + (fighter.weapon?.spec.mass ?? 0)) * soft.share;
}

// The parts that bear on the ground as he lies or kneels, and how hard (FIELDWORKS.mud): his feet his whole weight, his knees and hands much of it.
const WORKS_BEARING = PARTICLES.map((name, index) => (index === P.lFoot || index === P.rFoot ? 1 : index === P.lKnee || index === P.rKnee ? 'knee' : index === P.lHand || index === P.rHand ? 'hand' : 'lying'));

/**
 * The floor under a man's part `index` at (x, z): the ground's relief, less how far that part sinks into soft
 * ground there (his feet as far as his weight drives them, the rest of him lying on it far less).
 */
export function floorFor(works, fighter, index, x, z) {
  let floor = reliefAt(works, x, z);
  if (!works.soft.length) return floor;
  const soft = softAt(works, x, z);
  if (!soft) return floor;
  const bearing = WORKS_BEARING[index];
  const share = bearing === 1 ? 1 : FIELDWORKS.mud[bearing];
  floor -= sinkage(soft.area, fighter.body.massKg + (fighter.weapon?.spec.mass ?? 0)) * soft.share * share;
  return floor;
}

/** The floor for something lying loose on the ground (a dropped weapon, a prop): the relief, and the mud's lying sink. */
export function looseFloor(works, x, z) {
  const soft = softAt(works, x, z);
  return reliefAt(works, x, z) - (soft ? soft.area.depth * soft.share * FIELDWORKS.mud.lying : 0);
}

/** The ear's name for the ground at (x, z): the soft place's surface ('mud', 'water'), or null where the works say nothing. */
export function worksSurface(works, x, z) {
  return softAt(works, x, z)?.area.surface ?? null;
}

// ---- A man on the works: his stance, his steps, his parts ----------------------------

/**
 * Each step, for each man on his feet in a world with works: how deep his stance stands (`fighter.lift`: the relief
 * under him less how far his feet are sunk, sinking and rising at FIELDWORKS.mud.sinkRate), and what the soft ground
 * does to his legs: his footwork and acceleration held as levelmode wading holds them (`fighter.wading`, which
 * physics.js, gait.js and rising.js read already), his footing (`fighter.mired.footing`, checkBalance's), and the
 * wind it costs him to move in it.
 */
export function mireStep(world, dt) {
  const works = worksOf(world.arena);
  if (!works) return;
  for (const fighter of world.fighters) {
    if (fighter.dormant || fighter.mount) {
      fighter.mired = null;
      continue;
    }
    const [x, z] = fighter.root;
    const soft = works.soft.length ? softAt(works, x, z) : null;
    const sink = soft ? sinkage(soft.area, fighter.body.massKg + (fighter.weapon?.spec.mass ?? 0)) * soft.share : 0;
    const mired = (fighter.mired ??= { sunk: 0, footing: 1 });
    const rate = FIELDWORKS.mud.sinkRate * dt;
    mired.sunk += Math.max(-rate, Math.min(rate, sink - mired.sunk));
    mired.footing = soft ? 1 - (1 - soft.area.footing) * soft.share : 1;
    // (A jump holds the stance itself; a rider's is the saddle's.)
    if (!fighter.jump) {
      fighter.lift = reliefAt(works, x, z) - mired.sunk;
      plantOnWorks(works, fighter, mired.sunk);
    }
    mireHoldLegs(fighter, soft, mired.sunk, dt);
  }
  smotherStep(world, works, dt);
}

/**
 * Each foot's floor (physics.js rawFootTarget reads `foot.floor`, and a step's `floorFrom` and `floorTo`, as the height its
 * sole stands at): the relief where it stands or is stepping to, less how far it is sunk there (no further than the stance
 * has yet gone down, and a little: a man stepping into the mud does not stand on one straight leg). Down or getting up,
 * both on the stance's floor (as on terrain).
 */
function plantOnWorks(works, fighter, sunk) {
  const feet = fighter.feet;
  if (fighter.state !== 'up' || fighter.crawling) {
    feet.l.floor = feet.r.floor = fighter.lift;
    return;
  }
  const floorAt = (at) => reliefAt(works, at[0], at[2]) - Math.min(footSink(works, fighter, at[0], at[2]), sunk + FIELDWORKS.mud.stride);
  for (const foot of [feet.l, feet.r]) {
    if (foot.lifted) continue;
    if (foot.step) {
      foot.step.floorFrom ??= foot.floor ?? floorAt(foot.step.from);
      foot.step.floorTo = floorAt(foot.step.to);
    } else foot.floor = floorAt(foot.planted);
  }
}

/** The soft ground's hold on his legs, as standing water's (levelmode/level.js wadeGear, which does not run in a battle). */
function mireHoldLegs(fighter, soft, sunk, dt) {
  const gear = fighter.body.gear;
  if (fighter.wading && fighter.wading.gear !== gear) fighter.wading = null;
  // (What stands on the mud, `water` m, is over his feet as much as the mud he is sunk in.)
  const drag = soft && sunk > 0 ? wadeDrag(soft.area, sunk + standingWater(soft), fighter.body.heightM) : null;
  const held = drag && drag.foot < 1 ? drag : null;
  let wading = fighter.wading;
  if (held) {
    if (!wading) wading = fighter.wading = { gear, base: { foot: gear.foot, accel: gear.accel }, set: null, drag: held, act: 1, mud: true };
    else if (wading.set && (gear.foot !== wading.set.foot || gear.accel !== wading.set.accel)) wading.base = { foot: gear.foot, accel: gear.accel };
    gear.foot = (wading.base.foot ?? 1) * held.foot;
    gear.accel = (wading.base.accel ?? 1) * held.accel;
    wading.set = { foot: gear.foot, accel: gear.accel };
    wading.drag = held;
    wading.act = held.act;
    if (dt > 0 && fighter.state === 'up') fighter.stamina = Math.max(0, fighter.stamina - slogCost(fighter, sunk) * dt);
  } else if (wading?.mud) {
    if (gear.foot === wading.set.foot && gear.accel === wading.set.accel) {
      gear.foot = wading.base.foot;
      gear.accel = wading.base.accel;
    }
    fighter.wading = null;
  }
}

/**
 * What slogging through mud costs a man a second, in stamina: at every step he lifts all he weighs, armour and all, up
 * out of the hole his foot sank into (m g z a step, FIELDWORKS.mud.step m to a step at his pace), the work counted as a
 * jump's is (WORLD.jump: `cost` of stamina for `workRef` J), over his wind; and it is hard labour, as a run is, so he gets
 * only a run's share of his recovery while he is at it (WORLD.runMode.recovery: the rest of it is taken back here).
 * An 80 kg archer calf-deep at a walk nearly holds his own; a man in plate knee-deep is spent in a minute or two.
 */
export function slogCost(fighter, sunk) {
  const speed = Math.hypot(fighter.rootVelocity?.[0] ?? 0, fighter.rootVelocity?.[1] ?? 0);
  if (speed < 0.05 || sunk <= 0) return 0;
  const aerobic = fighter.body.aerobic || 1;
  const steps = speed / FIELDWORKS.mud.step;
  const work = steps * fighter.body.massKg * WORLD.gravity * sunk * (WORLD.jump.cost / WORLD.jump.workRef) / aerobic;
  const labour = Math.min(1, speed / FIELDWORKS.mud.labour);
  const forgone = (1 - WORLD.runMode.recovery) * WORLD.staminaRecovery * aerobic * labour;
  return work + forgone;
}

/**
 * The share of a man's step along `wanted` ([vx, vz]) the ground lets him make (a slope's grade along it: FIELDWORKS.climb),
 * and the step turned along a wall he would walk into (within `wall.near` m of it, more as he nears it: a man at a fence
 * walks along it). Returns the step to take.
 */
export function stepOnWorks(works, fighter, wanted) {
  let [vx, vz] = wanted;
  const speed = Math.hypot(vx, vz);
  if (speed < 1e-6) return wanted;
  const [x, z] = fighter.root;
  if (works.ditches.length) {
    const spec = FIELDWORKS.climb;
    const ux = vx / speed;
    const uz = vz / speed;
    const grade = (reliefAt(works, x + ux * spec.span, z + uz * spec.span) - reliefAt(works, x - ux * spec.span, z - uz * spec.span)) / (2 * spec.span);
    const share = 1 / (1 + (grade > 0 ? spec.up * grade : -spec.down * grade));
    vx *= share;
    vz *= share;
  }
  const spec = FIELDWORKS.wall;
  for (const wall of works.walls) {
    const near = nearestOnWall(wall, x, z);
    if (near.distance > spec.near) continue;
    // Into it (toward its line): that much of the step is turned along it, all of it at `touch`.
    const nx = (x - near.at[0]) / (near.distance || 1);
    const nz = (z - near.at[1]) / (near.distance || 1);
    const into = -(vx * nx + vz * nz);
    if (into <= 0) continue;
    const share = Math.min(1, Math.max(0, (spec.near - near.distance) / (spec.near - spec.touch)));
    vx += nx * into * share;
    vz += nz * into * share;
    // What he wanted into it goes along it instead, toward the nearer end of this stretch (a gap, or where the wall stops),
    // the way he chose kept while he is at this wall (a man feeling along a fence for its gap does not turn back and forth).
    const kept = fighter.alongWall?.wall === wall ? fighter.alongWall.way : null;
    const way = kept ?? (near.t < wall.length / 2 ? -1 : 1);
    fighter.alongWall = { wall, way };
    // (Nor back the other way along it: what his step had that way is given up as he nears it.)
    const back = vx * wall.u[0] + vz * wall.u[1];
    if (back * way < 0) {
      vx -= wall.u[0] * back * share;
      vz -= wall.u[1] * back * share;
    }
    vx += wall.u[0] * way * into * share;
    vz += wall.u[1] * way * into * share;
  }
  return [vx, vz];
}

/**
 * How far a man at `from` ([x, z]) has to go to reach `to` on his feet: straight there (over a ditch and its bank, as
 * far as the climbing makes it), or, with a wall across the way (a palisade, a wood's edge), round the nearer end of it
 * (a gap, or where it stops). What a man behind a palisade
 * weighs when he asks whether the enemy beyond it can get at him (ai.js: a gun reloaded behind the fence).
 */
export function walkingDistance(world, from, to) {
  const works = worksOf(world.arena);
  const straight = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (!works) return straight;
  // Over a ditch and its bank, each stretch as long as its slope makes it to walk (FIELDWORKS.climb, as stepOnWorks slows him).
  let longest = works.ditches.length ? climbedDistance(works, from, to) : straight;
  for (const wall of works.walls) {
    if (!wallCrosses(from, to, wall.a, wall.b)) continue;
    const round = (end) => Math.hypot(end[0] - from[0], end[1] - from[1]) + Math.hypot(to[0] - end[0], to[1] - end[1]);
    longest = Math.max(longest, Math.min(round(wall.a), round(wall.b)));
  }
  return longest;
}

/**
 * The way from `from` to `to` straight over the relief: its length, and for the stretch of it across each ditch's
 * profile, each `span` m of that lengthened as its slope slows a man (FIELDWORKS.climb). Only the stretch over a ditch is
 * sampled: a line that does not cross one costs no more than its length.
 */
function climbedDistance(works, from, to) {
  const spec = FIELDWORKS.climb;
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  let total = length;
  for (const ditch of works.ditches) {
    const across = (p) => (p[0] - ditch.from[0]) * ditch.left[0] + (p[1] - ditch.from[1]) * ditch.left[1];
    const a = across(from);
    const b = across(to);
    const low = ditch.profile[0][0];
    const high = ditch.profile[ditch.profile.length - 1][0];
    if (Math.max(a, b) <= low || Math.min(a, b) >= high || Math.abs(b - a) < 1e-9) continue;
    // The shares of the way where it enters and leaves the profile.
    const t0 = Math.max(0, Math.min(1, ((a < b ? low : high) - a) / (b - a)));
    const t1 = Math.max(0, Math.min(1, ((a < b ? high : low) - a) / (b - a)));
    const stretch = length * Math.abs(t1 - t0);
    const steps = Math.max(1, Math.ceil(stretch / spec.span));
    const at = (t) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    let before = reliefAt(works, ...at(Math.min(t0, t1)));
    for (let k = 1; k <= steps; k += 1) {
      const here = reliefAt(works, ...at(Math.min(t0, t1) + (Math.abs(t1 - t0) * k) / steps));
      const grade = (here - before) / (stretch / steps);
      total += (stretch / steps) * (grade > 0 ? spec.up * grade : -spec.down * grade);
      before = here;
    }
  }
  return total;
}

/** Whether the segments p-q and a-b cross (on the floor). */
function wallCrosses(p, q, a, b) {
  const side = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
  return side(p, q, a) * side(p, q, b) < 0 && side(a, b, p) * side(a, b, q) < 0;
}

/** A man's root (where his stance stands) kept off the walls. */
export function keepRootOff(works, fighter) {
  if (!works.walls.length) return;
  const spec = FIELDWORKS.wall;
  for (const wall of works.walls) {
    const near = nearestOnWall(wall, fighter.root[0], fighter.root[1]);
    if (near.distance >= spec.root) continue;
    const scale = near.distance > 1e-6 ? spec.root / near.distance : 0;
    const side = near.distance > 1e-6 ? [fighter.root[0] - near.at[0], fighter.root[1] - near.at[1]] : [-wall.u[1] * spec.root, wall.u[0] * spec.root];
    fighter.root = [near.at[0] + side[0] * (scale || 1), near.at[1] + side[1] * (scale || 1)];
  }
}

/** The nearest point of a wall to (x, z), and how far. */
function nearestOnWall(wall, x, z) {
  const t = Math.max(0, Math.min(wall.length, (x - wall.a[0]) * wall.u[0] + (z - wall.a[1]) * wall.u[1]));
  const at = [wall.a[0] + wall.u[0] * t, wall.a[1] + wall.u[1] * t];
  return { at, distance: Math.hypot(x - at[0], z - at[1]), t };
}

/** The nearest point of a stake's shaft (foot to tip) to a point, and how far. */
function nearestOnStake(stake, px, py, pz) {
  const ax = stake.foot[0];
  const az = stake.foot[1];
  const dx = stake.tip[0] - ax;
  const dy = stake.tip[1];
  const dz = stake.tip[2] - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + py * dy + (pz - az) * dz) / (dx * dx + dy * dy + dz * dz)));
  const at = [ax + dx * t, dy * t, az + dz * t];
  return { at, distance: Math.hypot(px - at[0], py - at[1], pz - at[2]) };
}

/**
 * Each substep, a man's parts against the stakes and the walls (after the ground): a part in a stake's shaft or a
 * wall is put back out of it, its motion into it gone (as at the arena's edge), along it kept.
 */
export function collideWorks(world, fighter) {
  const works = worksOf(world.arena);
  if (!works?.near || fighter.mount) return;
  const pelvis = P.pelvis * 3;
  const hx = fighter.x[pelvis];
  const hz = fighter.x[pelvis + 2];
  if (hx < works.near.x[0] || hx > works.near.x[1] || hz < works.near.z[0] || hz > works.near.z[1]) return;
  const wallSpec = FIELDWORKS.wall;
  const stakeRadius = FIELDWORKS.stake.radius;
  for (let index = 0; index < PARTICLES.length; index += 1) {
    const base = index * 3;
    const radius = fighter.radius[index];
    for (const wall of works.walls) {
      if (fighter.x[base + 1] - radius > wall.height) continue;
      const near = nearestOnWall(wall, fighter.x[base], fighter.x[base + 2]);
      const keep = radius + wallSpec.thick;
      if (near.distance >= keep) continue;
      // Which side he is on: where the part was before this substep.
      const before = nearestOnWall(wall, fighter.prev[base], fighter.prev[base + 2]);
      let nx = fighter.prev[base] - before.at[0];
      let nz = fighter.prev[base + 2] - before.at[1];
      const size = Math.hypot(nx, nz) || 1;
      nx /= size;
      nz /= size;
      pushWorksPart(fighter, base, near.at[0] + nx * keep, near.at[1] + nz * keep, nx, nz);
    }
    for (const stake of works.stakes) {
      if (Math.abs(fighter.x[base] - stake.foot[0]) > 1.6 || Math.abs(fighter.x[base + 2] - stake.foot[1]) > 1.6) continue;
      if (!stakeStanding(world, stake)) continue;
      const near = nearestOnStake(stake, fighter.x[base], fighter.x[base + 1], fighter.x[base + 2]);
      const keep = radius + stakeRadius;
      if (near.distance >= keep) continue;
      const nx = fighter.x[base] - near.at[0];
      const nz = fighter.x[base + 2] - near.at[2];
      const flat = Math.hypot(nx, nz);
      if (flat < 1e-6) continue;
      pushWorksPart(fighter, base, near.at[0] + (nx / flat) * keep, near.at[2] + (nz / flat) * keep, nx / flat, nz / flat);
    }
  }
}

/** A part put at (x, z), its motion along -n (into what it met) taken away. */
function pushWorksPart(fighter, base, x, z, nx, nz) {
  let vx = fighter.x[base] - fighter.prev[base];
  let vz = fighter.x[base + 2] - fighter.prev[base + 2];
  const into = vx * nx + vz * nz;
  if (into < 0) {
    vx -= into * nx;
    vz -= into * nz;
  }
  fighter.x[base] = x;
  fighter.x[base + 2] = z;
  fighter.prev[base] = x - vx;
  fighter.prev[base + 2] = z - vz;
}

// ---- Smothering ----------------------------------------------------------------------

/**
 * A man down (not standing, not yet out) who cannot breathe: face down in mud, or under the weight of men piled on his
 * trunk (FIELDWORKS.smother). His breathless seconds mount while it lasts and are made good when it ends; past
 * `seconds` he is out (knocked out where he lies: physics.js knockOut, as 'smothered').
 */
function smotherStep(world, works, dt) {
  const state = worksStateOf(world);
  state.smother += dt;
  const spec = FIELDWORKS.smother;
  if (state.smother < spec.every) return;
  const span = state.smother;
  state.smother = 0;
  for (const fighter of world.fighters) {
    if (fighter.state === 'up' || fighter.state === 'out' || fighter.mount || fighter.dormant) {
      if (fighter.breathless) fighter.breathless = Math.max(0, fighter.breathless - span * spec.recover);
      continue;
    }
    const why = smothering(world, works, fighter);
    if (!why) {
      if (fighter.breathless) fighter.breathless = Math.max(0, fighter.breathless - span * spec.recover);
      continue;
    }
    fighter.breathless = (fighter.breathless ?? 0) + span;
    if (fighter.breathless >= spec.seconds) {
      const event = { time: world.time, kind: 'smothered', fighter: fighter.id, attacker: fighter.lastHitBy ?? fighter.lastWoundedBy ?? fighter.id, point: [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 1], fighter.x[P.pelvis * 3 + 2]], effects: [why] };
      world.events.push(event);
      // Out of the fight where he lies: no one comes round under the heap or face down in the mud.
      knockOut(world, fighter, event, why, 'killed');
    }
  }
}

/** Why a man down cannot breathe ('face down in the mud', 'crushed under the press'), or null. */
export function smothering(world, works, fighter) {
  const spec = FIELDWORKS.smother;
  const x = fighter.x;
  const head = P.head * 3;
  const soft = works?.soft.length ? softAt(works, x[head], x[head + 2]) : null;
  if (soft && x[head + 1] - reliefAt(works, x[head], x[head + 2]) < spec.mouth) {
    // His chest's way: across the shoulders × up the spine; face down if it points at the ground.
    const spine = [x[P.neck * 3] - x[P.pelvis * 3], x[P.neck * 3 + 1] - x[P.pelvis * 3 + 1], x[P.neck * 3 + 2] - x[P.pelvis * 3 + 2]];
    const across = [x[P.lShoulder * 3] - x[P.rShoulder * 3], x[P.lShoulder * 3 + 1] - x[P.rShoulder * 3 + 1], x[P.lShoulder * 3 + 2] - x[P.rShoulder * 3 + 2]];
    // (Left × spine is his back's way in this body's frame: forward is its negative.)
    const back = [across[1] * spine[2] - across[2] * spine[1], across[2] * spine[0] - across[0] * spine[2], across[0] * spine[1] - across[1] * spine[0]];
    const size = Math.hypot(...back) || 1;
    if (back[1] / size > spec.prone) return 'face down in the mud';
  }
  const mid = [(x[P.pelvis * 3] + x[P.neck * 3]) / 2, (x[P.pelvis * 3 + 1] + x[P.neck * 3 + 1]) / 2, (x[P.pelvis * 3 + 2] + x[P.neck * 3 + 2]) / 2];
  let kg = 0;
  for (const other of world.fighters) {
    if (other === fighter || other.mount || other.dormant) continue;
    if (Math.abs(other.x[P.pelvis * 3] - mid[0]) > 1.2 || Math.abs(other.x[P.pelvis * 3 + 2] - mid[2]) > 1.2) continue;
    for (let index = 0; index < PARTICLES.length; index += 1) {
      const base = index * 3;
      if (other.x[base + 1] <= mid[1]) continue;
      if (Math.hypot(other.x[base] - mid[0], other.x[base + 2] - mid[2]) > spec.on) continue;
      // A standing man's weight is on his feet: only a part low over the trunk (within a forearm of it) bears on it.
      if (other.x[base + 1] - mid[1] > 0.35) continue;
      kg += other.body.masses[index];
    }
  }
  return kg > spec.pile ? 'crushed under the press' : null;
}

// ---- Horses on the works -----------------------------------------------------------------

/** A horse's laden weight on its hooves (kg): the horse and its armour, and its rider with all he carries. */
function worksHorseKg(world, horse) {
  const rider = horse.rider === null ? null : world.fighters[horse.rider];
  return horse.mass + (rider?.mount === horse ? rider.body.massKg + (rider.weapon?.spec.mass ?? 0) : 0);
}

/**
 * How deep a horse stands in soft ground (m) and the share of its pace its legs have left there (1 on firm ground):
 * its laden weight over two hooves (FIELDWORKS.mud), held as a man of `horseHeight` per m of its withers would be.
 */
export function horseMire(world, horse) {
  const works = worksOf(world.arena);
  const soft = works?.soft.length ? softAt(works, horse.at[0], horse.at[1]) : null;
  if (!soft) return { sunk: 0, pace: 1 };
  const spec = FIELDWORKS.mud;
  const sunk = sinkage(soft.area, worksHorseKg(world, horse) / spec.hoofs, spec.hoofArea) * soft.share;
  const drag = wadeDrag(soft.area, sunk + standingWater(soft), horse.withers * spec.horseHeight);
  return { sunk, pace: drag.foot };
}

/**
 * How fast a horse is willing to go on toward what stands before it (m/s; Infinity when nothing does): the speed
 * from which it can still stop `short` of the nearest stake point, wall or ditch lip within `look` m along its
 * line (FIELDWORKS.horse). A horse balks at a hedge of points or a fence it can see in time; one already too close
 * at a gallop brakes as hard as it can (stepHorse: its pulling up is limited) and runs into it slower.
 */
export function horseBalks(world, horse) {
  const works = worksOf(world.arena);
  if (!works || horse.state !== 'up') return Infinity;
  const spec = FIELDWORKS.horse;
  const f = [Math.cos(horse.yaw), -Math.sin(horse.yaw)];
  const front = spec.front * horse.withers;
  let nearest = Infinity;
  const ahead = (x, z) => {
    const dx = x - horse.at[0];
    const dz = z - horse.at[1];
    const along = dx * f[0] + dz * f[1] - front;
    if (along < -0.2 || along > spec.look) return;
    if (Math.abs(dx * f[1] - dz * f[0]) > spec.lane + 0.3 * horse.withers) return;
    nearest = Math.min(nearest, Math.max(0, along));
  };
  for (const stake of works.stakes) if (stakeStanding(world, stake)) ahead(stake.tip[0], stake.tip[2]);
  // A wall or a ditch's lip: felt along its line ahead, a step at a time.
  for (let along = 0; along <= spec.look; along += 0.5) {
    const x = horse.at[0] + f[0] * (front + along);
    const z = horse.at[1] + f[1] * (front + along);
    if (works.walls.some((wall) => nearestOnWall(wall, x, z).distance < 0.3) || (works.ditches.length && Math.abs(reliefAt(works, x, z) - reliefAt(works, horse.at[0], horse.at[1])) > spec.step)) {
      nearest = Math.min(nearest, along);
      break;
    }
  }
  if (nearest === Infinity) return Infinity;
  const room = Math.max(0, nearest - spec.short);
  return Math.sqrt(2 * horse.accel * spec.brake * room);
}

/**
 * Each substep, a horse against the works, after it moved (`before`: where it stood): stopped by a wall or a ditch's lip
 * or a bank's face at its chest, and run onto stakes. Needs mounted.js's jolt and harmHorse (handed in: `hurt`).
 */
export function horseOnWorks(world, horse, before, hurt) {
  const works = worksOf(world.arena);
  if (!works || horse.state === 'down') return;
  const f = [Math.cos(horse.yaw), -Math.sin(horse.yaw)];
  const front = [horse.at[0] + f[0] * FIELDWORKS.horse.front * horse.withers, horse.at[1] + f[1] * FIELDWORKS.horse.front * horse.withers];
  const velocity = horse.velocity ?? [f[0] * horse.speed, 0, f[1] * horse.speed];
  // A ditch's lip or a bank's face before its chest: it does not go on.
  if (works.ditches.length) {
    const here = reliefAt(works, horse.at[0], horse.at[1]);
    const ahead = reliefAt(works, front[0], front[1]);
    if (Math.abs(ahead - here) > FIELDWORKS.horse.step) {
      const along = velocity[0] * f[0] + velocity[2] * f[1];
      if (along > 0) stopHorseAtWorks(world, horse, before, [-f[0], -f[1]], along, hurt.jolt, ahead < here ? 'goes down into the ditch' : 'falls at the bank');
    }
  }
  for (const wall of works.walls) {
    const near = nearestOnWall(wall, front[0], front[1]);
    const reach = 0.25 * horse.withers;
    if (near.distance >= reach) continue;
    let nx = horse.at[0] - near.at[0];
    let nz = horse.at[1] - near.at[1];
    const size = Math.hypot(nx, nz) || 1;
    nx /= size;
    nz /= size;
    const into = -(velocity[0] * nx + velocity[2] * nz);
    if (into > 0) stopHorseAtWorks(world, horse, before, [nx, nz], into, hurt.jolt, wall.kind === 'wood' ? 'brought down in the trees' : 'brought down against the palisade');
  }
  if (works.stakes.length) horseOnStakes(world, horse, works, velocity, hurt);
}

/** A horse stopped by what stands before it: back where it was, its speed into it (`into`, m/s, along -n) taken away as a jolt. */
function stopHorseAtWorks(world, horse, before, normal, into, jolt, reason) {
  horse.at[0] = before[0];
  horse.at[1] = before[1];
  jolt(world, horse, [normal[0] * into, 0, normal[1] * into], reason);
  // (Told once for a horse run into it, not for each substep it leans on it at a walk.)
  if (into > FIELDWORKS.horse.told) world.events.push({ time: world.time, kind: 'horseStopped', horse: horse.id, rider: horse.rider ?? undefined, speed: into, effects: [reason] });
}

/**
 * A horse running onto the stakes: each standing stake whose shaft its chest or neck meets, and that it is closing on
 * along its line, takes up to `holds` N·s (along it; `across` of that across it) out of the laden horse's momentum,
 * and drives the work it did into the horse as a point (FIELDWORKS.stake pierce, through the barding there); past what
 * it holds it breaks (the world's `worksState.broken`).
 */
function horseOnStakes(world, horse, works, velocity, hurt) {
  const spec = FIELDWORKS.stake;
  for (const capsule of horse.capsules) {
    if (capsule.part !== 'chest' && capsule.part !== 'neck') continue;
    for (const stake of works.stakes) {
      if (Math.abs(stake.foot[0] - horse.at[0]) > 2.5 || Math.abs(stake.foot[1] - horse.at[1]) > 2.5) continue;
      if (!stakeStanding(world, stake)) continue;
      const tip = stake.tip;
      // The point against the capsule: how far from its surface.
      const ab = [capsule.b[0] - capsule.a[0], capsule.b[1] - capsule.a[1], capsule.b[2] - capsule.a[2]];
      const length = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
      const t = Math.max(0, Math.min(1, ((tip[0] - capsule.a[0]) * ab[0] + (tip[1] - capsule.a[1]) * ab[1] + (tip[2] - capsule.a[2]) * ab[2]) / length));
      const on = [capsule.a[0] + ab[0] * t, capsule.a[1] + ab[1] * t, capsule.a[2] + ab[2] * t];
      const gap = Math.hypot(tip[0] - on[0], tip[1] - on[1], tip[2] - on[2]) - capsule.radius - spec.radius;
      if (gap > 0) continue;
      // The stake's line, foot to point; the horse closing on the point along it.
      const axis = [tip[0] - stake.foot[0], tip[1], tip[2] - stake.foot[1]];
      const axisLength = Math.hypot(...axis);
      const unit = axis.map((value) => value / axisLength);
      const closing = -(velocity[0] * unit[0] + velocity[1] * unit[1] + velocity[2] * unit[2]);
      if (closing <= 0.3) continue;
      const kg = worksHorseKg(world, horse);
      const wanted = kg * closing;
      const square = Math.abs(closing) / (Math.hypot(velocity[0], velocity[2]) || closing);
      const holds = spec.holds * (spec.across + (1 - spec.across) * square);
      const impulse = Math.min(wanted, holds);
      const after = closing - impulse / kg;
      // The work the stake did on the horse, as it slowed from `closing` to `after` against it.
      const energy = 0.5 * kg * (closing * closing - after * after);
      const barding = BARDING[horse.barding].parts[capsule.part];
      const event = { time: world.time, kind: 'horseHit', attacker: -1, horse: horse.id, rider: horse.rider ?? undefined, weapon: 'stake', target: capsule.key, speed: closing, impulse, energy, point: [tip[0], tip[1], tip[2]], normal: unit, effects: ['runs onto a stake'] };
      hurt.harm(world, horse, capsule, { blunt: energy * spec.blunt * (1 - (barding.blunt ?? 0)), cut: 0, pierce: energy * spec.pierce * (1 - (barding.pierce ?? 0)) }, event);
      hurt.jolt(world, horse, [unit[0] * (impulse / kg), 0, unit[2] * (impulse / kg)], 'brought down on the stakes');
      if (impulse >= holds - 1e-6) {
        worksStateOf(world).broken.add(stake.id);
        event.effects.push('the stake breaks');
      }
      world.events.push(event);
      return;
    }
  }
}
