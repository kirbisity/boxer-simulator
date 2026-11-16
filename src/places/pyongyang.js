// Pyongyang's west wall in the first month of 1593 (the story's chapter 3: the storming of the walls, 8 February): a
// length of stone town wall with its walk and parapet, a gate with a two-storey pavilion through it, the wall climbing
// a hill to a corner pavilion at its north end (the story's Moranbong is "the hill north of the city"), the town's
// streets inside, and outside the open ground the columns crossed: a road to the gate, knolls, hollows and boulders,
// hills all round and the frozen river to the south. Snow lies on everything (the story's winter).
//
// Axes: +x east (into the town), +z south. The wall runs north-south with its outer foot at x = 1, exactly where the
// battle's works put it (story/battles/03-pyongyang.js, story/ground/walls.js: the same height, walk, parapet and inner
// bank), so the stretch the battle storms (|z| < 9.5) is this wall. The ground the battle is fought on (|z| <= 10, both
// sides of the wall) is level at y 0, as the battle's own floor is.
//
// The gate's form is read off a reference photograph of a Joseon gate (a dressed-stone base with an arched passage, a
// two-storey pavilion over it); it carries the name of the one gate the story's sources name at the assault, the Hamgu
// gate (含毬門). Its true form, the wall's line and the lie of the ground in 1593 are not known here: typical, not surveyed.

import { fieldOf, slabOf, wallLine, wallOf } from '../physics/terrain.js';
import { STORY_WALL } from '../story/ground/walls.js';
import { tkgFrame } from '../townkit/geo.js';
import { tkFbm, tkRandom } from '../townkit/tex.js';
import { TK_HOUSE, tkFieldAt, tkFieldMesh, tkHouse, tkHouseSolid, tkJar, tkPaving, tkRow, tkTree } from '../townkit/build.js';
import { tkBlocks, tkKeep, tkLayOf, tkMaterialsFor, tkMeshes, tkSky, tkSunWay, tkTier } from '../townkit/place.js';
import { TK_LAY } from '../townkit/lay.js';
import { tkStir } from '../townkit/stir.js';
import { TK_GLOW, TK_MATERIALS } from '../townkit/weather.js';
import { TK_THINGS, tkArrows, tkBasket, tkBrazier, tkCampfire, tkCart, tkDrift, tkFirewood, tkIcicles, tkLadder, tkMantlet, tkPoles, tkSacks, tkScatter, tkStack, tkTub, tkTuft } from '../townkit/things.js';
import { TK_WORKS, tkGatehouse, tkGatehouseSolids, tkPavilion, tkPavilionSolids, tkRampart, tkRampartSolids, tkWorksStair, tkWorksStairSolid } from '../townkit/works.js';

/** The place's plan (m). Choices for the game's ground, set against the battle's field and a walker's reach; none is a measurement of the real town. */
export const PYONGYANG_PLACE = {
  // The wall's run (z): from the corner pavilion on the hill to where it goes on, unwalked, toward the river.
  wall: { z: [-120, 125], x: 1, high: 4.5, ladders: [-6, 0, 6] },
  // (Its foot's x, its height and the ladders' places are the battle's own, story/battles/03-pyongyang.js
  // PYONGYANG_1593.wall: the page without the story carries this place too, so they are written here, and
  // test/story-places.test.js holds the two together.)
  // The ground's grid: cells along the wall (m: the wall's pieces are these too), outside it and inside it. The inner
  // cells are the earth bank's own run (height x STORY_WALL.innerRun / 2), so the bank's head and foot fall on grid lines.
  cell: 5, outside: { x: [-149, 1], z: [-130, 130] }, inside: { cells: 32, z: [-130, 130] },
  // The battle's strip (|z|): kept clear of trees, rocks and litter, which the battle's physics does not have. Its
  // ground is the land as it lies (the battle stands on this place's outside field: story/battles/03-pyongyang.js).
  strip: [10],
  // The berm the builders left level along the wall's foot, m out from it, and over how many m beyond it the ground
  // comes to its own lie (by eye: room for the ladders' feet and the men at them; whole cells of the ground's grid, so
  // the drawn and stood-on triangles are level all over it; it meets the wall's base, drawn at the foot's height).
  berm: [10, 15],
  // The hill the wall climbs to the north: how high the wall's foot is at the corner, and over what stretch (z) it rises.
  hill: { high: 13, z: [-70, -120] },
  // The gate: its middle (z), the block's width along the wall and depth through it, its terrace's height; the passage.
  // A town gate's passage of about 4 m, two carts' width; the block deep enough for the pavilion's lower storey.
  gate: { z: -50, wide: 20, deep: 10.5, out: 2.5, high: 6.5, way: 4.2, spring: 2.6, rise: 2.1 },
  // The gate pavilion's storeys (width along the wall, depth, height), and the corner pavilion's one. Set against the
  // reference picture of the gate: the lower storey's columns stand nearly to the block's ends, so that its eaves
  // overhang the block's whole width, and the upper storey is about three quarters of the lower.
  pavilion: [{ width: 17.2, depth: 7.6, high: 3.1, fill: 'open' }, { width: 12.8, depth: 5.0, high: 2.6, fill: 'lattice' }],
  corner: [{ width: 6.0, depth: 2.9, high: 3.0, fill: 'open' }],
  // Where a walker comes onto the field before the battle (behind the columns' ground, facing the wall), and where he is
  // after it (on the wall's walk, over the middle ladder). The muster point: where his column forms.
  start: { at: [-100, 0, 5], facing: 0 },
  after: { at: [3.3, 4.5, 2], facing: Math.PI },
  muster: [-118, 0, 0],
  // Snow lying (0..1) and the winter haze: clear cold air, the hills at a kilometre still seen.
  snow: 0.62, fog: [150, 1500],
  // How well the snow holds on trodden ground (the road to the gate, the ground the columns cross, the streets), as a share of its hold elsewhere.
  trodden: 0.55,
  // The frozen river to the south, which can be walked down to and crossed. `z`: where the land begins to fall to it,
  // where its ice is whole, where the far bank begins and where it is land again (a river a few hundred metres wide);
  // `ice`: the ice's level (m, a bank's height under the town's ground). `field`: the walked ground over the bank and
  // the ice, west to east (from the outside field's west edge to past the wall's southern end) and south to `to`, past
  // the far bank, where the walk's bound stands. `reeds`: the dead stems standing in the frozen edge, where the river's
  // share (as pyRiver gives it) runs between `[from, to]`: clumps every `every` m along the bank, each `[least,
  // most]` stems `high` m tall (common reed stands about two to three metres; winter-killed and broken, less;
  // approximate). All choices for the game's ground, as the rest of this plan.
  river: { z: [150, 200, 520, 600], ice: -2.2, field: { x: [-149, 61], to: 640 }, reeds: { from: 0.45, to: 0.9, every: 2.6, stems: [3, 8], high: [1.1, 2.2] } },
};

const pySmooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The wall's make-up: the battle's own (its height and foot, the rest from STORY_WALL). */
const pyWall = () => ({ x: PYONGYANG_PLACE.wall.x, high: PYONGYANG_PLACE.wall.high, face: STORY_WALL.face, walk: STORY_WALL.walk, parapet: STORY_WALL.parapet, thick: STORY_WALL.thick, bank: PYONGYANG_PLACE.wall.high * STORY_WALL.innerRun });

/** The ground's height at the wall's foot, along it: level, then up the hill to the north. */
const pyFoot = (z) => PYONGYANG_PLACE.hill.high * pySmooth(...PYONGYANG_PLACE.hill.z, z);

// The old tracks over the field (the road out from the gate, the strip the columns beat flat before the wall). A
// track worn by carts and feet over open ground is never ruled: it bends round soft ground and knolls, and its
// edges fray where wheels and feet strayed. `sway`: [length m, reach m] waves of its middle (the road's long bend
// besides), dying away over `settle` m before the gate, where every cart must come to the passage; `fray`: how
// far its width wanders either way (a share), over a noise `frayLength` m long. The strip's middle wanders by
// `stripSway`, its half-width `strip` m either way of the battle's ground. By eye, against photographs of cart
// tracks over snowfields; approximate.
const PY_TRACKS = { sway: [[110, 4.5], [47, 2.0], [19, 0.6]], settle: 24, fray: 0.28, frayLength: 23, strip: 8, stripSway: [[70, 1.3], [26, 0.5]] };

const pyWaves = (x, waves, seed) => waves.reduce((sum, [length, reach], i) => sum + reach * Math.sin((x / length) * 2 * Math.PI + seed * 1.9 + i * 2.7), 0);

/** The road out from the gate: its middle's z at x (it wanders, as a worn track does: PY_TRACKS). */
const pyRoad = (x) => PYONGYANG_PLACE.gate.z + 6 * Math.sin(Math.min(0, x - 1) / 40) + pyWaves(x, PY_TRACKS.sway, 1) * pySmooth(0, PY_TRACKS.settle, 1 - x);

/** How wide a track is at x, as a share of its own width (its fraying edges). */
const pyFray = (x, seed) => 1 + PY_TRACKS.fray * (2 * tkFbm((x + 500) / 1000, seed / 7, Math.round(1000 / PY_TRACKS.frayLength), 2, 13 + seed) - 1);

// Knolls and hollows outside the wall: [x, z, radius, height]. Low enough to walk over (the steepest about one in three).
const PY_KNOLLS = [[-42, 38, 17, 3.6], [-88, -44, 21, 4.4], [-28, -40, 12, -1.5], [-112, 52, 23, 5.2], [-64, 78, 18, 3.0], [-20, 92, 14, -1.3], [-128, -96, 26, 6.5], [-58, -98, 20, 4.0], [-132, 104, 22, 3.5]];

/** The ground's height outside the wall (x <= its foot). */
function pyOutside(x, z) {
  const t = PYONGYANG_PLACE;
  const wall = pyWall();
  const free = pySmooth(wall.x - t.berm[0], wall.x - t.berm[0] - t.berm[1], x);
  // (Rolls about 45 m long, a metre or two high: the noise repeats every 900 m, wider than the ground.)
  let relief = (tkFbm((x + 450) / 900, (z + 450) / 900, 20, 3, 5) - 0.5) * 3.6;
  for (const [kx, kz, radius, high] of PY_KNOLLS) relief += high * Math.exp(-((x - kx) ** 2 + (z - kz) ** 2) / (radius * radius * 0.5));
  // (The hill's flank runs on west of the wall, higher away from it.)
  return pyFoot(z) * (1 + 0.5 * pySmooth(wall.x, -120, x)) + relief * free;
}

/** Where a walker comes in and where his column musters, stood on the ground there (the strip is the land as it lies). */
const pyGrounded = () => {
  for (const at of [PYONGYANG_PLACE.start.at, PYONGYANG_PLACE.muster]) at[1] = pyOutside(at[0], at[2]);
};

/** The ground's height inside the wall: the earth bank against it, the town's level beyond (the hill's slope in the north). */
function pyInside(x, z) {
  const t = PYONGYANG_PLACE;
  const wall = pyWall();
  const head = wall.x + wall.face + wall.walk;
  // (No bank behind the gate's block: the street comes through it.)
  const gated = Math.abs(z - t.gate.z) < t.gate.wide / 2 - 0.01 || z < t.wall.z[0] - 0.01 || z > t.wall.z[1] + 0.01;
  return pyFoot(z) + (gated ? 0 : wall.high * Math.max(0, Math.min(1, 1 - (x - head) / wall.bank)));
}

let pyPlanMade = null;

