// Level mode, awareness (src/levelmode/awareness.js): who notices whom, and what the unaware do.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thinkAll } from '../src/ai.js';
import { P, PRESETS } from '../src/body.js';
import { advance, hostile, nearestOpponent, placeOnFloor, throwPunch } from '../src/physics.js';
import { slabOf, wallLine } from '../src/physics/terrain.js';
import { AWARE, awarenessReport, freePrisoner, gatherFollowers, sees, mindState, updateAwareness } from '../src/levelmode/awareness.js';
import { createStageWorld, stageThink } from '../src/levelmode/stage.js';
import { TESTYARD } from '../src/levelmode/stages/testyard.js';
import { hipsAt, walk } from './walker.js';

const hero = () => structuredClone(PRESETS.knight);

/** A one-section stage: a flat floor 200 m square, the player at `player` facing `facing`, these spawns and walls. */
function field({ spawns = [], walls = [], player = [0, 0], facing = 0, stops = null, sections = null } = {}) {
  const section = { id: 'a', name: 'A', bounds: [{ at: [0, 0], size: [200, 200] }], terrain: [slabOf([0, 0], [200, 200], 0, { id: 'floor' }), ...walls], portals: [], spawns, items: [], levers: [], gates: [], ladders: [] };
  return { id: 'field', title: 'Field', sea: -8, start: { section: 'a', at: [player[0], 0, player[1]], facing }, ...(stops ? { followStopsAt: stops } : {}), sections: sections ?? [section] };
}
const guard = (id, x, z, facing, extra = {}) => ({ id, preset: 'knight', role: 'enemy', tier: 1, post: [x, 0, z], facing, ...extra });
const world = (options, seed = 7) => createStageWorld(field(options), hero(), { seed });
// The AI thinks for everyone but the player (fighter 0), as the page does.
const think = (current, dt) => thinkAll(current, dt, new Set([0]));
const run = (w, seconds) => advance(w, seconds, (current, dt) => stageThink(current, dt, think));
const man = (w, id) => w.fighters.find((fighter) => fighter.spawn?.id === id);
const state = (w, id) => mindState(w, man(w, id).id);
const wall = (a, b) => wallLine(a, b, 0.4, 0, 3);
const civilian = (id, x, z, extra = {}) => ({ id, preset: 'amateur', role: 'civilian', post: [x, 0, z], facing: 0, ...extra });

// ---- Sight ------------------------------------------------------------------------------------

test('a guard facing the player, in the open, sees him and turns aggro; the fight AI has him then', () => {
  const w = world({ spawns: [guard('g', 12, 0, Math.PI)] });
  assert.equal(state(w, 'g'), 'idle');
  const start = hipsAt(man(w, 'g'));
  run(w, 2);
  assert.equal(state(w, 'g'), 'aggro');
  assert.equal(man(w, 'g').driven, false);
  assert.equal(man(w, 'g').walking, false);
  run(w, 2);
  const now = hipsAt(man(w, 'g'));
  assert.ok(Math.hypot(now[0] - start[0], now[1] - start[1]) > 2, 'he comes for the player');
});

test('ghost walk (the sandbox debug): a guard facing the player never notices him, and one already hunting gives up', () => {
  const w = world({ spawns: [guard('g', 12, 0, Math.PI)] });
  w.stage.ghost = true;
  run(w, 4);
  assert.equal(state(w, 'g'), 'idle', 'in plain sight, unseen');
  w.stage.ghost = false;
  run(w, 2);
  assert.equal(state(w, 'g'), 'aggro');
  w.stage.ghost = true;
  run(w, 1);
  assert.notEqual(state(w, 'g'), 'aggro', 'the hunt is given up');
  assert.equal(man(w, 'g').driven, true);
});

