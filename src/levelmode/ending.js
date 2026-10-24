// Level mode, the ending: what happens once the boss is out, and the plot twist. The screen plays the boss's cutscene (cutscene.js,
// cutsceneview.js), then the doors behind the altar open (a mechanism) and a guide leads to the back room. It is a garderobe, a privy, and the
// prince is not in it: the words come up ("Prince Caby is not here. Let's escape.") and the Queen's men pour into the chapel, more than any man
// could fight (a held crowd, stage.js `hold`). The privy's chute is the way out: at its hole the context button offers the drop, and he falls
// through the rock into the cesspool he came in by (the sewer's DN_CESSPOOL), the sludge taking the fall (a bruise, a big splash). The thing
// in the cesspool, Noname, was the prince all along: if the player killed him on the way in, he lies there, his helmet off; if not, he comes
// at the player out of the sludge and has to be killed first (his helmet comes off as he dies: level.js dropHelmets). Then the reveal: the
// player kneels by the body on the island, holds it, puts the helmet on and says "I will stay with you together", and plays on as the new
// Noname for a short epilogue (a few of the Queen's men come down the drain in waves, also held until then) before the ending cards.
//
// The run's `ending` is { phase, since, ... }:
//   'locked'    the boss stands
//   'felled'    he is out: the cutscene plays (the player is held while it does, `held`); a world with no screen opens the door itself
//               after ENDING_WAIT.headless s
//   'open'      the doors are open; the guide runs to the back room. Walking into it (`toilet`) begins:
//   'horde'     the words; the crowd let go a row at a time (TWIST.horde); the hole offers the drop ('Drop down the garderobe', even with men
//               about him). A death here is a failed attempt: he wakes at the last rest, the boss still dead, the door still open, the crowd
//               held again (checkpoints.js), and the phase is 'open' again
//   'fall'      in the chute: out of sight and held (TWIST.fall s), then put over the sludge under the grating to drop in (`landing`)
//   'landing'   in the cesspool, on his feet, bruised. Noname alive: he hunts the player, and a death is as in 'horde' (back to 'open');
//               Noname dead (now or before): a breath, then
//   'reveal'    the body laid face up on the island with the helmet by its head; the player held, kneeling by it (physics `kneel`): he holds
//               it, takes the helmet up, puts it on (outfit.helm: it is his from now on), the words; the screen frames it (cutsceneview.js)
//               but the beats are the world's clock (TWIST.reveal), so a world with no screen plays it the same
//   'epilogue'  he is the new Noname: control back, the men of the epilogue let go in the drain wave by wave; it ends when the last wave
//               is down, or after the stage's `seconds`, or with his death (no respawn: the game ends there)
//   'done'      the ending cards are asked for (`{ type: 'ending' }`); the finale follows them (main.js)
// Once the reveal has played it is final: nothing puts the phase back.
// Stage data (stage.ending; Dunnottar's is dunnottar-chapel.js DN_ENDING):
//   { door: mechanism id, toilet: region, hole: { at, reach }, landing: { at, drop, yaw }, caby: { at, yaw, kneel }, noname: spawn id,
//     horde: hold name, epilogue: { hold, seconds, waves: [{ at, from, men }] } }
// No DOM here: the screen is told through the level's `ui` queue ({ type: 'toast' } | { type: 'bossDown' } | { type: 'doorsOpen' }
// | { type: 'horde' } | { type: 'fall' } | { type: 'landed' } | { type: 'reveal' } | { type: 'line', text } (a spoken line, the reveal's) | { type: 'epilogue' }
// | { type: 'ending', outcome }).

import { P } from '../body.js';
import { addDamage, knockOut, placeOnFloor, reclothe, reviveFighter, toLocal, toWorld } from '../physics.js';
import { outfitOf } from '../outfits.js';
import { rouse } from './awareness.js';
import { CUTSCENE } from './cutscene.js';
import { holdPlayer, levelOf, say } from './items.js';
import { heldMen, regionContains, releaseHeld, setMechanism, updateStage } from './stage.js';
import { pinPoints } from '../physics/grappling.js';

