// Level mode, the player's systems (src/levelmode/level.js and friends): running, the context button, items,
// loot, rest, death, mechanisms through the button, damp powder, the boss's second phase.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { CONTROL, directFighter, keyStick, newOrders } from '../src/control.js';
import { advance, collapseAt, createWorld, placeOnFloor } from '../src/physics.js';
import { fire } from '../src/physics/ranged.js';
import { WORLD } from '../src/physics/config.js';
import { OUTFITS } from '../src/outfits.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { TESTYARD } from '../src/levelmode/stages/testyard.js';
import { stageThink, updateStage } from '../src/levelmode/stage.js';
import { bossStatus, contextFor, createLevelWorld, drainRebuilds, drainUi, interact, interactions, levelBusy, levelThink, respawnPlayer, restAtPoint, useItem } from '../src/levelmode/level.js';
import { holdPlayer } from '../src/levelmode/items.js';
import { LEVEL_CONFIG } from '../src/levelmode/config.js';
import { snapshotGear } from '../src/levelmode/checkpoints.js';

// The counts the stage starts him with and the pouch holds (the config's: tuned with tools/dunnottar.js).
const { bandage: START_BANDAGES, tonic: START_TONICS } = LEVEL_CONFIG.start;
const CAP_BANDAGES = LEVEL_CONFIG.cap.bandage;

const yard = (seed = 3) => createLevelWorld(TESTYARD, levelPreset('forger'), { seed });
const fighterOf = (world, id) => world.fighters.find((fighter) => fighter.spawn?.id === id);
const at = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 1], fighter.x[P.pelvis * 3 + 2]];

/** Run the world for `seconds`: the stage and the level think, and the player does as `orders` say (a bare stage: nobody else thinks). */
function run(world, seconds, orders = newOrders()) {
  const me = world.fighters[0];
  advance(world, seconds, (w, dt) => {
    stageThink(w, dt);
    levelThink(w, dt);
    if (levelBusy(w)) holdPlayer(me);
    else directFighter(w, me, orders, dt);
  });
}

/** Stand the player somewhere (on its floor) and let the stage take notice. */
function standAt(world, x, y, z, yaw = 0) {
  const me = world.fighters[0];
  placeOnFloor(me, x, z, y, yaw);
  updateStage(world, true);
  run(world, 0.1);
  // His hips settle a little off where his feet were put: stood again so that they are where asked.
  placeOnFloor(me, x - (at(me)[0] - x), z - (at(me)[2] - z), y, yaw);
  me.rootVelocity = [0, 0];
}

// ---- Running -----------------------------------------------------------------------------------------------

test('level mode: running does not guard, and an attack asked for breaks the run (it is thrown); the same stick inside the threshold does not run', () => {
  const world = yard();
  const me = world.fighters[0];
  const orders = newOrders();
  // Within the run threshold: a fast walk, and the guard comes up when asked.
  orders.keyStick = keyStick(new Set(['d']), { ahead: [1, 0], right: [0, 1] }, false);
  orders.guard = true;
  run(world, 0.3, orders);
  assert.ok(me.defence && ['guard', 'weaponBlock', 'shieldBlock'].includes(me.defence.name), 'a guard held while walking');
  // Past it: running; no guard.
  const running = newOrders();
  running.keyStick = keyStick(new Set(['d']), { ahead: [1, 0], right: [0, 1] }, true);
  run(world, 0.5, running);
  assert.equal(me.running, true);
  // The block comes down; the guard asked for slows him to a walk.
  running.guard = true;
  run(world, 0.3, running);
  const stats = me.stats.thrown;
  assert.equal(me.running, false, 'asking for the guard slows him to a walk (control.js)');
  running.guard = false;
  // Let go of the guard with the stick still at a run: still no run (the guard broke it) until the stick is eased off.
  run(world, 0.2, running);
  assert.equal(me.running, false, 'a run broken by the guard stays broken while the stick is held');
  running.keyStick = keyStick(new Set(['d']), { ahead: [1, 0], right: [0, 1] }, false);
  run(world, 0.1, running);
  running.keyStick = keyStick(new Set(['d']), { ahead: [1, 0], right: [0, 1] }, true);
  run(world, 0.3, running);
  assert.equal(me.running, true, 'eased off and pushed again: running');
  // An attack asked for while running keeps the run: he strikes on the run (control.js runStrike).
  running.requests.push({ at: world.time, line: 'mid', strength: 'quick' });
  run(world, 0.1, running);
  assert.equal(me.running, true, 'an attack asked for while running keeps the run');
  // Back inside the threshold: attacks work again.
  const walking = newOrders();
  walking.keyStick = keyStick(new Set(['d']), { ahead: [1, 0], right: [0, 1] }, false);
  walking.requests.push({ at: world.time, line: 'mid', strength: 'quick', point: [at(me)[0] + 0.9, at(me)[1], at(me)[2]] });
  run(world, 0.2, walking);
  assert.ok(me.stats.thrown > stats || me.punch, 'a walking man can strike');
});

