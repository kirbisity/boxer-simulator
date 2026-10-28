// The open plains of the horse-archer battles: what stood at the edge of the
// fighting there and is drawn, not fought over. At Carrhae (53 BC) the Parthian
// camel train that brought Surena's archers fresh arrows; on the Catalaunian
// Plains (451) the long low ridge the
// armies fought for, for the classic look (the realistic looks raise it in the
// generated land: scenery/generated.js). Called from the place builders in
// render.js. Everything stands beyond the fighting floor, never on it: the
// floor is flat at y = 0 and what is on it is the physics' alone.
//
// Each prop is a few simple shapes merged per material (two or three draw
// calls for the lot), coloured per part by vertex colour, so a dozen camels
// cost no more than one. (Mobei has none: Wei Qing's wagon ring is not drawn;
// the Han stand on the open Gobi.)

/* global THREE */

/** A seeded random, 0..1 (the same props every visit). */
function plainsRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Parts gathered for one material: each a geometry placed by a matrix and
 * tinted one colour; `mesh()` merges them into one non-indexed geometry with
 * vertex colours.
 */
function plainsBatch() {
  const parts = [];
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const position = new THREE.Vector3();
  return {
    /** A part at (x, y, z), turned by (rx, ry, rz) (radians, applied x then y then z), in colour `hex`. */
    add(geometry, hex, [x, y, z], [rx = 0, ry = 0, rz = 0] = [], frame = null) {
      euler.set(rx, ry, rz, 'YXZ');
      quaternion.setFromEuler(euler);
      position.set(x, y, z);
      matrix.compose(position, quaternion, scale);
      const placed = (geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(matrix);
      // A whole prop (a camel) is built about its own origin and then set in its place.
      if (frame) placed.applyMatrix4(frame);
      parts.push({ geometry: placed, colour: new THREE.Color(hex) });
    },
    mesh(material) {
      const count = parts.reduce((sum, part) => sum + part.geometry.attributes.position.count, 0);
      const positions = new Float32Array(count * 3);
      const colours = new Float32Array(count * 3);
      let offset = 0;
      for (const { geometry, colour } of parts) {
        const n = geometry.attributes.position.count;
        positions.set(geometry.attributes.position.array, offset * 3);
        for (let index = 0; index < n; index += 1) colours.set([colour.r, colour.g, colour.b], (offset + index) * 3);
        offset += n;
      }
      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      merged.setAttribute('color', new THREE.BufferAttribute(colours, 3));
      merged.computeVertexNormals();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    },
  };
}

/** A frame: a prop built about its origin, turned by `yaw` and set at (x, 0, z). */
function plainsFrame(x, z, yaw) {
  return new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
}

// ---- Carrhae: the camel train ---------------------------------------------------------
//
// Surena brought a thousand camels laden with arrows (Plutarch, Crassus 25),
// so that his archers, their quivers emptied, rode back to the train, filled
// them and rode out again, and the Romans saw that the arrows would not run
// out. A dozen of them stand here beyond the Parthian (blue, +x) end of the
// floor with their handlers: the place a horse archer rides back to.

/**
 * The train: how far beyond the floor's end (m) the nearest camels stand and
 * how deep the group is; how many camels and handlers; a camel's sizes (m: the
 * body's half-length, its height at the hump, the neck's length); the colours.
 */
export const PLAINS_TRAIN = {
  beyond: 4, depth: 10, across: 14, camels: 13, handlers: 3,
  body: 0.85, hump: 2.1, neck: 1.1, leg: 1.25,
  colours: { coat: [0xb08a5a, 0xa07a4a, 0xc49e6e, 0x8a6a44], pannier: 0x7a6040, sack: 0xcab894, arrows: 0x8a7650, fletch: 0xd8d0c0, robe: [0x7a3a2a, 0xd8cdb4, 0x4a5a6a], skin: 0x9a6a48, wrap: 0xe0d6c0 },
};

/** One camel, about its middle on the ground, facing +x: humped body, long neck and head, legs; panniers of arrow sheaves. */
function plainsCamel(batch, frame, random, laden) {
  const spec = PLAINS_TRAIN;
  const c = spec.colours;
  const coat = c.coat[Math.floor(random() * c.coat.length)];
  const legTop = spec.leg + 0.05;
  // The body: a long ellipsoid on the legs, the hump over its middle.
  const body = new THREE.SphereGeometry(1, 12, 8);
  body.scale(spec.body, 0.42, 0.38);
  batch.add(body, coat, [0, legTop + 0.25, 0], [], frame);
  const hump = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  hump.scale(0.42, spec.hump - legTop - 0.5, 0.3);
  batch.add(hump, coat, [-0.05, legTop + 0.45, 0], [], frame);
  // The neck dips forward and rises to the head.
  const neck = new THREE.CylinderGeometry(0.11, 0.17, spec.neck, 7);
  batch.add(neck, coat, [spec.body + 0.28, legTop + 0.45, 0], [0, 0, -0.85], frame);
  const upper = new THREE.CylinderGeometry(0.09, 0.11, 0.55, 7);
  batch.add(upper, coat, [spec.body + 0.72, legTop + 0.95, 0], [0, 0, -0.15], frame);
  const head = new THREE.SphereGeometry(1, 8, 6);
  head.scale(0.26, 0.12, 0.11);
  batch.add(head, coat, [spec.body + 0.9, legTop + 1.2, 0], [0, 0, -0.35], frame);
  // Four long legs, the knees a little forward.
  for (const [lx, lz] of [[0.55, 0.2], [0.55, -0.2], [-0.6, 0.2], [-0.6, -0.2]]) {
    const leg = new THREE.CylinderGeometry(0.06, 0.08, spec.leg, 6);
    batch.add(leg, coat, [lx + (random() - 0.5) * 0.1, spec.leg / 2, lz], [0, 0, (random() - 0.5) * 0.12], frame);
    batch.add(new THREE.CylinderGeometry(0.1, 0.11, 0.06, 7), coat, [lx, 0.03, lz], [], frame);
  }
  if (!laden) return;
  // Panniers either side of the hump, and in them sheaves of arrows standing fletching up.
  for (const side of [-1, 1]) {
    batch.add(new THREE.BoxGeometry(0.75, 0.55, 0.28), c.pannier, [-0.05, legTop + 0.25, side * 0.52], [side * 0.08, 0, 0], frame);
    for (let sheaf = 0; sheaf < 3; sheaf += 1) {
      const at = [-0.3 + sheaf * 0.25, legTop + 0.62, side * 0.53];
      batch.add(new THREE.CylinderGeometry(0.07, 0.06, 0.55, 6), c.arrows, at, [side * 0.1, 0, 0], frame);
      batch.add(new THREE.CylinderGeometry(0.1, 0.075, 0.12, 6), c.fletch, [at[0], at[1] + 0.3, at[2] + side * 0.03], [side * 0.1, 0, 0], frame);
    }
  }
  batch.add(new THREE.SphereGeometry(0.28, 8, 6), c.sack, [-0.6, legTop + 0.55, 0], [], frame);
}

/** A handler on foot: robe, head wrap, a staff. */
function plainsHandler(batch, frame, random) {
  const c = PLAINS_TRAIN.colours;
  const robe = c.robe[Math.floor(random() * c.robe.length)];
  batch.add(new THREE.CylinderGeometry(0.17, 0.26, 1.25, 8), robe, [0, 0.63, 0], [], frame);
  batch.add(new THREE.CylinderGeometry(0.19, 0.17, 0.3, 8), robe, [0, 1.38, 0], [], frame);
  batch.add(new THREE.SphereGeometry(0.11, 8, 6), c.skin, [0.02, 1.64, 0], [], frame);
  batch.add(new THREE.SphereGeometry(0.125, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), c.wrap, [0, 1.67, 0], [], frame);
  batch.add(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 5), 0x5a4430, [0.3, 0.9, 0.15], [0.1, 0, 0.12], frame);
}

