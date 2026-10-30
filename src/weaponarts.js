// Weapon arts: the player's special attacks, one for each family of weapon (weapons.js `art`, a move in
// moves.js marked `art`), to be made only with his blood up — adrenaline very high — and at the cost of
// an all-out effort (a lot of stamina) and of the surge itself (it is spent in the doing). Nothing here
// makes a blow stronger: an art is a move like any other, carried out by the same physics, and it is
// stronger only for how it is made (moves.js, physics/arts.js). No gun or bow has one. The AI does not
// make them: they are the player's (an AI man's adrenaline is ai.js's own, for his fear).
//
// The player's adrenaline (the AI's is in ai.js `surge` and `feelFear`, which the player's mind never
// runs): the same surges as an AI man's (ai.js surge: a man put down, a very hard blow survived, a
// stagger), and more of the fight's everyday ones (a blow of his landing, a blow taken, a man killed),
// each scaled by how much his body surges (ai.js adrenalineGain: young, big and male more); danger near
// (enemies on their feet close to him) holds it up to a floor; it fades with ai.js's half-life.

import { AI, adrenalineGain, surge } from './ai.js';
import { P } from './body.js';
import { MOVES } from './moves.js';
import { hostile, inFight, opponentFor, point, reachOf, throwPunch } from './physics.js';

export const ARTS = {
  // Adrenaline (0..1) at which an art can be made: very high, more than one hard exchange's worth (a knockdown alone gives
  // ai.js AI.adrenaline.knockdown, 0.45; a few blows landed and taken on top of it, or a long close fight, reach it).
  ready: 0.6,
  // What an art burns of it (the surge spent in an all-out effort; it can be built up again in the fight).
  spend: 0.45,
  // The player's surges, each × adrenalineGain (ai.js), on top of ai.js `surge`'s:
  // - landed: a blow of his landing on a man of the other side (not on a guard or a shield), `landedJoules` more for each
  //   joule it brought (a cut that goes in, a knockdown blow) up to `landedMost` in all;
  // - hurt: a blow landing on him, `hurtJoules` more per joule, up to `hurtMost`: being hit is the surest spur there is;
  // - kill: a man of the other side dying of his hand.
  surge: { landed: 0.04, landedJoules: 0.0003, landedMost: 0.1, hurt: 0.06, hurtJoules: 0.0005, hurtMost: 0.16, kill: 0.3 },
  // Danger near: each enemy on his feet within `within` m holds him up to `perFoe` (to `most` in all), risen to at `rate` a
  // second (a man about to fight is already keyed up; facing three he is more so, but danger alone never makes an art).
  danger: { within: 3, perFoe: 0.12, most: 0.36, rate: 0.08 },
  // The art is offered (the special button, F) only with an enemy within his weapon's reach and this much (m) more: an art
  // is made at a man, not at the air.
  offerBeyond: 1.2,
  // The art's name on the special button.
  labels: { artIai: 'Iai', artPommel: 'Pommel', artDrawCut: 'Draw cut', artWheel: 'Wheel', artCrush: 'Crush', artCrushOne: 'Crush', artSpear: 'Lunge' },
};

/** The art his weapon has (a move's name), or null: none for an empty hand, a gun, a bow, or from the saddle. */
export function artOf(fighter) {
  const weapon = fighter?.weapon?.held ? fighter.weapon : null;
  if (!weapon || weapon.spec.ranged || weapon.spec.shot || weapon.spec.bow || fighter.mount) return null;
  const name = weapon.spec.art;
  return name && MOVES[name]?.art ? name : null;
}

/** The stamina an art draws from him (as throwPunch draws it: its cost over his aerobic fitness). */
export function artCost(fighter, name) {
  return MOVES[name].cost / fighter.body.aerobic;
}

/** Whether his blood is up enough for his weapon's art (the indicator glows): an art, and adrenaline at `ready`. */
export function artPrimed(fighter) {
  return Boolean(artOf(fighter)) && (fighter.adrenaline ?? 0) >= ARTS.ready;
}

