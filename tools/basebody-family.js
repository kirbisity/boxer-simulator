// Writes the family of builds (the remodel of 2026-11: each sex's base mesh refitted in Blender to an emaciated, an ordinary, a
// muscular, three fat bodies and the game's fattest, the same points in the same order) into src/basebody-data.js as the full meshes' `family`:
// each build each point's offset from the base mesh in its own part's frame (along, fore and aft, across; the frame on the
// mesh's joints, forward +x: src/basebody.js baseFamily), units of height, ten bits a number, three to a Uint32 (each
// (n − 512) × the build's `scale`). A build that is the base itself (the man's muscular one) is left out. In place of the
// emaciated reference's own array (`her`: the family's E is her, refitted).
//   node tools/basebody-family.js <family.json>     {female: {base, E, N, M, F1, F2, F3, F4}, male: …}, flat points
import { readFileSync, writeFileSync } from 'node:fs';
import { BASE_BODY_DATA } from '../src/basebody-data.js';
import { BASE_BODY } from '../src/basebody.js';

const sub = (a, b) => a.map((value, axis) => value - b[axis]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => a.map((value) => value / Math.hypot(...a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** A part's frame on the mesh's joints, forward +x (basebody.js partFrame). */
function frameOf(joints, [from, to]) {
  const axis = unit(sub(joints[to], joints[from]));
  const depthAxis = unit(sub([1, 0, 0], axis.map((value) => value * axis[0])));
  return [axis, depthAxis, cross(axis, depthAxis)];
}

const family = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const path = new URL('../src/basebody-data.js', import.meta.url);
let text = readFileSync(path, 'utf8');
for (const sex of ['female', 'male']) {
  const data = BASE_BODY_DATA[sex];
  const full = data.meshes.full;
  const base = Float32Array.from(new Int16Array(Uint8Array.from(Buffer.from(full.positions, 'base64')).buffer), (value) => value / BASE_BODY_DATA.positionScale);
  const part = Buffer.from(full.part, 'base64');
  const given = family[sex];
  if (given.base.length !== full.count * 3) throw new Error(`${sex}: ${given.base.length / 3} points against the mesh's ${full.count}`);
  const apart = given.base.reduce((most, value, index) => Math.max(most, Math.abs(value - base[index])), 0);
  if (apart > 2 / BASE_BODY_DATA.positionScale) throw new Error(`${sex}: the family's base is not the mesh (${apart} apart)`);
  const frames = data.parts.map((name) => frameOf(data.joints, BASE_BODY.axes[name]));
  const packed = {};
  for (const name of BASE_BODY.family.builds) {
    const offsets = new Float64Array(full.count * 3);
    for (let vertex = 0; vertex < full.count; vertex += 1) {
      const moved = [0, 1, 2].map((axis) => given[name][vertex * 3 + axis] - given.base[vertex * 3 + axis]);
      frames[part[vertex]].forEach((axis, k) => { offsets[vertex * 3 + k] = dot(moved, axis); });
    }
    const most = offsets.reduce((far, value) => Math.max(far, Math.abs(value)), 0);
    if (most < 1e-6) continue;
    const scale = Number((most / 511).toPrecision(6)) * 1.000001;
    const words = new Uint32Array(full.count);
    const ten = (value) => Math.max(0, Math.min(1023, Math.round(value / scale) + 512));
    for (let vertex = 0; vertex < full.count; vertex += 1) words[vertex] = ten(offsets[vertex * 3]) | (ten(offsets[vertex * 3 + 1]) << 10) | (ten(offsets[vertex * 3 + 2]) << 20);
    packed[name] = { scale, offsets: Buffer.from(words.buffer).toString('base64') };
  }
  const written = `"family":${JSON.stringify(packed)}`;
  if (full.family) {
    const old = `"family":${JSON.stringify(full.family)}`;
    if (!text.includes(old)) throw new Error(`${sex}: the old family was not found`);
    text = text.replace(old, written);
  } else {
    const old = `"her":"${full.her}"`;
    if (!text.includes(old)) throw new Error(`${sex}: the emaciated reference's array was not found`);
    text = text.replace(old, written);
  }
  console.log(sex, Object.entries(packed).map(([name, { scale }]) => `${name} ${(scale * 511 * 1000).toFixed(1)}`).join(', '), '(furthest offset, thousandths of height)');
}
writeFileSync(path, text);
console.log('written', (text.length / 1024).toFixed(0), 'KB');
