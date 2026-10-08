// The player's orders, carried out by the simulation. The player says what
// he wants (a man to fight, a way to go and how fast, a line to attack and
// how hard, to guard, a special action); the fighter's own style, weapon,
// stance, range and injuries decide the move that does it. No DOM here:
// main.js and touch.js fill the orders, tests drive them directly.

import { P } from './body.js';
import { AI, chooseDefence } from './ai.js';
import { DEFENCES, MOVES, STYLES, moveRange } from './moves.js';
import { dropWeapon, inFight, manNear, opponentFor, perform, point, reachOf, startPickup, throwPunch, WORLD } from './physics.js';
import { throwFromHold } from './physics/grappling.js';
import { vec, yawRotate } from './pose.js';
import { WEAPONS } from './weapons.js';
import { handling } from './handling.js';

export const CONTROL = {
  // The stick (0 at its centre, 1 at full throw): nothing inside `deadZone`;
  // a walk from `walkFrom` of the footwork's pace up to full pace at
  // `fullFrom`, and a run past `runFrom` (going forward, or unlocked).
  stick: { deadZone: 0.12, walkFrom: 0.3, fullFrom: 0.8, runFrom: 0.88 },
  // Locked on, the stick idle: he keeps to the edge of his reach (m of slack
  // either way), or, with a gun or bow, `gunRoom` m beyond where he must drop it.
  hold: { slack: 0.15, inside: 0.08, gunRoom: 1.5 },
  // An attack asked for while busy waits this long (s) for the hands to come back.
  bufferSeconds: 0.35,
  // He turns to face the place he strikes at for this long (s).
  faceSeconds: 0.6,
  // A pad attack goes at his man within its reach (m more for each unit of a lunge's step, and this slack), else at the air.
  padStepReach: 0.5,
  padSlack: 0.3,
  // An aimed attack: a man this far (m) past his reach is lunged at; a point this high on his own
  // body (share of the shoulder's height) or higher is high, below this share of the hip's, low.
  lungeBeyond: 0.35,
  highFrom: 0.9,
  lowBelow: 0.75,
  // A press held on a man down within this (m) of where it points: he goes to hold him down.
  pinFrom: 1.6,
  pinSeconds: 2.5,
  // A second tap this soon after a quick attack makes it a combination.
  comboWithin: 0.45,
  // Holding the guard, the footwork slows to this share.
  guardFootwork: 0.6,
  // A weapon or shield lying within this (m) can be picked up.
  pickupFrom: 2.5,
  // Breaking a man's hold: each try takes this share of his time from it, by grip.
  breakHold: 0.6,
  // Clinch is offered within this (m) beyond his striking range; asked for, he steps in for up to `clinchSeconds`.
  clinchFrom: 0.4,
  clinchSeconds: 1.2,
};

/** A fresh set of orders: no one locked, nothing held, nothing asked. */
export function newOrders() {
  return { lock: null, stick: null, guard: false, keyMove: 0, requests: [] };
}

// ---- Movement ---------------------------------------------------------------

/** The stick's throw (0..1) as footwork: a pace (0..1) and whether to run. */
export function stickPace(amount) {
  const spec = CONTROL.stick;
  if (amount < spec.deadZone) return { pace: 0, running: false };
  const share = Math.min(1, (amount - spec.deadZone) / (spec.fullFrom - spec.deadZone));
  return { pace: spec.walkFrom + (1 - spec.walkFrom) * share, running: amount >= spec.runFrom };
}

/** Where he wants to stand from his man: the edge of his reach, or with a gun room to raise it. */
export function holdDistance(fighter, opponent) {
  const style = STYLES[fighter.style];
  const gun = style?.ranged && fighter.weapon?.held && !fighter.weapon.spent ? style.ranged : null;
  if (gun) return Math.max(gun.flee ?? 3, gun.close + CONTROL.hold.gunRoom);
  return reachOf(fighter) + opponent.body.lengths.headRadius - CONTROL.hold.inside;
}

