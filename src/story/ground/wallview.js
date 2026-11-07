// Story mode's siege ladders drawn (story/ground/walls.js is what they are: a gap in a wall's line where the face is
// climbed). Each ladder leans from its foot at the wall's foot to the walk's edge, a little above it, as a scaling
// ladder was set: two bamboo or pine rails, rungs lashed across them. Built into the fieldworks' group (worksview.js
// showWorks) from the arena's `works.ladders`.

/* global THREE */

export const LADDER_VIEW = {
  // The rails' and rungs' radius (m), a rung every `every` m up the rails, the rails `apart` m between them (one man abreast).
  rail: 0.045,
  rung: 0.025,
  every: 0.32,
  apart: 0.55,
  // How far (m) the rails stand up over the walk's edge: a ladder set to be stepped off, not climbed over.
  over: 0.6,
  wood: 0x8a7550,
};

/** One ladder: from its foot (x, base, z) to the walk's edge (x + run, base + height, z), rails and rungs. */
function storyLadder({ x, z, height, base = 0, run }) {
  const spec = LADDER_VIEW;
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: spec.wood, roughness: 0.85 });
  const length = Math.hypot(run, height) + spec.over;
  const lean = Math.atan2(run, height);
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
  // Leaned toward the wall (+x) by its angle from the upright, its foot at the wall's foot.
  group.rotation.z = -lean;
  group.position.set(x, base, z);
  return group;
}

/** The ladders of an arena's works, one group. */
export function storyLadders(ladders) {
  const group = new THREE.Group();
  group.name = 'story ladders';
  for (const ladder of ladders) group.add(storyLadder(ladder));
  return group;
}
