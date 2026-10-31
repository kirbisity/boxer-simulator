// A hand grenade (weapons.js THROWABLES: the modern infantryman's frag, a SWAT officer's flashbang), carried one to a kit
// that has one (outfits.js `throwable`), thrown once and gone. Nothing here is a damage figure: the throw is a body in the
// air under gravity, and what goes off is the physics of what it throws out.
//
// The throw (THROW): the pin pulled at the chest with the hand that has no weapon in it (the off hand behind a gun), the arm
// cocked back high behind the head with the shoulder turned away, then whipped over and let go, lobbed at a soldier's arc to
// fall on the mark (as fast as that needs, up to what an arm can give it; off the mark by his skill). The fuse burns from the
// pin: the throw takes most of a second of a frag's 4.5 s and of a flashbang's 1.5 s, the rest in the air and on the ground.
// Knocked down, netted or brought to his knees with it in his hand, he lets it fall where he is: it is live.
//
// In the air (world.thrown): it falls, bounces off the floor (what it keeps of its speed: THROW.bounce, keep) and rolls to a
// stop. At the end of its fuse it goes off:
// - the blast pushes every body near as an impulse falling with distance (`blast`), through the same delivery as a blow's
//   (physics.js deliverImpulse: what his legs cannot take puts him down); harder than half his footing takes, he reels;
// - a frag's fragments: each man takes as many as his body presents of the half sphere above the ground at his distance, each
//   a projectile traced from the burst to a point on him through everyone (the first body on the line takes it: a man shields
//   the one behind him, a shield stops it) and wounding as a round does (physics/ranged.js bulletHit: his armour's bullet
//   protection, proof against so small a fragment, takes its share), with the energy it still has;
// - a flashbang's flash and bang: dazed (physics.js daze: slower, weaker, swaying) for seconds by his distance, less with his
//   back to it or a wall between (flash.stun, away, hidden), slack in the limbs for a share of that (fighter.stun), and set
//   reeling near its foot; it wounds no one.
// A wall of a stage's terrain between the burst and a man (terrain.js rayBlocked) keeps its fragments and its flash off him.
//
// The AI (ai.js, `throwChoice`): a man with one throws it at several enemies close together at a throw's distance (the
// throwable's `ai`), never with a man of his own near where it will fall and never while an enemy is at arm's length.

import { soundEvent } from '../audio/log.js';
import { P, PARTICLES } from '../body.js';
import { vec } from '../pose.js';
import { THROW, THROWABLES } from '../weapons.js';
import { WORLD } from './config.js';
import { rayBlocked } from './terrain.js';
import { bulletHit, firstHit } from './ranged.js';
import { capsuleEnds, capsules, daze, floorUnder, hostile, inFight, opponentFor, point, stagger } from '../physics.js';

// Every particle, an equal share of the push each (deliverImpulse weighs them by mass: the whole body is moved alike).
const WHOLE_BODY = PARTICLES.map((name, index) => [index, 1]);

/** What a kit's man carries (gear.throwable, outfits.js gearTraits): { kind, left } or undefined. */
export function carriedThrowable(gear) {
  const kind = gear?.throwable;
  return THROWABLES[kind] ? { kind, left: 1 } : undefined;
}

/** The throwable he has still to throw (its spec, weapons.js THROWABLES), or null. */
export function throwableOf(fighter) {
  return fighter?.throwable?.left > 0 ? THROWABLES[fighter.throwable.kind] : null;
}

/**
 * Why he cannot throw it this instant ('none': nothing to throw; 'busy': down, mid-blow, held, bound, mounted), or null. A gun
 * being aimed or fired is no bar: he lowers it to throw (startThrow).
 */
export function throwBlocked(fighter) {
  if (!throwableOf(fighter)) return 'none';
  if (fighter.state !== 'up' || fighter.throwing || (fighter.punch && fighter.punch.spec.path !== 'aim') || fighter.crawling || fighter.netted || fighter.pain || fighter.clinch || fighter.pin || fighter.mount) return 'busy';
  return null;
}

/** The hand it is thrown with: the one with no weapon in it (the off hand behind a gun or a sword), else his right. */
function throwingHand(fighter) {
  return fighter.weapon?.held ? (fighter.weapon.off ?? 'l') : 'r';
}

/** Where on the floor a man stands (under his hips). */
function feetOf(world, man) {
  const hips = point(man.x, P.pelvis);
  return [hips[0], floorUnder(world.arena, hips[2], hips[0], hips[1] - 0.8), hips[2]];
}