/** Footwork from the stick, the keys, or (locked and idle) holding his range. */
function steer(world, fighter, orders, opponent, dt) {
  const pelvis = point(fighter.x, P.pelvis);
  fighter.strafe = 0;
  fighter.running = false;
  const locked = orders.lock !== null && opponent?.id === orders.lock;
  const stick = orders.stick && orders.stick.amount >= CONTROL.stick.deadZone ? orders.stick : null;
  const slow = orders.guard ? CONTROL.guardFootwork : 1;
  if (stick) {
    const { pace, running } = stickPace(stick.amount);
    const way = stick.dir;
    if (locked) {
      // Facing his man: the stick's way split into in-and-out and round him.
      fighter.goTo = null;
      const forward = yawRotate([1, 0, 0], fighter.yaw);
      const left = yawRotate([0, 0, 1], fighter.yaw);
      const ahead = way[0] * forward[0] + way[1] * forward[2];
      fighter.move = ahead * pace * slow;
      fighter.strafe = (way[0] * left[0] + way[1] * left[2]) * pace * slow;
      fighter.running = running && ahead > 0.7 && !orders.guard;
    } else {
      // Free: he turns and goes that way.
      fighter.goTo = [pelvis[0] + way[0] * 3, 0, pelvis[2] + way[1] * 3];
      fighter.move = pace * slow;
      fighter.running = running && !orders.guard;
    }
    return;
  }
  fighter.goTo = null;
  if (orders.keyMove) {
    fighter.move = orders.keyMove * slow;
    return;
  }
  if (!locked || opponent.state !== 'up') {
    fighter.move *= Math.exp(-dt * 6);
    return;
  }
  // Locked and idle: to the edge of his range, and there he stays.
  const distance = Math.hypot(opponent.x[P.pelvis * 3] - pelvis[0], opponent.x[P.pelvis * 3 + 2] - pelvis[2]);
  const hold = holdDistance(fighter, opponent);
  const off = distance - hold;
  if (Math.abs(off) <= CONTROL.hold.slack) fighter.move *= Math.exp(-dt * 6);
  else fighter.move = Math.max(-1, Math.min(1, off * 2)) * slow;
}

// ---- The attack pad ----------------------------------------------------------
//
// Every attack of a style has its own place on the screen, where it would be
// seen to come from by a man behind the fighter: a jab on the left, a cross
// on the right, a hook out wide, an uppercut from below, kicks low on their
// side, a cut from wherever its swing starts, a thrust down the middle. A tap
// throws the move whose place is nearest (screen x right and y up, −1 to 1
// from the centre), so every move a style has can be thrown.

export const ATTACK_PAD = {
  // Places by the way a move travels: [x for the right side (mirrored for the left), y].
  paths: { straight: [0.3, 0.3], hook: [0.85, 0.35], upper: [0.4, -0.2], elbow: [0.65, 0.62], upElbow: [0.3, 0.75], knee: [0.3, -0.45], teep: [0.15, -0.62], pushBoth: [0, -0.1], aim: [0, 0.1] },
  // A kick: at the body and head mid-low on its side; at the legs at the very bottom.
  kick: [0.82, -0.35],
  lowKick: [0.72, -0.85],
  // A blade: a swing from where it starts (its hand's place beside and above the hip, scaled to the screen); a thrust down the middle.
  swingSide: 3,
  swingHeight: 3,
  swingMiddle: 0.65,
  thrust: [0, 0.05],
  rush: [0, -0.92],
  // Places nearer than this are spread apart so that each keeps a patch of its own.
  apart: 0.32,
  // How high the tap is picks the zone of a move that has more than one: head above `headFrom`, legs below `legsBelow`.
  headFrom: 0.25,
  legsBelow: -0.55,
};

const clampPad = (value) => Math.max(-0.95, Math.min(0.95, value));

