// A fighter's head in a light anime style: a rounded skull with a soft
// V-shaped jaw, large drawn eyes (white, two-tone iris, pupil, highlights,
// a heavy upper lash line), small nose and mouth, and hair built from
// tapered locks rather than a helmet. Drawn features read as a character;
// realistic ones on a stylised body read as uncanny.
//
// The face reacts to the fight: it winces when hit, goes dazed when stunned,
// shuts when knocked out, pants when tired, flushes and bruises with damage.
//
// Head-local axes: x forward (the face), y up, z to the fighter's left.

/* global THREE */
import { P } from './body.js';
import { concussionCapacity } from './physics.js';
import { Dangle } from './dangle.js';
import { SoftShell } from './soft.js';
import { outlineFor, STYLE, surface } from './toon.js';

export const LOOK_OPTIONS = {
  hairStyle: ['spiky', 'cleanShort', 'fade', 'buzz', 'cornrows', 'bun', 'ponytail', 'midLong', 'long', 'dreads', 'topknot', 'ringletPigtails', 'ringlets', 'ringletUpdo', 'hime', 'bald'],
  facialHair: ['none', 'stubble', 'mustache', 'handlebar', 'beard', 'longBeard'],
  eyeColor: ['brown', 'hazel', 'blue', 'green', 'grey', 'amber'],
};
export const DEFAULT_LOOK = { skinTone: 'medium', hairStyle: 'cleanShort', hairColor: '#20160f', facialHair: 'none', eyeColor: 'brown', faceShape: null };
const EYE_COLORS = { brown: 0x6b3f22, hazel: 0x8a6a2c, blue: 0x2f6fc0, green: 0x3f8a52, grey: 0x7a8a9a, amber: 0xc0821c };
// Rounder than a real skull: depth, height, width as multiples of the radius.
const SKULL = [0.94, 1.06, 0.86];

/**
 * Anime head constructions. Below the eye line the face is drawn, not
 * rounded: its half-width runs in straight lines from the cheek to the jaw
 * corner and on to the chin, the back of the head falls away into the neck,
 * and the front is pressed into a flat plane. Each has the eyes that go
 * with it.
 *   jawWidth / jawAt — width at the jaw corner, and how far down it sits
 *   chinWidth, chinLength, chinForward — the point of the chin
 *   faceFront — depth of the flat face plane; cheek — fullness at the cheeks
 *   eye — width, height (of the radius), slant (rad), lash weight
 */
export const FACE_SHAPES = {
  shonen: { jawWidth: 0.8, jawAt: 0.5, chinWidth: 0.16, chinLength: 1.0, chinForward: 0.74, faceFront: 0.84, cheek: 0, crown: 1.0, eye: { width: 0.34, height: 0.25, slant: 0.14, lash: 0.055 } },
  shojo: { jawWidth: 0.9, jawAt: 0.38, chinWidth: 0.16, chinLength: 0.9, chinForward: 0.7, faceFront: 0.88, cheek: 0.07, crown: 1.06, eye: { width: 0.38, height: 0.42, slant: 0, lash: 0.07 } },
  seinen: { jawWidth: 0.88, jawAt: 0.62, chinWidth: 0.32, chinLength: 1.14, chinForward: 0.8, faceFront: 0.86, cheek: 0, crown: 0.97, eye: { width: 0.3, height: 0.19, slant: 0.06, lash: 0.04 } },
};
// Makeup (look.makeup): `eyes` 'smoky' (a dark shadow round the eye),
// `liner` 'winged' (a heavy upper line flicked out), `lowerLash` 'heavy',
// `lips` a colour; and the shadow's own colour and strength.
export const MAKEUP = { shadow: 0x1a1316, shadowOpacity: 0.82, wing: 0.16, linerWeight: 1.8, lowerWeight: 0.03 };

// Ringlets: corkscrew curls, `coil` (of r) about their line, `turns` along a lock.
const RINGLET = { coil: 0.17, turns: 3.5, thickness: 0.17 };

// Hair to the waist: the curtain down the back is this long (of r) from the
// nape (`nape`, of r above the base of the neck, high enough to wrap the back
// of the head, so no skin shows between it and the hair on the head); at the
// top it wraps the head (`top`, of r), at the hem it stands off the back
// (`hem`), round `arc` of the way about (behind and the sides); it hangs back
// from the nape at `hang` (back per unit down). Strands: `strands` grooves,
// `strandDepth` deep, every third deeper so they read as locks. The hem dips
// to a point at the middle of the back (`point`, of r).
// The hime cut: its bangs, and how far down the back of the skull the hair on the head runs (polar, rad).
const HIME = { bangs: 9, nape: 2.8 };
// Soft hair down the back (hairCurtainSoft): `columns` chains of `links`
// pendulums round the back; each column's band a little wider than its share
// (`overlap`) and reaching a little above its joint (`lap`, of a link), so
// no gap shows between them as they sway apart or bend; side columns splay
// out only `splay` of the way, so they fall together down the back.
const SOFT_HAIR = { columns: 6, links: 3, overlap: 1.7, lap: 0.12, splay: 0.25, sag: [0.3, 0.5, 0.7], damping: [0.35, 0.28, 0.22] };
const WAIST_HAIR = { length: 5.4, top: 1.12, hem: 1.85, arc: Math.PI * 1.2, nape: 1.6, hang: 0.33, strands: 24, strandDepth: 0.04, point: 0.55 };

const FACE = {
  eyeLine: -0.06, // eyes sit a little below the middle of the head, as drawn
  eyeSpread: 0.36,
  blinkEvery: [2.2, 4.8],
  blinkSeconds: 0.12,
  winceSeconds: 0.45,
  bruiseShare: 0.6, // how red the face goes at full damage
};

// ---- Skull --------------------------------------------------------------

const easeInOut = (t) => t * t * (3 - 2 * t);

