// Last Stand Squad on the page (lastgate.js is the run, squad.js the squad's reckoning): before a run, the squad builder (the
// hero, and the men bought out of the budget, − / + a kind, each with his stars and his price) whose squad musterview.js
// then places before the gate; in the run, the strip at the top (the wave, the time lasted, the hero's kills and the
// squad's, the men still up, the level's best) and a word in the middle when a wave comes or is cleared; at the end a
// poster of the run (the hero drawn large before the gate in the mist, how long the squad lasted and how many fell to it, to
// share as an image), the score under it (a new best called), Play again, the squad, Menu, and this browser's best runs one
// tap away. DOM and 2D canvas only (the hero's figure is drawn by main.js).

import { LAST_GATE, LAST_GATE_MODES, lastGateClock, lastGatePosterWords, lastGateShareText } from './lastgate.js';
import { FACTIONS } from './outfits.js';
import { readSquad, SQUAD, squadCanAdd, squadSpent, squadStep, squadUnits, writeSquad } from './squad.js';

const lgEl = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
};

// How long (ms) a word in the middle stays.
const LAST_GATE_TOAST_MS = 1800;

/** A rating's stars as text: ★ for each, ☆ to five. */
const lgStars = (count) => `${'★'.repeat(count)}${'☆'.repeat(Math.max(0, 5 - count))}`;

