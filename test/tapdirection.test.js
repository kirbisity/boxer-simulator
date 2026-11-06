// A tap on his man in the Body controls (fightui/target.js) throws a blow from the side tapped, whatever the weapon:
// left of him a blow that comes in from the left, right of him from the right, the top of his head a blow from above,
// the middle of his body a thrust (a straight punch, a jab with a mace's head), his legs a low blow where the style has one.
// The blows from the other side are made as data (moves.js TAP_MOVES: mirrored swings, angled thrusts), the player's only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { attackLayout, directFighter, moveName, newOrders } from '../src/control.js';
import { advance, createWorld, placeFighter, point, toLocal } from '../src/physics.js';
import { fightUiMoves, fightUiTarget } from '../src/fightui/logic.js';
import { fightUiPlaceOnHim } from '../src/fightui/target.js';
import { blowSide, MOVES, STYLES, TAP_MOVES } from '../src/moves.js';

const steady = () => 1;
const tap = (style, zone, side, random = steady) => fightUiTarget(fightUiMoves(style), zone, side, 0, random);

// Seen from behind him, +z (his lead, left-named side) is the screen's right: −1 is the screen's left.
const FAMILIES = {
  katana: { head: 'down', body: 'side', top: 'down' },
  longsword: { head: 'down', body: 'side', top: 'down' },
  saberShield: { head: 'down', body: 'side', top: 'down' },
  maceShield: { head: 'down', body: 'side', top: 'down' },
  warhammer: { head: 'down', body: 'side', top: 'down' },
  naginata: { head: 'down', body: 'side', top: 'down' },
  spear: { head: 'straight', body: 'side', top: 'straight' },
  pike: { head: 'straight', body: 'straight', top: 'straight' },
  lance: { head: 'straight', body: 'straight', top: 'straight' },
  dagger: { head: 'side', body: 'side', top: 'straight' },
  boxing: { head: 'side', body: 'side', top: 'straight' },
  kickboxing: { head: 'side', body: 'side', top: 'straight' },
};

test('a tap left or right of him: a blow from that side, for every family of weapon', () => {
  for (const [style, want] of Object.entries(FAMILIES)) {
    for (const side of [-1, 1]) {
      for (const zone of ['head', 'body']) {
        const pick = tap(style, zone, side);
        assert.equal(pick.entry.side, side, `${style}: a tap on the ${zone}, side ${side}: ${pick.move} comes from side ${pick.entry.side}`);
        assert.equal(pick.entry.group, want[zone], `${style} ${zone} ${side}: ${pick.move} is a ${pick.entry.group}`);
        assert.ok(pick.reaches, `${style}: ${pick.move} reaches the ${zone}`);
      }
    }
  }
});

test('the top of his head: a blow from above; the middle of his body: a thrust or a straight', () => {
  for (const [style, want] of Object.entries(FAMILIES)) {
    assert.equal(tap(style, 'head', 0).entry.group, want.top, `${style}: on top of his head`);
    const middle = tap(style, 'body', 0);
    assert.equal(middle.entry.group, 'straight', `${style}: the middle of his body: ${middle.move}`);
    assert.equal(middle.entry.side, 0);
  }
  assert.equal(tap('katana', 'head', 0).move, 'shomen');
  assert.equal(tap('katana', 'body', 0).move, 'tsuki');
  assert.equal(tap('maceShield', 'body', 0).move, 'tapJab', 'a mace has no point: a jab with its head');
  assert.match(tap('boxing', 'body', 0).move, /^(jab|cross)$/);
});

test('his legs: a low blow from the side tapped where the style has one', () => {
  assert.equal(tap('kickboxing', 'legs', -1).move, 'lowKick');
  assert.equal(tap('kickboxing', 'legs', 1).move, 'lowKickMirror');
  for (const side of [-1, 1]) {
    const sweep = tap('spear', 'legs', side);
    assert.equal(sweep.entry.side, side);
    assert.ok(sweep.reaches && sweep.entry.group === 'side', `the spear's haft swept at the legs from side ${side}`);
  }
});

test('mostly the best, now and then the next from the same side; never from the other side', () => {
  const seen = new Map();
  let draw = 0;
  const random = () => ((draw += 0.137) % 1);
  for (let index = 0; index < 200; index += 1) {
    const pick = tap('katana', 'body', 1, random);
    assert.equal(pick.entry.side, 1);
    seen.set(pick.move, (seen.get(pick.move) ?? 0) + 1);
  }
  const counts = [...seen.values()].sort((a, b) => b - a);
  assert.ok(counts.length >= 2 && counts[0] / 200 > 0.7 && counts[0] / 200 < 0.9, `about 80/20: ${JSON.stringify([...seen])}`);
});

