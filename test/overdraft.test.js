// The player's stamina overdraft (src/physics/overdraft.js, WORLD.overdraft): past empty he goes on, weaker and slumping, to a faint at
// the floor; nobody else does. Deterministic: seeded worlds, stamina set by hand.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { MOVES } from '../src/moves.js';
import { CONTROL, directFighter, keyStick, newOrders } from '../src/control.js';
import { advance, createWorld, perform, placeFighter, reviveFighter, throwPunch } from '../src/physics.js';
import { WORLD } from '../src/physics/config.js';
import { drawStamina, fadeOf, fatigueScale, overdraftDepth, overdraftScreen, recoveryShare, staminaBar } from '../src/physics/overdraft.js';
import { fightUiReady } from '../src/fightui/logic.js';
import { pulsedFade } from '../src/overdraftview.js';

const SPEC = WORLD.overdraft;
const duel = (seed = 3) => createWorld([{ inputs: structuredClone(PRESETS.heavy), corner: 'red' }, { inputs: structuredClone(PRESETS.sumo), corner: 'blue' }], { seed });
/** A duel with red the player (flagged as the game flags him) and nobody thinking. */
function played(seed) {
  const world = duel(seed);
  const [me, him] = world.fighters;
  me.player = true;
  return { world, me, him };
}
const drainOf = (fighter, move) => MOVES[move].cost / fighter.body.aerobic;

test('the force scale: 0.55 at empty, 0.25 at the floor, continuous, and the old line above empty', () => {
  assert.equal(fatigueScale(0), 0.55);
  assert.ok(Math.abs(fatigueScale(-1) - 0.25) < 1e-12);
  assert.equal(SPEC.forceAtFloor, 0.25);
  assert.equal(fatigueScale(1), 1);
  for (const stamina of [0.1, 0.5, 0.9]) assert.equal(fatigueScale(stamina), 0.55 + 0.45 * stamina, 'above empty it is the old formula, bit for bit');
  assert.ok(Math.abs(fatigueScale(-1e-9) - fatigueScale(0)) < 1e-8, 'no jump at empty');
  let last = Infinity;
  for (let stamina = 1; stamina >= -1; stamina -= 0.05) {
    assert.ok(fatigueScale(stamina) < last + 1e-12, 'weaker as it falls');
    last = fatigueScale(stamina);
  }
  assert.ok(fatigueScale(-0.5) > 0.25 && fatigueScale(-0.5) < 0.55);
});

test('depth: 0 at empty and above, 1 at the floor', () => {
  assert.equal(overdraftDepth(0.4), 0);
  assert.equal(overdraftDepth(0), 0);
  assert.equal(overdraftDepth(-0.25), 0.25);
  assert.equal(overdraftDepth(-1), 1);
  assert.equal(overdraftDepth(-3), 1);
});

test('an AI fighter is unchanged: a strike is refused for want of breath, stamina stops at empty, and he never faints', () => {
  const { world, him } = played();
  const fighter = him;
  assert.ok(!fighter.player);
  advance(world, 0.3);
  const drain = drainOf(fighter, 'hook');
  fighter.stamina = drain * 0.9;
  assert.equal(throwPunch(world, fighter, 'hook', 'head'), false, 'not enough left for the hook');
  fighter.stamina = drain * 1.1;
  assert.equal(throwPunch(world, fighter, 'hook', 'head'), true, 'enough for it');
  assert.ok(Math.abs(fighter.stamina - drain * 0.1) < 1e-12);
  drawStamina(fighter, 5);
  assert.equal(fighter.stamina, 0, 'a draw past empty stops at empty');
  assert.ok(!fighter.faintDue);
  advance(world, 2);
  assert.equal(fighter.state, 'up');
  assert.ok(fighter.stamina >= 0);
  assert.equal(recoveryShare(0.01), 1);
});

test('an AI fighter: a battle of AI fighters never takes stamina below zero or sets the flag', () => {
  const world = duel(5);
  advance(world, 40, (current, dt) => thinkAll(current, dt));
  for (const fighter of world.fighters) {
    assert.ok(!fighter.player && !fighter.fainted);
    assert.ok(fighter.stamina >= 0, `${fighter.id}: ${fighter.stamina}`);
  }
});