function headDeform(position, shape) {
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    let X;
    let Y;
    let Z;
    if (y < 0) {
      // Lower face: rebuild each ring from its direction, at a drawn width.
      const t = Math.min(1, -y);
      const ring = Math.sqrt(Math.max(1e-6, 1 - y * y));
      const ux = x / ring;
      const uz = z / ring;
      const width = t < shape.jawAt
        ? 1 + (shape.jawWidth - 1) * (t / shape.jawAt) + shape.cheek * Math.sin((Math.PI * t) / shape.jawAt)
        : shape.jawWidth + (shape.chinWidth - shape.jawWidth) * ((t - shape.jawAt) / (1 - shape.jawAt));
      const front = 1 + (shape.chinForward - 1) * easeInOut(t);
      const back = 1 - 0.62 * easeInOut(t);
      X = ux * (ux > 0 ? front : back) * Math.min(1, ring * 3 + 0.25);
      Z = uz * width * Math.min(1, ring * 3 + 0.25);
      Y = -t * shape.chinLength;
    } else {
      X = x;
      Y = y * shape.crown;
      Z = z;
    }
    // The flat face plane: the front is pressed back where the features sit,
    // fading in and out over the brow and the chin so no crease forms.
    if (X > shape.faceFront) {
      const band = easeInOut(Math.max(0, Math.min(1, (0.6 - Y) / 0.25))) * easeInOut(Math.max(0, Math.min(1, (Y + 0.95) / 0.3)));
      X -= (X - shape.faceFront) * 0.7 * band;
    }
    position.setXYZ(index, X * SKULL[0], Y * SKULL[1], Z * SKULL[2]);
  }
}

function headGeometry(radius, shape, segments = 36) {
  const geometry = new THREE.SphereGeometry(1, segments, Math.round(segments * 0.75));
  headDeform(geometry.attributes.position, shape);
  geometry.scale(radius, radius, radius);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A layer over part of the skull, for hair and beards. For each direction
 * round the head (azimuth from the face, towards the left), it covers polar
 * angles from `from(azimuth)` to `to(azimuth)` (0 is the crown). Rows are
 * spaced inside that range, so the edge is a smooth line, not a staircase.
 */
function shellGeometry(radius, shape, inflate, from, to, azimuths = [-Math.PI, Math.PI]) {
  const columns = 72;
  const rows = 24;
  const positions = [];
  const indices = [];
  for (let column = 0; column <= columns; column += 1) {
    const azimuth = azimuths[0] + ((azimuths[1] - azimuths[0]) * column) / columns;
    const start = from(azimuth);
    const end = Math.max(start, to(azimuth));
    for (let row = 0; row <= rows; row += 1) {
      const polar = start + ((end - start) * row) / rows;
      positions.push(Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth));
    }
  }
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const a = column * (rows + 1) + row;
      const b = a + rows + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  headDeform(geometry.attributes.position, shape);
  geometry.scale(radius * inflate, radius * inflate, radius * inflate);
  geometry.computeVertexNormals();
  return geometry;
}

/** The hairline: polar angle where hair stops, low at the nape, high over the brow. */
function hairline(front, back) {
  return (azimuth) => {
    const towardsFace = (1 + Math.cos(azimuth)) / 2;
    return back + (front - back) * towardsFace ** 1.5;
  };
}

// ---- Drawn features -------------------------------------------------------

function ellipseShape(width, height, cx = 0, cy = 0) {
  const shape = new THREE.Shape();
  shape.absellipse(cx, cy, width / 2, height / 2, 0, Math.PI * 2, false, 0);
  return shape;
}

function flat(shape, color, z, opacity = 1) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  const result = new THREE.Mesh(new THREE.ShapeGeometry(shape, 20), material);
  result.position.z = z;
  return result;
}

/** A crescent along the top of an ellipse, thick in the middle, flicked at the outer end. */
function lashShape(width, height, thickness, flick) {
  const shape = new THREE.Shape();
  const steps = 16;
  const outer = [];
  const inner = [];
  for (let step = 0; step <= steps; step += 1) {
    const u = step / steps;
    const angle = Math.PI * (1.05 - 1.1 * u);
    const x = Math.cos(angle) * width * 0.52;
    const y = Math.sin(angle) * height * 0.5;
    const t = thickness * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, u * 1.1)));
    outer.push([x, y + t]);
    inner.push([x, y]);
  }
  shape.moveTo(inner[0][0], inner[0][1]);
  for (const [x, y] of outer) shape.lineTo(x, y);
  shape.lineTo(outer.at(-1)[0] + flick, outer.at(-1)[1] + flick * 0.6);
  for (const [x, y] of [...inner].reverse()) shape.lineTo(x, y);
  return shape;
}

/** Place a group on the skull's surface at (y, z), facing out along the surface. */
function onSurface(group, probe, raycaster, r, y, z, lift = 0.004) {
  raycaster.set(new THREE.Vector3(r * 2, y * r, z * r), new THREE.Vector3(-1, 0, 0));
  const hit = raycaster.intersectObject(probe)[0];
  const point = hit ? hit.point : new THREE.Vector3(r * 0.8, y * r, z * r);
  const normal = hit ? hit.face.normal.clone() : new THREE.Vector3(1, 0, 0);
  // Ease the normal towards the face's forward, so drawn features stay readable.
  normal.lerp(new THREE.Vector3(1, 0, 0), 0.45).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const across = new THREE.Vector3().crossVectors(up, normal).normalize();
  const trueUp = new THREE.Vector3().crossVectors(normal, across);
  group.matrix.makeBasis(across, trueUp, normal).setPosition(point.addScaledVector(normal, lift));
  group.matrixAutoUpdate = false;
  return group;
}

// ---- Hair locks -------------------------------------------------------------

/**
 * A lock of hair along a path: a flattened, tapering ribbon that lies on the
 * head (its width runs across the radial direction from the head's centre).
 */
