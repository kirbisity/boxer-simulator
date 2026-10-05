// Three.js view of the fight world. Reads the simulation; never writes to it.
// Each fighter is one skinned body over a rig that the physics skeleton
// drives, drawn in four layers: skin, muscle, bone and the physics itself.
// The skin is a soft shell: every vertex is a damped spring about its rest
// place, so a punch leaves a dent that springs back at the tissue's speed.

/* global THREE */
import { P, PARTICLES } from './body.js';
import { buildBodyMesh } from './bodymesh.js';
import { buildLoftBody, TOPS } from './loftbody.js';
import { buildSkeleton } from './bones.js';
import { Dangle } from './dangle.js';
import { glovedFists, headgearOptions } from './outfits.js';
import { buildBackPrint, buildBanner, buildFootwear, buildHand, buildHeadgear, buildSwinging, dressFor, handKind, roleColors, steelEnvironment, steelMaterial, tattooColor, buildHeadProp } from './wardrobe.js';
import { buildHead } from './face.js';
import { capsules, capsuleEnds, JOINT_SEGMENTS, point, WORLD } from './physics.js';
import { BONE, BONES, bindPoints, boneFrames, coherentFrames, frameMatrix, fromFrame, toFrame } from './rig.js';
import { bakePieces, crowdBatch, crowdKey, frameAt, stretchedInverses } from './crowdview.js';
import { SoftShell } from './soft.js';
import { outlineFor, surface } from './toon.js';

const LAYERS = ['skin', 'muscle', 'bone', 'physics'];
const CORNER_COLORS = { red: 0xc8262c, blue: 0x2457c5 };
// Skin tones, lightest to deepest. Light tan is a warm, yellow-leaning
// light skin: a shade under light, nowhere near medium.
export const SKIN_TONES = { light: 0xe8b796, lightTan: 0xcc9a66, medium: 0xc58c64, tan: 0xa8704a, deep: 0x7a4a2e };

// Drawn characters carry slightly large heads; it is what makes them read
// as characters rather than as small-headed mannequins.
const HEAD_SCALE = 1.12;
const HEAD_SEAT = 0.18; // head radii the head sits lower than the physics head
const v3 = (array) => new THREE.Vector3(array[0], array[1], array[2]);

// ---- Scene -----------------------------------------------------------------

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d14);
  scene.fog = new THREE.Fog(0x0b0d14, 9, 22);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);

  const hemi = new THREE.HemisphereLight(0xb8c6e0, 0x3a2e24, 0.62);
  scene.add(hemi);
  const key = new THREE.SpotLight(0xfff2e0, 1.2, 20, 0.62, 0.45, 1.2);
  key.position.set(0.8, 7.5, 1.2);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 3;
  key.shadow.camera.far = 12;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x6f8cff, 0.35);
  rim.position.set(-4, 3, -5);
  scene.add(rim);
  // The sun, for open-air places: off until one is shown.
  const sun = new THREE.DirectionalLight(0xfff0d6, 0);
  sun.position.set(6, 11, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);
  const places = { ring: buildRing(), subway: null, colosseum: null };
  // One reflection map for every piece of steel in the scene.
  const steelEnv = steelEnvironment(renderer);
  scene.add(places.ring);
  return { renderer, scene, camera, orbit: { yaw: -0.5, pitch: 0.2, distance: 5.2, target: new THREE.Vector3(0, 1.1, 0) }, places, lights: { key, rim, sun, hemi }, place: 'ring', steelEnv };
}

/**
 * Where the fight is: the ring, or a scenario's scene round its arena. The
 * scene is built the first time it is needed; lighting goes with it.
 */
export function setPlace(view, place, arena) {
  if (place === view.place) return;
  const builders = { subway: buildSubway, colosseum: buildColosseum, meadow: buildMeadow, stadium: buildStadium, town: buildTown, port: buildPort, sengoku: buildSengoku, plain: buildPlain, coastFort: () => buildCoast({ fort: true }), coastVillage: () => buildCoast({ fort: false }) };
  if (!view.places[place] && builders[place]) {
    view.places[place] = builders[place](arena);
    view.scene.add(view.places[place]);
  }
  for (const [key, group] of Object.entries(view.places)) if (group) group.visible = key === place;
  const light = PLACE_LIGHT[place] ?? PLACE_LIGHT.ring;
  view.scene.background = new THREE.Color(light.background);
  view.scene.fog = new THREE.Fog(light.background, light.fog[0], light.fog[1]);
  view.lights.key.color.set(light.key);
  view.lights.key.intensity = light.keyIntensity;
  view.lights.rim.color.set(light.rim);
  view.lights.sun.intensity = light.sun ?? 0;
  view.lights.hemi.intensity = light.hemi ?? 0.62;
  view.lights.key.castShadow = !light.sun;
  view.place = place;
}

// Each place's light: sky or dark hall, fog, the overhead key, the rim,
// and the sun for a place open to the sky.
const PLACE_LIGHT = {
  ring: { background: 0x0b0d14, fog: [9, 22], key: 0xfff2e0, keyIntensity: 1.2, rim: 0x6f8cff },
  subway: { background: 0x10140f, fog: [8, 26], key: 0xf2fff0, keyIntensity: 0.9, rim: 0x9fd8c0 },
  colosseum: { background: 0x9cc4e8, fog: [30, 90], key: 0xfff4e0, keyIntensity: 0.2, rim: 0xbcd4ff, sun: 0.85 },
  meadow: { background: 0xa9cbe6, fog: [25, 70], key: 0xfff4e0, keyIntensity: 0.15, rim: 0xc8e0ff, sun: 0.9 },
  // A bright summer noon, a clear sky with high cloud, haze in the distance.
  town: { background: 0xc4dcf2, fog: [40, 130], key: 0xfff4e0, keyIntensity: 0.1, rim: 0xd6e6ff, sun: 1.15 },
  // Autumn morning on an open battlefield: clear, the sun strong, haze on the hills.
  sengoku: { background: 0xc8dcee, fog: [35, 120], key: 0xfff4e0, keyIntensity: 0.1, rim: 0xd6e6ff, sun: 1.1 },
  // The high plain of the Valley of Mexico: thin bright air, a hard sun.
  plain: { background: 0xbcd8f0, fog: [40, 140], key: 0xfff4e0, keyIntensity: 0.1, rim: 0xd6e6ff, sun: 1.2 },
  // A tropical shore: bright, hazy over the sea.
  coastFort: { background: 0xc6e0f2, fog: [35, 130], key: 0xfff4e0, keyIntensity: 0.1, rim: 0xd6e6ff, sun: 1.15 },
  coastVillage: { background: 0xc8dcee, fog: [35, 120], key: 0xfff4e0, keyIntensity: 0.1, rim: 0xd6e6ff, sun: 1.1 },
  // Night on the quay: moonlight from above, faint; the lamps do the rest.
  port: { background: 0x060912, fog: [14, 48], key: 0x9fb4ff, keyIntensity: 0.85, rim: 0x5a78c0, hemi: 0.24 },
  // A dark hall, the ring alone under hard white light.
  stadium: { background: 0x040509, fog: [12, 46], key: 0xfff8ee, keyIntensity: 1.75, rim: 0x5a78ff },
};

/** The fighting floor of each sandbox place (half-sizes in x and z). */
export const PLACE_ARENAS = {
  ring: { halfX: WORLD.ringHalf, halfZ: WORLD.ringHalf },
  colosseum: { halfX: 6.5, halfZ: 4.4 },
  subway: { halfX: 4.2, halfZ: 1.35 },
  meadow: { halfX: 9, halfZ: 7 },
  stadium: { halfX: WORLD.ringHalf, halfZ: WORLD.ringHalf },
  town: { halfX: 9, halfZ: 7 },
  port: { halfX: 10, halfZ: 6 },
  sengoku: { halfX: 11, halfZ: 7 },
  plain: { halfX: 12, halfZ: 8 },
  coastFort: { halfX: 12, halfZ: 8 },
  coastVillage: { halfX: 12, halfZ: 8 },
};

/**
 * A village green under an open sky: trodden grass, a dirt track, thatched
 * cottages and a wattle fence round the edge, haystacks, a few trees, and
 * low hills beyond.
 */
