// The game's base body written out for the family's scripts (tools/blender/family/README.md):
//   node tools/blender/family/export.mjs <repo root> <work>/emac
// base-<sex>.json  the sex's base mesh (points in units of height, triangles, each point's parts and blend) and its joints
// base-rigged.json both sexes' bone-heat skin weights (four bones a point, into heatBones)
// ref.json         the joints alone (tools/blender/emaciatedbody.py)
import { writeFileSync } from 'node:fs';
const { BASE_BODY, baseBodyMesh, baseHeatBones } = await import(process.argv[2] + '/src/basebody.js');
// (As modelled, its arms where the sculpt has them: the builds are made on that, and the game brings each one's arms down itself.)
BASE_BODY.shoulder = null;
const out = process.argv[3];
const all = {};
const rigged = { heatBones: baseHeatBones() };
for (const sex of ['male', 'female']) {
  const m = baseBodyMesh(sex);
  const full = { positions: Array.from(m.positions), triangles: Array.from(m.triangles), part: Array.from(m.part), part2: Array.from(m.part2), blend: Array.from(m.blend) };
  all[sex] = { sex, parts: m.parts, joints: m.joints, meshes: { full } };
  rigged[sex] = { parts: m.parts, joints: m.joints, ...full, heatIndex: Array.from(m.heatIndex), heatWeight: Array.from(m.heatWeight) };
}
writeFileSync(out + '/base-female.json', JSON.stringify(all.female));
writeFileSync(out + '/base-male.json', JSON.stringify(all.male));
writeFileSync(out + '/base-rigged.json', JSON.stringify(rigged));
writeFileSync(out + '/ref.json', JSON.stringify({ female: { joints: all.female.joints }, male: { joints: all.male.joints } }));
console.log('exported', all.female.meshes.full.positions.length / 3, all.male.meshes.full.positions.length / 3);
