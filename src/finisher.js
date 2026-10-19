// The ground finisher: a man the player has put on the floor, helpless and within reach, can be killed where he lies. The player steps
// in beside him, drops to his knees, drives a dagger into the least armoured place on him (the throat; the armpit or the groin where
// that is the gap), and stands again. It is not an animation that kills: the thrust is an ordinary blade stroke (physics.js
// throwPunch, a thrust at a place) that lands as a real strike, only with his weight behind the point (`FINISHER.profile`), so the
// man dies, or does not, by the simulation: armour turns a point that is not put in a gap, and a wound bleeds.
//
// Mode-independent: it belongs to a fighter the player directs (control.js: the special button offers `finish`, and an attack
// asked for while it is offered executes it), whatever the stage, the battle or the duel. Nothing here reads `world.stage`.
// The state is `fighter.finisher`; `updateFinisher` runs it each step from `directFighter`.

import { P } from './body.js';
import { vec, yawRotate } from './pose.js';
import { BLADES, WEAPONS } from './weapons.js';
import { drawForFinisher, hostile, plantFeet, point, protectionAt, restoreAfterFinisher, throwPunch, WORLD } from './physics.js';

export const FINISHER = {
  // Offered for a man on the floor this near (m, hips to hips).
  reach: 1.6,
  // A man on his feet and awake this near (m) keeps the attack button for himself: it strikes him, not the man on the floor.
  threat: 2.4,
  // Where he kneels: this far (m) from the man's upper chest, on the side he came from.
  standOff: 0.5,
  // How far along his body, as a share of `standOff` (the cosine of the angle off abreast of the place), the kneeling place may lie: towards the head, or back towards the feet.
  headward: 0.9,
  bodyward: -0.15,
  // The steps in (s at most, then he kneels where he is), the drop to his knees, the withdrawal.
  approachMost: 1.5,
  // He runs in from further than this (m); nearer, he steps.
  runFrom: 0.7,
  approachPace: 1,
  arrived: 0.22,
  kneelSeconds: 0.28,
  withdrawSeconds: 0.3,
  // The thrust is given up if the blow is not away within this long (s) of kneeling (the hands busy or too tired).
  thrustWithin: 0.8,
  // The thrust waits for the man to settle (the place moving less than this, m/s), up to this long (s).
  settledBelow: 0.4,
  settleMost: 0.5,
  squared: 0.25,
  // He gives up when the man is further than this (m) from his hips, or has risen.
  lost: 2.6,
  // While he kneels over him the man on the floor is held down (s of his count kept at least): his weight is on him.
  holdDown: 0.5,
  // The blade: his own if it is a dagger or a knife; else his kit's sidearm if it is a short one-handed blade; else a knife from his belt.
  short: 0.65,
  belt: 'knife',
  // What the thrust gains over an ordinary stab: the share of his own body mass behind the point (`body`; a stab is 0.02), the
  // point's harm and the blunt harm it carries as multiples, and how often it finds the gap in plate it is aimed at (`gap`).
  profile: { body: 0.15, pierce: 2, blunt: 0.3, gap: 0.95, drive: 4 },
};

// The places on a man that a point is put to, in order of preference when they are alike. `key` is the part of him struck first,
// `move` the stab that goes there.
const REGIONS = [
  { region: 'throat', key: 'head', move: 'execute' },
  { region: 'armpit', key: 'trunk', move: 'execute' },
  { region: 'groin', key: 'trunk', move: 'execute' },
  // Never chosen (the others are as lightly guarded or more): the blow put to the middle of the breast, where plate is plate, and
  // no gap is sought (a finisher aimed elsewhere than the gap).
  { region: 'breast', key: 'trunk', move: 'execute', gap: false },
];

/**
 * Where on a man lying a region is (a world point), aimed at the middle of the part it is in (the head's centre, the trunk's axis):
 * the point meets the surface of it first, wherever it comes in from. The armpit is the trunk's upper side nearer `from`.
 */
export function regionPoint(target, region, from) {
  const neck = point(target.x, P.neck);
  const pelvis = point(target.x, P.pelvis);
  if (region === 'throat') return vec.lerp(point(target.x, P.head), neck, 0.2);
  if (region === 'groin') return vec.lerp(pelvis, neck, 0.05);
  if (region === 'breast') return vec.lerp(pelvis, neck, 0.6);
  const left = point(target.x, P.lShoulder);
  const right = point(target.x, P.rShoulder);
  const near = vec.length(vec.sub(left, from)) < vec.length(vec.sub(right, from)) ? left : right;
  return vec.lerp(vec.lerp(pelvis, neck, 0.72), near, 0.2);
}