function lockGeometry(points, width, thickness, taper = 1) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const rows = 14;
  const around = 8;
  const positions = [];
  const indices = [];
  for (let row = 0; row <= rows; row += 1) {
    const t = row / rows;
    const p = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const radial = p.clone().normalize();
    let across = new THREE.Vector3().crossVectors(tangent, radial);
    if (across.lengthSq() < 1e-8) across = new THREE.Vector3(0, 0, 1);
    across.normalize();
    const out = new THREE.Vector3().crossVectors(across, tangent).normalize();
    const scale = Math.max(0.02, 1 - taper * t ** 1.3);
    for (let step = 0; step < around; step += 1) {
      const angle = (step / around) * Math.PI * 2;
      const q = p.clone().addScaledVector(across, Math.cos(angle) * width * 0.5 * scale).addScaledVector(out, Math.sin(angle) * thickness * 0.5 * scale);
      positions.push(q.x, q.y, q.z);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let step = 0; step < around; step += 1) {
      const a = row * around + step;
      const b = row * around + ((step + 1) % around);
      indices.push(a, a + around, b, b, a + around, b + around);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A point on the hair surface: polar angle from the crown, azimuth from the face round to the left. */
function onScalp(r, polar, azimuth, lift = 1.08) {
  return [Math.sin(polar) * Math.cos(azimuth) * SKULL[0] * r * lift, Math.cos(polar) * SKULL[1] * r * lift + 0.02 * r, Math.sin(polar) * Math.sin(azimuth) * SKULL[2] * r * lift];
}

// ---- Head ---------------------------------------------------------------------

/**
 * Build the head for a fighter.
 * @returns {{ group, shell, update(dt, fighter, time) }}
 */
export function buildHead(body, lookInput, skinHex, cornerHex) {
  const look = { ...DEFAULT_LOOK, ...lookInput };
  const r = body.lengths.headRadius;
  const female = body.inputs.sex === 'female';
  // Chosen from the design sheet: shonen for women, seinen for men.
  const shape = FACE_SHAPES[look.faceShape] ?? FACE_SHAPES[female ? 'shonen' : 'seinen'];
  const group = new THREE.Group();
  const skinMaterial = surface(skinHex, { steps: STYLE.faceSteps });
  const baseSkin = skinMaterial.color.clone();
  const hairMaterial = surface(look.hairColor);
  const ink = 0x24181a;

  const skull = new SoftShell(headGeometry(r, shape), skinMaterial, body.segments.head.fleshFirmness);
  group.add(skull.mesh);
  skull.mesh.add(outlineFor(skull.mesh, 0.0035));
  for (const side of [1, -1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), skinMaterial);
    ear.scale.set(0.12 * r, 0.22 * r, 0.05 * r);
    ear.position.set(-0.06 * r, -0.08 * r, side * SKULL[2] * r * 0.98);
    ear.rotation.z = 0.12;
    ear.castShadow = true;
    group.add(ear);
  }

  const probe = new THREE.Mesh(headGeometry(r, shape, 28));
  probe.updateMatrixWorld();
  const raycaster = new THREE.Raycaster();

  // Eyes, drawn in layers on the surface.
  const eyeWidth = shape.eye.width * r;
  const eyeHeight = shape.eye.height * r;
  const irisColor = new THREE.Color(EYE_COLORS[look.eyeColor] ?? EYE_COLORS.brown);
  const eyes = [1, -1].map((side) => {
    const holder = onSurface(new THREE.Group(), probe, raycaster, r, FACE.eyeLine, side * FACE.eyeSpread, 0.006 * r);
    // Mirror one eye so the outer flick points outward on both.
    const mirror = new THREE.Group();
    mirror.scale.x = side > 0 ? -1 : 1;
    holder.add(mirror);
    const makeup = look.makeup ?? {};
    // Smoky shadow: a dark, soft wash round and above the eye, under the drawn eye.
    if (makeup.eyes === 'smoky') {
      const wash = flat(ellipseShape(eyeWidth * 1.5, eyeHeight * 2.1, eyeWidth * 0.05, eyeHeight * 0.18), MAKEUP.shadow, -0.0004, MAKEUP.shadowOpacity);
      mirror.add(wash);
    }
    const ball = new THREE.Group();
    ball.add(flat(ellipseShape(eyeWidth, eyeHeight), 0xfbfaf6, 0));
    const iris = new THREE.Group();
    iris.add(flat(ellipseShape(eyeWidth * 0.6, eyeHeight * 0.86), irisColor.getHex(), 0.0004));
    iris.add(flat(ellipseShape(eyeWidth * 0.6, eyeHeight * 0.42, 0, eyeHeight * 0.2), irisColor.clone().multiplyScalar(0.55).getHex(), 0.0006));
    iris.add(flat(ellipseShape(eyeWidth * 0.4, eyeHeight * 0.3, 0, -eyeHeight * 0.22), irisColor.clone().lerp(new THREE.Color(0xffffff), 0.35).getHex(), 0.0007));
    iris.add(flat(ellipseShape(eyeWidth * 0.26, eyeHeight * 0.46), 0x120c0c, 0.0009));
    iris.add(flat(ellipseShape(eyeWidth * 0.2, eyeWidth * 0.2, -eyeWidth * 0.12, eyeHeight * 0.16), 0xffffff, 0.0012));
    iris.add(flat(ellipseShape(eyeWidth * 0.08, eyeWidth * 0.08, eyeWidth * 0.1, -eyeHeight * 0.18), 0xffffff, 0.0012));
    ball.add(iris);
    mirror.add(ball);
    // Winged liner: the upper line heavier and flicked well out past the corner.
    const winged = makeup.liner === 'winged';
    const upperLash = flat(lashShape(eyeWidth, eyeHeight, shape.eye.lash * r * (winged ? MAKEUP.linerWeight : 1), (winged ? MAKEUP.wing : female ? 0.05 : 0.02) * r), winged ? 0x050405 : ink, 0.0016);
    // Slant: outer corners up for a sharp look (mirroring turns it outward on both eyes).
    mirror.rotation.z = (side > 0 ? -1 : 1) * shape.eye.slant;
    const lowerLash = flat(lashShape(eyeWidth * 0.7, eyeHeight * 0.8, (makeup.lowerLash === 'heavy' ? MAKEUP.lowerWeight : 0.012) * r, makeup.lowerLash === 'heavy' ? 0.04 * r : 0), ink, 0.0016);
    lowerLash.rotation.z = Math.PI;
    lowerLash.position.x = -eyeWidth * 0.12;
    mirror.add(upperLash, lowerLash);
    group.add(holder);
    return { ball, iris, upperLash, lowerLash };
  });

  // Brows: tapered strokes above the eyes.
  const browShape = new THREE.Shape();
  browShape.moveTo(-eyeWidth * 0.55, 0);
  browShape.quadraticCurveTo(0, 0.045 * r, eyeWidth * 0.6, -0.01 * r);
  browShape.quadraticCurveTo(0, 0.025 * r, -eyeWidth * 0.55, -0.025 * r);
  const brows = [1, -1].map((side) => {
    const holder = onSurface(new THREE.Group(), probe, raycaster, r, FACE.eyeLine + 0.3, side * FACE.eyeSpread * 1.02, 0.008 * r);
    const mirror = new THREE.Group();
    mirror.scale.x = side > 0 ? -1 : 1;
    const stroke = flat(browShape, look.makeup?.eyes ? 0x0a0809 : new THREE.Color(look.hairColor).multiplyScalar(0.85).getHex(), 0);
    stroke.scale.y = female ? 0.8 : 1.3;
    mirror.add(stroke);
    holder.add(mirror);
    group.add(holder);
    return stroke;
  });

  // A small nose: just enough shape to catch a shadow.
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), skinMaterial);
  const noseAt = onSurface(new THREE.Group(), probe, raycaster, r, -0.3, 0, 0);
  noseAt.matrix.decompose(nose.position, nose.quaternion, new THREE.Vector3());
  nose.scale.set(0.05 * r, 0.06 * r, 0.07 * r);
  group.add(nose);

  // Mouth: a drawn line that opens into a dark mouth with the guard showing.
  const mouth = onSurface(new THREE.Group(), probe, raycaster, r, -0.6, 0, 0.004 * r);
  const lineShape = new THREE.Shape();
  lineShape.moveTo(-0.12 * r, 0.01 * r);
  lineShape.quadraticCurveTo(0, -0.012 * r, 0.12 * r, 0.01 * r);
  lineShape.lineTo(0.12 * r, 0.0);
  lineShape.quadraticCurveTo(0, -0.026 * r, -0.12 * r, 0);
  const lipColor = look.makeup?.lips ?? null;
  const mouthLine = flat(lineShape, lipColor ?? 0x6a2c2c, 0.001);
  // Painted lips: a full, crisp mouth in the lipstick's colour while it is closed.
  if (lipColor) {
    const lips = new THREE.Shape();
    lips.moveTo(-0.13 * r, 0.004 * r);
    lips.quadraticCurveTo(-0.06 * r, 0.05 * r, 0, 0.026 * r);
    lips.quadraticCurveTo(0.06 * r, 0.05 * r, 0.13 * r, 0.004 * r);
    lips.quadraticCurveTo(0, -0.07 * r, -0.13 * r, 0.004 * r);
    mouthLine.add(flat(lips, lipColor, -0.0002));
  }
  const opening = flat(ellipseShape(0.2 * r, 0.12 * r), 0x4a1518, 0.0008);
  const guard = flat(ellipseShape(0.17 * r, 0.035 * r, 0, 0.03 * r), cornerHex, 0.0011);
  mouth.add(mouthLine, opening, guard);
  group.add(mouth);

  // Cheeks flush with effort and damage.
  const blush = [1, -1].map((side) => {
    const holder = onSurface(new THREE.Group(), probe, raycaster, r, -0.32, side * 0.5, 0.005 * r);
    const disc = flat(ellipseShape(0.2 * r, 0.1 * r), 0xff6a7a, 0, 0.0001);
    holder.add(disc);
    group.add(holder);
    return disc;
  });

  // Hair down the back hangs from the upper back, not the head (render.js hangs it: hairCurtain).
  const curtains = [];
  const dangles = buildHair(group, look, r, shape, hairMaterial, female, curtains);
  // The beard in a material of its own: an open-faced helmet hides the hair, not the beard.
  const beardMaterial = hairMaterial.clone();
  buildFacialHair(group, look, r, shape, beardMaterial, dangles);

  // ---- Expression -------------------------------------------------------
  const face = { blinkIn: 1 + Math.random() * 3, blinking: 0, lid: 0, mouth: 0, brow: 0, flush: 0, gaze: [0, 0], gazeIn: 1 };
  function update(dt, fighter, time, colliders = []) {
    for (const dangle of dangles) dangle.update(dt, colliders);
    face.blinkIn -= dt;
    if (face.blinkIn <= 0) {
      face.blinking = FACE.blinkSeconds;
      face.blinkIn = FACE.blinkEvery[0] + Math.random() * (FACE.blinkEvery[1] - FACE.blinkEvery[0]);
    }
    face.blinking = Math.max(0, face.blinking - dt);
    const sinceHit = time - fighter.hitAt[P.head];
    const wince = sinceHit >= 0 && sinceHit < FACE.winceSeconds ? 1 - sinceHit / FACE.winceSeconds : 0;
    const out = fighter.state === 'down' || fighter.state === 'out';
    const stunned = fighter.stun > 0 ? 1 : 0;
    const punching = fighter.punch ? 1 : 0;
    const panting = Math.max(0, 0.45 - fighter.stamina) * 2 * (0.6 + 0.4 * Math.sin(time * Math.PI * 1.7));

    let lid = 0.1 * punching + 0.75 * wince + 0.45 * stunned;
    if (face.blinking > 0 || out) lid = 1;
    const mouthOpen = out ? 0.6 : Math.min(1, 0.9 * wince + panting + 0.3 * stunned) * (punching ? 0.2 : 1);
    const brow = Math.min(1, 0.8 * wince + 0.5 * punching) - 0.6 * stunned;
    const capacity = concussionCapacity(fighter);
    const damage = Math.min(1, Math.max(fighter.concussion / capacity + fighter.knockdowns * 0.25, fighter.damage.head ?? 0, fighter.broken.has('neck') ? 1 : 0));
    const flush = Math.min(1, (1 - fighter.stamina) * 0.7 + damage * 0.5);
    const ease = (target, current, speed) => current + (target - current) * Math.min(1, dt * speed);
    face.lid = ease(Math.min(1, lid), face.lid, face.blinking > 0 ? 45 : 14);
    face.mouth = ease(mouthOpen, face.mouth, 12);
    face.brow = ease(brow, face.brow, 10);
    face.flush = ease(flush, face.flush, 2);
    face.gazeIn -= dt;
    if (face.gazeIn <= 0) {
      const wander = stunned ? 0.3 : 0.1;
      face.gaze = [(Math.random() - 0.5) * wander, (Math.random() - 0.5) * wander * 0.6];
      face.gazeIn = stunned ? 0.25 : 0.6 + Math.random() * 1.4;
    }

    for (const eye of eyes) {
      // Closing: the eye squashes towards a line and the lash comes down to meet it.
      const open = Math.max(0.04, 1 - face.lid);
      eye.ball.scale.y = open;
      eye.ball.position.y = -(1 - open) * eyeHeight * 0.1;
      eye.upperLash.position.y = -(1 - open) * eyeHeight * 0.5;
      eye.lowerLash.visible = open > 0.3;
      eye.iris.position.set(face.gaze[0] * eyeWidth, face.gaze[1] * eyeHeight, 0);
    }
    for (const stroke of brows) {
      stroke.position.y = -face.brow * 0.04 * r + (stunned ? 0.02 * r : 0);
      stroke.rotation.z = face.brow * -0.22;
    }
    mouthLine.visible = face.mouth < 0.25;
    opening.visible = !mouthLine.visible;
    guard.visible = opening.visible;
    opening.scale.set(0.5 + 0.5 * face.mouth, Math.max(0.15, face.mouth), 1);
    for (const disc of blush) disc.material.opacity = face.flush * 0.55;
    skinMaterial.color.copy(baseSkin).lerp(new THREE.Color(0x9c3b48), damage * FACE.bruiseShare);
  }

  // Under a helmet: no hair, and no locks swinging through the steel; the
  // beard too, unless the helmet leaves the face open (`beard`).
  function hideHair({ beard = false } = {}) {
    group.traverse((object) => {
      if (object.isMesh && (object.material === hairMaterial || (!beard && object.material === beardMaterial))) object.visible = false;
    });
    dangles.length = 0;
  }
  return { group, shell: skull, update, dangles, hideHair, curtains, hairMaterial };
}

