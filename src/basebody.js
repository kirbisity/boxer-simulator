// The fighters' skin from the user's base meshes (body style 'base', bodystyles.js; the user's call, 2026-11-10): a modelled
// human body, without its head, hands and feet, carried by the game's own body shapes. The mesh (src/basebody-data.js, made by
// tools/blender/basebody.py) was modelled at one build of each sex, its `reference`. Each point of it is measured once against
// that build's loft (loftbody.js: the same rings the plain skin is drawn on): which part it belongs to, how far along the
// part (t), which way round (the ring's own angle), and how far out from the part's axis, against the reference ring's radius
// there. A fighter's skin is then each point put back on his own part's axis at t, round his own ring at that angle, its
// distance out scaled by his height against the reference's, plus the thickness by which his ring stands out beyond the
// reference's (so scaled): fat and muscle are layers over the frame, and they move the surface out by their own depth, not by a
// share of how far the surface lies from the bone (the shoulder's cap, far out on the trunk's narrow top ring, would otherwise
// fly out with the trunk's fat). His height, frame, fat and muscle move it as they move the loft, and the base mesh keeps the
// human contour the rings lack.
// Points near a joint carry both parts and blend between them (the tool's `blend`), so the parts meet without a step.
//
// The texture coordinates are the loft's (skindetail.js detailUv at the point's part, t and angle), so skintex.js paints the
// mesh as it paints the loft. Triangles across a part's seam (angle 0, its front) are split there, and a triangle is drawn in
// one part's tile: its points from another part are drawn twice, once per tile, welded for the normals.
//
// No Three.js: plain numbers, built in the skin worker with the rest of the loft.

import { BASE_BODY_DATA } from './basebody-data.js';
import { faceMorphWeights } from './facemorph.js';
import { detailUv } from './skindetail.js';
import { vec } from './pose.js';

export const BASE_BODY = {
  // Each skin part's axis, from joint to joint (rig.js bindPoints names; the base mesh's own joints are named the same).
  axes: {
    trunk: ['pelvis', 'neck'], neck: ['neck', 'head'],
    lUpper: ['lShoulder', 'lElbow'], lFore: ['lElbow', 'lHand'], rUpper: ['rShoulder', 'rElbow'], rFore: ['rElbow', 'rHand'],
    lThigh: ['lHip', 'lKnee'], lShin: ['lKnee', 'lFoot'], rThigh: ['rHip', 'rKnee'], rShin: ['rKnee', 'rFoot'],
  },
  // A part's rings are read from a table of this many stops along the part's span, linearly between them (the loft's profiles
  // are smooth on that scale: their stops are a tenth of a part apart).
  stops: 64,
  // Fat hides the muscle's relief modelled in the mesh: the mesh's surface low-passed (`smoothPasses` rounds of Taubin
  // smoothing, `smoothStep` in and `smoothBack` out each round, which keeps the volume) is what a fat layer leaves, and a fighter
  // shows the relief by how defined his part is against how defined the reference was (sculpt.js definedFrom, definedTo: the
  // fat over which a muscle's edges go). Eight rounds spread over about three edges (5 cm): a muscle's breadth.
  smoothPasses: 8,
  smoothStep: 0.5,
  smoothBack: -0.53,
  // The least a point may come in towards its axis, as a share of its scaled distance (a far thinner build than the reference
  // takes off a layer thicker than a point's own depth where the mesh lies inside its ring: two parts overlapping at a joint).
  leastShare: 0.3,
};

const TAU = Math.PI * 2;
const decoded = new Map();

/** Bytes from base64, in Node and the page alike. */
function baseBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** A sex's base mesh, decoded once: { parts, joints, reference, count, positions (units of height), triangles, part, part2, blend, starved }. */
export function baseBodyMesh(sex, crowd = false) {
  const key = `${sex}|${crowd}`;
  if (decoded.has(key)) return decoded.get(key);
  const data = BASE_BODY_DATA[sex];
  const packed = data.meshes[crowd ? 'crowd' : 'full'];
  const ints = new Int16Array(baseBytes(packed.positions).buffer);
  const mesh = {
    parts: data.parts,
    joints: data.joints,
    reference: data.reference,
    count: packed.count,
    positions: Float32Array.from(ints, (value) => value / BASE_BODY_DATA.positionScale),
    triangles: new Uint16Array(baseBytes(packed.triangles).buffer),
    part: baseBytes(packed.part),
    part2: baseBytes(packed.part2),
    blend: Float32Array.from(baseBytes(packed.blend), (value) => value / 255),
    starved: packed.starved ? Float32Array.from(new Int16Array(baseBytes(packed.starved).buffer), (value) => value / BASE_BODY_DATA.deltaScale) : new Float32Array(packed.count),
  };
  decoded.set(key, mesh);
  return mesh;
}

