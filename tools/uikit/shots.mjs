// Quick looks: node shots.mjs <outdir> <cfg,cfg> <name>=<js expr to run after load> ...   (each on a fresh load)
// (tools/uikit/: droppable.) Sizes: desktop 1440x900, phone 390x844, laptop 1280x700, wide 844x390; cfg is <size>-<en|zh>.
// SITE=<url> looks at another copy (a frozen main under shots/before-site/). Steps in one <js> are split on ';;'.
import { openPage } from './cdp.mjs';
const [out, cfgArg, ...steps] = process.argv.slice(2);
const SIZES = { desktop: [1440, 900, false, 1], phone: [390, 844, true, 2], laptop: [1280, 700, false, 1], wide: [844, 390, true, 2] };
const URL = process.env.SITE ?? 'http://localhost:8994/index.html';
for (const cfg of cfgArg.split(',')) {
  const [device, lang] = cfg.split('-');
  const [w, h, mobile, dpr] = SIZES[device];
  const page = await openPage({ width: w, height: h, mobile, scale: dpr });
  for (const step of steps) {
    const cut = step.indexOf('=');
    const [name, code] = cut < 0 ? [step, ''] : [step.slice(0, cut), step.slice(cut + 1)];
    try {
      await page.goto(URL);
      await page.eval(`localStorage.setItem('gladiator.lang', '${lang}'); localStorage.setItem('gladiator.tutorialDone', '1'); localStorage.setItem('gladiator.introSeen', '1'); localStorage.setItem('gladiator.fightLegendSeen', '1');`);
      await page.goto(URL);
      await page.until('Boolean(window.boxer)', 60000);
      await page.wait(2200);
      for (const part of code.split(';;')) { if (part.trim()) { await page.eval(part); await page.wait(900); } }
      await page.shot(`${out}/${cfg}/${name}.png`);
      let check = ''; try { check = await page.eval(`JSON.stringify(window.boxer.checkButtons()).slice(0, 600)`); } catch (e) { check = e.message.slice(0, 100); }
      console.log(cfg, name, check, [...new Set(page.logs)].slice(0, 3).join(' | '));
    } catch (error) { console.log(cfg, name, 'ERROR', error.message.slice(0, 300)); }
  }
  await page.close();
}
