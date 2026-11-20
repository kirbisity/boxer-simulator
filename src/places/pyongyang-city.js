// The town inside Pyongyang's west wall (places/pyongyang.js): its plan, its drawing and its solids. A Joseon provincial
// capital laid out as such towns were (typical, not surveyed: the plan of 1593 is not known here): a square inside the
// gate where the market met, a main street east from it, a market street south off it; the governor's compound
// (감영) walled, behind its two-storey gate, its main hall on a stone terrace; a hill temple climbing the slope under
// the north wall on two terraces, a stone pagoda and lanterns before its main hall, a bell pavilion; a pavilion on the
// hill's crest (the town's Eulmildae stood there) and one on a terrace over the river; and the houses: tiled courtyard
// houses of the well-off nearer the street and the compound, behind yard walls and roofed gates, their jar terraces in
// the yards, and the thatched cottages of the poor toward the river; lanes between the blocks. In the first month of
// 1593, under snow; the trees bare, the pines green, and the oaks still in their dead brown leaves (Korean oaks keep
// them through the winter).
//
// Axes as the place's: +x east (into the town), +z south; the wall's inner bank runs to about x 14, the hill rises north
// of z -70. `groundAt(x, z)`: the town's ground (the place's inside field).

import { tkHouse, tkHouseSolid, tkJar, tkLantern, tkPaving, tkRow, tkYardWall, tkYardWallSolid } from '../townkit/build.js';
import { tkgFrame } from '../townkit/geo.js';
import { tkRandom } from '../townkit/tex.js';
import { TK_HANOK, tkBell, tkCompoundRuns, tkHall, tkHallSolids, tkRoofedGate, tkStoneLantern, tkStoneLanternSolid, tkStonePagoda, tkStonePagodaSolid, tkTerrace, tkTerracePavilion, tkTerracePavilionSolids, tkTerraceSolids, tkThatch } from '../townkit/hanok.js';

/**
 * The town's plan (m; choices for the game's town, set against the space inside the wall and a walker's reach). `square`:
 * the square inside the gate (x0..x1, z0..z1), flagged; `avenue`: the main street's half width and run east; `market`: the
 * market street's x and run south; `lanes`: the lanes' lines (E-W at z, N-S at x) and half width; `compound`: the
 * governor's walls and the gate on the avenue; `temple`: its gate, its two terraces (x0, x1, front z, back z) and what
 * stands on them; `crest`: the hill pavilion; `river`: the river pavilion; `east`: the town's last street (the walk's bound).
 * `hanok`, `thatch`: the two kinds of house (a tiled house on a stone footing `footing` m; a thatched cottage); `tiles`:
 * the tile's grey; `rich`: the share of a block's houses that are tiled, by how far south the block lies (the well-off near
 * the street, the poor toward the river).
 */
export const PY_CITY = {
  square: { x: [15, 42], z: [-63, -37] },
  avenue: { half: 3.5, x: [15, 142] },
  market: { x: 61, half: 3, z: [-46.5, 118] },
  lanes: { ew: [-3, 31, 65, 99], ns: [33, 90, 120], half: 2 },
  compound: { x: [86, 132], z: [-44, -8], gate: 109 },
  temple: { way: 67, gate: -64, lower: { x: [50, 84], z: [-80, -95] }, upper: { x: [52, 82], z: [-96, -113] } },
  crest: { at: [25, -110] },
  river: { at: [40, 114] },
  east: 145,
  footing: 0.55,
  tiles: [0.56, 0.58, 0.61],
  rich: [0.95, 0.25],
};

const pcSmooth = (a, b, x) => Math.max(0, Math.min(1, (x - a) / (b - a)));

/** The highest ground under a plan (x0..x1, z0..z1), sampled every 2 m. */
function pcHighest(groundAt, x0, x1, z0, z1) {
  let top = -Infinity;
  for (let x = x0; x <= x1 + 0.01; x += Math.max(1, (x1 - x0) / 6)) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1) + 0.01; z += Math.max(1, Math.abs(z1 - z0) / 6)) top = Math.max(top, groundAt(x, z));
  return top;
}

/**
 * The town laid out: the houses (tkHouse's specs; `kind` 'shop' | 'hanok' | 'thatch'), the halls and pavilions, the
 * terraces, the compound walls and their gates, the pagoda, the lanterns and the bells, the jar terraces, the trees, the
 * paving and the trodden ways. Seeded; the drawing and the solids are both made from it.
 */
