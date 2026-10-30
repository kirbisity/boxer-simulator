// Stage 1, Dunnottar, the round that made the castle a way: no armour stands on the map; the front gate held by a garrison no man would fight through (strong men in front of the
// bridge and behind it); above ground the way is one lane (the court and the shelf are corridors, nowhere is open ground); the keep is entered from the court, by a door the turnkey's
// key opens, so that the old drain's way on is up into the court and not into the tower.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mechanismsOf, sectionById, stageTerrain } from '../src/levelmode/stage.js';
import { DN_ARCH_BAR, DN_RAVINE, DN_Y, DUNNOTTAR, DUNNOTTAR_ROUTE, DUNNOTTAR_SEWER_ROUTE } from '../src/levelmode/stages/dunnottar.js';
import { findPath, standable } from '../tools/botnav.js';

const spawns = DUNNOTTAR.sections.flatMap((section) => section.spawns);
const states = Object.fromEntries(mechanismsOf(DUNNOTTAR).map((mechanism) => [mechanism.id, mechanism.state]));
const terrain = stageTerrain(DUNNOTTAR, DUNNOTTAR.sections.map((section) => section.id), states);
const length = (path) => path.reduce((total, point, at) => total + (at ? Math.hypot(point[0] - path[at - 1][0], point[1] - path[at - 1][1]) : 0), 0);

test('no armour stands, mannequins or racks of arms anywhere on the map, nor a way to draw one', () => {
  const banned = /armou?r.?stand|mannequin|dummy|effigy|weaponrack|weapon.?rack/i;
  const props = DUNNOTTAR.sections.flatMap((section) => section.decor).filter((decor) => decor.kind === 'prop').map((decor) => decor.what);
  assert.ok(props.length > 100, 'the props were read');
  assert.deepEqual(props.filter((what) => banned.test(what)), []);
  assert.deepEqual(spawns.filter((spawn) => banned.test(`${spawn.id} ${spawn.inputs?.name ?? ''}`)).map((spawn) => spawn.id), []);
  for (const file of ['../src/levelmode/kitprops.js', '../src/levelmode/kitchapel.js', '../src/levelmode/stages/dunnottar.js']) {
    assert.ok(!banned.test(readFileSync(new URL(file, import.meta.url), 'utf8').replace(/never a weapon rack|no armour stands/gi, '')), `${file} has no such prop`);
  }
});

test('the front gate is held in front of the bridge and behind it: men-at-arms, a guard and crossbowmen at each, so that nobody means to fight past it', () => {
  const front = spawns.filter((spawn) => spawn.alarm === 'front' && spawn.role === 'enemy');
  const inFront = front.filter((spawn) => spawn.post[0] < DN_RAVINE.x0 && !spawn.perch);
  // (Behind it: at its castle end, the knights in the barrier's gap before the arch, and the forecourt beyond.)
  const behind = front.filter((spawn) => spawn.post[0] > DN_ARCH_BAR.x - 1 && !spawn.perch && spawn.id !== 'gateknight');
  const of = (list, preset) => list.filter((spawn) => spawn.preset === preset).length;
  // In front of the bridge, on the shelf at its head: several men, two of them knights, a guard and a crossbowman, all on the bridge's alarm.
  assert.ok(inFront.length >= 4, `${inFront.length} men in front of the bridge`);
  assert.ok(of(inFront, 'dunnottarKnight') >= 2 && of(inFront, 'dunnottarGuard') >= 1 && of(inFront, 'dunnottarCrossbow') >= 1);
  // Behind it, in the forecourt and at the ledge's corner.
  assert.ok(behind.length >= 5, `${behind.length} men behind the bridge`);
  assert.ok(of(behind, 'dunnottarKnight') >= 2 && of(behind, 'dunnottarCrossbow') >= 2 && of(behind, 'dunnottarGuard') >= 1);
  // And over it six archers, and the plate knight on the ledge beyond: sixteen men in all on the one alarm.
  assert.equal(front.length, 16);
  assert.equal(front.filter((spawn) => spawn.perch).length, 6);
  assert.ok(front.some((spawn) => spawn.id === 'gateknight' && spawn.preset === 'dunnottarPlateKnight'));
  // Strong ones: tier 2 or 3 every one (the levies who stood under the arch are gone).
  assert.ok(front.every((spawn) => spawn.tier >= 2), 'no levy among them');
  // The sewer remains the way: the men at the bridge's head look east along the deck, away from the way to the cave's stair (test/dunnottarbridge.test.js proves they do not see it).
  assert.ok(inFront.every((spawn) => Math.abs(Math.cos(spawn.facing) - 1) < 1e-9), 'they face east');
});

// ---- Above ground the way is one lane ---------------------------------------------------------------------------

/** The widest circle (m) that holds no wall, drop or other obstacle, round any standing place of a floor in a rectangle: how open the ground is. */
function widest([x0, x1, z0, z1], y) {
  const open = [];
  const shut = [];
  for (let x = x0; x <= x1; x += 0.5) {
    for (let z = z0; z <= z1; z += 0.5) (standable(terrain, x, z, y, 0.3) === null ? shut : open).push([x, z]);
  }
  let best = 0;
  for (const [x, z] of open) {
    let nearest = Infinity;
    for (const [a, b] of shut) nearest = Math.min(nearest, Math.hypot(a - x, b - z));
    if (Number.isFinite(nearest)) best = Math.max(best, nearest);
  }
  return best;
}

