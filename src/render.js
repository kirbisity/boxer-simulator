// Three.js view of the fight world. Reads the simulation; never writes to it.
// Each fighter is drawn in four layers — skin, muscle, bone and the physics
// skeleton — from the same body model, and the skin is a soft shell: every
// vertex is a damped spring to its rest place, so a punch leaves a dent that
// ripples out and springs back at the speed the tissue under it allows.

/* global THREE */
import { P, SEGMENTS } from './body.js';
import { capsules, capsuleEnds, point, WORLD } from './physics.js';
import { yawRotate } from './pose.js';
import { SoftShell } from './soft.js';
import { buildHead } from './face.js';

const LAYERS = ['skin', 'muscle', 'bone', 'physics'];
const CORNER_COLORS = { red: 0xc8262c, blue: 0x2457c5 };
const SKIN_TONES = { light: 0xe8b796, medium: 0xc58c64, tan: 0xa8704a, deep: 0x7a4a2e };

const v3 = (array) => new THREE.Vector3(array[0], array[1], array[2]);

// ---- Scene -----------------------------------------------------------------

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d14);
  scene.fog = new THREE.Fog(0x0b0d14, 9, 22);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);

  scene.add(new THREE.HemisphereLight(0xb8c6e0, 0x3a2e24, 0.8));
  const key = new THREE.SpotLight(0xfff2e0, 1.5, 20, 0.62, 0.45, 1.2);
  key.position.set(0.8, 7.5, 1.2);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 3;
  key.shadow.camera.far = 12;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x6f8cff, 0.35);
  rim.position.set(-4, 3, -5);
  scene.add(rim);
  scene.add(buildRing());
  return { renderer, scene, camera, orbit: { yaw: -0.5, pitch: 0.2, distance: 5.2, target: new THREE.Vector3(0, 1.1, 0) } };
}

function buildRing() {
  const ring = new THREE.Group();
  const half = WORLD.ringHalf + 0.2;
  const canvas = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.6, 0.4, half * 2 + 0.6), new THREE.MeshStandardMaterial({ color: 0x9aa7b8, roughness: 0.92 }));
  canvas.position.y = -0.2;
  canvas.receiveShadow = true;
  ring.add(canvas);
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshStandardMaterial({ color: 0x8592a6, roughness: 0.95 }));
  logo.rotation.x = -Math.PI / 2;
  logo.position.y = 0.002;
  logo.receiveShadow = true;
  ring.add(logo);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.7, 1.1, half * 2 + 0.7), new THREE.MeshStandardMaterial({ color: 0x171a24, roughness: 0.8 }));
  skirt.position.y = -0.95;
  ring.add(skirt);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x0e1018, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.5;
  ring.add(floor);

  const corners = [[half, half, 0xd8d8d8], [-half, half, CORNER_COLORS.red], [-half, -half, 0xd8d8d8], [half, -half, CORNER_COLORS.blue]];
  for (const [x, z, color] of corners) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.45, 12), new THREE.MeshStandardMaterial({ color: 0x9ea3ad, metalness: 0.6, roughness: 0.35 }));
    post.position.set(x, 0.72, z);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.05, 0.16), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    pad.position.set(x * 0.985, 0.85, z * 0.985);
    ring.add(post, pad);
  }
  const ropeMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });
  for (const height of [0.42, 0.82, 1.22]) {
    for (let side = 0; side < 4; side += 1) {
      const [ax, az] = corners[side];
      const [bx, bz] = corners[(side + 1) % 4];
      const length = Math.hypot(bx - ax, bz - az);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, length, 8), ropeMaterial);
      rope.position.set((ax + bx) / 2, height, (az + bz) / 2);
      rope.rotation.z = Math.PI / 2;
      rope.rotation.y = Math.atan2(-(bz - az), bx - ax);
      rope.castShadow = true;
      ring.add(rope);
    }
  }
  return ring;
}

