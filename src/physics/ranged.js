// Shooting: guns (aim, fire, rounds and pellets, recoil, reload) and bows
// (draw, loose, arrows in flight). What a round or an arrow does to a body
// is here; what a body is, and how it moves, is in ../physics.js.

import { buildBody, FRAMES, normaliseInputs, P, PRESETS } from '../body.js';
import { STYLES } from '../moves.js';
import { OUTFITS, outfitOf } from '../outfits.js';
import { aimPoint, BLOCKING, breakJoint, capsules, closestBetween, dropWeapon, knockOut, point, protectionAt, shieldDisc, stagger, strainGrip, toLocal, toWorld } from '../physics.js';
import { caloriesForWeight } from '../physiology.js';
import { vec, yawRotate } from '../pose.js';
import { ARROW, bulletProof, bulletRegion, GUN, slerpDir } from '../weapons.js';
import { WORLD } from './config.js';

/**
 * The gun arm for a shot: up from the guard and out along the line from the
 * shoulder to the target, which it tracks until the shot; down after.
 */
export function aimTargets(world, fighter, punch, guard) {
  const spec = punch.spec;
  const target = world.fighters[punch.target];
  if (target && !punch.fired) punch.aim = toLocal(fighter, aimPoint(target, punch.zone));
  const raised = raisedAim(fighter, punch.aim);
  const smooth = (value) => value * value * (3 - 2 * value);
  const up = Math.min(1, punch.t / spec.windup);
  const down = punch.t > spec.extendUntil ? Math.min(1, (punch.t - spec.extendUntil) / (spec.duration - spec.extendUntil)) : 0;
  const share = smooth(up) * (1 - smooth(down));
  return { hand: vec.lerp(guard.hand, raised.hand, share), dir: slerpDir(guard.dir, raised.dir, share) };
}

// The support hand on a two-handed pistol, from the gun hand (heights, local):
// a little behind, below and to the left, cupping the grip.
export const SUPPORT_GRIP = [-0.012, -0.018, 0.022];

/** The gun arm up on a mark (local): out straight from the shoulder along the line to it, locked. */
export function raisedAim(fighter, mark) {
  const side = fighter.weapon.main;
  const shoulder = toLocal(fighter, point(fighter.x, P[`${side}Shoulder`]));
  const lengths = fighter.body.lengths;
  const along = vec.normalize(vec.sub(mark, shoulder));
  // A long gun: the stock at the cheek, the trigger hand just before the
  // shoulder, the support hand out under the barrel.
  if (fighter.weapon.spec.longGun) return { hand: vec.add(vec.add(shoulder, vec.scale(along, LONG_GUN.handOut * lengths.upperArm)), [0, LONG_GUN.cheekRise * lengths.upperArm, 0]), dir: along };
  return { hand: vec.add(shoulder, vec.scale(along, (lengths.upperArm + lengths.forearmToFist) * 0.97)), dir: along };
}

// `comradeClear` (m): a comrade this near the line of a heavy shot (more at
// range, as the spread grows) holds it.
// A long gun held to the cheek, in upper-arm lengths: the trigger hand
// this far out along the line from the shoulder, and raised this much.
// Reloading, the gun stands upright before him (`reloadHand`, heights,
// local; the barrel straight up) while the support hand works the ramrod
// down the muzzle (`ramFrom` + `ramStroke` × a stroke, m along the barrel,
// `ramPerSecond` strokes a second).
export const LONG_GUN = { comradeClear: 0.55, handOut: 0.55, cheekRise: 0.35, reloadHand: [0.14, 0.42, -0.04], ramFrom: 0.5, ramStroke: 0.22, ramPerSecond: 1.4 };

export let referenceSegments = null;

/** The body parts of the man the gun's numbers are for: 80 kg, average build. */
export function bulletReference() {
  if (referenceSegments) return referenceSegments;
  const inputs = normaliseInputs({ ...PRESETS.contender, sex: 'male', heightCm: 178, frame: 'medium', exercise: 0.4, outfit: null, accessories: [] });
  inputs.calories = caloriesForWeight(inputs, GUN.referenceKg, FRAMES.medium.lean);
  referenceSegments = buildBody(inputs).segments;
  return referenceSegments;
}

