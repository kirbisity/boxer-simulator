// The user's horse model (horsebase-data.js, from lowPolyHorse.blend by tools/blender/horsebase.py) as pure data: its mesh
// decoded, and the surfaces the game's tack and bard are cut over (horsemesh.js `bodyFn`, `neckFn`, `headFn`) measured off it.
//
// The tack and the bard were cut for the lofted horse's barrel, neck and head, each a table of rings. Here the same three
// surfaces are measured on the model: at each station along the barrel, the neck or the head a ring of rays is cast from the
// middle of its cross-section out to the first skin it meets, so a strap, a saddle cloth or a plate laid at (station, angle,
// standoff) lies on this horse's own skin as it laid on the loft's. The bard's shrink-wrap (horsebard.js) is cast at the
// model's own trunk, neck and dock (its `colliders`) instead of the loft's.

import { HORSE_BASE_DATA } from './horsebase-data.js';
import { HORSE_SHAPE, poseHorse } from './physics/mounted.js';
import { HORSES } from './horses.js';

const HB_TAU = Math.PI * 2;
// Parts of the model (horsebase-data.js `parts`): the trunk, the neck and the head come first, the legs' pieces after.
const HB_PART = { body: 0, neck: 1, head: 2 };
// A point is in the tail beyond its dock (folded away: the hair tail hangs there) when most of its weight is on those bones.
const HB_TAIL_SHARE = 0.5;
// The dock's half-thickness (withers): ~5 cm on a horse; the model's dock points lie within 3.5 cm of its bone, the buttocks
// under it 5 cm and more.
const HB_DOCK_RADIUS = 0.04;
// The surfaces' tables: stations along each piece and rays round each station's ring. The model's rings are 8 to 16 quads
// round, so 40 rays round and a station every ~2.5 cm of a 1.5 m horse sample every face of it at least once.
const HB_STATIONS = 40;
const HB_RAYS = 40;
// No part of a horse is further than this from the middle of its own cross-section (the barrel's half-depth is ~0.2 of the
// withers): a ray that goes further has left through the open end of its part (where the neck joins the trunk, say) and met
// some other part, and is taken as having met nothing.
const HB_REACH = 0.32;
// The legs' poses a bard must clear: physics/mounted.js poseHorse (the view draws the legs so) at a walk, a trot, a canter, a
// fast canter and the horse's own gallop (m/s), each at HB_GAIT_PHASES moments of its stride (as fine as test/horsebard.test.js
// needs, sweeping 48: a plate spans its neighbours, horsebard.js bdDrape, which covers the gallop's hock between them). The bard is cast over every pose of the upper leg and the cannon, as over the neck in every nod
// (horsebard.js), so its hem and its fringe clear the forearm, the gaskin and the hock.
const HB_GAIT_SPEEDS = [1.5, 3.5, 6.5, 10];
const HB_GAIT_PHASES = 24;

const decoded = {};

function hbBytes(text) {
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) out[index] = raw.charCodeAt(index);
  return out.buffer;
}

/**
 * The model's arrays (decoded once): `points` (x, y, z in withers heights), `uvs`, `triangles`, `weights` (each point's two
 * parts and the first's weight, bytes), `tail` (each point's share of the tail beyond its dock, 0..1), `dock` (each point
 * of the dock itself: within HB_DOCK_RADIUS of its bone and past its root, not the buttocks under it).
 */
