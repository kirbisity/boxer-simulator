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
  if (head.style) {
    buildShapedStechhelm(group, head, r, steel, STECHHELM_STYLES[head.style], { lowDetail });
    return;
  }
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

// ---- The helm drawn to its profile: three shapes of the German stechhelm ----

// Each is drawn the same way, in head radii (x forward, y up, z left), from
// horizontal sections [y, back x, front x, half-width, y at the back]:
// - `lower`: the bevor, a closed ring from the neck up to the beak, whose
//   top edge is the sight's lower lip (the fifth number lifts its back and
//   sides up under the crown, so the sight is open only in front);
// - `crown`: the skull plate, from its projecting upper lip over the sight
//   up and back over the head;
// - `chest`, `nape`: the front and back plates (listed top down), open at
//   the sides over the shoulders, flaring from the neck onto breast and back.
// The sections are control points, smoothed between (`smooth` steps a
// span); `creases` (indices into a list) break the smoothing there and split
// the normals, so an edge reads as an edge; `keel` splits them down the
// front middle (a ridge), and `point` below 2 draws the front to it. The
// concave profile is the front x and back x of the sections: the beak
// standing out at the sight, the bevor drawn in at the throat, and the
// plates flaring out again onto the breast and back.
export const STECHHELM_STYLES = {
  // Augsburg / Nuremberg, c. 1490: the classic frog-mouth. A deep waist at
  // the throat, a sharp beak, the crown fluted with seven ridges sweeping
  // back from the sight, brass rivets with rosette washers along the lips
  // and down the sides and back, bolt holes in the lower plates.
  augsburg: {
    lower: [[-1.85, -1.08, 1.02, 1.24], [-1.5, -0.98, 0.92, 1.14], [-1.1, -1.06, 0.96, 1.14], [-0.65, -1.12, 1.3, 1.16], [-0.2, -1.15, 1.86, 1.14], [0.18, -1.14, 2.3, 1.1, 0.68], [0.3, -1.12, 2.38, 1.06, 0.8]],
    lowerCreases: [5],
    crown: [[0.5, -1.2, 2.5, 1.12, 0.5], [0.6, -1.21, 2.34, 1.15], [0.95, -1.2, 1.85, 1.14], [1.4, -1.1, 1.22, 1.03], [1.8, -0.92, 0.56, 0.83], [2.06, -0.66, 0.02, 0.56], [2.19, -0.44, -0.24, 0.26], [2.21, -0.38, -0.3, 0.02]],
    crownCreases: [1],
    chest: [[-1.85, -1.08, 1.02, 1.24], [-2.3, -0.25, 1.62, 1.28], [-2.75, 0.15, 2.2, 1.34]],
    chestCreases: [1],
    nape: [[-1.85, -1.08, 1.02, 1.24], [-2.45, -1.55, 0.25, 1.24]],
    square: 2.6, point: 1.25, keel: true, sides: 36, smooth: 3,
    flutes: [0, 0.27, -0.27, 0.53, -0.53, 0.78, -0.78], fluteSize: 0.032,
    rivets: { lips: 9, rows: 5, size: 0.055, rosettes: true, brass: true },
    edge: 'rolled', holes: 2, bolt: true,
    plume: { at: [-0.52, 2.12], blades: 13, size: 0.26, length: 4.4, reach: 1.35 },
    mantling: { strips: 7, length: 3.3, width: 1.0, spread: 1.0, dags: 4 },
  },
  // The sweeping frog: plain bright steel, its lines long and smooth, the
  // upper lip thrust far out over the sight like a frog's snout, the beak
  // under it set back, one strong ridge down the middle of the crown from
  // the lip over the top; steel rivets, few; no ornament but the plume.
  frog: {
    lower: [[-1.85, -1.08, 1.04, 1.24], [-1.5, -1.0, 0.95, 1.14], [-1.05, -1.08, 1.0, 1.14], [-0.55, -1.13, 1.3, 1.16], [-0.1, -1.15, 1.74, 1.13], [0.22, -1.13, 2.05, 1.08, 0.8]],
    lowerCreases: [],
    crown: [[0.44, -1.2, 2.85, 1.0, 0.44], [0.56, -1.21, 2.62, 1.13], [0.9, -1.2, 1.92, 1.15], [1.35, -1.12, 1.25, 1.06], [1.78, -0.95, 0.58, 0.86], [2.06, -0.7, 0.04, 0.58], [2.2, -0.46, -0.24, 0.27], [2.23, -0.4, -0.3, 0.02]],
    crownCreases: [1],
    chest: [[-1.85, -1.08, 1.04, 1.24], [-2.3, -0.28, 1.58, 1.27], [-2.75, 0.1, 2.1, 1.32]],
    chestCreases: [],
    nape: [[-1.85, -1.08, 1.04, 1.24], [-2.45, -1.5, 0.25, 1.24]],
    square: 2.4, point: 1.6, keel: false, crownKeel: true, sides: 36, smooth: 3,
    ridge: 0.075,
    rivets: { lips: 5, rows: 3, size: 0.05, rosettes: false, brass: false },
    edge: 'plain', holes: 2, bolt: false,
    plume: { at: [-0.55, 2.14], blades: 15, size: 0.27, length: 4.8, reach: 1.45 },
    mantling: { strips: 7, length: 3.3, width: 1.0, spread: 1.0, dags: 4 },
  },
  // The Gothic: its lower lip (the beak) thrust out beyond the crown's, the
  // whole front fluted, the flutes running from the chest
  // plate up the bevor and over the crown, sharp-crested; a roped edge to
  // both lips of the sight; the chest plate's foot cut in scallops;
  // blackened or russet steel with brass rivets and rosettes all round.
  gothic: {
    lower: [[-1.85, -1.08, 1.02, 1.24], [-1.5, -0.98, 0.92, 1.14], [-1.1, -1.06, 0.98, 1.14], [-0.65, -1.12, 1.32, 1.16], [-0.2, -1.15, 1.98, 1.14], [0.18, -1.14, 2.58, 1.1, 0.68], [0.3, -1.12, 2.7, 1.06, 0.8]],
    lowerCreases: [5],
    crown: [[0.5, -1.2, 2.3, 1.12, 0.5], [0.6, -1.21, 2.2, 1.15], [0.95, -1.2, 1.8, 1.14], [1.4, -1.1, 1.24, 1.03], [1.8, -0.93, 0.56, 0.83], [2.07, -0.67, 0.02, 0.56], [2.2, -0.45, -0.24, 0.26], [2.22, -0.39, -0.3, 0.02]],
    crownCreases: [1],
    chest: [[-1.85, -1.08, 1.02, 1.24], [-2.3, -0.25, 1.62, 1.28], [-2.85, 0.2, 2.25, 1.36]],
    chestCreases: [],
    nape: [[-1.85, -1.08, 1.02, 1.24], [-2.5, -1.55, 0.25, 1.26]],
    square: 2.6, point: 1.3, keel: true, sides: 72, smooth: 3,
    // Fluting in the plate itself: `count` sharp-crested ridges round the outline, raised `depth`, on the front within `arc` of the middle.
    fluting: { count: 22, depth: 0.06, arc: 1.75 },
    scallops: { count: 7, depth: 0.22 },
    rivets: { lips: 11, rows: 6, size: 0.06, rosettes: true, brass: true },
    edge: 'roped', holes: 3, bolt: true,
    plume: { at: [-0.52, 2.13], blades: 13, size: 0.26, length: 4.4, reach: 1.35 },
    mantling: { strips: 7, length: 3.3, width: 1.0, spread: 1.0, dags: 4 },
  },
};