/** Put the run's strip, its words and its end poster on the page (under `root`); returns its controls. */
export function createLastGateView(root) {
  const wave = lgEl('b', { className: 'lg-wave', textContent: '1' });
  const time = lgEl('b', { className: 'lg-time', textContent: '0:00' });
  const kills = lgEl('b', { className: 'lg-kills', textContent: '0' });
  const squadKills = lgEl('b', { className: 'lg-squad-kills', textContent: '0' });
  const men = lgEl('b', { className: 'lg-men', textContent: '0' });
  const best = lgEl('b', { className: 'lg-best', textContent: '–' });
  const stat = (label, value, title, className = '') => lgEl('span', { className: `lg-stat ${className}`, title }, lgEl('em', { textContent: label }), value);
  const hud = lgEl('div', { className: 'lg-hud', hidden: true, ariaLive: 'off' },
    stat('Wave', wave, 'The wave now'),
    stat('Time', time, 'How long the squad has lasted'),
    stat('You', kills, 'Your kills'),
    stat('Squad', squadKills, 'Your men\'s kills'),
    stat('Men', men, 'Your men still on their feet'),
    stat('Best', best, 'This level\'s best: kills', 'lg-best-stat'));
  const toast = lgEl('div', { className: 'lg-toast', hidden: true, ariaLive: 'polite' });
  const card = lgEl('div', { className: 'lg-end', hidden: true, role: 'dialog', ariaModal: 'true' });
  root.append(hud, toast, card);
  let toastTimer = null;
  let shown = {};
  // A run begun again before its poster was made: that poster is not shown.
  let serial = 0;

  const say = (text, tone = '') => {
    toast.textContent = text;
    toast.className = `lg-toast ${tone}`;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, LAST_GATE_TOAST_MS);
  };
  const put = (node, key, value) => {
    if (shown[key] === value) return;
    shown[key] = value;
    node.textContent = value;
  };

  return {
    /** A new run: the strip shown and cleared, the poster put away. */
    start() {
      serial += 1;
      hud.hidden = false;
      card.hidden = true;
      toast.hidden = true;
      shown = {};
      say('Hold the line', 'lg-hint');
    },
    /** Each frame: the strip as the run stands (`up`/`all`: the squad's men on their feet, and in all; `best`: the level's best run or null). */
    update(run, { up = 0, all = 0, best: record = null } = {}) {
      if (!run) return;
      put(wave, 'wave', String(run.wave));
      put(time, 'time', lastGateClock(Math.floor(run.over?.time ?? run.time)));
      put(kills, 'kills', String(run.kills.hero));
      put(squadKills, 'squad', String(run.kills.squad));
      put(men, 'men', `${up}/${all}`);
      put(best, 'best', record ? String(record.kills) : '–');
    },
    /** The run's news: a wave come, a wave cleared. */
    news(item) {
      if (item.kind === 'wave') say(`Wave ${item.wave}`, 'lg-wave-word');
      else if (item.kind === 'cleared') say(`Wave ${item.wave} cleared`, 'lg-cleared');
    },
    /**
     * The end: the run's poster (`result`: lastgate.js lastGateResult; `hero`: his fighter drawn alone, a canvas clear round
     * him, or null; `name` his name), the score under it, Play again, Share (the poster as an image where the device shares
     * files: lastGateShare), the squad (`squad`, to change it), Menu, and the best runs (`ranked`: the board with this run in
     * it) one tap away under it.
     */
    async end(result, ranked, { again, menu, squad = null, hero = null, name = null }) {
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
        note.hidden = !['download', 'copied', 'select', 'text'].includes(how);
        note.textContent = { download: 'Poster saved; the line is copied.', copied: 'Copied: paste it anywhere.', select: 'Copy the line below.', text: 'Shared.' }[how] ?? '';
        fallback.hidden = how !== 'select';
        if (how === 'select') fallback.select();
      };
      const board = lgEl('div', { className: 'lg-end-board', hidden: true },
        ranked?.rank ? lgEl('p', { className: 'lg-rank', textContent: ranked.rank === 1 ? 'Your best run yet' : `Your #${ranked.rank} run` }) : null,
        lastGateBoardList(ranked?.runs ?? [], ranked?.rank ?? null));
      const boardButton = lgEl('button', { type: 'button', className: 'lg-board-link', textContent: '🏆 Best runs', onclick: () => {
        board.hidden = !board.hidden;
        boardButton.textContent = board.hidden ? '🏆 Best runs' : '✕ Close';
      } });
      const figure = (value, label) => lgEl('span', { className: 'lg-score-figure' }, lgEl('b', { textContent: value }), lgEl('span', { textContent: label }));
      const score = lgEl('div', { className: 'lg-score' },
        figure(String(result.heroKills), 'yours'),
        figure(String(result.squadKills), 'squad'),
        figure(String(result.waves), result.waves === 1 ? 'wave' : 'waves'),
        figure(lastGateClock(result.seconds), 'lasted'),
        ranked?.rank === 1 ? lgEl('em', { className: 'lg-new-best', textContent: '★ New best' }) : null);
      card.replaceChildren(lgEl('div', { className: 'lg-end-stack' },
        lgEl('div', { className: 'lg-poster-frame' }, poster, board),
        score,
        note, fallback,
        lgEl('div', { className: 'lg-actions' },
          lgEl('button', { type: 'button', textContent: '☰', title: 'Menu', ariaLabel: 'Menu', onclick: menu }),
          squad ? lgEl('button', { type: 'button', className: 'lg-squad', textContent: '⚔ Squad', title: 'Change the squad', onclick: squad }) : null,
          lgEl('button', { type: 'button', className: 'lg-share', textContent: '↗ Share', onclick: share }),
          lgEl('button', { type: 'button', className: 'primary', textContent: '↻ Again', onclick: again })),
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
  if (!runs.length) return lgEl('p', { className: 'lg-board-empty', textContent: 'No runs yet. How long can your squad last?' });
  const day = (date) => {
    const at = new Date(date);
    return Number.isNaN(at.getTime()) ? '' : at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };
  return lgEl('ol', { className: 'lg-board' }, ...runs.map((run, index) => lgEl('li', { className: index + 1 === mark ? 'mine' : '' },
    lgEl('span', { className: 'lg-board-rank', textContent: String(index + 1) }),
    lgEl('b', { textContent: `${run.kills} kill${run.kills === 1 ? '' : 's'}` }),
    lgEl('span', { className: 'lg-board-waves', textContent: `${run.waves ?? 0} wave${run.waves === 1 ? '' : 's'}` }),
    lgEl('span', { textContent: lastGateClock(run.seconds) }),
    lgEl('span', { className: 'lg-board-date', textContent: day(run.date) }))));
}

// ---- The squad builder ----------------------------------------------------------------------------------------------------
// One screen that fits without scrolling the page (the list scrolls inside it): the hero (free, always there), the points
// left and the men, the level's own people first (a row a kind: his name, stars, kit, price, − count +), the rest of the
// roster behind "Mercenaries"; then on to placing them (musterview.js, locked).

/**
 * Open the squad builder for a level in `root` (a menu screen): `mode` (lastgate.js LAST_GATE_MODES' key), `hero` his
 * name and look (`portrait`: a promise of a picture's url, or null), `onBack()`, `onNext(men, picks)` with the squad's men
 * (squad.js squadMen) when the player goes on to place them; the squad bought is kept in `storage` for the next visit.
 */
export function lastStandBuilder(root, { mode, onBack, onNext, portrait = null, storage = globalThis.localStorage }) {
  const spec = LAST_GATE_MODES[mode] ?? LAST_GATE_MODES.samurai;
  const units = squadUnits(spec.factions);
  let picks = readSquad(mode, units, { storage, prefer: spec.soldier });
  let others = units.some((unit) => !unit.own && picks[unit.key]);
  root.replaceChildren();
  root.className = 'screen ls-builder';
  const head = lgEl('header', { className: 'screen-head' },
    lgEl('button', { className: 'back', type: 'button', textContent: '← Back', onclick: onBack }),
    lgEl('div', { className: 'titles' },
      lgEl('h1', { textContent: `${spec.glyph} ${spec.title}` }),
      lgEl('p', { className: 'lede', textContent: `Level ${spec.level} · ${spec.region}. Pick your squad: ${SQUAD.budget} points, up to ${SQUAD.most} men beside you.` })));
  const look = lgEl('img', { alt: '', draggable: false });
  portrait?.then((url) => { look.src = url; });
  const heroRow = lgEl('div', { className: 'ls-hero' },
    lgEl('span', { className: 'ls-hero-look' }, look),
    lgEl('span', { className: 'ls-hero-words' }, lgEl('em', { textContent: 'You · free' }), lgEl('b', { textContent: `${spec.label} · ${spec.weapon}` }), lgEl('span', { textContent: spec.strength })));
  const purse = lgEl('div', { className: 'ls-purse' });
  const list = lgEl('div', { className: 'ls-units' });
  const next = lgEl('button', { type: 'button', className: 'primary ls-next', textContent: 'Place the squad →' });
  root.append(head, lgEl('div', { className: 'ls-body' }, heroRow, purse, list, lgEl('div', { className: 'ls-foot' }, next)));

  function draw() {
    const { points, men } = squadSpent(units, picks);
    purse.replaceChildren(
      lgEl('span', { className: 'ls-points' }, lgEl('b', { textContent: String(SQUAD.budget - points) }), ' points left'),
      lgEl('span', { className: 'ls-bar', ariaHidden: 'true' }, lgEl('i', { style: `width: ${Math.min(100, (100 * points) / SQUAD.budget)}%` })),
      lgEl('span', { className: 'ls-men' }, lgEl('b', { textContent: String(men + 1) }), ` men · ${SQUAD.most + 1} at most`),
      lgEl('button', { type: 'button', className: 'ls-clear', textContent: 'Clear', disabled: !men, onclick: () => { picks = {}; changed(); } }));
    const row = (unit) => {
      const count = picks[unit.key] ?? 0;
      return lgEl('div', { className: `ls-unit${count ? ' on' : ''}` },
        lgEl('span', { className: 'ls-unit-words' },
          lgEl('b', { textContent: `${unit.label}${unit.shoots ? ' 🏹' : ''}` }),
          lgEl('span', { className: 'ls-stars', title: `${unit.stars} of 5 stars (its rating)`, textContent: lgStars(unit.stars) }),
          lgEl('small', { textContent: unit.line })),
        lgEl('span', { className: 'ls-cost', title: 'Its price in points' }, lgEl('b', { textContent: String(unit.cost) }), ' pts'),
        lgEl('button', { type: 'button', className: 'step', textContent: '−', ariaLabel: `One ${unit.label} fewer`, disabled: !count, onclick: () => { picks = squadStep(units, picks, unit.key, -1); changed(); } }),
        lgEl('b', { className: 'ls-count', textContent: String(count) }),
        lgEl('button', { type: 'button', className: 'step', textContent: '+', ariaLabel: `One more ${unit.label}`, disabled: !squadCanAdd(units, picks, unit.key), onclick: () => { picks = squadStep(units, picks, unit.key, 1); changed(); } }));
    };
    const group = (label, members) => (members.length ? [lgEl('h3', { className: 'ls-group', textContent: label }), ...members.map(row)] : []);
    const own = spec.factions.flatMap((faction) => group(`${FACTIONS[faction]?.glyph ?? ''} ${FACTIONS[faction]?.label ?? faction}`, units.filter((unit) => unit.faction === faction)));
    const toggle = lgEl('button', { type: 'button', className: 'ls-others', textContent: others ? '▾ Mercenaries: every other fighter' : '▸ Mercenaries: every other fighter', ariaExpanded: String(others), onclick: () => { others = !others; draw(); } });
    const rest = others ? Object.keys(FACTIONS).filter((faction) => !spec.factions.includes(faction)).flatMap((faction) => group(`${FACTIONS[faction].glyph ?? ''} ${FACTIONS[faction].label}`, units.filter((unit) => unit.faction === faction))) : [];
    const scroll = list.scrollTop;
    list.replaceChildren(...own, toggle, ...rest);
    list.scrollTop = scroll;
  }
  function changed() {
    writeSquad(mode, picks, storage);
    draw();
  }
  next.addEventListener('click', () => onNext(units.flatMap((unit) => Array.from({ length: picks[unit.key] ?? 0 }, () => unit.make())), picks));
  draw();
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
