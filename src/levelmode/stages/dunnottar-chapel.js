// Stage 1, Dunnottar: the Sanctuary (section `chapel`, the boss arena) and the Inner Cell behind it (section `cell`). The chapel is a
// large, fully vaulted indoor nave, 30 m by 20: the great door (the chapel gate) in the east end, a barrel vault on ribs 12 m up, an arcade
// of six pillars to a side and an aisle behind each, tall windows in the aisle walls, a chancel with the altar at the west end, and in the
// middle of the chancel wall the heavy arched double doors of the cell (`innerdoor`), lit by a keyhole glow that can be seen from the
// gate; the prince's cell lies directly behind them. Lit warm and low inside by iron chandeliers, votive candles and braziers, the storm
// outside only a cold glimmer in the glass: `interior` (stage.js `interiorAt`, levelmode/storm.js) is how the light changes as he walks in.
//
//   chapel   x -35.2..-2.0, z -47.6..-24.4 (the nave inside: x -33.6..-3.6, z -46..-26; floor y 17.18; ceiling to y 29.2)
//   cell     x -46..-33.8, z -42..-30      (inside: x -44.4..-35.2, z -41.2..-30.8)
//
// The nave's centre (z -42..-30, 12 m wide) is open for the fight; the pillars stand 6 m either side of the axis and 5 m apart.

import { wallOf } from '../../physics/terrain.js';
import { DN_FACE, Y, dnBounds, dnCeiling, dnGate, dnItem, dnProp, dnRoom, dnRun, dnSection, dnSlab, dnSpawn } from './dnbuild.js';

const L = Y.ladderRoom;

/** The chapel's numbers, where the tests and the drawing read them. */
export const DN_CHAPEL = {
  x0: -33.6, x1: -3.6, z0: -46, z1: -26, floor: L,
  axis: -36,
  // The vault: springing from the aisle walls at this height, rising `crown` over it.
  spring: L + 7.4, crown: 4.6,
  // The pillars of the arcade: 6 m either side of the axis, every 5 m from x -6.1 (under the vault's cross ribs).
  pillarX: [-6.1, -11.1, -16.1, -21.1, -26.1, -31.1], pillarOffset: 6,
  // The great doors to the cell, in the west (chancel) wall.
  door: { x: -34.4, z: -36, width: 3.8, height: 4.8 },
  gate: { x: -2.8, z: -36, width: 3.6, height: 4.2 },
};
const CH = DN_CHAPEL;

/** The vault's soffit (y) over a point a distance `dz` from the axis. */
export const dnChapelSoffit = (dz) => CH.spring + CH.crown * Math.sqrt(Math.max(0, 1 - (dz / ((CH.z1 - CH.z0) / 2)) ** 2));

/** The interior's light and air: see stagelooks.js `interiorLevels` for how each number is used. */
export const DN_CHAPEL_INTERIOR = {
  // The storm's sun and its flashes are all but shut out; the sky's light comes only through coloured glass.
  sun: 0.03, flash: 0.1, ambient: 0.2, probe: 0.22, tint: [1.3, 0.95, 0.66],
  hemi: { sky: 0x7a5434, ground: 0x1c120c },
  // A warm, low, smoky air: no sea mist, a near fog of burnt amber.
  fog: { colour: 0x20140c, near: 10, far: 70, mist: 0 },
  wet: 0.25, torch: 0.8, blend: 1.5,
};

/** The cell: dark, with the cold of a slit window; a small warm glow. */
export const DN_CELL_INTERIOR = { ...DN_CHAPEL_INTERIOR, ambient: 0.3, probe: 0.4, fog: { colour: 0x120d0a, near: 6, far: 40, mist: 0 }, torch: 1.4 };