/** Where the player's throw goes: at the man he is on (locked, or the nearest enemy) within THROW.reach, else THROW.ahead m straight on. */
export function throwMark(world, fighter) {
  const man = opponentFor(world, fighter);
  const hips = point(fighter.x, P.pelvis);
  if (man && inFight(man) && Math.hypot(man.x[P.pelvis * 3] - hips[0], man.x[P.pelvis * 3 + 2] - hips[2]) <= THROW.reach) return feetOf(world, man);
  const x = hips[0] + Math.cos(fighter.yaw) * THROW.ahead;
  const z = hips[2] - Math.sin(fighter.yaw) * THROW.ahead;
  return [x, floorUnder(world.arena, z, x, hips[1]), z];
}

/** Pull the pin and begin the throw at `mark` (a point on the floor). Spends the one he has. Returns whether he threw. */
export function startThrow(world, fighter, mark = throwMark(world, fighter)) {
  if (throwBlocked(fighter) !== null) return false;
  const spec = throwableOf(fighter);
  // (A shot being aimed is given up: the gun comes down for the throw.)
  fighter.punch = null;
  fighter.throwable.left -= 1;
  fighter.throwing = { kind: fighter.throwable.kind, hand: throwingHand(fighter), t: 0, mark, lit: world.time, released: false };
  world.events.push({ time: world.time, kind: 'pin', fighter: fighter.id, throwable: fighter.throwable.kind, effects: [`pulls the pin of a ${spec.name}`] });
  return true;
}

/** The throw under way, each step: let go at THROW.release; dropped, live, if he goes down or is bound with it in his hand. */
export function stepThrow(world, fighter, dt) {
  const throwing = fighter.throwing;
  throwing.t += dt;
  if (!throwing.released && (fighter.state !== 'up' || fighter.netted || fighter.pain || fighter.crawling)) {
    letGo(world, fighter, throwing, null);
    fighter.throwing = null;
    return;
  }
  if (!throwing.released && throwing.t >= THROW.release) letGo(world, fighter, throwing, throwing.mark);
  if (throwing.t >= THROW.seconds) fighter.throwing = null;
}

/** A standard normal number. */
function gauss(random) {
  return Math.sqrt(-2 * Math.log(1 - random() * 0.999999)) * Math.cos(2 * Math.PI * random());
}

/**
 * The speed to lob it from `from` onto `to` at THROW.angle over the horizontal, no faster than THROW.speedMost (a mark too far
 * for his arm is fallen short of), as a velocity.
 */
export function lobVelocity(from, to) {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const distance = Math.hypot(dx, dz);
  const cos = Math.cos(THROW.angle);
  const tan = Math.tan(THROW.angle);
  const below = 2 * cos * cos * (distance * tan - (to[1] - from[1]));
  const speed = Math.min(THROW.speedMost, below > 0 ? Math.sqrt((WORLD.gravity * distance * distance) / below) : THROW.speedMost);
  const way = distance > 1e-3 ? [dx / distance, dz / distance] : [1, 0];
  return [way[0] * speed * cos, speed * Math.sin(THROW.angle), way[1] * speed * cos];
}

/** It leaves his hand: thrown at `mark` (off it by his skill), or let fall (null) with the hand's own motion. */
function letGo(world, fighter, throwing, mark) {
  throwing.released = true;
  const spec = THROWABLES[throwing.kind];
  const handIndex = P[`${throwing.hand}Hand`];
  const from = point(fighter.x, handIndex);
  let velocity;
  if (mark) {
    const hips = point(fighter.x, P.pelvis);
    let to = [...mark];
    // Not further than an arm throws (THROW.reach); off the mark by a share of the distance, wider the less skilled.
    const off = [to[0] - hips[0], to[2] - hips[2]];
    const distance = Math.hypot(off[0], off[1]);
    if (distance > THROW.reach) to = [hips[0] + (off[0] / distance) * THROW.reach, to[1], hips[2] + (off[1] / distance) * THROW.reach];
    const sigma = THROW.spread * Math.min(distance, THROW.reach) * (1.5 - (fighter.body.skill ?? 0.5));
    to = [to[0] + gauss(world.random) * sigma, to[1], to[2] + gauss(world.random) * sigma];
    velocity = lobVelocity(from, to);
  } else velocity = vec.scale(point(fighter.v, handIndex), 0.5);
  world.thrown ??= [];
  world.thrown.push({ id: world.thrown.length, kind: throwing.kind, owner: fighter.id, x: from, v: velocity, fuseAt: throwing.lit + spec.fuse, resting: false, done: false });
  world.events.push({ time: world.time, kind: 'thrown', fighter: fighter.id, throwable: throwing.kind, effects: [mark ? `throws a ${spec.name}` : `drops a live ${spec.name}`] });
}