export const ENDING_WAIT = {
  // s of the world's clock the door waits after the boss is out in a world with no screen to play the cutscene (the fall, and a breath).
  headless: 1.5,
};

/** The twist's words and timings (s of the world's clock), each with its reason. */
export const TWIST = {
  words: {
    empty: "Prince Caby is not here. Let's escape.",
    drop: 'Drop down the garderobe',
    stay: 'I will stay with you together.',
    noname: 'You are the new Noname',
    landed: 'The cesspool. Something moves in the sludge.',
  },
  // The crowd: the first row is let go `first` s after the words, then a row every `every` s (six rows: all in by about 4 s). They come from the
  // great door, 25 m off: the first reach the back room 6 to 9 s after the words, and the hole is 5 m in from its door: time to go, none to win.
  horde: { first: 0.5, every: 0.75, burst: 6 },
  // In the chute (the screen's dark): long enough to feel the drop, short enough to be a cut.
  fall: { seconds: 1.0 },
  // The landing: what the sludge leaves of a fall of 19 m through a chute (a bruise: m/s of a blow's speed to the trunk, and to each shank); and
  // the breath before the reveal when Noname is already dead (he gets up and sees him) or has just died (he sees the face).
  landing: { trunk: 1.5, shank: 2.5, beat: 1.4, after: 2.2 },
  // The reveal's beats, s from its start: the cut (the screen goes dark for it: the body is laid out and the player put beside it); knelt by him;
  // holding him; reaching for the helmet; lifting it to his head; on; the words; the hands down; up on his feet, and control back. About 11 s:
  // the cutscene before it was 7.
  reveal: { cut: 0.4, kneel: 1.3, hug: 1.5, reach: 5.6, lift: 6.6, on: 8.0, line: 8.4, rest: 8.8, rise: 11.4 },
  // The epilogue: s after its last wave is down that it ends (the last man has fallen; a breath).
  epilogue: { cleared: 3 },
};

const hip = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 1], fighter.x[P.pelvis * 3 + 2]];
const smooth = (u) => {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, u) => a.map((value, at) => value + (b[at] - value) * u);

/** The ending's state for a run (null in a stage with no ending). */
export const endingOf = (world) => levelOf(world)?.ending ?? null;

/** Whether the ending holds the player where he stands: the boss's cutscene, the chute, the reveal, the cards. */
export const endingBusy = (world) => {
  const ending = endingOf(world);
  return Boolean(ending?.held) || ['fall', 'reveal', 'done'].includes(ending?.phase);
};

/** Whether the run is past the point of no return (the reveal has played): a death ends the game rather than waking at a rest. */
export const endingFinal = (world) => ['reveal', 'epilogue', 'done'].includes(endingOf(world)?.phase);

/** Noname (the stage's `ending.noname` spawn), if the stage has him. */
export function nonameOf(world) {
  const id = world.stage.def.ending?.noname;
  return id ? world.fighters.find((fighter) => fighter.spawn?.id === id) ?? null : null;
}

/** The boss, struck down by hand (a debug hook, and the tests': he lies where he stands). True if he was standing. */
export function killBoss(world) {
  const level = levelOf(world);
  const boss = level?.boss && world.fighters[level.boss.id];
  if (!boss || boss.state === 'out') return false;
  knockOut(world, boss, { time: world.time, effects: [] }, 'is struck down', 'killed');
  return true;
}

/** Noname struck down by hand where he stands (a debug hook, and the tests': the sewer gone through first). True if he was standing. */
export function killNoname(world) {
  const noname = nonameOf(world);
  if (!noname || noname.state === 'out') return false;
  knockOut(world, noname, { time: world.time, effects: [] }, 'is struck down', 'killed');
  return true;
}

/** The screen has taken the cutscene (it will say when it is through): the world does not open the door by itself. */
export function endingWatched(world) {
  const ending = endingOf(world);
  if (ending) ending.watched = true;
}

