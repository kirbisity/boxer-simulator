// Draws the body-style comparison sheet (tools/bodysheet.html): for a style,
// the progression of tools/bodysheet-cast.js, in grey clay (or a game skin
// tone) on grey, under one light rig and one camera for every style, front /
// rear three-quarter / side (and face views). Reads its options from the query
// string, builds the sheet in a 2D canvas, posts it to the dev server as
// shots/<name>.png and leaves the measurements in window.__sheet.stats (and
// the page title).
//
// Query: style, sex, name, title, cost, scale, rows (front,rear,side,face,face3q),
// cols, crop (torso, chest, legs), mat (standard, lambert, toon, physical: how
// the skin is lit: the game's probe-lite look uses lambert), tone (clay or a
// key of SKIN_TONES), pose (rest: arms lowered; bind: the A-pose the skin is
// built in; game: arms lowered on the physics' own skeleton; stance: that on bent knees turned out; bend90, bend130, raised: the
// elbows bent or the arms raised), dqs (off: a base-mesh body skinned by linear blending, not dual quaternions), cell (the flesh grid), relief (bump strength), perf (soft-shell
// cost), fighter (knight, gambeson, helmet-fat, helmet-thin: one dressed
// fighter instead of the progression), motion (run, land, side: each chosen
// build's fat masses through a move, fatslosh.js, a column per moment), outfit
// (an outfits.js kind: the progression dressed in it), mark (roles drawn in loud colours).

/* global THREE */
import { buildBody, P, PRESETS } from '../src/body.js';
import { BONES, BONE, bindPoints, boneFrames, frameMatrix } from '../src/rig.js';
import { buildSkinMesh, skinTexturesNow, styleSpec } from '../src/bodystyles.js';
import { compositionKey, skinTextureCache } from '../src/skintex.js';
import { buildHead } from '../src/face.js';
import { buildFootwear, buildHand, buildHeadgear, dressFor, roleColors, steelMaterial } from '../src/wardrobe.js';
import { progression } from './bodysheet-cast.js';
import { applySkinTextures } from '../src/skintex.js';
import { detailMaterial } from '../src/skindetail.js';
import { SKIN_TONES } from '../src/skintones.js';
import { FLESH } from '../src/fleshbody.js';
import { FACE_MORPH } from '../src/facemorph.js';
import { SoftShell } from '../src/soft.js';
import { FatSlosh } from '../src/fatslosh.js';
import { surface } from '../src/toon.js';
import { dualQuaternionSkinning } from '../src/dqskin.js';
import { BASE_BODY } from '../src/basebody.js';
import { elbowClearOfTrunk, restArmAngle } from '../src/pose.js';
import { trunkAxes } from '../src/joints.js';
// `shoulder` (A..E, D1, D2, none) picks a base-body shoulder design (basebody.js BASE_BODY.shoulder; D2 by default).
if (new URLSearchParams(location.search).get('shoulder')) BASE_BODY.shoulder = new URLSearchParams(location.search).get('shoulder') === 'none' ? null : new URLSearchParams(location.search).get('shoulder');