export function pyCityPlan(groundAt) {
  const c = PY_CITY;
  const random = tkRandom(15930208);
  const houses = [];
  const halls = [];
  const pavilions = [];
  const terraces = [];
  const walls = [];
  const gates = [];
  const lanterns = [];
  const jars = [];
  const trees = [];
  const pagodas = [];
  const bells = [];
  const paving = [];
  const ways = [];
  const shops = { depth: 6.2, widths: [5, 7.5], two: 0, vary: 0.15, firewalls: 0, walls: ['plaster'], grounds: [['open', 'boards', 'door'], ['boards', 'open', 'open'], ['lattice', 'door', 'boards']], uppers: [['lattice']] };
  const shopRow = (from, to, seed) => {
    for (const house of tkRow({ from, to, seed, ...shops })) {
      const base = pcHighest(groundAt, house.at[0] - 3, house.at[0] + 3, house.at[1] - 3, house.at[1] + 3);
      houses.push({ ...house, kind: 'shop', base, heights: [2.9 + 0.3 * random()], wall: 'plaster', timber: [0.4, 0.28, 0.2], roof: { kind: 'hipgable', overhang: 1.0, sag: 0.34, lift: 0.26, liftRun: 2, breakAt: 0.5, tint: c.tiles.map((v) => v * (0.9 + 0.15 * random())), rafterEnd: [0.72, 0.4, 0.24] }, blindBack: true });
    }
  };
  const [sx0, sx1] = c.square.x;
  const [sz0, sz1] = c.square.z;
  const ah = c.avenue.half;
  const az = -50;
  // The square: flagged; shops along its north and south sides; the bell pavilion at its north-east corner.
  paving.push({ material: 'flags', x: [sx0, sx1], z: [sz0, sz1] });
  shopRow([sx0, sz0], [sx1 - 4, sz0], 11);
  shopRow([sx1 - 4, sz1], [sx0, sz1], 12);
  pavilions.push({ name: 'bell', at: [sx1 + 5, sz0 + 5], yaw: -Math.PI / 2, base: groundAt(sx1 + 5, sz0 + 6), storeys: [{ width: 6.4, depth: 6.4, high: 3.2, fill: 'open' }, { width: 5.0, depth: 5.0, high: 2.6, fill: 'lattice' }], terrace: 1.0, apron: 1.0, steps: [{ side: 'front', at: 0, wide: 2.6 }] });
  bells.push({ at: [sx1 + 5, sz0 + 5], y: groundAt(sx1 + 5, sz0 + 5) + 1.0 + 3.0, high: 1.7 });
  // The avenue east from the square: paved; shops on its north side but for the temple's way, on its south side to the compound.
  paving.push({ material: 'street', x: [4.8, c.avenue.x[1]], z: [az - ah, az + ah] });
  ways.push({ line: [[4.8, az], [c.avenue.x[1], az]], half: ah - 0.5, kind: 'cart', strength: 1 });
  shopRow([sx1 + 10, az - ah], [c.temple.way - 4, az - ah], 13);
  shopRow([c.temple.way + 4, az - ah], [c.avenue.x[1], az - ah], 14);
  shopRow([c.compound.x[0] - 2, az + ah], [c.market.x + c.market.half, az + ah], 15);
  shopRow([c.market.x - c.market.half, az + ah], [sx1 + 2, az + ah], 16);
  // The market street south: paved, shops both sides as far as the first lane, then houses.
  const mx = c.market.x;
  paving.push({ material: 'street', x: [mx - c.market.half, mx + c.market.half], z: [az + ah, c.market.z[1]] });
  ways.push({ line: [[mx, az], [mx, c.market.z[1]]], half: 2.2, kind: 'cart', strength: 0.9 });
  shopRow([mx - c.market.half, c.lanes.ew[0] - c.lanes.half], [mx - c.market.half, az + ah + 1], 17);
  shopRow([mx + c.market.half, az + ah + 1], [mx + c.market.half, c.lanes.ew[0] - c.lanes.half], 18);

  // The governor's compound: walls, the gate pavilion on the avenue, the main hall on its terrace, two side halls, old trees.
  const [gx0, gx1] = c.compound.x;
  const [gz0, gz1] = c.compound.z;
  const gb = groundAt((gx0 + gx1) / 2, (gz0 + gz1) / 2);
  walls.push(...tkCompoundRuns({ x0: gx0, x1: gx1, z0: gz0, z1: gz1, gates: [{ side: 'north', at: c.compound.gate, wide: 9 }, { side: 'west', at: gz1 - 8, wide: 3 }] }).map((run) => ({ run, base: gb, high: 2.6, material: 'plaster' })));
  pavilions.push({ name: 'compoundGate', at: [c.compound.gate, gz0], yaw: Math.PI, base: gb, storeys: [{ width: 9.2, depth: 4.4, high: 3.4, fill: 'open' }, { width: 7.0, depth: 3.2, high: 2.6, fill: 'lattice' }], terrace: 0.7, apron: 0.6, steps: [{ side: 'front', at: 0, wide: 4 }, { side: 'back', at: 0, wide: 4 }] });
  gates.push({ at: [gx0, gz1 - 8], yaw: Math.PI / 2, base: gb });
  halls.push({ name: 'governor', at: [c.compound.gate, gz0 + 21], yaw: Math.PI, base: gb, width: 17.5, depth: 9, high: 3.8, terrace: 1.3, apron: 2.2, bay: 3.5, steps: [{ side: 'front', at: 0, wide: 6 }] });
  halls.push({ name: 'west', at: [gx0 + 8, gz0 + 15], yaw: Math.PI / 2, base: gb, width: 10, depth: 5.6, high: 3.1, terrace: 0.6, apron: 1.0, bay: 2.6, board: false });
  halls.push({ name: 'east', at: [gx1 - 8, gz0 + 15], yaw: -Math.PI / 2, base: gb, width: 10, depth: 5.6, high: 3.1, terrace: 0.6, apron: 1.0, bay: 2.6, board: false });
  paving.push({ material: 'flags', x: [c.compound.gate - 3.5, c.compound.gate + 3.5], z: [gz0 + 2, gz0 + 13], y: gb });
  ways.push({ line: [[c.compound.gate, az], [c.compound.gate, gz0 + 13]], half: 2, kind: 'foot', strength: 0.8 });
  for (const [x, z] of [[c.compound.gate - 9, gz0 + 6], [c.compound.gate + 9, gz0 + 6]]) trees.push({ at: [x, z], y: gb, kind: 'bare', high: 11 + 2 * random(), seed: 400 + x, yard: true, spread: 0.8 });

  // The hill temple: its gate on the way up from the avenue, the lower terrace (the pagoda, two lanterns, the bell
  // pavilion) with its stair from the gate, the upper terrace with the main hall and two smaller halls, its stair from the
  // lower; pines about it.
  const t = c.temple;
  const tw = t.way;
  gates.push({ at: [tw, t.gate], yaw: 0, base: groundAt(tw, t.gate), temple: true });
  ways.push({ line: [[tw, az - ah], [tw, t.lower.z[0] + 1]], half: 1.6, kind: 'foot', strength: 0.7 });
  const lower = { ...t.lower, top: pcHighest(groundAt, t.lower.x[0], t.lower.x[1], t.lower.z[1], t.lower.z[1] + 3) + 0.4 };
  const upper = { ...t.upper, top: pcHighest(groundAt, t.upper.x[0], t.upper.x[1], t.upper.z[1], t.upper.z[1] + 3) + 0.4 };
  const lowerFoot = groundAt(tw, t.lower.z[0]);
  terraces.push({ name: 'templeLower', at: [tw, (t.lower.z[0] + t.lower.z[1]) / 2], yaw: 0, base: lowerFoot, width: t.lower.x[1] - t.lower.x[0], depth: Math.abs(t.lower.z[1] - t.lower.z[0]), high: lower.top - lowerFoot, steps: [{ side: 'front', at: 0, wide: 6 }], material: 'rubble' });
  terraces.push({ name: 'templeUpper', at: [tw, (t.upper.z[0] + t.upper.z[1]) / 2], yaw: 0, base: lower.top, width: t.upper.x[1] - t.upper.x[0], depth: Math.abs(t.upper.z[1] - t.upper.z[0]), high: upper.top - lower.top, steps: [{ side: 'front', at: 0, wide: 5 }], material: 'rubble' });
  pagodas.push({ at: [tw, t.lower.z[0] - 2.6], y: lower.top, tiers: 5, size: 1.5 });
  for (const s of [-1, 1]) lanterns.push({ at: [tw + s * 3.4, t.lower.z[0] - 1.2], y: lower.top, high: 2.3 });
  pavilions.push({ name: 'templeBell', at: [t.lower.x[0] + 5, (t.lower.z[0] + t.lower.z[1]) / 2], yaw: Math.PI / 2, base: lower.top, storeys: [{ width: 4.6, depth: 4.6, high: 3.2, fill: 'open' }], terrace: 0.5, apron: 0.6, steps: [{ side: 'front', at: 0, wide: 2 }] });
  bells.push({ at: [t.lower.x[0] + 5, (t.lower.z[0] + t.lower.z[1]) / 2], y: lower.top + 0.5 + 3.0, high: 1.6 });
  halls.push({ name: 'templeMain', at: [tw, (t.upper.z[0] + t.upper.z[1]) / 2 - 1], yaw: 0, base: upper.top, width: 13.5, depth: 8, high: 3.6, terrace: 0.9, apron: 1.6, bay: 3.2, paint: null });
  for (const s of [-1, 1]) halls.push({ name: `templeSide${s}`, at: [tw + s * 12, (t.upper.z[0] + t.upper.z[1]) / 2], yaw: 0, base: upper.top, width: 5.4, depth: 4.6, high: 3.0, terrace: 0.5, apron: 0.6, bay: 2.6, board: false });
  for (const s of [-1, 1]) lanterns.push({ at: [tw + s * 3.6, t.upper.z[0] - 1.8], y: upper.top, high: 2.0 });
  for (let k = 0; k < 18; k += 1) {
    const x = t.upper.x[0] - 10 + random() * (t.upper.x[1] - t.upper.x[0] + 20);
    const z = -124 + random() * 10;
    if (x > t.upper.x[0] - 1 && x < t.upper.x[1] + 1 && z > t.upper.z[1] - 1) continue;
    trees.push({ at: [x, z], y: groundAt(x, z), kind: 'pine', high: 7 + 6 * random(), seed: 500 + k });
  }
  for (const [x, z] of [[t.lower.x[1] + 4, -84], [t.lower.x[0] - 4, -90], [t.upper.x[1] + 3, -104], [t.upper.x[0] - 3, -108]]) trees.push({ at: [x, z], y: groundAt(x, z), kind: 'oak', high: 9 + 3 * random(), seed: 520 + x });

  // The crest pavilion among pines, on its own terrace; the river pavilion on a terrace over the bank.
  const [cx, cz] = c.crest.at;
  pavilions.push({ name: 'crest', at: [cx, cz], yaw: Math.PI / 4, base: groundAt(cx, cz) - 0.3, storeys: [{ width: 7.2, depth: 5.4, high: 3.3, fill: 'open' }], terrace: 1.4, apron: 1.4, steps: [{ side: 'front', at: 0, wide: 2.6 }] });
  for (let k = 0; k < 14; k += 1) {
    const a = (k / 14) * Math.PI * 2 + random();
    const d = 9 + 9 * random();
    const [x, z] = [cx + Math.cos(a) * d, cz + Math.sin(a) * d * 0.8];
    if (x < 15 || z < -124) continue;
    trees.push({ at: [x, z], y: groundAt(x, z), kind: 'pine', high: 8 + 6 * random(), seed: 600 + k });
  }
  const [rx, rz] = c.river.at;
  pavilions.push({ name: 'river', at: [rx, rz], yaw: Math.PI, base: groundAt(rx, rz), storeys: [{ width: 13, depth: 7.2, high: 3.6, fill: 'open' }], terrace: 2.2, apron: 1.6, steps: [{ side: 'front', at: 0, wide: 3.2 }] });

  // The lanes and the blocks between them: each block cut into yards along its lanes; a yard holds a tiled courtyard
  // house (a main wing at its back, a side wing, yard walls with a roofed gate on the lane, a jar terrace, a tree) or a
  // thatched cottage (one wing, a low wall of field stone), the tiled ones the likelier the nearer the avenue.
  const lh = c.lanes.half;
  for (const z of c.lanes.ew) {
    ways.push({ line: [[16, z], [c.east, z]], half: lh - 0.4, kind: 'foot', strength: 0.75 });
  }
  for (const x of c.lanes.ns) ways.push({ line: [[x, az + ah], [x, 118]], half: lh - 0.4, kind: 'foot', strength: 0.7 });
  const xs = [15, ...c.lanes.ns.flatMap((x) => [x - lh, x + lh]), c.east];
  // (Clear of the market street's own shops either side of it.)
  const marketCut = [mx - c.market.half - 6.8, mx + c.market.half + 6.8];
  const columns = [];
  for (let k = 0; k + 1 < xs.length; k += 2) columns.push([xs[k], xs[k + 1]]);
  // (The market street splits the column it runs through.)
  const blocksX = columns.flatMap(([a, b]) => (a < marketCut[0] && b > marketCut[1] ? [[a, marketCut[0]], [marketCut[1], b]] : [[a, b]]));
  // (South of the square's and the avenue's shops.)
  const zs = [-29.5, ...c.lanes.ew.flatMap((z) => [z - lh, z + lh]), 121];
  const rows = [];
  for (let k = 0; k + 1 < zs.length; k += 2) rows.push([zs[k], zs[k + 1]]);
  let yard = 0;
  for (const [z0, z1] of rows) {
    for (const [x0, x1] of blocksX) {
      // (Not inside the governor's compound, nor the river pavilion's ground.)
      if (x1 > gx0 - 1 && x0 < gx1 + 1 && z0 < gz1 + 1) continue;
      const share = c.rich[0] + (c.rich[1] - c.rich[0]) * pcSmooth(-20, 110, (z0 + z1) / 2);
      // Yards in two ranks back to back across the block, each facing the lane on its side.
      const depth = z1 - z0;
      const ranks = depth > 26 ? 2 : 1;
      for (let rank = 0; rank < ranks; rank += 1) {
        const [y0, y1] = ranks === 2 ? (rank === 0 ? [z0, (z0 + z1) / 2] : [(z0 + z1) / 2, z1]) : [z0, z1];
        const facesNorth = rank === 0;
        let x = x0;
        while (x1 - x > 9) {
          const wide = Math.min(x1 - x, 13 + 6 * random());
          const left = x1 - x - wide < 9 ? x1 - x : wide;
          yard += 1;
          const rich = random() < share;
          pcYard({ x0: x, x1: x + left, z0: y0, z1: y1, facesNorth, rich, seed: yard }, { groundAt, random, houses, walls, gates, jars, trees });
          x += left;
        }
      }
    }
  }
  // Oaks still in their brown leaves and bare trees along the lanes' ends and by the wall's bank.
  for (const [x, z] of [[18, -28], [18, 30], [18, 64], [18, 96], [44, 116], [80, 117], [140, 20], [140, 70], [141, -20]]) trees.push({ at: [x, z], y: groundAt(x, z), kind: random() < 0.5 ? 'oak' : 'bare', high: 8 + 4 * random(), seed: 700 + x + z });
  return { houses, halls, pavilions, terraces, walls, gates, lanterns, jars, trees, pagodas, bells, paving, ways };
}

