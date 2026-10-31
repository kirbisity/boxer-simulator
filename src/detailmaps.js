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
 * own coordinates are all below 1. `tile` (m): a tile's side, or [round, up] for an oblong one. The laced tiles count plates:
 * `columns` plates across at `pitch` (m) each, `rows` rows up at `row` (m) each (`hangs`: scales, each row's foot over the next
 * row's heads, not lamellae's heads over the feet above). `strip`: a band along an edge, not a field (v 0 at the edge, 1 inward).
 * `masks`: what a tile's masks are drawn in (render.js): 'gold' the kit's gilt (rivet heads, fittings), 'lace' its lacing.
 * The hard tiles are baked by tools/blender/hardtiles.py; beside each, what it was measured from.
 */
export const DETAIL_ARMOUR = {
  mail: { band: 100, tile: 0.048 },
  // Steppe and Chinese lamellar (Met 788894: 70 x 19 mm plates), its tile six plates across and two rows up.
  lamellae: { band: 200, columns: 6, pitch: 0.015, rows: 2, row: 0.05, masks: 'lace' },
  plate: { band: 300, tile: 0.2 },
  // Japanese kebiki-odoshi kozane, four plates across and two rows up.
  kozane: { band: 400, columns: 4, pitch: 0.025, rows: 2, row: 0.06, masks: 'lace' },
  // Lorica segmentata (Corbridge and Kalkriese types: https://lorseg.mcbishop.co.uk/the-kalkriese-type; Bishop, Lorica
  // Segmentata I, 2002): 52 mm girth hoops, each over the one below, copper-alloy rivets with washers 90 mm apart.
  segmentata: { band: 500, tile: [0.18, 0.156], masks: 'gold' },
  // Scale (squamata; the Parthian cataphract's; Guan Yu's gilt): 35 x 22 mm scales with a medial rib, rows 24 mm apart, each
  // half a scale off the last (the Dura-Europos horse trappers, Yale University Art Gallery,
  // https://www.yalealumnimagazine.com/articles/3919-heavy-metal-from-the-ancient-romans; Roman scale sizes,
  // https://www.romanarmytalk.com/rat/showthread.php?tid=12652).
  scale: { band: 600, columns: 6, pitch: 0.02, rows: 2, row: 0.024, hangs: true },
  // Mountain pattern (shanwen jia): interlocking three-armed iron plates on a 24 mm lattice, each arm's end in the fork of the
  // next, as Song and Ming statues and paintings show it (https://lbas.lboro.ac.uk/pattern/mountain-pattern-armour.html,
  // https://dragonsarmory.blogspot.com/2017/07/heavy-song-dynasty-armor.html).
  mountain: { band: 700, tile: [0.0831, 0.072] },
  // Brigandine: cloth over 48 x 24 mm plates, two domed copper rivets to a plate on a 24 mm staggered grid (Ming bumian jia,
  // https://greatmingmilitary.blogspot.com/2024/09/brigandine-armours-of-ming-dynasty.html; the Hangzhou Arts and Crafts
  // Museum's, doi:10.1080/17416124.2024.2316985; the Met's dingjia, https://www.metmuseum.org/art/collection/search/24010).
  brigandine: { band: 800, tile: 0.096, masks: 'gold' },
  // A plate harness's edges: the roll turned over a wire and roped, a file line, lining rivets every 50 mm (the Met's
  // Helmschmid backplate with its roped turned edge, https://www.metmuseum.org/art/collection/search/22875; the Met's German
  // Gothic gauntlet, https://www.metmuseum.org/art/collection/search/22347). A strip 25 mm deep from the edge.
  harnessEdge: { band: 900, tile: [0.05, 0.025], strip: true, masks: 'gold' },
  // Ottoman mail and plate: 30 x 55 mm plates set in 6 mm mail (the Met's Shirt of Mail and Plate, Turkish,
  // https://www.metmuseum.org/art/collection/search/24193).
  krug: { band: 1000, tile: [0.072, 0.063] },
  // Tosei gusoku's riveted lames (byo-toji yokohagi okegawa-do, MFAH https://emuseum.mfah.org/objects/139649): 45 mm lacquered
  // lames, a rivet head every 30 mm.
  iyozane: { band: 1100, tile: [0.12, 0.09], masks: 'gold' },
  // Sugake odoshi: pairs of braids every 50 mm down kiritsuke itazane (Bonhams 17816 lot 61,
  // https://www.bonhams.com/auction/17816/lot/61/an-okegawa-do-tosei-gusoku-armour-late-edo-period-19th-century).
  sugake: { band: 1200, columns: 2, pitch: 0.05, rows: 2, row: 0.05, masks: 'lace' },
  // Etched bands, foliage bright on a blackened ground (Milanese and Brescian 'Spanish' morions: the Met's 14.25.629,
  // https://www.metmuseum.org/art/collection/search/26437; https://col.rct.uk/collection/67373/spanish-morion).
  etched: { band: 1300, tile: 0.12 },
  // Moulded and coated shells (riot armour's plates, a ballistic helmet's painted shell): a matte orange-peel stipple.
  polymer: { band: 1400, tile: 0.1 },
  // A machine's panels: seams, countersunk hex screws, vents, brushed grain (https://www.unitree.com/g1,
  // https://www.sarcos.com/products/guardian-xo/).
  panels: { band: 1500, tile: 0.16 },
};
const DETAIL_BANDS = Object.fromEntries(Object.entries(DETAIL_ARMOUR).map(([kind, spec]) => [spec.band, kind]));