const query = new URLSearchParams(location.search);
const STYLE = query.get('style') ?? 'lofted';
const SEX = query.get('sex') ?? 'male';
const NAME = query.get('name') ?? `${STYLE}-${SEX}`;
const SCALE = Number(query.get('scale') ?? 1);
const ROWS = (query.get('rows') ?? 'front,rear,side').split(',');
const ONLY = query.get('cols')?.split(',') ?? null;
const CROP = query.get('crop');
const MAT = query.get('mat') ?? 'standard';
const TONE = query.get('tone') ?? 'clay';
const POSE = query.get('pose') ?? 'rest';
// `motion`: the fat masses through a move (fatslosh.js), the trunk's frame carried along a path; each build a run of columns.
const MOTION = query.get('motion');
// The moves, as the frame's path (m, from where it stands) and the moments drawn (s). Stepped at `rate` Hz.
//   run   a running stride: the body's middle rising and falling 4 cm either way at the step rate, 2.8 Hz (170 steps a minute;
//         a runner's centre of mass travels 6-10 cm up and down, Cavagna 1976), swaying 1.5 cm side to side at half of it
//   land  a jump's fall from its height (0.5 m: 3.1 m/s at touchdown) stopped in 0.12 s by the knees, then standing
//   side  a sidestep: 8 m/s² sideways for 0.15 s, the same back, then standing
const MOVES = {
  run: { path: (t) => [0, 0.04 * Math.sin(2 * Math.PI * 2.8 * t), 0.015 * Math.sin(Math.PI * 2.8 * t)], from: 2, moments: [0, 0.09, 0.18, 0.27, 0.36, 0.45, 0.54, 0.63] },
  land: {
    path: (t) => {
      const g = 9.81;
      const fall = 0.32;
      const stop = 0.12;
      const v = g * fall;
      if (t < 0) return [0, 0.5, 0];
      if (t < fall) return [0, 0.5 - 0.5 * g * t * t, 0];
      const s = Math.min(t - fall, stop);
      const a = v / stop;
      return [0, 0.5 - 0.5 * g * fall * fall - (v * s - 0.5 * a * s * s), 0];
    },
    from: -0.5, moments: (query.get('moments') ?? '0.2,0.32,0.38,0.44,0.52,0.62,0.76,0.95').split(',').map(Number),
  },
  side: {
    path: (t) => {
      const a = 8;
      const push = 0.15;
      const z = t < 0 ? 0 : t < push ? 0.5 * a * t * t : t < 2 * push ? 0.5 * a * push * push + a * push * (t - push) - 0.5 * a * (t - push) ** 2 : a * push * push;
      return [0, 0, z];
    },
    from: -0.5, moments: [0.05, 0.15, 0.25, 0.32, 0.4, 0.5, 0.65, 0.85],
  },
};
const MOTION_RATE = 240;
// `ruler`: the landmark heights measured on the emaciated reference (fractions of standing height), drawn over every cell.
const RULER = query.get('ruler') !== null;
const RULER_MARKS = [[1, 'crown'], [0.81, 'clavicles / notch'], [0.69, 'xiphoid'], [0.64, 'rib margin'], [0.6, 'waist'], [0.58, 'iliac crest'], [0.49, 'crotch']];
// The flesh style's grid (m), to compare resolutions.
if (query.get('cell')) FLESH.cell = Number(query.get('cell'));

// One clay for every body, one grey behind it (the references': a mid-dark neutral).
const SHEET = {
  background: 0x5c5c5c,
  clay: TONE === 'clay' ? 0xa6a29c : SKIN_TONES[TONE] ?? 0xc58c64,
  trunks: 0x2f3440,
  waistband: 0x8d93a3,
  cell: [340, 620],
  // Perspective like a long lens: little foreshortening, the whole 2 m figure in the cell.
  fov: 20,
  distance: 6.1,
  target: [0, 0.97, 0],
  // Camera bearings from the fighter's front (+x), degrees.
  views: { front: 0, rear: 215, back: 180, side: 90, face: 0, face3q: 38, front3q: 35, high: 145 },
  // Views seen from above (m the camera is raised over the target, at the full-body distance): the shoulders' tops.
  raised: { high: 1.6 },
  header: 78,
  labels: 62,
  // How far from the vertical the arms hang in the rest pose (degrees; the skin is built at 25).
  armRest: 11,
  // The stance pose (pose=stance): sunk 8 cm on the knees, which turn out by half as much again sideways as forward.
  stance: { sink: 0.08, out: 0.5 },
};

const stats = [];
window.__sheet = { stats, done: false };

// ---- Materials ------------------------------------------------------------------

/** The skin's material, lit as the chosen look lights it. */
function skinMaterial(skinning = true) {
  const base = { color: 0xffffff, vertexColors: true, skinning };
  if (MAT === 'lambert') return new THREE.MeshLambertMaterial(base);
  if (MAT === 'toon') return surface(0xffffff, base);
  if (MAT === 'physical') return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.6, metalness: 0, sheen: new THREE.Color(0xff9a7a) });
  return new THREE.MeshStandardMaterial({ ...base, roughness: 0.82, metalness: 0 });
}

/** A plain material for what is not the skin mesh (head, hands, feet), lit as the skin is. */
function plainMaterial() {
  if (MAT === 'lambert') return new THREE.MeshLambertMaterial({ color: SHEET.clay });
  if (MAT === 'toon') return surface(SHEET.clay);
  // As rough as the textured skins' mean, so a head and a body side by side are lit alike.
  return new THREE.MeshStandardMaterial({ color: SHEET.clay, roughness: styleSpec(STYLE).tex?.upgrade ? 0.62 : 0.82 });
}

