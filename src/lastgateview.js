// The Last Gate on the page (lastgate.js is the run): the strip at the top (the gate's breaches as pips, the time held, the
// hero's kills, the wave), a word in the middle when a wave comes or a foe gets through, and at the end a poster of the run:
// the hero drawn large before the gate in the mist, how long it held and how many fell to him, to share as an image; Play
// again, Menu, and this browser's best runs one tap away. DOM and 2D canvas only (the hero's figure is drawn by main.js).

import { LAST_GATE, LAST_GATE_MODES, lastGateClock, lastGatePosterWords, lastGateShareText } from './lastgate.js';

const lgEl = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
};

// How long (ms) a word in the middle stays.
const LAST_GATE_TOAST_MS = 1800;

/** Put the run's strip, its words and its end poster on the page (under `root`); returns its controls. */
export function createLastGateView(root) {
  const pips = lgEl('span', { className: 'lg-pips' });
  const time = lgEl('b', { className: 'lg-time', textContent: '0:00' });
  const kills = lgEl('b', { className: 'lg-kills', textContent: '0' });
  const wave = lgEl('b', { className: 'lg-wave', textContent: '1' });
  const hud = lgEl('div', { className: 'lg-hud', hidden: true, ariaLive: 'off' },
    lgEl('span', { className: 'lg-gate', title: 'The gate: each one through is a breach' }, lgEl('em', { textContent: 'Gate' }), pips),
    lgEl('span', { className: 'lg-stat' }, lgEl('em', { textContent: 'Held' }), time),
    lgEl('span', { className: 'lg-stat' }, lgEl('em', { textContent: 'Kills' }), kills),
    lgEl('span', { className: 'lg-stat' }, lgEl('em', { textContent: 'Wave' }), wave));
  const toast = lgEl('div', { className: 'lg-toast', hidden: true, ariaLive: 'polite' });
  const card = lgEl('div', { className: 'lg-end', hidden: true, role: 'dialog', ariaModal: 'true' });
  root.append(hud, toast, card);
  let toastTimer = null;
  let shown = { breaches: -1, seconds: -1, kills: -1, wave: -1 };
  // A run begun again before its poster was made: that poster is not shown.
  let serial = 0;

  const say = (text, tone = '') => {
    toast.textContent = text;
    toast.className = `lg-toast ${tone}`;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, LAST_GATE_TOAST_MS);
  };

  return {
    /** A new run: the strip shown and cleared, the poster put away. */
    start() {
      serial += 1;
      hud.hidden = false;
      card.hidden = true;
      toast.hidden = true;
      shown = { breaches: -1, seconds: -1, kills: -1, wave: -1 };
      say('Hold the gate', 'lg-hint');
    },
    /** Each frame: the strip as the run stands (written only when a figure changes). */
    update(run) {
      if (!run) return;
      const seconds = Math.floor(run.over?.time ?? run.time);
      if (run.breaches !== shown.breaches) {
        pips.replaceChildren(...Array.from({ length: LAST_GATE.breachesToFall }, (_, index) => lgEl('i', { className: index < run.breaches ? 'lost' : '' })));
        shown.breaches = run.breaches;
      }
      if (seconds !== shown.seconds) time.textContent = lastGateClock((shown.seconds = seconds));
      if (run.kills.hero !== shown.kills) kills.textContent = String((shown.kills = run.kills.hero));
      if (run.wave !== shown.wave) wave.textContent = String((shown.wave = run.wave));
    },
    /** The run's news: a wave come, a breach. */
    news(item) {
      if (item.kind === 'wave') say(`Wave ${item.wave}`, 'lg-wave-word');
      else if (item.kind === 'breach') say(item.breaches >= LAST_GATE.breachesToFall ? 'The gate has fallen' : `Breach! ${item.breaches} / ${LAST_GATE.breachesToFall}`, 'lg-breach');
    },
    /**
     * The end: the run's poster (`result`: lastgate.js lastGateResult; `hero`: his fighter drawn alone, a canvas clear round
     * him, or null; `name` his name), Play again, Share (the poster as an image where the device shares files: lastGateShare),
     * Menu, and the best runs (`ranked`: the board with this run in it) one tap away under it.
     */
    async end(result, ranked, { again, menu, hero = null, name = null }) {
      const mine = serial;
      const poster = await lastGatePoster(lastGatePosterWords(result, name), hero);
      if (mine !== serial) return;
      poster.className = 'lg-poster';
      const line = lastGateShareText(result);
      const note = lgEl('p', { className: 'lg-share-note', hidden: true });
      const fallback = lgEl('textarea', { className: 'lg-share-text', readOnly: true, value: line, hidden: true, rows: 2 });
      const share = async () => {
        const blob = await new Promise((done) => (poster.toBlob ? poster.toBlob(done, 'image/png') : done(null)));
        const how = await lastGateShare({ blob, text: line, title: LAST_GATE.title, save: lastGateSave });
        const said = { download: 'Poster saved — and the line is copied.', copied: 'Copied — paste it anywhere.', select: 'Copy this:' }[how];
        note.textContent = said ?? '';
        note.hidden = !said;
        fallback.hidden = how !== 'select';
        if (how === 'select') {
          fallback.focus();
          fallback.select();
        }
      };
      const board = lgEl('div', { className: 'lg-end-board', hidden: true },
        ranked?.rank ? lgEl('p', { className: 'lg-rank', textContent: ranked.rank === 1 ? 'Your best run yet' : `Your #${ranked.rank} run` }) : null,
        lastGateBoardList(ranked?.runs ?? [], ranked?.rank ?? null));
      const boardButton = lgEl('button', { type: 'button', className: 'lg-board-link', textContent: '🏆 Best runs', onclick: () => {
        board.hidden = !board.hidden;
        boardButton.textContent = board.hidden ? '🏆 Best runs' : '✕ Close';
      } });
      card.replaceChildren(lgEl('div', { className: 'lg-end-stack' },
        lgEl('div', { className: 'lg-poster-frame' }, poster, board),
        note, fallback,
        lgEl('div', { className: 'lg-actions' },
          lgEl('button', { type: 'button', textContent: '☰', title: 'Menu', ariaLabel: 'Menu', onclick: menu }),
          lgEl('button', { type: 'button', className: 'lg-share', textContent: '↗ Share', onclick: share }),
          lgEl('button', { type: 'button', className: 'primary', textContent: '↻ Play again', onclick: again })),
        boardButton));
      card.hidden = false;
    },
    /** Out of the mode: everything put away. */
    hide() {
      serial += 1;
      hud.hidden = true;
      toast.hidden = true;
      card.hidden = true;
      clearTimeout(toastTimer);
    },
  };
}