export function horseBaseMesh() {
  if (decoded.mesh) return decoded.mesh;
  const points = new Int16Array(hbBytes(HORSE_BASE_DATA.points));
  const uvs = new Uint16Array(hbBytes(HORSE_BASE_DATA.uvs));
  decoded.mesh = {
    points: Float32Array.from(points, (value) => value / 16000),
    uvs: Float32Array.from(uvs, (value) => value / 65535),
    triangles: Array.from(new Uint16Array(hbBytes(HORSE_BASE_DATA.triangles))),
    weights: new Uint8Array(hbBytes(HORSE_BASE_DATA.weights)),
    tail: Float32Array.from(new Uint8Array(hbBytes(HORSE_BASE_DATA.tail)), (value) => value / 255),
    joints: HORSE_BASE_DATA.joints,
    parts: HORSE_BASE_DATA.parts,
  };
  const placed = decoded.mesh.points;
  const [root, end] = decoded.mesh.joints.dock;
  const bone = [end[0] - root[0], end[1] - root[1]];
  const boneSquared = bone[0] * bone[0] + bone[1] * bone[1];
  decoded.mesh.dock = Uint8Array.from({ length: placed.length / 3 }, (_, v) => {
    const [x, y, z] = [placed[v * 3], placed[v * 3 + 1], placed[v * 3 + 2]];
    const along = ((x - root[0]) * bone[0] + (y - root[1]) * bone[1]) / boneSquared;
    const t = Math.min(1, along);
    return along >= 0 && Math.hypot(x - root[0] - bone[0] * t, y - root[1] - bone[1] * t, z) < HB_DOCK_RADIUS ? 1 : 0;
  });
  return decoded.mesh;
}

/** The nearest a ray from `o` along unit `d` meets the triangles (each 9 numbers; Möller–Trumbore), or null. */
function hbCast(tris, o, d) {
  let best = Infinity;
  for (let b = 0; b < tris.length; b += 9) {
    const e1x = tris[b + 3] - tris[b];
    const e1y = tris[b + 4] - tris[b + 1];
    const e1z = tris[b + 5] - tris[b + 2];
    const e2x = tris[b + 6] - tris[b];
    const e2y = tris[b + 7] - tris[b + 1];
    const e2z = tris[b + 8] - tris[b + 2];
    const px = d[1] * e2z - d[2] * e2y;
    const py = d[2] * e2x - d[0] * e2z;
    const pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tx = o[0] - tris[b];
    const ty = o[1] - tris[b + 1];
    const tz = o[2] - tris[b + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t > 1e-6 && t < best) best = t;
  }
  return best < Infinity ? best : null;
}

/**
 * A surface measured off the mesh, as the loft's are written: `at(s, a, d)` the point at station s (0..1 along the piece),
 * angle a round it (0 its left side, π/2 its top, as horsemesh.js), stood off it by d. `axis(s)` gives the station's middle
 * guess and its frame: `up` (the top, a = π/2) and the piece's direction. Each station's middle is moved to halfway between
 * the top and the bottom skin before its ring is cast, so the rays fan from inside the cross-section.
 */
