// A fighter's head: a skull shaped like a head rather than a ball (tapered
// jaw, receding back under the occiput), and a face built on its surface —
// eyes with lids that blink, brows, nose, lips, cheekbones, ears, hair and
// facial hair. The face reacts to the fight: it winces when hit, goes slack
// when stunned, shuts when knocked out, breathes through the mouth when
// tired, and reddens as the damage adds up.
//
// Head-local axes: x forward (the face), y up, z to the fighter's left.

/* global THREE */
import { P } from './body.js';
import { WORLD } from './physics.js';
import { SoftShell } from './soft.js';

export const LOOK_OPTIONS = {
  hairStyle: ['buzz', 'cleanShort', 'fade', 'cornrows', 'bun', 'ponytail', 'bald'],
  facialHair: ['none', 'stubble', 'mustache', 'beard'],
  eyeColor: ['brown', 'hazel', 'blue', 'green', 'grey'],
};
export const DEFAULT_LOOK = { skinTone: 'medium', hairStyle: 'cleanShort', hairColor: '#20160f', facialHair: 'none', eyeColor: 'brown' };
const EYE_COLORS = { brown: 0x4a2c17, hazel: 0x7a5a2a, blue: 0x3d6fa8, green: 0x4e7a45, grey: 0x7d8790 };
// Skull proportions as multiples of the head radius: depth, height, width
// (about 20 × 23 × 15.5 cm on an adult man).
const SKULL = [0.98, 1.15, 0.8];
const FACE = {
  blinkEvery: [2.2, 4.5], // seconds between blinks
  blinkSeconds: 0.13,
  winceSeconds: 0.45,
  bruiseShare: 0.35, // how far the skin tints towards a bruise at full brain strain
};

/** Shape the unit sphere into a head: narrower jaw, back of the head receding into the neck. */
function headDeform(position, jawTaper) {
  const p = position;
  for (let index = 0; index < p.count; index += 1) {
    let x = p.getX(index);
    const y = p.getY(index);
    let z = p.getZ(index);
    if (y < 0.15) {
      const drop = 0.15 - y;
      z *= 1 - 0.3 * jawTaper * drop * drop;
      if (x < 0) x *= 1 - 0.38 * drop;
      else x *= 1 - 0.08 * drop * drop;
    }
    if (x > 0 && y > 0.35) x *= 1 - 0.1 * (y - 0.35);
    p.setXYZ(index, x * SKULL[0], y * SKULL[1], z * SKULL[2]);
  }
}

function headGeometry(radius, jawTaper, segments = 32) {
  const geometry = new THREE.SphereGeometry(1, segments, Math.round(segments * 0.75));
  headDeform(geometry.attributes.position, jawTaper);
  geometry.scale(radius, radius, radius);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A layer over part of the skull, for hair and beards: the head's own shape,
 * inflated, keeping only the triangles whose corners all pass `keep(x, y, z)`
 * (tested on the unit sphere before shaping, x forward, y up, z left).
 */
function shellGeometry(radius, jawTaper, inflate, keep) {
  // Fine enough that the edge of a hairline or beard reads as a line, not steps.
  const geometry = new THREE.SphereGeometry(1, 72, 52);
  const unit = Float32Array.from(geometry.attributes.position.array);
  const index = geometry.index.array;
  const kept = [];
  const passes = (corner) => keep(unit[corner * 3], unit[corner * 3 + 1], unit[corner * 3 + 2]);
  for (let face = 0; face < index.length; face += 3) {
    if (passes(index[face]) && passes(index[face + 1]) && passes(index[face + 2])) kept.push(index[face], index[face + 1], index[face + 2]);
  }
  geometry.setIndex(kept);
  headDeform(geometry.attributes.position, jawTaper);
  geometry.scale(radius * inflate, radius * inflate, radius * inflate);
  geometry.computeVertexNormals();
  return geometry;
}

/** The hairline: how low hair comes, from the brow at the front to the nape at the back. */
function hairline(front, back) {
  return (x, y) => y >= back + (front - back) * ((x + 1) / 2) ** 1.4;
}

function shade(hex, amount) {
  const color = new THREE.Color(hex);
  const hsl = {};
  color.getHSL(hsl);
  color.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amount)));
  return color;
}

function lit(color, roughness = 0.6) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function ellipsoid(radii, material, segments = 14) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.round(segments * 0.7)), material);
  mesh.scale.set(radii[0], radii[1], radii[2]);
  return mesh;
}

function tube(points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 10, radius, 6, false), material);
}

/**
 * Build the head for a fighter.
 * @returns {{ group, shell, update(dt, fighter, time) }}
 */
