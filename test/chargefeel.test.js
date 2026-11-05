import test from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { CHARGEFEEL, chargeGoal, chargeQuarry, createChargeFeel, easeCharge } from '../src/chargefeel.js';
import { directFighter, newOrders } from '../src/control.js';
import { advance } from '../src/physics.js';
import { riderAndMan } from '../tools/mounted-reach.js';

/** A rider (id 0, red) on a horse at the origin heading along +x at `speed` m/s (gallop 12), and a man on foot (id 1, blue) at (x, z). */
function scene({ speed = 11, x = 20, z = 0, yaw = 0, corner = 'blue', manState = 'up', riderState = 'up' } = {}) {
  const man = { id: 1, corner, state: manState, x: new Float64Array(60) };
  man.x[P.pelvis * 3] = x;
  man.x[P.pelvis * 3 + 2] = z;
  const rider = { id: 0, corner: 'red', state: riderState, mount: { at: [0, 0], yaw, speed, paces: { gallop: 12, canter: 6 } } };
  return { world: { fighters: [rider, man] }, rider, man };
}
const charging = () => ({ ...newOrders(), charge: { target: 1, phase: 'charge' } });
const locked = () => ({ ...newOrders(), lock: 1 });

test('charge feel: on only for his man on a horse, riding at the man he chose (a charge, or locked on), at speed', () => {
  const { world, rider } = scene();
  assert.ok(chargeGoal(world, rider, charging()) > 0.9, 'a charge at the gallop');
  assert.ok(chargeGoal(world, rider, locked()) > 0.9, 'locked on and galloping at him');
  assert.equal(chargeGoal(world, rider, newOrders()), 0, 'nobody chosen');
  assert.equal(chargeGoal(world, rider, { ...charging(), charge: { target: 1, phase: 'past' } }), 0, 'ridden past him');
  assert.equal(chargeGoal(world, rider, { ...charging(), charge: { target: 1, phase: 'wheel' } }), 0, 'wheeling round');
  assert.equal(chargeQuarry(world, rider, { ...charging(), charge: { target: 1, phase: 'past' } }), null);
  assert.equal(chargeGoal(world, { ...rider, mount: null }, charging()), 0, 'on foot');
  assert.equal(chargeGoal(scene({ riderState: 'down' }).world, scene({ riderState: 'down' }).rider, charging()), 0, 'he is down');
  const fallen = scene({ manState: 'down' });
  assert.equal(chargeGoal(fallen.world, fallen.rider, charging()), 0, 'his man is down');
  const friend = scene({ corner: 'red' });
  assert.equal(chargeGoal(friend.world, friend.rider, locked()), 0, 'locked on a friend');
});

test('charge feel: only while his man is ahead and in range', () => {
  const at = (x, z) => {
    const { world, rider } = scene({ x, z });
    return chargeGoal(world, rider, charging());
  };
  assert.ok(at(20, 0) > 0.9);
  assert.ok(at(20, 8) > 0.9, 'a little off the line (the pass is to one side)');
  assert.equal(at(20, 20), 0, 'well off the line');
  assert.equal(at(-20, 0), 0, 'behind him');
  assert.equal(at(CHARGEFEEL.range.farthest + 5, 0), 0, 'too far off yet');
  assert.equal(at(1, 0), 0, 'on him: the pass');
  // The horse's line is its yaw (yawRotate([1, 0, 0], yaw)): turned a quarter left, ahead is -z.
  const turned = scene({ yaw: Math.PI / 2, x: 0, z: -20 });
  assert.ok(chargeGoal(turned.world, turned.rider, charging()) > 0.9);
});

test('charge feel: its intensity rises with the horse\'s speed, from nothing at a canter to all of it near the gallop', () => {
  const at = (speed) => {
    const { world, rider } = scene({ speed });
    return chargeGoal(world, rider, charging());
  };
  const gallop = 12;
  assert.equal(at(0), 0);
  assert.equal(at(6), 0, 'a canter');
  assert.equal(at(gallop * CHARGEFEEL.speed.from), 0);
  assert.equal(at(-8), 0, 'backing');
  let last = 0;
  for (let speed = gallop * CHARGEFEEL.speed.from; speed <= gallop; speed += 0.25) {
    const level = at(speed);
    assert.ok(level >= last && level <= 1, `${speed}: ${level}`);
    last = level;
  }
  const middle = at(gallop * (CHARGEFEEL.speed.from + CHARGEFEEL.speed.full) / 2);
  assert.ok(middle > 0.3 && middle < 0.7, `${middle}`);
  assert.equal(at(gallop * CHARGEFEEL.speed.full), 1);
  assert.equal(at(gallop * 1.2), 1);
});