/** The cutscene holds the player where he stands, or lets him go. */
export function endingHold(world, held) {
  const ending = endingOf(world);
  if (ending) ending.held = Boolean(held);
}

/** The cutscene is through (or the run has begun again): the player is free and the back room's door is open. True if it opened the door now. */
export function endingRelease(world) {
  const level = levelOf(world);
  const def = world.stage.def.ending;
  const ending = level?.ending;
  if (!ending || !def) return false;
  ending.held = false;
  if (ending.phase !== 'felled') return false;
  ending.phase = 'open';
  setMechanism(world, def.door, 'open');
  level.opened.add(def.door);
  say(world, { type: 'doorsOpen' });
  say(world, { type: 'toast', text: CUTSCENE.words.toast });
  return true;
}

/**
 * He has woken at a rest after a death in the horde or in the cesspool (checkpoints.js respawnPlayer; the crowd is held again there): the back
 * room is as it was when he first found it open. True if the phase went back.
 */
export function endingRespawn(world) {
  const ending = endingOf(world);
  if (!ending || !['horde', 'fall', 'landing'].includes(ending.phase)) return false;
  Object.assign(ending, { phase: 'open', since: world.time, released: 0, landedAt: undefined, nonameDownAt: undefined, nonameAlive: undefined, helmet: undefined });
  const me = world.fighters[0];
  me.kneel = undefined;
  return true;
}

/** Where the door's leaf is (its first closed solid's `at`, on the floor of the gate's `at`), else the gate's `at`. */
function doorPoint(world, id) {
  const gate = world.stage.def.sections.flatMap((section) => section.gates ?? []).find((each) => each.id === id);
  if (!gate) return null;
  const leaf = gate.states?.closed?.find((solid) => solid.at)?.at;
  return [leaf ? leaf[0] : gate.at[0], gate.at[1], leaf ? leaf[leaf.length - 1] : gate.at[2]];
}

/**
 * Where the guide leads, from stage data: { beacon: [x, y, z] (the glow over where to go), from, to: [x, y, z] (the way-marks between them, on the floor) },
 * or null. Open: from the back room's door to the privy's hole, the glow over the door; the horde: the glow over the hole, no marks.
 */
export function guideOf(world) {
  const def = world.stage.def.ending;
  const phase = endingOf(world)?.phase;
  if (!def?.hole || !['open', 'horde'].includes(phase)) return null;
  const door = doorPoint(world, def.door);
  const hole = [...def.hole.at];
  if (phase === 'horde' || !door) return { beacon: hole, from: hole, to: hole };
  return { beacon: door, from: door, to: hole };
}

/** The drop, offered at the hole while the crowd comes (interact.js): `urgent`, so it is offered with men about him. [] when not. */
export function endingInteractions(world) {
  const def = world.stage.def.ending;
  const ending = endingOf(world);
  if (!def?.hole || ending?.phase !== 'horde') return [];
  const me = world.fighters[0];
  const [x, y, z] = def.hole.at;
  const distance = Math.hypot(me.x[P.pelvis * 3] - x, me.x[P.pelvis * 3 + 2] - z);
  if (distance > def.hole.reach || Math.abs(me.x[P.pelvis * 3 + 1] - y) > 2) return [];
  return [{ id: 'ending:drop', kind: 'drop', label: TWIST.words.drop, icon: 'hand', distance, urgent: true, run: (w) => dropDown(w) }];
}

/** Into the chute: the player is out of sight and held (dormant: not simulated or drawn) for the fall. True if he went. */
export function dropDown(world) {
  const ending = endingOf(world);
  const me = world.fighters[0];
  if (ending?.phase !== 'horde' || me.state !== 'up') return false;
  ending.phase = 'fall';
  ending.since = world.time;
  me.punch = null;
  me.pickup = null;
  me.clinch = null;
  holdPlayer(me);
  me.dormant = true;
  world.events.push({ time: world.time, kind: 'drop', fighter: 0, effects: ['drops down the garderobe'] });
  say(world, { type: 'fall' });
  return true;
}

