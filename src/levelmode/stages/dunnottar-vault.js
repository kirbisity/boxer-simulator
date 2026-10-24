// Stage 1, Dunnottar: Whigs' Vault (section `vault`, the long cellar, the dungeon hall and the cell, the stairs up to the court and the
// keep) and the Crypt beneath it (section `crypt`, a level down). The main way is the one it always was: down the west stair, along
// the cellar, past the turnkey, up the east stair. Everything else is optional and dim (no way-marks; the chevrons stay on the main
// line): a torture chamber and a stores branch off the cellar, a well-shaft stair down to the crypt, and in the crypt an ossuary, the
// keepers' tombs, a flooded way on a raised causeway to the sea-gate, a hidden lever there that lifts the bars of a stair back up into the
// torture chamber (a loop: cellar, shaft, crypt, causeway, lever, stair, torture chamber, cellar).
//
//   vault  (y 6)     x -3..47, z -39..0
//     the long cellar      x 0..32.8, z -26..-19    (doors north: torture chamber x 6.6, the cell x 16.7, the well shaft x 28.6; south: the stores x 15.2)
//     the dungeon hall     x 9.6..23.4, z -36..-26
//     the torture chamber  x 0..10, z -35.2..-27.6  (the bars-gated stair back up from the sea-gate at x 0..3.4)
//     the stores           x 11..19.4, z -13.4..-6.2 (a corridor from the cellar's south wall; the collapsed tunnel at its south end)
//     the well shaft       centre (28.6, -32.4), a twelve-sided room, a winding stair of 26 treads down to the crypt
//   crypt  (y 1.4)   x -0.6..34, z -39.6..-18
//     the gallery          x 4.6..33, z -26.2..-22.8 (the west end flooded: a causeway; the shaft's door at x 28.6)
//     the ossuary          x 11..22.2, z -35.4..-27.2
//     the keepers' tombs   x 12.8..21, z -21.8..-18.4
//     the flooded way      x 4.6..7.8, z -35.4..-26.2 (north from the gallery's west end, on a causeway)
//     the sea-gate         x 0..9.6, z -39.2..-35.2 (a barred arch over the sea, the hidden lever, a dead man in plate)

import { wallOf, windingStairs } from '../../physics/terrain.js';
import { DN_SEAGATE_DOOR } from './dunnottar-sewer.js';
import { DN_FACE, dnBounds, dnBox, dnCeiling, dnFlight, dnFlightVault, dnFlightWalls, dnGate, dnItem, dnProp, dnRoom, dnRun, dnSection, dnSlab, dnSpawn, Y } from './dnbuild.js';

// The stair flights from the quadrangle into the vault share these numbers: 31 treads from the cellar floor (y 6) to the court.
export const DN_VAULT_STEPS = 31;
export const DN_VAULT_RISE = (Y.quad - Y.vault) / DN_VAULT_STEPS;
/** The treads that lie under the court's own slab (a man's head clears it): the first 11. */
export const DN_COVERED = 11;

const V = Y.vault;
const C = Y.crypt;
/** How thick the vault's floor is where a room lies under it (the crypt's roof). */
const FLOOR = 0.8;
/**
 * The head room of the vault's rooms (m over the floor): as high as the court's slab over them allows (its underside at V + 4.58, the slab 1.6 thick
 * under the court's 12.18), a roof 0.4 thick. It was 3.3 in the cellar and the dungeon, 3.4-3.6 in the torture chamber and the stores: the camera came in
 * to under 2 m along the cellar. The barrel vaults drawn are lifted with it, the torches stay at the walls' height. (The crypt under them cannot be
 * raised: the vault's own floor is its roof.)
 */
const HEAD = 4.15;
const LIFT = HEAD - 3.3;

/** The well shaft: a twelve-sided room at the north-east of the cellar, a winding stair down one turn to the crypt, the landing over its first quarter. */
export const DN_SHAFT = { at: [28.6, -32.4], radius: 5.4, sides: 12 };
export const DN_SHAFT_SPIRAL = { at: DN_SHAFT.at, inner: 0.7, outer: 4.5, start: (83.08 * Math.PI) / 180, turn: Math.PI * 2, steps: 26, from: C, rise: (V - C) / 26 };

/** The route a man takes to get to the shaft's landing and down: for the tests. */
export const DN_SHAFT_ROUTE = { door: [28.6, -26.4], landing: [26.4, -30.4] };

// ---- 5. Whigs' Vault -------------------------------------------------------------------------------

