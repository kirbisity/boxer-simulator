// Wounds (physics.js): what is left of a limb to cut through (limbResistance), an edge that goes into the bone breaking it
// (cutIntoLimb), a broken or cut-into limb coming off more easily, the stress of a narrow striking face (contactStress), a man
// lying on the floor with the floor behind him (backedMass), and the finisher (finisher.js) killing a man down, armoured or not,
// through a gap he can get at (planFinisher: the line to it clear of the man's own limbs).

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { BLADES, WEAPONS } from '../src/weapons.js';
import { advance, backedMass, bodyHarm, breakJoint, contactStress, createWorld, cutIntoLimb, injuryOf, limbResistance, placeFighter, reachOf, WORLD } from '../src/physics.js';
import { directFighter, newOrders } from '../src/control.js';
import { firstMet, startFinisher } from '../src/finisher.js';
import { blowAt, finish, pair } from '../tools/wounds.js';

function man(preset = 'amateur') {
  const world = createWorld([{ ...structuredClone(PRESETS[preset]), style: 'boxing' }, { ...structuredClone(PRESETS.veteran), style: 'boxing' }], { seed: 1 });
  return { world, fighter: world.fighters[0] };
}

const ELBOW = { joint: 'elbow', side: 'l' };
const total = (left) => left.flesh + left.bone;

test('a whole limb resists with its flesh and its bone; broken, it has little but the flesh left', () => {
  const { world, fighter } = man();
  const whole = limbResistance(fighter, ELBOW, 'lForearm');
  assert.ok(Math.abs(whole.bone / total(whole) - BLADES.limbCut.bone) < 1e-9, 'the bone takes its share of the work');
  breakJoint(world, fighter, 'lElbow', 'lForearm');
  assert.ok(fighter.fractured.has('lForearm'));
  const broken = limbResistance(fighter, ELBOW, 'lForearm');
  assert.ok(Math.abs(broken.bone - whole.bone * BLADES.limbCut.fractured) < 1e-9);
  assert.ok(total(broken) < 0.6 * total(whole), `broken ${total(broken).toFixed(1)} J against whole ${total(whole).toFixed(1)} J`);
  // The neck is not a limb: all one.
  assert.equal(limbResistance(fighter, { joint: 'neck', side: '' }).bone, 0);
});

test('a heavy cut short of taking the limb off goes into the bone and breaks it; a light one only cuts, and leaves less to cut', () => {
  const { world, fighter } = man();
  const capsule = { key: 'lForearm' };
  const whole = limbResistance(fighter, ELBOW, 'lForearm');
  const event = { effects: [] };
  // Into the flesh, not the bone: it stays whole, but the flesh it parted is gone at that place.
  assert.equal(cutIntoLimb(world, fighter, capsule, 0.9, whole.flesh * 0.8, 1, event), false);
  assert.equal(fighter.broken.has('lElbow'), false);
  const cut = limbResistance(fighter, ELBOW, 'lForearm');
  assert.ok(total(cut) < total(whole), 'a cut limb has less left to cut through');
  // Past the flesh and well into the bone, square across: broken.
  const { world: other, fighter: him } = man();
  const heavy = whole.flesh + whole.bone * (BLADES.limbCut.splits + 0.1);
  assert.ok(heavy < total(whole), 'short of what takes it off');
  const struck = { effects: [] };
  assert.equal(cutIntoLimb(other, him, capsule, 0.9, heavy, 1, struck), true);
  assert.ok(him.broken.has('lElbow') && him.fractured.has('lForearm'));
  assert.ok(struck.effects.includes('the bone cut into'));
  assert.ok(other.events.some((e) => e.kind === 'broken' && e.joint === 'lElbow'));
  // The same, only grazing the side of the limb: it does not reach the bone so far.
  const { world: third, fighter: grazed } = man();
  assert.equal(cutIntoLimb(third, grazed, capsule, 0.9, heavy, 0, { effects: [] }), false);
});

