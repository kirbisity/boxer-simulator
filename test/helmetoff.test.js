import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, P, PRESETS } from '../src/body.js';
import { gearTraits, helmetNameOf } from '../src/outfits.js';
import { advance, createWorld, helmetSlip, placeFighter, protectionAt, reachOf, throwPunch, WORLD } from '../src/physics.js';
import { measureHelm } from '../tools/helmet-off.js';

const holdOf = (kind, design = 0) => gearTraits({ outfit: { kind, design } }).helmetHold;

test('a helmet is held on by what it is: open, half-enclosed, enclosed; nothing that cannot come off', () => {
  // Open: the kettle hat, the Ming iron hat, the jingasa, the conquistadors' morion, cabasset and pot.
  for (const [kind, design] of [['footman', 0], ['mingBrigandine', 0], ['ashigaru', 0], ['conquistadorPlate', 0], ['conquistadorPlate', 2], ['conquistadorPlate', 3]]) assert.equal(holdOf(kind, design), 'open', `${kind} ${design}`);
  // Half: the kabuto, the Ming elite helm, the foot soldier's sallet, the Cuman's masked helm (a mask ties an open helm on).
  for (const [kind, design] of [['samurai', 0], ['mingElite', 0], ['footman', 1], ['cumanHeavy', 0], ['mingElite', 2]]) assert.equal(holdOf(kind, design), 'half', `${kind} ${design}`);
  // Enclosed: the knights' helms, the great helm, SWAT's.
  for (const [kind, design] of [['knight', 0], ['knight', 1], ['knight', 3], ['templar', 0], ['swat', 0]]) assert.equal(holdOf(kind, design), 'enclosed', `${kind} ${design}`);
  // Nothing: bare, a cloth cap, a helm bolted to the cuirass, a machine's head.
  for (const [kind, design] of [['boxing', 0], ['thug', 0], ['tournament', 0], ['humanoid', 0]]) assert.equal(holdOf(kind, design), null, `${kind} ${design}`);
  assert.equal(gearTraits({ outfit: { kind: 'footman', design: 0, bareHead: true } }).helmetHold, null);
  assert.equal(helmetNameOf({ outfit: { kind: 'footman', design: 0 } }), 'Kettle hat');
});

test('the slip: the head\'s speed change on the helmet\'s mass, more on the rim than on the crown; the dial scales every hold', () => {
  const world = createWorld([{ ...PRESETS.heavy, style: 'boxing' }, { ...PRESETS.contender, style: 'passive', outfit: { kind: 'footman', design: 0 } }], { seed: 1 });
  const man = world.fighters[1];
  const head = [man.x[P.head * 3], man.x[P.head * 3 + 1], man.x[P.head * 3 + 2]];
  const r = man.body.lengths.headRadius;
  const at = (h) => ({ headDeltaV: 3, point: [head[0] + r * Math.sqrt(1 - h * h), head[1] + r * h, head[2]], normal: [1, 0, 0] });
  const rim = helmetSlip(man, at(WORLD.helmetOff.catch.rimAt));
  const crown = helmetSlip(man, at(0.95));
  assert.ok(rim.energy > 2 * crown.energy, 'a blow catching the rim slips it more than one on the crown');
  assert.ok(Math.abs(helmetSlip(man, { ...at(0.95), headDeltaV: 6 }).energy - 4 * crown.energy) < 1e-9, 'energy goes as the speed change squared');
  const ease = WORLD.helmetOff.ease;
  try {
    WORLD.helmetOff.ease = 2;
    assert.ok(Math.abs(helmetSlip(man, at(0.3)).joules - rim.joules / 2) < 1e-9);
    WORLD.helmetOff.ease = 0;
    assert.equal(helmetSlip(man, at(0.3)).joules, Infinity, 'ease 0: never');
  } finally {
    WORLD.helmetOff.ease = ease;
  }
});

