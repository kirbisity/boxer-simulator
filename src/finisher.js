// The ground finisher: a man the player has put on the floor, helpless and within reach, can be killed where he lies. The player steps
// in beside him, drops to his knees, drives a dagger into the least armoured place on him that he can get at (the throat, the face or
// the sights of his helm, the armpit, the groin: the gap in his armour, where it is not under his own arm or leg lying across it, or
// his shield; planFinisher), and stands again. It is not an animation that kills: the thrust is an ordinary blade stroke (physics.js
// throwPunch, a thrust at a place) that lands as a real strike, only with his weight behind the point (`FINISHER.profile`), so the
// man dies, or does not, by the simulation: armour turns a point that is not put in a gap, and a wound bleeds.
//
// Mode-independent: it belongs to a fighter the player directs (control.js: the special button offers `finish`, and an attack
// asked for while it is offered executes it), whatever the stage, the battle or the duel. Nothing here reads `world.stage`.
// The state is `fighter.finisher`; `updateFinisher` runs it each step from `directFighter`.

import { P } from './body.js';
import { vec, yawRotate } from './pose.js';
import { WEAPONS } from './weapons.js';
import { gapsOf, gapUnder, gapZoneAt } from './physics/gaps.js';
import { capsuleEnds, capsules, drawForFinisher, hostile, plantFeet, point, protectionAt, restoreAfterFinisher, shieldDisc, throwPunch, WORLD } from './physics.js';

export const FINISHER = {
  // Offered for a man on the floor this near (m, hips to hips). The attack tapped takes a man this much further off
  // (`tapReach`): the steps in are the finisher's own (`approachMost`, run from `runFrom`), as a running strike closes.
  reach: 1.6,
  tapReach: 3.2,
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
  // blunt harm it carries as a multiple (a dagger driven in: all point), and how often it finds the gap in plate it is aimed
  // at (`gap`). And the point is leaned on all the way in (physics.js finisherPress): bowed over him, `lean` of his weight on
  // the hilt (his trunk, head and arms over his hands, ~0.6 of him, more than half of it borne by them) and his arm's push,
  // over `depth` m (a dagger's length into the throat, the armpit or the groin, to the vessels or the brain): ~550 N over
  // 0.12 m, ~65 J more than the blow brings, and more again for a heavier man or one in armour. (It was the blow's point
  // harm doubled: a rule, and through the mail under a gap in plate it still often left him alive.)
  profile: { body: 0.15, lean: 0.35, depth: 0.12, blunt: 0.3, gap: 0.95, drive: 4 },
  // Looking for the gap (planFinisher): the point goes in along the line from where his hand is as the thrust starts to the place,
  // and he puts it where that line meets the man's head or body, not his own arm or leg lying across it, nor his shield, and where
  // what it meets there stops a point least (the gap it finds, physics/gaps.js, as the blow itself will). The hand (`hand`, m;
  // measured as the blade turns down onto the line at the end of the windup: `over` in from his hips towards the place, `right`
  // to the right of that, `rise` above the place) is reckoned from each place he could kneel on his own side of the man (not
  // across him: a man stepping over a body on the floor trips on it), as he comes, abreast of the place or round towards the
  // head; kneeling, he looks again from where he is, until the blade turns down. `clear`: the room the line keeps from a limb
  // (m, past its skin: the blade's half-breadth and the knuckles', and a lying man's legs shift a few cm as the knee goes on
  // him; at 1.5 cm a leg sliding in still took the point 1 in 10 in mail); `alike`: places whose armour
  // stops the point within this much of each other count as alike (then the one he is already putting it to, the place as he
  // comes, the order of REGIONS);
  // `walk`: what a metre further to go counts against a place, as protection.
  hand: { over: 0.38, right: 0.1, rise: 0.6 },
  clear: 0.05,
  // How far (m) the hand may be off where it is reckoned, the lines from round it taken with the line from it (lineIn).
  spread: 0.06,
  alike: 0.05,
  walk: 0.02,
  // Where he may kneel to look: as the steps bring him (`null`, kneelingPlace's), abreast of the place, or round towards the head.
  kneelAlong: [null, 0, 0.6],
  // Kneeling, with a gap to be had only from a little round him, the steps he takes there (s at most).
  shiftSeconds: 0.6,
};

