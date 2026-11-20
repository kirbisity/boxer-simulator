// The town kit's Joseon buildings and stone work: a dressed-stone terrace with its steps, a hall on one (the timber
// frame, painted brackets and hip-and-gable roof of townkit/works.js tkPavilion, its bays filled with lattice doors), a
// roofed gate in a yard wall, a run of yard walls round a compound with its gate left open, a thatched cottage, a
// stone pagoda, a stone lantern and a bronze bell. Each maker lays its pieces with the makers of townkit/geo.js; each
// thing a walker meets has a second function giving its solids (physics/terrain.js) from the same description. No
// three.js here.
//
// What they are drawn from (typical forms, not one surveyed building): the halls of a Joseon provincial governor's
// compound and a hill temple (a stylobate of dressed granite, a hall of three to seven bays, columns on stone bases,
// bracket sets, dancheong, a tiled hip-and-gable roof whose eaves turn up at the corners); the tall gate of a yangban
// house (솟을대문); the granite stone pagodas and stone lanterns of Korean temples (a square, tiered pagoda on a
// two-stage base; an octagonal lantern: base, shaft, the lamp chamber with its windows, the cap and finial); the
// bronze temple bell (beomjong) in its pavilion; a commoner's house thatched in rice straw, the roof rounded and roped.

import { slabOf, stairsOf, wallLine, wallOf } from '../physics/terrain.js';
import { tkRandom } from './tex.js';
import { tkgBay, tkgFrame, tkgRoof, tkgWall } from './geo.js';
import { TK_HOUSE, tkHouse } from './build.js';
import { TK_WORKS, tkPavilion, tkPavilionSolids } from './works.js';

/**
 * The pieces' make-up where a description says nothing (m; colours multiply the sheets). `terrace`: a stylobate's coping
 * stone's thickness and overhang, a stair's tread and rise; `gate`: the roofed gate's passage, posts and roof; `yard`: a
 * compound wall's height and thickness; `thatch`: rice straw's colour (weathered grey-gold), its roof's swell (a thatched
 * roof is rounded, not hollow), overhang and the ropes over it; `pagoda`: the granite's colour, its tiers' shrink and roof
 * slabs; `lantern`: an octagonal lantern's proportions; `bell`: bronze, darkened.
 */
export const TK_HANOK = {
  granite: [0.8, 0.79, 0.76],
  terrace: { coping: 0.16, lip: 0.1, tread: 0.32, rise: 0.17 },
  gate: { way: 2.4, high: 3.6, post: 0.15, roof: { rise: 1.3, overhang: 0.75, lift: 0.22, sag: 0.32 } },
  yard: { high: 2.2, thick: 0.4 },
  thatch: { colour: [0.72, 0.62, 0.45], swell: -0.22, overhang: 0.45, ropes: 0.6, rope: [0.5, 0.43, 0.32] },
  pagoda: { shrink: 0.8, slab: 0.14, lift: 0.08 },
  lantern: { base: 0.42, shaft: 0.13, chamber: 0.3, cap: 0.42 },
  bell: { colour: [0.3, 0.27, 0.2] },
};

const tkhScale = (colour, by) => colour.map((value) => value * by);

/**
 * A dressed-stone terrace in `frame` (its plan's middle at the ground, front +z): `width` x `depth`, `high` m tall, its
 * face in courses of `material`, a coping stone round its top; `steps`: stairs up to it, each { side: 'front' | 'back' |
 * 'left' | 'right', at (m along that side from its middle), wide }. Returns the terrace's top (local y).
 */
export function tkTerrace(builder, frame, { width, depth, high, material = 'ashlar', colour = TK_HANOK.granite, steps = [{ side: 'front', at: 0, wide: 3 }] }) {
  const { coping, lip } = TK_HANOK.terrace;
  builder.box(material, frame, -width / 2, width / 2, -0.3, high - coping, -depth / 2, depth / 2, { colour: tkhScale(colour, 0.92), skip: 'bottom', shade: [0.82, 1] });
  builder.box('ashlar', frame, -width / 2 - lip, width / 2 + lip, high - coping, high, -depth / 2 - lip, depth / 2 + lip, { colour, skip: 'bottom' });
  for (const step of steps) tkhStairs(builder, frame, { width, depth, high }, step, colour);
  return high;
}

