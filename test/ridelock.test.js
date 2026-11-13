import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { circleStick, CONTROL, directFighter, newOrders, ridesRing } from '../src/control.js';
import { ringHeading } from '../src/riding.js';
import { advance, createWorld, placeFighter } from '../src/physics.js';
import { HORSE_HEALTH, horseHealth, placeMounted } from '../src/physics/mounted.js';

const FIELD = { halfX: 80, halfZ: 80 };
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** A mounted player (`inputs`) at the middle facing +x, and a man on foot `apart` m ahead of him; nobody thinks. */
function riderFacing(inputs, apart, seed = 3) {
  const w = createWorld([{ inputs: { ...structuredClone(inputs), mounted: true }, corner: 'red' }, { inputs: structuredClone(PRESETS.knight), corner: 'blue' }], { seed, arena: FIELD });
  const [me, man] = w.fighters;
  placeMounted(me, 0, 0, 0);
  placeFighter(man, apart, 0);
  advance(w, 0.3);
  return { w, me, man };
}

const manAt = (man) => [man.x[P.pelvis * 3], man.x[P.pelvis * 3 + 2]];
const apartOf = (me, man) => Math.hypot(manAt(man)[0] - me.mount.at[0], manAt(man)[1] - me.mount.at[1]);

/** Run the player's orders for `seconds`, `stickFor(me, man)` giving the stick each step (null: idle). */
function ride(w, me, man, orders, seconds, stickFor = () => null) {
  const end = w.time + seconds;
  const trail = [];
  while (w.time < end) {
    advance(w, 1 / 60, (world, dt) => {
      orders.stick = stickFor(me, man);
      directFighter(world, me, orders, dt);
    });
    trail.push({ apart: apartOf(me, man), bearing: Math.atan2(me.mount.at[1] - manAt(man)[1], me.mount.at[0] - manAt(man)[0]), speed: me.mount.speed });
  }
  return trail;
}

// ---- Pure steering ----------------------------------------------------------

test('ringHeading: on the ring a quarter turn from the man (either way round), turned in when outside it, out when inside, on a tangent from far off', () => {
  assert.ok(Math.abs(wrap(ringHeading(0, 20, 20, { turn: 1 }) + Math.PI / 2)) < 1e-9);
  assert.ok(Math.abs(wrap(ringHeading(0, 20, 20, { turn: -1 }) - Math.PI / 2)) < 1e-9);
  // Outside the ring: turned towards him (less than a quarter turn off); inside: away (more).
  assert.ok(Math.abs(ringHeading(0, 28, 20, { turn: 1 })) < Math.PI / 2);
  assert.ok(Math.abs(ringHeading(0, 12, 20, { turn: 1 })) > Math.PI / 2);
  // Far off: the tangent line (asin of radius over distance off the line to him).
  assert.ok(Math.abs(ringHeading(0, 40, 20, { turn: 1, approach: 1.6 }) + Math.asin(0.5)) < 1e-9);
});

test('circleStick: the ring is taken up at his distance (held to the bow\'s range), the stick across picks the way round, along it tightens or widens', () => {
  const spec = CONTROL.ride.circle;
  const orders = newOrders();
  // Man 20 m along +x; the stick straight across (+z: the way round with him on the left, heading −π/2).
  let heading = circleStick(orders, 1, [0, 0], [20, 0], [0, 1], 0, 1 / 60);
  assert.equal(orders.circle.radius, 20);
  assert.equal(orders.circle.turn, 1);
  assert.ok(Math.abs(wrap(heading + Math.PI / 2)) < 0.05, 'on the ring: a quarter turn off the way to him');
  heading = circleStick(orders, 1, [0, 0], [20, 0], [0, -1], 0, 1 / 60);
  assert.equal(orders.circle.turn, -1, 'the stick the other way across: round the other way');
  assert.ok(Math.abs(wrap(heading - Math.PI / 2)) < 0.05);
  // Pushed at him for a second: the ring tightens by `rate`; away, it widens; never past its bounds.
  const before = orders.circle.radius;
  for (let i = 0; i < 60; i += 1) circleStick(orders, 1, [0, 0], [20, 0], [1, 0], 0, 1 / 60);
  assert.ok(Math.abs(before - orders.circle.radius - spec.rate) < 0.01, `tightened ${(before - orders.circle.radius).toFixed(2)} m`);
  assert.equal(orders.circle.turn, -1, 'straight at him keeps the way round');
  for (let i = 0; i < 600; i += 1) circleStick(orders, 1, [0, 0], [20, 0], [-1, 0], 0, 1 / 60);
  assert.equal(orders.circle.radius, spec.most);
  // A new man: taken up afresh, at his distance held between `from` and `to`.
  circleStick(orders, 2, [0, 0], [5, 0], [0, -1], 0, 1 / 60);
  assert.equal(orders.circle.radius, spec.from);
  circleStick(orders, 3, [0, 0], [60, 0], [0, -1], 0, 1 / 60);
  assert.equal(orders.circle.radius, spec.to);
});