// The places on a man that a point is put to, in order of preference when they are alike. `key` is the part of him struck first,
// `move` the stab that goes there.
const REGIONS = [
  { region: 'throat', key: 'head', move: 'execute', zone: 'neck' },
  // The face: an open helmet's face, a closed helm's sights (a rondel's point put through the slit; the zone by the helm, `sights`).
  { region: 'face', key: 'head', move: 'execute', zone: 'sights' },
  { region: 'armpit', key: 'trunk', move: 'execute', zone: 'armpit' },
  // The middle of the breast, over the heart: where plate is plate, never chosen in it; in mail or cloth as good as the armpit
  // (it is the heart), and before the groin, which bleeds but does not kill at once (physics.js vital). Put there when asked,
  // no gap is sought (`gap` false: a finisher aimed elsewhere than the gap).
  { region: 'breast', key: 'trunk', move: 'execute', gap: false },
  { region: 'groin', key: 'trunk', move: 'execute', zone: 'groin' },
];

/**
 * Where on a man lying a region is (a world point), aimed at the middle of the part it is in (the head's centre, the trunk's axis):
 * the point meets the surface of it first, wherever it comes in from. The armpit is the trunk's upper side nearer `from`.
 */
export function regionPoint(target, region, from, shoulder = null) {
  const neck = point(target.x, P.neck);
  const pelvis = point(target.x, P.pelvis);
  if (region === 'throat') return vec.lerp(point(target.x, P.head), neck, 0.2);
  // (The face: the head's centre, the point coming in at the face if the line to it does, physics/gaps.js says which.)
  if (region === 'face') return point(target.x, P.head);
  if (region === 'groin') return vec.lerp(pelvis, neck, 0.05);
  if (region === 'breast') return vec.lerp(pelvis, neck, 0.6);
  const left = point(target.x, P.lShoulder);
  const right = point(target.x, P.rShoulder);
  // (The armpit he chose, `shoulder` 'l' or 'r'; else the one nearer `from`.)
  const near = shoulder ? (shoulder === 'l' ? left : right) : vec.length(vec.sub(left, from)) < vec.length(vec.sub(right, from)) ? left : right;
  return vec.lerp(vec.lerp(pelvis, neck, 0.72), near, 0.2);
}

/**
 * What the kit says of a place a point goes to: the share of a thrust it stops, allowing for the gap in rigid armour there
 * (physics/gaps.js: its `zone`, if the kit has it) found `gap` of the time, and what is under it (a mail voider, the doublet).
 */
function stops(target, entry) {
  const gear = target.body.gear;
  // (The face's gap is the helm's: its sights if closed, the face if open; a sealed one has none.)
  const zone = entry.zone === 'sights' ? { closed: 'visor', open: 'face' }[gear.helmFace ?? 'open'] ?? null : entry.zone;
  return stopsIn(gear, entry.key, zone);
}

/** The share of a thrust the kit stops on part `key`, put into the gap `zone` there (or null: none) `FINISHER.profile.gap` of the time. */
function stopsIn(gear, key, zone) {
  const covered = protectionAt(gear, key);
  const gaps = gapsOf(gear);
  const pierce = covered.pierce ?? 0;
  if ((covered.cut ?? 0) < gaps.rigidFrom || !zone || gaps.closed?.includes(zone)) return pierce;
  return pierce * (1 - FINISHER.profile.gap) + (gapUnder(gear, zone, covered).pierce ?? 0) * FINISHER.profile.gap;
}

/**
 * What the line from `from` to `to` meets first on the man (a world point each): { key, point, normal } of the part of him (or
 * 'shield'), or null if nothing. Walked in centimetres: the first place it comes within a part's skin and `FINISHER.clear`.
 */
export function firstMet(target, from, to) {
  const length = vec.length(vec.sub(to, from));
  const parts = capsules(target).map((capsule) => ({ key: capsule.key, ends: capsuleEnds(target, capsule), radius: capsule.radius + FINISHER.clear }));
  // His shield, if he still has it on his arm: where the line crosses its disc, if it does.
  let shieldAt = Infinity;
  if (target.shield) {
    const disc = shieldDisc(target);
    const way = vec.sub(to, from);
    const across = vec.dot(way, disc.normal);
    if (Math.abs(across) > 1e-9) {
      const t = vec.dot(vec.sub(disc.centre, from), disc.normal) / across;
      if (t >= 0 && t <= 1 && vec.length(vec.sub(vec.add(from, vec.scale(way, t)), disc.centre)) <= disc.radius) shieldAt = t;
    }
  }
  const steps = Math.max(1, Math.ceil(length / 0.01));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    if (t >= shieldAt) return { key: 'shield', point: vec.lerp(from, to, shieldAt), normal: null };
    const at = vec.lerp(from, to, t);
    for (const part of parts) {
      const [a, b] = part.ends;
      const ab = vec.sub(b, a);
      const span = vec.dot(ab, ab);
      const along = span < 1e-12 ? 0 : Math.max(0, Math.min(1, vec.dot(vec.sub(at, a), ab) / span));
      const off = vec.sub(at, vec.lerp(a, b, along));
      if (vec.length(off) <= part.radius) return { key: part.key, point: at, normal: vec.normalize(off) };
    }
  }
  return null;
}

