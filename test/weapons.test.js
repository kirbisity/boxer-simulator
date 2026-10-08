import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
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

test('armour stops each kind of harm by its own share, and adds its weight', async () => {
  // A ballistic vest guards the torso against rounds, and little against a blade; the limbs hardly at all.
  assert.deepEqual(wearing('swat').protection, { blunt: 0.5, cut: 0.5, pierce: 0.3, bullet: { head: 0.6, torso: 0.9, limb: 0.1 }, regions: { head: { blunt: 0.7, cut: 0.8, pierce: 0.7 }, limb: { blunt: 0.6, cut: 0.3, pierce: 0.1 } } });
  assert.ok(wearing('specialForces').protection.bullet.torso > wearing('swat').protection.bullet.torso);
  assert.ok(wearing('specialForces').protection.cut < wearing('knight').protection.cut && wearing('specialForces').protection.regions.limb.cut < 0.2);
  assert.deepEqual(wearing('knight').protection, { blunt: 0.6, cut: 1, pierce: 0.9, bullet: { head: 0.4, torso: 0.7, limb: 0.3 } });
  assert.deepEqual(wearing('samurai').protection, { blunt: 0.7, cut: 0.9, pierce: 0.6, bullet: { head: 0.3, torso: 0.4, limb: 0 } });
  // A gladiator: the chest bare, the helmet, the arm and the legs covered, each its own way.
  const { protectionAt } = await import('../src/physics.js');
  const hoplomachus = wearing('hoplomachus');
  assert.equal(protectionAt(hoplomachus, 'trunk').cut, 0);
  assert.ok(protectionAt(hoplomachus, 'head').cut > 0.9 && protectionAt(hoplomachus, 'head').deflects);
  assert.ok(protectionAt(hoplomachus, 'lShank').deflects && !protectionAt(hoplomachus, 'lThigh').deflects);
  assert.ok(protectionAt(hoplomachus, 'rForearm').cut > 0.4 && protectionAt(hoplomachus, 'lForearm').cut === 0, 'the spear arm quilted, the shield arm bare');
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

test('the arena: six kinds, each with its own kit; a shaped shield covers by its true shape', async () => {
  const { protectionAt, shieldDisc, createWorld: make } = await import('../src/physics.js');
  const { SHIELDS, shieldClosest, NET } = await import('../src/weapons.js');
  for (const kind of ['thraex', 'hoplomachus', 'murmillo', 'retiarius', 'scissor', 'secutor']) assert.ok(PRESETS[kind] && STYLES[PRESETS[kind].style], kind);
  // The retiarius bare-headed, the secutor's smooth helmet turning blades, the scissor in scale.
  const gear = (kind) => createWorld([{ ...PRESETS[kind] }, { ...PRESETS.contender }]).fighters[0].body.gear;
  assert.equal(protectionAt(gear('retiarius'), 'head').cut, 0);
  assert.ok(protectionAt(gear('secutor'), 'head').deflects);
  assert.ok(protectionAt(gear('scissor'), 'trunk').cut > 0.8 && protectionAt(gear('scissor'), 'lThigh').cut === 0);
  // The scutum: tall and curved; a point beside the middle at shin height is on it, one past its edge is not.
  const world = make([{ ...PRESETS.murmillo }, { ...PRESETS.contender }]);
  const shield = shieldDisc(world.fighters[0]);
  assert.equal(shield.spec, SHIELDS.scutum);
  const below = shieldClosest([shield.centre[0], shield.centre[1] - 0.45, shield.centre[2]].map((v, i) => v + shield.normal[i] * 0.05), shield);
  assert.ok(Math.abs(below[1] - (shield.centre[1] - 0.45)) < 0.02, 'reaches down the leg');
  const above = shieldClosest([shield.centre[0], shield.centre[1] + 0.8, shield.centre[2]], shield);
  assert.ok(above[1] < shield.centre[1] + 0.48, 'stops at its top edge');
  assert.ok(NET.radius > 0.5);
});

test('the retiarius throws his net; a man in it can neither strike nor guard until he is free', async () => {
  const { castNet } = await import('../src/physics/net.js');
  const world = createWorld([{ inputs: structuredClone(PRESETS.retiarius), corner: 'red' }, { inputs: structuredClone(PRESETS.secutor), corner: 'blue' }], { seed: 2, distance: 2.2 });
  const [retiarius, secutor] = world.fighters;
  advance(world, 0.3);
  assert.ok(retiarius.net?.held);
  assert.ok(castNet(world, retiarius, secutor));
  assert.equal(retiarius.style, 'tridentTwo', 'both hands on the trident now');
  for (let t = 0; t < 1.5 && !secutor.netted; t += 1 / 60) advance(world, 1 / 60);
  assert.ok(secutor.netted, 'caught');
  assert.equal(throwPunch(world, secutor, 'gladiusThrust'), false, 'no blows in the net');
  for (let t = 0; t < 40 && secutor.netted; t += 0.1) advance(world, 0.1);
  assert.ok(!secutor.netted, 'worked free in the end');
});

test('a shield dropped falls as a plate of its own weight and lies flat; its man takes it up again', async () => {
  const { dropShield } = await import('../src/physics.js');
  const { SHIELDS } = await import('../src/weapons.js');
  const world = createWorld([{ inputs: structuredClone(PRESETS.murmillo), corner: 'red' }, { inputs: { ...structuredClone(PRESETS.contender), style: 'passive' }, corner: 'blue' }], { seed: 5, arena: { halfX: 6.5, halfZ: 4.4 } });
  const murmillo = world.fighters[0];
  const before = [...murmillo.body.masses];
  advance(world, 0.3);
  dropShield(world, murmillo, 'dropped', [0, 0, 1]);
  assert.equal(murmillo.shield, null);
  const lighter = murmillo.body.masses.reduce((sum, mass) => sum + mass, 0);
  assert.ok(Math.abs(before.reduce((sum, mass) => sum + mass, 0) - lighter - SHIELDS.scutum.mass) < 1e-6, 'its weight off the arm');
  const shield = world.debris.find((debris) => debris.kind === 'shield');
  for (let t = 0; t < 3 && !shield.resting; t += 0.05) advance(world, 0.05);
  assert.ok(shield.resting, 'it comes to rest');
  assert.ok(shield.x[1] < 0.05, 'lying flat on the floor');
  // He goes back for it (the other man keeping off: he runs from anyone near).
  world.fighters[1].style = 'passive';
  placeFighter(world.fighters[1], 5, 3);
  for (let t = 0; t < 12 && !murmillo.shield; t += 0.1) advance(world, 0.1, (current, dt) => thinkAll(current, dt));
  assert.ok(murmillo.shield, 'taken up again');
});

test('a shield bash lands with the shield and the body behind it: a shove that moves a man bodily', () => {
  const world = createWorld([{ inputs: structuredClone(PRESETS.secutor), corner: 'red' }, { inputs: structuredClone(PRESETS.contender), corner: 'blue' }], { seed: 4, distance: 1.0 });
  const [secutor, other] = world.fighters;
  advance(world, 0.3);
  let landed = null;
  for (let attempt = 0; attempt < 30 && !landed; attempt += 1) {
    throwPunch(world, secutor, 'shieldBash', 'body');
    advance(world, 0.6);
    landed = world.events.find((event) => event.punch === 'shieldBash' && (event.kind === 'landed' || event.kind === 'blocked'));
  }
  assert.ok(landed, 'the bash met him');
  assert.ok(landed.impulse > 10, `impulse ${landed.impulse?.toFixed(1)} N·s`);
  assert.equal(other.state === 'out', false);
});

test('weapon first: a man who has lost both takes up his weapon before his shield, and the shield only with nobody near', async () => {
  const { dropShield } = await import('../src/physics.js');
  const world = createWorld([{ inputs: structuredClone(PRESETS.murmillo), corner: 'red' }, { inputs: { ...structuredClone(PRESETS.contender), style: 'passive' }, corner: 'blue' }], { seed: 6, arena: { halfX: 6.5, halfZ: 4.4 } });
  const murmillo = world.fighters[0];
  placeFighter(world.fighters[1], 5, 3);
  advance(world, 0.3);
  // The shield dropped to one side, the gladius to the other, a step each.
  dropShield(world, murmillo, 'dropped', [0, 0, 1.2]);
  dropWeapon(world, murmillo, 'disarmed', [0, 0, -1.2]);
  murmillo.sidearmDrawn = true;
  if (murmillo.weapon?.held) dropWeapon(world, murmillo, 'disarmed', [0.5, 0, -1]);
  const order = [];
  for (let t = 0; t < 20 && order.length < 2; t += 0.1) {
    advance(world, 0.1, (current, dt) => thinkAll(current, dt));
    if (murmillo.weapon?.held && !order.includes('weapon')) order.push('weapon');
    if (murmillo.shield && !order.includes('shield')) order.push('shield');
  }
  assert.equal(order[0], 'weapon', `took up ${order.join(' then ')}`);
});

test('the whip: its thong a rope whose tip outruns the hand; a lash bleeds bare skin and may put a man on his knees, from which he gets up; plate turns it', async () => {
  const { WARRIORS } = await import('../src/roster.js');
  const { WHIP } = await import('../src/weapons.js');
  const by = Object.fromEntries(WARRIORS.map((warrior) => [warrior.key, warrior.inputs]));
  const bout = (opponent, seed) => {
    const world = createWorld([{ inputs: structuredClone(by.lorarius), corner: 'red' }, { inputs: structuredClone(by[opponent]), corner: 'blue' }], { seed });
    let tipFastest = 0;
    let handFastest = 0;
    let knelt = false;
    let rose = false;
    for (let step = 0; step < 60 * 40; step += 1) {
      advance(world, 1 / 60, (current, dt) => thinkAll(current, dt));
      const lorarius = world.fighters[0];
      const rope = lorarius.weapon?.rope;
      if (rope) {
        const n = (rope.count - 1) * 3;
        tipFastest = Math.max(tipFastest, Math.hypot(rope.x[n] - rope.prev[n], rope.x[n + 1] - rope.prev[n + 1], rope.x[n + 2] - rope.prev[n + 2]) / (1 / 60 / 8));
        handFastest = Math.max(handFastest, Math.hypot(...[0, 1, 2].map((axis) => lorarius.v[P.rHand * 3 + axis])));
      }
      if (world.fighters[1].pain) knelt = true;
      if (knelt && !world.fighters[1].pain && world.fighters[1].state === 'up') rose = true;
    }
    const lashes = world.events.filter((event) => event.weapon === 'whip' && event.kind === 'landed');
    return { world, tipFastest, handFastest, knelt, rose, lashes };
  };
  const bare = [1, 2, 3, 4].map((seed) => bout('shaolin', seed));
  assert.ok(bare.every((run) => run.tipFastest > 3 * run.handFastest), 'the tip far outruns the hand');
  assert.ok(bare.some((run) => run.lashes.some((event) => event.cut > WHIP.painFrom)), 'lashes through bare skin');
  assert.ok(bare.some((run) => run.knelt), 'a hard lash put him on his knees');
  assert.ok(bare.filter((run) => run.knelt).every((run) => run.rose), 'and he got up again');
  const onPlate = [1, 2, 3, 4].flatMap((seed) => bout('plate', seed).lashes);
  assert.ok(onPlate.length > 0 && onPlate.every((event) => event.effects.some((effect) => effect.includes('turned'))), `plate turns every lash (${onPlate.length})`);
});

test('plate is cut-proof: no edge finds a gap in a full harness; a point still can', () => {
  const gapsBy = { swing: 0, thrust: 0 };
  for (let seed = 1; seed <= 4; seed += 1) {
    const world = createWorld([{ inputs: structuredClone(PRESETS.samurai), corner: 'red' }, { inputs: structuredClone(PRESETS.knight), corner: 'blue' }], { seed });
    for (let second = 0; second < 60 && !boutWinner(world); second += 1) advance(world, 1, (current, dt) => thinkAll(current, dt));
    for (const event of world.events) {
      if (event.defender !== 1 || !event.effects?.includes('into a gap in the armour')) continue;
      gapsBy[event.mode === 'thrust' ? 'thrust' : 'swing'] += 1;
    }
  }
  assert.equal(gapsBy.swing, 0, 'no cut into the knight\'s plate');
  assert.ok(gapsBy.thrust > 0, `thrusts found gaps (${gapsBy.thrust})`);
});