test('a guard with his back to the player notices him only close (2 to 3 m, all round); facing him, he sees him 20 to 30 m off', () => {
  assert.ok(AWARE.nearSense >= 2 && AWARE.nearSense <= 3, `near sense ${AWARE.nearSense} m`);
  assert.ok(AWARE.radius * AWARE.darkest >= 18 && AWARE.radius <= 30, `ahead: ${(AWARE.radius * AWARE.darkest).toFixed(1)} to ${AWARE.radius} m by the light`);
  // Standing still behind him (no noise): at 3.5 m he does not know; at 2 m he does.
  const far = world({ spawns: [guard('g', 3.5, 0, 0)] });
  run(far, 2);
  assert.equal(state(far, 'g'), 'idle', '3.5 m behind him, still: unnoticed');
  const near = world({ spawns: [guard('g', 2, 0, 0)] });
  run(near, 1);
  assert.equal(state(near, 'g'), 'aggro', '2 m behind him: noticed');
  // Facing him in full light: 26 m off he is seen; 33 m off he is not.
  const ahead = world({ spawns: [guard('g', 26, 0, Math.PI)] });
  run(ahead, 2);
  assert.equal(state(ahead, 'g'), 'aggro', '26 m ahead of him');
  const beyond = world({ spawns: [guard('g', 33, 0, Math.PI)] });
  run(beyond, 2);
  assert.equal(state(beyond, 'g'), 'idle', '33 m ahead of him');
});

test('hearing: a man running behind him is heard far off and he turns to look; one creeping is not; a wall muffles it', () => {
  const noise = (pace, wall = null) => {
    const w = world({ spawns: [guard('g', 9, 0, 0)], walls: wall ? [wall] : [] });
    const me = w.fighters[0];
    // The player going at `pace` m/s, from 9 m behind the guard's back and away from it (the guard looks away, +x).
    let heard = false;
    advance(w, 1.5, (current, dt) => {
      me.rootVelocity[0] = -pace;
      me.rootVelocity[1] = 0;
      stageThink(current, dt, think);
      if (state(w, 'g') === 'search') heard = true;
    });
    return heard;
  };
  // (Armour on him: the hero is a knight in plate, x1.7: a run, 3.5 m/s, carries about 13 m; a creep under 0.9 m/s nothing.)
  assert.equal(noise(3.5), true, 'a run 9 m behind him is heard');
  assert.equal(noise(0.7), false, 'a creep is not');
  assert.equal(noise(3.5, wallLine([4.5, -10], [4.5, 10], 0.4, 0, 3)), false, 'nor a run through a wall at 9 m');
});

test('a man held to a pen (`spawn.pen`) fights from inside it: he sees the player and comes for him only as far as its edge', () => {
  const w = world({ spawns: [guard('g', 8, 0, Math.PI, { pen: { at: [8, 0], size: [3, 3] } })] });
  run(w, 5);
  assert.equal(state(w, 'g'), 'aggro');
  const [x, z] = hipsAt(man(w, 'g'));
  assert.ok(x > 8 - 1.5 - 0.35 && x < 8 + 1.5 + 0.35 && Math.abs(z) < 1.5 + 0.35, `he stays in his pen: ${x.toFixed(2)}, ${z.toFixed(2)}`);
  assert.ok(x < 7.2, `he came to its edge: ${x.toFixed(2)}`);
});

test('a wall between them: a guard facing the player does not see him', () => {
  const w = world({ spawns: [guard('g', 12, 0, Math.PI)], walls: [wall([6, -10], [6, 10])] });
  run(w, 4);
  assert.equal(state(w, 'g'), 'idle');
  assert.equal(sees(w, man(w, 'g'), w.fighters[0], 25, 120), false);
});

test('beyond the sight radius he does not see: the section sets it, and its light dims it', () => {
  const far = world({ spawns: [guard('g', 32, 0, Math.PI)] });
  run(far, 2);
  assert.equal(state(far, 'g'), 'idle', 'past 30 m');
  const dark = field({ spawns: [guard('g', 22, 0, Math.PI)] });
  dark.sections[0].light = 0;
  const w = createStageWorld(dark, hero(), { seed: 7 });
  run(w, 2);
  assert.equal(state(w, 'g'), 'idle', `22 m in the dark (${(AWARE.radius * AWARE.darkest).toFixed(1)} m)`);
  dark.sections[0].vision = 25;
  const lit = createStageWorld(dark, hero(), { seed: 7 });
  run(lit, 2);
  assert.equal(state(lit, 'g'), 'aggro', 'the section\'s own vision wins');
});

test('the rear threat: a man the player cannot see (behind him) who has the player in his forward cone turns aggro', () => {
  // The player faces +x; the guard is behind him, at -x, looking at his back.
  const w = world({ spawns: [guard('g', -12, 0, 0)], facing: 0 });
  const me = w.fighters[0];
  assert.equal(Math.cos(me.yaw) * (hipsAt(man(w, 'g'))[0] - hipsAt(me)[0]) < 0, true, 'he is behind the player');
  run(w, 2);
  assert.equal(state(w, 'g'), 'aggro');
});

