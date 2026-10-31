// PROOF OF CONCEPT, beasts round 1: how a robot dog looks (src/robotdogs.js), drawn from the simulation's mount as
// horseview.js draws a horse (it hands robots over to this): a body of shells round a frame, a sensor head, hip
// motors, each leg in two links from the physics' hip, knee and foot, a rubber foot; and what it carries, from the
// "rider" bolted on its back (the fighter, not drawn as a man: render.js): Spot's arm dogAlong that fighter's right
// arm (shoulder, elbow, gripper at the hand), the Vision 60's SPUR turret on its mount, the rifle dogAlong the
// weapon's line. Plain stock geometry: boxes, cylinders, spheres, dogInked as the horses are.

/* global THREE */
import { P } from './body.js';
import { poseHorse } from './physics/mounted.js';
import { disposeObject, outlineFor, surface } from './toon.js';

const DOG_LOOK = {
  outline: 0.004,
  // Each robot's paint: shell, frame and links, feet, the sensor glass, its lights.
  go2: { shell: 0xc8ccd2, frame: 0x2a2b2f, foot: 0x1a1a1c, glass: 0x0c0d10, light: 0x46b4ff },
  spot: { shell: 0xf2c21b, frame: 0x1d1e22, foot: 0x141414, glass: 0x0c0d10, light: 0xffffff },
  vision60: { shell: 0x4d5446, frame: 0x24262a, foot: 0x161616, glass: 0x0c0d10, light: 0xff5a3c },
};

const dogUp = new THREE.Vector3(0, 1, 0);
const dogAlong = new THREE.Vector3();

function dogInked(mesh, ink = DOG_LOOK.outline) {
  mesh.castShadow = true;
  if (ink) mesh.add(outlineFor(mesh, ink));
  return mesh;
}

function dogBox(size, material, at = [0, 0, 0], ink) {
  const mesh = dogInked(new THREE.Mesh(new THREE.BoxGeometry(...size), material), ink);
  mesh.position.set(...at);
  return mesh;
}

function dogBall(radius, material, at = [0, 0, 0], scale = [1, 1, 1], ink) {
  const mesh = dogInked(new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material), ink);
  mesh.position.set(...at);
  mesh.scale.set(...scale);
  return mesh;
}

function dogDrum(radius, length, material, at = [0, 0, 0], axis = 'z', ink) {
  const mesh = dogInked(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 16), material), ink);
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  mesh.position.set(...at);
  return mesh;
}

/** A dogLink from a point to another (world): a cylinder of unit length scaled dogAlong y. */
function dogLink(radius, material, ends = 1) {
  const geometry = new THREE.CylinderGeometry(radius, radius * ends, 1, 12);
  geometry.translate(0, 0.5, 0);
  return dogInked(new THREE.Mesh(geometry, material));
}

function dogLay(mesh, from, to) {
  mesh.position.set(from[0], from[1], from[2]);
  dogAlong.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const length = dogAlong.length() || 1e-6;
  mesh.scale.set(1, length, 1);
  mesh.quaternion.setFromUnitVectors(dogUp, dogAlong.divideScalar(length));
}

