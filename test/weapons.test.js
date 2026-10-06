import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { gearTraits } from '../src/outfits.js';
import { STYLES, STYLE_KEYS } from '../src/moves.js';
import { SEVER_PARTS, advance, boutWinner, capsules, collapseAt, createWorld, dropWeapon, perform, placeFighter, throwPunch, WORLD } from '../src/physics.js';
import { AI, thinkAll } from '../src/ai.js';
import { WEAPONS, harmMix } from '../src/weapons.js';
import { strikeAt } from '../tools/weapon-strikes.js';
import { fighterFor } from '../tools/weapons.js';
import { spacing } from '../tools/spacing.js';
import { measureStyle } from '../tools/aggression.js';

const wearing = (kind) => gearTraits({ ...PRESETS.contender, outfit: { kind, design: 0 } });

test('armour stops each kind of harm by its own share, and adds its weight', () => {
  // A ballistic vest guards the torso against rounds, and little against a blade; the limbs hardly at all.
  assert.deepEqual(wearing('swat').protection, { blunt: 0.5, cut: 0.5, pierce: 0.3, bullet: { head: 0.6, torso: 0.9, limb: 0.1 }, regions: { head: { blunt: 0.7, cut: 0.8, pierce: 0.7 }, limb: { blunt: 0.6, cut: 0.3, pierce: 0.1 } } });
  assert.ok(wearing('specialForces').protection.bullet.torso > wearing('swat').protection.bullet.torso);
  assert.ok(wearing('specialForces').protection.cut < wearing('knight').protection.cut && wearing('specialForces').protection.regions.limb.cut < 0.2);
  assert.deepEqual(wearing('knight').protection, { blunt: 0.6, cut: 1, pierce: 0.9, bullet: { head: 0.4, torso: 0.7, limb: 0.3 } });
  assert.deepEqual(wearing('samurai').protection, { blunt: 0.7, cut: 0.9, pierce: 0.6, bullet: { head: 0.3, torso: 0.4, limb: 0 } });
  assert.deepEqual(wearing('hoplomachus').protection, { blunt: 0.4, cut: 0.4, pierce: 0.2, bullet: { head: 0.3, torso: 0, limb: 0.1 } });
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

test('a weapon shaken loose in a fall: he fights mixed; a hoplomachus draws his gladius', () => {
  const world = createWorld([{ ...PRESETS.contender, style: 'baton' }, { ...PRESETS.contender, style: 'hoplomachus' }]);
  const [police, gladiator] = world.fighters;
  const chance = WORLD.weapons.dropOnFall;
  WORLD.weapons.dropOnFall = 1;
  for (const fighter of world.fighters) fighter.knock = [9, 0, 0];
  advance(world, 1 / 60);
  WORLD.weapons.dropOnFall = chance;
  assert.equal(police.weapon, null);
  assert.ok(world.debris.some((piece) => piece.kind === 'weapon' && piece.weapon === 'baton'));
  // Nobody picks anything up here: this is about what he falls back on.
  const pickup = AI.pickup.enabled;
  AI.pickup.enabled = false;
  advance(world, 9);
  AI.pickup.enabled = pickup;
  assert.equal(police.mixed, 'mix');
  assert.ok(['boxing', 'kickboxing', 'muayThai', 'sumo'].includes(police.style), police.style);
  assert.equal(gladiator.weapon?.kind, 'gladius');
  assert.equal(gladiator.style, 'gladius');
  assert.ok(gladiator.shield, 'the shield stays on his arm');
});

test('a shield takes strikes at the body, and a sweeping cut stops on it', () => {
  // Over a few seeds: an edge can now and then find the arm at the rim.
  for (const move of ['kesagiri', 'yokogiri', 'tsuki']) {
    let onShield = 0;
    for (let seed = 1; seed <= 4; seed += 1) {
      const { events } = strikeAt('katana', move, 'body', 1.5, { defenderStyle: 'hoplomachus', seed });
      const mine = events.filter((event) => event.attacker === 0 && (event.kind === 'landed' || event.kind === 'blocked'));
      if (mine[0]?.target !== 'shield') continue;
      onShield += 1;
      assert.equal(mine.length, 1, `${move}: nothing behind the shield`);
      assert.ok(!events.some((event) => event.kind === 'severed'), move);
    }
    // Cuts are met on it; a straight thrust from a blade held well forward now and then slips past the rim.
    assert.ok(onShield >= (move === 'tsuki' ? 2 : 3), `${move}: ${onShield} of 4 on the shield`);
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

test('a sword holds its range against fists, attacks often, and fends punches off with the blade', () => {
  let gap = 0;
  let samples = 0;
  let fended = 0;
  let attacks = 0;
  let minutes = 0;
  // Twelve bouts: a sword ends most of them in seconds, so a fended punch is a rare event.
  for (let seed = 1200; seed < 1212; seed += 1) {
    const world = createWorld([fighterFor('contender:longsword'), fighterFor('contender:street')], { seed });
    let elapsed = 0;
    while (elapsed < 60 && !boutWinner(world)) {
      advance(world, 0.1, (current, dt) => thinkAll(current, dt));
      elapsed += 0.1;
      const [a, b] = world.fighters;
      if (a.state === 'up' && b.state === 'up') {
        gap += Math.hypot(a.x[24] - b.x[24], a.x[26] - b.x[26]);
        samples += 1;
      }
    }
    fended += world.events.filter((event) => event.kind === 'bladeBlock' && event.effects.includes('fended off')).length;
    attacks += world.fighters[0].stats.thrown;
    minutes += elapsed / 60;
  }
  assert.ok(gap / samples > 0.85, `kept ${(gap / samples).toFixed(2)} m off`);
  assert.ok(attacks / minutes > 25, `${(attacks / minutes).toFixed(0)} attacks a minute`);
  assert.ok(fended > 0, 'punches met on the blade');
});

test('a punch into a held blade is stopped there, and the edge cuts the hand', () => {
  const world = createWorld([{ ...PRESETS.contender, style: 'street' }, { ...PRESETS.contender, style: 'katana' }], { seed: 2 });
  const [puncher, swordsman] = world.fighters;
  placeFighter(puncher, -0.45, 0);
  placeFighter(swordsman, 0.45, 0);
  advance(world, 0.5);
  // The blade held straight across the line of the cross, at the height of the punch.
  swordsman.defence = { name: 'weaponBlock', t: 0, seconds: 5, side: 1, from: puncher.id };
  let stopped = null;
  for (let tries = 0; tries < 6 && !stopped; tries += 1) {
    throwPunch(world, puncher, 'cross', 'head');
    swordsman.defence = { name: 'weaponBlock', t: 0, seconds: 5, side: 1, from: puncher.id };
    advance(world, 0.6);
    stopped = world.events.find((event) => event.kind === 'bladeBlock' && event.effects.includes('fended off'));
  }
  assert.ok(stopped, 'the cross met the blade');
  assert.ok(stopped.cut > 0, 'and the edge cut');
  assert.ok(!world.events.some((event) => event.kind === 'landed' && event.attacker === puncher.id && event.target === 'head'), 'nothing reached the head');
});

test('an unskilled fighter swings one at a time, barely defends, and misses more', () => {
  const pair = ['contender', 'contender'];
  const unskilled = measureStyle('unskilled', 3, 40, pair);
  const boxer = measureStyle('boxing', 3, 40, pair);
  assert.equal(unskilled.comboShare, 0);
  assert.ok(unskilled.defencesPerMinute < boxer.defencesPerMinute * 0.25, `${unskilled.defencesPerMinute.toFixed(1)} vs ${boxer.defencesPerMinute.toFixed(1)} defences a minute`);
  assert.ok(unskilled.headEvaded > boxer.headEvaded, 'wild swings miss more');
});

test('a fighter who loses his weapon fights mixed, and anyone can pick a loose weapon up', () => {
  const pickups = [];
  for (let seed = 1600; seed < 1606; seed += 1) {
    const world = createWorld([{ ...PRESETS.contender, style: 'katana' }, { ...PRESETS.light, style: 'boxing' }], { seed });
    const [swordsman] = world.fighters;
    placeFighter(swordsman, -1.2, 0);
    placeFighter(world.fighters[1], 1.2, 0);
    advance(world, 0.3);
    dropWeapon(world, swordsman, 'disarmed', [0, 1.2, (seed % 2 ? 1 : -1) * 2.2]);
    assert.equal(swordsman.mixed, 'mix', 'unarmed, he fights mixed');
    for (let second = 0; second < 25 && !boutWinner(world) && !world.events.some((event) => event.kind === 'pickup'); second += 0.25) advance(world, 0.25, (current, dt) => thinkAll(current, dt));
    const pickup = world.events.find((event) => event.kind === 'pickup');
    if (!pickup) continue;
    pickups.push(pickup.fighter);
    assert.equal(world.fighters[pickup.fighter].weapon?.kind, 'katana');
    assert.ok(world.debris.find((piece) => piece.kind === 'weapon').taken);
  }
  assert.ok(pickups.length >= 2, `${pickups.length} pickups in 6`);
});

test('weapon holders keep their arms forward: elbows seldom fall behind the shoulder', async () => {
  const { armFolding } = await import('../tools/arms.js');
  for (const style of ['longsword', 'warhammer', 'naginata', 'spear']) {
    const row = armFolding(style, 1, 25);
    // Before the arms were held forward: 24–65% (the spear worst).
    assert.ok(row.elbowBack < 0.25, `${style}: elbow behind the shoulder ${(row.elbowBack * 100).toFixed(0)}% of the time`);
  }
});

test('a war hammer blow on plate staggers the knight: he reels, weaker, rather than falls', async () => {
  const { applyHeadDamage, armoured, chinNow, staggerShare } = await import('../src/physics.js');
  let staggered = 0;
  for (const distance of [1.6, 1.8, 2.0]) {
    const { world } = strikeAt('warhammer', 'hammerSide', 'body', distance, { outfit: 'knight' });
    const knight = world.fighters[1];
    assert.ok(armoured(knight));
    if (knight.stagger > 0) {
      staggered += 1;
      assert.equal(knight.state, 'up', 'reeling, not down');
      assert.ok(knight.stagger <= WORLD.stagger.maxSeconds);
      assert.ok(staggerShare(knight, WORLD.stagger.harm) < 1, 'his own blows are weaker');
    }
  }
  assert.ok(staggered >= 1, 'a hammer blow staggers');
  // A blow that would drop a man staggers one in armour; another while he reels drops him.
  const world = createWorld([{ ...PRESETS.contender, style: 'warhammer' }, { ...PRESETS.contender, style: 'katana', outfit: { kind: 'knight', design: 0 } }]);
  const knight = world.fighters[1];
  const blow = () => ({ attacker: 0, defender: 1, effects: [], harmDeltaV: chinNow(knight) * 1.2 });
  applyHeadDamage(world, knight, blow());
  assert.equal(knight.state, 'up');
  assert.ok(knight.stagger > WORLD.stagger.minSeconds);
  applyHeadDamage(world, knight, blow());
  assert.equal(knight.state, 'down');
  // Unarmoured, the same blow drops him at once.
  const boxer = createWorld([{ ...PRESETS.contender }, { ...PRESETS.contender }]).fighters[1];
  applyHeadDamage(world, boxer, { ...blow(), harmDeltaV: chinNow(boxer) * 1.2 });
  assert.equal(boxer.state, 'down');
  assert.equal(boxer.stagger, 0);
});