/** The best runs, as a short ranked list (`mark`: this run's place, lit). Also the menu's. */
export function lastGateBoardList(runs, mark = null) {
  if (!runs.length) return lgEl('p', { className: 'lg-board-empty', textContent: 'No runs yet. How long can you hold?' });
  const day = (date) => {
    const at = new Date(date);
    return Number.isNaN(at.getTime()) ? '' : at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };
  return lgEl('ol', { className: 'lg-board' }, ...runs.map((run, index) => lgEl('li', { className: index + 1 === mark ? 'mine' : '' },
    lgEl('span', { className: 'lg-board-rank', textContent: String(index + 1) }),
    lgEl('span', { className: 'lg-board-hero', textContent: `${LAST_GATE_MODES[run.hero]?.glyph ?? ''} ${LAST_GATE_MODES[run.hero]?.label ?? run.hero}` }),
    lgEl('b', { textContent: `${run.kills} kill${run.kills === 1 ? '' : 's'}` }),
    lgEl('span', { textContent: lastGateClock(run.seconds) }),
    lgEl('span', { className: 'lg-board-date', textContent: day(run.date) }))));
}

// ---- The poster -------------------------------------------------------------------------------------------------------------
// A film poster in 9:16: a cold mist-blue sky over a blood-red glow, the gate's black silhouette, the horde's shapes in the fog,
// the hero standing over it all; the time held huge at the top, his kills in red at the foot, his name; grain and a vignette.

export const LAST_GATE_POSTER = {
  size: [720, 1280],
  // The grade: the sky from the top down to the mist's horizon, then the ground; the red of the glow and of his kills; the gate's black.
  sky: ['#111b25', '#2b3c4b', '#73879a', '#1a2129'],
  blood: '#d0261c',
  glow: 'rgba(170, 28, 22, 0.55)',
  stone: '#0a0e13',
  ink: '#eef2f4',
  pale: '#aebbc6',
  // How much the grain shows and the vignette darkens (alpha).
  grain: 0.09,
  vignette: 0.72,
  // The hero: his figure's height on the poster (share of it) and where its foot is.
  heroHeight: 0.82,
  heroFeet: 0.97,
};

