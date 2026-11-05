// The battle pickers' stills: a close shot of each battle at its height, and of each open Level Mode stage
// (assets/battles/<key>.webp, taken by tools/battle-thumbs.mjs), shown on its card. The bundle puts the pictures in BATTLE_THUMB_EMBED as data URLs
// (tools/bundle.js); unbundled they are fetched. A battle with none, or one that fails to load, keeps its card as it was.

const BATTLE_THUMB_EMBED = null;

/** A battle's card (a choice button) with the still of the battle (its key in SCENARIOS, or a stage's key) across its top, when there is one. */
export function addBattleThumb(card, key) {
  if (BATTLE_THUMB_EMBED && !BATTLE_THUMB_EMBED[key]) return card;
  const image = document.createElement('img');
  image.className = 'thumb';
  image.alt = '';
  image.draggable = false;
  image.decoding = 'async';
  image.onerror = () => {
    card.classList.remove('has-thumb');
    image.remove();
  };
  image.src = BATTLE_THUMB_EMBED?.[key] ?? `assets/battles/${key}.webp`;
  card.classList.add('has-thumb');
  card.prepend(image);
  return card;
}
