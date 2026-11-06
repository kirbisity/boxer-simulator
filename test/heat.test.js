import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, reachOf, seededRandom } from '../src/physics.js';
import { WORLD } from '../src/physics/config.js';
import { climateOf, evaporationShare, heatMark, heatRecovery, heatStrength, kitHeat, loadWatts, stepHeat } from '../src/physics/heat.js';
import { DRILL, moveFormations } from '../src/formation.js';
import { legionSides, SCENARIOS } from '../src/scenarios.js';

const knight = () => ({ ...PRESETS.knight, style: 'boxing' });
const unarmoured = () => ({ ...PRESETS.knight, style: 'boxing', outfit: { kind: 'casual', design: 0 }, accessories: [] });

/** A man who draws `perSecond` of his stamina for `seconds` (his bar kept topped up), in the air of `place`: his core after. */
function workedCore(inputs, perSecond, seconds, place = null) {
  const world = createWorld([inputs], { seed: 1, place });
  const fighter = world.fighters[0];
  const dt = 1 / 20;
  for (let t = 0; t < seconds; t += dt) {
    fighter.stamina = 0.8 - perSecond * dt;
    stepHeat(world, fighter, dt);
    fighter.stamina = 0.8;
    heatMark(fighter);
  }
  return fighter.heat.core;
}

test('every man starts at 37 C and a man at rest stays there', () => {
  const world = createWorld([knight(), unarmoured()], { seed: 1 });
  for (const fighter of world.fighters) assert.equal(fighter.heat.core, WORLD.heat.core);
  assert.equal(workedCore(unarmoured(), 0, 60), WORLD.heat.core);
});

test('work warms him; plate keeps the heat in, and a hot place cools him slower', () => {
  // ~0.05 of the bar a second: hard work, about his whole recovery.
  const bare = workedCore(unarmoured(), 0.05, 300);
  const plate = workedCore(knight(), 0.05, 300);
  const desert = workedCore(knight(), 0.05, 300, 'carrhae');
  assert.ok(bare > WORLD.heat.core, `warmed (${bare})`);
  assert.ok(plate > bare + 0.2, `plate hotter (${plate} vs ${bare})`);
  assert.ok(desert > plate + 0.05, `hotter still in the desert (${desert} vs ${plate})`);
  // Real magnitudes: five minutes of hard work in plate is tenths of a degree, not several (no heat stroke in a bout).
  assert.ok(plate < 38.5, `${plate}`);
});

test('the air: damp heat lets far less sweat evaporate than temperate air, hot dry desert air nearly as much', () => {
  assert.ok(evaporationShare(climateOf('jiangnan')) < 0.6);
  assert.ok(evaporationShare(climateOf('carrhae')) > 0.85);
  assert.equal(climateOf('nowhere'), WORLD.heat.climates.temperate);
});

test('his kit: a full harness covers him, keeps heat in and hampers his breathing; ordinary clothes do neither', () => {
  const world = createWorld([knight(), unarmoured()], { seed: 1 });
  const [plate, bare] = world.fighters.map(kitHeat);
  assert.ok(plate.cover > 0.9 && bare.cover === 0);
  assert.ok(plate.conductance < bare.conductance / 2);
  assert.ok(plate.breath < 1 && bare.breath === 1);
  assert.ok(plate.armourKg > 15 && plate.armourKg < 30, `${plate.armourKg} kg of harness`);
});

test('armour costs breath to move in (Askew 2012): a walk drains a knight, not an unarmoured man', () => {
  const world = createWorld([knight(), unarmoured()], { seed: 1 });
  const [plate, bare] = world.fighters;
  for (const fighter of world.fighters) fighter.rootVelocity = [1.3, 0];
  assert.equal(loadWatts(bare), 0);
  // ~1.9 × 23 kg × 2 J/kg/m × 1.3 m/s ≈ 110 W.
  assert.ok(loadWatts(plate) > 80 && loadWatts(plate) < 160, `${loadWatts(plate)} W`);
  plate.stamina = 0.8;
  heatMark(plate);
  stepHeat(world, plate, 1);
  assert.ok(plate.stamina < 0.8 && plate.stamina > 0.79, `${plate.stamina}`);
  plate.rootVelocity = [0, 0];
  assert.equal(loadWatts(plate), 0);
});

