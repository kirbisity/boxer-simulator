// Getting up off the floor, as a body does it. He waits until he has come to
// rest; draws his limbs in straight beside him (nothing twisted under him);
// rolls onto his front if he lies on his back or side (the way his limbs
// already lie, keeping a broken arm or the hand with his weapon on top);
// pushes up on his hands to hands and knees; brings a foot through beside
// his hands while they still bear him (the stronger leg's: a hurt leg is the
// one he kneels on); comes up onto that foot and the other knee (a man whose
// legs are weak for his weight with his hands pressing on that knee); and
// stands, unsteady for a moment. Each stage is a pose the muscles chase,
// and what lifts him is what touches the floor: the muscles are inside the
// body, so the floor must push the body up through a hand, a knee or a foot
// in contact with it, no harder than that limb can push and only as far as
// it stands under him (supportLimit). A body with nothing under it is not
// lifted.
//
// How long each stage takes is how near his limbs are to their limit in it:
// what they can push now (riseForces: his own muscle, as hurt, tired, broken
// or damaged as it is) over what the stage asks of them (a share of his
// weight with all he wears). A big margin is the stage's own short time; a
// margin near 1 is seconds; under 1 he strains, sinks back and rests before
// another try, and after enough failed tries gives it up (on his hands and
// knees he crawls; flat, he lies, trying again now and then).
// Tuning: WORLD.rise.

import { P, PARTICLES } from '../body.js';
import { bodyHarm, limbShares, point, standingTarget, toWorld } from '../physics.js';
import { clampReach, twoBoneIK, vec } from '../pose.js';
import { turnAbout } from '../joints.js';
import { WORLD } from './config.js';

const COUNT = PARTICLES.length;
const SIDES = [['l', 1], ['r', -1]];
const OTHER = { l: 'r', r: 'l' };
const ease = (u) => u * u * (3 - 2 * u);
const easeRate = (u) => 6 * u * (1 - u);

/**
 * Has he come to rest on the floor (or waited as long as he will)? Call each
 * step while down. Measured by how far the parts really moved since the last
 * step: a part held against a limit keeps a speed it never moves by.
 */
export function restedToRise(fighter, dt) {
  const last = fighter.restAt;
  let fastest = Infinity;
  if (last) {
    fastest = 0;
    for (let index = 0; index < COUNT * 3; index += 3) fastest = Math.max(fastest, Math.hypot(fighter.x[index] - last[index], fighter.x[index + 1] - last[index + 1], fighter.x[index + 2] - last[index + 2]) / dt);
  }
  fighter.restAt = Float64Array.from(fighter.x);
  fighter.restFor = fastest < WORLD.rise.restSpeed ? (fighter.restFor ?? 0) + dt : 0;
  return fighter.restFor >= WORLD.rise.restSeconds || -fighter.downTimer >= WORLD.rise.waitMost;
}

/**
 * What each limb can push with now (N): an arm through its hand (triceps and
 * forearm, `pushShare` of them: the rest holds the arm's own joints), a leg
 * through its foot (hip extensors, quadriceps and calf); each as sound as it
 * is (limbShares: broken, damaged, tired), at `strength` of the whole (hurt
 * by the fall). His weight is all he wears too.
 */
export function riseForces(fighter, strength = 1) {
  const force = fighter.body.muscleForce ?? fighter.body.motorForce;
  const shares = limbShares(fighter);
  const arm = (side) => (force[P[`${side}Hand`]] + force[P[`${side}Elbow`]]) * WORLD.rise.pushShare * shares.arm[side] * strength;
  const leg = (side) => (force[P.pelvis] * 0.5 + force[P[`${side}Knee`]] + force[P[`${side}Foot`]] * 0.5) * shares.leg[side] * strength;
  return { arm: { l: arm('l'), r: arm('r') }, leg: { l: leg('l'), r: leg('r') }, weight: fighter.body.masses.reduce((sum, mass) => sum + mass, 0) * WORLD.gravity };
}

/**
 * What his limbs can do in each lifting stage over what it asks (WORLD.rise.asks, shares of his weight): the push onto
 * his hands (both arms, the legs drawing the knees in), the foot brought through (the arms and the lead leg), the kneel
 * onto that foot and the stand off it (the lead leg and the rear (on its knee, then its toes), and, `braced`, the hands
 * pressing on the knee).
 * `lead` the leg he comes up on. Without `braced`: whether he must brace (the stand without it under `braceBelow`).
 */
