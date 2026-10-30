import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARTDRAMA, artTitle, createArtDrama } from '../src/artdrama.js';
import { artDrawParams, artImpactParams } from '../src/audio/sfx/art.js';
import { PRESETS } from '../src/body.js';
import { directFighter, newOrders } from '../src/control.js';
import { advance, createWorld, placeFighter } from '../src/physics.js';

const start = (time = 0) => ({ kind: 'art', time, attacker: 0, defender: 1, punch: 'artIai', effects: ['Iai'] });
const contact = (impulse, extra = {}) => ({ kind: 'landed', time: 0.5, attacker: 0, defender: 1, punch: 'artIai', weapon: 'katana', impulse, energy: impulse * 2, cut: impulse, point: [0, 1.4, 0], normal: [0, 0, 1], effects: [], ...extra });
/** The most of `read(now)` over `from` to `to` (real seconds). */
const most = (read, from, to) => {
  let top = 0;
  for (let now = from; now <= to; now += 0.002) top = Math.max(top, read(now));
  return top;
};
const least = (read, from, to) => {
  let low = Infinity;
  for (let now = from; now <= to; now += 0.002) low = Math.min(low, read(now));
  return low;
};

test('art drama: an art of the player\'s starts it (gleam, draw, name); another man\'s art, or none played, does not', () => {
  const drama = createArtDrama();
  assert.equal(drama.hear(start(), null, 0), null);
  assert.equal(drama.hear({ ...start(), attacker: 3 }, 0, 0), null);
  const begun = drama.hear(start(), 0, 0);
  assert.equal(begun.kind, 'start');
  assert.equal(begun.title, artTitle('artIai'));
  assert.ok(begun.draw > 0 && begun.gleam.size > 0 && begun.vibrate > 0);
  assert.equal(drama.caption(0.5).text, 'Iai');
  assert.equal(drama.caption(ARTDRAMA.caption.seconds + 0.1), null, 'the name gone after a moment');
});

test('art drama: only the art\'s own first contact bursts, and the burst, the shake and the sound scale with the impact', () => {
  const drama = createArtDrama();
  assert.equal(drama.hear(contact(60), 0, 0), null, 'no art made: an ordinary blow');
  drama.hear(start(), 0, 0);
  assert.equal(drama.hear(contact(60, { punch: 'kesagiri' }), 0, 0.1), null, 'a plain cut is not the art');
  assert.equal(drama.hear(contact(60, { attacker: 1, defender: 0 }), 0, 0.1), null, 'his man\'s blow');
  const light = createArtDrama();
  light.hear(start(), 0, 0);
  const soft = light.hear(contact(6), 0, 0.3);
  const hard = drama.hear(contact(70), 0, 0.3);
  assert.equal(hard.kind, 'contact');
  assert.ok(hard.strength > soft.strength, `${soft.strength} < ${hard.strength}`);
  assert.ok(hard.shake > soft.shake && hard.impact > soft.impact && hard.vibrate > soft.vibrate);
  assert.ok(hard.blood.count > soft.blood.count && hard.dust.count >= soft.dust.count, 'a cut that bit: blood and dust, more for more');
  assert.equal(hard.sparks, 0, 'flesh: no sparks');
  assert.equal(drama.hear(contact(70), 0, 0.35), null, 'the first contact only');
  // Steel: sparks, by the impact.
  const steel = (impulse) => {
    const one = createArtDrama();
    one.hear(start(), 0, 0);
    return one.hear(contact(impulse, { kind: 'blocked', target: 'blade', cut: 0 }), 0, 0.3);
  };
  assert.ok(steel(70).sparks > steel(6).sparks && steel(6).sparks > 0);
  assert.equal(steel(70).blood, null);
  // Shaken more, over time, for a harder contact.
  assert.ok(most((now) => Math.hypot(...drama.shake(now)), 0.3, 0.8) > most((now) => Math.hypot(...light.shake(now)), 0.3, 0.8));
  // The impact layer heavier: lower and longer.
  assert.ok(artImpactParams(1).frequency < artImpactParams(0).frequency && artImpactParams(1).decay > artImpactParams(0).decay);
  assert.ok(artDrawParams(true).ring > 0 && artDrawParams(false).ring === 0);
  // Out of the stroke's time: not its contact.
  const late = createArtDrama();
  late.hear(start(), 0, 0);
  assert.equal(late.hear(contact(60, { time: 5 }), 0, 1), null);
});

