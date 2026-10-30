// The player's orders, carried out by the simulation. The player says what
// he wants (a man to fight, a way to go and how fast, a line to attack and
// how hard, to guard, a special action); the fighter's own style, weapon,
// stance, range and injuries decide the move that does it. No DOM here:
// main.js and touch.js fill the orders, tests drive them directly.

import { P } from './body.js';
import { AI, chooseDefence, hurtShare } from './ai.js';
import { DEFENCES, MOVES, pointRoomOf, STYLES, moveRange } from './moves.js';
import { aimPoint, BLOCKS, dropWeapon, holdGuard, hostile, inFight, legBroken, legShare, manNear, nearestAnyone, opponentFor, perform, point, reachOf, retryFromKnees, startCrawl, startJump, startPickup, throwPunch, WORLD } from './physics.js';
import { throwFromHold } from './physics/grappling.js';
import { floorAt, pushOut } from './physics/terrain.js';
import { vec, yawRotate } from './pose.js';
import { WEAPONS } from './weapons.js';
import { handling } from './handling.js';
import { RUN_STEER, runSteer } from './runsteer.js';
import { jogSpeed, runSpeed } from './physics/gait.js';
import { FINISHER, finishTarget, startFinisher, updateFinisher } from './finisher.js';
import { lowTarget, startLowStrike, updateLowStrike } from './lowstrike.js';
import { chargeAt } from './riding.js';
import { artReady, artTarget, feelAdrenaline, startArt } from './weaponarts.js';

export const CONTROL = {
  // The stick (0 at its centre, 1 at full throw): nothing inside `deadZone`; a walk from `walkFrom` of the footwork's pace up
  // to full pace at `fullFrom` (the keys' walk); past `runFrom` a run (the run mode), from a jog at the stick's threshold
  // (his walk-to-run speed, physics/gait.js jogSpeed) to his sprint at full throw, in proportion to the throw between.
  // (The run was 0.88 to 1, at his sprint whatever the throw, and the walk full from 0.8.)
  stick: { deadZone: 0.12, walkFrom: 0.3, fullFrom: 0.55, runFrom: 0.6 },
  // Run mode (the stick past `runFrom`, or Shift): no guard, weapon carried, faster (WORLD.runMode). A run lasts as long as the stick is
  // held out there (or Shift is): let go and he stops. There is no run lock.
  // - staminaPerSecond: what running flat out costs (stamina is 0..1; divided by his aerobic; it recovers at WORLD.staminaRecovery × aerobic, and
  //   at WORLD.runMode.recovery of that while he runs). Was 0.12 (an athletic man winded in ~20 s: a run across one section tired him);
  //   now 0.02: a fit man (the forger, aerobic 0.9) loses ~0.006 a second net, so ~2.5 minutes of sprinting from fresh before he is
  //   winded, a man in plate (aerobic 0.73) a little over a minute. A dash across a courtyard or a tower stair costs a few percent.
  //   Below `windedBelow` he is winded and runs no more until stamina is back to `recoveredTo` (a few seconds' rest: the latch is
  //   lower and shorter than it was, 0.06 / 0.25, as the drain is so much gentler). A slower run costs less: in proportion
  //   to his speed over his sprint (a runner's energy per metre is about the same at any pace: per second, it goes with the speed).
  // - Auto-steer along walls, corners and winding stairs (runsteer.js RUN_STEER; the player's intent only, in worlds with terrain, and
  //   not locked on a man): the heading the stick gives is bent along a wall in his way at a glancing angle.
  run: {
    staminaPerSecond: 0.02, windedBelow: 0.05, recoveredTo: 0.2,
  },
  // Facing. Not locked on and with no foe near, he keeps the heading he has (or the way he goes) and does not turn to a man
  // far off: `foeWithin` m (a man at the other end of a courtyard is not a man to square up to). A man with a gun or bow
  // always faces his man (he aims); in a level stage only a man aware of him counts as near.
  facing: { foeWithin: 4.5 },
  // The special button offers Crawl once he is this hurt (hurtShare, or his legs' damage), with nothing else to offer.
  crawlOfferFrom: 0.35,
  // Crawling by choice onto a slope steeper than `crawlSteep` (rise over run, looked at `crawlLook` m along his way: a flight of
  // stairs is ~0.6, a ladder laid down steeper, the castle's ramps under 0.3), he gets up to climb it.
  crawlSteep: 0.4,
  crawlLook: 0.5,
  // Locked on, the stick idle: he keeps to the edge of his reach (m of slack
  // either way), or, with a gun or bow, `gunRoom` m beyond where he must drop it.
  hold: { slack: 0.15, inside: 0.08, gunRoom: 1.5 },
  // On horseback (rideStick): the horse is slowed into a turn more than `slowFrom` rad off its line, to the speed it turns sharpest
  // at by a right angle; `snap` (off): locked on, a way within `snapAngle` rad of his man is taken straight at him.
  // `reins` false: the old way (the stick split round his facing as on foot: a pull back while locked on reins the horse back), to compare.
  // `canterFrom`, `gallopFrom`: the stick's throw for the horse's full canter and its gallop (the horse keeps the stick's old
  // ranges: its gaits are its own, not the man's run).
  ride: { reins: true, slowFrom: 0.35, snap: false, snapAngle: 0.25, canterFrom: 0.8, gallopFrom: 0.88 },
  // An attack asked for while busy waits this long (s) for the hands to come back.
  bufferSeconds: 0.35,
  // He turns to face the place he strikes at for this long (s).
  faceSeconds: 0.6,
  // With no enemy within `foeEngaged` m, an attack goes at whoever is nearest within `anyoneWithin` m, enemy or not (a civilian, a prisoner, a
  // team-mate, a man on the floor): the player can strike at anything. An enemy nearer than `foeEngaged` owns the blow.
  anyoneWithin: 2.2,
  foeEngaged: 4,
  // Lock, with no enemy to take, takes the nearest man of any side within this (m).
  lockAnyoneWithin: 5,
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
  // The guard held (the button held, T held): the block kept up (shield, weapon across, or arms: physics.js blockFor) and put onto
  // the line of the blow coming at him (physics.js holdGuard: its striker as the block's `from`), so it is in the way where the blow
  // comes rather than wherever it happened to be, as well as his skill reads it (WORLD.guardRead: the same for the AI's guard).
  // What it costs, held and per blow taken on it, is WORLD.guardHeld (anyone's guard: these are its numbers).
  // He can strike from it: an attack asked for while it is held is thrown (the block keeps what the strike does not need) and the
  // block is back up after it.
  guard: WORLD.guardHeld,
  // A long weapon's room (its striking part moves.js POINT_ROOM.deadFrom m or more beyond the hands: weapon.spec.strikeFrom, a
  // spear's head, a naginata's blade, a hammer's head on its haft; the AI's the same, ai.js AI.pointRoom): with his man inside it
  // only the haft meets him. His man (an enemy on his feet, the one he faces) nearer than his reach plus that dead length (plus
  // the man's head's radius, as holdDistance: pointRoomOf), the stick idle
  // or not pushed at him (its share towards him under `pushFrom`), he gives ground at `pace` of his footwork until the man is
  // `room` m past it again. The stick pushed at the man is the player closing on purpose: that wins. Not in a run, a strike of his
  // own, or on a horse.
  spacing: { pushFrom: 0.3, pace: 0.6, room: 0.15 },
  // A blow asked for in a run (control.js runStep: the run goes on into it, as a rider's charge does) at a man ahead, closing on
  // him: readied, it is made when he will be at the blow's reach as it comes out (the run's metres over the move's extendUntil
  // taken off: closingBy), not at once (thrown at once from 3 m at a run, the blade was out and back with him still beyond it, or
  // came out with him already inside its arc). It waits for that up to `waitSeconds` (~6-9 m of a sprint), then goes anyway.
  // Nothing is added to the blow: the run's speed is in the blade's (physics.js handVelocityOf).
  runStrike: { waitSeconds: 1.5 },
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
  return { lock: null, stick: null, keyStick: null, guard: false, jump: false, requests: [], runBroken: false, winded: false, runSteer: { bend: 0 }, charge: null, charged: null, spacing: false };
}

