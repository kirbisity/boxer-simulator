// What a horse looks like: a low-poly horse to its own withers' height
// (barrel, chest and quarters, neck, head and ears, mane and tail), legs
// placed each frame where its gait puts them, saddle, saddle cloth and
// reins, and its armour: a steel bard (chanfron, crinet, peytral, crupper,
// flanchards) or an iron lamellar one (head, neck and body to the knees).
// Drawn from the simulation's horse; nothing here changes it.

/* global THREE */
import { HORSE_SHAPE, poseHorse } from './physics/mounted.js';
import { disposeObject, outlineFor, surface } from './toon.js';

const HORSE_LOOK = {
  saddle: 0x4a2e1a,
  tack: 0x24170f,
  hoof: 0x1c1714,
  steel: 0xb9bec6,
  iron: 0x5d6067,
  lace: 0x7a1c18,
  cloth: { red: 0x9a1f22, blue: 0x24407a },
  outline: 0.006,
};

const horseUp = new THREE.Vector3(0, 1, 0);
const horseScratch = new THREE.Vector3();

/** A cylinder (radii `r0` at the start, `r1` at the end) laid between two points each frame. */
function horseLimb(material, r0, r1, sides = 7) {
  const geometry = new THREE.CylinderGeometry(r1, r0, 1, sides, 1);
  geometry.translate(0, 0.5, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}
function layHorsePart(mesh, from, to) {
  mesh.position.set(from[0], from[1], from[2]);
  horseScratch.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const length = horseScratch.length() || 1e-6;
  mesh.scale.set(1, length, 1);
  mesh.quaternion.setFromUnitVectors(horseUp, horseScratch.divideScalar(length));
}

/** A part of the body: an ellipsoid at `at` (horse frame, m) with half-sizes `size`, inked. */
function horseBlob(group, material, at, size, { outline = true, segments = [16, 10] } = {}) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments[0], segments[1]), material);
  mesh.position.set(at[0], at[1], at[2]);
  mesh.scale.set(size[0], size[1], size[2]);
  mesh.castShadow = true;
  group.add(mesh);
  if (outline) {
    const ink = outlineFor(mesh, HORSE_LOOK.outline / Math.max(size[0], size[1], size[2]));
    mesh.add(ink);
  }
  return mesh;
}

/** A fixed tapered piece in the horse's frame, between two points. */
function horsePiece(group, material, from, to, r0, r1, sides = 10) {
  const mesh = horseLimb(material, r0, r1, sides);
  layHorsePart(mesh, from, to);
  group.add(mesh);
  return mesh;
}

/** Iron lamellae: rows of small plates laced in red, as a texture. */
function lamellarTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#5d6067';
  g.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 16; column += 1) {
      const x = column * 8 + (row % 2) * 4;
      const y = row * 16;
      g.fillStyle = (row + column) % 3 ? '#6e727a' : '#585b62';
      g.fillRect(x + 1, y + 1, 6, 13);
    }
    g.fillStyle = '#7a1c18';
    g.fillRect(0, row * 16 + 14, 128, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 3);
  return texture;
}

