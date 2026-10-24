// The camera's arm (cameraarm.js) in the page: whatever a frame's camera is (the follow camera's orbit, the watching camera's, a
// cutscene's), placed where it is wanted, it is then kept clear of the scenery by pulling it in along its line, round the corner,
// or up and over, never by making the scenery see-through. Which scenery is the place's:
//
//  - a Level Mode stage: its terrain, the very solids the player's body collides with (physics/terrain.js: walls, roofs and
//    ceilings, floors, flights, the gates and doors in force), swept exactly;
//  - any other place (the battle maps, the sandbox's): the place's meshes, taken once as voxels and posts (occluders.js), a few
//    milliseconds of each frame until it is done;
//  - and the rooms some places keep the camera inside (the Colosseum's oval, the subway's wall: followcam.js cameraRoom).
//
// A design sheet's camera is the sheet's own: not touched.

import { createArm, joinWorlds, roomWorld } from './cameraarm.js';
import { terrainWorld } from './physics/terrain.js';
import { voxelsOfPlace } from './occluders.js';

/** ms of a frame given to taking a place's scenery into voxels, until it is taken. */
const TAKE_MS = 3;
/** m: a look point further than this from where it was a frame before has been put somewhere (no man moves 2 m in a frame). */
const CUT = 2;

export function createCameraRig() {
  const arm = createArm();
  const taken = new Map();
  const rig = { cost: 0, frames: 0, last: null, place: null };
  let lastPlace = null;
  let lastAt = null;

  /** The world of a place's scenery (its voxels, taken a slice a frame); null while nothing of it is taken. */
  function sceneryWorld(view) {
    const place = view.places?.[view.place] ?? null;
    if (!place) return null;
    if (!taken.has(place)) taken.set(place, voxelsOfPlace(place));
    const voxels = taken.get(place);
    if (!voxels.done) voxels.step(TAKE_MS);
    return voxels.world;
  }

  /**
   * Place the arm's camera: `view` { camera, orbit, places, place } with the camera at the orbit's wanted place (render.js
   * placeCamera); `terrain` the stage's (or null), `room` a test of where the camera may stand (or null), `subject` [x, y, z] the man the arm
   * is kept clear from (his chest; null: what the camera looks at), `free`: the viewer has the view in hand (the arm only shortens), `dt` the
   * frame's s. Moves view.camera; returns the arm's answer.
   */
  function update(view, { terrain = null, room = null, subject = null, free = false, dt = 1 / 60 } = {}) {
    const started = performance.now();
    const orbit = view.orbit;
    // A cut: another place, or a look point that jumped (a man put somewhere new, a respawn): the arm starts where it should be, not where it was.
    // (A new terrain of the same stage, as its sections swap, is no cut.)
    const jumped = lastAt && Math.hypot(orbit.target.x - lastAt[0], orbit.target.y - lastAt[1], orbit.target.z - lastAt[2]) > CUT;
    if (view.place !== lastPlace || jumped) arm.reset();
    lastPlace = view.place;
    lastAt = [orbit.target.x, orbit.target.y, orbit.target.z];
    const world = joinWorlds(terrain ? terrainWorld(terrain) : sceneryWorld(view), room ? roomWorld(room) : null);
    const answer = arm.solve({ target: [orbit.target.x, orbit.target.y, orbit.target.z], subject, yaw: orbit.yaw, pitch: orbit.pitch, distance: orbit.distance }, world, dt, { free });
    view.camera.position.set(answer.position[0], answer.position[1], answer.position[2]);
    view.camera.lookAt(orbit.target);
    rig.cost += (performance.now() - started - rig.cost) * 0.05;
    rig.frames += 1;
    rig.last = answer;
    return answer;
  }

  /** The scenery was swapped (scenerylod.js) or the place rebuilt: taken again when next needed. */
  function forget() {
    taken.clear();
  }

  /** The next frame cuts: the arm starts where it should be, not from where it was. */
  function reset() {
    arm.reset();
  }

  /** What the rig is doing, for the console and tests: the arm's last answer, its cost (ms a frame, averaged), and how much of the place is taken. */
  function stats(view) {
    const place = view?.places?.[view.place];
    const voxels = place ? taken.get(place) : null;
    return { last: rig.last, ms: rig.cost, frames: rig.frames, taken: voxels ? { done: voxels.done, voxels: voxels.voxels.occupied, posts: voxels.voxels.posts, triangles: voxels.triangles, ms: voxels.ms } : null };
  }

  return { update, forget, reset, stats, arm };
}