/** The first thing a round from `from` to `to` meets: a body part or a shield; null if none. */
export function firstHit(world, shooter, from, to) {
  const length = vec.length(vec.sub(to, from));
  const along = vec.scale(vec.sub(to, from), 1 / length);
  let best = null;
  for (const other of world.fighters) {
    if (other === shooter) continue;
    if (other.shield) {
      const disc = shieldDisc(other);
      const facing = vec.dot(along, disc.normal);
      if (Math.abs(facing) > 1e-6) {
        const s = vec.dot(vec.sub(disc.centre, from), disc.normal) / facing / length;
        const at = vec.lerp(from, to, s);
        // On its face: within the disc, or a shaped shield's rectangle (its bend is small beside a round's flight).
        const offset = vec.sub(at, disc.centre);
        const onFace = disc.spec?.shape ? Math.abs(vec.dot(offset, disc.up)) < disc.spec.height / 2 && Math.abs(vec.dot(offset, disc.across)) < disc.spec.width / 2 : vec.length(offset) < disc.radius;
        if (s > 0 && s < 1 && onFace && (!best || s < best.s)) best = { fighter: other, target: 'shield', s, point: at };
      }
    }
    for (const capsule of capsules(other)) {
      const meet = closestBetween(from, to, point(other.x, capsule.a), point(other.x, capsule.b));
      const miss = vec.length(vec.sub(meet.onFirst, meet.onSecond));
      if (miss > capsule.radius) continue;
      // The trunk's rounded top above the neck is the head's to take, not the chest's.
      if (capsule.key === 'trunk' && meet.t > 0.98 && meet.onFirst[1] > other.x[P.neck * 3 + 1]) continue;
      // Back along the line to where it enters the part.
      const s = Math.max(0, meet.s - Math.sqrt(capsule.radius * capsule.radius - miss * miss) / length);
      // Above the chest (past the trunk's top as a blow meets it) is the throat:
      // no vest covers it, and a round there is as deadly as one to the head.
      const throat = capsule.key === 'trunk' && capsule.bLength && meet.t > capsule.bLength;
      if (!best || s < best.s) best = { fighter: other, capsule, target: throat ? 'throat' : capsule.key, throat, s, point: vec.lerp(from, to, s) };
    }
  }
  return best;
}

/** Whether the barrel has come onto the line from the muzzle to the mark: then he fires. */
export function sightsOn(fighter) {
  const weapon = fighter.weapon;
  if (!weapon?.held || !fighter.punch?.aim) return true;
  const hand = point(fighter.x, P[`${weapon.main}Hand`]);
  const toMark = vec.normalize(vec.sub(toWorld(fighter, fighter.punch.aim), hand));
  if (vec.dot(toMark, weapon.dir) <= Math.cos(GUN.settled)) return false;
  // A shouldered gun is fired once it has stopped swinging onto the mark.
  if (!weapon.spec.longGun) return true;
  const swinging = vec.length(vec.sub(point(fighter.v, P[`${weapon.main}Hand`]), point(fighter.v, P[`${weapon.main}Shoulder`])));
  return swinging < GUN.steadyBelow;
}

/**
 * The bow up on the mark: the stave upright across the line of the arrow,
 * the string hand drawing back to the cheek as the shot comes (`draw` 0..1,
 * kept on the weapon for the drawing of the string).
 */
export function drawBow(world, fighter, punch, target, intent) {
  const weapon = fighter.weapon;
  const mark = punch?.aim ?? (world.fighters[fighter.aimAt] ? toLocal(fighter, aimPoint(world.fighters[fighter.aimAt], 'body')) : null);
  if (!mark) return target;
  const shoulder = toLocal(fighter, point(fighter.x, P[`${weapon.main}Shoulder`]));
  const along = vec.normalize(vec.sub(mark, shoulder));
  const smooth = (value) => value * value * (3 - 2 * value);
  const drawing = punch?.spec.path === 'aim' ? (punch.fired ? 0 : smooth(Math.min(1, punch.t / (punch.quick ? punch.spec.quickFireAt : punch.spec.fireAt)))) : 0.12;
  weapon.draw = drawing;
  weapon.facing = yawRotate(along, fighter.yaw);
  // The string hand: from beside the grip back along the arrow to the cheek.
  const head = toLocal(fighter, point(fighter.x, P.head));
  const anchor = vec.add(head, [0.02, -0.07, -0.05]);
  const rest = vec.sub(target.hand, vec.scale(along, 0.12));
  intent[`${weapon.off}Hand`] = vec.lerp(rest, anchor, drawing);
  // The stave across the line: upright, canted a little.
  const up = vec.normalize(vec.sub([0.05, 1, 0], vec.scale(along, along[1])));
  return { hand: target.hand, dir: up };
}

