import test from 'node:test';
import assert from 'node:assert/strict';
import { FIGHT_UI, fightUiButtons, fightUiColour, fightUiMoves, fightUiReady, fightUiTarget, fightUiStyles } from '../src/fightui/logic.js';
import { fightUiIcon } from '../src/fightui/icons.js';
import { FIGHT_UI_CHOICE, FIGHT_UI_DESIGNS, fightUiFromAddress, fightUiPreferred } from '../src/fightui/index.js';
import { fightUiEdge, fightUiLegend, fightUiOutcomeOf, fightUiStrikeEvent } from '../src/fightui/kit.js';
import { attackLayout } from '../src/control.js';

test('fight controls: every style with attacks has its moves on both designs, each with an icon and a colour', () => {
  for (const style of fightUiStyles()) {
    const moves = fightUiMoves(style);
    assert.equal(moves.length, attackLayout(style).length, `${style}: every move the pad throws`);
    if (!moves.length) continue;
    const buttons = fightUiButtons(moves);
    assert.ok(buttons.length >= 1 && buttons.length <= FIGHT_UI.groups.length, `${style}: 1–6 buttons`);
    assert.equal(buttons.reduce((sum, button) => sum + button.moves.length, 0), moves.length, `${style}: each move on one button`);
    for (const zone of ['head', 'body', 'legs']) assert.ok(fightUiTarget(moves, zone, 1), `${style}: a tap on the ${zone} throws something`);
    for (const entry of moves) {
      assert.match(fightUiIcon(entry), /^<svg[^>]*>.*<\/svg>$/s, `${style} ${entry.move}: an icon`);
      assert.match(fightUiColour(entry.group), /^#[0-9a-f]{6}$/, `${style} ${entry.move}: a colour`);
    }
  }
});

test('target on the body: a tap on a place throws a move that reaches it, the next on a second tap', () => {
  const moves = fightUiMoves('kickboxing');
  const legs = fightUiTarget(moves, 'legs', 1);
  assert.equal(legs.zone, 'legs');
  assert.ok(legs.reaches);
  const head = fightUiTarget(moves, 'head', -1);
  assert.equal(head.zone, 'head');
  assert.notEqual(fightUiTarget(moves, 'head', -1, 1).move, head.move, 'a second tap: another move');
  const boxer = fightUiTarget(fightUiMoves('boxing'), 'legs', 1);
  assert.equal(boxer.reaches, false, 'a boxer cannot hit the legs: the best he has, marked so');
});

test('readiness: a blow in flight is busy, short wind is tired, a man down cannot', () => {
  const fighter = { state: 'up', stamina: 1, body: { aerobic: 1 }, punch: null };
  assert.deepEqual(fightUiReady(fighter, 'jab'), { ok: true, why: null, cooling: 0 });
  assert.equal(fightUiReady({ ...fighter, stamina: 0 }, 'jab').why, 'tired');
  const busy = fightUiReady({ ...fighter, punch: { t: 0.17, spec: { duration: 0.34 } } }, 'cross');
  assert.equal(busy.why, 'busy');
  assert.ok(Math.abs(busy.cooling - 0.5) < 1e-9);
  assert.equal(fightUiReady({ ...fighter, state: 'down' }, 'jab').why, 'down');
});

test('the colours: six kinds, six different colours, each in the legend', () => {
  const colours = FIGHT_UI.groups.map(fightUiColour);
  assert.equal(new Set(colours).size, 6);
  const legend = fightUiLegend();
  for (const group of FIGHT_UI.groups) assert.ok(legend.includes(FIGHT_UI.groupNames[group]) && legend.includes(fightUiColour(group)), group);
});

test('the controls: Body by default, Buttons if asked in the address; nothing else', () => {
  assert.deepEqual(Object.keys(FIGHT_UI_DESIGNS), ['target', 'buttons']);
  assert.equal(FIGHT_UI_CHOICE.fallback, 'target');
  assert.equal(fightUiFromAddress('?fightui=buttons'), 'buttons');
  assert.equal(fightUiFromAddress('?fightui=swipe'), null, 'the dropped designs are gone');
  assert.equal(fightUiFromAddress(''), null);
  assert.equal(fightUiPreferred(''), 'target', 'nothing remembered (no storage here): the figure');
  assert.equal(fightUiPreferred('?fightui=buttons'), 'buttons');
});

test('how a blow went: the first word after it began, with where it landed', () => {
  const events = [
    { time: 1, kind: 'landed', attacker: 0, point: [9, 9, 9] },
    { time: 2.1, kind: 'blocked', attacker: 0, point: [1, 2, 3] },
    { time: 2.2, kind: 'landed', attacker: 0, point: [4, 5, 6] },
    { time: 2.3, kind: 'landed', attacker: 1, point: [7, 7, 7] },
  ];
  assert.deepEqual(fightUiStrikeEvent(events, 0, 2).point, [1, 2, 3]);
  assert.equal(fightUiStrikeEvent(events, 0, 3), null);
  assert.equal(fightUiStrikeEvent([{ time: 2.5, kind: 'bladeBlock', defender: 0, point: [0, 1, 0] }], 0, 2).kind, 'bladeBlock', 'his blow parried');
  assert.equal(fightUiOutcomeOf(events[1]), 'blocked');
  assert.equal(fightUiOutcomeOf({ kind: 'landed', effects: ['glanced off the helmet'] }), 'glance');
  assert.equal(fightUiOutcomeOf({ kind: 'bladeBlock' }), 'parried');
  assert.equal(fightUiOutcomeOf({ kind: 'shot', attacker: 0, defender: 1, target: 'head' }), 'hit', 'a shot that struck him');
  assert.equal(fightUiOutcomeOf({ kind: 'shot', attacker: 0, target: null }), 'miss');
  assert.equal(fightUiOutcomeOf({ kind: 'shot', attacker: 0, defender: 1, target: 'shield' }), 'blocked');
});

test('a blow on the player pulses the edge it came from', () => {
  assert.deepEqual(fightUiEdge(1, 0, 400, 800), [400, 400], 'from the right: the right edge');
  assert.deepEqual(fightUiEdge(0, 1, 400, 800), [200, 0], 'from ahead: the top');
  assert.deepEqual(fightUiEdge(0, -1, 400, 800), [200, 800], 'from behind: the bottom');
  const [x, y] = fightUiEdge(-1, 1, 400, 800);
  assert.equal(x, 0);
  assert.equal(y, 200, 'ahead and to the left: the left edge, high');
});
