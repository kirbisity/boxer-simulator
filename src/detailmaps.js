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
