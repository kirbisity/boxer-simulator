// The fight world: each fighter is a particle skeleton held together by XPBD
// distance constraints and joint limits, driven by muscles modelled as
// spring-dampers whose force is capped by the muscle's strength. Mass gives
// every movement inertia; the cap decides how hard a muscle can fight back.
// A landed punch hands its momentum to the struck part, which flies until
// the fighter's muscles, after a reflex delay, catch it.

import { BODY, buildBody, P, PARTICLES, SEGMENTS } from './body.js';
import { idleMotion, lifePhases } from './life.js';
import { DEFENCES, MOVES, STYLES, strikeTargets } from './moves.js';
import { factionOf, FACTIONS, glovedFists, HEADGEAR, headgearOptions, outfitOf } from './outfits.js';
import { BLADES, bulletRegion, SHIELDS, WEAPONS, bladeTargets, createWeapon, effectiveMassAt, guardTargets, handShares, harmMix, LEAD_GRIP, offHandAlong, segmentToShield, shieldReach, NET } from './weapons.js';
import { desiredPose, restPose, twoBoneIK, vec, yawRotate } from './pose.js';
import { WORLD } from './physics/config.js';
import { aimTargets, drawBow, emptied, fire, flyArrows, LONG_GUN, raisedAim, reload, sightsOn, SUPPORT_GRIP } from './physics/ranged.js';
import { countPin, drive, holdClinch, holdPin, neckLow, pinnedBy, pinPoints, startPin } from './physics/grappling.js';
import { flyNets } from './physics/net.js';
import { formUp } from './formation.js';
import { handling } from './handling.js';
import { painShare, stepWhips } from './physics/whip.js';
export { WORLD } from './physics/config.js';
export { pinnedBy } from './physics/grappling.js';

// Every attack and its data live in moves.js; the old name stays for callers.
export const PUNCHES = MOVES;

const BRACES = [
  ['lShoulder', 'rShoulder', 'braceCompliance'], ['lHip', 'rHip', 'braceCompliance'],
  ['lShoulder', 'lHip', 'braceCompliance'], ['rShoulder', 'rHip', 'braceCompliance'],
  ['lShoulder', 'rHip', 'diagonalCompliance'], ['rShoulder', 'lHip', 'diagonalCompliance'],
  ['neck', 'lHip', 'diagonalCompliance'], ['neck', 'rHip', 'diagonalCompliance'],
];
const BONE_LINKS = [
  ['neck', 'head'], ['neck', 'lShoulder'], ['neck', 'rShoulder'], ['lShoulder', 'lElbow'], ['rShoulder', 'rElbow'],
  ['lElbow', 'lHand'], ['rElbow', 'rHand'], ['pelvis', 'neck'], ['pelvis', 'lHip'], ['pelvis', 'rHip'],
  ['lHip', 'lKnee'], ['rHip', 'rKnee'], ['lKnee', 'lFoot'], ['rKnee', 'rFoot'],
];
// Each motor chases its target relative to an anchor's actual position, so a
// head knocked sideways is pulled back by the neck, not by the world. Knees
// are placed by IK between the actual hip and the foot's target instead.
const ANCHOR = {
  head: 'neck', neck: 'pelvis', lShoulder: 'pelvis', rShoulder: 'pelvis', lHip: 'pelvis', rHip: 'pelvis',
  lElbow: 'lShoulder', rElbow: 'rShoulder', lHand: 'lShoulder', rHand: 'rShoulder', lKnee: null, rKnee: null,
  pelvis: null, lFoot: null, rFoot: null,
};
const MOTOR_GROUP = {
  head: 'head', neck: 'trunk', lShoulder: 'trunk', rShoulder: 'trunk', lHip: 'trunk', rHip: 'trunk',
  lElbow: 'elbow', rElbow: 'elbow', lHand: 'hand', rHand: 'hand', lKnee: 'knee', rKnee: 'knee',
  pelvis: 'pelvis', lFoot: 'foot', rFoot: 'foot',
};
// Each particle, described once: its name, side, what kind of part it is,
// its muscle group and its anchor (read every substep by the integrator).
const PARTICLE_INFO = PARTICLES.map((name, index) => ({
  index, name, side: name[0],
  arm: name.endsWith('Hand') || name.endsWith('Elbow'),
  foot: name.endsWith('Foot'), knee: name.endsWith('Knee'),
  leg: name.endsWith('Foot') || name.endsWith('Knee'),
  hip: P[`${name[0]}Hip`],
  anchor: ANCHOR[name] === null ? null : P[ANCHOR[name]],
  motorGroup: MOTOR_GROUP[name],
  upperArm: `${name[0]}UpperArm`, forearm: `${name[0]}Forearm`,
}));
export const TRUNK_PARTICLES = ['pelvis', 'lHip', 'rHip', 'neck', 'lShoulder', 'rShoulder'].map((name) => P[name]);
const STRUCK = ['head', 'trunk', 'lForearm', 'rForearm', 'lUpperArm', 'rUpperArm', 'lThigh', 'rThigh', 'lShank', 'rShank'];
export const BLOCKING = new Set(['lForearm', 'rForearm', 'lUpperArm', 'rUpperArm']);
// The chain each striking limb pulls on, and how much each link shares the recoil.
const RECOIL = {
  Hand: [['Hand', 1], ['Elbow', 0.7], ['Shoulder', 0.35]],
  Elbow: [['Elbow', 1], ['Shoulder', 0.5]],
  Knee: [['Knee', 1], ['Hip', 0.6]],
  Foot: [['Foot', 1], ['Knee', 0.7], ['Hip', 0.35]],
};

/** Small deterministic generator so a seed replays a bout exactly. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Contact radius of each particle: the flesh around it, so a body lies on the canvas at its real thickness. */
function particleRadii(body) {
  const segments = body.segments;
  return PARTICLES.map((name) => {
    const side = name[0];
    if (name === 'head') return body.lengths.headRadius;
    if (name === 'neck') return segments.trunk.skinRadius * 0.45;
    if (name === 'pelvis') return segments.trunk.skinRadius * 0.7;
    if (name.endsWith('Shoulder')) return segments[`${side}UpperArm`].skinRadius * 1.2;
    if (name.endsWith('Elbow')) return segments[`${side}Forearm`].skinRadius;
    if (name.endsWith('Hand')) return fistsOf(body).radius;
    if (name.endsWith('Hip')) return segments[`${side}Thigh`].skinRadius;
    if (name.endsWith('Knee')) return segments[`${side}Shank`].skinRadius;
    // The ankle: on the floor through the foot, or through a heel under it.
    return 0.045 + (body.gear?.heelLift ?? 0);
  });
}

export function createFighter(inputs, { id, corner, x, facing, random }) {
  const body = buildBody(inputs);
  const rest = restPose(body);
  const count = PARTICLES.length;
  const fighter = {
    id, corner, body,
    x: new Float64Array(count * 3), v: new Float64Array(count * 3), prev: new Float64Array(count * 3),
    invMass: body.masses.map((mass) => 1 / mass),
    radius: particleRadii(body),
    constraints: [],
    root: [x, 0], rootVelocity: [0, 0], yaw: facing, move: 0,
    intent: {}, desired: rest, targets: rest.map((point) => [...point]),
    feet: null,
    hitAt: new Float64Array(count).fill(-1e9),
    life: lifePhases(random),
    state: 'up', motorScale: 1, stun: 0, stagger: 0, staggerFor: 0, downTimer: 0,
    stamina: 1, concussion: 0, knockdowns: 0, injuries: [],
    // A mixed fighter starts in one of his styles and switches as he goes.
    mixed: STYLES[inputs.style]?.mix ? inputs.style : null,
    style: STYLES[inputs.style]?.mix ? STYLES[inputs.style].mix[Math.floor((random ?? Math.random)() * STYLES[inputs.style].mix.length)] : STYLES[inputs.style] ? inputs.style : 'boxing',
    punch: null, cooldown: 0, guardHigh: 0, slip: 0, defence: null, rush: null, clinch: null,
    legDamage: { l: 0, r: 0 },
    // Damage per body segment (0 fresh, 1 seriously hurt), for the record
    // and for the view; broken joints and the particles they leave limp.
    damage: {}, damageVersion: 0, broken: new Set(), limp: new Set(),
    // Velocity blows and collisions have put into the trunk, which the legs
    // must absorb; what topples a fighter is this, not their own movement.
    knock: [0, 0, 0],
    stats: { thrown: 0, landed: 0, blocked: 0, maxHandSpeed: 0, lastHandSpeed: 0, knockdownsScored: 0 },
    contacts: new Set(),
  };
  for (let index = 0; index < count; index += 1) setPoint(fighter.x, index, toWorld(fighter, rest[index]));
  fighter.prev.set(fighter.x);
  plantFeet(fighter);
  for (const [a, b] of BONE_LINKS) addConstraint(fighter, a, b, 0);
  for (const [a, b, key] of BRACES) addConstraint(fighter, a, b, WORLD[key]);
  armFighter(fighter, fighter.style, { random: random ?? Math.random });
  return fighter;
}

// ---- Weapons in hand ----------------------------------------------------------

function addParticleMass(fighter, index, kg) {
  fighter.body.masses[index] += kg;
  fighter.invMass[index] = 1 / fighter.body.masses[index];
}

/**
 * Take up a style: its weapon goes into the hands (its mass with it) and
 * its shield onto the off forearm. A style without a weapon leaves the
 * hands empty.
 */
function armFighter(fighter, styleKey, { random = Math.random, shield = true } = {}) {
  // Mixed: one of its styles now, switching as he goes.
  if (STYLES[styleKey]?.mix) {
    fighter.mixed = styleKey;
    fighter.style = STYLES[styleKey].mix[Math.floor(random() * STYLES[styleKey].mix.length)];
    return;
  }
  const style = STYLES[styleKey] ?? STYLES.boxing;
  fighter.style = STYLES[styleKey] ? styleKey : 'boxing';
  if (style.weapon) fighter.mixed = null;
  if (shield && style.shield && !fighter.shield) {
    const spec = SHIELDS[style.shield];
    fighter.shield = { kind: style.shield, spec };
    addParticleMass(fighter, P.lHand, spec.mass * 0.6);
    addParticleMass(fighter, P.lElbow, spec.mass * 0.4);
  }
  if (style.net && !fighter.net) fighter.net = { held: true };
  if (!style.weapon) return;
  // Too heavy for him to hold out (handling.js): he fights without it.
  const handled = handling(fighter.body, WEAPONS[style.weapon]);
  if (!handled.canHold) {
    fighter.cannotWield = style.weapon;
    if (style.fallback && style.fallback !== styleKey) armFighter(fighter, style.fallback, { random, shield: false });
    return;
  }
  const weapon = createWeapon(style.weapon);
  weapon.handling = handled;
  const shares = handShares(weapon.spec);
  addParticleMass(fighter, P[`${weapon.main}Hand`], weapon.spec.mass * shares.main);
  if (shares.off) addParticleMass(fighter, P[`${weapon.off}Hand`], weapon.spec.mass * shares.off);
  const guard = guardTargets(style, fighter.body);
  weapon.dir = yawRotate(guard.dir, fighter.yaw);
  weapon.tip = vec.add(point(fighter.x, P[`${weapon.main}Hand`]), vec.scale(weapon.dir, weapon.spec.length));
  fighter.weapon = weapon;
}

/**
 * Let go of the weapon: it falls (or flies, knocked away) as a loose thing
 * on the floor, and the fighter fights on in the style that follows (a
 * hoplomachus draws his gladius; anyone else boxes).
 */
export function dropWeapon(world, fighter, reason, push = [0, 0, 0]) {
  const weapon = fighter.weapon;
  if (!weapon?.held) return;
  releaseWeapon(world, fighter, reason, push);
  if (fighter.state === 'out') return;
  rearm(world, fighter, weapon);
}

/** The weapon leaves his hands and falls as a loose thing (no other drawn in its place). */
function releaseWeapon(world, fighter, reason, push) {
  const weapon = fighter.weapon;
  weapon.held = false;
  // A whip let go: its thong is no longer swung (it lies with the handle).
  weapon.rope = null;
  const shares = handShares(weapon.spec);
  addParticleMass(fighter, P[`${weapon.main}Hand`], -weapon.spec.mass * shares.main);
  if (shares.off) addParticleMass(fighter, P[`${weapon.off}Hand`], -weapon.spec.mass * shares.off);
  const hand = point(fighter.x, P[`${weapon.main}Hand`]);
  const spec = weapon.spec;
  const centre = vec.add(hand, vec.scale(weapon.dir, (spec.length - spec.handle) / 2));
  const random = world.random;
  world.debris.push({
    id: world.debris.length, kind: 'weapon', weapon: weapon.kind, owner: fighter.id, x: centre, loaded: weapon.loaded, charges: weapon.charges,
    colour: weapon.colour, v: vec.add(vec.add(point(fighter.v, P[`${weapon.main}Hand`]), push), [0, 0.6, 0]), q: quatFromTo([0, 1, 0], weapon.dir),
    spin: [0, 1, 2].map(() => (random() < 0.5 ? -1 : 1) * (3 + random() * 6)), radius: spec.radius * 1.6, axis: [0, 1, 0], half: (spec.length + spec.handle) / 2, resting: false,
  });
  if (fighter.punch?.spec.path === 'blade' || fighter.punch?.spec.path === 'aim') fighter.punch = null;
  world.events.push({ time: world.time, kind: 'disarmed', fighter: fighter.id, weapon: weapon.kind, point: hand, effects: [reason === 'disarmed' ? `${spec.label} knocked away` : `${spec.label} dropped`] });
}

/** After losing a weapon, the next: a backup, his kit's sidearm, or his bare hands. */
function rearm(world, fighter, weapon) {
  // A backup weapon if he carries one: the hoplomachus's gladius, or his
  // kit's sidearm (a knight's dagger, a samurai's wakizashi), drawn once;
  // else he fights mixed.
  // A man whose sidearm is the weapon he just lost (a Ming soldier's dao) has his kit's spare.
  const gear = fighter.body.gear;
  const sidearmKind = fighter.sidearmDrawn ? null : gear.sidearm !== weapon.kind ? gear.sidearm : gear.spare ?? null;
  // A kit names its sidearm by style; a bare weapon kind is fought in that weapon's style.
  const sidearm = sidearmKind && !STYLES[sidearmKind] ? styleForWeapon(sidearmKind) ?? null : sidearmKind;
  const fallback = STYLES[fighter.style]?.fallback;
  const next = fallback && fallback !== 'mix' ? fallback : sidearm ?? fallback ?? 'mix';
  if (next === sidearm) fighter.sidearmDrawn = true;
  fighter.weapon = null;
  if (fighter.state === 'down') {
    // Down, he draws the next weapon (if any) as he gets up.
    fighter.style = next;
    fighter.pendingArm = next;
    return;
  }
  armFighter(fighter, next, { random: world.random });
  if (fighter.weapon) world.events.push({ time: world.time, kind: 'drew', fighter: fighter.id, weapon: fighter.weapon.kind, effects: [`draws the ${fighter.weapon.spec.label.toLowerCase()}`] });
}

/** Going down shakes the grip: sometimes the weapon goes with the fall. */
function shakenLoose(world, fighter) {
  if (fighter.weapon?.held && world.random() < WORLD.weapons.dropOnFall) dropWeapon(world, fighter, 'dropped');
  if (fighter.shield && world.random() < WORLD.shield.dropOnFall) dropShield(world, fighter, 'dropped');
}

/** A rotation (x, y, z, w) taking the unit axes to these three (a right-handed basis). */
function quatFromBasis(x, y, z) {
  const trace = x[0] + y[1] + z[2];
  let q;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    q = [(y[2] - z[1]) * s, (z[0] - x[2]) * s, (x[1] - y[0]) * s, 0.25 / s];
  } else if (x[0] > y[1] && x[0] > z[2]) {
    const s = 2 * Math.sqrt(1 + x[0] - y[1] - z[2]);
    q = [0.25 * s, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s];
  } else if (y[1] > z[2]) {
    const s = 2 * Math.sqrt(1 + y[1] - x[0] - z[2]);
    q = [(y[0] + x[1]) / s, 0.25 * s, (z[1] + y[2]) / s, (z[0] - x[2]) / s];
  } else {
    const s = 2 * Math.sqrt(1 + z[2] - x[0] - y[1]);
    q = [(z[0] + x[2]) / s, (z[1] + y[2]) / s, 0.25 * s, (x[1] - y[0]) / s];
  }
  const length = Math.hypot(...q);
  return q.map((value) => value / length);
}

/**
 * The shield leaves his arm: its weight off the arm, and it falls (or flies,
 * wrenched) as a plate of its own, to tumble and lie on its face or back.
 */
export function dropShield(world, fighter, reason, push = [0, 0, 0]) {
  if (!fighter.shield) return;
  const shield = shieldDisc(fighter);
  const spec = fighter.shield.spec;
  addParticleMass(fighter, P.lHand, -spec.mass * 0.6);
  addParticleMass(fighter, P.lElbow, -spec.mass * 0.4);
  const random = world.random;
  world.debris.push({
    id: world.debris.length, kind: 'shield', shield: fighter.shield.kind, owner: fighter.id, x: shield.centre, plate: true,
    v: vec.add(vec.add(point(fighter.v, P.lHand), push), [0, 0.4, 0]), q: quatFromBasis(shield.across, shield.up, shield.normal),
    spin: [0, 1, 2].map(() => (random() < 0.5 ? -1 : 1) * (1 + random() * 3)), radius: shieldReach(spec), axis: [0, 0, 1], half: 0.02, resting: false,
  });
  fighter.shield = null;
  world.events.push({ time: world.time, kind: 'disarmed', fighter: fighter.id, point: shield.centre, effects: [`${spec.label.toLowerCase()} ${reason === 'wrenched' ? 'torn from his arm' : 'dropped'}`] });
}

/** Which style a weapon picked up off the floor is fought in. */
export function styleForWeapon(kind) {
  return STYLE_KEYS_ALL.find((key) => STYLES[key].weapon === kind && !STYLES[key].hidden) ?? STYLE_KEYS_ALL.find((key) => STYLES[key].weapon === kind);
}
const STYLE_KEYS_ALL = Object.keys(STYLES);
const WEAPON_LABEL = (kind) => WEAPONS[kind].label.toLowerCase();

/** Stoop for a weapon on the floor: he crouches and reaches for it. */
export function startPickup(world, fighter, debris) {
  // The standard is taken up whatever is in the hands: that is let fall.
  const standard = WEAPONS[debris.weapon]?.flag;
  // A shield is taken up on the other arm, whatever is in the hand.
  const shield = debris.kind === 'shield';
  if (shield && fighter.shield) return false;
  if (fighter.state !== 'up' || (fighter.weapon?.held && !standard && !shield) || fighter.punch || fighter.pickup || debris.taken || !debris.resting) return false;
  fighter.pickup = { debris: debris.id, t: 0 };
  fighter.clinch = null;
  return true;
}

/** Each frame of a pickup: once stooped with the hand on it, the weapon is his. */
function updatePickup(world, fighter, dt) {
  const pickup = fighter.pickup;
  if (!pickup) return;
  const debris = world.debris[pickup.debris];
  pickup.t += dt;
  if (!debris || debris.taken || fighter.state !== 'up' || pickup.t > WORLD.weapons.pickupGiveUp) {
    fighter.pickup = null;
    return;
  }
  const reach = vec.length(vec.sub(point(fighter.x, debris.kind === 'shield' ? P.lHand : P.rHand), debris.x));
  if (pickup.t < WORLD.weapons.pickupSeconds || reach > WORLD.weapons.pickupReach) return;
  debris.taken = true;
  fighter.pickup = null;
  if (debris.kind === 'shield') {
    const spec = SHIELDS[debris.shield];
    fighter.shield = { kind: debris.shield, spec };
    addParticleMass(fighter, P.lHand, spec.mass * 0.6);
    addParticleMass(fighter, P.lElbow, spec.mass * 0.4);
    world.events.push({ time: world.time, kind: 'pickup', fighter: fighter.id, effects: [`takes up the ${spec.label.toLowerCase()}`] });
    return;
  }
  if (fighter.weapon?.held) releaseWeapon(world, fighter, 'dropped', [0, 0, 0]);
  armFighter(fighter, styleForWeapon(debris.weapon), { random: world.random, shield: false });
  if (debris.colour) fighter.weapon.colour = debris.colour;
  // A gun picked up is as it was dropped: its rounds left, and fired out, empty.
  if (fighter.weapon?.spec.shot && debris.charges !== undefined) fighter.weapon.charges = debris.charges;
  if (fighter.weapon?.spec.shot && debris.loaded === false) {
    fighter.weapon.loaded = false;
    emptied(world, fighter);
  }
  world.events.push({ time: world.time, kind: 'pickup', fighter: fighter.id, weapon: debris.weapon, effects: [`picks up the ${WEAPON_LABEL(debris.weapon)}`] });
}

/**
 * What a fighter's kit stops where it struck: its protection, with what it
 * says for that region (`regions`: head, torso, limb) over it. Medieval
 * armour covers the whole man alike; a modern vest guards the torso alone.
 */
export function protectionAt(gear, capsuleKey) {
  // Most particular first: this very part (rForearm), the part on either side
  // (Forearm), then its region (head, torso, limb). A region may say whether
  // it is plate that turns a blade (`deflects`); else the kit says.
  const regions = gear.protection.regions;
  const own = regions && (regions[capsuleKey] ?? regions[capsuleKey.replace(/^[lr](?=[A-Z])/, '')] ?? regions[bulletRegion(capsuleKey)]);
  if (!own) return gear.deflects === undefined ? gear.protection : { ...gear.protection, deflects: gear.deflects };
  return { ...gear.protection, deflects: gear.deflects, ...own };
}

/** A brittle edge (obsidian) loses part of its cut: on armour, a shield or a steel blade. */
function chip(world, fighter) {
  const weapon = fighter.weapon;
  if (!weapon?.spec.brittle) return;
  weapon.edge = (weapon.edge ?? 1) * weapon.spec.brittle;
  if (weapon.edge < 0.25 && !weapon.dulled) {
    weapon.dulled = true;
    world.events.push({ time: world.time, kind: 'chipped', fighter: fighter.id, effects: ['the obsidian edge is gone'] });
  }
}

/** A blow jars the grip; strained past what the hand can hold, the weapon goes. */
export function strainGrip(world, fighter, impulse, push = [0, 0, 0]) {
  const weapon = fighter.weapon;
  if (!weapon?.held || impulse <= 0) return;
  // A long lever off the hands is easier to tear away (`grip` < 1).
  weapon.strain += impulse / (BLADES.gripImpulsePerNewton * (weapon.spec.grip ?? 1) * fighter.body.strikeForce[P[`${weapon.main}Hand`]]);
  if (weapon.strain >= 1) dropWeapon(world, fighter, 'disarmed', push);
}

/** The weapon's targets for this frame: guard, block or the move in flight, and how many hands hold it. */
/**
 * A block that goes to meet the strike: the blade set across the line from
 * the strike to what it aims at, halfway along it, the edge towards it —
 * a fist or a shin that comes on runs into the edge. Tracks the strike as
 * it comes. Null if there is nothing to meet.
 */
function interceptBlock(world, fighter) {
  const attacker = world.fighters[fighter.defence?.from];
  const punch = attacker?.punch;
  if (!punch) return null;
  const weapon = fighter.weapon;
  const threat = attacker.weapon?.held && punch.spec.path === 'blade'
    ? vec.add(point(attacker.x, P[`${attacker.weapon.main}Hand`]), vec.scale(attacker.weapon.dir, attacker.weapon.spec.length * 0.7))
    : point(attacker.x, P[punch.spec.limb]);
  const mine = punch.zone === 'head' ? point(fighter.x, P.head) : vec.lerp(point(fighter.x, P.pelvis), point(fighter.x, P.neck), 0.6);
  const line = vec.sub(threat, mine);
  if (vec.length(line) < 1e-3) return null;
  const toward = vec.normalize(line);
  // Driven out through the meeting point, towards the strike: the edge goes into whatever comes.
  const meet = vec.add(mine, vec.scale(line, Math.min(0.5, (weapon.spec.length * 0.6) / vec.length(line)) + WORLD.fendDrive));
  // Across the line, tilted up; pointed to whichever side the strike is not coming round from.
  let across = vec.cross(toward, [0, 1, 0]);
  if (vec.length(across) < 1e-3) across = yawRotate([0, 0, 1], fighter.yaw);
  across = vec.normalize(vec.add(vec.normalize(across), [0, 0.6, 0]));
  const hand = vec.sub(meet, vec.scale(across, weapon.spec.length * 0.45));
  return { hand: toLocal(fighter, hand), dir: yawRotate(across, -fighter.yaw) };
}

