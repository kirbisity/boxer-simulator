// What weapons look like, and what they leave behind: blades, batons and
// spears in the hand; the parma on the arm; loose weapons and severed parts
// on the floor; the stump left behind; blood thrown, sprayed and pooled.
// All of it is drawn from the simulation's state; none of it changes it.

/* global THREE */
import { P } from './body.js';
import { SEVER_PARTS, point, quatRotate, shieldDisc } from './physics.js';
import { BONE } from './rig.js';
import { disposeObject, outlineFor, surface } from './toon.js';
import { ARROW, SHIELDS, WEAPONS } from './weapons.js';
import { featherDevice, steelMaterial } from './wardrobe.js';
import { buildArenaShield, buildArenaWeapon } from './arenaview.js';
import { crowdBatch } from './crowdview.js';

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
/** A box of `size`, centred at `at`, tipped `tilt` rad about x (the guns' frames, grips and magazines). */
function box(size, at, material, tilt = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...at);
  mesh.rotation.x = tilt;
  return mesh;
}

/**
 * A standard (WEAPONS[kind].flag): the staff, its finial, and its cloth (or
 * horse-tails) in the side's `colour`, trailing behind the staff (−z). The
 * looks follow the period: a knight's square banner, the Ming triangular
 * command flag with its flame-tongue border, the swallow-tailed Ottoman
 * sancak under a brass crescent, the steppe tug's horse-tails under a trident,
 * the tall Japanese nobori on its crossbar.
 */
function buildStandard(spec, colour, envMap) {
  const group = new THREE.Group();
  const wood = surface(0x6a4a2a, { roughness: 0.75 });
  const steel = steelMaterial(envMap, { vertexColors: false, color: 0xd9dde4 });
  const brass = steelMaterial(envMap, { vertexColors: false, color: BRONZE, roughness: 0.35 });
  const top = spec.length;
  group.add(cylinder(0.016, 0.018, -spec.handle, top, wood, 8));
  const cloth = (width, height, paint, shape = null) => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = Math.round((128 * height) / width);
    const g = canvas.getContext('2d');
    g.fillStyle = colour;
    g.fillRect(0, 0, canvas.width, canvas.height);
    paint?.(g, canvas.width, canvas.height);
    const material = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide, roughness: 0.9 });
    let geometry = new THREE.PlaneGeometry(width, height);
    if (shape) {
      // A cut outline: drawn as a shape with UVs over its bounding box.
      geometry = new THREE.ShapeGeometry(shape);
      const uv = geometry.attributes.uv;
      const position = geometry.attributes.position;
      for (let index = 0; index < uv.count; index += 1) uv.setXY(index, position.getX(index) / width + 0.5, position.getY(index) / height + 0.5);
    }
    const mesh = new THREE.Mesh(geometry, material);
    // In the staff's plane, out behind it: x of the cloth along −z.
    mesh.rotation.y = Math.PI / 2;
    return mesh;
  };
  const spearPoint = () => {
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.16, 6), steel);
    blade.position.y = top + 0.08;
    return blade;
  };
  switch (spec.flag) {
    case 'knights': {
      // Square, nailed along the staff below the point: the field and a pale cross.
      const flag = cloth(0.6, 0.6, (g, w, h) => {
        g.fillStyle = '#f2eee4';
        g.fillRect(w * 0.42, 0, w * 0.16, h);
        g.fillRect(0, h * 0.42, w, h * 0.16);
      });
      flag.position.set(0, top - 0.35, -0.31);
      group.add(flag, spearPoint());
      break;
    }
    case 'romans': {
      // The vexillum: a crossbar under the point, the cloth hung square from
      // it (in the staff's plane, both sides of it), a gold fringe along the
      // foot, the legion in gold letters; gilt finials at the bar's ends.
      const gold = steelMaterial(envMap, { vertexColors: false, color: 0xc9a24a, roughness: 0.3 });
      const bar = cylinder(0.009, 0.009, -0.3, 0.3, wood, 6);
      bar.rotation.x = Math.PI / 2;
      bar.position.y = top - 0.06;
      const flag = cloth(0.56, 0.5, (g, w, h) => {
        g.fillStyle = '#d6a743';
        g.fillRect(0, h * 0.9, w, h * 0.1);
        for (let tassel = 0; tassel < 9; tassel += 1) g.fillRect((tassel + 0.3) * (w / 9), h * 0.86, w / 30, h * 0.14);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `bold ${Math.round(h * 0.2)}px serif`;
        g.fillText('LEG', w / 2, h * 0.36);
        g.fillText('XVIII', w / 2, h * 0.62);
      });
      // Hung below the bar, centred on the staff (the cloth's x runs along the bar).
      flag.position.set(0, top - 0.32, 0);
      group.add(bar, flag, spearPoint());
      for (const side of [1, -1]) {
        const finial = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), gold);
        finial.position.set(0, top - 0.06, side * 0.3);
        group.add(finial);
      }
      break;
    }
    case 'chinese': {
      // A right triangle off the staff, a border of yellow flame tongues, a red tassel under the point.
      const shape = new THREE.Shape();
      shape.moveTo(-0.35, 0.25);
      shape.lineTo(0.35, -0.25 + 0.5 * 0.15);
      shape.lineTo(-0.35, -0.25);
      shape.closePath();
      const flag = cloth(0.7, 0.5, (g, w, h) => {
        g.fillStyle = '#e8c23a';
        for (let tongue = 0; tongue < 7; tongue += 1) {
          g.beginPath();
          const x = (tongue / 7) * w;
          g.moveTo(x, h);
          g.lineTo(x + w / 14, h * 0.86);
          g.lineTo(x + w / 7, h);
          g.fill();
        }
        g.beginPath();
        g.arc(w * 0.28, h * 0.55, h * 0.16, 0, Math.PI * 2);
        g.fill();
      }, shape);
      flag.position.set(0, top - 0.3, -0.36);
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 6), surface(0xb3161b, { roughness: 0.9 }));
      tassel.position.y = top - 0.02;
      tassel.rotation.x = Math.PI;
      group.add(flag, tassel, spearPoint());
      break;
    }
    case 'ottomans': {
      // Swallow-tailed, a white crescent on the field; a brass crescent on the staff's head.
      const shape = new THREE.Shape();
      shape.moveTo(-0.38, 0.25);
      shape.lineTo(0.38, 0.25);
      shape.lineTo(0.18, 0);
      shape.lineTo(0.38, -0.25);
      shape.lineTo(-0.38, -0.25);
      shape.closePath();
      const flag = cloth(0.76, 0.5, (g, w, h) => {
        g.fillStyle = '#f2eee4';
        g.beginPath();
        g.arc(w * 0.32, h * 0.5, h * 0.24, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = colour;
        g.beginPath();
        g.arc(w * 0.37, h * 0.5, h * 0.2, 0, Math.PI * 2);
        g.fill();
      }, shape);
      flag.position.set(0, top - 0.32, -0.39);
      const crescent = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14, Math.PI * 1.4), brass);
      crescent.position.y = top + 0.07;
      crescent.rotation.z = Math.PI * 0.8;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), brass);
      knob.position.y = top;
      group.add(flag, crescent, knob);
      break;
    }
    case 'steppe': {
      // The tug: no cloth, horse-tails hung in a ring under a brass disc and a trident.
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 12), brass);
      disc.position.y = top - 0.04;
      group.add(disc);
      const hair = surface(0x1d1a17, { roughness: 1 });
      const pale = surface(0xe8e2d4, { roughness: 1 });
      for (let tail = 0; tail < 7; tail += 1) {
        const angle = (tail / 7) * Math.PI * 2;
        const plume = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.6, 5), tail % 2 ? pale : hair);
        plume.position.set(Math.cos(angle) * 0.05, top - 0.36, Math.sin(angle) * 0.05);
        group.add(plume);
      }
      for (const side of [-1, 0, 1]) {
        const prong = new THREE.Mesh(new THREE.ConeGeometry(0.012, side ? 0.12 : 0.18, 5), steel);
        prong.position.set(0, top + (side ? 0.06 : 0.09), side * 0.04);
        group.add(prong);
      }
      break;
    }
    case 'mexica': {
      // The pamitl: a disc of feather-work in the side's colour, a gold rim, plumes above.
      group.add(featherDevice(colour, top));
      break;
    }
    default: {
      // The nobori: tall and narrow, hung from the staff and a crossbar at the top; a white crest.
      const flag = cloth(0.36, 1.25, (g, w, h) => {
        g.fillStyle = '#f2eee4';
        g.beginPath();
        g.arc(w * 0.5, h * 0.14, w * 0.3, 0, Math.PI * 2);
        g.fill();
      });
      flag.position.set(0, top - 0.68, -0.19);
      const bar = cylinder(0.009, 0.009, 0, 0.38, wood, 6);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(0, top - 0.04, -0.19);
      group.add(flag, bar);
    }
  }
  return group;
}

