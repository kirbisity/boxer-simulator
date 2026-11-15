// Screenshot every screen and state: node audit.mjs <outdir> [only=flow,flow] [cfg=desktop-en,...]
// (tools/uikit/: droppable.) Every screen in the four configs, with window.boxer.checkButtons() per screen in report-<cfg>.json.
import { openPage } from './cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const out = process.argv[2];
const arg = (name) => process.argv.find((a) => a.startsWith(`${name}=`))?.split('=')[1]?.split(',') ?? null;
const only = arg('only');
const cfgs = arg('cfg') ?? ['desktop-en', 'desktop-zh', 'phone-en', 'phone-zh'];
const URL = process.env.SITE ?? 'http://localhost:8994/index.html';
const SIZES = { desktop: [1440, 900, false, 1], phone: [390, 844, true, 2] };
const report = {};

const home = (i) => `document.querySelectorAll('#home .choice')[${i}].click()`;
const adv = (s) => `(() => { for (let i = 0; i < ${Math.ceil(s / 0.5)}; i += 1) window.boxer.advance(0.5); })()`;

// Each flow: (page, shot) => ...; shot(name) screenshots and runs the button check.
const flows = {
  async home(p, shot) {
    await shot('home');
    await p.eval(`document.querySelectorAll('#home .home-links button')[3].click()`); await p.wait(400);
    await shot('settings');
  },
  async quick(p, shot) {
    await p.eval(home(6)); await p.wait(500); await shot('quick');
    await p.eval(`document.querySelector('#quick .choice:not(.soon)').click()`); await p.wait(700); await shot('wizard-1');
    for (let step = 2; step <= 7; step += 1) {
      const moved = await p.eval(`(() => { const b = document.querySelector('#wizard .wizard-next, #wizard .next, #wizard footer button:last-child'); if (!b) return false; b.click(); return true; })()`);
      if (!moved) break;
      await p.wait(600);
      if (await p.eval(`document.body.dataset.overlay !== 'wizard'`)) break;
      await shot(`wizard-${step}`);
    }
    await p.wait(1500); await shot('quick-fight-start');
    await p.eval(adv(4)); await p.wait(500); await shot('quick-fight-play');
  },
  async versus(p, shot) {
    await p.eval(home(5)); await p.wait(900); await shot('versus');
    await p.eval(`document.querySelector('#versus .screen-body')?.scrollTo(0, 600)`); await p.wait(300); await shot('versus-scrolled');
  },
  async battle(p, shot) {
    await p.eval(home(2)); await p.wait(900); await shot('levels');
    await p.eval(`document.querySelector('#levels-screen .info-btn')?.click()`); await p.wait(500); await shot('levels-info');
    await p.eval(`document.querySelector('.info-pop-close')?.click()`); await p.wait(300);
    await p.eval(`document.querySelector('#levels-screen .level-setup')?.click()`); await p.wait(1500); await shot('muster');
    await p.eval(`document.querySelector('#muster-screen .muster-fold, #muster-screen .muster-tabs button:last-child')?.click()`); await p.wait(500); await shot('muster-2');
  },
  async custom(p, shot) {
    await p.eval(home(2)); await p.wait(700);
    await p.eval(`document.querySelector('#levels-screen .choice').click()`); await p.wait(1200); await shot('custom-battle');
    await p.eval(`document.querySelector('#custom-screen .primary')?.click()`); await p.wait(1500); await shot('custom-muster');
  },
  async side(p, shot) {
    await p.eval(home(2)); await p.wait(700);
    await p.eval(`document.querySelectorAll('#levels-screen .choice')[4].click()`); await p.wait(2500); await shot('side-pick');
  },
  async stages(p, shot) {
    await p.eval(home(3)); await p.wait(800); await shot('stages');
  },
  async lastgate(p, shot) {
    await p.eval(home(4)); await p.wait(900); await shot('lastgate');
    await p.eval(`document.querySelector('#lastgate-screen .choice:not(.soon), #lastgate-screen .screen-body button')?.click()`); await p.wait(900); await shot('lastgate-2');
    await p.eval(`document.querySelector('#lastgate-screen .screen-body')?.scrollTo(0, 700)`); await p.wait(300); await shot('lastgate-2-scrolled');
  },
  async lastgaterun(p, shot) {
    await p.eval(`window.boxer.lastGate('samurai')`); await p.wait(2500); await shot('lastgate-run-start');
    await p.eval(adv(6)); await p.wait(600); await shot('lastgate-run');
  },
  async sandbox(p, shot) {
    await p.eval(home(7)); await p.wait(2500); await p.eval(adv(5)); await p.wait(500); await shot('watch-hud');
    await p.eval(`document.querySelector('#sandbox-menu').click()`); await p.wait(500); await shot('sandbox-panel');
    await p.eval(`document.querySelector('#sandbox-panel')?.scrollTo?.(0, 600)`); await p.wait(300); await shot('sandbox-panel-scrolled');
    await p.eval(`document.querySelector('#open-builder').click()`); await p.wait(900); await shot('builder');
    await p.eval(`document.querySelector('#builder .sheet, #builder')?.scrollTo?.(0, 700)`); await p.wait(300); await shot('builder-scrolled');
  },
  async watchend(p, shot) {
    await p.eval(`window.boxer.fight([{ preset: 'knight' }], [{ preset: 'samurai' }], { seed: 3 })`); await p.eval(`document.body.dataset.game === 'home' && document.querySelectorAll('#home .choice')[7].click()`);
    await p.wait(1500);
    await p.eval(`window.boxer.fight([{ preset: 'knight' }], [{ preset: 'samurai' }], { seed: 3 })`); await p.wait(600);
    await p.eval(adv(8)); await p.wait(500); await shot('watch-duel');
    for (let i = 0; i < 40; i += 1) { if (await p.eval(`!document.querySelector('#banner').hidden`)) break; await p.eval(adv(5)); await p.wait(250); }
    await p.wait(800); await shot('banner');
  },
  async play(p, shot) {
    await p.eval(home(7)); await p.wait(2000);
    await p.eval(`document.querySelector('#sandbox-menu').click()`); await p.wait(300);
    await p.eval(`document.querySelector('#modes button[data-value=play]').click()`); await p.wait(1500);
    await p.eval(`document.body.click()`);
    await p.eval(adv(3)); await p.wait(600); await shot('play-hud');
    await p.eval(`document.querySelector('#pause')?.click()`); await p.wait(500); await shot('play-paused');
  },
  async battlewatch(p, shot) {
    await p.eval(`window.boxer.enterLevel('agincourt', 'watch')`); await p.wait(4000); await p.eval(adv(6)); await p.wait(800); await shot('battle-watch');
    for (let i = 0; i < 40; i += 1) { if (await p.eval(`!document.querySelector('#banner').hidden`)) break; await p.eval(adv(10)); await p.wait(100); }
    await p.wait(800); await shot('battle-summary');
  },
  async level(p, shot) {
    await p.eval(`window.boxer.levelMode('dunnottar')`); await p.wait(5000); await shot('level-opening');
    await p.eval(`document.querySelector('.story-card')?.click()`); await p.wait(2500); await p.eval(adv(2)); await p.wait(600); await shot('level-hud');
    await p.eval(`window.boxer.stage && JSON.stringify(Object.keys(window.boxer.stage() ?? {}))`);
  },
  async story(p, shot) {
    await p.eval(`window.boxer.story.open()`); await p.wait(1500); await shot('story-open');
    await p.eval(`window.boxer.story.begin()`); await p.wait(2500); await shot('story-1');
    for (let i = 2; i <= 5; i += 1) {
      await p.eval(`(() => { try { window.boxer.story.skipLine(); window.boxer.story.answer(0); } catch (e) { return String(e); } })()`); await p.wait(2000); await shot(`story-${i}`);
    }
  },
  async intro(p, shot) {
    await p.eval(`window.boxer.playIntro()`); await p.wait(3500); await shot('intro');
  },
  async tutorial(p, shot) {
    await p.eval(`window.boxer.tutorial()`); await p.wait(3000); await p.eval(adv(1)); await p.wait(500); await shot('tutorial');
  },
};