test('the cone: a man looking to the side (outside 60 degrees each way) does not see, inside it does', () => {
  const w = world({ spawns: [guard('g', 12, 0, Math.PI / 2 + 0.2)] });
  assert.equal(sees(w, man(w, 'g'), w.fighters[0], 25, AWARE.cone), false);
  man(w, 'g').yaw = Math.PI - 0.9;
  assert.equal(sees(w, man(w, 'g'), w.fighters[0], 25, AWARE.cone), true, '52 degrees off');
  man(w, 'g').yaw = Math.PI - 1.2;
  assert.equal(sees(w, man(w, 'g'), w.fighters[0], 25, AWARE.cone), false, '69 degrees off');
});

test('a man in a helm with a slit sees through a narrower cone', () => {
  const w = world({ spawns: [guard('g', 12, 0, Math.PI - 0.7)] });
  const g = man(w, 'g');
  assert.equal(sees(w, g, w.fighters[0], 25, AWARE.cone), true);
  assert.equal(sees(w, g, w.fighters[0], 25, AWARE.slitCone), false);
});

// ---- Stealth ---------------------------------------------------------------------------------------

test('an unaware man is relaxed: guard down, no parry; a blow from behind lands, and only then he is aggro', () => {
  const w = world({ spawns: [guard('g', 12, 0, 0)] });
  // (A deaf man with no near sense: the question is the unaware man's guard, not how close a man can come behind him, the test above.)
  Object.assign(w.stage.aware.config, { nearSense: 0, hear: { ...AWARE.hear, pace: 0 } });
  const g = man(w, 'g');
  const me = w.fighters[0];
  walk(w, me, [[10.9, 0]], { within: 0.3, seconds: 30, think });
  run(w, 1);
  assert.equal(g.walking, true, 'relaxed');
  assert.ok(!g.defence, 'no defence up');
  assert.ok(g.carry > 0.9 || g.weapon?.held || g.shield, `his free hand is down: ${g.carry}`);
  assert.equal(state(w, 'g'), 'idle');
  me.walking = false;
  me.goTo = [12, 0, 0];
  assert.ok(throwPunch(w, me, 'oberhau', 'head'));
  let parried = false;
  for (let index = 0; index < 90; index += 1) {
    advance(w, 1 / 60, (current, dt) => stageThink(current, dt, think));
    if (state(w, 'g') === 'idle' && g.defence) parried = true;
  }
  assert.equal(parried, false, 'he never parried before he knew');
  const landed = w.events.filter((event) => event.kind === 'landed' && event.attacker === 0 && event.defender === g.id);
  assert.ok(landed.length >= 1, 'the simulation decided: the blow landed');
  assert.equal(state(w, 'g'), 'aggro', 'and now he knows');
});

test('a blow that lands on or is blocked by an unaware man makes him aggro at once', () => {
  const w = world({ spawns: [guard('g', 3, 0, 0)] });
  w.events.push({ time: w.time, kind: 'landed', attacker: 0, defender: man(w, 'g').id, effects: [] });
  run(w, 0.1);
  assert.equal(state(w, 'g'), 'aggro');
  const v = world({ spawns: [guard('g', 3, 0, 0)] });
  v.events.push({ time: v.time, kind: 'blocked', attacker: 0, defender: man(v, 'g').id, effects: [] });
  run(v, 0.1);
  assert.equal(state(v, 'g'), 'aggro');
});

test('a clash of arms near an idle man sends him to look; far off it does not', () => {
  const w = world({ spawns: [guard('near', 40, 0, 0), guard('far', -60, 0, 0), civilian('cv', 44, 4)], player: [0, 0] });
  // A blow lands on someone who is no guard (who would shout): a noise.
  w.events.push({ time: w.time, kind: 'landed', attacker: 0, defender: man(w, 'cv').id, effects: [] });
  run(w, 0.5);
  assert.equal(state(w, 'near'), 'search', 'the one beside it goes to look');
  assert.equal(state(w, 'far'), 'idle');
});

// ---- Losing aggro --------------------------------------------------------------------------------------

