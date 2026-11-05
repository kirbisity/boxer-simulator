// The follow camera looking ahead as he moves (followcam.js aheadLead, FOLLOW_CAM.ahead) and framing him and the man he is locked on,
// near and far (lockFraming, FOLLOW_CAM.lockFar): both in the picture, and no backing out to fit a man 80 m off.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aheadLead, behindYaw, createFollowCam, FOLLOW_CAM, framePoint, lockFraming, orbitCamera } from '../src/followcam.js';

const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const chest = (pelvis) => [pelvis[0], pelvis[1] + FOLLOW_CAM.aboveHips, pelvis[2]];

test('look ahead: none standing, into the turn (and the way the stick asks) moving, capped, nothing for a stick pulled back', () => {
  const { ahead } = FOLLOW_CAM;
  assert.equal(aheadLead({ heading: 0, turnRate: 2, intent: 1, speed: ahead.still * 0.9 }), 0, 'standing (or shuffling): none');
  const left = aheadLead({ heading: 0, turnRate: 0.4, speed: 4 });
  assert.ok(left > 0 && Math.abs(left - ahead.turn * 0.4) < 1e-9, `turning left at 0.4 rad/s leads ${ahead.turn * 0.4} rad to the left (${left})`);
  assert.ok(aheadLead({ heading: 0, turnRate: -1, speed: 4 }) < 0, 'and right to the right');
  assert.ok(aheadLead({ heading: 0, intent: 0.6, speed: 4 }) > 0, 'the stick asking left leads left before he has turned');
  assert.ok(Math.abs(aheadLead({ heading: 0, turnRate: 6, intent: 1.3, speed: 4 })) <= ahead.most + 1e-9, 'never past `most`');
  assert.ok(Math.abs(aheadLead({ heading: 0, intent: Math.PI * 0.95, speed: 4 })) < 1e-6, 'a stick pulled back towards the camera swings nothing');
  assert.ok(aheadLead({ heading: 0, turnRate: 1, speed: 1.2 }) < aheadLead({ heading: 0, turnRate: 1, speed: 4 }), 'less of it slow than brisk');
});

/** A man walking +x at `speed` who, at 1 s, is asked (the stick) to go left (+z is his right: facing yaw π/2 is −z) and turns there over 0.6 s. */
function walkAndTurn(cam, seconds, { look = null, speed = 2.5, stopAt = Infinity } = {}) {
  const dt = 1 / 60;
  let x = 0;
  let z = 0;
  const views = [];
  for (let frame = 0, time = 0; time < seconds; frame += 1, time = frame * dt) {
    const turned = time < 1 ? 0 : Math.min(1, (time - 1) / 0.6);
    const facing = turned * (Math.PI / 2);
    const moving = time < stopAt;
    const v = moving ? [Math.cos(facing) * speed, 0, -Math.sin(facing) * speed] : [0, 0, 0];
    x += v[0] * dt;
    z += v[2] * dt;
    if (look && Math.abs(time - look.at) < dt / 2) cam.look(look.yaw, 0, time);
    const view = cam.update({ me: [x, 0.9, z], facing, down: false, foe: null, moving, velocity: v, speed: moving ? speed : 0, intent: moving && time >= 1 ? [0, -1] : moving ? [1, 0] : null, aspect: 16 / 9 }, time, dt);
    views.push({ time, view, ahead: cam.state.ahead });
  }
  return views;
}

