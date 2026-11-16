// The canal town's people drawn (townfolk.js): every one of them in two skinned meshes for the whole town, a near body
// and a far one (each a crowd man's baked body, crowdview.js: his clothes, head and hair in one skin), each with its
// ink, so a square of ten people costs a few draw calls whatever they do. Each person has his own bones in both;
// those of the body not shown, and all of someone who has gone indoors, are folded to a point. An open doorway (someone
// going in, or watching from it) is the room's dark drawn over the door's leaves: one instanced quad.

/* global THREE */

import { BONES, boneFrames, coherentFrames, frameMatrix } from './rig.js';
import { buildFighterView, disposeFighterView } from './render.js';
import { outlineFor, surface } from './toon.js';
import { CROWD_VIEW } from './crowdview.js';
import { pastLimit } from './crowdlod.js';
import { createTownfolk, recordTownfolk, townfolkFight, townfolkPoints, townfolkStep } from './townfolk.js';
import { canalTownDoors, canalTownPlan } from './places/canaltown.js';
import { activeLook } from './looks.js';

// The dark of a room seen through an open door (townkit/geo.js tkgBay's `dark`, the room behind a shopfront).
const FOLK_DOORWAY = 0x0d0b0a;

/** One merged skinned body of everyone (`part`: 'near' or 'far' of each crowd view), with its own bones and its ink. */
function folkMergedBody(bodies, part) {
  const sources = bodies.map((body) => body[part].mesh);
  const inks = bodies.map((body) => body[part].outline);
  const names = Object.keys(sources[0].geometry.attributes);
  const geometry = new THREE.BufferGeometry();
  const counts = sources.map((mesh) => mesh.geometry.attributes.position.count);
  const total = counts.reduce((a, b) => a + b, 0);
  for (const name of names) {
    const size = sources[0].geometry.attributes[name].itemSize;
    const array = new Float32Array(total * size);
    let at = 0;
    sources.forEach((mesh, person) => {
      const source = mesh.geometry.attributes[name].array;
      // (Each person's bones follow the last's: his skin indices moved on by as many.)
      if (name === 'skinIndex') for (let k = 0; k < source.length; k += 1) array[at + k] = source[k] + person * BONES.length;
      else array.set(source, at);
      at += source.length;
    });
    geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  const joinIndex = (meshes) => {
    const length = meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count, 0);
    const index = new Uint32Array(length);
    let at = 0;
    let base = 0;
    meshes.forEach((mesh, person) => {
      const source = mesh.geometry.index.array;
      for (let k = 0; k < source.length; k += 1) index[at + k] = source[k] + base;
      at += source.length;
      base += counts[person];
    });
    return new THREE.BufferAttribute(index, 1);
  };
  geometry.setIndex(joinIndex(sources));
  const bones = [];
  const inverses = [];
  sources.forEach((mesh) => {
    for (let bone = 0; bone < BONES.length; bone += 1) {
      const each = new THREE.Bone();
      each.matrixAutoUpdate = false;
      bones.push(each);
      inverses.push(mesh.skeleton.boneInverses[bone].clone());
    }
  });
  const skeleton = new THREE.Skeleton(bones, inverses);
  // (As a crowd man's own skin: render.js crowdView.)
  const mesh = new THREE.SkinnedMesh(geometry, surface(0xffffff, { skinning: true, vertexColors: true, roughness: 0.55 }));
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  const inkGeometry = new THREE.BufferGeometry();
  for (const name of names) inkGeometry.setAttribute(name, geometry.attributes[name]);
  inkGeometry.setIndex(joinIndex(inks));
  const ink = outlineFor({ isSkinnedMesh: true, geometry: inkGeometry, skeleton, bindMatrix: new THREE.Matrix4() });
  return { mesh, ink, bones, geometry, inkGeometry };
}

