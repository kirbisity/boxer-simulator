// Shooting: guns (aim, fire, rounds and pellets, recoil, reload) and bows
// (draw, loose, arrows in flight). What a round or an arrow does to a body
// is here; what a body is, and how it moves, is in ../physics.js.

import { coveringAt, shieldCovering, soundEvent, soundWound } from '../audio/log.js';
import { surfaceAt } from '../audio/surface.js';
import { BODY, buildBody, FRAMES, normaliseInputs, P, PRESETS } from '../body.js';
import { STYLES } from '../moves.js';
import { OUTFITS, outfitOf } from '../outfits.js';
import { aimPoint, BLOCKING, breakJoint, capsuleEnds, capsules, closestBetween, dropWeapon, glanceShare, knockOut, point, protectionAt, shieldDisc, stagger, strainGrip, surfaceCurve, toLocal, toWorld } from '../physics.js';
import { caloriesForWeight } from '../physiology.js';
import { vec, yawRotate } from '../pose.js';
import { ARROW, ARROW_MOMENTUM, BLADES, bleedToLose, bowCast, bulletProof, bulletRegion, GUN, pointThrough, slerpDir, SUPPLY } from '../weapons.js';
import { WORLD } from './config.js';
import { gapChance, gapsOf, gapUnder, gapZoneAt } from './gaps.js';
import { BARDING } from '../horses.js';
import { gaitAt, harmHorse, turretLaid, turretRecoil } from './mounted.js';
import { flamePulse } from './flame.js';
import { missileOf, screenOnPath } from './cover.js';
import { atRange, BALLISTICS, dragRate, flatFall, flightStep, holdover, judgedShare, traceFlight } from './ballistics.js';

/**
 * The gun arm for a shot: up from the guard and out along the line from the
 * shoulder to the target, which it tracks until the shot; down after.
 */

/**
 * A shooter's skill on his spread: an ordinary 0.5 shoots as the weapon's
 * own figures say; a master (1) halves it, a novice (0) half again as wide
 * (× WORLD.skill.gunSpread).
 */
function skillSpread(fighter) {
  return 1 + WORLD.skill.gunSpread * (0.5 - (fighter.body.skill ?? 0.5));
}

export function aimTargets(world, fighter, punch, guard) {
  const spec = punch.spec;
  const target = world.fighters[punch.target];
  if (target && !punch.fired) punch.aim = toLocal(fighter, leadFor(fighter, target, aimPoint(target, punch.zone)));
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

/** How fast a man goes over the ground (m/s, world): his horse's pace under him, or his own steps. */
export function overGround(fighter) {
  if (fighter.mount) return fighter.mount.velocity ?? [0, 0, 0];
  return [fighter.rootVelocity?.[0] ?? 0, 0, fighter.rootVelocity?.[1] ?? 0];
}

/**
 * Where to aim an arrow or a bolt so that it meets the man: ahead of where he
 * is by how far he will have gone, against the shooter, in the time it flies
 * there. An arrow leaves the bow carrying the shooter's own way over the ground
 * (loose: a man on a galloping horse throws it forward at the horse's pace as
 * well as the bow's), so it is the two men's speeds against each other that
 * the aim leads by; over the flight at the bow's speed (`ARROW.speed`, a
 * composite bow's own, a crossbow's), reckoned twice (the time to where he
 * will be, not to where he is). A gun's ball is too quick to lead.
 */
export function leadFor(fighter, target, mark) {
  const weapon = fighter.weapon;
  const bolt = weapon?.spec.shot?.bolt ? weapon.spec.shot : null;
  if (!weapon?.held || (!weapon.spec.bow && !bolt)) return mark;
  const speed = bolt?.speed ?? drawnCast(weapon).speed;
  const relative = vec.sub(overGround(target), overGround(fighter));
  const from = point(fighter.x, P[`${weapon.main}Hand`]);
  let led = mark;
  for (let pass = 0; pass < 2; pass += 1) led = vec.add(mark, vec.scale(relative, vec.length(vec.sub(led, from)) / speed));
  return led;
}

/**
 * How unsteady a bow is in the saddle (rad of spread, added to the arrow's
 * own), by the horse's gait: a horse archer looses in the moment the horse is
 * off the ground in its stride, when the saddle is still (the trained shot of
 * the steppe, of the Parthians, of yabusame), so the smooth canter and gallop
 * add little; the trot's jolt, a great deal; standing, nothing. Not the horse's
 * speed: the arrow is carried at it (loose), and the man moves with the saddle.
 */
export const SADDLE_SPREAD = { stand: 0, walk: 0.004, trot: 0.03, canter: 0.01, gallop: 0.014 };

/** The gun arm up on a mark (local): out straight from the shoulder along the line to it, locked (`weapon`: the gun on that arm). */
export function raisedAim(fighter, mark, weapon = fighter.weapon) {
  const side = weapon.main;
  const shoulder = toLocal(fighter, point(fighter.x, P[`${side}Shoulder`]));
  const lengths = fighter.body.lengths;
  const along = vec.normalize(vec.sub(mark, shoulder));
  // A long gun: the stock at the cheek, the trigger hand just before the
  // shoulder, the support hand out under the barrel.
  if (weapon.spec.longGun) return { hand: vec.add(vec.add(shoulder, vec.scale(along, LONG_GUN.handOut * lengths.upperArm)), [0, LONG_GUN.cheekRise * lengths.upperArm, 0]), dir: along };
  return { hand: vec.add(shoulder, vec.scale(along, (lengths.upperArm + lengths.forearmToFist) * 0.97)), dir: along };
}

// A long gun held to the cheek, in upper-arm lengths: the trigger hand
// this far out along the line from the shoulder, and raised this much.
// Reloading, the gun stands upright before him (`reloadHand`, heights,
// local; the barrel straight up) while the support hand works the ramrod
// down the muzzle (`ramFrom` + `ramStroke` × a stroke, m along the barrel,
// `ramPerSecond` strokes a second).
// A muzzle-loading pistol is loaded held up before the chest (`pistolReloadHand`).
// A crossbow is spanned nose-down before him (`spanHand`, along `spanDir`),
// the string drawn from `spanFrom` m down the tiller up by `spanStroke` m.
export const LONG_GUN = { handOut: 0.55, cheekRise: 0.35, reloadHand: [0.14, 0.42, -0.04], ramFrom: 0.5, ramStroke: 0.22, ramPerSecond: 1.4, spanHand: [0.16, 0.5, -0.04], spanDir: [0.35, -1, 0.02], spanFrom: 0.45, spanStroke: 0.3, pistolReloadHand: [0.2, 0.6, 0.02] };

// A revolver loaded at the cylinder (`shot.cylinder`): held at the waist, above a gown's hoop, before the
// body (`hand`, heights), the muzzle tipped forward and down (`dir`); for
// each chamber the support hand goes to the pouch at the belt (`pouch`),
// to the chamber's mouth beside the barrel (`mouth`, m along the barrel and
// up from it), then works the rammer lever beneath (`rammer`, m along and
// below), over each chamber's share of the reload: `phases` are where in that
// share it reaches each place.
export const CYLINDER_LOAD = { hand: [0.3, 0.6, 0.02], dir: [0.65, -0.5, -0.12], pouch: [0.12, 0.58, 0.16], mouth: [0.07, 0.035], rammer: [0.13, -0.04], phases: [0.25, 0.5, 0.75] };

// How a gun is loaded (`shot.reload`), which picks the reload's motion
// (physics weaponIntent) and what the view puts in the support hand
// (weaponview.js): 'muzzle' (powder and ball down the barrel, rammed: the
// matchlock, the three-eyed gun; the default), 'span' (a crossbow's string
// drawn back to the nut: `shot.bolt`), 'cylinder' (the revolver's chambers
// loaded one by one at the front: `shot.cylinder`), 'magazine' (a
// detachable box changed whole: the AR-15) and 'tube' (shells pushed one at
// a time up into a magazine tube under the barrel: the pump shotgun).
export function reloadKind(shot) {
  if (!shot) return null;
  return shot.reload ?? (shot.bolt ? 'span' : shot.cylinder ? 'cylinder' : 'muzzle');
}

// A magazine change (an AR-15's, `reload: 'magazine'`), the whole of it in
// the reload's couple of seconds: the gun brought down off the shoulder to
// the "workspace" before the chest (`hand`, heights, local), muzzle forward
// and a little down (`dir`), so the eyes can drop to the magazine well
// without the muzzle leaving the threat. The trigger finger presses the
// release and the empty falls clear on its own (`drop`, the share of the
// reload); the support hand leaves the handguard for the pouch on the chest
// rig (`pouch`, heights, on the support hand's side), takes the fresh one
// (`take`), brings it to the mouth of the well under the receiver, pushes it
// home (`seat`) and tugs it to be sure; then slaps the bolt catch on the
// receiver's side (the bolt runs home on a round) and goes back to the
// handguard; up to the shoulder again. `stops`: where the support hand is at
// each share of the reload, `gun` [m along the barrel from the trigger hand,
// m up from it] or `body` [heights, local; the side's sign the support
// hand's], eased from each to the next.
export const MAGAZINE_CHANGE = {
  hand: [0.24, 0.62, 0], dir: [0.9, -0.4, 0],
  pouch: [0.14, 0.67, 0.1],
  drop: 0.08, take: 0.34, seat: 0.66,
  stops: [
    { at: 0, gun: [0.3, -0.01] }, // on the handguard
    { at: 0.1, gun: [0.3, -0.01] }, // still there as the release is pressed and the empty falls
    { at: 0.34, body: 'pouch' }, // the fresh one out of the chest pouch
    { at: 0.56, gun: [0.12, -0.19] }, // its top in the mouth of the well
    { at: 0.66, gun: [0.12, -0.13] }, // pushed home (and tugged)
    { at: 0.8, gun: [0.04, 0.02] }, // the bolt catch on the receiver's side, slapped
    { at: 1, gun: [0.3, -0.01] }, // back on the handguard
  ],
};

// A pump shotgun's tube loaded (`reload: 'tube'`), shell by shell over each
// one's share of the reload: the gun held low at the waist (`hand`), muzzle
// forward and up, rolled a little so the loading port under the receiver
// shows; the support hand takes a shell from the belt or the sidesaddle
// (`pouch`, heights, its side's), brings it under the receiver to the port
// and thumbs it up into the tube (`port`, `push`: m along and up from the
// trigger hand), back for the next. `stops` as the magazine change's; the
// shell is in the hand from the pouch until it is pushed (`push` stop's `at`).
export const TUBE_LOAD = {
  hand: [0.24, 0.58, 0], dir: [0.8, 0.45, 0],
  pouch: [0.06, 0.56, 0.15],
  pushed: 0.62,
  stops: [
    { at: 0, body: 'pouch' },
    { at: 0.42, gun: [0.05, -0.06] }, // the shell's nose at the loading port
    { at: 0.62, gun: [0.13, -0.045] }, // thumbed up into the tube
    { at: 1, body: 'pouch' },
  ],
};

/**
 * Where the support hand is (local, m) at `phase` (0..1) of a staged load
 * (MAGAZINE_CHANGE, TUBE_LOAD): between the stops either side, eased.
 * `hand`, `dir`: the gun as held (local); `side`: +1 the support hand the
 * left, −1 the right; `H`: his height.
 */
export function loadStop(load, phase, hand, dir, side, H) {
  const where = (stop) => (stop.body
    ? vec.scale([load[stop.body][0], load[stop.body][1], load[stop.body][2] * side], H)
    : vec.add(vec.add(hand, vec.scale(dir, stop.gun[0])), [0, stop.gun[1], 0]));
  const stops = load.stops;
  let next = 1;
  while (next < stops.length - 1 && stops[next].at <= phase) next += 1;
  const from = stops[next - 1];
  const to = stops[next];
  const share = Math.max(0, Math.min(1, (phase - from.at) / Math.max(1e-6, to.at - from.at)));
  return vec.lerp(where(from), where(to), share * share * (3 - 2 * share));
}

/**
 * What a staged reload has in its hands now, for the view: { kind, phase,
 * onGun (the gun's own magazine in the well), inHand (a magazine or a
 * shell in the support hand), dropAge (s since the empty fell; null before)
 * }; null when he is not reloading a magazine or a tube.
 */
export function reloadProps(fighter, weapon) {
  const shot = weapon?.spec.shot;
  const kind = reloadKind(shot);
  if (!fighter.reloading || weapon.loaded || (kind !== 'magazine' && kind !== 'tube')) return null;
  const done = weapon.reloaded ?? 0;
  if (kind === 'tube') {
    const phase = ((done / (shot.reloadSeconds / (shot.rounds ?? 1))) % 1);
    return { kind, phase, onGun: true, inHand: phase < TUBE_LOAD.pushed, dropAge: null };
  }
  const load = MAGAZINE_CHANGE;
  const phase = Math.min(1, done / shot.reloadSeconds);
  return {
    kind, phase,
    onGun: phase < load.drop || phase >= load.seat,
    inHand: phase >= load.take && phase < load.seat,
    dropAge: phase >= load.drop ? (phase - load.drop) * shot.reloadSeconds : null,
  };
}

export let referenceSegments = null;

/** The body parts of the man the gun's numbers are for: 80 kg, average build. */
export function bulletReference() {
  if (referenceSegments) return referenceSegments;
  const inputs = normaliseInputs({ ...PRESETS.contender, sex: 'male', heightCm: 178, frame: 'medium', exercise: 0.4, outfit: null, accessories: [] });
  inputs.calories = caloriesForWeight(inputs, GUN.referenceKg, FRAMES.medium.lean);
  referenceSegments = buildBody(inputs).segments;
  return referenceSegments;
}

// A man whose hips are further than this (m) from a round's path has no part of him, or his shield, on it.
const FAR_OFF_LINE = 1.6;

/** The first thing a round from `from` to `to` meets: a body part or a shield; null if none. */
export function firstHit(world, shooter, from, to) {
  const length = vec.length(vec.sub(to, from));
  const along = vec.scale(vec.sub(to, from), 1 / length);
  let best = null;
  for (const other of world.fighters) {
    if (other === shooter) continue;
    // Far off the line (his hips more than a body's reach from it, a shield's included): nothing of him is on it.
    const hips = [other.x[P.pelvis * 3], other.x[P.pelvis * 3 + 1], other.x[P.pelvis * 3 + 2]];
    const along2 = Math.max(0, Math.min(length, vec.dot(vec.sub(hips, from), along)));
    if (vec.length(vec.sub(hips, vec.add(from, vec.scale(along, along2)))) > FAR_OFF_LINE) continue;
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
      if (!best || s < best.s) best = { fighter: other, capsule, target: throat ? 'throat' : capsule.key, throat, s, point: vec.lerp(from, to, s), offAxis: miss / capsule.radius, along: meet.t };
    }
  }
  return best;
}

