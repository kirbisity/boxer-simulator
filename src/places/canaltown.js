// A Jiangnan water town (the story's chapter 2: a raid from the sea on a Zhejiang canal town, c. 1588): a quay square
// on a canal, lanes of grey-brick and dark-timber shop-houses behind and along it, a humped stone bridge and a flat
// one to the far bank, a street behind the houses that stand in the water there. Built from one description (the
// rows of houses, the walls that close the lanes' ends, the bridges, the trees) by the town kit's makers
// (src/townkit); the same description gives the solids a walker meets (the houses, the quay's edge, the stairs).
//
// Axes: +x east, +z south. The canal runs east-west; the square is on its north bank, round the origin, level at y 0:
// the story's battle is fought on it (its court ±18 by ±9 m is kept clear of everything).
//
// The forms are read off two reference photographs of such towns (a canal between houses with a stone bridge; a wet
// lane with a brick gate): they are typical, not a survey of any one town. No building here is a record of 1588.

import { slabOf, wallLine, wallOf } from '../physics/terrain.js';
import { tkgFrame } from '../townkit/geo.js';
import { tkRandom } from '../townkit/tex.js';
import {
  tkArchBridge, tkArchBridgeSolids, tkBoat, tkHouse, tkHouseSolid, tkJar, tkLaneGate, tkLaneGateSolids, tkLantern, tkLion, tkPaving, tkQuay, tkRow, tkSign, tkSlabBridge,
  tkSlabBridgeSolids, tkTree, tkWaterSteps, tkWaterStepsSolids, tkYardWall, tkYardWallSolid,
} from '../townkit/build.js';
import { tkBlocks, tkKeep, tkLayOf, tkMaterialsFor, tkMeshes, tkRain, tkSky, tkTier } from '../townkit/place.js';

/** The town's plan (m). Every figure is a choice for the game's ground, set against the battle's court and a walker's reach; none is a measurement of a real town. */
export const CANAL_TOWN = {
  // The battle's court (story/battles/02-wokou.js: arena halfX 18, halfZ 9): nothing stands in it.
  court: { halfX: 18, halfZ: 9 },
  // The quay square: wide enough for the court and a walk round it.
  square: { x: [-26, 22], z: [-11, 11.5] },
  // The canal: its two quays (z), its water's level and its bed below the banks, how far it is drawn each way. A small
  // town canal of about 7 m, a boat's length across; the water a man's waist under the quay.
  canal: { z: [11.5, 18.5], water: -1.25, bed: -2.2, reach: 150 },
  // The lanes along the north quay (z), closed at `end` (|x|) by a wall and gate; the cross lanes (x, from the back street to
  // the far bank's street) and the lane north out of the square, with its brick gate at `gate` (z).
  quayLane: { z: [6.5, 11.5], end: 70 },
  crossLanes: [[-48, -44], [44, 48]],
  northLane: { x: [4, 7.5], gate: -18.5 },
  // The back street (z) and the far bank's street (z); how far each runs (|x|).
  backStreet: { z: [-30, -26], reach: 48 },
  southStreet: { z: [27, 31], reach: 48 },
  // The houses' depth in the rows that stand back to back north of the square (their party wall is at z -18.5).
  deep: 7.5,
  // The bridges: the humped one west (its crest's height over the banks, for a boat with its awning to pass under), the flat one east.
  archBridge: { at: [-46, 15], high: 1.9, flat: 2.6 },
  slabBridge: { at: [46, 15] },
  // The water steps on the square's quay: where their top step is (x), and their width.
  steps: { x: 9, wide: 3 },
  // Where a walker comes into the town before the battle (the east quay lane) and which way he faces (west).
  start: { at: [40, 0, 9], facing: Math.PI },
  // Where the battle is called from: the hero's side of the court.
  muster: [11, 0, 0],
};

const CT_SHOPS = [['open', 'boards'], ['open', 'open', 'door'], ['boards', 'door', 'lattice'], ['open', 'door']];
const CT_HOMES = [['lattice', 'door', 'lattice'], ['boards', 'door'], ['wall', 'door', 'wall'], ['lattice', 'door']];

/**
 * The rows of houses: each `[name, from, to, options]` for tkRow (the houses stand on the left of one walking from -> to,
 * their fronts on the line). `near`: a walker can come close (its fine detail is made); `shops`: its ground floors open on the street.
 */