function hbSurface(tris, axis) {
  const centres = [];
  const ups = [];
  const radii = new Float32Array((HB_STATIONS + 1) * HB_RAYS);
  for (let i = 0; i <= HB_STATIONS; i += 1) {
    const { at, up } = axis(i / HB_STATIONS);
    const down = [-up[0], -up[1], -up[2]];
    const near = (hit) => (hit !== null && hit < HB_REACH ? hit : null);
    const top = near(hbCast(tris, at, up));
    const bottom = near(hbCast(tris, at, down));
    const shift = top !== null && bottom !== null ? (top - bottom) / 2 : 0;
    const centre = [at[0] + up[0] * shift, at[1] + up[1] * shift, at[2] + up[2] * shift];
    centres.push(centre);
    ups.push(up);
    for (let j = 0; j < HB_RAYS; j += 1) {
      const a = (j / HB_RAYS) * HB_TAU;
      const dir = [up[0] * Math.sin(a), up[1] * Math.sin(a), Math.cos(a) + up[2] * Math.sin(a)];
      const hit = hbCast(tris, centre, dir);
      radii[i * HB_RAYS + j] = hit !== null && hit < HB_REACH ? hit : -1;
    }
  }
  // A ray that met nothing (out past an open edge of the mesh) takes its neighbours' round the ring.
  for (let i = 0; i <= HB_STATIONS; i += 1) {
    for (let j = 0; j < HB_RAYS; j += 1) {
      if (radii[i * HB_RAYS + j] >= 0) continue;
      let sum = 0;
      let count = 0;
      for (let k = 1; k < HB_RAYS / 2 && !count; k += 1) {
        for (const jj of [j - k, j + k]) {
          const r = radii[i * HB_RAYS + ((jj + HB_RAYS) % HB_RAYS)];
          if (r >= 0) { sum += r; count += 1; }
        }
      }
      radii[i * HB_RAYS + j] = count ? sum / count : 0;
    }
  }
  return (s, a, d = 0) => {
    const fs = Math.max(0, Math.min(1, s)) * HB_STATIONS;
    const i0 = Math.min(HB_STATIONS - 1, Math.floor(fs));
    const ts = fs - i0;
    const fa = ((((a / HB_TAU) % 1) + 1) % 1) * HB_RAYS;
    const j0 = Math.floor(fa) % HB_RAYS;
    const j1 = (j0 + 1) % HB_RAYS;
    const ta = fa - Math.floor(fa);
    const ring = (i) => radii[i * HB_RAYS + j0] * (1 - ta) + radii[i * HB_RAYS + j1] * ta;
    const r = ring(i0) * (1 - ts) + ring(i0 + 1) * ts + d;
    const c0 = centres[i0];
    const c1 = centres[i0 + 1];
    const u0 = ups[i0];
    const u1 = ups[i0 + 1];
    const up = [u0[0] + (u1[0] - u0[0]) * ts, u0[1] + (u1[1] - u0[1]) * ts, u0[2] + (u1[2] - u0[2]) * ts];
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    return [c0[0] + (c1[0] - c0[0]) * ts + up[0] * sin * r, c0[1] + (c1[1] - c0[1]) * ts + up[1] * sin * r, c0[2] + (c1[2] - c0[2]) * ts + cos * r + up[2] * sin * r];
  };
}

/** The triangles of the points that pass `keep(point)`, as {p, i} (horsebard.js colliders) and flat (each 9 numbers). */
function hbTriangles(mesh, keep) {
  const { points, triangles } = mesh;
  const p = Array.from(points);
  const i = [];
  for (let k = 0; k < triangles.length; k += 3) {
    if (keep(triangles[k]) && keep(triangles[k + 1]) && keep(triangles[k + 2])) i.push(triangles[k], triangles[k + 1], triangles[k + 2]);
  }
  const flat = new Float64Array(i.length * 3);
  for (let k = 0; k < i.length; k += 1) for (let axis = 0; axis < 3; axis += 1) flat[k * 3 + axis] = points[i[k] * 3 + axis];
  return { mesh: { p, i }, flat };
}

/** A leg's envelope as a tube ({p, i}): its sections ([t, front, back, half-width]) down a line from `root` along `axis`. */
function hbTube(rows, root, axis, length) {
  const around = 12;
  const ahead = axis[1] < 0 ? [-axis[1], axis[0]] : [axis[1], -axis[0]];
  const p = [];
  const i = [];
  rows.forEach(([t, front, back, half]) => {
    for (let k = 0; k < around; k += 1) {
      const a = (k / around) * HB_TAU;
      const reach = Math.cos(a) * (Math.cos(a) > 0 ? front : back);
      p.push(root[0] + axis[0] * t * length + ahead[0] * reach, root[1] + axis[1] * t * length + ahead[1] * reach, root[2] + Math.sin(a) * half);
    }
  });
  for (let r = 0; r + 1 < rows.length; r += 1) {
    for (let k = 0; k < around; k += 1) {
      const a = r * around + k;
      const b = r * around + ((k + 1) % around);
      i.push(a, b, a + around, b, b + around, a + around);
    }
  }
  return { p, i };
}

