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
import { BLADES, bulletRegion, SHIELDS, WEAPONS, bladeTargets, createWeapon, effectiveMassAt, guardTargets, handShares, harmMix, LEAD_GRIP, offHandAlong, behindShield, shieldContact, shieldReach, NET } from './weapons.js';
import { desiredPose, lockedHead, POSE, restPose, twoBoneIK, unleaned, vec, yawCos, yawRotate, yawSin } from './pose.js';
import { WORLD } from './physics/config.js';
import { limbTwist, swivelIntoRange, trunkAxes, turnAbout, twistExcess } from './joints.js';
import { aimTargets, CYLINDER_LOAD, drawBow, emptied, fire, flyArrows, LONG_GUN, raisedAim, reload, sightsOn, SUPPORT_GRIP } from './physics/ranged.js';
import { countPin, drive, holdClinch, holdPin, neckLow, pinnedBy, pinPoints, startPin } from './physics/grappling.js';
import { flyNets } from './physics/net.js';
import { beginRise, restedToRise, riseMargins, riseTarget, standWobble, supportLimit, updateRise } from './physics/rising.js';
import { bankOf, cornerPace, cornerShare, cornering, limpOf, pushOff, runChange, runLean, runSpeed, strideOf, turnRateMost } from './physics/gait.js';
import { awayFromEdges, ceilingAt, floorAt, pushOut } from './physics/terrain.js';
import { overdraftDepth, drawStamina, takeWind, fatigueScale, recoveryShare } from './physics/overdraft.js';
import { jumpBlocked, jumpLanding, jumpOf } from './physics/jump.js';
import { formUp, placeWings, WINGS } from './formation.js';
import { handling } from './handling.js';
import { painShare, stepWhips } from './physics/whip.js';
import { canRide } from './horses.js';
import { collideHorses, createHorse, goalFromFootwork, horseTimers, keepSeat, loseHorse, mountedBehind, riderFacing, ridingLean, saddleReach, seatMass, seatRider, stepHorse, strikeHorses } from './physics/mounted.js';
import { cutSeverity, limbStriker, particleAt, shieldCovering, soundDown, soundEvent, soundHit, soundStep, soundVoice, soundWound, trackSwing, weaponPart, weaponStriker } from './audio/log.js';
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
    state: 'up', motorScale: 1, stun: 0, stagger: 0, staggerFor: 0, dazed: 0, dazedFor: 0, downTimer: 0,
    stamina: 1, bank: 0, concussion: 0, knockdowns: 0, injuries: [],
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
    stats: { thrown: 0, landed: 0, blocked: 0, struckHorse: 0, maxHandSpeed: 0, lastHandSpeed: 0, knockdownsScored: 0 },
    contacts: new Set(),
    // What the fight adds later, named here (unset) so that every fighter has the
    // one shape: fighters that gain fields in their own order each get their own,
    // and the engine reading them all (a hundred men, a hundred shapes) slows to a crawl.
    shield: undefined, weapon: undefined, offWeapon: undefined, arena: undefined, slot: undefined, formation: undefined, inFront: undefined, wing: undefined,
    shieldPose: undefined, shieldOpen: undefined, strafe: undefined, running: undefined, aimAt: undefined, focus: undefined, goTo: undefined,
    nearestFoe: undefined, committed: undefined, heldAnnounced: undefined, pinClock: undefined, hurt: undefined, hurtFor: undefined,
    weave: undefined, carry: undefined, detail: undefined, capsuleCache: undefined, limitStep: undefined, reachBound: undefined,
    stillFor: undefined, outFor: undefined, atLimits: undefined, strain: undefined, trauma: undefined, lastHitBy: undefined, lastWoundedBy: undefined,
    bleed: undefined, bleedInside: undefined, bleedOutside: undefined, bloodLost: undefined, gunshot: undefined, swappedAt: undefined, relievedAt: undefined,
    loosed: undefined, reloading: undefined, pickup: undefined, pin: undefined, finisher: undefined, focusAny: undefined, rise: undefined, triedRise: undefined, riseBudget: undefined,
    restAt: undefined, restFor: undefined, temperament: undefined, seenPunch: undefined, reactAt: undefined, reacted: undefined,
    sidearmDrawn: undefined, bladeMet: undefined, severed: undefined, severedCapsules: undefined, stumbleUntil: undefined, pendingArm: undefined,
    mixFor: undefined, slipSide: undefined, crawling: undefined, crawlPhase: undefined, crawlTurn: undefined, wornStandard: undefined,
    panicked: undefined, panics: undefined, goneAt: undefined, calmFor: undefined, paired: undefined, couched: undefined, net: undefined, netted: undefined,
    aiOwed: undefined, aiEventCursor: undefined, aiPickupFor: undefined, aiConfidence: undefined, adrenaline: undefined, fear: undefined,
    aiRetargetAt: undefined, aiCombo: undefined, aiComboStep: undefined, aiComboZone: undefined, aiStrategy: undefined, aiStrategyFor: undefined,
    aiStrategySince: undefined, aiPressure: undefined, aiCadence: undefined, aiLastGap: undefined, aiLastHit: undefined, aiBurst: undefined,
    aiFelt: undefined, aiDealt: undefined, aiCrawlAge: undefined, aiCrawlTo: undefined, aiEscapeAge: undefined, aiEscape: undefined,
    aiFleeing: undefined, aiFleeSince: undefined, aiCharge: undefined,
    mount: undefined, lift: undefined, carrier: undefined, faceAt: undefined, handsDown: undefined, pain: undefined, cuts: undefined,
    // Level mode (terrain.js, levelmode/stage.js): dormant (his section is not active: he is not simulated, thought for or drawn), air (off the ground, falling), landedAt (the last hard landing), spawn (his post in the stage).
    dormant: undefined, air: undefined, landedAt: undefined, spawn: undefined,
    // A jump (physics/jump.js: startJump): jump (the one under way: { phase, t, ... }), jumpReadyAt (when he can jump again), jumpBody (his body's jump, cached),
    // jumpLandedAt (when he last came down from one: WORLD.jump.land.grace), landBruise ({ l, r }: the landing's bruise of his legDamage, healing).
    jump: undefined, jumpReadyAt: undefined, jumpBody: undefined, jumpLandedAt: undefined, landBruise: undefined,
    // Level mode (levelmode/level.js): hands at a wound while a bandage goes on ({ t, seconds }).
    tending: undefined,
    // The player's stamina overdraft (physics/overdraft.js): player (the man played), faintDue (a cost would pass the floor), fainted (down in a faint), blackout (the screen's black, 0..1), faintGrace (s after waking).
    player: undefined, faintDue: undefined, fainted: undefined, blackout: undefined, faintGrace: undefined,
    // Getting up (physics/rising.js): riseTries (failed tries since he was last up), floored (given up trying for now: out of the
    // fight until he rises), crawlWeak (crawling because he could not stand; he tries again at crawlRetryAt), wobble (unsteady
    // for a moment once up: { t, seconds, size }).
    riseTries: undefined, floored: undefined, crawlWeak: undefined, crawlRetryAt: undefined, wobble: undefined,
    // Running (physics/gait.js; everyone's run): runPose (the run's look, 0..1), runSlope (the slope under his run),
    // turn and yawWas (the heading's rate in a run), gaitBody (his body's gait, cached), gaitAlong and gaitAccel (his
    // speed along his way and its rate, for the lean). runMode is the player's sprint (control.js).
    // gaitCarry: running, or carried on from a run until braked to his footwork's pace.
    runMode: undefined, runPose: undefined, runSlope: undefined, turn: undefined, yawWas: undefined, gaitBody: undefined, gaitAlong: undefined, gaitAccel: undefined, gaitCarry: undefined,
    // limbCache: limbShares worked out this step.
    limbCache: undefined,
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
    fighter.shield = { kind: style.shield, spec, strain: undefined };
    addParticleMass(fighter, P.lHand, spec.mass * 0.6);
    addParticleMass(fighter, P.lElbow, spec.mass * 0.4);
  }
  if (style.net && !fighter.net) fighter.net = { held: true };
  if (!style.weapon) return;
  // A style may hold its weapon otherwise than it is made to be held (`grip`:
  // a katana in one hand, the other holding a second blade).
  const spec = gripSpec(style.weapon, style.grip);
  // Too heavy for him to hold out (handling.js): he fights without it.
  const handled = handling(fighter.body, spec);
  if (!handled.canHold) {
    fighter.cannotWield = style.weapon;
    // (Two blades too much for one hand: the one in both hands, if the style says.)
    const instead = style.offWeapon ? style.single : style.fallback;
    if (instead && instead !== styleKey) armFighter(fighter, instead, { random, shield: false });
    return;
  }
  const weapon = createWeapon(style.weapon);
  weapon.spec = spec;
  weapon.twoHanded = spec.hands !== 'one';
  weapon.handling = handled;
  const shares = handShares(weapon.spec);
  // A forearm weapon (`mounted`) weighs as part of the body already (its kit's mass).
  if (!weapon.spec.mounted) {
    addParticleMass(fighter, P[`${weapon.main}Hand`], weapon.spec.mass * shares.main);
    if (shares.off) addParticleMass(fighter, P[`${weapon.off}Hand`], weapon.spec.mass * shares.off);
  }
  const guard = guardTargets(style, fighter.body);
  weapon.dir = yawRotate(guard.dir, fighter.yaw);
  weapon.tip = vec.add(point(fighter.x, P[`${weapon.main}Hand`]), vec.scale(weapon.dir, weapon.spec.length));
  fighter.weapon = weapon;
  if (style.offWeapon && !fighter.offWeapon) armOffHand(fighter, style);
}

/** A weapon's spec as a style holds it: its own, or with `hands` as the style's `grip` says. */
function gripSpec(kind, grip) {
  const spec = WEAPONS[kind];
  return grip && grip !== spec.hands ? { ...spec, hands: grip } : spec;
}

/**
 * Two blades (a style's `offWeapon`): a second weapon in the off hand, held
 * and moved on its own (its own direction, spin and point), its weight in
 * that hand. It strikes, blocks, is jarred and is lost like the first. A kit
 * whose sidearm it is wears it drawn: there is no other to draw.
 */
function armOffHand(fighter, style) {
  const spec = WEAPONS[style.offWeapon];
  const handled = handling(fighter.body, spec);
  if (!handled.canHold) return;
  const weapon = createWeapon(style.offWeapon);
  weapon.main = 'l';
  weapon.off = 'r';
  weapon.twoHanded = false;
  weapon.handling = handled;
  addParticleMass(fighter, P.lHand, spec.mass);
  const guard = offGuardTargets(style, fighter.body);
  weapon.dir = yawRotate(guard.dir, fighter.yaw);
  weapon.tip = vec.add(point(fighter.x, P.lHand), vec.scale(weapon.dir, spec.length));
  fighter.offWeapon = weapon;
  if (fighter.body.gear?.sidearm === style.offWeapon) fighter.sidearmDrawn = true;
}

/** Where the off hand's blade rests in the guard (a style's `offGuard`, in heights, local). */
function offGuardTargets(style, body) {
  const guard = style.offGuard ?? { hand: [0.2, 0.6, 0.1], dir: [0.8, 0.6, 0] };
  return { hand: vec.scale(guard.hand, body.heightM), dir: vec.normalize(guard.dir) };
}

/** The blades in his hands, held: the weapon and the off hand's (two blades). */
export function heldBlades(fighter) {
  const main = fighter.weapon?.held ? fighter.weapon : null;
  const off = fighter.offWeapon?.held ? fighter.offWeapon : null;
  return off ? (main ? [main, off] : [off]) : main ? [main] : NO_BLADES;
}
const NO_BLADES = [];

/** The weapon a move is made with: the off hand's blade for a blade move of that hand, else the weapon. */
export function bladeFor(fighter, spec) {
  const off = fighter.offWeapon;
  return off?.held && spec?.path === 'blade' && spec.limb[0] === off.main ? off : fighter.weapon;
}

/**
 * The stroke a blade is making now, or null: the strike in flight if it is
 * that blade's, or the second blade's half of a two-bladed move (`with`).
 * Each carries its own time, aim, and what it has hit.
 */
export function strokeOf(fighter, weapon) {
  const punch = fighter.punch;
  if (!punch || punch.spec.path !== 'blade' || !weapon?.held) return null;
  if (bladeFor(fighter, punch.spec) === weapon) return punch;
  const second = punch.with;
  return second && bladeFor(fighter, second.spec) === weapon ? second : null;
}

/**
 * Let go of the weapon: it falls (or flies, knocked away) as a loose thing
 * on the floor, and the fighter fights on in the style that follows (a
 * hoplomachus draws his gladius; anyone else boxes).
 */
export function dropWeapon(world, fighter, reason, push = [0, 0, 0]) {
  const weapon = fighter.weapon;
  // A forearm weapon is the arm: it cannot be let go or knocked away.
  if (!weapon?.held || weapon.spec.mounted) {
    if (fighter.state === 'out') dropOffWeapon(world, fighter, reason);
    return;
  }
  releaseWeapon(world, fighter, reason, push);
  if (fighter.state === 'out') {
    dropOffWeapon(world, fighter, reason);
    return;
  }
  // Two blades, the long one gone: the short one is all he has, and it goes to his sword hand.
  if (fighter.offWeapon?.held) {
    changeHands(world, fighter);
    return;
  }
  rearm(world, fighter, weapon);
}

/**
 * The off hand's blade lost (knocked away, let fall, the hand cut off): it
 * falls as a loose thing; he fights on with the one he has, as the style
 * says for one blade (`single`: the katana in both hands again).
 */
export function dropOffWeapon(world, fighter, reason, push = [0, 0, 0]) {
  const weapon = fighter.offWeapon;
  if (!weapon?.held) return;
  releaseWeapon(world, fighter, reason, push, weapon);
  fighter.offWeapon = null;
  const single = STYLES[fighter.style]?.single;
  if (fighter.state === 'out' || !single || !fighter.weapon?.held) return;
  regrip(fighter, single);
}

/** Take up another style with the weapon already in hand, held as it holds it (its `grip`): the weight shared again between the hands. */
function regrip(fighter, styleKey) {
  const weapon = fighter.weapon;
  const before = handShares(weapon.spec);
  const spec = gripSpec(weapon.kind, STYLES[styleKey].grip);
  const after = handShares(spec);
  addParticleMass(fighter, P[`${weapon.main}Hand`], weapon.spec.mass * (after.main - before.main));
  addParticleMass(fighter, P[`${weapon.off}Hand`], weapon.spec.mass * (after.off - before.off));
  weapon.spec = spec;
  weapon.twoHanded = spec.hands !== 'one';
  weapon.handling = handling(fighter.body, spec);
  fighter.style = styleKey;
}

/**
 * The long blade lost with the short one still in his off hand: he takes it
 * into his sword hand (its weight goes with it) and fights in its style.
 */
function changeHands(world, fighter) {
  const off = fighter.offWeapon;
  addParticleMass(fighter, P[`${off.main}Hand`], -off.spec.mass);
  fighter.offWeapon = null;
  fighter.weapon = null;
  fighter.sidearmDrawn = true;
  if (fighter.punch && fighter.punch.spec.path === 'blade') fighter.punch = null;
  const next = styleForWeapon(off.kind) ?? 'mix';
  const effects = [`takes the ${off.spec.label.toLowerCase()} in his sword hand`];
  if (fighter.state === 'down') {
    fighter.style = next;
    fighter.pendingArm = next;
    return;
  }
  armFighter(fighter, next, { random: world.random, shield: false });
  if (fighter.weapon) {
    fighter.weapon.strain = off.strain;
    world.events.push({ time: world.time, kind: 'drew', fighter: fighter.id, weapon: fighter.weapon.kind, effects });
  }
}