export function buildChapel() {
  const sec = dnSection('chapel', 'The Sanctuary');
  dnBounds(sec, { at: [-18.6, -36], size: [33.2, 23.6], y: [L - 3, 40] });
  sec.interior = DN_CHAPEL_INTERIOR;
  const mid = CH.axis;
  const top = L + 12.2;
  const sideTop = L + 8.3;
  const floor = L;
  // The floor: flagstones, a roof over all.
  // (Two metres thick, not a column to the sea: the old drain runs under it.)
  dnSlab(sec, -35.2, -2, -47.6, -24.4, floor, 'flags', { bottom: floor - 2, extra: { room: true, summit: true } });
  // The long walls (north and south): a tall window in every bay, between the arcade's pillars.
  const windows = CH.pillarX.map((x) => ({ x, width: 1.9, sill: floor + 2.4, top: floor + 7.1 }));
  const wallWindows = windows.map((w) => ({ at: -2 - w.x, width: w.width, sill: w.sill, top: w.top, shape: 'lancet', solid: true }));
  dnRun(sec, [-2, -46.8], [-35.2, -46.8], 1.6, floor - 2, sideTop, 'ashlar', wallWindows, { face: 'chapelNorth' });
  dnRun(sec, [-2, -25.2], [-35.2, -25.2], 1.6, floor - 2, sideTop, 'ashlar', wallWindows, { face: 'chapelSouth' });
  // The east end: the great gate below, a clerestory pair above it.
  dnRun(sec, [-2.8, -47.6], [-2.8, -24.4], 1.6, floor - 2, floor + 5.2, 'ashlar', [{ at: 47.6 - 36, width: CH.gate.width, sill: floor, top: floor + CH.gate.height, shape: 'pointed' }], { face: 'chapelEast' });
  dnRun(sec, [-2.8, -47.6], [-2.8, -24.4], 1.6, floor + 5.2, top, 'ashlar', [-41, -31].map((z) => ({ at: z + 47.6, width: 1.8, sill: floor + 6.4, top: floor + 10.6, shape: 'lancet', solid: true })), { face: 'chapelEastTop' });
  dnGate(sec, 'chapelgate', [-0.6, L, -36], [{ ...wallOf([-2.8, -36], [0.4, CH.gate.width], L, L + CH.gate.height, { id: 'chapelgate' }), style: 'iron', skin: false }], { kind: 'door', width: CH.gate.width, height: CH.gate.height, hinge: 'z-', leaf: 'iron' }, { opensFrom: { at: [3, -36.6], size: [10, 6] }, label: 'Open the chapel gate' });
  // The west end (the chancel's wall): the double doors to the cell low in it, a great window over them.
  const door = CH.door;
  dnRun(sec, [-34.4, -47.6], [-34.4, -24.4], 1.6, floor - 2, floor + 5.6, 'ashlar', [{ at: 47.6 - 36, width: door.width, sill: floor, top: floor + door.height, shape: 'pointed' }], { face: 'chapelWest' });
  dnRun(sec, [-34.4, -47.6], [-34.4, -24.4], 1.6, floor + 5.6, top, 'ashlar', [{ at: 47.6 - 36, width: 5.2, sill: floor + 6.6, top: floor + 11.4, shape: 'pointed', solid: true }], { face: 'chapelWestTop' });
  // The cell's door: shut until the boss has fallen (the ending, levelmode/ending.js, opens it): two heavy arched leaves.
  dnGate(sec, 'innerdoor', [-33.2, L, -36], [{ ...wallOf([door.x, door.z], [0.4, door.width], L, L + door.height, { id: 'innerdoor' }), style: 'iron', skin: false }], { kind: 'doubledoor', width: door.width, height: door.height, leaf: 'oak', keyhole: [door.x + 0.28, L + 1.5, door.z] });
  // The vault: a ribbed barrel over the nave (the ceilings are the physics' own: stepped over it, never lower than the soffit).
  sec.decor.push({ kind: 'vault', a: [CH.x1, mid, CH.spring], b: [CH.x0, mid, CH.spring], width: CH.z1 - CH.z0, crown: CH.crown, ribs: 5, style: 'vault', nave: true });
  const band = (z0, z1, bottom) => dnCeiling(sec, CH.x0, CH.x1, z0, z1, bottom, bottom + 0.8, 'hidden');
  band(CH.z0, mid - 8.4, L + 7.5);
  band(mid - 8.4, mid - 6, L + 9.8);
  band(mid - 6, mid + 6, L + 11);
  band(mid + 6, mid + 8.4, L + 9.8);
  band(mid + 8.4, CH.z1, L + 7.5);
  sec.decor.push({ kind: 'chapelroof', x0: -35.2, x1: -2, z0: -47.6, z1: -24.4, eave: sideTop, ridge: L + 14.6, spring: CH.spring, crown: CH.crown, wall: 1.6 });
  // The arcade: a pillar to a bay either side of the axis, from the floor to the vault.
  for (const x of CH.pillarX) for (const dz of [-CH.pillarOffset, CH.pillarOffset]) dnProp(sec, 'pillar', [x, floor, mid + dz], { height: dnChapelSoffit(CH.pillarOffset) - L - 0.2 });
  // The glass: stained panes in every window (the same ones as the openings above), their colours by bay.
  const hues = ['blue', 'amber', 'red', 'amber', 'blue', 'green'];
  CH.pillarX.forEach((x, k) => {
    for (const z of [-46.8, -25.2]) sec.decor.push({ kind: 'glass', at: [x, floor + 2.4, z], yaw: 0, width: 1.9, height: 4.7, shape: 'lancet', hue: hues[(k + (z < -36 ? 0 : 3)) % hues.length] });
  });
  for (const z of [-41, -31]) sec.decor.push({ kind: 'glass', at: [-2.8, floor + 6.4, z], yaw: Math.PI / 2, width: 1.8, height: 4.2, shape: 'lancet', hue: z < -36 ? 'blue' : 'red' });
  sec.decor.push({ kind: 'glass', at: [-34.4, floor + 6.6, -36], yaw: Math.PI / 2, width: 5.2, height: 4.8, shape: 'pointed', hue: 'rose' });
  // The light: four iron chandeliers down the axis (the lights of the nave), a ring of candles on each; a halo on the floor under each.
  for (const x of [-9.1, -16.1, -23.1, -30.1]) sec.decor.push({ kind: 'chandelier', at: [x, L + 8.4, mid], radius: 1.35, candles: 10, chain: L + 11.2, power: 0.6, range: 22 });
  // The doors' keyhole, its light across the floor, the marks that come when the boss is down.
  sec.decor.push({ kind: 'doorlight', at: [door.x + 0.3, L + 1.5, door.z], floorTo: [-24, door.z], door: 'innerdoor', width: door.width, height: door.height, marks: [6.8, 22] });
  // Votive candles: at the altar's foot, at the pillars' feet and in the aisles' corners, in clusters.
  const votives = [
    [-28.6, -33.6, 8], [-28.6, -38.4, 8], [-27.6, -36, 6],
    [-6.7, -42.9, 5], [-11.7, -43.0, 6], [-16.8, -42.9, 5], [-21.7, -43.0, 6], [-26.8, -42.9, 5], [-31.6, -43.0, 6],
    [-6.7, -29.2, 5], [-11.6, -29.0, 6], [-16.7, -29.2, 5], [-21.8, -29.1, 6], [-26.6, -29.2, 5], [-31.6, -29.0, 6],
    [-4.6, -45.0, 5], [-4.6, -27.0, 5], [-33.0, -45.0, 6], [-33.0, -27.0, 6],
  ];
  for (const [x, z, count] of votives) sec.decor.push({ kind: 'votive', at: [x, floor, z], count });
  // The altar and what is on it; braziers either side of the doors; a few relics of the ruin.
  dnProp(sec, 'altar', [-30.2, floor, mid], { yaw: 0 });
  dnProp(sec, 'brazier', [-32.2, floor, -40.8], { lit: true });
  dnProp(sec, 'brazier', [-32.2, floor, -31.2], { lit: true });
  dnProp(sec, 'brazier', [-9.0, floor, -44.6], { lit: true });
  dnProp(sec, 'brazier', [-9.0, floor, -27.4], { lit: true });
  dnProp(sec, 'pew', [-12.6, floor, -44.7], { yaw: Math.PI / 2, broken: true });
  dnProp(sec, 'pew', [-18.6, floor, -27.3], { yaw: Math.PI / 2 });
  dnProp(sec, 'pew', [-24.4, floor, -44.7], { yaw: Math.PI / 2 });
  dnProp(sec, 'rubble', [-5.0, floor, -44.8], { size: 1.0 });
  dnProp(sec, 'rubble', [-20.4, floor, -27.4], { size: 0.9 });
  dnProp(sec, 'gravestone', [-5.2, floor, -28.4], { yaw: 0.2 });
  dnProp(sec, 'weapon', [-7.4, floor, -37.4], { what2: 'sword', yaw: 1.4 });
  dnProp(sec, 'banner', [-14.0, floor + 3.0, -45.2], { yaw: Math.PI / 2, torn: true });
  dnProp(sec, 'banner', [-24.6, floor + 3.0, -26.8], { yaw: -Math.PI / 2 });
  dnItem(sec, 'note-order', 'note', [-30.2, floor, -35.0], { note: 'order', lift: 1.35 });
  // (Overlapping the wall walk's end at x -2, so that the walk stays awake the whole way in: a gap here dropped the wall walk's floor for a step.)
  sec.portals.push({ to: 'tower', area: { at: [-5, -36], size: [7, 7] } });
  sec.portals.push({ to: 'cell', area: { at: [-34.4, -36], size: [10, 8] } });
  dnSpawn(sec, 'vaelen', 'vaelen', 'boss', 4, [-22, floor, mid], DN_FACE.E, { inputs: { name: 'Lord Vaelen' }, boss: { title: "The Queen's Chief Jailer" } });
  return sec;
}

