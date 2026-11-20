import test from 'node:test';
import assert from 'node:assert/strict';

import { seededRandom } from '../src/physics.js';
import { factionOf, OUTFITS } from '../src/outfits.js';
import { STYLES } from '../src/moves.js';
import { WEAPONS } from '../src/weapons.js';

const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;

test('obsidian cuts flesh better than steel does, but chips on armour', () => {
  assert.ok(WEAPONS.macuahuitl.harm.swing.cut > WEAPONS.espada.harm.swing.cut);
  assert.ok(WEAPONS.macuahuitl.brittle > 0 && WEAPONS.macuahuitl.brittle < 1 && !WEAPONS.espada.brittle);
});

test('obsidian flakes set in wood: a short club and a short spear that cut shallow and strike lighter', () => {
  const { macuahuitl, tepoztopilli, katana, spear, espada } = WEAPONS;
  assert.ok(macuahuitl.length < espada.length && tepoztopilli.length <= spear.length);
  assert.ok(macuahuitl.harm.swing.cut < katana.harm.swing.cut);
  for (const club of [macuahuitl, tepoztopilli]) assert.ok(club.cleave < 1 && club.harm.swing.blunt < katana.harm.swing.blunt + 0.01);
});

test('Fort Zeelandia: the iron men in their own scale and iron faces, with the zhanmadao or the rattan shield; a few ronin among Koxinga\'s men', async () => {
  const { SCENARIOS } = await import('../src/scenarios.js');
  const cast = SCENARIOS.zeelandia.cast(seededRandom(2));
  const ironMen = cast.blue.filter((fighter) => fighter.outfit.kind === 'ironMan');
  assert.ok(ironMen.length >= 3);
  for (const man of ironMen) {
    const design = OUTFITS.ironMan.designs[man.outfit.design];
    assert.equal(design.armor.kind, 'ironManScale');
    assert.equal(design.head.maskDesign, 'somen');
    assert.ok(['zhanmadao', 'rattanShield'].includes(man.style), man.style);
  }
  assert.ok(!cast.blue.some((fighter) => fighter.outfit.kind === 'mingElite'), 'no Ming elite among them');
  // A few iron men, the rest garrison troops (no brigandine regulars since 2026-11-19).
  assert.ok(cast.blue.filter((fighter) => fighter.outfit.kind === 'mingGarrison').length > cast.blue.length / 2);
  assert.ok(cast.red.some((fighter) => fighter.style === 'halberd'), 'halberds among the Dutch');
  const ronin = cast.blue.filter((fighter) => fighter.outfit.kind === 'ronin');
  assert.ok(ronin.length >= 1 && ronin.length <= 3);
  assert.ok(cast.red.every((fighter) => factionOf(fighter) === 'knights'));
});

test('Wokou raid: Japanese and Chinese raiders, the Chinese many barefoot and unarmoured, many in a dō-maru, against a garrison with a pair of brigandine regulars among a levy', async () => {
  const { SCENARIOS } = await import('../src/scenarios.js');
  const { OUTFITS } = await import('../src/outfits.js');
  // Over a few casts: most of the Chinese raiders unarmoured, some in a piece (the rōnin and the samurai of
  // the class, in their own kit with the crest, apart).
  const kinds = {};
  for (const seed of [1, 2, 3, 4, 5]) for (const fighter of SCENARIOS.wokou.cast(seededRandom(seed)).red) if (fighter.outfit.kind !== 'ronin' && !fighter.accessories.includes('crest')) kinds[fighter.outfit.kind] = (kinds[fighter.outfit.kind] ?? 0) + 1;
  const total = Object.values(kinds).reduce((sum, count) => sum + count, 0);
  // Better armoured than a mob: under half in nothing at all, but still the largest kind.
  assert.ok(kinds.wokou / total > 0.3 && kinds.wokou / total < 0.6 && kinds.wokouArmoured > 0, JSON.stringify(kinds));
  // The rest are the Chinese pirates: a captured piece at most, no ashigaru's or samurai's harness (the Japanese are all of the class).
  assert.equal((kinds.ashigaru ?? 0) + (kinds.samurai ?? 0), 0, 'no ashigaru');
  assert.ok(OUTFITS.wokou.designs.filter((design) => design.feet.kind === 'bare').length >= OUTFITS.wokou.designs.length - 1, 'barefoot');
  // The dō-maru guards the trunk only.
  assert.ok(OUTFITS.wokouArmoured.protection.cut > 0.5 && OUTFITS.wokouArmoured.protection.regions.limb.cut < 0.1);
  const cast = SCENARIOS.wokou.cast(seededRandom(3));
  const regulars = cast.blue.filter((fighter) => fighter.outfit.kind === 'mingBrigandine').length;
  assert.ok(regulars >= 1 && regulars <= 2 && cast.blue.length > regulars * 10, `${regulars} of ${cast.blue.length}`);
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
  for (const key of ['pyongyang', 'zeelandia', 'rhodes']) {
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
      // (Within each man's own loose standing off his place, `loose` m either way: two men a row apart can come that near.)
      const slack = 2 * (level.formation?.[corner]?.loose ?? 0);
      assert.ok(nearest > furthestShooter - slack, `${key} ${corner}: the blades (from ${nearest.toFixed(1)} m) behind the shooters (to ${furthestShooter.toFixed(1)} m)`);
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

test('Nanjing: Koxinga\'s iron men in front of his levies, the banners and a wing of Bayara on horse against them, in the lower Yangzi\'s late summer', async () => {
  const { SCENARIOS, battleOf } = await import('../src/scenarios.js');
  const { red, blue } = battleOf('nanjing').cast(seededRandom(2));
  const ironMen = red.filter((fighter) => fighter.outfit.kind === 'ironMan');
  assert.equal(ironMen.length, 8);
  assert.ok(red.slice(0, 8).every((fighter) => fighter.outfit.kind === 'ironMan'), 'the iron men in front');
  assert.ok(red.filter((fighter) => fighter.outfit.kind === 'mingGarrison').length > red.length / 2 - 1, 'most of his army levies');
  assert.equal(blue.filter((fighter) => fighter.mounted).length, 8);
  assert.ok(blue.every((fighter) => ['bannerArmour', 'bayara'].includes(fighter.outfit.kind)));
  assert.equal(SCENARIOS.nanjing.climate, 'nanjing1659');
  assert.deepEqual(SCENARIOS.nanjing.armies, { red: ['koxinga'], blue: ['banners'] });
});

