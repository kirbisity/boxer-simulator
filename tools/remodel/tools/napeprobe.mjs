// node napeprobe.mjs <repo> : the base skin's points about the head, against the head the helmets are fitted over (helmforms.js): how far each stands outside it, by height and azimuth.
const repo = process.argv[2];
const { buildBody } = await import(`${repo}/src/body.js`);
const { buildSkinMesh } = await import(`${repo}/src/bodystyles.js`);
const { BONE, bindPoints, boneFrames, toFrame } = await import(`${repo}/src/rig.js`);
const { headRadiusAt } = await import(`${repo}/src/helmforms.js`);
const { BASE_BODY } = await import(`${repo}/src/basebody.js`);
const { progression } = await import(`${repo}/tools/bodysheet-cast.js`);
const scale = 1.12 * (1 - (BASE_BODY.head?.smaller ?? 0)); const seat = 0.18 - (BASE_BODY.head?.lift ?? 0);
for (const sex of ['male', 'female']) for (const row of progression(sex)) {
  if (!['thin', 'average', 'obese', 'bodybuilder', 'athletic'].includes(row.key)) continue;
  const body = buildBody(row.inputs); const r = body.lengths.headRadius;
  const mesh = buildSkinMesh(body, 'base');
  const frame = boneFrames(bindPoints(body), body)[BONE.head];
  const origin = frame.origin.map((v, a) => v - frame.y[a] * seat * r);
  let top = -9; const out = {}; let n = 0;
  for (let i = 0; i < mesh.regions.length; i += 1) {
    if (mesh.regions[i] !== 'skin') continue;
    const p = [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
    const d = p.map((v, a) => v - origin[a]);
    const x = (d[0] * frame.x[0] + d[1] * frame.x[1] + d[2] * frame.x[2]) / (r * scale), y = (d[0] * frame.y[0] + d[1] * frame.y[1] + d[2] * frame.y[2]) / (r * scale), z = (d[0] * frame.z[0] + d[1] * frame.z[1] + d[2] * frame.z[2]) / (r * scale);
    const rho = Math.hypot(x, z); if (rho > 1.3 || y < -1.3) continue;
    top = Math.max(top, y); n += 1;
    const az = Math.atan2(Math.abs(z), x); const over = rho - headRadiusAt(az, y);
    const key = `${az < 1 ? 'front' : az < 2.2 ? 'side' : 'back'}`;
    const yk = (Math.round(y * 5) / 5).toFixed(1);
    out[key] ??= {}; out[key][yk] = Math.max(out[key][yk] ?? -9, over);
  }
  console.log(sex, row.key, 'top y', top.toFixed(2), 'n', n, Object.entries(out).map(([k, v]) => `${k}: ` + Object.entries(v).sort((a, b) => a[0] - b[0]).map(([y, o]) => `${y}:${(o * r * scale * 1000).toFixed(0)}`).join(' ')).join(' | '));
}