/** Per-vertex colours of a built body: the skin (clay or a tone), grey trunks and top, the outfit's own colours elsewhere. */
function paint(built, body) {
  const clay = new THREE.Color(SHEET.clay);
  const count = built.positions.length / 3;
  const colors = new Float32Array(count * 3);
  const roles = built.regions ? roleColors(dressFor(body.inputs, 0x888888), clay) : null;
  const plain = { skin: clay, kit: new THREE.Color(SHEET.trunks), top: new THREE.Color(SHEET.trunks), band: new THREE.Color(SHEET.waistband), trim2: new THREE.Color(SHEET.trunks), trim: new THREE.Color(SHEET.trunks) };
  const clothed = body.inputs.outfit.kind !== 'mma';
  // `mark`: these roles (comma-separated) drawn in loud debugging colours, to see which layer is where.
  const marked = (query.get('mark') ?? '').split(',').filter(Boolean);
  const loud = [0xff00ff, 0x00ffff, 0xffff00, 0x00ff00].map((hex) => new THREE.Color(hex));
  built.regions?.forEach((region, vertex) => {
    const mark = marked.indexOf(region);
    const color = mark >= 0 ? loud[mark % loud.length] : (clothed ? roles[region] : plain[region] ?? roles[region]) ?? clay;
    colors.set([color.r, color.g, color.b], vertex * 3);
  });
  if (!built.regions) for (let vertex = 0; vertex < count; vertex += 1) colors.set([clay.r, clay.g, clay.b], vertex * 3);
  // A style that paints its skin per vertex (flesh-lite) says how much each skin vertex is darkened or tinted.
  if (built.tint) {
    for (let vertex = 0; vertex < count; vertex += 1) {
      if (built.regions?.[vertex] !== 'skin') continue;
      for (let axis = 0; axis < 3; axis += 1) colors[vertex * 3 + axis] *= built.tint[vertex * 3 + axis];
    }
  }
  return colors;
}

function geometryOf(built, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(built.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(built.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(built.skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(built.skinWeight, 4));
  geometry.setIndex(new THREE.BufferAttribute(built.indices, 1));
  // The textured styles' coordinates: one set for the albedo, bump and roughness maps, the same again for the occlusion map.
  if (built.uvs) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(built.uvs, 2));
    geometry.setAttribute('uv2', new THREE.BufferAttribute(built.uvs, 2));
  }
  return geometry;
}

// ---- Pose ---------------------------------------------------------------------------

/** The particles with the arms lowered to `angle` degrees from the vertical (hanging, hands at the sides). */
function restPoints(points, body, degrees) {
  const posed = points.map((point) => [...point]);
  // (PROOF OF CONCEPT, shoulder-poc: the game's own rest hang, the angle that just clears his trunk's side: pose.js restArmAngle.)
  const angle = degrees === SHEET.armRest ? restArmAngle(body) : (degrees * Math.PI) / 180;
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    const shoulder = points[P[`${side}Shoulder`]];
    const upper = body.lengths.upperArm;
    const fore = body.lengths.forearmToFist;
    const down = [0.04, -Math.cos(angle), sign * Math.sin(angle)];
    const length = Math.hypot(...down);
    const unit = down.map((value) => value / length);
    posed[P[`${side}Elbow`]] = shoulder.map((value, axis) => value + unit[axis] * upper);
    posed[P[`${side}Hand`]] = shoulder.map((value, axis) => value + unit[axis] * (upper + fore));
  }
  return posed;
}

/**
 * The arms posed on the physics' own skeleton (rig.js bindPoints), for the skinning's joints: `bend90`, `bend130` the upper
 * arms hanging (SHEET.armRest) and the elbows bent forward by that many degrees; `raised` the arms straight out in front.
 */
function armPoints(points, body, kind) {
  const posed = points.map((point) => [...point]);
  const unit = (v) => {
    const length = Math.hypot(...v);
    return v.map((value) => value / length);
  };
  const rest = restArmAngle(body);
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    const shoulder = points[P[`${side}Shoulder`]];
    const upper = body.lengths.upperArm;
    const fore = body.lengths.forearmToFist;
    const down = unit([0.04, -Math.cos(rest), sign * Math.sin(rest)]);
    const upperDir = kind === 'raised' ? unit([1, -0.05, sign * 0.15]) : down;
    const bend = kind === 'raised' ? 0 : (Number(kind.slice(4)) * Math.PI) / 180;
    // (Bent forward in the plane of the hanging arm and the forward axis: down turned towards +x by `bend`.)
    const foreDir = unit(down.map((value, axis) => value * Math.cos(bend) + [1, 0, 0][axis] * Math.sin(bend)));
    const elbow = shoulder.map((value, axis) => value + upperDir[axis] * upper);
    posed[P[`${side}Elbow`]] = elbow;
    posed[P[`${side}Hand`]] = elbow.map((value, axis) => value + (kind === 'raised' ? upperDir : foreDir)[axis] * fore);
  }
  return posed;
}