export function buildHead(body, lookInput, skinHex, cornerHex) {
  const look = { ...DEFAULT_LOOK, ...lookInput };
  const r = body.lengths.headRadius;
  const female = body.inputs.sex === 'female';
  const jawTaper = female ? 1.25 : 0.85 + 0.3 * (1 - body.inputs.training);
  const group = new THREE.Group();
  const skinMaterial = lit(skinHex, 0.55);
  const baseSkin = skinMaterial.color.clone();
  const darkSkin = lit(shade(skinHex, -0.08), 0.6);
  const lipMaterial = lit(new THREE.Color(skinHex).lerp(new THREE.Color(0xa0464a), 0.35), 0.45);
  const hairMaterial = lit(look.hairColor, 0.85);

  const skull = new SoftShell(headGeometry(r, jawTaper), skinMaterial, body.segments.head.fleshFirmness);
  group.add(skull.mesh);

  // Features sit on the skull's surface: find it by casting from in front.
  const probe = new THREE.Mesh(headGeometry(r, jawTaper, 24));
  const raycaster = new THREE.Raycaster();
  const surface = (y, z) => {
    raycaster.set(new THREE.Vector3(r * 2, y * r, z * r), new THREE.Vector3(-1, 0, 0));
    const hit = raycaster.intersectObject(probe)[0];
    return hit ? hit.point.x : r * 0.6;
  };
  const at = (y, z, out = 0) => new THREE.Vector3(surface(y, z) + out * r, y * r, z * r);

  // The chin: mostly sunk into the skull, so it shapes the jaw rather than sitting on it.
  const chin = ellipsoid([0.12 * r, 0.12 * r, 0.24 * r], skinMaterial);
  chin.position.copy(at(-0.84, 0, -0.095));
  group.add(chin);

  // Eyes: white, iris, pupil, a catch-light, a lower lid, and an upper lid
  // that scales down over the eye to blink, squint and close.
  const eyeR = 0.13 * r;
  const white = lit(0xf3efe6, 0.3);
  const irisMaterial = lit(EYE_COLORS[look.eyeColor] ?? EYE_COLORS.brown, 0.35);
  const pupilMaterial = lit(0x0b0908, 0.2);
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyes = [1, -1].map((side) => {
    const holder = new THREE.Group();
    holder.position.copy(at(0.03, side * 0.33, -0.08));
    const ball = ellipsoid([eyeR * 0.75, eyeR * 0.72, eyeR], white);
    const iris = ellipsoid([eyeR * 0.2, eyeR * 0.5, eyeR * 0.5], irisMaterial, 12);
    iris.position.x = eyeR * 0.62;
    const pupil = ellipsoid([eyeR * 0.12, eyeR * 0.24, eyeR * 0.24], pupilMaterial, 10);
    pupil.position.x = eyeR * 0.72;
    const glint = ellipsoid([eyeR * 0.05, eyeR * 0.1, eyeR * 0.1], shine, 6);
    glint.position.set(eyeR * 0.78, eyeR * 0.18, side * eyeR * 0.15);
    const lower = ellipsoid([eyeR * 0.82, eyeR * 0.32, eyeR * 1.08], skinMaterial);
    lower.position.y = -eyeR * 0.62;
    const upper = ellipsoid([eyeR * 0.86, eyeR * 0.8, eyeR * 1.12], skinMaterial);
    const socket = ellipsoid([eyeR * 0.5, eyeR * 1.05, eyeR * 1.35], darkSkin);
    socket.position.set(-eyeR * 0.3, eyeR * 0.05, 0);
    holder.add(socket, ball, iris, pupil, glint, lower, upper);
    group.add(holder);
    return { holder, upper, iris, pupil, glint };
  });

  // Brows: hair-coloured arcs whose inner ends drop when the face tightens.
  const browMaterial = lit(shade(look.hairColor, -0.02), 0.9);
  const brows = [1, -1].map((side) => {
    const points = [[0, 0, side * 0.12], [0.02, 0.05, side * 0.3], [-0.02, 0.01, side * 0.5]].map(([dx, dy, z]) => {
      const p = at(0.27 + dy, z, 0.02 + dx);
      return [p.x, p.y, p.z];
    });
    const brow = tube(points, (female ? 0.024 : 0.034) * r, browMaterial);
    group.add(brow);
    return { brow, side, rest: brow.position.clone() };
  });

  // Nose: bridge, tip and the wings of the nostrils.
  const noseSize = 0.9 + 0.2 * (body.heightM - 1.6);
  const bridgeTop = at(0.1, 0, -0.04);
  const tip = at(-0.3, 0, 0.17 * noseSize);
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * r, 0.075 * r, bridgeTop.distanceTo(tip), 8), skinMaterial);
  bridge.position.copy(bridgeTop).lerp(tip, 0.5);
  bridge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bridgeTop.clone().sub(tip).normalize());
  const noseTip = ellipsoid([0.09 * r, 0.085 * r, 0.1 * r], skinMaterial);
  noseTip.position.copy(tip);
  const wings = [1, -1].map((side) => {
    const wing = ellipsoid([0.06 * r, 0.05 * r, 0.05 * r], skinMaterial);
    wing.position.copy(at(-0.33, side * 0.1, 0.04));
    return wing;
  });
  group.add(bridge, noseTip, ...wings);

  // Mouth: lips, a dark interior, and the mouthguard that shows when it opens.
  const mouthCenter = at(-0.57, 0, -0.02);
  const interior = ellipsoid([0.05 * r, 0.06 * r, 0.2 * r], lit(0x2a1012, 0.9));
  interior.position.copy(mouthCenter).add(new THREE.Vector3(-0.02 * r, -0.03 * r, 0));
  const guard = ellipsoid([0.03 * r, 0.05 * r, 0.18 * r], lit(cornerHex, 0.3));
  guard.position.copy(interior.position).add(new THREE.Vector3(0.025 * r, 0.01 * r, 0));
  const lipGeometry = new THREE.SphereGeometry(1, 14, 8);
  lipGeometry.scale(0.045 * r, 0.04 * r, 0.21 * r);
  const upperLip = new THREE.Mesh(lipGeometry, lipMaterial);
  upperLip.position.copy(mouthCenter).add(new THREE.Vector3(0.01 * r, 0.035 * r, 0));
  const lowerLip = new THREE.Mesh(lipGeometry, lipMaterial);
  lowerLip.scale.set(1.15, 1.2, 0.95);
  const lowerRest = mouthCenter.clone().add(new THREE.Vector3(0, -0.04 * r, 0));
  lowerLip.position.copy(lowerRest);
  group.add(interior, guard, upperLip, lowerLip);

  // Ears, with a darker hollow; old campaigners' are a little swollen.
  const cauliflower = body.inputs.age > 34 && body.inputs.training > 0.6 ? 1.25 : 1;
  for (const side of [1, -1]) {
    const ear = ellipsoid([0.13 * r, 0.27 * r, 0.06 * r * cauliflower], skinMaterial);
    ear.position.set(-0.08 * r, 0.0, side * SKULL[2] * r * 0.97);
    ear.rotation.z = 0.15;
    const hollow = ellipsoid([0.07 * r, 0.17 * r, 0.03 * r], darkSkin);
    hollow.position.set(-0.06 * r, 0.01 * r, side * (SKULL[2] * r + 0.02 * r));
    group.add(ear, hollow);
  }

  buildHair(group, look, r, jawTaper, hairMaterial);
  buildFacialHair(group, look, r, jawTaper, hairMaterial);
  group.traverse((object) => { if (object.isMesh) object.castShadow = true; });

  // ---- Expression -------------------------------------------------------
  const face = { blinkIn: 1 + Math.random() * 3, blinking: 0, lid: 0.15, mouth: 0, brow: 0, gaze: [0, 0], gazeIn: 1 };
  function update(dt, fighter, time) {
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

    let lid = 0.15 + 0.15 * punching + 0.6 * wince + 0.4 * stunned;
    if (face.blinking > 0) lid = 1;
    if (out) lid = 1;
    const mouth = out ? 0.7 : Math.min(1, 0.9 * wince + panting + 0.3 * stunned) * (punching ? 0.2 : 1);
    const brow = Math.min(1, 0.7 * wince + 0.5 * punching) - 0.5 * stunned;
    // Ease towards the expression, a little faster when shutting.
    const rate = (target, current, speed) => current + (target - current) * Math.min(1, dt * speed);
    face.lid = rate(Math.min(1, lid), face.lid, face.blinking > 0 ? 40 : 14);
    face.mouth = rate(mouth, face.mouth, 12);
    face.brow = rate(brow, face.brow, 10);
    // The eyes look about, unfocused when stunned.
    face.gazeIn -= dt;
    if (face.gazeIn <= 0) {
      const wander = stunned ? 0.35 : 0.12;
      face.gaze = [(Math.random() - 0.5) * wander, (Math.random() - 0.5) * wander];
      face.gazeIn = stunned ? 0.25 : 0.6 + Math.random() * 1.4;
    }

    for (const eye of eyes) {
      const closed = face.lid;
      eye.upper.scale.y = eyeR * Math.max(0.05, 0.8 * closed + 0.06);
      eye.upper.position.set(eyeR * 0.08, eyeR * (0.72 - 0.72 * closed), 0);
      for (const [part, depth] of [[eye.iris, 0.62], [eye.pupil, 0.72]]) {
        part.position.set(eyeR * depth, face.gaze[1] * eyeR, face.gaze[0] * eyeR);
      }
      eye.glint.visible = closed < 0.6;
    }
    for (const { brow, side, rest } of brows) {
      brow.position.set(rest.x, rest.y - face.brow * 0.05 * r, rest.z);
      brow.rotation.x = side * face.brow * 0.18;
    }
    lowerLip.position.copy(lowerRest).add(new THREE.Vector3(-0.02 * r * face.mouth, -0.11 * r * face.mouth, 0));
    interior.scale.y = 0.06 * r * (0.2 + face.mouth);
    guard.visible = face.mouth > 0.2;

    // Skin reddens and darkens with accumulated brain strain.
    const capacity = WORLD.concussionCapacity * fighter.body.chin * (fighter.knockdowns + 1);
    const damage = Math.min(1, fighter.concussion / capacity + fighter.knockdowns * 0.25);
    skinMaterial.color.copy(baseSkin).lerp(new THREE.Color(0x9c3b3f), damage * FACE.bruiseShare);
  }

  return { group, shell: skull, update };
}

