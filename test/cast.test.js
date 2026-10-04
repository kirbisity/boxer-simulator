import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { STYLE_KEYS } from '../src/moves.js';
import { randomCharacter, varyCharacter } from '../src/cast.js';
import { seededRandom } from '../src/physics.js';
import { headgearOptions } from '../src/outfits.js';

test('every style has a character, dressed for it; the knight and samurai wear their plume and crest', () => {
  for (const style of STYLE_KEYS) assert.ok(Object.values(PRESETS).some((preset) => preset.style === style), style);
  assert.deepEqual(PRESETS.knight.accessories, ['plume']);
  assert.deepEqual(PRESETS.samurai.accessories, ['crest']);
  for (const preset of Object.values(PRESETS)) {
    for (const item of preset.accessories ?? []) assert.ok(headgearOptions(preset.outfit?.kind ?? 'boxing').includes(item), `${preset.name}: ${item}`);
  }
});

test('a team-mate is the lead again, a little different, his armour in another design', () => {
  const random = seededRandom(5);
  const lead = PRESETS.samurai;
  const mates = Array.from({ length: 12 }, () => varyCharacter(lead, random));
  for (const mate of mates) {
    assert.equal(mate.style, lead.style);
    assert.equal(mate.outfit.kind, lead.outfit.kind);
    // The same armour, in any of its designs: designs shuffle in the game.
    assert.ok(mate.outfit.design >= 0 && mate.outfit.design < 5);
    assert.deepEqual(mate.accessories, lead.accessories);
    assert.ok(Math.abs(mate.heightCm - lead.heightCm) <= 20);
  }
  assert.ok(new Set(mates.map((mate) => mate.sex)).size === 2, 'some are the other sex');
  assert.ok(new Set(mates.map((mate) => mate.heightCm)).size > 3, 'builds differ');
  assert.ok(new Set(mates.map((mate) => mate.outfit.design)).size > 2, 'designs shuffle');
});

test('the dice make anyone at all', () => {
  const random = seededRandom(9);
  const styles = new Set(Array.from({ length: 30 }, () => randomCharacter(random).style));
  assert.ok(styles.size >= 6, `styles: ${[...styles]}`);
});

test('a prize fight pairs boxers in gloves, within a weight class', async () => {
  const { randomBoxer, weightOf } = await import('../src/cast.js');
  const { STYLES } = await import('../src/moves.js');
  let seed = 11;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let round = 0; round < 6; round += 1) {
    const player = randomBoxer(random);
    const opponent = randomBoxer(random, { weightKg: weightOf(player) });
    for (const fighter of [player, opponent]) {
      assert.equal(fighter.outfit.kind, 'boxing');
      assert.ok(!STYLES[fighter.style].weapon, `${fighter.style} is unarmed`);
    }
    assert.ok(Math.abs(weightOf(player) - weightOf(opponent)) < 5, `${weightOf(player)} v ${weightOf(opponent)}`);
  }
});

test('the rebellion: two lords and three foot soldiers against twenty simply drawn rebels with spears', async () => {
  const { SCENARIOS } = await import('../src/scenarios.js');
  const cast = SCENARIOS.rebellion.cast(Math.random);
  assert.equal(cast.red.length, 5);
  assert.equal(cast.blue.length, 20);
  // Two lords in full plate, three foot soldiers each with his own weapon.
  const lords = cast.red.filter((fighter) => fighter.outfit.kind === 'knight');
  assert.equal(lords.length, 2);
  assert.ok(lords.every((lord) => /^(Sir|Lord) /.test(lord.name)), 'named for their rank');
  const soldiers = cast.red.filter((fighter) => fighter.outfit.kind === 'footman');
  assert.equal(soldiers.length, 3);
  assert.equal(new Set(soldiers.map((soldier) => soldier.style)).size, 3, 'different weapons');
  assert.ok(cast.blue.every((fighter) => fighter.style === 'spear' && fighter.simple));
  assert.ok(new Set(cast.blue.map((fighter) => fighter.heightCm)).size > 5, 'rebels differ in build');
});

test('Pier 9: four SWAT (two pistols, two batons) against six yakuza (four knives, a katana, a pistol)', async () => {
  const { SCENARIOS } = await import('../src/scenarios.js');
  const cast = SCENARIOS.port.cast(seededRandom(4));
  const styles = (side) => side.map((fighter) => fighter.style).sort();
  assert.deepEqual(styles(cast.red), ['baton', 'baton', 'handgun', 'handgun']);
  assert.deepEqual(styles(cast.blue), ['handgun', 'katana', 'knife', 'knife', 'knife', 'knife']);
  assert.ok(cast.red.every((fighter) => fighter.outfit.kind === 'swat'));
  assert.ok(cast.blue.every((fighter) => fighter.outfit.kind === 'yakuza'));
});

test('the rebellion opens with the knights in a tight line and the rebels a loose crowd, well apart', async () => {
  const { SCENARIOS } = await import('../src/scenarios.js');
  const { createWorld } = await import('../src/physics.js');
  const level = SCENARIOS.rebellion;
  const cast = level.cast(seededRandom(2));
  const world = createWorld([...cast.red.map((inputs) => ({ inputs, corner: 'red' })), ...cast.blue.map((inputs) => ({ inputs, corner: 'blue' }))], { seed: 2, arena: level.arena, formation: level.formation });
  const knights = world.fighters.filter((fighter) => fighter.corner === 'red');
  const rebels = world.fighters.filter((fighter) => fighter.corner === 'blue');
  assert.ok(knights.every((fighter) => Math.abs(fighter.root[0] - knights[0].root[0]) < 0.01), 'one straight line');
  const gaps = knights.map((fighter) => fighter.root[1]).sort((a, b) => a - b).slice(1).map((z, index, list) => z - (index ? list[index - 1] : knights.map((f) => f.root[1]).sort((a, b) => a - b)[0]));
  assert.ok(gaps.every((gap) => gap < 1), `shoulder to shoulder: ${gaps.map((gap) => gap.toFixed(2))}`);
  assert.ok(Math.min(...rebels.map((fighter) => fighter.root[0])) - knights[0].root[0] > 8, 'well apart');
  assert.ok(new Set(rebels.map((fighter) => fighter.root[0].toFixed(1))).size > 6, 'not in ranks');
});