/** The kind of detail map a vertex's u says it carries ('mail', 'lamellae', 'plate', 'kozane', 'scale', ...), or null. */
export function detailKindOf(u) {
  return u >= 50 ? DETAIL_BANDS[Math.round(u / 100) * 100] ?? null : null;
}

/** A field tile's size (m): [round, up]. */
export function tileSize(kind) {
  const { tile } = DETAIL_ARMOUR[kind];
  return Array.isArray(tile) ? tile : [tile, tile];
}

/** Whether a tile counts laced plates (drawn as a shell in rows: loftbody.js lacedShell), not a field. */
export const isLacedTile = (kind) => Boolean(DETAIL_ARMOUR[kind]?.columns);

// What each armour kind's hard pieces wear, by what the piece is (pieceMaterial): `steel` a piece all of metal, `armor` a
// moulded shell in the kit's colour, `pad` a modern kit's hard pad, `scales` scales (or plates hung point down), `lamellae`
// laced plates, `kozane` Japanese laced rows, `studded` cloth over riveted plates, `mail`. A key `slot.material`
// (`trunk.steel`) is that piece only. Anything not listed: DEFAULT_TILES. Helmets and machines: HELMET_TILES, MACHINE_TILES.
const DEFAULT_TILES = { steel: 'plate', mail: 'mail', lamellae: 'lamellae', kozane: 'kozane', scales: 'scale', studded: 'brigandine' };
export const ARMOUR_TILES = {
  segmentata: { steel: 'segmentata' },
  // The Iron Pagoda's cuirass in the mountain pattern; its skirt and arms stay laced lamellae.
  ironPagoda: { 'trunk.lamellae': 'mountain' },
  // Han lamellar (the small laced plates of the Han tomb figures), painted as rows of scales: lamellae.
  hanLamellar: { scales: 'lamellae' },
  krug: { 'trunk.steel': 'krug' },
  conquistador: { 'trunk.steel': 'etched' },
  // Tosei gusoku: the riveted, lacquered do; its kusazuri and sleeves in sugake.
  toseiDo: { 'trunk.steel': 'iyozane', kozane: 'sugake' },
  roninDo: { 'trunk.steel': 'iyozane', kozane: 'sugake' },
  okegawa: { armor: 'iyozane', kozane: 'sugake' },
  riot: { armor: 'polymer', pad: 'polymer' },
  heavyRiot: { armor: 'polymer', pad: 'polymer' },
};

