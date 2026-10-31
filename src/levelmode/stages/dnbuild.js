// Dunnottar's builders: the small pieces that every section of the stage is made from (a slab, a wall run with its openings, a flight with
// its walls and vault, a gate, a spawn, an item, a prop), and the levels (y) of the stage. Shared by stages/dunnottar.js and the sections
// that live in their own files (dunnottar-vault.js, dunnottar-chapel.js).

import { ceilingOf, slabOf, stairsOf, wallLine, wallOf } from '../../physics/terrain.js';

/** The levels (y). */
export const DN_Y = { sea: -9, start: 14, pathA: 10.6, pathB: 7.2, pathC: 3.8, gorge: 0, landing: 4.18, guardroom: 8.18, quad: 12.18, vault: 6.0, crypt: 1.4, ladderRoom: 17.18, walk: 24.93 };
export const Y = DN_Y;
/** The floors a man stands on (y), for the drawing's wear (levelmode/kitwear.js finds the floor a wall stands on among these). */
export const DN_LEVELS = [Y.gorge, Y.landing, Y.guardroom, Y.quad, Y.vault, Y.crypt, Y.ladderRoom, Y.walk];
/** How wide the outdoor path is (m): a narrow way between rails, not a road (the fighting room is this less the rails: 2.9). */
export const DN_PATH = 3.2;

/** Facing: yaw 0 looks along +x, a positive yaw turns toward -z. */
export const DN_FACE = { E: 0, N: Math.PI / 2, W: Math.PI, S: -Math.PI / 2 };
export const DIRS = { E: [1, 0, 0], W: [-1, 0, Math.PI], N: [0, -1, Math.PI / 2], S: [0, 1, -Math.PI / 2] };

// ---- Builders -------------------------------------------------------------------------------

export const dnSection = (id, name) => ({ id, name, bounds: [], terrain: [], portals: [], spawns: [], items: [], levers: [], gates: [], ladders: [], decor: [], seals: [] });

/** A slab by extents. `style`: how the top is drawn (cobble, flags, grass, path, rock, boards, earth). */
export function dnSlab(sec, x0, x1, z0, z1, top, style, opts = {}) {
  const solid = { ...slabOf([(x0 + x1) / 2, (z0 + z1) / 2], [x1 - x0, z1 - z0], top, { bottom: opts.bottom, id: opts.id }), style, ...(opts.extra ?? {}) };
  if (opts.skin === false) solid.skin = false;
  sec.terrain.push(solid);
  return solid;
}

/** A wall box by extents. */
export function dnBox(sec, x0, x1, z0, z1, y0, y1, style = 'ashlar', opts = {}) {
  const solid = { ...wallOf([(x0 + x1) / 2, (z0 + z1) / 2], [x1 - x0, z1 - z0], y0, y1, { id: opts.id }), style, ...(opts.extra ?? {}) };
  if (opts.skin === false) solid.skin = false;
  sec.terrain.push(solid);
  return solid;
}

/** A ceiling by extents (its underside at `bottom`; `top` for the roof). */
export function dnCeiling(sec, x0, x1, z0, z1, bottom, top = bottom + 0.8, style = 'vault') {
  sec.terrain.push({ ...ceilingOf([(x0 + x1) / 2, (z0 + z1) / 2], [x1 - x0, z1 - z0], bottom, { top }), style, skin: false });
}

/**
 * A wall from `a` to `b` (each [x, z], the centreline), `thick` thick, from y0 to y1, with openings:
 * { at: distance of the middle from a, width, sill (the floor; default y0), top, shape: 'round' | 'pointed' | 'square' | 'slit' | 'lancet', solid }.
 * An opening is clear to the physics from `sill` to `top` (a `solid` one - a window - blocks, and is only drawn open).
 * The kit draws the run as one wall with its openings (decor); the pieces carry `skin: false`.
 */
