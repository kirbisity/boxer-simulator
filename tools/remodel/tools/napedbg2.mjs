const repo = process.argv[2];
const { buildBody } = await import(`${repo}/src/body.js`);
const { buildSkinMesh } = await import(`${repo}/src/bodystyles.js`);
const { BONE, bindPoints, boneFrames } = await import(`${repo}/src/rig.js`);
const { headRadiusAt } = await import(`${repo}/src/helmforms.js`);
const { BASE_BODY } = await import(`${repo}/src/basebody.js`);
const { progression } = await import(`${repo}/tools/bodysheet-cast.js`);
const row = progression('male').find((r) => r.key === 'average');
const body = buildBody(row.inputs); const r = body.lengths.headRadius;
const scale = 1.12 * (1 - BASE_BODY.head.smaller), seat = 0.18 - BASE_BODY.head.lift;
const mesh = buildSkinMesh(body, 'base');
const frame = boneFrames(bindPoints(body), body)[BONE.head];
console.log('head frame', frame.origin.map((v) => v.toFixed(3)), 'x', frame.x.map((v) => v.toFixed(2)), 'y', frame.y.map((v) => v.toFixed(2)), 'z', frame.z.map((v) => v.toFixed(2)), 'regions', [...new Set(mesh.regions)].slice(0, 10), Object.keys(mesh));
const origin = frame.origin.map((v, a) => v - frame.y[a] * seat * r);
const rows = [];
for (let i = 0; i < mesh.regions.length; i += 1) {
  if (mesh.regions[i] !== 'skin') continue;
  const d = [0, 1, 2].map((a) => mesh.positions[i * 3 + a] - origin[a]);
  const dot = (v) => (d[0] * v[0] + d[1] * v[1] + d[2] * v[2]) / (r * scale);
  const x = dot(frame.x), y = dot(frame.y), z = dot(frame.z);
  if (Math.hypot(x, z) > 1.3 || y < -0.75 || x > -0.2 || Math.abs(z) > 0.3) continue;
  rows.push([y, x, z, Math.hypot(x, z), headRadiusAt(Math.atan2(Math.abs(z), x), y), i].map((v) => +v.toFixed(2)));
}
rows.sort((a, b) => a[0] - b[0]); for (const row of rows) console.log(row.join(' '));