/** Loose: an arrow off the bow along the line to the mark, aimed high for the drop. */
export function loose(world, fighter) {
  const punch = fighter.punch;
  const weapon = fighter.weapon;
  const grip = point(fighter.x, P[`${weapon.main}Hand`]);
  const mark = punch.aim ? toWorld(fighter, punch.aim) : vec.add(grip, yawRotate([1, 0, 0], fighter.yaw));
  const line = vec.sub(mark, grip);
  const distance = vec.length(line);
  let dir = vec.normalize(line);
  // Aimed above the mark by the drop over the distance.
  const speed = weapon.spec.arrowSpeed ?? ARROW.speed;
  const lift = Math.min(0.3, 0.5 * Math.asin(Math.min(1, (ARROW.gravity * distance) / speed ** 2)));
  dir = vec.normalize(vec.add(dir, [0, Math.tan(lift), 0]));
  const moving = Math.hypot(...(fighter.rootVelocity ?? [0, 0]));
  const spread = (ARROW.spread + GUN.movingSpread * moving) * (fighter.stagger > 0 ? GUN.reelingSpread : 1);
  const random = world.random;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - random() * 0.999999)) * Math.cos(2 * Math.PI * random());
  const across = vec.normalize(vec.cross(dir, [0, 1, 0]));
  const upward = vec.cross(across, dir);
  dir = vec.normalize(vec.add(dir, vec.add(vec.scale(across, gauss() * spread), vec.scale(upward, gauss() * spread))));
  world.arrows.push({ id: world.arrows.length, owner: fighter.id, x: vec.add(grip, vec.scale(dir, 0.08)), v: vec.scale(dir, speed), speed, age: 0, landed: false, done: false });
  world.events.push({ time: world.time, kind: 'loosed', attacker: fighter.id, effects: [] });
  // The bow kicks forward a little in the hand as the string goes.
  world.pendingImpulses.push({ fighter, shares: [[P[`${weapon.main}Hand`], 1]], direction: dir, impulse: 0.6 });
}

/** Arrows in the air: they fall, and the first thing on their path takes them. */
export function flyArrows(world, dt) {
  for (const arrow of world.arrows) {
    if (arrow.done) continue;
    arrow.age += dt;
    if (arrow.landed) {
      if (arrow.age > ARROW.stays) arrow.done = true;
      continue;
    }
    arrow.v[1] -= ARROW.gravity * dt;
    const to = vec.add(arrow.x, vec.scale(arrow.v, dt));
    const hit = firstHit(world, world.fighters[arrow.owner], arrow.x, to);
    if (hit) {
      arrowHit(world, world.fighters[arrow.owner], hit, vec.normalize(arrow.v), ((arrow.speed ?? ARROW.speed) / ARROW.speed) ** 2);
      arrow.done = true;
      arrow.x = hit.point;
      continue;
    }
    arrow.x = to;
    if (arrow.x[1] <= 0.02 || Math.abs(arrow.x[0]) > 60 || Math.abs(arrow.x[2]) > 60) {
      arrow.x[1] = Math.max(0.02, arrow.x[1]);
      arrow.landed = true;
      arrow.age = 0;
    }
  }
  // Long gone arrows are dropped from the list now and then.
  if (world.arrows.length > 64 && world.arrows.every((arrow, index) => index > 32 || arrow.done)) world.arrows = world.arrows.filter((arrow) => !arrow.done);
}

