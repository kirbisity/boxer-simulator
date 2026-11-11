// The wolf-brush's catch: the langxian of Qi Jiguang's mandarin-duck squads
// (WEAPONS langxian, its `brush`). A whole bamboo with its side branches left
// on in tiers, their ends hardened: a sword cut or thrust into it does not
// meet one shaft to glance off but a thicket of springy twigs, and the blade
// goes in among them and is held there, as a stick thrust into a hedge is.
// The Jixiao xinshu gives the langxian man that work: to catch the enemy's
// weapon and keep him off with the brush in his face, while the spears beside
// him kill him (he is not to fight him himself: "the langxian guards, the
// spear kills").
//
// Here: when the brush's branches (`brush.from` to `brush.to` m out along it
// from the front hand) touch an enemy's blade (physics.js clashWeapons: the
// same contact that keeps two weapons from passing through each other), the
// blade is caught a share of the time (`catches`, each new touch). The man
// whose blade is caught (`caught`: { by, blade, along, t }):
//  - cannot strike or parry with it (physics.js throwPunch, perform);
//  - has his weapon hand dragged to where it is caught, out of his guard
//    (physics.js updateIntent: pinnedByBrush);
//  - cannot press in on the bearer: the brush's tiers are in his face and
//    chest, and a step in is a step into them (moveRoot: brushKeepsOff),
//    inside `keep` of the length out to where his blade is caught, only
//    `step` of his push toward the bearer goes on;
// until he wrenches or cuts it free (a chance a second, `freeRate`; an edge
// through green twigs the quicker, `cutFree`), the bearer's brush is gone
// from his hands or he is down, or the two are torn apart past the brush's
// reach (`slip` m beyond its length). The bearer, holding, does not strike
// (ai.js holdWithBrush): he keeps the brush steady at that distance, and his
// squad's spears go for the man he holds (ai.js choosing a man).

import { P } from '../body.js';
import { vec } from '../pose.js';
import { closestBetween, point, toLocal } from '../physics.js';

export const BRUSH = {
  // A blade that comes in among the branches is caught this share of the times it touches them anew, as it meets
  // them: swept across them (a cut, the whole edge dragged through a thicket of twigs) it is caught `catches` of the
  // time (0.6: a cut driven hard into the brush mostly sticks, one grazing the outer tips mostly does not); driven
  // along its own line (a spear's thrust, the point slipping straight between the twigs) only `straight` of that
  // (0.15: some 0.09). In between by the share of its motion (against the brush's) that is across its own length.
  // The Jixiao xinshu gives the branches both works, to tangle a sword and to lock a spear's point; the sweep is what
  // they catch best. Slower than `slow` m/s against the brush, a blade only pressed into it counts as half across.
  catches: 0.6,
  straight: 0.15,
  slow: 0.5,
  // How quickly a caught man works his blade free (a chance a second: ~3 s on average), and how much quicker with
  // an edge to hack at the twigs. Not much: green bamboo twigs bend away from an edge rather than part, and there are
  // dozens of them (Qi chose the brush because the raiders' long swords could not cut through it): ~2 s.
  freeRate: 0.35,
  cutFree: 1.4,
  // A point caught (a spear's, a pike's: a weapon made to thrust more than to cut, its thrust's pierce over its swing's
  // cut) is drawn straight back out along its own line, between the twigs it slid in through: `pullFree` times as quick
  // (~1 s). The branches lock a spear's head only for a moment; a curved edge swept in among them is what they hold.
  pullFree: 3,
  // He is kept at the brush's length: inside `keep` of the distance out along it to where his blade is caught (as
  // the bearer's front hand is from his own middle, `hand` m, plus that), only `step` of a push toward the bearer goes on.
  keep: 1,
  hand: 0.35,
  step: 0.15,
  // Torn apart by more than this (m) beyond the brush's length, the hold is lost.
  slip: 0.6,
  // The brush screens: the Jixiao xinshu gives the langxian its branches to hide the squad behind them as much as to
  // tangle (the raider cannot see the spear coming through the leaves). A man whose line of sight to the man striking at
  // him passes through an enemy's brush (its branches, `brush.from` to the tip, within its `radius`) sees the blow late:
  // his chance to meet it at all (ai.js, his defence) is `screen` of what it would be. A guess at "late": a third worse.
  screen: 0.67,
};