/** A run's poster: a canvas (LAST_GATE_POSTER.size) from `words` (lastgate.js lastGatePosterWords) and `hero`, his figure (a canvas clear round him) or null. */
export async function lastGatePoster(words, hero = null) {
  const spec = LAST_GATE_POSTER;
  const [w, h] = spec.size;
  try {
    await document.fonts?.load('700 100px Oswald');
  } catch {
    // (No web font: Impact or the system's narrow sans stands in.)
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const display = (size, weight = 700) => `${weight} ${size}px Oswald, Impact, 'Arial Narrow', sans-serif`;
  const rand = lgPosterRandom(17);
  // The sky and the ground.
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, spec.sky[0]);
  sky.addColorStop(0.36, spec.sky[1]);
  sky.addColorStop(0.62, spec.sky[2]);
  sky.addColorStop(1, spec.sky[3]);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  // The red glow behind him: a sun come up blood-red through the mist.
  const glow = g.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.62);
  glow.addColorStop(0, spec.glow);
  glow.addColorStop(1, 'rgba(170, 28, 22, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  // The gate: two towers, the arch between them, the wall running off either side; soft in the mist.
  g.save();
  g.filter = 'blur(1.5px)';
  g.globalAlpha = 0.86;
  g.fillStyle = spec.stone;
  const top = h * 0.4;
  const foot = h * 0.74;
  const merlons = (x0, x1, y, every = 34) => {
    for (let x = x0; x < x1 - every * 0.4; x += every) g.fillRect(x, y - 26, every * 0.55, 26);
  };
  for (const [x0, x1] of [[w * 0.08, w * 0.34], [w * 0.66, w * 0.92]]) {
    g.fillRect(x0, top, x1 - x0, foot - top);
    merlons(x0, x1, top);
  }
  g.fillRect(w * 0.34, top + h * 0.07, w * 0.32, h * 0.05);
  merlons(w * 0.34, w * 0.66, top + h * 0.07);
  for (const [x0, x1] of [[0, w * 0.08], [w * 0.92, w]]) {
    g.fillRect(x0, top + h * 0.12, x1 - x0, foot - top - h * 0.12);
    merlons(x0, x1, top + h * 0.12);
  }
  g.restore();
  // The horde in the fog under the wall: small dark shapes, fainter the further off.
  for (let k = 0; k < 46; k += 1) {
    const x = w * (0.04 + rand() * 0.92);
    const near = rand();
    const size = 14 + near * 22;
    const y = foot + 4 + near * 46;
    g.globalAlpha = 0.18 + near * 0.3;
    g.fillStyle = '#121820';
    g.beginPath();
    g.ellipse(x, y - size * 1.55, size * 0.17, size * 0.2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(x - size * 0.2, y - size * 1.35, size * 0.4, size * 1.35);
  }
  g.globalAlpha = 1;
  // Mist lying over the field.
  for (const [y, alpha] of [[0.7, 0.32], [0.78, 0.28], [0.86, 0.2]]) {
    const band = g.createLinearGradient(0, h * (y - 0.06), 0, h * (y + 0.06));
    band.addColorStop(0, 'rgba(176, 192, 204, 0)');
    band.addColorStop(0.5, `rgba(176, 192, 204, ${alpha})`);
    band.addColorStop(1, 'rgba(176, 192, 204, 0)');
    g.fillStyle = band;
    g.fillRect(0, h * (y - 0.06), w, h * 0.12);
  }
  // The hero, standing over it.
  if (hero) {
    const tall = h * spec.heroHeight;
    const wide = (hero.width / hero.height) * tall;
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.6)';
    g.shadowBlur = 30;
    g.drawImage(hero, (w - wide) / 2, h * spec.heroFeet - tall, wide, tall);
    g.restore();
  }
  // The foot and the head of the poster darkened, for the words.
  const shade = g.createLinearGradient(0, h * 0.7, 0, h);
  shade.addColorStop(0, 'rgba(6, 8, 11, 0)');
  shade.addColorStop(0.5, 'rgba(6, 8, 11, 0.74)');
  shade.addColorStop(1, 'rgba(6, 8, 11, 0.96)');
  g.fillStyle = shade;
  g.fillRect(0, h * 0.7, w, h * 0.3);
  const topShade = g.createLinearGradient(0, 0, 0, h * 0.34);
  topShade.addColorStop(0, 'rgba(6, 8, 11, 0.7)');
  topShade.addColorStop(1, 'rgba(6, 8, 11, 0)');
  g.fillStyle = topShade;
  g.fillRect(0, 0, w, h * 0.34);
  // The words.
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const spaced = (text, x, y, font, colour, spacing) => {
    g.font = font;
    g.fillStyle = colour;
    if ('letterSpacing' in g) {
      g.letterSpacing = `${spacing}px`;
      g.fillText(text, x + spacing / 2, y);
      g.letterSpacing = '0px';
    } else g.fillText(text, x, y);
  };
  spaced(words.mark, w / 2, h * 0.045, display(20, 500), spec.pale, 7);
  spaced(words.over, w / 2, h * 0.1, display(50), spec.ink, 10);
  g.save();
  g.shadowColor = 'rgba(0, 0, 0, 0.65)';
  g.shadowBlur = 24;
  const time = g.createLinearGradient(0, h * 0.13, 0, h * 0.27);
  time.addColorStop(0, '#ffffff');
  time.addColorStop(1, '#b9c6d0');
  g.font = display(Math.min(230, 1500 / Math.max(4, words.held.length)));
  g.fillStyle = time;
  g.fillText(words.held, w / 2, h * 0.265);
  g.restore();
  g.fillStyle = spec.blood;
  g.fillRect(w * 0.38, h * 0.282, w * 0.24, 5);
  g.save();
  g.shadowColor = 'rgba(0, 0, 0, 0.7)';
  g.shadowBlur = 18;
  spaced(words.fell, w / 2, h * 0.86, display(118), spec.blood, 4);
  g.restore();
  spaced(words.by, w / 2, h * 0.885, display(18, 500), spec.pale, 8);
  spaced(words.name, w / 2, h * 0.935, display(46), spec.ink, 6);
  spaced(words.title, w / 2, h * 0.963, display(19, 500), spec.pale, 6);
  // Grain, and the vignette.
  const noise = document.createElement('canvas');
  noise.width = noise.height = 128;
  const n = noise.getContext('2d');
  const data = n.createImageData(128, 128);
  for (let k = 0; k < data.data.length; k += 4) {
    const v = rand() * 255;
    data.data[k] = data.data[k + 1] = data.data[k + 2] = v;
    data.data[k + 3] = 255;
  }
  n.putImageData(data, 0, 0);
  g.save();
  g.globalAlpha = spec.grain;
  g.globalCompositeOperation = 'overlay';
  g.fillStyle = g.createPattern(noise, 'repeat');
  g.fillRect(0, 0, w, h);
  g.restore();
  const vignette = g.createRadialGradient(w / 2, h * 0.48, h * 0.28, w / 2, h * 0.48, h * 0.78);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, `rgba(0, 0, 0, ${spec.vignette})`);
  g.fillStyle = vignette;
  g.fillRect(0, 0, w, h);
  return canvas;
}

