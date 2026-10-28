// The square of Cajamarca (buildCajamarca in render.js), as the Spaniards
// found it on 15 November 1532 and described it after (Xerez, Pedro Pizarro,
// Estete): a walled square in the middle of the town, larger than any in
// Spain, closed on three sides by long halls (the kallanka: barracks and
// assembly halls of the Inca's state) each some two hundred paces long with
// twenty doorways on the square, which is where Pizarro hid his horse and
// foot; a wall of tapia (rammed earth) round the rest, with a gate where
// Atahualpa came in; and at one end a stepped stone platform (the ushnu, the
// Inca's seat of state, which the Spaniards called the fortress), where
// Candia set the falconets. The town lies in a green valley at 2,700 m, the
// bare hills round it; late afternoon, when the litter came in.
//
// Built at the game's scale round the battle's floor (scenarios.js cajamarca:
// 32 by 22 m): the halls stand just beyond its north and south edges, their
// doorways where the ambush waits; the ushnu beyond the west edge behind a low
// wall; the gate in the east wall. Inca masonry: fieldstone set in clay for
// the lower walls, adobe above, the doorways trapezoidal (narrower at the
// top), thatched gable roofs of ichu grass. The fighting floor stays flat at
// y = 0 (the physics stands on it): nothing here is inside it.

/* global THREE */

/** Where things stand (m from the middle of the square; +x east, +z south). */
export const CAJAMARCA_PLAN = {
  // The long halls' fronts on the square, their ends, depth, wall height and the roof's ridge.
  halls: { front: 11.8, from: -15.5, to: 11.5, depth: 8, wall: 3.2, ridge: 6.8 },
  // The doorways along each hall, at x (where the Spaniards wait: scenarios.js CAJAMARCA.spanish).
  doors: [-15, -11, -7, -3, 1, 5, 9],
  door: { bottom: 1.5, top: 1.1, height: 2.5 },
  // The low west wall, the ushnu behind it (centre x, base half-size, tiers).
  west: -16.6,
  ushnu: { x: -22, half: 4.5, tiers: 3, tier: 1.1 },
  // The east wall and its gate (half-width), the wall's height.
  east: 16.6,
  gate: 1.8,
  wallHeight: 3.4,
  // The hills round the valley: from, to (m out).
  hills: [90, 170],
};

/** A seeded generator (mulberry32). */
function cajamarcaRandom(seed) {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A canvas texture painted by `paint(g, w, h, random)`, tiled `repeat` times. */
function cajamarcaTexture(size, seed, paint, repeat = [1, 1]) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  paint(canvas.getContext('2d'), size, size, cajamarcaRandom(seed));
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 4;
  return texture;
}

// The textures: fieldstone in clay, adobe, ichu thatch, the square's packed earth.
const CAJAMARCA_PAINT = {
  stone(g, w, h, random) {
    g.fillStyle = '#7a6c58';
    g.fillRect(0, 0, w, h);
    // Courses of rough fieldstones, each its own grey-brown, the clay between.
    for (let y = 0; y < h; y += 26 + random() * 10) {
      for (let x = -random() * 40; x < w; x += 34 + random() * 30) {
        const tone = 110 + random() * 60;
        g.fillStyle = `rgb(${tone},${tone * 0.95},${tone * 0.86})`;
        g.beginPath();
        g.ellipse(x + 18, y + 13, 16 + random() * 8, 10 + random() * 4, random() * 0.3, 0, Math.PI * 2);
        g.fill();
      }
    }
  },
  adobe(g, w, h, random) {
    g.fillStyle = '#b08a5e';
    g.fillRect(0, 0, w, h);
    // Courses of mud brick under a wash of the same mud, streaked by the rains.
    for (let y = 0; y < h; y += 32) {
      g.fillStyle = 'rgba(80,56,34,0.25)';
      g.fillRect(0, y, w, 2);
      for (let x = (y / 32) % 2 ? 0 : 32; x < w; x += 64) g.fillRect(x, y, 2, 32);
    }
    for (let index = 0; index < 120; index += 1) {
      g.fillStyle = `rgba(${random() < 0.5 ? '70,50,30' : '200,170,130'},${random() * 0.18})`;
      g.fillRect(random() * w, random() * h, 3 + random() * 6, 20 + random() * 80);
    }
  },
  thatch(g, w, h, random) {
    g.fillStyle = '#a88a52';
    g.fillRect(0, 0, w, h);
    // Ichu grass laid in courses down the roof, each straw its own pale or weathered grey.
    for (let index = 0; index < 2200; index += 1) {
      const tone = random();
      g.strokeStyle = tone < 0.3 ? 'rgba(96,82,60,0.5)' : tone < 0.7 ? 'rgba(196,166,104,0.55)' : 'rgba(150,124,78,0.5)';
      const x = random() * w;
      const y = random() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (random() - 0.5) * 6, y + 18 + random() * 22);
      g.stroke();
    }
    for (let y = 0; y < h; y += 42) {
      g.fillStyle = 'rgba(60,46,30,0.35)';
      g.fillRect(0, y, w, 3);
    }
  },
  earth(g, w, h, random) {
    g.fillStyle = '#8c7556';
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 900; index += 1) {
      const tone = 90 + random() * 80;
      g.fillStyle = `rgba(${tone},${tone * 0.86},${tone * 0.66},${0.25 + random() * 0.4})`;
      g.beginPath();
      g.arc(random() * w, random() * h, 1 + random() * 4, 0, Math.PI * 2);
      g.fill();
    }
    // Trodden darker in places; a little grass at the edges of the stones.
    for (let index = 0; index < 60; index += 1) {
      g.fillStyle = `rgba(${random() < 0.7 ? '70,56,40' : '90,110,60'},${random() * 0.12})`;
      g.beginPath();
      g.arc(random() * w, random() * h, 20 + random() * 60, 0, Math.PI * 2);
      g.fill();
    }
  },
};

