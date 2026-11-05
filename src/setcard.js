// An outfit set's card (outfits.js setCard, wornCard), as the builder, the character creator and Level Mode's own sheet show
// it: a portrait of a man wearing it, its name and description, and its stats: a radar of the whole kit (blunt, cut and
// pierce harm stopped over the body, the head's guard, how freely he moves, how light it is) and bars of the share of
// blunt, cut and pierce harm stopped on the head, the trunk and the arms; weight, movement, the helmet and how it keeps the face.

const SET_MOVES = { excellent: 'Free', good: 'Good', limited: 'Limited', slow: 'Slow' };
const SET_FACES = { closed: 'Face closed', sealed: 'Face sealed', open: 'Face open', bare: 'No helmet' };
// How freely each movement class lets a man move, for the radar (0..1).
const SET_MOVE_SHARE = { excellent: 1, good: 0.75, limited: 0.5, slow: 0.28 };
// The heaviest kit the radar's Lightness axis reckons with (kg): a full harness and more reads as none.
const SET_HEAVIEST_KG = 36;
// The share of blows the radar's body-wide guard counts on each part (a man is struck most on the trunk, then head and arms).
const SET_BODY_SHARES = { torso: 0.5, head: 0.25, arm: 0.25 };
const setPercent = (value) => `${Math.round((value ?? 0) * 100)}`;

/** The radar's axes for a card, each 0..1, with their labels. */
function setRadarAxes(card) {
  const body = (kind) => SET_BODY_SHARES.torso * (card.torso[kind] ?? 0) + SET_BODY_SHARES.head * (card.head[kind] ?? 0) + SET_BODY_SHARES.arm * (card.arm[kind] ?? 0);
  const head = ((card.head.blunt ?? 0) + (card.head.cut ?? 0) + (card.head.pierce ?? 0)) / 3;
  return [
    ['Blunt', body('blunt')], ['Cut', body('cut')], ['Pierce', body('pierce')], ['Head', head],
    ['Move', SET_MOVE_SHARE[card.movement] ?? 1], ['Light', Math.max(0, 1 - (card.kg ?? 0) / SET_HEAVIEST_KG)],
  ];
}

/** The radar of a card as SVG: six axes, rings at quarters, the kit's shape filled; labels left off when `small`. */
export function setRadarSvg(card, { small = false } = {}) {
  const axes = setRadarAxes(card);
  const size = small ? 52 : 150;
  const radius = small ? 23 : 52;
  const centre = size / 2;
  const point = (index, share) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / axes.length;
    return [centre + Math.cos(angle) * radius * share, centre + Math.sin(angle) * radius * share];
  };
  const ring = (share) => axes.map((_, index) => point(index, share).map((value) => value.toFixed(1)).join(',')).join(' ');
  const rings = [0.25, 0.5, 0.75, 1].map((share) => `<polygon class="radar-ring" points="${ring(share)}"/>`).join('');
  const spokes = axes.map((_, index) => { const [x, y] = point(index, 1); return `<line class="radar-ring" x1="${centre}" y1="${centre}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('');
  const shape = axes.map(([, share], index) => point(index, Math.max(0.03, share)).map((value) => value.toFixed(1)).join(',')).join(' ');
  const labels = small ? '' : axes.map(([label], index) => {
    const [x, y] = point(index, 1.24);
    return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle">${label}</text>`;
  }).join('');
  const title = axes.map(([label, share]) => `${label} ${setPercent(share)}`).join(', ');
  return `<svg class="set-radar${small ? ' small' : ''}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${title}"><title>${title}</title>${rings}${spokes}<polygon class="radar-shape" points="${shape}"/>${labels}</svg>`;
}

