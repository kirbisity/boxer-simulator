// A blow at a man low before him (lowstrike.js), driven as the on-screen pad drives it: one tap (`orders.requests`, as
// fightui/kit.js throwMove) with a man lying, kneeling or on his hands and knees within a few steps. The blow goes to his body as
// it lies (a lying man in a fight with weapons gets the finisher, finisher.js), the striker stepping in and bending to it; it
// lands. Before, the tap went at the air where a standing man's chest would be, a metre above him.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, placeFighter, startCrawl } from '../src/physics.js';
import { attackLayout, directFighter, newOrders } from '../src/control.js';
import { lowMan } from '../src/lowstrike.js';

const WEAPONS = { fists: 'light', katana: 'samurai', spear: 'yari', mace: 'maceShield', naginata: 'naginata' };

/** The player (`attacker`) and an unarmoured man `apart` m off put in `pose`, both still for the AI; one tap of the first pad move. */
function tapAt(attacker, pose, { apart = 1.6, seed = 1, armed } = {}) {
  const world = createWorld([{ inputs: structuredClone(PRESETS[attacker]), corner: 'red' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }], { seed });
  if (armed !== undefined) world.armed = armed;
  const orders = newOrders();
  const [me, him] = world.fighters;
  placeFighter(me, 0, 0);
  placeFighter(him, apart, 0);
  const step = (seconds) => advance(world, seconds, (w, dt) => {
    thinkAll(w, dt, new Set([0, 1]));
    directFighter(w, me, orders, dt);
  });
  step(0.3);
  if (pose === 'lying') {
    him.state = 'down';
    him.downTimer = 8;
    him.knockdowns = 1;
  } else if (pose === 'kneeling') him.kneel = { share: 1 };
  else startCrawl(world, him, 'on his hands and knees');
  step(1);
  assert.ok(lowMan(me, him), `${pose}: he is low`);
  const t0 = world.time;
  const start = me.x[P.pelvis * 3];
  orders.requests.push({ move: attackLayout(me.style)[0].move, zone: 'body', strength: 'quick', at: world.time });
  let landed = null;
  let stoop = 0;
  for (let index = 0; index < 150 && !landed; index += 1) {
    step(1 / 60);
    stoop = Math.max(stoop, me.lowStrike?.stoop ?? 0);
    // (On him: landed, or taken on his arms, `blocked`: a man kneeling has his arms before him, and they are his body too.)
    landed = world.events.find((event) => event.time >= t0 && (event.kind === 'landed' || event.kind === 'blocked') && event.attacker === me.id && event.defender === him.id);
  }
  return { world, me, him, landed, stoop, stepped: me.x[P.pelvis * 3] - start };
}

for (const pose of ['lying', 'kneeling', 'crawling']) {
  test(`one tap at a man ${pose} lands on him, with fists, a katana, a spear, a mace and a naginata`, () => {
    const missed = [];
    for (const [weapon, preset] of Object.entries(WEAPONS)) {
      const { landed } = tapAt(preset, pose);
      if (!landed) missed.push(weapon);
    }
    assert.deepEqual(missed, [], `missed him ${pose}: ${missed.join(', ')}`);
  });
}

test('bare hands at a man flat on the floor (a bout of fists: no finisher): he goes down on his knees to it and the fist lands', () => {
  const { landed, stoop, me } = tapAt('light', 'lying', { apart: 1.2, armed: false });
  assert.ok(landed, 'the blow met him');
  assert.ok(stoop > 0.7, `bent to the floor (${stoop.toFixed(2)} of the deepest)`);
  assert.ok(!me.finisher, 'not the finisher: a blow of his own');
});

test('a man low beyond reach is stepped to first, then struck', () => {
  const { landed, stepped } = tapAt('samurai', 'kneeling', { apart: 2.6 });
  assert.ok(stepped > 0.5, `he stepped in (${stepped.toFixed(2)} m)`);
  assert.ok(landed, 'and the cut met him');
});

test('a spear too near a man on his hands and knees backs off to put the point on him, not the shaft', () => {
  const { landed, stepped } = tapAt('yari', 'crawling', { apart: 1.0 });
  assert.ok(stepped < -0.2, `he gave ground (${stepped.toFixed(2)} m)`);
  assert.ok(landed, 'and the point met him');
});

test('with no finisher to be had, a weapon\'s own blow goes down to a man lying: a chop, a point driven down', () => {
  const missed = [];
  for (const [weapon, preset] of Object.entries(WEAPONS)) {
    const { landed, me } = tapAt(preset, 'lying', { armed: false });
    if (!landed || me.finisher) missed.push(weapon);
  }
  assert.deepEqual(missed, [], `missed him: ${missed.join(', ')}`);
});