export function buildVault() {
  const sec = dnSection('vault', "Whigs' Vault");
  dnBounds(sec, { at: [22, -18], size: [50, 36], y: [3, 11.5] }, { at: [28.6, -33], size: [11.2, 12.4], y: [3, 11.5] }, { at: [5, -33], size: [13, 11.4], y: [3, 11.5] });
  const rise = DN_VAULT_RISE;
  const wallTop = V + 4.6;
  // The long cellar: 33 m by 7, a segmental barrel vault on cross arches, the floor flagged and wet (and a floor thick enough to be the crypt's roof).
  dnSlab(sec, -1.6, 34, -27.6, -17.4, V, 'flags', { bottom: V - FLOOR, extra: { room: true } });
  dnRun(sec, [-0.8, -27.6], [-0.8, -17.4], 1.6, V - 1, wallTop, 'rubble');
  // (The south wall: the west stair, the stores' door, the gate stair. The north wall: a window, the torture chamber's door, the cell door, a window, the well shaft's door.)
  dnRun(sec, [-1.6, -18.2], [33.4, -18.2], 1.6, V - 1, wallTop, 'rubble', [{ at: 7.3, width: 5.4, sill: V, top: V + 3.6, shape: 'round' }, { at: 16.8, width: 3.2, sill: V, top: V + 3.4, shape: 'round' }, { at: 26.3, width: 5.4, sill: V, top: V + 3.6, shape: 'round' }]);
  dnRun(sec, [-1.6, -26.8], [33.4, -26.8], 1.6, V - 1, wallTop, 'rubble', [
    { at: 4.0, width: 1.4, sill: V + 1.6, top: V + 3.2, shape: 'lancet', solid: true },
    { at: 8.2, width: 2.8, sill: V, top: V + 3.4, shape: 'round' },
    { at: 18.3, width: 3.4, sill: V, top: V + 3.4, shape: 'round' },
    { at: 26.2, width: 1.4, sill: V + 1.6, top: V + 3.2, shape: 'lancet', solid: true },
    { at: 30.2, width: 3.0, sill: V, top: V + 3.4, shape: 'round' },
  ]);
  dnRun(sec, [33.4, -27.6], [33.4, -17.4], 1.2, V - 1, wallTop, 'rubble', [{ at: 5.1, width: 5.8, sill: V, top: V + 3.8, shape: 'round' }]);
  dnCeiling(sec, 0, 32.8, -26, -19, V + HEAD, V + 4.8);
  sec.decor.push({ kind: 'vault', a: [0, -22.5, V + 3.0 + LIFT], b: [32.8, -22.5, V + 3.0 + LIFT], width: 7, crown: 1.4, ribs: 4.1, style: 'vault' });
  // The west stair down from the court: 31 treads, the first 11 under the court's own slab.
  const west = dnFlight(sec, { foot: [5.7, -14.6], dir: 'S', steps: DN_VAULT_STEPS, tread: 0.34, width: 5.4, from: V, rise, style: 'cobble' });
  dnFlightWalls(sec, west, { thick: 1.6, head: 4.4, every: 3 });
  dnFlightVault(sec, west, { head: 3.9, last: DN_COVERED + 1, roof: 0.5 });
  dnSlab(sec, 1.4, 10, -19, -14.6, V, 'flags', { extra: { room: true } });
  dnBox(sec, 1.4, 3, -19, -14.6, V - 1, V + 4.4, 'rubble');
  dnBox(sec, 8.4, 10, -19, -14.6, V - 1, V + 4.4, 'rubble');
  dnCeiling(sec, 3, 8.4, -19, -14.6, V + 3.6, V + 4.4);
  // The shortcut stair up to the court by the well (Shortcut 3): behind an iron gate at its foot.
  const gate = dnFlight(sec, { foot: [24.7, -17.4], dir: 'S', steps: DN_VAULT_STEPS, tread: 0.34, width: 5.4, from: V, rise, style: 'cobble' });
  dnFlightWalls(sec, gate, { thick: 1.6, head: 4.4, every: 3 });
  dnFlightVault(sec, gate, { head: 3.9, last: DN_COVERED + 1, roof: 0.5 });
  dnGate(sec, 'irongate', [24.7, V, -19.6], [{ ...wallOf([24.7, -17.9], [5.4, 0.3], V, V + 3.6, { id: 'irongate' }), style: 'iron', skin: false }], { kind: 'bars', width: 5.4, height: 3.6 }, { opensFrom: { at: [24.7, -22.5], size: [12, 8.6], y: [V - 1, V + 4] }, label: 'Lift the iron gate bar' });
  // The east stair up to the tower house: 31 treads, the first 11 under the court.
  const east = dnFlight(sec, { foot: [34, -22.5], dir: 'E', steps: DN_VAULT_STEPS, tread: 0.34, width: 5.8, from: V, rise, style: 'cobble' });
  dnFlightWalls(sec, east, { thick: 1.6, head: 4.4, every: 3 });
  dnFlightVault(sec, east, { head: 3.9, last: DN_COVERED + 1, roof: 0.5 });
  // The dungeon: a hall north of the cellar with its door barred (the turnkey's key), cells in it.
  dnSlab(sec, 9.6, 23.4, -36, -26, V, 'flags', { bottom: V - FLOOR, extra: { room: true } });
  dnRun(sec, [10.8, -35.2], [10.8, -26.8], 1.6, V - 1, wallTop, 'rubble');
  dnRun(sec, [22.6, -35.2], [22.6, -26.8], 1.6, V - 1, wallTop, 'rubble');
  dnRun(sec, [10, -35.2], [23.4, -35.2], 1.6, V - 1, wallTop, 'rubble', [{ at: 6.7, width: 1.2, sill: V + 2.2, top: V + 3.4, shape: 'slit', solid: true }]);
  dnCeiling(sec, 11.6, 21.8, -34.4, -26.8, V + HEAD, V + 4.8);
  sec.decor.push({ kind: 'vault', a: [11.6, -30.6, V + 3.0 + LIFT], b: [21.8, -30.6, V + 3.0 + LIFT], width: 7.6, crown: 1.4, style: 'vault' });
  dnGate(sec, 'celldoor', [16.7, V, -25.4], [{ ...wallOf([16.7, -26.8], [3.4, 0.3], V, V + 3.4, { id: 'celldoor' }), style: 'iron', skin: false }], { kind: 'bars', width: 3.4, height: 3.4 }, { key: 'cellkey', frees: ['miner', 'captive'], opensFrom: { at: [16.7, -22.5], size: [10, 8.6], y: [V - 1, V + 4] }, label: 'Unlock the cell door', lockedText: 'Locked. The turnkey keeps the key at his desk.' });
  sec.decor.push({ kind: 'bars', a: [11.6, -31.8], b: [14.8, -31.8], y0: V, y1: V + 3.2 });
  sec.decor.push({ kind: 'bars', a: [18.6, -31.8], b: [21.8, -31.8], y0: V, y1: V + 3.2 });
  // The turnkey's end: a desk, a peg of keys, a brazier.
  dnProp(sec, 'table', [30.0, V, -25.2], { yaw: 0 });
  dnProp(sec, 'stool', [29.6, V, -24.2], { yaw: 0 });
  dnProp(sec, 'brazier', [31.8, V, -19.8], { lit: true, rest: true });
  // Rest 2b: the turnkey's fire, past his post, before the stair up to the keep.
  sec.rest = { id: 'rest2b', name: "The Turnkey's Fire", at: [31.2, V, -20.9] };
  dnProp(sec, 'keys', [31.6, V + 1.2, -26.4], {});
  dnProp(sec, 'barrel', [1.4, V, -25.6], { yaw: 0.3 });
  dnProp(sec, 'barrel', [2.6, V, -25.8], { yaw: 1.3 });
  dnProp(sec, 'crate', [12.6, V, -25.4], { yaw: 0.2 });
  // Skeletons: shackled to the walls, heaped in the corners.
  for (const [x, z, yaw] of [[3.2, -26.2, 0], [8.6, -26.2, 0.1], [13.4, -19.2, Math.PI], [20.6, -19.2, Math.PI], [27.8, -26.2, 0], [15.2, -33.8, 0], [19, -33.8, 0]]) dnProp(sec, 'skeleton', [x, V, z], { yaw, chained: true });
  dnProp(sec, 'bones', [9.8, V, -21.4], { yaw: 1 });
  dnProp(sec, 'bones', [22.4, V, -24.4], { yaw: 2 });
  dnProp(sec, 'bones', [14.6, V, -30], { yaw: 0.4 });
  dnProp(sec, 'chains', [16.8, V + 2.2, -35.1], {});
  dnProp(sec, 'straw', [13, V, -33], {});
  dnProp(sec, 'straw', [20.4, V, -33], {});
  dnProp(sec, 'torch', [6.1, V + 2.4, -26], { face: 'S' });
  dnProp(sec, 'torch', [25, V + 2.4, -26], { face: 'S' });
  dnProp(sec, 'torch', [16.6, V + 2.4, -27.2], { face: 'N' });
  dnProp(sec, 'grating', [11, V + 4.5 + LIFT, -22.5], { size: [1.6, 1.6] });
  dnProp(sec, 'grating', [27.4, V + 4.5 + LIFT, -22.5], { size: [1.6, 1.6] });
  dnProp(sec, 'drip', [7.4, V + 4.1 + LIFT, -24], {});
  dnProp(sec, 'drip', [18.6, V + 4.1 + LIFT, -21], {});
  dnProp(sec, 'drip', [29.4, V + 4.1 + LIFT, -23.4], {});
  dnProp(sec, 'puddle', [9, V, -22.4], { radius: 1.1 });
  dnProp(sec, 'puddle', [20, V, -23.2], { radius: 1.4 });

  // The way-marks: the main line only (the branches are left dim).
  sec.decor.push({ kind: 'waymarks', points: [[9, -22.5, V], [17, -22.5, V], [25, -22.5, V], [32, -22.5, V]], gap: 2.1, first: 0.4 });
  sec.portals.push({ to: 'quad', area: [{ at: [5.7, -9], size: [13, 20], y: [8.4, 12] }, { at: [24.7, -11], size: [11, 18], y: [8.4, 12] }] });
  sec.portals.push({ to: 'tower', area: { at: [41, -22.5], size: [14, 10], y: [8.4, 14.6] } });
  // The crypt wakes while he is on the well shaft's stair (any height of it) or at the head of the stair from the sea-gate.
  sec.portals.push({ to: 'crypt', area: [{ at: DN_SHAFT.at, size: [11.4, 11.4], y: [2.4, 9] }, { at: [1.7, -32.3], size: [3.6, 10], y: [2.4, 9] }] });

  // Men: skeletons are scenery; the jailers and the turnkey are not. Two prisoners behind the barred door.
  dnSpawn(sec, 'jailer1', 'dunnottarGuard', 'enemy', 2, [12, V, -21.4], DN_FACE.W, { inputs: { name: 'Jailer Wyllie' }, patrol: [[12, -21.4], [12, -24.2]] });
  dnSpawn(sec, 'turnkey', 'turnkey', 'enemy', 2, [23.5, V, -22.4], DN_FACE.W, { inputs: { name: 'The Turnkey' } });
  dnSpawn(sec, 'miner', 'cabyMiner', 'prisoner', 0, [14.4, V, -33.2], DN_FACE.S, { inputs: { name: 'Bran the miner' }, follows: true });
  dnSpawn(sec, 'captive', 'cabySoldier', 'prisoner', 0, [18.8, V, -33.2], DN_FACE.S, { inputs: { name: 'One-Eye Colm' }, follows: true });

  dnItem(sec, 'note-ledger', 'note', [29.6, V, -25.4], { note: 'ledger', lift: 0.95 });
  dnItem(sec, 'cellkey', 'key', [31.6, V, -26.2], { label: 'Take the cell key', lift: 1.2 });
  dnItem(sec, 'bandage6', 'bandage', [2.4, V, -20]);
  dnItem(sec, 'tonic4', 'tonic', [16.4, V, -29.4]);

  buildTortureChamber(sec);
  buildStores(sec);
  buildShaft(sec);
  return sec;
}

