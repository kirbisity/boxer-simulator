// The arena's kit drawn in detail: the gladiators' helmets, the scutum and
// parmula, the scissor's crescent, the sica, the trident and the net. These
// are the game's own characters and few at a time, so they carry far more
// geometry than an army's men.

/* global THREE */
import { P } from './body.js';
import { point } from './physics.js';
import { disposeObject, outlineFor, surface } from './toon.js';
import { holdingHand, layCloth, makeCloth, pinCloth, ROPE_NET, shedCloth, steerCloth, stepCloth, tangleCloth } from './netcloth.js';
import { NET } from './weapons.js';

const DARK = 0x0c0b09;

/** A painted canvas, drawn by `paint(g, w, h)`, as a texture. */
function painted(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  return new THREE.CanvasTexture(canvas);
}

/** Inked: an outline on each of these meshes (thin, for small parts). */
function ink(meshes, width = 0.003) {
  for (const mesh of meshes) {
    mesh.castShadow = true;
    mesh.add(outlineFor(mesh, width));
  }
}

/** A tube along a smooth curve through these points. */
function tube(points, radius, material, segments = 24) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 8, false), material);
}

/**
 * A surface turned round the upright axis from a profile of [radius, height]
 * points, given from the top down; turned from the bottom up, so its faces
 * (and the outline pushed out along them) point outward.
 */
function lathe(profile, material, segments = 32, start = 0, length = Math.PI * 2) {
  const points = profile.map(([x, y]) => new THREE.Vector2(x, y)).reverse();
  return new THREE.Mesh(new THREE.LatheGeometry(points, segments, start, length), material);
}

// ---- Helmets ----------------------------------------------------------------------

/**
 * A gladiator's helmet in head coordinates (x forward, y up, z left; r the
 * head's radius), by `head.style`: thraex (griffin crest, feathers),
 * hoplomachus (brushed crest, feathers), murmillo (the fish's fin), secutor
 * (the smooth egg), scissor (the round smooth helmet). `bronze` is the
 * metal, `head` the design (colour, plume).
 */
export function buildArenaHelm(group, head, r, bronze) {
  const style = head.style ?? 'hoplomachus';
  if (style === 'secutor' || style === 'scissor') {
    smoothHelm(group, head, r, bronze, style === 'secutor');
    return;
  }
  brimmedHelm(group, head, r, bronze, style);
}

/** The visored helmets: bowl, a broad brim rolled at the edge, a grilled visor, and the crest of the kind. */
function brimmedHelm(group, head, r, bronze, style) {
  const parts = [];
  // The bowl, a little peaked, with a raised band where it meets the brim.
  const bowl = lathe([[0, 1.4 * r], [0.55 * r, 1.35 * r], [0.98 * r, 1.12 * r], [1.22 * r, 0.75 * r], [1.3 * r, 0.32 * r]], bronze, 36);
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.25 * r, 0.05 * r, 6, 40), bronze);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.34 * r;
  // The brim: wide, drooping at the back and sides, rolled up at the edge.
  const wide = style === 'murmillo' ? 2.15 : 2.0;
  const brim = lathe([[1.28 * r, 0.32 * r], [1.62 * r, 0.24 * r], [wide * r, 0.1 * r], [(wide + 0.08) * r, 0.16 * r]], bronze, 40);
  brim.material = bronze.clone();
  brim.material.side = THREE.DoubleSide;
  const roll = new THREE.Mesh(new THREE.TorusGeometry((wide + 0.06) * r, 0.05 * r, 6, 40), bronze);
  roll.rotation.x = Math.PI / 2;
  roll.position.y = 0.13 * r;
  // Rivets round the band.
  const rivet = new THREE.SphereGeometry(0.045 * r, 6, 4);
  for (let index = 0; index < 18; index += 1) {
    const angle = (index / 18) * Math.PI * 2;
    const stud = new THREE.Mesh(rivet, bronze);
    stud.position.set(Math.cos(angle) * 1.32 * r, 0.42 * r, Math.sin(angle) * 1.32 * r);
    group.add(stud);
  }
  parts.push(bowl, band, brim, roll);
  // The visor: two halves closing over the face below the brim, a seam down
  // the middle, and the grille over the eyes.
  const visor = new THREE.Mesh(new THREE.SphereGeometry(1.32 * r, 24, 14, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.43, Math.PI * 0.45), bronze);
  visor.material = bronze.clone();
  visor.material.side = THREE.DoubleSide;
  // Facing the arena's dark walls, a mirror-bright visor would read black: a duller polish.
  visor.material.metalness = Math.min(visor.material.metalness ?? 1, 0.45);
  visor.material.roughness = Math.max(visor.material.roughness ?? 0.3, 0.42);
  // Drawn out down over the jaw (the drawn head is long in the chin).
  visor.scale.y = 1.3;
  // The seam where the halves meet, down the middle of the face.
  const seam = new THREE.Mesh(new THREE.TorusGeometry(1.335 * r, 0.03 * r, 5, 12, Math.PI * 0.42), bronze);
  seam.rotation.z = -Math.PI * 0.5;
  group.add(seam);
  grille(group, r, bronze);
  // The lower visor's rim, rolled.
  const chin = new THREE.Mesh(new THREE.TorusGeometry(1.32 * r * Math.sin(Math.PI * 0.88), 0.045 * r, 5, 20, Math.PI * 0.76), bronze);
  // Torus angles start at +x and run towards −z once laid flat; centred on the front.
  chin.rotation.x = Math.PI / 2;
  chin.rotation.z = -Math.PI * 0.38;
  chin.position.y = 1.32 * r * Math.cos(Math.PI * 0.88) * 1.3;
  parts.push(visor, chin);
  // The crest of the kind.
  if (style === 'thraex') griffinCrest(group, head, r, bronze);
  else if (style === 'murmillo') fishCrest(group, head, r, bronze);
  else brushCrest(group, head, r, bronze);
  for (const part of parts) group.add(part);
  ink(parts, 0.004);
}

/** The grille over the eyes: a dark opening crossed by bronze bars, on the visor's curve. */
function grille(group, r, bronze) {
  const dark = surface(DARK);
  const opening = new THREE.Mesh(new THREE.SphereGeometry(1.33 * r, 16, 8, Math.PI * 0.72, Math.PI * 0.56, Math.PI * 0.45, Math.PI * 0.13), dark);
  opening.material.side = THREE.DoubleSide;
  opening.userData.noOutline = true;
  group.add(opening);
  const bar = new THREE.CylinderGeometry(0.026 * r, 0.026 * r, 1, 5);
  const at = (theta, phi) => new THREE.Vector3(1.36 * r * Math.sin(theta) * Math.cos(phi), 1.36 * r * Math.cos(theta), -1.36 * r * Math.sin(theta) * Math.sin(phi));
  // Uprights: from the top of the opening to the bottom, across its width.
  for (let column = -4; column <= 4; column += 1) {
    const phi = column * 0.095;
    const top = at(Math.PI * 0.45, phi);
    const bottom = at(Math.PI * 0.58, phi);
    const upright = new THREE.Mesh(bar, bronze);
    upright.position.copy(top).add(bottom).multiplyScalar(0.5);
    upright.scale.y = top.distanceTo(bottom);
    upright.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bottom.clone().sub(top).normalize());
    group.add(upright);
  }
  // Rings across.
  for (let row = 0; row < 3; row += 1) {
    const theta = Math.PI * 0.45 + (row + 0.5) * Math.PI * 0.043;
    const across = new THREE.Mesh(new THREE.TorusGeometry(1.36 * r * Math.sin(theta), 0.022 * r, 4, 14, Math.PI * 0.56), bronze);
    across.rotation.x = Math.PI / 2;
    across.rotation.z = Math.PI * 0.72 - Math.PI / 2;
    across.position.y = 1.36 * r * Math.cos(theta);
    group.add(across);
  }
}

/** The thraex's griffin: a neck rising from the back of the crown, curving forward to a beaked head; a feather each side. */
function griffinCrest(group, head, r, bronze) {
  const neck = tube([[-0.9 * r, 1.0 * r, 0], [-0.5 * r, 1.65 * r, 0], [0.2 * r, 2.05 * r, 0], [0.75 * r, 1.95 * r, 0], [1.0 * r, 1.65 * r, 0]], 0.17 * r, bronze, 36);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26 * r, 12, 10), bronze);
  skull.position.set(1.0 * r, 1.66 * r, 0);
  skull.scale.set(1.2, 1, 0.9);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.13 * r, 0.42 * r, 10), bronze);
  beak.position.set(1.32 * r, 1.48 * r, 0);
  beak.rotation.z = -Math.PI * 0.7;
  const parts = [neck, skull, beak];
  for (const side of [1, -1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07 * r, 0.3 * r, 6), bronze);
    ear.position.set(0.85 * r, 1.92 * r, side * 0.12 * r);
    ear.rotation.z = 0.5;
    parts.push(ear);
  }
  // A mane of crest scales down the neck.
  for (let scale = 0; scale < 7; scale += 1) {
    const t = scale / 6;
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.07 * r, 0.22 * r, 4), bronze);
    fin.position.set((-0.75 + t * 1.3) * r, (1.3 + Math.sin(t * Math.PI) * 0.85) * r, 0);
    fin.rotation.z = -0.4 + t;
    group.add(fin);
  }
  for (const part of parts) group.add(part);
  ink(parts, 0.003);
  sideFeathers(group, head, r, bronze, 2);
}