/** A terrace's stairs as runs of treads out from one side (tkTerrace `steps`): in local coordinates, each tread a box. */
function tkhStairs(builder, frame, { width, depth, high }, { side = 'front', at = 0, wide = 3 }, colour) {
  const side3 = tkhSide(frame, { width, depth }, side, at);
  const { tread, rise } = TK_HANOK.terrace;
  const count = Math.max(1, Math.round(high / rise));
  const each = high / count;
  for (let k = 0; k < count; k += 1) {
    const top = high - k * each;
    builder.box('ashlar', side3, -wide / 2, wide / 2, -0.2, top, k * tread, (k + 1) * tread, { colour: tkhScale(colour, 0.95 + 0.05 * (k % 2)), skip: 'bottom' });
  }
  // The cheek stones either side, sloping down with the stair.
  for (const s of [-1, 1]) builder.box('ashlar', side3, s * wide / 2 - (s > 0 ? 0 : 0.22), s * wide / 2 + (s > 0 ? 0.22 : 0), -0.2, high * 0.55, 0, count * tread * 0.9, { colour: tkhScale(colour, 0.85), skip: 'bottom' });
}

/** The frame on one side of a plan (its outward way +z), `at` m along it from its middle. */
function tkhSide(frame, { width, depth }, side, at) {
  if (side === 'back') return frame.child(-at, 0, -depth / 2, Math.PI);
  if (side === 'left') return frame.child(-width / 2, 0, -at, -Math.PI / 2);
  if (side === 'right') return frame.child(width / 2, 0, at, Math.PI / 2);
  return frame.child(at, 0, depth / 2, 0);
}

/** A terrace's solids (tkTerrace): its block as a slab, its stairs. `base`: the ground's height under it. */
export function tkTerraceSolids(frame, { width, depth, high, steps = [{ side: 'front', at: 0, wide: 3 }] }, base = 0) {
  const [x, , z] = frame(0, 0, 0);
  const solids = [slabOf([x, z], [width + 2 * TK_HANOK.terrace.lip, depth + 2 * TK_HANOK.terrace.lip], base + high, { yaw: frame.yaw, bottom: base - 2 })];
  const { tread, rise } = TK_HANOK.terrace;
  for (const { side = 'front', at = 0, wide = 3 } of steps) {
    const count = Math.max(1, Math.round(high / rise));
    const side3 = tkhSide(frame, { width, depth }, side, at);
    // (From the foot of the flight, out from the side, in toward the terrace: physics/terrain.js stairs climb along u.)
    const [fx, , fz] = side3(0, 0, count * tread);
    const [tx, , tz] = side3(0, 0, 0);
    solids.push(stairsOf([(fx + tx) / 2, (fz + tz) / 2], [count * tread, wide], count, base, high / count, { yaw: Math.atan2(-(tz - fz), tx - fx), bottom: base - 1 }));
  }
  return solids;
}

/**
 * A hall on a terrace in `frame` (at the terrace's foot, front +z): the terrace (`terrace` m high, `apron` m wider than
 * the hall all round, its stairs `steps` as tkTerrace's), and on it a one-storey timber hall `width` x `depth`, `high`
 * to the column heads, `bay` between columns: columns on stone bases, bracket sets, painted beams, lattice doors in every
 * bay, the tiled hip-and-gable roof (tkPavilion's). `paint`, `tint`: the dancheong and the tiles. `board`: a name
 * board under the front eave. Returns the eave's height over the frame.
 */
export function tkHall(builder, frame, { width, depth, high = 3.4, bay = 3.0, terrace = 0.9, apron = 1.6, steps = null, paint = TK_WORKS.paint, tint = [0.62, 0.64, 0.66], overhang = 1.6, board = true, storeys = null }) {
  const plan = { width: width + 2 * apron, depth: depth + 2 * apron };
  const top = tkTerrace(builder, frame, { ...plan, high: terrace, steps: steps ?? [{ side: 'front', at: 0, wide: Math.min(5, width * 0.4) }] });
  const body = frame.child(0, top, 0);
  // The hall's walls behind its lattice: plastered panels between the columns at the back and the ends (seen through
  // the doors when a man stands at them), so the hall is closed, not a pavilion.
  for (const [side, half, out] of [[Math.PI, width / 2, depth / 2], [Math.PI / 2, depth / 2, width / 2], [-Math.PI / 2, depth / 2, width / 2]]) {
    tkgWall(builder, body.child(0, 0, 0, side).child(0, 0, out - 0.05), { material: 'plaster', x0: -half, x1: half, y0: 0.1, y1: high - 0.62, colour: TK_HOUSE.plaster, shade: [0.85, 1] });
  }
  return top + tkPavilion(builder, body, { storeys: storeys ?? [{ width, depth, high, fill: 'lattice' }], bay, paint, tint, overhang, board, lift: 0.55 });
}

