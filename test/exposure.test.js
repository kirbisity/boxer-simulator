// A man opens his own gaps as he strikes (BLADES.gaps.exposure, physics/gaps.js gapExposure, hungOff): the arm raised for a
// blow from above opens the armpit most, a blow from the side less; the ō-yoroi's sode, hung beside the arm, are left by it,
// so the raised arm is near bare. What is under a gap is still the kit's own (a harness's voiders), and mail opens none.
// And a weapon stroke that meets nothing carries him on (WORLD.miss): committed the longer the heavier it swings.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { advance, createWorld, protectionAt, throwPunch } from '../src/physics.js';
import { WORLD } from '../src/physics/config.js';
import { armRaised, gapExposure, gapsOf, gapUnder, hungOff } from '../src/physics/gaps.js';
import { BLADES } from '../src/weapons.js';

/** A man of `preset` (in `outfit`, if given) with his foe far off, standing a moment. */
function standing(preset, outfit) {
  const man = { ...structuredClone(PRESETS[preset]), ...(outfit ? { outfit, accessories: [] } : {}) };
  const world = createWorld([man, { ...structuredClone(PRESETS.contender) }], { seed: 2 });
  advance(world, 0.5, () => {});
  return { world, man: world.fighters[0] };
}

/** The same man at the height of stroke `move`: advanced to where his higher arm is raised most. Returns that raise. */
function atPeak(preset, move, outfit) {
  const { world, man } = standing(preset, outfit);
  throwPunch(world, man, move);
  let best = { raised: -1 };
  for (let step = 0; step < 90 && (step < 3 || man.punch); step += 1) {
    advance(world, 1 / 60, () => {});
    const raised = armRaised(man, 'r');
    if (raised > best.raised) best = { raised, snapshot: { l: armRaised(man, 'l'), share: hungOff(man, 'rUpperArm')?.share ?? 0, armpit: gapExposure(man, 'rUpperArm', 'armpit', null) } };
  }
  return { raised: best.raised, ...best.snapshot };
}

test('the arm hangs at rest and opens nothing; raised for a blow from above it opens the armpit most, from the side less', () => {
  const { man } = standing('samurai');
  assert.ok(armRaised(man, 'l') < 0.1 && armRaised(man, 'r') < 0.1, 'at rest');
  const above = atPeak('samurai', 'shomen');
  const side = atPeak('samurai', 'yokogiri');
  assert.ok(above.raised > 0.85, `from above: ${above.raised}`);
  assert.ok(side.raised < 0.65 && side.raised < above.raised - 0.3, `from the side: ${side.raised}`);
  assert.ok(above.armpit > 0.75, `the armpit met: ${above.armpit}`);
  assert.equal(gapExposure(man, 'rUpperArm', 'groin', null), 0, 'the groin is not opened by the arm');
});

test('the ō-yoroi\'s sode are left by the raised arm: struck from above, the arm is near bare', () => {
  const oyoroi = { kind: 'oyoroi', design: 0 };
  const { man } = standing('samurai', oyoroi);
  const sode = protectionAt(man.body.gear, 'rUpperArm');
  const robe = gapsOf(man.body.gear).hung.rUpperArm;
  assert.ok((hungOff(man, 'rUpperArm')?.share ?? 1) < 0.1, 'standing, the sode hang over the arm');
  assert.ok(robe.cut < sode.cut / 4 && robe.pierce < sode.pierce / 3, 'under them the robe');
  const above = atPeak('samurai', 'shomen', oyoroi);
  assert.ok(above.share > 0.85, `raised: ${above.share} of blows meet the robe`);
  // A kit that hangs nothing beside the arm keeps its sleeve as it rises.
  assert.equal(hungOff(standing('knight').man, 'rUpperArm'), null);
});

test('what is under an opened gap is still the kit\'s: a harness\'s voider; mail and cloth open none', () => {
  const knight = standing('knight').man;
  const covered = protectionAt(knight.body.gear, 'trunk');
  assert.equal(gapUnder(knight.body.gear, 'armpit', covered).pierce, BLADES.gaps.layers.mail.pierce);
  // A mail shirt rises with the arm: raised for a blow from above, it opens no gap (`opens`).
  for (const outfit of [{ kind: 'footman', design: 2 }, { kind: 'romanAuxiliary', design: 0 }]) {
    const mail = standing('knight', outfit).man;
    assert.equal(gapsOf(mail.body.gear).opens, false, outfit.kind);
    assert.equal(gapExposure(mail, 'rUpperArm', 'armpit', null), 0, outfit.kind);
  }
});

test('a stroke that meets nothing carries him on: a kanabō\'s miss commits him about three times a katana\'s; he cannot strike till it is over', () => {
  const missed = (preset, move) => {
    const { world, man } = standing(preset);
    throwPunch(world, man, move);
    for (let step = 0; step < 120 && man.punch; step += 1) advance(world, 1 / 60, () => {});
    return { world, man, committed: man.committed ?? 0 };
  };
  const katana = missed('samurai', 'shomen');
  const kanabo = missed('kanabo', 'hammerOverhead');
  assert.ok(Math.abs(katana.committed - WORLD.miss.seconds) < 0.05, `katana: ${katana.committed}`);
  assert.ok(kanabo.committed > 2.8 * katana.committed && kanabo.committed < 0.7, `kanabō: ${kanabo.committed}`);
  assert.equal(throwPunch(kanabo.world, kanabo.man, 'hammerSide'), false, 'no new stroke while committed');
});
