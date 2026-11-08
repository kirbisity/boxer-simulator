// Story mode, his place in the line shown on the field: a ring on the ground at his slot in his side's colour (it moves as the
// line moves: runner.js storyPlaceOf), and while he is out of it a faint arrow on the ground from him to it. The HUD says
// which way and how long he has (storyview.js); this is where. Light: one ring and one arrow, made once, their vertices
// moved each frame; drawn over the men round it (no depth test), so the place is found in a crowded column.

/* global THREE */

import { P } from '../body.js';
import { GENERAL_MARK } from '../generalmark.js';
import { reliefAt, worksOf } from '../physics/fieldworks.js';

export const STORY_PLACE_MARK = {
  // m: the ring's radii (a man's stance across, inside the 1.3 m between files: it reads as one man's place, not two).
  ring: [0.42, 0.55],
  // m over the ground (clear of its own surface on a grade), and the arrow's half-width and head's length.
  lift: 0.04,
  half: 0.07,
  head: 0.45,
  // The arrow stops this short (m) of the ring's middle: it points at the ring, not through it.
  short: 0.6,
  opacity: { ring: 0.75, arrow: 0.45 },
  // Each side's colour (the general's mark's: generalmark.js).
  colour: GENERAL_MARK.colour,
};

/** The mark, in the view's scene: `update(world, mark)` each frame; `mark` from the story page (storyview.js placeMark), or null. */
export function createStoryPlaceMark(view) {
  const material = (opacity) => new THREE.MeshBasicMaterial({ transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(...STORY_PLACE_MARK.ring, 40), material(STORY_PLACE_MARK.opacity.ring));
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 5;
  ring.visible = false;
  ring.name = 'story-place';
  // The arrow: a shaft (two triangles) and a head (one), its vertices set in world space each frame.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(7 * 3), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6]);
  const arrow = new THREE.Mesh(geometry, material(STORY_PLACE_MARK.opacity.arrow));
  arrow.renderOrder = 5;
  arrow.visible = false;
  arrow.frustumCulled = false;
  arrow.name = 'story-place-arrow';
  view.scene.add(ring, arrow);
  const ground = (works, x, z) => (works ? reliefAt(works, x, z) : 0) + STORY_PLACE_MARK.lift;

  return {
    update(world, mark) {
      ring.visible = Boolean(world && mark);
      arrow.visible = false;
      if (!ring.visible) return;
      const works = worksOf(world.arena);
      const [px, pz] = mark.place;
      const colour = STORY_PLACE_MARK.colour[mark.corner] ?? STORY_PLACE_MARK.colour.red;
      ring.material.color.set(colour);
      ring.position.set(px, ground(works, px, pz), pz);
      if (!mark.away) return;
      const { hero } = mark;
      const from = [hero.x[P.pelvis * 3], hero.x[P.pelvis * 3 + 2]];
      const way = [px - from[0], pz - from[1]];
      const length = Math.hypot(way[0], way[1]) - STORY_PLACE_MARK.short;
      if (length <= STORY_PLACE_MARK.head) return;
      const along = [way[0] / (length + STORY_PLACE_MARK.short), way[1] / (length + STORY_PLACE_MARK.short)];
      const across = [-along[1], along[0]];
      const point = (back, side) => {
        const x = from[0] + along[0] * back + across[0] * side;
        const z = from[1] + along[1] * back + across[1] * side;
        // (From him on the walk or a ladder, his own height; the rest on the ground under it.)
        return [x, back === 0 ? (hero.lift ?? 0) + STORY_PLACE_MARK.lift : ground(works, x, z), z];
      };
      const neck = length - STORY_PLACE_MARK.head;
      const { half } = STORY_PLACE_MARK;
      const corners = [point(0, -half), point(0, half), point(neck, half), point(neck, -half), point(neck, -half * 3), point(neck, half * 3), point(length, 0)];
      const position = geometry.attributes.position;
      corners.forEach(([x, y, z], index) => position.setXYZ(index, x, y, z));
      position.needsUpdate = true;
      arrow.material.color.set(colour);
      arrow.visible = true;
    },
  };
}
