// The arena's kit drawn in detail: the gladiators' helmets, the scutum and
// parmula, the scissor's crescent, the sica, the trident and the net. These
// are the game's own characters and few at a time, so they carry far more
// geometry than an army's men.

/* global THREE */
import { P } from './body.js';
import { point } from './physics.js';
import { disposeObject, outlineFor, surface } from './toon.js';
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

let netMaterial = null;
/** The net's cord, drawn as lines (its program kept compiled by the scene's warmers). */
export function netCord() {
  netMaterial ??= new THREE.LineBasicMaterial({ color: 0xd8cfb0 });
  return netMaterial;
}

/** A net's mesh by its state: a bundle in the hand, a dome in flight, a shroud on a man, a heap on the floor. */
function netMesh(kind) {
  const shape = kind === 'held' ? new THREE.IcosahedronGeometry(1, 1)
    : kind === 'wrapped' ? new THREE.SphereGeometry(1, 12, 9)
      : new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.45);
  const mesh = new THREE.LineSegments(new THREE.WireframeGeometry(shape), netCord());
  shape.dispose();
  mesh.userData.kind = kind;
  return mesh;
}

/** Draw every net: those thrown (flying, on a man, on the floor) and those still in a retiarius's hand. */
export function updateNets(view, world) {
  const drawn = view.nets ?? (view.nets = new Map());
  const live = new Set();
  const show = (key, kind) => {
    live.add(key);
    let mesh = drawn.get(key);
    if (mesh && mesh.userData.kind !== kind) {
      view.scene.remove(mesh);
      disposeObject(mesh);
      mesh = null;
    }
    if (!mesh) {
      mesh = netMesh(kind);
      view.scene.add(mesh);
      drawn.set(key, mesh);
    }
    return mesh;
  };
  for (const net of world.nets ?? []) {
    if (net.state === 'ground' && net.age > NET.lies) continue;
    const kind = net.state === 'wrapped' ? 'wrapped' : net.state === 'flying' ? 'open' : 'ground';
    const mesh = show(`net:${net.id}`, kind);
    mesh.position.set(net.x[0], net.x[1], net.x[2]);
    if (kind === 'open') {
      const open = NET.radius * Math.min(1, 0.25 + net.age / NET.open);
      mesh.scale.set(open, open * 0.5, open);
      mesh.rotation.set(Math.PI, net.age * 4, 0);
    } else if (kind === 'wrapped') {
      mesh.scale.set(0.34, 0.5, 0.34);
      mesh.rotation.set(0, net.id, 0);
    } else {
      mesh.scale.set(NET.radius * 0.8, 0.06, NET.radius * 0.8);
      mesh.rotation.set(0, net.id, 0);
    }
  }
  for (const fighter of world.fighters) {
    if (!fighter.net?.held || fighter.state === 'out') continue;
    const mesh = show(`held:${fighter.id}`, 'held');
    const hand = point(fighter.x, P.lHand);
    mesh.position.set(hand[0], hand[1] - 0.12, hand[2]);
    mesh.scale.set(0.11, 0.17, 0.11);
  }
  for (const [key, mesh] of drawn) {
    if (live.has(key)) continue;
    view.scene.remove(mesh);
    disposeObject(mesh);
    drawn.delete(key);
  }
}
