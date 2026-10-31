// Stage 1, Dunnottar: the boss rooms and the dungeon. The seals (stage.js `seals`): a boss room's ways out shut while its fight is on and open when
// the boss is out, never on a man in a doorway, open again after a death; Noname buried in his heap in the middle of the cesspool (awareness.js
// `lurk`), unseen until the player comes near, then rising; the sea-gate's lever and the man-at-arms by it gone, the way on through the crypt and
// up the well shaft; the whipping and the weeping in the vault (`torment`, `kneel`, `mourn`), a lash nearly always a cry (audio/cries.js
// CRY_STRIKERS); the garrison on its own ground never breaking (ai.js knowsNoFear); the bosses relentless (ai.js AI.relentless).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { AI, knowsNoFear, thinkAll } from '../src/ai.js';
import { advance, createWorld, inFight, knockOut, placeFighter, placeOnFloor, throwPunch } from '../src/physics.js';
import { activeSections, mechanismsOf, regionContains, sectionById, stageTerrain, updateStage } from '../src/levelmode/stage.js';
import { mindState, rouse } from '../src/levelmode/awareness.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { bossStatus, createLevelWorld, interactions, killBoss, levelOpponent, levelThink, respawnPlayer } from '../src/levelmode/level.js';
import { NOTES } from '../src/levelmode/story.js';
import { CRY_STRIKERS, createCryDirector } from '../src/audio/cries.js';
import { readSounds } from '../src/audio/log.js';
import { createListener } from '../src/audio/ear.js';
import { DN_Y, DUNNOTTAR, DUNNOTTAR_SEWER_ROUTE } from '../src/levelmode/stages/dunnottar.js';
import { DN_CESSPOOL, DN_CESSPOOL_SEAL } from '../src/levelmode/stages/dunnottar-sewer.js';
import { DN_CHAPEL } from '../src/levelmode/stages/dunnottar-chapel.js';
import { findPath } from '../tools/botnav.js';

const P0 = DN_CESSPOOL;
const by = (w, id) => w.fighters.find((fighter) => fighter.spawn?.id === id);
const hipY = (fighter) => fighter.x[P.pelvis * 3 + 1];
/** A level world with the player put at [x, y, z]. */
function at(x, y, z, seed = 4) {
  const w = createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed });
  placeOnFloor(w.fighters[0], x, z, y, 0);
  updateStage(w, true);
  return w;
}
const stepper = (w) => (seconds) => advance(w, seconds, (current, dt) => {
  updateStage(current);
  levelThink(current, dt);
  thinkAll(current, dt, new Set([0]));
});
/** A seeded random for the cry director. */
const seeded = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

// ---- the seals ------------------------------------------------------------------------------------------------

test('seals: every boss room of the stage has its seal, each gate of it an ordinary mechanism standing open, a portcullis or a sluice', () => {
  const seals = DUNNOTTAR.sections.flatMap((section) => section.seals ?? []);
  assert.deepEqual(seals.map((seal) => seal.boss).sort(), ['noname', 'vaelen']);
  const gates = new Map(DUNNOTTAR.sections.flatMap((section) => section.gates).map((gate) => [gate.id, gate]));
  for (const seal of seals) {
    for (const id of seal.gates) {
      const gate = gates.get(id);
      assert.equal(gate.state, 'open', `${id} starts open`);
      assert.ok(['portcullis', 'sluice'].includes(gate.look.kind), `${id}: ${gate.look.kind}`);
      assert.ok(gate.look.drop > 2.6, `${id} comes down fast`);
      assert.ok(!gate.opensFrom && !gate.key, `${id} is nobody's to open`);
    }
  }
  assert.equal(gates.get('chapelportcullis').look.kind, 'portcullis');
  assert.equal(gates.get('cesspoolwest').look.kind, 'sluice');
});

