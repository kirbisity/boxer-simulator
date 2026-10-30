// The player's combat controls (control.js), driven as the on-screen buttons drive them: the stick (`orders.stick`), a tap of
// the attack pad (`orders.requests`, as fightui/kit.js throwMove) and the guard held (`orders.guard`, as touch.js).
// - a running strike: a blow tapped in a run is made in it, the run going on into it; its extra force is the body's speed in
//   the blade's (physics.js handVelocityOf), nothing added;
// - a long weapon's room: with his man inside its head and the stick not pushed at him, he gives ground (CONTROL.spacing);
// - the guard held: it costs breath, each blow on it costs more, it goes onto the blow's line, and he can strike from it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { CONTROL, directFighter, newOrders } from '../src/control.js';
import { advance, createWorld, handVelocityOf, placeFighter, WORLD } from '../src/physics.js';

/** Red played, blue (`blue`) still or (`fights`) left to the AI, `distance` m apart. */
function bout(red, distance, { blue = 'light', fights = false, seed = 4 } = {}) {
  const world = createWorld([{ inputs: structuredClone(PRESETS[red]), corner: 'red' }, { inputs: structuredClone(PRESETS[blue]), corner: 'blue' }], { seed });
  placeFighter(world.fighters[0], -distance / 2);
  placeFighter(world.fighters[1], distance / 2);
  const orders = newOrders();
  const me = world.fighters[0];
  const step = (seconds, each = null) => advance(world, seconds, (current, dt) => {
    each?.();
    thinkAll(current, dt, new Set(fights ? [0] : [0, 1]));
    directFighter(current, me, orders, dt);
  });
  return { world, orders, me, him: world.fighters[1], step };
}
const apart = (a, b) => Math.hypot(a.x[P.pelvis * 3] - b.x[P.pelvis * 3], a.x[P.pelvis * 3 + 2] - b.x[P.pelvis * 3 + 2]);
const tap = (game, move, zone = 'body') => game.orders.requests.push({ move, zone, strength: 'quick', at: game.world.time });
const struck = (game) => game.world.events.find((event) => event.attacker === game.me.id && (event.kind === 'landed' || event.kind === 'blocked'));

/** Run at him across the ring, the thrust tapped half a second into the run; the blow and whether he was running when it met him. */
function runningThrust() {
  const game = bout('spear', 12);
  game.step(0.5);
  game.orders.stick = { dir: [1, 0], amount: 1 };
  game.step(0.5);
  assert.ok(game.me.runMode && apart(game.me, game.him) > 3.5, `running, his man ${apart(game.me, game.him).toFixed(2)} m off`);
  tap(game, 'spearThrust');
  game.step(1 / 60);
  const readied = { punch: game.me.punch, running: game.me.runMode };
  let hit = null;
  let runningAtHit = false;
  for (let index = 0; index < 180 && !hit; index += 1) {
    game.step(1 / 60);
    hit = struck(game);
    runningAtHit = game.me.runMode;
  }
  return { readied, hit, runningAtHit };
}

test('a running strike: tapped in a run, it is readied, the run goes on, and it is made as he comes into reach', () => {
  const { readied, hit, runningAtHit } = runningThrust();
  assert.equal(readied.punch, null, 'out of reach it waits: not thrown at once into the air');
  assert.equal(readied.running, true, 'and the run goes on');
  assert.ok(hit, 'the thrust meets him');
  assert.equal(runningAtHit, true, 'still running as it lands');
});

test('a running strike carries the run: the thrust meets him faster than the same thrust standing', () => {
  const { hit } = runningThrust();
  const standing = bout('spear', 2.2);
  standing.step(0.5);
  tap(standing, 'spearThrust');
  let still = null;
  for (let index = 0; index < 90 && !still; index += 1) {
    standing.step(1 / 60);
    still = struck(standing);
  }
  assert.ok(still, 'standing, the thrust meets him too');
  assert.ok(hit.speed > 1.5 * still.speed, `running ${hit.speed.toFixed(2)} m/s against standing ${still.speed.toFixed(2)} m/s`);
});

test('the blade carries the body: the arm\'s own speed is capped, the run\'s is on top of it', () => {
  const { me } = bout('spear', 3);
  const hand = P.rHand;
  const top = me.body.topSpeed[hand] * 1.15;
  me.rootVelocity = [5, 0];
  me.v[hand * 3] = 5 + 0.5 * top;
  me.v[hand * 3 + 1] = 0;
  me.v[hand * 3 + 2] = 0;
  assert.ok(Math.abs(handVelocityOf(me, hand)[0] - (5 + 0.5 * top)) < 1e-9, 'under the cap: all of it');
  me.v[hand * 3] = 5 + 2 * top;
  assert.ok(Math.abs(handVelocityOf(me, hand)[0] - (5 + top)) < 1e-9, 'over it: the arm capped, the run added');
});