/**
 * An arrow strikes: off a shield, or off good armour (most of the time),
 * it glances; otherwise a piercing wound (cut by the armour's pierce
 * protection), scaled to the part's weight and hurt, bleeding, with a
 * small knock; enough and he dies.
 */
export function arrowHit(world, shooter, hit, dir, energy = 1) {
  const victim = hit.fighter;
  const event = { time: world.time, kind: 'arrow', attacker: shooter.id, defender: victim.id, point: hit.point, normal: vec.scale(dir, -1), target: hit.target, harm: 0, effects: [] };
  world.events.push(event);
  if (hit.target === 'shield') {
    event.bounced = true;
    event.effects.push('in the shield');
    return;
  }
  const gear = victim.body.gear;
  const key = hit.capsule.key;
  world.pendingImpulses.push({ fighter: victim, shares: [[hit.capsule.a, 0.5], [hit.capsule.b, 0.5]], direction: dir, impulse: ARROW.impulse });
  if (gear.arrowproof && world.random() < ARROW.bounce) {
    event.bounced = true;
    event.effects.push('glances off the armour');
    return;
  }
  const region = hit.throat ? 'head' : bulletRegion(key);
  // Full armour (plate, lamellar) guards the throat with its gorget or aventail; a vest does not.
  const stopped = gear.arrowproof ? 1 - ARROW.gapHarm : hit.throat ? 0 : protectionAt(gear, key).pierce ?? 0;
  const own = victim.body.segments[key];
  const reference = bulletReference()[key];
  const scale = own && reference ? reference.mass / own.mass : 1;
  // `energy`: the arrow's kinetic energy against a long bow's (ARROW.speed).
  const harm = ARROW.lethal[region] * energy * (1 - stopped) * scale * (1 + GUN.hurtShare * (victim.damage[key] ?? 0));
  // The same pool of deadly wounds as a gun's.
  victim.gunshot = (victim.gunshot ?? 0) + harm;
  victim.damage[key] = Math.min(1, (victim.damage[key] ?? 0) + harm);
  victim.damageVersion += 1;
  victim.bleed = (victim.bleed ?? 0) + ARROW.bleed[region] * (1 - stopped) * scale;
  victim.bleedOutside = (victim.bleedOutside ?? 0) + ARROW.bleed[region] * (1 - stopped) * scale;
  Object.assign(event, { harm, region, pierce: harm * 60 });
  event.effects.push(gear.arrowproof ? `${region}: through a gap` : `${region}`);
  shooter.stats.landed += 1;
  if (victim.weapon?.held && key.startsWith(victim.weapon.main) && BLOCKING.has(key) && world.random() < 0.3) dropWeapon(world, victim, 'disarmed', dir);
  if (victim.gunshot >= 1 && victim.state !== 'out') knockOut(world, victim, event, region === 'head' ? 'an arrow through the head' : 'shot down by arrows', 'killed');
}

/**
 * Reloading a fired gun (a matchlock): only while he means to (`reloading`,
 * set by the AI or the player), standing, and not in the middle of a move;
 * stopped, the work done so far is kept. Done, the gun is loaded.
 */
export function reload(world, fighter, dt) {
  const weapon = fighter.weapon;
  if (!weapon?.held || !weapon.spec.shot || weapon.loaded) return;
  if (!fighter.reloading || fighter.state !== 'up' || fighter.punch) return;
  // Loading takes both hands and a standing man: walking on, it waits.
  if (Math.hypot(...(fighter.rootVelocity ?? [0, 0])) > WORLD.reloadMaxSpeed) return;
  weapon.reloaded = (weapon.reloaded ?? 0) + dt;
  if (weapon.reloaded < weapon.spec.shot.reloadSeconds) return;
  weapon.loaded = true;
  weapon.charges = weapon.spec.shot.rounds ?? weapon.spec.shot.barrels ?? 1;
  fighter.reloading = false;
  world.events.push({ time: world.time, kind: 'reloaded', fighter: fighter.id, effects: [] });
}

/** Fired out: a style that fights on with the empty gun (`emptyStyle`) takes it up as a club. */
export function emptied(world, fighter) {
  const next = STYLES[fighter.style]?.emptyStyle;
  if (!next) return;
  fighter.weapon.spent = true;
  fighter.style = next;
  fighter.aimAt = undefined;
  world.events.push({ time: world.time, kind: 'drew', fighter: fighter.id, weapon: fighter.weapon.kind, effects: ['swings the empty gun as a club'] });
}

