// The skeleton for the bone layer: recognisable anatomy built per rig bone,
// in that bone's own frame (x forward, y along the bone, z = x × y), sized
// from the body's bone mass and lengths. Each group is moved rigidly with
// its bone, so the skeleton is posed by the same rig that skins the body.

/* global THREE */
import { vec } from './pose.js';
import { BONE, BONES } from './rig.js';
import { outlineFor, surface } from './toon.js';

const BONE_COLOR = 0xeee3c8;

function mesh(geometry, material) {
  const result = new THREE.Mesh(geometry, material);
  result.castShadow = true;
  return result;
}

function sphere(radius, material, scale = [1, 1, 1], position = [0, 0, 0]) {
  const result = mesh(new THREE.SphereGeometry(radius, 12, 9), material);
  result.scale.set(...scale);
  result.position.set(...position);
  return result;
}

/** A shaft along +y from y0 to y1, flaring towards both ends as long bones do. */
function shaft(radius, y0, y1, material, flare = 1.7) {
  const points = [];
  for (let step = 0; step <= 12; step += 1) {
    const u = step / 12;
    const widen = 1 + (flare - 1) * (Math.exp(-((u / 0.12) ** 2)) + Math.exp(-(((1 - u) / 0.12) ** 2)));
    points.push(new THREE.Vector2(radius * widen, y0 + (y1 - y0) * u));
  }
  return mesh(new THREE.LatheGeometry(points, 10), material);
}

/** A curved tube through points (bone-local), for ribs, clavicles, the jaw. */
function curve(points, radius, material, segments = 16) {
  const path = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return mesh(new THREE.TubeGeometry(path, segments, radius, 6, false), material);
}

function vertebrae(group, count, from, to, size, material) {
  for (let index = 0; index < count; index += 1) {
    const y = from + ((to - from) * (index + 0.5)) / count;
    const body = mesh(new THREE.CylinderGeometry(size, size * 1.05, Math.abs(to - from) / count * 0.7, 10), material);
    body.position.set(-0.01, y, 0);
    const spine = mesh(new THREE.BoxGeometry(size * 1.6, size * 0.45, size * 0.35), material);
    spine.position.set(-0.01 - size * 1.4, y - size * 0.15, 0);
    spine.rotation.z = 0.35;
    group.add(body, spine);
  }
}

/**
 * Build the skeleton: one Group per rig bone, filled with that bone's anatomy.
 * @returns {THREE.Group[]} indexed like BONES
 */
