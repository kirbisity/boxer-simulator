// What a foot, a body or an arrow comes down on, by name, for the ear: the sound of a step is the floor's as much as the man's.
// Read from what the world already says about its ground, never stored on it:
//
//  - A level (world.stage): the floor part under the point (physics/terrain.js, the highest top within a stride of it) and the
//    drawn `style` its stage gave it (stages/dnbuild.js: flags, cobble, rock, stone, boards, grass, path, ladder, timber); then the
//    standing water over it (levelmode/water.js), whose depth is what a wading foot goes into.
//  - A fight on the flat (no terrain): the place it is fought in, when whoever draws it says (`world.place`, a key of render.js
//    PLACE_ARENAS, set beside world.ear by the audio engine, which knows the view's place); else what the arena itself shows: a ring
//    (canvas over boards), a platform with a drop edge (the subway's concrete), or open ground.
//
// The names are the step event's: stone | earth | grass | sand | wood | mud | water | tile | snow.

import { stageWaters, waterAt, waterDepth } from '../levelmode/water.js';
import { reliefAt, softAt, worksOf } from '../physics/fieldworks.js';

/** A stage solid's drawn style, as the ground it is to walk on. (Stairs with no style are cut stone, as the test yard's are.) */
export const STYLE_SURFACE = {
  flags: 'stone', cobble: 'stone', rock: 'stone', stone: 'stone', ashlar: 'stone', rubble: 'stone', vault: 'stone', newel: 'stone',
  boards: 'wood', timber: 'wood', ladder: 'wood',
  grass: 'grass', path: 'earth', earth: 'earth', sand: 'sand', mud: 'mud', tile: 'tile', snow: 'snow',
};

/**
 * The ground of each place a fight on the flat is fought in (render.js PLACE_ARENAS; what scenery.js PLACE_GROUND says it is made
 * of): grass for the green and the pasture, earth for the dry plain and the trampled field of Sekigahara, raked sand in the arena and on
 * the beaches, stone for cobbles, granite slabs and concrete, boards under a ring's canvas.
 */
export const PLACE_SURFACE = {
  ring: 'wood', stadium: 'wood', colosseum: 'sand', subway: 'stone', meadow: 'grass', field: 'grass', town: 'stone', port: 'stone',
  sengoku: 'earth', plain: 'earth', coastFort: 'sand', coastVillage: 'sand', jiangnan: 'stone', cajamarca: 'earth',
  // The horse-archer plains: the Gobi's gravel steppe and the dry plain below Harran are earth underfoot and hoof; Champagne's summer grass, grass.
  mobei: 'earth', catalaunian: 'grass', carrhae: 'earth',
  // Agincourt's ploughland (its mud is the works': surfaceUnder); Cerignola's vineyard earth.
  agincourt: 'mud', cerignola: 'earth',
};

// Water shallower than this (m) is a wet floor, not a wade.
const WADE_FROM = 0.03;

// Per stage: its bodies of water (made once). Per terrain (it is made again when a gate opens or a section wakes): each floor part's style.
const watersOf = new WeakMap();
const stylesOf = new WeakMap();

/** The top of a compiled floor part (physics/terrain.js) at its local u: flat, sloped or a tread's, as terrain.js has it. */
function partTop(part, u) {
  if (part.shape === 'slab') return part.top;
  const share = part.hu > 0 ? Math.max(0, Math.min(1, (u + part.hu) / (2 * part.hu))) : 0;
  if (part.shape === 'ramp') return part.lo + (part.hi - part.lo) * share;
  const tread = Math.min(part.steps - 1, Math.floor(share * part.steps));
  return part.lo + (tread + 1) * part.rise;
}

/**
 * The styles of a stage terrain's parts. The terrain is compiled from the active sections' solids in order (stage.js activeSolids:
 * each section's terrain, then its gates' and ladders' solids in their present states), so the part at an index is that solid.
 */
function partStyles(world) {
  const terrain = world.arena.terrain;
  let styles = stylesOf.get(terrain);
  if (styles) return styles;
  const run = world.stage;
  const sources = [];
  for (const section of run.def.sections) {
    if (!run.active.includes(section.id)) continue;
    sources.push(...(section.terrain ?? []));
    for (const mechanism of [...(section.gates ?? []), ...(section.ladders ?? [])]) sources.push(...(mechanism.states[run.mechanisms[mechanism.id]] ?? []));
  }
  styles = new Map();
  // (Made before the active set it was built from changed: no styles, and the floor is stone.)
  if (sources.length === terrain.solids.length) terrain.solids.forEach((part, index) => styles.set(part, sources[index].style));
  stylesOf.set(terrain, styles);
  return styles;
}

/** The floor part of a terrain under (x, z): the highest top no more than a stride above y; null over the void. */
function floorPart(terrain, x, y, z) {
  let best = null;
  let bestTop = -Infinity;
  for (const part of terrain.solids) {
    if (part.shape === 'wall' || part.shape === 'ceiling') continue;
    const dx = x - part.cx;
    const dz = z - part.cz;
    const u = dx * part.cos - dz * part.sin;
    if (u > part.hu || u < -part.hu) continue;
    const v = dx * part.sin + dz * part.cos;
    if (v > part.hv || v < -part.hv) continue;
    const top = partTop(part, u);
    if (top <= y + 0.3 && top > bestTop) {
      best = part;
      bestTop = top;
    }
  }
  return best;
}

/**
 * The ground under a point [x, y, z] (world m, y up: a foot, or a body on the floor): { surface, depth } (depth: m of standing water
 * over it, 0 where there is none). Water is found for a point in it, so ask with the foot, not the hips.
 */
export function surfaceUnder(world, x, y, z) {
  const run = world.stage;
  const terrain = world.arena?.terrain;
  if (run?.def && terrain) {
    let waters = watersOf.get(run.def);
    if (!waters) {
      waters = stageWaters(run.def);
      watersOf.set(run.def, waters);
    }
    const water = waters.length ? waterAt(waters, x, y, z) : null;
    if (water && waterDepth(water) > WADE_FROM) return { surface: 'water', depth: waterDepth(water) };
    const part = floorPart(terrain, x, y, z);
    return { surface: STYLE_SURFACE[partStyles(world).get(part)] ?? 'stone', depth: 0 };
  }
  // (Terrain with no stage to name it: a test's flight of stairs.)
  if (terrain) return { surface: 'stone', depth: 0 };
  const arena = world.arena ?? {};
  // A battle's soft ground (physics/fieldworks.js): its mud, or a stream's water over its bed, as deep as it stands.
  const soft = arena.works ? softAt(worksOf(arena), x, z) : null;
  if (soft) return { surface: soft.area.surface, depth: soft.area.surface === 'water' ? (soft.area.water ?? 0) * soft.share : 0 };
  // A ditch dug across a paved place (Qi Jiguang's trench in the water town's square) is earth, and so is its bank.
  if (arena.works && reliefAt(worksOf(arena), x, z) !== 0) return { surface: 'earth', depth: 0 };
  const surface = PLACE_SURFACE[world.place] ?? (arena.ring ? 'wood' : arena.drop ? 'stone' : 'earth');
  return { surface, depth: 0 };
}

/** The name of the ground under a point (surfaceUnder's `surface`). */
export function surfaceAt(world, x, y, z) {
  return surfaceUnder(world, x, y, z).surface;
}
