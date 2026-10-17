// Scenery: what lies beyond the fighting ground in the open-air places, and
// the ground near the fight. In the realistic look ('default'): a photograph
// of the distant land and sky over generated foothills, trees standing on
// them (scenery/*), and painted ground with the living layer on it
// (ground/*). In the classic cartoon look: the places as render.js builds
// them ('current'). A part names the kinds of render.js scenery it replaces
// (tagged userData.scenery = 'ground' | 'hills' | 'mountains' | 'trees' |
// 'plants') and builds its own group into the place, once, cached there; a
// composite is a list of parts. The looks bench can force one:
// `__looks.scenery('current')`, `__looks.ground('current')`.

/* global THREE */
import { SKYBALL_VARIANTS } from './scenery/skyball.js';
import { GENERATED_VARIANTS } from './scenery/generated.js';
import { TREE_VARIANTS } from './scenery/trees.js';
import { activeLook } from './looks.js';
import { PAINTED_GROUND } from './ground/painted.js';
import { LIVING_GROUND } from './ground/living.js';
import { PLACE_ARENAS } from './render.js';

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
  // Sekigahara: a valley ringed by forested mountains, pines about the field.
  sengoku: {
    keepOut: [13, 9], groundColour: 0x7d8a4a,
    hills: { from: 30, to: 60, height: [3, 8], colour: 0x5f7040, character: 'forested' },
    mountains: [{ ring: true, from: 42, to: 70, height: [9, 18], colour: 0x6a7a88, forested: true }],
    trees: { kind: 'pine', count: 30, from: 19, to: 34, colour: 0x2a4430, bark: 0x4a3626 },
  },
};

const CURRENT = { id: 'current', label: 'Current (as built)', replaces: [] };
// The default: the photograph over generated foothills in the realistic looks; the classic cartoon look keeps its painted hills.
const DEFAULT_SCENERY = { id: 'default', label: 'Default for the look' };
const sceneryForLook = () => (activeLook().id === 'toon' ? 'current' : 'photo-foothills');

const SCENERY_COMPOSITES = [
  // The pick: the photograph for the far mountains and sky, gentle generated hills in front of it, trees on them.
  { id: 'photo-foothills', label: 'Photo skyball + foothills + trees', parts: ['skyball-photo', 'foothills', 'trees-on-land'] },
];

/** Every variant: current, then each method's own, then the composites. */
export const SCENERY_VARIANTS = [DEFAULT_SCENERY, CURRENT, ...SKYBALL_VARIANTS, ...GENERATED_VARIANTS, ...TREE_VARIANTS, ...SCENERY_COMPOSITES];

let sceneryInForce = 'default';

export const sceneryById = (id) => SCENERY_VARIANTS.find((variant) => variant.id === id);
export const activeScenery = () => sceneryInForce;