/**
 * The first horse on a missile's path from `from` to `to` (not the shooter's own, not one lying dead), as
 * { horse, capsule, s (share of the way), point }, or null.
 */
export function horseOnPath(world, shooter, from, to) {
  if (!world.horses?.length) return null;
  const length = vec.length(vec.sub(to, from));
  if (length < 1e-9) return null;
  const along = vec.scale(vec.sub(to, from), 1 / length);
  let best = null;
  for (const horse of world.horses) {
    if (horse === shooter?.mount || horse.state === 'down') continue;
    const middle = [horse.at[0], horse.withers * 0.7, horse.at[1]];
    const t = Math.max(0, Math.min(length, vec.dot(vec.sub(middle, from), along)));
    if (vec.length(vec.sub(middle, vec.add(from, vec.scale(along, t)))) > 1.6 * horse.withers) continue;
    for (const capsule of horse.capsules) {
      const meet = closestBetween(from, to, capsule.a, capsule.b);
      const miss = vec.length(vec.sub(meet.onFirst, meet.onSecond));
      if (miss > capsule.radius) continue;
      const s = Math.max(0, meet.s - Math.sqrt(capsule.radius * capsule.radius - miss * miss) / length);
      if (!best || s < best.s) best = { horse, capsule, s, point: vec.lerp(from, to, s) };
    }
  }
  return best;
}

/**
 * A missile in a horse: its energy (J) a point's, through the barding on that part (horses.js BARDING): an arrow
 * glances off plate barding as off a man's plate (`bounce`), and goes into lamellar for what it does not stop; a ball
 * goes through any barding a horse could carry (a millimetre or two of steel) and leaves `ARROW.horseShare` of its
 * energy in it (it passes on through: the rest goes with it). The harm is mounted.js harmHorse's, as a lance's point
 * would be: it bleeds, and in the chest or neck deep enough it opens the heart.
 */
export function missileInHorse(world, shooter, hit, dir, joules, { arrow = true, bounce = ARROW.bounce } = {}) {
  const horse = hit.horse;
  const barding = BARDING[horse.barding].parts[hit.capsule.part];
  const event = { time: world.time, kind: 'horseHit', attacker: shooter?.id ?? -1, horse: horse.id, rider: horse.rider ?? undefined, weapon: arrow ? 'arrow' : 'ball', target: hit.capsule.key, energy: joules, point: hit.point, normal: vec.scale(dir, -1), effects: [] };
  world.events.push(event);
  if (arrow && barding.deflects && world.random() < bounce) {
    event.effects.push('glances off the barding');
    return;
  }
  const pierce = arrow ? joules * pointThrough(joules, barding.pierce, world.random()) : joules * ARROW.horseShare;
  if (shooter) shooter.stats.landed += 1;
  harmHorse(world, horse, hit.capsule, { blunt: 0, cut: 0, pierce }, event, shooter);
}

/** Whether the barrel has come onto the line from the muzzle to the mark: then he fires. */
export function sightsOn(fighter) {
  const weapon = fighter.weapon;
  if (!weapon?.held || !fighter.punch?.aim) return true;
  const hand = point(fighter.x, P[`${weapon.main}Hand`]);
  // A turret's fire control: the barrel laid on the mark and steady there (physics/mounted.js turretLaid).
  if (weapon.spec.turret && weapon.turret) return turretLaid(weapon, weapon.turretMark ?? toWorld(fighter, fighter.punch.aim));
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
  const shoulderAt = point(fighter.x, P[`${weapon.main}Shoulder`]);
  const shoulder = toLocal(fighter, shoulderAt);
  const flat = vec.normalize(vec.sub(mark, shoulder));
  // Laid over the heads of his own men before him (overHeads), the bow arm goes up along the arc, the hand raised with it.
  const laid = laidArrow(world, fighter, toWorld(fighter, target.hand), toWorld(fighter, mark), null, missileSpread(fighter));
  const along = vec.normalize(vec.sub(toLocal(fighter, vec.add(shoulderAt, laid.dir)), shoulder));
  const out = vec.sub(target.hand, shoulder);
  const hand = vec.add(vec.add(shoulder, vec.scale(along, vec.dot(out, flat))), vec.sub(out, vec.scale(flat, vec.dot(out, flat))));
  const smooth = (value) => value * value * (3 - 2 * value);
  const drawing = punch?.spec.path === 'aim' ? (punch.fired ? 0 : smooth(Math.min(1, punch.t / (punch.quick ? punch.spec.quickFireAt : punch.spec.fireAt)))) : 0.12;
  weapon.draw = drawing;
  weapon.facing = yawRotate(along, fighter.yaw);
  // The string hand: from beside the grip back along the arrow to the cheek.
  const head = toLocal(fighter, point(fighter.x, P.head));
  const anchor = vec.add(head, [0.02, -0.07, -0.05]);
  const rest = vec.sub(hand, vec.scale(along, 0.12));
  intent[`${weapon.off}Hand`] = vec.lerp(rest, anchor, drawing);
  // The stave across the line: upright, canted a little.
  const up = vec.normalize(vec.sub([0.05, 1, 0], vec.scale(along, along[1])));
  return { hand, dir: up };
}

