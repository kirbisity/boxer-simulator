// Stage 1, Dunnottar: the plot twist after the boss (levelmode/ending.js). The back room is a privy with nobody in it; the horde comes; the drop
// down the chute lands the player in the cesspool, bruised and on his feet; Noname, alive (the sewer was skipped) or dead (it was not), was the
// prince; the reveal (kneel, hold, the helmet on, the words) plays on the world's clock with or without a screen; the epilogue's waves, its three
// ends, and what a death does in each phase.

import test from 'node:test';
import assert from 'node:assert/strict';
import { thinkAll } from '../src/ai.js';
import { P } from '../src/body.js';
import { advance, bodyHarm, knockOut, placeOnFloor } from '../src/physics.js';
import { gearTraits, outfitOf } from '../src/outfits.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { DUNNOTTAR } from '../src/levelmode/stages/dunnottar.js';
import { DN_CESSPOOL, DN_CESSPOOL_REGION } from '../src/levelmode/stages/dunnottar-sewer.js';
import { regionContains, updateStage } from '../src/levelmode/stage.js';
import { contextFor, createLevelWorld, drainUi, dropDown, endingBusy, endingFinal, endingOf, interact, killBoss, killNoname, levelBusy, levelThink, nonameOf, respawnPlayer, restAtPoint } from '../src/levelmode/level.js';
import { ENDING_WAIT, TWIST, endingRespawn } from '../src/levelmode/ending.js';
import { mindState } from '../src/levelmode/awareness.js';
import { holdPlayer } from '../src/levelmode/items.js';
import { travelPlaces } from '../src/levelmode/travel.js';
import { WATER, stageWaters, waterSources } from '../src/levelmode/water.js';

const L = DUNNOTTAR.sections.find((section) => section.id === 'chapel').spawns[0].post[1];
const DEF = DUNNOTTAR.ending;
const HOLE = DEF.hole.at;
const INSIDE = [-36.4, L, HOLE[2]];
const man = (world, id) => world.fighters.find((fighter) => fighter.spawn?.id === id);
const hips = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 1], fighter.x[P.pelvis * 3 + 2]];
const point = (fighter, index) => [fighter.x[index * 3], fighter.x[index * 3 + 1], fighter.x[index * 3 + 2]];
const held = (world, name) => world.fighters.filter((fighter) => world.stage.level.spawns[fighter.spawn?.id]?.def.hold === name);

function thinking(world, dt) {
  updateStage(world);
  levelThink(world, dt);
  thinkAll(world, dt, new Set([0]));
  if (levelBusy(world)) holdPlayer(world.fighters[0]);
}
const run = (world, seconds) => advance(world, seconds, thinking);

/** A Dunnottar of only the people of the ending: the boss, Noname and the held crowds (no garrison on the way). */
function bare() {
  const stage = structuredClone(DUNNOTTAR);
  for (const section of stage.sections) section.spawns = section.spawns.filter((spawn) => spawn.hold || ['vaelen', 'noname'].includes(spawn.id));
  return stage;
}
const standAt = (world, [x, y, z], yaw = Math.PI) => {
  placeOnFloor(world.fighters[0], x, z, y, yaw);
  updateStage(world, true);
  run(world, 0.1);
};

/** The run to the back room: Noname dead first (`dead`: the sewer was gone through), a rest outside the chapel gate, the boss down, the door open, into the room. */
function toTheRoom({ dead = false, seed = 5 } = {}) {
  const world = createLevelWorld(bare(), levelPreset('forger'), { seed });
  if (dead) {
    standAt(world, [-44, DN_CESSPOOL.rim, -37.9]);
    assert.ok(killNoname(world));
    run(world, 3);
    assert.ok(world.stage.level.dropped?.length, 'his helmet came off as he died');
  }
  standAt(world, [4.6, L, -36]);
  restAtPoint(world, { id: 'rest3', at: [4.6, L, -36], name: 'The Wall Brazier' });
  standAt(world, [-4, L, -37]);
  assert.ok(killBoss(world));
  run(world, ENDING_WAIT.headless + 0.3);
  assert.equal(endingOf(world).phase, 'open');
  standAt(world, INSIDE);
  run(world, 0.3);
  assert.equal(endingOf(world).phase, 'horde');
  return world;
}

/** To the hole and down it; through the fall. */
function dropIn(world) {
  standAt(world, [HOLE[0] + 1.0, L, HOLE[2]]);
  assert.equal(contextFor(world)?.label, TWIST.words.drop);
  assert.ok(interact(world));
  assert.equal(endingOf(world).phase, 'fall');
  run(world, TWIST.fall.seconds + 0.1);
  assert.equal(endingOf(world).phase, 'landing');
}

