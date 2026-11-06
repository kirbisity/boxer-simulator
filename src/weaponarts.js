// Weapon arts: the player's special attacks, a few for each family of weapon (weapons.js `art` names the family's own, a move in
// moves.js marked `art`), to be made only with his blood up — adrenaline very high — and at the cost of
// the surge itself (it is spent in the doing; the stamina of an all-out effort is not counted against him: the surge
// pays for it). Nothing here
// makes a blow stronger: an art is a move like any other, carried out by the same physics, and it is
// stronger only for how it is made (moves.js, physics/arts.js); it comes disguised (read late, its guard hard to meet:
// ai.js AI.art) and laid on its mark with more care (physics/config.js WORLD.skill.artScatter). Every hand-to-hand weapon has
// one, and every unarmed style (moves.js STYLES `art`); no gun or bow. The AI does not
// make them: they are the player's (an AI man's adrenaline is ai.js's own, for his fear).
//
// Which of the family's arts is made is the situation's (chooseArt, ARTS.choices): what the player can see of his man (how far,
// in what armour, his guard, charging or crowding in, where he stands, locked with him) picks it, and the button names it as it
// changes (artLabel). One press, the art the moment asks for: the mordhau for a man in plate, the leg sweep for one charging in.
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
//
// A man who carries a grenade (physics/throwable.js: a soldier's frag, a SWAT officer's flashbang) has it on this same button
// first, and it needs no blood up: pressed, he pulls the pin and throws it at his man (or straight on). It is one throw: once
// it is gone the button is the art's again (shown only while the art is charged).