test('horseHealth: sound at 0; blood lost and blows on its body count against what drops it; lame; down is empty', () => {
  const { me } = riderFacing(PRESETS.saber, 10);
  const horse = me.mount;
  assert.equal(horseHealth(horse).harm, 0);
  assert.equal(horseHealth(null), null);
  const full = horseHealth({ ...horse, bloodLost: 1 }).harm;
  assert.equal(full, 1);
  const half = horseHealth({ ...horse, bloodLost: 0.05 });
  assert.ok(half.harm > 0 && half.harm < 1);
  assert.equal(horseHealth({ ...horse, bleed: HORSE_HEALTH.fastBleed }).bleeding, true);
  assert.equal(horseHealth({ ...horse, lame: true }).harm, HORSE_HEALTH.lame);
  assert.ok(horseHealth({ ...horse, trauma: 1e6 }).harm === 1);
  const down = horseHealth({ ...horse, state: 'down' });
  assert.equal(down.harm, 1);
  assert.equal(down.down, true);
});

// ---- Headless: the player's horse under the lock ----------------------------

test('locked on, no stick and no keys: the horse does not close on his man (it slows to a stand), with a sabre or a bow', () => {
  for (const inputs of [PRESETS.saber, PRESETS.steppeBow]) {
    const { w, me, man } = riderFacing(inputs, 15);
    const orders = newOrders();
    orders.lock = man.id;
    const start = apartOf(me, man);
    const trail = ride(w, me, man, orders, 6);
    const nearest = Math.min(...trail.map((step) => step.apart));
    assert.ok(nearest > start - 0.5, `${inputs.style}: closed only ${(start - nearest).toFixed(2)} m of ${start.toFixed(1)}`);
    assert.ok(Math.abs(me.mount.speed) < 0.3, `${inputs.style}: standing (${me.mount.speed.toFixed(2)} m/s)`);
  }
});

test('locked on, a bow in his hands, the stick across: the horse rides a ring round his man at the bow\'s range, the way the stick points', () => {
  assert.ok(PRESETS.steppeBow);
  for (const [side, turn] of [[[0, 1], 1], [[0, -1], -1]]) {
    const { w, me, man } = riderFacing(PRESETS.steppeBow, 20);
    assert.ok(ridesRing(me, man), 'a horse archer');
    const orders = newOrders();
    orders.lock = man.id;
    // The stick held across the line to him (as the lock camera, behind him looking at his man, sees "left" or "right").
    const stickFor = (rider, foe) => {
      const to = [manAt(foe)[0] - rider.mount.at[0], manAt(foe)[1] - rider.mount.at[1]];
      const length = Math.hypot(to[0], to[1]);
      const round = [-to[1] / length, to[0] / length];
      const way = side[1] > 0 ? round : [-round[0], -round[1]];
      return { dir: way, amount: 0.75 };
    };
    const trail = ride(w, me, man, orders, 30, stickFor);
    const settled = trail.slice(trail.length / 3);
    const radii = settled.map((step) => step.apart);
    const least = Math.min(...radii);
    const most = Math.max(...radii);
    let swept = 0;
    for (let i = 1; i < trail.length; i += 1) swept += wrap(trail[i].bearing - trail[i - 1].bearing);
    console.log(`  bow ring (turn ${turn}): radius ${least.toFixed(1)}-${most.toFixed(1)} m, swept ${(swept / (2 * Math.PI)).toFixed(2)} turns, ring ${orders.circle.radius} m, nearest ever ${Math.min(...trail.map((s) => s.apart)).toFixed(1)} m`);
    assert.equal(orders.circle.turn, turn);
    assert.ok(least > 14 && most < 27, `on the ring: ${least.toFixed(1)}-${most.toFixed(1)} m`);
    assert.ok(Math.abs(swept) > Math.PI * 1.5, `round him: ${(swept / Math.PI).toFixed(2)} π`);
    // Clockwise from above (turn +1, him on the left) is the bearing falling in this frame's heading sense.
    assert.equal(Math.sign(swept), -turn, 'the way the stick points');
  }
});