test('charge feel: eased in and out, never snapped; the widening and the streaks follow the level; reduced motion does not widen', () => {
  assert.equal(easeCharge(0.3, 1, 0), 0.3, 'paused: held');
  const one = easeCharge(0, 1, 1 / 60);
  assert.ok(one > 0 && one < 0.1, `a frame in: ${one}`);
  let level = 0;
  for (let t = 0; t < CHARGEFEEL.ease.in * 3; t += 1 / 60) level = easeCharge(level, 1, 1 / 60);
  assert.ok(level > 0.9);
  const out = easeCharge(1, 0, 1 / 60);
  assert.ok(out < 1 && out > 0.9, `a frame out: ${out}`);
  for (let t = 0; t < 10; t += 1 / 60) level = easeCharge(level, 0, 1 / 60);
  assert.equal(level, 0, 'settles to nothing');

  const { world, rider } = scene();
  const feel = createChargeFeel();
  assert.equal(feel.widen(), 0);
  for (let t = 0; t < 3; t += 1 / 60) feel.update(world, rider, charging(), 1 / 60);
  assert.ok(Math.abs(feel.widen() - CHARGEFEEL.widen) < 0.05, `${feel.widen()}`);
  assert.ok(feel.lines() > 0 && feel.flow() > 0);
  feel.update(world, null, charging(), 1 / 60);
  assert.ok(feel.level < 1 && feel.level > 0.9, 'no man of his: eased out, not cut');
  feel.reset();
  assert.equal(feel.level, 0);

  const calm = createChargeFeel({ reduced: true });
  for (let t = 0; t < 3; t += 1 / 60) calm.update(world, rider, charging(), 1 / 60);
  assert.equal(calm.widen(), 0, 'no widening');
  assert.ok(calm.lines() > 0 && calm.lines() < CHARGEFEEL.lines.opacity * 0.6, 'fainter streaks');
  assert.equal(calm.flow(), 0, 'held still');
});

test('charge feel: a real charge ordered from the saddle is felt on the run at him and not before it, nor after it is over', () => {
  const w = riderAndMan('sabre', 'knight', 1);
  const [me] = w.fighters;
  const orders = newOrders();
  assert.equal(chargeGoal(w, me, orders), 0, 'standing');
  orders.requests.push({ move: 'gladiusCut', zone: 'head', strength: 'quick', at: 0 });
  let most = 0;
  let afterwards = 0;
  advance(w, 12, (world, dt) => {
    if (orders.charged) return;
    thinkAll(world, dt, new Set([me.id]));
    directFighter(world, me, orders, dt);
    const goal = chargeGoal(world, me, orders);
    most = Math.max(most, goal);
    if (orders.charged) afterwards = goal;
  });
  assert.ok(most > 0.5, `felt on the run (${most.toFixed(2)})`);
  assert.equal(afterwards, 0, 'over');
});

test('a charge ordered is felt at once, from a standstill, and dies away into the gallop\'s own feel', () => {
  const world = riderAndMan('sabre', 'knight', 1);
  const [rider, man] = world.fighters;
  const feel = createChargeFeel();
  const orders = newOrders();
  feel.update(world, rider, orders, 1 / 60);
  assert.equal(feel.level, 0, 'nothing ordered, standing');
  orders.charge = { target: man.id, phase: 'charge' };
  feel.update(world, rider, orders, 1 / 60);
  assert.ok(feel.level >= CHARGEFEEL.order.level * 0.95, `felt at the order: ${feel.level}`);
  for (let frame = 0; frame < 180; frame += 1) feel.update(world, rider, orders, 1 / 60);
  assert.ok(feel.level < 0.05, `died away with the horse still standing: ${feel.level}`);
  // The same order kept is not felt again; a new one is.
  orders.charge = { target: man.id, phase: 'charge' };
  feel.update(world, rider, orders, 1 / 60);
  assert.ok(feel.level >= CHARGEFEEL.order.level * 0.95);
});
