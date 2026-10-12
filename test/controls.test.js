import test from 'node:test';
import assert from 'node:assert/strict';
import { attackLayout, attackWhere, keyStick, MOVE_NAMES, moveName, strikeOutcome } from '../src/control.js';
import { createRecognizer, GESTURE, screenZone } from '../src/gesture.js';
import { behindYaw, cameraRoom, createFollowCam, FOLLOW_CAM, spring } from '../src/followcam.js';
import { createTutorialRun, TUTORIAL, TUTORIAL_STEPS } from '../src/tutorial.js';
import { STYLES } from '../src/moves.js';

// ---- The screen split ---------------------------------------------------------

/** A recogniser for a surface 800 px high: the top half looks, the bottom half moves. */
const split = () => createRecognizer(GESTURE, { zoneOf: (at) => screenZone(at[1], 0, 800) });

test('screen split: a drag begun in the top half turns the view, one begun in the bottom half is the stick', () => {
  assert.equal(screenZone(100, 0, 800), 'look');
  assert.equal(screenZone(500, 0, 800), 'move');
  assert.equal(screenZone(399, 0, 800), 'look');
  const gestures = split();
  gestures.down(1, [200, 300], 0);
  const [first] = gestures.move(1, [240, 300]);
  assert.deepEqual([first.type, first.dx, first.dy], ['look', 40, 0], 'the threshold is not lost: the whole way from where it began');
  const [second] = gestures.move(1, [250, 290]);
  assert.deepEqual([second.type, second.dx, second.dy], ['look', 10, -10], 'then each move by itself');
  // Dragged down into the bottom half, still the view: it is where it began that counts.
  assert.equal(gestures.move(1, [250, 700])[0].type, 'look');
  assert.deepEqual(gestures.up(1, [250, 700], 1).map((event) => event.type), ['lookEnd']);
  gestures.down(2, [200, 600], 2);
  const [stick] = gestures.move(2, [200, 540]);
  assert.equal(stick.type, 'stick');
  assert.deepEqual(stick.origin, [200, 600], 'the stick floats: centred where the thumb landed');
  assert.deepEqual(gestures.up(2, [200, 540], 3).map((event) => event.type), ['stickEnd']);
});

test('screen split: both thumbs at once (look and move), two fingers on the view zoom, and taps strike anywhere', () => {
  const gestures = split();
  gestures.down(1, [100, 650], 0);
  gestures.down(2, [300, 200], 0);
  assert.equal(gestures.move(1, [100, 600])[0].type, 'stick');
  assert.equal(gestures.move(2, [340, 200])[0].type, 'look', 'a thumb on each half: one moves, one looks');
  gestures.up(1, [100, 600], 1);
  gestures.down(3, [500, 200], 1);
  gestures.move(3, [520, 200]);
  const [zoom] = gestures.move(2, [300, 200]);
  assert.equal(zoom.type, 'zoom');
  assert.ok(zoom.ratio > 1, 'fingers apart: a ratio over 1');
  // A tap high and a tap low: both are taps, never a look or a stick.
  const taps = split();
  taps.down(4, [50, 100], 5);
  assert.equal(taps.up(4, [50, 100], 5.1)[0].type, 'tap');
  taps.down(5, [50, 700], 6);
  assert.equal(taps.up(5, [50, 700], 6.1)[0].type, 'tap');
  // A mouse's right button looks wherever it is pressed.
  taps.down(6, [50, 700], 7, 'look');
  assert.equal(taps.move(6, [90, 700])[0].type, 'look');
  // With no split given, every drag is a stick, as before.
  const plain = createRecognizer();
  plain.down(7, [10, 10], 0);
  assert.equal(plain.move(7, [60, 10])[0].type, 'stick');
});