/**
 * The legs a bard is cast over (horsebard.js colliders.legs): each leg's upper leg and cannon as the view draws them (from the
 * model's hip or shoulder to the game's knee and hoof, its legs the model's: the envelope of their skin, horseBaseLegTable, as smooth tubes, so the plate stands off
 * all of a leg and not only off its low-poly corners), in every pose of a breed's gaits at its height. Measured once a breed.
 */
export function horseBaseLegColliders(breed, withers) {
  const key = `${breed}|${withers}`;
  decoded.legs ??= new Map();
  if (decoded.legs.has(key)) return decoded.legs.get(key);
  const gallop = HORSES[breed]?.gallop ?? 12;
  const tables = Object.fromEntries(HORSE_SHAPE.legs.map((leg) => [leg.key, horseBaseLegTable(leg.key)]));
  const legs = [];
  for (const speed of [...HB_GAIT_SPEEDS, gallop]) {
    for (let phase = 0; phase < HB_GAIT_PHASES; phase += 1) {
      const horse = { withers, at: [0, 0], yaw: 0, speed, stride: phase / HB_GAIT_PHASES, state: 'up', capsules: [], legs: {}, shape: HORSE_SHAPE, paces: { gallop } };
      poseHorse(horse);
      for (const leg of HORSE_SHAPE.legs) {
        const joint = (name) => hbHorseLocal(horse, horse.legs[leg.key][name]);
        // (The upper leg from the model's own joint, as the view draws it, horseview.js updateBaseHorse.)
        const [root, knee, hoof] = [HORSE_BASE_DATA.joints[leg.key].root, joint('knee'), joint('hoof')];
        for (const [from, to, rows] of [[root, knee, tables[leg.key].upper], [knee, hoof, tables[leg.key].cannon]]) {
          const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
          legs.push(hbTube(rows, from, [(to[0] - from[0]) / length, (to[1] - from[1]) / length], length));
        }
      }
    }
  }
  decoded.legs.set(key, legs);
  return legs;
}

/** A point of a posed horse (horse.at the origin, yaw 0) back in its own frame, in its withers' units: physics/mounted.js
 * horsePoint undone (its bob, then its pitch, then its rock, each about the barrel's pivot at 0.76 of the withers). */
function hbHorseLocal(horse, world) {
  const W = horse.withers;
  const pivot = 0.76 * W;
  let x = world[0];
  let y = world[1] - (horse.bob ?? 0);
  let z = world[2];
  if (horse.pitch) {
    const cos = Math.cos(horse.pitch);
    const sin = Math.sin(horse.pitch);
    const dy = y - pivot;
    [x, y] = [x * cos + dy * sin, pivot - x * sin + dy * cos];
  }
  const roll = (horse.roll ?? 0) + (horse.rock ?? 0);
  if (roll) {
    const cos = Math.cos(roll);
    const sin = Math.sin(roll);
    const dy = y - pivot;
    [y, z] = [pivot + dy * cos + z * sin, -dy * sin + z * cos];
  }
  return [x / W, y / W, z / W];
}

/** A unit vector. */
const hbUnit = (v) => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

/**
 * The model's surfaces and landmarks (horse units; measured once): `bodyFn(x, a, d)` (x along the trunk as the loft's, clamped
 * to the model's trunk), `neckFn(t, a, d)` (t from the base of the neck at the withers to the poll), `headFn(s, a, d)` (s from
 * the poll to the muzzle, 0..1), the joints the neck and head turn about (`neckPivot`, `poll`), the root of the hair tail at
 * the end of the dock (`tailRoot`), the muzzle's tip (`muzzle`) and the head's length, and the trunk's, neck's and dock's triangles a bard is cast at.
 */