/** The torture chamber, north-west of the cellar: the rack, a brazier, a man who did the work and one who died of it; the stair down to the sea-gate behind bars. */
function buildTortureChamber(sec) {
  const wallTop = V + 4.6;
  // The floor east of the stairwell; the west strip is the stair itself, a flight of 23 treads from the sea-gate chamber (it starts inside it) up to this floor at
  // z -29.4, a landing of the floor's own beyond the head of it. Half way up it is shut by a heavy door (`cryptgate`), which the lever below opens.
  dnSlab(sec, 4.0, 10.0, -35.2, -27.6, V, 'flags', { bottom: V - FLOOR, extra: { room: true } });
  dnSlab(sec, 0, 4.0, -29.5, -27.6, V, 'flags', { bottom: V - FLOOR, extra: { room: true } });
  dnRun(sec, [-0.8, -36.4], [-0.8, -27.6], 1.6, V - 1, wallTop, 'rubble');
  dnRun(sec, [-1.6, -35.8], [11.0, -35.8], 1.2, V - 1, wallTop, 'rubble');
  dnCeiling(sec, 0.2, 9.8, -35, -27.8, V + HEAD, V + 4.55);
  sec.decor.push({ kind: 'vault', a: [0, -31.4, V + 3.1 + (HEAD - 3.6)], b: [10, -31.4, V + 3.1 + (HEAD - 3.6)], width: 7.6, crown: 1.3, ribs: 4.1, style: 'vault' });
  const steps = 23;
  const tread = 0.33;
  dnFlight(sec, { foot: [1.7, -37.0], dir: 'S', steps, tread, width: 3.4, from: C, rise: (V - C) / steps, style: 'cobble' });
  // The east side of the stairwell: a wall from the sea-gate chamber's floor to a balustrade's height over this one; and the door across the flight.
  dnBox(sec, 3.4, 4.0, -35.2, -29.5, C - 0.6, V + 1.1, 'rubble');
  dnBox(sec, 0, 3.4, -33.15, -32.85, C + 5.4, V + 3.6, 'rubble');
  dnGate(sec, 'cryptgate', [1.7, C + 2.6, -33.0], [{ ...wallOf([1.7, -33.0], [3.4, 0.3], C + 2.4, C + 5.4, { id: 'cryptgate' }), style: 'iron', skin: false }], { kind: 'door', width: 3.4, height: 3.0, hinge: 'x-', leaf: 'oak' });
  // What is in it: a rack, a brazier, a table of tools, a chained man; a questioner on his feet and a man who was not.
  dnProp(sec, 'rack', [7.2, V, -33.2], { yaw: 0 });
  dnProp(sec, 'brazier', [9.2, V, -28.8], { lit: true });
  dnProp(sec, 'table', [5.4, V, -29.2], { yaw: 0 });
  dnProp(sec, 'tools', [5.4, V + 0.86, -29.2], { yaw: 0.3 });
  dnProp(sec, 'bucket', [8.9, V, -34.4], {});
  dnProp(sec, 'skeleton', [9.9, V, -31.2], { yaw: Math.PI, chained: true });
  dnProp(sec, 'chains', [9.9, V + 2.4, -33.8], {});
  dnProp(sec, 'bones', [6, V, -31.4], { yaw: 0.8 });
  dnProp(sec, 'puddle', [6.6, V, -31], { radius: 0.9 });
  dnProp(sec, 'torch', [5.0, V + 2.4, -35.1], { face: 'S' });
  dnProp(sec, 'torch', [9.9, V + 2.4, -29.4], { face: 'W', dim: true });
  dnProp(sec, 'drip', [8, V + 3.4 + (HEAD - 3.6), -30], {});
  dnSpawn(sec, 'questioner', 'dunnottarGuard', 'enemy', 2, [8.4, V, -30.6], DN_FACE.N, { inputs: { name: 'The Questioner' } });
  dnItem(sec, 'bandage10', 'bandage', [7.6, V, -34.4]);
}