test('Battle Mode: running is the same gait (run mode), and a blow asked for while running is thrown on the run', () => {
  const world = createWorld([{ inputs: structuredClone(PRESETS.heavy), corner: 'red' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }], { seed: 5 });
  const me = world.fighters[0];
  const orders = newOrders();
  orders.keyStick = { dir: [0, 1], amount: 1 };
  orders.requests.push({ at: 0, move: 'jab', zone: 'head' });
  advance(world, 0.3, (w, dt) => directFighter(w, me, orders, dt));
  assert.ok(me.stats.thrown > 0, 'in a battle he may strike while running');
  assert.equal(me.running, true, 'the blow keeps the run');
});

// ---- Bandage and tonic -------------------------------------------------------------------------------------

test('a bandage is a 2.5 s action that stops all bleeding; the man stands still for it', () => {
  const world = yard();
  const me = world.fighters[0];
  const level = world.stage.level;
  assert.deepEqual(level.inventory, { bandage: START_BANDAGES, tonic: START_TONICS });
  assert.equal(useItem(world, 'bandage'), false, 'not bleeding: not used');
  assert.equal(level.inventory.bandage, START_BANDAGES);
  me.bleed = 0.08;
  assert.equal(useItem(world, 'bandage'), true);
  assert.equal(level.inventory.bandage, START_BANDAGES - 1);
  assert.ok(levelBusy(world));
  const orders = newOrders();
  orders.keyStick = { dir: [1, 0], amount: 1 };
  const start = at(me);
  run(world, 2.0, orders);
  assert.ok(me.bleed > 0, 'still at it at 2 s');
  assert.ok(Math.hypot(at(me)[0] - start[0], at(me)[2] - start[2]) < 0.2, 'he stays where he is');
  assert.ok(me.tending, 'hands at the wound');
  run(world, 0.6, orders);
  assert.equal(me.bleed, 0);
  assert.equal(level.action, null);
  assert.equal(me.tending, undefined);
  assert.equal(levelBusy(world), false);
  assert.equal(LEVEL_CONFIG.bandage.seconds, 2.5);
});

test('a hit interrupts a bandage: the wound is still open and the bandage is spent', () => {
  const world = yard();
  const me = world.fighters[0];
  me.bleed = 0.08;
  useItem(world, 'bandage');
  run(world, 1.0);
  me.hitAt[P.neck] = world.time;
  run(world, 0.1);
  assert.equal(world.stage.level.action, null, 'the action is gone');
  assert.ok(me.bleed > 0, 'still bleeding');
  assert.equal(world.stage.level.inventory.bandage, START_BANDAGES - 1);
  assert.ok(drainUi(world).some((message) => /interrupted/.test(message.text ?? '')));
  // A blow in the events does it too.
  me.bleed = 0.08;
  useItem(world, 'bandage');
  run(world, 0.5);
  world.events.push({ time: world.time, kind: 'landed', attacker: 1, defender: 0, effects: [] });
  run(world, 0.1);
  assert.equal(world.stage.level.action, null);
});

test('a tonic mends blood lost, strain and bruising over 4 s, and not a broken limb', () => {
  const world = yard();
  const me = world.fighters[0];
  const level = world.stage.level;
  assert.equal(useItem(world, 'tonic'), false, 'not hurt: not used');
  me.bloodLost = collapseAt() * 0.6;
  me.concussion = 3;
  me.damage.trunk = 0.5;
  me.damage.lForearm = 0.9;
  me.broken.add('lElbow');
  me.limp.add(P.lHand);
  me.knockdowns = 2;
  const before = me.bloodLost;
  assert.equal(useItem(world, 'tonic'), true);
  assert.equal(level.inventory.tonic, START_TONICS - 1);
  run(world, 2);
  assert.ok(me.bloodLost < before * 0.6 && me.bloodLost > before * 0.4, 'about half done at 2 s');
  run(world, 2.2);
  assert.ok(me.bloodLost < 1e-6, 'the blood is back');
  assert.ok(me.concussion < 1e-6);
  assert.ok(me.damage.trunk < 1e-6);
  assert.ok(me.damage.lForearm > 0.8, 'a broken limb stays hurt');
  assert.ok(me.broken.has('lElbow'), 'a broken limb stays broken');
  assert.equal(me.knockdowns, 0);
  assert.equal(level.tonics.length, 0);
  level.inventory.tonic = 0;
  assert.equal(useItem(world, 'tonic'), false, 'none left');
});

// ---- Pick-ups and the context button -----------------------------------------------------------------------

