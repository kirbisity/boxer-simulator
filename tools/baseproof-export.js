// The game's base body at a build, as an OBJ in the game's frame and units of standing height, for the proof sheet
// (tools/blender/baseproof.py: the Blender model and the game's body side by side and overlaid).
//   node tools/baseproof-export.js <sex> <build key | reference> <out.obj> [skin|all]
// `skin` (the default): only the base mesh's own skin points and triangles, whole; `all`: the clothes and the loft's pieces too.

import { writeFileSync } from 'node:fs';
import { buildBody } from '../src/body.js';
import { baseLoftOptions, buildLoftBody } from '../src/loftbody.js';
import { baseBodyMesh } from '../src/basebody.js';
import { progression } from './bodysheet-cast.js';

const [sex, key, out, which = 'skin'] = process.argv.slice(2);
const inputs = key === 'reference' ? baseBodyMesh(sex).reference : progression(sex).find((row) => row.key === key).inputs;
const body = buildBody(inputs);
// (Its skin whole: nothing left out under the clothes it would wear, so the skin can be laid over the model's.)
const mesh = buildLoftBody(body, { ...baseLoftOptions(false), hideCovered: which === 'all', base: true });
const H = body.heightM;
const keep = (vertex) => which === 'all' || mesh.regions[vertex] === 'skin';
const lines = [];
const index = new Int32Array(mesh.positions.length / 3).fill(-1);
let next = 0;
for (let vertex = 0; vertex < index.length; vertex += 1) {
  if (!keep(vertex)) continue;
  index[vertex] = next++;
  lines.push(`v ${(mesh.positions[vertex * 3] / H).toFixed(5)} ${(mesh.positions[vertex * 3 + 1] / H).toFixed(5)} ${(mesh.positions[vertex * 3 + 2] / H).toFixed(5)}`);
}
let triangles = 0;
for (let corner = 0; corner < mesh.indices.length; corner += 3) {
  const [a, b, c] = [mesh.indices[corner], mesh.indices[corner + 1], mesh.indices[corner + 2]].map((vertex) => index[vertex]);
  if (a < 0 || b < 0 || c < 0) continue;
  lines.push(`f ${a + 1} ${b + 1} ${c + 1}`);
  triangles += 1;
}
writeFileSync(out, `${lines.join('\n')}\n`);
console.log(sex, key, 'height', H.toFixed(3), 'm', next, 'points', triangles, 'triangles ->', out);