function ctRows() {
  const t = CANAL_TOWN;
  const [sx0, sx1] = t.square.x;
  const north = t.square.z[0];
  const party = t.northLane.gate;
  const [lane0, lane1] = t.northLane.x;
  const back = t.backStreet;
  const quay = t.quayLane.z[0];
  const [[w0, w1], [e0, e1]] = t.crossLanes;
  const south = t.southStreet;
  const far = t.canal.reach - 30;
  const deep = t.deep;
  const twin = { depth: deep, vary: 0 };
  const side = { depth: 7, vary: 0.2 };
  return [
    // Round the square: the shops facing it from the north, the west and the east.
    ['squareNorthWest', [sx0, north], [lane0, north], { ...twin, shops: true, two: 1, seed: 11 }],
    ['squareNorthEast', [lane1, north], [sx1, north], { ...twin, shops: true, two: 1, seed: 12 }],
    ['squareWest', [sx0, quay - 7], [sx0, north], { ...side, shops: true, seed: 13 }],
    ['squareEast', [sx1, north], [sx1, quay - 7], { ...side, shops: true, seed: 14 }],
    // The back street: its south side (back to back with the square's north rows) and its north side.
    ['backSouthWest', [lane0, back.z[1]], [w1, back.z[1]], { ...twin, seed: 21 }],
    ['backSouthEast', [e0, back.z[1]], [lane1, back.z[1]], { ...twin, seed: 22 }],
    ['backNorth', [-back.reach - 7, back.z[0]], [back.reach + 7, back.z[0]], { ...side, seed: 23 }],
    // The cross lanes: the houses on each side of each.
    ['westLaneEast', [w1, party], [w1, quay - 7], { ...side, seed: 31 }],
    ['westLaneWest', [w0, quay - 7], [w0, back.z[0]], { ...side, seed: 32 }],
    ['eastLaneWest', [e0, quay - 7], [e0, party], { ...side, seed: 33 }],
    ['eastLaneEast', [e1, back.z[0]], [e1, quay - 7], { ...side, seed: 34 }],
    // The quay lanes: the houses facing the water, out past the lanes' gates to where the mist takes them.
    ['quayWestFar', [-far, quay], [-t.quayLane.end - 4, quay], { depth: 7, vary: 0, seed: 41, far: true }],
    ['quayWestOuter', [-t.quayLane.end - 4, quay], [w0, quay], { depth: 7, vary: 0, shops: true, seed: 42 }],
    ['quayWestInner', [w1, quay], [sx0, quay], { depth: 7, vary: 0, shops: true, seed: 43 }],
    ['quayEastInner', [sx1, quay], [e0, quay], { depth: 7, vary: 0, shops: true, seed: 44 }],
    ['quayEastOuter', [e1, quay], [t.quayLane.end + 4, quay], { depth: 7, vary: 0, shops: true, seed: 45 }],
    ['quayEastFar', [t.quayLane.end + 4, quay], [far, quay], { depth: 7, vary: 0, seed: 46, far: true }],
    // The far bank: the houses standing in the water (their backs to it), and the street behind them.
    ['waterWestFar', [-far, south.z[0]], [-t.quayLane.end - 4, south.z[0]], { depth: south.z[0] - t.canal.z[1], vary: 0, seed: 51, far: true }],
    ['waterWest', [-t.quayLane.end - 4, south.z[0]], [w0, south.z[0]], { depth: south.z[0] - t.canal.z[1], vary: 0, seed: 52 }],
    ['waterMiddle', [w1, south.z[0]], [e0, south.z[0]], { depth: south.z[0] - t.canal.z[1], vary: 0, seed: 53 }],
    ['waterEast', [e1, south.z[0]], [t.quayLane.end + 4, south.z[0]], { depth: south.z[0] - t.canal.z[1], vary: 0, seed: 54 }],
    ['waterEastFar', [t.quayLane.end + 4, south.z[0]], [far, south.z[0]], { depth: south.z[0] - t.canal.z[1], vary: 0, seed: 55, far: true }],
    ['southStreet', [south.reach + 7, south.z[1]], [-south.reach - 7, south.z[1]], { ...side, seed: 56 }],
    // Roofs beyond the last streets, for the view over the nearer ones.
    ['beyondNorth', [-80, back.z[0] - 16], [80, back.z[0] - 16], { ...side, seed: 61, far: true }],
    ['beyondSouth', [80, south.z[1] + 16], [-80, south.z[1] + 16], { ...side, seed: 62, far: true }],
  ];
}

