// What weapons look like, and what they leave behind: blades, batons and
// spears in the hand; the parma on the arm; loose weapons and severed parts
// on the floor; the stump left behind; blood thrown, sprayed and pooled.
// All of it is drawn from the simulation's state; none of it changes it.

/* global THREE */
import { P } from './body.js';
import { SEVER_PARTS, point, quatRotate, shieldDisc } from './physics.js';
import { BONE } from './rig.js';
import { outlineFor, surface } from './toon.js';
import { WEAPONS } from './weapons.js';
import { steelMaterial } from './wardrobe.js';

export const GORE = {
  // Blood: drops thrown from a wound or a stump, and the stains they leave.
  dropRadius: 0.009,
  maxDrops: 900,
  maxStains: 420,
  stumpSeconds: 1.8, // a severed stump pumps blood this long, in beats
  stumpBeatsPerSecond: 2.2,
  pieceSeconds: 1.1,
  colour: 0x8a0d12,
  stainColour: 0x5a0a0d,
  sparkColour: 0xffe7a3,
};

const BRONZE = 0xb98a3e;
const toVector = (array) => new THREE.Vector3(array[0], array[1], array[2]);

// ---- Weapon meshes --------------------------------------------------------------

/**
 * A blade along +y from `from` to its point: a flattened diamond in section,
 * `width` across the flat and `thickness` through it, narrowing to the
 * point over its last `tip` metres; `curve` bows it backwards (a katana's sori).
 */
function bladeGeometry(from, length, width, thickness, tip, curve = 0) {
  const rings = 12;
  const positions = [];
  const indices = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const u = ring / rings;
    const y = from + u * length;
    const toPoint = Math.max(0, (y - (from + length - tip)) / tip);
    const taper = ring === rings ? 0 : 1 - toPoint * toPoint * 0.9 - toPoint * 0.1;
    // The curve (sori) bows the blade back towards its spine (−z), the edge
    // on the outside of the curve: a number for the blade alone, or a
    // function of y for a curve that runs on through the handle.
    const z = typeof curve === 'function' ? curve(y) : -curve * Math.sin(u * Math.PI) - curve * 0.6 * u * u;
    // Edge (+z), back (−z), and the two flats (±x).
    positions.push(0, y, (width / 2) * taper + z, (thickness / 2) * taper, y, z, 0, y, (-width / 2) * taper * 0.85 + z, (-thickness / 2) * taper, y, z);
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let side = 0; side < 4; side += 1) {
      const a = ring * 4 + side;
      const b = ring * 4 + ((side + 1) % 4);
      const c = a + 4;
      const d = b + 4;
      indices.push(a, c, b, b, c, d);
    }
  }
  indices.push(0, 1, 2, 0, 2, 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function bladeMesh(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.blade = true;
  return mesh;
}

function cylinder(radiusTop, radiusBottom, from, to, material, sides = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, to - from, sides), material);
  mesh.position.y = (from + to) / 2;
  return mesh;
}

/**
 * A weapon as held: its grip at the origin (the main hand), +y towards the
 * point, the edge towards +z. Steel shares the scene's reflection map.
 */
