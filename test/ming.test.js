import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBody } from '../src/body.js';
import { seededRandom } from '../src/physics.js';
import { OUTFITS } from '../src/outfits.js';
import { WEAPONS } from '../src/weapons.js';

test('the Ming elite turns blades and arrows nearly as plate does; the brigandine man is better kept than the garrison man', () => {
  const elite = OUTFITS.mingElite;
  assert.ok(elite.deflects && elite.arrowproof);
  assert.ok(elite.protection.cut >= 0.95);
  const brigandine = OUTFITS.mingBrigandine.protection;
  const garrison = OUTFITS.mingGarrison.protection;
  for (const kind of ['blunt', 'cut', 'pierce']) {
    assert.ok(brigandine[kind] > garrison[kind], kind);
    assert.ok(elite.protection[kind] > brigandine[kind], kind);
  }
  // Some elites wear the steel mask and neck guard.
  assert.ok(elite.designs.some((design) => design.head.mask && design.head.neck === 'steel'));
});

test('the guandao sits between the naginata and the war hammer: more blunt, some of it through armour', () => {
  const { naginata, guandao, warhammer } = WEAPONS;
  assert.ok(guandao.harm.swing.blunt > naginata.harm.swing.blunt && guandao.harm.swing.blunt < warhammer.harm.swing.blunt);
  assert.ok((guandao.crush ?? 0) > (naginata.crush ?? 0) && guandao.crush < warhammer.crush);
  assert.ok(guandao.mass > naginata.mass);
  assert.ok(guandao.harm.swing.cut < naginata.harm.swing.cut && guandao.harm.thrust.pierce < naginata.harm.thrust.pierce);
});

test('Pyongyang: Ming regulars only, taller and heavier than the Japanese they face', async () => {
  const { SCENARIOS } = await import('../src/scenarios.js');
  const heights = { red: [], blue: [] };
  const weights = { red: [], blue: [] };
  for (let seed = 1; seed <= 3; seed += 1) {
    const cast = SCENARIOS.pyongyang.cast(seededRandom(seed));
    assert.equal(cast.red.length, 20);
    assert.ok(cast.red.every((fighter) => ['mingBrigandine', 'mingElite'].includes(fighter.outfit.kind)), 'no garrison levies');
    for (const side of ['red', 'blue']) {
      for (const fighter of cast[side]) {
        heights[side].push(fighter.heightCm);
        weights[side].push(buildBody(fighter).bodyMassKg);
      }
    }
  }
  const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
  assert.ok(mean(heights.red) - mean(heights.blue) > 6, `${mean(heights.red).toFixed(1)} v ${mean(heights.blue).toFixed(1)} cm`);
  assert.ok(mean(weights.red) > mean(weights.blue) + 5, `${mean(weights.red).toFixed(1)} v ${mean(weights.blue).toFixed(1)} kg`);
});

test('a Ming garrison man who loses his weapon fights with his hands; a brigandine man draws his dao, or his spare', async () => {
  const { PRESETS } = await import('../src/body.js');
  const { advance, createWorld, dropWeapon } = await import('../src/physics.js');
  for (const [key, drawn] of [['mingDao', undefined], ['mingSpear', undefined], ['swordShield', 'dagger'], ['mingMatchlock', 'dao']]) {
    const world = createWorld([{ inputs: structuredClone(PRESETS[key]), corner: 'red' }, { inputs: structuredClone(PRESETS.samurai), corner: 'blue' }], { seed: 1 });
    advance(world, 0.3);
    dropWeapon(world, world.fighters[0], 'disarmed', [0, 1, 1]);
    assert.equal(world.fighters[0].weapon?.kind, drawn, key);
  }
});

test('Ming brigandine men may wear lamellar and elites scale, with the same protection', () => {
  const kinds = (outfit) => new Set(OUTFITS[outfit].designs.map((design) => design.armor.kind));
  assert.deepEqual([...kinds('mingBrigandine')].sort(), ['mingBrigandine', 'mingLamellar']);
  assert.deepEqual([...kinds('mingElite')].sort(), ['mingElite', 'mingScale']);
});