/** A hall's solids (tkHall): its terrace and stairs, and the hall's walls as one block standing on the terrace. */
export function tkHallSolids(frame, { width, depth, high = 3.4, terrace = 0.9, apron = 1.6, steps = null }, base = 0) {
  const plan = { width: width + 2 * apron, depth: depth + 2 * apron };
  const solids = tkTerraceSolids(frame, { ...plan, high: terrace, steps: steps ?? [{ side: 'front', at: 0, wide: Math.min(5, width * 0.4) }] }, base);
  const [x, , z] = frame(0, 0, 0);
  solids.push(wallOf([x, z], [width + 0.3, depth + 0.3], base + terrace - 0.2, base + terrace + high + 2, { yaw: frame.yaw }));
  return solids;
}

/**
 * A two-storey gate pavilion or a pavilion on a terrace (the governor's gate, the bell pavilion, the river pavilion):
 * tkPavilion's storeys on a terrace (`terrace` m, `apron` wider), stairs on the sides given. Returns the top eave's height.
 */
export function tkTerracePavilion(builder, frame, { storeys, terrace = 1.0, apron = 1.2, steps = null, bay = 2.7, board = true, overhang = 1.5 }) {
  const plan = { width: storeys[0].width + 2 * apron, depth: storeys[0].depth + 2 * apron };
  const top = tkTerrace(builder, frame, { ...plan, high: terrace, steps: steps ?? [{ side: 'front', at: 0, wide: 3 }, { side: 'back', at: 0, wide: 3 }] });
  return top + tkPavilion(builder, frame.child(0, top, 0), { storeys, bay, board, overhang });
}

/** A terraced pavilion's solids: the terrace, its stairs, the first storey's columns. */
export function tkTerracePavilionSolids(frame, { storeys, terrace = 1.0, apron = 1.2, steps = null, bay = 2.7 }, base = 0) {
  const plan = { width: storeys[0].width + 2 * apron, depth: storeys[0].depth + 2 * apron };
  const solids = tkTerraceSolids(frame, { ...plan, high: terrace, steps: steps ?? [{ side: 'front', at: 0, wide: 3 }, { side: 'back', at: 0, wide: 3 }] }, base);
  solids.push(...tkPavilionSolids(frame, { storeys, bay }, base + terrace));
  return solids;
}

/**
 * A roofed gate in `frame` (its passage's middle at the ground, the way through along z): two stout posts each side on
 * stone bases, a lintel and a pair of plank leaves standing open, and over it a small tiled hip-and-gable roof whose
 * eaves turn up (the tall gate of a house of standing). `way` m wide, `high` m to the lintel.
 */
export function tkRoofedGate(builder, frame, { way = TK_HANOK.gate.way, high = TK_HANOK.gate.high, tint = [0.62, 0.64, 0.66], timber = [0.36, 0.25, 0.18] } = {}) {
  const { post, roof } = TK_HANOK.gate;
  for (const s of [-1, 1]) {
    for (const z of [-0.55, 0.55]) {
      builder.round('ashlar', frame, s * (way / 2 + post), z, 0, 0.18, post * 1.8, post * 1.5, { colour: TK_HANOK.granite, sides: 8 });
      builder.round('timber', frame, s * (way / 2 + post), z, 0.18, high, post, post * 0.9, { colour: timber, sides: 8, caps: '' });
    }
    // A leaf standing open against each side.
    builder.box('timber', frame.child(s * (way / 2 - 0.05), 0, -0.45, -s * 1.25), -0.06, 0.06, 0.12, high - 0.25, -way / 2 + 0.1, 0, { colour: tkhScale(timber, 0.85) });
  }
  builder.box('timber', frame, -way / 2 - post * 2, way / 2 + post * 2, high, high + 0.28, -0.75, 0.75, { colour: tkhScale(timber, 0.9) });
  tkgRoof(builder, frame.child(0, high + 0.28, 0, Math.PI / 2), { kind: 'hipgable', width: 1.9, depth: way + 0.9, eave: 0, rise: roof.rise, overhang: roof.overhang, sag: roof.sag, lift: roof.lift, breakAt: 0.5, tint, timber, rafterEnd: [0.7, 0.35, 0.2] });
}