/**
 * Whether the first man on the line the shot would take (through the sights
 * to the mark, as fire() aims it, less its random error), or near it, is on
 * his own side.
 */
export function comradeInLine(world, fighter) {
  const weapon = fighter.weapon;
  const muzzleAt = weapon.spec.muzzle ?? GUN.muzzle;
  const from = vec.add(point(fighter.x, P[`${weapon.main}Hand`]), vec.scale(weapon.dir, muzzleAt[0]));
  const mark = fighter.punch?.aim ? toWorld(fighter, fighter.punch.aim) : vec.add(from, weapon.dir);
  const dir = slerpDir(vec.normalize(vec.sub(mark, from)), weapon.dir, GUN.barrelShare);
  const hit = firstHit(world, fighter, from, vec.add(from, vec.scale(dir, GUN.range)));
  if (hit && hit.fighter.corner === fighter.corner && hit.fighter.state !== 'out') return true;
  // The ball wanders: a comrade close beside the line, short of the mark, is at risk too.
  const reach = hit ? vec.length(vec.sub(hit.point, from)) : GUN.range;
  return world.fighters.some((mate) => {
    if (mate === fighter || mate.corner !== fighter.corner || mate.state === 'out') return false;
    const offset = vec.sub(point(mate.x, P.pelvis), from);
    const along = vec.dot(offset, dir);
    // The ball's spread widens with the range: three of its deviations, beyond a body's breadth.
    const clear = LONG_GUN.comradeClear + 3 * (weapon.spec.shot?.spread ?? GUN.spread) * along;
    return along > 0 && along < reach + 0.5 && vec.length(vec.sub(offset, vec.scale(dir, along))) < clear;
  });
}