export function buildWeaponMesh(kind, envMap, colour = '#b3161b') {
  const spec = WEAPONS[kind];
  if (spec.flag) return buildStandard(spec, colour, envMap);
  if (kind === 'sica' || kind === 'trident') return buildArenaWeapon(kind, spec, envMap, steelMaterial);
  const group = new THREE.Group();
  const steel = steelMaterial(envMap, { vertexColors: false, color: 0xd9dde4 });
  const dark = surface(0x1b1b1f, { roughness: 0.6 });
  const leather = surface(0x3a2416, { roughness: 0.8 });
  const wood = surface(0x7a5530, { roughness: 0.7 });
  const brass = steelMaterial(envMap, { vertexColors: false, color: BRONZE, roughness: 0.35 });
  switch (kind) {
    case 'bow':
    case 'compositeBow': {
      // A recurved stave bowed towards the mark (+z), bound at the grip; the
      // string runs tip to tip behind it, drawn to the hand as the shot comes.
      // The composite bow is short, its stiff ears (siyahs) bent sharply forward.
      const bend = 0.16;
      const stave = new THREE.CatmullRomCurve3(kind === 'compositeBow' ? [
        new THREE.Vector3(0, -spec.handle, 0.02), new THREE.Vector3(0, -spec.handle * 0.8, -0.12), new THREE.Vector3(0, -spec.handle * 0.45, -0.07),
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, spec.length * 0.45, -0.07), new THREE.Vector3(0, spec.length * 0.8, -0.12), new THREE.Vector3(0, spec.length, 0.02),
      ] : [
        new THREE.Vector3(0, -spec.handle, -bend * 0.9), new THREE.Vector3(0, -spec.handle * 0.55, -bend * 0.15),
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, spec.length * 0.55, -bend * 0.15), new THREE.Vector3(0, spec.length, -bend * 0.9),
      ]);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(stave, 32, 0.012, 6, false), surface(0x2a1c14, { roughness: 0.55 })));
      group.add(cylinder(0.018, 0.018, -0.06, 0.06, surface(0x6a1e1a, { roughness: 0.8 }), 8));
      const string = new THREE.Line(new THREE.BufferGeometry().setFromPoints([stave.getPoint(0), new THREE.Vector3(0, 0, -bend * 0.9), stave.getPoint(1)]), new THREE.LineBasicMaterial({ color: 0xe8e2d2 }));
      string.userData.noOutline = true;
      string.frustumCulled = false;
      // The arrow on the string while it is drawn.
      const nocked = new THREE.Group();
      nocked.add(arrowMesh());
      nocked.visible = false;
      group.add(string, nocked);
      group.userData.bow = { string, nocked, tips: [stave.getPoint(0), stave.getPoint(1)], rest: new THREE.Vector3(0, 0, -bend * 0.9) };
      break;
    }
    case 'pistol': {
      // A modern striker-fired service pistol: polymer frame, steel slide,
      // the grip raked back under the hand, the barrel above it (+z is up).
      const polymer = surface(0x1d1f23, { roughness: 0.75 });
      const slideSteel = steelMaterial(envMap, { vertexColors: false, color: 0x34363c, roughness: 0.4 });
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
    case 'adams': {
      // The Adams revolver of 1851 (+z is up, y toward the muzzle): an
      // octagonal barrel forged with a solid frame and its top strap; the
      // five-chambered cylinder in the frame's window, the chamber mouths in
      // front, a cap on each nipple behind; the spurless double-action
      // hammer; the trigger guard and trigger; the chequered walnut grip
      // raked back, a steel butt cap. Blued steel, case-hardened colours on the frame.
      const blued = steelMaterial(envMap, { vertexColors: false, color: 0x262a34, roughness: 0.32 });
      const frameSteel = steelMaterial(envMap, { vertexColors: false, color: 0x4a4038, roughness: 0.38 });
      const walnut = surface(0x4a2a16, { roughness: 0.55 });
      const chequer = surface(0x3a2010, { roughness: 0.85 });
      const hole = surface(0x050506, { roughness: 1 });
      const copper = surface(0xb87333, { roughness: 0.35 });
      const bore = 0.05;
      const axis = bore - 0.013;
      const barrel = cylinder(0.0085, 0.0095, 0.066, spec.length, blued, 8);
      barrel.position.z = bore;
      barrel.rotation.y = Math.PI / 8;
      const muzzle = cylinder(0.0055, 0.0055, spec.length - 0.004, spec.length + 0.001, hole, 10);
      muzzle.position.z = bore;
      const lug = box([0.012, 0.05, 0.012], [0, 0.09, bore - 0.012], blued);
      // The frame round the cylinder: top strap, bottom, and the standing breech behind.
      const strap = box([0.016, 0.07, 0.008], [0, 0.03, bore + 0.009], frameSteel);
      const bottom = box([0.02, 0.06, 0.01], [0, 0.032, axis - 0.024], frameSteel);
      const breech = box([0.024, 0.014, 0.05], [0, -0.006, axis - 0.002], frameSteel);
      const cylinderMesh = cylinder(0.0185, 0.0185, 0.008, 0.056, blued, 15);
      cylinderMesh.position.z = axis;
      group.add(barrel, muzzle, lug, strap, bottom, breech, cylinderMesh);
      for (let chamber = 0; chamber < 5; chamber += 1) {
        const angle = (chamber / 5) * Math.PI * 2 + Math.PI / 2;
        const across = Math.cos(angle) * 0.012;
        const up = Math.sin(angle) * 0.012;
        const mouth = cylinder(0.0042, 0.0042, 0.055, 0.0565, hole, 8);
        mouth.position.set(across, 0, axis + up);
        const capOn = cylinder(0.003, 0.003, 0.002, 0.008, copper, 6);
        capOn.position.set(across * 0.85, 0, axis + up * 0.85);
        group.add(mouth, capOn);
      }
      // The spurless hammer rising behind the breech; the foresight at the muzzle.
      const hammer = box([0.008, 0.012, 0.024], [0, -0.016, bore + 0.004], blued, -0.35);
      const foresight = box([0.0025, 0.007, 0.006], [0, spec.length - 0.01, bore + 0.0095], blued);
      // The trigger guard and trigger.
      const guard = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0026, 6, 14, Math.PI * 1.15), frameSteel);
      guard.rotation.set(0, Math.PI / 2, Math.PI * 1.0);
      guard.position.set(0, 0.012, axis - 0.034);
      const trigger = box([0.004, 0.005, 0.02], [0, 0.006, axis - 0.03], blued, 0.35);
      // The grip, down and back, chequered, a steel cap.
      const grip = box([0.026, 0.032, 0.095], [0, -0.03, axis - 0.06], walnut, -0.5);
      const chequering = box([0.0275, 0.022, 0.05], [0, -0.034, axis - 0.066], chequer, -0.5);
      const buttCap = box([0.027, 0.034, 0.008], [0, -0.054, axis - 0.104], blued, -0.5);
      group.add(hammer, foresight, guard, trigger, grip, chequering, buttCap);
      break;
    }
    case 'rifle': {
      // An AR-15 carbine: upper and lower receiver, a free-float handguard,
      // the barrel and flash hider, a curved 30-round magazine, the pistol
      // grip, the buffer tube and collapsible stock, a red-dot optic (+z up).
      const polymer = surface(0x1d1f23, { roughness: 0.7 });
      const anodised = steelMaterial(envMap, { vertexColors: false, color: 0x26282c, roughness: 0.55 });
      const barrel = cylinder(0.008, 0.008, 0.44, spec.length, anodised, 8);
      barrel.position.z = 0.04;
      const buffer = cylinder(0.014, 0.014, -spec.handle + 0.06, -0.02, anodised, 10);
      buffer.position.z = 0.03;
      const optic = cylinder(0.018, 0.018, 0.05, 0.14, anodised, 12);
      optic.position.z = 0.095;
      group.add(
        box([0.03, 0.27, 0.05], [0, 0.07, 0.035], anodised), // receivers
        box([0.038, 0.26, 0.042], [0, 0.32, 0.04], polymer), // handguard
        box([0.02, 0.05, 0.14], [0, 0.12, -0.04], polymer, 0.2), // magazine
        box([0.024, 0.035, 0.085], [0, -0.01, -0.03], polymer, -0.35), // pistol grip
        box([0.032, 0.14, 0.06], [0, -spec.handle + 0.07, 0.02], polymer), // stock
        box([0.008, 0.03, 0.02], [0, 0.09, 0.07], anodised), // optic mount
        barrel, buffer, optic,
      );
      break;
    }
    case 'shotgun': {
      // A pump shotgun: the receiver, a long barrel over the magazine tube,
      // the sliding pump (fore-end) under it, a synthetic stock (+z up).
      const polymer = surface(0x1d1f23, { roughness: 0.7 });
      const blued = steelMaterial(envMap, { vertexColors: false, color: 0x2c2e33, roughness: 0.45 });
      const barrel = cylinder(0.011, 0.011, 0.08, spec.length, blued, 10);
      barrel.position.z = 0.04;
      const tube = cylinder(0.01, 0.01, 0.12, spec.length - 0.1, blued, 10);
      tube.position.z = 0.012;
      group.add(
        box([0.034, 0.2, 0.06], [0, 0.03, 0.025], blued), // receiver
        box([0.044, 0.17, 0.046], [0, 0.36, 0.012], polymer), // pump
        box([0.026, 0.04, 0.085], [0, -0.02, -0.03], polymer, -0.35), // grip
        box([0.036, spec.handle - 0.02, 0.07], [0, -spec.handle / 2 - 0.02, 0.0], polymer, 0.1), // stock
        barrel, tube,
      );
      break;
    }
    case 'matchlock': {
      // A teppō / arquebus: a long octagonal iron barrel on a slender wooden
      // stock, brass bands, the serpentine and pan by the trigger hand with
      // the match smouldering in it, the ramrod under the barrel (+z is up).
      const barrelIron = steelMaterial(envMap, { vertexColors: false, color: 0x3a3c40, roughness: 0.45 });
      const barrel = cylinder(0.011, 0.014, 0, spec.length, barrelIron, 8);
      barrel.position.z = 0.03;
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.032, spec.handle + 0.12, 0.05), wood);
      stock.position.set(0, -spec.handle / 2 + 0.04, -0.005);
      stock.rotation.x = 0.08;
      const forestock = new THREE.Mesh(new THREE.BoxGeometry(0.03, spec.length - 0.12, 0.026), wood);
      forestock.position.set(0, (spec.length - 0.12) / 2 + 0.04, 0.012);
      const ramrod = cylinder(0.004, 0.004, 0.08, spec.length - 0.04, dark, 6);
      ramrod.position.z = -0.006;
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.07, 0.02), brass);
      lock.position.set(0, 0.03, 0.022);
      const serpentine = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.04), brass);
      serpentine.position.set(0.02, 0.0, 0.045);
      serpentine.rotation.x = -0.5;
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
      ember.position.set(0.02, 0.012, 0.064);
      group.add(barrel, stock, forestock, ramrod, lock, serpentine, ember);
      for (const at of [0.35, 0.7, 0.96]) {
        const band = cylinder(0.016, 0.016, at - 0.008, at + 0.008, brass, 8);
        band.position.z = 0.03;
        group.add(band);
      }
      break;
    }
    case 'crossbow':
    case 'nu': {
      // A crossbow (+z is up, y along the tiller): the tiller from the butt
      // to the nose, the prod across the nose, the string drawn back to the
      // nut, the trigger under it. The European one has a steel prod and a
      // stirrup at the nose to span it by; the Chinese nu a long lacquered
      // composite prod, a bronze lock box with its sighting post, no stirrup.
      const chinese = kind === 'nu';
      const nose = spec.length;
      const tiller = new THREE.Mesh(new THREE.BoxGeometry(0.034, nose + spec.handle, 0.044), wood);
      tiller.position.set(0, (nose - spec.handle) / 2, 0);
      group.add(tiller);
      const span = chinese ? 0.44 : 0.33;
      const prodMaterial = chinese ? surface(0x1c1612, { roughness: 0.45 }) : steelMaterial(envMap, { vertexColors: false, color: 0x8a8e96, roughness: 0.35 });
      // Drawn: the prod's arms bent back toward the nut.
      const tips = [-1, 1].map((side) => new THREE.Vector3(side * span, nose - (chinese ? 0.13 : 0.11), 0.03));
      const prod = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([tips[0], new THREE.Vector3(-span * 0.5, nose - 0.04, 0.03), new THREE.Vector3(0, nose - 0.02, 0.03), new THREE.Vector3(span * 0.5, nose - 0.04, 0.03), tips[1]]), 20, chinese ? 0.01 : 0.008, 6, false), prodMaterial);
      group.add(prod);
      const nut = new THREE.Vector3(0, chinese ? 0.03 : 0.06, 0.03);
      const cord = surface(0xe8e0c8, { roughness: 0.9 });
      for (const tip of tips) {
        const length = tip.distanceTo(nut);
        const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, length, 4), cord);
        string.position.copy(tip).add(nut).multiplyScalar(0.5);
        string.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nut.clone().sub(tip).normalize());
        group.add(string);
      }
      if (chinese) {
        // The bronze lock box under the nut, its sighting post (wangshan), the trigger hanging below.
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.05), brass);
        lock.position.set(0, 0.02, 0.01);
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.05), brass);
        sight.position.set(0, -0.02, 0.055);
        const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.014, 0.07), brass);
        trigger.position.set(0, -0.02, -0.045);
        // Bindings round the prod's middle and arms.
        for (const x of [-span * 0.55, 0, span * 0.55]) {
          const binding = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.02, 8), surface(0x8a1a14, { roughness: 0.8 }));
          binding.rotation.z = Math.PI / 2;
          binding.position.set(x, nose - (x === 0 ? 0.02 : 0.045), 0.03);
          group.add(binding);
        }
        group.add(lock, sight, trigger);
      } else {
        // The steel nut, the long trigger lever under the tiller, the stirrup at the nose.
        const nutMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 10), steel);
        nutMesh.rotation.z = Math.PI / 2;
        nutMesh.position.copy(nut);
        const lever = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.2, 0.01), steel);
        lever.position.set(0, -0.06, -0.035);
        lever.rotation.x = 0.12;
        const stirrup = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.007, 6, 16), steel);
        stirrup.position.set(0, nose + 0.05, 0);
        const binding = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.06), surface(0x3a2416, { roughness: 0.8 }));
        binding.position.set(0, nose - 0.02, 0.02);
        group.add(nutMesh, lever, stirrup, binding);
      }
      break;
    }
    case 'rapier': {
      // A long, slender blade; a swept hilt of curving bars round the hand, a cup, a long cross.
      group.add(bladeMesh(bladeGeometry(0.03, spec.length - 0.03, 0.018, 0.006, 0.25), steel));
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.26), steel);
      cross.position.y = 0.02;
      const cup = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel);
      cup.position.y = 0.03;
      cup.rotation.x = Math.PI;
      group.add(cross, cup);
      for (const side of [1, -1]) {
        const bar = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.004, 6, 14, Math.PI), steel);
        bar.position.set(0, -0.03, side * 0.02);
        bar.rotation.y = Math.PI / 2;
        group.add(bar);
      }
      const grip = cylinder(0.013, 0.014, -spec.handle + 0.02, 0.012, surface(0x2a1d14, { roughness: 0.8 }));
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), steel);
      pommel.position.y = -spec.handle;
      group.add(grip, pommel);
      break;
    }
    case 'espada': {
      // A Spanish cut-and-thrust sword: a narrow straight blade, a cross with
      // long quillons and a side ring, a wire-bound grip, a round pommel.
      group.add(bladeMesh(bladeGeometry(0.03, spec.length - 0.03, 0.03, 0.006, 0.12), steel));
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.22), steel);
      cross.position.y = 0.022;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 14), steel);
      ring.position.set(0.03, 0.05, 0);
      ring.rotation.y = Math.PI / 2;
      const grip = cylinder(0.014, 0.015, -spec.handle + 0.02, 0.012, surface(0x2a1d14, { roughness: 0.8 }));
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 10), steel);
      pommel.position.y = -spec.handle;
      group.add(cross, ring, grip, pommel);
      break;
    }
    case 'macuahuitl': {
      // A flat oak paddle, its two edges set with black obsidian teeth.
      const oak = surface(0x5a3a22, { roughness: 0.7 });
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.016, spec.length - spec.strikeFrom + 0.1, 0.075), oak);
      paddle.position.y = (spec.length + spec.strikeFrom - 0.1) / 2;
      group.add(paddle, cylinder(0.016, 0.018, -spec.handle, spec.strikeFrom, oak, 8));
      const glass = new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.08, metalness: 0.3 });
      for (let tooth = 0; tooth < 7; tooth += 1) {
        const y = spec.strikeFrom + ((spec.length - spec.strikeFrom - 0.04) * tooth) / 6;
        for (const side of [1, -1]) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.06, 0.025), glass);
          blade.position.set(0, y, side * 0.045);
          group.add(blade);
        }
      }
      break;
    }
    case 'tepoztopilli': {
      // A long shaft and a broad wooden head, edged with obsidian.
      const headStart = spec.length - 0.36;
      group.add(cylinder(0.015, 0.017, -spec.handle, headStart + 0.02, wood, 8));
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.36, 0.08), surface(0x6a4428, { roughness: 0.7 }));
      head.position.y = headStart + 0.18;
      const point = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 4), surface(0x6a4428));
      point.position.y = spec.length + 0.02;
      group.add(head, point);
      const glass = new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.08, metalness: 0.3 });
      for (let tooth = 0; tooth < 5; tooth += 1) {
        for (const side of [1, -1]) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.05, 0.02), glass);
          blade.position.set(0, headStart + 0.04 + tooth * 0.07, side * 0.048);
          group.add(blade);
        }
      }
      break;
    }
    case 'staff': {
      // A plain wooden staff, a little thicker at the middle; iron ferrules at both ends.
      group.add(cylinder(0.014, 0.017, -spec.handle, 0, wood, 10), cylinder(0.017, 0.014, 0, spec.length, wood, 10));
      group.add(cylinder(0.016, 0.016, spec.length - 0.05, spec.length, dark, 10), cylinder(0.016, 0.016, -spec.handle, -spec.handle + 0.05, dark, 10));
      break;
    }
    case 'kanabo': {
      // An oak club swelling to an eight-sided head, rows of iron studs over its upper half, a grip and a pommel ring.
      const oak = surface(0x3a2416, { roughness: 0.75 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(spec.radius * 1.15, spec.radius * 0.45, spec.length + spec.handle, 8), oak);
      body.position.y = (spec.length - spec.handle) / 2;
      group.add(body);
      const studs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.011, 6, 4), steelMaterial(envMap, { vertexColors: false, color: 0x5a5c62, roughness: 0.5 }), 8 * 7);
      const place = new THREE.Object3D();
      let at = 0;
      for (let row = 0; row < 7; row += 1) {
        const y = spec.strikeFrom + ((spec.length - spec.strikeFrom - 0.04) * row) / 6;
        const radius = spec.radius * 0.45 + (spec.radius * 0.7 * (y + spec.handle)) / (spec.length + spec.handle);
        for (let around = 0; around < 8; around += 1) {
          const angle = ((around + (row % 2) * 0.5) / 8) * Math.PI * 2;
          place.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
          place.updateMatrix();
          studs.setMatrixAt(at, place.matrix);
          at += 1;
        }
      }
      const pommel = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 6, 12), steelMaterial(envMap, { vertexColors: false, color: 0x5a5c62 }));
      pommel.position.y = -spec.handle;
      group.add(studs, pommel);
      break;
    }
    case 'threeEyed': {
      // Three short iron barrels bound in a triangle on the end of a wooden
      // shaft, iron bands round them, a touch-hole on each.
      const iron = steelMaterial(envMap, { vertexColors: false, color: 0x3a3c40, roughness: 0.55 });
      group.add(cylinder(0.018, 0.02, -spec.handle, spec.strikeFrom + 0.02, wood, 10));
      for (let barrel = 0; barrel < 3; barrel += 1) {
        const angle = (barrel / 3) * Math.PI * 2;
        const tube = cylinder(0.019, 0.022, spec.strikeFrom, spec.length, iron, 10);
        tube.position.x = Math.cos(angle) * 0.022;
        tube.position.z = Math.sin(angle) * 0.022;
        const hole = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 4), dark);
        hole.position.set(Math.cos(angle) * 0.04, spec.strikeFrom + 0.06, Math.sin(angle) * 0.04);
        group.add(tube, hole);
      }
      for (const y of [spec.strikeFrom + 0.03, spec.length - 0.02]) group.add(cylinder(0.05, 0.05, y - 0.015, y + 0.015, iron, 12));
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
    case 'wakizashi':
    case 'odachi':
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
    case 'dagger':
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
    case 'dao': {
      // A willow-leaf sabre: a gentle curve to the point, a round guard, a
      // cord-wrapped grip and a red tassel from the pommel ring. Held, as a
      // sabre is, with its edge (and the curve's outside) away from the
      // wrist's top: the blade turned half round the grip from the katana's.
      const sabre = bladeMesh(bladeGeometry(0.04, spec.length - 0.04, 0.036, 0.007, 0.14, (y) => -0.05 * ((y - 0.04) / (spec.length - 0.04)) ** 2), steel);
      sabre.rotation.y = Math.PI;
      group.add(sabre);
      const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 18), brass);
      guard.position.y = 0.028;
      const grip = cylinder(0.016, 0.017, -spec.handle + 0.02, 0.022, surface(0x3a1a14, { roughness: 0.8 }));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 12), brass);
      ring.position.y = -spec.handle;
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.09, 8), surface(0xb3161b, { roughness: 0.9 }));
      tassel.position.y = -spec.handle - 0.06;
      group.add(guard, grip, ring, tassel);
      break;
    }
    case 'langya':
    case 'flangedMace': {
      // An iron-bound wooden haft, a leather grip; the head: the wolf-tooth
      // mace's iron-clad cylinder bristling with teeth, or the flanged mace's
      // six iron blades round a core.
      const iron = steelMaterial(envMap, { vertexColors: false, color: 0x55585e, roughness: 0.5 });
      group.add(cylinder(0.015, 0.016, -spec.handle, spec.strikeFrom, kind === 'langya' ? wood : iron, 10));
      group.add(cylinder(0.018, 0.018, -spec.handle, 0.0, leather, 10));
      if (kind === 'langya') {
        group.add(cylinder(spec.radius, spec.radius, spec.strikeFrom, spec.length, iron, 10));
        const teeth = new THREE.InstancedMesh(new THREE.ConeGeometry(0.008, 0.03, 5), iron, 6 * 5);
        const place = new THREE.Object3D();
        let at = 0;
        for (let row = 0; row < 5; row += 1) {
          const y = spec.strikeFrom + 0.03 + ((spec.length - spec.strikeFrom - 0.06) * row) / 4;
          for (let around = 0; around < 6; around += 1) {
            const angle = ((around + (row % 2) * 0.5) / 6) * Math.PI * 2;
            place.position.set(Math.cos(angle) * (spec.radius + 0.012), y, Math.sin(angle) * (spec.radius + 0.012));
            place.rotation.set(0, -angle, -Math.PI / 2);
            place.updateMatrix();
            teeth.setMatrixAt(at, place.matrix);
            at += 1;
          }
        }
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 6), iron);
        tip.position.y = spec.length + 0.025;
        group.add(teeth, tip);
      } else {
        group.add(cylinder(0.016, 0.016, spec.strikeFrom, spec.length, iron, 10));
        for (let flange = 0; flange < 6; flange += 1) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(spec.radius, spec.length - spec.strikeFrom, 0.006), iron);
          const angle = (flange / 6) * Math.PI * 2;
          blade.position.set(Math.cos(angle) * spec.radius * 0.5, (spec.strikeFrom + spec.length) / 2, Math.sin(angle) * spec.radius * 0.5);
          blade.rotation.y = -angle;
          group.add(blade);
        }
      }
      break;
    }
    case 'saber':
    case 'yatagan': {
      // The sabre: a long, gently curved blade, a cross guard, a pistol grip.
      // The yatagan: shorter, curving forward towards the edge, no guard,
      // its grip ending in two "ears".
      const forward = kind === 'yatagan';
      const curve = (y) => (forward ? 0.04 : -0.06) * ((y - 0.04) / (spec.length - 0.04)) ** (forward ? 1.4 : 2);
      const blade = bladeMesh(bladeGeometry(0.04, spec.length - 0.04, forward ? 0.034 : 0.032, 0.007, 0.14, curve), steel);
      blade.rotation.y = Math.PI;
      group.add(blade);
      const grip = cylinder(0.015, 0.017, -spec.handle + 0.02, 0.03, surface(forward ? 0xe8e0cc : 0x2a1c14, { roughness: 0.6 }));
      group.add(grip);
      if (forward) {
        for (const side of [1, -1]) {
          const ear = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), surface(0xe8e0cc, { roughness: 0.6 }));
          ear.scale.set(1, 0.6, 0.5);
          ear.position.set(side * 0.018, -spec.handle + 0.01, 0);
          group.add(ear);
        }
      } else {
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.018), brass);
        guard.position.y = 0.032;
        group.add(guard);
      }
      break;
    }
    case 'guandao': {
      // A long red-lacquered shaft, a brass dragon-mouth collar, the broad
      // crescent blade with a spine notch, a red tassel, an iron butt spike.
      const bladeStart = spec.strikeFrom - 0.05;
      const bladeLength = spec.length - bladeStart;
      group.add(cylinder(0.018, 0.02, -spec.handle, bladeStart + 0.02, surface(0x5a1612, { roughness: 0.55 }), 10));
      const bend = (y) => -0.09 * ((y - bladeStart) / bladeLength) ** 1.6;
      group.add(bladeMesh(bladeGeometry(bladeStart, bladeLength, 0.085, 0.01, 0.2, bend), steel));
      const notch = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), steel);
      notch.position.set(0, bladeStart + bladeLength * 0.45, -0.05);
      notch.rotation.x = -Math.PI / 2;
      const collar = cylinder(0.03, 0.024, bladeStart - 0.09, bladeStart + 0.01, brass, 10);
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 10), surface(0xb3161b, { roughness: 0.9 }));
      tassel.position.y = bladeStart - 0.15;
      tassel.rotation.x = Math.PI;
      const spike = cylinder(0.002, 0.018, -spec.handle - 0.12, -spec.handle + 0.01, steel, 8);
      group.add(notch, collar, tassel, spike);
      break;
    }
    case 'qinglong': {
      // The Green Dragon Crescent Blade: a dark green shaft bound in gold, a
      // gilt dragon's head at the blade whose jaws hold it, a broad crescent
      // blade with a spine notch and a curl at its back, a red tassel.
      const bladeStart = spec.strikeFrom - 0.05;
      const bladeLength = spec.length - bladeStart;
      const green = surface(0x1f4a2c, { roughness: 0.5 });
      const gilt = steelMaterial(envMap, { vertexColors: false, color: 0xc9a24a, roughness: 0.3 });
      group.add(cylinder(0.018, 0.02, -spec.handle, bladeStart + 0.02, green, 10));
      for (const y of [-spec.handle + 0.04, bladeStart * 0.3, bladeStart * 0.62, bladeStart - 0.16]) group.add(cylinder(0.021, 0.021, y - 0.012, y + 0.012, gilt, 10));
      const bend = (y) => -0.1 * ((y - bladeStart) / bladeLength) ** 1.5;
      group.add(bladeMesh(bladeGeometry(bladeStart, bladeLength, 0.1, 0.011, 0.22, bend), steel));
      const notch = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 6), steel);
      notch.position.set(0, bladeStart + bladeLength * 0.42, -0.06);
      notch.rotation.x = -Math.PI / 2;
      // The curl on the blade's back, near its foot.
      const curl = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 14, Math.PI * 1.4), steel);
      curl.rotation.y = Math.PI / 2;
      curl.position.set(0, bladeStart + 0.1, -0.05);
      // The dragon's head: a snout along the blade's foot, open jaws, eyes, a horn back.
      const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), gilt);
      skull.scale.set(0.034, 0.06, 0.04);
      skull.position.y = bladeStart - 0.02;
      const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.07, 8), gilt);
      jaw.position.set(0, bladeStart + 0.03, 0.025);
      jaw.rotation.x = 0.5;
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.07, 6), gilt);
      horn.position.set(0, bladeStart - 0.05, -0.035);
      horn.rotation.x = -2.4;
      for (const side of [1, -1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), surface(0xb3161b));
        eye.position.set(side * 0.03, bladeStart - 0.005, 0.02);
        group.add(eye);
      }
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 10), surface(0xb3161b, { roughness: 0.9 }));
      tassel.position.y = bladeStart - 0.2;
      tassel.rotation.x = Math.PI;
      const spike = cylinder(0.002, 0.018, -spec.handle - 0.12, -spec.handle + 0.01, gilt, 8);
      group.add(notch, curl, skull, jaw, horn, tassel, spike);
      break;
    }
    case 'jian': {
      // The straight double-edged jian: a ridged blade tapering to its
      // point, a small bronze guard, a cord-wound grip, a bronze pommel, a
      // silk tassel from it.
      group.add(bladeMesh(bladeGeometry(0.03, spec.length - 0.03, 0.036, 0.007, 0.12), steel));
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.004, spec.length * 0.85, 0.004), steel);
      ridge.position.set(0.004, 0.03 + spec.length * 0.42, 0);
      ridge.userData.blade = true;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.024, 0.075), brass);
      guard.position.y = 0.012;
      const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.03, 10), brass);
      pommel.position.y = -spec.handle - 0.008;
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.12, 8), surface(0xb3161b, { roughness: 0.9 }));
      tassel.position.y = -spec.handle - 0.09;
      tassel.rotation.x = Math.PI;
      group.add(ridge, guard, pommel, tassel, cylinder(0.014, 0.015, -spec.handle, 0.0, surface(0x1c1a20, { roughness: 0.9 })));
      break;
    }
    case 'bat': {
      // A wooden bat: knob, taped handle thickening to the barrel, a rounded end.
      const ash = surface(0xc9a26a, { roughness: 0.55 });
      const taper = new THREE.Mesh(new THREE.CylinderGeometry(spec.radius, 0.0125, spec.length + spec.handle - 0.02, 14), ash);
      taper.position.y = (spec.length - spec.handle) / 2 - 0.01;
      const end = new THREE.Mesh(new THREE.SphereGeometry(spec.radius, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), ash);
      end.position.y = spec.length - 0.02;
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.016, 14), ash);
      knob.position.y = -spec.handle;
      group.add(taper, end, knob, cylinder(0.0145, 0.0155, -spec.handle + 0.01, -spec.handle + 0.2, surface(0x1a1a1c, { roughness: 0.9 }), 12));
      break;
    }
    case 'whip': {
      // The handle: a stiff stock bound in plaited leather, a knob at the butt, the thong's root at its end (the thong is drawn from the rope).
      const plait = surface(0x3a2416, { roughness: 0.8 });
      group.add(cylinder(0.014, 0.016, -spec.handle, spec.length, plait, 8));
      for (let band = 0; band < 5; band += 1) {
        const y = -spec.handle + 0.02 + band * ((spec.length + spec.handle - 0.04) / 4);
        group.add(cylinder(0.0175, 0.0175, y - 0.006, y + 0.006, surface(0x2a180e, { roughness: 0.9 }), 8));
      }
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), plait);
      knob.position.y = -spec.handle - 0.01;
      group.add(knob);
      break;
    }
    case 'armingSword': {
      // A stiff, tapering blade with a fuller, a straight cross, a leather
      // grip, a wheel pommel.
      group.add(bladeMesh(bladeGeometry(0.03, spec.length - 0.03, 0.048, 0.008, 0.2), steel));
      const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.003, spec.length * 0.55, 0.01), dark);
      fuller.position.set(0.0045, 0.03 + spec.length * 0.3, 0);
      fuller.userData.blade = true;
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.22), steel);
      cross.position.y = 0.02;
      const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.016, 16), steel);
      pommel.rotation.x = Math.PI / 2;
      pommel.position.y = -spec.handle - 0.012;
      group.add(fuller, cross, pommel, cylinder(0.014, 0.015, -spec.handle, 0.012, leather));
      break;
    }
    case 'clava': {
      // Hercules's club: a length of wood swelling to its head, the stubs of
      // branches cut off along it, its butt bound with a cord.
      const oak = surface(0x5a3a1e, { roughness: 0.85 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(spec.radius, spec.radius * 0.42, spec.length + spec.handle, 9, 4), oak);
      body.position.y = (spec.length - spec.handle) / 2;
      const head = new THREE.Mesh(new THREE.SphereGeometry(spec.radius * 1.05, 10, 8), oak);
      head.position.y = spec.length - 0.01;
      group.add(body, head);
      for (let knot = 0; knot < 9; knot += 1) {
        const y = spec.strikeFrom * 0.4 + ((spec.length - spec.strikeFrom * 0.4) * knot) / 9;
        const across = spec.radius * 0.42 + ((spec.radius * 0.58) * (y + spec.handle)) / (spec.length + spec.handle);
        const angle = knot * 2.4;
        const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.013, 0.028, 6), oak);
        stub.position.set(Math.cos(angle) * across, y, Math.sin(angle) * across);
        stub.lookAt(new THREE.Vector3(Math.cos(angle) * 2, y, Math.sin(angle) * 2));
        stub.rotateX(Math.PI / 2);
        group.add(stub);
      }
      for (let turn = 0; turn < 4; turn += 1) group.add(cylinder(spec.radius * 0.48, spec.radius * 0.48, -spec.handle + 0.02 + turn * 0.025, -spec.handle + 0.034 + turn * 0.025, leather, 9));
      break;
    }
    case 'shortSword':
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
  // The arena's shaped shields and the scissor's crescent, in detail.
  if (spec.shape || spec.look === 'scissores') return buildArenaShield(spec, envMap, steelMaterial);
  const group = new THREE.Group();
  if (spec.look === 'steel' || spec.look === 'feather') {
    // The rodela: a round steel shield, domed, rimmed and bossed. The
    // chimalli: a disc of hide and feathers in bands, a fringe of feathers below.
    const steelFace = spec.look === 'steel';
    const faceMaterial = steelFace ? steelMaterial(envMap, { vertexColors: false, color: 0x9aa0a8, roughness: 0.35, side: THREE.DoubleSide }) : surface(0xece4d0, { roughness: 0.8 });
    const face = new THREE.Mesh(new THREE.CylinderGeometry(spec.radius, spec.radius * 0.97, 0.025, 32), faceMaterial);
    face.rotation.x = Math.PI / 2;
    group.add(face);
    if (steelFace) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(spec.radius, 0.012, 8, 36), faceMaterial);
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), faceMaterial);
      boss.rotation.x = Math.PI / 2;
      boss.position.z = 0.012;
      group.add(rim, boss);
    } else {
      // Bands of colour: red, turquoise, gold, from the rim in.
      [[0.86, 0xb3161b], [0.62, 0x2a8a8a], [0.36, 0xd6a743]].forEach(([share, colour]) => {
        const band = new THREE.Mesh(new THREE.RingGeometry(spec.radius * share * 0.72, spec.radius * share, 28), surface(colour, { roughness: 0.8 }));
        band.position.z = 0.014;
        group.add(band);
      });
      for (let feather = 0; feather < 7; feather += 1) {
        const quill = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.16, 5), surface(feather % 2 ? 0x1f8a5a : 0xb3161b));
        quill.position.set((feather - 3) * 0.06, -spec.radius - 0.06, 0);
        quill.rotation.z = Math.PI;
        group.add(quill);
      }
    }
    for (const mesh of group.children) {
      mesh.castShadow = true;
      if (mesh === face) mesh.add(outlineFor(mesh, 0.003));
    }
    return group;
  }
  if (spec.look === 'ming') {
    // Lacquered red wood, a black ring painted inside an iron rim, a gilt boss.
    const face = new THREE.Mesh(new THREE.CylinderGeometry(spec.radius, spec.radius * 0.97, 0.03, 32), surface(0x9a1c18, { roughness: 0.5 }));
    face.rotation.x = Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(spec.radius * 0.66, 0.016, 6, 30), surface(0x151515, { roughness: 0.6 }));
    ring.position.z = 0.016;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(spec.radius, 0.012, 8, 36), steelMaterial(envMap, { vertexColors: false, color: 0x5a5c62, roughness: 0.45 }));
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), steelMaterial(envMap, { vertexColors: false, color: BRONZE, roughness: 0.32 }));
    boss.rotation.x = Math.PI / 2;
    boss.position.z = 0.015;
    group.add(face, ring, rim, boss);
    for (const mesh of [face, rim, boss]) {
      mesh.castShadow = true;
      mesh.add(outlineFor(mesh, 0.003));
    }
    return group;
  }
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

