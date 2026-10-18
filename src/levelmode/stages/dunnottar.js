// Stage 1, "Memories of Dunnottar": a storm-swept sea-cliff fortress, as stage data (levelmode/stage.js
// describes the format; physics/terrain.js the solids). Modelled on the real castle: a flat-topped
// black-rock headland with sheer cliffs to a stormy sea, joined to the mainland by a low neck; a fenced
// switchback path down the mainland slope into the gorge and up to the gate in the cliff; the gatehouse
// with its oillets (gun loops) over a steep stair; barrel-vaulted cellars; a winding tower stair; ruined
// ranges round a grassy quadrangle; a roofless chapel. Doorways, passages and vaults are 1.5-2x real size
// (camera room).
//
// The world, one continuous map (x east, z south, y up; every number is a metre):
//
//   cliff   The Cliff Path     mainland x -126..-50, z -10..58 : start (-114, 14, -4) down three fenced legs and a
//                              stair to the gorge shelf (y 0, x -64..-7), Rest 1 at its brazier
//   gate    Gatehouse & Oillets x -8..31, z 38..58           : the great gate (closed: Shortcut 1) and the ledge round to a
//                              postern; the guard hall, a steep stair up to the oillet wall, and the gallery behind it
//   ascent  Tunnelled Ascent    x 9..29, z 5..42             : vestibule, two stair flights and a guard room up to the quad (y 12.18)
//   quad    The Quadrangle      x -2..46, z -38..8  (y>=9.8)  : grass court, the well (Rest 2), ruined ranges, the stairs down to the vault
//   vault   Whigs' Vault        x -2..46, z -36..-3 (y 3..11.5): the long cellar (floor y 6), the cell hall, the iron gate up to the quad
//                              (Shortcut 3), the east stair up into the tower house
//   tower   Tower House & Upper Walls: the keep hall (y 12.18), the winding tower stair (to y 24.93), the north wall walk, a stair
//                              down to the ladder room (y 17.18: Shortcut 2 kicks a ladder down into the quad) and Rest 3
//   chapel  The Chapel          x -19..-3, z -47..-29 (y 17.18): the roofless summit arena, Lord Vaelen
//   cell    The Inner Cell      x -14..-4, z -55..-46          : after the boss: the prince
//
// A section's `decor` is for the drawing only (levelmode/kit.js): wall runs with openings, vaults, props. The solids
// that make the physics carry a `style` (how they are drawn) and, when a run draws them instead, `skin: false`.

import { ceilingOf, rampOf, slabOf, stairsOf, wallLine, wallOf, windingStairs, windingTread } from '../../physics/terrain.js';

/** The levels (y). */
export const DN_Y = { sea: -9, start: 14, pathA: 10.6, pathB: 7.2, pathC: 3.8, gorge: 0, landing: 4.18, guardroom: 8.18, quad: 12.18, vault: 6.0, ladderRoom: 17.18, walk: 24.93 };
const Y = DN_Y;

/** Facing: yaw 0 looks along +x, a positive yaw turns toward -z. */
export const DN_FACE = { E: 0, N: Math.PI / 2, W: Math.PI, S: -Math.PI / 2 };
const DIRS = { E: [1, 0, 0], W: [-1, 0, Math.PI], N: [0, -1, Math.PI / 2], S: [0, 1, -Math.PI / 2] };

// ---- Builders -------------------------------------------------------------------------------

const dnSection = (id, name) => ({ id, name, bounds: [], terrain: [], portals: [], spawns: [], items: [], levers: [], gates: [], ladders: [], decor: [] });

/** A slab by extents. `style`: how the top is drawn (cobble, flags, grass, path, rock, boards, earth). */
function dnSlab(sec, x0, x1, z0, z1, top, style, opts = {}) {
  const solid = { ...slabOf([(x0 + x1) / 2, (z0 + z1) / 2], [x1 - x0, z1 - z0], top, { bottom: opts.bottom, id: opts.id }), style, ...(opts.extra ?? {}) };
  if (opts.skin === false) solid.skin = false;
  sec.terrain.push(solid);
  return solid;
}

/** A wall box by extents. */
function dnBox(sec, x0, x1, z0, z1, y0, y1, style = 'ashlar', opts = {}) {
  const solid = { ...wallOf([(x0 + x1) / 2, (z0 + z1) / 2], [x1 - x0, z1 - z0], y0, y1, { id: opts.id }), style, ...(opts.extra ?? {}) };
  if (opts.skin === false) solid.skin = false;
  sec.terrain.push(solid);
  return solid;
}

/** A ceiling by extents (its underside at `bottom`; `top` for the roof). */
function dnCeiling(sec, x0, x1, z0, z1, bottom, top = bottom + 0.8, style = 'vault') {
  sec.terrain.push({ ...ceilingOf([(x0 + x1) / 2, (z0 + z1) / 2], [x1 - x0, z1 - z0], bottom, { top }), style, skin: false });
}

/**
 * A wall from `a` to `b` (each [x, z], the centreline), `thick` thick, from y0 to y1, with openings:
 * { at: distance of the middle from a, width, sill (the floor; default y0), top, shape: 'round' | 'pointed' | 'square' | 'slit' | 'lancet', solid }.
 * An opening is clear to the physics from `sill` to `top` (a `solid` one - a window - blocks, and is only drawn open).
 * The kit draws the run as one wall with its openings (decor); the pieces carry `skin: false`.
 */
function dnRun(sec, a, b, thick, y0, y1, style, openings = [], extra = {}) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  const ux = dx / length;
  const uz = dz / length;
  const yaw = Math.atan2(-dz, dx);
  const piece = (s0, s1, lo, hi) => {
    if (s1 - s0 < 1e-3 || hi - lo < 1e-3) return;
    const s = (s0 + s1) / 2;
    sec.terrain.push({ ...wallOf([a[0] + ux * s, a[1] + uz * s], [s1 - s0, thick], lo, hi, { yaw }), style, skin: false });
  };
  let cursor = 0;
  for (const o of [...openings].sort((p, q) => p.at - q.at)) {
    const s0 = o.at - o.width / 2;
    const s1 = o.at + o.width / 2;
    piece(cursor, s0, y0, y1);
    if (o.solid) piece(s0, s1, y0, y1);
    else {
      // (Under the sill, a hand's breadth below the floor: a wall whose top is flush with the floor would catch a foot that sags a little.)
      if (o.sill !== undefined) piece(s0, s1, y0, o.sill - 0.15);
      piece(s0, s1, o.top, y1);
    }
    cursor = s1;
  }
  piece(cursor, length, y0, y1);
  sec.decor.push({ kind: 'run', a, b, thick, y0, y1, style, openings, ...extra });
}

/** A straight flight up in direction `dir` (E W N S) from the foot's middle `foot` = [x, z]. */
function dnFlight(sec, { foot, dir, steps, tread = 0.34, width, from, rise, style = 'stone', id, bottom }) {
  const [dx, dz, yaw] = DIRS[dir];
  const length = steps * tread;
  const at = [foot[0] + (dx * length) / 2, foot[1] + (dz * length) / 2];
  const solid = { ...stairsOf(at, [length, width], steps, from, rise, { yaw, bottom, id }), style };
  sec.terrain.push(solid);
  const flight = {
    dir, dx, dz, yaw, length, width, steps, tread, from, rise, foot, solid, top: from + steps * rise, end: [foot[0] + dx * length, foot[1] + dz * length],
    /** The top of tread k (0-based). */
    treadY: (k) => from + (k + 1) * rise,
    /** The middle of tread k, `side` m to the left of the way up (+ is toward p = (-dz, dx)). */
    treadAt: (k, side = 0) => [foot[0] + dx * (k + 0.5) * tread - dz * side, foot[1] + dz * (k + 0.5) * tread + dx * side],
    /** The point `s` m along the flight, `side` across. */
    along: (s, side = 0) => [foot[0] + dx * s - dz * side, foot[1] + dz * s + dx * side],
  };
  return flight;
}

/** Walls along both sides of a flight (retaining or tunnel walls), in pieces of `every` steps. */
function dnFlightWalls(sec, flight, { thick = 1.6, head = 4.4, every = 2, style = 'ashlar', sides = [1, -1] } = {}) {
  const { dx, dz, yaw, tread, width, steps } = flight;
  for (let i = 0; i < steps; i += every) {
    const last = Math.min(steps, i + every) - 1;
    const s0 = i * tread;
    const s1 = (last + 1) * tread;
    const lo = flight.treadY(i) - 0.6;
    const hi = flight.treadY(last) + head;
    for (const side of sides) {
      const offset = (width / 2 + thick / 2) * side;
      const centre = [flight.foot[0] + dx * (s0 + s1) / 2 - dz * offset, flight.foot[1] + dz * (s0 + s1) / 2 + dx * offset];
      sec.terrain.push({ ...wallOf(centre, [s1 - s0 + 0.02, thick], lo, hi, { yaw }), style });
    }
  }
}

/** Stepped ceilings over a flight, and the sloped barrel vault drawn under them. `from`/`to` limit it to steps [from, to). */
function dnFlightVault(sec, flight, { head = 3.8, every = 2, first = 0, last = flight.steps, style = 'vault', crown = 0.9, roof = 0.7 } = {}) {
  const { dx, dz, yaw, tread, width } = flight;
  for (let i = first; i < last; i += every) {
    const end = Math.min(last, i + every) - 1;
    const s0 = i * tread;
    const s1 = (end + 1) * tread;
    const mid = flight.along((s0 + s1) / 2);
    const bottom = flight.treadY(end) + head;
    sec.terrain.push({ ...ceilingOf(mid, [s1 - s0 + 0.02, width], bottom, { yaw, top: bottom + roof }), style, skin: false });
  }
  const spring = (s) => flight.from + head + flight.rise * (s / tread) + 2 * flight.rise;
  const s0 = first * tread;
  const s1 = last * tread;
  const a = flight.along(s0);
  const b = flight.along(s1);
  sec.decor.push({ kind: 'vault', a: [a[0], a[1], spring(s0)], b: [b[0], b[1], spring(s1)], width, crown: width / 2 * (0.6 + crown * 0.4), style });
}

/** Fence posts and rails along points [x, z, y]: the physics wall (a rail that blocks) and its drawing. */
function dnFence(sec, points, { style = 'fence', height = 1.15, gaps = [], every = 3 } = {}) {
  for (let i = 0; i + 1 < points.length; i += 1) {
    const [x0, z0, y0] = points[i];
    const [x1, z1, y1] = points[i + 1];
    const length = Math.hypot(x1 - x0, z1 - z0);
    const count = Math.max(1, Math.ceil(length / every));
    for (let k = 0; k < count; k += 1) {
      const t0 = k / count;
      const t1 = (k + 1) / count;
      const a = [x0 + (x1 - x0) * t0, z0 + (z1 - z0) * t0];
      const b = [x0 + (x1 - x0) * t1, z0 + (z1 - z0) * t1];
      const ya = y0 + (y1 - y0) * t0;
      const yb = y0 + (y1 - y0) * t1;
      const lo = Math.min(ya, yb) - 0.6;
      const hi = Math.max(ya, yb) + height;
      sec.terrain.push({ ...wallLine(a, b, 0.3, lo, hi), style, skin: false });
    }
  }
  sec.decor.push({ kind: 'fence', points, style, height, gaps });
}