/** Fire: a round down the barrel's line as it is, give or take the aim's error. */
export function fire(world, fighter) {
  const punch = fighter.punch;
  punch.fired = true;
  const weapon = fighter.weapon;
  if (!weapon?.held || !weapon.spec.ranged) return;
  if (weapon.spec.bow) return loose(world, fighter);
  // A gun with a charge to load (a matchlock) fires only loaded, and once.
  const shot = weapon.spec.shot ?? null;
  const random = world.random;
  if (shot) {
    if (!weapon.loaded) return;
    // A comrade on the line: he holds the shot (and keeps the charge).
    if (comradeInLine(world, fighter)) return;
    // Several barrels (the three-eyed gun) or a magazine (`rounds`): each shot in turn, empty after the last.
    weapon.charges = (weapon.charges ?? shot.rounds ?? shot.barrels ?? 1) - 1;
    weapon.loaded = weapon.charges > 0;
    weapon.reloaded = 0;
    if (!weapon.loaded) emptied(world, fighter);
    if (random() < shot.misfire) {
      world.events.push({ time: world.time, kind: 'misfire', fighter: fighter.id, effects: ['flash in the pan'] });
      return;
    }
  }
  const handIndex = P[`${weapon.main}Hand`];
  const barrel = weapon.dir;
  const up = vec.normalize(vec.sub([0, 1, 0], vec.scale(barrel, barrel[1])));
  const across = vec.normalize(vec.cross(barrel, up));
  const muzzleAt = weapon.spec.muzzle ?? GUN.muzzle;
  const muzzle = vec.add(vec.add(point(fighter.x, handIndex), vec.scale(barrel, muzzleAt[0])), vec.scale(up, muzzleAt[1]));
  const moving = Math.hypot(...(fighter.rootVelocity ?? [0, 0]));
  // The hand still moving from the last kick (or anything else) throws the
  // shot. A long gun is braced in the shoulder and moves with the body (its
  // walk is `moving`): only its motion against the shoulder throws it.
  const handVelocity = point(fighter.v, handIndex);
  const shaking = vec.length(weapon.spec.longGun ? vec.sub(handVelocity, point(fighter.v, P[`${weapon.main}Shoulder`])) : handVelocity);
  // A strong man holds a gun steady; a weak one shakes.
  const strength = fighter.body.strikeForce[handIndex];
  const recoil = WORLD.recoil;
  const steadiness = Math.min(recoil.shakiest, Math.max(recoil.steadiest, Math.sqrt(recoil.reference / Math.max(1, strength))));
  const spread = ((shot?.spread ?? GUN.spread) + (shot?.movingSpread ?? GUN.movingSpread) * moving + GUN.unsettled * shaking) * steadiness * (fighter.stagger > 0 ? GUN.reelingSpread : 1) * (STYLES[fighter.style]?.aimJitter ? 2 : 1);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - random() * 0.999999)) * Math.cos(2 * Math.PI * random());
  // Aimed through the sights at the mark: off by the aim's error, and by
  // part of however far the barrel itself is off that line.
  const mark = punch.aim ? toWorld(fighter, punch.aim) : vec.add(muzzle, barrel);
  const sighted = vec.normalize(vec.sub(mark, muzzle));
  const aimed = slerpDir(sighted, barrel, GUN.barrelShare);
  const dir = vec.normalize(vec.add(aimed, vec.add(vec.scale(up, gauss() * spread), vec.scale(across, gauss() * spread))));
  // A shotgun's pellets (`pellets`) open out round the aimed line (`pellet` rad); anything else is one round.
  for (let pellet = 0; pellet < (shot?.pellets ?? 1); pellet += 1) {
    const flight = shot?.pellets ? vec.normalize(vec.add(dir, vec.add(vec.scale(up, gauss() * shot.pellet), vec.scale(across, gauss() * shot.pellet)))) : dir;
    const end = vec.add(muzzle, vec.scale(flight, GUN.range));
    const hit = firstHit(world, fighter, muzzle, end);
    const event = { time: world.time, kind: 'shot', attacker: fighter.id, defender: hit?.fighter.id, weapon: weapon.kind, from: muzzle, to: hit?.point ?? end, target: hit?.target ?? null, point: hit?.point ?? end, normal: vec.scale(flight, -1), harm: 0, effects: [] };
    world.events.push(event);
    if (hit?.target === 'shield') event.effects.push('stopped by the shield');
    else if (hit) bulletHit(world, fighter, hit, flight, event, shot);
    else event.effects.push('missed');
  }
  // The gun kicks up and back in the hand.
  // Into both hands (both on the gun in the stance), the arms and the shoulders: a heavy man barely moves, a light one rocks.
  // A long gun's stock drives back into the shoulder and the cheek as well.
  const support = fighter.aimAt !== undefined || weapon.spec.longGun ? [[P[`${weapon.off}Hand`], 0.6], [P[`${weapon.off}Elbow`], 0.3]] : [];
  const stock = weapon.spec.longGun ? [[P[`${weapon.main}Shoulder`], 0.9], [P.neck, 0.4], [P.head, 0.25]] : [[P[`${weapon.main}Shoulder`], 0.25]];
  const kick = shot?.recoil ?? GUN.recoil;
  world.pendingImpulses.push({ fighter, shares: [[handIndex, 1], [P[`${weapon.main}Elbow`], 0.5], ...stock, ...support], direction: vec.normalize(vec.add(vec.scale(barrel, -1), vec.scale(up, weapon.spec.longGun ? 0.35 : 0.8))), impulse: kick });
  // More kick than the arm can take: it snaps at the elbow.
  const peak = kick / (shot?.recoilSeconds ?? (weapon.spec.longGun ? recoil.longGunSeconds : recoil.seconds));
  const beyond = peak / (recoil.snapOver * strength) - 1;
  if (beyond > 0 && world.random() < beyond * recoil.snapRise && !fighter.broken.has(`${weapon.main}Elbow`)) {
    breakJoint(world, fighter, `${weapon.main}Elbow`);
    world.events.push({ time: world.time, kind: 'recoil', fighter: fighter.id, effects: ['the recoil snapped his arm'] });
  }
  // A long gun kicks the whole man back through the shoulder: a light body
  // takes more speed from the same kick, and past `rockedOver` it reels.
  const rocking = kick / fighter.body.massKg;
  if (weapon.spec.longGun && rocking > recoil.rockedOver) {
    const event = { time: world.time, kind: 'recoil', fighter: fighter.id, effects: ['rocked back by the kick'] };
    world.events.push(event);
    stagger(world, fighter, WORLD.stagger.startAt + recoil.rocked * (rocking / recoil.rockedOver), event, true);
    // What his weight could not soak up wrenches at his hands: shot after shot, he loses the gun.
    strainGrip(world, fighter, kick * (rocking / recoil.rockedOver - 1));
  }
}