/** The chest's normal (the way the trunk faces): up for a man on his back. */
function chestFacing(fighter) {
  const spine = point(fighter, P.neck).map((value, at) => value - point(fighter, P.pelvis)[at]);
  const across = point(fighter, P.lShoulder).map((value, at) => value - point(fighter, P.rShoulder)[at]);
  const normal = [spine[1] * across[2] - spine[2] * across[1], spine[2] * across[0] - spine[0] * across[2], spine[0] * across[1] - spine[1] * across[0]];
  const length = Math.hypot(...normal) || 1;
  return normal.map((value) => value / length);
}

// ---- The phases ----------------------------------------------------------------------------------------------

test('twist: which phases hold the player, which are past going back, and what a respawn puts back', () => {
  const world = createLevelWorld(bare(), levelPreset('forger'), { seed: 2 });
  const ending = endingOf(world);
  const expect = { locked: [false, false], felled: [false, false], open: [false, false], horde: [false, false], fall: [true, false], landing: [false, false], reveal: [true, true], epilogue: [false, true], done: [true, true] };
  for (const [phase, [busy, final]] of Object.entries(expect)) {
    ending.phase = phase;
    assert.equal(endingBusy(world), busy, `${phase} holds him: ${busy}`);
    assert.equal(endingFinal(world), final, `${phase} is past going back: ${final}`);
    const back = endingRespawn(world);
    assert.equal(back, ['horde', 'fall', 'landing'].includes(phase), `a respawn in ${phase}`);
    assert.equal(ending.phase, back ? 'open' : phase);
  }
});

test('twist: the drop is offered at the hole only while the horde comes, and offered with the men upon him', () => {
  const world = toTheRoom();
  // Not from the doorway.
  standAt(world, INSIDE);
  assert.notEqual(contextFor(world)?.id, 'ending:drop');
  // Let the crowd come right up to him at the hole: the button still offers the drop (`urgent`), where it would offer nothing else.
  standAt(world, [HOLE[0] + 1.0, L, HOLE[2]]);
  run(world, 4);
  for (const [k, fighter] of world.fighters.filter((each) => each.spawn?.id.startsWith('horde') && !each.dormant).slice(0, 3).entries()) {
    placeOnFloor(fighter, HOLE[0] + 2.2, HOLE[2] - 1 + k, L, Math.PI);
  }
  standAt(world, [HOLE[0] + 1.0, L, HOLE[2]]);
  assert.equal(contextFor(world)?.id, 'ending:drop');
  assert.equal(dropDown(world), true);
  assert.equal(world.fighters[0].dormant, true, 'out of sight in the chute');
  assert.equal(dropDown(world), false, 'once');
  assert.ok(drainUi(world).some((message) => message.type === 'fall'));
});

test('twist: the horde reaches the back room only after he has had time to reach the hole, and is more than a man could fight', () => {
  const world = toTheRoom();
  const since = endingOf(world).since;
  const horde = world.fighters.filter((fighter) => fighter.spawn?.id.startsWith('horde'));
  // (Past the chancel wall's doors, a man is in the room.)
  const doors = -34.4;
  let first = null;
  while (first === null && world.time - since < 20) {
    run(world, 0.25);
    if (horde.some((fighter) => !fighter.dormant && hips(fighter)[0] < doors)) first = world.time - since;
  }
  assert.ok(first !== null && first >= 5 && first <= 12, `the first man at the doors ${first} s after the words`);
  assert.equal(horde.filter((fighter) => !fighter.dormant).length, 36, 'all of them by then');
  assert.equal(world.fighters[0].state, 'up');
});

