// Stage 1, Dunnottar: the way round the guarded front gate. A sea cave at the foot of the gorge shelf (its mouth, the stair down to it and the lantern
// at it are the cliff path's: `buildSeaCave`) and the Old Drain that leads from it (section `sewer`): a grotto the tide still reaches, a long drain, a
// flooded cistern on a causeway, more drain climbing in two stairs under the mainland's hill and the headland's rock, and at the end a low door into
// the crypt's sea-gate chamber (the crypt's `buildCrypt` has the door). From the sea-gate the stair behind the heavy door (lifted by the hidden lever)
// comes up into the vault's torture chamber: the way into the dungeon level that never goes near the gatehouse. It is dark, wet and long (about 150 m
// of passage), and not a place to rest in but for one smugglers' brazier half way. The garrison has forgotten it; a few levies the quartermaster sent down to watch the sea
// door, and one sergeant at the cistern, have not.
//
//   sewer  (y -5 .. 1.4)  x -56..0, z -40..56 (it runs under the shelf, the mainland and the rock of the headland: nothing else is there)
//     the grotto           x -55..-42, z 44..54.8, floor -5   (tide pools, a dead man's kegs; the mouth in the cliff face at z 55.4)
//     the first drain      x -50.2..-46.8, z 22..44           (a wet barrel-vaulted passage, 3.4 m wide)
//     the cistern          x -55..-42, z 4..22                (a flooded hall of eight pillars, the causeway down its middle, the bed 0.4 lower)
//     the second drain     x -50.2..-46.8, z -35..3           (a stair of 17 treads up to y -1.6 at z -7..-13.8)
//     the long drain       x -52.8..-13, z -39.6..-36.2       (east along the foot of the chapel's rock; the smugglers' brazier, the way's one rest, in the pocket at its west end) and a stair of 15 treads up to y 1.4
//     the low door         x -7..0                            (into the crypt's sea-gate chamber at x 0)
//
// A section's `decor` is for the drawing only (levelmode/kit.js); the solids carry a `style`.

import { DN_FACE, Y, dnBounds, dnBox, dnFence, dnFlight, dnFlightVault, dnFlightWalls, dnItem, dnProp, dnRoom, dnRun, dnSection, dnSlab, dnSpawn } from './dnbuild.js';

