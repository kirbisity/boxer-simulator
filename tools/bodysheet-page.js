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
// built in), cell (the flesh grid), relief (bump strength), perf (soft-shell
// cost), fighter (knight, gambeson, helmet-fat, helmet-thin: one dressed
// fighter instead of the progression).

/* global THREE */
import { buildBody, P, PRESETS } from '../src/body.js';
import { BONES, BONE, boneFrames, frameMatrix } from '../src/rig.js';
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
import { surface } from '../src/toon.js';

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
  views: { front: 0, rear: 215, side: 90, face: 0, face3q: 38, front3q: 35, high: 145 },
  // Views seen from above (m the camera is raised over the target, at the full-body distance): the shoulders' tops.
  raised: { high: 1.6 },
  header: 78,
  labels: 62,
  // How far from the vertical the arms hang in the rest pose (degrees; the skin is built at 25).
  armRest: 11,
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
  built.regions?.forEach((region, vertex) => {
    const color = (clothed ? roles[region] : plain[region] ?? roles[region]) ?? clay;
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
  const angle = (degrees * Math.PI) / 180;
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
  const seat = body.lengths.headRadius * 0.18;
  const headFrame = frames[BONE.head];
  head.group.matrix.fromArray(frameMatrix({ ...headFrame, origin: headFrame.origin.map((value, axis) => value - headFrame.y[axis] * seat) })).scale(new THREE.Vector3(1.12, 1.12, 1.12));
  head.group.matrixAutoUpdate = false;
  const skullSkin = head.shell.mesh.material;
  const faceMaterial = lightLike(skullSkin);
  head.group.traverse((object) => {
    if (object.userData.outline || object.material?.side === THREE.BackSide) object.visible = false;
    // Skin-coloured parts are lit as the body is; the face's own features keep their tones.
    else if (object.material === skullSkin) object.material = faceMaterial;
  });
  group.add(head.group);
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
  const maps = skinTexturesNow(body, STYLE, built);
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
  const points = POSE === 'rest' ? restPoints(built.bindPoints, body, SHEET.armRest) : built.bindPoints;
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
  return { group, body, built, ms, texMs, coldMs, triangles, softMs, headY: points[P.head][1], textures: textured?.report ?? null, head };
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
  const rows = query.get('fighter') ? dressedFighters() : progression(SEX);
  const columns = rows.filter((row) => !ONLY || ONLY.includes(row.key));
  const subjects = [];
  for (const column of columns) subjects.push({ column, ...(await subjectFor(column.inputs, column.extras)) });
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
    const bmi = body.bodyMassKg / body.heightM ** 2;
    text(column.label, x, (SHEET.header + 16) * SCALE, 17, '#ffffff');
    text(`BMI ${bmi.toFixed(1)} · fat ${(body.inputs.bodyFat * 100).toFixed(0)}% · muscle ${body.muscleKg.toFixed(1)} kg`, x, (SHEET.header + 38) * SCALE, 13, '#cfcfcf');
    text(`${body.bodyMassKg.toFixed(0)} kg · ex ${body.inputs.exercise} · ${body.inputs.frame} · ${subject.triangles.toLocaleString()} tris · ${subject.ms.toFixed(0)}${subject.texMs ? `+${subject.texMs.toFixed(0)}` : ''} ms`, x, (SHEET.header + 56) * SCALE, 11, '#9a9a9a');
    stats.push({ key: column.key, bmi, bodyFat: body.inputs.bodyFat, muscleKg: body.muscleKg, triangles: subject.triangles, vertices: subject.built.positions.length / 3, meshMs: subject.ms, texMs: subject.texMs, coldMs: subject.coldMs, textures: subject.textures, soft: subject.softMs });
    ROWS.forEach((view, rowIndex) => {
      const canvas = shoot(subject, view);
      ctx.drawImage(canvas, index * width, (SHEET.header + SHEET.labels) * SCALE + rowIndex * height);
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
