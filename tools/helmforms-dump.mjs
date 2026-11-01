// The remodelled helmets' surfaces (src/helmforms.js) sampled for tools/blender/helmforms.py, which authors their relief:
// for each kind, its sheet, regions, grille and eyes, and for each mapped part a grid over (|u|, v) of its points (head
// radii) and the distances along the surface from the face's middle (su, along u) and from the part's start (sv, along v).
// The foot soldiers' designs (DESIGN_FORMS) too, with their `build` (which of helmforms.py's builders), sights and openings.
//
//   node tools/helmforms-dump.mjs > forms.json

import { DESIGN_FORMS, FORM_GRILLES, formPoint, formRegions, HELM_FORMS } from '../src/helmforms.js';

const N = 128;

function sample(part) {
  const rows = [];
  for (let j = 0; j <= N; j += 1) {
    const row = [];
    for (let i = 0; i <= N; i += 1) row.push(formPoint(part, i / N, j / N));
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
for (const [style, form] of Object.entries(HELM_FORMS)) {
  const parts = {};
  for (const [name, part] of Object.entries(form.parts)) {
    if (part.region) parts[name] = { region: part.region, grid: sample(part), stations: part.stations };
  }
  out[style] = { sheet: form.sheet, regions: formRegions(style), grille: form.grille ? FORM_GRILLES[form.grille] : null, eyes: form.eyes ?? null, feathers: form.feathers ?? null, parts };
}
for (const [style, form] of Object.entries(DESIGN_FORMS)) {
  const parts = {};
  for (const [name, part] of Object.entries(form.parts)) if (part.region) parts[name] = { region: part.region, grid: sample(part), stations: part.stations };
  out[style] = { sheet: form.sheet, regions: form.regions, build: form.build, sight: form.sight ?? null, opening: form.opening ?? null, arches: form.arches ?? null, grille: null, eyes: null, feathers: null, parts };
}
process.stdout.write(JSON.stringify(out));