test('seals: the sanctuary\'s portcullis comes down as the player walks into the nave, holds while Vaelen stands, and goes up when he is dead', () => {
  const w = at(1, DN_Y.ladderRoom, -36);
  const step = stepper(w);
  const me = w.fighters[0];
  step(0.5);
  assert.equal(w.stage.mechanisms.chapelportcullis, 'open', 'outside the great door: open');
  placeOnFloor(me, DN_CHAPEL.x1 - 2.5, DN_CHAPEL.axis, DN_Y.ladderRoom, Math.PI);
  step(0.3);
  assert.equal(w.stage.mechanisms.chapelportcullis, 'closed', 'in the nave: down');
  assert.ok(w.events.some((event) => event.kind === 'sealed'));
  assert.ok(w.stage.level.ui.some((message) => message.type === 'toast' && /portcullis/.test(message.text)));
  // It is a wall in the door now: there is no walking out.
  const terrain = stageTerrain(DUNNOTTAR, w.stage.active, w.stage.mechanisms);
  assert.equal(findPath(terrain, { x: DN_CHAPEL.x1 - 2, z: DN_CHAPEL.axis, y: DN_Y.ladderRoom }, [3, DN_CHAPEL.axis], { toY: DN_Y.ladderRoom, reach: 20 }), null, 'no way out of the nave');
  step(2);
  assert.equal(w.stage.mechanisms.chapelportcullis, 'closed', 'and it holds');
  killBoss(w);
  step(0.3);
  assert.equal(w.stage.mechanisms.chapelportcullis, 'open', 'the boss out: up');
});

test('seals: never on a man in the doorway (they wait until he is clear), and a death that wakes him at his rest opens them again', () => {
  const west = DN_CESSPOOL_SEAL.west;
  const w = at(west + 0.45, P0.rim, P0.at[2]);
  const step = stepper(w);
  const noname = by(w, 'noname');
  rouse(w, noname.id);
  step(0.3);
  assert.equal(mindState(w, noname.id), 'rise');
  assert.equal(w.stage.mechanisms.cesspoolwest, 'open', 'he stands under the west sluice: it waits');
  placeOnFloor(w.fighters[0], west + 3, P0.at[2], P0.rim, 0);
  step(0.3);
  assert.equal(w.stage.mechanisms.cesspoolwest, 'closed', 'clear of it: down');
  assert.equal(w.stage.mechanisms.cesspooleast, 'closed');
  // He dies in there and wakes at the smugglers' brazier: the sluices are up again, and Noname is back in his heap.
  knockOut(w, w.fighters[0], { time: w.time, effects: [] }, 'dies', 'killed');
  respawnPlayer(w);
  step(0.5);
  assert.equal(w.stage.mechanisms.cesspoolwest, 'open');
  assert.equal(w.stage.mechanisms.cesspooleast, 'open');
  assert.equal(mindState(w, noname.id), 'lurk', 'buried again');
});

// ---- Noname in his heap -----------------------------------------------------------------------------------------

test('Noname: buried in the heap he is hidden (not drawn, no one to fight, no bar) until the player comes within a few metres; then he rises, slowly, and the fight begins', () => {
  const w = at(P0.at[0] - P0.hall + 0.4, P0.rim, P0.at[2]);
  const step = stepper(w);
  const me = w.fighters[0];
  const noname = by(w, 'noname');
  step(1);
  assert.equal(mindState(w, noname.id), 'lurk');
  assert.ok(noname.buried && noname.crawling, 'on his knees under the heap, drawn hidden (kit.js kitMen)');
  assert.ok(!inFight(noname), 'no one to fight');
  assert.equal(levelOpponent(w, me), null, 'no marker on him');
  assert.equal(bossStatus(w).show, false);
  assert.equal(w.stage.lurk.noname.risen, 0, 'the heap whole');
  // Round the pit's edge, 5 m off: still nothing.
  placeOnFloor(me, P0.island.at[0] - 5.5, P0.at[2], P0.floor, 0);
  step(1.5);
  assert.equal(mindState(w, noname.id), 'lurk');
  const low = hipY(noname);
  // Within a few metres: he comes up.
  placeOnFloor(me, P0.island.at[0] - 3.2, P0.at[2], P0.floor, 0);
  step(0.25);
  assert.equal(mindState(w, noname.id), 'rise');
  assert.ok(w.events.some((event) => event.kind === 'rise' && event.fighter === noname.id), 'the moment (drama.js: the camera drawn in)');
  assert.equal(bossStatus(w).show, true, 'his bar and the boss music from the moment he rises');
  assert.equal(w.stage.mechanisms.cesspoolwest, 'closed', 'and the sluices come down');
  // Slowly: a second in he is still on his knees, the heap half off him.
  step(1);
  assert.equal(mindState(w, noname.id), 'rise');
  assert.ok(noname.kneel && noname.kneel.share > 0.2, `half up (${noname.kneel?.share.toFixed(2)})`);
  const risen = w.stage.lurk.noname.risen;
  assert.ok(risen > 0.15 && risen < 0.9, `the filth sliding off (${risen.toFixed(2)})`);
  step(2);
  assert.ok(['aggro', 'search'].includes(mindState(w, noname.id)), 'risen, he fights');
  assert.ok(!noname.kneel && !noname.crawling && !noname.buried);
  assert.equal(w.stage.lurk.noname.risen, 1);
  assert.ok(hipY(noname) > low + 0.25, `on his feet (hips ${low.toFixed(2)} to ${hipY(noname).toFixed(2)})`);
});