test('the court is a lane, not a field: no circle wider than 5 m holds no wall (it was 8 m of open ground and more), and the shelf is two lanes', () => {
  // (Each rectangle a bound on what is above ground: the court, the gorge shelf with its ridge, the start plateau, the keep's hall, the oillet gallery.)
  assert.ok(widest([-1, 45, -35, 8], DN_Y.quad) <= 5, 'the court');
  assert.ok(widest([-65, -26, 37, 57], DN_Y.gorge) <= 6, 'the gorge shelf, the ridge between its lanes');
  assert.ok(widest([-127, -103, -11, 3], DN_Y.start) <= 5.5, 'the start plateau');
  assert.ok(widest([44, 59, -33, -14], DN_Y.quad) <= 5, 'the keep\'s hall');
  assert.ok(widest([14, 31, 39, 53], DN_Y.landing) <= 4, 'the oillet gallery');
});

test('the court is a way: from the tunnel\'s mouth to the stair-house is the long way round the south band and the middle band, not the 12 m across', () => {
  const quad = DN_Y.quad;
  const mouth = { x: 17, z: 4.4, y: quad };
  const door = [5.7, -1.4];
  const round = findPath(terrain, mouth, door, { reach: 60, maxNodes: 200000 });
  assert.ok(round, 'a way');
  const walked = length(round);
  assert.ok(walked > 55, `${walked.toFixed(0)} m to walk where the straight line is ${Math.hypot(mouth.x - door[0], mouth.z - door[1]).toFixed(0)}`);
  // It goes east to the junction first: through the south band's far end.
  assert.ok(round.some(([x, z]) => x > 38 && z > 0 && z < 5), 'by the junction at the east wall');
  // The middle band is not reachable from the south band but at that end (the separator wall), and the plaza not from the south band at all.
  assert.equal(standable(terrain, 20, 0.8, quad, 0.45), null, 'the separator wall');
  const bands = findPath(terrain, { x: 20, z: 3.6, y: quad }, [20, -3.2], { reach: 60, maxNodes: 200000 });
  assert.ok(bands && length(bands) > 40, `${bands ? length(bands).toFixed(0) : '-'} m from a point of the south band to the point beside it in the middle band`);
  // The branches end: the alley and the Lodging are cul-de-sacs (their only door the one they are entered by), and lane C ends at the keep's door.
  for (const [name, inside, entrance] of [['the alley', [15, -30], [15, -8]], ['the kitchen', [7, -27], [15, -26]], ['the Lodging', [33, -14], [35.6, -5]]]) {
    assert.ok(findPath(terrain, { x: entrance[0], z: entrance[1], y: quad }, inside, { reach: 40, maxNodes: 100000 }), `${name} can be entered`);
  }
  // A man in the south band cannot walk into the north court, the East Range or the void behind the lane's walls: they are masonry.
  for (const [x, z] of [[25, -28], [22, -17], [24, -17], [5, -16], [41, -30]]) assert.equal(standable(terrain, x, z, quad, 0.45), null, `${x},${z} is masonry`);
});

test('the shelf is two lanes parted by a ridge: the way to the bridge along the rock face, the way to the sea cave\'s stair along the edge, meeting at the stair\'s foot and at the bridge\'s head', () => {
  const g = DN_Y.gorge;
  const north = [-44, 44.4];
  const south = [-44, 53.4];
  const across = findPath(terrain, { x: north[0], z: north[1], y: g }, south, { reach: 40, maxNodes: 100000 });
  assert.ok(across, 'they meet');
  assert.ok(length(across) > 22, `${length(across).toFixed(0)} m to go from one lane to the other (9 m across the ridge)`);
  assert.equal(standable(terrain, -44, 48.8, g, 0.45), null, 'the ridge');
  // The lanes both lead where they should: the north to the bridge\'s head, the south to the sea cave\'s stair head.
  assert.ok(findPath(terrain, { x: -58, z: 40, y: g }, [-28, 46.2], { reach: 50, maxNodes: 100000 }), 'to the bridge');
  assert.ok(findPath(terrain, { x: -58, z: 40, y: g }, [-28.2, 57.6], { reach: 50, maxNodes: 100000 }), 'to the stair head');
});

// ---- The keep's door ---------------------------------------------------------------------------------------------

test('the keep is entered from the court by a door the turnkey\'s key opens: the key is on his peg in the cellar, the door in the court\'s east wall, locked from the court side', () => {
  const quad = sectionById(DUNNOTTAR, 'quad');
  const vault = sectionById(DUNNOTTAR, 'vault');
  const door = quad.gates.find((gate) => gate.id === 'keepdoor');
  assert.ok(door);
  assert.equal(door.key, 'keepkey');
  assert.ok(door.at[0] > 42 && Math.abs(door.at[2] + 22.5) < 1, 'in the east wall, in the arch');
  assert.ok(door.opensFrom, 'opened from the court side');
  const key = vault.items.find((item) => item.id === 'keepkey');
  assert.ok(key && key.kind === 'key' && key.at[0] > 28, 'the key is at the turnkey\'s end of the cellar');
  assert.ok(key.required, 'the bot takes it whatever its policy');
  // The old east stair is gone: nothing rises from the cellar's east end.
  assert.ok(!vault.terrain.some((solid) => solid.kind === 'stairs' && solid.at[0] > 36), 'no stair at the east end of the cellar');
  // The route has the door opened at the end of the lane, and the sections it goes through are in the order the story tells.
  const legs = DUNNOTTAR_ROUTE.map((leg) => leg.name);
  assert.ok(legs.indexOf('the iron-gate stair') > legs.indexOf('the long cellar') && legs.indexOf('lane C to the keep\'s door') > legs.indexOf('the iron-gate stair'));
  assert.deepEqual(DUNNOTTAR_ROUTE.find((leg) => leg.name === 'lane C to the keep\'s door').open, ['keepdoor']);
  assert.ok(DUNNOTTAR_SEWER_ROUTE.some((leg) => leg.name === 'lane C to the keep\'s door'), 'the old drain\'s way goes through the same lane');
});
