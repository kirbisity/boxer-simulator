// The fighters' skin from the user's base meshes (body style 'base', bodystyles.js; the user's call, 2026-11-10): the modelled
// human body itself, without its head, hands and feet (the game's own cover them). The mesh (src/basebody-data.js, made by
// tools/blender/basebody.py) was modelled at one build of each sex, its `reference`; a fighter of that build gets it as
// modelled, scaled to his height, its arms turned into the rig's A-pose by the tool, and nothing else.
//
// Other builds change it gently, keeping its contour (the user's call, 2026-11-11: the model, used simply and faithfully):
//   - its joints move as the game's do: each of the mesh's own joints by how this body's bind-pose joint (rig.js bindPoints)
//     lies from the reference's, so height and frame lengthen and shorten the parts along their bones, not across; each limb
//     then runs in the model's own direction at the game's length, and the loft (clothes) and the rig are built on those
//     joints, not the rig's straight A-pose (baseBindJoints: the rig follows the model);
//   - each point is scaled out from its part's axis by a ratio, this body's ring over the reference's at its place along the
//     part (loftbody.js: the rings the plain skin is drawn on; their depth ratio fore and aft, their width ratio across, the
//     trunk's lean the difference of the two), smoothed along the part, so fat and muscle swell the modelled shape as a whole;
//   - the fat belly's dome and the starved contour are added on top, out along the point's own line from the axis;
//   - fat smooths the muscle relief modelled in the mesh (a fighter shows it by how defined he is against the reference).
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
  // A part's girth ratio is smoothed along it over this many stops either way (0.12 of the part: a ring's profile turns at the
  // loft's stops, a tenth of a part apart, and a ratio taken stop by stop would print them as bands).
  ratioSmooth: 8,
  // The forearm's skin ends at the modelled wrist, and the game's hand (wardrobe.js buildHand) is drawn on the rig's hand point,
  // the fist's middle (0.19 of height from the elbow; the model's wrist lies 0.14 from it, the anatomical 0.146 of Drillis and
  // Contini: the rig's point is right, the drawn palm short, its heel only 3.3 cm behind the point). So the forearm is drawn
  // out to `handSeat` (m per 1.8 m of height) behind the hand point, under the palm's rounded heel (its section there 2.3 by
  // 2.9 cm, a wrist's), not to the fist's middle, and the length it gains is laid on along it unevenly: `foreTaper` the share of
  // the stretch the elbow's end takes against the wrist's (the muscle bellies by the elbow keep their length best, the tendons
  // by the wrist are nearly a cylinder and take the most, so the stretch reads least).
  handSeat: 0.021,
  foreTaper: 0.5,
  // An arm's own reach (loftbody.js LOFT.fit's): this share of its ring's radius round its axis, from `armFrom` (t, above the
  // shoulder joint) down.
  armReach: 1.6, armFrom: -0.25,
  // The emaciated reference's contour is faded out over the shoulder's cap: within `starveArm[0]` of an upper arm's ring radius
  // round its axis (from armFrom down) none of it, from `starveArm[1]` (its reach, armReach) all. Its figure stood with one hand
  // on the hip and the other arm hanging (tools/blender/emaciated.py), its shoulders shrugged and turned, so the delta there is
  // its pose, not its wasting: ±2 cm lumps on a starved man's shoulders. Its collarbones and the ribs below stay.
  starveArm: [1.0, 1.6],
  // Her rib and spine detail (baseStarvedDetail) is faded where it is her pose, not her wasting: above the collarbones (`top`,
  // t of the trunk: her shrugged shoulders and turned neck printed as ridges over a starved man's shoulders), and over the
  // shoulder's cap at the sides (`side`, t, where |sin| of the angle passes `sideFrom`: those triangles are drawn in the arm's
  // tile, which has none, so a patch of ribs ended in a polygon on the back). Her free side is read mirrored for the other, so
  // the round slope flips sign across the midlines: it is eased to nothing within `midline` (|sin| of the angle, about 7 degrees,
  // 1.5 cm on a trunk) of them, where it met itself turned over as a seam down the belly.
  starveDetail: { top: [0.84, 0.95], side: [0.66, 0.8], sideFrom: 0.55, midline: 0.12 },
  // Each limb's parent at its root, and where on the parent the joint is (its t): the upper arm on the trunk at the shoulders
  // (the shoulder joint stands 0.91 of the way up the trunk: rig.js bindPoints, 0.025 of height under the neck's foot on a
  // 0.27 trunk), the forearm on the upper arm at the elbow, the thigh on the trunk at the hip joint, the shin on the thigh at the
  // knee, the neck on the trunk at its foot. ('side*' names stand for both sides, '*' the side.)
  joins: { sideUpper: ['trunk', 0.91], sideFore: ['*Upper', 1], sideThigh: ['trunk', 0], sideShin: ['*Thigh', 1], neck: ['trunk', 1] },
  // The ease from the parent's ratio into the part's own: from `joinRatio[0]` to `[1]` (t of the part).
  joinRatio: [-0.25, 0.3],
};

