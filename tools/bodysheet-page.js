// Draws the body-style comparison sheet (tools/bodysheet.html): for a style,
// the progression of tools/bodysheet-cast.js in the bind pose, in grey clay
// on grey, under one light rig and one camera for every style, front /
// rear three-quarter / side. Reads its options from the query string, builds
// the sheet in a 2D canvas, posts it to the dev server as shots/<name>.png and
// leaves the measurements in window.__sheet.stats (and the page title).

/* global THREE */
import { buildBody, P } from '../src/body.js';
import { BONE, bindPoints, boneFrames, frameMatrix } from '../src/rig.js';
import { buildSkinMesh } from '../src/bodystyles.js';
import { buildHead } from '../src/face.js';
import { buildFootwear, buildHand, dressFor, roleColors } from '../src/wardrobe.js';
import { PRESETS } from '../src/body.js';
import { progression } from './bodysheet-cast.js';
import { detailMaterial } from '../src/skindetail.js';
import { FLESH } from '../src/fleshbody.js';
import { SoftShell } from '../src/soft.js';

const query = new URLSearchParams(location.search);
const STYLE = query.get('style') ?? 'lofted';
const SEX = query.get('sex') ?? 'male';
const NAME = query.get('name') ?? `${STYLE}-${SEX}`;
const SCALE = Number(query.get('scale') ?? 1);
const ROWS = (query.get('rows') ?? 'front,rear,side').split(',');
const ONLY = query.get('cols')?.split(',') ?? null;
const CROP = query.get('crop');
// The flesh style's grid (m), to compare resolutions.
if (query.get('cell')) FLESH.cell = Number(query.get('cell'));

// One clay for every body, one grey behind it (the references': a mid-dark neutral).
const SHEET = {
  background: 0x5c5c5c,
  clay: query.get('skin') ? parseInt(query.get('skin'), 16) : 0xa6a29c,
  trunks: 0x2f3440,
  waistband: 0x8d93a3,
  cell: [340, 620],
  // Perspective like a long lens: little foreshortening, the whole 2 m figure in the cell.
  fov: 20,
  distance: 6.1,
  target: [0, 0.97, 0],
  // Camera bearings from the fighter's front (+x), degrees: front, rear three-quarter, left side.
  views: { front: 0, rear: 215, side: 90 },
  header: 78,
  labels: 62,
};

const stats = [];
window.__sheet = { stats, done: false };

function clayMaterial(skinning = false) {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.82, metalness: 0, skinning });
}

/** Per-vertex colours of a built body: clay skin, grey trunks and top, the outfit's own colours elsewhere. */
function paint(built, body) {
  const clay = new THREE.Color(SHEET.clay);
  const colors = new Float32Array(built.positions.length);
  const roles = built.regions ? roleColors(dressFor(body.inputs, 0x888888), clay) : null;
  const plain = { skin: clay, kit: new THREE.Color(SHEET.trunks), top: new THREE.Color(SHEET.trunks), band: new THREE.Color(SHEET.waistband), trim2: new THREE.Color(SHEET.trunks), trim: new THREE.Color(SHEET.trunks) };
  const clothed = body.inputs.outfit.kind !== 'mma';
  built.regions?.forEach((region, vertex) => {
    const color = (clothed ? roles[region] : plain[region] ?? roles[region]) ?? clay;
    colors.set([color.r, color.g, color.b], vertex * 3);
  });
  if (!built.regions) colors.fill(clay.r);
  return colors;
}

function geometryOf(built, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(built.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(built.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(built.indices, 1));
  // The detail style's coordinates: one set for the bump map, the same again for the occlusion map.
  if (built.uvs) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(built.uvs, 2));
    geometry.setAttribute('uv2', new THREE.BufferAttribute(built.uvs, 2));
  }
  return geometry;
}

/** A head, hands and feet in clay, set on the bind pose as the game sets them. */
function addExtremities(group, body, built) {
  const clay = new THREE.MeshStandardMaterial({ color: SHEET.clay, roughness: 0.82 });
  const hex = SHEET.clay;
  const frames = built.bindFrames;
  const points = built.bindPoints;
  const head = buildHead(body, { hairStyle: 'bald', facialHair: 'none' }, hex, 0x888888);
  const seat = body.lengths.headRadius * 0.18;
  const headFrame = frames[BONE.head];
  head.group.matrix.fromArray(frameMatrix({ ...headFrame, origin: headFrame.origin.map((value, axis) => value - headFrame.y[axis] * seat) })).scale(new THREE.Vector3(1.12, 1.12, 1.12));
  head.group.matrixAutoUpdate = false;
  head.group.traverse((object) => {
    if (object.userData.outline || object.material?.side === THREE.BackSide) object.visible = false;
    // Skin-coloured parts go clay (lit alike); the face's own features keep their tones, softened.
    else if (object.material?.color && object.material.color.getHex() === hex) object.material = clay;
  });
  group.add(head.group);
  const dress = dressFor(body.inputs, 0x888888);
  const colors = { ...roleColors(dress, new THREE.Color(hex)), accent: dress.feet.accent };
  for (const side of ['l', 'r']) {
    const hand = buildHand(body, side, 'bare', hex, clay);
    const shoe = buildFootwear(body, 'bare', colors, hex, clay, null);
    for (const [object, bone, at] of [[hand, BONE[`${side}Forearm`], P[`${side}Hand`]], [shoe, BONE[`${side}Foot`], P[`${side}Foot`]]]) {
      object.matrixAutoUpdate = false;
      object.matrix.fromArray(frameMatrix({ ...frames[bone], origin: points[at] }));
      object.traverse((part) => {
        if (part.material) part.material = clay;
        if (part.userData.outline) part.visible = false;
      });
      group.add(object);
    }
  }
}

