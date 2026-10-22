// What each body style costs to build: triangles, vertices, bytes, milliseconds.
//   node tools/bodystyle-cost.js
// Builds each style for four bodies of the comparison progression (tools/bodysheet-cast.js), warm, and prints the median of five builds.

import { buildBody } from '../src/body.js';
import { BODY_STYLE_KEYS, buildSkinMesh } from '../src/bodystyles.js';
import { buildLoftBody } from '../src/loftbody.js';
import { buildDetailMap } from '../src/skindetail.js';
import { progression } from './bodysheet-cast.js';

const subjects = [['male', 'starved'], ['male', 'athletic'], ['male', 'obese'], ['female', 'average']].map(([sex, key]) => ({ label: `${sex} ${key}`, body: buildBody(progression(sex).find((row) => row.key === key).inputs) }));
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const bytesOf = (mesh) => [mesh.positions, mesh.normals, mesh.indices, mesh.skinIndex, mesh.skinWeight, mesh.uvs].reduce((sum, array) => sum + (array?.byteLength ?? 0), 0);

const rows = [['crowd (lowDetail loft)', (body) => buildLoftBody(body, { lowDetail: true })], ...BODY_STYLE_KEYS.filter((style) => ['lofted', 'sculpt', 'detail', 'flesh'].includes(style)).map((style) => [style, (body) => buildSkinMesh(body, style)])];
console.log(`${'style'.padEnd(24)}${subjects.map((subject) => subject.label.padStart(34)).join('')}`);
for (const [name, build] of rows) {
  const cells = subjects.map(({ body }) => {
    build(body);
    const times = [];
    let mesh = null;
    const runs = name === 'flesh' ? 3 : 5;
    for (let run = 0; run < runs; run += 1) {
      const start = performance.now();
      mesh = build(body);
      times.push(performance.now() - start);
    }
    const mapBytes = mesh.detail ? mesh.detail.bump.byteLength + mesh.detail.occlusion.byteLength : 0;
    return `${(mesh.indices.length / 3 / 1000).toFixed(1)}k tri ${(mesh.positions.length / 3 / 1000).toFixed(1)}k v ${(median(times)).toFixed(0)} ms ${((bytesOf(mesh) + mapBytes) / 1048576).toFixed(1)} MB`.padStart(34);
  });
  console.log(`${name.padEnd(24)}${cells.join('')}`);
}
const map = [];
for (let run = 0; run < 5; run += 1) {
  const start = performance.now();
  buildDetailMap(subjects[1].body);
  map.push(performance.now() - start);
}
console.log(`detail map alone: ${median(map).toFixed(0)} ms for ${(buildDetailMap(subjects[1].body).bump.byteLength / 1024).toFixed(0)} KB per map (two maps)`);
