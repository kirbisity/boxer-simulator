import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { MOVES, STYLES } from '../src/moves.js';
import { advance, bladeFor, breakJoint, createWorld, dropOffWeapon, dropWeapon, perform, placeFighter, strokeOf, throwPunch } from '../src/physics.js';
import { WEAPONS } from '../src/weapons.js';

// Two swords (nitō): Musashi with the katana in his right hand alone and the wakizashi in his left.
const musashi = () => ({ ...PRESETS.ronin });
const facing = (red, blue, apart, seed = 1) => {
  const world = createWorld([red, blue], { seed });
  placeFighter(world.fighters[0], -apart / 2, 0);
  placeFighter(world.fighters[1], apart / 2, 0);
  return world;
};
const handMass = (fighter, side) => fighter.body.masses[P[`${side}Hand`]];

test('two swords: the katana in one hand, the wakizashi held in the other as a weapon of its own', () => {
  assert.equal(PRESETS.ronin.style, 'nito');
  const bare = createWorld([{ ...musashi(), style: 'mix' }, { ...PRESETS.contender }]).fighters[0];
  const fighter = createWorld([musashi(), { ...PRESETS.contender }]).fighters[0];
  assert.equal(fighter.style, 'nito');
  assert.equal(fighter.weapon.kind, 'katana');
  assert.equal(fighter.weapon.main, 'r');
  assert.equal(fighter.weapon.spec.hands, 'one', 'the katana held in one hand');
  assert.equal(fighter.weapon.twoHanded, false);
  assert.equal(WEAPONS.katana.hands, 'two', 'the katana itself is unchanged');
  assert.equal(fighter.offWeapon.kind, 'wakizashi');
  assert.equal(fighter.offWeapon.main, 'l');
  assert.equal(fighter.offWeapon.held, true);
  assert.ok(fighter.sidearmDrawn, 'his sidearm is in his hand: none left to draw');
  // Each hand carries its own blade's weight.
  assert.ok(Math.abs(handMass(fighter, 'r') - handMass(bare, 'r') - WEAPONS.katana.mass) < 1e-9);
  assert.ok(Math.abs(handMass(fighter, 'l') - handMass(bare, 'l') - WEAPONS.wakizashi.mass) < 1e-9);
  // A move is made with the blade in its hand.
  assert.equal(bladeFor(fighter, MOVES.wakiTsuki), fighter.offWeapon);
  assert.equal(bladeFor(fighter, MOVES.kataKesa), fighter.weapon);
  // The one-handed katana cuts with the arm alone; the two-handed with the body behind it too.
  assert.equal(MOVES.kataKesa.grip, 'one');
  assert.equal(MOVES.kataKesa.mass.body, undefined);
  assert.ok(MOVES.kesagiri.mass.body > 0);
  // Each blade turns on its own: after a moment in guard they point their own ways.
  const world = createWorld([musashi(), { ...PRESETS.contender }]);
  advance(world, 0.5);
  const [him] = world.fighters;
  assert.ok(Math.acos(Math.min(1, Math.abs(him.weapon.dir.reduce((sum, value, axis) => sum + value * him.offWeapon.dir[axis], 0)))) > 0.2);
});

test('a wakizashi stroke is the wakizashi\'s: its contact scored with the short blade, the katana not striking', () => {
  const world = facing(musashi(), { ...PRESETS.contender, style: 'boxing' }, 1.25);
  const [him] = world.fighters;
  assert.ok(throwPunch(world, him, 'wakiTsuki', 'body'));
  assert.equal(strokeOf(him, him.offWeapon), him.punch);
  assert.equal(strokeOf(him, him.weapon), null);
  advance(world, 0.6);
  const hits = world.events.filter((event) => (event.kind === 'landed' || event.kind === 'blocked') && event.attacker === him.id);
  assert.ok(hits.length > 0, 'the thrust lands');
  for (const hit of hits) {
    assert.equal(hit.weapon, 'wakizashi');
    assert.equal(hit.off, true);
  }
});