/**
 * How starved a body is, 0 to 1, for the emaciated reference's contour and its rib and spine detail (tools/blender/emaciated.py):
 * the game's own measure, the face's gaunt weight (facemorph.js: from BMI and body fat), so a normal body is untouched.
 */
export const baseStarvation = (body) => faceMorphWeights(body).gaunt;

let starvedSlopes = null;
/**
 * The emaciated reference's rib and spine slopes for the skin map's trunk tile (skintex.js adds them by `weight`), or null where
 * the body is not starved: { width, height, span, slopes (round, along per texel), weight }.
 */
export function baseStarvedDetail(body) {
  const weight = baseStarvation(body);
  const packed = BASE_BODY_DATA.starvedSlopes;
  if (weight <= 0 || !packed) return null;
  if (!starvedSlopes) {
    const bytes = new Int8Array(baseBytes(packed.slopes).buffer);
    starvedSlopes = { width: packed.width, height: packed.height, span: packed.span, slopes: Float32Array.from(bytes, (value) => (value / 127) * packed.steepest) };
  }
  return { ...starvedSlopes, weight };
}

/** A part's frame: its axis from `a` to `b`, the ring's depth axis (the loft's: `forward` square to the axis) and width axis. */
function partFrame(a, b, forward) {
  const along = vec.sub(b, a);
  const length = vec.length(along);
  const axis = vec.scale(along, 1 / length);
  const depthAxis = vec.normalize(vec.sub(forward, vec.scale(axis, vec.dot(forward, axis))));
  return { a, axis, length, depthAxis, widthAxis: vec.cross(axis, depthAxis) };
}

/**
 * A point's place on a part: t along it, its angle round the ring at t (the loft's parametric angle: 0 the front, the ring's
 * point there is depth·cos, width·sin), its share of the ring's radius, and its width-axis offset (which side of the seam).
 * `frame` the base mesh's own (its joints), `ring(t)` the reference's ring (depth, width, offset, bend).
 */
function placeOn(frame, ring, point) {
  const rel = vec.sub(point, frame.a);
  const t = vec.dot(rel, frame.axis) / frame.length;
  const r = ring(t);
  const centre = vec.add(vec.scale(frame.axis, t * frame.length), vec.scale(frame.depthAxis, r.offset));
  const out = vec.sub(rel, centre);
  const x = vec.dot(out, frame.depthAxis);
  const y = vec.dot(out, frame.widthAxis);
  const phi = Math.atan2(y, x);
  let angle = Math.atan2(r.depth * Math.sin(phi), r.width * Math.cos(phi));
  if (angle < 0) angle += TAU;
  const radius = Math.hypot(r.depth * Math.cos(angle), r.width * Math.sin(angle)) * (r.bend ? r.bend(r, angle) : 1);
  return { t, angle, out: Math.hypot(x, y), radius, x, y };
}

/**
 * A part's rings as a table (BASE_BODY.stops along [from, to]) read linearly: `part` is the loft's description of it
 * ({ a, b, forward, depth(t), width(t), offset(t), bend(ring, angle) }); the answer `(t) => { t, depth, width, offset, bend }`.
 */
function ringTable(part, from, to) {
  const count = BASE_BODY.stops;
  const span = to - from || 1;
  const rows = Array.from({ length: count + 1 }, (_, index) => {
    const t = from + (span * index) / count;
    return [part.depth(t), part.width(t), part.offset(t)];
  });
  return (t) => {
    const at = Math.min(count, Math.max(0, ((t - from) / span) * count));
    const index = Math.min(count - 1, Math.floor(at));
    const f = at - index;
    const [d0, w0, o0] = rows[index];
    const [d1, w1, o1] = rows[index + 1];
    return { t, depth: d0 + (d1 - d0) * f, width: w0 + (w1 - w0) * f, offset: o0 + (o1 - o0) * f, bend: part.bend };
  };
}

