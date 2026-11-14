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
import { tkgBay, tkgFrame } from '../townkit/geo.js';
import { tkRandom } from '../townkit/tex.js';
import {
  TK_HOUSE, tkArchBridge, tkArchBridgeSolids, tkBoat, tkHouse, tkHouseSolid, tkJar, tkLaneGate, tkLaneGateSolids, tkLion, tkPaving, tkQuay, tkRow, tkSign, tkSlabBridge,
  tkSlabBridgeSolids, tkTree, tkWaterSteps, tkWaterStepsSolids, tkYardWall, tkYardWallSolid,
} from '../townkit/build.js';
import { tkBlocks, tkKeep, tkLayOf, tkMaterialsFor, tkMeshes, tkRain, tkSky, tkSunWay, tkTier } from '../townkit/place.js';
import { tkStir } from '../townkit/stir.js';
import { TK_THINGS, tkBasket, tkCart, tkFirewood, tkPoles, tkSacks, tkScatter, tkTub } from '../townkit/things.js';

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
  // Handcarts left standing: by the square's north shops, on the quay lanes, in the back street.
  const carts = [
    { at: [-20.5, -8.6], yaw: 1.2, load: TK_THINGS.hemp }, { at: [17.5, -8.9], yaw: -0.5, tipped: true }, { at: [-33, 7.5], yaw: Math.PI / 2 + 0.2, load: TK_THINGS.straw },
    { at: [52, 7.6], yaw: -Math.PI / 2, tipped: true }, { at: [-12, -26.9], yaw: 1.7, load: TK_THINGS.hemp }, { at: [30, 27.9], yaw: -1.4 },
  ];
  ctPlanMade = { houses, walls, bridges, steps, quays, trees, boats, lions, gate, carts };
  return ctPlanMade;
}

/**
 * How often a house's front has each thing (0..1), and how. Choices for a lived-in street, by eye: none is counted
 * from a source. `washing`: an upper floor's poles thrust out over the street with the day's wash on them (`out` m
 * long, `rise` m higher at the tip), or a cord along the front under the eave; `smoke`: a kitchen fire lit;
 * the rest stand against the wall within `deep` m of it, so the way stays clear.
 */
const CT_FRONT = { washing: { poles: 0.34, cord: 0.14, out: 2.3, rise: 0.25 }, smoke: 0.2, firewood: 0.2, poles: 0.22, baskets: 0.38, tub: 0.22, sacks: 0.3, deep: 0.8 };

