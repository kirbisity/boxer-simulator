import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, normaliseInputs } from '../src/body.js';
import { AI, hesitancy, thinkAll, troopQuality } from '../src/ai.js';
import { advance, createWorld, cutOff, placeFighter } from '../src/physics.js';

const man = (key, corner, extra = {}) => ({ inputs: normaliseInputs({ ...structuredClone(PRESETS[key]), ...extra }), corner });

/** Two lines of `count` men each, `apart` m between them. */
function lines(redKey, blueKey, { count = 6, apart = 14, seed = 4, extra = {}, formation } = {}) {
  const entries = [...Array(count)].map(() => man(redKey, 'red', extra)).concat([...Array(count)].map(() => man(blueKey, 'blue', extra)));
  const world = createWorld(entries, { seed, arena: { halfX: 26, halfZ: 12 }, ...(formation ? { formation } : {}) });
  world.fighters.forEach((fighter, index) => placeFighter(fighter, fighter.corner === 'red' ? -apart / 2 : apart / 2, ((index % count) - (count - 1) / 2) * 1.3));
  return world;
}

/** With AI.hesitation's values in `values` for the length of `run`. */
function withHesitation(values, run) {
  const kept = { ...AI.hesitation };
  Object.assign(AI.hesitation, values);
  try {
    return run();
  } finally {
    Object.assign(AI.hesitation, kept);
  }
}

test('troop quality: a levy 0, an elite 1, a regular between; discipline makes any man go in', () => {
  const world = lines('spear', 'samurai');
  const levy = world.fighters.find((fighter) => fighter.corner === 'red');
  const elite = world.fighters.find((fighter) => fighter.corner === 'blue');
  assert.equal(troopQuality(world, levy), 0);
  assert.equal(troopQuality(world, elite), 1);
  world.discipline = { red: 1, blue: 0 };
  assert.equal(troopQuality(world, levy), 1, 'Qi\'s law: a man whose squad dies if he holds back goes in');
});

test('hesitancy: the levy most, the regular less, the elite and the frenzied not at all', () => {
  const world = lines('spear', 'yari');
  const [levy] = world.fighters;
  const regular = world.fighters.find((fighter) => fighter.corner === 'blue');
  const levyH = hesitancy(world, levy, regular);
  const regularH = hesitancy(world, regular, levy);
  assert.ok(levyH > 0.6, `a levy stalls more often than not: ${levyH.toFixed(2)}`);
  assert.ok(regularH < levyH * 0.7, `an ashigaru less: ${regularH.toFixed(2)} against ${levyH.toFixed(2)}`);
  const elites = lines('samurai', 'spear');
  assert.equal(hesitancy(elites, elites.fighters[0], elites.fighters.at(-1)), 0, 'a samurai does not stall');
  const frenzied = lines('spear', 'samurai', { extra: { outfit: { kind: 'commoner', design: 0, frenzy: true } } });
  assert.equal(hesitancy(frenzied, frenzied.fighters[0], frenzied.fighters.at(-1)), 0, 'nor a frenzied man');
});

/** The first blow thrown between the sides (s), within `seconds`, or null. */
function firstBlow(world, seconds) {
  let elapsed = 0;
  while (elapsed < seconds) {
    advance(world, 0.1, (current, dt) => thinkAll(current, dt));
    elapsed += 0.1;
    if (world.fighters.some((fighter) => fighter.stats.thrown > 0)) return world.time;
  }
  return null;
}

test('two levy lines that never find their nerve stand off short of reach; elites close and fight', () => {
  const never = { go: 0, goLeast: 0, push: 0, follow: 0, longest: Infinity, base: 5 };
  withHesitation(never, () => {
    const levies = lines('spear', 'spear');
    assert.equal(firstBlow(levies, 14), null, 'no blow: they stand glaring');
    const stalled = levies.fighters.filter((fighter) => fighter.hesitant?.stalled).length;
    assert.ok(stalled >= 8, `most of them stalled: ${stalled} of 12`);
    const elites = lines('samurai', 'samurai');
    const met = firstBlow(elites, 14);
    assert.ok(met !== null && met < 8, `the samurai go straight in: ${met}`);
  });
});