/** A gate or door: `closed` solids block; `open` ones (usually none) stand when it is open. `look` is how the kit draws and animates it. `at` is the point it is worked from (levelmode/interact.js); opts: opensFrom (a region), key (an item id), frees (spawn ids), label, lockedText. */
function dnGate(sec, id, at, closed, look, opts = {}) {
  const { opensFrom, key, frees, label, lockedText } = opts;
  sec.gates.push({ id, at, state: opts.state ?? 'closed', states: { closed, open: opts.open ?? [] }, look, ...(opensFrom ? { opensFrom } : {}), ...(key ? { key } : {}), ...(frees ? { frees } : {}), ...(label ? { label } : {}), ...(lockedText ? { lockedText } : {}) });
}

/** A spawn. */
function dnSpawn(sec, id, preset, role, tier, post, facing, extra = {}) {
  sec.spawns.push({ id, preset, role, tier, post, facing, ...extra });
}

const dnItem = (sec, id, kind, at, extra = {}) => sec.items.push({ id, kind, at, ...extra });
const dnProp = (sec, what, at, extra = {}) => sec.decor.push({ kind: 'prop', what, at, ...extra });
const dnBounds = (sec, ...regions) => sec.bounds.push(...regions);
const dnLerp = (x0, x1, y0, y1) => (x) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);

// ---- 1. The Cliff Path ----------------------------------------------------------------------

// Three fenced legs down the mainland slope (east, west, east), each 4.4 wide, a landing at each turn, then a
// stair south into the gorge: a shelf of black rock at y 0 with the sea 9 m below its edges.
const DN_L1 = dnLerp(-104, -62, Y.start, Y.pathA);
const DN_L2 = dnLerp(-62.5, -100.5, Y.pathA, Y.pathB);
const DN_L3 = dnLerp(-100.5, -62.5, Y.pathB, Y.pathC);

function buildCliff() {
  const sec = dnSection('cliff', 'The Cliff Path');
  dnBounds(sec, { at: [-88, 14], size: [76, 56] }, { at: [-36, 47], size: [60, 22] });
  // The mainland, where the way begins: a plateau, then L1.
  dnSlab(sec, -126, -104, -10, 2, Y.start, 'grass', { extra: { land: true } });
  sec.terrain.push({ ...rampOf([-83, -4], [42, 4.4], Y.start, Y.pathA, { id: 'leg1' }), style: 'path' });
  dnSlab(sec, -62.5, -53.5, -6.2, 10.2, Y.pathA, 'path', { extra: { land: true } });
  sec.terrain.push({ ...rampOf([-81.5, 8], [38, 4.4], Y.pathA, Y.pathB, { yaw: Math.PI, id: 'leg2' }), style: 'path' });
  dnSlab(sec, -108.5, -99.5, 5.8, 22.2, Y.pathB, 'path', { extra: { land: true } });
  sec.terrain.push({ ...rampOf([-81.5, 20], [38, 4.4], Y.pathB, Y.pathC, { id: 'leg3' }), style: 'path' });
  dnSlab(sec, -62.5, -53.5, 17.8, 30.8, Y.pathC, 'path', { extra: { land: true } });
  // The stair down to the gorge: 19 treads of 0.2 (3.8 m).
  const down = dnFlight(sec, { foot: [-58, 38.4], dir: 'N', steps: 19, tread: 0.4, width: 4.4, from: Y.gorge, rise: 0.2, style: 'cobble' });
  // The gorge shelf: black rock, a cliff to the sea on its south and west; a low rock face on the north.
  dnSlab(sec, -64, -6.8, 38, 56, Y.gorge, 'rock', { extra: { land: true } });
  dnBox(sec, -64, -60.4, 36.6, 38.4, Y.gorge - 0.5, 3.2, 'rock');
  dnBox(sec, -55.6, -6.8, 36.6, 38.4, Y.gorge - 0.5, 3.2, 'rock');

  // Fences: every leg on both sides, the landings round their outer edges; the stair on both sides.
  const rail = (points, opts) => dnFence(sec, points, opts);
  rail([[-126, 2.1, 14], [-126, -10.1, 14]]);
  rail([[-104, -10.1, 14], [-104, -6.4, 14]]);
  rail([[-104, 2.1, 14], [-104, -1.6, 14]]);
  rail([[-126, -10.1, 14], [-103.9, -10.1, 14]]);
  rail([[-126, 2.1, 14], [-103.9, 2.1, 14]]);
  rail([[-104, -6.4, DN_L1(-104)], [-62.5, -6.4, DN_L1(-62.5)], [-53.3, -6.4, Y.pathA], [-53.3, 10.4, Y.pathA], [-62.5, 10.4, Y.pathA]]);
  rail([[-104, -1.6, DN_L1(-104)], [-62.5, -1.6, DN_L1(-62.5)], [-62.5, 5.6, Y.pathA]]);
  rail([[-62.5, 5.6, Y.pathA], [-100.5, 5.6, DN_L2(-100.5)]]);
  rail([[-62.5, 10.4, Y.pathA], [-99.4, 10.4, Y.pathB]]);
  rail([[-100.5, 5.6, DN_L2(-100.5)], [-108.6, 5.6, Y.pathB], [-108.6, 22.3, Y.pathB], [-100.5, 22.3, Y.pathB]]);
  rail([[-99.4, 10.4, Y.pathB], [-99.4, 17.7, Y.pathB]]);
  rail([[-99.4, 17.7, Y.pathB], [-62.5, 17.7, DN_L3(-62.5)], [-53.3, 17.7, Y.pathC], [-53.3, 30.9, Y.pathC]]);
  rail([[-100.5, 22.3, Y.pathB], [-62.6, 22.3, DN_L3(-62.6)], [-62.6, 30.9, Y.pathC], [-60.5, 30.9, Y.pathC]]);
  rail([[-55.5, 30.9, Y.pathC], [-53.3, 30.9, Y.pathC]]);
  rail([[-60.5, 30.9, Y.pathC], [-60.5, 38.4, Y.gorge]]);
  rail([[-55.5, 30.9, Y.pathC], [-55.5, 38.4, Y.gorge]]);

  // Rest 1: the brazier in the gorge, out of the wind under the rock face.
  sec.rest = { id: 'rest1', name: 'The Gorge Brazier', at: [-44, Y.gorge, 41.5] };
  dnProp(sec, 'brazier', [-44, Y.gorge, 40.4], { lit: true, rest: true });
  dnProp(sec, 'brazier', [-14, Y.gorge, 43], { lit: true });
  // The way on: the corridor to the gatehouse is a portal while he is in it.
  sec.portals.push({ to: 'gate', area: { at: [-17, 47], size: [20, 18] } });

  // Story props: a rotting trebuchet and a ram on the mainland, dropped weapons, ravens, wreckage.
  dnProp(sec, 'trebuchet', [-117, 14, 14], { yaw: 0.3, scale: 1.2 });
  dnProp(sec, 'ram', [-95, DN_L1(-95) , -8.4], { yaw: 0.1 });
  dnProp(sec, 'weapon', [-98, DN_L1(-98), -3], { what2: 'spear', yaw: 1.1 });
  dnProp(sec, 'weapon', [-91, DN_L1(-91), -4.2], { what2: 'sword', yaw: 2.4 });
  dnProp(sec, 'weapon', [-72, DN_L2(-72), 7.2], { what2: 'halberd', yaw: 0.4 });
  dnProp(sec, 'weapon', [-85, DN_L3(-85), 21], { what2: 'shield', yaw: 0.7 });
  dnProp(sec, 'weapon', [-30, Y.gorge, 49], { what2: 'sword', yaw: 3.7 });
  dnProp(sec, 'barrel', [-109, 14, -6.5], { yaw: 0.3 });
  dnProp(sec, 'barrel', [-108.2, 14, -8], { yaw: 1.3, tipped: true });
  dnProp(sec, 'cart', [-122, 14, -2], { yaw: -0.5, broken: true });
  dnProp(sec, 'raven', [-120.1, 15.15, -10.1], { yaw: 0.5 });
  dnProp(sec, 'raven', [-62.6, DN_L2(-62.6) + 1.15, 10.4], { yaw: 2.6 });
  dnProp(sec, 'raven', [-60.4, 1.2, 36.6], { yaw: 4.2 });
  dnProp(sec, 'raven', [-36, 3.3, 37.6], { yaw: 3 });
  dnProp(sec, 'raven', [-66, Y.gorge, 55.6], { yaw: 1.5 });
  dnProp(sec, 'bones', [-22, Y.gorge, 52], { yaw: 0.6 });
  dnProp(sec, 'banner', [-110, 14, -9.8], { yaw: 0, torn: true });

  // Men: pairs of levy on the legs, one more pair in the gorge.
  const post = (x, y, z) => [x, y, z];
  dnSpawn(sec, 'levy1', 'dunnottarSoldier', 'enemy', 1, post(-84, DN_L1(-84), -4.9), DN_FACE.W, { inputs: { name: 'Hob' } });
  dnSpawn(sec, 'levy2', 'dunnottarSoldier', 'enemy', 1, post(-81, DN_L1(-81), -3.3), DN_FACE.W, { inputs: { name: 'Wat' } });
  dnSpawn(sec, 'levy3', 'dunnottarSoldier', 'enemy', 1, post(-74, DN_L2(-74), 7.1), DN_FACE.E, { inputs: { name: 'Davie' } });
  dnSpawn(sec, 'levy4', 'dunnottarSoldier', 'enemy', 1, post(-71, DN_L2(-71), 9), DN_FACE.E, { inputs: { name: 'Tam' } });
  dnSpawn(sec, 'levy5', 'dunnottarSoldier', 'enemy', 1, post(-86, DN_L3(-86), 21.2), DN_FACE.W, { inputs: { name: 'Rab' } });
  dnSpawn(sec, 'levy6', 'dunnottarSoldier', 'enemy', 1, post(-83, DN_L3(-83), 18.9), DN_FACE.W, { inputs: { name: 'Geordie' } });
  dnSpawn(sec, 'levy7', 'dunnottarSoldier', 'enemy', 1, post(-24, Y.gorge, 45), DN_FACE.W, { inputs: { name: 'Sandy' }, patrol: [[-24, 45], [-34, 43]] });
  dnSpawn(sec, 'levy8', 'dunnottarSoldier', 'enemy', 1, post(-22, Y.gorge, 49.4), DN_FACE.W, { inputs: { name: 'Jock' } });

  // Things to find.
  dnItem(sec, 'bandage1', 'bandage', [-96, DN_L1(-96), -4.4]);
  dnItem(sec, 'bandage2', 'bandage', [-65, DN_L3(-65), 20.4]);
  dnItem(sec, 'tonic1', 'tonic', [-50, Y.gorge, 44]);
  return sec;
}

// ---- 2. The Gatehouse and the Oillets -----------------------------------------------------------

