// Story mode's Korea battles (src/story/battles/02-05): each builds a world for a life (the hero and three comrades),
// runs twenty seconds headless without error, and puts the hero at his slot and his comrades beside him; the walls are
// works the bodies stand on and climb (src/story/ground/walls.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld } from '../src/physics.js';
import { climateOf } from '../src/physics/heat.js';
import { reliefAt, worksOf } from '../src/physics/fieldworks.js';
import { wallWorks } from '../src/story/ground/walls.js';
import { wokouBattle as wokou } from '../src/story/battles/02-wokou.js';
import { pyongyangBattle as pyongyang, PYONGYANG_1593 } from '../src/story/battles/03-pyongyang.js';
import { ARTILLERY } from '../src/physics/artillery.js';
import { BATTLE_END } from '../src/battleend.js';
import { DRILL } from '../src/formation.js';
import { byeokjegwanBattle as byeokjegwan } from '../src/story/battles/04-byeokjegwan.js';
import { ulsanBattle as ulsan } from '../src/story/battles/05-ulsan.js';

const BATTLES = [wokou, pyongyang, byeokjegwan, ulsan];

const man = (id, en, bond) => ({ id, name: { zh: en, en }, born: 1566, inputs: { ...PRESETS.mingSpear }, rank: 'soldier', alive: true, bond, diedAt: null });
/** A life as the engine keeps one: the hero, three comrades (one dead, who must not be placed), his rank and place. */
const lifeOf = (n, rank = 'soldier', place = 'front') => ({
  hero: { name: { zh: '英', en: 'The Hero' }, born: 1568, inputs: { ...PRESETS.mingSpear } },
  chapter: n, rank, place,
  comrades: [man('chen', 'Chen', 5), man('wang', 'Wang', 3), man('li', 'Li', 4), { ...man('zhou', 'Zhou', 9), alive: false, diedAt: { chapter: 1, how: 'killed' } }],
  flags: {}, attempts: {}, lives: 1, record: [],
});
const at = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];

for (const battle of BATTLES) {
  test(`${battle.id}: the hero at his slot, his living comrades beside him, 60-90 men, 20 s headless`, () => {
    const life = lifeOf(battle.n);
    const setup = battle.setup(life, 3);
    assert.ok(setup.fighters.length >= 60 && setup.fighters.length <= 90, `${setup.fighters.length} men`);
    const world = createWorld(setup.fighters, setup.options);
    const hero = world.fighters[setup.player];
    assert.equal(hero.body.inputs.name, 'The Hero');
    assert.equal(hero.body.inputs.age, battle.year - 1568);
    assert.ok(Math.hypot(at(hero)[0] - setup.slot.x, at(hero)[1] - setup.slot.z) < 0.5, 'the hero stands at his slot');
    assert.deepEqual(Object.keys(setup.comrades).sort(), ['chen', 'li', 'wang'], 'the three living comrades, not the dead one');
    for (const [id, index] of Object.entries(setup.comrades)) {
      const comrade = world.fighters[index];
      assert.equal(comrade.corner, hero.corner);
      assert.equal(comrade.body.inputs.name, life.comrades.find((c) => c.id === id).name.en);
      const apart = Math.hypot(at(comrade)[0] - at(hero)[0], at(comrade)[1] - at(hero)[1]);
      assert.ok(apart < 3.5, `${id} beside him (${apart.toFixed(2)} m)`);
    }
    // The closest bond the nearest.
    const apart = (id) => Math.hypot(...at(world.fighters[setup.comrades[id]]).map((v, k) => v - at(hero)[k]));
    assert.ok(apart('chen') <= apart('wang') + 1e-9);
    // On fieldworks with relief every man stands on the ground where he is put (not inside a rampart or a hill).
    const works = worksOf(world.arena);
    for (const fighter of world.fighters) {
      if (fighter.mount) continue;
      const ground = works ? reliefAt(works, ...at(fighter)) : 0;
      assert.ok(Math.abs((fighter.lift ?? 0) - ground) < 0.05, `${fighter.id} on the ground (${(fighter.lift ?? 0).toFixed(2)} vs ${ground.toFixed(2)})`);
    }
    for (let t = 0; t < 20; t += 0.1) advance(world, 0.1, (current, dt) => thinkAll(current, dt));
    for (const fighter of world.fighters) assert.ok(fighter.x.every(Number.isFinite), `${fighter.id} finite`);
  });
}

test('a squad leader and an officer stand behind the front; a man in the second row behind a man in the front', () => {
  for (const battle of BATTLES) {
    const sign = battle.id === 'wokou' ? 1 : -1;
    const depth = (rank, place) => sign * battle.setup(lifeOf(battle.n, rank, place), 1).slot.x;
    assert.ok(depth('soldier', 'second') > depth('soldier', 'front'), `${battle.id}: second behind front`);
    assert.ok(depth('officer', 'front') > depth('soldier', 'front'), `${battle.id}: the officer behind`);
    assert.ok(depth('squadLeader', 'front') > depth('soldier', 'front'), `${battle.id}: the squad leader behind`);
  }
});

