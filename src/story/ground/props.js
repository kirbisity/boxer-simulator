// Story mode's set pieces drawn (src/story/scenes/sets.js says where they stand): the plain things a scene is set among, a
// drill ground's flagpole, a lantern on its post, a house front with its doorway, heads laid out in rows to be counted, a
// sorghum rack, a cart, a camp's gate, a sorghum-stalk fence plastered with mud, a company flag down, a fire, a few pages, a
// line of footprints, trees at a wood's edge, a patch of ground or snow. Drawn only: nothing here is in the physics (a set's
// figures are placed and held by the scene, not walked into these). Built into the fieldworks' group (worksview.js showWorks)
// from the arena's `works.props`; the lanterns and fires flicker (storyPropsTick, each frame).

/* global THREE */

export const STORY_PROPS = {
  // A drill ground's flagpole: a pine pole (`radius` m) in a socket of stones; its flag (`flag`: [wide, high] m) near the top;
  // a head hung from the top on a short cord (a head ~0.2 m across; the skin darkened, the hair in a knot).
  pole: { radius: 0.075, wood: 0x6a5a44, stones: 0x7c776c, flag: [1.1, 0.8], head: 0.105, skin: 0x5e4a3c, hair: 0x15110e, cord: 0.45 },
  // A paper lantern (`size`: radius, height m) on a post with an arm, or set on the ground; its light (THREE r128 PointLight:
  // intensity as given, `range` m, falling off as the square), the warm of a candle through oiled paper.
  lantern: { size: [0.14, 0.32], small: [0.09, 0.2], post: 0.05, arm: 0.45, paper: 0xffb35a, glow: 0.55, frame: 0x2a2018, light: 0xffad60, range: 10, flicker: 0.12 },
  // A house of the poor: rammed earth or mud brick, plastered, `depth` m deep; the doorway 1.9 m high; a roof of grey tiles
  // over it with a short overhang; the room inside dark, or lit by a lamp (`lit`).
  house: { depth: 4.2, wall: 0xa08868, base: 0x6e5c46, roof: 0x4a4a4c, overhang: 0.5, doorHigh: 1.9, inside: 0x0e0b09, glow: 0xd08a44, wood: 0x4a3828 },
  // Heads in rows on the ground: ~0.2 m across, the faces gone grey, hair knotted or shaved (a Japanese head's pate).
  heads: { radius: 0.1, skin: [0x6e5a48, 0x5e4c3e, 0x7a6450], hair: 0x111010 },
  // A drying rack: two posts and a pole at 1.7 m, sorghum heads hung in bundles every `every` m.
  rack: { high: 1.7, post: 0.05, every: 0.32, sorghum: 0x8a3a24, stalk: 0xb09a6a },
  // A two-wheeled cart: the wheels 1.1 m across, the bed 2 m by 1.1 m.
  cart: { wheel: 0.55, bed: [2, 0.12, 1.1], wood: 0x6a5238 },
  // A camp's gate: two posts 3-4 m high, a beam across, the palisade off to each side `wing` m.
  gate: { post: 0.13, wing: 6, wood: 0x5e4c38 },
  // The sorghum-stalk fence plastered with mud (the Hun River camp's): stalks every `every` m, the mud over its outer face.
  fence: { every: 0.07, stalk: 0xa8925e, mud: 0x6a5a46, fire: 0xff6a24, range: 9 },
  // A company flag down: its pole (m long) on the ground, the cloth lying by it.
  flag: { pole: 3.4, cloth: [1.2, 0.9] },
  // A fire: its stones, logs, flames (or the ash of one gone out), its light.
  fire: { stones: 9, ring: 0.42, flame: [0.22, 0.55], colour: 0xff8a3a, light: 0xff9a50, range: 8, flicker: 0.25, ash: 0x3a3632 },
  // Pages laid out (a book aired in the sun; a letter), each 0.2 by 0.28 m.
  pages: { size: [0.2, 0.28], paper: 0xe8e0c8 },
  // A waist tag (腰牌): a wooden plaque 7 by 11 cm, a cord through its top; the characters on it too small to read at this distance.
  tag: { size: [0.07, 0.11, 0.012], wood: 0xb08a5a, ink: 0x2a2018, cord: 0x6a2a20 },
  // Footprints in snow: a pace every `pace` m, the feet `apart` m, each a dent `size` m.
  tracks: { pace: 0.36, apart: 0.12, size: [0.13, 0.28], colour: 0xaab4bf },
  // Trees at a wood's edge: larch and pine, a trunk and a dark crown, dusted with snow.
  trees: { trunk: 0x3e3228, crown: 0x36402e, snow: 0xe8ecef, height: [7, 11] },
  // A patch of ground (packed earth, mud, a yard) over the place's own floor, its edge feathered into it.
  ground: { feather: 0.35 },
};

