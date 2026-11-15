// node uvprobe.mjs <worktree> <kind> <design>: how far a studded coat's tile is drawn out, piece by piece.
const WT = process.argv[2];
const { buildBody } = await import(`${WT}/src/body.js`);
const { buildSkinMesh } = await import(`${WT}/src/bodystyles.js`);
const { DETAIL_MAPS } = await import(`${WT}/src/detailmaps.js`);
DETAIL_MAPS.on = true;
const body = buildBody({ preset: 'average', outfit: { kind: process.argv[3], design: Number(process.argv[4] ?? 0) } });
const mesh = buildSkinMesh(body, 'base');
console.log(Object.keys(mesh).join(' '));
const uv = mesh.uvs ?? mesh.uv;
const pos = mesh.positions;
const idx = mesh.indices;
const bands = new Map();
for (let i = 0; i < idx.length; i += 3) {
  const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
  const U = (v) => [uv[v * 2], uv[v * 2 + 1]];
  const P = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  const [ua, ub, uc] = [U(a), U(b), U(c)];
  const band = Math.floor(ua[0] / 100);
  if (band < 1) continue;
  const [pa, pb, pc] = [P(a), P(b), P(c)];
  const e1 = pb.map((x, k) => x - pa[k]), e2 = pc.map((x, k) => x - pa[k]);
  const [du1, dv1, du2, dv2] = [ub[0] - ua[0], ub[1] - ua[1], uc[0] - ua[0], uc[1] - ua[1]];
  const det = du1 * dv2 - du2 * dv1;
  if (Math.abs(det) < 1e-9) continue;
  const dPdu = e1.map((x, k) => (x * dv2 - e2[k] * dv1) / det), dPdv = e2.map((x, k) => (x * du1 - e1[k] * du2) / det);
  const key = `${band}:${(mesh.colors ?? mesh.regions)?.[a]}`;
  const row = bands.get(key) ?? { n: 0, u: 0, v: 0, y0: 9, y1: -9 };
  row.n += 1; row.u += Math.hypot(...dPdu); row.v += Math.hypot(...dPdv); row.y0 = Math.min(row.y0, pa[1]); row.y1 = Math.max(row.y1, pa[1]);
  bands.set(key, row);
}
for (const [key, r] of bands) console.log(key, r.n, 'm per tile round', (r.u / r.n).toFixed(3), 'along', (r.v / r.n).toFixed(3), 'y', r.y0.toFixed(2), r.y1.toFixed(2));