function buildMeadow() {
  const place = new THREE.Group();
  const lit = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, ...options });
  const grass = paintedTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#5f7f3a';
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 14000; index += 1) {
      const shade = Math.random();
      g.fillStyle = `rgba(${60 + shade * 70},${95 + shade * 70},${30 + shade * 35},${0.25 + Math.random() * 0.3})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 4);
    }
    // A worn track across the green.
    g.fillStyle = 'rgba(120,96,62,0.55)';
    g.beginPath();
    g.ellipse(w / 2, h / 2, w * 0.5, h * 0.12, 0.2, 0, Math.PI * 2);
    g.fill();
  }, [3, 3]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), lit(0xffffff, { map: grass }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  place.add(ground);
  // Low hills all round.
  for (let index = 0; index < 14; index += 1) {
    const angle = (index / 14) * Math.PI * 2;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(8 + Math.random() * 6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lit(0x6d8a45));
    hill.scale.y = 0.25 + Math.random() * 0.2;
    hill.position.set(Math.cos(angle) * 40, -0.5, Math.sin(angle) * 40);
    place.add(hill);
  }
  // Cottages: wattle and daub under thatch.
  const daub = lit(0xd8c8a4);
  const thatch = lit(0xb08a4a);
  const timber = lit(0x4a3422);
  for (const [x, z, turn] of [[-13, -9, 0.3], [-6, -12, -0.1], [9, -11, 0.2], [14, 4, 1.4], [-14, 6, -1.2], [4, 12, 3.0]]) {
    const cottage = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.2, 3), daub);
    walls.position.y = 1.1;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.4, 4), thatch);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.35, 1, 0.95);
    roof.position.y = 3.3;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.06), timber);
    door.position.set(0, 0.8, 1.52);
    for (const piece of [walls, roof]) {
      piece.castShadow = true;
      piece.receiveShadow = true;
    }
    cottage.add(walls, roof, door);
    cottage.position.set(x, 0, z);
    cottage.rotation.y = turn;
    place.add(cottage);
  }
  // A wattle fence round the green, gapped.
  const post = lit(0x5a4128);
  for (let index = 0; index < 64; index += 1) {
    const angle = (index / 64) * Math.PI * 2;
    if (Math.sin(angle * 3) > 0.85) continue;
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 6), post);
    stake.position.set(Math.cos(angle) * 11.5, 0.55, Math.sin(angle) * 9.5);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 1.2), lit(0x7a5a34));
    rail.position.set(stake.position.x, 0.55, stake.position.z);
    rail.rotation.y = -angle;
    place.add(stake, rail);
  }
  // Haystacks and trees.
  for (const [x, z] of [[-10, 2], [11, -4], [-3, 10], [6, -9]]) {
    const stack = new THREE.Mesh(new THREE.SphereGeometry(1.2, 14, 10), lit(0xd8b860));
    stack.scale.y = 1.2;
    stack.position.set(x, 0.9, z);
    stack.castShadow = true;
    place.add(stack);
  }
  for (const [x, z, size] of [[-18, -2, 1.2], [18, -8, 1], [-8, 16, 1.4], [16, 12, 1.1], [0, -17, 1.3]]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * size, 0.35 * size, 3 * size, 8), lit(0x5a4128));
    trunk.position.set(x, 1.5 * size, z);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(2.2 * size, 12, 10), lit(0x3f6a2a));
    crown.position.set(x, 4 * size, z);
    crown.castShadow = true;
    place.add(trunk, crown);
  }
  return place;
}

/**
 * The Colosseum, open to the sky: an oval of raked sand, the podium wall
 * round it with its gates and marble balustrade, the stepped stone tiers of
 * the cavea rising behind, filled with a crowd, and the arched travertine
 * outer wall above them.
 */
function buildColosseum() {
  const place = new THREE.Group();
  const rx = 10.5;
  const rz = 7;
  const stone = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...options });
  const oval = (geometry) => {
    geometry.scale(rx, 1, rz);
    return geometry;
  };
  // Sand, raked and trodden.
  const sand = paintedTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#c9a675';
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 9000; index += 1) {
      const shade = Math.random();
      g.fillStyle = `rgba(${150 + shade * 80},${120 + shade * 70},${80 + shade * 50},${0.12 + Math.random() * 0.2})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 2);
    }
    g.strokeStyle = 'rgba(140,105,65,0.18)';
    g.lineWidth = 2;
    for (let y = 6; y < h; y += 14) {
      g.beginPath();
      g.moveTo(0, y + Math.random() * 3);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.05) * 2 + Math.random() * 2);
      g.stroke();
    }
  }, [6, 4]);
  const floorGeometry = new THREE.CircleGeometry(1, 72);
  floorGeometry.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(oval(floorGeometry), stone(0xffffff, { map: sand, roughness: 1 }));
  floor.receiveShadow = true;
  place.add(floor);
  // The podium wall: dressed stone, a dark base, marble on top.
  const podiumHeight = 3.2;
  const wallTexture = paintedTexture(512, 128, (g, w, h) => {
    g.fillStyle = '#c8b089';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(90,70,45,0.45)';
    g.lineWidth = 2;
    for (let row = 0; row < 4; row += 1) {
      const y = (row + 1) * (h / 4);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      for (let x = (row % 2) * 32; x < w; x += 64) {
        g.beginPath();
        g.moveTo(x, y - h / 4);
        g.lineTo(x, y);
        g.stroke();
      }
    }
    for (let index = 0; index < 1500; index += 1) {
      g.fillStyle = `rgba(80,60,40,${Math.random() * 0.12})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, [24, 1]);
  const podium = new THREE.Mesh(oval(new THREE.CylinderGeometry(1, 1, podiumHeight, 96, 1, true)), stone(0xffffff, { map: wallTexture, side: THREE.BackSide }));
  podium.position.y = podiumHeight / 2;
  podium.receiveShadow = true;
  const base = new THREE.Mesh(oval(new THREE.CylinderGeometry(0.995, 0.995, 0.45, 96, 1, true)), stone(0x6b5a44, { side: THREE.BackSide }));
  base.position.y = 0.22;
  const coping = new THREE.Mesh(oval(new THREE.CylinderGeometry(1.03, 1.0, 0.22, 96, 1, true)), stone(0xeee8dc, { side: THREE.DoubleSide, roughness: 0.6 }));
  coping.position.y = podiumHeight + 0.11;
  place.add(podium, base, coping);
  // Gates at the two ends and the middle of each side: dark arches in the wall.
  const gate = stone(0x1b140e);
  for (const angle of [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, (Math.PI * 3) / 4, (-Math.PI * 3) / 4]) {
    const x = Math.cos(angle) * rx * 0.992;
    const z = Math.sin(angle) * rz * 0.992;
    const big = Math.abs(Math.sin(angle)) < 0.1;
    const width = big ? 2.2 : 1.3;
    const height = big ? 2.6 : 2.0;
    const opening = new THREE.Mesh(new THREE.PlaneGeometry(width, height - width / 2), gate);
    const top = new THREE.Mesh(new THREE.CircleGeometry(width / 2, 16, 0, Math.PI), gate);
    const facing = Math.atan2(-x / (rx * rx), -z / (rz * rz));
    for (const [mesh, y] of [[opening, (height - width / 2) / 2], [top, height - width / 2]]) {
      mesh.position.set(x, y, z);
      mesh.rotation.y = facing;
      place.add(mesh);
    }
    // A bronze grille across the big gates.
    if (big) {
      for (let bar = -4; bar <= 4; bar += 1) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, height - 0.1, 6), stone(0x4a3a24, { metalness: 0.6, roughness: 0.4 }));
        const along = new THREE.Vector3(Math.cos(facing), 0, -Math.sin(facing)).multiplyScalar((bar * width) / 10);
        rod.position.set(x + along.x, (height - 0.1) / 2, z + along.z);
        place.add(rod);
      }
    }
  }
  // The cavea: tiers of seats rising back from the podium, and a crowd on them.
  const tiers = 9;
  const tierStone = [0xd9c6a3, 0xcdb894];
  const crowdSpots = [];
  for (let tier = 0; tier < tiers; tier += 1) {
    const inner = 1.04 + tier * 0.075;
    const outer = inner + 0.075;
    const y = podiumHeight + 0.2 + tier * 0.62;
    const tread = new THREE.Mesh(oval(new THREE.RingGeometry(inner, outer, 96, 1).rotateX(-Math.PI / 2)), stone(tierStone[tier % 2], { side: THREE.DoubleSide }));
    tread.position.y = y;
    const riser = new THREE.Mesh(oval(new THREE.CylinderGeometry(inner, inner, 0.62, 96, 1, true)), stone(0xb9a37d, { side: THREE.DoubleSide }));
    riser.position.y = y - 0.31;
    tread.receiveShadow = true;
    place.add(tread, riser);
    // An aisle every so often; the rest of the tier is filled.
    const seats = Math.round(150 + tier * 14);
    for (let seat = 0; seat < seats; seat += 1) {
      const angle = (seat / seats) * Math.PI * 2 + tier * 0.013;
      if (Math.abs(Math.sin(angle * 8)) < 0.12 || Math.random() < 0.18) continue;
      const radius = (inner + outer) / 2;
      crowdSpots.push([Math.cos(angle) * rx * radius, y, Math.sin(angle) * rz * radius, angle]);
    }
  }
  // The crowd: small robed figures in many colours, looking down at the sand.
  const robes = [0xe8e2d4, 0xc23b2a, 0x6b4a8a, 0x2e5f8a, 0xd9a441, 0x7a8a4a, 0xb7b1a4, 0x8a3a2a, 0xf0ece2];
  const bodies = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 0.8, 6), stone(0xffffff, { roughness: 0.9 }), crowdSpots.length);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), stone(0xffffff, { roughness: 0.8 }), crowdSpots.length);
  const placer = new THREE.Object3D();
  const skins = [0xe0b48c, 0xc48c64, 0x9a6a46, 0x6e4a32, 0xf0c8a0];
  crowdSpots.forEach(([x, y, z], index) => {
    placer.position.set(x, y + 0.4, z);
    placer.rotation.set(0, 0, 0);
    placer.scale.setScalar(0.9 + Math.random() * 0.25);
    placer.updateMatrix();
    bodies.setMatrixAt(index, placer.matrix);
    bodies.setColorAt(index, new THREE.Color(robes[Math.floor(Math.random() * robes.length)]));
    placer.position.y = y + 0.92;
    placer.updateMatrix();
    heads.setMatrixAt(index, placer.matrix);
    heads.setColorAt(index, new THREE.Color(skins[Math.floor(Math.random() * skins.length)]));
  });
  place.add(bodies, heads);
  // The outer wall: tiers of arches, and the attic storey above them.
  const top = podiumHeight + 0.2 + tiers * 0.62;
  const outerRadius = 1.04 + tiers * 0.075 + 0.08;
  const arches = paintedTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#d8c4a0';
    g.fillRect(0, 0, w, h);
    for (let storey = 0; storey < 2; storey += 1) {
      const y0 = storey * (h / 2);
      for (let x = 0; x < w; x += 64) {
        g.fillStyle = 'rgba(40,30,20,0.85)';
        g.beginPath();
        g.moveTo(x + 14, y0 + h / 2 - 8);
        g.lineTo(x + 14, y0 + 34);
        g.arc(x + 32, y0 + 34, 18, Math.PI, 0);
        g.lineTo(x + 50, y0 + h / 2 - 8);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(120,95,65,0.6)';
        g.fillRect(x + 2, y0 + 6, 6, h / 2 - 14);
      }
      g.fillStyle = 'rgba(120,95,65,0.7)';
      g.fillRect(0, y0 + h / 2 - 8, w, 8);
    }
  }, [28, 1]);
  const facade = new THREE.Mesh(oval(new THREE.CylinderGeometry(outerRadius, outerRadius, 7, 96, 1, true)), stone(0xffffff, { map: arches, side: THREE.DoubleSide }));
  facade.position.y = top + 3.5;
  place.add(facade);
  // Velarium masts round the top.
  for (let mast = 0; mast < 40; mast += 1) {
    const angle = (mast / 40) * Math.PI * 2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3, 6), stone(0x6a4a2a));
    pole.position.set(Math.cos(angle) * rx * outerRadius, top + 8.5, Math.sin(angle) * rz * outerRadius);
    place.add(pole);
  }
  // Ground beyond, under the stands.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), stone(0xb9a07a));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  place.add(ground);
  return place;
}

/** A canvas texture: tiles, a station name, a warning strip. */
function paintedTexture(width, height, paint, repeat = [1, 1]) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 4;
  return texture;
}

/**
 * A New York platform at night: concrete floor, the yellow tactile strip at
 * the edge, the track bed and a train standing at it, a row of painted
 * I-beam columns, a tiled wall with the station's mosaic name band, and
 * fluorescent tubes. The fight's arena is the strip of platform between the
 * wall and the edge (z from −halfZ to +halfZ).
 */
function buildSubway(arena) {
  const place = new THREE.Group();
  const length = 26;
  const wallZ = -(arena.halfZ + 0.9);
  const edgeZ = arena.halfZ + 0.75;
  const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...options });

  // Platform slab and its worn, speckled concrete.
  const concrete = paintedTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#8a8b85';
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 1600; index += 1) {
      g.fillStyle = `rgba(${40 + Math.random() * 60},${40 + Math.random() * 60},${40 + Math.random() * 55},${0.08 + Math.random() * 0.15})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    g.strokeStyle = 'rgba(50,50,48,0.35)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
  }, [length / 2, (edgeZ - wallZ) / 2]);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(length, 1.2, edgeZ - wallZ), mat(0xffffff, { map: concrete }));
  slab.position.set(0, -0.6, (edgeZ + wallZ) / 2);
  slab.receiveShadow = true;
  place.add(slab);
  // Yellow tactile warning strip, raised domes and all, then the white edge.
  const tactile = paintedTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#e8b50f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c99a08';
    for (let row = 0; row < 4; row += 1) for (let col = 0; col < 4; col += 1) {
      g.beginPath();
      g.arc(8 + col * 16 + (row % 2) * 8, 8 + row * 16, 4.5, 0, Math.PI * 2);
      g.fill();
    }
  }, [length / 0.3, 2]);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(length, 0.012, 0.6), mat(0xffffff, { map: tactile, roughness: 0.6 }));
  strip.position.set(0, 0.006, edgeZ - 0.38);
  strip.receiveShadow = true;
  place.add(strip);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(length, 0.02, 0.08), mat(0xe9e6dc));
  lip.position.set(0, 0.01, edgeZ - 0.04);
  place.add(lip);

  // Track bed: ballast, ties, running rails, the covered third rail.
  const bed = new THREE.Mesh(new THREE.BoxGeometry(length, 0.1, 3.4), mat(0x2a2620, { roughness: 1 }));
  bed.position.set(0, -1.25, edgeZ + 1.7);
  place.add(bed);
  for (let x = -length / 2; x < length / 2; x += 0.6) {
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 2.4), mat(0x3a2f25));
    tie.position.set(x, -1.17, edgeZ + 1.7);
    place.add(tie);
  }
  for (const offset of [-0.72, 0.72]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.08, 0.07), mat(0x8c8d90, { metalness: 0.7, roughness: 0.35 }));
    rail.position.set(0, -1.1, edgeZ + 1.7 + offset);
    place.add(rail);
  }
  const third = new THREE.Mesh(new THREE.BoxGeometry(length, 0.1, 0.22), mat(0x6e5a2c));
  third.position.set(0, -1.05, edgeZ + 0.45);
  place.add(third);

  // The train at the platform: brushed steel car bodies, dark window bands,
  // doors, a blue stripe and the route bullet.
  const steel = mat(0xb9bec4, { metalness: 0.75, roughness: 0.32 });
  const glass = mat(0x10151a, { metalness: 0.3, roughness: 0.15, emissive: 0x1c2a22, emissiveIntensity: 0.6 });
  const trainZ = edgeZ + 1.75;
  for (const carX of [-7.8, 7.8]) {
    const car = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.BoxGeometry(15.4, 3.1, 2.9), steel);
    shell.position.y = 0.5;
    car.add(shell);
    const band = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.75, 0.02), glass);
    band.position.set(0, 1.0, -1.46);
    car.add(band);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.1, 0.02), mat(0x1d4fa3));
    stripe.position.set(0, 0.45, -1.465);
    car.add(stripe);
    for (let door = -2; door <= 2; door += 1) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.0, 0.03), mat(0xa9aeb4, { metalness: 0.7, roughness: 0.3 }));
      panel.position.set(door * 3.1, 0.05, -1.47);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.02), glass);
      pane.position.set(door * 3.1 - 0.3, 0.55, -1.49);
      const pane2 = pane.clone();
      pane2.position.x = door * 3.1 + 0.3;
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.0, 0.035), mat(0x2a2d31));
      seam.position.set(door * 3.1, 0.05, -1.48);
      car.add(panel, pane, pane2, seam);
    }
    car.position.set(carX, 0, trainZ);
    car.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = false;
        object.receiveShadow = true;
      }
    });
    place.add(car);
  }

  // Columns: I-beams painted dark green, a white band at eye level.
  const columnPaint = mat(0x24443a, { roughness: 0.55, metalness: 0.2 });
  for (let x = -length / 2 + 2; x < length / 2; x += 4.6) {
    const column = new THREE.Group();
    const web = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.3, 0.26), columnPaint);
    const flangeA = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.3, 0.04), columnPaint);
    flangeA.position.z = 0.13;
    const flangeB = flangeA.clone();
    flangeB.position.z = -0.13;
    const bandWhite = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), mat(0xe8e5da));
    bandWhite.position.y = 0.1;
    column.add(web, flangeA, flangeB, bandWhite);
    column.position.set(x, 1.65, edgeZ - 1.0);
    column.traverse((object) => { if (object.isMesh) object.castShadow = true; });
    place.add(column);
  }

  // The wall: cream tiles, a maroon-and-green mosaic band with the name.
  const tiles = paintedTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#e9e2cf';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b9b19d';
    g.lineWidth = 2;
    for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let index = 0; index < 120; index += 1) {
      g.fillStyle = `rgba(120,100,70,${Math.random() * 0.12})`;
      g.fillRect(Math.random() * w, Math.random() * h, 6, 3);
    }
  }, [length / 1.6, 2]);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(length, 3.4), mat(0xffffff, { map: tiles, roughness: 0.5 }));
  wall.position.set(0, 1.7, wallZ);
  wall.receiveShadow = true;
  place.add(wall);
  const name = paintedTexture(1024, 128, (g, w, h) => {
    g.fillStyle = '#6b1f24';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f5a3d';
    for (let x = 0; x < w; x += 24) g.fillRect(x, 0, 12, 14), g.fillRect(x + 12, h - 14, 12, 14);
    g.fillStyle = '#efe6cc';
    g.fillRect(140, 26, w - 280, h - 52);
    g.fillStyle = '#1d1a17';
    g.font = 'bold 64px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('CANAL  ST', w / 2, h / 2 + 3);
  });
  for (const x of [-6.5, 6.5]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.52), mat(0xffffff, { map: name, roughness: 0.4 }));
    sign.position.set(x, 2.15, wallZ + 0.01);
    place.add(sign);
  }
  const trim = new THREE.Mesh(new THREE.BoxGeometry(length, 0.16, 0.03), mat(0x2f5a3d));
  trim.position.set(0, 2.85, wallZ + 0.015);
  place.add(trim);
  // A bench against the wall and a trash can by a column.
  const bench = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.42), mat(0x6b4a2b, { roughness: 0.7 }));
  seat.position.y = 0.46;
  bench.add(seat);
  for (const leg of [-0.95, 0.95]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 0.38), mat(0x2b2d31, { metalness: 0.5 }));
    post.position.set(leg, 0.23, 0);
    bench.add(post);
  }
  bench.position.set(-2.8, 0, wallZ + 0.3);
  bench.traverse((object) => { if (object.isMesh) object.castShadow = true; });
  place.add(bench);
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.85, 16, 1, true), mat(0x3b5f45, { side: THREE.DoubleSide, metalness: 0.3 }));
  can.position.set(4.4, 0.43, wallZ + 0.4);
  can.castShadow = true;
  place.add(can);

  // Ceiling and fluorescent tubes; a few lights so the platform reads.
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(length, edgeZ - wallZ + 4), mat(0x1a1d1b, { side: THREE.DoubleSide }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 3.4, (edgeZ + wallZ) / 2 + 1.5);
  place.add(ceiling);
  const tube = new THREE.MeshStandardMaterial({ color: 0xf4fff4, emissive: 0xe8fff0, emissiveIntensity: 1.4 });
  for (let x = -length / 2 + 1.5; x < length / 2; x += 3.2) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.1), tube);
    light.position.set(x, 3.3, 0);
    place.add(light);
  }
  for (const x of [-5, 0, 5]) {
    const glow = new THREE.PointLight(0xe6ffe8, 0.55, 9, 1.6);
    glow.position.set(x, 3.0, 0);
    place.add(glow);
  }
  return place;
}

/**
 * A Sengoku battlefield: trampled grass between two camps, each with its
 * white curtain (jin-maku) bearing a crest and its tall nobori banners in
 * the side's colour; a bamboo palisade, pines, the mountains, and a castle
 * on a far hill, under a day sky.
 */
/**
 * The plain below the volcanoes: dry grass, maguey and nopal, the snowy
 * cones of Popocatépetl and Iztaccíhuatl far off.
 */