const propLit = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...options });

/** A seeded generator (mulberry32): a set's pieces drawn the same each time. */
function propRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A disc's alpha: opaque in the middle, feathered over its outer `feather` share. */
function propFeather(feather) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, '#fff');
  gradient.addColorStop(1 - feather, '#fff');
  gradient.addColorStop(1, '#000');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** A patch over the floor: ground (`colour`, `wet`) or snow (`cover`: how much of it is white). */
function propPatch(prop, { snow = false } = {}) {
  // (Snow a little warm and lit of itself: lit only by the sky's blue it reads as ice.)
  const material = propLit(snow ? 0xe6e0d6 : new THREE.Color(prop.colour ?? '#7a6a52').getHex(), {
    ...(snow ? { emissive: 0x77736c } : {}),
    roughness: prop.wet ? 0.55 : snow ? 0.8 : 0.95, transparent: true, opacity: snow ? prop.cover ?? 1 : 1, alphaMap: propFeather(STORY_PROPS.ground.feather),
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: snow ? -2 : -1, polygonOffsetUnits: snow ? -2 : -1,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(prop.radius ?? 10, 48), material);
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(prop.at[0], snow ? 0.012 : 0.008, prop.at[1]);
  disc.receiveShadow = true;
  disc.renderOrder = snow ? 2 : 1;
  return disc;
}

/** A flagpole: in its stones, a flag near the top, or a head hung from it. */
function propPole(prop) {
  const spec = STORY_PROPS.pole;
  const group = new THREE.Group();
  const height = prop.height ?? 8;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(spec.radius * 0.7, spec.radius, height, 8), propLit(spec.wood));
  pole.position.y = height / 2;
  pole.castShadow = true;
  group.add(pole);
  const random = propRandom(Math.round(height * 100));
  for (let k = 0; k < 7; k += 1) {
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + random() * 0.06), propLit(spec.stones));
    const angle = (k / 7) * Math.PI * 2;
    stone.position.set(Math.cos(angle) * 0.22, 0.06, Math.sin(angle) * 0.22);
    group.add(stone);
  }
  if (prop.flag) {
    const [wide, high] = spec.flag;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(wide, high, 6, 3), propLit(new THREE.Color(prop.flag).getHex(), { side: THREE.DoubleSide }));
    // Hanging in a light wind: a little ripple along it.
    const positions = cloth.geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) positions.setZ(index, Math.sin((positions.getX(index) + wide / 2) * 4) * 0.05);
    cloth.geometry.computeVertexNormals();
    cloth.position.set(wide / 2 + spec.radius, height - high / 2 - 0.25, 0);
    group.add(cloth);
  }
  if (prop.head) {
    const top = height - 0.05;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, spec.cord, 4), propLit(0x2a2620));
    cord.position.set(0, top - spec.cord / 2, spec.radius + 0.02);
    const head = new THREE.Mesh(new THREE.SphereGeometry(spec.head, 12, 10), propLit(spec.skin));
    head.scale.set(0.9, 1.15, 0.95);
    head.position.set(0, top - spec.cord - spec.head, spec.radius + 0.04);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(spec.head * 1.04, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), propLit(spec.hair));
    hair.position.copy(head.position);
    hair.scale.copy(head.scale);
    group.add(cord, head, hair);
  }
  return group;
}

