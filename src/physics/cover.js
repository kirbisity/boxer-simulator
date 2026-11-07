// Cover: what a battle's works (physics/fieldworks.js) do to the missiles crossing them, and how much of a man the
// enemy's missiles and blades can get at from where they stand. A wall that declares what it is made of (`cover`: the
// stone of a town wall and its parapet, the mud plastered on the Hun River camp's sorghum stalks) is a screen: a ball,
// an arrow or a cannon ball crossing its line below its top goes into it, and comes out the far side only with what the
// material did not take from it. A palisade's rails, a wood's edge, declare nothing and stop nothing (shot and arrows go
// between the rails, as before).
//
// The material's resistance is Poncelet's, the engineers' rule for shot into earthworks and masonry from the 18th century
// on: a projectile pushing into a material meets a resisting stress (Pa) over its frontal area, so going `thick` m through
// it costs it stress × area × thick joules. A missile with less than that stops in it; one with more comes out with the
// rest. The stresses are set from what the material is known to stop:
//  - earth (and mud daub): a musket ball (~1 kJ, 17-18 mm) goes ~0.35 m into rammed earth (the field-fortification
//    manuals' "musket-proof" parapet of a yard and more of earth is that, with a margin) → ~1.2e7 Pa.
//  - masonry: a 24-pounder's ball (11 kg at ~500 m/s, 1.4 MJ, 14.7 cm) goes ~0.9 m (three feet) into brick masonry,
//    the breaching batteries' figure → ~9e7 Pa.
// So a stone parapet ~0.6 m thick stops every hand missile and every gun at Pyongyang (a folangji's 0.7 kg ball would
// need ~120 kJ to get through, it has ~30); the daub on a stalk screen stops an arrow (~100 J needs ~120 J) and only
// slows a matchlock ball (it loses ~280 J of its 1000).
//
// What it leaves out: a screen battered down by many balls (a wall's mass knocked away, a gate's timbers smashed: the
// guns at Pyongyang broke a gate, which this does not model), a missile's glance off a face it meets at a slant, and the
// loopholes and crenels a defender shoots through (here a man on a wall shoots over its parapet, from his own height).

import { P } from '../body.js';
import { hostile, inFight, point } from '../physics.js';
import { ARROW } from '../weapons.js';
import { walkingDistance, worksOf } from './fieldworks.js';

export const COVER = {
  materials: {
    // Pa: Poncelet's resisting stress (above): a musket ball's ~0.35 m into earth.
    earth: { stress: 1.2e7 },
    // Pa: a 24-pounder's ball ~0.9 m into brick masonry.
    masonry: { stress: 9e7 },
  },
  // The frontal area (m²) of a hand missile, for its way into a screen: an arrow's head (a bodkin's ~10 mm square, a broad
  // head's edge-on blades about as much) and a matchlock's ball (the Japanese and Ming guns' ~16-18 mm lead ball).
  arrowArea: 1e-4,
  ballArea: 2.3e-4,
  // How much of him the enemy can get at (exposureOf): his head, his chest and his hips each a third, looked at from the
  // missile's height at the shooter (`shooterUp` m under his head: a bow or gun is loosed from the cheek or the shoulder).
  marks: [['head', 0], ['neck', -0.2], ['pelvis', 0]],
  shooterUp: 0.15,
  // m: his weapon's mouth held out before his face toward his mark (a matchlock's muzzle ~1 m ahead of the cheek, a bow's
  // hand at arm's length): what pokes through a crenel or over a parapet while he stands at it.
  shooterOut: 0.9,
  // Who is weighed: enemies within `sight` m (as far as a man takes in the field before him: AI.standing sight's 16 m,
  // and a gun's or a bow's reach beyond it), in full within `near` m, fading to nothing at `sight`. With none so near, the
  // field's men as if come on to `near` m along their lines.
  near: 8,
  sight: 40,
  // Worked out again only this often (s): it moves as the men move, not every step.
  every: 0.5,
};

/** The frontal area (m²) and energy (J) a hand missile meets a screen with: a fired weapon's shot, or an arrow. */
export function missileOf(spec, energy) {
  if (!spec || spec.bow || spec.shot?.bolt) return { area: COVER.arrowArea, joules: energy };
  return { area: COVER.ballArea, joules: energy };
}

/**
 * The first screen on a missile's way from `from` to `to` (world points), below its top where it crosses: { s (share of the
 * way), point, wall, cost (J it would take to go through), stops (its `missile.joules` not enough), left (J after it) }, or
 * null. `missile`: { area (m²), joules }.
 */
export function screenOnPath(world, from, to, missile) {
  const works = worksOf(world.arena);
  if (!works?.screens?.length) return null;
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  let best = null;
  for (const wall of works.screens) {
    // Where the way's line meets the wall's on the floor (both as segments).
    const ex = wall.b[0] - wall.a[0];
    const ez = wall.b[1] - wall.a[1];
    const denominator = dx * ez - dz * ex;
    if (Math.abs(denominator) < 1e-12) continue;
    const rx = wall.a[0] - from[0];
    const rz = wall.a[1] - from[2];
    const s = (rx * ez - rz * ex) / denominator;
    const t = (rx * dz - rz * dx) / denominator;
    if (s < 0 || s > 1 || t < 0 || t > 1) continue;
    const y = from[1] + (to[1] - from[1]) * s;
    if (y > wall.screenHeight || y < 0) continue;
    if (best && s >= best.s) continue;
    best = { s, wall };
  }
  if (!best) return null;
  const material = COVER.materials[best.wall.cover.material];
  const cost = material.stress * missile.area * best.wall.cover.thick;
  return { ...best, point: [from[0] + dx * best.s, from[1] + (to[1] - from[1]) * best.s, from[2] + dz * best.s], cost, stops: missile.joules <= cost, left: Math.max(0, missile.joules - cost) };
}