function hairLock(group, material, points, width, thickness, taper = 1) {
  const lock = new THREE.Mesh(lockGeometry(points, width, thickness, taper), material);
  lock.castShadow = true;
  lock.add(outlineFor(lock, 0.0025));
  group.add(lock);
  return lock;
}

/**
 * A lock that hangs and swings: built along −y from its root, hung from the
 * scalp at `root`, resting along `rest` (head coordinates).
 */
function hangingLock(group, material, dangles, root, rest, length, width, thickness, { sag = 0.35, damping = 0.25, curl = 0 } = {}) {
  const dangle = new Dangle(group, root, rest, length, { sag, damping });
  const lock = new THREE.Mesh(lockGeometry([[0, 0, 0], [curl * 0.5, -length * 0.5, curl], [curl, -length, 0]], width, thickness, 0.35), material);
  lock.castShadow = true;
  lock.add(outlineFor(lock, 0.0025));
  dangle.group.add(lock);
  dangles.push(dangle);
  return dangle;
}

/**
 * A long lock that bends: two segments, the second hung from the tip of the
 * first, so it curves as it swings and streams out behind a turning head.
 */
function flowingLock(group, material, dangles, root, rest, lengths, width, thickness) {
  const [upper, lower] = lengths;
  const first = new Dangle(group, root, rest, upper, { sag: 0.5, damping: 0.16 });
  const second = new Dangle(first.group, [0, -upper * 0.96, 0], [0, -1, 0], lower, { sag: 0.9, damping: 0.12 });
  const piece = (length, taper, wide) => {
    const lock = new THREE.Mesh(lockGeometry([[0, 0.01 * length, 0], [0, -length * 0.5, 0], [0, -length, 0]], wide, thickness, taper), material);
    lock.castShadow = true;
    lock.add(outlineFor(lock, 0.0025));
    return lock;
  };
  first.group.add(piece(upper, 0.15, width));
  second.group.add(piece(lower, 0.75, width * 0.85));
  dangles.push(first, second);
}

