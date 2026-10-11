import test from 'node:test';
import assert from 'node:assert/strict';
import { INTRO, introLegends, introPlan } from '../src/intro.js';
import { FACTIONS } from '../src/outfits.js';
import { WARRIORS } from '../src/roster.js';

test('the intro shows the legends asked for, each with a faction, a name and a line', () => {
  const keys = introLegends().map((legend) => legend.key);
  for (const key of ['templar', 'tametomo', 'ironPagoda', 'maximus', 'saladin', 'guanYu', 'joan', 'kheshig', 'eagle', 'ronin']) assert.ok(keys.includes(key), key);
  for (const legend of introLegends()) {
    assert.ok(FACTIONS[legend.faction], `${legend.key}: faction`);
    assert.ok(legend.name && legend.kicker && legend.line, `${legend.key}: caption`);
  }
});

test('a bare legend: true joins the intro after the numbered ones', () => {
  const extra = { ...WARRIORS.find((warrior) => warrior.key === 'thraex'), legend: true };
  const legends = introLegends([extra, ...WARRIORS]);
  assert.equal(legends[legends.length - 1].key, 'thraex');
  assert.ok(legends[legends.length - 1].line);
});

test('the plan: chapters of one faction, at most `together` a shot, a timeline without gaps of 20-32 s', () => {
  const plan = introPlan();
  for (const chapter of plan.chapters) {
    assert.ok(chapter.legends.length <= INTRO.together);
    assert.ok(chapter.legends.every((legend) => legend.faction === chapter.faction));
  }
  plan.shots.forEach((shot, index) => {
    assert.ok(shot.end > shot.start || shot.kind === 'fade');
    if (index) assert.equal(shot.start, plan.shots[index - 1].end);
  });
  assert.ok(plan.length >= 20 && plan.length <= 32, `${plan.length} s`);
  assert.ok(introPlan(undefined, { reduced: true }).length < plan.length * 0.7);
});

test('every legend stands on the Colosseum sand, apart from the others', () => {
  const { legends } = introPlan();
  for (const legend of legends) assert.ok((legend.x / 10.5) ** 2 + (legend.z / 7) ** 2 < 0.8, `${legend.key} at ${legend.x}, ${legend.z}`);
  for (let index = 1; index < legends.length; index += 1) {
    const gap = Math.hypot(legends[index].x - legends[index - 1].x, legends[index].z - legends[index - 1].z);
    assert.ok(gap > 1.2, `${legends[index].key} ${gap.toFixed(2)} m from the last`);
  }
});