/**
 * Out of the chute: over the sludge under the grating, `drop` m over the bed, falling (a fall that short is no harm on the feet: physics landOnFeet's
 * `safe`; the sludge is the rest of it): the bruise of the chute (TWIST.landing), the cesspool's section awake. Noname alive is sent at him.
 */
function landInCesspool(world) {
  const def = world.stage.def.ending;
  const ending = endingOf(world);
  const me = world.fighters[0];
  const [x, y, z] = def.landing.at;
  me.dormant = undefined;
  placeOnFloor(me, x, z, y + def.landing.drop, def.landing.yaw ?? me.yaw);
  me.prev.set(me.x);
  me.v.fill(0);
  me.rootVelocity = [0, 0];
  addDamage(me, 'trunk', TWIST.landing.trunk, false, 0);
  addDamage(me, 'lShank', TWIST.landing.shank, false, 0);
  addDamage(me, 'rShank', TWIST.landing.shank, false, 0);
  ending.phase = 'landing';
  ending.since = world.time;
  ending.landedAt = world.time;
  updateStage(world, true);
  const noname = nonameOf(world);
  if (noname && noname.state !== 'out') {
    ending.nonameAlive = true;
    rouse(world, noname.id);
    say(world, { type: 'toast', text: TWIST.words.landed });
  } else {
    ending.nonameAlive = false;
    // (Dead before: he lies on the island now, so that the first thing seen is him.)
    if (noname) ending.helmet = layCaby(world, noname).id;
  }
  world.events.push({ time: world.time, kind: 'landed', fighter: 0, effects: ['lands in the cesspool'] });
  say(world, { type: 'landed' });
}

/**
 * Caby's body laid out for the reveal: made new where the stage says (`caby.at`, his head the way of `caby.yaw`), turned onto his back (a standing pose
 * swung back a quarter turn about his hips: the face up), out and still; the helmet by his head (`level.dropped`, made if his death did not leave one).
 */
export function layCaby(world, noname) {
  const level = levelOf(world);
  const def = world.stage.def.ending;
  const [ax, ay, az] = def.caby.at;
  const head = def.caby.yaw ?? 0;
  const inputs = { ...noname.body.inputs, outfit: { ...noname.body.inputs.outfit, bareHead: true } };
  // Standing facing away from where his head is to lie: falling back, the head goes the other way.
  reviveFighter(world, noname, inputs, { at: [ax, ay, az], yaw: head + Math.PI });
  const forward = [Math.cos(head + Math.PI), -Math.sin(head + Math.PI)];
  const x = noname.x;
  const pelvis = hip(noname);
  for (let index = 0; index < x.length / 3; index += 1) {
    const dx = x[index * 3] - pelvis[0];
    const dy = x[index * 3 + 1] - pelvis[1];
    const dz = x[index * 3 + 2] - pelvis[2];
    const along = dx * forward[0] + dz * forward[1];
    const side = [dx - along * forward[0], dz - along * forward[1]];
    // Up becomes back along his facing (the head the way it lies); forward becomes up (the face to the vault).
    x[index * 3] = pelvis[0] + side[0] - dy * forward[0];
    x[index * 3 + 1] = along;
    x[index * 3 + 2] = pelvis[2] + side[1] - dy * forward[1];
  }
  // On the stone: the lowest of him at its top.
  let low = Infinity;
  for (let index = 0; index < x.length / 3; index += 1) low = Math.min(low, x[index * 3 + 1] - noname.radius[index]);
  for (let index = 1; index < x.length; index += 3) x[index] += ay - low;
  noname.prev.set(x);
  noname.v.fill(0);
  noname.lift = ay;
  knockOut(world, noname, { time: world.time, effects: [] }, 'lies on the island', 'killed');
  noname.outFor = 0;
  level.rebuild.add(noname.id);
  // The helmet by his head, on the island's stone.
  const [hx, , hz] = [x[P.head * 3], 0, x[P.head * 3 + 2]];
  const side = [-forward[1], forward[0]];
  const at = [hx + side[0] * 0.38 - forward[0] * 0.1, ay, hz + side[1] * 0.38 - forward[1] * 0.1];
  level.dropped ??= [];
  let helmet = level.dropped.find((thing) => thing.owner === noname.spawn?.id && thing.kind === 'helmet');
  if (!helmet) {
    helmet = { id: `helmet:${noname.spawn?.id ?? noname.id}`, kind: 'helmet', owner: noname.spawn?.id ?? null, head: { ...outfitOf({ ...inputs, outfit: { ...inputs.outfit, bareHead: false } }).look.head } };
    level.dropped.push(helmet);
  }
  helmet.at = at;
  helmet.yaw = head + Math.PI / 2;
  return helmet;
}