/** The stores, south of the cellar: a short passage, a hall of barrels and crates, and at its end a tunnel that fell in. */
function buildStores(sec) {
  // The passage: from the cellar's south wall (its door at x 15.2) to the hall's north door.
  dnRoom(sec, { x0: 13.6, x1: 16.8, z0: -17.4, z1: -14.4, floor: V, head: HEAD, over: 0.4, walls: ['w', 'e'], slab: { bottom: V - FLOOR }, vault: { crown: 1.0, ribs: 3 } });
  // The hall.
  dnRoom(sec, {
    x0: 11, x1: 19.4, z0: -13.4, z1: -6.2, floor: V, head: HEAD, over: 0.4, walls: ['n', 's', 'e', 'w'], slab: { bottom: V - FLOOR },
    doors: { n: [{ at: 15.2, width: 3.2, top: V + 3.4 }], s: [{ at: 15.2, width: 3.2, top: V + 3.2, solid: true }] },
  });
  dnProp(sec, 'barrel', [11.9, V, -12.5], { yaw: 0.3 });
  dnProp(sec, 'barrel', [11.9, V, -11.2], { yaw: 1.3 });
  dnProp(sec, 'barrel', [12.9, V, -12.7], { yaw: 0.9 });
  dnProp(sec, 'crate', [18.5, V, -12.4], { yaw: 0.2 });
  dnProp(sec, 'crate', [18.5, V, -11.4], { yaw: 0.1 });
  dnProp(sec, 'crate', [18.5, V + 0.7, -12.0], { yaw: 0.35 });
  dnProp(sec, 'powderkeg', [18.6, V, -9.4], { yaw: 0.2 });
  dnProp(sec, 'powderkeg', [17.9, V, -9.0], { yaw: 0.9 });
  dnProp(sec, 'table', [14.2, V, -9.4], { yaw: 0 });
  dnProp(sec, 'sack', [12.0, V, -8.4], {});
  dnProp(sec, 'brokencrate', [18.4, V, -6.9], { yaw: 0.4 });
  dnProp(sec, 'weaponrack', [11.6, V, -9.8], { yaw: Math.PI / 2 });
  // The tunnel: an arch in the south wall choked with the roof that fell, and a draught that leans the torch toward it.
  dnProp(sec, 'rubbleheap', [14.4, V, -6.9], { size: 1.0 });
  dnProp(sec, 'rubbleheap', [16.0, V, -6.9], { size: 1.0 });
  dnProp(sec, 'torch', [12.0, V + 2.4, -6.3], { face: 'S' });
  dnProp(sec, 'torch', [16.9, V + 2.4, -13.3], { face: 'S', dim: true });
  dnProp(sec, 'drip', [13.4, V + 3.5 + (HEAD - 3.6), -10], {});
  dnProp(sec, 'puddle', [15.4, V, -11], { radius: 1.2 });
  dnSpawn(sec, 'storeman', 'dunnottarSoldier', 'enemy', 1, [14.2, V, -12], DN_FACE.E, { inputs: { name: 'Quartermaster Dow' }, patrol: [[14.2, -12], [17, -12], [17, -10.5], [14.2, -10.5]] });
  dnItem(sec, 'tonic6', 'tonic', [18.3, V, -7.9]);
  dnItem(sec, 'note-cellar', 'note', [14.2, V, -9.4], { note: 'cellar', lift: 0.95 });
}