test('twist: the fall lands him in the cesspool, on his feet, a bruise and no more, with a big splash', () => {
  const world = toTheRoom({ dead: true });
  const before = bodyHarm(world.fighters[0]);
  dropIn(world);
  const me = world.fighters[0];
  assert.equal(me.dormant, undefined);
  assert.ok(world.stage.active.includes('sewer'));
  // The splash: the water sees a body come down into it fast (a big ring and a burst of drops), from the frames of his landing.
  const waters = stageWaters(world.stage.def);
  const memory = new Map();
  let splash = null;
  for (let frame = 0; frame < 90 && !splash; frame += 1) {
    const made = waterSources(waters, [{ id: 0, feet: [point(me, P.lFoot), point(me, P.rFoot)], hips: point(me, P.pelvis) }], memory, world.time);
    splash = made.splashes.find((each) => each.count >= WATER.bigDrops) ?? null;
    run(world, 1 / 60);
  }
  assert.ok(splash, 'a big splash');
  assert.equal(splash.water, 'cesspool');
  run(world, 1.2);
  const [x, y, z] = hips(me);
  assert.ok(regionContains(DN_CESSPOOL_REGION, x, z, y), `in the cesspool: ${hips(me)}`);
  assert.equal(me.state, 'up', 'on his feet');
  assert.ok(me.damage.trunk > 0 && me.damage.trunk < 0.25, `a bruise: ${me.damage.trunk}`);
  assert.ok(bodyHarm(me) - before < 0.05, 'no real harm');
  assert.ok(!world.events.some((event) => event.fighter === 0 && ['killed', 'knockout', 'out'].includes(event.kind)));
  assert.ok(drainUi(world).some((message) => message.type === 'landed'));
});

// ---- Noname, alive or dead ------------------------------------------------------------------------------------

test('twist: Noname alive (the sewer skipped) hunts the man who drops in; the reveal waits for his death, and his helmet comes off as he dies', () => {
  const world = toTheRoom();
  const noname = nonameOf(world);
  assert.equal(noname.state, 'up');
  dropIn(world);
  assert.equal(endingOf(world).nonameAlive, true);
  run(world, 1);
  assert.ok(['aggro', 'charge'].includes(mindState(world, noname.id)), 'he comes at him');
  run(world, 3);
  assert.equal(endingOf(world).phase, 'landing', 'no reveal while he stands');
  assert.ok(!world.stage.level.dropped?.length, 'his helmet is on');
  knockOut(world, noname, { time: world.time, attacker: 0, effects: [] }, 'is cut down', 'killed');
  run(world, 0.5);
  assert.equal(world.stage.level.dropped.length, 1, 'off as he dies');
  assert.ok(outfitOf(noname.body.inputs).look.head === null, 'his face shows');
  run(world, TWIST.landing.after + 0.2);
  assert.equal(endingOf(world).phase, 'reveal');
});

test('twist: Noname dead before (the sewer gone through) lies on the island face up at the landing, his helmet beside him', () => {
  const world = toTheRoom({ dead: true });
  dropIn(world);
  assert.equal(endingOf(world).nonameAlive, false);
  run(world, 0.8);
  const noname = nonameOf(world);
  const [x, y, z] = hips(noname);
  const island = DN_CESSPOOL.island;
  assert.ok(Math.abs(x - island.at[0]) < island.size / 2 && Math.abs(z - island.at[1]) < island.size / 2, `on the island: ${hips(noname)}`);
  assert.ok(y > island.top && y < island.top + 0.45, 'lying on its stone');
  assert.equal(noname.state, 'out');
  assert.ok(chestFacing(noname)[1] > 0.6, `face up: ${chestFacing(noname)}`);
  assert.ok(point(noname, P.head)[1] > DN_CESSPOOL.at[1] - 0.05, 'his face out of the sludge');
  const [helmet] = world.stage.level.dropped;
  assert.ok(Math.hypot(helmet.at[0] - point(noname, P.head)[0], helmet.at[2] - point(noname, P.head)[2]) < 0.7, 'the helmet by his head');
  run(world, TWIST.landing.beat);
  assert.equal(endingOf(world).phase, 'reveal');
});

// ---- The reveal ---------------------------------------------------------------------------------------------