/** The place laid out: its two fields of ground, the wall's nodes, the gate, the houses, trees and boulders. Seeded; made once. */
export function pyongyangPlan() {
  if (pyPlanMade) return pyPlanMade;
  pyGrounded();
  const t = PYONGYANG_PLACE;
  const wall = pyWall();
  const grid = (x0, x1, nu, z0, z1, height) => {
    const nv = Math.round((z1 - z0) / t.cell);
    const heights = [];
    for (let j = 0; j <= nv; j += 1) for (let i = 0; i <= nu; i += 1) heights.push(height(x0 + ((x1 - x0) * i) / nu, z0 + ((z1 - z0) * j) / nv));
    return { at: [(x0 + x1) / 2, (z0 + z1) / 2], size: [x1 - x0, z1 - z0], cells: [nu, nv], heights };
  };
  const head = wall.x + wall.face + wall.walk;
  const step = wall.bank / 2;
  const outside = grid(...t.outside.x, Math.round((t.outside.x[1] - t.outside.x[0]) / t.cell), ...t.outside.z, pyOutside);
  const inside = grid(head, head + t.inside.cells * step, t.inside.cells, ...t.inside.z, pyInside);
  // The bank and the river's ice to the south: the far country's own heights, on the same cells, from the walked ground's edge.
  const sx = t.river.field.x;
  const south = grid(sx[0], sx[1], Math.round((sx[1] - sx[0]) / t.cell), t.outside.z[1], t.river.field.to, pyFar);
  // The wall's nodes, north to south (its outer side, the left of that walk as a frame has it, is west), cut at the gate.
  const node = (z) => [wall.x, z, pyFoot(z), pyFoot(z) + wall.high];
  const range = (z0, z1) => Array.from({ length: Math.round((z1 - z0) / t.cell) + 1 }, (_, k) => node(z0 + k * t.cell));
  const runs = [range(t.wall.z[0], t.gate.z - t.gate.wide / 2), range(t.gate.z + t.gate.wide / 2, t.wall.z[1])];
  // The ladders' heads (the battle's): the parapet is open there, as the battle's own is. Measured along the southern run.
  const gaps = t.wall.ladders.map((z) => [z - STORY_WALL.ladder / 2 - runs[1][0][1], z + STORY_WALL.ladder / 2 - runs[1][0][1]]);
  // The town: a street in from the gate, a cross street, and rows facing the open ground kept behind the wall.
  const east = head + t.inside.cells * step - 34;
  const street = [t.gate.z - 3, t.gate.z + 3];
  const clear = t.strip[0] + 3.5;
  const homes = { depth: 6.5, widths: [5.5, 8.5], two: 0, vary: 0.25, firewalls: 0, walls: ['plaster', 'rubble', 'plaster'], grounds: [['wall', 'door', 'wall'], ['lattice', 'door'], ['wall', 'lattice', 'door'], ['boards', 'door']], extra: { roof: { kind: 'hip', overhang: 0.9, sag: 0.3, lift: 0.12 } } };
  const rows = [
    // (Each row is walked with its houses on the left hand: townkit/build.js tkRow. The cross street runs x 58..64.)
    ['streetNorth', [26, street[0]], [east, street[0]], 1], ['streetSouthA', [east, street[1]], [64, street[1]], 2], ['streetSouthB', [58, street[1]], [26, street[1]], 12],
    ['groundNorthA', [22, -clear], [58, -clear], 3], ['groundNorthB', [64, -clear], [east, -clear], 13],
    ['groundSouthA', [east, clear], [64, clear], 4], ['groundSouthB', [58, clear], [22, clear], 14],
    ['crossWest', [58, -clear - 8], [58, street[1] + 8], 5], ['crossEast', [64, street[1] + 8], [64, -clear - 8], 6],
    ['southWest', [58, 62], [58, clear + 8], 7], ['southEast', [64, clear + 8], [64, 62], 8],
    ['farSouth', [east, 66], [22, 66], 9], ['farNorth', [30, -64], [east, -64], 10],
    ['farEastNorth', [east + 1.5, -64], [east + 1.5, -clear], 15], ['farEastSouth', [east + 1.5, clear], [east + 1.5, 66], 16],
  ];
  const houses = [];
  for (const [row, from, to, seed] of rows) for (const house of tkRow({ from, to, seed: seed * 17, ...homes })) houses.push({ ...house, row, far: row.startsWith('far'), blindBack: true });
  // Pines on the hill and by the wall, bare trees in the yards and along the road; boulders on the open ground.
  const random = tkRandom(1593);
  const trees = [];
  const rocks = [];
  for (let k = 0; k < 46; k += 1) {
    const x = t.outside.x[0] + 4 + random() * (t.outside.x[1] - t.outside.x[0] - 12);
    const z = t.outside.z[0] + 4 + random() * (t.outside.z[1] - t.outside.z[0] - 8);
    const size = 0.8 + 2.4 * random() * random();
    // (Nothing on the battle's strip or the road to the gate.)
    if (Math.abs(z) < t.strip[0] + 4 || Math.abs(z - pyRoad(x)) < (x > -45 ? 16 : 5)) continue;
    if (k % 3 === 0 || z < t.hill.z[0]) trees.push({ at: [x, z], y: pyOutside(x, z), kind: z < t.hill.z[0] + 20 || k % 2 ? 'pine' : 'bare', high: 6 + 5 * random(), seed: k + 3 });
    else rocks.push({ at: [x, z], y: pyOutside(x, z), size, seed: k });
  }
  // (The hill's pines: its west flank outside the wall, and its slope inside.)
  for (let k = 0; k < 64; k += 1) {
    const inside = k % 3 === 0;
    const x = inside ? 16 + random() * 94 : -142 + random() * 136;
    const z = inside ? -112 + random() * 38 : -127 + random() * 50;
    if (Math.abs(z - pyRoad(x)) < 5) continue;
    trees.push({ at: [x, z], y: inside ? pyFoot(z) : pyOutside(x, z), kind: 'pine', high: 6 + 6 * random(), seed: 200 + k });
  }
  for (const [x, z] of [[30, -96], [52, -104], [78, -92], [102, -108], [124, -98], [20, -84], [90, -80], [40, 36], [86, 34], [110, -30], [36, -32], [96, 84], [44, 88], [128, 20]]) trees.push({ at: [x, z], y: pyFoot(z), kind: z < t.hill.z[0] ? 'pine' : 'bare', high: 7 + 3 * random(), seed: Math.round(x + z), yard: z > t.hill.z[0] });
  const gateFrame = tkgFrame(wall.x - t.gate.out, 0, t.gate.z, -Math.PI / 2);
  const outcrops = pyOutcrops(trees, rocks);
  pyPlanMade = { wall, outside, inside, south, runs, gaps, houses, trees, rocks, outcrops, gateFrame, head, east: head + t.inside.cells * step, edge: east + 0.8 };
  return pyPlanMade;
}

// The open ground's own make, what keeps a snowfield from reading as one smooth sheet (by eye against photographs of
// Korean hill country in winter and the reference frames; none of it from a survey of the ground in 1593):
//   clear     |z| inside which nothing is laid: the battle's floor (|z| <= 10, the story's and the custom battle's,
//             where men march and fight) and a margin; nor within `way` m of the columns' ways over the field, of the
//             road (`road` m, `roadNear` within 45 m of the gate, where the trees keep off it too), or `berm` m of
//             the wall's foot (its drifts and the ladders' ground); nor south of `flat` (z), the river's alluvial
//             flat, where the stream laid silt and not stone (and the walk down to the ice stays open).
//   outcrops  knots of boulders breaking through the snow, as the granite of that country does on its knolls and
//             hill flanks: `count` knots, each of `rocks` [least, most] stones within `spread` [least, most] m of its
//             middle, `size` [least, most] m across (the knot's first stone `big` [least, most], the rest smaller); a
//             knot stands on a knoll's crown or flank `knoll` times as often as on the flat. Each stone is a faceted
//             block (`sides` [least, most] round, `squat` [least, most] its height over its width, `stretch` the most
//             it is longer one way) sunk `sink` of its height into the ground, its facets lit `round` of the way to
//             a rounded stone's, `contact` darker where it meets the snow, its rock `tone` (weathered granite,
//             darker than the dressed stone of the wall: lichen and the damp) `vary` either way. A stone wider than
//             `solid` m is something a walker meets, as the place's other boulders are.
//   tails     the snow the wind leaves in the lee of a stone (downwind of it: PY_LAY.wind), a mound `long` times
//             the stone's width long and `wide` times it across, its head `high` of the stone's height up its lee
//             face; for stones over `from` m. Snow tails behind obstacles run some three to ten times their height
//             downwind (approximate).
//   scours    patches the wind keeps bare on the windward brow of a knoll, where the dead grass and the frozen earth
//             show: `count` patches `radius` [least, most] m, their edges ragged by `ragged` of it; the earth's
//             `tone` (frozen earth with straw-coloured grass), and `tufts` dead tufts round each rim.
//   banks     the snow pushed aside by carts and feet into a low bank along each edge of the road out from the
//             gate, `high` [least, most] m, lying out `run` m, `edge` m from the road's middle.
const PY_FIELD = {
  clear: 15, way: 4, road: 6, roadNear: 16, berm: 13, flat: 92,
  outcrops: { count: 48, rocks: [2, 7], spread: [1.5, 5], size: [0.4, 1.8], big: [1.8, 4.2], knoll: 3, sides: [8, 11], squat: [0.45, 0.85], stretch: 0.45, sink: 0.3, round: 0.6, contact: 0.55, tone: [0.4, 0.39, 0.37], vary: 0.22, solid: 1.1 },
  tails: { from: 0.8, long: 1.8, wide: 1.05, high: 0.4 },
  scours: { count: 30, radius: [1.2, 3.6], ragged: 0.45, tone: [0.36, 0.31, 0.24], tufts: 9 },
  banks: { high: [0.12, 0.34], run: 1.1, edge: 2.7 },
};

/** Whether the open ground at (x, z) is left as it is (PY_FIELD's clear ground: the battle's floor, the ways, the road, the berm). */
function pyFieldClear(x, z, margin = 0) {
  const t = PYONGYANG_PLACE;
  const f = PY_FIELD;
  if (Math.abs(z) < f.clear + margin || x > t.wall.x - f.berm - margin || z > f.flat - margin) return true;
  if (Math.abs(z - pyRoad(x)) < (x > -45 ? f.roadNear : f.road) + margin) return true;
  const to = t.wall.x - 0.5;
  return t.wall.ladders.some((lz, k) => x > PY_COLUMNS.from - 10 && Math.abs(z - (lz * (1 + (0.3 * (to - x)) / (to - PY_COLUMNS.from)) + pyColumnAside(x, to, k))) < f.way + margin);
}

/** The knots of boulders over the open ground (PY_FIELD.outcrops): [{ at, y, size, seed, squat, stretch, sides, turn }]. Seeded; kept off what pyFieldClear keeps and off the trees and the place's other boulders. */
function pyOutcrops(trees, rocks) {
  const t = PYONGYANG_PLACE;
  const o = PY_FIELD.outcrops;
  const random = tkRandom(15931);
  const lerp = ([a, b], u) => a + (b - a) * u;
  const taken = [...trees.map((tree) => [tree.at[0], tree.at[1], 1.5]), ...rocks.map((rock) => [rock.at[0], rock.at[1], rock.size])];
  const free = (x, z, r) => !taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < r + tr) && !pyFieldClear(x, z, r);
  const stones = [];
  for (let knot = 0, tries = 0; knot < o.count && tries < o.count * 30; tries += 1) {
    const [x, z] = [t.outside.x[0] + 6 + random() * (t.wall.x - PY_FIELD.berm - t.outside.x[0] - 6), t.outside.z[0] + 6 + random() * (t.outside.z[1] - t.outside.z[0] - 12)];
    // (On a knoll's crown or flank, `knoll` times as often as on the flat.)
    const rise = PY_KNOLLS.reduce((most, [kx, kz, radius, high]) => Math.max(most, high > 0 ? Math.exp(-((x - kx) ** 2 + (z - kz) ** 2) / (radius * radius)) : 0), 0);
    if (random() * o.knoll > 1 + (o.knoll - 1) * rise || !free(x, z, 3)) continue;
    knot += 1;
    const count = Math.round(lerp(o.rocks, random()));
    const spread = lerp(o.spread, random());
    for (let k = 0; k < count; k += 1) {
      const size = k === 0 ? lerp(o.big, random()) : lerp(o.size, random() * random());
      const a = random() * Math.PI * 2;
      const d = k === 0 ? 0 : spread * (0.3 + 0.7 * random());
      const [sx, sz] = [x + Math.cos(a) * d, z + Math.sin(a) * d];
      if (!free(sx, sz, size * 0.5)) continue;
      taken.push([sx, sz, size * 0.45]);
      stones.push({ at: [sx, sz], y: pyOutside(sx, sz), size, seed: knot * 31 + k, squat: lerp(o.squat, random()), stretch: 1 + o.stretch * random(), sides: Math.round(lerp(o.sides, random())), turn: random() * Math.PI });
    }
  }
  return stones;
}

/** A boulder at world (x, y, z) (PY_FIELD.outcrops): a faceted block, its rings jittered, sunk into the ground; each face lit flat, as split stone is. */
function pyBoulder(builder, x, y, z, { size, seed, squat = 0.6, stretch = 1.2, sides = 7, turn = 0, tone = PY_FIELD.outcrops.tone }) {
  const o = PY_FIELD.outcrops;
  const random = tkRandom(seed * 7919 + 13);
  const [r, high] = [size / 2, size * squat];
  // (Rings from below the ground to the crown: [height share, radius share]; the crown's point a little off the middle.)
  const rings = [[-o.sink, 0.9], [0.1, 1], [0.38, 0.97], [0.64, 0.82], [0.86, 0.55]];
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  const place = (px, py, pz) => [x + (px * stretch) * cos - pz * sin, y + py, z + (px * stretch) * sin + pz * cos];
  const angles = Array.from({ length: sides }, (_, k) => ((k + 0.35 * (random() - 0.5)) / sides) * Math.PI * 2);
  const points = rings.map(([up, out]) => angles.map((angle) => {
    const reach = r * out * (0.78 + 0.44 * random());
    return place(Math.cos(angle) * reach, high * (up + 0.08 * (random() - 0.5)), Math.sin(angle) * reach);
  }));
  const crown = place(r * 0.15 * (random() - 0.5), high, r * 0.15 * (random() - 0.5));
  const colour = tone.map((value) => value * (1 + o.vary * (2 * random() - 1)));
  const uv = (p) => [p[0] + p[2] * 0.7, p[1] + p[2] * 0.3];
  // (Lit between the face's own way and the way out from the stone's middle (`round` of the latter): a granite
  // boulder is rounded by weather, its facets soft, not cut.)
  const middle = [x, y + high * 0.3, z];
  const lit = (p, face) => {
    const out = [(p[0] - middle[0]) / stretch, (p[1] - middle[1]) * 1.6, p[2] - middle[2]];
    const length = Math.hypot(...out) || 1;
    const n = face.map((value, k) => value * (1 - o.round) + (out[k] / length) * o.round);
    const total = Math.hypot(...n) || 1;
    return n.map((value) => value / total);
  };
  // (Where the stone meets the snow it sees little of the sky and gathers the damp: darker by `contact` at the
  // ground, none of it by a third of its height. The lie's map does not hold the stones: they are laid after it.)
  const shut = (p) => colour.map((value) => value * (1 - o.contact * (1 - pySmooth(y - high * 0.1, y + high * 0.35, p[1]))));
  const tri = (a, b, c) => {
    const face = (() => { const [u, v] = [[b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]]; const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; return n.map((value) => value / l); })();
    builder.tri('rock', a, b, c, [uv(a), uv(b), uv(c)], [a, b, c].map(shut), [lit(a, face), lit(b, face), lit(c, face)]);
  };
  for (let ring = 0; ring + 1 < points.length; ring += 1) {
    for (let k = 0; k < sides; k += 1) {
      const [a, b, c, d] = [points[ring][k], points[ring][(k + 1) % sides], points[ring + 1][(k + 1) % sides], points[ring + 1][k]];
      // (Seen from outside, anticlockwise: the rings run round anticlockwise seen from above.)
      tri(a, c, b);
      tri(a, d, c);
    }
  }
  const last = points[points.length - 1];
  for (let k = 0; k < sides; k += 1) tri(crown, last[(k + 1) % sides], last[k]);
}