/** Where on the pad a move sits: [x, y], or null for one the pad does not throw (the clinch: the special button). */
function padPlace(spec) {
  if (spec.kind === 'rush') return [...ATTACK_PAD.rush];
  if (spec.kind !== 'strike') return null;
  const side = spec.limb?.[0] === 'l' ? -1 : 1;
  if (spec.path === 'blade') {
    if (spec.mode === 'thrust' || !spec.from) return [...ATTACK_PAD.thrust];
    // Local z is to his left: the right of the screen is −z.
    return [clampPad(-spec.from.hand[2] * ATTACK_PAD.swingSide), clampPad((spec.from.hand[1] - ATTACK_PAD.swingMiddle) * ATTACK_PAD.swingHeight)];
  }
  if (spec.path === 'roundhouse') {
    const [x, y] = spec.zones.length === 1 && spec.zones[0] === 'legs' ? ATTACK_PAD.lowKick : ATTACK_PAD.kick;
    return [x * side, y];
  }
  const [x, y] = ATTACK_PAD.paths[spec.path] ?? [0.5, 0];
  return [x * side, y];
}

/** The pad of a style: each of its attacks and its place, spread so that none hides another. */
export function attackLayout(styleKey) {
  const style = STYLES[styleKey];
  const pad = [];
  for (const name of Object.keys(style?.attacks ?? {})) {
    const spec = MOVES[name];
    const place = spec ? padPlace(spec) : null;
    if (!place) continue;
    // Too near one already placed: moved aside, then down, until it has room.
    for (let tries = 0; tries < 12 && pad.some((other) => Math.hypot(other.x - place[0], other.y - place[1]) < ATTACK_PAD.apart); tries += 1) {
      place[0] = clampPad(place[0] + (place[0] >= 0 ? 1 : -1) * ATTACK_PAD.apart * (tries % 2 === 0 ? 1 : -2));
      if (tries % 4 === 3) place[1] = clampPad(place[1] - ATTACK_PAD.apart);
    }
    pad.push({ move: name, x: place[0], y: place[1] });
  }
  return pad;
}

/** The attack a tap at (x, y) on the pad throws, and at which zone of him: { move, zone }, or null. */
export function attackAt(styleKey, x, y) {
  const pad = attackLayout(styleKey);
  let best = null;
  let bestDistance = Infinity;
  for (const place of pad) {
    const distance = Math.hypot(place.x - x, place.y - y);
    if (distance < bestDistance) {
      best = place;
      bestDistance = distance;
    }
  }
  if (!best) return null;
  const zones = MOVES[best.move].zones ?? [];
  const zone = y > ATTACK_PAD.headFrom && zones.includes('head') ? 'head' : y < ATTACK_PAD.legsBelow && zones.includes('legs') ? 'legs' : zones.includes('body') ? 'body' : zones[0] ?? null;
  return { move: best.move, zone };
}

// ---- Attacks ----------------------------------------------------------------

const LINE_ZONE = { high: 'head', mid: 'body', low: 'legs', close: 'body', lunge: 'body' };

/** Whether a move's limb is broken or hanging limp. */
function limbLost(fighter, spec) {
  const limb = P[spec.limb];
  return fighter.limp?.has(limb) || false;
}

/**
 * The move that answers an attack request: a `line` (high, mid, low, close,
 * lunge) and a `strength` (quick, heavy, combo). Among the moves his style
 * has, with his weapon, his limbs and from where he stands. Returns
 * { move, zone, heavy, combo, reaches } or null when he has none.
 */