function buildPlain() {
  const place = new THREE.Group();
  const lit = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...options });
  place.add(daySky());
  const field = paintedTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#a49a5a';
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 18000; index += 1) {
      const shade = Math.random();
      g.fillStyle = `rgba(${140 + shade * 60},${130 + shade * 50},${70 + shade * 30},${0.2 + Math.random() * 0.3})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 4);
    }
  }, [5, 5]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), lit(0xffffff, { map: field }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  place.add(ground);
  // The volcanoes, snow on their crowns, and a ring of lower hills.
  [[-20, -55, 20, 22], [12, -58, 17, 18]].forEach(([x, z, radius, tall]) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, tall, 14), lit(0x6a6f7a));
    cone.position.set(x, tall / 2 - 1, z);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.32, tall * 0.32, 14), lit(0xf2f4f8));
    snow.position.set(x, tall - 1 - tall * 0.16, z);
    place.add(cone, snow);
  });
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(9 + Math.random() * 6, 4 + Math.random() * 4, 8), lit(0x8a8a62));
    hill.position.set(Math.cos(angle) * 52, 1.5, Math.sin(angle) * 50);
    place.add(hill);
  }
  // Maguey (a rosette of spiky leaves) and nopal about the field.
  const agave = lit(0x6a8a6a);
  for (let index = 0; index < 22; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const reach = 17 + Math.random() * 14;
    const plant = new THREE.Group();
    for (let leaf = 0; leaf < 9; leaf += 1) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.09, 1.2, 4), agave);
      const turn = (leaf / 9) * Math.PI * 2;
      blade.position.set(Math.cos(turn) * 0.25, 0.5, Math.sin(turn) * 0.25);
      blade.rotation.set(Math.sin(turn) * 0.6, 0, -Math.cos(turn) * 0.6);
      plant.add(blade);
    }
    plant.position.set(Math.cos(angle) * reach, 0, Math.sin(angle) * reach * 0.8);
    plant.scale.setScalar(0.8 + Math.random() * 0.8);
    place.add(plant);
  }
  return place;
}

/**
 * A sandy shore by the sea: the beach, the water to the horizon, and behind
 * the fighting either a fort of red brick with bastions (Zeelandia) or a
 * coastal village of whitewashed houses under grey tile (Zhejiang).
 */
function buildCoast({ fort }) {
  const place = new THREE.Group();
  const lit = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...options });
  place.add(daySky());
  const sandTexture = paintedTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#d8c79a';
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 16000; index += 1) {
      const shade = Math.random();
      g.fillStyle = `rgba(${190 + shade * 40},${170 + shade * 40},${120 + shade * 40},${0.25 + Math.random() * 0.3})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, [5, 5]);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(70, 130), lit(0xffffff, { map: sandTexture }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.x = -10;
  sand.receiveShadow = true;
  place.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ color: 0x2f6a8a, roughness: 0.25, metalness: 0.1 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(95, -0.05, 0);
  place.add(sea);
  if (fort) {
    // The fort on its rise: a square of red brick, bastions at the corners, the flag.
    const brick = lit(0x9a4a32);
    const walls = new THREE.Group();
    const core = new THREE.Mesh(new THREE.BoxGeometry(18, 6, 18), brick);
    core.position.y = 3;
    walls.add(core);
    for (const [x, z] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) {
      const bastion = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.2, 6.4, 4), brick);
      bastion.rotation.y = Math.PI / 4;
      bastion.position.set(x, 3.2, z);
      walls.add(bastion);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 6), lit(0x3a2a1c));
    pole.position.set(0, 10, 0);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshStandardMaterial({ color: 0xd06a1a, side: THREE.DoubleSide }));
    flag.position.set(1.5, 13, 0);
    walls.add(pole, flag);
    walls.position.set(-8, 0, -42);
    place.add(walls);
  } else {
    // A fishing village: low houses, white walls, grey tiled roofs, boats drawn up.
    const wall = lit(0xe8e2d4);
    const tile = lit(0x4a4e56);
    for (let index = 0; index < 9; index += 1) {
      const house = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), wall);
      body.position.y = 1.5;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 1.6, 4), tile);
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(1.3, 1, 1);
      roof.position.y = 3.8;
      house.add(body, roof);
      house.position.set(-30 + (index % 3) * 8, 0, -30 + Math.floor(index / 3) * 9 + (index % 2) * 2);
      place.add(house);
    }
    for (let index = 0; index < 4; index += 1) {
      const boat = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 2), lit(0x5a3a22));
      boat.position.set(24, 0.4, -12 + index * 7);
      boat.rotation.y = 0.3;
      place.add(boat);
    }
  }
  return place;
}