function buildHair(group, look, r, jawTaper, material) {
  const style = look.hairStyle;
  if (style === 'bald') return;
  // A cap of the skull's own shape down to the hairline.
  const cap = (inflate, front = 0.42, back = -0.3, mat = material) => {
    const mesh = new THREE.Mesh(shellGeometry(r, jawTaper, inflate, hairline(front, back)), mat);
    group.add(mesh);
    return mesh;
  };
  if (style === 'buzz') cap(1.018);
  else if (style === 'cleanShort') {
    cap(1.04);
    const top = ellipsoid([0.75 * r, 0.32 * r, 0.62 * r], material);
    top.position.set(0.08 * r, 0.88 * r, 0);
    group.add(top);
  } else if (style === 'fade') {
    // Longer on top, clipped close at the sides: two layers, the lower one thin.
    cap(1.06, 0.5, 0.45);
    cap(1.012, 0.42, -0.3, new THREE.MeshStandardMaterial({ color: material.color, roughness: 0.95, transparent: true, opacity: 0.55, depthWrite: false }));
  } else if (style === 'cornrows') {
    cap(1.015);
    // Braids run from the hairline back over the crown, following the skull.
    for (let row = -3; row <= 3; row += 1) {
      const z = row * 0.12;
      const across = Math.sqrt(1 - z * z);
      const points = [];
      for (let step = 0; step <= 10; step += 1) {
        const angle = 0.5 + (step / 10) * 2.3;
        points.push([Math.cos(angle) * SKULL[0] * 1.03 * r * across, Math.sin(angle) * SKULL[1] * 1.03 * r * across, z * SKULL[2] * 1.03 * r]);
      }
      group.add(tube(points, 0.032 * r, material));
    }
  } else if (style === 'bun' || style === 'ponytail') {
    cap(1.04, 0.45, -0.2);
    if (style === 'bun') {
      const bun = ellipsoid([0.3 * r, 0.3 * r, 0.3 * r], material);
      bun.position.set(-0.7 * r, 0.72 * r, 0);
      group.add(bun);
    } else {
      const tie = ellipsoid([0.12 * r, 0.12 * r, 0.12 * r], material);
      tie.position.set(-0.95 * r, 0.25 * r, 0);
      const tail = ellipsoid([0.16 * r, 0.62 * r, 0.16 * r], material);
      tail.position.set(-1.08 * r, -0.35 * r, 0);
      tail.rotation.z = -0.25;
      group.add(tie, tail);
    }
  }
}