/** A lantern: on its post with an arm out, or on the ground; its light. */
function propLantern(prop, lights) {
  const spec = STORY_PROPS.lantern;
  const group = new THREE.Group();
  const height = prop.height ?? 2;
  // (One set on the ground is a small one, a hand lantern.)
  const [radius, high] = prop.standing ? spec.small : spec.size;
  const at = prop.standing ? [0, height, 0] : [spec.arm, height - 0.25, 0];
  if (!prop.standing) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(spec.post, spec.post, height, 6), propLit(0x4a3a2a));
    post.position.y = height / 2;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(spec.post * 0.6, spec.post * 0.6, spec.arm, 5), propLit(0x4a3a2a));
    arm.rotation.z = Math.PI / 2;
    arm.position.set(spec.arm / 2, height - 0.04, 0);
    group.add(post, arm);
  }
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.85, radius, high, 10), new THREE.MeshStandardMaterial({ color: spec.paper, emissive: spec.paper, emissiveIntensity: spec.glow, roughness: 1 }));
  paper.position.set(at[0], prop.standing ? high / 2 + 0.02 : at[1] - high / 2, at[2]);
  group.add(paper);
  // Its wooden top and base.
  for (const end of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.9, radius * 0.9, 0.025, 10), propLit(spec.frame));
    rim.position.set(paper.position.x, paper.position.y + (end * high) / 2, paper.position.z);
    group.add(rim);
  }
  const light = new THREE.PointLight(spec.light, prop.light ?? 1, spec.range, 2);
  light.position.copy(paper.position);
  light.userData.storyFlicker = { base: prop.light ?? 1, by: spec.flicker, seed: prop.at[0] * 7 + prop.at[1] * 13 };
  group.add(light);
  lights.push(light);
  return group;
}

/** A house front: walls of plastered earth, the doorway (dark inside, or lit), a tiled roof. Its front faces -z, its door at x = 0. */
function propHouse(prop, lights) {
  const spec = STORY_PROPS.house;
  const group = new THREE.Group();
  const width = prop.width ?? 6;
  const height = prop.height ?? 2.6;
  const door = prop.door ?? 1.1;
  const thick = 0.3;
  const wall = propLit(spec.wall);
  const side = (width - door) / 2;
  for (const sign of [-1, 1]) {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(side, height, thick), wall);
    piece.position.set(sign * (door / 2 + side / 2), height / 2, thick / 2);
    piece.castShadow = piece.receiveShadow = true;
    const end = new THREE.Mesh(new THREE.BoxGeometry(thick, height, spec.depth), wall);
    end.position.set(sign * (width / 2 - thick / 2), height / 2, spec.depth / 2);
    group.add(piece, end);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(door + 0.2, height - spec.doorHigh, thick), wall);
  lintel.position.set(0, spec.doorHigh + (height - spec.doorHigh) / 2, thick / 2);
  const back = new THREE.Mesh(new THREE.BoxGeometry(width, height, thick), wall);
  back.position.set(0, height / 2, spec.depth - thick / 2);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(door + 0.3, 0.1, thick + 0.04), propLit(spec.wood));
  beam.position.set(0, spec.doorHigh + 0.05, thick / 2);
  group.add(lintel, back, beam);
  // The plinth of stone or fired brick along its foot either side of the door, darker with damp; a stone sill across the door.
  for (const sign of [-1, 1]) {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(side + 0.04, 0.35, thick + 0.04), propLit(spec.base));
    plinth.position.set(sign * (door / 2 + side / 2), 0.17, thick / 2);
    group.add(plinth);
  }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(door, 0.08, thick + 0.1), propLit(spec.base));
  sill.position.set(0, 0.04, thick / 2);
  group.add(sill);
  // Inside: a dark room, or a lamp's glow in it (a screen across the room, facing the door).
  const inside = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.6, height), prop.lit ? new THREE.MeshStandardMaterial({ color: spec.glow, emissive: spec.glow, emissiveIntensity: 0.35, roughness: 1, side: THREE.DoubleSide }) : new THREE.MeshBasicMaterial({ color: spec.inside, side: THREE.DoubleSide }));
  inside.position.set(0, height / 2, 1.1);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.6, spec.depth - 0.6), new THREE.MeshBasicMaterial({ color: spec.inside, side: THREE.DoubleSide }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.02, spec.depth / 2);
  const ceiling = floor.clone();
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = height - 0.02;
  group.add(inside, floor, ceiling);
  if (prop.lit) {
    const light = new THREE.PointLight(spec.glow, 0.7, 6, 2);
    light.position.set(0, 1.2, 1.2);
    light.userData.storyFlicker = { base: 0.7, by: 0.08, seed: 3 };
    group.add(light);
    lights.push(light);
  }
  // The roof: two pitches of grey tile over a ridge, overhanging front and back.
  const pitch = 0.5;
  const run = spec.depth / 2 + spec.overhang;
  const slope = run / Math.cos(pitch);
  const ridge = height + Math.tan(pitch) * (spec.depth / 2);
  // (The front pitch, -z of the ridge, rises toward +z; the back one falls toward it.)
  for (const sign of [-1, 1]) {
    const tiles = new THREE.Mesh(new THREE.BoxGeometry(width + spec.overhang * 2, 0.12, slope), propLit(spec.roof));
    tiles.rotation.x = sign * pitch;
    tiles.position.set(0, ridge - (Math.tan(pitch) * run) / 2 + 0.06, spec.depth / 2 + (sign * run) / 2);
    tiles.castShadow = true;
    group.add(tiles);
  }
  const gable = new THREE.Shape([new THREE.Vector2(-spec.depth / 2, 0), new THREE.Vector2(spec.depth / 2, 0), new THREE.Vector2(0, Math.tan(pitch) * spec.depth / 2)]);
  for (const sign of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.ShapeGeometry(gable), propLit(spec.wall, { side: THREE.DoubleSide }));
    end.rotation.y = Math.PI / 2;
    end.position.set(sign * (width / 2 - 0.01), height, spec.depth / 2);
    group.add(end);
  }
  return group;
}