test('Noname: a blow on the heap, or a scene sending him (the ending\'s drop), brings him up too', () => {
  const w = at(P0.at[0] - P0.hall + 0.4, P0.rim, P0.at[2]);
  const step = stepper(w);
  const noname = by(w, 'noname');
  w.events.push({ time: w.time, kind: 'landed', attacker: 0, defender: noname.id, effects: [] });
  step(0.3);
  assert.equal(mindState(w, noname.id), 'rise', 'struck');
  const v = at(P0.at[0] - P0.hall + 0.4, P0.rim, P0.at[2]);
  rouse(v, by(v, 'noname').id);
  assert.equal(mindState(v, by(v, 'noname').id), 'rise', 'sent');
});

// ---- after Noname: the dungeon way --------------------------------------------------------------------------------

test('after Noname: the man-at-arms who sat by the sea-gate and the lever beside him are gone, the heavy door stays shut, and the way on is the crypt, up the well shaft into the cellar', () => {
  const crypt = sectionById(DUNNOTTAR, 'crypt');
  assert.ok(!DUNNOTTAR.sections.some((section) => section.spawns.some((spawn) => spawn.id === 'fallen6')), 'the man in harness is gone');
  assert.deepEqual(crypt.levers, [], 'no lever');
  assert.ok(!crypt.decor.some((decor) => decor.kind === 'prop' && decor.what === 'lever'), 'nor its handle drawn');
  // At the sea-gate there is nothing to pull.
  const w = at(6.6, DN_Y.crypt, -36.9);
  assert.ok(!interactions(w).some((entry) => entry.kind === 'lever'));
  assert.equal(w.stage.mechanisms.cryptgate, 'closed');
  // The doors as they stand: from the sea-gate chamber the cellar is reached, by the crypt; the stair behind the heavy door goes nowhere.
  const states = Object.fromEntries(mechanismsOf(DUNNOTTAR).map((mechanism) => [mechanism.id, mechanism.state]));
  const terrain = stageTerrain(DUNNOTTAR, DUNNOTTAR.sections.map((section) => section.id), states);
  const way = findPath(terrain, { x: 5.8, z: -37.2, y: DN_Y.crypt }, [28.6, -22.5], { toY: DN_Y.vault, reach: 60, maxNodes: 400000 });
  assert.ok(way, 'the sea-gate to the cellar by the crypt and the well shaft');
  assert.ok(way.some(([x, z]) => Math.hypot(x - 28.6, z + 32.4) < 4.6), 'by the well shaft');
  assert.equal(findPath(terrain, { x: 1.7, z: -35.4, y: DN_Y.crypt }, [2.4, -28.6], { toY: DN_Y.vault, reach: 9, maxNodes: 60000 }), null, 'not up the stair behind the heavy door');
  // The route the bot and the walker take says so; the notes that told of the lever tell of the crypt's way.
  const names = DUNNOTTAR_SEWER_ROUTE.map((leg) => leg.name);
  assert.ok(names.includes('the flooded way and the gallery') && names.includes('up the well shaft') && !names.includes('the stair behind the heavy door'));
  assert.equal(DUNNOTTAR_SEWER_ROUTE.find((leg) => leg.name === 'up the well shaft').to, 'vault');
  for (const key of ['warden', 'seagate']) assert.ok(!/pull it|is the lever|the lever is a stone/i.test(NOTES[key].body), `${key} sends no one to the lever`);
  assert.ok(/well stair/i.test(NOTES.seagate.body), 'the sailor names the way on');
});

