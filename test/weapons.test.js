import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { gearTraits } from '../src/outfits.js';
import { STYLES, STYLE_KEYS } from '../src/moves.js';
import { SEVER_PARTS, advance, boutWinner, capsules, collapseAt, createWorld, perform } from '../src/physics.js';
import { thinkAll } from '../src/ai.js';
import { WEAPONS, harmMix } from '../src/weapons.js';
import { strikeAt } from '../tools/weapon-strikes.js';
import { fighterFor } from '../tools/weapons.js';
import { spacing } from '../tools/spacing.js';

const wearing = (kind) => gearTraits({ ...PRESETS.contender, outfit: { kind, design: 0 } });

test('armour stops each kind of harm by its own share, and adds its weight', () => {
  assert.deepEqual(wearing('swat').protection, { blunt: 0.8, cut: 0.6, pierce: 0.4 });
  assert.deepEqual(wearing('knight').protection, { blunt: 0.6, cut: 1, pierce: 0.9 });
  assert.deepEqual(wearing('samurai').protection, { blunt: 0.7, cut: 0.9, pierce: 0.8 });
  assert.deepEqual(wearing('hoplomachus').protection, { blunt: 0.4, cut: 0.4, pierce: 0.2 });
  assert.equal(wearing('knight').extraMass, 0.5);
  assert.equal(wearing('samurai').extraMass, 0.4);
  assert.equal(wearing('hoplomachus').extraMass, 0.3);
  assert.equal(wearing('knight').deflects, true);
  assert.equal(wearing('samurai').deflects, false);
});

test('an edge across cuts, a point driven in pierces; the katana cuts more and stabs less than the long sword', () => {
  const swing = harmMix(WEAPONS.longsword, 'swing', 0.1, 0.6);
  assert.ok(swing.cut > 0.9 && swing.blunt === 0.5 && swing.pierce === 0);
  const thrust = harmMix(WEAPONS.longsword, 'thrust', 0.98, 1);
  assert.ok(thrust.pierce > 0.9 && thrust.cut < 0.05 && thrust.blunt === 0.15);
  // Point not first (the flat of a thrust): no piercing.
  assert.equal(harmMix(WEAPONS.longsword, 'thrust', 0.2, 0.5).pierce, 0);
  assert.ok(harmMix(WEAPONS.katana, 'swing', 0.1, 0.6).cut > swing.cut);
  assert.ok(harmMix(WEAPONS.katana, 'thrust', 0.98, 1).pierce < thrust.pierce);
  assert.ok(harmMix(WEAPONS.knife, 'thrust', 0.98, 1).pierce > 0.4);
  assert.equal(harmMix(WEAPONS.baton, 'swing', 0.1, 0.6).cut, 0);
});

test('every weapon style carries its weapon and can reach with its moves', () => {
  for (const key of ['baton', 'longsword', 'katana', 'knife', 'hoplomachus']) {
    assert.ok(STYLE_KEYS.includes(key), key);
    const world = createWorld([{ ...PRESETS.contender, style: key }, { ...PRESETS.contender, style: 'boxing' }]);
    assert.equal(world.fighters[0].weapon?.held, true, key);
    assert.equal(world.fighters[0].weapon.kind, STYLES[key].weapon);
  }
  assert.ok(!STYLE_KEYS.includes('gladius'), 'the drawn gladius is not a style to pick');
});

test('a full katana cut at a joint takes the part off; the fight is over for him', () => {
  const { events, world } = strikeAt('katana', 'kesagiri', 'body', 1.5);
  const severed = events.find((event) => event.kind === 'severed');
  assert.ok(severed, 'severed');
  assert.equal(world.fighters[1].state, 'out');
  assert.ok(world.debris.some((piece) => piece.kind === 'piece'), 'the part lies loose');
  const gone = SEVER_PARTS[severed.joint].capsules.map((key) => `${severed.side}${key}`);
  assert.ok(!capsules(world.fighters[1]).some((capsule) => gone.includes(capsule.key)), 'a cut-off part cannot be struck');
  assert.ok(world.fighters[1].bleed > 0);
});

test('plate turns the same cut aside: the push lands, the edge does not', () => {
  const { hit, events, world } = strikeAt('katana', 'kesagiri', 'body', 1.5, { outfit: 'knight' });
  assert.ok(hit, 'it lands');
  assert.equal(hit.cut, 0);
  assert.ok(hit.transferred > 0, 'the impact still pushes');
  assert.ok(events.some((event) => event.kind === 'glance'));
  assert.ok(!events.some((event) => event.kind === 'severed'));
  assert.notEqual(world.fighters[1].state, 'out');
});

