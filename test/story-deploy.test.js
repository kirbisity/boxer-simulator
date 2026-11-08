// Story mode's later battles, for a man of rank: drawing up his men (src/story/deploy.js, the battles' `deploy`, the runner's
// deploy phase), the coat his grade is issued (src/story/ranks.js `kit`), a place on horse and a loose horse taken
// (src/story/battles/north.js northDressed, src/story/remount.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { createWorld, placeFighter } from '../src/physics.js';
import { doAction } from '../src/control.js';
import { unhorse } from '../src/physics/mounted.js';
import { WORLD } from '../src/physics/config.js';
import { STORY_RANKS, storyKitOf } from '../src/story/ranks.js';
import { storyApplyEffects, storyEnterChapter, storyHeroInputs, storyNewLife } from '../src/story/life.js';
import { storyDeployOffer, storyDeployPostsIn, storyDeployResolve } from '../src/story/deploy.js';
import { createChapterRun, storyAnswer, storyBattleSetup, storyCurrent, storyDeploy } from '../src/story/runner.js';
import { storyLooseHorse, STORY_REMOUNT } from '../src/story/remount.js';
import { BATTLE_LIAODONG as liaodong, LIAODONG, liaodongSquads } from '../src/story/battles/06-liaodong.js';
import { BATTLE_SARHU as sarhu, SARHU1619 } from '../src/story/battles/07-sarhu.js';
import { BATTLE_HUNRIVER as hunriver, HUNRIVER } from '../src/story/battles/08-hunriver.js';
import { CHAPTERS, COMRADES, STORY_FAMILY, STORY_HERO } from '../src/story/chapters/index.js';
import { STORY_BATTLES } from '../src/story/battles/index.js';
import { storyNorthLife } from '../tools/storynorth.js';

const graded = (battle, grade) => {
  const scope = STORY_RANKS.find((rank) => rank.id === grade).scope;
  return { ...storyNorthLife(battle, { rank: scope }), grade };
};
const minApart = (places) => {
  let min = Infinity;
  for (let i = 0; i < places.length; i += 1) for (let j = i + 1; j < places.length; j += 1) min = Math.min(min, Math.hypot(places[i][0] - places[j][0], places[i][1] - places[j][1]));
  return min;
};
const heroAt = (world, setup) => world.fighters[setup.player];

test('the deploy screen is a man of rank\'s: none below the 哨长 at Liaodong; at Sarhu the post an officer\'s, the order of march a 把总\'s', () => {
  for (const grade of ['bing', 'jiazhang', 'duizhang']) assert.equal(storyDeployOffer(liaodong, graded(liaodong, grade)), null, grade);
  const chief = storyDeployOffer(liaodong, graded(liaodong, 'shaozhang'));
  assert.deepEqual(chief.formations.map((option) => option.id), ['line', 'support', 'square']);
  assert.deepEqual(chief.defaults, { formation: 'line', post: 'chief' });
  assert.equal(storyDeployOffer(sarhu, graded(sarhu, 'shaozhang')), null);
  const officer = storyDeployOffer(sarhu, graded(sarhu, 'shaoguan'));
  assert.equal(officer.formations, null, 'the column\'s order is not his');
  assert.equal(officer.ordered.id, 'file', 'he is told it: in file, as Liu Ting had it');
  assert.deepEqual(officer.posts.map((option) => option.id), ['head', 'middle', 'tail']);
  assert.ok(storyDeployOffer(sarhu, graded(sarhu, 'bazong')).formations);
  // Every option named and noted both ways.
  for (const battle of [liaodong, sarhu]) {
    for (const option of [...battle.deploy.formations.options, ...battle.deploy.posts.options]) assert.ok(option.name.zh && option.name.en && option.note.zh && option.note.en, `${battle.id} ${option.id}`);
  }
});