/** Where the train stands: camels [x, z, yaw, laden] (their middles; yaw turns a camel built facing +x) and handlers [x, z, yaw]. */
export function plainsTrainSpots({ halfX }) {
  const spec = PLAINS_TRAIN;
  const random = plainsRandom(5300);
  const strings = 4;
  const camels = Array.from({ length: spec.camels }, (_, index) => {
    const string = index % strings;
    const along = Math.floor(index / strings);
    const x = halfX + spec.beyond + 1.5 + along * 3 + (random() - 0.5) * 1.2;
    const z = (string - (strings - 1) / 2) * (spec.across / strings) + (random() - 0.5) * 1.5;
    // Most stand along the floor's end, heads to one side or the other; a few face the field.
    const yaw = (random() < 0.7 ? (string % 2 ? Math.PI / 2 : -Math.PI / 2) : Math.PI) + (random() - 0.5) * 0.5;
    return [x, z, yaw, random() < 0.85];
  });
  const handlers = Array.from({ length: spec.handlers }, () => [halfX + spec.beyond + 1 + random() * spec.depth * 0.6, (random() - 0.5) * spec.across, random() * Math.PI * 2]);
  return { camels, handlers };
}

/**
 * The camel train beyond the Parthian (blue, +x) end of the floor: camels
 * from x = halfX + beyond to halfX + beyond + depth, z within ±across/2, in
 * loose strings head to tail, most laden with arrow panniers; the handlers
 * among them. Drawn only.
 */
export function plainsCamelTrain(arena) {
  const random = plainsRandom(53);
  const batch = plainsBatch();
  const { camels, handlers } = plainsTrainSpots(arena);
  for (const [x, z, yaw, laden] of camels) plainsCamel(batch, plainsFrame(x, z, yaw), random, laden);
  for (const [x, z, yaw] of handlers) plainsHandler(batch, plainsFrame(x, z, yaw), random);
  const group = new THREE.Group();
  group.add(batch.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
  group.userData.plains = 'train';
  return group;
}

// ---- the Catalaunian ridge (classic look) ---------------------------------------------
//
// Jordanes (Getica 197–201) has the battle turn on a ridge rising gently
// above the plain: the Huns and the Romans' allies raced for it, and Thorismund's
// Visigoths, coming down off it, broke the Hunnic wing. It is drawn beyond the far
// long side of the floor (−z), running the floor's length: a long low swell of
// grass, `rise` m at its crest, `back` m beyond the floor's side.

export const PLAINS_RIDGE = { rise: 9, back: 26, width: 30, colour: 0x7a8a48 };

/** The ridge for the classic look: a long flattened half-ellipsoid beyond −z (tagged as hills, so the realistic looks' land replaces it). */
export function plainsRidge({ halfX, halfZ }) {
  const spec = PLAINS_RIDGE;
  const ridge = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: spec.colour, roughness: 0.95 }));
  ridge.scale.set(halfX * 1.6 + 40, spec.rise, spec.width);
  ridge.position.set(0, -0.3, -(halfZ + spec.back + spec.width * 0.3));
  ridge.receiveShadow = true;
  ridge.userData.scenery = 'hills';
  return ridge;
}