/** Where his hand is as the thrust starts (FINISHER.hand), kneeling at `place` to put the point to `aim`. */
function handFrom(place, aim) {
  const toward = [aim[0] - place[0], aim[2] - place[2]];
  const apart = Math.hypot(toward[0], toward[1]) || 1;
  const over = Math.min(FINISHER.hand.over, apart);
  const [x, z] = [toward[0] / apart, toward[1] / apart];
  // (His right of the way he faces, x forward and z to his left: [z, -x].)
  return [place[0] + x * over + z * FINISHER.hand.right, aim[1] + FINISHER.hand.rise, place[2] + z * over - x * FINISHER.hand.right];
}

/**
 * How a point put to `aim` from the hand at `hand` goes in: null if the line meets his arm, his leg or his shield first (or nothing);
 * else what stops it there (`stops`: the share of a thrust, the gap it meets taken `FINISHER.profile.gap` of the time), the gap
 * and the part. The hand is not where it is reckoned to the centimetre (FINISHER.hand; `spread`): the lines from round it are
 * taken too, and the place is as good as the clear ones are on the whole (the one from the hand itself must be clear; a gap found
 * only on the line from where the hand is reckoned is found the less).
 */
function lineIn(target, hand, aim, gaps = true) {
  const centre = lineFrom(target, hand, aim, gaps);
  if (!centre) return null;
  const spread = FINISHER.spread;
  const others = [[spread, 0, 0], [-spread, 0, 0], [0, 0, spread], [0, 0, -spread]].map((offset) => lineFrom(target, vec.add(hand, offset), aim, gaps));
  const clear = [centre, ...others.filter(Boolean)];
  return { ...centre, stops: clear.reduce((sum, line) => sum + line.stops, 0) / clear.length };
}

/** One line's way in (lineIn). */
function lineFrom(target, hand, aim, gaps) {
  // (Run on through the place a little: a point aimed at the middle of the part meets its skin before.)
  const met = firstMet(target, hand, vec.add(aim, vec.scale(vec.normalize(vec.sub(aim, hand)), 0.1)));
  if (!met || (met.key !== 'head' && met.key !== 'trunk')) return null;
  const gear = target.body.gear;
  const covered = protectionAt(gear, met.key);
  const rigid = (covered.cut ?? 0) >= gapsOf(gear).rigidFrom;
  const zone = rigid && gaps ? gapZoneAt(target, met.key, met.point, met.normal) : null;
  return { stops: stopsIn(gear, met.key, zone), zone, key: met.key };
}

/**
 * Looking for the gap: of the places a point is put to (REGIONS) from each place he might kneel on his side of the man
 * (FINISHER.kneelAlong; `sides` to look from others, `kneeling` a world point he already kneels at), the one whose line from his
 * hand meets the man's head or body (not his own limb lying across it, nor his shield) where his armour stops it least; alike, the
 * place as he comes first, then REGIONS' order. { entry, shoulder, side, along, stops, zone, key }, or null if every line is blocked.
 */
export function planFinisher(fighter, target, { places = FINISHER.kneelAlong, sides = null, kneeling = null, current = null } = {}) {
  const hips = point(fighter.x, P.pelvis);
  const frame = bodyFrame(target);
  const chest = vec.lerp(point(target.x, P.pelvis), point(target.x, P.neck), 0.6);
  const near = (hips[0] - chest[0]) * frame.across[0] + (hips[2] - chest[2]) * frame.across[1] >= 0 ? 1 : -1;
  // (The place he is already putting it to, `current` { entry, shoulder }, looked at first: alike, he keeps to it.)
  const order = current ? [current.entry, ...REGIONS.filter((entry) => entry !== current.entry)] : REGIONS;
  let best = null;
  for (const side of sides ?? [near]) {
    for (const along of places) {
      for (const entry of order) {
        // (The armpit on the side he kneels; kneeling, the other places are the same from either side.)
        if (kneeling && side !== (sides ?? [near])[0] && entry.region !== 'armpit') continue;
        const flank = [chest[0] + frame.across[0] * side, chest[1], chest[2] + frame.across[1] * side];
        const shoulder = entry.region === 'armpit' ? nearerShoulder(target, flank) : null;
        if (current && entry === current.entry && current.shoulder && shoulder !== current.shoulder) continue;
        const aim = regionPoint(target, entry.region, flank, shoulder);
        // (Kneeling already, `kneeling`: from where he is.)
        const place = kneeling ?? kneelingPlace(fighter, target, aim, { side, along });
        const line = lineIn(target, handFrom(place, aim), aim, entry.gap !== false);
        if (!line) continue;
        const walk = Math.hypot(place[0] - hips[0], place[2] - hips[2]);
        const score = line.stops + FINISHER.walk * walk;
        if (!best || score < best.score - FINISHER.alike) best = { entry, shoulder, side, along, stops: line.stops, zone: line.zone, key: line.key, score };
      }
    }
  }
  return best;
}

