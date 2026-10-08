import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { MOVES, STYLES } from '../src/moves.js';
import { advance, createWorld, point } from '../src/physics.js';
import { attackAt, attackLayout, chooseAttack, contextAction, CONTROL, directFighter, doAction, holdDistance, newOrders, stickPace } from '../src/control.js';
import { createRecognizer, GESTURE } from '../src/gesture.js';

/** A bout with red played: the AI thinks for blue only, the orders drive red. */
function played(red, blue, { distance = 2.5, seed = 1, still = false } = {}) {
  const world = createWorld([{ inputs: structuredClone(red), corner: 'red' }, { inputs: structuredClone(blue), corner: 'blue' }], { seed, distance });
  const orders = newOrders();
  const step = (seconds) => advance(world, seconds, (current, dt) => {
    thinkAll(current, dt, new Set(still ? [0, 1] : [0]));
    directFighter(current, current.fighters[0], orders, dt);
  });
  return { world, orders, me: world.fighters[0], him: world.fighters[1], step };
}
const apart = (a, b) => Math.hypot(a.x[P.pelvis * 3] - b.x[P.pelvis * 3], a.x[P.pelvis * 3 + 2] - b.x[P.pelvis * 3 + 2]);

test('gestures: past the drag threshold a touch is a stick for good, never a tap or a press', () => {
  const gestures = createRecognizer();
  gestures.down(1, [100, 100], 0, { line: 'mid' });
  assert.deepEqual(gestures.move(1, [105, 100]), [], 'a wobble is not a drag');
  const [stick] = gestures.move(1, [100 + GESTURE.dragFrom + 30, 100]);
  assert.equal(stick.type, 'stick');
  assert.ok(stick.amount > 0.5 && stick.amount <= 1);
  // Back to where it began and held: still the stick, not a tap, not a heavy.
  gestures.move(1, [100, 100]);
  assert.deepEqual(gestures.tick(2), []);
  assert.deepEqual(gestures.up(1, [100, 100], 2).map((event) => event.type), ['stickEnd']);
});

test('gestures: a tap, a double tap near it, and a press held still (acting the moment it is long enough)', () => {
  const gestures = createRecognizer();
  gestures.down(1, [300, 50], 0);
  const [tap] = gestures.up(1, [300, 50], 0.1);
  assert.deepEqual([tap.type, tap.double], ['tap', false]);
  gestures.down(2, [310, 60], 0.2);
  assert.equal(gestures.up(2, [310, 60], 0.25)[0].double, true, 'the second tap soon after, near the first');
  gestures.down(3, [600, 400], 0.4);
  assert.equal(gestures.up(3, [600, 400], 0.45)[0].double, false, 'far from the last: a tap of its own');
  gestures.down(4, [300, 200], 1);
  assert.deepEqual(gestures.tick(1 + GESTURE.holdFrom - 0.05), [], 'not yet');
  assert.deepEqual(gestures.tick(1 + GESTURE.holdFrom + 0.01).map((event) => event.type), ['hold'], 'held: a press, at once');
  assert.deepEqual(gestures.up(4, [300, 200], 2), [], 'let go after: nothing more');
  gestures.down(6, [0, 0], 6);
  assert.deepEqual(gestures.cancel(6), [], 'a cancelled touch is nothing at all');
});

test('the stick: a dead centre, a walk, full pace, then a run', () => {
  assert.equal(stickPace(0.05).pace, 0);
  const walk = stickPace(0.3);
  assert.ok(walk.pace > 0.3 && walk.pace < 0.7 && !walk.running);
  assert.equal(stickPace(0.82).pace, 1);
  assert.equal(stickPace(1).running, true);
});

test('locked on and left alone, he holds his own range: a boxer close, a spearman out at his point, a gunman back', () => {
  for (const [key, near, far] of [['heavy', 0.6, 1.3], ['mingSpear', 1.6, 2.8], ['handgun', 2.6, 4.5]]) {
    const { world, orders, me, him, step } = played(PRESETS[key], PRESETS.light, { distance: 4, still: true });
    orders.lock = him.id;
    step(4);
    const distance = apart(me, him);
    assert.ok(distance > near && distance < far, `${key}: ${distance.toFixed(2)} m (holds ${holdDistance(me, him).toFixed(2)})`);
    assert.equal(me.focus, him.id, 'his man is the one locked');
    assert.ok(world.time > 3.9);
  }
});