/**
 * A ringlet: a corkscrew curl hung from the scalp at `root`, resting along
 * `rest`, that bounces and swings with the head (a coiled tube along a helix,
 * tapering to its end).
 */
function ringletLock(group, material, dangles, root, rest, length, r, { coil = RINGLET.coil, turns = RINGLET.turns, sag = 0.4 } = {}) {
  const dangle = new Dangle(group, root, rest, length, { sag, damping: 0.22 });
  const points = [];
  const steps = Math.round(turns * 10);
  for (let step = 0; step <= steps; step += 1) {
    const u = step / steps;
    const angle = u * turns * Math.PI * 2;
    // The coil opens out below the root and draws in a little at the end.
    const radius = coil * r * Math.min(1, u * 5) * (1 - 0.3 * u);
    points.push(new THREE.Vector3(Math.cos(angle) * radius, -u * length, Math.sin(angle) * radius));
  }
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), steps * 2, RINGLET.thickness * r * 0.5, 6, false);
  const curl = new THREE.Mesh(tube, material);
  curl.castShadow = true;
  curl.add(outlineFor(curl, 0.0022));
  dangle.group.add(curl);
  dangles.push(dangle);
  return dangle;
}

/**
 * A curtain of hair down the back, to the waist: one curved sheet hung at the
 * nape from the upper back (`anchor`: the collar, its x forward and y up the
 * spine, at the base of the neck), so it lies down the back whichever way the
 * head turns, and swings as a piece (a Dangle). It wraps the back of the head
 * at the top and stands off the back as it falls, so it hangs behind the body
 * rather than inside it; grooved into strands, its hem cut straight with a
 * slight point at the middle. `r`: the head's radius (m).
 */
export function hairCurtain(anchor, material, r, { length = WAIST_HAIR.length } = {}) {
  const reach = length * r;
  const pivot = [-WAIST_HAIR.top * r, WAIST_HAIR.nape * r, 0];
  // Hung back from the nape: its end must start behind the back, or the trunk's collider pushes it out through the front.
  const dangle = new Dangle(anchor, pivot, [-WAIST_HAIR.hang, -1, 0], reach, { sag: 0.3, damping: 0.32 });
  const geometry = new THREE.CylinderGeometry(WAIST_HAIR.top * r, WAIST_HAIR.hem * r, reach, 32, 14, true, Math.PI * 1.5 - WAIST_HAIR.arc / 2, WAIST_HAIR.arc);
  curtainShape(geometry, r, reach, 0, 1, true);
  const sheet = new THREE.Mesh(geometry, material);
  // Its axis up the spine, its top at the nape.
  sheet.position.set(-pivot[0], -reach / 2, 0);
  sheet.castShadow = true;
  sheet.add(outlineFor(sheet, 0.003));
  dangle.group.add(sheet);
  return dangle;
}

/** A curtain's strands and hem, worked into one band of it (angles about the spine, `down` 0 at the nape to 1 at the hem). */
function curtainShape(geometry, r, reach, downFrom, downTo, hemmed) {
  const position = geometry.attributes.position;
  const height = geometry.parameters.height;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const down = downFrom + (downTo - downFrom) * (0.5 - y / height);
    const angle = Math.atan2(x, z);
    const fromBack = Math.abs(Math.atan2(Math.sin(angle + Math.PI / 2), Math.cos(angle + Math.PI / 2)));
    const groove = Math.sin(angle * WAIST_HAIR.strands);
    const ripple = 1 + WAIST_HAIR.strandDepth * (0.4 + down) * (groove + (Math.round(angle * WAIST_HAIR.strands / Math.PI) % 3 === 0 ? 0.6 * groove : 0));
    const dip = hemmed && down > 0.97 ? WAIST_HAIR.point * r * Math.max(0, 1 - fromBack / (WAIST_HAIR.arc / 2)) : 0;
    position.setXYZ(index, x * ripple, y - dip, z * ripple);
  }
  geometry.computeVertexNormals();
}