test('lost sight for about 8 s: he searches where he saw the player last, looks about, then walks home and stands', () => {
  const w = world({ spawns: [guard('g', 10, 0, Math.PI)], walls: [wall([5, -40], [5, 40])] });
  const g = man(w, 'g');
  const me = w.fighters[0];
  // He is on the far side of a long wall; the player steps round the wall's end where he can be seen, then away behind it.
  g.yaw = Math.PI;
  placeOnFloor(me, 12, 41, 0, 0);
  run(w, 0.5);
  w.stage.aware.minds[g.id].state = 'idle';
  // Make him aggro by a blow, then hide the player behind the wall.
  w.events.push({ time: w.time, kind: 'landed', attacker: 0, defender: g.id, effects: [] });
  placeOnFloor(me, -20, 0, 0, 0);
  run(w, 0.5);
  assert.equal(state(w, 'g'), 'aggro');
  g.damage && (g.stamina = 1);
  run(w, 5);
  assert.equal(state(w, 'g'), 'aggro', 'not yet: he is still hunting');
  run(w, 5);
  assert.ok(['search', 'return'].includes(state(w, 'g')), `after about 8 s: ${state(w, 'g')}`);
  run(w, 40);
  assert.equal(state(w, 'g'), 'idle', 'home again');
  const [x, z] = hipsAt(g);
  assert.ok(Math.hypot(x - 10, z) < 1.5, `at his post: ${x.toFixed(1)}, ${z.toFixed(1)}`);
  const sequence = w.stage.aware.log.filter((entry) => entry.id === g.id).map((entry) => entry.to);
  assert.deepEqual(sequence.filter((to, index, all) => to !== all[index - 1]).slice(0, 5), ['idle', 'aggro', 'search', 'return', 'idle']);
});

test('while he searches, seeing the player again turns him aggro again', () => {
  const w = world({ spawns: [guard('g', 12, 0, Math.PI)] });
  const g = man(w, 'g');
  run(w, 1);
  assert.equal(state(w, 'g'), 'aggro');
  const mind = w.stage.aware.minds[g.id];
  g.driven = true;
  mind.state = 'idle';
  mind.set = false;
  w.stage.aware.log.length = 0;
  // Searching, with the player in front of him: aggro.
  mind.state = 'search';
  mind.lastSeen = { x: 12, z: 0, y: 0 };
  run(w, 1);
  assert.equal(state(w, 'g'), 'aggro');
});

// ---- The shout ----------------------------------------------------------------------------------------------

test('a shout alerts an ally with a clear line to the shouter, not one behind a wall', () => {
  const w = world({
    spawns: [
      guard('a', 12, 0, Math.PI),
      // Beside him, looking away from everything: only the shout can reach him.
      guard('b', 12, 7, 0),
      // Across a wall from him, also looking away.
      guard('c', 12, -7, 0),
    ],
    walls: [wall([4, -3.5], [22, -3.5])],
  });
  run(w, 1.2);
  assert.equal(state(w, 'a'), 'aggro', 'he saw the player');
  assert.equal(state(w, 'b'), 'aggro', 'he heard and saw him shout');
  assert.equal(state(w, 'c'), 'idle', 'the wall: he did not');
});

test('a shout reaches only so far', () => {
  const w = world({ spawns: [guard('a', 12, 0, Math.PI), guard('b', 12, 18, 0)] });
  run(w, 1.2);
  assert.equal(state(w, 'a'), 'aggro');
  assert.equal(state(w, 'b'), 'idle', '18 m off');
});

// ---- Patrols ---------------------------------------------------------------------------------------------------

test('a patrol walks its path to and fro, pausing at each end', () => {
  const w = world({ spawns: [guard('g', 30, 20, 0, { patrol: [[30, 20], [30, 30]] })] });
  assert.equal(state(w, 'g'), 'patrol');
  const zs = [];
  for (let second = 0; second < 50; second += 1) {
    run(w, 1);
    zs.push(hipsAt(man(w, 'g'))[1]);
  }
  assert.ok(Math.max(...zs) > 28.5 && Math.min(...zs.slice(10)) < 21.5, `walked both ways: ${zs.map((z) => z.toFixed(0))}`);
  assert.equal(state(w, 'g'), 'patrol');
});

// ---- Civilians -------------------------------------------------------------------------------------------------------