/** A wall's box: centred at (x, z), `length` along x (or z if `alongZ`), `thick`, from y0 to y1. */
function cajamarcaBox(material, { x, z, length, thick, y0 = 0, y1, alongZ = false }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? thick : length, y1 - y0, alongZ ? length : thick), material);
  mesh.position.set(x, (y0 + y1) / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A trapezoidal doorway's dark opening, `bottom` and `top` wide, standing on the ground, facing `+z` turned by `yaw`. */
function cajamarcaDoorway(material, { bottom, top, height }) {
  const shape = new THREE.Shape();
  shape.moveTo(-bottom / 2, 0);
  shape.lineTo(bottom / 2, 0);
  shape.lineTo(top / 2, height);
  shape.lineTo(-top / 2, height);
  shape.closePath();
  return new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
}

/**
 * A long hall (kallanka) along x on the square's north (`side` −1) or south
 * (+1) side: stone below and adobe above, its doorways on the square, a
 * thatched gable roof; a stone lintel over each door.
 */
function cajamarcaHall(materials, side) {
  const { halls, doors, door } = CAJAMARCA_PLAN;
  const group = new THREE.Group();
  const length = halls.to - halls.from;
  const middle = (halls.to + halls.from) / 2;
  const front = side * halls.front;
  const back = side * (halls.front + halls.depth);
  const thick = 0.6;
  for (const z of [front + side * thick / 2, back - side * thick / 2]) {
    group.add(cajamarcaBox(materials.stone, { x: middle, z, length, thick, y1: 1.6 }));
    group.add(cajamarcaBox(materials.adobe, { x: middle, z, length, thick, y0: 1.6, y1: halls.wall }));
  }
  for (const x of [halls.from, halls.to]) {
    group.add(cajamarcaBox(materials.stone, { x, z: (front + back) / 2, length: halls.depth, thick, y1: 1.6, alongZ: true }));
    // The gable end: adobe up to the ridge.
    const gable = new THREE.Shape();
    gable.moveTo(-halls.depth / 2, 0);
    gable.lineTo(halls.depth / 2, 0);
    gable.lineTo(0, halls.ridge - 1.6);
    gable.closePath();
    const end = new THREE.Mesh(new THREE.ExtrudeGeometry(gable, { depth: thick, bevelEnabled: false }), materials.adobe);
    end.rotation.y = Math.PI / 2;
    end.position.set(x - thick / 2, 1.6, (front + back) / 2);
    end.castShadow = true;
    group.add(end);
  }
  // The roof: two thatched slopes from the walls' tops to the ridge, overhanging the front.
  const run = halls.depth / 2 + 0.8;
  const rise = halls.ridge - halls.wall;
  const slope = Math.hypot(run, rise);
  for (const face of [-1, 1]) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 1.2, 0.25, slope), materials.thatch);
    roof.rotation.x = face * side * Math.atan2(rise, run) * -1;
    roof.position.set(middle, halls.wall + rise / 2 - 0.2, (front + back) / 2 + face * side * run / 2);
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);
  }
  // The doorways on the square: dark openings just proud of the wall, a stone lintel over each.
  for (const x of doors) {
    const opening = cajamarcaDoorway(materials.dark, door);
    opening.position.set(x, 0.01, front - side * 0.01);
    if (side > 0) opening.rotation.y = Math.PI;
    group.add(opening);
    group.add(cajamarcaBox(materials.lintel, { x, z: front - side * 0.04, length: door.top + 0.5, thick: 0.12, y0: door.height, y1: door.height + 0.25 }));
  }
  return group;
}

