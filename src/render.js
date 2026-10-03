// Three.js view of the fight world. Reads the simulation; never writes to it.
// Each fighter is one skinned body over a rig that the physics skeleton
// drives, drawn in four layers: skin, muscle, bone and the physics itself.
// The skin is a soft shell: every vertex is a damped spring about its rest
// place, so a punch leaves a dent that springs back at the tissue's speed.

/* global THREE */
import { P, PARTICLES } from './body.js';
import { buildBodyMesh } from './bodymesh.js';
import { buildSkeleton } from './bones.js';
import { buildHead } from './face.js';
import { capsules, capsuleEnds, point, WORLD } from './physics.js';
import { BONE, BONES, boneFrames, frameMatrix, fromFrame, toFrame } from './rig.js';
import { SoftShell } from './soft.js';
import { outlineFor, surface } from './toon.js';

const LAYERS = ['skin', 'muscle', 'bone', 'physics'];
const CORNER_COLORS = { red: 0xc8262c, blue: 0x2457c5 };
const SKIN_TONES = { light: 0xe8b796, medium: 0xc58c64, tan: 0xa8704a, deep: 0x7a4a2e };

// Drawn characters carry slightly large heads; it is what makes them read
// as characters rather than as small-headed mannequins.
const HEAD_SCALE = 1.12;
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

  scene.add(new THREE.HemisphereLight(0xb8c6e0, 0x3a2e24, 0.62));
  const key = new THREE.SpotLight(0xfff2e0, 1.2, 20, 0.62, 0.45, 1.2);
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

// ---- Fighter view ---------------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);
const tmpB = new THREE.Vector3();
const ARM_BONES = new Set(['lClavicle', 'lUpperArm', 'lForearm', 'rClavicle', 'rUpperArm', 'rForearm'].map((name) => BONE[name]));

/** Kit and skin colours painted onto the body by where each vertex sits in the bind pose. */
function paintBody(mesh, body, look, corner) {
  const { positions, skinIndex, bindPoints } = mesh;
  const skin = new THREE.Color(SKIN_TONES[look.skinTone ?? 'medium']);
  const shorts = new THREE.Color(corner);
  const band = new THREE.Color(0xf4f4f4);
  const top = new THREE.Color(corner).multiplyScalar(0.7);
  const hipY = bindPoints[P.pelvis][1];
  const trunk = body.lengths.trunk;
  const legReach = body.lengths.hipSpan / 2 + body.segments.lThigh.skinRadius * 1.7;
  const colors = new Float32Array(positions.length);
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    const y = positions[vertex * 3 + 1];
    const z = positions[vertex * 3 + 2];
    const onArm = ARM_BONES.has(skinIndex[vertex * 4]);
    let color = skin;
    if (!onArm && Math.abs(z) < legReach && y > hipY - body.lengths.thigh * 0.42 && y < hipY + trunk * 0.24) {
      color = y > hipY + trunk * 0.17 ? band : shorts;
    }
    if (!onArm && body.inputs.sex === 'female' && y > hipY + trunk * 0.56 && y < hipY + trunk * 0.9) color = top;
    colors.set([color.r, color.g, color.b], vertex * 3);
  }
  return colors;
}

/** Muscle red, paling to tendon near the joints the muscles cross. */
function paintMuscle(mesh) {
  const { positions, bindPoints } = mesh;
  const red = new THREE.Color(0xa3333a);
  const tendon = new THREE.Color(0xe2cdb4);
  const joints = ['lElbow', 'rElbow', 'lKnee', 'rKnee', 'lHand', 'rHand', 'lFoot', 'rFoot'].map((name) => bindPoints[P[name]]);
  const colors = new Float32Array(positions.length);
  const mixed = new THREE.Color();
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    let nearest = Infinity;
    for (const joint of joints) {
      nearest = Math.min(nearest, Math.hypot(positions[vertex * 3] - joint[0], positions[vertex * 3 + 1] - joint[1], positions[vertex * 3 + 2] - joint[2]));
    }
    mixed.copy(red).lerp(tendon, Math.max(0, Math.min(1, (0.07 - nearest) / 0.05)));
    colors.set([mixed.r, mixed.g, mixed.b], vertex * 3);
  }
  return colors;
}