export function buildWeaponMesh(kind, envMap) {
  const spec = WEAPONS[kind];
  const group = new THREE.Group();
  const steel = steelMaterial(envMap, { vertexColors: false, color: 0xd9dde4 });
  const dark = surface(0x1b1b1f, { roughness: 0.6 });
  const leather = surface(0x3a2416, { roughness: 0.8 });
  const wood = surface(0x7a5530, { roughness: 0.7 });
  const brass = steelMaterial(envMap, { vertexColors: false, color: BRONZE, roughness: 0.35 });
  switch (kind) {
    case 'pistol': {
      // A modern striker-fired service pistol: polymer frame, steel slide,
      // the grip raked back under the hand, the barrel above it (+z is up).
      const polymer = surface(0x1d1f23, { roughness: 0.75 });
      const slideSteel = steelMaterial(envMap, { vertexColors: false, color: 0x34363c, roughness: 0.4 });
      const box = (size, at, material, tilt = 0) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
        mesh.position.set(...at);
        mesh.rotation.x = tilt;
        return mesh;
      };
      group.add(
        box([0.026, 0.195, 0.032], [0, 0.0675, 0.05], slideSteel), // slide
        box([0.024, 0.15, 0.02], [0, 0.055, 0.024], polymer), // frame and rail
        box([0.028, 0.05, 0.115], [0, -0.012, -0.035], polymer, -0.3), // grip
        box([0.008, 0.045, 0.005], [0, 0.04, -0.012], polymer), // trigger guard
        box([0.008, 0.005, 0.02], [0, 0.06, 0], polymer),
        box([0.004, 0.006, 0.014], [0, 0.03, -0.004], dark), // trigger
        box([0.006, 0.008, 0.006], [0, 0.157, 0.069], dark), // front sight
        box([0.02, 0.008, 0.007], [0, -0.022, 0.069], dark), // rear sight
      );
      const muzzle = cylinder(0.006, 0.006, 0.16, 0.166, surface(0x050506, { roughness: 1 }), 8);
      muzzle.position.z = 0.05;
      group.add(muzzle);
      break;
    }
    case 'baton': {
      group.add(cylinder(0.017, 0.016, -spec.handle, spec.length, dark, 12));
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.021, 10, 8), dark);
      knob.position.y = -spec.handle;
      group.add(knob, cylinder(0.019, 0.019, -spec.handle + 0.01, 0.06, surface(0x2c2c32, { roughness: 0.9 }), 12));
      break;
    }
    case 'longsword': {
      group.add(bladeMesh(bladeGeometry(0.05, spec.length - 0.05, 0.045, 0.008, 0.22), steel));
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, 0.24), steel);
      guard.position.y = 0.04;
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), steel);
      pommel.position.y = -spec.handle;
      group.add(guard, pommel, cylinder(0.015, 0.016, -spec.handle + 0.02, 0.03, leather));
      break;
    }
    case 'katana': {
      // One curve from the pommel to the point, the hilt carrying it on; zero at the grip.
      const sori = 0.045;
      const span = spec.handle + spec.length;
      const along = (y) => Math.sin((Math.PI * (y + spec.handle)) / span);
      const bend = (y) => -sori * (along(y) - along(0));
      const slope = (y) => (bend(y + 0.001) - bend(y - 0.001)) / 0.002;
      // A fitting set square to the curve at y.
      const onCurve = (mesh, y) => {
        mesh.position.set(0, y, bend(y));
        mesh.rotation.x = Math.atan(slope(y));
        return mesh;
      };
      group.add(bladeMesh(bladeGeometry(0.04, spec.length - 0.04, 0.032, 0.007, 0.08, bend), steel));
      const handlePath = new THREE.CatmullRomCurve3(Array.from({ length: 7 }, (_, index) => {
        const y = -spec.handle + ((spec.handle + 0.026) * index) / 6;
        return new THREE.Vector3(0, y, bend(y));
      }));
      const tsuka = new THREE.Mesh(new THREE.TubeGeometry(handlePath, 12, 0.0165, 8, false), surface(0x14161f, { roughness: 0.8 }));
      const tsuba = onCurve(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.008, 18), surface(0x2a2420, { roughness: 0.5 })), 0.03);
      const habaki = onCurve(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.026, 8), brass), 0.047);
      const kashira = onCurve(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.016, 8), brass), -spec.handle - 0.004);
      group.add(tsuka, tsuba, habaki, kashira);
      break;
    }
    case 'knife': {
      group.add(bladeMesh(bladeGeometry(0.02, spec.length - 0.02, 0.026, 0.005, 0.07), steel));
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.01, 0.05), dark);
      guard.position.y = 0.016;
      group.add(guard, cylinder(0.014, 0.015, -spec.handle, 0.012, dark));
      break;
    }
    case 'warhammer': {
      // An ash shaft; at the head a hammer face, a back spike and a top spike.
      const head = spec.length - 0.12;
      group.add(cylinder(0.017, 0.019, -spec.handle, head + 0.02, wood, 10));
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.07), steel);
      block.position.y = head;
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.09, 10), steel);
      face.rotation.x = Math.PI / 2;
      face.position.set(0, head, 0.08);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 8), steel);
      beak.rotation.x = -Math.PI / 2;
      beak.position.set(0, head, -0.11);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.14, 8), steel);
      spike.position.y = head + 0.12;
      const langets = cylinder(0.021, 0.021, head - 0.2, head - 0.04, steel, 8);
      const butt = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 8), steel);
      butt.rotation.x = Math.PI;
      butt.position.y = -spec.handle - 0.03;
      group.add(block, face, beak, spike, langets, butt);
      break;
    }
    case 'naginata': {
      // A long shaft and a long curving blade on its end.
      const bladeStart = spec.strikeFrom - 0.06;
      const bladeLength = spec.length - bladeStart;
      group.add(cylinder(0.016, 0.018, -spec.handle, bladeStart + 0.02, surface(0x3a1e14, { roughness: 0.6 }), 10));
      const bend = (y) => -0.06 * ((y - bladeStart) / bladeLength) ** 2;
      group.add(bladeMesh(bladeGeometry(bladeStart, bladeLength, 0.045, 0.008, 0.14, bend), steel));
      const collar = cylinder(0.022, 0.022, bladeStart - 0.06, bladeStart + 0.01, brass, 10);
      const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 16), surface(0x2a2420, { roughness: 0.5 }));
      tsuba.position.y = bladeStart - 0.07;
      const ishizuki = cylinder(0.019, 0.016, -spec.handle - 0.05, -spec.handle + 0.01, brass, 10);
      group.add(collar, tsuba, ishizuki);
      break;
    }
    case 'longSpear': {
      const headStart = spec.length - 0.28;
      group.add(cylinder(0.015, 0.017, -spec.handle, headStart + 0.02, wood, 8));
      group.add(bladeMesh(bladeGeometry(headStart, 0.28, 0.055, 0.012, 0.18), steel));
      const socket = cylinder(0.013, 0.018, headStart - 0.07, headStart + 0.01, steel, 8);
      group.add(socket);
      break;
    }
    case 'spear': {
      group.add(cylinder(0.014, 0.015, -spec.handle, spec.length - 0.24, wood, 8));
      group.add(bladeMesh(bladeGeometry(spec.length - 0.26, 0.26, 0.05, 0.012, 0.16), steel));
      const ferrule = cylinder(0.012, 0.016, spec.length - 0.3, spec.length - 0.24, brass, 8);
      const butt = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.06, 8), brass);
      butt.rotation.x = Math.PI;
      butt.position.y = -spec.handle - 0.03;
      group.add(ferrule, butt);
      break;
    }
    case 'gladius': {
      group.add(bladeMesh(bladeGeometry(0.04, spec.length - 0.04, 0.055, 0.009, 0.12), steel));
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.08), wood);
      guard.position.y = 0.025;
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), wood);
      pommel.scale.y = 0.7;
      pommel.position.y = -spec.handle;
      group.add(guard, pommel, cylinder(0.016, 0.017, -spec.handle + 0.02, 0.012, surface(0xd8c9a8, { roughness: 0.6 })));
      break;
    }
    default:
      break;
  }
  group.traverse((object) => {
    if (object.isMesh) object.castShadow = true;
  });
  // Ink on the fittings, not the blade: a thin outlined blade reads as a black line.
  const outlined = [];
  group.traverse((object) => {
    if (object.isMesh && !object.userData.blade) outlined.push(object);
  });
  for (const mesh of outlined) mesh.add(outlineFor(mesh, 0.0025));
  return group;
}