test('the player is not refused for want of breath: at empty a strike is thrown and takes him below zero', () => {
  const { world, me } = played();
  advance(world, 0.3);
  me.stamina = 0;
  assert.equal(throwPunch(world, me, 'hook', 'head'), true);
  assert.ok(Math.abs(me.stamina + drainOf(me, 'hook')) < 1e-12, `stamina ${me.stamina}`);
  assert.ok(me.stamina < 0);
  // A clinch or rush goes the same way.
  me.punch = null;
  me.stamina = 0.001;
  assert.equal(perform(world, me, 'clinch'), false, 'out of reach of a clinch, but not for breath');
  assert.ok(me.stamina === 0.001, 'a refused clinch costs nothing');
});

test('a dodge or a block draws from the player\'s breath, into the overdraft; the plain guard held up does not', () => {
  const { world, me } = played();
  advance(world, 0.3);
  me.stamina = 0;
  assert.equal(perform(world, me, 'guard'), true);
  assert.equal(me.stamina, 0, 'the guard held up is free');
  me.defence = null;
  assert.equal(perform(world, me, 'slip'), true);
  assert.ok(Math.abs(me.stamina + SPEC.defenceCost / me.body.aerobic) < 1e-12);
  // An AI fighter's dodge costs nothing, as before.
  const him = world.fighters[1];
  him.stamina = 0.5;
  perform(world, him, 'slip');
  assert.equal(him.stamina, 0.5);
});

test('he cannot pass the floor: a draw that would holds him there, and he faints', () => {
  const { world, me } = played();
  advance(world, 0.3);
  me.stamina = SPEC.floor + 0.001;
  assert.equal(throwPunch(world, me, 'cross', 'head'), true, 'at the floor he can still try');
  assert.equal(me.stamina, SPEC.floor, 'the cost does not take him under it');
  assert.equal(me.faintDue, true);
  drawStamina(me, 10);
  assert.equal(me.stamina, SPEC.floor);
  advance(world, 0.1);
  assert.equal(me.state, 'down', 'he is down');
  assert.equal(me.fainted, true);
  assert.ok(me.stamina >= SPEC.floor);
});

test('blows taken draw from the player\'s breath into the overdraft as well', () => {
  const { world, me, him } = played();
  placeFighter(me, -0.5);
  placeFighter(him, 0.5);
  advance(world, 0.3);
  me.stamina = 0.0005;
  him.stamina = 1;
  // The sumo shoves the player in the belly (a push).
  throwPunch(world, him, 'oshi', 'body');
  advance(world, 1);
  if (!world.events.some((event) => event.defender === me.id && event.target === 'trunk' && event.kind === 'landed')) assert.fail('the push did not land');
  assert.ok(me.stamina < 0, `breath taken from him past empty (${me.stamina})`);
  assert.ok(me.stamina >= SPEC.floor);
});

test('recovery below zero is a quarter of the usual; from zero on it is the usual', () => {
  const rate = (start) => {
    const { world, me } = played();
    advance(world, 0.2);
    me.stamina = start;
    advance(world, 1);
    return me.stamina - start;
  };
  const above = rate(0.2);
  const below = rate(-0.5);
  assert.ok(above > 0.03, `usual recovery ${above}`);
  assert.ok(Math.abs(below / above - SPEC.recoveryShare) < 0.01, `below zero ${below} against ${above}`);
  assert.equal(recoveryShare(-0.0001), SPEC.recoveryShare);
  assert.equal(recoveryShare(0), 1);
});