test('items lying about are taken at the button: bandages and tonics into the pouch up to its cap, keys, notes read', () => {
  const world = yard();
  const level = world.stage.level;
  standAt(world, -16, 0, -1.8);
  assert.equal(contextFor(world).kind, 'item');
  assert.equal(contextFor(world).label, 'Take bandage');
  assert.equal(interact(world), true);
  assert.equal(level.inventory.bandage, START_BANDAGES + 1);
  assert.ok(level.taken.has('bandage0') || level.taken.has('bandage1'));
  interact(world);
  assert.equal(level.inventory.bandage, START_BANDAGES + 2);
  assert.equal(contextFor(world), null, 'both taken: nothing here');
  // The pouch holds no more.
  level.taken.delete('bandage0');
  level.inventory.bandage = CAP_BANDAGES;
  assert.equal(interact(world), false);
  assert.equal(level.inventory.bandage, CAP_BANDAGES);
  assert.ok(!level.taken.has('bandage0'), 'left where it lies');
  // The note: read, and it stays to be read again.
  standAt(world, -19.3, 0, 0.5);
  assert.equal(contextFor(world).label, 'Read note');
  drainUi(world);
  interact(world);
  assert.deepEqual(drainUi(world).map((message) => [message.type, message.key]), [['note', 'powder']]);
  assert.equal(contextFor(world).label, 'Read note');
  // The tonic in the corner.
  standAt(world, -16, 0, 8);
  interact(world);
  assert.equal(level.inventory.tonic, START_TONICS + 1);
});

test('the button hides while an enemy aware of him is within 6 m (awareness.js: aggro or search), and not for one who has not noticed him', () => {
  const world = yard();
  // The hall's rest point is at (48, 0, 0): the guards stand about it.
  standAt(world, 46.8, 0, 0.5);
  assert.ok(interactions(world).some((entry) => entry.kind === 'rest'), 'the rest point is within reach');
  const minds = world.stage.aware.minds;
  const guard = fighterOf(world, 'guard1');
  assert.notEqual(minds[guard.id].state, 'aggro');
  assert.equal(contextFor(world)?.kind, 'rest', 'guards who have not noticed him do not hide it');
  minds[guard.id].state = 'aggro';
  assert.equal(contextFor(world), null, 'one who fights him, within 6 m: nothing offered');
  minds[guard.id].state = 'search';
  assert.equal(contextFor(world), null, 'one who is looking for him too');
  // Beyond 6 m, or put out of the fight: the button is back.
  placeOnFloor(guard, 38, 8, 0, 0);
  assert.equal(contextFor(world)?.kind, 'rest', 'six metres off or more');
  placeOnFloor(guard, 45, 2, 0, 0);
  assert.equal(contextFor(world), null);
  guard.state = 'out';
  assert.equal(contextFor(world)?.kind, 'rest');
});

test('the nearest of several things is the one offered; a locked door shows as locked until the key is held', () => {
  const world = yard();
  const level = world.stage.level;
  standAt(world, 53, 0, -4.4);
  // The key and the divider's note are near; the key is nearer.
  assert.equal(contextFor(world).label, 'You take the cell key');
  standAt(world, 68.4, 0, -6);
  const door = contextFor(world);
  assert.equal(door.kind, 'gate');
  assert.equal(door.label, 'Locked');
  assert.equal(door.disabled, true);
  assert.equal(interact(world), false);
  assert.equal(world.stage.mechanisms.cell1, 'closed');
  level.keys.add('cellkey');
  assert.equal(contextFor(world).label, 'Unlock cell');
});

// ---- Mechanisms through the button ---------------------------------------------------------------------------

test('a lever is pulled at the button and its gate opens (once)', () => {
  const world = yard();
  standAt(world, 17.9, 0, -2.1);
  assert.equal(world.stage.mechanisms.gate1, 'closed');
  assert.equal(contextFor(world).label, 'Pull lever');
  interact(world);
  assert.equal(world.stage.mechanisms.gate1, 'open');
  assert.equal(contextFor(world), null, 'pulled: nothing more to do');
});

test('a gate opened by hand opens only from its own side', () => {
  const world = yard();
  // East of the divider: the gate (55, 7) is within reach, but this is the far side.
  standAt(world, 57.2, 0, 7);
  assert.equal(interactions(world).some((entry) => entry.id === 'gate:gate2'), false, 'not from the far side');
  standAt(world, 54, 0, 7);
  const choice = interactions(world).find((entry) => entry.id === 'gate:gate2');
  assert.ok(choice, 'from the near side');
  assert.equal(choice.label, 'Open iron gate');
  assert.equal(world.stage.mechanisms.gate2, 'closed');
  assert.equal(interact(world, choice), true);
  assert.equal(world.stage.mechanisms.gate2, 'open');
  assert.equal(interactions(world).some((entry) => entry.id === 'gate:gate2'), false, 'open: nothing more');
});

