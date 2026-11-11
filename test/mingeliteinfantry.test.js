import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs, P, PRESETS } from '../src/body.js';
import { OUTFITS } from '../src/outfits.js';
import { WEAPONS } from '../src/weapons.js';
import { advance, createWorld, placeFighter, protectionAt, swapSidearm } from '../src/physics.js';
import { BRUSH, brushScreens, sweepShare } from '../src/physics/brush.js';

const qiMan = (style) => normaliseInputs({ ...structuredClone(PRESETS.langxian), style, outfit: { kind: 'mingEliteInfantry', design: 0 } });

test("Qi's elite infantry: the regular's plates over trunk, skirt and both arms, a solid steel tube on the front (left) forearm only", () => {
  const world = createWorld([{ inputs: qiMan('matchlock'), corner: 'blue' }], { seed: 1 });
  const gear = world.fighters[0].body.gear;
  const vest = OUTFITS.mingBrigandine.protection;
  for (const part of ['torso', 'rForearm', 'lUpperArm', 'rUpperArm', 'lThigh']) {
    const guard = protectionAt(gear, part);
    assert.equal(guard.cut, vest.cut, part);
    assert.equal(guard.deflects, false, `${part}: plates in cloth, a point bites`);
  }
  const tube = protectionAt(gear, 'lForearm');
  assert.ok(tube.cut > vest.cut && tube.pierce > vest.pierce && tube.deflects, 'the steel tube turns an edge and a point');
  assert.ok(protectionAt(gear, 'head').deflects, 'the riveted hat');
  assert.ok(OUTFITS.mingEliteInfantry.skill > OUTFITS.mingElite.skill && OUTFITS.mingEliteInfantry.courage > OUTFITS.mingElite.courage);
});

test('the changdao: a long two-handed Qi sabre between the dao and the ōdachi, drawn by a gunner as his sidearm', () => {
  const { dao, odachi, changdao } = WEAPONS;
  assert.equal(changdao.hands, 'two');
  assert.ok(changdao.length > dao.length && changdao.length < odachi.length);
  assert.ok(changdao.mass > dao.mass && changdao.mass < odachi.mass);
  const world = createWorld([{ inputs: qiMan('matchlock'), corner: 'blue' }], { seed: 1 });
  advance(world, 0.2);
  const gunner = world.fighters[0];
  assert.ok(swapSidearm(world, gunner), 'slings the gun');
  assert.equal(gunner.weapon.kind, 'changdao');
  assert.ok(gunner.weapon.held);
});

test('the wolf-brush catches a sweeping cut far more often than a straight thrust', () => {
  const blade = { dir: [1, 0, 0] };
  const sweep = sweepShare(blade, [0, 0, 6], [0, 0, 0]);
  const thrust = sweepShare(blade, [6, 0, 0], [0, 0, 0]);
  assert.equal(sweep, 1);
  assert.equal(thrust, BRUSH.straight);
  assert.ok(BRUSH.catches * thrust < BRUSH.catches * sweep / 4);
});

test("an enemy's brush between a man's eyes and the man striking at him screens the blow; off the line, it does not", () => {
  const world = createWorld([{ inputs: qiMan('langxian'), corner: 'red' }, { inputs: qiMan('spear'), corner: 'red' }, { inputs: qiMan('dao'), corner: 'blue' }], { seed: 1 });
  advance(world, 0.3);
  const [bearer, striker, viewer] = world.fighters;
  placeFighter(viewer, 3, 0);
  placeFighter(striker, -1, 0.3);
  // The brush laid across the line between them, its hand 2 m to one side, its branches crossing at head height.
  const lay = (z) => {
    const hand = P[`${bearer.weapon.main}Hand`];
    const y = viewer.x[P.head * 3 + 1];
    bearer.x.set([1, y, z - 2], hand * 3);
    bearer.weapon.dir = [0, 0, 1];
    bearer.weapon.tip = [1, y, z - 2 + bearer.weapon.spec.length];
  };
  lay(0);
  assert.ok(brushScreens(world, viewer, striker), 'screened');
  lay(8);
  assert.ok(!brushScreens(world, viewer, striker), 'clear');
  assert.ok(!brushScreens(world, striker, viewer), 'his own side\'s brush does not screen him');
});
