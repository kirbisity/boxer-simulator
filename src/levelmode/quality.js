// Quality tiers of a stage's picture: what is painted, and how finely, for a machine that can or cannot keep up. Pure data and decisions (no drawing):
// kit.js `setQuality` applies a tier to the castle, storm.js to the rain, main.js ties the choice to the adaptive resolution (adaptres.js) and to
// `boxer.quality('auto' | 'high' | 'low')`, remembered between visits.
//
// A tier is a set of reaches (metres: past it the thing is not drawn, or not shaded so finely, fading out over the last quarter where the shader does it) and
// of shares. `high` is the picture as designed. `medium` keeps the stone's look and drops what is hard to see at a glance: the reflection of the sky in the wet
// stone, the second read of the stone's map past ten metres, standing water and the soft edge of the shadow past eighteen, the drips, half the rain.
// `low` is the cheapest picture that is still the castle: no decals (wear and dirt), no ravens or drips or light shafts, no reflections, one read of the map,
// no macro map, a shadow of one tap per pixel, a quarter of the rain.

/** The tiers, worst picture last. */
export const QUALITY_TIERS = {
  high: {
    // Shader reaches (kittex.js ktLod), metres. The environment's reflection is the dearest term: the nearer walls only.
    env: 80, tile: 120, pool: 120, penumbra: 80, macro: 1, taps: 2,
    // The stone's relief (kittex.js: the chisel marks, pits and chips that catch the light): the farthest it is shaded (m), fading from half of it; 0: none.
    relief: 26,
    // Decals (kitwear.js: wear, dirt), drips, ravens, light shafts: the farthest each is drawn (m; 0: not at all).
    decals: 60, drips: 22, ravens: 40, shafts: 70,
    // The share of the rain drawn (storm.js).
    rain: 1,
    // How many real lights the torches, braziers and lanterns nearest him are given (kit.js; each is paid for by every lit pixel): the dark rooms are lit by these.
    lamps: 6,
    // The standing water (kitwater.js): its reflection of the room (0: none), how many rings it shows at once, the share of the splash drops thrown.
    waterReflect: 1, ripples: 24, waterDrops: 1,
  },
  medium: {
    env: 0, tile: 10, pool: 18, penumbra: 18, macro: 1, taps: 2,
    relief: 12,
    decals: 24, drips: 0, ravens: 20, shafts: 40,
    rain: 0.55,
    lamps: 4,
    waterReflect: 1, ripples: 16, waterDrops: 0.6,
  },
  low: {
    env: 0, tile: 0, pool: 0, penumbra: 0, macro: 0, taps: 1,
    relief: 0,
    decals: 0, drips: 0, ravens: 0, shafts: 0,
    rain: 0.25,
    lamps: 3,
    waterReflect: 0, ripples: 8, waterDrops: 0.3,
  },
};

/** The most real lights any tier gives the torches (kit.js builds this many). */
export const QUALITY_LAMPS_MOST = Math.max(...Object.values(QUALITY_TIERS).map((tier) => tier.lamps));

/** The tiers' names, best first. */
export const TIER_NAMES = ['high', 'medium', 'low'];

/** A tier by name (anything unknown is `high`). */
export const tierOf = (name) => QUALITY_TIERS[name] ?? QUALITY_TIERS.high;

/**
 * The ladder `auto` walks, best first: each rung a share of the screen's full pixel ratio and a tier. Pixels first (a step down is a quarter to half the fill and the
 * picture is the same picture, softer), then the tier at the same time as the next pixels, so a machine that is far behind gets both quickly.
 */
export const QUALITY_RUNGS = [
  { share: 1, tier: 'high' },
  { share: 0.75, tier: 'high' },
  { share: 0.75, tier: 'medium' },
  { share: 0.625, tier: 'medium' },
  { share: 0.5, tier: 'low' },
];

/**
 * The rungs for a screen whose full pixel ratio is `full`: ratios descending, none under `floor` (under 1 the picture turns to mush), and a rung that is the same ratio
 * and tier as the one before it left out. A 1x screen has no pixels to give, so its rungs are the tiers alone.
 */
export function rungsFor(full, floor = 1, rungs = QUALITY_RUNGS) {
  const out = [];
  for (const { share, tier } of rungs) {
    const ratio = Math.min(full, Math.max(floor, Math.round(full * share * 1000) / 1000));
    const last = out.at(-1);
    if (last && last.ratio === ratio && last.tier === tier) continue;
    out.push({ ratio, tier });
  }
  return out;
}

/** What `boxer.quality(mode)` accepts. */
export const QUALITY_MODES = ['auto', 'high', 'low'];

/** The rung a pinned mode stays on: `high` the first, `low` the last. */
export const pinnedRung = (mode, count) => (mode === 'low' ? count - 1 : 0);

export const QUALITY_KEY = 'gladiator.quality';

/** The mode remembered in `storage` (anything unknown, or nothing, is `auto`). Never throws: a private window has no storage. */
export function readQuality(storage) {
  try {
    const value = storage?.getItem(QUALITY_KEY);
    return QUALITY_MODES.includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

/** Remember a mode. */
export function writeQuality(storage, mode) {
  try {
    storage?.setItem(QUALITY_KEY, mode);
  } catch {
    // Nothing kept: the next visit starts on auto.
  }
}
