// Writes where a sex's base mesh is drawn on the skin map's trunk tile, for the bone relief's bake
// (tools/blender/family/emaciateddetail.py): each drawn point's place on the tile and the model's point it is a copy of.
//   node tools/basebody-trunk.js <female|male> <out.json>
//   out: {TU: (t along the trunk, u round it) a drawn point, S: the model's points it lies on ((i, j, s) a drawn point: s of
//        the way from the mesh's point i to its point j; a seam's split lies between two), T: triangles, count: the mesh's points}
import { writeFileSync } from 'node:fs';
import { baseBodyMesh, baseBodyUvs } from '../src/basebody.js';
import { baseRigOf } from '../src/loftbody.js';
import { DETAIL, DETAIL_TILES } from '../src/skindetail.js';

const [sex, out] = process.argv.slice(2);
if (!['female', 'male'].includes(sex) || !out) throw new Error('usage: node tools/basebody-trunk.js <female|male> <out.json>');
const rig = baseRigOf(sex, false);
const { count } = baseBodyMesh(sex, false);
/** A source as a mix of two of the mesh's points: itself, or a seam split's two ends (each end a mesh point: a split of a split is not followed). */
function onMesh(source) {
  if (source < count) return [source, source, 0];
  const [i, j, s] = rig.sources.between[source - count];
  if (i >= count || j >= count) throw new Error('a split of a split');
  return [i, j, s];
}
const uvs = baseBodyUvs(rig);
const tile = DETAIL_TILES.trunk;
const [atlasWidth, atlasHeight] = DETAIL.atlas;
const gutter = DETAIL.gutter;
const [from, to] = DETAIL.spans.trunk;
const kept = new Int32Array(rig.render.count).fill(-1);
const TU = [];
const S = [];
for (let index = 0; index < rig.render.count; index += 1) {
  const x = uvs[index * 2] * atlasWidth;
  const y = uvs[index * 2 + 1] * atlasHeight;
  if (x < tile.x || x > tile.x + tile.w || y < tile.y || y > tile.y + tile.h) continue;
  kept[index] = S.length / 3;
  S.push(...onMesh(rig.render.source[index]));
  TU.push(from + ((to - from) * (y - tile.y - gutter - 0.5)) / (tile.h - 2 * gutter - 1), (x - tile.x - gutter - 0.5) / (tile.w - 2 * gutter - 1));
}
const T = [];
for (let at = 0; at < rig.triangles.length; at += 3) {
  const corners = [0, 1, 2].map((k) => kept[rig.triangles[at + k]]);
  if (corners.every((corner) => corner >= 0)) T.push(...corners);
}
writeFileSync(out, JSON.stringify({ TU, S, T, count }));
console.log(sex, 'points', S.length / 3, 'triangles', T.length / 3, 'on a mesh of', count);
