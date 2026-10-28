import test from 'node:test';
import assert from 'node:assert/strict';

import { normaliseInputs, P, PRESETS } from '../src/body.js';
import { AI, shockFear, strangeness, thinkAll } from '../src/ai.js';
import { atahualpa, europeanSoldier, incaMan, weightOf } from '../src/cast.js';
import { advance, createWorld, seededRandom } from '../src/physics.js';
import { FACTIONS, factionOf, OUTFITS } from '../src/outfits.js';
import { MUSTER } from '../src/muster.js';
import { battleOf, SCENARIOS, scenarioWorld } from '../src/scenarios.js';
import { WEAPONS } from '../src/weapons.js';

const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
const armour = (kind) => { const { blunt, cut, pierce } = OUTFITS[kind].protection; return (blunt + cut + pierce) / 3; };

test('the Inca kits are woven cloth, no armour; the Sapa Inca\'s tocapu and mascapaicha are his alone', () => {
  for (const kind of ['incaUncu', 'incaNoble']) {
    assert.equal(OUTFITS[kind].faction, 'inca');
    assert.ok(armour(kind) < 0.1, kind);
    assert.equal(OUTFITS[kind].protection.bullet.torso, 0);
    for (const design of OUTFITS[kind].designs) {
      assert.match(design.armor.kind, /^uncu/);
      assert.equal(design.head.kind, 'llautu');
      assert.equal(design.feet.kind, 'sandal');
    }
  }
  const royal = OUTFITS.incaNoble.designs.filter((design) => design.special);
  assert.equal(royal.length, 1);
  assert.equal(royal[0].armor.kind, 'uncuRoyal');
  assert.ok(royal[0].head.fringe && royal[0].head.earspools);
  // The lords wear the gold earspools; the commons do not.
  assert.ok(OUTFITS.incaNoble.designs.every((design) => design.head.earspools));
  assert.ok(OUTFITS.incaUncu.designs.every((design) => !design.head.earspools));
  // The champi: a bronze star mace, blunt with a bite, lighter in the head than an iron mace.
  assert.ok(WEAPONS.champi.harm.swing.blunt > 1 && WEAPONS.champi.harm.swing.pierce > 0 && WEAPONS.champi.crush < WEAPONS.flangedMace.crush);
});

test('Andean men: shorter than the Spaniards and stocky, heavy for their height', () => {
  const random = seededRandom(3);
  const inca = Array.from({ length: 40 }, () => incaMan(random));
  const spaniards = Array.from({ length: 40 }, () => europeanSoldier(random, 'rodelero'));
  assert.ok(mean(inca.map((man) => man.heightCm)) < mean(spaniards.map((man) => man.heightCm)) - 6);
  const bmi = (man) => weightOf(man) / (man.heightCm / 100) ** 2;
  assert.ok(mean(inca.map(bmi)) > mean(spaniards.map(bmi)), 'stocky: heavier for their height');
  for (const man of inca) assert.equal(factionOf(man), 'inca');
  const sapa = atahualpa(seededRandom(1));
  assert.equal(sapa.name, 'Atahualpa');
  assert.ok(sapa.leads);
  assert.ok(OUTFITS.incaNoble.designs[sapa.outfit.design].special);
});

test('Cajamarca: a small band of Spaniards, a third of them horse, against Atahualpa\'s unarmed retinue at the cap', () => {
  const cast = SCENARIOS.cajamarca.cast(seededRandom(1));
  assert.ok(cast.red.length >= 8 && cast.red.length <= 14 && cast.blue.length <= MUSTER.cap);
  assert.equal(cast.blue.length, MUSTER.cap);
  assert.ok(cast.red.every((man) => factionOf(man) === 'knights'));
  assert.ok(cast.blue.every((man) => factionOf(man) === 'inca' && !man.mounted && !WEAPONS[man.style]?.shot));
  const horse = cast.red.filter((man) => man.mounted).length;
  assert.ok(horse >= 4 && horse <= 6);
  assert.ok(cast.red.some((man) => man.style === 'matchlock') && cast.red.some((man) => man.style === 'espadaRodela'));
  assert.ok(cast.red.find((man) => man.name === 'Francisco Pizarro')?.leads);
  // Most of the retinue unarmed; a few with the champi; Atahualpa in the middle (the crowd's first place).
  const unarmed = cast.blue.filter((man) => man.style === 'unskilled').length;
  assert.ok(unarmed / cast.blue.length > 0.7 && cast.blue.some((man) => man.style === 'champi'));
  assert.equal(cast.blue[0].name, 'Atahualpa');
  // An ambush is laid where it was laid: the level is played as it is, not drawn apart.
  assert.deepEqual(battleOf('cajamarca').formation, SCENARIOS.cajamarca.formation);
});