/** The parma: a small, round, convex bronze shield, boss at the centre. Faces +z. */
export function buildShieldMesh(spec, envMap) {
  const group = new THREE.Group();
  const bronze = steelMaterial(envMap, { vertexColors: false, color: BRONZE, roughness: 0.32, side: THREE.DoubleSide });
  const dome = 0.35; // rad of a sphere: a shallow bowl
  const sphereRadius = spec.radius / Math.sin(dome);
  const face = new THREE.Mesh(new THREE.SphereGeometry(sphereRadius, 28, 8, 0, Math.PI * 2, 0, dome), bronze);
  face.rotation.x = Math.PI / 2;
  face.position.z = -sphereRadius * Math.cos(dome);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(spec.radius, 0.012, 8, 36), bronze);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), bronze);
  boss.rotation.x = Math.PI / 2;
  boss.position.z = 0.0;
  group.add(face, rim, boss);
  for (const mesh of [face, rim, boss]) {
    mesh.castShadow = true;
    mesh.add(outlineFor(mesh, 0.003));
  }
  return group;
}

// ---- In the hand ------------------------------------------------------------------

/** Keep a fighter's weapon and shield drawn where the simulation holds them. */
// A polearm's blade (`edgeLeads`) is not turned by the wrist the way a
// sword's is: the edge faces down at rest, the curve sweeping up from it,
// and in a cut it leads, facing the way the blade travels. Turned gradually,
// so it never flips edge for spine in a frame.
const EDGE = { leadsAbove: 1.5, turn: 0.35 }; // m/s of the tip; share turned a frame