test('the cell door is unlocked with the key and frees the prisoner inside (through the adapter)', () => {
  const world = yard();
  const level = world.stage.level;
  const miner = fighterOf(world, 'miner');
  assert.equal(miner.corner, 'grey');
  standAt(world, 53, 0, -4.4);
  interact(world);
  assert.ok(level.keys.has('cellkey'));
  standAt(world, 68.4, 0, -6);
  assert.equal(contextFor(world).label, 'Unlock cell');
  interact(world);
  assert.equal(world.stage.mechanisms.cell1, 'open');
  assert.ok(level.freed.has('miner'));
  assert.equal(miner.corner, 'red', 'he fights beside the player now');
  assert.equal(miner.spawn.role, 'ally');
});

test('a ladder is kicked down from above, and only from above', () => {
  const world = yard();
  // On the ground by the ledge: out of reach (a 6 m ledge).
  standAt(world, -0.5, 0, -3);
  assert.equal(interactions(world).some((entry) => entry.kind === 'ladder'), false);
  standAt(world, -0.5, 6, -7.2);
  const kick = contextFor(world);
  assert.equal(kick.label, 'Kick ladder down');
  interact(world);
  assert.equal(world.stage.mechanisms.ladder1, 'down');
  assert.equal(contextFor(world), null);
});

// ---- Loot --------------------------------------------------------------------------------------------------

test('a dead man\'s weapon is taken with the existing pickup, and the style follows the weapon', () => {
  const world = yard();
  const me = world.fighters[0];
  assert.equal(me.style, 'armingBuckler');
  standAt(world, -14.4, 0, -3.1);
  const take = interactions(world).find((entry) => entry.kind === 'weapon');
  assert.ok(take, 'the knight\'s sword lies beside him');
  assert.equal(take.label, 'Take weapon');
  const shieldBefore = me.shield?.kind;
  assert.equal(interact(world, take), true);
  run(world, 3);
  assert.equal(me.style, 'longsword');
  assert.equal(me.weapon.kind, 'longsword');
  assert.equal(me.shield?.kind, shieldBefore, 'the buckler is still on his arm');
  // His own sword lies where he let it fall.
  assert.ok(world.debris.some((piece) => piece.kind === 'weapon' && piece.weapon === 'armingSword' && !piece.taken && piece.owner === 0) || world.debris.some((piece) => piece.owner === 0 && !piece.taken));
});

test('taking the outfit rebuilds the body in the dead man\'s harness and keeps wounds, blood and bones', () => {
  const world = yard();
  const me = world.fighters[0];
  const dead = fighterOf(world, 'fallen');
  const oldKind = me.body.inputs.outfit.kind;
  const deadKind = dead.body.inputs.outfit.kind;
  assert.notEqual(oldKind, deadKind);
  const massBefore = me.body.masses.reduce((sum, mass) => sum + mass, 0);
  const protectionBefore = me.body.gear.protection.cut;
  me.bloodLost = 0.4 * collapseAt();
  me.damage.trunk = 0.3;
  me.trauma = { trunk: 2 };
  me.broken.add('rElbow');
  me.limp.add(P.rHand);
  me.bleed = 0.02;
  standAt(world, -14.5, 0, -3.2);
  const take = interactions(world).find((entry) => entry.kind === 'outfit');
  assert.ok(take);
  assert.equal(take.label, 'Take outfit');
  interact(world, take);
  assert.ok(levelBusy(world));
  run(world, 2.8);
  assert.equal(me.body.inputs.outfit.kind, oldKind, 'not yet: a 3 s action');
  run(world, 0.5);
  assert.equal(me.body.inputs.outfit.kind, deadKind);
  assert.notEqual(me.body.gear.protection.cut, protectionBefore, 'the armour is the knight\'s');
  assert.ok(me.body.masses.reduce((sum, mass) => sum + mass, 0) > massBefore + 5, 'and heavier');
  assert.ok(me.body.gear.extraMass > 0.1);
  assert.equal(dead.body.inputs.outfit.kind, oldKind, 'the dead man lies in the operative\'s old clothes');
  // What had happened to him is as it was.
  assert.ok(me.bloodLost > 0.35 * collapseAt());
  assert.equal(me.damage.trunk, 0.3);
  assert.equal(me.trauma.trunk, 2);
  assert.ok(me.broken.has('rElbow') && me.limp.has(P.rHand));
  assert.ok(me.bleed > 0);
  assert.equal(me.weapon?.held, true, 'his weapon in his hand');
  // The screen is told to draw both again; and the body is sound: the fight goes on, with finite numbers.
  assert.deepEqual(drainRebuilds(world).sort(), [0, dead.id]);
  run(world, 2);
  assert.ok(me.x.every(Number.isFinite) && dead.x.every(Number.isFinite));
  assert.equal(me.state, 'up');
  assert.ok(OUTFITS[deadKind]);
});