// Every heavy head blow of the calibration (tools/helmet-off.js: big punches, kicks, knees, elbows, heavy weapons, from
// several attackers on a man fresh or worn down), over seeds: of those that knock him out, the share that take the helmet.
// Through a rigid shell the brain feels only the helmet's share of a blow (physics.js brainShare): the kettle hat, the
// kabuto, the close helmet see hardly a knockout among these blows now, and the open class's knockouts are mostly through
// the jingasa, a light iron hat that does not count as rigid (its cut proof under BLADES.gaps.rigidFrom). So: the jingasa
// comes off in a share of them about the open class's (helmetOff.holds.open, recalibrated 2026-11-11: 50.5% of the class's
// 105 in 6 seeds; this hat's own 12 of 40), and through a half-enclosed or an enclosed helm a heavy blow knocks a man out
// seldom and never takes the helm (was: enough knockouts through each to judge, ~30, before the rigid shell counted).
test('knocked out by a heavy blow, an open hat comes off often; through a half-enclosed or enclosed helm a heavy blow seldom knocks him out, and never takes it', () => {
  const open = measureHelm({ kind: 'ashigaru', design: 0 }, 3);
  assert.ok(open.kos >= 20, `enough knockouts to judge (${open.kos})`);
  assert.ok(open.off / open.kos > 0.2 && open.off / open.kos < 0.7, `jingasa off in ${open.off} of ${open.kos} knockouts`);
  for (const [helm, seeds, name] of [[{ kind: 'samurai', design: 0 }, 4, 'kabuto'], [{ kind: 'knight', design: 3 }, 3, 'close helmet']]) {
    const shut = measureHelm(helm, seeds);
    assert.ok(shut.kos <= open.kos / 4, `${name}: knocked out ${shut.kos} times, the jingasa ${open.kos}`);
    assert.equal(shut.off, 0, `${name} off in ${shut.off} of ${shut.kos} knockouts`);
  }
});

test('a helmet knocked off flies as a prop, and he is bare-headed for the rest of the fight', () => {
  const ease = WORLD.helmetOff.ease;
  WORLD.helmetOff.ease = 1000;
  let world;
  try {
    world = createWorld([{ ...PRESETS.heavy, style: 'boxing' }, { ...PRESETS.contender, style: 'passive', outfit: { kind: 'footman', design: 0 } }], { seed: 1 });
    const [striker, man] = world.fighters;
    const distance = reachOf(striker) * 0.9;
    placeFighter(striker, -distance / 2, 0);
    placeFighter(man, distance / 2, 0);
    advance(world, 0.6);
    const before = { blunt: protectionAt(man.body.gear, 'head').blunt, mass: man.body.headEffectiveMass, helmet: man.body.gear.helmet.mass };
    assert.ok(before.blunt > 0.3 && before.helmet > 1);
    throwPunch(world, striker, 'cross', 'head');
    advance(world, 0.6);
  } finally {
    WORLD.helmetOff.ease = ease;
  }
  const man = world.fighters[1];
  const told = world.events.find((event) => event.kind === 'accessory' && event.helmet);
  assert.ok(told, 'told: the helmet goes flying');
  assert.equal(told.item, 'kettle hat');
  assert.equal(told.hold, 'open');
  assert.ok(world.events.some((event) => event.kind === 'landed' && event.effects.includes('kettle hat knocked off')));
  const prop = world.props.find((each) => each.kind === 'helmet' && each.owner === man.id);
  assert.ok(prop && !prop.attached, 'a prop off his head');
  assert.equal(prop.head.kind, 'kettleHat', 'with the look of it');
  const gear = man.body.gear;
  assert.equal(protectionAt(gear, 'head').blunt, 0, 'the head guarded by nothing');
  assert.equal(protectionAt(gear, 'head').cut, 0);
  assert.equal(gear.protection.bullet?.head ?? 0, 0);
  assert.equal(gear.helmet.mass, 0, 'no helmet\'s mass nor padding on the head');
  assert.equal(gear.helmet.padding, 0);
  assert.equal(gear.helmFace, 'bare');
  assert.equal(gear.helmetHold, null, 'nothing more to knock off');
  assert.equal(man.body.inputs.outfit.bareHead, true, 'a view built again draws him bare-headed');
  assert.ok(man.helmetOff);
  // His body otherwise as it was: the same man, his helmet's mass off his head.
  const fresh = buildBody(man.body.inputs);
  assert.ok(Math.abs(fresh.headEffectiveMass - man.body.headEffectiveMass) < 1e-9);
});

test('a helmet that narrowed his sight leaves it open once knocked off', () => {
  const sight = gearTraits({ outfit: { kind: 'knight', design: 0 } }).sight;
  const bare = gearTraits({ outfit: { kind: 'knight', design: 0, bareHead: true } }).sight;
  assert.equal(bare, null, 'bare-headed, his own field of view');
  if (sight !== null) assert.ok(sight < Math.PI);
});
