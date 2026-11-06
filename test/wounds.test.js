// Wounds (physics.js): what is left of a limb to cut through (limbResistance), an edge that goes into the bone breaking it
// (cutIntoLimb), a broken or cut-into limb coming off more easily, the stress of a narrow striking face (contactStress), a man
// lying on the floor with the floor behind him (backedMass), and the finisher (finisher.js) killing a man down, armoured or not.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { BLADES } from '../src/weapons.js';
import { advance, backedMass, bodyHarm, breakJoint, contactStress, createWorld, cutIntoLimb, limbResistance, placeFighter, WORLD } from '../src/physics.js';
import { directFighter, newOrders } from '../src/control.js';
import { startFinisher } from '../src/finisher.js';

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
