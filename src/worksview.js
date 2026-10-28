// The fieldworks drawn (physics/fieldworks.js is what they are): the archers' stakes, a palisade of
// posts and rails, the edge of a wood, a ditch and its bank, mud and a stream's bed. Built from the
// arena's `works` (the same data the physics compiled), once per arena, into a group of its own over
// whatever place the battle is fought in; a stake the battle broke is laid over (updateWorksView).
// The ground stays at y = 0 where nothing is dug: a man sunk in the mud or wading the stream stands on
// the firm ground below it, and the mud's surface hides his legs as it should. A ditch is drawn as the
// ground of its own strip (its profile across, the bank above the field); the place it is fought in
// leaves that strip open (render.js buildCerignola).

/* global THREE */
import { reliefAt, worksOf } from './physics/fieldworks.js';
import { kwtCreate } from './levelmode/kitwater.js';
import { BATTLE_WATER, worksWaters } from './levelmode/water.js';

export const WORKS_VIEW = {
  // A stake's shaft and its buried length (m), as fieldworks.js FIELDWORKS.stake's radius.
  stake: { radius: 0.04, buried: 0.4, bark: 0x6a5238, cut: 0xc8b48a },
  // A palisade: a post every `post` m (`radius`, `sunk` below ground), two rails lashed across them (`rails`, heights as shares of the wall's).
  palisade: { post: 1.15, radius: 0.07, rails: [0.45, 0.85], rail: 0.045, wood: 0x6e5a40, lashing: 0xb8a070 },
  // A wood's edge: trees in `rows` behind the line (outward, `depth` m between rows), one every `every` m along it, `scatter` m
  // off their places; trunk and crown sizes; undergrowth bushes along the line itself.
  wood: { rows: 3, depth: 2.2, every: 2.4, scatter: 0.9, trunk: [0.16, 0.26], height: [6, 10], crown: [2.2, 3.4], bark: 0x3e3226, leaves: [0x5a5a2a, 0x6a5a26, 0x4a5228, 0x7a5a24], bush: 0x4a4a26 },
  // Mud: wet plough-clay, puddles standing in the furrows; a stream's water over its silt.
  mud: { colour: [104, 82, 56], wet: [78, 60, 40], puddle: [128, 118, 100] },
  water: { colour: 0x5a6a62, opacity: 0.72, bank: 0x4a3c2c },
  // The film of water standing on mud (a soft place's `water`, m): its surface lies this far over the painted mud's, drawn as the castle's standing water is
  // (levelmode/kitwater.js, its 'mud' look): it rings round every foot and hoof that moves in it and trails a wake, and the splashes are brown.
  // Its rings are made only within `range` m of the camera (seventy men's would be a blur of them, and from a long way off a ring is a pixel); drops are clay-coloured.
  film: { mud: 0.008, range: 30, drops: 0x7a6a4e },
  // The quality the battle's water is drawn at (levelmode/quality.js's keys): no reflection of the scene, the rings at most the pool holds, every drop.
  waterQuality: { waterReflect: 0, ripples: BATTLE_WATER.ripples, waterDrops: 1 },
  // A ditch strip's ground: cells across and along it (m).
  ditch: { across: 0.2, along: 0.6, earth: 0x6a5238, cut: 0x4a3a28, grass: 0x6a7040 },
};

/** A seeded generator (mulberry32), so a battle's woods and mud are drawn the same each time. */
function worksRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const worksLit = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...options });