/**
 * A fight stance with the guard up (pose=guard): the stance's legs, each upper arm forward, down and a little out, each forearm
 * up and in, the fists before the chin.
 */
function guardPoints(points, body) {
  const posed = stancePoints(points, body);
  const unit = (v) => {
    const length = Math.hypot(...v);
    return v.map((value) => value / length);
  };
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    const shoulder = posed[P[`${side}Shoulder`]];
    const upperDir = unit([0.55, -0.75, sign * 0.3]);
    const foreDir = unit([0.35, 0.9, -sign * 0.3]);
    let elbow = shoulder.map((value, axis) => value + upperDir[axis] * body.lengths.upperArm);
    const hand = elbow.map((value, axis) => value + foreDir[axis] * body.lengths.forearmToFist);
    // (The elbow clear of the trunk's side, as the game holds a guard: pose.js elbowClearOfTrunk.)
    elbow = elbowClearOfTrunk(body, trunkAxes(posed[P.pelvis], posed[P.neck], posed[P.lShoulder], posed[P.rShoulder]), posed[P.pelvis], shoulder, elbow, hand);
    posed[P[`${side}Elbow`]] = elbow;
    posed[P[`${side}Hand`]] = hand;
  }
  return posed;
}

/**
 * A fighter's stance on the physics' own skeleton (rig.js bindPoints), arms lowered: the body sunk `stance.sink` (m) on bent knees,
 * each knee pushed forward and turned out by `stance.out` (its share sideways against forward), the feet where they stood; the
 * legs' lengths kept. A stance shows how the skin follows the bones where they bend and turn (the knee and the thigh's roll).
 */
function stancePoints(points, body) {
  const posed = restPoints(points, body, SHEET.armRest);
  const sink = SHEET.stance.sink;
  for (const name of Object.keys(P)) if (!/Foot$/.test(name)) posed[P[name]] = [posed[P[name]][0], posed[P[name]][1] - sink, posed[P[name]][2]];
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    const hip = posed[P[`${side}Hip`]];
    const foot = posed[P[`${side}Foot`]];
    const [upper, lower] = [body.lengths.thigh, body.lengths.shank];
    const span = foot.map((value, axis) => value - hip[axis]);
    const reach = Math.hypot(...span);
    const unit = span.map((value) => value / reach);
    const a = (upper * upper - lower * lower + reach * reach) / (2 * reach);
    const h = Math.sqrt(Math.max(0, upper * upper - a * a));
    const bend = [1, 0, sign * SHEET.stance.out];
    const dot = bend.reduce((sum, value, axis) => sum + value * unit[axis], 0);
    const across = bend.map((value, axis) => value - dot * unit[axis]);
    const size = Math.hypot(...across);
    posed[P[`${side}Knee`]] = hip.map((value, axis) => value + unit[axis] * a + (across[axis] / size) * h);
  }
  return posed;
}

/** A skinned mesh over the rig's bones, the bones set from the frames (as the game sets them each frame). */
function skinnedMesh(built, geometry, material, frames) {
  const bones = BONES.map(() => {
    const bone = new THREE.Bone();
    bone.matrixAutoUpdate = false;
    return bone;
  });
  const inverses = built.bindFrames.map((frame) => new THREE.Matrix4().fromArray(frameMatrix(frame)).invert());
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  frames.forEach((frame, index) => bones[index].matrixWorld.fromArray(frameMatrix(frame)));
  mesh.frustumCulled = false;
  return mesh;
}

// ---- Extremities ----------------------------------------------------------------------

/** Take the maps a head's skin material was given (the face morph's texture) over to the sheet's material. */
function lightLike(original) {
  const material = plainMaterial();
  // The face morph's map (facemorph.js): its "no change" is under white, made up in the colour as the game's head does.
  if (original?.map) {
    material.map = original.map;
    material.color.multiplyScalar(1 / FACE_MORPH.neutral);
    material.needsUpdate = true;
  }
  return material;
}