/** What the kit says of a part a point goes to: the share of a thrust it stops, allowing for a gap in rigid armour found `gap` of the time. */
function stops(target, key) {
  const covered = protectionAt(target.body.gear, key);
  const gaps = target.body.gear.gaps ? { ...BLADES.gaps, ...target.body.gear.gaps } : BLADES.gaps;
  const pierce = covered.pierce ?? 0;
  if ((covered.cut ?? 0) < gaps.rigidFrom) return pierce;
  return pierce * (1 - FINISHER.profile.gap) + (gaps.under.pierce ?? 0) * FINISHER.profile.gap;
}

/** The least protected place on him to put a point: { region, key, move }. Alike, the throat first. */
export function leastProtected(target) {
  let best = null;
  let bestStops = Infinity;
  for (const entry of REGIONS) {
    const score = stops(target, entry.key);
    if (score < bestStops - 0.05) {
      best = entry;
      bestStops = score;
    }
  }
  return best;
}

/** The blade the finisher is done with: 'held' if he holds a dagger or knife; else a short sidearm of his kit, else the knife at his belt. */
export function finisherBlade(fighter) {
  const held = fighter.weapon?.held ? fighter.weapon : null;
  if (held && held.spec.hands === 'one' && held.spec.length <= 0.4 && held.spec.harm.thrust) return 'held';
  const side = fighter.body.gear.sidearm;
  const spec = side ? WEAPONS[side] : null;
  if (spec && spec.hands === 'one' && spec.length <= FINISHER.short && spec.harm.thrust && !spec.ranged) return side;
  return FINISHER.belt;
}

/** Whether the fighter is in a state to kneel and strike: on his feet, steady, hands free. */
export function canFinish(fighter) {
  return fighter.state === 'up' && !fighter.crawling && !fighter.netted && !fighter.mount && !fighter.finisher && !fighter.clinch && !fighter.pin
    && !fighter.pickup && !fighter.pain && !fighter.reloading && !(fighter.stagger > 0) && !(fighter.dazed > 0) && !fighter.weapon?.spec.mounted;
}

/** Whether a man is helpless on the floor: down or on his knees and crawling, not yet out, not getting up. */
export function helplessOnFloor(man) {
  if (man.state === 'out' || man.dormant || man.fled || man.mount || man.netted) return false;
  return man.state === 'down' || Boolean(man.crawling && man.state === 'up');
}

/** Whether a man on the floor is within reach of this one: the hips apart on the floor, and on the same level. */
function within(fighter, man, range) {
  const dx = man.x[P.pelvis * 3] - fighter.x[P.pelvis * 3];
  const dz = man.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2];
  return Math.hypot(dx, dz) <= range && Math.abs(man.x[P.pelvis * 3 + 1] - fighter.x[P.pelvis * 3 + 1]) < 1.3;
}

/** An enemy on his feet and awake, near enough that the attack is for him, not for a man on the floor. */
function engaged(world, fighter) {
  return world.fighters.some((other) => other !== fighter && hostile(other, fighter) && other.state === 'up' && !other.crawling && !other.dormant && !other.fled
    && !(other.driven && !(world.stage?.aware?.minds?.[other.id]?.state === 'aggro'))
    && within(fighter, other, FINISHER.threat));
}

/**
 * The man the finisher is offered for, or null: an enemy on the floor within reach (the one he is locked on first, else the
 * nearest), while he can kneel and no enemy on his feet is on him. `anyone`: a man of any side (a team-mate, a civilian) is
 * also a target, if no enemy is (the player's own choice: an explicit call, not the button).
 */
export function finishTarget(world, fighter, { anyone = false, locked = null } = {}) {
  if (!canFinish(fighter) || engaged(world, fighter)) return null;
  const pick = (allowed) => {
    let best = null;
    let bestApart = Infinity;
    for (const man of world.fighters) {
      if (man === fighter || !helplessOnFloor(man) || !allowed(man) || !within(fighter, man, FINISHER.reach)) continue;
      const apart = Math.hypot(man.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], man.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]) - (man.id === locked ? 0.5 : 0);
      if (apart < bestApart) {
        best = man;
        bestApart = apart;
      }
    }
    return best;
  };
  return pick((man) => hostile(man, fighter) || man.id === locked) ?? (anyone ? pick(() => true) : null);
}