/** A skinned mesh over the rig's bones from a built body mesh. */
function skinnedMesh(built, bones, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(built.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(built.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(built.skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(built.skinWeight, 4));
  geometry.setIndex(new THREE.BufferAttribute(built.indices, 1));
  const inverses = built.bindFrames.map((frame) => new THREE.Matrix4().fromArray(frameMatrix(frame)).invert());
  const mesh = new THREE.SkinnedMesh(geometry, surface(0xffffff, { skinning: true, vertexColors: true, roughness: 0.55 }));
  mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

export function buildFighterView(view, fighter) {
  const body = fighter.body;
  const look = body.inputs.look ?? {};
  const corner = CORNER_COLORS[fighter.corner];
  const skinColor = SKIN_TONES[look.skinTone ?? 'medium'];
  const group = new THREE.Group();
  const layers = Object.fromEntries(LAYERS.map((name) => [name, new THREE.Group()]));
  for (const layer of Object.values(layers)) group.add(layer);

  // The rig: bones whose world matrices are set straight from the physics.
  const bones = BONES.map(() => {
    const bone = new THREE.Bone();
    bone.matrixAutoUpdate = false;
    return bone;
  });
  const built = buildBodyMesh(body, 'skin');
  const skinMesh = skinnedMesh(built, bones, paintBody(built, body, look, corner));
  const skinOutline = outlineFor(skinMesh);
  layers.skin.add(skinMesh, skinOutline);
  const shells = [{ key: 'body', shell: new SoftShell(null, null, body.segments.trunk.fleshFirmness, { mesh: skinMesh, recomputeNormals: false }) }];

  const headView = buildHead(body, look, skinColor, corner);
  headView.group.matrixAutoUpdate = false;
  layers.skin.add(headView.group);
  shells.push({ key: 'head', shell: headView.shell });

  // Gloves and shoes ride on the forearm and foot bones.
  const attachments = [];
  const gloveMaterial = surface(corner, { roughness: 0.32 });
  for (const side of ['l', 'r']) {
    const glove = new THREE.Group();
    const fist = new THREE.Mesh(new THREE.SphereGeometry(WORLD.gloveRadius * 1.12, 20, 16), gloveMaterial);
    fist.scale.set(1, 1.15, 0.95);
    const thumb = new THREE.Mesh(new THREE.SphereGeometry(WORLD.gloveRadius * 0.42, 10, 8), gloveMaterial);
    thumb.position.set(0.045, -0.01, side === 'l' ? -0.04 : 0.04);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.08, 16), surface(0xf2f2f2));
    cuff.position.y = -0.09;
    for (const piece of [fist, thumb, cuff]) {
      piece.castShadow = true;
      piece.add(outlineFor(piece, 0.004));
    }
    glove.add(fist, thumb, cuff);
    glove.matrixAutoUpdate = false;
    layers.skin.add(glove);
    attachments.push({ object: glove, bone: BONE[`${side}Forearm`], at: P[`${side}Hand`] });

    const shoe = new THREE.Group();
    const length = 0.25 * body.heightM / 1.8;
    const sole = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), surface(0x17171c, { roughness: 0.4 }));
    sole.scale.set(0.05, length / 2, 0.045);
    sole.position.set(-0.012, length * 0.28, 0);
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.07, 14), surface(0xf2f2f2));
    sock.rotation.z = Math.PI / 2;
    sock.position.set(0.03, 0.0, 0);
    for (const piece of [sole, sock]) {
      piece.castShadow = true;
      piece.add(outlineFor(piece, 0.004));
    }
    shoe.add(sole, sock);
    shoe.matrixAutoUpdate = false;
    layers.skin.add(shoe);
    attachments.push({ object: shoe, bone: BONE[`${side}Foot`], at: P[`${side}Foot`] });
  }

  // Bone layer: the anatomical skeleton, moved rigidly with the rig.
  const skeleton = buildSkeleton(body, built.bindFrames);
  for (const piece of skeleton) layers.bone.add(piece);

  // The physics layer: particles, constraints, motor targets, collision capsules.
  const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xffd34d });
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
  return {
    fighter, group, layers, bones, built, skinMesh, skinOutline, muscle: null, skeleton, attachments, shells,
    particles, lines, capsuleMeshes, gloveSpheres, head: headView, layer: 'skin', frames: built.bindFrames,
  };
}