// ---- the dungeon's scenes -------------------------------------------------------------------------------------------

test('dungeon: the lasher lays real strokes of the whip on the prisoner at the wall, who cries out at them; no alarm is raised; on seeing the player he stops and fights', () => {
  const w = at(30.5, DN_Y.vault, -20.5);
  const step = stepper(w);
  const lasher = by(w, 'lasher');
  const victim = by(w, 'whipped');
  // (The ghost walk, the designer's: the garrison neither sees nor hears the operative where he is put, and goes on as it was.)
  w.stage.ghost = true;
  w.ear = { x: victim.x[P.head * 3], y: victim.x[P.head * 3 + 1], z: victim.x[P.head * 3 + 2], radius: 30 };
  const director = createCryDirector({ random: seeded(5) });
  const listener = createListener();
  Object.assign(listener, { x: w.ear.x, y: w.ear.y, z: w.ear.z });
  let cursor = 0;
  const cries = [];
  for (let k = 0; k < 40; k += 1) {
    step(0.5);
    const read = readSounds(w, cursor);
    cursor = read.cursor;
    for (const event of director.tick(read.events, w.fighters, listener, w.time)) if (event.type === 'voice' && event.cry && event.who === victim.id) cries.push(event);
  }
  const lashes = w.events.filter((event) => event.kind === 'landed' && event.weapon === 'whip' && event.defender === victim.id);
  assert.ok(lashes.length >= 5, `${lashes.length} lashes in 20 s`);
  const screams = cries.filter((cry) => ['scream', 'hurt'].includes(cry.cry.kind));
  // (A stroke that lands twice in a breath, the thong's fall and its tip, is one cry: CRY_STRIKERS.lash.gap.)
  let last = -Infinity;
  const strokes = lashes.filter((event) => (event.time - last >= CRY_STRIKERS.lash.gap ? ((last = event.time), true) : false)).length;
  assert.ok(screams.length >= Math.ceil(strokes * 0.75), `${screams.length} cries of pain for ${strokes} strokes (${lashes.length} lashes)`);
  assert.equal(mindState(w, lasher.id), 'idle', 'still at it');
  assert.ok(['questioner', 'jailer1', 'turnkey'].every((id) => mindState(w, by(w, id).id) !== 'search' && mindState(w, by(w, id).id) !== 'aggro'), 'nobody comes to see: the place is used to it');
  assert.equal(mindState(w, victim.id), 'idle', 'he does not run');
  assert.ok(victim.kneel?.hands, 'on his knees, his arms chained up');
  // The operative comes up behind him: the lasher has him, and turns on him.
  w.stage.ghost = false;
  placeOnFloor(w.fighters[0], 5.6, -30.4, DN_Y.vault, Math.PI / 2);
  step(1.5);
  assert.equal(mindState(w, lasher.id), 'aggro');
  assert.ok(!lasher.focusAny, 'the prisoner let be');
  // No stroke of his goes at the prisoner again. (The prisoner kneels a couple of metres behind him: the thong of a stroke
  // at the operative may still catch him on its way back or round, physics/whip.js lash, which is the whip's, not the man's.)
  const turned = w.time;
  const aims = [];
  advance(w, 3, (current, dt) => {
    updateStage(current);
    levelThink(current, dt);
    thinkAll(current, dt, new Set([0]));
    aims.push([current.time, lasher.punch?.target]);
  });
  assert.ok(aims.every(([, target]) => target !== victim.id), 'no stroke aimed at him');
  const aimedAt = (time) => aims.findLast(([at]) => at <= time)?.[1];
  for (const event of w.events.filter((entry) => entry.kind === 'landed' && entry.weapon === 'whip' && entry.defender === victim.id && entry.time > turned)) {
    assert.equal(aimedAt(event.time), w.fighters[0].id, `a lash on him at ${(event.time - turned).toFixed(2)} s was a stroke at the operative`);
  }
});