/**
 * A mound of snow lying on the ground from world (x, z) along `way` (a unit [x, z]): `long` m, `wide` m across at its
 * head, `high` m at its head, falling away to nothing (PY_FIELD.tails), on the 'drift' material. `heightAt`: the ground.
 */
function pyMound(builder, x, z, way, { long, wide, high, heightAt, cuts = [7, 4] }) {
  const across = [-way[1], way[0]];
  const lift = (u, v) => high * Math.pow(1 - u, 1.4) * Math.pow(Math.max(0, 1 - v * v), 0.8) - 0.03;
  const at = (u, v) => {
    const half = wide * 0.5 * (1 - 0.55 * u);
    const [px, pz] = [x + way[0] * u * long + across[0] * v * half, z + way[1] * u * long + across[1] * v * half];
    return [px, heightAt(px, pz) + lift(u, v), pz];
  };
  const normal = (u, v) => {
    const e = 0.02;
    const [u0, u1, v0, v1] = [Math.max(0, u - e), Math.min(0.999, u + e), Math.max(-1, v - e), Math.min(1, v + e)];
    const [p0, p1, q0, q1] = [at(u0, v), at(u1, v), at(u, v0), at(u, v1)];
    const [a, b] = [[p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]]];
    const n = [a[2] * b[1] - a[1] * b[2], a[0] * b[2] - a[2] * b[0], a[1] * b[0] - a[0] * b[1]];
    const length = Math.hypot(...n) || 1;
    return n.map((value) => (n[1] < 0 ? -value : value) / length);
  };
  const [nu, nv] = cuts;
  for (let i = 0; i < nu; i += 1) {
    for (let j = -nv; j < nv; j += 1) {
      const corners = [[i / nu, j / nv], [(i + 1) / nu, j / nv], [(i + 1) / nu, (j + 1) / nv], [i / nu, (j + 1) / nv]];
      const [a, b, c, d] = corners.map(([u, v]) => at(u, v));
      const normals = corners.map(([u, v]) => normal(u, v));
      const up = ((b[0] - a[0]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[0] - a[0])) < 0;
      if (up) builder.quad('drift', a, b, c, d, { uvs: [a, b, c, d].map((p) => [p[0], p[2]]), normals });
      else builder.quad('drift', a, d, c, b, { uvs: [a, d, c, b].map((p) => [p[0], p[2]]), normals: [normals[0], normals[3], normals[2], normals[1]] });
    }
  }
}

/** The open ground's make (PY_FIELD): the boulders and their snow tails, the scoured patches on the knolls, the banks along the road. */
function pyField(blocks, plan, tier) {
  const t = PYONGYANG_PLACE;
  const f = PY_FIELD;
  const ground = (x, z) => tkFieldAt(plan.outside, Math.max(t.outside.x[0], Math.min(t.wall.x, x)), Math.max(t.outside.z[0], Math.min(t.outside.z[1], z)));
  const wind = PY_LAY.wind;
  const random = tkRandom(15932);
  for (const stone of [...plan.outcrops, ...plan.rocks.map((rock) => ({ ...rock, squat: 0.5, stretch: 1.2, sides: 6, turn: rock.seed }))]) {
    const [x, z] = stone.at;
    const builder = blocks.at(x, z);
    pyBoulder(builder, x, stone.y, z, stone);
    if (stone.size < f.tails.from) continue;
    const reach = stone.size * 0.5 * 0.35;
    pyMound(builder, x + wind[0] * reach, z + wind[1] * reach, wind, { long: stone.size * f.tails.long, wide: stone.size * f.tails.wide, high: stone.size * stone.squat * f.tails.high, heightAt: ground, cuts: tier === 'low' ? [4, 2] : [7, 4] });
  }
  // The windward brows of the knolls, swept bare (a ragged fan of the frozen earth, a finger over the snow's ground).
  const knolls = PY_KNOLLS.filter(([, , , high]) => high > 0);
  for (let k = 0, tries = 0; k < f.scours.count && tries < f.scours.count * 20; tries += 1) {
    const [kx, kz, radius] = knolls[Math.floor(random() * knolls.length)];
    const d = radius * (0.2 + 0.7 * random());
    const a = Math.atan2(-wind[1], -wind[0]) + (random() - 0.5) * 2.2;
    const [x, z] = [kx + Math.cos(a) * d, kz + Math.sin(a) * d];
    const r = f.scours.radius[0] + (f.scours.radius[1] - f.scours.radius[0]) * random();
    if (pyFieldClear(x, z, r) || x < t.outside.x[0] + r || Math.abs(z) > t.outside.z[1] - r) continue;
    k += 1;
    const builder = blocks.at(x, z);
    const spokes = 22;
    const seed = random() * 100;
    const rim = Array.from({ length: spokes }, (_, i) => {
      const angle = (i / spokes) * Math.PI * 2;
      // (Longer down the wind: the scour runs with it.)
      const reach = r * (1 + 0.35 * Math.cos(angle - Math.atan2(wind[1], wind[0]))) * (1 - f.scours.ragged + 2 * f.scours.ragged * (0.6 * tkFbm(i / spokes, seed / 100, 4, 2, 41) + 0.4 * random()));
      const [px, pz] = [x + Math.cos(angle) * reach, z + Math.sin(angle) * reach];
      return [px, ground(px, pz) + 0.03, pz];
    });
    const middle = [x, ground(x, z) + 0.03, z];
    const tone = f.scours.tone.map((value) => value * (0.85 + 0.3 * random()));
    for (let i = 0; i < spokes; i += 1) {
      const [b, c] = [rim[i], rim[(i + 1) % spokes]];
      builder.tri('bare', middle, c, b, [[middle[0], middle[2]], [c[0], c[2]], [b[0], b[2]]], tone, [[0, 1, 0], [0, 1, 0], [0, 1, 0]]);
    }
    builder.at('near', () => {
      for (let i = 0; i < f.scours.tufts; i += 1) {
        const p = rim[Math.floor(random() * spokes)];
        const [px, pz] = [p[0] + (random() - 0.5) * 0.8, p[2] + (random() - 0.5) * 0.8];
        tkTuft(builder, px, ground(px, pz), pz, { size: 0.25 + 0.3 * random(), wide: 0.8 + 0.6 * random(), colour: TK_THINGS.dead.map((value) => value * (0.6 + 0.35 * random())), yaw: random() * Math.PI });
      }
    });
  }
  // The banks along the road out from the gate, each edge laid with the road on its right (tkDrift lies to the left).
  for (const side of [-1, 1]) {
    const line = [];
    for (let x = t.outside.x[0] + 4; x < t.wall.x - f.berm; x += 2.5) line.push([x, pyRoad(x) + side * f.banks.edge * pyFray(x, side < 0 ? 1 : 4)]);
    if (side > 0) line.reverse();
    for (let k = 0; k + 1 < line.length; k += 1) tkDrift(blocks.at(...line[k]), line[k], line[k + 1], { high: f.banks.high, run: f.banks.run, heightAt: ground, seed: 70 + k + side, taper: false, every: 1.25 });
  }
}

/** The wall's unwalked run south of the walked one, toward the river, bending east: its nodes [x, z, foot, top], its foot a little into the bank's ground. */
function pySouthRun() {
  const t = PYONGYANG_PLACE;
  const wall = pyWall();
  return [[wall.x, t.wall.z[1]], [wall.x, t.wall.z[1] + 30], [wall.x + 8, t.wall.z[1] + 60]].map(([x, z]) => [x, z, pyFar(x, z) - 0.3, pyFar(x, z) - 0.3 + wall.high]);
}

/** The stairs from the walk up to the gate's terrace, either side of it: [from, to] ([x, z]) each. */
function pyGateStairs() {
  const t = PYONGYANG_PLACE;
  const wall = pyWall();
  const x = wall.x + wall.face + wall.thick + (wall.walk - wall.thick) / 2;
  const run = (t.gate.high - wall.high) * 2;
  return [[[x, t.gate.z - t.gate.wide / 2 - run], [x, t.gate.z - t.gate.wide / 2]], [[x, t.gate.z + t.gate.wide / 2 + run], [x, t.gate.z + t.gate.wide / 2]]];
}

/** The frames of the gate's pavilion (on its terrace) and the corner's (on the walk's north end). */
function pyPavilions() {
  const t = PYONGYANG_PLACE;
  const wall = pyWall();
  const corner = t.wall.z[0] + 4.5;
  return {
    gate: tkgFrame(wall.x - t.gate.out + t.gate.deep / 2, t.gate.high, t.gate.z, -Math.PI / 2),
    corner: tkgFrame(wall.x + wall.face + wall.thick + (wall.walk - wall.thick) / 2, pyFoot(corner) + wall.high, corner, -Math.PI / 2),
  };
}

/** The solids of the place: everything a walker's body meets. */
export function pyongyangSolids() {
  const t = PYONGYANG_PLACE;
  const plan = pyongyangPlan();
  const { wall } = plan;
  const solids = [
    fieldOf(plan.outside.at, plan.outside.size, plan.outside.cells, plan.outside.heights, { bottom: -8 }),
    fieldOf(plan.inside.at, plan.inside.size, plan.inside.cells, plan.inside.heights, { bottom: -8 }),
    fieldOf(plan.south.at, plan.south.size, plan.south.cells, plan.south.heights, { bottom: -12 }),
  ];
  // (The wall's unwalked run on toward the river, as drawn: it closes the town's south end from the bank.)
  solids.push(...tkRampartSolids(pySouthRun(), wall));
  for (const run of plan.runs) solids.push(...tkRampartSolids(run, wall));
  solids.push(...tkGatehouseSolids(plan.gateFrame, t.gate));
  // (The passage's floor: the two fields of ground stop at the wall's two sides.)
  solids.push(slabOf([wall.x - t.gate.out + t.gate.deep / 2, t.gate.z], [t.gate.deep + 1, t.gate.way], 0, { bottom: -3 }));
  for (const [from, to] of pyGateStairs()) solids.push(tkWorksStairSolid(from, to, wall.high, t.gate.high, { wide: wall.walk - wall.thick }));
  const pavilions = pyPavilions();
  solids.push(...tkPavilionSolids(pavilions.gate, { storeys: t.pavilion }, t.gate.high));
  // The terrace's ends beside the stairs' heads (the block is wider than the walk): closed with a low wall.
  for (const side of [-1, 1]) solids.push(wallLine([wall.x + wall.face + wall.walk + 0.2, t.gate.z + (side * t.gate.wide) / 2], [wall.x - t.gate.out + t.gate.deep, t.gate.z + (side * t.gate.wide) / 2], 0.3, t.gate.high - 0.5, t.gate.high + 2.5), wallLine([wall.x - t.gate.out, t.gate.z + (side * t.gate.wide) / 2], [wall.x + wall.face + 0.1, t.gate.z + (side * t.gate.wide) / 2], 0.3, t.gate.high - 0.5, t.gate.high + 2.5));
  for (const house of plan.houses) solids.push(tkHouseSolid(house));
  for (const tree of plan.trees) if (!tree.yard) solids.push(wallOf(tree.at, [0.6, 0.6], tree.y - 1, tree.y + 4));
  for (const rock of plan.rocks) if (rock.size > 1.1) solids.push(wallOf(rock.at, [rock.size * 0.8, rock.size * 0.8], rock.y - 1, rock.y + rock.size));
  for (const stone of plan.outcrops) if (stone.size > PY_FIELD.outcrops.solid) solids.push(wallOf(stone.at, [stone.size * 0.8, stone.size * 0.8], stone.y - 1, stone.y + stone.size * stone.squat));
  // The bounds: the open ground's edges (where the hills and the camp's lines begin), the town's far streets.
  const [ox0] = t.outside.x;
  const [z0, z1] = [t.outside.z[0] + 3, t.outside.z[1] - 3];
  const bound = (a, b) => wallLine(a, b, 0.6, -20, 60);
  // (South: past the river's far bank; west and east of the bank and the ice, the field's own edges.)
  const [sx0, sx1] = [t.river.field.x[0] + 3, t.river.field.x[1] - 3];
  const far = t.river.field.to - 3;
  solids.push(bound([ox0 + 3, z0], [ox0 + 3, far]), bound([ox0, z0], [wall.x, z0]), bound([sx0, far], [sx1, far]), bound([sx1, t.outside.z[1]], [sx1, far]));
  // (Between the wall's southern end and the field's east edge, the town's own south edge.)
  solids.push(bound([wall.x, t.outside.z[1]], [sx1, t.outside.z[1]]));
  // (Inside: the north wall's inner face, the walk's corner, the town's last row of houses, the south end.)
  const north = t.wall.z[0] + wall.face + wall.walk + 0.3;
  solids.push(bound([plan.head + 0.1, north], [plan.east, north]), bound([plan.head + 0.1, t.wall.z[0] - 1], [plan.head + 0.1, north]), bound([wall.x, t.wall.z[1] - 0.5], [plan.east, t.wall.z[1] - 0.5]), bound([plan.edge, z0], [plan.edge, z1]));
  return solids;
}

/** The place as a stage (levelmode/stage.js) to walk in: one section, nobody in it. */
export function pyongyangStage() {
  pyGrounded();
  const t = PYONGYANG_PLACE;
  return {
    id: 'pyongyang', title: 'The walls of Pyongyang', place: 'pyongyang',
    start: { section: 'walls', at: t.start.at, facing: t.start.facing },
    // (The section holds the walked ground, the town's square and the bank and ice to the south: its terrain is live only inside it.)
    sections: [{ id: 'walls', name: 'The walls of Pyongyang', bounds: { at: [0, (t.river.field.to + 20 - 140) / 2], size: [320, t.river.field.to + 20 + 140] }, terrain: pyongyangSolids(), spawns: [] }],
  };
}