/** A head, hands and feet, set on the pose as the game sets them. */
function addExtremities(group, body, built, frames, points, { helmet = null, hair = 'bald', beard = 'none' } = {}) {
  const hex = SHEET.clay;
  const faceLook = { hairStyle: hair, facialHair: beard, hairColor: '#2a1d14', faceMorph: Boolean(styleSpec(STYLE).face) };
  const head = buildHead(body, faceLook, hex, 0x888888);
  const seat = body.lengths.headRadius * (BASE_BODY.head.seat - BASE_BODY.head.lift);
  const headFrame = frames[BONE.head];
  head.group.matrix.fromArray(frameMatrix({ ...headFrame, origin: headFrame.origin.map((value, axis) => value - headFrame.y[axis] * seat) })).scale(new THREE.Vector3(1, 1, 1).multiplyScalar(BASE_BODY.head.size * (1 - BASE_BODY.head.smaller)));
  head.group.matrixAutoUpdate = false;
  const skullSkin = head.shell.mesh.material;
  const faceMaterial = lightLike(skullSkin);
  head.group.traverse((object) => {
    if (object.userData.outline || object.material?.side === THREE.BackSide) object.visible = false;
    // Skin-coloured parts are lit as the body is; the face's own features keep their tones.
    else if (object.material === skullSkin) object.material = faceMaterial;
  });
  // (`head=off`: the body alone, to tell the head's own neck from the body's.)
  if (query.get('head') !== 'off') group.add(head.group);
  const dress = dressFor(body.inputs, 0x888888);
  const colors = { ...roleColors(dress, new THREE.Color(hex)), accent: dress.feet.accent };
  const plain = plainMaterial();
  if (helmet) {
    const steel = steelMaterial(null, { vertexColors: false, color: 0x9aa4ad });
    const headgear = buildHeadgear(body, helmet, colors, steel, 0x888888, {});
    if (headgear) {
      head.group.add(headgear.group);
      if (headgear.hidesHair) head.hideHair({ beard: headgear.showsBeard });
    }
  }
  for (const side of ['l', 'r']) {
    const hand = buildHand(body, side, 'bare', hex, plain);
    const shoe = buildFootwear(body, 'bare', colors, hex, plain, null);
    for (const [object, bone, at] of [[hand, BONE[`${side}Forearm`], P[`${side}Hand`]], [shoe, BONE[`${side}Foot`], P[`${side}Foot`]]]) {
      object.matrixAutoUpdate = false;
      object.matrix.fromArray(frameMatrix({ ...frames[bone], origin: points[at] }));
      object.traverse((part) => {
        if (part.material) part.material = plain;
        if (part.userData.outline) part.visible = false;
      });
      group.add(object);
    }
  }
  return head;
}

// ---- Subjects -----------------------------------------------------------------------------