/** Grenades in the air and on the ground, each step: falling, bouncing, rolling to a stop; at the end of the fuse, gone off. */
export function flyThrown(world, dt) {
  for (const item of world.thrown) {
    if (item.done) continue;
    if (world.time >= item.fuseAt) {
      item.done = true;
      detonate(world, item);
      continue;
    }
    if (item.resting) continue;
    const spec = THROWABLES[item.kind];
    item.v[1] -= WORLD.gravity * dt;
    const next = vec.add(item.x, vec.scale(item.v, dt));
    const floor = floorUnder(world.arena, next[2], next[0], item.x[1]);
    if (next[1] - spec.radius <= floor) {
      next[1] = floor + spec.radius;
      if (item.v[1] < -1) {
        // Down hard: it bounces, losing most of its speed to the ground.
        item.v = [item.v[0] * THROW.keep, -item.v[1] * THROW.bounce, item.v[2] * THROW.keep];
      } else {
        // Rolling: slowed by the ground to a stop.
        item.v[1] = 0;
        const speed = Math.hypot(item.v[0], item.v[2]);
        const left = Math.max(0, speed - THROW.roll * dt);
        if (left < 0.05) item.resting = true;
        item.v[0] = speed > 0 ? (item.v[0] * left) / speed : 0;
        item.v[2] = speed > 0 ? (item.v[2] * left) / speed : 0;
      }
    }
    item.x = next;
  }
  if (world.thrown.length > 16 && world.thrown.every((item) => item.done)) world.thrown = [];
}

/** Whether a stage's walls stand between two points (none on an open field). */
function walled(world, from, to) {
  const terrain = world.arena?.terrain;
  return Boolean(terrain) && rayBlocked(terrain, [from[0], from[2]], [to[0], to[2]], from[1], to[1]);
}

/** The value of a [distance, value] table at `distance`, straight between its rows (0 past the last). */
function byDistance(rows, distance) {
  if (distance <= rows[0][0]) return rows[0][1];
  for (let index = 1; index < rows.length; index += 1) {
    const [d1, v1] = rows[index];
    const [d0, v0] = rows[index - 1];
    if (distance <= d1) return v0 + ((v1 - v0) * (distance - d0)) / (d1 - d0);
  }
  return 0;
}

/** It goes off where it lies: the blast on everyone near, a frag's fragments, a flashbang's flash. */
function detonate(world, item) {
  const spec = THROWABLES[item.kind];
  const owner = world.fighters[item.owner];
  const burst = [item.x[0], item.x[1] + 0.05, item.x[2]];
  const event = { time: world.time, kind: 'blast', throwable: item.kind, attacker: item.owner, point: [...burst], felt: [], effects: [`the ${spec.name} goes off`] };
  world.events.push(event);
  // Heard over the whole field (audio/log.js: a blast is map-wide, as a gun's report).
  if (world.ear) soundEvent(world, 'shot', { at: burst, kind: item.kind, who: item.owner });
  const reach = Math.max(spec.blast.reach, spec.fragments ? spec.reach : 0, spec.flash ? spec.flash.stun[spec.flash.stun.length - 1][0] : 0);
  for (const man of world.fighters) {
    if (man.state === 'out' || man.dormant) continue;
    const chest = vec.lerp(point(man.x, P.pelvis), point(man.x, P.neck), 0.5);
    const off = vec.sub(chest, burst);
    const distance = vec.length(off);
    if (distance > reach) continue;
    const hidden = walled(world, burst, chest);
    // (Who felt it, and how near: the drawing's flash and the ear's ringing for the man played.)
    const felt = { id: man.id, distance, flash: 0 };
    event.felt.push(felt);
    if (!hidden) blastOn(world, man, spec.blast, off, distance, event);
    if (spec.fragments && !hidden) fragmentsInto(world, owner, spec, man, burst, distance, event);
    if (spec.flash) felt.flash = flashOn(world, man, spec.flash, burst, distance, hidden, event);
  }
}