test('the ambush: the Spaniards wait hidden in the doorways round the crowd, unseen, and come out at the signal', () => {
  const world = scenarioWorld('cajamarca', 2);
  const spaniards = world.fighters.filter((fighter) => fighter.corner === 'red');
  const inca = world.fighters.filter((fighter) => fighter.corner === 'blue');
  const at = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
  // On the floor; on more sides than one (the west end and both long halls).
  for (const fighter of world.fighters) assert.ok(Math.abs(at(fighter)[0]) < world.arena.halfX && Math.abs(at(fighter)[1]) < world.arena.halfZ);
  assert.ok(spaniards.some((fighter) => at(fighter)[1] < -8) && spaniards.some((fighter) => at(fighter)[1] > 8) && spaniards.some((fighter) => at(fighter)[0] < -14));
  assert.ok(spaniards.every((fighter) => fighter.hidden));
  const start = inca.map(at);
  const signal = SCENARIOS.cajamarca.formation.red.ambush.signal;
  while (world.time < signal - 0.5) advance(world, 0.1, (current, dt) => thinkAll(current, dt));
  // Before it: nobody of the crowd goes for a man he cannot see, nor is afraid.
  assert.ok(spaniards.every((fighter) => fighter.hidden));
  assert.ok(inca.every((fighter, index) => Math.hypot(at(fighter)[0] - start[index][0], at(fighter)[1] - start[index][1]) < 1), 'the crowd stands');
  assert.ok(inca.every((fighter) => !fighter.panicked && (fighter.fear ?? 0) < 0.2));
  while (world.time < signal + 0.5) advance(world, 0.1, (current, dt) => thinkAll(current, dt));
  assert.ok(world.ambush.sprung && spaniards.every((fighter) => !fighter.hidden));
  assert.ok(world.events.some((event) => event.kind === 'ambush'));
});

test('shock: a gun fired near a man startles him, three times as much if his people had never heard one (a general rule: FACTIONS strangers)', () => {
  assert.deepEqual(FACTIONS.inca.strangers.sort(), ['gun', 'horse']);
  assert.deepEqual(FACTIONS.mexica.strangers.sort(), ['gun', 'horse']);
  for (const key of ['knights', 'japanese', 'chinese', 'ottomans']) assert.equal(FACTIONS[key].strangers, undefined, key);
  const gunner = normaliseInputs({ ...structuredClone(PRESETS.contender), style: 'matchlock', outfit: { kind: 'conquistadorQuilted', design: 0 } });
  const inca = incaMan(seededRandom(1));
  const spaniard = europeanSoldier(seededRandom(2), 'rodelero');
  const world = createWorld([{ inputs: gunner, corner: 'red' }, { inputs: inca, corner: 'blue' }, { inputs: spaniard, corner: 'blue' }], { seed: 1, arena: { halfX: 20, halfZ: 20 } });
  const [shooter, man, other] = world.fighters;
  assert.equal(strangeness(man, 'gun'), AI.shock.strange);
  assert.equal(strangeness(other, 'gun'), 1);
  // Both the same way from the muzzle, inside `blastNear`: each startled in full.
  const muzzle = [shooter.x[P.pelvis * 3], 1.4, shooter.x[P.pelvis * 3 + 2]];
  for (const fighter of [man, other]) fighter.x[P.pelvis * 3] = muzzle[0] + 3;
  world.events.push({ time: world.time, kind: 'shot', attacker: shooter.id, from: muzzle, to: muzzle, effects: [] });
  thinkAll(world, 1 / 60);
  assert.ok(Math.abs(other.startle - AI.shock.blast) < 1e-3, `${other.startle}`);
  assert.ok(Math.abs(man.startle - AI.shock.blast * AI.shock.strange) < 1e-3, `${man.startle}`);
  assert.ok(shockFear(world, man) > 2.5 * shockFear(world, other));
  // His own side's gun is no shock to him.
  assert.ok(!shooter.startle);
  // It dies away.
  const before = man.startle;
  for (let step = 0; step < 60 * AI.shock.halfLife; step += 1) thinkAll(world, 1 / 60);
  assert.ok(man.startle < before * 0.55);
});

test('shock: a horse of the enemy\'s coming at a man at speed frightens him, the more the nearer; not one going away', () => {
  const rider = normaliseInputs({ ...europeanSoldier(seededRandom(4), 'hidalgo'), style: 'lance', mounted: true });
  const world = createWorld([{ inputs: rider, corner: 'red' }, { inputs: incaMan(seededRandom(5)), corner: 'blue' }, { inputs: europeanSoldier(seededRandom(6), 'rodelero'), corner: 'blue' }], { seed: 2, arena: { halfX: 30, halfZ: 20 } });
  const [horseman, man, other] = world.fighters;
  const horse = horseman.mount;
  assert.ok(horse, 'he rides');
  horse.at = [0, 0];
  horse.yaw = 0;
  horse.speed = 8;
  for (const [fighter, z] of [[man, -0.5], [other, 0.5]]) {
    fighter.x[P.pelvis * 3] = 4;
    fighter.x[P.pelvis * 3 + 2] = z;
  }
  const near = shockFear(world, man);
  assert.ok(near > 0 && Math.abs(near / shockFear(world, other) - AI.shock.strange) < 0.05, `${near}`);
  man.x[P.pelvis * 3] = 8;
  assert.ok(shockFear(world, man) < near, 'further off, less');
  // Going away from him, or walking: nothing.
  horse.yaw = Math.PI;
  assert.equal(shockFear(world, man), 0);
  horse.yaw = 0;
  horse.speed = 1;
  assert.equal(shockFear(world, man), 0);
});