test('hot past 38.5 C his wind comes back slower; past 39 C his muscles weaken', () => {
  const world = createWorld([unarmoured()], { seed: 1 });
  const fighter = world.fighters[0];
  assert.equal(heatRecovery(fighter), 1);
  assert.equal(heatStrength(fighter), 1);
  fighter.heat.core = 39.5;
  assert.ok(heatRecovery(fighter) < 0.75 && heatRecovery(fighter) > WORLD.heat.recoveryAtLimit);
  assert.ok(heatStrength(fighter) < 1 && heatStrength(fighter) > WORLD.heat.strengthAtLimit);
  fighter.heat.core = 41;
  assert.equal(heatStrength(fighter), WORLD.heat.strengthAtLimit);
  // In the step: the same rest gives him less back hot than cool.
  const regained = (core) => {
    const w = createWorld([unarmoured()], { seed: 1 });
    const man = w.fighters[0];
    man.stamina = 0.3;
    man.heat.core = core;
    advance(w, 1);
    return man.stamina - 0.3;
  };
  assert.ok(regained(39.6) < regained(37) * 0.75);
});

test('two blown men stand off out of reach and get their wind, then go at it again: no timer, their stamina says when', () => {
  const world = createWorld([unarmoured(), unarmoured()], { seed: 4 });
  advance(world, 2, (current, dt) => thinkAll(current, dt));
  for (const fighter of world.fighters) fighter.stamina = 0.1;
  const apart = () => Math.hypot(world.fighters[0].x[P.pelvis * 3] - world.fighters[1].x[P.pelvis * 3], world.fighters[0].x[P.pelvis * 3 + 2] - world.fighters[1].x[P.pelvis * 3 + 2]);
  let thrown = world.fighters.reduce((sum, fighter) => sum + fighter.stats.thrown, 0);
  advance(world, 3, (current, dt) => thinkAll(current, dt));
  assert.ok(world.fighters.every((fighter) => fighter.aiBreather), 'both getting their wind');
  const reach = Math.max(...world.fighters.map((fighter) => reachOf(fighter)));
  assert.ok(apart() > reach + 0.2, `stood off (${apart().toFixed(2)} m apart, reach ${reach.toFixed(2)})`);
  assert.equal(world.fighters.reduce((sum, fighter) => sum + fighter.stats.thrown, 0), thrown, 'nothing thrown while apart');
  // Their wind back, they are at it again.
  advance(world, 12, (current, dt) => thinkAll(current, dt));
  assert.ok(world.fighters.every((fighter) => !fighter.aiBreather));
  thrown = world.fighters.reduce((sum, fighter) => sum + fighter.stats.thrown, 0);
  advance(world, 6, (current, dt) => thinkAll(current, dt));
  assert.ok(world.fighters.reduce((sum, fighter) => sum + fighter.stats.thrown, 0) > thrown, 'fighting again');
});

test('in the ranks a blown front-rank man changes places with a fresh man behind him in his file', () => {
  const sides = legionSides(seededRandom(3), 40);
  const level = SCENARIOS.legion;
  const world = createWorld([...sides.red.map((inputs) => ({ inputs, corner: 'red' })), ...sides.blue.map((inputs) => ({ inputs, corner: 'blue' }))], { seed: 3, arena: level.arena, formation: level.formation });
  const formation = world.formations.red;
  moveFormations(world, 1 / 60);
  const members = formation.members.map((id) => world.fighters[id]);
  const front = members.find((fighter) => fighter.inFront && fighter.weapon?.held);
  const place = { ...front.slot };
  const behind = members.filter((fighter) => fighter !== front && Math.abs(fighter.slot.across - place.across) < DRILL.file && fighter.slot.ahead < place.ahead).sort((a, b) => b.slot.ahead - a.slot.ahead)[0];
  assert.ok(behind, 'someone behind him');
  front.stamina = DRILL.spentBelow - 0.1;
  formation.review = 0;
  moveFormations(world, 1 / 60);
  assert.deepEqual(behind.slot, place, 'the fresh man has his place');
  assert.ok(front.slot.ahead < place.ahead, 'he goes back');
  assert.equal(front.relievedAt, world.time);
});