test('the winter battles are fought in their own cold air', () => {
  assert.ok(climateOf('ulsan').air <= 2);
  assert.ok(climateOf('pyongyang').air < 0);
  assert.equal(ulsan.setup(lifeOf(5), 1).options.place, 'ulsan');
});

test('a wall: its face kept by a stone line, open only at its ladders, the walk at its height', () => {
  const { works, walk } = wallWorks({ x: 0, z: [-9, 9], height: 4.5, ladders: [-6, 0, 6] });
  const compiled = worksOf({ works });
  assert.equal(compiled.walls.length, 4, 'three ladders cut the line into four');
  assert.ok(Math.abs(reliefAt(compiled, (walk[0] + walk[1]) / 2, 3) - 4.5) < 1e-9, 'the walk at 4.5 m');
  assert.equal(reliefAt(compiled, -0.5, 3), 0, 'the ground before it');
  assert.equal(works.ladders.length, 3);
});

test('men at the foot of a ladder climb it to the walk', () => {
  const { works, walk } = wallWorks({ x: 0, z: [-9, 9], height: 4.5, ladders: [0] });
  // Three spearmen below, four men holding the walk (a drill holds them at their places: formation.js, four or more),
  // along it away from the ladder's head (at its head they shove it off: test/climbing.test.js).
  // (Relentless, so that they go in at once: three men alone below a wall hesitate, as men do: ai.js AI.hesitation.)
  const red = [0, 1, 2].map(() => ({ inputs: { ...PRESETS.mingSpear, relentless: true }, corner: 'red' }));
  const blue = [0, 1, 2, 3].map(() => ({ inputs: { ...PRESETS.mingSpear }, corner: 'blue' }));
  const formation = { red: { front: 0, layout: [[1.5, 1], [2.5, -1], [3.5, 0]] }, blue: { front: 0, layout: [-5, -3, 3, 5].map((z) => [walk[0] + 1.5, z]), drill: { advance: false } } };
  const world = createWorld([...red, ...blue], { seed: 1, arena: { halfX: 10, halfZ: 9, works }, formation });
  let highest = 0;
  // (The ladder lies at the foot first: raised, then climbed.)
  for (let t = 0; t < 40; t += 0.1) {
    advance(world, 0.1, (current, dt) => thinkAll(current, dt));
    for (const fighter of world.fighters.slice(0, 3)) highest = Math.max(highest, fighter.lift ?? 0);
  }
  assert.ok(highest > 3, `climbed to ${highest.toFixed(2)} m`);
  // And none went through the wall's line but at the ladder.
  for (const fighter of world.fighters.slice(0, 3)) {
    const [x, z] = at(fighter);
    assert.ok(x < 0.05 || Math.abs(z) < 0.9 || x > walk[0] - 0.1, `red ${fighter.id} at (${x.toFixed(2)}, ${z.toFixed(2)})`);
  }
});

test('pyongyang: the columns form up just out of the walls\' aimed shot, the guns behind them in reach, the time the march\'s and the storm\'s', () => {
  const { approach, wall } = PYONGYANG_1593;
  // Just beyond a matchlock's ~100 m aimed fire, and no further than the crossing under it needs.
  assert.ok(approach.formUp > 100 && approach.formUp <= 150, `${approach.formUp} m`);
  const setup = pyongyang.setup(lifeOf(3), 3);
  const fromWall = (x) => wall.x - x;
  // Red's men's x (its layout is [-x, -z]: koreaLayout), the guns' crews apart (they stand at their guns).
  const crews = new Set(setup.options.artillery.flatMap((gun) => gun.crew));
  const xs = setup.options.formation.red.layout.map((at) => -at[0]).filter((_, index) => !crews.has(index));
  // The first row at the form-up line.
  assert.ok(Math.abs(fromWall(Math.max(...xs)) - approach.formUp) < 1e-9, `the front at ${fromWall(Math.max(...xs))} m`);
  // The guns behind every man of the columns and their fowling pieces, within their pieces' reach of the walk, out of its aimed shot.
  for (const gun of setup.options.artillery) {
    assert.ok(gun.at[0] < Math.min(...xs), `${gun.kind} behind the columns (${gun.at[0]} vs ${Math.min(...xs)})`);
    assert.ok(fromWall(gun.at[0]) > 100 && fromWall(gun.at[0]) < ARTILLERY.pieces[gun.kind].range, `${gun.kind} at ${fromWall(gun.at[0])} m`);
  }
  const march = Math.round(approach.formUp / DRILL.pace);
  assert.equal(pyongyang.seconds, 180 + march);
  assert.equal(setup.options.timeLimit, BATTLE_END.timeLimit + march);
  assert.equal(setup.storm, true);
});
