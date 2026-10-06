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

test('Wokou raid: rōnin and Chinese raiders against a garrison with about one brigandine man in five', async () => {
  const { SCENARIOS } = await import('../src/scenarios.js');
  const cast = SCENARIOS.wokou.cast(seededRandom(3));
  assert.ok(cast.red.some((fighter) => fighter.outfit.kind === 'ronin') && cast.red.some((fighter) => fighter.outfit.kind === 'wokou'));
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