let ctPlanMade = null;

/**
 * The town laid out: its houses (tkHouse's descriptions, each with `row`, and `far` where no walker comes near), the
 * walls that close lanes and yards, the lane gate, the bridges, the water steps, the quay's edges, the trees and what
 * stands about. The same every time (seeded), and made once.
 */
export function canalTownPlan() {
  if (ctPlanMade) return ctPlanMade;
  const t = CANAL_TOWN;
  const houses = [];
  for (const [row, from, to, { shops = false, far = false, ...options }] of ctRows()) {
    for (const house of tkRow({ from, to, ...options, ...(shops ? { grounds: CT_SHOPS } : { grounds: CT_HOMES, two: options.two ?? 0.7 }) })) houses.push({ ...house, row, shops, far });
  }
  const [qz0, qz1] = t.quayLane.z;
  const [cz0, cz1] = t.canal.z;
  const south = t.southStreet;
  // The walls that end a way: the quay lanes' gates, the far street's ends.
  const walls = [
    { a: [-t.quayLane.end, qz0], b: [-t.quayLane.end, qz1], gate: true },
    { a: [t.quayLane.end, qz1], b: [t.quayLane.end, qz0], gate: true },
    { a: [-south.reach, south.z[0]], b: [-south.reach, south.z[1]], gate: true },
    { a: [south.reach, south.z[1]], b: [south.reach, south.z[0]], gate: true },
  ];
  const bridges = [
    { kind: 'arch', at: t.archBridge.at, yaw: -Math.PI / 2, span: cz1 - cz0, high: t.archBridge.high, flat: t.archBridge.flat, water: t.canal.water },
    { kind: 'slab', at: t.slabBridge.at, yaw: -Math.PI / 2, span: cz1 - cz0, water: t.canal.water },
  ];
  const steps = { at: [t.steps.x, cz0], yaw: -Math.PI / 2, wide: t.steps.wide, water: t.canal.water };
  // The north quay's edge, west to east: a balustrade along the square, a kerb along the lanes, open at the bridges and the steps.
  const gaps = [...bridges.map((bridge) => [bridge.at[0] - 1.6, bridge.at[0] + 1.6]), [t.steps.x - t.steps.wide / 2, t.steps.x + t.steps.wide / 2]].sort((p, q) => p[0] - q[0]);
  const quays = [];
  let x = -t.canal.reach;
  const run = (to, open) => {
    // (Cut where the edge changes kind: at the square's two ends.)
    for (const cut of [...t.square.x, to]) {
      if (cut <= x || cut > to) continue;
      const mid = (x + cut) / 2;
      quays.push({ a: [x, cz0], b: [cut, cz0], edge: open ? null : mid > t.square.x[0] && mid < t.square.x[1] ? 'rail' : 'kerb' });
      x = cut;
    }
  };
  for (const [g0, g1] of gaps) {
    run(g0, false);
    run(g1, true);
  }
  run(t.canal.reach, false);
  // The far quay, east to west, with nothing on its edge (the houses stand on it; the lanes' mouths are the bridges').
  quays.push({ a: [t.canal.reach, cz1], b: [-t.canal.reach, cz1], edge: null });
  // Trees: a great camphor in the square's corner, willows along the quay lanes, and crowns over the yards behind the rows.
  const trees = [{ at: [-22.6, 8.2], kind: 'broad', high: 11.5, seed: 3, spread: 0.55, ring: true }];
  for (const tx of [-66, -57, -37, -30, 28, 38, 55, 64, -84, -100, 84, 102]) trees.push({ at: [tx, qz1 - 0.95], kind: 'willow', high: 7.5, seed: Math.abs(tx) + 5, spread: 0.42 });
  for (const [tx, tz, high] of [[-33, -15, 9], [-35, -5, 8], [30, -15, 9.5], [33, -6, 8], [-62, -14, 9], [62, -17, 9], [-20, -42, 10], [18, -43, 9], [-50, 44, 9], [10, 46, 10], [58, 44, 9], [-95, -8, 9], [95, -9, 9]]) trees.push({ at: [tx, tz], kind: 'broad', high, seed: Math.round(tx * 3 + tz), yard: true });
  const boats = [
    { at: [t.steps.x + 3.6, cz0 + 1.2], yaw: 0.05, awning: true }, { at: [-18, cz1 - 1.1], yaw: Math.PI - 0.04, awning: false }, { at: [-60, cz0 + 1.2], yaw: 0.03, awning: true },
    { at: [29, cz1 - 1.2], yaw: 0.06, awning: true }, { at: [62, cz0 + 1.1], yaw: Math.PI, awning: false }, { at: [-92, 15], yaw: 0.2, awning: true }, { at: [96, 14.6], yaw: 0.1, awning: false },
  ];
  // The lions at the mouth of the north lane, facing the square.
  const lions = [{ at: [t.northLane.x[0] - 1.0, t.square.z[0] + 0.9] }, { at: [t.northLane.x[1] + 1.0, t.square.z[0] + 0.9] }];
  const gate = { a: [t.northLane.x[0], t.northLane.gate], b: [t.northLane.x[1], t.northLane.gate] };
  ctPlanMade = { houses, walls, bridges, steps, quays, trees, boats, lions, gate };
  return ctPlanMade;
}