/** Put the works of `arena` in the view (null: none), building them the first time. */
export function showWorks(view, arena) {
  const spec = arena?.works ?? null;
  if (view.worksSpec === spec) return;
  if (view.works) {
    view.scene.remove(view.works.group);
    view.works.group.traverse((object) => {
      object.geometry?.dispose?.();
      for (const material of [].concat(object.material ?? [])) {
        material.map?.dispose?.();
        material.dispose?.();
      }
    });
  }
  view.works = null;
  view.worksSpec = spec;
  if (!spec) return;
  const works = worksOf(arena);
  const group = new THREE.Group();
  group.name = 'fieldworks';
  const random = worksRandom(works.stakes.length * 7919 + works.walls.length * 104729 + Math.round(arena.halfX * 31));
  for (const area of works.soft) group.add(worksSoftGround(area, random));
  const water = worksStandingWater(view, works, group);
  for (const ditch of works.ditches) group.add(worksDitchStrip(works, ditch));
  const stakes = worksStakeMeshes(works.stakes);
  group.add(stakes.group);
  for (const wall of works.walls) group.add(wall.kind === 'wood' ? worksWoodEdge(wall, random, arena) : worksPalisade(wall));
  view.scene.add(group);
  view.works = { group, stakes, broken: 0, water, waterAt: -Infinity };
}