/**
 * The movement keys held (w a s d and the arrows) as a stick: a way on the
 * floor taken from the camera's own axes (`ahead`, `right`), at full throw,
 * or a run with `running`; null when none are held or they cancel out.
 */
export function keyStick(held, { ahead, right }, running = false) {
  let along = 0;
  let across = 0;
  for (const key of held) {
    const [forward, side] = MOVE_KEYS[key] ?? [0, 0];
    along += forward;
    across += side;
  }
  const way = [ahead[0] * along + right[0] * across, ahead[1] * along + right[1] * across];
  const length = Math.hypot(way[0], way[1]);
  if (length < 1e-6) return null;
  return { dir: [way[0] / length, way[1] / length], amount: running ? 1 : CONTROL.stick.fullFrom };
}

/** The movement keys: [ahead, right] on the screen. */
export const MOVE_KEYS = { w: [1, 0], arrowup: [1, 0], s: [-1, 0], arrowdown: [-1, 0], a: [0, -1], arrowleft: [0, -1], d: [0, 1], arrowright: [0, 1] };

// ---- Movement ---------------------------------------------------------------

/**
 * The stick's throw (0..1) as footwork: a pace (0..1, the walk's) and whether to run; running, `run` is how far into the
 * run's range it is (0 at the threshold, a jog, to 1 at full throw, his sprint).
 */
export function stickPace(amount) {
  const spec = CONTROL.stick;
  if (amount < spec.deadZone) return { pace: 0, running: false, run: 0 };
  const share = Math.min(1, (amount - spec.deadZone) / (spec.fullFrom - spec.deadZone));
  const running = amount >= spec.runFrom;
  return { pace: spec.walkFrom + (1 - spec.walkFrom) * share, running, run: running ? Math.min(1, (amount - spec.runFrom) / (1 - spec.runFrom)) : 0 };
}

/**
 * His run at a stick's run share (0..1) as a share of his sprint (fighter.move while running): from a jog (his walk-to-run
 * speed, physics/gait.js jogSpeed) at the run's threshold to his sprint at full throw.
 */
export function runShare(fighter, share) {
  const top = runSpeed(fighter, true);
  if (top <= 0) return 0;
  const jog = Math.min(top, jogSpeed(fighter));
  return (jog + (top - jog) * Math.max(0, Math.min(1, share))) / top;
}

/** Where he wants to stand from his man: the edge of his reach, or with a gun room to raise it. */
export function holdDistance(fighter, opponent) {
  const style = STYLES[fighter.style];
  const gun = style?.ranged && fighter.weapon?.held && !fighter.weapon.spent ? style.ranged : null;
  if (gun) return Math.max(gun.flee ?? 3, gun.close + CONTROL.hold.gunRoom);
  return reachOf(fighter) + opponent.body.lengths.headRadius - CONTROL.hold.inside;
}

/** Whether a man of the other side, awake and (in a level stage) aware of him, is within `range` m of the fighter. */
function foeNear(world, fighter, range) {
  const at = point(fighter.x, P.pelvis);
  const minds = world.stage?.aware?.minds;
  return world.fighters.some((other) => {
    if (!hostile(other, fighter) || !inFight(other)) return false;
    if (minds && !['aggro', 'search'].includes(minds[other.id]?.state)) return false;
    return Math.hypot(other.x[P.pelvis * 3] - at[0], other.x[P.pelvis * 3 + 2] - at[2]) <= range;
  });
}

/** Whether he squares up to his man: locked on, armed with a gun or bow, or with a foe near. Otherwise he keeps his own heading. */
function facesFoe(world, fighter, orders) {
  if (orders.lock !== null) return true;
  if (STYLES[fighter.style]?.ranged && fighter.weapon?.held) return true;
  return foeNear(world, fighter, CONTROL.facing.foeWithin);
}

/** Whether the floor ahead along `dir` falls away (a ledge, a stair's head, the sea's edge): RUN_STEER.edgeDrop m or more. A wall there is no edge. */
function dropsAhead(world, fighter, dir) {
  const terrain = world.arena?.terrain;
  if (!terrain) return false;
  const [x, y, z] = point(fighter.x, P.pelvis);
  const here = floorAt(terrain, x, z, y);
  const at = [x + dir[0] * RUN_STEER.edgeAhead, z + dir[1] * RUN_STEER.edgeAhead];
  const ahead = floorAt(terrain, at[0], at[1], y);
  if (here - ahead < RUN_STEER.edgeDrop) return false;
  // (Standing at the wall of a tower stair, the floor past the tread is the wall's footing: he cannot go there.)
  const lift = fighter.lift ?? 0;
  const spec = WORLD.terrain;
  return !pushOut(terrain, at, spec.bodyRadius, lift + spec.sag, lift + spec.sag + spec.bodyHeight, spec.stepUp, lift + spec.sag);
}

