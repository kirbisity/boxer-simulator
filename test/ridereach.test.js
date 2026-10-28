import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { directFighter, newOrders, swingAt } from '../src/control.js';
import { advance, createWorld, placeFighter, point, throwPunch } from '../src/physics.js';
import { WORLD } from '../src/physics/config.js';
import { vec, yawRotate } from '../src/pose.js';
import { riderAndMan } from '../tools/mounted-reach.js';

const FIELD = { halfX: 30, halfZ: 20 };

/** A rider standing his horse, and a man on foot standing still `out` m to his right (`ahead` m forward); nobody thinks. */
function besideHim(riderInputs, out, ahead = 0.3) {
  const w = createWorld([{ inputs: { ...structuredClone(riderInputs), mounted: true }, corner: 'red' }, { inputs: structuredClone(PRESETS.street), corner: 'blue' }], { seed: 3, arena: FIELD });
  const [rider, man] = w.fighters;
  const horse = rider.mount;
  const right = yawRotate([0, 0, -1], horse.yaw);
  const forward = yawRotate([1, 0, 0], horse.yaw);
  const hips = point(rider.x, P.pelvis);
  placeFighter(man, hips[0] + right[0] * out + forward[0] * ahead, hips[2] + right[2] * out + forward[2] * ahead);
  advance(w, 0.5);
  return { w, rider, man, right };
}

/** How far over the rider leans (rad) and how far his neck goes towards the man (m) through a blow at him. */
function leanThrough(w, rider, man, move, right) {
  const before = point(rider.x, P.neck);
  assert.ok(throwPunch(w, rider, move, 'head'), `${move} is thrown`);
  let tilt = 0;
  let toward = 0;
  for (let t = 0; t < 0.4; t += 1 / 60) {
    advance(w, 1 / 60);
    tilt = Math.max(tilt, rider.seated?.reach?.tilt ?? 0);
    toward = Math.max(toward, vec.dot(vec.sub(point(rider.x, P.neck), before), right));
  }
  return { tilt, toward };
}

test('from the saddle a sabre leans the rider out and down to a man on foot beyond its reach sitting up; the body itself goes there, and he comes back up after', () => {
  const { w, rider, man, right } = besideHim(PRESETS.saber, 1.7);
  const { tilt, toward } = leanThrough(w, rider, man, 'gladiusCut', right);
  // Tens of degrees, no more than the most he leans.
  assert.ok(tilt > 0.3 && tilt <= WORLD.mount.reach.most + 1e-9, `leaned ${(tilt * 57.3).toFixed(0)}°`);
  // The muscles took his trunk there: his neck went out towards the man (a pose, not a longer arm).
  assert.ok(toward > 0.12, `neck out ${toward.toFixed(2)} m`);
  assert.ok(rider.mount, 'still in the saddle');
  // The blow over, he sits up again (slower than he went over).
  advance(w, 2.5);
  assert.ok((rider.seated.reach.tilt ?? 0) < 0.05, `back up: ${rider.seated.reach.tilt.toFixed(2)}`);
});

test('a long weapon needs no lean: a lance at the same man leaves the rider upright; a man close beside the horse needs none either', () => {
  const lance = besideHim({ ...PRESETS.maximilian, style: 'lance' }, 1.7);
  assert.ok(leanThrough(lance.w, lance.rider, lance.man, 'lanceJab', lance.right).tilt < 0.1);
  const close = besideHim(PRESETS.saber, 0.8);
  assert.ok(leanThrough(close.w, close.rider, close.man, 'gladiusCut', close.right).tilt < 0.15);
});

test('leaning out costs the seat: a knock he sits upright throws him leaning all the way out', () => {
  const knocked = (tilt) => {
    const { w, rider } = besideHim(PRESETS.saber, 1.7);
    w.fighters[1].state = 'out';
    rider.seated.reach.tilt = tilt;
    // Short of what the saddle holds sitting up, past what it holds leaning all the way out.
    const seat = WORLD.mount.seat.speed * rider.body.gear.balance;
    rider.knock = [seat * (1 - WORLD.mount.reach.seat / 2), 0, 0];
    advance(w, 1 / 60);
    return rider.mount === null;
  };
  assert.equal(knocked(0), false);
  assert.equal(knocked(WORLD.mount.reach.most), true);
});