test('the faint: down for the faint time, not a knockdown, no knockout, wakes at the waking stamina, the screen still dim', () => {
  const { world, me } = played();
  advance(world, 0.3);
  me.stamina = SPEC.floor;
  drawStamina(me, 0.05);
  const events = world.events.length;
  advance(world, 0.1);
  const fell = world.time;
  assert.equal(me.state, 'down');
  assert.equal(me.blackout, 1, 'near black');
  assert.equal(me.knockdowns, 0, 'not a knockdown');
  let rose = null;
  let blackest = 1;
  while (world.time - fell < 20 && rose === null) {
    advance(world, 0.05);
    assert.notEqual(me.state, 'out', 'never out');
    if (me.state === 'down') assert.equal(me.blackout, 1, 'black while he lies');
    if (me.state === 'rising' || me.state === 'up') rose = world.time;
    blackest = Math.min(blackest, me.blackout);
  }
  assert.ok(rose !== null);
  assert.ok(rose - fell >= SPEC.faintSeconds - 0.15, `down ${rose - fell} s`);
  assert.ok(rose - fell < SPEC.faintSeconds + 3, `down ${rose - fell} s: no longer than the fall's rest`);
  assert.ok(me.stamina > SPEC.wakeStamina - 0.05 && me.stamina < SPEC.wakeStamina + 0.05, `woke at ${me.stamina}`);
  assert.ok(fadeOf(me) > 0.3, 'the screen still dim');
  assert.ok(!world.events.slice(events).some((event) => event.kind === 'knockout' || event.kind === 'stopped'), 'no knockout, no stop');
  // He gets to his feet, the black clearing slowly.
  advance(world, 12);
  assert.equal(me.state, 'up');
  assert.equal(me.blackout, 0);
  assert.ok(me.stamina < 0 && fadeOf(me) > 0, 'still in debt, still dim');
});

test('no second faint at once: after waking, a cost cannot send him down again for a while, and later it can', () => {
  const { world, me } = played();
  advance(world, 0.3);
  me.stamina = SPEC.floor;
  drawStamina(me, 0.05);
  advance(world, 10);
  assert.equal(me.state, 'up');
  assert.ok(me.faintGrace > 0, `grace left ${me.faintGrace}`);
  const woke = me.stamina;
  assert.ok(woke < 0 && woke > SPEC.floor);
  drawStamina(me, 10);
  assert.equal(me.stamina, SPEC.floor, 'held at the floor');
  assert.ok(!me.faintDue, 'but not marked to faint');
  advance(world, 0.5);
  assert.equal(me.state, 'up');
  advance(world, SPEC.graceSeconds);
  drawStamina(me, 10);
  assert.equal(me.faintDue, true, 'after the grace he can');
  advance(world, 0.1);
  assert.equal(me.state, 'down');
});

test('a man already down is not made to faint again', () => {
  const { world, me } = played();
  advance(world, 0.3);
  me.state = 'down';
  me.downTimer = 5;
  me.stamina = SPEC.floor;
  drawStamina(me, 1);
  advance(world, 0.1);
  assert.ok(!me.fainted, 'a man already down is not made to faint');
  assert.ok(!me.faintDue, 'and the mark is gone');
});

test('sprinting stops at the winded point and does not overdraw; walking works in debt', () => {
  const { world, me } = played();
  const orders = newOrders();
  me.player = false;
  const step = (seconds) => advance(world, seconds, (current, dt) => {
    thinkAll(current, dt, new Set([0, 1]));
    directFighter(current, me, orders, dt);
  });
  step(0.3);
  assert.equal(me.player, true, 'directing a fighter is what flags him the player');
  orders.keyStick = keyStick(new Set(['w']), { ahead: [0, 1], right: [-1, 0] }, true);
  me.stamina = CONTROL.run.windedBelow + 0.03;
  let least = 1;
  let stopped = 0;
  for (let second = 0; second < 12; second += 1) {
    step(1);
    orders.keyStick = keyStick(new Set(['w']), { ahead: second % 2 ? [0, -1] : [0, 1], right: [-1, 0] }, true);
    least = Math.min(least, me.stamina);
    if (!me.runMode && me.move > 0) stopped += 1;
  }
  assert.ok(least >= 0, `running never takes him under empty (${least})`);
  assert.ok(stopped > 0, 'winded: the sprint stopped and he walked on');
  // In debt: sprint refused, walking goes.
  me.stamina = -0.6;
  step(1);
  assert.equal(me.runMode, false);
  assert.ok(me.move > 0 && me.stamina < 0, 'walking in debt');
  assert.ok(me.stamina >= -0.6, 'walking costs nothing');
});