function buildGate() {
  const sec = dnSection('gate', 'The Gatehouse and the Oillets');
  dnBounds(sec, { at: [11, 48], size: [38, 20] });
  const A = Y.landing;
  // The ledge round the foot of the wall: the way in for a man who finds the great gate barred.
  dnSlab(sec, -6.8, 6.2, 52.4, 55.8, Y.gorge, 'rock', { extra: { land: true } });
  dnBox(sec, 6.2, 8.0, 51.4, 56.6, Y.gorge - 1, 5, 'rock');
  // The guard hall (and the nook at its north-west corner, between the gorge's rock face and the wall, filled in).
  dnBox(sec, -6.8, -5.2, 38, 39.6, Y.gorge - 1, 5.8, 'ashlar');
  dnSlab(sec, -6.8, 6.8, 39.6, 52.8, Y.gorge, 'flags', { extra: { room: true } });
  dnRun(sec, [-6, 39.6], [-6, 52.8], 1.6, Y.gorge - 1, 5.8, 'ashlar', [{ at: 6.6, width: 3.2, sill: Y.gorge, top: 3.9, shape: 'round' }], { face: 'gate' });
  dnRun(sec, [-6.8, 40.4], [6.8, 40.4], 1.6, Y.gorge - 1, 5.8, 'ashlar', [{ at: 6, width: 0.5, sill: 2.9, top: 4.4, shape: 'slit', solid: true }, { at: 10.5, width: 0.5, sill: 2.9, top: 4.4, shape: 'slit', solid: true }]);
  dnRun(sec, [-6.8, 52], [6.8, 52], 1.6, Y.gorge - 1, 5.8, 'ashlar', [{ at: 9, width: 2.4, sill: Y.gorge, top: 3.4, shape: 'round' }, { at: 3, width: 0.5, sill: 2.9, top: 4.4, shape: 'slit', solid: true }], { face: 'postern' });
  dnRun(sec, [6, 41.2], [6, 51.2], 1.6, Y.gorge - 1, 5.8, 'ashlar', [{ at: 5, width: 5.4, sill: Y.gorge, top: 4.6, shape: 'round' }]);
  dnCeiling(sec, -5.2, 5.2, 41.2, 51.2, 4.8, 5.8);
  sec.decor.push({ kind: 'vault', a: [-5.2, 46.2, 4.8], b: [5.2, 46.2, 4.8], width: 10, crown: 2.6, style: 'vault' });
  // The great gate: barred from within. A lever on the inside throws the bar (Shortcut 1).
  dnGate(sec, 'cliffgate', [-4.4, Y.gorge, 46.2], [{ ...wallOf([-6, 46.2], [0.4, 3.2], Y.gorge, 3.9, { id: 'cliffgate' }), style: 'iron', skin: false }], { kind: 'door', width: 3.2, height: 3.9, hinge: 'z-', leaf: 'oak' }, { opensFrom: { at: [-1.4, 46.2], size: [7.6, 9.6] }, label: 'Throw the bar' });
  // Barrels, a table, a keg with something scratched on it.
  dnProp(sec, 'barrel', [-4.2, Y.gorge, 42.2], { yaw: 0.4 });
  dnProp(sec, 'barrel', [-3.1, Y.gorge, 41.9], { yaw: 1.4 });
  dnProp(sec, 'powderkeg', [3.6, Y.gorge, 42.2], { yaw: 0.2 });
  dnProp(sec, 'table', [0.5, Y.gorge, 49.2], { yaw: 0.1 });
  dnProp(sec, 'crate', [-3.8, Y.gorge, 49.6], { yaw: 0.2 });
  dnProp(sec, 'torch', [-5.2, 3, 42.4], { face: 'E' });
  dnProp(sec, 'torch', [5, 3, 50.4], { face: 'W' });
  dnProp(sec, 'torch', [-5.2, 3, 50.4], { face: 'E' });

  // The steep stair up: 22 treads of 0.19, under an arched tunnel.
  const stair = dnFlight(sec, { foot: [6.8, 46.2], dir: 'E', steps: 22, tread: 0.34, width: 5.4, from: Y.gorge, rise: A / 22, style: 'cobble' });
  dnFlightWalls(sec, stair, { thick: 2.3, head: 4.6 });
  dnFlightVault(sec, stair, { head: 3.9 });
  sec.terrain.push({ ...wallOf([13.9, 42.3], [0.8, 2.2], A - 1, A + 8, {}), style: 'ashlar', skin: false });
  // The landing before the oillet wall.
  dnSlab(sec, 14.28, 22.1, 39.6, 52.8, A, 'flags', { extra: { room: true } });
  dnRun(sec, [14.28, 40.4], [30.6, 40.4], 1.6, A - 1, A + 5.2, 'ashlar', [{ at: 3.2, width: 5.4, sill: A, top: A + 3.9, shape: 'round' }, { at: 10.3, width: 2.4, sill: A, top: A + 3.4, shape: 'round' }], { face: 'vestibule' });
  dnRun(sec, [14.28, 52], [30.6, 52], 1.6, A - 1, A + 5.2, 'ashlar');
  dnCeiling(sec, 14.3, 20.5, 41.2, 51.2, A + 4.4, A + 5.2);
  sec.decor.push({ kind: 'vault', a: [14.3, 46.2, A + 4.4], b: [20.5, 46.2, A + 4.4], width: 10, crown: 2.2, style: 'vault' });
  // The oillet wall: four round loops at a man's chest and eye (a gap of 0.5 m, the physics sees through it), a wall above and below.
  const wallTop = A + 5.2;
  const holes = [43.2, 45.2, 47.2, 49.2];
  const piers = [[41.2, 43.0], [43.4, 45.0], [45.4, 47.0], [47.4, 49.0], [49.4, 51.2]];
  dnBox(sec, 20.5, 22.1, 41.2, 51.2, A - 1, A + 1.1, 'ashlar', { skin: false });
  dnBox(sec, 20.5, 22.1, 41.2, 51.2, A + 1.6, wallTop, 'ashlar', { skin: false });
  for (const [z0, z1] of piers) dnBox(sec, 20.5, 22.1, z0, z1, A + 1.1, A + 1.6, 'ashlar', { skin: false });
  sec.decor.push({ kind: 'run', a: [21.3, 41.2], b: [21.3, 51.2], thick: 1.6, y0: A - 1, y1: wallTop, style: 'ashlar', openings: holes.map((z) => ({ at: z - 41.2, width: 0.44, sill: A + 1.1, top: A + 1.6, shape: 'oillet' })), face: 'oillets' });
  // The gun gallery behind the wall, with a door out into the vestibule.
  dnSlab(sec, 22.1, 30.6, 39.6, 52.8, A, 'boards', { extra: { room: true } });
  dnRun(sec, [30, 41.2], [30, 51.2], 1.6, A - 1, A + 5.2, 'ashlar');
  dnCeiling(sec, 22.1, 29.2, 41.2, 51.2, A + 3.6, A + 5.2);
  sec.decor.push({ kind: 'vault', a: [22.1, 46.2, A + 3.6], b: [29.2, 46.2, A + 3.6], width: 10, crown: 1.8, style: 'vault' });
  dnProp(sec, 'table', [27.8, A, 44.5], { yaw: 1.5 });
  dnProp(sec, 'powderkeg', [28.4, A, 49.6], { yaw: 0.7 });
  dnProp(sec, 'crate', [28.6, A, 42.2], { yaw: 0.2 });
  dnProp(sec, 'gunrest', [22.9, A, 49.2], { yaw: Math.PI });
  dnProp(sec, 'torch', [27.6, A + 2.6, 41.4], { face: 'S' });
  dnProp(sec, 'torch', [16.5, A + 2.8, 50.5], { face: 'N' });
  dnProp(sec, 'torch', [17.5, A + 2.8, 41.5], { face: 'S' });

  // The way on: up through the landing's north door; and back down.
  sec.portals.push({ to: 'cliff', area: { at: [-3, 47], size: [10, 18] } });
  sec.portals.push({ to: 'ascent', area: { at: [17.5, 45], size: [8, 14] } });

  // Men: a guard in the hall, one at the stair head, and the gunners behind the loops.
  dnSpawn(sec, 'hallguard', 'dunnottarGuard', 'enemy', 2, [-1.5, Y.gorge, 44.2], DN_FACE.S, { inputs: { name: 'Corporal Rae' } });
  dnSpawn(sec, 'headguard', 'dunnottarSoldier', 'enemy', 1, [17.6, A, 49], DN_FACE.W, { inputs: { name: 'Fergus' } });
  dnSpawn(sec, 'gunner1', 'dunnottarMatchlock', 'enemy', 2, [23.4, A, 43.2], DN_FACE.W, { inputs: { name: 'Gunner Mackie' }, station: 'oillet', hole: 0 });
  dnSpawn(sec, 'bowman1', 'dunnottarCrossbow', 'enemy', 2, [23.4, A, 45.2], DN_FACE.W, { inputs: { name: 'Crossbow Dunn' }, station: 'oillet', hole: 1 });
  dnSpawn(sec, 'gunner2', 'dunnottarMatchlock', 'enemy', 2, [23.4, A, 47.2], DN_FACE.W, { inputs: { name: 'Gunner Orr' }, station: 'oillet', hole: 2 });

  dnItem(sec, 'note-powder', 'note', [3.6, Y.gorge, 42.9], { note: 'powder', lift: 0.9 });
  dnItem(sec, 'bandage3', 'bandage', [-4.4, Y.gorge, 50.6]);
  return sec;
}

// ---- 3. The Tunnelled Ascent --------------------------------------------------------------------