/** What hangs and stands at a house's front, from its seed: lanterns under the eave, a signboard, jars by the door, the wash, firewood, baskets. Local to its front (x along it, z out). */
function ctDressing(house) {
  const random = tkRandom(house.seed + 77);
  const things = { lanterns: [], sign: null, jars: [], washing: [], stands: [], smoke: false };
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
  // (Drawn after the older things, so their places are as they were.)
  const more = tkRandom(house.seed + 177);
  const f = CT_FRONT;
  if (house.storeys > 1) {
    const top = house.heights[0] + house.heights[1];
    const pick = more();
    if (pick < f.washing.poles) {
      for (const lx of more() < 0.5 ? [-half * 0.45, half * 0.45] : [(more() - 0.5) * half]) things.washing.push({ a: [lx, top - 1.2, 0.05], b: [lx, top - 1.2 + f.washing.rise, f.washing.out], pole: 0.02, dry: more() });
    } else if (pick < f.washing.poles + f.washing.cord) things.washing.push({ a: [-half + 0.5, top - 0.55, 0.62], b: [half - 0.5, top - 0.55, 0.62], pole: 0, dry: more() });
  }
  things.smoke = more() < f.smoke;
  const spot = () => (more() - 0.5) * (house.width - 1.6);
  if (more() < f.firewood) things.stands.push({ kind: 'firewood', x: spot(), long: 1.1 + more() * 1.2, high: 0.5 + 0.6 * more() });
  if (more() < f.poles) things.stands.push({ kind: 'poles', x: spot(), count: 2 + Math.floor(more() * 4) });
  if (more() < f.baskets) for (let k = 0, lx = spot(), count = 1 + Math.floor(more() * 3); k < count; k += 1) things.stands.push({ kind: 'basket', x: lx + k * 0.58, z: 0.4 + 0.3 * more(), wide: 0.4 + 0.2 * more(), full: more() < 0.5 });
  if (more() < f.tub) things.stands.push({ kind: 'tub', x: spot(), z: 0.38 + 0.3 * more() });
  if (house.shops && more() < f.sacks) things.stands.push({ kind: 'sacks', x: spot(), count: 2 + Math.floor(more() * 4) });
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
// The sun of the day: early on a May morning (the raids the chapter draws on came in the fourth and fifth months:
// approximate), at about 28.7 N (Taizhou's latitude: approximate). Worked, not looked up: the sun's declination
// about +18 degrees; at half past seven by the sun (an hour angle of 67.5 degrees) sin(height) = sin 28.7 sin 18 +
// cos 28.7 cos 18 cos 67.5 = 0.467, a height of 27.9 degrees, standing 6.3 degrees north of east. The canal runs
// east and west (+x is east, -z north), so the sun looks along the water and rakes across the lanes' eaves.
// (`azimuth`: the open air's measure, rad from +x toward +z.)
const CT_SUN = { azimuth: (-6.3 * Math.PI) / 180, elevation: 27.9 };
const CT_LIGHT = { haze: 0xc3cdd0, sun: tkSunWay(CT_SUN.azimuth, CT_SUN.elevation) };

/**
 * The town in the open air (env/: townkit/place.js tkKeep's `air`). Its own air: the damp of that country, a
 * visibility of about 9 km on its clear day (approximate), half the sky in cloud. Its weathers, by the kit's names:
 *   damp  'canalmist', its own: the morning after rain, the sky breaking (half in cloud, the sun through the gaps),
 *         a mist lying on the water and in the lanes to about the eaves (`hazeHeight` m; `visibility` m in the
 *         thick of it: the far end of a 150 m reach of canal is a shape), the stone still wet. Laid over the open
 *         air's 'mist'; the figures by eye against the reference photographs of a water town on a wet morning.
 *   rain  'canalshowers', over the open air's 'showers': rain out of the thick of each cloud that passes, the sun between.
 *   dry   'canalcloudy', over its 'cloudy': broken cloud on a dry day.
 * Each is held up by `ev` stops over the open air's own grade: its exposure is metered for open ground in the sun,
 * and a town's ground is wet dark stone between walls, most of it in shade, which a camera opens up for. By eye.
 */
const CT_AIR = {
  description: { sun: CT_SUN, air: { visibility: 9000, hazeHeight: 400 }, clouds: { cover: 0.5 } },
  weathers: { damp: 'canalmist', rain: 'canalshowers', dry: 'canalcloudy' },
  first: 'damp',
  own: {
    canalmist: ['mist', { label: 'After rain, mist on the water', grade: { contrast: 1.32, saturation: 0.95, ev: 1.0 }, cover: 0.42, gloom: 0.45, sun: 0.85, visibility: 380, hazeHeight: 12, wind: 0.6, gust: 0.05, wet: 0.7 }],
    // (A showery day's wind: 2.6 times the town's light air, about 3.6 m/s at the ground and 9 aloft, which carries a
    // shower over in a few minutes, so the rain comes and goes within one fight; a little less cloud, for the gaps.)
    canalshowers: ['showers', { label: 'Showers on the town', grade: { contrast: 1.36, saturation: 0.94, ev: 1.2 }, wind: 2.6, cover: 0.6 }],
    canalcloudy: ['cloudy', { label: 'Broken cloud over the town', grade: { contrast: 1.32, ev: 0.7 } }],
  },
};
export const CANAL_TOWN_LIGHT = {
  background: CT_LIGHT.haze, fog: CANAL_TOWN_WEATHER.damp.fog, far: 520, key: 0xfff4e0, keyIntensity: 0.1, rim: 0xd6e6ff, sun: 0.85, hemi: 0.7,
  // The ambient the realistic look bakes (looks/probe-lite.js, kind 'own'): a grey-white overcast overhead, wet stone below.
  sky: { zenith: [0.66, 0.7, 0.74], haze: [0.82, 0.84, 0.84], sunColour: [1, 0.96, 0.88], ground: [0.27, 0.27, 0.26] },
};

// The town's lie (townkit/lay.js): the ground it maps (the walked town and a row beyond: what is further is seen only
// over roofs), and the way the air moves for what the wind lays (toward [x, z]: along the canal, a light air from the west).
// How well weeds take (things.js tkScatter `grows`): in a paving's joints, and on open earth.
const CT_GROWS = { paved: 0.6, earth: 1 };
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

/**
 * The far bank's houses toward the water: what a house standing in a canal does with its back. A timber gallery
 * hung at the upper floor on struts, with a rail, a lattice front behind it and a tiled pent over it; a door at the
 * bank's level with stone steps down along the wall to the water, for the boat and the wash; mooring posts standing
 * in the water; the wash on a pole thrust out over it. `share`s are how many houses in each ten have the thing, by
 * eye against the reference photograph of a canal's bank (hardly a blank wall on it); the sizes are a man's: a
 * gallery `out` m deep that one can stand a chair on, a rail at the hip, a step's `rise` and `tread`.
 */
const CT_WATERSIDE = {
  gallery: { share: 0.62, wide: [2.6, 4.6], out: 1.15, rail: 0.95, roof: 2.2, pent: 0.4 },
  steps: { share: 0.45, wide: 1.2, out: 0.9, rise: 0.19, tread: 0.3 },
  posts: { share: 0.7, out: 1.6, high: 0.85 },
  washing: { share: 0.4, out: 2.3, rise: 0.25 },
};

/** What a quay's edge collects, a walker's reach from its rail (`deep` m, so the way stays clear): one group about every `every` m where `share` allows, each of a boatman's or a porter's things. By eye. */
const CT_QUAY = { every: 5.5, share: 0.6, deep: 0.62, clear: 3.2 };

function ctWaterside(builder, house, stir, water) {
  const w = CT_WATERSIDE;
  const random = tkRandom(house.seed + 277);
  const back = tkgFrame(house.at[0], 0, house.at[1], house.yaw + Math.PI).child(0, 0, house.depth / 2);
  const half = house.width / 2;
  const timber = (scale) => TK_HOUSE.timber.map((value) => value * scale);
  const stone = [0.8, 0.8, 0.78];
  if (house.storeys > 1 && random() < w.gallery.share) {
    const g = w.gallery;
    const wide = Math.min(house.width - 1, g.wide[0] + (g.wide[1] - g.wide[0]) * random());
    const x0 = -half + 0.5 + random() * (house.width - 1 - wide);
    const [x1, y] = [x0 + wide, house.heights[0]];
    builder.box('timber', back, x0, x1, y - 0.1, y, 0, g.out, { colour: timber(0.8) });
    const posts = wide > 3.4 ? [x0 + 0.06, (x0 + x1) / 2, x1 - 0.06] : [x0 + 0.06, x1 - 0.06];
    for (const x of posts) {
      builder.tube('timber', [back(x, y - 1.05, 0.03), back(x, y - 0.1, g.out - 0.12)], 0.05, 0.05, { sides: 5, colour: timber(0.7) });
      builder.box('timber', back, x - 0.05, x + 0.05, y, y + g.roof, g.out - 0.1, g.out, { colour: timber(0.85), skip: 'bottom' });
    }
    for (const high of [0.14, g.rail]) builder.box('timber', back, x0, x1, y + high - 0.04, y + high + 0.04, g.out - 0.09, g.out - 0.01, { colour: timber(0.95) });
    builder.quad('lattice', back(x0, y + 0.18, g.out - 0.05), back(x1, y + 0.18, g.out - 0.05), back(x1, y + g.rail - 0.04, g.out - 0.05), back(x0, y + g.rail - 0.04, g.out - 0.05), {
      uvs: [[x0, 0], [x1, 0], [x1, g.rail - 0.22], [x0, g.rail - 0.22]], colour: timber(1.1),
    });
    tkgBay(builder, back, { kind: 'lattice', x0: x0 + 0.15, x1: x1 - 0.15, y0: y, y1: y + g.roof - 0.15, z: 0.03, finish: TK_HOUSE.timber });
    // (The pent: a lean-to of tiles on boards, from the wall out past the posts.)
    const [ra, rb] = [[y + g.roof + g.pent, -0.02], [y + g.roof - 0.04, g.out + 0.3]];
    const long = Math.hypot(rb[1] - ra[1], ra[0] - rb[0]);
    builder.quad('rooftile', back(x0 - 0.2, rb[0], rb[1]), back(x1 + 0.2, rb[0], rb[1]), back(x1 + 0.2, ra[0], ra[1]), back(x0 - 0.2, ra[0], ra[1]), { uvs: [[x0, 0], [x1 + 0.4, 0], [x1 + 0.4, long], [x0, long]] });
    builder.quad('timber', back(x0 - 0.2, ra[0] - 0.05, ra[1]), back(x1 + 0.2, ra[0] - 0.05, ra[1]), back(x1 + 0.2, rb[0] - 0.05, rb[1]), back(x0 - 0.2, rb[0] - 0.05, rb[1]), { colour: timber(0.6) });
  }
  if (random() < w.steps.share) {
    const st = w.steps;
    const way = random() < 0.5 ? -1 : 1;
    const count = Math.ceil(-water / st.rise);
    const sx = (-half + 1.2 + random() * Math.max(0.1, house.width - 2.4 - count * st.tread)) * 1 + (way < 0 ? count * st.tread : 0);
    const door = Math.max(-half + 0.7, Math.min(half - 0.7, sx));
    tkgBay(builder, back, { kind: 'door', x0: door - 0.55, x1: door + 0.55, y0: 0.02, y1: 2.05, z: 0.03, finish: TK_HOUSE.timber });
    builder.box('ashlar', back, door - st.wide / 2, door + st.wide / 2, water - 0.7, 0, 0, st.out, { colour: stone, skip: 'back bottom' });
    for (let k = 0; k < count; k += 1) {
      const xa = door + way * (st.wide / 2 + k * st.tread);
      builder.box('ashlar', back, Math.min(xa, xa + way * st.tread), Math.max(xa, xa + way * st.tread), water - 0.7, -(k + 1) * st.rise, 0, st.out, { colour: stone, skip: 'back bottom' });
    }
  }
  for (let k = 0, count = random() < w.posts.share ? 1 + Math.floor(random() * 2) : 0; k < count; k += 1) {
    const [px, lean] = [(random() - 0.5) * (house.width - 1), (random() - 0.5) * 0.24];
    builder.tube('timber', [back(px, water - 0.9, w.posts.out), back(px + lean, water + w.posts.high * (0.7 + 0.6 * random()), w.posts.out + lean * 0.5)], 0.075, 0.06, { sides: 6, colour: timber(0.55) });
  }
  if (house.storeys > 1 && random() < w.washing.share) {
    const [lx, top] = [(random() - 0.5) * half, house.heights[0] + house.heights[1]];
    stir.washing(back(lx, top - 1.2, 0.05), back(lx, top - 1.2 + w.washing.rise, w.washing.out), { pole: 0.02, dry: random() });
  }
}

/** A quay's edge dressed from `x0` to `x1` along its rail at `z` (the water on the +z side when `side` is 1), leaving `gaps` ([x, half]) clear. */
function ctQuayThings(blocks, x0, x1, z, side, gaps, seed) {
  const q = CT_QUAY;
  const random = tkRandom(seed * 131 + 9);
  for (let x = x0 + q.every / 2; x < x1; x += q.every) {
    const [px, pick, r1, r2] = [x + (random() - 0.5) * q.every * 0.6, random(), random(), random()];
    if (random() > q.share || gaps.some(([gx, half]) => Math.abs(px - gx) < half)) continue;
    const builder = blocks.at(px, z);
    const pz = z - side * q.deep;
    if (pick < 0.25) for (let k = 0, count = 1 + Math.floor(r1 * 3); k < count; k += 1) tkBasket(builder, px + k * 0.56, 0, pz + side * 0.1 * k * (r2 - 0.5), { wide: 0.42 + 0.16 * r2, high: 0.3 + 0.1 * r1, full: k % 2 ? null : [0.5, 0.56, 0.3] });
    else if (pick < 0.42) tkTub(builder, px, 0, pz);
    else if (pick < 0.62) tkSacks(builder, px, 0, pz, { count: 2 + Math.floor(r1 * 4), seed: seed + Math.round(px) });
    else if (pick < 0.82) tkPoles(builder, tkgFrame(px, 0, z - side * 0.28, side > 0 ? Math.PI : 0), { count: 2 + Math.floor(r1 * 3), long: 2.6 + r2, seed: seed + Math.round(px) });
    else for (let k = 0, count = 1 + Math.floor(r1 * 3); k < count; k += 1) tkJar(builder, px + k * 0.6, 0, pz, { high: 0.5 + 0.35 * ((r2 + k * 0.37) % 1), lid: k !== 1 });
  }
}

/** The town built (a THREE.Group for render.js's places): its meshes, sky, rain and keeping. */
export function buildCanalTown() {
  const t = CANAL_TOWN;
  const plan = canalTownPlan();
  const tier = tkTier();
  const blocks = tkBlocks();
  const world = tkgFrame();
  const stir = tkStir(2);
  for (const house of plan.houses) {
    const builder = blocks.at(house.at[0], house.at[1], house.far);
    tkHouse(builder, house);
    const front = tkgFrame(house.at[0], 0, house.at[1], house.yaw).child(0, 0, house.depth / 2);
    const things = ctDressing(house);
    for (const [lx, ly, lz] of things.lanterns) stir.lantern(...front(lx, ly, lz));
    for (const wash of things.washing) stir.washing(front(...wash.a), front(...wash.b), wash);
    for (const stand of things.stands) {
      const seed = house.seed + Math.round(stand.x * 100);
      if (stand.kind === 'firewood') tkFirewood(builder, front.child(stand.x, 0, 0.03), { ...stand, seed });
      else if (stand.kind === 'poles') tkPoles(builder, front.child(stand.x, 0, 0), { ...stand, seed });
      else if (stand.kind === 'basket') tkBasket(builder, ...front(stand.x, 0, stand.z), { wide: stand.wide, high: stand.wide * 0.7, full: stand.full ? [0.5, 0.56, 0.3] : null });
      else if (stand.kind === 'tub') tkTub(builder, ...front(stand.x, 0, stand.z));
      else if (stand.kind === 'sacks') tkSacks(builder, ...front(stand.x, 0, 0.35), { count: stand.count, seed });
    }
    if (!house.far && house.row.startsWith('water')) ctWaterside(builder, house, stir, t.canal.water);
    if (!house.far) {
      // The eaves drip, front and back (the back's drops fall to the yard, or to the canal behind the far bank's houses).
      const over = house.roof?.overhang ?? TK_HOUSE.overhang;
      const top = house.storeys > 1 ? house.heights[0] + house.heights[1] : house.heights[0];
      const half = house.width / 2;
      stir.drips(front(-half, top, over), front(half, top, over), 0);
      stir.drips(front(-half, top, -house.depth - over), front(half, top, -house.depth - over), house.row.startsWith('water') ? t.canal.water : 0);
      // A kitchen's smoke, from a vent in the back slope of the roof.
      if (things.smoke) {
        const rise = house.roof?.rise ?? (house.depth / 2 + over) * TK_HOUSE.pitch;
        const [vx, vz] = [(house.seed % 2 ? -1 : 1) * half * 0.5, -house.depth * 0.72];
        const vy = top + rise * (1 - (house.depth * 0.22) / (house.depth / 2 + over));
        builder.box('brick', front.child(vx, 0, vz), -0.22, 0.22, vy - 0.3, vy + 0.5, -0.22, 0.22, { colour: [0.6, 0.6, 0.6], skip: 'bottom' });
        stir.smoke(...front(vx, vy + 0.55, vz), 0.8);
      }
    }
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
  // The quays' edges: the north bank's, clear of the bridges' heads and the water steps.
  ctQuayThings(blocks, -t.quayLane.end, t.quayLane.end, t.canal.z[0], 1, [[t.archBridge.at[0], CT_QUAY.clear + 1.5], [t.slabBridge.at[0], CT_QUAY.clear], [plan.steps.at[0], CT_QUAY.clear]], 7);
  for (const boat of plan.boats) tkBoat(blocks.at(...boat.at), boat.at[0], t.canal.water, boat.at[1], boat.yaw, boat);
  for (const lion of plan.lions) tkLion(blocks.at(...lion.at), tkgFrame(lion.at[0], 0, lion.at[1], 0));
  for (const cart of plan.carts) tkCart(blocks.at(...cart.at), tkgFrame(cart.at[0], 0, cart.at[1], cart.yaw), cart);
  // The ground: flags on the square, cobbles in the lanes and streets with a course of flags down the middle, earth elsewhere; the water.
  const ground = blocks.wide;
  const reach = t.canal.reach;
  const [cz0, cz1] = t.canal.z;
  tkPaving(ground, 'earth', -reach, reach, -110, cz0, -0.05, [0.8, 0.8, 0.78]);
  tkPaving(ground, 'earth', -reach, reach, cz1, 110, -0.05, [0.8, 0.8, 0.78]);
  tkPaving(ground, 'flags', t.square.x[0], t.square.x[1], t.square.z[0], t.square.z[1]);
  // (What is paved, for what grows: weeds take in a paving's joints, thinly.)
  const paved = [[t.square.x[0], t.square.x[1], t.square.z[0], t.square.z[1]]];
  const lane = (x0, x1, z0, z1) => {
    paved.push([x0, x1, z0, z1]);
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

  // What grows and gathers, by the lie: weeds at the walls' feet and in the unworn margins of the paving, thick on
  // open earth; fallen leaves and straw in the corners.
  if (tier !== 'low') {
    const isPaved = (x, z) => paved.some(([x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
    tkScatter(blocks, lay.lay, {
      box: { x: [-110, 110], z: CT_LAY.box.z }, seed: 2, colour: TK_THINGS.green, stones: false, paved: isPaved,
      grows: (x, z) => (z > cz0 - 0.4 && z < cz1 + 0.4 ? null : isPaved(x, z) ? CT_GROWS.paved : CT_GROWS.earth),
    });
  }

  const materials = tkMaterialsFor(tier, { extra: { quay: { sheet: 'ashlar', foot: 1.6, ground: t.canal.water, blotch: 1.3 } } });
  const meshes = tkMeshes(blocks, materials, { tier });
  const root = new THREE.Group();
  root.name = 'canaltown';
  const sky = tkSky({ horizon: CT_LIGHT.haze, zenith: 0x8fa3b2, cloud: 0.82, cloudColour: 0xe9ecec, radius: 480, sun: CT_LIGHT.sun, glow: 0.18 });
  const rain = tkRain({ count: tier === 'low' ? 1300 : 2600 });
  const moved = stir.make(materials, tier);
  root.add(meshes, moved.group, sky, rain);
  tkKeep(root, meshes, {
    sun: CT_LIGHT.sun, shadow: 0.55, sky, rain, key: 'canaltown', tier, mirrorAt: [0, 1.5, 4], lay, north: [0, -1], air: CT_AIR, stir: moved.tick,
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