/** Heads laid out in rows on the ground, faces up. */
function propHeads(prop) {
  const spec = STORY_PROPS.heads;
  const group = new THREE.Group();
  const rows = prop.rows ?? 3;
  const perRow = prop.perRow ?? 8;
  const [across, back] = prop.gap ?? [0.42, 0.55];
  const count = rows * perRow;
  const random = propRandom(count * 31 + rows);
  const skin = new THREE.InstancedMesh(new THREE.SphereGeometry(spec.radius, 10, 8), propLit(0xffffff), count);
  const hair = new THREE.InstancedMesh(new THREE.SphereGeometry(spec.radius * 1.05, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), propLit(spec.hair), count);
  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();
  let k = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let index = 0; index < perRow; index += 1) {
      const x = (index - (perRow - 1) / 2) * across + (random() - 0.5) * 0.06;
      const z = row * back + (random() - 0.5) * 0.06;
      // Set down on the neck, the face to the counting side (-z), the hair over the crown and back.
      const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler((random() - 0.5) * 0.3, random() * 0.8 - 0.4, (random() - 0.5) * 0.3));
      matrix.compose(new THREE.Vector3(prop.at[0] + x, spec.radius * 1.05, prop.at[1] + z), turn, new THREE.Vector3(0.92, 1.12, 0.96));
      skin.setMatrixAt(k, matrix);
      const crown = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55, 0, 0));
      matrix.compose(new THREE.Vector3(prop.at[0] + x, spec.radius * 1.05, prop.at[1] + z), turn.clone().multiply(crown), new THREE.Vector3(0.92, 1.12, 0.96));
      hair.setMatrixAt(k, matrix);
      skin.setColorAt(k, colour.setHex(spec.skin[Math.floor(random() * spec.skin.length)]));
      k += 1;
    }
  }
  skin.castShadow = true;
  group.add(skin, hair);
  return group;
}

