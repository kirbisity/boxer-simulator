import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, placeFighter, throwPunch } from '../src/physics.js';
import { FACTION_KEYS, factionOf, OUTFIT_KEYS, OUTFITS } from '../src/outfits.js';
import { ADAMS, bulletProof, CROSSBOW, GUN, MATCHLOCK, NU } from '../src/weapons.js';

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
  for (const kind of OUTFIT_KEYS) assert.equal(bulletProof(OUTFITS[kind].bulletRating, GUN.energy), 1, kind);
  const proof = (kind) => bulletProof(OUTFITS[kind].bulletRating, MATCHLOCK.energy);
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

test('a crossbow looses one bolt, a short heavy one that flies and drops like an arrow; then it is spanned again, the European slower than the nu', () => {
  for (const [preset, spec] of [[PRESETS.crossbow, CROSSBOW], [PRESETS.hanCrossbow, NU]]) {
    const world = range(preset, target(), { apart: 10 });
    const shooter = world.fighters[0];
    assert.ok(shooter.weapon.loaded);
    assert.ok(throwPunch(world, shooter, 'fireLong', 'body'));
    advance(world, 2);
    const bolt = world.arrows.find((arrow) => arrow.bolt);
    assert.ok(bolt, `${preset.name} loosed a bolt`);
    assert.equal(bolt.energy, spec.energy);
    assert.ok(bolt.length < 0.5, 'a bolt, not an arrow');
    assert.ok(!world.events.some((event) => event.kind === 'shot'), 'no bullet');
    assert.equal(shooter.weapon.loaded, false);
    assert.equal(throwPunch(world, shooter, 'fireLong', 'body'), false, 'spanned again first');
    advance(world, spec.reloadSeconds - 1);
    assert.equal(shooter.weapon.loaded, false, 'still spanning');
    advance(world, 1.5);
    assert.equal(shooter.weapon.loaded, true);
  }
  assert.ok(CROSSBOW.reloadSeconds > NU.reloadSeconds && CROSSBOW.energy > NU.energy);
});

test('the Adams revolver fires five, double action, then is empty until its chambers are loaded again', () => {
  // At a man in plate (it turns a ~280 J ball), so he is still there to be shot at.
  const world = range(PRESETS.revolver, target({ kind: 'knight', design: 0 }), { apart: 12 });
  const shooter = world.fighters[0];
  let pulls = 0;
  for (let attempt = 0; attempt < 40 && shooter.weapon.loaded; attempt += 1) {
    if (throwPunch(world, shooter, 'shoot', 'body')) pulls += 1;
    advance(world, 0.7);
  }
  assert.equal(pulls, ADAMS.rounds, 'five pulls of the trigger');
  assert.equal(shooter.weapon.loaded, false);
  assert.equal(throwPunch(world, shooter, 'shoot', 'body'), false, 'nothing left');
  advance(world, ADAMS.reloadSeconds + 1);
  assert.equal(shooter.weapon.loaded, true, 'reloaded');
  assert.equal(shooter.weapon.charges, ADAMS.rounds);
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

test('characters fall into eleven factions, by what they wear: knights, Japanese, Chinese, Mexica, steppe, Ottomans, gladiators and Rome among them', () => {
  assert.equal(FACTION_KEYS.length, 11);
  assert.deepEqual(['legionary', 'centurion'].map((key) => factionOf(PRESETS[key])), ['romans', 'romans']);
  assert.deepEqual(['hanCrossbow', 'mingCrossbow', 'wuxia', 'guanYu'].map((key) => factionOf(PRESETS[key])), ['chinese', 'chinese', 'chinese', 'chinese']);
  assert.deepEqual(['macuahuitl', 'tepoztopilli'].map((key) => factionOf(PRESETS[key])), ['mexica', 'mexica']);
  assert.deepEqual(['hidalgo', 'rodelero'].map((key) => factionOf(PRESETS[key])), ['knights', 'knights']);
  assert.deepEqual(['staff', 'taichi'].map((key) => factionOf(PRESETS[key])), ['chinese', 'chinese']);
  assert.deepEqual(['mingSpear', 'mingDao', 'swordShield', 'mingMatchlock', 'guandao'].map((key) => factionOf(PRESETS[key])), ['chinese', 'chinese', 'chinese', 'chinese', 'chinese']);
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