function subjectFor(inputs) {
  const body = buildBody(inputs);
  // Best of three builds: the first pays for the JIT.
  let built = null;
  let ms = Infinity;
  for (let run = 0; run < 3; run += 1) {
    const start = performance.now();
    built = buildSkinMesh(body, STYLE);
    ms = Math.min(ms, performance.now() - start);
  }
  const colors = paint(built, body);
  const group = new THREE.Group();
  const material = built.detail ? detailMaterial(clayMaterial(), built.detail, Number(query.get('relief') ?? 1)) : clayMaterial();
  group.add(new THREE.Mesh(geometryOf(built, colors), material));
  addExtremities(group, body, built);
  const triangles = built.indices.length / 3;
  // What the flesh jiggle costs a frame on this body (a blow dents it; every vertex is then a spring until it rings out): the CPU part of drawing him in the game.
  let softMs = null;
  if (query.get('perf')) {
    const shell = new SoftShell(null, null, 0.5, { mesh: group.children[0], recomputeNormals: false });
    const start = performance.now();
    shell.dentLocal(new THREE.Vector3(0.1, 1.3, 0), 30);
    const dent = performance.now() - start;
    const begin = performance.now();
    for (let frame = 0; frame < 60; frame += 1) shell.update(1 / 60);
    softMs = { dent, update: (performance.now() - begin) / 60 };
  }
  return { group, body, built, ms, triangles, softMs };
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

function pointCamera(view, crop) {
  const bearing = (SHEET.views[view] * Math.PI) / 180;
  const [tx, ty, tz] = SHEET.target;
  const zoom = { torso: 2.1, chest: 3.4, legs: 2.2 }[crop] ?? 1;
  const target = { torso: [tx, 1.28, tz], chest: [tx, 1.34, tz], legs: [tx, 0.55, tz] }[crop] ?? [tx, ty, tz];
  const distance = SHEET.distance / zoom;
  camera.position.set(target[0] + Math.cos(bearing) * distance, target[1] + 0.12, target[2] + Math.sin(bearing) * distance);
  camera.lookAt(target[0], target[1], target[2]);
  camera.updateMatrixWorld();
}

function shoot(subject, view) {
  scene.add(subject.group);
  pointCamera(view, CROP);
  renderer.render(scene, camera);
  scene.remove(subject.group);
  return renderer.domElement;
}

// ---- Sheet ------------------------------------------------------------------

function dressedFighters() {
  const presets = { knight: PRESETS.knight, gambeson: { ...PRESETS.amateur, sex: 'male', heightCm: 180, outfit: { kind: 'forger', design: 0 } } };
  const wanted = query.get('fighter').split(',');
  return wanted.map((key) => ({ key, label: key, inputs: presets[key] }));
}

async function main() {
  const rows = query.get('fighter') ? dressedFighters() : progression(SEX);
  const columns = rows.filter((row) => !ONLY || ONLY.includes(row.key));
  const subjects = columns.map((column) => ({ column, ...subjectFor(column.inputs) }));
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
  const label = query.get('title') ?? STYLE;
  text(`${label} · ${SEX}${query.get('fighter') ? '' : ` · ${SHEET_HEIGHT[SEX]} cm`}`, 18 * SCALE, 32 * SCALE, 26, '#ffffff', 'left');
  text(`cost per body: ~${meanTriangles.toLocaleString()} triangles (${Math.min(...totals).toLocaleString()} to ${Math.max(...totals).toLocaleString()}), build ${meanMs.toFixed(0)} ms mean (${Math.min(...subjects.map((s) => s.ms)).toFixed(0)} to ${Math.max(...subjects.map((s) => s.ms)).toFixed(0)}) · ${query.get('cost') ?? ''}`, 18 * SCALE, 62 * SCALE, 15, '#d0d0d0', 'left');
  subjects.forEach((subject, index) => {
    const { column, body } = subject;
    const x = index * width + width / 2;
    const bmi = body.bodyMassKg / body.heightM ** 2;
    text(column.label, x, (SHEET.header + 16) * SCALE, 17, '#ffffff');
    text(`BMI ${bmi.toFixed(1)} · fat ${(body.inputs.bodyFat * 100).toFixed(0)}% · muscle ${body.muscleKg.toFixed(1)} kg`, x, (SHEET.header + 38) * SCALE, 13, '#cfcfcf');
    text(`${body.bodyMassKg.toFixed(0)} kg · ex ${body.inputs.exercise} · ${body.inputs.frame} · ${subject.triangles.toLocaleString()} tris · ${subject.ms.toFixed(0)} ms`, x, (SHEET.header + 56) * SCALE, 11, '#9a9a9a');
    stats.push({ key: column.key, bmi, bodyFat: body.inputs.bodyFat, muscleKg: body.muscleKg, triangles: subject.triangles, buildMs: subject.ms, soft: subject.softMs });
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
  report.textContent = JSON.stringify({ style: STYLE, sex: SEX, meanTriangles, meanMs, stats, saved: window.__sheet.saved });
  document.body.appendChild(report);
}

const SHEET_HEIGHT = { male: 180, female: 168 };
main().catch((error) => {
  document.title = `error ${error.message}`;
  const report = document.createElement('pre');
  report.id = 'report';
  report.textContent = `ERROR ${error.stack}`;
  document.body.appendChild(report);
});