/**
 * The same curtain, soft: `SOFT_HAIR.columns` columns round the back, each a
 * chain of pendulums (a Dangle hung from the tip of the one above), so the
 * hair sways, swings out on a turn and settles, its links held off the back
 * and shoulders by the body's colliders like any hair. Each link carries its
 * band of the curtain. Returns the Dangles, parents before children (the
 * order they must be stepped in).
 */
export function hairCurtainSoft(anchor, material, r, { length = WAIST_HAIR.length } = {}) {
  const dangles = [];
  const reach = length * r;
  const link = reach / SOFT_HAIR.links;
  const share = WAIST_HAIR.arc / SOFT_HAIR.columns;
  const radiusAt = (down) => (WAIST_HAIR.top + (WAIST_HAIR.hem - WAIST_HAIR.top) * down) * r;
  for (let column = 0; column < SOFT_HAIR.columns; column += 1) {
    // The column's middle, round from the middle of the back (CylinderGeometry: angle 0 is +z, her left; behind her is 3π/2).
    const theta = Math.PI * 1.5 - WAIST_HAIR.arc / 2 + share * (column + 0.5);
    const out = [Math.sin(theta), Math.cos(theta)];
    let parent = anchor;
    let pivot = [out[0] * WAIST_HAIR.top * r, WAIST_HAIR.nape * r, out[1] * WAIST_HAIR.top * r];
    // The first link hangs back from the nape, as the rigid curtain does, splaying only a little to the
    // side (`splay`), so the columns fall together; the rest straight on.
    let rest = [-Math.abs(out[0]) * WAIST_HAIR.hang - (1 - Math.abs(out[0])) * WAIST_HAIR.hang * 0.6, -1, out[1] * WAIST_HAIR.hang * SOFT_HAIR.splay];
    for (let index = 0; index < SOFT_HAIR.links; index += 1) {
      const from = index / SOFT_HAIR.links;
      const to = (index + 1) / SOFT_HAIR.links;
      const top = radiusAt(from);
      const bottom = radiusAt(to);
      const dangle = new Dangle(parent, pivot, rest, link, { sag: SOFT_HAIR.sag[index], damping: SOFT_HAIR.damping[index] });
      const height = link * (1 + SOFT_HAIR.lap);
      const geometry = new THREE.CylinderGeometry(top, bottom, height, 6, 4, true, theta - (share * SOFT_HAIR.overlap) / 2, share * SOFT_HAIR.overlap);
      curtainShape(geometry, r, reach, from - SOFT_HAIR.lap / SOFT_HAIR.links, to, index === SOFT_HAIR.links - 1);
      // Hung by the middle of its top edge (a little above the joint).
      geometry.translate(-out[0] * top, -height / 2 + link * SOFT_HAIR.lap, -out[1] * top);
      const band = new THREE.Mesh(geometry, material);
      band.castShadow = true;
      band.add(outlineFor(band, 0.003));
      dangle.group.add(band);
      dangles.push(dangle);
      // The next link hangs from where this band's lower edge is, straight on along it.
      parent = dangle.group;
      pivot = [out[0] * (bottom - top), -link, out[1] * (bottom - top)];
      rest = [0, -1, 0];
    }
  }
  // Stepped top link first, then down each column: parents before children.
  return dangles.sort((a, b) => depthOf(a, anchor) - depthOf(b, anchor));
}

/** How many links down from the anchor a Dangle hangs. */
function depthOf(dangle, anchor) {
  let depth = 0;
  for (let at = dangle.anchor; at && at !== anchor; at = at.parent) depth += 1;
  return depth;
}