/** The ushnu: a stepped platform of dressed stone, a stair up its east face. */
function cajamarcaUshnu(materials) {
  const { ushnu } = CAJAMARCA_PLAN;
  const group = new THREE.Group();
  for (let tier = 0; tier < ushnu.tiers; tier += 1) {
    const half = ushnu.half - tier * 1.1;
    const block = new THREE.Mesh(new THREE.BoxGeometry(half * 2, ushnu.tier, half * 2), materials.dressed);
    block.position.set(ushnu.x, ushnu.tier * (tier + 0.5), 0);
    block.castShadow = true;
    block.receiveShadow = true;
    group.add(block);
  }
  for (let step = 0; step < ushnu.tiers * 3; step += 1) {
    const stair = new THREE.Mesh(new THREE.BoxGeometry(0.45, ushnu.tier / 3, 1.6), materials.dressed);
    stair.position.set(ushnu.x + ushnu.half + 0.2 - step * 0.37, (ushnu.tier / 3) * (step + 0.5), 0);
    group.add(stair);
  }
  return group;
}

/** The hills round the valley: low cones, green below and bare brown above, in a ring. */
function cajamarcaHills(random) {
  const [from, to] = CAJAMARCA_PLAN.hills;
  const geometry = new THREE.ConeGeometry(1, 1, 9, 3);
  const colours = [];
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const up = position.getY(index) + 0.5;
    const colour = new THREE.Color(0x5e6e3c).lerp(new THREE.Color(0x8a7650), Math.min(1, up * 1.4));
    colours.push(colour.r, colour.g, colour.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const count = 26;
  const hills = new THREE.InstancedMesh(geometry, material, count);
  const place = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + random() * 0.2;
    const out = from + random() * (to - from);
    const width = 30 + random() * 40;
    const height = 18 + random() * 30;
    place.position.set(Math.cos(angle) * out, height / 2 - 2, Math.sin(angle) * out);
    place.scale.set(width, height, width * (0.7 + random() * 0.6));
    place.rotation.y = random() * Math.PI;
    place.updateMatrix();
    hills.setMatrixAt(index, place.matrix);
  }
  return hills;
}

/** The square of Cajamarca: its floor, halls, walls, gate and ushnu, and the valley's hills. */
export function cajamarcaTown(place) {
  const random = cajamarcaRandom(1532);
  const lit = (map, color = 0xffffff) => new THREE.MeshStandardMaterial({ color, map, roughness: 0.95 });
  const materials = {
    stone: lit(cajamarcaTexture(256, 1, CAJAMARCA_PAINT.stone, [6, 1])),
    adobe: lit(cajamarcaTexture(256, 2, CAJAMARCA_PAINT.adobe, [8, 1])),
    thatch: lit(cajamarcaTexture(256, 3, CAJAMARCA_PAINT.thatch, [10, 2])),
    dressed: lit(cajamarcaTexture(256, 4, CAJAMARCA_PAINT.stone, [3, 1]), 0xc8beae),
    lintel: new THREE.MeshStandardMaterial({ color: 0x6e6658, roughness: 0.9 }),
    dark: new THREE.MeshBasicMaterial({ color: 0x0e0b08, side: THREE.DoubleSide }),
  };
  // The square's packed earth, and the valley's fields beyond the walls.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 50), lit(cajamarcaTexture(512, 5, CAJAMARCA_PAINT.earth, [8, 6])));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.scenery = 'ground';
  place.add(ground);
  const fields = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), new THREE.MeshLambertMaterial({ color: 0x6a7a44 }));
  fields.rotation.x = -Math.PI / 2;
  fields.position.y = -0.03;
  place.add(fields);
  place.add(cajamarcaHall(materials, -1), cajamarcaHall(materials, 1));
  const { halls, west, east, gate, wallHeight } = CAJAMARCA_PLAN;
  // The low west wall before the ushnu; the east wall with its gate; the corners closed between the halls' ends and the walls.
  place.add(cajamarcaBox(materials.stone, { x: west, z: 0, length: 2 * halls.front, thick: 0.7, y1: 1.3, alongZ: true }));
  for (const sign of [-1, 1]) {
    const span = halls.front - gate;
    place.add(cajamarcaBox(materials.adobe, { x: east, z: sign * (gate + span / 2), length: span, thick: 0.8, y1: wallHeight, alongZ: true }));
    place.add(cajamarcaBox(materials.adobe, { x: (halls.to + east) / 2, z: sign * (halls.front + 0.4), length: east - halls.to, thick: 0.8, y1: wallHeight }));
    place.add(cajamarcaBox(materials.stone, { x: (west + halls.from) / 2, z: sign * (halls.front + 0.4), length: halls.from - west, thick: 0.8, y1: 1.6 }));
  }
  // The gate's dark way out to the town, under a lintel.
  const way = cajamarcaDoorway(materials.dark, { bottom: 2 * gate, top: 2 * gate - 0.6, height: wallHeight - 0.4 });
  way.rotation.y = -Math.PI / 2;
  way.position.set(east - 0.42, 0.01, 0);
  place.add(way, cajamarcaBox(materials.lintel, { x: east, z: 0, length: 2 * gate + 0.6, thick: 0.8, y0: wallHeight - 0.4, y1: wallHeight, alongZ: true }));
  place.add(cajamarcaUshnu(materials));
  place.add(cajamarcaHills(random));
  return place;
}