/** Each step: the boss out begins the cutscene (the door opens when it is through); then the back room, the crowd, the chute, the cesspool, the reveal, the epilogue. */
export function watchEnding(world) {
  const level = levelOf(world);
  const def = world.stage.def.ending;
  const ending = level?.ending;
  if (!def || !ending || ending.phase === 'done' || !level.boss) return;
  const me = world.fighters[0];
  const t = world.time - (ending.since ?? 0);
  switch (ending.phase) {
    case 'locked':
      if (world.fighters[level.boss.id].state !== 'out') return;
      ending.phase = 'felled';
      ending.since = world.time;
      say(world, { type: 'bossDown' });
      return;
    case 'felled':
      if (!ending.watched && t >= ENDING_WAIT.headless) endingRelease(world);
      return;
    case 'open': {
      const [x, y, z] = hip(me);
      if (me.state !== 'up' || !regionContains(def.toilet, x, z, y)) return;
      ending.phase = 'horde';
      ending.since = world.time;
      ending.released = 0;
      say(world, { type: 'line', text: TWIST.words.empty });
      say(world, { type: 'horde' });
      world.events.push({ time: world.time, kind: 'horde', fighter: 0, effects: ['the back room is empty: the Queen\'s men come'] });
      return;
    }
    case 'horde':
      releaseHorde(world, def, ending, t);
      return;
    case 'fall':
      if (t >= TWIST.fall.seconds) landInCesspool(world);
      return;
    case 'landing': {
      const noname = nonameOf(world);
      if (ending.nonameAlive && noname && noname.state !== 'out') return;
      ending.nonameDownAt ??= world.time;
      if (world.time - ending.nonameDownAt < (ending.nonameAlive ? TWIST.landing.after : TWIST.landing.beat)) return;
      beginReveal(world);
      return;
    }
    case 'reveal':
      stepReveal(world, ending, t);
      return;
    case 'epilogue':
      stepEpilogue(world, def, ending, t);
      return;
    default:
  }
}

/** The crowd, a row of the grid at a time (stage.js heldMen: in the stage's order, which is the grid's from the inside row out), each sent at him. */
function releaseHorde(world, def, ending, t) {
  const { first, every, burst } = TWIST.horde;
  if (t < first) return;
  const due = burst * (1 + Math.floor((t - first) / every));
  while (ending.released < due) {
    const fighter = heldMen(world, def.horde)[0];
    if (!fighter) return;
    releaseHeld(world, fighter);
    rouse(world, fighter.id, { post: hip(fighter), way: def.way ?? null });
    ending.released += 1;
  }
}

/** The reveal begins: held where he stands; the screen goes dark for the cut (stepReveal sets the scene at its `cut`). */
function beginReveal(world) {
  const ending = endingOf(world);
  ending.phase = 'reveal';
  ending.since = world.time;
  ending.posed = false;
  holdPlayer(world.fighters[0]);
  say(world, { type: 'reveal' });
  world.events.push({ time: world.time, kind: 'reveal', fighter: 0, effects: ['Noname was the prince'] });
}