function buildHair(group, look, r, shape, material, female, curtains = []) {
  const style = look.hairStyle;
  const dangles = [];
  if (style === 'bald') return dangles;
  // A cap down to the hairline: high at the brow, low at the nape.
  const cap = (inflate, front = 1.1, back = 1.95) => {
    const mesh = new THREE.Mesh(shellGeometry(r, shape, inflate, () => 0, hairline(front, back)), material);
    mesh.material.side = THREE.DoubleSide;
    mesh.add(outlineFor(mesh, 0.003));
    group.add(mesh);
    return mesh;
  };
  const lock = (from, to, width, thickness, bend = [0, 0, 0], taper = 1) => {
    const middle = [(from[0] + to[0]) / 2 + bend[0], (from[1] + to[1]) / 2 + bend[1], (from[2] + to[2]) / 2 + bend[2]];
    return hairLock(group, material, [from, middle, to], width, thickness, taper);
  };
  // Bangs: locks from the front of the crown hanging over the forehead.
  const bangs = (count, length, sweep = 0) => {
    for (let index = 0; index < count; index += 1) {
      const across = (index / (count - 1) - 0.5) * 1.3;
      const from = onScalp(r, 0.35, across * 0.8, 1.04);
      // Bangs stop at the brow line, so they frame the eyes rather than cover them.
      const to = [SKULL[0] * r * 0.98, Math.max(FACE.eyeLine + 0.24, 0.32 - length) * r, (across * 0.62 + sweep) * r];
      lock(from, to, 0.32 * r, 0.07 * r, [0.12 * r, 0.06 * r, sweep * 0.3 * r]);
    }
  };
  if (style === 'buzz') cap(1.02);
  else if (style === 'cornrows') {
    cap(1.02);
    // Braids from the hairline back over the crown, following the skull.
    for (let row = -3; row <= 3; row += 1) {
      const z = row * 0.12;
      const across = Math.sqrt(1 - z * z);
      const arc = [];
      for (let step = 0; step <= 10; step += 1) {
        const angle = 0.55 + (step / 10) * 2.2;
        arc.push([Math.cos(angle) * SKULL[0] * 1.04 * r * across, Math.sin(angle) * SKULL[1] * 1.04 * r * across, z * SKULL[2] * 1.04 * r]);
      }
      hairLock(group, material, arc, 0.08 * r, 0.05 * r, 0.2);
    }
  } else if (style === 'spiky') {
    cap(1.05);
    // Spikes: broad at the root, sweeping up and back over the crown and
    // out at the sides, as on a shonen lead; none in front of the face.
    for (let index = 0; index < 15; index += 1) {
      const polar = 0.25 + (index % 3) * 0.28;
      const azimuth = Math.PI * 0.35 + (index / 14) * Math.PI * 1.3;
      const from = onScalp(r, polar, azimuth, 0.98);
      const tip = onScalp(r, polar + 0.55, azimuth, 1.42);
      lock(from, [tip[0] - 0.12 * r, tip[1] + 0.22 * r, tip[2]], 0.42 * r, 0.16 * r, [0, 0.1 * r, 0]);
    }
    bangs(5, 0.42, 0.04);
  } else if (style === 'cleanShort') {
    cap(1.05);
    bangs(4, 0.32, 0.18);
  } else if (style === 'fade') {
    cap(1.02);
    for (let index = 0; index < 6; index += 1) {
      const azimuth = (index / 5 - 0.5) * 1.6;
      lock(onScalp(r, 0.2, azimuth, 1.04), onScalp(r, 0.55, azimuth * 0.6, 1.22), 0.3 * r, 0.12 * r, [0.08 * r, 0.1 * r, 0]);
    }
  } else if (style === 'bun' || style === 'ponytail') {
    cap(1.05, 1.05, 1.8);
    bangs(female ? 5 : 3, 0.4, -0.12);
    // Side locks frame the face.
    for (const side of [1, -1]) lock(onScalp(r, 0.6, side * 1.15, 1.03), [0.35 * r, -0.75 * r, side * 0.82 * r], 0.2 * r, 0.06 * r, [0, 0, side * 0.08 * r]);
    if (style === 'bun') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.34 * r, 16, 12), material);
      bun.position.set(-0.6 * r, 0.82 * r, 0);
      bun.add(outlineFor(bun, 0.006));
      group.add(bun);
    } else {
      const tie = onScalp(r, 1.2, Math.PI, 1.05);
      hairLock(group, material, [tie, [tie[0] - 0.35 * r, tie[1] - 0.3 * r, 0], [tie[0] - 0.3 * r, tie[1] - 1.2 * r, 0], [tie[0] - 0.1 * r, tie[1] - 1.7 * r, 0]], 0.36 * r, 0.22 * r, 0.9);
    }
  } else if (style === 'midLong') {
    // Parted in the middle, curtains to the cheekbones, and the rest falling
    // past the ears to the jaw at the sides and the collar at the back.
    cap(1.06, 1.05, 2.0);
    bangs(6, 0.5, 0);
    for (let index = 0; index < 13; index += 1) {
      const azimuth = Math.PI * 0.42 + (index / 12) * Math.PI * 1.16;
      const back = -Math.cos(azimuth);
      const root = onScalp(r, 1.05 + 0.12 * back, azimuth, 1.04);
      const out = [Math.cos(azimuth) * 0.25, -1, Math.sin(azimuth) * 0.25];
      hangingLock(group, material, dangles, root, out, (0.72 + 0.38 * Math.max(0, back)) * r, 0.42 * r, 0.12 * r, { sag: 0.45, damping: 0.3 });
    }
  } else if (style === 'topknot') {
    // A sumo's oiled hair, drawn up into a knot folded on the crown.
    cap(1.04, 1.04, 2.0);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.22 * r, 12, 10), material);
    knot.scale.set(1.7, 0.75, 0.8);
    knot.position.set(0.1 * r, 1.12 * r, 0);
    knot.add(outlineFor(knot, 0.004));
    group.add(knot);
  } else if (style === 'long') {
    // Past the shoulder blades: side-swept bangs, a crown, and locks all
    // round the sides and back that swing, bend and stream with motion.
    cap(1.06, 1.05, 2.0);
    bangs(5, 0.48, 0.14);
    for (let index = 0; index < 15; index += 1) {
      const azimuth = Math.PI * 0.45 + (index / 14) * Math.PI * 1.1;
      const back = -Math.cos(azimuth);
      const root = onScalp(r, 1.0 + 0.15 * back, azimuth, 1.04);
      const out = [Math.cos(azimuth) * 0.3, -1, Math.sin(azimuth) * 0.3];
      // Longest down the back, shorter framing the face.
      const length = (2.0 + 2.6 * Math.max(0, back)) * r;
      flowingLock(group, material, dangles, root, out, [length * 0.48, length * 0.52], 0.46 * r, 0.11 * r);
    }
  } else if (style === 'ringletPigtails') {
    // Victorian ringlet pigtails: a blunt fringe, the hair gathered high at
    // each side of the head and falling there in bunches of ringlets.
    cap(1.06, 1.05, 2.0);
    bangs(7, 0.46, 0);
    for (const side of [1, -1]) {
      const gather = onScalp(r, 0.95, side * 1.55, 1.12);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.26 * r, 12, 10), material);
      knot.position.set(...gather);
      knot.add(outlineFor(knot, 0.004));
      group.add(knot);
      for (let curl = 0; curl < 5; curl += 1) {
        const spread = (curl - 2) * 0.13;
        const root = [gather[0] + spread * r, gather[1] - 0.1 * r, gather[2] + side * 0.08 * r];
        ringletLock(group, material, dangles, root, [spread * 0.6 - 0.1, -1, side * 0.3], (2.0 + 0.35 * (2 - Math.abs(curl - 2))) * r, r);
      }
    }
  } else if (style === 'ringlets') {
    // Long ringlets all round the sides and back, to below the shoulders, under a side-swept fringe.
    cap(1.06, 1.05, 2.0);
    bangs(5, 0.48, 0.16);
    for (let index = 0; index < 14; index += 1) {
      const azimuth = Math.PI * 0.42 + (index / 13) * Math.PI * 1.16;
      const back = -Math.cos(azimuth);
      // Rooted lower towards the nape, and hanging a little out from the head,
      // so the ones at the back fall down the back rather than through the neck.
      const root = onScalp(r, 1.15 + 0.65 * Math.max(0, back), azimuth, 1.05);
      // The ones behind hang out further: the drawn back stands proud of the body the hair collides with.
      const out = 0.35 + 0.55 * Math.max(0, back);
      ringletLock(group, material, dangles, root, [Math.cos(azimuth) * out, -1, Math.sin(azimuth) * out], (2.4 + 1.2 * Math.max(0, back)) * r, r, { turns: 4.5, sag: 0.25 });
    }
  } else if (style === 'ringletUpdo') {
    // Swept up into a knot at the back of the crown, ringlets falling from it,
    // and one ringlet at each temple framing the face.
    cap(1.05, 1.06, 1.85);
    bangs(4, 0.42, -0.1);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.4 * r, 16, 12), material);
    bun.position.set(-0.62 * r, 0.82 * r, 0);
    bun.add(outlineFor(bun, 0.006));
    group.add(bun);
    for (let curl = 0; curl < 4; curl += 1) {
      const across = (curl - 1.5) * 0.18 * r;
      ringletLock(group, material, dangles, [-0.85 * r, 0.62 * r, across], [-0.3, -1, across * 2], 1.5 * r, r, { turns: 3 });
    }
    // In front of the ears, falling clear of the cheek.
    for (const side of [1, -1]) ringletLock(group, material, dangles, onScalp(r, 1.2, side * 1.4, 1.08), [0.05, -1, side * 0.3], 1.45 * r, r, { turns: 3 });
  } else if (style === 'hime') {
    buildHimeHair(group, r, cap, material, curtains);
  } else if (style === 'dreads') {
    // Locs from all over the scalp, hanging heavy to the shoulders, a few
    // pushed back off the face.
    cap(1.03, 1.08, 1.95);
    for (let ring = 0; ring < 3; ring += 1) {
      const count = 6 + ring * 3;
      for (let index = 0; index < count; index += 1) {
        const azimuth = (index / count) * Math.PI * 2 + ring * 0.3;
        const front = Math.cos(azimuth);
        // Nothing grows down over the face: the lower rings leave the front clear.
        if (ring > 0 && front > 0.3) continue;
        const polar = 0.45 + ring * 0.38;
        const root = onScalp(r, polar, azimuth, 1.02);
        // Front locs are swept back over the crown, the rest hang outwards.
        const out = front > 0.35 ? [-0.8, -0.35, Math.sin(azimuth) * 0.5] : [Math.cos(azimuth) * 0.35, -1, Math.sin(azimuth) * 0.35];
        // Shoulder length at the back, to the jaw at the sides.
        const length = (front > 0.35 ? 1.4 : 2.2 + 0.9 * Math.max(0, -front)) * r;
        // Locs are heavy: even the front ones, pushed back, droop and swing.
        hangingLock(group, material, dangles, root, out, length, 0.13 * r, 0.12 * r, { sag: front > 0.35 ? 0.45 : 0.7, damping: 0.18, curl: 0.03 * r });
      }
    }
  }
  return dangles;
}