/** The mesh's neighbours (each point's, from its triangles). */
function neighboursOf(count, triangles) {
  const sets = Array.from({ length: count }, () => new Set());
  for (let corner = 0; corner < triangles.length; corner += 3) {
    const [a, b, c] = [triangles[corner], triangles[corner + 1], triangles[corner + 2]];
    sets[a].add(b).add(c);
    sets[b].add(a).add(c);
    sets[c].add(a).add(b);
  }
  return sets.map((set) => [...set]);
}

/** Taubin smoothing (BASE_BODY smooth*): the surface's relief low-passed, its volume kept. */
function smoothed(positions, neighbours) {
  let current = Float32Array.from(positions);
  const pass = (amount) => {
    const next = Float32Array.from(current);
    neighbours.forEach((list, vertex) => {
      if (!list.length) return;
      for (let axis = 0; axis < 3; axis += 1) {
        let sum = 0;
        for (const other of list) sum += current[other * 3 + axis];
        next[vertex * 3 + axis] += amount * (sum / list.length - current[vertex * 3 + axis]);
      }
    });
    current = next;
  };
  for (let round = 0; round < BASE_BODY.smoothPasses; round += 1) {
    pass(BASE_BODY.smoothStep);
    pass(BASE_BODY.smoothBack);
  }
  return current;
}

/**
 * The base mesh measured against the reference body's loft (once per sex and detail: `refParts` the loft's parts of the
 * reference, loftbody.js; `height` its standing height, m). The answer is everything a fighter's skin needs but his own rings:
 *   sources   the points to place: their two parts, blend, and (t, angle, ratio, smoothed ratio) on each part
 *   render    the points drawn: each a source, the part whose tile it is in, its t and angle there and its share round (u)
 *   triangles the drawn triangles, grouped by part (`ranges`: each part's first and last drawn point)
 */