async function subjectFor(inputs, extras = {}) {
  const body = buildBody(inputs);
  // The build's first run pays for the JIT and fills the caches: best of two timed runs after it, the textures built in the first.
  let built = null;
  let ms = Infinity;
  const first = performance.now();
  built = buildSkinMesh(body, STYLE);
  // The maps made all at once (a background tab throttles the timers a sliced build would wait on); timed alone.
  const hitsBefore = skinTextureCache.hits;
  const textureStart = performance.now();
  // (`tex=off`: the skin without its maps, to tell their shading from the mesh's.)
  const maps = query.get('tex') === 'off' ? null : skinTexturesNow(body, STYLE, built);
  const textured = maps ? { textures: maps, ms: performance.now() - textureStart, report: { key: compositionKey(body, STYLE), cached: skinTextureCache.hits > hitsBefore, bytes: maps.bytes } } : null;
  const coldMs = performance.now() - first;
  for (let run = 0; run < 2; run += 1) {
    const start = performance.now();
    built = buildSkinMesh(body, STYLE);
    ms = Math.min(ms, performance.now() - start);
  }
  const texMs = textured?.ms ?? 0;
  const colors = paint(built, body);
  const group = new THREE.Group();
  let material = skinMaterial();
  if (textured) material = applySkinTextures(material, textured.textures, { relief: Number(query.get('relief') ?? 1), upgrade: Boolean(styleSpec(STYLE).tex.upgrade) });
  else if (built.detail) detailMaterial(material, built.detail, Number(query.get('relief') ?? 1));
  // (`game`: the arms lowered on the physics' own skeleton, rig.js bindPoints, as the game holds a standing body; `rest` on the
  // skeleton the skin was bound to, which the base style builds on the model's own joints.)
  // (A base-mesh body skins by dual quaternions, as in the game (render.js SKIN_DQ); `dqs=off` draws it by linear blending.)
  if (built.dualQuaternion && query.get('dqs') !== 'off') dualQuaternionSkinning(material);
  const points = POSE === 'guard' ? guardPoints(bindPoints(body), body) : ['bend90', 'bend130', 'raised'].includes(POSE) ? armPoints(bindPoints(body), body, POSE) : POSE === 'stance' ? stancePoints(bindPoints(body), body) : POSE === 'game' ? restPoints(bindPoints(body), body, SHEET.armRest) : POSE === 'rest' ? restPoints(built.bindPoints, body, SHEET.armRest) : built.bindPoints;
  const frames = boneFrames(points, body);
  const skin = skinnedMesh(built, geometryOf(built, colors), material, frames);
  group.add(skin);
  const head = addExtremities(group, body, built, frames, points, extras);
  const triangles = built.indices.length / 3;
  // What the flesh jiggle costs a frame on this body (a blow dents it; every vertex is then a spring until it rings out): the CPU part of drawing him in the game.
  let softMs = null;
  if (query.get('perf')) {
    const shell = new SoftShell(null, null, 0.5, { mesh: skin, recomputeNormals: false });
    const start = performance.now();
    shell.dentLocal(new THREE.Vector3(0.1, 1.3, 0), 30);
    const dent = performance.now() - start;
    const begin = performance.now();
    for (let frame = 0; frame < 60; frame += 1) shell.update(1 / 60);
    softMs = { dent, update: (performance.now() - begin) / 60 };
  }
  return { group, body, built, ms, texMs, coldMs, triangles, softMs, headY: points[P.head][1], textures: textured?.report ?? null, head, skin, frames };
}

/** A subject's fat masses through the move (MOVES[MOTION]): a frame subject per moment, each carrying the skin's offsets then. */
function motionFrames(subject) {
  const move = MOVES[MOTION];
  const { skin, frames, built } = subject;
  if (!built.slosh) return [{ ...subject, moment: null }];
  const shell = new SoftShell(null, null, 0.5, { mesh: skin, recomputeNormals: false });
  const slosh = new FatSlosh(built.slosh, shell, built.bindFrames, BONES);
  const out = [];
  const dt = 1 / MOTION_RATE;
  const wanted = [...move.moments];
  for (let t = move.from; wanted.length; t += dt) {
    const offset = move.path(t);
    slosh.update(dt, frames.map((frame) => ({ ...frame, origin: frame.origin.map((value, axis) => value + offset[axis]) })));
    if (t >= wanted[0] - dt / 2) {
      out.push({ ...subject, moment: wanted.shift(), extra: Float32Array.from(shell.extra) });
    }
  }
  return out;
}

// ---- Scene ---------------------------------------------------------------

const [CELL_W, CELL_H] = SHEET.cell;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(CELL_W * SCALE, CELL_H * SCALE);
const scene = new THREE.Scene();
scene.background = new THREE.Color(SHEET.background);
const camera = new THREE.PerspectiveCamera(SHEET.fov, CELL_W / CELL_H, 0.1, 50);
scene.add(camera);
// The lights ride the camera, so every view is lit alike: a key from above left, a cool fill, the sky and the ground's bounce.
const key = new THREE.DirectionalLight(0xfff4e8, 0.95);
key.position.set(...(query.get('light') === 'side' ? [-3.5, 0.6, 0.6] : [-3, 1.2, 1.6]));
camera.add(key);
const fill = new THREE.DirectionalLight(0xdde6ff, 0.2);
fill.position.set(2.2, 0.2, 1.4);
camera.add(fill);
scene.add(new THREE.HemisphereLight(0xffffff, 0x555560, 0.3));

function pointCamera(view, crop, subject) {
  const bearing = (SHEET.views[view] * Math.PI) / 180;
  const [tx, ty, tz] = SHEET.target;
  const faceView = view.startsWith('face');
  const zoom = faceView ? 5.6 : { torso: 2.1, chest: 3.4, legs: 2.2 }[crop] ?? 1;
  const target = faceView ? [tx, subject.headY - 0.05, tz] : { torso: [tx, 1.28, tz], chest: [tx, 1.34, tz], legs: [tx, 0.55, tz] }[crop] ?? [tx, ty, tz];
  const distance = SHEET.distance / zoom;
  camera.position.set(target[0] + Math.cos(bearing) * distance, target[1] + (faceView ? 0.01 : 0.12) + (SHEET.raised[view] ?? 0) / zoom, target[2] + Math.sin(bearing) * distance);
  camera.lookAt(target[0], target[1], target[2]);
  camera.updateMatrixWorld();
}

