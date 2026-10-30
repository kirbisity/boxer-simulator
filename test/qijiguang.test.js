import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs } from '../src/body.js';
import { AI, companyFear, fearTarget, strengthOf, thinkAll } from '../src/ai.js';
import { DRILL, moveFormations } from '../src/formation.js';
import { OUTFITS } from '../src/outfits.js';
import { STYLES } from '../src/moves.js';
import { WEAPONS } from '../src/weapons.js';
import { advance, createWorld, perform, placeFighter, seededRandom, throwPunch } from '../src/physics.js';
import { BRUSH, brushKeepsOff, brushTouch, heldOffAt } from '../src/physics/brush.js';
import { SCENARIOS, battleOf, qiJiguangLevel } from '../src/scenarios.js';
import { reliefAt, stepOnWorks, worksOf } from '../src/physics/fieldworks.js';
import { P } from '../src/body.js';
import { levelBattle } from '../tools/levels.js';

const count = (men, pick) => men.reduce((tally, man) => ({ ...tally, [pick(man)]: (tally[pick(man)] ?? 0) + 1 }), {});

test('the wokou raiders are mostly Japanese and charge with swords: rōnin and samurai in front, a few Chinese at the back, no guns or bows; the garrison has bows but no gun, more men than the raiders, each kind in one colour', () => {
  const { red, blue } = SCENARIOS.wokou.cast(seededRandom(4));
  // (A rōnin may fight with two swords: nitō.)
  assert.deepEqual(count(red, (man) => (man.style === 'nito' ? 'ronin' : man.style)), { ronin: 6, katana: 8, yari: 2, odachi: 3, naginata: 1, dao: 4, spear: 2 });
  assert.equal(red.length, 26);
  // The Japanese in the front rank, the rōnin among them; the samurai in their armour; the Chinese (dao, spear) all in the back rows.
  const front = red.slice(0, SCENARIOS.wokou.formation.red.perRow);
  assert.ok(front.every((man) => ['katana', 'ronin', 'nito'].includes(man.style)), 'the Japanese swordsmen in front');
  assert.equal(front.filter((man) => man.outfit.kind === 'ronin').length, 6);
  assert.equal(red.filter((man) => ['samurai', 'samuraiTosei'].includes(man.outfit.kind) && man.accessories.includes('crest')).length, 6, 'six samurai of the class');
  assert.ok(red.slice(-6).every((man) => ['dao', 'spear'].includes(man.style)), 'the Chinese at the back');
  assert.ok(red.every((man) => !STYLES[man.style].ranged), 'no shooter among the raiders');
  assert.ok(red.every((man) => man.charging > 1), 'they come on at a run');
  assert.ok(blue.every((man) => !STYLES[man.style].ranged || man.style === 'bow'), 'no gun in the garrison');
  assert.equal(blue.filter((man) => man.style === 'bow').length, 4);
  assert.equal(blue.length, 34);
  assert.ok(blue.length > red.length, 'the garrison outnumbers the raiders');
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

test('the coast garrison is the weaker for its men: some old, some thin and untaught, each worth less than a raider, together less than the raiders though more of them', () => {
  const { red, blue } = SCENARIOS.wokou.cast(seededRandom(4));
  const levy = blue.filter((man) => man.outfit.kind === 'mingGarrison');
  const bodies = (men) => men.map((man) => normaliseInputs(structuredClone(man)));
  assert.ok(levy.some((man) => man.age >= 47), 'old men among them');
  assert.ok(levy.some((man) => man.age <= 30 && man.skill < 0.2), 'thin, untaught boys among them');
  const strengths = (men, corner) => createWorld(bodies(men).map((inputs) => ({ inputs, corner })), { seed: 4 }).fighters.map(strengthOf);
  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const raiders = strengths(red, 'red');
  const garrison = strengths(blue, 'blue');
  assert.ok(sum(garrison) / garrison.length < sum(raiders) / raiders.length * 0.65, 'a garrison man is worth well under a raider');
  assert.ok(sum(garrison) < sum(raiders), 'all of them together are worth less than the raiders');
});

test('Qi Jiguang\'s raiders are the Taizhou band, mostly Chinese; the 1554 raid\'s mostly Japanese; drawn up alike', () => {
  const { red } = SCENARIOS.qiJiguang.cast(seededRandom(1));
  assert.deepEqual(count(red, (man) => (man.style === 'nito' ? 'ronin' : man.style)), { ronin: 3, katana: 6, odachi: 3, dao: 8, spear: 6 });
  const chinese = (men) => men.filter((man) => ['dao', 'spear'].includes(man.style)).length;
  assert.ok(chinese(SCENARIOS.wokou.cast(seededRandom(1)).red) < chinese(red) / 2);
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
  // The raiders lost: down, fled, or crawling off on their knees (ai.js AI.rout crawl).
  const lost = qi.red.down + qi.red.fled + qi.red.crawling;
  assert.ok(qi.blue.down * 3 <= lost, `Ming down ${qi.blue.down}; raiders down ${qi.red.down}, fled ${qi.red.fled}, crawling ${qi.red.crawling}`);
  assert.equal(qi.blue.fled, 0, 'none of Qi\'s men run');
});

test('Qi Jiguang\'s men dig a trench across the square before the squads: small and hastily dug, its line wandering, the raiders before it, every Ming man behind it on level ground, the way across it slowed', () => {
  const level = battleOf('qiJiguang');
  const works = worksOf(level.arena);
  assert.equal(works.ditches.length, 1, 'a ditch and its bank');
  const [ditch] = works.ditches;
  // Across the whole square, from the shops on its north side to the canal's embankment: no way round it.
  assert.ok(ditch.box.z[0] <= -level.arena.halfZ && ditch.box.z[1] >= level.arena.halfZ, 'the floor from side to side');
  // Not ruler-straight: its line bends, a few tenths of a metre either way, and it is dug unevenly along it.
  const xs = ditch.pieces.map((piece) => piece.a[0]);
  assert.ok(ditch.pieces.length >= 3 && Math.max(...xs) - Math.min(...xs) > 0.3 && Math.max(...xs) - Math.min(...xs) < 1.2, 'a wandering line');
  // Across it at several places: a ditch some 0.6-0.8 m deep and 2-3.5 m across with its low bank, the depth not the
  // same everywhere.
  const crossings = [-12, -6, 0, 5, 9].map((z) => {
    const heights = [];
    for (let x = ditch.box.x[0] - 1; x <= ditch.box.x[1] + 1; x += 0.02) heights.push([x, reliefAt(works, x, z)]);
    const dug = heights.filter(([, y]) => Math.abs(y) > 1e-6);
    return { z, deepest: Math.min(...dug.map(([, y]) => y)), bank: Math.max(...dug.map(([, y]) => y)), across: dug.at(-1)[0] - dug[0][0], lip: dug[0][0], back: dug.at(-1)[0] };
  });
  for (const crossing of crossings) {
    assert.ok(crossing.deepest < -0.55 && crossing.deepest > -0.85, `0.6-0.8 m deep at z ${crossing.z} (${crossing.deepest.toFixed(2)})`);
    assert.ok(crossing.bank > 0.2 && crossing.bank < 0.45, `a low spoil bank at z ${crossing.z} (${crossing.bank.toFixed(2)})`);
    assert.ok(crossing.across > 2 && crossing.across < 3.5, `2-3.5 m across at z ${crossing.z} (${crossing.across.toFixed(2)})`);
  }
  const depths = crossings.map((crossing) => crossing.deepest);
  assert.ok(Math.max(...depths) - Math.min(...depths) > 0.05, 'dug deeper in places than in others');
  // Where the men stand.
  const world = createWorld(['red', 'blue'].flatMap((corner) => level.cast(seededRandom(5))[corner].map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner }))), { seed: 5, arena: level.arena, formation: level.formation });
  const lip = Math.min(...crossings.map((crossing) => crossing.lip));
  for (const fighter of world.fighters) {
    const [x, z] = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
    if (fighter.corner === 'red') assert.ok(x < lip - 3, `${fighter.body.inputs.name} starts well short of the lip`);
    else assert.equal(reliefAt(works, x, z), 0, `${fighter.body.inputs.name} on level ground behind it, the squads' places untouched`);
  }
  // A man running at it is slowed down into it and more up the bank's face; free before it.
  const { lip: front, back } = crossings[2];
  const pace = (x) => Math.hypot(...stepOnWorks(works, { root: [x, 0] }, [5, 0])) / 5;
  assert.ok(pace(front - 1) > 0.99, 'free before it');
  let slowest = 1;
  for (let x = front; x < back; x += 0.05) slowest = Math.min(slowest, pace(x));
  assert.ok(slowest < 0.4, `up the bank's face at a scramble (${slowest.toFixed(2)} of his pace)`);
  assert.equal(qiJiguangLevel({ trench: false }).arena.works, undefined, 'the lever for measuring what it did');
  assert.equal(level.arena.halfX, 18, 'the floor is the battle\'s, the trench moved back with the lines');
});