/** The world's new touches of a brush against a blade (fighter id, blade, bearer id), so each touch is tried once. */
function touchesOf(world) {
  world.brushTouches ??= new Set();
  return world.brushTouches;
}

/**
 * Two weapons in contact (physics.js clashWeapons) or apart (`touching` false): if one is a brush and the other a blade
 * of the other side, its touch is tried for a catch (BRUSH.catches) the first time it comes. `along` is how far out on
 * each weapon (m from its hand) they meet.
 */
export function brushTouch(world, first, second, a, b, alongA, alongB, touching, velocityA = null, velocityB = null) {
  const pairs = [[first, a, alongA, second, b, velocityA, velocityB], [second, b, alongB, first, a, velocityB, velocityA]];
  for (const [bearer, brush, along, man, blade, brushVelocity, bladeVelocity] of pairs) {
    const spec = brush.spec.brush;
    if (!spec || blade.spec.brush) continue;
    const key = `${bearer.id}:${man.id}:${blade === man.offWeapon ? 'o' : 'm'}`;
    const touches = touchesOf(world);
    if (!touching || along < spec.from || along > spec.to) {
      touches.delete(key);
      continue;
    }
    if (touches.has(key)) continue;
    touches.add(key);
    if (man.caught || bearer.holding !== undefined || man.state !== 'up' || bearer.state !== 'up') continue;
    if (world.random() >= BRUSH.catches * sweepShare(blade, bladeVelocity, brushVelocity)) continue;
    // (`stroke`: the bearer's own blow that caught it, if it was one: it runs out in the tangle; a new one would free it.)
    man.caught = { by: bearer.id, blade: blade === man.offWeapon ? 'off' : 'main', along, t: 0, stroke: bearer.punch ?? null };
    bearer.holding = man.id;
    // Whatever blow he had going is stopped in the branches.
    man.punch = null;
    man.defence = null;
    world.events.push({ time: world.time, kind: 'caught', fighter: man.id, attacker: bearer.id, effects: [`his ${blade.spec.label.toLowerCase()} caught in the wolf-brush`] });
  }
}

/**
 * How much of a catch a blade meeting the brush with this motion gets (BRUSH.straight to 1): by the share of its
 * velocity against the brush's that lies across its own length (a sweep), not along it (a thrust).
 */
export function sweepShare(blade, bladeVelocity, brushVelocity) {
  let across = 0.5;
  if (bladeVelocity) {
    const v = brushVelocity ? vec.sub(bladeVelocity, brushVelocity) : bladeVelocity;
    const speed = vec.length(v);
    if (speed > BRUSH.slow) {
      const along = vec.dot(v, blade.dir) / speed;
      across = Math.sqrt(Math.max(0, 1 - along * along));
    }
  }
  return BRUSH.straight + (1 - BRUSH.straight) * across;
}

/**
 * Whether these two weapons are a brush and the blade caught in it: tangled, they move together and do not bang apart
 * (physics.js clashWeapons leaves them be).
 */
export function tangled(first, second, a, b) {
  const caughtIn = (man, blade, bearer) => man.caught?.by === bearer.id && caughtBlade(man) === blade;
  return caughtIn(second, b, first) || caughtIn(first, a, second);
}

/** The blade of his that is caught, or null. */
export function caughtBlade(fighter) {
  if (!fighter.caught) return null;
  return fighter.caught.blade === 'off' ? fighter.offWeapon : fighter.weapon;
}

