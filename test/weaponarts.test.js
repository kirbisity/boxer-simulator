import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { MOVES, STYLES } from '../src/moves.js';
import { advance, createWorld, placeFighter } from '../src/physics.js';
import { contextAction, directFighter, doAction, newOrders } from '../src/control.js';
import { WEAPONS } from '../src/weapons.js';
import { ARTS, artCost, artOf, artReady, feelAdrenaline, startArt } from '../src/weaponarts.js';
import { strikeAt } from '../tools/weapon-strikes.js';

/** The player (red, `style`) and a man before him `distance` m off, settled; the orders drive red, nobody thinks for blue. */
function bout(style, distance = 1.5) {
  const world = createWorld([{ ...PRESETS.contender, style }, { ...PRESETS.contender, style: 'boxing' }], { seed: 1 });
  const [me, him] = world.fighters;
  placeFighter(me, -distance / 2, 0);
  placeFighter(him, distance / 2, 0);
  const orders = newOrders();
  const step = (seconds) => advance(world, seconds, (current, dt) => directFighter(current, me, orders, dt));
  step(0.5);
  return { world, me, him, orders, step };
}

test('weapon arts: none below the adrenaline it wants; offered and made above it', () => {
  const { world, me, orders, step } = bout('katana');
  assert.equal(artOf(me), 'artIai');
  me.adrenaline = ARTS.ready - 0.1;
  assert.equal(artReady(me), false);
  assert.notEqual(contextAction(world, me), 'art', 'not on the special button');
  assert.equal(startArt(world, me), false);
  assert.equal(me.punch, null);

  me.adrenaline = ARTS.ready + 0.15;
  assert.equal(artReady(me), true);
  assert.equal(contextAction(world, me), 'art', 'the special button offers it');
  const stamina = me.stamina;
  const adrenaline = me.adrenaline;
  // Pressed (the special button, or F): carried out with the orders.
  orders.actions = ['art'];
  step(1 / 60);
  assert.equal(me.punch?.type, 'artIai');
  assert.ok(world.events.some((event) => event.kind === 'art' && event.attacker === me.id));
  // A lot of stamina (five or six plain cuts' worth), and the surge spent.
  assert.ok(stamina - me.stamina > 0.9 * artCost(me, 'artIai'), `stamina ${stamina} → ${me.stamina}`);
  assert.ok(artCost(me, 'artIai') > 4 * MOVES.kesagiri.cost / me.body.aerobic);
  assert.ok(me.adrenaline < adrenaline - ARTS.spend + 0.01, `adrenaline ${adrenaline} → ${me.adrenaline}`);
  assert.equal(artReady(me), false, 'not again at once');
});

test('weapon arts: not without the stamina, and not at the air', () => {
  const { world, me } = bout('naginata', 6);
  me.adrenaline = 0.9;
  assert.equal(doAction(world, me, 'art'), false, 'nobody within reach');
  const near = bout('naginata', 2);
  near.me.adrenaline = 0.9;
  near.me.stamina = artCost(near.me, 'artWheel') * 0.5;
  assert.equal(artReady(near.me), false, 'winded');
});

test('no gun and no bow has an art', () => {
  for (const [kind, spec] of Object.entries(WEAPONS)) if (spec.shot || spec.bow || spec.ranged) assert.equal(spec.art, undefined, kind);
  for (const style of ['handgun', 'matchlock', 'rifle', 'shotgun', 'crossbow', 'yumi', 'bow']) {
    const { me } = bout(style, 4);
    me.adrenaline = 1;
    assert.equal(artOf(me), null, style);
    assert.equal(artReady(me), false, style);
  }
  // Every art a weapon names is a move marked as one.
  for (const spec of Object.values(WEAPONS)) if (spec.art) assert.equal(MOVES[spec.art]?.art, true, spec.art);
});