test('art drama: slowed through the wind-up, held at contact, then the fight\'s own pace again; the camera pushed and tilted meanwhile', () => {
  const drama = createArtDrama();
  assert.equal(drama.pace(0), 1);
  drama.hear(start(), 0, 0);
  const windup = least((now) => drama.pace(now), 0, 0.3);
  assert.ok(Math.abs(windup - ARTDRAMA.windup.slowest) < 0.02, `wind-up ${windup}`);
  assert.equal(drama.pace(2), 1, 'let go after');
  assert.ok(drama.push(0.5) > 0 && drama.roll(0.5) > 0);
  assert.equal(drama.push(5), 0);
  drama.hear(contact(70), 0, 1);
  assert.ok(drama.pace(1.02) <= ARTDRAMA.impact.slowest + 0.01, 'held at contact');
  assert.equal(drama.pace(1.6), 1);
  assert.ok(drama.flash(1.01) > 0 && drama.flash(1.5) === 0);
  // A heavier contact holds longer.
  const soft = createArtDrama();
  soft.hear(start(), 0, 0);
  soft.hear(contact(5), 0, 1);
  const held = (one) => [...Array(200).keys()].filter((index) => one.pace(1 + index * 0.002) < 0.5).length;
  assert.ok(held(drama) > held(soft), `${held(soft)} < ${held(drama)}`);
});

test('art drama: toned down for reduced motion: less slowing, less shake and push, no tilt, no glare', () => {
  const full = createArtDrama();
  const calm = createArtDrama({ reduced: true });
  for (const one of [full, calm]) {
    one.hear(start(), 0, 0);
  }
  assert.ok(least((now) => calm.pace(now), 0, 0.3) > least((now) => full.pace(now), 0, 0.3));
  assert.ok(calm.push(0.5) < full.push(0.5));
  assert.equal(calm.roll(0.5), 0);
  for (const one of [full, calm]) one.hear(contact(70), 0, 1);
  assert.ok(most((now) => Math.hypot(...calm.shake(now)), 1, 1.5) < most((now) => Math.hypot(...full.shake(now)), 1, 1.5) * 0.5);
  assert.equal(calm.flash(1.01), 0);
});

/** The player with a katana and a man before him; his blood up, the art pressed at once; `hear` given each event. */
function artBout(hear) {
  const world = createWorld([{ ...PRESETS.contender, style: 'katana' }, { ...PRESETS.contender, style: 'boxing' }], { seed: 4 });
  const [me, him] = world.fighters;
  placeFighter(me, -0.7, 0);
  placeFighter(him, 0.7, 0);
  const orders = newOrders();
  let cursor = 0;
  const step = (seconds) => advance(world, seconds, (current, dt) => directFighter(current, me, orders, dt));
  const listen = () => {
    for (; cursor < world.events.length; cursor += 1) hear?.(world.events[cursor], world.time);
  };
  step(0.5);
  me.adrenaline = 0.9;
  orders.actions = ['art'];
  for (let frame = 0; frame < 90; frame += 1) {
    step(1 / 60);
    listen();
  }
  return world;
}

test('art drama: fired by a real art: its start, then its contact with the energy it really had', () => {
  const drama = createArtDrama();
  const results = [];
  artBout((event, time) => {
    const result = drama.hear(event, 0, time);
    if (result) results.push({ result, event });
  });
  assert.equal(results[0]?.result.kind, 'start');
  const hit = results.find((entry) => entry.result.kind === 'contact');
  assert.ok(hit, `the art met him: ${results.map((entry) => entry.result.kind)}`);
  assert.ok(hit.result.strength > 0.3, `strength ${hit.result.strength}`);
  assert.deepEqual(hit.result.point, hit.event.point);
  assert.equal(results.filter((entry) => entry.result.kind === 'contact').length, 1);
});

test('art drama: hearing the art leaves the physics untouched', () => {
  const plain = artBout(null);
  const drama = createArtDrama();
  const felt = artBout((event, time) => {
    drama.hear(event, 0, time);
    drama.pace(time);
    drama.shake(time);
  });
  assert.deepEqual(Array.from(felt.fighters[0].x), Array.from(plain.fighters[0].x));
  assert.deepEqual(Array.from(felt.fighters[1].x), Array.from(plain.fighters[1].x));
  assert.equal(felt.events.length, plain.events.length);
});

test('art drama: its pace is the page\'s frame pace only: boxer.advance and playFrames never have it', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const uses = main.split('\n').filter((line) => line.includes('artDrama.pace'));
  assert.equal(uses.length, 1);
  assert.match(uses[0], /^const fightPace = /);
  const hook = (name) => main.slice(main.indexOf(`  ${name}: (`), main.indexOf('\n  },', main.indexOf(`  ${name}: (`)));
  for (const name of ['advance', 'playFrames']) assert.doesNotMatch(hook(name), /fightPace|artDrama/, name);
});