/**
 * Where he kneels: `standOff` m from the place he strikes, on the side he is on, kept off the man's body: abreast of the place, or
 * past it towards the man's head, never down along his body (the knees would be on him).
 */
function kneelingPlace(fighter, target, aim) {
  const spine = vec.sub(point(target.x, P.neck), point(target.x, P.pelvis));
  const flat = Math.hypot(spine[0], spine[2]);
  const along = flat > 0.15 ? [spine[0] / flat, spine[2] / flat] : [Math.cos(target.yaw), -Math.sin(target.yaw)];
  const across = [-along[1], along[0]];
  const hips = point(fighter.x, P.pelvis);
  const toward = [hips[0] - aim[0], hips[2] - aim[2]];
  const length = Math.hypot(toward[0], toward[1]) || 1;
  const headward = Math.max(FINISHER.bodyward, Math.min(FINISHER.headward, (toward[0] * along[0] + toward[1] * along[1]) / length));
  const side = toward[0] * across[0] + toward[1] * across[1] >= 0 ? 1 : -1;
  const sideward = Math.sqrt(1 - headward * headward) * side;
  return [aim[0] + (along[0] * headward + across[0] * sideward) * FINISHER.standOff, aim[1], aim[2] + (along[1] * headward + across[1] * sideward) * FINISHER.standOff];
}

/** Say what happened to the finisher in the log: 'finisher' on starting, 'finisherAborted' on giving up. */
function logFinisher(world, fighter, kind, target, effects) {
  world.events.push({ time: world.time, kind, attacker: fighter.id, defender: target.id, effects });
}

/**
 * Begin the finisher on `target`: the dagger drawn, the steps in. `region` (a REGIONS name) overrides the place chosen. False if he
 * cannot (not on his feet, hands busy, the man not on the floor or too far, no blade to hold).
 */
export function startFinisher(world, fighter, target, { region = null, force = false } = {}) {
  if (!canFinish(fighter) || !target || target === fighter || !helplessOnFloor(target) || !within(fighter, target, FINISHER.reach * (force ? 2 : 1))) return false;
  const entry = (region && REGIONS.find((item) => item.region === region)) || leastProtected(target);
  const kind = finisherBlade(fighter);
  let keep = null;
  if (kind !== 'held') {
    keep = drawForFinisher(world, fighter, kind);
    if (!keep) return false;
  }
  fighter.punch = null;
  fighter.rush = null;
  fighter.defence = null;
  fighter.finisher = { target: target.id, entry, keep, phase: 'approach', t: 0, started: world.time, kneeling: 0, thrustAt: null };
  logFinisher(world, fighter, 'finisher', target, [`draws the ${fighter.weapon.spec.label.toLowerCase()} to finish him`]);
  return true;
}

/** Whether a blow has landed on him since `time`. */
function struckSince(world, fighter, time) {
  for (let index = world.events.length - 1; index >= 0; index -= 1) {
    const event = world.events[index];
    if (event.time < time) break;
    if (event.kind === 'landed' && event.defender === fighter.id) return true;
  }
  return false;
}

/** Let go of the finisher: the blade put by taken up again, the kneel over, the feet under him. */
function endFinisher(world, fighter, outcome, target) {
  const state = fighter.finisher;
  fighter.finisher = null;
  fighter.goTo = null;
  fighter.running = false;
  fighter.move = 0;
  if (state.keep) restoreAfterFinisher(fighter, state.keep);
  if (fighter.state === 'up') plantFeet(fighter);
  if (outcome !== 'done') logFinisher(world, fighter, 'finisherAborted', target, [outcome]);
}

/** Why the finisher must stop before the blow is away, or null. */
function brokenOff(world, fighter, state, target) {
  if (fighter.state !== 'up' || fighter.netted || fighter.mount) return 'brought down';
  if (fighter.stagger > 0 || fighter.dazed > 0 || fighter.pain || struckSince(world, fighter, state.started)) return 'struck while he knelt';
  if (state.phase === 'approach' || state.phase === 'kneel' || (state.phase === 'thrust' && !state.thrustAt)) {
    if (!helplessOnFloor(target)) return target.state === 'out' ? 'the man is dead' : 'the man is up';
    if (!within(fighter, target, FINISHER.lost)) return 'the man is gone';
  }
  return null;
}