/** The scene of the reveal, set in the dark of the cut: the body on the island, the player kneeling by it, facing it. */
function poseReveal(world, noname) {
  const def = world.stage.def.ending;
  const ending = endingOf(world);
  const me = world.fighters[0];
  ending.posed = true;
  // (Laid out already if he was dead before: as he lies.)
  const helmet = !noname ? null : ending.helmet ? levelOf(world).dropped?.find((thing) => thing.id === ending.helmet) ?? null : layCaby(world, noname);
  ending.helmet = helmet?.id ?? null;
  ending.helmetFrom = helmet ? [...helmet.at] : null;
  const [kx, ky, kz] = def.caby.kneel;
  const body = noname ? hip(noname) : [kx + 1, ky, kz];
  holdPlayer(me);
  me.runMode = false;
  me.punch = null;
  me.clinch = null;
  me.pickup = null;
  placeOnFloor(me, kx, kz, ky, Math.atan2(-(body[2] - kz), body[0] - kx));
  me.prev.set(me.x);
  me.v.fill(0);
  me.kneel = { share: 0 };
}

/** The reveal's beats (TWIST.reveal): the kneel, the embrace, the helmet up and on, the words, the rise. */
function stepReveal(world, ending, t) {
  const level = levelOf(world);
  const beats = TWIST.reveal;
  const me = world.fighters[0];
  const noname = nonameOf(world);
  holdPlayer(me);
  if (t >= beats.rise) {
    me.kneel = undefined;
    ending.phase = 'epilogue';
    ending.since = world.time;
    ending.wave = 0;
    ending.waveMen = [];
    say(world, { type: 'toast', text: TWIST.words.noname });
    say(world, { type: 'epilogue' });
    world.events.push({ time: world.time, kind: 'epilogue', fighter: 0, effects: ['the new Noname'] });
    return;
  }
  if (t < beats.cut) return;
  if (!ending.posed) poseReveal(world, noname);
  const kneel = (me.kneel ??= { share: 0 });
  kneel.share = smooth((t - beats.cut) / (beats.kneel - beats.cut));
  const helmet = level.dropped?.find((thing) => thing.id === ending.helmet) ?? null;
  const head = [me.x[P.head * 3], me.x[P.head * 3 + 1], me.x[P.head * 3 + 2]];
  const local = toLocal(me, head);
  const atHead = [toWorld(me, [local[0] + 0.06, local[1] + 0.05, 0.14]), toWorld(me, [local[0] + 0.06, local[1] + 0.05, -0.14])];
  if (t < beats.hug) kneel.hands = null;
  else if (t < beats.reach && noname) {
    // Holding him: an arm under his neck, a hand on his chest, bowed over him.
    const [chest] = pinPoints(noname);
    const neck = [noname.x[P.neck * 3], noname.x[P.neck * 3 + 1] + 0.05, noname.x[P.neck * 3 + 2]];
    kneel.hands = [neck, chest];
    kneel.lean = 0.35;
  } else if (t < beats.lift && helmet) {
    // To the helmet by his head.
    kneel.lean = 0.25;
    const at = [helmet.at[0], helmet.at[1] + 0.14, helmet.at[2]];
    kneel.hands = [[at[0], at[1], at[2]], [at[0], at[1], at[2]]];
  } else if (t < beats.on && helmet) {
    // Up to his head, the helmet in his hands (it goes where they go).
    kneel.lean = 0;
    const u = smooth((t - beats.lift) / (beats.on - beats.lift));
    const from = ending.helmetFrom ?? helmet.at;
    kneel.hands = [mix([from[0], from[1] + 0.14, from[2]], atHead[0], u), mix([from[0], from[1] + 0.14, from[2]], atHead[1], u)];
    const lh = P.lHand * 3;
    const rh = P.rHand * 3;
    const x = me.x;
    helmet.at = [(x[lh] + x[rh]) / 2, (x[lh + 1] + x[rh + 1]) / 2 - 0.12, (x[lh + 2] + x[rh + 2]) / 2];
    helmet.yaw = me.yaw;
    helmet.carried = true;
  } else if (t < beats.rest) {
    if (helmet) putOnHelmet(world, helmet);
    kneel.hands = atHead;
    kneel.lean = 0;
  } else {
    if (helmet) putOnHelmet(world, helmet);
    // The helm on, the hands back on him: he stays.
    if (noname) {
      const [chest] = pinPoints(noname);
      kneel.hands = [[chest[0], chest[1], chest[2] - 0.12], [chest[0], chest[1], chest[2] + 0.12]];
    } else kneel.hands = null;
    kneel.lean = 0.3;
  }
  if (t >= beats.line && !ending.said) {
    ending.said = true;
    say(world, { type: 'line', text: TWIST.words.stay });
  }
}