export function resize(view, width, height) {
  view.renderer.setSize(width, height, false);
  view.camera.aspect = width / Math.max(1, height);
  view.camera.updateProjectionMatrix();
}

export function placeCamera(view, focus) {
  const orbit = view.orbit;
  if (focus) orbit.target.lerp(new THREE.Vector3(focus[0], 1.1, focus[2]), 0.06);
  const { yaw, pitch, distance, target } = orbit;
  view.camera.position.set(
    target.x + Math.cos(pitch) * Math.cos(yaw) * distance,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(pitch) * Math.sin(yaw) * distance,
  );
  view.camera.lookAt(target);
}

// ---- Shapes ----------------------------------------------------------------

/** Lathe profile along +y from 0 to `length`, rounded at both ends. */
function limbGeometry(radius, length, shape, segments = 18) {
  const points = [];
  const rows = 14;
  const capTop = radius * 0.55;
  const capBottom = radius * 0.6;
  points.push(new THREE.Vector2(0.0001, -capBottom));
  for (let row = 0; row <= rows; row += 1) {
    const u = row / rows;
    points.push(new THREE.Vector2(radius * shape(u), u * length));
  }
  points.push(new THREE.Vector2(radius * shape(1) * 0.6, length + capTop * 0.7));
  points.push(new THREE.Vector2(0.0001, length + capTop));
  return new THREE.LatheGeometry(points, segments);
}

// Muscle bellies sit nearer the proximal joint; tendons taper distally.
const SHAPES = {
  upperArm: (u) => 0.82 + 0.34 * Math.sin(Math.PI * Math.min(1, u * 1.15)),
  forearm: (u) => (u < 0.82 ? 1.12 - 0.42 * u : 0.78),
  thigh: (u) => 1.16 - 0.32 * u + 0.08 * Math.sin(Math.PI * u),
  shank: (u) => 0.78 + 0.42 * Math.exp(-((u - 0.28) ** 2) / 0.03) - 0.12 * u,
  bone: (u) => 1 + 0.6 * Math.exp(-(u * u) / 0.004) + 0.6 * Math.exp(-((1 - u) ** 2) / 0.004),
};

function torsoGeometry(body, kind, range = [-0.05, 1.04], inflate = 1) {
  const trunk = body.segments.trunk;
  const fatShare = trunk.tissue.fat / trunk.mass;
  const base = kind === 'skin' ? trunk.skinRadius : trunk.muscleRadius;
  const length = trunk.length;
  const shoulderHalf = body.lengths.shoulderSpan / 2;
  const hipHalf = body.lengths.hipSpan / 2 + base * 0.45;
  const width = (u) => {
    // Hips → waist → chest → shoulders → neck, in metres of half-width.
    const waist = base * (0.86 + fatShare * 1.1);
    const chest = Math.max(base * 1.05, shoulderHalf * 0.9);
    const stops = [[0, hipHalf], [0.32, waist], [0.66, chest], [0.9, shoulderHalf + base * 0.22], [1.04, base * 0.42]];
    for (let index = 1; index < stops.length; index += 1) {
      const [u0, w0] = stops[index - 1];
      const [u1, w1] = stops[index];
      if (u <= u1) {
        const t = (u - u0) / (u1 - u0);
        return w0 + (w1 - w0) * (t * t * (3 - 2 * t));
      }
    }
    return stops.at(-1)[1];
  };
  const [start, end] = range;
  const points = start < 0 ? [new THREE.Vector2(0.0001, (start - 0.02) * length)] : [];
  for (let row = 0; row <= 20; row += 1) {
    const u = start + (row / 20) * (end - start);
    points.push(new THREE.Vector2(width(Math.max(0, u)) * inflate, u * length));
  }
  if (end > 1) points.push(new THREE.Vector2(0.0001, (end + 0.02) * length));
  const geometry = new THREE.LatheGeometry(points, 28);
  // Deeper with fat (the belly), shallower without; the lathe is round.
  const depth = (0.62 + fatShare * 0.7) * (kind === 'skin' ? 1 : 0.92);
  geometry.scale(1, 1, depth);
  return geometry;
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: options.roughness ?? 0.65, metalness: 0, transparent: !!options.opacity, opacity: options.opacity ?? 1, depthWrite: !options.opacity });
}