const helmSmoothstep = (from, to, v) => {
  const t = Math.max(0, Math.min(1, (v - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** A point on a section of a shaped helm at `angle` (0 forward, π/2 left), with its fluting and its back lifted. */
function helmShapedPoint(section, angle, spec) {
  const [y, back, front, half, yBack = y] = section;
  const centre = (front + back) / 2;
  const reach = (front - back) / 2;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const shape = (v, exponent) => Math.sign(v) * Math.abs(v) ** (2 / exponent);
  let x = centre + reach * shape(c, c > 0 ? spec.point : spec.square);
  let z = half * shape(s, spec.square);
  // The back and sides lifted (behind the sight's ends): a smooth rise from about 55° off the front.
  const lift = helmSmoothstep(0.2, 0.5, (1 - c) / 2);
  const flute = spec.fluting;
  const off = Math.abs(Math.atan2(s, c));
  if (flute && off < flute.arc) {
    // A sharp-crested ridge every 2π/count, fading out at the arc's ends.
    const phase = (((angle / (Math.PI * 2)) * flute.count + 0.5) % 1 + 1) % 1;
    const ridge = 1 - 2 * Math.abs(phase - 0.5);
    const fade = 1 - helmSmoothstep(flute.arc * 0.7, flute.arc, off);
    const out = flute.depth * ridge * fade * Math.min(1, half);
    const nx = x - centre;
    const length = Math.hypot(nx, z) || 1;
    x += (nx / length) * out;
    z += (z / length) * out;
  }
  return [x, y + (yBack - y) * lift, z];
}

/** Control sections smoothed (Catmull-Rom, `steps` to a span), unbroken between the creases: one list of sections per piece. */
function helmSmoothedPieces(sections, creases, steps) {
  const cuts = [0, ...creases, sections.length - 1];
  const pieces = [];
  for (let cut = 0; cut < cuts.length - 1; cut += 1) {
    const list = sections.slice(cuts[cut], cuts[cut + 1] + 1).map((section) => (section.length === 5 ? section : [...section, section[0]]));
    const out = [];
    for (let index = 0; index < list.length - 1; index += 1) {
      const [p0, p1, p2, p3] = [list[index - 1] ?? list[index], list[index], list[index + 1], list[index + 2] ?? list[index + 1]];
      for (let step = 0; step < steps; step += 1) {
        const t = step / steps;
        out.push(p1.map((_, k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t)));
      }
    }
    out.push(list.at(-1));
    pieces.push(out);
  }
  return pieces;
}

/**
 * A sheet lofted through `sections` between two angles, in head radii
 * scaled by `r`; `scallop` cuts its first section's edge into scallops
 * (the edge drawn up between the points by up to `depth` head radii).
 */
function helmSheet(sections, from, to, columns, spec, r, scallop = null) {
  const positions = [];
  const indices = [];
  for (const section of sections) {
    for (let column = 0; column <= columns; column += 1) {
      const angle = from + ((to - from) * column) / columns;
      let point = helmShapedPoint(section, angle, spec);
      if (scallop) {
        // The edge's height here; the rows below it gathered up onto it.
        const edge = sections[0][0] + scallop.depth * Math.abs(Math.sin(((angle - from) / (to - from)) * Math.PI * scallop.count));
        if (section[0] < edge) point = helmShapedPoint(helmSectionAt(sections, edge), angle, spec);
      }
      positions.push(...point.map((value) => value * r));
    }
  }
  const row = columns + 1;
  for (let ring = 0; ring < sections.length - 1; ring += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = ring * row + column;
      indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A shell (or part of one, from `from` to `to`) with its creases: split across at the crease sections and, with a keel, down the front middle. */
function helmCreasedShell(group, sections, creases, from, to, spec, r, material, { keel = false, sides, steps, scallop = null, lowDetail = false }) {
  // In a crowd, one mesh to a shell: no split normals.
  const ranges = keel && !lowDetail && from < 0 && to > 0 ? [[from, 0], [0, to]] : [[from, to]];
  for (const [index, piece] of helmSmoothedPieces(sections, lowDetail ? [] : creases, steps).entries()) {
    for (const [start, end] of ranges) {
      const columns = Math.max(2, Math.round((sides * (end - start)) / (Math.PI * 2)));
      group.add(new THREE.Mesh(helmSheet(piece, start, end, columns, spec, r, index === 0 ? scallop : null), material));
    }
  }
}

/** Copies of `geometry`, each placed by a matrix, as one geometry (one draw for all the rivets). */
function helmMergedCopies(geometry, matrices) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute('position');
  const normal = source.getAttribute('normal');
  const positions = new Float32Array(position.count * 3 * matrices.length);
  const normals = new Float32Array(position.count * 3 * matrices.length);
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const turn = new THREE.Matrix3();
  matrices.forEach((matrix, copy) => {
    turn.getNormalMatrix(matrix);
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index).applyMatrix4(matrix);
      direction.fromBufferAttribute(normal, index).applyMatrix3(turn).normalize();
      const at = (copy * position.count + index) * 3;
      positions.set([point.x, point.y, point.z], at);
      normals.set([direction.x, direction.y, direction.z], at);
    }
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return merged;
}

/** A placement on a helm's surface at `angle` of `section`, out along the surface's normal by `lift`, the piece's +z turned to face out. */
function helmPlacement(section, angle, spec, r, lift = 0) {
  const at = new THREE.Vector3(...helmShapedPoint(section, angle, spec));
  const along = new THREE.Vector3(...helmShapedPoint(section, angle + 0.02, spec)).sub(at);
  const up = new THREE.Vector3(...helmShapedPoint([section[0] + 0.05, ...section.slice(1, 4)], angle, spec)).sub(at);
  const out = along.cross(up).normalize();
  if (out.x * Math.cos(angle) + out.z * Math.sin(angle) < 0) out.negate();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
  return new THREE.Matrix4().compose(at.multiplyScalar(r).addScaledVector(out, lift * r), quaternion, new THREE.Vector3(1, 1, 1));
}

/** A rosette washer: a flat eight-petalled flower facing +z. */
function helmRosette(size) {
  const shape = new THREE.Shape();
  const steps = 48;
  for (let step = 0; step <= steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    const radius = size * (0.72 + 0.28 * Math.abs(Math.cos(angle * 4)));
    if (step === 0) shape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    else shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  return new THREE.ExtrudeGeometry(shape, { depth: size * 0.12, bevelEnabled: false });
}

/** The section of `list` at height `y`, interpolated (its first four numbers). */
function helmSectionAt(list, y) {
  const sorted = [...list].sort((a, b) => a[0] - b[0]);
  if (y <= sorted[0][0]) return sorted[0].slice(0, 4);
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const [a, b] = [sorted[index], sorted[index + 1]];
    if (y <= b[0]) return a.slice(0, 4).map((value, k) => value + (b[k] - value) * ((y - a[0]) / (b[0] - a[0])));
  }
  return sorted.at(-1).slice(0, 4);
}

/**
 * A stechhelm drawn to its profile (STECHHELM_STYLES): the bevor and the
 * crown as creased lofted shells with the sight a real gap between their
 * lips, the chest and nape plates flaring down onto the breast and back,
 * the flutes or the medial ridge, the rolled or roped lips, the rivets and
 * rosettes, the bolt holes; the plume always, the mantling in full detail.
 */
function buildShapedStechhelm(group, head, r, steel, spec, { lowDetail = false } = {}) {
  const iron = steel.clone();
  iron.color = new THREE.Color(head.color ?? '#c2c7ce');
  iron.side = THREE.DoubleSide;
  const brass = steel.clone();
  brass.color = new THREE.Color(spec.rivets.brass ? head.gold ?? '#c9a23a' : head.color ?? '#c2c7ce');
  const dark = surface(0x050506);
  dark.side = THREE.DoubleSide;
  const sides = lowDetail ? 20 : spec.sides;
  const steps = lowDetail ? 1 : spec.smooth;
  const shape = lowDetail ? { ...spec, fluting: null } : spec;
  const scallop = lowDetail ? null : spec.scallops;
  helmCreasedShell(group, spec.lower, spec.lowerCreases, -Math.PI, Math.PI, shape, r, iron, { keel: spec.keel, sides, steps, lowDetail });
  helmCreasedShell(group, spec.crown, spec.crownCreases, -Math.PI, Math.PI, shape, r, iron, { keel: spec.keel || spec.crownKeel, sides, steps, lowDetail });
  // The plates over the breast and back, open at the sides; listed top down, lofted bottom up.
  const chestUp = [...spec.chest].reverse();
  helmCreasedShell(group, chestUp, spec.chestCreases.map((index) => spec.chest.length - 1 - index), -Math.PI / 2, Math.PI / 2, shape, r, iron, { keel: spec.keel, sides, steps, scallop, lowDetail });
  const napeUp = [...spec.nape].reverse();
  helmCreasedShell(group, napeUp, [], Math.PI / 2, Math.PI * 1.5, shape, r, iron, { sides, steps });
  // The sight: dark behind the gap between the lips, across the front.
  const lowerLip = spec.lower.at(-1);
  const upperLip = spec.crown[0];
  const inside = [[lowerLip[0] - 0.08, -0.9, lowerLip[2] - 0.3, lowerLip[3] - 0.12], [upperLip[0] + 0.08, -0.9, lowerLip[2] - 0.22, lowerLip[3] - 0.1]];
  const sight = new THREE.Mesh(helmSheet(inside, -1.2, 1.2, lowDetail ? 6 : 14, { ...spec, fluting: null }, r), dark);
  sight.userData.noOutline = true;
  group.add(sight);
  group.add(buildOstrichPlume(r, head.plume ?? '#f2efe6', steel, spec.plume));
  if (lowDetail) return;
  const crownSmooth = helmSmoothedPieces(spec.crown, [], 4)[0];
  // The flutes: raised ridges along the crown from above the sight back over the top.
  for (const z of spec.flutes ?? []) {
    const path = [];
    for (const section of crownSmooth.slice(2, -3)) {
      if (Math.abs(z) > section[3] * 0.92) break;
      // The angle that puts the point at this z (the outline is a superellipse, not a circle).
      let angle = Math.asin(z / section[3]);
      for (let tries = 0; tries < 12; tries += 1) angle += (z - helmShapedPoint(section, angle, spec)[2]) / (section[3] * 1.5);
      const [x, y, zz] = helmShapedPoint(section, angle, spec);
      path.push(new THREE.Vector3(x * r, y * r + 0.012 * r, zz * r));
    }
    if (path.length > 2) group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 24, spec.fluteSize * r, 5, false), iron));
  }
  if (spec.ridge) {
    // The medial ridge: from the upper lip's point up the front, over the top and down the back of the crown.
    const path = [];
    for (const section of crownSmooth.slice(1, -1)) path.push(new THREE.Vector3(...helmShapedPoint(section, 0, spec)).multiplyScalar(r));
    for (const section of crownSmooth.slice(-6, -1).reverse()) path.push(new THREE.Vector3(...helmShapedPoint(section, Math.PI, spec)).multiplyScalar(r));
    const ridge = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 40, spec.ridge * r, 6, false), iron);
    ridge.scale.set(1, 1, 0.55);
    group.add(ridge);
  }
  // The lips of the sight: a rolled edge (a plain bead) or a roped one (a twisted cord of beads).
  const lipCurve = (section, lift) => {
    const points = [];
    for (let step = 0; step <= 20; step += 1) points.push(new THREE.Vector3(...helmShapedPoint(section, -1.25 + (2.5 * step) / 20, spec)).multiplyScalar(r).add(new THREE.Vector3(0, lift * r, 0)));
    return new THREE.CatmullRomCurve3(points);
  };
  for (const [section, lift] of [[lowerLip, -0.02], [upperLip, 0.02]]) {
    const curve = lipCurve(section, lift);
    if (spec.edge === 'roped') {
      const bead = new THREE.SphereGeometry(0.05 * r, 6, 4);
      const matrices = [];
      for (let index = 0; index <= 34; index += 1) {
        const u = index / 34;
        const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.7);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangent(u)).multiply(tilt);
        matrices.push(new THREE.Matrix4().compose(curve.getPoint(u), quaternion, new THREE.Vector3(0.75, 1.7, 0.75)));
      }
      group.add(new THREE.Mesh(helmMergedCopies(bead, matrices), brass));
    } else {
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, (spec.edge === 'rolled' ? 0.04 : 0.03) * r, 6, false), iron));
    }
  }
  // Rivets: domed heads along the beak under the sight, in pairs down the back, down the bevor's sides (rosette washers under some).
  const { lips, rows, size, rosettes } = spec.rivets;
  const dome = new THREE.SphereGeometry(size * r, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.rotateX(Math.PI / 2);
  const heads = [];
  const washers = [];
  const underLip = [lowerLip[0] - 0.13, ...lowerLip.slice(1, 4)];
  for (let index = 0; index < lips; index += 1) {
    const angle = -1.05 + (2.1 * index) / (lips - 1);
    heads.push(helmPlacement(underLip, angle, spec, r));
    if (rosettes && index % 2 === 0) washers.push(helmPlacement(underLip, angle, spec, r));
  }
  const lowerSmooth = helmSmoothedPieces(spec.lower, [], 4)[0];
  const napeSmooth = helmSmoothedPieces(napeUp, [], 4)[0];
  for (let index = 0; index < rows; index += 1) {
    const y = 1.2 - (index * 3.25) / (rows - 1);
    const section = helmSectionAt(y > 0.6 ? crownSmooth : y > spec.lower[0][0] ? lowerSmooth : napeSmooth, y);
    for (const angle of [Math.PI - 0.32, Math.PI + 0.32]) {
      heads.push(helmPlacement(section, angle, spec, r));
      if (rosettes) washers.push(helmPlacement(section, angle, spec, r));
    }
    if (y < 0.2 && y > spec.lower[0][0]) for (const angle of [1.35, -1.35]) heads.push(helmPlacement(section, angle, spec, r));
  }
  group.add(new THREE.Mesh(helmMergedCopies(dome, heads), brass));
  if (washers.length) group.add(new THREE.Mesh(helmMergedCopies(helmRosette(size * 1.9 * r), washers), brass));
  // The bolt holes in the chest and nape plates, and the bolt holding the chest plate down.
  const chestSmooth = helmSmoothedPieces(chestUp, [], 4)[0];
  const chestBottom = spec.chest.at(-1)[0];
  const holes = [];
  for (let index = 0; index < spec.holes; index += 1) {
    const angle = spec.holes === 1 ? 0 : -0.55 + (1.1 * index) / (spec.holes - 1);
    holes.push(helmPlacement(helmSectionAt(chestSmooth, chestBottom + 0.42), angle, spec, r, 0.02));
    holes.push(helmPlacement(helmSectionAt(napeSmooth, spec.nape.at(-1)[0] + 0.3), Math.PI + angle * 0.8, spec, r, 0.02));
  }
  const holeMesh = new THREE.Mesh(helmMergedCopies(new THREE.CircleGeometry(0.055 * r, 8), holes), dark);
  holeMesh.userData.noOutline = true;
  group.add(holeMesh);
  if (spec.bolt) {
    const bolt = new THREE.CylinderGeometry(0.1 * r, 0.1 * r, 0.1 * r, 6);
    bolt.rotateX(Math.PI / 2);
    group.add(new THREE.Mesh(helmMergedCopies(bolt, [helmPlacement(helmSectionAt(chestSmooth, chestBottom + 0.75), 0.0001, spec, r, 0.05)]), brass));
  }
  if (head.mantling) group.add(buildMantling(r, head.mantling, spec));
}
