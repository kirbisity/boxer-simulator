import test from 'node:test';
import assert from 'node:assert/strict';
import { hasHaft } from '../src/physics.js';
import { WEAPONS } from '../src/weapons.js';
import { strikeAt } from '../tools/weapon-strikes.js';

// Where along the weapon (m from the main hand) a landed blow met him: its haft (WORLD.haft.from on) or its head.
const reachOf = (spec, hit) => (hit.haft ? 0.1 + hit.at * (spec.strikeFrom - 0.1) : spec.strikeFrom + hit.at * (spec.length - spec.strikeFrom));

test('a haft is any shaft between the hands and the head; a sword or knife grip is not one, nor a staff that strikes along all of it', () => {
  for (const kind of ['naginata', 'guandao', 'warhammer', 'longSpear', 'spear', 'lance']) assert.ok(hasHaft(WEAPONS[kind]), kind);
  for (const kind of ['katana', 'knife', 'rapier', 'staff', 'whip', 'kanabo']) assert.ok(!hasHaft(WEAPONS[kind]), kind);
});

test('the naginata\'s blade missing, its haft lands: blunt harm and a shove, no cut, far less hurt than the blade', () => {
  const shaft = strikeAt('naginata', 'naginataSweep', 'body', 1.0).hit;
  const blade = strikeAt('naginata', 'naginataSweep', 'body', 1.8).hit;
  assert.ok(shaft?.haft && !blade?.haft, 'close in the haft meets him; at range the blade does');
  assert.equal(shaft.target, blade.target, 'the same part, the arm held up');
  assert.ok(shaft.harm > 0 && shaft.cut === 0 && shaft.pierce === 0, 'round wood: blunt only');
  assert.ok(shaft.transferred > 5, `it knocks him (${shaft.transferred.toFixed(1)} N·s)`);
  // The haft is slower where it met him than the blade (ω × r) and carries less energy into him.
  assert.ok(shaft.speed < blade.speed * 0.7 && shaft.energy < blade.energy * 0.8, `haft ${shaft.speed.toFixed(1)} m/s ${shaft.energy.toFixed(0)} J, blade ${blade.speed.toFixed(1)} m/s ${blade.energy.toFixed(0)} J`);
  assert.ok(blade.cut > 50, 'the blade cuts deep');
});

test('the kanabo strikes along all its length: near the hands slower and weaker than out at the end', () => {
  const spec = WEAPONS.kanabo;
  const near = strikeAt('kanabo', 'hammerOverhead', 'body', 0.7).hit;
  const far = strikeAt('kanabo', 'hammerOverhead', 'body', 1.3).hit;
  assert.ok(near && far && !near.haft && !far.haft, 'studded club, not a haft');
  assert.ok(reachOf(spec, near) < 0.6 && reachOf(spec, far) > 0.8, `met at ${reachOf(spec, near).toFixed(2)} m and ${reachOf(spec, far).toFixed(2)} m`);
  assert.ok(near.speed < far.speed && near.energy < far.energy * 0.5, `near ${near.energy.toFixed(0)} J, far ${far.energy.toFixed(0)} J`);
  assert.ok(near.harm > 0, 'still a blow');
});

test('a spear point laid on a bare man as the thrust begins is driven in: it stabs, not lost because it touched him first', () => {
  // Before the fix this thrust met him slowly at the start of its drive, was put down as no blow, and never tested again: a miss.
  const { hit } = strikeAt('spear', 'spearThrust', 'body', 1.9);
  assert.ok(hit, 'it lands');
  assert.equal(hit.target, 'trunk');
  assert.ok(hit.pierce > 20 && hit.effects.some((effect) => /stabbed|run through/.test(effect)), `a wound (${hit?.pierce.toFixed(0)} J of point)`);
});
