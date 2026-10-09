import test from 'node:test';
import assert from 'node:assert/strict';

import { seededRandom } from '../src/physics.js';
import { factionOf, OUTFITS } from '../src/outfits.js';
import { STYLES } from '../src/moves.js';
import { WEAPONS } from '../src/weapons.js';

const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;

test('Otumba: conquistadors and Tlaxcalans against the Mexica; the Spaniards in steel, built a little taller', async () => {
  const { SCENARIOS } = await import('../src/scenarios.js');
  const cast = SCENARIOS.otumba.cast(seededRandom(1));
  const spaniards = cast.red.filter((fighter) => factionOf(fighter) === 'knights');
  assert.ok(spaniards.length >= 10 && cast.red.some((fighter) => factionOf(fighter) === 'mexica'), 'Spaniards with native allies');
  assert.ok(cast.blue.every((fighter) => factionOf(fighter) === 'mexica'));
  assert.ok(mean(spaniards.map((fighter) => fighter.heightCm)) > mean(cast.blue.map((fighter) => fighter.heightCm)));
  assert.ok(spaniards.some((fighter) => fighter.style === 'matchlock') && spaniards.some((fighter) => fighter.style === 'espadaRodela'));
});

test('obsidian cuts flesh better than steel does, but chips on armour', () => {
  assert.ok(WEAPONS.macuahuitl.harm.swing.cut > WEAPONS.espada.harm.swing.cut);
  assert.ok(WEAPONS.macuahuitl.brittle > 0 && WEAPONS.macuahuitl.brittle < 1 && !WEAPONS.espada.brittle);
});

test('Fort Zeelandia: the iron men are all masked and in scale; a few ronin among Koxinga\'s men', async () => {
  const { SCENARIOS } = await import('../src/scenarios.js');
  const cast = SCENARIOS.zeelandia.cast(seededRandom(2));
  const elites = cast.blue.filter((fighter) => fighter.outfit.kind === 'mingElite');
  assert.ok(elites.length >= 4);
  for (const elite of elites) {
    const design = OUTFITS.mingElite.designs[elite.outfit.design];
    assert.equal(design.armor.kind, 'mingScale');
    assert.ok(design.head.mask);
  }
  assert.ok(cast.blue.some((fighter) => fighter.outfit.kind === 'mingGarrison') && cast.blue.some((fighter) => fighter.outfit.kind === 'mingBrigandine'));
  const ronin = cast.blue.filter((fighter) => fighter.outfit.kind === 'ronin');
  assert.ok(ronin.length >= 1 && ronin.length <= 3);
  assert.ok(cast.red.every((fighter) => factionOf(fighter) === 'knights'));
});

test('Wokou raid: Japanese and Chinese raiders, many barefoot and unarmoured, many in a dō-maru, against a garrison with about one brigandine man in five', async () => {
  const { SCENARIOS } = await import('../src/scenarios.js');
  const { OUTFITS } = await import('../src/outfits.js');
  // Over a few casts: most raiders unarmoured, some in a piece, a few in full armour.
  const kinds = {};
  for (const seed of [1, 2, 3, 4, 5]) for (const fighter of SCENARIOS.wokou.cast(seededRandom(seed)).red) kinds[fighter.outfit.kind] = (kinds[fighter.outfit.kind] ?? 0) + 1;
  const total = Object.values(kinds).reduce((sum, count) => sum + count, 0);
  // Better armoured than a mob: under half in nothing at all, but still the largest kind.
  assert.ok(kinds.wokou / total > 0.3 && kinds.wokou / total < 0.6 && kinds.wokouArmoured > 0, JSON.stringify(kinds));
  assert.ok((kinds.ashigaru ?? 0) + (kinds.samurai ?? 0) > 0, 'a few in full armour');
  assert.ok(OUTFITS.wokou.designs.filter((design) => design.feet.kind === 'bare').length >= OUTFITS.wokou.designs.length - 1, 'barefoot');
  // The dō-maru guards the trunk only.
  assert.ok(OUTFITS.wokouArmoured.protection.cut > 0.5 && OUTFITS.wokouArmoured.protection.regions.limb.cut < 0.1);
  const cast = SCENARIOS.wokou.cast(seededRandom(3));
  const regulars = cast.blue.filter((fighter) => fighter.outfit.kind === 'mingBrigandine').length;
  assert.ok(regulars / cast.blue.length > 0.12 && regulars / cast.blue.length < 0.28, `${regulars} of ${cast.blue.length}`);
});

