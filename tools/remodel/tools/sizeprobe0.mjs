const repo = process.argv[2];
const { buildBody, PRESETS } = await import(`${repo}/src/body.js`);
const { buildSkinMesh } = await import(`${repo}/src/bodystyles.js`);
const body = buildBody(structuredClone(PRESETS.knight));
for (const style of ['base', 'v7']) {
  const mesh = buildSkinMesh(body, style);
  console.log(style, Object.keys(mesh).join(' '));
  const count = {}; for (const r of mesh.regions) count[r] = (count[r] ?? 0) + 1; console.log(count);
  console.log('parts', mesh.parts ? Object.keys(mesh.parts) : null, 'verts', mesh.positions.length / 3, 'tris', mesh.indices.length / 3);
}
console.log(JSON.stringify(PRESETS.knight).slice(0, 400), body.heightM, body.massKg);
