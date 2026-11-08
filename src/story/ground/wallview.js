// Story mode's siege ladders drawn (story/ground/walls.js is what they are: a gap in a wall's line where the face is
// climbed). Each ladder leans from its foot out on the ground to the walk's edge, a little above it, where the physics
// stands it (physics/ladders.js ladderStance: a steep stair's slope, two men wide): two bamboo or pine rails, rungs lashed
// across them. Built into the fieldworks' group (worksview.js showWorks) from the arena's `works.ladders`.

/* global THREE */

import { LADDERS, ladderStance } from '../../physics/ladders.js';

export const LADDER_VIEW = {
  // The rails' and rungs' radius (m), a rung every `every` m up the rails (a stair's rise: ~0.3 m), the rails as far apart
  // as its two lanes and a hand's room outside each man (physics/ladders.js LADDERS.lanes, laneApart).
  rail: 0.05,
  rung: 0.028,
  every: 0.3,
  apart: LADDERS.lanes * LADDERS.laneApart,
  // How far (m) the rails stand up over the walk's edge: a ladder set to be stepped off, not climbed over.
  over: 0.6,
  wood: 0x8a7550,
};

/** One ladder: from its foot on the ground to the walk's edge, rails and rungs; its local +x toward the wall. */
function storyLadder(works, ladder) {
  const spec = LADDER_VIEW;
  const stance = ladderStance(works, ladder);
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: spec.wood, roughness: 0.85 });
  const length = Math.hypot(stance.footOut + stance.run, stance.height) + spec.over;
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(spec.rail, spec.rail, length, 6), material);
    rail.position.set(0, length / 2, side * spec.apart / 2);
    rail.castShadow = true;
    group.add(rail);
  }
  for (let up = spec.every; up < length - 0.1; up += spec.every) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(spec.rung, spec.rung, spec.apart, 5), material);
    rung.rotation.x = Math.PI / 2;
    rung.position.set(0, up, 0);
    group.add(rung);
  }
  // Turned to face its wall, then leaned toward it by its angle from the upright, its foot where it stands.
  group.rotation.y = Math.atan2(stance.out[1], -stance.out[0]);
  group.rotation.z = -Math.atan2(stance.footOut + stance.run, stance.height);
  group.position.set(stance.foot[0], stance.base, stance.foot[1]);
  return group;
}

/** The ladders of an arena's works (`works`: the arena's works as fieldworks.js worksOf has them), one group. */
export function storyLadders(works, ladders) {
  const group = new THREE.Group();
  group.name = 'story ladders';
  for (const ladder of ladders) group.add(storyLadder(works, ladder));
  return group;
}
