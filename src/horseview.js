// What a horse looks like, drawn from the simulation's horse (nothing here
// changes it). The body, neck, head, ears and each leg's segments are meshes
// made once per breed, barding, coat and level of detail (src/horsemesh.js)
// and shared by every horse that looks alike; they are moved each frame:
// the neck and head nod with the gait, the ears flick, the legs bend at knee
// (or hock), fetlock and hoof with the stride the physics gave them, the body
// rolls a little. The mane, the tail's hair, a cloth trapper, the stirrups and
// the reins are redrawn each frame (src/horsehair.js hangs them), the reins
// running from the bit to the rider's hand. A horse that falls rolls onto its
// side with its neck out; a leg the physics has broken hangs limp.

/* global THREE */
import { HORSE_SHAPE, poseHorse } from './physics/mounted.js';
import { P } from './body.js';
import { twoBoneIK, vec } from './pose.js';
import { buildHorseModel, horseModelKey } from './horsemesh.js';
import { hairChain, stepHair } from './horsehair.js';
import { steelMaterial } from './wardrobe.js';
import { disposeObject, outlineFor, surface } from './toon.js';

const HORSE_LOOK = {
  outline: 0.005,
  rein: 0x2a1a10,
  iron: [0.5, 0.5, 0.54],
  leather: [0.16, 0.1, 0.07],
  // How many different models a breed keeps for coats and markings.
  variety: 12,
  // Horses beyond this many in a fight are drawn in low detail.
  crowd: 4,
};

const horseUp = new THREE.Vector3(0, 1, 0);
const horseX = new THREE.Vector3();
const horseY = new THREE.Vector3();
const horseZ = new THREE.Vector3();
const horseBasis = new THREE.Matrix4();
const horseInverse = new THREE.Matrix4();
const horseVector = new THREE.Vector3();

// ---- Models and their geometry, shared ----------------------------------------------

const horseModels = new Map();
const horseGeometries = new WeakMap();