test('locked on, a sabre in his hands, the stick across: the horse goes the way the stick points (no ring); pushed at him, it closes', () => {
  const { w, me, man } = riderFacing(PRESETS.saber, 20);
  assert.ok(!ridesRing(me, man));
  const orders = newOrders();
  orders.lock = man.id;
  ride(w, me, man, orders, 1, () => ({ dir: [0, -1], amount: 0.75 }));
  assert.ok(Math.abs(wrap(me.mount.goal.heading - Math.PI / 2)) < 1e-6, `heading ${me.mount.goal.heading.toFixed(2)}: straight the stick's way`);
  assert.equal(orders.circle, null);
  const { w: w2, me: me2, man: man2 } = riderFacing(PRESETS.saber, 20);
  const orders2 = newOrders();
  orders2.lock = man2.id;
  const trail = ride(w2, me2, man2, orders2, 4, () => ({ dir: [1, 0], amount: 0.75 }));
  assert.ok(trail.at(-1).apart < 20 - 8, `closed to ${trail.at(-1).apart.toFixed(1)} m`);
});

test('locked on, the stick idle, a tap on his man: the charge rides at him as before', () => {
  const { w, me, man } = riderFacing(PRESETS.saber, 20);
  const orders = newOrders();
  orders.lock = man.id;
  orders.requests.push({ move: 'gladiusCut', zone: 'head', strength: 'quick', at: w.time });
  let nearest = Infinity;
  let charge = null;
  const end = w.time + 6;
  while (w.time < end) {
    advance(w, 1 / 60, (world, dt) => directFighter(world, me, orders, dt));
    charge ??= orders.charge;
    nearest = Math.min(nearest, apartOf(me, man));
  }
  assert.ok(charge?.reins, 'a charge with the reins');
  assert.ok(nearest < 3, `rode at him: within ${nearest.toFixed(1)} m`);
});

test('an AI rider whose horse is failing reins in and gets down before it falls with him', async () => {
  const { PRESETS, normaliseInputs } = await import('../src/body.js');
  const { createWorld, placeFighter, advance } = await import('../src/physics.js');
  const { thinkAll } = await import('../src/ai.js');
  const world = createWorld([{ inputs: normaliseInputs({ ...structuredClone(PRESETS.knight), mounted: true }), corner: 'red' }, { inputs: normaliseInputs(structuredClone(PRESETS.yari)), corner: 'blue' }], { seed: 1, arena: { halfX: 30, halfZ: 30 } });
  const [rider, man] = world.fighters;
  placeFighter(rider, -12, 0);
  placeFighter(man, 12, 0);
  advance(world, 0.5);
  const horse = rider.mount;
  // Bled most of the way to collapse, and still bleeding.
  horse.bloodLost = 0.17;
  horse.bleed = 0.003;
  for (let t = 0; t < 8 && rider.mount; t += 0.1) advance(world, 0.1, (current, dt) => thinkAll(current, dt));
  assert.equal(rider.mount, null, 'he got down');
  assert.equal(rider.state, 'up', 'on his feet, not thrown');
  assert.ok(world.events.some((event) => event.kind === 'unhorsed' && event.fighter === rider.id && event.effects[0] === 'gets down from his horse'));
});

// ---- The horse under the player, a momentum fight (2026-11-13) ----------------

