// Three.js view of the fight world. Reads the simulation; never writes to it.
// Each fighter is one skinned body over a rig that the physics skeleton
// drives, drawn in four layers: skin, muscle, bone and the physics itself.
// The skin is a soft shell: every vertex is a damped spring about its rest
// place, so a punch leaves a dent that springs back at the tissue's speed.

/* global THREE */
import { P, PARTICLES } from './body.js';
import { buildBodyMesh } from './bodymesh.js';
import { buildLoftBody, CLOTHES } from './loftbody.js';
import { buildSkeleton } from './bones.js';
import { Dangle } from './dangle.js';
import { buildHead } from './face.js';
import { capsules, capsuleEnds, JOINT_SEGMENTS, point, WORLD } from './physics.js';
import { BONE, BONES, boneFrames, coherentFrames, frameMatrix, fromFrame, toFrame } from './rig.js';
import { SoftShell } from './soft.js';
import { outlineFor, surface } from './toon.js';

const LAYERS = ['skin', 'muscle', 'bone', 'physics'];
const CORNER_COLORS = { red: 0xc8262c, blue: 0x2457c5 };
const SKIN_TONES = { light: 0xe8b796, medium: 0xc58c64, tan: 0xa8704a, deep: 0x7a4a2e };

// Drawn characters carry slightly large heads; it is what makes them read
// as characters rather than as small-headed mannequins.
const HEAD_SCALE = 1.12;
const HEAD_SEAT = 0.18; // head radii the head sits lower than the physics head
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
  const places = { ring: buildRing(), subway: null };
  scene.add(places.ring);
  return { renderer, scene, camera, orbit: { yaw: -0.5, pitch: 0.2, distance: 5.2, target: new THREE.Vector3(0, 1.1, 0) }, places, lights: { key, rim }, place: 'ring' };
}

/**
 * Where the fight is: the ring, or a scenario's scene round its arena. The
 * scene is built the first time it is needed; lighting goes with it.
 */
export function setPlace(view, place, arena) {
  if (place === view.place) return;
  for (const [key, group] of Object.entries(view.places)) if (group) group.visible = key === place;
  if (place === 'subway') {
    if (!view.places.subway) {
      view.places.subway = buildSubway(arena);
      view.scene.add(view.places.subway);
    }
    view.places.subway.visible = true;
    view.scene.background = new THREE.Color(0x10140f);
    view.scene.fog = new THREE.Fog(0x10140f, 8, 26);
    view.lights.key.color.set(0xf2fff0);
    view.lights.key.intensity = 0.9;
    view.lights.rim.color.set(0x9fd8c0);
  } else {
    view.scene.background = new THREE.Color(0x0b0d14);
    view.scene.fog = new THREE.Fog(0x0b0d14, 9, 22);
    view.lights.key.color.set(0xfff2e0);
    view.lights.key.intensity = 1.2;
    view.lights.rim.color.set(0x6f8cff);
  }
  view.place = place;
}

/** A canvas texture: tiles, a station name, a warning strip. */
function paintedTexture(width, height, paint, repeat = [1, 1]) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 4;
  return texture;
}

/**
 * A New York platform at night: concrete floor, the yellow tactile strip at
 * the edge, the track bed and a train standing at it, a row of painted
 * I-beam columns, a tiled wall with the station's mosaic name band, and
 * fluorescent tubes. The fight's arena is the strip of platform between the
 * wall and the edge (z from −halfZ to +halfZ).
 */
