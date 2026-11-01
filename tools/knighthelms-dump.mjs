// The knights' helmets' surfaces (src/knighthelms.js) sampled for tools/blender/knighthelms.py, which authors their relief:
// for each design, its sheet and regions, and for each mapped part its `bake` (what is raised, sunk and cut on it) and a
// grid over (|u|, v) of its points (head radii) with the distances along the surface from the face's middle (su, along u)
// and from the part's start (sv, along v).
//
//   node tools/knighthelms-dump.mjs > <dir>/knights.json

import { KNIGHT_FORMS, knightPoint } from '../src/knighthelms.js';

const N = 128;

function sample(form, part) {
  const rows = [];
  for (let j = 0; j <= N; j += 1) {
    const row = [];
    for (let i = 0; i <= N; i += 1) row.push(knightPoint(form, part, i / N, j / N));
    rows.push(row);
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const su = rows.map((row) => {
    let total = 0;
    return row.map((p, i) => (total += i ? dist(p, row[i - 1]) : 0));
  });
  const sv = rows.map((row) => row.map(() => 0));
  for (let i = 0; i <= N; i += 1) {
    for (let j = 1; j <= N; j += 1) sv[j][i] = sv[j - 1][i] + dist(rows[j][i], rows[j - 1][i]);
  }
  const round = (value) => Math.round(value * 1e4) / 1e4;
  return {
    x: rows.map((row) => row.map((p) => round(p[0]))),
    y: rows.map((row) => row.map((p) => round(p[1]))),
    z: rows.map((row) => row.map((p) => round(p[2]))),
    su: su.map((row) => row.map(round)),
    sv: sv.map((row) => row.map(round)),
  };
}

const out = {};
for (const [style, form] of Object.entries(KNIGHT_FORMS)) {
  const parts = {};
  for (const [name, part] of Object.entries(form.parts)) {
    if (part.region) parts[name] = { region: part.region, kind: part.kind, look: part.look, bake: part.bake ?? [], grid: sample(form, part) };
  }
  out[style] = { sheet: form.sheet, regions: form.regions, parts };
}
process.stdout.write(JSON.stringify(out));