test('the controls never grey a move for tiredness for the player; an AI fighter\'s (any unflagged fighter) still say tired', () => {
  const fighter = { state: 'up', stamina: 0, body: { aerobic: 1 }, punch: null };
  assert.equal(fightUiReady(fighter, 'jab').why, 'tired');
  assert.equal(fightUiReady({ ...fighter, player: true }, 'jab').ok, true);
  assert.equal(fightUiReady({ ...fighter, player: true, stamina: -0.7 }, 'cross').ok, true);
  assert.equal(fightUiReady({ ...fighter, player: true, state: 'down' }, 'jab').why, 'down', 'but not while he is down');
});

test('the screen: a function of stamina alone, clear at empty, rising with the depth to black at the floor', () => {
  assert.equal(overdraftScreen(0.6), 0);
  assert.equal(overdraftScreen(0), 0);
  assert.ok(Math.abs(overdraftScreen(-1) - 1) < 1e-12);
  let last = 0;
  for (let stamina = 0; stamina >= -1; stamina -= 0.02) {
    const strength = overdraftScreen(stamina);
    assert.ok(strength >= last, `monotonic at ${stamina}`);
    last = strength;
  }
  assert.ok(overdraftScreen(-0.2) > 0 && overdraftScreen(-0.2) < overdraftScreen(-0.5));
  assert.ok(overdraftScreen(-0.8) > 0.7, 'near black close to the floor');
  assert.equal(fadeOf({ stamina: 1 }), 0);
  assert.equal(fadeOf({ stamina: 0.5, blackout: 0.6 }), 0.6, 'the faint\'s black counts');
  assert.equal(fadeOf({ stamina: -1, blackout: 0.2 }), 1);
  // The heartbeat only dips it, more the deeper, never above itself, never below zero.
  for (const strength of [0.1, 0.5, 1]) {
    const dip = pulsedFade(strength, 0);
    assert.ok(dip <= strength && dip >= strength * (1 - SPEC.screen.pulse) - 1e-12);
    assert.equal(pulsedFade(strength, 1), strength);
  }
});

test('the stamina bar: the fill above empty, a second red segment for the depth', () => {
  assert.deepEqual(staminaBar(0.6), { fill: 0.6, debt: 0 });
  assert.deepEqual(staminaBar(-0.25), { fill: 0, debt: 0.25 });
  assert.deepEqual(staminaBar(-1), { fill: 0, debt: 1 });
});

test('posture: the deeper in debt, the lower the head and hands and the more hunched the trunk; fresh he stands as ever', () => {
  const pose = (stamina, player = true) => {
    const { world, me } = played();
    me.player = player;
    advance(world, 0.3);
    me.stamina = stamina;
    me.faintGrace = 99;
    advance(world, 1.5);
    me.stamina = stamina;
    const local = (particle) => [me.desired[particle][0], me.desired[particle][1], me.desired[particle][2]];
    return { head: local(P.head), neck: local(P.neck), hand: local(P.lHand), pelvis: local(P.pelvis) };
  };
  const fresh = pose(1);
  const tired = pose(-0.5);
  const spent = pose(-0.9);
  assert.ok(spent.head[1] < tired.head[1] && tired.head[1] < fresh.head[1], 'the head drops');
  assert.ok(spent.neck[0] > tired.neck[0] && tired.neck[0] > fresh.neck[0], 'the trunk hunches forward');
  const handBelowHead = (p) => p.head[1] - p.hand[1];
  assert.ok(handBelowHead(spent) > handBelowHead(tired) && handBelowHead(tired) > handBelowHead(fresh), 'the hands droop from the head');
  // The same stamina in an AI fighter: nothing (it cannot be below zero, but the pose must not read it).
  const ai = pose(-0.9, false);
  assert.ok(ai.head[1] > spent.head[1] + 0.05, 'only the player slumps');
});

