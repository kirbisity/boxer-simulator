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
import { TK_HOUSE, tkFieldAt, tkFieldMesh, tkHouse, tkHouseSolid, tkPaving, tkRow, tkTree } from '../townkit/build.js';
import { tkBlocks, tkKeep, tkLayOf, tkMaterialsFor, tkMeshes, tkSky, tkSunWay, tkTier } from '../townkit/place.js';
import { tkStir } from '../townkit/stir.js';
import { TK_MATERIALS } from '../townkit/weather.js';
import { TK_THINGS, tkArrows, tkBrazier, tkCampfire, tkCart, tkDrift, tkFirewood, tkIcicles, tkLadder, tkMantlet, tkSacks, tkScatter, tkStack, tkTuft } from '../townkit/things.js';
import { tkGatehouse, tkGatehouseSolids, tkPavilion, tkPavilionSolids, tkRampart, tkRampartSolids, tkRock, tkWorksStair, tkWorksStairSolid } from '../townkit/works.js';

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
  // The battle's level strip (|z|), and how far beyond it the ground has come to its own relief.
  strip: [10, 24],
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

/** The road out from the gate: its middle's z at x (it wanders a little, as a worn track does). */
const pyRoad = (x) => PYONGYANG_PLACE.gate.z + 6 * Math.sin(Math.min(0, x - 1) / 40);

// Knolls and hollows outside the wall: [x, z, radius, height]. Low enough to walk over (the steepest about one in three).
const PY_KNOLLS = [[-42, 38, 17, 3.6], [-88, -44, 21, 4.4], [-28, -40, 12, -1.5], [-112, 52, 23, 5.2], [-64, 78, 18, 3.0], [-20, 92, 14, -1.3], [-128, -96, 26, 6.5], [-58, -98, 20, 4.0], [-132, 104, 22, 3.5]];

/** The ground's height outside the wall (x <= its foot). */
function pyOutside(x, z) {
  const t = PYONGYANG_PLACE;
  const wall = pyWall();
  const free = pySmooth(...t.strip, Math.abs(z)) * pySmooth(wall.x, wall.x - 14, x);
  // (Rolls about 45 m long, a metre or two high: the noise repeats every 900 m, wider than the ground.)
  let relief = (tkFbm((x + 450) / 900, (z + 450) / 900, 20, 3, 5) - 0.5) * 3.6;
  for (const [kx, kz, radius, high] of PY_KNOLLS) relief += high * Math.exp(-((x - kx) ** 2 + (z - kz) ** 2) / (radius * radius * 0.5));
  // (The hill's flank runs on west of the wall, higher away from it.)
  return pyFoot(z) * (1 + 0.5 * pySmooth(wall.x, -120, x)) + relief * free;
}

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
  pyPlanMade = { wall, outside, inside, south, runs, gaps, houses, trees, rocks, gateFrame, head, east: head + t.inside.cells * step, edge: east + 0.8 };
  return pyPlanMade;
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
  // (The same ground without its snow: for looking at the stone and the earth.)
  bare: { wet: 0.15, pool: 0, rain: 0, snow: 0, mist: [0.001, 0, 0.5], fog: PYONGYANG_PLACE.fog },
};

// The sun of the day: the afternoon of 8 February at Pyongyang. Worked from the date and the place, not looked up:
// the town lies at about 39.0 N (approximate); day 39 of the year gives the sun's declination by the usual cosine,
// -23.44 x cos(360 / 365 x (39 + 10)) = -15.6 degrees; at three in the afternoon by the sun (an hour angle of 45
// degrees) sin(height) = sin 39.0 sin -15.6 + cos 39.0 cos -15.6 cos 45 = 0.360, a height of 21.1 degrees, and its
// bearing is 46.9 degrees west of south. (At noon it stands 35.4 degrees high, due south; the afternoon is chosen
// because the wall's outer face looks west and the storming went on through the day: the low sun lies on the face
// the ladders climb and throws the wall's shadow long into the town.) `azimuth` is the open air's measure (rad: 0
// toward +x east, a quarter turn toward +z south).
const PY_SUN = { azimuth: Math.PI / 2 + (46.9 * Math.PI) / 180, elevation: 21.1 };