test('a choice is read only where it is his and holds; the rest is the battle\'s defaults', () => {
  const chief = graded(liaodong, 'shaozhang');
  assert.deepEqual(storyDeployResolve(liaodong, chief, null), { formation: 'line', post: 'chief' });
  assert.deepEqual(storyDeployResolve(liaodong, chief, { formation: 'square', post: 'right' }), { formation: 'square', post: 'right' });
  // The second line is only in the formation that has one.
  assert.deepEqual(storyDeployResolve(liaodong, chief, { formation: 'line', post: 'second' }), { formation: 'line', post: 'chief' });
  assert.deepEqual(storyDeployPostsIn(liaodong.deploy.posts, 'support').map((post) => post.id), ['chief', 'right', 'left', 'second']);
  assert.deepEqual(storyDeployResolve(liaodong, chief, { formation: 'wedge' }), { formation: 'line', post: 'chief' });
  // A squad leader's pick is nobody's: the patrol stands as history had it, he where his rank stands him.
  assert.deepEqual(storyDeployResolve(liaodong, graded(liaodong, 'duizhang'), { formation: 'square', post: 'right' }), { formation: 'line', post: null });
  // An officer below the 把总 picks his post, not the column's order.
  assert.deepEqual(storyDeployResolve(sarhu, graded(sarhu, 'shaoguan'), { formation: 'closed', post: 'tail' }), { formation: 'file', post: 'tail' });
});

test('the runner: the deploy phase after the before-cards, where offered; his choice builds the battle; none for a soldier', () => {
  const life = storyNewLife(null, { seed: 5, family: STORY_FAMILY, hero: STORY_HERO });
  for (const chapter of CHAPTERS.filter((each) => each.n < 6)) storyEnterChapter(life, chapter, { comrades: COMRADES });
  storyApplyEffects(life, { rank: 'shaozhang' });
  const run = createChapterRun(life, CHAPTERS.find((each) => each.n === 6), { battles: STORY_BATTLES, comrades: COMRADES });
  let current = storyCurrent(run);
  for (let guard = 0; current.kind === 'card' && guard < 50; guard += 1) current = storyAnswer(run, 1);
  assert.equal(current.kind, 'deploy');
  assert.equal(current.offer.defaults.formation, 'line');
  current = storyDeploy(run, { formation: 'support', post: 'second' });
  assert.equal(current.kind, 'battle');
  assert.deepEqual(run.deploy, { formation: 'support', post: 'second' });
  const setup = storyBattleSetup(run, 3);
  assert.deepEqual(setup.deploy, { formation: 'support', post: 'second' });

  const soldier = storyNewLife(null, { seed: 5, family: STORY_FAMILY, hero: STORY_HERO });
  for (const chapter of CHAPTERS.filter((each) => each.n < 6)) storyEnterChapter(soldier, chapter, { comrades: COMRADES });
  const plain = createChapterRun(soldier, CHAPTERS.find((each) => each.n === 6), { battles: STORY_BATTLES, comrades: COMRADES });
  let now = storyCurrent(plain);
  for (let guard = 0; now.kind === 'card' && guard < 50; guard += 1) now = storyAnswer(plain, 1);
  assert.equal(now.kind, 'battle', 'a soldier goes straight to the battle');
});