/** The muscle layer is built the first time it is shown: it costs a body mesh. */
function ensureMuscle(fighterView) {
  if (fighterView.muscle) return;
  const built = buildBodyMesh(fighterView.fighter.body, 'muscle', 0.016);
  const mesh = skinnedMesh(built, fighterView.bones, paintMuscle(built));
  fighterView.layers.muscle.add(mesh, outlineFor(mesh, 0.003));
  fighterView.muscle = { built, mesh };
}

export function disposeFighterView(view, fighterView) {
  view.scene.remove(fighterView.group);
  fighterView.group.traverse((object) => {
    object.geometry?.dispose();
  });
}

/** Which layers show: skin; muscle (with bone); bone over a ghost; physics over a ghost. */
export function setLayer(fighterView, layer) {
  fighterView.layer = layer;
  if (layer === 'muscle') ensureMuscle(fighterView);
  const { layers, skinMesh, skinOutline, head, attachments } = fighterView;
  const ghost = layer === 'physics' ? 0.25 : layer === 'bone' ? 0.12 : 1;
  layers.skin.visible = layer !== 'muscle';
  layers.muscle.visible = layer === 'muscle';
  layers.bone.visible = layer === 'muscle' || layer === 'bone';
  layers.physics.visible = layer === 'physics';
  // Ghosting: the body goes see-through and drops its ink; the head and kit hide.
  const material = skinMesh.material;
  material.transparent = ghost < 1;
  material.opacity = ghost;
  material.depthWrite = ghost === 1;
  skinMesh.castShadow = ghost === 1;
  skinOutline.visible = ghost === 1;
  head.group.visible = ghost === 1;
  for (const { object } of attachments) object.visible = ghost === 1;
}

// ---- Per-frame update -----------------------------------------------------

export function updateFighterView(fighterView, dt, time) {
  const fighter = fighterView.fighter;
  const points = PARTICLES.map((_, index) => point(fighter.x, index));
  const frames = boneFrames(points, fighter.body);
  fighterView.frames = frames;
  frames.forEach((frame, index) => {
    const matrix = frameMatrix(frame);
    fighterView.bones[index].matrixWorld.fromArray(matrix);
    fighterView.skeleton[index].matrix.fromArray(matrix);
    fighterView.skeleton[index].matrixWorldNeedsUpdate = true;
  });
  fighterView.head.group.matrix.fromArray(frameMatrix(frames[BONE.head])).scale(new THREE.Vector3(HEAD_SCALE, HEAD_SCALE, HEAD_SCALE));
  fighterView.head.group.matrixWorldNeedsUpdate = true;
  for (const { object, bone, at } of fighterView.attachments) {
    object.matrix.fromArray(frameMatrix({ ...frames[bone], origin: points[at] }));
    object.matrixWorldNeedsUpdate = true;
  }
  const step = Math.min(dt, 1 / 30);
  for (const entry of fighterView.shells) entry.shell.update(step);
  fighterView.head.update(step, fighter, time);
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
  if (event.target === 'head') defenderView.head.shell.dent(where, event.impulse);
  else {
    // Carry the world point back to the bind pose through the struck bone.
    const frames = defenderView.frames;
    let bone = BONE[event.target] ?? BONE.chest;
    if (event.target === 'trunk') {
      const distanceTo = (index) => Math.hypot(...toFrame(frames[index], event.point));
      bone = [BONE.pelvis, BONE.spine, BONE.chest].reduce((best, index) => (distanceTo(index) < distanceTo(best) ? index : best));
    }
    const bind = fromFrame(defenderView.built.bindFrames[bone], toFrame(frames[bone], event.point));
    defenderView.shells[0].shell.dentLocal(v3(bind), event.impulse);
  }
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