function shoot(subject, view) {
  // A moment of a move: the skin at rest plus the masses' offsets then.
  if (subject.extra) {
    const positions = subject.skin.geometry.attributes.position;
    const rest = subject.built.positions;
    for (let index = 0; index < positions.array.length; index += 1) positions.array[index] = rest[index] + subject.extra[index];
    positions.needsUpdate = true;
  }
  scene.add(subject.group);
  pointCamera(view, CROP, subject);
  renderer.render(scene, camera);
  scene.remove(subject.group);
  return renderer.domElement;
}

// ---- Sheet ------------------------------------------------------------------

/** The dressed fighters of the fit checks: plate, a quilted coat, and a heavy and a thin man in a helmet. */
function dressedFighters() {
  const base = { ...PRESETS.amateur, sex: 'male', heightCm: 180 };
  // The extremes of the progression (very obese, starved) in plate, for the helmets and the hair.
  const extreme = (fat) => progression('male').find((row) => row.key === (fat ? 'veryObese' : 'starved')).inputs;
  const helmed = (fat) => ({ ...extreme(fat), outfit: { kind: 'knight', design: 0 } });
  const presets = {
    knight: PRESETS.knight,
    gambeson: { ...base, outfit: { kind: 'forger', design: 0 } },
    'helmet-fat': { inputs: helmed(true), extras: { helmet: { kind: 'greatHelm', color: '#9aa4ad' } } },
    'helmet-thin': { inputs: helmed(false), extras: { helmet: { kind: 'greatHelm', color: '#9aa4ad' } } },
    // An open-faced helmet at the extremes (its cheeks and rim against the face), and hair and a beard at the extremes.
    'open-fat': { inputs: helmed(true), extras: { helmet: { kind: 'headguard', color: '#9aa4ad' } } },
    'open-thin': { inputs: helmed(false), extras: { helmet: { kind: 'headguard', color: '#9aa4ad' } } },
    'hair-fat': { inputs: { ...helmed(true), outfit: { kind: 'mma', design: 0 } }, extras: { hair: 'long', beard: 'beard' } },
    'hair-thin': { inputs: { ...helmed(false), outfit: { kind: 'mma', design: 0 } }, extras: { hair: 'long', beard: 'beard' } },
  };
  return query.get('fighter').split(',').map((key) => {
    const preset = presets[key];
    return { key, label: key, inputs: preset.inputs ?? preset, extras: preset.extras ?? {} };
  });
}

