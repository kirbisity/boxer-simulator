// The German jousting harness of the 1480s–1500s (Stechzeug) drawn: the
// frog-mouthed helm (stechhelm) with its plume and mantling, and what is
// fixed on the breastplate (the tilting targe, the queue behind the lance
// rest). The body's plate itself (breast, pauldrons, tassets) is the loft's
// (loftbody.js, `armor.joust`).

import { surface } from './toon.js';

// The helm in head radii (head coordinates: x forward, y up, z left), as
// horizontal sections [y, back x, front x, half-width]: the lower shell (the
// bevor and the beak, its top edge the sight's lower lip, standing forward
// of the crown) and the crown plate (from just behind and above the sight,
// sweeping up and back over the head and down behind). From the front the
// sight is the dark gap between the beak's edge and the crown above it.
export const STECHHELM = {
  lower: [[-1.45, -1.3, 1.3, 1.35], [-1.0, -1.26, 1.55, 1.3], [-0.5, -1.23, 1.8, 1.25], [0.0, -1.22, 1.95, 1.2], [0.38, -1.22, 2.05, 1.15]],
  crown: [[0.4, -1.24, 1.45, 1.17], [0.8, -1.2, 1.32, 1.12], [1.3, -1.1, 0.98, 1.0], [1.75, -0.9, 0.5, 0.82], [2.05, -0.62, 0.02, 0.55], [2.18, -0.38, -0.24, 0.26], [2.21, -0.32, -0.28, 0.02]],
  // Each section's outline: a superellipse of this power behind (2 an ellipse; higher, flatter sides) and,
  // ahead, of `point` (below 2, drawn to a keel: the helm's front is a ridge, the beak a prow).
  square: 2.6,
  point: 1.35,
  sides: 28,
  // The sight: a dark slit across the front between the beak's edge and the crown (y from, to; half-width).
  sight: [0.36, 0.52, 0.7],
  // The fluted ridges along the crown, from the sight back over the top (z of each, in head radii).
  flutes: [0, 0.32, -0.32, 0.62, -0.62],
  // Brass rivet heads along the beak's edge and down the rear plate.
  rivets: { edge: 9, rear: 6, size: 0.06 },
  // The plate bolted down onto the breastplate in front ([top y, bottom y, top half-width, bottom half-width, how far it leans forward]),
  // the long plate down the nape onto the backplate ([top y, bottom y, half-width]).
  chest: [-1.35, -2.75, 1.0, 1.25, 0.55],
  nape: [-1.3, -2.45, 0.75],
  // The plume: an ostrich plume on a holder at the back of the crown, sweeping back and down.
  plume: { at: [-0.5, 2.12], blades: 13, size: 0.26, length: 4.4, reach: 1.35 },
  // The mantling (lambrequin): dagged cloth strips from under a wreath at the crown, falling down the back in the knight's two colours.
  mantling: { strips: 7, length: 3.3, width: 1.0, spread: 1.0, dags: 4 },
};

/** A point on a section's outline (superellipse) at `angle` (0 forward, π/2 left). */
function helmSectionPoint([y, back, front, half], angle, power) {
  const centre = (front + back) / 2;
  const reach = (front - back) / 2;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const exponent = c > 0 ? STECHHELM.point : power;
  const shape = (v) => Math.sign(v) * Math.abs(v) ** (2 / exponent);
  return [centre + reach * shape(c), y, half * shape(s)];
}

