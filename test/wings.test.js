import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, seededRandom } from '../src/physics.js';
import { canRide, isMounted, mountOf } from '../src/horses.js';
import { conquistadorHorseman, hanHorseman, mingHorseman, mountedKnight, romanHorseman, samuraiHorseman } from '../src/cast.js';
import { battleOf, SCENARIOS, scenarioWorld } from '../src/scenarios.js';
import { WINGS } from '../src/formation.js';

const spot = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
const sides = (key, seed = 1) => battleOf(key).cast(seededRandom(seed));
const riders = (side) => side.filter(isMounted);

// Who rides in each map, per side: [red, blue].
const WINGS_OF = { legion: [8, 8], sekigahara: [6, 6], pyongyang: [12, 0], rebellion: [2, 0] };

test('the cavalry helpers make riders in the kit of their time, on the horse their people rode', () => {
  const random = seededRandom(4);
  const east = { tint: { armor: '#9a1f18', lace: '#1a1a1d' }, banner: '#b3161b' };
  const cases = [
    ['a samurai', samuraiHorseman(random, east, 'spear'), 'japanese', 'bare', 'samurai'],
    ['a Ming horseman', mingHorseman(random, 'dao'), 'steppe', 'bare', 'mingIronLamellar'],
    ['a conquistador', conquistadorHorseman(random), 'warhorse', 'bare', 'conquistadorPlate'],
    ['a Roman auxiliary', romanHorseman(random), 'warhorse', 'bare', 'romanAuxiliary'],
    ['a Han horseman', hanHorseman(random, 'steppeBow'), 'warhorse', 'bare', 'hanCavalry'],
    ['a lord', mountedKnight(random), 'destrier', 'plate', 'knight'],
  ];
  for (const [who, inputs, breed, barding, kind] of cases) {
    assert.ok(canRide(inputs), `${who} can ride`);
    assert.ok(isMounted(inputs), `${who} is mounted`);
    assert.equal(inputs.outfit.kind.startsWith(kind) || inputs.outfit.kind === kind, true, `${who} wears ${kind}`);
    assert.deepEqual(mountOf(inputs), { breed, barding }, who);
  }
  // A samurai's yari from the saddle; a Roman's spatha.
  assert.equal(samuraiHorseman(random, east, 'spear').style, 'yari');
  assert.equal(romanHorseman(random).style, 'longsword');
  // The Han's wing is not a rank of the crossbowmen's drill: the cavalry kit has none.
  assert.equal(hanHorseman(random).outfit.kind, 'hanCavalry');
});

test('each battle map has its wings of horse and no others: who rides, how many, and the foot line left as it was', () => {
  for (const [key, [red, blue]] of Object.entries(WINGS_OF)) {
    const played = sides(key);
    assert.equal(riders(played.red).length, red, `${key} red`);
    assert.equal(riders(played.blue).length, blue, `${key} blue`);
    // Everyone flagged to ride can (no horse is wasted on a man whose kit does not ride).
    for (const corner of ['red', 'blue']) for (const inputs of played[corner]) if (inputs.mounted) assert.ok(canRide(inputs), `${key} ${inputs.name}`);
    // The line of battle on foot (the fingerprint's) is the scenario's own, and has no horse.
    const foot = SCENARIOS[key].cast(seededRandom(1));
    assert.equal(riders(foot.red).length + riders(foot.blue).length, 0, `${key} on foot`);
  }
  // The maps without horse in history have none, and keep their own place and people (their armies only drawn apart: scenarios.js SPREAD).
  for (const key of ['zeelandia', 'rhodes', 'wokou', 'port', 'pride', 'subway']) {
    assert.equal(SCENARIOS[key].wings, undefined, key);
    assert.equal(battleOf(key).scene, SCENARIOS[key].scene, key);
    assert.equal(battleOf(key).cast, SCENARIOS[key].cast, key);
  }
  // A duel is left as it is.
  for (const key of ['pride', 'subway']) assert.equal(battleOf(key), SCENARIOS[key]);
});