/** The hoplomachus's crest: a ridge holding a tall brush of horsehair, and a feather each side. */
function brushCrest(group, head, r, bronze) {
  const ridge = new THREE.Mesh(new THREE.TorusGeometry(1.3 * r, 0.1 * r, 6, 24, Math.PI), bronze);
  ridge.position.y = 0.05 * r;
  group.add(ridge);
  const hair = surface(head.plume ?? 0xb81d22, { roughness: 0.95 });
  for (let tuft = 0; tuft < 22; tuft += 1) {
    const angle = 0.2 + (tuft / 21) * (Math.PI - 0.4);
    const length = (0.8 + 0.25 * Math.sin(tuft * 1.7)) * r;
    const strand = new THREE.Mesh(new THREE.BoxGeometry(0.14 * r, length, 0.16 * r), hair);
    strand.position.set(Math.cos(angle) * (1.35 * r + length / 2), 0.05 * r + Math.sin(angle) * (1.35 * r + length / 2), 0);
    strand.rotation.z = angle - Math.PI / 2;
    group.add(strand);
  }
  ink([ridge], 0.003);
  sideFeathers(group, head, r, bronze, 1);
}

/** The murmillo's fish: a tall fin along the crown, ribbed, notched at the back, a lip at the front. */
function fishCrest(group, head, r, bronze) {
  const shape = new THREE.Shape();
  shape.moveTo(1.0 * r, 1.0 * r);
  shape.quadraticCurveTo(0.9 * r, 1.65 * r, 0.3 * r, 2.05 * r);
  shape.quadraticCurveTo(-0.4 * r, 2.35 * r, -1.05 * r, 2.15 * r);
  // The notched tail.
  shape.lineTo(-0.85 * r, 1.85 * r);
  shape.lineTo(-1.2 * r, 1.7 * r);
  shape.quadraticCurveTo(-1.05 * r, 1.15 * r, -0.9 * r, 0.85 * r);
  shape.quadraticCurveTo(0, 1.25 * r, 1.0 * r, 1.0 * r);
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.12 * r, bevelEnabled: true, bevelThickness: 0.02 * r, bevelSize: 0.02 * r, bevelSegments: 1, curveSegments: 14 }), bronze);
  fin.position.z = -0.06 * r;
  group.add(fin);
  // Ribs down the fin, like a fish's rays.
  for (let rib = 0; rib < 6; rib += 1) {
    const x = (0.75 - rib * 0.3) * r;
    const ray = new THREE.Mesh(new THREE.BoxGeometry(0.03 * r, 0.6 * r, 0.16 * r), bronze);
    ray.position.set(x, (1.55 + Math.sin((rib / 5) * Math.PI) * 0.35) * r, 0);
    ray.rotation.z = 0.35;
    group.add(ray);
  }
  ink([fin], 0.004);
  // A short plume along the fin's top.
  const hair = surface(head.plume ?? 0xb81d22, { roughness: 0.95 });
  for (let tuft = 0; tuft < 6; tuft += 1) {
    const strand = new THREE.Mesh(new THREE.BoxGeometry(0.1 * r, 0.35 * r, 0.12 * r), hair);
    strand.position.set((0.4 - tuft * 0.25) * r, (2.2 + Math.sin((tuft / 5) * Math.PI) * 0.12) * r, 0);
    strand.rotation.z = 0.3;
    group.add(strand);
  }
}

/** Upright feathers in holders on both sides of the bowl. */
function sideFeathers(group, head, r, bronze, perSide) {
  const feather = surface(head.feather ?? 0xf0ece4, { roughness: 0.9 });
  for (const side of [1, -1]) {
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * r, 0.05 * r, 0.3 * r, 6), bronze);
    holder.position.set(-0.1 * r, 0.75 * r, side * 1.1 * r);
    holder.rotation.x = side * 0.35;
    group.add(holder);
    for (let index = 0; index < perSide; index += 1) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.12 * r, 1.5 * r, 6), feather);
      blade.scale.z = 0.25;
      blade.position.set((-0.1 - index * 0.12) * r, 1.55 * r, side * (1.32 + index * 0.06) * r);
      blade.rotation.set(side * 0.3, 0, -0.12 - index * 0.1);
      group.add(blade);
    }
  }
}

/** The smooth helmets: nothing for a net or a prong to catch. */
function smoothHelm(group, head, r, bronze, secutor) {
  if (secutor) secutorHelm(group, head, r, bronze);
  else scissorHelm(group, head, r, bronze);
}

/** Rivets: small bosses at these points (head coordinates, ×r). */
function rivets(group, r, bronze, points, size = 0.04) {
  const stud = new THREE.SphereGeometry(size * r, 6, 4);
  for (const [x, y, z] of points) {
    const boss = new THREE.Mesh(stud, bronze);
    boss.position.set(x * r, y * r, z * r);
    group.add(boss);
  }
}

/** An eye opening: dark, with a raised rim, set in a surface facing `facing` (a unit vector). */
function eyeHole(group, r, bronze, at, radius, facing) {
  const dark = surface(DARK);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(radius * r, 16), dark);
  hole.position.set(at[0] * r, at[1] * r, at[2] * r);
  hole.lookAt(hole.position.clone().add(facing));
  hole.userData.noOutline = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * r, 0.035 * r, 6, 18), bronze);
  rim.position.copy(hole.position);
  rim.quaternion.copy(hole.quaternion);
  group.add(hole, rim);
}

/**
 * The secutor's helmet: a tall, deep, narrow egg of bronze, so a net or a
 * prong slides off; its face a smooth visor outlined by a raised edge (an
 * arch over the brow, down the cheeks to a pointed chin) with a ridge down
 * the middle like a fish's snout and two small eyeholes; a tall dorsal fin
 * from brow to nape, ribbed and notched; the neck guard flaring behind.
 */