test('Liaodong\'s formations: the same 49 men, no man in another\'s place, the line as it always stood; the posts where they say', () => {
  const life = graded(liaodong, 'shaozhang');
  const plain = liaodong.setup(storyNorthLife(liaodong, { rank: 'squadLeader' }), 4);
  const line = liaodong.setup(storyNorthLife(liaodong, { rank: 'squadLeader' }), 4, { deploy: { formation: 'line' } });
  assert.deepEqual(line.options.formation.red.layout, plain.options.formation.red.layout, 'the default is the patrol as it stood');
  const floor = minApart(plain.options.formation.red.layout);
  for (const formation of ['line', 'support', 'square']) {
    const setup = liaodong.setup(life, 4, { deploy: { formation } });
    const red = setup.fighters.filter((entry) => entry.corner === 'red');
    assert.equal(red.length, 49, formation);
    assert.ok(minApart(setup.options.formation.red.layout) >= floor - 1e-9, `${formation}: no closer than the squad's own spacing`);
    // Built and stood up: every man in his place.
    const world = createWorld(setup.fighters, setup.options);
    assert.ok(world.fighters.every((fighter) => Number.isFinite(fighter.x[P.pelvis * 3])));
  }
  const { squads } = liaodongSquads('support');
  // The second line in the forward squads' files, behind them by a squad's depth and the gap.
  assert.deepEqual(squads.slice(2).map((squad) => squad.at[1]), squads.slice(0, 2).map((squad) => squad.at[1]));
  assert.ok(squads[0].at[0] - squads[2].at[0] > LIAODONG.supportGap);
  // The square's four faces, the 哨长 in its middle.
  const square = liaodongSquads('square');
  assert.deepEqual(square.squads.map((squad) => squad.face), [[0, -1], [1, 0], [0, 1], [-1, 0]]);
  // His post: the right squad is the one furthest to the line's right (+z facing +x), the left the furthest left.
  for (const formation of ['line', 'support', 'square']) {
    const right = liaodong.setup(life, 4, { deploy: { formation, post: 'right' } }).slot;
    const left = liaodong.setup(life, 4, { deploy: { formation, post: 'left' } }).slot;
    const chief = liaodong.setup(life, 4, { deploy: { formation, post: 'chief' } }).slot;
    assert.ok(right.z > chief.z && left.z < chief.z, `${formation}: right of the middle and left of it`);
  }
  const second = liaodong.setup(life, 4, { deploy: { formation: 'support', post: 'second' } }).slot;
  const forward = liaodong.setup(life, 4, { deploy: { formation: 'support', post: 'left' } }).slot;
  assert.ok(second.x < forward.x, 'the second line behind the first');
});

test('Sarhu: the closed column four abreast on the valley floor and half as long; at the head an officer rides a household horse', () => {
  const life = graded(sarhu, 'bazong');
  const span = (setup) => {
    const foot = setup.options.formation.red.layout.filter((place, index) => !setup.fighters[index].inputs.mounted);
    return Math.max(...foot.map(([, z]) => z)) - Math.min(...foot.map(([, z]) => z));
  };
  const file = sarhu.setup(life, 2, { deploy: { formation: 'file' } });
  const closed = sarhu.setup(life, 2, { deploy: { formation: 'closed' } });
  assert.ok(span(closed) < span(file) * 0.6, `closed ${span(closed)} m against ${span(file)} m`);
  // (Red's layout is the world mirrored: x = -back.)
  for (const [back] of closed.options.formation.red.layout) assert.ok(-back > SARHU1619.hillside.from && -back < SARHU1619.ridge.from);
  const plainWorld = createWorld(file.fighters, file.options);
  const head = sarhu.setup(life, 2, { deploy: { post: 'head' } });
  const world = createWorld(head.fighters, head.options);
  const hero = heroAt(world, head);
  assert.ok(hero.mount, 'he rides');
  assert.equal(hero.body.inputs.outfit.kind, 'mingElite', 'in his own coat');
  assert.equal(world.horses.length, plainWorld.horses.length, 'the household\'s horses, not one more');
  // A comrade put in a rider's place rides too, in the rider's harness where his own coat is no rider's.
  for (const index of Object.values(head.comrades)) {
    if (!head.fighters[index].inputs.mounted) continue;
    assert.ok(world.fighters[index].mount, 'a comrade in a rider\'s place rides');
  }
  // In the middle or the tail he marches.
  for (const post of ['middle', 'tail']) {
    const afoot = sarhu.setup(life, 2, { deploy: { post } });
    assert.ok(!heroAt(createWorld(afoot.fighters, afoot.options), afoot).mount, post);
  }
});