/** What stops a run: not on his feet, hurt, reeling, on a horse, held, or at some work with his hands. */
function cannotRun(fighter) {
  return fighter.state !== 'up' || fighter.pain || fighter.crawling || fighter.netted || fighter.mount || fighter.clinch || fighter.pin || fighter.pickup
    || fighter.stagger > 0 || fighter.dazed > 0;
}

/** A guard or action made outside the orders (a key): the run held on the stick stops until the stick is eased off. */
export function breakRun(orders) {
  orders.runBroken = true;
}

/**
 * The run: whether he runs this step. The stick past the run threshold (or Shift) is a run for as long as it is held, and ends
 * when it is let go. A guard, evasion or action asked for also stops it until the stick is eased off the threshold; running out
 * of breath or a blow that staggers him stops it too. An attack does not: the blow is made in the run, the run going on into it
 * (a running strike: the body's speed is in the weapon's, physics.js handVelocityOf), as a rider's charge does (chargeOrder).
 */
function runStep(fighter, orders, stick) {
  const breaks = orders.guard || (orders.evasions?.length ?? 0) > 0 || (orders.actions?.length ?? 0) > 0;
  const atRun = Boolean(stick) && stick.amount >= CONTROL.stick.runFrom;
  orders.runBroken = atRun && (breaks || orders.runBroken);
  if (fighter.stamina < CONTROL.run.windedBelow) orders.winded = true;
  else if (fighter.stamina >= CONTROL.run.recoveredTo) orders.winded = false;
  return atRun && !orders.runBroken && !orders.guard && !orders.winded && !cannotRun(fighter);
}

/**
 * Whether a long weapon wants room from his man (CONTROL.spacing): its striking part begins POINT_ROOM.deadFrom or more beyond
 * his hands, and the man (an enemy on his feet) is nearer than where it begins (moves.js pointRoomOf); once giving ground, until
 * he is `room` past it. Kept in the orders (`spacing`) so the step back finishes rather than flickering at the line.
 */
function keepsRoom(fighter, orders, man) {
  const spec = CONTROL.spacing;
  const inside = man ? pointRoomOf(fighter, man) : null;
  const able = inside !== null && man.state === 'up' && hostile(man, fighter)
    && !fighter.punch && !fighter.mount && !fighter.crawling && !fighter.clinch && fighter.state === 'up';
  if (!able) {
    orders.spacing = false;
    return false;
  }
  const distance = reachBetween(fighter, man);
  orders.spacing = distance < inside || (orders.spacing && distance < inside + spec.room);
  return orders.spacing;
}

/** Footwork from the stick, the keys, or (locked on and idle) holding his range. */
function steer(world, fighter, orders, opponent, dt) {
  const pelvis = point(fighter.x, P.pelvis);
  fighter.strafe = 0;
  fighter.running = false;
  fighter.runMode = false;
  const locked = orders.lock !== null && opponent?.id === orders.lock;
  const held = orders.stick ?? orders.keyStick;
  const stick = held && held.amount >= CONTROL.stick.deadZone ? held : null;
  const running = runStep(fighter, orders, stick);
  const slow = orders.guard ? CONTROL.guardFootwork : 1;
  // On horseback the stick is the reins, locked on or not: the horse goes the way it points (rideStick).
  if (stick && fighter.mount && CONTROL.ride.reins) {
    rideStick(world, fighter, orders, stick, opponent);
    return;
  }
  if (stick) {
    const { pace, run } = stickPace(stick.amount);
    // Running, the throw is his speed: a jog at the threshold to his sprint at full throw (runShare).
    const runMove = running ? runShare(fighter, run) : 0;
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
      if (fighter.running) fighter.move = ahead * runMove;
      // Not pushed at him, a long weapon gives ground to keep him out at its head (CONTROL.spacing).
      else if (ahead < CONTROL.spacing.pushFrom && keepsRoom(fighter, orders, opponent)) fighter.move = Math.min(fighter.move, -CONTROL.spacing.pace * slow);
    } else {
      // Free: he turns and goes that way (a run bent along any wall in his way: runsteer.js).
      let go = way;
      orders.runSteer ??= { bend: 0 };
      if (running && !orders.guard && !fighter.mount && world.arena?.terrain) {
        go = runSteer(world, fighter, orders.runSteer, way, dt, { drops: (dir) => dropsAhead(world, fighter, dir) });
      } else {
        orders.runSteer.bend = 0;
        orders.runSteer.speedCap = null;
      }
      fighter.goTo = [pelvis[0] + go[0] * 3, 0, pelvis[2] + go[1] * 3];
      fighter.move = running && !orders.guard ? runMove : pace * slow;
      // A man in his way: the run held to a pace he can brush past him at (runsteer.js).
      if (orders.runSteer.speedCap) fighter.move = Math.min(fighter.move, orders.runSteer.speedCap / runSpeed(fighter, true));
      fighter.running = running && !orders.guard;
    }
    // A run is another gait, not the guard hurrying: the weapon carried, nothing guarded, his heading his own. It costs breath.
    fighter.runMode = fighter.running && !fighter.mount;
    // (A slower run costs less: in proportion to his speed over his sprint.)
    if (fighter.runMode) fighter.stamina = Math.max(0, fighter.stamina - CONTROL.run.staminaPerSecond * Math.max(0, Math.min(1, fighter.move)) * dt / fighter.body.aerobic);
    if (fighter.runMode) fighter.faceFoe = locked;
    return;
  }
  fighter.goTo = null;
  if (!locked || opponent.state !== 'up') {
    fighter.move *= Math.exp(-dt * 6);
    // The stick idle and his man faced inside a long weapon's head: a step back (CONTROL.spacing).
    if (!locked && fighter.faceFoe && keepsRoom(fighter, orders, opponent)) fighter.move = -CONTROL.spacing.pace * slow;
    return;
  }
  // Locked and idle: to the edge of his range, and there he stays (a long weapon never inside its head: CONTROL.spacing).
  if (keepsRoom(fighter, orders, opponent)) {
    fighter.move = -CONTROL.spacing.pace * slow;
    return;
  }
  const distance = Math.hypot(opponent.x[P.pelvis * 3] - pelvis[0], opponent.x[P.pelvis * 3 + 2] - pelvis[2]);
  const hold = holdDistance(fighter, opponent);
  const off = distance - hold;
  if (Math.abs(off) <= CONTROL.hold.slack) fighter.move *= Math.exp(-dt * 6);
  else fighter.move = Math.max(-1, Math.min(1, off * 2)) * slow;
}