// ---- Fighter view ---------------------------------------------------------

export function buildFighterView(view, fighter) {
  const body = fighter.body;
  const look = body.inputs.look ?? {};
  const corner = CORNER_COLORS[fighter.corner];
  const skinColor = SKIN_TONES[look.skinTone ?? 'medium'];
  const group = new THREE.Group();
  const layers = Object.fromEntries(LAYERS.map((name) => [name, new THREE.Group()]));
  for (const layer of Object.values(layers)) group.add(layer);
  const skinMaterial = material(skinColor, { roughness: 0.55 });
  const muscleMaterial = material(0xa3333a, { roughness: 0.45 });
  const tendonMaterial = material(0xd9c7b5, { roughness: 0.5 });
  const boneMaterial = material(0xf1ead8, { roughness: 0.8 });
  const parts = [];
  const shells = [];

  const addSegment = (layer, key, geometry, mat, from, to, options = {}) => {
    const shell = options.soft ? new SoftShell(geometry, mat, body.segments[options.segment ?? key]?.fleshFirmness ?? 0.6) : null;
    const mesh = shell ? shell.mesh : new THREE.Mesh(geometry, mat);
    mesh.castShadow = true;
    layers[layer].add(mesh);
    const part = { key, mesh, from, to, layer, length: options.length, basis: options.basis ?? 'limb', lerp: options.lerp, shell };
    parts.push(part);
    if (shell) shells.push(part);
    return part;
  };

  // Limbs: skin over muscle over bone, each sized from its own tissue mass.
  for (const key of Object.keys(SEGMENTS)) {
    if (key === 'head' || key === 'trunk') continue;
    const segment = body.segments[key];
    const kind = segment.kind;
    const { from, to } = SEGMENTS[key];
    addSegment('skin', key, limbGeometry(segment.skinRadius, segment.length, SHAPES[kind]), skinMaterial, P[from], P[to], { soft: true, length: segment.length });
    addSegment('muscle', key, limbGeometry(segment.muscleRadius, segment.length, SHAPES[kind]), muscleMaterial, P[from], P[to], { soft: true, length: segment.length });
    addSegment('bone', key, limbGeometry(Math.max(0.011, segment.boneRadius * 0.75), segment.length, SHAPES.bone, 10), boneMaterial, P[from], P[to], { length: segment.length });
  }
  // Trunk, neck and shoulders.
  addSegment('skin', 'trunk', torsoGeometry(body, 'skin'), skinMaterial, P.pelvis, P.neck, { soft: true, length: body.segments.trunk.length, basis: 'trunk' });
  addSegment('muscle', 'trunk', torsoGeometry(body, 'muscle'), muscleMaterial, P.pelvis, P.neck, { soft: true, length: body.segments.trunk.length, basis: 'trunk' });
  // A neck is about 0.6 of the head's radius, thicker with training.
  const neckRadius = body.lengths.headRadius * (0.56 + 0.14 * body.neckIndex);
  const neckLength = body.lengths.neckToHead;
  addSegment('skin', 'neck', limbGeometry(neckRadius, neckLength * 0.7, () => 1), skinMaterial, P.neck, P.head, { length: neckLength * 0.7 });
  addSegment('muscle', 'neck', limbGeometry(neckRadius * 0.92, neckLength * 0.7, (u) => 1 - 0.1 * u), muscleMaterial, P.neck, P.head, { length: neckLength * 0.7 });
  addSegment('bone', 'spine', limbGeometry(0.016, body.segments.trunk.length + neckLength * 0.6, () => 1, 8), boneMaterial, P.pelvis, P.head, { length: body.segments.trunk.length + neckLength * 0.6 });
  // Trapezius: the slope from the neck down to the shoulders.
  const trapsGeometry = new THREE.SphereGeometry(1, 20, 12);
  trapsGeometry.scale(body.lengths.shoulderSpan * 0.42, 0.075 * body.heightM / 1.8 * (0.8 + 0.4 * body.neckIndex), body.segments.trunk.skinRadius * 0.52);
  trapsGeometry.translate(0, body.segments.trunk.length * 0.95, -0.01);
  addSegment('skin', 'traps', trapsGeometry, skinMaterial, P.pelvis, P.neck, { length: body.segments.trunk.length, basis: 'trunk' });
  for (const side of ['l', 'r']) {
    const deltoid = body.segments[`${side}UpperArm`].skinRadius * 1.3;
    addSegment('skin', `${side}Deltoid`, new THREE.SphereGeometry(deltoid, 16, 12), skinMaterial, P[`${side}Shoulder`], P[`${side}Shoulder`], { basis: 'point' });
    addSegment('muscle', `${side}Deltoid`, new THREE.SphereGeometry(deltoid * 0.92, 14, 10), muscleMaterial, P[`${side}Shoulder`], P[`${side}Shoulder`], { basis: 'point' });
    addSegment('bone', `${side}Clavicle`, limbGeometry(0.012, body.lengths.shoulderSpan / 2, () => 1, 8), boneMaterial, P.neck, P[`${side}Shoulder`], { length: body.lengths.shoulderSpan / 2 });
  }
  // Rib cage and pelvis bones, sized from the trunk.
  const ribs = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), new THREE.MeshStandardMaterial({ color: 0xf1ead8, wireframe: true }));
  layers.bone.add(ribs);
  parts.push({ key: 'ribs', mesh: ribs, from: P.pelvis, to: P.neck, basis: 'ribs', layer: 'bone' });
  const pelvisBone = new THREE.Mesh(new THREE.TorusGeometry(body.lengths.hipSpan * 0.62, 0.025, 8, 18), boneMaterial);
  layers.bone.add(pelvisBone);
  parts.push({ key: 'pelvisBone', mesh: pelvisBone, from: P.pelvis, to: P.neck, basis: 'pelvis', layer: 'bone' });

  // Head: skull, face, hair, all oriented by the neck and the facing.
  const headRadius = body.lengths.headRadius;
  const headView = buildHead(body, look, skinColor, corner);
  layers.skin.add(headView.group);
  parts.push({ key: 'head', mesh: headView.group, from: P.neck, to: P.head, basis: 'head', layer: 'skin', shell: headView.shell });
  shells.push({ key: 'head', shell: headView.shell });
  const skullBone = new THREE.Mesh(new THREE.SphereGeometry(headRadius * 0.82, 16, 12), boneMaterial);
  skullBone.scale.set(0.95, 1.08, 0.85);
  layers.bone.add(skullBone);
  parts.push({ key: 'skull', mesh: skullBone, from: P.neck, to: P.head, basis: 'head', layer: 'bone' });

  // Gloves, cuffs, shorts, shoes: in the corner's colour.
  const gloveMaterial = material(corner, { roughness: 0.32 });
  for (const side of ['l', 'r']) {
    const glove = new THREE.Group();
    const fist = new THREE.Mesh(new THREE.SphereGeometry(WORLD.gloveRadius * 1.12, 18, 14), gloveMaterial);
    fist.scale.set(1, 1.18, 0.95);
    const thumb = new THREE.Mesh(new THREE.SphereGeometry(WORLD.gloveRadius * 0.42, 10, 8), gloveMaterial);
    thumb.position.set(side === 'l' ? -0.045 : 0.045, -0.01, 0.04);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.07, 14), material(0xf2f2f2, { roughness: 0.5 }));
    cuff.position.y = -0.085;
    glove.add(fist, thumb, cuff);
    glove.traverse((mesh) => { mesh.castShadow = true; });
    layers.skin.add(glove);
    parts.push({ key: `${side}Glove`, mesh: glove, from: P[`${side}Elbow`], to: P[`${side}Hand`], basis: 'glove', layer: 'skin' });
    const shortsLeg = limbGeometry(body.segments[`${side}Thigh`].skinRadius * 1.16, body.segments[`${side}Thigh`].length * 0.42, (u) => 1.05 - 0.08 * u);
    addSegment('skin', `${side}Shorts`, shortsLeg, material(corner, { roughness: 0.4 }), P[`${side}Hip`], P[`${side}Knee`], { length: body.segments[`${side}Thigh`].length });
    const shoeLength = 0.25 * body.heightM / 1.8;
    const shoeGeometry = new THREE.SphereGeometry(1, 16, 10);
    shoeGeometry.scale(shoeLength / 2, 0.045, 0.048);
    // The ankle sits over the heel: the foot reaches forward of it.
    shoeGeometry.translate(shoeLength * 0.28, -0.012, 0);
    const shoe = new THREE.Mesh(shoeGeometry, material(0x15151a, { roughness: 0.4 }));
    shoe.castShadow = true;
    layers.skin.add(shoe);
    parts.push({ key: `${side}Shoe`, mesh: shoe, from: P[`${side}Foot`], to: P[`${side}Foot`], basis: 'shoe', layer: 'skin' });
  }
  // Shorts: the lower trunk's own shape, a little proud of the skin.
  const shortsMaterial = material(corner, { roughness: 0.4 });
  shortsMaterial.side = THREE.DoubleSide;
  addSegment('skin', 'shorts', torsoGeometry(body, 'skin', [-0.06, 0.24], 1.05), shortsMaterial, P.pelvis, P.neck, { length: body.segments.trunk.length, basis: 'trunk' });
  addSegment('skin', 'waistband', torsoGeometry(body, 'skin', [0.2, 0.27], 1.07), material(0xf4f4f4, { roughness: 0.4 }), P.pelvis, P.neck, { length: body.segments.trunk.length, basis: 'trunk' });

  // The physics layer: particles, constraints, motor targets, collision capsules.
  const particleMaterial = material(0xffd34d, { roughness: 0.3 });
  const particles = fighter.body.masses.map((mass) => {
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.014 + 0.004 * Math.cbrt(mass), 10, 8), particleMaterial);
    layers.physics.add(sphere);
    return sphere;
  });
  const lineCount = fighter.constraints.length + fighter.body.masses.length;
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
  lines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lineCount * 6), 3));
  const colors = new Float32Array(lineCount * 6);
  fighter.constraints.forEach((constraint, index) => {
    const color = constraint.compliance === 0 ? [1, 1, 1] : [0.55, 0.6, 0.7];
    colors.set([...color, ...color], index * 6);
  });
  for (let index = fighter.constraints.length; index < lineCount; index += 1) colors.set([0.3, 1, 0.5, 0.3, 1, 0.5], index * 6);
  lines.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  lines.frustumCulled = false;
  layers.physics.add(lines);
  const capsuleMaterial = new THREE.MeshBasicMaterial({ color: 0x46e0ff, wireframe: true, transparent: true, opacity: 0.35 });
  const capsuleMeshes = capsules(fighter).map((capsule) => {
    const isSphere = capsule.a === capsule.b;
    const mesh = new THREE.Mesh(isSphere ? new THREE.SphereGeometry(capsule.radius, 12, 8) : new THREE.CylinderGeometry(capsule.radius, capsule.radius, 1, 12, 1, true), capsuleMaterial);
    layers.physics.add(mesh);
    return { capsule, mesh, isSphere };
  });
  const gloveSpheres = ['l', 'r'].map((side) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(WORLD.gloveRadius, 12, 8), capsuleMaterial);
    layers.physics.add(mesh);
    return { index: P[`${side}Hand`], mesh };
  });

  view.scene.add(group);
  return { fighter, group, layers, parts, shells, particles, lines, capsuleMeshes, gloveSpheres, head: headView, layer: 'skin', materials: { skinMaterial, muscleMaterial, tendonMaterial, boneMaterial } };
}