test('the Hun River: the camp\'s order a 把总\'s, the face an officer\'s; the defaults the camp as it stood', () => {
  assert.equal(storyDeployOffer(hunriver, graded(hunriver, 'shaozhang')), null);
  const officer = storyDeployOffer(hunriver, graded(hunriver, 'shaoguan'));
  assert.equal(officer.formations, null);
  assert.equal(officer.ordered.id, 'carts');
  assert.deepEqual(officer.posts.map((option) => option.id), ['main', 'rear', 'side', 'reserve']);
  const commander = storyDeployOffer(hunriver, graded(hunriver, 'bazong'));
  assert.deepEqual(commander.formations.map((option) => option.id), ['carts', 'square', 'reserve']);
  assert.deepEqual(commander.defaults, { formation: 'carts', post: 'main' });
  for (const option of [...hunriver.deploy.formations.options, ...hunriver.deploy.posts.options]) assert.ok(option.name.zh && option.name.en && option.note.zh && option.note.en, option.id);
  // The reserve's post only with a reserve.
  assert.deepEqual(storyDeployResolve(hunriver, graded(hunriver, 'bazong'), { formation: 'square', post: 'reserve' }), { formation: 'square', post: 'main' });
  assert.deepEqual(storyDeployResolve(hunriver, graded(hunriver, 'shaoguan'), { formation: 'reserve', post: 'rear' }), { formation: 'carts', post: 'rear' });

  // The defaults, chosen or not, build the camp exactly as it stood before there was a choice (every rank's).
  const strip = ({ deploy, ...setup }) => setup;
  for (const rank of ['soldier', 'squadLeader', 'officer']) {
    const plain = hunriver.setup(storyNorthLife(hunriver, { rank }), 3);
    assert.deepEqual(strip(hunriver.setup(storyNorthLife(hunriver, { rank }), 3, { deploy: { formation: 'carts', post: 'main' } })), strip(plain), rank);
  }
  const life = graded(hunriver, 'bazong');
  const plain = hunriver.setup(life, 3);
  assert.deepEqual(strip(hunriver.setup(life, 3, { deploy: { formation: 'carts', post: 'main' } })), strip(plain));
  assert.deepEqual(plain.options.formation.red.layout.slice(0, HUNRIVER.camp.length), HUNRIVER.camp.map(([, , , x, z]) => [-x, -z]), 'the camp\'s own places');

  // Every order and face: the same 18 men and the Jin as ever, no man nearer another than the camp already stands them, built.
  const floor = minApart(plain.options.formation.red.layout);
  const jin = plain.options.formation.blue.layout;
  for (const { id: formation } of hunriver.deploy.formations.options) {
    for (const post of storyDeployPostsIn(hunriver.deploy.posts, formation).map((option) => option.id)) {
      const setup = hunriver.setup(life, 3, { deploy: { formation, post } });
      assert.equal(setup.fighters.filter((entry) => entry.corner === 'red').length, 18);
      assert.deepEqual(setup.options.formation.blue.layout, jin, 'the Jin as they stood');
      assert.deepEqual(setup.options.artillery, plain.options.artillery, 'the guns and their crews');
      assert.ok(minApart(setup.options.formation.red.layout) >= floor - 1e-9, `${formation} ${post}`);
      const world = createWorld(setup.fighters, setup.options);
      assert.ok(world.fighters.every((fighter) => Number.isFinite(fighter.x[P.pelvis * 3])));
    }
  }
  // His face: the officer's place behind the face he holds; the commanders where they stood.
  const slot = (post, formation = 'carts') => hunriver.setup(life, 3, { deploy: { formation, post } }).slot;
  assert.ok(slot('main').x > 0 && slot('rear').x < 0 && slot('side').z > 3 && Math.abs(slot('side').x) < 2);
  assert.ok(Math.hypot(slot('reserve', 'reserve').x, slot('reserve', 'reserve').z) < 3, 'the reserve\'s in the middle');
  const named = (setup) => setup.fighters.map((entry, index) => [entry.inputs.name, setup.options.formation.red.layout[index]]).filter(([name]) => ['Qi Jin', 'Tong Zhongkui', 'Chen Ce'].includes(name));
  assert.deepEqual(named(hunriver.setup(life, 3, { deploy: { formation: 'reserve', post: 'side' } })), named(plain));
  // The square: a third man on each open side; the reserve: four inside the cart lines, off every face.
  const red = (formation) => hunriver.setup(life, 3, { deploy: { formation } }).options.formation.red.layout.slice(0, 18).map(([x, z]) => [-x, -z]);
  const onSide = (places, sign) => places.filter(([x, z]) => z * sign > 6).length;
  for (const sign of [1, -1]) assert.equal(onSide(red('square'), sign), onSide(red('carts'), sign) + 1);
  const inside = (places) => places.filter(([x, z]) => Math.abs(x) < 2 && Math.abs(z) < 3).length;
  assert.equal(inside(red('reserve')) - inside(red('carts')), 4);
});