function buildSengoku() {
  const place = new THREE.Group();
  const lit = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...options });
  const shaded = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  place.add(daySky());
  // Grass in autumn, trampled to earth across the middle.
  const field = paintedTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#7d8a4a';
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 20000; index += 1) {
      const shade = Math.random();
      g.fillStyle = `rgba(${110 + shade * 70},${120 + shade * 60},${50 + shade * 30},${0.2 + Math.random() * 0.3})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 5);
    }
    for (let index = 0; index < 60; index += 1) {
      g.fillStyle = `rgba(110,88,58,${0.12 + Math.random() * 0.2})`;
      g.beginPath();
      g.ellipse(w * (0.2 + Math.random() * 0.6), h * (0.3 + Math.random() * 0.4), 20 + Math.random() * 90, 10 + Math.random() * 40, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }, [5, 5]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), lit(0xffffff, { map: field }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  place.add(ground);
  // Mountains and the castle on its hill, far off.
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2 + 0.2;
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(10 + Math.random() * 6, 9 + Math.random() * 7, 7), lit(0x6a7a88));
    mountain.position.set(Math.cos(angle) * 46, 3, Math.sin(angle) * 44);
    place.add(mountain);
  }
  const castle = new THREE.Group();
  const hill = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lit(0x5f7040));
  hill.scale.y = 0.45;
  castle.add(hill);
  const white = lit(0xece6d6);
  const roof = lit(0x30343a);
  [[6, 2.2, 4.1], [4.6, 1.8, 6.3], [3.2, 1.6, 8.2]].forEach(([size, tall, at]) => {
    const storey = new THREE.Mesh(new THREE.BoxGeometry(size, tall, size * 0.8), white);
    storey.position.y = at;
    const eaves = new THREE.Mesh(new THREE.ConeGeometry(size * 0.85, 1.1, 4), roof);
    eaves.rotation.y = Math.PI / 4;
    eaves.scale.z = 0.8;
    eaves.position.y = at + tall / 2 + 0.4;
    castle.add(storey, eaves);
  });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.6, 2.2, 4), lit(0x8a8478));
  base.rotation.y = Math.PI / 4;
  base.position.y = 2.6;
  castle.add(base);
  castle.position.set(-6, 0, -40);
  place.add(castle);
  // Pines about the field.
  const needles = lit(0x2a4430);
  const bark = lit(0x4a3626);
  for (let index = 0; index < 18; index += 1) {
    const angle = (index / 18) * Math.PI * 2 + Math.random() * 0.2;
    const reach = 19 + Math.random() * 9;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 3.2, 6), bark);
    trunk.position.y = 1.6;
    tree.add(trunk);
    for (let tier = 0; tier < 3; tier += 1) {
      const crown = shaded(new THREE.Mesh(new THREE.ConeGeometry(1.8 - tier * 0.45, 1.6, 7), needles));
      crown.position.y = 3 + tier * 1.05;
      tree.add(crown);
    }
    tree.position.set(Math.cos(angle) * reach, 0, Math.sin(angle) * reach * 0.8);
    tree.scale.setScalar(0.8 + Math.random() * 0.6);
    place.add(tree);
  }
  // Each side's camp: the curtain with its crest, and its banners.
  const crestCurtain = (crest) => paintedTexture(512, 128, (g, w, h) => {
    g.fillStyle = '#efeadc';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(30,30,34,0.85)';
    for (const y of [h * 0.08, h * 0.88]) g.fillRect(0, y, w, h * 0.06);
    for (let x = w / 6; x < w; x += w / 3) {
      g.beginPath();
      g.arc(x, h / 2, h * 0.24, 0, Math.PI * 2);
      g.fillStyle = crest;
      g.fill();
      g.fillStyle = '#efeadc';
      g.beginPath();
      g.arc(x, h / 2, h * 0.12, 0, Math.PI * 2);
      g.fill();
    }
  });
  const pole = lit(0x3a2a1c);
  for (const [side, colour] of [[-1, '#b3161b'], [1, '#1f3f8a']]) {
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.8), new THREE.MeshStandardMaterial({ map: crestCurtain(colour), side: THREE.DoubleSide, roughness: 0.95 }));
    curtain.position.set(side * 14.5, 1.3, 0);
    curtain.rotation.y = Math.PI / 2;
    place.add(curtain);
    for (let post = -7; post <= 7; post += 3.5) {
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 6), pole);
      stake.position.set(side * 14.5, 1.2, post);
      place.add(stake);
    }
    // Nobori: tall narrow banners, the side's colour with a white crest.
    const banner = paintedTexture(64, 256, (g, w, h) => {
      g.fillStyle = colour;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#efeadc';
      g.beginPath();
      g.arc(w / 2, h * 0.18, w * 0.3, 0, Math.PI * 2);
      g.fill();
      g.fillRect(w * 0.42, h * 0.32, w * 0.16, h * 0.6);
    });
    const cloth = new THREE.MeshStandardMaterial({ map: banner, side: THREE.DoubleSide, roughness: 0.9 });
    for (let index = 0; index < 7; index += 1) {
      const z = -9 + index * 3;
      const x = side * (12.4 + (index % 2) * 0.8);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 5.2, 6), pole);
      mast.position.set(x, 2.6, z);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 3), cloth);
      flag.position.set(x, 3.3, z + 0.4);
      flag.rotation.y = Math.PI / 2 + side * 0.25;
      place.add(mast, flag);
    }
  }
  // A bamboo palisade along both flanks, gapped.
  const bamboo = lit(0x8a8a4a);
  for (const z of [-9.5, 9.5]) {
    for (let x = -11; x <= 11; x += 0.32) {
      if (Math.abs(x) < 1.6) continue;
      const cane = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6 + Math.random() * 0.3, 5), bamboo);
      cane.position.set(x, 0.8, z);
      place.add(cane);
    }
    for (const y of [0.5, 1.2]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(22, 0.06, 0.06), bamboo);
      rail.position.set(0, y, z + (z < 0 ? 0.08 : -0.08));
      place.add(rail);
    }
  }
  return place;
}

/** A day sky: a dome painted from deep blue overhead to pale haze at the horizon, with soft high cloud, behind everything and out of the fog. */
function daySky() {
  // The sky: a dome painted from deep blue overhead to pale haze at the
  // horizon, with soft high cloud; drawn behind everything, out of the fog.
  const skyTexture = paintedTexture(1024, 512, (g, w, h) => {
    const gradient = g.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#2e6cc2');
    gradient.addColorStop(0.3, '#4f8fdb');
    gradient.addColorStop(0.44, '#86b6e6');
    gradient.addColorStop(0.5, '#cfe2f3');
    gradient.addColorStop(1, '#dfe9f2');
    g.fillStyle = gradient;
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 18; index += 1) {
      const x = Math.random() * w;
      const y = h * (0.22 + Math.random() * 0.22);
      const size = 25 + Math.random() * 55;
      for (let puff = 0; puff < 9; puff += 1) {
        const glow = g.createRadialGradient(x + (Math.random() - 0.5) * size * 1.6, y + (Math.random() - 0.5) * size * 0.3, 0, x, y, size);
        glow.addColorStop(0, 'rgba(255,255,255,0.22)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = glow;
        g.fillRect(x - size * 2, y - size, size * 4, size * 2);
      }
    }
  });
  skyTexture.wrapT = THREE.ClampToEdgeWrapping;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(52, 32, 16), new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  return sky;
}

/**
 * A medieval market square at noon: cobbles, timber-framed houses on every
 * side (jettied upper floors, limewash, steep tiled roofs, chimneys) with
 * streets running off between them, the church tower and spire over the
 * roofs, and the market about the edges — stalls, a well, the cross, the
 * stocks, barrels, crates, a cart, signs and bunting — under a bright sky.
 */
function buildTown() {
  const place = new THREE.Group();
  const lit = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...options });
  const shaded = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  const box = (size, at, material, turn = 0) => {
    const mesh = shaded(new THREE.Mesh(new THREE.BoxGeometry(...size), material));
    mesh.position.set(...at);
    mesh.rotation.y = turn;
    return mesh;
  };
  const halfX = 12.5;
  const halfZ = 10.5;
  /** A pitched roof: a triangular prism `width` across, `length` along z, `pitch` high, centred on its centroid. */
  const gable = (width, length, pitch, material) => {
    const radius = width / Math.sqrt(3) * 1.05;
    const mesh = shaded(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 3, 1), material));
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.z = pitch / (1.5 * radius);
    return mesh;
  };

  place.add(daySky());

  // Cobbles: rounded setts in grey and brown, worn paler down the middle.
  const cobbles = paintedTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#5c564d';
    g.fillRect(0, 0, w, h);
    for (let row = 0; row < 40; row += 1) {
      for (let column = 0; column < 40; column += 1) {
        const x = (column + (row % 2) * 0.5) * (w / 40) + (Math.random() - 0.5) * 4;
        const y = row * (h / 40) + (Math.random() - 0.5) * 4;
        const tone = 120 + Math.random() * 60;
        g.fillStyle = `rgb(${tone},${tone * 0.95},${tone * 0.86})`;
        g.beginPath();
        g.ellipse(x, y, 10 + Math.random() * 3, 9 + Math.random() * 3, Math.random(), 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.beginPath();
        g.ellipse(x - 3, y - 3, 5, 4, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (let index = 0; index < 300; index += 1) {
      g.fillStyle = `rgba(70,60,45,${Math.random() * 0.25})`;
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 20, 0, Math.PI * 2);
      g.fill();
    }
  }, [6, 6]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), lit(0xffffff, { map: cobbles, roughness: 0.85 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  place.add(ground);

  // House fronts: limewash between dark oak framing, leaded windows, a door.
  const LIMEWASH = ['#efe6d2', '#e8d7a8', '#e9c8b4', '#d8d0bd', '#f2ead8', '#d9b98a'];
  const facade = (wash, storeys, seed) => paintedTexture(256, 128 * storeys, (g, w, h) => {
    g.fillStyle = wash;
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 500; index += 1) {
      g.fillStyle = `rgba(120,100,70,${Math.random() * 0.06})`;
      g.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 10, 2 + Math.random() * 6);
    }
    g.fillStyle = '#3b2a1c';
    const beam = 9;
    const floor = h / storeys;
    for (let level = 0; level <= storeys; level += 1) g.fillRect(0, Math.min(h - beam, level * floor), w, beam);
    for (const x of [0, w / 3, (2 * w) / 3, w - beam]) g.fillRect(x, 0, beam, h);
    // Braces and close studding, differing a little house to house.
    g.lineWidth = 8;
    g.strokeStyle = '#3b2a1c';
    for (let level = 0; level < storeys; level += 1) {
      const top = level * floor;
      if ((seed + level) % 2 === 0) {
        g.beginPath();
        g.moveTo(0, top + floor);
        g.lineTo(w / 3, top);
        g.moveTo(w, top + floor);
        g.lineTo((2 * w) / 3, top);
        g.stroke();
      } else {
        for (let x = 22; x < w; x += 28) g.fillRect(x, top, 6, floor);
      }
    }
    // Windows: small leaded panes, the shop window and door on the ground floor.
    const pane = (x, y, width, height) => {
      g.fillStyle = '#2a3440';
      g.fillRect(x, y, width, height);
      g.strokeStyle = 'rgba(200,190,150,0.6)';
      g.lineWidth = 1.5;
      for (let along = x; along < x + width; along += 7) {
        g.beginPath();
        g.moveTo(along, y);
        g.lineTo(along + height * 0.5, y + height);
        g.stroke();
      }
      g.fillStyle = '#4a3422';
      g.fillRect(x - 3, y + height, width + 6, 5);
    };
    for (let level = 1; level < storeys; level += 1) {
      pane(w * 0.12, h - (level + 1) * floor + floor * 0.3, w * 0.22, floor * 0.36);
      pane(w * 0.62, h - (level + 1) * floor + floor * 0.3, w * 0.22, floor * 0.36);
    }
    g.fillStyle = '#4a2f1c';
    g.fillRect(w * 0.4, h - floor * 0.8, w * 0.2, floor * 0.8);
    g.fillStyle = '#2b1a10';
    g.fillRect(w * 0.42, h - floor * 0.76, w * 0.16, floor * 0.76);
    pane(w * 0.08, h - floor * 0.7, w * 0.25, floor * 0.4);
  });
  const oak = lit(0x3b2a1c);
  const roofs = [lit(0x9a4a32), lit(0x8a3f2c), lit(0x5e5a58), lit(0xa45a3a), lit(0x6e4a36)];
  const plaster = LIMEWASH.map((wash) => lit(wash));
  const signs = lit(0x6a4a2c);
  let seed = 0;
  /** A house fronting the square: width along the frontage, storeys, which way it faces. */
  const house = (x, z, turn, width, storeys) => {
    seed += 1;
    const group = new THREE.Group();
    const depth = 6;
    const storey = 2.6;
    const wash = seed % LIMEWASH.length;
    const front = lit(0xffffff, { map: facade(LIMEWASH[wash], storeys, seed) });
    const sides = plaster[wash];
    const height = storey * storeys;
    const body = shaded(new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), [sides, sides, sides, sides, front, sides]));
    body.position.set(0, height / 2, 0);
    group.add(body);
    // The jetty: the upper storeys oversail the street on a beam.
    if (storeys > 1) group.add(box([width + 0.1, 0.22, 0.3], [0, storey, depth / 2 + 0.05], oak));
    // A steep gable roof, ridge running back from the square.
    const pitch = 0.6 * width + 0.6;
    const roof = gable(width, depth + 0.6, pitch, roofs[seed % roofs.length]);
    roof.position.set(0, height + pitch * 0.33, 0);
    group.add(roof);
    group.add(box([0.55, 1.6, 0.55], [width * 0.25 * (seed % 2 ? 1 : -1), height + pitch * 0.55, -depth * 0.2], lit(0x7a4a36)));
    // A hanging sign on a bracket over every other door.
    if (seed % 2 === 0) {
      group.add(box([0.06, 0.06, 0.9], [width * 0.3, storey * 0.95, depth / 2 + 0.45], oak));
      group.add(box([0.05, 0.5, 0.6], [width * 0.3, storey * 0.75, depth / 2 + 0.7], signs));
    }
    group.position.set(x, 0, z);
    group.rotation.y = turn;
    place.add(group);
  };
  // Four rows round the square, each broken by a street running off.
  const row = (length, build, turn, gapAt) => {
    let along = -length / 2;
    while (along < length / 2 - 2) {
      const width = 3.2 + ((seed * 7) % 5) * 0.4;
      const middle = along + width / 2;
      if (Math.abs(middle - gapAt) > 2.6) build(middle, turn, width, 2 + ((seed * 3) % 3 === 0 ? 1 : 0));
      along += width + 0.05;
    }
  };
  row(halfX * 2 + 8, (along, turn, width, storeys) => house(along, -halfZ - 3, turn, width, storeys), 0, 2);
  row(halfX * 2 + 8, (along, turn, width, storeys) => house(along, halfZ + 3, turn, width, storeys), Math.PI, -4);
  row(halfZ * 2, (along, turn, width, storeys) => house(-halfX - 3, along, turn, width, storeys), Math.PI / 2, -1);
  row(halfZ * 2, (along, turn, width, storeys) => house(halfX + 3, along, turn, width, storeys), -Math.PI / 2, 3);
  // Beyond the streets: more roofs, the town going on.
  for (let index = 0; index < 22; index += 1) {
    const angle = (index / 22) * Math.PI * 2;
    const reach = 26 + Math.random() * 10;
    const width = 4 + Math.random() * 3;
    const tall = 5 + Math.random() * 3;
    const block = new THREE.Group();
    block.add(box([width, tall, 6], [0, tall / 2, 0], plaster[index % plaster.length]));
    const roof = gable(width, 6.4, width * 0.6 + 0.6, roofs[index % roofs.length]);
    roof.position.y = tall + (width * 0.6 + 0.6) / 3;
    block.add(roof);
    block.position.set(Math.cos(angle) * reach, 0, Math.sin(angle) * reach * 0.85);
    block.rotation.y = -angle + Math.PI / 2;
    place.add(block);
  }

  // The church over the north roofs: nave, tower with battlements, spire.
  const stone = lit(0xa49b8a, { roughness: 1 });
  const church = new THREE.Group();
  church.add(box([7, 9, 16], [0, 4.5, 0], stone));
  const naveRoof = gable(7, 16.4, 4.5, lit(0x5e5a58));
  naveRoof.position.y = 9 + 4.5 / 3;
  church.add(naveRoof);
  church.add(box([5, 20, 5], [0, 10, 9], stone));
  for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2], [0, -2.2], [0, 2.2], [-2.2, 0], [2.2, 0]]) church.add(box([0.6, 0.9, 0.6], [dx, 20.4, 9 + dz], stone));
  const spire = shaded(new THREE.Mesh(new THREE.ConeGeometry(2.4, 11, 8), lit(0x50575c)));
  spire.position.set(0, 25.5, 9);
  church.add(spire);
  for (const z of [-5, -1, 3]) church.add(box([7.1, 2.6, 0.8], [0, 5, z], lit(0x2c3038)));
  church.position.set(-4, 0, -halfZ - 22);
  place.add(church);

  // The market about the edges of the square.
  const canvasStripes = (a, b) => paintedTexture(128, 64, (g, w, h) => {
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = (x / 16) % 2 ? a : b;
      g.fillRect(x, 0, 16, h);
    }
  });
  const stall = (x, z, turn, colours, goods) => {
    const group = new THREE.Group();
    group.add(box([2.4, 0.9, 1.1], [0, 0.45, 0], lit(0x7a5a38)));
    for (const [dx, dz] of [[-1.15, -0.5], [1.15, -0.5], [-1.15, 0.5], [1.15, 0.5]]) group.add(box([0.08, 2.2, 0.08], [dx, 1.1, dz], oak));
    const awning = shaded(new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.05, 1.6), lit(0xffffff, { map: canvasStripes(...colours) })));
    awning.position.set(0, 2.25, 0.15);
    awning.rotation.x = 0.18;
    group.add(awning);
    for (let index = 0; index < 9; index += 1) {
      const item = shaded(new THREE.Mesh(new THREE.SphereGeometry(0.1 + Math.random() * 0.06, 8, 6), lit(goods[index % goods.length])));
      item.position.set(-0.9 + (index % 5) * 0.45, 0.98, -0.2 + Math.floor(index / 5) * 0.35);
      group.add(item);
    }
    group.position.set(x, 0, z);
    group.rotation.y = turn;
    place.add(group);
  };
  stall(-8, -halfZ + 0.9, 0, ['#b8322a', '#efe6d2'], [0xc0392b, 0x8e9a2a, 0xd8a23a]);
  stall(-4.5, -halfZ + 0.9, 0, ['#2f5a8a', '#efe6d2'], [0xe0c070, 0xb08040, 0xf0e0b0]);
  stall(7.5, halfZ - 0.9, Math.PI, ['#3a7a3a', '#e8d7a8'], [0x7a9a3a, 0xa04030, 0xe0d090]);
  stall(halfX - 1, 3.5, -Math.PI / 2, ['#8a3a7a', '#efe6d2'], [0xd0b080, 0x904020, 0x606060]);
  // The well: a stone drum under a little tiled roof on posts, with its windlass.
  const well = new THREE.Group();
  well.add(shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.9, 16), stone)));
  well.children[0].position.y = 0.45;
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.75, 16), lit(0x1c2a30, { roughness: 0.2 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.7;
  well.add(water);
  for (const dx of [-0.85, 0.85]) well.add(box([0.12, 2.2, 0.12], [dx, 1.1, 0], oak));
  well.add(box([1.9, 0.1, 0.1], [0, 1.7, 0], oak));
  // The roof's ridge along the windlass.
  const wellRoof = gable(1.9, 1.6, 0.8, roofs[0]);
  wellRoof.position.y = 2.2 + 0.8 / 3;
  const ridge = new THREE.Group();
  ridge.rotation.y = Math.PI / 2;
  ridge.add(wellRoof);
  well.add(ridge);
  well.position.set(-halfX + 1.6, 0, halfZ - 1.8);
  place.add(well);
  // The market cross: a shaft on stepped stone.
  const cross = new THREE.Group();
  cross.add(box([2.4, 0.3, 2.4], [0, 0.15, 0], stone), box([1.7, 0.3, 1.7], [0, 0.45, 0], stone), box([1, 0.3, 1], [0, 0.75, 0], stone));
  cross.add(box([0.3, 3.2, 0.3], [0, 2.5, 0], stone), box([1.1, 0.25, 0.25], [0, 3.6, 0], stone));
  cross.position.set(halfX - 1.6, 0, -halfZ + 1.8);
  place.add(cross);
  // The stocks.
  const stocks = new THREE.Group();
  stocks.add(box([1.8, 0.35, 0.14], [0, 0.55, 0], oak), box([0.12, 0.8, 0.12], [-0.8, 0.4, 0], oak), box([0.12, 0.8, 0.12], [0.8, 0.4, 0], oak), box([1.6, 0.1, 0.4], [0, 0.35, -0.6], oak));
  stocks.position.set(2, 0, halfZ - 0.8);
  stocks.rotation.y = Math.PI;
  place.add(stocks);
  // Barrels, crates and sacks, a cart, straw.
  const barrelWood = lit(0x7a5230);
  const hoop = lit(0x2c2c2e, { metalness: 0.5, roughness: 0.5 });
  for (const [x, z] of [[-10.6, -3], [-10.8, -2.1], [-10, -2.5], [10.8, -5.5], [3.5, -halfZ + 0.6], [-1.5, halfZ - 0.5]]) {
    const barrel = shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 12), barrelWood));
    barrel.position.set(x, 0.45, z);
    place.add(barrel);
    for (const y of [0.18, 0.72]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.02, 4, 16), hoop);
      band.rotation.x = Math.PI / 2;
      band.position.set(x, y, z);
      place.add(band);
    }
  }
  for (const [x, z, size, turn] of [[-11, 4, 0.7, 0.3], [-11.2, 4.9, 0.55, -0.2], [10.6, 6, 0.7, 0.5], [5, -halfZ + 0.6, 0.6, 0.1]]) place.add(box([size, size, size], [x, size / 2, z], lit(0x8a6a44), turn));
  for (const [x, z] of [[-6.5, halfZ - 0.6], [-6, halfZ - 0.8], [10.9, -6.3]]) {
    const sack = shaded(new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), lit(0xc8b48a)));
    sack.scale.y = 1.3;
    sack.position.set(x, 0.38, z);
    place.add(sack);
  }
  const cart = new THREE.Group();
  cart.add(box([2.2, 0.15, 1.2], [0, 0.75, 0], barrelWood), box([2.2, 0.4, 0.06], [0, 1, 0.6], barrelWood), box([2.2, 0.4, 0.06], [0, 1, -0.6], barrelWood), box([1.8, 0.08, 0.08], [1.9, 0.75, 0.35], oak), box([1.8, 0.08, 0.08], [1.9, 0.75, -0.35], oak));
  for (const side of [0.7, -0.7]) {
    const wheel = shaded(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 16), oak));
    wheel.position.set(-0.2, 0.55, side);
    cart.add(wheel);
    for (let spoke = 0; spoke < 4; spoke += 1) {
      const rod = box([0.04, 1, 0.04], [-0.2, 0.55, side], oak);
      rod.rotation.z = (spoke * Math.PI) / 4;
      cart.add(rod);
    }
  }
  const straw = shaded(new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 6), lit(0xd8b860)));
  straw.scale.set(1.2, 0.45, 0.65);
  straw.position.y = 1.05;
  cart.add(straw);
  cart.position.set(halfX - 1.4, 0, -1.5);
  cart.rotation.y = 0.3;
  place.add(cart);
  // Bunting strung across the square, house to house.
  const flagColours = [0xb8322a, 0xe8d7a8, 0x2f5a8a, 0x3a7a3a, 0xd8a23a].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }));
  const flag = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.11, 0, 0), new THREE.Vector3(0.11, 0, 0), new THREE.Vector3(0, -0.22, 0)]);
  flag.computeVertexNormals();
  // Strung high, from the upper windows, over the heads of everyone and the camera.
  for (const [from, to] of [[[-halfX - 0.5, 7.6, -6], [halfX + 0.5, 7.6, -4]], [[-halfX - 0.5, 7.4, 4], [halfX + 0.5, 7.8, 6]], [[-6, 7.6, -halfZ - 0.5], [-3, 7.6, halfZ + 0.5]]]) {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const count = Math.floor(start.distanceTo(end) / 0.5);
    for (let index = 1; index < count; index += 1) {
      const share = index / count;
      const at = start.clone().lerp(end, share);
      at.y -= Math.sin(share * Math.PI) * 0.7;
      const pennant = new THREE.Mesh(flag, flagColours[index % flagColours.length]);
      pennant.position.copy(at);
      pennant.lookAt(at.x + (end.z - start.z), at.y, at.z - (end.x - start.x));
      place.add(pennant);
    }
  }
  return place;
}

/**
 * A container port at night: wet concrete with painted lines, the quay edge
 * with its bollards over black water, stacks of shipping containers walling
 * the lane, gantry cranes against a starry sky with a moon, and a few
 * sodium lamps throwing dim orange pools.
 */
function buildPort() {
  const place = new THREE.Group();
  const lit = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...options });
  const shaded = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  // The night sky: deep blue to black, stars, a moon low over the water.
  const night = paintedTexture(1024, 512, (g, w, h) => {
    const gradient = g.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#02030a');
    gradient.addColorStop(0.42, '#0b1428');
    gradient.addColorStop(0.5, '#1c2640');
    gradient.addColorStop(1, '#05070c');
    g.fillStyle = gradient;
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 700; index += 1) {
      g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
      g.fillRect(Math.random() * w, Math.random() * h * 0.46, Math.random() < 0.1 ? 2 : 1, 1);
    }
    const moon = g.createRadialGradient(w * 0.28, h * 0.3, 0, w * 0.28, h * 0.3, 60);
    moon.addColorStop(0, 'rgba(240,240,225,1)');
    moon.addColorStop(0.18, 'rgba(230,232,220,1)');
    moon.addColorStop(0.24, 'rgba(160,180,220,0.35)');
    moon.addColorStop(1, 'rgba(60,80,130,0)');
    g.fillStyle = moon;
    g.fillRect(w * 0.28 - 60, h * 0.3 - 60, 120, 120);
  });
  night.wrapT = THREE.ClampToEdgeWrapping;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(52, 32, 16), new THREE.MeshBasicMaterial({ map: night, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  place.add(sky);
  // Concrete apron: stained, damp, with the yard's painted lines.
  const concrete = paintedTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#4a4c50';
    g.fillRect(0, 0, w, h);
    for (let index = 0; index < 4000; index += 1) {
      const tone = 60 + Math.random() * 40;
      g.fillStyle = `rgba(${tone},${tone},${tone + 4},0.25)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 2 + Math.random() * 6);
    }
    for (let index = 0; index < 30; index += 1) {
      g.fillStyle = `rgba(20,22,26,${0.15 + Math.random() * 0.25})`;
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 70, 10 + Math.random() * 40, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(80,80,90,0.5)';
    g.lineWidth = 2;
    for (let x = 0; x < w; x += 128) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    g.fillStyle = 'rgba(210,180,40,0.55)';
    g.fillRect(0, h * 0.5 - 6, w, 12);
  }, [4, 4]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), lit(0xffffff, { map: concrete, roughness: 0.55, metalness: 0.1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  place.add(ground);
  // The quay edge and the water beyond it (+z).
  const edgeZ = 9;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshStandardMaterial({ color: 0x050b14, roughness: 0.12, metalness: 0.7 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -1.6, edgeZ + 30);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(0, -1.7, edgeZ + 30);
  place.add(hole, water);
  // Cut the apron at the quay: a concrete face down to the water.
  ground.geometry = new THREE.PlaneGeometry(80, 40 + edgeZ);
  ground.position.z = edgeZ - (40 + edgeZ) / 2;
  const face = shaded(new THREE.Mesh(new THREE.BoxGeometry(80, 1.7, 0.4), lit(0x3a3c40)));
  face.position.set(0, -0.85, edgeZ + 0.2);
  place.add(face);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(80, 0.04, 0.25), lit(0xd8b028, { roughness: 0.6 }));
  stripe.position.set(0, 0.02, edgeZ - 0.15);
  place.add(stripe);
  const iron = lit(0x1e2024, { metalness: 0.6, roughness: 0.5 });
  for (let x = -24; x <= 24; x += 6) {
    const bollard = shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.6, 12), iron));
    bollard.position.set(x, 0.3, edgeZ - 0.5);
    const cap = shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 12), iron));
    cap.position.set(x, 0.62, edgeZ - 0.5);
    place.add(bollard, cap);
  }
  // A ship's dark hull moored along the quay.
  const hull = shaded(new THREE.Mesh(new THREE.BoxGeometry(46, 6, 9), lit(0x1a2230, { metalness: 0.3, roughness: 0.6 })));
  hull.position.set(6, 1.2, edgeZ + 6);
  place.add(hull);
  for (let index = 0; index < 18; index += 1) {
    const portLight = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8), new THREE.MeshBasicMaterial({ color: 0xffd890 }));
    portLight.position.set(-14 + index * 2.4, 2.6 + (index % 3) * 0.9, edgeZ + 1.45);
    portLight.rotation.y = Math.PI;
    if (index % 4 !== 1) place.add(portLight);
  }
  // Containers: corrugated steel boxes in faded company colours, stacked.
  const CONTAINER = ['#8a2a1e', '#1f4f7a', '#2f6a3a', '#b5651d', '#6a6e74', '#d8d4c8', '#7a2a52', '#1d6a6a'];
  const skins = CONTAINER.map((colour, index) => paintedTexture(256, 128, (g, w, h) => {
    g.fillStyle = colour;
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(x, 0, 3, h);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x + 4, 0, 2, h);
    }
    for (let index2 = 0; index2 < 60; index2 += 1) {
      g.fillStyle = `rgba(90,50,25,${Math.random() * 0.25})`;
      g.fillRect(Math.random() * w, Math.random() * h, 4 + Math.random() * 18, 2 + Math.random() * 10);
    }
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.font = 'bold 22px sans-serif';
    g.fillText(['MAERA', 'KOSCO', 'HAPAG', 'ONELINE', 'EVERGO', 'NYKO', 'CMAS', 'YANGLU'][index], 18, 40);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(0, 0, w, 6);
    g.fillRect(0, h - 6, w, 6);
  }));
  const containerMaterials = skins.map((map) => lit(0xffffff, { map, roughness: 0.6, metalness: 0.35 }));
  const container = (x, z, level, turn, index) => {
    const box = shaded(new THREE.Mesh(new THREE.BoxGeometry(6.06, 2.59, 2.44), containerMaterials[index % containerMaterials.length]));
    box.position.set(x, 1.295 + level * 2.59, z);
    box.rotation.y = turn;
    place.add(box);
  };
  let count = 0;
  // A wall of stacks behind each side of the lane, and rows inland, gapped.
  for (const z of [-7.8, -10.4]) {
    for (let x = -20; x <= 20; x += 6.2) {
      if (Math.abs(x + 4) < 3 && z === -7.8) continue;
      const high = 1 + ((count * 7) % 3);
      for (let level = 0; level < high; level += 1) container(x + (level % 2) * 0.2, z, level, 0, count + level);
      count += 1;
    }
  }
  for (const x of [-12.5, 12.5]) {
    for (let z = -4.5; z <= 4.5; z += 3) {
      const high = 1 + ((count * 5) % 2);
      for (let level = 0; level < high; level += 1) container(x, z, level, Math.PI / 2, count + level * 3);
      count += 1;
    }
  }
  // Pallets and drums by the stacks.
  const drum = lit(0x2a4a7a, { metalness: 0.4, roughness: 0.5 });
  for (const [x, z] of [[-9, -6.4], [-8.4, -6.6], [7.8, -6.5], [10.6, 5.6], [-10.5, 5.4]]) {
    const barrel = shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.88, 14), drum));
    barrel.position.set(x, 0.44, z);
    place.add(barrel);
  }
  const pallet = lit(0x7a6248);
  for (const [x, z] of [[3, -6.6], [4.3, -6.4], [-11, 2]]) {
    const stack = shaded(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14 * 5, 1), pallet));
    stack.position.set(x, 0.35, z);
    place.add(stack);
  }
  // Gantry cranes: legs on the quay, boom out over the water.
  const craneSteel = lit(0x8a3a2a, { metalness: 0.4, roughness: 0.6 });
  for (const x of [-18, 16]) {
    const crane = new THREE.Group();
    for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 2], [4, 2]]) {
      const leg = shaded(new THREE.Mesh(new THREE.BoxGeometry(0.6, 22, 0.6), craneSteel));
      leg.position.set(dx, 11, dz);
      crane.add(leg);
    }
    const beam = shaded(new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 1.2), craneSteel));
    beam.position.set(0, 20, -4);
    const beam2 = beam.clone();
    beam2.position.z = 2;
    const boom = shaded(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 40), craneSteel));
    boom.position.set(0, 22, 10);
    crane.add(beam, beam2, boom);
    const warning = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
    warning.position.set(0, 23, 29);
    crane.add(warning);
    crane.position.set(x, 0, edgeZ - 3);
    place.add(crane);
  }
  // Sodium lamps: tall poles, a dim orange pool under each.
  const pole = lit(0x30343a, { metalness: 0.5, roughness: 0.5 });
  const sodium = new THREE.MeshBasicMaterial({ color: 0xffb35c });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.12, depthWrite: false });
  for (const [x, z] of [[-7, -6.4], [6, -6.4], [-3, 7.6], [9, 7.6]]) {
    const post = shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 7, 8), pole));
    post.position.set(x, 3.5, z);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.2), pole);
    arm.position.set(x, 7, z + (z < 0 ? 0.6 : -0.6));
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.5), sodium);
    head.position.set(x, 6.92, z + (z < 0 ? 1.1 : -1.1));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), glowMaterial);
    halo.position.copy(head.position);
    const lamp = new THREE.PointLight(0xffa24a, 1.6, 15, 2);
    lamp.position.set(head.position.x, 6.6, head.position.z);
    place.add(post, arm, head, halo, lamp);
  }
  return place;
}