test('the stick moves him the way it points, faster the further it goes; unlocked he turns that way', () => {
  const { orders, me, step } = played(PRESETS.heavy, PRESETS.light, { distance: 6, still: true });
  const start = point(me.x, P.pelvis);
  orders.stick = { dir: [0, 1], amount: 0.5 };
  step(1.5);
  const walked = point(me.x, P.pelvis)[2] - start[2];
  orders.stick = { dir: [0, 1], amount: 1 };
  const middle = point(me.x, P.pelvis)[2];
  step(1.5);
  const ran = point(me.x, P.pelvis)[2] - middle;
  assert.ok(walked > 0.3, `walked ${walked.toFixed(2)} m along +z`);
  assert.ok(ran > walked * 1.3, `the full stick goes further (${ran.toFixed(2)} m)`);
  assert.ok(Math.abs(Math.sin(me.yaw) + 1) < 0.3, 'faces the way he goes (+z is yaw −π/2)');
});

test('an attack line picks a move of his own style that fits it', () => {
  const { world, me, him } = played(PRESETS.light, PRESETS.heavy, { distance: 1.1 });
  const high = chooseAttack(world, me, him, 'high');
  assert.ok(MOVES[high.move].zones.includes('head') && high.zone === 'head', high.move);
  const low = chooseAttack(world, me, him, 'low');
  assert.equal(low.zone, 'legs', `a kickboxer kicks low (${low.move})`);
  const heavy = chooseAttack(world, me, him, 'mid', 'heavy');
  assert.ok(heavy.heavy);
  const combo = chooseAttack(world, me, him, 'high', 'combo');
  assert.ok(combo.combo?.length >= 1, 'a combination follows the opener');
  const sword = played(PRESETS.samurai, PRESETS.heavy, { distance: 1.6 });
  const cut = chooseAttack(sword.world, sword.me, sword.him, 'high');
  assert.equal(MOVES[cut.move].reach, 'weapon', `a swordsman uses the sword (${cut.move})`);
  const lunge = chooseAttack(sword.world, sword.me, sword.him, 'lunge');
  assert.ok((MOVES[lunge.move].step ?? 0) > 0 || MOVES[lunge.move].kind === 'rush', `the edge of the screen lunges (${lunge.move})`);
});

test('a tap always strikes, at once, the way it points: at empty air, or at the man standing there', () => {
  const { world, orders, me, him, step } = played(PRESETS.samurai, PRESETS.light, { still: true });
  const hips = point(me.x, P.pelvis);
  // Off to his side, nobody there: a swing anyway, and he turns to it.
  const air = [hips[0], 1.3, hips[2] + 1];
  orders.requests.push({ point: air, strength: 'quick', at: world.time });
  step(1 / 60);
  assert.ok(me.punch, 'thrown the moment it was asked');
  assert.equal(me.punch.target, null, 'at nobody');
  assert.equal(MOVES[me.punch.type].reach, 'weapon', 'a swordsman swings his sword');
  step(0.5);
  const facing = [Math.cos(me.yaw), -Math.sin(me.yaw)];
  assert.ok(facing[1] > 0.5, `he turned to the place (${facing.map((value) => value.toFixed(2))})`);
  step(1);
  // At the man's head: aimed at him, high.
  orders.requests.push({ point: point(him.x, P.head), strength: 'quick', at: world.time });
  step(1 / 60);
  assert.equal(me.punch?.target, him.id);
});

test('press and hold: a shove at a man standing; a man on the floor is held down', () => {
  const sumo = Object.values(PRESETS).find((preset) => preset.style === 'sumo');
  const { world, orders, me, him, step } = played(sumo, PRESETS.light, { still: true });
  orders.lock = him.id;
  step(3);
  orders.holds = [point(him.x, P.pelvis)];
  step(1 / 60);
  assert.ok(me.punch && MOVES[me.punch.type].push, `a shove (${me.punch?.type})`);
  step(1);
  him.state = 'down';
  him.motorScale = 0;
  him.downTimer = 10;
  orders.holds = [point(him.x, P.pelvis)];
  step(2);
  assert.ok(me.pin && me.pin.target === him.id, 'he went to him and took hold');
  assert.ok(world.time > 5);
});

test('the guard held stays up; a tap of it gets out of the way', () => {
  const { orders, me, step } = played(PRESETS.samurai, PRESETS.light, { distance: 3, still: true });
  orders.guard = true;
  step(1.5);
  assert.equal(me.defence?.name, 'weaponBlock', 'a swordsman blocks with his sword');
  orders.guard = false;
  step(1);
  orders.evasions = [1];
  step(1 / 60);
  assert.equal(me.defence?.name, 'stepBack');
});

