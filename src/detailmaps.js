// Surface detail drawn by maps instead of geometry: the fine relief of the armours (mail's rings, laced lamellae in the steppe's
// and the Japanese manner, plate's hammered face) and of the places' surfaces (masonry, paving, earth, grass, sand...) baked in
// Blender from modelled geometry into tiling maps (tools/blender/*.py), and the pieces that carry them drawn as smooth shells with
// texture coordinates in the tile's own units. This file is the plain part (no Three.js: the skin worker builds the shells too);
// detailtex.js makes the textures and the materials.
//
// `#maps=off` in the page's address draws everything as before (the mail painted ring by ring, each lamella its own plate, the
// castle's own painted stone, the painted grounds), for comparing the two in one build; `boxer.detailMaps()` says which is in force.

/** Whether an address's hash asks for the detail maps (anything but `maps=off` does). */
export function detailMapsWanted(hash = '') {
  return !/(^|[#&])maps=off\b/.test(hash);
}

/** Whether the detail maps are drawn (read once from the address). */
export const DETAIL_MAPS = { on: detailMapsWanted(typeof location !== 'undefined' ? location.hash ?? '' : '') };

/**
 * The armour tiles. `band`: each kind's texture coordinates are offset by its band in u (a whole number of tiles, so the picture
 * is the same), which is how the view tells the kinds apart (`detailKindOf`) without a vertex attribute of its own; the skin's
 * own coordinates are all below 1. `tile` (m): a square tile's side. The laced tiles count plates: `columns` plates across at
 * `pitch` (m) each, `rows` rows up at `row` (m) each.
 */
export const DETAIL_ARMOUR = {
  mail: { band: 100, tile: 0.048 },
  // Steppe and Chinese lamellar (Met 788894: 70 x 19 mm plates), its tile six plates across and two rows up.
  lamellae: { band: 200, columns: 6, pitch: 0.015, rows: 2, row: 0.05 },
  plate: { band: 300, tile: 0.2 },
  // Japanese kebiki-odoshi kozane, four plates across and two rows up.
  kozane: { band: 400, columns: 4, pitch: 0.025, rows: 2, row: 0.06 },
};
const DETAIL_BANDS = Object.fromEntries(Object.entries(DETAIL_ARMOUR).map(([kind, spec]) => [spec.band, kind]));

/** The kind of detail map a vertex's u says it carries ('mail', 'lamellae', 'plate', 'kozane'), or null. */
export function detailKindOf(u) {
  return u >= 50 ? DETAIL_BANDS[Math.round(u / 100) * 100] ?? null : null;
}

/** The perimeter of an ellipse of semi-axes a and b (Ramanujan's). */
function ellipsePerimeter(a, b) {
  const h = ((a - b) / (a + b)) ** 2;
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/** A run of rings measured: its mean girth (m, at `inflate`), and each ring's slant distance from the first (m). */
export function measureRings(rings, inflate) {
  const girth = rings.reduce((sum, ring) => sum + ellipsePerimeter(ring.depth * inflate, ring.width * inflate), 0) / rings.length;
  const along = [0];
  for (let index = 1; index < rings.length; index += 1) {
    const ring = rings[index];
    const last = rings[index - 1];
    const step = Math.hypot(ring.center[0] - last.center[0], ring.center[1] - last.center[1], ring.center[2] - last.center[2]);
    const swell = (ring.depth + ring.width - last.depth - last.width) * inflate * 0.5;
    along.push(along[index - 1] + Math.hypot(step, swell));
  }
  return { girth, along, length: along.at(-1), rising: rings.at(-1).center[1] >= rings[0].center[1] };
}

/**
 * A square tile's texture coordinates over a run of rings (loft's `uv`: ring, share of the way round -> [u, v]): round the piece a
 * whole number of tiles (by its mean girth, so the pattern closes on itself at the seam), along it the slant length in tiles,
 * counted upward on the body (so mail's weave hangs the right way up). `kind`: 'mail' or 'plate'.
 */
export function tileUv(rings, inflate, kind = 'mail') {
  const { tile, band } = DETAIL_ARMOUR[kind];
  const { girth, along, length, rising } = measureRings(rings, inflate);
  const across = Math.max(1, Math.round(girth / tile));
  const at = new Map(rings.map((ring, index) => [ring, along[index]]));
  return (ring, share) => [band + share * across, (rising ? at.get(ring) ?? 0 : length - (at.get(ring) ?? 0)) / tile];
}

/** Mail's texture coordinates (tileUv). */
export function mailUv(rings, inflate) {
  return tileUv(rings, inflate, 'mail');
}

/**
 * Where on a run of rings a flat patch's corner falls in the plate tile (addPatch's places and angles: rivets, lames, a
 * breastplate's faces): u by the angle round (not wrapped, so a patch across the front runs on), v up the run, in tiles.
 */
export function plateUvAt(measure, place, angle) {
  const { tile, band } = DETAIL_ARMOUR.plate;
  const across = Math.max(1, Math.round(measure.girth / tile));
  const index = Math.max(0, Math.min(measure.along.length - 2, Math.floor(place)));
  const share = place - index;
  const run = measure.along[index] + (measure.along[index + 1] - measure.along[index]) * share;
  return [band + 0.5 * across + (angle / (Math.PI * 2)) * across, (measure.rising ? run : measure.length - run) / tile];
}

// ---- Cloth and the other organic materials ----------------------------------------------------------------------------------
//
// The textiles and organics of every outfit (not its metal: the armour tiles above draw that) wear one atlas of tiles baked in
// Blender from modelled relief (tools/blender/clothtiles.py draws each from its reference, cloth.py bakes it, packcloth.py lays
// out the atlas, src/clothmaps-data.js holds it): a family of weave or surface per tile, shared across peoples and tinted by the
// outfit's own colour. Each garment's material (CLOTH_MATERIALS: a family, and how much coarser or finer than the tile) is
// looked up by what the garment is (CLOTH_GARMENTS: the top, bottom and feet by kind, the armour's cloth by its kind and role),
// then by its people and its outfit where those differ (a knight's undershirt is his quilted arming coat; Saladin's robe is
// silk). A loft of cloth carries texture coordinates in its family's cell of the atlas (clothUv): u from CLOTH_BAND up, the
// cell's column in its thousands, v the cell's row in its thousands, the fractions the place in the tile; the view draws those
// faces in one material (detailtex.js clothDetailMaterial). None of it in a crowd, or with `#maps=off`.

/**
 * The tile families, in the atlas's order (each one's cell its index). `metres`: the tile's side as baked. The reference each
 * is drawn from is cited where it is drawn (tools/blender/clothtiles.py); in short:
 *   plain        tabby linen and cotton, 18 threads/cm, slubbed (Romano-British linen tabbies 17-24/cm, Wolverton report:
 *                https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-7172-1/dissemination/mkmono_11_0_103.pdf)
 *   twill        2/2 diamond twill wool, 12/cm (the Thorsberg tunic: https://www.romanarmytalk.com/rat/printthread.php?tid=12932)
 *   denim        3/1 right-hand twill, indigo warp over white weft (https://www.heddels.com/?p=1523)
 *   quilt        quilting in 40 mm vertical channels, as a gambeson worn alone (https://wiki.vikingsonline.org.uk/Gambeson,
 *                https://myarmoury.com/feature_spot_quilted.html)
 *   diamondQuilt cotton quilted in diamonds, the ichcahuipilli's (https://en.wikipedia.org/wiki/Ichcahuipilli)
 *   felt         matted wool, no weave (https://www.worldhistory.org/article/1455/clothing-in-the-mongol-empire/)
 *   damask       silk satin with its figure in the reverse face; brocade, kinran
 *                (https://umma.umich.edu/objects/one-of-four-panels-of-textile-fragments-kinran-and-karaori-1972-2-44-1)
 *   leather      vegetable-tanned grain, pores in a crease network
 *                (https://leather-dictionary.com/index.php/Leather_hair_pores_-_Hair_follicles)
 *   fur          guard hair lying down the body in locks (a jaguar's to c. 45 mm:
 *                https://journals.flvc.org/edis/article/download/108837/103992/151440)
 *   feathers     contour feathers sewn in overlapping rows, tips down: the Mexica suits (https://www.wikipedia.org/wiki/Mexican_featherwork)
 *   straw        rice straw plaited 2/2: waraji, kasa (https://en.wikipedia.org/wiki/Waraji, https://hatguide.co.uk/kasa)
 *   cordura      1000D nylon in a 2 x 2 basket weave (https://ripstopbytheroll.com/collections/all-products/products/1000d-cordura)
 *   ripstop      plain weave with a 6 mm grid of doubled threads (https://www.rothco.com/blog/what-is-rip-stop)
 *   knit         single jersey, 11 wales/cm (28 gauge: https://organiccottonplus.com/products/medium-jersey-28-tubular)
 */
export const CLOTH_FAMILIES = {
  plain: { cell: 0, metres: 0.0133 },
  twill: { cell: 1, metres: 0.02 },
  denim: { cell: 2, metres: 0.0133 },
  quilt: { cell: 3, metres: 0.08 },
  diamondQuilt: { cell: 4, metres: 0.06 },
  felt: { cell: 5, metres: 0.04 },
  damask: { cell: 6, metres: 0.08 },
  leather: { cell: 7, metres: 0.06 },
  fur: { cell: 8, metres: 0.04 },
  feathers: { cell: 9, metres: 0.03 },
  straw: { cell: 10, metres: 0.03 },
  cordura: { cell: 11, metres: 0.024 },
  ripstop: { cell: 12, metres: 0.012 },
  knit: { cell: 13, metres: 0.014 },
};
/** The atlas's flat cell: the faces of a cloth loft whose own material has no tile (skin through lace, satin). */
export const CLOTH_FLAT_CELL = 15;
// The atlas's cells to a side, and where cloth's u begins (above the armour's bands: detailKindOf).
export const CLOTH_GRID = 4;
export const CLOTH_BAND = 1000;

/**
 * The materials: each a family and its `scale` (the tile drawn that many times larger: a coarser cloth of the same weave).
 * `none` has no tile: it is drawn smooth, in the flat cell.
 */
export const CLOTH_MATERIALS = {
  linen: { family: 'plain', scale: 1 },
  cotton: { family: 'plain', scale: 1.15 },
  // Bast-fibre cloth, coarser (a Ming levy's vest, a peasant's shirt, a Japanese commoner's hitatare).
  hemp: { family: 'plain', scale: 1.8 },
  // Roman wool was mostly tabby, 7-10 threads/cm (Walbrook, in the Wolverton report above).
  woolTabby: { family: 'plain', scale: 2 },
  // Heavy canvas (a sumo's mawashi).
  canvas: { family: 'plain', scale: 2.6 },
  // The Andean qompi tapestry of an uncu: weft-faced and very fine.
  camelid: { family: 'plain', scale: 0.7 },
  wool: { family: 'twill', scale: 1 },
  // Worsted suiting, fine; flannel, a brushed twill a little coarser; rope, the slant of its strands.
  worsted: { family: 'twill', scale: 0.55 },
  flannel: { family: 'twill', scale: 1.3 },
  rope: { family: 'twill', scale: 4 },
  denim: { family: 'denim', scale: 1 },
  quilted: { family: 'quilt', scale: 1 },
  // An arming coat under plate or mail, a gladiator's leg wraps: narrower channels.
  quiltedFine: { family: 'quilt', scale: 0.65 },
  ichcahuipilli: { family: 'diamondQuilt', scale: 1 },
  felt: { family: 'felt', scale: 1 },
  // Fulled wool broadcloth (a Janissary's çuha dolama): felted, finer.
  broadcloth: { family: 'felt', scale: 0.6 },
  silk: { family: 'damask', scale: 1 },
  leather: { family: 'leather', scale: 1 },
  // Hardened hide (lacquered or boiled leather armour): the grain coarser.
  hide: { family: 'leather', scale: 1.6 },
  fur: { family: 'fur', scale: 1 },
  // A big cat's short pelt.
  pelt: { family: 'fur', scale: 0.45 },
  feathers: { family: 'feathers', scale: 1 },
  straw: { family: 'straw', scale: 1 },
  cordura: { family: 'cordura', scale: 1 },
  ripstop: { family: 'ripstop', scale: 1 },
  jersey: { family: 'knit', scale: 1 },
  // Brushed fleece (a hoodie, joggers) and rib (cuffs, socks, a waistband).
  fleece: { family: 'knit', scale: 1.35 },
  rib: { family: 'knit', scale: 0.8 },
  // Smooth: polyester satin (boxing trunks, Muay Thai shorts), sheer lace, lacquer, plastic, skin, metal.
  none: null,
};

/**
 * What each garment is made of, by slot and kind. `armor`: by the armour's kind, role by role (`*` the rest of the roles the
 * armour paints: `armor`, `pad`, `cloth`, `cloth2`, `lace`, `charge`); its metal is `none` here (the armour tiles draw it).
 * The `head` kinds and the shoes are drawn apart (wardrobe.js, not lofted): they wear their tile projected over the piece
 * (detailtex.js clothPropMaterial) on their parts in the piece's own colour.
 */
export const CLOTH_GARMENTS = {
  top: {
    sportsBra: 'jersey', tank: 'jersey', tee: 'jersey', longsleeve: 'linen', compression: 'jersey', jacket: 'ripstop', hoodie: 'fleece',
    puffer: 'ripstop', flannel: 'flannel', suit: 'worsted', waistcoat: 'worsted', aloha: 'cotton', haramaki: 'rib', bodice: 'silk',
    kosode: 'cotton', tunic: 'woolTabby', rags: 'hemp',
  },
  bottom: {
    bloomers: 'cotton', cargo: 'ripstop', gown: 'silk', hakama: 'hemp', jeans: 'denim', joggers: 'fleece', loincloth: 'linen',
    longShorts: 'none', mawashi: 'canvas', pants: 'cotton', ragTrousers: 'hemp', slacks: 'worsted', splitShorts: 'none', tights: 'wool',
    trunks: 'none',
  },
  feet: {
    bare: 'none', boxingBoot: 'leather', compactBoot: 'leather', dressShoe: 'leather', footRags: 'hemp', heelAnkleBoot: 'leather',
    hikingBoot: 'leather', jinBoot: 'leather', platformShoe: 'leather', ridingBoot: 'leather', sabaton: 'none', sandal: 'leather',
    tabi: 'cotton', tacticalBoot: 'cordura', trainer: 'jersey',
  },
  armor: {
    // Japan: lacquered iron and kozane are metal (the armour tiles), laced in silk braid; the ō-yoroi's brocade sleeve.
    toseiDo: { '*': 'none', lace: 'silk' },
    roninDo: { '*': 'none', lace: 'silk', cloth: 'cotton', cloth2: 'cotton' },
    okegawa: { '*': 'none', lace: 'silk' },
    doMaru: { '*': 'none', lace: 'silk' },
    doMaruSode: { '*': 'none', lace: 'silk' },
    lamellar: { '*': 'none', lace: 'silk' },
    oyoroi: { '*': 'none', lace: 'silk', cloth2: 'silk' },
    // Europe: the cloth over mail and plate (surcoats, a huque, a joust's mantling), a brigandine's facing, the arming coat.
    mail: { '*': 'wool', armor: 'none', pad: 'quiltedFine' },
    templar: { '*': 'wool', armor: 'none' },
    brigandine: { '*': 'wool', armor: 'none', pad: 'quiltedFine' },
    breastplate: { '*': 'wool', armor: 'none', pad: 'quiltedFine' },
    haubergeon: { '*': 'wool', armor: 'none', pad: 'quiltedFine' },
    hauberk: { '*': 'wool', armor: 'none' },
    plate: { '*': 'wool', armor: 'none', pad: 'quiltedFine' },
    conquistador: { '*': 'wool', armor: 'none' },
    huque: { '*': 'wool' },
    // The Spaniards' escaupil was the Mexica cotton armour taken up.
    escaupil: { '*': 'ichcahuipilli' },
    corset: { '*': 'silk', lace: 'none' },
    overbust: { '*': 'silk', lace: 'none' },
    overbustSleeved: { '*': 'silk', lace: 'none' },
    // Saladin's kazaghand faced with silk; the Janissary's dolama of fulled broadcloth, a silk sash; mail-and-plate.
    kazaghand: { '*': 'silk', armor: 'none' },
    dolama: { '*': 'broadcloth', lace: 'silk' },
    krug: { '*': 'none' },
    // The Americas: quilted cotton, the jaguar's pelt, the eagle's feathers, the uncu's tapestry.
    ichcahuipilli: { '*': 'ichcahuipilli' },
    jaguarSuit: { '*': 'pelt' },
    featherSuit: { '*': 'feathers' },
    uncu: { '*': 'camelid' },
    uncuTocapu: { '*': 'camelid' },
    uncuChecks: { '*': 'camelid' },
    uncuRoyal: { '*': 'camelid' },
    // China: padded and cloth-faced coats, lamellar's cords, the silk robes.
    mingQuilt: { '*': 'quilted' },
    mingVest: { '*': 'hemp', leather: 'cotton' },
    mingBrigandine: { '*': 'cotton', armor: 'none' },
    mingElite: { '*': 'silk', armor: 'none' },
    mingLamellar: { '*': 'cotton', armor: 'none' },
    mingScaleCoat: { '*': 'cotton', armor: 'none' },
    mingScale: { '*': 'cotton', armor: 'none' },
    mingEliteLamellar: { '*': 'silk', armor: 'none' },
    ironPagoda: { '*': 'silk', armor: 'none', lace: 'leather' },
    guanYu: { '*': 'silk', armor: 'none' },
    hanLamellar: { '*': 'hemp', armor: 'none', lace: 'leather' },
    wuxiaRobe: { '*': 'silk' },
    // The steppe: the wool deel, leather lacing and belts, the fur stole; hardened leather lamellar.
    deel: { '*': 'wool' },
    mongolDeel: { '*': 'wool' },
    mongolLamellar: { '*': 'wool', armor: 'none', lace: 'leather' },
    mongolIron: { '*': 'wool', armor: 'none', lace: 'leather' },
    steppeLamellar: { '*': 'wool', armor: 'none', lace: 'leather' },
    steppeLeather: { '*': 'hide' },
    kheshig: { '*': 'wool', armor: 'none', lace: 'leather' },
    cataphract: { '*': 'wool', armor: 'none', lace: 'leather' },
    // Rome and the arena: the belt's leather, the gladiators' quilted wraps (fasciae), Maximus's leather, Commodus's lion.
    hamata: { '*': 'none', lace: 'leather' },
    segmentata: { '*': 'none', lace: 'leather' },
    centurion: { '*': 'none', lace: 'leather' },
    hoplomachus: { '*': 'none', pad: 'quiltedFine' },
    murmillo: { '*': 'none', pad: 'quiltedFine' },
    secutor: { '*': 'none', pad: 'quiltedFine' },
    retiarius: { '*': 'none', pad: 'quiltedFine' },
    thraex: { '*': 'none', pad: 'quiltedFine' },
    scissor: { '*': 'none', lace: 'leather' },
    maximus: { '*': 'leather' },
    commodus: { '*': 'fur' },
    girdle: { '*': 'leather' },
    // The law: Cordura carriers and vests, a riot suit's padded shell.
    patrolVest: { '*': 'cordura' },
    plateCarrier: { '*': 'cordura' },
    carrier: { '*': 'cordura' },
    riot: { '*': 'cordura' },
    heavyRiot: { '*': 'cordura' },
    // Beasts and machines: the gorilla's coat; a robot's shells are plastic and metal.
    silverback: { '*': 'fur' },
    robot: { '*': 'none' },
  },
  head: {
    arenaHelm: 'none', ayyubidHelm: 'none', bascinet: 'none', bashlyk: 'felt', beanie: 'rib', bork: 'felt', cabasset: 'none', chichak: 'none',
    clothWrap: 'cotton', eagleHelm: 'feathers', featherBand: 'feathers', feltHat: 'felt', flower: 'none', furHat: 'fur', galea: 'none',
    gorillaHead: 'fur', greatHelm: 'none', guanYuCap: 'silk', hachimaki: 'cotton', hanHelm: 'none', jaguarHelm: 'pelt', jingasa: 'none',
    kabuto: 'none', katozukin: 'cotton', kettleHat: 'none', lionHead: 'fur', llautu: 'camelid', loovuuz: 'fur', mingHat: 'none',
    mingHelm: 'none', montefortino: 'none', morion: 'none', opsHelmet: 'cordura', pagodaHelm: 'none', policeCap: 'worsted', potHelmet: 'none',
    ridgeHelm: 'none', riotHelmet: 'none', robotHead: 'none', spangenhelm: 'none', stechhelm: 'none', steppeHelm: 'none', tiltHat: 'felt',
    topHat: 'felt', turban: 'cotton', widowCap: 'cotton',
  },
};

/**
 * Where a people or an outfit differ from a garment's usual stuff (`slot.kind` -> material). The undershirt (`longsleeve`) is
 * what goes under each people's armour: a knight's quilted arming coat, a samurai's hemp hitatare, a steppe man's wool, a
 * soldier's ripstop.
 */
export const CLOTH_BY_FACTION = {
  knights: { 'top.longsleeve': 'quiltedFine', 'top.tunic': 'wool', 'bottom.pants': 'wool' },
  japanese: { 'top.longsleeve': 'hemp', 'bottom.pants': 'hemp', 'feet.sandal': 'straw' },
  chinese: { 'top.tunic': 'hemp', 'top.flannel': 'cotton' },
  steppe: { 'top.longsleeve': 'wool', 'bottom.pants': 'wool' },
  goths: { 'top.longsleeve': 'wool', 'top.tunic': 'wool', 'bottom.pants': 'wool' },
  parthians: { 'top.longsleeve': 'wool', 'bottom.pants': 'wool' },
  romans: { 'top.longsleeve': 'wool', 'bottom.pants': 'wool' },
  ottomans: { 'top.longsleeve': 'cotton', 'top.tunic': 'cotton' },
  mexica: { 'top.longsleeve': 'cotton', 'bottom.loincloth': 'cotton', 'bottom.pants': 'cotton', 'feet.sandal': 'straw' },
  inca: { 'bottom.loincloth': 'camelid' },
  law: { 'top.longsleeve': 'ripstop' },
  specials: { 'top.longsleeve': 'ripstop' },
};
export const CLOTH_BY_OUTFIT = {
  oyoroi: { 'top.longsleeve': 'silk', 'bottom.hakama': 'silk' },
  samuraiTosei: { 'top.longsleeve': 'silk' },
  saladin: { 'top.longsleeve': 'silk' },
  guanYu: { 'top.longsleeve': 'silk' },
  wuxia: { 'top.longsleeve': 'silk' },
  police: { 'top.longsleeve': 'cotton' },
  conquistadorPlate: { 'top.longsleeve': 'wool' },
  conquistadorQuilted: { 'top.longsleeve': 'wool' },
  victorianLady: { 'top.longsleeve': 'silk' },
  victorianGent: { 'bottom.pants': 'worsted' },
  commoner: { 'top.tunic': 'hemp', 'bottom.pants': 'hemp' },
  dobok: { 'top.jacket': 'cotton' },
  thug: { 'top.jacket': 'jersey' },
  sohei: { 'top.kosode': 'hemp' },
};

/**
 * Where each role painted on a loft takes its stuff from: a slot (`top`, `bottom`, `armor`, `feet`) or a material of its own
 * (`none` for skin and metal).
 */
export const CLOTH_ROLES = {
  skin: 'none', steel: 'none', steel2: 'none', gold: 'none', mail: 'none', mail2: 'none',
  top: 'top', top2: 'top', trim: 'top', stripe: 'top', pattern: 'top', shirt: 'cotton', tie: 'silk',
  kit: 'bottom', trim2: 'bottom', mawashi: 'bottom', under: 'jersey', band: 'rib', belt: 'leather', rope: 'rope',
  armor: 'armor', pad: 'armor', cloth: 'armor', cloth2: 'armor', lace: 'armor', charge: 'armor', leather: 'leather', fur: 'fur',
  boot: 'feet', sock: 'rib',
};

/**
 * The material (a CLOTH_MATERIALS key) a role is drawn in on a fighter: `look` his outfit's design (outfits.js outfitOf
 * .look), `faction` and `outfit` its people and kind. 'none' where it has no tile; undefined where no table says.
 */
export function clothMaterialOf(look, role, { faction = null, outfit = null } = {}) {
  const source = CLOTH_ROLES[role];
  if (!source) return undefined;
  const armourKind = look?.armor?.kind;
  const byKind = armourKind ? CLOTH_GARMENTS.armor[armourKind] : null;
  // The armour's own say over its roles (and over leather and fur, where it names them).
  if (byKind?.[role]) return byKind[role];
  if (source === 'armor') return armourKind ? byKind?.['*'] : 'none';
  if (source in CLOTH_MATERIALS) return source;
  const kind = look?.[source]?.kind;
  if (!kind) return source === 'feet' ? 'leather' : 'cotton';
  const key = `${source}.${kind}`;
  return CLOTH_BY_OUTFIT[outfit]?.[key] ?? CLOTH_BY_FACTION[faction]?.[key] ?? CLOTH_GARMENTS[source][kind];
}

/** A material's family ({ family, cell, metres, scale }), or null (no tile: the flat cell). */
export function clothFamilyOf(material) {
  const spec = CLOTH_MATERIALS[material];
  if (!spec) return null;
  return { ...CLOTH_FAMILIES[spec.family], family: spec.family, scale: spec.scale };
}

/** The atlas cell (0..15) a vertex's texture coordinates put it in, or null where they are not cloth's. */
export function clothCellOf(u, v) {
  if (!(u >= CLOTH_BAND)) return null;
  return Math.floor(u / CLOTH_BAND) - 1 + CLOTH_GRID * Math.floor(v / CLOTH_BAND);
}

/**
 * Cloth's texture coordinates over a run of rings measured (measureRings) for a vertex of a material, as [u, v] of the share of
 * the way round and the slant distance up the run (m): round the piece a whole number of its tiles (by the mean girth, so the
 * weave closes at the seam), up it the length in tiles, offset into the family's cell (its column and row in thousands).
 */
export function clothUvAt(measure, material, share, along) {
  const spec = clothFamilyOf(material);
  const cell = spec ? spec.cell : CLOTH_FLAT_CELL;
  const tile = spec ? spec.metres * spec.scale : 0.05;
  const across = Math.max(1, Math.round(measure.girth / tile));
  const up = measure.rising ? along : measure.length - along;
  return [CLOTH_BAND * (1 + (cell % CLOTH_GRID)) + share * across, CLOTH_BAND * Math.floor(cell / CLOTH_GRID) + up / tile];
}