test('the swapped body is a body as at the start of a bout: weapon masses carried, and a second swap back is sound', () => {
  const world = yard();
  const me = world.fighters[0];
  const dead = fighterOf(world, 'fallen');
  const mass = (fighter) => fighter.body.masses.reduce((sum, value) => sum + value, 0);
  const own = me.body.inputs.outfit.kind;
  const withHeld = mass(me);
  standAt(world, -14.5, 0, -3.2);
  interact(world, interactions(world).find((entry) => entry.kind === 'outfit'));
  run(world, 3.3);
  standAt(world, -14.5, 0, -3.2);
  interact(world, interactions(world).find((entry) => entry.kind === 'outfit'));
  run(world, 3.3);
  assert.equal(me.body.inputs.outfit.kind, own, 'swapped back');
  assert.ok(Math.abs(mass(me) - withHeld) < 0.01, `mass back to what it was: ${mass(me)} vs ${withHeld}`);
  assert.ok(dead.x.every(Number.isFinite));
});

// ---- Rest and death ----------------------------------------------------------------------------------------

test('a rest heals the operative whole, refills his items, puts the enemies back and keeps what was opened, freed and taken', () => {
  const world = yard();
  const me = world.fighters[0];
  const level = world.stage.level;
  // Take the knight's harness first: the gear at the rest is this.
  standAt(world, -14.5, 0, -3.2);
  interact(world, interactions(world).find((entry) => entry.kind === 'outfit'));
  run(world, 3.3);
  const gearKind = me.body.inputs.outfit.kind;
  // The run so far: a lever pulled, the cell door's miner freed, a note read, the key and a bandage taken.
  world.stage.mechanisms.gate1 = 'open';
  level.freed.add('miner');
  level.notes.add('note1');
  level.keys.add('cellkey');
  level.taken.add('cellkey').add('bandage0');
  // The man hurt every way: blood, bones, strain, spent items.
  me.bloodLost = 0.8 * collapseAt();
  me.bleed = 0.1;
  me.broken.add('lKnee');
  me.limp.add(P.lFoot);
  me.concussion = 4;
  me.knockdowns = 1;
  me.stamina = 0.1;
  level.inventory = { bandage: 0, tonic: 0 };
  // In the hall: one guard killed, another carried far from his post.
  standAt(world, 47.6, 0, 0);
  const guard = fighterOf(world, 'guard1');
  const post = TESTYARD.sections[1].spawns[0].post;
  // (Guards who have not noticed him do not hide the button; one who has, within 6 m, does.)
  assert.equal(contextFor(world)?.kind, 'rest');
  world.stage.aware.minds[guard.id].state = 'aggro';
  assert.equal(contextFor(world), null);
  guard.state = 'out';
  guard.bloodLost = 99;
  const other = fighterOf(world, 'guard2');
  placeOnFloor(other, 35, 5, 0, 1);
  assert.ok(interactions(world).some((entry) => entry.kind === 'rest' && entry.label === 'Rest'));
  restAtPoint(world, { id: 'hall', at: TESTYARD.sections[1].rest.at, name: 'The Hall' });
  // The man: whole.
  assert.equal(me.bloodLost ?? 0, 0);
  assert.ok(!me.bleed);
  assert.equal(me.broken.size, 0);
  assert.equal(me.limp.size, 0);
  assert.equal(me.concussion, 0);
  assert.equal(me.knockdowns, 0);
  assert.equal(me.stamina, 1);
  assert.equal(me.state, 'up');
  assert.deepEqual(level.inventory, { bandage: START_BANDAGES, tonic: START_TONICS }, 'items refilled to the start counts');
  assert.equal(me.body.inputs.outfit.kind, gearKind, 'in the gear he had');
  assert.equal(level.checkpoint.id, 'hall');
  assert.equal(level.checkpoint.gear.inputs.outfit.kind, gearKind);
  // The enemies: back at their posts, whole.
  assert.equal(guard.state, 'up');
  assert.equal(guard.bloodLost ?? 0, 0);
  assert.ok(Math.hypot(guard.root[0] - post[0], guard.root[1] - post[2]) < 0.01, 'at his post');
  assert.equal(other.state, 'up');
  assert.ok(Math.hypot(other.root[0] - 44, other.root[1] - 3) < 0.01);
  assert.equal(guard.dormant, undefined, 'awake: his section is');
  // What the run has done stays.
  assert.equal(world.stage.mechanisms.gate1, 'open');
  assert.ok(level.freed.has('miner') && level.notes.has('note1') && level.keys.has('cellkey') && level.taken.has('bandage0'));
  assert.ok(drainUi(world).some((message) => message.type === 'rested'));
});

test('a rest refills only up to the start counts: a man with more keeps them', () => {
  const world = yard();
  const level = world.stage.level;
  level.inventory = { bandage: CAP_BANDAGES, tonic: 0 };
  restAtPoint(world, { id: 'yard', at: [-19, 0, -7], name: "the brazier" });
  assert.deepEqual(level.inventory, { bandage: CAP_BANDAGES, tonic: START_TONICS });
});

