import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { AI, thinkAll } from '../src/ai.js';
import { advance, createWorld, placeFighter, WORLD } from '../src/physics.js';

// Coarse physics for unseen fights (physics.js chooseDetail, WORLD.tiers.unseen): in a big fight played as one man, an
// exchange at hand neither man of which he perceives (ai.js AI.perceive), or perceives only WORLD.tiers.unseen.far or more
// from him, is stepped at half the rate. 20 street brawlers a
// side, in two lines some 20 m long: the man played at one end of his, the far end's fights out of his view.
const SIDE = 20;
const battle = () => createWorld(Array.from({ length: 2 * SIDE }, (_, index) => ({ inputs: structuredClone(PRESETS.street), corner: index < SIDE ? 'red' : 'blue' })), { seed: 3, arena: { halfX: 40, halfZ: 30 } });
const hips = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 1], fighter.x[P.pelvis * 3 + 2]];
const apart = (a, b) => Math.hypot(hips(a)[0] - hips(b)[0], hips(a)[2] - hips(b)[2]);
// Whom the player watches close to: perceived, and within WORLD.tiers.unseen.far of him (`slack` m: the detail is chosen
// at a step's start, the men read at its end, a step's run, 8 m/s for 1/60 s, apart).
const SLACK = 0.15;
const watched = (world, player, fighter, slack = SLACK) => fighter.unperceived !== true && apart(fighter, player) < WORLD.tiers.unseen.far - slack;
const endOf = (world, corner) => world.fighters.filter((fighter) => fighter.corner === corner).reduce((end, fighter) => (hips(fighter)[2] > hips(end)[2] ? fighter : end));

test('an exchange the player does not perceive is stepped unseen, both men of it, and stays a body on its feet', () => {
  const world = battle();
  const player = endOf(world, 'red');
  world.perceiver = player.id;
  let unseenSteps = 0;
  const unseenMen = new Set();
  for (let k = 0; k < 60 * 12; k += 1) {
    advance(world, 1 / 60, (current, dt) => thinkAll(current, dt));
    for (const fighter of world.fighters) {
      if (fighter.detail !== 'unseen') continue;
      unseenSteps += 1;
      unseenMen.add(fighter.id);
      // Not watched close to, nor any man within reach he strikes at or has picked out; not the player, not close to him.
      assert.ok(!watched(world, player, fighter), `unseen man ${fighter.id} perceived ${apart(fighter, player).toFixed(1)} m from the player`);
      assert.notEqual(fighter.id, player.id);
      const [x, , z] = hips(fighter);
      const [px, , pz] = hips(player);
      assert.ok(Math.hypot(x - px, z - pz) > AI.perceive.close, `unseen man ${fighter.id} within ${AI.perceive.close} m of the player`);
      for (const other of [fighter.punch?.target, fighter.focus]) {
        if (other === undefined || other === null) continue;
        const [ox, , oz] = hips(world.fighters[other]);
        if (Math.hypot(x - ox, z - oz) < WORLD.contactRange) assert.ok(!watched(world, player, world.fighters[other]), `${fighter.id} at hand with ${other}, whom the player watches`);
      }
      // Still a body: every part where a body can be, moving as a body does (and, still standing after the step, upright).
      for (let index = 0; index < fighter.x.length; index += 1) assert.ok(Number.isFinite(fighter.x[index]) && Number.isFinite(fighter.v[index]));
      const height = fighter.x[P.head * 3 + 1] - hips(fighter)[1];
      if (fighter.state === 'up') assert.ok(height > 0.3 && height < 1, `head ${height.toFixed(2)} m over the hips`);
      for (let index = 0; index < fighter.v.length; index += 1) assert.ok(Math.abs(fighter.v[index]) < 40, `a part of ${fighter.id} at ${fighter.v[index].toFixed(1)} m/s`);
    }
  }
  assert.ok(unseenMen.size >= 4 && unseenSteps > 60, `unseen exchanges at the far end: ${unseenMen.size} men, ${unseenSteps} man-steps`);
  // Blows landed in them all the same: fought at half the rate, not frozen.
  assert.ok(world.events.some((event) => event.kind === 'landed' && unseenMen.has(event.attacker)), 'no blow landed by an unseen man');
  assert.ok(WORLD.tiers.unseen.stride >= 2);
});

test('with no man played (Battle Mode) nobody is unseen', () => {
  const world = battle();
  for (let k = 0; k < 60 * 6; k += 1) {
    advance(world, 1 / 60, (current, dt) => thinkAll(current, dt));
    for (const fighter of world.fighters) assert.notEqual(fighter.detail, 'unseen');
  }
});

test('an exchange he perceives far off is stepped unseen too; within WORLD.tiers.unseen.far of him, never', () => {
  const world = battle();
  // The player stood back behind the middle of his line, facing it: all of it in his view and within AI.perceive.sharp, the
  // whole fight perceived and every exchange of it some 18-21 m off.
  const red = world.fighters.filter((fighter) => fighter.corner === 'red').sort((a, b) => hips(a)[2] - hips(b)[2]);
  const player = red[Math.floor(red.length / 2)];
  const lineX = red.reduce((sum, fighter) => sum + hips(fighter)[0], 0) / red.length;
  placeFighter(player, lineX - 18, 0);
  player.yaw = 0;
  world.perceiver = player.id;
  const farSeen = new Set();
  for (let k = 0; k < 60 * 12; k += 1) {
    advance(world, 1 / 60, (current, dt) => thinkAll(current, dt));
    for (const fighter of world.fighters) {
      if (fighter.unperceived === true || fighter.id === player.id) continue;
      if (apart(fighter, player) < WORLD.tiers.unseen.far - SLACK) assert.notEqual(fighter.detail, 'unseen', `${fighter.id} ${apart(fighter, player).toFixed(1)} m from him`);
      else if (fighter.detail === 'unseen') farSeen.add(fighter.id);
    }
    assert.notEqual(player.detail, 'unseen', 'his own');
  }
  assert.ok(farSeen.size >= 2, `men perceived far off and stepped unseen: ${farSeen.size}`);
  assert.ok(WORLD.tiers.unseen.far > AI.perceive.close, 'never the exchanges at hand with him');
});