/** Each frame: the water rung by the men and horses wading in it, and the stakes the battle has broken lie over. */
export function updateWorksView(view, world) {
  const water = view.works?.water;
  if (water && world) {
    // (A battle begun again, its clock back at nought: the rings of the one before are forgotten.)
    if (world.time < view.works.waterAt) {
      water.pool.list.length = 0;
      water.drops.length = 0;
    }
    water.update(world, world.time, Math.max(0, world.time - view.works.waterAt), new Map(), WORKS_VIEW.waterQuality);
    view.works.waterAt = world.time;
  }
  const broken = world?.worksState?.broken;
  if (!view.works || !broken || broken.size === view.works.broken) return;
  view.works.broken = broken.size;
  const { mesh, stakes } = view.works.stakes;
  const matrix = new THREE.Matrix4();
  stakes.forEach((stake, index) => {
    worksStakeMatrix(stake, broken.has(stake.id), matrix);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

// ---- Standing water ----

/**
 * The water standing on the works' soft places that have `water` over them (Agincourt's field after the night's rain): one sheet over each, a few cm over the
 * painted mud (its furrows seen through it), in kitwater.js's hands: the surface that rings and trails wakes where men and horses wade, the sky in it (the steel's
 * environment: a battlefield's one reflection, taken once), the splashes. Returns its controller (`update` each frame: updateWorksView), or null when nothing is wet.
 * The physics is the soft ground's own (fieldworks.js: the water is over the feet as the mud is, and as the cesspool's is over a man's in the castle).
 */
function worksStandingWater(view, works, group) {
  const spec = WORKS_VIEW.film;
  const decor = worksWaters(works, spec.mud);
  if (!decor.length) return null;
  const camera = new THREE.Vector3();
  const water = kwtCreate({ sections: [{ id: 'field', decor }] }, {
    ripples: BATTLE_WATER.ripples, config: BATTLE_WATER, horses: true, range: spec.range, drops: spec.drops,
    near: () => view.camera?.getWorldPosition(camera).toArray() ?? null,
  });
  const holder = new THREE.Group();
  holder.name = 'standing-water';
  water.addSection('field', water.waters, holder);
  holder.traverse((object) => {
    if (!object.material) return;
    // The grey sky lies in it (the one reflection of the battlefield, taken in render.js for the steel and the wet ground); no cube map of the scene is taken here.
    object.material.envMap = view.steelEnv ?? null;
    object.material.needsUpdate = true;
  });
  group.add(holder, water.group);
  return water;
}

// ---- Stakes ----

const WORKS_UP = new THREE.Vector3(0, 1, 0);

/** A stake's place: from below its foot (buried) to its point; broken, lying flat along the ground toward its point. */
function worksStakeMatrix(stake, broken, matrix) {
  const spec = WORKS_VIEW.stake;
  const foot = new THREE.Vector3(stake.foot[0], 0, stake.foot[1]);
  const tip = broken ? new THREE.Vector3(stake.tip[0] + (stake.tip[0] - stake.foot[0]) * 0.4, spec.radius, stake.tip[2]) : new THREE.Vector3(...stake.tip);
  const axis = tip.clone().sub(foot);
  const length = axis.length();
  axis.normalize();
  const start = broken ? foot.clone().setY(spec.radius) : foot.clone().addScaledVector(axis, -spec.buried / Math.max(0.3, axis.y));
  const total = start.distanceTo(tip);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(WORKS_UP, axis);
  matrix.compose(start.clone().addScaledVector(axis, total / 2), quaternion, new THREE.Vector3(1, total, 1));
  void length;
  return matrix;
}

function worksStakeMeshes(stakes) {
  const spec = WORKS_VIEW.stake;
  const group = new THREE.Group();
  if (!stakes.length) return { group, mesh: null, stakes };
  // A unit shaft, one long, its last tenth sharpened to the point (the pale cut wood).
  const shaft = new THREE.CylinderGeometry(spec.radius * 0.9, spec.radius, 0.9, 6);
  shaft.translate(0, -0.05, 0);
  const point = new THREE.ConeGeometry(spec.radius * 0.9, 0.1, 6);
  point.translate(0, 0.45, 0);
  const colours = [];
  const merged = worksMerge([[shaft, spec.bark], [point, spec.cut]], colours);
  const mesh = new THREE.InstancedMesh(merged, worksLit(0xffffff, { vertexColors: true }), stakes.length);
  const matrix = new THREE.Matrix4();
  stakes.forEach((stake, index) => mesh.setMatrixAt(index, worksStakeMatrix(stake, false, matrix)));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return { group, mesh, stakes };
}

/** Geometries joined into one, each painted its colour per vertex. */
function worksMerge(parts) {
  const positions = [];
  const normals = [];
  const colours = [];
  const indices = [];
  let offset = 0;
  const colour = new THREE.Color();
  for (const [geometry, hex] of parts) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = flat.attributes.position;
    flat.computeVertexNormals();
    colour.set(hex);
    for (let i = 0; i < position.count; i += 1) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      normals.push(flat.attributes.normal.getX(i), flat.attributes.normal.getY(i), flat.attributes.normal.getZ(i));
      colours.push(colour.r, colour.g, colour.b);
      indices.push(offset + i);
    }
    offset += position.count;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  return geometry;
}

// ---- Walls: a palisade, a wood's edge ----

/** A palisade stretch: posts and two lashed rails. */
function worksPalisade(wall) {
  const spec = WORKS_VIEW.palisade;
  const group = new THREE.Group();
  const count = Math.max(2, Math.round(wall.length / spec.post) + 1);
  const post = new THREE.CylinderGeometry(spec.radius * 0.85, spec.radius, wall.height + 0.12, 7);
  const posts = new THREE.InstancedMesh(post, worksLit(spec.wood), count);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  for (let k = 0; k < count; k += 1) {
    const t = (k / (count - 1)) * wall.length;
    // Posts cut to a point and leaning a little, as they were driven.
    quaternion.setFromEuler(new THREE.Euler(((k * 37) % 7 - 3) * 0.012, 0, ((k * 53) % 5 - 2) * 0.015));
    matrix.compose(new THREE.Vector3(wall.a[0] + wall.u[0] * t, (wall.height + 0.12) / 2 - 0.06, wall.a[1] + wall.u[1] * t), quaternion, new THREE.Vector3(1, 1, 1));
    posts.setMatrixAt(k, matrix);
  }
  posts.castShadow = true;
  posts.receiveShadow = true;
  group.add(posts);
  const angle = Math.atan2(wall.u[0], wall.u[1]);
  for (const share of spec.rails) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(spec.rail, spec.rail, wall.length + 0.3, 6), worksLit(spec.wood));
    rail.rotation.x = Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(rail);
    holder.rotation.y = angle;
    holder.position.set(wall.a[0] + wall.u[0] * wall.length / 2, wall.height * share, wall.a[1] + wall.u[1] * wall.length / 2);
    rail.castShadow = true;
    group.add(holder);
  }
  return group;
}

