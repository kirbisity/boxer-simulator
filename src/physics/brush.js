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
import { point, toLocal } from '../physics.js';

export const BRUSH = {
  // A blade that comes in among the branches is caught this share of the times it touches them anew: a cut
  // driven hard into a thicket of twigs mostly sticks; one that grazes the outer tips mostly does not.
  catches: 0.55,
  // How quickly a caught man works his blade free (a chance a second: ~3 s on average), and how much quicker with
  // an edge to hack at the twigs. Not much: green bamboo twigs bend away from an edge rather than part, and there are
  // dozens of them (Qi chose the brush because the raiders' long swords could not cut through it): ~2 s.
  freeRate: 0.35,
  cutFree: 1.4,
  // He is kept at the brush's length: inside `keep` of the distance out along it to where his blade is caught (as
  // the bearer's front hand is from his own middle, `hand` m, plus that), only `step` of a push toward the bearer goes on.
  keep: 1,
  hand: 0.35,
  step: 0.15,
  // Torn apart by more than this (m) beyond the brush's length, the hold is lost.
  slip: 0.6,
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
export function brushTouch(world, first, second, a, b, alongA, alongB, touching) {
  const pairs = [[first, a, alongA, second, b], [second, b, alongB, first, a]];
  for (const [bearer, brush, along, man, blade] of pairs) {
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
    if (world.random() >= BRUSH.catches) continue;
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
    const rate = BRUSH.freeRate * (edged ? BRUSH.cutFree : 1);
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