/**
 * A crowd fighter's weapon or shield: drawn with every other copy of it in
 * one instanced batch (see crowdview.js), without ink. What moves on it (a
 * bow's string and nocked arrow) stays his own, in the group returned.
 */
function crowdArms(view, key, build) {
  const batch = crowdBatch(view, key, build);
  let group = new THREE.Group();
  if (batch.live) {
    group = build();
    const drawn = [];
    group.traverseVisible((object) => {
      if (object.isMesh) drawn.push(object);
    });
    for (const mesh of drawn) mesh.parent.remove(mesh);
  }
  group.userData.batch = batch;
  return group;
}

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
    const key = weapon.colour ? `${weapon.kind}:${weapon.colour}` : weapon.kind;
    if (arms.kind !== key) {
      if (arms.weapon) {
        fighterView.group.remove(arms.weapon);
        // A crowd member's weapon is the batch's, shared: only his own is freed.
        if (!fighterView.baked) disposeObject(arms.weapon);
      }
      arms.weapon = fighterView.baked ? crowdArms(view, key, () => buildWeaponMesh(weapon.kind, view.steelEnv, weapon.colour)) : buildWeaponMesh(weapon.kind, view.steelEnv, weapon.colour);
      arms.kind = key;
      fighterView.group.add(arms.weapon);
    }
    // Along the blade, the edge turned the way the forearm's front faces.
    const hand = point(fighter.x, P[`${weapon.main}Hand`]);
    const along = toVector(weapon.dir).normalize();
    let edge;
    if (weapon.spec.bow && weapon.facing) {
      // The bow's back to the mark.
      edge = toVector(weapon.facing).sub(along.clone().multiplyScalar(toVector(weapon.facing).dot(along)));
      if (edge.lengthSq() < 1e-6) edge = new THREE.Vector3(1, 0, 0);
      edge.normalize();
    } else if (weapon.spec.edgeUp) {
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
    if (arms.weapon.userData.bow) drawString(arms.weapon, fighter);
    if (showing) arms.weapon.userData.batch?.add(arms.weapon.matrix);
  } else if (arms.weapon) {
    fighterView.group.remove(arms.weapon);
    arms.weapon = null;
    arms.kind = null;
  }
  // The shield gone from his arm (dropped, wrenched off) or another taken up: the old drawing goes.
  if (arms.shield && arms.shieldKind !== fighter.shield?.kind) {
    fighterView.group.remove(arms.shield);
    if (!fighterView.baked) disposeObject(arms.shield);
    arms.shield = null;
  }
  if (fighter.shield) {
    if (!arms.shield) {
      arms.shieldKind = fighter.shield.kind;
      const build = () => buildShieldMesh(fighter.shield.spec, view.steelEnv);
      arms.shield = fighterView.baked ? crowdArms(view, `shield:${fighter.shield.kind}`, build) : build();
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
    if (showing) arms.shield.userData.batch?.add(arms.shield.matrix);
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
    // A crowd fighter's ink has its own index: it loses the part too.
    const ink = mesh.userData.ink?.geometry;
    if (ink && ink !== mesh.geometry) {
      const skinIndex = ink.attributes.skinIndex;
      const kept = [];
      const index = ink.index.array;
      for (let corner = 0; corner < index.length; corner += 3) {
        if (![0, 1, 2].every((offset) => boneIndices.has(skinIndex.getX(index[corner + offset])))) kept.push(index[corner], index[corner + 1], index[corner + 2]);
      }
      ink.setIndex(kept);
    }
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
// Scratch for drawing resting debris into its batch.
const restMatrix = new THREE.Matrix4();
const restGrip = new THREE.Matrix4();
const restAt = new THREE.Vector3();
const restTurn = new THREE.Quaternion();
const restScale = new THREE.Vector3(1, 1, 1);

export function updateDebris(view, world) {
  view.pieces ??= new Map();
  for (const debris of world.debris ?? []) {
    let mesh = view.pieces.get(debris.id);
    // Picked up: it is in someone's hand now, drawn there.
    if (debris.taken) {
      if (mesh) {
        view.scene.remove(mesh);
        disposeObject(mesh);
        view.pieces.delete(debris.id);
      }
      continue;
    }
    // A dropped shield: its own mesh, turned as it lies (its frame: across, up, facing out).
    if (debris.kind === 'shield') {
      if (!mesh) {
        mesh = buildShieldMesh(SHIELDS[debris.shield], view.steelEnv);
        view.scene.add(mesh);
        view.pieces.set(debris.id, mesh);
      }
      mesh.position.set(debris.x[0], debris.x[1], debris.x[2]);
      mesh.quaternion.set(debris.q[0], debris.q[1], debris.q[2], debris.q[3]);
      continue;
    }
    if (debris.kind !== 'weapon') continue;
    const spec = WEAPONS[debris.weapon];
    // At rest on the floor, it is drawn with every other of its kind in one
    // instanced batch: a battle's dropped weapons cost a few draw calls, not
    // one per piece per weapon.
    if (debris.resting && !spec.bow) {
      if (mesh) {
        view.scene.remove(mesh);
        disposeObject(mesh);
        view.pieces.delete(debris.id);
      }
      const batch = crowdBatch(view, `debris:${debris.weapon}:${debris.colour ?? ''}`, () => buildWeaponMesh(debris.weapon, view.steelEnv, debris.colour));
      restMatrix.compose(restAt.set(debris.x[0], debris.x[1], debris.x[2]), restTurn.set(debris.q[0], debris.q[1], debris.q[2], debris.q[3]), restScale);
      batch.add(restMatrix.multiply(restGrip.makeTranslation(0, -(spec.length - spec.handle) / 2, 0)));
      continue;
    }
    if (!mesh) {
      mesh = new THREE.Group();
      const weapon = buildWeaponMesh(debris.weapon, view.steelEnv, debris.colour);
      // The debris point is the weapon's middle; the mesh's origin is its grip.
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
  for (const mesh of view.pieces?.values() ?? []) {
    view.scene.remove(mesh);
    disposeObject(mesh);
  }
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

const SHOT = { flashSeconds: 0.06, tracerSeconds: 0.08, smokeSeconds: 2.5 };

/** A shot: the flash at the muzzle, a streak to where it went, and what it hit. */
export function spawnShot(view, event) {
  const shots = view.shots ?? (view.shots = []);
  const from = toVector(event.from);
  const to = toVector(event.to);
  const length = from.distanceTo(to);
  const tracer = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, length, 4, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85, depthWrite: false }));
  tracer.position.copy(from).lerp(to, 0.5);
  tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  const heavy = WEAPONS[event.weapon]?.shot;
  const flash = new THREE.Mesh(new THREE.SphereGeometry(heavy ? 0.12 : 0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc35a, transparent: true, opacity: 1, depthWrite: false }));
  flash.position.copy(from);
  view.scene.add(tracer, flash);
  shots.push({ tracer, flash, age: 0 });
  // Black powder: a cloud of white smoke hangs where the gun went off.
  if (heavy) {
    // A few soft puffs, not one ball, sharing one fading material.
    const material = new THREE.MeshLambertMaterial({ color: 0xe9e6df, transparent: true, opacity: 0.6, depthWrite: false });
    const smoke = new THREE.Group();
    smoke.material = material;
    const ahead = to.clone().sub(from).normalize();
    for (let puff = 0; puff < 5; puff += 1) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07 + Math.random() * 0.07, 8, 6), material);
      ball.position.copy(ahead).multiplyScalar(0.1 + puff * 0.08).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(0.12));
      smoke.add(ball);
    }
    smoke.position.copy(from);
    smoke.geometry = { dispose() { for (const ball of smoke.children) ball.geometry.dispose(); } };
    view.scene.add(smoke);
    shots.push({ smoke, age: 0 });
  }
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
    if (shot.smoke) {
      // The smoke swells, drifts up and thins over a couple of seconds.
      const share = shot.age / SHOT.smokeSeconds;
      shot.smoke.scale.setScalar(1 + share * 3);
      shot.smoke.position.y += dt * 0.15;
      shot.smoke.material.opacity = 0.6 * Math.max(0, 1 - share);
      if (share < 1) return true;
      view.scene.remove(shot.smoke);
      shot.smoke.geometry.dispose();
      shot.smoke.material.dispose();
      return false;
    }
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

