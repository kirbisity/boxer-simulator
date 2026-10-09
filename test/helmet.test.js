import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, PRESETS } from '../src/body.js';
import { HELMETS } from '../src/outfits.js';
import { advance, applyHeadDamage, chinNow, createWorld, dazedShare, WORLD } from '../src/physics.js';

test('a helmet is part of the head a blow must move: its mass on the head; a bare head unchanged', () => {
  const helmeted = buildBody(PRESETS.knight);
  const bare = buildBody({ ...structuredClone(PRESETS.knight), outfit: { kind: 'boxing', design: 0 } });
  assert.ok(helmeted.gear.helmet.mass > 2, 'the knight wears a helmet of some kilos');
  assert.ok(Math.abs(helmeted.headEffectiveMass - bare.headEffectiveMass - helmeted.gear.helmet.mass) < 1e-9);
  assert.equal(bare.gear.helmet.mass, 0);
  for (const [kind, helmet] of Object.entries(HELMETS)) assert.ok(helmet.padding >= 0 && helmet.padding <= 1 && helmet.curve >= 0 && helmet.curve <= 1 && helmet.mass >= 0, kind);
});

test('a hard blow to the head short of dropping him leaves anyone dazed for a while; it wears off', () => {
  const world = createWorld([{ inputs: structuredClone(PRESETS.heavy), corner: 'red' }, { inputs: structuredClone(PRESETS.light), corner: 'blue' }]);
  const man = world.fighters[1];
  const chin = chinNow(man);
  applyHeadDamage(world, man, { effects: [], headDeltaV: chin * (WORLD.daze.from + 0.2) });
  assert.equal(man.state, 'up', 'not dropped');
  assert.ok(man.dazed > WORLD.daze.minSeconds - 1e-9 && dazedShare(man) === 1, 'dazed');
  assert.ok(world.events.some((event) => event.kind === 'dazed'));
  advance(world, WORLD.daze.maxSeconds + 0.5, null);
  assert.equal(dazedShare(man), 0, 'it wears off');
  // A light touch dazes nobody.
  applyHeadDamage(world, man, { effects: [], headDeltaV: chin * (WORLD.daze.from - 0.2) });
  assert.equal(dazedShare(man), 0);
});