test('a long weapon gives ground to keep his man out at its head, unless the stick is pushed at him; a sword does not', () => {
  const inside = (game) => game.me.body.reach + game.me.weapon.spec.strikeFrom + game.him.body.lengths.headRadius;
  const idle = bout('naginata', 1.3);
  assert.ok(apart(idle.me, idle.him) < inside(idle), 'he starts inside the naginata\'s blade');
  idle.step(1.5);
  assert.ok(apart(idle.me, idle.him) >= inside(idle), `the stick idle, he stepped back out to it (${apart(idle.me, idle.him).toFixed(2)} m)`);
  const locked = bout('naginata', 1.3);
  locked.orders.lock = 1;
  locked.step(1.5);
  assert.ok(apart(locked.me, locked.him) >= inside(locked), 'locked on, the same');
  const pushed = bout('naginata', 1.6);
  pushed.orders.stick = { dir: [1, 0], amount: 0.4 };
  pushed.step(1.5);
  assert.ok(apart(pushed.me, pushed.him) < 1.2, 'the stick pushed at him: he closes, as the player asks');
  const sword = bout('samurai', 1.3);
  sword.step(1.5);
  assert.ok(Math.abs(apart(sword.me, sword.him) - 1.3) < 0.15, 'a katana (its edge from the hilt) stays where it is');
});

test('the guard held costs breath; let down, he gets it back', () => {
  const game = bout('samurai', 3);
  game.step(0.5);
  const fresh = game.me.stamina;
  game.orders.guard = true;
  game.step(5);
  const held = game.me.stamina;
  assert.ok(held < fresh - 0.03, `5 s of guard: ${fresh.toFixed(3)} to ${held.toFixed(3)}`);
  assert.equal(game.me.guardHeld, true);
  game.orders.guard = false;
  game.step(2);
  assert.ok(game.me.stamina > held, 'down again, he recovers');
  assert.equal(game.me.guardHeld, false);
});

test('each blow taken on the guard costs breath by its energy', () => {
  const game = bout('samurai', 3);
  game.orders.guard = true;
  game.step(1);
  const before = game.me.stamina;
  game.world.events.push({ time: game.world.time, kind: 'blocked', attacker: 1, defender: 0, energy: 100, effects: [] });
  game.step(1 / 60);
  const hold = CONTROL.guard.staminaPerSecond / 60 / game.me.body.aerobic;
  const blow = 100 * CONTROL.guard.perJoule / game.me.body.aerobic;
  const lost = before - game.me.stamina;
  assert.ok(Math.abs(lost - hold - blow) < 0.003, `a 100 J blow: ${lost.toFixed(4)} lost, ${(hold + blow).toFixed(4)} expected (less a little recovery)`);
});

test('the guard held stops most blows: it goes onto the line of each one', () => {
  const landed = (guard) => {
    let count = 0;
    let blocked = 0;
    for (const seed of [1, 2]) {
      const game = bout('samurai', 2.5, { blue: 'samurai', fights: true, seed });
      game.orders.lock = 1;
      game.orders.guard = guard;
      game.step(12);
      count += game.world.events.filter((event) => event.kind === 'landed' && event.defender === 0).length;
      blocked += game.world.events.filter((event) => event.kind === 'parry' && event.fighter === 0 || event.kind === 'bladeBlock' && event.attacker === 0 || event.kind === 'blocked' && event.defender === 0).length;
    }
    return { count, blocked };
  };
  const open = landed(false);
  const guarded = landed(true);
  assert.ok(guarded.count * 3 <= open.count, `landed on him: ${open.count} open, ${guarded.count} guarded`);
  assert.ok(guarded.blocked > open.blocked, `met on the guard: ${guarded.blocked}, against ${open.blocked} open`);
});

test('spent, the guard is no longer brought onto the blow: it is held where it is', () => {
  const watch = (spent) => {
    const game = bout('samurai', 2.5, { blue: 'samurai', fights: true, seed: 1 });
    game.orders.lock = 1;
    game.orders.guard = true;
    const froms = new Set();
    game.step(8, () => {
      if (spent) game.me.stamina = CONTROL.guard.spentBelow - 0.2;
      if (game.him.punch && game.me.defence) froms.add(game.me.defence.from);
    });
    return froms;
  };
  assert.ok(watch(false).has(1), 'with breath, the block goes to meet his blows');
  assert.ok(!watch(true).has(1), 'spent, it does not');
});

test('he strikes from the guard, and the guard is back up after', () => {
  const game = bout('samurai', 1.8);
  game.orders.lock = 1;
  game.orders.guard = true;
  game.step(1);
  assert.equal(game.me.defence?.name, 'weaponBlock');
  tap(game, 'kesagiri');
  game.step(1 / 60);
  assert.equal(game.me.punch?.type, 'kesagiri', 'the cut is made with the guard held');
  game.step(1.2);
  assert.equal(game.me.punch, null);
  assert.ok(struck(game), 'and it met him');
  assert.equal(game.me.defence?.name, 'weaponBlock', 'the guard is back up');
  assert.equal(WORLD.guardHeld.recovery < 1, true);
});