/**
 * A hime cut, to the waist: blunt bangs straight across the brow, side locks
 * cut straight at the jaw over the edges of the cheeks, and the rest straight
 * down the back (a curtain hung from the upper back: hairCurtain). The hair
 * on the head covers the whole back of the skull to the nape, under the top
 * of the curtain, so no skin shows between them however the head turns.
 */
function buildHimeHair(group, r, cap, material, curtains) {
  // A point on the skull's surface (an ellipsoid; the drawn face a little flatter), `out` off it.
  const onFace = (y, z, out = 1.06) => {
    const across = z / SKULL[2];
    const up = y / SKULL[1];
    const depth = Math.sqrt(Math.max(0.05, 1 - across * across - up * up * 0.8));
    return [SKULL[0] * r * depth * out, y * r, z * r * out];
  };
  // Down to the nape behind (polar `HIME.nape`), to the hairline in front.
  cap(1.07, 1.05, HIME.nape);
  for (let index = 0; index < HIME.bangs; index += 1) {
    const across = (index / (HIME.bangs - 1) - 0.5) * 1.35;
    hairLock(group, material, [onScalp(r, 0.32, across * 0.8, 1.05), [SKULL[0] * r * 1.0, 0.45 * r, across * 0.62 * r], onFace(FACE.eyeLine + 0.2, across * 0.6, 1.06)], 0.3 * r, 0.08 * r, 0.05);
  }
  for (const side of [1, -1]) {
    // Beside the face, cut straight at the jaw, over the edges of the cheeks.
    for (let index = 0; index < 2; index += 1) {
      const z = side * (0.7 + index * 0.1);
      hairLock(group, material, [onScalp(r, 0.62, side * (0.95 + index * 0.2), 1.06), onFace(0.0, z, 1.1), onFace(-0.68, z, 1.12)], 0.36 * r, 0.1 * r, 0.05);
    }
  }
  curtains.push({});
}

function buildFacialHair(group, look, r, shape, material, dangles) {
  // A long beard is a full beard with locks hanging from it.
  const long = look.facialHair === 'longBeard';
  const style = long ? 'beard' : look.facialHair;
  if (style === 'none') return;
  // Jaw and chin, ear to ear: up to the sideburns at the sides, below the
  // mouth at the front.
  const top = (azimuth) => {
    const front = Math.cos(azimuth);
    return 1.75 + 0.62 * Math.max(0, front) ** 3;
  };
  if (style === 'stubble' || style === 'beard') {
    const mat = style === 'stubble' ? surface(material.color.getHex(), { opacity: 0.3 }) : material;
    const beard = new THREE.Mesh(shellGeometry(r, shape, style === 'beard' ? 1.04 : 1.01, top, () => Math.PI * 0.97, [-Math.PI * 0.62, Math.PI * 0.62]), mat);
    beard.material.side = THREE.DoubleSide;
    if (style === 'beard') beard.add(outlineFor(beard, 0.003));
    group.add(beard);
  }
  if (style === 'handlebar') {
    // Thick over the lip and down past the corners of the mouth to the jaw:
    // the horseshoe a brawler wears.
    for (const side of [1, -1]) {
      // Proud of the drawn face (which sits further out than the skull below the eyes).
      hairLock(group, material, [[r * 1.02, -0.44 * r, 0], [r * 1.0, -0.5 * r, side * 0.17 * r], [r * 0.92, -0.62 * r, side * 0.3 * r], [r * 0.82, -0.88 * r, side * 0.34 * r]], 0.17 * r, 0.09 * r, 0.7);
    }
  }
  if (style === 'mustache' || style === 'beard') {
    for (const side of [1, -1]) {
      hairLock(group, material, [[r * 1.01, -0.45 * r, 0], [r * 0.99, -0.5 * r, side * 0.14 * r], [r * 0.9, -0.58 * r, side * 0.23 * r]], 0.12 * r, 0.06 * r, 0.8);
    }
  }
  if (long) {
    // Guan Yu's: two chi of beard to the middle of the chest, in one broad
    // lock from the chin that bends and swings, a narrower one either side
    // from the jaw, and the moustache's ends drawn down long.
    flowingLock(group, material, dangles, [r * 0.9, -0.92 * r, 0], [0.3, -1, 0], [1.7 * r, 1.9 * r], 0.62 * r, 0.16 * r);
    for (const side of [1, -1]) {
      flowingLock(group, material, dangles, [r * 0.74, -0.86 * r, side * 0.36 * r], [0.22, -1, side * 0.12], [1.4 * r, 1.5 * r], 0.32 * r, 0.12 * r);
      hairLock(group, material, [[r * 0.9, -0.58 * r, side * 0.23 * r], [r * 0.92, -0.85 * r, side * 0.3 * r], [r * 0.95, -1.2 * r, side * 0.26 * r]], 0.08 * r, 0.05 * r, 0.6);
    }
  }
}