/** A drying rack, sorghum hung from it (or bare: the harvest gone). */
function propRack(prop) {
  const spec = STORY_PROPS.rack;
  const group = new THREE.Group();
  const length = prop.length ?? 3;
  const wood = propLit(0x5a4834);
  for (const sign of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(spec.post, spec.post, spec.high, 6), wood);
    post.position.set(sign * length / 2, spec.high / 2, 0);
    group.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(spec.post * 0.8, spec.post * 0.8, length + 0.2, 6), wood);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = spec.high;
  group.add(bar);
  if (!prop.bare) {
    const count = Math.floor(length / spec.every);
    const bundle = new THREE.InstancedMesh(new THREE.ConeGeometry(0.09, 0.42, 7), propLit(spec.sorghum), count);
    const stalks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.04, 0.5, 5), propLit(spec.stalk), count);
    const matrix = new THREE.Matrix4();
    const random = propRandom(count * 17);
    for (let k = 0; k < count; k += 1) {
      const x = -length / 2 + spec.every * (k + 0.5);
      const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler((random() - 0.5) * 0.2, 0, Math.PI + (random() - 0.5) * 0.2));
      matrix.compose(new THREE.Vector3(x, spec.high - 0.3, 0), turn, new THREE.Vector3(1, 1, 1));
      bundle.setMatrixAt(k, matrix);
      matrix.compose(new THREE.Vector3(x, spec.high + 0.12, 0), turn, new THREE.Vector3(1, 1, 1));
      stalks.setMatrixAt(k, matrix);
    }
    group.add(bundle, stalks);
  }
  return group;
}

/** A two-wheeled cart, its shafts down. */
function propCart() {
  const spec = STORY_PROPS.cart;
  const group = new THREE.Group();
  const wood = propLit(spec.wood);
  const [long, thick, wide] = spec.bed;
  const bed = new THREE.Mesh(new THREE.BoxGeometry(long, thick, wide), wood);
  bed.position.y = spec.wheel + 0.05;
  for (const sign of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(spec.wheel, 0.05, 6, 16), wood);
    wheel.position.set(0, spec.wheel, sign * (wide / 2 + 0.08));
    const side = new THREE.Mesh(new THREE.BoxGeometry(long, 0.28, 0.05), wood);
    side.position.set(0, spec.wheel + 0.25, sign * wide / 2);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 5), wood);
    shaft.rotation.z = Math.PI / 2 + 0.28;
    shaft.position.set(long / 2 + 0.9, spec.wheel - 0.22, sign * 0.4);
    group.add(wheel, side, shaft);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, wide + 0.3, 6), wood);
  axle.rotation.x = Math.PI / 2;
  axle.position.y = spec.wheel;
  group.add(bed, axle);
  return group;
}

/** A camp gate: two posts, a beam, and the palisade off to each side (its front faces -z). */
function propGate(prop) {
  const spec = STORY_PROPS.gate;
  const group = new THREE.Group();
  const width = prop.width ?? 3;
  const height = prop.height ?? 3.4;
  const wood = propLit(spec.wood);
  for (const sign of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(spec.post, spec.post * 1.1, height, 8), wood);
    post.position.set(sign * width / 2, height / 2, 0);
    group.add(post);
    const count = Math.round(spec.wing / 0.16);
    const stakes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.07, 2.6, 6), wood, count);
    const matrix = new THREE.Matrix4();
    for (let k = 0; k < count; k += 1) {
      matrix.compose(new THREE.Vector3(sign * (width / 2 + 0.18 + k * 0.16), 1.3, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(((k * 13) % 5 - 2) * 0.01, 0, ((k * 7) % 3 - 1) * 0.015)), new THREE.Vector3(1, 1, 1));
      stakes.setMatrixAt(k, matrix);
    }
    group.add(stakes);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.18, 0.2), wood);
  beam.position.y = height - 0.2;
  group.add(beam);
  return group;
}