function weaponIntent(world, fighter, intent) {
  const style = STYLES[fighter.style];
  const H = fighter.body.heightM;
  const punch = fighter.punch;
  if (fighter.shield && !(punch && punch.spec.limb.startsWith('l'))) {
    // The shield arm before the chest, punched out to meet a strike.
    const blocking = fighter.defence?.name === 'shieldBlock';
    const guard = style.shieldGuard ?? [0.3, 0.72, 0.05];
    // In a testudo the shield is the formation's: a wall before him or a roof over him.
    const pose = !blocking && fighter.shieldPose ? WORLD.shield[fighter.shieldPose] : null;
    intent.lHand = vec.scale(pose ?? (blocking ? [guard[0] + 0.1, guard[1] + 0.1, guard[2] - 0.03] : guard), H);
  }
  // The net held out in the off hand, ready to throw.
  if (fighter.net?.held && style.netGuard && !fighter.shield) intent.lHand = vec.scale(style.netGuard, H);
  const weapon = fighter.weapon;
  intent.bladeDir = null;
  intent.weaponArms = null;
  if (!weapon?.held || !style.weaponGuard) return;
  let target;
  if (punch?.spec.path === 'blade' && punch.t <= punch.spec.extendUntil) {
    target = bladeTargets(punch.spec, punch.load > 0 ? 0 : punch.t, punch.aim, fighter.body, weapon.spec);
    // A thrust's point is steered at the target from wherever the hand really is.
    if (punch.spec.mode === 'thrust' && punch.t >= punch.spec.windup) {
      target.dir = vec.normalize(vec.sub(punch.aim, toLocal(fighter, point(fighter.x, P[`${weapon.main}Hand`]))));
    }
  } else if (fighter.defence?.name === 'weaponBlock') {
    // Blade across the strike's line, meeting it; or across before the head.
    target = interceptBlock(world, fighter) ?? { hand: vec.scale([0.2, 0.8, -0.08], H), dir: vec.normalize([0.15, 0.3, 1]) };
  } else if (weapon.spec.ranged && (punch?.spec.path === 'aim' || fighter.aimAt !== undefined)) {
    // Engaging, the gun stays up on him between shots; a shot raises it from wherever it is.
    const held = fighter.aimAt !== undefined && world.fighters[fighter.aimAt] ? raisedAim(fighter, toLocal(fighter, aimPoint(world.fighters[fighter.aimAt], 'body'))) : guardTargets(style, fighter.body);
    target = punch?.spec.path === 'aim' ? aimTargets(world, fighter, punch, held) : held;
  } else target = guardTargets(style, fighter.body);
  const main = weapon.main;
  // A pistol up and aimed is held in both hands: the support hand wraps the
  // gun hand from below and behind, its elbow bent — the Chapman triangle.
  if (weapon.spec.ranged && (punch?.spec.path === 'aim' || fighter.aimAt !== undefined)) {
    if (weapon.spec.bow) target = drawBow(world, fighter, punch, target, intent);
    // The duellist: one hand on the gun, the other at the small of his back.
    else if (style.oneHandAim) intent[`${weapon.off}Hand`] = vec.scale([-0.14, 0.52, weapon.off === 'l' ? 0.06 : -0.06], H);
    else intent[`${weapon.off}Hand`] = vec.add(target.hand, vec.scale(SUPPORT_GRIP, H));
  } else if (weapon.spec.bow) weapon.draw = 0;
  if (weapon.spec.leadAhead) target = { ...target, hand: vec.sub(target.hand, vec.scale(target.dir, weapon.spec.spacing * LEAD_GRIP.rearShare)) };
  intent[`${main}Hand`] = target.hand;
  intent.bladeDir = target.dir;
  const oneHanded = weapon.spec.hands === 'one' || (weapon.spec.hands === 'hybrid' && (fighter.net?.held || (punch?.spec.path === 'blade' && punch.spec.grip === 'one' && punch.t <= punch.spec.extendUntil)));
  intent.twoHanded = !oneHanded;
  if (!oneHanded) intent[`${weapon.off}Hand`] = vec.add(target.hand, vec.scale(target.dir, offHandAlong(weapon.spec)));
  if (fighter.reloading && weapon.spec.shot && !weapon.loaded && !punch) {
    const spanning = weapon.spec.shot.bolt;
    const stroke = 0.5 - 0.5 * Math.cos(2 * Math.PI * LONG_GUN.ramPerSecond * (weapon.reloaded ?? 0));
    if (spanning) {
      // Spanning a crossbow: its nose down before his feet, the hand on the
      // tiller, the other drawing the string up the stock to the nut.
      target = { hand: vec.scale(LONG_GUN.spanHand, H), dir: vec.normalize(LONG_GUN.spanDir) };
      intent[`${weapon.off}Hand`] = vec.add(target.hand, vec.scale(target.dir, LONG_GUN.spanFrom - LONG_GUN.spanStroke * stroke));
    } else {
      // Reloading: the gun upright, the support hand ramming the ball home (a pistol held up before the chest, its short rod).
      const pistol = weapon.spec.hands === 'one';
      target = { hand: vec.scale(pistol ? LONG_GUN.pistolReloadHand : LONG_GUN.reloadHand, H), dir: [0.08, 1, 0] };
      const rod = pistol ? weapon.spec.length / LONG_GUN.ramFrom : 1;
      intent[`${weapon.off}Hand`] = vec.add(target.hand, vec.scale(target.dir, (LONG_GUN.ramFrom + LONG_GUN.ramStroke * stroke) * rod));
    }
    intent[`${main}Hand`] = target.hand;
    intent.bladeDir = target.dir;
    // The support hand is off the gun, on the ramrod.
    intent.twoHanded = false;
    intent.weaponArms = [main];
    intent.polearmRear = null;
    intent.weaponReach = null;
    intent.windingUp = false;
    return;
  }
  intent.weaponArms = oneHanded ? [main] : [main, weapon.off];
  intent.weaponReach = style.weaponGuard.reach ?? null;
  intent.polearmRear = weapon.spec.leadAhead && !oneHanded ? main : null;
  intent.windingUp = punch?.spec.path === 'blade' && (punch.load > 0 || punch.t < punch.spec.windup);
}

/**
 * Move the weapon with the hands, each substep. The wrists turn it towards
 * where the move points it, a spring as fast as its inertia allows (stiffer
 * with both hands on it), while its own weight pulls the point down. In two
 * hands, the off hand is held to the handle a grip behind the main one.
 */
function updateWeapon(fighter, h) {
  const weapon = fighter.weapon;
  const spec = weapon.spec;
  const main = P[`${weapon.main}Hand`];
  const off = P[`${weapon.off}Hand`];
  const previous = weapon.dir;
  const able = fighter.state === 'up' || fighter.state === 'rising';
  let twoHands = false;
  if (fighter.intent.twoHanded && able) {
    const gap = vec.length(vec.sub(point(fighter.x, main), point(fighter.x, off)));
    twoHands = gap < spec.spacing * 2.5;
  }
  const want = fighter.intent.bladeDir && able ? yawRotate(fighter.intent.bladeDir, fighter.yaw) : previous;
  const axis = vec.cross(previous, want);
  const sin = vec.length(axis);
  const angle = Math.atan2(sin, vec.dot(previous, want));
  const unit = sin > 1e-6 ? vec.scale(axis, 1 / sin) : [0, 0, 0];
  // As fast as his arms turn it (handling.js: a heavy weapon slowly in weak hands).
  const omega = spec.wrist.omega * (twoHands ? WORLD.twoHandWrist : 1) * (weapon.handling?.speed ?? 1);
  const zeta = spec.wrist.zeta;
  const strength = Math.max(0, fighter.motorScale);
  const reach = spec.length + spec.handle;
  const gyration = (reach * reach) / 12 + spec.balance * spec.balance;
  const sag = vec.scale(vec.cross(previous, [0, -1, 0]), (WORLD.gravity * spec.balance) / gyration);
  const drive = vec.scale(unit, omega * omega * strength * angle);
  const brake = vec.scale(weapon.spin, 2 * zeta * omega * Math.max(0.3, strength));
  weapon.spin = vec.add(weapon.spin, vec.scale(vec.add(vec.sub(drive, brake), sag), h));
  // Wrists turn a weapon no faster than this (rad/s).
  const turnRate = vec.length(weapon.spin);
  if (turnRate > WORLD.weaponTurnLimit) weapon.spin = vec.scale(weapon.spin, WORLD.weaponTurnLimit / turnRate);
  const dir = rotateAbout(previous, weapon.spin, h);
  if (twoHands) {
    // The off hand on the handle, shared by the hands' inverse masses.
    // A sword's hands keep their places on the grip. On a polearm the shaft
    // slides through the front hand: it holds the line wherever along the
    // shaft it is (short of the head), so a thrust driven by the rear hand
    // is not dragged back by a front arm that cannot reach any further.
    let along = offHandAlong(spec);
    if (spec.leadAhead) {
      const reached = vec.dot(vec.sub(point(fighter.x, off), point(fighter.x, main)), dir);
      along = Math.min(spec.strikeFrom - WORLD.grip.headClear, Math.max(spec.spacing * WORLD.grip.shortest, reached));
    }
    const handle = vec.add(point(fighter.x, main), vec.scale(dir, along));
    let offset = vec.sub(point(fighter.x, off), handle);
    // Drawn together a little each substep, never snapped: a big correction
    // here becomes speed, and speed fed back each substep explodes the arm.
    const gap = vec.length(offset);
    if (gap > WORLD.gripStep) offset = vec.scale(offset, WORLD.gripStep / gap);
    const wMain = fighter.invMass[main];
    const wOff = fighter.invMass[off];
    // Moved, not pushed: the previous positions move too, so a grip held
    // against the arms every substep adds no speed (a steady correction
    // otherwise becomes a huge, unbounded force on the hands).
    for (let index = 0; index < 3; index += 1) {
      const offShift = -offset[index] * (wOff / (wMain + wOff));
      const mainShift = offset[index] * (wMain / (wMain + wOff));
      fighter.x[off * 3 + index] += offShift;
      fighter.prev[off * 3 + index] += offShift;
      fighter.x[main * 3 + index] += mainShift;
      fighter.prev[main * 3 + index] += mainShift;
    }
  }
  weapon.twoHanded = twoHands;
  weapon.dir = dir;
  const tip = vec.add(point(fighter.x, main), vec.scale(dir, spec.length));
  // The hand's speed plus the blade turning about it (not a difference of
  // positions, which would count every contact correction as speed).
  weapon.tipVelocity = vec.add(handVelocityOf(fighter, main), vec.cross(weapon.spin, vec.scale(dir, spec.length)));
  weapon.tip = tip;
}

/**
 * The hand's own speed for a weapon contact: no faster than its muscles can
 * drive it. Contact corrections from bodies pressed together add apparent
 * speed to the particle that no blade really has.
 */
function handVelocityOf(fighter, index) {
  const velocity = point(fighter.v, index);
  const limit = fighter.body.topSpeed[index] * 1.15;
  const speed = vec.length(velocity);
  return speed > limit ? vec.scale(velocity, limit / speed) : velocity;
}

/** Turn a unit vector by angular velocity × time (Rodrigues). */
function rotateAbout(v, angular, time) {
  const rate = vec.length(angular);
  const angle = rate * time;
  if (angle < 1e-9) return v;
  const k = vec.scale(angular, 1 / rate);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const turned = vec.add(vec.add(vec.scale(v, cos), vec.scale(vec.cross(k, v), sin)), vec.scale(k, vec.dot(k, v) * (1 - cos)));
  return vec.normalize(turned);
}

/** The quaternion [x, y, z, w] turning unit vector a onto b. */
export function quatFromTo(a, b) {
  const d = vec.dot(a, b);
  if (d < -0.999999) {
    const axis = vec.normalize(Math.abs(a[0]) < 0.9 ? vec.cross([1, 0, 0], a) : vec.cross([0, 1, 0], a));
    return [axis[0], axis[1], axis[2], 0];
  }
  const c = vec.cross(a, b);
  const q = [c[0], c[1], c[2], 1 + d];
  const length = Math.hypot(...q);
  return q.map((value) => value / length);
}

function quatMultiply(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function quatRotate(q, v) {
  const u = [q[0], q[1], q[2]];
  const t = vec.scale(vec.cross(u, v), 2);
  return vec.add(vec.add(v, vec.scale(t, q[3])), vec.cross(u, t));
}

/** The shield's disc now: centre, facing and radius, off the forearm towards where the fighter faces. */
export function shieldDisc(fighter) {
  const spec = fighter.shield.spec;
  const elbow = point(fighter.x, P.lElbow);
  const hand = point(fighter.x, P.lHand);
  const forearm = vec.normalize(vec.sub(hand, elbow));
  const forward = yawRotate([1, 0, 0], fighter.yaw);
  let normal = vec.sub(forward, vec.scale(forearm, vec.dot(forward, forearm)));
  normal = vec.length(normal) > 1e-6 ? vec.normalize(normal) : forward;
  // Upright (a shaped shield is held so), and across it: the frame it is drawn and struck in.
  let up = vec.sub([0, 1, 0], vec.scale(normal, normal[1]));
  up = vec.length(up) > 1e-6 ? vec.normalize(up) : [0, 1, 0];
  // Locked in a wall (a testudo's front): square to the front, upright.
  if (fighter.shieldPose === 'wall' && fighter.defence?.name !== 'shieldBlock') {
    normal = forward;
    up = [0, 1, 0];
  }
  // Raised as a roof (a testudo): facing up, leaning forward; its length runs forward.
  if (fighter.shieldPose === 'roof' && fighter.defence?.name !== 'shieldBlock') {
    normal = vec.normalize(vec.add([0, 1, 0], vec.scale(forward, WORLD.shield.roofTilt)));
    up = vec.normalize(vec.sub(forward, vec.scale(normal, vec.dot(forward, normal))));
  }
  const across = vec.cross(up, normal);
  // A shaped shield is gripped at its middle; a round one rides the forearm.
  const centre = spec.shape ? vec.add(hand, vec.scale(normal, spec.offset)) : vec.add(vec.lerp(elbow, hand, 0.55), vec.scale(normal, spec.offset));
  return { centre, normal, up, across, radius: shieldReach(spec), spec };
}

/** Move a fighter bodily to stand with its root at (x, z), feet replanted. */
export function placeFighter(fighter, x, z = fighter.root[1]) {
  const dx = x - fighter.root[0];
  const dz = z - fighter.root[1];
  fighter.root = [x, z];
  for (let index = 0; index < fighter.x.length; index += 3) {
    for (const array of [fighter.x, fighter.prev]) {
      array[index] += dx;
      array[index + 2] += dz;
    }
  }
  plantFeet(fighter);
}

function addConstraint(fighter, a, b, compliance) {
  const i = P[a];
  const j = P[b];
  const rest = vec.length(vec.sub(fighter.desired[i], fighter.desired[j]));
  fighter.constraints.push({ i, j, rest, compliance });
}

/** Gloved unless the fighter's inputs say otherwise. */
export function fistsOf(body) {
  return glovedFists(body.inputs) ? WORLD.fists.gloved : WORLD.fists.bare;
}

/**
 * @param arena half-sizes of the floor fighters can use, in x and z
 * (a ring is square; a subway platform long and narrow).
 */
export function createWorld(fighterInputs, { seed = 1, arena = { halfX: WORLD.ringHalf, halfZ: WORLD.ringHalf }, rules = {}, formation = {} } = {}) {
  const random = seededRandom(seed);
  const sides = fighterInputs.map((entry, index) => ({ inputs: entry.inputs ?? entry, corner: entry.corner ?? (index % 2 === 0 ? 'red' : 'blue') }));
  // With a gun in the fight, they start further apart: room for the gun to work, and to close.
  const gunFight = sides.some((side) => STYLES[side.inputs.style]?.ranged);
  const apart = gunFight ? Math.min(WORLD.gunStartApart, arena.halfX - 0.6) : 1.1;
  const fighters = sides.map((side, index) => {
    const onRed = side.corner === 'red';
    const x = (onRed ? -1 : 1) * apart;
    return createFighter(side.inputs, { id: index, corner: side.corner, x, facing: onRed ? 0 : Math.PI, random });
  });
  // Sides line up in rows facing each other: as many abreast as the floor
  // is wide, the rest in rows behind. The sides need not be the same size.
  // A level's `formation` per side: `front` (m from the centre to the first
  // row), `spacing` (m apart in a row), `rowSpacing`, `perRow`, and `loose` (m: each
  // stands up to this far off his place, a crowd rather than a rank).
  // `shootersFront` (m): the bows and guns form the front rows, the rest
  // behind them this far back (a gap to shoot over and fall back through).
  for (const corner of ['red', 'blue']) {
    const team = fighters.filter((fighter) => fighter.corner === corner);
    const order = formation[corner];
    if (team.length < 2 && !order) continue;
    const spacing = order?.spacing ?? WORLD.teamSpacing;
    const rowSpacing = order?.rowSpacing ?? WORLD.teamRowSpacing;
    const front = order?.front ?? (gunFight ? apart : 1.1);
    const perRow = order?.perRow ?? Math.max(1, Math.floor((2 * (arena.halfZ - 0.5)) / spacing) + 1);
    const sign = corner === 'red' ? -1 : 1;
    const placeRows = (group, back) => group.forEach((fighter, index) => {
      const row = Math.floor(index / perRow);
      const inRow = Math.min(perRow, group.length - row * perRow);
      let across = ((index % perRow) - (inRow - 1) / 2) * spacing;
      let x = sign * Math.min(arena.halfX - 0.4, front + back + row * rowSpacing);
      if (order?.loose) {
        across += (random() * 2 - 1) * order.loose;
        x += (random() * 2 - 1) * order.loose;
      }
      placeFighter(fighter, Math.max(-(arena.halfX - 0.4), Math.min(arena.halfX - 0.4, x)), Math.max(-(arena.halfZ - 0.4), Math.min(arena.halfZ - 0.4, across)));
    });
    if (order?.shootersFront !== undefined) {
      const shooting = (fighter) => Boolean(STYLES[fighter.style]?.ranged);
      const shooters = team.filter(shooting);
      const rest = team.filter((fighter) => !shooting(fighter));
      placeRows(shooters, 0);
      placeRows(rest, shooters.length ? Math.ceil(shooters.length / perRow) * rowSpacing + order.shootersFront : 0);
    } else placeRows(team, 0);
  }
  for (const fighter of fighters) fighter.arena = arena;
  // Headgear the outfit allows (a crest needs a kabuto; a headset no helmet).
  const props = fighters.flatMap((fighter) => (fighter.body.inputs.accessories ?? []).filter((kind) => headgearOptions(outfitOf(fighter.body.inputs).kind).includes(kind)).map((kind) => ({ kind, owner: fighter.id, attached: true, x: point(fighter.x, P.head), v: [0, 0, 0], spin: [0, 0, 0], turn: [0, 0, 0], resting: false })));
  const standards = raiseStandards(fighters, random);
  // `rules`: a level's own (noPins: a man down gets up again; nobody holds him there).
  const world = { time: 0, fighters, events: [], random, over: false, pendingImpulses: [], lastDt: 1 / 60, arena, props, debris: [], arrows: [], clashing: new Set(), rules, standards };
  // Drilled men form up on their side's leader (formation.js).
  formUp(world, (corner) => (standards[corner] ? fighters[standards[corner].leader] : null));
  return world;
}

/**
 * Each side big enough has a leader: one who leads (`inputs.leads`), else
 * the man nearest its middle. Where his
 * faction has a standard, he bears it, in his hands in place of his weapon or
 * worn on his back. Returns { corner: { leader, kind, colour } }.
 */
function raiseStandards(fighters, random) {
  const standards = {};
  for (const corner of ['red', 'blue']) {
    const team = fighters.filter((fighter) => fighter.corner === corner);
    if (team.length < WORLD.standard.minSide) continue;
    const middle = [0, 0];
    for (const fighter of team) {
      middle[0] += fighter.root[0] / team.length;
      middle[1] += fighter.root[1] / team.length;
    }
    let leader = team[0];
    for (const fighter of team) if (Math.hypot(fighter.root[0] - middle[0], fighter.root[1] - middle[1]) < Math.hypot(leader.root[0] - middle[0], leader.root[1] - middle[1])) leader = fighter;
    // One who led in life leads here, and bears the standard (Joan her banner).
    leader = team.find((fighter) => fighter.body.inputs.leads) ?? leader;
    standards[corner] = { leader: leader.id };
  }
  // Each flag in its own colour where both sides have one and they differ; else each side's banner, or its corner's.
  const colours = Object.fromEntries(Object.entries(standards).map(([corner, { leader }]) => [corner, FACTIONS[factionOf(fighters[leader].body.inputs)]?.standard?.colour]));
  const ownColours = Boolean(colours.red && colours.blue && colours.red !== colours.blue);
  for (const [corner, entry] of Object.entries(standards)) {
    const leader = fighters[entry.leader];
    const standard = FACTIONS[factionOf(leader.body.inputs)]?.standard;
    const colour = leader.body.inputs.standardColour ?? leader.body.inputs.outfit?.banner ?? (ownColours ? colours[corner] : undefined) ?? WORLD.standard.colours[corner];
    Object.assign(entry, { kind: standard?.weapon ?? null, colour });
    if (!standard) continue;
    if (standard.worn) {
      leader.wornStandard = { kind: standard.weapon, colour };
      continue;
    }
    if (leader.weapon) {
      const shares = handShares(leader.weapon.spec);
      addParticleMass(leader, P[`${leader.weapon.main}Hand`], -leader.weapon.spec.mass * shares.main);
      if (shares.off) addParticleMass(leader, P[`${leader.weapon.off}Hand`], -leader.weapon.spec.mass * shares.off);
      leader.weapon = null;
    }
    armFighter(leader, standard.weapon, { random, shield: false });
    leader.weapon.colour = colour;
  }
  return standards;
}

/**
 * A worn standard comes loose from a fallen leader's back and lies where he
 * fell, to be taken up in the hands.
 */
export function shedStandard(world, fighter) {
  const worn = fighter.wornStandard;
  if (!worn || worn.shed) return null;
  worn.shed = true;
  const spec = WEAPONS[worn.kind];
  const debris = {
    id: world.debris.length, kind: 'weapon', weapon: worn.kind, owner: fighter.id, colour: worn.colour, x: vec.add(point(fighter.x, P.neck), [0, 0.2, 0]),
    v: [...point(fighter.v, P.neck)], q: quatFromTo([0, 1, 0], [0, 1, 0]), spin: [1.5, 0, 1], radius: spec.radius * 1.6, axis: [0, 1, 0], half: (spec.length + spec.handle) / 2, resting: false,
  };
  world.debris.push(debris);
  world.events.push({ time: world.time, kind: 'disarmed', fighter: fighter.id, weapon: worn.kind, point: debris.x, effects: [`the ${spec.label.toLowerCase()} falls`] });
  return debris;
}

// ---- Frames -------------------------------------------------------------

export function point(array, index) {
  return [array[index * 3], array[index * 3 + 1], array[index * 3 + 2]];
}
function setPoint(array, index, value) {
  array[index * 3] = value[0];
  array[index * 3 + 1] = value[1];
  array[index * 3 + 2] = value[2];
}
export function toWorld(fighter, local) {
  const turned = yawRotate(local, fighter.yaw);
  return [fighter.root[0] + turned[0], turned[1], fighter.root[1] + turned[2]];
}
export function toLocal(fighter, world) {
  return yawRotate([world[0] - fighter.root[0], world[1], world[2] - fighter.root[1]], -fighter.yaw);
}

/**
 * Who this fighter is fighting: the one it has chosen to focus on (an AI's
 * pick in a team fight), or else the nearest opponent still in it.
 */
export function opponentFor(world, fighter) {
  const focus = fighter.focus === undefined ? null : world.fighters[fighter.focus];
  if (focus && focus.corner !== fighter.corner && inFight(focus)) return focus;
  return nearestOpponent(world, fighter);
}

export function nearestOpponent(world, fighter) {
  let best = null;
  let bestDistance = Infinity;
  for (const other of world.fighters) {
    if (other.corner === fighter.corner || !inFight(other)) continue;
    const distance = vec.length(vec.sub(point(other.x, P.pelvis), point(fighter.x, P.pelvis)));
    if (distance < bestDistance) {
      best = other;
      bestDistance = distance;
    }
  }
  return best;
}

// ---- Commands -----------------------------------------------------------

/** Where on the target a strike aims: the head, the body, or the lead thigh. */
export function aimPoint(target, zone) {
  if (zone === 'head') return point(target.x, P.head);
  if (zone === 'legs') return vec.lerp(point(target.x, P.lHip), point(target.x, P.lKnee), 0.55);
  return vec.lerp(point(target.x, P.pelvis), point(target.x, P.neck), 0.6);
}

/**
 * Throw a strike (any attack in MOVES) at the opponent. The zone defaults to
 * the move's first. Returns false if the fighter cannot throw it now.
 */
export function throwPunch(world, fighter, type, zone = null, { heavy = false, at = null } = {}) {
  const spec = MOVES[type];
  if (spec?.kind === 'rush' || spec?.kind === 'clinch') return perform(world, fighter, type);
  // Thrown at a place (`at`, the player's aim): at whoever stands there, or at the empty air.
  const target = at ? manNear(world, fighter, at, WORLD.aimedAtWithin) : opponentFor(world, fighter);
  // Raising a weapon heavier than heavyFrom is work in proportion to its mass.
  // (and the harder, the weaker he is for it: handling.js)
  const lift = spec?.path === 'blade' && fighter.weapon?.held ? Math.max(1, fighter.weapon.spec.mass / WORLD.weapons.heavyFrom) / (fighter.weapon.handling?.speed ?? 1) : 1;
  const cost = spec ? spec.cost * (heavy ? WORLD.heavy.costFactor : 1) * lift : 0;
  // An empty gun is not fired: the same button starts loading it (no mark needed).
  if (spec?.path === 'aim' && fighter.weapon?.held && fighter.weapon.spec.shot && !fighter.weapon.loaded) {
    if (fighter.state === 'up' && !fighter.punch) fighter.reloading = true;
    return false;
  }
  const drain = cost / fighter.body.aerobic;
  if (!spec || spec.kind !== 'strike' || (!target && !at) || fighter.punch || fighter.state !== 'up' || fighter.crawling || fighter.netted || fighter.pain || fighter.stamina < drain || (spec.bash && !fighter.shield)) return false;
  const aimZone = spec.zones.includes(zone) ? zone : spec.zones[0];
  // A wild swinger's aim wanders off the mark.
  // A heavy weapon is hard to steer: past heavyFrom its blows wander (`heavyAimJitter` m per unit of mass over).
  const heft = spec?.path === 'blade' && fighter.weapon?.held ? Math.max(0, fighter.weapon.spec.mass / WORLD.weapons.heavyFrom - 1) : 0;
  const jitter = (STYLES[fighter.style]?.aimJitter ?? 0) + WORLD.weapons.heavyAimJitter * heft;
  const mark = at ?? aimPoint(target, aimZone);
  const aimed = jitter > 0 ? vec.add(mark, [0, 1, 2].map(() => (world.random() * 2 - 1) * jitter)) : mark;
  fighter.punch = {
    type, spec, zone: aimZone, t: 0, age: 0, aim: toLocal(fighter, aimed), target: target?.id ?? null, landed: false, peakSpeed: 0, limb: P[spec.limb],
    heavy, load: heavy ? WORLD.heavy.loadSeconds : 0,
    // A place in the world: the strike follows it as he turns to it.
    at: at ? aimed : null,
  };
  fighter.stamina = Math.max(0, fighter.stamina - drain);
  fighter.stats.thrown += 1;
  if (heavy) world.events.push({ time: world.time, kind: 'heavy', attacker: fighter.id, punch: type, effects: [] });
  return true;
}

/** The man of the other side nearest a place, within `within` m of it (on the floor), or null. */
export function manNear(world, fighter, at, within) {
  let best = null;
  let bestDistance = within;
  for (const other of world.fighters) {
    if (other.corner === fighter.corner || !inFight(other)) continue;
    const distance = Math.hypot(other.x[P.pelvis * 3] - at[0], other.x[P.pelvis * 3 + 2] - at[2]);
    if (distance < bestDistance) {
      best = other;
      bestDistance = distance;
    }
  }
  return best;
}

/** Start a whole-body move (rush, clinch) or a defence. */
export function perform(world, fighter, name, { side = world.random() < 0.5 ? 1 : -1, from = null } = {}) {
  if (fighter.state !== 'up' || fighter.netted) return false;
  // His shield lost, he covers up with his arms.
  if (name === 'shieldBlock' && !fighter.shield) name = 'guard';
  if (DEFENCES[name]) {
    // `from`: who the strike comes from, for a block that goes to meet it.
    fighter.defence = { name, t: 0, seconds: DEFENCES[name].seconds, side, from };
    if (name === 'guard') fighter.guardHigh = DEFENCES.guard.seconds;
    if (name === 'slip') {
      fighter.slip = DEFENCES.slip.seconds;
      fighter.slipSide = fighter.defence.side;
    }
    return true;
  }
  if (name === 'pin') return startPin(world, fighter);
  const spec = MOVES[name];
  const target = opponentFor(world, fighter);
  if (!spec || !target || fighter.punch || fighter.rush || fighter.stamina < spec.cost / fighter.body.aerobic) return false;
  if (spec.kind === 'rush') {
    fighter.rush = { t: 0, duration: spec.duration, hit: false };
  } else if (spec.kind === 'clinch') {
    const distance = vec.length(vec.sub(point(target.x, P.neck), point(fighter.x, P.neck)));
    if (distance > fighter.body.reach * WORLD.clinch.range) return false;
    // Who holds on longer is a contest of grip and arm strength.
    const grip = (who) => who.body.strikeForce[P.lHand] + who.body.strikeForce[P.rHand];
    const share = grip(fighter) / (grip(fighter) + grip(target));
    fighter.clinch = { target: target.id, t: 0, duration: spec.duration * (0.5 + share), hands: spec.hands ?? ['l', 'r'] };
    world.events.push({ time: world.time, kind: 'clinch', attacker: fighter.id, defender: target.id, effects: [] });
  } else return false;
  fighter.stamina = Math.max(0, fighter.stamina - spec.cost / fighter.body.aerobic);
  return true;
}

function updateIntent(world, fighter, dt) {
  const H = fighter.body.heightM;
  const style = STYLES[fighter.style];
  const idle = idleMotion(fighter, world.time);
  const walking = fighter.walking && !fighter.punch && !fighter.defence && !fighter.clinch;
  const intent = {
    stance: walking ? WORLD.walk.stance : style.stance,
    twist: walking ? 0 : idle.twist, lean: walking ? 0 : idle.lean, dip: walking ? 0 : idle.dip, shift: walking ? 0 : idle.shift,
    headOffset: vec.scale(idle.headOffset, H), guardOffset: idle.guardOffset, guardTight: fighter.guardHigh > 0,
  };
  // An old back stoops (aging.js).
  intent.lean += fighter.body.stoop ?? 0;
  if (fighter.punch?.load > 0) {
    // Loading a heavy attack: sit down on the legs, turn away from it.
    const punch = fighter.punch;
    punch.age += dt;
    punch.load -= dt;
    const loaded = 1 - Math.max(0, punch.load) / WORLD.heavy.loadSeconds;
    intent.twist -= punch.spec.twist * WORLD.heavy.loadTwist * loaded;
    intent.dip += WORLD.heavy.loadDip * loaded;
  } else if (fighter.punch) {
    const punch = fighter.punch;
    // A heavy weapon is slow to raise and slow to bring back; the blow between is the muscles'.
    const heavy = punch.spec.path === 'blade' && fighter.weapon?.held ? Math.max(1, Math.sqrt(fighter.weapon.spec.mass / WORLD.weapons.heavyFrom)) : 1;
    // The stroke at the pace his arms give the weapon; a bow drawn as fast as he can pull it (handling.js).
    const held = fighter.weapon?.held ? fighter.weapon : null;
    const pace = held && (punch.spec.path === 'blade' || held.spec.bow) ? (held.handling?.speed ?? 1) : 1;
    punch.t += (punch.t < punch.spec.windup || punch.t > punch.spec.extendUntil ? dt / heavy : dt) * pace;
    punch.age += dt;
    if (punch.spec.path === 'aim' && !punch.fired && punch.t >= (punch.quick ? punch.spec.quickFireAt : punch.spec.fireAt) && (sightsOn(fighter) || punch.t >= punch.spec.extendUntil)) fire(world, fighter);
    // Automatic fire: the trigger held, a round at the gun's cyclic rate until the burst is spent (or the gun).
    const automatic = punch.spec.path === 'aim' && fighter.weapon?.held ? fighter.weapon.spec.shot?.automatic : null;
    if (automatic && punch.fired) {
      punch.burst ??= { left: automatic.burst[0] + Math.floor(world.random() * (automatic.burst[1] - automatic.burst[0] + 1)) - 1, next: 1 / automatic.rate };
      if (punch.burst.left > 0 && fighter.weapon.loaded) {
        // The stroke is held at full aim while the rounds go.
        punch.t = Math.min(punch.t, punch.spec.extendUntil);
        punch.burst.next -= dt;
        if (punch.burst.next <= 0) {
          fire(world, fighter);
          punch.burst.left -= 1;
          punch.burst.next += 1 / automatic.rate;
        }
      }
    }
    if (punch.heavy) intent.dip += WORLD.heavy.loadDip * Math.max(0, 1 - punch.t / punch.spec.extendUntil);
    const spec = punch.spec;
    // The kinetic chain: hips and shoulders turn first and have finished
    // turning by the time the strike is halfway there.
    const phase = Math.min(1, punch.t / (spec.extendUntil * WORLD.rotationLead));
    const shape = punch.t < spec.extendUntil ? Math.sin(phase * Math.PI * 0.5) : Math.max(0, 1 - (punch.t - spec.extendUntil) / (spec.duration - spec.extendUntil));
    intent.twist += spec.twist * shape;
    intent.dip += (spec.dip ?? 0) * shape;
    intent.lean += (spec.lean ?? 0.12) * shape;
    intent.shift += (spec.shift ?? 0) * shape;
    if (punch.at) punch.aim = toLocal(fighter, punch.at);
    if (punch.t < spec.extendUntil) Object.assign(intent, strikeTargets(spec, punch.t, punch.aim, fighter.body, WORLD.followThrough));
    else if (spec.limb.endsWith('Foot') || spec.limb.endsWith('Knee')) {
      // Recovering a kick: the leg comes back down under the hip.
      const s = spec.limb[0];
      const local = toLocal(fighter, point(fighter.x, P[`${s}Foot`]));
      intent[`${s}Foot`] = vec.lerp(local, [0.05 * H * (s === 'l' ? 1 : -1), fighter.body.lengths.ankle, 0.06 * H * (s === 'l' ? 1 : -1)], Math.min(1, (punch.t - spec.extendUntil) / (spec.duration - spec.extendUntil)));
    }
    if (punch.t >= spec.duration) {
      if (punch.heavy) fighter.committed = WORLD.heavy.committedSeconds;
      fighter.punch = null;
    }
  }
  applyDefence(fighter, intent, dt);
  weaponIntent(world, fighter, intent);
  weaveHead(world, fighter, intent, dt);
  if (fighter.rush) {
    // Charging: head down, shoulder first, hands up.
    intent.lean += 0.28;
    intent.dip += 0.04;
    intent.twist += 0.35;
    intent.guardTight = true;
  }
  if (fighter.clinch) {
    const target = world.fighters[fighter.clinch.target];
    // The holding hands behind the opponent's neck, pulling it down.
    const neck = vec.add(point(target.x, P.neck), [0, -WORLD.clinch.pullDown, 0]);
    for (const [side, sign] of [['l', 1], ['r', -1]]) if ((fighter.clinch.hands ?? ['l', 'r']).includes(side)) intent[`${side}Hand`] = vec.add(toLocal(fighter, neck), [0.05, 0.04, sign * 0.07]);
    intent.lean += 0.08;
  }
  if (fighter.pickup) {
    // Stooping for it: down on the legs, leaning over, the hand to the grip.
    const debris = world.debris[fighter.pickup.debris];
    intent.dip += 0.3;
    intent.lean += 0.6;
    // Just above the grip, never into the floor (the floor and the muscle would fight over the hand);
    // a shield with the left hand, the arm it goes on.
    const hand = debris?.kind === 'shield' ? 'lHand' : 'rHand';
    if (debris) intent[hand] = toLocal(fighter, [debris.x[0], Math.max(debris.x[1], fighter.radius[P[hand]]) + 0.05, debris.x[2]]);
  }
  if (fighter.pin) {
    // Kneeling beside him, leaning over, hands on his chest and his hips.
    const target = world.fighters[fighter.pin.target];
    intent.dip += WORLD.pin.dip;
    intent.lean += WORLD.pin.lean;
    intent.twist = 0;
    intent.twoHanded = false;
    intent.bladeDir = null;
    const [chest, hips] = pinPoints(target);
    intent.lHand = toLocal(fighter, chest);
    intent.rHand = toLocal(fighter, hips);
    // Both knees down on the floor before him, shins back, feet behind.
    const L = fighter.body.lengths;
    const H = fighter.body.heightM;
    for (const [side, sign] of [['l', 1], ['r', -1]]) {
      intent[`${side}Knee`] = [0.06 * H, L.ankle + 0.02, sign * 0.1 * H];
      intent[`${side}Foot`] = [0.06 * H - L.shank * 0.95, L.ankle, sign * 0.11 * H];
    }
  }
  if (fighter.crawling) crawlPose(fighter, intent, dt);
  if (fighter.pain) painPose(fighter, intent);
  if (fighter.netted) {
    // Bound: the arms pinned in close to the chest, the weapon with them.
    for (const [side, sign] of [['l', 1], ['r', -1]]) intent[`${side}Hand`] = [0.16 * H, 0.62 * H, sign * 0.1 * H];
    intent.bladeDir = null;
  }
  runCarry(world, fighter, intent, dt);
  if (fighter.handsDown) {
    // Hands at the sides, for portraits and design sheets.
    for (const [side, sign] of [['l', 1], ['r', -1]]) intent[`${side}Hand`] = [0.03 * H, 0.47 * H, sign * 0.2 * H];
  }
  if (fighter.slip > 0) {
    // Aimed past where the head ends up: the muscles drive harder towards a
    // far target, and a slip must clear head and glove (~18 cm) in ~0.1 s.
    const slip = WORLD.headMovement.slip;
    intent.headOffset = vec.add(intent.headOffset, [-0.02 * H, -slip.down * H, (fighter.slipSide ?? 1) * slip.across * H]);
    intent.lean -= 0.05;
  }
  fighter.intent = intent;
  fighter.desired = desiredPose(fighter.body, intent);
}

/**
 * On his knees: both down, shins back along the floor, the body low and
 * forward over the hands on the floor before him. Each step a knee and the
 * opposite hand go forward together, as far as his pace carries him; a leg
 * whose joint is broken has no muscle and drags.
 */
/**
 * On his knees with the pain (a lash): the hips down, the trunk bowed over a
 * little, the free hand pressed to where it struck, the weapon hand low;
 * down quickly and up again as painShare says.
 */
function painPose(fighter, intent) {
  const share = painShare(fighter);
  if (share <= 0) return;
  const H = fighter.body.heightM;
  const L = fighter.body.lengths;
  const spec = WORLD.pain;
  intent.dip += spec.dip * share;
  intent.lean += spec.lean * share;
  intent.twist = 0;
  intent.guardTight = false;
  // Knees to the floor once well down; up through a crouch on the way back.
  if (share > 0.5) {
    for (const [side, sign] of [['l', 1], ['r', -1]]) {
      intent[`${side}Knee`] = [0.08 * H, L.ankle + 0.02, sign * 0.1 * H];
      intent[`${side}Foot`] = [0.08 * H - L.shank * 0.95, L.ankle, sign * 0.11 * H];
    }
  }
  // The free hand to the hurt: where the lash landed, as he stands.
  const free = fighter.weapon?.held ? (fighter.weapon.main === 'r' ? 'l' : 'r') : 'l';
  const capsule = capsules(fighter).find((entry) => entry.key === fighter.pain.key) ?? capsules(fighter).find((entry) => entry.key === 'trunk');
  const [a, b] = capsuleEnds(fighter, capsule);
  const hurt = toLocal(fighter, vec.lerp(a, b, 0.5));
  intent[`${free}Hand`] = vec.lerp(intent[`${free}Hand`] ?? hurt, hurt, share);
  if (fighter.weapon?.held) intent.bladeDir = [0.4, -1, 0];
}

function crawlPose(fighter, intent, dt) {
  const spec = WORLD.crawl;
  const H = fighter.body.heightM;
  const L = fighter.body.lengths;
  // Turning keeps the knees stepping even where he stands.
  const turning = Math.max(-1, Math.min(1, fighter.crawlTurn ?? 0));
  const pace = Math.max(Math.min(1, Math.hypot(...fighter.rootVelocity) / (spec.speed * WORLD.footSpeed)), Math.abs(turning) * spec.turnOnSpot * 2);
  fighter.crawlPhase = ((fighter.crawlPhase ?? 0) + Math.PI * 2 * spec.strideHz * pace * dt) % (Math.PI * 2);
  const swing = Math.sin(fighter.crawlPhase) * spec.stride * H;
  // Up off the floor while it comes forward, down while it bears.
  const lift = Math.max(0, Math.cos(fighter.crawlPhase)) * 0.03 * H * pace;
  intent.dip += spec.dip;
  intent.lean += spec.lean;
  intent.twist = 0;
  intent.twoHanded = false;
  intent.bladeDir = null;
  intent.guardTight = false;
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    // Turning right (yaw growing), the left knee is on the outside: its stride the longer.
    const step = sign * swing * (1 + sign * turning * spec.turnStride);
    intent[`${side}Knee`] = [0.02 * H + step, L.ankle + 0.02 + (sign > 0 ? lift : 0), sign * 0.1 * H];
    intent[`${side}Foot`] = [0.02 * H + step - L.shank * 0.95, L.ankle, sign * 0.11 * H];
    intent[`${side}Hand`] = [0.3 * H - step, 0.05 * H + (sign < 0 ? lift : 0), sign * 0.14 * H];
  }
}