/** A shell lofted through horizontal sections (STECHHELM), in head radii scaled by `r`. */
function helmShellGeometry(sections, r, power, sides) {
  const positions = [];
  const indices = [];
  for (const section of sections) {
    for (let side = 0; side < sides; side += 1) positions.push(...helmSectionPoint(section, (side / sides) * Math.PI * 2, power).map((value) => value * r));
  }
  for (let ring = 0; ring < sections.length - 1; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      const a = ring * sides + side;
      const b = ring * sides + ((side + 1) % sides);
      indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A ribbon along `points` (THREE.Vector3), `width(u)` across at each, lying across `side` (a unit vector). */
function mantlingRibbon(points, width, side) {
  const curve = new THREE.CatmullRomCurve3(points);
  const steps = 18;
  const positions = [];
  const indices = [];
  for (let step = 0; step <= steps; step += 1) {
    const u = step / steps;
    const at = curve.getPoint(u);
    const half = width(u) / 2;
    positions.push(at.x - side.x * half, at.y - side.y * half, at.z - side.z * half, at.x + side.x * half, at.y + side.y * half, at.z + side.z * half);
    if (step < steps) indices.push(step * 2, step * 2 + 1, step * 2 + 2, step * 2 + 1, step * 2 + 3, step * 2 + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The stechhelm: the frog-mouthed jousting helm, very tall in profile, the
 * beak standing forward under the sight and the crown sweeping up and back
 * from it, fluted along the top; brass rivets along the sight's edge and
 * down the rear plate; the plate in front running down onto the breastplate
 * with its bolt holes and a bolt, the long rear plate down the nape. On the
 * crown a great white ostrich plume, and (in full detail) a wreath of the
 * knight's colours and the mantling falling from under it down the back.
 * `steel` the shared steel material; `head` the design's head entry.
 */
export function buildStechhelm(group, head, r, steel, { lowDetail = false } = {}) {
  const spec = STECHHELM;
  const iron = steel.clone();
  iron.color = new THREE.Color(head.color ?? '#c2c7ce');
  iron.side = THREE.DoubleSide;
  const brass = steel.clone();
  brass.color = new THREE.Color(head.gold ?? '#c9a23a');
  const dark = surface(0x050506);
  group.add(new THREE.Mesh(helmShellGeometry(spec.lower, r, spec.square, spec.sides), iron));
  group.add(new THREE.Mesh(helmShellGeometry(spec.crown, r, spec.square, spec.sides), iron));
  // The sight: dark behind the gap.
  const [sightFrom, sightTo, sightHalf] = spec.sight;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.06 * r, (sightTo - sightFrom) * r, sightHalf * 2 * r), dark);
  sight.position.set(1.5 * r, ((sightFrom + sightTo) / 2) * r, 0);
  sight.userData.noOutline = true;
  group.add(sight);
  // The plate down onto the breast: a curved sheet leaning forward to lie on it.
  const [chestTop, chestBottom, topHalf, bottomHalf, lean] = spec.chest;
  const frontAt = (y) => spec.lower[0][2] + ((chestTop - y) / (chestTop - chestBottom)) * lean;
  const chestSections = [0, 0.5, 1].map((u) => {
    const y = chestTop + (chestBottom - chestTop) * u;
    const half = topHalf + (bottomHalf - topHalf) * u;
    return [y, frontAt(y) - 0.9, frontAt(y), half];
  });
  // Only its front half: the sections' outline from the left side round the front to the right.
  const chestPlate = new THREE.Mesh(helmHalfShell(chestSections, r, spec.square, 0, spec.sides), iron);
  group.add(chestPlate);
  const [napeTop, napeBottom, napeHalf] = spec.nape;
  const napeSections = [[napeTop, spec.lower[0][1], spec.lower[0][1] + 0.9, napeHalf], [napeBottom, spec.lower[0][1] - 0.35, spec.lower[0][1] + 0.55, napeHalf * 1.15]];
  group.add(new THREE.Mesh(helmHalfShell(napeSections, r, spec.square, Math.PI, spec.sides), iron));
  const plume = buildOstrichPlume(r, head.plume ?? '#f2efe6', steel, spec.plume);
  group.add(plume);
  if (lowDetail) return;
  // The flutes: raised ridges along the crown from above the sight back over the top.
  for (const z of spec.flutes) {
    const path = [];
    for (let index = 1; index < spec.crown.length - 1; index += 1) {
      const section = spec.crown[index];
      const angle = Math.asin(Math.max(-0.95, Math.min(0.95, z / section[3])));
      const [x, y, zz] = helmSectionPoint(section, angle, spec.square);
      path.push(new THREE.Vector3(x * 1.01 * r, y * r + 0.03 * r, zz * r));
    }
    if (path.length > 1) group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 16, 0.035 * r, 5, false), iron));
  }
  // Brass rivet heads: along the beak's edge, under the sight, and down the rear plate.
  const rivet = new THREE.SphereGeometry(spec.rivets.size * r, 6, 4);
  const top = spec.lower.at(-1);
  for (let index = 0; index < spec.rivets.edge; index += 1) {
    const angle = -1.1 + (2.2 * index) / (spec.rivets.edge - 1);
    const [x, y, z] = helmSectionPoint([top[0] - 0.1, top[1], top[2], top[3]], angle, spec.square);
    const head = new THREE.Mesh(rivet, brass);
    head.position.set(x * 1.01 * r, y * r, z * 1.01 * r);
    group.add(head);
  }
  for (let index = 0; index < spec.rivets.rear; index += 1) {
    const y = 0.9 - (index * (0.9 - napeBottom - 0.2)) / (spec.rivets.rear - 1);
    // Down the back of the crown and the nape plate, a pair at each height.
    for (const z of [0.22, -0.22]) {
      const back = y > spec.lower[0][0] ? -1.22 + Math.max(0, y - 0.62) * 0.4 : spec.lower[0][1] + (spec.lower[0][0] - y) * 0.3 - 0.02;
      const stud = new THREE.Mesh(rivet, brass);
      stud.position.set((back - 0.02) * r, y * r, z * r);
      group.add(stud);
    }
  }
  // Rosettes: a brass rose at the head of the rear plate, and the bolt holding the front plate to the breast, with its holes.
  const rose = new THREE.Group();
  for (let petal = 0; petal < 8; petal += 1) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09 * r, 6, 4), brass);
    const angle = (petal / 8) * Math.PI * 2;
    leaf.scale.set(0.4, 1, 0.55);
    leaf.position.set(0, Math.cos(angle) * 0.12 * r, Math.sin(angle) * 0.12 * r);
    leaf.rotation.x = -angle;
    rose.add(leaf);
  }
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08 * r, 8, 6), brass);
  rose.add(boss);
  rose.position.set((spec.lower[0][1] - 0.06) * r, -0.9 * r, 0);
  group.add(rose);
  for (const z of [0.4, -0.4]) {
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.06 * r, 8), dark);
    const y = chestBottom + 0.35;
    hole.position.set((frontAt(y) + 0.015) * r, y * r, z * r);
    hole.rotation.y = Math.PI / 2;
    hole.rotation.x = -0.4;
    hole.userData.noOutline = true;
    group.add(hole);
  }
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * r, 0.1 * r, 0.12 * r, 6), brass);
  const boltY = chestBottom + 0.65;
  bolt.rotation.z = Math.PI / 2;
  bolt.position.set((frontAt(boltY) + 0.05) * r, boltY * r, 0);
  group.add(bolt);
  if (head.mantling) group.add(buildMantling(r, head.mantling, spec));
}

