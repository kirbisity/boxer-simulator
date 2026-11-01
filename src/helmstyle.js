// Which design the arena helmets, the samurai war masks and the foot soldiers' helmets are drawn in. Plain (no Three.js).
//
//   #helmets=new|now     the gladiators' helmets (arenaview.js): new (the default), remodelled from the surviving helmets
//                        (helmforms.js), the fine work in baked maps; now, the geometry as it was before, for comparison.
//   #masks=now|oni|ressei|tengu   the samurai's face masks (menpo.js): now, the simple shapes as they were; an oni somen
//                        (the whole face, a demon's); a ressei-men (the fierce old man, a horsehair moustache); a karasu
//                        tengu (a crow's beak). A mask other than `now` needs the detail maps (`#maps=off` draws `now`).
//   #kettle=now|a|b|c|d  the fifteenth-century foot soldier's kettle hat (wardrobe.js; helmforms.js HELM_DESIGNS), on every
//                        unit that wears one: now, as it was; a, the ridged one-piece kettle hat (Cleveland 1916.1919);
//                        b, the Burgundian war hat with its sight (Met 04.3.228); c, the German sallet and bevor (Met
//                        29.158.11); d, the Italian barbute (Met 60.151). A design other than `now` needs the detail maps.
//
// `boxer.helmStyle({ helmets, masks, kettle })` switches them in a running page and draws the fighters again.

export const HELMET_STYLES = ['new', 'now'];
export const MASK_STYLES = ['now', 'oni', 'ressei', 'tengu'];
export const KETTLE_STYLES = ['now', 'a', 'b', 'c', 'd'];

/** The styles an address's hash asks for (the first of each list for anything missing or unknown). */
export function helmStyleFrom(hash = '') {
  const read = (key, allowed) => {
    const match = new RegExp(`(?:^|[#&])${key}=([a-z]+)`).exec(hash);
    return match && allowed.includes(match[1]) ? match[1] : allowed[0];
  };
  return { helmets: read('helmets', HELMET_STYLES), masks: read('masks', MASK_STYLES), kettle: read('kettle', KETTLE_STYLES) };
}

/** The styles in force (read once from the address; changed by `setHelmStyle`). */
export const HELM_STYLE = helmStyleFrom(typeof location !== 'undefined' ? location.hash ?? '' : '');

/** Change the styles in force (unknown values are ignored); returns them. */
export function setHelmStyle({ helmets, masks, kettle } = {}) {
  if (HELMET_STYLES.includes(helmets)) HELM_STYLE.helmets = helmets;
  if (MASK_STYLES.includes(masks)) HELM_STYLE.masks = masks;
  if (KETTLE_STYLES.includes(kettle)) HELM_STYLE.kettle = kettle;
  return { ...HELM_STYLE };
}