/**
 * Down on his knees to crawl away: what is in his hands is let go (they are
 * on the floor now), and he is out of the fight. `reason` for the log.
 */
export function startCrawl(world, fighter, reason) {
  if (fighter.crawling || fighter.state === 'out') return false;
  fighter.crawling = true;
  fighter.punch = null;
  fighter.rush = null;
  fighter.clinch = null;
  fighter.pin = null;
  fighter.pickup = null;
  fighter.defence = null;
  fighter.running = false;
  if (fighter.weapon?.held) releaseWeapon(world, fighter, 'dropped', [0, 0, 0]);
  world.events.push({ time: world.time, kind: 'crawl', fighter: fighter.id, effects: [reason] });
  return true;
}

/** Still in the fight: not out, and not crawling away. */
export function inFight(fighter) {
  // A player walking about on his knees (walk mode) has not left it.
  return fighter.state !== 'out' && !(fighter.crawling && !fighter.walking);
}

/** A leg that will not bear him: a knee or hip broken. */
function legBroken(fighter) {
  return ['lKnee', 'rKnee', 'lHip', 'rHip'].some((joint) => fighter.broken.has(joint));
}

/**
 * Running with nobody near (a charge from afar, a flight, a man going to his
 * place): the hands come down from the guard and swing with the stride; a
 * weapon or shield hand stays on its weapon. Back into the guard as an
 * enemy comes near, or for any strike, hold or charge.
 */
function runCarry(world, fighter, intent, dt) {
  const spec = WORLD.runCarry;
  const speed = Math.hypot(...(fighter.rootVelocity ?? [0, 0]));
  const nearest = fighter.nearestFoe ?? Infinity;
  const busy = fighter.punch || fighter.clinch || fighter.pin || fighter.pickup || fighter.defence || fighter.crawling || fighter.state !== 'up';
  const running = (fighter.running || speed > spec.runningSpeed) && !busy;
  // Walking about, the guard is down whoever is near.
  const want = fighter.walking && !busy ? 1 : running && nearest > spec.guardFrom ? Math.min(1, (nearest - spec.guardFrom) / (spec.relaxFrom - spec.guardFrom)) : 0;
  fighter.carry = (fighter.carry ?? 0) + (want - (fighter.carry ?? 0)) * Math.min(1, spec.ease * dt);
  if (fighter.carry < 0.02) return;
  const H = fighter.body.heightM;
  const held = new Set(intent.weaponArms ?? []);
  if (fighter.shield) held.add('l');
  // The arms swing with the stride: walking, slower and smaller, and still when he stands.
  const pace = fighter.walking ? Math.min(1, speed / WORLD.footSpeed) : 1;
  let guard = null;
  const stride = pace * Math.sin(world.time * Math.PI * 2 * (fighter.walking && !running ? WORLD.walk.strideHz : WORLD.walk.runStrideHz) + fighter.id);
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    if (held.has(side)) continue;
    // Elbows bent, hands by the hips, swinging opposite to the legs; from
    // wherever the hand was meant to be (the guard, if nothing else).
    const swinging = [0.04 * H + sign * stride * spec.swing * H, 0.52 * H, sign * 0.19 * H];
    guard ??= desiredPose(fighter.body, { stance: intent.stance });
    intent[`${side}Hand`] = vec.lerp(intent[`${side}Hand`] ?? guard[P[`${side}Hand`]], swinging, fighter.carry);
  }
  intent.guardTight = intent.guardTight && fighter.carry < 0.5;
}

/**
 * Head movement in range: the head never rests on the centre line but
 * weaves side to side, dipping as it crosses, at an uneven rhythm. It eases
 * in as the opponent comes within reach and stops while punching.
 */
function weaveHead(world, fighter, intent, dt) {
  const amount = STYLES[fighter.style].headMovement ?? 0;
  const opponent = opponentFor(world, fighter);
  if (!amount || !opponent) return;
  const distance = vec.length(vec.sub(point(opponent.x, P.pelvis), point(fighter.x, P.pelvis)));
  const engaged = distance < fighter.body.reach + opponent.body.reach + WORLD.weave.range && !fighter.punch && !fighter.clinch && !fighter.rush;
  fighter.weave = (fighter.weave ?? 0) + ((engaged ? 1 : 0) - (fighter.weave ?? 0)) * Math.min(1, WORLD.weave.easeRate * dt);
  if (fighter.weave < 0.01) return;
  const H = fighter.body.heightM;
  const time = world.time * Math.PI * 2;
  const phase = fighter.id * 1.7;
  // Two rhythms summed, so it does not settle into a beat a puncher can time;
  // tanh holds it off centre and makes it cross quickly.
  const wave = Math.sin(time * WORLD.weave.hz + phase) + 0.45 * Math.sin(time * WORLD.weave.hz * 2.3 + phase * 2);
  const across = Math.tanh(2.2 * wave);
  const size = amount * WORLD.weave.size * H * fighter.weave * (0.4 + 0.6 * fighter.body.inputs.exercise) * (0.5 + 0.5 * fighter.stamina);
  intent.headOffset = vec.add(intent.headOffset, [0, -size * 0.6 * (1 - across * across), size * across]);
  intent.dip += WORLD.weave.kneeDip * amount * fighter.weave * (1 - across * across);
}

/** A defence's posture over its few tenths of a second. */
function applyDefence(fighter, intent, dt) {
  const defence = fighter.defence;
  if (!defence) return;
  defence.t += dt;
  const H = fighter.body.heightM;
  const u = Math.min(1, defence.t / defence.seconds);
  const arc = Math.sin(Math.PI * u);
  if (defence.name === 'roll') {
    // Down under the punch and across: a U through the hips and knees.
    intent.dip += 0.07 * arc;
    const roll = WORLD.headMovement.roll;
    intent.headOffset = vec.add(intent.headOffset, [0, -roll.down * H * arc, defence.side * roll.across * H * Math.cos(Math.PI * u)]);
  } else if (defence.name === 'parry' && !fighter.punch) {
    // The lead hand slaps across the line of the incoming punch.
    intent.lHand = vec.add(desiredPose(fighter.body, { stance: intent.stance })[P.lHand], [0.06 * H * arc, -0.02 * H, -0.1 * H * arc]);
  } else if (defence.name === 'leanBack') {
    intent.lean -= 0.35 * arc;
    intent.shift -= 0.04 * arc;
  } else if (defence.name === 'check' && !fighter.punch) {
    intent.check = arc > 0.2;
  } else if (defence.name === 'stepBack') {
    fighter.move = -1;
  }
  if (defence.t >= defence.seconds) {
    if (defence.name === 'stepBack') fighter.move = 0;
    fighter.defence = null;
  }
}

// ---- Footwork -------------------------------------------------------------

function plantFeet(fighter) {
  fighter.feet = {};
  for (const side of ['l', 'r']) {
    const index = P[`${side}Foot`];
    fighter.feet[side] = { index, planted: point(fighter.x, index), step: null };
  }
}

/** Feet stay planted while the stance drifts, then step to catch up, one at a time. */
function updateFeet(fighter, dt) {
  if (fighter.state !== 'up' && fighter.state !== 'rising') {
    plantFeet(fighter);
    return;
  }
  const spec = WORLD.step;
  const feet = Object.values(fighter.feet);
  for (const [side, foot] of Object.entries(fighter.feet)) {
    // A kicking, kneeing or checking leg is off the floor; when it comes
    // down it is planted where it lands.
    const lifted = !!(fighter.intent[`${side}Foot`] || fighter.intent[`${side}Knee`] || (fighter.intent.check && side === 'l'));
    if (foot.lifted && !lifted) foot.planted = [fighter.x[foot.index * 3], fighter.desired[foot.index][1], fighter.x[foot.index * 3 + 2]];
    foot.lifted = lifted;
    if (lifted) foot.step = null;
  }
  const stepping = feet.some((foot) => foot.step || foot.lifted);
  let worst = null;
  let worstDrift = spec.threshold;
  for (const foot of feet) {
    const desired = toWorld(fighter, fighter.desired[foot.index]);
    foot.desired = desired;
    const drift = Math.hypot(desired[0] - foot.planted[0], desired[2] - foot.planted[2]);
    if (!foot.step && drift > worstDrift) {
      worst = foot;
      worstDrift = drift;
    }
  }
  if (worst && !stepping) {
    // Step to where the stance will be, not where it is: lead the motion.
    const lead = spec.lead * spec.seconds;
    const to = [worst.desired[0] + fighter.rootVelocity[0] * lead, worst.desired[1], worst.desired[2] + fighter.rootVelocity[1] * lead];
    worst.step = { from: [...worst.planted], to, t: 0 };
  }
  for (const foot of feet) {
    if (!foot.step) continue;
    foot.step.t += dt / spec.seconds;
    if (foot.step.t >= 1) {
      foot.planted = foot.step.to;
      foot.step = null;
    }
  }
}

function footTarget(fighter, foot) {
  return onTheFloor(fighter, rawFootTarget(fighter, foot));
}

/**
 * A foot is never aimed past the edge of the floor: the edge holds it
 * there, and a target beyond would set the two fighting every substep.
 */
function onTheFloor(fighter, target) {
  const arena = fighter.arena;
  if (!arena) return target;
  const margin = fighter.radius[P.lFoot] + 0.01;
  return [Math.max(-(arena.halfX - margin), Math.min(arena.halfX - margin, target[0])), target[1], Math.max(-(arena.halfZ - margin), Math.min(arena.halfZ - margin, target[2]))];
}

function rawFootTarget(fighter, foot) {
  if (foot.lifted) return toWorld(fighter, fighter.desired[foot.index]);
  if (!foot.step) return [foot.planted[0], fighter.desired[foot.index][1], foot.planted[2]];
  const t = foot.step.t;
  const ease = t * t * (3 - 2 * t);
  const along = vec.lerp(foot.step.from, foot.step.to, ease);
  return [along[0], fighter.desired[foot.index][1] + WORLD.step.lift * Math.sin(Math.PI * t), along[2]];
}

// ---- Stepping -------------------------------------------------------------

// The fighters stepping this substep, refilled each substep (not reallocated).
const moving = [];

/** Advance the world by `dt` seconds (one outer step, several substeps). */
export function step(world, dt) {
  measureNearestFoes(world);
  world.steps = (world.steps ?? 0) + 1;
  for (const fighter of world.fighters) {
    if (fighter.state === 'out') fighter.outFor = (fighter.outFor ?? 0) + dt;
    if (gone(fighter)) continue;
    moveRoot(world, fighter, dt);
    updateTimers(world, fighter, dt);
    // A pose (a proxy) is worked out on its own beat, every WORLD.tiers.proxyEvery steps, for that long.
    if (fighter.detail === 'proxy' && !proxyBeat(world, fighter)) continue;
    const span = fighter.detail === 'proxy' ? dt * WORLD.tiers.proxyEvery : dt;
    updateIntent(world, fighter, span);
    updateFeet(fighter, span);
  }
  chooseDetail(world);
  const h = dt / WORLD.substeps;
  const stride = coarseStride(world);
  for (let substep = 0; substep < WORLD.substeps; substep += 1) {
    const time = world.time + substep * h;
    // A coarse fighter steps on one substep in `stride`, that much further; a proxy not at all.
    const stepping = (fighter) => fighter.detail === 'full' || (fighter.detail === 'coarse' && substep % stride === stride - 1);
    const span = (fighter) => (fighter.detail === 'coarse' ? stride * h : h);
    moving.length = 0;
    for (const fighter of world.fighters) if (!asleep(fighter) && stepping(fighter)) moving.push(fighter);
    for (const fighter of moving) {
      const own = span(fighter);
      if (isLimp(fighter)) relaxedTone(fighter, own);
      integrate(fighter, own, time);
    }
    for (const fighter of moving) {
      const own = span(fighter);
      solveConstraints(fighter, own);
      solveJointLimits(world, fighter, own);
      if (fighter.weapon?.held) updateWeapon(fighter, own);
    }
    for (const fighter of world.fighters) if (fighter.clinch) holdClinch(world, fighter);
    for (const fighter of world.fighters) if (fighter.pin) holdPin(world, fighter, h);
    collideFighters(world, h, time, substep);
    stepWhips(world, h);
    for (const fighter of world.fighters) {
      if (fighter.detail === 'proxy') continue;
      if (asleep(fighter)) {
        fighter.prev.set(fighter.x);
        fighter.v.fill(0);
        continue;
      }
      if (!stepping(fighter)) continue;
      const own = span(fighter);
      collideGround(world, fighter, own, world.arena);
      for (let index = 0; index < fighter.v.length; index += 1) fighter.v[index] = (fighter.x[index] - fighter.prev[index]) / own;
      settleWhenStill(fighter, own);
    }
    for (const impulse of world.pendingImpulses) deliverImpulse(impulse);
    world.pendingImpulses = [];
  }
  for (const fighter of world.fighters) if (fighter.detail === 'proxy' && proxyBeat(world, fighter)) poseProxy(fighter, dt * WORLD.tiers.proxyEvery);
  for (const fighter of world.fighters) {
    trackHandSpeed(fighter);
    checkBalance(world, fighter);
    if (fighter.state !== 'up' && fighter.state !== 'rising') knockOff(world, fighter, null);
  }
  moveProps(world, dt);
  moveDebris(world, dt);
  if (world.arrows.length) flyArrows(world, dt);
  if (world.nets?.length) flyNets(world, dt);
  world.time += dt;
  world.lastDt = dt;
}

/**
 * Balance. A fighter whose hips are knocked moving faster than they meant to
 * move, or are carried too far outside the feet, goes over: down, not
 * counted, and up again after a moment. Strong legs hold more.
 */