/** Half a lofted shell: the outline's half centred on `facing` (0 the front, π the back), open at its edges. */
function helmHalfShell(sections, r, power, facing, sides) {
  const half = sides / 2;
  const positions = [];
  const indices = [];
  for (const section of sections) {
    for (let side = 0; side <= half; side += 1) positions.push(...helmSectionPoint(section, facing - Math.PI / 2 + (side / half) * Math.PI, power).map((value) => value * r));
  }
  const row = half + 1;
  for (let ring = 0; ring < sections.length - 1; ring += 1) {
    for (let side = 0; side < half; side += 1) {
      const a = ring * row + side;
      indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** The great ostrich plume: blades fanning back from a holder at the back of the crown, curling down at their ends. */
function buildOstrichPlume(r, colour, steel, spec) {
  const plume = new THREE.Group();
  const [x, y] = spec.at;
  plume.position.set(x * r, y * r, 0);
  const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * r, 0.1 * r, 0.32 * r, 8), steel);
  plume.add(holder);
  const feather = surface(new THREE.Color(colour).getHex(), { roughness: 0.95 });
  for (let index = 0; index < spec.blades; index += 1) {
    const share = index / (spec.blades - 1);
    // From standing up and forward a little, round over the back and down.
    const angle = -0.35 + share * 2.3;
    const blade = new THREE.Mesh(new THREE.SphereGeometry(spec.size * r, 8, 6), feather);
    blade.scale.set(1, spec.length * (1 - 0.35 * Math.abs(share - 0.45)), 0.7);
    const reach = spec.reach * r * (0.75 + 0.5 * Math.sin(share * Math.PI));
    blade.position.set(-Math.sin(angle) * reach, 0.2 * r + Math.cos(angle) * reach, (index % 3 - 1) * 0.16 * r);
    blade.rotation.z = angle;
    blade.rotation.x = (index % 3 - 1) * 0.25;
    plume.add(blade);
  }
  return plume;
}

/**
 * The mantling: a wreath of the two colours twisted round the plume's foot,
 * and from under it cloth strips cut into leaves (dagged) falling over the
 * crown and down the back of the helm, flaring out to either side and
 * curling at their ends; each strip in one colour, alternating.
 */
function buildMantling(r, [colour, colour2], spec) {
  const group = new THREE.Group();
  const cloth = [colour, colour2].map((hex) => {
    const material = surface(new THREE.Color(hex).getHex(), { roughness: 0.85 });
    material.side = THREE.DoubleSide;
    return material;
  });
  const [x, y] = spec.plume.at;
  // The wreath (torse): two coils, one of each colour.
  for (const [index, material] of cloth.entries()) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.34 * r, 0.09 * r, 6, 16), material);
    coil.rotation.x = Math.PI / 2;
    coil.rotation.y = index * 0.4;
    coil.position.set(x * r, (y - 0.02 + index * 0.1) * r, 0);
    group.add(coil);
  }
  const { strips, length, width, spread, dags } = spec.mantling;
  for (let strip = 0; strip < strips; strip += 1) {
    const share = strips === 1 ? 0.5 : strip / (strips - 1);
    const side = (share - 0.5) * 2;
    // Down over the back of the crown, then out to the side as it falls, the end curling outward.
    const points = [
      new THREE.Vector3((x - 0.15) * r, (y + 0.05) * r, side * 0.25 * r),
      new THREE.Vector3(-1.1 * r, (y - 0.6) * r, side * 0.6 * r),
      new THREE.Vector3(-1.45 * r, (y - 0.6 - length * 0.3) * r, side * (0.7 + spread * 0.5) * r),
      new THREE.Vector3(-1.6 * r, (y - 0.6 - length * 0.65) * r, side * (0.8 + spread) * r),
      new THREE.Vector3(-1.4 * r, (y - 0.6 - length) * r, side * (0.9 + spread * 1.3) * r),
    ];
    const across = new THREE.Vector3(0.55, 0, side >= 0 ? -0.3 : 0.3).normalize();
    // Dagged: the width swelling and pinching in leaves down its length, wide at the foot.
    const wide = (u) => width * r * (0.45 + 0.75 * u) * (0.65 + 0.35 * Math.abs(Math.sin(u * dags * Math.PI)));
    group.add(new THREE.Mesh(mantlingRibbon(points, wide, across), cloth[strip % 2]));
  }
  return group;
}