test('a man on foot never leans out of a saddle: foot fighting is as it was', () => {
  const w = createWorld([{ inputs: structuredClone(PRESETS.saber), corner: 'red' }, { inputs: structuredClone(PRESETS.street), corner: 'blue' }], { seed: 2 });
  let leaned = false;
  advance(w, 6, (world, dt) => {
    thinkAll(world, dt);
    leaned ||= world.fighters.some((fighter) => fighter.intent?.reachOut || fighter.seated);
  });
  assert.equal(leaned, false);
});

/** A tap of the attack (the fight pad's, orders.requests) by a mounted player at his man, the stick left alone, and the charge it orders run through. */
function tapCharge(riderKey, seed, seconds = 12) {
  const w = riderAndMan(riderKey, 'knight', seed);
  const [me, man] = w.fighters;
  const orders = newOrders();
  orders.requests.push({ move: 'gladiusCut', zone: 'head', strength: 'quick', at: 0 });
  let charge = null;
  let fastest = 0;
  const step = (world, dt) => {
    thinkAll(world, dt, new Set([me.id]));
    directFighter(world, me, orders, dt);
    charge ??= orders.charge;
    fastest = Math.max(fastest, Math.abs(me.mount?.speed ?? 0));
  };
  while (w.time < seconds && !orders.charged) advance(w, 1 / 60, step);
  const hit = w.events.find((event) => (event.kind === 'landed' || event.kind === 'blocked') && event.attacker === me.id);
  return { w, me, man, orders, charge, fastest, hit };
}

test('on horseback a tap of the attack at a man far off charges him: the horse gallops at him, the blow is made in passing, he rides through, wheels round to face him and hands the reins back', () => {
  let hits = 0;
  for (const seed of [1, 2, 3, 4]) {
    const { me, man, orders, charge, fastest, hit } = tapCharge('sabre', seed);
    assert.ok(charge, 'the tap ordered a charge');
    assert.equal(charge.reins, true, 'the stick idle: the charge has the reins');
    assert.ok(fastest > me.mount.paces.canter, `the horse went at the gallop (${fastest.toFixed(1)} m/s)`);
    assert.equal(orders.charge, null, 'over');
    if (man.state === 'up') {
      assert.equal(orders.charged.end, 'wheeled', `seed ${seed}: ${orders.charged.end}`);
      // Facing him, and reined in: the horse's goal is to stand.
      const horse = me.mount;
      const at = point(man.x, P.pelvis);
      const to = vec.normalize([at[0] - horse.at[0], 0, at[2] - horse.at[1]]);
      assert.ok(vec.dot(yawRotate([1, 0, 0], horse.yaw), to) > Math.cos(0.6), `seed ${seed}: facing him`);
      assert.equal(horse.goal.speed, 0);
    }
    if (hit) hits += 1;
  }
  assert.ok(hits >= 3, `the blow met him in ${hits} of 4 charges`);
});

