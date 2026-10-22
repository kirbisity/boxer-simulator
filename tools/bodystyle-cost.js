// What each body style costs to build: triangles, vertices, bytes, milliseconds; for the textured styles the maps too.
//   node tools/bodystyle-cost.js [style,style,...]
// Builds each style for four bodies of the comparison progression (tools/bodysheet-cast.js), warm, and prints the median of
// several builds; the maps are made cold (the cache cleared) and timed once each, as a fighter's first build makes them.

import { buildBody } from '../src/body.js';
import { BODY_STYLE_KEYS, buildSkinMesh, skinTexturesNow, styleSpec } from '../src/bodystyles.js';
import { buildLoftBody } from '../src/loftbody.js';
import { clearSkinTextureCache, compositionKey } from '../src/skintex.js';
import { FACE_MORPH } from '../src/facemorph.js';
import { progression } from './bodysheet-cast.js';

const subjects = [['male', 'starved'], ['male', 'athletic'], ['male', 'obese'], ['female', 'average']].map(([sex, key]) => ({ label: `${sex} ${key}`, body: buildBody(progression(sex).find((row) => row.key === key).inputs) }));
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const bytesOf = (mesh) => [mesh.positions, mesh.normals, mesh.indices, mesh.skinIndex, mesh.skinWeight, mesh.uvs].reduce((sum, array) => sum + (array?.byteLength ?? 0), 0);
const wanted = process.argv[2]?.split(',') ?? ['lofted', 'sculpt', 'detail', 'flesh', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6'];

const rows = [['crowd (lowDetail loft)', (body) => buildLoftBody(body, { lowDetail: true }), null], ...BODY_STYLE_KEYS.filter((style) => wanted.includes(style)).map((style) => [style, (body) => buildSkinMesh(body, style), style])];
console.log(`${'style'.padEnd(24)}${subjects.map((subject) => subject.label.padStart(46)).join('')}`);
for (const [name, build, style] of rows) {
  const cells = subjects.map(({ body }) => {
    build(body);
    const times = [];
    let mesh = null;
    const runs = ['flesh', 'v5', 'v6'].includes(name) ? 3 : 5;
    for (let run = 0; run < runs; run += 1) {
      const start = performance.now();
      mesh = build(body);
      times.push(performance.now() - start);
    }
    let maps = '';
    if (style && styleSpec(style).tex) {
      clearSkinTextureCache();
      const start = performance.now();
      const textures = skinTexturesNow(body, style, mesh);
      const ms = performance.now() - start;
      // On the GPU each map with its mip chain is about 4/3 of its bytes.
      maps = ` +${ms.toFixed(0)} ms maps ${((textures.bytes * 4) / 3 / 1048576).toFixed(1)} MB`;
    }
    const detailBytes = mesh.detail ? mesh.detail.bump.byteLength + mesh.detail.occlusion.byteLength : 0;
    return `${(mesh.indices.length / 3 / 1000).toFixed(1)}k tri ${(median(times)).toFixed(0)} ms ${((bytesOf(mesh) + detailBytes) / 1048576).toFixed(1)} MB${maps}`.padStart(46);
  });
  console.log(`${name.padEnd(24)}${cells.join('')}`);
}
// Buckets: how many distinct map sets the whole progression needs, per textured style.
const cast = [...progression('male'), ...progression('female')].map((row) => buildBody(row.inputs));
for (const style of wanted.filter((key) => styleSpec(key).tex)) console.log(`${style}: ${new Set(cast.map((body) => compositionKey(body, style))).size} buckets for the ${cast.length} bodies of the progression`);
const [faceWidth, faceHeight] = FACE_MORPH.map;
console.log(`face map: ${faceWidth}x${faceHeight} RGBA, ${((faceWidth * faceHeight * 4 * 4) / 3 / 1024).toFixed(0)} KB with mips, one per distinct face`);
