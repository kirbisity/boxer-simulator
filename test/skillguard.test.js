// A guard read by skill (WORLD.guardRead, physics.js blowRead; the AI's held guard, ai.js keepGuard): a block made against a
// blow goes onto its line only as well as the man is trained to read it, and every block costs breath (WORLD.guardHeld).
// - untrained (a commoner, a levy): the block stays where it was put; he never holds a guard;
// - an elite reads the blow and his held guard meets most of them;
// - more skill, fewer blows land (the same body, the same weapon, the same man swinging at him);
// - each blow taken on a block costs its blocker breath by its energy, AI or player; an AI's held guard drains it by the second.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, guardReading, placeFighter, WORLD } from '../src/physics.js';

/** A knight at `skill` (red, 0) who only defends, against an ordinary one (blue, 1) who attacks; what came of the blows at him. */
function defending(skill, seed, seconds = 15) {
  const world = createWorld([{ inputs: { ...structuredClone(PRESETS.knight), skill }, corner: 'red' }, { inputs: { ...structuredClone(PRESETS.knight), skill: 0.5 }, corner: 'blue' }], { seed });
  placeFighter(world.fighters[0], -1.25);
  placeFighter(world.fighters[1], 1.25);
  const me = world.fighters[0];
  const blows = new Set();
  let read = false;
  let held = false;
  advance(world, seconds, (current, dt) => {
    // (He holds his own blows back: his defence alone is measured.)
    me.cooldown = 99;
    me.aiCombo = null;
    thinkAll(current, dt);
    const punch = current.fighters[1].punch;
    if (punch?.target === me.id) blows.add(punch);
    read ||= me.blowRead !== undefined;
    held ||= Boolean(me.guardHeld);
  });
  const landed = world.events.filter((event) => event.kind === 'landed' && event.defender === me.id).length;
  return { blows: blows.size, landed, read, held };
}

/** Blows landing on him, as a share of those thrown at him, over `seeds`. */
function landedShare(skill, seeds = [1, 2, 3, 4]) {
  const runs = seeds.map((seed) => defending(skill, seed));
  const blows = runs.reduce((sum, run) => sum + run.blows, 0);
  return { share: runs.reduce((sum, run) => sum + run.landed, 0) / blows, blows, read: runs.some((run) => run.read), held: runs.some((run) => run.held) };
}

test('an untrained man does not read the blow: his block stays where it is, and he holds no guard', () => {
  const untrained = landedShare(0.1, [1, 2]);
  assert.ok(untrained.blows > 5, `${untrained.blows} blows at him`);
  assert.equal(untrained.read, false, 'his block never went for a blow');
  assert.equal(untrained.held, false, 'he never held his guard up');
  const world = createWorld([{ inputs: { ...structuredClone(PRESETS.spear) } }, { inputs: { ...structuredClone(PRESETS.knight) } }]);
  assert.equal(guardReading(world.fighters[0]), null, 'a peasant (his kit, OUTFITS commoner) is untrained');
  assert.ok(guardReading(world.fighters[1]) > 0.5, 'a knight is trained');
});

test('more skill, fewer blows land: an elite reads them, holds his guard and meets most', () => {
  // (Over 16 bouts, 60-110 blows at each skill: over 4, some 20 a skill, the shares swung by ±0.1 with any change to the
  // fight, and the elite's from 0.00 to 0.29 between blocks of bouts; at 16, 0.50, 0.39 and 0.19.)
  const seeds = Array.from({ length: 16 }, (_, index) => index + 1);
  const novice = landedShare(0.1, seeds);
  const regular = landedShare(0.5, seeds);
  const elite = landedShare(0.9, seeds);
  const shares = `landed: ${novice.share.toFixed(2)} at 0.1, ${regular.share.toFixed(2)} at 0.5, ${elite.share.toFixed(2)} at 0.9`;
  assert.ok(novice.share > regular.share && regular.share > elite.share, shares);
  // (0.2 before BLADES.crushTrauma: over 24 bouts the elite's share is 0.16 without the crushing and 0.22 with it, within the
  // spread of the sample; he still meets three blows in four, where the novice meets half.)
  assert.ok(elite.share <= 0.25, shares);
  // (0.4 before AI.armourSense: the ordinary knight at him now mostly thrusts at the plate, and his points land a little less than his cuts did.)
  assert.ok(novice.share >= 0.35, shares);
  assert.ok(elite.read && elite.held, 'the elite read the blows and held his guard');
});

test('a blow taken on a block costs the AI breath by its energy', () => {
  const world = createWorld([{ inputs: structuredClone(PRESETS.knight), corner: 'red' }, { inputs: structuredClone(PRESETS.knight), corner: 'blue' }]);
  const me = world.fighters[0];
  me.stamina = 0.5;
  advance(world, 1 / 60);
  const before = me.stamina;
  world.events.push({ time: world.time, kind: 'bladeBlock', attacker: me.id, defender: 1, energy: 100, effects: [] });
  advance(world, 1 / 60);
  const recovered = me.stamina - before;
  const paid = 100 * WORLD.guardHeld.perJoule / me.body.aerobic;
  // (Less the step's recovery, which is the same in the step before.)
  const recovery = before - 0.5;
  assert.ok(Math.abs(recovered - (recovery - paid)) < 0.002, `a 100 J blow on his blade: ${(-recovered).toFixed(4)} net, ${paid.toFixed(4)} its cost`);
});

test('an AI holding his guard up pays for it by the second, and lets it down with no blow coming', () => {
  const run = (hold) => {
    const world = createWorld([{ inputs: structuredClone(PRESETS.knight), corner: 'red' }, { inputs: structuredClone(PRESETS.knight), corner: 'blue' }]);
    placeFighter(world.fighters[0], -4);
    placeFighter(world.fighters[1], 4);
    const me = world.fighters[0];
    me.stamina = 0.6;
    advance(world, 3, (current, dt) => {
      if (hold) {
        me.guardHeld = true;
        me.guardUntil = current.time + 1;
      }
      for (const fighter of current.fighters) fighter.move = 0;
    });
    return me.stamina;
  };
  assert.ok(run(true) < run(false) - 0.05, `3 s: ${run(true).toFixed(3)} held, ${run(false).toFixed(3)} not`);
  const world = createWorld([{ inputs: structuredClone(PRESETS.knight), corner: 'red' }, { inputs: structuredClone(PRESETS.knight), corner: 'blue' }]);
  placeFighter(world.fighters[0], -6);
  placeFighter(world.fighters[1], 6);
  world.fighters[0].guardHeld = true;
  world.fighters[0].guardUntil = WORLD.guardRead.linger;
  advance(world, WORLD.guardRead.linger + 0.2, (current, dt) => thinkAll(current, dt));
  assert.equal(world.fighters[0].guardHeld, false, 'no blow at him: let down after the linger');
});
