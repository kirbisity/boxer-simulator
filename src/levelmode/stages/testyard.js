// The test yard: a stage to walk about on while the engine learns stairs. Two
// sections joined by a 10 m corridor (a gate across its mouth, a lever for it):
//
//   yard (x -20..20, z -14..14; the corridor runs on to x 30)
//     - a straight flight of 15 steps (0 to 3 m) to a 3 m ledge, and from it a second flight
//       to a 6 m ledge: jump off either edge (the north edge of the ledges, z -11.5, and their east
//       ends fall to the yard)
//     - a winding stair (24 steps, three quarters of a turn, 3.6 m) up to a landing
//     - a ramp to a low platform; a wall maze; a sea cliff (the yard ends at z 11, the sea is 8 m below)
//     - the corridor: walls, a low ceiling, an iron gate (closed) and its lever
//     - five men to practise on (a sentry with his back to the start, one facing the yard, a roamer on a
//       round, a gardener and a stray prisoner, neutral)
//   hall (x 30..50, z -10..10): three men standing dormant until the player comes down the corridor,
//     a civilian and a prisoner (neutral), a bandage, a rest point.
//
// Written with the terrain builders (physics/terrain.js); every number is a metre.

import { ceilingOf, rampOf, slabOf, stairsOf, wallLine, wallOf, windingStairs } from '../../physics/terrain.js';

const WALL = 2.5;
const WINDING = { at: [-12, 4], inner: 0.6, outer: 2.4, start: -Math.PI / 2, turn: Math.PI * 1.5, steps: 24, from: 0, rise: 0.15 };
const WINDING_EXIT = WINDING.start + (WINDING.turn * 23.5) / WINDING.steps;

const testYard = {
  id: 'yard',
  name: 'The Yard',
  // How far a man sees here (m): the yard is wide, so the practice is closer in than the 25 m of full light.
  vision: 16,
  bounds: [{ at: [0, 0], size: [40, 28] }, { at: [25, 0], size: [10, 4.4] }],
  terrain: [
    // The ground: down to the sea, so that its edge is a cliff.
    slabOf([0, -1.5], [40, 25], 0, { id: 'ground' }),
    // A straight flight of 15 steps (0.2 each) up to the 3 m ledge, a second flight from it to the 6 m ledge.
    stairsOf([-14.75, -9], [4.5, 2], 15, 0, 0.2, { id: 'flight1', bottom: 0 }),
    slabOf([-10, -9], [5, 5], 3, { id: 'ledge3', bottom: 0 }),
    stairsOf([-5.25, -9], [4.5, 2], 15, 3, 0.2, { id: 'flight2', bottom: 0 }),
    slabOf([-0.5, -9], [5, 5], 6, { id: 'ledge6', bottom: 0 }),
    // The winding stair, its landing outward from the last tread.
    ...windingStairs({ ...WINDING, id: 'winding', bottom: 0 }),
    slabOf([WINDING.at[0] + Math.cos(WINDING_EXIT) * 4.4, WINDING.at[1] + Math.sin(WINDING_EXIT) * 4.4], [4, 4], WINDING.from + WINDING.steps * WINDING.rise, { id: 'tower', yaw: -WINDING_EXIT, bottom: 0 }),
    wallOf(WINDING.at, [0.8, 0.8], 0, WINDING.steps * WINDING.rise + 2, { id: 'newel' }),
    // A ramp up to a low platform.
    rampOf([9, 7], [4, 3], 0, 1.2, { id: 'ramp', bottom: 0 }),
    slabOf([12.5, 7], [3, 3], 1.2, { id: 'platform', bottom: 0 }),
    // A maze of walls, open at the west.
    wallLine([6, -12], [17, -12], 0.4, 0, WALL),
    wallLine([17, -12], [17, -3], 0.4, 0, WALL),
    wallLine([17, -3], [6, -3], 0.4, 0, WALL),
    wallLine([6, -3], [6, -6], 0.4, 0, WALL),
    wallLine([6, -9], [6, -12], 0.4, 0, WALL),
    wallLine([9, -12], [9, -6], 0.4, 0, WALL),
    wallLine([12, -3], [12, -9], 0.4, 0, WALL),
    wallLine([14.5, -9], [14.5, -5.5], 0.4, 0, WALL),
    // The corridor: its floor, its walls, a low roof.
    slabOf([25, 0], [10.4, 4.4], 0, { id: 'corridorFloor' }),
    wallLine([20, -2.2], [30, -2.2], 0.4, 0, 3.4),
    wallLine([20, 2.2], [30, 2.2], 0.4, 0, 3.4),
    ceilingOf([25, 0], [10.4, 4.4], 3.2, { top: 3.8 }),
  ],
  portals: [{ to: 'hall', area: { at: [27, 0], size: [6, 4.4] } }],
  // Men of the garrison to practise on: sentry1 stands with his back to the start (walk up behind him), sentry2 faces the yard
  // (the way you come), a roamer walks his round, and a gardener and a stray prisoner are neutral. The first two look
  // the way they are facing: where they see you, they fight.
  spawns: [
    { id: 'sentry1', preset: 'light', role: 'enemy', tier: 1, post: [-8, 0, 3], facing: 0 },
    { id: 'sentry2', preset: 'knight', role: 'enemy', tier: 2, post: [19, 0, 4], facing: Math.PI },
    { id: 'roamer', preset: 'ronin', role: 'enemy', tier: 1, post: [5, 0, 9], facing: -Math.PI / 2, patrol: [[5, 9], [5, 0]] },
    { id: 'gardener', preset: 'amateur', role: 'civilian', post: [-6, 0, 8], facing: Math.PI / 2, patrol: [[-6, 8], [-6, 10]], refuge: [-18, 0, 9] },
    { id: 'stray', preset: 'veteran', role: 'prisoner', post: [-15, 0, 7], facing: 0, refuge: [-18, 0, 9] },
  ],
  items: [{ id: 'tonic1', kind: 'tonic', at: [-16, 0, 9] }],
  levers: [{ id: 'lever1', at: [18.5, 0, -2], target: 'gate1', state: 'open' }],
  gates: [{
    id: 'gate1', at: [22, 0, 0], state: 'closed',
    states: { closed: [wallOf([22, 0], [0.3, 4.4], 0, 2.8, { id: 'gate1' })], open: [] },
  }],
  ladders: [],
};