/**
 * A big-fight stadium: the ring in the middle of a dark hall, stands of
 * people rising on every side into the dark, and a rig of lamps over the
 * ring throwing hard light down onto the canvas.
 */
function buildStadium() {
  const place = buildRing();
  // The stands: tiers stepping up and back from a dark floor, on four sides.
  const tierMaterial = new THREE.MeshStandardMaterial({ color: 0x14161e, roughness: 0.95 });
  const crowd = [];
  for (let tier = 0; tier < 14; tier += 1) {
    const inner = 7 + tier * 0.9;
    const height = -1.2 + tier * 0.55;
    for (let side = 0; side < 4; side += 1) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(inner * 2, 0.55, 0.9), tierMaterial);
      const angle = (side * Math.PI) / 2;
      step.position.set(Math.cos(angle) * (inner + 0.45), height, Math.sin(angle) * (inner + 0.45));
      step.rotation.y = -angle + Math.PI / 2;
      place.add(step);
      // People along the step, a seat apart.
      for (let seat = -inner + 0.4; seat < inner - 0.4; seat += 0.55) {
        if (Math.random() < 0.12) continue;
        const along = [Math.cos(angle + Math.PI / 2), Math.sin(angle + Math.PI / 2)];
        crowd.push([Math.cos(angle) * (inner + 0.35) + along[0] * seat, height + 0.55, Math.sin(angle) * (inner + 0.35) + along[1] * seat]);
      }
    }
  }
  // One instanced mesh for the whole crowd: shoulders and heads in the dark.
  const person = new THREE.CylinderGeometry(0.17, 0.2, 0.75, 6);
  person.translate(0, 0.38, 0);
  const people = new THREE.InstancedMesh(person, new THREE.MeshStandardMaterial({ roughness: 0.9 }), crowd.length);
  const placing = new THREE.Object3D();
  const shirt = new THREE.Color();
  crowd.forEach((at, index) => {
    placing.position.set(at[0], at[1], at[2]);
    placing.scale.setScalar(0.85 + Math.random() * 0.3);
    placing.updateMatrix();
    people.setMatrixAt(index, placing.matrix);
    people.setColorAt(index, shirt.setHSL(Math.random(), 0.35, 0.12 + Math.random() * 0.16));
  });
  place.add(people);
  // The lighting rig: a square truss over the ring, lamps glowing, and the
  // beams they throw, faint in the haze.
  const truss = new THREE.MeshStandardMaterial({ color: 0x1c1f28, metalness: 0.6, roughness: 0.4 });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff6e6 });
  // Seen only from outside: from inside a beam the camera would be lost in the haze.
  const beam = new THREE.MeshBasicMaterial({ color: 0xfff3dd, transparent: true, opacity: 0.035, depthWrite: false, side: THREE.FrontSide });
  const rigHeight = 8;
  for (let side = 0; side < 4; side += 1) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(8, 0.25, 0.25), truss);
    const angle = (side * Math.PI) / 2;
    bar.position.set(Math.cos(angle) * 4, rigHeight, Math.sin(angle) * 4);
    bar.rotation.y = -angle + Math.PI / 2;
    place.add(bar);
    for (const offset of [-2.6, -0.9, 0.9, 2.6]) {
      const along = [Math.cos(angle + Math.PI / 2), Math.sin(angle + Math.PI / 2)];
      const x = Math.cos(angle) * 4 + along[0] * offset;
      const z = Math.sin(angle) * 4 + along[1] * offset;
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12), lamp);
      glow.position.set(x, rigHeight - 0.2, z);
      place.add(glow);
      // A cone from the lamp to the canvas.
      const length = Math.hypot(x, rigHeight, z);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, length, 16, 1, true), beam);
      cone.position.set(x / 2, rigHeight / 2, z / 2);
      cone.lookAt(0, 0, 0);
      cone.rotateX(-Math.PI / 2);
      place.add(cone);
    }
  }
  return place;
}

function buildRing() {
  const ring = new THREE.Group();
  const half = WORLD.ringHalf + 0.2;
  const canvas = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.6, 0.4, half * 2 + 0.6), new THREE.MeshStandardMaterial({ color: 0x9aa7b8, roughness: 0.92 }));
  canvas.position.y = -0.2;
  canvas.receiveShadow = true;
  ring.add(canvas);
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshStandardMaterial({ color: 0x8592a6, roughness: 0.95 }));
  logo.rotation.x = -Math.PI / 2;
  logo.position.y = 0.002;
  logo.receiveShadow = true;
  ring.add(logo);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.7, 1.1, half * 2 + 0.7), new THREE.MeshStandardMaterial({ color: 0x171a24, roughness: 0.8 }));
  skirt.position.y = -0.95;
  ring.add(skirt);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x0e1018, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.5;
  ring.add(floor);

  const corners = [[half, half, 0xd8d8d8], [-half, half, CORNER_COLORS.red], [-half, -half, 0xd8d8d8], [half, -half, CORNER_COLORS.blue]];
  for (const [x, z, color] of corners) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.45, 12), new THREE.MeshStandardMaterial({ color: 0x9ea3ad, metalness: 0.6, roughness: 0.35 }));
    post.position.set(x, 0.72, z);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.05, 0.16), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    pad.position.set(x * 0.985, 0.85, z * 0.985);
    ring.add(post, pad);
  }
  const ropeMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });
  for (const height of [0.42, 0.82, 1.22]) {
    for (let side = 0; side < 4; side += 1) {
      const [ax, az] = corners[side];
      const [bx, bz] = corners[(side + 1) % 4];
      const length = Math.hypot(bx - ax, bz - az);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, length, 8), ropeMaterial);
      rope.position.set((ax + bx) / 2, height, (az + bz) / 2);
      rope.rotation.z = Math.PI / 2;
      rope.rotation.y = Math.atan2(-(bz - az), bx - ax);
      rope.castShadow = true;
      ring.add(rope);
    }
  }
  return ring;
}

export function resize(view, width, height) {
  view.renderer.setSize(width, height, false);
  view.camera.aspect = width / Math.max(1, height);
  view.camera.updateProjectionMatrix();
}

export function placeCamera(view, focus) {
  const orbit = view.orbit;
  if (focus) orbit.target.lerp(new THREE.Vector3(focus[0], 1.1, focus[2]), 0.06);
  const { yaw, pitch, distance, target } = orbit;
  view.camera.position.set(
    target.x + Math.cos(pitch) * Math.cos(yaw) * distance,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(pitch) * Math.sin(yaw) * distance,
  );
  view.camera.lookAt(target);
}

// ---- Fighter view ---------------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);
const tmpB = new THREE.Vector3();
const ARM_BONES = new Set(['lClavicle', 'lUpperArm', 'lForearm', 'rClavicle', 'rUpperArm', 'rForearm'].map((name) => BONE[name]));