/** Whether he can make his art now: primed, on his feet and free, with the stamina for it. */
export function artReady(fighter) {
  const name = artOf(fighter);
  if (!name || (fighter.adrenaline ?? 0) < ARTS.ready) return false;
  if (fighter.state !== 'up' || fighter.punch || fighter.crawling || fighter.netted || fighter.pain || fighter.clinch || fighter.rush) return false;
  return fighter.stamina >= artCost(fighter, name);
}

/** The enemy his art would be made at: his man, on his feet within his reach and ARTS.offerBeyond; else null. */
export function artTarget(world, fighter) {
  const man = opponentFor(world, fighter);
  if (!man || man.state !== 'up' || !hostile(man, fighter)) return null;
  const distance = Math.hypot(man.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], man.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]);
  return distance <= reachOf(fighter) + ARTS.offerBeyond ? man : null;
}

/** The name of his art for the button. */
export function artLabel(fighter) {
  return ARTS.labels[artOf(fighter)] ?? 'Art';
}

/**
 * Make his art at his man: the move thrown as any blow is (its stamina drawn by throwPunch), the adrenaline
 * spent. An art that wants a true edge (`trueEdge`: the jian's drawing cut) is cut with it whatever his skill.
 * Returns whether it was made.
 */
export function startArt(world, fighter) {
  if (!artReady(fighter)) return false;
  const man = artTarget(world, fighter);
  if (!man) return false;
  const name = artOf(fighter);
  const spec = MOVES[name];
  if (!throwPunch(world, fighter, name, spec.zones[0])) return false;
  if (spec.trueEdge) fighter.punch.edgeTilt = 0;
  fighter.adrenaline = Math.max(0, fighter.adrenaline - ARTS.spend);
  world.events.push({ time: world.time, kind: 'art', attacker: fighter.id, defender: man.id, punch: name, effects: [ARTS.labels[name] ?? name] });
  return true;
}

/**
 * The player's adrenaline, each step: the fight's events since the last (surges), danger near (a floor it
 * rises to), and the fade (ai.js's half-life). Called for the man the player plays (control.js directFighter).
 */
export function feelAdrenaline(world, fighter, dt) {
  const events = world.events;
  if ((fighter.artEventCursor ?? 0) > events.length) fighter.artEventCursor = events.length;
  const spec = ARTS.surge;
  const gain = adrenalineGain(fighter);
  let level = (fighter.adrenaline ?? 0) * 0.5 ** (dt / AI.adrenaline.halfLife);
  for (let index = fighter.artEventCursor ?? 0; index < events.length; index += 1) {
    const event = events[index];
    // (ai.js's own: a man put down, a very hard blow survived, a stagger.)
    fighter.adrenaline = level;
    surge(fighter, event);
    level = fighter.adrenaline;
    const other = world.fighters[event.attacker === fighter.id ? event.defender : event.attacker];
    if (event.kind === 'landed' && other && hostile(other, fighter)) {
      const joules = event.energy ?? 0;
      if (event.attacker === fighter.id) level += Math.min(spec.landedMost, spec.landed + spec.landedJoules * joules) * gain;
      else if (event.defender === fighter.id) level += Math.min(spec.hurtMost, spec.hurt + spec.hurtJoules * joules) * gain;
    }
    if (event.kind === 'killed' && event.attacker === fighter.id && event.fighter !== fighter.id) level += spec.kill * gain;
  }
  fighter.artEventCursor = events.length;
  // Danger near: enemies on their feet close by hold him keyed up.
  const danger = ARTS.danger;
  const hips = point(fighter.x, P.pelvis);
  let near = 0;
  for (const other of world.fighters) {
    if (other === fighter || other.state !== 'up' || !inFight(other) || !hostile(other, fighter)) continue;
    if (Math.hypot(other.x[P.pelvis * 3] - hips[0], other.x[P.pelvis * 3 + 2] - hips[2]) < danger.within) near += 1;
  }
  const floor = Math.min(danger.most, danger.perFoe * near) * gain;
  if (level < floor) level = Math.min(floor, level + danger.rate * dt);
  fighter.adrenaline = Math.min(1, level);
}
