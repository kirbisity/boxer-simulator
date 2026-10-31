// Which design the arena helmets and the samurai war masks are drawn in. Plain (no Three.js).
//
//   #helmets=new|now     the gladiators' helmets (arenaview.js): new (the default), remodelled from the surviving helmets
//                        (helmforms.js), the fine work in baked maps; now, the geometry as it was before, for comparison.
//   #masks=now|oni|ressei|tengu   the samurai's face masks (menpo.js): now, the simple shapes as they were; an oni somen
//                        (the whole face, a demon's); a ressei-men (the fierce old man, a horsehair moustache); a karasu
//                        tengu (a crow's beak). A mask other than `now` needs the detail maps (`#maps=off` draws `now`).
//
// `boxer.helmStyle({ helmets, masks })` switches them in a running page and draws the fighters again.

export const HELMET_STYLES = ['new', 'now'];
export const MASK_STYLES = ['now', 'oni', 'ressei', 'tengu'];

/** The styles an address's hash asks for (the first of each list for anything missing or unknown). */
export function helmStyleFrom(hash = '') {
  const read = (key, allowed) => {
    const match = new RegExp(`(?:^|[#&])${key}=([a-z]+)`).exec(hash);
    return match && allowed.includes(match[1]) ? match[1] : allowed[0];
  };
  return { helmets: read('helmets', HELMET_STYLES), masks: read('masks', MASK_STYLES) };
}

/** The styles in force (read once from the address; changed by `setHelmStyle`). */
export const HELM_STYLE = helmStyleFrom(typeof location !== 'undefined' ? location.hash ?? '' : '');

/** Change the styles in force (unknown values are ignored); returns them. */
export function setHelmStyle({ helmets, masks } = {}) {
  if (HELMET_STYLES.includes(helmets)) HELM_STYLE.helmets = helmets;
  if (MASK_STYLES.includes(masks)) HELM_STYLE.masks = masks;
  return { ...HELM_STYLE };
}