test('a thrust driven point-first into the chest kills; plate stops it', () => {
  const bare = strikeAt('katana', 'tsuki', 'body', 1.5);
  assert.ok(bare.hit.along > 0.9, 'point first');
  assert.ok(bare.events.some((event) => event.kind === 'killed'));
  const plated = strikeAt('katana', 'tsuki', 'body', 1.5, { outfit: 'knight' });
  assert.ok(plated.hit && plated.hit.pierce < 15);
  assert.ok(!plated.events.some((event) => event.kind === 'killed'));
});

test('a baton strike does blunt harm only, and hits harder than a jab', () => {
  const baton = strikeAt('baton', 'forehand', 'body', 1.2).hit;
  const jab = strikeAt('boxing', 'jab', 'body', 1.0).hit;
  assert.ok(baton && jab);
  assert.equal(baton.cut, 0);
  assert.equal(baton.pierce, 0);
  assert.ok(baton.impulse > jab.impulse, `${baton.impulse} vs ${jab.impulse}`);
  // Hard wood over a brief contact, not a padded glove: far more peak force.
  assert.ok(baton.force > jab.force * 1.8, `${baton.force} vs ${jab.force}`);
});

test('knocked down, a fighter drops his weapon and boxes; a hoplomachus draws his gladius', () => {
  const world = createWorld([{ ...PRESETS.contender, style: 'baton' }, { ...PRESETS.contender, style: 'hoplomachus' }]);
  const [police, gladiator] = world.fighters;
  for (const fighter of world.fighters) {
    fighter.knock = [9, 0, 0];
  }
  advance(world, 1 / 60);
  assert.equal(police.weapon, null);
  assert.equal(police.style, 'boxing');
  assert.ok(world.debris.some((piece) => piece.kind === 'weapon' && piece.weapon === 'baton'));
  advance(world, 9);
  assert.equal(gladiator.weapon?.kind, 'gladius');
  assert.equal(gladiator.style, 'gladius');
  assert.ok(gladiator.shield, 'the shield stays on his arm');
});

test('a shield takes strikes at the body, and a sweeping cut stops on it', () => {
  for (const move of ['kesagiri', 'yokogiri', 'tsuki']) {
    const { events } = strikeAt('katana', move, 'body', 1.5, { defenderStyle: 'hoplomachus' });
    const mine = events.filter((event) => event.attacker === 0 && (event.kind === 'landed' || event.kind === 'blocked'));
    assert.equal(mine[0]?.target, 'shield', move);
    assert.equal(mine.length, 1, `${move}: nothing behind the shield`);
    assert.ok(!events.some((event) => event.kind === 'severed'), move);
  }
});

test('knife wounds bleed; enough of them and a man collapses', () => {
  // Through lamellar: a wound, not a kill.
  const { hit, world } = strikeAt('knife', 'stab', 'body', 1.2, { outfit: 'samurai' });
  assert.ok(hit.pierce > 0, 'the stab went in');
  const victim = world.fighters[1];
  assert.ok(victim.bleed > 0, 'and it bleeds');
  const before = victim.bloodLost;
  advance(world, 2);
  assert.ok(victim.bloodLost > before, 'blood keeps going');
  // Enough bleeding, and he goes down for good.
  victim.bleed = 0.05;
  advance(world, 20);
  assert.ok(victim.bloodLost >= collapseAt(), `blood lost ${victim.bloodLost}`);
  assert.equal(victim.state, 'out');
  assert.ok(world.events.some((event) => event.kind === 'bledOut' && event.fighter === victim.id));
});

test('facing a longer reach or a blade, a fighter holds off and surges; even fighters do not', () => {
  const outside = spacing('contender:boxing', 'contender:longsword', 2, 40);
  assert.ok(outside[0].surgesPerMinute > 4, `surges ${outside[0].surgesPerMinute}`);
  assert.ok(outside[0].inside < 0.7, `inside ${outside[0].inside}`);
  assert.equal(outside[1].surgesPerMinute, 0, 'the sword does not surge at the fists');
  const even = spacing('contender:boxing', 'contender:boxing', 1, 30);
  assert.equal(even[0].surgesPerMinute + even[1].surgesPerMinute, 0);
});

test('a weapon block meets the incoming blade', () => {
  const world = createWorld([{ ...PRESETS.contender, style: 'katana' }, { ...PRESETS.contender, style: 'katana' }]);
  assert.ok(perform(world, world.fighters[1], 'weaponBlock'));
});
