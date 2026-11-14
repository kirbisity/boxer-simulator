const root = process.argv[2];
const { SCENARIOS, battleOf } = await import(root + '/src/scenarios.js');
const { seededRandom } = await import(root + '/src/physics.js');
const { PRESETS } = await import(root + '/src/body.js');
let LEVEL_PRESETS = {};
try { ({ LEVEL_PRESETS } = await import(root + '/src/levelmode/presets.js')); } catch (e) { console.log('no level presets', e.message); }
const { STORY_BATTLES } = await import(root + '/src/story/battles/index.js');
const { storyNewLife } = await import(root + '/src/story/life.js');
const out = {};
const tally = (label, men) => {
  const t = {};
  for (const m of men) { const k = [m.outfit?.kind, 'd' + (m.outfit?.design ?? '-'), m.style, m.mounted ? 'mounted' : '', (m.accessories ?? []).join('+')].join(' · '); (t[k] ??= []).push(m); }
  console.log('==', label);
  for (const [k, v] of Object.entries(t).sort()) console.log('  ', v.length, k);
  return t;
};
for (const key of ['qiJiguang', 'agincourt', 'cajamarca', 'sarhu']) {
  const b = battleOf ? battleOf(key) : SCENARIOS[key];
  const cast = b.cast(seededRandom(7));
  out[key] = { red: cast.red, blue: cast.blue };
  tally(key + ' red', cast.red); tally(key + ' blue', cast.blue);
}
{
  const b = STORY_BATTLES.sarhu; const life = storyNewLife(null, { seed: 7 }); life.chapter = b.n; life.year = b.year;
  const s = b.setup(life, 7, {});
  out.storySarhu = s.fighters.map((f) => ({ ...f.inputs, __corner: f.corner }));
  tally('story sarhu', s.fighters.map((f) => f.inputs));
}
for (const name of ['vaelen', 'forger', 'dunnottarMatchlock', 'dunnottarGuard', 'dunnottarSoldier', 'forgerMaren', 'forgerTobin', 'knight', 'samurai', 'ronin']) {
  const p = PRESETS[name] ?? LEVEL_PRESETS[name];
  console.log(name, p ? JSON.stringify({ outfit: p.outfit, style: p.style, acc: p.accessories }) : 'MISSING');
  if (p) out['preset:' + name] = p;
}
const { writeFileSync } = await import('node:fs');
writeFileSync(process.argv[3], JSON.stringify(out));