/** A wood's edge: undergrowth along the line, trees in rows behind it, away from the field (`arena` middle). */
function worksWoodEdge(wall, random, arena) {
  const spec = WORKS_VIEW.wood;
  const group = new THREE.Group();
  // Outward: the side of the line away from the middle of the field.
  const mid = [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2];
  let out = [-wall.u[1], wall.u[0]];
  if (out[0] * -mid[0] + out[1] * -mid[1] > 0) out = [-out[0], -out[1]];
  const trees = [];
  for (let row = 0; row < spec.rows; row += 1) {
    for (let t = random() * spec.every; t < wall.length; t += spec.every * (0.8 + random() * 0.4)) {
      const back = 0.6 + row * spec.depth + random() * spec.scatter;
      trees.push([wall.a[0] + wall.u[0] * t + out[0] * back + (random() - 0.5) * spec.scatter, wall.a[1] + wall.u[1] * t + out[1] * back]);
    }
  }
  const trunk = new THREE.CylinderGeometry(0.7, 1, 1, 6);
  trunk.translate(0, 0.5, 0);
  const crown = new THREE.IcosahedronGeometry(1, 1);
  const trunks = new THREE.InstancedMesh(trunk, worksLit(spec.bark), trees.length);
  const crowns = new THREE.InstancedMesh(crown, worksLit(0xffffff, { flatShading: true }), trees.length * 2);
  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();
  trees.forEach(([x, z], index) => {
    const height = spec.height[0] + random() * (spec.height[1] - spec.height[0]);
    const thick = spec.trunk[0] + random() * (spec.trunk[1] - spec.trunk[0]);
    matrix.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(thick, height * 0.75, thick));
    trunks.setMatrixAt(index, matrix);
    for (let k = 0; k < 2; k += 1) {
      const size = spec.crown[0] + random() * (spec.crown[1] - spec.crown[0]);
      matrix.compose(new THREE.Vector3(x + (random() - 0.5), height * (0.7 + k * 0.18), z + (random() - 0.5)), new THREE.Quaternion().setFromEuler(new THREE.Euler(random(), random(), random())), new THREE.Vector3(size, size * 0.85, size));
      crowns.setMatrixAt(index * 2 + k, matrix);
      // Autumn: the leaves turning, olive to brown.
      crowns.setColorAt(index * 2 + k, colour.set(spec.leaves[Math.floor(random() * spec.leaves.length)]));
    }
  });
  trunks.castShadow = crowns.castShadow = true;
  crowns.receiveShadow = true;
  group.add(trunks, crowns);
  // Undergrowth: bushes along the line itself (brambles and hazel: what stops a horse).
  const bush = new THREE.IcosahedronGeometry(1, 0);
  const count = Math.ceil(wall.length / 0.9);
  const bushes = new THREE.InstancedMesh(bush, worksLit(spec.bush, { flatShading: true }), count);
  for (let k = 0; k < count; k += 1) {
    const t = k * 0.9 + random() * 0.4;
    const back = 0.3 + random() * 0.9;
    const size = 0.6 + random() * 0.7;
    matrix.compose(new THREE.Vector3(wall.a[0] + wall.u[0] * t + out[0] * back, size * 0.45, wall.a[1] + wall.u[1] * t + out[1] * back), new THREE.Quaternion(), new THREE.Vector3(size, size * 0.8, size));
    bushes.setMatrixAt(k, matrix);
  }
  bushes.castShadow = true;
  group.add(bushes);
  void arena;
  return group;
}

// ---- The ground: soft places and ditches ----

