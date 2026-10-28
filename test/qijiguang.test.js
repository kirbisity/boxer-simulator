import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs } from '../src/body.js';
import { AI, companyFear, fearTarget, thinkAll } from '../src/ai.js';
import { DRILL, moveFormations } from '../src/formation.js';
import { OUTFITS } from '../src/outfits.js';
import { STYLES } from '../src/moves.js';
import { WEAPONS } from '../src/weapons.js';
import { advance, createWorld, placeFighter, seededRandom } from '../src/physics.js';
import { SCENARIOS, qiJiguangLevel } from '../src/scenarios.js';
import { levelBattle } from '../tools/levels.js';

const count = (men, pick) => men.reduce((tally, man) => ({ ...tally, [pick(man)]: (tally[pick(man)] ?? 0) + 1 }), {});

test('the wokou raiders charge with swords: katana and ōdachi, dao and spear, no guns or bows; the garrison has no gun either, each kind in one colour', () => {
  const { red, blue } = SCENARIOS.wokou.cast(seededRandom(4));
  // (A rōnin may fight with two swords: nitō.)
  assert.deepEqual(count(red, (man) => (man.style === 'nito' ? 'ronin' : man.style)), { ronin: 3, katana: 6, odachi: 3, dao: 8, spear: 6 });
  // The Japanese in the front rank, the rōnin among them.
  const front = red.slice(0, SCENARIOS.wokou.formation.red.perRow);
  assert.ok(front.every((man) => ['katana', 'ronin', 'nito'].includes(man.style)), 'the Japanese swordsmen in front');
  assert.equal(front.filter((man) => man.outfit.kind === 'ronin').length, 3);
  assert.ok(red.every((man) => !STYLES[man.style].ranged), 'no shooter among the raiders');
  assert.ok(red.every((man) => man.charging > 1), 'they come on at a run');
  assert.ok(blue.every((man) => !STYLES[man.style].ranged), 'no shooter in the garrison');
  assert.equal(blue.length, 15);
  for (const kind of ['mingGarrison', 'mingBrigandine']) assert.equal(new Set(blue.filter((man) => man.outfit.kind === kind).map((man) => man.outfit.design)).size, 1, `${kind}: one design`);
  // The lines start well apart: open ground for the run in.
  for (const corner of ['red', 'blue']) assert.ok(SCENARIOS.wokou.formation[corner].front >= 8);
});

test("Qi Jiguang's army: Qi in the elite's lamellar with the guandao, three guards in the same, two mandarin-duck squads in the brigandine", () => {
  const { blue } = SCENARIOS.qiJiguang.cast(seededRandom(2));
  const qi = blue.find((man) => man.name === 'Qi Jiguang');
  assert.ok(qi, 'Qi Jiguang is there');
  assert.equal(qi.style, 'guandao');
  assert.equal(qi.outfit.kind, 'mingElite');
  const look = OUTFITS.mingElite.designs[qi.outfit.design];
  assert.equal(look.armor.kind, 'mingEliteLamellar');
  assert.ok(look.levelOnly, 'a level design, not dealt at random');
  const elite = blue.filter((man) => man.outfit.kind === 'mingElite');
  assert.equal(elite.length, 4, 'Qi and three guards');
  assert.ok(elite.every((man) => man.outfit.design === qi.outfit.design), 'the guards in his kit');
  const squads = blue.filter((man) => man.outfit.kind === 'mingBrigandine');
  assert.equal(squads.length, 24, 'two squads of twelve');
  assert.equal(new Set(squads.map((man) => man.outfit.design)).size, 1, 'one coat colour');
  for (const squad of [squads.slice(0, 12), squads.slice(12)]) {
    // Two shields, two wolf-brushes, four spears, three fowling pieces and the leader (Jixiao xinshu).
    assert.deepEqual(count(squad, (man) => man.style), { matchlock: 3, swordShield: 2, langxian: 2, spear: 4, dao: 1 });
  }
  // Every man has his place in the squad's array, and the army is drilled and disciplined as a whole.
  const order = SCENARIOS.qiJiguang.formation.blue;
  assert.equal(order.layout.length, blue.length);
  assert.ok(order.drill.squad && order.discipline === 1);
  assert.ok(!SCENARIOS.wokou.formation.blue.discipline, 'the garrison has none');
});

test('the raiders are the same men in both wokou levels', () => {
  for (const seed of [1, 7]) assert.deepEqual(SCENARIOS.qiJiguang.cast(seededRandom(seed)).red, SCENARIOS.wokou.cast(seededRandom(seed)).red);
  assert.deepEqual(SCENARIOS.qiJiguang.formation.red, SCENARIOS.wokou.formation.red);
  assert.equal(SCENARIOS.qiJiguang.scene, SCENARIOS.wokou.scene);
});

test('without its levers Qi Jiguang\'s level is the same men in the garrison\'s arms and order, undisciplined', () => {
  const plain = qiJiguangLevel({ morale: false, tactics: false, weapons: false });
  const { blue } = plain.cast(seededRandom(3));
  assert.ok(blue.every((man) => !['matchlock', 'langxian'].includes(man.style)));
  assert.equal(plain.formation.blue.discipline, 0);
  assert.equal(plain.formation.blue.drill, undefined);
  assert.deepEqual(count(blue, (man) => man.outfit.kind), count(SCENARIOS.qiJiguang.cast(seededRandom(3)).blue, (man) => man.outfit.kind));
});