function checkBalance(world, fighter) {
  // Kneeling over a man held down is a base of its own, not a fall.
  if (fighter.state !== 'up' || fighter.handsDown || fighter.pin || fighter.crawling) return;
  const legRatio = fighter.body.motorForce[P.pelvis] / (fighter.body.massKg * WORLD.gravity);
  // Worn joints step less sharply (aging.js).
  const legs = Math.max(0.5, Math.min(1.3, legRatio / WORLD.legStrengthTypical)) * (WORLD.jointFootwork + (1 - WORLD.jointFootwork) * (fighter.body.joints ?? 1)) * (1 - WORLD.balance.legDamageCost * Math.min(1, (fighter.legDamage.l + fighter.legDamage.r) / (2 * legCapacity())));
  const knock = Math.hypot(fighter.knock[0], fighter.knock[2]);
  // The legs soak the knock up over a few tenths of a second, stepping.
  const decay = Math.exp(-WORLD.balance.absorbPerSecond * world.lastDt);
  fighter.knock = fighter.knock.map((value) => value * decay);
  // Carried outside a two-footed base counts too (one foot up is a kick).
  // The base is the ground between the feet: hips over the front foot of a
  // long lunge are on it; what counts is how far outside it they are.
  const planted = Object.values(fighter.feet).every((foot) => !foot.lifted);
  const outside = planted ? outsideBase(point(fighter.x, P.pelvis), point(fighter.x, P.lFoot), point(fighter.x, P.rFoot)) : 0;
  const legLength = fighter.body.lengths.thigh + fighter.body.lengths.shank;
  // Heels make it easy to go over; riot gear's wide stance and weight, hard.
  const footing = legs * fighter.body.gear.balance * (fighter.netted ? NET.footing : 1);
  // Knocked about in armour: reeling, not falling, unless it is too much.
  const pushed = knock / (WORLD.balance.speed * footing);
  const overreached = outside / (WORLD.balance.reach * legLength * footing);
  if (pushed > 1 || overreached > 1) {
    // Driven past his feet by a blow (not by his own lunge): in armour he
    // stumbles and reels, getting his feet back under him, if it was not too much.
    const struck = Math.max(...fighter.hitAt) > world.time - WORLD.stagger.hitWithin;
    if (world.time < (fighter.stumbleUntil ?? -1)) return;
    if (struck && staggerInstead(world, fighter, Math.max(pushed, overreached), null)) {
      fighter.knock = [0, 0, 0];
      fighter.stumbleUntil = world.time + WORLD.stagger.catchSeconds;
      return;
    }
  } else stagger(world, fighter, pushed, null);
  if (knock > WORLD.balance.speed * footing || outside > WORLD.balance.reach * legLength * footing) {
    fighter.knock = [0, 0, 0];
    fighter.state = 'down';
    shakenLoose(world, fighter);
    fighter.punch = null;
    fighter.rush = null;
    fighter.clinch = null;
    fighter.downTimer = WORLD.balance.fallSeconds;
    world.events.push({ time: world.time, kind: 'fell', fighter: fighter.id, onOneFoot: !planted, effects: [knock > WORLD.balance.speed * footing ? 'knocked off balance' : 'overreached'] });
  }
}

/** How far a point is outside the base between two feet (m, on the floor): from the nearest point on the line joining them. */
function outsideBase(at, first, second) {
  const across = [second[0] - first[0], second[2] - first[2]];
  const lengthSquared = across[0] * across[0] + across[1] * across[1];
  const share = lengthSquared > 1e-9 ? Math.max(0, Math.min(1, ((at[0] - first[0]) * across[0] + (at[2] - first[2]) * across[1]) / lengthSquared)) : 0;
  return Math.hypot(at[0] - (first[0] + across[0] * share), at[2] - (first[2] + across[1] * share));
}

/** Advance by any number of seconds at the fixed step: the manual test hook. */
export function advance(world, seconds, think = null, stepSeconds = 1 / 60) {
  let left = seconds;
  while (left > 1e-9) {
    const dt = Math.min(stepSeconds, left);
    if (think) think(world, dt);
    step(world, dt);
    left -= dt;
  }
}

function moveRoot(world, fighter, dt) {
  const opponent = opponentFor(world, fighter);
  if (fighter.state !== 'up') {
    fighter.rootVelocity = [0, 0];
    return;
  }
  // Facing his man, or the place he is going (a weapon on the floor).
  // A place he means to strike (faceAt, for a moment) first; then where he is going; then his man.
  const facing = fighter.faceAt && world.time < fighter.faceAt.until ? fighter.faceAt.at : null;
  const facePoint = facing ?? fighter.goTo ?? (opponent ? point(opponent.x, P.pelvis) : null);
  if (facePoint) {
    const from = point(fighter.x, P.pelvis);
    const to = facePoint;
    const desiredYaw = Math.atan2(-(to[2] - from[2]), to[0] - from[0]);
    let turn = desiredYaw - fighter.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    let change = turn * Math.min(1, dt * WORLD.footing.turnRate);
    if (fighter.crawling) {
      // On his knees he turns only as fast as his steps carry him round.
      const spec = WORLD.crawl;
      const pace = Math.min(1, Math.hypot(...fighter.rootVelocity) / (spec.speed * WORLD.footSpeed));
      const most = spec.turnSpeed * Math.max(spec.turnOnSpot, pace) * dt;
      change = Math.max(-most, Math.min(most, change));
      fighter.crawlTurn = change / Math.max(dt, 1e-6) / spec.turnSpeed;
    }
    fighter.yaw += change;
  }
  // Footwork has inertia: the stance accelerates and brakes at what the legs
  // can push, rather than starting and stopping dead.
  const legRatio = fighter.body.motorForce[P.pelvis] / (fighter.body.massKg * WORLD.gravity);
  const legs = Math.max(0.5, Math.min(1.3, legRatio / WORLD.legStrengthTypical)) * (WORLD.jointFootwork + (1 - WORLD.jointFootwork) * (fighter.body.joints ?? 1));
  const forward = yawRotate([1, 0, 0], fighter.yaw);
  let drive = fighter.move;
  // A lunge: the legs drive the body in behind the point while it travels.
  const punch = fighter.punch;
  if (punch?.spec.step && !(punch.load > 0) && punch.t >= punch.spec.windup && punch.t <= punch.spec.extendUntil) drive = Math.max(drive, punch.spec.step);
  if (fighter.running && !fighter.rush) drive = fighter.move * WORLD.run.speedFactor;
  // On his knees: slow, and no faster for trying.
  if (fighter.crawling) drive = Math.max(-0.3, Math.min(1, fighter.move)) * WORLD.crawl.speed;
  // In the net: short steps, stumbling.
  if (fighter.netted) drive *= NET.step;
  if (fighter.rush) {
    // A charge: flat out at the opponent, at what the legs can reach.
    fighter.rush.t += dt;
    drive = WORLD.rush.speedFactor;
    if (fighter.rush.t >= fighter.rush.duration) fighter.rush = null;
  }
  // A sidestep (+ to the left), slower than stepping in or out.
  const left = yawRotate([0, 0, 1], fighter.yaw);
  const side = fighter.rush ? 0 : (fighter.strafe ?? 0) * WORLD.sidestepShare * (fighter.crawling ? WORLD.crawl.speed : 1) * (fighter.netted ? NET.step : 1);
  // Footwork in this outfit: free in trunks, stiff in a suit or in plate.
  const gear = fighter.body.gear;
  const wanted = [(forward[0] * drive + left[0] * side) * WORLD.footSpeed * legs * gear.foot, (forward[2] * drive + left[2] * side) * WORLD.footSpeed * legs * gear.foot];
  const change = [wanted[0] - fighter.rootVelocity[0], wanted[1] - fighter.rootVelocity[1]];
  const size = Math.hypot(change[0], change[1]);
  const limit = WORLD.footAcceleration * legs * gear.accel * (fighter.rush ? 1.6 : fighter.crawling ? WORLD.crawl.accel : 1) * dt;
  const scale = size > limit ? limit / size : 1;
  fighter.rootVelocity[0] += change[0] * scale;
  fighter.rootVelocity[1] += change[1] * scale;
  fighter.root[0] += fighter.rootVelocity[0] * dt;
  fighter.root[1] += fighter.rootVelocity[1] * dt;
  // A shove moves the stance too: the root drifts to where the pelvis was pushed.
  const pelvis = point(fighter.x, P.pelvis);
  const rootPelvis = toWorld(fighter, fighter.desired[P.pelvis]);
  const follow = Math.min(1, dt * WORLD.footing.followPushed);
  fighter.root[0] += (pelvis[0] - rootPelvis[0]) * follow;
  fighter.root[1] += (pelvis[2] - rootPelvis[2]) * follow;
  const { halfX, halfZ } = world.arena;
  const margin = WORLD.footing.edgeMargin;
  fighter.root[0] = Math.max(-(halfX - margin), Math.min(halfX - margin, fighter.root[0]));
  fighter.root[1] = Math.max(-(halfZ - margin), Math.min(halfZ - margin, fighter.root[1]));
}

// ---- Detail by the size of the fight ----------------------------------------------

/** Substeps a coarse fighter takes as one: more, the bigger the fight. */
function coarseStride(world) {
  return WORLD.tiers.stride[fightTier(world)] ?? 1;
}

/** Which tier of detail the fight is in, by its size: 1 (a one-on-one's) to 4. */
export function fightTier(world) {
  const count = world.fighters.length;
  const tiers = WORLD.tiers;
  return count <= tiers.full ? 1 : count <= tiers.grid ? 2 : count <= tiers.coarse ? 3 : 4;
}

/**
 * Each fighter's detail this step. In a big fight (tier 3) anyone not in an
 * exchange — not striking, struck at, just hit, holding or held, rising or
 * played — steps at fewer substeps ('coarse', see WORLD.tiers); in a very big one
 * (tier 4) such a one with no enemy near him, standing, is a 'proxy' (a
 * pose, no physics), as is a man standing in the ranks behind the front
 * (in tier 3 too). Everyone else is in 'full'.
 */
function chooseDetail(world) {
  const tier = fightTier(world);
  const previous = world.fighters.map((fighter) => fighter.detail);
  if (tier < 3) {
    for (const fighter of world.fighters) fighter.detail = 'full';
  } else {
    const hips = world.fighters.map((fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]]);
    const grid = spatialGrid(hips, WORLD.tiers.engageRange);
    const targeted = new Set(world.fighters.filter((fighter) => fighter.punch).map((fighter) => fighter.punch.target));
    world.fighters.forEach((fighter, index) => {
      if (gone(fighter)) {
        fighter.detail = 'coarse';
        return;
      }
      let lastHit = -Infinity;
      for (const at of fighter.hitAt) lastHit = Math.max(lastHit, at);
      // In an exchange now: striking, struck at, just hit, holding or held, getting up.
      const exchanging = world.keepFull?.has(fighter.id) || fighter.punch || fighter.rush || fighter.clinch || fighter.pin || fighter.pickup
        || targeted.has(fighter.id) || lastHit > world.time - WORLD.tiers.hitMemory || fighter.state === 'rising';
      if (exchanging) fighter.detail = 'full';
      // A man standing in the ranks behind the front (formation.js) is only a pose, enemy near or not.
      else if (fighter.slot && !fighter.inFront && fighter.state === 'up' && world.formations?.[fighter.formation]) fighter.detail = 'proxy';
      else if (tier === 3 || fighter.state !== 'up') fighter.detail = 'coarse';
      else fighter.detail = grid.near(index).some((other) => world.fighters[other].corner !== fighter.corner && world.fighters[other].state !== 'out') ? 'coarse' : 'proxy';
    });
  }
  // Back into the physics from a pose: moving as the pose was.
  world.fighters.forEach((fighter, index) => {
    if (previous[index] === 'proxy' && fighter.detail !== 'proxy') {
      const h = (world.lastDt ?? 1 / 60) / WORLD.substeps;
      for (let at = 0; at < fighter.x.length; at += 1) fighter.prev[at] = fighter.x[at] - fighter.v[at] * h;
    }
  });
}

/** Whether this step is a proxy's beat (each on his own, spread by his id). */
function proxyBeat(world, fighter) {
  return (world.steps + fighter.id) % WORLD.tiers.proxyEvery === 0;
}

/**
 * A proxy's body: each part set where its muscles would take it (the stance
 * and the moves the AI asks for), with no dynamics; the weapon follows.
 */
function poseProxy(fighter, dt) {
  // Eased towards the pose, not snapped to it: he came from wherever the
  // physics left him.
  const follow = Math.min(1, dt * WORLD.tiers.proxyFollow);
  for (let index = 0; index < PARTICLES.length; index += 1) {
    const { target } = motorTarget(fighter, index);
    fighter.targets[index] = target;
    for (let axis = 0; axis < 3; axis += 1) {
      const at = index * 3 + axis;
      fighter.prev[at] = fighter.x[at];
      fighter.x[at] += (target[axis] - fighter.x[at]) * follow;
      fighter.v[at] = (fighter.x[at] - fighter.prev[at]) / dt;
    }
  }
  solveConstraints(fighter, dt);
  if (fighter.weapon?.held) updateWeapon(fighter, dt);
}

/**
 * Each running fighter's distance to the nearest enemy not out
 * (`nearestFoe`, m), as far as WORLD.runCarry.relaxFrom; beyond it, or not
 * running, Infinity (all a running man's arms need to know). A grid, not every pair: a big battle has
 * thousands of pairs.
 */
function measureNearestFoes(world) {
  const fighters = world.fighters;
  const reach = WORLD.runCarry.relaxFrom;
  if (fighters.length <= WORLD.tiers.full) {
    for (const fighter of fighters) {
      let nearest = Infinity;
      for (const other of fighters) {
        if (other.corner === fighter.corner || other.state === 'out') continue;
        nearest = Math.min(nearest, Math.hypot(other.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], other.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]));
      }
      fighter.nearestFoe = nearest;
    }
    return;
  }
  const grid = spatialGrid(fighters.map((fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]]), reach);
  fighters.forEach((fighter, index) => {
    let nearest = Infinity;
    // Only a running man's arms ask (see runCarry).
    if (!fighter.running && Math.hypot(...(fighter.rootVelocity ?? [0, 0])) <= WORLD.runCarry.runningSpeed) {
      fighter.nearestFoe = Infinity;
      return;
    }
    for (const other of grid.near(index)) {
      const foe = fighters[other];
      if (foe.corner === fighter.corner || foe.state === 'out') continue;
      nearest = Math.min(nearest, Math.hypot(foe.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], foe.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]));
    }
    fighter.nearestFoe = nearest;
  });
}

/**
 * Points on the floor binned into square cells of `cell` m: `near(index)`
 * gives every other point within `cell` of a point, in index order.
 */
export function spatialGrid(points, cell) {
  const cells = new Map();
  const keyOf = (cx, cz) => cx * 4096 + cz;
  points.forEach(([x, z], index) => {
    const key = keyOf(Math.floor(x / cell), Math.floor(z / cell));
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(index);
  });
  return {
    near(index) {
      const [x, z] = points[index];
      const cx = Math.floor(x / cell);
      const cz = Math.floor(z / cell);
      const found = [];
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          for (const other of cells.get(keyOf(cx + dx, cz + dz)) ?? []) {
            if (other !== index && (points[other][0] - x) ** 2 + (points[other][1] - z) ** 2 < cell * cell) found.push(other);
          }
        }
      }
      return found.sort((a, b) => a - b);
    },
  };
}

function updateTimers(world, fighter, dt) {
  if (fighter.weapon?.held) fighter.weapon.strain = Math.max(0, fighter.weapon.strain - BLADES.gripLeak * dt);
  // On his knees with the pain (physics/whip.js): until he is up again.
  if (fighter.pain) {
    fighter.pain.t += dt;
    if (fighter.state !== 'up' || painShare(fighter) <= 0 && fighter.pain.t > 0.3) fighter.pain = null;
  }
  reload(world, fighter, dt);
  if (fighter.bleed > 0) {
    // Wounds bleed, easing as they clot; lose enough blood and you go down.
    fighter.bloodLost = (fighter.bloodLost ?? 0) + fighter.bleed * dt;
    fighter.bleed *= Math.exp(-dt / BLADES.clotSeconds);
    if (fighter.state !== 'out' && fighter.bloodLost >= collapseAt()) {
      const event = { time: world.time, kind: 'bled', attacker: fighter.lastWoundedBy ?? fighter.id, effects: [] };
      // Mostly from blows that broke nothing open: internal injuries.
      knockOut(world, fighter, event, (fighter.bleedInside ?? 0) > (fighter.bleedOutside ?? 0) ? 'collapsed from internal injuries' : 'collapsed from blood loss', 'bledOut');
    }
  }
  if (fighter.trauma && fighter.state !== 'out') sufferInjuries(world, fighter);
  fighter.cooldown = Math.max(0, fighter.cooldown - dt);
  fighter.guardHigh = Math.max(0, fighter.guardHigh - dt);
  fighter.slip = Math.max(0, fighter.slip - dt);
  fighter.committed = Math.max(0, (fighter.committed ?? 0) - dt);
  fighter.stun = Math.max(0, fighter.stun - dt);
  fighter.stagger = Math.max(0, (fighter.stagger ?? 0) - dt);
  if (fighter.clinch) {
    fighter.clinch.t += dt;
    const target = world.fighters[fighter.clinch.target];
    if (fighter.clinch.t >= fighter.clinch.duration || fighter.state !== 'up' || target.state !== 'up') fighter.clinch = null;
  }
  if (fighter.pin) {
    const target = world.fighters[fighter.pin.target];
    if (fighter.state !== 'up' || target.state === 'out' || target.state === 'up') fighter.pin = null;
  }
  countPin(world, fighter, dt);
  updatePickup(world, fighter, dt);
  const winded = 1 - WORLD.hurt.staminaPerTrunkDamage * (fighter.damage.trunk ?? 0);
  if (!fighter.punch) fighter.stamina = Math.min(1, fighter.stamina + WORLD.staminaRecovery * fighter.body.aerobic * winded * dt);
  fighter.hurt = Math.max(0, (fighter.hurt ?? 0) - dt);
  if (fighter.state === 'out') {
    fighter.motorScale = 0;
  } else if (fighter.state === 'down') {
    fighter.motorScale = 0;
    fighter.downTimer -= dt;
    if (fighter.downTimer <= 0) {
      // A broken leg will not stand him up, but a man still conscious drags himself off on his knees.
      if (legBroken(fighter) && !fighter.broken.has('neck') && !fighter.crawling) startCrawl(world, fighter, 'drags himself away on his knees');
      if (fighter.knockdowns >= WORLD.knockdownsToStop && !fighter.crawling) {
        fighter.state = 'out';
        world.events.push({ time: world.time, kind: 'stopped', fighter: fighter.id });
      } else {
        fighter.state = 'rising';
        // Crawling, his hands are on the floor: nothing drawn.
        if (fighter.pendingArm && !fighter.crawling) {
          armFighter(fighter, fighter.pendingArm, { random: world.random });
          if (fighter.weapon) world.events.push({ time: world.time, kind: 'drew', fighter: fighter.id, weapon: fighter.weapon.kind, effects: [`draws the ${fighter.weapon.spec.label.toLowerCase()}`] });
          fighter.pendingArm = null;
        }
        // Get up facing the way the hips lie: the knees then bend the way
        // the legs are pulled, not through the wrong side.
        fighter.yaw = lyingYaw(fighter) ?? fighter.yaw;
        fighter.riseFrom = PARTICLES.map((_, index) => point(fighter.x, index));
        fighter.hurt = WORLD.hurt.hurtSeconds + WORLD.hurt.hurtPerKnockdown * fighter.knockdowns;
        fighter.hurtFor = fighter.hurt;
        const pelvis = point(fighter.x, P.pelvis);
        fighter.root = [pelvis[0], pelvis[2]];
        plantFeet(fighter);
      }
    }
  } else if (fighter.state === 'rising') {
    fighter.motorScale = Math.min(1, fighter.motorScale + dt / WORLD.getUpSeconds);
    if (fighter.motorScale >= 1) {
      // Held down: if the hold kept his trunk low, he did not get up. He
      // sinks back and tries again in a moment.
      if (pinnedBy(world, fighter).length && neckLow(fighter)) {
        fighter.state = 'down';
        fighter.motorScale = 0;
        fighter.downTimer = WORLD.pin.retry;
        fighter.riseFrom = null;
      } else {
        // On his feet: any hold on him is broken, and he starts square.
        fighter.state = 'up';
        fighter.riseFrom = null;
        fighter.knock = [0, 0, 0];
        for (const holder of world.fighters) if (holder.pin?.target === fighter.id) holder.pin = null;
      }
    }
  } else if (fighter.state === 'up') {
    // Hurt after a knockdown: the legs and arms come back over seconds.
    const recovering = fighter.hurt > 0 ? 1 - (1 - WORLD.hurt.hurtStrength) * (fighter.hurt / fighter.hurtFor) : 1;
    // Blood loss: weaker the more is gone.
    const shock = 1 - (1 - BLADES.shockStrength) * Math.min(1, (fighter.bloodLost ?? 0) / collapseAt()) ** 2;
    // A battered trunk saps him as blood loss does.
    const battered = 1 - (1 - WORLD.injury.shockStrength) * Math.min(1, (fighter.trauma?.trunk ?? 0) / WORLD.injury.trunkFatal) ** 2;
    fighter.motorScale = (fighter.stun > 0 ? 0.55 : 1) * recovering * shock * battered * staggerShare(fighter, WORLD.stagger.strength);
  }
}

/** Share of a muscle's force available `elapsed` seconds after its part was hit. */
function reflexShare(fighter, elapsed) {
  const reflex = WORLD.reflex;
  const braced = fighter.guardHigh > 0 || fighter.slip > 0;
  const latency = reflex.latency - reflex.trainedSaving * fighter.body.inputs.training - (braced ? reflex.bracedSaving : 0);
  if (elapsed < latency) return reflex.floor;
  if (elapsed < latency + reflex.ramp) return reflex.floor + (1 - reflex.floor) * ((elapsed - latency) / reflex.ramp);
  return 1;
}

/**
 * Getting up: each part's target starts where the part lay and moves to
 * its standing target as the muscles come back, eased in and out. The body
 * unfolds from the pose it fell in instead of being yanked upright from it.
 */
function motorTarget(fighter, index) {
  const standing = standingTarget(fighter, index);
  if (fighter.state !== 'rising' || !fighter.riseFrom) return standing;
  const u = Math.min(1, fighter.motorScale);
  const eased = u * u * (3 - 2 * u);
  return { target: vec.lerp(fighter.riseFrom[index], standing.target, eased), velocity: vec.scale(standing.velocity, eased) };
}

function standingTarget(fighter, index) {
  const info = PARTICLE_INFO[index];
  const desired = fighter.desired[index];
  // Kneeling to hold a man down, the legs go where the kneel puts them.
  if ((fighter.pin || fighter.crawling) && info.leg) return { target: toWorld(fighter, desired), velocity: [0, 0, 0] };
  if (info.foot) return { target: footTarget(fighter, fighter.feet[info.side]), velocity: [0, 0, 0] };
  if (info.knee) {
    const side = info.side;
    if (fighter.feet[side].lifted) return { target: toWorld(fighter, desired), velocity: point(fighter.v, info.hip) };
    const hip = point(fighter.x, info.hip);
    const foot = footTarget(fighter, fighter.feet[side]);
    const pole = yawRotate([1, 0, side === 'l' ? 0.35 : -0.35], fighter.yaw);
    const L = fighter.body.lengths;
    return { target: twoBoneIK(hip, foot, L.thigh, L.shank, pole), velocity: point(fighter.v, info.hip) };
  }
  if (info.anchor === null) return { target: toWorld(fighter, desired), velocity: [fighter.rootVelocity[0], 0, fighter.rootVelocity[1]] };
  const anchor = info.anchor;
  const offset = yawRotate(vec.sub(desired, fighter.desired[anchor]), fighter.yaw);
  return { target: vec.add(point(fighter.x, anchor), offset), velocity: point(fighter.v, anchor) };
}

// Scratch for the integrator's muscle drive (one particle at a time).
const want = [0, 0, 0];

function integrate(fighter, h, time) {
  const fatigue = 0.55 + 0.45 * fighter.stamina;
  const alive = fighter.state === 'up' || fighter.state === 'rising';
  const damping = Math.exp(-h * (alive ? WORLD.damping.up : WORLD.damping.down));
  // A hand's health is the same for both its particles: once per side.
  const hands = { l: fatigue * handHealth(fighter, 'l'), r: fatigue * handHealth(fighter, 'r') };
  for (let index = 0; index < PARTICLES.length; index += 1) {
    const info = PARTICLE_INFO[index];
    const base = index * 3;
    const { target, velocity } = motorTarget(fighter, index);
    fighter.targets[index] = target;
    let acceleration = [0, -WORLD.gravity, 0];
    const scale = fighter.motorScale * (info.arm ? hands[info.side] : 1) * reflexShare(fighter, time - fighter.hitAt[index]);
    if (scale > 0.01) {
      const { omega, zeta } = WORLD.motor[info.motorGroup];
      for (let axis = 0; axis < 3; axis += 1) {
        // Spring towards the target, damper towards its velocity, and hold
        // the part up against gravity — all within the muscle's force.
        want[axis] = omega * omega * (target[axis] - fighter.x[base + axis]) + 2 * zeta * omega * (velocity[axis] - fighter.v[base + axis]) + (axis === 1 ? WORLD.gravity : 0);
      }
      const size = vec.length(want);
      let cap = motorForceNow(fighter, index, info) * scale * fighter.invMass[index];
      const top = fighter.body.topSpeed[index];
      if (top < Infinity && size > 0) {
        // Hill: the faster the limb already moves the way it is being driven,
        // the less force its muscle has left to give.
        const along = ((fighter.v[base] - velocity[0]) * want[0] + (fighter.v[base + 1] - velocity[1]) * want[1] + (fighter.v[base + 2] - velocity[2]) * want[2]) / size;
        if (along > 0) cap *= Math.max(0.02, (1 - along / top) / (1 + along / (BODY.hillCurvature * top)));
      }
      const limit = size > cap ? cap / size : 1;
      acceleration = vec.add(acceleration, vec.scale(want, limit));
    }
    for (let axis = 0; axis < 3; axis += 1) {
      fighter.v[base + axis] = (fighter.v[base + axis] + acceleration[axis] * h) * damping;
      fighter.prev[base + axis] = fighter.x[base + axis];
      fighter.x[base + axis] += fighter.v[base + axis] * h;
    }
  }
}

/**
 * The force a particle's muscles can apply now: a striking or lifted limb
 * uses the force that drives strikes; damaged legs lose some of theirs.
 */
function motorForceNow(fighter, index, info) {
  if (fighter.limp.has(index)) return 0;
  const body = fighter.body;
  let force = body.motorForce[index];
  const punch = fighter.punch;
  const side = info.side;
  const legPart = info.leg;
  if (punch && (punch.limb === index || (legPart && punch.spec.limb.startsWith(side) && (punch.spec.limb.includes('Foot') || punch.spec.limb.includes('Knee'))))) force = Math.max(force, body.strikeForce[index]);
  else if (legPart && fighter.feet[side].lifted) force = body.strikeForce[index];
  if (legPart || info.name === 'pelvis') {
    const damage = info.name === 'pelvis' ? (fighter.legDamage.l + fighter.legDamage.r) / 2 : fighter.legDamage[side];
    force *= 1 - 0.6 * Math.min(1, damage / legCapacity());
  }
  return force;
}

const ARM_PARTS = { l: ['lUpperArm', 'lForearm'], r: ['rUpperArm', 'rForearm'] };

function handHealth(fighter, side) {
  const beaten = Math.max(fighter.damage[ARM_PARTS[side][0]] ?? 0, fighter.damage[ARM_PARTS[side][1]] ?? 0);
  const broken = fighter.injuries.some((injury) => injury.kind === 'hand' && injury.side === side) ? 0.6 : 1;
  return broken * (1 - WORLD.hurt.armForcePerDamage * beaten);
}

