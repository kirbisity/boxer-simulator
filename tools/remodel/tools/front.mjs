// The frontmost drawn surface on lines along x at given (y, z): node front.mjs <repo> <preset> <style> <bmi> y0,y1,step z...
const [repo, presetName, style, bmiArg, ys, ...zs] = process.argv.slice(2);
const { buildBody, PRESETS, FRAMES, normaliseInputs } = await import(`${repo}/src/body.js`);
const { buildSkinMesh } = await import(`${repo}/src/bodystyles.js`);
const { caloriesForWeight } = await import(`${repo}/src/physiology.js`);
const base = normaliseInputs(structuredClone(PRESETS[presetName]));
const h = base.heightCm / 100;
const mesh = buildSkinMesh(buildBody({ ...base, calories: Math.round(caloriesForWeight(base, Number(bmiArg) * h * h, FRAMES[base.frame].lean)) }), style);
const P = mesh.positions; const I = mesh.indices;
const [y0, y1, step] = ys.split(',').map(Number);
for (let y = y1; y >= y0 - 1e-9; y -= step) {
  const out = [];
  for (const z of zs.map(Number)) {
    const hits = [];
    for (let i = 0; i < I.length; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => [P[I[i + k] * 3], P[I[i + k] * 3 + 1], P[I[i + k] * 3 + 2]]);
      const d = (b[1] - c[1]) * (a[2] - c[2]) + (c[2] - b[2]) * (a[1] - c[1]);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((b[1] - c[1]) * (z - c[2]) + (c[2] - b[2]) * (y - c[1])) / d;
      const v = ((c[1] - a[1]) * (z - c[2]) + (a[2] - c[2]) * (y - c[1])) / d;
      if (u < 0 || v < 0 || u + v > 1) continue;
      hits.push([u * a[0] + v * b[0] + (1 - u - v) * c[0], mesh.regions[I[i]]]);
    }
    hits.sort((p, q) => q[0] - p[0]);
    out.push(hits.slice(0, 3).map(([x, role]) => `${role}@${(x * 1000).toFixed(0)}`).join(' ').padEnd(34));
  }
  console.log(y.toFixed(2), out.join('| '));
}
