// The lie of the land under an open-air fight (src/env/): a field is fought on as it lies, not on a levelled patch.
// The place's own near rolls (its terrain layers that begin at the floor, config.js PLACE_ENV `terrain.layers` with
// `from: 0`) run on through the fought ground, gentler there: men choose the easier ground to stand and walk on.
// The physics stands on it as a height field (physics/fieldworks.js `ground`; physics.js createWorld asks
// envLieOf for any place that has one) and the land is drawn from the same field (terrain.js envHeightField), so
// a foot lands where the ground is drawn. Pure: no three.js, so the fights run the same in node and in the page.

import { PLACE_ENV } from './config.js';
import { envFbm } from './noise.js';
import { fieldHeight } from '../physics/terrain.js';

export const ENV_LIE = {
  // The share of the near rolls' height kept through the fought ground. By eye, not measured: a fight is joined
  // where the footing is easiest, a swale or a gentle rise rather than the steep side of a roll; at a half the
  // meadow's rolls (1.6 m over 46 m) are under a metre and the steepest grade inside its floor about one in ten.
  fought: 0.5,
  // The field's cell (m): the triangles both the physics and the drawn land use. Under a stride: the hummocks of a
  // pasture (a few metres across) keep their shape in it, and the rolls differ from their chords by millimetres.
  cell: 1,
  // m past the floor's edge the field still reaches (a man shoved to the floor's edge still stands on it; the
  // drawn land's level margin, ENV.terrain.flatMargin, is wider).
  margin: 2,
};

const envLieNear = (terrain) => terrain.layers.map((layer, index) => ({ layer, index })).filter(({ layer }) => layer.from === 0);

/** One near layer's roll at (x, z), at its full height (terrain.js envHeightField draws the same). */
export function envLieRoll(terrain, layer, index, x, z) {
  const octaves = layer.length > 200 ? 5 : 3;
  if (layer.shape === 'ridge') return layer.height * envFbm(x / layer.length, z / layer.length, terrain.seed + index * 7, octaves, true);
  return layer.height * (envFbm(x / layer.length, z / layer.length, terrain.seed + index * 7, octaves, false) - 0.5) * 2;
}

/** The fought ground's height at (x, z): the near rolls at ENV_LIE.fought of their height. */
export function envLieHeight(terrain, x, z) {
  let y = 0;
  for (const { layer, index } of envLieNear(terrain)) y += ENV_LIE.fought * envLieRoll(terrain, layer, index, x, z);
  return y;
}

const envLieMade = new Map();

/**
 * The fought ground of a place's terrain under a floor ({ halfX, halfZ }, centred on 0), as a height field in the
 * shape fieldworks `ground` and terrain.js's `field` take: { at, size, cells, heights, base (m taken off
 * envLieHeight so the floor lies at 0 on the mean) }. Null for a terrain with no
 * near rolls. Made once for each terrain and floor size.
 */
export function envLieField(terrain, arena) {
  if (!terrain?.layers || !envLieNear(terrain).length) return null;
  const key = `${terrain.seed}|${terrain.layers.length}|${arena.halfX}|${arena.halfZ}`;
  const made = envLieMade.get(key);
  if (made?.terrain === terrain) return made.field;
  const { cell, margin } = ENV_LIE;
  const nu = Math.ceil((2 * (arena.halfX + margin)) / cell);
  const nv = Math.ceil((2 * (arena.halfZ + margin)) / cell);
  const size = [nu * cell, nv * cell];
  const heights = [];
  for (let j = 0; j <= nv; j += 1) for (let i = 0; i <= nu; i += 1) heights.push(envLieHeight(terrain, -size[0] / 2 + i * cell, -size[1] / 2 + j * cell));
  // (Set so the floor's ground lies at 0 on the mean, where the place's own buildings and fences stand.)
  const base = heights.reduce((sum, y) => sum + y, 0) / heights.length;
  const field = { at: [0, 0], size, cells: [nu, nv], heights: heights.map((y) => y - base), base };
  envLieMade.set(key, { terrain, field });
  return field;
}

/** The field's height at (x, z), or null outside its rectangle. */
export function envLieFieldAt(field, x, z) {
  const su = (x - field.at[0] + field.size[0] / 2) / field.size[0];
  const sv = (z - field.at[1] + field.size[1] / 2) / field.size[1];
  if (su < 0 || su > 1 || sv < 0 || sv > 1) return null;
  return fieldHeight(field.heights, field.cells[0], field.cells[1], su, sv);
}

/** The fought ground of an open-air place (a key of PLACE_ENV that the system draws whole) under `arena`, or null. */
export function envLieOf(place, arena) {
  const own = PLACE_ENV[place];
  if (!own || own.own || !arena || arena.ring) return null;
  return envLieField(own.terrain, arena);
}