/**
 * The player's horse under the stick: its heading is the stick's way on the floor, at the canter (the gallop past the run
 * threshold or with Shift), whether or not he is locked on a man (the lock aims his weapon, his shoulders and the camera, not
 * the horse). The horse turns at its own rate (physics/mounted.js: `spin`, and `lateral` / speed), and is slowed into a turn
 * the harder it is: to the speed it turns sharpest at (lateral / spin) by a right angle off its line (CONTROL.ride.slowFrom on).
 * Snap (CONTROL.ride.snap, off): locked, a way within `snapAngle` of his man goes straight at him.
 */
function rideStick(world, fighter, orders, stick, opponent) {
  const horse = fighter.mount;
  const spec = CONTROL.ride;
  const { deadZone, walkFrom } = CONTROL.stick;
  const pace = walkFrom + (1 - walkFrom) * Math.min(1, Math.max(0, (stick.amount - deadZone) / (spec.canterFrom - deadZone)));
  const gallop = stick.amount >= spec.gallopFrom && !orders.guard;
  let heading = Math.atan2(-stick.dir[1], stick.dir[0]);
  const locked = orders.lock !== null && opponent?.id === orders.lock;
  if (spec.snap && locked) {
    const at = point(opponent.x, P.pelvis);
    const toward = Math.atan2(-(at[2] - horse.at[1]), at[0] - horse.at[0]);
    if (Math.abs(Math.atan2(Math.sin(toward - heading), Math.cos(toward - heading))) < spec.snapAngle) heading = toward;
  }
  let speed = pace * (gallop ? horse.paces.gallop : horse.paces.canter);
  const off = Math.abs(Math.atan2(Math.sin(heading - horse.yaw), Math.cos(heading - horse.yaw)));
  const hard = Math.max(0, Math.min(1, (off - spec.slowFrom) / (Math.PI / 2 - spec.slowFrom)));
  const turning = Math.max(horse.paces.walk, horse.spec.lateral / horse.spec.spin);
  if (speed > turning) speed += (turning - speed) * hard;
  horse.goal = { heading, speed };
  horse.goalAt = world.time;
  fighter.goTo = null;
  fighter.move = 0;
  fighter.strafe = 0;
  fighter.running = gallop;
  fighter.runMode = false;
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
  paths: { straight: [0.3, 0.3], hook: [0.85, 0.35], upper: [0.4, -0.2], elbow: [0.65, 0.62], upElbow: [0.3, 0.75], knee: [0.3, -0.45], teep: [0.15, -0.62], pushBoth: [0, -0.1], aim: [0, 0.1], club: [0.45, 0.85], swipe: [0.95, 0.15] },
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

// ---- What an attack is called -----------------------------------------------
//
// A move's name on screen, and a few words for what it is: the name a
// fighter of its school would use, and the plain English beside it.

export const MOVE_NAMES = {
  jab: ['Jab'], cross: ['Cross'], hook: ['Hook'], rHook: ['Rear hook'], uppercut: ['Uppercut'],
  roundhouse: ['Roundhouse', 'kick'], lowKick: ['Low kick'], spinKick: ['Spinning kick'], teep: ['Teep', 'push kick'],
  knee: ['Knee'], elbow: ['Elbow'], upElbow: ['Rising elbow'], palm: ['Palm strike'], taichiPush: ['Push', 'both hands'],
  tsuppariL: ['Tsuppari', 'left thrust'], tsuppariR: ['Tsuppari', 'right thrust'], oshi: ['Oshi', 'two-hand shove'],
  clubR: ['Club', 'overhead'], clubL: ['Club', 'left overhead'], swipeR: ['Swipe'], swipeL: ['Swipe', 'left'],
  rush: ['Charge'], clinch: ['Clinch'], collarTie: ['Collar tie'], shieldBash: ['Shield bash'],
  overhand: ['Overhand', 'downward blow'], forehand: ['Forehand', 'side cut'], legSwing: ['Leg strike'], poke: ['Poke', 'end thrust'],
  oberhau: ['Oberhau', 'cut from above'], zwerchhau: ['Zwerchhau', 'cross cut'], unterhau: ['Unterhau', 'rising cut'], lunge: ['Lunge', 'thrust'],
  shomen: ['Shōmen', 'overhead cut'], kesagiri: ['Kesagiri', 'diagonal cut'], gyakuKesa: ['Gyaku-kesa', 'reverse diagonal'],
  yokogiri: ['Yokogiri', 'level cut'], kiriage: ['Kiriage', 'rising cut'], tsuki: ['Tsuki', 'thrust'],
  kataShomen: ['Shōmen', 'one hand'], kataKesa: ['Kesagiri', 'one hand'], kataGyaku: ['Gyaku-kesa', 'one hand'], kataYoko: ['Yokogiri', 'one hand'], kataTsuki: ['Tsuki', 'one hand'],
  wakiKesa: ['Kesagiri', 'wakizashi'], wakiTsuki: ['Tsuki', 'wakizashi'], wakiLow: ['Low cut', 'wakizashi'], wakiBeat: ['Uchi-otoshi', 'beat and thrust'],
  kesaTsuki: ['Kesa-tsuki', 'cut and thrust'], jodanGedan: ['Jōdan-gedan', 'high and low'],
  hammerOverhead: ['Hammer', 'overhead'], hammerSide: ['Hammer', 'side blow'], hammerThrust: ['Hammer', 'spike thrust'],
  naginataSweep: ['Sweep', 'low cut'], naginataCut: ['Cut', 'overhead'], naginataRising: ['Rising cut'], naginataThrust: ['Thrust'],
  spearThrust: ['Spear thrust'], spearJab: ['Spear jab'], spearSweep: ['Spear sweep'], spearHigh: ['High thrust'], spearLow: ['Low thrust'], lanceThrust: ['Lance thrust'], lanceHigh: ['Lance at the face'], lanceJab: ['Lance jab'],
  stab: ['Stab'], upStab: ['Rising stab'], highStab: ['High stab'], execute: ['Finisher', 'dagger thrust'],
  gladiusThrust: ['Thrust'], gladiusCut: ['Cut'], swordLunge: ['Lunge'], quickThrust: ['Quick thrust'], flickCut: ['Flick cut'],
  sicaHook: ['Hooked cut'], sicaThrust: ['Thrust'], crescentSlash: ['Crescent slash'], staffButt: ['Butt strike'],
  maceOverhead: ['Mace', 'overhead'], maceSide: ['Mace', 'side blow'], maceOverheadLeft: ['Mace', 'overhead'], maceSideLeft: ['Mace', 'side blow'],
  botCut: ['Blade cut'], botThrust: ['Blade thrust'], botSweep: ['Blade sweep'],
  shoot: ['Shot'], fireLong: ['Shot'], fireRifle: ['Shot'], firePump: ['Shot'], fireVolley: ['Volley'], loose: ['Arrow loosed'],
};

/** A move's name, and a gloss if it has one: { name, gloss }. Unnamed: its key in words ("hammerOverhead" → "Hammer overhead"). */
export function moveName(key) {
  const named = MOVE_NAMES[key];
  if (named) return { name: named[0], gloss: named[1] ?? '' };
  const words = String(key).replace(/([A-Z])/g, ' $1').toLowerCase();
  return { name: words[0].toUpperCase() + words.slice(1), gloss: '' };
}

/** Where an attack goes, in words: its height (by zone) and its side on the pad (x −1 to 1): { height, side, arrow }. */
export function attackWhere(zone, x = 0) {
  const height = zone === 'head' ? 'high' : zone === 'legs' ? 'low' : 'body';
  const side = x < -0.33 ? 'left' : x > 0.33 ? 'right' : 'centre';
  const arrows = { high: { left: '↖', centre: '↑', right: '↗' }, body: { left: '←', centre: '•', right: '→' }, low: { left: '↙', centre: '↓', right: '↘' } };
  return { height, side, arrow: arrows[height][side] };
}

/**
 * How a strike thrown by `attacker` at `since` (world time) went, from the
 * world's events after it: 'hit', 'glance' (off armour), 'blocked' (on a
 * guard or a shield), 'parried' (met by a blade), or null while there is no
 * word yet. `over` (the strike has ended) with no word: 'miss'.
 */
export function strikeOutcome(events, attacker, since, over = false) {
  let outcome = null;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.time < since) break;
    let found = null;
    if (event.kind === 'landed' && event.attacker === attacker) found = event.effects?.some((effect) => /glanced/.test(effect)) ? 'glance' : 'hit';
    else if (event.kind === 'blocked' && event.attacker === attacker) found = 'blocked';
    else if (event.kind === 'bladeBlock' && event.defender === attacker) found = 'parried';
    // The first word after the strike began is the one that counts.
    if (found) outcome = found;
  }
  return outcome ?? (over ? 'miss' : null);
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