export function riseMargins(fighter, strength = 1, lead = strongerLeg(fighter)) {
  const spec = WORLD.rise;
  const { arm, leg, weight } = riseForces(fighter, strength);
  const arms = arm.l + arm.r;
  const legs = leg.l + leg.r;
  const rear = OTHER[lead];
  const stand = (leg[lead] + spec.rearShare * leg[rear]) / (spec.asks.stand * weight);
  const braced = stand < spec.braceBelow;
  const brace = braced ? spec.braceShare * arms : 0;
  return {
    braced, lead,
    push: (arms + spec.legsInPush * legs) / (spec.asks.push * weight),
    step: (arms + spec.rearShare * leg[lead]) / (spec.asks.step * weight),
    kneel: (leg[lead] + spec.rearShare * leg[rear] + brace) / (spec.asks.kneel * weight),
    stand: (leg[lead] + spec.rearShare * leg[rear] + brace) / (spec.asks.stand * weight),
  };
}

/** The leg he comes up on: the stronger (a hurt one is the one he kneels on); the left if they are alike. */
function strongerLeg(fighter) {
  const shares = limbShares(fighter);
  return shares.leg.r > shares.leg.l + 0.05 ? 'r' : 'l';
}

/**
 * How much longer than its own time a stage takes at this margin: none at
 * `easy` and over, more as it nears `low` (WORLD.rise.pace), `slowest` at most.
 */
export function stagePace(margin) {
  const { easy, low, k } = WORLD.rise.pace;
  if (margin >= easy) return 1;
  if (margin <= low) return WORLD.rise.slowest;
  return Math.min(WORLD.rise.slowest, 1 + (k * (easy - margin)) / (margin - low));
}

/**
 * Start getting up: the stages laid out from how he lies. He will rise
 * facing the way his head lies from his hips, his hips where they are.
 * `fromKnees`: he is on his hands and knees already (crawling), and starts
 * by bringing a foot through.
 */
export function beginRise(fighter, { fromKnees = false } = {}) {
  const pelvis = point(fighter.x, P.pelvis);
  const neck = point(fighter.x, P.neck);
  const trunk = vec.sub(neck, pelvis);
  let heading = [trunk[0], 0, trunk[2]];
  if (Math.hypot(heading[0], heading[2]) < 0.3 * vec.length(trunk)) {
    // Sitting up: forward is where his belly faces.
    const left = vec.sub(point(fighter.x, P.lHip), point(fighter.x, P.rHip));
    heading = vec.cross(vec.normalize(trunk), left);
    heading[1] = 0;
  }
  if (Math.hypot(heading[0], heading[2]) < 1e-6) heading = [Math.cos(fighter.yaw), 0, -Math.sin(fighter.yaw)];
  heading = vec.normalize(heading);
  fighter.yaw = Math.atan2(-heading[2], heading[0]);
  // On hands and knees his hips are over his knees, a little behind where
  // he will stand: the stance is set that far ahead of where his hips lie.
  const ahead = WORLD.rise.kneesBack * fighter.body.heightM;
  fighter.root = [pelvis[0] + heading[0] * ahead, pelvis[2] + heading[2] * ahead];
  const from = PARTICLES.map((_, index) => point(fighter.x, index));
  const lead = strongerLeg(fighter);
  fighter.rise = { stage: 'gather', t: 0, elapsed: 0, seconds: WORLD.rise.seconds.gather, from, to: tidyPose(fighter, from), roll: null, lead, braced: false, tries: fighter.riseTries ?? 0 };
  fighter.motorScale = WORLD.rise.strengthFrom;
  fighter.restAt = null;
  if (fromKnees) {
    Object.assign(fighter.rise, { stage: 'step', to: local(fighter, footThrough(fighter, lead)), seconds: WORLD.rise.seconds.step });
    fighter.motorScale = Math.max(fighter.motorScale, 0.8);
  }
}