/**
 * Loose: an arrow off the bow along the line to the mark, aimed high for
 * the drop; or a crossbow's bolt (`bolt`: its speed, spread, weight).
 */
export function loose(world, fighter, bolt = null) {
  const punch = fighter.punch;
  // His quiver already empty (a bow taken up again off the floor): there is no arrow to nock.
  if (!bolt && ammoLeft(fighter) <= 0) {
    fighter.weapon.spent = true;
    return;
  }
  const weapon = fighter.weapon;
  const grip = point(fighter.x, P[`${weapon.main}Hand`]);
  const mark = punch.aim ? toWorld(fighter, punch.aim) : vec.add(grip, yawRotate([1, 0, 0], fighter.yaw));
  const spread = missileSpread(fighter, bolt);
  const random = world.random;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - random() * 0.999999)) * Math.cos(2 * Math.PI * random());
  // The distance to his mark as he judges it (ballistics.js judgedShare): his arc is laid for that.
  const laid = laidArrow(world, fighter, grip, mark, bolt, spread, judgedShare(fighter.body.skill, gauss()));
  // An arrow with no arc over his own men's heads (overHeads), or whose path (the drawn shaft from his cheek to the bow
  // hand, then its arc) goes through one of them, is not let go: he holds at the draw, as a gun's ball is held
  // (comradeInLine), the arrow kept (arcFouled).
  if (!bolt && (laid.over || arcFouled(world, fighter, sightFrom(fighter, weapon), grip, laid, spread))) return;
  // Arrows (and bolts) loosed this bout: a volley style counts them (ranged.volley).
  fighter.loosed = (fighter.loosed ?? 0) + 1;
  const speed = laid.speed;
  let dir = laid.dir;
  const across = vec.normalize(vec.cross(dir, [0, 1, 0]));
  const upward = vec.cross(across, dir);
  dir = vec.normalize(vec.add(dir, vec.add(vec.scale(across, gauss() * spread), vec.scale(upward, gauss() * spread))));
  // Its energy against the reference war arrow's (ARROW.joules): a bolt's the crossbow's own; an arrow's its kinetic energy at
  // the speed it is cast (the bow's, by how far he draws it and how much less for a lob over his men: laidArrow).
  const energy = bolt ? bolt.energy : (0.5 * laid.projectile.kg * speed * speed) / ARROW.joules;
  // One arrow fewer from his quiver (ammoLeft); the last gone, the bow is spent until he is given more.
  if (!bolt) spendMissile(world, fighter, weapon);
  // The arrow leaves the bow with the bow's own way over the ground (a horse's gallop, a man's step) as well as its cast.
  const carried = overGround(fighter);
  world.arrows.push({ id: world.arrows.length, owner: fighter.id, x: vec.add(grip, vec.scale(dir, bolt ? 0.3 : 0.08)), v: vec.add(vec.scale(dir, speed), carried), speed, energy, kg: laid.projectile.kg, projectile: laid.projectile, bolt: Boolean(bolt), length: bolt?.length, bounce: bolt?.bounce, age: 0, landed: false, done: false });
  world.events.push({ time: world.time, kind: 'loosed', attacker: fighter.id, effects: [] });
  // Heard: the string let go (a bow's, or a crossbow's heavier snap).
  if (world.ear) soundEvent(world, 'shot', { at: grip, kind: bolt ? 'crossbow' : 'bow', who: fighter.id });
  // The bow kicks forward a little in the hand as the string goes.
  world.pendingImpulses.push({ fighter, shares: [[P[`${weapon.main}Hand`], 1]], direction: dir, impulse: 0.6 });
}

/**
 * The missiles a man carries for a weapon at the start (bolts, balls, arrows): a bow's from his kit's `quiver`
 * (a horse archer's) or the bow's own `ammo`; a gun's or a crossbow's, its shot's `ammo`. None counted: Infinity
 * (a forearm gun fed from the body, a modern pistol), or kept up without end (his kit's `endlessAmmo`: outfits.js).
 */
export function ammoCarried(fighter, weapon = fighter.weapon) {
  const spec = weapon.spec;
  if (fighter.body.gear.endlessAmmo) return Infinity;
  return (spec.bow ? fighter.body.gear.quiver ?? spec.ammo : spec.shot?.ammo) ?? Infinity;
}

/** What he has left for it (`arrows` for a bow, `rounds` for a gun or a crossbow: the loaded one counted). */
export function ammoLeft(fighter, weapon = fighter.weapon) {
  return (weapon.spec.bow ? fighter.arrows : fighter.rounds) ?? ammoCarried(fighter, weapon);
}

/**
 * One missile spent from what he carries. The last gone: in his side's formation on foot, a fresh load is brought up
 * to him (resupplyInLine); else the weapon is spent (the AI lets it fall and draws his sidearm: ai.js castAside).
 */
function spendMissile(world, fighter, weapon) {
  const carried = ammoCarried(fighter, weapon);
  if (carried === Infinity) return;
  const left = ammoLeft(fighter, weapon) - 1;
  if (weapon.spec.bow) fighter.arrows = left;
  else fighter.rounds = left;
  if (left > 0 || resupplyInLine(world, fighter, weapon, carried)) return;
  weapon.spent = true;
  const what = weapon.spec.bow ? 'his quiver is empty' : weapon.spec.shot.bolt ? 'his bolts are spent' : weapon.spec.shot.flame ? 'his tanks are empty' : 'his powder and shot are spent';
  world.events.push({ time: world.time, kind: weapon.spec.bow ? 'quiverEmpty' : 'ammoEmpty', fighter: fighter.id, weapon: weapon.kind, effects: [what] });
}

/**
 * His ammunition brought up to him where he stands in the line (SUPPLY): a man on foot in his side's formation
 * (`slot`), not yet given `loads` fresh loads. The load is his own again (`carried`), in his hands after the
 * bearer's run (he shoots again only after `seconds`). Returns whether he was.
 */
function resupplyInLine(world, fighter, weapon, carried) {
  if (!fighter.slot || fighter.mount || (fighter.supplied ?? 0) >= SUPPLY.loads) return false;
  fighter.supplied = (fighter.supplied ?? 0) + 1;
  if (weapon.spec.bow) fighter.arrows = carried;
  else fighter.rounds = carried;
  fighter.cooldown = Math.max(fighter.cooldown ?? 0, SUPPLY.seconds);
  world.events.push({ time: world.time, kind: 'resupplied', fighter: fighter.id, effects: [weapon.spec.bow ? 'fresh sheaves brought up to the line' : 'more brought up to him in the line'] });
  return true;
}

/**
 * How wide (rad, one deviation) his arrow or bolt (`bolt`) goes: on foot, a man shooting on the move shoots wide by his
 * pace; in the saddle, by the horse's gait (SADDLE_SPREAD); reeling, the more; and by his skill.
 */
function missileSpread(fighter, bolt = null) {
  const unsteady = fighter.mount ? SADDLE_SPREAD[gaitAt(fighter.mount.speed).name] ?? 0 : GUN.movingSpread * Math.hypot(...(fighter.rootVelocity ?? [0, 0]));
  return ((bolt?.spread ?? ARROW.spread) + unsteady) * (fighter.stagger > 0 ? GUN.reelingSpread : 1) * skillSpread(fighter);
}

/**
 * An arrow (or a bolt) laid from `grip` on `mark`, before the shot's own error (of `spread` rad: missileSpread): its
 * speed (a bow drawn only part way, too heavy for him, handling.js, casts it that much slower), the distance to the mark,
 * and its direction, aimed above the mark by the drop over the distance. An arrow (not a bolt) from a rank behind his
 * own men goes up over their heads, on the arc that comes down on the mark (overHeads): `over`, the comrade it cannot
 * be got over (the shot is held), else null.
 */
function laidArrow(world, fighter, grip, mark, bolt = null, spread = ARROW.spread, judged = judgedShare(fighter.body.skill)) {
  const weapon = fighter.weapon;
  const line = vec.sub(mark, grip);
  const distance = vec.length(line);
  const flat = vec.normalize(line);
  // A bolt goes at the crossbow's speed whoever looses it (handling.js crossbowSpan); an arrow at the bow's as he draws it.
  const speed = bolt ? bolt.speed : drawnCast(weapon).speed;
  // What it flies as (its mass by its energy at its full cast; its drag, ARROW.flight), and the drop it is laid above the
  // mark for: at the distance he judges (`judged` of the true), the flat-fire fall with the air's drag (ballistics.js
  // flatFall), the drop the vacuum's parabola gives over an effective distance 2F(d)/d (d itself without drag).
  const projectile = arrowProjectile(weapon, bolt);
  const k = dragRate(projectile, speed);
  const reckoned = distance * judged;
  const effective = (2 * flatFall(k, 0, reckoned).fall) / Math.max(1e-6, reckoned);
  const lift = Math.min(0.3, 0.5 * Math.asin(Math.min(1, (ARROW.gravity * effective) / speed ** 2)));
  const dir = vec.normalize(vec.add(flat, [0, Math.tan(lift), 0]));
  if (bolt) return { speed, distance, dir, projectile, over: null };
  // A lob over his own men's heads is cast for the mark where he judges it (its distance his judgement), over the heads he sees.
  return { distance, projectile, ...overHeads(world, fighter, mark, dir, speed, spread, k, judged) };
}

