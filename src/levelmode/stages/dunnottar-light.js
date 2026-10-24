// Stage 1, Dunnottar: the light under the roofs. Every room that is not under the sky (the gatehouse's guard hall and gun gallery, the tunnelled ascent, the vault
// and its torture chamber and stores, the crypt, the keep's hall and its stair tower, the chapel and the cell, and the old drain) is dark: the storm's sun and sky
// light are shut out but for a faint floor of it (so that a man still sees the walls a few metres round him and the way on), and what lights the room is its
// torches, braziers, lanterns and candles, each a warm pool with a falloff, the stone between them near black, and the cold slits and gratings a pale shaft of
// the storm. How the light changes as he walks in (eased, never a step: levelmode/storm.js) is stagelooks.js `interiorLevels`; which light is where is here.
//
//   DN_INTERIOR   the interiors' light, by kind of room: see stagelooks.js `interiorLevels` for what each number does (the `probe`/`ambient` shares are what is left
//                 of the storm's sky light; `torch` and `reach` how bright and how far the flames are; `fog` the dark that eats the far end of a passage).
//   dnInteriorRooms(sections)  the stage's `interiors` (stage.js `interiorAt`: [{ id, area, spec }], looked at before a section's own `interior`): rooms by their
//                 extents in the sections that are partly in the open, and whole sections by their bounds; the more particular first.
//   dnLightDecor(sections)     the lit things added to rooms that had too few to guide a man (lanterns, wall torches, braziers at doorways) and the pale shafts
//                 under the slits and windows: props (kitprops.js) appended to the sections' decor, as the builders' own.

import { DN_CELL_INTERIOR, DN_CHAPEL_INTERIOR } from './dunnottar-chapel.js';
import { DN_CAVE, DN_CESSPOOL } from './dunnottar-sewer.js';
import { Y } from './dnbuild.js';

/** The darkest a room is let be: no interior keeps less than this share of the storm's sky light (the floor a man finds his way by). */
export const DN_DARK_FLOOR = 0.05;
/** The most of the storm's sky light a room under a roof keeps (the tests hold every interior under it). */
export const DN_DARK_MOST = 0.2;

/** A cellar lit by torches: warm, near black between them. */
const CELLAR = {
  sun: 0, ambient: 0.12, probe: 0.1, tint: [1.08, 0.96, 0.84],
  hemi: { sky: 0x2a241e, ground: 0x0b0907 },
  fog: { colour: 0x060508, near: 7, far: 44, mist: 0 },
  wet: 0.5, torch: 1.6, reach: 1.1, flash: 0.04, blend: 1.6,
};