/** One yard (pcYard: x0..x1, z0..z1, its lane on the north if `facesNorth`, else the south): its house(s), walls, gate, jars, tree. */
function pcYard({ x0, x1, z0, z1, facesNorth, rich, seed }, { groundAt, random, houses, walls, gates, jars, trees }) {
  const c = PY_CITY;
  const base = pcHighest(groundAt, x0, x1, z0, z1);
  const laneZ = facesNorth ? z0 : z1;
  const backZ = facesNorth ? z1 : z0;
  const inward = facesNorth ? 1 : -1;
  // (A house's front faces the yard, toward the lane: yaw 0 faces +z.)
  const facing = facesNorth ? Math.PI : 0;
  const gateX = x0 + 2.5 + random() * Math.max(0.1, x1 - x0 - 5);
  if (rich) {
    const mainWide = Math.min(x1 - x0 - 2, 9 + 3 * random());
    const mainDeep = 5.2 + random();
    const mainAt = [x0 + 1 + mainWide / 2 + random() * Math.max(0, x1 - x0 - 2 - mainWide), backZ - inward * (1.4 + mainDeep / 2)];
    const footing = c.footing;
    houses.push(pcHanok({ at: mainAt, yaw: facing, width: mainWide, depth: mainDeep, base: base + footing, footing, seed: seed * 13 + 1 }, random));
    // The side wing, along one side of the yard, its front on the yard.
    const sideLeft = random() < 0.5;
    const sideDeep = 4.4;
    const sideWide = Math.max(5, Math.abs(z1 - z0) - mainDeep - 6);
    const sideX = sideLeft ? x0 + 1.2 + sideDeep / 2 : x1 - 1.2 - sideDeep / 2;
    if (sideWide > 5 && x1 - x0 > mainWide * 0.6 + sideDeep + 3) houses.push(pcHanok({ at: [sideX, (mainAt[1] + laneZ) / 2 + inward * 0.6], yaw: sideLeft ? Math.PI / 2 : -Math.PI / 2, width: sideWide, depth: sideDeep, base: base + footing, footing, seed: seed * 13 + 2 }, random));
    walls.push(...tkCompoundRuns({ x0: x0 + 0.3, x1: x1 - 0.3, z0: Math.min(z0, z1) + 0.3, z1: Math.max(z0, z1) - 0.3, gates: [{ side: facesNorth ? 'north' : 'south', at: gateX, wide: 3.3 }] }).map((run) => ({ run, base, high: TK_HANOK.yard.high, material: 'plaster' })));
    gates.push({ at: [gateX, laneZ + inward * 0.3], yaw: 0, base });
    // The jar terrace: a stone-edged platform by the kitchen end, its jars in rows.
    const jx = sideLeft ? x1 - 3 : x0 + 3;
    const jz = mainAt[1] - inward * (mainDeep / 2 + 2.2);
    jars.push({ at: [jx, jz], base, count: 6 + Math.floor(random() * 7), seed });
    if (random() < 0.7) trees.push({ at: [sideLeft ? x1 - 2.5 : x0 + 2.5, (laneZ + mainAt[1]) / 2], y: base, kind: random() < 0.35 ? 'oak' : 'bare', high: 6 + 4 * random(), seed: 900 + seed, yard: true });
  } else {
    const wide = Math.min(x1 - x0 - 2, 6.5 + 2.5 * random());
    const deep = 4.2 + 0.8 * random();
    const at = [x0 + 1 + wide / 2 + random() * Math.max(0, x1 - x0 - 2 - wide), backZ - inward * (1.2 + deep / 2 + random() * 2)];
    houses.push({ kind: 'thatch', at, yaw: facing, width: wide, depth: deep, base: base + 0.25, ground: [['wall', 'door', 'wall'], ['lattice', 'door'], ['wall', 'door', 'lattice']][seed % 3], heights: [2.35], seed: seed * 13 + 5, blindBack: true });
    walls.push(...tkCompoundRuns({ x0: x0 + 0.3, x1: x1 - 0.3, z0: Math.min(z0, z1) + 0.3, z1: Math.max(z0, z1) - 0.3, gates: [{ side: facesNorth ? 'north' : 'south', at: gateX, wide: 2.2 }] }).map((run) => ({ run, base, high: 1.35, material: 'rubble', low: true })));
    if (random() < 0.5) jars.push({ at: [at[0] + (random() < 0.5 ? -1 : 1) * (wide / 2 + 1), at[1]], base, count: 2 + Math.floor(random() * 4), seed });
  }
}

