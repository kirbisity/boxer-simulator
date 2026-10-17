import test from 'node:test';
import assert from 'node:assert/strict';
import { FIGHT_UI, fightUiButtons, fightUiCompass, fightUiMoves, fightUiRadial, fightUiRadialPick, fightUiReady, fightUiSwipe, fightUiTarget, fightUiStyles } from '../src/fightui/logic.js';
import { fightUiIcon } from '../src/fightui/icons.js';
import { FIGHT_UI_DESIGNS, fightUiFromAddress } from '../src/fightui/index.js';
import { attackLayout } from '../src/control.js';

test('fight UI POCs: every style with attacks has its moves on every design, each with an icon', () => {
  for (const style of fightUiStyles()) {
    const moves = fightUiMoves(style);
    assert.equal(moves.length, attackLayout(style).length, `${style}: every move the pad throws`);
    if (!moves.length) continue;
    const buttons = fightUiButtons(moves);
    assert.ok(buttons.length >= 1 && buttons.length <= FIGHT_UI.groups.length, `${style}: 1–6 buttons`);
    assert.equal(buttons.reduce((sum, button) => sum + button.moves.length, 0), moves.length, `${style}: each move on one button`);
    const compass = fightUiCompass(moves);
    assert.ok(compass.tap.length >= 1, `${style}: a tap throws something`);
    assert.equal(fightUiRadial(moves).length, moves.length, `${style}: every move on the wheel`);
    for (const entry of moves) assert.match(fightUiIcon(entry), /^<svg[^>]*>.*<\/svg>$/s, `${style} ${entry.move}: an icon`);
  }
});

test('directional strike: a swipe throws the blow that travels its way; a tap the straight one', () => {
  const compass = fightUiCompass(fightUiMoves('katana'));
  assert.equal(fightUiSwipe(compass, 3, 2).move, 'tsuki', 'a short drag is a tap: the thrust');
  // Down and to the left: the cut from the upper right.
  assert.equal(fightUiSwipe(compass, -60, -60).move, 'kesagiri');
  // Straight down: the cut from above, at the head.
  const down = fightUiSwipe(compass, 0, -80);
  assert.deepEqual([down.move, down.zone], ['shomen', 'head']);
  // From the right across: the level cut.
  assert.equal(fightUiSwipe(compass, -80, 0).move, 'yokogiri');
  const boxing = fightUiCompass(fightUiMoves('boxing'));
  assert.deepEqual([0, 1].map((turn) => fightUiSwipe(boxing, 0, 0, turn).move), ['jab', 'cross'], 'taps take the straight punches in turn');
  assert.equal(fightUiSwipe(boxing, 80, 0).move, 'hook', 'in from the left: the hook');
  assert.equal(fightUiSwipe(boxing, 0, -80), null, 'no blow of his comes from above: nothing');
  assert.equal(fightUiSwipe(fightUiCompass(fightUiMoves('handgun')), 70, 30).move, 'shoot', 'a gun: any swipe fires');
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

test('radial: the item a thumb slides to is the nearest by angle, none in the middle', () => {
  const items = fightUiRadial(fightUiMoves('katana'));
  const angles = items.map((item) => item.angle).sort((a, b) => a - b);
  for (let index = 1; index < angles.length; index += 1) assert.ok(angles[index] - angles[index - 1] > 0.5, 'items kept apart');
  assert.equal(fightUiRadialPick(items, 5, 5, 30), null);
  const top = fightUiRadialPick(items, 0, 100, 30);
  assert.equal(top.entry.move, 'shomen', 'the cut from above sits at the top');
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

test('the design is chosen in the address, and only a known one', () => {
  assert.deepEqual(Object.keys(FIGHT_UI_DESIGNS), ['buttons', 'swipe', 'target', 'radial']);
  assert.equal(fightUiFromAddress('?fightui=swipe'), 'swipe');
  assert.equal(fightUiFromAddress('?fightui=nope'), null);
  assert.equal(fightUiFromAddress(''), null, 'nothing asked: today\'s pad');
});
