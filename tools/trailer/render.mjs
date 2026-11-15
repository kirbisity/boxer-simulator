// Record the launch video's shots (tools/trailer/shots.mjs) and its text cards (tools/trailer/edit.json, titles.html) from the game as it
// is now. Starts the dev server and a Chrome of its own if they are not running. Not part of the game.
//
//   node tools/trailer/render.mjs                 every shot not yet recorded, and the cards
//   node tools/trailer/render.mjs canal joust     these shots (again)
//   node tools/trailer/render.mjs --all           every shot again
//   node tools/trailer/render.mjs --cards         the cards only
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

await ensureRunning({ root, profile });
mkdirSync(join(out, 'shots'), { recursive: true });

async function renderShot(id) {
  const shot = SHOTS[id];
  if (!shot) throw new Error(`no shot ${id} (shots.mjs: ${Object.keys(SHOTS).join(', ')})`);
  const started = Date.now();
  const page = await openPage();
  try {
    await page.viewport(shot.view ?? 'phone');
    await page.goto(`http://localhost:${CONFIG.port}/`, { waitFor: 'Boolean(window.boxer?.scene?.renderer)', timeout: 60000 });
    await page.eval(`(async () => {
      const { TC } = await import('/tools/trailer-capture.js');
      TC.prep({ hideUi: ${shot.hud === false && !shot.level} });
      const boxer = window.boxer;
      ${shot.setup}
      return true;
    })()`);
    const frames = join(out, 'shots', `${id}.frames`);
    rmSync(frames, { recursive: true, force: true });
    const { frames: count, events } = await recordSegments(page, frames, shot.segments);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '60', '-i', join(frames, 'f%05d.jpg'), '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-pix_fmt', 'yuv420p', join(out, 'shots', `${id}.mp4`)]);
    writeFileSync(join(out, 'shots', `${id}.events.json`), JSON.stringify({ id, frames: count, seconds: count / 60, recorded: new Date().toISOString(), events }, null, 0));
    rmSync(frames, { recursive: true, force: true });
    console.log(`${id}: ${count} frames, ${events.length} events, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  } catch (error) {
    console.error(`${id}: FAILED: ${error.message}${page.crashed ? ' (the page crashed)' : ''}`);
  } finally {
    await page.close();
  }
}

async function renderCards() {
  const edit = JSON.parse(readFileSync(join(here, 'edit.json'), 'utf8'));
  const dir = join(out, 'cards');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const page = await openPage();
  try {
    await page.viewport('frame');
    await page.goto(`http://localhost:${CONFIG.port}/tools/trailer/titles.html`, { waitFor: 'window.cardReady === true' });
    for (const [index, card] of edit.cards.entries()) {
      await page.eval(`window.showCard(${JSON.stringify(card)})`);
      await page.shot(join(dir, `${index}.png`), { png: true, transparent: true });
    }
    console.log(`cards: ${edit.cards.length}`);
  } finally {
    await page.close();
  }
}

if (!cardsOnly) {
  const ids = only.length ? only : Object.keys(SHOTS).filter((id) => all || !existsSync(join(out, 'shots', `${id}.mp4`)));
  for (const id of ids) await renderShot(id);
}
if (cardsOnly || !only.length) await renderCards();