/** A tiled house's spec for tkHouse (one storey on a stone footing: lattice doors and plastered panels, a hip-and-gable roof turning up at its corners). */
function pcHanok(spec, random) {
  const c = PY_CITY;
  return {
    kind: 'hanok', storeys: 1, heights: [2.75 + 0.25 * random()], wall: 'plaster', bay: 2.4,
    ground: [['lattice', 'door', 'lattice'], ['wall', 'lattice', 'door', 'lattice'], ['lattice', 'lattice', 'door']][Math.floor(random() * 3)],
    roof: { kind: 'hipgable', overhang: 1.05, sag: 0.36, lift: 0.32, liftRun: 2, breakAt: 0.48, tint: c.tiles.map((v) => v * (0.88 + 0.16 * random())), rafterEnd: [0.72, 0.4, 0.24] },
    timber: [0.4, 0.28, 0.2], blindBack: true, ...spec,
  };
}

/** Draw the town (pyCityPlan) into the place's blocks: `at(x, z)` the builder for a place. */
export function pyCityDraw(blocks, city, groundAt) {
  for (const p of city.paving) tkPaving(blocks.wide, p.material, p.x[0], p.x[1], p.z[0], p.z[1], (p.y ?? groundAt((p.x[0] + p.x[1]) / 2, (p.z[0] + p.z[1]) / 2)) + 0.03, [0.86, 0.86, 0.84]);
  for (const house of city.houses) {
    const b = blocks.at(house.at[0], house.at[1]);
    if (house.footing) tkTerrace(b, tkgFrame(house.at[0], house.base - house.footing, house.at[1], house.yaw), { width: house.width + 0.9, depth: house.depth + 0.9, high: house.footing, steps: [{ side: 'front', at: 0, wide: 1.8 }] });
    if (house.kind === 'thatch') tkThatch(b, house);
    else tkHouse(b, house);
  }
  for (const hall of city.halls) tkHall(blocks.at(hall.at[0], hall.at[1]), tkgFrame(hall.at[0], hall.base, hall.at[1], hall.yaw), { ...hall, paint: hall.paint ?? undefined });
  for (const p of city.pavilions) tkTerracePavilion(blocks.at(p.at[0], p.at[1]), tkgFrame(p.at[0], p.base, p.at[1], p.yaw), p);
  for (const t of city.terraces) tkTerrace(blocks.at(t.at[0], t.at[1]), tkgFrame(t.at[0], t.base, t.at[1], t.yaw), t);
  for (const w of city.walls) tkYardWall(blocks.at(...w.run[0]), w.run[0], w.run[1], { material: w.material, high: w.high, base: w.base, thick: w.low ? 0.5 : TK_HANOK.yard.thick });
  for (const g of city.gates) tkRoofedGate(blocks.at(g.at[0], g.at[1]), tkgFrame(g.at[0], g.base, g.at[1], g.yaw), g.temple ? { way: 3.4, high: 4.2 } : {});
  for (const p of city.pagodas) tkStonePagoda(blocks.at(p.at[0], p.at[1]), p.at[0], p.y, p.at[1], p);
  for (const l of city.lanterns) tkStoneLantern(blocks.at(l.at[0], l.at[1]), l.at[0], l.y, l.at[1], l);
  for (const b of city.bells) tkBell(blocks.at(b.at[0], b.at[1]), tkgFrame(b.at[0], b.y, b.at[1], 0), b);
  for (const j of city.jars) {
    const builder = blocks.at(j.at[0], j.at[1]);
    const random = tkRandom(j.seed * 71 + 3);
    const cols = Math.ceil(Math.sqrt(j.count * 1.5));
    tkTerrace(builder, tkgFrame(j.at[0], j.base, j.at[1], 0), { width: cols * 0.75 + 0.6, depth: Math.ceil(j.count / cols) * 0.75 + 0.6, high: 0.3, steps: [] });
    builder.at('near', () => {
      for (let k = 0; k < j.count; k += 1) {
        const [i, n] = [k % cols, Math.floor(k / cols)];
        tkJar(builder, j.at[0] - (cols - 1) * 0.375 + i * 0.75, j.base + 0.3, j.at[1] - (Math.ceil(j.count / cols) - 1) * 0.375 + n * 0.75, { high: 0.5 + 0.5 * random(), colour: [0.24, 0.15, 0.1].map((v) => v * (0.85 + 0.35 * random())), lid: random() < 0.8 });
      }
    });
  }
  // A paper lantern under the eaves of the halls' and the gate pavilions' middle bays.
  for (const p of [...city.pavilions.filter((q) => q.name === 'compoundGate' || q.name === 'bell')]) {
    const frame = tkgFrame(p.at[0], p.base + p.terrace, p.at[1], p.yaw);
    for (const s of [-1, 1]) {
      const [x, y, z] = frame(s * 1.6, p.storeys[0].high - 0.9, p.storeys[0].depth / 2 + 0.3);
      blocks.at(p.at[0], p.at[1]).at('near', () => tkLantern(blocks.at(p.at[0], p.at[1]), x, y, z, { size: 0.24, colour: [0.86, 0.78, 0.62] }));
    }
  }
}

