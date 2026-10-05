import test from 'node:test';
import assert from 'node:assert/strict';

import { seededRandom } from '../src/physics.js';
import { PRESETS } from '../src/body.js';
import { factionOf } from '../src/outfits.js';
import { STYLES } from '../src/moves.js';
import { SHIELDS, WEAPONS } from '../src/weapons.js';

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

test('the steppe and the Ottomans run from the unarmoured to the heavily armoured', () => {
  assert.deepEqual(['steppeBow', 'saberShield', 'maceShield', 'saber'].map(of), ['steppe', 'steppe', 'steppe', 'steppe']);
  assert.deepEqual(['azap', 'yatagan', 'sipahi'].map(of), ['ottomans', 'ottomans', 'ottomans']);
});

test('the one-handed maces: a little less blunt than the two-handed kanabo, with a parry shield', () => {
  assert.equal(WEAPONS.langya.hands, 'one');
  assert.ok(WEAPONS.langya.harm.swing.blunt < WEAPONS.kanabo.harm.swing.blunt && WEAPONS.langya.harm.swing.pierce > 0);
  assert.ok(WEAPONS.flangedMace.crush > WEAPONS.langya.crush);
  assert.equal(STYLES.langyaShield.shield, 'buckler');
  assert.equal(SHIELDS.buckler.look, 'steel');
  assert.ok(SHIELDS.buckler.radius < SHIELDS.roundShield.radius);
});

test('the composite bow casts a faster arrow than the long bow', () => {
  assert.ok(WEAPONS.compositeBow.arrowSpeed > 55 && WEAPONS.bow.arrowSpeed === undefined);
});

test('Rhodes 1522: the Order in plate and mail against Janissaries, azaps and heavy men', async () => {
  const { SCENARIOS } = await import('../src/scenarios.js');
  const cast = SCENARIOS.rhodes.cast(seededRandom(4));
  assert.ok(cast.red.every((fighter) => factionOf(fighter) === 'knights'));
  assert.ok(cast.blue.every((fighter) => factionOf(fighter) === 'ottomans'));
  assert.ok(cast.blue.length > cast.red.length);
});