test('twist: the reveal plays with no screen: kneeling by him, holding him, the helmet up and on, the words; then the epilogue', () => {
  const world = toTheRoom({ dead: true });
  dropIn(world);
  run(world, 0.8 + TWIST.landing.beat);
  assert.equal(endingOf(world).phase, 'reveal');
  drainUi(world);
  const me = world.fighters[0];
  const caby = nonameOf(world);
  const beats = TWIST.reveal;
  run(world, (beats.hug + beats.reach) / 2);
  assert.ok(endingBusy(world), 'held');
  assert.ok(me.kneel?.share > 0.95 && me.state === 'up', 'on his knees, not fallen');
  assert.ok(point(me, P.pelvis)[1] < DN_CESSPOOL.island.top + 0.8, `down low: ${point(me, P.pelvis)[1]}`);
  assert.ok(Math.hypot(...hips(me).map((value, at) => (at === 1 ? 0 : value - hips(caby)[at]))) < 1.5, 'beside him');
  const hand = point(me, P.rHand);
  assert.ok(Math.hypot(hand[0] - point(caby, P.neck)[0], hand[2] - point(caby, P.neck)[2]) < 0.7, 'his hands on him');
  run(world, beats.on - (beats.hug + beats.reach) / 2 + 0.3);
  assert.deepEqual(me.body.inputs.outfit.helm, { kind: 'scissor', design: 4 }, 'Noname\'s helm on his head');
  assert.equal(outfitOf(me.body.inputs).look.head.kind, 'arenaHelm');
  assert.equal(world.stage.level.dropped.length, 0, 'no longer lying there');
  assert.ok(world.stage.level.rebuild.has(0), 'his drawing is made again, the helm on it');
  run(world, beats.rise - beats.on);
  const messages = drainUi(world);
  assert.ok(messages.some((message) => message.type === 'line' && message.text === TWIST.words.stay), 'I will stay with you together');
  assert.ok(messages.some((message) => message.type === 'toast' && message.text === TWIST.words.noname), 'You are the new Noname');
  assert.equal(endingOf(world).phase, 'epilogue');
  assert.equal(me.kneel, undefined);
  assert.equal(endingBusy(world), false, 'his to play again');
  assert.equal(me.body.inputs.name, 'Noname');
  // Wearing it, his head is guarded as Astacius's was.
  assert.ok(gearTraits(me.body.inputs).helmet.mass > 2);
});

// ---- The epilogue -------------------------------------------------------------------------------------------

/** On into the epilogue (Noname dead before). */
function toTheEpilogue(seed = 5) {
  const world = toTheRoom({ dead: true, seed });
  dropIn(world);
  run(world, 0.8 + TWIST.landing.beat + TWIST.reveal.rise + 0.1);
  assert.equal(endingOf(world).phase, 'epilogue');
  drainUi(world);
  return world;
}

test('twist: the epilogue lets its waves go in the drain as the stage says, each man sent at him, and ends with the cards when the last is down', () => {
  const world = toTheEpilogue();
  const waves = DEF.epilogue.waves;
  const men = held(world, DEF.epilogue.hold);
  assert.equal(men.length, waves.reduce((sum, wave) => sum + wave.men.length, 0));
  assert.ok(men.every((fighter) => fighter.dormant));
  run(world, waves[0].at + 0.5);
  const first = men.filter((fighter) => !fighter.dormant);
  assert.equal(first.length, waves[0].men.length, 'the first wave');
  for (const fighter of first) {
    assert.equal(fighter.spawn.section, 'sewer');
    assert.ok(Math.hypot(hips(fighter)[0] - waves[0].from[0], hips(fighter)[2] - waves[0].from[2]) < 6, 'in at the drain\'s end');
    assert.ok(['aggro', 'charge'].includes(mindState(world, fighter.id)));
  }
  // The rest of them come, and fall (struck down by hand here); the end comes a breath after the last.
  for (const wave of waves.slice(1)) {
    run(world, wave.at - (world.time - endingOf(world).since) + 0.3);
    for (const fighter of men.filter((each) => !each.dormant && each.state !== 'out')) knockOut(world, fighter, { time: world.time, attacker: 0, effects: [] }, 'is cut down', 'killed');
  }
  for (const fighter of men.filter((each) => !each.dormant && each.state !== 'out')) knockOut(world, fighter, { time: world.time, attacker: 0, effects: [] }, 'is cut down', 'killed');
  assert.equal(men.filter((fighter) => fighter.dormant).length, 0, 'all of them came');
  run(world, TWIST.epilogue.cleared + 0.3);
  assert.equal(endingOf(world).phase, 'done');
  assert.equal(endingOf(world).outcome, 'cleared');
  assert.ok(drainUi(world).some((message) => message.type === 'ending'), 'the cards are asked for');
  assert.ok(endingBusy(world), 'held through the cards');
});