/** Kit and skin colours painted onto the body by where each vertex sits in the bind pose. */
function paintBody(mesh, body, look, corner) {
  const { positions, skinIndex, bindPoints } = mesh;
  const skin = new THREE.Color(SKIN_TONES[look.skinTone ?? 'medium']);
  const shorts = new THREE.Color(corner);
  const band = new THREE.Color(0xf4f4f4);
  const top = new THREE.Color(corner).multiplyScalar(0.7);
  if (mesh.regions) {
    // A lofted body names each garment piece's role; the outfit's design
    // colours it. Bare skin may carry a tattooed body suit.
    const dress = dressFor(body.inputs, corner);
    const byRegion = roleColors(dress, skin);
    const colors = new Float32Array(positions.length);
    mesh.regions.forEach((region, vertex) => {
      let color = byRegion[region] ?? skin;
      if (region === 'skin' && dress.tattoo) {
        const segment = BONE_SEGMENT[BONES[skinIndex[vertex * 4]]];
        color = tattooColor([positions[vertex * 3], positions[vertex * 3 + 1] - bindPoints[P.pelvis][1], positions[vertex * 3 + 2]], segment, skin) ?? skin;
      }
      colors.set([color.r, color.g, color.b], vertex * 3);
    });
    mesh.skinMask = mesh.regions.map((region) => region === 'skin');
    mesh.steelMask = mesh.regions.map((region) => region === 'steel' || region === 'steel2' || region === 'gold' || region === 'mail' || region === 'mail2');
    return colors;
  }
  const hipY = bindPoints[P.pelvis][1];
  const trunk = body.lengths.trunk;
  const legReach = body.lengths.hipSpan / 2 + body.segments.lThigh.skinRadius * 1.7;
  const colors = new Float32Array(positions.length);
  const skinMask = [];
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    const y = positions[vertex * 3 + 1];
    const z = positions[vertex * 3 + 2];
    const onArm = ARM_BONES.has(skinIndex[vertex * 4]);
    let color = skin;
    if (!onArm && Math.abs(z) < legReach && y > hipY - body.lengths.thigh * 0.42 && y < hipY + trunk * 0.24) {
      color = y > hipY + trunk * 0.17 ? band : shorts;
    }
    if (!onArm && body.inputs.sex === 'female' && y > hipY + trunk * 0.56 && y < hipY + trunk * 0.9) color = top;
    colors.set([color.r, color.g, color.b], vertex * 3);
    skinMask.push(color === skin);
  }
  mesh.skinMask = skinMask;
  return colors;
}

/** Muscle red, paling to tendon near the joints the muscles cross. */
function paintMuscle(mesh) {
  const { positions, bindPoints } = mesh;
  const red = new THREE.Color(0xa3333a);
  const tendon = new THREE.Color(0xe2cdb4);
  const joints = ['lElbow', 'rElbow', 'lKnee', 'rKnee', 'lHand', 'rHand', 'lFoot', 'rFoot'].map((name) => bindPoints[P[name]]);
  const colors = new Float32Array(positions.length);
  const mixed = new THREE.Color();
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    let nearest = Infinity;
    for (const joint of joints) {
      nearest = Math.min(nearest, Math.hypot(positions[vertex * 3] - joint[0], positions[vertex * 3 + 1] - joint[1], positions[vertex * 3 + 2] - joint[2]));
    }
    mixed.copy(red).lerp(tendon, Math.max(0, Math.min(1, (0.07 - nearest) / 0.05)));
    colors.set([mixed.r, mixed.g, mixed.b], vertex * 3);
  }
  return colors;
}

/** A skinned mesh over the rig's bones from a built body mesh. */
function skinnedMesh(built, bones, colors, { indices = built.indices, material = null, share = null } = {}) {
  // A second mesh over the same vertices (the steel) shares the attributes.
  const geometry = new THREE.BufferGeometry();
  if (share) for (const [name, attribute] of Object.entries(share.attributes)) geometry.setAttribute(name, attribute);
  else {
    geometry.setAttribute('position', new THREE.BufferAttribute(built.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(built.normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(built.skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(built.skinWeight, 4));
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const inverses = built.bindFrames.map((frame) => new THREE.Matrix4().fromArray(frameMatrix(frame)).invert());
  const mesh = new THREE.SkinnedMesh(geometry, material ?? surface(0xffffff, { skinning: true, vertexColors: true, roughness: 0.55 }));
  mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Ways to build the skin. 'smoothed' is the anatomy field on a coarse grid,
 * relaxed; 'lofted' is clean low-poly rings; 'faceted' is the same with few
 * sides and flat shading; 'dense' is the fine field, as first built.
 */
export const BODY_STYLES = ['lofted', 'smoothed', 'faceted', 'dense'];
export let BODY_STYLE = 'lofted';
export function setBodyStyle(style) {
  BODY_STYLE = style;
}

function buildSkin(body, style) {
  if (style === 'lofted') return buildLoftBody(body);
  if (style === 'faceted') return buildLoftBody(body, { faceted: true });
  if (style === 'smoothed') return buildBodyMesh(body, 'skin', 0.024, 4);
  return buildBodyMesh(body, 'skin');
}

/**
 * `simple`: drawn as a crowd member, whatever his inputs say: one baked
 * body shared with those who look like him (see crowdview.js).
 */
export function buildFighterView(view, fighter, { simple: crowd = false } = {}) {
  if (crowd || fighter.body.inputs.simple) {
    view.crowdTemplates ??= new Map();
    const key = crowdKey(fighter);
    if (!view.crowdTemplates.has(key)) view.crowdTemplates.set(key, bakeCrowdTemplate(view, fighter));
    return crowdView(view, fighter, view.crowdTemplates.get(key));
  }
  return detailedView(view, fighter, false);
}

/** `simple`: low detail, no skeleton, no soft flesh (the first of a crowd template, before baking). */
function detailedView(view, fighter, simple) {
  const body = fighter.body;
  const look = body.inputs.look ?? {};
  const corner = CORNER_COLORS[fighter.corner];
  const skinColor = SKIN_TONES[look.skinTone ?? 'medium'];
  const group = new THREE.Group();
  const layers = Object.fromEntries(LAYERS.map((name) => [name, new THREE.Group()]));
  for (const layer of Object.values(layers)) group.add(layer);

  // The rig: bones whose world matrices are set straight from the physics.
  const bones = BONES.map(() => {
    const bone = new THREE.Bone();
    bone.matrixAutoUpdate = false;
    return bone;
  });
  const built = simple ? buildLoftBody(body, { lowDetail: true }) : buildSkin(body, look.bodyStyle ?? BODY_STYLE);
  const baseColors = paintBody(built, body, look, corner);
  // Steel is drawn apart, as metal; everything else is the toon body.
  const steelTriangle = (triangle) => built.steelMask?.[built.indices[triangle * 3]] && built.steelMask[built.indices[triangle * 3 + 1]] && built.steelMask[built.indices[triangle * 3 + 2]];
  const triangles = built.indices.length / 3;
  const bodyIndices = [];
  const steelIndices = [];
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const target = steelTriangle(triangle) ? steelIndices : bodyIndices;
    target.push(built.indices[triangle * 3], built.indices[triangle * 3 + 1], built.indices[triangle * 3 + 2]);
  }
  const skinMesh = skinnedMesh(built, bones, baseColors.slice(), { indices: Uint32Array.from(bodyIndices) });
  // Lacquered lamellar is glossy paint over steel: its colour shows, not only reflections.
  const dressLook = dressFor(body.inputs, corner);
  const lacquer = dressLook.armor?.kind === 'lamellar' || dressLook.armor?.kind === 'okegawa' ? { metalness: 0.45, roughness: 0.3 } : {};
  const steel = steelMaterial(view.steelEnv, { skinning: true, ...lacquer });
  let steelMesh = null;
  if (steelIndices.length) {
    steelMesh = skinnedMesh(built, bones, null, { indices: Uint32Array.from(steelIndices), material: steel, share: skinMesh.geometry });
    layers.skin.add(steelMesh, outlineFor(steelMesh));
  }
  // Which body segment each skin vertex belongs to, by its strongest bone.
  const vertexSegment = Array.from({ length: built.positions.length / 3 }, (_, vertex) => (built.skinMask[vertex] ? BONE_SEGMENT[BONES[built.skinIndex[vertex * 4]]] : null));
  const skinOutline = outlineFor(skinMesh);
  layers.skin.add(skinMesh, skinOutline);
  const shells = simple ? [] : [{ key: 'body', shell: new SoftShell(null, null, body.segments.trunk.fleshFirmness, { mesh: skinMesh, recomputeNormals: false }) }];

  const dress = dressFor(body.inputs, corner);
  // A design may set the hair (a sumo's topknot).
  const headView = buildHead(body, dress.look.hair ? { ...look, hairStyle: dress.look.hair } : look, skinColor, corner);
  headView.group.matrixAutoUpdate = false;
  layers.skin.add(headView.group);
  shells.push({ key: 'head', shell: headView.shell });

  // Hands and feet ride on the forearm and foot bones: gloves, bare fists,
  // tactical gloves or gauntlets; boots, trainers, heels or sabatons.
  const attachments = [];
  const gloveMaterial = surface(corner, { roughness: 0.32 });
  const hands = handKind(body.inputs, glovedFists(body.inputs));
  const plainSteel = steelMaterial(view.steelEnv, { vertexColors: false, color: roleColors(dress, new THREE.Color(skinColor)).steel, ...lacquer });
  const garmentColors = { ...roleColors(dress, new THREE.Color(skinColor)), accent: dress.feet.accent };
  for (const side of ['l', 'r']) {
    let hand;
    if (hands === 'gloved') {
      hand = new THREE.Group();
      const fist = new THREE.Mesh(new THREE.SphereGeometry(WORLD.gloveRadius * 1.12, 20, 16), gloveMaterial);
      fist.scale.set(1, 1.15, 0.95);
      const thumb = new THREE.Mesh(new THREE.SphereGeometry(WORLD.gloveRadius * 0.42, 10, 8), gloveMaterial);
      thumb.position.set(0.045, -0.01, side === 'l' ? -0.04 : 0.04);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.08, 16), surface(0xf2f2f2));
      cuff.position.y = -0.09;
      for (const piece of [fist, thumb, cuff]) {
        piece.castShadow = true;
        piece.add(outlineFor(piece, 0.004));
      }
      hand.add(fist, thumb, cuff);
      hand.matrixAutoUpdate = false;
    } else hand = buildHand(body, side, hands, skinColor, plainSteel);
    layers.skin.add(hand);
    attachments.push({ object: hand, bone: BONE[`${side}Forearm`], at: P[`${side}Hand`] });
    const shoe = buildFootwear(body, dress.feet.kind, garmentColors, skinColor, plainSteel, Boolean(dress.feet.heels));
    layers.skin.add(shoe);
    attachments.push({ object: shoe, bone: BONE[`${side}Foot`], at: P[`${side}Foot`] });
  }

  // Worn things: headgear (which hides the hair it encloses), a headset
  // (it can be knocked off), and what swings: a hood, a tie, sumo strings,
  // a tabard.
  const headgear = buildHeadgear(body, dress.head, garmentColors, plainSteel, corner);
  if (headgear) {
    headView.group.add(headgear.group);
    if (headgear.hidesHair) headView.hideHair();
  }
  const dangles = [];
  // Headgear: worn on the head, and a loose copy for when it is knocked off.
  const allowed = headgearOptions(dress.kind);
  const headProps = (body.inputs.accessories ?? []).filter((kind) => allowed.includes(kind)).map((kind) => {
    const make = () => (kind === 'headset' ? headsetMesh(body) : buildHeadProp(kind, body, dress, garmentColors, plainSteel, corner));
    const worn = make();
    if (!worn) return null;
    headView.group.add(worn);
    return { kind, worn, loose: make() };
  }).filter(Boolean);
  const collar = new THREE.Group();
  collar.matrixAutoUpdate = false;
  layers.skin.add(collar);
  attachments.push({ object: collar, bone: BONE.chest, at: P.neck });
  const hips = new THREE.Group();
  hips.matrixAutoUpdate = false;
  layers.skin.add(hips);
  attachments.push({ object: hips, bone: BONE.pelvis, at: P.pelvis });
  if (dress.top?.kind === 'hoodie') dangles.push(...buildHood(body, collar, dress.top.color));
  dangles.push(...buildSwinging(body, dress, collar, hips, corner));
  if (dress.armor?.backPrint) collar.add(buildBackPrint(body, dress.armor.backPrint));
  if (dress.banner) {
    const banner = buildBanner(body, dress.banner);
    banner.userData.banner = true;
    collar.add(banner);
  }

  // Bone layer: the anatomical skeleton, moved rigidly with the rig.
  const skeleton = simple ? BONES.map(() => new THREE.Group()) : buildSkeleton(body, built.bindFrames);
  for (const piece of skeleton) layers.bone.add(piece);

  const physicsLayer = buildPhysicsLayer(fighter, layers);
  if (simple) thinOut(layers.skin, skinMesh);
  view.scene.add(group);
  return {
    fighter, group, layers, bones, built, skinMesh, skinOutline, muscle: null, skeleton, attachments, shells, shod: dress.feet.kind !== 'bare',
    baseColors, vertexSegment, damageVersion: -1, skinBone: surface(skinColor, { roughness: 0.6 }), headProps, dangles, steelMesh,
    ...physicsLayer, head: headView, layer: 'skin', frames: built.bindFrames, lacquer,
  };
}

/** The physics layer: particles, constraints, motor targets, collision capsules. */
function buildPhysicsLayer(fighter, layers) {
  const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xffd34d });
  const particles = fighter.body.masses.map((mass) => {
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.014 + 0.004 * Math.cbrt(mass), 10, 8), particleMaterial);
    layers.physics.add(sphere);
    return sphere;
  });
  const lineCount = fighter.constraints.length + fighter.body.masses.length;
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
  lines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lineCount * 6), 3));
  const colors = new Float32Array(lineCount * 6);
  fighter.constraints.forEach((constraint, index) => {
    const color = constraint.compliance === 0 ? [1, 1, 1] : [0.55, 0.6, 0.7];
    colors.set([...color, ...color], index * 6);
  });
  for (let index = fighter.constraints.length; index < lineCount; index += 1) colors.set([0.3, 1, 0.5, 0.3, 1, 0.5], index * 6);
  lines.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  lines.frustumCulled = false;
  layers.physics.add(lines);
  const capsuleMaterial = new THREE.MeshBasicMaterial({ color: 0x46e0ff, wireframe: true, transparent: true, opacity: 0.35 });
  const capsuleMeshes = capsules(fighter).map((capsule) => {
    const isSphere = capsule.a === capsule.b;
    const mesh = new THREE.Mesh(isSphere ? new THREE.SphereGeometry(capsule.radius, 12, 8) : new THREE.CylinderGeometry(capsule.radius, capsule.radius, 1, 12, 1, true), capsuleMaterial);
    layers.physics.add(mesh);
    return { capsule, mesh, isSphere };
  });
  const gloveSpheres = ['l', 'r'].map((side) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(WORLD.gloveRadius, 12, 8), capsuleMaterial);
    layers.physics.add(mesh);
    return { index: P[`${side}Hand`], mesh };
  });
  return { particles, lines, capsuleMeshes, gloveSpheres };
}

/**
 * A crowd template: the first of a look built in detail at the bind pose,
 * and everything he wears baked into his skinned body and steel.
 */