export function measureBaseBody(mesh, refParts, height) {
  const names = mesh.parts;
  const scaled = Float32Array.from(mesh.positions, (value) => value * height);
  const joint = (name) => mesh.joints[name].map((value) => value * height);
  const frames = {};
  const rings = {};
  for (const name of names) {
    const part = refParts[name];
    frames[name] = partFrame(joint(BASE_BODY.axes[name][0]), joint(BASE_BODY.axes[name][1]), part.forward);
  }
  const relief = smoothed(scaled, neighboursOf(mesh.count, mesh.triangles));
  // Each part's span of t, from its own points, then its reference rings over it.
  const span = Object.fromEntries(names.map((name) => [name, [Infinity, -Infinity]]));
  const point = (array, vertex) => [array[vertex * 3], array[vertex * 3 + 1], array[vertex * 3 + 2]];
  for (let vertex = 0; vertex < mesh.count; vertex += 1) {
    for (const index of [mesh.part[vertex], mesh.part2[vertex]]) {
      const name = names[index];
      const frame = frames[name];
      const t = vec.dot(vec.sub(point(scaled, vertex), frame.a), frame.axis) / frame.length;
      span[name][0] = Math.min(span[name][0], t - 0.05);
      span[name][1] = Math.max(span[name][1], t + 0.05);
    }
  }
  for (const name of names) {
    if (!Number.isFinite(span[name][0])) span[name] = [0, 1];
    rings[name] = ringTable(refParts[name], span[name][0], span[name][1]);
  }
  const at = (name, position) => placeOn(frames[name], rings[name], position);

  // The sources: the mesh's own points, and the points added where a triangle is split at a seam (below).
  // (Each source's coordinates on each of its two parts: t, angle, distance out, smoothed distance out, the reference ring's radius.)
  const src = { part: [], part2: [], blend: [], coords: [], position: [], relief: [], starved: [] };
  const addSource = (part, part2, blend, position, smooth, starved) => {
    const a = at(names[part], position);
    const b = part2 === part ? a : at(names[part2], position);
    const sa = at(names[part], smooth);
    const sb = part2 === part ? sa : at(names[part2], smooth);
    src.part.push(part);
    src.part2.push(part2);
    src.blend.push(blend);
    src.coords.push(a.t, a.angle, a.out, sa.out, a.radius, b.t, b.angle, b.out, sb.out, b.radius);
    src.position.push(position);
    src.relief.push(smooth);
    src.starved.push(starved);
    return src.part.length - 1;
  };
  for (let vertex = 0; vertex < mesh.count; vertex += 1) addSource(mesh.part[vertex], mesh.part2[vertex], mesh.blend[vertex], point(scaled, vertex), point(relief, vertex), mesh.starved[vertex]);

  // The drawn points: one per source and tile (and seam side).
  const render = { source: [], part: [], t: [], angle: [], u: [] };
  const drawn = new Map();
  const draw = (source, part, place, side) => {
    const key = `${source}|${part}|${side}`;
    if (drawn.has(key)) return drawn.get(key);
    const u = side === 0 ? place.angle / TAU : side < 0 ? 0 : 1;
    render.source.push(source);
    render.part.push(part);
    render.t.push(place.t);
    render.angle.push(u * TAU);
    render.u.push(u);
    drawn.set(key, render.source.length - 1);
    return render.source.length - 1;
  };
  // A seam split's new point, shared by the two triangles on its edge.
  const splits = new Map();
  const splitPoint = (i, j, s) => {
    const key = i < j ? `${i}|${j}` : `${j}|${i}`;
    if (splits.has(key)) return splits.get(key);
    const lerp = (p, q) => p.map((value, axis) => value + (q[axis] - value) * s);
    const near = s < 0.5 ? i : j;
    const same = src.part[i] === src.part[j] && src.part2[i] === src.part2[j];
    const blend = same ? src.blend[i] + (src.blend[j] - src.blend[i]) * s : src.blend[near];
    const made = addSource(src.part[near], src.part2[near], blend, lerp(src.position[i], src.position[j]), lerp(src.relief[i], src.relief[j]), src.starved[i] + (src.starved[j] - src.starved[i]) * s);
    splits.set(key, made);
    return made;
  };
  const triangles = [];
  for (let corner = 0; corner < mesh.triangles.length; corner += 3) {
    const corners = [mesh.triangles[corner], mesh.triangles[corner + 1], mesh.triangles[corner + 2]];
    // The triangle's part: the one its points carry most of, by their blends (so the tiles meet along the blend's middle, a
    // smooth line, not round each point's own part: a jagged edge of triangles whose far points read the tile past its ends).
    const shares = new Map();
    for (const vertex of corners) {
      shares.set(src.part[vertex], (shares.get(src.part[vertex]) ?? 0) + 1 - src.blend[vertex]);
      shares.set(src.part2[vertex], (shares.get(src.part2[vertex]) ?? 0) + src.blend[vertex]);
    }
    let part = src.part[corners[0]];
    for (const [candidate, share] of shares) if (share > shares.get(part)) part = candidate;
    const name = names[part];
    const places = corners.map((vertex) => at(name, src.position[vertex]));
    const us = places.map((place) => place.angle / TAU);
    if (Math.max(...us) - Math.min(...us) <= 0.5) {
      triangles.push(...corners.map((vertex, index) => draw(vertex, part, places[index], 0)));
      continue;
    }
    // Across the seam (the front, where the angle wraps): cut on the width axis's zero, each side drawn at its end of the tile.
    const onSeam = (place) => Math.abs(place.y) < 1e-7;
    const low = [];
    const high = [];
    for (let index = 0; index < 3; index += 1) {
      const next = (index + 1) % 3;
      const [p, q] = [places[index], places[next]];
      const vertex = corners[index];
      if (onSeam(p)) {
        low.push(draw(vertex, part, p, -1));
        high.push(draw(vertex, part, p, 1));
      } else if (p.y > 0) low.push(draw(vertex, part, p, 0));
      else high.push(draw(vertex, part, p, 0));
      if (!onSeam(p) && !onSeam(q) && p.y * q.y < 0) {
        const made = splitPoint(vertex, corners[next], p.y / (p.y - q.y));
        const place = at(name, src.position[made]);
        low.push(draw(made, part, place, -1));
        high.push(draw(made, part, place, 1));
      }
    }
    for (const polygon of [low, high]) for (let index = 1; index + 1 < polygon.length; index += 1) triangles.push(polygon[0], polygon[index], polygon[index + 1]);
  }
  // Drawn points grouped by part, so each part is one run (the loft's `parts`, which coverage and the maps read).
  const order = render.source.map((_, index) => index).sort((a, b) => render.part[a] - render.part[b] || a - b);
  const remap = new Int32Array(order.length);
  order.forEach((from, to) => {
    remap[from] = to;
  });
  const pick = (array, Type) => Type.from(order, (from) => array[from]);
  const drawnPart = pick(render.part, Uint8Array);
  const ranges = {};
  drawnPart.forEach((part, index) => {
    const name = names[part];
    ranges[name] ??= [index, index + 1];
    ranges[name][1] = index + 1;
  });
  return {
    names,
    height,
    spans: span,
    sources: { count: src.part.length, part: Uint8Array.from(src.part), part2: Uint8Array.from(src.part2), blend: Float32Array.from(src.blend), coords: Float32Array.from(src.coords), starved: Float32Array.from(src.starved) },
    render: { count: order.length, source: pick(render.source, Int32Array), part: drawnPart, t: pick(render.t, Float32Array), angle: pick(render.angle, Float32Array), u: pick(render.u, Float32Array) },
    triangles: Uint32Array.from(triangles, (index) => remap[index]),
    ranges,
  };
}

