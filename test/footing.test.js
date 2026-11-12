// Footing on a body (physics/footing.js): a hoof or a foot coming down on a man on the floor, what it does to him and to
// the footing of the one who stepped on him.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS, normaliseInputs } from '../src/body.js';
import { advance, createWorld, injuryOf, placeFighter, point, startCrawl } from '../src/physics.js';
import { WORLD } from '../src/physics/config.js';
import { footingOn, holdsUnder, partUnder, treadOn } from '../src/physics/footing.js';
import { gaitAt, hoofSpeed, HORSE_SHAPE, ladenMass, placeMounted } from '../src/physics/mounted.js';

const FIELD = { halfX: 40, halfZ: 20 };
const man = (key) => normaliseInputs(structuredClone(PRESETS[key]));

/** A knight on his horse (red) and `crawlers` men of `key` (blue) down on their hands and knees, settled. */
function field(key, crawlers = [[15, 0, Math.PI / 2]]) {
  const w = createWorld([{ inputs: { ...structuredClone(PRESETS.knight), mounted: true }, corner: 'red' }, ...crawlers.map(() => ({ inputs: man(key), corner: 'blue' }))], { seed: 7, arena: FIELD });
  w.fighters[0].cooldown = 99;
  crawlers.forEach(([x, z, yaw], index) => {
    const crawler = w.fighters[index + 1];
    placeFighter(crawler, x, z);
    crawler.yaw = yaw;
    startCrawl(w, crawler, 'test');
  });
  advance(w, 1);
  return w;
}

/** A hoof of the horse at `speed` m/s coming down on the middle of the first crawler's back. */
function hoofOnBack(key, speed) {
  const w = field(key);
  const [horse] = w.horses;
  const crawler = w.fighters[1];
  horse.speed = speed;
  const gait = gaitAt(speed);
  const laden = ladenMass(w, horse);
  const share = 1 / (4 * gait.duty);
  const back = point(crawler.x, P.pelvis).map((value, axis) => (value + point(crawler.x, P.neck)[axis]) / 2);
  const under = partUnder(w.fighters, null, back[0], back[2], HORSE_SHAPE.legRadius * horse.withers, (fighter) => fighter.corner === 'red');
  assert.equal(under?.fighter, crawler, 'the hoof comes down on him');
  assert.equal(under.key, 'trunk');
  const tread = treadOn(w, under, { mass: share * laden, speed: hoofSpeed(horse, gait), weight: share * laden * WORLD.gravity, reason: 'knocked flat by a hoof' });
  advance(w, 0.2);
  // (The injury it did, felt or still to be felt over the seconds after it: physics.js injure.)
  return { w, crawler, tread, hoof: hoofSpeed(horse, gait), trunk: injuryOf(crawler, 'trunk') };
}

test('a hoof on a crawling man\'s back presses him flat; at a walk it bruises and may crack ribs, at a gallop it kills', () => {
  const walk = hoofOnBack('street', 1.5);
  const gallop = hoofOnBack('street', 13);
  assert.ok(walk.hoof > 0.7 && walk.hoof < 1.4, `a walking hoof comes down at ${walk.hoof.toFixed(2)} m/s`);
  assert.ok(gallop.hoof > 3 && gallop.hoof < 5, `a galloping hoof at ${gallop.hoof.toFixed(2)} m/s`);
  for (const run of [walk, gallop]) {
    assert.ok(run.tread.flattened, 'his hands and knees cannot hold a horse');
    assert.ok(run.tread.harm, 'and it hurts him');
  }
  assert.ok(walk.trunk > 0.1 && walk.trunk < WORLD.injury.trunkFatal, `walk: trunk ${walk.trunk.toFixed(2)}`);
  assert.notEqual(walk.crawler.state, 'out');
  assert.ok(gallop.trunk > 4 * walk.trunk, `gallop ${gallop.trunk.toFixed(2)} against walk ${walk.trunk.toFixed(2)}`);
  assert.ok(gallop.trunk > WORLD.injury.trunkFatal, 'a galloping horse\'s weight on his chest is past what kills');
  // (Dead of it within the seconds a mortal wound leaves him, WORLD.injury.drainSeconds.)
  advance(gallop.w, WORLD.injury.drainSeconds);
  assert.equal(gallop.crawler.state, 'out');
});

test('armour takes a hoof as it takes any blunt blow: a man in plate is hurt far less', () => {
  const bare = hoofOnBack('street', 13);
  const plate = hoofOnBack('knight', 13);
  assert.ok(plate.tread.flattened, 'armour does not hold a horse up');
  assert.ok(plate.trunk < 0.7 * bare.trunk, `plate ${plate.trunk.toFixed(2)} against bare ${bare.trunk.toFixed(2)}`);
});

test('a horse galloping through men crawling across its way treads some of them flat, and is jolted by the bodies', () => {
  const crawlers = Array.from({ length: 6 }, (_, index) => [8 + 2.2 * index, index % 2 ? 0.15 : -0.1, Math.PI / 2 + 0.3 * (index % 3)]);
  const w = field('street', crawlers);
  const [horse] = w.horses;
  placeMounted(w.fighters[0], -30, 0, 0);
  for (let t = 0; t < 8 && horse.at[0] < 25; t += 1 / 60) {
    horse.goal = { heading: 0, speed: 30 };
    horse.goalAt = w.time + 1;
    w.fighters[0].cooldown = 99;
    for (const crawler of w.fighters.slice(1)) crawler.move = 0;
    advance(w, 1 / 60);
  }
  const hooves = w.events.filter((event) => event.kind === 'trampled' && event.crawling);
  assert.ok(hooves.length >= 1, 'a hoof came down on a crawler');
  assert.ok(hooves.some((event) => event.fell), 'and pressed him flat');
  assert.ok(hooves.some((event) => event.harmed), 'and hurt him');
  assert.ok(hooves.some((event) => event.horseJolt > 0), 'the horse felt the body underfoot');
});