/**
 * A round in a body part: its harm (by region, through armour, scaled to
 * the part's weight and how hurt it already is) towards what kills; it
 * bleeds; to the head or body it staggers him at once; enough and he dies.
 */
export function bulletHit(world, shooter, hit, dir, event, shot = null) {
  const victim = hit.fighter;
  const key = hit.capsule.key;
  const region = hit.throat ? 'head' : bulletRegion(key);
  const kind = outfitOf(victim.body.inputs).kind;
  // Armour stops its share of a pistol round; of a heavier ball, only as much
  // as it is proof against. The throat is covered only by full armour's gorget, as the body.
  const covered = hit.throat ? (victim.body.gear.arrowproof ? victim.body.gear.protection.bullet?.torso ?? 0 : 0) : victim.body.gear.protection.bullet?.[region] ?? 0;
  const armour = covered * (shot ? bulletProof(OUTFITS[kind].bulletRating, shot.energy) : 1);
  const own = victim.body.segments[key];
  const reference = bulletReference()[key];
  const scale = own && reference ? reference.mass / own.mass : 1;
  const hurt = 1 + GUN.hurtShare * (victim.damage[key] ?? 0);
  const harm = (shot?.lethal ?? GUN.lethal)[region] * (1 - armour) * scale * hurt;
  victim.gunshot = (victim.gunshot ?? 0) + harm;
  victim.damage[key] = Math.min(1, (victim.damage[key] ?? 0) + harm);
  victim.damageVersion += 1;
  victim.bleed = (victim.bleed ?? 0) + (shot?.bleed ?? GUN.bleed)[region] * (1 - armour) * scale;
  victim.bleedOutside = (victim.bleedOutside ?? 0) + (shot?.bleed ?? GUN.bleed)[region] * (1 - armour) * scale;
  // Hard armour over the part takes the round on its surface: no wound to see.
  // A heavy ball mostly goes through: seen to strike the surface only where the armour held most of it.
  Object.assign(event, { harm, armour, region, plate: armour > 0 && OUTFITS[kind].plated && (!shot || armour >= GUN.platedHolds) ? kind : null });
  event.effects.push(armour > 0 ? `${region}: armour took ${Math.round(armour * 100)}%` : `${region}`);
  shooter.stats.landed += 1;
  world.pendingImpulses.push({ fighter: victim, shares: [[hit.capsule.a, 0.5], [hit.capsule.b, 0.5]], direction: dir, impulse: shot?.impulse ?? GUN.impulse });
  // A heavy ball in an arm or a leg shatters the bone, most of the time.
  const joint = region === 'limb' ? BULLET_JOINT[key.slice(1)] : null;
  if (shot && joint && victim.state !== 'out' && !victim.broken.has(`${key[0]}${joint}`) && world.random() < shot.limbBreak * (1 - armour)) {
    breakJoint(world, victim, `${key[0]}${joint}`);
    event.effects.push('the bone shattered');
  }
  // A round through the gun arm takes the gun with it.
  if (victim.weapon?.held && key.startsWith(victim.weapon.main) && BLOCKING.has(key)) dropWeapon(world, victim, 'disarmed', dir);
  if (victim.gunshot >= 1 && victim.state !== 'out') {
    knockOut(world, victim, event, region === 'head' ? 'shot through the head' : 'shot dead', 'killed');
    return;
  }
  if (region !== 'limb') stagger(world, victim, WORLD.stagger.startAt + harm * 1.6, event, true);
}

// The joint a shattered limb bone gives way at.
export const BULLET_JOINT = { UpperArm: 'Elbow', Forearm: 'Elbow', Thigh: 'Knee', Shank: 'Knee' };