// ---- Arrows -----------------------------------------------------------------

/** An arrow along +y from its nock (0) to its head: shaft, fletching, point. */
function arrowMesh(length = ARROW.length, bolt = false) {
  // A crossbow's bolt: short and thick, a square iron head, two stiff vanes of leather or wood.
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(bolt ? 0.006 : 0.004, bolt ? 0.006 : 0.004, length, 5), surface(0xc8a878, { roughness: 0.7 }));
  shaft.position.y = length / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(bolt ? 0.011 : 0.009, bolt ? 0.04 : 0.05, bolt ? 4 : 6), surface(0x3a3c40, { roughness: 0.4 }));
  head.position.y = length + 0.02;
  group.add(shaft, head);
  const vanes = bolt ? [0, Math.PI] : [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
  for (const turn of vanes) {
    const vane = new THREE.Mesh(new THREE.PlaneGeometry(bolt ? 0.018 : 0.022, bolt ? 0.06 : 0.09), new THREE.MeshBasicMaterial({ color: bolt ? 0x6a4a2a : 0xf0ece4, side: THREE.DoubleSide }));
    vane.position.set(Math.cos(turn) * 0.011, bolt ? 0.045 : 0.07, Math.sin(turn) * 0.011);
    vane.rotation.y = -turn;
    group.add(vane);
  }
  return group;
}

