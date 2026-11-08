import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { WORLD } from '../src/physics/config.js';
import { createWorld } from '../src/physics.js';
import { reliefAt, softAt, worksOf } from '../src/physics/fieldworks.js';
import { BATTLE_LIAODONG as liaodong } from '../src/story/battles/06-liaodong.js';
import { BATTLE_SARHU as sarhu } from '../src/story/battles/07-sarhu.js';
import { BATTLE_HUNRIVER as hunriver } from '../src/story/battles/08-hunriver.js';
import { storyNorthBattle, storyNorthLife } from '../tools/storynorth.js';

const BATTLES = [liaodong, sarhu, hunriver];
const at = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const sides = (setup) => ({ red: setup.fighters.filter((entry) => entry.corner === 'red').length, blue: setup.fighters.filter((entry) => entry.corner === 'blue').length });

test('each north battle: the contract shape, its numbers at the stated ratio, every name both ways', () => {
  const expected = { liaodong: [49, 40], sarhu: [21, 68], hunriver: [18, 68] };
  for (const battle of BATTLES) {
    assert.ok(battle.id && battle.n && battle.year && battle.title.zh && battle.title.en && battle.seconds > 0);
    const setup = battle.setup(storyNorthLife(battle), 3);
    const { red, blue } = sides(setup);
    assert.deepEqual([red, blue], expected[battle.id], `${battle.id}: Ming and Jin`);
    assert.ok(red + blue >= 60 && red + blue <= 90, `${battle.id}: ~60-90 men (${red + blue})`);
    // Red first, then blue: the formation's layout is the side's men in order.
    assert.ok(setup.fighters.slice(0, red).every((entry) => entry.corner === 'red'));
    assert.equal(setup.options.formation.red.layout.length, red);
    assert.equal(setup.options.formation.blue.layout.length, blue);
    for (let index = 0; index < setup.fighters.length; index += 1) assert.ok(setup.names[index]?.zh && setup.names[index]?.en, `${battle.id}: name ${index}`);
    assert.ok(WORLD.heat.climates[setup.options.climate], `${battle.id}: its season's air`);
  }
});

test('the hero stands where his rank puts him, his living comrades beside him, a dead one nowhere', () => {
  for (const battle of BATTLES) {
    for (const rank of ['soldier', 'squadLeader', 'officer']) {
      const life = storyNorthLife(battle, { rank, place: 'front' });
      life.comrades[2].alive = false;
      const setup = battle.setup(life, 2);
      const hero = setup.fighters[setup.player];
      assert.equal(hero.corner, 'red');
      assert.equal(hero.inputs.name, 'Wu Er');
      // His rank's kit, or the better one his place in the line was issued (korea.js koreaKitFor).
      const kits = ['mingGarrison', 'mingBrigandine', 'mingElite'];
      assert.ok(kits.indexOf(hero.inputs.outfit.kind) >= kits.indexOf(life.kit), `${battle.id} ${rank}: at least his rank's kit`);
      assert.equal(hero.inputs.age, battle.year - 1568, 'his age that year');
      assert.deepEqual(Object.keys(setup.comrades).sort(), ['a', 'b'], 'the living two placed, the dead one not');
      for (const [id, index] of Object.entries(setup.comrades)) {
        assert.equal(setup.fighters[index].inputs.name, `Comrade ${id}`);
        assert.equal(setup.fighters[index].corner, 'red');
      }
      const world = createWorld(setup.fighters, setup.options);
      // He starts in his slot (a man's place is jittered by the order's `loose`), the slot is the one his rank has.
      assert.ok(apart(at(world.fighters[setup.player]), [setup.slot.x, setup.slot.z]) < 1, `${battle.id} ${rank}: in his slot`);
      const near = Object.values(setup.comrades).map((index) => apart(at(world.fighters[index]), at(world.fighters[setup.player])));
      assert.ok(Math.max(...near) < 4, `${battle.id} ${rank}: comrades beside him (${near.map((d) => d.toFixed(1))})`);
      assert.ok(setup.squad.length > 0 && !setup.squad.includes(setup.player), 'his unit');
    }
  }
});

test('the parts of the line: a soldier in the front of a file, a squad leader at its head, an officer behind; history\'s men kept', () => {
  const patrol = (rank, place) => {
    const setup = liaodong.setup(storyNorthLife(liaodong, { rank, place }), 1);
    return setup.slot.x;
  };
  // The patrol faces +x: the front rank's x is the largest, the squad's leader behind it, the 哨长 behind the leaders.
  assert.ok(patrol('soldier', 'front') > patrol('soldier', 'rear'));
  assert.ok(patrol('soldier', 'rear') > patrol('squadLeader'));
  assert.ok(patrol('squadLeader') > patrol('officer'));
  const column = sarhu.setup(storyNorthLife(sarhu, { rank: 'officer' }), 1);
  assert.equal(column.fighters[0].inputs.name, 'Liu Ting');
  assert.ok(column.fighters.some((entry) => entry.inputs.name === 'Hong Taiji') && column.fighters.some((entry) => entry.inputs.name === 'Daišan'));
  assert.ok(column.options.formation.blue.ambush, 'the Jin lie hidden on the heights');
  const camp = hunriver.setup(storyNorthLife(hunriver, { rank: 'officer' }), 1);
  for (const name of ['Qi Jin', 'Tong Zhongkui', 'Chen Ce']) assert.ok(camp.fighters.some((entry) => entry.inputs.name === name), name);
  assert.ok(!['Qi Jin', 'Tong Zhongkui', 'Chen Ce'].includes(camp.fighters[camp.player].inputs.name), 'the hero takes no historical man\'s place');
  // An officer inside the camp's palisade, on its main face.
  assert.ok(Math.abs(camp.slot.x) < 7.5 && Math.abs(camp.slot.z) < 7.5 && camp.slot.x > 0);
});

test('the ground: the rise and stream on the frontier, the valley under Abdali, the camp on a plain field', () => {
  const works = (battle) => worksOf(battle.setup(storyNorthLife(battle), 1).options.arena);
  const frontier = works(liaodong);
  assert.ok(reliefAt(frontier, 20, 0) > 2 && reliefAt(frontier, -10, 0) === 0, 'the raiders on the rise, the patrol on the flat');
  assert.ok(softAt(frontier, 2, 0) && !softAt(frontier, -6, 0), 'the stream between them');
  const valley = works(sarhu);
  assert.ok(reliefAt(valley, 15, 0) > 4 && reliefAt(valley, -20, 0) > 3 && reliefAt(valley, -3, 0) === 0, 'the column on the valley floor between the heights');
  assert.equal(works(hunriver), null, 'no works: no carts, trench or palisade, a plain field');
});

test('each north battle runs 20 s headless with the hero AI-driven, nobody lost off the floor', () => {
  for (const battle of BATTLES) {
    const { world, setup } = storyNorthBattle(battle, storyNorthLife(battle), { seed: 1, seconds: 20 });
    assert.ok(world.time >= 19.9, `${battle.id}: ran`);
    assert.ok(world.climate.air === WORLD.heat.climates[setup.options.climate].air, `${battle.id}: in its season's air`);
    for (const fighter of world.fighters) {
      const [x, z] = at(fighter);
      assert.ok(Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) <= world.arena.halfX + 1 && Math.abs(z) <= world.arena.halfZ + 1, `${battle.id}: ${fighter.body.inputs.name} on the field`);
    }
  }
});
