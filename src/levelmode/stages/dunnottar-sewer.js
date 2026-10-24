// Stage 1, Dunnottar: the way round the guarded front gate. A sea cave at the foot of the gorge shelf (its mouth, the stair down to it and the lantern
// at it are the cliff path's: `buildSeaCave`) and the Old Drain that leads from it (section `sewer`): a grotto the tide still reaches, a long drain, a
// flooded cistern on a causeway, more drain climbing in two stairs under the mainland's hill and the headland's rock, the cesspool under the inner cell, and at
// the end a low door into the crypt's sea-gate chamber (the crypt's `buildCrypt` has the door). From the sea-gate the stair behind the heavy door (lifted by the
// hidden lever) comes up into the vault's torture chamber: the way into the dungeon level that never goes near the gatehouse. It is dark, wet, rotten and long
// (about 150 m of passage), slimed green-black, the sewage of the castle standing in it, rubbish and the dead washed against its walls; not a place to rest in
// but for one smugglers' brazier. No garrison comes down here: no soldier, no prisoner, nobody, but the one thing that lives in the cesspool, Noname, in a
// gladiator's smooth helmet with a long sword, who waits in the sludge and fights to the death.
//
//   sewer  (y -5 .. 1.4)  x -56..0, z -52..56 (it runs under the shelf, the mainland and the rock of the headland: nothing else is there)
//     the grotto           x -55..-42, z 44..54.8, floor -5   (tide pools, a dead man's kegs; the mouth in the cliff face at z 55.4)
//     the first drain      x -50.2..-46.8, z 22..44           (a wet barrel-vaulted passage, 3.4 m wide)
//     the cistern          x -55..-42, z 4..22                (a hall of eight pillars flooded with sewage, the causeway down its middle, the bed 0.4 lower)
//     the second drain     x -50.2..-46.8, z -35..3           (a stair of 17 treads up to y -1.6 at z -7..-13.8)
//     the long drain       x -52.8..-45.6, z -39.6..-36.2     (the pocket where it turns east: the smugglers' brazier, the way's one rest)
//     the cesspool         centre (-36, -37.9), DN_CESSPOOL   (an eight-sided sump hall 17.2 m across under the inner cell: a pit of sludge 13.6 m across,
//                                                             thigh-deep, a rim walk round it, ramps down into it on the drain's line and north and south,
//                                                             outfalls pouring into it, a dead-end alcove north; Noname on the low island in the middle)
//     the long drain, east x -26.4..-13, z -39.6..-36.2      and a stair of 15 treads up to y 1.4
//     the low door         x -7..0                            (into the crypt's sea-gate chamber at x 0)
//
// For the plot twist (the garderobe chute from the inner cell drops the player into the cesspool) and anything else that wants them: `DN_CESSPOOL` (where the pit
// is: its centre at the sludge's surface, the pit's and the hall's radii, the bed's and the rim's levels), `DN_CESSPOOL_REGION` (the arena: the stage's named
// region `stage.regions.cesspool`, a box over the pit) and `DN_NONAME_SPAWN` ('noname': the spawn id of the one man here).
//
// A section's `decor` is for the drawing only (levelmode/kit.js); the solids carry a `style`.

import { rampOf, slabOf } from '../../physics/terrain.js';
import { DN_FACE, Y, dnBounds, dnBox, dnCeiling, dnFence, dnFlight, dnFlightVault, dnFlightWalls, dnItem, dnProp, dnRoom, dnRun, dnSection, dnSlab, dnSpawn } from './dnbuild.js';

/** The levels (y) of the old drain and the line it runs on (x): the cave, the cistern and the first drains at `floor`; the long drain at `drain`; the crypt's at Y.crypt. */
export const DN_CAVE = { floor: -5, drain: -1.6, x: -48.5, mouth: 3.4, face: 55.4 };
/** The stair down the cliff's face to the sea cave: x of its foot at the quay and of its head on the shelf, beside the drawbridge's head. */
export const DN_CAVE_STAIR = { foot: -39.6, head: -29.6 };

/**
 * The cesspool: `at` its centre [x, y, z] (y: the sludge's surface), `radius` the pit's (the apothem of its eight sides: the arena), `hall` the hall's inside
 * (the rim walk runs from `radius` to `hall`), `floor` the bed under the sludge (y), `rim` the walk's level (y, the long drain's floor), `depth` the sludge over the
 * bed, `island` the low stone platform in the middle where Noname waits ({ at: [x, z], size, top }: its top a hand under the sludge, so a man lying dead on it
 * has his face out of it). Directly under the inner cell (x -44.4..-35.2, z -41.2..-30.8): a man dropped down its garderobe lands in the pit.
 */