/** What hangs and stands at a house's front, from its seed: lanterns under the eave, a signboard, jars by the door. Local to its front (x along it, z out). */
function ctDressing(house) {
  const random = tkRandom(house.seed + 77);
  const things = { lanterns: [], sign: null, jars: [] };
  if (house.far) return things;
  const half = house.width / 2;
  const eave = house.storeys > 1 ? house.heights[0] : house.heights[0] - 0.1;
  if (house.shops || random() < 0.3) for (const lx of random() < 0.6 ? [-half + 0.7, half - 0.7] : [0]) things.lanterns.push([lx, eave - 0.75, 0.55]);
  if (house.shops && random() < 0.5) things.sign = { x: (random() < 0.5 ? -1 : 1) * (half - 0.25), y: house.heights[0] - 1.9 };
  if (random() < 0.45) {
    const lx = (random() - 0.5) * (house.width - 2.2);
    const count = 1 + Math.floor(random() * 3);
    for (let k = 0; k < count; k += 1) things.jars.push({ x: lx + k * 0.62, z: 0.42 + 0.1 * random(), high: 0.55 + 0.35 * random(), lid: random() < 0.7 });
  }
  return things;
}

/** The solids of the town: everything a walker's body meets. */
export function canalTownSolids() {
  const t = CANAL_TOWN;
  const plan = canalTownPlan();
  const [cz0, cz1] = t.canal.z;
  const reach = t.canal.reach + 20;
  const solids = [
    // The two banks, and the canal's bed (no one should come to it: the quay's edge is walled; were he to, he stands, not falls).
    slabOf([0, (cz0 - 90) / 2], [2 * reach, cz0 + 90], 0, { bottom: -4 }),
    slabOf([0, (cz1 + 90) / 2], [2 * reach, 90 - cz1], 0, { bottom: -4 }),
    slabOf([0, (cz0 + cz1) / 2], [2 * reach, cz1 - cz0], t.canal.bed, { bottom: -4 }),
  ];
  for (const house of plan.houses) {
    solids.push(tkHouseSolid(house));
    // Jars by a door: one low block.
    const { jars } = ctDressing(house);
    if (jars.length) {
      const front = tkgFrame(house.at[0], 0, house.at[1], house.yaw).child(0, 0, house.depth / 2);
      const [x, , z] = front((jars[0].x + jars[jars.length - 1].x) / 2, 0, 0.42);
      solids.push(wallOf([x, z], [jars.length * 0.62 + 0.2, 0.75], -1, 1.2, { yaw: house.yaw }));
    }
  }
  for (const wall of plan.walls) solids.push(tkYardWallSolid(wall.a, wall.b));
  solids.push(...tkLaneGateSolids(plan.gate.a, plan.gate.b));
  for (const bridge of plan.bridges) solids.push(...(bridge.kind === 'arch' ? tkArchBridgeSolids(bridge) : tkSlabBridgeSolids(bridge)));
  solids.push(...tkWaterStepsSolids(plan.steps));
  // The quay's edges: where there is a rail or a kerb, and the far quay at the lanes' mouths either side of each bridge.
  for (const quay of plan.quays) if (quay.edge) solids.push(wallLine([quay.a[0], quay.a[1] - 0.25], [quay.b[0], quay.b[1] - 0.25], 0.3, -3, 3));
  for (const [x0, x1] of t.crossLanes) {
    for (const bridge of plan.bridges) {
      if (bridge.at[0] < x0 || bridge.at[0] > x1) continue;
      solids.push(wallLine([x0, cz1 + 0.25], [bridge.at[0] - 1.6, cz1 + 0.25], 0.3, -3, 3), wallLine([bridge.at[0] + 1.6, cz1 + 0.25], [x1, cz1 + 0.25], 0.3, -3, 3));
    }
  }
  for (const tree of plan.trees) if (!tree.yard) solids.push(wallOf(tree.at, tree.ring ? [2.2, 2.2] : [0.6, 0.6], -1, 4));
  for (const lion of plan.lions) solids.push(wallOf(lion.at, [0.9, 1.2], -1, 2.2));
  return solids;
}