export function horseBaseFit() {
  if (decoded.fit) return decoded.fit;
  const mesh = horseBaseMesh();
  const { points, weights, tail, joints } = mesh;
  const part = (v) => weights[v * 3];
  const inTail = (v) => tail[v] > HB_TAIL_SHARE;
  // What each piece's rays meet: its own skin (the parts share one inside, so a ray from the head's middle down its open
  // back would run on down the neck). The trunk's with the legs' tops, so a ray down between the legs meets them where they
  // join it, as a girth or a cloth's edge would rest on them; the folded tail left out.
  const trunk = (v) => part(v) === HB_PART.body && !inTail(v);
  const upperLeg = (v) => mesh.parts[part(v)].endsWith('.upper');
  const trunkSkin = hbTriangles(mesh, (v) => trunk(v) || upperLeg(v)).flat;
  // (The neck's with the trunk's: its base runs into the withers and the breast.)
  const neckSkin = hbTriangles(mesh, (v) => part(v) === HB_PART.neck || trunk(v)).flat;
  const headSkin = hbTriangles(mesh, (v) => part(v) === HB_PART.head).flat;
  const colliders = {
    body: hbTriangles(mesh, (v) => trunk(v) && !mesh.dock[v]).mesh,
    // (The neck alone, as the loft's: a ray from the breast forward meets the neck, never the head beyond it.)
    neck: hbTriangles(mesh, (v) => part(v) === HB_PART.neck).mesh,
    dock: hbTriangles(mesh, (v) => trunk(v) && mesh.dock[v]).mesh,
  };
  // The trunk's length: its body points (the dock and the folded tail left out), front to back.
  let front = -Infinity;
  let back = Infinity;
  for (let v = 0; v < points.length / 3; v += 1) {
    if (!trunk(v) || mesh.dock[v]) continue;
    front = Math.max(front, points[v * 3]);
    back = Math.min(back, points[v * 3]);
  }
  // (Stations a little inside its ends: a ring cast at the very end meets the skin edge-on.)
  const inset = 0.02;
  const trunkFrom = back + inset;
  const trunkTo = front - inset;
  // The trunk's middle height: the withers' pivot of the view (horseview.js, 0.76 of the withers), moved to each station's middle.
  const trunkMiddle = 0.76;
  const body = hbSurface(trunkSkin, (s) => ({ at: [trunkFrom + (trunkTo - trunkFrom) * s, trunkMiddle, 0], up: [0, 1, 0] }));
  // Past either end of its stations (where the loft, longer behind, lays a strap or a cloth's edge) the trunk is closed by a
  // round cap, its end ring drawn in as a dome as deep as the ring's half-depth, so what lies there wraps the rump.
  const bodyFn = (x, a, d = 0) => {
    const s = (x - trunkFrom) / (trunkTo - trunkFrom);
    if (s >= 0 && s <= 1) return body(s, a, d);
    const end = s < 0 ? 0 : 1;
    const top = body(end, Math.PI / 2);
    const bottom = body(end, -Math.PI / 2);
    const centre = [(top[0] + bottom[0]) / 2, (top[1] + bottom[1]) / 2, 0];
    const half = (top[1] - bottom[1]) / 2;
    const past = Math.min(half, Math.abs(x - (end ? trunkTo : trunkFrom)));
    const shrink = Math.sqrt(Math.max(0, 1 - (past / half) ** 2));
    const ring = body(end, a, 0);
    const outward = Math.hypot(ring[1] - centre[1], ring[2]) || 1;
    const scale = shrink + d / outward;
    return [centre[0] + (end ? past : -past), centre[1] + (ring[1] - centre[1]) * scale, ring[2] * scale];
  };
  // The neck: along the line from its root (where the model's neck bone starts, in the chest) to the poll, its top the crest.
  const neckPivot = joints.neckPivot;
  const poll = joints.poll;
  const neckAlong = hbUnit([poll[0] - neckPivot[0], poll[1] - neckPivot[1], 0]);
  const neckUp = [-neckAlong[1], neckAlong[0], 0];
  // (From the withers, not the neck bone's root inside the chest: the crest starts at the withers, the throat at the breast.)
  const neckStart = 0.2;
  const neckLine = (t) => {
    const share = neckStart + (1 - neckStart) * t;
    return [neckPivot[0] + (poll[0] - neckPivot[0]) * share, neckPivot[1] + (poll[1] - neckPivot[1]) * share, 0];
  };
  const neckFn = hbSurface(neckSkin, (t) => ({ at: neckLine(t), up: neckUp }));
  // The head: from the poll to the muzzle's tip (the head's point furthest down its bone's line), its top the face.
  let tip = poll;
  let reach = 0;
  const headDirection = hbUnit(joints.headTip ? [joints.headTip[0] - poll[0], joints.headTip[1] - poll[1], 0] : [0.6, -0.8, 0]);
  for (let v = 0; v < points.length / 3; v += 1) {
    if (part(v) !== HB_PART.head) continue;
    const along = (points[v * 3] - poll[0]) * headDirection[0] + (points[v * 3 + 1] - poll[1]) * headDirection[1];
    if (along > reach) {
      reach = along;
      tip = [poll[0] + headDirection[0] * along, poll[1] + headDirection[1] * along, 0];
    }
  }
  const headAlong = hbUnit([tip[0] - poll[0], tip[1] - poll[1], 0]);
  const headUp = [-headAlong[1], headAlong[0], 0];
  // (Rings a little in from the poll and the muzzle's tip, where the ring would be cast edge-on.)
  const headInset = 0.03;
  const headFn = hbSurface(headSkin, (s) => {
    const share = headInset + (1 - 2 * headInset) * s;
    return { at: [poll[0] + (tip[0] - poll[0]) * share, poll[1] + (tip[1] - poll[1]) * share, 0], up: headUp };
  });
  decoded.fit = {
    bodyFn, neckFn, headFn, neckPivot, poll, muzzle: tip, headLength: reach, headAngle: Math.atan2(-headAlong[1], headAlong[0]),
    trunk: [back, front], tailRoot: joints.dock[1], dockRoot: joints.dock[0], colliders,
  };
  return decoded.fit;
}