// From the gatehouse landing: a vestibule, a first flight (4 m) up to a guard room, a second (4 m) up to the quadrangle's
// south wall. The corridor is the hand-over: the quadrangle's men wake at its head, out of sight.
function buildAscent() {
  const sec = dnSection('ascent', 'The Tunnelled Ascent');
  dnBounds(sec, { at: [19, 23.5], size: [20, 36] });
  const A = Y.landing;
  const B = Y.guardroom;
  const Q = Y.quad;
  // The vestibule: the landing's north door opens into it; the gunners' door too.
  dnSlab(sec, 12.9, 27.4, 31.8, 41.2, A, 'flags', { extra: { room: true } });
  dnBox(sec, 12.9, 14.5, 31.8, 40.4, A - 1, A + 6, 'ashlar');
  dnBox(sec, 25.8, 27.4, 31.8, 40.4, A - 1, A + 6, 'ashlar');
  sec.terrain.push({ ...ceilingOf([20.15, 36.5], [12.5, 8.6], A + 4.4, { top: A + 6 }), style: 'vault', skin: false });
  sec.decor.push({ kind: 'vault', a: [12.9, 36.5, A + 4.4], b: [27.4, 36.5, A + 4.4], width: 9.4, crown: 2.2, style: 'vault' });
  // Flight A north: 20 treads of 0.2.
  const a = dnFlight(sec, { foot: [17.7, 33.4], dir: 'N', steps: 20, tread: 0.4, width: 5.4, from: A, rise: (B - A) / 20, style: 'cobble' });
  // The long side wall west of flight A is the vestibule's; the east one runs on.
  dnFlightWalls(sec, a, { thick: 2.3, head: 4.6 });
  dnFlightVault(sec, a, { head: 3.9 });
  dnBox(sec, 20.4, 25.8, 31.8, 33.4, A - 1, A + 6, 'ashlar');
  // The guard room.
  dnSlab(sec, 9.4, 26.1, 14.8, 25.4, B, 'flags', { extra: { room: true } });
  dnRun(sec, [10.2, 25.4], [10.2, 14.8], 1.6, B - 1, B + 6.4, 'ashlar', [{ at: 4.2, width: 0.5, sill: B + 2.4, top: B + 3.6, shape: 'slit', solid: true }]);
  dnRun(sec, [25.3, 25.4], [25.3, 14.8], 1.6, B - 1, B + 6.4, 'ashlar', [{ at: 5.2, width: 0.5, sill: B + 2.4, top: B + 3.6, shape: 'slit', solid: true }]);
  dnBox(sec, 10.2 - 0.8, 14.9, 25.4, 27, B - 1, B + 6.4, 'ashlar', { skin: false });
  dnBox(sec, 20.5, 26.1, 25.4, 27, B - 1, B + 6.4, 'ashlar', { skin: false });
  dnBox(sec, 9.4, 14.2, 14.8, 16.0, B - 1, B + 6.4, 'ashlar', { skin: false });
  dnBox(sec, 20.2, 26.1, 14.8, 16.0, B - 1, B + 6.4, 'ashlar', { skin: false });
  sec.terrain.push({ ...ceilingOf([17.75, 20.1], [16.6, 10.6], B + 4.4, { top: B + 6.4 }), style: 'vault', skin: false });
  sec.decor.push({ kind: 'vault', a: [9.4, 20.1, B + 4.4], b: [26.1, 20.1, B + 4.4], width: 10.6, crown: 2.4, style: 'vault' });
  // A recess in the east wall: a table, a pallet, a sconce.
  dnProp(sec, 'table', [23.2, B, 18.2], { yaw: 0 });
  dnProp(sec, 'bench', [23.2, B, 19.4], { yaw: 0 });
  dnProp(sec, 'barrel', [11.4, B, 17.2], { yaw: 0.3 });
  dnProp(sec, 'crate', [11.4, B, 18.6], { yaw: 0.2 });
  dnProp(sec, 'brazier', [22.4, B, 24.2], { lit: true });
  dnProp(sec, 'torch', [10.9, B + 2.7, 22], { face: 'E' });
  dnProp(sec, 'torch', [24.6, B + 2.7, 16.4], { face: 'W' });
  // Flight B north: 20 treads of 0.2 to the quadrangle.
  const b = dnFlight(sec, { foot: [17, 16.0], dir: 'N', steps: 20, tread: 0.4, width: 5.4, from: B, rise: (Q - B) / 20, style: 'cobble' });
  dnFlightWalls(sec, b, { thick: 2.3, head: 4.6 });
  dnFlightVault(sec, b, { head: 3.9 });
  // The head of the stair: a short floor under the quadrangle's south wall, the arch above.
  dnSlab(sec, 14.3, 19.7, 6, 8.2, Q, 'cobble', { extra: { room: true } });
  sec.portals.push({ to: 'gate', area: { at: [17.7, 38], size: [12, 9] } });
  sec.portals.push({ to: 'quad', area: { at: [17, 10], size: [8, 9] } });

  dnSpawn(sec, 'stairguard1', 'dunnottarGuard', 'enemy', 2, [15.4, B, 21.8], DN_FACE.S, { inputs: { name: 'Sergeant Lorne' } });
  dnSpawn(sec, 'stairguard2', 'dunnottarSoldier', 'enemy', 1, [17.1, b.treadY(14), 10.8], DN_FACE.S, { inputs: { name: 'Eck' } });
  dnItem(sec, 'bandage4', 'bandage', [24.4, B, 22.4]);
  dnItem(sec, 'tonic2', 'tonic', [11.6, B, 24]);
  return sec;
}

// ---- 4. The Quadrangle ----------------------------------------------------------------------