export function dnRun(sec, a, b, thick, y0, y1, style, openings = [], extra = {}) {
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
export function dnFlight(sec, { foot, dir, steps, tread = 0.34, width, from, rise, style = 'stone', id, bottom }) {
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
export function dnFlightWalls(sec, flight, { thick = 1.6, head = 4.4, every = 2, style = 'ashlar', sides = [1, -1] } = {}) {
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
export function dnFlightVault(sec, flight, { head = 3.8, every = 2, first = 0, last = flight.steps, style = 'vault', crown = 0.9, roof = 0.7 } = {}) {
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
export function dnFence(sec, points, { style = 'fence', height = 1.15, gaps = [], every = 3 } = {}) {
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
export function dnGate(sec, id, at, closed, look, opts = {}) {
  const { opensFrom, key, frees, label, lockedText } = opts;
  sec.gates.push({ id, at, state: opts.state ?? 'closed', states: { closed, open: opts.open ?? [] }, look, ...(opensFrom ? { opensFrom } : {}), ...(key ? { key } : {}), ...(frees ? { frees } : {}), ...(label ? { label } : {}), ...(lockedText ? { lockedText } : {}) });
}

/** A spawn. */
export function dnSpawn(sec, id, preset, role, tier, post, facing, extra = {}) {
  sec.spawns.push({ id, preset, role, tier, post, facing, ...extra });
}

export const dnItem = (sec, id, kind, at, extra = {}) => sec.items.push({ id, kind, at, ...extra });
export const dnProp = (sec, what, at, extra = {}) => sec.decor.push({ kind: 'prop', what, at, ...extra });
export const dnBounds = (sec, ...regions) => sec.bounds.push(...regions);
export const dnLerp = (x0, x1, y0, y1) => (x) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);

// ---- Rooms ------------------------------------------------------------------------------------------

/**
 * A walled room by its inside: x0..x1, z0..z1, floor `floor`, `head` m clear under a flat ceiling (the barrel vault drawn over it is the
 * decor's), walls `thick` thick standing outside the inside. `doors`: { n, s, e, w } each a list of { at (the world x of a door in an
 * n/s wall, z in an e/w one), width, top, sill, shape, solid } openings (n is the z0 side, s the z1 side, w the x0 side, e the x1 side);
 * `walls`: the sides to build (default all: leave out one that a neighbour already stands as). `slab`: false for no floor, or options for
 * dnSlab (`bottom`...). `vault`: { crown, ribs } for the drawn barrel vault over the long way (null: none). Returns the geometry.
 */
export function dnRoom(sec, o) {
  const { x0, x1, z0, z1, floor, head = 3.6, thick = 1.0, style = 'rubble', floorStyle = 'flags', doors = {}, walls = ['n', 's', 'e', 'w'], foot = floor - 1, over = 0.7, vault = { crown: 1.3, ribs: 4.1 }, ceiling = true } = o;
  const top = floor + head + over;
  const run = (a, b, openings) => dnRun(sec, a, b, thick, foot, top, style, openings.map((d) => ({ sill: floor, top: floor + 3.4, shape: 'round', ...d })));
  const t = thick;
  if (o.slab !== false) dnSlab(sec, x0 - t, x1 + t, z0 - t, z1 + t, floor, floorStyle, { extra: { room: true }, ...(o.slab ?? {}) });
  if (walls.includes('n')) run([x0 - t, z0 - t / 2], [x1 + t, z0 - t / 2], (doors.n ?? []).map((d) => ({ ...d, at: d.at - (x0 - t) })));
  if (walls.includes('s')) run([x0 - t, z1 + t / 2], [x1 + t, z1 + t / 2], (doors.s ?? []).map((d) => ({ ...d, at: d.at - (x0 - t) })));
  if (walls.includes('w')) run([x0 - t / 2, z0 - t], [x0 - t / 2, z1 + t], (doors.w ?? []).map((d) => ({ ...d, at: d.at - (z0 - t) })));
  if (walls.includes('e')) run([x1 + t / 2, z0 - t], [x1 + t / 2, z1 + t], (doors.e ?? []).map((d) => ({ ...d, at: d.at - (z0 - t) })));
  if (ceiling) dnCeiling(sec, x0 + 0.1, x1 - 0.1, z0 + 0.1, z1 - 0.1, floor + head, floor + head + over);
  if (vault) {
    const alongX = x1 - x0 >= z1 - z0;
    const spring = floor + head - 0.5;
    const width = alongX ? z1 - z0 : x1 - x0;
    if (alongX) sec.decor.push({ kind: 'vault', a: [x0, (z0 + z1) / 2, spring], b: [x1, (z0 + z1) / 2, spring], width, crown: vault.crown, ribs: vault.ribs, style: 'vault' });
    else sec.decor.push({ kind: 'vault', a: [(x0 + x1) / 2, z0, spring], b: [(x0 + x1) / 2, z1, spring], width, crown: vault.crown, ribs: vault.ribs, style: 'vault' });
  }
}
