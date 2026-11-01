// Which design the arena helmets, the samurai war masks and the foot soldiers' helmets are drawn in. Plain (no Three.js).
//
//   #helmets=new|now     the gladiators' helmets (arenaview.js): new (the default), remodelled from the surviving helmets
//                        (helmforms.js), the fine work in baked maps; now, the geometry as it was before, for comparison.
//   #masks=own|now|oni|ressei|tengu   the samurai's face masks (menpo.js): own, each kit's own (head.maskDesign); now, the simple shapes as they were; an oni somen
//                        (the whole face, a demon's); a ressei-men (the fierce old man, a horsehair moustache); a karasu
//                        tengu (a crow's beak). A mask other than `now` needs the detail maps (`#maps=off` draws `now`).
//   #kettle=own|now|a|b|c  the helmets drawn in a measured design (helmforms.js HELM_DESIGNS, fitted over the head with their
//                        baked maps): own (the default), each wearer's own design (outfits.js `head.design`: the foot
//                        soldier's kettle hats a, b and c across his designs, the conquistadors' Spanish cabasset); now, every
//                        one as it was drawn before (the round kettle hat, the plain cabasset), for comparison; a, b or c,
//                        every kettle hat in that one (a, the ridged kettle hat, Cleveland 1916.1919; b, the Burgundian war
//                        hat with its sight, Met 04.3.228; c, the German sallet and bevor, Met 29.158.11). A design needs
//                        the detail maps (`#maps=off`, or a crowd's low detail, draws them as before).
//   #knighthelm=now|1..6 the knights' helmets (knighthelms.js), on every unit wearing a knight's bascinet or great helm:
//                        now, as they were; 1 the great helm, 2 the hounskull bascinet, 3 the great bascinet, 4 the armet,
//                        5 the sallet with visor and bevor, 6 the close helmet. Needs the detail maps too.
//
// `boxer.helmStyle({ helmets, masks, kettle, knight })` switches them in a running page and draws the fighters again.

export const HELMET_STYLES = ['new', 'now'];
export const MASK_STYLES = ['own', 'now', 'oni', 'ressei', 'tengu'];
export const KETTLE_STYLES = ['own', 'now', 'a', 'b', 'c'];
export const KNIGHT_STYLES = ['now', '1', '2', '3', '4', '5', '6'];

/** The styles an address's hash asks for (the first of each list for anything missing or unknown). */
export function helmStyleFrom(hash = '') {
  const read = (key, allowed) => {
    const match = new RegExp(`(?:^|[#&])${key}=([a-z0-9]+)`).exec(hash);
    return match && allowed.includes(match[1]) ? match[1] : allowed[0];
  };
  return { helmets: read('helmets', HELMET_STYLES), masks: read('masks', MASK_STYLES), kettle: read('kettle', KETTLE_STYLES), knight: read('knighthelm', KNIGHT_STYLES) };
}

/** The styles in force (read once from the address; changed by `setHelmStyle`). */
export const HELM_STYLE = helmStyleFrom(typeof location !== 'undefined' ? location.hash ?? '' : '');

/** Change the styles in force (unknown values are ignored); returns them. */
export function setHelmStyle({ helmets, masks, kettle, knight } = {}) {
  if (HELMET_STYLES.includes(helmets)) HELM_STYLE.helmets = helmets;
  if (MASK_STYLES.includes(masks)) HELM_STYLE.masks = masks;
  if (KETTLE_STYLES.includes(kettle)) HELM_STYLE.kettle = kettle;
  if (KNIGHT_STYLES.includes(String(knight))) HELM_STYLE.knight = String(knight);
  return { ...HELM_STYLE };
}
