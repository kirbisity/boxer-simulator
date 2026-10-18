// The test yard's third section: the vault, east of the hall (x 50..76, z -10..10), where the
// player's systems are shown (levelmode/level.js): an iron gate across the middle that opens by hand
// from the hall side only, and beyond it a cell with a prisoner behind a locked door (the key lies on a
// table on this side of the gate), a matchlock gunner with damp powder, and a boss dummy with a health bar
// (phase 2 at half health: the helm comes off).
//
//   x 50..56   the near end: the table with the key
//   x 56       the divider wall; the iron gate (gate2) in it, z 5.5..8.5
//   x 56..76   the far end: the cell (x 70..76, z -9..-3, door gate cell1 at x 70), the gunner, the boss

import { slabOf, wallLine, wallOf } from '../../physics/terrain.js';
import { LEVEL_PRESETS } from '../presets.js';

const H = 3;

export const testVault = {
  id: 'vault',
  name: 'The Vault',
  bounds: [{ at: [63, 0], size: [26, 20] }],
  terrain: [
    slabOf([63, 0], [26, 20], 0, { id: 'vaultFloor' }),
    // The outer walls (so that the vault is a room).
    wallLine([50, -10], [76, -10], 0.4, 0, H),
    wallLine([50, 10], [76, 10], 0.4, 0, H),
    wallLine([76, -10], [76, 10], 0.4, 0, H),
    // The divider, with a gap for the iron gate.
    wallLine([56, -10], [56, 5.5], 0.4, 0, H),
    wallLine([56, 8.5], [56, 10], 0.4, 0, H),
    // The cell: walls north, south, east and west (the west with a gap for its door).
    wallLine([70, -9], [76, -9], 0.3, 0, H),
    wallLine([70, -3], [76, -3], 0.3, 0, H),
    wallLine([70, -9], [70, -6.9], 0.3, 0, H),
    wallLine([70, -5.1], [70, -3], 0.3, 0, H),
  ],
  portals: [{ to: 'hall', area: { at: [52, 0], size: [4, 20] } }],
  spawns: [
    // The prisoner in the cell (a Caby miner), freed when the door is unlocked.
    { id: 'miner', preset: 'veteran', inputs: LEVEL_PRESETS.cabyMiner, role: 'prisoner', post: [73.5, 0, -6], facing: Math.PI },
    // A gunner with bad powder, at the far end, his back to the east wall.
    { id: 'gunner', preset: 'matchlock', role: 'enemy', tier: 2, post: [66, 0, 4], facing: Math.PI },
    // The boss dummy: a man in the jousting harness who only stands (to see his bar, the helm come off and the rest).
    { id: 'boss', preset: 'contender', inputs: { ...LEVEL_PRESETS.vaelen, name: 'Lord Vaelen (dummy)', style: 'passive' }, role: 'boss', tier: 3, post: [62, 0, -6], facing: Math.PI, boss: { title: 'Chief Jailer of the Queen' } },
  ],
  items: [
    { id: 'cellkey', kind: 'key', at: [53, 0, -5], label: 'You take the cell key' },
    { id: 'note2', kind: 'note', at: [53, 0, 5], note: 'ledger' },
    { id: 'bandage2', kind: 'bandage', at: [54, 0, 0] },
  ],
  levers: [],
  gates: [
    // The iron gate across the divider: opened by hand, from the near end only.
    { id: 'gate2', at: [55, 0, 7], state: 'closed', opensFrom: { at: [53, 7], size: [6, 4] }, label: 'Open iron gate', states: { closed: [wallOf([56, 7], [0.3, 3], 0, 2.6, { id: 'gate2' })], open: [] } },
    // The cell door: locked, needs the cell key; opening it frees the miner.
    { id: 'cell1', at: [69, 0, -6], state: 'closed', key: 'cellkey', frees: ['miner'], label: 'Unlock cell', states: { closed: [wallOf([70, -6], [0.3, 1.8], 0, 2.6, { id: 'cell1' })], open: [] } },
  ],
  ladders: [],
};
