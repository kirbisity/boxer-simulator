// An outfit set's card (outfits.js setCard), as the builder and the character creator show it: a portrait of a man wearing
// it, its name and description, and its stats: weight, movement, the share of blunt, cut and pierce harm stopped on the
// head, the trunk and the arms, and how the helmet keeps the face.

const SET_MOVES = { excellent: 'Free', good: 'Good', limited: 'Limited', slow: 'Slow' };
const SET_FACES = { closed: 'Face closed', sealed: 'Face sealed', open: 'Face open', bare: 'No helmet' };
const setPercent = (value) => `${Math.round((value ?? 0) * 100)}`;

/** The stats of a set's card as a small table and a line, as HTML. */
export function setStatsHtml(card) {
  const row = (label, guard) => `<tr><th>${label}</th><td>${setPercent(guard.blunt)}</td><td>${setPercent(guard.cut)}</td><td>${setPercent(guard.pierce)}</td></tr>`;
  return `<div class="set-line"><span>${card.kg >= 0.5 ? `${card.kg.toFixed(card.kg < 10 ? 1 : 0)} kg` : 'No weight'}</span><span>${SET_MOVES[card.movement] ?? card.movement} movement</span><span>${SET_FACES[card.face]}${card.helmetKg >= 0.5 ? ` · helmet ${card.helmetKg.toFixed(1)} kg` : ''}</span></div>`
    + `<table class="set-guard"><thead><tr><th>Stops %</th><th>Blunt</th><th>Cut</th><th>Pierce</th></tr></thead><tbody>${row('Head', card.head)}${row('Trunk', card.torso)}${row('Arms', card.arm)}</tbody></table>`;
}

/**
 * A set's card element: `card` (outfits.js setCard), `picture` a function giving a promise of its portrait's URL (drawn only
 * once the card is on screen), `compact` for a card in a grid (the description and a one-line summary; the table left out).
 */
export function setCardElement(card, picture, { compact = false, chosen = false, tag = 'div' } = {}) {
  const element = document.createElement(tag);
  element.className = `set-card${compact ? ' compact' : ''}${chosen ? ' on' : ''}`;
  if (tag === 'button') element.type = 'button';
  const image = Object.assign(document.createElement('img'), { alt: '', draggable: false, className: 'set-portrait' });
  const text = document.createElement('div');
  text.className = 'set-text';
  const summary = compact
    ? `<span class="set-sum">${card.kg >= 0.5 ? `${Math.round(card.kg)} kg · ` : ''}trunk ${setPercent(card.torso.blunt)}/${setPercent(card.torso.cut)}/${setPercent(card.torso.pierce)} · head ${setPercent(card.head.blunt)}/${setPercent(card.head.cut)}/${setPercent(card.head.pierce)}</span>`
    : setStatsHtml(card);
  text.innerHTML = `<b>${card.name}</b><span class="set-blurb">${card.blurb}</span>${summary}`;
  element.append(image, text);
  // Drawn when it scrolls into view (a portrait takes a frame's work).
  const draw = () => picture()?.then((url) => { image.src = url; });
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