export function buildCell() {
  const sec = dnSection('cell', 'The Inner Cell');
  dnBounds(sec, { at: [-40.2, -36], size: [12.8, 13], y: [L - 3, 40] });
  sec.interior = DN_CELL_INTERIOR;
  // Directly behind the chancel's double doors: a room of 9 m by 10, a low vault, a slit of cold light.
  dnRoom(sec, {
    x0: -44.4, x1: -35.2, z0: -41.2, z1: -30.8, floor: L, head: 4.0, thick: 1.4, style: 'rubble', walls: ['n', 's', 'w'], foot: L - 2, slab: { bottom: L - 2, extra: { room: true } },
    doors: { w: [{ at: -36, width: 0.6, sill: L + 2.6, top: L + 3.9, shape: 'slit', solid: true }] }, vault: { crown: 1.4, ribs: 4.6 },
  });
  dnProp(sec, 'straw', [-42.8, L, -39.4], {});
  dnProp(sec, 'straw', [-43.2, L, -38.6], {});
  dnProp(sec, 'bucket', [-43.4, L, -32.2], {});
  dnProp(sec, 'chains', [-45.0, L + 2.0, -39.4], {});
  dnProp(sec, 'torch', [-39.4, L + 2.4, -41.0], { face: 'S', dim: true });
  dnProp(sec, 'chalice', [-42.0, L + 0.3, -38.0], { shards: true });
  sec.portals.push({ to: 'chapel', area: { at: [-35, -36], size: [10, 11] } });
  dnSpawn(sec, 'prince', 'cabyPrince', 'civilian', 0, [-42.4, L, -36], DN_FACE.E, { inputs: { name: 'The Prince of Caby' } });
  return sec;
}

/** Where the prince cowers once the ending begins, and the other numbers `stage.ending` needs for this layout. */
export const DN_ENDING = { door: 'innerdoor', prince: 'prince', trigger: 3.8, corner: [-43.4, -40.0] };