function buildSubway(arena) {
  const place = new THREE.Group();
  const length = 26;
  const wallZ = -(arena.halfZ + 0.9);
  const edgeZ = arena.halfZ + 0.75;
  const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...options });

  // Platform slab and its worn, speckled concrete.
  const concrete = paintedTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#8a8b85';
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 1600; index += 1) {
      g.fillStyle = `rgba(${40 + Math.random() * 60},${40 + Math.random() * 60},${40 + Math.random() * 55},${0.08 + Math.random() * 0.15})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    g.strokeStyle = 'rgba(50,50,48,0.35)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
  }, [length / 2, (edgeZ - wallZ) / 2]);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(length, 1.2, edgeZ - wallZ), mat(0xffffff, { map: concrete }));
  slab.position.set(0, -0.6, (edgeZ + wallZ) / 2);
  slab.receiveShadow = true;
  place.add(slab);
  // Yellow tactile warning strip, raised domes and all, then the white edge.
  const tactile = paintedTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#e8b50f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c99a08';
    for (let row = 0; row < 4; row += 1) for (let col = 0; col < 4; col += 1) {
      g.beginPath();
      g.arc(8 + col * 16 + (row % 2) * 8, 8 + row * 16, 4.5, 0, Math.PI * 2);
      g.fill();
    }
  }, [length / 0.3, 2]);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(length, 0.012, 0.6), mat(0xffffff, { map: tactile, roughness: 0.6 }));
  strip.position.set(0, 0.006, edgeZ - 0.38);
  strip.receiveShadow = true;
  place.add(strip);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(length, 0.02, 0.08), mat(0xe9e6dc));
  lip.position.set(0, 0.01, edgeZ - 0.04);
  place.add(lip);

  // Track bed: ballast, ties, running rails, the covered third rail.
  const bed = new THREE.Mesh(new THREE.BoxGeometry(length, 0.1, 3.4), mat(0x2a2620, { roughness: 1 }));
  bed.position.set(0, -1.25, edgeZ + 1.7);
  place.add(bed);
  for (let x = -length / 2; x < length / 2; x += 0.6) {
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 2.4), mat(0x3a2f25));
    tie.position.set(x, -1.17, edgeZ + 1.7);
    place.add(tie);
  }
  for (const offset of [-0.72, 0.72]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.08, 0.07), mat(0x8c8d90, { metalness: 0.7, roughness: 0.35 }));
    rail.position.set(0, -1.1, edgeZ + 1.7 + offset);
    place.add(rail);
  }
  const third = new THREE.Mesh(new THREE.BoxGeometry(length, 0.1, 0.22), mat(0x6e5a2c));
  third.position.set(0, -1.05, edgeZ + 0.45);
  place.add(third);

  // The train at the platform: brushed steel car bodies, dark window bands,
  // doors, a blue stripe and the route bullet.
  const steel = mat(0xb9bec4, { metalness: 0.75, roughness: 0.32 });
  const glass = mat(0x10151a, { metalness: 0.3, roughness: 0.15, emissive: 0x1c2a22, emissiveIntensity: 0.6 });
  const trainZ = edgeZ + 1.75;
  for (const carX of [-7.8, 7.8]) {
    const car = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.BoxGeometry(15.4, 3.1, 2.9), steel);
    shell.position.y = 0.5;
    car.add(shell);
    const band = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.75, 0.02), glass);
    band.position.set(0, 1.0, -1.46);
    car.add(band);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.1, 0.02), mat(0x1d4fa3));
    stripe.position.set(0, 0.45, -1.465);
    car.add(stripe);
    for (let door = -2; door <= 2; door += 1) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.0, 0.03), mat(0xa9aeb4, { metalness: 0.7, roughness: 0.3 }));
      panel.position.set(door * 3.1, 0.05, -1.47);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.02), glass);
      pane.position.set(door * 3.1 - 0.3, 0.55, -1.49);
      const pane2 = pane.clone();
      pane2.position.x = door * 3.1 + 0.3;
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.0, 0.035), mat(0x2a2d31));
      seam.position.set(door * 3.1, 0.05, -1.48);
      car.add(panel, pane, pane2, seam);
    }
    car.position.set(carX, 0, trainZ);
    car.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = false;
        object.receiveShadow = true;
      }
    });
    place.add(car);
  }

  // Columns: I-beams painted dark green, a white band at eye level.
  const columnPaint = mat(0x24443a, { roughness: 0.55, metalness: 0.2 });
  for (let x = -length / 2 + 2; x < length / 2; x += 4.6) {
    const column = new THREE.Group();
    const web = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.3, 0.26), columnPaint);
    const flangeA = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.3, 0.04), columnPaint);
    flangeA.position.z = 0.13;
    const flangeB = flangeA.clone();
    flangeB.position.z = -0.13;
    const bandWhite = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), mat(0xe8e5da));
    bandWhite.position.y = 0.1;
    column.add(web, flangeA, flangeB, bandWhite);
    column.position.set(x, 1.65, edgeZ - 1.0);
    column.traverse((object) => { if (object.isMesh) object.castShadow = true; });
    place.add(column);
  }

  // The wall: cream tiles, a maroon-and-green mosaic band with the name.
  const tiles = paintedTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#e9e2cf';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b9b19d';
    g.lineWidth = 2;
    for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let index = 0; index < 120; index += 1) {
      g.fillStyle = `rgba(120,100,70,${Math.random() * 0.12})`;
      g.fillRect(Math.random() * w, Math.random() * h, 6, 3);
    }
  }, [length / 1.6, 2]);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(length, 3.4), mat(0xffffff, { map: tiles, roughness: 0.5 }));
  wall.position.set(0, 1.7, wallZ);
  wall.receiveShadow = true;
  place.add(wall);
  const name = paintedTexture(1024, 128, (g, w, h) => {
    g.fillStyle = '#6b1f24';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f5a3d';
    for (let x = 0; x < w; x += 24) g.fillRect(x, 0, 12, 14), g.fillRect(x + 12, h - 14, 12, 14);
    g.fillStyle = '#efe6cc';
    g.fillRect(140, 26, w - 280, h - 52);
    g.fillStyle = '#1d1a17';
    g.font = 'bold 64px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('CANAL  ST', w / 2, h / 2 + 3);
  });
  for (const x of [-6.5, 6.5]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.52), mat(0xffffff, { map: name, roughness: 0.4 }));
    sign.position.set(x, 2.15, wallZ + 0.01);
    place.add(sign);
  }
  const trim = new THREE.Mesh(new THREE.BoxGeometry(length, 0.16, 0.03), mat(0x2f5a3d));
  trim.position.set(0, 2.85, wallZ + 0.015);
  place.add(trim);
  // A bench against the wall and a trash can by a column.
  const bench = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.42), mat(0x6b4a2b, { roughness: 0.7 }));
  seat.position.y = 0.46;
  bench.add(seat);
  for (const leg of [-0.95, 0.95]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 0.38), mat(0x2b2d31, { metalness: 0.5 }));
    post.position.set(leg, 0.23, 0);
    bench.add(post);
  }
  bench.position.set(-2.8, 0, wallZ + 0.3);
  bench.traverse((object) => { if (object.isMesh) object.castShadow = true; });
  place.add(bench);
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.85, 16, 1, true), mat(0x3b5f45, { side: THREE.DoubleSide, metalness: 0.3 }));
  can.position.set(4.4, 0.43, wallZ + 0.4);
  can.castShadow = true;
  place.add(can);

  // Ceiling and fluorescent tubes; a few lights so the platform reads.
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(length, edgeZ - wallZ + 4), mat(0x1a1d1b, { side: THREE.DoubleSide }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 3.4, (edgeZ + wallZ) / 2 + 1.5);
  place.add(ceiling);
  const tube = new THREE.MeshStandardMaterial({ color: 0xf4fff4, emissive: 0xe8fff0, emissiveIntensity: 1.4 });
  for (let x = -length / 2 + 1.5; x < length / 2; x += 3.2) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.1), tube);
    light.position.set(x, 3.3, 0);
    place.add(light);
  }
  for (const x of [-5, 0, 5]) {
    const glow = new THREE.PointLight(0xe6ffe8, 0.55, 9, 1.6);
    glow.position.set(x, 3.0, 0);
    place.add(glow);
  }
  return place;
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
  if (mesh.regions) {
    // A lofted body names its kit pieces; paint each its colour.
    // Street clothes take their colours from the outfit.
    const clothing = body.inputs.clothing;
    const shirt = new THREE.Color(clothing?.topColor ?? corner);
    const pants = new THREE.Color(clothing?.bottomColor ?? corner);
    const byRegion = {
      skin, kit: shorts, band, top, shirt, pants,
      cuff: shirt.clone().multiplyScalar(0.78), cuff2: pants.clone().multiplyScalar(0.7), belt: new THREE.Color(0x2a1d14),
    };
    const colors = new Float32Array(positions.length);
    mesh.regions.forEach((region, vertex) => colors.set([byRegion[region].r, byRegion[region].g, byRegion[region].b], vertex * 3));
    mesh.skinMask = mesh.regions.map((region) => region === 'skin');
    return colors;
  }
  const hipY = bindPoints[P.pelvis][1];
  const trunk = body.lengths.trunk;
  const legReach = body.lengths.hipSpan / 2 + body.segments.lThigh.skinRadius * 1.7;
  const colors = new Float32Array(positions.length);
  const skinMask = [];
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
    skinMask.push(color === skin);
  }
  mesh.skinMask = skinMask;
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

/**
 * Ways to build the skin. 'smoothed' is the anatomy field on a coarse grid,
 * relaxed; 'lofted' is clean low-poly rings; 'faceted' is the same with few
 * sides and flat shading; 'dense' is the fine field, as first built.
 */
export const BODY_STYLES = ['lofted', 'smoothed', 'faceted', 'dense'];
export let BODY_STYLE = 'lofted';
export function setBodyStyle(style) {
  BODY_STYLE = style;
}

function buildSkin(body, style) {
  if (style === 'lofted') return buildLoftBody(body);
  if (style === 'faceted') return buildLoftBody(body, { faceted: true });
  if (style === 'smoothed') return buildBodyMesh(body, 'skin', 0.024, 4);
  return buildBodyMesh(body, 'skin');
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
  const built = buildSkin(body, look.bodyStyle ?? BODY_STYLE);
  const baseColors = paintBody(built, body, look, corner);
  const skinMesh = skinnedMesh(built, bones, baseColors.slice());
  // Which body segment each skin vertex belongs to, by its strongest bone.
  const vertexSegment = Array.from({ length: built.positions.length / 3 }, (_, vertex) => (built.skinMask[vertex] ? BONE_SEGMENT[BONES[built.skinIndex[vertex * 4]]] : null));
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
  const bare = body.inputs.gloves === false;
  for (const side of ['l', 'r']) {
    if (bare) {
      // A bare fist: knuckles forward, thumb folded across, in skin.
      const hand = buildBareFist(body, skinColor, side);
      hand.matrixAutoUpdate = false;
      layers.skin.add(hand);
      attachments.push({ object: hand, bone: BONE[`${side}Forearm`], at: P[`${side}Hand`] });
      buildShoe(body, layers, attachments, side, body.inputs.clothing ? 0xe9e9ec : 0x17171c);
      continue;
    }
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
    buildShoe(body, layers, attachments, side, 0x17171c);
  }

  // Worn things: a headset on the head (it can be knocked off), a hoodie's
  // hood and drawstrings swinging from the collar.
  const dangles = [];
  const headset = (body.inputs.accessories ?? []).includes('headset') ? buildHeadset(body, headView.group) : null;
  if (body.inputs.clothing?.top === 'hoodie') {
    const collar = new THREE.Group();
    collar.matrixAutoUpdate = false;
    layers.skin.add(collar);
    attachments.push({ object: collar, bone: BONE.chest, at: P.neck });
    dangles.push(...buildHood(body, collar, body.inputs.clothing.topColor));
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
    baseColors, vertexSegment, damageVersion: -1, skinBone: surface(skinColor, { roughness: 0.6 }), headset, dangles,
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
  if (fighterView.headset?.loose.parent) view.scene.remove(fighterView.headset.loose);
  fighterView.group.traverse((object) => {
    object.geometry?.dispose();
  });
}

function dangleColliders(fighterView, points) {
  const body = fighterView.fighter.body;
  const v = (at) => new THREE.Vector3(...at);
  const head = v(points[P.head]);
  const cloth = body.inputs.clothing ? CLOTHES[body.inputs.clothing.top]?.loose ?? 1 : 1;
  const trunkRadius = body.segments.trunk.skinRadius * 0.85 * cloth;
  const neck = v(points[P.neck]);
  const pelvis = v(points[P.pelvis]);
  // The trunk capsule stops short of the neck, under the collarbones.
  const top = pelvis.clone().lerp(neck, 0.9);
  return [
    { a: head, b: head, radius: body.lengths.headRadius * HEAD_SCALE * 1.02 },
    { a: pelvis, b: top, radius: trunkRadius },
    { a: v(points[P.lShoulder]), b: v(points[P.rShoulder]), radius: body.segments.lUpperArm.skinRadius * 1.25 * cloth },
  ];
}

/** A boxing boot or, in street clothes, a trainer: sole along the foot, and the ankle. */
function buildShoe(body, layers, attachments, side, soleColor) {
  const shoe = new THREE.Group();
  const length = 0.25 * body.heightM / 1.8;
  const sole = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), surface(soleColor, { roughness: 0.4 }));
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

/**
 * A bare fist, in the forearm's frame at the hand point (y along the
 * forearm): a closed hand as wide as four knuckles, the knuckles leading,
 * the thumb folded across the front of the fingers.
 */
function buildBareFist(body, skinColor, side) {
  const scale = body.heightM / 1.8;
  const material = surface(skinColor);
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), material);
  palm.scale.set(0.034 * scale, 0.045 * scale, 0.042 * scale);
  palm.position.y = 0.012 * scale;
  hand.add(palm);
  for (let finger = 0; finger < 4; finger += 1) {
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.0115 * scale, 10, 8), material);
    knuckle.position.set(0.012 * scale, 0.05 * scale, (finger - 1.5) * 0.019 * scale);
    hand.add(knuckle);
  }
  const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.011 * scale, 0.012 * scale, 0.045 * scale, 8), material);
  thumb.rotation.x = Math.PI / 2;
  thumb.position.set(0.03 * scale, 0.022 * scale, (side === 'l' ? -1 : 1) * 0.004 * scale);
  hand.add(thumb);
  for (const piece of hand.children) {
    piece.castShadow = true;
    piece.add(outlineFor(piece, 0.003));
  }
  return hand;
}

/**
 * Over-ear headphones, in head coordinates: a band over the crown, a cup over
 * each ear. Returned so the view can hide it once it is knocked off, along
 * with a loose copy for the floor.
 */
function buildHeadset(body, headGroup) {
  const r = body.lengths.headRadius;
  const shell = surface(0x1b1c22, { roughness: 0.35 });
  const accent = surface(0xd6402e, { roughness: 0.4 });
  const make = () => {
    const set = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.02 * r, 0.06 * r, 8, 28, Math.PI), shell);
    band.rotation.y = Math.PI / 2;
    band.position.y = 0.05 * r;
    set.add(band);
    for (const side of [1, -1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.36 * r, 0.38 * r, 0.2 * r, 20), shell);
      cup.rotation.x = Math.PI / 2;
      cup.position.set(-0.05 * r, -0.05 * r, side * 0.98 * r);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33 * r, 0.04 * r, 6, 20), accent);
      ring.position.set(-0.05 * r, -0.05 * r, side * 1.09 * r);
      set.add(cup, ring);
    }
    for (const piece of set.children) {
      piece.castShadow = true;
      piece.add(outlineFor(piece, 0.003));
    }
    return set;
  };
  const worn = make();
  headGroup.add(worn);
  return { worn, loose: make() };
}

/**
 * A hoodie's hood, bunched behind the neck, and its two drawstrings: each
 * hangs from the collar and swings with the body's movement.
 */
function buildHood(body, collar, colorHex) {
  const scale = body.heightM / 1.8;
  const cloth = surface(new THREE.Color(colorHex).getHex());
  const lining = surface(new THREE.Color(colorHex).multiplyScalar(0.6).getHex());
  const dangles = [];
  // Collar coordinates: x forward, y up the chest, z to the left.
  // Hung from the back of the collar, clear of the hoodie's own shell.
  const backOfNeck = body.segments.trunk.skinRadius * 0.75 + 0.03 * scale;
  const hood = new Dangle(collar, [-backOfNeck, -0.01 * scale, 0], [-0.35, -1, 0], 0.2 * scale, { sag: 0.5, damping: 0.3 });
  const bag = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), cloth);
  bag.scale.set(0.06 * scale, 0.13 * scale, 0.14 * scale);
  bag.position.y = -0.08 * scale;
  bag.rotation.z = Math.PI;
  const inside = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), lining);
  inside.scale.copy(bag.scale);
  inside.position.copy(bag.position);
  inside.position.x += 0.012 * scale;
  inside.rotation.z = Math.PI;
  for (const piece of [bag, inside]) {
    piece.castShadow = true;
    piece.add(outlineFor(piece, 0.003));
    hood.group.add(piece);
  }
  dangles.push(hood);
  const cord = surface(0xf0ece4);
  for (const side of [1, -1]) {
    const string = new Dangle(collar, [0.07 * scale, -0.03 * scale, side * 0.035 * scale], [0.25, -1, side * 0.05], 0.17 * scale, { sag: 0.8, damping: 0.15 });
    const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.004 * scale, 0.004 * scale, 0.17 * scale, 5), cord);
    strand.position.y = -0.085 * scale;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.006 * scale, 0.006 * scale, 0.02 * scale, 6), surface(0x8a8a8a));
    tip.position.y = -0.17 * scale;
    string.group.add(strand, tip);
    dangles.push(string);
  }
  return dangles;
}

/** Which layers show: skin; muscle (with bone); bone over a ghost; physics over a ghost. */
export function setLayer(fighterView, layer) {
  fighterView.layer = layer;
  if (layer === 'muscle') ensureMuscle(fighterView);
  const { layers, skinMesh, skinOutline, head, attachments } = fighterView;
  const ghost = layer === 'physics' ? 0.25 : layer === 'bone' ? 0.12 : 1;
  layers.skin.visible = layer !== 'muscle';
  layers.muscle.visible = layer === 'muscle';
  // In the skin view the skeleton stays, painted as skin: hidden inside a
  // normal body, it shows through where a wasted one is thinner than its bones.
  layers.bone.visible = layer !== 'physics';
  layers.physics.visible = layer === 'physics';
  paintSkeleton(fighterView, layer === 'skin');
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
  const frames = coherentFrames(boneFrames(points, fighter.body), fighterView.frames);
  fighterView.frames = frames;
  frames.forEach((frame, index) => {
    const matrix = frameMatrix(frame);
    fighterView.bones[index].matrixWorld.fromArray(matrix);
    fighterView.skeleton[index].matrix.fromArray(matrix);
    fighterView.skeleton[index].matrixWorldNeedsUpdate = true;
  });
  const headFrame = frames[BONE.head];
  // Seated a little down the neck, as drawn heads are.
  const seat = fighter.body.lengths.headRadius * HEAD_SEAT;
  fighterView.head.group.matrix.fromArray(frameMatrix({ ...headFrame, origin: headFrame.origin.map((value, axis) => value - headFrame.y[axis] * seat) })).scale(new THREE.Vector3(HEAD_SCALE, HEAD_SCALE, HEAD_SCALE));
  fighterView.head.group.matrixWorldNeedsUpdate = true;
  for (const { object, bone, at } of fighterView.attachments) {
    object.matrix.fromArray(frameMatrix({ ...frames[bone], origin: points[at] }));
    object.matrixWorldNeedsUpdate = true;
  }
  if (fighter.damageVersion !== fighterView.damageVersion) paintDamage(fighterView);
  const step = Math.min(dt, 1 / 30);
  for (const entry of fighterView.shells) entry.shell.update(step);
  // What hanging hair and cloth rest on: the head, and the trunk with
  // whatever is worn over it.
  const colliders = dangleColliders(fighterView, points);
  fighterView.head.update(step, fighter, time, colliders);
  for (const dangle of fighterView.dangles) dangle.update(step, colliders.slice(1));
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

// Rig bones to the physics' body segments, for damage.
const BONE_SEGMENT = {
  pelvis: 'trunk', spine: 'trunk', chest: 'trunk', neck: 'head', head: 'head',
  lClavicle: 'trunk', rClavicle: 'trunk', lUpperArm: 'lUpperArm', rUpperArm: 'rUpperArm', lForearm: 'lForearm', rForearm: 'rForearm',
  lThigh: 'lThigh', rThigh: 'rThigh', lShin: 'lShank', rShin: 'rShank', lFoot: 'lShank', rFoot: 'rShank',
};
const JOINT_BONES = {
  lElbow: ['lUpperArm', 'lForearm'], rElbow: ['rUpperArm', 'rForearm'], lKnee: ['lThigh', 'lShin'], rKnee: ['rThigh', 'rShin'],
  lHip: ['lThigh'], rHip: ['rThigh'], neck: ['neck', 'head'],
};
const BRUISE = new THREE.Color(0xa3121c);
const BROKEN = new THREE.Color(0xe01b1b);

/**
 * Skin reddens with each segment's damage; a broken joint turns its limb
 * fully red, on the skin and in the skeleton.
 */
function paintDamage(fighterView) {
  const fighter = fighterView.fighter;
  fighterView.damageVersion = fighter.damageVersion;
  const brokenSegments = new Set([...fighter.broken].flatMap((joint) => JOINT_SEGMENTS[joint]));
  const colors = fighterView.skinMesh.geometry.attributes.color;
  const base = fighterView.baseColors;
  const mixed = new THREE.Color();
  fighterView.vertexSegment.forEach((segment, vertex) => {
    if (!segment) return;
    mixed.setRGB(base[vertex * 3], base[vertex * 3 + 1], base[vertex * 3 + 2]);
    if (brokenSegments.has(segment)) mixed.copy(BROKEN);
    else mixed.lerp(BRUISE, Math.min(1, fighter.damage[segment] ?? 0) * 0.85);
    colors.setXYZ(vertex, mixed.r, mixed.g, mixed.b);
  });
  colors.needsUpdate = true;
  for (const joint of fighter.broken) {
    for (const bone of JOINT_BONES[joint]) {
      fighterView.skeleton[BONE[bone]].traverse((object) => {
        if (object.isMesh && !object.userData.outline) object.material = fighterView.brokenBone ?? (fighterView.brokenBone = surface(0xe01b1b));
      });
    }
  }
}

const SKIN_BONE_INSET = 0.87;

/** The bones a set of street clothes covers: the trunk under a top, the legs under trousers, the arms under long sleeves. */
function coveredBones(clothing) {
  if (!clothing) return new Set();
  const names = ['pelvis', 'spine', 'chest', 'lClavicle', 'rClavicle', 'lUpperArm', 'rUpperArm', 'lThigh', 'rThigh', 'lShin', 'rShin'];
  if (clothing.top === 'hoodie') names.push('lForearm', 'rForearm');
  return new Set(names.map((name) => BONE[name]));
}

/** Bones wear skin in the skin view and their own colour elsewhere; broken ones stay red. */
function paintSkeleton(fighterView, asSkin) {
  const broken = new Set([...fighterView.fighter.broken].flatMap((joint) => JOINT_BONES[joint].map((bone) => BONE[bone])));
  const covered = coveredBones(fighterView.fighter.body.inputs.clothing);
  fighterView.skeleton.forEach((piece, index) => {
    // Under clothes, no bone shows in the skin view, however thin the man.
    piece.visible = !(asSkin && covered.has(index));
    // Drawn as skin, the bones sit a little in from where the anatomy layer
    // draws them, towards each bone's axis: under the flesh of a normal body,
    // through it only where the flesh has wasted away.
    for (const part of piece.children) {
      part.userData.bind ??= { x: part.position.x, z: part.position.z, scale: part.scale.clone() };
      const inset = asSkin ? SKIN_BONE_INSET : 1;
      part.position.x = part.userData.bind.x * inset;
      part.position.z = part.userData.bind.z * inset;
      part.scale.set(part.userData.bind.scale.x * inset, part.userData.bind.scale.y, part.userData.bind.scale.z * inset);
    }
    piece.traverse((object) => {
      if (!object.isMesh) return;
      if (object.userData.outline) {
        object.visible = !asSkin;
        return;
      }
      object.userData.boneMaterial ??= object.material;
      if (broken.has(index)) object.material = fighterView.brokenBone ?? (fighterView.brokenBone = surface(0xe01b1b));
      else object.material = asSkin ? fighterView.skinBone : object.userData.boneMaterial;
    });
  });
}

/**
 * Props in the world: a worn one shows on its owner's head; once knocked
 * off, a loose copy flies, tumbles and lies where the physics put it.
 */
export function updateProps(view, fighterViews, world) {
  for (const prop of world.props ?? []) {
    const owner = fighterViews.find((entry) => entry.fighter.id === prop.owner);
    const headset = owner?.headset;
    if (!headset) continue;
    headset.worn.visible = prop.attached && owner.layers.skin.visible;
    if (prop.attached) continue;
    if (!headset.loose.parent) {
      headset.loose.scale.setScalar(HEAD_SCALE);
      view.scene.add(headset.loose);
    }
    headset.loose.position.set(...prop.x);
    headset.loose.rotation.set(...prop.turn);
  }
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
