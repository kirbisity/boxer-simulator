// A piece's fit ring by ring, at the front, side and back: node fitrings.mjs <repo> <preset> <bmi> <part> <role>
const [repo, presetName = 'knight', bmiArg = '24', part = 'trunk', role = 'steel'] = process.argv.slice(2);
const { buildBody, PRESETS, FRAMES, normaliseInputs } = await import(`${repo}/src/body.js`);
const { buildSkinMesh } = await import(`${repo}/src/bodystyles.js`);
const { caloriesForWeight } = await import(`${repo}/src/physiology.js`);
const base = normaliseInputs(structuredClone(PRESETS[presetName]));
const h = base.heightCm / 100;
globalThis.__fitDump = [];
buildSkinMesh(buildBody({ ...base, calories: Math.round(caloriesForWeight(base, Number(bmiArg) * h * h, FRAMES[base.frame].lean)) }), 'base');
const rows = new Map();
for (const d of globalThis.__fitDump) { if (d.name !== part || d.role !== role) continue; const k = `${d.piece}|${d.t.toFixed(3)}`; (rows.get(k) ?? rows.set(k, []).get(k)).push(d); }
const mm = (v) => (v * 1000).toFixed(0).padStart(4);
console.log('piece|t        kind  n  thick | front: flat need out | side: flat need out | back: flat need out');
for (const [k, list] of [...rows].sort((a, b) => a[0].split('|')[0] - b[0].split('|')[0] || a[0].split('|')[1] - b[0].split('|')[1])) {
  const pick = (angle) => list.reduce((best, d) => (Math.abs(Math.atan2(Math.sin(d.a - angle), Math.cos(d.a - angle))) < Math.abs(Math.atan2(Math.sin(best.a - angle), Math.cos(best.a - angle))) ? d : best));
  const show = (d) => `${mm(d.radius / d.standoff)} ${mm(d.need)} ${mm(d.radius * d.laid)}`;
  console.log(k.padEnd(14), String(list[0].kind).padEnd(5), String(list[0].cut).padEnd(5), (list[0].ribs ?? []).map(mm).join('/'), (list[0].thick ?? 0).toFixed(3), '|', show(pick(0)), '|', show(pick(Math.PI / 2)), '|', show(pick(Math.PI)));
}