/** The town as a stage (levelmode/stage.js) to walk in: one section, nobody in it. */
export function canalTownStage() {
  const reach = CANAL_TOWN.canal.reach + 20;
  return {
    id: 'canaltown', title: 'The water town', place: 'canaltown',
    start: { section: 'town', at: CANAL_TOWN.start.at, facing: CANAL_TOWN.start.facing },
    sections: [{ id: 'town', name: 'The water town', bounds: { at: [0, 0], size: [2 * reach, 200] }, terrain: canalTownSolids(), spawns: [] }],
  };
}

/**
 * The weather the town is seen in when nothing else says (tkSetWeather's argument): damp after rain, the flags dark
 * and the low places holding water, a thin mist on the canal. A view's `weather.town` replaces any part of it.
 */
export const CANAL_TOWN_WEATHER = {
  // `mist`: [share of the light lost per metre where it lies thickest, the height it lies below (m), how fast it thins above
  // that (per m)]: thin, lying on the water and the quay (0.012 /m: a boat 60 m down the canal is half gone); `fog`: where
  // the day's haze begins and where it has taken everything (m).
  damp: { wet: 0.45, pool: 0.3, rain: 0, snow: 0, mist: [0.012, 0.2, 0.7], fog: [45, 190] },
  dry: { wet: 0, pool: 0, rain: 0, snow: 0, mist: [0.003, 0, 0.7], fog: [70, 260] },
  // (Rain: the air itself is grey to the roofs, and nearer.)
  rain: { wet: 1, pool: 0.8, rain: 1, snow: 0, mist: [0.016, 4, 0.3], fog: [30, 130] },
};

/**
 * The town's light (render.js PLACE_LIGHT's entry): a high thin overcast, the sun a pale disc to the south-east; the haze's
 * colour is the sky's at the horizon, so the far roofs go into it. `far`: the camera's reach, past the sky's dome.
 */
const CT_LIGHT = { haze: 0xc3cdd0, sun: [0.42, 0.74, 0.52] };
export const CANAL_TOWN_LIGHT = {
  background: CT_LIGHT.haze, fog: CANAL_TOWN_WEATHER.damp.fog, far: 520, key: 0xfff4e0, keyIntensity: 0.1, rim: 0xd6e6ff, sun: 0.85, hemi: 0.7,
  // The ambient the realistic look bakes (looks/probe-lite.js, kind 'own'): a grey-white overcast overhead, wet stone below.
  sky: { zenith: [0.66, 0.7, 0.74], haze: [0.82, 0.84, 0.84], sunColour: [1, 0.96, 0.88], ground: [0.27, 0.27, 0.26] },
};

// The town's lie (townkit/lay.js): the ground it maps (the walked town and a row beyond: what is further is seen only
// over roofs), and the way the air moves for what the wind lays (toward [x, z]: along the canal, a light air from the west).
const CT_LAY = { box: { x: [-152, 152], z: [-40, 40] }, wind: [1, 0.15] };