test('twist: the epilogue ends when its time is out, and with his death: the cards, never a rest', () => {
  const timed = toTheEpilogue(7);
  // Every wave let go, and its men taken out of the world again before they reach him (they stand, not fallen: the drain is not cleared).
  const lastWave = DEF.epilogue.waves.at(-1).at;
  const men = held(timed, DEF.epilogue.hold);
  const kept = new Set();
  while (timed.time - endingOf(timed).since < lastWave + 0.5) {
    run(timed, 0.5);
    for (const fighter of men.filter((each) => !each.spawn.held)) {
      kept.add(fighter.id);
      fighter.spawn.held = 'kept';
      fighter.dormant = true;
    }
  }
  assert.equal(kept.size, men.length, 'every wave was let go');
  run(timed, 2);
  assert.equal(endingOf(timed).phase, 'epilogue', 'not over while they stand');
  run(timed, DEF.epilogue.seconds - lastWave);
  assert.equal(endingOf(timed).phase, 'done');
  assert.equal(endingOf(timed).outcome, 'held');
  const died = toTheEpilogue(8);
  const deaths = died.stage.level.deaths;
  knockOut(died, died.fighters[0], { time: died.time, effects: [] }, 'is cut down', 'killed');
  run(died, 0.5);
  assert.equal(endingOf(died).phase, 'done');
  assert.equal(endingOf(died).outcome, 'fell');
  const messages = drainUi(died);
  assert.ok(messages.some((message) => message.type === 'ending'));
  assert.ok(!messages.some((message) => message.type === 'death'), 'no YOU DIED and no waking at a rest');
  assert.equal(died.stage.level.deaths, deaths, 'not a failed attempt');
});

// ---- Death before the reveal ----------------------------------------------------------------------------------

test('twist: a death in the horde wakes him at the last rest, the boss dead, the door open, the crowd held; going back in lets it go again', () => {
  const world = toTheRoom();
  run(world, 5);
  const me = world.fighters[0];
  knockOut(world, me, { time: world.time, effects: [] }, 'is cut down', 'killed');
  run(world, 0.2);
  assert.ok(drainUi(world).some((message) => message.type === 'death'), 'YOU DIED: a failed attempt');
  respawnPlayer(world);
  assert.equal(endingOf(world).phase, 'open');
  assert.ok(hips(me)[0] > 0, 'at the rest outside the chapel gate');
  assert.equal(man(world, 'vaelen').state, 'out');
  assert.equal(world.stage.mechanisms.innerdoor, 'open');
  const horde = held(world, DEF.horde);
  assert.ok(horde.every((fighter) => fighter.spawn.held === DEF.horde && fighter.dormant && fighter.state !== 'out'), 'the crowd held again, whole');
  standAt(world, INSIDE);
  run(world, 3);
  assert.equal(endingOf(world).phase, 'horde');
  assert.ok(horde.some((fighter) => !fighter.dormant), 'and let go again');
});

test('twist: a death to Noname in the cesspool wakes him at the last rest with the back room as he first found it', () => {
  const world = toTheRoom();
  dropIn(world);
  const me = world.fighters[0];
  run(world, 1);
  knockOut(world, me, { time: world.time, attacker: nonameOf(world).id, effects: [] }, 'is cut down', 'killed');
  run(world, 0.2);
  respawnPlayer(world);
  assert.equal(endingOf(world).phase, 'open');
  assert.ok(hips(me)[0] > 0, 'at the rest');
  assert.equal(nonameOf(world).state, 'up', 'Noname whole again on his island');
  assert.equal(world.stage.level.attempts.at(-1).killer, 'Noname');
});

test('twist: the sandbox\'s Go-to list has the privy and the cesspool landing', () => {
  const places = travelPlaces(DUNNOTTAR);
  const privy = places.find((place) => place.id === 'ending:toilet');
  const landing = places.find((place) => place.id === 'ending:landing');
  assert.ok(privy && landing);
  assert.ok(Math.hypot(privy.at[0] - HOLE[0], privy.at[2] - HOLE[2]) < DEF.hole.reach, 'in reach of the hole');
  assert.ok(regionContains(DN_CESSPOOL_REGION, landing.at[0], landing.at[2], landing.at[1] + 0.5));
  assert.ok(!places.some((place) => place.id.startsWith('prince')));
});

test('outfit.helm: another kit\'s helm worn over this one: its look and its guard; a bare head wins, and an unknown kit is no helm', () => {
  const plain = levelPreset('forger');
  const helmed = { ...plain, outfit: { ...plain.outfit, helm: { kind: 'scissor', design: 4 } } };
  assert.equal(outfitOf(plain).look.head ?? null, null);
  assert.equal(outfitOf(helmed).look.head.kind, 'arenaHelm');
  assert.equal(outfitOf(helmed).kind, 'forger', 'the rest of the kit his own');
  assert.ok(gearTraits(helmed).helmet.mass > gearTraits(plain).helmet.mass);
  assert.ok(gearTraits(helmed).protection.regions.head.blunt > (gearTraits(plain).protection.regions?.head?.blunt ?? 0));
  assert.equal(outfitOf({ ...helmed, outfit: { ...helmed.outfit, bareHead: true } }).look.head, null);
  assert.equal(outfitOf({ ...plain, outfit: { ...plain.outfit, helm: { kind: 'nothing' } } }).look.head ?? null, null);
});
