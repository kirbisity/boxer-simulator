import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs } from '../src/body.js';
import { AI, companyFear, followRate, routFear, runnersSeen, standingFear, strengthOf, thinkAll } from '../src/ai.js';
import { advance, createWorld, placeFighter } from '../src/physics.js';

const man = (corner, { style = 'spear', kind = 'mingGarrison', weightKg = 65 } = {}) => ({ inputs: normaliseInputs({ name: 'x', sex: 'male', heightCm: 170, weightKg, age: 28, style, outfit: { kind, design: 0 } }), corner });

/** Two sides of men (`red`, `blue`: lists of man() options), placed by hand afterwards. */
function battle(red, blue, formation = {}) {
  return createWorld([...red.map((options) => man('red', options)), ...blue.map((options) => man('blue', options))], { seed: 2, arena: { halfX: 14, halfZ: 9 }, formation });
}

/** Stand a side in a line across z at x, `gap` m apart. */
const line = (men, x, gap = 1) => men.forEach((fighter, index) => placeFighter(fighter, x, (index - (men.length - 1) / 2) * gap));
const side = (world, corner) => world.fighters.filter((fighter) => fighter.corner === corner);

test('a comrade breaking beside a man frightens him, the more the nearer and the more of them; behind him, hardly', () => {
  const world = battle(Array(6).fill({}), Array(6).fill({}));
  line(side(world, 'red'), -3);
  line(side(world, 'blue'), 3);
  thinkAll(world, 0.01);
  const reds = side(world, 'red');
  const me = reds[1];
  const calm = routFear(world, me);
  reds[0].panicked = true;
  thinkAll(world, 0.01);
  assert.ok(routFear(world, me) > calm + AI.rout.contagion * 0.9, `one runner beside him: ${calm.toFixed(2)} → ${routFear(world, me).toFixed(2)}`);
  assert.equal(runnersSeen(world, me), 1, 'a runner at his shoulder, in full');
  reds[2].panicked = true;
  thinkAll(world, 0.01);
  assert.equal(runnersSeen(world, me), 2, 'two: twice');
  assert.ok(runnersSeen(world, reds[5]) < 1, 'the man further down the line sees them less');
  // A runner well behind him (by his side's front) he hardly sees; the same runner as far in front of him, he does.
  reds[2].panicked = false;
  placeFighter(reds[0], -5.5, -1.5);
  thinkAll(world, 0.01);
  const behind = runnersSeen(world, me);
  placeFighter(reds[0], -0.5, -1.5);
  thinkAll(world, 0.01);
  const before = runnersSeen(world, me);
  assert.ok(behind < before * 0.5 && behind > 0, `behind him ${behind.toFixed(2)}, before him ${before.toFixed(2)}`);
});

test('a frightened man beside a runner may go with him; a steady one does not; discipline damps it', () => {
  const run = (discipline) => {
    const world = battle(Array(5).fill({}), Array(5).fill({}), { red: { discipline } });
    line(side(world, 'red'), -3);
    line(side(world, 'blue'), 3);
    thinkAll(world, 0.01);
    const [runner, me] = side(world, 'red');
    runner.panicked = true;
    thinkAll(world, 0.01);
    me.fear = 0.7;
    const afraid = followRate(world, me);
    me.fear = AI.rout.follow.from * 0.9;
    return { afraid, steady: followRate(world, me) };
  };
  const loose = run(0);
  assert.ok(loose.afraid > 0.3, `afraid beside a runner: ${loose.afraid.toFixed(2)} a second`);
  assert.equal(loose.steady, 0, 'a steady man does not run because his neighbour does');
  assert.ok(run(1).afraid < loose.afraid * 0.2, 'discipline holds him');
});

test('the domino: a weak line that starts to go, goes nearly all at once', () => {
  let spread = 0;
  for (const seed of [1, 2, 3]) {
    const world = createWorld([...Array(10).fill(0).map(() => man('red')), ...Array(10).fill(0).map(() => man('blue'))], { seed, arena: { halfX: 14, halfZ: 9 } });
    const reds = side(world, 'red');
    line(reds, -4, 0.9);
    line(side(world, 'blue'), 8);
    thinkAll(world, 0.01);
    for (const fighter of reds) fighter.fear = 0.85;
    reds[5].panicked = true;
    for (let t = 0; t < 3; t += 0.1) {
      for (const fighter of reds) fighter.fear = Math.max(fighter.fear, 0.85);
      advance(world, 0.1, (current, dt) => thinkAll(current, dt, new Set(side(world, 'blue').map((fighter) => fighter.id))));
    }
    spread += reds.filter((fighter) => fighter.panicked || fighter.fled).length;
  }
  assert.ok(spread / 3 >= 4, `from one runner, ${(spread / 3).toFixed(1)} of 10 broke within 3 s`);
});