function secutorHelm(group, head, r, bronze) {
  const parts = [];
  // The shell: an ellipsoid deeper than it is wide, taller than either.
  const centre = [0.1, 0.08, 0];
  const radii = [1.45, 1.62, 1.18];
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), bronze);
  shell.scale.set(radii[0] * r, radii[1] * r, radii[2] * r);
  shell.position.set(centre[0] * r, centre[1] * r, 0);
  // A point on the shell's front at height y and side z (in r), raised by `lift`, and its outward normal.
  const onShell = (y, z, lift = 0) => {
    const dy = (y - centre[1]) / radii[1];
    const dz = z / radii[2];
    const x = centre[0] + radii[0] * Math.sqrt(Math.max(0, 1 - dy * dy - dz * dz));
    const normal = new THREE.Vector3((x - centre[0]) / radii[0] ** 2, dy / radii[1], dz / radii[2]).normalize();
    return { at: [x * r + normal.x * lift * r, y * r + normal.y * lift * r, z * r + normal.z * lift * r], normal };
  };
  // The visor's raised edge.
  const outline = [[0.6, 0.98], [0.85, 0.55], [0.92, 0], [0.85, -0.55], [0.6, -0.98], [0.0, -1.05], [-0.7, -0.85], [-1.15, -0.4], [-1.32, 0], [-1.15, 0.4], [-0.7, 0.85], [0.0, 1.05], [0.6, 0.98]];
  parts.push(tube(outline.map(([y, z]) => onShell(y, z, 0.02).at.map((v) => v / 1)), 0.05 * r, bronze, 60));
  // The snout ridge down the middle, from the fin's foot to the chin.
  parts.push(tube([0.95, 0.5, 0, -0.5, -1.0, -1.3].map((y) => onShell(y, 0, 0.03).at), 0.06 * r, bronze, 30));
  // Two small eyeholes, sunk in rims, close beside the ridge.
  for (const side of [1, -1]) {
    const { at, normal } = onShell(0.2, side * 0.34, 0.005);
    eyeHole(group, r, bronze, at.map((v) => v / r), 0.1, normal);
  }
  // Breathing slits low on the visor.
  const dark = surface(DARK);
  for (const side of [1, -1]) {
    for (let slit = 0; slit < 3; slit += 1) {
      const { at, normal } = onShell(-0.55 - slit * 0.14, side * 0.2, 0.005);
      const cut = new THREE.Mesh(new THREE.PlaneGeometry(0.16 * r, 0.035 * r), dark);
      cut.position.set(...at);
      cut.lookAt(cut.position.clone().add(normal));
      cut.userData.noOutline = true;
      group.add(cut);
    }
  }
  // The dorsal fin: tall, swept back, notched at the nape, ribbed.
  const fin = new THREE.Shape();
  fin.moveTo(1.3 * r, 0.95 * r);
  fin.quadraticCurveTo(1.15 * r, 1.95 * r, 0.25 * r, 2.35 * r);
  fin.quadraticCurveTo(-0.6 * r, 2.5 * r, -1.2 * r, 2.0 * r);
  fin.lineTo(-1.0 * r, 1.75 * r);
  fin.lineTo(-1.4 * r, 1.45 * r);
  fin.quadraticCurveTo(-0.6 * r, 1.5 * r, 1.3 * r, 0.95 * r);
  const crest = new THREE.Mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.1 * r, bevelEnabled: true, bevelThickness: 0.025 * r, bevelSize: 0.025 * r, bevelSegments: 2, curveSegments: 18 }), bronze);
  crest.position.z = -0.05 * r;
  for (let rib = 0; rib < 5; rib += 1) {
    const ray = new THREE.Mesh(new THREE.BoxGeometry(0.035 * r, 0.55 * r, 0.15 * r), bronze);
    ray.position.set((0.75 - rib * 0.4) * r, (1.85 + Math.sin(((rib + 0.5) / 5) * Math.PI) * 0.2) * r, 0);
    ray.rotation.z = 0.45;
    group.add(ray);
  }
  // The neck guard: a flared skirt round the back and sides (lathe angles run
  // from +z through +x, the front, which is left open), its edge rolled up.
  const guard = lathe([[1.15 * r, -0.95 * r], [1.4 * r, -1.25 * r], [1.72 * r, -1.42 * r], [1.8 * r, -1.4 * r], [1.78 * r, -1.32 * r]], bronze, 30, Math.PI * 0.85, Math.PI * 1.3);
  guard.material = bronze.clone();
  guard.material.side = THREE.DoubleSide;
  parts.push(shell, crest, guard);
  // The hinge bosses at the temples, and rivets along the fin's foot.
  for (const side of [1, -1]) {
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * r, 0.13 * r, 0.06 * r, 14), bronze);
    boss.rotation.x = Math.PI / 2;
    boss.position.set(-0.05 * r, 0.1 * r, side * 1.18 * r);
    parts.push(boss);
  }
  rivets(group, r, bronze, [[1.0, 1.25, 0.18], [1.0, 1.25, -0.18], [0.2, 1.62, 0.2], [0.2, 1.62, -0.2], [-0.7, 1.42, 0.2], [-0.7, 1.42, -0.2]], 0.045);
  for (const part of parts) group.add(part);
  ink(parts, 0.004);
}

/**
 * The scissor's helmet: a high rounded bowl and a flat face plate hinged at
 * the sides, a nose ridge down its middle, two large ringed eye openings
 * and a grid of breathing holes; a ridge over the crown; a broad neck guard.
 */
function scissorHelm(group, head, r, bronze) {
  const parts = [];
  const bowl = lathe([[0, 1.55 * r], [0.55 * r, 1.5 * r], [1.05 * r, 1.25 * r], [1.35 * r, 0.75 * r], [1.42 * r, 0.1 * r], [1.38 * r, -0.4 * r]], bronze, 36);
  // The face plate: flat-ish, a curved panel standing before the face.
  const plateR = 2.4 * r;
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(plateR, plateR, 1.9 * r, 20, 1, true, -0.42, 0.84), bronze);
  plate.material = bronze.clone();
  plate.material.side = THREE.DoubleSide;
  // Cylinder angle 0 is +z; turned so its middle faces +x, set before the face.
  plate.rotation.y = Math.PI / 2;
  plate.position.set(1.48 * r - plateR, -0.25 * r, 0);
  // Its edge: a rolled rim round the plate.
  for (const y of [0.7, -1.2]) {
    const edge = new THREE.Mesh(new THREE.TorusGeometry(plateR, 0.04 * r, 5, 16, 0.84), bronze);
    edge.rotation.set(Math.PI / 2, 0, -0.42);
    edge.position.set(1.48 * r - plateR, y * r, 0);
    parts.push(edge);
  }
  // The nose ridge, down the middle of the plate.
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12 * r, 1.4 * r, 0.12 * r), bronze);
  nose.position.set(1.5 * r, -0.3 * r, 0);
  nose.rotation.z = -0.06;
  // The ridge over the crown, brow to nape.
  const ridge = tube([[1.35 * r, 0.75 * r, 0], [0.75 * r, 1.5 * r, 0], [-0.2 * r, 1.68 * r, 0], [-1.0 * r, 1.25 * r, 0], [-1.35 * r, 0.5 * r, 0]], 0.08 * r, bronze, 30);
  // The neck guard, wide and flat behind, rolled at the edge.
  const guard = lathe([[1.36 * r, -0.4 * r], [1.62 * r, -0.85 * r], [1.98 * r, -1.08 * r], [2.06 * r, -1.06 * r], [2.04 * r, -0.98 * r]], bronze, 30, Math.PI * 0.82, Math.PI * 1.36);
  guard.material = bronze.clone();
  guard.material.side = THREE.DoubleSide;
  parts.push(bowl, plate, nose, ridge, guard);
  // The eyes: large, round, ringed, either side of the nose ridge.
  for (const side of [1, -1]) eyeHole(group, r, bronze, [1.5, 0.12, side * 0.42], 0.22, new THREE.Vector3(1, 0, side * 0.18).normalize());
  // Breathing holes in a grid below the eyes.
  const dark = surface(DARK);
  for (let row = 0; row < 3; row += 1) {
    for (const side of [1, -1]) {
      for (let column = 0; column < 2; column += 1) {
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.045 * r, 8), dark);
        hole.position.set(1.5 * r, (-0.45 - row * 0.17) * r, side * (0.18 + column * 0.16) * r);
        hole.rotation.y = Math.PI / 2;
        hole.userData.noOutline = true;
        group.add(hole);
      }
    }
  }
  // Rivets round the plate and up the ridge, and the hinges at its sides.
  rivets(group, r, bronze, [[1.46, 0.62, 0.62], [1.46, 0.62, -0.62], [1.4, -0.3, 0.86], [1.4, -0.3, -0.86], [1.34, -1.1, 0.75], [1.34, -1.1, -0.75], [1.12, 1.15, 0], [0.3, 1.62, 0], [-0.6, 1.5, 0]], 0.05);
  for (const side of [1, -1]) {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * r, 0.06 * r, 0.3 * r, 8), bronze);
    hinge.position.set(0.95 * r, -0.2 * r, side * 1.18 * r);
    parts.push(hinge);
  }
  for (const part of parts) group.add(part);
  ink(parts, 0.004);
}

// ---- The scissor's scale shirt ------------------------------------------------------

/**
 * The scissor's lorica squamata: bronze scales, each a small plate rounded
 * at the foot, sewn in rows that overlap like a fish's, staggered row to
 * row, round the trunk from the collar to the hips. `part`: 'chest' (rows
 * on the chest bone, collar coordinates: x forward, y up the spine from the
 * neck, z left) or 'hips' (the last rows on the pelvis, y up from it).
 */
export function buildScaleShirt(body, colorHex, envMap, steelMaterial, part) {
  const plate = new THREE.Shape();
  const w = 0.019;
  const h = 0.036;
  plate.moveTo(-w, h * 0.45);
  plate.lineTo(w, h * 0.45);
  plate.lineTo(w, -h * 0.1);
  plate.absarc(0, -h * 0.1, w, 0, -Math.PI, true);
  plate.lineTo(-w, h * 0.45);
  const geometry = new THREE.ExtrudeGeometry(plate, { depth: 0.002, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 6 });
  const material = steelMaterial(envMap, { vertexColors: false, color: new THREE.Color(colorHex).getHex(), roughness: 0.38 });
  const skin = body.segments.trunk.skinRadius;
  const trunk = body.lengths.trunk;
  // The rows' heights and the trunk's half-depth (x) and half-width (z) there, outside the flesh.
  const rows = part === 'chest'
    ? Array.from({ length: Math.round((trunk * 0.8) / 0.024) }, (_, index) => -0.06 - index * 0.024)
    : Array.from({ length: 6 }, (_, index) => 0.06 - index * 0.024);
  const girth = (y) => {
    // Chest broad under the arms, the waist in, the hips out again.
    const down = part === 'chest' ? -y / trunk : 1 - (y + 0.06) / trunk;
    const width = 1.05 - 0.2 * Math.sin(Math.min(1, Math.max(0, (down - 0.35) / 0.5)) * Math.PI);
    return { depth: skin * 0.74 * width + 0.012, width: skin * 1.08 * width + 0.016 };
  };
  const placements = [];
  rows.forEach((y, row) => {
    const { depth, width } = girth(y);
    const around = Math.PI * (depth + width) * (1 + 0.12);
    const count = Math.max(12, Math.round(around / (w * 1.75)));
    for (let column = 0; column < count; column += 1) {
      const angle = ((column + (row % 2) * 0.5) / count) * Math.PI * 2;
      placements.push({ y, angle, depth, width });
    }
  });
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const place = new THREE.Object3D();
  placements.forEach(({ y, angle, depth, width }, index) => {
    const x = Math.cos(angle) * depth;
    const z = Math.sin(angle) * width;
    // Facing out from the trunk (the ellipse's normal), upright, the foot tipped out over the row below.
    const normal = new THREE.Vector3(Math.cos(angle) / depth, 0, Math.sin(angle) / width).normalize();
    place.position.set(x, y, z);
    place.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0).cross(normal).normalize(), new THREE.Vector3(0, 1, 0), normal));
    place.rotateX(-0.22);
    place.updateMatrix();
    mesh.setMatrixAt(index, place.matrix);
  });
  mesh.castShadow = true;
  return mesh;
}