/** Lying straight: trunk where it lies, arms along its sides, legs straight down from the hips. */
function tidyPose(fighter, at) {
  const L = fighter.body.lengths;
  const out = at.map((position) => [...position]);
  const pelvis = at[P.pelvis];
  const neck = at[P.neck];
  const down = vec.normalize(vec.sub(pelvis, neck));
  for (const [side] of SIDES) {
    const shoulder = at[P[`${side}Shoulder`]];
    const outward = vec.normalize(vec.sub(shoulder, neck));
    const arm = vec.normalize(vec.add(down, vec.scale(outward, 0.25)));
    out[P[`${side}Elbow`]] = vec.add(shoulder, vec.scale(arm, L.upperArm));
    out[P[`${side}Hand`]] = vec.add(out[P[`${side}Elbow`]], vec.scale(arm, L.forearmToFist));
    const hip = at[P[`${side}Hip`]];
    const leg = vec.normalize(vec.add(down, vec.scale(vec.normalize(vec.sub(hip, pelvis)), 0.1)));
    out[P[`${side}Knee`]] = vec.add(hip, vec.scale(leg, L.thigh));
    out[P[`${side}Foot`]] = vec.add(out[P[`${side}Knee`]], vec.scale(leg, L.shank));
  }
  return onFloor(fighter, out);
}

function onFloor(fighter, positions) {
  return positions.map((position, index) => [position[0], Math.max(position[1], fighter.radius[index] + (fighter.lift ?? 0)), position[2]]);
}

/** The trunk's axis (hips to neck), its left (across the hips) and front (the belly's way), as he lies. */
function trunkFrame(at) {
  const axis = vec.normalize(vec.sub(at[P.neck], at[P.pelvis]));
  const across = vec.sub(at[P.lHip], at[P.rHip]);
  const left = vec.normalize(vec.sub(across, vec.scale(axis, vec.dot(across, axis))));
  return { axis, left, front: vec.cross(axis, left) };
}

/**
 * The roll onto his front: the angle about the trunk that turns his chest to
 * the floor (0 if it already faces it). Of the two ways round, the shorter,
 * unless he lies near enough flat on his back that both are alike: then the
 * way that rolls him onto the side his limbs already lie towards (their
 * weight helps him over), away from a broken arm and from the hand that holds
 * his weapon (WORLD.rise.roll).
 */
function rollAngle(fighter, at) {
  const { axis, left, front } = trunkFrame(at);
  const floorward = vec.sub([0, -1, 0], vec.scale(axis, -axis[1]));
  if (vec.length(floorward) < 1e-6) return 0;
  const down = vec.normalize(floorward);
  const angle = Math.atan2(vec.dot(vec.cross(front, down), axis), vec.dot(front, down));
  const spec = WORLD.rise.roll;
  if (Math.abs(angle) < spec.choiceFrom) return angle;
  const other = angle - Math.sign(angle) * 2 * Math.PI;
  // The side that goes down first turning by `turn`: the left if the left hip sinks.
  const sideDown = (turn) => (turnAbout(left, axis, Math.sign(turn) * 0.1)[1] < left[1] ? 'l' : 'r');
  const centre = vec.lerp(at[P.pelvis], at[P.neck], 0.5);
  const masses = fighter.body.masses;
  let limbs = 0;
  let kg = 0;
  for (const name of ['lHand', 'rHand', 'lElbow', 'rElbow', 'lKnee', 'rKnee', 'lFoot', 'rFoot']) {
    limbs += vec.dot(vec.sub(at[P[name]], centre), left) * masses[P[name]];
    kg += masses[P[name]];
  }
  // How far (m) his limbs lie to his left of his trunk.
  const lean = limbs / kg;
  const shares = limbShares(fighter);
  const cost = (turn) => {
    const side = sideDown(turn);
    const held = fighter.weapon?.held && fighter.weapon.main === side ? spec.weapon : 0;
    return Math.abs(turn) / Math.PI + spec.badArm * (1 - shares.arm[side]) + held - spec.limbs * (side === 'l' ? lean : -lean) / fighter.body.heightM;
  };
  return cost(other) < cost(angle) ? other : angle;
}