const testHall = {
  id: 'hall',
  name: 'The Hall',
  bounds: [{ at: [40, 0], size: [20, 20] }],
  terrain: [
    slabOf([40, 0], [20, 20], 0, { id: 'hallFloor' }),
    wallOf([38, 4], [1, 1], 0, 4, { id: 'pillarN' }),
    wallOf([38, -4], [1, 1], 0, 4, { id: 'pillarS' }),
  ],
  portals: [{ to: 'yard', area: { at: [33, 0], size: [6, 20] } }],
  spawns: [
    { id: 'guard1', preset: 'knight', role: 'enemy', tier: 2, post: [44, 0, -3], facing: Math.PI },
    { id: 'guard2', preset: 'ronin', role: 'enemy', tier: 1, post: [44, 0, 3], facing: Math.PI },
    { id: 'guard3', preset: 'light', role: 'enemy', tier: 1, post: [47, 0, 0], facing: Math.PI, patrol: [[47, -5], [47, 5]] },
    { id: 'clerk', preset: 'amateur', role: 'civilian', post: [46, 0, 8], facing: Math.PI },
    { id: 'captive', preset: 'veteran', role: 'prisoner', post: [46, 0, -8], facing: Math.PI },
  ],
  items: [{ id: 'bandage1', kind: 'bandage', at: [34, 0, 5] }],
  levers: [],
  gates: [],
  ladders: [],
  rest: { at: [48, 0, 0] },
};

export const TESTYARD = {
  id: 'testyard',
  title: 'The Test Yard',
  sea: -8,
  start: { section: 'yard', at: [-18, 0, -3], facing: 0 },
  // Followers (freed prisoners) stop on the low platform, as they would at the chapel gate.
  followStopsAt: { at: [12.5, 7], size: [4, 4] },
  sections: [testYard, testHall],
};
