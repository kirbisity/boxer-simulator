// The player's orders, carried out by the simulation. The player says what
// he wants (a man to fight, a way to go and how fast, a line to attack and
// how hard, to guard, a special action); the fighter's own style, weapon,
// stance, range and injuries decide the move that does it. No DOM here:
// main.js and touch.js fill the orders, tests drive them directly.

import { P } from './body.js';
import { AI, chooseDefence } from './ai.js';
import { DEFENCES, MOVES, STYLES, moveRange } from './moves.js';
import { dropWeapon, inFight, opponentFor, perform, point, reachOf, startPickup, throwPunch, WORLD } from './physics.js';
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
  // An attack asked for while busy waits this long (s) for the hands to come back;
  // out of reach, he closes in for up to `approachSeconds` before throwing.
  bufferSeconds: 0.35,
  approachSeconds: 1.6,
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
export function chooseAttack(world, fighter, opponent, line, strength = 'quick') {
  const style = STYLES[fighter.style];
  if (!style || !opponent) return null;
  const held = fighter.weapon?.held ? fighter.weapon.spec : null;
  const distance = vec.length(vec.sub(point(opponent.x, P.pelvis), point(fighter.x, P.pelvis)));
  const zone = LINE_ZONE[line] ?? 'body';
  const pool = { ...(fighter.clinch ? {} : style.attacks), ...(fighter.clinch ? style.clinchStrikes ?? {} : {}) };
  if (fighter.clinch && style.attacks.knee) pool.knee = style.attacks.knee;
  const scored = [];
  for (const [name, weight] of Object.entries(pool)) {
    const spec = MOVES[name];
    if (!spec || weight <= 0) continue;
    if (spec.kind === 'rush') {
      if (line === 'lunge' && !fighter.clinch) scored.push({ name, score: 1.2, reaches: true, spec });
      continue;
    }
    if (spec.kind === 'clinch') {
      if (line === 'close' && !fighter.clinch && vec.length(vec.sub(point(opponent.x, P.neck), point(fighter.x, P.neck))) < fighter.body.reach * WORLD.clinch.range) scored.push({ name, score: 1.5, reaches: true, spec });
      continue;
    }
    if (spec.kind !== 'strike' || (spec.reach === 'weapon' && !held) || (spec.bash && !fighter.shield) || limbLost(fighter, spec)) continue;
    // A gun or bow is aimed at the body or the head; the lines low and close mean nothing to it.
    const reach = moveRange(spec, fighter.body, held) + opponent.body.lengths.headRadius;
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

/** Carry out the first attack request that can be: thrown now, or kept a moment while busy or closing in. */
function attack(world, fighter, orders, opponent) {
  const requests = orders.requests;
  while (requests.length && world.time - requests[0].at > (requests[0].approach ? CONTROL.approachSeconds : CONTROL.bufferSeconds)) requests.shift();
  const request = requests[0];
  if (!request) return;
  // The rest of a combination already under way: queued after the strike in hand.
  if (request.strength === 'combo' && fighter.punch && fighter.orderLine === request.line && world.time - (fighter.orderAt ?? -Infinity) < CONTROL.comboWithin) {
    const style = STYLES[fighter.style];
    fighter.orderCombo = comboAfter(style, fighter.punch.type, []) ?? [fighter.punch.type];
    fighter.orderComboZone = fighter.punch.zone;
    requests.shift();
    return;
  }
  if (fighter.punch || fighter.rush || fighter.pickup || fighter.state !== 'up' || !opponent) return;
  const chosen = chooseAttack(world, fighter, opponent, request.line, request.strength);
  if (!chosen) {
    requests.shift();
    return;
  }
  if (!chosen.reaches && request.line !== 'lunge') {
    // Out of reach: close in for it, then throw.
    request.approach = true;
    fighter.move = Math.max(fighter.move, 1);
    fighter.goTo = null;
    return;
  }
  if (throwPunch(world, fighter, chosen.move, chosen.zone, { heavy: chosen.heavy })) {
    fighter.orderCombo = chosen.combo;
    fighter.orderComboZone = chosen.zone;
    fighter.orderLine = request.line;
    fighter.orderAt = world.time;
    requests.shift();
  }
}

/** The next strike of a combination, as soon as the last one is back. */
function continueCombo(world, fighter) {
  if (!fighter.orderCombo?.length || fighter.punch || fighter.state !== 'up') return;
  const next = fighter.orderCombo.shift();
  if (!throwPunch(world, fighter, next, fighter.orderComboZone)) fighter.orderCombo = null;
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
  if (fighter.orderPickup !== undefined && fighter.orderPickup !== null && goPickUp(world, fighter)) return;
  if (!goClinch(world, fighter, opponent)) steer(world, fighter, orders, opponent, dt);
  defend(world, fighter, orders);
  continueCombo(world, fighter);
  attack(world, fighter, orders, opponent);
}