/** On hands and knees, in his own frame (x the way he will face, z to his left). A broken arm hangs; the other hand goes in under his chest. */
function handsAndKnees(fighter) {
  const L = fighter.body.lengths;
  const H = fighter.body.heightM;
  const r = fighter.radius;
  const out = new Array(COUNT);
  const knees = -WORLD.rise.kneesBack * H;
  const hipHeight = r[P.lKnee] + L.thigh * 0.97;
  const shoulderHeight = r[P.lHand] + (L.upperArm + L.forearmToFist) * 0.95;
  const rise = Math.min(L.trunk * 0.9, shoulderHeight - hipHeight);
  const along = vec.normalize([Math.sqrt(Math.max(0, L.trunk * L.trunk - rise * rise)), rise, 0]);
  const pelvis = [knees, hipHeight, 0];
  const neck = vec.add(pelvis, vec.scale(along, L.trunk));
  out[P.pelvis] = pelvis;
  out[P.neck] = neck;
  out[P.head] = vec.add(neck, vec.scale(vec.normalize(vec.add(along, [0, 0.25, 0])), L.neckToHead));
  const shares = limbShares(fighter);
  const oneArm = shares.arm.l < 0.05 || shares.arm.r < 0.05;
  for (const [side, sign] of SIDES) {
    const z = (sign * L.hipSpan) / 2;
    out[P[`${side}Hip`]] = [knees, hipHeight, z];
    out[P[`${side}Knee`]] = [knees, r[P[`${side}Knee`]], z];
    out[P[`${side}Foot`]] = [knees - L.shank * 0.95, r[P[`${side}Foot`]], z * 1.1];
    const shoulder = vec.add(vec.sub(neck, vec.scale(along, 0.025 * H)), [0, 0, (sign * L.shoulderSpan) / 2]);
    out[P[`${side}Shoulder`]] = shoulder;
    // One arm to push on: its hand in under the middle of his chest, a tripod with the knees.
    const hand = [shoulder[0] + 0.02 * H, r[P[`${side}Hand`]], oneArm ? shoulder[2] * WORLD.rise.oneArmIn : shoulder[2]];
    out[P[`${side}Hand`]] = hand;
    out[P[`${side}Elbow`]] = twoBoneIK(shoulder, hand, L.upperArm, L.forearmToFist, [-0.3, 0, sign]);
  }
  return out;
}

/** Still on his hands and the rear knee, the lead foot brought through and planted under him. */
function footThrough(fighter, lead) {
  const out = handsAndKnees(fighter);
  const L = fighter.body.lengths;
  const H = fighter.body.heightM;
  const sign = lead === 'l' ? 1 : -1;
  const knees = -WORLD.rise.kneesBack * H;
  const foot = [knees + 0.03 * H + L.thigh * 0.85, L.ankle, sign * (L.hipSpan / 2) * 1.3];
  out[P[`${lead}Foot`]] = foot;
  out[P[`${lead}Knee`]] = twoBoneIK(out[P[`${lead}Hip`]], foot, L.thigh, L.shank, [1, 1, sign * 0.3]);
  return out;
}

/**
 * On one knee: the lead foot planted, the rear knee still down, the trunk up
 * over the hips. `braced`: both hands pressing on the lead knee (a man whose
 * legs are weak for his weight); else they come off the floor, forward of
 * his hips, ready.
 */