/** A place in the air before the fighter, at a zone's height, `share` of his reach out: where a blow goes with nobody there. */
export function airAhead(fighter, zone, share = 1) {
  const hips = point(fighter.x, P.pelvis);
  const forward = yawRotate([1, 0, 0], fighter.yaw);
  const reach = (reachOf(fighter) + fighter.body.lengths.headRadius) * share;
  const height = zone === 'head' ? fighter.x[P.head * 3 + 1] : zone === 'legs' ? hips[1] * 0.6 : fighter.x[P.neck * 3 + 1] - 0.3;
  return [hips[0] + forward[0] * reach, height, hips[2] + forward[2] * reach];
}

/**
 * Who an attack goes at: his enemy if one is engaged (within `foeEngaged` m) or he is locked on one; else whoever stands nearest within
 * `anyoneWithin` m, enemy or not; else the enemy he has (far off), else nobody (the blow goes into the air).
 */
export function attackMark(world, fighter, orders, opponent) {
  if (opponent && (orders.lock !== null || reachBetween(fighter, opponent) <= CONTROL.foeEngaged)) return opponent;
  return nearestAnyone(world, fighter, CONTROL.anyoneWithin) ?? opponent;
}

/** The man Lock takes: the enemy he is on (`foe`), else the nearest man of any side within `lockAnyoneWithin` m (a civilian, a prisoner, a team-mate); null if none. */
export function lockCandidate(world, fighter, foe) {
  return foe ?? nearestAnyone(world, fighter, CONTROL.lockAnyoneWithin);
}

/** The distance on the floor between two men's hips. */
function reachBetween(fighter, other) {
  return Math.hypot(other.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], other.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]);
}

/**
 * An attack asked for while a man lies helpless within reach (and none stands on him): the finisher instead. True if it began.
 * A tap takes a man a few steps off (FINISHER.tapReach): he steps in to him. Only a man lying: one crawling on his hands and
 * knees has his throat up off the floor, level with the hand a kneeling stab starts from, and a belt knife put to it from a
 * kneel met it with nothing behind it (2 of 6 landed); the tap at him is a blow of the player's own, bent down to him
 * (lowOnAttack). The special button still offers the finisher for him.
 */
export function finishOnAttack(world, fighter, orders) {
  if (fighter.punch) return false;
  const prey = finishTarget(world, fighter, { locked: orders.lock, range: FINISHER.tapReach });
  return Boolean(prey) && prey.state === 'down' && startFinisher(world, fighter, prey, { range: FINISHER.tapReach });
}

/**
 * An attack asked for at a man low before him (lying, getting up, on his knees: lowstrike.js), within a few steps: made at his
 * body as it lies, the striker stepping in and bending to it. `mark` is the man the attack would go at. True if it began.
 */
export function lowOnAttack(world, fighter, mark, move, { heavy = false } = {}) {
  if (fighter.punch || fighter.mount) return false;
  return startLowStrike(world, fighter, lowTarget(world, fighter, mark), move, { heavy });
}

/**
 * A strike thrown by a key: at his enemy as before, or with none near at whoever stands nearest within reach, or into the air.
 * Returns whether it was thrown. (The pad and the body tap go through orders.requests, which does the same.)
 */