/** The weather the place is seen in (tkSetWeather's argument): snow lying, the air dry and clear. A view's `weather.town` replaces any part of it. */
export const PYONGYANG_WEATHER = {
  snow: { wet: 0, pool: 0, rain: 0, snow: PYONGYANG_PLACE.snow, mist: [0.0012, 3, 0.2], fog: PYONGYANG_PLACE.fog },
  // (The same snow lying at other hours and under another sky, PY_HOURS: the open air's 'siegedawn', 'siegemorning',
  // 'siegelate' and 'siegeovercast'.)
  dawn: { wet: 0, pool: 0, rain: 0, snow: PYONGYANG_PLACE.snow, mist: [0.0012, 3, 0.2], fog: PYONGYANG_PLACE.fog },
  morning: { wet: 0, pool: 0, rain: 0, snow: PYONGYANG_PLACE.snow, mist: [0.0012, 3, 0.2], fog: PYONGYANG_PLACE.fog },
  late: { wet: 0, pool: 0, rain: 0, snow: PYONGYANG_PLACE.snow, mist: [0.0012, 3, 0.2], fog: PYONGYANG_PLACE.fog },
  overcast: { wet: 0, pool: 0, rain: 0, snow: PYONGYANG_PLACE.snow, mist: [0.0012, 3, 0.2], fog: PYONGYANG_PLACE.fog },
  // (The same snow under the hazier sky the gate views had before: the open air's 'siegesnowhazy'.)
  hazy: { wet: 0, pool: 0, rain: 0, snow: PYONGYANG_PLACE.snow, mist: [0.0012, 3, 0.2], fog: PYONGYANG_PLACE.fog },
  // (The same ground without its snow: for looking at the stone and the earth.)
  bare: { wet: 0.15, pool: 0, rain: 0, snow: 0, mist: [0.001, 0, 0.5], fog: PYONGYANG_PLACE.fog },
};

// The sun of the day: 8 February at Pyongyang, worked from the date and the place, not looked up: the town lies at
// about 39.0 N (approximate); day 39 of the year gives the sun's declination by the usual cosine,
// -23.44 x cos(360 / 365 x (39 + 10)) = -15.6 degrees; at an hour angle H, sin(height) = sin 39.0 sin -15.6 +
// cos 39.0 cos -15.6 cos H, and the bearing west of south A has tan A = sin H / (cos H sin lat - tan dec cos lat)
// (at three by the sun, H = 45 degrees: 21.1 high, 46.9 west of south; at noon 35.4, due south). The hour is half
// past three: a low winter sun of 16.6 degrees, 52.9 west of south, under air that lets more of the sky's blue
// through it pale (the weather below), the light a clear winter day has in its first and last hours. Only an
// afternoon sun can do it here: the wall's outer face looks west, so a morning sun (in the south-east) leaves the
// face the ladders climb and the gate's front in their own shade, and throws the wall's shadow out over the field.
// `azimuth` is the open air's measure (rad: 0 toward +x east, a quarter turn toward +z south).
const PY_DAY = { latitude: 39.0, declination: -15.6, hour: 15.5 };
function pySunAt({ latitude, declination, hour }) {
  const [lat, dec, h] = [latitude, declination, 15 * (hour - 12)].map((degrees) => (degrees * Math.PI) / 180);
  const elevation = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h));
  const bearing = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat));
  return { azimuth: Math.PI / 2 + bearing, elevation: (elevation * 180) / Math.PI };
}
const PY_SUN = pySunAt(PY_DAY);
// The same day at other hours, by the same rule (the open air's `days`): eight in the morning, the sun 11.8 degrees
// up in the south-east (58.5 east of south), the wall's outer face and the gate's front in their own shade and the
// wall's shadow thrown out over the field; half past ten, 31.5 up, 25.6 east of south, the front still in shade
// but the field and the town lit from high; a quarter past four, 9.3 up, 61.1 west of south, the face lit almost
// square-on by a low, yellowing sun an hour before it sets (sunset by the same rule at about five past five).
const PY_HOURS = { dawn: 8, morning: 10.5, late: 16.25 };

/** The place's light (render.js PLACE_LIGHT's entry): the low winter sun of PY_SUN in a pale clear sky. */
// What the bare ground under the snow throws back, for the open air's light from below (its `ground.albedo`):
// frozen trodden earth and dry winter grass, about a third (approximate), against a meadow's fifth.
const PY_GROUND_ALBEDO = 0.32;
const PY_LIGHT = { haze: 0xd3dbe2, sun: tkSunWay(PY_SUN.azimuth, PY_SUN.elevation) };
export const PYONGYANG_LIGHT = {
  background: PY_LIGHT.haze, fog: PYONGYANG_PLACE.fog, far: 2400, key: 0xfff0dc, keyIntensity: 0.1, rim: 0xcfe0ff, sun: 1.0, hemi: 0.62,
  sky: { zenith: [0.5, 0.62, 0.8], haze: [0.84, 0.87, 0.9], sunColour: [1, 0.93, 0.82], ground: [0.62, 0.64, 0.68] },
};

// The sky's fill in the shade at the hours the snow is seen against the light (the open air's `meter.sky`, the share
// of the sky's light that reaches what stands in the field, for 'siegedawn' and 'siegesnow'). The open air lights a
// shaded face with the whole dome; here the low sun stands in a glare of haze on one side and the rest of the sky is
// the cold clear blue of a winter morning, and a face in shade among the knolls, the wall and the near hills has a
// share of its sky shut off by them: 0.7 by eye against the reference frames, whose shade is a deep blue-grey beside
// the lit snow. (The camera's meter, which is told the same share, opens a little for it; each weather's `ev` takes
// that back so the lit snow keeps its place on the curve.)
const PY_SHADE = { sky: 0.7 };

// The far country, drawn only: how far it is drawn (m, to the sky's edge in the haze), and how far it is sunk under
// the walked ground where the two overlap.
const PY_FAR = { reach: 1500, sink: 4 };

// The far country's woods, drawn only. That country's hills carry pine (red pine above all, approximate) on their
// slopes and crests while the valley floors are fields: woods stand where a slow noise passes `cover` (0..1; patches
// `patch` m across), helped by height (`rise`: added per 100 m over the plain). A wood is not a plantation:
//   edge     its trees thin out over this much of the noise below `cover` and reach their full number three times
//            as far above it, so a wood frays into single trees instead of ending at a line;
//   clump    inside it they stand in clumps with glades between (a finer noise, `clump` m across, takes up to
//            `glade` of them away);
//   high     m tall, an edge tree as little as `small` of that and one in `oldOne` an old tree `old` times it;
//   skirts   a crown is so many cones one over the other (near, far), each pushed up to `lean` of its radius aside
//            and of five to seven sides, so no two crowns share an outline;
//   spread   a crown's radius over its height, `wide` either way of it by the tree;
//   colour   under the rock sheet's own grain, a pine wood seen across a valley in winter, nearly black against
//            the snow; each tree `shade` either way of it, and its upper skirts paler by up to `laden` toward the
//            snow lying on them (`snow`);
//   kinds    not one kind of tree: of every tree `pine` are red pines (a bare stem for `stem` of the height under
//            rounded crowns `flat` times a fir's width, `crowns` of them near, holding `lying` of a fir's snow, bark `bark`), `bare` are leafless
//            broadleaves (oak, chestnut: a grey-brown egg of twigs, `twigs`), and `bareEdge` more of those where
//            the wood thins, since the open edge and the valley floor are where they stand; the rest are firs,
//            the cones above. A hillside of one cone repeated read as a pattern, not as a wood.
// Out to `near.to` m from the middle every tree is its own crown on a shaken grid of `every` m; beyond, to the far
// country's edge, one cone stands for a clump on a grid of `far.every` m. All by eye, against photographs of pine
// hills in snow. The low tier draws the near trees on a grid half again as wide and the clumps on one twice as wide.
const PY_WOODS = {
  cover: 0.5, patch: 200, rise: 0.22, edge: 0.035, clump: 46, glade: 0.75,
  near: { every: 9, to: 460, high: [6, 14], skirts: 3 }, far: { every: 26, high: [12, 21], skirts: 2 },
  small: 0.55, oldOne: 0.07, old: 1.4, lean: 0.22, spread: 0.23, wide: 0.3,
  colour: [0.2, 0.27, 0.19], shade: 0.3, laden: 0.55, snow: [0.6, 0.65, 0.72],
  kinds: { pine: 0.38, bare: 0.14, bareEdge: 0.3, stem: 0.4, flat: 1.3, crowns: 2, lying: 0.45, bark: [0.3, 0.21, 0.16], twigs: [0.4, 0.37, 0.35] },
  // The woods are drawn in tiles `tile` m square, each its own mesh, so that what is behind the camera or outside the
  // frame is not drawn at all (three's culling by each mesh's bounds); as one mesh round the whole place every tree
  // of the 3 km square was drawn in every view. Drawn the same: only what cannot be seen is left out.
  tile: 300,
};

/** The river south of the ground (0..1: 1 on its ice), a few hundred metres wide, running east-west. */
const pyRiver = (z) => { const [a, b, c, d] = PYONGYANG_PLACE.river.z; return pySmooth(a, b, z) * (1 - pySmooth(c, d, z)); };

/** How far (m) a point lies outside the walked ground's fields (the town's square and the bank and ice to the south): 0 on them. */
function pyOffWalked(x, z) {
  const t = PYONGYANG_PLACE;
  const square = Math.max(Math.abs(x) - 148, Math.abs(z) - 129, 0);
  const [sx0, sx1] = t.river.field.x;
  const south = Math.max(sx0 + 1 - x, x - (sx1 - 1), t.outside.z[1] - 1 - z, z - (t.river.field.to - 1), 0);
  return Math.min(square, south);
}

/** The far country's height (m) at (x, z) beyond the walked ground: hills rising with distance, higher to the north, and the river's level of ice. */
function pyFar(x, z) {
  const t = PYONGYANG_PLACE;
  const out = Math.max(Math.abs(x) - 150, Math.abs(z) - 130, 0);
  // (Ridges about 500 m apart; the noise repeats every 8 km.)
  const ridge = tkFbm((x + 4000) / 8000, (z + 4000) / 8000, 16, 3, 9);
  // (Low rounded hills, as that country's are: a rise of about one in eight on the mean, half as much again to the north.)
  // (Lower to the east, where the town runs on toward the river.)
  const hills = out * (0.03 + 0.4 * ridge * ridge) * (0.5 + pySmooth(60, -400, z)) * (0.3 + 0.7 * pySmooth(160, -150, x));
  const river = pyRiver(z);
  const zc = Math.max(t.outside.z[0], Math.min(t.outside.z[1], z));
  const near = x <= 1 ? pyOutside(Math.max(t.outside.x[0], x), zc) : pyFoot(zc);
  return (near + hills) * (1 - river) + t.river.ice * river;
}

/** The name board's face: the gate's name painted on a dark board (a canvas: no picture is loaded). */
function pyNameBoard(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#141211';
  context.fillRect(0, 0, 384, 128);
  context.fillStyle = '#d9c27a';
  context.font = '600 92px "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  // (Read right to left, as a gate's board is.)
  [...name].reverse().forEach((mark, index) => context.fillText(mark, 70 + index * 122, 68));
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.28, 0.58), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }));
  board.name = 'gate-name';
  return board;
}

// The road's ribbon: how far above the ground it is laid (m: enough not to flicker against it at the distances it is seen
// from, too little to show as a step) and its strips' length along the road (half the ground's own cell, so it bends with it).
const PY_ROAD = { proud: 0.04, step: 2.5 };

// The place's lie (townkit/lay.js): the ground it maps (the walked ground: the field, the wall, the town), a texel's
// side (m: coarser than a town's lanes need, the ground being four times a town's; null on the low tier, which takes
// the kit's own), and the wind of the day for what it lays: out of the north-west, as that country's winter wind is
// (toward [x, z]), so the wall's outer face is the windward one and the snow piles at its foot.
const PY_LAY = { box: { x: [-150, 116], z: [-130, 130] }, texel: 0.2, wind: [0.8, 0.6] };

// The columns' ways over the field. Men crossing open snow under fire do not walk a ruled line: each file follows
// the one before it round the knolls and drifts, the ways draw together and part, and they spread only where the
// columns massed before the wall. So each way is a line from the camps' side (x = `from`) to its ladder, pushed
// sideways by a slow seeded sway (`sway`: [length m, reach m] waves, their phases by the way's number) that dies
// away over the last `gather` m before the wall, where a ladder's foot is the one place every man must come to.
// Narrow and faint far out (`far`: half-width m, strength), wide and beaten near the wall (`near`, from `mass` m
// out), and now and then a way leaves one column for the next (`cross`: [x from, x to] of each such path, between
// neighbouring ways). By eye, against photographs of paths trodden over snowfields; none of it from a record.
const PY_COLUMNS = { from: -135, step: 6, sway: [[84, 5.5], [37, 2.2], [15, 0.7]], gather: 26, mass: 34, far: { half: 1.3, strength: 0.7 }, near: { half: 2.6, strength: 0.85 }, cross: [[-112, -84], [-66, -44]] };

/** How far aside (m, along z) the k-th column's way runs at x. */
function pyColumnAside(x, to, k) {
  const c = PY_COLUMNS;
  let aside = 0;
  for (const [i, [length, reach]] of c.sway.entries()) aside += reach * Math.sin((x / length) * 2 * Math.PI + 2.4 * k + 1.7 * i * (k + 1));
  return aside * pySmooth(0, c.gather, to - x);
}

/** The k-th column's way to its ladder at (to, z): lay.js ways, the far run and the massed one. */
function pyColumnWay(to, z, k) {
  const c = PY_COLUMNS;
  const at = (x) => [x, z * (1 + (0.3 * (to - x)) / (to - c.from)) + pyColumnAside(x, to, k)];
  const [far, near] = [[], []];
  for (let x = c.from; x < to - c.mass; x += c.step) far.push(at(x));
  far.push(at(to - c.mass));
  for (let x = to - c.mass; x < to; x += c.step) near.push(at(x));
  near.push([to, z]);
  return [{ line: far, kind: 'foot', ...c.far }, { line: near, kind: 'foot', ...c.near }];
}

/**
 * Where feet and wheels went (lay.js `ways`): the road out from the gate and through it (carts), the street in the
 * town, the columns' way over the field to the ladders (a wide trampled front), along the wall's foot, and the walk.
 */
