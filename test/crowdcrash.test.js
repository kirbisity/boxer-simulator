import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { advance, createWorld, groundBrace, placeFighter, point } from '../src/physics.js';

// Bodies meeting in a crowd: every man a body touches is a crash, with its share of the momentum;
// what a man standing holds against it is his feet on the ground (groundBrace), nothing else.

const FIELD = { halfX: 40, halfZ: 20 };
const unskilled = (key) => ({ ...structuredClone(PRESETS[key]), style: 'unskilled' });

/** A man running flat out at men standing still at `places` ([x, z]), for `seconds`. */
function runInto(runnerKey, menKey, places, seed, seconds = 4) {
  const world = createWorld([{ inputs: structuredClone(PRESETS[runnerKey]), corner: 'red' }, ...places.map(() => ({ inputs: unskilled(menKey), corner: 'blue' }))], { seed, arena: FIELD });
  const [runner, ...men] = world.fighters;
  placeFighter(runner, -8, 0);
  places.forEach(([x, z], index) => placeFighter(men[index], x, z));
  advance(world, 0.6);
  for (let t = 0; t < seconds; t += 1 / 60) {
    runner.move = 1;
    runner.running = true;
    runner.goTo = [30, 0, 0];
    for (const man of men) man.move = 0;
    advance(world, 1 / 60);
  }
  return { world, runner, men };
}

const metBy = (world, a, b) => world.events.filter((event) => event.kind === 'bump' && ((event.attacker === a.id && event.defender === b.id) || (event.attacker === b.id && event.defender === a.id)));

test('a man running into a line where two stand a shoulder\'s width apart meets both on his shoulders, and the man behind them too', () => {
  // (Two in the front rank 0.62 m apart, his line between them: his trunk, a third of his breadth, passed between theirs untouched.)
  for (const seed of [100, 101]) {
    const { world, runner, men } = runInto('heavy', 'amateur', [[0, -0.31], [0, 0.31], [0.9, 0]], seed);
    const [left, right, behind] = men;
    assert.ok(metBy(world, runner, left).length >= 1, `seed ${seed}: he met the man on his right`);
    assert.ok(metBy(world, runner, right).length >= 1, `seed ${seed}: he met the man on his left`);
    // The man behind is met: by the runner, or by a front-rank man driven back into him.
    assert.ok(world.events.some((event) => event.kind === 'bump' && (event.attacker === behind.id || event.defender === behind.id) && event.impulse > 0), `seed ${seed}: the second rank was met`);
  }
});

test('what a man holds with his feet: most front-on behind a set shield, less without it, less side-on, nothing mid-blow or running', () => {
  const world = createWorld([{ inputs: structuredClone(PRESETS.hoplomachus), corner: 'red' }, { inputs: structuredClone(PRESETS.amateur), corner: 'blue' }], { seed: 3, arena: FIELD });
  const [man] = world.fighters;
  placeFighter(world.fighters[1], 6, 0);
  advance(world, 0.6);
  const back = [-Math.cos(man.yaw), 0, Math.sin(man.yaw)];
  const side = [Math.sin(man.yaw), 0, Math.cos(man.yaw)];
  const standing = groundBrace(man, back);
  const set = groundBrace(man, back, true);
  const sideOn = groundBrace(man, side);
  // Grip times g times the shove's tenth of a second: ~0.7 m/s standing, twice that on a set shield.
  assert.ok(standing > 0.5 && standing < 0.8, `standing ${standing.toFixed(2)} m/s`);
  assert.ok(Math.abs(set - 2 * standing) < 1e-9, `set shield ${set.toFixed(2)} m/s`);
  assert.ok(sideOn < 0.5 * standing && sideOn > 0, `side-on ${sideOn.toFixed(2)} m/s`);
  // Reeling already, he has less.
  man.knock = [0.5 * 2.1, 0, 0];
  assert.ok(groundBrace(man, back) < 0.6 * standing, 'reeling');
  man.knock = [0, 0, 0];
  man.punch = { t: 0.05, spec: { extendUntil: 0.3 } };
  assert.equal(groundBrace(man, back), 0, 'mid-blow');
  man.punch = null;
  man.feet.l.lifted = true;
  assert.equal(groundBrace(man, back), 0, 'a foot in the air');
});

test('a man walking into a man set behind his shield does not put him over; running flat out into a man standing unbraced does', () => {
  for (const seed of [200, 201]) {
    const walk = createWorld([{ inputs: structuredClone(PRESETS.heavy), corner: 'red' }, { inputs: unskilled('hoplomachus'), corner: 'blue' }], { seed, arena: FIELD });
    const [walker, wall] = walk.fighters;
    placeFighter(walker, -3, 0);
    placeFighter(wall, 0, 0);
    advance(walk, 0.6);
    for (let t = 0; t < 3; t += 1 / 60) {
      walker.move = 1;
      walker.goTo = [30, 0, 0];
      wall.move = 0;
      wall.shieldPose = 'wall';
      advance(walk, 1 / 60);
    }
    assert.ok(walk.events.some((event) => (event.kind === 'bump' || event.kind === 'crash') && (event.defender === wall.id || event.attacker === wall.id)), `seed ${seed}: they met`);
    assert.ok(!walk.events.some((event) => event.kind === 'fell' && event.fighter === wall.id), `seed ${seed}: the shield man stays up`);
    const { world, men } = runInto('heavy', 'amateur', [[0, 0]], seed, 3);
    assert.ok(world.events.some((event) => event.kind === 'fell' && event.fighter === men[0].id), `seed ${seed}: the man standing went over`);
  }
});

/** A knight's horse held at `speed` m/s straight at a man standing `ahead` m in front of it. */
function rideAt(speed, ahead, seed) {
  const world = createWorld([{ inputs: { ...structuredClone(PRESETS.knight), mounted: true }, corner: 'red' }, { inputs: unskilled('street'), corner: 'blue' }], { seed, arena: { halfX: 30, halfZ: 20 } });
  const [knight, man] = world.fighters;
  const horse = world.horses[0];
  placeFighter(man, horse.at[0] + ahead, 0);
  for (let t = 0; t < ahead / speed + 3; t += 1 / 60) {
    horse.goal = { heading: 0, speed };
    horse.goalAt = world.time + 1;
    knight.cooldown = 1;
    advance(world, 1 / 60, () => {
      man.move = 0;
    });
  }
  return world.events.filter((event) => event.kind === 'trampled' && event.fighter === man.id);
}

test('a horse at a canter bowls a man over; at a walk it shoves him and he keeps his feet', () => {
  const canter = rideAt(6, 12, 4000);
  assert.ok(canter.some((event) => event.fell), `cantering: flung at ${Math.max(...canter.map((event) => event.dv)).toFixed(1)} m/s`);
  const walk = rideAt(1.6, 4, 4000);
  assert.ok(walk.length > 0, 'the walking horse met him');
  assert.ok(!walk.some((event) => event.fell), `walking: shoved at ${Math.max(...walk.map((event) => event.dv)).toFixed(1)} m/s`);
});