import { AI, adrenalineGain, surge } from './ai.js';
import { P } from './body.js';
import { MOVES, STYLES } from './moves.js';
import { hostile, inFight, opponentFor, perform, point, protectionAt, reachOf, throwPunch } from './physics.js';
import { WORLD } from './physics/config.js';
import { gapsOf } from './physics/gaps.js';
import { startThrow, throwableOf, throwBlocked } from './physics/throwable.js';
import { yawRotate } from './pose.js';

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
  labels: {
    artIai: 'Iai', artPommel: 'Pommel', artDrawCut: 'Draw cut', artWheel: 'Wheel', artCrush: 'Crush', artCrushClub: 'Crush', artCrushOne: 'Crush', artSpear: 'Lunge', artFleche: 'Flèche', artOverhand: 'Overhand', artRoundhouse: 'Roundhouse', artSlam: 'Slam',
    artMordhau: 'Mordhau', artHalfSword: 'Half-sword', artKesagiri: 'Kesagiri', artTsuki: 'Tsuki', artWristCut: 'Wrist cut', artBackhand: 'Backhand whirl',
    artLegSweep: 'Leg sweep', artButt: 'Butt strike', artCleave: 'Cleave', artBeak: 'Beak', artHook: 'Hook and pull', artGrapple: 'Grapple and stab',
    artGrappleStab: 'Grapple and stab', artLiverHook: 'Liver hook', artHipThrow: 'Hip throw', artSpinKick: 'Spinning kick', artTeep: 'Teep',
    artShieldBash: 'Bash and cut', artShieldBashThrust: 'Bash and thrust', artShieldCut: 'Bash and cut', artShieldThrust: 'Bash and thrust',
  },
  // The situational arts: which art the moment asks for (chooseArt), by his family's own art (its default, made when none of these
  // is the case): each a move and when (the situation as he sees it, artSituation), the first that holds; `zone` where on him it
  // goes (else the move's first). What he can see: how far his man is, what armour covers him where (plate or any rigid harness
  // an edge cannot cut, mail, or none), how high his guard is, whether he is charging or crowding in, where he stands about him,
  // whether they are locked together, his weapon and its hand. A man with a shield on his arm and an armed man square before it
  // has the shield's art (`shield`) before any of his family's.
  choices: {
    // The long sword: a man in arms close, the half-sword's point into a gap; plate on his head, the mordhau; else the pommel.
    artPommel: [
      { art: 'artHalfSword', when: (s) => s.armour.trunk !== 'none' && s.distance < 1.15 },
      { art: 'artMordhau', when: (s) => s.armour.head === 'plate' },
    ],
    // The katana and the ōdachi: an armoured man, or one out at the point's length, the tsuki at the throat; one close and square
    // to him, kesagiri; else iai.
    artIai: [
      { art: 'artTsuki', when: (s) => (s.armour.trunk !== 'none' && s.distance > s.reach + 0.35) || s.distance > s.reach + 0.7 },
      { art: 'artKesagiri', when: (s) => s.distance < s.reach && s.square },
    ],
    // The cutting sword in one hand: a man off to his left (the sword's off side), the backhand whirl; an armed man's weapon hand
    // within reach, the wrist cut; else the drawing cut.
    artDrawCut: [
      { art: 'artBackhand', when: (s) => s.bearing > 0.45 },
      { art: 'artWristCut', when: (s) => s.armed && s.handNear },
    ],
    // The spear: a man inside the point, the butt; one charging in, the leg sweep; else the lunge.
    artSpear: [
      { art: 'artButt', when: (s) => s.inside },
      { art: 'artLegSweep', when: (s) => s.charging },
    ],
    // The polearm: a man lower than him or at the middle of its reach, the cleaving chop; else the wheel.
    artWheel: [{ art: 'artCleave', when: (s) => s.lower || s.distance < s.reach * 0.75 }],
    // The hammer, the club, the mace: plate and a beak to put into it, the beak; a shield or a braced guard, the hook; else the crush.
    artCrush: [
      { art: 'artBeak', when: (s) => s.beak && (s.armour.head === 'plate' || s.armour.trunk === 'plate') },
      { art: 'artHook', when: (s) => s.shield || s.braced, zone: (s) => (s.shield ? 'shield' : 'shins') },
    ],
    artCrushClub: [{ art: 'artHook', when: (s) => s.shield || s.braced, zone: (s) => (s.shield ? 'shield' : 'shins') }],
    artCrushOne: [{ art: 'artHook', when: (s) => s.shield || s.braced, zone: (s) => (s.shield ? 'shield' : 'shins') }],
    // The dagger and the short point: a man to be seized (within the hands' reach), the grapple and stab (at the throat, or his
    // bare face over a harness); else the flèche.
    artFleche: [{ art: 'artGrapple', when: (s) => s.clinch, zone: (s) => (s.armour.head === 'none' && s.armour.trunk !== 'none' ? 'head' : 'throat') }],
    // The empty hand: a thrower locked with him or at the hands' reach, the hip throw; his guard high, the liver hook; else the overhand.
    artOverhand: [
      { art: 'artHipThrow', when: (s) => s.thrower && s.clinch },
      { art: 'artLiverHook', when: (s) => s.guardHigh },
    ],
    // The kicker: crowded, the teep; at the middle of a kick's reach (beyond his arm's, short of the leg's full length: his reach
    // is his arm's, empty-handed), the spinning kick; else the roundhouse.
    artRoundhouse: [
      { art: 'artTeep', when: (s) => s.crowding },
      { art: 'artSpinKick', when: (s) => s.distance > s.reach * 1.35 && s.distance < s.reach * 1.85 },
    ],
  },
  // The shield's: an armed man square before it, within a step and the arm's reach (m, hips to hips).
  shield: { within: 1.8, ahead: 0.5 },
  // What counts (the situation): his armour at a part, `plate` when rigid (physics/gaps.js rigidFrom: an edge does not cut it),
  // `mail` from this cut protection; `square` his chest within this (rad) of facing him; his hands above this share of the way
  // from his hips to his neck, his guard high; coming in at `charging` m/s or more, charging; `crowding` within this share of the
  // reach (or closing at `crowdingSpeed` inside it); `lower` his head so much (m) below his own; `inside`: within the point's
  // start (`strikeFrom`) and `insideSlack` m of it, hips to hips; his weapon hand near, within his reach and `handSlack` m (a
  // step) of his shoulder.
  sense: { mail: 0.5, square: 0.6, guardHigh: 0.8, charging: 2.2, crowding: 1.1, crowdingWithin: 1.5, crowdingSpeed: 0.8, lower: 0.25, insideSlack: 0.45, handSlack: 0.35 },
};

/** The armour class at a part of him ('plate', 'mail' or 'none'), as ARTS.sense reads it. */
function armourClass(man, key) {
  const covered = protectionAt(man.body.gear, key);
  if (covered.deflects || (covered.cut ?? 0) >= gapsOf(man.body.gear).rigidFrom) return 'plate';
  return (covered.cut ?? 0) >= ARTS.sense.mail ? 'mail' : 'none';
}