export function disposeFighterView(view, fighterView) {
  view.scene.remove(fighterView.group);
  fighterView.group.traverse((object) => {
    object.geometry?.dispose();
  });
}

/** Which layers show: skin; muscle (with bone); bone; physics over ghosted skin. */
export function setLayer(fighterView, layer) {
  fighterView.layer = layer;
  const { layers, materials } = fighterView;
  layers.skin.visible = layer === 'skin' || layer === 'physics' || layer === 'bone';
  layers.muscle.visible = layer === 'muscle';
  layers.bone.visible = layer === 'muscle' || layer === 'bone';
  layers.physics.visible = layer === 'physics';
  const ghost = layer === 'physics' ? 0.22 : layer === 'bone' ? 0.12 : 1;
  layers.skin.traverse((object) => {
    if (!object.material) return;
    object.material.transparent = ghost < 1;
    object.material.opacity = ghost;
    object.material.depthWrite = ghost === 1;
    object.castShadow = ghost === 1;
  });
  void materials;
}

// ---- Per-frame update -----------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

function basisMatrix(xAxis, yAxis, origin) {
  const y = yAxis.clone().normalize();
  const x = xAxis.clone().sub(y.clone().multiplyScalar(xAxis.dot(y))).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(origin);
}

export function updateFighterView(fighterView, dt, time) {
  const fighter = fighterView.fighter;
  const at = (index) => v3(point(fighter.x, index));
  const forward = v3(yawRotate([1, 0, 0], fighter.yaw));
  const across = at(P.lShoulder).sub(at(P.rShoulder));
  const hipAcross = at(P.lHip).sub(at(P.rHip));

  for (const part of fighterView.parts) {
    const a = at(part.from);
    const b = at(part.to);
    const mesh = part.mesh;
    mesh.matrixAutoUpdate = false;
    if (part.basis === 'limb') {
      const axis = tmpA.copy(b).sub(a);
      const length = axis.length() || 1e-6;
      const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, axis.clone().divideScalar(length));
      mesh.matrix.compose(a, quaternion, new THREE.Vector3(1, part.length ? length / part.length : 1, 1));
    } else if (part.basis === 'trunk') {
      const axis = b.clone().sub(a);
      const matrix = basisMatrix(across.clone().add(hipAcross).negate(), axis, a);
      matrix.scale(new THREE.Vector3(1, axis.length() / part.length, 1));
      mesh.matrix.copy(matrix);
    } else if (part.basis === 'ribs') {
      const trunk = fighter.body.segments.trunk;
      const center = a.clone().lerp(b, 0.66);
      const matrix = basisMatrix(across.clone().negate(), b.clone().sub(a), center);
      matrix.scale(new THREE.Vector3(fighter.body.lengths.shoulderSpan * 0.42, trunk.length * 0.33, trunk.muscleRadius * 0.62));
      mesh.matrix.copy(matrix);
    } else if (part.basis === 'pelvis') {
      const matrix = basisMatrix(hipAcross.clone().negate(), b.clone().sub(a), a);
      matrix.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.3));
      mesh.matrix.copy(matrix);
    } else if (part.basis === 'head') {
      const up = b.clone().sub(a);
      const matrix = basisMatrix(forward, up, b);
      mesh.matrix.copy(matrix);
    } else if (part.basis === 'glove') {
      const axis = b.clone().sub(a);
      const matrix = basisMatrix(forward, axis, b);
      mesh.matrix.copy(matrix);
    } else if (part.basis === 'shoe') {
      const matrix = basisMatrix(forward, UP, a.clone().setY(Math.max(0.045, a.y)));
      mesh.matrix.copy(matrix);
    } else if (part.basis === 'point') {
      mesh.matrix.makeTranslation(a.x, a.y, a.z);
    }
    mesh.matrixWorldNeedsUpdate = true;
  }
  for (const entry of fighterView.shells) entry.shell.update(Math.min(dt, 1 / 30));
  fighterView.head.update(Math.min(dt, 1 / 30), fighter, time);

  if (fighterView.layer === 'physics') updatePhysicsLayer(fighterView);
}