/** Build a horse's model (added to the scene); returns its view. */
export function buildHorseView(view, horse) {
  const W = horse.withers;
  const at = (x, y, z = 0) => [x * W, y * W, z * W];
  const pivot = 0.76 * W;
  const group = new THREE.Group();
  // Rolled about the barrel's line when it falls (as physics horsePoint): the body in `body`, about the pivot.
  const body = new THREE.Group();
  body.position.y = pivot;
  group.add(body);
  const frame = new THREE.Group();
  frame.position.y = -pivot;
  body.add(frame);
  const coat = surface(new THREE.Color(horse.coat));
  const dark = surface(new THREE.Color(horse.coat).multiplyScalar(0.45));
  const tack = surface(HORSE_LOOK.tack);
  // The body: barrel, chest, quarters.
  horseBlob(frame, coat, at(-0.04, 0.76), [0.5 * W, 0.215 * W, 0.2 * W]);
  horseBlob(frame, coat, at(0.27, 0.8), [0.22 * W, 0.24 * W, 0.19 * W]);
  horseBlob(frame, coat, at(-0.36, 0.82), [0.25 * W, 0.24 * W, 0.21 * W]);
  // Neck, head, ears, muzzle.
  horsePiece(frame, coat, at(0.32, 0.86), at(0.62, 1.12), 0.14 * W, 0.075 * W, 12);
  const poll = at(0.63, 1.13);
  const muzzle = at(0.86, 0.9);
  horsePiece(frame, coat, poll, muzzle, 0.075 * W, 0.05 * W, 10);
  horseBlob(frame, dark, muzzle, [0.055 * W, 0.05 * W, 0.05 * W], { outline: false, segments: [10, 6] });
  for (const side of [1, -1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.022 * W, 0.08 * W, 5), coat);
    ear.position.set(poll[0] - 0.02 * W, poll[1] + 0.06 * W, side * 0.035 * W);
    ear.rotation.z = 0.35;
    frame.add(ear);
  }
  // Mane along the top of the neck, the tail from the dock.
  const mane = horsePiece(frame, dark, at(0.36, 0.98), at(0.62, 1.2), 0.04 * W, 0.03 * W, 5);
  mane.scale.x = 0.35;
  const tail = horsePiece(frame, dark, at(-0.6, 0.86), at(-0.72, 0.42), 0.05 * W, 0.075 * W, 6);
  tail.scale.z = 0.6;
  // Saddle cloth in his side's colour, the saddle with its high pommel and cantle, the girth.
  const seat = HORSE_SHAPE.seat;
  // (A part-cylinder along the barrel, its open side down: angle 0.5π is the top once laid along x.)
  const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.228 * W, 0.228 * W, 0.42 * W, 14, 1, true, Math.PI * 0.12, Math.PI * 0.76), surface(HORSE_LOOK.cloth[horse.corner] ?? 0x6a5a4a));
  cloth.material.side = THREE.DoubleSide;
  cloth.rotation.z = Math.PI / 2;
  cloth.position.set(seat[0] * W, 0.765 * W, 0);
  frame.add(cloth);
  const leather = surface(HORSE_LOOK.saddle);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.3 * W, 0.04 * W, 0.24 * W), leather);
  saddle.position.set(seat[0] * W, seat[1] * W - 0.005 * W, 0);
  frame.add(saddle);
  const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.04 * W, 0.11 * W, 0.2 * W), leather);
  pommel.position.set(seat[0] * W + 0.15 * W, seat[1] * W + 0.04 * W, 0);
  const cantle = pommel.clone();
  cantle.position.x = seat[0] * W - 0.15 * W;
  cantle.scale.y = 1.3;
  frame.add(pommel, cantle);
  const girth = new THREE.Mesh(new THREE.TorusGeometry(0.218 * W, 0.012 * W, 4, 18), tack);
  girth.position.set((seat[0] + 0.12) * W, 0.765 * W, 0);
  girth.rotation.y = Math.PI / 2;
  girth.scale.set(1, 1, 0.94);
  frame.add(girth);
  // The reins, from the bit to the pommel.
  const reins = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(muzzle[0], muzzle[1] + 0.02 * W, 0.03 * W), new THREE.Vector3(pommel.position.x + 0.03 * W, pommel.position.y + 0.04 * W, 0.04 * W), new THREE.Vector3(muzzle[0], muzzle[1] + 0.02 * W, -0.03 * W)]), new THREE.LineBasicMaterial({ color: HORSE_LOOK.tack }));
  frame.add(reins);
  dressBarding(view, frame, horse, at, muzzle, poll);
  // Legs: drawn in the world, placed each frame from the gait.
  const legs = {};
  for (const leg of HORSE_SHAPE.legs) {
    const upper = horseLimb(coat, 0.06 * W, 0.042 * W);
    const lower = horseLimb(coat, 0.034 * W, 0.028 * W);
    const hoof = horseLimb(surface(HORSE_LOOK.hoof), 0.036 * W, 0.04 * W);
    upper.add(outlineFor(upper, HORSE_LOOK.outline));
    lower.add(outlineFor(lower, HORSE_LOOK.outline));
    view.scene.add(upper, lower, hoof);
    legs[leg.key] = { upper, lower, hoof };
  }
  view.scene.add(group);
  return { horse, group, body, legs, drawn: { ...horse, capsules: [], legs: {} } };
}