/**
 * What is fixed on the breastplate, in the chest bone's frame at the neck
 * (x forward, y up the spine, z to the left; m): the tilting targe (a
 * squarish shield of wood covered in leather, a little hollowed, tied with
 * cord over the left breast), and the queue (the bar running back from the
 * lance rest on the right breast that held the lance's butt down).
 * `depth`, `drop`: the breastplate's front (m out from the spine) and how
 * far below the neck its middle is.
 */
export function buildJoustKit(body, armor, steel, { lowDetail = false } = {}) {
  const group = new THREE.Group();
  const skin = body.segments.trunk.skinRadius;
  const trunk = body.lengths.trunk;
  const front = skin * 1.08;
  const leather = surface(new THREE.Color(armor.leather ?? '#6b4528').getHex(), { roughness: 0.85 });
  // The targe: ~0.42 × 0.46 m, hollowed (a section of a cylinder), its top
  // edge turned forward, hung over the left breast and shoulder, tilted
  // forward at the top as it lies on the swell of the breastplate.
  const targeWidth = 0.36 * body.heightM / 1.8;
  const targeHeight = 0.4 * body.heightM / 1.8;
  const bend = 0.6;
  const targe = new THREE.Mesh(new THREE.CylinderGeometry(targeWidth / bend, targeWidth / bend, targeHeight, 10, 1, true, -bend / 2, bend), leather);
  targe.material.side = THREE.DoubleSide;
  // The cylinder's middle faces +z in its own frame; turned to face forward and pushed out so its middle sits proud of the breast.
  const holder = new THREE.Group();
  targe.rotation.y = Math.PI / 2;
  targe.position.x = front + 0.03 - targeWidth / bend;
  holder.add(targe);
  holder.position.set(0, -0.28 * trunk, skin * 0.62);
  holder.rotation.z = -0.12;
  holder.rotation.y = -0.5;
  group.add(holder);
  // The queue: a steel bar from the lance rest back along the right side, turned up at its end.
  const iron = steel.clone();
  iron.color = new THREE.Color(armor.color ?? '#c2c7ce');
  const queuePath = [[front * 0.95, -0.38 * trunk, -skin * 0.62], [front * 0.3, -0.36 * trunk, -skin * 0.95], [-front * 0.4, -0.34 * trunk, -skin * 1.0], [-front * 0.85, -0.22 * trunk, -skin * 0.9]].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(queuePath), 12, 0.011, 6, false), iron));
  // The lance rest's bracket standing off the breast, below the arrêt.
  const rest = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.05), iron);
  rest.position.set(front + 0.03, -0.38 * trunk, -skin * 0.55);
  group.add(rest);
  if (lowDetail) return group;
  // The targe's edge bound in leather, a raised rib down its middle, and the cords that tie it to the breast.
  const cord = surface(0xd8cfb8, { roughness: 0.9 });
  for (const [y, z] of [[0.3, 0.06], [0.3, -0.06], [-0.3, 0.06], [-0.3, -0.06]]) {
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 4), cord);
    knot.position.set(front + 0.035, y * targeHeight, z);
    holder.add(knot);
  }
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.012, targeHeight * 0.9, 0.025), leather);
  rib.position.set(front + 0.033, 0, 0);
  holder.add(rib);
  return group;
}