export function chooseAttack(world, fighter, opponent, line, strength = 'quick', at = null) {
  const style = STYLES[fighter.style];
  if (!style || (!opponent && !at)) return null;
  const held = fighter.weapon?.held ? fighter.weapon.spec : null;
  const hips = point(fighter.x, P.pelvis);
  const mark = opponent ? point(opponent.x, P.pelvis) : at;
  const distance = Math.hypot(mark[0] - hips[0], mark[2] - hips[2]);
  const headRadius = opponent?.body.lengths.headRadius ?? fighter.body.lengths.headRadius;
  const zone = LINE_ZONE[line] ?? 'body';
  const pool = { ...(fighter.clinch ? {} : style.attacks), ...(fighter.clinch ? style.clinchStrikes ?? {} : {}) };
  if (fighter.clinch && style.attacks.knee) pool.knee = style.attacks.knee;
  const scored = [];
  for (const [name, weight] of Object.entries(pool)) {
    const spec = MOVES[name];
    if (!spec || weight <= 0) continue;
    if (spec.kind === 'rush') {
      if (line === 'lunge' && !fighter.clinch && opponent) scored.push({ name, score: 1.2, reaches: true, spec });
      continue;
    }
    if (spec.kind === 'clinch') {
      if (line === 'close' && !fighter.clinch && opponent && vec.length(vec.sub(point(opponent.x, P.neck), point(fighter.x, P.neck))) < fighter.body.reach * WORLD.clinch.range) scored.push({ name, score: 1.5, reaches: true, spec });
      continue;
    }
    if (spec.kind !== 'strike' || (spec.reach === 'weapon' && !held) || (spec.bash && !fighter.shield) || limbLost(fighter, spec)) continue;
    // A gun or bow is aimed at the body or the head; the lines low and close mean nothing to it.
    const reach = moveRange(spec, fighter.body, held) + headRadius;
    const reaches = distance <= reach + (spec.step ?? 0) * 0.12;
    let score = Math.sqrt(weight);
    score *= spec.zones.includes(zone) ? 1 : zone === 'legs' ? 0.15 : 0.35;
    if (line === 'close') score *= Math.min(2, 1 / Math.max(0.3, reach));
    if (line === 'lunge') score *= 0.3 + (spec.step ?? 0);
    if (strength === 'heavy') score *= 0.5 + (spec.mass?.body ?? 0.05) * 6 + spec.cost * 8;
    else score *= 1 / Math.max(0.3, spec.duration);
    if (!reaches && line !== 'lunge') score *= 0.4;
    scored.push({ name, score, reaches, spec });
  }
  if (!scored.length) return null;
  const best = Math.max(...scored.map((entry) => entry.score));
  // Among the near-best, any: a little variety, as a fighter's own hands would give.
  const near = scored.filter((entry) => entry.score >= best * 0.85);
  const chosen = near[Math.floor(world.random() * near.length)];
  const spec = chosen.spec;
  const aim = spec.zones ? (spec.zones.includes(zone) ? zone : spec.zones[0]) : null;
  let combo = null;
  if (strength === 'combo' && spec.kind === 'strike') combo = comboAfter(style, chosen.name, scored);
  return { move: chosen.name, zone: aim, heavy: strength === 'heavy' && spec.kind === 'strike', combo, reaches: chosen.reaches };
}

/** The rest of a combination from this opener: the style's own, or two more of the quick ones that reach. */
function comboAfter(style, opener, scored) {
  const own = Object.keys(style.combos ?? {}).filter((sequence) => sequence.split(' ')[0] === opener);
  if (own.length) return own.sort((a, b) => (style.combos[b] ?? 0) - (style.combos[a] ?? 0))[0].split(' ').slice(1);
  const quick = scored.filter((entry) => entry.spec.kind === 'strike').sort((a, b) => Number(b.reaches) - Number(a.reaches) || a.spec.duration - b.spec.duration);
  if (!quick.length) return null;
  return [quick[0].name, quick[Math.min(1, quick.length - 1)].name];
}

/** The line of an attack aimed at a place: a lunge at a man beyond reach, else high, body or low by its height on him. */
export function lineFor(fighter, at, man) {
  const hips = point(fighter.x, P.pelvis);
  if (man && Math.hypot(at[0] - hips[0], at[2] - hips[2]) > reachOf(fighter) + CONTROL.lungeBeyond) return 'lunge';
  const shoulder = (fighter.x[P.lShoulder * 3 + 1] + fighter.x[P.rShoulder * 3 + 1]) / 2;
  if (at[1] >= shoulder * CONTROL.highFrom) return 'high';
  if (at[1] < hips[1] * CONTROL.lowBelow) return 'low';
  return 'mid';
}

/**
 * Carry out the first attack asked for: thrown at once, wherever it is aimed,
 * a man there or not (kept a moment only while the hands are busy). A request
 * carries `at` (a place in the world) or a `line` (at his man).
 */
