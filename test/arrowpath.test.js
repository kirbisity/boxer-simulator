// A bow behind a rank of its own: the arrow's path traced as it will fly (physics/ranged.js arcFouled, ARROW_PATH), the
// drawn shaft from his cheek to his bow hand and the arc over the heads before him. A pace behind the man in front, it
// clears his head and comes down on the mark; pressed up to his back (his bow hand at that man's head), it is held,
// at the AI's choosing (ai.js shotFouled) and at the release (loose). Level 1's garrison bowmen shot their own front
// rank through the head this way before it was traced.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseInputs, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { mingSoldier } from '../src/cast.js';
import { advance, aimPoint, createWorld, placeFighter, seededRandom, toLocal } from '../src/physics.js';
import { ammoLeft, bowArcFouled, loose } from '../src/physics/ranged.js';
import { BALLISTICS } from '../src/physics/ballistics.js';

/** A spearman (blue, at x = 4) and a bowman `behind` m behind him in his file, holding their ground; a man at x = `at`. */
function spearAndBow(behind, at = -10) {
  const random = seededRandom(5);
  const blue = [mingSoldier(random, 'spear', 'garrison', { people: 'mingSouth' }), mingSoldier(random, 'bow', 'garrison', { people: 'mingSouth' })];
  const mark = normaliseInputs({ ...structuredClone(PRESETS.contender), sex: 'male', style: 'unskilled', accessories: [] });
  const entries = [...blue.map((inputs) => ({ inputs: normaliseInputs(inputs), corner: 'blue' })), { inputs: mark, corner: 'red' }];
  const world = createWorld(entries, { seed: 5, arena: { halfX: 20, halfZ: 8 }, formation: { blue: { front: 4, layout: [[0, 0], [behind, 0]], drill: { advance: false } } } });
  const red = world.fighters[2];
  placeFighter(red, at, 0);
  return { world, spear: world.fighters[0], bow: world.fighters[1], red };
}

test('a bow a pace behind the man before him shoots over his head: the arc clears it', () => {
  const { world, bow, red } = spearAndBow(1.3);
  assert.equal(bowArcFouled(world, bow, aimPoint(red, 'body')), null);
});

test('a bow pressed up to the back of the man before him holds: the shaft would go through his head', () => {
  const { world, spear, bow, red } = spearAndBow(0.55);
  assert.equal(bowArcFouled(world, bow, aimPoint(red, 'body'))?.fighter, spear);
  // Let go at the draw all the same (the player's, or a shot begun before the press): nothing leaves the bow.
  const arrows = ammoLeft(bow);
  bow.punch = { aim: toLocal(bow, aimPoint(red, 'body')) };
  loose(world, bow);
  bow.punch = null;
  assert.equal(world.arrows.length, 0, 'no arrow loosed');
  assert.equal(ammoLeft(bow), arrows, 'the arrow kept');
});

test('bows behind a spear: no arrow into their own man, and the one a pace back still shoots', () => {
  // His judgement of the distance (ballistics.js judgedShare) left out: a garrison man misjudges 16 m by a few metres either
  // way, and which way his few shots go was luck of the draw (it passed or failed by the bow's draw time, which shifts
  // the random sequence); the arc's own fall on the mark is what this tests.
  const judge = BALLISTICS.judge;
  BALLISTICS.judge = { spread: [0, 0], short: [0, 0] };
  try {
    bowsBehindASpear();
  } finally {
    BALLISTICS.judge = judge;
  }
});

function bowsBehindASpear() {
  for (const behind of [0.55, 1.3]) {
    const { world, bow, red } = spearAndBow(behind);
    for (let t = 0; t < 8; t += 0.05) advance(world, 0.05, (current, dt) => thinkAll(current, dt, new Set([red.id])));
    const arrows = world.events.filter((event) => event.kind === 'arrow');
    assert.ok(arrows.every((event) => world.fighters[event.defender].corner === 'red'), `${behind} m behind: an arrow into his own`);
    if (behind < 1) continue;
    assert.ok(world.events.some((event) => event.kind === 'loosed' && event.attacker === bow.id), 'he shoots over the spear');
    // Lobbed on the arc that comes down on the mark: his arrows fall about the man (a metre or two, his spread over a high flight).
    const fell = world.arrows.filter((arrow) => arrow.landed || arrow.done).map((arrow) => Math.hypot(arrow.x[0] - red.x[0], arrow.x[2] - red.x[2]));
    assert.ok(fell.length > 0 && fell.filter((off) => off < 3).length >= fell.length / 2, `arrows fell ${fell.map((off) => off.toFixed(1)).join(', ')} m off the mark`);
  }
}