/** A bow's cast as this man draws it (weapons.js bowCast; handling.js drawEnergy: the share of its full draw's energy he stores). */
export function drawnCast(weapon) {
  return bowCast(weapon?.spec, weapon?.handling?.drawEnergy ?? 1);
}

/**
 * What an arrow (or a bolt) from `weapon` flies as (ballistics.js): an arrow its bow's own (bowCast: its mass, its speed at
 * full draw); a bolt of the mass of its `energy` (× ARROW.joules) at its `speed`; its drag on its shaft's section (ARROW.flight).
 */
export function arrowProjectile(weapon, bolt = null) {
  const full = bolt ? null : bowCast(weapon?.spec);
  const speed = bolt ? bolt.speed : full.speed;
  const kg = bolt ? (2 * bolt.energy * ARROW.joules) / (speed * speed) : full.kg;
  const key = `${speed}:${kg}:${Boolean(bolt)}`;
  let projectile = ARROW_PROJECTILES.get(key);
  if (!projectile) {
    projectile = { kg, velocity: speed, curve: ARROW.flight.cd, calibre: bolt ? ARROW.flight.boltShaft : ARROW.flight.shaft };
    ARROW_PROJECTILES.set(key, projectile);
  }
  return projectile;
}
const ARROW_PROJECTILES = new Map();

/**
 * The arc an arrow takes to come down on `mark` over the heads of his own men standing in its way (on foot, short of the
 * mark): the flattest of them, from the drop's own `dir` at the full `speed` upward by ARROW.over.step rad to
 * ARROW.over.most, the bow arm raised to each (the bow hand at full reach from his shoulder along it, as raisedAim holds
 * it) and the bow drawn to the speed that lands it on the mark (no more than `speed`: drawn the less the higher it goes,
 * as archers lobbed at a near mark over their ranks), whose path is FIRE_LANE's room (of `spread`) clear of each one's
 * head. Returns { dir, speed, over }: `over` the comrade (as comradeInLane gives him) none of them gets over (the shot
 * to be held; dir and speed then the flat shot's), else null.
 */
function overHeads(world, fighter, mark, dir, speed, spread, k = 0, judged = 1) {
  const spec = ARROW.over;
  const g = ARROW.gravity;
  const lengths = fighter.body.lengths;
  const shoulder = point(fighter.x, P[`${fighter.weapon.main}Shoulder`]);
  const reach = (lengths.upperArm + lengths.forearmToFist) * 0.97;
  const range = Math.hypot(mark[0] - shoulder[0], mark[2] - shoulder[2]) || 1e-6;
  const way = [(mark[0] - shoulder[0]) / range, (mark[2] - shoulder[2]) / range];
  const room = (radius, across, along) => {
    const wide = radius + FIRE_LANE.sway + FIRE_LANE.deviations * spread * Math.max(0, along);
    return Math.abs(across) < wide ? Math.sqrt(wide * wide - across * across) : -Infinity;
  };
  // His men in the way: how far along the line from his shoulder each one's head is, how far off it, how high above it.
  const heads = [];
  for (const mate of world.fighters) {
    if (mate === fighter || mate.corner !== fighter.corner || mate.state === 'out' || mate.mount) continue;
    const head = point(mate.x, P.head);
    const offset = [head[0] - shoulder[0], head[2] - shoulder[2]];
    const along = offset[0] * way[0] + offset[1] * way[1];
    if (along <= 0 || along >= range - 0.5) continue;
    const across = offset[0] * way[1] - offset[1] * way[0];
    const radius = capsules(mate).find((capsule) => capsule.key === 'head').radius;
    if (room(radius, across, along + reach) > -Infinity) heads.push({ mate, along, across, radius, above: head[1] - shoulder[1] });
  }
  // Whether the arc at elevation `angle`, from the bow hand raised to it, cast at `cast` m/s, passes each head by its
  // room (square to the arc there, its spread grown over the drawn shaft and the flight to it, as arcFouled weighs it);
  // a head nearer than the bow hand is in the way of the arm itself.
  const clears = (angle, cast) => heads.every(({ along, across, radius, above }) => {
    const ahead = along - reach * Math.cos(angle);
    if (ahead <= 0) return false;
    // (Its fall with the air's drag on it: ballistics.js flatFall; without drag, ahead²/2 and its slope ahead.)
    const fall = g / (cast * cast * Math.cos(angle) ** 2);
    const flown = flatFall(k, angle, ahead);
    const height = reach * Math.sin(angle) + ahead * Math.tan(angle) - fall * flown.fall;
    return (height - above) * Math.cos(Math.atan(Math.tan(angle) - fall * flown.slope)) >= room(radius, across, reach + ahead / Math.cos(angle));
  });
  const low = Math.atan2(dir[1], Math.hypot(dir[0], dir[2]));
  if (clears(low, speed)) return { dir, speed, over: null };
  for (let angle = low + spec.step; angle <= spec.most; angle += spec.step) {
    // The cast that lands it on the mark from the bow hand at this elevation (range R, the mark `rise` above the hand):
    // v² = g·F(R) / cos²θ(R tanθ − rise), F the fall with the drag on it (ballistics.js flatFall; R²/2 without).
    // (`judged`: the share of the true range he reckons it, laidArrow's; the heads in the way are where they are.)
    const out = range * judged - reach * Math.cos(angle);
    const lofted = out * Math.tan(angle) - (mark[1] - shoulder[1] - reach * Math.sin(angle));
    if (out <= 0 || lofted <= 0) continue;
    const cast = Math.sqrt(g * flatFall(k, angle, out).fall / (Math.cos(angle) ** 2 * lofted));
    if (cast > speed || !clears(angle, cast)) continue;
    return { dir: [way[0] * Math.cos(angle), Math.sin(angle), way[1] * Math.cos(angle)], speed: cast, over: null };
  }
  const nearest = heads.reduce((best, head) => (!best || head.along < best.along ? head : best), null);
  return { dir, speed, over: { fighter: nearest.mate, along: nearest.along, side: nearest.across >= 0 ? -1 : 1 } };
}

// An arrow's way past his own men, traced as it will fly (arcFouled): the drawn shaft from the nock at his cheek to the
// bow hand (a man pressed up against the back of the one before him has his bow hand at that man's head, and nothing he
// looses gets past it), then its arc under gravity from the bow, `step` s at a time (0.02 s: ~1 m of a war arrow's
// flight, the arc's sag over it under a millimetre), until it is down or FIRE_LANE.beyond m past the mark. A comrade
// within FIRE_LANE's room of it (his sway, and three deviations of the arrow's own spread over the way it has flown),
// where he will be as it passes (his way over the ground now, carried on), fouls it. The massed archers of a deep line
// shot over their own ranks this way, high enough to clear the heads in front and no flatter; a man too close behind
// the one before him, or with his own men where it would come down, held.
export const ARROW_PATH = { step: 0.02 };

/**
 * The comrade (as comradeInLane gives him) in the way of an arrow laid from the nock at `nock` through the bow hand at
 * `grip` (`laid`: laidArrow's dir, speed, and distance to the mark), of `spread` rad (missileSpread), or null when its
 * way is clear (ARROW_PATH).
 */
export function arcFouled(world, fighter, nock, grip, { dir, speed, distance, projectile }, spread) {
  const shaft = comradeInLane(world, fighter, nock, grip, spread);
  if (shaft) return shaft;
  const step = ARROW_PATH.step;
  const end = distance + FIRE_LANE.beyond;
  let at = grip;
  // (It leaves the bow with his own way over the ground as well as its cast, as loose() looses it.)
  let v = vec.add(vec.scale(dir, speed), overGround(fighter));
  let flown = vec.length(vec.sub(grip, nock));
  let after = 0;
  while (at[1] > 0 && Math.hypot(at[0] - grip[0], at[2] - grip[2]) < end) {
    const next = vec.add(at, vec.scale(v, step));
    const mate = comradeInLane(world, fighter, at, next, spread, { flown, after });
    if (mate) return mate;
    flown += vec.length(vec.sub(next, at));
    after += step;
    // (Drag and gravity, as it flies: flyArrows.)
    if (projectile) flightStep(projectile, v, step);
    else v = [v[0], v[1] - ARROW.gravity * step, v[2]];
    at = next;
  }
  return null;
}

/**
 * Whether a bow drawn now on `mark` (a world point) would put its arrow into his own men (overHeads, arcFouled): laid as loose()
 * will lay it, from the bow hand out at full reach along its arc (raisedAim, drawBow) and the nock at his cheek. The comrade, or null.
 */