test('look ahead: turning with the stick swings the view into the turn ahead of the plain follow, smoothly, and it settles when he stops', () => {
  const plain = walkAndTurn(createFollowCam({ ...FOLLOW_CAM, ahead: { ...FOLLOW_CAM.ahead, most: 0 } }), 6, { stopAt: 3 });
  const leading = walkAndTurn(createFollowCam(), 6, { stopAt: 3 });
  const goal = behindYaw(Math.PI / 2);
  const at = (views, time) => views.find((entry) => entry.time >= time - 1e-9).view.yaw;
  // Half a second into the turn the leading view has come round further towards behind his new way.
  const plainOff = Math.abs(wrap(at(plain, 1.5) - goal));
  const leadOff = Math.abs(wrap(at(leading, 1.5) - goal));
  assert.ok(leadOff < plainOff - 0.1, `into the turn sooner (${leadOff.toFixed(2)} vs ${plainOff.toFixed(2)} rad off)`);
  // Smooth: the lead never changes by more than `rate` rad/s, and is at most `most`.
  for (let i = 1; i < leading.length; i += 1) {
    assert.ok(Math.abs(leading[i].ahead - leading[i - 1].ahead) <= FOLLOW_CAM.ahead.rate / 60 + 1e-9, `frame ${i}: a step of the lead within its rate`);
    assert.ok(Math.abs(leading[i].ahead) <= FOLLOW_CAM.ahead.most + 1e-9);
  }
  assert.ok(Math.max(...leading.map((entry) => Math.abs(entry.ahead))) > 0.15, 'it does lead');
  // Stopped (at 3 s) and standing: it settles back to none.
  assert.ok(Math.abs(leading.at(-1).ahead) < 1e-3, `settled (${leading.at(-1).ahead})`);
});

test('look ahead: the player\'s own drag takes the view at once without a jump, and the lead comes back only after a pause', () => {
  const cam = createFollowCam();
  const views = walkAndTurn(cam, 4, { look: { at: 1.3, yaw: 0 } });
  const index = views.findIndex((entry) => entry.time >= 1.3 - 1e-9);
  const before = views[index - 1];
  assert.ok(Math.abs(before.ahead) > 0.05, 'leading when he takes hold');
  assert.ok(Math.abs(wrap(views[index].view.yaw - before.view.yaw)) < 0.05, 'no jump as the drag takes it');
  for (const entry of views.slice(index, index + Math.round(60 * FOLLOW_CAM.ahead.pause) - 1)) assert.equal(entry.ahead, 0, `no lead ${entry.time.toFixed(2)} s, while his look is fresh`);
});

test('look ahead: a visitor who asks for less motion gets less of it', () => {
  const full = walkAndTurn(createFollowCam(), 3);
  const reduced = walkAndTurn(createFollowCam(FOLLOW_CAM, { reduced: true }), 3);
  const most = (views) => Math.max(...views.map((entry) => Math.abs(entry.ahead)));
  assert.ok(most(reduced) < most(full) * (FOLLOW_CAM.ahead.reduced + 0.1), `${most(reduced).toFixed(3)} vs ${most(full).toFixed(3)} rad`);
});

const SCREENS = [16 / 9, 390 / 788];
const CASES = [
  // [the player's pelvis, his man's pelvis, what]
  [[0, 0.9, 0], [1.5, 0.9, 0.4], 'a man close by'],
  [[0, 0.9, 0], [3, 0.9, 0], 'a man in reach'],
  [[0, 0.9, 0], [6, 0.9, 3], 'between near and far'],
  [[0, 0.9, 0], [20, 0.9, -5], 'an archer\'s mark'],
  [[0, 0.9, 0], [-50, 0.9, 30], 'across the field'],
  [[0, 0.9, 0], [80, 0.9, 0], 'as far as a bow reaches'],
  [[0, 1.75, 0], [40, 0.9, 10], 'from horseback, a man on foot'],
  [[0, 1.75, 0], [-25, 1.75, -60], 'a horse archer on a horse archer'],
  [[0, 0.9, 0], [30, 1.75, 0], 'on foot, a rider'],
];

test('locked on: the player and his man are both in the picture, near and far, wide screen and phone', () => {
  for (const aspect of SCREENS) {
    for (const [me, foe, what] of CASES) {
      const orbit = lockFraming({ me, foe, aspect });
      for (const [point, who] of [[chest(me), 'the player'], [chest(foe), 'his man']]) {
        const seen = framePoint(orbit, point, aspect);
        assert.ok(seen.ahead > 0 && Math.abs(seen.x) < 1 && Math.abs(seen.y) < 1, `${what} (aspect ${aspect.toFixed(2)}): ${who} at (${seen.x.toFixed(2)}, ${seen.y.toFixed(2)})`);
      }
    }
  }
});