test('the stagger: near the floor he sways, which he does not at half depth', () => {
  const sway = (stamina) => {
    const { world, me } = played();
    me.faintGrace = 99;
    let least = Infinity;
    let most = -Infinity;
    for (let step = 0; step < 240; step += 1) {
      me.stamina = stamina;
      advance(world, 1 / 30);
      if (world.time < 1) continue;
      least = Math.min(least, me.desired[P.neck][2]);
      most = Math.max(most, me.desired[P.neck][2]);
    }
    return most - least;
  };
  assert.ok(sway(-0.95) > sway(-0.5) + 0.01, 'a visible sway near the floor');
});

test('reviving a fighter keeps the player flag; a new fighter has none', () => {
  const { world, me, him } = played();
  reviveFighter(world, me, structuredClone(PRESETS.heavy), { at: [0, 0, 0], yaw: 0 });
  assert.equal(me.player, true);
  assert.ok(!him.player);
});

test('the weakness is the muscles\': a blow at the floor reaches its man at about half the speed, a quarter of the energy', () => {
  const handSpeedOnce = (stamina, seed) => {
    const { world, me } = played(seed);
    me.faintGrace = 99;
    placeFighter(me, -0.55);
    placeFighter(world.fighters[1], 0.55);
    // (Settled at that stamina first: the slump of the posture is part of the blow.)
    me.stamina = stamina;
    advance(world, 0.3);
    me.stamina = stamina;
    throwPunch(world, me, 'cross', 'body');
    const struck = (event) => event.attacker === me.id && (event.kind === 'landed' || event.kind === 'blocked');
    for (let step = 0; step < 90 && !world.events.some(struck); step += 1) advance(world, 1 / 60);
    assert.ok(world.events.some(struck), 'the blow reaches him');
    return me.stats.maxHandSpeed;
  };
  // (Averaged over a few seeds: how near the dummy stands when it lands varies.)
  const handSpeed = (stamina) => [1, 2, 3, 4, 5, 6].reduce((sum, seed) => sum + handSpeedOnce(stamina, seed), 0) / 6;
  const fresh = handSpeed(1);
  const floor = handSpeed(-1);
  assert.ok(floor < fresh * 0.7, `${floor.toFixed(1)} m/s at the floor against ${fresh.toFixed(1)} fresh`);
  assert.ok(floor ** 2 < fresh ** 2 * 0.5, 'less than half the energy');
});

test('Level Mode: a faint is not a death or the end of the run, and he gets up with the level going on', async () => {
  const { levelPreset } = await import('../src/levelmode/presets.js');
  const { TESTYARD } = await import('../src/levelmode/stages/testyard.js');
  const { stageThink, updateStage } = await import('../src/levelmode/stage.js');
  const { createLevelWorld, levelThink } = await import('../src/levelmode/level.js');
  const { placeOnFloor } = await import('../src/physics.js');
  const world = createLevelWorld(TESTYARD, levelPreset('forger'), { seed: 3 });
  const me = world.fighters[0];
  placeOnFloor(me, -19, -2, 0, 0);
  updateStage(world, true);
  const orders = newOrders();
  const run = (seconds) => advance(world, seconds, (current, dt) => {
    stageThink(current, dt);
    levelThink(current, dt);
    directFighter(current, me, orders, dt);
  });
  run(0.5);
  assert.equal(me.player, true);
  me.stamina = SPEC.floor;
  drawStamina(me, 0.1);
  run(0.2);
  assert.equal(me.state, 'down');
  const level = world.stage.level;
  assert.ok(!level.dying && level.deaths === 0, 'no death');
  orders.keyStick = keyStick(new Set(['w']), { ahead: [1, 0], right: [0, 1] }, true);
  const at = me.root.slice();
  run(1);
  assert.deepEqual(me.root, at, 'his orders are ignored as for a knockdown');
  orders.keyStick = null;
  run(12);
  assert.equal(me.state, 'up');
  assert.ok(!level.dying && level.deaths === 0);
});