export function bowArcFouled(world, fighter, mark) {
  const weapon = fighter.weapon;
  const spread = missileSpread(fighter);
  const laid = laidArrow(world, fighter, toWorld(fighter, raisedAim(fighter, toLocal(fighter, mark), weapon).hand), mark, null, spread);
  if (laid.over) return laid.over;
  const lengths = fighter.body.lengths;
  const grip = vec.add(point(fighter.x, P[`${weapon.main}Shoulder`]), vec.scale(laid.dir, (lengths.upperArm + lengths.forearmToFist) * 0.97));
  return arcFouled(world, fighter, sightFrom(fighter, weapon), grip, laid, spread);
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
    // Gravity and the air's drag (ballistics.js): what the drag takes of its speed it takes of its energy, squared (gravity
    // only trades its height for speed and back, which over a shot at a man's height comes to nothing).
    if (arrow.projectile) {
      const kept = flightStep(arrow.projectile, arrow.v, dt);
      if (arrow.energy !== undefined) arrow.energy *= kept * kept;
    } else arrow.v[1] -= ARROW.gravity * dt;
    const to = vec.add(arrow.x, vec.scale(arrow.v, dt));
    const hit = firstHit(world, world.fighters[arrow.owner], arrow.x, to);
    // A horse nearer on its path than any man takes it (the riders' horses were what the archers hit most).
    const horseHit = horseOnPath(world, world.fighters[arrow.owner], arrow.x, to);
    // A screen of the works before either (physics/cover.js: a parapet's stone, a camp's daub): it stops in it, or goes on
    // through with what the screen did not take.
    const share = arrow.energy ?? ((arrow.speed ?? ARROW.speed) / ARROW.speed) ** 2;
    const screen = screenOnPath(world, arrow.x, to, missileOf({ bow: true }, share * ARROW.joules));
    if (screen && (!hit || screen.s < hit.s) && (!horseHit || screen.s < horseHit.s)) {
      if (screen.stops) {
        if (world.ear) soundEvent(world, 'arrowhit', { at: screen.point, speed: vec.length(arrow.v), covering: screen.wall.cover.material === 'masonry' ? 'stone' : 'ground', who: -1 });
        arrow.x = screen.point;
        arrow.landed = true;
        arrow.age = 0;
        world.screened += 1;
        continue;
      }
      arrow.energy = share * (screen.left / (share * ARROW.joules));
    }
    if (horseHit && (!hit || horseHit.s < hit.s)) {
      if (world.ear) soundEvent(world, 'arrowhit', { at: horseHit.point, speed: vec.length(arrow.v), covering: 'flesh', who: -1 });
      const energy = arrow.energy ?? ((arrow.speed ?? ARROW.speed) / ARROW.speed) ** 2;
      missileInHorse(world, world.fighters[arrow.owner], horseHit, vec.normalize(arrow.v), energy * ARROW.joules, { arrow: true, bounce: arrow.bounce ?? ARROW.bounce });
      arrow.done = true;
      arrow.x = horseHit.point;
      continue;
    }
    if (hit) {
      // Heard: the arrow going in, at the speed it flew, on what it met.
      if (world.ear) soundEvent(world, 'arrowhit', { at: hit.point, speed: vec.length(arrow.v), covering: hit.target === 'shield' ? shieldCovering(hit.fighter.shield) : coveringAt(hit.fighter, hit.capsule.key), who: hit.fighter.id });
      arrowHit(world, world.fighters[arrow.owner], hit, vec.normalize(arrow.v), arrow.energy ?? ((arrow.speed ?? ARROW.speed) / ARROW.speed) ** 2, arrow.bounce ?? ARROW.bounce, arrow.kg ? arrow.kg * vec.length(arrow.v) : ARROW_MOMENTUM);
      arrow.done = true;
      arrow.x = hit.point;
      continue;
    }
    arrow.x = to;
    if (arrow.x[1] <= 0.02 || Math.abs(arrow.x[0]) > 60 || Math.abs(arrow.x[2]) > 60) {
      arrow.x[1] = Math.max(0.02, arrow.x[1]);
      // Heard: into the ground (or on stone, or boards), at the speed it came down.
      if (world.ear) {
        const ground = surfaceAt(world, arrow.x[0], arrow.x[1], arrow.x[2]);
        soundEvent(world, 'arrowhit', { at: arrow.x, speed: vec.length(arrow.v), covering: ground === 'stone' || ground === 'tile' ? 'stone' : ground === 'wood' ? 'wood' : 'ground', who: -1 });
      }
      arrow.landed = true;
      arrow.age = 0;
    }
  }
  // Long gone arrows are dropped from the list now and then.
  if (world.arrows.length > 64 && world.arrows.every((arrow, index) => index > 32 || arrow.done)) world.arrows = world.arrows.filter((arrow) => !arrow.done);
}

/**
 * How fast an arrow wound bleeds (ARROW.wound): by what its path went
 * through, judged by where it struck the part (how far along it, and how near
 * its axis the path passed: `hit.along`, `hit.offAxis`). `through`: the share
 * of a war arrow's energy that got past the armour. Returns { rate, what }
 * (a share of his blood a second; the vessel opened, if one was).
 */
function arrowBleed(victim, hit, key, through, scale) {
  const spec = ARROW.wound;
  const deep = (hit.offAxis ?? 1) < spec.deep && through >= spec.deepFrom;
  // The rate that, easing as it clots, has lost what is left of his blood to collapse in `seconds` s.
  const toCollapse = (seconds) => bleedToLose(BLADES.collapseAt * BODY.toughness - (victim.bloodLost ?? 0), seconds);
  if (hit.throat) return deep || through >= spec.deepFrom ? { rate: toCollapse(spec.seconds.chest), what: 'the neck\'s vessels opened' } : { rate: spec.rate.head * through * scale, what: null };
  if (key === 'head') return { rate: spec.rate.head * through * scale, what: null };
  if (key === 'trunk') {
    if (!deep) return { rate: spec.rate.torso * through * scale, what: null };
    if ((hit.along ?? 0) > spec.chestFrom) return { rate: toCollapse(spec.seconds.chest), what: 'through the heart\'s great vessels' };
    return { rate: toCollapse(spec.seconds.abdomen), what: 'into the great vessels of the belly' };
  }
  if (deep && (key.endsWith('Thigh') || key.endsWith('UpperArm'))) return { rate: toCollapse(spec.seconds.artery), what: key.endsWith('Thigh') ? 'the femoral artery opened' : 'the brachial artery opened' };
  return { rate: spec.rate.muscle * through * scale, what: null };
}

/**
 * An arrow strikes: off a shield, or off good armour (most of the time),
 * it glances; otherwise a piercing wound (cut by the armour's pierce
 * protection), scaled to the part's weight and hurt, bleeding, with a
 * small knock; enough and he dies.
 */
export function arrowHit(world, shooter, hit, dir, energy = 1, bounce = ARROW.bounce, momentum = ARROW_MOMENTUM) {
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
  // The knock: the reference war arrow's, by this one's momentum (its mass × its speed as it strikes) against that one's.
  world.pendingImpulses.push({ fighter: victim, shares: [[hit.capsule.a, 0.5], [hit.capsule.b, 0.5]], direction: dir, impulse: ARROW.impulse * (momentum / ARROW_MOMENTUM) });
  // The struck surface's outward normal: off the part's axis at the point.
  const [a, b] = capsuleEnds(victim, hit.capsule);
  const axis = vec.sub(b, a);
  const t = Math.max(0, Math.min(1, vec.dot(vec.sub(hit.point, a), axis) / Math.max(1e-9, vec.dot(axis, axis))));
  const normal = vec.normalize(vec.sub(hit.point, vec.add(a, vec.scale(axis, t))));
  // A curved helmet or breastplate turns an arrow that does not meet it square: mostly glancing, it skids off; else it goes in with what is left.
  const curve = hit.throat ? 0 : surfaceCurve(victim, key);
  if (curve > 0) {
    const share = glanceShare(curve, dir, normal);
    if (share < WORLD.helmet.glancedBelow) {
      event.bounced = true;
      event.effects.push(key === 'head' ? 'glances off the helmet' : 'glances off the breastplate');
      return;
    }
    energy *= share;
  }
  // What the arrow meets is what a blade's point meets there (physics.js registerWeaponImpact): the armour of that part
  // (protectionAt), or in rigid armour a gap where the part has one (physics/gaps.js: the armpit, the bend of a joint, the
  // lacing), the opening found as often as a thrust's (gapChance; no hand places an arrow), and then what is under it
  // (gapUnder). The throat is the neck's gap: closed (`gaps.closed`) it is the trunk's armour, a gorget or a collar;
  // open, what the kit has there (the aventail's or the standard's mail, else the doublet); bare short of rigid armour.
  const region = hit.throat ? 'head' : bulletRegion(key);
  const covered = protectionAt(gear, hit.throat ? 'trunk' : key);
  const gaps = gapsOf(gear);
  const rigid = (covered.cut ?? 0) >= gaps.rigidFrom;
  const zone = !rigid ? null : hit.throat ? (gaps.closed?.includes('neck') ? null : 'neck') : gapZoneAt(victim, key, hit.point, normal);
  const intoGap = Boolean(zone) && (hit.throat || world.random() < gapChance(gear, zone, 'thrust'));
  const meets = intoGap ? gapUnder(gear, zone, covered) : hit.throat && !rigid ? { pierce: 0 } : covered;
  // Plate (`deflects`) turns most arrows off its hard face (`bounce`). What does not glance goes in only past the armour's
  // puncture for a war arrow's bodkin (weapons.js PUNCTURE, pointThrough): an arrow stands in mail, a crossbow's bolt goes through it; short of it the
  // arrow is stopped there, and he takes only the knock.
  const plate = Boolean(meets.deflects) && !intoGap;
  if (plate && world.random() < bounce) {
    event.bounced = true;
    event.effects.push('glances off the armour');
    return;
  }
  const through = energy * pointThrough(energy * ARROW.joules, meets.pierce, world.random());
  if (!(through > 0)) {
    event.effects.push(`${region}: stopped by the armour`);
    return;
  }
  const own = victim.body.segments[key];
  const reference = bulletReference()[key];
  const scale = own && reference ? reference.mass / own.mass : 1;
  // `through`: what of the arrow's energy got into him, against a war arrow's (ARROW.joules).
  const harm = ARROW.lethal[region] * through * scale * (1 + GUN.hurtShare * (victim.damage[key] ?? 0));
  // The same pool of deadly wounds as a gun's.
  victim.gunshot = (victim.gunshot ?? 0) + harm;
  victim.damage[key] = Math.min(1, (victim.damage[key] ?? 0) + harm);
  victim.damageVersion += 1;
  const vessel = arrowBleed(victim, hit, key, through, scale);
  victim.bleed = (victim.bleed ?? 0) + vessel.rate;
  if (vessel.what) event.effects.push(vessel.what);
  Object.assign(event, { harm, region, pierce: harm * 60 });
  // Heard: the wound, as bad as its share of what kills.
  if (world.ear && harm > 0) soundWound(world, victim, 'stab', Math.min(1, harm), hit.point);
  event.effects.push(intoGap ? `${region}: through a gap` : meets.pierce > 0 ? `${region}: through the armour` : `${region}`);
  shooter.stats.landed += 1;
  if (victim.weapon?.held && key.startsWith(victim.weapon.main) && BLOCKING.has(key) && world.random() < 0.3) dropWeapon(world, victim, 'disarmed', dir);
  if (victim.gunshot >= 1 && victim.state !== 'out') knockOut(world, victim, event, region === 'head' ? 'an arrow through the head' : 'shot down by arrows', 'killed');
}