function pyWays(plan) {
  const t = PYONGYANG_PLACE;
  const { wall } = plan;
  const road = [];
  for (let x = t.outside.x[0] + 2; x < wall.x - t.gate.out; x += 5) road.push([x, pyRoad(x)]);
  road.push([wall.x - t.gate.out, t.gate.z], [plan.east - 34, t.gate.z]);
  const walk = wall.x + wall.face + wall.thick + (wall.walk - wall.thick) / 2;
  return [
    { line: road, half: 1.9, kind: 'cart', strength: 1 },
    { line: [[61, t.gate.z], [61, -t.strip[0] - 3.5]], half: 1.6, kind: 'foot', strength: 0.8 },
    // (The columns: three files' breadth each to the three ladders, and the ground before the wall where they massed.)
    ...t.wall.ladders.flatMap((z, k) => pyColumnWay(wall.x - 0.5, z, k)),
    // (And the paths between them, each from one column's way over to the next.)
    ...PY_COLUMNS.cross.map(([x0, x1], k) => {
      const [a, b] = [pyColumnWay(wall.x - 0.5, t.wall.ladders[k % t.wall.ladders.length], k % t.wall.ladders.length)[0].line, pyColumnWay(wall.x - 0.5, t.wall.ladders[(k + 1) % t.wall.ladders.length], (k + 1) % t.wall.ladders.length)[0].line];
      const nearest = (line, x) => line.reduce((best, point) => (Math.abs(point[0] - x) < Math.abs(best[0] - x) ? point : best));
      const [from, to] = [nearest(a, x0), nearest(b, x1)];
      return { line: [from, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 1.2 * (k % 2 ? 1 : -1)], to], kind: 'foot', half: 0.9, strength: 0.6 };
    }),
    { line: [[wall.x - 2.2, -t.strip[0]], [wall.x - 2.2, t.strip[0]]], half: 2.4, kind: 'foot', strength: 1 },
    { line: [[walk, t.wall.z[0] + 6], [walk, t.wall.z[1]]], half: 0.9, kind: 'foot', strength: 0.7 },
  ];
}

// The siege's litter and the garrison's gear, laid by rule (seeded) along the wall and over the columns' ground.
// None of it is from a record of the day: what an assaulted wall and a winter camp have about them, typical.
//   clear      |z| inside which nothing is laid: the battle's own ground and works (its strip is |z| <= 10).
//   banners    the garrison's standing banners on the walk's inner edge: one about every `every` m of wall, a
//              `share` of the places taken, `high` m of pole. (The town was held by a Japanese army, whose tall
//              laced banners are the nobori; white fields with dark bands: typical, no house's own device.)
//   braziers   watch fires on the walk, one about every `every` m; `shot`: heaps of stones for throwing down.
//   ladders, mantlets, arrows   how many broken ladders lie or lean at the wall's foot, how many siege shields
//              stand or lie on the field within bowshot of it, how many clusters of spent arrows.
//   camps      the attackers' fires behind the columns' ground: [x, z] each, with `fires` fires, `flags` flags
//              (red and yellow squares and pennons: the usual run of Ming field flags, approximate), carts and
//              stacks of timber for ladders.
//   hearths    the share of the town's houses with a fire lit (smoke from a clay stack at the house's end).
//   icicles    the share of each near house's eaves that carry them; the pavilion's eaves have them too.
//   drift      the snow the north-west wind has piled against the windward feet: the wall's outer face (its
//              head `high` m up the face, lying out `run` m) and the houses' windward walls (less: they stand in
//              the wall's lee). Drifted snow against a 4.5 m wall in open country stands from a few decimetres
//              to a metre: by eye inside that.
//   grows      how well dead grass stands through the snow on the open ground and in the town's yards, and
//              `thick`: how much thicker than a paved town's weeds (things.js TK_SCATTER) a winter field's stand.
const PY_SIEGE = {
  clear: 13,
  banners: { every: 17, share: 0.75, high: 3.8 }, braziers: { every: 34 }, shot: { every: 13, share: 0.6 },
  ladders: 6, mantlets: 11, arrows: 28,
  camps: [{ at: [-122, 31], fires: 3, flags: 5 }, { at: [-116, -27], fires: 2, flags: 4 }],
  hearths: 0.34, icicles: 0.6,
  drift: { wall: { high: [0.3, 0.95], run: 2.8 }, house: { high: [0.08, 0.34], run: 1.1 } },
  grows: { field: 0.5, town: 0.7, thick: 3 },
  //   fronts     what stands along a near house's front, each a share of the houses (one die each): `jars`, the
  //              brown-black glazed storage jars (onggi) of a Korean house, kept outside in rows of `jarCount`, as
  //              a yard's jar terrace keeps them, lidded (`jarHigh` m); `wood`, a stack of firewood for the winter
  //              against the wall; `tubs`, a tub, a basket or both; `spears`, the garrison's spare spears and poles
  //              leaned on the wall (the town was held as a fortress). `onggi`: the glaze's colour (approximate).
  //   dropped    poles and spears dropped on the field before the wall by the columns, in bundles of 1 to 3
  //              (how many), and baskets and tubs left in the camps.
  //   lights     the gate's lights at the hour of the assault (before dawn into the morning: a garrison keeps its
  //              gate lit through the night): `lantern`, a pale paper lantern each side of the pavilion's middle bay
  //              (`aside` m from its middle, its globe `high` m over the terrace, `out` m outside the column line
  //              under the eave, `size` m in radius); `torch`, a pitch torch in an iron bracket on the gate's face
  //              each side of the arch (`aside` m beyond the passage's side, `high` m up, `out` m off the face,
  //              its flame `flame` of a brazier's). Typical, not from a record of the gate.
  lights: { lantern: { aside: 2.4, high: 2.05, out: 0.55, size: 0.3 }, torch: { aside: 1.1, high: 2.7, out: 0.45, flame: 0.45 } },
  fronts: { jars: 0.32, jarCount: [2, 6], jarHigh: [0.48, 0.95], onggi: [0.24, 0.15, 0.1], wood: 0.26, tubs: 0.22, spears: 0.12 },
  dropped: { poles: 14, campThings: 4 },
};

/**
 * Dress the place (after its lie is baked: the drifts and the scatter are laid by it): the garrison's banners,
 * fires and stones on the wall, the siege's litter before it, the camps, the town's hearths and icicles, the
 * drifts, and what stands through the snow. `stir`: the kit's moving things (townkit/stir.js).
 */