/** A man of `walker` walking over a man of `crawler` crawling across his way: what his steps on him came to, over a few placings. */
function walkOver(walker, crawler) {
  const tally = { landed: 0, flattened: 0, slipped: 0, over: 0 };
  for (const [z, yaw] of [[-0.15, 0], [0, Math.PI / 2], [0.15, 1], [0, 2.2], [0.3, Math.PI / 2], [-0.3, 1]]) {
    const w = createWorld([{ inputs: man(walker), corner: 'red' }, { inputs: man(crawler), corner: 'blue' }], { seed: 3, arena: FIELD });
    const [a, b] = w.fighters;
    placeFighter(a, -4, 0);
    placeFighter(b, 0, z);
    b.yaw = yaw;
    startCrawl(w, b, 'test');
    advance(w, 0.6);
    for (let t = 0; t < 5 && a.x[P.pelvis * 3] < 3; t += 1 / 60) {
      Object.assign(a, { move: 1, yaw: 0, cooldown: 99 });
      Object.assign(b, { move: 0.3, cooldown: 99 });
      advance(w, 1 / 60);
    }
    const steps = w.events.filter((event) => event.kind === 'trodden' && event.attacker === a.id);
    if (!steps.length) continue;
    tally.landed += 1;
    if (steps.some((event) => event.flattened)) tally.flattened += 1;
    if (steps.some((event) => event.fell || event.effects.includes('stumbles'))) tally.over += 1;
  }
  return tally;
}

test('a heavy man walking over a lighter crawler presses him flat and keeps his feet; a light man on a heavy one is thrown about', () => {
  const heavy = walkOver('heavy', 'street');
  const light = walkOver('street', 'heavy');
  assert.ok(heavy.landed >= 4 && light.landed >= 4, `stepped on him: ${heavy.landed}, ${light.landed}`);
  assert.ok(heavy.flattened >= heavy.landed - 1, `heavy flattens ${heavy.flattened} of ${heavy.landed}`);
  assert.equal(light.flattened, 0, 'the heavy crawler holds a light man up');
  assert.ok(light.over > heavy.over, `stumbles or falls: light ${light.over}, heavy ${heavy.over}`);
});

test('what a crawler holds is his limbs\' against the weight: a heavy man\'s step is past a weak-armed one, a light man\'s is not past a strong one', () => {
  const w = createWorld([{ inputs: man('heavy'), corner: 'red' }, { inputs: man('street'), corner: 'blue' }], { seed: 3, arena: FIELD });
  const [big, small] = w.fighters;
  for (const fighter of w.fighters) startCrawl(w, fighter, 'test');
  advance(w, 0.5);
  const step = (fighter) => fighter.body.massKg * WORLD.gravity;
  assert.equal(holdsUnder(small, step(big)), false);
  assert.equal(holdsUnder(big, step(small)), true);
});

test('the footing on a body: on its crest a sole holds, off its side it slides; a faster step is checked harder; a moving back carries a light man', () => {
  const under = (offset, velocity = [0, 0, 0]) => {
    const R = 0.17;
    const rise = Math.sqrt(R * R - offset * offset);
    return { fighter: { body: { massKg: 110 } }, height: 0.6, radius: 0.12, normal: [0, rise / R, offset / R], velocity };
  };
  const down = [0, -1, 0];
  const still = footingOn(under(0), { leg: down, velocity: [0, 0, 0], legLength: 0.9, mass: 80, flattened: false });
  assert.equal(still.slipped, false);
  assert.ok(still.size < 1e-9);
  const side = footingOn(under(0.14), { leg: down, velocity: [0, 0, 0], legLength: 0.9, mass: 80, flattened: false });
  assert.equal(side.slipped, true);
  assert.ok(side.size > 1, `slid off at ${side.size.toFixed(2)} m/s`);
  const walk = footingOn(under(0), { leg: down, velocity: [1.3, 0, 0], legLength: 0.9, mass: 80, flattened: false });
  const run = footingOn(under(0), { leg: down, velocity: [4, 0, 0], legLength: 0.9, mass: 80, flattened: false });
  assert.ok(run.size > 2.5 * walk.size);
  const light = footingOn(under(0, [0.6, 0, 0]), { leg: down, velocity: [0, 0, 0], legLength: 0.9, mass: 60, flattened: false });
  const heavy = footingOn(under(0, [0.6, 0, 0]), { leg: down, velocity: [0, 0, 0], legLength: 0.9, mass: 130, flattened: false });
  assert.ok(light.size > heavy.size);
  const pressed = footingOn(under(0, [0.6, 0, 0]), { leg: down, velocity: [1.3, 0, 0], legLength: 0.9, mass: 130, flattened: true });
  assert.ok(pressed.size < walk.size, 'pressed flat, the body is low and still under him');
});