/** The sorghum-stalk fence plastered with mud, from `from` to `to` (burning: fire along its top, its light). */
function propFence(prop, lights) {
  const spec = STORY_PROPS.fence;
  const group = new THREE.Group();
  const dx = prop.to[0] - prop.from[0];
  const dz = prop.to[1] - prop.from[1];
  const length = Math.hypot(dx, dz);
  const height = prop.height ?? 1.5;
  const count = Math.round(length / spec.every);
  const stalks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.016, height, 4), propLit(spec.stalk), count);
  const matrix = new THREE.Matrix4();
  const random = propRandom(count);
  for (let k = 0; k < count; k += 1) {
    const t = k / count;
    const tall = height * (0.85 + random() * 0.25);
    matrix.compose(new THREE.Vector3(prop.from[0] + dx * t, tall / 2, prop.from[1] + dz * t), new THREE.Quaternion().setFromEuler(new THREE.Euler((random() - 0.5) * 0.08, 0, (random() - 0.5) * 0.08)), new THREE.Vector3(1, tall / height, 1));
    stalks.setMatrixAt(k, matrix);
  }
  group.add(stalks);
  const mud = new THREE.Mesh(new THREE.BoxGeometry(0.08, height * 0.8, length), propLit(spec.mud));
  const angle = Math.atan2(dx, dz);
  mud.rotation.y = angle;
  // On its outer face: to the right of the way from `from` to `to` (+x of a fence running +z).
  mud.position.set((prop.from[0] + prop.to[0]) / 2 + Math.cos(angle) * 0.07, height * 0.4, (prop.from[1] + prop.to[1]) / 2 - Math.sin(angle) * 0.07);
  group.add(mud);
  if (prop.burning) {
    // Burning in places along its top: low tongues of flame, the stalks going first.
    const fire = new THREE.MeshStandardMaterial({ color: spec.fire, emissive: spec.fire, emissiveIntensity: 0.55, transparent: true, opacity: 0.6, depthWrite: false });
    for (let k = 0; k < 14; k += 1) {
      const t = random();
      const tall = 0.18 + random() * 0.35;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06 + random() * 0.06, tall, 5), fire);
      flame.position.set(prop.from[0] + dx * t, height * (0.75 + random() * 0.2) + tall / 2, prop.from[1] + dz * t);
      group.add(flame);
    }
    const light = new THREE.PointLight(spec.fire, 1.1, spec.range, 2);
    light.position.set((prop.from[0] + prop.to[0]) / 2 - 0.6, height + 0.5, (prop.from[1] + prop.to[1]) / 2);
    light.userData.storyFlicker = { base: 1.1, by: 0.3, seed: 11 };
    group.add(light);
    lights.push(light);
  }
  return group;
}

/** A company flag down: its pole on the ground, the cloth by it. */
function propFlag(prop) {
  const spec = STORY_PROPS.flag;
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, spec.pole, 6), propLit(0x5a4834));
  pole.rotation.z = Math.PI / 2;
  pole.position.set(0, 0.035, 0);
  const [wide, high] = spec.cloth;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(wide, high, 5, 4), propLit(new THREE.Color(prop.colour ?? '#a83228').getHex(), { side: THREE.DoubleSide }));
  const positions = cloth.geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) positions.setZ(index, Math.sin(positions.getX(index) * 5 + positions.getY(index) * 3) * 0.03);
  cloth.geometry.computeVertexNormals();
  cloth.rotation.x = -Math.PI / 2;
  cloth.position.set(spec.pole / 2 - wide / 2, 0.02, high / 2 + 0.04);
  group.add(pole, cloth);
  return group;
}