/**
 * Every armour kind (outfits.js `armor.kind`) and the tiles its hard surfaces wear, or null for none: cloth, leather, fur,
 * feathers and quilting (the textile maps' business), the arena gladiators' kit, and a kind drawn whole elsewhere.
 */
export const ARMOUR_COVERAGE = {
  heavyRiot: ['polymer'], riot: ['polymer'], patrolVest: null, plateCarrier: null,
  plate: ['plate', 'harnessEdge'], templar: ['mail', 'plate'], brigandine: ['brigandine', 'plate'], haubergeon: ['mail'], breastplate: ['plate'],
  lamellar: ['kozane', 'plate'], oyoroi: ['kozane', 'mail', 'plate'], toseiDo: ['iyozane', 'sugake', 'plate'], okegawa: ['iyozane', 'sugake'], roninDo: ['iyozane', 'sugake'],
  doMaru: ['kozane'], doMaruSode: ['kozane'],
  // The arena's: their greaves and manicae (their helmets are drawn their own way).
  hoplomachus: ['plate'], murmillo: ['plate'], secutor: ['plate'], retiarius: ['plate'], thraex: ['plate'], maximus: null, commodus: null, scissor: ['scale', 'plate'],
  mingVest: null, mingBrigandine: ['brigandine', 'plate'], mingLamellar: ['lamellae', 'plate'], mingScaleCoat: ['scale', 'plate'],
  mingElite: ['brigandine', 'plate'], mingScale: ['scale', 'plate'], mingEliteLamellar: ['lamellae', 'plate'],
  ironPagoda: ['mountain', 'lamellae', 'plate'], guanYu: ['scale', 'plate'], hanLamellar: ['lamellae'], wuxiaRobe: null,
  segmentata: ['segmentata'], centurion: ['mail', 'plate'], hauberk: ['mail'], hamata: ['mail'],
  mongolDeel: null, mongolLamellar: ['lamellae'], mongolIron: ['lamellae', 'plate'], kheshig: ['scale', 'plate'], girdle: null,
  cataphract: ['scale', 'plate'], deel: null, dolama: null, krug: ['krug', 'mail', 'plate'], kazaghand: ['mail', 'plate'],
  conquistador: ['etched', 'mail', 'plate'], escaupil: null, ichcahuipilli: null, jaguarSuit: null, featherSuit: null,
  uncu: null, uncuChecks: null, uncuTocapu: null, uncuRoyal: null, corset: null, overbust: null, overbustSleeved: null,
  silverback: null, robot: ['panels'],
};

/** What an armour piece's paint (loftbody.js ARMOR_KINDS) says it is made of (see ARMOUR_TILES), or null. */
export function pieceMaterial(paint) {
  if (!paint) return null;
  if (typeof paint === 'string') return ['steel', 'steel2', 'gold'].includes(paint) ? 'steel' : ['mail', 'armor', 'pad'].includes(paint) ? paint : null;
  if (typeof paint !== 'object') return null;
  if (paint.mail) return 'mail';
  if (paint.lamellae) return paint.pointDown ? 'scales' : 'lamellae';
  if (paint.scales) return 'scales';
  if (paint.kozane) return 'kozane';
  if (paint.studded || (paint.rivets && paint.base === 'cloth')) return 'studded';
  if (paint.lames) return 'steel';
  const roles = [...(paint.rows ?? []), ...(paint.base ? [paint.base] : []), ...(paint.mon ? [paint.mon[2]] : [])];
  if (!roles.length) return null;
  // (Plates set in mail, rows of each, are steel: the mail and plate tile has both.)
  if (roles.every((role) => ['steel', 'steel2', 'gold', 'mail'].includes(role)) && roles.some((role) => role !== 'mail')) return 'steel';
  if (roles.every((role) => role === 'armor' || role === 'gold')) return 'armor';
  return null;
}