export function swingAt(world, fighter, orders, name, zone) {
  if (finishOnAttack(world, fighter, orders)) return true;
  const mark = attackMark(world, fighter, orders, opponentFor(world, fighter));
  if (MOVES[name]?.kind === 'strike' && lowOnAttack(world, fighter, mark, name)) return true;
  const spec = MOVES[name];
  if (chargeOrder(world, fighter, orders, mark, name, zone)) return true;
  if (spec?.kind !== 'strike') return throwPunch(world, fighter, name, zone);
  if (mark && (hostile(mark, fighter) || orders.lock === mark.id)) return throwPunch(world, fighter, name, zone);
  if (mark) {
    fighter.faceAt = { at: point(mark.x, P.pelvis), until: world.time + CONTROL.faceSeconds };
    return throwPunch(world, fighter, name, zone, { at: aimPoint(mark, zone) });
  }
  return throwPunch(world, fighter, name, zone, { at: airAhead(fighter, zone) });
}

/**
 * On horseback, an attack asked for at an enemy on his feet is a charge at him (riding.js chargeAt): the rider turns
 * his horse, rides him down on the line that passes him on the weapon side, makes his blow as they pass (leaning out
 * to him: physics/mounted.js saddleReach), rides on through, wheels round to face him, and hands the reins back. A
 * new attack asked for takes another man (or the same again); any movement of the stick or the keys ends it at once
 * (directFighter). Asked for while he steers himself (the stick or keys held), the reins stay his and only the blow
 * is readied, made as he passes the man. A bow or a gun is not charged with (it shoots as on foot). True if ordered.
 */
export function chargeOrder(world, fighter, orders, man, move, zone) {
  const spec = MOVES[move];
  if (!fighter.mount || !man || man.state !== 'up' || !hostile(man, fighter) || spec?.kind !== 'strike' || spec.path === 'aim') return false;
  // (Steering him himself, the stick or the keys held, he keeps the reins: only the blow is readied for the pass.)
  const held = orders.stick ?? orders.keyStick;
  const reins = !(held && held.amount >= CONTROL.stick.deadZone);
  orders.charge = { target: man.id, move, zone, reins, phase: 'charge', struck: false, struckAt: null, at: world.time, end: null };
  return true;
}

/**
 * Carry out the first attack asked for: thrown at once, wherever it is aimed,
 * a man there or not (kept a moment only while the hands are busy). A request
 * carries `at` (a place in the world) or a `line` (at his man).
 */
function attack(world, fighter, orders, opponent) {
  const requests = orders.requests;
  while (requests.length && world.time - requests[0].at > (requests[0].readied ? CONTROL.runStrike.waitSeconds : CONTROL.bufferSeconds)) requests.shift();
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
  // A man helpless on the floor within reach, and none on his feet on him: the attack is the finisher (finisher.js).
  if (finishOnAttack(world, fighter, orders)) {
    requests.shift();
    return;
  }
  opponent = attackMark(world, fighter, orders, opponent);
  // A man low before him (on the floor, getting up, on his knees): the blow goes down to his body as it lies.
  if (!request.point && (!request.move || MOVES[request.move]?.kind === 'strike')) {
    const wanted = request.move ?? chooseAttack(world, fighter, opponent, request.line ?? 'mid', request.strength)?.move;
    if (wanted && lowOnAttack(world, fighter, opponent, wanted, { heavy: request.strength === 'heavy' })) {
      requests.shift();
      return;
    }
  }
  if (request.move) {
    if (runStrikeWaits(fighter, request, opponent)) return;
    if (!chargeOrder(world, fighter, orders, opponent, request.move, request.zone)) padAttack(world, fighter, request, opponent);
    requests.shift();
    return;
  }
  // (With nobody to strike at, the blow still goes: into the air before him, at the height of its line.)
  const aim = request.point ?? (opponent ? null : airAhead(fighter, request.line === 'low' ? 'legs' : request.line === 'high' ? 'head' : 'body', 1));
  const man = aim ? manNear(world, fighter, aim, WORLD.aimedAtWithin) : opponent;
  const line = aim ? lineFor(fighter, aim, man) : request.line;
  const chosen = chooseAttack(world, fighter, man, line, request.strength, aim);
  requests.shift();
  if (!chosen || chargeOrder(world, fighter, orders, man, chosen.move, chosen.zone)) return;
  if (aim) fighter.faceAt = { at: aim, until: world.time + CONTROL.faceSeconds };
  // A rush or a clinch goes at the man; a strike at the place.
  // (A man who is no enemy is struck at as the place he is: throwPunch's own man is an enemy.)
  const at = aim ?? (man && !hostile(man, fighter) ? aimPoint(man, chosen.zone) : null);
  const thrown = MOVES[chosen.move].kind === 'strike' ? throwPunch(world, fighter, chosen.move, chosen.zone, { heavy: chosen.heavy, at }) : throwPunch(world, fighter, chosen.move);
  if (thrown) {
    fighter.orderCombo = chosen.combo;
    fighter.orderComboZone = chosen.zone;
    fighter.orderComboAt = at;
    fighter.orderAt = world.time;
  }
}

/** The reach of a pad move at his man (m, hips to hips): the move's range, his head, a lunge's step (`step` false: in a run, the run is the step). */
function padReach(fighter, spec, step = true) {
  const held = fighter.weapon?.held ? fighter.weapon.spec : null;
  return moveRange(spec, fighter.body, held) + fighter.body.lengths.headRadius + (step ? (spec.step ?? 0) * CONTROL.padStepReach : 0);
}

/**
 * A blow asked for in his run at an enemy ahead that he closes on (CONTROL.runStrike): true while it is readied, kept until he
 * will be at its reach as it comes out.
 */
function runStrikeWaits(fighter, request, man) {
  const spec = MOVES[request.move];
  if (!fighter.runMode || spec?.kind !== 'strike' || spec.path === 'aim' || !man || man.state !== 'up' || !hostile(man, fighter)) return false;
  const closing = closingBy(fighter, man, spec);
  if (closing <= 0) return false;
  // (No lunge's step: the run carries him in, and closingBy has it.)
  const waits = reachBetween(fighter, man) > padReach(fighter, spec, false) + closing;
  request.readied = waits;
  return waits;
}

/**
 * A move from the pad: at his man if he is within its reach (a lunge's or a
 * charge's further), else into the air before him at the zone's height.
 */