function updatePhysicsLayer(fighterView) {
  const fighter = fighterView.fighter;
  fighterView.particles.forEach((sphere, index) => {
    const p = point(fighter.x, index);
    sphere.position.set(p[0], p[1], p[2]);
  });
  const positions = fighterView.lines.geometry.attributes.position.array;
  let cursor = 0;
  for (const constraint of fighter.constraints) {
    positions.set(point(fighter.x, constraint.i), cursor);
    positions.set(point(fighter.x, constraint.j), cursor + 3);
    cursor += 6;
  }
  // Green: from each particle to where its motor is pulling it.
  for (let index = 0; index < fighter.body.masses.length; index += 1) {
    positions.set(point(fighter.x, index), cursor);
    positions.set(fighter.targets[index] ?? point(fighter.x, index), cursor + 3);
    cursor += 6;
  }
  fighterView.lines.geometry.attributes.position.needsUpdate = true;
  for (const { capsule, mesh, isSphere } of fighterView.capsuleMeshes) {
    const [a, b] = capsuleEnds(fighter, capsule).map(v3);
    if (isSphere) {
      mesh.position.copy(a);
      continue;
    }
    const axis = tmpB.copy(b).sub(a);
    mesh.position.copy(a).addScaledVector(axis, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, axis.clone().normalize());
    mesh.scale.set(1, axis.length(), 1);
  }
  for (const { index, mesh } of fighterView.gloveSpheres) mesh.position.copy(v3(point(fighter.x, index)));
}