/** The town's people drawn in `view` (a scene view, render.js), from `town` (townfolk.js createTownfolk). */
export function buildTownfolkView(view, town) {
  const bodies = town.folk.map((one) => buildFighterView(view, one.clip.fighter, { simple: true }));
  const near = folkMergedBody(bodies, 'near');
  const far = folkMergedBody(bodies, 'far');
  for (const body of bodies) disposeFighterView(view, body);
  const doorway = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: FOLK_DOORWAY }), Math.max(1, town.doors.length));
  doorway.frustumCulled = false;
  doorway.count = 0;
  const group = new THREE.Group();
  group.name = 'townfolk';
  group.add(near.mesh, near.ink, far.mesh, far.ink, doorway);
  view.scene.add(group);
  const folded = new THREE.Matrix4();
  const place = new THREE.Matrix4();
  const fold = (bones, from, at) => {
    folded.makeScale(1e-4, 1e-4, 1e-4).setPosition(at[0], at[1], at[2]);
    for (let bone = 0; bone < BONES.length; bone += 1) bones[from + bone].matrixWorld.copy(folded);
  };
  const farNow = town.folk.map(() => false);
  return {
    group,
    /** Pose everyone where townfolk.js has them now, seen from `camera`. */
    update(camera) {
      const eye = camera.position;
      town.folk.forEach((one, person) => {
        const from = person * BONES.length;
        if (one.gone) {
          fold(near.bones, from, [one.at[0], -10, one.at[1]]);
          fold(far.bones, from, [one.at[0], -10, one.at[1]]);
          return;
        }
        const points = townfolkPoints(town, one);
        const frames = coherentFrames(boneFrames(points, one.clip.fighter.body), one.frames);
        one.frames = frames;
        farNow[person] = pastLimit(Math.hypot(points[8][0] - eye.x, points[8][1] - eye.y, points[8][2] - eye.z), farNow[person], CROWD_VIEW.lodDistance, CROWD_VIEW.lodMargin);
        const [shown, hidden] = farNow[person] ? [far, near] : [near, far];
        frames.forEach((frame, bone) => shown.bones[from + bone].matrixWorld.fromArray(frameMatrix(frame)));
        fold(hidden.bones, from, points[8]);
      });
      // The open doorways: the room's dark over the leaves, a little proud of them.
      let open = 0;
      for (const door of town.doors) {
        if (door.openUntil < town.time) continue;
        const yaw = Math.atan2(door.out[0], door.out[1]);
        const high = door.head - door.sill;
        place.makeRotationY(yaw).scale(new THREE.Vector3(door.wide, high, 1))
          .setPosition(door.at[0] - door.out[0] * (door.leaf - 0.02), door.sill + high / 2, door.at[1] - door.out[1] * (door.leaf - 0.02));
        doorway.setMatrixAt(open, place);
        open += 1;
      }
      doorway.count = open;
      doorway.instanceMatrix.needsUpdate = true;
    },
    /** Triangles and draws, for a measure. */
    cost() {
      const triangles = (geometry) => geometry.index.count / 3;
      return { people: town.folk.length, nearTriangles: triangles(near.geometry), farTriangles: triangles(far.geometry), meshes: 5 };
    },
    dispose() {
      view.scene.remove(group);
      for (const body of [near, far]) {
        body.geometry.dispose();
        body.inkGeometry.dispose();
        body.mesh.material.dispose();
        // (A look without ink gives every outline one shared, unseen material: toon.js hiddenOutline.)
        if (body.ink.material.visible) body.ink.material.dispose();
        body.mesh.skeleton.dispose();
      }
      doorway.geometry.dispose();
      doorway.material.dispose();
    },
  };
}

// ---- In the canal town ----------------------------------------------------------------------------------------------------

// The clips, recorded the first time the town is shown on this page (townfolk.js recordTownfolk: under a second).
let townfolkClips = null;

/** The town's people made afresh, as on an ordinary day. (Its ways are level at 0 wherever they walk: places/canaltown.js.) */
function townfolkMade() {
  townfolkClips ??= recordTownfolk();
  // (The houses about the square, to walk round on the way to a door.)
  const houses = canalTownPlan().houses.filter((house) => !house.far && Math.abs(house.at[0]) < 70 && Math.abs(house.at[1]) < 40);
  return createTownfolk(townfolkClips, { doors: canalTownDoors(), houses });
}

/** Let go of the town's people (`view.townfolk`): the next frame in the town makes them again, on an ordinary day. */
export function townfolkReset(view) {
  view.townfolk?.drawn.dispose();
  view.townfolk = null;
}

/**
 * Once a frame: in the canal town, its people stepped by `dt` s (a fight in `world` sends them in) and drawn; anywhere
 * else, none.
 */
export function townfolkFrame(view, world, dt) {
  if (view.place !== 'canaltown' || !world) {
    if (view.townfolk) townfolkReset(view);
    return;
  }
  const look = activeLook().id;
  if (!view.townfolk || view.townfolk.look !== look) {
    const town = view.townfolk?.town ?? townfolkMade();
    view.townfolk?.drawn.dispose();
    view.townfolk = { town, drawn: buildTownfolkView(view, town), look };
  }
  townfolkStep(view.townfolk.town, dt, townfolkFight(world.fighters));
  view.townfolk.drawn.update(view.camera);
}

/** What the town's people are doing (tests, measures): each one's who, where, and whether gone in or watching. */
export function townfolkInfo(view) {
  const town = view.townfolk?.town;
  if (!town) return null;
  return {
    time: town.time, fight: town.fight?.at ?? null, cost: view.townfolk.drawn.cost(),
    folk: town.folk.map((one) => ({ who: one.person.who, at: one.at.map((v) => +v.toFixed(2)), gone: one.gone, watching: one.watching, exit: one.exit, walking: +one.mix.toFixed(2) })),
    open: town.doors.filter((door) => door.openUntil >= town.time).length,
  };
}