/** A fire in a ring of stones (or gone out: the logs and ash). */
function propFire(prop, lights) {
  const spec = STORY_PROPS.fire;
  const group = new THREE.Group();
  const random = propRandom(Math.round(prop.at[0] * 100 + prop.at[1] * 10));
  for (let k = 0; k < spec.stones; k += 1) {
    const angle = (k / spec.stones) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08 + random() * 0.04), propLit(0x6a655c));
    stone.position.set(Math.cos(angle) * spec.ring, 0.05, Math.sin(angle) * spec.ring);
    group.add(stone);
  }
  for (let k = 0; k < 4; k += 1) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.6, 6), propLit(prop.out ? 0x2a2622 : 0x3a2c20));
    log.rotation.set(Math.PI / 2 - 0.3, (k / 4) * Math.PI * 2, 0);
    log.position.y = 0.08;
    group.add(log);
  }
  if (prop.out) {
    const ash = new THREE.Mesh(new THREE.CircleGeometry(spec.ring * 0.9, 16), propLit(spec.ash));
    ash.rotation.x = -Math.PI / 2;
    ash.position.y = 0.015;
    group.add(ash);
    return group;
  }
  // Tongues of flame among the logs, low: a camp fire, not a torch.
  const [radius, high] = spec.flame;
  const fire = new THREE.MeshStandardMaterial({ color: spec.colour, emissive: spec.colour, emissiveIntensity: 0.8, transparent: true, opacity: 0.75, depthWrite: false });
  for (let k = 0; k < 5; k += 1) {
    const angle = (k / 5) * Math.PI * 2 + random();
    const tall = high * (0.45 + random() * 0.5);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(radius * (0.35 + random() * 0.25), tall, 6), fire);
    flame.position.set(Math.cos(angle) * 0.1, 0.1 + tall / 2, Math.sin(angle) * 0.1);
    group.add(flame);
  }
  const light = new THREE.PointLight(spec.light, prop.light ?? 1, spec.range, 2);
  light.position.y = 0.6;
  light.userData.storyFlicker = { base: prop.light ?? 1, by: spec.flicker, seed: random() * 100 };
  group.add(light);
  lights.push(light);
  return group;
}

/** Pages laid out on the ground over `spread` [x, z] m. */
function propPages(prop) {
  const spec = STORY_PROPS.pages;
  const group = new THREE.Group();
  const random = propRandom((prop.count ?? 6) * 97);
  const [sx, sz] = prop.spread ?? [1, 1];
  const paper = propLit(spec.paper, { roughness: 1 });
  for (let k = 0; k < (prop.count ?? 6); k += 1) {
    const page = new THREE.Mesh(new THREE.PlaneGeometry(spec.size[0], spec.size[1]), paper);
    page.rotation.set(-Math.PI / 2, 0, random() * 0.6 - 0.3);
    page.position.set((random() - 0.5) * sx, 0.02 + k * 0.0005, (random() - 0.5) * sz);
    group.add(page);
  }
  return group;
}

/** A line of footprints from `from` to `to` (in group coordinates: drawn at the origin, the line given whole). */
function propTracks(prop) {
  const spec = STORY_PROPS.tracks;
  const dx = prop.to[0] - prop.from[0];
  const dz = prop.to[1] - prop.from[1];
  const length = Math.hypot(dx, dz);
  const count = Math.floor(length / spec.pace);
  const prints = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 10), propLit(spec.colour, { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), count);
  const matrix = new THREE.Matrix4();
  const random = propRandom(count * 3 + Math.round(prop.from[1] * 10));
  const angle = Math.atan2(dz, dx);
  const across = [-dz / length, dx / length];
  for (let k = 0; k < count; k += 1) {
    const t = (k * spec.pace) / length;
    const side = k % 2 ? 1 : -1;
    const at = [prop.from[0] + dx * t + across[0] * side * spec.apart + (random() - 0.5) * 0.04, prop.from[1] + dz * t + across[1] * side * spec.apart + (random() - 0.5) * 0.04];
    matrix.compose(new THREE.Vector3(at[0], 0.016, at[1]), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -angle)), new THREE.Vector3(spec.size[1], spec.size[0], 1));
    prints.setMatrixAt(k, matrix);
  }
  prints.renderOrder = 3;
  return prints;
}

