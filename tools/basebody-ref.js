// What the base-mesh tool (tools/blender/basebody.py) needs to know of the game's own bodies, as JSON: for each sex, the bind
// pose's joints (rig.js bindPoints) as fractions of standing height, and each build of the comparison progression
// (tools/bodysheet-cast.js) with its segments' skin radii, also as fractions of height, so the tool can find which build a base
// mesh was modelled at (the reference its shape is measured against: basebody.js).
//   node tools/basebody-ref.js > <out.json>

import { buildBody, P } from '../src/body.js';
import { bindPoints } from '../src/rig.js';
import { progression } from './bodysheet-cast.js';

// The segments whose girth the fit compares (each side's the same in the progression: the left one stands for both).
const FIT_SEGMENTS = ['trunk', 'lUpperArm', 'lForearm', 'lThigh', 'lShank'];

const out = {};
for (const sex of ['male', 'female']) {
  const rows = progression(sex);
  const builds = {};
  let joints = null;
  for (const row of rows) {
    const body = buildBody(row.inputs);
    const H = body.heightM;
    if (!joints) joints = Object.fromEntries(Object.entries(P).map(([name, index]) => [name, bindPoints(body)[index].map((value) => value / H)]));
    builds[row.key] = { inputs: row.inputs, radii: Object.fromEntries(FIT_SEGMENTS.map((key) => [key, body.segments[key].skinRadius / H])) };
  }
  out[sex] = { joints, builds };
}
console.log(JSON.stringify(out));