test('a rider strikes and guards only before him: over the horse\'s neck, not behind him nor square beside him', async () => {
  const { inRiderArc } = await import('../src/physics.js');
  const w = createWorld([{ inputs: { ...structuredClone(PRESETS.knight), mounted: true }, corner: 'red' }, { inputs: structuredClone(PRESETS.knight), corner: 'blue' }], { seed: 1, arena: FIELD });
  const me = w.fighters[0];
  const [x, z] = me.mount.at;
  const yaw = me.mount.yaw;
  const at = (angle, distance = 3) => [x + Math.cos(yaw + angle) * distance, 1, z - Math.sin(yaw + angle) * distance];
  assert.equal(inRiderArc(me, at(0)), true, 'ahead');
  assert.equal(inRiderArc(me, at(0.9)), true, 'ahead and to the side');
  assert.equal(inRiderArc(me, at(Math.PI / 2)), false, 'square beside him (the T-bone)');
  assert.equal(inRiderArc(me, at(Math.PI)), false, 'behind');
  assert.equal(inRiderArc(w.fighters[1], at(Math.PI)), true, 'a man on foot turns to anything');
});

test('the horse under the player goes where he steers it, a turn costs it speed, and it balks only at a hedge of points', () => {
  // A hedge: two ranks of six with levelled points, facing him; a charge at them is held to a canter. One alone does not stop it.
  const charge = (count) => {
    const blue = Array.from({ length: count }, () => ({ inputs: { ...structuredClone(PRESETS.maximilian), mounted: false }, corner: 'blue' }));
    const w = createWorld([{ inputs: { ...structuredClone(PRESETS.knight), mounted: true }, corner: 'red' }, ...blue], { seed: 2, arena: FIELD });
    const [me, ...men] = w.fighters;
    placeMounted(me, -30, 0, 0);
    const files = Math.ceil(count / 2);
    men.forEach((man, index) => {
      placeFighter(man, count > 1 ? Math.floor(index / files) * 1.2 : 0, count > 1 ? ((index % files) - (files - 1) / 2) * 0.9 : 0);
      man.yaw = Math.PI;
    });
    me.player = true;
    let most = 0;
    for (let t = 0; t < 6; t += 1 / 60) {
      advance(w, 1 / 60, () => {
        me.mount.goal = { heading: 0, speed: me.mount.paces.gallop };
        me.mount.goalAt = w.time + 1;
        me.cooldown = 1;
        for (const man of men) {
          man.move = 0;
          man.cooldown = 1;
        }
      });
      const ahead = men[0].root[0] - me.mount.at[0];
      if (ahead > 3 && ahead < 8) most = Math.max(most, me.mount.speed);
    }
    return { most, horse: me.mount };
  };
  const hedge = charge(12);
  const lone = charge(1);
  assert.ok(hedge.most <= hedge.horse.paces.canter + 0.3, `into the hedge no faster than a canter: ${hedge.most.toFixed(1)} m/s`);
  assert.ok(lone.most > lone.horse.paces.canter + 1, `at one man, on at the gallop: ${lone.most.toFixed(1)} m/s`);
});

test('riding into an enemy of his own steering, the player\'s blow is readied for him at the man before him', () => {
  const w = createWorld([{ inputs: { ...structuredClone(PRESETS.knight), mounted: true }, corner: 'red' }, { inputs: structuredClone(PRESETS.knight), corner: 'blue' }], { seed: 3, arena: FIELD });
  const [me, man] = w.fighters;
  placeMounted(me, -25, 0, 0);
  placeFighter(man, 0, 0.8);
  const orders = newOrders();
  let readied = null;
  for (let t = 0; t < 6 && !readied; t += 1 / 60) {
    advance(w, 1 / 60, (world, dt) => {
      man.move = 0;
      man.cooldown = 1;
      // The stick full ahead (along +x, the way the horse faces): his own steering, no tap.
      orders.stick = { dir: [1, 0], amount: 1 };
      directFighter(world, me, orders, dt);
    });
    readied = orders.autoCharged ?? null;
  }
  assert.ok(readied && readied.target === man.id, 'a blow readied at the man he rode at');
});