/** Trees along a wood's edge, from `from` to `to`, snow on their crowns. */
function propTrees(prop) {
  const spec = STORY_PROPS.trees;
  const group = new THREE.Group();
  const count = prop.count ?? 8;
  const random = propRandom(count * 53);
  for (let k = 0; k < count; k += 1) {
    const t = count > 1 ? k / (count - 1) : 0.5;
    const height = spec.height[0] + random() * (spec.height[1] - spec.height[0]);
    const x = prop.from[0] + (prop.to[0] - prop.from[0]) * t + (random() - 0.5) * 1.4;
    const z = prop.from[1] + (prop.to[1] - prop.from[1]) * t + random() * 2.2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, height * 0.4, 6), propLit(spec.trunk));
    trunk.position.set(x, height * 0.2, z);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.1 + random() * 0.6, height * 0.8, 8), propLit(spec.crown));
    crown.position.set(x, height * 0.55, z);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(0.8 + random() * 0.4, height * 0.3, 8), propLit(spec.snow));
    snow.position.set(x, height * 0.82, z);
    trunk.castShadow = crown.castShadow = true;
    group.add(trunk, crown, snow);
  }
  return group;
}

/** His waist tag on the ground, its cord trailing. */
function propTag() {
  const spec = STORY_PROPS.tag;
  const group = new THREE.Group();
  const [wide, long, thick] = spec.size;
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(wide, thick, long), propLit(spec.wood));
  plaque.position.y = thick / 2 + 0.003;
  // Two columns of characters, burnt in: dark strokes down its face.
  for (const column of [-1, 1]) {
    for (let k = 0; k < 4; k += 1) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.002, 0.014), propLit(spec.ink));
      mark.position.set(column * 0.014, thick + 0.004, -long / 2 + 0.025 + k * 0.022);
      group.add(mark);
    }
  }
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.003, 4, 16, Math.PI * 1.4), propLit(spec.cord));
  cord.rotation.x = Math.PI / 2;
  cord.position.set(0.01, 0.004, -long / 2 - 0.04);
  group.add(plaque, cord);
  return group;
}

/** The set pieces of an arena's `works.props`, one group (its lights listed in `userData.lights` for the flicker). */
export function storyProps(props) {
  const group = new THREE.Group();
  group.name = 'story props';
  const lights = [];
  for (const prop of props) {
    let piece = null;
    switch (prop.kind) {
      case 'ground': piece = propPatch(prop); break;
      case 'snow': piece = propPatch(prop, { snow: true }); break;
      case 'pole': piece = propPole(prop); break;
      case 'lantern': piece = propLantern(prop, lights); break;
      case 'house': piece = propHouse(prop, lights); break;
      case 'heads': piece = propHeads(prop); break;
      case 'rack': piece = propRack(prop); break;
      case 'cart': piece = propCart(prop); break;
      case 'gate': piece = propGate(prop); break;
      case 'fence': piece = propFence(prop, lights); break;
      case 'flag': piece = propFlag(prop); break;
      case 'fire': piece = propFire(prop, lights); break;
      case 'pages': piece = propPages(prop); break;
      case 'tracks': piece = propTracks(prop); break;
      case 'trees': piece = propTrees(prop); break;
      case 'tag': piece = propTag(prop); break;
      default: piece = null;
    }
    if (!piece) continue;
    // (Patches, footprints, fences, heads and trees are placed by their own points; the rest stand at `at`, turned `yaw`.)
    if (prop.at && !['ground', 'snow', 'heads'].includes(prop.kind)) {
      piece.position.x += prop.at[0];
      piece.position.z += prop.at[1];
      piece.rotation.y = prop.yaw ?? 0;
    }
    group.add(piece);
  }
  group.userData.lights = lights;
  return group;
}

/** Each frame: the lanterns' and fires' light flickers (a candle's, a wood fire's), by the clock. */
export function storyPropsTick(group, time) {
  for (const light of group?.userData?.lights ?? []) {
    const flicker = light.userData.storyFlicker;
    if (!flicker) continue;
    const t = time + flicker.seed;
    light.intensity = flicker.base * (1 + flicker.by * (0.6 * Math.sin(t * 9.1) + 0.4 * Math.sin(t * 23.7 + 1.3)));
  }
}