function kneeling(fighter, lead, braced) {
  const L = fighter.body.lengths;
  const H = fighter.body.heightM;
  const r = fighter.radius;
  const out = new Array(COUNT);
  const rear = OTHER[lead];
  const sign = lead === 'l' ? 1 : -1;
  const knees = -WORLD.rise.kneesBack * H;
  const half = L.hipSpan / 2;
  const hipHeight = r[P[`${rear}Knee`]] + L.thigh * 0.95;
  const pelvis = [knees + 0.03 * H, hipHeight, 0];
  out[P.pelvis] = pelvis;
  out[P[`${rear}Hip`]] = [pelvis[0], hipHeight, -sign * half];
  out[P[`${lead}Hip`]] = [pelvis[0], hipHeight, sign * half];
  out[P[`${rear}Knee`]] = [knees, r[P[`${rear}Knee`]], -sign * half];
  out[P[`${rear}Foot`]] = [knees - L.shank * 0.95, r[P[`${rear}Foot`]], -sign * half];
  const leadFoot = [pelvis[0] + L.thigh * 0.85, L.ankle, sign * half * 1.3];
  out[P[`${lead}Foot`]] = leadFoot;
  out[P[`${lead}Knee`]] = twoBoneIK(out[P[`${lead}Hip`]], leadFoot, L.thigh, L.shank, [1, 1, sign * 0.3]);
  const lean = braced ? WORLD.rise.kneelLean : WORLD.rise.kneelLeanFree;
  const along = [Math.sin(lean), Math.cos(lean), 0];
  const neck = vec.add(pelvis, vec.scale(along, L.trunk));
  out[P.neck] = neck;
  out[P.head] = vec.add(neck, vec.scale(vec.normalize(vec.add(along, [0.1, 0, 0])), L.neckToHead));
  const knee = out[P[`${lead}Knee`]];
  for (const [side, s] of SIDES) {
    const shoulder = vec.add(vec.sub(neck, vec.scale(along, 0.025 * H)), [0, 0, (s * L.shoulderSpan) / 2]);
    out[P[`${side}Shoulder`]] = shoulder;
    const wanted = braced
      ? side === lead ? vec.add(knee, [0, r[P[`${side}Hand`]], 0]) : vec.add(vec.lerp(out[P[`${lead}Hip`]], knee, 0.6), [0, r[P[`${side}Hand`]], 0])
      : vec.add(shoulder, [0.16 * H, -0.24 * H, -s * 0.03 * H]);
    const hand = clampReach(shoulder, wanted, (L.upperArm + L.forearmToFist) * 0.98);
    out[P[`${side}Hand`]] = hand;
    out[P[`${side}Elbow`]] = twoBoneIK(shoulder, hand, L.upperArm, L.forearmToFist, [-0.3, -0.5, s]);
  }
  return out;
}

const local = (fighter, positions) => onFloor(fighter, positions.map((position) => toWorld(fighter, position)));

/** Where his muscles drive a part while he gets up: { target, velocity }. */
export function riseTarget(fighter, index) {
  const rise = fighter.rise;
  if (rise.stage === 'stand') {
    if (index === P[`${OTHER[rise.lead]}Foot`]) drawFootIn(fighter, fighter.feet[OTHER[rise.lead]]);
    const standing = standingTarget(fighter, index);
    // His hands stay pressing on his knee until his legs are nearly straight.
    const u = ARMS.has(index) && rise.braced ? handsOff(fighter) : Math.min(1, rise.t / rise.seconds);
    return { target: vec.lerp(rise.from[index], standing.target, ease(u)), velocity: vec.scale(standing.velocity, ease(u)) };
  }
  const seconds = rise.seconds;
  const u = Math.min(1, rise.t / seconds);
  const from = rise.from[index];
  const to = rise.roll === null ? rise.to[index] : null;
  if (to) return { target: vec.lerp(from, to, ease(u)), velocity: vec.scale(vec.sub(to, from), u < 1 ? easeRate(u) / seconds : 0) };
  // Rolling: the tidy pose turned about the trunk, a share of the way.
  const centre = vec.lerp(rise.from[P.pelvis], rise.from[P.neck], 0.5);
  const axis = vec.normalize(vec.sub(rise.from[P.neck], rise.from[P.pelvis]));
  const angle = rise.roll * ease(u);
  const offset = vec.sub(from, centre);
  const target = vec.add(centre, turnAbout(offset, axis, angle));
  const rate = u < 1 ? (rise.roll * easeRate(u)) / seconds : 0;
  return { target: [target[0], Math.max(target[1], fighter.radius[index] + (fighter.lift ?? 0)), target[2]], velocity: vec.scale(vec.cross(axis, turnAbout(offset, axis, angle)), rate) };
}

const FEET = new Set([P.lFoot, P.rFoot]);
const ARMS = new Set(SIDES.flatMap(([side]) => [P[`${side}Hand`], P[`${side}Elbow`]]));

/**
 * How far his hands have come off his knee standing up: none until the hips
 * are `braceFrom` of the way up, all by `braceTo`; or, past the stand's time,
 * once the hips have stopped coming up for `braceStall` s, over the stand's
 * time again, however high he is (pressing on, they would hold him bent).
 */
function handsOff(fighter) {
  const spec = WORLD.rise;
  const rise = fighter.rise;
  const from = rise.from[P.pelvis][1];
  const to = toWorld(fighter, fighter.desired[P.pelvis])[1];
  const up = (pelvisHeight(fighter) - from) / Math.max(1e-6, to - from);
  const stalled = (rise.t - Math.max(rise.seconds, (rise.gainedAt ?? 0) + spec.braceStall)) / rise.seconds;
  return Math.max(0, Math.min(1, Math.max((up - spec.braceFrom) / (spec.braceTo - spec.braceFrom), stalled)));
}