function attack(world, fighter, orders, opponent) {
  const requests = orders.requests;
  while (requests.length && world.time - requests[0].at > CONTROL.bufferSeconds) requests.shift();
  const request = requests[0];
  if (!request) return;
  // A second tap while the first is still going: the rest of a combination after it.
  if (request.strength === 'combo' && fighter.punch && world.time - (fighter.orderAt ?? -Infinity) < CONTROL.comboWithin) {
    const style = STYLES[fighter.style];
    fighter.orderCombo = comboAfter(style, fighter.punch.type, []) ?? [fighter.punch.type];
    fighter.orderComboZone = fighter.punch.zone;
    fighter.orderComboAt = request.point ?? null;
    requests.shift();
    return;
  }
  if (fighter.punch || fighter.rush || fighter.pickup || fighter.pin || fighter.state !== 'up') return;
  if (request.move) {
    padAttack(world, fighter, request, opponent);
    requests.shift();
    return;
  }
  const aim = request.point ?? null;
  const man = aim ? manNear(world, fighter, aim, WORLD.aimedAtWithin) : opponent;
  const line = aim ? lineFor(fighter, aim, man) : request.line;
  const chosen = chooseAttack(world, fighter, man, line, request.strength, aim);
  requests.shift();
  if (!chosen) return;
  if (aim) fighter.faceAt = { at: aim, until: world.time + CONTROL.faceSeconds };
  // A rush or a clinch goes at the man; a strike at the place.
  const thrown = MOVES[chosen.move].kind === 'strike' ? throwPunch(world, fighter, chosen.move, chosen.zone, { heavy: chosen.heavy, at: aim }) : throwPunch(world, fighter, chosen.move);
  if (thrown) {
    fighter.orderCombo = chosen.combo;
    fighter.orderComboZone = chosen.zone;
    fighter.orderComboAt = aim;
    fighter.orderAt = world.time;
  }
}

/**
 * A move from the pad: at his man if he is within its reach (a lunge's or a
 * charge's further), else into the air before him at the zone's height.
 */
function padAttack(world, fighter, request, opponent) {
  const spec = MOVES[request.move];
  const style = STYLES[fighter.style];
  if (!spec) return;
  const held = fighter.weapon?.held ? fighter.weapon.spec : null;
  const hips = point(fighter.x, P.pelvis);
  let at = null;
  if (spec.kind === 'strike') {
    const reach = moveRange(spec, fighter.body, held) + fighter.body.lengths.headRadius + (spec.step ?? 0) * CONTROL.padStepReach;
    const near = opponent && opponent.state === 'up' && Math.hypot(opponent.x[P.pelvis * 3] - hips[0], opponent.x[P.pelvis * 3 + 2] - hips[2]) <= reach + CONTROL.padSlack;
    // A gun fires at its man wherever he is; with nobody there, it fires ahead.
    if (!near && (spec.path !== 'aim' || !opponent)) {
      const forward = yawRotate([1, 0, 0], fighter.yaw);
      const height = request.zone === 'head' ? fighter.x[P.head * 3 + 1] : request.zone === 'legs' ? hips[1] * 0.6 : fighter.x[P.neck * 3 + 1] - 0.3;
      at = [hips[0] + forward[0] * reach, height, hips[2] + forward[2] * reach];
    }
  } else if (!opponent) return;
  const combo = request.strength === 'combo' && spec.kind === 'strike' ? comboAfter(style, request.move, []) : null;
  const thrown = spec.kind === 'strike' ? throwPunch(world, fighter, request.move, request.zone, { at }) : throwPunch(world, fighter, request.move);
  if (thrown) {
    fighter.orderCombo = combo;
    fighter.orderComboZone = request.zone;
    fighter.orderComboAt = at;
    fighter.orderAt = world.time;
  }
}

/** The next strike of a combination, as soon as the last one is back. */
function continueCombo(world, fighter) {
  if (!fighter.orderCombo?.length || fighter.punch || fighter.state !== 'up') return;
  const next = fighter.orderCombo.shift();
  if (!throwPunch(world, fighter, next, fighter.orderComboZone, { at: fighter.orderComboAt ?? null })) fighter.orderCombo = null;
}

// ---- Push and hold down ------------------------------------------------------