/** A stage's damp powder (a stage may set `world.stage.damp`), else the world's. */
const dampSpec = (world) => world.stage.damp ?? WORLD.damp;

/**
 * Level mode, one pull of a matchlock's trigger on bad powder: what happens to the charge, or null when the
 * shot is sound. 'click' (nothing is spent: he can pull again), 'reprime' (the ball stays, the pan wants
 * priming: a short reload), 'puff' (the pan flashes and the charge is wasted), 'hang' (it goes off later).
 */
export function dampShot(world, fighter, weapon, shot) {
  const spec = dampSpec(world);
  const random = world.random;
  if (random() < spec.misfire) {
    let pick = random() * Object.values(spec.misfireKinds).reduce((sum, weight) => sum + weight, 0);
    let kind = 'puff';
    for (const [name, weight] of Object.entries(spec.misfireKinds)) {
      pick -= weight;
      if (pick <= 0) {
        kind = name;
        break;
      }
    }
    if (kind === 'click') world.events.push({ time: world.time, kind: 'misfire', fighter: fighter.id, effects: ['the match drops and nothing happens'] });
    if (kind === 'reprime') {
      weapon.loaded = false;
      weapon.reloaded = Math.max(0, shot.reloadSeconds - spec.primeSeconds);
      world.events.push({ time: world.time, kind: 'misfire', fighter: fighter.id, effects: ['the pan is fouled and must be primed again'] });
    }
    return kind;
  }
  return random() < spec.hangFire ? 'hang' : null;
}

/** A shot that hung fire, going off now (if the man still holds the gun; else it spends itself on the floor). */
function goOffHanging(world, fighter) {
  const list = world.hangFires;
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const entry = list[index];
    if (entry.fighter !== fighter.id || world.time < entry.at) continue;
    list.splice(index, 1);
    if (fighter.state !== 'out' && entry.weapon.held) fire(world, fighter, entry.weapon, entry.aimedAt, entry.aimedId, { delayed: true });
  }
}

/**
 * Reloading a fired gun (a matchlock): only while he means to (`reloading`,
 * set by the AI or the player), standing, and not in the middle of a move;
 * stopped, the work done so far is kept. Done, the gun is loaded.
 */