function solveConstraints(fighter, h) {
  for (const constraint of fighter.constraints) {
    const { i, j, rest, compliance } = constraint;
    const offset = vec.sub(point(fighter.x, i), point(fighter.x, j));
    const distance = vec.length(offset) || 1e-9;
    const error = distance - rest;
    const weight = fighter.invMass[i] + fighter.invMass[j] + compliance / (h * h);
    const lambda = -error / weight;
    const normal = vec.scale(offset, 1 / distance);
    for (let axis = 0; axis < 3; axis += 1) {
      fighter.x[i * 3 + axis] += normal[axis] * lambda * fighter.invMass[i];
      fighter.x[j * 3 + axis] -= normal[axis] * lambda * fighter.invMass[j];
    }
  }
}

/**
 * Correct a joint by moving `index` by `delta` and the bones it hangs from
 * the opposite way, shared by inverse mass so momentum is kept. The step is
 * capped: a limit that yanks a particle far in one substep turns into a
 * velocity on the next and pumps energy into a resting body.
 */
function correctJoint(fighter, index, others, delta) {
  const size = vec.length(delta);
  if (size < 1e-9) return;
  // A limp body has no kick to protect: its limits hold as firmly as
  // ligaments do. Upright, they give a little, so a locked-out limb
  // is not snapped back.
  const step = fighter.state === 'up' ? WORLD.limitStep : WORLD.limitStepLimp;
  const capped = size > step ? vec.scale(delta, step / size) : delta;
  const weights = [fighter.invMass[index], ...others.map((other) => fighter.invMass[other] / others.length)];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  // A limp body's limits only reposition: limits that disagree would
  // otherwise turn each other's corrections into speed and set it thrashing.
  // Getting up too: a body unfolding from a heap breaks several limits at once.
  const arrays = isLimp(fighter) || fighter.state === 'rising' ? [fighter.x, fighter.prev] : [fighter.x];
  for (const array of arrays) {
    for (let axis = 0; axis < 3; axis += 1) array[index * 3 + axis] += capped[axis] * (weights[0] / total);
    others.forEach((other, order) => {
      for (let axis = 0; axis < 3; axis += 1) array[other * 3 + axis] -= capped[axis] * (weights[order + 1] / total);
    });
  }
}

/**
 * Hinges and cones, so a body folds the way a body folds. A joint forced well
 * past its range breaks: from then on it has no limit and its limb no muscle.
 */
function solveJointLimits(world, fighter, h) {
  // Strain leaks away every step, whether or not the joint is still over its
  // range (strain() only adds to it while it is); `h` is this fighter's own
  // step, longer for a coarse fighter.
  fighter.limitStep = h;
  if (fighter.strain) for (const joint in fighter.strain) fighter.strain[joint] *= Math.exp(-WORLD.joint.strainLeak * h);
  const limp = isLimp(fighter);
  const pelvis = point(fighter.x, P.pelvis);
  const neck = point(fighter.x, P.neck);
  const trunkUp = vec.normalize(vec.sub(neck, pelvis));
  const across = vec.sub(point(fighter.x, P.lHip), point(fighter.x, P.rHip));
  const leftward = vec.normalize(vec.sub(point(fighter.x, P.lShoulder), point(fighter.x, P.rShoulder)));
  // Local axes are x forward, y up, z left, so forward = up × left. When the
  // hips are edge-on to the trunk there is no forward to bend towards.
  const forwardRaw = vec.cross(trunkUp, across);
  const hingeDefined = vec.length(forwardRaw) > 0.3 * vec.length(across);
  const forward = vec.normalize(forwardRaw);
  const L = fighter.body.lengths;

  for (const side of ['l', 'r']) {
    const sign = side === 'l' ? 1 : -1;
    // Knees bend only forward.
    if (hingeDefined) hinge(world, fighter, `${side}Knee`, P[`${side}Hip`], P[`${side}Knee`], P[`${side}Foot`], forward, L.shank);
    // Elbows bend only towards their natural side: down, back and out from
    // the shoulder–hand line, as the guard holds them.
    // An arm on a weapon bends down and out, never back: it is held forward.
    const weaponArm = fighter.intent.weaponArms?.includes(side);
    const elbowSide = vec.normalize(vec.add(vec.add(vec.scale(forward, weaponArm ? 0.15 : -0.4), vec.scale(trunkUp, -1)), vec.scale(leftward, 0.5 * sign)));
    if (hingeDefined) hinge(world, fighter, `${side}Elbow`, P[`${side}Shoulder`], P[`${side}Elbow`], P[`${side}Hand`], elbowSide, L.forearmToFist);
    // Hips: the thigh swings within a cone about straight down.
    coneLimit(world, fighter, `${side}Hip`, P[`${side}Hip`], P[`${side}Knee`], vec.scale(trunkUp, -1), limp ? WORLD.ragdoll.hipCone : WORLD.joint.hipCone);
    if (limp) coneLimit(world, fighter, null, P[`${side}Shoulder`], P[`${side}Elbow`], vec.scale(trunkUp, -1), WORLD.ragdoll.shoulderCone);
    foldLimit(fighter, P[`${side}Hip`], P[`${side}Foot`], WORLD.minFold.leg);
    foldLimit(fighter, P[`${side}Shoulder`], P[`${side}Hand`], WORLD.minFold.arm);
  }
  coneLimit(world, fighter, 'neck', P.neck, P.head, trunkUp, limp ? WORLD.ragdoll.headCone : WORLD.headCone);
  twistLimit(fighter, trunkUp, limp ? WORLD.ragdoll.spineTwist : WORLD.spineTwist);
  if (limp) keepOutOfTrunk(fighter);
  else keepArmsOffRibs(fighter);
}

/**
 * Standing, a tucked elbow rests against the ribs, not in them: elbows and
 * hands stay outside the lean trunk by half the arm's own thickness.
 */
function keepArmsOffRibs(fighter) {
  const pelvis = point(fighter.x, P.pelvis);
  const axis = vec.sub(point(fighter.x, P.neck), pelvis);
  const length = vec.length(axis);
  const segments = fighter.body.segments;
  const radius = segments.trunk.muscleRadius + 0.5 * segments.lUpperArm.skinRadius;
  for (const name of ['lElbow', 'rElbow', 'lHand', 'rHand']) {
    const index = P[name];
    const offset = vec.sub(point(fighter.x, index), pelvis);
    const along = vec.dot(offset, axis) / length;
    if (along < 0.04 || along > length - 0.04) continue;
    const radial = vec.sub(offset, vec.scale(axis, along / length));
    const distance = vec.length(radial);
    if (distance >= radius || distance < 1e-6) continue;
    correctJoint(fighter, index, [P.pelvis, P.neck], vec.scale(radial, (radius - distance) / distance));
  }
}

/**
 * The heading a body lying on the floor faces: where its hips point,
 * flattened onto the floor (or, flat on its back or front, along the trunk).
 */
function lyingYaw(fighter) {
  const up = vec.normalize(vec.sub(point(fighter.x, P.neck), point(fighter.x, P.pelvis)));
  const across = vec.sub(point(fighter.x, P.lHip), point(fighter.x, P.rHip));
  let forward = vec.cross(up, across);
  if (Math.hypot(forward[0], forward[2]) < 0.3 * vec.length(forward)) forward = up;
  if (Math.hypot(forward[0], forward[2]) < 1e-6) return null;
  return Math.atan2(-forward[2], forward[0]);
}

/** Down or out: the muscles have let go. */
function isLimp(fighter) {
  return fighter.state === 'down' || fighter.state === 'out';
}

/**
 * Relaxed muscle still resists being stretched quickly: damp each bone's two
 * ends towards moving together, keeping their shared momentum. The body moves
 * as a body and loses its energy smoothly instead of rattling at its joints.
 */
function relaxedTone(fighter, h) {
  const share = 1 - Math.exp(-WORLD.ragdoll.toneDamping * h);
  for (const { i, j } of fighter.constraints) {
    const total = fighter.invMass[i] + fighter.invMass[j];
    for (let axis = 0; axis < 3; axis += 1) {
      const relative = fighter.v[i * 3 + axis] - fighter.v[j * 3 + axis];
      const change = relative * share;
      fighter.v[i * 3 + axis] -= change * (fighter.invMass[i] / total);
      fighter.v[j * 3 + axis] += change * (fighter.invMass[j] / total);
    }
  }
}

/** A limp body lying still stays still, until something moves it. */
function settleWhenStill(fighter, h) {
  if (!isLimp(fighter)) {
    fighter.stillFor = 0;
    return;
  }
  let fastest = 0;
  for (let index = 0; index < PARTICLES.length; index += 1) fastest = Math.max(fastest, Math.hypot(fighter.v[index * 3], fighter.v[index * 3 + 1], fighter.v[index * 3 + 2]));
  fighter.stillFor = fastest < WORLD.ragdoll.sleepSpeed ? (fighter.stillFor ?? 0) + h : 0;
}

/** Lying still long enough to stop simulating it, until it is touched or gets up. */
function asleep(fighter) {
  return gone(fighter) || (isLimp(fighter) && (fighter.stillFor ?? 0) > WORLD.ragdoll.sleepSeconds);
}

/** Out of the fight long enough (`WORLD.goneSeconds`) that his body is left lying, unsimulated. */
function gone(fighter) {
  return fighter.state === 'out' && (fighter.outFor ?? 0) > WORLD.goneSeconds;
}

/** Hips and shoulders turn against each other about the trunk by at most `limit`. */
function twistLimit(fighter, trunkUp, limit) {
  const flat = (left, right) => {
    const across = vec.sub(point(fighter.x, left), point(fighter.x, right));
    return vec.sub(across, vec.scale(trunkUp, vec.dot(across, trunkUp)));
  };
  const hips = flat(P.lHip, P.rHip);
  const shoulders = flat(P.lShoulder, P.rShoulder);
  if (vec.length(hips) < 1e-6 || vec.length(shoulders) < 1e-6) return;
  const angle = Math.atan2(vec.dot(vec.cross(vec.normalize(hips), vec.normalize(shoulders)), trunkUp), vec.dot(vec.normalize(hips), vec.normalize(shoulders)));
  const excess = Math.abs(angle) - limit;
  if (excess <= 0) return;
  // Turn each end half the excess towards the other, about its own centre.
  const turn = (left, right, centre, amount) => {
    for (const index of [left, right]) {
      const offset = vec.sub(point(fighter.x, index), point(fighter.x, centre));
      const radial = vec.sub(offset, vec.scale(trunkUp, vec.dot(offset, trunkUp)));
      correctJoint(fighter, index, [centre], vec.scale(vec.cross(trunkUp, radial), amount));
    }
  };
  const sign = Math.sign(angle);
  turn(P.lHip, P.rHip, P.pelvis, (sign * excess) / 2);
  turn(P.lShoulder, P.rShoulder, P.neck, (-sign * excess) / 2);
}

/** Hands, elbows, knees, feet and head lie against the trunk, not inside it. */
function keepOutOfTrunk(fighter) {
  const pelvis = point(fighter.x, P.pelvis);
  const neck = point(fighter.x, P.neck);
  const axis = vec.sub(neck, pelvis);
  const length = vec.length(axis);
  const radius = fighter.body.segments.trunk.skinRadius * WORLD.ragdoll.bodyClearance;
  for (const name of ['head', 'lElbow', 'rElbow', 'lHand', 'rHand', 'lKnee', 'rKnee', 'lFoot', 'rFoot']) {
    const index = P[name];
    const offset = vec.sub(point(fighter.x, index), pelvis);
    const along = vec.dot(offset, axis) / length;
    if (along < 0.04 || along > length - 0.04) continue;
    const radial = vec.sub(offset, vec.scale(axis, along / length));
    const distance = vec.length(radial);
    if (distance >= radius || distance < 1e-6) continue;
    correctJoint(fighter, index, [P.pelvis, P.neck], vec.scale(radial, (radius - distance) / distance));
  }
}

/**
 * A hinge: the middle joint may not cross the root–end line to the wrong
 * side. `bendSide` is the side it bends to; `lever` the outer bone's length.
 */
function hinge(world, fighter, joint, root, middle, end, bendSide, lever) {
  if (fighter.broken.has(joint)) return;
  const a = point(fighter.x, root);
  const b = point(fighter.x, middle);
  const c = point(fighter.x, end);
  const axis = vec.normalize(vec.sub(c, a));
  const onLine = vec.add(a, vec.scale(axis, vec.dot(vec.sub(b, a), axis)));
  const bend = vec.dot(vec.sub(b, onLine), bendSide);
  // Straight is within range (a kick or a punch locks out); only bending
  // past straight, the wrong way, is held back.
  // Limp, the hinge's bend side comes from the trunk, which says little
  // about a leg lying turned out on the floor: hold only a clear
  // hyperextension, or the limit keeps nudging a straight limb along.
  const tolerance = isLimp(fighter) ? -WORLD.ragdoll.hingeSlack : -WORLD.joint.straightAllowance;
  if (bend >= tolerance) return;
  // The joint bends by about twice the angle its offset makes over one bone.
  const overAngle = 2 * Math.asin(Math.min(1, (tolerance - bend) / lever));
  if (strain(world, fighter, joint, overAngle)) return;
  correctJoint(fighter, middle, [root, end], vec.scale(bendSide, tolerance - bend));
}

/** A cone: the tip stays within `limit` radians of `axis` about the pivot. */
function coneLimit(world, fighter, joint, pivot, tip, axis, limit) {
  if (joint && fighter.broken.has(joint)) return;
  const origin = point(fighter.x, pivot);
  const offset = vec.sub(point(fighter.x, tip), origin);
  const length = vec.length(offset);
  if (length < 1e-9) return;
  const angle = Math.acos(Math.max(-1, Math.min(1, vec.dot(offset, axis) / length)));
  if (angle <= limit) return;
  if (joint && strain(world, fighter, joint, angle - limit)) return;
  const sideways = vec.normalize(vec.sub(offset, vec.scale(axis, vec.dot(offset, axis))));
  const limited = vec.add(vec.scale(axis, Math.cos(limit) * length), vec.scale(sideways, Math.sin(limit) * length));
  correctJoint(fighter, tip, [pivot], vec.sub(limited, offset));
}

/** How far past its range a joint can be wrenched before it gives. */
function breakAngleFor(joint) {
  return WORLD.joint.breakAngles[joint] ?? WORLD.joint.breakAngle;
}

/**
 * Strain: angle held past the breaking point, times how long, leaking away.
 * A joint gives under a sustained overload, not a single substep's spike
 * (which the limit's own correction can produce). Returns true if it broke.
 */
function strain(world, fighter, joint, overAngle) {
  if (fighter.state === 'rising') return false;
  const h = fighter.limitStep;
  const strains = fighter.strain ?? (fighter.strain = {});
  const past = Math.max(0, overAngle - breakAngleFor(joint));
  strains[joint] = (strains[joint] ?? 0) + past * h;
  if (strains[joint] <= WORLD.joint.strainToBreak) return false;
  breakJoint(world, fighter, joint);
  return true;
}

// What hangs off each joint: the particles whose muscles die with it.
const LIMP_BELOW = {
  lElbow: ['lHand'], rElbow: ['rHand'],
  lKnee: ['lFoot'], rKnee: ['rFoot'],
  lHip: ['lKnee', 'lFoot'], rHip: ['rKnee', 'rFoot'],
  neck: ['head'],
};

/** A joint gives: no more limit, no more muscle below it; a leg or neck ends the fight. */
export function breakJoint(world, fighter, joint) {
  fighter.broken.add(joint);
  // The shield arm broken: it cannot hold it.
  if (joint === 'lElbow') dropShield(world, fighter, 'dropped');
  for (const name of LIMP_BELOW[joint]) fighter.limp.add(P[name]);
  fighter.damage[JOINT_SEGMENTS[joint][0]] = Math.max(fighter.damage[JOINT_SEGMENTS[joint][0]] ?? 0, 1);
  const ending = !joint.endsWith('Elbow');
  const event = { time: world.time, kind: 'broken', fighter: fighter.id, joint, effects: [`${jointName(joint)} broken${ending ? ' — cannot continue' : ''}`] };
  world.events.push(event);
  fighter.damageVersion += 1;
  if (ending && fighter.state !== 'out') {
    fighter.state = 'down';
    fighter.punch = null;
    fighter.rush = null;
    fighter.clinch = null;
    fighter.knockdowns = Math.max(fighter.knockdowns, WORLD.knockdownsToStop);
    fighter.downTimer = Math.min(fighter.downTimer || Infinity, WORLD.joint.brokenDownSeconds);
    dropWeapon(world, fighter, 'dropped');
  } else if (fighter.weapon?.held && joint === `${fighter.weapon.main}Elbow`) dropWeapon(world, fighter, 'dropped');
}

export const JOINT_SEGMENTS = {
  lElbow: ['lForearm', 'lUpperArm'], rElbow: ['rForearm', 'rUpperArm'],
  lKnee: ['lShank', 'lThigh'], rKnee: ['rShank', 'rThigh'],
  lHip: ['lThigh'], rHip: ['rThigh'], neck: ['head'],
};

function jointName(joint) {
  const side = joint[0] === 'l' ? 'left ' : joint[0] === 'r' ? 'right ' : '';
  return side + joint.replace(/^[lr](?=[A-Z])/, '').toLowerCase();
}

function foldLimit(fighter, rootIndex, endIndex, minimum) {
  const offset = vec.sub(point(fighter.x, endIndex), point(fighter.x, rootIndex));
  const distance = vec.length(offset);
  if (distance >= minimum || distance < 1e-9) return;
  correctJoint(fighter, endIndex, [rootIndex], vec.scale(offset, (minimum - distance) / distance));
}

function collideGround(world, fighter, h, arena) {
  const friction = Math.exp(-WORLD.groundFriction * h);
  for (let index = 0; index < PARTICLES.length; index += 1) {
    const base = index * 3;
    const floor = fighter.radius[index];
    if (fighter.x[base + 1] < floor) {
      // Arriving this substep (it was clear of the floor): how fast it hit.
      if (fighter.prev[base + 1] >= floor - 1e-4) groundImpact(world, fighter, index, (fighter.prev[base + 1] - fighter.x[base + 1]) / h);
      fighter.x[base + 1] = floor;
      // Flesh on canvas does not bounce: the push out of the floor must not
      // turn into upward speed, or a falling body springs back up.
      fighter.prev[base + 1] = Math.max(fighter.prev[base + 1], floor);
      fighter.x[base] = fighter.prev[base] + (fighter.x[base] - fighter.prev[base]) * friction;
      fighter.x[base + 2] = fighter.prev[base + 2] + (fighter.x[base + 2] - fighter.prev[base + 2]) * friction;
    }
    // The arena's edge stops a part, as a wall does: held at the edge, and
    // its motion into the wall gone (not turned back into a fling inwards).
    for (const axis of [0, 2]) {
      const limit = axis === 0 ? arena.halfX : arena.halfZ;
      if (fighter.x[base + axis] > limit) {
        fighter.x[base + axis] = limit;
        fighter.prev[base + axis] = Math.min(fighter.prev[base + axis], limit);
      }
      if (fighter.x[base + axis] < -limit) {
        fighter.x[base + axis] = -limit;
        fighter.prev[base + axis] = Math.max(fighter.prev[base + axis], -limit);
      }
    }
  }
}

// The body part a particle meeting the floor bruises; the feet are made for it.
const IMPACT_PART = {
  neck: 'trunk', lShoulder: 'trunk', rShoulder: 'trunk', pelvis: 'trunk', lHip: 'trunk', rHip: 'trunk',
  lElbow: 'lUpperArm', rElbow: 'rUpperArm', lHand: 'lForearm', rHand: 'rForearm', lKnee: 'lThigh', rKnee: 'rThigh',
};
// The joint a hard landing on a particle breaks: an arm thrown out to break
// a fall (the classic fall fracture). A knee drop is bruising, not a break.
const IMPACT_JOINT = { lHand: 'lElbow', rHand: 'rElbow', lElbow: 'lElbow', rElbow: 'rElbow' };

/**
 * A part hits the floor at `speed` (m/s, downwards): the head takes it as a
 * blow (it can stun, drop, knock out); the rest as bruising, worse for
 * fragile bone and less in armour; a hard landing on a hand, elbow or knee
 * can break it. A man already out feels nothing more.
 */
function groundImpact(world, fighter, index, speed) {
  const spec = WORLD.impact;
  if (fighter.state === 'out' || speed <= spec.minSpeed) return;
  const name = PARTICLES[index];
  const gear = fighter.body.gear;
  const through = speed - spec.minSpeed;
  const bone = Math.max(0.4, fighter.body.boneDensity ?? 1);
  if (name === 'head') {
    const deltaV = through * spec.head * (1 - (protectionAt(gear, 'head').blunt ?? 0));
    if (deltaV < 0.5) return;
    // Credit for what the floor does goes to whoever put him there.
    const event = { time: world.time, kind: 'impact', attacker: fighter.lastHitBy ?? fighter.lastWoundedBy ?? fighter.id, fighter: fighter.id, defender: fighter.id, target: 'head', speed, headDeltaV: deltaV, harmDeltaV: deltaV, effects: ['head hit the ground'], point: point(fighter.x, index) };
    world.events.push(event);
    applyHeadDamage(world, fighter, event);
    return;
  }
  const part = IMPACT_PART[name];
  if (!part) return;
  const bruise = (through * spec.body * (1 - (protectionAt(gear, part).blunt ?? 0))) / bone;
  addDamage(fighter, part, bruise, false);
  if (part === 'trunk') bleedInside(fighter, bruise);
  const joint = IMPACT_JOINT[name];
  if (joint && !fighter.broken.has(joint) && speed > spec.fractureSpeed * bone) {
    breakJoint(world, fighter, joint);
    world.events.push({ time: world.time, kind: 'impact', fighter: fighter.id, target: part, speed, effects: [`${name.slice(1).toLowerCase()} broken in the fall`], point: point(fighter.x, index) });
  }
}

/**
 * The share of a strike's harm that reaches the defender: what his gear
 * stops of this kind of harm (blunt, for fists, feet, knees and elbows),
 * times what the attacker's own gear lets through (a padded glove less).
 */
export function harmShare(attacker, defender, spec, struckKey = 'trunk') {
  const kind = spec.damageType ?? 'blunt';
  const limb = spec.limb.endsWith('Hand') ? 'hand' : 'foot';
  // An open palm pushes more than it hurts (`harm`).
  return (1 - (protectionAt(defender.body.gear, struckKey)[kind] ?? 0)) * (attacker.body.gear.damageDealt[limb] ?? 1) * (spec.harm ?? 1);
}

/** Whether the attacker is outside the defender's field of view. */
function blindside(defender, attacker) {
  const facing = yawRotate([1, 0, 0], defender.yaw);
  const from = vec.sub(point(attacker.x, P.pelvis), point(defender.x, P.pelvis));
  const length = Math.hypot(from[0], from[2]) || 1e-6;
  return (facing[0] * from[0] + facing[2] * from[2]) / length < Math.cos(WORLD.blindsideAngle);
}

// ---- Props -------------------------------------------------------------------

/**
 * Whatever the fighter wears that comes off, comes off: thrown along the
 * blow with the head's new speed, or simply dropped when he goes down.
 */
function knockOff(world, fighter, event) {
  for (const prop of world.props ?? []) {
    if (prop.owner !== fighter.id || !prop.attached) continue;
    // A blow moves the head hard enough to send it flying, or a fall shakes it off.
    const gear = HEADGEAR[prop.kind] ?? HEADGEAR.headset;
    if (event ? (event.headDeltaV ?? 0) < gear.knock : !gear.falls) continue;
    launchProp(world, fighter, prop, event, event ? event.headDeltaV : 0, `${gear.label.toLowerCase()} knocked off`);
  }
}

/**
 * A blade across the top of the helmet: what is fixed there and can be cut
 * (`HEADGEAR[kind].cutFrom`, J of edge) comes away with the stroke. Only a
 * cut landing high on the head reaches the crest standing above it.
 */
function cutOffHeadgear(world, fighter, event, edgeJoules, contact) {
  const crown = fighter.x[P.head * 3 + 1];
  if (contact[1] < crown) return;
  for (const prop of world.props ?? []) {
    if (prop.owner !== fighter.id || !prop.attached) continue;
    const gear = HEADGEAR[prop.kind];
    if (!gear?.cutFrom || edgeJoules < gear.cutFrom) continue;
    launchProp(world, fighter, prop, event, WORLD.props.cutHeadDeltaV, `${gear.label.toLowerCase()} cut away`);
  }
}

/** A prop leaves the head: along the blow (or simply dropped), spinning, with the event that did it. */
function launchProp(world, fighter, prop, event, headDeltaV, effect) {
  const gear = HEADGEAR[prop.kind] ?? HEADGEAR.headset;
  const spec = WORLD.props;
  const head = point(fighter.x, P.head);
  prop.attached = false;
  prop.x = vec.add(head, [0, fighter.body.lengths.headRadius * 0.6, 0]);
  const headVelocity = point(fighter.v, P.head);
  if (event) {
    const along = vec.scale(event.normal, -1);
    const speed = spec.flyBase + spec.flySpeedPerHeadDeltaV * headDeltaV;
    prop.v = vec.add(vec.add(headVelocity, vec.scale(along, speed)), [0, spec.flyUp, 0]);
  } else prop.v = vec.add(headVelocity, [0, 0.4, 0]);
  const random = world.random;
  prop.spin = [0, 1, 2].map(() => (random() < 0.5 ? -1 : 1) * (spec.spinMin + random() * spec.spinRange));
  world.events.push({ time: world.time, kind: 'accessory', fighter: fighter.id, item: prop.kind, icon: gear.icon, effects: [effect] });
}

/** Worn props ride on the head; free ones fly, tumble, bounce and settle. */
function moveProps(world, dt) {
  const spec = WORLD.props;
  for (const prop of world.props ?? []) {
    if (prop.attached) {
      prop.x = point(world.fighters[prop.owner].x, P.head);
      continue;
    }
    if (prop.resting) continue;
    prop.v[1] -= WORLD.gravity * dt;
    prop.x = vec.add(prop.x, vec.scale(prop.v, dt));
    prop.turn = vec.add(prop.turn, vec.scale(prop.spin, dt));
    if (prop.x[1] < spec.radius) {
      prop.x[1] = spec.radius;
      prop.v = [prop.v[0] * spec.slide, -prop.v[1] * spec.restitution, prop.v[2] * spec.slide];
      prop.spin = vec.scale(prop.spin, spec.slide);
      if (Math.abs(prop.v[1]) < 0.4 && Math.hypot(prop.v[0], prop.v[2]) < 0.15) {
        prop.resting = true;
        // Flat on the floor, the way it fell.
        prop.turn = [0, prop.turn[1], 0];
      }
    }
    const { halfX, halfZ } = world.arena;
    for (const [axis, half] of [[0, halfX + 0.3], [2, halfZ + 0.3]]) {
      if (Math.abs(prop.x[axis]) > half) {
        prop.x[axis] = Math.sign(prop.x[axis]) * half;
        prop.v[axis] *= -spec.restitution;
      }
    }
  }
}

// ---- Contact --------------------------------------------------------------

/** Capsules a glove can hit or a body can lean on. */
export function capsules(fighter) {
  // They depend only on the body (and what has been cut off it): built once, then shared by every contact test.
  const cut = fighter.severedCapsules?.size ?? 0;
  if (fighter.capsuleCache?.body === fighter.body && fighter.capsuleCache.cut === cut) return fighter.capsuleCache.list;
  const list = buildCapsules(fighter).filter((capsule) => !fighter.severedCapsules?.has(capsule.key));
  fighter.capsuleCache = { body: fighter.body, cut, list, byKey: Object.fromEntries(list.map((capsule) => [capsule.key, capsule])) };
  return list;
}