/** A press held: a man down near where it points is held down; otherwise a shove (a shield's bash, or both hands). */
function pressHeld(world, fighter, at) {
  const down = world.fighters.find((other) => other.corner !== fighter.corner && (other.state === 'down' || other.state === 'rising') && Math.hypot(other.x[P.pelvis * 3] - at[0], other.x[P.pelvis * 3 + 2] - at[2]) < CONTROL.pinFrom);
  if (down && !world.rules?.noPins) {
    fighter.orderPin = { target: down.id, until: world.time + CONTROL.pinSeconds };
    return;
  }
  if (fighter.punch || fighter.state !== 'up') return;
  fighter.faceAt = { at, until: world.time + CONTROL.faceSeconds };
  const style = STYLES[fighter.style];
  const push = fighter.shield ? 'shieldBash' : Object.keys(style?.attacks ?? {}).find((name) => MOVES[name]?.push) ?? 'oshi';
  // At his chest's height: a shove goes into the body, wherever the press pointed.
  throwPunch(world, fighter, push, 'body', { at: [at[0], fighter.x[P.neck * 3 + 1] - 0.25, at[2]] });
}

/** Going to hold a man down: beside his chest, then the hold (the same as anyone's: grappling.js). */
function goPin(world, fighter) {
  if (fighter.pin) {
    fighter.move = 0;
    fighter.strafe = 0;
    return true;
  }
  const order = fighter.orderPin;
  const target = order ? world.fighters[order.target] : null;
  if (!target || world.time > order.until || (target.state !== 'down' && target.state !== 'rising')) {
    fighter.orderPin = null;
    return false;
  }
  const chest = vec.lerp(point(target.x, P.pelvis), point(target.x, P.neck), 0.6);
  const at = point(fighter.x, P.pelvis);
  const apart = Math.hypot(chest[0] - at[0], chest[2] - at[2]);
  fighter.strafe = 0;
  fighter.goTo = chest;
  if (apart > AI.pin.reach) {
    fighter.move = Math.min(1, (apart - AI.pin.reach) * 2 + 0.3);
    return true;
  }
  fighter.move = 0;
  fighter.focus = target.id;
  if (perform(world, fighter, 'pin')) fighter.orderPin = null;
  return true;
}

// ---- Defence ----------------------------------------------------------------

/** The block he holds: his shield, his weapon across, or his arms. */
export function blockFor(fighter) {
  const style = STYLES[fighter.style];
  if (fighter.shield) return 'shieldBlock';
  if (fighter.weapon?.held && style?.defences?.weaponBlock) return 'weaponBlock';
  return 'guard';
}

/** A tap of the guard: out of the way of what is coming, as his style would; with nothing coming, a step back. */
export function evasionFor(world, fighter) {
  const style = STYLES[fighter.style];
  const striker = world.fighters.find((other) => other.corner !== fighter.corner && other.punch?.target === fighter.id);
  const blocks = new Set(['guard', 'weaponBlock', 'shieldBlock']);
  if (striker) {
    const { name, side } = chooseDefence(fighter, striker, style, striker.punch, world.random);
    if (!blocks.has(name)) return { name, side, from: striker.id };
    const others = Object.keys(style.defences ?? {}).filter((defence) => !blocks.has(defence) && DEFENCES[defence]);
    return { name: others.includes('slip') && striker.punch.zone === 'head' ? 'slip' : others.includes('stepBack') ? 'stepBack' : others[0] ?? 'stepBack', side, from: striker.id };
  }
  return { name: style?.defences?.slip && !fighter.weapon?.held ? 'slip' : 'stepBack', side: world.random() < 0.5 ? 1 : -1, from: null };
}

function defend(world, fighter, orders) {
  if (fighter.state !== 'up') return;
  // Held: the block stays up, put back as each one runs out (not over a strike he is throwing).
  if (orders.guard && !fighter.punch && !fighter.defence) perform(world, fighter, blockFor(fighter));
  for (const request of orders.evasions ?? []) {
    const evasion = evasionFor(world, fighter);
    if (!fighter.punch) perform(world, fighter, evasion.name, { side: evasion.side, from: evasion.from });
    else if (evasion.name === 'stepBack') fighter.punch = null;
  }
  orders.evasions = [];
}