// ---- Maximus's harness ------------------------------------------------------------

/**
 * The general's leather harness, piece by piece over the loft beneath it:
 * on the chest bone (`part` 'chest', collar coordinates: x forward, y up the
 * spine from the neck, z left) a moulded breast and back plate, the layered
 * belly bands, the straps over both shoulders and the buckled strap across
 * the chest; on the pelvis ('hips') the three-strap belt with its brass
 * buckles and the studded leather strips (pteruges) hanging over the tunic.
 */
export function buildHarness(body, armor, envMap, steelMaterial, part) {
  const group = new THREE.Group();
  const leather = surface(new THREE.Color(armor.color).getHex(), { roughness: 0.85 });
  const edge = surface(new THREE.Color(armor.lace ?? armor.color).getHex(), { roughness: 0.9 });
  const brass = steelMaterial(envMap, { vertexColors: false, color: new THREE.Color(armor.gold ?? '#b98a3e').getHex(), roughness: 0.32 });
  const skin = body.segments.trunk.skinRadius;
  const trunk = body.lengths.trunk;
  // The trunk's half-depth (x) and half-width (z) over the loft, from the collar down.
  const girth = (down, out = 0.02) => {
    const waist = 1 - 0.14 * Math.sin(Math.min(1, Math.max(0, (down - 0.35) / 0.5)) * Math.PI);
    return { depth: skin * 0.74 * waist + out, width: skin * 1.08 * waist + out };
  };
  /** A band of leather round the trunk at `y`, `height` tall, with a stitched edge. */
  const band = (y, height, girthAt, material) => {
    const { depth, width } = girthAt;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, height, 36, 1, true), material);
    ring.material = material.clone();
    ring.material.side = THREE.DoubleSide;
    ring.scale.set(depth, 1, width);
    ring.position.y = y;
    const seam = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 4, 36), edge);
    seam.rotation.x = Math.PI / 2;
    seam.scale.set(depth + 0.002, width + 0.002, 0.08);
    seam.position.y = y - height / 2;
    group.add(ring, seam);
  };
  /** A brass buckle: frame and tongue, facing `normal` at `at`. */
  const buckle = (at, normal, size = 0.028) => {
    const frame = new THREE.Mesh(new THREE.TorusGeometry(size * 0.6, size * 0.16, 4, 4), brass);
    frame.position.set(...at);
    frame.lookAt(frame.position.clone().add(normal));
    frame.rotation.z += Math.PI / 4;
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(size * 0.12, size * 0.9, size * 0.12), brass);
    tongue.position.copy(frame.position);
    tongue.quaternion.copy(frame.quaternion);
    group.add(frame, tongue);
  };
  if (part === 'chest') {
    // The breast and back plates: moulded leather over the chest and shoulder blades.
    for (const [start, sign] of [[Math.PI * 0.55, 1], [-Math.PI * 0.45, -1]]) {
      const plate = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 12, start, Math.PI * 0.9, Math.PI * 0.18, Math.PI * 0.56), leather);
      plate.material = leather.clone();
      plate.material.side = THREE.DoubleSide;
      const { depth, width } = girth(0.3, 0.026);
      plate.scale.set(depth * 1.04, trunk * 0.36, width * 1.02);
      plate.position.y = -trunk * 0.28;
      group.add(plate);
      ink([plate], 0.003);
      // A ridge down the middle of each.
      const ridge = tube([[sign * depth * 1.07, -trunk * 0.12, 0], [sign * depth * 1.1, -trunk * 0.3, 0], [sign * depth * 1.05, -trunk * 0.46, 0]], 0.006, edge, 12);
      group.add(ridge);
    }
    // The belly: layered bands, each a little proud of the one below.
    for (let row = 0; row < 5; row += 1) {
      const down = 0.5 + row * 0.085;
      band(-trunk * down, trunk * 0.08, girth(down, 0.024 + (4 - row) * 0.003), leather);
    }
    // The straps over the shoulders, front to back, and their buckles on the breast.
    const shoulder = body.lengths.shoulderSpan / 2;
    for (const side of [1, -1]) {
      const { depth } = girth(0.15, 0.03);
      const strap = tube([[depth * 1.05, -trunk * 0.22, side * shoulder * 0.42], [depth * 0.7, -0.01, side * shoulder * 0.55], [0, 0.035, side * shoulder * 0.6], [-depth * 0.7, -0.01, side * shoulder * 0.55], [-depth * 1.05, -trunk * 0.22, side * shoulder * 0.42]], 0.011, leather, 30);
      strap.scale.set(1, 1, 1);
      group.add(strap);
      buckle([depth * 1.12, -trunk * 0.2, side * shoulder * 0.42], new THREE.Vector3(1, 0, 0));
    }
    // The strap across the chest, left shoulder to right side, its buckle at the breastbone.
    const { depth } = girth(0.3, 0.034);
    group.add(tube([[depth * 0.95, -trunk * 0.12, shoulder * 0.45], [depth * 1.1, -trunk * 0.3, 0], [depth * 0.95, -trunk * 0.5, -shoulder * 0.5]], 0.013, leather, 20));
    buckle([depth * 1.16, -trunk * 0.3, 0], new THREE.Vector3(1, 0, 0), 0.034);
    return group;
  }
  // The hips: the three-strap belt, a buckle each at the front, the strips hanging below.
  const hip = (out) => ({ depth: skin * 0.8 + out, width: skin * 1.12 + out });
  for (let strap = 0; strap < 3; strap += 1) {
    const y = 0.075 - strap * 0.034;
    band(y, 0.03, hip(0.03 + strap * 0.002), leather);
    const { depth, width } = hip(0.034);
    const angle = 0.35;
    buckle([Math.cos(angle) * depth, y, Math.sin(angle) * width], new THREE.Vector3(Math.cos(angle) / depth, 0, Math.sin(angle) / width).normalize(), 0.03);
  }
  // Pteruges: studded leather strips round the front and sides.
  for (let strip = 0; strip < 9; strip += 1) {
    const angle = (strip - 4) * 0.3;
    const { depth, width } = hip(0.04);
    const normal = new THREE.Vector3(Math.cos(angle) / depth, 0, Math.sin(angle) / width).normalize();
    const length = strip % 2 ? 0.26 : 0.3;
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.055, length, 0.007), leather);
    const at = new THREE.Vector3(Math.cos(angle) * depth, 0.0 - length / 2, Math.sin(angle) * width);
    flap.position.copy(at);
    flap.lookAt(at.clone().add(normal));
    flap.rotateX(-0.08);
    group.add(flap);
    ink([flap], 0.002);
    for (const down of [0.55, 0.85]) {
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), brass);
      stud.position.copy(at).add(new THREE.Vector3(0, length / 2 - length * down, 0)).addScaledVector(normal, 0.006);
      group.add(stud);
    }
  }
  return group;
}

// ---- Shields ----------------------------------------------------------------------

/**
 * A shaped shield (spec.shape 'curved') or the scissor's crescent, facing
 * +z, upright along y, across along x (the frame shieldDisc gives).
 */