test('the movement keys: a stick the way the camera looks; opposite keys cancel; Shift runs', () => {
  const axes = { ahead: [1, 0], right: [0, 1] };
  assert.deepEqual(keyStick(new Set(['w']), axes).dir, [1, 0]);
  assert.deepEqual(keyStick(new Set(['arrowright']), axes).dir, [0, 1]);
  const diagonal = keyStick(new Set(['w', 'a']), axes).dir;
  assert.ok(Math.abs(diagonal[0] - Math.SQRT1_2) < 1e-9 && Math.abs(diagonal[1] + Math.SQRT1_2) < 1e-9);
  assert.equal(keyStick(new Set(['w', 's']), axes), null);
  assert.equal(keyStick(new Set(), axes), null);
  assert.ok(keyStick(new Set(['w']), axes, true).amount > keyStick(new Set(['w']), axes).amount);
});

// ---- Attack feedback -------------------------------------------------------------

test('attack names: every attack of every style has a name to show; the katana\'s by their own names', () => {
  for (const style of Object.values(STYLES)) {
    for (const move of Object.keys(style.attacks ?? {})) {
      const { name } = moveName(move);
      assert.ok(name && name.length < 20, `${move}: "${name}"`);
      assert.ok(MOVE_NAMES[move], `${move} has a name of its own`);
    }
  }
  assert.deepEqual(moveName('kesagiri'), { name: 'Kesagiri', gloss: 'diagonal cut' });
  assert.deepEqual(moveName('spearThrust'), { name: 'Spear thrust', gloss: '' });
  assert.deepEqual(moveName('someNewMove'), { name: 'Some new move', gloss: '' }, 'an unnamed move: its key in words');
  assert.deepEqual(attackWhere('head', -0.6), { height: 'high', side: 'left', arrow: '↖' });
  assert.deepEqual(attackWhere('legs', 0.1), { height: 'low', side: 'centre', arrow: '↓' });
  // The pad's own place of a move gives its side when no tap asked for it.
  const shomen = attackLayout('katana').find((place) => place.move === 'shomen');
  assert.equal(attackWhere('head', shomen.x).side, 'centre');
});

test('how a strike went: hit, glanced off armour, blocked, parried, or missed once it is over', () => {
  const events = [
    { time: 1, kind: 'landed', attacker: 0, defender: 1, effects: [] },
    { time: 3, kind: 'landed', attacker: 1, defender: 0, effects: [] },
    { time: 3.1, kind: 'blocked', attacker: 0, defender: 1, effects: [] },
    { time: 5, kind: 'landed', attacker: 0, defender: 1, effects: ['glanced off the plate'] },
    { time: 7, kind: 'bladeBlock', attacker: 1, defender: 0, effects: [] },
  ];
  assert.equal(strikeOutcome(events.slice(0, 1), 0, 0.9), 'hit');
  assert.equal(strikeOutcome(events.slice(0, 3), 0, 2.9), 'blocked', 'his own blow on me is not my hit');
  assert.equal(strikeOutcome(events.slice(0, 4), 0, 4.9), 'glance');
  assert.equal(strikeOutcome(events, 0, 6.9), 'parried', 'my arm met his blade');
  assert.equal(strikeOutcome(events, 0, 8), null, 'nothing yet');
  assert.equal(strikeOutcome(events, 0, 8, true), 'miss', 'over, and nothing: a miss');
  assert.equal(strikeOutcome([{ time: 2, kind: 'blocked', attacker: 0 }, { time: 2.2, kind: 'landed', attacker: 0, effects: [] }], 0, 1.9), 'blocked', 'the first word counts');
});

// ---- The follow camera -----------------------------------------------------------------

test('the camera\'s spring is critically damped: it arrives without overshoot at any frame rate', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
    let [value, velocity] = [0, 0];
    let peak = 0;
    for (let time = 0; time < 3; time += dt) {
      [value, velocity] = spring(value, velocity, 1, 5, dt);
      peak = Math.max(peak, value);
    }
    assert.ok(peak <= 1 + 1e-9 && value > 0.999, `dt ${dt.toFixed(3)}: peak ${peak}, end ${value}`);
  }
});

/** A frame of the camera following a man at `me` facing `facing`. */
const frame = (cam, input, time) => cam.update({ me: [0, 0.9, 0], facing: 0, down: false, foe: null, moving: false, aspect: 16 / 9, ...input }, time, 1 / 60);