test("the player's adrenaline: up with blows landed and taken and with danger near, fading after", () => {
  const { world, me, him } = bout('katana', 1.5);
  me.adrenaline = 0;
  feelAdrenaline(world, me, 1);
  const keyed = me.adrenaline;
  assert.ok(keyed > 0, 'a man before him keys him up');
  assert.ok(keyed < ARTS.ready, 'danger alone never makes an art');
  for (let blow = 0; blow < 3; blow += 1) {
    world.events.push({ time: world.time, kind: 'landed', attacker: me.id, defender: him.id, energy: 150, effects: [] });
    world.events.push({ time: world.time, kind: 'landed', attacker: him.id, defender: me.id, energy: 60, effects: [] });
  }
  feelAdrenaline(world, me, 1 / 60);
  assert.ok(me.adrenaline > keyed + 0.2, `three exchanges: ${keyed} → ${me.adrenaline}`);
  world.events.push({ time: world.time, kind: 'killed', fighter: him.id, attacker: me.id, effects: [] });
  feelAdrenaline(world, me, 1 / 60);
  assert.ok(me.adrenaline >= ARTS.ready, `and a kill: ${me.adrenaline}`);
  // With nobody near it fades.
  him.state = 'out';
  const high = me.adrenaline;
  for (let second = 0; second < 30; second += 1) feelAdrenaline(world, me, 1);
  assert.ok(me.adrenaline < high * 0.7, `faded: ${high} → ${me.adrenaline}`);
});

// Each art against the plain blows of the same weapon (its style's own swings, or thrusts for a thrust), thrown at an
// unresisting man from a few distances: the art's best contact beats every plain blow's best, by the measure its
// family is about — the cut it opens, the blunt blow (impulse × its blunt share), the point's wound.
const FAMILIES = [
  { style: 'katana', art: 'artIai', measure: 'cut', distances: [1.2, 1.5, 1.8] },
  { style: 'odachi', art: 'artIai', measure: 'cut', distances: [1.5, 1.8, 2.1] },
  { style: 'longsword', art: 'artPommel', measure: 'blunt', distances: [0.9, 1.1, 1.3] },
  { style: 'wuxia', art: 'artDrawCut', measure: 'cut', distances: [1.2, 1.5, 1.8] },
  { style: 'dao', art: 'artDrawCut', measure: 'cut', distances: [1.2, 1.5, 1.8] },
  { style: 'naginata', art: 'artWheel', measure: 'cut', distances: [1.5, 2.1, 2.4] },
  { style: 'guandao', art: 'artWheel', measure: 'cut', distances: [1.8, 2.1, 2.4] },
  { style: 'warhammer', art: 'artCrush', measure: 'blunt', distances: [1.2, 1.5, 1.8] },
  { style: 'kanabo', art: 'artCrush', measure: 'blunt', distances: [1.2, 1.5, 1.8] },
  { style: 'maceShield', art: 'artCrushOne', measure: 'blunt', distances: [0.9, 1.2, 1.5] },
  { style: 'spear', art: 'artSpear', measure: 'pierce', distances: [2.3, 2.6, 2.9] },
];
const measured = (hit, measure) => (measure === 'blunt' ? hit.impulse * hit.bluntMix : hit[measure] ?? 0);
function best(style, move, measure, distances) {
  let top = 0;
  for (const zone of MOVES[move].zones.filter((name) => name !== 'legs')) for (const distance of distances) {
    const { hit } = strikeAt(style, move, zone, distance);
    if (hit) top = Math.max(top, measured(hit, measure));
  }
  return top;
}

for (const { style, art, measure, distances } of FAMILIES) {
  test(`weapon art ${art} with the ${STYLES[style].label}: harder than any of its plain blows (${measure})`, () => {
    assert.equal(WEAPONS[STYLES[style].weapon].art, art);
    const mode = measure === 'pierce' ? 'thrust' : 'swing';
    const plain = Object.keys(STYLES[style].attacks).filter((move) => MOVES[move].path === 'blade' && MOVES[move].mode === mode);
    const strongest = Math.max(...plain.map((move) => best(style, move, measure, distances)));
    const own = best(style, art, measure, distances);
    assert.ok(own > strongest * 1.05, `${art} ${own.toFixed(1)} against the best plain blow's ${strongest.toFixed(1)}`);
  });
}