function leadingEdge(arms, hand, along, length, now) {
  const tip = new THREE.Vector3(hand[0], hand[1], hand[2]).addScaledVector(along, length);
  const across = (vector) => vector.sub(along.clone().multiplyScalar(vector.dot(along)));
  let wanted = across(new THREE.Vector3(0, -1, 0));
  if (arms.tip && now > arms.tipAt) {
    const travel = across(tip.clone().sub(arms.tip));
    if (travel.length() / (now - arms.tipAt) > EDGE.leadsAbove) wanted = travel;
  }
  arms.tip = tip;
  arms.tipAt = now;
  if (wanted.lengthSq() < 1e-8) wanted = new THREE.Vector3(0, 1, 0).cross(along);
  wanted.normalize();
  const edge = arms.edge ? across(arms.edge.clone().lerp(wanted, EDGE.turn)) : wanted;
  if (edge.lengthSq() < 1e-8) edge.copy(wanted);
  arms.edge = edge.normalize();
  return arms.edge.clone();
}

/** `time`: the simulated time being drawn (s). */
export function updateArms(view, fighterView, time = 0) {
  const fighter = fighterView.fighter;
  const weapon = fighter.weapon;
  const arms = fighterView.arms ?? (fighterView.arms = { weapon: null, kind: null, shield: null });
  const showing = fighterView.layers.skin.visible;
  if (weapon?.held) {
    if (arms.kind !== weapon.kind) {
      if (arms.weapon) fighterView.group.remove(arms.weapon);
      arms.weapon = buildWeaponMesh(weapon.kind, view.steelEnv);
      arms.kind = weapon.kind;
      fighterView.group.add(arms.weapon);
    }
    // Along the blade, the edge turned the way the forearm's front faces.
    const hand = point(fighter.x, P[`${weapon.main}Hand`]);
    const along = toVector(weapon.dir).normalize();
    let edge;
    if (weapon.spec.edgeUp) {
      // Sights up: the top of the gun to the sky, whichever way it points.
      edge = new THREE.Vector3(0, 1, 0).sub(along.clone().multiplyScalar(along.y));
      if (edge.lengthSq() < 1e-6) edge = new THREE.Vector3(1, 0, 0);
      edge.normalize();
    } else if (weapon.spec.edgeLeads) edge = leadingEdge(arms, hand, along, weapon.spec.length, time);
    else {
      const forearm = fighterView.frames[BONE[`${weapon.main}Forearm`]];
      const front = toVector(forearm.x);
      edge = front.clone().sub(along.clone().multiplyScalar(front.dot(along)));
      if (edge.lengthSq() < 1e-6) edge = new THREE.Vector3(0, 1, 0).cross(along);
      edge.normalize();
    }
    const flat = along.clone().cross(edge);
    arms.weapon.matrixAutoUpdate = false;
    arms.weapon.matrix.makeBasis(flat, along, edge).setPosition(hand[0], hand[1], hand[2]);
    arms.weapon.matrixWorldNeedsUpdate = true;
    arms.weapon.visible = showing;
  } else if (arms.weapon) {
    fighterView.group.remove(arms.weapon);
    arms.weapon = null;
    arms.kind = null;
  }
  if (fighter.shield) {
    if (!arms.shield) {
      arms.shield = buildShieldMesh(fighter.shield.spec, view.steelEnv);
      fighterView.group.add(arms.shield);
    }
    const disc = shieldDisc(fighter);
    const facing = toVector(disc.normal);
    const up = new THREE.Vector3(0, 1, 0);
    const across = up.clone().cross(facing).normalize();
    const upright = facing.clone().cross(across).normalize();
    arms.shield.matrixAutoUpdate = false;
    arms.shield.matrix.makeBasis(across, upright, facing).setPosition(disc.centre[0], disc.centre[1], disc.centre[2]);
    arms.shield.matrixWorldNeedsUpdate = true;
    arms.shield.visible = showing && fighter.state !== 'out' ? true : showing;
  }
}