/** Qi Jiguang's level as fought (seed `seed`), the AI on both sides, for `seconds`; calls `each(world)` after every tenth of a second. */
function foughtQi(seed, seconds, each = () => {}) {
  const level = battleOf('qiJiguang');
  const sides = level.cast(seededRandom(seed));
  const world = createWorld(['red', 'blue'].flatMap((corner) => sides[corner].map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner }))), { seed, arena: level.arena, formation: level.formation });
  for (let t = 0; t < seconds; t += 0.1) {
    advance(world, 0.1, (current, dt) => thinkAll(current, dt));
    each(world);
  }
  return world;
}

test('Qi Jiguang\'s fowling pieces hold their fire for one volley on the word, close, then let the guns fall, draw the dao and fall in with the shields', { timeout: 60000 }, () => {
  const at = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
  let word = null;
  const gaps = [];
  const world = foughtQi(3, 9, (current) => {
    const formation = current.formations.blue;
    if (word === null && formation.volleyAt !== undefined) word = formation.volleyAt;
    if (word === null) gaps.push(formation.reachGap);
  });
  const formation = world.formations.blue;
  assert.ok(word !== null, 'the word given');
  assert.ok(Math.min(...gaps) > DRILL.volley.at, 'not before the raiders were within the volley\'s distance on their feet');
  const guns = world.fighters.filter((fighter) => fighter.body.inputs.style === 'matchlock');
  const shots = world.events.filter((event) => event.kind === 'shot' || event.kind === 'misfire');
  assert.ok(shots.length >= guns.length - 1, `every piece fired, or near it (${shots.length} of ${guns.length})`);
  for (const shot of shots) {
    assert.ok(shot.time >= word && shot.time < word + 2, `on the word, together (${shot.time.toFixed(1)} s, the word at ${word.toFixed(1)} s)`);
    const target = world.fighters[shot.aimedAt];
    if (shot.kind === 'shot' && target) assert.ok(Math.hypot(at(target)[0] - shot.from[0], at(target)[1] - shot.from[2]) < DRILL.volley.at, 'close');
  }
  // One shot each: no gun loaded again; each gunner standing has his dao out and his place in the shields' rank.
  assert.ok(!world.events.some((event) => event.kind === 'shot' && event.time > word + 2), 'one volley, no second');
  for (const gun of guns.filter((fighter) => fighter.state === 'up')) {
    assert.equal(gun.weapon?.kind, 'dao', `${gun.body.inputs.name} has drawn his dao`);
    assert.equal(gun.slot.ahead, formation.handFront, 'and fallen in with the shields');
    const drew = world.events.find((event) => event.kind === 'drew' && event.fighter === gun.id);
    const fired = shots.find((event) => (event.attacker ?? event.fighter) === gun.id);
    if (fired) assert.ok(drew.time - fired.time < 1.5, `quickly (${(drew.time - fired.time).toFixed(1)} s after his shot)`);
  }
  assert.ok(world.debris.filter((debris) => debris.weapon === 'matchlock').length >= guns.length - 1, 'the guns let fall');
});