function padAttack(world, fighter, request, opponent) {
  const spec = MOVES[request.move];
  const style = STYLES[fighter.style];
  if (!spec) return;
  const hips = point(fighter.x, P.pelvis);
  let at = null;
  if (spec.kind === 'strike') {
    const reach = padReach(fighter, spec);
    const forward = yawRotate([1, 0, 0], fighter.yaw);
    const near = opponent && opponent.state === 'up' && Math.hypot(opponent.x[P.pelvis * 3] - hips[0], opponent.x[P.pelvis * 3 + 2] - hips[2]) <= reach + CONTROL.padSlack + closingBy(fighter, opponent, spec);
    // A gun fires at its man wherever he is; with nobody there, it fires ahead.
    if (!near && (spec.path !== 'aim' || !opponent)) {
      const height = request.zone === 'head' ? fighter.x[P.head * 3 + 1] : request.zone === 'legs' ? hips[1] * 0.6 : fighter.x[P.neck * 3 + 1] - 0.3;
      // (In a run, the place he will be when the blow is out.)
      const ahead = reach + closingBy(fighter, null, spec);
      at = [hips[0] + forward[0] * ahead, height, hips[2] + forward[2] * ahead];
    }
  } else if (!opponent) return;
  const combo = request.strength === 'combo' && spec.kind === 'strike' ? comboAfter(style, request.move, []) : null;
  // A man who is no enemy (a civilian, a team-mate) struck at: he turns to him.
  if (opponent && !hostile(opponent, fighter)) fighter.faceAt = { at: point(opponent.x, P.pelvis), until: world.time + CONTROL.faceSeconds };
  // (He is thrown at as the place he is: throwPunch's own man is an enemy.)
  if (!at && spec.kind === 'strike' && opponent && !hostile(opponent, fighter)) at = aimPoint(opponent, request.zone);
  const thrown = spec.kind === 'strike' ? throwPunch(world, fighter, request.move, request.zone, { at }) : throwPunch(world, fighter, request.move);
  if (thrown) {
    fighter.orderCombo = combo;
    fighter.orderComboZone = request.zone;
    fighter.orderComboAt = at;
    fighter.orderAt = world.time;
  }
}

/**
 * How much nearer (m) a man comes (or, with none, how far on he goes) by the time a blow is out (the move's `extendUntil`): the
 * speed he closes at, along the line between them, over that time. Standing it is nothing; in a run it is the run's metres.
 */
function closingBy(fighter, man, spec) {
  const at = point(fighter.x, P.pelvis);
  const forward = yawRotate([1, 0, 0], fighter.yaw);
  let way = [forward[0], forward[2]];
  if (man) {
    const to = [man.x[P.pelvis * 3] - at[0], man.x[P.pelvis * 3 + 2] - at[2]];
    const length = Math.hypot(to[0], to[1]);
    if (length > 1e-6) way = [to[0] / length, to[1] / length];
  }
  const his = man?.rootVelocity ?? [0, 0];
  const closing = (fighter.rootVelocity[0] - his[0]) * way[0] + (fighter.rootVelocity[1] - his[1]) * way[1];
  return Math.max(0, closing) * (spec.extendUntil ?? 0);
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
  // (What it costs, held and per blow on it: physics.js, as anyone's guard.)
  fighter.guardHeld = Boolean(orders.guard);
  if (orders.guard) holdGuard(world, fighter, world.fighters.find((other) => other.corner !== fighter.corner && other.punch?.target === fighter.id));
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
  crawl: { label: 'Crawl', icon: '🐾' },
  stand: { label: 'Stand', icon: '⤒' },
  finish: { label: 'Finish him', icon: '🔪' },
  // His weapon's art (weaponarts.js), with his blood up: the button names it (weaponarts.js artLabel).
  art: { label: 'Weapon art', icon: '✦' },
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
  // On his knees: up again, if his legs will bear him.
  if (fighter.crawling) return legBroken(fighter) ? null : 'stand';
  const style = STYLES[fighter.style];
  if (fighter.clinch) return style?.throws || style?.clinchDrive ? 'throw' : 'disengage';
  if (holder(world, fighter)) return 'disengage';
  // A man helpless on the floor within reach and none on his feet on him: the finisher (finisher.js).
  if (finishTarget(world, fighter, { locked: fighter.focus })) return 'finish';
  const weapon = fighter.weapon?.held ? fighter.weapon : null;
  const opponent = opponentFor(world, fighter);
  const distance = opponent ? vec.length(vec.sub(point(opponent.x, P.pelvis), point(fighter.x, P.pelvis))) : Infinity;
  // His blood up and his man before him: his weapon's art (weaponarts.js; never a gun's or a bow's).
  if (fighter.player && artReady(fighter) && artTarget(world, fighter)) return 'art';
  if (weapon?.spec.ranged && !weapon.spent) {
    const sidearm = fighter.body.gear.sidearm && !fighter.sidearmDrawn;
    if (sidearm && distance < (style?.ranged?.close ?? 1.5) + 0.5) return 'drawSidearm';
    if (weapon.spec.shot && !weapon.loaded) return fighter.reloading ? null : 'reload';
    return 'fire';
  }
  if (looseNearby(world, fighter)) return 'pickUp';
  // Within striking range: pressed, he steps in to take hold (goClinch).
  if (clinchMove(style) && opponent?.state === 'up' && distance < holdDistance(fighter, opponent) + CONTROL.clinchFrom) return 'clinch';
  // Badly hurt (or the legs going) with nothing else to do: down on his knees to crawl.
  if (Math.max(hurtShare(fighter), legShare(fighter)) > CONTROL.crawlOfferFrom) return 'crawl';
  return null;
}

/**
 * The player down on his knees to crawl (what is in his hands let go), or
 * up again: his own choice, so he is still in the fight. Any time, by key;
 * the special button offers it once he is hurt. False if it cannot be done.
 */
export function playerCrawl(world, fighter, on) {
  if (!fighter || fighter.state !== 'up' || fighter.netted || fighter.mount || fighter.jump) return false;
  if (on) {
    if (fighter.crawling) return false;
    fighter.crawlChosen = true;
    // (His own choice: what is in his hands he keeps.)
    return startCrawl(world, fighter, 'goes down on his knees', { keep: true });
  }
  if (!fighter.crawling || legBroken(fighter)) return false;
  // Up from his knees in stages, as his legs can lift him (physics/rising.js: a foot brought through, then up; slower the weaker
  // he is for his weight). Legs that will not bear him now leave him on his knees.
  if (!retryFromKnees(world, fighter)) return false;
  world.events.push({ time: world.time, kind: 'stand', fighter: fighter.id, effects: ['gets up off his knees'] });
  return true;
}