test('civilians and prisoners are neutral: not hostile, not thought for by the fight AI, and they stand at their posts', () => {
  const w = world({ spawns: [civilian('c', 40, 0), guard('g', 44, 0, 0)] });
  assert.equal(hostile(man(w, 'g'), man(w, 'c')), false);
  const at = hipsAt(man(w, 'c'));
  run(w, 3);
  const now = hipsAt(man(w, 'c'));
  assert.ok(Math.hypot(now[0] - at[0], now[1] - at[1]) < 0.3);
  assert.equal(state(w, 'c'), 'idle');
  assert.equal(nearestOpponent(w, man(w, 'g')), w.fighters[0]);
});

test('a civilian near a fight flees away from it along walkable ground and cowers', () => {
  // The fight: an aggro guard on the player, 6 m from the civilian.
  const w = world({ spawns: [guard('g', 7, 0, Math.PI), civilian('c', 12, 5)], player: [0, 0] });
  const c = man(w, 'c');
  const start = hipsAt(c);
  run(w, 1);
  assert.equal(state(w, 'g'), 'aggro');
  run(w, 2);
  assert.equal(state(w, 'c'), 'flee');
  run(w, 8);
  assert.equal(state(w, 'c'), 'cower');
  assert.equal(c.crawling, true, 'down on his knees');
  const now = hipsAt(c);
  const fight = hipsAt(man(w, 'g'));
  assert.ok(Math.hypot(now[0] - fight[0], now[1] - fight[1]) > Math.hypot(start[0] - 7, start[1]) + 2, 'farther from the fight than he began');
  assert.equal(c.punch, null);
});

test('a civilian flees toward his refuge when the spawn gives one', () => {
  const w = world({ spawns: [guard('g', 7, 0, Math.PI), civilian('c', 12, 5, { refuge: [20, 12] })], player: [0, 0] });
  run(w, 10);
  const [x, z] = hipsAt(man(w, 'c'));
  assert.ok(Math.hypot(x - 20, z - 12) < 3, `at the refuge: ${x.toFixed(1)}, ${z.toFixed(1)}`);
  assert.equal(state(w, 'c'), 'cower');
});

test('a civilian never runs off a ledge or into the sea: a cliff edge turns him', () => {
  // The floor ends at x 20; the threat is to the west, so "away" is east, over the edge.
  const stage = field({ spawns: [guard('g', 10, 0, Math.PI), civilian('c', 16, 0)] });
  stage.sections[0].terrain[0] = slabOf([0, 0], [40, 40], 0, { id: 'floor' });
  const w = createStageWorld(stage, hero(), { seed: 5 });
  run(w, 20);
  const c = man(w, 'c');
  assert.ok(c.x[P.pelvis * 3 + 1] > -1, 'still on the floor');
  assert.ok(hipsAt(c)[0] < 20.2);
});

test('the civilian who is hurt by the player marks the stage: civiliansHarmed', () => {
  const w = world({ spawns: [civilian('c', 2, 0)] });
  assert.equal(w.stage.civiliansHarmed, false);
  const me = w.fighters[0];
  const c = man(w, 'c');
  w.events.push({ time: w.time, kind: 'landed', attacker: me.id, defender: c.id, effects: [] });
  run(w, 0.1);
  assert.equal(w.stage.civiliansHarmed, true);
  assert.equal(state(w, 'c'), 'flee', 'and he runs');
  // A blow by a guard on a civilian is not the player's.
  const v = world({ spawns: [guard('g', 20, 0, 0), civilian('c', 2, 0)] });
  v.events.push({ time: v.time, kind: 'landed', attacker: man(v, 'g').id, defender: man(v, 'c').id, effects: [] });
  run(v, 0.1);
  assert.equal(v.stage.civiliansHarmed, false);
});

test('blue never targets a civilian, and a red ally does not either', () => {
  const w = world({ spawns: [guard('g', 4, 0, Math.PI), civilian('c', 5, 0.5), { id: 'ally', preset: 'veteran', role: 'ally', post: [-3, 0, 0], facing: 0 }] });
  run(w, 3);
  const g = man(w, 'g');
  const ally = man(w, 'ally');
  assert.notEqual(g.focus, man(w, 'c').id);
  assert.notEqual(ally.focus, man(w, 'c').id);
  assert.ok(!man(w, 'c').stats || (man(w, 'c').stats.landed ?? 0) === 0);
});

// ---- Prisoners and followers ----------------------------------------------------------------------------------------

const prisoner = (id, x, z, extra = {}) => ({ id, preset: 'veteran', role: 'prisoner', post: [x, 0, z], facing: 0, ...extra });