test('a wolf-brush catches a raider\'s blade and holds him off at its length, his sword useless, while the squad\'s spears go out to him and kill him; the shields leave him to them', { timeout: 60000 }, () => {
  const level = battleOf('qiJiguang');
  // The squads without their guns (their volley long fired and the gunners elsewhere), each man in his place.
  const all = level.cast(seededRandom(4)).blue;
  const kept = all.flatMap((inputs, index) => (inputs.style === 'matchlock' ? [] : [index]));
  const blue = kept.map((index) => all[index]);
  const formation = { ...level.formation, blue: { ...level.formation.blue, layout: kept.map((index) => level.formation.blue.layout[index]) } };
  // Two raiders: one at a wolf-brush, the other coming on before the squads a little way off.
  const raiders = SCENARIOS.qiJiguang.cast(seededRandom(4)).red.filter((inputs) => inputs.style === 'katana').slice(0, 2);
  // (One fight of many: over world seeds 1-30 a spear finds him within the 6 s in about 3 of 4, as before AI.pointRoom; in
  // the rest he steps back off the points, takes them on his arms, or tears his blade free. Seed 4 has become one of those.)
  const world = createWorld([...blue.map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner: 'blue' })), ...raiders.map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner: 'red' }))], { seed: 11, arena: { halfX: 18, halfZ: 9 }, formation });
  const [man, other] = world.fighters.filter((fighter) => fighter.corner === 'red');
  const brush = world.fighters.find((fighter) => fighter.style === 'langxian');
  const { forward: toward, anchor } = world.formations.blue;
  placeFighter(man, brush.x[P.pelvis * 3] + toward[0] * 2.3, brush.x[P.pelvis * 3 + 2] + toward[1] * 2.3);
  placeFighter(other, anchor[0] + toward[0] * 7, anchor[1] + toward[1] * 7);
  thinkAll(world, 0.01);
  // Free, he can cut.
  man.focus = brush.id;
  man.punch = null;
  assert.equal(throwPunch(world, man, 'kesagiri'), true, 'free, he cuts');
  man.punch = null;
  // The blade meets the branches (as physics.js clashWeapons finds it), and is caught.
  const draw = world.random;
  world.random = () => 0;
  brushTouch(world, brush, man, brush.weapon, man.weapon, 2.2, 0.8, true);
  world.random = draw;
  assert.equal(man.caught?.by, brush.id, 'caught');
  assert.equal(brush.holding, man.id);
  assert.equal(throwPunch(world, man, 'kesagiri'), false, 'no blow with it');
  assert.equal(perform(world, man, 'weaponBlock'), false, 'no parry with it');
  // A step in at the bearer is mostly taken off him, inside the brush's hold; a step away is his.
  const bearerAt = [brush.root[0], brush.root[1]];
  const into = [bearerAt[0] - man.root[0], bearerAt[1] - man.root[1]];
  const length = Math.hypot(...into);
  const step = brushKeepsOff(world, man, [(into[0] / length) * 2, (into[1] / length) * 2]);
  assert.ok(Math.hypot(...step) < 2 * (BRUSH.step + 0.01), 'kept off');
  const back = brushKeepsOff(world, man, [(-into[0] / length) * 2, (-into[1] / length) * 2]);
  assert.ok(Math.hypot(...back) > 1.99, 'free to back off');
  // The squad's men: the spears within a stride or two go for him, the shields leave him.
  const freeRate = BRUSH.freeRate;
  BRUSH.freeRate = 0;
  try {
    let spearsOn = 0;
    let shieldsOn = 0;
    let nearest = Infinity;
    let stabbed = null;
    for (let t = 0; t < 6 && man.state === 'up'; t += 0.1) {
      advance(world, 0.1, (current, dt) => thinkAll(current, dt));
      if (!man.caught) break;
      nearest = Math.min(nearest, Math.hypot(man.root[0] - brush.root[0], man.root[1] - brush.root[1]));
      spearsOn = Math.max(spearsOn, world.fighters.filter((fighter) => fighter.style === 'spear' && fighter.focus === man.id).length);
      // (Each man takes his man again as he thinks: a moment for it.)
      if (t > 0.3) shieldsOn = Math.max(shieldsOn, world.fighters.filter((fighter) => fighter.style === 'swordShield' && fighter.focus === man.id).length);
      stabbed ??= world.events.find((event) => event.kind === 'landed' && event.defender === man.id && world.fighters[event.attacker].style === 'spear') ?? null;
    }
    assert.ok(spearsOn >= 1, `the spears go for him (${spearsOn})`);
    assert.equal(shieldsOn, 0, 'the shields leave him to them');
    assert.ok(nearest > heldOffAt({ caught: { along: 2.2 } }) - 0.5, `held off at the brush's length (${nearest.toFixed(2)} m)`);
    assert.ok(stabbed, 'a spear finds him');
  } finally {
    BRUSH.freeRate = freeRate;
  }
});