export const DN_CESSPOOL = { at: [-36, -1.86, -37.9], radius: 6.8, hall: 8.6, floor: -2.35, rim: -1.6, depth: 0.49, island: { at: [-35.2, -37.9], size: 3.2, top: -1.93 } };
/** The cesspool's arena as a stage region (x, z box, y range): `stage.regions.cesspool`. */
export const DN_CESSPOOL_REGION = { at: [DN_CESSPOOL.at[0], DN_CESSPOOL.at[2]], size: [DN_CESSPOOL.radius * 2, DN_CESSPOOL.radius * 2], y: [DN_CESSPOOL.floor - 0.5, DN_CESSPOOL.rim + 4] };
/** The one man in the drain: his spawn id. */
export const DN_NONAME_SPAWN = 'noname';

/** The drain's clear width (m) and the head room under its roof. */
const SW_WIDE = 3.4;
const SW_HEAD = 3.2;
/** Where the sea-gate chamber's low door stands (z) and how wide it is: the crypt builds it (buildCrypt), the drain's last stretch runs to it. */
export const DN_SEAGATE_DOOR = { z: -37.9, width: 2.8 };

// ---- The sea cave's mouth, on the cliff path ----------------------------------------------------------------

/**
 * The sea cave's mouth and what leads to it, added to the cliff path's section: a stair down the cliff's face from the shelf's edge to a landing at the
 * waterline, a mouth in the rock face under the shelf (the plate over it is the shelf's: `faceless`, so the face drawn is this one), a lantern and a
 * brazier at it, a worn trail of way-marks from the gorge brazier to the stair head and a note on a keg there.
 */
export function buildSeaCave(sec) {
  const F = DN_CAVE.floor;
  const X = DN_CAVE.x;
  const S = DN_CAVE_STAIR;
  const mouth = [X - DN_CAVE.mouth / 2, X + DN_CAVE.mouth / 2];
  // The stair: 25 treads of 0.2 along the cliff, from the quay at the waterline in the west up to the shelf's level at its east end (by the
  // ravine and the drawbridge's head: the way round starts beside the way through), 3.2 wide, hung on the face.
  const stair = dnFlight(sec, { foot: [S.foot, 57.6], dir: 'E', steps: 25, tread: 0.4, width: 3.2, from: F, rise: 0.2, style: 'rock' });
  // (A stepped mass of rock under it, down to the sea, a hand's breadth below the treads: the stair is cut into the cliff's foot, not hung from it.)
  for (let x = S.foot; x < S.head - 1e-6; x += 2) dnBox(sec, x, x + 2, 56, 59.2, Y.sea - 1, stair.treadY(Math.round((x - S.foot) / 0.4)) - 0.25, 'rock');
  // The quay at the waterline, from the cave's mouth along the cliff's foot to the stair's foot, the new part on its own rock.
  dnSlab(sec, -52.6, S.foot, 56, 59.5, F, 'flags');
  dnBox(sec, -46, S.foot, 56, 59.5, Y.sea - 1, F - 0.25, 'rock');
  // (And a landing at its head, a jetty of the shelf's rock 3.4 m long on the sea's side of the shelf's edge, with its mass under it.)
  dnSlab(sec, S.head, S.head + 3.4, 56, 59.5, Y.gorge, 'rock');
  dnBox(sec, S.head, S.head + 3.4, 56, 59.5, Y.sea - 1, Y.gorge - 0.25, 'rock');
  dnFence(sec, [[S.head + 3.45, 56.2, Y.gorge], [S.head + 3.45, 59.55, Y.gorge], [S.head, 59.55, Y.gorge], [S.foot, 59.55, F], [-52.65, 59.55, F], [-52.65, 56.2, F]]);
  // The rock face under the shelf's plate, with the cave's mouth in it: the sea's face of the cliff, from the waterline up to the plate.
  dnRun(sec, [-56, DN_CAVE.face], [-41, DN_CAVE.face], 1.2, Y.sea - 0.5, F + 3.6, 'rock', [{ at: X + 56, width: DN_CAVE.mouth, sill: F, top: F + 3.2, shape: 'round' }]);
  // Light and the signs of use: a lantern on a post and a brazier on the quay, kegs, a dead man's bones; a trail down the stair; at the head a lit
  // brazier, a lantern, a sign pointing down and the note: lit and marked, so that from the drawbridge's head it is the plain way to go.
  dnProp(sec, 'lantern', [mouth[0] - 0.9, F, 56.6], { yaw: 0 });
  dnProp(sec, 'brazier', [-50.4, F, 58.6], { lit: true });
  dnProp(sec, 'barrel', [-52.0, F, 57.2], { yaw: 0.4 });
  dnProp(sec, 'barrel', [-51.8, F, 59.0], { yaw: 1.1, tipped: true });
  dnProp(sec, 'bones', [-46.8, F, 58.8], { yaw: 0.5 });
  dnProp(sec, 'lantern', [-43.2, F, 59.0], { yaw: Math.PI / 2 });
  dnProp(sec, 'brazier', [S.head - 1.4, Y.gorge, 53.6], { lit: true });
  dnProp(sec, 'barrel', [S.head + 2.6, Y.gorge, 54.4], { yaw: 0.2 });
  dnProp(sec, 'lantern', [S.head + 3.0, Y.gorge, 58.9], { yaw: Math.PI });
  dnProp(sec, 'sign', [S.head + 2.9, Y.gorge, 55.4], { yaw: Math.PI });
  sec.decor.push({ kind: 'waymarks', points: [[-46, 45.6, Y.gorge], [-40, 48.6, Y.gorge], [-34, 51.6, Y.gorge], [S.head + 1.2, 54.6, Y.gorge], [S.head + 1.7, 56.6, Y.gorge]], gap: 1.8, first: 0.8, size: 1.25 });
  sec.decor.push({ kind: 'waymarks', points: [[S.head + 1.7, 57.8, Y.gorge], [S.head - 0.4, 57.6, -0.4], [S.foot + 0.4, 57.6, F + 0.2], [-48.2, 57.6, F]], gap: 2.0, first: 0.6 });
  dnItem(sec, 'note-drain', 'note', [S.head + 2.6, Y.gorge, 54.4], { note: 'drain', lift: 0.95 });
}

