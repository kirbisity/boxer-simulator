const repo = process.argv[2];
const { buildBody, P } = await import(`${repo}/src/body.js`);
const { buildSkinMesh } = await import(`${repo}/src/bodystyles.js`);
const { BONE, bindPoints, boneFrames } = await import(`${repo}/src/rig.js`);
const { progression } = await import(`${repo}/tools/bodysheet-cast.js`);
for (const sex of ['male', 'female']) {
const row = progression(sex).find((r) => r.key === 'average');
const body = buildBody(row.inputs);
const mesh = buildSkinMesh(body, 'base');
const pts = bindPoints(body);
const f = (v) => Array.from(v).map((x) => (+x).toFixed(3)).join(',');
console.log(sex, 'rig head', f(pts[P.head]), 'neck', f(pts[P.neck]));
console.log('mesh bindPoints head', mesh.bindPoints ? f(mesh.bindPoints[P.head]) : null, 'neck', mesh.bindPoints ? f(mesh.bindPoints[P.neck]) : null);
const bf = mesh.bindFrames?.[BONE.head]; console.log('mesh bind head frame', bf && { o: f(bf.origin), x: f(bf.x), y: f(bf.y) });
const rf = boneFrames(pts, body)[BONE.head]; console.log('rig head frame', { o: f(rf.origin), x: f(rf.x), y: f(rf.y) });
const nf = mesh.bindFrames?.[BONE.neck]; console.log('mesh bind neck frame', nf && { o: f(nf.origin), y: f(nf.y) });
}