test('dungeon: the weeping prisoners kneel where they are kept, some behind the cells\' bars and some out in the cellar, and no fight sends them running', () => {
  const vault = sectionById(DUNNOTTAR, 'vault');
  const mourners = vault.spawns.filter((spawn) => spawn.mourn);
  assert.ok(mourners.length >= 4);
  const caged = (spawn) => spawn.post[0] > 11.6 && spawn.post[0] < 21.8 && spawn.post[2] < -31.8 && (spawn.post[0] < 14.8 || spawn.post[0] > 18.6);
  assert.ok(mourners.filter(caged).length >= 2, 'behind the bars');
  assert.ok(mourners.filter((spawn) => !caged(spawn)).length >= 2, 'within reach');
  const w = at(20, DN_Y.vault, -22.5);
  const step = stepper(w);
  // The bars are walls (seen through): the cells' mourners cannot be walked to from the hall.
  const terrain = stageTerrain(DUNNOTTAR, ['vault'], { ...w.stage.mechanisms, celldoor: 'open' });
  for (const goal of [[12.5, -33.2], [21, -33.2]]) {
    const way = findPath(terrain, { x: 16.7, z: -30.5, y: DN_Y.vault }, goal, { toY: DN_Y.vault, reach: 10 });
    const end = way?.at(-1);
    assert.ok(!end || Math.hypot(end[0] - goal[0], end[1] - goal[1]) > 1.5, `locked in: the nearest the hall comes is ${end}`);
  }
  w.ear = { x: 15, y: 7.6, z: -28, radius: 30 };
  step(1);
  // A fight in the cellar: the jailer at the player.
  const jailer = by(w, 'jailer1');
  placeOnFloor(w.fighters[0], 10, -22.5, DN_Y.vault, 0);
  step(8);
  assert.equal(mindState(w, jailer.id), 'aggro', 'a fight on');
  for (const spawn of mourners) {
    const man = by(w, spawn.id);
    assert.equal(mindState(w, man.id), 'idle', `${spawn.id} neither flees nor cowers`);
    assert.ok(man.kneel && hipY(man) < DN_Y.vault + 0.6, `${spawn.id} on his knees (hips ${(hipY(man) - DN_Y.vault).toFixed(2)} m up)`);
    assert.ok(Math.hypot(man.x[P.pelvis * 3] - spawn.post[0], man.x[P.pelvis * 3 + 2] - spawn.post[2]) < 0.6, `${spawn.id} where he was`);
    assert.equal(man.corner, 'grey', 'no one\'s to fight');
  }
  const grief = readSounds(w, 0).events.filter((event) => event.type === 'voice' && event.kind === 'grief');
  assert.ok(grief.length >= 4, `${grief.length} sobs and wails`);
});

// ---- a lash is pain ------------------------------------------------------------------------------------------------