/**
 * Where feet go (lay.js `ways`): the middle of every lane and street, the quay's length, over the bridges, and across
 * the square between its lanes' mouths, the steps and the north lane. `half`: the worn width each side (m); `strength`:
 * how worn (the quay and the square's crossings most).
 */
function ctWays() {
  const t = CANAL_TOWN;
  const mid = ([a, b]) => (a + b) / 2;
  const [cz0, cz1] = t.canal.z;
  const quay = mid(t.quayLane.z);
  const north = mid(t.northLane.x);
  const ways = [
    { line: [[-t.canal.reach, quay], [t.canal.reach, quay]], half: 1.5, kind: 'foot', strength: 1 },
    { line: [[north, t.backStreet.z[1]], [north, t.square.z[0]], [north - 2, 0], [t.steps.x - 1, quay]], half: 1.3, kind: 'foot', strength: 0.9 },
    { line: [[t.square.x[0], quay - 3], [-8, 1], [north, t.square.z[0] + 1]], half: 1.2, kind: 'foot', strength: 0.6 },
    { line: [[t.square.x[1], quay - 2], [10, 2], [north, t.square.z[0] + 1]], half: 1.2, kind: 'foot', strength: 0.6 },
    { line: [[-t.backStreet.reach, mid(t.backStreet.z)], [t.backStreet.reach, mid(t.backStreet.z)]], half: 1.2, kind: 'foot', strength: 0.8 },
    { line: [[-t.southStreet.reach, mid(t.southStreet.z)], [t.southStreet.reach, mid(t.southStreet.z)]], half: 1.2, kind: 'foot', strength: 0.8 },
  ];
  for (const lane of t.crossLanes) ways.push({ line: [[mid(lane), t.backStreet.z[1]], [mid(lane), cz0], [mid(lane), cz1], [mid(lane), t.southStreet.z[0]]], half: 1.1, kind: 'foot', strength: 0.9 });
  return ways;
}