test('the langxian is a long bamboo brush: longer and lighter for its length than any spear, wide, slow to turn', () => {
  const brush = WEAPONS.langxian;
  const total = brush.length + brush.handle;
  assert.ok(total > 4.4 && total < 5, `${total.toFixed(2)} m`);
  assert.ok(brush.mass > 3 && brush.mass < 5);
  assert.ok(brush.mass / total < WEAPONS.longSpear.mass / (WEAPONS.longSpear.length + WEAPONS.longSpear.handle));
  assert.ok(brush.radius > 5 * WEAPONS.longSpear.radius, 'the brush of branches');
  assert.ok(brush.wrist.omega < WEAPONS.longSpear.wrist.omega);
  assert.equal(STYLES.langxian.weapon, 'langxian');
});

/** A small battle of two sides of `size`, placed by hand. */
function smallBattle(size, formation = {}) {
  const man = (style) => ({ inputs: normaliseInputs({ name: 'x', sex: 'male', heightCm: 170, weightKg: 65, style, outfit: { kind: 'mingBrigandine', design: 0 } }), corner: '' });
  const entries = [...Array.from({ length: size }, () => ({ ...man('spear'), corner: 'red' })), ...Array.from({ length: size }, () => ({ ...man('spear'), corner: 'blue' }))];
  return createWorld(entries, { seed: 2, arena: { halfX: 14, halfZ: 9 }, formation });
}

test('a man alone fears more than a man among his own, and more again with his own fallen round him', () => {
  const world = smallBattle(5);
  thinkAll(world, 0.01);
  const [lone, ...rest] = world.fighters.filter((fighter) => fighter.corner === 'red');
  placeFighter(lone, -8, 6);
  rest.forEach((fighter, index) => placeFighter(fighter, -8, -4 + index * 0.9));
  const company = companyFear(world, rest[1]);
  const alone = companyFear(world, lone);
  assert.ok(alone > company, `alone ${alone.toFixed(2)} > among his own ${company.toFixed(2)}`);
  world.sides.red.fallen = [[-8, 6.5], [-7.5, 6]];
  assert.ok(companyFear(world, lone) > alone, 'his own fallen beside him');
});

test('discipline takes fear down and puts breaking off', () => {
  const world = smallBattle(5, { blue: { discipline: 1 } });
  thinkAll(world, 0.01);
  const red = world.fighters.find((fighter) => fighter.corner === 'red');
  const blue = world.fighters.find((fighter) => fighter.corner === 'blue');
  red.knockdowns = 2;
  blue.knockdowns = 2;
  const loose = fearTarget(world, red, -0.5, blue);
  const held = fearTarget(world, blue, -0.5, red);
  assert.ok(held < loose * (1 - AI.morale.discipline * 0.9), `disciplined ${held.toFixed(2)} vs ${loose.toFixed(2)}`);
});

test('a squad drawn up by its level: its fowling pieces fall back behind it as the enemy comes near, and a wounded man in front changes places with a fresh one', () => {
  const world = createWorld(SCENARIOS.qiJiguang.cast(seededRandom(5)).blue.map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner: 'blue' })).concat(SCENARIOS.wokou.cast(seededRandom(5)).red.slice(0, 4).map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner: 'red' }))), { seed: 5, arena: SCENARIOS.qiJiguang.arena, formation: SCENARIOS.qiJiguang.formation });
  const formation = world.formations.blue;
  assert.ok(formation && formation.drill.squad, 'the squads formed up');
  const guns = world.fighters.filter((fighter) => fighter.style === 'matchlock');
  const others = world.fighters.filter((fighter) => fighter.corner === 'blue' && fighter.style !== 'matchlock');
  assert.ok(Math.min(...guns.map((fighter) => fighter.slot.ahead)) > Math.max(...others.map((fighter) => fighter.slot.ahead)) - 0.1, 'the guns stand before the squads');
  // The raiders come within reach of the gun line: the guns go behind every other man.
  for (const raider of world.fighters.filter((fighter) => fighter.corner === 'red')) placeFighter(raider, 1.5, 0);
  moveFormations(world, 0.3);
  assert.ok(Math.max(...guns.map((fighter) => fighter.slot.ahead)) < Math.min(...others.map((fighter) => fighter.slot.ahead)), 'behind the squads');
  // A shield man in front, badly hurt, goes back; the man behind him in his file comes up.
  moveFormations(world, 0.01);
  const shield = world.fighters.find((fighter) => fighter.style === 'swordShield' && fighter.inFront);
  const before = shield.slot;
  formation.review = 0;
  moveFormations(world, 0.3, (fighter) => (fighter === shield ? DRILL.woundedAt + 0.1 : 0));
  assert.ok(shield.slot.ahead < before.ahead, 'the wounded man goes back a rank');
  assert.ok(world.fighters.some((fighter) => fighter.slot?.ahead === before.ahead && fighter.slot.across === before.across), 'a fresh man in his place');
});

test('fought out, the garrison loses the wokou raid and Qi Jiguang\'s army wins its own, losing far fewer than the raiders', { timeout: 120000 }, () => {
  const raid = levelBattle('wokou', { seed: 3 });
  assert.equal(raid.winner, 'red');
  const qi = levelBattle('qiJiguang', { seed: 3 });
  assert.equal(qi.winner, 'blue');
  assert.ok(qi.blue.down * 3 <= qi.red.down + qi.red.fled, `Ming down ${qi.blue.down}; raiders down ${qi.red.down}, fled ${qi.red.fled}`);
  assert.equal(qi.blue.fled, 0, 'none of Qi\'s men run');
});