/** A stable number from a horse's id and coat, so one horse always looks the same and a troop varies. */
function horseSeed(horse) {
  let hash = (horse.id ?? 0) * 7 + 3;
  for (const char of `${horse.breed}${horse.coat}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 1 + (hash % HORSE_LOOK.variety);
}

/** Whether a horse wears a cloth trapper: its own say, else a heavy horse now and then (never a lamellar one). */
function horseCaparison(horse, seed) {
  if (horse.caparison !== undefined) return Boolean(horse.caparison);
  return (horse.breed === 'destrier' || horse.breed === 'warhorse') && horse.barding !== 'lamellar' && seed % 2 === 0;
}

/** The model for a horse (built the first time that look is wanted). */
export function horseModelFor(horse, detail = 'full') {
  const seed = horseSeed(horse);
  const spec = { breed: horse.breed, barding: horse.barding, coat: horse.coat, seed, caparison: horseCaparison(horse, seed), detail, withers: horse.withers, corner: horse.corner };
  const key = horseModelKey(spec);
  if (!horseModels.has(key)) horseModels.set(key, buildHorseModel(spec));
  return horseModels.get(key);
}

function horseGeometry(part) {
  if (!horseGeometries.has(part)) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(part.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
    geometry.computeBoundingSphere();
    horseGeometries.set(part, geometry);
  }
  return horseGeometries.get(part);
}

function horseMaterials(view) {
  if (!view.horseMaterials) {
    const hair = surface(0xffffff, { vertexColors: true });
    hair.side = THREE.DoubleSide;
    view.horseMaterials = {
      soft: surface(0xffffff, { vertexColors: true }),
      hair,
      metal: steelMaterial(view.steelEnv, { vertexColors: true }),
      rein: new THREE.LineBasicMaterial({ color: HORSE_LOOK.rein }),
    };
  }
  return view.horseMaterials;
}

/** A mesh of a shared geometry (not freed with the horse), inked if asked. */
function horseMesh(parent, geometry, material, { ink = 0 } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.userData.shared = true;
  parent.add(mesh);
  if (ink) {
    const outline = outlineFor(mesh, ink);
    outline.userData.shared = true;
    mesh.add(outline);
  }
  return mesh;
}

/** A part's soft and metal geometries as meshes under `parent`; returns them. */
function horsePart(parent, part, materials, { ink = 0 } = {}) {
  const meshes = [];
  if (part?.soft) meshes.push(horseMesh(parent, horseGeometry(part.soft), materials.soft, { ink }));
  if (part?.metal) meshes.push(horseMesh(parent, horseGeometry(part.metal), materials.metal));
  return meshes;
}

/** A box or other stock geometry painted one colour (vertex colours), freed with the horse. */
function horsePainted(geometry, [r, g, b]) {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let v = 0; v < count; v += 1) colors.set([r, g, b], v * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Lay a limb piece from a point to another, its x axis towards `forward`, y along the piece. */
function layHorsePart(mesh, from, to, forward) {
  mesh.position.set(from[0], from[1], from[2]);
  horseY.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize();
  horseX.set(forward[0], forward[1], forward[2]);
  horseX.addScaledVector(horseY, -horseX.dot(horseY));
  if (horseX.lengthSq() < 1e-6) horseX.set(0, 0, 1).addScaledVector(horseY, -horseY.z);
  horseX.normalize();
  horseZ.crossVectors(horseX, horseY);
  horseBasis.makeBasis(horseX, horseY, horseZ);
  mesh.quaternion.setFromRotationMatrix(horseBasis);
}

/** A thin box between two points in a parent's frame (a leather). */
function layStrap(mesh, from, to) {
  mesh.position.set(from[0], from[1], from[2]);
  horseVector.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const length = horseVector.length() || 1e-6;
  mesh.scale.set(1, length, 1);
  mesh.quaternion.setFromUnitVectors(horseUp, horseVector.divideScalar(length));
}

// ---- Building ----------------------------------------------------------------------------

/** Build a horse's model (added to the scene); returns its view. */
export function buildHorseView(view, horse, { detail = 'full' } = {}) {
  const model = horseModelFor(horse, detail);
  const { rig, parts } = model;
  const W = horse.withers;
  const low = model.low;
  const materials = horseMaterials(view);
  const ink = low ? 0 : HORSE_LOOK.outline;
  const group = new THREE.Group();
  // Rolled about the barrel's line when it falls (as physics horsePoint): the body in `body`, about the pivot.
  const pivot = 0.76 * W;
  const body = new THREE.Group();
  body.position.y = pivot;
  group.add(body);
  const frame = new THREE.Group();
  frame.position.y = -pivot;
  body.add(frame);
  const owned = [];
  horsePart(frame, parts.body, materials, { ink });
  // Neck, head, ears: the neck pivots at the withers, the head at the poll, the ears at their bases.
  const neck = new THREE.Group();
  neck.position.set(...rig.neckPivot);
  frame.add(neck);
  horsePart(neck, parts.neck, materials, { ink });
  const head = new THREE.Group();
  head.position.set(...rig.poll);
  neck.add(head);
  horsePart(head, parts.head, materials, { ink });
  const ears = [];
  if (!low) {
    for (const side of [1, -1]) {
      const ear = new THREE.Group();
      ear.position.set(rig.earBase[0], rig.earBase[1], side * rig.earSpread);
      head.add(ear);
      horsePart(ear, parts.ear, materials);
      ears.push({ ear, side });
    }
  }
  // Legs: drawn in the world, placed each frame from the gait.
  const legs = {};
  for (const leg of HORSE_SHAPE.legs) {
    const set = parts.legs[leg.key];
    const pieces = {};
    for (const [name, part] of Object.entries(set)) {
      const holder = new THREE.Group();
      view.scene.add(holder);
      pieces[name] = { holder, meshes: horsePart(holder, part, materials, { ink: name === 'upper' ? ink : 0 }) };
      if (!part.soft && !part.metal) pieces[name].holder.visible = false;
    }
    legs[leg.key] = pieces;
  }
  // Hair and cloth that move: made per horse.
  const hang = {};
  if (!low) {
    hang.mane = horseMane(neck, rig, materials, owned);
    hang.tail = horseTail(frame, rig, materials, owned);
    if (rig.trapper) hang.trapper = horseTrapper(frame, rig, materials, owned);
    hang.stirrups = horseStirrups(frame, rig, materials, owned);
    hang.reins = horseReins(view.scene, materials, owned);
  }
  view.scene.add(group);
  return {
    horse, model, group, body, frame, neck, head, ears, legs, hang, owned, detail,
    drawn: { ...horse, capsules: [], legs: {} },
    clock: null, lastTime: null, gaitRoll: 0, lameLeg: null,
  };
}

// ---- The mane --------------------------------------------------------------------------

/** Hair strips face sideways; the material is two-sided, so one normal serves both faces. */
function horseSideNormals(count) {
  const normals = new Float32Array(count * 3);
  for (let v = 0; v < count; v += 1) normals[v * 3 + 2] = 1;
  return new THREE.BufferAttribute(normals, 3);
}

function horseManeGeometry(count, rows) {
  const vertices = count * rows * 2;
  const positions = new Float32Array(vertices * 3);
  const indices = [];
  for (let tuft = 0; tuft < count; tuft += 1) {
    for (let row = 0; row < rows - 1; row += 1) {
      const a = (tuft * rows + row) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setAttribute('normal', horseSideNormals(vertices));
  geometry.frustumCulled = false;
  return geometry;
}

function horseHairMesh(parent, geometry, material, owned) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  parent.add(mesh);
  owned.push(mesh);
  return mesh;
}

/** The mane: a row of tufts along the crest, each a strip hung from the crest and swaying with the gait. */
function horseMane(neck, rig, materials, owned) {
  const { tufts } = rig.mane;
  const rows = 4;
  const geometry = horseManeGeometry(tufts.length, rows);
  const colors = new Float32Array(tufts.length * rows * 2 * 3);
  tufts.forEach((tuft, index) => {
    for (let row = 0; row < rows; row += 1) {
      const shade = 1 - 0.25 * (row / (rows - 1)) - 0.05 * (index % 2);
      for (let side = 0; side < 2; side += 1) colors.set([rig.mane.color[0] * shade, rig.mane.color[1] * shade, rig.mane.color[2] * shade], ((index * rows + row) * 2 + side) * 3);
    }
  });
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = horseHairMesh(neck, geometry, materials.hair, owned);
  return { mesh, rows };
}

function updateMane(hang, rig, motion) {
  const { mesh, rows } = hang;
  const positions = mesh.geometry.attributes.position.array;
  const side = rig.mane.side;
  const upright = rig.mane.upright;
  rig.mane.tufts.forEach((tuft, index) => {
    const swing = Math.sin(motion.cycle * 2 * Math.PI + tuft.phase) * motion.sway + Math.sin(motion.time * 1.6 + tuft.phase * 2) * 0.03;
    for (let row = 0; row < rows; row += 1) {
      const s = row / (rows - 1);
      // The hair lies over the neck's side from the crest, hangs down it, streams back with speed and swings with the stride.
      // Down the neck's side: its width a little below the crest is the ellipse's, narrowing to nothing at the throat.
      const down = Math.min(1.98, (tuft.length * s * 0.95) / tuft.depth);
      const fit = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(1 - down), 2.5)), 1 / 2.5);
      const z = (index % 3 === 2 ? -side : side) * (tuft.hw * fit * 1.06 + 0.005) * (1 - 0.4 * upright) * Math.min(1, s * 4 + 0.15);
      const lift = upright * tuft.length * 0.9 * Math.sin(Math.min(1, s * 2) * Math.PI) * 0.5;
      const x = tuft.base[0] - (motion.stream * 0.9 + swing) * tuft.length * s * s - tuft.length * 0.08 * s;
      const y = tuft.base[1] - tuft.length * s * (0.95 - 0.5 * upright) + lift;
      const half = tuft.width * 0.5 * Math.pow(1 - s, 0.8) + tuft.width * 0.04;
      const at = (index * rows + row) * 6;
      positions[at] = x - half * 0.8;
      positions[at + 1] = y - half * 0.6;
      positions[at + 2] = z;
      positions[at + 3] = x + half * 0.8;
      positions[at + 4] = y + half * 0.6;
      positions[at + 5] = z;
    }
  });
  mesh.geometry.attributes.position.needsUpdate = true;
}

// ---- The tail ---------------------------------------------------------------------------

const HORSE_TAIL = { points: 6, strands: 9 };

/** The tail's hair: a chain hung from the dock, drawn as a fan of strands along it. */
function horseTail(frame, rig, materials, owned) {
  const { points, strands } = HORSE_TAIL;
  const vertices = strands * points * 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
  const colors = new Float32Array(vertices * 3);
  const indices = [];
  for (let strand = 0; strand < strands; strand += 1) {
    for (let k = 0; k < points; k += 1) {
      const shade = (0.82 + 0.18 * ((strand * 5) % 3) / 2) * (1 - 0.1 * (k / points));
      for (let side = 0; side < 2; side += 1) colors.set([rig.coat.mane[0] * shade, rig.coat.mane[1] * shade, rig.coat.mane[2] * shade], ((strand * points + k) * 2 + side) * 3);
      if (k < points - 1) {
        const a = (strand * points + k) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('normal', horseSideNormals(vertices));
  geometry.setIndex(indices);
  const mesh = horseHairMesh(frame, geometry, materials.hair, owned);
  return { mesh, chain: hairChain(points, rig.tailLength / (points - 1)), rest: new Float64Array(points * 3), local: new Float64Array(points * 3) };
}

/** A frame's matrix applied to a local point, into an array. */
function horseToWorld(matrix, x, y, z, out, at) {
  const e = matrix.elements;
  out[at] = e[0] * x + e[4] * y + e[8] * z + e[12];
  out[at + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
  out[at + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
}

function updateTail(hang, rig, frame, motion, dt) {
  const { mesh, chain, rest, local } = hang;
  const { points, strands } = HORSE_TAIL;
  const segment = rig.tailLength / (points - 1);
  // Where the hair lies at rest: the dock's carriage, lifted and streaming with speed; a swish when standing.
  let x = rig.tailRoot[0];
  let y = rig.tailRoot[1];
  const swish = Math.sin(motion.time * 1.3) * 0.05 * (1 - motion.pace);
  horseToWorld(frame.matrixWorld, x, y, 0, rest, 0);
  for (let k = 1; k < points; k += 1) {
    const lift = motion.pace;
    const angle = rig.tailCarriage[Math.min(4, k - 1)] * (1 - 0.8 * lift * rig.tailLift) - 0.1 * lift * rig.tailLift;
    x -= Math.cos(angle) * segment;
    y -= Math.sin(angle) * segment;
    horseToWorld(frame.matrixWorld, x, y, swish * rig.withers * (k / points), rest, k * 3);
  }
  const stiff = [0, 70, 38, 22, 14, 10];
  stepHair(chain, dt, rest, { stiff, drag: 2.2, gravity: 0.7 });
  // Into the frame's own coordinates.
  horseInverse.copy(frame.matrixWorld).invert();
  const e = horseInverse.elements;
  for (let k = 0; k < points; k += 1) {
    const px = chain.p[k * 3];
    const py = chain.p[k * 3 + 1];
    const pz = chain.p[k * 3 + 2];
    local[k * 3] = e[0] * px + e[4] * py + e[8] * pz + e[12];
    local[k * 3 + 1] = e[1] * px + e[5] * py + e[9] * pz + e[13];
    local[k * 3 + 2] = e[2] * px + e[6] * py + e[10] * pz + e[14];
  }
  const positions = mesh.geometry.attributes.position.array;
  const W = rig.withers;
  for (let strand = 0; strand < strands; strand += 1) {
    const spread = (strand - (strands - 1) / 2) / ((strands - 1) / 2);
    const lengthShare = 0.86 + 0.14 * Math.cos(spread * 1.2) - 0.05 * ((strand * 3) % 2);
    for (let k = 0; k < points; k += 1) {
      const u = Math.min(points - 1, (k / (points - 1)) * lengthShare * (points - 1));
      const lo = Math.floor(u);
      const hi = Math.min(points - 1, lo + 1);
      const f = u - lo;
      const px = local[lo * 3] + (local[hi * 3] - local[lo * 3]) * f;
      const py = local[lo * 3 + 1] + (local[hi * 3 + 1] - local[lo * 3 + 1]) * f;
      const pz = local[lo * 3 + 2] + (local[hi * 3 + 2] - local[lo * 3 + 2]) * f;
      const tx = local[hi * 3] - local[lo * 3] || 1e-4;
      const ty = local[hi * 3 + 1] - local[lo * 3 + 1];
      const tl = Math.hypot(tx, ty) || 1;
      // The strand's side-to-side spread widens down the hair; the ribbon's width is across its line in the horse's plane.
      const fan = spread * (0.012 + 0.03 * (k / (points - 1))) * W + Math.sin(motion.time * 2 + strand * 1.7 + k) * 0.004 * k;
      const width = (0.02 * (1 - 0.75 * (k / (points - 1))) + 0.003) * W;
      const nx = (-ty / tl) * width;
      const ny = (tx / tl) * width;
      const at = (strand * points + k) * 6;
      positions[at] = px - nx;
      positions[at + 1] = py - ny;
      positions[at + 2] = pz + fan;
      positions[at + 3] = px + nx;
      positions[at + 4] = py + ny;
      positions[at + 5] = pz + fan;
    }
  }
  mesh.geometry.attributes.position.needsUpdate = true;
}

// ---- The trapper ---------------------------------------------------------------------------

function horseTrapper(frame, rig, materials, owned) {
  const { trapper } = rig;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trapper.vertices * 3), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(trapper.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(trapper.indices, 1));
  const mesh = horseHairMesh(frame, geometry, materials.hair, owned);
  const chains = trapper.hung.map((column) => hairChain(trapper.links + 1, 0.0));
  trapper.hung.forEach((column, index) => {
    const lengths = [0];
    let last = column.pivot;
    column.rest.forEach((point) => {
      lengths.push(Math.hypot(point[0] - last[0], point[1] - last[1], point[2] - last[2]));
      last = point;
    });
    chains[index].links = lengths;
    chains[index].segment = Math.max(...lengths);
  });
  return { mesh, chains, rest: new Float64Array((trapper.links + 1) * 3) };
}

function updateTrapper(hang, rig, frame, horse, dt) {
  const { trapper } = rig;
  const { chains, rest, mesh } = hang;
  const rows = trapper.links + 1;
  const positions = mesh.geometry.attributes.position.array;
  horseInverse.copy(frame.matrixWorld).invert();
  const inverse = horseInverse.elements;
  const capsules = horse.capsules?.slice(0, 2) ?? [];
  const collide = (p, at) => {
    // Out of the barrel and chest (capsules a little wider than the body), and off the floor.
    for (const capsule of capsules) {
      const [ax, ay, az] = capsule.a;
      const bx = capsule.b[0] - ax;
      const by = capsule.b[1] - ay;
      const bz = capsule.b[2] - az;
      const span = bx * bx + by * by + bz * bz || 1e-9;
      const t = Math.max(0, Math.min(1, ((p[at] - ax) * bx + (p[at + 1] - ay) * by + (p[at + 2] - az) * bz) / span));
      const cx = ax + bx * t;
      const cy = ay + by * t;
      const cz = az + bz * t;
      const dx = p[at] - cx;
      const dy = p[at + 1] - cy;
      const dz = p[at + 2] - cz;
      const reach = capsule.radius * 0.97;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
      if (distance < reach) {
        p[at] = cx + (dx / distance) * reach;
        p[at + 1] = cy + (dy / distance) * reach;
        p[at + 2] = cz + (dz / distance) * reach;
      }
    }
    if (p[at + 1] < 0.02) p[at + 1] = 0.02;
  };
  trapper.hung.forEach((column, index) => {
    const chain = chains[index];
    horseToWorld(frame.matrixWorld, column.pivot[0], column.pivot[1], column.pivot[2], rest, 0);
    column.rest.forEach((point, j) => horseToWorld(frame.matrixWorld, point[0], point[1], point[2], rest, (j + 1) * 3));
    stepHair(chain, dt, rest, { stiff: [0, 190, 140, 110, 90], drag: 5, gravity: 0.8, collide, link: chain.links });
    for (let row = 0; row < rows; row += 1) {
      const px = chain.p[row * 3];
      const py = chain.p[row * 3 + 1];
      const pz = chain.p[row * 3 + 2];
      const at = (index * rows + row) * 3;
      positions[at] = inverse[0] * px + inverse[4] * py + inverse[8] * pz + inverse[12];
      positions[at + 1] = inverse[1] * px + inverse[5] * py + inverse[9] * pz + inverse[13];
      positions[at + 2] = inverse[2] * px + inverse[6] * py + inverse[10] * pz + inverse[14];
    }
  });
  mesh.geometry.attributes.position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

// ---- Stirrups and reins ----------------------------------------------------------------------

function horseStirrups(frame, rig, materials, owned) {
  const W = rig.withers;
  const out = [];
  for (const side of [1, -1]) {
    const holder = new THREE.Group();
    frame.add(holder);
    const ring = new THREE.TorusGeometry(0.036 * W, 0.0045 * W, 5, 12);
    ring.scale(1.15, 1.3, 1);
    ring.rotateY(Math.PI / 2);
    horsePainted(ring, HORSE_LOOK.iron);
    const iron = new THREE.Mesh(ring, materials.metal);
    iron.castShadow = true;
    holder.add(iron);
    const tread = new THREE.BoxGeometry(0.05 * W, 0.006 * W, 0.075 * W);
    tread.translate(0, -0.046 * W, 0);
    horsePainted(tread, HORSE_LOOK.iron);
    const treadMesh = new THREE.Mesh(tread, materials.metal);
    holder.add(treadMesh);
    const leatherGeometry = new THREE.BoxGeometry(0.006 * W, 1, 0.026 * W);
    leatherGeometry.translate(0, 0.5, 0);
    horsePainted(leatherGeometry, HORSE_LOOK.leather);
    const leather = new THREE.Mesh(leatherGeometry, materials.soft);
    leather.castShadow = true;
    frame.add(leather);
    owned.push(iron, treadMesh, leather);
    out.push({ side, holder, leather, chain: hairChain(2, rig.stirrupDrop), rest: new Float64Array(6) });
  }
  return out;
}

function updateStirrups(hang, rig, frame, horse, rider, dt) {
  const W = rig.withers;
  for (const stirrup of hang) {
    const bar = [rig.saddle.bar[0], rig.saddle.bar[1], stirrup.side * rig.saddle.bar[2]];
    let at;
    if (rider) {
      // The iron hangs under his foot.
      const foot = rider.x;
      const index = (stirrup.side > 0 ? P.lFoot : P.rFoot) * 3;
      horseVector.set(foot[index], foot[index + 1] - 0.015, foot[index + 2]);
      frame.worldToLocal(horseVector);
      at = [horseVector.x, horseVector.y + 0.012 * W, horseVector.z];
      stirrup.chain.ready = false;
    } else {
      // No rider: it swings on its leather from the bar.
      horseToWorld(frame.matrixWorld, bar[0], bar[1], bar[2], stirrup.rest, 0);
      horseToWorld(frame.matrixWorld, bar[0], bar[1] - rig.stirrupDrop, bar[2] + stirrup.side * 0.02 * W, stirrup.rest, 3);
      stepHair(stirrup.chain, dt, stirrup.rest, { stiff: [0, 5], drag: 1.2, gravity: 1 });
      horseVector.set(stirrup.chain.p[3], stirrup.chain.p[4], stirrup.chain.p[5]);
      frame.worldToLocal(horseVector);
      at = [horseVector.x, horseVector.y, horseVector.z];
    }
    stirrup.holder.position.set(at[0], at[1], at[2]);
    stirrup.holder.rotation.set(0, 0, 0);
    layStrap(stirrup.leather, bar, [at[0], at[1] + 0.04 * W, at[2]]);
  }
}

const HORSE_REIN_POINTS = 9;

function horseReins(scene, materials, owned) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * (HORSE_REIN_POINTS - 1) * 2 * 3), 3));
  const lines = new THREE.LineSegments(geometry, materials.rein);
  lines.frustumCulled = false;
  scene.add(lines);
  owned.push(lines);
  return { lines };
}

/** The reins: from each side of the bit to the rider's hand, slack where he does not hold them taut; with no rider they fall to the pommel. */
function updateReins(hang, rig, head, frame, horse, rider) {
  const W = rig.withers;
  const positions = hang.lines.geometry.attributes.position.array;
  head.updateWorldMatrix(true, false);
  let at = 0;
  for (const side of [1, -1]) {
    horseVector.set(rig.bit[0], rig.bit[1], side * Math.abs(rig.bit[2]) + side * 0.0);
    head.localToWorld(horseVector);
    const bit = [horseVector.x, horseVector.y, horseVector.z];
    let hand;
    let slack;
    if (rider) {
      // Both reins in the left hand, a hand's width apart.
      const index = P.lHand * 3;
      hand = [rider.x[index], rider.x[index + 1], rider.x[index + 2]];
      const sideways = horseVector.set(0, 0, side * 0.03).applyQuaternion(frame.getWorldQuaternion(new THREE.Quaternion()));
      hand = [hand[0] + sideways.x, hand[1] + sideways.y, hand[2] + sideways.z];
      const reach = Math.hypot(hand[0] - bit[0], hand[1] - bit[1], hand[2] - bit[2]);
      slack = Math.max(0.02, (0.95 * W - reach) * 0.6);
    } else {
      horseVector.set(rig.saddle.pommel[0], rig.saddle.pommel[1] + 0.02 * W, side * 0.05 * W);
      frame.localToWorld(horseVector);
      hand = [horseVector.x, horseVector.y, horseVector.z];
      slack = 0.3 * W;
    }
    for (let k = 0; k < HORSE_REIN_POINTS - 1; k += 1) {
      for (const j of [k, k + 1]) {
        const s = j / (HORSE_REIN_POINTS - 1);
        positions[at++] = bit[0] + (hand[0] - bit[0]) * s;
        positions[at++] = bit[1] + (hand[1] - bit[1]) * s - slack * 4 * s * (1 - s);
        positions[at++] = bit[2] + (hand[2] - bit[2]) * s;
      }
    }
  }
  hang.lines.geometry.attributes.position.needsUpdate = true;
}

// ---- Each frame ----------------------------------------------------------------------------

/** The leg the physics has broken or cut worst (the one that hangs), if the horse is lame. */
function lameLegOf(horse) {
  if (!horse.lame) return null;
  let worst = null;
  let most = -1;
  for (const leg of HORSE_SHAPE.legs) {
    const harm = horse.wounds?.[leg.key] ?? 0;
    if (harm > most) {
      most = harm;
      worst = leg.key;
    }
  }
  return worst;
}

const horseDown = [0, -1, 0];

/** Put the horse where it is now (its legs in their stride, rolled over if down). `world` gives the time and the rider. */
export function updateHorseView(view, world = null) {
  const horse = view.horse;
  const drawn = view.drawn;
  const rig = view.model.rig;
  Object.assign(drawn, { at: horse.at, yaw: horse.yaw, speed: horse.speed, stride: horse.stride, state: horse.state, roll: horse.roll, fall: horse.fall, withers: horse.withers, bank: horse.bank });
  poseHorse(drawn);
  const W = horse.withers;
  const time = world?.time ?? performance.now() / 1000;
  const dt = view.lastTime === null ? 0 : Math.max(0, Math.min(0.05, time - view.lastTime));
  view.lastTime = time;
  const up = horse.state === 'up';
  const speed = Math.abs(horse.speed);
  const pace = Math.min(1, speed / (horse.paces?.gallop ?? 10));
  const cycle = horse.stride;
  const fall = horse.fall ?? 0;
  // The gait's nod: head and neck rise and fall once a stride (a walk, a canter, a gallop), stretching forward with speed.
  const moving = up ? Math.min(1, speed / 1.5) : 0;
  const nod = Math.sin(cycle * Math.PI * 2 * (speed > 2.4 && speed < 4.6 ? 2 : 1) + 0.6) * moving;
  const idle = Math.sin(time * 0.7 + (horse.id ?? 0)) * 0.025 * (1 - moving);
  view.group.position.set(horse.at[0], (drawn.bob ?? 0) - (horse.sunk ?? 0), horse.at[1]);
  view.group.rotation.y = horse.yaw;
  // The body pitches (nose up and down) and rocks about its barrel with the stride, as the physics has it (physics/mounted.js horseMotion), and the fall's roll.
  view.body.rotation.z = drawn.pitch ?? 0;
  view.body.rotation.x = (horse.roll ?? 0) + (drawn.rock ?? 0);
  // Leaning into a turn: the whole horse about its hooves (the group stands on the ground; yaw, then the roll about its own forward line).
  view.group.rotation.order = 'YXZ';
  view.group.rotation.x = horse.bank ?? 0;
  view.body.position.y = 0.76 * W - fall * (0.76 * W - 0.21 * W);
  const pitchAmp = speed < 2.4 ? 0.07 : speed < 4.6 ? 0.025 : 0.06;
  view.neck.rotation.z = -0.22 * pace - pitchAmp * nod * 0.6 + idle - fall * 0.5 + (horse.dead ? -0.1 * fall : 0);
  view.head.rotation.z = 0.12 * pace + pitchAmp * nod * 0.9 - idle * 0.6 - fall * 0.1;
  view.neck.rotation.y = up ? Math.sin(cycle * Math.PI * 2) * 0.05 * moving : 0;
  // Ears: pricked when standing, pinned back at speed, a flick now and then.
  for (const { ear, side } of view.ears) {
    const flick = Math.max(0, Math.sin(time * 0.83 + side * 1.9 + (horse.id ?? 0))) ** 14 * 0.45;
    ear.rotation.z = -0.28 + 0.75 * pace - flick * 0.8;
    ear.rotation.x = side * (0.3 + 0.2 * pace + flick * 0.5);
    ear.rotation.y = side * -0.05;
  }
  // The legs: the physics' root, knee and hoof; the lower leg bent at the fetlock and the hoof set flat.
  view.lameLeg = lameLegOf(horse);
  const forward = [Math.cos(horse.yaw), 0, -Math.sin(horse.yaw)];
  const back = [-forward[0], 0, -forward[2]];
  const lengths = rig.lengths;
  for (const [key, pieces] of Object.entries(view.legs)) {
    const leg = drawn.legs[key];
    const root = leg.root;
    let knee = leg.knee;
    let hoof = leg.hoof;
    if (key === view.lameLeg) {
      // Broken: held up and swinging, the lower leg hanging from the knee.
      const swing = Math.sin(time * 3.1) * 0.03 * W;
      hoof = [root[0] + swing, root[1] - 0.26 * W, root[2]];
      const mid = [(root[0] + hoof[0]) / 2, (root[1] + hoof[1]) / 2, (root[2] + hoof[2]) / 2];
      knee = twoBoneIK(root, hoof, HORSE_SHAPE.upperLeg * W, HORSE_SHAPE.lowerLeg * W, vec.sub(leg.knee, mid));
    }
    const lifted = key === view.lameLeg ? 1 : Math.min(1, Math.max(0, (hoof[1] - 0.04 * W) / (0.05 * W)));
    // The sole rests on the ground when the hoof does; the coronet a hoof's height above it.
    const sole = [hoof[0], Math.max(0, hoof[1] - 0.03 * W), hoof[2]];
    const hoofHeight = lengths.hoof;
    let coronet = [sole[0], sole[1] + hoofHeight, sole[2]];
    coronet = vec.lerp(coronet, knee, 0.12 * lifted);
    let fetlock = twoBoneIK(knee, coronet, lengths.cannon, lengths.pastern, back);
    const axisDown = vec.normalize(vec.lerp(horseDown, vec.normalize(vec.sub(coronet, fetlock)), lifted));
    coronet = vec.sub(sole, vec.scale(axisDown, hoofHeight));
    if (lifted < 0.01) coronet = [sole[0], sole[1] + hoofHeight, sole[2]];
    fetlock = twoBoneIK(knee, coronet, lengths.cannon, lengths.pastern, back);
    const lower = vec.add(knee, vec.scale(vec.normalize(vec.sub(fetlock, knee)), lengths.cannon));
    layHorsePart(pieces.upper.holder, root, knee, forward);
    layHorsePart(pieces.cannon.holder, knee, lower, forward);
    if (pieces.pastern) {
      layHorsePart(pieces.pastern.holder, fetlock, coronet, forward);
      layHorsePart(pieces.hoof.holder, coronet, vec.add(coronet, axisDown), forward);
    }
  }
  // Hair and cloth hang from where everything now is.
  if (view.hang.mane) {
    view.group.updateMatrixWorld(true);
    const motion = { cycle, time, sway: 0.09 * moving + 0.03, stream: 0.5 * pace + 0.05 * (1 - moving), pace };
    updateMane(view.hang.mane, rig, motion);
    updateTail(view.hang.tail, rig, view.frame, motion, dt);
    const rider = world?.fighters.find((fighter) => fighter.id === horse.rider && fighter.mount === horse) ?? null;
    if (view.hang.trapper) updateTrapper(view.hang.trapper, rig, view.frame, drawn, dt);
    updateStirrups(view.hang.stirrups, rig, view.frame, horse, rider, dt);
    updateReins(view.hang.reins, rig, view.head, view.frame, horse, rider);
  }
}

/** Remove a horse's model. */
export function disposeHorseView(view, horseView) {
  view.scene.remove(horseView.group);
  disposeObject(horseView.group);
  for (const mesh of horseView.owned) {
    mesh.parent?.remove(mesh);
    disposeObject(mesh);
  }
  for (const pieces of Object.values(horseView.legs)) {
    for (const piece of Object.values(pieces)) {
      view.scene.remove(piece.holder);
      disposeObject(piece.holder);
    }
  }
}
