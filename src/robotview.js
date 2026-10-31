// A machine's body, after Unitree's G1 and H1: in place of a skin, rigid
// shells over each bone (chest, pelvis, upper arms, forearms, thighs,
// shins) with seams between them, and the dark actuators bare at every
// joint: shoulders, elbows, wrists, hips, knees, ankles and the waist. Each
// piece rides its bone as a hand or a boot does (an attachment), so nothing
// bends or jiggles. An outfit's `armor.robot` asks for it: `metal` (brushed
// aluminium shells, else painted), `bulk` (plate thickness over the
// humanoid's), `led` (the face's lights, robotHead); the shells are the armour's
// `color`, the panels its `mail`, the accent bands its `cloth`. Two looks for
// the mini humanoid (Unitree's G1): `bare`, the limbs' links slim and the
// actuators standing proud of them, as the G1 ships; `plates`, bolt-on armour
// panels over the chest, shoulders, forearms, thighs and shins (`mail`).

/* global THREE */

import { P } from './body.js';
import { BONE } from './rig.js';
import { surface } from './toon.js';
import { inkAll, steelMaterial } from './wardrobe.js';

export const ROBOT_VIEW = {
  joint: 0x1d1e22, // the actuators and the waist
  hardware: 0x55585f, // their bright metal caps and linkages
  status: 0x49e06a, // the small lights on the battery panel
};

/**
 * The shells and joints of a machine, as attachments: [{ object, bone, at }]
 * (each object in its bone's frame, placed at the particle `at`: x forward,
 * y along the bone, z = x × y).
 */