export function buildArenaShield(spec, envMap, steelMaterial) {
  if (spec.look === 'scissores') return crescent(spec, envMap, steelMaterial);
  if (spec.look === 'riot') return riotShield(spec);
  const group = new THREE.Group();
  const scutum = spec.look === 'scutum';
  const R = spec.curve;
  const half = spec.width / 2 / R;
  const field = scutum ? '#8a1f1a' : '#24407a';
  const texture = painted(256, Math.round((256 * spec.height) / spec.width), (g, w, h) => paintShield(g, w, h, field, scutum));
  const face = new THREE.Mesh(new THREE.CylinderGeometry(R, R, spec.height, 28, 1, true, -half, half * 2), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.65, side: THREE.DoubleSide }));
  // Cylinder angle 0 is +z: the face's middle; the axis behind it.
  face.position.z = -R;
  const bronze = steelMaterial(envMap, { vertexColors: false, color: 0xb98a3e, roughness: 0.35 });
  // Bronze edging along the top and bottom, and down the sides.
  for (const y of [spec.height / 2, -spec.height / 2]) {
    const edge = new THREE.Mesh(new THREE.TorusGeometry(R, 0.011, 5, 24, half * 2), bronze);
    edge.rotation.set(Math.PI / 2, 0, 0);
    edge.rotation.z = Math.PI / 2 - half;
    edge.position.set(0, y, -R);
    group.add(edge);
  }
  for (const side of [1, -1]) {
    const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, spec.height, 5), bronze);
    edge.position.set(Math.sin(half) * R * side, 0, Math.cos(half) * R - R);
    group.add(edge);
  }
  // The boss (umbo) at the middle; on the scutum a spine (spina) up and down through it.
  const boss = new THREE.Mesh(new THREE.SphereGeometry(scutum ? 0.075 : 0.05, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), bronze);
  boss.rotation.x = Math.PI / 2;
  boss.position.z = 0.004;
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(scutum ? 0.11 : 0.07, scutum ? 0.11 : 0.07, 0.006, 20), bronze);
  plate.rotation.x = Math.PI / 2;
  group.add(face, boss, plate);
  if (scutum) {
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.03, spec.height * 0.86, 0.014), bronze);
    spine.position.z = 0.004;
    group.add(spine);
  }
  ink([face, boss], 0.003);
  return group;
}

/** A shield's face: its field, a gilt border, and on the scutum a laurel wreath round the boss and thunderbolts. */
function paintShield(g, w, h, field, scutum) {
  g.fillStyle = field;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#d6b45a';
  g.lineWidth = w * 0.035;
  g.strokeRect(w * 0.06, h * 0.04, w * 0.88, h * 0.92);
  g.lineWidth = w * 0.012;
  g.strokeRect(w * 0.11, h * 0.07, w * 0.78, h * 0.86);
  g.fillStyle = '#d6b45a';
  if (!scutum) {
    // The parmula: a gilt star of eight rays round the boss.
    for (let ray = 0; ray < 8; ray += 1) {
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate((ray / 8) * Math.PI * 2);
      g.beginPath();
      g.moveTo(0, -w * 0.06);
      g.lineTo(w * 0.05, -w * 0.32);
      g.lineTo(-w * 0.05, -w * 0.32);
      g.fill();
      g.restore();
    }
    return;
  }
  // The laurel wreath: two branches of leaves round the boss.
  const radius = w * 0.24;
  for (let leaf = 0; leaf < 26; leaf += 1) {
    const angle = (leaf / 26) * Math.PI * 2;
    g.save();
    g.translate(w / 2 + Math.cos(angle) * radius, h / 2 + Math.sin(angle) * radius * 1.15);
    g.rotate(angle + (leaf % 2 ? 0.6 : -0.6));
    g.beginPath();
    g.ellipse(0, 0, w * 0.028, w * 0.011, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // Jupiter's thunderbolts, above and below.
  for (const y of [h * 0.2, h * 0.8]) {
    g.beginPath();
    g.moveTo(w * 0.5, y - h * 0.08);
    g.lineTo(w * 0.44, y);
    g.lineTo(w * 0.52, y);
    g.lineTo(w * 0.46, y + h * 0.08);
    g.lineTo(w * 0.6, y - h * 0.01);
    g.lineTo(w * 0.52, y - h * 0.01);
    g.closePath();
    g.fill();
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(w * 0.5 + side * w * 0.06, y);
      g.quadraticCurveTo(w * 0.5 + side * w * 0.2, y - h * 0.04, w * 0.5 + side * w * 0.3, y);
      g.lineWidth = w * 0.012;
      g.stroke();
    }
  }
}

/** The scissores: the tube's end over the fist, and its crescent blade across, edge outward. */
function crescent(spec, envMap, steelMaterial) {
  const group = new THREE.Group();
  const steel = steelMaterial(envMap, { vertexColors: false, color: 0xc8ccd2, roughness: 0.3 });
  const shape = new THREE.Shape();
  const outer = spec.radius;
  const inner = spec.radius * 0.62;
  shape.absarc(0, 0, outer, Math.PI * 0.05, Math.PI * 0.95, false);
  shape.absarc(0, -outer * 0.12, inner, Math.PI * 0.92, Math.PI * 0.08, true);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 18 }), steel);
  blade.position.set(0, -outer * 0.35, 0.02);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.12, 14), steel);
  cap.rotation.x = Math.PI / 2;
  cap.position.z = -0.04;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.01, 5, 16), steel);
  collar.position.z = 0.02;
  group.add(blade, cap, collar);
  ink([blade, cap], 0.0025);
  return group;
}

// ---- Weapons ----------------------------------------------------------------------

/** The sica and the trident, along +y from the grip, the edge towards +z. */
export function buildArenaWeapon(kind, spec, envMap, steelMaterial) {
  const group = new THREE.Group();
  const steel = steelMaterial(envMap, { vertexColors: false, color: 0xd9dde4 });
  const wood = surface(0x7a5530, { roughness: 0.7 });
  const bronze = steelMaterial(envMap, { vertexColors: false, color: 0xb98a3e, roughness: 0.35 });
  if (kind === 'sica') {
    // A blade bending like a sickle, the edge on the inside of the curve.
    const shape = new THREE.Shape();
    const steps = 14;
    const spine = (t) => [0.16 * t * t * spec.length, t * spec.length];
    const width = (t) => 0.032 * (1 - 0.75 * t);
    const edge = [];
    const back = [];
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      const [z, y] = spine(t);
      const slope = Math.atan2(0.32 * t * spec.length, spec.length);
      edge.push([z + Math.cos(slope) * width(t), y - Math.sin(slope) * width(t)]);
      back.push([z - Math.cos(slope) * width(t) * 0.4, y + Math.sin(slope) * width(t) * 0.4]);
    }
    shape.moveTo(...back[0]);
    for (const p of back) shape.lineTo(...p);
    for (const p of edge.reverse()) shape.lineTo(...p);
    shape.closePath();
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 4 }), steel);
    // The shape is drawn in z (across) by y (along): turned into the weapon's frame.
    blade.rotation.y = -Math.PI / 2;
    blade.position.x = -0.002;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.016, 0.07), bronze);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, spec.handle, 8), wood);
    grip.position.y = -spec.handle / 2;
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), bronze);
    pommel.position.y = -spec.handle;
    group.add(blade, guard, grip, pommel);
    ink([blade], 0.0018);
    return group;
  }
  // The trident: an ash shaft, an iron socket and crossbar, three barbed prongs.
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, spec.strikeFrom + spec.handle, 8), wood);
  shaft.position.y = (spec.strikeFrom - spec.handle) / 2;
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.017, 0.08, 8), steel);
  socket.position.y = spec.strikeFrom + 0.02;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, 0.16), steel);
  bar.position.y = spec.strikeFrom + 0.06;
  group.add(shaft, socket, bar);
  for (const side of [-1, 0, 1]) {
    const length = side ? 0.13 : 0.17;
    const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, length, 6), steel);
    prong.position.set(0, spec.strikeFrom + 0.06 + length / 2, side * 0.07);
    prong.rotation.x = side * 0.06;
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.045, 6), steel);
    point.position.set(0, spec.strikeFrom + 0.06 + length + 0.02, side * 0.072);
    const barb = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 4), steel);
    barb.position.set(0, spec.strikeFrom + 0.06 + length - 0.005, side * 0.072 + (side || 1) * 0.012);
    barb.rotation.x = Math.PI + (side || 1) * 0.6;
    group.add(prong, point, barb);
  }
  ink([shaft, bar], 0.002);
  return group;
}

// ---- The net ----------------------------------------------------------------------
// Each net is a soft body (netcloth.js) stepped as it is drawn: hung from the
// retiarius's hand, opened in the throw, fouled on the man it catches, slid
// off him into the sand: thick hemp cords as rods, a knot at every crossing.

let netMaterial = null;
/** The net's cord, drawn as lines (its program kept compiled by the scene's warmers). */
export function netCord() {
  netMaterial ??= new THREE.LineBasicMaterial({ color: 0xd8cfb0 });
  return netMaterial;
}

// Thrown nets open from a bundle this fraction of their size.
const NET_GATHER = 0.22;
const NET_UP = new THREE.Vector3(0, 1, 0);
const scratch = { matrix: new THREE.Matrix4(), position: new THREE.Vector3(), direction: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3() };

/** Instanced rods along `pairs` of knots (cords) of radius `radius`. */
function rods(count, radius, color) {
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true), surface(color, { roughness: 0.9 }), count);
  mesh.userData.radius = radius;
  return mesh;
}

/** Instanced balls at the knots. */
function balls(count, color, roughness = 0.9) {
  return new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), surface(color, { roughness }), count);
}

