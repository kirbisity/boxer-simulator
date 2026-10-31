// A powered exoskeleton, after Sarcos's Guardian XO: a frame round a man,
// not a skin over him. His body is drawn as any man's (his clothes, his
// head, his helmet if the kit has one); the frame is hung on his bones
// beside it, as robotview.js hangs a machine's shells: a tall power pack on
// his back standing above his head, a yoke over his shoulders, a belt round
// his hips, and down each limb a strut on its outer side and one behind,
// held by cuffs, with a motor drum at every joint: shoulders, elbows, hips,
// knees, ankles. A design's `exo` asks for it: `frame` (the struts' and
// pack's colour), `joint` (the drums), `accent` (hoses and stripes),
// `plate` (armour panels' colour), and `cover`: 'open' (the bare frame, the
// man in it plain to see), 'armoured' (bolt-on panels over his chest,
// belly, shoulders, forearms, thighs and shins) or 'enclosed' (a hull
// round his trunk, pauldrons, and the limbs' panels doubled).

/* global THREE */

import { P } from './body.js';
import { BONE } from './rig.js';
import { surface } from './toon.js';
import { inkAll, steelMaterial } from './wardrobe.js';

const COVERS = ['open', 'armoured', 'enclosed'];

/**
 * The frame round a man, as attachments: [{ object, bone, at }] (each in its
 * bone's frame, placed at the particle `at`: x forward, y along the bone).
 */