/** A soft place: mud (painted wet clay, the furrows and puddles) or a stream (water over a muddy bed between low banks). */
function worksSoftGround(area, random) {
  const width = area.x[1] - area.x[0];
  const depth = area.z[1] - area.z[0];
  const group = new THREE.Group();
  const centre = [(area.x[0] + area.x[1]) / 2, (area.z[0] + area.z[1]) / 2];
  if (area.surface === 'water') {
    const spec = WORKS_VIEW.water;
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(width + 1.2, depth), worksLit(spec.bank, { roughness: 0.6 }));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(centre[0], 0.006, centre[1]);
    bed.receiveShadow = true;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.4, depth), worksLit(spec.colour, { roughness: 0.15, metalness: 0.1, transparent: true, opacity: spec.opacity }));
    water.material.userData.reflects = 0.6;
    water.rotation.x = -Math.PI / 2;
    water.position.set(centre[0], 0.02, centre[1]);
    water.receiveShadow = true;
    group.add(bed, water);
    return group;
  }
  const spec = WORKS_VIEW.mud;
  const pixels = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = pixels;
  const g = canvas.getContext('2d');
  g.fillStyle = `rgb(${spec.colour.join(',')})`;
  g.fillRect(0, 0, pixels, pixels);
  // Furrows across the field (the plough ran along it), churned, and the wet in them.
  for (let row = 0; row < 90; row += 1) {
    const y = (row / 90) * pixels;
    g.fillStyle = `rgba(${spec.wet.join(',')},${0.35 + random() * 0.3})`;
    g.fillRect(0, y, pixels, 3 + random() * 3);
  }
  for (let k = 0; k < 9000; k += 1) {
    const shade = random();
    g.fillStyle = `rgba(${40 + shade * 60},${32 + shade * 44},${22 + shade * 30},${0.2 + random() * 0.3})`;
    g.fillRect(random() * pixels, random() * pixels, 2 + random() * 6, 1 + random() * 3);
  }
  for (let k = 0; k < 30; k += 1) {
    g.fillStyle = `rgba(${spec.puddle.join(',')},${0.15 + random() * 0.2})`;
    g.beginPath();
    g.ellipse(random() * pixels, random() * pixels, 6 + random() * 30, 3 + random() * 9, 0, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(width / 12, depth / 12);
  const mud = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), worksLit(0xffffff, { map: texture, roughness: 0.75 }));
  mud.material.userData.reflects = 0.08;
  mud.rotation.x = -Math.PI / 2;
  mud.position.set(centre[0], 0.008, centre[1]);
  mud.receiveShadow = true;
  group.add(mud);
  return group;
}

/** A ditch's strip of ground: its profile across, along its whole length, the cut faces darker, the bank's top grassed. */
function worksDitchStrip(works, ditch) {
  const spec = WORKS_VIEW.ditch;
  const from = ditch.profile[0][0];
  const to = ditch.profile[ditch.profile.length - 1][0];
  const across = Math.max(2, Math.ceil((to - from) / spec.across));
  const along = Math.max(2, Math.ceil(ditch.length / spec.along));
  const positions = [];
  const colours = [];
  const colour = new THREE.Color();
  for (let j = 0; j <= along; j += 1) {
    for (let i = 0; i <= across; i += 1) {
      const offset = from + ((to - from) * i) / across;
      const t = (ditch.length * j) / along;
      const x = ditch.from[0] + ditch.u[0] * t + ditch.left[0] * offset;
      const z = ditch.from[1] + ditch.u[1] * t + ditch.left[1] * offset;
      const y = reliefAt(works, x, z);
      positions.push(x, y + 0.004, z);
      colour.set(y > 0.45 ? spec.grass : y < -0.3 ? spec.cut : spec.earth);
      colours.push(colour.r, colour.g, colour.b);
    }
  }
  const indices = [];
  for (let j = 0; j < along; j += 1) {
    for (let i = 0; i < across; i += 1) {
      const a = j * (across + 1) + i;
      const b = a + 1;
      const c = a + across + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, worksLit(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}