function buildCapsules(fighter) {
  const segments = fighter.body.segments;
  return STRUCK.map((key) => {
    if (key === 'head') return { key, a: P.head, b: P.head, radius: fighter.body.lengths.headRadius };
    const segment = SEGMENTS[key];
    if (key === 'trunk') {
      // The chest is wider than it is deep; a round capsule as wide as the
      // chest would stick out in front of the face. Use the depth, and stop
      // the top cap at the collarbones so it cannot cover the chin.
      const radius = segments.trunk.skinRadius * 0.78;
      return { key, a: P[segment.from], b: P[segment.to], radius, bLength: 1 - (radius * 0.9) / segments.trunk.length };
    }
    return { key, a: P[segment.from], b: P[segment.to], radius: segments[key].skinRadius, leg: /Thigh|Shank/.test(key) };
  });
}

/** World end points of a capsule (the trunk's top end sits below the neck). */
export function capsuleEnds(fighter, capsule) {
  const a = point(fighter.x, capsule.a);
  const b = point(fighter.x, capsule.b);
  return [a, capsule.bLength ? vec.lerp(a, b, capsule.bLength) : b];
}

function closestOnSegment(p, a, b) {
  const ab = vec.sub(b, a);
  const lengthSquared = vec.dot(ab, ab);
  const t = lengthSquared < 1e-12 ? 0 : Math.max(0, Math.min(1, vec.dot(vec.sub(p, a), ab) / lengthSquared));
  return { t, point: vec.add(a, vec.scale(ab, t)) };
}

function collideFighters(world, h, time, substep = 0) {
  const fighters = world.fighters;
  // Two bodies whose hips are further apart than a kick and a body can
  // span cannot touch: skip them. In a crowd most pairs are like that.
  const hips = fighters.map((fighter) => point(fighter.x, P.pelvis));
  const near = (a, b) => Math.hypot(hips[a][0] - hips[b][0], hips[a][2] - hips[b][2]) < WORLD.contactRange;
  // (A proxy touches nothing in a big fight: no bound needed.)
  const big = fighters.length > WORLD.tiers.full;
  for (const fighter of fighters) if (!big || fighter.detail !== 'proxy') fighter.reachBound = reachBound(fighter);
  // A big fight finds its near pairs through a grid, in the same order as
  // the all-pairs test; a proxy (posed, not simulated) touches nothing.
  if (fighters.length > WORLD.tiers.full) {
    // Candidates once a step (the grid, its lookups and sorts were a tenth of
    // a big fight's step when made every substep); the exact range each substep.
    if (world.contactCache?.time !== world.time || world.contactCache.count !== fighters.length) {
      const grid = spatialGrid(hips.map((hip) => [hip[0], hip[2]]), WORLD.contactRange + WORLD.contactMargin);
      world.contactCache = { time: world.time, count: fighters.length, near: fighters.map((fighter, index) => (fighter.detail === 'proxy' ? [] : grid.near(index))) };
    }
    const range = WORLD.contactRange * WORLD.contactRange;
    const within = (a, b) => (hips[a][0] - hips[b][0]) ** 2 + (hips[a][2] - hips[b][2]) ** 2 < range;
    // Two coarse fighters move only on their substeps: they are tested then.
    const stride = coarseStride(world);
    const meet = (a, b) => fighters[b].detail !== 'proxy' && (substep % stride === stride - 1 || fighters[a].detail === 'full' || fighters[b].detail === 'full');
    // In a big fight a hand or blade not striking (guarding, hanging) is
    // tested on every other substep; the strike in flight on every one.
    const idleEvery = fightTier(world) >= 3 ? 2 : 1;
    const neighbours = fighters.map((fighter, index) => (fighter.detail === 'proxy' ? [] : world.contactCache.near[index].filter((other) => within(index, other) && meet(index, other))));
    fighters.forEach((attacker, a) => {
      if (!neighbours[a].length) return;
      const limbs = strikers(attacker);
      for (const d of neighbours[a]) {
        const defender = fighters[d];
        if (attacker.corner === defender.corner && !attacker.punch) continue;
        for (const striker of limbs) {
          const striking = striker.weapon ? attacker.punch?.spec.path === 'blade' : attacker.punch?.spec.limb === striker.key;
          if (striking || substep % idleEvery === 0) collideStriker(world, attacker, defender, striker, time);
        }
      }
    });
    fighters.forEach((first, a) => {
      for (const b of neighbours[a]) {
        if (b <= a) continue;
        const second = fighters[b];
        pushApart(world, first, second);
        if (first.weapon?.held && second.weapon?.held && first.corner !== second.corner) clashWeapons(world, first, second);
      }
    });
    return;
  }
  fighters.forEach((attacker, a) => {
    const limbs = strikers(attacker);
    fighters.forEach((defender, d) => {
      if (attacker === defender || !near(a, d)) return;
      // Team-mates are checked only while a blow is in the air (it can
      // still go astray); idle hands among friends touch nothing that matters.
      if (attacker.corner === defender.corner && !attacker.punch) return;
      for (const striker of limbs) collideStriker(world, attacker, defender, striker, time);
    });
  });
  for (let first = 0; first < fighters.length; first += 1) {
    for (let second = first + 1; second < fighters.length; second += 1) {
      if (!near(first, second)) continue;
      pushApart(world, fighters[first], fighters[second]);
      if (fighters[first].weapon?.held && fighters[second].weapon?.held && fighters[first].corner !== fighters[second].corner) clashWeapons(world, fighters[first], fighters[second]);
    }
  }
}

/**
 * What of the attacker can hit: both gloves always (they block and push),
 * and the limb of a strike in flight — an elbow or knee as a ball, a kick as
 * the shin from knee to foot.
 */
function strikers(fighter) {
  const fist = fistsOf(fighter.body).radius;
  const list = ['l', 'r'].map((side) => ({ key: `${side}Hand`, a: P[`${side}Hand`], b: P[`${side}Hand`], radius: fist, side }));
  // A shield bash: the left hand's blow lands with the shield's face, a broad capsule up its middle.
  if (fighter.punch?.spec.bash && fighter.shield) {
    const shield = shieldDisc(fighter);
    const spec = fighter.shield.spec;
    const reach = (spec.shape ? spec.height / 2 : spec.radius) * 0.75;
    const face = vec.add(shield.centre, vec.scale(shield.normal, 0.02));
    list[0] = { key: 'lHand', bash: true, a: P.lHand, b: P.lHand, pa: vec.sub(face, vec.scale(shield.up, reach)), pb: vec.add(face, vec.scale(shield.up, reach)), radius: spec.shape ? spec.width * 0.4 : spec.radius * 0.75, side: 'l' };
  }
  const weapon = fighter.weapon;
  // (A whip's handle strikes nothing: its thong's tip does, in physics/whip.js.)
  if (weapon?.held && !weapon.spec.rope) {
    // The weapon, from where it starts to strike to its tip.
    const hand = P[`${weapon.main}Hand`];
    list.push({ key: 'weapon', weapon: true, a: hand, b: hand, pa: vec.add(point(fighter.x, hand), vec.scale(weapon.dir, weapon.spec.strikeFrom)), pb: weapon.tip, radius: weapon.spec.radius, side: weapon.main });
  }
  const punch = fighter.punch;
  if (!punch || punch.t > punch.spec.extendUntil + 0.06) return list;
  const limb = punch.spec.limb;
  const side = limb[0];
  if (limb.endsWith('Elbow')) list.push({ key: limb, a: P[limb], b: P[limb], radius: 0.05, side });
  else if (limb.endsWith('Knee')) list.push({ key: limb, a: P[limb], b: P[limb], radius: 0.07, side });
  else if (limb.endsWith('Foot')) list.push({ key: limb, a: P[`${side}Knee`], b: P[limb], radius: 0.05, side, shin: true });
  return list;
}

/** Closest points between two segments: parameters s on the first, t on the second. */
export function closestBetween(p1, q1, p2, q2) {
  const d1 = vec.sub(q1, p1);
  const d2 = vec.sub(q2, p2);
  const r = vec.sub(p1, p2);
  const a = vec.dot(d1, d1);
  const e = vec.dot(d2, d2);
  const f = vec.dot(d2, r);
  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  let s;
  let t;
  if (a < 1e-12 && e < 1e-12) {
    s = 0;
    t = 0;
  } else if (a < 1e-12) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = vec.dot(d1, r);
    if (e < 1e-12) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = vec.dot(d1, d2);
      const denominator = a * e - b * b;
      s = denominator > 1e-12 ? clamp01((b * f - c * e) / denominator) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  return { s, t, onFirst: vec.add(p1, vec.scale(d1, s)), onSecond: vec.add(p2, vec.scale(d2, t)) };
}

/**
 * How far from his hips anything of a fighter a strike can meet reaches:
 * his body, his shield, his blade. Taken once a substep, with room for the
 * pushes the substep's contacts can give him.
 */
function reachBound(fighter) {
  const hips = point(fighter.x, P.pelvis);
  const from = (at) => vec.length(vec.sub(at, hips));
  // His body as it lies now: its furthest particle, and the fattest capsule
  // round it (a standing man reaches far less than bodyReach allows).
  let furthest = 0;
  for (let index = 0; index < fighter.x.length / 3; index += 1) {
    const dx = fighter.x[index * 3] - hips[0];
    const dy = fighter.x[index * 3 + 1] - hips[1];
    const dz = fighter.x[index * 3 + 2] - hips[2];
    furthest = Math.max(furthest, dx * dx + dy * dy + dz * dz);
  }
  let fattest = 0;
  for (const capsule of capsules(fighter)) fattest = Math.max(fattest, capsule.radius);
  let bound = Math.min(WORLD.bodyReach, Math.sqrt(furthest) + fattest);
  if (fighter.shield && fighter.state !== 'out') {
    const disc = shieldDisc(fighter);
    bound = Math.max(bound, from(disc.centre) + disc.radius + 0.012);
  }
  const weapon = fighter.weapon;
  if (weapon?.held && fighter.state === 'up') {
    const hilt = vec.add(point(fighter.x, P[`${weapon.main}Hand`]), vec.scale(weapon.dir, weapon.spec.strikeFrom));
    bound = Math.max(bound, Math.max(from(hilt), from(weapon.tip)) + weapon.spec.radius);
  }
  return bound + REACH_MARGIN;
}

// m: what a defender can be pushed in one substep's contacts, and more.
const REACH_MARGIN = 0.1;

function collideStriker(world, attacker, defender, striker, time) {
  const sa = striker.pa ?? point(attacker.x, striker.a);
  const sb = striker.pb ?? point(attacker.x, striker.b);
  // Out of reach of all of him, shield and blade too (most pairs in a
  // crowd): nothing to test, only contacts to forget, as below.
  if (defender.reachBound !== undefined) {
    const hips = point(defender.x, P.pelvis);
    if (vec.length(vec.sub(closestOnSegment(hips, sa, sb).point, hips)) - striker.radius > defender.reachBound) {
      if (attacker.contacts.size) {
        const prefix = `${defender.id}:${striker.key}:`;
        if (defender.shield && defender.state !== 'out') attacker.contacts.delete(`${prefix}shield`);
        const shieldArm = attacker.shield && (striker.key === 'lHand' || striker.key === 'lForearm');
        if (!striker.weapon && !shieldArm && defender.weapon?.held && defender.state === 'up') attacker.contacts.delete(`${prefix}blade`);
        for (const key of attacker.contacts) if (key.startsWith(prefix) && !key.endsWith(':shield') && !key.endsWith(':blade')) attacker.contacts.delete(key);
      }
      return;
    }
  }
  // Whether he has any contact with this limb to forget: the keys are only
  // built when he does (most tests touch nothing and remember nothing).
  const prefix = `${defender.id}:${striker.key}:`;
  let touching = false;
  for (const key of attacker.contacts) {
    if (key.startsWith(prefix)) {
      touching = true;
      break;
    }
  }
  if (defender.shield && defender.state !== 'out') {
    // A shield in the way takes it: nothing behind is touched.
    const disc = shieldDisc(defender);
    const hit = segmentToShield(sa, sb, disc);
    const shieldKey = `${prefix}shield`;
    if (hit.distance < striker.radius + 0.012) {
      const away = hit.distance > 1e-6 ? vec.normalize(vec.sub(hit.from, hit.point)) : disc.normal;
      if (!attacker.contacts.has(shieldKey)) {
        attacker.contacts.add(shieldKey);
        registerShieldImpact(world, attacker, defender, striker, disc, hit, away);
      }
      const push = Math.min(striker.radius + 0.012 - hit.distance, WORLD.contactStep);
      for (const index of new Set([striker.a, striker.b])) for (let axis = 0; axis < 3; axis += 1) attacker.x[index * 3 + axis] += away[axis] * push;
      return;
    }
    if (touching) attacker.contacts.delete(shieldKey);
  }
  // The hand and forearm in a shield's grip are behind it: a blade meets the shield.
  const shieldArm = attacker.shield && (striker.key === 'lHand' || striker.key === 'lForearm');
  if (!striker.weapon && !shieldArm && defender.weapon?.held && defender.state === 'up') {
    // A blade in the way: a fist, shin, elbow or knee that comes on meets its edge.
    const weapon = defender.weapon;
    const hilt = vec.add(point(defender.x, P[`${weapon.main}Hand`]), vec.scale(weapon.dir, weapon.spec.strikeFrom));
    const closest = closestBetween(sa, sb, hilt, weapon.tip);
    const offset = vec.sub(closest.onFirst, closest.onSecond);
    const distance = vec.length(offset);
    const bladeKey = `${prefix}blade`;
    if (distance < striker.radius + weapon.spec.radius) {
      const away = distance > 1e-6 ? vec.scale(offset, 1 / distance) : yawRotate([-1, 0, 0], defender.yaw);
      if (!attacker.contacts.has(bladeKey)) {
        attacker.contacts.add(bladeKey);
        registerBladeBlock(world, attacker, defender, striker, closest, away);
      }
      const push = Math.min(striker.radius + weapon.spec.radius - distance, WORLD.contactStep);
      for (const index of new Set([striker.a, striker.b])) for (let axis = 0; axis < 3; axis += 1) attacker.x[index * 3 + axis] += away[axis] * push;
      return;
    }
    if (touching) attacker.contacts.delete(bladeKey);
  }
  const striking = striker.weapon ? attacker.punch?.spec.path === 'blade' : attacker.punch?.spec.limb === striker.key;
  // Nowhere near him: no part of his body can be touched (a crowd is mostly
  // this). Forget any contact with him, so the next real one counts.
  const hips = point(defender.x, P.pelvis);
  if (vec.length(vec.sub(closestOnSegment(hips, sa, sb).point, hips)) > WORLD.bodyReach + striker.radius) {
    if (touching) {
      for (const key of attacker.contacts) if (key.startsWith(prefix) && !key.endsWith(':shield') && !key.endsWith(':blade')) attacker.contacts.delete(key);
    }
    return;
  }
  // One push out of the body per substep, however many parts it touches
  // (a long weapon can lie across several at once).
  let pushBudget = WORLD.contactStep;
  // The striker as a ball round its middle: a part further than both
  // half-lengths and the reach from it cannot be touched (the closest test skipped).
  const strikerMiddle = [(sa[0] + sb[0]) / 2, (sa[1] + sb[1]) / 2, (sa[2] + sb[2]) / 2];
  const strikerHalf = vec.length(vec.sub(sb, sa)) / 2;
  for (const capsule of capsules(defender)) {
    // Kicks and weapons hit legs and bodies; gloves only collide above the waist.
    if (!striker.shin && capsule.leg && !striking) continue;
    const [a, b] = capsuleEnds(defender, capsule);
    const reach = capsule.radius + striker.radius;
    const apart = vec.length([(a[0] + b[0]) / 2 - strikerMiddle[0], (a[1] + b[1]) / 2 - strikerMiddle[1], (a[2] + b[2]) / 2 - strikerMiddle[2]]);
    const out = apart - strikerHalf - vec.length([b[0] - a[0], b[1] - a[1], b[2] - a[2]]) / 2 >= reach;
    const closest = out ? null : closestBetween(sa, sb, a, b);
    if (closest) closest.t *= capsule.bLength ?? 1;
    const offset = closest ? vec.sub(closest.onFirst, closest.onSecond) : null;
    const distance = closest ? vec.length(offset) : Infinity;
    if (distance >= reach) {
      if (touching) {
        const contactKey = `${prefix}${capsule.key}`;
        attacker.contacts.delete(contactKey);
        attacker.contacts.delete(`${contactKey}:through`);
      }
      continue;
    }
    const contactKey = `${prefix}${capsule.key}`;
    const normal = distance > 1e-9 ? vec.scale(offset, 1 / distance) : [0, 1, 0];
    if (!attacker.contacts.has(contactKey)) {
      attacker.contacts.add(contactKey);
      if (striker.weapon) {
        if (registerWeaponImpact(world, attacker, defender, striker, closest, capsule, normal, time)) attacker.contacts.add(`${contactKey}:through`);
      } else registerImpact(world, attacker, defender, striker, closest, capsule, normal, time);
    }
    // A blade that went through is not held back by what it cut.
    if (attacker.contacts.has(`${contactKey}:through`)) continue;
    // A sumo push: while the palms are on his trunk, the legs keep driving.
    const pushing = attacker.punch?.spec.shove && !striker.weapon && striker.key.endsWith('Hand') && attacker.punch.t <= attacker.punch.spec.extendUntil + 0.1;
    if (pushing && capsule.key === 'trunk') drive(world, attacker, defender, vec.scale(normal, -1), attacker.punch.spec.shove);
    // Separate them, sharing the push by inverse mass; a limb that starts a
    // strike already inside a body is eased out over a few substeps, not
    // thrown clear in one.
    const penetration = Math.min(reach - distance, pushBudget);
    pushBudget -= penetration;
    if (penetration <= 0) continue;
    const shares = [
      [attacker, striker.a, striker.a === striker.b ? 1 : 1 - closest.s, 1],
      [attacker, striker.b, striker.a === striker.b ? 0 : closest.s, 1],
      [defender, capsule.a, capsule.a === capsule.b ? 1 : 1 - closest.t, -1],
      [defender, capsule.b, capsule.a === capsule.b ? 0 : closest.t, -1],
    ].filter(([, , share]) => share > 0);
    const total = shares.reduce((sum, [fighter, index, share]) => sum + fighter.invMass[index] * share, 0);
    for (const [fighter, index, share, sign] of shares) {
      const amount = (penetration * fighter.invMass[index] * share) / total;
      for (let axis = 0; axis < 3; axis += 1) {
        fighter.x[index * 3 + axis] += sign * normal[axis] * amount;
        // A weapon resting in a body is held off it at the hand, far from
        // where it touches: move the hand without making that a speed, or
        // the push repeated each substep winds the arm up into a fling.
        if (striker.weapon && fighter === attacker) fighter.prev[index * 3 + axis] += sign * normal[axis] * amount;
      }
    }
  }
}

/**
 * Bodies meet: trunks and heads cannot overlap. The push is shared by
 * inverse mass, so a heavy fighter moves a light one; and a charge that
 * arrives fast hands its momentum over in a collision.
 */
function pushApart(world, first, second) {
  const pairs = [['trunk', 'trunk'], ['head', 'head'], ['head', 'trunk'], ['trunk', 'head']];
  capsules(first);
  capsules(second);
  const firstCapsules = first.capsuleCache.byKey;
  const secondCapsules = second.capsuleCache.byKey;
  for (const [firstKey, secondKey] of pairs) {
    const one = firstCapsules[firstKey];
    const two = secondCapsules[secondKey];
    // A part cut off no longer meets anything.
    if (!one || !two) continue;
    const [a1, b1] = capsuleEnds(first, one);
    const [a2, b2] = capsuleEnds(second, two);
    const closest = closestBetween(a1, b1, a2, b2);
    const offset = vec.sub(closest.onFirst, closest.onSecond);
    const distance = vec.length(offset);
    const reach = one.radius + two.radius;
    if (distance >= reach || distance < 1e-9) continue;
    const normal = vec.scale(offset, 1 / distance);
    if (firstKey === 'trunk' && secondKey === 'trunk') collideBodies(world, first, second, normal);
    const shares = [
      [first, one.a, one.a === one.b ? 1 : 1 - closest.s, 1], [first, one.b, one.a === one.b ? 0 : closest.s, 1],
      [second, two.a, two.a === two.b ? 1 : 1 - closest.t, -1], [second, two.b, two.a === two.b ? 0 : closest.t, -1],
    ].filter(([, , share]) => share > 0);
    const total = shares.reduce((sum, [fighter, index, share]) => sum + fighter.invMass[index] * share, 0);
    for (const [fighter, index, share, sign] of shares) {
      const amount = ((reach - distance) * fighter.invMass[index] * share) / total;
      for (let axis = 0; axis < 3; axis += 1) fighter.x[index * 3 + axis] += sign * normal[axis] * amount;
    }
  }
}

/** A charge landing: the trunks exchange momentum as two effective masses would. */
function collideBodies(world, first, second, normal) {
  const charger = first.rush && !first.rush.hit ? first : second.rush && !second.rush.hit ? second : null;
  const velocity = (fighter) => vec.scale(TRUNK_PARTICLES.reduce((sum, index) => vec.add(sum, vec.scale(point(fighter.v, index), fighter.body.masses[index])), [0, 0, 0]), 1 / TRUNK_PARTICLES.reduce((sum, index) => sum + fighter.body.masses[index], 0));
  // Normal points from second to first; closing speed is how fast they meet.
  const closing = vec.dot(vec.sub(velocity(second), velocity(first)), normal);
  if (!charger) {
    bodiesMeet(world, first, second, closing);
    return;
  }
  if (closing < WORLD.rush.minClosing) return;
  charger.rush.hit = true;
  charger.rush.t = Math.max(charger.rush.t, charger.rush.duration - 0.15);
  const m1 = first.body.massKg * WORLD.rush.trunkShare;
  const m2 = second.body.massKg * WORLD.rush.trunkShare;
  const impulse = ((m1 * m2) / (m1 + m2)) * closing * (1 + WORLD.transferRestitution);
  const everywhere = TRUNK_PARTICLES.map((index) => [index, 1]);
  // The charger meant to be moving: the impulse that only cancels his own
  // run is braking, not a knock. Only what goes beyond it can topple him.
  const runSpeed = (fighter, towards) => Math.max(0, vec.dot(velocity(fighter), towards));
  const braced = (fighter, direction) => (fighter === charger ? runSpeed(fighter, vec.scale(direction, -1)) : 0);
  world.pendingImpulses.push({ fighter: first, shares: everywhere, direction: normal, impulse, braced: braced(first, normal) });
  world.pendingImpulses.push({ fighter: second, shares: everywhere, direction: vec.scale(normal, -1), impulse, braced: braced(second, vec.scale(normal, -1)) });
  const struck = charger === first ? second : first;
  struck.stamina = Math.max(0, struck.stamina - impulse / (struck.body.massKg * 2) / struck.body.aerobic);
  // Both bodies take their own speed change: the lighter one more.
  for (const fighter of [first, second]) bodyBlow(fighter, impulse / (fighter.body.massKg * WORLD.rush.trunkShare), WORLD.impact.charge);
  world.events.push({ time: world.time, kind: 'collision', attacker: charger.id, defender: struck.id, punch: 'rush', target: 'trunk', speed: closing, impulse, force: 0, headDeltaV: 0, effects: [], point: point(struck.x, P.neck), normal });
}

/** Two bodies running into each other (no charge): past `bumpSpeed`, both are hurt by it. */
function bodiesMeet(world, first, second, closing) {
  const spec = WORLD.impact;
  if (closing < spec.bumpSpeed) return;
  const key = first.id < second.id ? `${first.id}:${second.id}` : `${second.id}:${first.id}`;
  world.bumps ??= new Map();
  if (world.time - (world.bumps.get(key) ?? -Infinity) < spec.bumpEvery) return;
  world.bumps.set(key, world.time);
  const m1 = first.body.massKg * WORLD.rush.trunkShare;
  const m2 = second.body.massKg * WORLD.rush.trunkShare;
  const impulse = ((m1 * m2) / (m1 + m2)) * closing;
  for (const fighter of [first, second]) bodyBlow(fighter, impulse / (fighter.body.massKg * WORLD.rush.trunkShare), spec.charge);
  world.events.push({ time: world.time, kind: 'bump', attacker: first.id, defender: second.id, speed: closing, impulse, effects: [] });
}

/** A whole-body blow of `deltaV` (m/s) to the trunk: spread by armour, borne by bone. */
function bodyBlow(fighter, deltaV, share) {
  if (fighter.state === 'out') return;
  const spread = 1 - (fighter.body.gear.protection.blunt ?? 0);
  const bruise = (deltaV * share * spread) / Math.max(0.4, fighter.body.boneDensity ?? 1);
  addDamage(fighter, 'trunk', bruise, false);
  bleedInside(fighter, bruise);
}

/** A blunt blow to the trunk (m/s through armour and bone) bleeds inside, as a wound does outside. */
function bleedInside(fighter, deltaV) {
  const rate = deltaV * WORLD.impact.internalBleed;
  fighter.bleed = (fighter.bleed ?? 0) + rate;
  fighter.bleedInside = (fighter.bleedInside ?? 0) + rate;
}

/** Which of the struck fighter's particles take the blow, and in what share. */
function struckParticles(defender, capsule, closest, contactPoint, push) {
  if (capsule.key === 'head') return [[P.head, 1]];
  if (capsule.key === 'trunk') {
    // A push moves the whole trunk; a strike, the trunk near where it landed.
    return TRUNK_PARTICLES.map((index) => {
      const distance = vec.length(vec.sub(point(defender.x, index), contactPoint));
      return [index, push ? 1 : Math.exp(-((distance / 0.22) ** 2))];
    });
  }
  const side = capsule.key[0];
  if (capsule.key.match(/Thigh|Shank/)) return [[capsule.a, 1 - closest.t], [capsule.b, closest.t], [P[`${side}Hip`], 0.25]];
  // A guard is braced against the head and shoulders: a blocked strike is
  // taken by the arm and the trunk behind it, not the forearm alone.
  return [[capsule.a, 1 - closest.t], [capsule.b, closest.t], [P[`${side}Shoulder`], 0.8], [P.neck, 0.5], [P.pelvis, 0.3]];
}

/** The mass a struck part brings to a collision: the part, and what is braced behind it. */
function struckMassOf(defender, capsule) {
  const body = defender.body;
  if (capsule.key === 'head') return body.headEffectiveMass;
  if (capsule.key === 'trunk') return body.massKg * 0.35;
  if (/Thigh|Shank/.test(capsule.key)) return body.segments[capsule.key].mass + body.massKg * (capsule.key.includes('Thigh') ? 0.12 : 0.06);
  return body.segments[capsule.key].mass + body.segments.trunk.mass * 0.25;
}