/** The shock's push on a body: `blast.impulse` N·s at 1 m, as 1/d, away from the burst and a little up; hard enough, he reels. */
function blastOn(world, man, blast, off, distance, event) {
  if (distance > blast.reach) return;
  const impulse = blast.impulse / Math.max(blast.near, distance);
  const flat = Math.hypot(off[0], off[2]);
  const direction = vec.normalize([off[0], 0.3 * flat + 0.1, off[2]]);
  world.pendingImpulses.push({ fighter: man, shares: WHOLE_BODY, direction, impulse });
  // A push of half what takes his feet from under him (WORLD.balance.speed) and more rocks him.
  const severity = (2 * impulse) / man.body.massKg / WORLD.balance.speed;
  if (severity >= WORLD.stagger.startAt) stagger(world, man, severity, event, true);
}

/** A Poisson draw of mean `mean` (how many of a frag's fragments a man's body is in the way of). */
function poisson(mean, random) {
  const limit = Math.exp(-mean);
  let count = 0;
  let product = random();
  while (product > limit && count < 200) {
    count += 1;
    product *= random();
  }
  return count;
}

/**
 * A frag's fragments into a man: as many as his body presents of the half sphere above the ground (his capsules' area square to
 * the line from the burst, over 2πd²), drawn at random (up to THROWABLES.raysMost), each traced from the burst to a point on a
 * part of him (the first body on the line takes it) and wounding by the energy it still has at that distance.
 */
function fragmentsInto(world, owner, spec, man, burst, distance, event) {
  if (distance > spec.reach) return;
  const parts = [];
  let area = 0;
  for (const capsule of capsules(man)) {
    const [a, b] = capsuleEnds(man, capsule);
    const axis = vec.sub(b, a);
    const length = vec.length(axis);
    const towards = vec.normalize(vec.sub(vec.lerp(a, b, 0.5), burst));
    const across = length > 1e-6 ? vec.length(vec.cross(vec.scale(axis, 1 / length), towards)) : 0;
    const presented = 2 * capsule.radius * length * across + Math.PI * capsule.radius * capsule.radius;
    parts.push({ a, b, presented });
    area += presented;
  }
  const near = Math.max(0.5, distance);
  const count = Math.min(spec.raysMost, poisson((spec.fragments * area) / (2 * Math.PI * near * near), world.random));
  for (let ray = 0; ray < count; ray += 1) {
    let pick = world.random() * area;
    const part = parts.find((entry) => (pick -= entry.presented) <= 0) ?? parts[parts.length - 1];
    const aim = vec.lerp(part.a, part.b, world.random());
    const direction = vec.normalize(vec.sub(aim, burst));
    const hit = firstHit(world, null, burst, vec.add(aim, vec.scale(direction, 0.4)));
    if (!hit) continue;
    const travelled = vec.length(vec.sub(hit.point, burst));
    const share = Math.exp(-travelled / spec.fade);
    const shot = {
      energy: spec.joules * share,
      lethal: Object.fromEntries(Object.entries(spec.lethal).map(([region, value]) => [region, value * share])),
      bleed: Object.fromEntries(Object.entries(spec.bleed).map(([region, value]) => [region, value * share])),
      impulse: spec.impulse,
      limbBreak: 0,
      killedBy: 'killed by the grenade',
    };
    const wound = { time: world.time, kind: 'fragment', attacker: owner?.id, defender: hit.fighter.id, weapon: 'frag', from: burst, to: hit.point, target: hit.target, point: hit.point, normal: vec.scale(direction, -1), harm: 0, effects: [] };
    world.events.push(wound);
    if (hit.target === 'shield') wound.effects.push('stopped by the shield');
    else if (owner) bulletHit(world, owner, hit, direction, wound, shot);
  }
}

/**
 * A flashbang's flash and bang on a man: dazed for flash.stun's seconds at his distance, less with his back to it (`away`) or a
 * wall between (`hidden`: the bang alone, round the corner); his limbs slack for `stunShare` of it; near its foot, reeling.
 * Returns how much of the flash he took (0..1 of the most at its foot, facing it).
 */
function flashOn(world, man, flash, burst, distance, hidden, event) {
  const most = flash.stun[0][1];
  const seconds = byDistance(flash.stun, distance);
  if (seconds <= 0) return 0;
  const head = point(man.x, P.head);
  const to = [burst[0] - head[0], burst[2] - head[2]];
  const length = Math.hypot(to[0], to[1]);
  const facing = length > 1e-3 ? (Math.cos(man.yaw) * to[0] - Math.sin(man.yaw) * to[1]) / length : 1;
  const eyes = hidden ? flash.hidden : flash.away + (1 - flash.away) * Math.min(1, Math.max(0, (facing + 0.2) / 1.2));
  const dazedFor = seconds * eyes;
  const spec = WORLD.daze;
  if (dazedFor >= 0.5) daze(world, man, (dazedFor - spec.minSeconds) / (spec.maxSeconds - spec.minSeconds), event);
  man.stun = Math.max(man.stun, dazedFor * flash.stunShare);
  if (!hidden && distance < flash.staggerWithin) stagger(world, man, WORLD.stagger.startAt + (flash.stagger - WORLD.stagger.startAt) * (1 - distance / flash.staggerWithin), event, true);
  return (seconds / most) * eyes;
}