/** Choose a variant (it takes effect at the next applyScenery). Unknown ids fall back to current with a warning. */
export function setScenery(id) {
  if (!sceneryById(id)) {
    console.warn(`no scenery ${id}; the variants are ${SCENERY_VARIANTS.map((variant) => variant.id).join(', ')}`);
    id = 'default';
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
  const chosen = sceneryInForce === 'default' ? sceneryForLook() : sceneryInForce;
  const parts = spec ? partsOf(sceneryById(chosen)) : [CURRENT];
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
  applyGround(view, place, group);
}

// ---- ground styles ---------------------------------------------------------
//
// A second axis, beside the scenery: how the ground near the fight is drawn.
// Every open-air place's own ground mesh is tagged userData.scenery = 'ground'
// in render.js. A style builds its group once per place (cached on the place
// group as userData.groundStyle) and, if hidesGround, hides the place's own
// ground meshes. 'default' is painted + living in the realistic looks and
// the place's own ground in the classic cartoon look. The fighting floor (PLACE_ARENAS) must stay flat at y = 0:
// the physics stands on it. Switched by __looks.ground(id).

/** What each place's ground is made of, for a style to draw in its own way. */
export const PLACE_GROUND = {
  meadow: { kind: 'grass', about: 'a village green in summer: grass, a worn track, wild flowers at the edges' },
  field: { kind: 'grass', about: 'open pasture churned by hooves down the middle' },
  plain: { kind: 'dry', about: 'the high plain of Mexico: dry bunch grass, volcanic grit and stones' },
  sengoku: { kind: 'trampled', about: 'autumn grass trampled to earth by armies, mud patches' },
  colosseum: { kind: 'arena-sand', about: 'raked arena sand (harena), footprints, a few dark stains' },
  town: { kind: 'cobbles', about: 'a market square of worn cobbles, mud and straw in the joints' },
  coastFort: { kind: 'beach', about: 'a tropical beach before a brick fort: dry sand, wet sand at the tide line, shells' },
  coastVillage: { kind: 'beach', about: 'a beach before a fishing village: sand, wet sand, nets, seaweed' },
  subway: { kind: 'subway', about: 'a New York subway platform: grimy concrete, gum, puddles under the leaks in the ceiling' },
  jiangnan: { kind: 'slabs', about: 'a water town square of granite slabs, grass and moss in the joints and at the edges, damp with the morning mist' },
  port: { kind: 'wet-concrete', about: 'a container quay at night in the rain: wet concrete, puddles reflecting the lamps, painted lines' },
};

const CURRENT_GROUND = { id: 'current', label: 'Current ground', hidesGround: false };
// The default: painted ground with the living layer on it in the realistic looks; the classic cartoon look keeps its flat painted ground.
const DEFAULT_GROUND = { id: 'default', label: 'Default for the look' };
const groundForLook = () => (activeLook().id === 'toon' ? 'current' : 'painted-living');
const GROUND_COMPOSITES = [
  { id: 'painted-living', label: 'Painted ground + living ground', parts: ['ground-painted', 'ground-living'] },
];
export const GROUND_STYLES = [DEFAULT_GROUND, CURRENT_GROUND, ...PAINTED_GROUND, ...LIVING_GROUND, ...GROUND_COMPOSITES];
let groundInForce = 'default';
export const groundById = (id) => GROUND_STYLES.find((style) => style.id === id);
export const activeGround = () => groundInForce;

/** Choose a ground style (it takes effect at the next applyScenery). */
export function setGround(id) {
  if (!groundById(id)) {
    console.warn(`no ground style ${id}; the styles are ${GROUND_STYLES.map((style) => style.id).join(', ')}`);
    id = 'default';
  }
  groundInForce = id;
  return id;
}

function applyGround(view, place, group) {
  const info = PLACE_GROUND[place];
  const chosen = info ? groundById(groundInForce === 'default' ? groundForLook() : groundInForce) : CURRENT_GROUND;
  // A composite style is a list of styles laid one on another (a surface, then life on it).
  const styles = chosen.parts ? chosen.parts.map(groundById) : [chosen];
  const wanted = new Set(styles.map((style) => style.id));
  for (const child of group.children) if (child.userData.groundStyle) child.visible = wanted.has(child.userData.groundStyle);
  const grounds = [];
  group.traverse((object) => {
    if (object.userData.scenery === 'ground') grounds.push(object);
  });
  if (styles.some((style) => style.hidesGround)) for (const ground of grounds) ground.visible = false;
  for (const style of styles) {
    if (!style.build) continue;
    const context = { place, view, kind: info.kind, about: info.about, arena: PLACE_ARENAS[place], grounds };
    let built = group.children.find((child) => child.userData.groundStyle === style.id);
    if (!built) {
      built = style.build({ ...context, rng: sceneryRandom(place, `ground:${style.id}`) });
      if (!built) continue;
      built.userData.groundStyle = style.id;
      group.add(built);
    }
    built.visible = true;
    style.apply?.({ ...context, group: built });
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