test('his coat by his grade: hemp in the file, the brigandine with a squad, the officer\'s coat from the 哨长 up', () => {
  assert.deepEqual(STORY_RANKS.map((rank) => storyKitOf({ grade: rank.id, rank: rank.scope })), ['mingGarrison', 'mingGarrison', 'mingBrigandine', 'mingElite', 'mingElite', 'mingElite']);
  const life = storyNewLife(null, { seed: 3, family: STORY_FAMILY, hero: STORY_HERO });
  storyEnterChapter(life, CHAPTERS[0], { comrades: COMRADES });
  storyApplyEffects(life, { rank: 'duizhang' });
  assert.equal(life.kit, 'mingBrigandine');
  storyApplyEffects(life, { rank: 'shaozhang' });
  assert.equal(life.rank, 'squadLeader', 'still a squad leader\'s command');
  assert.equal(life.kit, 'mingElite', 'but the officer\'s coat');
  assert.equal(storyHeroInputs(life).outfit.kind, 'mingElite');
  // Into the next chapter in it.
  storyEnterChapter(life, CHAPTERS[1], { comrades: COMRADES });
  assert.equal(life.kit, 'mingElite');
  // And into a battle: Liaodong's 哨长 at his post in it.
  const setup = liaodong.setup({ ...storyNorthLife(liaodong, { rank: 'squadLeader' }), grade: 'shaozhang', kit: life.kit }, 1);
  assert.equal(setup.fighters[setup.player].inputs.outfit.kind, 'mingElite');
});

test('a loose horse: told of within reach of a run, the control when it stands beside him; mounted, it is his', () => {
  const setup = liaodong.setup(storyNorthLife(liaodong, { rank: 'officer' }), 1);
  const world = createWorld(setup.fighters, setup.options);
  const hero = heroAt(world, setup);
  assert.equal(storyLooseHorse(world, hero), null, 'every horse has its rider');
  const rider = world.fighters.find((fighter) => fighter.mount);
  const horse = rider.mount;
  unhorse(world, rider, 'shot from the saddle (a test)', false);
  // It has run off and stands.
  horse.boltUntil = -1;
  horse.speed = 0;
  horse.goal = { heading: horse.yaw, speed: 0 };
  const near = STORY_REMOUNT.near - 2;
  placeFighter(hero, horse.at[0] - near, horse.at[1]);
  hero.yaw = 0;
  const seen = storyLooseHorse(world, hero);
  assert.equal(seen.horse, horse);
  assert.ok(!seen.ready, 'too far to mount');
  assert.ok(seen.toHorse.ahead > near - 1 && Math.abs(seen.toHorse.right) < 1, 'ahead of him as he faces');
  placeFighter(hero, horse.at[0] - STORY_REMOUNT.near - 3, horse.at[1]);
  assert.equal(storyLooseHorse(world, hero), null, 'beyond a run');
  placeFighter(hero, horse.at[0] - WORLD.mount.dismount.reach * 0.6, horse.at[1]);
  assert.ok(storyLooseHorse(world, hero).ready, 'beside it');
  assert.ok(doAction(world, hero, 'mount'), 'the horse button');
  assert.equal(hero.mount, horse);
  assert.equal(horse.corner, hero.corner, 'the Jurchen\'s horse is his now');
  assert.equal(storyLooseHorse(world, hero), null, 'nothing to tell a man in the saddle');
});