/**
 * Each step while he finishes a man: the steps in, the drop to his knees, the thrust (a real stroke, with his weight behind it),
 * the withdrawal. True while it holds him (control.js then leaves his feet and hands to it); false once it is over or given up
 * (struck, brought down, the man dead or up, the thrust not away in time), and then he is the player's again.
 */
export function updateFinisher(world, fighter, dt) {
  const state = fighter.finisher;
  if (!state) return false;
  const target = world.fighters[state.target];
  state.t += dt;
  const broken = brokenOff(world, fighter, state, target);
  if (broken) {
    endFinisher(world, fighter, broken, target);
    return false;
  }
  const hips = point(fighter.x, P.pelvis);
  const aim = regionPoint(target, state.entry.region, hips);
  // How fast the place moves (a man still settling on the floor is not struck at yet).
  const drift = state.lastAim ? Math.hypot(aim[0] - state.lastAim[0], aim[1] - state.lastAim[1], aim[2] - state.lastAim[2]) / dt : 0;
  state.lastAim = aim;
  if (state.phase === 'approach') {
    const place = kneelingPlace(fighter, target, aim);
    const apart = Math.hypot(place[0] - hips[0], place[2] - hips[2]);
    if (apart <= FINISHER.arrived || state.t > FINISHER.approachMost) {
      state.phase = 'kneel';
      state.t = 0;
    } else {
      // He steps in facing the place he will strike, forwards and sideways as it lies.
      const pace = Math.min(FINISHER.approachPace, 0.35 + apart);
      const way = [(place[0] - hips[0]) / apart, (place[2] - hips[2]) / apart];
      const ahead = yawRotate([1, 0, 0], fighter.yaw);
      const left = yawRotate([0, 0, 1], fighter.yaw);
      fighter.goTo = place;
      fighter.running = apart > FINISHER.runFrom;
      fighter.faceAt = { at: aim, until: world.time + 0.25 };
      fighter.move = pace * (way[0] * ahead[0] + way[1] * ahead[2]);
      fighter.strafe = Math.max(-1, Math.min(1, (pace * (way[0] * left[0] + way[1] * left[2])) / WORLD.sidestepShare));
      return true;
    }
  }
  fighter.goTo = null;
  fighter.running = false;
  fighter.move = 0;
  fighter.strafe = 0;
  fighter.faceAt = { at: aim, until: world.time + 0.25 };
  fighter.rootVelocity[0] *= 0.5;
  fighter.rootVelocity[1] *= 0.5;
  if (state.phase === 'kneel') {
    state.kneeling = Math.min(1, state.kneeling + dt / FINISHER.kneelSeconds);
    pinWeightOn(target);
    if (state.kneeling < 1) return true;
    state.phase = 'thrust';
    state.t = 0;
  }
  if (state.phase === 'thrust') {
    pinWeightOn(target);
    if (fighter.punch && fighter.punch === state.punch) fighter.punch.at = aim;
    if (!fighter.punch && !state.thrustAt && ((drift < FINISHER.settledBelow && turned(fighter, aim) < FINISHER.squared) || state.t > FINISHER.settleMost)) {
      if (throwPunch(world, fighter, state.entry.move, state.entry.region === 'throat' ? 'head' : 'body', { at: aim })) {
        fighter.punch.finisher = state.entry.gap === false ? { ...FINISHER.profile, gap: 0 } : FINISHER.profile;
        state.thrustAt = world.time;
        state.punch = fighter.punch;
      } else if (state.t > FINISHER.thrustWithin) {
        endFinisher(world, fighter, 'the blow would not go', target);
        return false;
      }
    } else if (state.thrustAt && fighter.punch !== state.punch) {
      state.phase = 'withdraw';
      state.t = 0;
    }
    return true;
  }
  // The withdrawal: up off his knees, the blade away.
  state.kneeling = Math.max(0, state.kneeling - dt / FINISHER.withdrawSeconds);
  if (state.kneeling > 0) return true;
  endFinisher(world, fighter, 'done', target);
  return false;
}

/** How far (rad) he is turned from facing a place. */
function turned(fighter, at) {
  const hips = point(fighter.x, P.pelvis);
  const wanted = Math.atan2(-(at[2] - hips[2]), at[0] - hips[0]);
  return Math.abs(Math.atan2(Math.sin(wanted - fighter.yaw), Math.cos(wanted - fighter.yaw)));
}

/** His weight on the man on the floor: he does not get up while the dagger is going in. */
function pinWeightOn(target) {
  if (target.state === 'down') target.downTimer = Math.max(target.downTimer, FINISHER.holdDown);
}