function registerImpact(world, attacker, defender, striker, closest, capsule, normal, time) {
  const punch = attacker.punch;
  // A weapon move lands with the weapon, not the fist that holds it.
  if (!punch || punch.spec.path === 'blade' || punch.spec.limb !== striker.key || punch.landed || punch.t > punch.spec.extendUntil + 0.06) return;
  const spec = punch.spec;
  const strikeVelocity = vec.lerp(point(attacker.v, striker.a), point(attacker.v, striker.b), closest.s);
  const struckVelocity = vec.lerp(point(defender.v, capsule.a), point(defender.v, capsule.b), closest.t);
  const closing = -vec.dot(vec.sub(strikeVelocity, struckVelocity), normal);
  if (closing < WORLD.minImpactSpeed) return;
  punch.landed = true;

  const body = defender.body;
  const side = striker.side;
  const onLeg = /Thigh|Shank/.test(capsule.key);
  const checked = onLeg && defender.intent.check && capsule.key[0] === 'l';
  const blocked = BLOCKING.has(capsule.key) || checked;
  // Untrained hands put less of the body behind a blow.
  const technique = attacker.body.technique * (STYLES[attacker.style]?.technique ?? 1);
  const limbs = attacker.body.limbKg;
  // Heavy boots put weight behind a kick or a knee.
  const kicking = /Foot|Knee/.test(spec.limb);
  // A bash carries the shield's own weight in front of the arm and body.
  const shieldMass = striker.bash && attacker.shield ? attacker.shield.spec.mass : 0;
  const strikeMass = (((spec.mass.arm ?? 0) * limbs[`${side}Arm`] + (spec.mass.leg ?? 0) * limbs[`${side}Leg`] + (spec.mass.body ?? 0) * attacker.body.massKg) * technique * (punch.heavy ? WORLD.heavy.massFactor : 1) * (kicking ? attacker.body.gear.kick : 1) + shieldMass) * staggerShare(attacker, WORLD.stagger.harm);
  const struckMass = struckMassOf(defender, capsule);
  // A collision of two effective masses; flesh and padding make it largely
  // inelastic, so the impulse is the reduced mass times the closing speed.
  const reducedMass = (strikeMass * struckMass) / (strikeMass + struckMass);
  const impulse = reducedMass * closing * (1 + WORLD.restitution);
  const firmness = body.segments[capsule.key === 'head' ? 'head' : capsule.key === 'trunk' ? 'trunk' : capsule.key].fleshFirmness;
  // Gloved strikes spread over the glove's contact time; kicks, knees and
  // elbows over the general one; bare fists over their own short one.
  const fists = fistsOf(attacker.body);
  const contactSeconds = spec.contactSeconds ?? (spec.limb.endsWith('Hand') ? fists.contactSeconds : WORLD.contactSeconds);
  const peakForce = ((Math.PI / 2) * impulse) / (contactSeconds * (1 + 0.6 * (1 - firmness)));
  const contactPoint = vec.add(closest.onSecond, vec.scale(normal, capsule.radius));
  const event = {
    time: world.time, kind: blocked ? 'blocked' : 'landed', attacker: attacker.id, defender: defender.id,
    punch: punch.type, target: capsule.key, speed: closing, impulse, force: peakForce, headDeltaV: 0, effects: [],
    point: contactPoint, normal,
  };
  if (checked) event.effects.push('checked');
  // Harm, apart from physics: what the defender wears takes some of it, and
  // a padded glove gives less. The impulse and the knockback are untouched.
  const harm = harmShare(attacker, defender, spec, capsule.key);
  event.harm = harm;
  bluntConsequences(world, attacker, defender, capsule, event, { impulse, struckMass, peakForce, harm, blocked, checked, rotation: spec.rotation, cuts: spec.cuts, cutForce: spec.limb.endsWith('Hand') ? fists.cutForce : Infinity, side, push: spec.push });
  if (spec.limb.endsWith('Hand') && !striker.bash && peakForce > attacker.body.fracture.hand * fists.handFracture * (blocked ? 0.8 : 1) && !attacker.injuries.some((injury) => injury.kind === 'hand' && injury.side === side)) {
    attacker.injuries.push({ kind: 'hand', side, time: world.time });
    event.effects.push(`${attacker.body.inputs.name}: broken hand`);
  }
  // A blow to the arm that holds a weapon jars the grip.
  if (defender.weapon?.held && capsule.key.startsWith(defender.weapon.main) && BLOCKING.has(capsule.key)) strainGrip(world, defender, impulse * BLADES.armHitShare, vec.scale(normal, -1));
  pushBack(world, attacker, defender, capsule, closest, contactPoint, normal, impulse, harm, blocked, spec, RECOIL[spec.limb.slice(1)].map(([part, share]) => [P[`${side}${part}`], share]), time, event);
  world.events.push(event);
}

/**
 * What a blunt blow does to the body, apart from the push: damage to the
 * part struck, the head shaken (knockdowns, knockouts), cuts opened, faces
 * and ribs broken, legs worn down; a checked kick hurts the kicker.
 */
function bluntConsequences(world, attacker, defender, capsule, event, { impulse, struckMass, peakForce, harm, blocked, checked = false, rotation, cuts = false, cutForce = Infinity, side, push = false, concentration = 1 }) {
  const body = defender.body;
  const onLeg = /Thigh|Shank/.test(capsule.key);
  addDamage(defender, capsule.key, (impulse / struckMass) * harm, blocked);
  if (blocked) {
    attacker.stats.blocked += 1;
    event.headDeltaV = BLOCKING.has(capsule.key) ? (impulse * WORLD.head.blockedShare) / body.headEffectiveMass : 0;
    // Kicking into a checked shin hurts the kicker's shin.
    if (checked) attacker.legDamage[side] += ((impulse * 0.5) / attacker.body.limbKg[`${side}Leg`]) * (1 - (protectionAt(attacker.body.gear, `${side}Shank`).blunt ?? 0));
    return;
  }
  attacker.stats.landed += 1;
  if (capsule.key === 'head') {
    // Rotational strikes turn the head as well as pushing it, and rotation
    // is what knocks people out (Ommaya; Viano 2005).
    event.headDeltaV = (impulse / body.headEffectiveMass) * rotation;
    // Unseen, unbraced: a blow from well off where he faces finds the neck
    // slack, and the head snaps further — the blindside shot of a brawl.
    if (blindside(defender, attacker)) {
      event.headDeltaV *= WORLD.blindsideFactor;
      event.effects.push('blindsided');
    }
    // A hard weapon's blow lands over a shorter contact: the same speed change
    // with a sharper peak, which is what strains the brain.
    event.harmDeltaV = event.headDeltaV * harm * concentration;
    applyHeadDamage(world, defender, event);
    knockOff(world, defender, event);
    const cutting = peakForce * (1 - protectionAt(defender.body.gear, 'head').cut);
    if ((cuts && cutting > WORLD.head.cutForce) || cutting > cutForce) {
      defender.cuts = (defender.cuts ?? 0) + 1;
      event.effects.push('cut opened');
    }
    if (peakForce * harm > body.fracture.face && !defender.injuries.some((injury) => injury.kind === 'face')) {
      defender.injuries.push({ kind: 'face', time: world.time });
      event.effects.push('facial fracture');
    }
  } else if (capsule.key === 'trunk') {
    defender.stamina = Math.max(0, defender.stamina - ((impulse / (body.massKg * 0.6)) / body.aerobic) * harm);
    event.effects.push(push ? 'pushed back' : 'body: wind taken');
    if (peakForce * harm > body.fracture.rib && !defender.injuries.some((injury) => injury.kind === 'rib')) {
      defender.injuries.push({ kind: 'rib', time: world.time });
      event.effects.push('rib fracture');
    }
  } else if (onLeg) {
    const legSide = capsule.key[0];
    // The defender's own leg takes the blow: its speed change is the damage.
    const before = defender.legDamage[legSide];
    defender.legDamage[legSide] += (impulse / struckMass) * harm;
    event.effects.push('leg struck');
    const buckles = (damage) => (damage < legCapacity() ? 0 : 1 + Math.floor((damage / legCapacity() - 1) / WORLD.legGivesAgainEvery));
    if (buckles(defender.legDamage[legSide]) > buckles(before) && defender.state === 'up') {
      knockDown(world, defender, event, 'knockdown (leg gave way)');
    }
  }
}

/**
 * Momentum is conserved: the struck part takes the impulse, the striking
 * limb takes it back. Both sides' muscles there are caught off guard for a
 * reflex delay, so the part flies before it is caught. A blow too big for
 * the whole body's mass throws it, and out.
 */
function pushBack(world, attacker, defender, capsule, closest, contactPoint, normal, impulse, harm, blocked, spec, recoil, time, event, share = 1) {
  const body = defender.body;
  const struck = struckParticles(defender, capsule, closest, contactPoint, spec.push);
  // A weapon hands over momentum by what meets the body: an edge sinks in, a hard head rebounds.
  const bounce = event.edgeShare === undefined ? WORLD.transferRestitution : WORLD.weaponTransferRestitution.blunt + (WORLD.weaponTransferRestitution.edge - WORLD.weaponTransferRestitution.blunt) * event.edgeShare;
  const transferred = ((impulse * (1 + bounce)) / (1 + WORLD.restitution)) * share;
  event.transferred = transferred;
  // A heavy blunt blow on armour: he reels. Its blunt peak force is what
  // tells a hammer from a glove (a cut's sharp force is no shove).
  if (event.force) stagger(world, defender, (event.force * Math.min(1, event.bluntMix ?? 1) * share) / WORLD.stagger.force, event);
  const bodyDeltaV = transferred / body.massKg;
  if (defender.state === 'up' && bodyDeltaV * harm > WORLD.knockout.bodyDeltaV * BODY.toughness && !blocked) {
    knockOut(world, defender, event, `knocked out (the blow moved his whole body ${bodyDeltaV.toFixed(1)} m/s)`);
  }
  world.pendingImpulses.push({ fighter: defender, shares: struck, direction: vec.scale(normal, -1), impulse: transferred, massShare: WORLD.balance.strikeMassShare });
  world.pendingImpulses.push({ fighter: attacker, shares: recoil, direction: normal, impulse: transferred });
  for (const [index, weight] of struck) if (weight > 0.2) defender.hitAt[index] = time;
  if (capsule.key === 'head') defender.hitAt[P.neck] = time;
}

// ---- Blades and points ---------------------------------------------------------

// What comes off when a limb is cut through at each joint: the particles
// beyond it (left in the simulation, limp and drawn no more), the rig bones
// whose skin goes with it, the capsules that can no longer be struck, and
// what worn piece rides on it.
export const SEVER_PARTS = {
  shoulder: { base: 'Shoulder', particles: ['Elbow', 'Hand'], bones: ['UpperArm', 'Forearm'], capsules: ['UpperArm', 'Forearm'], attach: 'hand', label: 'arm cut off at the shoulder' },
  elbow: { base: 'Elbow', particles: ['Hand'], bones: ['Forearm'], capsules: ['Forearm'], attach: 'hand', label: 'forearm cut off' },
  wrist: { base: 'Hand', particles: [], bones: [], capsules: [], attach: 'hand', label: 'hand cut off' },
  hip: { base: 'Hip', particles: ['Knee', 'Foot'], bones: ['Thigh', 'Shin', 'Foot'], capsules: ['Thigh', 'Shank'], attach: 'foot', label: 'leg cut off at the hip' },
  knee: { base: 'Knee', particles: ['Foot'], bones: ['Shin', 'Foot'], capsules: ['Shank'], attach: 'foot', label: 'leg cut off at the knee' },
  ankle: { base: 'Foot', particles: [], bones: ['Foot'], capsules: [], attach: 'foot', label: 'foot cut off' },
  neck: { base: 'neck', particles: ['head'], bones: ['head'], capsules: ['head'], attach: 'head', label: 'beheaded' },
};
const JOINT_AT_START = { UpperArm: 'shoulder', Forearm: 'elbow', Thigh: 'hip', Shank: 'knee' };
const JOINT_AT_END = { UpperArm: 'elbow', Forearm: 'wrist', Thigh: 'knee', Shank: 'ankle' };

/** The joint a cut lands at, if it is near one: { joint, side } or null. */
function jointAt(defender, capsule, t, contactPoint) {
  if (capsule.key === 'head') {
    const head = point(defender.x, P.head);
    return contactPoint[1] < head[1] - 0.25 * defender.body.lengths.headRadius ? { joint: 'neck', side: '' } : null;
  }
  const segment = capsule.key.slice(1);
  if (t < BLADES.zone && JOINT_AT_START[segment]) return { joint: JOINT_AT_START[segment], side: capsule.key[0] };
  if (t > 1 - BLADES.zone && JOINT_AT_END[segment]) return { joint: JOINT_AT_END[segment], side: capsule.key[0] };
  return null;
}

/** Joules of cut it takes to go through this joint of this body: more for a thicker limb. */
function severThreshold(defender, { joint, side }) {
  const [base, segment, typical] = BLADES.sever[joint];
  if (!segment) return base * BODY.toughness;
  const radius = defender.body.segments[`${side}${segment}`].skinRadius;
  return base * (radius / typical) ** 2 * BODY.toughness;
}

/** Into the chest or the head: where a deep stab kills. */
function vital(defender, capsule, contactPoint) {
  if (capsule.key === 'head') return true;
  if (capsule.key !== 'trunk') return false;
  const pelvis = point(defender.x, P.pelvis);
  const neck = point(defender.x, P.neck);
  const along = vec.dot(vec.sub(contactPoint, pelvis), vec.normalize(vec.sub(neck, pelvis))) / vec.length(vec.sub(neck, pelvis));
  return along > 0.45;
}

export function wound(defender, kind, joules, key, attacker) {
  const zone = key === 'head' ? 'head' : key === 'trunk' ? 'trunk' : 'limb';
  const rate = joules * BLADES.bleedPerJoule[kind] * BLADES.bleedZone[zone];
  defender.bleed = (defender.bleed ?? 0) + rate;
  defender.bleedOutside = (defender.bleedOutside ?? 0) + rate;
  defender.lastWoundedBy = attacker.id;
}

/**
 * Cut through at a joint: the part beyond comes away as a loose piece with
 * the blade's push in it, the stump bleeds hard, and the fight is over for
 * this man.
 */
function sever(world, defender, where, event, bladeVelocity) {
  const part = SEVER_PARTS[where.joint];
  const name = (piece) => (where.joint === 'neck' ? piece : `${where.side}${piece}`);
  defender.severed ??= [];
  if (defender.severed.some((done) => done.side === where.side && done.joint === where.joint)) return;
  defender.severed.push({ joint: where.joint, side: where.side });
  if (where.side === 'l' && ['wrist', 'elbow', 'shoulder'].includes(where.joint)) dropShield(world, defender, 'dropped');
  defender.severedCapsules ??= new Set();
  for (const capsule of part.capsules) defender.severedCapsules.add(name(capsule));
  const members = part.particles.length ? part.particles.map((piece) => P[name(piece)]) : [P[name(part.base)]];
  for (const index of part.particles.map((piece) => P[name(piece)])) defender.limp.add(index);
  const base = point(defender.x, P[name(part.base)]);
  const memberPoints = members.map((index) => point(defender.x, index));
  const centre = vec.scale(memberPoints.reduce((sum, p) => vec.add(sum, p), part.particles.length ? base : [0, 0, 0]), 1 / (memberPoints.length + (part.particles.length ? 1 : 0)));
  const far = memberPoints.at(-1);
  const axis = vec.length(vec.sub(far, base)) > 1e-4 ? vec.normalize(vec.sub(far, base)) : [0, -1, 0];
  const velocity = vec.add(vec.scale(members.reduce((sum, index) => vec.add(sum, point(defender.v, index)), [0, 0, 0]), 1 / members.length), vec.scale(bladeVelocity, 0.3));
  const random = world.random;
  const segmentKey = part.capsules[0] ? name(part.capsules[0]) : null;
  const radius = where.joint === 'neck' ? defender.body.lengths.headRadius : segmentKey ? defender.body.segments[segmentKey].skinRadius : 0.04;
  const spin = vec.add(vec.scale(vec.cross(vec.normalize(bladeVelocity), axis), 6 + random() * 6), [random() - 0.5, random() - 0.5, random() - 0.5]);
  const debris = {
    id: world.debris.length, kind: 'piece', owner: defender.id, joint: where.joint, side: where.side, x: centre, v: velocity,
    q: [0, 0, 0, 1], spin, radius, axis, half: Math.max(radius, vec.length(vec.sub(far, base)) / 2), cut: vec.sub(base, centre), origin: centre, resting: false,
  };
  world.debris.push(debris);
  defender.bleed = (defender.bleed ?? 0) + 0.06;
  defender.bleedOutside = (defender.bleedOutside ?? 0) + 0.06;
  event.severed = where.joint;
  world.events.push({ time: world.time, kind: 'severed', fighter: defender.id, attacker: event.attacker, joint: where.joint, side: where.side, debris: debris.id, point: base, effects: [part.label] });
  knockOut(world, defender, event, `${part.label}: cannot go on`, 'out');
}

/**
 * A weapon lands. The physics is any strike's: an impulse between the
 * effective mass of weapon and arm at the point of contact and the part
 * struck, the push and recoil from it. The harm splits by what the contact
 * was — blunt, cut (edge across), pierce (point first) — and the armour
 * answers each its own way; plate turns a blade aside. Returns whether it
 * cut through (the blade then carries on).
 */
function registerWeaponImpact(world, attacker, defender, striker, closest, capsule, normal, time) {
  const punch = attacker.punch;
  const weapon = attacker.weapon;
  if (!punch || punch.spec.path !== 'blade' || !weapon?.held) return false;
  const spec = punch.spec;
  if (punch.load > 0 || punch.t < spec.windup || punch.t > spec.extendUntil + 0.06) return false;
  punch.hits ??= new Set();
  // A sweep carries on through what it cuts, but not through a shield or a blade that stopped it.
  if (punch.stopped || punch.hits.has(defender.id) || (punch.landed && !spec.sweep)) return false;
  const wspec = weapon.spec;
  const main = P[`${weapon.main}Hand`];
  const distance = wspec.strikeFrom + closest.s * (wspec.length - wspec.strikeFrom);
  const bladeVelocity = vec.lerp(handVelocityOf(attacker, main), weapon.tipVelocity, distance / wspec.length);
  const struckVelocity = vec.lerp(point(defender.v, capsule.a), point(defender.v, capsule.b), closest.t);
  const relative = vec.sub(bladeVelocity, struckVelocity);
  const closing = -vec.dot(relative, normal);
  if (closing < WORLD.minImpactSpeed) return false;
  punch.hits.add(defender.id);
  punch.landed = true;

  const body = defender.body;
  const limbs = attacker.body.limbKg;
  const arms = limbs[`${weapon.main}Arm`] + (weapon.twoHanded ? limbs[`${weapon.off}Arm`] : 0);
  const armMass = ((spec.mass.arm ?? 0) * arms + (spec.mass.body ?? 0) * attacker.body.massKg) * attacker.body.technique * (punch.heavy ? WORLD.heavy.massFactor : 1) * staggerShare(attacker, WORLD.stagger.harm);
  const speed = vec.length(relative);
  const along = speed > 1e-6 ? Math.abs(vec.dot(relative, weapon.dir)) / speed : 0;
  const armLength = attacker.body.lengths.upperArm + attacker.body.lengths.forearmToFist;
  const strikeMass = effectiveMassAt(wspec, armMass, distance, armLength, along);
  const struckMass = struckMassOf(defender, capsule);
  const reducedMass = (strikeMass * struckMass) / (strikeMass + struckMass);
  const impulse = reducedMass * closing * (1 + WORLD.restitution);
  // The energy the collision takes up: what an edge or a point spends going in.
  const energy = 0.5 * reducedMass * closing * closing;
  const mix = harmMix(wspec, spec.mode, along, closest.s);
  const covered = protectionAt(body.gear, capsule.key);
  // Into a gap in rigid armour (BLADES.gaps): only what is under it, and no glance.
  const gaps = body.gear.gaps ? { ...BLADES.gaps, ...body.gear.gaps } : BLADES.gaps;
  // (A full plate harness has no gap for an edge: `cutProof`.)
  const gapChance = spec.mode === 'thrust' ? gaps.thrust : body.gear.cutProof ? 0 : gaps.swing;
  const intoGap = (covered.cut ?? 0) >= gaps.rigidFrom && mix.cut + mix.pierce > 0.2 && world.random() < gapChance * attacker.body.technique;
  const protection = intoGap ? { ...gaps.under, deflects: false } : covered;
  const firmness = body.segments[capsule.key === 'head' ? 'head' : capsule.key === 'trunk' ? 'trunk' : capsule.key].fleshFirmness;
  const peakForce = ((Math.PI / 2) * impulse) / (wspec.contactSeconds * (1 + 0.6 * (1 - firmness)));
  const contactPoint = vec.add(closest.onSecond, vec.scale(normal, capsule.radius));
  const blocked = BLOCKING.has(capsule.key);
  // A heavy hard head drives part of its blow through armour (`crush`).
  const bluntShare = mix.blunt * (1 - (protection.blunt ?? 0) * (1 - (wspec.crush ?? 0)));
  // A brittle edge (obsidian) cuts only as well as it is still sharp.
  const sharp = weapon.edge ?? 1;
  const cut = energy * mix.cut * (1 - (protection.cut ?? 0)) * sharp;
  const pierce = energy * mix.pierce * (1 - (protection.pierce ?? 0)) * sharp;
  const glanced = Boolean(protection.deflects) && mix.cut + mix.pierce > 0.2;
  // Glass on steel or hard armour chips.
  if (wspec.brittle && (protection.cut ?? 0) >= BLADES.chipsOn && mix.cut + mix.pierce > 0.2) chip(world, attacker);
  const event = {
    time: world.time, kind: blocked ? 'blocked' : 'landed', attacker: attacker.id, defender: defender.id, weapon: weapon.kind, mode: spec.mode,
    punch: punch.type, target: capsule.key, speed: closing, impulse, force: peakForce, headDeltaV: 0, effects: [],
    point: contactPoint, normal, harm: bluntShare, cut, pierce, energy, along, at: closest.s, strikeMass, bluntMix: mix.blunt,
    edgeShare: (mix.cut + mix.pierce) / Math.max(1e-6, mix.blunt + mix.cut + mix.pierce),
  };
  // A cut on the helmet takes what is fixed on it (a crest) away, whatever the helmet turns.
  if (capsule.key === 'head') cutOffHeadgear(world, defender, event, energy * mix.cut, contactPoint);
  const concentration = Math.sqrt(WORLD.contactSeconds / wspec.contactSeconds);
  bluntConsequences(world, attacker, defender, capsule, event, { impulse, struckMass, peakForce, harm: bluntShare, blocked, rotation: wspec.rotation, side: weapon.main, concentration });
  if (glanced) {
    // Off the plate: the blade is turned along it.
    const across = vec.sub(relative, vec.scale(normal, vec.dot(relative, normal)));
    if (vec.length(across) > 1e-6) world.pendingImpulses.push({ fighter: attacker, shares: [[main, 1]], direction: vec.normalize(across), impulse: impulse * BLADES.glanceShare });
    event.effects.push('glanced off the plate');
    world.events.push({ time: world.time, kind: 'glance', fighter: defender.id, point: contactPoint, normal });
  }
  if (intoGap) event.effects.push('into a gap in the armour');
  if (cut > 0.5) {
    wound(defender, 'cut', cut, capsule.key, attacker);
    addDamage(defender, capsule.key, cut / 6, false);
    event.effects.push(cut > 40 ? 'deep cut' : 'cut');
  }
  if (pierce > 0.5) {
    wound(defender, 'pierce', pierce, capsule.key, attacker);
    addDamage(defender, capsule.key, pierce / 4, false);
    event.effects.push(pierce > 25 ? 'run through' : 'stabbed');
  }
  let through = false;
  if (defender.state !== 'out') {
    const joint = cut > 0 ? jointAt(defender, capsule, closest.t, contactPoint) : null;
    if (joint && cut > severThreshold(defender, joint)) {
      sever(world, defender, joint, event, bladeVelocity);
      through = true;
    } else if (pierce > BLADES.lethalPierce * BODY.toughness && vital(defender, capsule, contactPoint)) {
      knockOut(world, defender, event, capsule.key === 'head' ? 'stabbed through the head' : 'stabbed through the heart', 'killed');
    }
  }
  if (defender.weapon?.held && capsule.key.startsWith(defender.weapon.main) && BLOCKING.has(capsule.key)) strainGrip(world, defender, impulse * BLADES.armHitShare, vec.scale(normal, -1));
  // Jarred by what it hit (least when it cut straight through).
  strainGrip(world, attacker, impulse * (through ? 0.05 : glanced ? 0.3 : 0.15));
  const recoil = [[main, 1], [P[`${weapon.main}Elbow`], 0.7], [P[`${weapon.main}Shoulder`], 0.35]];
  if (weapon.twoHanded) recoil.push([P[`${weapon.off}Hand`], 0.8]);
  pushBack(world, attacker, defender, capsule, closest, contactPoint, normal, impulse, bluntShare, blocked, spec, recoil, time, event, through ? 0.4 : 1);
  world.events.push(event);
  return through;
}

// What part of the striker a blade meets, by striker: the segment it cuts,
// and the joint it can take off near each end of the striker (a = start, b = end).
const BLADE_MEETS = {
  Hand: { segment: 'Forearm', at: 1, joint: 'wrist' },
  Elbow: { segment: 'Forearm', at: 0, joint: 'elbow' },
  Knee: { segment: 'Thigh', at: 1, joint: 'knee' },
};

/**
 * A fist, foot, elbow or knee runs into a blade held in its way. The strike
 * is stopped; how hard it drove in, against the blade and the arm behind
 * it, is the collision; an edge met across cuts as deep as that, and a hand
 * or foot driven onto it can come off. The blade's owner has fended it off.
 */