/** A slab by extents with rectangular holes cut from it (the stairwells), as the strips that are left. */
function dnSlabHoles(sec, [x0, x1, z0, z1], holes, top, style, opts = {}) {
  const xs = [...new Set([x0, x1, ...holes.flatMap((hole) => [hole[0], hole[1]])])].sort((p, q) => p - q);
  const zs = [...new Set([z0, z1, ...holes.flatMap((hole) => [hole[2], hole[3]])])].sort((p, q) => p - q);
  const inHole = (x, z) => holes.some((hole) => x > hole[0] && x < hole[1] && z > hole[2] && z < hole[3]);
  for (let j = 0; j + 1 < zs.length; j += 1) {
    let start = null;
    for (let i = 0; i + 1 < xs.length; i += 1) {
      const solid = !inHole((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2);
      if (solid && start === null) start = xs[i];
      if (start !== null && (!solid || i + 2 === xs.length)) {
        dnSlab(sec, start, solid ? xs[i + 1] : xs[i], zs[j], zs[j + 1], top, style, opts);
        start = null;
      }
    }
  }
}

// The stair flights from the quadrangle into the vault share these numbers: 31 treads from the cellar floor (y 6) to the court.
const DN_VAULT_STEPS = 31;
const DN_VAULT_RISE = (Y.quad - Y.vault) / DN_VAULT_STEPS;
/** The treads that lie under the court's own slab (a man's head clears it): the first 11. */
const DN_COVERED = 11;

function buildQuad() {
  const sec = dnSection('quad', 'The Quadrangle');
  dnBounds(sec, { at: [22, -13.5], size: [48, 43], y: [9.8, 45] });
  const Q = Y.quad;
  // The court: grass and cobbles over the cellars (the slab is 1.6 thick), with the stairwells cut out of it.
  const open = 0.34 * (DN_VAULT_STEPS - DN_COVERED);
  const holes = [
    [3, 8.4, -4 - open, -4],
    [22, 27.4, -6.86 - open, -6.86],
    [34 + 0.34 * DN_COVERED, 44, -25.4, -19.6],
  ];
  dnSlabHoles(sec, [0, 44, -34, 7.6], holes, Q, 'grass', { bottom: Q - 1.6, extra: { land: true } });
  sec.decor.push({ kind: 'paving', y: Q, rects: [[14.3, 19.7, -4, 7.6], [12, 22, -5, 0], [26, 36, -7, 0.8], [6.2, 12, -6, -2.5], [10, 34, -4.4, -2.2]] });
  // The south wall, with the arch of the tunnel's mouth; the west wall; the east wall, with the way through to the tower (the east stair).
  dnRun(sec, [0, 6.8], [44, 6.8], 1.6, Q - 1, Q + 9, 'ashlar', [{ at: 17, width: 5.4, sill: Q, top: Q + 4.6, shape: 'round' }], { crenel: true, face: 'quadSouth' });
  dnRun(sec, [-0.8, -34], [-0.8, 7.6], 1.6, Q - 1, Q + 9, 'ruin', [{ at: 12, width: 0.5, sill: Q + 3.4, top: Q + 4.9, shape: 'slit', solid: true }, { at: 26, width: 0.5, sill: Q + 3.4, top: Q + 4.9, shape: 'slit', solid: true }, { at: 34, width: 0.5, sill: Q + 3.4, top: Q + 4.9, shape: 'slit', solid: true }]);
  dnRun(sec, [44.8, -34], [44.8, 7.6], 1.6, Q - 1, Q + 9, 'ashlar', [{ at: 11.5, width: 5.8, sill: Q - 0.4, top: Q + 4.4, shape: 'round' }]);
  // The north curtain, the foot of the wall walk: tall at the east end, lower toward the chapel (the walk steps down).
  dnBox(sec, 0, 44, -38, -34, Q - 1, Y.ladderRoom - 1.5, 'ashlar', { extra: { part: 'curtain' } });
  dnBox(sec, 36, 44, -38, -34, Q - 1, Y.walk - 1.5, 'ashlar', { extra: { part: 'curtain' } });
  // The west stair-house: a facade with an arched door at the head of the stair, the stair-house walls (the flight's) behind it.
  dnRun(sec, [1.4, -3.2], [10.0, -3.2], 1.4, Q - 1, Q + 6.2, 'ruin', [{ at: 4.3, width: 5.4, sill: Q, top: Q + 4.2, shape: 'pointed' }]);
  // The shortcut stair's head: low balustrades round the open part of the well.
  dnBox(sec, 21.7, 22, -14, -6.2, Q - 0.5, Q + 1.0, 'ashlar');
  dnBox(sec, 27.4, 27.7, -14, -6.2, Q - 0.5, Q + 1.0, 'ashlar');
  // The far ends of the open stairwells, where the court's slab runs on over the covered treads: a rim to keep a man out of the trench.
  for (const [x0, x1, z] of [[3, 8.4, -4 - open], [22, 27.4, -6.86 - open], [34 + 0.34 * DN_COVERED, 34 + 0.34 * DN_COVERED, 0]]) {
    if (x0 === x1) dnBox(sec, x0 - 0.3, x0, -25.4, -19.6, Q - 0.5, Q + 1.0, 'ashlar');
    else dnBox(sec, x0, x1, z - 0.3, z, Q - 0.5, Q + 1.0, 'ashlar');
  }
  // The old kitchen (a ruined range, roofless): north-west of the court.
  dnRun(sec, [3, -31.6], [12, -31.6], 1.2, Q - 0.5, Q + 4.4, 'ruin', [{ at: 4.5, width: 0.6, sill: Q + 2, top: Q + 3.3, shape: 'lancet', solid: true }]);
  dnRun(sec, [11.6, -31.6], [11.6, -21.8], 1.2, Q - 0.5, Q + 4.4, 'ruin', [{ at: 5.8, width: 2.6, sill: Q, top: Q + 3.2, shape: 'round' }]);
  dnRun(sec, [3.4, -31.6], [3.4, -21.8], 1.2, Q - 0.5, Q + 3.2, 'ruin', [{ at: 4.5, width: 0.6, sill: Q + 1.8, top: Q + 3, shape: 'lancet', solid: true }]);
  dnRun(sec, [3, -21.8], [6.2, -21.8], 1.2, Q - 0.5, Q + 2.6, 'ruin');
  dnRun(sec, [9.2, -21.8], [12, -21.8], 1.2, Q - 0.5, Q + 3.6, 'ruin');
  // Benholm's Lodging: a ruined house on the east side with a hearth, a door to the court.
  dnRun(sec, [32.8, -2.6], [43.2, -2.6], 1.2, Q - 0.5, Q + 6, 'ruin', [{ at: 5.7, width: 2.6, sill: Q, top: Q + 3.4, shape: 'round' }, { at: 2.2, width: 0.7, sill: Q + 1.6, top: Q + 3.2, shape: 'lancet', solid: true }]);
  dnRun(sec, [32.8, -15.4], [43.2, -15.4], 1.2, Q - 0.5, Q + 6.4, 'ruin', [{ at: 4, width: 0.7, sill: Q + 1.8, top: Q + 3.4, shape: 'lancet', solid: true }, { at: 7.5, width: 0.7, sill: Q + 1.8, top: Q + 3.4, shape: 'lancet', solid: true }]);
  dnRun(sec, [33.4, -15.4], [33.4, -2.6], 1.2, Q - 0.5, Q + 5.2, 'ruin', [{ at: 6.5, width: 0.9, sill: Q + 1.4, top: Q + 3.2, shape: 'lancet', solid: true }]);
  dnRun(sec, [42.6, -15.4], [42.6, -2.6], 1.2, Q - 0.5, Q + 6, 'ruin');
  dnProp(sec, 'hearth', [42.0, Q, -9], { yaw: Math.PI });
  dnProp(sec, 'table', [38.5, Q, -10.2], { yaw: 0 });
  dnProp(sec, 'bench', [38.5, Q, -11.6], { yaw: 0 });
  dnProp(sec, 'bed', [35.4, Q, -13.4], { yaw: 0 });
  dnProp(sec, 'barrel', [41.2, Q, -13.8], { yaw: 0.3 });
  dnProp(sec, 'crate', [40.2, Q, -14.2], { yaw: 0.1 });
  // The well, Rest 2 beside it, and the litter of a garrison.
  dnBox(sec, 30.2, 32.8, -5.8, -3.2, Q - 0.5, Q + 1.0, 'ashlar', { extra: { part: 'well' } });
  dnProp(sec, 'well', [31.5, Q, -4.5]);
  sec.rest = { id: 'rest2', name: 'The Well', at: [30.5, Q, -1.2] };
  dnProp(sec, 'brazier', [28.2, Q, -1.6], { lit: true, rest: true });
  dnProp(sec, 'barrel', [13.2, Q, 1.6], { yaw: 0.3 });
  dnProp(sec, 'barrel', [12.4, Q, 2.6], { yaw: 1.2 });
  dnProp(sec, 'crate', [22.4, Q, 3.8], { yaw: 0.4 });
  dnProp(sec, 'cart', [6.6, Q, 3], { yaw: 0.7 });
  dnProp(sec, 'weapon', [20.6, Q, -9], { what2: 'spear', yaw: 0.5 });
  dnProp(sec, 'weapon', [15.6, Q, -14.4], { what2: 'shield', yaw: 1.1 });
  dnProp(sec, 'bones', [24.6, Q, -26], { yaw: 0 });
  dnProp(sec, 'raven', [43.2, Q + 6.5, -15.4], { yaw: 3 });
  dnProp(sec, 'raven', [3.4, Q + 3.3, -31.6], { yaw: 1 });
  dnProp(sec, 'raven', [31.5, Q + 1.0, -4.5], { yaw: 4, size: 0.9 });
  dnProp(sec, 'siegeram', [7, Q, -27], { yaw: 0.4 });
  dnProp(sec, 'torch', [16.2, Q + 3, 6.2], { face: 'S' });
  dnProp(sec, 'torch', [19.4, Q + 3, 6.2], { face: 'S' });
  // Portals: the tunnel; down into the vault by any of its stairs; up to the walls by the ladder.
  sec.portals.push({ to: 'ascent', area: { at: [17, 0.5], size: [12, 14] } });
  sec.portals.push({ to: 'vault', area: [{ at: [5.7, -9], size: [13, 22] }, { at: [24.7, -11], size: [11, 18] }, { at: [40, -21], size: [12, 12] }] });
  sec.portals.push({ to: 'tower', area: { at: [14.3, -31], size: [5, 8] } });

  // Men: patrols, a guard at the Lodging; the servants at the well; a priest; ladies of another age, sheltering in the ruin.
  dnSpawn(sec, 'patrol1', 'dunnottarSoldier', 'enemy', 1, [13, Q, -5], DN_FACE.N, { inputs: { name: 'Lachie' }, patrol: [[13, -5], [13, -17], [20, -17], [20, -5]] });
  dnSpawn(sec, 'patrol2', 'dunnottarSoldier', 'enemy', 1, [24, Q, -26], DN_FACE.E, { inputs: { name: 'Findlay' }, patrol: [[24, -26], [32, -30], [32, -22]] });
  dnSpawn(sec, 'lodgeguard', 'dunnottarGuard', 'enemy', 2, [38.5, Q, 0.2], DN_FACE.W, { inputs: { name: 'Sergeant Keith' } });
  dnSpawn(sec, 'servant1', 'dunnottarServant', 'civilian', 0, [28.4, Q, -3.6], DN_FACE.E, { inputs: { name: 'Meg' } });
  dnSpawn(sec, 'servant2', 'dunnottarServant', 'civilian', 0, [34.6, Q, -0.4], DN_FACE.W, { inputs: { name: 'Isobel' } });
  dnSpawn(sec, 'priest', 'dunnottarPriest', 'civilian', 0, [38, Q, -8], DN_FACE.S, { inputs: { name: 'Father Anselm' } });
  dnSpawn(sec, 'lady1', 'dunnottarServant', 'civilian', 0, [6.6, Q, -27.6], DN_FACE.E, { inputs: { name: 'Miss Charlotte', outfit: { kind: 'victorianLady', design: 0 }, accessories: [], heightCm: 166 } });
  dnSpawn(sec, 'lady2', 'dunnottarServant', 'civilian', 0, [8.4, Q, -28.8], DN_FACE.E, { inputs: { name: 'Mrs Pargeter', outfit: { kind: 'victorianLady', design: 2 }, accessories: [], heightCm: 163 } });

  dnItem(sec, 'note-servant', 'note', [38.5, Q, -10.2], { note: 'servant', lift: 0.9 });
  dnItem(sec, 'tonic3', 'tonic', [28.6, Q, 0.4]);
  dnItem(sec, 'bandage5', 'bandage', [10.2, Q, -23.2]);
  return sec;
}

// ---- 5. Whigs' Vault ------------------------------------------------------------------------------

function buildVault() {
  const sec = dnSection('vault', "Whigs' Vault");
  dnBounds(sec, { at: [22, -18], size: [50, 36], y: [3, 11.5] });
  const V = Y.vault;
  const rise = DN_VAULT_RISE;
  const wallTop = V + 4.6;
  // The long cellar: 33 m by 7, a segmental barrel vault on cross arches, the floor flagged and wet.
  dnSlab(sec, -1.6, 34, -27.6, -17.4, V, 'flags', { extra: { room: true } });
  dnRun(sec, [-0.8, -27.6], [-0.8, -17.4], 1.6, V - 1, wallTop, 'rubble');
  dnRun(sec, [-1.6, -18.2], [33.4, -18.2], 1.6, V - 1, wallTop, 'rubble', [{ at: 7.3, width: 5.4, sill: V, top: V + 3.6, shape: 'round' }, { at: 26.3, width: 5.4, sill: V, top: V + 3.6, shape: 'round' }]);
  dnRun(sec, [-1.6, -26.8], [33.4, -26.8], 1.6, V - 1, wallTop, 'rubble', [{ at: 18.3, width: 2.8, sill: V, top: V + 3.4, shape: 'round' }, { at: 6, width: 1.4, sill: V + 1.6, top: V + 3.2, shape: 'lancet', solid: true }, { at: 28, width: 1.4, sill: V + 1.6, top: V + 3.2, shape: 'lancet', solid: true }]);
  dnRun(sec, [33.4, -27.6], [33.4, -17.4], 1.2, V - 1, wallTop, 'rubble', [{ at: 5.1, width: 5.8, sill: V, top: V + 3.8, shape: 'round' }]);
  dnCeiling(sec, 0, 32.8, -26, -19, V + 3.3, V + 4.8);
  sec.decor.push({ kind: 'vault', a: [0, -22.5, V + 3.0], b: [32.8, -22.5, V + 3.0], width: 7, crown: 1.4, ribs: 4.1, style: 'vault' });
  // The west stair down from the court: 31 treads, the first 11 under the court's own slab.
  const west = dnFlight(sec, { foot: [5.7, -14.6], dir: 'S', steps: DN_VAULT_STEPS, tread: 0.34, width: 5.4, from: V, rise, style: 'cobble' });
  dnFlightWalls(sec, west, { thick: 1.6, head: 4.4, every: 3 });
  dnFlightVault(sec, west, { head: 3.9, last: DN_COVERED + 1, roof: 0.5 });
  dnSlab(sec, 1.4, 10, -19, -14.6, V, 'flags', { extra: { room: true } });
  dnBox(sec, 1.4, 3, -19, -14.6, V - 1, V + 4.4, 'rubble');
  dnBox(sec, 8.4, 10, -19, -14.6, V - 1, V + 4.4, 'rubble');
  dnCeiling(sec, 3, 8.4, -19, -14.6, V + 3.6, V + 4.4);
  // The shortcut stair up to the court by the well (Shortcut 3): behind an iron gate at its foot.
  const gate = dnFlight(sec, { foot: [24.7, -17.4], dir: 'S', steps: DN_VAULT_STEPS, tread: 0.34, width: 5.4, from: V, rise, style: 'cobble' });
  dnFlightWalls(sec, gate, { thick: 1.6, head: 4.4, every: 3 });
  dnFlightVault(sec, gate, { head: 3.9, last: DN_COVERED + 1, roof: 0.5 });
  dnGate(sec, 'irongate', [24.7, V, -19.6], [{ ...wallOf([24.7, -17.9], [5.4, 0.3], V, V + 3.6, { id: 'irongate' }), style: 'iron', skin: false }], { kind: 'bars', width: 5.4, height: 3.6 }, { opensFrom: { at: [24.7, -22.5], size: [8, 7], y: [V - 1, V + 4] }, label: 'Lift the gate bar' });
  // The east stair up to the tower house: 31 treads, the first 11 under the court.
  const east = dnFlight(sec, { foot: [34, -22.5], dir: 'E', steps: DN_VAULT_STEPS, tread: 0.34, width: 5.8, from: V, rise, style: 'cobble' });
  dnFlightWalls(sec, east, { thick: 1.6, head: 4.4, every: 3 });
  dnFlightVault(sec, east, { head: 3.9, last: DN_COVERED + 1, roof: 0.5 });
  // The dungeon: a hall north of the cellar with its door barred (the turnkey's key), cells in it.
  dnSlab(sec, 9.6, 23.4, -36, -26, V, 'flags', { extra: { room: true } });
  dnRun(sec, [10.8, -35.2], [10.8, -26.8], 1.6, V - 1, wallTop, 'rubble');
  dnRun(sec, [22.6, -35.2], [22.6, -26.8], 1.6, V - 1, wallTop, 'rubble');
  dnRun(sec, [10, -35.2], [23.4, -35.2], 1.6, V - 1, wallTop, 'rubble', [{ at: 6.7, width: 1.2, sill: V + 2.2, top: V + 3.4, shape: 'slit', solid: true }]);
  dnCeiling(sec, 11.6, 21.8, -34.4, -26.8, V + 3.3, V + 4.8);
  sec.decor.push({ kind: 'vault', a: [11.6, -30.6, V + 3.0], b: [21.8, -30.6, V + 3.0], width: 7.6, crown: 1.4, style: 'vault' });
  dnGate(sec, 'celldoor', [16.7, V, -25.4], [{ ...wallOf([16.7, -26.8], [2.8, 0.3], V, V + 3.4, { id: 'celldoor' }), style: 'iron', skin: false }], { kind: 'bars', width: 2.8, height: 3.4 }, { key: 'cellkey', frees: ['miner', 'captive'], label: 'Unlock the cell', lockedText: 'Locked. The turnkey keeps the key at his desk.' });
  sec.decor.push({ kind: 'bars', a: [11.6, -31.8], b: [14.8, -31.8], y0: V, y1: V + 3.2 });
  sec.decor.push({ kind: 'bars', a: [18.6, -31.8], b: [21.8, -31.8], y0: V, y1: V + 3.2 });
  // The turnkey's end: a desk, a peg of keys, a brazier.
  dnProp(sec, 'table', [30.0, V, -25.2], { yaw: 0 });
  dnProp(sec, 'stool', [29.6, V, -24.2], { yaw: 0 });
  dnProp(sec, 'brazier', [31.8, V, -19.8], { lit: true });
  dnProp(sec, 'keys', [31.6, V + 1.2, -26.4], {});
  dnProp(sec, 'barrel', [1.4, V, -25.6], { yaw: 0.3 });
  dnProp(sec, 'barrel', [2.6, V, -25.8], { yaw: 1.3 });
  dnProp(sec, 'crate', [12.6, V, -25.4], { yaw: 0.2 });
  // Skeletons: shackled to the walls, heaped in the corners.
  for (const [x, z, yaw] of [[3.2, -26.2, 0], [8.6, -26.2, 0.1], [13.4, -19.2, Math.PI], [20.6, -19.2, Math.PI], [27.8, -26.2, 0], [15.2, -33.8, 0], [19, -33.8, 0]]) dnProp(sec, 'skeleton', [x, V, z], { yaw, chained: true });
  dnProp(sec, 'bones', [9.8, V, -21.4], { yaw: 1 });
  dnProp(sec, 'bones', [22.4, V, -24.4], { yaw: 2 });
  dnProp(sec, 'bones', [14.6, V, -30], { yaw: 0.4 });
  dnProp(sec, 'chains', [16.8, V + 2.2, -35.1], {});
  dnProp(sec, 'straw', [13, V, -33], {});
  dnProp(sec, 'straw', [20.4, V, -33], {});
  dnProp(sec, 'torch', [6.1, V + 2.4, -26], { face: 'S' });
  dnProp(sec, 'torch', [25, V + 2.4, -26], { face: 'S' });
  dnProp(sec, 'torch', [16.6, V + 2.4, -27.2], { face: 'N' });
  dnProp(sec, 'grating', [11, V + 4.5, -22.5], { size: [1.6, 1.6] });
  dnProp(sec, 'grating', [27.4, V + 4.5, -22.5], { size: [1.6, 1.6] });
  dnProp(sec, 'drip', [7.4, V + 4.1, -24], {});
  dnProp(sec, 'drip', [18.6, V + 4.1, -21], {});
  dnProp(sec, 'drip', [29.4, V + 4.1, -23.4], {});
  dnProp(sec, 'puddle', [9, V, -22.4], { radius: 1.1 });
  dnProp(sec, 'puddle', [20, V, -23.2], { radius: 1.4 });

  sec.portals.push({ to: 'quad', area: [{ at: [5.7, -9], size: [13, 20], y: [8.4, 12] }, { at: [24.7, -11], size: [11, 18], y: [8.4, 12] }] });
  sec.portals.push({ to: 'tower', area: { at: [41, -22.5], size: [14, 10], y: [8.4, 14.6] } });

  // Men: skeletons are scenery; the jailers and the turnkey are not. Two prisoners behind the barred door.
  dnSpawn(sec, 'jailer1', 'dunnottarGuard', 'enemy', 2, [12, V, -21.4], DN_FACE.W, { inputs: { name: 'Jailer Wyllie' }, patrol: [[12, -21.4], [12, -24.2]] });
  dnSpawn(sec, 'jailer2', 'dunnottarSoldier', 'enemy', 1, [20, V, -23.4], DN_FACE.W, { inputs: { name: 'Pate' } });
  dnSpawn(sec, 'turnkey', 'turnkey', 'enemy', 2, [30.8, V, -22.4], DN_FACE.W, { inputs: { name: 'The Turnkey' } });
  dnSpawn(sec, 'miner', 'cabyMiner', 'prisoner', 0, [14.4, V, -33.2], DN_FACE.S, { inputs: { name: 'Bran the miner' }, follows: true });
  dnSpawn(sec, 'captive', 'cabySoldier', 'prisoner', 0, [18.8, V, -33.2], DN_FACE.S, { inputs: { name: 'One-Eye Colm' }, follows: true });

  dnItem(sec, 'note-ledger', 'note', [29.6, V, -25.4], { note: 'ledger', lift: 0.95 });
  dnItem(sec, 'cellkey', 'key', [31.6, V, -26.2], { label: 'Take the cell key', lift: 1.2 });
  dnItem(sec, 'bandage6', 'bandage', [2.4, V, -20]);
  dnItem(sec, 'tonic4', 'tonic', [16.4, V, -29.4]);
  return sec;
}

// ---- 6. The Tower House and the Upper Walls -------------------------------------------------------------

// The keep (a hall on the court's level, reached from the vault), its round stair tower (85 treads of 0.15 round a newel, 12.75 m),
// the wall walk along the north cliff, a stair down to the ladder room (and the ladder), Rest 3.
const DN_TOWER = { at: [61.6, -23.8], radius: 4.0, sides: 12 };
const DN_SPIRAL = { at: DN_TOWER.at, inner: 0.5, outer: 3.2, start: Math.PI, turn: (85 * Math.PI * 2) / 26, steps: 85, from: Y.quad, rise: 0.15 };

function buildTower() {
  const sec = dnSection('tower', 'The Tower House and the Upper Walls');
  const Q = Y.quad;
  const W = Y.walk;
  const L = Y.ladderRoom;
  dnBounds(sec, { at: [54, -24], size: [22, 20], y: [Q - 3, 40] }, { at: [52, -35.5], size: [28, 9], y: [W - 4, 45] }, { at: [30, -36], size: [64, 8], y: [L - 4, 45] }, { at: [5, -36], size: [14, 9], y: [L - 4, 45] });
  // The hall of the keep (an L-plan house; the hall and the round tower are the part a man can enter).
  dnSlab(sec, 44.5, 58.4, -32.4, -15, Q, 'flags', { extra: { land: true } });
  dnRun(sec, [44.5, -31.6], [58.4, -31.6], 1.6, Q - 1, Q + 5.6, 'ashlar', [{ at: 4, width: 0.6, sill: Q + 3, top: Q + 4.6, shape: 'lancet', solid: true }, { at: 9, width: 0.6, sill: Q + 3, top: Q + 4.6, shape: 'lancet', solid: true }]);
  dnRun(sec, [44.5, -15.8], [58.4, -15.8], 1.6, Q - 1, Q + 5.6, 'ashlar', [{ at: 4, width: 0.6, sill: Q + 3, top: Q + 4.6, shape: 'lancet', solid: true }, { at: 9, width: 0.6, sill: Q + 3, top: Q + 4.6, shape: 'lancet', solid: true }]);
  dnRun(sec, [57.6, -32.4], [57.6, -15], 1.6, Q - 1, Q + 5.6, 'ashlar', [{ at: 8.6, width: 2.4, sill: Q, top: Q + 3.8, shape: 'round' }]);
  dnBox(sec, 44.5, 45.6, -32.4, -26.2, Q - 1, Q + 5.6, 'ashlar');
  dnBox(sec, 44.5, 45.6, -18.8, -15, Q - 1, Q + 5.6, 'ashlar');
  dnCeiling(sec, 45.6, 56.8, -30.8, -16.6, Q + 5, Q + 5.8);
  sec.decor.push({ kind: 'vault', a: [45.6, -23.7, Q + 3.8], b: [56.8, -23.7, Q + 3.8], width: 14.2, crown: 1.3, style: 'timber' });
  sec.decor.push({ kind: 'mass', box: [43.3, 58.4, -32.4, -15], y0: Q + 5.6, y1: W + 6.6, style: 'tower', windows: 3 });
  dnProp(sec, 'hearth', [51, Q, -30.9], { yaw: Math.PI / 2 });
  dnProp(sec, 'table', [51.4, Q, -23.6], { yaw: 0 });
  dnProp(sec, 'bench', [51.4, Q, -22.2], { yaw: 0 });
  dnProp(sec, 'bench', [51.4, Q, -25], { yaw: 0 });
  dnProp(sec, 'banner', [47, Q + 2.4, -31], { yaw: Math.PI / 2 });
  dnProp(sec, 'barrel', [55.6, Q, -29.6], { yaw: 0.4 });
  dnProp(sec, 'weaponrack', [55.8, Q, -17.6], { yaw: Math.PI });
  dnProp(sec, 'torch', [46.4, Q + 2.6, -29.4], { face: 'S' });
  dnProp(sec, 'torch', [46.4, Q + 2.6, -17], { face: 'N' });
  dnProp(sec, 'torch', [56, Q + 2.6, -20], { face: 'W' });
  // The round tower (a twelve-sided wall: a door in from the hall on the west, a door out onto the wall walk at the top on the north) and its winding stair.
  const [cx, cz] = DN_TOWER.at;
  const corner = (k) => [cx + DN_TOWER.radius * Math.cos(Math.PI / 12 + (k * Math.PI) / 6), cz + DN_TOWER.radius * Math.sin(Math.PI / 12 + (k * Math.PI) / 6)];
  dnSlab(sec, cx - 4.7, cx + 4.7, cz - 4.7, cz + 4.7, Q, 'flags', { extra: { land: true } });
  for (let k = 0; k < DN_TOWER.sides; k += 1) {
    const a = corner(k);
    const b = corner(k + 1);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const mx = (a[0] + b[0]) / 2 - cx;
    const mz = (a[1] + b[1]) / 2 - cz;
    const openings = [];
    if (mx < -3.5 && Math.abs(mz) < 0.5) openings.push({ at: length / 2, width: 1.9, sill: Q, top: Q + 3.6, shape: 'round' });
    else if (mz < -3.5 && Math.abs(mx) < 0.5) openings.push({ at: length / 2, width: 1.9, sill: W, top: W + 3.4, shape: 'round' });
    else if (k % 3 === 1) openings.push({ at: length / 2, width: 0.5, sill: Q + 4 + k * 0.9, top: Q + 5.4 + k * 0.9, shape: 'slit', solid: true });
    dnRun(sec, a, b, 1.4, Q - 1, W + 3.4, 'ashlar', openings, { round: true });
  }
  // The doorstep at the top of the stair: a floor under the door's thickness, level with the last tread.
  dnSlab(sec, cx - 1.1, cx + 1.1, cz - 4.7, cz - DN_SPIRAL.outer + 0.3, W, 'flags');
  // ...and the quarter of the tower's floor at the top beyond the door, where no tread of this turn is: a landing over the turn below.
  dnSlab(sec, cx, cx + 3.3, cz - 3.3, cz, W, 'flags', { bottom: W - 0.5 });
  dnBox(sec, cx + 0.45, cx + 3.3, cz - 0.3, cz, W - 0.4, W + 1.2, 'parapet');
  const treads = windingStairs({ ...DN_SPIRAL, id: 'spiral' }).map((tread) => ({ ...tread, bottom: tread.top - 0.55, style: 'stone' }));
  sec.terrain.push(...treads);
  sec.terrain.push({ ...wallOf([cx, cz], [1.3, 1.3], Q - 0.5, W + 3, { id: 'newel' }), style: 'newel' });
  sec.decor.push({ kind: 'spiral', ...DN_SPIRAL, rope: true });
  // The top landing, the wall walk, and its parapets.
  dnSlab(sec, 59.8, 63.4, -38, -28.3, W, 'flags', { extra: { walk: true } });
  dnSlab(sec, 44, 63.4, -38, -32.4, W, 'flags', { extra: { walk: true } });
  dnSlab(sec, 36, 44, -38, -34, W, 'flags', { bottom: W - 1.5, extra: { walk: true } });
  // The keep's north face, the walk's inner side.
  dnBox(sec, 44, 59.55, -32.9, -32.4, W - 0.4, W + 6.6, 'tower');
  const stairs = dnFlight(sec, { foot: [36 - 38 * 0.34, -36], dir: 'E', steps: 38, tread: 0.34, width: 4, from: L, rise: (W - L) / 38, style: 'cobble', bottom: L - 1.5 });
  dnSlab(sec, -2, 36 - 38 * 0.34, -38, -34, L, 'flags', { bottom: L - 1.5, extra: { walk: true } });
  // Parapets: the sea side whole (but for two breaches that let a man fall to the sea), the court side with the gaps.
  const breaches = [[50, 52.6], [8.2, 10.8]];
  const parapet = (x0, x1, z, top, bottom, gaps, thick = 0.55) => {
    let cursor = x0;
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (g0 > cursor) dnBox(sec, cursor, g0, z - thick / 2, z + thick / 2, bottom, top, 'parapet');
      cursor = g1;
    }
    if (cursor < x1) dnBox(sec, cursor, x1, z - thick / 2, z + thick / 2, bottom, top, 'parapet');
  };
  parapet(36, 66, -38.2, W + 1.3, W - 0.4, breaches.filter((g) => g[0] > 36));
  parapet(-2, 23.08, -38.2, L + 1.3, L - 0.4, breaches.filter((g) => g[0] < 23));
  parapet(0, 23.08, -33.8, L + 1.3, L - 0.4, [[5.6, 8.4], [13.4, 15.2]]);
  parapet(36, 44, -33.8, W + 1.3, W - 0.4, []);
  dnBox(sec, 66, 66.55, -38.5, -28.3, W - 0.4, W + 1.3, 'parapet');
  dnBox(sec, 59.55, 60, -32.4, -28.3, W - 0.4, W + 1.3, 'parapet');
  dnBox(sec, 63.4, 63.9, -38.5, -28.3, W - 0.4, W + 1.3, 'parapet');
  // Along the stair down: parapets on both sides, stepped.
  for (let i = 0; i < stairs.steps; i += 3) {
    const last = Math.min(stairs.steps, i + 3) - 1;
    for (const z of [-38.2, -33.8]) dnBox(sec, stairs.foot[0] + i * stairs.tread, stairs.foot[0] + (last + 1) * stairs.tread, z - 0.275, z + 0.275, stairs.treadY(i) - 0.6, stairs.treadY(last) + 1.3, 'parapet');
  }
  sec.decor.push({ kind: 'walk', y: W, rect: [36, 66, -38, -32.4] }, { kind: 'walk', y: L, rect: [-2, 23.08, -38, -34] }, { kind: 'crenel', a: [36, -38.2], b: [66, -38.2], y: W + 1.3, gaps: breaches.filter((g) => g[0] > 36) }, { kind: 'crenel', a: [-2, -38.2], b: [23.08, -38.2], y: L + 1.3, gaps: breaches.filter((g) => g[0] < 23) });
  // The ladder: hauled up now (a barrier at the gap in the parapet); kicked down it is a stair of rungs to the court (Shortcut 2).
  const ladderDown = { ...stairsOf([14.3, -30.4], [6.9, 1.5], 23, Q, (L - Q) / 23, { yaw: Math.PI / 2, id: 'ladder1' }), style: 'ladder', skin: false };
  sec.ladders.push({
    id: 'ladder1', at: [14.3, L, -35.2], state: 'up', kickFrom: { at: [14.3, -35.8], size: [6, 3.6], y: [L - 1, L + 3] }, label: 'Kick the ladder down',
    states: { up: [{ ...wallOf([14.3, -33.8], [1.8, 0.4], L - 0.4, L + 1.3, { id: 'ladder1' }), style: 'ladder', skin: false }], down: [ladderDown] },
    look: { kind: 'ladder', foot: [14.3, Q, -26.95], top: [14.3, L, -33.85], width: 1.5 },
  });
  // Rest 3, before the chapel gate.
  sec.rest = { id: 'rest3', name: 'The Wall Brazier', at: [4.6, L, -36] };
  dnProp(sec, 'brazier', [4.8, L, -37.1], { lit: true, rest: true });
  dnProp(sec, 'brazier', [22.5, W - 3, -37.2], { lit: true });
  dnProp(sec, 'weapon', [31, stairs.treadY(26), -36.4], { what2: 'halberd', yaw: 0.2 });
  dnProp(sec, 'weapon', [47, W, -35.2], { what2: 'sword', yaw: 4 });
  dnProp(sec, 'bones', [38, W, -37.2], { yaw: 0.8 });
  dnProp(sec, 'raven', [58.5, W + 1.3, -38.2], { yaw: 2 });
  dnProp(sec, 'raven', [44.8, W + 1.3, -38.2], { yaw: 5 });
  dnProp(sec, 'raven', [19.6, L + 1.3, -38.2], { yaw: 3.4 });
  dnProp(sec, 'raven', [1.6, L + 1.3, -38.2], { yaw: 0.2 });
  dnProp(sec, 'banner', [27, L + 4, -38.2], { yaw: Math.PI / 2, torn: true });

  sec.portals.push({ to: 'vault', area: { at: [49, -24], size: [10, 10], y: [Q - 3, Q + 2] } });
  sec.portals.push({ to: 'quad', area: [{ at: [14.3, -32], size: [4, 8], y: [L - 6, L + 3] }, { at: [30, -35], size: [30, 6], y: [L - 2, W + 3] }] });
  sec.portals.push({ to: 'chapel', area: { at: [1.5, -36], size: [7, 5] } });

  // The garrison: a guard in the hall, a knight on the stair, then the wall: a guard, a knight, a crossbow, the last knight.
  dnSpawn(sec, 'keepguard', 'dunnottarGuard', 'enemy', 2, [51, Q, -19.4], DN_FACE.W, { inputs: { name: 'Sergeant Hay' } });
  const stairAt = windingTread(DN_SPIRAL, 36);
  dnSpawn(sec, 'stairknight', 'dunnottarKnight', 'enemy', 3, [stairAt[0], Q + 37 * 0.15, stairAt[1]], Math.PI / 2 - (DN_SPIRAL.start + (DN_SPIRAL.turn / DN_SPIRAL.steps) * 36.5), { inputs: { name: 'Sir Calder' } });
  dnSpawn(sec, 'wallguard', 'dunnottarGuard', 'enemy', 2, [55, W, -36.2], DN_FACE.E, { inputs: { name: 'Sergeant Dow' } });
  dnSpawn(sec, 'wallknight1', 'dunnottarKnight', 'enemy', 3, [41, W, -36], DN_FACE.E, { inputs: { name: 'Sir Rannoch' } });
  dnSpawn(sec, 'wallbow', 'dunnottarCrossbow', 'enemy', 2, [17, L, -36], DN_FACE.E, { inputs: { name: 'Crossbow Murray' } });
  dnSpawn(sec, 'wallknight2', 'dunnottarKnight', 'enemy', 3, [10, L, -36.4], DN_FACE.E, { inputs: { name: 'Sir Lauder' } });

  const midStair = windingTread(DN_SPIRAL, 56);
  dnItem(sec, 'bandage7', 'bandage', [47.6, Q, -29.4]);
  dnItem(sec, 'tonic5', 'tonic', [midStair[0], Q + 57 * 0.15, midStair[1]]);
  dnItem(sec, 'note-soldier', 'note', [44.4, W, -37.4], { note: 'soldier' });
  dnItem(sec, 'bandage8', 'bandage', [3.4, L, -35]);
  return sec;
}