/** Whether a missile from `from` to `to` gets there (no screen on the way stops it). */
export const screensClear = (world, from, to, missile) => !screenOnPath(world, from, to, missile)?.stops;

/** The missile a man looses (an arrow, a ball), for what a screen does to it; null if he has none ready to loose. */
function coverMissileOfMan(enemy) {
  const spec = enemy.weapon?.held ? enemy.weapon.spec : null;
  if (!spec?.ranged) return null;
  if (spec.bow) return { area: COVER.arrowArea, joules: ARROW.joules };
  if (spec.shot?.flame || !spec.shot) return null;
  return missileOf(spec, spec.shot.energy ?? 1000);
}

/**
 * The share of his head, chest and hips (COVER.marks) a missile has a clear way to, loosed by a man whose hips stand at
 * `from` ([x, z]) with his head at `head` ([x, y, z]).
 */
function coverSeenFrom(world, fighter, from, head, missile) {
  const spec = COVER;
  const at = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
  const apart = Math.hypot(from[0] - at[0], from[1] - at[1]);
  const out = spec.shooterOut / Math.max(spec.shooterOut, apart);
  const muzzle = [head[0] + (at[0] - from[0]) * out, head[1] - spec.shooterUp, head[2] + (at[1] - from[1]) * out];
  let seen = 0;
  for (const [part, up] of spec.marks) {
    const mark = point(fighter.x, P[part]);
    mark[1] += up;
    if (screensClear(world, muzzle, mark, missile)) seen += 1;
  }
  return seen / spec.marks.length;
}

/**
 * How much of him the enemy round him can get at (0 nothing, 1 all), from the geometry of the works: each enemy within
 * COVER.sight m (by `strength(enemy)` and how near he is) counts for the share of the man's head, chest and hips his
 * missile has a clear way to (a man loosing an arrow or a ball), or for how much nearer than its way round the man is to
 * him on foot (a man with a blade: physics/fieldworks.js walkingDistance, over a wall's face only by its ladders, up a
 * rampart only as fast as it is climbed). With none of them within sight, what the works will leave open of him when they
 * have come on to `near` m.
 * On open ground it is 1: nothing covers him. Kept in `fighter.exposure`.
 */
export function exposureOf(world, fighter, strength = () => 1) {
  const works = worksOf(world.arena);
  if (!works) return 1;
  const cached = fighter.exposure;
  if (cached && world.time - cached.at < COVER.every && world.time >= cached.at) return cached.value;
  const spec = COVER;
  const at = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
  const enemies = world.fighters.filter((enemy) => hostile(enemy, fighter) && !enemy.dormant && !enemy.hidden && inFight(enemy));
  // How much of him one of them can get at from `from` ([x, z], his hips; his head `head`), `apart` m off.
  const reachFrom = (enemy, from, head, apart) => {
    const missile = coverMissileOfMan(enemy);
    return missile ? coverSeenFrom(world, fighter, from, head, missile) : Math.min(1, Math.max(0.05, apart) / Math.max(0.05, walkingDistance(world, from, at)));
  };
  const weigh = (seen) => {
    let weighed = 0;
    let open = 0;
    for (const enemy of enemies) {
      const from = [enemy.x[P.pelvis * 3], enemy.x[P.pelvis * 3 + 2]];
      const apart = Math.hypot(from[0] - at[0], from[1] - at[1]);
      const each = seen(enemy, from, apart);
      if (!each || each.weight <= 0) continue;
      weighed += each.weight;
      open += each.weight * reachFrom(enemy, each.from, each.head, each.apart);
    }
    return weighed > 0 ? open / weighed : null;
  };
  // Those within sight, by how near.
  let value = weigh((enemy, from, apart) => (apart >= spec.sight ? null : { weight: strength(enemy) * Math.min(1, (spec.sight - apart) / (spec.sight - spec.near)), from, head: point(enemy.x, P.head), apart }));
  // None of them yet within sight (an army forming up out on the field): what the works will leave open of him when they
  // come, each of them as if come on along his line to `near` m of him.
  value ??= weigh((enemy, from, apart) => {
    const share = spec.near / Math.max(spec.near, apart);
    const to = [at[0] + (from[0] - at[0]) * share, at[1] + (from[1] - at[1]) * share];
    const head = point(enemy.x, P.head);
    return { weight: strength(enemy), from: to, head: [to[0] + head[0] - from[0], head[1], to[1] + head[2] - from[1]], apart: Math.min(apart, spec.near) };
  }) ?? 1;
  fighter.exposure = { at: world.time, value };
  return value;
}