/**
 * Where an AI man would throw his grenade now, or null: at the middle of the biggest knot of enemies (at least `least` within
 * `within` m of one of them) `from`-`to` m off, with no man of his own within `clear` m of it; never with an enemy within
 * `melee` m of him (he is fighting, not throwing), and only when he could begin the throw.
 */
export function throwChoice(world, fighter, melee) {
  const spec = throwableOf(fighter);
  if (!spec || throwBlocked(fighter) !== null) return null;
  const ai = spec.ai;
  const hips = point(fighter.x, P.pelvis);
  const flat = (man, at) => Math.hypot(man.x[P.pelvis * 3] - at[0], man.x[P.pelvis * 3 + 2] - at[2]);
  const foes = [];
  const friends = [];
  for (const other of world.fighters) {
    if (other === fighter || !inFight(other)) continue;
    if (hostile(other, fighter)) {
      if (flat(other, hips) < melee) return null;
      if (other.state === 'up') foes.push(other);
    } else if (other.corner === fighter.corner) friends.push(other);
  }
  let best = null;
  for (const foe of foes) {
    const at = point(foe.x, P.pelvis);
    const distance = flat(foe, hips);
    if (distance < ai.from || distance > ai.to) continue;
    const knot = foes.filter((other) => flat(other, at) <= ai.within);
    if (knot.length < ai.least || (best && knot.length <= best.knot.length)) continue;
    const middle = [0, 1, 2].map((axis) => knot.reduce((sum, other) => sum + other.x[P.pelvis * 3 + axis], 0) / knot.length);
    if (Math.hypot(middle[0] - hips[0], middle[2] - hips[2]) < ai.from) continue;
    if (friends.some((friend) => flat(friend, middle) <= ai.clear)) continue;
    best = { knot, mark: [middle[0], floorUnder(world.arena, middle[2], middle[0], middle[1]), middle[2]] };
  }
  return best?.mark ?? null;
}

/**
 * The throw's pose (physics.js updateIntent): the throwing hand at the chest for the pin, back high behind the head with the
 * shoulder turned away, over and forward to let go, following through; the body leaning back into it and forward through it.
 */
const THROW_KEYS = [
  // [share of THROW's times: 0 the start, 1 pin, 2 cocked, 3 release, 4 the end], hand (× height: forward, up, out to his side), twist (toward the hand's side), lean.
  { at: 0, hand: [0.17, 0.62, 0.08], twist: 0, lean: 0 },
  { at: THROW.pin, hand: [0.15, 0.68, 0.06], twist: 0, lean: 0 },
  { at: (THROW.pin + THROW.release) / 2 + 0.05, hand: [-0.14, 0.98, 0.16], twist: -0.6, lean: -0.08 },
  { at: THROW.release, hand: [0.2, 0.96, 0.04], twist: 0.5, lean: 0.15 },
  { at: THROW.seconds, hand: [0.3, 0.62, -0.02], twist: 0.3, lean: 0.1 },
];

export function throwPose(fighter, intent) {
  const throwing = fighter.throwing;
  const H = fighter.body.heightM;
  const side = throwing.hand === 'l' ? 1 : -1;
  let index = 1;
  while (index < THROW_KEYS.length - 1 && throwing.t > THROW_KEYS[index].at) index += 1;
  const from = THROW_KEYS[index - 1];
  const to = THROW_KEYS[index];
  const share = Math.min(1, Math.max(0, (throwing.t - from.at) / Math.max(1e-3, to.at - from.at)));
  const ease = share * share * (3 - 2 * share);
  const hand = vec.lerp(from.hand, to.hand, ease);
  intent[`${throwing.hand}Hand`] = [hand[0] * H, hand[1] * H, hand[2] * H * side];
  intent.twist += side * (from.twist + (to.twist - from.twist) * ease);
  intent.lean += from.lean + (to.lean - from.lean) * ease;
  intent.twoHanded = false;
}