test('cries: a landed lash on a living man nearly always makes him cry out, adrenaline or no, the budget full or not; a flurry is a cry a lash, not a pile; a machine never', () => {
  const man = (id, { machine = false, adrenaline = 0 } = {}) => {
    const n = Object.keys(P).length + 2;
    const x = new Float64Array(n * 3);
    for (let k = 0; k < n; k += 1) {
      x[k * 3] = id;
      x[k * 3 + 1] = k === P.head ? 1.65 : 1;
    }
    return { id, corner: 'grey', state: 'up', x, v: new Float64Array(n * 3), adrenaline, body: { heightM: 1.75, bodyMassKg: 75, inputs: { sex: 'male', age: 30, exercise: 0.5 }, gear: machine ? { machine: true } : {} } };
  };
  const lash = (fighter, t, strength = 0.3) => ({ type: 'voice', kind: 'struck', striker: 'lash', strength, who: fighter.id, t, x: fighter.id, y: 1.65, z: 0 });
  const blow = (fighter, t) => ({ type: 'voice', kind: 'struck', strength: 0.3, energy: 12, covering: 'flesh', who: fighter.id, t, x: fighter.id, y: 1.65, z: 0 });
  const listener = createListener();
  const count = (events, fighters, seconds = 1.5) => {
    const director = createCryDirector({ random: seeded(11) });
    let cries = 0;
    for (let k = 0; k < events.length; k += 1) cries += director.tick([events[k](k * seconds)], fighters, listener, k * seconds).filter((event) => event.cry && event.who === 0).length;
    return cries;
  };
  const hot = man(0, { adrenaline: 1 });
  const others = [man(1), man(2), man(3)];
  // Twenty lashes a second and a half apart on a man fighting hot, with three others crying every time (the budget full): nearly every one.
  const lashes = count(Array.from({ length: 20 }, () => (t) => lash(hot, t)), [hot, ...others]);
  assert.ok(lashes >= 17, `${lashes} cries for 20 lashes`);
  // The same with a blow of the same felt strength: mostly silent (adrenaline masks it).
  const blows = count(Array.from({ length: 20 }, () => (t) => blow(hot, t)), [hot]);
  assert.ok(blows <= 6, `${blows} cries for 20 blows`);
  // A flurry: five lashes in 0.4 s is one cry.
  assert.ok(count(Array.from({ length: 5 }, () => (t) => lash(hot, t)), [hot], 0.1) <= 1);
  assert.ok(CRY_STRIKERS.lash.gap >= 0.4 && CRY_STRIKERS.lash.gap <= 1);
  // A machine is silent.
  assert.equal(count(Array.from({ length: 10 }, () => (t) => lash(man(0, { machine: true }), t)), [man(0, { machine: true })]), 0);
});

// ---- the garrison on its own ground --------------------------------------------------------------------------------

test('home ground: a side on its own ground is never frightened off; the same man elsewhere breaks; Dunnottar\'s garrison holds its castle', () => {
  const run = (home) => {
    const world = createWorld([{ inputs: { ...levelPreset('dunnottarSoldier') }, corner: 'blue' }, { inputs: levelPreset('vaelen'), corner: 'red' }], { seed: 2 });
    if (home) world.homeGround = { blue: true };
    const man = world.fighters[0];
    man.concussion = 1e9;
    man.fear = 1;
    let broke = false;
    for (let second = 0; second < 8; second += 0.1) {
      man.adrenaline = 0;
      advance(world, 0.1, (current, dt) => thinkAll(current, dt));
      broke ||= Boolean(man.panicked);
    }
    return { broke, fear: man.fear, man, world };
  };
  assert.ok(run(false).broke, 'away from home he breaks');
  const home = run(true);
  assert.equal(home.broke, false, 'at home he never does');
  assert.equal(home.fear, 0);
  assert.ok(knowsNoFear(home.world, home.man));
  const w = createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed: 3 });
  assert.deepEqual(w.homeGround, { blue: true });
  assert.ok(w.fighters.filter((fighter) => fighter.corner === 'blue').every((fighter) => knowsNoFear(w, fighter)));
  assert.ok(!knowsNoFear(w, w.fighters[0]), 'the operative is not at home here');
});

// ---- the relentless bosses ---------------------------------------------------------------------------------------------

/** A boss pressed by the player for `seconds`: walking straight into him, striking whenever he can. The most the boss's stance went back on the line between them, and his least stamina. */
function pressed(key, seed, seconds = 10) {
  const world = createWorld([{ inputs: levelPreset('forger'), corner: 'red' }, { inputs: levelPreset(key), corner: 'blue' }], { seed, arena: { halfX: 30, halfZ: 30, open: true } });
  const [me, him] = world.fighters;
  const line = [him.root[0] - me.root[0], him.root[1] - me.root[1]];
  const length = Math.hypot(...line);
  const start = [...him.root];
  let worst = 0;
  let stamina = 1;
  for (let k = 0; k < seconds * 10 && me.state !== 'out' && him.state !== 'out'; k += 1) {
    advance(world, 0.1, (current, dt) => {
      thinkAll(current, dt, new Set([0]));
      me.goTo = [him.x[P.pelvis * 3], 0, him.x[P.pelvis * 3 + 2]];
      me.move = 1;
      if (!me.punch && me.state === 'up') throwPunch(current, me, current.random() < 0.5 ? 'gladiusCut' : 'gladiusThrust', 'body');
    });
    worst = Math.max(worst, ((him.root[0] - start[0]) * line[0] + (him.root[1] - start[1]) * line[1]) / length);
    stamina = Math.min(stamina, him.stamina);
  }
  return { worst, stamina };
}