test('a prisoner stays grey until freed; freePrisoner makes him an ally who follows 2.5 to 4 m behind along the route', () => {
  const w = world({ spawns: [prisoner('p', 3, 0)] });
  const p = man(w, 'p');
  assert.equal(p.corner, 'grey');
  assert.equal(freePrisoner(w, 'nobody'), false);
  assert.equal(freePrisoner(w, 'p'), true);
  assert.equal(p.corner, 'red');
  assert.equal(state(w, 'p'), 'follow');
  assert.equal(freePrisoner(w, 'p'), false, 'only once');
  const me = w.fighters[0];
  walk(w, me, [[10, 0], [10, 14], [30, 14]], { within: 0.5, seconds: 60, think });
  run(w, 3);
  const apart = Math.hypot(...hipsAt(p).map((value, axis) => value - hipsAt(me)[axis]));
  assert.ok(apart > 1.8 && apart < 5.5, `behind him: ${apart.toFixed(2)} m`);
  assert.equal(state(w, 'p'), 'follow');
});

test('a follower turns the corner by the player\'s route, not through the wall', () => {
  const w = world({ spawns: [prisoner('p', 3, 0)], walls: [wall([12, -6], [12, 6])] });
  freePrisoner(w, 'p');
  const me = w.fighters[0];
  // Round the end of the wall at z 6.
  const result = walk(w, me, [[10, 0], [10, 9], [16, 9], [16, 0], [22, 0]], { within: 0.5, seconds: 80, think });
  assert.equal(result.reached, 5);
  run(w, 4);
  const [x] = hipsAt(man(w, 'p'));
  assert.ok(x > 13, `he got round the wall: ${x.toFixed(1)}`);
});

test('followers stop at the stage\'s followStopsAt region and stay there', () => {
  const w = world({ spawns: [prisoner('p', 3, 0)], stops: { at: [30, 0], size: [4, 20] } });
  freePrisoner(w, 'p');
  const me = w.fighters[0];
  walk(w, me, [[20, 0], [45, 0]], { within: 0.5, seconds: 80, think });
  run(w, 8);
  const p = man(w, 'p');
  assert.equal(state(w, 'p'), 'stayed');
  const [x] = hipsAt(p);
  assert.ok(x > 27.5 && x < 33, `at the gate: ${x.toFixed(1)}`);
});

test('followers fight whoever the player fights, and not the unaware', () => {
  const w = world({ spawns: [prisoner('p', -2, 1), guard('near', 12, 0, Math.PI), guard('unaware', 6, -30, 0), guard('unaware2', 6, 30, 0)] });
  freePrisoner(w, 'p');
  run(w, 1.5);
  assert.equal(state(w, 'near'), 'aggro');
  assert.equal(state(w, 'p'), 'aggro');
  assert.equal(man(w, 'p').focus, man(w, 'near').id);
  assert.equal(state(w, 'unaware'), 'idle');
});

test('an enemy who sees a fighting follower turns aggro too', () => {
  // The follower fights an aggro guard out of the player's sight; a second guard, looking at the follower only.
  const w = world({ spawns: [prisoner('p', 40, 0), guard('first', 48, 0, Math.PI), guard('second', 40, 18, Math.PI / 2)], player: [-40, 0] });
  freePrisoner(w, 'p');
  w.events.push({ time: w.time, kind: 'landed', attacker: man(w, 'p').id, defender: man(w, 'first').id, effects: [] });
  run(w, 3);
  assert.equal(state(w, 'first'), 'aggro');
  assert.equal(state(w, 'p'), 'aggro');
  assert.equal(state(w, 'second'), 'aggro');
});

test('followers are re-homed with the player: never left dormant behind when a section goes quiet', () => {
  const room = (id, x) => ({ id, name: id, bounds: [{ at: [x, 0], size: [40, 30] }], terrain: [slabOf([x, 0], [40, 30], 0, { id: `${id}-floor` })], portals: [{ to: id === 'a' ? 'b' : 'a', area: { at: [x + (id === 'a' ? 16 : -16), 0], size: [8, 30] } }], spawns: id === 'a' ? [prisoner('p', -2, 0)] : [], items: [], levers: [], gates: [], ladders: [] });
  const w = createStageWorld(field({ sections: [room('a', 0), room('b', 40)], player: [0, 0] }), hero(), { seed: 2 });
  freePrisoner(w, 'p');
  const p = man(w, 'p');
  const me = w.fighters[0];
  walk(w, me, [[10, 0], [30, 0], [50, 0], [60, 0]], { within: 0.5, seconds: 80, think });
  assert.deepEqual(w.stage.active, ['b']);
  run(w, 2);
  assert.equal(p.dormant, undefined, 'awake');
  assert.equal(p.spawn.section, 'b');
});