/**
 * The situation as he sees it for his art (pure): his man's distance (m, hips to hips) and his own reach (physics.js reachOf); the
 * armour on his man's head, trunk and shins; whether his man stands square to him, his guard high, charging or crowding in, lower
 * than him, inside his point, armed and his weapon hand within reach, with a shield, braced behind a block; where his man stands
 * about him (`bearing`, rad, + to his left); whether they are locked together. Null with no man.
 */
export function artSituation(world, fighter, man) {
  if (!man) return null;
  const sense = ARTS.sense;
  const hips = point(fighter.x, P.pelvis);
  const his = point(man.x, P.pelvis);
  const off = [his[0] - hips[0], 0, his[2] - hips[2]];
  const distance = Math.hypot(off[0], off[2]);
  const toHim = distance > 1e-6 ? [off[0] / distance, 0, off[2] / distance] : yawRotate([1, 0, 0], fighter.yaw);
  const forward = yawRotate([1, 0, 0], fighter.yaw);
  const left = yawRotate([0, 0, 1], fighter.yaw);
  const hisForward = yawRotate([1, 0, 0], man.yaw);
  const reach = reachOf(fighter);
  const closing = -(man.rootVelocity[0] * toHim[0] + man.rootVelocity[1] * toHim[2]);
  const chest = man.x[P.pelvis * 3 + 1] + (man.x[P.neck * 3 + 1] - man.x[P.pelvis * 3 + 1]) * sense.guardHigh;
  const weapon = fighter.weapon?.held ? fighter.weapon : null;
  const armed = Boolean(man.weapon?.held && !man.weapon.spec.ranged && !man.weapon.spec.shot && !man.weapon.spec.bow);
  const hand = armed ? point(man.x, P[`${man.weapon.main}Hand`]) : null;
  const shoulder = point(fighter.x, P[`${weapon?.main ?? 'r'}Shoulder`]);
  const style = STYLES[fighter.style];
  const neckGap = Math.hypot(man.x[P.neck * 3] - fighter.x[P.neck * 3], man.x[P.neck * 3 + 2] - fighter.x[P.neck * 3 + 2]);
  return {
    distance, reach,
    bearing: Math.atan2(toHim[0] * left[0] + toHim[2] * left[2], toHim[0] * forward[0] + toHim[2] * forward[2]),
    armour: { head: armourClass(man, 'head'), trunk: armourClass(man, 'trunk'), legs: armourClass(man, 'lShank') },
    square: -(hisForward[0] * toHim[0] + hisForward[2] * toHim[2]) > Math.cos(sense.square),
    guardHigh: man.guardHigh > 0 || (man.x[P.lHand * 3 + 1] > chest && man.x[P.rHand * 3 + 1] > chest),
    charging: Boolean(man.rush) || closing >= sense.charging,
    crowding: distance < reach * sense.crowding || (distance < reach * sense.crowdingWithin && closing >= sense.crowdingSpeed),
    lower: Boolean(man.crawling) || man.x[P.head * 3 + 1] < fighter.x[P.head * 3 + 1] - sense.lower,
    inside: Boolean(weapon) && distance < weapon.spec.strikeFrom + sense.insideSlack,
    armed,
    handNear: Boolean(hand) && Math.hypot(hand[0] - shoulder[0], hand[2] - shoulder[2]) <= reach + sense.handSlack,
    shield: Boolean(man.shield),
    braced: ['shieldBlock', 'weaponBlock', 'parry', 'guard'].includes(man.defence?.name),
    clinch: fighter.clinch?.target === man.id || neckGap <= fighter.body.reach * WORLD.clinch.range,
    beak: Boolean(weapon?.spec.beak),
    thrower: Boolean(style?.throws || style?.shoulderThrow),
    myShield: Boolean(fighter.shield),
  };
}

/**
 * The art the moment asks for (pure): { art, zone } — his family's art (artOf) unless one of its situational arts holds
 * (ARTS.choices, the first that does), or the shield's (ARTS.shield); `zone` where on him (null: the move's first). With no man
 * near (artTarget), his family's own. Null with no art.
 */