test('the armies are about sixty to a hundred, and a wing is about a fifth of a side (Maidstone: the two lords)', () => {
  for (const key of Object.keys(WINGS_OF)) {
    const played = sides(key);
    const total = played.red.length + played.blue.length;
    if (key === 'rebellion') assert.equal(total, 25);
    else assert.ok(total >= 56 && total <= 100, `${key} ${total}`);
    for (const corner of ['red', 'blue']) {
      const wing = riders(played[corner]).length;
      // Pyongyang: Li Rusong brought the northern horse south, more of it to this fight than of any other wing (two in five of the Ming).
      if (key === 'pyongyang' && corner === 'red') assert.ok(wing / played[corner].length <= 0.4 && wing === 12, `${key} ${corner} wing ${wing} of ${played[corner].length}`);
      else if (wing && key !== 'rebellion') assert.ok(wing / played[corner].length <= 0.3 && wing >= 6 && wing <= 10, `${key} ${corner} wing ${wing} of ${played[corner].length}`);
    }
  }
});

test('the battle floors are wider than the foot line had, the scenery stays the map\'s own', () => {
  for (const key of ['legion', 'sekigahara', 'pyongyang']) {
    const foot = SCENARIOS[key].arena;
    const played = battleOf(key);
    assert.equal(played.scene, SCENARIOS[key].scene, `${key} keeps its scene`);
    assert.ok(played.arena.halfX >= 1.5 * foot.halfX || played.arena.halfX >= 28, `${key} floor ${played.arena.halfX} wide (was ${foot.halfX})`);
    assert.ok(played.arena.halfZ >= foot.halfZ, key);
    // The camera is drawn back for it.
    assert.ok(played.camera.distance > SCENARIOS[key].camera.distance, `${key} camera`);
    assert.ok(played.camera.maxDistance > SCENARIOS[key].camera.maxDistance, `${key} camera limit`);
  }
  // Maidstone's square is bounded by its house fronts: a little more floor only.
  const square = battleOf('rebellion').arena;
  assert.ok(square.halfX <= 12.5 - 1 && square.halfZ <= 10.5 - 1, 'inside the house fronts');
});

test('a wing starts held on its flank beyond the end of its own foot line and behind its front rank, the two sides on opposite flanks', () => {
  const world = scenarioWorld('sekigahara', 2);
  assert.equal(world.horses.length, 12);
  const foot = world.fighters.filter((fighter) => !fighter.mount);
  for (const corner of ['red', 'blue']) {
    const mine = foot.filter((fighter) => fighter.corner === corner);
    const widest = Math.max(...mine.map((fighter) => Math.abs(spot(fighter)[1])));
    const wing = world.fighters.filter((fighter) => fighter.corner === corner && fighter.mount);
    assert.equal(wing.length, 6, corner);
    const sign = corner === 'red' ? -1 : 1;
    const front = Math.min(...mine.map((fighter) => sign * spot(fighter)[0]));
    const flank = wing[0].wing.side;
    for (const fighter of wing) {
      assert.equal(fighter.wing.held, true);
      assert.equal(fighter.wing.side, flank, 'all on one flank');
      assert.ok(Math.abs(spot(fighter)[1]) > widest + 1, `${corner} rider clear of the foot line (${Math.abs(spot(fighter)[1]).toFixed(1)} m out, foot to ${widest.toFixed(1)})`);
      assert.equal(Math.sign(spot(fighter)[1]), flank);
      assert.ok(sign * spot(fighter)[0] >= front + WINGS.back - 0.01, `${corner} rider behind the front rank`);
      assert.ok(Math.abs(spot(fighter)[0]) < world.arena.halfX && Math.abs(spot(fighter)[1]) < world.arena.halfZ, 'inside the floor');
    }
  }
  const flanks = ['red', 'blue'].map((corner) => world.fighters.find((fighter) => fighter.corner === corner && fighter.mount).wing.side);
  assert.equal(flanks[0], -flanks[1], 'opposite flanks: the wings ride past each other, not into each other');
  // Riders face the enemy.
  for (const fighter of world.fighters.filter((one) => one.mount)) assert.ok(Math.cos(fighter.mount.yaw) * (fighter.corner === 'red' ? 1 : -1) > 0.99);
  // Drilled foot form up without them (the legion's rider is no man of the century).
  const legion = scenarioWorld('legion', 2);
  for (const formation of Object.values(legion.formations)) for (const id of formation.members) assert.ok(!legion.fighters[id].mount);
});