/** The weapon (or the off hand's blade) leaves his hands and falls as a loose thing (no other drawn in its place). */
function releaseWeapon(world, fighter, reason, push, weapon = fighter.weapon) {
  if (weapon.spec.mounted) return;
  const second = weapon === fighter.offWeapon;
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
  // The stroke it was making ends; with two blades, only its own.
  if (!second && (fighter.punch?.spec.path === 'blade' || fighter.punch?.spec.path === 'aim')) fighter.punch = null;
  else if (second && fighter.punch) {
    if (fighter.punch.with && bladeFor(fighter, fighter.punch.with.spec) === weapon) fighter.punch.with = null;
    else if (bladeFor(fighter, fighter.punch.spec) === weapon) fighter.punch = null;
  }
  world.events.push({ time: world.time, kind: 'disarmed', fighter: fighter.id, weapon: weapon.kind, off: second || undefined, point: hand, effects: [reason === 'disarmed' ? `${spec.label} knocked away` : `${spec.label} dropped`] });
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
export function shakenLoose(world, fighter) {
  if (fighter.weapon?.held && world.random() < WORLD.weapons.dropOnFall) dropWeapon(world, fighter, 'dropped');
  if (fighter.offWeapon?.held && world.random() < WORLD.weapons.dropOnFall) dropOffWeapon(world, fighter, 'dropped');
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

/**
 * Take up another forearm weapon (a style whose weapon is `mounted`): the
 * one in use goes back to its arm, the other is in use at once (no draw: it
 * is the arm). Its weight is the body's either way.
 */
export function useMounted(world, fighter, styleKey) {
  if (fighter.weapon && !fighter.weapon.spec.mounted) return false;
  fighter.weapon = null;
  fighter.aimAt = undefined;
  armFighter(fighter, styleKey, { random: world.random, shield: false });
  fighter.mountedSince = fighter.stats.thrown;
  return true;
}

/** Which style a weapon picked up off the floor is fought in. */
export function styleForWeapon(kind) {
  return STYLE_KEYS_ALL.find((key) => STYLES[key].weapon === kind && !STYLES[key].hidden) ?? STYLE_KEYS_ALL.find((key) => STYLES[key].weapon === kind);
}
const STYLE_KEYS_ALL = Object.keys(STYLES);
const WEAPON_LABEL = (kind) => WEAPONS[kind].label.toLowerCase();

/** A blade in the hands (or the off hand's) leaves them without falling: its weight off the hands it rode on. */
function unloadBlade(fighter, weapon) {
  if (!weapon?.held || weapon.spec.mounted) return;
  const shares = handShares(weapon.spec);
  addParticleMass(fighter, P[`${weapon.main}Hand`], -weapon.spec.mass * shares.main);
  if (shares.off) addParticleMass(fighter, P[`${weapon.off}Hand`], -weapon.spec.mass * shares.off);
}

/** The same blade back in the hands. */
function reloadBlade(fighter, weapon) {
  if (!weapon?.held || weapon.spec.mounted) return;
  const shares = handShares(weapon.spec);
  addParticleMass(fighter, P[`${weapon.main}Hand`], weapon.spec.mass * shares.main);
  if (shares.off) addParticleMass(fighter, P[`${weapon.off}Hand`], weapon.spec.mass * shares.off);
}

/**
 * The finisher's dagger (finisher.js): `kind` goes into his sword hand, and what he held before is put by (kept, not dropped; its
 * weight comes off his hands) to be taken up again by `restoreAfterFinisher`. Returns what was put by, or null if he could not hold
 * the blade (nothing is changed then).
 */
export function drawForFinisher(world, fighter, kind) {
  const keep = { weapon: fighter.weapon, offWeapon: fighter.offWeapon, style: fighter.style, mixed: fighter.mixed, sidearmDrawn: fighter.sidearmDrawn };
  unloadBlade(fighter, fighter.weapon);
  unloadBlade(fighter, fighter.offWeapon);
  fighter.weapon = null;
  fighter.offWeapon = null;
  armFighter(fighter, styleForWeapon(kind), { random: world.random, shield: false });
  if (fighter.weapon?.held) return keep;
  restoreAfterFinisher(fighter, keep);
  return null;
}

/** The blade put by for the finisher, back in his hands; the finisher's own (if still in them) away. */
export function restoreAfterFinisher(fighter, keep) {
  if (fighter.weapon?.held) unloadBlade(fighter, fighter.weapon);
  fighter.weapon = keep.weapon;
  fighter.offWeapon = keep.offWeapon;
  fighter.style = keep.style;
  fighter.mixed = keep.mixed;
  fighter.sidearmDrawn = keep.sidearmDrawn;
  reloadBlade(fighter, fighter.weapon);
  reloadBlade(fighter, fighter.offWeapon);
}

/** Stoop for a weapon on the floor: he crouches and reaches for it. */
export function startPickup(world, fighter, debris, { swap = false } = {}) {
  // The standard is taken up whatever is in the hands: that is let fall.
  const standard = WEAPONS[debris.weapon]?.flag;
  // A shield is taken up on the other arm, whatever is in the hand.
  const shield = debris.kind === 'shield';
  // `swap` (level mode, looting a body): what he holds of that kind is let fall for it, as for a standard.
  if (shield && fighter.shield && !swap) return false;
  if (fighter.state !== 'up' || (fighter.weapon?.held && !standard && !shield && !swap) || fighter.punch || fighter.pickup || debris.taken || !debris.resting) return false;
  if (swap && shield && fighter.shield) dropShield(world, fighter, 'dropped');
  if (swap && !shield && !standard && fighter.weapon?.held) releaseWeapon(world, fighter, 'dropped', [0, 0, 0]);
  // Stooping for a standard, he lets go of what is in his hands first: a two-handed grip would keep the hand from it.
  if (standard && fighter.weapon?.held) releaseWeapon(world, fighter, 'dropped', [0, 0, 0]);
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
    fighter.shield = { kind: debris.shield, spec, strain: undefined };
    addParticleMass(fighter, P.lHand, spec.mass * 0.6);
    addParticleMass(fighter, P.lElbow, spec.mass * 0.4);
    world.events.push({ time: world.time, kind: 'pickup', fighter: fighter.id, effects: [`takes up the ${spec.label.toLowerCase()}`] });
    if (world.ear) soundEvent(world, 'mech', { at: debris.x, kind: 'pickup', state: 'open', id: `debris${pickup.debris}` });
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
  // Heard: a weapon taken up off the floor (its `state` says only that it is done).
  if (world.ear) soundEvent(world, 'mech', { at: debris.x, kind: 'pickup', state: 'open', id: `debris${pickup.debris}` });
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

/** A blow jars the grip (of the weapon, or of the off hand's blade); strained past what the hand can hold, it goes. */
export function strainGrip(world, fighter, impulse, push = [0, 0, 0], weapon = fighter.weapon) {
  if (!weapon?.held || impulse <= 0) return;
  // A long lever off the hands is easier to tear away (`grip` < 1).
  weapon.strain += impulse / (BLADES.gripImpulsePerNewton * (weapon.spec.grip ?? 1) * fighter.body.strikeForce[P[`${weapon.main}Hand`]]);
  if (weapon.strain < 1) return;
  if (weapon === fighter.offWeapon) dropOffWeapon(world, fighter, 'disarmed', push);
  else dropWeapon(world, fighter, 'disarmed', push);
}

/** The weapon's targets for this frame: guard, block or the move in flight, and how many hands hold it. */
/**
 * A block that goes to meet the strike: the blade set across the line from
 * the strike to what it aims at, halfway along it, the edge towards it —
 * a fist or a shin that comes on runs into the edge. Tracks the strike as
 * it comes. Null if there is nothing to meet.
 */
function interceptBlock(world, fighter, weapon = fighter.weapon) {
  const attacker = world.fighters[fighter.defence?.from];
  const punch = attacker?.punch;
  if (!punch) return null;
  // The blade coming (with two, the one the strike is made with).
  const coming = punch.spec.path === 'blade' ? bladeFor(attacker, punch.spec) : null;
  const threat = coming?.held
    ? vec.add(point(attacker.x, P[`${coming.main}Hand`]), vec.scale(coming.dir, coming.spec.length * 0.7))
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
  // The off hand's blade is held from its own side: the hand on the left of the line.
  if (weapon === fighter.offWeapon) across = vec.scale(across, -1);
  across = vec.normalize(vec.add(vec.normalize(across), [0, 0.6, 0]));
  const hand = vec.sub(meet, vec.scale(across, weapon.spec.length * (weapon === fighter.offWeapon ? WORLD.offMeetAlong : WORLD.meetAlong)));
  return { hand: toLocal(fighter, hand), dir: yawRotate(across, -fighter.yaw) };
}

/**
 * A long point (WORLD.longPoint) coming at a man: true for a couched lance,
 * or a thrust with a weapon that long.
 */
export function longPoint(striker, punch) {
  if (!punch) return false;
  if (punch.spec.couched) return true;
  if (punch.spec.mode !== 'thrust' || punch.spec.path !== 'blade') return false;
  const blade = bladeFor(striker, punch.spec);
  return Boolean(blade?.held) && blade.spec.length + blade.spec.handle >= WORLD.longPoint;
}

/** Where (local) the shield hand goes to put the shield on a long point's line, held out as far as a block: null for any other strike. */
function shieldOnLine(world, fighter, guard) {
  const attacker = world.fighters[fighter.defence?.from];
  const punch = attacker?.punch;
  if (!longPoint(attacker, punch)) return null;
  const blade = bladeFor(attacker, punch.spec);
  const mine = punch.zone === 'head' ? point(fighter.x, P.head) : vec.lerp(point(fighter.x, P.pelvis), point(fighter.x, P.neck), 0.6);
  const line = vec.sub(blade.tip, mine);
  if (vec.length(line) < 1e-3) return null;
  return toLocal(fighter, vec.add(mine, vec.scale(vec.normalize(line), (guard[0] + 0.1) * fighter.body.heightM)));
}

/**
 * How a weapon is carried in a run (WORLD.runMode.carry): 'waist' (a short one, in one hand at the side of the waist),
 * 'pole' (a spear or polearm, at the ready, forward and up) or 'shoulder' (a long gun, a flag, a long bow, a heavy two-hander).
 */
export function carryKind(spec) {
  const carry = WORLD.runMode.carry;
  const overall = spec.length + (spec.handle ?? 0);
  if (spec.flag || spec.longGun) return 'shoulder';
  if (spec.bow) return overall > carry.bowFrom ? 'shoulder' : 'waist';
  if ((spec.leadAhead || overall > carry.poleFrom) && !spec.ranged) return 'pole';
  if (spec.hands === 'one') return 'waist';
  return overall <= carry.small.length && spec.mass <= carry.small.mass ? 'waist' : 'shoulder';
}

/**
 * Running (`fighter.runPose`, 0 to 1): the weapon is carried, not held ready. `target` (where the guard has it) is eased to the
 * carry (carryKind): a short weapon at the side of his waist, the blade down along the thigh; a spear at the ready, forward and
 * up; a long gun or a flag up on the shoulder.
 */
function carriedTargets(fighter, weapon, target) {
  const spec = WORLD.runMode.carry;
  const kind = carryKind(weapon.spec);
  const side = weapon.main === 'l' ? 1 : -1;
  const H = fighter.body.heightM;
  let hand;
  let dir;
  if (kind === 'waist') {
    // (In a hand that swings a little with the stride, the blade a little with it.)
    hand = runHand(fighter, 'weapon', weapon.main);
    const swing = side * runGait(fighter).swing * WORLD.runMode.arms.tilt * spec.waist.swing;
    dir = [spec.dir[0] - swing, spec.dir[1], side * spec.dir[2]];
  } else if (kind === 'pole') {
    // (From his shoulder, in his trunk's frame: as he leans into the run, the spear goes with him.)
    const { shoulder, spine, front } = runTrunk(fighter, weapon.main);
    const [forward, down, inward] = spec.pole.hand;
    hand = vec.add(vec.add(shoulder, vec.scale(front, forward * H)), vec.add(vec.scale(spine, -down * H), [0, 0, -side * inward * H]));
    dir = [spec.pole.dir[0], spec.pole.dir[1], side * spec.pole.dir[2]];
  } else {
    hand = [spec.longHand[0] * H, spec.longHand[1] * H, side * spec.longHand[2] * H];
    dir = spec.longDir;
  }
  const share = fighter.runPose;
  return { hand: vec.lerp(target.hand, hand, share), dir: vec.normalize(vec.lerp(target.dir, vec.normalize(dir), share)) };
}

/**
 * The stride of a run, read from his legs: `swing` from -1 to 1, positive with the right knee ahead of the left (so the left arm
 * forward: the arms go against the legs), full with the knees `WORLD.runMode.arms.span` of a thigh apart fore and aft; and
 * `spread` (0..1) how far apart the feet are fore and aft (full at half his height): widest as one lands and the other
 * leaves, together as they pass.
 */
function runGait(fighter) {
  const forward = yawRotate([1, 0, 0], fighter.yaw);
  const x = fighter.x;
  const ahead = (index) => (x[index * 3] - x[P.pelvis * 3]) * forward[0] + (x[index * 3 + 2] - x[P.pelvis * 3 + 2]) * forward[2];
  const swing = Math.max(-1, Math.min(1, (ahead(P.rKnee) - ahead(P.lKnee)) / (WORLD.runMode.arms.span * fighter.body.lengths.thigh)));
  const spread = Math.min(1, Math.abs(ahead(P.rFoot) - ahead(P.lFoot)) / (0.5 * fighter.body.heightM));
  return { swing, spread };
}

/**
 * The trunk as the pose has it (local): the shoulder on `side`, and the trunk's own axes: up its spine, forward square to it.
 */
function runTrunk(fighter, side) {
  const desired = fighter.desired;
  // (Before the lean into a turn: the arms are laid out in his upright frame and leaned with the rest, once, by the pose.)
  const level = desired ? unleaned(fighter.body, fighter.intent?.bank, desired) : null;
  const shoulder = desired ? level(desired[P[`${side}Shoulder`]]) : [0, fighter.body.heightM * 0.8, (side === 'l' ? 1 : -1) * fighter.body.lengths.shoulderSpan / 2];
  const spine = desired ? vec.normalize(vec.sub(level(desired[P.neck]), level(desired[P.pelvis]))) : [0, 1, 0];
  const front = vec.normalize(vec.sub([1, 0, 0], vec.scale(spine, spine[0])));
  return { shoulder, spine, front };
}

/**
 * A hand carried in the run (kind 'free', 'shield' or 'weapon'; WORLD.runMode.arms and .carry): where a runner's arm puts it,
 * from his shoulder: the upper arm swung fore and aft against the legs (more the faster he goes), out from his side a little,
 * the elbow bent about a right angle (more as it comes forward). A weapon hand (a short weapon at his waist) and a shield arm
 * swing less, as their own numbers say. A local point, in metres.
 */
function runHand(fighter, kind, side) {
  const arms = WORLD.runMode.arms;
  const carry = WORLD.runMode.carry;
  const L = fighter.body.lengths;
  const sign = side === 'l' ? 1 : -1;
  const { shoulder, spine, front } = runTrunk(fighter, side);
  const out = [0, 0, sign];
  const speed = Math.hypot(fighter.rootVelocity[0], fighter.rootVelocity[1]);
  const amplitude = Math.min(arms.most, arms.swing + arms.swingPerSpeed * speed);
  const own = kind === 'weapon' ? carry.waist : kind === 'shield' ? carry.shield : null;
  const forward = sign * runGait(fighter).swing * (own ? own.swing : 1);
  const flex = (own ? own.flex : arms.centre) + amplitude * forward;
  const elbow = own ? own.elbow : arms.elbow + arms.elbowSwing * forward;
  const abduct = own ? own.abduct : arms.abduct;
  const along = (angle) => vec.add(vec.scale(spine, -Math.cos(angle)), vec.scale(front, Math.sin(angle)));
  const upper = vec.normalize(vec.add(along(flex), vec.scale(out, Math.sin(abduct))));
  const elbowAt = vec.add(shoulder, vec.scale(upper, L.upperArm));
  const hand = vec.add(elbowAt, vec.scale(along(flex + elbow), L.forearmToFist));
  // (Across towards the middle as it comes up in front.)
  if (!own) hand[2] -= sign * arms.inward * fighter.body.heightM * Math.max(0, forward);
  return hand;
}

/**
 * The run pose's share, eased towards 1 while he runs with nothing else in his hands to do, back to 0 after
 * (WORLD.runMode.ease): the player in his run mode; any other man running (at more than a crawl of a pace) with no
 * enemy within his guard's distance (WORLD.runCarry.guardFrom: near one, he runs with his guard up).
 */
function easeRunPose(fighter, dt) {
  const running = fighter.runMode || (fighter.running && !fighter.rush && fighter.move > 0.3 && (fighter.nearestFoe ?? Infinity) > WORLD.runCarry.guardFrom);
  if (!running && !fighter.runPose) return 0;
  const free = running && !fighter.punch && !fighter.defence && !fighter.clinch && !fighter.pin && !fighter.pickup && !fighter.crawling && !fighter.mount && fighter.state === 'up';
  const rate = Math.min(1, WORLD.runMode.ease * dt);
  const next = (fighter.runPose ?? 0) + ((free ? 1 : 0) - (fighter.runPose ?? 0)) * rate;
  fighter.runPose = next < 0.01 ? 0 : next;
  return fighter.runPose;
}

/** Two stances blended: `share` of `to`. */
function blendStance(from, to, share) {
  const out = { ...from };
  for (const key of Object.keys(to)) out[key] = (from[key] ?? (key === 'stagger' ? 1 : to[key])) * (1 - share) + to[key] * share;
  return out;
}

function weaponIntent(world, fighter, intent) {
  const style = STYLES[fighter.style];
  const H = fighter.body.heightM;
  const punch = fighter.punch;
  if (fighter.shield && !(punch && punch.spec.limb.startsWith('l'))) {
    // The shield arm before the chest, punched out to meet a strike.
    const blocking = fighter.defence?.name === 'shieldBlock';
    const guard = style.shieldGuard ?? [0.3, 0.72, 0.05];
    // A long point comes on a line, not round: the shield goes onto that line, held out before him.
    const lineBlock = blocking ? shieldOnLine(world, fighter, guard) : null;
    // In a testudo the shield is the formation's: a wall before him or a roof over him.
    const pose = !blocking && fighter.shieldPose ? WORLD.shield[fighter.shieldPose] : null;
    intent.lHand = lineBlock ?? vec.scale(pose ?? (blocking ? [guard[0] + 0.1, guard[1] + 0.1, guard[2] - 0.03] : guard), H);
    // Knocked out of line, the arm goes with the blow until he has it back.
    if (fighter.shieldOpen > world.time) intent.lHand = toLocal(fighter, point(fighter.x, P.lHand));
    intent.shieldArm = 'l';
    // Running: the shield hangs at his side.
    if (fighter.runPose > 0 && !blocking && !punch) intent.lHand = vec.lerp(intent.lHand, runHand(fighter, 'shield', 'l'), fighter.runPose);
  }
  // The net held out in the off hand, ready to throw.
  if (fighter.net?.held && style.netGuard && !fighter.shield) intent.lHand = vec.scale(style.netGuard, H);
  const weapon = fighter.weapon;
  intent.bladeDir = null;
  intent.weaponArms = null;
  intent.offArm = null;
  if (!weapon?.held || !style.weaponGuard) return;
  // Two blades: each strikes on its own (strokeOf); a block is made with
  // whichever is not striking, the short one first — the one meets his blade
  // while the other cuts.
  const off = fighter.offWeapon?.held ? fighter.offWeapon : null;
  const stroke = strokeOf(fighter, weapon);
  const offStroke = off ? strokeOf(fighter, off) : null;
  // (A couched point is held out on its line to the end of the move: the run carries it on.)
  const extending = (s) => s && s.t <= (s.spec.couched ? s.spec.duration : s.spec.extendUntil);
  const blocking = fighter.defence?.name === 'weaponBlock';
  const blocker = !blocking ? null : off && !extending(offStroke) ? off : !extending(stroke) ? weapon : null;
  let target;
  if (extending(stroke)) target = strokeTargets(fighter, weapon, stroke);
  else if (blocker === weapon) {
    // Blade across the strike's line, meeting it; or across before the head.
    target = interceptBlock(world, fighter) ?? { hand: vec.scale([0.2, 0.8, -0.08], H), dir: vec.normalize([0.15, 0.3, 1]) };
  } else if (weapon.spec.ranged && (punch?.spec.path === 'aim' || fighter.aimAt !== undefined)) {
    // Engaging, the gun stays up on him between shots; a shot raises it from wherever it is.
    const held = fighter.aimAt !== undefined && world.fighters[fighter.aimAt] ? raisedAim(fighter, toLocal(fighter, aimPoint(world.fighters[fighter.aimAt], 'body'))) : guardTargets(style, fighter.body);
    target = punch?.spec.path === 'aim' ? aimTargets(world, fighter, punch, held) : held;
  } else target = guardTargets(style, fighter.body);
  if (fighter.runPose > 0 && !punch && !blocking) target = carriedTargets(fighter, weapon, target);
  const main = weapon.main;
  // A pistol up and aimed is held in both hands: the support hand wraps the
  // gun hand from below and behind, its elbow bent — the Chapman triangle.
  if (weapon.spec.ranged && (punch?.spec.path === 'aim' || fighter.aimAt !== undefined)) {
    if (weapon.spec.bow) target = drawBow(world, fighter, punch, target, intent);
    // A forearm gun is aimed with its own arm alone: the other is a weapon too, kept at its guard.
    else if (weapon.spec.mounted) intent.twoHanded = false;
    // The duellist: one hand on the gun, the other at the small of his back.
    else if (style.oneHandAim) intent[`${weapon.off}Hand`] = vec.scale([-0.14, 0.52, weapon.off === 'l' ? 0.06 : -0.06], H);
    else intent[`${weapon.off}Hand`] = vec.add(target.hand, vec.scale(SUPPORT_GRIP, H));
  } else if (weapon.spec.bow) weapon.draw = 0;
  if (weapon.spec.leadAhead) target = { ...target, hand: vec.sub(target.hand, vec.scale(target.dir, weapon.spec.spacing * LEAD_GRIP.rearShare)) };
  intent[`${main}Hand`] = target.hand;
  intent.bladeDir = target.dir;
  // (Carried at his waist in a run, a short two-hander is in the one hand: the other runs free.)
  const atWaist = fighter.runPose > 0.5 && !punch && !blocking && carryKind(weapon.spec) === 'waist';
  const oneHanded = atWaist || weapon.spec.hands === 'one' || (weapon.spec.hands === 'hybrid' && (fighter.net?.held || (punch?.spec.path === 'blade' && punch.spec.grip === 'one' && punch.t <= punch.spec.extendUntil)));
  intent.twoHanded = !oneHanded;
  if (!oneHanded) intent[`${weapon.off}Hand`] = vec.add(target.hand, vec.scale(target.dir, offHandAlong(weapon.spec)));
  // A lunge: the free arm flung back behind him as a counterweight, out and back with the stroke.
  const counter = punch?.spec.counterArm;
  if (counter && oneHanded && !off && !fighter.shield && !fighter.net?.held && punch.t < punch.spec.duration) {
    const spec = punch.spec;
    const out = punch.t < spec.extendUntil ? Math.min(1, punch.t / spec.extendUntil) : 1 - (punch.t - spec.extendUntil) / (spec.duration - spec.extendUntil);
    const flung = vec.scale([counter[0], counter[1], weapon.off === 'l' ? counter[2] : -counter[2]], H);
    const off = `${weapon.off}Hand`;
    intent[off] = intent[off] ? vec.lerp(intent[off], flung, Math.sin(out * Math.PI * 0.5)) : flung;
  }
  if (fighter.reloading && weapon.spec.shot && !weapon.loaded && !punch) {
    const spanning = weapon.spec.shot.bolt;
    const stroke = 0.5 - 0.5 * Math.cos(2 * Math.PI * LONG_GUN.ramPerSecond * (weapon.reloaded ?? 0));
    if (spanning) {
      // Spanning a crossbow: its nose down before his feet, the hand on the
      // tiller, the other drawing the string up the stock to the nut.
      target = { hand: vec.scale(LONG_GUN.spanHand, H), dir: vec.normalize(LONG_GUN.spanDir) };
      intent[`${weapon.off}Hand`] = vec.add(target.hand, vec.scale(target.dir, LONG_GUN.spanFrom - LONG_GUN.spanStroke * stroke));
    } else if (weapon.spec.shot.cylinder) {
      // A revolver: held low, muzzle down; for each chamber the support hand
      // to the pouch, to the chamber's mouth, then down on the rammer lever.
      const load = CYLINDER_LOAD;
      target = { hand: vec.scale(load.hand, H), dir: vec.normalize(load.dir) };
      const perChamber = weapon.spec.shot.reloadSeconds / (weapon.spec.shot.rounds ?? 1);
      const phase = ((weapon.reloaded ?? 0) / perChamber) % 1;
      const pouch = vec.scale(load.pouch, H);
      const mouth = vec.add(vec.add(target.hand, vec.scale(target.dir, load.mouth[0])), [0, load.mouth[1], 0]);
      const rammer = vec.add(vec.add(target.hand, vec.scale(target.dir, load.rammer[0])), [0, load.rammer[1], 0]);
      const ease = (value) => value * value * (3 - 2 * value);
      const [toMouth, toRammer, back] = load.phases;
      const offHand = phase < toMouth ? vec.lerp(pouch, mouth, ease(phase / toMouth))
        : phase < toRammer ? vec.lerp(mouth, rammer, ease((phase - toMouth) / (toRammer - toMouth)))
          : phase < back ? rammer
            : vec.lerp(rammer, pouch, ease((phase - back) / (1 - back)));
      intent[`${weapon.off}Hand`] = offHand;
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
  // Running, the hand is not held out before the shoulder: it swings back past it.
  if (fighter.runPose > 0 && !punch && !blocking) intent.weaponReach = (intent.weaponReach ?? POSE.weaponReach) * (1 - fighter.runPose) + WORLD.runMode.carry.reach * fighter.runPose;
  intent.polearmRear = weapon.spec.leadAhead && !oneHanded ? main : null;
  intent.windingUp = Boolean(stroke) && (stroke.load > 0 || stroke.t < stroke.spec.windup);
  // Swinging through, the arm goes as the stroke throws it (pose.js).
  intent.swinging = Boolean(stroke) && !intent.windingUp && stroke.t <= stroke.spec.extendUntil;
  if (off) offBladeIntent(world, fighter, intent, off, offStroke, blocker === off);
}

/** The hand and blade direction (local) a stroke wants now: along its path; a thrust's point steered at the mark from where the hand really is. */
function strokeTargets(fighter, weapon, stroke) {
  const t = stroke.load > 0 ? 0 : Math.max(0, stroke.t);
  // Leaning out of the saddle to his man (physics/mounted.js saddleReach), the stroke is the one he would make sitting up,
  // carried out and down with his shoulder (`shift`, his frame): its mark is where it is, the rest of it goes with him.
  const shift = fighter.mount && !stroke.spec.couched ? fighter.seated?.reach?.shift ?? null : null;
  // From the saddle a cut goes down to a man below: the whole swing pitched down about the shoulder.
  if (fighter.mount && stroke.spec.mode !== 'thrust') return pitchedSwing(fighter, weapon, stroke, t, shift);
  const target = bladeTargets(stroke.spec, t, shift ? vec.sub(stroke.aim, shift) : stroke.aim, fighter.body, weapon.spec);
  if (shift) target.hand = vec.add(target.hand, shift);
  // A thrust's point is steered at the target from wherever the hand really is (a couched one's line is held as it was set).
  if (stroke.spec.mode === 'thrust' && t >= stroke.spec.windup) {
    const line = vec.normalize(vec.sub(stroke.aim, toLocal(fighter, point(fighter.x, P[`${weapon.main}Hand`]))));
    // Couched, the point is kept on him while it is carried in, and its line held once it is driven.
    if (stroke.spec.couched) {
      // (On foot the hands angle it only so far across him; a rider keeps it on his man as the horse carries it.)
      if (!stroke.driven || !stroke.line || fighter.mount) stroke.line = fighter.mount ? line : withinSwing(line, stroke.spec.couched.swing);
      target.dir = stroke.line;
    } else target.dir = line;
  }
  return target;
}

/**
 * A swing at a mark further below the shoulder than a man on foot meets
 * one (a rider's cut down at a man on foot, or at a horse): the stroke made
 * as at a mark at the usual angle below the shoulder (WORLD.mount.swingPitch),
 * and the whole swing turned down about the shoulder to the real mark.
 */
function pitchedSwing(fighter, weapon, stroke, t, shift = null) {
  // (Leaning out, `shift`: the swing made from his shoulder sitting up, then carried out with it.)
  const moved = shift ?? [0, 0, 0];
  const shoulder = vec.sub(fighter.desired[P[`${weapon.main}Shoulder`]], moved);
  const aim = vec.sub(stroke.aim, moved);
  const toAim = vec.sub(aim, shoulder);
  const level = Math.hypot(toAim[0], toAim[2]);
  const delta = Math.atan2(-toAim[1], level) - WORLD.mount.swingPitch;
  if (delta <= 0 || level < 1e-6) {
    const flat = bladeTargets(stroke.spec, t, aim, fighter.body, weapon.spec);
    return { ...flat, hand: vec.add(flat.hand, moved) };
  }
  const axis = vec.cross([0, 1, 0], [toAim[0] / level, 0, toAim[2] / level]);
  const turn = (v, angle) => vec.scale(rotateAbout(v, axis, angle), vec.length(v));
  const virtualAim = vec.add(shoulder, turn(toAim, -delta));
  const target = bladeTargets(stroke.spec, t, virtualAim, fighter.body, weapon.spec);
  return { ...target, hand: vec.add(vec.add(shoulder, turn(vec.sub(target.hand, shoulder), delta)), moved), dir: turn(target.dir, delta) };
}

/**
 * A couched line kept within `swing` rad either side of straight ahead: the
 * shaft runs back under the arm along the body, and with the heading held
 * (holdHeading) the hands can only angle it so far across him.
 */
function withinSwing(line, swing) {
  const yaw = Math.atan2(line[2], line[0]);
  if (Math.abs(yaw) <= swing) return line;
  const level = Math.hypot(line[0], line[2]);
  const held = Math.sign(yaw) * swing;
  return [Math.cos(held) * level, line[1], Math.sin(held) * level];
}

/**
 * The off hand's blade (two blades): along its own stroke, across the line
 * of a strike to meet it, or at its guard. Its arm is a weapon arm with its
 * own blade direction and swing (pose.js `offArm`).
 */
function offBladeIntent(world, fighter, intent, off, stroke, blocking) {
  const H = fighter.body.heightM;
  const extending = stroke && stroke.t <= stroke.spec.extendUntil;
  let target;
  if (extending) target = strokeTargets(fighter, off, stroke);
  else if (blocking) target = interceptBlock(world, fighter, off) ?? { hand: vec.scale([0.2, 0.8, 0.08], H), dir: vec.normalize([0.15, 0.3, -1]) };
  else target = offGuardTargets(STYLES[fighter.style], fighter.body);
  intent[`${off.main}Hand`] = target.hand;
  intent.offArm = off.main;
  intent.offBladeDir = target.dir;
  intent.weaponArms = [...intent.weaponArms, off.main];
  intent.offWindingUp = Boolean(extending) && (stroke.load > 0 || stroke.t < stroke.spec.windup);
  intent.offSwinging = Boolean(extending) && !intent.offWindingUp;
}

/**
 * A second forearm gun fired with the first (a style's `paired`: { weapon,
 * within, every, settled, arc }): while the gun in use is up on a man, the
 * other arm takes its own: the nearest other man of the other side up
 * within `within` m and within `arc` rad of where the body faces (the arm
 * swings out no further), else the same man if he is within `within`. It
 * comes up on him (straight out from the shoulder), each arm aimed on its
 * own, and fires down that forearm's line as it points, a shot every
 * `every` s, once it is within `settled` rad of him. Its own spread, kick and
 * recoil as fire() gives any gun; no hands are needed (it is the arm).
 */
function pairedGun(world, fighter, intent, dt) {
  const paired = STYLES[fighter.style]?.paired;
  if (!paired) return;
  if (fighter.paired?.weapon.kind !== paired.weapon) fighter.paired = { weapon: createWeapon(paired.weapon), wait: paired.every / 2 };
  const gun = fighter.paired;
  gun.wait = Math.max(0, gun.wait - dt);
  gun.target = undefined;
  const weapon = fighter.weapon;
  const punch = fighter.punch;
  const aiming = weapon?.held && weapon.spec.ranged && (punch?.spec.path === 'aim' || fighter.aimAt !== undefined);
  const first = aiming ? world.fighters[punch?.spec.path === 'aim' ? punch.target : fighter.aimAt] : null;
  if (!first || first.state === 'out' || fighter.state !== 'up') return;
  const from = point(fighter.x, P.pelvis);
  const facing = yawRotate([1, 0, 0], fighter.yaw);
  const away = (other) => {
    const to = point(other.x, P.pelvis);
    return [to[0] - from[0], to[2] - from[2]];
  };
  const inReach = (other) => {
    const [x, z] = away(other);
    const distance = Math.hypot(x, z);
    return distance <= paired.within && (facing[0] * x + facing[2] * z) / Math.max(1e-6, distance) >= Math.cos(paired.arc ?? Math.PI);
  };
  let target = null;
  for (const other of world.fighters) {
    if (other === first || other.corner === fighter.corner || other.state !== 'up' || !inReach(other)) continue;
    if (!target || Math.hypot(...away(other)) < Math.hypot(...away(target))) target = other;
  }
  target ??= inReach(first) ? first : null;
  if (!target) return;
  gun.target = target.id;
  const mark = aimPoint(target, 'body');
  const side = gun.weapon.main;
  intent[`${side}Hand`] = raisedAim(fighter, toLocal(fighter, mark), gun.weapon).hand;
  const hand = point(fighter.x, P[`${side}Hand`]);
  gun.weapon.dir = vec.normalize(vec.sub(hand, point(fighter.x, P[`${side}Elbow`])));
  if (gun.wait > 0 || vec.dot(gun.weapon.dir, vec.normalize(vec.sub(mark, hand))) < Math.cos(paired.settled)) return;
  fire(world, fighter, gun.weapon, mark, target.id);
  gun.wait = paired.every;
}

/**
 * Move the weapon with the hands, each substep. The wrists turn it towards
 * where the move points it, a spring as fast as its inertia allows (stiffer
 * with both hands on it), while its own weight pulls the point down. In two
 * hands, the off hand is held to the handle a grip behind the main one.
 */
function updateWeapon(fighter, h, weapon = fighter.weapon) {
  const spec = weapon.spec;
  const main = P[`${weapon.main}Hand`];
  const off = P[`${weapon.off}Hand`];
  const previous = weapon.dir;
  const able = fighter.state === 'up' || fighter.state === 'rising';
  // The off hand's blade (two blades) turns as its own intent says, in its one hand.
  const second = weapon === fighter.offWeapon;
  const bladeDir = second ? fighter.intent.offBladeDir : fighter.intent.bladeDir;
  let twoHands = false;
  if (fighter.intent.twoHanded && able && !second) {
    const gap = vec.length(vec.sub(point(fighter.x, main), point(fighter.x, off)));
    twoHands = gap < spec.spacing * 2.5;
  }
  const want = bladeDir && able ? yawRotate(bladeDir, fighter.yaw) : previous;
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
  let dir = rotateAbout(previous, weapon.spin, h);
  if (able) {
    // The wrist bends only so far: a blade cannot point back into the
    // forearm holding it. Turned that far, the wrist stops it.
    const forearm = vec.normalize(vec.sub(point(fighter.x, main), point(fighter.x, P[`${weapon.main}Elbow`])));
    const back = Math.acos(Math.max(-1, Math.min(1, vec.dot(dir, forearm))));
    const across = vec.cross(forearm, dir);
    if (back > WORLD.limbTwist.wristBack && vec.length(across) > 1e-6) {
      const axisBack = vec.normalize(across);
      dir = turnAbout(forearm, axisBack, WORLD.limbTwist.wristBack);
      const further = vec.dot(weapon.spin, axisBack);
      if (further > 0) weapon.spin = vec.sub(weapon.spin, vec.scale(axisBack, further));
    }
  }
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
export function handVelocityOf(fighter, index) {
  const velocity = point(fighter.v, index);
  const limit = fighter.body.topSpeed[index] * 1.15;
  // On a horse, the arm's own speed is capped and the horse's added: the blade moves with both.
  const carrier = fighter.carrier;
  if (carrier) {
    const own = vec.sub(velocity, carrier);
    const ownSpeed = vec.length(own);
    return vec.add(carrier, ownSpeed > limit ? vec.scale(own, limit / ownSpeed) : own);
  }
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

/**
 * Stand a fighter on terrain (an arena's `terrain`): at (x, z), facing `yaw`, on the floor
 * at height `floor` (the stance lifted to it, every part moved up by as much).
 */
export function placeOnFloor(fighter, x, z, floor, yaw) {
  placeFighter(fighter, x, z);
  const rise = floor - (fighter.lift ?? 0);
  for (let index = 1; index < fighter.x.length; index += 3) {
    fighter.x[index] += rise;
    fighter.prev[index] += rise;
  }
  fighter.lift = floor;
  fighter.yaw = yaw;
  plantFeet(fighter);
}

// ---- Level mode: a man made over in place -------------------------------------------------

/** The headgear props a fighter's inputs ask for (worn, on his head). */
function wornProps(fighter) {
  return (fighter.body.inputs.accessories ?? []).filter((kind) => headgearOptions(outfitOf(fighter.body.inputs).kind).includes(kind)).map((kind) => ({ kind, owner: fighter.id, attached: true, x: point(fighter.x, P.head), v: [0, 0, 0], spin: [0, 0, 0], turn: [0, 0, 0], resting: false }));
}

/** His headgear props replaced by those his inputs now ask for, worn again. */
function refreshProps(world, fighter) {
  world.props = (world.props ?? []).filter((prop) => prop.owner !== fighter.id);
  world.props.push(...wornProps(fighter));
}

/**
 * Level mode: put a fighter in other clothes (a dead man's outfit, a helm taken off) where he stands.
 * His body is built again from `inputs` (masses, radii, gear: armour, helm, footing) and the weight of
 * what he holds put back on it; everything that has happened to him (wounds, blood, bones, stamina,
 * his weapon and where it points, his place and pose) is left as it is. The caller redraws him.
 */
export function reclothe(world, fighter, inputs) {
  const body = buildBody(inputs);
  fighter.body = body;
  fighter.invMass = body.masses.map((mass) => 1 / mass);
  fighter.radius = particleRadii(body);
  for (const weapon of [fighter.weapon, fighter.offWeapon]) {
    if (!weapon?.held || weapon.spec.mounted) continue;
    const second = weapon === fighter.offWeapon;
    if (second) addParticleMass(fighter, P.lHand, weapon.spec.mass);
    else {
      const shares = handShares(weapon.spec);
      addParticleMass(fighter, P[`${weapon.main}Hand`], weapon.spec.mass * shares.main);
      if (shares.off) addParticleMass(fighter, P[`${weapon.off}Hand`], weapon.spec.mass * shares.off);
    }
    weapon.handling = handling(body, weapon.spec);
  }
  if (fighter.shield) {
    addParticleMass(fighter, P.lHand, fighter.shield.spec.mass * 0.6);
    addParticleMass(fighter, P.lElbow, fighter.shield.spec.mass * 0.4);
  }
  fighter.capsuleCache = undefined;
  fighter.damageVersion += 1;
  refreshProps(world, fighter);
}

/**
 * Level mode: a fighter made new where he is, as the same object (his id, corner, section and
 * arena kept): a body built from `inputs` with nothing wrong with it, standing at `at` = [x, y, z]
 * facing `yaw`. `shield`: undefined for what his style gives, null for none, or a shield kind.
 * What he had dropped lies no more; his headgear is on his head. The caller redraws him.
 */
export function reviveFighter(world, fighter, inputs, { at, yaw = fighter.yaw, shield } = {}) {
  const { id, corner, arena, spawn, dormant, walking, player } = fighter;
  const fresh = createFighter(inputs, { id, corner, x: at[0], facing: yaw, random: world.random });
  if (shield !== undefined && fresh.shield && fresh.shield.kind !== shield) {
    addParticleMass(fresh, P.lHand, -fresh.shield.spec.mass * 0.6);
    addParticleMass(fresh, P.lElbow, -fresh.shield.spec.mass * 0.4);
    fresh.shield = null;
  }
  if (shield && !fresh.shield) {
    const spec = SHIELDS[shield];
    fresh.shield = { kind: shield, spec, strain: undefined };
    addParticleMass(fresh, P.lHand, spec.mass * 0.6);
    addParticleMass(fresh, P.lElbow, spec.mass * 0.4);
  }
  for (const key of Object.keys(fighter)) if (!(key in fresh)) delete fighter[key];
  Object.assign(fighter, fresh, { arena, spawn, dormant, walking, player });
  placeOnFloor(fighter, at[0], at[2], at[1], yaw);
  for (const piece of world.debris) if (piece.owner === id && !piece.taken) piece.taken = true;
  refreshProps(world, fighter);
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
export function createWorld(fighterInputs, { seed = 1, arena = { halfX: WORLD.ringHalf, halfZ: WORLD.ringHalf, ring: true }, rules = {}, formation = {} } = {}) {
  const random = seededRandom(seed);
  const sides = fighterInputs.map((entry, index) => ({ inputs: entry.inputs ?? entry, corner: entry.corner ?? (index % 2 === 0 ? 'red' : 'blue') }));
  // With a gun in the fight, they start further apart: room for the gun to work, and to close.
  const gunFight = sides.some((side) => STYLES[side.inputs.style]?.ranged);
  // A fight starts out of reach: a pair at least just beyond the longer weapon's reach (a lance's point does not start in a man's chest).
  const longest = Math.max(0, ...sides.map((side) => {
    const spec = WEAPONS[STYLES[side.inputs.style]?.weapon];
    return spec && !spec.ranged ? spec.length + spec.handle * 0.5 : 0;
  }));
  // Mounted (`inputs.mounted`, for a man who rides: horses.js), they start far enough apart to charge.
  const riding = (inputs) => Boolean(inputs.mounted) && canRide(inputs);
  const mounted = sides.some((side) => riding(side.inputs));
  const apart = mounted ? Math.min(WORLD.mount.startApart, arena.halfX - 3) : Math.min(gunFight ? WORLD.gunStartApart : Math.max(WORLD.startApart, (longest + WORLD.startBeyondReach) / 2), arena.halfX - 0.6);
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
  let wingOrder = null;
  for (const corner of ['red', 'blue']) {
    const everyone = fighters.filter((fighter) => fighter.corner === corner);
    const order = formation[corner];
    if (everyone.length < 2 && !order) continue;
    // `wings`: the riders stand on the flanks of the line, held, not in its rows (formation.js placeWings).
    // An army set up by the player (`placed`: muster.js) has a place in its `layout` for every man, riders
    // too: they wait where he put them, held all the same.
    const riders = order?.wings ? everyone.filter((fighter) => riding(fighter.body.inputs)) : [];
    const team = riders.length && !order.placed ? everyone.filter((fighter) => !riders.includes(fighter)) : everyone;
    // With riders in the fight, every team lines up at the charging distance: the foot in rows, the riders on their flanks.
    if (mounted && !order) {
      lineUpMounted(team, corner === 'red' ? -1 : 1, apart, arena, (fighter) => riding(fighter.body.inputs));
      continue;
    }
    const spacing = order?.spacing ?? WORLD.teamSpacing;
    const rowSpacing = order?.rowSpacing ?? WORLD.teamRowSpacing;
    // Teams line up closer than a pair: a crowd that runs in from further bunches and hits its own.
    const front = order?.front ?? (gunFight ? apart : WORLD.teamStartApart);
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
    // `layout`: each man's own place, [back, across] (m behind the front row, m across the field), in the
    // order the side was cast: a unit drawn up as it fought (the mandarin-duck squad), not rows of the same.
    if (order?.layout) {
      team.forEach((fighter, index) => {
        const [back, across] = order.layout[index] ?? [order.layout.length, 0];
        const jitter = () => (order.loose ? (random() * 2 - 1) * order.loose : 0);
        const x = sign * (front + back) + jitter();
        placeFighter(fighter, Math.max(-(arena.halfX - 0.4), Math.min(arena.halfX - 0.4, x)), Math.max(-(arena.halfZ - 0.4), Math.min(arena.halfZ - 0.4, sign * across + jitter())));
      });
    } else if (order?.shootersFront !== undefined) {
      const shooting = (fighter) => Boolean(STYLES[fighter.style]?.ranged);
      const shooters = team.filter(shooting);
      const rest = team.filter((fighter) => !shooting(fighter));
      placeRows(shooters, 0);
      placeRows(rest, shooters.length ? Math.ceil(shooters.length / perRow) * rowSpacing + order.shootersFront : 0);
    } else placeRows(team, 0);
    if (riders.length) {
      const widest = Math.min(perRow, team.length);
      if (order.placed) for (const fighter of riders) fighter.wing = { held: true, side: Math.sign(fighter.x[P.pelvis * 3 + 2]) || 1 };
      else placeWings(riders, sign, order, { front, width: (widest - 1) * spacing }, arena, (fighter, x, z) => placeFighter(fighter, x, z));
      wingOrder ??= order.wings;
    }
  }
  for (const fighter of fighters) fighter.arena = arena;
  // Headgear the outfit allows (a crest needs a kabuto; a headset no helmet).
  const props = fighters.flatMap((fighter) => (fighter.body.inputs.accessories ?? []).filter((kind) => headgearOptions(outfitOf(fighter.body.inputs).kind).includes(kind)).map((kind) => ({ kind, owner: fighter.id, attached: true, x: point(fighter.x, P.head), v: [0, 0, 0], spin: [0, 0, 0], turn: [0, 0, 0], resting: false })));
  // (`rules.noStandards`, level mode: no side raises a standard or forms up on a leader.)
  const standards = rules.noStandards ? {} : raiseStandards(fighters, random);
  // `rules`: a level's own (noPins: a man down gets up again; nobody holds him there).
  // Each rider's horse under him (physics/mounted.js).
  const horses = [];
  if (mounted) for (const fighter of fighters) if (riding(fighter.body.inputs)) horses.push(createHorse(fighter, horses.length, random));
  const world = { time: 0, fighters, events: [], random, over: false, pendingImpulses: [], lastDt: 1 / 60, arena, props, debris: [], arrows: [], clashing: new Set(), rules, standards, horses };
  // Wings of horse held on the flanks (formation.js moveWings): released when the foot lines close.
  if (wingOrder) world.wings = { release: wingOrder.release ?? WINGS.release, by: wingOrder.by ?? WINGS.by, review: 0 };
  // A side's baggage train on the field (`formation[corner].train`: { back }, m in from its own end of the floor, on the
  // middle line): where its horse archers go for fresh arrows when their quivers are empty (riding.js resupply).
  for (const corner of ['red', 'blue']) {
    const train = formation[corner]?.train;
    if (!train) continue;
    world.trains ??= {};
    world.trains[corner] = { at: [(corner === 'red' ? -1 : 1) * Math.max(0, arena.halfX - (train.back ?? 2)), train.across ?? 0] };
  }
  // Drilled men form up on their side's leader (formation.js).
  // A side drilled as a whole by the level's order (`formation[corner].drill`: Qi Jiguang's squads) forms up so too.
  if (!rules.noStandards) formUp(world, (corner) => (standards[corner] ? fighters[standards[corner].leader] : null), formation);
  // A side's discipline (`formation[corner].discipline`, 0..1): a fact about that army, set by the level (ai.js AI.morale).
  world.discipline = Object.fromEntries(['red', 'blue'].map((corner) => [corner, formation[corner]?.discipline ?? 0]));
  // A side lying in ambush (`formation[corner].ambush`: { signal } s; Cajamarca's Spaniards in the halls' doorways): its
  // men hidden (`hidden`: unseen by the other side, waiting) until the signal or until one of them strikes (ai.js springAmbush).
  for (const corner of ['red', 'blue']) {
    const ambush = formation[corner]?.ambush;
    if (!ambush) continue;
    world.ambush = { corner, signal: ambush.signal ?? 0, sprung: false, cursor: 0 };
    for (const fighter of fighters) if (fighter.corner === corner) fighter.hidden = true;
  }
  return world;
}

/**
 * A team in a fight with riders in it, in one line `apart` m from the middle (`sign`: -1 for red):
 * the men on foot abreast at the team spacing, rows behind at the row spacing; the riders on the
 * flanks, alternating sides outward; those who do not fit across the field in a rank behind the
 * foot. A team of riders only is a line abreast, further ranks behind (WORLD.mount.line).
 */
function lineUpMounted(team, sign, apart, arena, rides) {
  const { spacing, rankBack, margin } = WORLD.mount.line;
  const foot = team.filter((fighter) => !rides(fighter));
  const riders = team.filter(rides);
  const across = arena.halfZ - margin;
  const at = (fighter, back, z) => placeFighter(fighter, sign * Math.min(arena.halfX - 0.4, apart + back), Math.max(-across, Math.min(across, z)));
  // The foot: as many abreast as the field is wide, the rest in rows behind.
  const perRow = Math.max(1, Math.floor((2 * (arena.halfZ - 0.5)) / WORLD.teamSpacing) + 1);
  foot.forEach((fighter, index) => {
    const row = Math.floor(index / perRow);
    const inRow = Math.min(perRow, foot.length - row * perRow);
    at(fighter, row * WORLD.teamRowSpacing, ((index % perRow) - (inRow - 1) / 2) * WORLD.teamSpacing);
  });
  const width = foot.length ? (Math.min(perRow, foot.length) - 1) * WORLD.teamSpacing : 0;
  const rows = Math.ceil(foot.length / perRow);
  const flanks = [];
  if (foot.length) {
    for (let step = 1; (width / 2 + step * spacing) <= across; step += 1) flanks.push(-(width / 2 + step * spacing), width / 2 + step * spacing);
  }
  // Left and right in turn, the inner places first; the rest behind.
  const wings = riders.slice(0, flanks.length);
  wings.forEach((fighter, index) => at(fighter, 0, flanks[index]));
  const behind = riders.slice(wings.length);
  const perRank = Math.max(1, Math.floor((2 * across) / spacing) + 1);
  const firstRank = foot.length ? Math.max(0, rows - 1) * WORLD.teamRowSpacing + rankBack : 0;
  behind.forEach((fighter, index) => {
    const rank = Math.floor(index / perRank);
    const inRank = Math.min(perRank, behind.length - rank * perRank);
    at(fighter, firstRank + rank * rankBack, ((index % perRank) - (inRank - 1) / 2) * spacing);
  });
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
    // (Two blades: the short one put away; the standard takes both hands.)
    if (leader.offWeapon) {
      addParticleMass(leader, P[`${leader.offWeapon.main}Hand`], -leader.offWeapon.spec.mass);
      leader.offWeapon = null;
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
  // On horseback his stance is lifted to the saddle (`lift`, physics/mounted.js).
  return [fighter.root[0] + turned[0], turned[1] + (fighter.lift ?? 0), fighter.root[1] + turned[2]];
}
export function toLocal(fighter, world) {
  return yawRotate([world[0] - fighter.root[0], world[1] - (fighter.lift ?? 0), world[2] - fighter.root[1]], -fighter.yaw);
}

/**
 * Who this fighter is fighting: the one it has chosen to focus on (an AI's
 * pick in a team fight), or else the nearest opponent still in it.
 */
export function opponentFor(world, fighter) {
  const focus = fighter.focus === undefined ? null : world.fighters[fighter.focus];
  // (The player locked on a man who is no enemy, a civilian or an ally: `focusAny`, control.js.)
  if (focus && (hostile(focus, fighter) || fighter.focusAny) && inFight(focus)) return focus;
  return nearestOpponent(world, fighter);
}

export function nearestOpponent(world, fighter) {
  let best = null;
  let bestDistance = Infinity;
  for (const other of world.fighters) {
    if (!hostile(other, fighter) || !inFight(other)) continue;
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
  // His horse: its chest (the part that comes first), if he is mounted.
  if (zone === 'horse' && target.mount) return vec.lerp(target.mount.capsules[0].a, target.mount.capsules[0].b, 0.6);
  // His blade (a beat at it, to knock it off the line): its middle; empty-handed, his body.
  if (zone === 'blade' && target.weapon?.held && !target.weapon.spec.mounted) {
    return vec.add(point(target.x, P[`${target.weapon.main}Hand`]), vec.scale(target.weapon.dir, target.weapon.spec.length * 0.5));
  }
  if (zone === 'legs') return vec.lerp(point(target.x, P.lHip), point(target.x, P.lKnee), 0.55);
  return vec.lerp(point(target.x, P.pelvis), point(target.x, P.neck), 0.6);
}

/** How far (m) a couched point is from its man's front, along the lance (Infinity with no man or no lance). */
export function couchedGap(world, fighter, punch) {
  const target = punch.target === null ? null : world.fighters[punch.target];
  const weapon = fighter.weapon;
  if (!target || !weapon?.held) return Infinity;
  return vec.dot(vec.sub(aimPoint(target, punch.zone), weapon.tip), weapon.dir) - target.body.segments.trunk.skinRadius;
}

/**
 * A couched point near enough its man to drive it home: the gap from the
 * point to his front, along the lance, no more than `couched.lead` of what
 * the drive closes (the hand's `drive` and the two closing on each other
 * for the drive's time), so the point meets him well into the drive, as
 * it goes fastest. With no man to carry it at, it is driven at once.
 */
function couchedNear(world, fighter, punch) {
  const target = punch.target === null ? null : world.fighters[punch.target];
  const weapon = fighter.weapon;
  if (!target || !weapon?.held) return true;
  const spec = punch.spec;
  const gap = couchedGap(world, fighter, punch);
  const closing = (fighter.rootVelocity[0] - target.rootVelocity[0]) * weapon.dir[0] + (fighter.rootVelocity[1] - target.rootVelocity[1]) * weapon.dir[2];
  return gap <= spec.couched.lead * (spec.couched.drive + Math.max(0, closing) * (spec.extendUntil - spec.windup));
}

/**
 * Throw a strike (any attack in MOVES) at the opponent. The zone defaults to
 * the move's first. Returns false if the fighter cannot throw it now.
 */
export function throwPunch(world, fighter, type, zone = null, { heavy = false, at = null, riposte = false } = {}) {
  const spec = MOVES[type];
  if (spec?.kind === 'rush' || spec?.kind === 'clinch') return perform(world, fighter, type);
  // Thrown at a place (`at`, the player's aim): at whoever stands there, or at the empty air.
  const target = at ? manNear(world, fighter, at, WORLD.aimedAtWithin) : opponentFor(world, fighter);
  // The blade it is struck with (two blades: the one in the striking hand).
  const blade = spec?.path === 'blade' ? bladeFor(fighter, spec) : null;
  // Raising a weapon heavier than heavyFrom is work in proportion to its mass.
  // (and the harder, the weaker he is for it: handling.js)
  const lift = blade?.held ? Math.max(1, blade.spec.mass / WORLD.weapons.heavyFrom) / (blade.handling?.speed ?? 1) : 1;
  const cost = spec ? spec.cost * (heavy ? WORLD.heavy.costFactor : 1) * lift : 0;
  // An empty gun is not fired: the same button starts loading it (no mark needed).
  if (spec?.path === 'aim' && fighter.weapon?.held && fighter.weapon.spec.shot && !fighter.weapon.loaded) {
    if (fighter.state === 'up' && !fighter.punch) fighter.reloading = true;
    return false;
  }
  const drain = cost / fighter.body.aerobic;
  // On his knees by his own choice (the player's crawl), a blow of the hand is still his: low and weak (WORLD.crawl.strike).
  const fromKnees = fighter.crawling && fighter.crawlChosen && fighter.player && spec?.kind === 'strike' && spec.limb?.endsWith('Hand') && spec.path !== 'aim';
  if (!spec || spec.kind !== 'strike' || (!target && !at) || fighter.punch || fighter.state !== 'up' || (fighter.crawling && !fromKnees) || fighter.netted || fighter.pain || (fighter.stamina < drain && !fighter.player) || (spec.bash && !fighter.shield)) return false;
  const aimZone = fromKnees ? 'legs' : spec.zones.includes(zone) ? zone : spec.zones[0];
  // A wild swinger's aim wanders off the mark.
  // A heavy weapon is hard to steer: past heavyFrom its blows wander (`heavyAimJitter` m per unit of mass over).
  // (Couched, the body carries it: only `couched.wander` of that, the point bobbing with his stride.)
  const heft = blade?.held ? Math.max(0, blade.spec.mass / WORLD.weapons.heavyFrom - 1) * (spec?.couched ? spec.couched.wander : 1) : 0;
  // His skill: how near the mark his blow goes (a point needs it most; a gun aims by its own spread).
  const jitter = skillScatter(fighter, spec, (STYLES[fighter.style]?.aimJitter ?? 0) + WORLD.weapons.heavyAimJitter * heft);
  // What of it is the weapon's weight (a point that wanders so finds a gap in armour the less: BLADES.gaps.size).
  const wander = heft > 0 ? skillScatter(fighter, spec, WORLD.weapons.heavyAimJitter * heft) : 0;
  const mark = at ?? aimPoint(target, aimZone);
  const aimed = jitter > 0 ? vec.add(mark, [0, 1, 2].map(() => (world.random() * 2 - 1) * jitter)) : mark;
  fighter.punch = {
    type, spec, zone: aimZone, t: 0, age: 0, aim: toLocal(fighter, aimed), target: target?.id ?? null, landed: false, peakSpeed: 0, limb: P[spec.limb],
    heavy, load: heavy ? WORLD.heavy.loadSeconds : 0,
    // A place in the world: the strike follows it as he turns to it.
    at: at ? aimed : null,
    // How far off his mark it went (a couched point carried in keeps it as it follows him).
    miss: vec.sub(aimed, mark),
    // How far an untrained hand turns the blade off true (rad): the edge meeting at a slant, the point off its line.
    edgeTilt: edgeTilt(world, fighter, spec),
    wander,
    // What the stroke gains as it goes, named here (unset) so that every stroke has one shape.
    riposte: undefined, finisher: undefined, with: undefined, burst: undefined, drove: undefined, stopped: undefined, driven: undefined,
    fired: undefined, hits: undefined, line: undefined, quick: undefined, rideOffset: undefined,
    // From his knees (the player's crawl: WORLD.crawl.strike): the blow's mass behind it is this share.
    weak: undefined,
  };
  // A riposte: struck as the other blade (or the guard) takes his.
  if (riposte) fighter.punch.riposte = true;
  if (fromKnees) fighter.punch.weak = WORLD.crawl.strike;
  // Two blades at once (`with`: the other hand's move, `withDelay` s behind):
  // its own stroke, aimed at its own zone, the same scatter off the mark.
  const second = spec.with ? MOVES[spec.with] : null;
  if (second && fighter.offWeapon?.held && bladeFor(fighter, second) !== blade) {
    const secondZone = second.zones[0];
    const secondMark = at ?? aimPoint(target, secondZone);
    const secondAim = vec.add(secondMark, vec.sub(aimed, mark));
    fighter.punch.with = { type: spec.with, spec: second, zone: secondZone, t: -(spec.withDelay ?? 0), age: 0, aim: toLocal(fighter, secondAim), target: target?.id ?? null, landed: false, load: 0, at: at ? secondAim : null, edgeTilt: fighter.punch.edgeTilt, heavy: false };
    fighter.stats.dual = (fighter.stats.dual ?? 0) + 1;
  }
  if (blade && blade === fighter.offWeapon) fighter.stats.offStrikes = (fighter.stats.offStrikes ?? 0) + 1;
  drawStamina(fighter, drain);
  fighter.stats.thrown += 1;
  if (heavy) world.events.push({ time: world.time, kind: 'heavy', attacker: fighter.id, punch: type, effects: [] });
  // Heard: a blow loaded with everything he has (a heavy one) comes with a grunt.
  if (heavy && world.ear) soundVoice(world, fighter, 'effort', 1);
  return true;
}

/**
 * How far off the mark (m, each way) a blow of this kind goes in his hands,
 * from the scatter it has anyway (`scatter`: a wild swinger's, a heavy
 * weapon's) and his skill: as it is at an ordinary 0.5, narrowing to none at
 * 1; below 0.5 a novice's error is added, up to WORLD.skill.aimError at 0 (a
 * point, a thrust with a spear or a rapier, wants the most precision). A
 * gun's spread answers to skill where it is fired (ranged.js).
 */
export function skillScatter(fighter, spec, scatter) {
  if (!spec || spec.path === 'aim') return scatter;
  const skill = fighter.body.skill ?? 0.5;
  const blade = spec.path === 'blade' ? bladeFor(fighter, spec) : null;
  const held = blade?.held ? blade.spec : null;
  const kind = !held ? 'hand' : spec.mode === 'thrust' ? 'point' : held.harm?.swing?.cut ? 'blade' : 'blunt';
  return scatter * Math.min(1, 2 * (1 - skill)) + WORLD.skill.aimError[kind] * Math.max(0, 1 - 2 * skill);
}

/**
 * An untrained hand turns a blade in the stroke: the edge meets at a slant
 * and slaps with the flat, the point arrives off its line and skids. Below
 * an ordinary skill (0.5) each blow's edge is this far off true (rad), up
 * to WORLD.skill.edgeTilt at 0 (a few degrees short of flat); at 0.5 and
 * above the edge runs true. Drawn per blow, only for the untrained.
 */
function edgeTilt(world, fighter, spec) {
  const untrained = Math.max(0, 1 - 2 * (fighter.body.skill ?? 0.5));
  if (!untrained || spec?.path !== 'blade' || !fighter.weapon?.held) return 0;
  const [least, most] = WORLD.skill.edgeTilt;
  return untrained * (least + (most - least) * world.random());
}

/**
 * Whoever stands nearest a place the player aims at, within `within` m of it (on the floor), or null: an enemy first
 * (a man of the other side who is in the fight), then anyone else (a civilian, a prisoner, a team-mate, a man lying
 * crawling or out), who is a little further for it (`WORLD.aimedAtOthers` m). A player can strike at anything.
 */
export function manNear(world, fighter, at, within) {
  let best = null;
  let bestScore = Infinity;
  for (const other of world.fighters) {
    if (other === fighter || other.dormant || other.fled) continue;
    const distance = Math.hypot(other.x[P.pelvis * 3] - at[0], other.x[P.pelvis * 3 + 2] - at[2]);
    const score = distance + (hostile(other, fighter) && inFight(other) ? 0 : WORLD.aimedAtOthers);
    if (distance <= within && score < bestScore) {
      best = other;
      bestScore = score;
    }
  }
  return best;
}

/** The man nearest this one within `range` m, enemy or not (a civilian, a prisoner, a team-mate), awake or lying; null if none. */
export function nearestAnyone(world, fighter, range) {
  let best = null;
  let bestScore = Infinity;
  for (const other of world.fighters) {
    if (other === fighter || other.dormant || other.fled || other.state === 'out') continue;
    const distance = Math.hypot(other.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], other.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]);
    // An enemy before a bystander at about the same distance.
    const score = distance + (hostile(other, fighter) ? 0 : WORLD.aimedAtOthers);
    if (distance <= range && score < bestScore) {
      best = other;
      bestScore = score;
    }
  }
  return best;
}

/** Start a whole-body move (rush, clinch) or a defence. */
export function perform(world, fighter, name, { side = world.random() < 0.5 ? 1 : -1, from = null } = {}) {
  if (fighter.state !== 'up' || fighter.netted) return false;
  // His shield lost, he covers up with his arms.
  if (name === 'shieldBlock' && !fighter.shield) name = 'guard';
  // His shield knocked out of line: it cannot be brought to meet this one.
  if (name === 'shieldBlock' && fighter.shieldOpen > world.time) return false;
  if (DEFENCES[name]) {
    // The player's dodge or block takes breath (the plain guard held up does not); he may go into the overdraft for it.
    if (fighter.player && name !== 'guard') drawStamina(fighter, WORLD.overdraft.defenceCost / fighter.body.aerobic);
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
  if (!spec || !target || fighter.punch || fighter.rush || (fighter.stamina < spec.cost / fighter.body.aerobic && !fighter.player)) return false;
  if (spec.kind === 'rush') {
    fighter.rush = { t: 0, duration: spec.duration, hit: false };
    // (Heard: a charge goes in with the whole of him, and he shouts it.)
    if (world.ear) soundVoice(world, fighter, 'effort', 1);
  } else if (spec.kind === 'clinch') {
    const distance = vec.length(vec.sub(point(target.x, P.neck), point(fighter.x, P.neck)));
    if (distance > fighter.body.reach * WORLD.clinch.range) return false;
    // Who holds on longer is a contest of grip and arm strength.
    const grip = (who) => who.body.strikeForce[P.lHand] + who.body.strikeForce[P.rHand];
    const share = grip(fighter) / (grip(fighter) + grip(target));
    fighter.clinch = { target: target.id, t: 0, duration: spec.duration * (0.5 + share), hands: spec.hands ?? ['l', 'r'] };
    world.events.push({ time: world.time, kind: 'clinch', attacker: fighter.id, defender: target.id, effects: [] });
  } else return false;
  drawStamina(fighter, spec.cost / fighter.body.aerobic);
  return true;
}

/**
 * The turn of a run (WORLD.runMode.turn): `fighter.turn`, the heading's rate (rad/s, positive turning to his right), smoothed over what a
 * runner takes to feel it; of his path, once he is going (the way his speed points: it lags his facing), else of his facing.
 */
function turnOf(fighter, dt) {
  const spec = WORLD.runMode.turn;
  const speed = Math.hypot(fighter.rootVelocity[0], fighter.rootVelocity[1]);
  const heading = speed > spec.pathFrom ? Math.atan2(-fighter.rootVelocity[1], fighter.rootVelocity[0]) : fighter.yaw;
  if (fighter.yawWas === undefined || dt <= 0) fighter.turn = 0;
  else {
    const rate = Math.atan2(Math.sin(heading - fighter.yawWas), Math.cos(heading - fighter.yawWas)) / dt;
    fighter.turn = (fighter.turn ?? 0) + (rate - (fighter.turn ?? 0)) * (1 - Math.exp(-dt / spec.smooth));
  }
  fighter.yawWas = heading;
  return fighter.turn;
}

/**
 * The lean into a turn, `fighter.bank` (rad, positive to his left; pose.js bank): what the turn asks of the floor (gait.js bankOf:
 * atan(v × turn / g), no more than he can hold) reached by his own lag (`lag` s) as he leans in after the turn begins, and
 * lost the same way when it ends; none at a walk or standing still. A man not in a run's footwork has none to reach.
 */
function leanIntoTurn(fighter, dt, cornering) {
  const speed = Math.hypot(fighter.rootVelocity[0], fighter.rootVelocity[1]);
  const wanted = cornering ? bankOf(fighter, speed, fighter.turn ?? 0) : 0;
  const bank = fighter.bank ?? 0;
  const next = bank + (wanted - bank) * (1 - Math.exp(-dt / WORLD.runMode.turn.lag));
  fighter.bank = Math.abs(next) < 1e-4 && !wanted ? 0 : next;
  return fighter.bank;
}

/**
 * The pose of a turn in the run pose (WORLD.runMode.turn): the shoulders led into the turn and the hips lagging it (`twist`, `hipYaw`),
 * from `fighter.turn`, the run pose's share. A straight run, and a man not running, have none.
 */
function runTurnPose(fighter, intent) {
  const spec = WORLD.runMode.turn;
  const share = fighter.runPose;
  const cap = (value, most) => Math.max(-most, Math.min(most, value));
  return {
    // (A positive rate turns him to his right, local +z is his left: the leads are the other way.)
    twist: intent.twist + cap(fighter.turn * spec.lead, spec.leadMax) * share,
    hipYaw: -cap(fighter.turn * spec.hipLag, spec.hipLagMax) * share,
  };
}

function updateIntent(world, fighter, dt) {
  const H = fighter.body.heightM;
  const style = STYLES[fighter.style];
  const idle = idleMotion(fighter, world.time);
  const walking = fighter.walking && !fighter.punch && !fighter.defence && !fighter.clinch;
  const runPose = easeRunPose(fighter, dt);
  const intent = {
    stance: runPose > 0 ? blendStance(walking ? WORLD.walk.stance : style.stance, WORLD.runMode.stance, runPose) : walking ? WORLD.walk.stance : style.stance,
    twist: walking ? 0 : idle.twist, lean: walking ? 0 : idle.lean, dip: walking ? 0 : idle.dip, shift: walking ? 0 : idle.shift,
    headOffset: vec.scale(idle.headOffset, H), guardOffset: idle.guardOffset, guardTight: fighter.guardHigh > 0,
  };
  if (runPose > 0) {
    // Running: the guard's sway gives way to the run's lean into the stride (physics/gait.js: more the faster, forward
    // gathering speed, back braking, hunched when spent).
    const spec = WORLD.runMode;
    intent.twist *= 1 - runPose;
    intent.lean = intent.lean * (1 - runPose) + runLean(fighter, dt) * runPose;
    intent.dip = intent.dip * (1 - runPose) + spec.dip * runPose;
    intent.shift *= 1 - runPose;
    // Knees straight fore and aft, elbows back by his sides (WORLD.runMode.kneeOut, POSE.runElbow).
    intent.kneeOut = POSE.kneeOut + (spec.kneeOut - POSE.kneeOut) * runPose;
    intent.runArms = runPose;
    // The body rises as the feet part (the flight) and sinks as they pass.
    intent.dip += spec.bob * (1 - runGait(fighter).spread) * runPose;
  } else if (fighter.gaitAccel !== undefined) {
    fighter.gaitAlong = undefined;
    fighter.gaitAccel = 0;
  }
  // The turn of a run, and the lean into it (a man striding on a guard's pose leans too: the lean is the floor's, not the pose's).
  const cornering = !fighter.mount && (runPose > 0 || striding(fighter));
  if (cornering) turnOf(fighter, dt);
  else if (fighter.turn !== undefined) {
    fighter.turn = 0;
    fighter.yawWas = undefined;
  }
  if (cornering || fighter.bank) {
    intent.bank = leanIntoTurn(fighter, dt, cornering);
    if (runPose > 0) Object.assign(intent, runTurnPose(fighter, intent));
  }
  // An old back stoops (aging.js).
  intent.lean += fighter.body.stoop ?? 0;
  // On horseback his trunk rides the horse's gait: leaned with its speed, rocked and swayed with its stride (physics/mounted.js).
  if (fighter.mount) {
    const sit = ridingLean(fighter, dt);
    intent.lean += sit.lean;
    intent.roll = sit.roll;
    // And through a blow, leaned out of the saddle to his man as far as the blade needs (physics/mounted.js saddleReach).
    const reach = saddleReach(fighter, dt);
    if (reach) intent.reachOut = { tilt: reach.tilt, toward: reach.toward };
  }
  // Just up off the floor: unsteady for a moment, the trunk and hips swaying as his legs find their balance (physics/rising.js standWobble).
  if (fighter.wobble) {
    const wobble = fighter.wobble;
    wobble.t += dt;
    if (wobble.t >= wobble.seconds || fighter.state !== 'up' || fighter.crawling) fighter.wobble = null;
    else {
      const [first, second] = WORLD.rise.wobble.hz;
      const fade = (1 - wobble.t / wobble.seconds) ** 2;
      const size = wobble.size * fade;
      const phase = fighter.id * 1.3;
      intent.lean += size * Math.sin(wobble.t * Math.PI * 2 * first + phase);
      intent.roll = (intent.roll ?? 0) + size * 0.7 * Math.sin(wobble.t * Math.PI * 2 * second + phase * 2);
      intent.shift += size * 0.4 * Math.sin(wobble.t * Math.PI * 2 * second + phase + 1);
      intent.dip += size * 0.15;
    }
  }
  // Dazed: the head lolls and he sways, unsteady, his guard pulled in.
  const dazed = dazedShare(fighter);
  if (dazed > 0) {
    const sway = WORLD.daze.sway * dazed;
    intent.headOffset = vec.add(intent.headOffset, [0, -sway * H, Math.sin(world.time * 3.1 + fighter.id) * sway * H]);
    intent.lean += Math.sin(world.time * 2.3 + fighter.id) * sway * 2;
    intent.shift += Math.sin(world.time * 1.7) * sway;
    intent.guardTight = true;
  }
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
    const blade = punch.spec.path === 'blade' ? bladeFor(fighter, punch.spec) : null;
    const heavy = blade?.held ? Math.max(1, Math.sqrt(blade.spec.mass / WORLD.weapons.heavyFrom)) : 1;
    // The stroke at the pace his arms give the weapon; a bow drawn as fast as he can pull it (handling.js).
    const held = punch.spec.path === 'blade' ? (blade?.held ? blade : null) : fighter.weapon?.held ? fighter.weapon : null;
    const pace = held && (punch.spec.path === 'blade' || held.spec.bow) ? (held.handling?.speed ?? 1) : 1;
    // (Waist-deep in sludge: slower, a little. Levelmode/level.js wadeGear; nothing in a battle.)
    punch.t += (punch.t < punch.spec.windup || punch.t > punch.spec.extendUntil ? dt / heavy : dt) * pace * (fighter.wading?.act ?? 1);
    punch.age += dt;
    // From the saddle the lancer keeps his point on the man all the way in (the horse carries it on its own line, not the lance's).
    if (punch.spec.couched && punch.driven && fighter.mount && punch.target !== null && !punch.at) punch.aim = toLocal(fighter, vec.add(aimPoint(world.fighters[punch.target], punch.zone), punch.miss ?? [0, 0, 0]));
    if (punch.spec.couched && !punch.driven && punch.t >= punch.spec.windup) {
      // Couched, the point is carried in (the run brings it) and driven only once it is near him.
      if (couchedNear(world, fighter, punch) || punch.age >= punch.spec.windup + punch.spec.couched.carry) punch.driven = true;
      else {
        punch.t = punch.spec.windup;
        const target = punch.target === null ? null : world.fighters[punch.target];
        if (target && !punch.at) punch.aim = toLocal(fighter, vec.add(aimPoint(target, punch.zone), punch.miss ?? [0, 0, 0]));
      }
    }
    // The other blade's half of a two-bladed move keeps the same time, `withDelay` behind.
    if (punch.with) {
      punch.with.t = punch.t - (punch.spec.withDelay ?? 0);
      punch.with.age = punch.age;
      if (punch.with.at) punch.with.aim = toLocal(fighter, punch.with.at);
    }
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
    // (Couched, he runs in upright and throws the body in behind the point only as it is driven home.)
    const phase = spec.couched ? Math.max(0, Math.min(1, (punch.t - spec.windup) / (spec.extendUntil - spec.windup))) : Math.min(1, punch.t / (spec.extendUntil * WORLD.rotationLead));
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
  pairedGun(world, fighter, intent, dt);
  weaveHead(world, fighter, intent, dt);
  const charge = fighter.rush && STYLES[fighter.style]?.charge;
  if (charge) {
    // An ape's charge (a style's `charge`): low over its arms, square on, the hands down and forward as if on its knuckles.
    intent.lean += charge.lean;
    intent.dip += charge.dip;
    intent.twist = 0;
    for (const [side, sign] of [['l', 1], ['r', -1]]) intent[`${side}Hand`] = vec.scale([charge.hands[0], charge.hands[1], sign * charge.hands[2]], H);
  } else if (fighter.rush) {
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
    intent.offBladeDir = null;
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
  if (fighter.finisher?.kneeling) finisherPose(fighter, intent);
  if (fighter.kneel) kneelPose(fighter, intent);
  if (fighter.crawling) crawlPose(fighter, intent, dt);
  if (fighter.pain) painPose(fighter, intent);
  if (fighter.tending) tendingPose(fighter, intent);
  if (fighter.netted) {
    // Bound: the arms pinned in close to the chest, the weapon with them.
    for (const [side, sign] of [['l', 1], ['r', -1]]) intent[`${side}Hand`] = [0.16 * H, 0.62 * H, sign * 0.1 * H];
    intent.bladeDir = null;
    intent.offBladeDir = null;
  }
  runCarry(world, fighter, intent, dt);
  if (fighter.handsDown) {
    // Hands at the sides, for portraits and design sheets.
    for (const [side, sign] of [['l', 1], ['r', -1]]) intent[`${side}Hand`] = [0.03 * H, 0.47 * H, sign * 0.2 * H];
    // Two blades held at his sides: both points down and forward, clear of his legs.
    if (fighter.offWeapon?.held) {
      intent.bladeDir = [0.45, -1, -0.1];
      intent.offBladeDir = [0.45, -1, 0.1];
    }
  }
  if (fighter.slip > 0) {
    // Aimed past where the head ends up: the muscles drive harder towards a
    // far target, and a slip must clear head and glove (~18 cm) in ~0.1 s.
    const slip = WORLD.headMovement.slip;
    intent.headOffset = vec.add(intent.headOffset, [-0.02 * H, -slip.down * H, (fighter.slipSide ?? 1) * slip.across * H]);
    intent.lean -= 0.05;
  }
  if (fighter.player && fighter.stamina < 0) slumpPose(world, fighter, intent, runPose);
  fighter.intent = intent;
  fighter.desired = desiredPose(fighter.body, intent);
}

/**
 * The player in the overdraft (WORLD.overdraft): the deeper he is, the more the guard and the walk give way to a slump: the stance
 * blended towards a leaning, crouched one with the hands low, the trunk hunched and the head sunk forward, the hands and weapon
 * sagging; near the floor (`stagger.from` of the depth on) he sways on his legs. A run (he cannot run in debt) keeps its own pose.
 */
function slumpPose(world, fighter, intent, runPose) {
  if (fighter.state !== 'up' || fighter.mount || fighter.crawling || fighter.pin || fighter.finisher) return;
  const depth = overdraftDepth(fighter.stamina) * (1 - runPose);
  if (depth <= 0) return;
  const spec = WORLD.overdraft;
  const post = spec.posture;
  const H = fighter.body.heightM;
  intent.stance = blendStance({ lean: POSE.forwardLean, crouch: POSE.crouch, guardHeight: 0, ...intent.stance }, post.stance, depth);
  intent.lean += post.hunch * depth;
  intent.dip += post.dip * depth;
  intent.headOffset = vec.add(intent.headOffset, [post.headForward * H * depth, -post.headDrop * H * depth, 0]);
  // Hands set by a weapon or a shield sag too, unless a blow or a hold has them.
  if (!fighter.punch && !fighter.clinch && !fighter.pickup && !fighter.pain && !fighter.tending && !fighter.netted) {
    for (const side of ['l', 'r']) if (intent[`${side}Hand`]) intent[`${side}Hand`] = vec.add(intent[`${side}Hand`], [0, -post.handDrop * H * depth, 0]);
  }
  const stagger = Math.max(0, (depth - spec.stagger.from) / (1 - spec.stagger.from));
  if (stagger > 0) {
    const time = world.time * Math.PI * 2;
    const slow = Math.sin(time * spec.stagger.hz[0] + fighter.id * 1.3);
    const quick = Math.sin(time * spec.stagger.hz[1] + fighter.id * 2.6);
    intent.shift += spec.stagger.shift * stagger * slow;
    intent.headOffset = vec.add(intent.headOffset, [0, 0, spec.stagger.head * H * stagger * quick]);
    intent.roll = (intent.roll ?? 0) + spec.stagger.roll * stagger * quick;
  }
}

/**
 * On his knees: both down, shins back along the floor, the body low and
 * forward over the hands on the floor before him. Each step a knee and the
 * opposite hand go forward together, as far as his pace carries him; a leg
 * whose joint is broken has no muscle and drags.
 */
/**
 * Level mode: tending a wound (a bandage going on). Stooped a little over it, both hands at his
 * side, the weapon pointed down out of the way; eased in over the first quarter second.
 */
function tendingPose(fighter, intent) {
  const share = Math.min(1, fighter.tending.t / 0.25);
  const H = fighter.body.heightM;
  intent.dip += WORLD.tend.dip * share;
  intent.lean += WORLD.tend.lean * share;
  intent.lHand = vec.lerp(intent.lHand ?? [0.2 * H, 0.6 * H, 0.12 * H], [0.16 * H, 0.56 * H, 0.1 * H], share);
  intent.rHand = vec.lerp(intent.rHand ?? [0.2 * H, 0.6 * H, -0.12 * H], [0.12 * H, 0.6 * H, -0.04 * H], share);
  intent.bladeDir = [0.3, -1, 0];
  intent.offBladeDir = null;
}

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
  if (fighter.offWeapon?.held) intent.offBladeDir = [0.4, -1, 0];
}

/**
 * The finisher's kneel (finisher.js): down on both knees beside the man on the floor, bowed over him, the weight forward over
 * the dagger hand. Eased in as `kneeling` goes 0 to 1; the thrust itself is an ordinary blade stroke from here.
 */
function finisherPose(fighter, intent) {
  const share = fighter.finisher.kneeling;
  const H = fighter.body.heightM;
  const L = fighter.body.lengths;
  intent.dip += WORLD.pin.dip * share;
  intent.lean += WORLD.pin.lean * share;
  intent.guardTight = false;
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    intent[`${side}Knee`] = [0.06 * H, L.ankle + 0.02, sign * 0.1 * H];
    intent[`${side}Foot`] = [0.06 * H - L.shank * 0.95, L.ankle, sign * 0.11 * H];
  }
}

/**
 * A scene's kneel (level mode, levelmode/ending.js: `fighter.kneel` { share, lean?, hands? }): down on both knees as the finisher kneels, `share`
 * (0 to 1) of the way, bowed `lean` more; the hands where the scene puts them (`hands`: [left, right] world points: round a dead man's chest and
 * neck, a helm lifted to the head), the blade let hang. Nothing else sets it.
 */
function kneelPose(fighter, intent) {
  const kneel = fighter.kneel;
  const share = kneel.share ?? 1;
  const H = fighter.body.heightM;
  const L = fighter.body.lengths;
  intent.dip += WORLD.pin.dip * share;
  intent.lean += (WORLD.pin.lean + (kneel.lean ?? 0)) * share;
  intent.guardTight = false;
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    intent[`${side}Knee`] = [0.06 * H, L.ankle + 0.02, sign * 0.1 * H];
    intent[`${side}Foot`] = [0.06 * H - L.shank * 0.95, L.ankle, sign * 0.11 * H];
  }
  if (!kneel.hands) return;
  intent.lHand = toLocal(fighter, kneel.hands[0]);
  intent.rHand = toLocal(fighter, kneel.hands[1]);
  intent.twist = 0;
  intent.twoHanded = false;
  // (The blade let hang back and out to his right, away from what the hands hold.)
  intent.bladeDir = [-0.5, -1, -0.6];
  intent.offBladeDir = null;
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
  // A blow from his knees (the player's crawl): the striking hand and its blade go where the blow puts them.
  const striking = fighter.punch?.weak !== undefined ? PARTICLES[fighter.punch.limb][0] : null;
  if (striking !== 'r') intent.bladeDir = null;
  if (striking !== 'l') intent.offBladeDir = null;
  intent.guardTight = false;
  const { knee, foot, hand } = crawlStance(fighter.body);
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    // Turning right (yaw growing), the left knee is on the outside: its stride the longer.
    const step = sign * swing * (1 + sign * turning * spec.turnStride);
    intent[`${side}Knee`] = [0.02 * H + step, L.ankle + 0.02 + (sign > 0 ? lift : 0), sign * knee];
    intent[`${side}Foot`] = [0.02 * H + step - L.shank * 0.95, L.ankle, sign * foot];
    if (side !== striking) intent[`${side}Hand`] = [0.3 * H - step, 0.05 * H + (sign < 0 ? lift : 0), sign * hand];
  }
}

/**
 * How far out from his middle (m) his knees, feet and hands go on all fours,
 * by his build: the knees under the hip joints, pushed apart by the thickness
 * of his thighs (a thin man's nearly together, a heavy man's well apart);
 * the hands under the shoulders, out by the thickness of his arms.
 */
export function crawlStance(body) {
  const spec = WORLD.crawl;
  const thigh = body.segments.lThigh.skinRadius;
  const arm = body.segments.lUpperArm.skinRadius;
  const knee = body.lengths.hipSpan / 2 + Math.max(0, thigh - spec.leanThigh) * spec.thighApart;
  return { knee, foot: knee + spec.footOut * body.heightM, hand: body.lengths.shoulderSpan / 2 + arm * spec.armApart };
}

/**
 * Down on his knees to crawl away: what is in his hands is let go (they are
 * on the floor now), and he is out of the fight. `reason` for the log.
 */
export function startCrawl(world, fighter, reason, { keep = false } = {}) {
  if (fighter.crawling || fighter.state === 'out') return false;
  fighter.crawling = true;
  fighter.punch = null;
  fighter.rush = null;
  fighter.clinch = null;
  fighter.pin = null;
  fighter.pickup = null;
  fighter.defence = null;
  fighter.running = false;
  // (Down by his own choice, the player keeps hold of his weapon: `keep`.)
  if (fighter.weapon?.held && !keep) releaseWeapon(world, fighter, 'dropped', [0, 0, 0]);
  world.events.push({ time: world.time, kind: 'crawl', fighter: fighter.id, effects: [reason] });
  return true;
}

/** Crawling away (out of the fight on his knees), not crawling by his own choice (the player's crawl, which is still fighting). */
export function crawlingAway(fighter) {
  return Boolean(fighter.crawling && !fighter.crawlChosen);
}

/** Still in the fight: not out, and not crawling away. */
export function inFight(fighter) {
  // A player walking about on his knees (walk mode), or crawling by choice, has not left it; a man who fled the field has.
  return fighter.state !== 'out' && !fighter.fled && !fighter.dormant && !fighter.floored && !(fighter.crawling && !fighter.walking && !fighter.crawlChosen);
}

/**
 * Whether two men are enemies: of different corners, neither in the neutral corner ('grey': the
 * civilians and prisoners of level mode, whom nobody targets and who target nobody).
 */
export function hostile(first, second) {
  return first.corner !== second.corner && first.corner !== 'grey' && second.corner !== 'grey';
}

/** A leg that will not bear him: a knee or hip broken. */
export function legBroken(fighter) {
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
  const busy = fighter.punch || fighter.clinch || fighter.pin || fighter.pickup || fighter.defence || fighter.crawling || fighter.kneel || fighter.state !== 'up';
  const running = (fighter.running || speed > spec.runningSpeed) && !busy;
  // Walking about, the guard is down whoever is near.
  const want = (fighter.walking || fighter.runPose > 0.5) && !busy ? 1 : running && nearest > spec.guardFrom ? Math.min(1, (nearest - spec.guardFrom) / (spec.relaxFrom - spec.guardFrom)) : 0;
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
    const swinging = fighter.runPose > 0 ? runHand(fighter, 'free', side) : [0.04 * H + sign * stride * spec.swing * H, 0.52 * H, sign * 0.19 * H];
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
  defence.t += dt * (fighter.wading?.act ?? 1);
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
  } else if (defence.name === 'sidestep') {
    // Off the line, not along it (moveRoot drives the step).
    fighter.move = 0;
    fighter.strafe = 0;
  }
  if (defence.t >= defence.seconds) {
    if (defence.name === 'stepBack' || defence.name === 'sidestep') fighter.move = 0;
    fighter.defence = null;
  }
}

// ---- Footwork -------------------------------------------------------------

export function plantFeet(fighter) {
  fighter.feet = {};
  for (const side of ['l', 'r']) {
    const index = P[`${side}Foot`];
    fighter.feet[side] = { index, planted: point(fighter.x, index), step: null, floor: undefined };
  }
}

/** Feet stay planted while the stance drifts, then step to catch up, one at a time. */
function updateFeet(world, fighter, dt) {
  // In the stirrups: no steps.
  if (fighter.mount) return;
  if (fighter.state !== 'up' && fighter.state !== 'rising') {
    plantFeet(fighter);
    return;
  }
  // Getting up, he stands up off the feet where he put them; he steps once up.
  if (fighter.state === 'rising') return;
  // Running (anyone at a run's pace, or in the run's pose): longer steps, the next foot away before the last has landed, laid out for
  // his speed and body (physics/gait.js strideOf). On a stair (or a steep slope) the stride is the short quick step of the stair, a foot
  // to a tread, not the leaping stride of the flat.
  const stair = fighter.runSlope > WORLD.runMode.stairs.slope;
  const run = striding(fighter) ? (stair ? WORLD.runMode.stairs.step : strideOf(fighter, Math.hypot(fighter.rootVelocity[0], fighter.rootVelocity[1]))) : null;
  const spec = run ? { ...WORLD.step, ...run } : WORLD.step;
  const feet = Object.values(fighter.feet);
  for (const [side, foot] of Object.entries(fighter.feet)) {
    // A kicking, kneeing or checking leg is off the floor; when it comes
    // down it is planted where it lands.
    const lifted = !!(fighter.intent[`${side}Foot`] || fighter.intent[`${side}Knee`] || (fighter.intent.check && side === 'l'));
    if (foot.lifted && !lifted) foot.planted = [fighter.x[foot.index * 3], fighter.desired[foot.index][1], fighter.x[foot.index * 3 + 2]];
    foot.lifted = lifted;
    if (lifted) foot.step = null;
  }
  const stepping = feet.some((foot) => (foot.step && !(run && foot.step.t >= run.overlap)) || foot.lifted);
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
  // Running, a foot left as far behind his hips as his leg reaches (gait.js pushOff) goes now, the other in the air or not:
  // it is off the toe, not dragged on behind him (the flight is longer by the moment).
  const overReach = worst && run && !stair && !worst.lifted && runBehind(fighter, worst) > pushOff(fighter);
  if (worst && (!stepping || overReach)) {
    // Step to where the stance will be, not where it is: lead the motion. (On a hurt leg he hobbles: limpOf.)
    const own = run && !stair ? limped(fighter, worst, spec) : spec;
    const to = landingOf(fighter, worst, own, run ? 1 : null, 0);
    // (floorFrom, floorTo: the floor under the foot at each end of the step, set on terrain: groundStance.)
    // (A run's long stride is aimed again as it goes, while the foot is in the air: `retarget`.)
    // (A run's foot comes up behind him at once, the heel towards the seat, and is highest a third of the way through its swing: `early`.)
    // (A run's swing is laid out about the stance, from where the foot leaves it: `rel`, the take-off from the stance's root; runSwing.)
    worst.step = { from: [...worst.planted], to, t: 0, floorFrom: undefined, floorTo: undefined, seconds: own.seconds, lift: run ? spec.lift : undefined, retarget: Boolean(run) && !stair, early: Boolean(run) && !stair, rel: run && !stair ? [worst.planted[0] - fighter.root[0], worst.planted[2] - fighter.root[1]] : undefined };
  }
  for (const foot of feet) {
    if (!foot.step) continue;
    foot.step.t += dt / foot.step.seconds;
    if (foot.step.retarget) {
      if (foot.step.t < WORLD.runMode.settle && run) foot.step.to = landingOf(fighter, foot, { ...limped(fighter, foot, spec), seconds: foot.step.seconds }, 1, foot.step.t);
      else foot.step.retarget = false;
    }
    if (foot.step.t >= 1) {
      // Heard: the foot coming down, where it lands, at the pace he is going.
      if (world.ear) soundStep(world, fighter, foot.index === P.lFoot ? 'l' : 'r', [foot.step.to[0], fighter.x[foot.index * 3 + 1], foot.step.to[2]], Math.hypot(fighter.rootVelocity[0], fighter.rootVelocity[1]));
      foot.planted = foot.step.to;
      foot.step = null;
    }
  }
}

/** How far (m) a foot's planted place is behind where his stance has that foot, along his facing. */
function runBehind(fighter, foot) {
  const forward = yawRotate([1, 0, 0], fighter.yaw);
  return (foot.desired[0] - foot.planted[0]) * forward[0] + (foot.desired[2] - foot.planted[2]) * forward[2];
}

/** Is he striding (a run's footwork): in the run's pose, or running (or carried on from a run) faster than a run's pace (WORLD.gait.runFrom)? */
function striding(fighter) {
  if (fighter.crawling || fighter.pin || fighter.finisher?.kneeling || fighter.kneel || fighter.rush) return false;
  return fighter.runPose > 0.3 || (fighter.gaitCarry && Math.hypot(fighter.rootVelocity[0], fighter.rootVelocity[1]) > WORLD.gait.runFrom);
}

/** A run's step for this foot on a hurt leg (physics/gait.js limpOf): the swing off the bad leg quicker, the step shorter. */
function limped(fighter, foot, spec) {
  if (fighter.legDamage.l + fighter.legDamage.r <= 0 && fighter.stamina > 0) return spec;
  const limp = limpOf(fighter, foot.index === P.lFoot ? 'l' : 'r');
  if (limp.seconds >= 1 && limp.length >= 1) return spec;
  return { ...spec, seconds: spec.seconds * limp.seconds, lead: 1 + (spec.lead - 1) * limp.length };
}

/**
 * Where a foot's step is to land: where the stance will be when it does, `ahead` (a stride's lead, WORLD.step.lead, with the swing `done` share
 * gone) of his speed on. A run (`run` set) goes by the chord of the arc he is turning on, and the sprint turn's footwork (turnedStep).
 */
function landingOf(fighter, foot, spec, run, done) {
  const time = done === 0 ? spec.lead * spec.seconds : spec.seconds * (1 - done) + (spec.lead - 1) * spec.seconds;
  let [vx, vz] = fighter.rootVelocity;
  if (run && fighter.turn) {
    const half = (-fighter.turn * time) / 2;
    const chord = Math.abs(half) > 1e-3 ? Math.sin(half) / half : 1;
    [vx, vz] = [(vx * Math.cos(half) - vz * Math.sin(half)) * chord, (vx * Math.sin(half) + vz * Math.cos(half)) * chord];
  }
  const to = [foot.desired[0] + vx * time, foot.desired[1], foot.desired[2] + vz * time];
  if (run) turnedStep(fighter, foot, to);
  return to;
}

/**
 * A step in a turn at a run (WORLD.runMode.turn): the landing `to` is moved in place so that the foot lands in the direction of travel
 * (the stance is turned to the facing, the travel lags it) and on its own side of the other foot, not across it (`gap`). The feet are out to
 * the outside of his centre of mass already, as far as the lean puts them (pose.js); and each foot goes round the curve on its own radius:
 * its step is as much longer or shorter than the centre's as its radius is (the outer foot goes the longer way round the same angle), the
 * radius being the one the turn is on (the speed over the rate of turning) and the foot's distance in or out of it. Nothing at a straight
 * run (no turn, no change).
 */
function turnedStep(fighter, foot, to) {
  const spec = WORLD.runMode.turn;
  const speed = Math.hypot(fighter.rootVelocity[0], fighter.rootVelocity[1]);
  const turn = fighter.turn ?? 0;
  if (Math.abs(turn) < spec.full || speed < 0.5) return;
  const H = fighter.body.heightM;
  const ux = fighter.rootVelocity[0] / speed;
  const uz = fighter.rootVelocity[1] / speed;
  // (Where he will be when it lands: the stance's own place for the foot, from him, is the same.)
  const dx = foot.desired[0] - fighter.root[0];
  const dz = foot.desired[2] - fighter.root[1];
  const across = -dx * uz + dz * ux;
  const along = dx * ux + dz * uz;
  // Left of the line of travel is +, as the foot index says: the left foot is on that side. The middle of his two feet, across (the lean
  // has put it out to the outside of his centre of mass): a foot lands to its own side of that, at least `gap` from it.
  const side = foot.index === P.lFoot ? 1 : -1;
  const middle = (fighter.desired[P.lFoot][2] + fighter.desired[P.rFoot][2]) / 2;
  let wanted = middle + side * Math.max(side * (across - middle), spec.gap * H);
  // ...and to its own side of where the other foot is (planted, or coming down), where he will have gone to when this one lands.
  const other = fighter.feet[side === 1 ? 'r' : 'l'];
  const there = other.step ? other.step.to : other.planted;
  const gone = [to[0] - foot.desired[0], to[2] - foot.desired[2]];
  const otherAcross = -(there[0] - fighter.root[0] - gone[0]) * uz + (there[2] - fighter.root[1] - gone[1]) * ux;
  if (side * (wanted - otherAcross) < spec.gap * H) wanted = otherAcross + side * spec.gap * H;
  // The centre of the curve is to his right in a right turn (turn > 0), his left in a left one: `out`, how far outside the centre's radius
  // (speed over rate) the foot is. Its step round the same angle is that much longer than the centre's.
  const out = Math.sign(turn) * across;
  const length = along * (1 + (Math.abs(turn) * out) / speed);
  to[0] += (length - along) * ux - (wanted - across) * uz;
  to[2] += (length - along) * uz + (wanted - across) * ux;
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
  // Toward a drop edge, the floor runs on to the edge itself.
  const outer = arena.drop ? arena.drop.at - margin : arena.halfZ - margin;
  return [Math.max(-(arena.halfX - margin), Math.min(arena.halfX - margin, target[0])), target[1], Math.max(-(arena.halfZ - margin), Math.min(outer, target[2]))];
}

function rawFootTarget(fighter, foot) {
  if (foot.lifted) return toWorld(fighter, fighter.desired[foot.index]);
  if (!foot.step) {
    const base = foot.floor === undefined ? fighter.desired[foot.index][1] : fighter.desired[foot.index][1] + foot.floor;
    return [foot.planted[0], base + heelRise(fighter, foot, base), foot.planted[2]];
  }
  const t = foot.step.t;
  const ease = t * t * (3 - 2 * t);
  const along = vec.lerp(foot.step.from, foot.step.to, ease);
  if (foot.step.rel) {
    const swing = runSwing(fighter, foot.step);
    along[0] = swing.at[0];
    along[2] = swing.at[1];
  }
  // On terrain the foot rises to the next tread early (and drops to a lower one late), and clears the edge.
  const arc = Math.sin(Math.PI * (foot.step.early ? t ** WORLD.gait.heelUp : t));
  if (foot.step.floorFrom !== undefined) return [along[0], fighter.desired[foot.index][1] + (foot.step.lift ?? WORLD.step.lift) * arc + stepHeight(foot.step, t), along[2]];
  return [along[0], fighter.desired[foot.index][1] + (foot.step.lift ?? WORLD.step.lift) * arc, along[2]];
}

/**
 * Running, how far a planted foot's ankle rises off the floor as his hips go on past it (WORLD.runMode.heel): up on the ball of
 * the foot, the heel lifting, so that the leg pushing off behind him is no longer than it is (`reach` of its length, the knee
 * still a little bent). Held flat to the floor, a foot left 0.5 m behind his hips could be reached only by his hips coming down
 * to it: the stride's push-off dragged him into a crouch. No higher than `most` of his height (the heel up, the toes down).
 */
function heelRise(fighter, foot, base) {
  if (!(fighter.runPose > 0) || fighter.state !== 'up') return 0;
  const spec = WORLD.runMode.heel;
  const side = foot.index === P.lFoot ? 'l' : 'r';
  // (Where the pose has his hip, not where it has sagged to: the foot rises for the hips the pose wants.)
  const hip = toWorld(fighter, fighter.desired[P[`${side}Hip`]]);
  const behind = (hip[0] - foot.planted[0]) * Math.cos(fighter.yaw) - (hip[2] - foot.planted[2]) * Math.sin(fighter.yaw);
  if (behind <= 0) return 0;
  const reach = spec.reach * (fighter.body.lengths.thigh + fighter.body.lengths.shank);
  const flat = Math.hypot(hip[0] - foot.planted[0], hip[2] - foot.planted[2]);
  const ankle = hip[1] - Math.sqrt(Math.max(0, reach * reach - flat * flat));
  return Math.min(spec.most * fighter.body.heightM, Math.max(0, ankle - base)) * fighter.runPose;
}

/**
 * How fast a run's swinging foot is meant to go (the swing's own rate along its path, horizontally): its muscles drive it with
 * its target, not against it (at a sprint the foot comes through at twice the body's speed). Nothing for any other step: a
 * guard's quick step is placed, a planted foot stands.
 */
function swingVelocity(fighter, foot) {
  const step = foot.step;
  if (!step?.early || foot.lifted) return [0, 0, 0];
  if (step.rel) {
    // (Up and down too, as the arc rises and falls: held to no speed upwards, the foot lagged its arc and came down late.)
    const { velocity } = runSwing(fighter, step);
    const t = Math.min(1, Math.max(1e-3, step.t));
    const h = WORLD.gait.heelUp;
    const rise = step.lift ? (step.lift * Math.cos(Math.PI * t ** h) * Math.PI * h * t ** (h - 1)) / step.seconds : 0;
    return [velocity[0], rise, velocity[1]];
  }
  const t = step.t;
  const rate = (6 * t * (1 - t)) / step.seconds;
  return [(step.to[0] - step.from[0]) * rate, 0, (step.to[2] - step.from[2]) * rate];
}

/**
 * Where a run's swinging foot is on the floor's plane now, and how fast it goes ([x, z] each): on a cubic (Hermite) path in the
 * frame that goes with his stance, from the take-off (`step.rel`, from the stance's root) to the landing (`step.to`, from
 * where the stance will be when it lands), leaving with a little more travel back (WORLD.runMode.swing.back: off the toe
 * the foot goes on back a moment as it rises, the heel to the seat) and landing swept back under him (`pull`). It does not
 * trail far behind him and then reach far ahead, as a straight line from floor to floor did: the leg folds under him.
 */
function runSwing(fighter, step) {
  const spec = WORLD.runMode.swing;
  const t = Math.min(1, step.t);
  const T = step.seconds;
  const [vx, vz] = fighter.rootVelocity;
  const root = [fighter.root[0], fighter.root[1]];
  // From the stance where it will be as the foot lands.
  const left = (1 - t) * T;
  const end = [step.to[0] - (root[0] + vx * left), step.to[2] - (root[1] + vz * left)];
  const start = step.rel;
  // Tangents (per unit of the swing's share): back along his way.
  const back = [-vx * T * spec.back, -vz * T * spec.back];
  const pull = [-vx * T * spec.pull, -vz * T * spec.pull];
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const d00 = 6 * t2 - 6 * t;
  const d10 = 3 * t2 - 4 * t + 1;
  const d01 = -6 * t2 + 6 * t;
  const d11 = 3 * t2 - 2 * t;
  const at = [0, 1].map((k) => root[k] + h00 * start[k] + h10 * back[k] + h01 * end[k] + h11 * pull[k]);
  const velocity = [vx, vz].map((v, k) => v + (d00 * start[k] + d10 * back[k] + d01 * end[k] + d11 * pull[k]) / T);
  return { at, velocity };
}

/** The floor height under a foot a share `t` of the way through a step onto terrain, and the clearance it needs over the edge. */
function stepHeight(step, t) {
  return stepBase(step.floorFrom, step.floorTo, t) + Math.max(0, step.floorTo - step.floorFrom) * 0.25 * Math.sin(Math.PI * t);
}

/** The floor height a foot a share `t` through a step from one floor to another has come to (it rises early, drops late). */
function stepBase(from, to, t) {
  const change = to - from;
  const early = Math.min(1, t * 1.7);
  const late = Math.min(1, Math.max(0, t * 1.5 - 0.4));
  return from + change * (change > 0 ? early * early * (3 - 2 * early) : late * late * (3 - 2 * late));
}

/**
 * On terrain, each step: the floor under each foot, and the height the stance
 * stands at: that of the lower foot (his legs are straight when standing: the hips cannot be higher than
 * the lower foot can reach, and the higher foot's knee bends). A foot that can reach its floor (within a
 * step up and WORLD.terrain.stepDown down of the stance) plants there; one that cannot dangles a step below; with neither on a floor he is
 * in the air and the stance falls with him. Not on his feet (down, rising, kneeling), the
 * stance's floor is the one under his hips, and fixed while he rises.
 */
function groundStance(fighter, dt) {
  const terrain = fighter.arena.terrain;
  const spec = WORLD.terrain;
  const lift = fighter.lift ?? 0;
  const pelvis = P.pelvis * 3;
  const feet = fighter.feet;
  if (!(fighter.state === 'up' && !fighter.mount && !fighter.crawling && !fighter.pin && !fighter.finisher?.kneeling && !fighter.kneel)) {
    fighter.air = false;
    if (fighter.state !== 'rising') {
      const under = floorAt(terrain, fighter.x[pelvis], fighter.x[pelvis + 2], fighter.x[pelvis + 1] + spec.stepUp);
      if (under > -Infinity) fighter.lift = under;
      // Well clear of the floor (thrown, fallen, knocked off a ledge): falling.
      fighter.air = fighter.x[pelvis + 1] - (under > -Infinity ? under : -Infinity) > spec.airborne;
    }
    feet.l.floor = feet.r.floor = fighter.lift ?? 0;
    return;
  }
  const reach = lift - spec.reachDown;
  const sides = ['l', 'r'];
  const real = [-Infinity, -Infinity];
  let bearing = 0;
  let lowest = Infinity;
  for (let k = 0; k < 2; k += 1) {
    const foot = feet[sides[k]];
    if (foot.lifted) continue;
    // A step just begun is aimed to land on one floor, not astride the edge of two, and no
    // more than a stride up: where the tread it points at is too high, it is cut short.
    if (foot.step && (foot.step.floorFrom === undefined || foot.step.retarget)) {
      const { from, to } = foot.step;
      let share = 1;
      while (share > 0.2 && floorAt(terrain, from[0] + (to[0] - from[0]) * share, from[2] + (to[2] - from[2]) * share, lift + spec.stepUp + 0.6) > lift + spec.sag + spec.stepUp) share -= 0.2;
      const aim = awayFromEdges(terrain, [from[0] + (to[0] - from[0]) * share, from[2] + (to[2] - from[2]) * share], lift + spec.stepUp);
      foot.step.to = [aim[0], to[1], aim[1]];
    }
    const at = foot.step ? foot.step.to : foot.planted;
    // (As far above the stance as the aim above allows: the stance is held `sag` under the lower foot's floor.)
    real[k] = floorAt(terrain, at[0], at[2], lift + spec.sag + spec.stepUp);
    if (real[k] >= reach) {
      bearing += 1;
      // The stance rises with the foot, not ahead of it: a foot part way through a step has come that far.
      lowest = Math.min(lowest, foot.step ? stepBase(foot.step.floorFrom ?? foot.floor ?? real[k], real[k], foot.step.t) : real[k]);
    }
  }
  let now = lift;
  const falling = fighter.air === true && fighter.v[pelvis + 1] < -spec.fallingSpeed;
  fighter.air = bearing === 0;
  // Coming down fast, he is in the air until a foot is on the floor (not caught by his legs in mid-air).
  if (falling && !fighter.air) {
    let touching = false;
    for (const side of sides) {
      const foot = feet[side];
      const y = fighter.x[foot.index * 3 + 1] - fighter.radius[foot.index];
      if (y - floorAt(terrain, fighter.x[foot.index * 3], fighter.x[foot.index * 3 + 2], y + spec.stepUp) < spec.touching) touching = true;
    }
    fighter.air = !touching;
  }
  if (fighter.air) {
    // Nothing under his feet: the stance goes down with him, the feet hanging under it.
    now = Math.min(lift, fighter.x[pelvis + 1] - fighter.desired[P.pelvis][1]);
    for (const side of sides) {
      const foot = feet[side];
      if (foot.step) foot.planted = foot.step.to;
      foot.step = null;
      if (!foot.lifted) foot.planted = [fighter.x[foot.index * 3], fighter.desired[foot.index][1], fighter.x[foot.index * 3 + 2]];
    }
  } else now = lift + (lowest - spec.sag - lift) * Math.min(1, dt * spec.liftRate);
  fighter.lift = now;
  for (let k = 0; k < 2; k += 1) {
    const foot = feet[sides[k]];
    if (foot.lifted) continue;
    const floor = fighter.air ? now - spec.airReach : real[k] >= reach ? real[k] : now - spec.stepDown;
    if (foot.step) {
      foot.step.floorFrom ??= foot.floor ?? floor;
      foot.step.floorTo = floor;
    } else foot.floor = floor;
  }
}

/** How long (s) the fighter was in the air (off every floor) in the spell that is on now, or ended no more than `together` ago; 0 if none. */
function airSpell(world, fighter) {
  if (fighter.airEnd === undefined || world.time - fighter.airEnd > WORLD.terrain.fall.together) return 0;
  return fighter.airEnd - fighter.airSince;
}

/** On terrain, note when each spell in the air begins and ends (a landing is hurt only after a real one: airSpell). */
function trackAir(fighter, time) {
  if (fighter.air) {
    if (!fighter.airWas) fighter.airSince = time;
    fighter.airEnd = time;
  }
  fighter.airWas = fighter.air === true;
}

// ---- Jumping (physics/jump.js: the body's numbers; WORLD.jump) ------------------------------

/** The jump he could make now: jump.js's takeoff with his legs as sound and fresh as they are, and why he cannot (null if he can). */
export function jumpNow(world, fighter) {
  const model = jumpOf(fighter, { legs: limbShares(fighter).leg, strength: fighter.motorScale ?? 1 });
  let blocked = jumpBlocked(fighter, world.time);
  if (!blocked && legBroken(fighter)) blocked = 'hurt';
  if (!blocked && !model.can) blocked = 'weak';
  // (Anyone but the man played stops at empty: he cannot pay for it. The player can, into his overdraft.)
  if (!blocked && !fighter.player && fighter.stamina < model.cost) blocked = 'spent';
  return { ...model, blocked };
}

/**
 * Jump: he gathers (the hips dip `crouch.depth` of the push), then goes up at the speed his body gives (jumpNow), carrying the
 * way he was going (and `forward` of the takeoff along it); the flight is the body's own; he lands on his legs (landJump). It
 * costs stamina by the work. False if he cannot jump now.
 */
export function startJump(world, fighter) {
  const model = jumpNow(world, fighter);
  if (model.blocked) return false;
  const running = Math.max(WORLD.jump.crouch.running, 1 - Math.hypot(fighter.rootVelocity[0], fighter.rootVelocity[1]) / WORLD.jump.crouch.fast);
  drawStamina(fighter, model.cost);
  fighter.defence = null;
  fighter.rush = null;
  fighter.jump = {
    // (Gathered quicker and shallower on the run: a running takeoff has little dip.)
    phase: 'crouch', t: 0, model, base: fighter.lift, standing: fighter.lift ?? 0, depth: WORLD.jump.crouch.depth * model.push * running,
    crouch: WORLD.jump.crouch.seconds * running,
    from: fighter.x[P.pelvis * 3 + 1], apex: -Infinity, takeoff: 0, ground: 0, landing: null, bumped: false,
  };
  world.events.push({ time: world.time, kind: 'jump', fighter: fighter.id, height: model.height, effects: ['jumps'] });
  return true;
}

/** The floor under a foot (or any part) at (x, z), a stride above y: the terrain's, or the flat floor's. */
function floorBelow(fighter, x, y, z) {
  const terrain = fighter.arena.terrain;
  if (terrain) return floorAt(terrain, x, z, y + WORLD.terrain.stepUp);
  return floorUnder(fighter.arena, z);
}

/** A landing's bruise heals at WORLD.jump.land.heal (leg damage per s); a broken leg's does not matter. */
function healLandBruise(fighter, dt) {
  const bruise = fighter.landBruise;
  let left = 0;
  for (const side of ['l', 'r']) {
    const heal = Math.min(bruise[side], WORLD.jump.land.heal * dt);
    bruise[side] -= heal;
    fighter.legDamage[side] = Math.max(0, fighter.legDamage[side] - heal);
    left += bruise[side];
  }
  if (left <= 0) fighter.landBruise = undefined;
}

/** A jump's end: the stance his again (the floor's on terrain, the flat floor's lift otherwise), the flight over. */
function endJump(fighter) {
  const jump = fighter.jump;
  if (!jump) return;
  fighter.jump = null;
  fighter.air = false;
  if (fighter.arena.terrain) return;
  fighter.lift = jump.base;
  for (const foot of Object.values(fighter.feet)) foot.floor = undefined;
}

/** Each step of a jump: the crouch, the flight (the stance following the hips, the feet tucked, a ceiling stopping him) and the landing's dip. */
function jumpStance(world, fighter, dt) {
  const jump = fighter.jump;
  // Knocked down, mounted or on his knees in the meantime: the jump is over (a man falling is the floor's).
  if (fighter.state !== 'up' || fighter.mount || fighter.crawling) {
    endJump(fighter);
    return;
  }
  const spec = WORLD.jump;
  const pelvis = P.pelvis * 3;
  jump.t += dt;
  if (jump.phase === 'crouch') {
    const share = Math.min(1, jump.t / jump.crouch);
    fighter.lift = jump.standing - jump.depth * share * share * (3 - 2 * share);
    // (Run off the edge while gathering: he goes from the last foot down, not on over the drop.)
    if (share >= 1 || overTheDrop(fighter, jump.standing)) launch(world, fighter);
    return;
  }
  const feet = fighter.feet;
  if (jump.phase === 'air') {
    fighter.air = true;
    const y = fighter.x[pelvis + 1];
    const vy = fighter.v[pelvis + 1];
    jump.apex = Math.max(jump.apex, y);
    // The knees come up as he rises and go down again to meet the floor. The stance is where his feet are: over the hips'
    // standing height by the tuck (its floor is what a ledge's face is measured from: keepClearOfSolids), under the hips as they fly.
    const tuck = spec.tuck * jumpLegLength(fighter) * Math.max(0, Math.min(1, 1 + vy / (0.35 * Math.max(0.5, jump.model.v))));
    fighter.lift = y - fighter.desired[P.pelvis][1] + tuck;
    const turned = yawRotate(fighter.desired[P.pelvis], fighter.yaw);
    fighter.root[0] = fighter.x[pelvis] - turned[0];
    fighter.root[1] = fighter.x[pelvis + 2] - turned[2];
    fighter.rootVelocity[0] = fighter.v[pelvis];
    fighter.rootVelocity[1] = fighter.v[pelvis + 2];
    for (const foot of Object.values(feet)) {
      if (foot.step) foot.planted = foot.step.to;
      foot.step = null;
      if (!foot.lifted) {
        const under = toWorld(fighter, fighter.desired[foot.index]);
        foot.planted = [under[0], fighter.desired[foot.index][1], under[2]];
      }
      foot.floor = fighter.lift;
    }
    // Come to rest across a ledge on his hips or his belly, his feet hanging under its edge: the jump fell short. He slides
    // back off it and goes down (a ledge is got onto on the feet, not scrambled up).
    if (jump.t > 0.15 && Math.abs(vy) < 0.05) {
      const hips = floorBelow(fighter, fighter.x[pelvis], y - fighter.radius[P.pelvis], fighter.x[pelvis + 2]);
      if (y - fighter.radius[P.pelvis] - hips < 0.03) {
        endJump(fighter);
        fighter.knock = [0, 0, 0];
        const back = yawRotate([-WORLD.jump.slideBack, 0, 0], fighter.yaw);
        for (let index = 0; index < fighter.v.length; index += 3) {
          fighter.v[index] += back[0];
          fighter.v[index + 2] += back[2];
        }
        fall(world, fighter, 'falls short of the ledge');
        return;
      }
    }
    // Headroom: rising into a ceiling, his head stops there and so does he.
    const terrain = fighter.arena.terrain;
    if (terrain?.ceilings && vy > 0) {
      const head = P.head * 3;
      const radius = fighter.radius[P.head];
      const ceiling = ceilingAt(terrain, fighter.x[head], fighter.x[head + 2], fighter.x[head + 1] - radius);
      if (fighter.x[head + 1] + radius >= ceiling - 0.03) {
        for (let index = 1; index < fighter.v.length; index += 3) fighter.v[index] = Math.min(0, fighter.v[index]);
        if (!jump.bumped) world.events.push({ time: world.time, kind: 'impact', fighter: fighter.id, target: 'head', speed: vy, effects: ['head against the ceiling'] });
        jump.bumped = true;
      }
    }
    // Coming down (or come to rest on a ledge): the first foot on a floor is the landing. (A flight cannot last: 3 s is down.)
    if ((vy < 0.2 && jump.t > 0.1) || jump.t > 3) {
      let floor = -Infinity;
      let touched = false;
      for (const foot of Object.values(feet)) {
        const at = foot.index * 3;
        const bottom = fighter.x[at + 1] - fighter.radius[foot.index];
        const under = floorBelow(fighter, fighter.x[at], bottom, fighter.x[at + 2]);
        floor = Math.max(floor, under);
        // (A step ahead at the speed he falls: met the step before, not a step into the floor at full speed.)
        if (bottom - under < WORLD.terrain.touching + 0.02 + Math.max(0, -fighter.v[at + 1]) * dt) touched = true;
      }
      // (Or the hips are down to standing height over that floor: the legs, reaching down, are on it.)
      if (y - floor <= fighter.desired[P.pelvis][1] - WORLD.terrain.sag || jump.t > 3) touched = true;
      if (touched) landJump(world, fighter, -vy, floor);
    }
    return;
  }
  // The landing: the knees give and come back.
  const landing = jump.landing;
  const share = Math.min(1, jump.t / landing.seconds);
  const dip = landing.dip * (share < 0.3 ? Math.sin((share / 0.3) * Math.PI * 0.5) : 0.5 + 0.5 * Math.cos(((share - 0.3) / 0.7) * Math.PI));
  fighter.lift = jump.ground - dip;
  if (share >= 1) {
    fighter.lift = fighter.arena.terrain ? jump.ground : jump.base;
    endJump(fighter);
  }
}

const jumpLegLength = (fighter) => fighter.body.lengths.thigh + fighter.body.lengths.shank;

/** Whether both feet are over a floor well under the one he gathered on (he has run off its edge). */
function overTheDrop(fighter, standing) {
  for (const foot of Object.values(fighter.feet)) {
    const at = foot.index * 3;
    if (floorBelow(fighter, fighter.x[at], fighter.x[at + 1] - fighter.radius[foot.index], fighter.x[at + 2]) > standing - WORLD.terrain.reachDown) return false;
  }
  return true;
}

/** Off the floor: every part given the takeoff speed (enough, from the crouch, to lift the hips `height` over where he stood). */
function launch(world, fighter) {
  const jump = fighter.jump;
  const spec = WORLD.jump;
  const pelvis = P.pelvis * 3;
  const standingY = jump.standing + fighter.desired[P.pelvis][1];
  const below = Math.max(0, standingY - fighter.x[pelvis + 1]);
  const up = Math.sqrt(jump.model.v * jump.model.v + 2 * WORLD.gravity * below);
  // Moving, the jump goes along his way.
  const speed = Math.hypot(fighter.rootVelocity[0], fighter.rootVelocity[1]);
  const along = speed > 0.3 ? [fighter.rootVelocity[0] / speed, fighter.rootVelocity[1] / speed] : [0, 0];
  const push = spec.forward * jump.model.v;
  fighter.rootVelocity[0] += along[0] * push;
  fighter.rootVelocity[1] += along[1] * push;
  for (let index = 0; index < fighter.v.length; index += 3) {
    fighter.v[index] += along[0] * push;
    fighter.v[index + 1] = up;
    fighter.v[index + 2] += along[1] * push;
  }
  jump.phase = 'air';
  jump.t = 0;
  jump.takeoff = world.time;
  fighter.air = true;
}

/**
 * Down on his feet at `speed` m/s onto the floor at `floor`: his legs take it (jump.js jumpLanding), and only they (the fall's
 * landOnFeet and the legs' joint strain stand aside: WORLD.jump.land.grace). A soft landing is a dip of the knees; a hard one buckles
 * them (stamina), past `stumble` he is unsteady and his legs bruised (healing), past `fall` he goes over, past his bones' threshold
 * a knee may break. He can jump again after `recover`.
 */
function landJump(world, fighter, speed, floor) {
  const jump = fighter.jump;
  const landing = jumpLanding(fighter, speed, { legs: limbShares(fighter).leg, strength: fighter.motorScale ?? 1 });
  if (world.ear) soundDown(world, fighter, 'land', particleAt(fighter, P.lFoot), speed);
  jump.phase = 'land';
  jump.t = 0;
  jump.landing = landing;
  fighter.air = false;
  const terrain = fighter.arena.terrain;
  jump.ground = terrain ? floor - WORLD.terrain.sag : 0;
  const hips = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
  for (const foot of Object.values(fighter.feet)) {
    if (foot.lifted) continue;
    const at = foot.index * 3;
    foot.planted = [fighter.x[at], fighter.desired[foot.index][1], fighter.x[at + 2]];
    foot.floor = terrain ? floorBelow(fighter, fighter.x[at], fighter.x[at + 1] - fighter.radius[foot.index], fighter.x[at + 2]) : undefined;
    // Come down with one foot on a ledge and the other over the floor below: that foot is brought in onto the ledge (toward
    // his hips), not left to drag the stance down off it.
    if (terrain && foot.floor < floor - 0.04) {
      const toward = [hips[0] - fighter.x[at], hips[1] - fighter.x[at + 2]];
      const reach = Math.hypot(toward[0], toward[1]) || 1;
      for (let along = 0.05; along <= 0.6; along += 0.05) {
        const place = [fighter.x[at] + (toward[0] / reach) * along, fighter.x[at + 2] + (toward[1] / reach) * along];
        if (Math.abs(floorAt(terrain, place[0], place[1], floor + WORLD.terrain.stepUp) - floor) > 0.04) continue;
        awayFromEdges(terrain, place, floor + WORLD.terrain.stepUp, 0.08);
        foot.planted = [place[0], fighter.desired[foot.index][1], place[1]];
        foot.floor = floor;
        break;
      }
    }
  }
  // Come down on a ledge near its edge: the stance is brought on over it (along his way), so that neither foot's place under
  // it is off the edge (the stance stands on the lower foot: a foot left over the drop would take him back down it).
  if (terrain) settleOnLedge(fighter, terrain, floor);
  fighter.jumpReadyAt = world.time + landing.seconds + landing.recover;
  fighter.jumpLandedAt = world.time;
  // His legs take the fall: the body's way down is stopped by them (the dip is the stance's), not by the floor meeting each
  // part at full speed in one substep (a spike the joints and the floor's own fall rules would read as a far worse landing).
  for (let index = 1; index < fighter.v.length; index += 3) fighter.v[index] = Math.max(0, fighter.v[index]);
  if (landing.stamina > 0) drawStamina(fighter, landing.stamina);
  const effects = [landing.fall ? 'lands hard and goes over' : landing.stumble ? 'stumbles as he lands' : landing.buckle ? 'knees buckle' : 'lands lightly'];
  if (landing.bruise > 0) {
    // A bruise, healing (updateTimers): his legs a little weaker for some seconds.
    const bruise = (fighter.landBruise ??= { l: 0, r: 0 });
    for (const side of ['l', 'r']) {
      fighter.legDamage[side] += landing.bruise;
      bruise[side] += landing.bruise;
    }
    effects.push('legs jarred by the landing');
  }
  if (landing.fracture > 0 && world.random() < landing.fracture) {
    const side = world.random() < 0.5 ? 'l' : 'r';
    fighter.legDamage[side] += landing.legDamage - landing.bruise;
    effects.push('a leg broken by the landing');
    world.events.push({ time: world.time, kind: 'land', fighter: fighter.id, speed, ratio: landing.ratio, height: jump.apex - jump.from, effects });
    breakJoint(world, fighter, `${side}Knee`);
    endJump(fighter);
    return;
  }
  if (landing.trunk > 0) addDamage(fighter, 'trunk', landing.trunk, false);
  world.events.push({ time: world.time, kind: 'land', fighter: fighter.id, speed, ratio: landing.ratio, height: jump.apex - jump.from, effects });
  if (landing.fall) {
    endJump(fighter);
    fighter.knock = [0, 0, 0];
    fall(world, fighter, 'lands hard');
    return;
  }
  if (landing.stumble) fighter.wobble = standWobble(fighter);
}

/**
 * After a landing on terrain at `floor`: if the stance's root or either foot's place in his stance (the pose's, from the root)
 * is over a lower floor, the root is moved on along his way (his speed's, else his facing) by as little as puts all of them
 * on the landing floor, at most WORLD.jump.settle m; the feet are planted there.
 */
function settleOnLedge(fighter, terrain, floor) {
  const stepUp = WORLD.terrain.stepUp;
  const onIt = (x, z) => Math.abs(floorAt(terrain, x, z, floor + stepUp) - floor) <= 0.04;
  const places = (dx, dz) => [[fighter.root[0] + dx, fighter.root[1] + dz], ...['l', 'r'].map((side) => {
    const at = toWorld(fighter, fighter.desired[fighter.feet[side].index]);
    return [at[0] + dx, at[2] + dz];
  })];
  if (places(0, 0).every(([x, z]) => onIt(x, z))) return;
  const speed = Math.hypot(fighter.rootVelocity[0], fighter.rootVelocity[1]);
  const way = speed > 0.2 ? [fighter.rootVelocity[0] / speed, fighter.rootVelocity[1] / speed] : [Math.cos(fighter.yaw), -Math.sin(fighter.yaw)];
  for (let along = 0.05; along <= WORLD.jump.settle + 1e-9; along += 0.05) {
    const dx = way[0] * along;
    const dz = way[1] * along;
    if (!places(dx, dz).every(([x, z]) => onIt(x, z))) continue;
    fighter.root[0] += dx;
    fighter.root[1] += dz;
    for (const side of ['l', 'r']) {
      const foot = fighter.feet[side];
      if (foot.lifted) continue;
      const at = toWorld(fighter, fighter.desired[foot.index]);
      foot.step = null;
      foot.planted = [at[0], fighter.desired[foot.index][1], at[2]];
      foot.floor = floor;
    }
    return;
  }
}

// ---- Stepping -------------------------------------------------------------

// The fighters stepping this substep, refilled each substep (not reallocated).
const moving = [];
// Counts outer steps (any world's): what a fighter's per-step caches are stamped with (limbShares).
let stepStamp = 0;

/** Advance the world by `dt` seconds (one outer step, several substeps). */
export function step(world, dt) {
  stepStamp += 1;
  measureNearestFoes(world);
  world.steps = (world.steps ?? 0) + 1;
  for (const fighter of world.fighters) {
    if (fighter.state === 'out') fighter.outFor = (fighter.outFor ?? 0) + dt;
    if (gone(fighter)) continue;
    if (fighter.mount) goalFromFootwork(world, fighter, dt);
    moveRoot(world, fighter, dt);
    updateTimers(world, fighter, dt);
    // A pose (a proxy) is worked out on its own beat, every WORLD.tiers.proxyEvery steps, for that long.
    if (fighter.detail === 'proxy' && !proxyBeat(world, fighter)) continue;
    const span = fighter.detail === 'proxy' ? dt * WORLD.tiers.proxyEvery : dt;
    updateIntent(world, fighter, span);
    updateFeet(world, fighter, span);
    // A jump under way holds the stance itself (crouch, flight, landing); otherwise, on terrain, the floor does.
    if (fighter.jump) jumpStance(world, fighter, span);
    if (fighter.arena.terrain) {
      if (!fighter.jump) groundStance(fighter, span);
      trackAir(fighter, world.time);
    }
  }
  chooseDetail(world);
  const h = dt / WORLD.substeps;
  const stride = coarseStride(world);
  for (let substep = 0; substep < WORLD.substeps; substep += 1) {
    const time = world.time + substep * h;
    // Horses move on their own (rigid bodies), and carry their riders.
    for (const horse of world.horses) stepHorse(world, horse, h);
    // A coarse fighter steps on one substep in `stride`, that much further; a proxy not at all.
    const stepping = (fighter) => fighter.detail === 'full' || (fighter.detail === 'coarse' && substep % stride === stride - 1);
    const span = (fighter) => (fighter.detail === 'coarse' ? stride * h : h);
    moving.length = 0;
    for (const fighter of world.fighters) if (!asleep(fighter) && stepping(fighter)) moving.push(fighter);
    for (const fighter of moving) {
      const own = span(fighter);
      if (isLimp(fighter)) relaxedTone(fighter, own);
      integrate(fighter, own, time);
      if (fighter.mount) seatRider(fighter, own);
    }
    for (const fighter of moving) {
      const own = span(fighter);
      solveConstraints(fighter, own);
      solveJointLimits(world, fighter, own);
      if (fighter.weapon?.held) updateWeapon(fighter, own);
      if (fighter.offWeapon?.held) updateWeapon(fighter, own, fighter.offWeapon);
    }
    for (const fighter of world.fighters) if (fighter.clinch) holdClinch(world, fighter);
    for (const fighter of world.fighters) if (fighter.pin) holdPin(world, fighter, h);
    collideFighters(world, h, time, substep);
    if (world.horses.length) {
      strikeHorses(world, time);
      collideHorses(world, h);
    }
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
      stopAtLimits(fighter);
      resistLimbTwist(world, fighter);
      settleWhenStill(fighter, own);
      if (fighter.mount) seatRider(fighter, own);
    }
    for (const impulse of world.pendingImpulses) deliverImpulse(impulse);
    world.pendingImpulses = [];
  }
  for (const fighter of world.fighters) if (fighter.detail === 'proxy' && !fighter.dormant && proxyBeat(world, fighter)) poseProxy(fighter, dt * WORLD.tiers.proxyEvery);
  for (const horse of world.horses) {
    horseTimers(world, horse, dt);
    if (horse.rider === null) loseHorse(world, horse);
  }
  for (const fighter of world.fighters) {
    if (fighter.dormant) continue;
    trackHandSpeed(fighter);
    // Heard: a weapon's stroke whooshing through the air, at its fastest.
    if (world.ear) for (const weapon of heldBlades(fighter)) trackSwing(world, fighter, weapon, strokeOf(fighter, weapon));
    if (fighter.mount) keepSeat(world, fighter);
    else checkBalance(world, fighter);
    if (fighter.state !== 'up' && fighter.state !== 'rising') knockOff(world, fighter, null);
    if (world.arena.terrain) lostToSea(world, fighter);
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
  if (fighter.state !== 'up' || fighter.handsDown || fighter.pin || fighter.crawling || fighter.finisher?.kneeling || fighter.kneel) return;
  // Gathering for a jump or in the air, his feet are no base (the landing is his legs': landJump).
  if (fighter.jump && fighter.jump.phase !== 'land') return;
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
  // (A runner's hips are never over a base: they are carried from one foot to the other.)
  const outside = planted && !striding(fighter) ? outsideBase(point(fighter.x, P.pelvis), point(fighter.x, P.lFoot), point(fighter.x, P.rFoot)) : 0;
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
    // His poise takes the blow's share of it: in heavy armour a step catches him without his reeling.
    const severity = Math.max(pushed, overreached) / poiseOf(fighter);
    if (struck && severity < WORLD.stagger.startAt && armoured(fighter)) {
      fighter.knock = [0, 0, 0];
      fighter.stumbleUntil = world.time + WORLD.stagger.catchSeconds;
      return;
    }
    if (struck && staggerInstead(world, fighter, severity, null)) {
      fighter.knock = [0, 0, 0];
      fighter.stumbleUntil = world.time + WORLD.stagger.catchSeconds;
      return;
    }
  } else stagger(world, fighter, pushed, null);
  if (knock > WORLD.balance.speed * footing || outside > WORLD.balance.reach * legLength * footing) {
    fighter.knock = [0, 0, 0];
    fall(world, fighter, knock > WORLD.balance.speed * footing ? 'knocked off balance' : 'overreached', !planted);
  }
}

/** Over he goes (not counted as a knockdown): the muscles let go, and up again after a moment. */
export function fall(world, fighter, reason, onOneFoot = false) {
  fighter.state = 'down';
  shakenLoose(world, fighter);
  fighter.punch = null;
  fighter.rush = null;
  fighter.clinch = null;
  fighter.downTimer = WORLD.balance.fallSeconds;
  world.events.push({ time: world.time, kind: 'fell', fighter: fighter.id, onOneFoot, effects: [reason] });
}

/**
 * The player's overdraft, each step (physics/overdraft.js): a cost that would pass the floor has made him faint (`faintDue`); the
 * grace after waking runs down; the screen's black is held while he lies in the faint and clears once he is getting up.
 */
function overdraftStep(world, fighter, dt) {
  const spec = WORLD.overdraft;
  fighter.faintGrace = Math.max(0, (fighter.faintGrace ?? 0) - dt);
  if (fighter.faintDue) {
    fighter.faintDue = false;
    // (Not on a horse: the saddle holds him; not already down or getting up.)
    if (fighter.state === 'up' && !fighter.mount) faintAway(world, fighter);
  }
  if (fighter.fainted && fighter.state === 'down') fighter.blackout = 1;
  else if (fighter.blackout > 0) fighter.blackout = Math.max(0, fighter.blackout - dt / spec.clearSeconds);
}

/** Out of breath at the floor: down like any fall, not counted as a knockdown and no knockout, for `faintSeconds` at least. */
function faintAway(world, fighter) {
  fall(world, fighter, 'fainted');
  fighter.downTimer = WORLD.overdraft.faintSeconds;
  fighter.fainted = true;
  fighter.blackout = 1;
}

/** He starts to get up from a faint: breath enough to stand in a daze (the screen still dim), and no second faint for a while. */
function wakeFromFaint(fighter) {
  fighter.fainted = false;
  fighter.stamina = WORLD.overdraft.wakeStamina;
  fighter.faintGrace = WORLD.overdraft.graceSeconds;
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
  if (fighter.mount) {
    // In the saddle: the horse carries him (seatRider); he turns his shoulders to his man or his mark.
    const facing = fighter.faceAt && world.time < fighter.faceAt.until ? fighter.faceAt.at : null;
    riderFacing(fighter, fighter.punch?.at ?? facing ?? (opponent ? aimPoint(opponent, 'body') : null), dt);
    return;
  }
  if (fighter.state !== 'up') {
    fighter.rootVelocity = [0, 0];
    return;
  }
  // Facing his man, or the place he is going (a weapon on the floor).
  // A place he means to strike (faceAt, for a moment) first; then where he is going; then his man.
  const facing = fighter.faceAt && world.time < fighter.faceAt.until ? fighter.faceAt.at : null;
  // (The player's `faceFoe`, set by control.js: false, he keeps his own heading while his man is far and he is not locked on.)
  const facePoint = facing ?? fighter.goTo ?? (opponent && fighter.faceFoe !== false ? point(opponent.x, P.pelvis) : null);
  // (How far round he has yet to turn to face it, rad: a runner slows for a turn he has begun, below.)
  let toTurn = 0;
  if (facePoint) {
    const from = point(fighter.x, P.pelvis);
    const to = facePoint;
    const desiredYaw = Math.atan2(-(to[2] - from[2]), to[0] - from[0]);
    let turn = desiredYaw - fighter.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    toTurn = Math.abs(turn);
    // A man who cannot turn his head turns his whole body to follow, slowly.
    let change = turn * Math.min(1, dt * WORLD.footing.turnRate * (fighter.body.gear.headLocked ? WORLD.headLock.turn : 1) * (fighter.wading?.act ?? 1));
    if (fighter.crawling) {
      // On his knees he turns only as fast as his steps carry him round.
      const spec = WORLD.crawl;
      const pace = Math.min(1, Math.hypot(...fighter.rootVelocity) / (spec.speed * WORLD.footSpeed));
      const most = spec.turnSpeed * Math.max(spec.turnOnSpot, pace) * dt;
      change = Math.max(-most, Math.min(most, change));
      fighter.crawlTurn = change / Math.max(dt, 1e-6) / spec.turnSpeed;
    }
    // A blow aimed by the line he runs (a couched lance: `holdHeading`) is not turned once it is going: the point would sweep sideways.
    if (fighter.punch?.spec.holdHeading && fighter.punch.t >= fighter.punch.spec.windup) change = 0;
    // Running, his heading turns no faster than the floor can carry his path round (gait.js turnRateMost: v × rate = what the foot
    // gives sideways): faster than that and he would face one way while the run went on another, dragged round sideways.
    if (fighter.running && !fighter.rush && !fighter.crawling && !fighter.air || fighter.gaitCarry) {
      const most = turnRateMost(fighter, Math.hypot(fighter.rootVelocity[0], fighter.rootVelocity[1])) * dt;
      change = Math.max(-most, Math.min(most, change));
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
  // (Not kneeling over a man: the stab is driven down from where he kneels.)
  if (punch?.spec.step && !(punch.load > 0) && !fighter.finisher?.kneeling && punch.t >= punch.spec.windup && punch.t <= punch.spec.extendUntil) drive = Math.max(drive, punch.spec.step);
  // Running: as fast as his body runs (physics/gait.js): flat out in the player's run mode, a run's pace else, at the share asked.
  let runPace = null;
  if (fighter.running && !fighter.rush && !fighter.crawling) {
    runPace = Math.max(0, fighter.move) * runSpeed(fighter, Boolean(fighter.runMode));
    // A turn still to make slows him to the pace at which his grip carries him round it in `room` m (gait.js cornerPace).
    // (Running to a place nearer than that, the room is the distance to it: he must be round the turn by there, or he circles it, never arriving.)
    const room = fighter.goTo ? Math.max(WORLD.gait.corner.roomLeast, Math.min(WORLD.gait.corner.room, Math.hypot(fighter.goTo[0] - fighter.root[0], fighter.goTo[2] - fighter.root[1]))) : WORLD.gait.corner.room;
    runPace = Math.min(runPace, cornerPace(fighter, toTurn, room));
    // Running to a place (an AI man's goTo; the player's is only a way, a little ahead of him): no faster than he can stop there.
    if (fighter.goTo && !fighter.runMode) runPace = Math.min(runPace, arrivalSpeed(fighter, Math.hypot(fighter.goTo[0] - fighter.root[0], fighter.goTo[2] - fighter.root[1])));
  }
  // On his knees: slow, and no faster for trying.
  if (fighter.crawling) drive = Math.max(-0.3, Math.min(1, fighter.move)) * WORLD.crawl.speed;
  // In the net: short steps, stumbling.
  if (fighter.netted) drive *= NET.step;
  if (fighter.netted && runPace !== null) runPace *= NET.step;
  if (fighter.rush) {
    // A charge (the bull rush of a bout, from a step or two away): at what the legs can reach in it.
    fighter.rush.t += dt;
    drive = WORLD.rush.speedFactor;
    if (fighter.rush.t >= fighter.rush.duration) fighter.rush = null;
  }
  // A sidestep (+ to the left), slower than stepping in or out.
  const left = yawRotate([0, 0, 1], fighter.yaw);
  let side = fighter.rush ? 0 : (fighter.strafe ?? 0) * WORLD.sidestepShare * (fighter.crawling ? WORLD.crawl.speed : 1) * (fighter.netted ? NET.step : 1);
  // Off the line (a sidestep defence): one quick step to the side, as fast as his legs and gear let him.
  if (fighter.defence?.name === 'sidestep' && !fighter.rush && !fighter.crawling) side = fighter.defence.side * DEFENCES.sidestep.step * (fighter.netted ? NET.step : 1);
  // Footwork in this outfit: free in trunks, stiff in a suit or in plate.
  const gear = fighter.body.gear;
  const footwork = WORLD.footSpeed * legs * gear.foot;
  const wanted = runPace === null
    ? [(forward[0] * drive + left[0] * side) * WORLD.footSpeed * legs * gear.foot, (forward[2] * drive + left[2] * side) * WORLD.footSpeed * legs * gear.foot]
    : [forward[0] * runPace + left[0] * side * footwork, forward[2] * runPace + left[2] * side * footwork];
  // On a stair or a steep slope he goes only as fast as his feet can climb (up or down) it.
  if (world.arena.terrain) {
    const slowed = Math.min(climbShare(fighter, wanted), leashShare(fighter));
    wanted[0] *= slowed;
    wanted[1] *= slowed;
  }
  const change = [wanted[0] - fighter.rootVelocity[0], wanted[1] - fighter.rootVelocity[1]];
  const size = Math.hypot(change[0], change[1]);
  const speedNow = Math.hypot(fighter.rootVelocity[0], fighter.rootVelocity[1]);
  // (A run let go carries on at a run's pace until he has braked to his footwork's; a surge or a lunge of the guard's footwork is not a run.)
  fighter.gaitCarry = runPace !== null || (fighter.gaitCarry && speedNow > footwork * 1.05);
  if (fighter.gaitCarry && !fighter.rush && !fighter.crawling && !fighter.air) {
    // Running, or carried on from a run: he gathers speed and brakes as his body can (gait.js runChange), and turns no
    // sharper than his brake allows across his way.
    runTowards(fighter, wanted, speedNow, dt);
  } else {
    const limit = WORLD.footAcceleration * legs * gear.accel * (fighter.rush ? 1.6 : fighter.crawling ? WORLD.crawl.accel : 1) * dt;
    // (Off the ground, the legs push on nothing.)
    const scale = fighter.air ? 0 : size > limit ? limit / size : 1;
    fighter.rootVelocity[0] += change[0] * scale;
    fighter.rootVelocity[1] += change[1] * scale;
  }
  const { halfX, halfZ, drop } = world.arena;
  const margin = WORLD.footing.edgeMargin;
  const walkedFrom = fighter.root[1];
  fighter.root[0] += fighter.rootVelocity[0] * dt;
  fighter.root[1] += fighter.rootVelocity[1] * dt;
  // Toward a drop edge his own steps never take him past the floor's edge (he keeps off it, as at any edge).
  if (drop) fighter.root[1] = Math.min(fighter.root[1], Math.max(halfZ - margin, walkedFrom));
  // A shove moves the stance too: the root drifts to where the pelvis was pushed.
  const pelvis = point(fighter.x, P.pelvis);
  const rootPelvis = toWorld(fighter, fighter.desired[P.pelvis]);
  const follow = Math.min(1, dt * WORLD.footing.followPushed);
  fighter.root[0] += (pelvis[0] - rootPelvis[0]) * follow;
  fighter.root[1] += (pelvis[2] - rootPelvis[2]) * follow;
  fighter.root[0] = Math.max(-(halfX - margin), Math.min(halfX - margin, fighter.root[0]));
  // ... but a shove can: out across the strip to the edge and over it.
  fighter.root[1] = Math.max(-(halfZ - margin), Math.min(drop ? drop.at + WORLD.drop.footing : halfZ - margin, fighter.root[1]));
  if (world.arena.terrain) keepClearOfSolids(world.arena.terrain, fighter, operativeOf(world, fighter));
}

/** The speed (m/s) from which a runner stops in `distance` m, at his brake (physics/gait.js: `arrive` of it, and never under a walk). */
function arrivalSpeed(fighter, distance) {
  return Math.max(WORLD.footSpeed, Math.sqrt(2 * WORLD.gait.arrive * runChange(fighter, 1, 0, 1) * Math.max(0, distance)));
}

/**
 * The stance's velocity changed towards `wanted` as a runner's can: along his way, gathering speed at his start and
 * braking at his brake (physics/gait.js runChange); across it (a turn), at what his grip and leg give a corner (gait.js cornering).
 */
function runTowards(fighter, wanted, speed, dt) {
  const velocity = fighter.rootVelocity;
  const wantedSpeed = Math.hypot(wanted[0], wanted[1]);
  if (speed < 0.1) {
    const change = [wanted[0] - velocity[0], wanted[1] - velocity[1]];
    const size = Math.hypot(change[0], change[1]);
    const limit = runChange(fighter, speed, wantedSpeed, dt);
    const scale = size > limit ? limit / size : 1;
    velocity[0] += change[0] * scale;
    velocity[1] += change[1] * scale;
    return;
  }
  const ux = velocity[0] / speed;
  const uz = velocity[1] / speed;
  const change = [wanted[0] - velocity[0], wanted[1] - velocity[1]];
  const along = change[0] * ux + change[1] * uz;
  const across = [change[0] - along * ux, change[1] - along * uz];
  // Across his way (a turn) the floor gives what the foot and the leg hold (gait.js cornering); along it he gathers speed at his start
  // and brakes at his brake, a gathering the less the more of the grip the turn he is on has used.
  const acrossMost = cornering(fighter).accel * dt;
  const acrossSize = Math.hypot(across[0], across[1]);
  const acrossScale = acrossSize > acrossMost ? acrossMost / acrossSize : 1;
  // (The turn it is on, not this step's correction: a runner's velocity is nudged a little every step, and that is not a corner.)
  const alongMost = runChange(fighter, speed, speed + along, dt) * (along > 0 ? cornerShare(fighter, speed * (fighter.turn ?? 0)) : 1);
  const alongDone = Math.max(-alongMost, Math.min(alongMost, along));
  velocity[0] += alongDone * ux + across[0] * acrossScale;
  velocity[1] += alongDone * uz + across[1] * acrossScale;
}

/**
 * On terrain, the share of the speed he wants that his feet can follow: his hips outside the base of his feet by more than
 * WORLD.terrain.leash.from of what throws him (checkBalance's reach) slow him, to a stop at leash.to: the stance must not
 * outrun the steps, as it does up a flight taken fast in heavy gear, or a man who has not the legs for it goes over.
 * A run in the run's pose, which carries the hips over the feet and is not thrown by it, is not held.
 */
function leashShare(fighter) {
  if (fighter.air || fighter.runPose > 0.5 || !fighter.feet || fighter.feet.l.lifted || fighter.feet.r.lifted) return 1;
  const outside = outsideBase(point(fighter.x, P.pelvis), point(fighter.x, P.lFoot), point(fighter.x, P.rFoot));
  const reach = WORLD.balance.reach * (fighter.body.lengths.thigh + fighter.body.lengths.shank) * balanceFooting(fighter);
  const leash = WORLD.terrain.leash;
  const used = outside / reach;
  return used <= leash.from ? 1 : Math.max(0, 1 - (used - leash.from) / (leash.to - leash.from));
}

/** How well his legs hold him (checkBalance's footing): strong legs, sound joints and legs, gear made for it, no net. */
function balanceFooting(fighter) {
  const legRatio = fighter.body.motorForce[P.pelvis] / (fighter.body.massKg * WORLD.gravity);
  const legs = Math.max(0.5, Math.min(1.3, legRatio / WORLD.legStrengthTypical)) * (WORLD.jointFootwork + (1 - WORLD.jointFootwork) * (fighter.body.joints ?? 1)) * (1 - WORLD.balance.legDamageCost * Math.min(1, (fighter.legDamage.l + fighter.legDamage.r) / (2 * legCapacity())));
  return legs * fighter.body.gear.balance * (fighter.netted ? NET.footing : 1);
}

/** The turns (rad) from his way at which the floor's slope is looked at. */
const SLOPE_FAN = [0, 0.6, -0.6];

/**
 * On terrain, the share of the speed he wants that his feet can climb: the floor's slope along his way (over
 * WORLD.terrain.slopeSpan m each side of him, none if it changes by more than slopeMost there: a ledge; a flight of treads is a slope of rise over tread) times his speed
 * is the rate he must rise or sink (m/s), and past WORLD.terrain.climb he is held to it. The stance cannot
 * outrun the steps: a man running a flight at flat-ground speed has his feet left behind.
 */
function climbShare(fighter, wanted) {
  const speed = Math.hypot(wanted[0], wanted[1]);
  if (speed < 1e-6 || fighter.air) return 1;
  const terrain = fighter.arena.terrain;
  const spec = WORLD.terrain;
  const y = (fighter.lift ?? 0) + spec.stepUp + spec.slopeHeadroom;
  const here = floorAt(terrain, fighter.root[0], fighter.root[1], y);
  // (Along his way, and a little to each side of it: a winding stair turns under him.)
  let steepest = 0;
  for (const turn of SLOPE_FAN) {
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const ux = (wanted[0] * cos - wanted[1] * sin) / speed;
    const uz = (wanted[0] * sin + wanted[1] * cos) / speed;
    const ahead = floorAt(terrain, fighter.root[0] + ux * spec.slopeSpan, fighter.root[1] + uz * spec.slopeSpan, y);
    const behind = floorAt(terrain, fighter.root[0] - ux * spec.slopeSpan, fighter.root[1] - uz * spec.slopeSpan, y);
    // (No floor one side, or a face of a ledge's height: not a slope. He walks to the edge, and off it.)
    if (!(Math.abs(ahead - here) <= spec.slopeMost) || !(Math.abs(here - behind) <= spec.slopeMost)) continue;
    steepest = Math.max(steepest, Math.abs(ahead - behind) / (2 * spec.slopeSpan));
  }
  // (The run's step reads the slope: a stair is stepped, a flat is leapt along: updateFeet.)
  fighter.runSlope = steepest;
  const rate = steepest * speed;
  return rate > spec.climb ? spec.climb / rate : 1;
}

/**
 * The height of the highest floor a man's feet are planted on or stepping to (never below the stance's own `lift`,
 * which trails the lower foot): what a wall or a ledge's face is measured from. With one foot on a tread and the
 * other a tread down, the face of the next is a stride above the higher, and he is not stopped by a low wall
 * (the sill of a doorway at the head of a flight) that his lead foot is already above.
 */
function standingOn(fighter) {
  let height = fighter.lift ?? 0;
  if (fighter.air || !fighter.feet) return height;
  for (const side of ['l', 'r']) {
    const foot = fighter.feet[side];
    const floor = foot.step ? foot.step.floorTo : foot.floor;
    if (floor !== undefined && floor > height) height = floor;
  }
  return height;
}

/** Whether this is the man played: marked by the screen (`player`), or in a stage the operative, its first fighter (a world with no screen to mark him). */
const operativeOf = (world, fighter) => Boolean(fighter.player) || (Boolean(world.stage) && fighter === world.fighters[0]);

/**
 * On terrain, the stance's root is kept out of the walls and ledge faces, the speed into them gone:
 * the feet are aimed from the root, and a root inside a wall would set them fighting it.
 */
function keepClearOfSolids(terrain, fighter, played = false) {
  const spec = WORLD.terrain;
  // (The man played stands off the stone by more than the others: WORLD.terrain.playerClearance.)
  const clearance = played ? spec.playerClearance : 0;
  const radius = spec.bodyRadius;
  const lift = fighter.lift ?? 0;
  const at = [fighter.root[0], fighter.root[1]];
  // A face a foot can be put on (stepUp) is not a wall to him; in a jump's flight, only one his feet are nearly over (WORLD.jump.clear).
  const stepUp = fighter.jump?.phase === 'air' ? WORLD.jump.clear : spec.stepUp;
  if (!pushOut(terrain, at, radius, lift + spec.sag, lift + spec.sag + spec.bodyHeight, stepUp, standingOn(fighter) + spec.sag, clearance)) return;
  fighter.root[0] = at[0];
  fighter.root[1] = at[1];
  const into = fighter.rootVelocity[0] * terrain.normal[0] + fighter.rootVelocity[1] * terrain.normal[1];
  if (into < 0) {
    fighter.rootVelocity[0] -= into * terrain.normal[0];
    fighter.rootVelocity[1] -= into * terrain.normal[1];
  }
}

// ---- Detail by the size of the fight ----------------------------------------------

/** Substeps a coarse fighter takes as one: more, the bigger the fight. */
function coarseStride(world) {
  return WORLD.tiers.stride[fightTier(world)] ?? 1;
}

/** Which tier of detail the fight is in, by its size: 1 (a one-on-one's) to 4. */
export function fightTier(world) {
  // In a level, only the men awake count (world.awake, kept by levelmode/stage.js).
  const count = world.awake ?? world.fighters.length;
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
      if (fighter.dormant) return;
      if (gone(fighter)) {
        fighter.detail = 'coarse';
        return;
      }
      let lastHit = -Infinity;
      for (const at of fighter.hitAt) lastHit = Math.max(lastHit, at);
      // In an exchange now: striking, struck at, just hit, holding or held, getting up.
      const exchanging = world.keepFull?.has(fighter.id) || fighter.punch || fighter.rush || fighter.clinch || fighter.pin || fighter.pickup
        || targeted.has(fighter.id) || lastHit > world.time - WORLD.tiers.hitMemory || fighter.state === 'rising';
      // (A rider is always in full: he is carried by his horse, which is not a pose.)
      if (exchanging || fighter.mount) fighter.detail = 'full';
      // A man standing in the ranks behind the front (formation.js) is only a pose, enemy near or not.
      else if (fighter.slot && !fighter.inFront && fighter.state === 'up' && world.formations?.[fighter.formation]) fighter.detail = 'proxy';
      else if (tier === 3 || fighter.state !== 'up') fighter.detail = 'coarse';
      else fighter.detail = grid.near(index).some((other) => world.fighters[other].corner !== fighter.corner && world.fighters[other].state !== 'out') ? 'coarse' : 'proxy';
    });
  }
  // A dormant man is a pose that is never worked out: out of the contacts like any proxy, and not drawn.
  if (world.awake !== undefined) for (const fighter of world.fighters) if (fighter.dormant) fighter.detail = 'proxy';
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
  if (fighter.offWeapon?.held) updateWeapon(fighter, dt, fighter.offWeapon);
}

/**
 * Each running fighter's distance to the nearest enemy not out (nor dormant: his section asleep)
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
        if (!hostile(other, fighter) || other.state === 'out' || other.dormant) continue;
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
      if (!hostile(foe, fighter) || foe.state === 'out' || foe.dormant) continue;
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
  if (fighter.landBruise) healLandBruise(fighter, dt);
  if (fighter.weapon?.held) fighter.weapon.strain = Math.max(0, fighter.weapon.strain - BLADES.gripLeak * dt);
  if (fighter.offWeapon?.held) fighter.offWeapon.strain = Math.max(0, fighter.offWeapon.strain - BLADES.gripLeak * dt);
  if (fighter.shield?.strain) fighter.shield.strain = Math.max(0, fighter.shield.strain - WORLD.shield.strainLeak * dt);
  // On his knees with the pain (physics/whip.js): until he is up again.
  if (fighter.pain) {
    fighter.pain.t += dt;
    if (fighter.state !== 'up' || painShare(fighter) <= 0 && fighter.pain.t > 0.3) fighter.pain = null;
  }
  reload(world, fighter, dt);
  // A machine (gear.machine: a robot) has no blood: what would open a wound in a man opens nothing that
  // bleeds, and it is never weakened or dropped by blood loss; only broken (its injuries, below) or knocked out.
  if (fighter.body.gear.machine) fighter.bleed = 0;
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
  overTheEdge(world, fighter);
  fighter.cooldown = Math.max(0, fighter.cooldown - dt);
  fighter.guardHigh = Math.max(0, fighter.guardHigh - dt);
  fighter.slip = Math.max(0, fighter.slip - dt);
  fighter.committed = Math.max(0, (fighter.committed ?? 0) - dt);
  fighter.stun = Math.max(0, fighter.stun - dt);
  fighter.stagger = Math.max(0, (fighter.stagger ?? 0) - dt);
  fighter.dazed = Math.max(0, (fighter.dazed ?? 0) - dt);
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
  if (fighter.player) overdraftStep(world, fighter, dt);
  if (!fighter.punch) fighter.stamina = Math.min(1, fighter.stamina + WORLD.staminaRecovery * fighter.body.aerobic * winded * (fighter.runMode ? WORLD.runMode.recovery : 1) * recoveryShare(fighter.stamina) * dt);
  fighter.hurt = Math.max(0, (fighter.hurt ?? 0) - dt);
  if (fighter.state === 'out') {
    fighter.motorScale = 0;
  } else if (fighter.state === 'down') {
    fighter.motorScale = 0;
    fighter.downTimer -= dt;
    // Up only once he has come to rest: a man still tumbling does not try.
    if (fighter.downTimer <= 0 && restedToRise(fighter, dt)) {
      // A broken leg will not stand him up, but a man still conscious drags himself off on his knees.
      if (legBroken(fighter) && !fighter.broken.has('neck') && !fighter.crawling) startCrawl(world, fighter, 'drags himself away on his knees');
      if (fighter.knockdowns >= WORLD.knockdownsToStop && !fighter.crawling) {
        fighter.state = 'out';
        world.events.push({ time: world.time, kind: 'stopped', fighter: fighter.id });
      } else {
        fighter.state = 'rising';
        if (fighter.fainted) wakeFromFaint(fighter);
        // Crawling, his hands are on the floor: nothing drawn.
        if (fighter.pendingArm && !fighter.crawling) {
          armFighter(fighter, fighter.pendingArm, { random: world.random });
          if (fighter.weapon) world.events.push({ time: world.time, kind: 'drew', fighter: fighter.id, weapon: fighter.weapon.kind, effects: [`draws the ${fighter.weapon.spec.label.toLowerCase()}`] });
          fighter.pendingArm = null;
        }
        // Get up the way he lies, in stages (physics/rising.js).
        beginRise(fighter);
        // Hurt by the fall, coming back from the first try on: a man who
        // sank back and tries again is no more hurt than he was.
        if (!fighter.triedRise) {
          fighter.hurt = WORLD.hurt.hurtSeconds + WORLD.hurt.hurtPerKnockdown * fighter.knockdowns;
          fighter.hurtFor = fighter.hurt;
        }
        fighter.triedRise = false;
        plantFeet(fighter);
      }
    }
  } else if (fighter.state === 'rising') {
    const stage = fighter.rise?.stage;
    let result = fighter.rise ? updateRise(fighter, dt) : 'stood';
    if (fighter.rise?.stage === 'stand' && stage !== 'stand') {
      // Standing up from his knees, his feet are where the kneel put them.
      plantFeet(fighter);
      // Held, he stands only if his legs drive up harder than the weight
      // the men on him bear down with; then no hold from the floor keeps him.
      const holders = pinnedBy(world, fighter);
      const bearing = holders.reduce((sum, holder) => sum + WORLD.pin.weightShare * holder.body.massKg * WORLD.gravity, 0);
      if (holders.length && fighter.body.motorForce[P.pelvis] * fighter.motorScale < bearing) result = 'beaten';
      else for (const holder of holders) holder.pin = null;
    }
    // Held down, if the hold kept his trunk low he did not get up; nor did
    // he if his limbs could not lift him. He sinks back and tries again in a moment.
    const held = (result === 'beaten' || result === 'stood') && pinnedBy(world, fighter).length > 0;
    if (result === 'beaten' || (result === 'stood' && held && neckLow(fighter))) {
      const pushed = fighter.rise?.pushed;
      fighter.state = 'down';
      fighter.motorScale = 0;
      fighter.restFor = 0;
      fighter.rise = null;
      fighter.triedRise = true;
      // Held, he struggles again at once; beaten by his own weight, he lies and gets his breath first, longer each time.
      fighter.downTimer = WORLD.pin.retry;
      if (!held) failedRise(world, fighter, pushed);
    } else if (result === 'stood') {
      // On his feet: any hold on him is broken, and he starts square, unsteady for a moment.
      fighter.wobble = fighter.crawling ? null : standWobble(fighter);
      fighter.state = 'up';
      fighter.rise = null;
      fighter.knock = [0, 0, 0];
      if (!fighter.crawling) Object.assign(fighter, { riseTries: 0, floored: false, crawlWeak: false });
      for (const holder of world.fighters) if (holder.pin?.target === fighter.id) holder.pin = null;
    }
  } else if (fighter.state === 'up') {
    // Crawling because he could not stand: when his strength is back enough, he tries again from his knees.
    if (fighter.crawlWeak && fighter.crawling && world.time >= fighter.crawlRetryAt) retryFromKnees(world, fighter);
    // Hurt after a knockdown: the legs and arms come back over seconds.
    const recovering = fighter.hurt > 0 ? 1 - (1 - WORLD.hurt.hurtStrength) * (fighter.hurt / fighter.hurtFor) : 1;
    // Blood loss: weaker the more is gone.
    const shock = 1 - (1 - BLADES.shockStrength) * Math.min(1, (fighter.bloodLost ?? 0) / collapseAt()) ** 2;
    // A battered trunk saps him as blood loss does.
    const battered = 1 - (1 - WORLD.injury.shockStrength) * Math.min(1, (fighter.trauma?.trunk ?? 0) / WORLD.injury.trunkFatal) ** 2;
    fighter.motorScale = (fighter.stun > 0 ? 0.55 : 1) * recovering * shock * battered * staggerShare(fighter, WORLD.stagger.strength) * (1 - WORLD.daze.strength * dazedShare(fighter));
  }
}

/**
 * He could not get up (not held: his own weight beat him). He lies and gets his breath back first, the longer the more
 * tries he has made and the less his wind (WORLD.rise.rest). After `crawlAfter` tries he gives it up for now: if he got
 * as far as his hands and knees (`pushed`), he crawls (out of the fight on his knees, trying to stand again now and then);
 * if not, he lies (`floored`: out of the fight until he rises), trying again after the longest rest.
 */
function failedRise(world, fighter, pushed) {
  const spec = WORLD.rise.rest;
  fighter.riseTries = (fighter.riseTries ?? 0) + 1;
  const tries = fighter.riseTries;
  fighter.downTimer = Math.min(spec.most, spec.seconds * (1 + spec.perTry * (tries - 1)) / Math.max(0.3, fighter.body.aerobic));
  if (tries < spec.crawlAfter) return;
  if (pushed && !fighter.broken.has('neck')) {
    fighter.crawlWeak = true;
    fighter.crawlRetryAt = world.time + spec.most;
    startCrawl(world, fighter, 'cannot get up: crawls');
  } else if (!fighter.floored) {
    fighter.floored = true;
    world.events.push({ time: world.time, kind: 'floored', fighter: fighter.id, effects: ['cannot get up'] });
  }
}

/**
 * Crawling because he could not stand: if his legs (as strong as he is now) could stand him, with his hands on his knee if
 * need be, he tries, from his knees: a foot brought through, then up. If not, he crawls on and tries again later.
 * Returns whether he tries (the player asking to stand from such a crawl: control.js playerCrawl).
 */
export function retryFromKnees(world, fighter) {
  fighter.crawlRetryAt = world.time + WORLD.rise.rest.most;
  if (legBroken(fighter) || fighter.netted || fighter.mount || fighter.state !== 'up' || !fighter.crawling) return false;
  const recovering = fighter.hurt > 0 && fighter.hurtFor ? 1 - (1 - WORLD.hurt.hurtStrength) * (fighter.hurt / fighter.hurtFor) : 1;
  if (riseMargins(fighter, recovering).stand < WORLD.rise.retryMargin) return false;
  fighter.crawling = false;
  fighter.crawlWeak = false;
  fighter.crawlChosen = false;
  fighter.state = 'rising';
  fighter.move = 0;
  fighter.strafe = 0;
  beginRise(fighter, { fromKnees: true });
  fighter.triedRise = true;
  return true;
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

/** Getting up, the parts go where its stage puts them (physics/rising.js); otherwise where he stands. */
function motorTarget(fighter, index) {
  if (fighter.state === 'rising' && fighter.rise) return riseTarget(fighter, index);
  return standingTarget(fighter, index);
}

export function standingTarget(fighter, index) {
  const info = PARTICLE_INFO[index];
  const desired = fighter.desired[index];
  // Kneeling to hold a man down, the legs go where the kneel puts them.
  if ((fighter.pin || fighter.crawling || fighter.finisher?.kneeling || fighter.kneel) && info.leg) return { target: toWorld(fighter, desired), velocity: [0, 0, 0] };
  // (In a jump's flight the feet go with the hips, under them.)
  if (info.foot) return { target: footTarget(fighter, fighter.feet[info.side]), velocity: fighter.jump?.phase === 'air' ? point(fighter.v, P.pelvis) : swingVelocity(fighter, fighter.feet[info.side]) };
  if (info.knee) {
    const side = info.side;
    if (fighter.feet[side].lifted) return { target: toWorld(fighter, desired), velocity: point(fighter.v, info.hip) };
    const hip = point(fighter.x, info.hip);
    const foot = footTarget(fighter, fighter.feet[side]);
    const out = fighter.runPose > 0 ? POSE.kneeOut + (WORLD.runMode.kneeOut - POSE.kneeOut) * fighter.runPose : POSE.kneeOut;
    const pole = yawRotate([1, 0, side === 'l' ? out : -out], fighter.yaw);
    const L = fighter.body.lengths;
    const knee = twoBoneIK(hip, foot, L.thigh, L.shank, pole);
    // Where the hips have turned the knee further than they can, it comes round.
    const axes = trunkAxes(point(fighter.x, P.pelvis), point(fighter.x, P.neck), point(fighter.x, P.lHip), point(fighter.x, P.rHip));
    return { target: swivelIntoRange(axes, 'leg', side, hip, knee, foot, { margin: WORLD.limbTwist.softBand }), velocity: point(fighter.v, info.hip) };
  }
  if (info.anchor === null) return { target: toWorld(fighter, desired), velocity: [fighter.rootVelocity[0], 0, fighter.rootVelocity[1]] };
  // Most parts: where the pose puts it from its anchor, turned to the way he faces, from where the anchor is.
  const anchor = info.anchor;
  const from = fighter.desired[anchor];
  const cos = yawCos(fighter.yaw);
  const sin = yawSin(fighter.yaw);
  const x = fighter.x;
  const at = anchor * 3;
  const dx = desired[0] - from[0];
  const dz = desired[2] - from[2];
  return {
    target: [x[at] + (dx * cos + dz * sin), x[at + 1] + (desired[1] - from[1]), x[at + 2] + (-dx * sin + dz * cos)],
    velocity: point(fighter.v, anchor),
  };
}

// Scratch for the integrator's muscle drive (one particle at a time), and
// every particle's acceleration this substep.
const want = [0, 0, 0];
const accelerations = new Float64Array(PARTICLES.length * 3);

function integrate(fighter, h, time) {
  const fatigue = fatigueScale(fighter.stamina);
  const alive = fighter.state === 'up' || fighter.state === 'rising';
  const rising = fighter.state === 'rising';
  const damping = Math.exp(-h * (fighter.air ? WORLD.terrain.airDamping : alive ? WORLD.damping.up : WORLD.damping.down));
  // A hand's health is the same for both its particles: once per side.
  const hands = { l: fatigue * handHealth(fighter, 'l'), r: fatigue * handHealth(fighter, 'r') };
  // The muscles hold each part up against gravity, except in the air (terrain): a man off a ledge falls.
  const holding = fighter.air ? 0 : WORLD.gravity;
  const ballistic = fighter.jump?.phase === 'air';
  for (let index = 0; index < PARTICLES.length; index += 1) {
    const info = PARTICLE_INFO[index];
    const base = index * 3;
    const { target, velocity } = motorTarget(fighter, index);
    fighter.targets[index] = target;
    // In the air the muscles keep the pose but do not brake the fall.
    if (fighter.air) velocity[1] = fighter.v[base + 1];
    let acceleration = [0, -WORLD.gravity, 0];
    const scale = fighter.motorScale * (info.arm ? hands[info.side] : 1) * reflexShare(fighter, time - fighter.hitAt[index]);
    if (scale > 0.01) {
      const { omega, zeta } = WORLD.motor[info.motorGroup];
      for (let axis = 0; axis < 3; axis += 1) {
        // Spring towards the target, damper towards its velocity, and hold
        // the part up against gravity — all within the muscle's force.
        want[axis] = omega * omega * (target[axis] - fighter.x[base + axis]) + 2 * zeta * omega * (velocity[axis] - fighter.v[base + axis]) + (axis === 1 ? holding : 0);
      }
      // In a jump's flight the hips go as they were thrown: the stance follows them (jumpStance), the muscles only keep the pose.
      if (ballistic && info.anchor === null) want[1] = 0;
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
    for (let axis = 0; axis < 3; axis += 1) accelerations[base + axis] = acceleration[axis];
    // Each part moves as soon as it is driven (the next one's target reads
    // it); getting up, all wait for what the floor allows them together.
    if (!rising) moveParticle(fighter, index, h, damping);
  }
  if (!rising) return;
  // Getting up, only the floor lifts him.
  supportLimit(fighter, accelerations);
  for (let index = 0; index < PARTICLES.length; index += 1) moveParticle(fighter, index, h, damping);
}

function moveParticle(fighter, index, h, damping) {
  const base = index * 3;
  // Carried on a horse, the body's own losses are of its motion on the horse, not over the ground.
  const carrier = fighter.carrier;
  if (carrier) {
    for (let axis = 0; axis < 3; axis += 1) {
      fighter.v[base + axis] = (fighter.v[base + axis] - carrier[axis] + accelerations[base + axis] * h) * damping + carrier[axis];
      fighter.prev[base + axis] = fighter.x[base + axis];
      fighter.x[base + axis] += fighter.v[base + axis] * h;
    }
    return;
  }
  for (let axis = 0; axis < 3; axis += 1) {
    fighter.v[base + axis] = (fighter.v[base + axis] + accelerations[base + axis] * h) * damping;
    fighter.prev[base + axis] = fighter.x[base + axis];
    fighter.x[base + axis] += fighter.v[base + axis] * h;
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

/**
 * How much of each limb's own strength he has now (0..1), as integrate drives it: nothing through a limb hanging limp
 * (a broken elbow, knee or hip); an arm as sound as its hand and as fresh as his stamina (fatigueScale), a leg less
 * the damage it has taken, and tired by `WORLD.rise.legFatigue` of what tires the arms (the legs hold out better).
 */
export function limbShares(fighter) {
  // (Asked several times a step by the run and the rise: worked out once a step, and again if his stamina, legs or limp limbs change.)
  const cache = fighter.limbCache;
  if (cache && cache.stamp === stepStamp && cache.stamina === fighter.stamina && cache.left === fighter.legDamage.l && cache.right === fighter.legDamage.r && cache.limp === fighter.limp.size) return cache.shares;
  const fatigue = fatigueScale(fighter.stamina);
  const legFatigue = 1 - WORLD.rise.legFatigue * (1 - fatigue);
  const capacity = legCapacity();
  const shares = {
    arm: { l: fighter.limp.has(P.lHand) ? 0 : fatigue * handHealth(fighter, 'l'), r: fighter.limp.has(P.rHand) ? 0 : fatigue * handHealth(fighter, 'r') },
    leg: { l: fighter.limp.has(P.lFoot) ? 0 : legFatigue * (1 - 0.6 * Math.min(1, fighter.legDamage.l / capacity)), r: fighter.limp.has(P.rFoot) ? 0 : legFatigue * (1 - 0.6 * Math.min(1, fighter.legDamage.r / capacity)) },
  };
  fighter.limbCache = { stamp: stepStamp, stamina: fighter.stamina, left: fighter.legDamage.l, right: fighter.legDamage.r, limp: fighter.limp.size, shares };
  return shares;
}

function solveConstraints(fighter, h, reposition = false) {
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
      if (!reposition) continue;
      fighter.prev[i * 3 + axis] += normal[axis] * lambda * fighter.invMass[i];
      fighter.prev[j * 3 + axis] -= normal[axis] * lambda * fighter.invMass[j];
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
  // ...and, repositioned, its motion into the limit is kept: noted here, it
  // is stopped once the substep's speeds are known (stopAtLimits).
  if (arrays.length === 2) (fighter.atLimits ??= []).push({ index, others, normal: vec.scale(capped, 1 / vec.length(capped)) });
}

/**
 * The limits a limp or rising body met this substep stop what is coming to
 * rest against them, as the floor stops what lies on it: the joint's parts'
 * speed against each other into the limit is taken away (shared by mass, so
 * the body's own motion goes on), all of it near rest and less the faster
 * they close (WORLD.ragdoll.restAgainst). Repositioning alone kept that speed
 * and gravity fed it back every substep: a limb lay against its limit at a
 * speed it never moved by (a knee at −1.4 m/s indefinitely), and the body
 * never came to rest. Stopping a falling body's every contact as hard made
 * straight limbs under it props it sank onto slowly. Called once the
 * substep's speeds are known; it only takes speed away.
 */
function stopAtLimits(fighter) {
  const engaged = fighter.atLimits;
  if (!engaged?.length) return;
  for (const { index, others, normal } of engaged) {
    const along = (particle) => fighter.v[particle * 3] * normal[0] + fighter.v[particle * 3 + 1] * normal[1] + fighter.v[particle * 3 + 2] * normal[2];
    let othersMass = 0;
    let othersAlong = 0;
    for (const other of others) {
      const kg = 1 / fighter.invMass[other];
      othersMass += kg;
      othersAlong += along(other) * kg;
    }
    const closing = along(index) - (othersMass > 0 ? othersAlong / othersMass : 0);
    const resting = WORLD.ragdoll.restAgainst;
    if (closing >= 0 || -closing > resting) continue;
    // Equal and opposite impulses that bring the closing speed to nothing.
    const reduced = 1 / (fighter.invMass[index] + (othersMass > 0 ? 1 / othersMass : 0));
    // All of it when it has all but come to rest there; less the faster it
    // comes, none from a blow (the limit repositions that, as it always has).
    const impulse = -closing * reduced * (1 + closing / resting);
    for (let axis = 0; axis < 3; axis += 1) {
      fighter.v[index * 3 + axis] += normal[axis] * impulse * fighter.invMass[index];
      for (const other of others) fighter.v[other * 3 + axis] -= (normal[axis] * impulse) / othersMass;
    }
  }
  engaged.length = 0;
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
  // Running, a knee bends forward along his way: a runner's thigh is turned in its hip to the way he runs, whatever turn his
  // swinging legs give his pelvis (the knee's hinge goes with the thigh, not the pelvis). Held to the pelvis's front, a pelvis
  // swung 30-50 degrees by the stride pushed every straightened knee out sideways: the knees flew wide.
  const kneeForward = fighter.runPose > 0 ? vec.normalize(vec.lerp(forward, runForward(fighter, trunkUp), fighter.runPose)) : forward;

  for (const side of ['l', 'r']) {
    const sign = side === 'l' ? 1 : -1;
    // Knees bend only forward.
    if (hingeDefined) hinge(world, fighter, `${side}Knee`, P[`${side}Hip`], P[`${side}Knee`], P[`${side}Foot`], kneeForward, L.shank);
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
  if (fighter.body.gear.headLocked) lockHead(fighter, trunkUp, leftward);
  else coneLimit(world, fighter, 'neck', P.neck, P.head, trunkUp, limp ? WORLD.ragdoll.headCone : WORLD.headCone);
  twistLimit(fighter, trunkUp, limp ? WORLD.ragdoll.spineTwist : WORLD.spineTwist);
  // Getting up, a body still unfolding from the floor keeps all its limbs
  // out of its trunk as a limp one does.
  if (limp) holdLimbTwist(fighter);
  // A limp body's limits reposition its parts; the bones they stretched are
  // set back the same way, or next substep's pull would hand the stretch
  // back as speed (limits that disagree pumped a lying body). Its limbs are
  // then kept out of its trunk, last, so nothing pulls them back in.
  if (limp) solveConstraints(fighter, h, true);
  if (limp || fighter.state === 'rising') keepOutOfTrunk(fighter);
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

/** Out of the fight long enough (`WORLD.goneSeconds`) that his body is left lying, unsimulated; or dormant (his section of a level is not active: kept as he is). */
function gone(fighter) {
  return fighter.dormant === true || (fighter.state === 'out' && (fighter.outFor ?? 0) > WORLD.goneSeconds);
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
      // Turned, not pushed along the tangent: a push lengthens the hips and
      // shoulders, and the bones' pull back is speed (it pumped a limp body).
      correctJoint(fighter, index, [centre], vec.sub(turnAbout(radial, trunkUp, amount), radial));
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

/** His way (the facing), square to his trunk: the front of a runner's knees. */
function runForward(fighter, trunkUp) {
  const ahead = yawRotate([1, 0, 0], fighter.yaw);
  return vec.normalize(vec.sub(ahead, vec.scale(trunkUp, vec.dot(ahead, trunkUp))));
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

// Each limb whose turn about its upper bone is held: kind, side, the three
// particles and the joint that takes the strain.
const TWISTING = ['l', 'r'].flatMap((side) => [
  { kind: 'arm', side, root: P[`${side}Shoulder`], middle: P[`${side}Elbow`], end: P[`${side}Hand`], joint: `${side}Elbow` },
  { kind: 'leg', side, root: P[`${side}Hip`], middle: P[`${side}Knee`], end: P[`${side}Foot`], joint: `${side}Knee` },
]);

/**
 * The shoulders and hips turn the upper bones only so far about their
 * length (joints.js). Past the comfortable range the forearm's or shin's
 * spin about the upper bone further out is resisted, as a torque would: a
 * share of it taken off each substep, growing through the range's last
 * `softBand` to all of it at the limit. Only what carries it out is taken,
 * never more, so the resistance takes energy out and puts none in; past the
 * limit, a limb clear of the floor is eased back (`restoreRate`), one lying
 * on it stays as it lies. Speeds, not positions: a body sat on its own folded
 * leg cannot untwist it, and a positional push would fight the floor every
 * substep. Wrenched on past the limit (still turning out), the elbow or knee
 * strains; lying still in a turned pose, it does not.
 */
function resistLimbTwist(world, fighter) {
  const spec = WORLD.limbTwist;
  // On his feet his muscles keep a limb in range; only its limit's ligaments resist.
  const band = fighter.state === 'up' ? spec.standingBand : spec.softBand;
  const pelvis = point(fighter.x, P.pelvis);
  const neck = point(fighter.x, P.neck);
  const axesFor = {
    arm: trunkAxes(pelvis, neck, point(fighter.x, P.lShoulder), point(fighter.x, P.rShoulder)),
    leg: trunkAxes(pelvis, neck, point(fighter.x, P.lHip), point(fighter.x, P.rHip)),
  };
  for (const limb of TWISTING) {
    const axes = axesFor[limb.kind];
    if (!axes || fighter.broken.has(limb.joint)) continue;
    const a = point(fighter.x, limb.root);
    const b = point(fighter.x, limb.middle);
    const c = point(fighter.x, limb.end);
    const turn = limbTwist(axes, limb.kind, limb.side, a, b, c);
    const excess = twistExcess(limb.kind, turn, band);
    if (!excess) continue;
    const over = Math.abs(excess);
    const axis = vec.normalize(vec.sub(b, a));
    const lower = vec.sub(c, b);
    const radial = vec.sub(lower, vec.scale(axis, vec.dot(lower, axis)));
    const radius = vec.length(radial);
    if (radius < 0.02) continue;
    // Spinning the lower bone about the upper turns the limb one for one:
    // which way round takes it back into range.
    const probed = limbTwist(axes, limb.kind, limb.side, a, b, vec.add(b, turnAbout(lower, axis, 0.05)));
    if (!probed) continue;
    const back = vec.scale(axis, -Math.sign(excess) * (Math.sign(Math.sin(probed.twist - turn.twist)) || 1));
    const tangent = vec.scale(vec.cross(back, radial), 1 / radius);
    // The lower bone's own speed round the upper, back towards range (− out).
    const spin = vec.dot(vec.sub(point(fighter.v, limb.end), point(fighter.v, limb.middle)), tangent);
    // A limb only just bent has little twist to speak of: no step as it
    // straightens, and no strain from a turn the bend barely defines.
    const bent = Math.min(1, (turn.bend - spec.from) / spec.from);
    if (over > band && bent >= 1 && -spin > spec.wrenchSpeed && strain(world, fighter, limb.joint, over - band - spec.breakFurther)) continue;
    let push = Math.max(0, -spin) * Math.min(1, over / band) * bent * spec.resistShare;
    // Past the limit and clear of the floor, eased back at a gentle speed
    // (set, not added) by muscle; a limp limb only stops.
    if (!isLimp(fighter) && over > band && c[1] > fighter.radius[limb.end] + 0.01) {
      push = Math.max(push, Math.min(spec.restoreMax, spec.restoreRate * (over - band)) * bent * radius - spin);
    }
    if (push < 1e-6) continue;
    // On the lower bone alone: the turn's other half is a torque about the
    // upper bone's own length, which its two ends do not feel.
    for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) fighter.v[limb.end * 3 + axisIndex] += tangent[axisIndex] * push;
  }
}

/**
 * A limp limb left turned past its limit (a fall can wrench it there faster
 * than resisting its spin can stop it) is turned back towards it about its
 * upper bone, a little each substep (WORLD.limbTwist.limpHold): a
 * repositioning like the other limits, the lower bone's length kept, so it
 * puts no speed in. All at once, it swung feet into the trunk and fought it.
 */
function holdLimbTwist(fighter) {
  const pelvis = point(fighter.x, P.pelvis);
  const neck = point(fighter.x, P.neck);
  const axesFor = {
    arm: trunkAxes(pelvis, neck, point(fighter.x, P.lShoulder), point(fighter.x, P.rShoulder)),
    leg: trunkAxes(pelvis, neck, point(fighter.x, P.lHip), point(fighter.x, P.rHip)),
  };
  for (const limb of TWISTING) {
    const axes = axesFor[limb.kind];
    if (!axes || fighter.broken.has(limb.joint)) continue;
    const a = point(fighter.x, limb.root);
    const b = point(fighter.x, limb.middle);
    const c = point(fighter.x, limb.end);
    const turn = limbTwist(axes, limb.kind, limb.side, a, b, c);
    const excess = twistExcess(limb.kind, turn, 0);
    if (!excess) continue;
    const bent = Math.min(1, (turn.bend - WORLD.limbTwist.from) / WORLD.limbTwist.from);
    const axis = vec.normalize(vec.sub(b, a));
    const lower = vec.sub(c, b);
    const probed = limbTwist(axes, limb.kind, limb.side, a, b, vec.add(b, turnAbout(lower, axis, 0.05)));
    if (!probed) continue;
    const back = -Math.sign(excess) * (Math.sign(Math.sin(probed.twist - turn.twist)) || 1);
    correctJoint(fighter, limb.end, [], vec.sub(turnAbout(lower, axis, back * Math.min(WORLD.limbTwist.limpHold, Math.abs(excess)) * bent), lower));
  }
}

/**
 * A head locked to the trunk (a jousting helm bolted to the breastplate,
 * OUTFITS headLocked): every substep it is put back where the trunk carries
 * it (pose.js lockedHead), the correction shared by head and upper trunk by
 * their masses, so a blow on the helm moves the man, not his head on his
 * neck. No neck to wrench or break. Limp or rising, only repositioned (as
 * correctJoint does), so it hands back no speed.
 */
function lockHead(fighter, trunkUp, leftward) {
  const neck = point(fighter.x, P.neck);
  const forward = vec.normalize(vec.cross(trunkUp, leftward));
  const restLean = STYLES[fighter.style]?.stance?.lean ?? WORLD.headLock.restLean;
  const delta = vec.sub(lockedHead(fighter.body, neck, trunkUp, forward, restLean), point(fighter.x, P.head));
  if (vec.length(delta) < 1e-9) return;
  const carriers = [P.neck, P.lShoulder, P.rShoulder];
  const headWeight = fighter.invMass[P.head];
  const trunkWeight = 1 / carriers.reduce((sum, index) => sum + 1 / fighter.invMass[index], 0);
  const share = headWeight / (headWeight + trunkWeight);
  const arrays = isLimp(fighter) || fighter.state === 'rising' ? [fighter.x, fighter.prev] : [fighter.x];
  for (const array of arrays) {
    for (let axis = 0; axis < 3; axis += 1) {
      array[P.head * 3 + axis] += delta[axis] * share;
      for (const index of carriers) array[index * 3 + axis] -= delta[axis] * (1 - share);
    }
  }
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
  // Just down from a jump, the legs folding under him (or gone over, until he is up): the landing has said what it did to
  // his bones (jump.js jumpLanding), and a ragdoll's legs folded under it on the floor are no second verdict.
  if (fighter.jumpLandedAt !== undefined && LEG_JOINTS.has(joint)) {
    const since = world.time - fighter.jumpLandedAt;
    if (since < WORLD.jump.land.grace || (fighter.state === 'down' && since < WORLD.jump.land.downGrace)) return false;
  }
  const h = fighter.limitStep;
  const strains = fighter.strain ?? (fighter.strain = {});
  const past = Math.max(0, overAngle - breakAngleFor(joint));
  strains[joint] = (strains[joint] ?? 0) + past * h;
  if (strains[joint] <= WORLD.joint.strainToBreak) return false;
  breakJoint(world, fighter, joint);
  return true;
}

const LEG_JOINTS = new Set(['lKnee', 'rKnee', 'lHip', 'rHip']);

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
  // The shield arm broken: it cannot hold it; nor the off hand's blade.
  if (joint === 'lElbow') dropShield(world, fighter, 'dropped');
  if (fighter.offWeapon?.held && joint === `${fighter.offWeapon.main}Elbow`) dropOffWeapon(world, fighter, 'dropped');
  for (const name of LIMP_BELOW[joint]) fighter.limp.add(P[name]);
  fighter.damage[JOINT_SEGMENTS[joint][0]] = Math.max(fighter.damage[JOINT_SEGMENTS[joint][0]] ?? 0, 1);
  const ending = !joint.endsWith('Elbow');
  const event = { time: world.time, kind: 'broken', fighter: fighter.id, joint, effects: [`${jointName(joint)} broken${ending ? ' — cannot continue' : ''}`] };
  world.events.push(event);
  if (world.ear && P[joint] !== undefined) soundWound(world, fighter, 'bone', 1, particleAt(fighter, P[joint]));
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

/**
 * Terrain (physics/terrain.js) for the ground: each part stands on the floor under it (the highest within
 * a step of its lowest point), is pushed out of walls and the faces of ledges with its speed into them
 * gone, and is held under a ceiling. Where there is no floor it falls; below the sea the fighter is lost
 * (lostToSea). Edges of the arena's box apply unless the arena is `open`.
 */
function collideTerrain(world, fighter, h, arena) {
  const terrain = arena.terrain;
  const spec = WORLD.terrain;
  const friction = Math.exp(-WORLD.groundFriction * h);
  const at = [0, 0];
  // In a jump's flight a part comes up onto a ledge only if it is nearly over it (WORLD.jump.clear), not a stride under it.
  const flying = fighter.jump?.phase === 'air';
  for (let index = 0; index < PARTICLES.length; index += 1) {
    const base = index * 3;
    const radius = fighter.radius[index];
    // (Only a foot: a knee or a hand is not put up on a ledge, it is stopped by its face.)
    const stepUp = flying ? (PARTICLE_INFO[index].foot ? WORLD.jump.clear : 0.02) : spec.stepUp;
    at[0] = fighter.x[base];
    at[1] = fighter.x[base + 2];
    if (pushOut(terrain, at, radius, fighter.x[base + 1] - radius, fighter.x[base + 1] + radius, stepUp)) {
      const nx = terrain.normal[0];
      const nz = terrain.normal[1];
      // Its motion this substep, without the part going into the wall.
      let vx = fighter.x[base] - fighter.prev[base];
      let vz = fighter.x[base + 2] - fighter.prev[base + 2];
      const into = vx * nx + vz * nz;
      if (into < 0) {
        vx -= into * nx;
        vz -= into * nz;
      }
      fighter.x[base] = at[0];
      fighter.x[base + 2] = at[1];
      fighter.prev[base] = at[0] - vx;
      fighter.prev[base + 2] = at[1] - vz;
    }
    const floor = radius + floorAt(terrain, fighter.x[base], fighter.x[base + 2], fighter.x[base + 1] - radius + stepUp);
    if (fighter.x[base + 1] < floor) {
      // Arriving this substep (it was clear of the floor): how fast it hit. The part's speed as it fell
      // (not only how far it moved: a joint's correction can push a resting knee down a few centimetres at once).
          if (fighter.prev[base + 1] >= floor - 1e-4) groundImpact(world, fighter, index, Math.min((fighter.prev[base + 1] - fighter.x[base + 1]) / h, WORLD.gravity * h - fighter.v[base + 1]));
      // Run into a higher tread (a knee against the stair ahead) it is lifted a little each substep, not at once:
      // a part snapped up by centimetres throws the limb it is joined to (and the joints pull it back down as a fall
      // at tens of m/s: a man sliding on down a flight has risers of 0.2 m for that). Fallen on the floor, it stops there.
      const lift = floor - fighter.x[base + 1];
      const landed = fighter.prev[base + 1] >= floor - 1e-4;
      const reached = landed ? floor : fighter.x[base + 1] + Math.min(lift, spec.rise * h);
      fighter.x[base + 1] = reached;
      fighter.prev[base + 1] = Math.max(fighter.prev[base + 1], reached);
      fighter.x[base] = fighter.prev[base] + (fighter.x[base] - fighter.prev[base]) * friction;
      fighter.x[base + 2] = fighter.prev[base + 2] + (fighter.x[base + 2] - fighter.prev[base + 2]) * friction;
    }
    if (terrain.ceilings) {
      const ceiling = ceilingAt(terrain, fighter.x[base], fighter.x[base + 2], fighter.x[base + 1] - radius) - radius;
      if (fighter.x[base + 1] > ceiling) {
        fighter.x[base + 1] = ceiling;
        fighter.prev[base + 1] = Math.min(fighter.prev[base + 1], ceiling);
      }
    }
    if (!arena.open) {
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
}

/** Below the sea level of the terrain a fighter is lost: out, with no count. */
function lostToSea(world, fighter) {
  const sea = world.arena.terrain.sea;
  if (fighter.state === 'out' || fighter.x[P.pelvis * 3 + 1] >= sea) return;
  const event = { time: world.time, kind: 'drowned', attacker: fighter.lastHitBy ?? fighter.lastWoundedBy ?? fighter.id, point: point(fighter.x, P.pelvis), effects: [] };
  knockOut(world, fighter, event, 'lost to the sea', 'drowned');
}

function collideGround(world, fighter, h, arena) {
  if (arena.terrain) {
    collideTerrain(world, fighter, h, arena);
    return;
  }
  const friction = Math.exp(-WORLD.groundFriction * h);
  const drop = arena.drop;
  for (let index = 0; index < PARTICLES.length; index += 1) {
    const base = index * 3;
    // The platform's face: a part gone over the edge and below its top is held off the slab, not lifted back onto it.
    if (drop && fighter.x[base + 1] < 0 && fighter.x[base + 2] < drop.at && fighter.prev[base + 2] >= drop.at) {
      fighter.x[base + 2] = drop.at;
      fighter.prev[base + 2] = Math.max(fighter.prev[base + 2], drop.at);
    }
    const floor = fighter.radius[index] + floorUnder(arena, fighter.x[base + 2]);
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
    // Past a drop edge the wall is the far one, across the lower floor.
    for (const axis of [0, 2]) {
      const limit = axis === 0 ? arena.halfX : arena.halfZ;
      const far = axis === 2 && drop ? drop.to : limit;
      if (fighter.x[base + axis] > far) {
        fighter.x[base + axis] = far;
        fighter.prev[base + axis] = Math.min(fighter.prev[base + axis], far);
      }
      if (fighter.x[base + axis] < -limit) {
        fighter.x[base + axis] = -limit;
        fighter.prev[base + axis] = Math.max(fighter.prev[base + axis], -limit);
      }
    }
  }
}

/**
 * The floor's height at z: 0, or past an arena's drop edge (`arena.drop`, on
 * the +z side: a subway platform's edge over the track bed) the lower floor.
 */
export function floorUnder(arena, z, x = 0, y = 0) {
  // On terrain, the floor under (x, y, z): the highest within a stride of y (the sea level where there is none).
  if (arena?.terrain) {
    const floor = floorAt(arena.terrain, x, z, y + WORLD.terrain.stepUp);
    return floor === -Infinity ? arena.terrain.sea : floor;
  }
  const drop = arena?.drop;
  return drop && z > drop.at ? drop.floor : 0;
}

/**
 * Over a drop edge: a man whose hips have gone past it loses his feet; once
 * they are down below the platform he is off it, and out of the bout (he
 * fell onto the tracks: no climbing back up a 1.1 m face with the other man
 * standing over him).
 */
function overTheEdge(world, fighter) {
  const drop = world.arena.drop;
  if (!drop || fighter.state === 'out') return;
  const pelvis = point(fighter.x, P.pelvis);
  if (pelvis[2] <= drop.at) return;
  if (pelvis[1] < WORLD.drop.outBelow) {
    const event = { time: world.time, kind: 'knockout', attacker: fighter.lastHitBy ?? fighter.lastWoundedBy ?? fighter.id, point: pelvis, effects: [] };
    knockOut(world, fighter, event, drop.reason ?? 'fell off the edge');
    return;
  }
  if ((fighter.state === 'up' || fighter.state === 'rising') && pelvis[2] > drop.at + WORLD.drop.footing) fall(world, fighter, 'steps back into nothing');
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
  // Heard: a body come down on the floor (his hips meeting it), hurt or not: a dead man falls as loud as a live one.
  if (index === P.pelvis && world.ear) soundDown(world, fighter, 'fall', particleAt(fighter, index), speed);
  if (fighter.state === 'out' || speed <= spec.minSpeed) return;
  const name = PARTICLES[index];
  const gear = fighter.body.gear;
  const bone = Math.max(0.4, fighter.body.boneDensity ?? 1);
  // On terrain, a man landing on his feet is hurt through his legs and spine (landOnFeet); anything
  // else hits as hard as it fell: the speed past `bodyFrom` (not the ordinary floor's), times `body`.
  const landing = world.arena.terrain ? WORLD.terrain.fall : null;
  if (landing && PARTICLE_INFO[index].foot) {
    landOnFeet(world, fighter, index, speed);
    return;
  }
  const through = landing ? speed - landing.bodyFrom : speed - spec.minSpeed;
  if (through <= 0) return;
  const scale = landing ? landing.body : 1;
  if (name === 'head') {
    const deltaV = through * spec.head * scale * (1 - (protectionAt(gear, 'head').blunt ?? 0));
    if (deltaV < 0.5) return;
    // Credit for what the floor does goes to whoever put him there.
    const event = { time: world.time, kind: 'impact', attacker: fighter.lastHitBy ?? fighter.lastWoundedBy ?? fighter.id, fighter: fighter.id, defender: fighter.id, target: 'head', speed, headDeltaV: deltaV, harmDeltaV: deltaV, effects: ['head hit the ground'], point: point(fighter.x, index) };
    world.events.push(event);
    applyHeadDamage(world, fighter, event);
    return;
  }
  const part = IMPACT_PART[name];
  if (!part) return;
  const bruise = (through * spec.body * scale * (1 - (protectionAt(gear, part).blunt ?? 0))) / bone;
  addDamage(fighter, part, bruise, false);
  if (part === 'trunk') bleedInside(fighter, bruise);
  const joint = IMPACT_JOINT[name];
  if (joint && !fighter.broken.has(joint) && speed > spec.fractureSpeed * bone) {
    breakJoint(world, fighter, joint);
    world.events.push({ time: world.time, kind: 'impact', fighter: fighter.id, target: part, speed, effects: [`${name.slice(1).toLowerCase()} broken in the fall`], point: point(fighter.x, index) });
  }
}

/**
 * A fall landed on the feet (terrain only; WORLD.terrain.fall): a landing past `safe` m/s hurts the legs
 * in proportion to the speed beyond it, may break an ankle (from `ankleFrom`, surely by `ankleTo`),
 * jars the spine past `compressFrom`, and throws him down from `stumble`.
 */
function landOnFeet(world, fighter, index, speed) {
  const spec = WORLD.terrain.fall;
  // A jump's landing is his legs' (landJump: jump.js jumpLanding), not a fall's as well.
  if (fighter.jump || (fighter.jumpLandedAt !== undefined && world.time - fighter.jumpLandedAt < WORLD.jump.land.grace)) return;
  // The man played lands as fast as his body comes down, not as a foot swung down onto the floor goes (or a joint's push on it).
  if (fighter.player) speed = Math.min(speed, Math.max(0, -fighter.v[P.pelvis * 3 + 1]) + spec.footOver);
  const through = speed - spec.safe;
  if (through <= 0) return;
  // A foot that comes down fast onto the next tread of a flight, or the one below a kerb, is a step and not a fall:
  // it lands hard only after a spell in the air (the drop of `airMin` s of falling).
  if (airSpell(world, fighter) < spec.airMin) return;
  const side = PARTICLE_INFO[index].side;
  const bone = Math.max(0.4, fighter.body.boneDensity ?? 1);
  const gear = fighter.body.gear;
  // The first foot down starts the landing; the second, a moment later, is the same fall.
  const first = world.time - (fighter.landedAt ?? -Infinity) > spec.together;
  if (first) fighter.landedAt = world.time;
  // (Heard: a drop come down hard on his feet.)
  if (first && world.ear) soundDown(world, fighter, 'land', particleAt(fighter, index), speed);
  fighter.legDamage[side] += (spec.legs * through * (1 - (protectionAt(gear, `${side}Shank`).blunt ?? 0))) / bone;
  const effects = ['lands hard'];
  const joint = `${side}Knee`;
  if (first && speed > spec.ankleFrom && !fighter.broken.has(joint) && world.random() < Math.min(1, (speed - spec.ankleFrom) / (spec.ankleTo - spec.ankleFrom)) / bone) {
    breakJoint(world, fighter, joint);
    effects.push('ankle broken in the fall');
  }
  if (first && speed > spec.compressFrom) {
    const jar = ((speed - spec.compressFrom) * spec.compress * (1 - (protectionAt(gear, 'trunk').blunt ?? 0))) / bone;
    addDamage(fighter, 'trunk', jar, false);
    bleedInside(fighter, jar);
    effects.push('spine jarred');
  }
  world.events.push({ time: world.time, kind: 'impact', fighter: fighter.id, target: 'legs', speed, effects, point: point(fighter.x, index) });
  if (first && speed > spec.stumble && fighter.state === 'up') {
    fighter.knock = [0, 0, 0];
    fall(world, fighter, 'lands hard');
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
  return (facing[0] * from[0] + facing[2] * from[2]) / length < Math.cos(sightAngle(defender));
}

/** How far off his facing a man sees (rad): a head locked in a jousting helm sees only out of its slit. */
export function sightAngle(fighter) {
  return fighter.body.gear.headLocked ? WORLD.headLock.sight : WORLD.blindsideAngle;
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
    const propFloor = spec.radius + floorUnder(world.arena, prop.x[2], prop.x[0], prop.x[1]);
    if (prop.x[1] < propFloor) {
      prop.x[1] = propFloor;
      prop.v = [prop.v[0] * spec.slide, -prop.v[1] * spec.restitution, prop.v[2] * spec.slide];
      prop.spin = vec.scale(prop.spin, spec.slide);
      if (Math.abs(prop.v[1]) < 0.4 && Math.hypot(prop.v[0], prop.v[2]) < 0.15) {
        prop.resting = true;
        // Flat on the floor, the way it fell.
        prop.turn = [0, prop.turn[1], 0];
      }
    }
    const { halfX, halfZ, drop } = world.arena;
    for (const [axis, half, far] of [[0, halfX + 0.3, halfX + 0.3], [2, halfZ + 0.3, drop ? drop.to : halfZ + 0.3]]) {
      if (prop.x[axis] > far || prop.x[axis] < -half) {
        prop.x[axis] = prop.x[axis] > 0 ? far : -half;
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

/** How far the point (px, py, pz) is from the segment a to b (in numbers rather than vectors: asked of every near pair, every substep). */
function gapToSegment(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const lengthSquared = abx * abx + aby * aby + abz * abz;
  const t = lengthSquared < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / lengthSquared));
  const dx = ax + abx * t - px;
  const dy = ay + aby * t - py;
  const dz = az + abz * t - pz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function collideFighters(world, h, time, substep = 0) {
  const fighters = world.fighters;
  if (fighters.length > WORLD.tiers.full) {
    collideCrowd(world, time, substep);
    return;
  }
  // Two bodies whose hips are further apart than a kick and a body can
  // span cannot touch: skip them. In a crowd most pairs are like that.
  const hips = fighters.map((fighter) => point(fighter.x, P.pelvis));
  for (const fighter of fighters) fighter.reachBound = reachBound(fighter);
  // A weapon reaching past what a body can (a lance's point, ~2.8 m out) widens the range by as much:
  // otherwise its point could never meet a man before he was inside it.
  const beyond = fighters.map((fighter) => (fighter.weapon?.held ? Math.max(0, (fighter.reachBound ?? 0) - REACH_MARGIN - WORLD.bodyReach) : 0));
  const near = (a, b) => !fighters[a].dormant && !fighters[b].dormant && Math.hypot(hips[a][0] - hips[b][0], hips[a][2] - hips[b][2]) < WORLD.contactRange + beyond[a] + beyond[b];
  fighters.forEach((attacker, a) => {
    if (attacker.dormant) return;
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
      if (fighters[first].corner !== fighters[second].corner) clashBlades(world, fighters[first], fighters[second]);
    }
  }
}

// What collideCrowd works from, kept between substeps rather than rebuilt: each fighter's
// hips (x, z) and extra reach as the substep began, and the near fighters among its candidates.
let crowdHipX = new Float64Array(0);
let crowdHipZ = new Float64Array(0);
let crowdBeyond = new Float64Array(0);
const crowdNeighbours = [];

/**
 * A big fight's contacts: near pairs are found through a grid, in the same
 * order as the all-pairs test of a small one; a proxy (posed, not simulated)
 * touches nothing.
 */
function collideCrowd(world, time, substep) {
  const fighters = world.fighters;
  const count = fighters.length;
  if (crowdHipX.length < count) {
    crowdHipX = new Float64Array(count * 2);
    crowdHipZ = new Float64Array(count * 2);
    crowdBeyond = new Float64Array(count * 2);
  }
  const hipX = crowdHipX;
  const hipZ = crowdHipZ;
  const beyond = crowdBeyond;
  for (let index = 0; index < count; index += 1) {
    const fighter = fighters[index];
    hipX[index] = fighter.x[P.pelvis * 3];
    hipZ[index] = fighter.x[P.pelvis * 3 + 2];
    if (fighter.detail !== 'proxy') fighter.reachBound = reachBound(fighter);
    // A weapon reaching past what a body can (a lance's point, ~2.8 m out) widens the range by as much:
    // otherwise its point could never meet a man before he was inside it.
    beyond[index] = fighter.weapon?.held ? Math.max(0, (fighter.reachBound ?? 0) - REACH_MARGIN - WORLD.bodyReach) : 0;
  }
  // Candidates once a step (the grid, its lookups and sorts were a tenth of
  // a big fight's step when made every substep); the exact range each substep.
  if (world.contactCache?.time !== world.time || world.contactCache.count !== count) {
    const hips = [];
    for (let index = 0; index < count; index += 1) hips.push([hipX[index], hipZ[index]]);
    const grid = spatialGrid(hips, WORLD.contactRange + WORLD.contactMargin);
    world.contactCache = { time: world.time, count, near: fighters.map((fighter, index) => (fighter.detail === 'proxy' ? [] : grid.near(index))) };
  }
  const candidates = world.contactCache.near;
  // Two coarse fighters move only on their substeps: they are tested then.
  const stride = coarseStride(world);
  const coarseSubstep = substep % stride === stride - 1;
  // In a big fight a hand or blade not striking (guarding, hanging) is
  // tested on every other substep; the strike in flight on every one.
  const idleEvery = fightTier(world) >= 3 ? 2 : 1;
  for (let a = 0; a < count; a += 1) {
    const list = (crowdNeighbours[a] ??= []);
    list.length = 0;
    if (fighters[a].detail === 'proxy') continue;
    const mine = candidates[a];
    // (Among the grid's candidates: a long weapon's extra reach counts out to contactMargin.)
    for (let k = 0; k < mine.length; k += 1) {
      const b = mine[k];
      if (!((hipX[a] - hipX[b]) ** 2 + (hipZ[a] - hipZ[b]) ** 2 < (WORLD.contactRange + beyond[a] + beyond[b]) ** 2)) continue;
      if (fighters[b].detail !== 'proxy' && (coarseSubstep || fighters[a].detail === 'full' || fighters[b].detail === 'full')) list.push(b);
    }
  }
  for (let a = 0; a < count; a += 1) {
    const list = crowdNeighbours[a];
    if (!list.length) continue;
    const attacker = fighters[a];
    const limbs = strikers(attacker);
    for (let k = 0; k < list.length; k += 1) {
      const defender = fighters[list[k]];
      if (attacker.corner === defender.corner && !attacker.punch) continue;
      for (const striker of limbs) {
        const striking = striker.weapon ? Boolean(strokeOf(attacker, striker.weapon)) : attacker.punch?.spec.limb === striker.key;
        if (striking || substep % idleEvery === 0) collideStriker(world, attacker, defender, striker, time);
      }
    }
  }
  for (let a = 0; a < count; a += 1) {
    const list = crowdNeighbours[a];
    for (let k = 0; k < list.length; k += 1) {
      const b = list[k];
      if (b <= a) continue;
      pushApart(world, fighters[a], fighters[b]);
      if (fighters[a].corner !== fighters[b].corner) clashBlades(world, fighters[a], fighters[b]);
    }
  }
}

/** A striker with every field set (unset ones undefined), so all strikers share one shape. */
function strikerOf(key, a, b, radius, side, { weapon, bash, shin, pa, pb } = {}) {
  return { key, weapon, bash, shin, a, b, pa, pb, radius, side };
}

// The two hands as strikers, by fist radius (gloved or bare): nothing in them changes, so they are made once.
const handStrikerCache = new Map();
function handStrikers(fist) {
  let hands = handStrikerCache.get(fist);
  if (!hands) {
    hands = ['l', 'r'].map((side) => strikerOf(`${side}Hand`, P[`${side}Hand`], P[`${side}Hand`], fist, side));
    handStrikerCache.set(fist, hands);
  }
  return hands;
}

/**
 * What of the attacker can hit: both gloves always (they block and push),
 * and the limb of a strike in flight — an elbow or knee as a ball, a kick as
 * the shin from knee to foot.
 */
function strikers(fighter) {
  const fist = fistsOf(fighter.body).radius;
  const list = handStrikers(fist).slice();
  // A shield bash: the left hand's blow lands with the shield's face, a broad capsule up its middle.
  if (fighter.punch?.spec.bash && fighter.shield) {
    const shield = shieldDisc(fighter);
    const spec = fighter.shield.spec;
    const reach = (spec.shape ? spec.height / 2 : spec.radius) * 0.75;
    const face = vec.add(shield.centre, vec.scale(shield.normal, 0.02));
    list[0] = strikerOf('lHand', P.lHand, P.lHand, spec.shape ? spec.width * 0.4 : spec.radius * 0.75, 'l', { bash: true, pa: vec.sub(face, vec.scale(shield.up, reach)), pb: vec.add(face, vec.scale(shield.up, reach)) });
  }
  // Each blade in his hands (two blades: the off hand's too, `offWeapon`).
  for (const weapon of heldBlades(fighter)) {
    // (A whip's handle strikes nothing: its thong's tip does, in physics/whip.js.)
    if (weapon.spec.rope) continue;
    // The weapon, from where it starts to strike to its tip.
    const hand = P[`${weapon.main}Hand`];
    list.push(strikerOf(weapon === fighter.weapon ? 'weapon' : 'offWeapon', hand, hand, weapon.spec.radius, weapon.main, { weapon, pa: vec.add(point(fighter.x, hand), vec.scale(weapon.dir, weapon.spec.strikeFrom)), pb: weapon.tip }));
  }
  const punch = fighter.punch;
  if (!punch || punch.t > punch.spec.extendUntil + 0.06) return list;
  const limb = punch.spec.limb;
  const side = limb[0];
  if (limb.endsWith('Elbow')) list.push(strikerOf(limb, P[limb], P[limb], 0.05, side));
  else if (limb.endsWith('Knee')) list.push(strikerOf(limb, P[limb], P[limb], 0.07, side));
  else if (limb.endsWith('Foot')) list.push(strikerOf(limb, P[`${side}Knee`], P[limb], 0.05, side, { shin: true }));
  return list;
}

// Two segments, p1 to q1 and p2 to q2, as twelve numbers: what segmentsGap reads.
const segmentPair = new Float64Array(12);

/** The end points of a capsule's axis (capsuleEnds' arithmetic) written into `into` at `at`. */
function writeCapsuleEnds(into, at, fighter, capsule) {
  const x = fighter.x;
  const aAt = capsule.a * 3;
  const bAt = capsule.b * 3;
  const ax = x[aAt];
  const ay = x[aAt + 1];
  const az = x[aAt + 2];
  into[at] = ax;
  into[at + 1] = ay;
  into[at + 2] = az;
  if (capsule.bLength) {
    const along = capsule.bLength;
    into[at + 3] = ax + (x[bAt] - ax) * along;
    into[at + 4] = ay + (x[bAt + 1] - ay) * along;
    into[at + 5] = az + (x[bAt + 2] - az) * along;
  } else {
    into[at + 3] = x[bAt];
    into[at + 4] = x[bAt + 1];
    into[at + 5] = x[bAt + 2];
  }
}

/**
 * The distance between the segments in `segmentPair`: the length of
 * closestBetween's onFirst minus onSecond, in numbers rather than vectors (a
 * crowd asks it of thousands of pairs a substep, nearly all of them clear).
 */
function segmentsGap() {
  const pair = segmentPair;
  const d1x = pair[3] - pair[0];
  const d1y = pair[4] - pair[1];
  const d1z = pair[5] - pair[2];
  const d2x = pair[9] - pair[6];
  const d2y = pair[10] - pair[7];
  const d2z = pair[11] - pair[8];
  const rx = pair[0] - pair[6];
  const ry = pair[1] - pair[7];
  const rz = pair[2] - pair[8];
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s;
  let t;
  if (a < 1e-12 && e < 1e-12) {
    s = 0;
    t = 0;
  } else if (a < 1e-12) {
    s = 0;
    t = Math.max(0, Math.min(1, f / e));
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e < 1e-12) {
      t = 0;
      s = Math.max(0, Math.min(1, -c / a));
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denominator = a * e - b * b;
      s = denominator > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / denominator)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.max(0, Math.min(1, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.max(0, Math.min(1, (b - c) / a));
      }
    }
  }
  const ox = pair[0] + d1x * s - (pair[6] + d2x * t);
  const oy = pair[1] + d1y * s - (pair[7] + d2y * t);
  const oz = pair[2] + d1z * s - (pair[8] + d2z * t);
  return Math.sqrt(ox * ox + oy * oy + oz * oz);
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
  if (fighter.state === 'up') {
    for (const weapon of heldBlades(fighter)) {
      const hilt = vec.add(point(fighter.x, P[`${weapon.main}Hand`]), vec.scale(weapon.dir, weapon.spec.strikeFrom));
      bound = Math.max(bound, Math.max(from(hilt), from(weapon.tip)) + weapon.spec.radius);
    }
  }
  return bound + REACH_MARGIN;
}

// m: what a defender can be pushed in one substep's contacts, and more.
const REACH_MARGIN = 0.1;

/** The contact key for a defender's blade met by a limb: `blade`, or `offBlade` for the off hand's. */
function bladeKeyOf(defender, weapon) {
  return weapon === defender.offWeapon ? 'offBlade' : 'blade';
}

/** Whether a contact key is with something held before the body (a shield or a blade), not the body. */
function guardKey(key) {
  return key.endsWith(':shield') || key.endsWith(':blade') || key.endsWith(':offBlade');
}

function collideStriker(world, attacker, defender, striker, time) {
  const from = striker.pa;
  const to = striker.pb;
  // Out of reach of all of him, shield and blade too (most pairs in a
  // crowd): nothing to test, only contacts to forget, as below.
  if (defender.reachBound !== undefined) {
    const ends = attacker.x;
    const aAt = striker.a * 3;
    const bAt = striker.b * 3;
    const hipsAt = P.pelvis * 3;
    const gap = gapToSegment(
      defender.x[hipsAt], defender.x[hipsAt + 1], defender.x[hipsAt + 2],
      from ? from[0] : ends[aAt], from ? from[1] : ends[aAt + 1], from ? from[2] : ends[aAt + 2],
      to ? to[0] : ends[bAt], to ? to[1] : ends[bAt + 1], to ? to[2] : ends[bAt + 2],
    );
    if (gap - striker.radius > defender.reachBound) {
      if (attacker.contacts.size) {
        const prefix = `${defender.id}:${striker.key}:`;
        if (defender.shield && defender.state !== 'out') attacker.contacts.delete(`${prefix}shield`);
        const shieldArm = attacker.shield && (striker.key === 'lHand' || striker.key === 'lForearm');
        if (!striker.weapon && !shieldArm && defender.state === 'up') for (const weapon of heldBlades(defender)) attacker.contacts.delete(`${prefix}${bladeKeyOf(defender, weapon)}`);
        for (const key of attacker.contacts) if (key.startsWith(prefix) && !guardKey(key)) attacker.contacts.delete(key);
      }
      return;
    }
  }
  const sa = from ?? point(attacker.x, striker.a);
  const sb = to ?? point(attacker.x, striker.b);
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
  // The stroke this striker is making (a blade's own, with two), if any.
  const stroke = striker.weapon ? strokeOf(attacker, striker.weapon) : attacker.punch?.spec.limb === striker.key ? attacker.punch : null;
  const striking = Boolean(stroke);
  // A shield the strike has met: what lies behind its face is out of reach.
  let shadow = null;
  if (defender.shield && defender.state !== 'out') {
    const disc = shieldDisc(defender);
    const hit = shieldContact(sa, sb, disc, striker.radius + 0.012);
    const shieldKey = `${prefix}shield`;
    if (hit) {
      const away = hit.away;
      if (!attacker.contacts.has(shieldKey)) {
        attacker.contacts.add(shieldKey);
        registerShieldImpact(world, attacker, defender, striker, disc, hit, away);
      } else if (striking && stroke.drove && !stroke.stopped && vec.length(vec.sub(strikerVelocity(attacker, striker, hit.along), point(defender.v, P.lHand))) < WORLD.minImpactSpeed) {
        // A blow that drove on into a shield that gave is spent once it comes to rest on it.
        stroke.landed = true;
        stroke.stopped = true;
        if (stroke.t < stroke.spec.extendUntil) stroke.t = stroke.spec.extendUntil;
      }
      pressOnShield(attacker, defender, striker, hit, away, hit.depth);
      // A shield in the way takes the blow: nothing behind is touched. A blow
      // that glanced off its face goes on, round the rim if it was going there.
      if (!striking || stroke.stopped) return;
      shadow = disc;
    } else if (touching) attacker.contacts.delete(shieldKey);
  }
  // The hand and forearm in a shield's grip are behind it: a blade meets the shield.
  const shieldArm = attacker.shield && (striker.key === 'lHand' || striker.key === 'lForearm');
  if (!striker.weapon && !shieldArm && defender.state === 'up') {
    // A blade in the way (either of two): a fist, shin, elbow or knee that comes on meets its edge.
    for (const weapon of heldBlades(defender)) {
      const hilt = vec.add(point(defender.x, P[`${weapon.main}Hand`]), vec.scale(weapon.dir, weapon.spec.strikeFrom));
      const closest = closestBetween(sa, sb, hilt, weapon.tip);
      const offset = vec.sub(closest.onFirst, closest.onSecond);
      const distance = vec.length(offset);
      const bladeKey = `${prefix}${bladeKeyOf(defender, weapon)}`;
      if (distance < striker.radius + weapon.spec.radius) {
        const away = distance > 1e-6 ? vec.scale(offset, 1 / distance) : yawRotate([-1, 0, 0], defender.yaw);
        if (!attacker.contacts.has(bladeKey)) {
          attacker.contacts.add(bladeKey);
          registerBladeBlock(world, attacker, defender, striker, closest, away, weapon);
        }
        const push = Math.min(striker.radius + weapon.spec.radius - distance, WORLD.contactStep);
        for (const index of new Set([striker.a, striker.b])) for (let axis = 0; axis < 3; axis += 1) attacker.x[index * 3 + axis] += away[axis] * push;
        return;
      }
      if (touching) attacker.contacts.delete(bladeKey);
    }
  }
  // Nowhere near him: no part of his body can be touched (a crowd is mostly
  // this). Forget any contact with him, so the next real one counts.
  const hips = point(defender.x, P.pelvis);
  if (gapToSegment(hips[0], hips[1], hips[2], sa[0], sa[1], sa[2], sb[0], sb[1], sb[2]) > WORLD.bodyReach + striker.radius) {
    if (touching) {
      for (const key of attacker.contacts) if (key.startsWith(prefix) && !guardKey(key)) attacker.contacts.delete(key);
    }
    return;
  }
  // One push out of the body per substep, however many parts it touches
  // (a long weapon can lie across several at once).
  let pushBudget = WORLD.contactStep;
  // The striker as a ball round its middle: a part further than both
  // half-lengths and the reach from it cannot be touched (the closest test skipped).
  const middleX = (sa[0] + sb[0]) / 2;
  const middleY = (sa[1] + sb[1]) / 2;
  const middleZ = (sa[2] + sb[2]) / 2;
  const strikerHalf = vec.length(vec.sub(sb, sa)) / 2;
  for (const capsule of capsules(defender)) {
    // Kicks and weapons hit legs and bodies; gloves only collide above the waist.
    if (!striker.shin && capsule.leg && !striking) continue;
    const reach = capsule.radius + striker.radius;
    // Whether the part is clear is worked in numbers; the vectors are made only for one in reach.
    const pair = segmentPair;
    pair[0] = sa[0];
    pair[1] = sa[1];
    pair[2] = sa[2];
    pair[3] = sb[0];
    pair[4] = sb[1];
    pair[5] = sb[2];
    writeCapsuleEnds(pair, 6, defender, capsule);
    const offsetX = (pair[6] + pair[9]) / 2 - middleX;
    const offsetY = (pair[7] + pair[10]) / 2 - middleY;
    const offsetZ = (pair[8] + pair[11]) / 2 - middleZ;
    const apart = Math.sqrt(offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ);
    const lengthX = pair[9] - pair[6];
    const lengthY = pair[10] - pair[7];
    const lengthZ = pair[11] - pair[8];
    const out = apart - strikerHalf - Math.sqrt(lengthX * lengthX + lengthY * lengthY + lengthZ * lengthZ) / 2 >= reach;
    if ((out ? Infinity : segmentsGap()) >= reach) {
      if (touching) {
        const contactKey = `${prefix}${capsule.key}`;
        attacker.contacts.delete(contactKey);
        attacker.contacts.delete(`${contactKey}:through`);
      }
      continue;
    }
    const [a, b] = capsuleEnds(defender, capsule);
    const closest = closestBetween(sa, sb, a, b);
    closest.t *= capsule.bLength ?? 1;
    const offset = vec.sub(closest.onFirst, closest.onSecond);
    const distance = vec.length(offset);
    // Past a shield's rim the blow finds him; through its face it does not.
    if (shadow && behindShield(closest.onFirst, shadow)) continue;
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
const PUSH_PAIRS = [['trunk', 'trunk'], ['head', 'head'], ['head', 'trunk'], ['trunk', 'head']];
function pushApart(world, first, second) {
  capsules(first);
  capsules(second);
  const firstCapsules = first.capsuleCache.byKey;
  const secondCapsules = second.capsuleCache.byKey;
  for (const [firstKey, secondKey] of PUSH_PAIRS) {
    const one = firstCapsules[firstKey];
    const two = secondCapsules[secondKey];
    // A part cut off no longer meets anything.
    if (!one || !two) continue;
    // Clear of each other is told in numbers; the vectors are made only for parts that touch.
    writeCapsuleEnds(segmentPair, 0, first, one);
    writeCapsuleEnds(segmentPair, 6, second, two);
    const distance = segmentsGap();
    // A head meets another in whatever it wears (a great helm is a can well wider than the head).
    const reach = one.radius * (firstKey === 'head' ? first.body.gear.headBulk ?? 1 : 1) + two.radius * (secondKey === 'head' ? second.body.gear.headBulk ?? 1 : 1);
    if (distance >= reach || distance < 1e-9) continue;
    const [a1, b1] = capsuleEnds(first, one);
    const [a2, b2] = capsuleEnds(second, two);
    const closest = closestBetween(a1, b1, a2, b2);
    const offset = vec.sub(closest.onFirst, closest.onSecond);
    const normal = vec.scale(offset, 1 / distance);
    crashBodies(world, first, second, firstKey, secondKey, normal);
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
  // A shield held in front is what a body running into the man meets first.
  crashIntoShield(world, first, second);
  crashIntoShield(world, second, first);
}

// ---- Crashes: bodies meeting ---------------------------------------------------
//
// Two bodies meeting (a man's trunk or head against another's, a horse's
// barrel, neck or head against a man or another horse) are two effective
// masses at a closing speed, whatever they are (WORLD.crash). Each part brings
// what is braced behind it standing, as a blow's struck part does, and the
// whole of the body as far as the body is going into the contact: a running
// man's weight is behind his shoulder, a galloping horse's and its rider's
// behind its chest. The impulse is the reduced mass times the closing speed
// (and the rebound), the energy taken up half the reduced mass times the speed
// squared; each is hurt as a blow hurts, by the speed change the impulse gives
// its own part (the lighter takes more, the heavier hits harder), through its
// armour. The same exchange between the bodies' whole masses moves them.

/** A body's velocity as a whole (the mean of its particles, weighted by their masses). */
export function wholeVelocity(fighter) {
  const sum = [0, 0, 0];
  let total = 0;
  fighter.body.masses.forEach((kg, index) => {
    for (let axis = 0; axis < 3; axis += 1) sum[axis] += fighter.v[index * 3 + axis] * kg;
    total += kg;
  });
  return vec.scale(sum, 1 / total);
}

/** The impulse (N·s) and the energy (J) a meeting of masses `a` and `b` (kg) at `closing` (m/s) takes up. */
export function crashOf(a, b, closing, restitution = WORLD.crash.restitution) {
  const reduced = (a * b) / (a + b);
  return { reduced, impulse: reduced * closing * (1 + restitution), energy: 0.5 * reduced * closing * closing };
}

/**
 * The mass (kg) a part brings to a crash: `local`, what is braced behind it
 * standing, and as far as the rest of the body goes into the contact (its speed
 * towards it, against the closing speed) up to `whole`. A body lying on the
 * ground (`supported`) has the ground behind every part of it.
 */
export function crashMass(local, whole, intoSpeed, closing, supported = false) {
  const into = supported ? 1 : closing > 1e-6 ? Math.max(0, Math.min(1, intoSpeed / closing)) : 0;
  return local + into * Math.max(0, whole - local);
}

/**
 * Whether a part of a man down is lying on the floor, the ground behind it: his head, or his trunk
 * from hips to shoulders, within `crash.lying` m of resting on it. A man still on his way down (a
 * moment after he was knocked off his feet) has nothing behind him but his own weight.
 */
function lyingOnFloor(fighter, key) {
  if (fighter.state === 'up') return false;
  const indices = key === 'head' ? [P.head] : TRUNK_PARTICLES;
  return indices.every((index) => {
    const [x, y, z] = [fighter.x[index * 3], fighter.x[index * 3 + 1], fighter.x[index * 3 + 2]];
    return y - floorUnder(fighter.arena, z, x, y) < fighter.radius[index] + WORLD.crash.lying;
  });
}

/** What a part (trunk, head, a limb) of a fighter brings to a crash: its standing mass, his whole, his motion. */
export function fighterParty(fighter, key) {
  const kg = fighter.mount ? seatMass(fighter) : fighter.body.massKg;
  return { local: struckMassOf(fighter, { key }), whole: WORLD.balance.massShare * kg, velocity: wholeVelocity(fighter), supported: lyingOnFloor(fighter, key) };
}

/**
 * Two parties (`{ local, whole, velocity, supported }`) meeting at `closing`
 * m/s, `toward` the unit vector from the first to the second: the mass each
 * brings, the impulse and energy of the crash, and the impulse between their
 * whole masses that moves them (`motion`, with `bounce`: two men push each
 * other with the engine's usual knockback, WORLD.transferRestitution).
 */
export function crashBetween(first, second, toward, closing, bounce = WORLD.crash.restitution) {
  const into = (party, direction) => Math.max(0, vec.dot(party.velocity, direction));
  const massFirst = crashMass(first.local, first.whole, into(first, toward), closing, first.supported);
  const massSecond = crashMass(second.local, second.whole, into(second, vec.scale(toward, -1)), closing, second.supported);
  return { massFirst, massSecond, ...crashOf(massFirst, massSecond, closing), motion: crashOf(first.whole, second.whole, closing, bounce).impulse };
}

/**
 * A crash's toll on one fighter's part `key`: the speed change the impulse gives
 * the part, through his armour, as a blow's (the head's brain strain and
 * knockout, the trunk's wind, ribs and trauma, a leg's giving), and a hard blow
 * to the trunk bleeds inside. `source` is the fighter who did it, if any (a
 * horse's rider), `hard` how much worse the other's hard armour makes it.
 * Tissue takes a shove unharmed: the energy of the closing speed beyond
 * `crash.tolerance` is what hurts (the impulse is scaled by the root of it).
 * `braced`: he went into it ready (crashBraced), so it does not take his wind.
 */
export function crashHarm(world, victim, key, { impulse: whole, mass, closing, energy: all, point: at, normal, source = null, hard = 1, braced = false }) {
  const tolerance = WORLD.crash.tolerance;
  if (victim.state === 'out' || closing <= tolerance) return null;
  const beyond = 1 - (tolerance / closing) ** 2;
  const impulse = whole * Math.sqrt(beyond);
  const energy = all * beyond;
  const body = victim.body;
  const firmness = body.segments[key].fleshFirmness;
  const peakForce = ((Math.PI / 2) * impulse) / (WORLD.crash.contactSeconds * (1 + 0.6 * (1 - firmness)));
  const harm = (1 - (protectionAt(body.gear, key).blunt ?? 0)) * hard;
  const event = { time: world.time, kind: 'crash', attacker: source?.id, defender: victim.id, target: key, speed: closing, impulse, energy, force: peakForce, headDeltaV: 0, effects: [], point: at, normal, harm };
  if (source) victim.lastHitBy = source.id;
  // (The head's speed change is the impulse over the mass behind it in this crash, not over its own: a head carried by a charging body is not whipped.)
  const turn = key === 'head' ? (WORLD.crash.rotation * body.headEffectiveMass) / mass : WORLD.crash.rotation;
  bluntConsequences(world, source, victim, { key }, event, { impulse, struckMass: mass, peakForce, harm, blocked: false, rotation: turn, side: 'r', push: true, braced });
  if (key === 'trunk') bleedInside(victim, (impulse / mass) * harm);
  world.events.push(event);
  return event;
}

/** How much worse a crash is for what runs into hard armour (a blunt protection of `blunt`, 0..1): 1 plus `crash.hard` per unit of it. */
export function crashHardness(blunt) {
  return 1 + WORLD.crash.hard * (blunt ?? 0);
}

/** The velocity of a fighter's trunk or head. */
function partVelocity(fighter, key) {
  if (key === 'head') return point(fighter.v, P.head);
  const kg = TRUNK_PARTICLES.reduce((sum, index) => sum + fighter.body.masses[index], 0);
  return vec.scale(TRUNK_PARTICLES.reduce((sum, index) => vec.add(sum, vec.scale(point(fighter.v, index), fighter.body.masses[index])), [0, 0, 0]), 1 / kg);
}

/** How fast a fighter's part (trunk or head) is going into a contact that pushes him along `direction` (m/s; none standing or backing off). */
function speedInto(fighter, part, direction) {
  return Math.max(0, -vec.dot(partVelocity(fighter, part), direction));
}

/**
 * Whether a man meets a crash ready for it: on his feet, going into it himself (his part carries at
 * least half the closing speed towards the other) with the other in front of him (not backing into
 * him). He leads with his shoulder, braced, as a charge does: the crash bruises him by the speed
 * change it gives his part (his whole running weight behind it, crashMass), but it does not knock the
 * wind out of him; the man it runs into, caught standing, takes it on a slack belly.
 */
export function crashBraced(fighter, part, direction, closing, other) {
  if (fighter.state !== 'up' || speedInto(fighter, part, direction) < 0.5 * closing) return false;
  const facing = yawRotate([1, 0, 0], fighter.yaw);
  const from = vec.sub(point(other.x, P.pelvis), point(fighter.x, P.pelvis));
  return facing[0] * from[0] + facing[2] * from[2] > 0;
}

/**
 * Two fighters' parts (trunk or head) meeting, `normal` pointing from the second to the first: the
 * general crash. Both are hurt by it. A man charging (`rush`) leads with his head and shoulders:
 * what they meet a chest with is the body behind them, hurt at that first touch at its speed;
 * the charge lands when the trunks meet (the push, as it has always been), meant as he is to be
 * moving: the part of the impulse that only cancels his own run is braking, not a knock. Two men
 * that only run into each other are hurt, and their trunks hand over momentum as a charge's do (the
 * whole masses' exchange, WORLD.transferRestitution): the lighter is driven back, the heavier slows by
 * his share, and what only checks a man's own run is no knock to him either. A pair is one meeting
 * every `crash.cooldown` s.
 */
function crashBodies(world, first, second, partFirst, partSecond, normal) {
  const spec = WORLD.crash;
  const leads = (fighter) => Boolean(fighter.rush && !fighter.rush.hit);
  const leading = partFirst === 'head' && partSecond === 'trunk' && leads(first) ? first : partSecond === 'head' && partFirst === 'trunk' && leads(second) ? second : null;
  const firstKey = leading === first ? 'trunk' : partFirst;
  const secondKey = leading === second ? 'trunk' : partSecond;
  const bodies = firstKey === 'trunk' && secondKey === 'trunk';
  const charger = leading ?? (bodies ? (leads(first) ? first : leads(second) ? second : null) : null);
  // Normal points from second to first; closing speed is how fast they meet.
  const closing = vec.dot(vec.sub(partVelocity(second, secondKey), partVelocity(first, firstKey)), normal);
  // (A head whips about on its neck: only a head that is really driven into another body is a crash.)
  if (closing < (bodies ? spec.from : spec.fromHead) || (leading && leading.rush.harmed)) return;
  const key = `${Math.min(first.id, second.id)}:${Math.max(first.id, second.id)}:${firstKey}${secondKey}`;
  world.bumps ??= new Map();
  if (!charger && world.time - (world.bumps.get(key) ?? -Infinity) < spec.cooldown) return;
  world.bumps.set(key, world.time);
  const pushing = charger && !leading;
  if (pushing) {
    charger.rush.hit = true;
    charger.rush.t = Math.max(charger.rush.t, charger.rush.duration - 0.15);
  }
  const crash = crashBetween(fighterParty(first, firstKey), fighterParty(second, secondKey), vec.scale(normal, -1), closing, WORLD.transferRestitution);
  const struck = charger === first ? second : first;
  const at = point(struck.x, P.neck);
  if (pushing) {
    const everywhere = (part) => (part === 'head' ? [[P.head, 1]] : TRUNK_PARTICLES.map((index) => [index, 1]));
    const braced = (fighter, part, direction) => (fighter === charger ? Math.max(0, vec.dot(partVelocity(fighter, part), vec.scale(direction, -1))) : 0);
    world.pendingImpulses.push({ fighter: first, shares: everywhere(firstKey), direction: normal, impulse: crash.motion, braced: braced(first, firstKey, normal) });
    world.pendingImpulses.push({ fighter: second, shares: everywhere(secondKey), direction: vec.scale(normal, -1), impulse: crash.motion, braced: braced(second, secondKey, vec.scale(normal, -1)) });
    world.events.push({ time: world.time, kind: 'collision', attacker: charger.id, defender: struck.id, punch: 'rush', target: 'trunk', speed: closing, impulse: crash.impulse, energy: crash.energy, force: 0, headDeltaV: 0, effects: [], point: at, normal });
  } else if (!charger) {
    world.events.push({ time: world.time, kind: 'bump', attacker: first.id, defender: second.id, speed: closing, impulse: crash.impulse, energy: crash.energy, effects: [] });
    if (bodies) {
      const trunk = TRUNK_PARTICLES.map((index) => [index, 1]);
      world.pendingImpulses.push({ fighter: first, shares: trunk, direction: normal, impulse: crash.motion, braced: speedInto(first, 'trunk', normal) });
      world.pendingImpulses.push({ fighter: second, shares: trunk, direction: vec.scale(normal, -1), impulse: crash.motion, braced: speedInto(second, 'trunk', vec.scale(normal, -1)) });
    }
  }
  // Heard: the bodies meeting, on the one run into (the charger's, or of two that ran together, the first).
  if (world.ear) {
    const other = struck === first ? second : first;
    const struckKey = struck === first ? firstKey : secondKey;
    const into = struck === first ? normal : vec.scale(normal, -1);
    soundHit(world, struck, other, struckKey, at, { energy: crash.energy, impulse: crash.impulse, striker: 'body', braced: crashBraced(struck, struckKey, into, closing, other) });
  }
  // The harm at the first touch (a charge that has hurt at its head and shoulders does not hurt again when the trunks meet).
  if (charger?.rush.harmed) return;
  if (charger) charger.rush.harmed = true;
  const harmed = (victim, part, mass, direction, source) => crashHarm(world, victim, part, { impulse: crash.impulse, mass, closing, energy: crash.energy, point: at, normal: direction, source, hard: crashHardness(source.body.gear.protection.blunt), braced: crashBraced(victim, part, direction, closing, source) });
  harmed(first, firstKey, crash.massFirst, normal, second);
  harmed(second, secondKey, crash.massSecond, vec.scale(normal, -1), first);
}

/** What a man's shield brings to a crash: the board, his arm behind it and part of him braced against it. */
export function shieldParty(bearer) {
  const body = bearer.body;
  const braced = bearer.shield.spec.mass + body.segments.lForearm.mass + body.segments.lUpperArm.mass + body.massKg * 0.3;
  return { local: braced, whole: WORLD.balance.massShare * (bearer.mount ? seatMass(bearer) : body.massKg), velocity: wholeVelocity(bearer), supported: false };
}

/**
 * What a crash into a man's shield did to him: the shield arm takes the blow (as a blow on the
 * shield does: blocked harm to the forearm, a share of it through to the chest, the arm giving if
 * the moment is more than it holds, the shield wrenched from his hand if it strains past what its
 * grip bears). `normal` points out from the shield towards what struck it.
 */
export function shieldHarm(world, bearer, { crash, closing, at, normal, offCentre, source }) {
  const body = bearer.body;
  const shield = bearer.shield;
  addDamage(bearer, 'lForearm', (crash.impulse / crash.massSecond) * shield.spec.armHarm, true);
  const event = crashHarm(world, bearer, 'trunk', { impulse: crash.impulse, mass: crash.massSecond, closing, energy: crash.energy, point: at, normal, source, hard: WORLD.blockedDamageShare }) ?? { effects: [] };
  event.effects.push('taken on the shield');
  shieldArmGives(world, bearer, at, vec.scale(normal, -1), crash.impulse, event);
  const hold = WORLD.shield.wrench * (shield.spec.hold ?? 1) * (body.motorForce[P.lHand] / WORLD.recoil.reference);
  shield.strain = (shield.strain ?? 0) + (crash.impulse * (1 + offCentre)) / hold;
  if (shield.strain >= 1) dropShield(world, bearer, 'wrenched', vec.scale(normal, (-crash.impulse * 0.3) / shield.spec.mass));
}

/**
 * A man's trunk against another's shield, which is what a body running into him meets first: if it
 * is running into it (`crash.from`), the board stops it (the two are eased apart, the lighter
 * further) and it is a crash with the shield arm and the man braced behind it (shieldHarm); a
 * charge is driven into the board and spent there. The momentum the bearer takes goes to him
 * through the shield arm.
 */
function crashIntoShield(world, mover, bearer) {
  if (!bearer.shield || bearer.state === 'out') return;
  // Level mode: a man left lying is no one charging a shield (stooping over a body to loot it must not knock the shield off).
  if (world.stage && mover.state === 'out') return;
  const disc = shieldDisc(bearer);
  const hit = shieldContact(point(mover.x, P.pelvis), point(mover.x, P.neck), disc, mover.body.segments.trunk.skinRadius);
  if (!hit) return;
  const away = flatOf(hit.away);
  const closing = vec.dot(vec.sub(wholeVelocity(bearer), partVelocity(mover, 'trunk')), away);
  if (closing < WORLD.crash.from) return;
  // The board stops him: eased apart along the way out, the heavier giving less.
  const m = mover.body.massKg;
  const b = bearer.body.massKg;
  for (const [fighter, sign, share] of [[mover, 1, b / (m + b)], [bearer, -1, m / (m + b)]]) {
    const move = Math.min(hit.depth, 0.05) * share * sign;
    for (let index = 0; index < fighter.x.length / 3; index += 1) {
      for (const axis of [0, 2]) {
        fighter.x[index * 3 + axis] += away[axis] * move;
        fighter.prev[index * 3 + axis] += away[axis] * move;
      }
    }
    fighter.root[0] += away[0] * move;
    fighter.root[1] += away[2] * move;
  }
  const charging = mover.rush && !mover.rush.hit;
  world.bumps ??= new Map();
  const key = `${mover.id}:${bearer.id}:shield`;
  if (!charging && world.time - (world.bumps.get(key) ?? -Infinity) < WORLD.crash.cooldown) return;
  world.bumps.set(key, world.time);
  const crash = crashBetween(fighterParty(mover, 'trunk'), shieldParty(bearer), vec.scale(away, -1), closing, WORLD.transferRestitution);
  if (charging) {
    mover.rush.hit = true;
    mover.rush.t = Math.max(mover.rush.t, mover.rush.duration - 0.15);
    world.pendingImpulses.push({ fighter: mover, shares: TRUNK_PARTICLES.map((index) => [index, 1]), direction: away, impulse: crash.motion, braced: Math.max(0, vec.dot(partVelocity(mover, 'trunk'), vec.scale(away, -1))) });
    world.events.push({ time: world.time, kind: 'collision', attacker: mover.id, defender: bearer.id, punch: 'rush', target: 'shield', speed: closing, impulse: crash.impulse, energy: crash.energy, force: 0, headDeltaV: 0, effects: [], point: hit.point, normal: away });
    world.pendingImpulses.push({ fighter: bearer, shares: [[P.lHand, 1], [P.lElbow, 0.8], [P.lShoulder, 0.5], [P.neck, 0.3], [P.pelvis, 0.2]], direction: vec.scale(away, -1), impulse: crash.motion });
  }
  // Heard: a body against the board.
  if (world.ear) soundHit(world, bearer, mover, 'shield', hit.point, { energy: crash.energy, impulse: crash.impulse, striker: 'body', covering: shieldCovering(bearer.shield), braced: bearer.defence?.name === 'shieldBlock' });
  crashHarm(world, mover, 'trunk', { impulse: crash.impulse, mass: crash.massFirst, closing, energy: crash.energy, point: hit.point, normal: away, source: bearer, braced: crashBraced(mover, 'trunk', away, closing, bearer) });
  shieldHarm(world, bearer, { crash, closing, at: hit.point, normal: away, offCentre: vec.length(vec.sub(hit.point, disc.centre)) / disc.radius, source: mover });
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

/**
 * A blow on a curved helmet (HELMETS `curve`) that is not square to it:
 * the bowl's surface tilts away from it, so it skids, and only part of its
 * closing speed goes in (`share`); and smooth steel lets the sideways part
 * slide where skin would grip, so it twists the head round less (`twist`,
 * on the blow's rotational factor). `square` is the cosine between the
 * blow and the surface normal: a blow square on lands in full. Off the head,
 * or bare-headed, nothing changes.
 */
function helmetGlance(defender, capsule, relative, closing) {
  const curve = surfaceCurve(defender, capsule.key);
  if (!(curve > 0)) return { share: 1, twist: 1 };
  const speed = vec.length(relative);
  const square = speed > 1e-6 ? Math.min(1, Math.max(0, closing / speed)) : 1;
  const off = curve * (1 - square);
  return { share: Math.max(0, 1 - WORLD.helmet.glance * off), twist: Math.max(0, 1 - WORLD.helmet.slide * off) };
}

/** How curved the hard surface a blow meets on this part is: his helmet on the head, a plate breastplate on the trunk. */
export function surfaceCurve(defender, key) {
  const gear = defender.body.gear;
  if (key === 'head') return gear.helmet?.curve ?? 0;
  if (key === 'trunk') return gear.breastplate ?? 0;
  return 0;
}

/** Of a blow along `dir` meeting a surface of this `curve` with outward `normal`, the share that goes in (the rest skids off). */
export function glanceShare(curve, dir, normal) {
  if (!(curve > 0)) return 1;
  const square = Math.min(1, Math.max(0, -vec.dot(dir, normal)));
  return Math.max(0, 1 - WORLD.helmet.glance * curve * (1 - square));
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
  const glance = helmetGlance(defender, capsule, vec.sub(strikeVelocity, struckVelocity), closing);

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
  const strikeMass = (((spec.mass.arm ?? 0) * limbs[`${side}Arm`] + (spec.mass.leg ?? 0) * limbs[`${side}Leg`] + (spec.mass.body ?? 0) * attacker.body.massKg) * technique * (punch.heavy ? WORLD.heavy.massFactor : 1) * (kicking ? attacker.body.gear.kick : 1) + shieldMass) * staggerShare(attacker, WORLD.stagger.harm) * (punch.weak ?? 1);
  const struckMass = struckMassOf(defender, capsule);
  // A collision of two effective masses; flesh and padding make it largely
  // inelastic, so the impulse is the reduced mass times the closing speed.
  const reducedMass = (strikeMass * struckMass) / (strikeMass + struckMass);
  const impulse = reducedMass * closing * glance.share * (1 + WORLD.restitution);
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
  if (glance.share < WORLD.helmet.glancedBelow) event.effects.push('glanced off the helmet');
  // Harm, apart from physics: what the defender wears takes some of it, and
  // a padded glove gives less. The impulse and the knockback are untouched.
  const harm = harmShare(attacker, defender, spec, capsule.key);
  event.harm = harm;
  bluntConsequences(world, attacker, defender, capsule, event, { impulse, struckMass, peakForce, harm, blocked, checked, rotation: spec.rotation * glance.twist, cuts: spec.cuts, cutForce: spec.limb.endsWith('Hand') ? fists.cutForce : Infinity, side, push: spec.push });
  if (!striker.bash) strikerRecoil(attacker, defender, capsule, spec.limb, closing * glance.share, strikeMass, struckMass, event);
  if (spec.limb.endsWith('Hand') && !striker.bash && peakForce > attacker.body.fracture.hand * fists.handFracture * (blocked ? 0.8 : 1) && !attacker.injuries.some((injury) => injury.kind === 'hand' && injury.side === side)) {
    attacker.injuries.push({ kind: 'hand', side, time: world.time });
    event.effects.push(`${attacker.body.inputs.name}: broken hand`);
  }
  // A blow to the arm that holds a weapon jars the grip.
  if (BLOCKING.has(capsule.key)) for (const held of heldBlades(defender)) if (capsule.key.startsWith(held.main)) strainGrip(world, defender, impulse * BLADES.armHitShare, vec.scale(normal, -1), held);
  pushBack(world, attacker, defender, capsule, closest, contactPoint, normal, impulse, harm, blocked, spec, RECOIL[spec.limb.slice(1)].map(([part, share]) => [P[`${side}${part}`], share]), time, event);
  world.events.push(event);
  // Heard: the energy the collision took up (half the reduced mass times the closing speed squared, as a weapon's), on what it met.
  if (world.ear) soundHit(world, defender, attacker, capsule.key, contactPoint, { energy: 0.5 * reducedMass * (closing * glance.share) ** 2, impulse, striker: striker.bash ? 'shield' : limbStriker(spec.limb), deltaV: blocked ? 0 : impulse / struckMass });
}

// The bone a striking part loads: a fist the forearm's, an elbow the upper arm's, a kick the shin's, a knee the thigh's.
const STRIKER_BONE = { Hand: 'Forearm', Elbow: 'UpperArm', Foot: 'Shank', Knee: 'Thigh' };

/**
 * The blow's toll on the limb that throws it. The same impulse stops the
 * striking part as moves the part struck; how hard it is stopped depends on
 * what it meets. Against a man of his own size that is what his limbs are
 * built for and costs nothing; against a much heavier body (a bigger,
 * denser part braced behind it) the limb is stopped harder than that, and
 * the excess (WORLD.strikerRecoil) wears its bone: a light man hammering a
 * giant can break his own hand or shin before he hurts him. Padding on the
 * limb (a glove, a greave) takes some of it; armour struck adds to it.
 */
function strikerRecoil(attacker, defender, capsule, limb, closing, strikeMass, struckMass, event) {
  const spec = WORLD.strikerRecoil;
  const bone = STRIKER_BONE[limb.slice(1)];
  if (!bone) return;
  const stopped = (mass) => (closing * (1 + WORLD.restitution) * mass) / (strikeMass + mass);
  const asOwnSize = struckMass * (attacker.body.massKg / defender.body.massKg);
  const excess = stopped(struckMass) - stopped(asOwnSize);
  if (excess <= 0) return;
  const key = `${limb[0]}${bone}`;
  const padded = limb.endsWith('Hand') && glovedFists(attacker.body.inputs) ? spec.gloved : 1 - (protectionAt(attacker.body.gear, key).blunt ?? 0);
  const hard = 1 + spec.armour * (protectionAt(defender.body.gear, capsule.key).blunt ?? 0);
  const deltaV = excess * spec.share * padded * hard;
  event.strikerDeltaV = deltaV;
  addDamage(attacker, key, deltaV, false);
}

/**
 * What a blunt blow does to the body, apart from the push: damage to the
 * part struck, the head shaken (knockdowns, knockouts), cuts opened, faces
 * and ribs broken, legs worn down; a checked kick hurts the kicker.
 */
function bluntConsequences(world, attacker, defender, capsule, event, { impulse, struckMass, peakForce, harm, blocked, checked = false, rotation, cuts = false, cutForce = Infinity, side, push = false, concentration = 1, braced = false }) {
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
  // (A crash has no attacker to credit when it is a horse with no rider.)
  if (attacker) attacker.stats.landed += 1;
  if (capsule.key === 'head') {
    // Rotational strikes turn the head as well as pushing it, and rotation
    // is what knocks people out (Ommaya; Viano 2005).
    event.headDeltaV = (impulse / body.headEffectiveMass) * rotation;
    // Unseen, unbraced: a blow from well off where he faces finds the neck
    // slack, and the head snaps further — the blindside shot of a brawl.
    if (attacker && blindside(defender, attacker)) {
      event.headDeltaV *= WORLD.blindsideFactor;
      event.effects.push('blindsided');
    }
    // A hard weapon's blow lands over a shorter contact: the same speed change
    // with a sharper peak, which is what strains the brain. A helmet's
    // padding draws any blow out longer (HELMETS `padding`): the peak falls
    // as the square root of the contact time, as `concentration` does.
    const padded = 1 + WORLD.helmet.paddingStretch * (body.gear.helmet?.padding ?? 0);
    event.harmDeltaV = (event.headDeltaV * harm * concentration) / Math.sqrt(padded);
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
      // (Its severity: the force over what breaks the face, half at the threshold.)
      if (world.ear) soundWound(world, defender, 'bone', Math.min(1, (0.5 * peakForce * harm) / body.fracture.face), event.point);
    }
  } else if (capsule.key === 'trunk') {
    // The wind is knocked out of a belly caught slack; a man who went into the crash ready met it on his shoulder, braced (crashBraced).
    if (!braced) takeWind(defender, ((impulse / (body.massKg * 0.6)) / body.aerobic) * harm, push);
    event.effects.push(braced ? 'braced for it' : push ? 'pushed back' : 'body: wind taken');
    if (peakForce * harm > body.fracture.rib && !defender.injuries.some((injury) => injury.kind === 'rib')) {
      defender.injuries.push({ kind: 'rib', time: world.time });
      event.effects.push('rib fracture');
      if (world.ear) soundWound(world, defender, 'bone', Math.min(1, (0.5 * peakForce * harm) / body.fracture.rib), event.point);
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
 * Poise: how much a fighter's armour keeps a blow from moving him (1 for a
 * man in his clothes). Its weight against his own, and how rigidly its shell
 * and padding spread a blow over him (WORLD.poise).
 */
export function poiseOf(fighter) {
  const body = fighter.body;
  const share = body.bodyMassKg > 0 ? (body.gearKg ?? 0) / body.bodyMassKg : 0;
  return 1 + WORLD.poise.mass * share + WORLD.poise.shell * (protectionAt(body.gear, 'trunk').blunt ?? 0) + (body.gear.poise ?? 0);
}

/**
 * Momentum is conserved: the struck part takes the impulse, the striking
 * limb takes it back. Both sides' muscles there are caught off guard for a
 * reflex delay, so the part flies before it is caught. A blow too big for
 * the whole body's mass throws it, and out.
 */
function pushBack(world, attacker, defender, capsule, closest, contactPoint, normal, impulse, harm, blocked, spec, recoil, time, event, share = 1) {
  const body = defender.body;
  const poise = poiseOf(defender);
  const struck = struckParticles(defender, capsule, closest, contactPoint, spec.push);
  // A rigid shell carries a blow on the trunk to the whole trunk: the same momentum, less of a fling where it landed.
  if (poise > 1 && capsule.key === 'trunk') for (const entry of struck) entry[1] += (poise - 1) / poise;
  // A weapon hands over momentum by what meets the body: an edge sinks in, a hard head rebounds.
  const bounce = event.edgeShare === undefined ? WORLD.transferRestitution : WORLD.weaponTransferRestitution.blunt + (WORLD.weaponTransferRestitution.edge - WORLD.weaponTransferRestitution.blunt) * event.edgeShare;
  // An edge or point that went in spent its blow cutting: only the tissue's resistance pushed him.
  const goneIn = event.energy > 0 ? Math.min(1, ((event.cut ?? 0) + (event.pierce ?? 0)) / event.energy) : 0;
  const carriedOn = WORLD.edgeCarriesOn * goneIn * (event.edgeShare ?? 0);
  const transferred = ((impulse * (1 + bounce)) / (1 + WORLD.restitution)) * share * (1 - carriedOn);
  event.transferred = transferred;
  // A heavy blunt blow on armour: he reels. Its blunt peak force is what
  // tells a hammer from a glove (a cut's sharp force is no shove); his poise spreads it.
  if (event.force) stagger(world, defender, (event.force * Math.min(1, event.bluntMix ?? 1) * share) / WORLD.stagger.force / poise, event);
  const bodyDeltaV = transferred / body.massKg / poise;
  if (defender.state === 'up' && bodyDeltaV * harm > WORLD.knockout.bodyDeltaV * BODY.toughness && !blocked) {
    knockOut(world, defender, event, `knocked out (the blow moved his whole body ${bodyDeltaV.toFixed(1)} m/s)`);
  }
  world.pendingImpulses.push({ fighter: defender, shares: struck, direction: vec.scale(normal, -1), impulse: transferred, massShare: WORLD.balance.strikeMassShare * poise });
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
  // The hand that held the off blade gone: the blade with it.
  if (defender.offWeapon?.held && where.side === defender.offWeapon.main && ['wrist', 'elbow', 'shoulder'].includes(where.joint)) dropOffWeapon(world, defender, 'dropped');
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
  // (Heard: the worst cut there is, through the bone.)
  if (world.ear) soundWound(world, defender, 'cut', 1, base);
  knockOut(world, defender, event, `${part.label}: cannot go on`, 'out');
}

/**
 * Until when (the move's time) a weapon's blow can land: a little past its
 * extension; a couched point to the end of the move, held out braced while
 * the run still carries it on.
 */
/**
 * The effective mass a blade strikes with at `distance` along it, moving
 * `relative` to what it meets: the weapon and the arm (and the body, as the
 * move puts it behind the blow) at that point; `along`, how nearly the
 * blow runs along the blade (a thrust). From the saddle the rider's body
 * and, through the saddle, a share of the horse are behind the blow as
 * rigidly as the weapon is coupled to them (mounted.js mountedBehind).
 */
export function bladeStrike(attacker, weapon, punch, relative, distance) {
  const spec = punch.spec;
  const wspec = weapon.spec;
  const limbs = attacker.body.limbKg;
  const arms = limbs[`${weapon.main}Arm`] + (weapon.twoHanded ? limbs[`${weapon.off}Arm`] : 0);
  // (A finisher's thrust is driven down with the whole weight of the kneeling man behind the dagger: finisher.js.)
  const armMass = ((spec.mass.arm ?? 0) * arms + (punch.finisher?.body ?? spec.mass.body ?? 0) * attacker.body.massKg) * attacker.body.technique * (punch.heavy ? WORLD.heavy.massFactor : 1) * staggerShare(attacker, WORLD.stagger.harm) * (punch.weak ?? 1);
  const speed = vec.length(relative);
  const along = speed > 1e-6 ? Math.abs(vec.dot(relative, weapon.dir)) / speed : 0;
  const armLength = attacker.body.lengths.upperArm + attacker.body.lengths.forearmToFist;
  // (Whichever way the blade turns about the grip, what the weapon is coupled to goes with the point.)
  const carried = attacker.mount ? mountedBehind(attacker, spec, relative) * staggerShare(attacker, WORLD.stagger.harm) : 0;
  return { strikeMass: effectiveMassAt(wspec, armMass, distance, armLength, along) + carried, along };
}

export function strikeLiveUntil(spec) {
  return spec.couched ? spec.duration : spec.extendUntil + 0.06;
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
  // The blade that met him, and the stroke it is making (with two blades, each its own).
  const weapon = striker.weapon;
  const punch = strokeOf(attacker, weapon);
  if (!punch) return false;
  const spec = punch.spec;
  if (punch.load > 0 || punch.t < spec.windup || punch.t > strikeLiveUntil(spec)) return false;
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
  // On a curved helmet a blow not square to it skids: less of it goes in, edge and point and weight alike.
  const glance = helmetGlance(defender, capsule, relative, closing);
  // (A finisher's point is driven down with his weight: never slower than `finisher.drive` m/s, however the arm slowed at the floor.)
  const goingIn = Math.max(closing, punch.finisher?.drive ?? 0) * glance.share;

  const body = defender.body;
  const { strikeMass, along } = bladeStrike(attacker, weapon, punch, relative, distance);
  const struckMass = struckMassOf(defender, capsule);
  const reducedMass = (strikeMass * struckMass) / (strikeMass + struckMass);
  const impulse = reducedMass * goingIn * (1 + WORLD.restitution);
  // The energy the collision takes up: what an edge or a point spends going in.
  const energy = 0.5 * reducedMass * goingIn * goingIn;
  const mix = harmMix(wspec, spec.mode, along, closest.s);
  // A dagger driven into a man lying helpless: all point, little blunt (finisher.js).
  if (punch.finisher) {
    mix.pierce *= punch.finisher.pierce;
    mix.blunt *= punch.finisher.blunt;
  }
  // An edge or point turned off true (punch.edgeTilt) bites as much as it is square: the rest lands as the flat.
  // A trained hand draws the edge through the cut and drives the point straight (WORLD.skill.draw: ± at skill 1 and 0).
  const drawn = 1 + WORLD.skill.draw * 2 * ((attacker.body.skill ?? 0.5) - 0.5);
  mix.cut *= drawn;
  mix.pierce *= drawn;
  const trueEdge = Math.cos(punch.edgeTilt ?? 0) ** 2;
  if (trueEdge < 1) {
    const lost = (mix.cut + mix.pierce) * (1 - trueEdge);
    mix.cut *= trueEdge;
    mix.pierce *= trueEdge;
    mix.blunt += lost * WORLD.skill.flatBlunt;
  }
  const covered = protectionAt(body.gear, capsule.key);
  // Into a gap in rigid armour (BLADES.gaps): only what is under it, and no glance.
  const gaps = body.gear.gaps ? { ...BLADES.gaps, ...body.gear.gaps } : BLADES.gaps;
  // (A full plate harness has no gap for an edge: `cutProof`.)
  // A heavy point that wanders (punch.wander, m) is put into a gap the less often: a gap is a hand's breadth (`size`).
  const placed = BLADES.gaps.size / (BLADES.gaps.size + (punch.wander ?? 0));
  // (A finisher is put where the plates part, the visor, the armpit, the throat: `finisher.gap` of the time, at the least.)
  const gapChance = Math.max(spec.mode === 'thrust' ? gaps.thrust : body.gear.cutProof ? 0 : gaps.swing, punch.finisher?.gap ?? 0) * placed;
  const intoGap = (covered.cut ?? 0) >= gaps.rigidFrom && mix.cut + mix.pierce > 0.2 && world.random() < gapChance * attacker.body.technique * (0.5 + (attacker.body.skill ?? 0.5));
  const protection = intoGap ? { ...gaps.under, deflects: false } : covered;
  const firmness = body.segments[capsule.key === 'head' ? 'head' : capsule.key === 'trunk' ? 'trunk' : capsule.key].fleshFirmness;
  const peakForce = ((Math.PI / 2) * impulse) / (wspec.contactSeconds * (1 + 0.6 * (1 - firmness)));
  const contactPoint = vec.add(closest.onSecond, vec.scale(normal, capsule.radius));
  const blocked = BLOCKING.has(capsule.key);
  // A heavy hard head drives part of its blow through armour (`crush`).
  const bluntShare = mix.blunt * (1 - (protection.blunt ?? 0) * (1 - (wspec.crush ?? 0)));
  // A brittle edge (obsidian) cuts only as well as it is still sharp.
  const sharp = weapon.edge ?? 1;
  // A point on plate bites only if it meets it near square (BLADES.bite: the cosine of the steepest
  // slant it holds at); slanting, it skids off the curve of the plate (a rounded breastplate, its
  // ridge) and goes in nowhere: it is a shove.
  const facing = Math.abs(vec.dot(weapon.dir, normal));
  // (A finisher's point is driven square down onto him: it does not skid.)
  const skids = Boolean(protection.deflects) && spec.mode === 'thrust' && mix.pierce > 0 && facing < BLADES.bite && !punch.finisher;
  if (skids) {
    // (The impulse is already only what the point brings square to the plate.)
    mix.cut = 0;
    mix.pierce = 0;
  }
  const cut = energy * mix.cut * (1 - (protection.cut ?? 0)) * sharp;
  const pierce = energy * mix.pierce * (1 - (protection.pierce ?? 0)) * sharp;
  // (An edge always glances off plate; a point that bites square does not.)
  const glanced = Boolean(protection.deflects) && (skids || (mix.cut + mix.pierce > 0.2 && !(spec.mode === 'thrust' && mix.pierce > 0)));
  // Glass on steel or hard armour chips.
  if (wspec.brittle && (protection.cut ?? 0) >= BLADES.chipsOn && mix.cut + mix.pierce > 0.2) chip(world, attacker);
  const event = {
    time: world.time, kind: blocked ? 'blocked' : 'landed', attacker: attacker.id, defender: defender.id, weapon: weapon.kind, mode: spec.mode,
    off: weapon === attacker.offWeapon || undefined, riposte: attacker.punch?.riposte || undefined,
    punch: punch.type, target: capsule.key, speed: closing, impulse, force: peakForce, headDeltaV: 0, effects: [],
    point: contactPoint, normal, harm: bluntShare, cut, pierce, energy, along, at: closest.s, strikeMass, bluntMix: mix.blunt,
    edgeShare: (mix.cut + mix.pierce) / Math.max(1e-6, mix.blunt + mix.cut + mix.pierce),
  };
  // A cut on the helmet takes what is fixed on it (a crest) away, whatever the helmet turns.
  if (capsule.key === 'head') cutOffHeadgear(world, defender, event, energy * mix.cut, contactPoint);
  const concentration = Math.sqrt(WORLD.contactSeconds / wspec.contactSeconds);
  bluntConsequences(world, attacker, defender, capsule, event, { impulse, struckMass, peakForce, harm: bluntShare, blocked, rotation: wspec.rotation * glance.twist, side: weapon.main, concentration });
  if (glanced) {
    // Off the plate: the blade is turned along it.
    const across = vec.sub(relative, vec.scale(normal, vec.dot(relative, normal)));
    if (vec.length(across) > 1e-6) world.pendingImpulses.push({ fighter: attacker, shares: [[main, 1]], direction: vec.normalize(across), impulse: impulse * BLADES.glanceShare });
    event.effects.push('glanced off the plate');
    world.events.push({ time: world.time, kind: 'glance', fighter: defender.id, point: contactPoint, normal });
  }
  if (intoGap) event.effects.push('into a gap in the armour');
  if (glance.share < WORLD.helmet.glancedBelow) event.effects.push('glanced off the helmet');
  // An edge or a point opens a wound: it bleeds. On a limb it breaks the
  // bone only as far as it reaches it (BLADES.bone: by its force, and by how
  // squarely across the limb it came); short of that he bleeds, fast from a
  // deep one, until he collapses, unless it takes the limb off.
  const limb = capsule.key !== 'head' && capsule.key !== 'trunk';
  const square = Math.max(0, 1 - vec.length(vec.sub(closest.onFirst, closest.onSecond)) / capsule.radius);
  const toBone = (joules) => (limb ? boneShare(joules, square) : 1);
  // An edge that cannot bite deep (`cleave`: obsidian flakes in a wooden groove) opens the flesh but takes less of the bone.
  const cleaving = cut * (wspec.cleave ?? 1);
  if (cut > 0.5) {
    wound(defender, 'cut', cut, capsule.key, attacker);
    addDamage(defender, capsule.key, cut / 6, false, toBone(cleaving));
    event.effects.push(cut > 40 ? 'deep cut' : 'cut');
  }
  if (pierce > 0.5) {
    wound(defender, 'pierce', pierce, capsule.key, attacker);
    // A point's harm to the trunk and the head is its wound (it bleeds, and through the heart it drops him, above), not a crushing injury: it counts for less there.
    addDamage(defender, capsule.key, pierce * (limb ? 0.25 : BLADES.pierceTrauma), false, toBone(pierce));
    event.effects.push(pierce > 25 ? 'run through' : 'stabbed');
  }
  let through = false;
  if (defender.state !== 'out') {
    const joint = cut > 0 ? jointAt(defender, capsule, closest.t, contactPoint) : null;
    if (joint && cleaving > severThreshold(defender, joint)) {
      sever(world, defender, joint, event, bladeVelocity);
      through = true;
    } else if (pierce > BLADES.lethalPierce * BODY.toughness && vital(defender, capsule, contactPoint)) {
      if (capsule.key === 'head') knockOut(world, defender, event, 'stabbed through the head', 'killed');
      else {
        // Through the heart or the great vessels: not dead on the spot — he has
        // seconds (BLADES.heartSeconds) before the blood he loses drops him.
        const clot = BLADES.clotSeconds;
        const left = Math.max(0, collapseAt() - (defender.bloodLost ?? 0));
        defender.bleed = (defender.bleed ?? 0) + left / (clot * (1 - Math.exp(-BLADES.heartSeconds / clot)));
        defender.bleedOutside = (defender.bleedOutside ?? 0) + left;
        defender.lastWoundedBy = attacker.id;
        event.effects.push('stabbed through the chest');
      }
    }
  }
  if (BLOCKING.has(capsule.key)) for (const held of heldBlades(defender)) if (capsule.key.startsWith(held.main)) strainGrip(world, defender, impulse * BLADES.armHitShare, vec.scale(normal, -1), held);
  // Jarred by what it hit (least when it cut straight through).
  strainGrip(world, attacker, impulse * (through ? 0.05 : glanced ? 0.3 : 0.15), [0, 0, 0], weapon);
  const recoil = [[main, 1], [P[`${weapon.main}Elbow`], 0.7], [P[`${weapon.main}Shoulder`], 0.35]];
  if (weapon.twoHanded) recoil.push([P[`${weapon.off}Hand`], 0.8]);
  pushBack(world, attacker, defender, capsule, closest, contactPoint, normal, impulse, bluntShare, blocked, spec, recoil, time, event, through ? 0.4 : 1);
  world.events.push(event);
  if (world.ear) {
    soundHit(world, defender, attacker, capsule.key, contactPoint, { energy, impulse, striker: weaponStriker(mix), deltaV: blocked ? 0 : impulse / struckMass });
    // (A cut through at a joint is logged by sever; a point's severity is how near it came to running him through.)
    if (cut > 0.5 && !through) soundWound(world, defender, 'cut', cutSeverity(cut), contactPoint);
    if (pierce > 0.5) soundWound(world, defender, 'stab', Math.min(1, pierce / (BLADES.lethalPierce * BODY.toughness)), contactPoint);
  }
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
function registerBladeBlock(world, attacker, defender, striker, closest, away, weapon = defender.weapon) {
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
    if (attacker.state !== 'out' && cut * (weapon.spec.cleave ?? 1) > severThreshold(attacker, { joint: meets.joint, side })) sever(world, attacker, { joint: meets.joint, side }, event, vec.scale(relative, -1));
  }
  const chain = striker.shin ? [[P[`${side}Foot`], 1], [P[`${side}Knee`], 0.7]] : (RECOIL[striker.key.slice(1)] ?? RECOIL.Hand).map(([part, share]) => [P[`${side}${part}`], share]);
  world.pendingImpulses.push({ fighter: attacker, shares: chain, direction: away, impulse });
  world.pendingImpulses.push({ fighter: defender, shares: [[P[`${weapon.main}Hand`], 1], [P[`${weapon.main}Elbow`], 0.6]], direction: vec.scale(away, -1), impulse });
  strainGrip(world, defender, impulse * 0.3, [0, 0, 0], weapon);
  world.events.push(event);
  // Heard: the limb driven onto the blade (the blade is what strikes it), and the cut it took.
  if (world.ear) {
    soundHit(world, attacker, defender, limbKey, contactPoint, { energy, impulse, striker: 'blade' });
    if (cut > 0.5) soundWound(world, attacker, 'cut', cutSeverity(cut), contactPoint);
  }
}

/**
 * A strike meets a shield: stopped there. The momentum goes into the shield
 * arm and the body braced behind it; the arm takes a little of the harm.
 */
function registerShieldImpact(world, attacker, defender, striker, disc, hit, away) {
  // A blade's own stroke (with two blades, each its own); a limb's, the strike if it is that limb's.
  const punch = striker.weapon ? strokeOf(attacker, striker.weapon) : attacker.punch;
  const weaponStrike = Boolean(striker.weapon && punch);
  if (!punch || punch.landed || (!striker.weapon && punch.spec.path === 'blade') || (!weaponStrike && punch.spec.limb !== striker.key) || (weaponStrike ? punch.t > strikeLiveUntil(punch.spec) : punch.t > punch.spec.extendUntil + 0.06) || (weaponStrike && punch.t < punch.spec.windup)) return;
  // Obsidian on a steel shield chips.
  if (weaponStrike && defender.shield?.spec.look === 'steel') chip(world, attacker);
  const spec = punch.spec;
  let strikeMass;
  const strikeVelocity = strikerVelocity(attacker, striker, hit.along);
  if (striker.weapon) {
    const weapon = striker.weapon;
    const distance = weapon.spec.strikeFrom + hit.along * (weapon.spec.length - weapon.spec.strikeFrom);
    const arms = attacker.body.limbKg[`${weapon.main}Arm`] + (weapon.twoHanded ? attacker.body.limbKg[`${weapon.off}Arm`] : 0);
    const armMass = ((spec.mass.arm ?? 0) * arms + (spec.mass.body ?? 0) * attacker.body.massKg) * attacker.body.technique * (punch.heavy ? WORLD.heavy.massFactor : 1) * staggerShare(attacker, WORLD.stagger.harm) * (punch.weak ?? 1);
    const moving = vec.sub(strikeVelocity, point(defender.v, P.lHand));
    const speed = vec.length(moving);
    const along = speed > 1e-6 ? Math.abs(vec.dot(moving, weapon.dir)) / speed : 0;
    strikeMass = effectiveMassAt(weapon.spec, armMass, distance, attacker.body.lengths.upperArm + attacker.body.lengths.forearmToFist, along);
  } else {
    const side = striker.side;
    strikeMass = (spec.mass.arm ?? 0) * attacker.body.limbKg[`${side}Arm`] + (spec.mass.leg ?? 0) * attacker.body.limbKg[`${side}Leg`] + (spec.mass.body ?? 0) * attacker.body.massKg;
  }
  const relative = vec.sub(strikeVelocity, point(defender.v, P.lHand));
  const closing = -vec.dot(relative, away);
  // Too slow to count, or meeting the face at a slant: it glances along it and goes on.
  if (closing < WORLD.minImpactSpeed || closing < WORLD.shield.glance * vec.length(relative)) return;
  const body = defender.body;
  const braced = defender.shield.spec.mass + body.segments.lForearm.mass + body.segments.lUpperArm.mass + body.massKg * 0.3;
  const reduced = (strikeMass * braced) / (strikeMass + braced);
  const impulse = reduced * closing * (1 + WORLD.restitution);
  addDamage(defender, 'lForearm', (impulse / braced) * defender.shield.spec.armHarm, true);
  attacker.stats.blocked += 1;
  const event = {
    time: world.time, kind: 'blocked', attacker: attacker.id, defender: defender.id, punch: punch.type, target: 'shield', speed: closing, impulse, force: 0, headDeltaV: 0,
    effects: ['taken on the shield'], point: hit.point, normal: away, weapon: striker.weapon ? striker.weapon.kind : undefined,
  };
  world.pendingImpulses.push({ fighter: defender, shares: [[P.lHand, 1], [P.lElbow, 0.8], [P.lShoulder, 0.5], [P.neck, 0.3], [P.pelvis, 0.2]], direction: vec.scale(away, -1), impulse });
  // Held in line, the shield stops the blow and the stroke ends there (no
  // more driving into it; the arm comes back). If the shield arm gives, the
  // blow drives it aside and goes on, thrown back only by what the arm held.
  const gives = shieldArmGives(world, defender, hit.point, vec.scale(away, -1), impulse, event);
  // A couched point met square on the board does not go through it: if the arm gives, the point goes aside with the shield.
  if (gives === 0 || (weaponStrike && spec.couched)) {
    punch.landed = true;
    punch.stopped = true;
    if (punch.t < spec.extendUntil) punch.t = spec.extendUntil;
  } else punch.drove = true;
  // A block that has met its blow is done: the shield is drawn back to the guard, not pressed after the blade.
  if (defender.defence?.name === 'shieldBlock') defender.defence = null;
  const recoil = striker.weapon ? [[P[`${striker.weapon.main}Hand`], 1], [P[`${striker.weapon.main}Elbow`], 0.6]] : (RECOIL[spec.limb.slice(1)] ?? RECOIL.Hand).map(([part, share]) => [P[`${striker.side}${part}`], share]);
  world.pendingImpulses.push({ fighter: attacker, shares: recoil, direction: away, impulse: impulse * (1 - gives) });
  if (striker.weapon) strainGrip(world, attacker, impulse * 0.25, [0, 0, 0], striker.weapon);
  world.events.push(event);
  if (striker.weapon) world.events.push({ time: world.time, kind: 'clash', fighter: defender.id, point: hit.point, normal: away, impulse });
  // Heard: the blow on the shield's face, braced behind it when he meant the block.
  if (world.ear) {
    const strikerKind = striker.weapon ? (spec.mode === 'thrust' && (striker.weapon.spec.harm?.thrust?.pierce ?? 0) > 0 ? 'point' : weaponPart(striker.weapon, Infinity)) : striker.bash ? 'shield' : limbStriker(spec.limb);
    soundHit(world, defender, attacker, 'shield', hit.point, { energy: 0.5 * reduced * closing * closing, impulse, striker: strikerKind, covering: shieldCovering(defender.shield), braced: defender.defence?.name === 'shieldBlock' });
  }
  // Each blow strains the shield's hold on his arm, the more the further
  // from the grip it lands (it twists the shield there); past it, it is torn off.
  const shield = defender.shield;
  const offCentre = vec.length(vec.sub(hit.point, disc.centre)) / disc.radius;
  const hold = WORLD.shield.wrench * (shield.spec.hold ?? 1) * (body.motorForce[P.lHand] / WORLD.recoil.reference);
  shield.strain = (shield.strain ?? 0) + (impulse * (1 + offCentre)) / hold;
  if (shield.strain >= 1) dropShield(world, defender, 'wrenched', vec.scale(away, (-impulse * 0.3) / shield.spec.mass));
}

/** The speed of a striking limb or blade at a point along it (`along`, 0-1 of its striking length). */
function strikerVelocity(attacker, striker, along) {
  if (!striker.weapon) return vec.lerp(point(attacker.v, striker.a), point(attacker.v, striker.b), along);
  const weapon = striker.weapon;
  const distance = weapon.spec.strikeFrom + along * (weapon.spec.length - weapon.spec.strikeFrom);
  return vec.lerp(handVelocityOf(attacker, P[`${weapon.main}Hand`]), weapon.tipVelocity, distance / weapon.spec.length);
}

/**
 * A blow on the shield turns the shield arm about the shoulder. The arm holds
 * the shield in line against up to its force at the hand × its length for the
 * moment the blow takes; past that it gives: the rest of the blow throws the
 * shield arm out of line, and the guard is open until he has it back. The
 * share of the blow the arm could not hold (0 if it held).
 */
export function shieldArmGives(world, defender, at, direction, impulse, event) {
  const body = defender.body;
  const lever = vec.length(vec.cross(vec.sub(at, point(defender.x, P.lShoulder)), direction));
  const moment = impulse * lever;
  // Braced for it (a block he means), the arm holds with its full strength; in his guard, with what he has ready.
  const braced = defender.defence?.name === 'shieldBlock' ? 1 : WORLD.shield.unbraced;
  const held = body.strikeForce[P.lHand] * (body.lengths.upperArm + body.lengths.forearmToFist) * WORLD.shield.holdSeconds * braced * Math.max(0.2, defender.motorScale);
  if (moment <= held) return 0;
  const gives = 1 - held / moment;
  world.pendingImpulses.push({ fighter: defender, shares: [[P.lHand, 1], [P.lElbow, 0.5]], direction, impulse: impulse * gives });
  defender.shieldOpen = world.time + WORLD.shield.open * Math.min(1, 2 * gives);
  event.effects.push('shield knocked aside');
  return gives;
}

/**
 * A strike pressed on a shield is pushed back off its face, a little each
 * substep: shared between the striking limb (a blade turning about the hand
 * that holds it, as far as its inertia lets it), and the shield arm, by
 * their inverse masses. Moved, not flung: the previous positions move too, and
 * any speed into the contact is taken out (the blow's rebound is the impact's
 * impulse), so a blade resting on a shield slides off or lies on it, never
 * held in it. The bodies move at most `contactStep` a substep; the blade's
 * turn (no particle: its spin is corrected, so no speed is made) takes its
 * share of the whole depth at once, up to `turnStep` rad, so a blade that
 * crossed the thin plate within a substep is back at its face, not left in it.
 */
function pressOnShield(attacker, defender, striker, hit, away, depth) {
  if (depth <= 0) return;
  const push = Math.min(depth, WORLD.contactStep);
  const parts = striker.a === striker.b ? [striker.a] : [striker.a, striker.b];
  let own = 0;
  for (const index of parts) own += attacker.invMass[index] / parts.length;
  const weapon = striker.weapon || null;
  let turn = 0;
  let lever = 0;
  let pivot = null;
  if (weapon) {
    const spec = weapon.spec;
    lever = spec.strikeFrom + hit.along * (spec.length - spec.strikeFrom);
    pivot = vec.cross(weapon.dir, away);
    const reach = spec.length + spec.handle;
    const inertia = spec.mass * ((reach * reach) / 12 + spec.balance * spec.balance);
    // Only the part of the push across the blade can turn it.
    turn = ((lever * lever) / inertia) * vec.dot(pivot, pivot);
  }
  const shieldArm = defender.invMass[P.lHand];
  const total = own + turn + shieldArm;
  const shift = (fighter, index, normal, amount) => {
    let into = 0;
    for (let axis = 0; axis < 3; axis += 1) {
      fighter.x[index * 3 + axis] += normal[axis] * amount;
      fighter.prev[index * 3 + axis] += normal[axis] * amount;
      into += normal[axis] * (fighter.x[index * 3 + axis] - fighter.prev[index * 3 + axis]);
    }
    if (into < 0) for (let axis = 0; axis < 3; axis += 1) fighter.prev[index * 3 + axis] += normal[axis] * into;
  };
  for (const index of parts) shift(attacker, index, away, (push * own) / total);
  const back = vec.scale(away, -1);
  shift(defender, P.lHand, back, (push * shieldArm) / total);
  shift(defender, P.lElbow, back, (push * shieldArm) / total / 2);
  if (turn > 0) {
    const across = vec.dot(pivot, pivot);
    const axis = vec.scale(pivot, 1 / Math.sqrt(across));
    weapon.dir = rotateAbout(weapon.dir, axis, Math.min(WORLD.shield.turnStep, (depth * turn) / total / lever));
    // The blade's own turning into the face stops there; along it, it slides on.
    const into = lever * vec.dot(weapon.spin, pivot);
    if (into < 0) weapon.spin = vec.sub(weapon.spin, vec.scale(pivot, into / (lever * across)));
    weapon.tip = vec.add(point(attacker.x, P[`${weapon.main}Hand`]), vec.scale(weapon.dir, weapon.spec.length));
  }
}

/** Every blade of one man against every blade of the other (two blades: up to four pairs). */
function clashBlades(world, first, second) {
  if (!first.weapon?.held && !first.offWeapon?.held) return;
  if (!second.weapon?.held && !second.offWeapon?.held) return;
  for (const a of heldBlades(first)) {
    for (const b of heldBlades(second)) {
      // A blade lost in an earlier clash this substep meets nothing more.
      if (a.held && b.held) clashWeapons(world, first, second, a, b);
    }
  }
}

/**
 * Two weapons meet. They cannot pass through each other; met hard enough,
 * they bang apart, each strike stopped where it was, each grip jarred. A
 * blade that was not striking stopping one that was has parried it (a
 * `parry` event: with the off hand's blade, `off`).
 */
function clashWeapons(world, first, second, a = first.weapon, b = second.weapon) {
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
  const key = `${first.id}${a === first.offWeapon ? 'o' : ''}:${second.id}${b === second.offWeapon ? 'o' : ''}`;
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
  // Each blade's own stroke is stopped where it met the other.
  const strokeA = strokeOf(first, a);
  const strokeB = strokeOf(second, b);
  const cutting = (stroke) => stroke && !stroke.landed && stroke.t >= stroke.spec.windup && stroke.t <= strikeLiveUntil(stroke.spec);
  // A thrust runs along its own shaft, so it hardly closes on a blade held across its line; but
  // the point cannot go through it: it is turned aside along the blade (a bind), the more easily the
  // further out on a long shaft it is met. A blade brought across to meet it (weaponBlock) wards it off.
  const warding = (fighter, stroke, other) => cutting(stroke) && stroke.spec.mode === 'thrust' && !strokeOf(other.fighter, other.blade) && other.fighter.defence?.name === 'weaponBlock';
  const bind = warding(first, strokeA, { fighter: second, blade: b }) || warding(second, strokeB, { fighter: first, blade: a });
  if (world.clashing.has(key) || (closing < BLADES.clashSpeed && !bind)) return;
  world.clashing.add(key);
  const massA = effectiveMassAt(a.spec, first.body.limbKg[`${a.main}Arm`] * 0.6, one.along, first.body.lengths.upperArm + first.body.lengths.forearmToFist);
  const massB = effectiveMassAt(b.spec, second.body.limbKg[`${b.main}Arm`] * 0.6, two.along, second.body.lengths.upperArm + second.body.lengths.forearmToFist);
  const impulse = ((massA * massB) / (massA + massB)) * Math.max(0, closing) * (1 + BLADES.clashRestitution);
  world.pendingImpulses.push({ fighter: first, shares: [[mainA, 1], [P[`${a.main}Elbow`], 0.5]], direction: normal, impulse });
  world.pendingImpulses.push({ fighter: second, shares: [[mainB, 1], [P[`${b.main}Elbow`], 0.5]], direction: vec.scale(normal, -1), impulse });
  const parried = cutting(strokeA) && !strokeB ? [second, b, first, strokeA] : cutting(strokeB) && !strokeA ? [first, a, second, strokeB] : null;
  for (const stroke of [strokeA, strokeB]) {
    if (!stroke) continue;
    stroke.landed = true;
    stroke.stopped = true;
  }
  const met = vec.lerp(closest.onFirst, closest.onSecond, 0.5);
  world.events.push({ time: world.time, kind: 'clash', fighter: first.id, other: second.id, point: met, normal, impulse, effects: ['blades meet'] });
  // Heard: how fast they met, what of each (an edge, a haft, a head), and whether a point was turned along the blade (a scrape).
  if (world.ear) soundEvent(world, 'clash', { at: met, speed: Math.abs(closing), a: weaponPart(a, one.along), b: weaponPart(b, two.along), slide: Boolean(bind) && closing < BLADES.clashSpeed });
  if (parried) {
    const [parrier, blade, striker, stroke] = parried;
    // Parried while his other blade is on its way in: the parry and the cut together.
    const answering = parrier.punch && strokeOf(parrier, blade) === null && parrier.punch.t <= parrier.punch.spec.extendUntil;
    world.events.push({ time: world.time, kind: 'parry', fighter: parrier.id, attacker: striker.id, punch: stroke.type, weapon: blade.kind, off: blade === parrier.offWeapon || undefined, answering: answering || undefined, point: met, effects: [`parried with the ${blade.spec.label.toLowerCase()}`] });
  }
  chipOnSteel();
  strainGrip(world, first, impulse, normal, a);
  strainGrip(world, second, impulse, vec.scale(normal, -1), b);
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
    const ground = floorUnder(world.arena, piece.x[2], piece.x[0], piece.x[1]);
    if (lowest < ground && piece.plate) {
      piece.x[1] += ground - lowest;
      piece.v = [piece.v[0] * spec.slide, Math.abs(piece.v[1]) * spec.restitution * 0.5, piece.v[2] * spec.slide];
      piece.spin = vec.scale(piece.spin, spec.slide);
      // On its rim it falls over onto its face or its back, whichever it leans to.
      const down = axis[1] >= 0 ? [0, 1, 0] : [0, -1, 0];
      piece.q = quatMultiply(quatFromTo(axis, vec.normalize(vec.lerp(axis, down, 0.3))), piece.q);
      if (Math.abs(piece.v[1]) < 0.35 && Math.hypot(piece.v[0], piece.v[2]) < 0.15) {
        piece.q = quatMultiply(quatFromTo(quatRotate(piece.q, piece.axis), down), piece.q);
        piece.x[1] = ground + piece.half;
        piece.resting = true;
      }
    } else if (lowest < ground) {
      piece.x[1] += ground - lowest;
      piece.v = [piece.v[0] * spec.slide, Math.abs(piece.v[1]) * spec.restitution, piece.v[2] * spec.slide];
      piece.spin = vec.scale(piece.spin, spec.slide);
      // On the floor it topples flat.
      piece.q = quatMultiply(quatFromTo(axis, vec.normalize(vec.lerp(axis, flatOf(axis), 0.35))), piece.q);
      if (Math.abs(piece.v[1]) < 0.35 && Math.hypot(piece.v[0], piece.v[2]) < 0.15) {
        piece.q = quatMultiply(quatFromTo(axis, flatOf(axis)), piece.q);
        piece.x[1] = ground + piece.radius;
        piece.resting = true;
      }
    }
    const { halfX, halfZ, drop } = world.arena;
    for (const [index, limit, far] of [[0, halfX + 0.3, halfX + 0.3], [2, halfZ + 0.3, drop ? drop.to : halfZ + 0.3]]) {
      if (piece.x[index] > far || piece.x[index] < -limit) {
        piece.x[index] = piece.x[index] > 0 ? far : -limit;
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
    // In the saddle, the seat couples a share of the horse to him (physics/mounted.js seatMass).
    const resisting = fighter.mount ? seatMass(fighter) : fighter.body.massKg;
    const bodyDeltaV = Math.max(0, (impulse * (trunkShare / weightedMass)) / (resisting * massShare) - braced);
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
  // Short of being dropped, a hard one to the head leaves anyone dazed (and it adds to the strain above, so dazes pile up to a knockdown).
  if (defender.state === 'up' && deltaV > chin * WORLD.daze.from) daze(world, defender, (deltaV / chin - WORLD.daze.from) / (WORLD.knockout.overChin - WORLD.daze.from), event);
}

/**
 * Dazed by a blow to the head: for a few seconds (more the nearer the blow
 * came to dropping him, `share` 0..1) slower to react, weaker, covering up,
 * readier to reel, the head lolling. Everyone, armoured or not.
 */
export function daze(world, fighter, share, event = null) {
  const spec = WORLD.daze;
  const seconds = spec.minSeconds + (spec.maxSeconds - spec.minSeconds) * Math.min(1, Math.max(0, share));
  if (seconds <= (fighter.dazed ?? 0)) return;
  const fresh = !(fighter.dazed > 0);
  fighter.dazed = seconds;
  fighter.dazedFor = seconds;
  if (fresh) world.events.push({ time: world.time, kind: 'dazed', fighter: fighter.id, seconds, effects: [`dazed for ${seconds.toFixed(0)} s`] });
  event?.effects.push('dazed');
}

/** How dazed he still is: 1 at the blow, falling to 0 as it wears off. */
export function dazedShare(fighter) {
  return fighter.dazed > 0 && fighter.dazedFor > 0 ? fighter.dazed / fighter.dazedFor : 0;
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
  // Dazed, a lesser blow sets him reeling.
  severity *= 1 + WORLD.daze.staggerMore * dazedShare(fighter);
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
export function addDamage(fighter, key, deltaV, blocked, toBone = 1) {
  const capacity = (WORLD.damageCapacity[key.replace(/^[lr](?=[A-Z])/, '')] ?? 20) * BODY.toughness;
  const share = (deltaV * (blocked ? WORLD.blockedDamageShare : 1)) / capacity;
  fighter.damage[key] = Math.min(1, (fighter.damage[key] ?? 0) + share);
  fighter.damageVersion += 1;
  // The injury itself, uncapped (in the part's capacities): what breaks a limb or kills.
  // `toBone`: of a cut or a stab in a limb, the share that reaches the bone (the rest only bleeds).
  if (toBone <= 0) return;
  fighter.trauma ??= {};
  fighter.trauma[key] = (fighter.trauma[key] ?? 0) + share * toBone;
}

/** Of a limb wound of `joules` (past the armour), the share that reaches the bone; `square` 0 (a graze) to 1 (across the axis). */
export function boneShare(joules, square) {
  const spec = BLADES.bone;
  const deep = Math.max(0, Math.min(1, (joules - spec.fleshJ) / (spec.fullJ - spec.fleshJ)));
  return deep * (spec.grazeShare + (1 - spec.grazeShare) * square);
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
  // (Heard: the chest or the skull stove in.)
  if ((trauma.trunk ?? 0) >= spec.trunkFatal) {
    if (world.ear) soundWound(world, fighter, 'crush', 1, particleAt(fighter, P.neck));
    return knockOut(world, fighter, credit, 'died of his injuries', 'killed');
  }
  if ((trauma.head ?? 0) >= spec.headFatal) {
    if (world.ear) soundWound(world, fighter, 'crush', 1, particleAt(fighter, P.head));
    return knockOut(world, fighter, credit, 'skull broken', 'killed');
  }
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

/** How hurt the body is, 0 (fresh) to 1 (spent): the worst of the brain's strain, the blood lost and gunshot wounds. */
export function bodyHarm(fighter) {
  return Math.min(1, Math.max(fighter.concussion / concussionCapacity(fighter), (fighter.bloodLost ?? 0) / collapseAt(), fighter.gunshot ?? 0));
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
  if (standing && world.fighters[event.attacker]) world.fighters[event.attacker].stats.knockdownsScored += 1;
  world.events.push({ time: world.time, kind, fighter: defender.id, attacker: event.attacker, punch: event.punch, point: event.point, effects: [reason] });
  // Heard: a man killed, bled out, drowned or cut down past going on dies aloud; one knocked cold goes silent.
  if (world.ear && kind !== 'knockout') soundVoice(world, defender, 'death', 1);
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
  // A man little hurt is up sooner (WORLD.rise.freshDown of the count when fresh).
  const harmed = WORLD.rise.freshDown + (1 - WORLD.rise.freshDown) * bodyHarm(defender);
  defender.downTimer = (WORLD.downSecondsMin + world.random() * WORLD.downSecondsRange) * harmed + defender.knockdowns;
  event.effects.push(reason);
  if (world.fighters[event.attacker]) world.fighters[event.attacker].stats.knockdownsScored += 1;
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