test('the new styles are in their factions, and tai chi and taekwondo stay out of the mixed style', () => {
  assert.ok(!STYLES.mix.mix.includes('taichi') && !STYLES.mix.mix.includes('taekwondo'));
  assert.ok(WEAPONS.staff.harm.swing.cut === undefined && WEAPONS.staff.harm.swing.blunt > 0, 'the staff is all blunt');
  assert.ok(WEAPONS.staff.strikeFrom < 0, 'both ends strike');
  assert.ok(WEAPONS.kanabo.mass > WEAPONS.warhammer.mass);
  assert.ok(!Object.keys(STYLES.kanabo.attacks).some((move) => /Thrust/.test(move)), 'no kanabo thrusts');
  assert.equal(WEAPONS.threeEyed.shot.barrels, 3);
  assert.ok(WEAPONS.threeEyed.shot.energy < WEAPONS.matchlock.shot.energy && WEAPONS.threeEyed.shot.spread > WEAPONS.matchlock.shot.spread);
});

test('in the set battles the bows and guns open in the front rows, the blades and spears behind them with a gap', async () => {
  const { SCENARIOS } = await import('../src/scenarios.js');
  const { createWorld } = await import('../src/physics.js');
  for (const key of ['sekigahara', 'pyongyang', 'zeelandia', 'rhodes']) {
    const level = SCENARIOS[key];
    const cast = level.cast(seededRandom(3));
    const world = createWorld([...cast.red.map((inputs) => ({ inputs, corner: 'red' })), ...cast.blue.map((inputs) => ({ inputs, corner: 'blue' }))], { seed: 3, arena: level.arena, formation: level.formation });
    for (const corner of ['red', 'blue']) {
      const team = world.fighters.filter((fighter) => fighter.corner === corner);
      const shooters = team.filter((fighter) => STYLES[fighter.style]?.ranged);
      const rest = team.filter((fighter) => !STYLES[fighter.style]?.ranged);
      if (!shooters.length || !rest.length) continue;
      const nearest = Math.min(...rest.map((fighter) => Math.abs(fighter.x[24])));
      const furthestShooter = Math.max(...shooters.map((fighter) => Math.abs(fighter.x[24])));
      assert.ok(nearest > furthestShooter, `${key} ${corner}: the blades (from ${nearest.toFixed(1)} m) behind the shooters (to ${furthestShooter.toFixed(1)} m)`);
    }
  }
});

test('Tametomo stands and shoots, never backing off; a man in close, he drops the bow and charges with the ōdachi', async () => {
  const { PRESETS } = await import('../src/body.js');
  const { advance, createWorld } = await import('../src/physics.js');
  const { thinkAll } = await import('../src/ai.js');
  const key = Object.keys(PRESETS).find((name) => PRESETS[name].style === 'yumi');
  const world = createWorld([{ inputs: structuredClone(PRESETS[key]), corner: 'red' }, { inputs: structuredClone(PRESETS.samurai), corner: 'blue' }], { seed: 2 });
  const archer = world.fighters[0];
  let backedOff = 0;
  let charged = 0;
  for (let step = 0; step < 60 * 6 && archer.state === 'up'; step += 1) {
    const bow = archer.weapon?.kind === 'yumi';
    advance(world, 1 / 60, (current, dt) => thinkAll(current, dt));
    if (bow && archer.weapon?.kind === 'yumi' && archer.move < -0.05) backedOff += 1;
    if (archer.aiCharge && archer.running) charged += 1;
  }
  assert.equal(backedOff, 0, 'no step back with the bow');
  assert.ok(charged > 10, `he ran in after the bow (${charged} frames)`);
  assert.notEqual(archer.weapon?.kind, 'yumi', 'the bow is down');
});