export function buildExoFrame(body, exo, envMap) {
  const s = body.heightM / 1.8;
  const L = body.lengths;
  const seg = body.segments;
  const cover = COVERS.includes(exo.cover) ? exo.cover : 'open';
  const armoured = cover !== 'open';
  const enclosed = cover === 'enclosed';
  const frame = steelMaterial(envMap, { vertexColors: false, color: exo.frame ?? '#5d6168', metalness: 0.55, roughness: 0.45 });
  const joint = surface(new THREE.Color(exo.joint ?? '#1c1d21').getHex(), { roughness: 0.45 });
  const accent = surface(new THREE.Color(exo.accent ?? '#d98a1e').getHex(), { roughness: 0.5 });
  const plate = surface(new THREE.Color(exo.plate ?? exo.frame ?? '#4c5236').getHex(), { roughness: 0.65 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(exo.led ?? '#49e06a') });

  const pieces = [];
  const piece = (bone, at) => {
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    pieces.push({ object: group, bone: BONE[bone], at: P[at] });
    return group;
  };
  const add = (group, geometry, material, at, { rotate = null, scale = null, noOutline = false } = {}) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...at);
    if (rotate) mesh.rotation.set(...rotate);
    if (scale) mesh.scale.set(...scale);
    if (noOutline) mesh.userData.noOutline = true;
    group.add(mesh);
    return mesh;
  };
  const box = (group, material, size, at, options) => add(group, new THREE.BoxGeometry(...size), material, at, options);
  // A drum (a motor) about the limb's z axis (across it).
  const drum = (group, material, r, thick, at) => add(group, new THREE.CylinderGeometry(r, r, thick, 20), material, at, { rotate: [Math.PI / 2, 0, 0] });
  // A rod along y.
  const rod = (group, material, r, y0, y1, x = 0, z = 0) => add(group, new THREE.CylinderGeometry(r, r, Math.abs(y1 - y0), 8), material, [x, (y0 + y1) / 2, z]);
  // A cuff round the limb (a flat ring about y).
  const cuff = (group, r, y) => add(group, new THREE.TorusGeometry(r, 0.01 * s, 6, 18), frame, [0, y, 0], { rotate: [Math.PI / 2, 0, 0] });

  // The back: the power pack (battery and hydraulic pump) standing from the
  // small of his back to above his head, its vents and status light; the
  // yoke across his shoulders; a hose down each side.
  const chest = piece('chest', 'neck');
  const depth = seg.trunk.skinRadius * 2 * 0.8;
  const width = L.shoulderSpan;
  const packTop = 0.42 * s;
  const packBottom = -0.62 * L.trunk;
  const packDepth = (enclosed ? 0.2 : 0.16) * s;
  const packX = -(depth / 2 + packDepth / 2 + 0.03 * s);
  box(chest, frame, [packDepth, packTop - packBottom, width * 0.62], [packX, (packTop + packBottom) / 2, 0]);
  for (let vent = 0; vent < 4; vent += 1) box(chest, joint, [0.01 * s, 0.018 * s, width * 0.44], [packX - packDepth / 2 - 0.004 * s, packTop - 0.08 * s - vent * 0.04 * s, 0]);
  box(chest, glow, [0.01 * s, 0.02 * s, 0.05 * s], [packX - packDepth / 2 - 0.006 * s, packTop - 0.26 * s, 0], { noOutline: true });
  box(chest, accent, [packDepth * 1.02, 0.03 * s, width * 0.64], [packX, packTop - 0.03 * s, 0]);
  // The yoke: over the shoulders from the pack, a drum on each shoulder's top.
  box(chest, frame, [depth * 0.9, 0.04 * s, width * 1.08], [-depth * 0.18, 0.0, 0]);
  for (const side of [1, -1]) {
    rod(chest, accent, 0.008 * s, packBottom + 0.05 * s, packTop - 0.1 * s, packX + packDepth * 0.2, side * width * 0.34);
    // The spine's two rails down to the hip belt.
    box(chest, frame, [0.03 * s, 0.6 * L.trunk, 0.03 * s], [-depth / 2 - 0.02 * s, -0.32 * L.trunk, side * width * 0.2]);
  }
  if (armoured) {
    // The breast and belly plates, standing off the man on the frame.
    box(chest, plate, [0.03 * s, 0.22 * L.trunk * 1.6, width * (enclosed ? 0.86 : 0.7)], [depth / 2 + 0.035 * s, -0.24 * L.trunk, 0]);
    box(chest, plate, [0.025 * s, 0.18 * L.trunk, width * (enclosed ? 0.66 : 0.5)], [depth / 2 + 0.03 * s, -0.55 * L.trunk, 0]);
  }
  if (enclosed) {
    // The hull: side plates closing the trunk between breastplate and pack, and a gorget round the neck.
    for (const side of [1, -1]) box(chest, plate, [depth * 1.15, 0.5 * L.trunk, 0.03 * s], [-0.02 * s, -0.32 * L.trunk, side * width * 0.46]);
    add(chest, new THREE.CylinderGeometry(0.09 * s, 0.12 * s, 0.07 * s, 16, 1, true), plate, [0, 0.04 * s, 0]);
  }

  // The hips: the belt round them and the hip drums on its sides.
  const pelvis = piece('pelvis', 'pelvis');
  const hipR = L.hipSpan / 2 + seg.lThigh.skinRadius;
  add(pelvis, new THREE.TorusGeometry(1, 0.02 * s / hipR, 6, 24), frame, [0, 0.06 * s, 0], { rotate: [Math.PI / 2, 0, 0], scale: [depth * 0.62, hipR * 1.12, 0.35] });
  if (armoured) box(pelvis, plate, [0.025 * s, 0.11 * s, L.hipSpan * 1.1], [depth * 0.58, 0.01 * s, 0]);

  // A limb's struts: one on its outer side, one behind, from `y0` to `y1`, `r`
  // out from the bone, held by cuffs; the outer one carries a hose.
  const struts = (group, out, r, y0, y1, { hose = true } = {}) => {
    box(group, frame, [0.03 * s, y1 - y0, 0.022 * s], [0, (y0 + y1) / 2, out * (r + 0.02 * s)]);
    box(group, frame, [0.02 * s, (y1 - y0) * 0.9, 0.02 * s], [-(r + 0.016 * s), (y0 + y1) / 2, 0]);
    if (hose) rod(group, accent, 0.006 * s, y0 + 0.02 * s, y1 - 0.02 * s, 0.018 * s, out * (r + 0.034 * s));
    for (const y of [y0 + 0.25 * (y1 - y0), y0 + 0.8 * (y1 - y0)]) cuff(group, r + 0.012 * s, y);
  };
  const armourPanel = (group, out, r, y0, y1, face) => {
    // A panel over the limb's front (face 1) or back (face -1), curved to it as a box can be.
    box(group, plate, [0.022 * s, (y1 - y0) * 0.8, r * 1.9], [face * (r + 0.02 * s), (y0 + y1) / 2, out * 0.004 * s]);
  };
  for (const side of ['l', 'r']) {
    const out = side === 'l' ? -1 : 1;
    const upper = piece(`${side}UpperArm`, `${side}Shoulder`);
    const armR = seg[`${side}UpperArm`].skinRadius;
    // The shoulder: a great drum outside it, its axis across.
    drum(upper, joint, 0.07 * s, 0.05 * s, [0, 0, out * (armR + 0.05 * s)]);
    drum(upper, frame, 0.035 * s, 0.056 * s, [0, 0, out * (armR + 0.052 * s)]);
    struts(upper, out, armR, 0.06 * s, L.upperArm - 0.02 * s);
    if (armoured) add(upper, new THREE.SphereGeometry(0.09 * s * (enclosed ? 1.15 : 1), 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), plate, [0, 0.03 * s, out * 0.02 * s], { rotate: [0, 0, Math.PI], scale: [1.1, 0.8, 1.2] });
    if (enclosed) armourPanel(upper, out, armR, 0.06 * s, L.upperArm, 1);

    const fore = piece(`${side}Forearm`, `${side}Elbow`);
    const foreR = seg[`${side}Forearm`].skinRadius;
    drum(fore, joint, 0.048 * s, 0.045 * s, [0, 0, out * (armR + 0.035 * s)]);
    drum(fore, frame, 0.022 * s, 0.05 * s, [0, 0, out * (armR + 0.037 * s)]);
    struts(fore, out, foreR, 0.03 * s, L.forearmToFist - 0.1 * s);
    if (armoured) armourPanel(fore, out, foreR, 0.04 * s, L.forearmToFist - 0.08 * s, -1);

    const thigh = piece(`${side}Thigh`, `${side}Hip`);
    const thighR = seg[`${side}Thigh`].skinRadius;
    drum(thigh, joint, 0.075 * s, 0.05 * s, [0, 0.02 * s, out * (thighR + 0.045 * s)]);
    drum(thigh, frame, 0.035 * s, 0.056 * s, [0, 0.02 * s, out * (thighR + 0.047 * s)]);
    struts(thigh, out, thighR, 0.07 * s, L.thigh - 0.03 * s);
    if (armoured) armourPanel(thigh, out, thighR, 0.08 * s, L.thigh - 0.04 * s, 1);
    if (enclosed) armourPanel(thigh, out, thighR, 0.1 * s, L.thigh - 0.06 * s, -1);

    const shin = piece(`${side}Shin`, `${side}Knee`);
    const shinR = seg[`${side}Shank`].skinRadius;
    drum(shin, joint, 0.06 * s, 0.05 * s, [0, 0, out * (thighR + 0.03 * s)]);
    drum(shin, frame, 0.028 * s, 0.056 * s, [0, 0, out * (thighR + 0.032 * s)]);
    struts(shin, out, shinR, 0.05 * s, L.shank - 0.02 * s);
    // The ankle drum, outside the ankle bone.
    drum(shin, joint, 0.04 * s, 0.04 * s, [0, L.shank - 0.01 * s, out * (shinR + 0.03 * s)]);
    if (armoured) {
      armourPanel(shin, out, shinR, 0.04 * s, L.shank - 0.06 * s, 1);
      // A knee cop over the knee drum's front.
      add(shin, new THREE.SphereGeometry(0.06 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), plate, [thighR * 0.7, 0, 0], { rotate: [0, 0, -Math.PI / 2], scale: [1, 0.7, 1.1] });
    }
  }
  for (const { object } of pieces) inkAll(object);
  return pieces;
}