/**
 * A leg of the model's sections down its upper leg and its cannon, as horsemesh.js horseLegTable gives the loft's ([t, front,
 * back, half-width] of the withers, t down the piece), measured off the points the piece carries: the furthest each reaches
 * from the piece's line in front, behind and to the side, in bands down it. What a bard's hem must clear (test/horsebard.test.js).
 */
export function horseBaseLegTable(key) {
  const mesh = horseBaseMesh();
  const { points, weights, joints } = mesh;
  const j = joints[key];
  const bands = 10;
  const measure = (name, from, to) => {
    const index = mesh.parts.indexOf(`${key}.${name}`);
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const axis = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
    // (Its front: the side of the line towards the head.)
    const ahead = axis[1] < 0 ? [-axis[1], axis[0]] : [axis[1], -axis[0]];
    const rows = Array.from({ length: bands + 1 }, (_, k) => [k / bands, 0, 0, 0]);
    for (let v = 0; v < points.length / 3; v += 1) {
      if (weights[v * 3] !== index) continue;
      const dx = points[v * 3] - from[0];
      const dy = points[v * 3 + 1] - from[1];
      const t = Math.max(0, Math.min(1, (dx * axis[0] + dy * axis[1]) / length));
      const row = rows[Math.round(t * bands)];
      const across = dx * ahead[0] + dy * ahead[1];
      row[1] = Math.max(row[1], across);
      row[2] = Math.max(row[2], -across);
      row[3] = Math.max(row[3], Math.abs(points[v * 3 + 2] - from[2]));
    }
    // (A band no point fell in takes its neighbours'.)
    for (let k = 0; k <= bands; k += 1) {
      if (rows[k][3] > 0) continue;
      const near = rows.filter((row) => row[3] > 0).sort((a, b) => Math.abs(a[0] - rows[k][0]) - Math.abs(b[0] - rows[k][0]))[0];
      if (near) rows[k] = [rows[k][0], near[1], near[2], near[3]];
    }
    return rows;
  };
  return { upper: measure('upper', j.root, j.knee), cannon: measure('cannon', j.knee, j.fetlock) };
}