// ---- Cut off --------------------------------------------------------------------

/**
 * A part cut off: lift its skin (and steel) out of the body as it was
 * drawn, with what it wore, into a loose piece that the simulation's debris
 * moves; collapse those bones on the body; cap the stump; start the blood.
 */
export function severView(view, fighterView, event, debris) {
  const part = SEVER_PARTS[event.joint];
  const name = (piece) => (event.joint === 'neck' ? piece : `${event.side}${piece}`);
  const boneIndices = new Set(part.bones.map((bone) => BONE[name(bone)]));
  const origin = new THREE.Vector3(...debris.origin);
  const piece = new THREE.Group();
  for (const mesh of [fighterView.skinMesh, fighterView.steelMesh].filter(Boolean)) {
    const lifted = liftTriangles(mesh, boneIndices, origin);
    if (lifted) piece.add(lifted, outlineFor(lifted));
  }
  // What rode on it: a hand or its glove, a boot, the head with all it wore.
  const carried = [];
  if (part.attach === 'hand' || part.attach === 'foot') {
    const at = P[name(part.attach === 'hand' ? 'Hand' : 'Foot')];
    for (const attachment of fighterView.attachments) if (attachment.at === at && attachment.bone !== BONE.chest && attachment.bone !== BONE.pelvis) carried.push(attachment);
  }
  for (const attachment of carried) {
    fighterView.attachments.splice(fighterView.attachments.indexOf(attachment), 1);
    attachment.object.parent?.remove(attachment.object);
    attachment.object.matrix.premultiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
    piece.add(attachment.object);
  }
  if (part.attach === 'head') {
    const head = fighterView.head.group;
    head.parent?.remove(head);
    head.matrix.premultiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
    head.matrixAutoUpdate = false;
    piece.add(head);
    fighterView.headDetached = true;
  }
  // The cut face of the piece.
  const face = new THREE.Mesh(new THREE.SphereGeometry(debris.radius * (event.joint === 'neck' ? 0.5 : 0.9), 12, 8), surface(0x7e1016, { roughness: 0.4 }));
  face.position.set(debris.cut[0], debris.cut[1], debris.cut[2]);
  face.add(new THREE.Mesh(new THREE.SphereGeometry(debris.radius * 0.3, 8, 6), surface(0xe8dcc4)));
  piece.add(face);
  piece.userData.debris = debris.id;
  view.scene.add(piece);
  (view.pieces ??= new Map()).set(debris.id, piece);
  fighterView.severedBones ??= new Set();
  for (const bone of boneIndices) fighterView.severedBones.add(bone);
  for (const bone of boneIndices) fighterView.skeleton[bone].visible = false;
  // The stump: raw flesh where the part was.
  const base = P[name(part.base)];
  const proximal = event.joint === 'neck' ? P.neck : P[name({ shoulder: 'Shoulder', elbow: 'Shoulder', wrist: 'Elbow', hip: 'Hip', knee: 'Hip', ankle: 'Knee' }[event.joint])];
  const radius = debris.radius * (event.joint === 'neck' ? 0.55 : 1.12);
  const stump = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), surface(0x7e1016, { roughness: 0.4 }));
  stump.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 0.35, 8, 6), surface(0xe8dcc4)));
  fighterView.group.add(stump);
  (fighterView.stumps ??= []).push({ mesh: stump, base: event.joint === 'neck' ? P.head : base, from: proximal, along: event.joint === 'neck' ? 0.55 : 1 });
  // Blood: from the stump in beats, and from the piece's cut face.
  const blood = bloodOf(view);
  blood.emitters.push({ kind: 'stump', fighterView, base: event.joint === 'neck' ? P.head : base, from: proximal, along: event.joint === 'neck' ? 0.55 : 1, start: view.clock ?? 0, seconds: GORE.stumpSeconds });
  blood.emitters.push({ kind: 'piece', debris, start: view.clock ?? 0, seconds: GORE.pieceSeconds });
  spawnBlood(view, event.point, [0, 1, 0], 40, 3.2);
}