// ---- Special actions ---------------------------------------------------------

export const ACTIONS = {
  disengage: { label: 'Disengage', icon: '↩' },
  throw: { label: 'Throw', icon: '🤼' },
  reload: { label: 'Reload', icon: '⟳' },
  fire: { label: 'Fire', icon: '◎' },
  drawSidearm: { label: 'Draw sidearm', icon: '🗡' },
  pickUp: { label: 'Pick up', icon: '✋' },
  clinch: { label: 'Clinch', icon: '🫂' },
};

/** Who holds him in a clinch, if anyone. */
function holder(world, fighter) {
  return world.fighters.find((other) => other.clinch?.target === fighter.id && inFight(other)) ?? null;
}

/** The nearest weapon (or shield, for a man of a shield style without one) lying where he can take it up. */
function looseNearby(world, fighter) {
  const wantsWeapon = !fighter.weapon?.held;
  const wantsShield = Boolean(STYLES[fighter.style]?.shield) && !fighter.shield;
  const at = point(fighter.x, P.pelvis);
  let best = null;
  let bestDistance = CONTROL.pickupFrom;
  for (const debris of world.debris ?? []) {
    if (debris.taken || !debris.resting) continue;
    if (debris.kind === 'weapon' ? !wantsWeapon || WEAPONS[debris.weapon]?.flag || !handling(fighter.body, WEAPONS[debris.weapon]).canHold : debris.kind !== 'shield' || !wantsShield) continue;
    const distance = Math.hypot(debris.x[0] - at[0], debris.x[2] - at[2]);
    if (distance < bestDistance) {
      best = debris;
      bestDistance = distance;
    }
  }
  return best;
}

/** The style's clinch move (a two-hand tie or a collar tie), if it has one. */
function clinchMove(style) {
  return Object.keys(style?.attacks ?? {}).find((name) => MOVES[name]?.kind === 'clinch') ?? null;
}

/** What the special button does now, by the situation: the first that applies, or null. */
export function contextAction(world, fighter) {
  if (!fighter || fighter.state !== 'up' || fighter.netted) return null;
  const style = STYLES[fighter.style];
  if (fighter.clinch) return style?.throws || style?.clinchDrive ? 'throw' : 'disengage';
  if (holder(world, fighter)) return 'disengage';
  const weapon = fighter.weapon?.held ? fighter.weapon : null;
  const opponent = opponentFor(world, fighter);
  const distance = opponent ? vec.length(vec.sub(point(opponent.x, P.pelvis), point(fighter.x, P.pelvis))) : Infinity;
  if (weapon?.spec.ranged && !weapon.spent) {
    const sidearm = fighter.body.gear.sidearm && !fighter.sidearmDrawn;
    if (sidearm && distance < (style?.ranged?.close ?? 1.5) + 0.5) return 'drawSidearm';
    if (weapon.spec.shot && !weapon.loaded) return fighter.reloading ? null : 'reload';
    return 'fire';
  }
  if (looseNearby(world, fighter)) return 'pickUp';
  // Within striking range: pressed, he steps in to take hold (goClinch).
  if (clinchMove(style) && opponent?.state === 'up' && distance < holdDistance(fighter, opponent) + CONTROL.clinchFrom) return 'clinch';
  return null;
}