/** The levels (y) of the old drain and the line it runs on (x): the cave, the cistern and the first drains at `floor`; the long drain at `drain`; the crypt's at Y.crypt. */
export const DN_CAVE = { floor: -5, drain: -1.6, x: -48.5, mouth: 3.4, face: 55.4 };
/** The stair down the cliff's face to the sea cave: x of its foot at the quay and of its head on the shelf, beside the drawbridge's head. */
export const DN_CAVE_STAIR = { foot: -39.6, head: -29.6 };

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
  const F = DN_CAVE.floor;
  const D = DN_CAVE.drain;
  const C = Y.crypt;
  const X = DN_CAVE.x;
  const west = X - SW_WIDE / 2;
  const east = X + SW_WIDE / 2;
  // (Heights: below the shelf and the hillside, whose sections are the cliff path's, up to a man's hips on the stairs and the last stretch.)
  const low = [-6.5, -1.5];
  const mid = [-6.5, 0.2];
  const high = [-6.5, 3];
  dnBounds(sec,
    { at: [X, 49.7], size: [15, 12.6], y: low },
    { at: [X, 33], size: [5.4, 23], y: low },
    { at: [X, 13], size: [15, 19], y: low },
    { at: [X, -2], size: [5.4, 14], y: low },
    { at: [X, -11.2], size: [5.4, 8.4], y: mid },
    { at: [X, -25.6], size: [5.4, 22.4], y: mid },
    { at: [-25.9, -37.9], size: [53.2, 5.4], y: high });
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
  dnProp(sec, 'torch', [-42.1, F + 2.2, 47.8], { face: 'W', dim: true });
  dnProp(sec, 'drip', [-49.2, F + 3.0, 50], {});
  dnProp(sec, 'drip', [-45.6, F + 3.0, 46.6], {});

  // The first drain: wet, 22 m, straight to the cistern.
  swDrain(sec, { x0: west, x1: east, z0: 22, z1: 44, floor: F, walls: ['w', 'e'] });
  for (const z of [38, 28]) dnProp(sec, 'puddle', [X, F + 0.02, z], { radius: 1.1 });
  dnProp(sec, 'torch', [west + 0.1, F + 2.3, 34], { face: 'E', dim: true });
  dnProp(sec, 'drip', [X, F + 3.0, 40], {});
  dnProp(sec, 'drip', [X, F + 3.0, 31], {});
  dnProp(sec, 'grating', [X, F + 3.4, 25.5], { size: [1.4, 1.4] });

  // The cistern: a hall 13 by 18 of eight pillars, flooded knee-deep over a bed 0.4 below the causeway that crosses it (as the crypt's flooded way), a door at each end.
  const bed = F - 0.4;
  dnSlab(sec, -56, -41, 3, 23, bed, 'flags', { extra: { room: true } });
  dnSlab(sec, west, east, 3, 23, F, 'flags');
  swDrain(sec, {
    x0: -55, x1: -42, z0: 4, z1: 22, floor: F, foot: bed - 1, slab: false, walls: ['n', 's', 'w', 'e'], head: 4.2, vault: { crown: 1.5, ribs: 4.2 },
    doors: { n: [{ at: X, width: SW_WIDE, top: F + 3 }], s: [{ at: X, width: SW_WIDE, top: F + 3 }] },
  });
  for (const px of [-52.4, -44.6]) for (const pz of [7.4, 12, 16.6, 20.6]) dnProp(sec, 'pillar', [px, bed, pz], { height: 4.2 });
  for (const [x, z] of [[-52, 8], [-45, 9.4], [-52.4, 14.6], [-44.8, 15.6], [-52, 20], [-45.4, 20.2], [-48.5, 12.4]]) dnProp(sec, 'puddle', [x, F - 0.14, z], { radius: 2.2 });
  dnProp(sec, 'skeleton', [-54.2, bed, 14], { yaw: 0, chained: true });
  dnProp(sec, 'bones', [-46.6, F, 6], { yaw: 1.4 });
  dnProp(sec, 'rubbleheap', [-53.6, bed, 5.6], { size: 0.9 });
  dnProp(sec, 'torch', [-42.1, F + 2.4, 13.4], { face: 'W', dim: true });
  dnProp(sec, 'torch', [-54.9, F + 2.4, 17.6], { face: 'E', dim: true });
  dnProp(sec, 'brazier', [-46.6, F, 5.4], { lit: true });
  for (const [x, z] of [[-50, 10.6], [-46, 18.4], [-52.4, 5.4]]) dnProp(sec, 'drip', [x, F + 3.6, z], {});

  // The second drain, the first stair (17 treads of 0.2, to y -1.6) and the long drain after it.
  swDrain(sec, { x0: west, x1: east, z0: -7, z1: 3, floor: F, walls: ['w', 'e'] });
  const first = dnFlight(sec, { foot: [X, -7], dir: 'N', steps: 17, tread: 0.4, width: SW_WIDE, from: F, rise: 0.2, style: 'stone' });
  dnFlightWalls(sec, first, { thick: 1, head: 3.0, style: 'rubble' });
  dnFlightVault(sec, first, { head: 3.0 });
  swDrain(sec, { x0: west, x1: east, z0: -35.2, z1: -14.8, floor: D, walls: ['w', 'e'] });
  dnProp(sec, 'puddle', [X, F + 0.02, -1], { radius: 1.1 });
  dnProp(sec, 'torch', [west + 0.1, F + 2.3, -3], { face: 'E', dim: true });
  dnProp(sec, 'drip', [X, F + 3.0, 1.2], {});
  for (const z of [-20, -26, -31]) dnProp(sec, 'puddle', [X, D + 0.02, z], { radius: 1.0 });
  dnProp(sec, 'drip', [X, D + 3.0, -24], {});
  dnProp(sec, 'rubbleheap', [east - 0.5, D, -28.6], { size: 0.6 });
  dnProp(sec, 'torch', [east - 0.1, D + 2.3, -22], { face: 'W', dim: true });

  // East, along the foot of the rock under the chapel: 36 m, a door to the sea-gate at its end. The stair up (15 treads of 0.2, y -1.6 to the crypt's 1.4) and the last 6 m.
  swDrain(sec, {
    x0: west - 2.6, x1: -13, z0: -39.6, z1: -36.2, floor: D, walls: ['n', 's', 'w'], doors: { s: [{ at: X, width: SW_WIDE, top: D + 3 }] },
  });
  const second = dnFlight(sec, { foot: [-13, -37.9], dir: 'E', steps: 15, tread: 0.4, width: SW_WIDE, from: D, rise: 0.2, style: 'stone' });
  dnFlightWalls(sec, second, { thick: 1, head: 3.0, style: 'rubble' });
  dnFlightVault(sec, second, { head: 3.0 });
  swDrain(sec, { x0: -6, x1: 0, z0: -39.6, z1: -36.2, floor: C, walls: ['n', 's'] });
  for (const x of [-42, -30, -21]) dnProp(sec, 'puddle', [x, D + 0.02, -37.9], { radius: 1.0 });
  for (const [x, face] of [[-44, 'S'], [-30, 'N'], [-19, 'S']]) dnProp(sec, 'torch', [x, D + 2.3, face === 'S' ? -39.5 : -36.3], { face, dim: true });
  for (const x of [-38, -26]) dnProp(sec, 'drip', [x, D + 3.0, -37.9], {});
  dnProp(sec, 'bones', [-36.4, D, -37.0], { yaw: 0.3 });
  dnProp(sec, 'torch', [-3, C + 2.3, -36.3], { face: 'N', dim: true });
  // A place to rest: the smugglers' brazier in the pocket where the drain turns east (the one place on the way that is dry and has a fire), after the second stair: four men behind him, the sea-gate and the cellar's men ahead.
  sec.rest = { id: 'restdrain', name: "The Smugglers' Brazier", at: [-49.2, D, -37.9] };
  dnProp(sec, 'brazier', [-51.4, D, -37.9], { lit: true, rest: true });
  dnProp(sec, 'barrel', [-52.0, D, -39.0], { yaw: 0.5 });
  dnProp(sec, 'sack', [-52.2, D, -36.8], {});
  sec.decor.push({ kind: 'waymarks', points: [[-46.2, -37.9, D], [-30, -37.9, D], [-14, -37.9, D], [-4, -37.9, C]], gap: 2.6, first: 0.6 });

  // Men: a levy the quartermaster sent to watch the sea door, a second in the first drain, a sergeant at the cistern, a third at the turn of the long drain.
  dnSpawn(sec, 'drain1', 'dunnottarSoldier', 'enemy', 1, [-46, F, 50], DN_FACE.S, { inputs: { name: 'Wat' } });
  dnSpawn(sec, 'drain2', 'dunnottarSoldier', 'enemy', 1, [X, F, 34], DN_FACE.S, { inputs: { name: 'Peem' }, patrol: [[X, 34], [X, 27]] });
  dnSpawn(sec, 'drainward', 'dunnottarGuard', 'enemy', 2, [X, F, 7.6], DN_FACE.S, { inputs: { name: 'Sergeant Mungo' } });
  dnSpawn(sec, 'drain3', 'dunnottarSoldier', 'enemy', 1, [X, D, -26], DN_FACE.S, { inputs: { name: 'Jock' }, patrol: [[X, -26], [X, -20]] });

  dnItem(sec, 'bandage12', 'bandage', [-53.4, F, 52.6]);
  dnItem(sec, 'tonic9', 'tonic', [-54.0, bed, 5.4]);
  dnItem(sec, 'bandage13', 'bandage', [-34.4, D, -38.6]);
  return sec;
}