/** The town built (a THREE.Group for render.js's places): its meshes, sky, rain and keeping. */
export function buildCanalTown() {
  const t = CANAL_TOWN;
  const plan = canalTownPlan();
  const tier = tkTier();
  const blocks = tkBlocks();
  const world = tkgFrame();
  for (const house of plan.houses) {
    const builder = blocks.at(house.at[0], house.at[1], house.far);
    tkHouse(builder, house);
    const front = tkgFrame(house.at[0], 0, house.at[1], house.yaw).child(0, 0, house.depth / 2);
    const things = ctDressing(house);
    for (const [lx, ly, lz] of things.lanterns) tkLantern(builder, ...front(lx, ly, lz));
    if (things.sign) tkSign(builder, front.child(things.sign.x, 0, 0), { y: things.sign.y });
    for (const jar of things.jars) tkJar(builder, ...front(jar.x, 0, jar.z), { high: jar.high, lid: jar.lid });
  }
  for (const wall of plan.walls) tkYardWall(blocks.at(...wall.a), wall.a, wall.b, { gate: wall.gate });
  tkLaneGate(blocks.at(...plan.gate.a), plan.gate.a, plan.gate.b);
  for (const bridge of plan.bridges) (bridge.kind === 'arch' ? tkArchBridge : tkSlabBridge)(blocks.at(...bridge.at), bridge);
  tkWaterSteps(blocks.at(...plan.steps.at), plan.steps);
  for (const quay of plan.quays) {
    // (In pieces no longer than a block, each in its own.)
    const length = Math.hypot(quay.b[0] - quay.a[0], quay.b[1] - quay.a[1]);
    const pieces = Math.max(1, Math.ceil(length / blocks.cell));
    for (let k = 0; k < pieces; k += 1) {
      const at = (share) => [quay.a[0] + (quay.b[0] - quay.a[0]) * share, quay.a[1] + (quay.b[1] - quay.a[1]) * share];
      const [a, b] = [at(k / pieces), at((k + 1) / pieces)];
      tkQuay(blocks.at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), a, b, { bed: t.canal.bed, edge: quay.edge });
    }
  }
  for (const tree of plan.trees) {
    const builder = blocks.at(...tree.at);
    tkTree(builder, tree.at[0], 0, tree.at[1], tree);
    // The camphor's stone ring.
    if (tree.ring) builder.lathe('ashlar', world, tree.at[0], tree.at[1], [[1.25, 0], [1.25, 0.42], [1.0, 0.42], [1.0, 0.3]], { colour: [0.82, 0.82, 0.8], sides: 12 });
  }
  for (const boat of plan.boats) tkBoat(blocks.at(...boat.at), boat.at[0], t.canal.water, boat.at[1], boat.yaw, boat);
  for (const lion of plan.lions) tkLion(blocks.at(...lion.at), tkgFrame(lion.at[0], 0, lion.at[1], 0));
  // The ground: flags on the square, cobbles in the lanes and streets with a course of flags down the middle, earth elsewhere; the water.
  const ground = blocks.wide;
  const reach = t.canal.reach;
  const [cz0, cz1] = t.canal.z;
  tkPaving(ground, 'earth', -reach, reach, -110, cz0, -0.05, [0.8, 0.8, 0.78]);
  tkPaving(ground, 'earth', -reach, reach, cz1, 110, -0.05, [0.8, 0.8, 0.78]);
  tkPaving(ground, 'flags', t.square.x[0], t.square.x[1], t.square.z[0], t.square.z[1]);
  const lane = (x0, x1, z0, z1) => {
    tkPaving(ground, 'cobble', x0, x1, z0, z1, -0.01);
    const along = x1 - x0 > z1 - z0;
    const mid = along ? (z0 + z1) / 2 : (x0 + x1) / 2;
    if (along) tkPaving(ground, 'flags', x0, x1, mid - 0.7, mid + 0.7, 0, [0.9, 0.9, 0.88]);
    else tkPaving(ground, 'flags', mid - 0.7, mid + 0.7, z0, z1, 0, [0.9, 0.9, 0.88]);
  };
  lane(-reach, t.square.x[0], ...t.quayLane.z);
  lane(t.square.x[1], reach, ...t.quayLane.z);
  lane(...t.northLane.x, t.backStreet.z[1], t.square.z[0]);
  lane(-t.backStreet.reach, t.backStreet.reach, ...t.backStreet.z);
  lane(-t.southStreet.reach, t.southStreet.reach, ...t.southStreet.z);
  for (const [x0, x1] of t.crossLanes) {
    lane(x0, x1, t.backStreet.z[1], t.quayLane.z[0]);
    lane(x0, x1, cz1, t.southStreet.z[0]);
  }
  tkPaving(ground, 'water', -reach, reach, cz0, cz1, t.canal.water);
  tkPaving(ground, 'earth', -reach, reach, cz0, cz1, t.canal.bed, [0.4, 0.42, 0.36]);

  // The town's lie (townkit/lay.js): what is under a roof or a bridge, the shade of the lanes, the low places, and
  // where feet go (the ways below: the lanes' middles, the quay, the bridges, the square's crossings).
  const lay = tkLayOf(blocks, tier, { box: CT_LAY.box, ground: (x, z) => (z > cz0 && z < cz1 ? t.canal.water : 0), ways: ctWays(), wind: CT_LAY.wind, seed: 2 });

  const materials = tkMaterialsFor(tier, { extra: { quay: { sheet: 'ashlar', foot: 1.6, ground: t.canal.water, blotch: 1.3 } } });
  const meshes = tkMeshes(blocks, materials, { tier });
  const root = new THREE.Group();
  root.name = 'canaltown';
  const sky = tkSky({ horizon: CT_LIGHT.haze, zenith: 0x8fa3b2, cloud: 0.82, cloudColour: 0xe9ecec, radius: 480, sun: CT_LIGHT.sun, glow: 0.18 });
  const rain = tkRain({ count: tier === 'low' ? 1300 : 2600 });
  root.add(meshes, sky, rain);
  tkKeep(root, meshes, {
    sun: CT_LIGHT.sun, shadow: 0.55, sky, rain, key: 'canaltown', tier, mirrorAt: [0, 1.5, 4], lay, north: [0, -1],
    weather: (view) => ({ ...CANAL_TOWN_WEATHER.damp, ...(view.weather?.town ?? null) }),
  });
  root.userData.lay = lay.lay;
  root.userData.dispose = () => {
    materials.dispose();
    lay.textures.a.dispose();
    lay.textures.b.dispose();
  };
  return root;
}