function bakeCrowdTemplate(view, fighter) {
  const full = detailedView(view, fighter, true);
  view.scene.remove(full.group);
  const { built } = full;
  const frames = built.bindFrames;
  const points = built.bindPoints ?? bindPoints(fighter.body);
  // Head props get knocked off: each fighter wears his own, not baked; a
  // banner is drawn with the side's others (an instanced batch).
  for (const prop of full.headProps) prop.worn.parent?.remove(prop.worn);
  full.group.traverse((object) => {
    if (object.userData.banner) object.visible = false;
  });
  const seat = fighter.body.lengths.headRadius * HEAD_SEAT;
  const headFrame = frames[BONE.head];
  full.head.group.matrix.copy(frameAt(headFrame, headFrame.origin.map((value, axis) => value - headFrame.y[axis] * seat))).scale(new THREE.Vector3(HEAD_SCALE, HEAD_SCALE, HEAD_SCALE));
  const pieces = [{ root: full.head.group, bone: BONE.head }];
  for (const { object, bone, at } of full.attachments) {
    object.matrix.copy(frameAt(frames[bone], points[at]));
    pieces.push({ root: object, bone });
  }
  const baked = bakePieces(pieces);
  const own = built.positions.length / 3;
  const added = baked.positions.length / 3;
  const join = (Type, first, second) => {
    const joined = new Type(first.length + second.length);
    joined.set(first);
    joined.set(second, first.length);
    return joined;
  };
  // The baked vertices follow the body's own.
  const after = (indices) => indices.map((index) => index + own);
  const bakedSkinIndex = baked.skinIndex.flatMap((bone) => [bone, 0, 0, 0]);
  const bakedSkinWeight = baked.skinIndex.flatMap(() => [1, 0, 0, 0]);
  const template = {
    attributes: {
      position: new THREE.BufferAttribute(join(Float32Array, built.positions, baked.positions), 3),
      normal: new THREE.BufferAttribute(join(Float32Array, built.normals, baked.normals), 3),
      skinIndex: new THREE.Uint16BufferAttribute(join(Uint16Array, built.skinIndex, bakedSkinIndex), 4),
      skinWeight: new THREE.Float32BufferAttribute(join(Float32Array, built.skinWeight, bakedSkinWeight), 4),
    },
    colors: join(Float32Array, full.baseColors, baked.colors),
    bodyIndex: join(Uint32Array, full.skinMesh.geometry.index.array, after(baked.body)),
    steelIndex: join(Uint32Array, full.steelMesh?.geometry.index.array ?? [], after(baked.steel)),
    // Ink round the body and the big one-sided pieces only (see CROWD_VIEW.outlineTriangles).
    bodyOutlineIndex: join(Uint32Array, full.skinMesh.geometry.index.array, after(baked.outlined.body)),
    steelOutlineIndex: join(Uint32Array, full.steelMesh?.geometry.index.array ?? [], after(baked.outlined.steel)),
    vertexSegment: [...full.vertexSegment, ...new Array(added).fill(null)],
    frames,
    headRadius: fighter.body.lengths.headRadius,
    lacquer: full.lacquer,
    shod: full.shod,
    vertices: own + added,
  };
  disposeFighterView(view, full);
  return template;
}

/** A crowd fighter's view: the template's baked body over his own bones. */
function crowdView(view, fighter, template) {
  const body = fighter.body;
  const look = body.inputs.look ?? {};
  const corner = CORNER_COLORS[fighter.corner];
  const skinColor = SKIN_TONES[look.skinTone ?? 'medium'];
  const group = new THREE.Group();
  const layers = Object.fromEntries(LAYERS.map((name) => [name, new THREE.Group()]));
  for (const layer of Object.values(layers)) group.add(layer);
  const bones = BONES.map(() => {
    const bone = new THREE.Bone();
    bone.matrixAutoUpdate = false;
    return bone;
  });
  const frames = boneFrames(bindPoints(body), body);
  const skeleton = new THREE.Skeleton(bones, stretchedInverses(template.frames, frames, body.lengths.headRadius / template.headRadius));
  // His own colours (bruises) and index (a part cut off); the rest is shared.
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(template.attributes)) geometry.setAttribute(name, attribute);
  geometry.setAttribute('color', new THREE.BufferAttribute(template.colors.slice(), 3));
  geometry.setIndex(new THREE.BufferAttribute(template.bodyIndex.slice(), 1));
  geometry.userData.sharedAttributes = Object.keys(template.attributes);
  const skinned = (meshGeometry, material) => {
    const mesh = new THREE.SkinnedMesh(meshGeometry, material);
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.frustumCulled = false;
    return mesh;
  };
  const skinMesh = skinned(geometry, surface(0xffffff, { skinning: true, vertexColors: true, roughness: 0.55 }));
  skinMesh.castShadow = true;
  // The ink has its own index over the same vertices (and loses a cut-off part with the body).
  const inked = (meshGeometry, index) => {
    const outlineGeometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(meshGeometry.attributes)) outlineGeometry.setAttribute(name, attribute);
    outlineGeometry.setIndex(new THREE.BufferAttribute(index.slice(), 1));
    outlineGeometry.userData.sharedAttributes = Object.keys(meshGeometry.attributes);
    const outline = outlineFor({ isSkinnedMesh: true, geometry: outlineGeometry, skeleton, bindMatrix: new THREE.Matrix4() });
    return outline;
  };
  const skinOutline = inked(geometry, template.bodyOutlineIndex);
  skinMesh.userData.ink = skinOutline;
  layers.skin.add(skinMesh, skinOutline);
  let steelMesh = null;
  if (template.steelIndex.length) {
    const steelGeometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) steelGeometry.setAttribute(name, attribute);
    steelGeometry.setIndex(new THREE.BufferAttribute(template.steelIndex.slice(), 1));
    // The colour is his own, but the skin's geometry frees it.
    steelGeometry.userData.sharedAttributes = Object.keys(geometry.attributes);
    steelMesh = skinned(steelGeometry, steelMaterial(view.steelEnv, { skinning: true, ...template.lacquer }));
    const steelOutline = inked(steelGeometry, template.steelOutlineIndex);
    steelMesh.userData.ink = steelOutline;
    layers.skin.add(steelMesh, steelOutline);
  }
  // What is his own: the head props he can lose, and anything painted on cloth.
  const headGroup = new THREE.Group();
  headGroup.matrixAutoUpdate = false;
  layers.skin.add(headGroup);
  const dress = dressFor(body.inputs, corner);
  const garmentColors = { ...roleColors(dress, new THREE.Color(skinColor)), accent: dress.feet.accent };
  const plainSteel = steelMaterial(view.steelEnv, { vertexColors: false, color: garmentColors.steel, ...template.lacquer });
  const allowed = headgearOptions(dress.kind);
  const headProps = (body.inputs.accessories ?? []).filter((kind) => allowed.includes(kind)).map((kind) => {
    const make = () => (kind === 'headset' ? headsetMesh(body) : buildHeadProp(kind, body, dress, garmentColors, plainSteel, corner));
    const worn = make();
    if (!worn) return null;
    headGroup.add(worn);
    return { kind, worn, loose: make() };
  }).filter(Boolean);
  const attachments = [];
  let banner = null;
  if (dress.armor?.backPrint || dress.banner) {
    const collar = new THREE.Group();
    collar.matrixAutoUpdate = false;
    layers.skin.add(collar);
    attachments.push({ object: collar, bone: BONE.chest, at: P.neck });
    if (dress.armor?.backPrint) collar.add(buildBackPrint(body, dress.armor.backPrint));
    if (dress.banner) {
      // The side's banners are one instanced batch, made at 1.8 m and set
      // to each man's size and back (see buildBanner).
      const batch = crowdBatch(view, `banner:${dress.banner}`, () => buildBanner({ heightM: 1.8, segments: { trunk: { skinRadius: 0 } } }, dress.banner));
      const scale = body.heightM / 1.8;
      const back = -(body.segments.trunk.skinRadius * 0.62 * 1.32 + 0.05);
      const local = new THREE.Matrix4().makeTranslation(back + 0.05 * scale, 0, 0).multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
      banner = { batch, collar, local, matrix: new THREE.Matrix4() };
    }
  }
  const boneGroups = BONES.map(() => new THREE.Group());
  for (const piece of boneGroups) layers.bone.add(piece);
  const physicsLayer = buildPhysicsLayer(fighter, layers);
  thinOut(layers.skin, skinMesh);
  view.scene.add(group);
  return {
    fighter, group, layers, bones, built: { bindFrames: template.frames }, skinMesh, skinOutline, muscle: null, skeleton: boneGroups, attachments, shells: [], shod: template.shod,
    baseColors: template.colors, vertexSegment: template.vertexSegment, damageVersion: -1, skinBone: surface(skinColor, { roughness: 0.6 }), headProps, dangles: [], steelMesh,
    ...physicsLayer, head: { group: headGroup, shell: { dent() {} }, update() {}, hideHair() {} }, layer: 'skin', frames, baked: true, banner,
  };
}

// A simple character (a crowd of them) draws its ink outline only round the
// shapes big enough to read at a distance, and casts its shadow from the body
// alone: a rebel's eyelids and finger joints cost as much to draw as his torso.
const SIMPLE_OUTLINE_TRIANGLES = 600;

function thinOut(skinLayer, skinMesh) {
  const triangles = (geometry) => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  const drop = [];
  skinLayer.traverse((object) => {
    if (!object.isMesh) return;
    if (object.userData.outline) {
      if (object.parent !== skinMesh && triangles(object.geometry) < SIMPLE_OUTLINE_TRIANGLES) drop.push(object);
      return;
    }
    object.castShadow = object === skinMesh;
  });
  for (const outline of drop) {
    outline.material.dispose();
    outline.parent.remove(outline);
  }
}

/** The muscle layer is built the first time it is shown: it costs a body mesh. */
function ensureMuscle(fighterView) {
  if (fighterView.muscle) return;
  const built = buildBodyMesh(fighterView.fighter.body, 'muscle', 0.016);
  const mesh = skinnedMesh(built, fighterView.bones, paintMuscle(built));
  fighterView.layers.muscle.add(mesh, outlineFor(mesh, 0.003));
  fighterView.muscle = { built, mesh };
}

export function disposeFighterView(view, fighterView) {
  view.scene.remove(fighterView.group);
  for (const prop of fighterView.headProps ?? []) if (prop.loose.parent) view.scene.remove(prop.loose);
  fighterView.group.traverse((object) => {
    // Shared with the crowd: the template's vertices and merged weapons stay for the others.
    if (!object.geometry || object.userData.shared) return;
    for (const name of object.geometry.userData.sharedAttributes ?? []) object.geometry.deleteAttribute(name);
    object.geometry.dispose();
  });
}

/** Free the crowd templates and instanced batches, once no view uses them (between bouts). */
export function clearCrowdTemplates(view) {
  const release = (attributes) => {
    const holder = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(attributes)) holder.setAttribute(name, attribute);
    holder.dispose();
  };
  for (const template of view.crowdTemplates?.values() ?? []) release(template.attributes);
  for (const batch of view.crowdBatches?.values() ?? []) batch.dispose();
  view.crowdTemplates = new Map();
  view.crowdBatches = new Map();
}

function dangleColliders(fighterView, points) {
  const body = fighterView.fighter.body;
  const v = (at) => new THREE.Vector3(...at);
  const head = v(points[P.head]);
  // Whatever is worn over the trunk stands off it: hair rests on that.
  const dress = dressFor(body.inputs, 0);
  const cloth = Math.max(TOPS[dress.top?.kind]?.loose ?? 1, dress.armor ? 1.2 : 1);
  // The trunk is wider than deep; the capsule is sized to its depth, so hair
  // falling from the back of the head lies on the back (the shoulders have
  // their own capsule).
  const trunkRadius = body.segments.trunk.skinRadius * 0.8 * cloth;
  const neck = v(points[P.neck]);
  const pelvis = v(points[P.pelvis]);
  // The trunk capsule stops short of the neck, under the collarbones.
  const top = pelvis.clone().lerp(neck, 0.9);
  return [
    { a: head, b: head, radius: body.lengths.headRadius * HEAD_SCALE * 1.02 },
    { a: pelvis, b: top, radius: trunkRadius },
    { a: v(points[P.lShoulder]), b: v(points[P.rShoulder]), radius: body.segments.lUpperArm.skinRadius * 1.25 * cloth },
  ];
}

/**
 * Over-ear headphones, in head coordinates: a band over the crown, a cup over
 * each ear. Returned so the view can hide it once it is knocked off, along
 * with a loose copy for the floor.
 */
function headsetMesh(body) {
  const r = body.lengths.headRadius;
  const shell = surface(0x1b1c22, { roughness: 0.35 });
  const accent = surface(0xd6402e, { roughness: 0.4 });
  {
    const set = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.02 * r, 0.06 * r, 8, 28, Math.PI), shell);
    band.rotation.y = Math.PI / 2;
    band.position.y = 0.05 * r;
    set.add(band);
    for (const side of [1, -1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.36 * r, 0.38 * r, 0.2 * r, 20), shell);
      cup.rotation.x = Math.PI / 2;
      cup.position.set(-0.05 * r, -0.05 * r, side * 0.98 * r);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33 * r, 0.04 * r, 6, 20), accent);
      ring.position.set(-0.05 * r, -0.05 * r, side * 1.09 * r);
      set.add(cup, ring);
    }
    for (const piece of set.children) {
      piece.castShadow = true;
      piece.add(outlineFor(piece, 0.003));
    }
    return set;
  }
}

/**
 * A hoodie's hood, bunched behind the neck, and its two drawstrings: each
 * hangs from the collar and swings with the body's movement.
 */
function buildHood(body, collar, colorHex) {
  const scale = body.heightM / 1.8;
  const cloth = surface(new THREE.Color(colorHex).getHex());
  const lining = surface(new THREE.Color(colorHex).multiplyScalar(0.6).getHex());
  const dangles = [];
  // Collar coordinates: x forward, y up the chest, z to the left.
  // Hung from the back of the collar, clear of the hoodie's own shell.
  const backOfNeck = body.segments.trunk.skinRadius * 0.75 + 0.03 * scale;
  const hood = new Dangle(collar, [-backOfNeck, -0.01 * scale, 0], [-0.35, -1, 0], 0.2 * scale, { sag: 0.5, damping: 0.3 });
  const bag = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), cloth);
  bag.scale.set(0.06 * scale, 0.13 * scale, 0.14 * scale);
  bag.position.y = -0.08 * scale;
  bag.rotation.z = Math.PI;
  const inside = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), lining);
  inside.scale.copy(bag.scale);
  inside.position.copy(bag.position);
  inside.position.x += 0.012 * scale;
  inside.rotation.z = Math.PI;
  for (const piece of [bag, inside]) {
    piece.castShadow = true;
    piece.add(outlineFor(piece, 0.003));
    hood.group.add(piece);
  }
  dangles.push(hood);
  const cord = surface(0xf0ece4);
  for (const side of [1, -1]) {
    const string = new Dangle(collar, [0.07 * scale, -0.03 * scale, side * 0.035 * scale], [0.25, -1, side * 0.05], 0.17 * scale, { sag: 0.8, damping: 0.15 });
    const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.004 * scale, 0.004 * scale, 0.17 * scale, 5), cord);
    strand.position.y = -0.085 * scale;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.006 * scale, 0.006 * scale, 0.02 * scale, 6), surface(0x8a8a8a));
    tip.position.y = -0.17 * scale;
    string.group.add(strand, tip);
    dangles.push(string);
  }
  return dangles;
}

