// The Last Gate on the page (lastgate.js is the run): the strip at the top (the gate's breaches as pips, the time held, the
// hero's kills, the wave), a word in the middle when a wave comes or a rebel gets through, and the card at the end: how long
// the gate held, the kills, the wave, this browser's best runs, and Play again / Share / Menu. DOM only.

import { LAST_GATE, LAST_GATE_HEROES, lastGateClock, lastGateShareText } from './lastgate.js';

const lgEl = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
};

// How long (ms) a word in the middle stays.
const LAST_GATE_TOAST_MS = 1800;

/** Put the run's strip, its words and its end card on the page (under `root`); returns its controls. */
export function createLastGateView(root) {
  const pips = lgEl('span', { className: 'lg-pips' });
  const time = lgEl('b', { className: 'lg-time', textContent: '0:00' });
  const kills = lgEl('b', { className: 'lg-kills', textContent: '0' });
  const wave = lgEl('b', { className: 'lg-wave', textContent: '1' });
  const hud = lgEl('div', { className: 'lg-hud', hidden: true, ariaLive: 'off' },
    lgEl('span', { className: 'lg-gate', title: 'The gate: each rebel through is a breach' }, lgEl('em', { textContent: 'Gate' }), pips),
    lgEl('span', { className: 'lg-stat' }, lgEl('em', { textContent: 'Held' }), time),
    lgEl('span', { className: 'lg-stat' }, lgEl('em', { textContent: 'Kills' }), kills),
    lgEl('span', { className: 'lg-stat' }, lgEl('em', { textContent: 'Wave' }), wave));
  const toast = lgEl('div', { className: 'lg-toast', hidden: true, ariaLive: 'polite' });
  const card = lgEl('div', { className: 'lg-end', hidden: true, role: 'dialog', ariaModal: 'true' });
  root.append(hud, toast, card);
  let toastTimer = null;
  let shown = { breaches: -1, seconds: -1, kills: -1, wave: -1 };

  const say = (text, tone = '') => {
    toast.textContent = text;
    toast.className = `lg-toast ${tone}`;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, LAST_GATE_TOAST_MS);
  };

  return {
    /** A new run: the strip shown and cleared, the card put away. */
    start() {
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
     * The end card: `result` (lastgate.js lastGateResult), `ranked` (the board with this run in it, and its place), and what
     * its buttons do (`again`, `menu`).
     */
    end(result, ranked, { again, menu }) {
      const hero = LAST_GATE_HEROES[result.hero] ?? LAST_GATE_HEROES.samurai;
      const shareLine = lastGateShareText(result);
      const fallback = lgEl('textarea', { className: 'lg-share-text', readOnly: true, value: shareLine, hidden: true, rows: 2 });
      const note = lgEl('p', { className: 'lg-share-note', hidden: true });
      const share = async () => {
        try {
          if (navigator.share) {
            await navigator.share({ title: LAST_GATE.title, text: shareLine });
            return;
          }
          await navigator.clipboard.writeText(shareLine);
          note.textContent = 'Copied — paste it anywhere.';
          note.hidden = false;
        } catch (error) {
          // Cancelled by the player: nothing to do. Anything else (no clipboard): the text, selected, to copy by hand.
          if (error?.name === 'AbortError') return;
          fallback.hidden = false;
          fallback.focus();
          fallback.select();
          note.textContent = 'Copy this:';
          note.hidden = false;
        }
      };
      const stat = (value, label, big = false) => lgEl('div', { className: `lg-figure${big ? ' big' : ''}` }, lgEl('b', { textContent: value }), lgEl('span', { textContent: label }));
      card.replaceChildren(lgEl('div', { className: 'lg-end-card' },
        lgEl('div', { className: 'lg-eyebrow', textContent: `${LAST_GATE.title} · ${hero.glyph} ${hero.label}` }),
        lgEl('h2', { textContent: result.how === 'overrun' ? 'Overrun' : 'The gate has fallen' }),
        lgEl('div', { className: 'lg-figures' },
          stat(lastGateClock(result.seconds), 'held', true),
          stat(String(result.kills), 'cut down by you', true),
          stat(String(result.total), 'by the defenders'),
          stat(String(result.waves), result.waves === 1 ? 'wave' : 'waves')),
        ranked?.rank ? lgEl('p', { className: 'lg-rank', textContent: ranked.rank === 1 ? 'Your best run yet' : `Your #${ranked.rank} run` }) : null,
        lastGateBoardList(ranked?.runs ?? [], ranked?.rank ?? null),
        note, fallback,
        lgEl('div', { className: 'lg-actions' },
          lgEl('button', { type: 'button', textContent: '☰ Menu', onclick: menu }),
          lgEl('button', { type: 'button', textContent: '↗ Share', onclick: share }),
          lgEl('button', { type: 'button', className: 'primary', textContent: '↻ Play again', onclick: again }))));
      card.hidden = false;
    },
    /** Out of the mode: everything put away. */
    hide() {
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
    lgEl('span', { className: 'lg-board-hero', textContent: `${LAST_GATE_HEROES[run.hero]?.glyph ?? ''} ${LAST_GATE_HEROES[run.hero]?.label ?? run.hero}` }),
    lgEl('b', { textContent: `${run.kills} kill${run.kills === 1 ? '' : 's'}` }),
    lgEl('span', { textContent: lastGateClock(run.seconds) }),
    lgEl('span', { className: 'lg-board-date', textContent: day(run.date) }))));
}