/** The town's solids (pyCityPlan): the houses and their footings, halls, pavilions, terraces, walls, the gates' posts, the pagoda, the lanterns. */
export function pyCitySolids(city) {
  const solids = [];
  for (const house of city.houses) {
    if (house.footing) solids.push(...tkTerraceSolids(tkgFrame(house.at[0], 0, house.at[1], house.yaw), { width: house.width + 0.9, depth: house.depth + 0.9, high: house.footing, steps: [{ side: 'front', at: 0, wide: 1.8 }] }, house.base - house.footing));
    solids.push(tkHouseSolid(house));
  }
  for (const hall of city.halls) solids.push(...tkHallSolids(tkgFrame(hall.at[0], 0, hall.at[1], hall.yaw), hall, hall.base));
  for (const p of city.pavilions) solids.push(...tkTerracePavilionSolids(tkgFrame(p.at[0], 0, p.at[1], p.yaw), p, p.base));
  for (const t of city.terraces) solids.push(...tkTerraceSolids(tkgFrame(t.at[0], 0, t.at[1], t.yaw), t, t.base));
  for (const w of city.walls) solids.push(tkYardWallSolid(w.run[0], w.run[1], { base: w.base, thick: w.low ? 0.5 : TK_HANOK.yard.thick }));
  for (const p of city.pagodas) solids.push(tkStonePagodaSolid(p.at[0], p.y, p.at[1], p));
  for (const l of city.lanterns) solids.push(tkStoneLanternSolid(l.at[0], l.y, l.at[1], l));
  for (const j of city.jars) {
    const cols = Math.ceil(Math.sqrt(j.count * 1.5));
    solids.push(tkTerraceSolids(tkgFrame(j.at[0], 0, j.at[1], 0), { width: cols * 0.75 + 0.6, depth: Math.ceil(j.count / cols) * 0.75 + 0.6, high: 0.3, steps: [] }, j.base)[0]);
  }
  return solids;
}