export const DN_INTERIOR = {
  // The guard hall, the gun gallery and the guard room: stone rooms with slits and a door to the storm; a little more of the sky gets in.
  hall: { ...CELLAR, ambient: 0.15, probe: 0.13, sun: 0.02, tint: [1, 0.97, 0.94], fog: { colour: 0x0a0a0e, near: 9, far: 52, mist: 0 }, wet: 0.35, torch: 1.6, reach: 1.05, flash: 0.22 },
  // The stair tower: slits up the wall, a little cold light.
  stair: { ...CELLAR, ambient: 0.14, probe: 0.12, tint: [0.95, 0.97, 1.05], fog: { colour: 0x08080c, near: 6, far: 34, mist: 0 }, flash: 0.2 },
  // The vault: the long cellar, the dungeon hall, the torture chamber, the stores, the well shaft.
  cellar: CELLAR,
  // The crypt: blacker, colder; the flooded way's water throws the torches back.
  crypt: { ...CELLAR, ambient: 0.1, probe: 0.09, tint: [0.92, 0.96, 1.04], fog: { colour: 0x040406, near: 5, far: 36, mist: 0 }, wet: 0.7, torch: 2.0, reach: 1.15, flash: 0.02 },
  // The old drain: a green-black murk, a reek that hangs in the air (the fog close), wet everywhere.
  sewer: {
    ...CELLAR, ambient: 0.1, probe: 0.09, tint: [0.84, 1.04, 0.78], hemi: { sky: 0x1c2416, ground: 0x080a06 },
    fog: { colour: 0x080c06, near: 3, far: 30, mist: 0 }, wet: 0.95, torch: 2.0, reach: 1.2, flash: 0, blend: 1.8,
  },
  // The cesspool: the murk at its thickest, a sick green.
  cesspool: {
    ...CELLAR, ambient: 0.13, probe: 0.12, tint: [0.8, 1.1, 0.7], hemi: { sky: 0x1e2a14, ground: 0x080a05 },
    fog: { colour: 0x0b1206, near: 2, far: 24, mist: 0 }, wet: 1, torch: 2.0, reach: 1.2, flash: 0, blend: 1.8,
  },
  // The grotto by the sea cave's mouth: the storm's grey comes in at the mouth and dies along the cave.
  grotto: { ...CELLAR, sun: 0.05, ambient: 0.2, probe: 0.18, tint: [0.9, 0.96, 1.08], hemi: { sky: 0x3a3c48, ground: 0x101014 }, fog: { colour: 0x121318, near: 6, far: 50, mist: 0 }, wet: 1, torch: 2.0, reach: 1.3, flash: 0.35 },
  // The chapel: its own candles and chandeliers and the stained glass, darker than it was between them.
  chapel: { ...DN_CHAPEL_INTERIOR, ambient: 0.12, probe: 0.13, torch: 1.0, reach: 1.15 },
  // The cell: a slit, a glow.
  cell: { ...DN_CELL_INTERIOR, ambient: 0.1, probe: 0.11, torch: 1.9, reach: 1.3 },
};

/** A box area by extents: x0..x1, z0..z1, y0..y1. */
const dnArea = (x0, x1, z0, z1, y0, y1) => ({ at: [(x0 + x1) / 2, (z0 + z1) / 2], size: [x1 - x0, z1 - z0], y: [y0, y1] });

const LT_A = Y.landing;
const LT_B = Y.guardroom;
const LT_Q = Y.quad;
const LT_W = Y.walk;

/** The rooms under a roof in sections that are partly in the open: [id, area, kind of light]. */
const DN_ROOMS = [
  // The gatehouse: the guard hall (not the ledge, the gorge or the great gate's threshold), the stair tunnel, the landing and the gun gallery.
  ['gatehall', dnArea(-5.6, 6.6, 40.2, 52.2, -1, 5.6), 'hall'],
  ['gatestair', dnArea(6.6, 14.3, 43.2, 49.2, -1, LT_A + 4.4), 'hall'],
  ['gallery', dnArea(14.3, 30.4, 40.2, 52.2, LT_A - 1, LT_A + 4.6), 'hall'],
  // The tunnelled ascent: the vestibule, the flights and the guard room, to the head of the second flight (the court's arch is the open).
  ['ascent', dnArea(9.4, 27.4, 8.6, 41.2, LT_A - 1, LT_Q + 4), 'hall'],
  // The keep's hall and its stair tower (below the top landing: the walk is the open).
  ['keep', dnArea(45.6, 57.6, -31, -16.4, LT_Q - 1, LT_Q + 5), 'hall'],
  ['towerstair', dnArea(58.3, 68.5, -28.9, -18.7, LT_Q - 1, LT_W - 0.6), 'stair'],
];

/** The interiors the stage looks at first (stage.js `interiorAt`): the rooms above, then the sewer's grotto and cesspool, then the sections that are all under a roof. */
export function dnInteriorRooms(sections, cesspool = DN_CESSPOOL) {
  const byId = Object.fromEntries(sections.map((section) => [section.id, section]));
  const rooms = DN_ROOMS.map(([id, area, kind]) => ({ id, area, spec: DN_INTERIOR[kind] }));
  rooms.push({ id: 'grotto', area: dnArea(-56, -41, 44, 55.4, DN_CAVE.floor - 1.5, DN_CAVE.floor + 4), spec: DN_INTERIOR.grotto });
  if (cesspool) rooms.push({ id: 'cesspool', area: dnArea(cesspool.at[0] - cesspool.hall, cesspool.at[0] + cesspool.hall, cesspool.at[2] - cesspool.hall, cesspool.at[2] + cesspool.hall, cesspool.floor - 2, cesspool.rim + 5), spec: DN_INTERIOR.cesspool });
  for (const [id, kind] of [['vault', 'cellar'], ['crypt', 'crypt'], ['sewer', 'sewer'], ['chapel', 'chapel'], ['cell', 'cell']]) {
    if (byId[id]) rooms.push({ id, area: byId[id].bounds, spec: DN_INTERIOR[kind] });
  }
  return rooms;
}