/** A net's drawing for its cloth: its parts and how each follows the knots. */
function buildNetView(cloth) {
  const design = cloth.design;
  const { cords, rest } = cloth.woven;
  const group = new THREE.Group();
  const parts = { group, cloth };
  parts.cords = { mesh: rods(cords.length, design.cord, design.color), pairs: cords };
  parts.knots = { mesh: balls(rest.length, design.color), size: design.knot * 0.45 };
  group.add(parts.cords.mesh, parts.knots.mesh);
  group.traverse((object) => { object.frustumCulled = false; });
  return parts;
}

/** Move a net's drawing to its cloth's knots. */
function drawNet(parts) {
  const { x } = parts.cloth;
  {
    const { mesh, pairs } = parts.cords;
    const radius = mesh.userData.radius;
    pairs.forEach(([a, b], cord) => {
      scratch.position.set((x[a * 3] + x[b * 3]) / 2, (x[a * 3 + 1] + x[b * 3 + 1]) / 2, (x[a * 3 + 2] + x[b * 3 + 2]) / 2);
      scratch.direction.set(x[b * 3] - x[a * 3], x[b * 3 + 1] - x[a * 3 + 1], x[b * 3 + 2] - x[a * 3 + 2]);
      const length = scratch.direction.length();
      if (length > 1e-6) scratch.quaternion.setFromUnitVectors(NET_UP, scratch.direction.divideScalar(length));
      scratch.scale.set(radius, Math.max(length, 1e-4), radius);
      mesh.setMatrixAt(cord, scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  const knots = parts.knots;
  scratch.quaternion.identity();
  scratch.scale.setScalar(knots.size);
  for (let knot = 0; knot < parts.cloth.count; knot += 1) {
    scratch.position.set(x[knot * 3], x[knot * 3 + 1], x[knot * 3 + 2]);
    knots.mesh.setMatrixAt(knot, scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale));
  }
  knots.mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Draw every net, stepping each as a soft body `dt` s: those in a
 * retiarius's hand, and those thrown (flying, on a man, on the floor).
 */
export function updateNets(view, world, dt = 1 / 60) {
  const drawn = view.nets ?? (view.nets = new Map());
  // A new fight's nets are new nets, though they share the old ones' keys.
  if (view.netsWorld !== world) {
    for (const key of [...drawn.keys()]) dropNetView(view, key);
    view.netsWorld = world;
  }
  const design = ROPE_NET;
  const live = new Set();
  const add = (key) => {
    const parts = buildNetView(makeCloth(design));
    view.scene.add(parts.group);
    drawn.set(key, parts);
    return parts;
  };
  for (const fighter of world.fighters) {
    if (!fighter.net?.held || fighter.state === 'out') continue;
    const key = `held:${fighter.id}`;
    live.add(key);
    let parts = drawn.get(key);
    const hand = holdingHand(fighter);
    if (!parts || parts.cloth.design !== design) {
      if (parts) dropNetView(view, key);
      parts = add(key);
      layCloth(parts.cloth, hand, { hang: true });
    }
    pinCloth(parts.cloth, hand);
  }
  for (const net of world.nets ?? []) {
    if (net.state === 'ground' && net.age > NET.lies) continue;
    const key = `net:${net.id}`;
    live.add(key);
    let parts = drawn.get(key);
    if (!parts || parts.cloth.design !== design) {
      if (parts) dropNetView(view, key);
      // The net in his hand is the one thrown.
      const held = drawn.get(`held:${net.owner}`);
      if (held?.cloth.design === design) {
        drawn.delete(`held:${net.owner}`);
        drawn.set(key, held);
        parts = held;
      } else parts = add(key);
      const spread = (NET.radius * (1 - NET_GATHER)) / NET.open;
      layCloth(parts.cloth, net.x, { gather: NET_GATHER, velocity: net.v, spread, yaw: net.id * 1.3, dt: 1 / 60 });
      pinCloth(parts.cloth, null);
      parts.thrown = true;
    }
    const cloth = parts.cloth;
    if (net.state === 'wrapped') {
      const man = world.fighters[net.target];
      if (cloth.tangled?.fighter !== man) tangleCloth(cloth, man);
      // Until it has caught on him, it is carried onto him.
      if (cloth.tangled.knots.size === 0) steerCloth(cloth, vec3Above(net.x, 0.35), dt, 0.12);
    } else {
      // Freed, he throws it off; dead, it stays lying over him.
      if (cloth.tangled) {
        if (cloth.tangled.fighter.state === 'out') tangleCloth(cloth, null);
        else shedCloth(cloth, cloth.tangled.fighter);
      }
      if (net.state === 'flying') steerCloth(cloth, net.x, dt, 0.06);
    }
  }
  for (const [key, parts] of drawn) {
    if (!live.has(key)) {
      dropNetView(view, key);
      continue;
    }
    stepCloth(parts.cloth, dt, world.fighters);
    drawNet(parts);
  }
}

const vec3Above = (p, rise) => [p[0], p[1] + rise, p[2]];

function dropNetView(view, key) {
  const parts = view.nets.get(key);
  view.scene.remove(parts.group);
  parts.group.traverse((object) => {
    object.geometry?.dispose?.();
    for (const material of [].concat(object.material ?? [])) {
      material.alphaMap?.dispose?.();
      material.dispose?.();
    }
  });
  view.nets.delete(key);
}

// ---- Commodus's lion ----------------------------------------------------------------

/**
 * The lion's scalp worn as a hood (head coordinates: x forward, y up, z to
 * the left; r the head's radius): the skull over his crown, the upper jaw and
 * its fangs over his brow, the eyes and ears, the mane round the back and
 * sides, the hide down over the nape.
 */
export function buildLionHead(group, head, r) {
  const fur = surface(new THREE.Color(head.color).getHex(), { roughness: 1 });
  const mane = surface(new THREE.Color(head.mane ?? head.color).getHex(), { roughness: 1 });
  const maneLight = surface(new THREE.Color(head.mane ?? head.color).lerp(new THREE.Color(head.color), 0.5).getHex(), { roughness: 1 });
  const dark = surface(0x1e1410, { roughness: 0.8 });
  const bone = surface(0xeee6d2, { roughness: 0.5 });
  const inked = [];
  const part = (geometry, material, scale, at, rotation = null) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(...scale);
    mesh.position.set(...at);
    if (rotation) mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  };
  const ball = new THREE.SphereGeometry(1, 16, 12);
  // The scalp over his crown, and the hide over the back of his head.
  inked.push(part(new THREE.SphereGeometry(1.4 * r, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), fur, [1.08, 0.72, 1.04], [0, 0.24 * r, 0]));
  const nape = part(new THREE.SphereGeometry(1.4 * r, 18, 12, -Math.PI / 2, Math.PI, Math.PI * 0.35, Math.PI * 0.5), fur.clone(), [1.05, 1, 1.08], [0, 0.05 * r, 0]);
  nape.material.side = THREE.DoubleSide;
  // The lion's face over his brow: a long flat-topped head, a heavy brow, a
  // broad nose ending in a wide dark pad, the whisker pads either side.
  inked.push(part(ball, fur, [0.95 * r, 0.34 * r, 0.62 * r], [1.15 * r, 0.82 * r, 0]));
  inked.push(part(ball, fur, [0.72 * r, 0.26 * r, 0.3 * r], [1.62 * r, 0.8 * r, 0]));
  for (const side of [1, -1]) inked.push(part(ball, fur, [0.42 * r, 0.3 * r, 0.3 * r], [1.72 * r, 0.56 * r, side * 0.2 * r]));
  inked.push(part(ball, dark, [0.12 * r, 0.12 * r, 0.24 * r], [2.12 * r, 0.76 * r, 0]));
  part(new THREE.BoxGeometry(0.02 * r, 0.22 * r, 0.03 * r), dark, [1, 1, 1], [2.13 * r, 0.6 * r, 0]);
  for (const side of [1, -1]) {
    // The brow ridge, the amber eye under it, its black pupil.
    inked.push(part(ball, fur, [0.32 * r, 0.12 * r, 0.3 * r], [1.38 * r, 1.08 * r, side * 0.32 * r], [side * 0.25, 0, 0]));
    part(ball, surface(0xc08a2a, { roughness: 0.4 }), [0.06 * r, 0.06 * r, 0.11 * r], [1.5 * r, 0.98 * r, side * 0.34 * r]);
    part(ball, dark, [0.03 * r, 0.05 * r, 0.03 * r], [1.56 * r, 0.98 * r, side * 0.34 * r]);
    // The fangs of the upper jaw over his brow, and the small front teeth.
    part(new THREE.ConeGeometry(0.065 * r, 0.36 * r, 6), bone, [1, 1, 1], [1.78 * r, 0.28 * r, side * 0.26 * r], [0, 0, Math.PI]);
    part(new THREE.ConeGeometry(0.035 * r, 0.12 * r, 5), bone, [1, 1, 1], [1.95 * r, 0.38 * r, side * 0.1 * r], [0, 0, Math.PI]);
    // Small round ears, set back and half lost in the mane.
    inked.push(part(ball, fur, [0.1 * r, 0.16 * r, 0.15 * r], [0.25 * r, 1.3 * r, side * 0.78 * r]));
    // The hide hanging down beside his face to the shoulders, the mane on it.
    const flap = part(ball, fur, [0.55 * r, 1.25 * r, 0.22 * r], [-0.15 * r, -0.55 * r, side * 1.22 * r], [side * 0.12, 0, 0]);
    inked.push(flap);
  }
  // The mane: a full ruff framing his face from the crown down both sides
  // to his shoulders and round the back, darker toward the outside.
  const up = new THREE.Vector3(0, 1, 0);
  const rings = [
    { count: 16, radius: 1.45, height: 0.75, droop: 0.55, size: 1, material: maneLight },
    { count: 18, radius: 1.5, height: 0.15, droop: 0.75, size: 1.15, material: mane },
    { count: 16, radius: 1.42, height: -0.55, droop: 0.95, size: 1.2, material: mane },
    { count: 12, radius: 1.3, height: -1.25, droop: 1, size: 1.05, material: mane },
  ];
  for (const ring of rings) {
    for (let index = 0; index < ring.count; index += 1) {
      // From beside the face (azimuth ±0.32π, x forward) round the back.
      const around = Math.PI * (0.32 + (1.36 * (index + 0.5)) / ring.count);
      const out = new THREE.Vector3(Math.cos(around), 0, Math.sin(around));
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.3 * r * ring.size, 1.05 * r * ring.size, 6), ring.material);
      tuft.position.set(out.x * ring.radius * r, ring.height * r, out.z * ring.radius * r);
      tuft.quaternion.setFromUnitVectors(up, out.clone().multiplyScalar(1 - ring.droop * 0.6).add(new THREE.Vector3(0, -ring.droop, 0)).normalize());
      group.add(tuft);
    }
  }
  ink(inked, 0.004);
}

/**
 * The lion's pelt (the collar's coordinates: x forward, y up the spine from
 * the neck, z to the left): the hide down his back to the buttocks, ragged
 * at its edge, the mane on at its top; the forelegs brought over the
 * shoulders and knotted on the breast, the paws hanging; the tail.
 */
export function buildLionPelt(body, armor) {
  const group = new THREE.Group();
  const fur = surface(new THREE.Color(armor.color).getHex(), { roughness: 1 });
  const mane = surface(new THREE.Color(armor.lace ?? armor.color).getHex(), { roughness: 1 });
  const dark = surface(0x1e1410, { roughness: 0.8 });
  const skin = body.segments.trunk.skinRadius;
  const trunk = body.lengths.trunk;
  const girth = (down, out) => {
    const waist = 1 - 0.14 * Math.sin(Math.min(1, Math.max(0, (down - 0.35) / 0.5)) * Math.PI);
    return { depth: skin * 0.74 * waist + out, width: skin * 1.08 * waist + out };
  };
  // The hide: a sheet round the back and a little round the sides, from the
  // neck to below the hips, standing off the body as a stiff hide does.
  const rows = 14;
  const columns = 18;
  const positions = [];
  const indices = [];
  for (let row = 0; row <= rows; row += 1) {
    const down = 0.02 + (1.18 * row) / rows;
    // Over the shoulders it is narrower; below the waist it hangs free and flares.
    const { depth, width } = girth(Math.min(down, 1), 0.035 + Math.max(0, down - 0.85) * 0.12);
    const spread = Math.PI * (0.42 + 0.2 * Math.min(1, down / 0.3));
    for (let column = 0; column <= columns; column += 1) {
      const angle = -spread + (2 * spread * column) / columns;
      // Ragged at the foot: each column's hem a little longer or shorter.
      const hem = row === rows ? 0.06 * trunk * Math.sin(column * 2.7) : 0;
      positions.push(-depth * Math.cos(angle), -trunk * down - hem, width * Math.sin(angle));
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const hide = new THREE.Mesh(geometry, fur.clone());
  hide.material.side = THREE.DoubleSide;
  group.add(hide);
  ink([hide], 0.003);
  // The mane where the scalp joins the hide, falling over the top of the back.
  const top = girth(0.06, 0.05);
  for (let index = 0; index < 9; index += 1) {
    const angle = Math.PI * (-0.4 + (0.8 * index) / 8);
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), mane);
    tuft.scale.set(0.04, 0.11, 0.05);
    tuft.position.set(-top.depth * Math.cos(angle), -trunk * (0.1 + (index % 2) * 0.04), top.width * Math.sin(angle) * 0.9);
    group.add(tuft);
  }
  /** A leg of the hide: a furred tube along these points, its paw and claws at the end. */
  const leg = (points, radius) => {
    const limb = tube(points, radius, fur, 16);
    const end = new THREE.Vector3(...points[points.length - 1]);
    const before = new THREE.Vector3(...points[points.length - 2]);
    const along = end.clone().sub(before).normalize();
    const paw = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.5, 10, 8), fur);
    paw.position.copy(end).addScaledVector(along, radius * 0.8);
    paw.scale.set(1.1, 0.8, 1.1);
    group.add(limb, paw);
    ink([limb, paw], 0.0025);
    for (let claw = -1; claw <= 1; claw += 1) {
      const nail = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.22, radius * 0.9, 5), dark);
      nail.position.copy(paw.position).addScaledVector(along, radius * 1.3).add(new THREE.Vector3(0, 0, claw * radius * 0.7));
      nail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
      group.add(nail);
    }
  };
  // The forelegs, over the shoulders to a knot on the breast, the paws hanging below it.
  const shoulder = body.lengths.shoulderSpan / 2;
  const breast = girth(0.24, 0.04);
  for (const side of [1, -1]) {
    group.add(tube([[-0.02, -0.01, side * shoulder * 0.7], [breast.depth * 0.6, -trunk * 0.05, side * breast.width * 0.72], [breast.depth * 1.0, -trunk * 0.16, side * 0.06], [breast.depth * 1.06, -trunk * 0.22, side * 0.015]], 0.026, fur, 18));
    leg([[breast.depth * 1.08, -trunk * 0.24, side * 0.02], [breast.depth * 1.1, -trunk * 0.32, side * 0.05], [breast.depth * 1.06, -trunk * 0.4, side * 0.06]], 0.022);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), fur);
  knot.scale.set(0.8, 1, 1.3);
  knot.position.set(breast.depth * 1.08, -trunk * 0.22, 0);
  group.add(knot);
  ink([knot], 0.003);
  // The hind legs hanging at the hide's lower corners.
  const low = girth(1, 0.12);
  for (const side of [1, -1]) {
    leg([[-low.depth * 0.25, -trunk * 1.12, side * low.width * 0.95], [-low.depth * 0.2, -trunk * 1.3, side * low.width * 1.0], [-low.depth * 0.1, -trunk * 1.45, side * low.width * 0.98]], 0.024);
  }
  // The tail from the middle of the hem, a dark tuft at its end.
  const tail = [[-low.depth * 1.0, -trunk * 1.16, 0], [-low.depth * 1.15, -trunk * 1.4, 0.01], [-low.depth * 1.05, -trunk * 1.62, -0.02], [-low.depth * 0.95, -trunk * 1.78, 0]];
  group.add(tube(tail, 0.012, fur, 16));
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 7), mane);
  tassel.rotation.z = Math.PI;
  tassel.position.set(...tail[tail.length - 1]).add(new THREE.Vector3(0, -0.04, 0));
  group.add(tassel);
  return group;
}