/** The triangles of a skinned mesh owned by these bones, posed as last drawn, in a piece's frame. */
function liftTriangles(mesh, boneIndices, origin) {
  const geometry = mesh.geometry;
  const skinIndex = geometry.attributes.skinIndex;
  const colors = geometry.attributes.color;
  const index = geometry.index.array;
  const owned = (vertex) => boneIndices.has(skinIndex.getX(vertex));
  const positions = [];
  const colorList = [];
  const posed = new THREE.Vector3();
  const keep = [];
  for (let triangle = 0; triangle < index.length; triangle += 3) {
    if (owned(index[triangle]) && owned(index[triangle + 1]) && owned(index[triangle + 2])) keep.push(triangle);
  }
  if (!keep.length) return null;
  const kept = new Set();
  for (const triangle of keep) for (let corner = 0; corner < 3; corner += 1) kept.add(index[triangle + corner]);
  // Take them off the body: the body's index buffer loses these triangles.
  const remaining = [];
  for (let triangle = 0; triangle < index.length; triangle += 3) {
    if (!(owned(index[triangle]) && owned(index[triangle + 1]) && owned(index[triangle + 2]))) remaining.push(index[triangle], index[triangle + 1], index[triangle + 2]);
  }
  for (const triangle of keep) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = index[triangle + corner];
      posed.fromBufferAttribute(geometry.attributes.position, vertex);
      mesh.boneTransform(vertex, posed);
      posed.applyMatrix4(mesh.matrixWorld).sub(origin);
      positions.push(posed.x, posed.y, posed.z);
      if (colors) colorList.push(colors.getX(vertex), colors.getY(vertex), colors.getZ(vertex));
    }
  }
  geometry.setIndex(remaining);
  const lifted = new THREE.BufferGeometry();
  lifted.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) lifted.setAttribute('color', new THREE.Float32BufferAttribute(colorList, 3));
  lifted.computeVertexNormals();
  const material = mesh.material.clone();
  material.skinning = false;
  material.needsUpdate = true;
  const result = new THREE.Mesh(lifted, material);
  result.castShadow = true;
  return result;
}

/** After the body is posed: stumps sit at the joint they were cut at. */
export function updateStumps(fighterView) {
  const fighter = fighterView.fighter;
  for (const stump of fighterView.stumps ?? []) {
    const at = stumpPoint(fighter, stump);
    stump.mesh.position.set(at[0], at[1], at[2]);
    stump.mesh.visible = fighterView.layers.skin.visible;
  }
}

/** Where a stump's raw end shows: at the joint, a little out past it. */
function stumpPoint(fighter, { base, from, along }) {
  const a = point(fighter.x, from);
  const b = point(fighter.x, base);
  const reach = along >= 1 ? 1.08 : along;
  return [a[0] + (b[0] - a[0]) * reach, a[1] + (b[1] - a[1]) * reach, a[2] + (b[2] - a[2]) * reach];
}

// ---- Loose on the floor ----------------------------------------------------------

/** Dropped weapons and severed parts, where the simulation's debris lies. */
export function updateDebris(view, world) {
  view.pieces ??= new Map();
  for (const debris of world.debris ?? []) {
    let mesh = view.pieces.get(debris.id);
    // Picked up: it is in someone's hand now, drawn there.
    if (debris.taken) {
      if (mesh) {
        view.scene.remove(mesh);
        view.pieces.delete(debris.id);
      }
      continue;
    }
    if (!mesh) {
      if (debris.kind !== 'weapon') continue;
      mesh = new THREE.Group();
      const weapon = buildWeaponMesh(debris.weapon, view.steelEnv);
      // The debris point is the weapon's middle; the mesh's origin is its grip.
      const spec = WEAPONS[debris.weapon];
      weapon.position.y = -(spec.length - spec.handle) / 2;
      mesh.add(weapon);
      view.scene.add(mesh);
      view.pieces.set(debris.id, mesh);
    }
    mesh.position.set(debris.x[0], debris.x[1], debris.x[2]);
    mesh.quaternion.set(debris.q[0], debris.q[1], debris.q[2], debris.q[3]);
  }
}

/** A new bout: clear what lay on the floor. */
export function clearGore(view) {
  for (const mesh of view.pieces?.values() ?? []) view.scene.remove(mesh);
  view.pieces = new Map();
  if (view.blood) {
    view.blood.drops = [];
    view.blood.emitters = [];
    view.blood.stainCount = 0;
    view.blood.stains.count = 0;
    view.blood.dropMesh.count = 0;
  }
}