function registerBladeBlock(world, attacker, defender, striker, closest, away) {
  const weapon = defender.weapon;
  const punch = attacker.punch;
  const striking = punch && punch.spec.path !== 'blade' && punch.spec.limb === striker.key && !punch.landed && punch.t <= punch.spec.extendUntil + 0.06;
  const along = weapon.spec.strikeFrom + closest.t * (weapon.spec.length - weapon.spec.strikeFrom);
  const strikeVelocity = vec.lerp(point(attacker.v, striker.a), point(attacker.v, striker.b), closest.s);
  const bladeVelocity = vec.lerp(handVelocityOf(defender, P[`${weapon.main}Hand`]), weapon.tipVelocity, along / weapon.spec.length);
  const relative = vec.sub(strikeVelocity, bladeVelocity);
  const closing = -vec.dot(relative, away);
  if (closing < WORLD.minImpactSpeed) return;
  // Both fists, a forearm and a weapon can touch one blade in the same instant: that is one meeting, not several.
  const pairKey = `${defender.id}`;
  attacker.bladeMet ??= {};
  if (world.time - (attacker.bladeMet[pairKey] ?? -Infinity) < 0.15) return;
  attacker.bladeMet[pairKey] = world.time;
  const side = striker.side;
  const limbs = attacker.body.limbKg;
  const strikeMass = striking
    ? (punch.spec.mass.arm ?? 0) * limbs[`${side}Arm`] + (punch.spec.mass.leg ?? 0) * limbs[`${side}Leg`] + (punch.spec.mass.body ?? 0) * attacker.body.massKg
    : striker.shin ? limbs[`${side}Leg`] * 0.4 : limbs[`${side}Arm`] * 0.4;
  const armLength = defender.body.lengths.upperArm + defender.body.lengths.forearmToFist;
  const bladeMass = effectiveMassAt(weapon.spec, defender.body.limbKg[`${weapon.main}Arm`] * 0.6, along, armLength);
  const reduced = (strikeMass * bladeMass) / (strikeMass + bladeMass);
  const impulse = reduced * closing * (1 + WORLD.restitution);
  const energy = 0.5 * reduced * closing * closing;
  const speed = vec.length(relative);
  const mix = harmMix(weapon.spec, 'swing', speed > 1e-6 ? Math.abs(vec.dot(relative, weapon.dir)) / speed : 0, closest.t);
  // A padded glove takes some of an edge.
  const padded = striker.key.endsWith('Hand') && glovedFists(attacker.body.inputs) ? 0.6 : 1;
  const meets = striker.shin ? { segment: 'Shank', at: closest.s, joint: closest.s > 0.6 ? 'ankle' : 'knee' } : BLADE_MEETS[striker.key.slice(1)];
  const limbKey = `${side}${meets.segment}`;
  const cut = energy * mix.cut * padded * (1 - (protectionAt(attacker.body.gear, limbKey).cut ?? 0));
  const contactPoint = closest.onSecond;
  const event = {
    time: world.time, kind: 'bladeBlock', attacker: defender.id, defender: attacker.id, punch: punch?.type, target: limbKey, weapon: weapon.kind,
    speed: closing, impulse, force: 0, headDeltaV: 0, cut, pierce: 0, energy, effects: [], point: contactPoint, normal: vec.scale(away, -1),
  };
  if (striking) {
    punch.landed = true;
    punch.stopped = true;
    event.effects.push('fended off');
  }
  if (cut > 0.5) {
    wound(attacker, 'cut', cut, limbKey, defender);
    addDamage(attacker, limbKey, cut / 6, false);
    event.effects.push(cut > 25 ? 'deep cut' : 'cut');
    if (attacker.state !== 'out' && cut > severThreshold(attacker, { joint: meets.joint, side })) sever(world, attacker, { joint: meets.joint, side }, event, vec.scale(relative, -1));
  }
  const chain = striker.shin ? [[P[`${side}Foot`], 1], [P[`${side}Knee`], 0.7]] : (RECOIL[striker.key.slice(1)] ?? RECOIL.Hand).map(([part, share]) => [P[`${side}${part}`], share]);
  world.pendingImpulses.push({ fighter: attacker, shares: chain, direction: away, impulse });
  world.pendingImpulses.push({ fighter: defender, shares: [[P[`${weapon.main}Hand`], 1], [P[`${weapon.main}Elbow`], 0.6]], direction: vec.scale(away, -1), impulse });
  strainGrip(world, defender, impulse * 0.3);
  world.events.push(event);
}

/**
 * A strike meets a shield: stopped there. The momentum goes into the shield
 * arm and the body braced behind it; the arm takes a little of the harm.
 */
function registerShieldImpact(world, attacker, defender, striker, disc, hit, away) {
  const punch = attacker.punch;
  const weaponStrike = striker.weapon && punch?.spec.path === 'blade';
  if (!punch || punch.landed || (!striker.weapon && punch.spec.path === 'blade') || (!weaponStrike && punch.spec.limb !== striker.key) || punch.t > punch.spec.extendUntil + 0.06 || (weaponStrike && punch.t < punch.spec.windup)) return;
  // Obsidian on a steel shield chips.
  if (weaponStrike && defender.shield?.spec.look === 'steel') chip(world, attacker);
  const spec = punch.spec;
  let strikeVelocity;
  let strikeMass;
  if (striker.weapon) {
    const weapon = attacker.weapon;
    const distance = weapon.spec.strikeFrom + hit.along * (weapon.spec.length - weapon.spec.strikeFrom);
    strikeVelocity = vec.lerp(handVelocityOf(attacker, P[`${weapon.main}Hand`]), weapon.tipVelocity, distance / weapon.spec.length);
    const arms = attacker.body.limbKg[`${weapon.main}Arm`] + (weapon.twoHanded ? attacker.body.limbKg[`${weapon.off}Arm`] : 0);
    const armMass = ((spec.mass.arm ?? 0) * arms + (spec.mass.body ?? 0) * attacker.body.massKg) * attacker.body.technique * (punch.heavy ? WORLD.heavy.massFactor : 1) * staggerShare(attacker, WORLD.stagger.harm);
    const moving = vec.sub(strikeVelocity, point(defender.v, P.lHand));
    const speed = vec.length(moving);
    const along = speed > 1e-6 ? Math.abs(vec.dot(moving, weapon.dir)) / speed : 0;
    strikeMass = effectiveMassAt(weapon.spec, armMass, distance, attacker.body.lengths.upperArm + attacker.body.lengths.forearmToFist, along);
  } else {
    strikeVelocity = vec.lerp(point(attacker.v, striker.a), point(attacker.v, striker.b), hit.along);
    const side = striker.side;
    strikeMass = (spec.mass.arm ?? 0) * attacker.body.limbKg[`${side}Arm`] + (spec.mass.leg ?? 0) * attacker.body.limbKg[`${side}Leg`] + (spec.mass.body ?? 0) * attacker.body.massKg;
  }
  const closing = -vec.dot(vec.sub(strikeVelocity, point(defender.v, P.lHand)), away);
  if (closing < WORLD.minImpactSpeed) return;
  punch.landed = true;
  punch.stopped = true;
  const body = defender.body;
  const braced = defender.shield.spec.mass + body.segments.lForearm.mass + body.segments.lUpperArm.mass + body.massKg * 0.3;
  const reduced = (strikeMass * braced) / (strikeMass + braced);
  const impulse = reduced * closing * (1 + WORLD.restitution);
  addDamage(defender, 'lForearm', (impulse / braced) * defender.shield.spec.armHarm, true);
  attacker.stats.blocked += 1;
  const event = {
    time: world.time, kind: 'blocked', attacker: attacker.id, defender: defender.id, punch: punch.type, target: 'shield', speed: closing, impulse, force: 0, headDeltaV: 0,
    effects: ['taken on the shield'], point: hit.point, normal: away, weapon: attacker.weapon?.held && striker.weapon ? attacker.weapon.kind : undefined,
  };
  world.pendingImpulses.push({ fighter: defender, shares: [[P.lHand, 1], [P.lElbow, 0.8], [P.lShoulder, 0.5], [P.neck, 0.3], [P.pelvis, 0.2]], direction: vec.scale(away, -1), impulse });
  const recoil = striker.weapon ? [[P[`${attacker.weapon.main}Hand`], 1], [P[`${attacker.weapon.main}Elbow`], 0.6]] : (RECOIL[spec.limb.slice(1)] ?? RECOIL.Hand).map(([part, share]) => [P[`${striker.side}${part}`], share]);
  world.pendingImpulses.push({ fighter: attacker, shares: recoil, direction: away, impulse });
  if (striker.weapon) strainGrip(world, attacker, impulse * 0.25);
  world.events.push(event);
  if (striker.weapon) world.events.push({ time: world.time, kind: 'clash', fighter: defender.id, point: hit.point, normal: away, impulse });
  // A blow past what his grip can hold may tear the shield off his arm.
  const grip = WORLD.shield.wrench * (body.motorForce[P.lHand] / WORLD.recoil.reference);
  if (impulse > grip && world.random() < Math.min(1, (impulse / grip - 1) * WORLD.shield.wrenchRise)) {
    const shieldMass = defender.shield.spec.mass;
    dropShield(world, defender, 'wrenched', vec.scale(away, (-impulse * 0.3) / shieldMass));
  }
}

/**
 * Two weapons meet. They cannot pass through each other; met hard enough,
 * they bang apart, each strike stopped where it was, each grip jarred.
 */
function clashWeapons(world, first, second) {
  const a = first.weapon;
  const b = second.weapon;
  // Glass against steel: the brittle one chips at each clash.
  const chipOnSteel = () => {
    if (a.spec.brittle && !b.spec.brittle) chip(world, first);
    if (b.spec.brittle && !a.spec.brittle) chip(world, second);
  };
  const ends = (fighter, weapon) => {
    const hand = point(fighter.x, P[`${weapon.main}Hand`]);
    return [vec.add(hand, vec.scale(weapon.dir, weapon.spec.strikeFrom * 0.5)), weapon.tip];
  };
  const [a1, a2] = ends(first, a);
  const [b1, b2] = ends(second, b);
  const closest = closestBetween(a1, a2, b1, b2);
  const offset = vec.sub(closest.onFirst, closest.onSecond);
  const distance = vec.length(offset);
  const reach = a.spec.radius + b.spec.radius;
  const key = `${first.id}:${second.id}`;
  if (distance >= reach || distance < 1e-9) {
    world.clashing.delete(key);
    return;
  }
  const normal = vec.scale(offset, 1 / distance);
  const at = (fighter, weapon, s) => {
    const along = (weapon.spec.strikeFrom * 0.5 + s * (weapon.spec.length - weapon.spec.strikeFrom * 0.5));
    return { along, velocity: vec.lerp(handVelocityOf(fighter, P[`${weapon.main}Hand`]), weapon.tipVelocity, along / weapon.spec.length) };
  };
  const one = at(first, a, closest.s);
  const two = at(second, b, closest.t);
  // Apart, shared by the hands' inverse masses.
  const mainA = P[`${a.main}Hand`];
  const mainB = P[`${b.main}Hand`];
  const wA = first.invMass[mainA];
  const wB = second.invMass[mainB];
  const penetration = Math.min(reach - distance, WORLD.contactStep);
  for (let axis = 0; axis < 3; axis += 1) {
    first.x[mainA * 3 + axis] += normal[axis] * penetration * (wA / (wA + wB));
    second.x[mainB * 3 + axis] -= normal[axis] * penetration * (wB / (wA + wB));
  }
  const closing = -vec.dot(vec.sub(one.velocity, two.velocity), normal);
  if (world.clashing.has(key) || closing < BLADES.clashSpeed) return;
  world.clashing.add(key);
  const massA = effectiveMassAt(a.spec, first.body.limbKg[`${a.main}Arm`] * 0.6, one.along, first.body.lengths.upperArm + first.body.lengths.forearmToFist);
  const massB = effectiveMassAt(b.spec, second.body.limbKg[`${b.main}Arm`] * 0.6, two.along, second.body.lengths.upperArm + second.body.lengths.forearmToFist);
  const impulse = ((massA * massB) / (massA + massB)) * closing * (1 + BLADES.clashRestitution);
  world.pendingImpulses.push({ fighter: first, shares: [[mainA, 1], [P[`${a.main}Elbow`], 0.5]], direction: normal, impulse });
  world.pendingImpulses.push({ fighter: second, shares: [[mainB, 1], [P[`${b.main}Elbow`], 0.5]], direction: vec.scale(normal, -1), impulse });
  for (const fighter of [first, second]) {
    if (fighter.punch?.spec.path !== 'blade') continue;
    fighter.punch.landed = true;
    fighter.punch.stopped = true;
  }
  world.events.push({ time: world.time, kind: 'clash', fighter: first.id, other: second.id, point: vec.lerp(closest.onFirst, closest.onSecond, 0.5), normal, impulse, effects: ['blades meet'] });
  chipOnSteel();
  strainGrip(world, first, impulse, normal);
  strainGrip(world, second, impulse, vec.scale(normal, -1));
}

/** Loose things — dropped weapons, severed parts — fall, tumble, bounce and come to rest lying flat. */
function moveDebris(world, dt) {
  const spec = WORLD.props;
  for (const piece of world.debris) {
    if (piece.resting || piece.taken) continue;
    piece.v[1] -= WORLD.gravity * dt;
    piece.x = vec.add(piece.x, vec.scale(piece.v, dt));
    const rate = vec.length(piece.spin);
    if (rate > 1e-6) {
      const half = (rate * dt) / 2;
      const k = vec.scale(piece.spin, Math.sin(half) / rate);
      piece.q = quatMultiply([k[0], k[1], k[2], Math.cos(half)], piece.q);
      const length = Math.hypot(...piece.q);
      piece.q = piece.q.map((value) => value / length);
    }
    const axis = quatRotate(piece.q, piece.axis);
    // A rod's lowest point is an end; a plate's (a shield) the rim, as far down as its face allows.
    const lowest = piece.plate
      ? piece.x[1] - piece.radius * Math.sqrt(Math.max(0, 1 - axis[1] * axis[1])) - piece.half * Math.abs(axis[1])
      : Math.min(piece.x[1] + axis[1] * piece.half, piece.x[1] - axis[1] * piece.half) - piece.radius;
    if (lowest < 0 && piece.plate) {
      piece.x[1] -= lowest;
      piece.v = [piece.v[0] * spec.slide, Math.abs(piece.v[1]) * spec.restitution * 0.5, piece.v[2] * spec.slide];
      piece.spin = vec.scale(piece.spin, spec.slide);
      // On its rim it falls over onto its face or its back, whichever it leans to.
      const down = axis[1] >= 0 ? [0, 1, 0] : [0, -1, 0];
      piece.q = quatMultiply(quatFromTo(axis, vec.normalize(vec.lerp(axis, down, 0.3))), piece.q);
      if (Math.abs(piece.v[1]) < 0.35 && Math.hypot(piece.v[0], piece.v[2]) < 0.15) {
        piece.q = quatMultiply(quatFromTo(quatRotate(piece.q, piece.axis), down), piece.q);
        piece.x[1] = piece.half;
        piece.resting = true;
      }
    } else if (lowest < 0) {
      piece.x[1] -= lowest;
      piece.v = [piece.v[0] * spec.slide, Math.abs(piece.v[1]) * spec.restitution, piece.v[2] * spec.slide];
      piece.spin = vec.scale(piece.spin, spec.slide);
      // On the floor it topples flat.
      piece.q = quatMultiply(quatFromTo(axis, vec.normalize(vec.lerp(axis, flatOf(axis), 0.35))), piece.q);
      if (Math.abs(piece.v[1]) < 0.35 && Math.hypot(piece.v[0], piece.v[2]) < 0.15) {
        piece.q = quatMultiply(quatFromTo(axis, flatOf(axis)), piece.q);
        piece.x[1] = piece.radius;
        piece.resting = true;
      }
    }
    const { halfX, halfZ } = world.arena;
    for (const [index, limit] of [[0, halfX + 0.3], [2, halfZ + 0.3]]) {
      if (Math.abs(piece.x[index]) > limit) {
        piece.x[index] = Math.sign(piece.x[index]) * limit;
        piece.v[index] *= -spec.restitution;
      }
    }
  }
}

function flatOf(axis) {
  const flat = [axis[0], 0, axis[2]];
  return vec.length(flat) > 1e-4 ? vec.normalize(flat) : [1, 0, 0];
}

/** Strike one particle of a fighter as a landed blow would: impulse, then a reflex delay. */
export function hitParticle(world, fighter, index, direction, impulse) {
  deliverImpulse({ fighter, shares: [[index, 1]], direction: vec.normalize(direction), impulse });
  fighter.hitAt[index] = world.time;
}

/**
 * Give `impulse` (N·s) along `direction` to a set of particles, weighted by
 * share: each moves with the same velocity change scaled by its share, and
 * the momentum added sums to exactly the impulse.
 */
export function deliverImpulse({ fighter, shares, direction, impulse, braced = 0, massShare = WORLD.balance.massShare, holding = false }) {
  fighter.stillFor = 0;
  let weightedMass = 0;
  for (const [index, share] of shares) weightedMass += share * fighter.body.masses[index];
  if (weightedMass <= 0) return;
  // A hold presses and pulls a man who is already down: it moves him, but it
  // is no knock his legs must take.
  if (holding) {
    for (const [index, share] of shares) {
      const deltaV = (impulse * share) / weightedMass;
      for (let axis = 0; axis < 3; axis += 1) fighter.v[index * 3 + axis] += direction[axis] * deltaV;
    }
    return;
  }
  // The trunk's share of the push, as a velocity of the whole body: the
  // feet are planted, so all of the body's mass resists being moved.
  const trunkShare = shares.filter(([index]) => TRUNK_PARTICLES.includes(index)).reduce((sum, [index, share]) => sum + share * fighter.body.masses[index], 0);
  if (trunkShare > 0) {
    const bodyDeltaV = Math.max(0, (impulse * (trunkShare / weightedMass)) / (fighter.body.massKg * massShare) - braced);
    for (let axis = 0; axis < 3; axis += 1) fighter.knock[axis] += direction[axis] * bodyDeltaV;
  }
  for (const [index, share] of shares) {
    const deltaV = (impulse * share) / weightedMass;
    for (let axis = 0; axis < 3; axis += 1) fighter.v[index * 3 + axis] += direction[axis] * deltaV;
  }
}

export function applyHeadDamage(world, defender, event) {
  const body = defender.body;
  // The harm a helmet lets through, not the head's physical speed change.
  const deltaV = event.harmDeltaV ?? event.headDeltaV;
  // Brain strain grows faster than linearly with head speed change; small
  // touches add almost nothing, hard shots add a lot.
  defender.concussion += Math.max(0, deltaV - 1.2) ** 2;
  defender.stun = Math.max(defender.stun, WORLD.hurt.stunPerDeltaV * deltaV);
  const chin = chinNow(defender);
  const capacity = concussionCapacity(defender);
  if (defender.state === 'up' && deltaV > chin * WORLD.knockout.overChin) {
    knockOut(world, defender, event, `knocked out cold (head Δv ${(deltaV / chin).toFixed(1)}× the chin)`);
  } else if (defender.state === 'up' && (deltaV > chin || defender.concussion > capacity)) {
    // A clean shot on armour may only stagger; brain strain built up drops him regardless.
    if (!(deltaV > chin && staggerInstead(world, defender, deltaV / chin, event))) knockDown(world, defender, event, deltaV > chin ? 'knockdown (one clean shot)' : 'knockdown (accumulated)');
  } else stagger(world, defender, deltaV / chin, event);
}

// ---- Stagger ------------------------------------------------------------------

/** Whether a fighter's gear spreads blows enough to reel from them rather than drop. */
export function armoured(fighter) {
  return (fighter.body.gear.protection.blunt ?? 0) >= WORLD.stagger.armouredFrom;
}

/**
 * What remains while staggered: `floor` at the blow, back to 1 as it wears
 * off (1 when not staggered).
 */
export function staggerShare(fighter, floor) {
  if (!(fighter.stagger > 0)) return 1;
  return 1 - (1 - floor) * (fighter.stagger / fighter.staggerFor);
}

/**
 * Stagger an armoured fighter for a blow of `severity` (1 is what would put
 * him down). A harder blow while already reeling lengthens it. True if he reels.
 */
export function stagger(world, fighter, severity, event, anyone = false) {
  const spec = WORLD.stagger;
  if ((!anyone && !armoured(fighter)) || fighter.state !== 'up' || severity < spec.startAt) return false;
  const share = Math.min(1, (severity - spec.startAt) / (spec.overwhelm - spec.startAt));
  const seconds = spec.minSeconds + (spec.maxSeconds - spec.minSeconds) * share;
  if (seconds <= fighter.stagger) return true;
  const fresh = !(fighter.stagger > 0);
  fighter.stagger = seconds;
  fighter.staggerFor = seconds;
  if (fresh) {
    // Reeling: whatever he was throwing is gone, and he stumbles to catch his feet.
    fighter.punch = null;
    fighter.rush = null;
    fighter.stumbleUntil = world.time + spec.catchSeconds;
    world.events.push({ time: world.time, kind: 'staggered', fighter: fighter.id, seconds, effects: [`reeling for ${seconds.toFixed(0)} s`] });
  }
  event?.effects.push(`staggered (${seconds.toFixed(0)} s)`);
  return true;
}

/** A blow that would drop an armoured man staggers him instead, unless it is overwhelming or he already reels. */
function staggerInstead(world, fighter, severity, event) {
  if (!armoured(fighter) || fighter.stagger > 0 || severity >= WORLD.stagger.overwhelm) return false;
  return stagger(world, fighter, severity, event);
}

/**
 * How hard one fighter can hurt another, as a fighter sizing him up would
 * judge it: the head speed change of a good clean power shot (a cross, or a
 * head kick from a kicking style), over the defender's chin. Built from the
 * same strike mass, impact speed and head mass the impacts use; above 1, one
 * such shot drops him.
 */
export function strikeThreat(attacker, defender) {
  const body = attacker.body;
  const head = defender.body.headEffectiveMass;
  const landing = (mass, speed, rotation) => {
    const reduced = (mass * head) / (mass + head);
    return ((reduced * speed * (1 + WORLD.restitution)) / head) * rotation;
  };
  const technique = body.technique * (STYLES[attacker.style]?.technique ?? 1);
  const cross = landing((0.6 * body.limbKg.rArm + 0.012 * body.massKg) * technique, WORLD.threatSpeedShare * body.topSpeed[P.rHand], 1);
  const kicks = (STYLES[attacker.style]?.attacks.roundhouse ?? 0) > 0.1;
  const kick = kicks ? 0.45 * landing((0.55 * body.limbKg.rLeg + 0.025 * body.massKg) * technique, WORLD.threatSpeedShare * body.topSpeed[P.rFoot], 1.45) : 0;
  // A weapon in hand is a threat of another order: a cut or a stab ends it.
  const weapon = attacker.weapon?.held ? attacker.weapon.spec.threat : 1;
  return (Math.max(cross, kick) * weapon) / chinNow(defender);
}

/** How far a fighter's attacks reach: the arm, and whatever is in the hand. */
export function reachOf(fighter) {
  if (!fighter.weapon?.held) return fighter.body.reach;
  // A whip reaches with its thong.
  return fighter.body.reach + (fighter.weapon.spec.reach ?? fighter.weapon.spec.length * 0.75);
}

/** Total brain strain that puts this fighter down, given knockdowns so far. */
export function concussionCapacity(fighter) {
  return WORLD.concussionCapacity * fighter.body.chin * (1 + WORLD.concussionAfterKnockdown * fighter.knockdowns);
}

/** The head speed change (m/s) that drops this fighter now: less as the head is hurt and after each knockdown. */
export function chinNow(fighter) {
  const hurt = WORLD.hurt;
  return fighter.body.chin * (1 - hurt.chinPerHeadDamage * (fighter.damage.head ?? 0)) * Math.max(0.5, 1 - hurt.chinPerKnockdown * fighter.knockdowns);
}

/**
 * Damage to a body segment, 0 to 1: the speed each blow gave it, summed
 * against what that tissue takes before it is seriously hurt. Blocked blows
 * count for a little. The view reddens a segment as this rises.
 */
export function addDamage(fighter, key, deltaV, blocked) {
  const capacity = (WORLD.damageCapacity[key.replace(/^[lr](?=[A-Z])/, '')] ?? 20) * BODY.toughness;
  const share = (deltaV * (blocked ? WORLD.blockedDamageShare : 1)) / capacity;
  fighter.damage[key] = Math.min(1, (fighter.damage[key] ?? 0) + share);
  // The injury itself, uncapped (in the part's capacities): what breaks a limb or kills.
  fighter.trauma ??= {};
  fighter.trauma[key] = (fighter.trauma[key] ?? 0) + share;
  fighter.damageVersion += 1;
}

// The joint that goes when a segment is broken: the arm hangs from the elbow, the leg gives at the knee or hip.
const BREAKS_AT = { Forearm: 'Elbow', UpperArm: 'Elbow', Shank: 'Knee', Thigh: 'Hip' };

/**
 * Injury piled up past what a part can take: a limb breaks; the trunk or
 * the skull past the fatal mark, and he dies of it. Each happens once.
 */
function sufferInjuries(world, fighter) {
  const spec = WORLD.injury;
  const trauma = fighter.trauma;
  const credit = { time: world.time, kind: 'injuries', attacker: fighter.lastHitBy ?? fighter.lastWoundedBy ?? fighter.id, effects: [] };
  if ((trauma.trunk ?? 0) >= spec.trunkFatal) return knockOut(world, fighter, credit, 'died of his injuries', 'killed');
  if ((trauma.head ?? 0) >= spec.headFatal) return knockOut(world, fighter, credit, 'skull broken', 'killed');
  for (const [key, amount] of Object.entries(trauma)) {
    const segment = key.replace(/^[lr](?=[A-Z])/, '');
    const joint = BREAKS_AT[segment] && `${key[0]}${BREAKS_AT[segment]}`;
    if (joint && amount >= spec.limbBreak && !fighter.broken.has(joint)) breakJoint(world, fighter, joint);
  }
}

/** Leg damage (summed m/s) that makes a leg give way, for everyone's toughness. */
function legCapacity() {
  return WORLD.legCapacity * BODY.toughness;
}

/** How far gone his legs are, 0..1: the worse leg's damage against what gives way, and 1 if one is broken. */
export function legShare(fighter) {
  if (legBroken(fighter)) return 1;
  return Math.min(1, Math.max(fighter.legDamage.l, fighter.legDamage.r) / legCapacity());
}

/** Share of blood lost that collapses a man. */
export function collapseAt() {
  return BLADES.collapseAt * BODY.toughness;
}

/** Out on the spot: the bout is over, no count. */
export function knockOut(world, defender, event, reason, kind = 'knockout') {
  const standing = defender.state === 'up' || defender.state === 'rising';
  defender.state = 'out';
  dropWeapon(world, defender, 'dropped');
  dropShield(world, defender, 'dropped');
  // Finished off where he lay, he was already counted down.
  if (standing) defender.knockdowns += 1;
  defender.punch = null;
  defender.rush = null;
  defender.clinch = null;
  event.effects.push(reason);
  event.knockout = true;
  if (standing) world.fighters[event.attacker].stats.knockdownsScored += 1;
  world.events.push({ time: world.time, kind, fighter: defender.id, attacker: event.attacker, punch: event.punch, point: event.point, effects: [reason] });
}

/** Down, counted: the muscles let go and the count begins. */
function knockDown(world, defender, event, reason) {
  defender.state = 'down';
  defender.stagger = 0;
  shakenLoose(world, defender);
  defender.knockdowns += 1;
  defender.punch = null;
  defender.rush = null;
  defender.clinch = null;
  defender.downTimer = WORLD.downSecondsMin + world.random() * WORLD.downSecondsRange + defender.knockdowns;
  event.effects.push(reason);
  world.fighters[event.attacker].stats.knockdownsScored += 1;
}

function trackHandSpeed(fighter) {
  // Only the punch on its way in: after contact the glove's speed is rebound.
  if (!fighter.punch || fighter.punch.landed || fighter.punch.t > fighter.punch.spec.extendUntil) return;
  const hand = fighter.punch.limb;
  const speed = vec.length(point(fighter.v, hand));
  fighter.punch.peakSpeed = Math.max(fighter.punch.peakSpeed, speed);
  fighter.stats.lastHandSpeed = fighter.punch.peakSpeed;
  fighter.stats.maxHandSpeed = Math.max(fighter.stats.maxHandSpeed, speed);
}

/** The winning corner once the other has no fighter able to continue. */
export function boutWinner(world) {
  const alive = (corner) => world.fighters.some((fighter) => fighter.corner === corner && inFight(fighter));
  if (!alive('red')) return 'blue';
  if (!alive('blue')) return 'red';
  return null;
}