/** The tile an armour kind's piece of a material wears (in `slot`, if given: 'trunk', 'skirt', 'upperArm'...), or null. */
export function armourTileOf(kind, material, slot = null) {
  if (!material) return null;
  const own = ARMOUR_TILES[kind] ?? {};
  return own[`${slot}.${material}`] ?? own[material] ?? DEFAULT_TILES[material] ?? null;
}

// Helmets (outfits.js `head.kind`) and the tile their metal wears (or, for a moulded shell, MOULDED_TILES, every opaque part):
// wardrobe.js buildHeadgear. Not listed: none (cloth, fur, feathers, animal heads; the arena gladiators' helmets).
export const HELMET_TILES = {
  bascinet: 'plate', greatHelm: 'plate', stechhelm: 'plate', kettleHat: 'plate', kabuto: 'plate', jingasa: 'plate', mingHelm: 'plate',
  pagodaHelm: 'plate', hanHelm: 'plate', steppeHelm: 'plate', spangenhelm: 'plate', ridgeHelm: 'plate', montefortino: 'plate',
  chichak: 'plate', ayyubidHelm: 'plate', potHelmet: 'plate', galea: 'plate',
  morion: 'etched', cabasset: 'etched',
  riotHelmet: 'polymer', opsHelmet: 'polymer',
  robotHead: 'panels',
};
/** The tiles worn by every opaque part of a piece (a moulded shell, a machine), not only its metal. */
export const MOULDED_TILES = new Set(['polymer', 'panels']);
/** Machines' bodies (robotview.js's shells, exoview.js's frame) and the tile they wear. */
export const MACHINE_TILES = { robot: 'panels', exo: 'panels' };

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
 * counted upward on the body (so mail's weave hangs the right way up). `kind`: a field tile ('mail', 'plate', 'segmentata'...).
 */
export function tileUv(rings, inflate, kind = 'mail') {
  const { band } = DETAIL_ARMOUR[kind];
  const [round, up] = tileSize(kind);
  const { girth, along, length, rising } = measureRings(rings, inflate);
  const across = Math.max(1, Math.round(girth / round));
  const at = new Map(rings.map((ring, index) => [ring, along[index]]));
  return (ring, share) => [band + share * across, (rising ? at.get(ring) ?? 0 : length - (at.get(ring) ?? 0)) / up];
}

/**
 * A strip tile's coordinates over a band of two rings at a piece's edge (`edge` the ring at the edge, `inner` the one inward):
 * round it a whole number of tiles, v 0 at the edge and 1 at the inner ring.
 */
export function stripUv(edge, inner, inflate, kind = 'harnessEdge') {
  const { band } = DETAIL_ARMOUR[kind];
  const [round] = tileSize(kind);
  const across = Math.max(1, Math.round(measureRings([edge, inner], inflate).girth / round));
  return (ring, share) => [band + share * across, ring === edge ? 0 : 1];
}

/** Mail's texture coordinates (tileUv). */
export function mailUv(rings, inflate) {
  return tileUv(rings, inflate, 'mail');
}

/**
 * Where on a run of rings a flat patch's corner falls in the plate tile (addPatch's places and angles: rivets, lames, a
 * breastplate's faces): u by the angle round (not wrapped, so a patch across the front runs on), v up the run, in tiles.
 */
export function plateUvAt(measure, place, angle, kind = 'plate') {
  const { band } = DETAIL_ARMOUR[kind];
  const [tile] = tileSize(kind);
  const across = Math.max(1, Math.round(measure.girth / tile));
  const index = Math.max(0, Math.min(measure.along.length - 2, Math.floor(place)));
  const share = place - index;
  const run = measure.along[index] + (measure.along[index + 1] - measure.along[index]) * share;
  return [band + 0.5 * across + (angle / (Math.PI * 2)) * across, (measure.rising ? run : measure.length - run) / tile];
}