/**
 * The Crawl button (and C): down on his knees, or up again. Down only when he is not locked on a man (the lock is a fight; a
 * crawl is a way of going about). Returns whether anything happened.
 */
export function toggleCrawl(world, fighter, orders) {
  if (!fighter) return false;
  if (fighter.crawling) return playerCrawl(world, fighter, false);
  if (orders?.lock !== null && orders?.lock !== undefined) return false;
  return playerCrawl(world, fighter, true);
}

/** Whether the Crawl button can be pressed now (lit while he crawls; dimmed while locked on, or when he cannot get down or up). */
export function crawlReady(world, fighter, orders) {
  if (!fighter || fighter.state !== 'up' || fighter.netted || fighter.mount || fighter.jump) return false;
  if (fighter.crawling) return !legBroken(fighter);
  return orders?.lock === null || orders?.lock === undefined;
}

/**
 * Whether the floor under him or just ahead along his way climbs steeply (a flight of stairs, a ladder laid down, a steep ramp):
 * past CONTROL.crawlSteep of rise over run, over CONTROL.crawlLook m.
 */
function steepUnder(world, fighter) {
  const terrain = world.arena?.terrain;
  if (!terrain) return false;
  const [x, y, z] = point(fighter.x, P.pelvis);
  const here = floorAt(terrain, x, z, y);
  if (here === -Infinity) return false;
  const speed = Math.hypot(fighter.rootVelocity[0], fighter.rootVelocity[1]);
  const way = speed > 0.05 ? [fighter.rootVelocity[0] / speed, fighter.rootVelocity[1] / speed] : [Math.cos(fighter.yaw), -Math.sin(fighter.yaw)];
  const look = CONTROL.crawlLook;
  for (const reach of [look * 0.5, look]) {
    const ahead = floorAt(terrain, x + way[0] * reach, z + way[1] * reach, y + WORLD.terrain.stepUp);
    if (ahead > -Infinity && Math.abs(ahead - here) / reach > CONTROL.crawlSteep) return true;
  }
  return false;
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
  if (name === 'crawl' || name === 'stand') return playerCrawl(world, fighter, name === 'crawl');
  if (name === 'art') return startArt(world, fighter);
  if (name === 'finish') {
    const prey = finishTarget(world, fighter, { locked: fighter.focus });
    return Boolean(prey) && !fighter.punch && startFinisher(world, fighter, prey);
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
  // (In a stage, what he holds of that kind is let fall for it: looting a body.)
  startPickup(world, fighter, debris, { swap: Boolean(world.stage) });
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
  // The man whose mind this is is the player: he has the stamina overdraft (physics/overdraft.js), nobody else does.
  fighter.player = true;
  // His adrenaline: the fight's surges, danger near, and the fade (weaponarts.js; an AI man's is ai.js's).
  feelAdrenaline(world, fighter, dt);
  // Down on his knees over a man, a dagger going in: that holds him until it is done or he is struck (finisher.js).
  if (fighter.finisher && updateFinisher(world, fighter, dt)) {
    orders.requests.length = 0;
    orders.actions = [];
    return;
  }
  // Bent to a man low before him, the blow going down to him: that holds him until it is made (lowstrike.js).
  if (fighter.lowStrike && updateLowStrike(world, fighter, dt)) {
    orders.actions = [];
    return;
  }
  // The man locked on is the man he fights; a lock on a man out of the fight lets go.
  const locked = orders.lock !== null ? world.fighters[orders.lock] : null;
  if (locked && !inFight(locked)) orders.lock = null;
  // Locked on while crawling by his own choice: he gets up to fight (the staged rise).
  if (orders.lock !== null && fighter.crawling && fighter.crawlChosen) playerCrawl(world, fighter, false);
  // On his knees on a stair, a steep ramp or a ladder: he gets up to climb it (a man does not crawl up a ladder).
  if (fighter.crawling && fighter.crawlChosen && steepUnder(world, fighter)) playerCrawl(world, fighter, false);
  // Jump asked (the Jump button, Space): he jumps if his body can (physics/jump.js).
  if (orders.jump) {
    orders.jump = false;
    startJump(world, fighter);
  }
  // A charge ordered on horseback (chargeOrder) ends with any movement asked for, or with him off his horse or down.
  if (orders.charge) {
    const held = orders.stick ?? orders.keyStick;
    if (!fighter.mount || fighter.state !== 'up' || (orders.charge.reins && held && held.amount >= CONTROL.stick.deadZone)) {
      orders.charged = { ...orders.charge, end: fighter.mount && fighter.state === 'up' ? 'cancelled' : 'unhorsed' };
      orders.charge = null;
    }
  }
  fighter.focus = orders.lock ?? orders.charge?.target ?? undefined;
  // Locked on a man who is no enemy (a civilian, a team-mate): he is still the man he fights, for his blows and his facing.
  fighter.focusAny = Boolean(locked) && orders.lock !== null && !hostile(locked, fighter);
  fighter.faceFoe = facesFoe(world, fighter, orders);
  fighter.runMode = false;
  fighter.guardHeld = false;
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
  // Charging (chargeOrder): the horse is ridden at his man by the charge, not the stick; over, the reins are the player's.
  if (!orders.charge?.reins && !goClinch(world, fighter, opponent)) steer(world, fighter, orders, opponent, dt);
  if (orders.charge && !chargeAt(world, fighter, orders.charge)) {
    // (Kept, with how it ended, for the screen and the tests.)
    orders.charged = orders.charge;
    orders.charge = null;
  }
  // Running, nothing is guarded, and a block he held when it began comes down (the guard asked for ends the run first: runStep).
  // A blow asked for is made in the run: he runs on into it.
  if (fighter.runMode) {
    if (BLOCKS.has(fighter.defence?.name)) fighter.defence = null;
    continueCombo(world, fighter);
    attack(world, fighter, orders, opponent);
    return;
  }
  defend(world, fighter, orders);
  continueCombo(world, fighter);
  attack(world, fighter, orders, opponent);
}