/** Show an impact: dent the struck flesh and throw a spray of sweat. */
export function showImpact(view, fighterViews, event) {
  const defenderView = fighterViews.find((entry) => entry.fighter.id === event.defender);
  if (!defenderView) return;
  const where = v3(event.point);
  const candidates = defenderView.shells.filter((entry) => entry.key === event.target || (event.target === 'head' && entry.key === 'head'));
  for (const entry of candidates) entry.shell.dent(where, event.impulse);
  const spray = view.spray ?? (view.spray = []);
  const count = Math.min(14, Math.round(event.impulse / 2));
  for (let index = 0; index < count; index += 1) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.008 + Math.random() * 0.006, 6, 4), new THREE.MeshBasicMaterial({ color: 0xdfe9ff, transparent: true, opacity: 0.85 }));
    drop.position.copy(where);
    const direction = v3(event.normal).multiplyScalar(-1).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5));
    drop.userData = { velocity: direction.normalize().multiplyScalar(1.5 + Math.random() * event.speed * 0.35), life: 0.6 };
    view.scene.add(drop);
    spray.push(drop);
  }
}

export function updateSpray(view, dt) {
  if (!view.spray) return;
  view.spray = view.spray.filter((drop) => {
    drop.userData.life -= dt;
    drop.userData.velocity.y -= 9.81 * dt;
    drop.position.addScaledVector(drop.userData.velocity, dt);
    drop.material.opacity = Math.max(0, drop.userData.life / 0.6);
    if (drop.userData.life > 0 && drop.position.y > 0) return true;
    view.scene.remove(drop);
    drop.geometry.dispose();
    return false;
  });
}

export function render(view) {
  view.renderer.render(view.scene, view.camera);
}