test('death: YOU DIED is asked for once; the respawn is at the last rest with the gear he had there; enemies, shortcuts and followers as they should be', () => {
  const world = yard();
  const me = world.fighters[0];
  const level = world.stage.level;
  // Rest in the yard in the knight's harness.
  standAt(world, -14.5, 0, -3.2);
  interact(world, interactions(world).find((entry) => entry.kind === 'outfit'));
  run(world, 3.3);
  standAt(world, -19, 0, -7);
  interact(world);
  assert.equal(level.checkpoint.id, 'yard');
  const kind = me.body.inputs.outfit.kind;
  const spot = [...level.checkpoint.at];
  // After it: changed back into the old clothes, a gate opened, a man killed, the prisoner freed, the player killed in the hall.
  const dead = fighterOf(world, 'fallen');
  standAt(world, -14.5, 0, -3.2);
  interact(world, interactions(world).find((entry) => entry.kind === 'outfit'));
  run(world, 3.3);
  assert.notEqual(me.body.inputs.outfit.kind, kind);
  level.inventory = { bandage: 0, tonic: 0 };
  world.stage.mechanisms.gate1 = 'open';
  standAt(world, 36, 0, 0);
  level.freed.add('miner');
  fighterOf(world, 'miner').corner = 'red';
  fighterOf(world, 'miner').spawn.role = 'ally';
  const guard = fighterOf(world, 'guard1');
  guard.state = 'out';
  placeOnFloor(guard, 40, 6, 0, 0);
  me.state = 'out';
  drainUi(world);
  run(world, 0.1);
  run(world, 0.1);
  assert.deepEqual(drainUi(world).map((message) => message.type), ['death'], 'asked once');
  assert.equal(level.dying, true);
  respawnPlayer(world);
  assert.equal(level.dying, false);
  assert.equal(me.state, 'up');
  assert.equal(me.body.inputs.outfit.kind, kind, 'the gear of the last rest');
  assert.ok(Math.hypot(me.root[0] - spot[0], me.root[1] - spot[2]) < 0.05, 'at the rest');
  assert.deepEqual(level.inventory, { bandage: START_BANDAGES, tonic: START_TONICS }, 'the items he had at the rest');
  assert.equal(guard.state, 'up');
  assert.ok(Math.hypot(guard.root[0] - 44, guard.root[1] + 3) < 0.01, 'the enemy at his post');
  assert.equal(world.stage.mechanisms.gate1, 'open', 'the gate stays open');
  assert.ok(level.freed.has('miner'));
  // The freed one stands beside him.
  const miner = fighterOf(world, 'miner');
  assert.equal(miner.corner, 'red');
  assert.equal(miner.state, 'up');
  const apart = Math.hypot(miner.root[0] - me.root[0], miner.root[1] - me.root[1]);
  assert.ok(apart > 0.5 && apart < 3, `beside him: ${apart.toFixed(2)} m`);
  // The awareness AI's minds start over: the guard idles at his post, the freed man follows.
  assert.ok(['idle', 'patrol'].includes(world.stage.aware.minds[guard.id].state));
  assert.equal(world.stage.aware.minds[miner.id].kind, 'ally');
  assert.equal(world.stage.aware.minds[miner.id].state, 'follow');
  assert.ok(drainUi(world).some((message) => message.type === 'respawned'));
  // The knight's body is as the stage laid it (it is no enemy to put back).
  assert.equal(dead.state, 'out');
  // The sections follow where he woke.
  assert.deepEqual(world.stage.active, ['yard']);
  run(world, 1);
  assert.ok(me.x.every(Number.isFinite));
});

test('a death with no rest taken wakes him at the stage start in the gear he began with', () => {
  const world = yard();
  const me = world.fighters[0];
  const start = [...world.stage.level.checkpoint.at];
  const kind = me.body.inputs.outfit.kind;
  standAt(world, 10, 0, 5);
  me.state = 'out';
  run(world, 0.1);
  respawnPlayer(world);
  assert.equal(me.state, 'up');
  assert.ok(Math.hypot(me.root[0] - start[0], me.root[1] - start[2]) < 0.05);
  assert.equal(me.body.inputs.outfit.kind, kind);
  assert.equal(me.weapon?.held, true);
  assert.equal(me.style, 'armingBuckler');
  assert.equal(me.shield?.kind, snapshotGear(me).shield);
});

test('falling into the sea is a death: the level asks for YOU DIED', () => {
  const world = yard();
  const me = world.fighters[0];
  standAt(world, 0, 0, 9);
  // Over the sea cliff (the yard ends at z 11).
  placeOnFloor(me, 0, 14, 0, 0);
  run(world, 4);
  assert.equal(me.state, 'out');
  assert.ok(drainUi(world).some((message) => message.type === 'death'));
});