/**
 * Standing up off one knee, the rear foot (on its toes behind him) slides in
 * as far as it must for the leg to reach it from the rising hip: it stays
 * on the floor, bearing him, rather than hanging from a leg too short for it.
 */
function drawFootIn(fighter, foot) {
  const L = fighter.body.lengths;
  const side = foot.index === P.lFoot ? 'l' : 'r';
  const hip = point(fighter.x, P[`${side}Hip`]);
  const reach = (L.thigh + L.shank) * WORLD.rise.legReach;
  const at = foot.planted;
  const height = hip[1] - (fighter.lift ?? 0) - fighter.desired[foot.index][1];
  const across = Math.hypot(at[0] - hip[0], at[2] - hip[2]);
  if (height >= reach || across < 1e-6) return;
  const most = Math.sqrt(reach * reach - height * height);
  if (across <= most) return;
  const share = most / across;
  foot.planted = [hip[0] + (at[0] - hip[0]) * share, at[1], hip[2] + (at[2] - hip[2]) * share];
}

const pelvisHeight = (fighter) => fighter.x[P.pelvis * 3 + 1];

/**
 * A stage's time: on to the next once its time is up and the hips have come
 * up to where it puts them (or he has strained at it `patience` s more).
 * Returns 'stood' when he is on his feet (on his knees, crawling), 'beaten'
 * when he could not get up.
 */
export function updateRise(fighter, dt) {
  const rise = fighter.rise;
  const spec = WORLD.rise;
  rise.t += dt;
  rise.elapsed += dt;
  // Hurt from the fall as he will be once up (physics.js: recovering), the muscles coming back as he goes.
  const hurt = fighter.hurt > 0 && fighter.hurtFor ? 1 - (1 - WORLD.hurt.hurtStrength) * (fighter.hurt / fighter.hurtFor) : 1;
  // The less hurt, the more of his strength he rises with.
  const fresh = 1 - bodyHarm(fighter);
  fighter.motorScale = Math.min(1, spec.strengthFrom + spec.freshStrength * fresh + rise.elapsed / WORLD.getUpSeconds) * hurt;
  // The strength he has to lift himself with, once his muscles have gathered.
  rise.strength = hurt;
  // Straining near his limit tires him: the nearer, the more (WORLD.rise.effort).
  if (LIFTING.has(rise.stage) && rise.margin) fighter.stamina = Math.max(Math.min(fighter.stamina, 0), fighter.stamina - (spec.effort * dt) / (Math.sqrt(Math.max(0.1, fighter.body.aerobic)) * rise.margin * rise.margin));
  const pace = 1 - spec.freshPace * fresh;
  const seconds = rise.seconds * pace;
  // Still coming up (the hips `gain` higher than they have been this stage), he keeps at it.
  const hips = pelvisHeight(fighter);
  if (rise.best === undefined || hips > rise.best + spec.gain) Object.assign(rise, { best: Math.max(hips, rise.best ?? hips), gainedAt: rise.t });
  if (rise.t < seconds) return null;
  const wanted = rise.stage === 'stand' ? toWorld(fighter, fighter.desired[P.pelvis])[1] : rise.to?.[P.pelvis]?.[1] ?? 0;
  // (On a floor below y 0 (a cave at the sea's edge) the shares are of the height above that floor: a share of a negative height is a higher one, which no man could reach.
  // Floors at or above 0, and the arena's, are as they were.)
  const base = Math.min(0, fighter.lift ?? 0);
  const there = pelvisHeight(fighter) - base >= (wanted - base) * (rise.stage === 'stand' ? spec.stood : spec.reached) || rise.stage === 'gather' || rise.stage === 'roll' || rise.stage === 'step';
  // Short of it, he strains `patience` s past his stage's time and past the
  // last time he gained height (a heavy man coming up slowly is coming up),
  // `strainMost` s at most; on his feet if not quite straight, `patience` s.
  const nearlyUp = rise.stage === 'stand' && hips - base >= (wanted - base) * spec.reached;
  const strained = nearlyUp ? seconds + spec.patience : Math.min(seconds + spec.strainMost, Math.max(seconds, rise.gainedAt) + spec.patience);
  if (!there && rise.t < strained) return null;
  // Long at it and up on his feet, if not quite straight, he is up.
  if (!there) return nearlyUp ? 'stood' : 'beaten';
  const current = rise.roll === null && rise.to ? rise.to : PARTICLES.map((_, index) => riseTarget(fighter, index).target);
  const next = (stage, to, roll = null) => {
    let time = spec.seconds[stage];
    let margin = null;
    if (stage === 'roll') time = spec.seconds.roll * Math.max(0.4, Math.abs(roll) / Math.PI);
    else if (LIFTING.has(stage)) {
      // Slower the nearer his limbs are to their limit in it, as strong as he is now (and slower again with his hands on his
      // knee), and as his armour lets his limbs move (its footwork share: plate's joints fold less far and less freely).
      const margins = riseMargins(fighter, rise.strength, rise.lead);
      margin = margins[stage];
      time *= (stagePace(margin) * (rise.braced && (stage === 'kneel' || stage === 'stand') ? spec.braceSlow : 1)) / (fighter.body.gear.foot ?? 1);
    }
    Object.assign(rise, { stage, t: 0, best: undefined, gainedAt: 0, from: current, to, roll, seconds: time, margin });
  };
  if (rise.stage === 'gather') {
    const angle = rollAngle(fighter, current);
    if (Math.abs(angle) > spec.rollFrom) next('roll', null, angle);
    else next('push', local(fighter, handsAndKnees(fighter)));
  } else if (rise.stage === 'roll') {
    next('push', local(fighter, handsAndKnees(fighter)));
  } else if (rise.stage === 'push') {
    if (fighter.crawling) return 'stood';
    rise.pushed = true;
    next('step', local(fighter, footThrough(fighter, rise.lead)));
  } else if (rise.stage === 'step') {
    rise.pushed = true;
    // Whether his legs alone will stand him up, or his hands must press on his knee: as strong as he is now.
    rise.braced = riseMargins(fighter, rise.strength, rise.lead).braced;
    next('kneel', local(fighter, kneeling(fighter, rise.lead, rise.braced)));
  } else if (rise.stage === 'kneel') {
    next('stand', null);
  } else return 'stood';
  return null;
}