function pyDress(blocks, stir, plan, lay, eave, tier) {
  const t = PYONGYANG_PLACE;
  const s = PY_SIEGE;
  const { wall, head } = plan;
  const random = tkRandom(15930208);
  const outside = (x, z) => tkFieldAt(plan.outside, Math.max(t.outside.x[0], Math.min(wall.x, x)), Math.max(t.outside.z[0], Math.min(t.outside.z[1], z)));
  const gated = (z, room = 2) => Math.abs(z - t.gate.z) < t.gate.wide / 2 + room;
  const walkTop = (z) => pyFoot(z) + wall.high;
  const inner = head - 0.3;
  const behind = wall.x + wall.face + wall.thick + 0.55;

  // On the wall: banners, watch fires, heaps of shot. (Each on its own grid along the wall, a little off it.)
  const along = (every, work) => {
    for (let z = t.wall.z[0] + 9; z < t.wall.z[1] - 2; z += every) {
      const at = z + (random() - 0.5) * every * 0.5;
      if (!gated(at) && Math.abs(at) > s.clear) work(at);
    }
  };
  along(s.banners.every, (z) => {
    if (random() > s.banners.share) return;
    const dark = [0.1, 0.1, 0.12];
    const bands = random() < 0.5 ? [[0.08, 0.2, dark], [0.26, 0.38, dark]] : [[0.1, 0.34, dark]];
    stir.nobori(blocks.at(inner, z), inner, z, walkTop(z), walkTop(z) + s.banners.high * (0.9 + 0.2 * random()), { yaw: Math.PI / 2, long: 2.7, wide: 0.62, bands });
  });
  along(s.braziers.every, (z) => stir.fire(...tkBrazier(blocks.at(inner, z), inner - 0.35, walkTop(z), z)));
  along(s.shot.every, (z) => {
    if (random() < s.shot.share) tkStack(blocks.at(behind, z), tkgFrame(behind, walkTop(z), z, Math.PI / 2), { kind: 'shot', long: 1.1 + random(), high: 0.4, deep: 0.6, seed: Math.round(z) });
  });
  // The gate's terrace: a banner at each outer corner, a fire by each stair's head.
  for (const side of [-1, 1]) {
    const z = t.gate.z + side * (t.gate.wide / 2 - 0.9);
    const x = wall.x - t.gate.out + 0.7;
    stir.nobori(blocks.at(x, z), x, z, t.gate.high, t.gate.high + 4.6, { yaw: Math.PI / 2, long: 3.4, wide: 0.75, bands: [[0.1, 0.3, [0.1, 0.1, 0.12]]] });
    stir.fire(...tkBrazier(blocks.at(x, z), wall.x - t.gate.out + t.gate.deep - 0.9, t.gate.high, z));
  }
  // The gate's lights (PY_SIEGE.lights): paper lanterns under the pavilion's front eave, torches either side of the
  // passage's outer mouth.
  const pavilionAt = pyPavilions().gate;
  const front = t.pavilion[0].depth / 2 + s.lights.lantern.out;
  for (const side of [-1, 1]) {
    stir.lantern(...pavilionAt(side * s.lights.lantern.aside, s.lights.lantern.high, front), { size: s.lights.lantern.size, colour: TK_GLOW.paper.pale, lit: 'pale' });
    const [x, z] = [wall.x - t.gate.out - 0.02, t.gate.z + side * (t.gate.way / 2 + s.lights.torch.aside)];
    const [tx, ty] = [x - s.lights.torch.out, s.lights.torch.high];
    const builder = blocks.at(x, z);
    builder.tube('timber', [[x, ty - 0.35, z], [tx + 0.08, ty - 0.12, z]], 0.018, 0.018, { sides: 4, colour: TK_THINGS.iron });
    builder.tube('timber', [[tx + 0.12, ty - 0.55, z], [tx, ty, z]], 0.03, 0.035, { sides: 5, colour: [0.2, 0.15, 0.1] });
    stir.fire(tx, ty, z, s.lights.torch.flame);
  }
  // Snow blowing off the wall's top (its parapet's crest, in lengths) and off the gate pavilion's ridge.
  const crest = wall.x + wall.face + wall.thick / 2;
  for (const run of plan.runs) {
    for (let k = 0; k + 4 < run.length; k += 4) stir.spindrift([crest, run[k][3] + wall.parapet, run[k][1]], [crest, run[k + 4][3] + wall.parapet, run[k + 4][1]]);
  }
  const pavilion = pyPavilions().gate;
  stir.spindrift(pavilion(-t.pavilion[1].width / 2, eave + 1.9, 0), pavilion(t.pavilion[1].width / 2, eave + 1.9, 0));

  // Before the wall: broken ladders at its foot, shields on the field, spent arrows; all off the battle's strip.
  const off = () => (random() < 0.5 ? -1 : 1) * (s.clear + random() * 46);
  for (let k = 0; k < s.ladders; k += 1) {
    const z = off();
    if (gated(z, 4)) continue;
    const x = wall.x - 1.2 - 2.2 * random();
    const builder = blocks.at(x, z);
    if (k % 2) tkLadder(builder, [x, outside(x, z), z], [wall.x - 0.04, outside(wall.x, z) + 2.4 + 1.6 * random(), z + (random() - 0.5) * 1.2], { wide: 0.55 });
    else {
      const turn = random() * Math.PI;
      const far = [x - 3.6 * Math.abs(Math.cos(turn)), z + 3.6 * Math.sin(turn)];
      tkLadder(builder, [x, outside(x, z) + 0.07, z], [far[0], outside(...far) + 0.07, far[1]], { wide: 0.55 });
    }
  }
  for (let k = 0; k < s.mantlets; k += 1) {
    const [x, z] = [-14 - 60 * random() * random(), off()];
    if (Math.abs(z - pyRoad(x)) < 4) continue;
    tkMantlet(blocks.at(x, z), tkgFrame(x, outside(x, z), z, -Math.PI / 2 + (random() - 0.5) * 0.7), { wide: 1.3 + 0.5 * random(), seed: k + 1, fallen: k % 3 === 0 });
  }
  for (let k = 0; k < s.arrows; k += 1) {
    // (Most where the columns stood under the wall's bows; some over the wall, on the bank and the first yards.)
    const over = k % 5 === 0;
    const [x, z] = over ? [head + wall.bank + 2 + 12 * random(), off()] : [-3 - 50 * random() * random(), off() * 0.8];
    if (gated(z, 1) && over) continue;
    tkArrows(blocks.at(x, z), x, over ? tkFieldAt(plan.inside, x, z) : outside(x, z), z, { count: 3 + Math.floor(6 * random()), spread: 1.2 + random(), from: over ? 0 : Math.PI, seed: k + 1 });
  }
  // The camps behind the columns' ground: fires, flags, carts, timber for ladders, sacks.
  const red = [0.72, 0.1, 0.08];
  const yellow = [0.86, 0.66, 0.14];
  for (const [index, camp] of s.camps.entries()) {
    const [cx, cz] = camp.at;
    const place = (reach) => { const a = random() * Math.PI * 2; const d = reach * (0.35 + 0.65 * random()); return [cx + Math.cos(a) * d, cz + Math.sin(a) * d * 0.8]; };
    for (let k = 0; k < camp.fires; k += 1) {
      const [x, z] = place(9);
      stir.fire(...tkCampfire(blocks.at(x, z), x, outside(x, z), z, { seed: index * 10 + k }), 1.3);
    }
    for (let k = 0; k < camp.flags; k += 1) {
      const [x, z] = place(13);
      const foot = outside(x, z);
      stir.flag(blocks.at(x, z), x, z, foot, foot + 3.2 + 1.2 * random(), k % 3 === 2 ? { cut: 'pennon', fly: 1.9, hoist: 0.7, colour: yellow } : { fly: 1.3, hoist: 1.2, colour: k % 2 ? yellow : red });
    }
    for (let k = 0; k < 2; k += 1) {
      const [x, z] = place(12);
      tkCart(blocks.at(x, z), tkgFrame(x, outside(x, z), z, random() * 6.28), { tipped: k === 1, load: k ? null : TK_THINGS.hemp });
      const [tx, tz] = place(11);
      tkStack(blocks.at(tx, tz), tkgFrame(tx, outside(tx, tz), tz, random() * 3.14), { kind: 'timber', long: 3.6, high: 0.5, deep: 0.9, seed: index * 4 + k });
      const [fx, fz] = place(8);
      tkFirewood(blocks.at(fx, fz), tkgFrame(fx, outside(fx, fz), fz, random() * 3.14), { long: 1.4, high: 0.6, seed: index * 6 + k });
      const [sx, sz] = place(7);
      tkSacks(blocks.at(sx, sz), sx, outside(sx, sz), sz, { count: 3 + k, seed: index * 8 + k });
    }
  }
  // Poles and spears dropped on the field, lying in the snow; baskets and tubs left about the camps.
  for (let k = 0; k < s.dropped.poles; k += 1) {
    const [x, z] = [-6 - 70 * random() * random(), off()];
    if (Math.abs(z - pyRoad(x)) < 3) continue;
    const yaw = random() * Math.PI;
    for (let n = 0, count = 1 + Math.floor(random() * 3); n < count; n += 1) {
      const [dx, dz] = [Math.cos(yaw + 1.6) * n * 0.12, Math.sin(yaw + 1.6) * n * 0.12];
      const half = 1.4 + 0.6 * random();
      const [ax, az, bx, bz] = [x + dx - Math.cos(yaw) * half, z + dz - Math.sin(yaw) * half, x + dx + Math.cos(yaw) * half, z + dz + Math.sin(yaw) * half];
      blocks.at(x, z).tube('timber', [[ax, outside(ax, az) + 0.03, az], [bx, outside(bx, bz) + 0.03, bz]], 0.02, 0.018, { sides: 5, colour: TK_THINGS.oldWood.map((value) => value * (0.8 + 0.4 * random())) });
    }
  }
  for (const camp of s.camps) {
    for (let k = 0; k < s.dropped.campThings; k += 1) {
      const a = random() * Math.PI * 2;
      const d = 4 + 8 * random();
      const [x, z] = [camp.at[0] + Math.cos(a) * d, camp.at[1] + Math.sin(a) * d * 0.8];
      if (k % 2) tkTub(blocks.at(x, z), x, outside(x, z), z, { wide: 0.45 + 0.2 * random() });
      else tkBasket(blocks.at(x, z), x, outside(x, z), z, { full: random() < 0.6 ? TK_THINGS.hemp : null });
    }
  }
  // Dressed stone for mending the wall, stacked inside by the gate; sacks under the passage's inner mouth.
  for (const side of [-1, 1]) tkStack(blocks.at(head + 13, t.gate.z), tkgFrame(head + 13, 0, t.gate.z + side * 6.5, 0.2 * side), { kind: 'stone', long: 2.2, high: 0.9, deep: 1.1, seed: 5 + side });

  // The town: a clay stack and its smoke at the end of each house with a fire lit; icicles along the near eaves.
  for (const house of plan.houses) {
    const dice = tkRandom(house.seed * 31 + 5);
    const frame = tkgFrame(house.at[0], 0, house.at[1], house.yaw ?? 0);
    if (dice() < s.hearths) {
      const [x, , z] = frame(house.width / 2 + 0.45, 0, -house.depth / 2 + 0.8);
      blocks.at(house.at[0], house.at[1], house.far).round('plaster', tkgFrame(x, 0, z), 0, 0, 0, 2.3, 0.2, 0.15, { colour: [0.5, 0.44, 0.38], sides: 7 });
      stir.smoke(x, 2.4, z, house.far ? 1.5 : 1.1);
    }
    if (house.far) continue;
    // (Along its front, inside the eave's line: PY_SIEGE.fronts. At its two ends, clear of the doors in its middle.)
    const f = s.fronts;
    const front = frame.child(0, 0, house.depth / 2);
    const foot = (x, z) => { const [wx, , wz] = front(x, 0, z); return [wx, tkFieldAt(plan.inside, wx, wz), wz]; };
    const end = (dice() < 0.5 ? -1 : 1) * (house.width / 2 - 0.55);
    const builder = blocks.at(house.at[0], house.at[1]);
    builder.at('near', () => {
      if (dice() < f.jars) {
        const count = f.jarCount[0] + Math.floor(dice() * (f.jarCount[1] - f.jarCount[0] + 1));
        for (let k = 0; k < count; k += 1) {
          const high = f.jarHigh[0] + (f.jarHigh[1] - f.jarHigh[0]) * dice();
          const [x, y, z] = foot(end - Math.sign(end) * k * 0.62, 0.45 + 0.2 * dice() + (k % 2) * 0.35);
          tkJar(builder, x, y, z, { high, colour: f.onggi.map((value) => value * (0.85 + 0.35 * dice())), lid: dice() < 0.8 });
        }
      } else if (dice() < f.wood) {
        const [x, y, z] = foot(end - Math.sign(end) * 0.5, 0.25);
        tkFirewood(builder, tkgFrame(x, y, z, (house.yaw ?? 0)), { long: 1.2 + 0.8 * dice(), high: 0.6 + 0.5 * dice(), seed: house.seed });
      }
      if (dice() < f.tubs) {
        const [x, y, z] = foot(-end * 0.6, 0.5);
        if (dice() < 0.5) tkTub(builder, x, y, z, { wide: 0.4 + 0.2 * dice() });
        else tkBasket(builder, x, y, z, { wide: 0.45 + 0.15 * dice(), full: dice() < 0.5 ? TK_THINGS.splitWood : null });
      }
      if (dice() < f.spears) {
        const [x, y, z] = foot(-end * 0.3, 0);
        tkPoles(builder, tkgFrame(x, y, z, (house.yaw ?? 0) + Math.PI), { count: 2 + Math.floor(dice() * 4), long: 3.2, colour: TK_THINGS.oldWood, seed: house.seed + 1 });
      }
    });
    const h = house.heights?.[0] ?? 3;
    const reach = house.depth / 2 + (house.roof?.overhang ?? TK_HOUSE.overhang) - 0.03;
    for (const side of [-1, 1]) {
      if (dice() > s.icicles) continue;
      const [from, to] = [-house.width * (0.15 + 0.3 * dice()), house.width * (0.15 + 0.3 * dice())];
      blocks.at(house.at[0], house.at[1]).at('near', () => tkIcicles(blocks.at(house.at[0], house.at[1]), frame(from, h - 0.05, side * reach), frame(to, h - 0.05, side * reach), { seed: house.seed + side, long: 0.5 }));
    }
  }

  // The drifts: against the wall's outer face (not where the columns trod it away, nor in the gate's mouth), and
  // against each near house's windward walls.
  const unworn = (x, z) => Math.max(0, 1 - 1.6 * lay.lay.at(x, z).wear);
  const [wx, wz] = PY_LAY.wind;
  for (const run of plan.runs) {
    for (let k = 0; k + 1 < run.length; k += 1) {
      const [z0, z1] = [run[k][1], run[k + 1][1]];
      // (Walked south to north, the windward side, the west, is on the left.)
      tkDrift(blocks.at(wall.x, (z0 + z1) / 2), [wall.x, z1], [wall.x, z0], { ...s.drift.wall, heightAt: outside, share: (x, z) => unworn(wall.x - 1.5, z) * pySmooth(t.strip[0] + 0.5, t.strip[0] + 5, Math.abs(z)), seed: 1, taper: false });
    }
  }
  for (const house of plan.houses) {
    if (house.far) continue;
    const frame = tkgFrame(house.at[0], 0, house.at[1], house.yaw ?? 0);
    const [w, d] = [house.width / 2, house.depth / 2];
    const corners = [[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, z]) => frame(x, 0, z));
    for (let k = 0; k < 4; k += 1) {
      const [p, q] = [corners[k], corners[(k + 1) % 4]];
      // (This side's outward way, to the left of the walk p to q: a drift only where the wind blows onto it.)
      const length = Math.hypot(q[0] - p[0], q[2] - p[2]);
      const out = [(q[2] - p[2]) / length, -(q[0] - p[0]) / length];
      const mid = frame(0, 0, 0);
      const outward = ((p[0] + q[0]) / 2 - mid[0]) * out[0] + ((p[2] + q[2]) / 2 - mid[2]) * out[1] > 0;
      const [a, b] = outward ? [p, q] : [q, p];
      const way = outward ? out : [-out[0], -out[1]];
      if (way[0] * wx + way[1] * wz > -0.4) continue;
      tkDrift(blocks.at(house.at[0], house.at[1]), [a[0], a[2]], [b[0], b[2]], { ...s.drift.house, heightAt: (x, z) => tkFieldAt(plan.inside, x, z), share: (x, z) => unworn(x + way[0] * 0.8, z + way[1] * 0.8), seed: house.seed + k });
    }
  }

  // What stands through the snow and lies in it: dead grass at the wall feet and in the hollows, loose stones,
  // straw trodden about the camps and the yards. (Not drawn on the low tier.)
  if (tier === 'low') return null;
  const straw = [TK_THINGS.straw, TK_THINGS.straw.map((value) => value * 0.75), [0.5, 0.42, 0.3]];
  return tkScatter(blocks, lay.lay, {
    box: { x: [t.outside.x[0] + 2, plan.edge], z: [t.outside.z[0] + 2, t.outside.z[1] - 2] }, seed: 3, colour: TK_THINGS.dead, litter: straw, thick: s.grows.thick,
    heightAt: (x, z) => (x <= wall.x ? outside(x, z) : x < head ? pyFoot(z) : tkFieldAt(plan.inside, x, z)),
    grows: (x, z) => (x > wall.x - 0.2 && x < head + 0.2 ? null : gated(z, -6) && x < head + 14 && x > wall.x - 4 ? null : x <= wall.x ? s.grows.field : s.grows.town),
  });
}

/** The dead reeds standing in the river's frozen edges, near and far bank (PYONGYANG_PLACE.river.reeds), on the south field's ground: fine detail. */
function pyReeds(blocks, plan) {
  const t = PYONGYANG_PLACE;
  const r = t.river.reeds;
  const random = tkRandom(7717);
  const [x0, x1] = [t.river.field.x[0] + 4, t.river.field.x[1] - 4];
  for (let z = t.river.z[0]; z < t.river.field.to - 4; z += r.every * 0.5) {
    const share = pyRiver(z);
    if (share < r.from || share > r.to) continue;
    for (let x = x0; x < x1; x += r.every) {
      const [px, pz] = [x + r.every * random(), z + r.every * 0.5 * random()];
      // (In clumps, with gaps between where the ice comes to the bank.)
      if (tkFbm((px + 500) / 1000, (pz + 500) / 1000, 60, 2, 31) < 0.48 || random() < 0.35) continue;
      const builder = blocks.at(px, pz);
      const stems = r.stems[0] + Math.floor(random() * (r.stems[1] - r.stems[0] + 1));
      builder.at('near', () => {
        for (let k = 0; k < stems; k += 1) {
          const [sx, sz] = [px + (random() - 0.5) * 0.9, pz + (random() - 0.5) * 0.9];
          tkTuft(builder, sx, tkFieldAt(plan.south, sx, sz), sz, { size: r.high[0] + (r.high[1] - r.high[0]) * random(), wide: 0.22 + 0.16 * random(), colour: TK_THINGS.dead.map((value) => value * (0.6 + 0.3 * random())), yaw: random() * Math.PI, material: 'reed' });
        }
      });
    }
  }
}

// The wall's stone and the gate's timber as they stand in a northern winter, against the kit's own (TK_MATERIALS,
// TK_WORKS.stone), which are a southern canal town's dry pale limestone and new timber: granite masonry three
// centuries old darkened by lichen, soot and the damp of the thaws (`stone`: the kit's colour multiplied by it,
// about two thirds: a weathered granite face reads mid-grey, not cream, by eye against photographs of the walls of
// Hwaseong and of Seoul in winter and the reference frames), its joints holding more of the grime (`dirt`'s third),
// and the timber and the roof's tiles of a pavilion that has stood through as many winters greyed and darkened
// (`timber`, `tiles`). None measured.
// The snow the pines hold (townkit/build.js tkTree `laden`): a red pine's level pads of needles catch and keep new
// snow in cushions (a pine in a still frost after snow carries it for days), so on `share` of its pads a cushion
// lies, `size` of the pad across, `lift` of its size over it, on 'snowpad' (the needles' ragged outline, holding
// snow whatever it lies on). By eye against the reference frames and photographs of pines after snow.
const PY_LADEN = { share: 0.8, size: 0.82, lift: 0.12, material: 'snowpad' };

const PY_WEATHERED = {
  rubble: { ...TK_MATERIALS.rubble, colour: [0.66, 0.66, 0.67], dirt: [0.95, 1, 1, 0] },
  ashlar: { ...TK_MATERIALS.ashlar, colour: [0.7, 0.7, 0.71], dirt: [0.9, 0.9, 1, 0] },
  timber: { ...TK_MATERIALS.timber, colour: [0.72, 0.68, 0.64] },
  rooftile: { ...TK_MATERIALS.rooftile, colour: [0.82, 0.82, 0.84] },
  snowpad: { ...TK_MATERIALS.needles, snow: 3 },
};