test('gatherFollowers puts the followers beside the player', () => {
  const w = world({ spawns: [prisoner('p', 60, 60)] });
  freePrisoner(w, 'p');
  assert.equal(gatherFollowers(w), 1);
  const apart = Math.hypot(...hipsAt(man(w, 'p')).map((value, axis) => value - hipsAt(w.fighters[0])[axis]));
  assert.ok(apart < 4);
});

// ---- Fear: the garrison runs for its rear ----------------------------------------------------------------------------------

test('a broken man in a stage runs along walkable ground away from the foe, toward his section\'s rear, and never off the field', () => {
  const stage = field({ spawns: [guard('g', 8, 0, Math.PI)] });
  stage.sections[0].rear = [40, 0];
  const w = createStageWorld(stage, hero(), { seed: 9 });
  const g = man(w, 'g');
  run(w, 1);
  // Broken, and not steadying.
  Object.assign(g, { panicked: true, fear: 1, adrenaline: 0, calmFor: -1e6 });
  run(w, 4);
  assert.ok(hipsAt(g)[0] > 12, `running east: ${hipsAt(g)[0].toFixed(1)}`);
  assert.equal(g.fled, undefined);
});

// ---- Reports, the debug ---------------------------------------------------------------------------------------------------------

test('awarenessReport lists every man\'s state', () => {
  const w = world({ spawns: [guard('g', 12, 0, Math.PI), civilian('c', 40, 40)] });
  run(w, 1.5);
  const report = awarenessReport(w);
  assert.deepEqual(report.map((entry) => [entry.spawn, entry.state]), [['g', 'aggro'], ['c', 'idle']]);
});

test('the test yard\'s hall: guards stand or patrol, the civilian and the prisoner are neutral', () => {
  const w = createStageWorld(TESTYARD, hero(), { seed: 3 });
  const kinds = awarenessReport(w).map((entry) => [entry.spawn, entry.kind, entry.state]);
  assert.ok(kinds.some(([id, kind]) => id === 'clerk' && kind === 'civilian'));
  assert.ok(kinds.some(([id, kind]) => id === 'captive' && kind === 'captive'));
  assert.ok(kinds.some(([id, , st]) => id === 'guard3' && st === 'patrol'));
});

// ---- Cost -----------------------------------------------------------------------------------------------------------------------

test('awareness costs little per step with 30 men awake', () => {
  const spawns = [];
  for (let index = 0; index < 22; index += 1) spawns.push(guard(`g${index}`, 20 + (index % 6) * 8, -30 + Math.floor(index / 6) * 12, index % 2 ? 0 : Math.PI, index % 3 === 0 ? { patrol: [[20 + (index % 6) * 8, -30 + Math.floor(index / 6) * 12], [20 + (index % 6) * 8 + 4, -30 + Math.floor(index / 6) * 12]] } : {}));
  for (let index = 0; index < 5; index += 1) spawns.push(civilian(`c${index}`, -20 - index * 2, 10));
  for (let index = 0; index < 2; index += 1) spawns.push(prisoner(`p${index}`, -20 - index * 2, -10));
  const w = world({ spawns, walls: [wall([15, -40], [15, -10]), wall([15, 10], [15, 40])] });
  assert.equal(w.fighters.length, 30);
  const aware = w.stage.aware;
  // Time the awareness alone, over six seconds of steps (the world stepping between).
  let spent = 0;
  let steps = 0;
  for (let index = 0; index < 360; index += 1) {
    advance(w, 1 / 60, (current, dt) => stageThink(current, dt, think));
  }
  const looks = aware.looks;
  for (let index = 0; index < 600; index += 1) {
    w.time += 1 / 60;
    const started = performance.now();
    updateAwareness(w);
    spent += performance.now() - started;
    steps += 1;
  }
  const perStep = spent / steps;
  console.log(`awareness: ${(perStep * 1000).toFixed(1)} us per step over ${steps} steps with 30 men (${aware.looks - looks} looks)`);
  assert.ok(perStep < 0.5, `${perStep.toFixed(3)} ms per step`);
});