test('the camera follows a smoothed man: his sway and small turns do not move it; a real turn does, smoothly', () => {
  const cam = createFollowCam();
  let time = 0;
  let view = null;
  for (; time < 2; time += 1 / 60) view = frame(cam, {}, time);
  assert.ok(Math.abs(view.yaw - behindYaw(0)) < 0.02, 'behind him');
  // His hips sway 6 cm at 3 Hz and his stance turns ±0.2 rad: the view barely stirs.
  const yaws = [];
  const targets = [];
  for (let step = 0; step < 240; step += 1, time += 1 / 60) {
    const wobble = Math.sin(step * (2 * Math.PI * 3) / 60);
    view = frame(cam, { me: [0.06 * wobble, 0.9 + 0.03 * wobble, 0.06 * wobble], facing: 0.2 * wobble }, time);
    yaws.push(view.yaw);
    targets.push(view.target[0]);
  }
  const spread = (list) => Math.max(...list) - Math.min(...list);
  assert.ok(spread(yaws) < 0.01, `the view turned ${spread(yaws).toFixed(3)} rad`);
  assert.ok(spread(targets) < 0.03, `the aim moved ${spread(targets).toFixed(3)} m for a 12 cm sway`);
  // He turns round to face the other way: the view comes round behind him, never overshooting.
  const before = view.yaw;
  let turned = 0;
  for (let step = 0; step < 300; step += 1, time += 1 / 60) {
    view = frame(cam, { facing: Math.PI / 2 }, time);
    turned = Math.max(turned, Math.abs(view.yaw - before));
  }
  const goal = Math.abs(Math.atan2(Math.sin(behindYaw(Math.PI / 2) - before), Math.cos(behindYaw(Math.PI / 2) - before)));
  assert.ok(Math.abs(Math.abs(view.yaw - before) - goal) < FOLLOW_CAM.deadBand + 0.02, 'it came round (within the dead band)');
  assert.ok(turned <= goal + 1e-6, 'without overshoot');
});

test('the camera holds its heading while he is down, keeps both men in view locked on, and keeps the player\'s look a while', () => {
  const cam = createFollowCam();
  let time = 0;
  for (; time < 2; time += 1 / 60) frame(cam, {}, time);
  const standing = cam.state.yaw;
  // Down: his body spins as he falls; the view does not.
  for (let step = 0; step < 120; step += 1, time += 1 / 60) frame(cam, { down: true, facing: step * 0.1 }, time);
  assert.ok(Math.abs(cam.state.yaw - standing) < 1e-6, 'held');
  // Locked on a man 3 m ahead: the view is behind me, off the line to him, further back, aimed between us.
  let view = null;
  for (let step = 0; step < 240; step += 1, time += 1 / 60) view = frame(cam, { foe: [3, 0.9, 0] }, time);
  assert.ok(Math.abs(view.yaw - (Math.PI + FOLLOW_CAM.lockAngle)) < 0.05 || Math.abs(view.yaw - (-Math.PI + FOLLOW_CAM.lockAngle)) < 0.05, `yaw ${view.yaw.toFixed(2)}`);
  assert.ok(Math.abs(view.target[0] - 3 * FOLLOW_CAM.lockAt) < 0.05, 'aimed between them');
  assert.ok(view.distance > FOLLOW_CAM.distance + 1.5, 'further back for both');
  // The player looks away: kept while he holds it and for holdSeconds (locked: lockHoldSeconds) after; then back.
  const unlocked = createFollowCam();
  for (time = 0; time < 2; time += 1 / 60) frame(unlocked, {}, time);
  unlocked.look(1.2, 0.2, time);
  for (let step = 0; step < 60; step += 1, time += 1 / 60) view = frame(unlocked, {}, time);
  assert.ok(Math.abs(view.yaw - (behindYaw(0) + 1.2)) < 1e-6, 'his angle, kept');
  for (let step = 0; step < 60 * (FOLLOW_CAM.holdSeconds + 3); step += 1, time += 1 / 60) view = frame(unlocked, {}, time);
  assert.ok(Math.abs(Math.cos(view.yaw - behindYaw(0)) - 1) < 1e-3, 'eased back behind him');
  // A narrow (phone) screen stands back so that he is in the picture.
  const phone = createFollowCam();
  for (time = 0; time < 3; time += 1 / 60) view = frame(phone, { aspect: 390 / 788 }, time);
  assert.ok(view.distance > FOLLOW_CAM.distance * 1.3, `${view.distance.toFixed(2)} m on a phone`);
});