/**
 * The town's far part beyond the walked streets, drawn only (no walker reaches it): `x` and `z` its ground, `lanes` the
 * spacing of its lanes (E-W), the avenue running on east through it to the east wall (`wall`: its x) and its gate at the
 * avenue's end; a hall, a temple and a pavilion standing over its roofs (`landmarks`: [x, z, kind]). The houses tiled
 * nearer the avenue, thatched further from it (PY_CITY.rich).
 */
export const PY_FAR_TOWN = { x: [151, 296], z: [-118, 122], lanes: 24, wall: 304, landmarks: [[214, -96, 'temple'], [236, -22, 'hall'], [196, 44, 'pavilion'], [262, 86, 'hall']] };

/** Whether a point lies in the far town (its ground and a margin). */
export const pyInFarTown = (x, z, margin = 6) => x > PY_FAR_TOWN.x[0] - margin && x < PY_FAR_TOWN.wall + margin && z > PY_FAR_TOWN.z[0] - margin && z < PY_FAR_TOWN.z[1] + margin;

/** The far town laid out (PY_FAR_TOWN): its houses (tkHouse's specs, `far`), and its landmark halls and pavilions. Seeded. */
export function pyFarTownPlan(groundAt) {
  const f = PY_FAR_TOWN;
  const random = tkRandom(16593);
  const houses = [];
  const halls = [];
  const pavilions = [];
  const walls = [];
  const gates = [];
  const jars = [];
  const trees = [];
  const keep = f.landmarks.map(([x, z]) => [x, z]);
  const clear = (x0, x1, z0, z1) => keep.every(([kx, kz]) => kx < x0 - 12 || kx > x1 + 12 || kz < Math.min(z0, z1) - 10 || kz > Math.max(z0, z1) + 10);
  // (Blocks between its lanes, as the near streets' (pcYard), each cut in yards; north-south lanes at an uneven spacing.)
  const xs = [f.x[0]];
  while (xs.at(-1) < f.wall - 30) xs.push(xs.at(-1) + 26 + 16 * random());
  xs.push(f.wall - 6);
  let yard = 5000;
  for (let z = f.z[0]; z + 8 < f.z[1]; z += f.lanes) {
    const z1 = Math.min(f.z[1], z + f.lanes - 4);
    // (Not across the avenue.)
    const bands = z < -50 && z1 > -54 ? [[z, -54], [-46, z1]] : [[z, z1]];
    for (const [b0, b1] of bands) {
      if (b1 - b0 < 9) continue;
      for (let k = 0; k + 1 < xs.length; k += 1) {
        const [x0, x1] = [xs[k] + 2, xs[k + 1] - 2];
        if (!clear(x0, x1, b0, b1)) continue;
        const share = PY_CITY.rich[0] + (PY_CITY.rich[1] - PY_CITY.rich[0]) * pcSmooth(0, 110, Math.abs((b0 + b1) / 2 + 50));
        let x = x0;
        while (x1 - x > 9) {
          const wide = Math.min(x1 - x, 12 + 7 * random());
          const left = x1 - x - wide < 9 ? x1 - x : wide;
          yard += 1;
          pcYard({ x0: x, x1: x + left, z0: b0, z1: b1, facesNorth: random() < 0.5, rich: random() < share, seed: yard }, { groundAt, random, houses, walls, gates, jars, trees });
          x += left;
        }
      }
    }
  }
  for (const house of houses) house.far = true;
  // (The avenue's two sides: shops, tiled.)
  for (const side of [-1, 1]) {
    let x = f.x[0];
    while (x < f.wall - 10) {
      const wide = 5 + 3 * random();
      houses.push({ ...pcHanok({ at: [x + wide / 2, -50 + side * 6.6], yaw: side < 0 ? 0 : Math.PI, width: wide, depth: 6, base: groundAt(x + wide / 2, -50 + side * 6.6), seed: Math.floor(random() * 1e6), far: true }, random), kind: 'shop', ground: [['open', 'boards', 'door']] });
      x += wide + 0.2;
    }
  }
  for (const [x, z, kind] of f.landmarks) {
    const base = groundAt(x, z);
    if (kind === 'pavilion') pavilions.push({ at: [x, z], yaw: 0, base, storeys: [{ width: 9, depth: 7, high: 3.4, fill: 'open' }, { width: 6.6, depth: 4.8, high: 2.8, fill: 'lattice' }], terrace: 1.6, apron: 1.4, far: true });
    else halls.push({ at: [x, z], yaw: 0, base, width: kind === 'temple' ? 14 : 16, depth: 8, high: 3.6, terrace: kind === 'temple' ? 2.6 : 1.2, apron: 2, bay: 3.2, far: true });
  }
  // The east gate's tower over the avenue's end, on the wall.
  pavilions.push({ at: [f.wall, -50], yaw: -Math.PI / 2, base: groundAt(f.wall, -50) + 4.5, storeys: [{ width: 12, depth: 6, high: 3.1, fill: 'open' }, { width: 9, depth: 4.4, high: 2.6, fill: 'lattice' }], terrace: 0.4, apron: 0.6, far: true, gate: true });
  return { houses, halls, pavilions, walls, gates, trees };
}