// ---- Lit things ----------------------------------------------------------------------------------------------

/**
 * What lights the dark rooms beyond what their builders put there: [section, what, [x, y, z], options]. The vault's stores and dungeon hall, the crypt's ossuary
 * and tombs, the drains between their torches; the pale shafts (`lightshaft`) under the slits and windows that let the storm in.
 */
const DN_LIGHTS = [
  // The guard hall's slits and the gallery's oillets: pale storm light across the floor.
  ['gate', 'lightshaft', [3, Y.gorge + 3.6, 51.2], { size: [0.6, 1.6], yaw: 0, height: 3.4 }],
  ['gate', 'torch', [10.6, Y.gorge + 4.5, 43.6], { face: 'S', dim: true }],
  ['gate', 'lightshaft', [21.3, LT_A + 1.35, 45.2], { size: [0.5, 1.2], yaw: Math.PI / 2, height: 1.35 }],
  ['ascent', 'lightshaft', [11.0, LT_B + 3.0, 21.6], { size: [0.5, 1.4], yaw: Math.PI / 2, height: 3.0 }],
  ['ascent', 'lightshaft', [24.5, LT_B + 3.0, 20.6], { size: [0.5, 1.4], yaw: Math.PI / 2, height: 3.0 }],
  ['ascent', 'lantern', [21.6, LT_A, 32.6], { yaw: Math.PI }],
  // The keep: the lancets let in the storm; a lantern by the stair tower's door.
  ['tower', 'lightshaft', [48.5, LT_Q + 3.8, -30.8], { size: [0.6, 1.4], yaw: 0, height: 3.8 }],
  ['tower', 'lightshaft', [53.5, LT_Q + 3.8, -16.6], { size: [0.6, 1.4], yaw: 0, height: 3.8 }],
  ['tower', 'torch', [59.0, LT_Q + 2.4, -26.6], { face: 'E', dim: true }],
  ['tower', 'torch', [63.4, LT_Q + 6.2, -18.9], { face: 'N', dim: true }],
  ['tower', 'torch', [63.4, LT_Q + 9.6, -28.7], { face: 'S', dim: true }],
  // The vault: the stores' collapsed end and the dungeon hall get a lantern each.
  ['vault', 'lantern', [18.6, Y.vault, -9.2], { yaw: Math.PI }],
  ['vault', 'lantern', [22.6, Y.vault, -34.6], { yaw: Math.PI }],
  // The crypt: a lantern at the gallery's dry end and one in the ossuary, a brazier by the tombs.
  ['crypt', 'lantern', [29.6, Y.crypt, -25.2], { yaw: Math.PI }],
  ['crypt', 'lantern', [20.8, Y.crypt, -34.4], { yaw: Math.PI }],
  // (The flooded way: a torch over the black water, for the water to throw back.)
  ['crypt', 'torch', [7.75, Y.crypt + 2.4, -30.4], { face: 'W' }],
];

/** Add the lit things above to the sections' decor. Returns how many were added. */
export function dnLightDecor(sections) {
  const byId = Object.fromEntries(sections.map((section) => [section.id, section]));
  let added = 0;
  for (const [id, what, at, extra] of DN_LIGHTS) {
    if (!byId[id]) continue;
    byId[id].decor.push({ kind: 'prop', what, at, ...extra });
    added += 1;
  }
  return added;
}
