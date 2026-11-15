// node sway.mjs <preset|outfit> : looseness by role
const WT = '/Users/yanlinzhu/Documents/unix_workspace/boxer-simulator/.claude/worktrees/unit-remodel';
const { buildBody, PRESETS } = await import(`${WT}/src/body.js`);
const { buildLoftBody } = await import(`${WT}/src/loftbody.js`);
for (const name of process.argv.slice(2)) {
  const inputs = PRESETS[name] ?? { ...PRESETS.light, outfit: name };
  const t = Date.now();
  const mesh = buildLoftBody(buildBody(inputs));
  const by = {};
  mesh.regions.forEach((role, v) => { const s = mesh.sway?.[v] ?? 0; const e = (by[role] ??= { n: 0, loose: 0, full: 0 }); e.n += 1; if (s > 0.05) e.loose += 1; if (s > 0.9) e.full += 1; });
  console.log(name, Date.now() - t, 'ms', JSON.stringify(by));
}
