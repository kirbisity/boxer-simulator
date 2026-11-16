// Record the launch video's shots (tools/trailer/shots.mjs) and its text cards (tools/trailer/edit.json, titles.html) from the game as it
// is now. Starts the dev server and a Chrome of its own if they are not running. Not part of the game.
//
//   node tools/trailer/render.mjs                 every shot not yet recorded, and the cards
//   node tools/trailer/render.mjs canal joust     these shots (again)
//   node tools/trailer/render.mjs --all           every shot again
//   node tools/trailer/render.mjs --cards         the cards only
//   node tools/trailer/render.mjs --lang=zh canal  a played shot with the game in 中文 (trailer-out/shots-zh)
//   node tools/trailer/render.mjs --cards --edit=tools/trailer/edit-zh.json   the Chinese cut's cards
// Out: trailer-out/shots/<id>.mp4 and <id>.events.json; trailer-out/cards/<n>.png. Then: python3 tools/trailer/assemble.py.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, ensureRunning, openPage, recordSegments } from './driver.mjs';
import { SHOTS } from './shots.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = resolve(process.env.TRAILER_OUT ?? join(root, 'trailer-out'));
const profile = join(out, '.chrome');
const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('--'));
const all = args.includes('--all');
const cardsOnly = args.includes('--cards');
// The game's language for the played shots (their HUD): --lang=zh records them into trailer-out/shots-zh; the shots with no HUD are
// shared by both cuts and recorded once, in English (shots/). Always set: the game keeps its language in the browser's storage.
const lang = args.find((a) => a.startsWith('--lang='))?.slice(7) ?? 'en';
// The cards: of --edit=<file> (a language's cut, edit-zh.json), into its cardsDir.
const editPath = resolve(args.find((a) => a.startsWith('--edit='))?.slice(7) ?? join(here, 'edit.json'));

await ensureRunning({ root, profile });
const shotsDir = (shot) => join(out, lang !== 'en' && shot.hud !== false ? `shots-${lang}` : 'shots');
mkdirSync(join(out, 'shots'), { recursive: true });
if (lang !== 'en') mkdirSync(join(out, `shots-${lang}`), { recursive: true });

/** An edit, or a language's cut of one (`base`: the edit it is cut from, its own keys over it). */
function loadEdit(path) {
  const edit = JSON.parse(readFileSync(path, 'utf8'));
  return edit.base ? { ...loadEdit(join(dirname(path), edit.base)), ...edit, base: undefined } : edit;
}

async function renderShot(id) {
  const shot = SHOTS[id];
  if (!shot) throw new Error(`no shot ${id} (shots.mjs: ${Object.keys(SHOTS).join(', ')})`);
  const dir = shotsDir(shot);
  const started = Date.now();
  const page = await openPage();
  try {
    await page.viewport(shot.view ?? 'phone');
    await page.goto(`http://localhost:${CONFIG.port}/`, { waitFor: 'Boolean(window.boxer?.scene?.renderer)', timeout: 60000 });
    await page.eval(`(async () => {
      const { TC } = await import('/tools/trailer-capture.js');
      (await import('/src/i18n.js')).setLang(${JSON.stringify(lang)});
      TC.prep({ hideUi: ${shot.hud === false && !shot.level} });
      const boxer = window.boxer;
      ${shot.setup}
      return true;
    })()`);
    const frames = join(dir, `${id}.frames`);
    rmSync(frames, { recursive: true, force: true });
    const { frames: count, events } = await recordSegments(page, frames, shot.segments);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '60', '-i', join(frames, 'f%05d.jpg'), '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-pix_fmt', 'yuv420p', join(dir, `${id}.mp4`)]);
    writeFileSync(join(dir, `${id}.events.json`), JSON.stringify({ id, frames: count, seconds: count / 60, recorded: new Date().toISOString(), events }, null, 0));
    rmSync(frames, { recursive: true, force: true });
    console.log(`${id}${lang !== 'en' ? ` (${lang})` : ''}: ${count} frames, ${events.length} events, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  } catch (error) {
    console.error(`${id}: FAILED: ${error.message}${page.crashed ? ' (the page crashed)' : ''}`);
  } finally {
    await page.close();
  }
}

async function renderCards() {
  const edit = loadEdit(editPath);
  const dir = join(out, edit.cardsDir ?? 'cards');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const page = await openPage();
  try {
    await page.viewport('frame');
    await page.goto(`http://localhost:${CONFIG.port}/tools/trailer/titles.html`, { waitFor: 'window.cardReady === true' });
    for (const [index, card] of edit.cards.entries()) {
      await page.eval(`window.showCard(${JSON.stringify(card)})`);
      // The Chinese faces load their glyphs as a page first uses them: wait for them, and a frame drawn with them.
      await page.eval(`document.fonts.ready.then(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true)))))`);
      await page.shot(join(dir, `${index}.png`), { png: true, transparent: true });
    }
    console.log(`cards: ${edit.cards.length}`);
  } finally {
    await page.close();
  }
}

if (!cardsOnly) {
  // (In another language only the played shots: the rest are shared.)
  const ids = only.length ? only : Object.keys(SHOTS).filter((id) => (lang === 'en' || SHOTS[id].hud !== false) && (all || !existsSync(join(shotsDir(SHOTS[id]), `${id}.mp4`))));
  for (const id of ids) await renderShot(id);
}
if (cardsOnly || !only.length) await renderCards();