// ---- Blood and sparks ---------------------------------------------------------------

function bloodOf(view) {
  if (view.blood) return view.blood;
  const dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: GORE.colour }), GORE.maxDrops);
  dropMesh.count = 0;
  dropMesh.frustumCulled = false;
  const stainGeometry = new THREE.CircleGeometry(1, 14);
  stainGeometry.rotateX(-Math.PI / 2);
  const stains = new THREE.InstancedMesh(stainGeometry, new THREE.MeshStandardMaterial({ color: GORE.stainColour, roughness: 0.25, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 }), GORE.maxStains);
  stains.count = 0;
  stains.frustumCulled = false;
  stains.receiveShadow = true;
  const sparkMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 3), new THREE.MeshBasicMaterial({ color: GORE.sparkColour }), 200);
  sparkMesh.count = 0;
  sparkMesh.frustumCulled = false;
  view.scene.add(dropMesh, stains, sparkMesh);
  view.blood = { drops: [], sparks: [], emitters: [], dropMesh, stains, sparkMesh, stainCount: 0 };
  return view.blood;
}

/** Throw `count` drops from a point, roughly along `direction`. */
export function spawnBlood(view, at, direction, count, speed = 2.2) {
  const blood = bloodOf(view);
  const along = toVector(direction).normalize();
  for (let index = 0; index < count && blood.drops.length < GORE.maxDrops; index += 1) {
    const scatter = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(0.9);
    const velocity = along.clone().add(scatter).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
    blood.drops.push({ position: toVector(at), velocity, size: GORE.dropRadius * (0.5 + Math.random()) });
  }
}

// ---- Shots ------------------------------------------------------------------

const SHOT = { flashSeconds: 0.06, tracerSeconds: 0.08 };

/** A shot: the flash at the muzzle, a streak to where it went, and what it hit. */
export function spawnShot(view, event) {
  const shots = view.shots ?? (view.shots = []);
  const from = toVector(event.from);
  const to = toVector(event.to);
  const length = from.distanceTo(to);
  const tracer = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, length, 4, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85, depthWrite: false }));
  tracer.position.copy(from).lerp(to, 0.5);
  tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc35a, transparent: true, opacity: 1, depthWrite: false }));
  flash.position.copy(from);
  view.scene.add(tracer, flash);
  shots.push({ tracer, flash, age: 0 });
  if (event.plate === 'knight') {
    // Off plate: a spray of sparks and the round whining away off the steel.
    spawnSparks(view, event.point, 16);
    const incoming = to.clone().sub(from).normalize();
    const normal = toVector(event.normal).normalize();
    const away = incoming.clone().sub(normal.clone().multiplyScalar(2 * incoming.dot(normal))).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).multiplyScalar(0.6)).normalize();
    const ricochet = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1.2, 4, 1, true), tracer.material.clone());
    ricochet.position.copy(to).addScaledVector(away, 0.6);
    ricochet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), away);
    view.scene.add(ricochet);
    shots.push({ tracer: ricochet, flash: new THREE.Mesh(), age: 0 });
  } else if (event.plate) spawnSparks(view, event.point, 5);
  else if (event.harm > 0.02) spawnBlood(view, event.point, event.normal, Math.min(24, 6 + Math.round(event.harm * 20)), 2.2);
  else if (event.target) spawnSparks(view, event.point, 8);
}

/** Fade the flashes and streaks out. */
export function updateShots(view, dt) {
  if (!view.shots?.length) return;
  view.shots = view.shots.filter((shot) => {
    shot.age += dt;
    shot.flash.material.opacity = Math.max(0, 1 - shot.age / SHOT.flashSeconds);
    shot.flash.scale.setScalar(1 + shot.age * 12);
    shot.tracer.material.opacity = 0.85 * Math.max(0, 1 - shot.age / SHOT.tracerSeconds);
    if (shot.age < Math.max(SHOT.flashSeconds, SHOT.tracerSeconds)) return true;
    for (const mesh of [shot.tracer, shot.flash]) {
      view.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    return false;
  });
}

/** Sparks off steel meeting steel or turned by plate. */
export function spawnSparks(view, at, count = 14) {
  const blood = bloodOf(view);
  for (let index = 0; index < count && blood.sparks.length < 200; index += 1) {
    const velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 3);
    blood.sparks.push({ position: toVector(at), velocity, life: 0.18 + Math.random() * 0.2 });
  }
}