/**
 * A police riot shield: a clear, slightly curved polycarbonate sheet
 * (seen through, a little tinted), a black rim, POLICE across it in white
 * and a black band, the handle and arm strap behind.
 */
function riotShield(spec) {
  const group = new THREE.Group();
  const R = spec.curve;
  const half = spec.width / 2 / R;
  const sheet = new THREE.Mesh(new THREE.CylinderGeometry(R, R, spec.height, 24, 1, true, -half, half * 2), new THREE.MeshStandardMaterial({ color: 0xcfe0ea, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
  sheet.position.z = -R;
  const black = surface(0x141416, { roughness: 0.6 });
  for (const y of [spec.height / 2, -spec.height / 2]) {
    const edge = new THREE.Mesh(new THREE.TorusGeometry(R, 0.012, 5, 24, half * 2), black);
    edge.rotation.set(Math.PI / 2, 0, Math.PI / 2 - half);
    edge.position.set(0, y, -R);
    group.add(edge);
  }
  for (const side of [1, -1]) {
    const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, spec.height, 5), black);
    edge.position.set(Math.sin(half) * R * side, 0, Math.cos(half) * R - R);
    group.add(edge);
  }
  // POLICE on a band across the upper third, painted on the curve.
  const texture = painted(256, 48, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(20,20,24,0.85)';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f4f4';
    g.font = 'bold 34px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('POLICE', w / 2, h / 2 + 2);
  });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.002, R + 0.002, 0.11, 24, 1, true, -half, half * 2), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }));
  band.position.set(0, spec.height * 0.22, -R);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), black);
  handle.position.set(0, 0, -0.04);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.012), black);
  strap.position.set(0, 0.16, -0.03);
  group.add(sheet, band, handle, strap);
  return group;
}