/** Draw the far town (pyFarTownPlan) into the place's far blocks; its trees by `tree(builder, tree)`. */
export function pyFarTownDraw(blocks, far, tree) {
  for (const w of far.walls) tkYardWall(blocks.at(w.run[0][0], w.run[0][1], true), w.run[0], w.run[1], { material: w.material, high: w.high, base: w.base, thick: w.low ? 0.5 : TK_HANOK.yard.thick });
  for (const g of far.gates) tkRoofedGate(blocks.at(g.at[0], g.at[1], true), tkgFrame(g.at[0], g.base, g.at[1], g.yaw));
  for (const t of far.trees) tree(blocks.at(t.at[0], t.at[1], true), t);
  for (const house of far.houses) {
    const b = blocks.at(house.at[0], house.at[1], true);
    if (house.kind === 'thatch') tkThatch(b, house);
    else tkHouse(b, house);
  }
  for (const hall of far.halls) tkHall(blocks.at(hall.at[0], hall.at[1], true), tkgFrame(hall.at[0], hall.base, hall.at[1], hall.yaw), hall);
  for (const p of far.pavilions) tkTerracePavilion(blocks.at(p.at[0], p.at[1], true), tkgFrame(p.at[0], p.base, p.at[1], p.yaw), { ...p, steps: [] });
}