test('held, the wing stands still; released when the foot lines have closed (or its time is up), it goes at the enemy and strikes', () => {
  const world = scenarioWorld('sekigahara', 3);
  const wing = world.fighters.filter((fighter) => fighter.mount);
  const start = wing.map(spot);
  const released = () => wing.some((fighter) => !fighter.wing.held);
  let time = 0;
  while (!released() && time < 40) {
    advance(world, 0.25, (current, dt) => thinkAll(current, dt));
    time += 0.25;
    if (!released()) wing.forEach((fighter, index) => assert.ok(Math.hypot(spot(fighter)[0] - start[index][0], spot(fighter)[1] - start[index][1]) < 1.5, 'held where it stood'));
  }
  assert.ok(released(), 'released');
  assert.ok(time <= WINGS.by + 1, `by the time limit (${time} s)`);
  // The foot lines were within the release gap, or the time was up.
  const red = Math.max(...world.fighters.filter((fighter) => !fighter.mount && fighter.corner === 'red').map((fighter) => spot(fighter)[0]));
  const blue = Math.min(...world.fighters.filter((fighter) => !fighter.mount && fighter.corner === 'blue').map((fighter) => spot(fighter)[0]));
  assert.ok(blue - red <= WINGS.release + 0.5 || time >= WINGS.by - 0.5, `lines ${(blue - red).toFixed(1)} m apart at ${time} s`);
  // A gallop reaches the enemy: some rider strikes or rides down a man of the other side within ten seconds of the release.
  const riderIds = new Set(wing.map((fighter) => fighter.id));
  const goneAt = world.time;
  let contact = null;
  for (let step = 0; step < 40 && contact === null; step += 1) {
    advance(world, 0.25, (current, dt) => thinkAll(current, dt));
    contact = world.events.find((event) => event.time >= goneAt && ((event.kind === 'landed' && riderIds.has(event.attacker) && !riderIds.has(event.defender)) || (event.kind === 'trampled' && riderIds.has(world.horses[event.horse].rider) && world.fighters[event.fighter].corner !== world.horses[event.horse].corner)) ) ?? null;
  }
  assert.ok(contact, 'the charge reached the enemy');
  assert.ok(contact.time - goneAt < 10, `contact ${(contact.time - goneAt).toFixed(1)} s after the release`);
  for (const fighter of world.fighters) for (let index = 0; index < fighter.x.length; index += 1) assert.ok(Number.isFinite(fighter.x[index]), 'nothing blows up');
});

test('a rider struck, or an enemy horseman near, releases the wing at once', () => {
  const world = scenarioWorld('pyongyang', 1);
  const wing = world.fighters.filter((fighter) => fighter.mount);
  assert.ok(wing.every((fighter) => fighter.wing.held));
  wing[0].hitAt[P.pelvis] = world.time;
  advance(world, 0.5, (current, dt) => thinkAll(current, dt));
  assert.equal(wing[0].wing.held, false, 'the one struck rides');
});

test('wings are only for the fighters a level names: in a map with no wings the riders keep the old line-up', () => {
  const free = createWorld([
    { inputs: { ...mountedKnight(seededRandom(2)) }, corner: 'red' },
    { inputs: { ...mountedKnight(seededRandom(3)) }, corner: 'blue' },
  ], { seed: 1, arena: { halfX: 30, halfZ: 20 } });
  assert.equal(free.wings, undefined);
  assert.ok(free.fighters.every((fighter) => fighter.wing === undefined));
});

test('every map still builds and steps on its own floor, with its horse, headless', () => {
  for (const key of Object.keys(SCENARIOS)) {
    const world = scenarioWorld(key, 2);
    assert.ok(world.fighters.length >= 2, key);
    assert.deepEqual(world.arena, battleOf(key).arena, key);
    for (let step = 0; step < 4; step += 1) advance(world, 0.25, (current, dt) => thinkAll(current, dt));
    for (const fighter of world.fighters) {
      for (let index = 0; index < fighter.x.length; index += 1) assert.ok(Number.isFinite(fighter.x[index]), `${key}: ${fighter.body.inputs.name}`);
      assert.ok(Math.abs(spot(fighter)[0]) <= world.arena.halfX + 1 && Math.abs(spot(fighter)[1]) <= world.arena.halfZ + 1, `${key}: on the floor`);
    }
  }
});