test('both blades at once: the second hand\'s stroke has its own time and aim, and either may land', () => {
  const world = facing(musashi(), { ...PRESETS.contender, style: 'boxing' }, 1.3);
  const [him] = world.fighters;
  assert.ok(throwPunch(world, him, 'jodanGedan', 'head'));
  assert.equal(him.punch.with.type, 'wakiLow');
  assert.equal(him.punch.with.zone, 'legs');
  assert.equal(strokeOf(him, him.offWeapon), him.punch.with);
  advance(world, 0.7);
  const hits = world.events.filter((event) => (event.kind === 'landed' || event.kind === 'blocked') && event.attacker === him.id);
  assert.ok(hits.length > 0);
  for (const hit of hits) assert.equal(hit.weapon, hit.punch === 'wakiLow' ? 'wakizashi' : 'katana');
});

test('one blade meets his while the other cuts: a parry with the wakizashi, the katana on its way in', () => {
  // The samurai cuts; Musashi blocks (the wakizashi, the blade not striking) and cuts with the katana at once.
  let parried = null;
  for (const [move, seed] of [['tsuki', 1], ['kesagiri', 1], ['tsuki', 2], ['shomen', 1], ['kesagiri', 3]]) {
    const world = facing(musashi(), { ...PRESETS.samurai }, 1.9, seed);
    const [him, samurai] = world.fighters;
    assert.ok(throwPunch(world, samurai, move, MOVES[move].zones[0]));
    advance(world, 0.12);
    perform(world, him, 'weaponBlock', { from: samurai.id });
    assert.ok(throwPunch(world, him, 'kataKesa', 'body', { riposte: true }));
    advance(world, 0.5);
    parried = world.events.find((event) => event.kind === 'parry' && event.fighter === him.id && event.off);
    if (parried) break;
  }
  assert.ok(parried, 'the wakizashi parries');
  assert.equal(parried.weapon, 'wakizashi');
  assert.equal(parried.answering, true, 'his katana was on its way in as it did');
});

test('losing a blade: the wakizashi lost, the katana in both hands; the katana lost, the wakizashi in the sword hand', () => {
  {
    const world = createWorld([musashi(), { ...PRESETS.contender }]);
    const [him] = world.fighters;
    const left = handMass(him, 'l');
    dropOffWeapon(world, him, 'disarmed', [0, 1, 1]);
    assert.equal(him.offWeapon, null);
    assert.ok(world.debris.some((piece) => piece.kind === 'weapon' && piece.weapon === 'wakizashi'));
    assert.ok(world.events.some((event) => event.kind === 'disarmed' && event.off));
    assert.equal(him.style, STYLES.nito.single);
    assert.equal(him.weapon.kind, 'katana');
    assert.equal(him.weapon.spec.hands, 'two');
    // The wakizashi's weight gone from the left hand, the katana's shared again (0.4 of it there).
    assert.ok(Math.abs(handMass(him, 'l') - (left - WEAPONS.wakizashi.mass + 0.4 * WEAPONS.katana.mass)) < 1e-9);
  }
  {
    const world = createWorld([musashi(), { ...PRESETS.contender }]);
    const [him] = world.fighters;
    dropWeapon(world, him, 'disarmed');
    assert.equal(him.offWeapon, null);
    assert.equal(him.weapon.kind, 'wakizashi');
    assert.equal(him.weapon.main, 'r');
    assert.equal(world.debris.filter((piece) => piece.kind === 'weapon').length, 1, 'only the katana falls');
  }
  {
    // The arm that holds it broken: the wakizashi goes.
    const world = createWorld([musashi(), { ...PRESETS.contender }]);
    const [him] = world.fighters;
    breakJoint(world, him, 'lElbow');
    assert.equal(him.offWeapon, null);
    assert.equal(him.weapon.kind, 'katana');
  }
});

test('a rōnin swordsman fights with two swords now and then; other characters keep their one weapon', async () => {
  const { roninWarrior } = await import('../src/cast.js');
  const { seededRandom } = await import('../src/physics.js');
  const random = seededRandom(11);
  const styles = Array.from({ length: 60 }, () => roninWarrior(random).style);
  const two = styles.filter((style) => style === 'nito').length;
  assert.ok(two > 8 && two < 35, `${two} of 60`);
  assert.ok(styles.every((style) => style === 'nito' || style === 'ronin'));
  for (const key of ['samurai', 'wuxia', 'maximus', 'templar']) assert.equal(createWorld([{ ...PRESETS[key] }, { ...PRESETS.contender }]).fighters[0].offWeapon ?? null, null, key);
});
