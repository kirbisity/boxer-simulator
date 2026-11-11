// Packs the base-mesh tool's output (tools/blender/basebody.py, and the starved deltas of tools/blender/emaciated.py where
// there are any) into src/basebody-data.js: each sex's meshes as base64 typed arrays, and the build each was modelled at.
//   node tools/basebody-pack.js <ref.json> <base-male.json> <base-female.json> [<starved-female.json>]
//
// The build a base mesh was modelled at (REFERENCE_BUILD) is the reference the game measures the mesh against (src/basebody.js):
// a fighter of it gets the mesh as modelled, and every other build moves it by how its loft differs from the reference's. It is
// chosen by what the mesh shows, not fitted: the male is lean and defined (his abs, serratus and the split of his deltoid are
// modelled: the game's `athletic`, 11% fat, where muscle edges show: sculpt.js definedFrom), the female slender with no
// definition (the game's `thin`, BMI 18). A fit of the limbs' radii is printed as a check only: the game's skin radius is the
// physics' segment radius, not the drawn surface's, and a muscular limb and a fat one of the same radius are not the same build.
const REFERENCE_BUILD = { male: 'athletic', female: 'thin' };

import { readFileSync, writeFileSync } from 'node:fs';

const [refPath, malePath, femalePath, starvedPath] = process.argv.slice(2);
const ref = JSON.parse(readFileSync(refPath, 'utf8'));
const starved = starvedPath ? JSON.parse(readFileSync(starvedPath, 'utf8')) : null;
// Positions are stored as 16-bit integers of this many to the unit (the standing height): 0.06 mm on a 1.8 m man.
const POSITION_SCALE = 30000;
// The starved delta (units of standing height, out along the ring's radius) as 16-bit integers of this many to the unit: 0.02 mm.
const DELTA_SCALE = 100000;
// Where each limb's radius is measured (t along it) and the part's matching body.js segment.
const FIT = { lUpper: 'lUpperArm', lFore: 'lForearm', lThigh: 'lThigh', lShin: 'lShank' };
const FIT_SPAN = [0.3, 0.7];
const AXES = { lUpper: ['lShoulder', 'lElbow'], lFore: ['lElbow', 'lHand'], lThigh: ['lHip', 'lKnee'], lShin: ['lKnee', 'lFoot'] };

const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');
const sub = (a, b) => a.map((value, index) => value - b[index]);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);

function referenceOf(sex, base) {
  const mesh = base.meshes.full;
  const radii = {};
  for (const [part, segment] of Object.entries(FIT)) {
    const [from, to] = AXES[part].map((name) => base.joints[name]);
    const axis = sub(to, from);
    const length = Math.hypot(...axis);
    const unit = axis.map((value) => value / length);
    const found = [];
    for (let vertex = 0; vertex < mesh.part.length; vertex += 1) {
      if (base.parts[mesh.part[vertex]] !== part || mesh.blend[vertex] > 0.2) continue;
      const rel = sub(mesh.positions.slice(vertex * 3, vertex * 3 + 3), from);
      const t = dot(rel, unit) / length;
      if (t < FIT_SPAN[0] || t > FIT_SPAN[1]) continue;
      found.push(Math.hypot(...sub(rel, unit.map((value) => value * t * length))));
    }
    found.sort((a, b) => a - b);
    radii[segment] = found[Math.floor(found.length / 2)];
  }
  let best = null;
  for (const [key, build] of Object.entries(ref[sex].builds)) {
    const error = Object.entries(radii).reduce((sum, [segment, radius]) => sum + Math.log(radius / build.radii[segment]) ** 2, 0);
    if (!best || error < best.error) best = { key, error, inputs: build.inputs };
  }
  console.log(sex, 'limb radii (of height)', JSON.stringify(Object.fromEntries(Object.entries(radii).map(([k, v]) => [k, Number(v.toFixed(4))]))), 'nearest by radius', best.key, 'chosen', REFERENCE_BUILD[sex]);
  // (No clothes on the reference: its shape is the bare body's.)
  const { outfit, ...inputs } = ref[sex].builds[REFERENCE_BUILD[sex]].inputs;
  return { key: REFERENCE_BUILD[sex], inputs };
}

function pack(sex, base) {
  const meshes = {};
  for (const [key, mesh] of Object.entries(base.meshes)) {
    const packed = {
      count: mesh.part.length,
      positions: b64(Int16Array.from(mesh.positions, (value) => Math.round(value * POSITION_SCALE))),
      triangles: b64(Uint16Array.from(mesh.triangles)),
      part: b64(Uint8Array.from(mesh.part)),
      part2: b64(Uint8Array.from(mesh.part2)),
      blend: b64(Uint8Array.from(mesh.blend, (value) => Math.round(value * 255))),
    };
    const delta = starved?.[sex]?.[key];
    if (delta) packed.starved = b64(Int16Array.from(delta, (value) => Math.round(value * DELTA_SCALE)));
    meshes[key] = packed;
  }
  const reference = referenceOf(sex, base);
  return { parts: base.parts, joints: base.joints, reference: reference.inputs, referenceBuild: reference.key, meshes };
}

// The emaciated reference's rib and spine slopes on the trunk tile, as 8-bit integers of the steepest slope kept.
const slopes = starved?.trunkSlopes ? { ...starved.trunkSlopes, slopes: b64(Int8Array.from(starved.trunkSlopes.slopes, (value) => Math.round((value / starved.trunkSlopes.steepest) * 127))) } : null;
const data = { positionScale: POSITION_SCALE, deltaScale: DELTA_SCALE, ...(slopes ? { starvedSlopes: slopes } : {}), male: pack('male', JSON.parse(readFileSync(malePath, 'utf8'))), female: pack('female', JSON.parse(readFileSync(femalePath, 'utf8'))) };
const text = `// Generated by tools/basebody-pack.js from tools/blender/basebody.py's output on the user's base meshes (Base_Male_Mesh.blend,
// female.blend${starved ? '; the starved deltas from tools/blender/emaciated.py on ax_model.blend' : ''}): do not edit by hand. Each sex's body without its head, hands and feet, in the game's frame
// (units of standing height, x forward, y up, z to the left), its arms in the rig's A-pose: \`full\` a fighter's, \`crowd\` a crowd's.
// Base64 typed arrays: positions Int16 (÷ positionScale), triangles Uint16, each point's part and blending part (indices into
// \`parts\`) and the blend's weight Uint8 (÷ 255)${starved ? ', the starved delta Int16 (units of height out along the ring, ÷ deltaScale); `starvedSlopes`: the emaciated\n// reference\'s rib and spine slopes on the skin map\'s trunk tile (round, along), Int8 (÷ 127 × steepest), row by row' : ''}.
// \`joints\`: the mesh's joints as modelled; \`reference\`: the inputs of the build it was modelled at (src/basebody.js).
export const BASE_BODY_DATA = ${JSON.stringify(data)};
`;
writeFileSync(new URL('../src/basebody-data.js', import.meta.url), text);
console.log('wrote src/basebody-data.js', (text.length / 1024).toFixed(0), 'KB');
