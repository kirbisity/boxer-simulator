// The battle pickers' pictures: a poster of each battle, its key units facing off on its ground (assets/battles/<key>.webp, made by
// tools/battle-posters.mjs; the custom battle's and its grounds' too, `custom` and `map-<place>`), and a still of each open Level
// Mode stage (tools/battle-thumbs.mjs), shown on its card. The bundle puts the pictures in BATTLE_THUMB_EMBED as data URLs
// (tools/bundle.js); unbundled they are fetched. A card with none, or one that fails to load, keeps its card as it was.

const BATTLE_THUMB_EMBED = null;

/** A card (a choice button) with its picture (a battle's key in SCENARIOS, a stage's, `custom` or `map-<place>`) across its top, when there is one. */
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