export function chooseArt(world, fighter, man = artTarget(world, fighter)) {
  const own = artOf(fighter);
  if (!own) return null;
  const s = artSituation(world, fighter, man);
  if (!s) return { art: own, zone: null };
  // (The shield's first: a man with a shield on his arm meets an armed man square before it with its boss.)
  const shield = ARTS.shield;
  if (s.myShield && s.armed && fighter.weapon?.held && s.distance < shield.within && Math.abs(s.bearing) < shield.ahead && s.square) {
    const harm = fighter.weapon.spec.harm;
    return { art: (harm.thrust?.pierce ?? 0) > (harm.swing?.cut ?? 0) ? 'artShieldBashThrust' : 'artShieldBash', zone: null };
  }
  for (const choice of ARTS.choices[own] ?? []) if (choice.when(s)) return { art: choice.art, zone: choice.zone ? choice.zone(s) : null };
  return { art: own, zone: null };
}

/** The art his weapon has (a move's name), or his style's with an empty hand, or null: none for a gun, a bow, or from the saddle. */
export function artOf(fighter) {
  if (!fighter || fighter.mount) return null;
  const weapon = fighter.weapon?.held ? fighter.weapon : null;
  if (weapon && (weapon.spec.ranged || weapon.spec.shot || weapon.spec.bow)) return null;
  // Empty-handed: his style's, or (a weapon style disarmed) the style he falls back on.
  const style = STYLES[fighter.style];
  const name = weapon ? weapon.spec.art : style?.art ?? STYLES[style?.fallback]?.art;
  return name && MOVES[name]?.art ? name : null;
}

/** Whether his art is charged (its button shown, glowing): a weapon with an art, and the charge banked (or his blood up now). */
export function artPrimed(fighter) {
  // (A grenade still carried: the button is its, ready whatever his blood.)
  if (throwableOf(fighter)) return true;
  return Boolean(artOf(fighter)) && (Boolean(fighter.artCharged) || (fighter.adrenaline ?? 0) >= ARTS.ready);
}

/**
 * Why a charged art cannot be made this instant, or null when it can: 'busy' (a blow in flight, a flinch, held, down: a press is kept a moment, ARTS.askedFor), or 'none' (no art, or
 * not charged).
 */
export function artBlocked(fighter) {
  // (A grenade: costs no more breath than a throw; held back only while he is busy, `busy`.)
  if (throwableOf(fighter)) return throwBlocked(fighter);
  const name = artOf(fighter);
  if (!name || !artPrimed(fighter)) return 'none';
  // (Locked with him, a thrower's art is his throw from the hold: not kept from him.)
  const throwing = fighter.clinch && (STYLES[fighter.style]?.throws || STYLES[fighter.style]?.shoulderThrow) && !fighter.clinch.art;
  if (fighter.state !== 'up' || fighter.punch || fighter.crawling || fighter.netted || fighter.pain || (fighter.clinch && !throwing) || fighter.rush) return 'busy';
  return null;
}

/** Whether he can make his art now: charged, on his feet and free. */
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

/** The name of his art for the button: the one he would make now (chooseArt) when the world is given, else his family's. */
export function artLabel(fighter, world = null) {
  const grenade = throwableOf(fighter);
  if (grenade) return grenade.label;
  const name = world ? chooseArt(world, fighter)?.art : artOf(fighter);
  return ARTS.labels[name] ?? 'Art';
}

/**
 * Make his art: at his man if he is within reach, else into the air toward the nearest enemy (or ahead). The move is
 * thrown as any blow is (no stamina drawn: throwPunch); the charge and ARTS.spend of the adrenaline are spent. An art
 * that wants a true edge (`trueEdge`: the jian's drawing cut) is cut with it whatever his skill. Returns whether it was made.
 */
export function startArt(world, fighter) {
  if (!artReady(fighter)) return false;
  // A grenade first: thrown (physics/throwable.js), the art left charged for after.
  if (throwableOf(fighter)) return startThrow(world, fighter);
  const man = artTarget(world, fighter);
  // The art the moment asks for (chooseArt): a strike, or a hold taken for a throw or a stab (`kind: 'clinch'`, grappling.js).
  const { art: name, zone } = chooseArt(world, fighter, man);
  const spec = MOVES[name];
  if (spec.kind === 'clinch') {
    const holding = man && fighter.clinch?.target === man.id;
    if (!man || (!holding && !perform(world, fighter, name))) return false;
    fighter.clinch.art = { throw: Boolean(spec.throw), then: spec.then ?? null, zone };
  } else {
    if (!throwPunch(world, fighter, name, zone ?? spec.zones[0], man ? {} : { at: artIntoAir(world, fighter) })) return false;
    if (spec.trueEdge) fighter.punch.edgeTilt = 0;
  }
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