/** The body: shells over the frame, the sensor head, the hip motors (in the robot's own frame, metres: x forward, y up, z left). */
function buildDogBody(frame, horse, paint) {
  const W = horse.withers;
  const shape = horse.shape;
  const chest = shape.parts[0];
  const length = 2 * chest.b[0] * W;
  const y = chest.a[1] * W;
  const r = chest.radius * W;
  const width = 2 * shape.legs[0].root[2] * W * 0.78;
  const shell = surface(paint.shell, { roughness: 0.45 });
  const frameMat = surface(paint.frame, { roughness: 0.6 });
  const glass = surface(paint.glass, { roughness: 0.2 });
  const light = new THREE.MeshBasicMaterial({ color: paint.light });
  const breed = horse.breed;
  // The trunk: a frame dogBox, the shells over its top and ends.
  frame.add(dogBox([length, r * 1.5, width], frameMat, [0, y, 0]));
  frame.add(dogBox([length * 0.92, r * 0.5, width * 1.04], shell, [0, y + r * 0.62, 0]));
  if (breed === 'spot') {
    // Spot: the yellow top and its black belly; stereo cameras at the front and back faces.
    frame.add(dogBox([length * 0.18, r * 1.2, width * 0.9], shell, [length * 0.46, y + r * 0.1, 0]));
    frame.add(dogBox([length * 0.18, r * 1.2, width * 0.9], shell, [-length * 0.46, y + r * 0.1, 0]));
    for (const end of [1, -1]) frame.add(dogBox([0.02, r * 0.55, width * 0.6], glass, [end * length * 0.56, y + r * 0.05, 0], 0));
    for (const side of [1, -1]) frame.add(dogBox([length * 0.5, r * 0.5, 0.012], glass, [0, y, side * width * 0.52], 0));
    frame.add(dogBox([0.05, 0.02, 0.08], light, [length * 0.2, y + r * 0.9, 0], 0));
  } else if (breed === 'go2') {
    // Go2: the grey shell, the lidar dome under its chin, the camera face, a light strip.
    frame.add(dogBox([length * 0.2, r * 1.1, width * 0.85], shell, [length * 0.5, y + r * 0.05, 0]));
    frame.add(dogBall(r * 0.55, glass, [length * 0.62, y - r * 0.35, 0], [1, 0.8, 1]));
    frame.add(dogBox([0.012, r * 0.45, width * 0.55], glass, [length * 0.61, y + r * 0.2, 0], 0));
    for (const side of [1, -1]) frame.add(dogBox([0.04, 0.012, 0.012], light, [length * 0.6, y + r * 0.38, side * width * 0.25], 0));
    frame.add(dogBox([length * 0.3, r * 0.3, width * 0.5], frameMat, [-length * 0.1, y + r * 0.95, 0]));
  } else {
    // Vision 60: a long armoured dogBox, chamfered ends, sensor heads fore and aft, a light at the nose.
    for (const end of [1, -1]) {
      const nose = dogBox([length * 0.16, r * 1.1, width * 0.9], shell, [end * length * 0.5, y, 0]);
      nose.rotation.z = end * 0.35;
      frame.add(nose);
      frame.add(dogBox([0.02, r * 0.4, width * 0.5], glass, [end * length * 0.6, y + r * 0.05, 0], 0));
    }
    frame.add(dogBox([0.03, 0.02, 0.05], light, [length * 0.61, y + r * 0.35, 0], 0));
    for (const side of [1, -1]) frame.add(dogBox([length * 0.6, r * 0.9, 0.02], shell, [0, y, side * width * 0.53]));
  }
  // The hip motors at each leg's root.
  for (const leg of shape.legs) {
    const at = leg.root.map((value) => value * W);
    frame.add(dogDrum(shape.legRadius * W * 1.6, shape.legRadius * W * 2.2, frameMat, [at[0], at[1], at[2] + Math.sign(at[2]) * shape.legRadius * W * 0.6], 'z'));
  }
}

/** Build a robot dog's model (added to the scene); returns its view. */
export function buildRobotDogView(view, horse) {
  const paint = DOG_LOOK[horse.breed] ?? DOG_LOOK.go2;
  const W = horse.withers;
  const group = new THREE.Group();
  const body = new THREE.Group();
  const pivot = horse.shape.legs[0].root[1] * W;
  body.position.y = pivot;
  group.add(body);
  const frame = new THREE.Group();
  frame.position.y = -pivot;
  body.add(frame);
  buildDogBody(frame, horse, paint);
  // Legs: drawn in the world, laid each frame from the physics' hip, knee and foot.
  const linkMat = surface(paint.frame, { roughness: 0.55 });
  const upperMat = surface(horse.breed === 'go2' ? paint.shell : horse.breed === 'spot' ? paint.shell : paint.frame, { roughness: 0.5 });
  const footMat = surface(paint.foot, { roughness: 0.9 });
  const radius = horse.shape.legRadius * W;
  const legs = {};
  for (const leg of horse.shape.legs) {
    const upper = dogLink(radius * 1.25, upperMat, 0.75);
    const lower = dogLink(radius * 0.7, linkMat, 0.8);
    const foot = dogBall(radius * 0.95, footMat);
    const knee = dogBall(radius * 0.85, linkMat);
    for (const mesh of [upper, lower, foot, knee]) view.scene.add(mesh);
    legs[leg.key] = { upper, lower, foot, knee };
  }
  // What it carries: Spot's arm, the Vision 60's turret (laid each frame from its bolted "rider").
  const carried = {};
  if (horse.breed === 'spot') {
    const black = surface(paint.frame, { roughness: 0.5 });
    const yellow = surface(paint.shell, { roughness: 0.45 });
    carried.base = dogDrum(0.07, 0.08, black, [0, 0, 0], 'y');
    carried.upper = dogLink(0.04, yellow, 0.9);
    carried.lower = dogLink(0.032, black, 0.8);
    carried.wrist = dogBall(0.04, black);
    carried.jaw = dogBox([0.12, 0.035, 0.05], black);
    for (const mesh of Object.values(carried)) view.scene.add(mesh);
  } else if (horse.breed === 'vision60') {
    const dark = surface(0x2b2f28, { roughness: 0.55 });
    const steel = surface(0x3a3d40, { roughness: 0.35 });
    carried.mount = dogDrum(0.07, 0.1, dark, [0, 0, 0], 'y');
    carried.dogBox = dogBox([0.3, 0.12, 0.12], dark);
    carried.barrel = dogLink(0.012, steel, 1);
    carried.optic = dogBox([0.16, 0.06, 0.05], surface(0x111214, { roughness: 0.3 }));
    carried.can = dogLink(0.022, steel, 1);
    for (const mesh of Object.values(carried)) view.scene.add(mesh);
  }
  view.scene.add(group);
  return { robot: true, horse, group, body, frame, legs, carried, drawn: { ...horse, capsules: [], legs: {} } };
}