/** Which layers show: skin; muscle (with bone); bone over a ghost; physics over a ghost. */
export function setLayer(fighterView, layer) {
  fighterView.layer = layer;
  if (layer === 'muscle') ensureMuscle(fighterView);
  const { layers, skinMesh, skinOutline, head, attachments } = fighterView;
  const ghost = layer === 'physics' ? 0.25 : layer === 'bone' ? 0.12 : 1;
  layers.skin.visible = layer !== 'muscle';
  layers.muscle.visible = layer === 'muscle';
  // In the skin view the skeleton stays, painted as skin: hidden inside a
  // normal body, it shows through where a wasted one is thinner than its bones.
  layers.bone.visible = layer !== 'physics';
  layers.physics.visible = layer === 'physics';
  paintSkeleton(fighterView, layer === 'skin');
  // A shod foot's bones stay hidden in the skin view: a heeled boot lifts off them.
  for (const side of ['l', 'r']) fighterView.skeleton[BONE[`${side}Foot`]].visible = layer !== 'skin' || !fighterView.shod;
  // Ghosting: the body goes see-through and drops its ink; the head and kit hide.
  for (const mesh of [skinMesh, fighterView.steelMesh].filter(Boolean)) {
    mesh.material.transparent = ghost < 1;
    mesh.material.opacity = ghost;
    mesh.material.depthWrite = ghost === 1;
  }
  skinMesh.castShadow = ghost === 1;
  skinOutline.visible = ghost === 1;
  head.group.visible = ghost === 1;
  for (const { object } of attachments) object.visible = ghost === 1;
}

// ---- Per-frame update -----------------------------------------------------

export function updateFighterView(fighterView, dt, time) {
  const fighter = fighterView.fighter;
  const points = PARTICLES.map((_, index) => point(fighter.x, index));
  const frames = coherentFrames(boneFrames(points, fighter.body), fighterView.frames);
  fighterView.frames = frames;
  frames.forEach((frame, index) => {
    const matrix = frameMatrix(frame);
    fighterView.bones[index].matrixWorld.fromArray(matrix);
    fighterView.skeleton[index].matrix.fromArray(matrix);
    fighterView.skeleton[index].matrixWorldNeedsUpdate = true;
  });
  // Bones whose part was cut off: what skin is left on them shrinks into the joint.
  for (const index of fighterView.severedBones ?? []) {
    const at = frames[index].origin;
    fighterView.bones[index].matrixWorld.makeScale(1e-4, 1e-4, 1e-4).setPosition(at[0], at[1], at[2]);
  }
  const headFrame = frames[BONE.head];
  // Seated a little down the neck, as drawn heads are.
  const seat = fighter.body.lengths.headRadius * HEAD_SEAT;
  if (!fighterView.headDetached) {
    fighterView.head.group.matrix.fromArray(frameMatrix({ ...headFrame, origin: headFrame.origin.map((value, axis) => value - headFrame.y[axis] * seat) })).scale(new THREE.Vector3(HEAD_SCALE, HEAD_SCALE, HEAD_SCALE));
    fighterView.head.group.matrixWorldNeedsUpdate = true;
  }
  for (const { object, bone, at } of fighterView.attachments) {
    object.matrix.fromArray(frameMatrix({ ...frames[bone], origin: points[at] }));
    object.matrixWorldNeedsUpdate = true;
  }
  if (fighter.damageVersion !== fighterView.damageVersion) paintDamage(fighterView);
  // A baked crowd fighter has no flesh, face or cloth of his own to move.
  if (fighterView.baked) {
    const banner = fighterView.banner;
    if (banner && banner.collar.visible && fighterView.layers.skin.visible) banner.batch.add(banner.matrix.multiplyMatrices(banner.collar.matrix, banner.local));
    if (fighterView.layer === 'physics') updatePhysicsLayer(fighterView);
    return;
  }
  const step = Math.min(dt, 1 / 30);
  for (const entry of fighterView.shells) entry.shell.update(step);
  // What hanging hair and cloth rest on: the head, and the trunk with
  // whatever is worn over it.
  const colliders = dangleColliders(fighterView, points);
  if (!fighterView.headDetached) fighterView.head.update(step, fighter, time, colliders);
  for (const dangle of fighterView.dangles) dangle.update(step, colliders.slice(1));
  if (fighterView.layer === 'physics') updatePhysicsLayer(fighterView);
}

function updatePhysicsLayer(fighterView) {
  const fighter = fighterView.fighter;
  fighterView.particles.forEach((sphere, index) => {
    const p = point(fighter.x, index);
    sphere.position.set(p[0], p[1], p[2]);
  });
  const positions = fighterView.lines.geometry.attributes.position.array;
  let cursor = 0;
  for (const constraint of fighter.constraints) {
    positions.set(point(fighter.x, constraint.i), cursor);
    positions.set(point(fighter.x, constraint.j), cursor + 3);
    cursor += 6;
  }
  // Green: from each particle to where its motor is pulling it.
  for (let index = 0; index < fighter.body.masses.length; index += 1) {
    positions.set(point(fighter.x, index), cursor);
    positions.set(fighter.targets[index] ?? point(fighter.x, index), cursor + 3);
    cursor += 6;
  }
  fighterView.lines.geometry.attributes.position.needsUpdate = true;
  for (const { capsule, mesh, isSphere } of fighterView.capsuleMeshes) {
    const [a, b] = capsuleEnds(fighter, capsule).map(v3);
    if (isSphere) {
      mesh.position.copy(a);
      continue;
    }
    const axis = tmpB.copy(b).sub(a);
    mesh.position.copy(a).addScaledVector(axis, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, axis.clone().normalize());
    mesh.scale.set(1, axis.length(), 1);
  }
  for (const { index, mesh } of fighterView.gloveSpheres) mesh.position.copy(v3(point(fighter.x, index)));
}

// Rig bones to the physics' body segments, for damage.
const BONE_SEGMENT = {
  pelvis: 'trunk', spine: 'trunk', chest: 'trunk', neck: 'head', head: 'head',
  lClavicle: 'trunk', rClavicle: 'trunk', lUpperArm: 'lUpperArm', rUpperArm: 'rUpperArm', lForearm: 'lForearm', rForearm: 'rForearm',
  lThigh: 'lThigh', rThigh: 'rThigh', lShin: 'lShank', rShin: 'rShank', lFoot: 'lShank', rFoot: 'rShank',
};
const JOINT_BONES = {
  lElbow: ['lUpperArm', 'lForearm'], rElbow: ['rUpperArm', 'rForearm'], lKnee: ['lThigh', 'lShin'], rKnee: ['rThigh', 'rShin'],
  lHip: ['lThigh'], rHip: ['rThigh'], neck: ['neck', 'head'],
};
const BRUISE = new THREE.Color(0xa3121c);
const BROKEN = new THREE.Color(0xe01b1b);

/**
 * Skin reddens with each segment's damage; a broken joint turns its limb
 * fully red, on the skin and in the skeleton.
 */
function paintDamage(fighterView) {
  const fighter = fighterView.fighter;
  fighterView.damageVersion = fighter.damageVersion;
  const brokenSegments = new Set([...fighter.broken].flatMap((joint) => JOINT_SEGMENTS[joint]));
  const colors = fighterView.skinMesh.geometry.attributes.color;
  const base = fighterView.baseColors;
  const mixed = new THREE.Color();
  fighterView.vertexSegment.forEach((segment, vertex) => {
    if (!segment) return;
    mixed.setRGB(base[vertex * 3], base[vertex * 3 + 1], base[vertex * 3 + 2]);
    if (brokenSegments.has(segment)) mixed.copy(BROKEN);
    else mixed.lerp(BRUISE, Math.min(1, fighter.damage[segment] ?? 0) * 0.85);
    colors.setXYZ(vertex, mixed.r, mixed.g, mixed.b);
  });
  colors.needsUpdate = true;
  for (const joint of fighter.broken) {
    for (const bone of JOINT_BONES[joint]) {
      fighterView.skeleton[BONE[bone]].traverse((object) => {
        if (object.isMesh && !object.userData.outline) object.material = fighterView.brokenBone ?? (fighterView.brokenBone = surface(0xe01b1b));
      });
    }
  }
}

const SKIN_BONE_INSET = 0.87;

/**
 * The bones clothes cover, so none shows through them in the skin view: in
 * the ring, the pelvis under the shorts (and the chest under a sports top);
 * in street clothes, the trunk under a top, the legs under trousers, the
 * arms under long sleeves.
 */
function coveredBones(body) {
  // Bones under anything worn do not show through it in the skin view; on a
  // wasted body in shorts the knees below still should, so bare-legged
  // fighters keep their thighs visible when BMI is low.
  const dress = dressFor(body.inputs, 0);
  // A hoplomachus fights bare-chested: his armour is an arm and two greaves.
  const covering = dress.armor && !['hoplomachus', 'murmillo', 'secutor', 'retiarius', 'thraex'].includes(dress.armor.kind) ? dress.armor : null;
  const names = [];
  if (dress.bottom) names.push('pelvis');
  if (dress.top || covering) names.push('pelvis', 'spine', 'chest', 'lClavicle', 'rClavicle');
  if (TOPS[dress.top?.kind]?.sleeve > 0 || covering) names.push('lUpperArm', 'rUpperArm');
  if (TOPS[dress.top?.kind]?.sleeve > 1 || covering) names.push('lForearm', 'rForearm');
  const longLegs = ['tights', 'trackPants', 'pants', 'slacks', 'jeans', 'cargo', 'joggers'].includes(dress.bottom?.kind) || covering;
  if (longLegs || body.composition.bmi >= 16) names.push('lThigh', 'rThigh');
  if (longLegs) names.push('lShin', 'rShin');
  return new Set(names.map((name) => BONE[name]));
}

/** Bones wear skin in the skin view and their own colour elsewhere; broken ones stay red. */
function paintSkeleton(fighterView, asSkin) {
  const broken = new Set([...fighterView.fighter.broken].flatMap((joint) => JOINT_BONES[joint].map((bone) => BONE[bone])));
  const covered = coveredBones(fighterView.fighter.body);
  fighterView.skeleton.forEach((piece, index) => {
    // Under clothes, no bone shows in the skin view, however thin the man.
    piece.visible = !(asSkin && covered.has(index));
    // Drawn as skin, the bones sit a little in from where the anatomy layer
    // draws them, towards each bone's axis: under the flesh of a normal body,
    // through it only where the flesh has wasted away.
    for (const part of piece.children) {
      part.userData.bind ??= { x: part.position.x, z: part.position.z, scale: part.scale.clone() };
      const inset = asSkin ? SKIN_BONE_INSET : 1;
      part.position.x = part.userData.bind.x * inset;
      part.position.z = part.userData.bind.z * inset;
      part.scale.set(part.userData.bind.scale.x * inset, part.userData.bind.scale.y, part.userData.bind.scale.z * inset);
    }
    piece.traverse((object) => {
      if (!object.isMesh) return;
      if (object.userData.outline) {
        object.visible = !asSkin;
        return;
      }
      object.userData.boneMaterial ??= object.material;
      if (broken.has(index)) object.material = fighterView.brokenBone ?? (fighterView.brokenBone = surface(0xe01b1b));
      else object.material = asSkin ? fighterView.skinBone : object.userData.boneMaterial;
    });
  });
}

/**
 * Props in the world: a worn one shows on its owner's head; once knocked
 * off, a loose copy flies, tumbles and lies where the physics put it.
 */
export function updateProps(view, fighterViews, world) {
  for (const prop of world.props ?? []) {
    const owner = fighterViews.find((entry) => entry.fighter.id === prop.owner);
    const worn = owner?.headProps?.find((entry) => entry.kind === prop.kind);
    if (!worn) continue;
    worn.worn.visible = prop.attached && owner.layers.skin.visible && !owner.headDetached;
    if (prop.attached) continue;
    if (!worn.loose.parent) {
      worn.loose.scale.setScalar(HEAD_SCALE);
      view.scene.add(worn.loose);
    }
    worn.loose.position.set(...prop.x);
    worn.loose.rotation.set(...prop.turn);
  }
}

/** Show an impact: dent the struck flesh and throw a spray of sweat. */
const SPRAY = { most: 60, geometry: null };

export function showImpact(view, fighterViews, event) {
  const defenderView = fighterViews.find((entry) => entry.fighter.id === event.defender);
  if (!defenderView) return;
  const where = v3(event.point);
  if (event.target === 'head') defenderView.head.shell.dent(where, event.impulse);
  else {
    // Carry the world point back to the bind pose through the struck bone.
    const frames = defenderView.frames;
    let bone = BONE[event.target] ?? BONE.chest;
    if (event.target === 'trunk') {
      const distanceTo = (index) => Math.hypot(...toFrame(frames[index], event.point));
      bone = [BONE.pelvis, BONE.spine, BONE.chest].reduce((best, index) => (distanceTo(index) < distanceTo(best) ? index : best));
    }
    const bind = fromFrame(defenderView.built.bindFrames[bone], toFrame(frames[bone], event.point));
    defenderView.shells.find((entry) => entry.key === 'body')?.shell.dentLocal(v3(bind), event.impulse);
  }
  const spray = view.spray ?? (view.spray = []);
  // Every drop is the one sphere, scaled; a melee of a hundred keeps a few at a time.
  const count = Math.min(14, Math.round(event.impulse / 2), SPRAY.most - spray.length);
  SPRAY.geometry ??= new THREE.SphereGeometry(1, 6, 4);
  for (let index = 0; index < count; index += 1) {
    const drop = new THREE.Mesh(SPRAY.geometry, new THREE.MeshBasicMaterial({ color: 0xdfe9ff, transparent: true, opacity: 0.85 }));
    drop.scale.setScalar(0.008 + Math.random() * 0.006);
    drop.position.copy(where);
    const direction = v3(event.normal).multiplyScalar(-1).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5));
    drop.userData = { velocity: direction.normalize().multiplyScalar(1.5 + Math.random() * event.speed * 0.35), life: 0.6 };
    view.scene.add(drop);
    spray.push(drop);
  }
}

export function updateSpray(view, dt) {
  if (!view.spray) return;
  view.spray = view.spray.filter((drop) => {
    drop.userData.life -= dt;
    drop.userData.velocity.y -= 9.81 * dt;
    drop.position.addScaledVector(drop.userData.velocity, dt);
    drop.material.opacity = Math.max(0, drop.userData.life / 0.6);
    if (drop.userData.life > 0 && drop.position.y > 0) return true;
    view.scene.remove(drop);
    drop.material.dispose();
    return false;
  });
}

export function render(view) {
  view.renderer.render(view.scene, view.camera);
}