// ---- The old drain --------------------------------------------------------------------------------------------

/** A straight drain: a walled, vaulted, roofed passage (`o` as dnRoom's), in the drain's own rubble. */
function swDrain(sec, o) {
  dnRoom(sec, { head: SW_HEAD, thick: 1, style: 'rubble', vault: { crown: 0.9, ribs: 3.3 }, ...o });
}

export function buildSewer() {
  const sec = dnSection('sewer', 'The Old Drain');
  // Under the mainland and the headland: drawn in detail only while he is in it (or at its mouth, or at its door), never as seen from the shelf.
  sec.activeOnly = true;
  // Its walls run with filth (levelmode/kitwear.js: green-black streaks, mould, salt, a slime line).
  sec.filth = 1;
  const F = DN_CAVE.floor;
  const D = DN_CAVE.drain;
  const C = Y.crypt;
  const X = DN_CAVE.x;
  const P = DN_CESSPOOL;
  const [px, , pz] = P.at;
  const west = X - SW_WIDE / 2;
  const east = X + SW_WIDE / 2;
  // (Heights: below the shelf and the hillside, whose sections are the cliff path's, up to a man's hips on the stairs and the last stretch.)
  const low = [-6.5, -1.5];
  const mid = [-6.5, 0.2];
  const high = [-6.5, 3];
  const hallOut = P.hall + 1;
  const alcove = { x0: px - 1.8, x1: px + 1.8, z0: pz - hallOut - 3.8, z1: pz - hallOut };
  dnBounds(sec,
    { at: [X, 49.7], size: [15, 12.6], y: low },
    { at: [X, 33], size: [5.4, 23], y: low },
    { at: [X, 13], size: [15, 19], y: low },
    { at: [X, -2], size: [5.4, 14], y: low },
    { at: [X, -11.2], size: [5.4, 8.4], y: mid },
    { at: [X, -25.6], size: [5.4, 22.4], y: mid },
    { at: [-25.9, -37.9], size: [53.2, 5.4], y: high },
    // The cesspool's hall and its alcove, taller than the drain.
    { at: [px, pz], size: [hallOut * 2 + 0.4, hallOut * 2 + 0.4], y: [-6.5, P.rim + 6.6] },
    { at: [px, (alcove.z0 + alcove.z1) / 2], size: [alcove.x1 - alcove.x0 + 2, alcove.z1 - alcove.z0 + 1.2], y: [-6.5, P.rim + 5] });
  // The mouth: standing in the grotto's south end or at the landing makes the cliff path's section (its plate and its face) active too, and the other way about.
  sec.portals.push({ to: 'cliff', area: { at: [X, 58], size: [15, 7], y: [-6.5, 0.5] } });
  // The low door: the crypt's sea-gate chamber is active from the drain's last stretch, and the drain from the chamber's west end.
  sec.portals.push({ to: 'crypt', area: { at: [-4.4, -37.9], size: [8.8, 4], y: [-1, 5] } });

  // The grotto: a sea cave the tide still reaches at the top of a spring, floored with the rock, its roof low and ragged. The mouth is in its south face (the cliff path's).
  swDrain(sec, {
    x0: -55, x1: -42, z0: 44, z1: 54.8, floor: F, style: 'rock', floorStyle: 'rock', walls: ['n', 'w', 'e'], doors: { n: [{ at: X, width: SW_WIDE, top: F + 3 }] }, vault: { crown: 1.5, ribs: 0 },
  });
  sec.decor.push({ kind: 'outcrop', lumps: [{ at: [-53.2, F - 0.5, 52.6], r: [1.3, 1.5, 1.2], seed: 3 }, { at: [-43.8, F - 0.5, 51], r: [1.0, 1.1, 1.4], seed: 5 }, { at: [-52.4, F - 0.5, 46], r: [1.1, 1.3, 1.0], seed: 8 }] });
  for (const [x, z] of [[-52.4, 51.2], [-44.6, 52.8], [-50.2, 47.4], [-46.2, 46.4]]) dnProp(sec, 'puddle', [x, F + 0.02, z], { radius: 1.3 });
  dnProp(sec, 'planks', [-52.2, F, 53.6], { yaw: 0.8 });
  dnProp(sec, 'rubbleheap', [-44, F, 47.2], { size: 0.8 });
  dnProp(sec, 'barrel', [-53.6, F, 48.4], { yaw: 0.2 });
  dnProp(sec, 'barrel', [-53.4, F, 49.6], { yaw: 1.2 });
  dnProp(sec, 'sack', [-52.8, F, 47.4], {});
  dnProp(sec, 'bones', [-47.2, F, 52.6], { yaw: 2.2 });
  dnProp(sec, 'torch', [-42.1, F + 2.2, 47.8], { face: 'W' });
  dnProp(sec, 'drip', [-49.2, F + 3.0, 50], {});
  dnProp(sec, 'drip', [-45.6, F + 3.0, 46.6], {});
  // (The first of the filth the tide brings in and the drain sends out: rags and rubbish against the rock, a dead rat, a slime trail into the drain.)
  dnProp(sec, 'rubbish', [-54, F, 51.4], { yaw: 0.3, size: 0.9 });
  dnProp(sec, 'rags', [-50.4, F, 45.4], { yaw: 1.1 });
  dnProp(sec, 'rat', [-46.4, F, 49.2], { yaw: 2.4 });
  dnProp(sec, 'slime', [-48.5, F + 0.01, 45.2], { yaw: 0.2, size: 1.1 });
  dnProp(sec, 'flies', [-47.2, F + 0.5, 52.6], { count: 8, radius: 0.4 });

  // The first drain: wet, 22 m, straight to the cistern; slime down the middle of it, a rotted beam, the dead rats.
  swDrain(sec, { x0: west, x1: east, z0: 22, z1: 44, floor: F, walls: ['w', 'e'] });
  for (const z of [38, 28]) dnProp(sec, 'puddle', [X, F + 0.02, z], { radius: 1.1 });
  dnProp(sec, 'torch', [west + 0.1, F + 2.3, 34], { face: 'E' });
  dnProp(sec, 'drip', [X, F + 3.0, 40], {});
  dnProp(sec, 'drip', [X, F + 3.0, 31], {});
  dnProp(sec, 'grating', [X, F + 3.4, 25.5], { size: [1.4, 1.4] });
  dnProp(sec, 'slime', [X - 0.4, F + 0.01, 41], { yaw: 1.2, size: 1.2 });
  dnProp(sec, 'slime', [X + 0.5, F + 0.01, 31.6], { yaw: 0.4 });
  dnProp(sec, 'rotwood', [east - 0.6, F, 36.4], { yaw: 1.5 });
  dnProp(sec, 'rat', [west + 0.5, F, 29.4], { yaw: 0.6 });
  dnProp(sec, 'rags', [east - 0.6, F, 24.6], { yaw: 0.3 });
  dnProp(sec, 'cobweb', [west + 0.1, F + 3.0, 43.6], { yaw: 0, span: 0.9 });
  dnProp(sec, 'fungus', [east - 0.15, F + 0.6, 39.2], { size: 0.8 });

  // The cistern: a hall 13 by 18 of eight pillars, flooded knee-deep with the castle's sewage over a bed 0.4 below the causeway that crosses it, a door at each end.
  const bed = F - 0.4;
  dnSlab(sec, -56, -41, 3, 23, bed, 'flags', { extra: { room: true } });
  dnSlab(sec, west, east, 3, 23, F, 'flags');
  swDrain(sec, {
    x0: -55, x1: -42, z0: 4, z1: 22, floor: F, foot: bed - 1, slab: false, walls: ['n', 's', 'w', 'e'], head: 4.2, vault: { crown: 1.5, ribs: 4.2 },
    doors: { n: [{ at: X, width: SW_WIDE, top: F + 3 }], s: [{ at: X, width: SW_WIDE, top: F + 3 }] },
  });
  for (const px2 of [-52.4, -44.6]) for (const pz2 of [7.4, 12, 16.6, 20.6]) dnProp(sec, 'pillar', [px2, bed, pz2], { height: 4.2 });
  // The sewage: a sludge just under the causeway's top, scum and rubbish floating on it, an outfall pouring into it from the west wall (levelmode/kitwater.js, kitfilth.js).
  sec.decor.push({ kind: 'water', id: 'cistern', shape: 'rect', at: [-48.5, F - 0.12, 13], size: [13, 18], bed, murk: 'sludge', viscosity: 1.6 });
  for (const [x, z, yaw] of [[-52.6, 9.8, 0.4], [-44.4, 14.2, 1.7], [-53, 18.4, 2.6], [-45.2, 5.8, 0.9]]) dnProp(sec, 'scum', [x, F - 0.12, z], { yaw, size: 1.1 });
  dnProp(sec, 'outfall', [-55, F + 1.9, 11.4], { face: 'E', to: F - 0.12 });
  dnProp(sec, 'outfall', [-42, F + 2.1, 18.2], { face: 'W', to: F - 0.12, size: 0.8 });
  dnProp(sec, 'skeleton', [-54.2, bed, 14], { yaw: 0, chained: true });
  dnProp(sec, 'corpse', [-47.4, F, 15.6], { yaw: 1.4 });
  dnProp(sec, 'bones', [-46.6, F, 6], { yaw: 1.4 });
  dnProp(sec, 'rubbleheap', [-53.6, bed, 5.6], { size: 0.9 });
  dnProp(sec, 'rubbish', [-44, bed + 0.15, 20.8], { yaw: 0.8, size: 1.1 });
  dnProp(sec, 'torch', [-42.1, F + 2.4, 13.4], { face: 'W' });
  dnProp(sec, 'torch', [-54.9, F + 2.4, 17.6], { face: 'E', dim: true });
  dnProp(sec, 'brazier', [-46.6, F, 5.4], { lit: true });
  dnProp(sec, 'fungus', [-52.4, bed + 0.5, 21.4], { size: 1.0 });
  dnProp(sec, 'fungus', [-44.6, bed + 0.5, 8.2], { size: 0.8, light: false });
  for (const [x, z] of [[-50, 10.6], [-46, 18.4], [-52.4, 5.4]]) dnProp(sec, 'drip', [x, F + 3.6, z], {});

  // The second drain, the first stair (17 treads of 0.2, to y -1.6) and the long drain after it.
  swDrain(sec, { x0: west, x1: east, z0: -7, z1: 3, floor: F, walls: ['w', 'e'] });
  const first = dnFlight(sec, { foot: [X, -7], dir: 'N', steps: 17, tread: 0.4, width: SW_WIDE, from: F, rise: 0.2, style: 'stone' });
  dnFlightWalls(sec, first, { thick: 1, head: 3.0, style: 'rubble' });
  dnFlightVault(sec, first, { head: 3.0 });
  swDrain(sec, { x0: west, x1: east, z0: -35.2, z1: -14.8, floor: D, walls: ['w', 'e'] });
  dnProp(sec, 'puddle', [X, F + 0.02, -1], { radius: 1.1 });
  dnProp(sec, 'torch', [west + 0.1, F + 2.3, -3], { face: 'E' });
  dnProp(sec, 'drip', [X, F + 3.0, 1.2], {});
  dnProp(sec, 'slime', [X + 0.3, F + 0.01, 1.6], { yaw: 0.7 });
  dnProp(sec, 'rat', [east - 0.4, F, -4.6], { yaw: 1.9 });
  for (const z of [-20, -26, -31]) dnProp(sec, 'puddle', [X, D + 0.02, z], { radius: 1.0 });
  dnProp(sec, 'drip', [X, D + 3.0, -24], {});
  dnProp(sec, 'rubbleheap', [east - 0.5, D, -28.6], { size: 0.6 });
  dnProp(sec, 'torch', [east - 0.1, D + 2.3, -22], { face: 'W' });
  dnProp(sec, 'slime', [X - 0.3, D + 0.01, -17.6], { yaw: 2.2, size: 1.2 });
  dnProp(sec, 'rags', [west + 0.6, D, -25.4], { yaw: 0.2 });
  dnProp(sec, 'cobweb', [east - 0.1, D + 3.0, -15.4], { yaw: Math.PI, span: 0.8 });
  dnProp(sec, 'fungus', [west + 0.15, D + 0.4, -31.6], { size: 0.9 });

  // The pocket where the drain turns east: the smugglers' brazier, the way's one rest (dry, a fire), before the cesspool.
  swDrain(sec, {
    x0: west - 2.6, x1: px - hallOut, z0: -39.6, z1: -36.2, floor: D, walls: ['n', 's', 'w'], doors: { s: [{ at: X, width: SW_WIDE, top: D + 3 }] },
  });
  sec.rest = { id: 'restdrain', name: "The Smugglers' Brazier", at: [-49.2, D, -37.9] };
  dnProp(sec, 'brazier', [-51.4, D, -37.9], { lit: true, rest: true });
  dnProp(sec, 'barrel', [-52.0, D, -39.0], { yaw: 0.5 });
  dnProp(sec, 'sack', [-52.2, D, -36.8], {});
  dnProp(sec, 'rags', [-47.4, D, -39.1], { yaw: 0.8 });

  swCesspool(sec, alcove);

  // East from the cesspool along the foot of the rock under the chapel: 13 m, a door to the sea-gate at its end. The stair up (15 treads of 0.2, y -1.6 to the crypt's 1.4) and the last 6 m.
  swDrain(sec, { x0: px + hallOut, x1: -13, z0: -39.6, z1: -36.2, floor: D, walls: ['n', 's'] });
  const second = dnFlight(sec, { foot: [-13, -37.9], dir: 'E', steps: 15, tread: 0.4, width: SW_WIDE, from: D, rise: 0.2, style: 'stone' });
  dnFlightWalls(sec, second, { thick: 1, head: 3.0, style: 'rubble' });
  dnFlightVault(sec, second, { head: 3.0 });
  swDrain(sec, { x0: -6, x1: 0, z0: -39.6, z1: -36.2, floor: C, walls: ['n', 's'] });
  dnProp(sec, 'puddle', [-21, D + 0.02, -37.9], { radius: 1.0 });
  dnProp(sec, 'torch', [-19, D + 2.3, -39.5], { face: 'S' });
  dnProp(sec, 'drip', [-23, D + 3.0, -37.9], {});
  dnProp(sec, 'slime', [-17.2, D + 0.01, -37.6], { yaw: 0.3 });
  dnProp(sec, 'rat', [-24.6, D, -36.8], { yaw: 0.9 });
  dnProp(sec, 'torch', [-3, C + 2.3, -36.3], { face: 'N', dim: true });
  sec.decor.push({ kind: 'waymarks', points: [[-46.2, -37.9, D], [px - P.radius - 0.4, -37.9, D]], gap: 2.6, first: 0.6 });
  sec.decor.push({ kind: 'waymarks', points: [[px + P.radius + 0.4, -37.9, D], [-14, -37.9, D], [-4, -37.9, C]], gap: 2.6, first: 0.6 });

  // The one man down here: Noname, waiting in the middle of the sludge (presets.js `noname`; a guard's mind: he waits, he sees, he fights to the death).
  dnSpawn(sec, DN_NONAME_SPAWN, 'noname', 'enemy', 3, [P.island.at[0], P.island.top, P.island.at[1]], DN_FACE.W, { inputs: { name: 'Noname' }, miniboss: { title: 'The Cesspool' } });

  dnItem(sec, 'bandage12', 'bandage', [-53.4, F, 52.6]);
  dnItem(sec, 'tonic9', 'tonic', [-54.0, bed, 5.4]);
  dnItem(sec, 'bandage13', 'bandage', [-50.4, D, -39.0]);
  dnItem(sec, 'tonic-cesspool', 'tonic', [px + 0.8, D, (alcove.z0 + alcove.z1) / 2 - 0.6]);
  return sec;
}