// ---- Matchlocks with damp powder ------------------------------------------------------------------------------

/** A gunner and a man in front of him; shots fired by hand, `shots` times, reloaded each time. Counts what the events say. */
function volley(world, gunner, shots) {
  const counts = { shot: 0, misfire: 0, hangfire: 0, click: 0, puff: 0, reprime: 0 };
  for (let index = 0; index < shots; index += 1) {
    gunner.weapon.loaded = true;
    gunner.weapon.charges = 1;
    gunner.weapon.spent = undefined;
    gunner.punch = { fired: false, type: 'fireLong', aim: undefined };
    const before = world.events.length;
    fire(world, gunner);
    for (const event of world.events.slice(before)) {
      if (event.kind === 'shot') counts.shot += 1;
      else if (event.kind === 'hangfire') counts.hangfire += 1;
      else if (event.kind === 'misfire') {
        counts.misfire += 1;
        if (/match drops/.test(event.effects[0])) counts.click += 1;
        else if (/primed again/.test(event.effects[0])) counts.reprime += 1;
        else counts.puff += 1;
      }
    }
    if (world.hangFires) world.hangFires.length = 0;
    // A man out of the line does not count what was shot at him.
    for (const victim of world.fighters) if (victim !== gunner) victim.gunshot = 0;
    world.events.length = 0;
    gunner.punch = null;
  }
  return counts;
}

test('in a stage, a matchlock misfires (a click, a puff, a fouled pan) and hangs fire at the config\'s rates', () => {
  const world = yard();
  const gunner = fighterOf(world, 'gunner');
  world.hangFires = [];
  const shots = 3000;
  const counts = volley(world, gunner, shots);
  const spec = WORLD.damp;
  assert.ok(Math.abs(counts.misfire / shots - spec.misfire) < 0.04, `misfire ${counts.misfire / shots}`);
  const kinds = spec.misfireKinds;
  const total = kinds.click + kinds.puff + kinds.reprime;
  for (const kind of ['click', 'puff', 'reprime']) assert.ok(Math.abs(counts[kind] / counts.misfire - kinds[kind] / total) < 0.07, `${kind} ${counts[kind] / counts.misfire}`);
  const sound = shots - counts.misfire;
  assert.ok(Math.abs(counts.hangfire / sound - spec.hangFire) < 0.03, `hang ${counts.hangfire / sound}`);
  assert.ok(counts.shot > 0);
});

test('a hang-fire goes off 0.5 to 1.5 s after the trigger, from the gun as it points then', () => {
  const world = yard();
  const gunner = fighterOf(world, 'gunner');
  standAt(world, 58, 0, 0);
  assert.equal(gunner.dormant, undefined, 'awake: the vault is');
  world.hangFires = [];
  const delays = [];
  let guard = 0;
  while (delays.length < 12 && guard < 400) {
    guard += 1;
    gunner.weapon.loaded = true;
    gunner.weapon.charges = 1;
    gunner.punch = { fired: false, type: 'fireLong' };
    const before = world.hangFires.length;
    fire(world, gunner);
    gunner.punch = null;
    if (world.hangFires.length > before) {
      const entry = world.hangFires.at(-1);
      delays.push(entry.at - world.time);
      assert.equal(gunner.weapon.loaded, false, 'the charge is spent at the trigger');
      // Wait for it: a shot appears within the delay, and the entry is gone.
      const marker = world.events.length;
      advance(world, entry.at - world.time + 0.1);
      assert.ok(world.events.slice(marker).some((event) => event.kind === 'shot'), 'the delayed shot');
      assert.equal(world.hangFires.length, 0);
    }
    world.hangFires.length = 0;
  }
  assert.ok(delays.length >= 12, 'hang-fires seen');
  assert.ok(delays.every((delay) => delay >= WORLD.damp.hangMin - 1e-9 && delay <= WORLD.damp.hangMax + 1e-9), delays.join(' '));
  assert.ok(Math.max(...delays) - Math.min(...delays) > 0.2, 'they vary');
});

test('a fouled pan is a short reload: the ball stays in, priming takes primeSeconds', () => {
  const world = yard();
  const gunner = fighterOf(world, 'gunner');
  const shot = gunner.weapon.spec.shot;
  let found = null;
  for (let index = 0; index < 600 && !found; index += 1) {
    gunner.weapon.loaded = true;
    gunner.punch = { fired: false };
    const before = world.events.length;
    fire(world, gunner);
    gunner.punch = null;
    if (world.events.slice(before).some((event) => /primed again/.test(event.effects?.[0] ?? ''))) found = true;
    if (world.hangFires) world.hangFires.length = 0;
  }
  assert.ok(found);
  assert.equal(gunner.weapon.loaded, false);
  assert.equal(gunner.weapon.reloaded, shot.reloadSeconds - WORLD.damp.primeSeconds);
  assert.ok(WORLD.damp.primeSeconds < shot.reloadSeconds / 2);
});