/**
 * The yard walls round a compound (x0..x1, z0..z1 in the world, on the ground at `base`), tiled along their tops (townkit/
 * build.js tkYardWall's make), each side left open for its gates: `gates`, each { side: 'north' | 'south' | 'east' |
 * 'west', at (x or z of its middle), wide }. Returns the wall's runs ([a, b] each) for its solids.
 */
export function tkCompoundRuns({ x0, x1, z0, z1, gates = [] }) {
  const sides = { north: [[x0, z0], [x1, z0]], east: [[x1, z0], [x1, z1]], south: [[x1, z1], [x0, z1]], west: [[x0, z1], [x0, z0]] };
  const runs = [];
  for (const [name, [a, b]] of Object.entries(sides)) {
    const along = a[0] === b[0] ? 1 : 0;
    const cuts = gates.filter((gate) => gate.side === name).map((gate) => [gate.at - gate.wide / 2, gate.at + gate.wide / 2]).sort((p, q) => p[0] - q[0]);
    const [lo, hi] = [Math.min(a[along], b[along]), Math.max(a[along], b[along])];
    let from = lo;
    const point = (value) => (along ? [a[0], value] : [value, a[1]]);
    for (const [c0, c1] of cuts) {
      if (c0 > from + 0.3) runs.push([point(from), point(c0)]);
      from = Math.max(from, c1);
    }
    if (hi > from + 0.3) runs.push([point(from), point(hi)]);
  }
  return runs;
}

/**
 * A thatched cottage (spec as tkHouse's: at, yaw, width, depth, wall, ground, base, seed): its walls of mud plaster on a
 * stone footing, and a roof of rice straw, rounded (TK_HANOK.thatch `swell`). Returns its eave height.
 */
export function tkThatch(builder, spec) {
  const t = TK_HANOK.thatch;
  const random = tkRandom((spec.seed ?? 1) * 613 + 7);
  const straw = tkhScale(t.colour, 0.85 + 0.25 * random());
  // (The straw laid as a solid coat on the earth sheet's grain, not the scatter's grass cards: thatch is a mass.)
  const eave = tkHouse(builder, { storeys: 1, heights: [2.35], wall: 'plaster', ...spec, roof: { kind: 'hip', tiles: 'earth', rolls: 0, laps: 0, tint: straw, sag: t.swell, overhang: t.overhang, verge: 0.3, rise: spec.depth * 0.42, ridge: { high: 0.22, wide: 0.5, lift: 0, material: 'earth' }, ...spec.roof } });
  return eave;
}

/**
 * A granite pagoda at world (x, y, z): a two-stage base, then `tiers` bodies each `shrink` of the one below, each with a
 * thin roof slab whose corners lift, and a finial on top. `size`: the lowest body's width (m).
 */
export function tkStonePagoda(builder, x, y, z, { tiers = 5, size = 1.5, yaw = 0, colour = TK_HANOK.granite } = {}) {
  const { shrink, slab, lift } = TK_HANOK.pagoda;
  const frame = tkgFrame(x, y, z, yaw);
  let at = 0;
  for (const [wide, high] of [[size * 2.1, 0.55], [size * 1.55, 0.5]]) {
    builder.box('ashlar', frame, -wide / 2, wide / 2, at - 0.2, at + high, -wide / 2, wide / 2, { colour: tkhScale(colour, 0.9), skip: 'bottom' });
    builder.box('ashlar', frame, -wide / 2 - 0.08, wide / 2 + 0.08, at + high - 0.08, at + high, -wide / 2 - 0.08, wide / 2 + 0.08, { colour, skip: 'bottom' });
    at += high;
  }
  let wide = size;
  for (let k = 0; k < tiers; k += 1) {
    const body = k === 0 ? size * 0.75 : size * 0.42 * shrink ** k;
    builder.box('ashlar', frame, -wide / 2, wide / 2, at, at + body, -wide / 2, wide / 2, { colour: tkhScale(colour, 0.94), skip: 'bottom' });
    at += body;
    // The roof slab: stepped underneath, its upper face sloping to lifted corners.
    const roof = wide * 1.75;
    builder.box('ashlar', frame, -wide * 0.62, wide * 0.62, at, at + slab * 0.6, -wide * 0.62, wide * 0.62, { colour: tkhScale(colour, 0.85) });
    builder.box('ashlar', frame, -roof / 2, roof / 2, at + slab * 0.6, at + slab * 1.3, -roof / 2, roof / 2, { colour });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) builder.box('ashlar', frame, sx * roof / 2 - (sx > 0 ? 0.18 : 0), sx * roof / 2 + (sx > 0 ? 0 : 0.18), at + slab * 1.3, at + slab * 1.3 + lift, sz * roof / 2 - (sz > 0 ? 0.18 : 0), sz * roof / 2 + (sz > 0 ? 0 : 0.18), { colour });
    builder.box('ashlar', frame, -roof * 0.32, roof * 0.32, at + slab * 1.3, at + slab * 1.9, -roof * 0.32, roof * 0.32, { colour: tkhScale(colour, 0.96) });
    at += slab * 1.9;
    wide *= shrink;
  }
  // The finial: a stack of discs and a spire.
  for (const [r, h] of [[wide * 0.4, 0.12], [wide * 0.3, 0.18], [wide * 0.22, 0.16], [wide * 0.16, 0.16], [0.05, 0.5]]) {
    builder.round('ashlar', frame, 0, 0, at, at + h, r, r * 0.9, { colour, sides: 10 });
    at += h;
  }
  return at;
}