/** The helmet on his head: it is his kit's from now on (outfit.helm), the one lying there is gone; his name is Noname's. Once. */
function putOnHelmet(world, helmet) {
  const level = levelOf(world);
  const ending = endingOf(world);
  if (ending.helmetOn) return;
  ending.helmetOn = true;
  const me = world.fighters[0];
  const noname = nonameOf(world);
  const from = outfitOf(noname?.body.inputs ?? { outfit: { kind: 'scissor', design: 4 } });
  const inputs = me.body.inputs;
  // (And the thing in the cesspool's footing and its want of fear: planted in the sludge, he does not run; and the sludge is his: he walks in it as on stone
  // (level.js wadeGear), where the men who come down after him wade. His body, his kit and his weapon are his own.)
  const own = noname?.body.inputs.outfit ?? {};
  reclothe(world, me, { ...inputs, name: noname?.body.inputs.name ?? 'Noname', outfit: { ...inputs.outfit, helm: { kind: from.kind, design: from.design }, balance: own.balance, courage: own.courage }, accessories: [], wader: true });
  level.rebuild.add(me.id);
  level.dropped = level.dropped.filter((thing) => thing !== helmet);
  world.events.push({ time: world.time, kind: 'helmetOn', fighter: 0, effects: ['puts on the helmet'] });
}

/** The epilogue's waves, each let go in the drain where the stage says and sent at him; its end: the last wave down, its time out, or his death (level.js). */
function stepEpilogue(world, def, ending, t) {
  const spec = def.epilogue;
  const waves = spec?.waves ?? [];
  while (ending.wave < waves.length && t >= waves[ending.wave].at) {
    const wave = waves[ending.wave];
    const men = heldMen(world, spec.hold).slice(0, wave.men.length);
    const back = wave.from[0] < def.landing.at[0] ? -1 : 1;
    men.forEach((fighter, k) => {
      const at = [wave.from[0] + back * k * 1.1, wave.from[1], wave.from[2] + (k % 2 ? 0.6 : -0.6)];
      releaseHeld(world, fighter, { at, yaw: back > 0 ? Math.PI : 0, section: wave.section ?? def.landing.section ?? 'sewer' });
      rouse(world, fighter.id, { post: at });
      ending.waveMen.push(fighter.id);
    });
    ending.wave += 1;
  }
  const cleared = ending.wave >= waves.length && ending.waveMen.every((id) => world.fighters[id].state === 'out');
  if (cleared) ending.clearedAt ??= world.time;
  if ((ending.clearedAt !== undefined && world.time - ending.clearedAt >= TWIST.epilogue.cleared) || t >= (spec?.seconds ?? 0)) finishEpilogue(world, cleared ? 'cleared' : 'held');
}

/**
 * The epilogue is over (`outcome`: 'cleared' the last wave down, 'held' its time out, 'fell' he died in it): the cards are asked for. The men still on their
 * feet stop hunting him and go back up the drain (the ghost walk's blindness: the game is over). The player is held through the cards.
 */
export function finishEpilogue(world, outcome) {
  const ending = endingOf(world);
  if (!ending || ending.phase !== 'epilogue') return false;
  ending.phase = 'done';
  ending.outcome = outcome;
  ending.since = world.time;
  world.stage.ghost = true;
  for (const mind of world.stage.aware?.minds ?? []) if (mind) mind.hunt = false;
  levelOf(world).dying = outcome === 'fell';
  say(world, { type: 'ending', outcome });
  return true;
}

/** The cards are through (the finale is up): the run is over. */
export function endingDone(world) {
  const ending = endingOf(world);
  if (ending) ending.phase = 'done';
}