test('the blows from the other side: mirrors of his own (hand path and turn), the player\'s only', () => {
  const mirror = MOVES.yokogiriMirror;
  const own = MOVES.yokogiri;
  assert.equal(blowSide(own), -1);
  assert.equal(blowSide(mirror), 1);
  assert.deepEqual(mirror.from.hand, [own.from.hand[0], own.from.hand[1], -own.from.hand[2]]);
  assert.equal(mirror.twist, -own.twist);
  assert.equal(mirror.limb, own.limb, 'a backhand: the same sword hand');
  assert.ok(mirror.windup > own.windup, 'a backhand brings the arm across first');
  assert.equal(MOVES.lowKickMirror.limb, 'lFoot', 'an empty-handed blow from the other side is the other limb\'s');
  assert.ok(TAP_MOVES.boxing.includes('rHook'), 'a move already made is used (the rear hook for the hook)');
  assert.equal(MOVES.spearThrustPlus.angled, 1);
  assert.deepEqual(moveName('forehandMirror').name, 'Backhand');
  for (const [key, style] of Object.entries(STYLES)) {
    for (const name of Object.keys(style.attacks ?? {})) assert.ok(!MOVES[name]?.mirrorOf && !MOVES[name]?.tapName, `${key}: the AI's own moves are untouched (${name})`);
  }
  // On the pad (and the buttons), seen from behind: each comes from its side of the screen.
  for (const place of attackLayout('longsword')) {
    const side = blowSide(MOVES[place.move]);
    if (side) assert.equal(Math.sign(place.x), side, `${place.move} on its side of the pad`);
  }
});

test('where a tap lands on him: the sides, his middle, the top of his head', () => {
  // He stands 200 px tall: head at y 100, neck 125, hips 200, feet 300, his middle at x 400.
  const at = (x, y) => fightUiPlaceOnHim([x, y], [400, 100], [400, 125], [400, 200], [[390, 300], [410, 300]]);
  assert.deepEqual(at(360, 170), { zone: 'body', side: -1 });
  assert.deepEqual(at(440, 170), { zone: 'body', side: 1 });
  assert.deepEqual(at(403, 170), { zone: 'body', side: 0 });
  assert.deepEqual(at(400, 88), { zone: 'head', side: 0 }, 'the top of his head');
  assert.deepEqual(at(425, 110), { zone: 'head', side: 1 });
  assert.deepEqual(at(380, 260), { zone: 'legs', side: -1 });
});

/** The hand that makes a style's tapped blow, seen in his own frame through the stroke: its side at the end of the wind-up, where it ends, and the trunk's turn. */
function strokeOf(preset, zone, side) {
  const style = PRESETS[preset].style;
  const pick = tap(style, zone, side);
  const world = createWorld([{ inputs: structuredClone(PRESETS[preset]), corner: 'red' }, { inputs: structuredClone(PRESETS.passive), corner: 'blue' }], { seed: 4 });
  placeFighter(world.fighters[0], -1);
  placeFighter(world.fighters[1], 1);
  const me = world.fighters[0];
  const orders = newOrders();
  const step = (seconds) => advance(world, seconds, (current, dt) => {
    thinkAll(current, dt, new Set([0, 1]));
    directFighter(current, me, orders, dt);
  });
  step(0.5);
  const turnOf = () => {
    const [l, r] = [toLocal(me, point(me.x, P.lShoulder)), toLocal(me, point(me.x, P.rShoulder))];
    return Math.atan2(l[0] - r[0], l[2] - r[2]);
  };
  const rest = turnOf();
  orders.requests.push({ move: pick.move, zone: pick.zone, strength: 'quick', at: world.time });
  const hand = P[MOVES[pick.move].limb];
  let wound = null;
  let through = null;
  for (let frame = 0; frame < 60 && (!wound || !through); frame += 1) {
    step(1 / 60);
    const punch = me.punch;
    if (!punch) continue;
    const z = toLocal(me, point(me.x, hand))[2];
    if (punch.t <= punch.spec.windup) wound = { z, turn: turnOf() };
    else if (punch.t >= punch.spec.extendUntil && !through) through = { z };
  }
  return { move: pick.move, wound, through, rest };
}

test('in the simulation the blow comes from the side tapped, and he turns into it first', () => {
  for (const preset of ['samurai', 'saber', 'maceShield', 'heavy']) {
    for (const side of [-1, 1]) {
      const { move, wound, through, rest } = strokeOf(preset, 'body', side);
      assert.ok(wound && through, `${preset} ${move}: made`);
      assert.equal(Math.sign(wound.z), side, `${preset} ${move}: wound up on side ${side} (hand at z ${wound.z.toFixed(2)})`);
      assert.ok((through.z - wound.z) * side < -0.15, `${preset} ${move}: across toward the other side (${wound.z.toFixed(2)} → ${through.z.toFixed(2)})`);
      // (His turn: + brings his +z shoulder forward, so a blow from −z is wound up with + and one from +z with −. A hook's
      // wind-up is too short to show much.)
      if (preset !== 'heavy') assert.ok((wound.turn - rest) * -side > 0.03, `${preset} ${move}: turned into side ${side} in the wind-up (${rest.toFixed(2)} → ${wound.turn.toFixed(2)})`);
    }
  }
});