test('locked on far: the camera stays by the player (no backing out), he on one side of the picture and his man on the other', () => {
  for (const aspect of SCREENS) {
    const near = lockFraming({ me: [0, 0.9, 0], foe: [FOLLOW_CAM.lockReach, 0.9, 0], aspect });
    const nearBack = Math.hypot(...orbitCamera(near).map((value, axis) => value - chest([0, 0.9, 0])[axis]));
    for (const gap of [20, 40, 80]) {
      const me = [0, 0.9, 0];
      const foe = [gap * 0.6, 0.9, gap * 0.8];
      const orbit = lockFraming({ me, foe, aspect });
      assert.equal(orbit.far, 1);
      const back = Math.hypot(...orbitCamera(orbit).map((value, axis) => value - chest(me)[axis]));
      assert.ok(back <= nearBack + 1e-6, `${gap} m: the camera ${back.toFixed(2)} m from him, no further than for a man in reach (${nearBack.toFixed(2)} m)`);
      const player = framePoint(orbit, chest(me), aspect);
      const mark = framePoint(orbit, chest(foe), aspect);
      assert.ok(player.x * mark.x < 0 && Math.abs(player.x) > 0.2 && Math.abs(mark.x) > 0.2, `${gap} m: he at ${player.x.toFixed(2)}, his man at ${mark.x.toFixed(2)} across`);
    }
    // The far camera does not move further off as the gap grows.
    const at = (gap) => Math.hypot(...orbitCamera(lockFraming({ me: [0, 0.9, 0], foe: [gap, 0.9, 0], aspect })).map((value, axis) => value - chest([0, 0.9, 0])[axis]));
    assert.ok(Math.abs(at(80) - at(20)) < 0.05, `as near him for 80 m as for 20 m (${at(80).toFixed(2)}, ${at(20).toFixed(2)})`);
  }
});

test('locked on: the framing changes smoothly as the gap opens from near to far (no jump at either end of the blend)', () => {
  let last = null;
  for (let gap = 1; gap <= 30; gap += 0.05) {
    const orbit = lockFraming({ me: [0, 0.9, 0], foe: [gap, 0.9, 0], aspect: 16 / 9 });
    const eye = orbitCamera(orbit);
    if (last) {
      assert.ok(Math.hypot(...eye.map((value, axis) => value - last.eye[axis])) < 0.1, `the camera steps at ${gap.toFixed(2)} m`);
      assert.ok(Math.abs(wrap(orbit.yaw - last.yaw)) < 0.03 && Math.abs(orbit.pitch - last.pitch) < 0.03, `the aim steps at ${gap.toFixed(2)} m`);
    }
    last = { eye, yaw: orbit.yaw, pitch: orbit.pitch };
  }
});

test('locked on a horse archer 40 m off, the follow camera settles with both in the picture and stays by the player', () => {
  for (const aspect of SCREENS) {
    const cam = createFollowCam();
    const me = [0, 1.75, 0];
    const foe = [30, 1.75, 26];
    let view = null;
    for (let time = 0; time < 5; time += 1 / 60) view = cam.update({ me, facing: 0, down: false, foe, moving: false, aspect }, time, 1 / 60);
    for (const point of [chest(me), chest(foe)]) {
      const seen = framePoint(view, point, aspect);
      assert.ok(seen.ahead > 0 && Math.abs(seen.x) < 1 && Math.abs(seen.y) < 1, `aspect ${aspect.toFixed(2)}: (${seen.x.toFixed(2)}, ${seen.y.toFixed(2)})`);
    }
    assert.ok(Math.hypot(...orbitCamera(view).map((value, axis) => value - chest(me)[axis])) < FOLLOW_CAM.distance * 1.6 * (aspect < 1 ? 1.7 : 1), 'by the player');
  }
});