/** The well shaft: a twelve-sided room east of the dungeon hall; a winding stair of one turn down to the crypt, a landing over the first quarter of it and the cellar's door onto the landing. */
function buildShaft(sec) {
  const [cx, cz] = DN_SHAFT.at;
  const R = DN_SHAFT.radius;
  const corner = (k) => [cx + R * Math.cos(Math.PI / 12 + (k * Math.PI) / 6), cz + R * Math.sin(Math.PI / 12 + (k * Math.PI) / 6)];
  const top = V + 4.4;
  // The crypt's floor under it, and the walls round: every side but the south one, which is the cellar's own north wall above and the gallery's below.
  dnSlab(sec, cx - 6, cx + 6, cz - 6, cz + 6, C, 'flags', { extra: { room: true } });
  // (The sides either side of the door stop short of it, by the wall's half thickness and a little: at full length their inner corners stood in the
  // cellar's doorway, a jamb of rubble half across it.)
  const toward = (p, q, by) => {
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return [p[0] + ((q[0] - p[0]) * by) / length, p[1] + ((q[1] - p[1]) * by) / length];
  };
  for (let k = 0; k < DN_SHAFT.sides; k += 1) {
    if (k === 2) continue;
    const a = k === 3 ? toward(corner(3), corner(4), 0.9) : corner(k);
    const b = k === 1 ? toward(corner(2), corner(1), 0.9) : corner(k + 1);
    dnRun(sec, a, b, 1.4, C - 1, top, 'rubble', [], { round: true });
  }
  dnCeiling(sec, cx - 4.6, cx + 4.6, cz - 4.6, cz + 4.6, V + 4.2, V + 4.6);
  const treads = windingStairs({ ...DN_SHAFT_SPIRAL, id: 'oubliette' }).map((t) => ({ ...t, bottom: t.top - 0.55, style: 'stone' }));
  sec.terrain.push(...treads);
  sec.terrain.push({ ...wallOf([cx, cz], [1.2, 1.2], C - 0.5, V + 1.1, { id: 'shaftwell' }), style: 'newel' });
  sec.decor.push({ kind: 'spiral', ...DN_SHAFT_SPIRAL, rope: true, rail: 4.1 });
  // The landing: the south-west of the room at the cellar's floor, over the first treads; a rail along its open north edge; a threshold across the door.
  dnSlab(sec, cx - 4.9, cx + 0.4, cz - 0.4, -27.6, V, 'flags', { bottom: V - FLOOR });
  dnSlab(sec, cx - 1.8, cx + 1.8, -28.6, -27.6, V, 'flags', { bottom: V - FLOOR });
  dnBox(sec, cx - 4.9, cx - 0.6, cz - 0.55, cz - 0.25, V - 0.6, V + 1.1, 'rubble');
  // The sea, the damp, a well-head's worth of ironwork: a lit brazier on the landing (the only light the shaft has but its torches).
  dnProp(sec, 'brazier', [cx - 3.4, V, cz + 3.6], { lit: true });
  dnProp(sec, 'torch', [cx + 2.8, V + 2.4, -27.3], { face: 'N', dim: true });
  dnProp(sec, 'drip', [cx - 1.6, V + 4.3, cz - 1.6], {});
  dnItem(sec, 'bandage9', 'bandage', [cx - 3.8, V, cz + 1.4]);
}