const BASE_TAU = Math.PI * 2;
const baseDecoded = new Map();

/** Whether the base meshes are here (a build may leave them out: tools/custom.js; the style then draws the loft's own skin). */
export const baseBodyAvailable = () => Boolean(BASE_BODY_DATA?.male);

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
  if (baseDecoded.has(key)) return baseDecoded.get(key);
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
  baseDecoded.set(key, mesh);
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
  const packed = BASE_BODY_DATA?.starvedSlopes;
  if (weight <= 0 || !packed) return null;
  if (!starvedSlopes) {
    const bytes = new Int8Array(baseBytes(packed.slopes).buffer);
    const slopes = Float32Array.from(bytes, (value) => (value / 127) * packed.steepest);
    const { width, height, span } = packed;
    const fade = BASE_BODY.starveDetail;
    const smooth = (from, to, x) => {
      const u = Math.min(1, Math.max(0, (x - from) / (to - from)));
      return u * u * (3 - 2 * u);
    };
    for (let row = 0; row < height; row += 1) {
      const t = span[0] + ((span[1] - span[0]) * row) / (height - 1);
      for (let column = 0; column < width; column += 1) {
        const angle = (Math.PI * 2 * column) / (width - 1);
        const side = Math.abs(Math.sin(angle));
        const keep = (1 - smooth(fade.top[0], fade.top[1], t)) * (1 - smooth(fade.sideFrom, 1, side) * smooth(fade.side[0], fade.side[1], t));
        // (The round slope eased to nothing at the midlines, front and back: Math.abs(sin) the distance off them.)
        const midline = smooth(0, fade.midline, side);
        const at = (row * width + column) * 2;
        slopes[at] *= keep * midline;
        slopes[at + 1] *= keep;
      }
    }
    starvedSlopes = { width, height, span, slopes };
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
  if (angle < 0) angle += BASE_TAU;
  const radius = Math.hypot(r.depth * Math.cos(angle), r.width * Math.sin(angle)) * (r.bend ? r.bend(r, angle) : 1);
  return { t, angle, out: Math.hypot(x, y), radius, x, y };
}

/** A point's place on a part's own axis line: [t along, out fore and aft (the depth axis), out across (the width axis)]. */
function axisCoords(frame, point) {
  const rel = vec.sub(point, frame.a);
  const t = vec.dot(rel, frame.axis) / frame.length;
  const out = vec.sub(rel, vec.scale(frame.axis, t * frame.length));
  return [t, vec.dot(out, frame.depthAxis), vec.dot(out, frame.widthAxis)];
}