test('in Battle Mode a matchlock misfires at the shot\'s own rate and never hangs fire', () => {
  const gun = { ...PRESETS.contender, name: 'Hans', sex: 'male', style: 'matchlock', outfit: { kind: 'footman', design: 1 }, accessories: [] };
  const world = createWorld([{ inputs: gun, corner: 'red' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }], { seed: 4, arena: { halfX: 14, halfZ: 6 } });
  const gunner = world.fighters[0];
  assert.equal(world.stage, undefined);
  const counts = volley(world, gunner, 3000);
  assert.equal(counts.hangfire, 0);
  assert.equal(counts.click + counts.reprime, 0, 'only the old flash in the pan');
  assert.ok(Math.abs(counts.misfire / 3000 - gunner.weapon.spec.shot.misfire) < 0.02, `misfire ${counts.misfire / 3000}`);
});

// ---- The boss -----------------------------------------------------------------------------------------------------

test('the boss bar follows his health while he is awake and aware; at half the helm comes off and he is quicker; gone when he is out', () => {
  const world = yard();
  const level = world.stage.level;
  const boss = fighterOf(world, 'boss');
  assert.equal(level.boss.id, boss.id);
  // Far away and asleep: no bar.
  assert.equal(bossStatus(world).show, false);
  standAt(world, 56.5, 0, 8);
  standAt(world, 58, 0, 0);
  const full = bossStatus(world);
  assert.equal(full.show, true);
  assert.equal(full.name, 'Lord Vaelen (dummy)');
  assert.equal(full.title, 'Chief Jailer of the Queen');
  assert.ok(full.fraction > 0.99);
  const footBefore = boss.body.gear.foot;
  assert.equal(boss.body.gear.headLocked, true);
  assert.ok(boss.body.gear.helmet.mass > 5, 'the stechhelm');
  const fraction = () => bossStatus(world).fraction;
  boss.bloodLost = collapseAt() * 0.3;
  run(world, 0.2);
  assert.equal(level.boss.phase, 1);
  assert.ok(Math.abs(fraction() - 0.7) < 0.02);
  boss.bloodLost = collapseAt() * 0.55;
  run(world, 0.2);
  assert.equal(level.boss.phase, 2);
  assert.ok(Math.abs(fraction() - 0.45) < 0.02);
  assert.equal(boss.body.inputs.outfit.bareHead, true);
  assert.equal(boss.body.gear.headLocked, false, 'no longer bolted to the breast');
  assert.ok(boss.body.gear.helmet.mass < 0.01, 'bareheaded');
  assert.ok(boss.body.gear.foot > footBefore, 'quicker');
  assert.ok(boss.body.gear.foot <= 0.9, 'modestly');
  assert.ok(boss.temperament.work > 1.2);
  assert.ok(drainUi(world).some((message) => message.type === 'phase2'));
  assert.ok(drainRebuilds(world).includes(boss.id));
  // It happens once.
  run(world, 0.5);
  assert.equal(level.boss.phase, 2);
  boss.state = 'out';
  assert.equal(bossStatus(world).show, false);
});

test('a bare head takes a blow as a bare head does: the helm\'s protection is gone', () => {
  const clothed = { ...levelPreset('vaelen') };
  const bare = { ...levelPreset('vaelen'), outfit: { ...levelPreset('vaelen').outfit, bareHead: true } };
  const worn = createWorld([{ inputs: clothed, corner: 'red' }, { inputs: levelPreset('forger'), corner: 'blue' }], { seed: 1 });
  const off = createWorld([{ inputs: bare, corner: 'red' }, { inputs: levelPreset('forger'), corner: 'blue' }], { seed: 1 });
  const [a, b] = [worn.fighters[0].body.gear, off.fighters[0].body.gear];
  assert.ok(a.protection.regions.head.cut >= 1 && b.protection.regions.head.cut === 0);
  assert.ok(a.protection.bullet.head > 0 && b.protection.bullet.head === 0);
  assert.equal(a.headLocked, true);
  assert.equal(b.headLocked, false);
  assert.equal(b.protection.cut, a.protection.cut, 'the harness below it is as it was');
});

test('the fight stick\'s run threshold is where the config says: a stick at CONTROL.stick.runFrom is a run, just short of it a walk', () => {
  const world = yard();
  const me = world.fighters[0];
  for (const [amount, running] of [[CONTROL.stick.runFrom - 0.01, false], [CONTROL.stick.runFrom, true], [1, true]]) {
    const orders = newOrders();
    orders.stick = { dir: [1, 0], amount };
    run(world, 0.3, orders);
    assert.equal(Boolean(me.running), running, `stick ${amount}`);
  }
});

test('the operative is not put in the guardless walk mode: his stance is his style\'s guard', () => {
  const world = yard();
  assert.ok(!world.fighters[0].walking);
});