/** The place built (a THREE.Group for render.js's places). */
export function buildPyongyang() {
  const t = PYONGYANG_PLACE;
  const plan = pyongyangPlan();
  const { wall } = plan;
  const tier = tkTier();
  const blocks = tkBlocks();
  // (The far woods by tiles of their own: PY_WOODS.tile.)
  const woods = tkBlocks(PY_WOODS.tile);
  // The ground: the two fields, tinted (the road to the gate and the trodden strip darker; the bank's earth), and the far country.
  const road = (x, z) => 1 - pySmooth(2.2, 5, Math.abs(z - pyRoad(x)));
  blocks.wide.at('all', () => {
    tkFieldMesh(blocks.wide, 'earth', plan.outside, { colourAt: (x, z) => { const worn = Math.max(road(x, z), 0.5 * (1 - pySmooth(6, 12, Math.abs(z)))); return [0.78 - 0.2 * worn, 0.74 - 0.2 * worn, 0.6 - 0.16 * worn]; } });
    // The bank and the ice to the south: earth where the land is, ice where the river is whole (as the far country draws it).
    const icy = (x, z) => pyRiver(z) > 0.85;
    tkFieldMesh(blocks.wide, 'earth', plan.south, { skip: icy, colourAt: () => [0.74, 0.7, 0.58] });
    tkFieldMesh(blocks.wide, 'ice', plan.south, { skip: (x, z) => !icy(x, z), colourAt: () => [0.8, 0.86, 0.9] });
    tkFieldMesh(blocks.wide, 'earth', plan.inside, { colourAt: (x, z) => { const worn = 1 - pySmooth(2.5, 6, Math.abs(z - t.gate.z)); return [0.72 - 0.16 * worn, 0.68 - 0.16 * worn, 0.58 - 0.14 * worn]; } });
    // The far country: a grid drawn together toward the middle (finer where it is nearer), each point with the slope's own normal.
    const cells = tier === 'low' ? 36 : 64;
    const reach = PY_FAR.reach;
    const warp = (s) => Math.sign(s) * Math.abs(s) ** 1.7 * reach;
    const points = Array.from({ length: cells + 1 }, (_, k) => warp((2 * k) / cells - 1));
    const corner = (i, j) => {
      const [x, z] = [points[i], points[j]];
      const d = 12;
      const normal = [(pyFar(x - d, z) - pyFar(x + d, z)) / (2 * d), 1, (pyFar(x, z - d) - pyFar(x, z + d)) / (2 * d)];
      const length = Math.hypot(...normal);
      // (Sunk under the walked ground where the two overlap, so that it never shows through it.)
      const out = pyOffWalked(x, z);
      return { p: [x, pyFar(x, z) - 0.3 - PY_FAR.sink * (1 - pySmooth(0, 30, out)), z], n: normal.map((value) => value / length), uv: [x / 6, -z / 6] };
    };
    const corners = Array.from({ length: cells + 1 }, (_, j) => Array.from({ length: cells + 1 }, (_, i) => corner(i, j)));
    // (The drawn ground's own height at a point: its triangles', not the hills' rule, so a tree stands on what is drawn.)
    const cellOf = (s) => Math.max(0, Math.min(cells - 1, Math.floor(((Math.sign(s) * (Math.abs(s) / reach) ** (1 / 1.7) + 1) * cells) / 2)));
    const drawnHeight = (x, z) => {
      const [i, j] = [cellOf(x), cellOf(z)];
      const [u, v] = [(x - points[i]) / (points[i + 1] - points[i]), (z - points[j]) / (points[j + 1] - points[j])];
      const [a, b, c, e] = [corners[j][i].p[1], corners[j][i + 1].p[1], corners[j + 1][i + 1].p[1], corners[j + 1][i].p[1]];
      return u >= v ? a + u * (b - a) + v * (c - b) : a + v * (e - a) + u * (c - e);
    };
    // The woods (PY_WOODS): by one seeded rule, never by hand.
    const w = PY_WOODS;
    const woodRandom = tkRandom(4421);
    const farFrame = tkgFrame(0, 0, 0, 0);
    const woodAt = (x, z) => tkFbm((x + 4000) / 8000, (z + 4000) / 8000, Math.round(8000 / w.patch), 3, 23) + (w.rise * Math.max(pyFar(x, z), 0)) / 100 - w.cover;
    // (How many of a wood's trees stand at a point, 0..1: thinning at its edge, and its glades.)
    const woodThick = (x, z) => pySmooth(-w.edge, 3 * w.edge, woodAt(x, z)) * (1 - w.glade * pySmooth(0.42, 0.6, tkFbm((x + 4000) / 8000, (z + 4000) / 8000, Math.round(8000 / w.clump), 2, 57)));
    const stand = (every, high, from, to, skirts) => {
      for (let z = -to; z < to; z += every) {
        for (let x = -to; x < to; x += every) {
          const [px, pz] = [x + every * woodRandom(), z + every * woodRandom()];
          const [size, kept, shade, girth, old, laden, turn, kind] = [woodRandom(), woodRandom(), woodRandom(), woodRandom(), woodRandom(), woodRandom(), woodRandom(), woodRandom()];
          const out = Math.max(Math.abs(px), Math.abs(pz));
          if (out < from || out >= to || pyOffWalked(px, pz) < 8 || pyRiver(pz) > 0.05) continue;
          const thick = woodThick(px, pz);
          if (kept >= thick) continue;
          const tall = (high[0] + (high[1] - high[0]) * size) * (w.small + (1 - w.small) * Math.min(1, thick * 1.5)) * (old < w.oldOne ? w.old : 1);
          const wide = tall * w.spread * (1 + w.wide * (2 * girth - 1));
          const foot = drawnHeight(px, pz) - 0.4;
          const tint = w.colour.map((part) => part * (1 + w.shade * (2 * shade - 1)));
          const sides = 5 + (Math.floor(turn * 3) % 3);
          const aim = turn * 6.283;
          const bare = w.kinds.bare + w.kinds.bareEdge * (1 - Math.min(1, thick * 1.5));
          if (kind < bare) {
            // A leafless broadleaf: a stem, and its twigs as one grey-brown egg, wider than a fir and a little lower.
            const round = wide * 1.25;
            const twigs = w.kinds.twigs.map((part) => part * (1 + w.shade * (2 * shade - 1)));
            if (skirts > 1) woods.at(px, pz).round('rock', farFrame, px, pz, foot, foot + tall * 0.4, tall * 0.022, tall * 0.016, { sides: 4, caps: '', colour: w.kinds.bark });
            woods.at(px, pz).round('rock', farFrame, px, pz, foot + tall * 0.34, foot + tall * 0.5, round * 0.6, round, { sides, caps: '', colour: twigs.map((part) => part * 0.86) });
            woods.at(px, pz).round('rock', farFrame, px, pz, foot + tall * 0.5, foot + tall * 0.9, round, round * 0.3, { sides, caps: 'top', colour: twigs });
            continue;
          }
          if (kind < bare + w.kinds.pine) {
            // A red pine: the stem bare and leaning, the crown in rounded masses, the upper one paler with its snow.
            const plates = skirts > 1 ? w.kinds.crowns : 1;
            const off = tall * 0.12 * (2 * girth - 1);
            if (skirts > 1) woods.at(px, pz).round('rock', farFrame, px + off * Math.cos(aim) * 0.4, pz + off * Math.sin(aim) * 0.4, foot, foot + tall * 0.8, tall * 0.024, tall * 0.014, { sides: 4, caps: '', colour: w.kinds.bark });
            for (let k = 0; k < plates; k += 1) {
              const y0 = foot + tall * (w.kinds.stem + (0.24 * k) / plates + 0.06 * laden);
              const radius = wide * w.kinds.flat * (1 - 0.3 * k) * (0.8 + 0.4 * size);
              const lying = (w.laden * w.kinds.lying * laden * (k + 1)) / plates;
              const [cx, cz] = [px + off * Math.cos(aim) + radius * 0.5 * Math.cos(aim + k * 2.4) * k, pz + off * Math.sin(aim) + radius * 0.5 * Math.sin(aim + k * 2.4) * k];
              woods.at(px, pz).round('rock', farFrame, cx, cz, y0 - tall * 0.1, y0, radius * 0.5, radius, { sides: sides + 1, caps: '', colour: tint.map((part) => part * 0.8) });
              woods.at(px, pz).round('rock', farFrame, cx, cz, y0, y0 + tall * 0.3, radius, radius * 0.22, { sides: sides + 1, caps: 'top', colour: tint.map((part, c) => part + (w.snow[c] - part) * lying) });
            }
            continue;
          }
          for (let k = 0; k < skirts; k += 1) {
            // (Each skirt a cone, the lower ones wider, the upper ones paler with what lies on them.)
            const [y0, y1] = [foot + tall * (0.2 + (0.52 * k) / skirts), foot + tall * (skirts === 1 ? 1 : 0.6 + (0.4 * (k + 1)) / skirts)];
            const radius = wide * (1 - (0.38 * k) / skirts);
            const aside = (w.lean * radius * k) / skirts;
            const lying = (w.laden * laden * (k + 1)) / skirts;
            woods.at(px, pz).round('rock', farFrame, px + aside * Math.cos(aim + k * 2.1), pz + aside * Math.sin(aim + k * 2.1), y0, y1, radius, 0.02, { sides: 5 + ((Math.floor(turn * 3) + k) % 3), caps: '', colour: tint.map((part, c) => part + (w.snow[c] - part) * lying) });
          }
        }
      }
    };
    stand(w.near.every * (tier === 'low' ? 1.5 : 1), w.near.high, 0, w.near.to, tier === 'low' ? 2 : w.near.skirts);
    stand(w.far.every * (tier === 'low' ? 2 : 1), w.far.high, w.near.to, reach, tier === 'low' ? 1 : w.far.skirts);
    for (let j = 0; j < cells; j += 1) {
      for (let i = 0; i < cells; i += 1) {
        const [a, b, c, e] = [corners[j][i], corners[j][i + 1], corners[j + 1][i + 1], corners[j + 1][i]];
        // (Left out where the walked ground's own fields are drawn.)
        if (pyOffWalked(a.p[0], a.p[2]) <= 0 && pyOffWalked(c.p[0], c.p[2]) <= 0 && pyOffWalked(a.p[0], c.p[2]) <= 0 && pyOffWalked(c.p[0], a.p[2]) <= 0) continue;
        const icy = pyRiver((a.p[2] + c.p[2]) / 2) > 0.85;
        const material = icy ? 'ice' : 'rock';
        const tone = icy ? [0.8, 0.86, 0.9] : [0.6, 0.58, 0.5];
        blocks.wide.tri(material, a.p, c.p, b.p, [a.uv, c.uv, b.uv], [tone, tone, tone], [a.n, c.n, b.n]);
        blocks.wide.tri(material, a.p, e.p, c.p, [a.uv, e.uv, c.uv], [tone, tone, tone], [a.n, e.n, c.n]);
      }
    }
  });
  // The wall: its two walked runs, and beyond them, unwalked: east along the hill's crest from the corner, and on south.
  // (Its face laid in jobs of different stone along it: TK_WORKS.masonry.)
  const masonry = TK_WORKS.masonry;
  for (const [index, run] of plan.runs.entries()) tkRampart(blocks.at(run[0][0], run[0][1]), run, { ...wall, gaps: index ? plan.gaps : [], masonry, seed: index + 1 });
  const crest = pyFoot(t.wall.z[0]);
  tkRampart(blocks.wide, Array.from({ length: 9 }, (_, k) => [plan.east + 60 - k * ((plan.east + 60 - wall.x) / 8), t.wall.z[0], crest, crest + wall.high]), { ...wall, inner: () => crest, masonry, seed: 7 });
  tkRampart(blocks.wide, pySouthRun(), { ...wall, inner: (node) => node[2], masonry, seed: 9 });
  // The gate: its block, the stairs up from the walk, the pavilion on its terrace; the corner's pavilion.
  const gate = blocks.at(wall.x, t.gate.z);
  tkGatehouse(gate, plan.gateFrame, t.gate);
  for (const [from, to] of pyGateStairs()) tkWorksStair(gate, from, to, wall.high, t.gate.high, { wide: wall.walk - wall.thick });
  const pavilions = pyPavilions();
  const eave = tkPavilion(gate, pavilions.gate, { storeys: t.pavilion });
  tkPavilion(blocks.at(wall.x, t.wall.z[0]), pavilions.corner, { storeys: t.corner, board: false, overhang: 1.2 });
  for (const house of plan.houses) tkHouse(blocks.at(house.at[0], house.at[1], house.far), house);
  for (const tree of plan.trees) tkTree(blocks.at(...tree.at), tree.at[0], tree.y, tree.at[1], { ...tree, laden: PY_LADEN });
  // The street in from the gate, cobbled, and the cross street.
  tkPaving(blocks.wide, 'street', wall.x - t.gate.out + t.gate.deep, plan.east - 34, t.gate.z - 2.6, t.gate.z + 2.6, 0.03, [0.86, 0.86, 0.84]);
  tkPaving(blocks.wide, 'street', 58.4, 63.6, t.gate.z + 2.6, -t.strip[0] - 3.5, 0.03, [0.86, 0.86, 0.84]);
  // The trodden ground: the road out from the gate (a ribbon laid on the ground's own heights) and the columns' way to the wall.
  // (Each strip of the ribbon takes the ground's height under its own corners, a finger above it: it has no sides to show
  // where the ground falls away across the road.)
  // (Each edge frays on its own: PY_TRACKS.)
  const ribbon = (from, to, middle, lane, seed, colour) => {
    const trod = (x, across) => { const z = middle(x) + across * pyFray(x, across < 0 ? seed : seed + 3); return [x, tkFieldAt(plan.outside, x, z) + PY_ROAD.proud, z]; };
    for (let x = to; x - PY_ROAD.step >= from; x -= PY_ROAD.step) {
      for (let k = 0; k + 1 < lane.length; k += 1) {
        const [a, b, c, d] = [trod(x, lane[k]), trod(x, lane[k + 1]), trod(x - PY_ROAD.step, lane[k + 1]), trod(x - PY_ROAD.step, lane[k])];
        // (Anticlockwise seen from above.)
        blocks.wide.quad('track', a, d, c, b, { uvs: [a, d, c, b].map((at) => [at[0], at[2]]), colour });
      }
    }
  };
  ribbon(t.outside.x[0] + 2, wall.x - t.gate.out, pyRoad, [-2.3, -0.8, 0.8, 2.3], 1, [0.92, 0.78, 0.56]);
  const strip = PY_TRACKS.strip;
  ribbon(-135, wall.x, (x) => pyWaves(x, PY_TRACKS.stripSway, 2) * pySmooth(0, 10, 1 - x), [-strip, -strip / 3, strip / 3, strip], 2, [0.95, 0.82, 0.6]);

  // The place's lie (townkit/lay.js): the gate's passage and the eaves' shade, the ground's low places, where the
  // columns and the town's people trod, and how the wind laid the snow against the wall.
  const head = plan.head;
  const lay = tkLayOf(blocks, tier, {
    box: PY_LAY.box, ways: pyWays(plan), wind: PY_LAY.wind, seed: 3, skip: [...TK_LAY.skip, 'snowpad'], ...(tier === 'low' ? null : { texel: PY_LAY.texel }),
    ground: (x, z) => (z > t.outside.z[1] ? tkFieldAt(plan.south, x, z) : x <= wall.x ? tkFieldAt(plan.outside, x, z) : x < head ? pyFoot(z) : tkFieldAt(plan.inside, x, z)),
  });

  const stir = tkStir(3);
  const scattered = pyDress(blocks, stir, plan, lay, eave, tier);
  pyField(blocks, plan, tier);
  pyReeds(blocks, plan);

  // (The river's ice is frozen, not open water: no pool's mirror. The wind scours lying snow off smooth ice into drifts
  // and bare patches more than off rough ground: it holds `snow` 0.6 of the ground's share (by eye against photographs
  // of a frozen river under new snow), swept into bands along the wind with bare ice between (`scour`); bare, the ice
  // is glossy, `rough` 0.15 (by eye). The reeds standing in its edge
  // are dead stems: snow does not lie on their blades, only on the ground at their feet.)
  // (The stone and the timber as a northern winter has them: PY_WEATHERED.)
  const materials = tkMaterialsFor(tier, { extra: { ice: { sheet: 'plaster', colour: [0.72, 0.8, 0.84], blotch: 0.5, plain: true, snow: 0.6, rough: 0.15, scour: 1 }, reed: { ...TK_MATERIALS.tuft, snow: 0 }, bare: { sheet: 'earth', blotch: 1.4, snow: 0.12, dirt: [0, 0.5, 0.3, 0] }, ...PY_WEATHERED, track: { sheet: 'earth', blotch: 1.2, snow: t.trodden }, street: { sheet: 'cobble', snow: t.trodden * 1.3 } } });
  const meshes = tkMeshes(blocks, materials, { tier });
  const woodMeshes = tkMeshes(woods, materials, { tier });
  woodMeshes.name = 'pyongyang-woods';
  const root = new THREE.Group();
  root.name = 'pyongyang';
  const sky = tkSky({ horizon: PY_LIGHT.haze, zenith: 0x7fa3d0, cloud: 0.3, cloudColour: 0xf4f4f0, radius: 2200, sun: PY_LIGHT.sun, glow: 0.3 });
  // The gate's name on its board (the story's: the Hamgu gate), on the outer side under the upper eave.
  const board = pyNameBoard('含毬門');
  board.position.set(...pavilions.gate(0, eave - 1.04, t.pavilion[1].depth / 2 + 0.41));
  board.rotation.y = -Math.PI / 2;
  const moved = stir.make(materials, tier);
  root.add(meshes, woodMeshes, moved.group, sky, board);
  // The open air (env/): the day's sun, a continental winter's clear cold air (a visibility of about 25 km:
  // approximate), a third of the sky in cloud; in snow, the open air's snow showers ('flurries': a flurry out of each
  // cloud that passes, the low sun between them on the new snow); without it, its clear day. The ground's own
  // heights for what lies and blows on it, and the gate passage's outer mouth, through which the afternoon sun
  // slants into the dark of the vault (an upright opening the passage's width and the arch's height to about its
  // haunches; a x b points in through it; `dust`: extinction per metre of the passage's air: 0.2, a sight of about
  // 15 m, as in blowing snow (spindrift and the showers' fine snow are funnelled through a gate's passage by the
  // wind, on top of a trodden passage's dust). At the 0.06 of dust alone the lit wedge of air between the mouth and
  // the sunlit north side, a few metres long at this sun, did not show against the bright mouth; at 0.2 it does).
  const mouth = wall.x - t.gate.out;
  const air = {
    description: {
      sun: PY_SUN, air: { visibility: 25000, hazeHeight: 900 }, clouds: { cover: 0.35 }, ground: { albedo: PY_GROUND_ALBEDO },
      height: (x, z) => { if (z > t.outside.z[1] && x >= t.river.field.x[0] && x <= t.river.field.x[1]) return tkFieldAt(plan.south, x, Math.min(z, t.river.field.to)); const zc = Math.max(t.outside.z[0], Math.min(t.outside.z[1], z)); return x <= wall.x ? tkFieldAt(plan.outside, Math.max(t.outside.x[0], x), zc) : x < head ? pyFoot(zc) : tkFieldAt(plan.inside, Math.min(plan.east, x), zc); },
      openings: [{ at: [mouth, 0, t.gate.z - t.gate.way / 2], a: [0, t.gate.spring + t.gate.rise * 0.6, 0], b: [0, 0, t.gate.way], floor: 0, dust: 0.2 }],
      // (The sun's strength judged on the field the battle is fought over, 34 m out from the wall, as the custom
      // battle's middle: at the wall's foot the rampart's own fill, in the heights above, shuts out a morning sun.)
      litAt: [wall.x - 34, 2, 0],
      // (The day's other hours: PY_HOURS. The overcast day keeps the afternoon's sun behind its lid.)
      days: {
        siegedawn: { sun: pySunAt({ ...PY_DAY, hour: PY_HOURS.dawn }), meter: PY_SHADE },
        siegesnow: { meter: PY_SHADE },
        siegemorning: { sun: pySunAt({ ...PY_DAY, hour: PY_HOURS.morning }) },
        siegelate: { sun: pySunAt({ ...PY_DAY, hour: PY_HOURS.late }) },
      },
    },
    // 'siegesnow', over the open air's snow showers ('flurries'), set for this ground and this sun: a pale winter sky
    // with a third of it in thin cloud, the low sun whole on the wall, a few flakes on the wind, and the air between
    // the showers full of fine snow, so the land steps back paler and bluer rank by rank and the sun stands in a glow.
    //   cover, deck  a third of the sky in thin cloud (0.32), soft slabs with veiled edges (deck 0.7);
    //   gloom        0.1: the cloud's underside nearly as light as the open air draws it (a thin cloud lit through
    //                by a low sun); at 0.45 it was mid-grey, at 0.85 near black against the blue behind the gate;
    //   sun          the sun whole between the clouds: it draws the wall and lays the long shadows;
    //   visibility,  4 km in a 200 m layer, `fine` 0.5: the fine snow and ice a shower leaves in the air (a few km
    //   hazeHeight,  of sight between snow showers: approximate), large grains that pale every colour nearly alike,
    //   fine         with the air's own blue over them. The far hills, 300 to 600 m off, are hazed by a quarter to
    //                a half and the gate at 40 m by under a twentieth (at 35 km, as before, the hills stood as
    //                sharp as the gate and the view had no depth);
    //   glare        the forward glow of those grains round the sun (ENV_WEATHER `glare`): twice the sun's light
    //                on the ground at the sun's place, half that 8 degrees off, by eye against the reference
    //                frames of low winter sun through snow haze (a white bloom some 15 to 20 degrees across);
    //   fall.thick   12 km of sight in the thick of a shower: a showery snow, not a blizzard. The falling snow's
    //                veil is lit as if the sun reached all of it, so toward the sun a thick one is a white wall in
    //                front of the cloud that sheds it. A workaround, asked of the open air as R10 (c);
    //   grade        the camera set for the sunlit snow and the shade let go dark, as a winter photograph against
    //                the light is: the curve steeper (contrast 1.7) with its ceiling at 4 white cards (sunlit snow
    //                and the glow round the sun reach it; at 6 they stayed grey under it), a third of a stop under
    //                the open air's meter (which already closes for lying snow); saturation 0.95, warmth +0.02 for
    //                the low sun. On the gate seen with the sun behind the camera the darkest twentieth of the frame
    //                went from 53 to 26 (of 255) and the brightest twentieth from 189 to 205, the middle kept (152 to
    //                145): the shade under eaves and in the masonry's joints dark beside lit snow.
    // All by eye, on the open air's high tier, against the sunward and the down-sun views of the wall and the
    // reference frames (a low sun behind thin cloud, the land stepping back into mist, deep shade beside lit snow).
    // 'siegesnowhazy': the same showers in the hazier, darker sky the gate views had before the sunward work (the
    // open air's own flurries haze: 14 km in its 900 m layer, and 4 km in the thick of a shower), kept to be compared
    // with the default, which it does not replace (the place's weather `hazy`).
    // The other hours and the overcast day (the place's `dawn`, `morning`, `late`, `overcast`), each a weather of
    // its own over the same showers or the open air's snow, set by eye against the default's views:
    //   siegedawn      clear after the night's snow, no shower: a still, cold morning after a clear night, when
    //                  the air chilled on the snow lies in the valley with the night's ice haze in it (a radiation
    //                  inversion: 2.5 km of sight in a 120 m layer, `fine` 0.3 for ice crystals, approximate), so
    //                  the near hills step back into it while the sky over it is clear; a little thin cloud
    //                  (0.12, soft: with 0.2 of slabs the sky beside the hills stood in a straight upright seam,
    //                  cause not found); the same glare as the default, a shade tighter (7 degrees), the camera's
    //                  balance for the shade the gate stands in (warmth -0.08: the low sun comes through
    //                  orange and the haze it lights would be brown on a daylight balance), the same steep curve;
    //   siegemorning   the default's pale sky and its showers, with the higher sun (unchanged by the glare work);
    //   siegelate      the default's showers thinned, the sun low and yellowing (its colour is the open air's own,
    //                  worked from the air it comes through) behind a haze of 4 km in a 150 m layer (the day's
    //                  snow haze settling as the air cools toward evening, `fine` 0.6), the glare a little stronger
    //                  for the longer path (2.5, 7 degrees), the camera a little warmer and two fifths of a stop down;
    //   siegeovercast  a grey snowy day: the open air's driving snow ('snow') eased to steady light snow (2.5 km of
    //                  sight, against its 700 m: the gate still reads across the field; approximate for light snow),
    //                  less wind, the lid lighter underneath.
    weathers: { snow: 'siegesnow', dawn: 'siegedawn', morning: 'siegemorning', late: 'siegelate', overcast: 'siegeovercast', hazy: 'siegesnowhazy', bare: 'clear' },
    first: 'snow',
    own: {
      siegesnow: ['flurries', { label: 'Snow showers on the wall', grade: { contrast: 1.7, white: 4, saturation: 0.95, warmth: -0.02, ev: -0.5 }, cover: 0.32, deck: 0.7, sun: 1, gloom: 0.1, fine: 0.3, visibility: 1800, hazeHeight: 70, glare: [2, 8], fall: { kind: 'snow', share: 1, under: [0.04, 0.16], least: 0.12, thick: 12000 } }],
      siegedawn: ['flurries', { label: 'Clear morning on the wall', grade: { contrast: 1.7, white: 4, saturation: 0.92, warmth: -0.14, ev: -0.4 }, cover: 0.28, deck: 0.8, sun: 1, gloom: 0, fine: 0.1, visibility: 1200, hazeHeight: 60, glare: [2.5, 8], wind: 0.5, gust: 0.05, fall: null }],
      siegemorning: ['flurries', { label: 'Mid-morning on the wall', grade: { contrast: 0.95, saturation: 0.95, warmth: 0, ev: 0.1 }, cover: 0.26, deck: 0.6, sun: 1, gloom: 0, fine: 1.6, visibility: 35000, hazeHeight: 800, fall: { kind: 'snow', share: 1, under: [0.04, 0.16], least: 0.12, thick: 12000 } }],
      siegelate: ['flurries', { label: 'Late afternoon on the wall', grade: { contrast: 1.75, white: 4, saturation: 0.95, warmth: 0.05, ev: -0.4 }, cover: 0.25, deck: 0.7, sun: 1, gloom: 0.1, fine: 0.6, visibility: 4000, hazeHeight: 150, glare: [2.5, 7], fall: { kind: 'snow', share: 1, under: [0.04, 0.16], least: 0.06, thick: 12000 } }],
      siegeovercast: ['snow', { label: 'Overcast, light snow on the wall', grade: { contrast: 1.2, saturation: 0.88, warmth: -0.02, ev: 0.3 }, gloom: 0.15, visibility: 2500, hazeHeight: 800, wind: 1.1, gust: 0.1 }],
      siegesnowhazy: ['flurries', { label: 'Snow showers on the wall, hazier sky', grade: { contrast: 1.34, saturation: 0.92, warmth: -0.01, ev: -0.9 }, cover: 0.5, sun: 1, gloom: 0.85, visibility: 14000, fall: { kind: 'snow', share: 1, under: [0.04, 0.16], least: 0.12, thick: 4000 } }],
    },
  };
  tkKeep(root, meshes, { sun: PY_LIGHT.sun, shadow: 0.6, sky, key: 'pyongyang', tier, mirrorAt: [-20, 1.6, 0], lay, north: [0, -1], air, stir: moved.tick, weather: (view) => ({ ...(PYONGYANG_WEATHER[view.weather?.town?.name] ?? PYONGYANG_WEATHER.snow), ...(view.weather?.town ?? null) }) });
  root.userData.lay = lay.lay;
  root.userData.scattered = scattered;
  root.userData.dispose = () => {
    materials.dispose();
    lay.textures.a.dispose();
    lay.textures.b.dispose();
    board.material.map.dispose();
    board.material.dispose();
    board.geometry.dispose();
  };
  return root;
}

/** The ground's height anywhere on the walked fields (tests; hooks). */
export const pyongyangGround = (x, z) => (z > PYONGYANG_PLACE.outside.z[1] ? tkFieldAt(pyongyangPlan().south, x, z) : x <= pyWall().x ? tkFieldAt(pyongyangPlan().outside, x, z) : tkFieldAt(pyongyangPlan().inside, x, z));
