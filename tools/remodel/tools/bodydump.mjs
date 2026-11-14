// node bodydump.mjs <repo> : every preset's built body as JSON lines (functions dropped), for a diff between two trees.
const repo = process.argv[2];
const { buildBody, PRESETS } = await import(`${repo}/src/body.js`);
const { bindPoints, P } = await import(`${repo}/src/rig.js`).then(async (rig) => ({ bindPoints: rig.bindPoints, P: (await import(`${repo}/src/body.js`)).P }));
const flat = (value, path, out) => { if (value && typeof value === 'object') { for (const [k, v] of Object.entries(value)) flat(v, `${path}.${k}`, out); } else if (typeof value !== 'function') out[path] = value; return out; };
for (const [key, inputs] of Object.entries(PRESETS)) {
  let body; try { body = buildBody(structuredClone(inputs)); } catch (e) { console.log(JSON.stringify({ key, error: String(e).slice(0, 80) })); continue; }
  const out = flat(body, key, {});
  try { const pts = bindPoints(body); out[`${key}.#headY`] = pts[P.head][1]; out[`${key}.#neckY`] = pts[P.neck][1]; } catch (e) { out[`${key}.#bind`] = String(e).slice(0, 60); }
  for (const [k, v] of Object.entries(out)) console.log(`${k}\t${typeof v === 'number' ? v.toPrecision(12) : v}`);
}