test('the special button: reload an empty gun, fire a loaded one, pick up a weapon at his feet, clinch up close', () => {
  const gun = played(PRESETS.matchlock, PRESETS.light, { distance: 6, still: true });
  gun.orders.lock = gun.him.id;
  gun.step(0.2);
  assert.equal(contextAction(gun.world, gun.me), 'fire');
  gun.me.weapon.loaded = false;
  assert.equal(contextAction(gun.world, gun.me), 'reload');
  assert.ok(doAction(gun.world, gun.me, 'reload') && gun.me.reloading);
  const sumo = played(Object.values(PRESETS).find((preset) => preset.style === 'sumo'), PRESETS.light, { still: true });
  assert.equal(contextAction(sumo.world, sumo.me), null, 'nothing to do from across the ring');
  sumo.orders.lock = sumo.him.id;
  sumo.step(3);
  assert.equal(contextAction(sumo.world, sumo.me), 'clinch', 'up close, a clinch');
  assert.ok(doAction(sumo.world, sumo.me, 'clinch'));
  let held = null;
  for (let tick = 0; tick < 60 && !held; tick += 1) {
    sumo.step(1 / 60);
    if (sumo.me.clinch) held = contextAction(sumo.world, sumo.me);
  }
  assert.equal(held, 'throw', 'he stepped in and took hold; a sumo holding on can throw');
  const disarmed = played(PRESETS.samurai, PRESETS.light, { distance: 4, still: true });
  disarmed.world.debris.push({ id: disarmed.world.debris.length, kind: 'weapon', weapon: 'katana', x: [...point(disarmed.me.x, P.pelvis)].map((value, axis) => (axis === 1 ? 0.03 : value + 0.6)), resting: true, taken: false });
  disarmed.me.weapon.held = false;
  assert.equal(contextAction(disarmed.world, disarmed.me), 'pickUp');
  assert.ok(CONTROL.pickupFrom > 1);
});

test('the attack pad: every attack of every style has its own place on the screen, where a tap throws it', () => {
  for (const [key, style] of Object.entries(STYLES)) {
    const pad = attackLayout(key);
    const wanted = Object.keys(style.attacks ?? {}).filter((name) => MOVES[name] && MOVES[name].kind !== 'clinch');
    assert.deepEqual(pad.map((place) => place.move).sort(), wanted.sort(), `${key}: every attack but the clinch is on the pad`);
    for (const place of pad) assert.equal(attackAt(key, place.x, place.y).move, place.move, `${key}: a tap on ${place.move}'s place throws it`);
  }
  // Seen from behind: the jab on the left, the cross on the right, the hook out wide, the uppercut low; a katana's overhead cut on top.
  const boxing = Object.fromEntries(attackLayout('boxing').map((place) => [place.move, place]));
  assert.ok(boxing.jab.x < 0 && boxing.cross.x > 0 && Math.abs(boxing.hook.x) > Math.abs(boxing.jab.x) && boxing.uppercut.y < boxing.cross.y);
  const katana = Object.fromEntries(attackLayout('katana').map((place) => [place.move, place]));
  assert.ok(katana.shomen.y > 0.7 && Math.abs(katana.shomen.x) < 0.2 && katana.kiriage.y < 0);
  // The height of the tap picks the zone: a cross high is at the head, lower at the body.
  assert.equal(attackAt('boxing', 0.3, 0.6).zone, 'head');
  assert.equal(attackAt('boxing', 0.3, 0.05).zone, 'body');
});

test('a pad attack goes at his man in reach, and into the air before him when nobody is there', () => {
  const { world, orders, me, him, step } = played(PRESETS.heavy, PRESETS.light, { still: true });
  orders.requests.push({ move: 'cross', zone: 'head', strength: 'quick', at: world.time });
  step(1 / 60);
  assert.equal(me.punch?.type, 'cross');
  assert.equal(me.punch.target, null, 'across the ring: at the air');
  step(1);
  orders.lock = him.id;
  step(3);
  orders.requests.push({ move: 'uppercut', zone: 'head', strength: 'quick', at: world.time });
  step(1 / 60);
  assert.equal(me.punch?.type, 'uppercut');
  assert.equal(me.punch.target, him.id, 'in reach: at him');
});