test('relentless: Noname and Vaelen are never driven back by a player walking into them and striking, and do not run out of wind', () => {
  for (const key of ['noname', 'vaelen']) {
    const inputs = levelPreset(key);
    assert.equal(inputs.relentless, true, key);
    assert.ok(!('damage' in inputs) && !('health' in inputs), 'no multiplier');
    for (const seed of [1, 2]) {
      const { worst, stamina } = pressed(key, seed);
      assert.ok(worst < 0.25, `${key} ${seed}: went back ${worst.toFixed(2)} m`);
      assert.ok(stamina > 0.3, `${key} ${seed}: wind ${stamina.toFixed(2)}`);
    }
  }
});

test('relentless: backed to a wall he steps out along it rather than stay pinned, and breaks out of a corner', () => {
  const corner = (relentless) => {
    const boss = levelPreset('noname');
    if (!relentless) delete boss.relentless;
    const world = createWorld([{ inputs: levelPreset('forger'), corner: 'red' }, { inputs: boss, corner: 'blue' }], { seed: 1, arena: { halfX: 4, halfZ: 4 } });
    const [me, him] = world.fighters;
    placeFighter(him, 3.2, 3.2);
    placeFighter(me, 1.8, 1.8);
    for (let k = 0; k < 60; k += 1) {
      advance(world, 0.1, (current, dt) => {
        thinkAll(current, dt, new Set([0]));
        me.goTo = [him.x[P.pelvis * 3], 0, him.x[P.pelvis * 3 + 2]];
        me.move = 1;
      });
    }
    return Math.min(4 - Math.abs(him.root[0]), 4 - Math.abs(him.root[1]));
  };
  assert.ok(corner(true) > 0.9, `relentless: ${corner(true).toFixed(2)} m from the walls`);
  assert.ok(corner(true) > corner(false) + 0.3, 'more than the same man not relentless');
  // His back to a wall, the player square before him: he steps along it (AI.relentless).
  const world = createWorld([{ inputs: levelPreset('forger'), corner: 'red' }, { inputs: levelPreset('noname'), corner: 'blue' }], { seed: 2, arena: { halfX: 4, halfZ: 4 } });
  const [me, him] = world.fighters;
  placeFighter(him, 3.6, 0);
  placeFighter(me, 2.2, 0);
  let unpinned = false;
  for (let k = 0; k < 20; k += 1) {
    advance(world, 0.05, (current, dt) => {
      thinkAll(current, dt, new Set([0]));
      me.move = 0;
    });
    unpinned ||= him.aiUnpinned !== undefined;
  }
  assert.ok(unpinned, 'he stepped out along the wall');
  assert.ok(AI.relentless.wallProbe > 0 && AI.relentless.drive > 0);
});

// (The sections the seals' rooms lie in are their bosses'.)
test('seals: each room lies in its boss\'s section', () => {
  for (const section of DUNNOTTAR.sections) {
    for (const seal of section.seals ?? []) {
      const boss = section.spawns.find((spawn) => spawn.id === seal.boss);
      assert.ok(boss, `${seal.id}: ${seal.boss} is in ${section.id}`);
      assert.ok(regionContains(seal.room, boss.post[0], boss.post[2], boss.post[1] + 0.5), `${seal.id}: the boss's post is in the room`);
      assert.ok(activeSections(DUNNOTTAR, [boss.post[0], boss.post[1] + 0.9, boss.post[2]]).includes(section.id));
    }
  }
});
