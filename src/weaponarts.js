// Weapon arts: the player's special attacks, one for each family of weapon (weapons.js `art`, a move in
// moves.js marked `art`), to be made only with his blood up — adrenaline very high — and at the cost of
// an all-out effort (a lot of stamina) and of the surge itself (it is spent in the doing). Nothing here
// makes a blow stronger: an art is a move like any other, carried out by the same physics, and it is
// stronger only for how it is made (moves.js, physics/arts.js). No gun or bow has one. The AI does not
// make them: they are the player's (an AI man's adrenaline is ai.js's own, for his fear).
//
// The charge: once his adrenaline reaches ARTS.ready with a weapon that has an art, the art is charged (`artCharged`) and
// stays so, whatever his adrenaline does after and whoever is near, until he makes it: a surge banked, his to spend when he
// chooses. Making it spends the charge (and the stamina the move costs, and ARTS.spend of the adrenaline).
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
  // The art is aimed at his man when that man is within his weapon's reach and this much (m) more; farther, or nobody, it is
  // made all the same toward the nearest enemy (or straight ahead), into the air: the charge is his to spend when he likes.
  offerBeyond: 1.2,
  // Pressed while he cannot make it at once (a blow of his own still in flight, a flinch): kept asked for this long (s) and
  // made the moment he is free, so a press a beat early is not lost.
  askedFor: 0.4,
  // The art's name on its button.
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

/** Whether his art is charged (its button shown, glowing): a weapon with an art, and the charge banked (or his blood up now). */
export function artPrimed(fighter) {
  return Boolean(artOf(fighter)) && (Boolean(fighter.artCharged) || (fighter.adrenaline ?? 0) >= ARTS.ready);
}

/**
 * Why a charged art cannot be made this instant, or null when it can: 'winded' (not the stamina for it: the button dims and
 * says so), 'busy' (a blow in flight, a flinch, held, down: a press is kept a moment, ARTS.askedFor), or 'none' (no art, or
 * not charged).
 */
export function artBlocked(fighter) {
  const name = artOf(fighter);
  if (!name || !artPrimed(fighter)) return 'none';
  if (fighter.stamina < artCost(fighter, name)) return 'winded';
  if (fighter.state !== 'up' || fighter.punch || fighter.crawling || fighter.netted || fighter.pain || fighter.clinch || fighter.rush) return 'busy';
  return null;
}

/** Whether he can make his art now: charged, on his feet and free, with the stamina for it. */
export function artReady(fighter) {
  return artBlocked(fighter) === null;
}

/** The enemy his art would be made at: his man, on his feet within his reach and ARTS.offerBeyond; else null. */
export function artTarget(world, fighter) {
  const man = opponentFor(world, fighter);
  if (!man || man.state !== 'up' || !hostile(man, fighter)) return null;
  const distance = Math.hypot(man.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], man.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]);
  return distance <= reachOf(fighter) + ARTS.offerBeyond ? man : null;
}

/** Where an art with no man within reach is made: at his reach toward the nearest enemy (whatever the distance), else ahead. */
function artIntoAir(world, fighter) {
  const hips = point(fighter.x, P.pelvis);
  const man = opponentFor(world, fighter);
  let way = [Math.cos(fighter.yaw), -Math.sin(fighter.yaw)];
  if (man) {
    const off = [man.x[P.pelvis * 3] - hips[0], man.x[P.pelvis * 3 + 2] - hips[2]];
    const length = Math.hypot(off[0], off[1]);
    if (length > 1e-3) way = [off[0] / length, off[1] / length];
  }
  const reach = reachOf(fighter) * 0.9;
  return [hips[0] + way[0] * reach, fighter.x[P.neck * 3 + 1] - 0.1, hips[2] + way[1] * reach];
}

/** The name of his art for the button. */
export function artLabel(fighter) {
  return ARTS.labels[artOf(fighter)] ?? 'Art';
}

/**
 * Make his art: at his man if he is within reach, else into the air toward the nearest enemy (or ahead). The move is
 * thrown as any blow is (its stamina drawn by throwPunch); the charge and ARTS.spend of the adrenaline are spent. An art
 * that wants a true edge (`trueEdge`: the jian's drawing cut) is cut with it whatever his skill. Returns whether it was made.
 */
export function startArt(world, fighter) {
  if (!artReady(fighter)) return false;
  const man = artTarget(world, fighter);
  const name = artOf(fighter);
  const spec = MOVES[name];
  if (!throwPunch(world, fighter, name, spec.zones[0], man ? {} : { at: artIntoAir(world, fighter) })) return false;
  if (spec.trueEdge) fighter.punch.edgeTilt = 0;
  fighter.artCharged = false;
  fighter.adrenaline = Math.max(0, (fighter.adrenaline ?? 0) - ARTS.spend);
  world.events.push({ time: world.time, kind: 'art', attacker: fighter.id, defender: man?.id, punch: name, effects: [ARTS.labels[name] ?? name] });
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
  // The charge banked the moment his blood is up with a weapon that has an art (kept till he makes it).
  if (fighter.adrenaline >= ARTS.ready && artOf(fighter)) fighter.artCharged = true;
}