async function main() {
  // `outfit`: the progression dressed in an outfit (outfits.js kind, its first design), to see the clothes on every build.
  const outfit = query.get('outfit');
  const rows = query.get('fighter') ? dressedFighters() : progression(SEX).map((row) => (outfit ? { ...row, label: `${outfit} · ${row.label}`, inputs: { ...row.inputs, outfit: { kind: outfit, design: 0 } } } : row));
  const columns = rows.filter((row) => !ONLY || ONLY.includes(row.key));
  const subjects = [];
  for (const column of columns) {
    const subject = { column, ...(await subjectFor(column.inputs, column.extras)) };
    if (MOTION) subjects.push(...motionFrames(subject).map((frame) => ({ ...frame, column: { ...column, label: frame.moment === null ? `${column.label} (no masses)` : `${column.label} · ${MOTION} ${frame.moment.toFixed(2)} s` } })));
    else subjects.push(subject);
  }
  const width = CELL_W * SCALE;
  const height = CELL_H * SCALE;
  const sheet = document.createElement('canvas');
  sheet.width = width * subjects.length;
  sheet.height = (SHEET.header + SHEET.labels) * SCALE + height * ROWS.length;
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#3c3c3c';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  const text = (value, x, y, size, color = '#e8e8e8', align = 'center') => {
    ctx.fillStyle = color;
    ctx.font = `${size * SCALE}px -apple-system, Helvetica, Arial, sans-serif`;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  };
  const totals = subjects.map((s) => s.triangles);
  const meanTriangles = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
  const meanMs = subjects.reduce((a, s) => a + s.ms, 0) / subjects.length;
  const meanTex = subjects.reduce((a, s) => a + s.texMs, 0) / subjects.length;
  const label = query.get('title') ?? styleSpec(STYLE).label ?? STYLE;
  text(`${label} · ${SEX}${query.get('fighter') ? '' : ` · ${SHEET_HEIGHT[SEX]} cm`} · ${MAT} light · ${TONE} skin`, 18 * SCALE, 32 * SCALE, 26, '#ffffff', 'left');
  text(`cost per body: ~${meanTriangles.toLocaleString()} triangles (${Math.min(...totals).toLocaleString()} to ${Math.max(...totals).toLocaleString()}), mesh ${meanMs.toFixed(0)} ms${meanTex ? ` + textures ${meanTex.toFixed(0)} ms (first build)` : ''} · ${query.get('cost') ?? ''}`, 18 * SCALE, 62 * SCALE, 15, '#d0d0d0', 'left');
  subjects.forEach((subject, index) => {
    const { column, body } = subject;
    const x = index * width + width / 2;
    const bmi = body.bodyMassKg / body.statureM ** 2;
    text(column.label, x, (SHEET.header + 16) * SCALE, 17, '#ffffff');
    text(`BMI ${bmi.toFixed(1)} · fat ${(body.inputs.bodyFat * 100).toFixed(0)}% · muscle ${body.muscleKg.toFixed(1)} kg`, x, (SHEET.header + 38) * SCALE, 13, '#cfcfcf');
    text(`${body.bodyMassKg.toFixed(0)} kg · ex ${body.inputs.exercise} · ${body.inputs.frame} · ${subject.triangles.toLocaleString()} tris · ${subject.ms.toFixed(0)}${subject.texMs ? `+${subject.texMs.toFixed(0)}` : ''} ms`, x, (SHEET.header + 56) * SCALE, 11, '#9a9a9a');
    stats.push({ key: column.key, bmi, bodyFat: body.inputs.bodyFat, muscleKg: body.muscleKg, triangles: subject.triangles, vertices: subject.built.positions.length / 3, meshMs: subject.ms, texMs: subject.texMs, coldMs: subject.coldMs, textures: subject.textures, soft: subject.softMs });
    ROWS.forEach((view, rowIndex) => {
      const canvas = shoot(subject, view);
      const top = (SHEET.header + SHEET.labels) * SCALE + rowIndex * height;
      ctx.drawImage(canvas, index * width, top);
      // `ruler`: lines at the reference's landmark heights (fractions of standing height), where the camera sees them on this body.
      if (RULER) {
        for (const [fraction, name] of RULER_MARKS) {
          const point = new THREE.Vector3(0, fraction * body.heightM, 0).project(camera);
          const y = top + ((1 - point.y) / 2) * height;
          if (point.y < -1 || point.y > 1) continue;
          ctx.strokeStyle = 'rgba(255, 210, 60, 0.85)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(index * width, y);
          ctx.lineTo(index * width + width, y);
          ctx.stroke();
          text(`${fraction.toFixed(2)} ${name}`, index * width + 4, y - 2, 9, '#ffd23c', 'left');
        }
      }
    });
  });
  document.body.appendChild(sheet);
  sheet.style.maxWidth = '100%';
  const blob = sheet.toDataURL('image/png');
  const response = await fetch(`/__shot?name=${encodeURIComponent(NAME)}`, { method: 'POST', body: blob });
  window.__sheet.saved = await response.text();
  window.__sheet.done = true;
  document.title = `done ${window.__sheet.saved}`;
  const report = document.createElement('pre');
  report.id = 'report';
  report.textContent = JSON.stringify({ style: STYLE, sex: SEX, meanTriangles, meanMs, meanTex, stats, saved: window.__sheet.saved });
  document.body.appendChild(report);
  // A runner page holding this one in a frame (bodysheet-run.html) is told at once (its timers may be throttled in a background tab).
  if (window.parent !== window) window.parent.postMessage({ sheet: 'done', report: report.textContent }, location.origin);
}

const SHEET_HEIGHT = { male: 180, female: 168 };
main().catch((error) => {
  document.title = `error ${error.message}`;
  const report = document.createElement('pre');
  report.id = 'report';
  report.textContent = `ERROR ${error.stack}`;
  if (window.parent !== window) window.parent.postMessage({ sheet: 'error', report: report.textContent }, location.origin);
  document.body.appendChild(report);
});