// The stages that lift him: the heavier he is for his strength, the slower.
const LIFTING = new Set(['push', 'step', 'kneel', 'stand']);

/**
 * What his limbs can lift, over what there is to lift: both legs pushing
 * through the feet and both arms through the hands (riseForces, sound and
 * rested), with the strength he has (`scale`), over his weight with all he wears.
 */
export function liftMargin(body, scale = 1) {
  const force = body.muscleForce ?? body.motorForce;
  const weight = body.masses.reduce((sum, mass) => sum + mass, 0) * WORLD.gravity;
  const leg = (side) => force[P.pelvis] * 0.5 + force[P[`${side}Knee`]] + force[P[`${side}Foot`]] * 0.5;
  const arm = (side) => (force[P[`${side}Hand`]] + force[P[`${side}Elbow`]]) * WORLD.rise.pushShare;
  return { legs: (scale * (leg('l') + leg('r'))) / weight, arms: (scale * (arm('l') + arm('r'))) / weight, kg: weight / WORLD.gravity };
}

/**
 * After the stand, how unsteady his first moments on his feet are (physics.js
 * applies it as a sway of the trunk and hips that dies away): more the
 * nearer his legs were to their limit, the more tired, dazed or hurt he is,
 * the fatter and the older (WORLD.rise.wobble). { seconds, size }.
 */
export function standWobble(fighter) {
  const spec = WORLD.rise.wobble;
  const margin = fighter.rise?.margin ?? spec.easyMargin;
  const strain = Math.max(0, Math.min(1, (spec.easyMargin - margin) / (spec.easyMargin - 1)));
  const tired = 1 - Math.max(0, Math.min(1, fighter.stamina));
  const dazed = Math.max(bodyHarm(fighter), Math.min(1, (fighter.dazed ?? 0) / 2));
  const fat = Math.max(0, (fighter.body.inputs.bodyFat ?? 0.15) - 0.18) * 3;
  const old = 1 - (fighter.body.joints ?? 1);
  const shaky = spec.strain * strain + spec.tired * tired + spec.dazed * dazed + spec.fat * fat + spec.old * old;
  return { t: 0, seconds: spec.seconds * (spec.least + shaky), size: spec.size * (spec.least + shaky) };
}