/**
 * The cesspool (DN_CESSPOOL): an eight-sided sump hall, its walls `hall` from the centre, a rim walk round a pit of sludge `radius` from it (the bed `floor`, the
 * sludge's surface at `at[1]`), ramps down into the pit on the drain's line (west and east) and north and south, a groined vault over it, outfalls pouring into it,
 * a dead-end alcove north (`alcove`: its inside), and the filth: rubbish on the rim, the dead, scum on the sludge, cobwebs, glowing fungus, one lantern.
 */
function swCesspool(sec, alcove) {
  const P = DN_CESSPOOL;
  const [cx, surface, cz] = P.at;
  const D = P.rim;
  const t = 1;
  const top = D + 6;
  const tan = Math.tan(Math.PI / 8);
  // The bed under the whole hall, then the rim walk round the pit: eight slabs, one under each side (the corners overlap).
  dnSlab(sec, cx - P.hall - t, cx + P.hall + t, cz - P.hall - t, cz + P.hall + t, P.floor, 'flags', { bottom: P.floor - 1, extra: { room: true } });
  for (let k = 0; k < 8; k += 1) {
    const phi = (k * Math.PI) / 4;
    const nx = Math.round(Math.cos(phi) * 1e9) / 1e9;
    const nz = Math.round(Math.sin(phi) * 1e9) / 1e9;
    const width = P.hall + 0.5 - P.radius;
    const middle = P.radius + width / 2;
    const length = 2 * (P.hall + 0.5) * tan + 0.3;
    const yaw = Math.atan2(-nx, -nz);
    sec.terrain.push({ ...slabOf([cx + nx * middle, cz + nz * middle], [length, width], D, { yaw, bottom: P.floor - 0.5 }), style: 'flags', room: true });
    // The wall of this side: the drain's two doors (east, west), the alcove's (north).
    const a = P.hall + t / 2;
    const span = 2 * (P.hall + t) * tan + 0.25;
    const centre = [cx + nx * a, cz + nz * a];
    const from = [centre[0] + nz * span / 2, centre[1] - nx * span / 2];
    const to = [centre[0] - nz * span / 2, centre[1] + nx * span / 2];
    const doors = [];
    if (k === 0 || k === 4) doors.push({ at: span / 2, width: SW_WIDE, sill: D, top: D + 3, shape: 'round' });
    if (k === 6) doors.push({ at: span / 2, width: alcove.x1 - alcove.x0, sill: D, top: D + 3, shape: 'round' });
    dnRun(sec, from, to, t, P.floor - 1, top, 'rubble', doors);
  }
  // The island in the middle, a hand under the sludge: where he waits (a step up from the bed).
  const isle = P.island;
  dnSlab(sec, isle.at[0] - isle.size / 2, isle.at[0] + isle.size / 2, isle.at[1] - isle.size / 2, isle.at[1] + isle.size / 2, isle.top, 'flags', { bottom: P.floor - 0.5 });
  // Ramps down into the sludge: on the drain's line (west and east) and north and south.
  for (const [dx, dz, yaw] of [[-1, 0, Math.PI], [1, 0, 0], [0, -1, Math.PI / 2], [0, 1, -Math.PI / 2]]) {
    const r = P.radius - 1.2;
    sec.terrain.push({ ...rampOf([cx + dx * r, cz + dz * r], [2.4, 2.6], P.floor, D, { yaw }), style: 'stone' });
  }
  // The roof: a flat ceiling for the physics, two barrel vaults crossing (a groin) drawn under it.
  dnCeiling(sec, cx - P.hall, cx + P.hall, cz - P.hall, cz + P.hall, D + 4.8, D + 5.6);
  sec.decor.push({ kind: 'vault', a: [cx - P.hall - t, cz, D + 4.2], b: [cx + P.hall + t, cz, D + 4.2], width: P.hall * 2, crown: 1.5, ribs: 4.3, style: 'vault' });
  sec.decor.push({ kind: 'vault', a: [cx, cz - P.hall - t, D + 4.2], b: [cx, cz + P.hall + t, D + 4.2], width: P.hall * 2, crown: 1.5, ribs: 4.3, style: 'vault' });
  // The alcove: a dead end north of the pit, where the drain's dead are washed.
  dnRoom(sec, { x0: alcove.x0, x1: alcove.x1, z0: alcove.z0, z1: alcove.z1, floor: D, head: 3.2, thick: 1, style: 'rubble', walls: ['n', 'w', 'e'], vault: { crown: 0.9, ribs: 3.2 } });

  // The sludge: the castle's sewage, thick, scum on it (levelmode/kitwater.js), over the whole pit (the octagon's corners under the rim).
  const reach = (P.radius / Math.cos(Math.PI / 8)) * 2 + 0.2;
  sec.decor.push({ kind: 'water', id: 'cesspool', shape: 'ellipse', at: [cx, surface, cz], size: [reach, reach], bed: P.floor, murk: 'sludge', viscosity: 2 });
  for (const [x, z, yaw, size] of [[-3.4, 2.6, 0.3, 1.3], [3.6, -2.8, 1.9, 1.1], [-1.4, -4.8, 2.6, 0.9], [4.4, 3.4, 0.8, 1.2], [-4.8, -1.6, 1.2, 0.8]]) dnProp(sec, 'scum', [cx + x, surface, cz + z], { yaw, size });
  // Sewage pouring in from the castle above: three outfalls from the walls north and south, out over the pit's edge.
  dnProp(sec, 'outfall', [cx - 3.6, D + 2.6, cz - P.hall], { face: 'S', to: surface, length: 2.4 });
  dnProp(sec, 'outfall', [cx + 3.4, D + 2.2, cz + P.hall], { face: 'N', to: surface, length: 2.4, size: 1.2 });
  dnProp(sec, 'outfall', [cx + 4.2, D + 3.0, cz - P.hall], { face: 'S', to: surface, length: 2.4, size: 0.8 });
  // The garderobe's grating high in the vault, under the privy's hole in the room above (a cold grey light from it, and what comes down it: the chute's
  // mouth, where the plot twist drops the player in, dunnottar-chapel.js DN_ENDING.landing).
  dnProp(sec, 'grating', [cx - 5.1, D + 4.75, cz + 1.9], { size: [1.2, 1.2] });
  // Filth on the rim: rubbish heaps and slime, a rotted beam, rats, rags; the dead.
  const rim = (angle, out = 0) => [cx + Math.cos(angle) * (P.radius + 0.9 + out), cz + Math.sin(angle) * (P.radius + 0.9 + out)];
  for (const [angle, what, extra] of [
    [0.75, 'rubbish', { size: 1.1 }], [2.3, 'rubbish', { size: 0.9 }], [3.9, 'rubbish', { size: 1.2 }], [5.6, 'rubbish', { size: 0.8 }],
    [0.4, 'slime', { size: 1.3 }], [1.6, 'slime', {}], [2.8, 'slime', { size: 1.2 }], [4.4, 'slime', {}], [5.1, 'slime', { size: 1.1 }],
    [1.25, 'rotwood', {}], [3.4, 'rags', {}], [5.95, 'rat', {}], [2.05, 'rat', {}], [4.1, 'bones', {}],
  ]) {
    const [x, z] = rim(angle, what === 'rubbish' ? 0.3 : 0);
    dnProp(sec, what, [x, D + (what === 'slime' ? 0.01 : 0), z], { yaw: angle * 1.7, ...extra });
  }
  const [kx, kz] = rim(2.55, 0.1);
  dnProp(sec, 'corpse', [kx, D, kz], { yaw: 2.55 + Math.PI / 2 });
  // The light: one lantern on the rim by the way in, the fungus's sick green glow on the walls and the rim; cobwebs in the corners of the vault.
  const [lx, lz] = rim(Math.PI * 0.82, 0.55);
  dnProp(sec, 'lantern', [lx, D, lz], { yaw: 0.6 });
  // (And a guttering lantern at a corner of the island, his: the one light by the face at the end, levelmode/ending.js's reveal.)
  dnProp(sec, 'lantern', [P.island.at[0] + P.island.size / 2 - 0.2, P.island.top, P.island.at[1] - P.island.size / 2 + 0.2], { yaw: 2.2 });
  for (const [angle, size, light] of [[1.95, 1.2, true], [4.75, 1.0, true], [0.3, 0.8, false], [3.55, 0.9, false]]) {
    const [x, z] = rim(angle, 0.75);
    dnProp(sec, 'fungus', [x, D + 0.02, z], { size, light });
  }
  for (const angle of [0.4, 2.0, 3.5, 5.1]) {
    const [x, z] = rim(angle, 0.85);
    dnProp(sec, 'cobweb', [x, D + 4.4, z], { yaw: -angle, span: 1.1 });
  }
  dnProp(sec, 'flies', [cx - 1.5, surface + 0.6, cz + 1.2], { count: 14, radius: 1.2 });
  // The alcove: bones and skulls heaped, a second dead man, rags.
  const ax = (alcove.x0 + alcove.x1) / 2;
  dnProp(sec, 'skullpile', [ax - 0.6, D, alcove.z0 + 1.0], { size: 0.8 });
  dnProp(sec, 'corpse', [ax + 0.4, D, alcove.z0 + 2.4], { yaw: 0.3 });
  dnProp(sec, 'rags', [ax - 0.9, D, alcove.z1 - 0.8], { yaw: 1.4 });
  dnProp(sec, 'fungus', [alcove.x0 + 0.2, D + 0.5, alcove.z0 + 0.6], { size: 0.7, light: false });
}