/** A cut or a stab: blood from the wound, out against the blade. */
export function woundBlood(view, event) {
  const amount = (event.cut ?? 0) + (event.pierce ?? 0);
  if (amount < 1) return;
  spawnBlood(view, event.point, event.normal, Math.min(30, 4 + Math.round(amount / 4)), 1.4 + Math.min(2.5, amount / 40));
}

const placer = new THREE.Object3D();

/** Drops fly and fall and stain the floor; stumps pump; sparks die out. */
export function updateBlood(view, world, dt) {
  const blood = view.blood;
  view.clock = (view.clock ?? 0) + dt;
  if (!blood) return;
  const now = view.clock;
  blood.emitters = blood.emitters.filter((emitter) => {
    const age = now - emitter.start;
    if (age > emitter.seconds) return false;
    // In beats: strong at first, weaker each.
    const beat = Math.max(0, Math.sin(age * GORE.stumpBeatsPerSecond * Math.PI * 2)) * (1 - age / emitter.seconds);
    const count = Math.round(beat * 60 * dt * (emitter.kind === 'stump' ? 3 : 1.5));
    if (count < 1) return true;
    if (emitter.kind === 'stump') {
      const fighter = emitter.fighterView.fighter;
      const at = stumpPoint(fighter, emitter);
      const from = point(fighter.x, emitter.from);
      spawnBlood(view, at, [at[0] - from[0], at[1] - from[1] + 0.3, at[2] - from[2]], count, 2.6 * (0.5 + beat));
    } else {
      const debris = emitter.debris;
      const cut = quatRotate(debris.q, debris.cut);
      spawnBlood(view, [debris.x[0] + cut[0], debris.x[1] + cut[1], debris.x[2] + cut[2]], cut, count, 1.2);
    }
    return true;
  });
  const floor = 0.003;
  blood.drops = blood.drops.filter((drop) => {
    drop.velocity.y -= 9.81 * dt;
    drop.position.addScaledVector(drop.velocity, dt);
    if (drop.position.y > floor) return true;
    // A stain where it lands; drops landing together run into one pool.
    const slot = blood.stainCount % GORE.maxStains;
    const size = drop.size * (2.5 + Math.random() * 3);
    placer.position.set(drop.position.x, 0.0015 + (slot % 7) * 0.0002, drop.position.z);
    placer.rotation.set(0, Math.random() * Math.PI, 0);
    placer.scale.set(size * (0.8 + Math.random() * 0.6), 1, size);
    placer.updateMatrix();
    blood.stains.setMatrixAt(slot, placer.matrix);
    blood.stainCount += 1;
    blood.stains.count = Math.min(GORE.maxStains, blood.stainCount);
    blood.stains.instanceMatrix.needsUpdate = true;
    return false;
  });
  blood.drops.forEach((drop, index) => {
    placer.position.copy(drop.position);
    placer.rotation.set(0, 0, 0);
    placer.scale.setScalar(drop.size);
    placer.updateMatrix();
    blood.dropMesh.setMatrixAt(index, placer.matrix);
  });
  blood.dropMesh.count = blood.drops.length;
  blood.dropMesh.instanceMatrix.needsUpdate = true;
  blood.sparks = blood.sparks.filter((spark) => {
    spark.life -= dt;
    spark.velocity.y -= 9.81 * dt;
    spark.position.addScaledVector(spark.velocity, dt);
    return spark.life > 0;
  });
  blood.sparks.forEach((spark, index) => {
    placer.position.copy(spark.position);
    placer.scale.setScalar(0.006);
    placer.updateMatrix();
    blood.sparkMesh.setMatrixAt(index, placer.matrix);
  });
  blood.sparkMesh.count = blood.sparks.length;
  blood.sparkMesh.instanceMatrix.needsUpdate = true;
  // Pieces follow their debris.
  for (const [id, piece] of view.pieces ?? []) {
    const debris = world.debris?.[id];
    if (!debris || debris.kind !== 'piece') continue;
    piece.position.set(debris.x[0], debris.x[1], debris.x[2]);
    piece.quaternion.set(debris.q[0], debris.q[1], debris.q[2], debris.q[3]);
  }
}
