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
import { tkFieldAt, tkFieldMesh, tkHouse, tkHouseSolid, tkPaving, tkRow, tkTree } from '../townkit/build.js';
import { tkBlocks, tkKeep, tkMaterialsFor, tkMeshes, tkSky, tkTier } from '../townkit/place.js';
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
  trodden: 0.3,
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
  pyPlanMade = { wall, outside, inside, runs, gaps, houses, trees, rocks, gateFrame, head, east: head + t.inside.cells * step, edge: east + 0.8 };
  return pyPlanMade;
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
  ];
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
  solids.push(bound([ox0 + 3, z0], [ox0 + 3, z1]), bound([ox0, z0], [wall.x, z0]), bound([ox0, z1], [wall.x, z1]));
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
    sections: [{ id: 'walls', name: 'The walls of Pyongyang', bounds: { at: [0, 0], size: [320, 280] }, terrain: pyongyangSolids(), spawns: [] }],
  };
}

/** The weather the place is seen in (tkSetWeather's argument): snow lying, the air dry and clear. A view's `weather.town` replaces any part of it. */
export const PYONGYANG_WEATHER = {
  snow: { wet: 0, pool: 0, rain: 0, snow: PYONGYANG_PLACE.snow, mist: [0.0012, 3, 0.2], fog: PYONGYANG_PLACE.fog },
  // (The same ground without its snow: for looking at the stone and the earth.)
  bare: { wet: 0.15, pool: 0, rain: 0, snow: 0, mist: [0.001, 0, 0.5], fog: PYONGYANG_PLACE.fog },
};

/** The place's light (render.js PLACE_LIGHT's entry): a low winter sun from the south and a little west (on the wall's outer face) in a pale clear sky. */
const PY_LIGHT = { haze: 0xd3dbe2, sun: [-0.36, 0.4, 0.74] };
export const PYONGYANG_LIGHT = {
  background: PY_LIGHT.haze, fog: PYONGYANG_PLACE.fog, far: 2400, key: 0xfff0dc, keyIntensity: 0.1, rim: 0xcfe0ff, sun: 1.0, hemi: 0.62,
  sky: { zenith: [0.5, 0.62, 0.8], haze: [0.84, 0.87, 0.9], sunColour: [1, 0.93, 0.82], ground: [0.62, 0.64, 0.68] },
};

// The far country, drawn only: how far it is drawn (m, to the sky's edge in the haze), and how far it is sunk under
// the walked ground where the two overlap.
const PY_FAR = { reach: 1500, sink: 4 };

/** The river south of the ground (0..1: 1 on its ice), a few hundred metres wide, running east-west. */
const pyRiver = (z) => pySmooth(150, 200, z) * (1 - pySmooth(520, 600, z));

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
  return (near + hills) * (1 - river) - 2.2 * river;
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
      const out = Math.max(Math.abs(x) - 148, Math.abs(z) - 129, 0);
      return { p: [x, pyFar(x, z) - 0.3 - PY_FAR.sink * (1 - pySmooth(0, 30, out)), z], n: normal.map((value) => value / length), uv: [x / 6, -z / 6] };
    };
    for (let j = 0; j < cells; j += 1) {
      for (let i = 0; i < cells; i += 1) {
        const [a, b, c, e] = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)];
        // (Left out where the walked ground's own fields are drawn.)
        if (Math.max(Math.abs(a.p[0]), Math.abs(c.p[0])) < 148 && Math.max(Math.abs(a.p[2]), Math.abs(c.p[2])) < 129) continue;
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
  tkRampart(blocks.wide, [[wall.x, t.wall.z[1], 0, wall.high], [wall.x, t.wall.z[1] + 30, -0.5, wall.high - 0.5], [wall.x + 8, t.wall.z[1] + 60, -1.5, wall.high - 1.5]], { ...wall, inner: (node) => node[2] });
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

  const materials = tkMaterialsFor(tier, { extra: { ice: { sheet: 'plaster', pools: 2, colour: [0.72, 0.8, 0.84], blotch: 0.5, plain: true }, track: { sheet: 'earth', blotch: 1.2, snow: t.trodden }, street: { sheet: 'cobble', snow: t.trodden * 1.3 } } });
  const meshes = tkMeshes(blocks, materials, { tier });
  const root = new THREE.Group();
  root.name = 'pyongyang';
  const sky = tkSky({ horizon: PY_LIGHT.haze, zenith: 0x7fa3d0, cloud: 0.3, cloudColour: 0xf4f4f0, radius: 2200, sun: PY_LIGHT.sun, glow: 0.3 });
  // The gate's name on its board (the story's: the Hamgu gate), on the outer side under the upper eave.
  const board = pyNameBoard('含毬門');
  board.position.set(...pavilions.gate(0, eave - 1.04, t.pavilion[1].depth / 2 + 0.41));
  board.rotation.y = -Math.PI / 2;
  root.add(meshes, sky, board);
  tkKeep(root, meshes, { sun: PY_LIGHT.sun, shadow: 0.6, sky, key: 'pyongyang', tier, mirrorAt: [-20, 1.6, 0], weather: (view) => ({ ...PYONGYANG_WEATHER.snow, ...(view.weather?.town ?? null) }) });
  root.userData.dispose = () => {
    materials.dispose();
    board.material.map.dispose();
    board.material.dispose();
    board.geometry.dispose();
  };
  return root;
}

/** The ground's height anywhere on the walked fields (tests; hooks). */
export const pyongyangGround = (x, z) => (x <= pyWall().x ? tkFieldAt(pyongyangPlan().outside, x, z) : tkFieldAt(pyongyangPlan().inside, x, z));
