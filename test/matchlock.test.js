import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, placeFighter, throwPunch } from '../src/physics.js';
import { FACTION_KEYS, factionOf, OUTFIT_KEYS } from '../src/outfits.js';
import { bulletProof, GUN, MATCHLOCK } from '../src/weapons.js';

const ARQUEBUSIER = { ...PRESETS.contender, name: 'Hans Brenner', sex: 'male', style: 'matchlock', outfit: { kind: 'footman', design: 1 }, accessories: [] };
const target = (outfit = null) => normaliseInputs({ ...structuredClone(PRESETS.contender), sex: 'male', heightCm: 176, style: 'unskilled', outfit, accessories: [] });

/** A gunner and a man standing `apart` m off, nobody thinking; `between`: a comrade of the gunner's half way. */
function range(gunner, victim, { apart = 6, between = false, seed = 1 } = {}) {
  const entries = [{ inputs: structuredClone(gunner), corner: 'red' }, { inputs: victim, corner: 'blue' }];
  if (between) entries.push({ inputs: target(), corner: 'red' });
  const world = createWorld(entries, { seed, arena: { halfX: 12, halfZ: 6 } });
  placeFighter(world.fighters[0], -apart / 2, 0);
  placeFighter(world.fighters[1], apart / 2, 0);
  if (between) placeFighter(world.fighters[2], 0, 0);
  advance(world, 0.5);
  return world;
}

test('against a pistol round every armour stops what it always did; against a matchlock ball, proofed armour more than the rest', () => {
  for (const kind of OUTFIT_KEYS) assert.equal(bulletProof(kind, GUN.energy), 1, kind);
  const proof = (kind) => bulletProof(kind, MATCHLOCK.energy);
  assert.ok(proof('swat') >= proof('samuraiTosei') && proof('samuraiTosei') > proof('knight') && proof('knight') > proof('ashigaru'));
  assert.ok(MATCHLOCK.energy > GUN.energy && proof('ashigaru') < 1, 'a heavier ball goes through what stops a pistol round');
});

test('a matchlock fires once, then is empty: the shoot button loads it, in its reload time, standing', () => {
  const world = range(PRESETS.matchlock, target(), { apart: 12 });
  const gunner = world.fighters[0];
  assert.ok(gunner.weapon.loaded);
  assert.ok(throwPunch(world, gunner, 'fireLong', 'body'));
  advance(world, 2);
  assert.ok(world.events.some((event) => event.kind === 'shot' || event.kind === 'misfire'), 'the trigger was pulled');
  assert.equal(gunner.weapon.loaded, false);
  assert.equal(throwPunch(world, gunner, 'fireLong', 'body'), false, 'no second shot');
  assert.equal(gunner.reloading, true, 'the button starts the reload');
  advance(world, MATCHLOCK.reloadSeconds - 1);
  assert.equal(gunner.weapon.loaded, false, 'still loading');
  advance(world, 1.5);
  assert.equal(gunner.weapon.loaded, true);
  assert.ok(world.events.some((event) => event.kind === 'reloaded'));
});

test('a ball in the body drops an unarmoured man; proofed plate takes it and he stays up', () => {
  const torsoHit = (outfit) => {
    for (let seed = 1; seed < 40; seed += 1) {
      const world = range(PRESETS.matchlock, target(outfit), { seed });
      throwPunch(world, world.fighters[0], 'fireLong', 'body');
      advance(world, 2.5);
      const shot = world.events.find((event) => event.kind === 'shot');
      if (shot?.region === 'torso') return { shot, victim: world.fighters[1] };
    }
    return null;
  };
  const bare = torsoHit(null);
  assert.ok(bare, 'a torso hit happened');
  assert.notEqual(bare.victim.state, 'up');
  const plate = torsoHit({ kind: 'knight', design: 0 });
  assert.ok(plate, 'a torso hit on plate happened');
  // Plate stops less of a ball than of a pistol round: more gets through than its pistol protection would let.
  assert.ok(plate.shot.harm < 1 && plate.shot.harm > 0.55, `plate: harm ${plate.shot.harm.toFixed(2)}`);
  assert.equal(plate.victim.state, 'up');
});

test('a gunner holds his shot while a comrade is on the line, and keeps the charge', () => {
  const world = range(PRESETS.matchlock, target(), { apart: 8, between: true });
  throwPunch(world, world.fighters[0], 'fireLong', 'body');
  advance(world, 2);
  assert.equal(world.events.filter((event) => event.kind === 'shot').length, 0);
  assert.equal(world.fighters[0].weapon.loaded, true);
});

test('empty, with a man on him, the gunner draws his own sidearm: a wakizashi for the ashigaru, a short sword for the arquebusier', () => {
  for (const [gunner, sidearm] of [[PRESETS.matchlock, 'wakizashi'], [ARQUEBUSIER, 'shortSword']]) {
    let drawn = null;
    for (let seed = 1; seed < 6 && !drawn; seed += 1) {
      const world = createWorld([{ inputs: structuredClone(gunner), corner: 'red' }, { inputs: structuredClone(PRESETS.street), corner: 'blue' }], { seed, arena: { halfX: 6.5, halfZ: 4.4 } });
      for (let time = 0; time < 20 && !drawn; time += 0.1) {
        advance(world, 0.1, (current, dt) => thinkAll(current, dt));
        drawn = world.events.find((event) => event.kind === 'drew' && event.fighter === 0)?.weapon ?? null;
      }
    }
    assert.equal(drawn, sidearm, gunner.name);
  }
});

test('characters fall into at most six factions, by what they wear: knights, Japanese and gladiators among them', () => {
  assert.ok(FACTION_KEYS.length <= 6);
  const of = (key) => factionOf(PRESETS[key]);
  assert.deepEqual(['knight', 'warhammer', 'spear', 'unskilled'].map(of), ['knights', 'knights', 'knights', 'knights']);
  assert.deepEqual(['samurai', 'naginata', 'bow', 'matchlock'].map(of), ['japanese', 'japanese', 'japanese', 'japanese']);
  assert.equal(of('hoplomachus'), 'gladiators');
  assert.deepEqual(['heavy', 'sumo', 'clinchBrawl'].map(of), ['ring', 'ring', 'ring']);
  assert.deepEqual(['handgun', 'baton'].map(of), ['law', 'law']);
  assert.deepEqual(['street', 'knife', 'passive'].map(of), ['street', 'street', 'street']);
  assert.equal(factionOf(ARQUEBUSIER), 'knights', 'the arquebusier is a European foot soldier');
  for (const preset of Object.values(PRESETS)) assert.ok(FACTION_KEYS.includes(factionOf(preset)), preset.name);
});