export function reload(world, fighter, dt) {
  if (world.hangFires?.length) goOffHanging(world, fighter);
  const weapon = fighter.weapon;
  if (!weapon?.held || !weapon.spec.shot || weapon.loaded) return;
  if (!fighter.reloading || fighter.state !== 'up' || fighter.punch) return;
  // Nothing left to load (ammoLeft): it is spent.
  if (ammoLeft(fighter, weapon) <= 0) {
    weapon.spent = true;
    fighter.reloading = false;
    return;
  }
  // Loading takes both hands and a standing man: walking on, it waits.
  if (Math.hypot(...(fighter.rootVelocity ?? [0, 0])) > WORLD.reloadMaxSpeed) return;
  weapon.reloaded = (weapon.reloaded ?? 0) + dt;
  // (A crossbow's, by his strength at the spanning: handling.js crossbowSpan.)
  if (weapon.reloaded < (weapon.handling?.reloadSeconds ?? weapon.spec.shot.reloadSeconds)) return;
  weapon.loaded = true;
  weapon.charges = Math.min(weapon.spec.shot.rounds ?? weapon.spec.shot.barrels ?? 1, ammoLeft(fighter, weapon));
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

// A shot's lane past his own men. Drilled shot fired from behind a rank of their own (Gonzalo's arquebusiers behind
// the pikes at Cerignola, Qi Jiguang's fowling pieces behind his shields): the files stood a metre or so apart, and the
// ball went between them, past the shoulders of the men before (the Spanish and Dutch drill books of the next century
// have the rear ranks fire "through the intervals" of the files, and over a front rank kneeling). Nothing stops a
// ball but what is in its path: a comrade is in the way only if some part of his body (or his shield) is, give or take
// `sway` m (what a man standing in the ranks moves between the shot being laid and going: a breath, a shift of his
// feet, a pike's weight taken) and the ball's own wander, `deviations` of the weapon's spread at that distance (three:
// all but one ball in a few hundred). A shooter weighs the lane past the man he is laid on as well (`beyond`, m): a ball
// that misses him flies on, into whoever stands behind him. A shot whose lane is clear goes past the men before him
// however close they stand; one whose lane is not is held (comradeInLine, ai.js laneFouled), as drilled men held theirs.
export const FIRE_LANE = { sway: 0.1, deviations: 3, beyond: 5 };

/** Where a shot is laid from as he sights along it: his gun shoulder, raised to the cheek (LONG_GUN). */
export function sightFrom(fighter, weapon = fighter.weapon) {
  const side = weapon?.main ?? 'r';
  return vec.add(point(fighter.x, P[`${side}Shoulder`]), [0, LONG_GUN.cheekRise * fighter.body.lengths.upperArm, 0]);
}

/**
 * The comrade whose body is in a shot's lane from `from` toward `to` (and FIRE_LANE.beyond past it when `beyond`),
 * the nearest along it, with `side` the way he stands off the line (+1 to the line's left, on the floor), or null
 * when the lane is clear (FIRE_LANE). `spread` (rad): the weapon's. `flown` (m): the way the missile has come before `from` (an arc traced a
 * piece at a time: arcFouled), its spread grown over it; `after` (s): how long the missile takes to get to `from`, each
 * comrade weighed where his way over the ground will have taken him by then.
 */
export function comradeInLane(world, fighter, lineFrom, to, spread, { beyond = false, flown = 0, after = 0 } = {}) {
  const line = vec.sub(to, lineFrom);
  const reach = vec.length(line);
  if (reach < 1e-6) return null;
  const along = vec.scale(line, 1 / reach);
  const length = reach + (beyond ? FIRE_LANE.beyond : 0);
  const room = (distance) => FIRE_LANE.sway + FIRE_LANE.deviations * spread * Math.max(0, distance + flown);
  let best = null;
  for (const mate of world.fighters) {
    if (mate === fighter || mate.corner !== fighter.corner || mate.state === 'out') continue;
    // Where he will be when it gets there (`after` s, on his way over the ground now: a rider at the gallop crosses a
    // lane in a fraction of an arrow's flight): the lane taken back by as much against him as he stands.
    const from = after > 0 ? vec.sub(lineFrom, vec.scale(overGround(mate), after)) : lineFrom;
    const end = vec.add(from, vec.scale(along, length));
    const hips = point(mate.x, P.pelvis);
    const s = Math.max(0, Math.min(length, vec.dot(vec.sub(hips, from), along)));
    if (vec.length(vec.sub(hips, vec.add(from, vec.scale(along, s)))) > FAR_OFF_LINE + room(length)) continue;
    let nearest = Infinity;
    for (const capsule of capsules(mate)) {
      const [a, b] = capsuleEnds(mate, capsule);
      const meet = closestBetween(from, end, a, b);
      const at = meet.s * length;
      if (at <= 0) continue;
      if (vec.length(vec.sub(meet.onFirst, meet.onSecond)) < capsule.radius + room(at)) nearest = Math.min(nearest, at);
    }
    if (mate.shield) {
      const disc = shieldDisc(mate);
      const at = vec.dot(vec.sub(disc.centre, from), along);
      if (at > 0 && at < length && vec.length(vec.sub(disc.centre, vec.add(from, vec.scale(along, at)))) < disc.radius + room(at)) nearest = Math.min(nearest, at);
    }
    if (nearest < (best?.along ?? Infinity)) {
      const across = (hips[0] - from[0]) * -along[2] + (hips[2] - from[2]) * along[0];
      best = { fighter: mate, along: nearest, side: across >= 0 ? 1 : -1 };
    }
  }
  return best;
}

/**
 * Whether the first man on the line the shot would take (through the sights
 * to the mark, as fire() aims it, less its random error), or near it, is on
 * his own side.
 */
export function comradeInLine(world, fighter, weapon = fighter.weapon, aimedAt = null) {
  const muzzleAt = weapon.spec.muzzle ?? GUN.muzzle;
  const from = vec.add(point(fighter.x, P[`${weapon.main}Hand`]), vec.scale(weapon.dir, muzzleAt[0]));
  const mark = aimedAt ?? (fighter.punch?.aim ? toWorld(fighter, fighter.punch.aim) : vec.add(from, weapon.dir));
  const projectile = weapon.spec.shot?.projectile ?? GUN.projectile;
  // Laid as fire() lays it: held over for the drop at the distance he judges (without the judgement's chance error).
  const dir = slerpDir(heldOver(vec.normalize(vec.sub(mark, from)), projectile, vec.length(vec.sub(mark, from)) * judgedShare(fighter.body.skill)), weapon.dir, GUN.barrelShare);
  // The gun itself, cheek (or shoulder) to muzzle, past the head of the man before him: a muzzle at his ear or through
  // the gap at his neck is a ball fired into him, however clear the lane beyond.
  if (comradeInLane(world, fighter, sightFrom(fighter, weapon), from, 0)) return true;
  // The first man on the ball's whole flight (ballistics.js traceFlight), wherever it comes down.
  let hit = null;
  for (const chord of gunFlight(world, projectile, from, dir)) {
    hit = firstHit(world, fighter, chord.from, chord.to);
    if (hit) break;
  }
  if (hit && hit.fighter.corner === fighter.corner && hit.fighter.state !== 'out') return true;
  // The ball wanders: a comrade's body close beside its path, short of the mark and FIRE_LANE.beyond past it, is at
  // risk too (FIRE_LANE): between the files of the men before him, clear of their shoulders, it goes.
  const reach = hit ? vec.length(vec.sub(hit.point, from)) : vec.length(vec.sub(mark, from)) + FIRE_LANE.beyond;
  return Boolean(comradeInLane(world, fighter, from, vec.add(from, vec.scale(dir, reach + 0.5)), weapon.spec.shot?.spread ?? GUN.spread));
}

/** The line `sighted` (unit) raised by the holdover (ballistics.js) for the drop of `projectile` over `distance` m. */
export function heldOver(sighted, projectile, distance) {
  const up = vec.sub([0, 1, 0], vec.scale(sighted, sighted[1]));
  const length = vec.length(up);
  if (length < 1e-6) return sighted;
  return vec.normalize(vec.add(sighted, vec.scale(up, Math.tan(holdover(projectile, distance)) / length)));
}

/**
 * A round's flight from the muzzle `from` along `dir` at its muzzle velocity (ballistics.js traceFlight): its chords,
 * to where it comes down on the ground (the floor at 0), leaves the field (BALLISTICS.cutoff.beyond past its edge) or is spent.
 */
export function gunFlight(world, projectile, from, dir) {
  const arena = world.arena;
  const beyond = BALLISTICS.cutoff.beyond;
  const within = arena?.halfX ? { halfX: arena.halfX + beyond, halfZ: (arena.halfZ ?? arena.halfX) + beyond } : null;
  return traceFlight(projectile, from, vec.scale(dir, projectile.velocity), { within });
}

/**
 * Fire: a round down the barrel's line as it is, give or take the aim's
 * error. The gun in hand on its shot's mark, or another (`weapon`: a second
 * forearm gun) at a world point (`aimedAt`) on a man (`aimedId`, kept on the shot).
 */
export function fire(world, fighter, weapon = fighter.weapon, aimedAt = null, aimedId = null, { delayed = false } = {}) {
  const punch = fighter.punch;
  const own = weapon === fighter.weapon;
  if (own && punch) punch.fired = true;
  if (!weapon?.held || !weapon.spec.ranged) return;
  if (weapon.spec.bow) return loose(world, fighter);
  // A gun with a charge to load (a matchlock) fires only loaded, and once.
  // (`delayed`: a shot that hung fire, going off now: its charge was spent when the trigger was pulled.)
  const shot = weapon.spec.shot ?? null;
  const random = world.random;
  if (shot && !delayed) {
    if (!weapon.loaded) return;
    // A comrade on the line: he holds the shot (and keeps the charge).
    if (comradeInLine(world, fighter, weapon, aimedAt)) return;
    // Level mode, bad powder: the shot may only click or fail to prime, which spends nothing or little (dampShot).
    const damp = world.stage && !shot.bolt ? dampShot(world, fighter, weapon, shot) : null;
    if (damp === 'click' || damp === 'reprime') return;
    // Several barrels (the three-eyed gun) or a magazine (`rounds`): each shot in turn, empty after the last.
    weapon.charges = (weapon.charges ?? shot.rounds ?? shot.barrels ?? 1) - 1;
    // And one fewer of all he carries (ammoLeft): the last spent, the weapon is (unless more is brought up to the line).
    if (own) spendMissile(world, fighter, weapon);
    weapon.charges = Math.min(weapon.charges, ammoLeft(fighter, weapon));
    weapon.loaded = weapon.charges > 0;
    weapon.reloaded = 0;
    if (!weapon.loaded && own) emptied(world, fighter);
    if (damp === 'puff') {
      world.events.push({ time: world.time, kind: 'misfire', fighter: fighter.id, effects: ['a puff of smoke from the pan, and no shot'] });
      return;
    }
    if (damp === 'hang') {
      const spec = dampSpec(world);
      (world.hangFires ??= []).push({ fighter: fighter.id, weapon, aimedAt, aimedId, at: world.time + spec.hangMin + random() * (spec.hangMax - spec.hangMin) });
      world.events.push({ time: world.time, kind: 'hangfire', fighter: fighter.id, effects: ['the charge smoulders and does not go'] });
      return;
    }
    if (!world.stage && random() < shot.misfire) {
      world.events.push({ time: world.time, kind: 'misfire', fighter: fighter.id, effects: ['flash in the pan'] });
      return;
    }
  }
  // A crossbow looses its bolt; a flamethrower opens its valve a moment longer (flame.js).
  if (shot?.bolt) return loose(world, fighter, shot);
  if (shot?.flame) return flamePulse(world, fighter, weapon);
  // Heard: the powder going off, over the whole field (a matchlock's, or any firearm's: `weapon` says which).
  if (world.ear) soundEvent(world, 'shot', { at: point(fighter.x, P[`${weapon.main}Hand`]), kind: 'matchlock', weapon: weapon.kind, who: fighter.id });
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
  // (A turret's own motion is in its barrel's line itself: its sight is on the gun, the round goes where the barrel lies.)
  const turret = Boolean(weapon.spec.turret && weapon.turret);
  const shaking = turret ? 0 : vec.length(weapon.spec.longGun ? vec.sub(handVelocity, point(fighter.v, P[`${weapon.main}Shoulder`])) : handVelocity);
  // A strong man holds a gun steady; a weak one shakes.
  const strength = fighter.body.strikeForce[handIndex];
  const recoil = WORLD.recoil;
  const steadiness = Math.min(recoil.shakiest, Math.max(recoil.steadiest, Math.sqrt(recoil.reference / Math.max(1, strength))));
  const spread = ((shot?.spread ?? GUN.spread) + (shot?.movingSpread ?? GUN.movingSpread) * moving + GUN.unsettled * shaking) * steadiness * (fighter.stagger > 0 ? GUN.reelingSpread : 1) * (STYLES[fighter.style]?.aimJitter ? 2 : 1) * skillSpread(fighter);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - random() * 0.999999)) * Math.cos(2 * Math.PI * random());
  // Aimed through the sights at the mark: off by the aim's error, and by
  // part of however far the barrel itself is off that line.
  const mark = aimedAt ?? (punch?.aim ? toWorld(fighter, punch.aim) : vec.add(muzzle, barrel));
  // Held over the mark for the drop at the distance he judges it (ballistics.js holdover, judgedShare: a trained eye within
  // a tenth, a novice's short and wild): at duel range nothing, at a hundred metres a matchlock's ball falls most of a metre.
  const projectile = shot?.projectile ?? GUN.projectile;
  const sighted = heldOver(vec.normalize(vec.sub(mark, muzzle)), projectile, vec.length(vec.sub(mark, muzzle)) * judgedShare(fighter.body.skill, gauss()));
  const aimed = turret ? barrel : slerpDir(sighted, barrel, GUN.barrelShare);
  const dir = vec.normalize(vec.add(aimed, vec.add(vec.scale(up, gauss() * spread), vec.scale(across, gauss() * spread))));
  // A shotgun's pellets (`pellets`) open out round the aimed line (`pellet` rad); anything else is one round.
  for (let pellet = 0; pellet < (shot?.pellets ?? 1); pellet += 1) {
    const flight = shot?.pellets ? vec.normalize(vec.add(dir, vec.add(vec.scale(up, gauss() * shot.pellet), vec.scale(across, gauss() * shot.pellet)))) : dir;
    gunRound(world, fighter, weapon, shot, projectile, muzzle, flight, aimedId ?? punch?.target);
  }
  // A turret's kick climbs its muzzle on the cradle and goes on through its mount into the robot (physics/mounted.js turretRecoil).
  if (turret) {
    turretRecoil(world, fighter, weapon, shot?.recoil ?? GUN.recoil);
    return;
  }
  // The gun kicks up and back in the hand.
  // Into both hands (both on the gun in the stance), the arms and the shoulders: a heavy man barely moves, a light one rocks.
  // A long gun's stock drives back into the shoulder and the cheek as well.
  const support = !weapon.spec.mounted && (fighter.aimAt !== undefined || weapon.spec.longGun) ? [[P[`${weapon.off}Hand`], 0.6], [P[`${weapon.off}Elbow`], 0.3]] : [];
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
 * One round (or one pellet) on its way from `muzzle` along `flight` (unit): its flight traced (gunFlight), and on each
 * chord of it the first thing it meets, a man, a horse or a screen of the works, nearest first. What it does there is by
 * the energy it still has (½mv² at that point of its flight, less what a screen it came through took): the armour it
 * meets by that energy (bulletProof), its wound (`shot`'s lethal, bleed and knock, which are for a hit at GUN.woundAt)
 * by that energy against the energy it has there.
 */
function gunRound(world, fighter, weapon, shot, projectile, muzzle, flight, aimedAt) {
  const energy = (shot?.energy ?? GUN.energy) / (shot?.pellets ?? 1);
  const woundAt = (atRange(projectile, GUN.woundAt)?.speed ?? projectile.velocity) ** 2 / projectile.velocity ** 2;
  const shotEvent = (fields) => world.events.push({ time: world.time, kind: 'shot', attacker: fighter.id, weapon: weapon.kind, aimedAt, from: muzzle, normal: vec.scale(flight, -1), harm: 0, ...fields });
  // The share of its muzzle energy a screen it has come through left it.
  let screened = 1;
  let end = muzzle;
  for (const chord of gunFlight(world, projectile, muzzle, flight)) {
    end = chord.to;
    // The share of its muzzle energy it has `s` of the way along this chord (its speed there, squared).
    const kept = (s) => ((chord.speeds[0] + (chord.speeds[1] - chord.speeds[0]) * s) / projectile.velocity) ** 2 * screened;
    const manHit = firstHit(world, fighter, chord.from, chord.to);
    // A horse nearer on the ball's line than any man takes it.
    const horseHit = horseOnPath(world, fighter, chord.from, chord.to);
    // A screen of the works before either (physics/cover.js): the ball stops in it, or comes out with what it did not take.
    const screen = screenOnPath(world, chord.from, chord.to, missileOf(weapon.spec, energy * kept(0)));
    if (screen && (!manHit || screen.s < manHit.s) && (!horseHit || screen.s < horseHit.s)) {
      if (screen.stops) {
        shotEvent({ to: screen.point, target: 'works', point: screen.point, effects: ['into the wall'] });
        world.screened += 1;
        return;
      }
      const before = energy * kept(screen.s);
      if (screen.left < before) screened *= screen.left / before;
    }
    if (horseHit && (!manHit || horseHit.s < manHit.s)) {
      shotEvent({ to: horseHit.point, target: 'horse', point: horseHit.point, effects: ['into a horse'] });
      missileInHorse(world, fighter, horseHit, flight, energy * kept(horseHit.s), { arrow: false });
      return;
    }
    if (!manHit) continue;
    const share = Math.min(1, kept(manHit.s));
    const event = { time: world.time, kind: 'shot', attacker: fighter.id, defender: manHit.fighter.id, weapon: weapon.kind, aimedAt, from: muzzle, to: manHit.point, target: manHit.target, point: manHit.point, normal: vec.scale(flight, -1), harm: 0, effects: [], energy: energy * share };
    world.events.push(event);
    if (manHit.target === 'shield') event.effects.push('stopped by the shield');
    else bulletHit(world, fighter, manHit, flight, event, shot ? spentShot(shot, share, share / woundAt) : null, share / woundAt);
    return;
  }
  shotEvent({ to: end, target: null, point: end, effects: ['missed'] });
}

/**
 * A shot that strikes with `share` of its muzzle energy (its flight's drag, a screen): its `energy` that, its wound (lethal,
 * bleed) `wound` × its table's (what it has against what it has at GUN.woundAt, the tables' distance), its knock as its momentum.
 */
function spentShot(shot, share, wound) {
  const scaled = (table) => Object.fromEntries(Object.entries(table).map(([region, value]) => [region, value * wound]));
  return { ...shot, energy: shot.energy * share, lethal: scaled(shot.lethal ?? GUN.lethal), bleed: scaled(shot.bleed ?? GUN.bleed), impulse: (shot.impulse ?? GUN.impulse) * Math.sqrt(share) };
}

/**
 * A round in a body part: its harm (by region, through armour, scaled to
 * the part's weight and how hurt it already is) towards what kills; it
 * bleeds; to the head or body it staggers him at once; enough and he dies.
 */
export function bulletHit(world, shooter, hit, dir, event, shot = null, share = 1) {
  const victim = hit.fighter;
  const key = hit.capsule.key;
  const region = hit.throat ? 'head' : bulletRegion(key);
  const kind = outfitOf(victim.body.inputs).kind;
  // Armour stops its share of a pistol round; of a heavier ball, only as much
  // as it is proof against. The throat is covered only by full armour's gorget, as the body.
  const covered = hit.throat ? (gapsOf(victim.body.gear).closed?.includes('neck') ? victim.body.gear.protection.bullet?.torso ?? 0 : 0) : victim.body.gear.protection.bullet?.[region] ?? 0;
  const armour = covered * (shot ? bulletProof(OUTFITS[kind].bulletRating, shot.energy) : 1);
  // Plate proof against the ball (a plated kit rated at or past its energy: a short-barrelled three-eyed gun's on a harness) is not
  // gone through: the ball dents it, staggers him, and on the helmet stuns him (GUN.plateKnock), and wounds nothing.
  if (shot && covered > 0 && OUTFITS[kind].plated && (OUTFITS[kind].bulletRating ?? GUN.energy) >= shot.energy) {
    Object.assign(event, { harm: 0, armour: 1, region, plate: kind });
    event.effects.push(`${region}: the ball dents the plate`);
    shooter.stats.landed += 1;
    world.pendingImpulses.push({ fighter: victim, shares: [[hit.capsule.a, 0.5], [hit.capsule.b, 0.5]], direction: dir, impulse: shot.impulse ?? GUN.impulse });
    if (region === 'head') victim.stun = Math.max(victim.stun ?? 0, GUN.plateKnock.stun * shot.energy / GUN.energy);
    stagger(world, victim, WORLD.stagger.startAt + GUN.plateKnock.stagger * shot.energy / GUN.energy, event, true);
    return;
  }
  const own = victim.body.segments[key];
  const reference = bulletReference()[key];
  const scale = own && reference ? reference.mass / own.mass : 1;
  const hurt = 1 + GUN.hurtShare * (victim.damage[key] ?? 0);
  // (`share`: of a pistol round's own figures, GUN's, the share of them it carries when it strikes, GUN.woundAt's energy its
  // whole; a `shot` comes scaled already, spentShot.)
  const spent = shot ? 1 : share;
  const harm = (shot?.lethal ?? GUN.lethal)[region] * spent * (1 - armour) * scale * hurt;
  victim.gunshot = (victim.gunshot ?? 0) + harm;
  victim.damage[key] = Math.min(1, (victim.damage[key] ?? 0) + harm);
  victim.damageVersion += 1;
  victim.bleed = (victim.bleed ?? 0) + (shot?.bleed ?? GUN.bleed)[region] * spent * (1 - armour) * scale;
  // Hard armour over the part takes the round on its surface: no wound to see.
  // A heavy ball mostly goes through: seen to strike the surface only where the armour held most of it.
  Object.assign(event, { harm, armour, region, plate: armour > 0 && OUTFITS[kind].plated && (!shot || armour >= GUN.platedHolds) ? kind : null });
  event.effects.push(armour > 0 ? `${region}: armour took ${Math.round(armour * 100)}%` : `${region}`);
  // Heard: the round's wound, as bad as its share of what kills.
  if (world.ear && harm > 0) soundWound(world, victim, 'stab', Math.min(1, harm), hit.point);
  shooter.stats.landed += 1;
  world.pendingImpulses.push({ fighter: victim, shares: [[hit.capsule.a, 0.5], [hit.capsule.b, 0.5]], direction: dir, impulse: shot?.impulse ?? GUN.impulse * Math.sqrt(Math.min(1, spent)) });
  // A heavy ball in an arm or a leg shatters the bone, most of the time.
  const joint = region === 'limb' ? BULLET_JOINT[key.slice(1)] : null;
  if (shot && joint && victim.state !== 'out' && !victim.broken.has(`${key[0]}${joint}`) && world.random() < shot.limbBreak * (1 - armour)) {
    breakJoint(world, victim, `${key[0]}${joint}`);
    event.effects.push('the bone shattered');
  }
  // A round through the gun arm takes the gun with it.
  if (victim.weapon?.held && key.startsWith(victim.weapon.main) && BLOCKING.has(key)) dropWeapon(world, victim, 'disarmed', dir);
  if (victim.gunshot >= 1 && victim.state !== 'out') {
    // (A grenade's fragment says so: `killedBy`, physics/throwable.js.)
    knockOut(world, victim, event, shot?.killedBy ?? (region === 'head' ? 'shot through the head' : 'shot dead'), 'killed');
    return;
  }
  if (region !== 'limb') stagger(world, victim, WORLD.stagger.startAt + harm * 1.6, event, true);
}

// The joint a shattered limb bone gives way at.
export const BULLET_JOINT = { UpperArm: 'Elbow', Forearm: 'Elbow', Thigh: 'Knee', Shank: 'Knee' };