/** Bars of the share of blunt, cut and pierce harm stopped on the head, the trunk and the arms. */
function setBarsHtml(card) {
  const bar = (kind, share) => `<span class="set-bar ${kind}" title="${kind} ${setPercent(share)}%"><i style="width:${setPercent(share)}%"></i></span>`;
  const row = (label, guard) => `<div class="set-bar-row"><span>${label}</span>${bar('blunt', guard.blunt)}${bar('cut', guard.cut)}${bar('pierce', guard.pierce)}</div>`;
  return `<div class="set-bars"><div class="set-bar-row head-row"><span></span><span>Blunt</span><span>Cut</span><span>Pierce</span></div>${row('Head', card.head)}${row('Trunk', card.torso)}${row('Arms', card.arm)}</div>`;
}

/** The stats of a set's card: a line (weight, movement, the helmet), the radar and the bars, as HTML. */
export function setStatsHtml(card) {
  const helmet = card.helm ? `${card.helm}, ${card.helmetKg.toFixed(1)} kg` : card.helmetKg >= 0.5 ? `helmet ${card.helmetKg.toFixed(1)} kg` : '';
  return `<div class="set-line"><span>${card.kg >= 0.5 ? `${card.kg.toFixed(card.kg < 10 ? 1 : 0)} kg` : 'No weight'}</span><span>${SET_MOVES[card.movement] ?? card.movement} movement</span><span>${SET_FACES[card.face]}${helmet ? ` · ${helmet}` : ''}</span></div>`
    + `<div class="set-charts">${setRadarSvg(card)}${setBarsHtml(card)}</div>`;
}

/**
 * A set's card element: `card` (outfits.js setCard), `picture` a function giving a promise of its portrait's URL (drawn only
 * once the card is on screen), `compact` for a card in a grid (the description, a small radar and a one-line summary),
 * `tile` for a choice in a picker (the picture, the name and its weight and movement only: the rest in its pop-up).
 */
export function setCardElement(card, picture, { compact = false, tile = false, chosen = false, tag = 'div' } = {}) {
  const element = document.createElement(tag);
  element.className = `set-card${tile ? ' tile' : compact ? ' compact' : ''}${chosen ? ' on' : ''}`;
  if (tag === 'button') element.type = 'button';
  if (tile) element.title = card.name;
  const image = Object.assign(document.createElement('img'), { alt: '', draggable: false, className: 'set-portrait' });
  const text = document.createElement('div');
  text.className = 'set-text';
  const summary = compact
    ? `<div class="set-mini">${setRadarSvg(card, { small: true })}<span class="set-sum">${card.kg >= 0.5 ? `${Math.round(card.kg)} kg · ` : ''}${SET_MOVES[card.movement] ?? card.movement}<br>trunk ${setPercent(card.torso.blunt)}/${setPercent(card.torso.cut)}/${setPercent(card.torso.pierce)}<br>head ${setPercent(card.head.blunt)}/${setPercent(card.head.cut)}/${setPercent(card.head.pierce)}</span></div>`
    : setStatsHtml(card);
  // The description in its paragraphs (lines of the blurb): all of them on a full card, the first (what it is) in a grid's.
  const lines = (card.blurb ?? '').split('\n').filter(Boolean);
  const blurb = (compact ? lines.slice(0, 1) : lines).map((line, at, shown) => `<span class="set-blurb${shown.length > 1 && at === shown.length - 1 ? ' set-epigram' : ''}">${line}</span>`).join('');
  text.innerHTML = tile
    ? `<b>${card.name}</b><span class="set-sum">${card.kg >= 0.5 ? `${Math.round(card.kg)} kg · ` : ''}${SET_MOVES[card.movement] ?? card.movement}</span>`
    : `<b>${card.name}</b>${blurb}${summary}`;
  element.append(image, text);
  // Drawn when it scrolls into view (a portrait takes a frame's work).
  const draw = () => picture?.()?.then((url) => { image.src = url; });
  if (typeof IntersectionObserver === 'undefined') draw();
  else {
    const watch = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      watch.disconnect();
      draw();
    });
    watch.observe(element);
  }
  return element;
}