test('strength: a man in plate with a sword is stronger than one in a vest with a knife; a runner is weak', () => {
  const world = battle([{ kind: 'knight', style: 'longsword' }, { kind: 'mingGarrison', style: 'knife' }], [{}]);
  const [knight, levy] = side(world, 'red');
  assert.ok(strengthOf(knight) > 2.5 * strengthOf(levy), `${strengthOf(knight).toFixed(1)} vs ${strengthOf(levy).toFixed(1)}`);
  const before = strengthOf(knight);
  knight.panicked = true;
  assert.ok(strengthOf(knight) < before * 0.3, 'broken and running: no one fears a back');
});

test('facing a much stronger man frightens; an equal does not; the same alone and in a crowd; the stronger is steadied', () => {
  // One against one.
  const duel = (kind, style) => {
    const world = battle([{ kind: 'mingGarrison', style: 'dao' }], [{ kind, style }]);
    placeFighter(world.fighters[0], -1, 0);
    placeFighter(world.fighters[1], 1, 0);
    thinkAll(world, 0.01);
    return [standingFear(world, world.fighters[0]), standingFear(world, world.fighters[1])];
  };
  const [even] = duel('mingGarrison', 'dao');
  const [outmatched, sure] = duel('knight', 'longsword');
  assert.equal(even, 0, 'an equal: nothing');
  assert.ok(outmatched > AI.standing.fear * 0.5, `a knight before him: ${outmatched.toFixed(2)}`);
  assert.ok(sure < 0, `and the knight is steadied: ${sure.toFixed(2)}`);
  // Many against many, the same weighing.
  const crowd = (kind, style) => {
    const world = battle(Array(5).fill({ kind: 'mingGarrison', style: 'dao' }), Array(5).fill({ kind, style }));
    line(side(world, 'red'), -1);
    line(side(world, 'blue'), 1);
    thinkAll(world, 0.01);
    return standingFear(world, side(world, 'red')[2]);
  };
  assert.equal(crowd('mingGarrison', 'dao'), 0, 'line against an equal line: nothing');
  assert.ok(crowd('knight', 'longsword') > AI.standing.fear * 0.5, 'against a line of knights: fear');
  // One against many: even a man as good as each of them.
  const world = battle([{ kind: 'mingGarrison', style: 'dao' }], Array(4).fill({ kind: 'mingGarrison', style: 'dao' }));
  placeFighter(world.fighters[0], -1, 0);
  line(side(world, 'blue'), 1);
  thinkAll(world, 0.01);
  assert.ok(standingFear(world, world.fighters[0]) > AI.standing.fear * 0.5, 'four on one');
  // Far off, they are not yet felt.
  placeFighter(world.fighters[0], -12, 0);
  line(side(world, 'blue'), 6);
  thinkAll(world, 0.01);
  assert.equal(standingFear(world, world.fighters[0]), 0, 'out of sight');
});

test('losing your best: a strong man of a side falling shakes it more than an ordinary one', () => {
  const fall = (index) => {
    const world = battle([{ kind: 'knight', style: 'longsword' }, ...Array(5).fill({})], Array(6).fill({}));
    line(side(world, 'red'), -3);
    line(side(world, 'blue'), 4);
    thinkAll(world, 0.01);
    side(world, 'red')[index].state = 'out';
    thinkAll(world, 0.01);
    const witness = side(world, 'red')[index === 0 ? 1 : 0 + 2];
    return { company: companyFear(world, witness), lost: world.sides.red.lost };
  };
  const best = fall(0);
  const ordinary = fall(3);
  assert.ok(best.lost > ordinary.lost * 2, `the side's loss: ${best.lost.toFixed(2)} vs ${ordinary.lost.toFixed(2)}`);
  assert.ok(best.company > ordinary.company, `seen beside him: ${best.company.toFixed(2)} vs ${ordinary.company.toFixed(2)}`);
});