// ---- 5b. The Crypt ---------------------------------------------------------------------------------------

export function buildCrypt() {
  const sec = dnSection('crypt', 'The Crypt');
  // Under the cellar's floor: drawn in detail only while he is in it or on the shaft stair (active), never merely seen through a portal's mouth from the room above (where it is hidden under the floor).
  sec.activeOnly = true;
  // (The well shaft's own height range is the vault's: the crypt holds the stair's foot and what it leads to.)
  dnBounds(sec, { at: [16.4, -29.2], size: [35.2, 22], y: [-1, 5.4] }, { at: [1.7, -32.3], size: [3.6, 10], y: [-1, 9] }, { at: [28.6, -32.4], size: [11.4, 11.4], y: [-1, 3.2] });
  const top = C + 4.2;
  // The gallery under the cellar: dry from the shaft's door west to x 10.4, then the flood: a bed a stride lower than the causeway that crosses it.
  dnSlab(sec, 10.4, 34, -27.2, -21.8, C, 'flags', { extra: { room: true } });
  dnSlab(sec, 3.6, 10.4, -27.2, -21.8, C - 0.4, 'flags', { extra: { room: true } });
  dnSlab(sec, 4.6, 10.4, -25.1, -23.3, C, 'flags');
  dnRoom(sec, {
    x0: 4.6, x1: 33, z0: -26.2, z1: -22.8, floor: C, head: 3.6, walls: ['n', 's', 'e'], slab: false, foot: C - 1,
    doors: { n: [{ at: 6.2, width: 3.2, top: C + 3.4 }, { at: 16.6, width: 3.2, top: C + 3.4 }, { at: 28.6, width: 2.6, top: C + 3.4 }], s: [{ at: 16.9, width: 2.8, top: C + 3.2 }] },
  });
  dnRun(sec, [4.1, -29.5], [4.1, -21.8], 1, C - 1, top, 'rubble');
  dnBox(sec, 3.4, 4.6, -35.2, -29.5, C - 0.6, top, 'rubble');
  // The flooded way north: a bed and a causeway down its middle, to the sea-gate.
  dnSlab(sec, 4.6, 7.8, -35.4, -26.2, C - 0.4, 'flags', { extra: { room: true } });
  dnSlab(sec, 5.4, 7.0, -35.4, -23.3, C, 'flags');
  dnRun(sec, [8.3, -36.4], [8.3, -26.2], 1, C - 1, top, 'rubble');
  dnCeiling(sec, 4.7, 7.7, -35.3, -26.3, C + 3.6, C + 4.2);
  sec.decor.push({ kind: 'vault', a: [6.2, -35.4, C + 3.1], b: [6.2, -26.2, C + 3.1], width: 3.2, crown: 1.0, ribs: 3, style: 'vault' });
  // The ossuary: a hall of skulls north of the gallery, pillared.
  dnRoom(sec, {
    x0: 11, x1: 22.2, z0: -35.4, z1: -27.2, floor: C, head: 3.6, walls: ['n', 'e', 'w'], foot: C - 1, slab: { bottom: undefined }, vault: { crown: 1.3, ribs: 3.7 },
  });
  // The keepers' tombs: a dead end south of the gallery.
  dnRoom(sec, { x0: 12.8, x1: 21, z0: -21.8, z1: -18.4, floor: C, head: 3.4, walls: ['s', 'e', 'w'], foot: C - 1, vault: { crown: 1.1, ribs: 3.7 } });
  // The sea-gate: a landing over the sea, a barred arch, the lever behind a loose stone; the stair back up is the vault's.
  dnRoom(sec, {
    x0: 0, x1: 9.6, z0: -39.2, z1: -35.2, floor: C, head: 3.6, walls: ['n', 'e', 'w'], foot: C - 1, vault: { crown: 1.2, ribs: 3.7 },
    // (The west wall has a low door: the old drain's last stretch comes in by it, `dunnottar-sewer.js`.)
    doors: { n: [{ at: 4.8, width: 4.2, top: C + 3.4, solid: true }], w: [{ at: DN_SEAGATE_DOOR.z, width: DN_SEAGATE_DOOR.width, top: C + 3.0 }] },
  });
  dnRun(sec, [3.4, -34.7], [10.6, -34.7], 1, C - 1, top, 'rubble', [{ at: 6.2 - 3.4, width: 3.2, sill: C, top: C + 3.4, shape: 'round' }]);
  sec.decor.push({ kind: 'seagate', a: [2.7, -39.7], b: [6.9, -39.7], y0: C, y1: C + 3.4 });

  // ---- what is in it ----
  // The gallery: niches of the dead along its north wall, a few chained, a dim torch each way; the flood has dripped and puddled.
  for (const [x, z, yaw] of [[12.2, -25.6, 0.1], [21.0, -25.6, 0], [26.0, -25.6, -0.1], [31.0, -25.6, 0]]) dnProp(sec, 'skeleton', [x, C, z], { yaw, chained: true });
  dnProp(sec, 'bones', [24.2, C, -24.0], { yaw: 0.6 });
  dnProp(sec, 'bones', [13.4, C, -23.4], { yaw: 1.9 });
  dnProp(sec, 'torch', [24.2, C + 2.4, -26.1], { face: 'S', dim: true });
  dnProp(sec, 'torch', [11.4, C + 2.4, -26.1], { face: 'S', dim: true });
  dnProp(sec, 'torch', [31.6, C + 2.4, -22.9], { face: 'N' });
  dnProp(sec, 'drip', [20, C + 3.5, -24.4], {});
  dnProp(sec, 'drip', [27.6, C + 3.5, -23.6], {});
  dnProp(sec, 'drip', [8.2, C + 3.5, -24.4], {});
  // Water (knee-deep in the bed beside the causeway): black and still, a surface just under the causeway's top that rings where a man wades (levelmode/kitwater.js).
  sec.decor.push({ kind: 'water', id: 'cryptflood', shape: 'rect', at: [7.5, C - 0.12, -24.5], size: [5.8, 3.4], bed: C - 0.4, murk: 'clear' });
  sec.decor.push({ kind: 'water', id: 'cryptway', shape: 'rect', at: [6.2, C - 0.12, -30.8], size: [3.2, 9.2], bed: C - 0.4, murk: 'clear' });
  // The ossuary: heaps of skulls, four pillars of bone-stacked stone, one brazier, a sarcophagus broken open.
  for (const [x, z] of [[13.6, -29.4], [19.6, -29.4], [13.6, -33.4], [19.6, -33.4]]) dnProp(sec, 'pillar', [x, C, z], { height: 3.7 });
  dnProp(sec, 'skullpile', [11.9, C, -28.2], { size: 1.0 });
  dnProp(sec, 'skullpile', [21.2, C, -28.2], { size: 1.1 });
  dnProp(sec, 'skullpile', [11.9, C, -34.4], { size: 0.9 });
  dnProp(sec, 'skullpile', [21.2, C, -34.2], { size: 1.2 });
  dnProp(sec, 'sarcophagus', [16.6, C, -33.4], { yaw: 0, broken: true });
  dnProp(sec, 'brazier', [16.6, C, -29.2], { lit: true });
  dnProp(sec, 'bones', [15.4, C, -31.2], { yaw: 0.9 });
  dnProp(sec, 'bones', [18.4, C, -31.8], { yaw: 2.2 });
  dnProp(sec, 'torch', [11.2, C + 2.4, -31.4], { face: 'E', dim: true });
  dnProp(sec, 'drip', [14, C + 3.4, -31], {});
  // The keepers' tombs.
  for (const [x, z, yaw] of [[14.8, -20.6, 0], [17.0, -19.6, 0], [19.4, -20.6, 0]]) dnProp(sec, 'sarcophagus', [x, C, z], { yaw });
  dnProp(sec, 'torch', [16.9, C + 2.4, -18.5], { face: 'N', dim: true });
  dnProp(sec, 'bones', [13.8, C, -19.0], { yaw: 0.4 });
  // The sea-gate: a chest, a rotted bed, the dead man's weapons, a brazier, the lever.
  dnProp(sec, 'chest', [8.6, C, -37.6], { yaw: Math.PI });
  dnProp(sec, 'bed', [7.0, C, -38.6], { yaw: 0 });
  dnProp(sec, 'brazier', [8.8, C, -35.9], { lit: true });
  dnProp(sec, 'torch', [0.5, C + 2.4, -35.8], { face: 'E', dim: true });
  dnProp(sec, 'lever', [9.5, C + 1.2, -37.2], { face: 'W' });
  dnProp(sec, 'weapon', [4.4, C, -38.5], { what2: 'halberd', yaw: 0.8 });
  sec.levers.push({ id: 'seagatelever', at: [8.6, C, -37.2], target: 'cryptgate', state: 'open', label: 'Pull the hidden lever' });

  // (The stair's foot, in the sea-gate chamber, a metre to its side too: a man who stands there is in the stair's way, and the stair is the vault's.)
  sec.portals.push({ to: 'vault', area: [{ at: DN_SHAFT.at, size: [11.4, 11.4], y: [-1, 12] }, { at: [1.7, -32.3], size: [3.6, 10], y: [-1, 12] }, { at: [2.4, -36.2], size: [5, 2.6], y: [-1, 12] }] });

  dnSpawn(sec, 'crypt1', 'dunnottarSoldier', 'enemy', 1, [26.8, C, -24.4], DN_FACE.W, { inputs: { name: 'Watchman Gib' }, patrol: [[26.8, -24.4], [14.6, -24.4]] });
  dnSpawn(sec, 'cryptwarden', 'dunnottarGuard', 'enemy', 2, [15.4, C, -31.4], DN_FACE.E, { inputs: { name: 'The Ossuary Warden' } });
  dnSpawn(sec, 'gatewarden', 'dunnottarSoldier', 'enemy', 1, [5.4, C, -37.2], DN_FACE.S, { inputs: { name: 'Gate-ward Tam' } });

  dnItem(sec, 'tonic7', 'tonic', [17.6, C, -19.4]);
  dnItem(sec, 'note-warden', 'note', [16.6, C, -33.4], { note: 'warden', lift: 1.0 });
  dnItem(sec, 'bandage11', 'bandage', [20.4, C, -34.4]);
  dnItem(sec, 'tonic8', 'tonic', [8.6, C, -37.6], { lift: 0.7 });
  dnItem(sec, 'note-seagate', 'note', [7.0, C, -38.6], { note: 'seagate', lift: 0.7 });
  return sec;
}