test('the camera stays inside the walls: it comes in along its line', () => {
  const room = cameraRoom('colosseum', { halfX: 6.5, halfZ: 4.4 });
  assert.ok(room(0, 0) && !room(10.5, 0));
  assert.equal(cameraRoom('ring', { halfX: 3, halfZ: 3 }), null);
  const cam = createFollowCam(FOLLOW_CAM, { room });
  let view = null;
  // Standing near the wall, facing away from it (+x is the wall behind: he faces −x, yaw π).
  for (let time = 0; time < 3; time += 1 / 60) view = frame(cam, { me: [8, 0.9, 0], facing: Math.PI }, time);
  const x = view.target[0] + Math.cos(view.pitch) * Math.cos(view.yaw) * view.distance;
  const z = view.target[2] + Math.cos(view.pitch) * Math.sin(view.yaw) * view.distance;
  assert.ok(room(x, z), `the camera at (${x.toFixed(2)}, ${z.toFixed(2)}) is inside`);
  assert.ok(view.distance < FOLLOW_CAM.distance, 'nearer than usual');
});

// ---- The tutorial -----------------------------------------------------------------

test('tutorial: each step is done by doing it, and the next comes; skipping moves on; the end is finished', () => {
  for (const step of TUTORIAL_STEPS) assert.ok(step.touch && step.mouse && step.title, `${step.key} has words for a finger and for a mouse`);
  const run = createTutorialRun();
  assert.equal(run.step.key, 'look');
  run.signal('look', 0.5);
  assert.equal(run.done, false, 'not far enough yet');
  run.signal('look', TUTORIAL.lookFor);
  assert.equal(run.done, true);
  run.signal('look', 1);
  assert.equal(run.next().key, 'move');
  assert.equal(run.progress.look, 0, 'a new step starts from nothing');
  run.observe({ walked: 0.5, near: false }, 1 / 60);
  run.observe({ walked: 0.6, near: false }, 1 / 60);
  assert.equal(run.done, false, 'walked, but not up to him');
  run.observe({ walked: 0.1, near: true }, 1 / 60);
  assert.equal(run.done, true);
  run.next();
  run.signal('lock');
  assert.equal(run.done, true, 'locked on');
  run.next();
  for (const move of ['kesagiri', 'kesagiri', 'shomen']) run.signal('strike', move);
  assert.equal(run.done, false, 'two different cuts are not three');
  run.signal('strike', 'tsuki');
  assert.equal(run.done, true);
  assert.equal(run.next().key, 'combo');
  assert.equal(run.next().key, 'shove', 'skipped');
  run.signal('hold');
  assert.equal(run.done, true);
  run.next();
  run.observe({ guarding: true, blocked: 0, locked: true, armed: true }, TUTORIAL.guardFor / 2);
  assert.equal(run.done, false);
  run.observe({ guarding: false, blocked: 1, locked: true, armed: true }, 1 / 60);
  assert.equal(run.done, true, 'a blow met on the guard');
  assert.equal(run.next().key, 'pickUp');
  run.observe({ armed: false, locked: true }, 1 / 60);
  assert.equal(run.done, false);
  run.observe({ armed: true, locked: true }, 1 / 60);
  assert.equal(run.done, true, 'the sword back in his hands');
  assert.equal(run.next().key, 'unlock');
  run.observe({ armed: true, locked: true }, 1 / 60);
  run.signal('unlock');
  assert.equal(run.done, true);
  assert.equal(run.next(), null);
  assert.equal(run.finished, true);
  run.signal('look', 10);
  assert.equal(run.next(), null, 'nothing after the end');
});