// ---- 7. The Chapel and 8. the Inner Cell -------------------------------------------------------------

function buildChapel() {
  const sec = dnSection('chapel', 'The Chapel');
  const L = Y.ladderRoom;
  dnBounds(sec, { at: [-10.5, -38], size: [17, 18], y: [L - 3, 40] });
  dnSlab(sec, -19, -2, -47, -29.4, L, 'flags', { extra: { room: true, summit: true } });
  // The walls of the roofless chapel, ragged at the top, lancet windows down the sides and a great east window.
  const top = L + 7;
  dnRun(sec, [-2.8, -29.4], [-2.8, -47], 1.6, L - 1, top - 1.5, 'ruin', [{ at: 6.6, width: 3.6, sill: L, top: L + 4.2, shape: 'pointed' }]);
  dnRun(sec, [-18.2, -29.4], [-18.2, -47], 1.6, L - 1, top + 1.5, 'ruin', [{ at: 8.6, width: 3.2, sill: L + 1.8, top: L + 6.4, shape: 'lancet', solid: true }]);
  dnRun(sec, [-19, -30.2], [-2, -30.2], 1.6, L - 1, top, 'ruin', [4, 7.4, 10.8, 14.2].map((at) => ({ at, width: 1.1, sill: L + 1.6, top: L + 5.4, shape: 'lancet', solid: true })));
  dnRun(sec, [-19, -46.2], [-2, -46.2], 1.6, L - 1, top, 'ruin', [{ at: 10, width: 2.4, sill: L, top: L + 3.6, shape: 'round' }, ...[3.2, 6.2, 13.6, 16.2].map((at) => ({ at, width: 1.1, sill: L + 1.6, top: L + 5.4, shape: 'lancet', solid: true }))]);
  dnGate(sec, 'chapelgate', [-0.6, L, -36], [{ ...wallOf([-2.8, -36], [0.4, 3.6], L, L + 4.2, { id: 'chapelgate' }), style: 'iron', skin: false }], { kind: 'door', width: 3.6, height: 4.2, hinge: 'z-', leaf: 'iron' }, { opensFrom: { at: [2.5, -36], size: [6, 4.4] }, label: 'Open the chapel gate' });
  // The inner cell's door in the north wall: shut until the boss has fallen.
  dnGate(sec, 'innerdoor', [-9.0, L, -46.2], [{ ...wallOf([-9, -46.2], [2.4, 0.4], L, L + 3.6, { id: 'innerdoor' }), style: 'iron', skin: false }], { kind: 'door', width: 2.4, height: 3.6, hinge: 'x-', leaf: 'oak' });
  // Furniture of a ruin: the altar, broken pews, fallen masonry.
  dnProp(sec, 'altar', [-16.6, L, -38.2], { yaw: 0 });
  dnProp(sec, 'pew', [-11.6, L, -33.6], { yaw: 0 });
  dnProp(sec, 'pew', [-8.8, L, -34], { yaw: 0.1, broken: true });
  dnProp(sec, 'pew', [-11.4, L, -42.7], { yaw: 0 });
  dnProp(sec, 'pew', [-7.6, L, -42.4], { yaw: -0.05, broken: true });
  dnProp(sec, 'rubble', [-5.6, L, -43.6], { size: 1.2 });
  dnProp(sec, 'rubble', [-15.8, L, -32.2], { size: 1.0 });
  dnProp(sec, 'rubble', [-13.4, L, -44.8], { size: 0.8 });
  dnProp(sec, 'brazier', [-15.2, L, -35], { lit: true });
  dnProp(sec, 'brazier', [-15.2, L, -41.6], { lit: true });
  dnProp(sec, 'gravestone', [-5.4, L, -31.4], { yaw: 0.2 });
  dnProp(sec, 'raven', [-18.2, L + 8.5, -42], { yaw: 1 });
  dnProp(sec, 'raven', [-2.8, L + 5.4, -45], { yaw: 4 });
  dnProp(sec, 'weapon', [-6, L, -37], { what2: 'sword', yaw: 1.4 });
  dnItem(sec, 'note-order', 'note', [-16.6, L, -37.2], { note: 'order', lift: 1.0 });
  // (Overlapping the wall walk's end at x -2, so that the walk stays awake the whole way in: a gap here dropped the wall walk's floor for a step.)
  sec.portals.push({ to: 'tower', area: { at: [-5, -36], size: [7, 7] } });
  sec.portals.push({ to: 'cell', area: { at: [-9, -43.5], size: [6, 4] } });
  dnSpawn(sec, 'vaelen', 'vaelen', 'boss', 4, [-11.4, L, -38.2], DN_FACE.E, { inputs: { name: 'Lord Vaelen' }, boss: { title: "The Queen's Chief Jailer" } });
  return sec;
}