test('a cut that would only break a whole limb takes a broken one off', () => {
  const { world, fighter } = man();
  const whole = total(limbResistance(fighter, ELBOW, 'lForearm'));
  const blow = whole * 0.75;
  breakJoint(world, fighter, 'lElbow', 'lForearm');
  assert.ok(blow > total(limbResistance(fighter, ELBOW, 'lForearm')), 'the blow is more than what is left of it');
});

test('a narrower striking face than a glove hurts the tissue more, to a limit; a broader one as the glove', () => {
  assert.equal(contactStress(null), 1);
  assert.equal(contactStress(WORLD.fists.gloved.radius), 1);
  assert.ok(Math.abs(contactStress(WORLD.fists.bare.radius) - Math.sqrt(WORLD.contactStress.radius / WORLD.fists.bare.radius)) < 1e-9);
  assert.ok(contactStress(WORLD.fists.bare.radius) > 1.15 && contactStress(WORLD.fists.bare.radius) < 1.35, 'a bare fist: a little more');
  assert.equal(contactStress(0.005), WORLD.contactStress.most);
  assert.equal(contactStress(0.2), 1);
});

test('a blunt head crushes by how its face presses in against the 15 cm pendulum the crush was set by, to the same limit', () => {
  assert.equal(contactStress(BLADES.crushFace, BLADES.crushFace), 1, 'Kroell\'s face: as calibrated');
  assert.equal(contactStress(0.2, BLADES.crushFace), 1, 'broader: as the pendulum');
  assert.ok(Math.abs(contactStress(WEAPONS.kanabo.radius, BLADES.crushFace) - Math.sqrt(0.075 / 0.05)) < 1e-9, 'a kanabo ~1.22');
  assert.equal(contactStress(WEAPONS.flangedMace.face, BLADES.crushFace), WORLD.contactStress.most, 'a flange\'s edge: the limit');
  // The same mace blow at the body (the same seed, the same swing), with its flange's face and with a 15 cm one in its place.
  // (The crush alone: the ribs' own injury, WORLD.injury.fractured, grows with the face too but by its log, measured apart.)
  const trunkHarm = (face) => {
    const saved = WEAPONS.flangedMace.face;
    const fractured = WORLD.injury.fractured;
    WEAPONS.flangedMace.face = face;
    WORLD.injury.fractured = 0;
    try {
      const probe = pair('mace', 1, 1);
      const { world, me, him } = pair('mace', reachOf(probe.me) * 1.05, 1);
      // (Laid 0.2 m under the neck, was 0.3: the mace swung at its turn limit, physics.js turnLimit, with its weight where
      // a mace's is, comes in lower through its arc, and laid at 0.3 its head met his thigh.)
      const done = blowAt(world, me, him, 'maceSide', (man) => [man.x[P.neck * 3], man.x[P.neck * 3 + 1] - 0.2, man.x[P.neck * 3 + 2]]);
      assert.ok(done?.hit?.kind === 'landed' && done.hit.target === 'trunk' && !done.hit.haft, `the head landed on the body: ${done?.hit?.target}`);
      return injuryOf(him, 'trunk');
    } finally {
      WEAPONS.flangedMace.face = saved;
      WORLD.injury.fractured = fractured;
    }
  };
  const ratio = trunkHarm(WEAPONS.flangedMace.face) / trunkHarm(BLADES.crushFace);
  // (1.5 by the blow itself; a little more with what follows from it, the man knocked about the harder.)
  assert.ok(ratio > 1.4 && ratio < 1.75, `the flange crushes ${ratio.toFixed(2)}x the pendulum's face`);
});

test('a man lying on the floor meets a blow coming down on him with the floor behind him; standing, with his own mass', () => {
  const { fighter } = man();
  const local = 5;
  assert.equal(backedMass(fighter, { key: 'head' }, [0, 1, 0], local), local, 'on his feet');
  fighter.state = 'down';
  for (let index = 0; index < fighter.x.length; index += 3) fighter.x[index + 1] = Math.min(fighter.x[index + 1], 0.12);
  const down = backedMass(fighter, { key: 'trunk' }, [0, 1, 0], local);
  assert.ok(Math.abs(down - WORLD.balance.massShare * fighter.body.massKg) < 1e-9, `straight down: as much of him as moves as one (${down})`);
  const slant = backedMass(fighter, { key: 'trunk' }, [Math.SQRT1_2, Math.SQRT1_2, 0], local);
  assert.ok(Math.abs(slant - local * 2) < 1e-9, 'at 45°: half the blow into the floor');
  assert.equal(backedMass(fighter, { key: 'trunk' }, [1, 0, 0], local), local, 'from the side, along the floor: nothing behind it');
});

