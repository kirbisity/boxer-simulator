// Scenery variants (proof of concept): different ways to draw what lies
// beyond the fighting ground (hills, mountains, trees, the ground's far
// reach) in the open-air places. 'current' is the game as built in
// render.js. A variant names the kinds of current scenery it replaces
// (render.js tags them userData.scenery = 'ground' | 'hills' | 'mountains' |
// 'trees' | 'plants') and builds its own group into the place; a composite
// variant is a list of parts. Switched from the console or the looks bench:
// `__looks.scenery('generated')`.

/* global THREE */
import { SKYBALL_VARIANTS } from './scenery/skyball.js';
import { GENERATED_VARIANTS } from './scenery/generated.js';
import { TREE_VARIANTS } from './scenery/trees.js';

/**
 * What each open-air place has beyond its ground, for a variant to draw in
 * its own way. Distances are metres from the centre of the fighting ground;
 * angles are radians round from +x towards +z (−π/2 is the far side, −z).
 * `keepOut` is the half-size of the ground nothing may stand on.
 */
export const PLACE_SCENERY = {
  // An English village green: rolling pasture and hedgerow trees.
  meadow: {
    keepOut: [13, 11], groundColour: 0x5f7f3a,
    hills: { from: 30, to: 70, height: [3, 9], colour: 0x6d8a45, character: 'rolling' },
    mountains: [],
    trees: { kind: 'broadleaf', count: 40, from: 15, to: 45, colour: 0x3f6a2a, bark: 0x5a4128 },
  },
  // Open country for horsemen: long low hills, woods along them.
  field: {
    keepOut: [32, 22], groundColour: 0x6a8a40,
    hills: { from: 45, to: 90, height: [3, 12], colour: 0x6d8a45, character: 'rolling' },
    mountains: [],
    trees: { kind: 'broadleaf', count: 60, from: 38, to: 70, colour: 0x3f6a2a, bark: 0x5a4128 },
  },
  // The Valley of Mexico: dry plain, the two great volcanoes to the south-east, bare ridges round.
  plain: {
    keepOut: [14, 10], groundColour: 0x7a7442,
    hills: { from: 40, to: 80, height: [4, 10], colour: 0x5f6448, character: 'dry' },
    mountains: [
      { angle: -1.92, distance: 58, height: 22, radius: 20, snow: 0.35, name: 'Popocatépetl', shape: 'cone' },
      { angle: -1.36, distance: 60, height: 18, radius: 22, snow: 0.3, name: 'Iztaccíhuatl', shape: 'ridge' },
    ],
    trees: { kind: 'none', count: 0, from: 0, to: 0, colour: 0x6a8a6a, bark: 0x4a3626 },
  },
  // Sekigahara: a valley ringed by forested mountains, pines about the field, the castle on its hill to the north.
  sengoku: {
    keepOut: [13, 9], groundColour: 0x7d8a4a,
    hills: { from: 30, to: 60, height: [3, 8], colour: 0x5f7040, character: 'forested' },
    mountains: [{ ring: true, from: 42, to: 70, height: [9, 18], colour: 0x6a7a88, forested: true }],
    trees: { kind: 'pine', count: 30, from: 19, to: 34, colour: 0x2a4430, bark: 0x4a3626 },
    keepClear: [{ at: [-6, -40], radius: 10 }],
  },
};

const CURRENT = { id: 'current', label: 'Current (as built)', replaces: [] };

/** Every variant: current, then each method's own, then the composites. */
export const SCENERY_VARIANTS = [CURRENT, ...SKYBALL_VARIANTS, ...GENERATED_VARIANTS, ...TREE_VARIANTS];

let sceneryInForce = 'current';

export const sceneryById = (id) => SCENERY_VARIANTS.find((variant) => variant.id === id);
export const activeScenery = () => sceneryInForce;

/** Choose a variant (it takes effect at the next applyScenery). Unknown ids fall back to current with a warning. */
export function setScenery(id) {
  if (!sceneryById(id)) {
    console.warn(`no scenery ${id}; the variants are ${SCENERY_VARIANTS.map((variant) => variant.id).join(', ')}`);
    id = 'current';
  }
  sceneryInForce = id;
  return id;
}

/** A variant's leaf parts: itself, or its parts' parts. */
function partsOf(variant) {
  if (!variant.parts) return [variant];
  return variant.parts.flatMap((id) => partsOf(sceneryById(id)));
}

/**
 * Show the variant in force in `place`: hide the current scenery it
 * replaces, build its groups once per place (cached on the place group),
 * hide any other variant's groups, then let each part adjust to the light.
 */
export function applyScenery(view, place) {
  const group = view.places?.[place];
  const spec = PLACE_SCENERY[place];
  if (!group) return;
  const parts = spec ? partsOf(sceneryById(sceneryInForce)) : [CURRENT];
  const replaced = new Set(parts.flatMap((part) => part.replaces ?? []));
  const wanted = new Set(parts.map((part) => part.id));
  group.traverse((object) => {
    if (object.userData.scenery) object.visible = !replaced.has(object.userData.scenery);
  });
  for (const child of group.children) {
    if (child.userData.sceneryVariant) child.visible = wanted.has(child.userData.sceneryVariant);
  }
  for (const part of parts) {
    if (!part.build) continue;
    let built = group.children.find((child) => child.userData.sceneryVariant === part.id);
    if (!built) {
      built = part.build({ place, view, spec, rng: sceneryRandom(place, part.id) });
      if (!built) continue;
      built.userData.sceneryVariant = part.id;
      group.add(built);
    }
    built.visible = true;
    part.apply?.({ place, view, spec, group: built });
  }
}

/** A seeded generator per place and variant, so a variant draws the same land every time. */
export function sceneryRandom(place, id) {
  let seed = 2166136261;
  for (const char of `${place}:${id}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