/**
 * The floor lifts him, not his own muscles: their pull upward on the body as
 * a whole is no more than the floor can push back through what touches it.
 * A hand, knee or foot on the floor pushes as hard as its limb can now
 * (riseForces: his own strength, nothing for the weight he carries, nothing
 * through a broken limb), times how nearly its limb stands upright over it;
 * a knee pushes with the hip's share of its leg (`kneeShare`); a hand
 * pressing on the thigh of a leg whose foot is planted pushes down through
 * that leg as it would on the floor; anything else lying on the floor bears
 * its own weight. What the muscles ask beyond that is taken off every part
 * alike, so the pose they hold is kept and the body only sags.
 * `acceleration` holds each particle's (gravity and muscle), and is changed.
 */
export function supportLimit(fighter, acceleration) {
  const spec = WORLD.rise;
  const forces = riseForces(fighter, Math.max(0, fighter.motorScale));
  // (A foot is on the floor while its toes are: the ankle up to `toes` m higher than it stands, its heel lifting as the leg drives.)
  const ankle = fighter.body.lengths.ankle + spec.toes;
  const down = (index) => fighter.x[index * 3 + 1] - (fighter.lift ?? 0) - (FEET.has(index) ? Math.max(ankle, fighter.radius[index] + spec.contact) : fighter.radius[index] + spec.contact) <= 0;
  const pushing = (push, index) => {
    const strength = push.hand ? forces.arm[push.side] : forces.leg[push.side] * (push.standing ? 1 : spec.kneeShare);
    const root = point(fighter.x, push.root);
    const contact = point(fighter.x, index);
    const reach = vec.length(vec.sub(root, contact));
    return strength * (reach > 1e-6 ? Math.max(0, (root[1] - contact[1]) / reach) : 0);
  };
  let asked = 0;
  let mass = 0;
  let support = 0;
  for (let index = 0; index < COUNT; index += 1) {
    const kg = 1 / fighter.invMass[index];
    mass += kg;
    asked += kg * (acceleration[index * 3 + 1] + WORLD.gravity);
    if (!down(index)) {
      if (PUSHES[index]?.hand && bracedOn(fighter, index, down)) support += pushing(PUSHES[index], index);
      continue;
    }
    support += kg * WORLD.gravity + (PUSHES[index] ? pushing(PUSHES[index], index) : 0);
  }
  fighter.riseBudget = { asked, support, weight: mass * WORLD.gravity };
  if (asked <= support) return;
  const sag = (asked - support) / mass;
  for (let index = 0; index < COUNT; index += 1) acceleration[index * 3 + 1] -= sag;
}

/** Is this hand pressing on the thigh of a leg that stands on its foot (knee up)? */
function bracedOn(fighter, hand, down) {
  const at = point(fighter.x, hand);
  return SIDES.some(([side]) => {
    if (!down(P[`${side}Foot`]) || down(P[`${side}Knee`])) return false;
    const hip = point(fighter.x, P[`${side}Hip`]);
    const knee = point(fighter.x, P[`${side}Knee`]);
    const thigh = vec.sub(knee, hip);
    const along = Math.max(0, Math.min(1, vec.dot(vec.sub(at, hip), thigh) / Math.max(1e-9, vec.dot(thigh, thigh))));
    const gap = vec.length(vec.sub(at, vec.add(hip, vec.scale(thigh, along)))) - fighter.radius[hand] - fighter.radius[P[`${side}Knee`]];
    return gap < WORLD.rise.brace;
  });
}

// What pushes through a part on the floor: the joint it pushes from, the limb
// whose force it is (riseForces), and whether it is a hand (an arm's push), or
// a foot under a leg straightening as it stands (all of the leg's force; a
// knee or an elbow, `kneeShare` of it).
const PUSHES = Object.fromEntries(SIDES.flatMap(([side]) => [
  [P[`${side}Hand`], { root: P[`${side}Shoulder`], side, hand: true }],
  [P[`${side}Elbow`], { root: P[`${side}Shoulder`], side, hand: true }],
  [P[`${side}Knee`], { root: P[`${side}Hip`], side }],
  [P[`${side}Foot`], { root: P[`${side}Hip`], side, standing: true }],
]));
