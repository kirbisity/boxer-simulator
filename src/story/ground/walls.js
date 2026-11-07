// Story mode's walls to storm: a town's or a castle's wall as the battle-map fieldworks already know them
// (physics/fieldworks.js: a ditch's `profile` is the ground's height across a line, a stone wall's line keeps every
// man's parts out of it, a gap in it is open). Nothing new in the physics: the smallest honest wall the bodies can be
// made to climb.
//
//  - The wall's mass: a rampart along the line (a ditch whose profile only rises), its outer face sheer, its top the
//    wall-walk the defenders stand on, its inner side a ramp down into the town (the mounting ramps of a Korean or
//    Chinese city wall; a Japanese castle's inner terraces).
//  - The face: a stone wall line along the rampart's outer foot, as high as the walk and its parapet. Nobody walks
//    through it; a man coming at it is turned along it (fieldworks.js stepOnWorks), toward the nearer of its gaps.
//  - Ladders: the gaps in that line, each a ladder's width, where the face is climbed. The climbing is the ditch's slope
//    rule (FIELDWORKS.climb: a man is slowed to 1 / (1 + 2 × grade) of his pace), which over a sheer face comes to
//    about half his walking pace upward, ~0.6 m/s with his weapon in hand (a fireman on a ladder climbs ~0.5 m/s).
//    The face's run (STORY_WALL.face) is kept under the distance a wall's line holds a man's stance off it
//    (FIELDWORKS.wall.root, 0.32 m): a man on the face is at a gap, or has come up onto the walk; he cannot walk along
//    the face. A defender's spear reaches over the parapet (weapons are not kept out by a wall's line).
//
//  - Cover: the face and its parapet are stone (physics/cover.js: `cover` masonry, STORY_WALL.thick): a ball or an arrow
//    crossing the wall's line below the parapet's top goes into the stone, and in a ladder's gap below the walk (`solid`:
//    the face is there, only the crenel above it is open). A man on the walk shows his head over the parapet; one at the
//    wall's foot is under it, out of the defenders' shot (who had to lean out over it to reach him).
//  - The ladders are objects (physics/ladders.js): one whose head no attacker holds is pushed off by a defender at it,
//    if he can shift its load, and lies until the attackers at its foot raise it again.
//  - The AI counts the wall (ai.js through physics/cover.js exposureOf): how much of a man the enemy's missiles and blades
//    can get at from where they stand is what of their strength he weighs.
//
// What it leaves out (a full siege would need): one man to a rung (here as many as press into the gap's width), the
// climber's hands taken by the ladder (here he fights as he climbs, as fast as his stance rises), stones and boiling
// water dropped from the top, a gate to batter, a breach's rubble, the parapet's crenels and loopholes (here a defender
// shoots over it), and the stone knocked away by the guns.

import { FIELDWORKS } from '../../physics/fieldworks.js';

/** A wall's numbers, each against what it is set by. */
export const STORY_WALL = {
  // The outer face's run (m) from its foot to the walk's edge: sheer stone; under the 0.32 m a wall's line holds a man's
  // stance off it (FIELDWORKS.wall.root), so the face is stood on only in a ladder's gap.
  face: Math.min(0.3, FIELDWORKS.wall.root - 0.02),
  // The parapet over the walk (m): crenels at a man's chest, ~1-1.2 m (the merlons of the Last Gate's wall: worksview.js stone).
  parapet: 1.1,
  // A ladder's width (m): a scaling ladder for one man abreast, ~0.6 m between its rails; the gap a little wider so a body passes.
  ladder: 1.1,
  // The walk's width (m) on top: a Joseon town wall's ~3-4 m; a Japanese castle's wall-top narrower (its battle gives its own).
  walk: 3.5,
  // The parapet's thickness (m) against shot (physics/cover.js masonry): a Korean town wall's stone parapet (yeojang) ~0.5-1 m,
  // the thinner end (not measured in the sources checked).
  thick: 0.6,
  // The inner ramp's run (m) per m of height: a mounting ramp of ~1 in 2.
  innerRun: 2,
};

/**
 * The works of a wall along z at `x` (its outer foot), facing -x (the attackers come from -x), from `z[0]` to `z[1]`:
 * `height` m from its foot to the walk (its foot `base` m up: a castle on a hill, the slope to it its own relief),
 * `ladders` the z of each ladder. Returns `works` ({ ditches, walls, ladders }, for an arena's `works`; merge with
 * others: mergeWorks) and `walk` [x0, x1], the walk's span in x.
 */
export function wallWorks({ x, z, height, base = 0, ladders = [], walk = STORY_WALL.walk, parapet = STORY_WALL.parapet, inner = STORY_WALL.innerRun, kind = 'stone' }) {
  const run = STORY_WALL.face;
  const top = base + height;
  // The ditch's line runs along +z: its left (+offset) is +x, the defenders' side.
  const rampart = { from: [x, z[0]], to: [x, z[1]], profile: [[0, base], [run, top], [run + walk, top], [run + walk + top * inner, 0]] };
  const gaps = ladders.map((at) => [at - STORY_WALL.ladder / 2 - z[0], at + STORY_WALL.ladder / 2 - z[0]]).sort((a, b) => a[0] - b[0]);
  const cover = { material: 'masonry', thick: STORY_WALL.thick };
  // Against a missile: the face's stone to the walk (in a ladder's gap too), and the parapet on the walk's outer edge over it,
  // open only at the ladders' heads (the crenel each is set to: above the walk, open).
  const face = { points: [[x, z[0]], [x, z[1]]], height: top + parapet, kind, gaps, cover, solid: top, screenHeight: top };
  const parapetLine = { points: [[x + run, z[0]], [x + run, z[1]]], height: top + parapet, kind, gaps, cover, solid: top, screen: true };
  return {
    works: { ditches: [rampart], walls: [face, parapetLine], ladders: ladders.map((at) => ({ x, z: at, height, base, run })) },
    walk: [x + run, x + run + walk],
  };
}

/** Several works as one arena's `works` (each a { ditches, walls, stakes, soft, ladders } of its own). */
export function mergeWorks(...parts) {
  const merged = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (!Array.isArray(value)) continue;
      merged[key] = [...(merged[key] ?? []), ...value];
    }
  }
  return merged;
}