/** The place's light (render.js PLACE_LIGHT's entry): the low winter sun of PY_SUN in a pale clear sky. */
// What the bare ground under the snow throws back, for the open air's light from below (its `ground.albedo`):
// frozen trodden earth and dry winter grass, about a third (approximate), against a meadow's fifth.
const PY_GROUND_ALBEDO = 0.32;
const PY_LIGHT = { haze: 0xd3dbe2, sun: tkSunWay(PY_SUN.azimuth, PY_SUN.elevation) };
export const PYONGYANG_LIGHT = {
  background: PY_LIGHT.haze, fog: PYONGYANG_PLACE.fog, far: 2400, key: 0xfff0dc, keyIntensity: 0.1, rim: 0xcfe0ff, sun: 1.0, hemi: 0.62,
  sky: { zenith: [0.5, 0.62, 0.8], haze: [0.84, 0.87, 0.9], sunColour: [1, 0.93, 0.82], ground: [0.62, 0.64, 0.68] },
};

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

/** The place built (a THREE.Group for render.js's places). */
export function buildPyongyang() {
  const t = PYONGYANG_PLACE;
  const plan = pyongyangPlan();
  const { wall } = plan;
  const tier = tkTier();
  const blocks = tkBlocks();
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
            if (skirts > 1) blocks.wide.round('rock', farFrame, px, pz, foot, foot + tall * 0.4, tall * 0.022, tall * 0.016, { sides: 4, caps: '', colour: w.kinds.bark });
            blocks.wide.round('rock', farFrame, px, pz, foot + tall * 0.34, foot + tall * 0.5, round * 0.6, round, { sides, caps: '', colour: twigs.map((part) => part * 0.86) });
            blocks.wide.round('rock', farFrame, px, pz, foot + tall * 0.5, foot + tall * 0.9, round, round * 0.3, { sides, caps: 'top', colour: twigs });
            continue;
          }
          if (kind < bare + w.kinds.pine) {
            // A red pine: the stem bare and leaning, the crown in rounded masses, the upper one paler with its snow.
            const plates = skirts > 1 ? w.kinds.crowns : 1;
            const off = tall * 0.12 * (2 * girth - 1);
            if (skirts > 1) blocks.wide.round('rock', farFrame, px + off * Math.cos(aim) * 0.4, pz + off * Math.sin(aim) * 0.4, foot, foot + tall * 0.8, tall * 0.024, tall * 0.014, { sides: 4, caps: '', colour: w.kinds.bark });
            for (let k = 0; k < plates; k += 1) {
              const y0 = foot + tall * (w.kinds.stem + (0.24 * k) / plates + 0.06 * laden);
              const radius = wide * w.kinds.flat * (1 - 0.3 * k) * (0.8 + 0.4 * size);
              const lying = (w.laden * w.kinds.lying * laden * (k + 1)) / plates;
              const [cx, cz] = [px + off * Math.cos(aim) + radius * 0.5 * Math.cos(aim + k * 2.4) * k, pz + off * Math.sin(aim) + radius * 0.5 * Math.sin(aim + k * 2.4) * k];
              blocks.wide.round('rock', farFrame, cx, cz, y0 - tall * 0.1, y0, radius * 0.5, radius, { sides: sides + 1, caps: '', colour: tint.map((part) => part * 0.8) });
              blocks.wide.round('rock', farFrame, cx, cz, y0, y0 + tall * 0.3, radius, radius * 0.22, { sides: sides + 1, caps: 'top', colour: tint.map((part, c) => part + (w.snow[c] - part) * lying) });
            }
            continue;
          }
          for (let k = 0; k < skirts; k += 1) {
            // (Each skirt a cone, the lower ones wider, the upper ones paler with what lies on them.)
            const [y0, y1] = [foot + tall * (0.2 + (0.52 * k) / skirts), foot + tall * (skirts === 1 ? 1 : 0.6 + (0.4 * (k + 1)) / skirts)];
            const radius = wide * (1 - (0.38 * k) / skirts);
            const aside = (w.lean * radius * k) / skirts;
            const lying = (w.laden * laden * (k + 1)) / skirts;
            blocks.wide.round('rock', farFrame, px + aside * Math.cos(aim + k * 2.1), pz + aside * Math.sin(aim + k * 2.1), y0, y1, radius, 0.02, { sides: 5 + ((Math.floor(turn * 3) + k) % 3), caps: '', colour: tint.map((part, c) => part + (w.snow[c] - part) * lying) });
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
  for (const [index, run] of plan.runs.entries()) tkRampart(blocks.at(run[0][0], run[0][1]), run, { ...wall, gaps: index ? plan.gaps : [] });
  const crest = pyFoot(t.wall.z[0]);
  tkRampart(blocks.wide, Array.from({ length: 9 }, (_, k) => [plan.east + 60 - k * ((plan.east + 60 - wall.x) / 8), t.wall.z[0], crest, crest + wall.high]), { ...wall, inner: () => crest });
  tkRampart(blocks.wide, pySouthRun(), { ...wall, inner: (node) => node[2] });
  // The gate: its block, the stairs up from the walk, the pavilion on its terrace; the corner's pavilion.
  const gate = blocks.at(wall.x, t.gate.z);
  tkGatehouse(gate, plan.gateFrame, t.gate);
  for (const [from, to] of pyGateStairs()) tkWorksStair(gate, from, to, wall.high, t.gate.high, { wide: wall.walk - wall.thick });
  const pavilions = pyPavilions();
  const eave = tkPavilion(gate, pavilions.gate, { storeys: t.pavilion });
  tkPavilion(blocks.at(wall.x, t.wall.z[0]), pavilions.corner, { storeys: t.corner, board: false, overhang: 1.2 });
  for (const house of plan.houses) tkHouse(blocks.at(house.at[0], house.at[1], house.far), house);
  for (const tree of plan.trees) tkTree(blocks.at(...tree.at), tree.at[0], tree.y, tree.at[1], tree);
  for (const rock of plan.rocks) tkRock(blocks.at(...rock.at), rock.at[0], rock.y, rock.at[1], rock);
  // The street in from the gate, cobbled, and the cross street.
  tkPaving(blocks.wide, 'street', wall.x - t.gate.out + t.gate.deep, plan.east - 34, t.gate.z - 2.6, t.gate.z + 2.6, 0.03, [0.86, 0.86, 0.84]);
  tkPaving(blocks.wide, 'street', 58.4, 63.6, t.gate.z + 2.6, -t.strip[0] - 3.5, 0.03, [0.86, 0.86, 0.84]);
  // The trodden ground: the road out from the gate (a ribbon laid on the ground's own heights) and the columns' way to the wall.
  // (Each strip of the ribbon takes the ground's height under its own corners, a finger above it: it has no sides to show
  // where the ground falls away across the road.)
  const lane = [-2.3, -0.8, 0.8, 2.3];
  const trod = (x, across) => [x, tkFieldAt(plan.outside, x, pyRoad(x) + across) + PY_ROAD.proud, pyRoad(x) + across];
  for (let x = wall.x - t.gate.out; x - PY_ROAD.step >= t.outside.x[0] + 2; x -= PY_ROAD.step) {
    for (let k = 0; k + 1 < lane.length; k += 1) {
      const [a, b, c, d] = [trod(x, lane[k]), trod(x, lane[k + 1]), trod(x - PY_ROAD.step, lane[k + 1]), trod(x - PY_ROAD.step, lane[k])];
      // (Anticlockwise seen from above.)
      blocks.wide.quad('track', a, d, c, b, { uvs: [a, d, c, b].map((at) => [at[0], at[2]]), colour: [0.92, 0.78, 0.56] });
    }
  }
  tkPaving(blocks.wide, 'track', -135, wall.x, -8, 8, 0.03, [0.95, 0.82, 0.6]);

  // The place's lie (townkit/lay.js): the gate's passage and the eaves' shade, the ground's low places, where the
  // columns and the town's people trod, and how the wind laid the snow against the wall.
  const head = plan.head;
  const lay = tkLayOf(blocks, tier, {
    box: PY_LAY.box, ways: pyWays(plan), wind: PY_LAY.wind, seed: 3, sun: PY_LIGHT.sun, ...(tier === 'low' ? null : { texel: PY_LAY.texel }),
    ground: (x, z) => (z > t.outside.z[1] ? tkFieldAt(plan.south, x, z) : x <= wall.x ? tkFieldAt(plan.outside, x, z) : x < head ? pyFoot(z) : tkFieldAt(plan.inside, x, z)),
  });

  const stir = tkStir(3);
  const scattered = pyDress(blocks, stir, plan, lay, eave, tier);
  pyReeds(blocks, plan);

  // (The river's ice is frozen, not open water: no pool's mirror. The wind scours lying snow off smooth ice into drifts
  // and bare patches more than off rough ground: it holds `snow` 0.6 of the ground's share (by eye against photographs
  // of a frozen river under new snow), swept into bands along the wind with bare ice between (`scour`); bare, the ice
  // is glossy, `rough` 0.15 (by eye). The reeds standing in its edge
  // are dead stems: snow does not lie on their blades, only on the ground at their feet.)
  const materials = tkMaterialsFor(tier, { extra: { ice: { sheet: 'plaster', colour: [0.72, 0.8, 0.84], blotch: 0.5, plain: true, snow: 0.6, rough: 0.15, scour: 1 }, reed: { ...TK_MATERIALS.tuft, snow: 0 }, track: { sheet: 'earth', blotch: 1.2, snow: t.trodden }, street: { sheet: 'cobble', snow: t.trodden * 1.3 } } });
  const meshes = tkMeshes(blocks, materials, { tier });
  const root = new THREE.Group();
  root.name = 'pyongyang';
  const sky = tkSky({ horizon: PY_LIGHT.haze, zenith: 0x7fa3d0, cloud: 0.3, cloudColour: 0xf4f4f0, radius: 2200, sun: PY_LIGHT.sun, glow: 0.3 });
  // The gate's name on its board (the story's: the Hamgu gate), on the outer side under the upper eave.
  const board = pyNameBoard('含毬門');
  board.position.set(...pavilions.gate(0, eave - 1.04, t.pavilion[1].depth / 2 + 0.41));
  board.rotation.y = -Math.PI / 2;
  const moved = stir.make(materials, tier);
  root.add(meshes, moved.group, sky, board);
  // The open air (env/): the day's sun, a continental winter's clear cold air (a visibility of about 25 km:
  // approximate), a third of the sky in cloud; in snow, the open air's snow showers ('flurries': a flurry out of each
  // cloud that passes, the low sun between them on the new snow); without it, its clear day. The ground's own
  // heights for what lies and blows on it, and the gate passage's outer mouth, through which the afternoon sun
  // slants into the dark of the vault (an upright opening the passage's width and the arch's height to about its
  // haunches; a x b points in through it; `dust`: the air of a trodden passage, env/config.js's own range for one).
  const mouth = wall.x - t.gate.out;
  const air = {
    description: {
      sun: PY_SUN, air: { visibility: 25000, hazeHeight: 900 }, clouds: { cover: 0.35 }, ground: { albedo: PY_GROUND_ALBEDO },
      height: (x, z) => { if (z > t.outside.z[1] && x >= t.river.field.x[0] && x <= t.river.field.x[1]) return tkFieldAt(plan.south, x, Math.min(z, t.river.field.to)); const zc = Math.max(t.outside.z[0], Math.min(t.outside.z[1], z)); return x <= wall.x ? tkFieldAt(plan.outside, Math.max(t.outside.x[0], x), zc) : x < head ? pyFoot(zc) : tkFieldAt(plan.inside, Math.min(plan.east, x), zc); },
      openings: [{ at: [mouth, 0, t.gate.z - t.gate.way / 2], a: [0, t.gate.spring + t.gate.rise * 0.6, 0], b: [0, 0, t.gate.way], floor: 0, dust: 0.06 }],
    },
    // 'siegesnow', over the open air's snow showers ('flurries'), set for this ground and this sun:
    //   cover, sun   the cloud broken wider, half the sky, and the sun whole in the gaps: the sun between the showers
    //                is what draws the wall and lays the long shadows;
    //   gloom        the showers' own cloud darker underneath (0.85 against the open air's own figure for flurries),
    //                so the lit snow stands against a dark sky down-sun and the cloud up the sun keeps dark forms
    //                for the light to come through (at 0.7 the sunward cloud in a shower was pale on pale);
    //   visibility,  60 km of sight in a layer 300 m deep between the showers (polar air behind a front: approximate,
    //   hazeHeight   the clear end of what such air gives). Measured by turning one key at a time on the two sunward
    //                standing places: with 14 km in the open air's own 900 m layer the haze up the low sun hid the
    //                cloud, and two thirds of the frame was one pale glow with no edge; with these the cloud up the
    //                sun stands in dark masses nearer than the glow, with bright breaks between them;
    //   fall.thick   12 km of sight in the thick of a shower, against the open air's 900 m: a showery snow, not a
    //                blizzard. The falling snow's veil is lit as if the sun reached all of it, so toward the sun a
    //                thick one is a white wall in front of the cloud that sheds it (at 4000 m 1.8 percent of the
    //                sunward frame clipped in a shower and the cloud was gone; at 12000 none clips and the forms
    //                stay). A workaround, asked of the open air as R10 (c): when its veil is shaded by the cloud it
    //                falls from, this goes back toward 4000;
    //   grade.ev     0.9 of a stop under what the open air's meter gives. Its meter allows for the snow (the place's
    //                ground albedo), but a low sun in front of the camera over a whole frame of snow still put the
    //                sunlit drifts on the curve's shoulder, and in a shower, when the ground dims and the meter
    //                opens, the glow round the sun burnt out (3 to 4 percent of a sunward frame at 0.7 under, 1 to 2
    //                at 0.9, measured from five standing places). Held here the drifts are the brightest thing on
    //                the ground and keep their shading, and the gatehouse's paint and stone keep their colour both
    //                with the sun and against it. Contrast and colour a little off its own, for the stone's warmth.
    // All by eye, on the open air's high tier, against the sunward and the down-sun views of the wall.
    weathers: { snow: 'siegesnow', bare: 'clear' },
    first: 'snow',
    own: { siegesnow: ['flurries', { label: 'Snow showers on the wall', grade: { contrast: 1.34, saturation: 0.92, warmth: -0.01, ev: -0.9 }, cover: 0.5, sun: 1, gloom: 0.85, visibility: 60000, hazeHeight: 300, fall: { kind: 'snow', share: 1, under: [0.04, 0.16], least: 0.12, thick: 12000 } }] },
  };
  tkKeep(root, meshes, { sun: PY_LIGHT.sun, shadow: 0.6, sky, key: 'pyongyang', tier, mirrorAt: [-20, 1.6, 0], lay, north: [0, -1], air, stir: moved.tick, weather: (view) => ({ ...PYONGYANG_WEATHER.snow, ...(view.weather?.town ?? null) }) });
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