test('levies who would never go in still meet samurai who come at them: the elite closes as soon as without the stall', () => {
  const never = { go: 0, goLeast: 0, push: 0, follow: 0, longest: Infinity, base: 5 };
  const stalled = withHesitation(never, () => firstBlow(lines('spear', 'samurai'), 20));
  const free = withHesitation({ on: false }, () => firstBlow(lines('spear', 'samurai'), 20));
  assert.ok(stalled !== null && free !== null, 'they meet');
  assert.ok(stalled <= free + 1, `met at ${stalled.toFixed(1)} s against ${free.toFixed(1)} s with no hesitation`);
});

test('no stall lasts past `longest`: the levies go in at last', () => {
  withHesitation({ go: 0, goLeast: 0, push: 0, follow: 0, longest: 3, base: 5 }, () => {
    const met = firstBlow(lines('spear', 'spear'), 20);
    assert.ok(met !== null, 'they meet');
  });
});

/** A man of `preset` (adrenaline `blood`) beside a comrade cut down by a foe: the events and his state after. */
function witness(preset, blood, extra = {}) {
  const world = createWorld([man(preset, 'red', extra), man(preset, 'red', extra), man('knight', 'blue')], { seed: 2, arena: { halfX: 20, halfZ: 20 } });
  const [watcher, victim, foe] = world.fighters;
  placeFighter(watcher, 0, 1.2);
  placeFighter(victim, 0, 0);
  placeFighter(foe, 1.6, 0);
  advance(world, 0.2);
  watcher.adrenaline = blood;
  cutOff(world, victim, { joint: 'shoulder', side: 'r' }, foe);
  advance(world, 0.05, (current, dt) => thinkAll(current, dt));
  return { world, watcher, foe, rages: world.events.filter((event) => event.kind === 'rage') };
}

/** With AI.rage's chance certain for the length of `run`. */
function sureRage(run) {
  const kept = AI.rage.chance;
  AI.rage.chance = 1;
  try {
    return run();
  } finally {
    AI.rage.chance = kept;
  }
}

test('rage: an elite with his blood up goes for the killer, past fear, no flinch', () => {
  sureRage(() => {
    const { world, watcher, foe, rages } = witness('samurai', 0.8);
    assert.equal(rages.length, 1, 'a rage event');
    assert.equal(rages[0].fighter, watcher.id);
    assert.equal(rages[0].target, foe.id);
    assert.equal(watcher.focus, foe.id, 'on the killer');
    assert.ok(!(watcher.recoilUntil > world.time), 'no flinch');
    assert.equal(watcher.fear, 0, 'past fear');
  });
});

test('rage is for the elite and the frenzied with their blood up: the levy flinches, the cool elite does not rage', () => {
  sureRage(() => {
    const levy = witness('spear', 1);
    assert.equal(levy.rages.length, 0, 'a levy never rages');
    assert.ok(levy.watcher.recoilUntil > levy.world.time, 'he flinches');
    assert.equal(witness('samurai', 0.1).rages.length, 0, 'an elite with his blood cool does not');
    const frenzied = witness('spear', AI.rage.adrenalineFrom + 0.05, { outfit: { kind: 'commoner', design: 0, frenzy: true } });
    assert.equal(frenzied.rages.length, 1, 'a frenzied man with his blood up does');
  });
});

test('rage is rare at the shipped chance: most elites with their blood up still do not', () => {
  let rages = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const world = createWorld([man('samurai', 'red'), man('samurai', 'red'), man('knight', 'blue')], { seed, arena: { halfX: 20, halfZ: 20 } });
    const [watcher, victim, foe] = world.fighters;
    placeFighter(watcher, 0, 1.2);
    placeFighter(victim, 0, 0);
    placeFighter(foe, 1.6, 0);
    advance(world, 0.2);
    watcher.adrenaline = 1;
    cutOff(world, victim, { joint: 'shoulder', side: 'r' }, foe);
    advance(world, 0.05, (current, dt) => thinkAll(current, dt));
    rages += world.events.filter((event) => event.kind === 'rage').length;
  }
  assert.ok(rages > 0 && rages < 30, `${rages} of 40`);
});
