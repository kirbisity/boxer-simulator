// The guns on the page (physics/artillery.js) and the ladders as they stand or lie (physics/ladders.js): each gun a barrel
// on its mount, laid where the crew lays it and kicked back when it fires (its flash and its cloud of black-powder smoke:
// battlefx.js battleFxShot, three times over for a cannon's charge), its balls in the air, the blood where they strike; a
// ladder pushed off drawn going over and lying at the wall's foot, and stood again when raised. Kept light: plain shapes.

/* global THREE */

import { battleFxShot } from './battlefx.js';
import { spawnBlood, spawnSparks } from './weaponview.js';

export const ARTILLERY_VIEW = {
  // Colours: a bronze barrel (the folangji's, cast in bronze or copper: Mingshi 92 "以铜为之"), an iron one, the mount's wood.
  barrel: { folangji: 0x7a6236, dajiangjun: 0x3b3a38 },
  wood: 0x5e4528,
  ball: 0x1d1d1f,
  // A barrel's radius at the breech and the muzzle (m): the folangji ~10 and 6 cm; the great general ~16 and 11.
  radius: { folangji: [0.1, 0.06], dajiangjun: [0.16, 0.11] },
  // m it is drawn kicked back at the shot, coming forward again as the crew run it up (piece.recoil, 1 at the shot).
  kick: 0.4,
  // Balls drawn at most (a canister's hundreds are drawn by its first few).
  balls: 40,
  // How many clouds a cannon's charge makes (a matchlock's battleFxShot is one; the gun's charge is ten to fifty times its).
  puffs: 3,
};

/** One gun's mesh: its barrel along +x from its trunnions, on a trestle or a cart's bed. */
function gunMesh(kind, length) {
  const spec = ARTILLERY_VIEW;
  const group = new THREE.Group();
  const [breech, muzzle] = spec.radius[kind] ?? spec.radius.folangji;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(muzzle, breech, length, 10), new THREE.MeshStandardMaterial({ color: spec.barrel[kind] ?? spec.barrel.folangji, roughness: 0.45, metalness: 0.6 }));
  barrel.rotation.z = -Math.PI / 2;
  barrel.position.x = length * 0.15;
  barrel.castShadow = true;
  const laid = new THREE.Group();
  laid.add(barrel);
  group.add(laid);
  const wood = new THREE.MeshStandardMaterial({ color: spec.wood, roughness: 0.9 });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(length * 0.7, 0.12, breech * 3.2), wood);
  bed.castShadow = true;
  group.add(bed);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 0.08), wood);
    leg.position.set(0, -0.5, side * breech * 1.4);
    group.add(leg);
  }
  return { group, laid };
}

/** Each frame: the guns laid and kicked, the balls in the air, the ladders standing or lying. */
export function updateArtillery(view, world) {
  const state = view.artillery ?? (view.artillery = { world: null, guns: [], balls: [] });
  if (state.world !== world) {
    for (const gun of state.guns) view.scene.remove(gun.group);
    for (const ball of state.balls) view.scene.remove(ball);
    state.guns = (world?.artillery?.pieces ?? []).map((piece) => {
      const mesh = gunMesh(piece.kind, piece.spec.length);
      view.scene.add(mesh.group);
      return mesh;
    });
    state.balls = [];
    state.world = world;
  }
  const pieces = world?.artillery?.pieces ?? [];
  pieces.forEach((piece, index) => {
    const mesh = state.guns[index];
    const back = ARTILLERY_VIEW.kick * piece.recoil;
    mesh.group.position.set(piece.at[0] - Math.cos(piece.bearing) * back, (piece.ground ?? 0) + piece.spec.muzzleUp - 0.05, piece.at[1] - Math.sin(piece.bearing) * back);
    mesh.group.rotation.y = -piece.bearing;
    mesh.laid.rotation.z = piece.elevation;
  });
  const flying = (world?.artillery?.balls ?? []).filter((ball) => !ball.done).slice(0, ARTILLERY_VIEW.balls);
  while (state.balls.length < flying.length) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: ARTILLERY_VIEW.ball, roughness: 0.5, metalness: 0.5 }));
    view.scene.add(mesh);
    state.balls.push(mesh);
  }
  state.balls.forEach((mesh, index) => {
    const ball = flying[index];
    mesh.visible = Boolean(ball);
    if (!ball) return;
    mesh.position.set(ball.x[0], ball.x[1], ball.x[2]);
    mesh.scale.setScalar(ball.radius);
  });
  // The ladders (worksview.js built them standing, story/ground/wallview.js): over and lying as they go.
  const ladders = world?.siegeLadders;
  const drawn = view.works?.group.children.find((child) => child.name === 'story ladders');
  if (ladders && drawn) {
    ladders.forEach((ladder, index) => {
      const mesh = drawn.children[index];
      if (!mesh) return;
      mesh.userData.lean ??= mesh.rotation.z;
      // From its lean against the wall to lying out from it (a quarter turn past the upright, its foot where it stood: the
      // mesh is turned to face its wall, its local +x toward it, story/ground/wallview.js).
      const lying = Math.PI / 2 - 0.04;
      mesh.rotation.z = mesh.userData.lean + (lying - mesh.userData.lean) * ladder.tilt;
    });
  }
}

/** A gun gone off ('cannon'): the flash and the cloud at its muzzle, more of it for a cannon's charge than a hand gun's. */
export function artilleryFired(view, event) {
  for (let k = 0; k < ARTILLERY_VIEW.puffs; k += 1) battleFxShot(view, { from: event.point, dir: event.dir, powder: true, long: true, pan: null });
}

/** A ball in a man ('shot' with `gun`): his blood, as much as the energy it left in him; a stone face struck: sparks of grit. */
export function artilleryHit(view, event) {
  if (event.target === 'works') spawnSparks(view, event.point, 8, { flash: false });
  else spawnBlood(view, event.point, event.normal, Math.min(24, 6 + Math.round((event.deposited ?? 0) / 800)), 3);
}