export function buildSkeleton(body, bindFrames) {
  const material = surface(BONE_COLOR, { roughness: 0.75 });
  const length = (bone) => vec.length(vec.sub(bindFrames[bone].end, bindFrames[bone].origin));
  const scale = Math.max(0.8, Math.min(1.3, body.boneDensity)) * (body.heightM / 1.8);
  const L = body.lengths;
  const groups = BONES.map(() => new THREE.Group());

  // Pelvis: iliac wings, sacrum, the pubic arch, hip sockets.
  const pelvis = groups[BONE.pelvis];
  for (const side of [1, -1]) {
    // Each ilium is a thin curved blade, flaring up and out from the hip
    // socket and turned to face forward and in.
    const wing = sphere(0.07 * scale, material, [0.75, 0.85, 0.16], [-0.012, 0.05 * scale, side * L.hipSpan * 0.5]);
    wing.rotation.set(side * 0.35, side * 0.75, 0);
    pelvis.add(wing, sphere(0.024 * scale, material, [1, 1, 1], [0.01, -0.02, side * L.hipSpan * 0.48]));
  }
  const sacrum = mesh(new THREE.ConeGeometry(0.04 * scale, 0.11 * scale, 8), material);
  sacrum.rotation.z = Math.PI;
  sacrum.position.set(-0.06 * scale, 0.0, 0);
  const pubis = mesh(new THREE.TorusGeometry(L.hipSpan * 0.42, 0.012 * scale, 6, 16, Math.PI), material);
  pubis.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  pubis.position.set(0.0, -0.035, 0);
  pelvis.add(sacrum, pubis);

  vertebrae(groups[BONE.spine], 5, 0, length(BONE.spine), 0.02 * scale, material);

  // Chest: thoracic spine, twelve pairs of ribs sloping down to the sternum,
  // and the shoulder blades on the back.
  const chest = groups[BONE.chest];
  const chestLength = length(BONE.chest);
  vertebrae(chest, 7, 0, chestLength, 0.017 * scale, material);
  const halfWidth = L.shoulderSpan * 0.4;
  const depth = body.segments.trunk.muscleRadius * 0.55;
  for (let rib = 0; rib < 10; rib += 1) {
    const y = chestLength * (0.92 - rib * 0.085) - L.trunk * 0.1;
    const width = halfWidth * (0.62 + 0.38 * Math.sin(Math.PI * (0.25 + rib * 0.055)));
    for (const side of [1, -1]) {
      const points = [];
      for (let step = 0; step <= 8; step += 1) {
        const theta = (step / 8) * Math.PI * (rib < 7 ? 1 : 0.8);
        points.push([-depth * Math.cos(theta) + 0.01, y - 0.05 * Math.sin(theta / 2) * (1 + rib * 0.05), side * width * Math.sin(theta)]);
      }
      chest.add(curve(points, 0.0055 * scale, material));
    }
  }
  const sternum = mesh(new THREE.BoxGeometry(0.012, chestLength * 0.75, 0.035 * scale), material);
  sternum.position.set(depth + 0.008, chestLength * 0.42 - L.trunk * 0.08, 0);
  chest.add(sternum);
  for (const side of [1, -1]) {
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.09 * scale, 0.02), new THREE.Vector2(0.02, -0.14 * scale)]);
    const blade = mesh(new THREE.ShapeGeometry(shape), material);
    blade.material.side = THREE.DoubleSide;
    blade.rotation.set(0, side > 0 ? -Math.PI / 2 + 0.4 : Math.PI / 2 - 0.4, 0);
    blade.position.set(-depth - 0.01, chestLength * 0.85, side * halfWidth * 0.35);
    chest.add(blade);
  }

  vertebrae(groups[BONE.neck], 5, 0, length(BONE.neck), 0.013 * scale, material);

  // Skull: cranium, cheekbones, eye sockets, the upper jaw and the mandible.
  const head = groups[BONE.head];
  const r = L.headRadius;
  const socketMaterial = surface(0x2b2420);
  head.add(sphere(r * 0.88, material, [1.02, 0.95, 0.82], [-0.08 * r, 0.12 * r, 0]));
  head.add(sphere(r * 0.55, material, [1, 0.9, 1.15], [0.38 * r, -0.28 * r, 0]));
  for (const side of [1, -1]) {
    head.add(sphere(r * 0.17, socketMaterial, [0.6, 1, 1], [0.74 * r, 0.02 * r, side * 0.3 * r]));
    head.add(sphere(r * 0.14, material, [1, 0.6, 1.6], [0.55 * r, -0.18 * r, side * 0.55 * r]));
  }
  head.add(sphere(r * 0.08, socketMaterial, [0.5, 1.2, 0.8], [0.85 * r, -0.25 * r, 0]));
  const jaw = [];
  for (let step = 0; step <= 10; step += 1) {
    const theta = -Math.PI / 2 + (step / 10) * Math.PI;
    jaw.push([0.6 * r * Math.cos(theta) + 0.1 * r, -0.72 * r + 0.25 * r * Math.abs(Math.sin(theta)), 0.55 * r * Math.sin(theta)]);
  }
  head.add(curve(jaw, 0.07 * r, material, 20));

  for (const side of ['l', 'r']) {
    const sign = side === 'l' ? 1 : -1;
    const clavicleLength = length(BONE[`${side}Clavicle`]);
    groups[BONE[`${side}Clavicle`]].add(curve([[0.02, 0, 0], [0.03, clavicleLength * 0.35, sign * 0.006], [0.0, clavicleLength * 0.75, -sign * 0.006], [-0.01, clavicleLength, 0]], 0.007 * scale, material));

    const armLength = length(BONE[`${side}UpperArm`]);
    const humerus = groups[BONE[`${side}UpperArm`]];
    const armRadius = Math.max(0.008, body.segments[`${side}UpperArm`].boneRadius * 0.7);
    humerus.add(shaft(armRadius, 0.02, armLength - 0.01, material), sphere(armRadius * 2.6, material, [1, 1, 1], [-0.005, 0.01, 0]));
    humerus.add(sphere(armRadius * 1.6, material, [0.9, 0.8, 1.8], [0, armLength - 0.005, 0]));

    const foreLength = length(BONE[`${side}Forearm`]);
    const forearm = groups[BONE[`${side}Forearm`]];
    const foreRadius = Math.max(0.006, body.segments[`${side}Forearm`].boneRadius * 0.45);
    const radiusBone = shaft(foreRadius, 0.01, foreLength * 0.72, material, 1.5);
    radiusBone.position.z = sign * foreRadius * 1.6;
    const ulna = shaft(foreRadius * 0.9, -0.015, foreLength * 0.72, material, 1.5);
    ulna.position.z = -sign * foreRadius * 1.4;
    forearm.add(radiusBone, ulna, sphere(foreRadius * 1.5, material, [1.4, 1, 1], [-0.012, 0, -sign * foreRadius * 1.4]));
    // The fist: carpals, metacarpals and curled finger bones.
    forearm.add(sphere(0.02 * scale, material, [0.9, 0.7, 1.3], [0, foreLength * 0.78, 0]));
    for (let finger = 0; finger < 4; finger += 1) {
      const z = (finger - 1.5) * 0.016 * scale;
      forearm.add(curve([[0, foreLength * 0.8, z], [0.005, foreLength * 0.94, z], [0.03, foreLength * 1.0, z], [0.04, foreLength * 0.92, z]], 0.0045 * scale, material, 8));
    }

    const thighLength = length(BONE[`${side}Thigh`]);
    const femur = groups[BONE[`${side}Thigh`]];
    const legRadius = Math.max(0.01, body.segments[`${side}Thigh`].boneRadius * 0.6);
    femur.add(shaft(legRadius, 0.03, thighLength - 0.015, material));
    // The femoral head angles in towards the hip socket on a short neck.
    femur.add(curve([[0, 0.05, 0], [0.005, 0.02, -sign * 0.025]], legRadius * 0.9, material, 4));
    femur.add(sphere(legRadius * 2, material, [1, 1, 1], [0.005, 0.015, -sign * 0.03]));
    femur.add(sphere(legRadius * 1.5, material, [1, 1.2, 1], [-0.004, 0.04, sign * 0.02]));
    femur.add(sphere(legRadius * 1.5, material, [1.2, 0.9, 2], [0, thighLength - 0.012, 0]));
    femur.add(sphere(legRadius * 1.2, material, [0.5, 1.1, 1], [legRadius * 2.6, thighLength + 0.005, 0]));

    const shinLength = length(BONE[`${side}Shin`]);
    const shin = groups[BONE[`${side}Shin`]];
    const shinRadius = Math.max(0.008, body.segments[`${side}Shank`].boneRadius * 0.55);
    shin.add(sphere(shinRadius * 1.9, material, [1, 0.7, 1.7], [0, 0.015, 0]));
    shin.add(shaft(shinRadius, 0.02, shinLength - 0.01, material));
    const fibula = shaft(shinRadius * 0.45, 0.03, shinLength - 0.005, material, 1.8);
    fibula.position.set(-shinRadius * 1.2, 0, sign * shinRadius * 2.2);
    shin.add(fibula);

    const foot = groups[BONE[`${side}Foot`]];
    const footLength = length(BONE[`${side}Foot`]);
    foot.add(sphere(0.022 * scale, material, [1.2, 1.4, 1], [0.0, 0.0, -0.02]));
    for (let ray = 0; ray < 5; ray += 1) {
      const z = (ray - 2) * 0.012 * scale * sign;
      foot.add(curve([[0.0, 0.01, 0], [0.0, footLength * 0.6, z - 0.03], [0.0, footLength * 1.05, z - 0.035]], 0.0045 * scale, material, 6));
    }
  }

  for (const group of groups) {
    group.matrixAutoUpdate = false;
    // Each outline rides on its own piece, so it inherits the piece's placement.
    for (const child of [...group.children]) if (child.isMesh) child.add(outlineFor(child, 0.0018));
  }
  return groups;
}