/** Move a robot dog's model to its mount's pose this frame. */
export function updateRobotDogView(dogView, world = null) {
  const horse = dogView.horse;
  const drawn = dogView.drawn;
  Object.assign(drawn, { at: horse.at, yaw: horse.yaw, speed: horse.speed, stride: horse.stride, state: horse.state, roll: horse.roll, fall: horse.fall, withers: horse.withers, bank: horse.bank });
  poseHorse(drawn);
  const W = horse.withers;
  dogView.group.position.set(horse.at[0], drawn.bob ?? 0, horse.at[1]);
  dogView.group.rotation.order = 'YXZ';
  dogView.group.rotation.y = horse.yaw;
  dogView.group.rotation.x = horse.bank ?? 0;
  dogView.body.rotation.z = drawn.pitch ?? 0;
  dogView.body.rotation.x = horse.roll ?? 0;
  // Down: its legs fold and the body settles to the ground.
  const fall = horse.fall ?? 0;
  dogView.body.position.y = horse.shape.legs[0].root[1] * W * (1 - 0.6 * fall);
  for (const [key, pieces] of Object.entries(dogView.legs)) {
    const leg = drawn.legs[key];
    if (!leg) continue;
    dogLay(pieces.upper, leg.root, leg.knee);
    dogLay(pieces.lower, leg.knee, leg.hoof);
    pieces.knee.position.set(...leg.knee);
    pieces.foot.position.set(leg.hoof[0], Math.max(leg.hoof[1], horse.shape.legRadius * W * 0.9), leg.hoof[2]);
  }
  const rider = world?.fighters.find((fighter) => fighter.id === horse.rider && fighter.mount === horse) ?? null;
  const carried = dogView.carried;
  if (!rider) return;
  const at = (index) => [rider.x[index * 3], rider.x[index * 3 + 1], rider.x[index * 3 + 2]];
  if (carried.upper) {
    // Spot's arm: its base on the back over the shoulders, the links dogAlong the rider's right arm, the gripper at its hand.
    const shoulder = at(P.rShoulder);
    const base = [shoulder[0], Math.min(shoulder[1], at(P.pelvis)[1] + 0.06), shoulder[2]];
    carried.base.position.set(...base);
    dogLay(carried.upper, base, at(P.rElbow));
    dogLay(carried.lower, at(P.rElbow), at(P.rHand));
    carried.wrist.position.set(...at(P.rHand));
    const hand = at(P.rHand);
    const elbow = at(P.rElbow);
    const dir = new THREE.Vector3(hand[0] - elbow[0], hand[1] - elbow[1], hand[2] - elbow[2]).normalize();
    carried.jaw.position.set(hand[0] + dir.x * 0.06, hand[1] + dir.y * 0.06, hand[2] + dir.z * 0.06);
    carried.jaw.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  }
  if (carried.dogBox) {
    // The turret: its mount on the back, the receiver at the rider's hand turned dogAlong the rifle, the barrel and suppressor to the muzzle.
    const weapon = rider.weapon;
    const hand = at(P.rHand);
    const dir = weapon?.dir ?? [Math.cos(horse.yaw), 0, -Math.sin(horse.yaw)];
    const seat = at(P.pelvis);
    carried.mount.position.set(seat[0], seat[1] + 0.02, seat[2]);
    const aim = new THREE.Vector3(...dir).normalize();
    const centre = [hand[0] - aim.x * 0.05, hand[1] - aim.y * 0.05, hand[2] - aim.z * 0.05];
    carried.dogBox.position.set(...centre);
    carried.dogBox.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), aim);
    carried.optic.position.set(centre[0], centre[1] + 0.09, centre[2]);
    carried.optic.quaternion.copy(carried.dogBox.quaternion);
    const muzzle = [hand[0] + aim.x * 0.55, hand[1] + aim.y * 0.55, hand[2] + aim.z * 0.55];
    dogLay(carried.barrel, [hand[0] + aim.x * 0.1, hand[1] + aim.y * 0.1, hand[2] + aim.z * 0.1], muzzle);
    dogLay(carried.can, muzzle, [muzzle[0] + aim.x * 0.15, muzzle[1] + aim.y * 0.15, muzzle[2] + aim.z * 0.15]);
  }
}

/** Remove a robot dog's model. */
export function disposeRobotDogView(view, dogView) {
  view.scene.remove(dogView.group);
  disposeObject(dogView.group);
  for (const pieces of [...Object.values(dogView.legs), dogView.carried]) {
    for (const mesh of Object.values(pieces)) {
      view.scene.remove(mesh);
      disposeObject(mesh);
    }
  }
}