/** A pagoda's solid: its base as a block. */
export const tkStonePagodaSolid = (x, y, z, { size = 1.5, yaw = 0 } = {}) => wallOf([x, z], [size * 2.2, size * 2.2], y - 1, y + 6, { yaw });

/**
 * An octagonal stone lantern at world (x, y, z), `high` m: a lotus base, a slender shaft, the lamp chamber with its four
 * windows (a light in it when `lit`), a broad eight-sided cap turned up at its rim, and a jewel finial.
 */
export function tkStoneLantern(builder, x, y, z, { high = 2.3, colour = TK_HANOK.granite, lit = false } = {}) {
  const k = high / 2.3;
  const L = TK_HANOK.lantern;
  const frame = tkgFrame(x, y, z, 0);
  const parts = [[L.base * k, 0.32 * k], [L.base * 0.8 * k, 0.16 * k], [L.shaft * k, 0.75 * k], [L.base * 0.75 * k, 0.14 * k]];
  let at = 0;
  for (const [r, h] of parts) {
    builder.round('ashlar', frame, 0, 0, at, at + h, r, r * 0.95, { colour, sides: 8 });
    at += h;
  }
  const chamber = 0.42 * k;
  builder.round('ashlar', frame, 0, 0, at, at + chamber, L.chamber * k, L.chamber * k, { colour: tkhScale(colour, 0.92), sides: 8 });
  // The windows: dark (or lit) panes on four faces.
  for (let n = 0; n < 4; n += 1) {
    const face = frame.child(0, 0, 0, (n * Math.PI) / 2);
    builder.box(lit ? 'lamp' : 'timber', face, -0.08 * k, 0.08 * k, at + 0.1 * k, at + chamber - 0.1 * k, L.chamber * k - 0.02, L.chamber * k + 0.012, { colour: lit ? [1, 0.82, 0.52] : [0.08, 0.07, 0.06], skip: 'back' });
  }
  at += chamber;
  builder.round('ashlar', frame, 0, 0, at, at + 0.1 * k, L.cap * k, L.cap * 1.05 * k, { colour, sides: 8 });
  builder.round('ashlar', frame, 0, 0, at + 0.1 * k, at + 0.32 * k, L.cap * 0.9 * k, 0.08 * k, { colour, sides: 8 });
  builder.round('ashlar', frame, 0, 0, at + 0.32 * k, at + 0.46 * k, 0.07 * k, 0.03 * k, { colour, sides: 8 });
  return at + 0.46 * k;
}

/** A lantern's solid. */
export const tkStoneLanternSolid = (x, y, z, { high = 2.3 } = {}) => wallOf([x, z], [0.8 * (high / 2.3), 0.8 * (high / 2.3)], y - 0.5, y + high);

/** A bronze bell hung in `frame` (its crown at the frame's origin): the bell's flared body, its lip and the dragon loop. */
export function tkBell(builder, frame, { high = 1.6, colour = TK_HANOK.bell.colour } = {}) {
  const r = high * 0.36;
  builder.round('ware', frame, 0, 0, -high, -high * 0.12, r * 1.08, r * 0.82, { colour, sides: 16 });
  builder.round('ware', frame, 0, 0, -high * 0.12, 0, r * 0.82, r * 0.55, { colour: tkhScale(colour, 0.9), sides: 16 });
  builder.round('ware', frame, 0, 0, -high - 0.05, -high + 0.08, r * 1.12, r * 1.1, { colour: tkhScale(colour, 1.1), sides: 16 });
  builder.box('ware', frame, -0.06, 0.06, 0, 0.3, -0.14, 0.14, { colour });
}
