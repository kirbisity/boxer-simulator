// Surface detail drawn by maps instead of geometry (a pilot): the fine relief of a few armours (mail's rings, laced iron lamellae)
// and of a few of the castle's surfaces (the dressed walling, the road's cobbles) baked in Blender from real geometry into tiling
// maps (tools/blender/*.py: a normal map, a base colour, occlusion/roughness/metalness), and the pieces that carry them drawn as
// smooth shells with texture coordinates in the tile's own units. This file is the plain part (no Three.js: the skin worker
// builds the shells too); detailtex.js makes the textures and the materials.
//
// `#maps=off` in the page's address draws everything as before (the mail painted ring by ring, each lamella its own plate, the
// castle's own painted stone), for comparing the two in one build; `boxer.detailMaps()` says which is in force.

/** Whether an address's hash asks for the detail maps (anything but `maps=off` does). */
export function detailMapsWanted(hash = '') {
  return !/(^|[#&])maps=off\b/.test(hash);
}

/** Whether the detail maps are drawn (read once from the address). */
export const DETAIL_MAPS = { on: detailMapsWanted(typeof location !== 'undefined' ? location.hash ?? '' : '') };

/**
 * The armour tiles: `tile` (m) the side of the mail's square tile; the lamellae's tile is two plate columns across and two rows up,
 * so its UVs count columns and rows, not metres. `band`: each kind's texture coordinates are offset by its band in u (a whole number
 * of tiles, so the picture is the same), which is how the view tells the kinds apart (`detailKindOf`) without a vertex attribute
 * of its own; the skin's own coordinates are all below 1.
 */
export const DETAIL_ARMOUR = {
  mail: { band: 100, tile: 0.048 },
  lamellae: { band: 200, columns: 2, rows: 2 },
};

/** The kind of detail map a vertex's u says it carries ('mail', 'lamellae'), or null. */
export function detailKindOf(u) {
  if (u >= DETAIL_ARMOUR.lamellae.band - 50) return 'lamellae';
  if (u >= DETAIL_ARMOUR.mail.band - 50) return 'mail';
  return null;
}

/** The perimeter of an ellipse of semi-axes a and b (Ramanujan's). */
function ellipsePerimeter(a, b) {
  const h = ((a - b) / (a + b)) ** 2;
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/**
 * Mail's texture coordinates over a run of rings (loft's `uv`: ring, share of the way round -> [u, v]): round the piece a whole
 * number of tiles (by its mean girth, so the weave closes on itself at the seam), along it the slant length in tiles.
 */
export function mailUv(rings, inflate) {
  const { tile, band } = DETAIL_ARMOUR.mail;
  const girth = rings.reduce((sum, ring) => sum + ellipsePerimeter(ring.depth * inflate, ring.width * inflate), 0) / rings.length;
  const across = Math.max(1, Math.round(girth / tile));
  const along = new Map();
  let run = 0;
  rings.forEach((ring, index) => {
    if (index > 0) {
      const last = rings[index - 1];
      const step = Math.hypot(ring.center[0] - last.center[0], ring.center[1] - last.center[1], ring.center[2] - last.center[2]);
      const swell = (ring.depth + ring.width - last.depth - last.width) * inflate * 0.5;
      run += Math.hypot(step, swell);
    }
    along.set(ring, run / tile);
  });
  // (Upward on the body, so the weave hangs the right way up: a run whose rings go down counts back from its end.)
  const rising = rings.at(-1).center[1] >= rings[0].center[1];
  const top = run / tile;
  return (ring, share) => [band + share * across, rising ? along.get(ring) ?? 0 : top - (along.get(ring) ?? 0)];
}
