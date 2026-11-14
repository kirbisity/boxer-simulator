// Widths of a man in the bind pose (A-pose; x forward, y up, z across), from his built skin mesh: the bare body and the
// dressed one, in a body style. node widths.mjs <repo> <preset> <style> [bmi]
const [repo, presetName = 'knight', style = 'base', bmiArg = '24'] = process.argv.slice(2);
const { buildBody, PRESETS, FRAMES, normaliseInputs } = await import(`${repo}/src/body.js`);
const { buildSkinMesh } = await import(`${repo}/src/bodystyles.js`);
const { caloriesForWeight } = await import(`${repo}/src/physiology.js`);
const { BONES } = await import(`${repo}/src/loftbody.js`).catch(() => ({}));
const rig = await import(`${repo}/src/rig.js`);
const names = BONES ?? rig.BONES;
const inputsFor = (outfit) => {
  const base = normaliseInputs(structuredClone(PRESETS[presetName]));
  const h = base.heightCm / 100;
  const bmi = Number(bmiArg);
  const out = bmi ? { ...base, calories: Math.round(caloriesForWeight(base, bmi * h * h, FRAMES[base.frame].lean)) } : base;
  if (outfit) { out.outfit = outfit; out.accessories = []; }
  return out;
};
function measure(inputs, onlySkin) {
  const body = buildBody(inputs);
  const mesh = buildSkinMesh(body, style);
  const H = body.heightM;
  const n = mesh.positions.length / 3;
  const bone = new Array(n);
  for (let v = 0; v < n; v += 1) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k += 1) if (mesh.skinWeight[v * 4 + k] > bw) { bw = mesh.skinWeight[v * 4 + k]; best = mesh.skinIndex[v * 4 + k]; }
    bone[v] = names[best];
  }
  const used = new Uint8Array(n);
  for (const i of mesh.indices) used[i] = 1;
  const pts = (pred) => { const out = []; for (let v = 0; v < n; v += 1) if (used[v] && pred(bone[v], v)) out.push([mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2], v]); return out; };
  const arm = new Set(['lUpperArm', 'lForearm', 'rUpperArm', 'rForearm']);
  // width across at a height, from the edges that cross it (so a coarse mesh still measures).
  const across = (pred, y, axis = 2) => {
    let lo = Infinity, hi = -Infinity;
    const ok = (v) => pred(bone[v], v);
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const tri = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
      if (!tri.every(ok)) continue;
      for (let e = 0; e < 3; e += 1) {
        const a = tri[e], b = tri[(e + 1) % 3];
        const ya = mesh.positions[a * 3 + 1], yb = mesh.positions[b * 3 + 1];
        if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
        const u = (y - ya) / (yb - ya);
        const value = mesh.positions[a * 3 + axis] + u * (mesh.positions[b * 3 + axis] - mesh.positions[a * 3 + axis]);
        lo = Math.min(lo, value); hi = Math.max(hi, value);
      }
    }
    return hi - lo;
  };
  const L = body.lengths;
  const hipY = L.ankle + L.shank + L.thigh;
  const shoulderY = hipY + L.trunk - 0.025 * H;
  const isTrunk = (b) => !arm.has(b);
  const any = () => true;
  const out = {};
  // shoulder breadth: the widest across everything from the armpit up to the shoulder's top
  let sb = 0; for (let y = shoulderY - 0.06 * H; y <= shoulderY + 0.04 * H; y += 0.005 * H) sb = Math.max(sb, across(any, y));
  out.shoulders = sb;
  const nipple = hipY + 0.62 * L.trunk;
  out.chest = across(isTrunk, nipple);
  out.chestDepth = across(isTrunk, nipple, 0);
  let waist = Infinity, waistY = 0; for (let y = hipY + 0.12 * L.trunk; y <= hipY + 0.45 * L.trunk; y += 0.01 * L.trunk) { const w = across(isTrunk, y); if (w > 0 && w < waist) { waist = w; waistY = y; } }
  out.waist = waist; out.waistDepth = across(isTrunk, waistY, 0); out.waistAt = (waistY - hipY) / L.trunk;
  out.hips = across(isTrunk, hipY);
  // upper arm: at the middle of the left upper arm, the thickness fore and aft (x) and the girth's radius about the bone's line
  const sh = [0, shoulderY, L.shoulderSpan / 2];
  const ang = 25 * Math.PI / 180; const down = [0, -Math.cos(ang), Math.sin(ang)];
  const armPts = pts((b) => b === 'lUpperArm');
  const slab = (list, origin, dir, from, to) => list.filter((p) => { const t = (p[0] - origin[0]) * dir[0] + (p[1] - origin[1]) * dir[1] + (p[2] - origin[2]) * dir[2]; return t >= from && t <= to; });
  const radial = (list, origin, dir) => { let fore = [Infinity, -Infinity], side = [Infinity, -Infinity]; const perp = [0, dir[2], -dir[1]]; for (const p of list) { const d = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]]; const s = d[1] * perp[1] + d[2] * perp[2]; fore = [Math.min(fore[0], d[0]), Math.max(fore[1], d[0])]; side = [Math.min(side[0], s), Math.max(side[1], s)]; } return [fore[1] - fore[0], side[1] - side[0]]; };
  const mid = slab(armPts, sh, down, 0.4 * L.upperArm, 0.6 * L.upperArm);
  [out.armFore, out.armAcross] = radial(mid, sh, down);
  const thighPts = pts((b) => b === 'lThigh').filter((p) => p[1] > hipY - 0.6 * L.thigh && p[1] < hipY - 0.4 * L.thigh);
  [out.thighFore, out.thighAcross] = radial(thighPts, [0, hipY, L.hipSpan / 2], [0, -1, 0]);
  out.massKg = body.massKg; out.H = H;
  return out;
}
const mm = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'massKg' || k === 'H' || k === 'waistAt' ? +v.toFixed(2) : Math.round(v * 1000)]));
const dressed = measure(inputsFor(null), false);
const bare = measure(inputsFor({ kind: 'mma', design: 0 }), true);
console.log(JSON.stringify({ preset: presetName, style, bmi: bmiArg, bare: mm(bare), dressed: mm(dressed) }));