/** A seeded generator for the poster's scatter (mulberry32): the same poster for the same run. */
function lgPosterRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Share a run: the poster as an image file with its line, where the device shares files ('image'); else, with no way to save
 * (`save` null), the line alone through the share sheet ('text'); else the poster saved (`save(blob)`) and the line copied
 * ('download'); else the line copied ('copied'); else 'select' (the page shows it to copy by hand). A share the player cancels
 * is 'cancelled'. `nav`: the navigator (a stand-in in the tests).
 */
export async function lastGateShare({ blob = null, text, title, save = null, nav = globalThis.navigator }) {
  const file = blob && typeof File === 'function' ? new File([blob], 'the-last-gate.png', { type: 'image/png' }) : null;
  try {
    if (file && nav?.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title, text });
      return 'image';
    }
    if (nav?.share && !(blob && save)) {
      await nav.share({ title, text });
      return 'text';
    }
  } catch (error) {
    if (error?.name === 'AbortError') return 'cancelled';
  }
  const copied = async () => {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };
  if (blob && save) {
    save(blob);
    await copied();
    return 'download';
  }
  return (await copied()) ? 'copied' : 'select';
}

/** Save a PNG (a link to it, clicked): the poster on a device that cannot share files. */
export function lastGateSave(blob) {
  const url = URL.createObjectURL(blob);
  const link = lgEl('a', { href: url, download: 'the-last-gate.png' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