/** Each step: every caught man works at his blade; the hold is lost as BRUSH says. */
export function holdBrushes(world, dt) {
  for (const man of world.fighters) {
    if (!man.caught) continue;
    const bearer = world.fighters[man.caught.by];
    man.caught.t += dt;
    const blade = caughtBlade(man);
    const brush = bearer.weapon?.held ? bearer.weapon.spec.brush : null;
    const apart = Math.hypot(man.x[P.pelvis * 3] - bearer.x[P.pelvis * 3], man.x[P.pelvis * 3 + 2] - bearer.x[P.pelvis * 3 + 2]);
    const edged = blade?.held && Object.values(blade.spec.harm).some((mix) => (mix.cut ?? 0) > 0.5);
    const harm = blade?.spec.harm ?? {};
    const pointed = (harm.thrust?.pierce ?? 0) > (harm.swing?.cut ?? 0);
    const rate = BRUSH.freeRate * (edged ? BRUSH.cutFree : 1) * (pointed ? BRUSH.pullFree : 1);
    let how = null;
    if (man.state !== 'up' || !blade?.held) how = man.state === 'out' ? '' : 'free of the brush';
    else if (bearer.state !== 'up' || !brush || (bearer.punch && bearer.punch !== man.caught.stroke)) how = 'free of the brush';
    else if (apart > bearer.weapon.spec.length + BRUSH.slip) how = 'tears his blade out of the brush';
    else if (world.random() < rate * dt) how = edged ? 'cuts his blade free of the brush' : 'wrenches his weapon free of the brush';
    if (how === null) continue;
    man.caught = null;
    bearer.holding = undefined;
    if (how) world.events.push({ time: world.time, kind: 'freed', fighter: man.id, attacker: bearer.id, effects: [how] });
  }
}

/** How far (m, middle to middle) the bearer's brush keeps a caught man off him: out to where his blade is caught. */
export function heldOffAt(man) {
  return BRUSH.hand + man.caught.along * BRUSH.keep;
}

/**
 * A caught man's step (`wanted`, m/s on the floor): what of it goes toward the bearer, inside the brush's hold
 * (heldOffAt), is mostly taken off (BRUSH.step). Returns the step to take.
 */
export function brushKeepsOff(world, man, wanted) {
  const bearer = world.fighters[man.caught.by];
  const to = [bearer.root[0] - man.root[0], bearer.root[1] - man.root[1]];
  const apart = Math.hypot(to[0], to[1]);
  if (apart < 1e-6 || apart > heldOffAt(man)) return wanted;
  const u = [to[0] / apart, to[1] / apart];
  const into = wanted[0] * u[0] + wanted[1] * u[1];
  if (into <= 0) return wanted;
  const taken = into * (1 - BRUSH.step);
  return [wanted[0] - u[0] * taken, wanted[1] - u[1] * taken];
}

/**
 * A caught man's weapon hand dragged to where his blade is held in the brush, as far as his arm reaches toward it
 * (his pose's `intent`, in his own frame): his blade up in the branches, out of his guard.
 */
export function pinnedByBrush(world, man, intent) {
  const bearer = world.fighters[man.caught.by];
  const brush = bearer.weapon;
  const blade = caughtBlade(man);
  if (!brush?.held || !blade?.held) return;
  const hand = point(bearer.x, P[`${brush.main}Hand`]);
  const caughtAt = vec.add(hand, vec.scale(brush.dir, man.caught.along));
  // The hilt sits short of the tangle by as much of the blade as went in (half its length).
  const side = blade.main;
  const shoulder = point(man.x, P[`${side}Shoulder`]);
  const reach = (man.body.lengths.upperArm + man.body.lengths.forearmToFist) * 0.95;
  const toward = vec.sub(caughtAt, shoulder);
  const length = vec.length(toward);
  const out = Math.min(reach, Math.max(0, length - blade.spec.length * 0.5));
  const at = length > 1e-6 ? vec.add(shoulder, vec.scale(toward, out / length)) : shoulder;
  intent[`${side}Hand`] = toLocal(man, at);
}

/**
 * Whether an enemy's wolf-brush stands between `fighter`'s eyes and `striker`'s (BRUSH.screen): its branches cross the line
 * of sight from his head to the striker's, within the brush's radius. The striker's own brush counts (it is in his face).
 */
export function brushScreens(world, fighter, striker) {
  const eye = point(fighter.x, P.head);
  const them = point(striker.x, P.head);
  for (const other of world.fighters) {
    const brush = other.weapon;
    if (other.corner === fighter.corner || !brush?.held || !brush.spec.brush || other.state !== 'up') continue;
    const hand = point(other.x, P[`${brush.main}Hand`]);
    const from = vec.add(hand, vec.scale(brush.dir, brush.spec.brush.from));
    const closest = closestBetween(eye, them, from, brush.tip);
    if (vec.length(vec.sub(closest.onFirst, closest.onSecond)) < brush.spec.radius) return true;
  }
  return false;
}