function buildCell() {
  const sec = dnSection('cell', 'The Inner Cell');
  const L = Y.ladderRoom;
  dnBounds(sec, { at: [-9, -51], size: [12, 9], y: [L - 3, 40] });
  dnSlab(sec, -14.6, -3.4, -56.2, -45.4, L, 'flags', { extra: { room: true } });
  dnRun(sec, [-13.8, -55.4], [-13.8, -46.2], 1.6, L - 1, L + 5, 'rubble');
  dnRun(sec, [-4.2, -55.4], [-4.2, -46.2], 1.6, L - 1, L + 5, 'rubble');
  dnRun(sec, [-14.6, -55.4], [-3.4, -55.4], 1.6, L - 1, L + 5, 'rubble', [{ at: 5.6, width: 0.6, sill: L + 2.6, top: L + 3.9, shape: 'slit', solid: true }]);
  dnCeiling(sec, -13, -5, -54.6, -47, L + 3.8, L + 5);
  sec.decor.push({ kind: 'vault', a: [-13, -50.8, L + 3.0], b: [-5, -50.8, L + 3.0], width: 7.6, crown: 1.0, style: 'vault' });
  dnProp(sec, 'straw', [-11, L, -53], {});
  dnProp(sec, 'bucket', [-6.4, L, -53.6], {});
  dnProp(sec, 'chains', [-9, L + 2.0, -55.1], {});
  dnProp(sec, 'torch', [-12.6, L + 2.4, -48], { face: 'E', dim: true });
  dnProp(sec, 'chalice', [-9.4, L + 0.3, -52.2], { shards: true });
  sec.portals.push({ to: 'chapel', area: { at: [-9, -47.6], size: [6, 4] } });
  dnSpawn(sec, 'prince', 'cabyPrince', 'civilian', 0, [-9, L, -51.6], DN_FACE.S, { inputs: { name: 'The Prince of Caby' } });
  return sec;
}