/** The finisher by `attacker` on a man of `preset` put on the floor: whether he is dead within 6 s, and his health after. */
function finished(attacker, preset, seed) {
  const world = createWorld([{ inputs: structuredClone(PRESETS[attacker]), corner: 'red' }, { inputs: structuredClone(PRESETS[preset]), corner: 'blue' }], { seed });
  world.armed = true;
  const orders = newOrders();
  const [me, him] = world.fighters;
  placeFighter(him, me.root[0] + 1, me.root[1] + 0.1 * (seed % 2));
  const step = (seconds) => advance(world, seconds, (w, dt) => {
    thinkAll(w, dt, new Set([0, 1]));
    directFighter(w, me, orders, dt);
  });
  step(0.3);
  him.state = 'down';
  him.downTimer = 60;
  him.knockdowns = 1;
  step(0.8);
  assert.ok(startFinisher(world, me, him));
  step(6);
  return { dead: him.diedAt !== undefined, health: 1 - bodyHarm(him) };
}

test('the finisher kills a man down in plate through the gap at his throat, and his health shows him dead', () => {
  const runs = [1, 2, 3, 4].map((seed) => finished('knight', 'knight', seed));
  assert.ok(runs.filter((run) => run.dead).length >= 3, JSON.stringify(runs));
  for (const run of runs.filter((r) => r.dead)) assert.ok(run.health < 0.2, `killed, his health ${run.health.toFixed(2)}`);
  // Unarmoured: dead, and his health all gone (a point through the brain is the head's fatal injury).
  const bare = finished('light', 'light', 1);
  assert.ok(bare.dead);
  assert.ok(bare.health < 0.01, `health ${bare.health}`);
});

test('the finisher looks for a gap he can get at: on a man in mail, the point meets his head or body, not his own leg lying across it', () => {
  // (Before, 2-3 in 20 of these met the man's shank folded over the armpit the dagger was put to, and left him alive.)
  // (Watched the 10 s and the seconds a mortal wound leaves him, WORLD.injury.drainSeconds.)
  const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => finish('knight', 'mail', seed, 10 + WORLD.injury.drainSeconds));
  for (const run of runs) assert.ok(['head', 'trunk'].includes(run.blow?.target), `the point met his ${run.blow?.target}`);
  assert.ok(runs.filter((run) => run.killed).length >= 7, `killed ${runs.filter((run) => run.killed).length} of 8`);
});

test('the line a point is put along meets the first part of him in its way: a leg over the body before the body', () => {
  const { fighter } = man();
  const at = (name) => [fighter.x[P[name] * 3], fighter.x[P[name] * 3 + 1], fighter.x[P[name] * 3 + 2]];
  // From in front of him to the middle of his chest: the trunk.
  const chest = [0, 1, 2].map((i) => (at('pelvis')[i] + at('neck')[i]) / 2);
  const front = (x) => [x[0] + 1, x[1], x[2]];
  const met = firstMet(fighter, front(chest), chest);
  assert.ok(met && ['trunk', 'lForearm', 'rForearm', 'lUpperArm', 'rUpperArm'].includes(met.key), `met ${met?.key}`);
  // His left shin laid across that line, between: it is met first.
  const knee = P.lKnee * 3;
  const foot = P.lFoot * 3;
  const across = [chest[0] + 0.25, chest[1], chest[2]];
  for (const [index, offset] of [[knee, -0.2], [foot, 0.2]]) {
    fighter.x[index] = across[0];
    fighter.x[index + 1] = across[1];
    fighter.x[index + 2] = across[2] + offset;
  }
  assert.equal(firstMet(fighter, front(chest), chest).key, 'lShank');
});