function buildFacialHair(group, look, r, jawTaper, material) {
  const style = look.facialHair;
  if (style === 'none') return;
  // Jaw, chin and cheeks below the cheekbones, from ear to ear, leaving the
  // lips clear and the back of the neck bare.
  const beardArea = (x, y, z) => {
    if (x < -0.15) return false;
    const line = -0.18 - 0.28 * Math.max(0, x); // lower at the front, up to the sideburns
    if (y > line) return false;
    const lips = Math.abs(z) < 0.3 && y > -0.62 && y < -0.38 && x > 0.6;
    return !lips;
  };
  const lowerFace = (inflate, opacity) => {
    const mat = opacity < 1 ? new THREE.MeshStandardMaterial({ color: material.color, roughness: 1, transparent: true, opacity, depthWrite: false }) : material;
    group.add(new THREE.Mesh(shellGeometry(r, jawTaper, inflate, beardArea), mat));
  };
  if (style === 'stubble') lowerFace(1.012, 0.35);
  if (style === 'beard') lowerFace(1.05, 1);
  if (style === 'mustache' || style === 'beard') {
    const mustache = new THREE.Mesh(new THREE.TorusGeometry(0.17 * r, 0.04 * r, 6, 12, Math.PI), material);
    mustache.rotation.y = Math.PI / 2;
    const x = SKULL[0] * r * 0.86;
    mustache.position.set(x, -0.46 * r, 0);
    group.add(mustache);
  }
}