/** A part's ring profiles sampled at BASE_BODY.stops over [from, to]: [depth, width, offset] rows. */
function ringRows(part, from, to) {
  const count = BASE_BODY.stops;
  return Array.from({ length: count + 1 }, (_, index) => {
    const t = from + ((to - from) * index) / count;
    return [part.depth(t), part.width(t), part.offset(t)];
  });
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
export function measureBaseBody(mesh, refParts, height, refJoints) {
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
  // (Each source's coordinates on each of its two parts, on the part's own axis line: t, out fore and aft, out across; then the
  // same for the smoothed surface.)
  const src = { part: [], part2: [], blend: [], coords: [], position: [], relief: [], starved: [] };
  const addSource = (part, part2, blend, position, smooth, starved) => {
    const on = (index, point) => axisCoords(frames[names[index]], point);
    src.part.push(part);
    src.part2.push(part2);
    src.blend.push(blend);
    src.coords.push(...on(part, position), ...on(part, smooth), ...on(part2, position), ...on(part2, smooth));
    src.position.push(position);
    src.relief.push(smooth);
    src.starved.push(starved);
    return src.part.length - 1;
  };
  // (Each point's starved delta faded over the shoulder's cap: BASE_BODY.starveArm.)
  const starveKeep = (p) => {
    let keep = 1;
    for (const name of ['lUpper', 'rUpper']) {
      const [t, x, y] = axisCoords(frames[name], p);
      if (t < BASE_BODY.armFrom) continue;
      const at = Math.max(0, Math.min(1, t));
      const ring = refParts[name];
      const d = Math.hypot(x, y) / Math.max(ring.depth(at), ring.width(at));
      const [inner, outer] = BASE_BODY.starveArm;
      const u = Math.min(1, Math.max(0, (d - inner) / (outer - inner)));
      keep = Math.min(keep, u * u * (3 - 2 * u));
    }
    return keep;
  };
  for (let vertex = 0; vertex < mesh.count; vertex += 1) addSource(mesh.part[vertex], mesh.part2[vertex], mesh.blend[vertex], point(scaled, vertex), point(relief, vertex), mesh.starved[vertex] * starveKeep(point(scaled, vertex)));

  // The drawn points: one per source and tile (and seam side).
  const render = { source: [], part: [], t: [], angle: [], u: [] };
  const drawn = new Map();
  const draw = (source, part, place, side) => {
    const key = `${source}|${part}|${side}`;
    if (drawn.has(key)) return drawn.get(key);
    const u = side === 0 ? place.angle / BASE_TAU : side < 0 ? 0 : 1;
    render.source.push(source);
    render.part.push(part);
    render.t.push(place.t);
    render.angle.push(u * BASE_TAU);
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
  // Which upper arm's reach (BASE_BODY.armReach of its ring's radius round its axis, from armFrom above the joint) holds all of
  // some points: that arm's part index, or null.
  const armTile = (points) => {
    for (const name of ['lUpper', 'rUpper']) {
      const frame = frames[name];
      const ring = refParts[name];
      const within = points.every((p) => {
        const [t, x, y] = axisCoords(frame, p);
        const at = Math.max(BASE_BODY.armFrom, Math.min(1, t));
        return t >= BASE_BODY.armFrom && Math.hypot(x, y) < BASE_BODY.armReach * Math.max(ring.depth(Math.max(0, at)), ring.width(Math.max(0, at)));
      });
      if (within) return names.indexOf(name);
    }
    return null;
  };
  // First each triangle's part and whether it crosses its part's seam (the points the seams are cut at made then), then the
  // triangles drawn: a triangle that does not cross a seam but has an edge cut by its neighbour's takes the cut point too, so the
  // surface stays closed (a crack along the seam otherwise: a dark slash where the inside shows).
  const onSeam = (place) => Math.abs(place.y) < 1e-7;
  const edgeKey = (i, j) => (i < j ? `${i}|${j}` : `${j}|${i}`);
  const faces = [];
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
    // (A trunk triangle wholly within an arm's own reach, the shoulder's cap, is drawn in that arm's tile: the trunk's paints
    // ribs and the flank there.)
    if (names[part] === 'trunk') {
      const arm = armTile(corners.map((vertex) => src.position[vertex]));
      if (arm !== null) part = arm;
    }
    const name = names[part];
    const places = corners.map((vertex) => at(name, src.position[vertex]));
    const us = places.map((place) => place.angle / BASE_TAU);
    const crosses = Math.max(...us) - Math.min(...us) > 0.5;
    if (crosses) {
      for (let index = 0; index < 3; index += 1) {
        const [p, q] = [places[index], places[(index + 1) % 3]];
        if (!onSeam(p) && !onSeam(q) && p.y * q.y < 0) splitPoint(corners[index], corners[(index + 1) % 3], p.y / (p.y - q.y));
      }
    }
    faces.push({ corners, part, name, places, crosses });
  }
  const triangles = [];
  for (const { corners, part, name, places, crosses } of faces) {
    if (!crosses) {
      // (With any edge's cut point drawn in, at its place in this triangle's own tile.)
      const polygon = [];
      for (let index = 0; index < 3; index += 1) {
        polygon.push(draw(corners[index], part, places[index], 0));
        const cut = splits.get(edgeKey(corners[index], corners[(index + 1) % 3]));
        if (cut !== undefined) polygon.push(draw(cut, part, at(name, src.position[cut]), 0));
      }
      for (let index = 1; index + 1 < polygon.length; index += 1) triangles.push(polygon[0], polygon[index], polygon[index + 1]);
      continue;
    }
    // Across the seam (the front, where the angle wraps): cut on the width axis's zero, each side drawn at its end of the tile.
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
      const cut = splits.get(edgeKey(vertex, corners[next]));
      if (cut !== undefined) {
        const place = at(name, src.position[cut]);
        // (A cut point on an edge that does not cross this triangle's seam, made by a neighbour in another tile, is drawn on
        // the side its own place falls.)
        if (!onSeam(p) && !onSeam(q) && p.y * q.y < 0) {
          low.push(draw(cut, part, place, -1));
          high.push(draw(cut, part, place, 1));
        } else (place.y > 0 ? low : high).push(draw(cut, part, place, 0));
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
    // The mesh's own joints (at the reference's height), the reference's bind-pose joints, and its rings along each part.
    joints: Object.fromEntries(Object.keys(mesh.joints).map((name) => [name, joint(name)])),
    refJoints,
    refRows: Object.fromEntries(names.map((name) => [name, ringRows(refParts[name], span[name][0], span[name][1])])),
    sources: { count: src.part.length, part: Uint8Array.from(src.part), part2: Uint8Array.from(src.part2), blend: Float32Array.from(src.blend), coords: Float32Array.from(src.coords), starved: Float32Array.from(src.starved) },
    render: { count: order.length, source: pick(render.source, Int32Array), part: drawnPart, t: pick(render.t, Float32Array), angle: pick(render.angle, Float32Array), u: pick(render.u, Float32Array) },
    triangles: Uint32Array.from(triangles, (index) => remap[index]),
    ranges,
  };
}

/**
 * The joints a fighter's base skin is placed on and the loft and the rig are built on (the rig follows the model). `rig` the
 * measured mesh (measureBaseBody), `joints` his bind-pose joints (rig.js bindPoints, by name), `height` his standing height (m).
 *   - Each of the mesh's joints is moved as his is from the reference's (height and frame lengthen and shorten the parts along
 *     their bones, not across).
 *   - Each limb (and the neck to the head) then runs from its root in the model's own direction, at the game's own length: the
 *     bones lie along the skin's own axes, so a shin ends at its foot and a sleeve's rings are the arm's (the model's legs slant
 *     back to an ankle 9.5 cm behind the rig's, its hips stand 2 cm wider: rings on the rig's line stood off the skin by that).
 *   - `bind`: the same skeleton with every chain moved onto the rig's own root (pelvis, hips, shoulders, neck), which is where
 *     the physics holds them: the skin is bound to it, so in play a limb's skin keeps its place beside the trunk's however the
 *     bones turn (bound on the model's roots, a thigh would be carried 2 cm in to the rig's hip).
 * Returns { loft, skin, bind } (joints by name; `skin` has the forearm end at the modelled wrist, not the hand point) and
 * `reach` (each forearm's skin drawn out to the hand, m: BASE_BODY.handSeat).
 */
export function baseBindJoints(rig, joints, height) {
  const moved = Object.fromEntries(Object.keys(rig.joints).map((name) => [name, vec.add(rig.joints[name], vec.sub(joints[name], rig.refJoints[name]))]));
  const loft = { ...moved };
  const skin = {};
  const reach = {};
  // A chain from its root: each next joint in the model's direction at the rig's length.
  const chain = (names) => {
    for (let index = 1; index < names.length; index += 1) {
      const [from, to] = [names[index - 1], names[index]];
      loft[to] = vec.add(loft[from], vec.scale(vec.normalize(vec.sub(moved[to], moved[from])), vec.length(vec.sub(joints[to], joints[from]))));
    }
  };
  chain(['neck', 'head']);
  for (const side of ['l', 'r']) {
    chain([`${side}Shoulder`, `${side}Elbow`, `${side}Hand`]);
    chain([`${side}Hip`, `${side}Knee`, `${side}Foot`]);
  }
  Object.assign(skin, loft);
  for (const side of ['l', 'r']) {
    const [elbow, hand] = [loft[`${side}Elbow`], loft[`${side}Hand`]];
    const along = vec.normalize(vec.sub(hand, elbow));
    const modelled = vec.length(vec.sub(moved[`${side}Hand`], moved[`${side}Elbow`]));
    skin[`${side}Hand`] = vec.add(elbow, vec.scale(along, modelled));
    reach[`${side}Fore`] = Math.max(0, vec.length(vec.sub(hand, elbow)) - (BASE_BODY.handSeat * height) / 1.8 - modelled);
  }
  // Each chain carried onto the rig's root.
  const bind = { ...loft };
  const roots = { pelvis: ['pelvis'], neck: ['neck', 'head'] };
  for (const side of ['l', 'r']) {
    roots[`${side}Shoulder`] = [`${side}Shoulder`, `${side}Elbow`, `${side}Hand`];
    roots[`${side}Hip`] = [`${side}Hip`, `${side}Knee`, `${side}Foot`];
  }
  for (const [root, names] of Object.entries(roots)) {
    const shift = vec.sub(joints[root], loft[root]);
    for (const name of names) bind[name] = vec.add(loft[name], shift);
  }
  return { loft, skin, bind, reach };
}

/**
 * A fighter's base skin: each source point placed on his parts and blended across its joint. `parts` the loft's description of
 * his rings (see measureBaseBody), `joints` the joints it is placed on (baseBindJoints' `skin`), `relief(name)` how much of the
 * modelled muscle relief his part shows (1 all of it, 0 the smoothed surface), `height` his standing height (m), `starve` how
 * starved he is (baseStarvation: the emaciated reference's contour, each point's delta out along its line, laid on by it),
 * `foreReach` each forearm's length drawn out past the modelled wrist (baseBindJoints).
 * Returns the drawn points' positions (render order) and the sources'.
 */
export function placeBaseBody(rig, parts, relief, height, starve = 0, joints = rig.joints, foreReach = {}) {
  const { names, sources, render } = rig;
  const frames = {};
  const ratios = {};
  const count = BASE_BODY.stops;
  for (const name of names) {
    const part = parts[name];
    frames[name] = partFrame(joints[BASE_BODY.axes[name][0]], joints[BASE_BODY.axes[name][1]], part.forward);
    const [from, to] = rig.spans[name];
    const own = ringRows(part, from, to);
    const raw = own.map(([depth, width, offset], index) => {
      const [d0, w0, o0] = rig.refRows[name][index];
      return [depth / (d0 || 1e-6), width / (w0 || 1e-6), offset - o0];
    });
    // Smoothed along the part (BASE_BODY.ratioSmooth): a moving mean, the ends held.
    const smooth = raw.map((_, index) => {
      const sum = [0, 0, 0];
      let weight = 0;
      for (let k = -BASE_BODY.ratioSmooth; k <= BASE_BODY.ratioSmooth; k += 1) {
        const row = raw[Math.min(count, Math.max(0, index + k))];
        for (let axis = 0; axis < 3; axis += 1) sum[axis] += row[axis];
        weight += 1;
      }
      return sum.map((value) => value / weight);
    });
    ratios[name] = (t) => {
      const at = Math.min(count, Math.max(0, ((t - from) / (to - from || 1)) * count));
      const index = Math.min(count - 1, Math.floor(at));
      const f = at - index;
      return smooth[index].map((value, axis) => value + (smooth[index + 1][axis] - value) * f);
    };
  }
  // Across each joint the ratio eases from the parent's (at the joint, its depth and width ratios' mean all round) into the
  // part's own over BASE_BODY.joinRatio (t of the part): the shoulder's cap swells with the trunk across the shoulders, not as
  // the fat upper arm below it does, so it keeps the deltoid's curve (a fat arm's own ratio there stood the cap out as a shelf).
  const own = { ...ratios };
  for (const [name, [parent, at]] of Object.entries(BASE_BODY.joins)) {
    const partName = name.startsWith('side') ? null : name;
    for (const side of partName ? [''] : ['l', 'r']) {
      const child = partName ?? `${side}${name.slice(4)}`;
      const from = parent.replace('*', side);
      if (!own[child] || !own[from]) continue;
      const [kx, ky] = own[from](at);
      const joint = (kx + ky) / 2;
      const [low, high] = BASE_BODY.joinRatio;
      ratios[child] = (t) => {
        const mine = own[child](t);
        const u = Math.min(1, Math.max(0, (t - low) / (high - low)));
        const w = u * u * (3 - 2 * u);
        return [joint + (mine[0] - joint) * w, joint + (mine[1] - joint) * w, mine[2] * w];
      };
    }
  }
  // The reference's ring semi-axes along each part (depth, width), read as the ratios are.
  const refRing = Object.fromEntries(names.map((name) => {
    const [from, to] = rig.spans[name];
    const rows = rig.refRows[name];
    return [name, (t) => {
      const at = Math.min(count, Math.max(0, ((t - from) / (to - from || 1)) * count));
      const index = Math.min(count - 1, Math.floor(at));
      const f = at - index;
      return [0, 1].map((axis) => rows[index][axis] + (rows[index + 1][axis] - rows[index][axis]) * f);
    }];
  }));
  const shows = Object.fromEntries(names.map((name) => [name, relief(name)]));
  const placed = new Float32Array(sources.count * 3);
  const place = (name, c, k, starved, out) => {
    const frame = frames[name];
    const share = shows[name];
    const t = c[k + 3] + (c[k] - c[k + 3]) * share;
    const x = c[k + 4] + (c[k + 1] - c[k + 4]) * share;
    const y = c[k + 5] + (c[k + 2] - c[k + 5]) * share;
    const [kx, ky, lean] = ratios[name](t);
    // Scaled by the ratio out to the reference ring's own reach; past it (the shoulder's cap far out on the trunk's narrow top
    // ring, a buttock behind the hips') a point moves out as the ring's surface does, not by a share of its whole distance: the
    // part swells as a whole, and its outlying forms ride on the swell rather than flying out with it (square, boxy shoulders).
    const [refDepth, refWidth] = refRing[name](t);
    const reach = (value, ring) => Math.max(-ring, Math.min(ring, value));
    let px = x + (kx - 1) * reach(x, refDepth) + lean;
    let py = y + (ky - 1) * reach(y, refWidth);
    // Added along the point's own line out from the axis: the starved contour, a part's own swell (the trunk's belly, see
    // loftbody.js baseBelly) with its foot hanging down.
    const [swell, hang] = parts[name].swell ? parts[name].swell(t, Math.atan2(y, x)) : [0, 0];
    const length = Math.hypot(px, py) || 1e-9;
    const add = starved + swell;
    px += (px / length) * add;
    py += (py / length) * add;
    // (A forearm drawn out to the hand, `foreReach` m more than modelled: the stretch at t is (taper + (2 - 2·taper)·t) of the mean,
    // its integral below; past the wrist the whole of it.)
    const more = foreReach[name] ?? 0;
    const taper = BASE_BODY.foreTaper;
    const u = Math.min(1, Math.max(0, t));
    const along = t * frame.length + more * (taper * u + (1 - taper) * u * u) - hang;
    for (let axis = 0; axis < 3; axis += 1) out[axis] = frame.a[axis] + frame.axis[axis] * along + frame.depthAxis[axis] * px + frame.widthAxis[axis] * py;
    return out;
  };
  const one = [0, 0, 0];
  const other = [0, 0, 0];
  for (let vertex = 0; vertex < sources.count; vertex += 1) {
    const k = vertex * 12;
    const c = sources.coords;
    const starved = sources.starved[vertex] * height * starve;
    place(names[sources.part[vertex]], c, k, starved, one);
    const blend = sources.blend[vertex];
    if (blend > 0 && sources.part2[vertex] !== sources.part[vertex]) {
      place(names[sources.part2[vertex]], c, k + 6, starved, other);
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
