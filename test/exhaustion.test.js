// Exhaustion, mud and the men who go among the fallen (Agincourt's causes, as general physics): a side that marched before the
// floor arrives as the walk left it (physics.js marchBefore); spent in mud a man goes only as fast as his breath pays for
// (fieldworks.js spentPace) and keeps his feet less (checkBalance); under fire, short of his man, an AI man drives himself into the
// overdraft and faints at its floor (ai.js `overdraw`, physics/overdraft.js); a man whose weapon cannot hurt his man lets it fall and
// wrestles (physics.js goToGrips, STYLES.ringen); and an AI man kneels over an enemy helpless on the floor (finisher.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { thinkAll, bestHarmThrough } from '../src/ai.js';
import { advance, createWorld, goToGrips } from '../src/physics.js';
import { drawStamina, overdraws } from '../src/physics/overdraft.js';
import { FIELDWORKS, slogCost, spentPace } from '../src/physics/fieldworks.js';
import { WORLD } from '../src/physics/config.js';
import { scenarioWorld } from '../src/scenarios.js';
import { finishTarget } from '../src/finisher.js';

test('the French at Agincourt arrive as their walk across the field left them: the knights in plate spent, their lighter-armed retinue not', () => {
  const world = scenarioWorld('agincourt', 1);
  const foot = world.fighters.filter((fighter) => fighter.corner === 'red' && !fighter.mount);
  const knights = foot.filter((fighter) => fighter.body.inputs.outfit?.kind === 'knight');
  const others = foot.filter((fighter) => fighter.body.inputs.outfit?.kind !== 'knight');
  const mean = (men) => men.reduce((sum, fighter) => sum + fighter.stamina, 0) / men.length;
  assert.ok(mean(knights) < 0.15, `knights ${mean(knights)}`);
  assert.ok(mean(others) > mean(knights) + 0.3, `retinue ${mean(others)}`);
  assert.ok(knights.every((fighter) => fighter.heat.core < 39.5), 'warm, not cooked');
  assert.ok(world.fighters.filter((fighter) => fighter.corner === 'blue').every((fighter) => fighter.stamina === 1), 'the English waited');
});

test('spent in mud a man goes only as fast as his breath pays for; a heavier man slower; on firm ground he is not held', () => {
  const world = createWorld([structuredClone(PRESETS.knight), structuredClone(PRESETS.contender)], { seed: 1 });
  const [knight] = world.fighters;
  const recovery = WORLD.staminaRecovery * knight.body.aerobic;
  const pace = spentPace(knight, 0.32, recovery);
  assert.ok(pace > 0.1 && pace < 0.6, `a trudge: ${pace} m/s`);
  assert.ok(slogCost(knight, 0.32, pace) <= recovery + 1e-9);
  knight.body.massKg += 20;
  assert.ok(spentPace(knight, 0.32, recovery) < pace);
  assert.equal(spentPace(knight, 0, recovery), Infinity);
  assert.ok(FIELDWORKS.mud.step > 0);
});

test('only the man played, or one driving himself (`overdraw`), goes past empty; at the floor he faints', () => {
  const world = createWorld([structuredClone(PRESETS.knight), structuredClone(PRESETS.contender)], { seed: 1 });
  const [man] = world.fighters;
  man.stamina = 0.05;
  drawStamina(man, 0.3);
  assert.equal(man.stamina, 0, 'stops at empty');
  man.overdraw = true;
  assert.ok(overdraws(man));
  drawStamina(man, 0.3);
  assert.ok(man.stamina < -0.2, 'into the overdraft');
  man.overdraw = false;
  const before = man.stamina;
  drawStamina(man, 0.3);
  assert.equal(man.stamina, before, 'no deeper once he stops driving himself');
  man.overdraw = true;
  drawStamina(man, 5);
  assert.equal(man.faintDue, true);
  advance(world, 0.1, () => {});
  assert.equal(man.state, 'down', 'fainted');
});

test('a man whose weapon cannot hurt his man lets it fall and wrestles; the AI does so against plate', () => {
  const world = createWorld([{ ...structuredClone(PRESETS.contender), sex: 'male', style: 'shortSword' }, structuredClone(PRESETS.knight)], { seed: 2 });
  const [man, knight] = world.fighters;
  assert.ok(bestHarmThrough(man, knight) < 0.2, `a short sword on plate: ${bestHarmThrough(man, knight)}`);
  assert.ok(bestHarmThrough(knight, man) > 0.3, 'a sword on a man in a shirt');
  // (A dagger's point finds the gaps: it is kept for them.)
  const dagger = createWorld([{ ...structuredClone(PRESETS.contender), style: 'knife' }, structuredClone(PRESETS.knight)], { seed: 2 });
  assert.ok(bestHarmThrough(dagger.fighters[0], dagger.fighters[1]) > 0.3);
  const free = createWorld([{ ...structuredClone(PRESETS.contender), style: 'knife' }, structuredClone(PRESETS.knight)], { seed: 2 });
  assert.ok(goToGrips(free, free.fighters[0]));
  assert.equal(free.fighters[0].style, 'ringen');
  assert.ok(!free.fighters[0].weapon?.held);
  assert.ok(free.debris.some((piece) => piece.kind === 'weapon'), 'the knife on the floor');
  // Fresh, on firm ground, the knight is fought with the sword; spent, wrestled (each its own bout).
  const bout = (spent) => {
    const fight = createWorld([{ ...structuredClone(PRESETS.contender), sex: 'male', style: 'shortSword' }, structuredClone(PRESETS.knight)], { seed: 2 });
    const [striker, armoured] = fight.fighters;
    for (let t = 0; t < 4; t += 0.25) {
      armoured.stamina = spent ? 0.05 : Math.max(armoured.stamina, 0.8);
      advance(fight, 0.25, (current, dt) => thinkAll(current, dt));
      if (striker.style === 'ringen') return true;
    }
    return false;
  };
  assert.equal(bout(false), false, 'not against a fresh man on firm ground');
  const gripped = bout(true);
  assert.ok(gripped, 'the AI went to grips with the spent man');
});

test('an AI man kneels over an enemy helpless on the floor unless an enemy on his feet nearby has him for his man', () => {
  const world = createWorld([structuredClone(PRESETS.knight), structuredClone(PRESETS.contender), { inputs: structuredClone(PRESETS.contender), corner: 'blue' }], { seed: 3 });
  const [knight, down, other] = world.fighters;
  down.state = 'down';
  for (const [fighter, x] of [[knight, 0], [down, 1], [other, 2.4]]) fighter.x[0] = x;
  const near = (fighter, x, z = 0) => {
    for (let index = 0; index < fighter.x.length; index += 3) {
      fighter.x[index] += x - fighter.root[0];
      fighter.x[index + 2] += z - fighter.root[1];
    }
    fighter.root = [x, z];
  };
  near(knight, 0);
  near(down, 1);
  near(other, 2.2, 0.5);
  other.focus = null;
  assert.equal(finishTarget(world, knight, { watched: true })?.id, down.id, 'the other has someone else');
  other.focus = knight.id;
  assert.equal(finishTarget(world, knight, { watched: true }), null, 'the other is coming for him');
});
