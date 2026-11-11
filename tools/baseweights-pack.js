// The base meshes' bone-heat skin weights (tools/blender/baseweights.py) packed into src/basebody-data.js.
//   node tools/baseweights-pack.js export <dir>    each sex's and detail's mesh as <dir>/<sex>-<detail>.json for Blender
//   Blender -b --factory-startup --python tools/blender/baseweights.py -- <dir>/<sex>-<detail>.json <dir>/<sex>-<detail>-weights.json
//   node tools/baseweights-pack.js pack <dir>      the weights into src/basebody-data.js (each mesh's `heat`)
// `heat` (a fighter's mesh only: a crowd keeps the distance weights, and the page's budget is tight): { index (four 4-bit
// indices into `heatBones` a point, two bytes), weight (the first three weights a point, Uint8 ÷ 255; the fourth is the rest) }.

import { readFileSync, writeFileSync } from 'node:fs';
import { BASE_BODY_DATA } from '../src/basebody-data.js';

const [mode, dir] = process.argv.slice(2);
const DATA = new URL('../src/basebody-data.js', import.meta.url);
const bytes = (text) => Buffer.from(text, 'base64');
const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');
// The skeleton's bones, in the order the packed indices name them.
const BONES = ['trunk', 'neck', 'lClavicle', 'lUpperArm', 'lForearm', 'lThigh', 'lShin', 'rClavicle', 'rUpperArm', 'rForearm', 'rThigh', 'rShin'];

for (const sex of ['male', 'female']) {
  for (const detail of ['full']) {
    const mesh = BASE_BODY_DATA[sex].meshes[detail];
    const file = `${dir}/${sex}-${detail}`;
    if (mode === 'export') {
      const raw = bytes(mesh.positions);
      const p = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
      const t = bytes(mesh.triangles);
      const tri = new Uint16Array(t.buffer, t.byteOffset, t.byteLength / 2);
      writeFileSync(`${file}.json`, JSON.stringify({ positions: Array.from(p, (v) => v / BASE_BODY_DATA.positionScale), triangles: Array.from(tri), joints: BASE_BODY_DATA[sex].joints }));
    } else if (mode === 'pack') {
      const { weights } = JSON.parse(readFileSync(`${file}-weights.json`, 'utf8'));
      if (weights.length !== mesh.count) throw new Error(`${file}: ${weights.length} points, the mesh ${mesh.count}`);
      const index = new Uint8Array(mesh.count * 2);
      const weight = new Uint8Array(mesh.count * 3);
      weights.forEach((pairs, vertex) => pairs.forEach(([name, w], slot) => {
        index[vertex * 2 + (slot >> 1)] |= BONES.indexOf(name) << ((slot & 1) * 4);
        if (slot < 3) weight[vertex * 3 + slot] = Math.round(w * 255);
      }));
      mesh.heat = { index: b64(index), weight: b64(weight) };
    }
  }
}
if (mode === 'pack') {
  BASE_BODY_DATA.heatBones = BONES;
  const text = readFileSync(DATA, 'utf8');
  const header = text.slice(0, text.indexOf('export const BASE_BODY_DATA'));
  const note = header.includes('`heat`') ? '' : '// `heat` (a fighter\'s mesh): its skin weights from Blender\'s bone heat (tools/blender/baseweights.py, packed by\n// tools/baseweights-pack.js): four 4-bit indices into `heatBones` a point, and the first three weights Uint8 (÷ 255), the fourth the rest.\n';
  writeFileSync(DATA, `${header}${note}export const BASE_BODY_DATA = ${JSON.stringify(BASE_BODY_DATA)};\n`);
  console.log('packed', (readFileSync(DATA).length / 1e6).toFixed(3), 'MB');
}