export function buildRobotBody(body, armor, envMap) {
  const robot = armor.robot === true ? {} : armor.robot;
  const s = body.heightM / 1.8;
  const k = robot.bulk ?? 1;
  // A bare frame's links are slimmer than a shelled limb (the joints keep their size).
  const slim = robot.bare ? 0.66 : 1;
  const L = body.lengths;
  const seg = body.segments;
  const shell = robot.metal
    ? steelMaterial(envMap, { vertexColors: false, color: armor.color, metalness: 0.6, roughness: 0.4 })
    : surface(new THREE.Color(armor.color).getHex(), { roughness: 0.5 });
  const panel = surface(new THREE.Color(armor.mail ?? armor.color).getHex(), { roughness: 0.4 });
  const accent = armor.cloth ? surface(new THREE.Color(armor.cloth).getHex(), { roughness: 0.45 }) : panel;
  const joint = surface(ROBOT_VIEW.joint, { roughness: 0.45 });
  const hardware = steelMaterial(envMap, { vertexColors: false, color: ROBOT_VIEW.hardware, metalness: 0.7, roughness: 0.35 });
  const status = new THREE.MeshBasicMaterial({ color: ROBOT_VIEW.status });

  const add = (group, geometry, material, at = [0, 0, 0], { rotate = null, scale = null, glow = false } = {}) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...at);
    if (rotate) mesh.rotation.set(...rotate);
    if (scale) mesh.scale.set(...scale);
    if (glow) mesh.userData.noOutline = true;
    group.add(mesh);
    return mesh;
  };
  // A shell along y from y0 (radius r0) to y1 (r1), eight-sided and chamfered, squashed by sx, sz.
  const tube = (group, material, r0, r1, y0, y1, { sx = 1, sz = 1, sides = 10 } = {}) => {
    const top = y1 > y0 ? r1 : r0;
    const bottom = y1 > y0 ? r0 : r1;
    // A flat face forward (turned in the geometry, so the squash stays square to the bone).
    const geometry = new THREE.CylinderGeometry(top, bottom, Math.abs(y1 - y0), sides).rotateY(Math.PI / sides);
    return add(group, geometry, material, [0, (y0 + y1) / 2, 0], { scale: [sx, 1, sz] });
  };
  // A disc (an actuator) about the z axis, or x.
  const disc = (group, material, r, thick, at, axis = 'z') => add(group, new THREE.CylinderGeometry(r, r, thick, 18), material, at, { rotate: axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2] });
  const ring = (group, material, r, thick, y) => add(group, new THREE.TorusGeometry(r, thick, 6, 20), material, [0, y, 0], { rotate: [Math.PI / 2, 0, 0] });
  const ball = (group, material, r, at, scale = null) => add(group, new THREE.SphereGeometry(r, 16, 12), material, at, { scale });
  const box = (group, material, size, at, glow = false) => add(group, new THREE.BoxGeometry(...size), material, at, { glow });
  const pieces = [];
  const piece = (bone, at) => {
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    pieces.push({ object: group, bone: BONE[bone], at: P[at] });
    return group;
  };

  // The chest: a boxy shell from the collarbones down, tapering to the
  // waist; the panel on its front; a dark battery panel on each flank
  // with its small green lights; the accent band across it.
  const chest = piece('chest', 'neck');
  const depth = seg.trunk.skinRadius * 0.78 * 2 * (0.95 + 0.1 * (k - 1));
  const width = L.shoulderSpan * 0.8 * (1 + 0.15 * (k - 1));
  const chestTop = -0.03 * s;
  const chestBottom = -0.6 * L.trunk;
  tube(chest, shell, 1, 0.82, chestBottom, chestTop, { sx: depth / 2, sz: width / 2, sides: 8 });
  const chestMid = (chestTop + chestBottom) / 2;
  const chestHeight = chestTop - chestBottom;
  box(chest, panel, [0.012 * s, chestHeight * 0.42, width * 0.52], [depth / 2 + 0.002 * s, chestMid + 0.12 * chestHeight, 0]);
  for (const side of [1, -1]) {
    box(chest, joint, [depth * 0.55, chestHeight * 0.45, 0.012 * s], [-0.01 * s, chestMid - 0.08 * chestHeight, side * (width * 0.44)]);
    for (let light = 0; light < 3; light += 1) box(chest, status, [0.012 * s, 0.008 * s, 0.014 * s], [-0.01 * s + (light - 1) * 0.018 * s, chestMid + 0.1 * chestHeight, side * (width * 0.44 + 0.007 * s)], true);
  }
  if (armor.cloth) box(chest, accent, [depth * 1.02, 0.025 * s, width * 0.9], [0, chestMid + 0.32 * chestHeight, 0]);
  // The collar: a dark ring round the neck's root.
  ring(chest, joint, 0.045 * s * k, 0.012 * s, 0);

  // The neck: a black post up to the head.
  const neck = piece('neck', 'neck');
  tube(neck, joint, 0.032 * s * k, 0.028 * s * k, 0, 0.1 * s, { sides: 14 });

  // The waist: the actuator bare between chest and pelvis, its rings and hardware.
  const pelvis = piece('pelvis', 'pelvis');
  const waistLow = 0.06 * L.trunk;
  const waistHigh = 0.42 * L.trunk;
  const waistR = depth * 0.34;
  tube(pelvis, joint, waistR, waistR * 0.92, waistLow, waistHigh, { sz: 1.3, sides: 14 });
  for (const y of [0.18, 0.3]) ring(pelvis, hardware, waistR * 1.05, 0.008 * s, y * L.trunk);
  box(pelvis, hardware, [0.02 * s, 0.07 * s, waistR * 1.1], [waistR * 0.95, 0.24 * L.trunk, 0]);
  // The pelvis: a small rounded shell over the hips.
  ball(pelvis, shell, 1, [0, 0.01 * s, 0], [depth * 0.42, 0.075 * s * k, (L.hipSpan / 2 + seg.lThigh.skinRadius * 0.9) * (1 + 0.1 * (k - 1))]);
  if (armor.cloth) box(pelvis, accent, [0.012 * s, 0.03 * s, 0.07 * s], [depth * 0.42, 0.02 * s, 0]);

  // A limb: its shell from just past one joint to just short of the next,
  // a seam ring round it, a panel down its front where `front` says.
  const limb = (group, fullRadius, length, { start, end, taper, front = false, band = false }) => {
    const radius = fullRadius * slim;
    tube(group, shell, radius, radius * taper, start, length - end, { sides: 12 });
    ring(group, joint, radius * (1 - (1 - taper) * 0.42) + 0.002 * s, 0.004 * s, start + (length - end - start) * 0.42);
    if (front) box(group, panel, [0.01 * s, (length - end - start) * 0.5, radius * 1.1], [radius * 0.98, start + (length - end - start) * 0.45, 0]);
    if (band && armor.cloth) tube(group, accent, radius * 1.04, radius * 1.04 * (1 - (1 - taper) * 0.3), start + 0.02 * s, start + 0.06 * s, { sides: 12 });
  };
  for (const side of ['l', 'r']) {
    // Outward from the body, in a limb's frame (its z: across, mirrored by side).
    const out = side === 'l' ? -1 : 1;
    const upper = piece(`${side}UpperArm`, `${side}Shoulder`);
    const armR = seg[`${side}UpperArm`].skinRadius * (1 + 0.1 * (k - 1));
    // The shoulder actuator: a big rounded cap, its dark motor face outward.
    ball(upper, shell, 0.06 * s * k, [0, 0.005 * s, 0], [1, 0.95, 1.05]);
    disc(upper, joint, 0.042 * s * k, 0.02 * s, [0, 0.005 * s, out * 0.055 * s * k]);
    limb(upper, armR, L.upperArm, { start: 0.06 * s * k, end: 0.035 * s, taper: 0.85, band: true });
    const fore = piece(`${side}Forearm`, `${side}Elbow`);
    const foreR = seg[`${side}Forearm`].skinRadius * (1 + 0.1 * (k - 1));
    // The elbow: a dark hinge across the arm, its bright cap outside.
    disc(fore, joint, 0.034 * s * k, armR * 2.1, [0, 0, 0]);
    disc(fore, hardware, 0.02 * s * k, armR * 2.2, [0, 0, 0]);
    const wrist = L.forearmToFist - 0.085 * s;
    limb(fore, foreR, wrist, { start: 0.035 * s, end: 0, taper: 0.78, band: true });
    ring(fore, joint, foreR * 0.82, 0.009 * s, wrist + 0.008 * s);

    const thigh = piece(`${side}Thigh`, `${side}Hip`);
    const thighR = seg[`${side}Thigh`].skinRadius * (1 + 0.1 * (k - 1));
    // The hip: a dark motor drum outside the pelvis, a bright cap on it.
    disc(thigh, joint, 0.05 * s * k, 0.05 * s, [0, 0.02 * s, out * (thighR + 0.01 * s)]);
    disc(thigh, hardware, 0.024 * s * k, 0.054 * s, [0, 0.02 * s, out * (thighR + 0.012 * s)]);
    limb(thigh, thighR, L.thigh, { start: 0.06 * s, end: 0.045 * s, taper: 0.75, front: true, band: true });
    const shin = piece(`${side}Shin`, `${side}Knee`);
    const shinR = seg[`${side}Shank`].skinRadius * (1 + 0.1 * (k - 1));
    // The knee: a dark hinge, its motor on the outside; an accent plate over the cap.
    disc(shin, joint, 0.04 * s * k, thighR * 1.7, [0, 0, 0]);
    disc(shin, joint, 0.048 * s * k, 0.03 * s, [-0.01 * s, -0.02 * s, out * (thighR * 0.9 + 0.01 * s)]);
    disc(shin, hardware, 0.02 * s * k, 0.034 * s, [-0.01 * s, -0.02 * s, out * (thighR * 0.9 + 0.012 * s)]);
    if (armor.cloth) box(shin, accent, [0.02 * s, 0.07 * s, thighR * 1.3], [thighR * 0.85, 0.01 * s, 0]);
    limb(shin, shinR, L.shank, { start: 0.045 * s, end: 0.1 * s, taper: 0.7 });
    // The ankle: two slim linkages down to the foot.
    for (const offset of [-1, 1]) tube(shin, joint, 0.007 * s, 0.007 * s, L.shank - 0.11 * s, L.shank - 0.005 * s, { sides: 8 }).position.x = offset * shinR * 0.5;
    ball(shin, hardware, 0.02 * s * k, [0, L.shank - 0.005 * s, 0]);
  }
  // Bolt-on armour (`plates`): a panel standing off each shell, on the
  // chest's front and flanks, over the shoulders, down the forearms' backs,
  // the thighs' fronts and the shins.
  if (robot.plates) {
    const plate = surface(new THREE.Color(armor.mail ?? armor.color).getHex(), { roughness: 0.7 });
    box(chest, plate, [0.02 * s, chestHeight * 0.55, width * 0.62], [depth / 2 + 0.014 * s, chestMid + 0.08 * chestHeight, 0]);
    for (const side of [1, -1]) box(chest, plate, [depth * 0.7, chestHeight * 0.5, 0.016 * s], [0, chestMid, side * (width * 0.47)]);
    for (const side of ['l', 'r']) {
      const at = (bone) => pieces.find((entry) => entry.bone === BONE[bone]).object;
      const armR = seg[`${side}UpperArm`].skinRadius;
      ball(at(`${side}UpperArm`), plate, 0.075 * s, [0, 0.02 * s, 0], [1.05, 0.7, 1.15]);
      box(at(`${side}Forearm`), plate, [0.016 * s, L.forearmToFist * 0.42, armR * 1.4], [-armR * 0.95, L.forearmToFist * 0.4, 0]);
      const thighR = seg[`${side}Thigh`].skinRadius * slim;
      box(at(`${side}Thigh`), plate, [0.018 * s, L.thigh * 0.5, thighR * 1.7], [thighR * 1.05, L.thigh * 0.45, 0]);
      const shinR = seg[`${side}Shank`].skinRadius * slim;
      box(at(`${side}Shin`), plate, [0.018 * s, L.shank * 0.55, shinR * 1.7], [shinR * 1.05, L.shank * 0.42, 0]);
    }
  }
  // The status lights glow; everything else is inked.
  for (const { object } of pieces) inkAll(object);
  return pieces;
}