for (const cfg of cfgs) {
  const [device, lang] = cfg.split('-');
  const [w, h, mobile, dpr] = SIZES[device];
  for (const [name, flow] of Object.entries(flows)) {
    if (only && !only.includes(name)) continue;
    const page = await openPage({ width: w, height: h, mobile, scale: dpr });
    const started = Date.now();
    try {
      await page.goto(URL);
      await page.eval(`localStorage.setItem('gladiator.lang', '${lang}'); localStorage.setItem('gladiator.tutorialDone', '1'); localStorage.setItem('gladiator.introSeen', '1'); localStorage.setItem('gladiator.fightLegendSeen', '1');`);
      await page.goto(URL);
      await page.until('Boolean(window.boxer)', 60000);
      await page.wait(2500);
      const shot = async (state) => {
        await page.shot(`${out}/${cfg}/${state}.png`);
        let check = null;
        try { check = await page.eval(`(() => { const r = window.boxer.checkButtons(); return JSON.stringify(r).slice(0, 1500); })()`); } catch (error) { check = `check failed: ${error.message.slice(0, 200)}`; }
        const info = await page.eval(`JSON.stringify({ game: document.body.dataset.game, overlay: document.body.dataset.overlay ?? null, cls: document.body.className })`);
        report[`${cfg}/${state}`] = { info: JSON.parse(info), check };
      };
      await flow(page, shot);
    } catch (error) {
      report[`${cfg}/${name}:ERROR`] = error.message.slice(0, 400);
      try { await page.shot(`${out}/${cfg}/${name}-ERROR.png`); } catch { /* no page */ }
    }
    if (page.logs.length) report[`${cfg}/${name}:logs`] = [...new Set(page.logs)].slice(0, 8);
    console.log(cfg, name, `${Date.now() - started} ms`, report[`${cfg}/${name}:ERROR`] ?? '');
    await page.close();
  }
}
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/report-${cfgs.join('_')}${only ? '-' + only.join('_') : ''}.json`, JSON.stringify(report, null, 1));