// ---- Rome --------------------------------------------------------------------------

/**
 * The legion's helmet, the Imperial Gallic type (head coordinates: x
 * forward, y up, z left): an iron bowl with a brow guard standing out over
 * the face, embossed brows on the forehead, broad hinged cheek pieces, a
 * deep neck guard flaring out behind, brass trim and bosses; on top the
 * crest knob, or a centurion's crest of red horsehair worn side to side.
 */
export function buildGalea(outer, head, r, iron) {
  // Worn up on the forehead, clear of the eyes (the drawn head is large): all but the cheek pieces lifted.
  const group = new THREE.Group();
  group.position.y = 0.22 * r;
  outer.add(group);
  const brass = surface(new THREE.Color(head.gold ?? '#b98a3e').getHex(), { roughness: 0.35 });
  const inked = [];
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(1.3 * r, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), iron);
  bowl.scale.set(1.04, 1, 1.02);
  bowl.position.y = 0.1 * r;
  inked.push(bowl);
  // The brow guard: a flat peak out over the forehead.
  const peak = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 6), iron);
  peak.scale.set(0.32 * r, 0.05 * r, 0.95 * r);
  peak.position.set(1.22 * r, 0.32 * r, 0);
  inked.push(peak);
  // Brass trim round the rim.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.33 * r, 0.035 * r, 5, 30), brass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.12 * r;
  // The neck guard: a deep plate flaring out and down behind (cylinder angle π..2π is x < 0).
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.32 * r, 1.95 * r, 0.42 * r, 24, 1, true, Math.PI * 1.08, Math.PI * 0.84), iron);
  neck.material = iron.clone();
  neck.material.side = THREE.DoubleSide;
  neck.position.y = -0.08 * r;
  inked.push(neck);
  // Ribs across the neck guard.
  for (const y of [0.04, -0.12]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(1.45 * r + (0.04 - y) * 1.2 * r, 0.025 * r, 4, 20, Math.PI * 0.8), brass);
    rib.rotation.set(Math.PI / 2, 0, Math.PI * 0.6);
    rib.position.y = y * r;
    group.add(rib);
  }
  // The embossed "eyebrows" on the bowl's front.
  for (const side of [1, -1]) {
    const brow = new THREE.Mesh(new THREE.TorusGeometry(0.4 * r, 0.018 * r, 4, 12, Math.PI * 0.6), iron);
    brow.rotation.set(0, Math.PI / 2, Math.PI * 0.2);
    brow.position.set(1.3 * r, 0.36 * r, side * 0.4 * r);
    group.add(brow);
  }
  // The cheek pieces, hinged at the rim, curving in to the jaw, a brass boss on each.
  for (const side of [1, -1]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), iron);
    cheek.scale.set(0.58 * r, 0.88 * r, 0.09 * r);
    cheek.position.set(0.42 * r, -0.36 * r, side * 1.18 * r);
    cheek.rotation.set(side * -0.18, 0, -0.12);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08 * r, 8, 6), brass);
    boss.position.set(0.47 * r, -0.3 * r, side * 1.28 * r);
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * r, 0.04 * r, 0.3 * r, 6), brass);
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(0.45 * r, 0.3 * r, side * 1.3 * r);
    outer.add(cheek, boss, hinge);
    inked.push(cheek);
  }
  // The crest: its knob, and a centurion's horsehair across the crown.
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * r, 0.12 * r, 0.22 * r, 10), brass);
  knob.position.y = 1.5 * r;
  group.add(bowl, peak, rim, neck, knob);
  if (head.crest === 'transverse') {
    const hair = surface(new THREE.Color(head.plume ?? '#b3161b').getHex(), { roughness: 1 });
    const crest = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hair);
    crest.scale.set(0.16 * r, 1.0 * r, 1.55 * r);
    crest.position.y = 1.45 * r;
    const holder = new THREE.Mesh(new THREE.BoxGeometry(0.1 * r, 0.1 * r, 2.4 * r), brass);
    holder.position.y = 1.5 * r;
    group.add(crest, holder);
    inked.push(crest);
  }
  ink(inked, 0.004);
}

/**
 * A Roman soldier's kit off the loft (collar or hips coordinates, as
 * buildHarness): on a centurion's chest the harness of his phalerae, nine
 * gilt discs and torcs at the shoulders; on the hips of both, the belt's
 * apron of studded leather strips hanging over the groin.
 */
export function buildRomanKit(body, armor, envMap, steelMaterial, part) {
  const group = new THREE.Group();
  const gilt = steelMaterial(envMap, { vertexColors: false, color: new THREE.Color(armor.gold ?? '#c9a24a').getHex(), roughness: 0.3 });
  const leather = surface(new THREE.Color(armor.lace ?? '#3a2416').getHex(), { roughness: 0.85 });
  const skin = body.segments.trunk.skinRadius;
  const trunk = body.lengths.trunk;
  if (part === 'chest') {
    if (armor.kind !== 'centurion') return group;
    const depth = skin * 0.74 + 0.03;
    const width = skin * 1.08;
    // The harness: straps in a grid over the mail, a disc at each crossing.
    for (let row = 0; row < 3; row += 1) {
      for (let column = -1; column <= 1; column += 1) {
        const down = 0.24 + row * 0.13;
        const across = column * 0.36;
        const at = new THREE.Vector3(Math.cos(across) * depth * (1 - 0.06 * row), -trunk * down, Math.sin(across) * width * 0.9);
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 18), gilt);
        disc.position.copy(at);
        disc.lookAt(at.clone().add(new THREE.Vector3(Math.cos(across), 0, Math.sin(across))));
        disc.rotateX(Math.PI / 2);
        const face = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), gilt);
        face.position.copy(at).add(new THREE.Vector3(Math.cos(across), 0, Math.sin(across)).multiplyScalar(0.005));
        face.lookAt(at.clone().add(new THREE.Vector3(Math.cos(across), 0, Math.sin(across)).multiplyScalar(2)));
        face.rotateX(Math.PI / 2);
        group.add(disc, face);
      }
    }
    for (const column of [-1, 0, 1]) {
      const across = column * 0.36;
      group.add(tube([[Math.cos(across) * depth * 1.0, -trunk * 0.2, Math.sin(across) * width * 0.9], [Math.cos(across) * depth * 0.95, -trunk * 0.52, Math.sin(across) * width * 0.88]], 0.006, leather, 8));
    }
    for (const down of [0.24, 0.37, 0.5]) {
      group.add(tube([[Math.cos(-0.4) * depth, -trunk * down, Math.sin(-0.4) * width * 0.9], [depth * 1.02, -trunk * down, 0], [Math.cos(0.4) * depth, -trunk * down, Math.sin(0.4) * width * 0.9]], 0.006, leather, 10));
    }
    // A torc at each shoulder, hung from the harness.
    const shoulder = body.lengths.shoulderSpan / 2;
    for (const side of [1, -1]) {
      const torc = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 6, 16, Math.PI * 1.7), gilt);
      torc.position.set(depth * 0.7, -trunk * 0.12, side * shoulder * 0.55);
      torc.rotation.set(0, Math.PI / 2, Math.PI * 0.65);
      group.add(torc);
    }
    return group;
  }
  // The apron: eight leather strips from the belt's front, iron studs down them, pendants at their ends.
  const hip = (out) => ({ depth: skin * 0.8 + out, width: skin * 1.12 + out });
  for (let strip = 0; strip < 8; strip += 1) {
    const angle = (strip - 3.5) * 0.09;
    const { depth, width } = hip(0.045);
    const normal = new THREE.Vector3(Math.cos(angle) / depth, 0, Math.sin(angle) / width).normalize();
    const length = 0.24;
    const at = new THREE.Vector3(Math.cos(angle) * depth, 0.06 - length / 2, Math.sin(angle) * width);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.016, length, 0.005), leather);
    flap.position.copy(at);
    flap.lookAt(at.clone().add(normal));
    group.add(flap);
    for (let stud = 0; stud < 5; stud += 1) {
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), gilt);
      boss.position.copy(at).add(new THREE.Vector3(0, length / 2 - 0.02 - stud * 0.045, 0)).addScaledVector(normal, 0.004);
      group.add(boss);
    }
    const pendant = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.025, 6), gilt);
    pendant.position.copy(at).add(new THREE.Vector3(0, -length / 2 - 0.012, 0));
    pendant.rotation.z = Math.PI;
    group.add(pendant);
  }
  return group;
}