/** The armour, as the horse's barding says. */
function dressBarding(view, frame, horse, at, muzzle, poll) {
  if (horse.barding === 'bare') return;
  const W = horse.withers;
  const plate = horse.barding === 'plate';
  const material = plate
    ? new THREE.MeshStandardMaterial({ color: HORSE_LOOK.steel, metalness: 0.85, roughness: 0.32, envMap: view.steelEnv, envMapIntensity: 1.1 })
    : new THREE.MeshStandardMaterial({ color: 0xffffff, map: lamellarTexture(), metalness: 0.55, roughness: 0.55, envMap: view.steelEnv, envMapIntensity: 0.7 });
  const shell = (center, size, from = 0, length = Math.PI * 2, thetaFrom = 0, thetaLength = Math.PI) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10, from, length, thetaFrom, thetaLength), material);
    mesh.position.set(center[0], center[1], center[2]);
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.castShadow = true;
    frame.add(mesh);
    return mesh;
  };
  // Chanfron: over the face from the poll to the nose.
  const chanfron = horsePiece(frame, material, [poll[0] - 0.01 * W, poll[1] + 0.015 * W, 0], [muzzle[0] - 0.03 * W, muzzle[1] + 0.03 * W, 0], 0.085 * W, 0.06 * W, 10);
  chanfron.scale.x = 1.04;
  // Crinet: over the neck, in lames.
  for (let lame = 0; lame < (plate ? 5 : 1); lame += 1) {
    const share = plate ? lame / 5 : 0;
    const length = plate ? 1 / 5 + 0.02 : 1;
    const from = [0.32 + 0.3 * share, 0.86 + 0.26 * share];
    const to = [0.32 + 0.3 * (share + length), 0.86 + 0.26 * (share + length)];
    horsePiece(frame, material, at(from[0], from[1] + 0.012), at(Math.min(0.63, to[0]), Math.min(1.13, to[1]) + 0.012), (0.152 - 0.07 * share) * W, (0.152 - 0.07 * Math.min(1, share + length)) * W, 12);
  }
  if (plate) {
    // Peytral over the chest, crupper over the quarters, flanchards between, under the saddle.
    shell(at(0.27, 0.8), [0.235 * W, 0.255 * W, 0.205 * W], -Math.PI / 2, Math.PI, 0.05, Math.PI * 0.62);
    shell(at(-0.37, 0.83), [0.265 * W, 0.255 * W, 0.22 * W], Math.PI / 2, Math.PI, 0.05, Math.PI * 0.62);
    for (const side of [1, -1]) {
      const flank = new THREE.Mesh(new THREE.BoxGeometry(0.22 * W, 0.2 * W, 0.012 * W), material);
      flank.position.set(-0.02 * W, 0.7 * W, side * 0.205 * W);
      flank.castShadow = true;
      frame.add(flank);
    }
  } else {
    // Lamellar over chest, body and quarters, hanging to the knees at the sides.
    shell(at(-0.04, 0.77), [0.53 * W, 0.235 * W, 0.218 * W], 0, Math.PI * 2, 0, Math.PI * 0.62);
    shell(at(0.27, 0.8), [0.235 * W, 0.255 * W, 0.205 * W], -Math.PI / 2, Math.PI, 0, Math.PI * 0.72);
    shell(at(-0.37, 0.83), [0.265 * W, 0.255 * W, 0.222 * W], Math.PI / 2, Math.PI, 0, Math.PI * 0.72);
    for (const side of [1, -1]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.05 * W, 0.3 * W), material);
      panel.material.side = THREE.DoubleSide;
      panel.position.set(-0.05 * W, 0.56 * W, side * 0.215 * W);
      panel.rotation.x = side * 0.12;
      frame.add(panel);
    }
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(0.3 * W, 0.3 * W), material);
    apron.position.set(0.47 * W, 0.62 * W, 0);
    apron.rotation.y = Math.PI / 2;
    frame.add(apron);
  }
}

/** Put the horse where it is now (its legs in their stride, rolled over if down). */
export function updateHorseView(view) {
  const horse = view.horse;
  const drawn = view.drawn;
  Object.assign(drawn, { at: horse.at, yaw: horse.yaw, speed: horse.speed, stride: horse.stride, state: horse.state, roll: horse.roll, fall: horse.fall, withers: horse.withers });
  poseHorse(drawn);
  const W = horse.withers;
  view.group.position.set(horse.at[0], drawn.bob ?? 0, horse.at[1]);
  view.group.rotation.y = horse.yaw;
  view.body.rotation.x = horse.roll ?? 0;
  view.body.position.y = 0.76 * W - (horse.fall ?? 0) * (0.76 * W - 0.21 * W);
  for (const [key, parts] of Object.entries(view.legs)) {
    const leg = drawn.legs[key];
    layHorsePart(parts.upper, leg.root, leg.knee);
    const hoofTop = [leg.hoof[0], leg.hoof[1] + 0.07 * W, leg.hoof[2]];
    layHorsePart(parts.lower, leg.knee, hoofTop);
    layHorsePart(parts.hoof, hoofTop, leg.hoof);
  }
}

/** Remove a horse's model. */
export function disposeHorseView(view, horseView) {
  view.scene.remove(horseView.group);
  disposeObject(horseView.group);
  for (const parts of Object.values(horseView.legs)) {
    for (const mesh of Object.values(parts)) {
      view.scene.remove(mesh);
      disposeObject(mesh);
    }
  }
}