/** Do a special action now (when it still applies). */
export function doAction(world, fighter, name) {
  if (!fighter || name !== contextAction(world, fighter)) return false;
  const style = STYLES[fighter.style];
  const opponent = opponentFor(world, fighter);
  if (name === 'throw') {
    const target = world.fighters[fighter.clinch.target];
    if (!(fighter.clinch.locked?.l && fighter.clinch.locked?.r) || target.state !== 'up') return false;
    throwFromHold(world, fighter, target);
    return true;
  }
  if (name === 'disengage') {
    if (fighter.clinch) fighter.clinch = null;
    const other = holder(world, fighter);
    if (other) {
      // His grip against mine: the stronger my hands, the more of his hold I break.
      const grip = (who) => who.body.strikeForce[P.lHand] + who.body.strikeForce[P.rHand];
      const share = grip(fighter) / (grip(fighter) + grip(other));
      other.clinch.duration = Math.max(other.clinch.t, other.clinch.duration - CONTROL.breakHold * share * other.clinch.duration);
    }
    perform(world, fighter, 'stepBack');
    return true;
  }
  if (name === 'reload') {
    if (fighter.punch) return false;
    fighter.reloading = true;
    return true;
  }
  if (name === 'fire') {
    const move = style?.ranged?.move ?? Object.keys(style?.attacks ?? {}).find((attackName) => MOVES[attackName]?.path === 'aim');
    return Boolean(move) && throwPunch(world, fighter, move, 'body');
  }
  if (name === 'drawSidearm') {
    dropWeapon(world, fighter, 'dropped');
    return true;
  }
  if (name === 'pickUp') {
    fighter.orderPickup = looseNearby(world, fighter)?.id ?? null;
    return fighter.orderPickup !== null;
  }
  if (name === 'clinch') {
    fighter.orderClinchUntil = world.time + CONTROL.clinchSeconds;
    return true;
  }
  return false;
}

/** Stepping in to take the clinch he asked for: once his hands can reach the neck, he takes hold. */
function goClinch(world, fighter, opponent) {
  if (!(fighter.orderClinchUntil > world.time) || fighter.clinch || !opponent) {
    fighter.orderClinchUntil = 0;
    return false;
  }
  if (perform(world, fighter, clinchMove(STYLES[fighter.style]))) {
    fighter.orderClinchUntil = 0;
    return false;
  }
  fighter.goTo = null;
  fighter.strafe = 0;
  fighter.move = 1;
  return true;
}

/** Walking to a weapon he asked to pick up, and stooping for it there. */
function goPickUp(world, fighter) {
  const debris = world.debris?.[fighter.orderPickup];
  if (!debris || debris.taken || fighter.pickup) {
    if (!fighter.pickup) fighter.orderPickup = null;
    return Boolean(fighter.pickup);
  }
  const at = point(fighter.x, P.pelvis);
  const distance = Math.hypot(debris.x[0] - at[0], debris.x[2] - at[2]);
  fighter.strafe = 0;
  if (distance > AI.pickup.stoopAt) {
    fighter.goTo = debris.x;
    fighter.move = Math.min(1, 0.5 + distance);
    return true;
  }
  fighter.move = 0;
  startPickup(world, fighter, debris);
  fighter.orderPickup = null;
  return true;
}

// ---- Each step --------------------------------------------------------------

/**
 * Carry out the player's orders for one step: the lock, the footwork, the
 * guard, any special action and attack asked for. The fighter does not think
 * for himself (the AI skips him); this is his whole mind.
 */
export function directFighter(world, fighter, orders, dt) {
  if (!fighter || fighter.state === 'out') return;
  // The man locked on is the man he fights; a lock on a man out of the fight lets go.
  const locked = orders.lock !== null ? world.fighters[orders.lock] : null;
  if (locked && !inFight(locked)) orders.lock = null;
  fighter.focus = orders.lock ?? undefined;
  const opponent = opponentFor(world, fighter);
  // A gun is kept up on the man locked on.
  const style = STYLES[fighter.style];
  fighter.aimAt = orders.lock !== null && style?.ranged && fighter.weapon?.held && !fighter.weapon.spent ? orders.lock : undefined;
  if (fighter.state !== 'up' || fighter.pain) {
    fighter.move = 0;
    fighter.strafe = 0;
    return;
  }
  for (const action of orders.actions ?? []) doAction(world, fighter, action);
  orders.actions = [];
  for (const press of orders.holds ?? []) pressHeld(world, fighter, press);
  orders.holds = [];
  if (goPin(world, fighter)) return;
  if (fighter.orderPickup !== undefined && fighter.orderPickup !== null && goPickUp(world, fighter)) return;
  if (!goClinch(world, fighter, opponent)) steer(world, fighter, orders, opponent, dt);
  defend(world, fighter, orders);
  continueCombo(world, fighter);
  attack(world, fighter, orders, opponent);
}