test('the charge ends at once with any movement asked for; a new tap takes the man tapped', () => {
  const w = createWorld([
    { inputs: { ...structuredClone(PRESETS.saber), mounted: true }, corner: 'red' },
    { inputs: structuredClone(PRESETS.knight), corner: 'blue' },
    { inputs: structuredClone(PRESETS.yari), corner: 'blue' },
  ], { seed: 5, arena: FIELD });
  const [me, first, second] = w.fighters;
  const orders = newOrders();
  const step = (seconds) => advance(w, seconds, (world, dt) => {
    thinkAll(world, dt, new Set([me.id]));
    directFighter(world, me, orders, dt);
  });
  orders.lock = first.id;
  orders.requests.push({ move: 'gladiusCut', zone: 'head', strength: 'quick', at: w.time });
  step(0.5);
  assert.equal(orders.charge?.target, first.id);
  // Another man tapped (the lock moved to him): the charge is at him now.
  orders.lock = second.id;
  orders.requests.push({ move: 'gladiusCut', zone: 'head', strength: 'quick', at: w.time });
  step(0.3);
  assert.equal(orders.charge?.target, second.id);
  // The stick: the reins are his again, and the horse goes the way it points.
  const away = yawRotate([-1, 0, 0], me.mount.yaw);
  orders.stick = { dir: [away[0], away[2]], amount: 1 };
  step(0.1);
  assert.equal(orders.charge, null);
  assert.equal(orders.charged.end, 'cancelled');
  assert.ok(Math.abs(Math.atan2(Math.sin(me.mount.goal.heading - Math.atan2(-away[2], away[0])), Math.cos(me.mount.goal.heading - Math.atan2(-away[2], away[0])))) < 0.3, 'the horse is turned the stick\'s way');
});

test('a key pressed on horseback at a man far off charges him as the tap does; a key or tap with nobody to charge (or on foot) strikes as before', () => {
  const w = riderAndMan('sabre', 'knight', 2);
  const [me] = w.fighters;
  const orders = newOrders();
  assert.ok(swingAt(w, me, orders, 'gladiusCut', 'head'));
  assert.ok(orders.charge && !me.punch, 'a charge, not a blow into the air');
  const foot = createWorld([{ inputs: structuredClone(PRESETS.saber), corner: 'red' }, { inputs: structuredClone(PRESETS.knight), corner: 'blue' }], { seed: 2 });
  const footOrders = newOrders();
  assert.ok(swingAt(foot, foot.fighters[0], footOrders, 'gladiusCut', 'head'));
  assert.ok(foot.fighters[0].punch && !footOrders.charge, 'on foot: the blow, at once');
});

test('steering himself, a tap readies the blow for the pass: the reins stay his and the blade meets the man as he rides by', () => {
  let landed = 0;
  let passes = 0;
  for (const seed of [1, 2, 3]) {
    const w = riderAndMan('sabre', 'knight', seed);
    const [me, man] = w.fighters;
    const orders = newOrders();
    let tapped = false;
    let readied = null;
    while (w.time < 8 && man.state === 'up' && me.mount) {
      advance(w, 1 / 60, (world, dt) => {
        thinkAll(world, dt, new Set([me.id]));
        // Ridden on a line that passes him 1.2 m off, on the weapon side; tapped 8 m out.
        const horse = me.mount;
        const at = point(man.x, P.pelvis);
        const to = [at[0] - horse.at[0], at[2] - horse.at[1]];
        const distance = Math.hypot(to[0], to[1]);
        const pass = [at[0] - (to[1] / distance) * 1.2 - horse.at[0], at[2] + (to[0] / distance) * 1.2 - horse.at[1]];
        orders.stick = { dir: vec.normalize([pass[0], 0, pass[1]]).filter((_, index) => index !== 1), amount: 1 };
        if (!tapped && distance < 8) {
          orders.requests.push({ move: 'gladiusCut', zone: 'head', strength: 'quick', at: world.time });
          tapped = true;
        }
        directFighter(world, me, orders, dt);
        readied ??= orders.charge;
        if (tapped && yawRotate([1, 0, 0], horse.yaw)[0] * to[0] + yawRotate([1, 0, 0], horse.yaw)[2] * to[1] < 0) world.passed = true;
      });
      if (w.passed) break;
    }
    assert.ok(readied && readied.reins === false, 'readied, the reins his');
    passes += 1;
    if (w.events.some((event) => (event.kind === 'landed' || event.kind === 'blocked') && event.attacker === me.id)) landed += 1;
  }
  assert.ok(landed >= 2, `met him on ${landed} of ${passes} passes`);
});