// ---- The stage ----------------------------------------------------------------------------------------

const DN_SECTIONS = [buildCliff(), buildGate(), buildAscent(), buildQuad(), buildVault(), buildTower(), buildChapel(), buildCell()];

// How the garrison sees and flees (levelmode/awareness.js): the light in each section (the storm outside, torches below, the cell
// nearly black), the point a routed man runs for (`rear`), and where the civilians and prisoners run to hide (`refuge`).
const DN_MIND = {
  light: { cliff: 0.75, gate: 0.55, ascent: 0.5, quad: 0.75, vault: 0.3, tower: 0.55, chapel: 0.7, cell: 0.15 },
  rear: { cliff: [-58, 0, 30], gate: [10, 4.18, 46], ascent: [17, 8.18, 20], quad: [20, 12.18, 2], vault: [5.7, 6, -17], tower: [51, 12.18, -23], chapel: [-14, 17.18, -38] },
  refuge: {
    servant1: [36.5, 12.18, -5], servant2: [37.5, 12.18, -6.5], priest: [41, 12.18, -12.5], lady1: [5, 12.18, -30], lady2: [5, 12.18, -29],
    miner: [12.6, 6, -34], captive: [20.6, 6, -34],
  },
};
// Bodies that lie where they fell from the start (levelmode/level.js `dead`): a story to read, and a weapon or a coat to take.
const DN_DEAD = {
  cliff: [
    ['fallen1', 'dunnottarSoldier', 1, [-93, DN_L1(-93), -2.9], 2.1, 'A levy, dead a day'],
    ['fallen2', 'dunnottarSoldier', 1, [-20.5, Y.gorge, 52.6], 0.4, 'A levy, face down at the cliff edge'],
  ],
  quad: [['fallen3', 'dunnottarGuard', 2, [21.5, Y.quad, -27.2], 1.2, 'A guard, a crossbow bolt in his back']],
  tower: [['fallen4', 'dunnottarGuard', 2, [36.6, Y.walk, -37], 0.1, 'A guard, who held the wall']],
};
for (const section of DN_SECTIONS) {
  for (const [id, preset, tier, post, facing, name] of DN_DEAD[section.id] ?? []) section.spawns.push({ id, preset, role: 'enemy', tier, post, facing, dead: true, inputs: { name } });
  section.light = DN_MIND.light[section.id];
  if (DN_MIND.rear[section.id]) section.rear = DN_MIND.rear[section.id];
  for (const spawn of section.spawns) if (DN_MIND.refuge[spawn.id]) spawn.refuge = DN_MIND.refuge[spawn.id];
}

export const DUNNOTTAR = {
  id: 'dunnottar',
  title: 'Memories of Dunnottar',
  // The render.js place it is set in (a storm, levelmode/storm.js).
  place: 'dunnottar',
  sea: DN_Y.sea,
  start: { section: 'cliff', at: [-114, DN_Y.start, -4], facing: DN_FACE.E },
  sections: DN_SECTIONS,
  // After the boss: the inner cell's door opens, and near the prince (m) the scene begins; he shuffles into the corner (the straw's).
  ending: { door: 'innerdoor', prince: 'prince', trigger: 3.8, corner: [-12.3, -54.3] },
  // The prisoners who follow him stop at the chapel gate.
  followStopsAt: { at: [1.5, -36], size: [7, 4.4], y: [DN_Y.ladderRoom - 1, DN_Y.ladderRoom + 3] },
  // For the drawing (levelmode/kit.js): the land round the castle, and the weather.
  landform: {
    extent: [-136, 78, -66, 84],
    cell: 2.5,
    // The mainland hillside: a plane y = a + b x + c (z - d) sloping to the gorge, capped at the plateau; paths and landings are cut into it.
    // Where the headland's rock is kept clear of a door at its foot: the great gate and the postern.
    clear: [[-12, -4.6, 43.6, 48.8, DN_Y.gorge - 0.35], [0.4, 4, 50.6, 53.6, DN_Y.gorge - 0.35]],
    mainland: { polygon: [[-136, -50], [-12, -50], [-12, 58], [-136, 58]], plane: [12, 0, -0.27, -4], cap: 16 },
  },
  weather: { kind: 'storm', seed: 1500 },
};

// ---- The route ------------------------------------------------------------------------------------------

/** The winding stair's treads to aim at, every `every`th. */
const dnSpiralWaypoints = (every = 2) => {
  const points = [];
  for (let step = 0; step < DN_SPIRAL.steps; step += every) points.push(windingTread(DN_SPIRAL, step));
  points.push(windingTread(DN_SPIRAL, DN_SPIRAL.steps - 1));
  return points;
};

/**
 * The way through the stage, as legs of waypoints [x, z] for a walker (test/walker.js): the main route in order, each leg
 * ending in the section named. `open` lists the mechanisms the leg needs set first (the chapel gate; the rest are walked
 * round or through, with the shortcuts tested apart, `DUNNOTTAR_SHORTCUTS`).
 */
export const DUNNOTTAR_ROUTE = [
  { name: 'cliff path', to: 'cliff', points: [[-100, -4], [-80, -4], [-64, -4], [-58, -2], [-58, 8], [-70, 8], [-90, 8], [-100, 8], [-104, 12], [-104, 20], [-90, 20], [-70, 20], [-62, 20], [-58, 24], [-58, 30], [-58, 34], [-58, 38], [-58, 44]] },
  { name: 'the gorge and the ledge', to: 'gate', points: [[-44, 44], [-30, 44], [-14, 50], [-10, 54], [-3, 54.2], [2.2, 54], [2.2, 50], [2.2, 47]] },
  { name: 'the oillet stair', to: 'ascent', points: [[5, 46.2], [10, 46.2], [13, 46.2], [16.5, 46.2], [17.7, 42], [17.7, 37], [17.7, 30], [17.7, 26]] },
  { name: 'the tunnelled ascent', to: 'ascent', points: [[17, 22], [17, 14], [17, 9], [17, 6], [17, 2]] },
  { name: 'the quadrangle to the vault', to: 'vault', points: [[12, -1], [5.7, -2.4], [5.7, -6], [5.7, -12], [5.7, -17], [5.7, -20]] },
  { name: 'the long cellar', to: 'vault', points: [[6, -22.5], [14, -22.5], [24, -22.5], [32, -22.5], [36, -22.5], [44, -22.5]] },
  { name: 'the keep to the stair tower', to: 'tower', points: [[48, -22.5], [52, -23.8], [56, -23.8], [59, -23.8]] },
  { name: 'the winding stair', to: 'tower', points: dnSpiralWaypoints(2) },
  { name: 'the wall walk', to: 'tower', points: [[61.6, -27.4], [61.6, -31], [61.6, -36], [50, -36], [44, -36], [37, -36], [30, -36], [24, -36], [20, -36], [10, -36], [5, -36], [0, -36]], open: ['chapelgate'] },
  { name: 'the chapel', to: 'chapel', points: [[-6, -36], [-11, -38]] },
];

/** The three shortcuts and the doors: what to set, and a short way to walk to show it open. */
export const DUNNOTTAR_SHORTCUTS = [
  { name: 'the cliff gate (from the gatehouse side)', mechanism: 'cliffgate', start: [-3, DN_Y.gorge, 46.2], facing: DN_FACE.W, points: [[-10, 46.2], [-20, 46.2]], blockedWhenClosed: true },
  { name: 'the ladder, kicked down from the upper wall', mechanism: 'ladder1', state: 'down', start: [14.3, DN_Y.quad, -22], facing: DN_FACE.N, points: [[14.3, -26], [14.3, -31], [14.3, -33.5], [14.3, -36]], blockedWhenClosed: true },
  { name: 'the iron gate up from the vault', mechanism: 'irongate', start: [24.7, DN_Y.vault, -21], facing: DN_FACE.S, points: [[24.7, -18.6], [24.7, -14], [24.7, -9], [24.7, -5]], blockedWhenClosed: true },
  { name: 'the cell door', mechanism: 'celldoor', start: [16.7, DN_Y.vault, -23.5], facing: DN_FACE.N, points: [[16.7, -27], [16.7, -31]], blockedWhenClosed: true },
  { name: 'the chapel gate', mechanism: 'chapelgate', start: [1, DN_Y.ladderRoom, -36], facing: DN_FACE.W, points: [[-3, -36], [-8, -36]], blockedWhenClosed: true },
  { name: 'the inner cell door', mechanism: 'innerdoor', start: [-9, DN_Y.ladderRoom, -43], facing: DN_FACE.N, points: [[-9, -46.2], [-9, -50]], blockedWhenClosed: true },
];
