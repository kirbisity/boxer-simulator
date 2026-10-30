// The damage model: each part's health (its injury against what it takes) decides; bleeding is slow and second.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { advance, bodyHarm, collapseAt, createWorld, partHealth, placeFighter, wound, WORLD } from '../src/physics.js';
import { BLADES, bleedToLose } from '../src/weapons.js';
import { strikeAt } from '../tools/weapon-strikes.js';

/** Two men standing apart, nobody fighting: the first is the one hurt. */
function pair(style = 'katana') {
  const world = createWorld([{ ...PRESETS.contender, style }, { ...PRESETS.contender, style: 'katana' }], { seed: 2 });
  placeFighter(world.fighters[0], -2, 0);
  placeFighter(world.fighters[1], 2, 0);
  advance(world, 0.3);
  return { world, man: world.fighters[0], foe: world.fighters[1] };
}

test('a single deep cut to a limb does not kill him within 30 s, nor does an opened artery', () => {
  const { world, man, foe } = pair();
  assert.ok(wound(man, 'cut', 150, 'lForearm', foe) > 0, 'a deep cut bleeds');
  advance(world, 30);
  assert.notEqual(man.state, 'out');
  assert.ok(man.bloodLost < 0.5 * collapseAt(), `lost ${man.bloodLost / collapseAt()} of what collapses him`);
  // The femoral artery: a minute and more, not seconds.
  const second = pair();
  second.man.bleed = bleedToLose(collapseAt(), BLADES.bleed.artery.seconds);
  advance(second.world, 60);
  assert.notEqual(second.man.state, 'out', 'still up at a minute');
  advance(second.world, BLADES.bleed.artery.seconds - 60 + 2);
  assert.equal(second.man.state, 'out', 'down from it by the artery\'s time');
});

test('a graze bleeds nothing; armour that stops the edge stops the bleeding', () => {
  const { man, foe } = pair();
  assert.equal(wound(man, 'cut', BLADES.bleed.from.cut - 1, 'trunk', foe), 0);
  assert.equal(wound(man, 'pierce', BLADES.bleed.from.pierce - 1, 'trunk', foe), 0);
  assert.ok(!(man.bleed > 0));
  const plated = strikeAt('katana', 'kesagiri', 'body', 1.5, { outfit: 'knight' });
  assert.ok(!(plated.world.fighters[1].bleed > 0), 'a cut on plate does not bleed');
});

test('a spear thrust into the chest takes the chest\'s health, which the health bar shows; it is not a bleed', () => {
  // A light one, at the end of his reach: a visible share, no bleeding.
  const light = strikeAt('spear', 'spearThrust', 'body', 2.0);
  const struck = light.world.fighters[1];
  assert.equal(light.hit.target, 'trunk');
  assert.ok(light.hit.pierce > 5);
  assert.ok(partHealth(struck, 'trunk') < 0.95, `chest ${partHealth(struck, 'trunk')}`);
  assert.ok(bodyHarm(struck) > 0.05, 'the health bar drops');
  assert.ok(!(struck.bleed > 0));
  // A full one, through the heart: the chest's health is gone, and he dies of it, not of the blood.
  const full = strikeAt('spear', 'spearThrust', 'body', 2.4);
  assert.ok(full.hit.pierce > 60);
  assert.equal(partHealth(full.world.fighters[1], 'trunk'), 0);
  assert.ok(full.events.some((event) => event.kind === 'killed' && event.effects.includes('died of his injuries')));
});

test('the head or the chest at zero, and he is dead', () => {
  for (const [key, mark] of [['trunk', WORLD.injury.trunkFatal], ['head', WORLD.injury.headFatal]]) {
    const { world, man } = pair();
    man.trauma = { [key]: mark * 0.9 };
    advance(world, 0.2);
    assert.notEqual(man.state, 'out', `${key} nearly gone: alive`);
    assert.ok(bodyHarm(man) > 0.85, 'and the health bar near empty');
    man.trauma[key] = mark;
    advance(world, 0.2);
    assert.equal(man.state, 'out');
    assert.equal(partHealth(man, key), 0);
    assert.equal(bodyHarm(man), 1);
    assert.ok(world.events.some((event) => event.kind === 'killed' && event.fighter === man.id));
  }
});

test('a leg at zero puts him down but he lives; an arm at zero drops the weapon', () => {
  const { world, man } = pair();
  man.trauma = { lThigh: WORLD.injury.limbBreak };
  advance(world, 0.2);
  assert.ok(man.broken.has('lHip'));
  assert.equal(man.state, 'down');
  assert.equal(partHealth(man, 'lThigh'), 0);
  assert.ok(bodyHarm(man) < 0.2, `a leg is not his life: harm ${bodyHarm(man)}`);
  advance(world, 5);
  assert.notEqual(man.state, 'out');
  assert.ok(!world.events.some((event) => event.kind === 'killed'));
  const armed = pair();
  const main = armed.man.weapon.main;
  armed.man.trauma = { [`${main}Forearm`]: WORLD.injury.limbBreak };
  advance(armed.world, 0.2);
  assert.ok(armed.man.broken.has(`${main}Elbow`));
  assert.ok(!armed.man.weapon?.held, 'the sword is dropped');
  assert.notEqual(armed.man.state, 'out');
});