/** The bowstring through the drawing hand (in the bow's own frame), and the arrow on it. */
function drawString(bowMesh, fighter) {
  const { string, nocked, tips, rest } = bowMesh.userData.bow;
  const draw = fighter.weapon?.draw ?? 0;
  let nock = rest.clone();
  if (draw > 0.05) {
    const hand = point(fighter.x, P[`${fighter.weapon.off}Hand`]);
    const local = new THREE.Vector3(hand[0], hand[1], hand[2]).applyMatrix4(new THREE.Matrix4().copy(bowMesh.matrix).invert());
    nock = rest.clone().lerp(local, Math.min(1, draw * 1.1));
  }
  const positions = string.geometry.attributes.position;
  positions.setXYZ(0, tips[0].x, tips[0].y, tips[0].z);
  positions.setXYZ(1, nock.x, nock.y, nock.z);
  positions.setXYZ(2, tips[1].x, tips[1].y, tips[1].z);
  positions.needsUpdate = true;
  nocked.visible = draw > 0.05;
  if (nocked.visible) {
    // From the nock past the grip, towards the mark.
    nocked.position.copy(nock);
    nocked.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0).sub(nock).add(new THREE.Vector3(0, 0, 0.05)).normalize());
  }
}

/** Arrows in flight and spent arrows on the ground, drawn where the world has them. */
export function updateArrows(view, world) {
  const drawn = view.arrows ?? (view.arrows = new Map());
  const live = new Set();
  for (const arrow of world.arrows ?? []) {
    if (arrow.done) continue;
    live.add(arrow);
    let mesh = drawn.get(arrow);
    if (!mesh) {
      mesh = arrowMesh(arrow.length ?? ARROW.length, arrow.bolt);
      view.scene.add(mesh);
      drawn.set(arrow, mesh);
    }
    // Landed before it was first drawn (frames skipped): it lies as it flew, or points down.
    const flying = toVector(arrow.v);
    const along = (arrow.landed ? mesh.userData.along : null) ?? (flying.lengthSq() > 1e-9 ? flying.normalize() : new THREE.Vector3(0, -1, 0));
    mesh.userData.along = along;
    // The nock trails the point by the arrow's length; stuck in the ground, the head is in it.
    mesh.position.set(arrow.x[0], arrow.x[1], arrow.x[2]).addScaledVector(along, -(arrow.length ?? ARROW.length) * (arrow.landed ? 0.75 : 1));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
  }
  for (const [arrow, mesh] of drawn) {
    if (live.has(arrow)) continue;
    view.scene.remove(mesh);
    disposeObject(mesh);
    drawn.delete(arrow);
  }
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

// ---- Whips ------------------------------------------------------------------------

const WHIP_LEATHER = 0x3a2416;
const WHIP_RADIUS = { root: 0.009, tip: 0.0025 };
const whipScratch = { matrix: new THREE.Matrix4(), position: new THREE.Vector3(), direction: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };

/**
 * Every whip's thong, drawn where its rope is (physics/whip.js): a tapering
 * chain of plaited leather from the handle's end to the fall.
 */
export function updateWhips(view, world) {
  const drawn = view.whips ?? (view.whips = new Map());
  const live = new Set();
  for (const fighter of world.fighters) {
    const rope = fighter.weapon?.held ? fighter.weapon.rope : null;
    if (!rope) continue;
    live.add(fighter.id);
    let mesh = drawn.get(fighter.id);
    if (!mesh || mesh.count !== rope.count - 1) {
      if (mesh) view.scene.remove(mesh);
      mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), surface(WHIP_LEATHER, { roughness: 0.8 }), rope.count - 1);
      mesh.frustumCulled = false;
      view.scene.add(mesh);
      drawn.set(fighter.id, mesh);
    }
    const { x } = rope;
    for (let link = 0; link < rope.count - 1; link += 1) {
      const a = link * 3;
      const b = a + 3;
      const s = whipScratch;
      s.position.set((x[a] + x[b]) / 2, (x[a + 1] + x[b + 1]) / 2, (x[a + 2] + x[b + 2]) / 2);
      s.direction.set(x[b] - x[a], x[b + 1] - x[a + 1], x[b + 2] - x[a + 2]);
      const length = s.direction.length();
      if (length > 1e-6) s.quaternion.setFromUnitVectors(s.up, s.direction.divideScalar(length));
      const radius = WHIP_RADIUS.root + (WHIP_RADIUS.tip - WHIP_RADIUS.root) * (link / (rope.count - 2));
      // A little longer than the link, so the joints do not open.
      s.scale.set(radius, length * 1.08, radius);
      mesh.setMatrixAt(link, s.matrix.compose(s.position, s.quaternion, s.scale));
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  for (const [id, mesh] of drawn) {
    if (live.has(id)) continue;
    view.scene.remove(mesh);
    mesh.geometry.dispose();
    drawn.delete(id);
  }
}