/**
 * A fighter's base skin: each source point placed on his parts (`parts`, the loft's description of his: see measureBaseBody)
 * and blended across its joint; `relief(name)` how much of the modelled muscle relief his part shows (1 all of it, 0 the
 * smoothed surface); `height` his standing height (m); `starve` how starved he is (baseStarvation: the emaciated reference's
 * contour, each point's delta out along its ring, laid on by it). Returns the drawn points' positions (render order) and the sources'.
 */
export function placeBaseBody(rig, parts, relief, height, starve = 0) {
  const scale = height / rig.height;
  const { names, sources, render } = rig;
  const tables = {};
  const frames = {};
  for (const name of names) {
    const part = parts[name];
    frames[name] = partFrame(part.a, part.b, part.forward);
    tables[name] = ringTable(part, rig.spans[name][0], rig.spans[name][1]);
  }
  const shows = Object.fromEntries(names.map((name) => [name, relief(name)]));
  const placed = new Float32Array(sources.count * 3);
  const one = [0, 0, 0];
  const place = (name, t, angle, distance, smooth, refRadius, starved, out) => {
    const frame = frames[name];
    const ring = tables[name](t);
    const own = smooth + (distance - smooth) * shows[name];
    const ex = Math.cos(angle) * ring.depth;
    const ey = Math.sin(angle) * ring.width;
    const flat = Math.hypot(ex, ey) || 1e-9;
    // His ring's thickness beyond the reference's (scaled to his height), laid on in full outside the ring, by depth inside it.
    const layer = flat * (ring.bend ? ring.bend(ring, angle) : 1) - scale * refRadius;
    // A part's own swell (the trunk's belly, see loftbody.js baseBelly): out along the ring, and down, its foot hanging.
    const [swell, hang] = parts[name].swell ? parts[name].swell(t, angle) : [0, 0];
    const reach = Math.max(BASE_BODY.leastShare * scale * own, scale * own + layer * Math.min(1, own / refRadius) + starved + swell * Math.min(1, own / refRadius));
    const along = t * frame.length - hang;
    const k = reach / flat;
    for (let axis = 0; axis < 3; axis += 1) out[axis] = frame.a[axis] + frame.axis[axis] * along + frame.depthAxis[axis] * (ring.offset + ex * k) + frame.widthAxis[axis] * ey * k;
    return out;
  };
  const other = [0, 0, 0];
  for (let vertex = 0; vertex < sources.count; vertex += 1) {
    const k = vertex * 10;
    const c = sources.coords;
    const starved = sources.starved[vertex] * height * starve;
    place(names[sources.part[vertex]], c[k], c[k + 1], c[k + 2], c[k + 3], c[k + 4], starved, one);
    const blend = sources.blend[vertex];
    if (blend > 0 && sources.part2[vertex] !== sources.part[vertex]) {
      place(names[sources.part2[vertex]], c[k + 5], c[k + 6], c[k + 7], c[k + 8], c[k + 9], starved, other);
      for (let axis = 0; axis < 3; axis += 1) one[axis] += (other[axis] - one[axis]) * blend;
    }
    placed.set(one, vertex * 3);
  }
  const positions = new Float32Array(render.count * 3);
  for (let index = 0; index < render.count; index += 1) positions.set(placed.subarray(render.source[index] * 3, render.source[index] * 3 + 3), index * 3);
  return { positions, sources: placed };
}

/** The drawn points' texture coordinates: each in its part's tile at its t and share round (skindetail.js detailUv). */
export function baseBodyUvs(rig) {
  const uvs = new Float32Array(rig.render.count * 2);
  const tileOf = Object.fromEntries(rig.names.map((name) => [name, detailUv(name)]));
  for (let index = 0; index < rig.render.count; index += 1) uvs.set(tileOf[rig.names[rig.render.part[index]]]({ t: rig.render.t[index] }, rig.render.u[index]), index * 2);
  return uvs;
}
