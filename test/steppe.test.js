import test from 'node:test';
import assert from 'node:assert/strict';

import { seededRandom } from '../src/physics.js';
import { PRESETS } from '../src/body.js';
import { factionOf } from '../src/outfits.js';
import { STYLES } from '../src/moves.js';
import { bowCast, SHIELDS, WEAPONS } from '../src/weapons.js';

const of = (key) => factionOf(PRESETS[key]);

test('each faction\'s legend of an earlier age: the Iron Pagoda, the kheshig, the alp; none of them in a level', async () => {
  assert.deepEqual(['ironPagoda', 'kheshig', 'gaziAlp'].map(of), ['chinese', 'steppe', 'ottomans']);
  const { SCENARIOS } = await import('../src/scenarios.js');
  for (const [key, level] of Object.entries(SCENARIOS)) {
    if (!level.cast) continue;
    const cast = level.cast(seededRandom(1));
    for (const fighter of [...cast.red, ...cast.blue]) assert.ok(!['ironPagoda', 'kheshig', 'gaziAlp'].includes(fighter.outfit?.kind), `${key}: ${fighter.outfit?.kind}`);
  }
});

test('Saladin: the sultanates\' flagship (Ayyubids and Ottomans under one faction), in no level; mail under a padded coat turns an edge best, a point fairly, a blow least', async () => {
  const { FACTIONS, OUTFITS, gearTraits } = await import('../src/outfits.js');
  const { WARRIORS } = await import('../src/roster.js');
  assert.equal(of('saladin'), 'ottomans');
  assert.equal(FACTIONS.ottomans.label, 'Sultanates');
  assert.match(FACTIONS.ottomans.blurb.en, /Ayyubid/);
  const flagships = WARRIORS.filter((warrior) => warrior.faction === 'ottomans' && warrior.flagship);
  assert.deepEqual(flagships.map((warrior) => warrior.key), ['saladin']);
  const { protection } = OUTFITS.saladin;
  assert.ok(protection.cut > protection.pierce && protection.pierce > protection.blunt);
  // Padding over the mail takes more of a blow than the Templar's bare mail and surcoat, less than plate.
  assert.ok(protection.blunt > OUTFITS.templar.protection.blunt && protection.blunt < OUTFITS.knight.protection.blunt);
  assert.ok(gearTraits(PRESETS.saladin).helmet.mass > 2);
  assert.equal(STYLES.saladin.weapon, 'sayf');
  assert.equal(STYLES.saladin.shield, 'turs');
  assert.ok(SHIELDS.turs.mass > SHIELDS.kalkan.mass, 'boards and leather outweigh wicker');
  const { SCENARIOS } = await import('../src/scenarios.js');
  for (const [key, level] of Object.entries(SCENARIOS)) {
    if (!level.cast) continue;
    const cast = level.cast(seededRandom(1));
    for (const fighter of [...cast.red, ...cast.blue]) assert.notEqual(fighter.outfit?.kind, 'saladin', key);
  }
});

test('the steppe and the Ottomans run from the unarmoured to the heavily armoured', () => {
  assert.deepEqual(['steppeBow', 'saberShield', 'maceShield', 'saber'].map(of), ['steppe', 'steppe', 'steppe', 'steppe']);
  assert.deepEqual(['azap', 'yatagan', 'sipahi'].map(of), ['ottomans', 'ottomans', 'ottomans']);
});

test('the one-handed maces: blunt with a pierce, about as hard-hitting as the kanabo, with a parry shield', () => {
  assert.equal(WEAPONS.langya.hands, 'one');
  assert.ok(Math.abs(WEAPONS.langya.harm.swing.blunt - WEAPONS.kanabo.harm.swing.blunt) <= 0.15 && WEAPONS.langya.harm.swing.pierce > 0);
  assert.ok(WEAPONS.flangedMace.crush > WEAPONS.langya.crush);
  assert.equal(STYLES.langyaShield.shield, 'buckler');
  assert.equal(SHIELDS.buckler.look, 'steel');
  assert.ok(SHIELDS.buckler.radius < SHIELDS.roundShield.radius);
});

test('the Iron Pagoda: the heavy spear first, the wolf-tooth mace his sidearm, drawn a little smaller than it strikes', async () => {
  const { OUTFITS } = await import('../src/outfits.js');
  assert.equal(PRESETS.ironPagoda.style, 'jinLance');
  assert.equal(STYLES.jinLance.weapon, 'manchuLance');
  assert.equal(STYLES.jinLance.fallback, 'mix', 'the kit\'s sidearm is drawn, not a style fallback');
  assert.equal(OUTFITS.ironPagoda.sidearm, 'langya');
  assert.equal(STYLES.langya.weapon, 'langya');
  assert.equal(STYLES.langya.shield, undefined);
  assert.ok(WEAPONS.langya.drawnRadius < WEAPONS.langya.radius && WEAPONS.langya.drawnRadius > 0.75 * WEAPONS.langya.radius);
});

test('the Iron Pagoda draws the wolf-tooth mace when his spear is lost', async () => {
  const { createWorld, dropWeapon } = await import('../src/physics.js');
  const world = createWorld([PRESETS.ironPagoda, PRESETS.kanabo], { seed: 3 });
  const pagoda = world.fighters[0];
  assert.equal(pagoda.weapon.kind, 'manchuLance');
  dropWeapon(world, pagoda, 'disarmed');
  assert.equal(pagoda.weapon?.kind, 'langya');
  assert.equal(pagoda.style, 'langya');
});

test('the composite bow casts a faster arrow than the long bow', () => {
  // (Was the hand-set arrowSpeed 62 against none; now each bow's cast from its build: weapons.js bowCast.)
  assert.ok(bowCast(WEAPONS.compositeBow).speed > 55 && bowCast(WEAPONS.compositeBow).speed > bowCast(WEAPONS.longbow).speed);
  assert.ok(bowCast(WEAPONS.compositeBow).speed > bowCast(WEAPONS.bow).speed);
});

test('Rhodes 1522: the Order in plate and mail against Janissaries, azaps and heavy men', async () => {
  const { SCENARIOS } = await import('../src/scenarios.js');
  const cast = SCENARIOS.rhodes.cast(seededRandom(4));
  assert.ok(cast.red.every((fighter) => factionOf(fighter) === 'knights'));
  assert.ok(cast.blue.every((fighter) => factionOf(fighter) === 'ottomans'));
  assert.ok(cast.blue.length > cast.red.length);
});