/** Which of his shoulders, 'l' or 'r', is nearer a world point. */
function nearerShoulder(target, from) {
  const apart = (side) => vec.length(vec.sub(point(target.x, P[`${side}Shoulder`]), from));
  return apart('l') <= apart('r') ? 'l' : 'r';
}

/** A man lying's frame on the floor: along him (hips to neck) and across him, unit 2-vectors (x, z). */
function bodyFrame(target) {
  const spine = vec.sub(point(target.x, P.neck), point(target.x, P.pelvis));
  const flat = Math.hypot(spine[0], spine[2]);
  const along = flat > 0.15 ? [spine[0] / flat, spine[2] / flat] : [Math.cos(target.yaw), -Math.sin(target.yaw)];
  return { along, across: [-along[1], along[0]] };
}

/** The least protected place on him to put a point: { region, key, move }. Alike, the throat first. */
export function leastProtected(target) {
  let best = null;
  let bestStops = Infinity;
  for (const entry of REGIONS) {
    const score = stops(target, entry);
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
  // (On his knees by his own choice, the player's crawl, he is not helpless: he can strike and stand.)
  return man.state === 'down' || Boolean(man.crawling && !man.crawlChosen && man.state === 'up');
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
 * nearest), in a fight with weapons, while he can kneel and no enemy on his feet is on him. `anyone`: a man of any side (a team-mate, a civilian) is
 * also a target, if no enemy is (the player's own choice: an explicit call, not the button).
 */
export function finishTarget(world, fighter, { anyone = false, locked = null, range = FINISHER.reach } = {}) {
  // Only where it is a fight with weapons (world.armed): in a bout of fists a man down is stood up or counted out, not stabbed.
  if (world.armed === false || !canFinish(fighter) || engaged(world, fighter)) return null;
  const pick = (allowed) => {
    let best = null;
    let bestApart = Infinity;
    for (const man of world.fighters) {
      if (man === fighter || !helplessOnFloor(man) || !allowed(man) || !within(fighter, man, range)) continue;
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
function kneelingPlace(fighter, target, aim, plan = {}) {
  const { along, across } = bodyFrame(target);
  const hips = point(fighter.x, P.pelvis);
  const toward = [hips[0] - aim[0], hips[2] - aim[2]];
  const length = Math.hypot(toward[0], toward[1]) || 1;
  // (The plan's side of him and how far round towards his head, if it says: planFinisher.)
  const headward = Math.max(FINISHER.bodyward, Math.min(FINISHER.headward, plan.along ?? (toward[0] * along[0] + toward[1] * along[1]) / length));
  const side = plan.side ?? (toward[0] * across[0] + toward[1] * across[1] >= 0 ? 1 : -1);
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
export function startFinisher(world, fighter, target, { region = null, force = false, range = FINISHER.reach } = {}) {
  if (world.armed === false || !canFinish(fighter) || !target || target === fighter || !helplessOnFloor(target) || !within(fighter, target, range * (force ? 2 : 1))) return false;
  // The gap he looks for (planFinisher); a place asked for is put to as asked, from where he is; with every line blocked, the least protected place.
  const plan = region ? null : planFinisher(fighter, target);
  const entry = (region && REGIONS.find((item) => item.region === region)) || plan?.entry || leastProtected(target);
  const kind = finisherBlade(fighter);
  let keep = null;
  if (kind !== 'held') {
    keep = drawForFinisher(world, fighter, kind);
    if (!keep) return false;
  }
  fighter.punch = null;
  fighter.rush = null;
  fighter.defence = null;
  fighter.finisher = { asked: Boolean(region), target: target.id, entry, keep, phase: 'approach', t: 0, started: world.time, kneeling: 0, thrustAt: null, shoulder: plan?.shoulder ?? null, plan, place: plan ? { along: plan.along } : {} };
  logFinisher(world, fighter, 'finisher', target, [`draws the ${fighter.weapon.spec.label.toLowerCase()} to finish him`]);
  return true;
}

/**
 * Kneeling, the place he puts the point to looked for again from where he is (planFinisher: either armpit, no further steps). With
 * `shift`, if a place a little round him on his side (FINISHER.kneelAlong) has a line to a gap that stops the point less by more
 * than `alike`, that plan is taken instead, and true returned: he steps there.
 */
function settleAim(fighter, target, state, shift = false) {
  const plan = planFinisher(fighter, target, { places: [null], sides: [1, -1], kneeling: point(fighter.x, P.pelvis), current: state });
  const round = shift ? planFinisher(fighter, target) : null;
  if (round && (!plan || round.stops < plan.stops - FINISHER.alike)) {
    Object.assign(state, { entry: round.entry, shoulder: round.shoulder, plan: round, place: { along: round.along } });
    return true;
  }
  if (!plan) return false;
  state.entry = plan.entry;
  state.shoulder = plan.shoulder;
  state.plan = plan;
  return false;
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
  const aim = regionPoint(target, state.entry.region, hips, state.shoulder);
  // How fast the place moves (a man still settling on the floor is not struck at yet).
  const drift = state.lastAim ? Math.hypot(aim[0] - state.lastAim[0], aim[1] - state.lastAim[1], aim[2] - state.lastAim[2]) / dt : 0;
  state.lastAim = aim;
  if (state.phase === 'approach') {
    const place = kneelingPlace(fighter, target, aim, state.place);
    const apart = Math.hypot(place[0] - hips[0], place[2] - hips[2]);
    if (apart <= FINISHER.arrived || state.t > FINISHER.approachMost) {
      state.phase = 'kneel';
      state.t = 0;
      // Where he kneels, he looks again (the man has moved, or he did not get all the way): the place from here whose line is clear;
      // if a gap is to be had only from a little further round him, he shifts there first (once).
      if (!state.asked && settleAim(fighter, target, state, !state.shifted)) {
        state.shifted = true;
        state.phase = 'approach';
        state.t = FINISHER.approachMost - FINISHER.shiftSeconds;
        return true;
      }
    } else {
      stepTowards(world, fighter, place, aim);
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
    // Until the blade turns down onto its line (the windup), he still looks: a leg that has slid across the place is not stabbed.
    if (!state.asked && (!state.thrustAt || (fighter.punch === state.punch && fighter.punch.t < fighter.punch.spec.windup))) settleAim(fighter, target, state);
    const place = regionPoint(target, state.entry.region, hips, state.shoulder);
    if (fighter.punch && fighter.punch === state.punch) fighter.punch.at = place;
    if (!fighter.punch && !state.thrustAt && ((drift < FINISHER.settledBelow && turned(fighter, place) < FINISHER.squared) || state.t > FINISHER.settleMost)) {
      if (throwPunch(world, fighter, state.entry.move, state.entry.key === 'head' ? 'head' : 'body', { at: place })) {
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

/**
 * One step of going to `place` (a world point) facing `aim`: forwards and sideways as it lies, run from further than `runFrom`
 * (the finisher's steps in; lowstrike.js's too).
 */
export function stepTowards(world, fighter, place, aim) {
  const hips = point(fighter.x, P.pelvis);
  const apart = Math.max(1e-6, Math.hypot(place[0] - hips[0], place[2] - hips[2]));
  const pace = Math.min(FINISHER.approachPace, 0.35 + apart);
  const way = [(place[0] - hips[0]) / apart, (place[2] - hips[2]) / apart];
  const ahead = yawRotate([1, 0, 0], fighter.yaw);
  const left = yawRotate([0, 0, 1], fighter.yaw);
  fighter.goTo = place;
  fighter.faceAt = { at: aim, until: world.time + 0.25 };
  fighter.move = pace * (way[0] * ahead[0] + way[1] * ahead[2]);
  // (Backing off, facing his man, he steps: a man does not run backwards.)
  fighter.running = apart > FINISHER.runFrom && fighter.move > 0;
  fighter.strafe = Math.max(-1, Math.min(1, (pace * (way[0] * left[0] + way[1] * left[2])) / WORLD.sidestepShare));
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
