// Stage 1, "Memories of Dunnottar": a storm-swept sea-cliff fortress, as stage data (levelmode/stage.js
// describes the format; physics/terrain.js the solids). Modelled on the real castle: a flat-topped
// black-rock headland with sheer cliffs to a stormy sea, joined to the mainland by a low neck; a fenced
// switchback path down the mainland slope into the gorge, a ravine of the sea crossed by a drawbridge to the gate; the gatehouse
// with its oillets (gun loops) over a steep stair; barrel-vaulted cellars; a winding tower stair; ruined
// ranges round a quadrangle (a lane between them, not a field); a roofless chapel. Doorways, passages and vaults are 1.5-2x real size
// (camera room). Above ground the way is one way: a lane or a stair or a walk, walled, fenced or edged with a drop, never open ground (test/dunnottarlane.test.js).
//
// The order of the sections: by the front, cliff, gate, ascent, quad, vault, quad again, tower, chapel; by the old drain, cliff, sewer, crypt, vault, quad, tower, chapel. The cellar has no
// way into the keep: the stairs out of it (the west stair, the iron gate's) come up in the court, and the keep's door in the court's east wall is locked with the turnkey's key.
//
// The world, one continuous map (x east, z south, y up; every number is a metre):
//
//   cliff   The Cliff Path     mainland x -126..-50, z -10..58 : start (-114, 14, -4) down three fenced legs and a
//                              stair to the gorge shelf (y 0, x -64..-26), Rest 1 at its brazier; the ravine (x -26..-12) and its drawbridge to
//                              the barbican (archers) and the forecourt (x -12..-6.8) before the great gate; at the bridge's head the sea cave's lit stair
//   gate    Gatehouse & Oillets x -8..31, z 38..58           : the great gate (closed: Shortcut 1) and the ledge round to a
//                              postern, where Sir Alasdair (a man-at-arms in full plate) holds the way; the guard hall, a steep stair up to the oillet wall, and the gallery behind it
//   ascent  Tunnelled Ascent    x 9..29, z 5..42             : vestibule, two stair flights and a guard room up to the quad (y 12.18)
//   quad    The Quadrangle      x -2..46, z -38..8  (y>=9.8)  : the court as a lane between ruined ranges (see buildQuad): east along the south band, west along the middle band (the
//                              well, Rest 2, the iron-gate stair's head) to the west stair-house; branches that end (the alley to the kitchen and the ladder, the Lodging); lane C
//                              from the junction up to the keep's door in the east wall (locked)
//   vault   Whigs' Vault        x -2..46, z -39..-3 (y 3..11.5): the long cellar (floor y 6), the cell hall, the iron gate (its bar lifted from the cellar side) and its stair up to the
//                              court, the turnkey's desk with the keep's key; off the cellar the torture chamber, the stores and the well shaft (dunnottar-vault.js)
//   crypt   The Crypt           x -1..34, z -40..-18 (y -1..5.4): under the cellar, by the shaft's winding stair: gallery, ossuary, tombs, a
//                              flooded way on a causeway to the sea-gate (its stair up to the torture chamber shut by a heavy door nothing opens)
//   sewer   The Old Drain      x -56..0, z -40..56 (y -5..1.4): the way round the guarded gate: a sea cave at the foot of the gorge shelf (its mouth, its stair and its
//                              lantern are the cliff path's), a grotto, a long drain, a flooded cistern, two stairs, the cesspool, and a low door into the crypt's
//                              sea-gate chamber, from which the way on is through the crypt and up the well shaft into the cellar (dunnottar-sewer.js)
//   tower   Tower House & Upper Walls: the keep hall (y 12.18), the winding tower stair (to y 24.93), the north wall walk, a stair
//                              down to the ladder room (y 17.18: Shortcut 2 kicks a ladder down into the quad) and Rest 3
//   chapel  The Sanctuary       x -35..-2, z -48..-24 (y 17.18): the fully vaulted summit nave, 30 x 20 m, Lord Vaelen; the cell's double doors in its west end
//   cell    The Inner Cell      x -46..-34, z -42..-30         : directly behind the chancel doors; after the boss: the prince (dunnottar-chapel.js)
//
// A section's `decor` is for the drawing only (levelmode/kit.js): wall runs with openings, vaults, props. The solids
// that make the physics carry a `style` (how they are drawn) and, when a run draws them instead, `skin: false`.

import { ceilingOf, rampOf, stairsOf, wallLine, wallOf, windingStairs, windingTread } from '../../physics/terrain.js';
import { buildChapel, buildCell, DN_ENDING } from './dunnottar-chapel.js';
import { buildCrypt, buildVault, DN_COVERED, DN_SHAFT_SPIRAL, DN_VAULT_STEPS } from './dunnottar-vault.js';
import { buildSeaCave, buildSewer, DN_CAVE, DN_CAVE_STAIR, DN_CESSPOOL_REGION } from './dunnottar-sewer.js';
import { dnInteriorRooms, dnLightDecor } from './dunnottar-light.js';
import { mainlandHeight } from '../landform.js';
import { DN_FACE, DN_LEVELS, DN_PATH, DN_Y, Y, dnBounds, dnBox, dnCeiling, dnFence, dnFlight, dnFlightVault, dnFlightWalls, dnGate, dnItem, dnLerp, dnProp, dnRun, dnSection, dnSlab, dnSpawn } from './dnbuild.js';

export { DN_FACE, DN_LEVELS, DN_PATH, DN_Y } from './dnbuild.js';

// ---- Scenery that is solid ----------------------------------------------------------------------

/** The mainland's height (y) at (x, z), away from the paths: the hillside's plane (kit.js draws it from `landform.mainland`). */
const dnGround = (x, z) => Math.min(16, 12 - 0.27 * (z + 4));

/** Every crag's lump and its wall, to be set on the drawn hillside when the stage is whole (dnSettle). */
const DN_LUMPS = [];

/** Crags and boulders: [x, z, rx, ry, rz] each, standing in the hillside (drawn as lumps of rock with tufts at their feet) and a wall of the same footprint that keeps men out. */
function dnOutcrop(sec, crags) {
  const lumps = [];
  crags.forEach(([x, z, rx, ry, rz], k) => {
    const base = dnGround(x, z) - 1.4;
    const lump = { at: [x, base, z], r: [rx, ry, rz], seed: 7 + k + Math.floor(Math.abs(x + z)) };
    const wall = { ...wallOf([x, z], [rx * 1.5, rz * 1.5], base - 1, base + ry * 1.3, {}), style: 'hidden', skin: false };
    lumps.push(lump);
    sec.terrain.push(wall);
    DN_LUMPS.push([lump, wall]);
  });
  sec.decor.push({ kind: 'outcrop', lumps });
}

/** A cairn of stacked stones standing on the ground at (x, z): drawn, and a post of a wall under it. */
function dnCairn(sec, x, z) {
  const y = Y.start;
  sec.decor.push({ kind: 'cairn', at: [x, y, z] });
  sec.terrain.push({ ...wallOf([x, z], [1.4, 1.4], y - 0.5, y + 1.7, {}), style: 'hidden', skin: false });
}

/**
 * Crags standing on the gorge shelf's own rock, [x, z, rx, ry, rz] each: a lump of rock drawn with tufts at its foot, and a wall of the same footprint that keeps men out
 * (the shelf is level, where dnOutcrop's stand in the hillside). A row of them is a ridge.
 */
function dnShelfRocks(sec, crags) {
  const lumps = crags.map(([x, z, rx, ry, rz], k) => ({ at: [x, Y.gorge - 0.3, z], r: [rx, ry, rz], seed: 21 + k, ground: Y.gorge }));
  for (const [x, z, rx, ry, rz] of crags) sec.terrain.push({ ...wallOf([x, z], [rx * 1.5, rz * 1.5], Y.gorge - 1, Y.gorge + ry * 1.3, {}), style: 'hidden', skin: false });
  sec.decor.push({ kind: 'outcrop', lumps });
}

/** The north edge of the wall walk and its stair (z): 5.2 m from the court-side parapet to the sea-side one, 4.65 clear (the stair was 3.45). */
const DN_WALK_N = -39.2;

// ---- 1. The Cliff Path ----------------------------------------------------------------------

// Three fenced legs down the mainland slope (east, west, east), each 4.4 wide, a landing at each turn, then a
// stair south into the gorge: a shelf of black rock at y 0 with the sea 9 m below its edges.
const DN_L1 = dnLerp(-104, -62, Y.start, Y.pathA);
const DN_L2 = dnLerp(-62.5, -100.5, Y.pathA, Y.pathB);
const DN_L3 = dnLerp(-100.5, -62.5, Y.pathB, Y.pathC);

// ---- The ravine and the drawbridge ----------------------------------------------------------------
//
// Between the gorge shelf (the mainland's last ledge) and the castle rock, the sea runs in through a ravine 14 m wide, sheer on both
// sides, open to the south. The drawbridge is let down across it from the barbican: two squat towers joined by an arch over the
// bridge's end, their tops a fighting platform with archers on it, and the forecourt behind, before the great gate (barred) and the
// ledge round to the postern. Seen from the bridge's head, the gate with its guard is ahead, and the sea cave's lit stair is to the
// right, 4 m off the way: the choice is in view.
//
//                 z 36.6 ── rock face ─────────────────────────────────────────┐
//   gorge shelf   │                          │   ravine (sea, y -9)  │ barbican │ gate hall
//   (y 0)         │                          │                       │ tower N  │ (great gate, x -6)
//   Rest 1 (-44)  │                          ├═══ drawbridge (y 0) ══╡  arch    │ forecourt x -12..-6.8
//                 │                          │   z 44.2..48.2        │ tower S  │
//                 │                          │                       │          ├── ledge to the postern (x -6.8..6.2, z 52.4..55.8)
//   z 56 ─────────┴─ sea-cave stair head ────┘ (x -29.6..-26.2, z 56..59.5)      │
//                 x -41                   x -26                  x -12.6   x -9   x -6.8

/** The ravine (x0..x1) and the drawbridge over it: its deck (z0..z1, its top at y), and the barbican's platform (y) and its extent. */
export const DN_RAVINE = { x0: -26, x1: -12 };
export const DN_BRIDGE = { x0: DN_RAVINE.x0 - 0.4, x1: DN_RAVINE.x1 + 0.4, z0: 44.2, z1: 48.2, y: Y.gorge };
export const DN_BARBICAN = { x0: -14, x1: -11, z0: 39.4, z1: 53, top: 7.2, arch: 4.6 };
/** The embrasures in the barbican's west parapet (z), an archer at each: six, 2.08 m apart (there were three; the user asked for more on the walls). */
export const DN_LOOPS = [0, 1, 2, 3, 4, 5].map((k) => 41.0 + (k * (51.4 - 41.0)) / 5);
/**
 * The barrier before the arch (x, a line across the deck a stride short of the barbican, x0 -14): a timber rail from each of the bridge's rails, leaving a
 * gap `gap` m wide on the deck's middle, and the two men-at-arms shoulder to shoulder in the gap (`knights`: their z), held to it (`pen`, the spawn's:
 * physics.js keepToPen). Two men 0.7 m apart (shoulder to shoulder) in 2 m leave 0.3 m either side and nothing between: no body (0.6 m across) goes past them; the bridge is
 * railed, the barrier's rails too high to step over. The way through is through them.
 */
export const DN_ARCH_BAR = { x: -15.0, gap: 2.0, knights: [45.85, 46.55] };

function buildDrawbridge(sec) {
  const G = Y.gorge;
  const B = DN_BARBICAN;
  const mid = (DN_BRIDGE.z0 + DN_BRIDGE.z1) / 2;
  // The castle side of the ravine: the forecourt, rock, before the gate hall's west wall.
  dnSlab(sec, DN_RAVINE.x1, -6.8, 38, 56, G, 'rock', { extra: { land: true } });
  dnBox(sec, DN_RAVINE.x1, -6.8, 36.6, 38.4, G - 0.5, 3.2, 'rock');
  // The ravine's head: the rock face closes it on the north, down to the sea.
  dnBox(sec, DN_RAVINE.x0, DN_RAVINE.x1, 36.6, 38.4, Y.sea - 1, 3.2, 'rock');
  // The deck: timber, let down across the ravine, its ends on the rock either side (a span: the cliffs under it are drawn whole).
  dnSlab(sec, DN_BRIDGE.x0, DN_BRIDGE.x1, DN_BRIDGE.z0, DN_BRIDGE.z1, DN_BRIDGE.y, 'boards', { bottom: DN_BRIDGE.y - 0.5, extra: { span: true } });
  dnFence(sec, [[DN_RAVINE.x0, DN_BRIDGE.z0 + 0.05, G], [DN_BRIDGE.x1, DN_BRIDGE.z0 + 0.05, G]], { style: 'fence', height: 1.1 });
  dnFence(sec, [[DN_RAVINE.x0, DN_BRIDGE.z1 - 0.05, G], [DN_BRIDGE.x1, DN_BRIDGE.z1 - 0.05, G]], { style: 'fence', height: 1.1 });
  // The barrier across the deck before the arch (DN_ARCH_BAR): a rail from each side, the gap between them the knights'.
  const bar = DN_ARCH_BAR;
  dnFence(sec, [[bar.x, DN_BRIDGE.z0 - 0.1, G], [bar.x, mid - bar.gap / 2, G]], { style: 'fence', height: 1.3 });
  dnFence(sec, [[bar.x, mid + bar.gap / 2, G], [bar.x, DN_BRIDGE.z1 + 0.1, G]], { style: 'fence', height: 1.3 });
  dnProp(sec, 'drawbridge', [(DN_RAVINE.x0 + B.x0) / 2, G, mid], { yaw: 0, length: B.x0 - DN_RAVINE.x0, width: DN_BRIDGE.z1 - DN_BRIDGE.z0, chainTo: [(B.x0 - DN_RAVINE.x0) / 2 - 0.1, B.arch + 1.6] });
  // The barbican: two towers rising from the sea joined by an arch over the bridge's end (a wall run with the arch in it), and on top a
  // platform with crenellated parapets all round: the archers' (there is no way up for him: they are for arrows from afar).
  dnRun(sec, [(B.x0 + B.x1) / 2, B.z0], [(B.x0 + B.x1) / 2, B.z1], B.x1 - B.x0, Y.sea - 1, B.top - 0.05, 'ashlar', [{ at: mid - B.z0, width: DN_BRIDGE.z1 - DN_BRIDGE.z0, sill: G, top: B.arch, shape: 'round' }], { face: 'barbican' });
  dnSlab(sec, B.x0, B.x1, B.z0, B.z1, B.top, 'flags', { bottom: B.top - 0.3 });
  const t = 0.45;
  const parapet = (a, b) => sec.terrain.push({ ...wallLine(a, b, t, B.top - 0.3, B.top + 0.9), style: 'parapet' });
  // (The west parapet, over the bridge, has an embrasure at each archer's post: a gap down to a low sill, through which he looses down the bridge.)
  const loops = DN_LOOPS;
  let from = B.z0 + t / 2;
  for (const z of loops) {
    parapet([B.x0 + t / 2, from], [B.x0 + t / 2, z - 0.6]);
    sec.terrain.push({ ...wallLine([B.x0 + t / 2, z - 0.6], [B.x0 + t / 2, z + 0.6], t, B.top - 0.3, B.top + 0.35), style: 'ashlar' });
    from = z + 0.6;
  }
  parapet([B.x0 + t / 2, from], [B.x0 + t / 2, B.z1 - t / 2]);
  parapet([B.x1 - t / 2, B.z0 + t / 2], [B.x1 - t / 2, B.z1 - t / 2]);
  parapet([B.x0 + t * 1.5, B.z0 + t / 2], [B.x1 - t * 1.5, B.z0 + t / 2]);
  parapet([B.x0 + t * 1.5, B.z1 - t / 2], [B.x1 - t * 1.5, B.z1 - t / 2]);
  // The forecourt's lip over the ravine, north and south of the towers: a low wall.
  dnBox(sec, DN_RAVINE.x1, DN_RAVINE.x1 + 0.45, 38.4, B.z0, G - 0.4, G + 1.1, 'parapet');
  dnBox(sec, DN_RAVINE.x1, DN_RAVINE.x1 + 0.45, B.z1, 56, G - 0.4, G + 1.1, 'parapet');
  // The gate is a killing ground and says so: a lit brazier at the bridge's foot, the bodies of the last who tried, a sign with a skull.
  dnProp(sec, 'brazier', [-8.0, G, 39.4], { lit: true });
  dnProp(sec, 'torch', [B.x0 - 0.05, G + 3.2, DN_BRIDGE.z0 - 0.9], { face: 'W' });
  dnProp(sec, 'torch', [B.x0 - 0.05, G + 3.2, DN_BRIDGE.z1 + 0.9], { face: 'W' });
  dnProp(sec, 'sign', [-27.4, G, DN_BRIDGE.z0 - 0.6], { yaw: 0, warn: true });
  dnProp(sec, 'bones', [-17.5, G, mid + 0.8], { yaw: 1.3 });
  dnProp(sec, 'weapon', [-21, G, mid - 1.1], { what2: 'spear', yaw: 0.2 });
  dnProp(sec, 'raven', [B.x0 + 0.3, B.top + 0.9, B.z0 + 0.3], { yaw: 2.2 });

  // The guard. The front is held to be given up on: it is not meant to be fought through (the sea cave's lit stair, 8 m off, is the way). Over the bridge six archers on the
  // barbican; in front of it, on the shelf, across the bridge's mouth, two men-at-arms, a guard and a crossbowman; before the arch, two men-at-arms shoulder to shoulder in
  // the barrier's gap (they hold it: no dash goes past them); behind it, a crossbowman at each end of the forecourt and a guard at the ledge's corner; and on the ledge Sir Alasdair
  // (the gate section's). It was three archers and three levies (tuned so that the bot got through it), then thirteen men; now sixteen (seven in plate or brigandine, nine with a
  // bow or crossbow). They are one alarm (`alarm`): one who sees him raises them all.
  // (Each watches the bridge, not the shelf beside it: the men at its head face east along the deck with their backs to the way to the sea cave's stair, and the barbican and
  // the arch are too far from it: test/dunnottarbridge.test.js "the front watches the bridge, not the way round".)
  const front = { alarm: 'front', vision: 14 };
  const archer = { ...front, perch: true, vision: 15 };
  // (Once roused, an archer shoots at the man as far as the light lets him see, awareness.js rangeOf: his `vision` is only how far he watches.)
  const ARCHERS = ['Archer Gow', 'Archer Keith', 'Archer Strachan', 'Archer Mowat', 'Archer Duthie', 'Archer Garden'];
  DN_LOOPS.forEach((z, k) => dnSpawn(sec, `archer${k + 1}`, 'dunnottarArcher', 'enemy', 2, [B.x0 + 0.85, B.top, z], DN_FACE.W, { ...archer, inputs: { name: ARCHERS[k] } }));
  // In front of the bridge, on the shelf: facing east along the deck, so that the way to the sea cave's stair (south and west of them) is behind their cones.
  const head = { ...front, vision: 13 };
  dnSpawn(sec, 'frontknight1', 'dunnottarKnight', 'enemy', 3, [-29.6, G, 42.4], DN_FACE.E, { ...head, inputs: { name: 'Sir Hew' } });
  dnSpawn(sec, 'frontknight2', 'dunnottarKnight', 'enemy', 3, [-30.4, G, 47.4], DN_FACE.E, { ...head, inputs: { name: 'Sir Malcolm' } });
  dnSpawn(sec, 'frontguard', 'dunnottarGuard', 'enemy', 2, [-31.8, G, 46.2], DN_FACE.E, { ...head, inputs: { name: 'Sergeant Fyfe' } });
  dnSpawn(sec, 'frontcrossbow', 'dunnottarCrossbow', 'enemy', 2, [-33.8, G, 43.6], DN_FACE.E, { ...head, vision: 11, inputs: { name: 'Crossbowman Tait' } });
  // Before the arch: two men-at-arms in the barrier's gap, shoulder to shoulder, facing the bridge, penned to the spot (a box a step deep and a hand wide):
  // they fight from it and are never drawn out of it, by a feint or by the chase. (They stood 3 m apart at the arch's end in the open forecourt, and a
  // sprint went between them.) Then a crossbowman at each end of the forecourt, a guard at the ledge's corner.
  ['Sir Ure', 'Sir Jock'].forEach((name, k) => {
    const z = DN_ARCH_BAR.knights[k];
    dnSpawn(sec, `bridgeguard${k + 1}`, 'dunnottarKnight', 'enemy', 3, [bar.x, G, z], DN_FACE.W, { ...front, inputs: { name }, pen: { at: [bar.x, z], size: [0.8, 0.3] } });
  });
  // (Bodies give: a man sprinting into them knocked one flat and walked past while he was getting up, in plate, slowly. So the gap is theirs while
  // either stands: their locked shields, a waist-high stop at their backs that nothing draws (`heldBy`: stage.js keepHeld opens it when both are out,
  // and a rest that brings them back shuts it). Waist-high: it hides nothing and stops no blow.)
  sec.gates.push({
    id: 'archbar', at: [bar.x + 0.55, G, mid], state: 'closed', heldBy: ['bridgeguard1', 'bridgeguard2'], look: {},
    states: { closed: [{ ...wallOf([bar.x + 0.55, mid], [0.25, bar.gap + 0.3], G - 0.5, G + 1.2, { id: 'archbar' }), style: 'hidden', skin: false }], open: [] },
  });
  dnSpawn(sec, 'forecourtbow1', 'dunnottarCrossbow', 'enemy', 2, [-8.4, G, 41.0], DN_FACE.W, { ...front, inputs: { name: 'Crossbowman Rhind' } });
  dnSpawn(sec, 'forecourtbow2', 'dunnottarCrossbow', 'enemy', 2, [-8.4, G, 51.0], DN_FACE.W, { ...front, inputs: { name: 'Crossbowman Lyall' } });
  dnSpawn(sec, 'bridgelevy', 'dunnottarGuard', 'enemy', 2, [-8.2, G, 54.6], DN_FACE.W, { ...front, inputs: { name: 'Sergeant Wattie' } });
}

function buildCliff() {
  const sec = dnSection('cliff', 'The Cliff Path');
  // (The mainland and the gorge are above y -1: the sea cave and the old drain run under them, in the `sewer` section; the cave's stair and landing are the third region.)
  dnBounds(sec, { at: [-88, 14], size: [76, 56], y: [-1, 60] }, { at: [-36, 47], size: [60, 22], y: [-1, 60] }, { at: [-39.4, 58.5], size: [27, 5], y: [-6.5, 0.6] });
  // The mainland, where the way begins: a plateau, then L1. The path is DN_PATH wide, rails 0.2 outside its edges; each turn is a landing a little wider.
  const h = DN_PATH / 2;
  const r = h + 0.2;
  dnSlab(sec, -126, -104, -10, 2, Y.start, 'grass', { extra: { land: true } });
  sec.terrain.push({ ...rampOf([-83, -4], [42, DN_PATH], Y.start, Y.pathA, { id: 'leg1' }), style: 'path' });
  dnSlab(sec, -62.5, -58.5, -4 - h, 8 + h, Y.pathA, 'path', { extra: { land: true } });
  sec.terrain.push({ ...rampOf([-81.5, 8], [38, DN_PATH], Y.pathA, Y.pathB, { yaw: Math.PI, id: 'leg2' }), style: 'path' });
  dnSlab(sec, -105, -99.5, 8 - h, 20 + h, Y.pathB, 'path', { extra: { land: true } });
  sec.terrain.push({ ...rampOf([-81.5, 20], [38, DN_PATH], Y.pathB, Y.pathC, { id: 'leg3' }), style: 'path' });
  dnSlab(sec, -62.5, -56.4, 20 - h, 30.8, Y.pathC, 'path', { extra: { land: true } });
  // The stair down to the gorge: 19 treads of 0.2 (3.8 m).
  const down = dnFlight(sec, { foot: [-58, 38.4], dir: 'N', steps: 19, tread: 0.4, width: DN_PATH, from: Y.gorge, rise: 0.2, style: 'cobble' });
  // The gorge shelf: black rock, a cliff to the sea on its south and west; a low rock face on the north. It ends at the ravine, the sea's
  // cut between the mainland and the castle rock, crossed by the drawbridge (below).
  // (The shelf is whole but for a plate over the sea cave, 15 m wide and 1.5 thick, with the cave under it: `faceless`, as the cave's mouth is in its face.)
  dnSlab(sec, -64, -56, 38, 56, Y.gorge, 'rock', { extra: { land: true } });
  dnSlab(sec, -56, -41, 38, 56, Y.gorge, 'rock', { bottom: Y.gorge - 1.5, extra: { land: true, faceless: true } });
  dnSlab(sec, -41, DN_RAVINE.x0, 38, 56, Y.gorge, 'rock', { extra: { land: true } });
  dnBox(sec, -64, -58 - r, 36.6, 38.4, Y.gorge - 0.5, 3.2, 'rock');
  dnBox(sec, -58 + r, DN_RAVINE.x0, 36.6, 38.4, Y.gorge - 0.5, 3.2, 'rock');
  buildDrawbridge(sec);

  // Fences: every leg on both sides, the landings round their outer edges; the stair on both sides.
  const rail = (points, opts) => dnFence(sec, points, opts);
  const c1 = -4;
  const c2 = 8;
  const c3 = 20;
  rail([[-126, 2.1, 14], [-126, -10.1, 14]]);
  rail([[-104, -10.1, 14], [-104, c1 - r, 14]]);
  rail([[-104, 2.1, 14], [-104, c1 + r, 14]]);
  rail([[-126, -10.1, 14], [-103.9, -10.1, 14]]);
  rail([[-126, 2.1, 14], [-103.9, 2.1, 14]]);
  rail([[-104, c1 - r, DN_L1(-104)], [-62.5, c1 - r, DN_L1(-62.5)], [-58.3, c1 - r, Y.pathA], [-58.3, c2 + r, Y.pathA], [-62.5, c2 + r, Y.pathA]]);
  rail([[-104, c1 + r, DN_L1(-104)], [-62.5, c1 + r, DN_L1(-62.5)], [-62.5, c2 - r, Y.pathA]]);
  rail([[-62.5, c2 - r, Y.pathA], [-100.5, c2 - r, DN_L2(-100.5)]]);
  rail([[-62.5, c2 + r, Y.pathA], [-99.4, c2 + r, Y.pathB]]);
  rail([[-100.5, c2 - r, DN_L2(-100.5)], [-105.2, c2 - r, Y.pathB], [-105.2, c3 + r, Y.pathB], [-100.5, c3 + r, Y.pathB]]);
  rail([[-99.4, c2 + r, Y.pathB], [-99.4, c3 - r, Y.pathB]]);
  rail([[-99.4, c3 - r, Y.pathB], [-62.5, c3 - r, DN_L3(-62.5)], [-56.2, c3 - r, Y.pathC], [-56.2, 30.9, Y.pathC]]);
  rail([[-100.5, c3 + r, Y.pathB], [-62.6, c3 + r, DN_L3(-62.6)], [-62.6, 30.9, Y.pathC], [-58 - r, 30.9, Y.pathC]]);
  rail([[-58 - r, 30.9, Y.pathC], [-58 - r, 38.4, Y.gorge]]);
  rail([[-56.2, 30.9, Y.pathC], [-56.2, 38.4, Y.gorge]]);

  // The view is kept from him: rock and boulders flanking the path hide the castle and the island until a bend gives them up (the physics has each of them too).
  // (Crags: [x, z, rx, ry, rz] at the hillside's height; away from the path, so that the cut banks do not run into them.)
  // First a screen of rock beyond the first turn: the castle shows in the mist from the start and is lost behind it.
  dnOutcrop(sec, [[-52, -6, 3.6, 7.4, 3.2], [-48.5, -0.5, 3.0, 5.4, 3.4], [-54.5, -11, 3.0, 5.0, 2.8], [-46.5, -8.5, 2.6, 4.2, 2.5], [-51, 4, 2.4, 3.8, 2.2], [-56, -15, 2.2, 3.0, 2.2]]);
  // The north side of the first leg: boulders and a low crag, to break the long green slope.
  dnOutcrop(sec, [[-88, -13.5, 2.3, 2.6, 2.0], [-81, -12, 1.5, 1.7, 1.4], [-73, -15.5, 2.9, 3.4, 2.4], [-96, -12.6, 1.3, 1.2, 1.3]]);
  // Between the first two legs: a ridge of rock that cuts the view of the slope and the sea.
  dnOutcrop(sec, [[-92, 1.2, 2.0, 2.4, 1.6], [-84, 2.0, 1.5, 1.8, 1.3], [-75, 1.0, 2.4, 3.0, 1.6]]);
  // Between the second and the third: the high rock that hides the castle from the third leg until its end.
  dnOutcrop(sec, [[-90, 14, 3.0, 4.0, 2.4], [-80, 13.6, 2.2, 3.0, 2.2], [-71, 14.2, 3.6, 5.6, 2.4], [-63.5, 14, 1.8, 2.6, 1.8]]);
  // Beyond the third leg's end: the gateway of rock that opens on the gorge as he turns down the stair.
  dnOutcrop(sec, [[-52, 21, 3.4, 6.6, 3.2], [-49.5, 27, 3.0, 5.4, 3.0], [-47, 15, 2.6, 4.4, 2.6], [-45.5, 22.5, 2.0, 3.2, 2.0]]);
  // The outer slope under the third leg: boulders.
  dnOutcrop(sec, [[-95, 26.5, 1.9, 1.7, 1.6], [-84, 27.5, 2.4, 2.4, 2.0], [-73, 25.5, 1.5, 1.3, 1.5], [-68, 28, 1.2, 1.0, 1.2]]);
  // A ruined cairn on the plateau, where the first of the garrison made his mark.
  dnCairn(sec, -119.5, -8);

  // Rest 1: the brazier in the gorge, out of the wind under the rock face.
  sec.rest = { id: 'rest1', name: 'The Gorge Brazier', at: [-44, Y.gorge, 41.5] };
  dnProp(sec, 'brazier', [-44, Y.gorge, 40.4], { lit: true, rest: true });
  // The shelf is two lanes, not a field: a ridge of rock along z 48.8 from x -57 to x -34 (3 m high at the least) parts the north lane (Rest 1, the way east along the foot of the rock
  // face to the bridge's head and the knights) from the south lane (along the shelf's edge to the sea cave's stair head). They part at the stair's foot and meet again at the bridge's
  // head, 8 m wide, where both ways are in sight of each other: the choice is shown, as it was.
  dnShelfRocks(sec, [[-55.4, 48.8, 2.0, 2.4, 1.5], [-52.6, 48.7, 2.0, 2.9, 1.5], [-49.8, 48.9, 2.0, 2.3, 1.5], [-47.0, 48.8, 2.0, 3.0, 1.5], [-44.2, 48.7, 2.0, 2.5, 1.5], [-41.4, 48.9, 2.0, 2.2, 1.5], [-38.6, 48.8, 2.0, 2.8, 1.5], [-35.8, 48.7, 1.9, 2.3, 1.5]]);
  // The worn way: from the foot of the stair the trail of way-marks goes down the south lane to the sea cave's stair head (buildSeaCave), not to the bridge. The front way
  // (the drawbridge, the gatehouse and its archers, the knights at both ends of the bridge) has no marks: what marks it is a warning.
  sec.decor.push({ kind: 'waymarks', points: [[-58, 40.2, Y.gorge], [-58.5, 44.6, Y.gorge], [-57.5, 49.6, Y.gorge], [-54, 52.6, Y.gorge]], gap: 2.0, first: 0.6 });
  // The head of the stair down into the gorge: a trail from the landing over the lip.
  sec.decor.push({ kind: 'waymarks', points: [[-104, -4, DN_L1(-104)], [-97, -4, DN_L1(-97)], [-90, -4, DN_L1(-90)]], gap: 2.4, first: 1.2 });
  sec.decor.push({ kind: 'waymarks', points: [[-66, -4, DN_L1(-66)], [-60.5, -2.4, Y.pathA], [-60.5, 5.6, Y.pathA], [-64, 8, DN_L2(-64)]], gap: 2.0, first: 0.8 });
  sec.decor.push({ kind: 'waymarks', points: [[-98, 8, DN_L2(-98)], [-102.5, 10.5, Y.pathB], [-102.5, 17.5, Y.pathB], [-98, 20, DN_L3(-98)]], gap: 2.0, first: 0.8 });
  sec.decor.push({ kind: 'waymarks', points: [[-66, 20, DN_L3(-66)], [-60.5, 22, Y.pathC], [-58.5, 28, Y.pathC]], gap: 2.0, first: 0.8 });
  // The way on: from the bridge's head to the gatehouse, a portal while he is in it (its men on the walls wake as he sets foot on the bridge).
  sec.portals.push({ to: 'gate', area: { at: [-16.75, 45], size: [21.5, 14] } });
  // The sea cave (the old drain): its mouth at the foot of the shelf's cliff, and the way down to it.
  sec.portals.push({ to: 'sewer', area: { at: [DN_CAVE.x, 58], size: [15, 7], y: [-6.5, 0.5] } });
  buildSeaCave(sec);

  // Story props: a rotting trebuchet and a ram on the mainland, dropped weapons, ravens, wreckage.
  // (On the hillside below the plateau, at the hill's own height: it was put at the plateau's and stood in the air.)
  dnProp(sec, 'trebuchet', [-117, dnGround(-117, 14), 14], { yaw: 0, scale: 1.2 });
  dnProp(sec, 'ram', [-95, DN_L1(-95) , -8.4], { yaw: 0.1 });
  dnProp(sec, 'weapon', [-98, DN_L1(-98), -3], { what2: 'spear', yaw: 1.1 });
  dnProp(sec, 'weapon', [-91, DN_L1(-91), -4.2], { what2: 'sword', yaw: 2.4 });
  dnProp(sec, 'weapon', [-72, DN_L2(-72), 7.2], { what2: 'halberd', yaw: 0.4 });
  dnProp(sec, 'weapon', [-85, DN_L3(-85), 20.4], { what2: 'shield', yaw: 0.7 });
  dnProp(sec, 'weapon', [-30, Y.gorge, 49], { what2: 'sword', yaw: 3.7 });
  dnProp(sec, 'barrel', [-109, 14, -6.5], { yaw: 0.3 });
  dnProp(sec, 'barrel', [-108.2, 14, -8], { yaw: 1.3, tipped: true });
  dnProp(sec, 'cart', [-122, 14, -2], { yaw: -0.5, broken: true });
  dnProp(sec, 'raven', [-120.1, 15.15, -10.1], { yaw: 0.5 });
  dnProp(sec, 'raven', [-62.6, DN_L2(-62.6) + 1.15, 9.8], { yaw: 2.6 });
  dnProp(sec, 'raven', [-60.4, 1.2, 36.6], { yaw: 4.2 });
  dnProp(sec, 'raven', [-36, 3.3, 37.6], { yaw: 3 });
  dnProp(sec, 'raven', [-66, Y.gorge, 55.6], { yaw: 1.5 });
  dnProp(sec, 'bones', [-31, Y.gorge, 50.4], { yaw: 0.6 });
  dnProp(sec, 'banner', [-110, 14, -9.8], { yaw: 0, torn: true });

  // Men: a levy on each leg (the gorge is the front's: the men at the bridge's head, above).
  const post = (x, y, z) => [x, y, z];
  dnSpawn(sec, 'levy1', 'dunnottarSoldier', 'enemy', 1, post(-84, DN_L1(-84), -4.9), DN_FACE.W, { inputs: { name: 'Hob' } });
  dnSpawn(sec, 'levy3', 'dunnottarSoldier', 'enemy', 1, post(-74, DN_L2(-74), 7.1), DN_FACE.E, { inputs: { name: 'Davie' } });
  dnSpawn(sec, 'levy5', 'dunnottarSoldier', 'enemy', 1, post(-86, DN_L3(-86), 20.5), DN_FACE.W, { inputs: { name: 'Rab' } });

  // Things to find.
  dnItem(sec, 'bandage1', 'bandage', [-96, DN_L1(-96), -4.4]);
  dnItem(sec, 'bandage2', 'bandage', [-65, DN_L3(-65), 20.2]);
  dnItem(sec, 'tonic1', 'tonic', [-50, Y.gorge, 44]);
  // On the levy dead at the bridge's head: the warning, and the way round.
  dnItem(sec, 'note-bridge', 'note', [-27.4, Y.gorge, 50.6], { note: 'bridge' });
  return sec;
}

/** m: the head room of the tunnelled flights of the gatehouse and the ascent (over the treads, the roof following the slope): room for the camera behind a man on them. */
const DN_FLIGHT_HEAD = 5;

// ---- 2. The Gatehouse and the Oillets -----------------------------------------------------------

function buildGate() {
  const sec = dnSection('gate', 'The Gatehouse and the Oillets');
  dnBounds(sec, { at: [11, 48], size: [38, 20] });
  const A = Y.landing;
  // The ledge round the foot of the wall: the way in for a man who finds the great gate barred.
  dnSlab(sec, -6.8, 6.2, 52.4, 55.8, Y.gorge, 'rock', { extra: { land: true } });
  dnBox(sec, 6.2, 8.0, 51.4, 56.6, Y.gorge - 1, 5, 'rock');
  // The guard hall (and the nook at its north-west corner, between the gorge's rock face and the wall, filled in).
  dnBox(sec, -6.8, -5.2, 38, 39.6, Y.gorge - 1, 5.8, 'ashlar');
  dnSlab(sec, -6.8, 6.8, 39.6, 52.8, Y.gorge, 'flags', { extra: { room: true } });
  dnRun(sec, [-6, 39.6], [-6, 52.8], 1.6, Y.gorge - 1, 5.8, 'ashlar', [{ at: 6.6, width: 3.2, sill: Y.gorge, top: 3.9, shape: 'round' }], { face: 'gate' });
  dnRun(sec, [-6.8, 40.4], [6.8, 40.4], 1.6, Y.gorge - 1, 5.8, 'ashlar', [{ at: 6, width: 0.5, sill: 2.9, top: 4.4, shape: 'slit', solid: true }, { at: 10.5, width: 0.5, sill: 2.9, top: 4.4, shape: 'slit', solid: true }]);
  dnRun(sec, [-6.8, 52], [6.8, 52], 1.6, Y.gorge - 1, 5.8, 'ashlar', [{ at: 9, width: 3.2, sill: Y.gorge, top: 3.6, shape: 'round' }, { at: 3, width: 0.5, sill: 2.9, top: 4.4, shape: 'slit', solid: true }], { face: 'postern' });
  dnRun(sec, [6, 41.2], [6, 51.2], 1.6, Y.gorge - 1, 5.8, 'ashlar', [{ at: 5, width: 5.4, sill: Y.gorge, top: 4.6, shape: 'round' }]);
  dnCeiling(sec, -5.2, 5.2, 41.2, 51.2, 4.8, 5.8);
  sec.decor.push({ kind: 'vault', a: [-5.2, 46.2, 4.8], b: [5.2, 46.2, 4.8], width: 10, crown: 2.6, style: 'vault' });
  // The great gate: barred from within. A lever on the inside throws the bar (Shortcut 1).
  dnGate(sec, 'cliffgate', [-4.4, Y.gorge, 46.2], [{ ...wallOf([-6, 46.2], [0.4, 3.2], Y.gorge, 3.9, { id: 'cliffgate' }), style: 'iron', skin: false }], { kind: 'door', width: 3.2, height: 3.9, hinge: 'z-', leaf: 'oak' }, { opensFrom: { at: [-1.4, 46.2], size: [7.6, 9.6] }, label: 'Throw the bar of the great gate' });
  // Barrels, a table, a keg with something scratched on it.
  dnProp(sec, 'barrel', [-4.2, Y.gorge, 42.2], { yaw: 0.4 });
  dnProp(sec, 'barrel', [-3.1, Y.gorge, 41.9], { yaw: 1.4 });
  dnProp(sec, 'powderkeg', [3.6, Y.gorge, 42.2], { yaw: 0.2 });
  dnProp(sec, 'table', [0.5, Y.gorge, 49.2], { yaw: 0.1 });
  dnProp(sec, 'crate', [-3.8, Y.gorge, 49.6], { yaw: 0.2 });
  // The postern: a torch each side of it on the sea face, and the marks round the ledge to its door and across the hall to the stair.
  dnProp(sec, 'torch', [0.1, 2.2, 52.85], { face: 'S' });
  dnProp(sec, 'torch', [4.3, 2.2, 52.85], { face: 'S' });
  sec.decor.push({ kind: 'waymarks', points: [[2.2, 50.8, Y.gorge], [3.2, 48.2, Y.gorge], [5.2, 46.2, Y.gorge]], gap: 1.7, first: 0.3 });
  sec.decor.push({ kind: 'waymarks', points: [[16.2, 46.2, A], [17.5, 43.4, A], [17.5, 40.6, A]], gap: 1.8, first: 0.3 });
  dnProp(sec, 'torch', [-5.2, 3, 42.4], { face: 'E' });
  dnProp(sec, 'torch', [5, 3, 50.4], { face: 'W' });
  dnProp(sec, 'torch', [-5.2, 3, 50.4], { face: 'E' });

  // The steep stair up: 22 treads of 0.19, under an arched tunnel.
  // (Its roof 5 m over the treads, walls to match: a third-person camera behind and above a man on it stands under it. It was 3.9: the camera came in to 1.5 m.)
  const stair = dnFlight(sec, { foot: [6.8, 46.2], dir: 'E', steps: 22, tread: 0.34, width: 5.4, from: Y.gorge, rise: A / 22, style: 'cobble' });
  dnFlightWalls(sec, stair, { thick: 2.3, head: DN_FLIGHT_HEAD + 0.8 });
  dnFlightVault(sec, stair, { head: DN_FLIGHT_HEAD });
  sec.terrain.push({ ...wallOf([13.9, 42.3], [0.8, 2.2], A - 1, A + 8, {}), style: 'ashlar', skin: false });
  // The landing before the oillet wall.
  dnSlab(sec, 14.28, 22.1, 39.6, 52.8, A, 'flags', { extra: { room: true } });
  dnRun(sec, [14.28, 40.4], [30.6, 40.4], 1.6, A - 1, A + 5.2, 'ashlar', [{ at: 3.2, width: 5.4, sill: A, top: A + 3.9, shape: 'round' }, { at: 9.8, width: 3.2, sill: A, top: A + 3.6, shape: 'round' }], { face: 'vestibule' });
  dnRun(sec, [14.28, 52], [30.6, 52], 1.6, A - 1, A + 5.2, 'ashlar');
  dnCeiling(sec, 14.3, 20.5, 41.2, 51.2, A + 4.4, A + 5.2);
  sec.decor.push({ kind: 'vault', a: [14.3, 46.2, A + 4.4], b: [20.5, 46.2, A + 4.4], width: 10, crown: 2.2, style: 'vault' });
  // The oillet wall: four round loops at a man's chest and eye (a gap of 0.5 m, the physics sees through it), a wall above and below.
  const wallTop = A + 5.2;
  const holes = [43.2, 45.2, 47.2, 49.2];
  const piers = [[41.2, 43.0], [43.4, 45.0], [45.4, 47.0], [47.4, 49.0], [49.4, 51.2]];
  dnBox(sec, 20.5, 22.1, 41.2, 51.2, A - 1, A + 1.1, 'ashlar', { skin: false });
  dnBox(sec, 20.5, 22.1, 41.2, 51.2, A + 1.6, wallTop, 'ashlar', { skin: false });
  for (const [z0, z1] of piers) dnBox(sec, 20.5, 22.1, z0, z1, A + 1.1, A + 1.6, 'ashlar', { skin: false });
  sec.decor.push({ kind: 'run', a: [21.3, 41.2], b: [21.3, 51.2], thick: 1.6, y0: A - 1, y1: wallTop, style: 'ashlar', openings: holes.map((z) => ({ at: z - 41.2, width: 0.44, sill: A + 1.1, top: A + 1.6, shape: 'oillet' })), face: 'oillets' });
  // The gun gallery behind the wall, with a door out into the vestibule.
  dnSlab(sec, 22.1, 30.6, 39.6, 52.8, A, 'boards', { extra: { room: true } });
  dnRun(sec, [30, 41.2], [30, 51.2], 1.6, A - 1, A + 5.2, 'ashlar');
  dnCeiling(sec, 22.1, 29.2, 41.2, 51.2, A + 3.6, A + 5.2);
  sec.decor.push({ kind: 'vault', a: [22.1, 46.2, A + 3.6], b: [29.2, 46.2, A + 3.6], width: 10, crown: 1.8, style: 'vault' });
  dnProp(sec, 'table', [27.8, A, 44.5], { yaw: 1.5 });
  dnProp(sec, 'powderkeg', [28.4, A, 49.6], { yaw: 0.7 });
  dnProp(sec, 'crate', [28.6, A, 42.2], { yaw: 0.2 });
  dnProp(sec, 'gunrest', [22.9, A, 49.2], { yaw: Math.PI });
  dnProp(sec, 'torch', [27.6, A + 2.6, 41.4], { face: 'S' });
  dnProp(sec, 'torch', [16.5, A + 2.8, 50.5], { face: 'N' });
  dnProp(sec, 'torch', [17.5, A + 2.8, 41.5], { face: 'S' });

  // The way on: up through the landing's north door; and back down.
  sec.portals.push({ to: 'cliff', area: { at: [-3, 47], size: [10, 18] } });
  sec.portals.push({ to: 'ascent', area: { at: [17.5, 45], size: [8, 14] } });

  // Men: a guard in the hall, one at the stair head, and the gunners behind the loops.
  dnSpawn(sec, 'hallguard', 'dunnottarGuard', 'enemy', 2, [-1.5, Y.gorge, 44.2], DN_FACE.S, { inputs: { name: 'Corporal Rae' } });
  dnSpawn(sec, 'gunner1', 'dunnottarMatchlock', 'enemy', 2, [23.4, A, 43.2], DN_FACE.W, { inputs: { name: 'Gunner Mackie' }, station: 'oillet', hole: 0 });
  // The front way's door: a man-at-arms in full plate on the ledge to the postern, looking back along it (the ledge is 3.4 m wide: there is no way past him). The sea cave is the way round.
  dnSpawn(sec, 'gateknight', 'dunnottarPlateKnight', 'enemy', 3, [-3, Y.gorge, 54.1], DN_FACE.W, { alarm: 'front', inputs: { name: 'Sir Alasdair' } });

  dnItem(sec, 'note-powder', 'note', [3.6, Y.gorge, 42.9], { note: 'powder', lift: 0.9 });
  dnItem(sec, 'bandage3', 'bandage', [-4.4, Y.gorge, 50.6]);
  return sec;
}

// ---- 3. The Tunnelled Ascent --------------------------------------------------------------------


// From the gatehouse landing: a vestibule, a first flight (4 m) up to a guard room, a second (4 m) up to the quadrangle's
// south wall. The corridor is the hand-over: the quadrangle's men wake at its head, out of sight.
function buildAscent() {
  const sec = dnSection('ascent', 'The Tunnelled Ascent');
  dnBounds(sec, { at: [19, 23.5], size: [20, 36] });
  const A = Y.landing;
  const B = Y.guardroom;
  const Q = Y.quad;
  // The vestibule: the landing's north door opens into it; the gunners' door too.
  dnSlab(sec, 12.9, 27.4, 31.8, 41.2, A, 'flags', { extra: { room: true } });
  dnBox(sec, 12.9, 14.5, 31.8, 40.4, A - 1, A + 6, 'ashlar');
  dnBox(sec, 25.8, 27.4, 31.8, 40.4, A - 1, A + 6, 'ashlar');
  sec.terrain.push({ ...ceilingOf([20.15, 36.5], [12.5, 8.6], A + 4.4, { top: A + 6 }), style: 'vault', skin: false });
  sec.decor.push({ kind: 'vault', a: [12.9, 36.5, A + 4.4], b: [27.4, 36.5, A + 4.4], width: 9.4, crown: 2.2, style: 'vault' });
  // Flight A north: 20 treads of 0.2.
  const a = dnFlight(sec, { foot: [17.7, 33.4], dir: 'N', steps: 20, tread: 0.4, width: 5.4, from: A, rise: (B - A) / 20, style: 'cobble' });
  // The long side wall west of flight A is the vestibule's; the east one runs on.
  dnFlightWalls(sec, a, { thick: 2.3, head: DN_FLIGHT_HEAD + 0.8 });
  dnFlightVault(sec, a, { head: DN_FLIGHT_HEAD });
  dnBox(sec, 20.4, 25.8, 31.8, 33.4, A - 1, A + 6, 'ashlar');
  // The guard room.
  dnSlab(sec, 9.4, 26.1, 14.8, 25.4, B, 'flags', { extra: { room: true } });
  dnRun(sec, [10.2, 25.4], [10.2, 14.8], 1.6, B - 1, B + 6.4, 'ashlar', [{ at: 4.2, width: 0.5, sill: B + 2.4, top: B + 3.6, shape: 'slit', solid: true }]);
  dnRun(sec, [25.3, 25.4], [25.3, 14.8], 1.6, B - 1, B + 6.4, 'ashlar', [{ at: 5.2, width: 0.5, sill: B + 2.4, top: B + 3.6, shape: 'slit', solid: true }]);
  dnBox(sec, 10.2 - 0.8, 14.9, 25.4, 27, B - 1, B + 6.4, 'ashlar', { skin: false });
  dnBox(sec, 20.5, 26.1, 25.4, 27, B - 1, B + 6.4, 'ashlar', { skin: false });
  dnBox(sec, 9.4, 14.2, 14.8, 16.0, B - 1, B + 6.4, 'ashlar', { skin: false });
  dnBox(sec, 20.2, 26.1, 14.8, 16.0, B - 1, B + 6.4, 'ashlar', { skin: false });
  sec.terrain.push({ ...ceilingOf([17.75, 20.1], [16.6, 10.6], B + 4.4, { top: B + 6.4 }), style: 'vault', skin: false });
  sec.decor.push({ kind: 'vault', a: [9.4, 20.1, B + 4.4], b: [26.1, 20.1, B + 4.4], width: 10.6, crown: 2.4, style: 'vault' });
  // A recess in the east wall: a table, a pallet, a sconce.
  dnProp(sec, 'table', [23.2, B, 18.2], { yaw: 0 });
  dnProp(sec, 'bench', [23.2, B, 19.4], { yaw: 0 });
  dnProp(sec, 'barrel', [11.4, B, 17.2], { yaw: 0.3 });
  dnProp(sec, 'crate', [11.4, B, 18.6], { yaw: 0.2 });
  dnProp(sec, 'brazier', [22.4, B, 24.2], { lit: true });
  dnProp(sec, 'torch', [10.9, B + 2.7, 22], { face: 'E' });
  dnProp(sec, 'torch', [24.6, B + 2.7, 16.4], { face: 'W' });
  // Flight B north: 20 treads of 0.2 to the quadrangle.
  const b = dnFlight(sec, { foot: [17, 16.0], dir: 'N', steps: 20, tread: 0.4, width: 5.4, from: B, rise: (Q - B) / 20, style: 'cobble' });
  dnFlightWalls(sec, b, { thick: 2.3, head: DN_FLIGHT_HEAD + 0.8 });
  dnFlightVault(sec, b, { head: DN_FLIGHT_HEAD });
  // The head of the stair: a short floor under the quadrangle's south wall, the arch above.
  dnSlab(sec, 14.3, 19.7, 6, 8.2, Q, 'cobble', { extra: { room: true } });
  sec.decor.push({ kind: 'waymarks', points: [[17.7, 39, A], [17.7, 35.2, A]], gap: 1.8, first: 0.3 });
  sec.decor.push({ kind: 'waymarks', points: [[17.5, 23.6, B], [17.2, 18.4, B]], gap: 1.8, first: 0.3 });
  sec.portals.push({ to: 'gate', area: { at: [17.7, 38], size: [12, 9] } });
  sec.portals.push({ to: 'quad', area: { at: [17, 10], size: [8, 9] } });

  dnSpawn(sec, 'stairguard1', 'dunnottarGuard', 'enemy', 2, [15.4, B, 21.8], DN_FACE.S, { inputs: { name: 'Sergeant Lorne' } });
  dnItem(sec, 'bandage4', 'bandage', [24.4, B, 22.4]);
  dnItem(sec, 'tonic2', 'tonic', [11.6, B, 24]);
  return sec;
}

// ---- 4. The Quadrangle ----------------------------------------------------------------------

/** A slab by extents with rectangular holes cut from it (the stairwells), as the strips that are left. */
function dnSlabHoles(sec, [x0, x1, z0, z1], holes, top, style, opts = {}) {
  const xs = [...new Set([x0, x1, ...holes.flatMap((hole) => [hole[0], hole[1]])])].sort((p, q) => p - q);
  const zs = [...new Set([z0, z1, ...holes.flatMap((hole) => [hole[2], hole[3]])])].sort((p, q) => p - q);
  const inHole = (x, z) => holes.some((hole) => x > hole[0] && x < hole[1] && z > hole[2] && z < hole[3]);
  for (let j = 0; j + 1 < zs.length; j += 1) {
    let start = null;
    for (let i = 0; i + 1 < xs.length; i += 1) {
      const solid = !inHole((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2);
      if (solid && start === null) start = xs[i];
      if (start !== null && (!solid || i + 2 === xs.length)) {
        dnSlab(sec, start, solid ? xs[i + 1] : xs[i], zs[j], zs[j + 1], top, style, opts);
        start = null;
      }
    }
  }
}

// The court is a way, not a field: the ruined ranges of the old ward stand shoulder to shoulder and leave a lane through them (the plan, x east, z south; every number a metre):
//
//   x 0 ─────────────── 12.2 ── 18.4 ─ 20.4 ─────────────────── 38.4 ───── 44
//   z -34  north curtain ┬─ kitchen ─┬─alley─┬──── East Range (masonry) ────┬ lane C's end
//                        │ (ladies)  │ ladder│                              │
//   z -21   West block   │           │ foot  │  void   Lodging (door S)     │ lane C ──── the keep's door (z -22.5, locked)
//   z -7                 │ stair-    │       │ ▲ iron-gate     │            │   │
//        stair-house ▲   │ house     ▼ alley ▼ stair head      ▼ door       │   │
//   z -6.8 ──────────────┴───────────┴───── M band (7 m): west ← ... ← Well, Rest 2 ... ←─┤ junction
//   z  0.3    plaza / pocket ◄─── M band                     ───────────────────────────────┤
//   z  0.8 ───────────────┬── separator wall ─────────────────────────────────────────────  ┤
//   z  1.3    (pocket)    │   S band (4.7 m): the tunnel's mouth (x 14.3..19.7) ... east ───►┘ connector
//   z  6.8 ───────────────┴──────────────── south wall ───────── (arch at x 17) ──────────────
//
// From the tunnel's mouth the only way is east along the south band to the junction at the east wall; there it turns west along the middle band (the Well, Rest 2, the
// head of the iron-gate stair) to the plaza before the stair-house and down the west stair. Everything else is a branch that ends: the alley north (6 m wide, 28 m) to the
// kitchen and the foot of the ladder; the Lodging off the middle band; lane C north from the junction to the keep's door in the east wall. From below the way is the
// other way: the iron-gate stair comes up in the middle band (east of the alley), lane C is its way on to the keep's door. The east stair that used to rise from the cellar
// into the keep is gone: the keep is entered from the court, by a door that is locked (the turnkey keeps its key), so that the vault is on the way for everyone and the
// court is on the way for everyone who comes up out of it.
function buildQuad() {
  const sec = dnSection('quad', 'The Quadrangle');
  dnBounds(sec, { at: [22, -13.5], size: [48, 43], y: [9.8, 45] });
  const Q = Y.quad;
  // The court: grass and cobbles over the cellars (the slab is 1.6 thick), with the two stairwells cut out of it.
  const open = 0.34 * (DN_VAULT_STEPS - DN_COVERED);
  const holes = [
    [3, 8.4, -4 - open, -4],
    [22, 27.4, -6.86 - open, -6.86],
  ];
  dnSlabHoles(sec, [0, 44, -34, 7.6], holes, Q, 'grass', { bottom: Q - 1.6, extra: { land: true } });
  // The paved lane: the south band, the junction and lane C, the middle band, the alley.
  sec.decor.push({ kind: 'paving', y: Q, rects: [[14.3, 19.7, 1.3, 7.6], [12.4, 43.8, 1.8, 5.8], [38.6, 43.8, -26.6, 1.6], [0.4, 43.8, -6.6, 0.0], [12.4, 18.2, -33.8, -7]] });
  // The south wall, with the arch of the tunnel's mouth; the west wall; the east wall, with the keep's door (a barred arch, locked: the gate below).
  dnRun(sec, [0, 6.8], [44, 6.8], 1.6, Q - 1, Q + 9, 'ashlar', [{ at: 17, width: 5.4, sill: Q, top: Q + 4.6, shape: 'round' }], { crenel: true, face: 'quadSouth' });
  dnRun(sec, [-0.8, -34], [-0.8, 7.6], 1.6, Q - 1, Q + 9, 'ruin', [{ at: 12, width: 0.5, sill: Q + 3.4, top: Q + 4.9, shape: 'slit', solid: true }, { at: 26, width: 0.5, sill: Q + 3.4, top: Q + 4.9, shape: 'slit', solid: true }, { at: 34, width: 0.5, sill: Q + 3.4, top: Q + 4.9, shape: 'slit', solid: true }]);
  dnRun(sec, [44.8, -34], [44.8, 7.6], 1.6, Q - 1, Q + 9, 'ashlar', [{ at: 11.5, width: 5.8, sill: Q - 0.4, top: Q + 4.4, shape: 'round' }]);
  // (The threshold under the arch, between the court's edge at x 44 and the hall's at 44.5: the stair that used to rise through the arch covered the gap.)
  dnSlab(sec, 43.8, 44.7, -25.4, -19.6, Q, 'flags', { bottom: Q - 1.6, extra: { land: true } });
  dnGate(sec, 'keepdoor', [43.4, Q, -22.5], [{ ...wallOf([44.7, -22.5], [0.3, 5.8], Q - 0.4, Q + 4.4, { id: 'keepdoor' }), style: 'iron', skin: false }], { kind: 'bars', width: 5.8, height: 4.4 }, { key: 'keepkey', opensFrom: { at: [41.2, -22.5], size: [8, 10] }, label: 'Unlock the keep\'s door', lockedText: 'Locked. The turnkey keeps the key to the keep in the vault below.' });
  // The north curtain, the foot of the wall walk: tall at the east end, lower toward the chapel (the walk steps down).
  dnBox(sec, 0, 44, DN_WALK_N, -34, Q - 1, Y.ladderRoom - 1.5, 'ashlar', { extra: { part: 'curtain' } });
  dnBox(sec, 36, 44, DN_WALK_N, -34, Q - 1, Y.walk - 1.5, 'ashlar', { extra: { part: 'curtain' } });
  // The west stair-house: a facade with an arched door at the head of the stair (the plaza's), the stair-house walls (the flight's) behind it. Sealed at its west end.
  dnRun(sec, [1.4, -3.2], [10.0, -3.2], 1.4, Q - 1, Q + 6.2, 'ruin', [{ at: 4.3, width: 5.4, sill: Q, top: Q + 4.2, shape: 'pointed' }]);
  dnBox(sec, 0, 1.4, -3.9, -2.5, Q - 1, Q + 6.2, 'ruin');
  // The far ends of the two open stairwells, where the court's slab runs on over the covered treads: a railing (a wall to the physics, bars to the eye: the way on, under the slab,
  // is seen through it) over the slab's own face, a lintel with the stair running dark beneath it.
  for (const [x0, x1, z] of [[3, 8.4, -4 - open], [22, 27.4, -6.86 - open]]) {
    dnBox(sec, x0, x1, z - 0.3, z, Q - 0.5, Q + 1.0, 'ashlar', { skin: false });
    sec.decor.push({ kind: 'bars', a: [x0, z - 0.15], b: [x1, z - 0.15], y0: Q, y1: Q + 1.0 });
    sec.decor.push({ kind: 'face', a: [x0, z], b: [x1, z], y0: Q - 1.6, y1: Q, thick: 0.2, style: 'ashlar' });
  }

  // ---- The ranges that make the lane (their walls stand to the height of a man on a man's shoulders, ragged to the eye and sheer to the physics) ----
  const HIGH = Q + 5.6;
  // The south band is walled from the middle band by a wall that ends short of the east wall (the junction), and from the plaza by one that stops at it.
  dnRun(sec, [11.6, 0.8], [38.4, 0.8], 1.0, Q - 1, HIGH, 'ruin');
  dnRun(sec, [11.6, 0.3], [11.6, 6.2], 1.2, Q - 1, HIGH, 'ruin');
  // The alley's walls (north from the middle band: west the stair-house's block and the kitchen's east wall, east the range that holds the iron-gate stairwell), the kitchen's, the West block over
  // the covered stairs, the East Range and the void over the iron-gate stair's covered treads, the north-east corner (lane C's end).
  dnBox(sec, 10.0, 12.2, -21.8, -6.8, Q - 1, HIGH, 'ruin');
  dnBox(sec, 18.4, 20.4, -34, -6.8, Q - 1, HIGH, 'ruin');
  dnBox(sec, 0, 10.0, -21.2, -11.4, Q - 1, HIGH, 'ruin');
  dnBox(sec, 20.4, 28.0, -20.2, -14.2, Q - 1, HIGH, 'ruin');
  dnBox(sec, 20.4, 38.4, -34, -20.2, Q - 1, Q + 8.6, 'ashlar');
  dnBox(sec, 38.4, 44, -34, -27, Q - 1, HIGH, 'ruin');
  // The old kitchen (a ruined range, roofless), west of the alley: a door on the alley, no way round it. (Its south wall is whole and the strip north of it closed.)
  dnRun(sec, [3, -31.6], [12, -31.6], 1.2, Q - 0.5, Q + 4.4, 'ruin', [{ at: 4.5, width: 0.6, sill: Q + 2, top: Q + 3.3, shape: 'lancet', solid: true }]);
  dnRun(sec, [11.6, -31.6], [11.6, -21.8], 1.2, Q - 0.5, Q + 4.4, 'ruin', [{ at: 5.8, width: 2.6, sill: Q, top: Q + 3.2, shape: 'round' }]);
  dnRun(sec, [3.4, -31.6], [3.4, -21.8], 1.2, Q - 0.5, Q + 3.2, 'ruin', [{ at: 4.5, width: 0.6, sill: Q + 1.8, top: Q + 3, shape: 'lancet', solid: true }]);
  dnRun(sec, [3, -21.8], [12, -21.8], 1.2, Q - 0.5, Q + 3.6, 'ruin');
  dnBox(sec, 1.5, 12.2, -34, -32.2, Q - 1, Q + 4.4, 'ruin');
  // Benholm's Lodging: a ruined house off the middle band, a door to it, a hearth, a table, a bed; walls of different heights, as ruins are.
  dnRun(sec, [28.0, -7.4], [38.4, -7.4], 1.2, Q - 0.5, Q + 5.6, 'ruin', [{ at: 7.6, width: 2.8, sill: Q, top: Q + 3.4, shape: 'round' }]);
  dnRun(sec, [28.0, -19.6], [38.4, -19.6], 1.2, Q - 0.5, Q + 6.4, 'ruin', [{ at: 3.5, width: 0.7, sill: Q + 1.8, top: Q + 3.4, shape: 'lancet', solid: true }, { at: 7, width: 0.7, sill: Q + 1.8, top: Q + 3.4, shape: 'lancet', solid: true }]);
  dnRun(sec, [28.6, -20.2], [28.6, -6.8], 1.2, Q - 0.5, Q + 5.2, 'ruin', [{ at: 6.5, width: 0.9, sill: Q + 1.4, top: Q + 3.2, shape: 'lancet', solid: true }]);
  dnRun(sec, [37.8, -20.2], [37.8, -6.8], 1.2, Q - 0.5, Q + 6, 'ruin', [{ at: 4.5, width: 0.7, sill: Q + 1.6, top: Q + 3.2, shape: 'lancet', solid: true }, { at: 9, width: 0.7, sill: Q + 1.6, top: Q + 3.2, shape: 'lancet', solid: true }]);
  dnProp(sec, 'hearth', [29.9, Q, -14], { yaw: 0 });
  dnProp(sec, 'table', [33.2, Q, -14.6], { yaw: 0 });
  dnProp(sec, 'bench', [33.2, Q, -16.0], { yaw: 0 });
  dnProp(sec, 'bed', [35.4, Q, -18.0], { yaw: 0 });
  dnProp(sec, 'barrel', [30.1, Q, -18.2], { yaw: 0.3 });
  dnProp(sec, 'crate', [31.3, Q, -18.4], { yaw: 0.1 });
  // The well (a ruin's, beside the stair head), Rest 2 east of it, and the litter of a garrison along the lane.
  dnBox(sec, 30.7, 33.3, -6.7, -4.1, Q - 0.5, Q + 1.0, 'ashlar', { extra: { part: 'well' } });
  dnProp(sec, 'well', [32.0, Q, -5.4]);
  sec.rest = { id: 'rest2', name: 'The Well', at: [35.0, Q, -1.4] };
  dnProp(sec, 'brazier', [36.3, Q, -1.9], { lit: true, rest: true });
  dnProp(sec, 'barrel', [22.4, Q, 5.2], { yaw: 0.3 });
  dnProp(sec, 'barrel', [23.5, Q, 5.3], { yaw: 1.2 });
  dnProp(sec, 'crate', [30.6, Q, 5.2], { yaw: 0.4 });
  dnProp(sec, 'cart', [13.3, Q, 4.3], { yaw: Math.PI / 2 + 0.2 });
  dnProp(sec, 'weapon', [29.4, Q, 2.6], { what2: 'spear', yaw: 0.5 });
  dnProp(sec, 'weapon', [16.2, Q, -1.0], { what2: 'shield', yaw: 1.1 });
  dnProp(sec, 'bones', [27.6, Q, 3.2], { yaw: 0 });
  dnProp(sec, 'raven', [24.0, HIGH + 0.1, 0.8], { yaw: 3 });
  dnProp(sec, 'raven', [33.0, Q + 6.5, -19.6], { yaw: 1 });
  dnProp(sec, 'raven', [32.0, Q + 1.0, -5.4], { yaw: 4, size: 0.9 });
  dnProp(sec, 'raven', [19.4, HIGH + 0.1, -20], { yaw: 0.7 });
  // The stair-house of the west stair (down to the vault): a torch each side of its arch, a brazier by it, and marks along the lane to the door.
  dnProp(sec, 'torch', [1.9, Q + 2.4, -2.5], { face: 'S' });
  dnProp(sec, 'torch', [9.5, Q + 2.4, -2.5], { face: 'S' });
  dnProp(sec, 'brazier', [11.4, Q, -1.4], { lit: true });
  // (Either side of the tunnel's arch on the court's face of the wall: they hung in the arch itself, in the air.) And along the lane.
  dnProp(sec, 'torch', [13.4, Q + 3, 5.95], { face: 'N' });
  dnProp(sec, 'torch', [20.6, Q + 3, 5.95], { face: 'N' });
  dnProp(sec, 'torch', [43.9, Q + 2.6, -18.4], { face: 'W' });
  dnProp(sec, 'torch', [43.9, Q + 2.6, -26.4], { face: 'W' });
  dnProp(sec, 'torch', [20.6, Q + 2.6, -3.0], { face: 'S' });
  dnProp(sec, 'brazier', [43.0, Q, -17.2], { lit: true });
  // The kitchen's trade, the alley's litter.
  dnProp(sec, 'table', [7.2, Q, -26.8], { yaw: 0 });
  dnProp(sec, 'barrel', [4.8, Q, -30.4], { yaw: 0.3 });
  dnProp(sec, 'crate', [5.9, Q, -30.6], { yaw: 0.2 });
  dnProp(sec, 'raven', [3.4, Q + 3.3, -31.6], { yaw: 1 });
  dnProp(sec, 'bones', [15.6, Q, -17], { yaw: 0 });
  // The way-marks: the main line from the tunnel's mouth, east along the south band and west along the middle band's north half to the stair-house; and, for the man who comes up
  // the iron-gate stair, the south half of the middle band east to the junction and lane C to the keep's door.
  sec.decor.push({ kind: 'waymarks', points: [[17.5, 5.2, Q], [24, 3.6, Q], [32, 3.6, Q], [39, 3.4, Q], [41.8, 1.2, Q], [41.2, -3.0, Q], [36, -3.4, Q], [27, -3.4, Q], [19, -3.2, Q], [12.5, -2.2, Q], [8, -1.2, Q], [5.7, -1.4, Q]], gap: 1.9, first: 0.3 });
  sec.decor.push({ kind: 'waymarks', points: [[24.7, -5.8, Q], [28, -1.6, Q], [36, -1.6, Q], [41.2, -3.2, Q], [41.2, -10, Q], [41.2, -17, Q], [41.2, -22.5, Q]], gap: 1.9, first: 0.4 });
  // Portals: the tunnel; down into the vault by either of its stairs; the keep's door, the ladder (up to the walls).
  sec.portals.push({ to: 'ascent', area: { at: [17, 2.5], size: [12, 9] } });
  sec.portals.push({ to: 'vault', area: [{ at: [5.7, -9], size: [13, 22] }, { at: [24.7, -11], size: [11, 18] }] });
  sec.portals.push({ to: 'tower', area: [{ at: [14.3, -31], size: [5, 8] }, { at: [41.2, -22.5], size: [8, 12] }] });

  // Men, spread along the way (the south band, the junction, the middle band, the plaza; then, for the man who comes up the iron-gate stair, lane C): a levy on his round,
  // a guard waiting at the corner, a crossbowman on the junction, a guard in the middle band and a levy at the plaza; the sergeant in the Lodging; at the keep's door a guard,
  // and a crossbowman down the lane. The servants at the well, a priest, the ladies in the kitchen.
  dnSpawn(sec, 'patrol1', 'dunnottarSoldier', 'enemy', 1, [22, Q, 3.8], DN_FACE.E, { inputs: { name: 'Lachie' }, patrol: [[22, 3.8], [33, 3.8]] });
  dnSpawn(sec, 'yardguard', 'dunnottarGuard', 'enemy', 2, [37.5, Q, 3.4], DN_FACE.W, { inputs: { name: 'Guard Beaton' }, vision: 16 });
  dnSpawn(sec, 'junctionbow', 'dunnottarCrossbow', 'enemy', 2, [42.4, Q, -4.4], DN_FACE.S, { inputs: { name: 'Crossbowman Ogg' }, vision: 16 });
  dnSpawn(sec, 'wellguard', 'dunnottarGuard', 'enemy', 2, [15.8, Q, -3.4], DN_FACE.E, { inputs: { name: 'Guard Hume' }, vision: 16 });
  dnSpawn(sec, 'plazalevy', 'dunnottarSoldier', 'enemy', 1, [7.8, Q, 2.0], DN_FACE.E, { inputs: { name: 'Dod' } });
  dnSpawn(sec, 'lodgeguard', 'dunnottarGuard', 'enemy', 2, [35.6, Q, -10.6], DN_FACE.S, { inputs: { name: 'Sergeant Keith' } });
  dnSpawn(sec, 'lanebow', 'dunnottarCrossbow', 'enemy', 2, [41.2, Q, -13.8], DN_FACE.S, { inputs: { name: 'Crossbowman Pyper' }, vision: 16 });
  dnSpawn(sec, 'archguard', 'dunnottarGuard', 'enemy', 2, [41.2, Q, -23.6], DN_FACE.S, { inputs: { name: 'Guard Lamont' }, vision: 16 });
  dnSpawn(sec, 'servant1', 'dunnottarServant', 'civilian', 0, [29.6, Q, -4.6], DN_FACE.E, { inputs: { name: 'Meg' } });
  dnSpawn(sec, 'servant2', 'dunnottarServant', 'civilian', 0, [30.2, Q, -1.8], DN_FACE.E, { inputs: { name: 'Isobel' } });
  dnSpawn(sec, 'priest', 'dunnottarPriest', 'civilian', 0, [31.8, Q, -16.6], DN_FACE.S, { inputs: { name: 'Father Anselm' } });
  dnSpawn(sec, 'lady1', 'dunnottarServant', 'civilian', 0, [6.6, Q, -27.6], DN_FACE.E, { inputs: { name: 'Miss Charlotte', outfit: { kind: 'victorianLady', design: 0 }, accessories: [], heightCm: 166 } });
  dnSpawn(sec, 'lady2', 'dunnottarServant', 'civilian', 0, [8.4, Q, -28.8], DN_FACE.E, { inputs: { name: 'Mrs Pargeter', outfit: { kind: 'victorianLady', design: 2 }, accessories: [], heightCm: 163 } });

  dnItem(sec, 'note-servant', 'note', [33.2, Q, -14.6], { note: 'servant', lift: 0.9 });
  dnItem(sec, 'tonic3', 'tonic', [37.4, Q, -4.0]);
  dnItem(sec, 'bandage5', 'bandage', [9.6, Q, -23.6]);
  return sec;
}

// ---- 6. The Tower House and the Upper Walls -------------------------------------------------------------

// The keep (a hall on the court's level, reached from the vault), its round stair tower (85 treads of 0.15 round a newel, 12.75 m, 4.2 m long each: 17% more than the first 3.6),
// the wall walk along the north cliff, a stair down to the ladder room (and the ladder), Rest 3.
const DN_TOWER = { at: [63.4, -23.8], radius: 5.7, sides: 12 };
const DN_SPIRAL = { at: DN_TOWER.at, inner: 0.6, outer: 5.1, start: Math.PI, turn: (85 * Math.PI * 2) / 26, steps: 85, from: Y.quad, rise: 0.15 };

function buildTower() {
  const sec = dnSection('tower', 'The Tower House and the Upper Walls');
  const Q = Y.quad;
  const W = Y.walk;
  const L = Y.ladderRoom;
  dnBounds(sec, { at: [57, -24], size: [28, 20], y: [Q - 3, 40] }, { at: [53, -36.1], size: [30, 10.2], y: [W - 4, 45] }, { at: [30, -36.6], size: [64, 9.2], y: [L - 4, 45] }, { at: [5, -36.6], size: [14, 9.2], y: [L - 4, 45] });
  // The hall of the keep (an L-plan house; the hall and the round tower are the part a man can enter).
  dnSlab(sec, 44.5, 58.4, -32.4, -15, Q, 'flags', { extra: { land: true } });
  dnRun(sec, [44.5, -31.6], [58.4, -31.6], 1.6, Q - 1, Q + 5.6, 'ashlar', [{ at: 4, width: 0.6, sill: Q + 3, top: Q + 4.6, shape: 'lancet', solid: true }, { at: 9, width: 0.6, sill: Q + 3, top: Q + 4.6, shape: 'lancet', solid: true }]);
  dnRun(sec, [44.5, -15.8], [58.4, -15.8], 1.6, Q - 1, Q + 5.6, 'ashlar', [{ at: 4, width: 0.6, sill: Q + 3, top: Q + 4.6, shape: 'lancet', solid: true }, { at: 9, width: 0.6, sill: Q + 3, top: Q + 4.6, shape: 'lancet', solid: true }]);
  dnRun(sec, [57.6, -32.4], [57.6, -15], 1.6, Q - 1, Q + 5.6, 'ashlar', [{ at: 8.6, width: 2.8, sill: Q, top: Q + 3.8, shape: 'round' }]);
  dnBox(sec, 44.5, 45.6, -32.4, -26.2, Q - 1, Q + 5.6, 'ashlar');
  dnBox(sec, 44.5, 45.6, -18.8, -15, Q - 1, Q + 5.6, 'ashlar');
  dnCeiling(sec, 45.6, 56.8, -30.8, -16.6, Q + 5, Q + 5.8);
  sec.decor.push({ kind: 'vault', a: [45.6, -23.7, Q + 3.8], b: [56.8, -23.7, Q + 3.8], width: 14.2, crown: 1.3, style: 'timber' });
  sec.decor.push({ kind: 'mass', box: [43.3, 58.4, -32.4, -15], y0: Q + 5.6, y1: W + 6.6, style: 'tower', windows: 3 });
  dnProp(sec, 'hearth', [51, Q, -30.9], { yaw: Math.PI / 2 });
  dnProp(sec, 'table', [51.4, Q, -27.4], { yaw: 0 });
  dnProp(sec, 'bench', [51.4, Q, -26.0], { yaw: 0 });
  dnProp(sec, 'bench', [51.4, Q, -28.8], { yaw: 0 });
  dnProp(sec, 'banner', [47, Q + 2.4, -31], { yaw: Math.PI / 2 });
  dnProp(sec, 'barrel', [55.6, Q, -29.6], { yaw: 0.4 });
  dnProp(sec, 'torch', [46.4, Q + 2.6, -29.4], { face: 'S' });
  dnProp(sec, 'torch', [46.4, Q + 2.6, -17], { face: 'N' });
  dnProp(sec, 'torch', [56, Q + 2.6, -20], { face: 'W' });
  // The round tower (a twelve-sided wall: a door in from the hall on the west, a door out onto the wall walk at the top on the north) and its winding stair.
  const [cx, cz] = DN_TOWER.at;
  const corner = (k) => [cx + DN_TOWER.radius * Math.cos(Math.PI / 12 + (k * Math.PI) / 6), cz + DN_TOWER.radius * Math.sin(Math.PI / 12 + (k * Math.PI) / 6)];
  dnSlab(sec, cx - 6.4, cx + 6.4, cz - 6.4, cz + 6.4, Q, 'flags', { extra: { land: true } });
  for (let k = 0; k < DN_TOWER.sides; k += 1) {
    const a = corner(k);
    const b = corner(k + 1);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const mx = (a[0] + b[0]) / 2 - cx;
    const mz = (a[1] + b[1]) / 2 - cz;
    const openings = [];
    if (mx < -3.5 && Math.abs(mz) < 0.5) openings.push({ at: length / 2, width: 2.8, sill: Q, top: Q + 3.6, shape: 'round' });
    else if (mz < -3.5 && Math.abs(mx) < 0.5) openings.push({ at: length / 2, width: 2.8, sill: W, top: W + 3.7, shape: 'round' });
    else if (k % 3 === 1) openings.push({ at: length / 2, width: 0.5, sill: Q + 4 + k * 0.9, top: Q + 5.4 + k * 0.9, shape: 'slit', solid: true });
    dnRun(sec, a, b, 1.4, Q - 1, W + 3.4, 'ashlar', openings, { round: true });
  }
  // The doorstep at the top of the stair: a floor under the door's thickness, level with the last tread.
  dnSlab(sec, cx - 1.5, cx + 1.5, cz - 6.4, cz - 4.5, W, 'flags');
  // ...and the quarter of the tower's floor at the top beyond the door, where no tread of this turn is: a landing over the turn below.
  dnSlab(sec, cx, cx + 4.7, cz - 4.7, cz, W, 'flags', { bottom: W - 0.5 });
  dnBox(sec, cx + 0.55, cx + 4.7, cz - 0.3, cz, W - 0.4, W + 1.2, 'parapet');
  const treads = windingStairs({ ...DN_SPIRAL, id: 'spiral' }).map((tread) => ({ ...tread, bottom: tread.top - 0.55, style: 'stone' }));
  sec.terrain.push(...treads);
  sec.terrain.push({ ...wallOf([cx, cz], [1.4, 1.4], Q - 0.5, W + 3, { id: 'newel' }), style: 'newel' });
  sec.decor.push({ kind: 'spiral', ...DN_SPIRAL, rope: true, rail: 4.45 });
  sec.decor.push({ kind: 'waymarks', points: [[49, -23.8, Q], [53, -23.8, Q], [56.4, -23.8, Q]], gap: 1.9, first: 0.4 });
  sec.decor.push({ kind: 'waymarks', points: [[cx, cz - 7.1, W], [cx, -35.2, W], [cx - 6, -35.2, W], [cx - 14, -35.2, W], [cx - 23, -35.2, W]], gap: 2.2, first: 0.4 });
  // The top landing, the wall walk, and its parapets.
  dnSlab(sec, cx - 1.8, cx + 1.8, DN_WALK_N, cz - 6.2, W, 'flags', { extra: { walk: true } });
  dnSlab(sec, 44, cx + 1.8, DN_WALK_N, -32.4, W, 'flags', { extra: { walk: true } });
  dnSlab(sec, 36, 44, DN_WALK_N, -34, W, 'flags', { bottom: W - 1.5, extra: { walk: true } });
  // The keep's north face, the walk's inner side.
  dnBox(sec, 44, cx - 2.05, -32.9, -32.4, W - 0.4, W + 6.6, 'tower');
  const stairs = dnFlight(sec, { foot: [36 - 39 * 0.34, (DN_WALK_N - 34) / 2], dir: 'E', steps: 39, tread: 0.34, width: -34 - DN_WALK_N, from: L, rise: (W - L) / 39, style: 'cobble', bottom: L - 1.5 });
  dnSlab(sec, -2, 36 - 39 * 0.34, DN_WALK_N, -34, L, 'flags', { bottom: L - 1.5, extra: { walk: true } });
  // Parapets: the sea side whole (but for two breaches that let a man fall to the sea), the court side with the gaps.
  const breaches = [[50, 52.6], [8.2, 10.8]];
  const parapet = (x0, x1, z, top, bottom, gaps, thick = 0.55) => {
    let cursor = x0;
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (g0 > cursor) dnBox(sec, cursor, g0, z - thick / 2, z + thick / 2, bottom, top, 'parapet');
      cursor = g1;
    }
    if (cursor < x1) dnBox(sec, cursor, x1, z - thick / 2, z + thick / 2, bottom, top, 'parapet');
  };
  parapet(36, 66, DN_WALK_N - 0.2, W + 1.3, W - 0.4, breaches.filter((g) => g[0] > 36));
  parapet(-2, 22.74, DN_WALK_N - 0.2, L + 1.3, L - 0.4, breaches.filter((g) => g[0] < 23));
  parapet(0, 22.74, -33.8, L + 1.3, L - 0.4, [[5.6, 8.4], [13.4, 15.2]]);
  parapet(36, 44, -33.8, W + 1.3, W - 0.4, []);
  dnBox(sec, 66, 66.55, DN_WALK_N - 0.5, -28.3, W - 0.4, W + 1.3, 'parapet');
  dnBox(sec, cx - 2.05, cx - 1.6, -32.4, cz - 6.2, W - 0.4, W + 1.3, 'parapet');
  dnBox(sec, cx + 1.8, cx + 2.3, DN_WALK_N - 0.5, cz - 6.2, W - 0.4, W + 1.3, 'parapet');
  // Along the stair down: parapets on both sides, stepped.
  for (let i = 0; i < stairs.steps; i += 3) {
    const last = Math.min(stairs.steps, i + 3) - 1;
    for (const z of [DN_WALK_N - 0.2, -33.8]) dnBox(sec, stairs.foot[0] + i * stairs.tread, stairs.foot[0] + (last + 1) * stairs.tread, z - 0.275, z + 0.275, stairs.treadY(i) - 0.6, stairs.treadY(last) + 1.3, 'parapet');
  }
  sec.decor.push({ kind: 'walk', y: W, rect: [36, 66, DN_WALK_N, -32.4] }, { kind: 'walk', y: L, rect: [-2, 22.74, DN_WALK_N, -34] }, { kind: 'crenel', a: [36, DN_WALK_N - 0.2], b: [66, DN_WALK_N - 0.2], y: W + 1.3, gaps: breaches.filter((g) => g[0] > 36) }, { kind: 'crenel', a: [-2, DN_WALK_N - 0.2], b: [22.74, DN_WALK_N - 0.2], y: L + 1.3, gaps: breaches.filter((g) => g[0] < 23) });
  // The ladder: hauled up now (a barrier at the gap in the parapet); kicked down it is a stair of rungs to the court (Shortcut 2).
  const ladderDown = { ...stairsOf([14.3, -30.4], [6.9, 1.5], 23, Q, (L - Q) / 23, { yaw: Math.PI / 2, id: 'ladder1' }), style: 'ladder', skin: false };
  sec.ladders.push({
    id: 'ladder1', at: [14.3, L, -35.2], state: 'up', kickFrom: { at: [14.3, -36.6], size: [14, 5.2], y: [L - 1, L + 3] }, label: 'Kick the ladder down to the court',
    states: { up: [{ ...wallOf([14.3, -33.8], [1.8, 0.4], L - 0.4, L + 1.3, { id: 'ladder1' }), style: 'ladder', skin: false }], down: [ladderDown] },
    look: { kind: 'ladder', foot: [14.3, Q, -26.95], top: [14.3, L, -33.85], width: 1.5 },
  });
  // Rest 3, before the chapel gate.
  sec.rest = { id: 'rest3', name: 'The Wall Brazier', at: [4.6, L, -37.0] };
  dnProp(sec, 'brazier', [4.8, L, -38.3], { lit: true, rest: true });
  // The way on from the ladder room to the chapel's gate: marks along the walk.
  sec.decor.push({ kind: 'waymarks', points: [[26, -36, L], [18, -36, L], [11, -36, L], [7.2, -36, L]], gap: 2.2, first: 0.4 });
  // (At the stair's foot, on the walk: it was 4.75 m up in the air.)
  dnProp(sec, 'brazier', [22.0, L, -37.2], { lit: true });
  dnProp(sec, 'weapon', [31, stairs.treadY(Math.floor((31 - stairs.foot[0]) / stairs.tread)), -36.4], { what2: 'halberd', yaw: 0.2 });
  dnProp(sec, 'weapon', [47, W, -35.2], { what2: 'sword', yaw: 4 });
  dnProp(sec, 'bones', [38, W, -37.2], { yaw: 0.8 });
  dnProp(sec, 'raven', [58.5, W + 1.3, DN_WALK_N - 0.2], { yaw: 2 });
  dnProp(sec, 'raven', [44.8, W + 1.3, DN_WALK_N - 0.2], { yaw: 5 });
  dnProp(sec, 'raven', [19.6, L + 1.3, DN_WALK_N - 0.2], { yaw: 3.4 });
  dnProp(sec, 'raven', [1.6, L + 1.3, DN_WALK_N - 0.2], { yaw: 0.2 });
  dnProp(sec, 'banner', [27, L + 4, DN_WALK_N - 0.2], { yaw: Math.PI / 2, torn: true });

  // (The keep's door onto the court is the way in, and back: the court wakes from the hall's west end. There is no stair down to the cellar now.)
  sec.portals.push({ to: 'quad', area: [{ at: [14.3, -32], size: [4, 8], y: [L - 6, L + 3] }, { at: [30, -35], size: [30, 6], y: [L - 2, W + 3] }, { at: [47, -22.5], size: [6, 9], y: [Q - 3, Q + 3] }] });
  sec.portals.push({ to: 'chapel', area: { at: [1.5, -36], size: [7, 5] } });

  // The garrison: a guard in the hall, a knight on the stair, then the wall: a guard, a knight, a crossbow, the last knight.
  dnSpawn(sec, 'keepguard', 'dunnottarGuard', 'enemy', 2, [51, Q, -19.4], DN_FACE.W, { inputs: { name: 'Sergeant Hay' } });
  const stairAt = windingTread(DN_SPIRAL, 36);
  dnSpawn(sec, 'stairknight', 'dunnottarGuard', 'enemy', 2, [stairAt[0], Q + 37 * 0.15, stairAt[1]], Math.PI / 2 - (DN_SPIRAL.start + (DN_SPIRAL.turn / DN_SPIRAL.steps) * 36.5), { inputs: { name: 'Sergeant Calder' } });
  dnSpawn(sec, 'wallknight2', 'dunnottarKnight', 'enemy', 3, [10, L, -36.4], DN_FACE.E, { inputs: { name: 'Sir Lauder' } });

  const midStair = windingTread(DN_SPIRAL, 56);
  dnItem(sec, 'bandage7', 'bandage', [47.6, Q, -29.4]);
  dnItem(sec, 'tonic5', 'tonic', [midStair[0], Q + 57 * 0.15, midStair[1]]);
  dnItem(sec, 'note-soldier', 'note', [44.4, W, -37.4], { note: 'soldier' });
  dnItem(sec, 'bandage8', 'bandage', [3.4, L, -35]);
  return sec;
}

// ---- The stage ----------------------------------------------------------------------------------------

const DN_SECTIONS = [buildCliff(), buildGate(), buildAscent(), buildQuad(), buildVault(), buildCrypt(), buildSewer(), buildTower(), buildChapel(), buildCell()];

// How the garrison sees and flees (levelmode/awareness.js): the light in each section (the storm outside, torches below, the cell
// nearly black), the point a routed man runs for (`rear`), and where the civilians and prisoners run to hide (`refuge`).
const DN_MIND = {
  light: { cliff: 0.75, gate: 0.55, ascent: 0.5, quad: 0.55, vault: 0.3, crypt: 0.22, sewer: 0.18, tower: 0.55, chapel: 0.62, cell: 0.15 },
  rear: { cliff: [-58, 0, 30], gate: [10, 4.18, 46], ascent: [17, 8.18, 20], quad: [20, 12.18, 2], vault: [5.7, 6, -17], crypt: [16.7, 1.4, -24.4], sewer: [-48.5, -5, 30], tower: [51, 12.18, -23], chapel: [-20, 17.18, -34] },
  refuge: {
    servant1: [31.0, 12.18, -10.2], servant2: [31.8, 12.18, -11.4], priest: [36.2, 12.18, -13.2], lady1: [5.2, 12.18, -27.6], lady2: [5.2, 12.18, -26.6],
    miner: [12.6, 6, -34], captive: [20.6, 6, -34],
  },
};
// Litter and wear lying about (the drawing's, kitprops.js): [what, x, y, z, options]. Heaps, crates and the like have a solid (below); planks, tools, bones, puddles and the rest are walked over.
const DN_CLUTTER = {
  cliff: [
    ['planks', -121, 14, -8, { yaw: 0.4 }], ['sack', -123.4, 14, -5.4, {}], ['rubbleheap', -124, 14, 0.2, { size: 1.0 }], ['tools', -110.2, 14, 0.9, { yaw: 2 }], ['brokencrate', -112.6, 14, -8.6, { yaw: 0.7 }], ['rustiron', -115, 14, -9.2, {}],
    ['rubbleheap', -43.4, Y.gorge, 51.3, { size: 1.0 }], ['planks', -30, Y.gorge, 53, { yaw: 1.1 }], ['brokencrate', -36.5, Y.gorge, 39.6, { yaw: 0.3 }], ['rustiron', -47, Y.gorge, 53, {}], ['tools', -7.6, Y.gorge, 41.6, {}], ['sack', -55, Y.gorge, 52, {}],
    ['puddle', -35, Y.gorge, 46, { radius: 1.4 }], ['puddle', -30, Y.gorge, 40.8, { radius: 1.0 }], ['weeds', -62, Y.gorge, 40, {}], ['weeds', -7.4, Y.gorge, 43.0, {}], ['weeds', -50, Y.gorge, 38.9, {}],
  ],
  gate: [
    ['planks', 0.6, Y.gorge, 43.6, { yaw: 0.3 }], ['brokencrate', -2.6, Y.gorge, 41.6, { yaw: 1 }], ['sack', 5.0, Y.gorge, 43.4, {}], ['rustiron', -1.2, Y.gorge, 51.4, {}], ['puddle', 1.5, Y.gorge, 45.2, { radius: 1.2 }],
    ['weeds', -3, Y.gorge, 55.3, {}], ['weeds', 4.8, Y.gorge, 53.0, {}], ['planks', -5.2, Y.gorge, 54.9, { yaw: 0.2 }],
    ['brokencrate', 24.2, Y.landing, 50.4, { yaw: 0.3 }], ['rustiron', 26.5, Y.landing, 48.2, {}], ['sack', 29.2, Y.landing, 45.2, {}],
  ],
  ascent: [
    ['brokencrate', 24.4, Y.landing, 36.4, {}], ['sack', 22.4, Y.landing, 39.5, {}], ['rubbleheap', 26, Y.landing, 34.2, { size: 0.8 }],
    ['planks', 13.4, Y.guardroom, 22.6, { yaw: 0.9 }], ['sack', 19.6, Y.guardroom, 24.9, {}], ['puddle', 16, Y.guardroom, 19.4, { radius: 1.0 }],
  ],
  quad: [
    ['rubbleheap', 13.4, Y.quad, -9.4, { size: 0.9 }], ['rubbleheap', 41.8, Y.quad, -26, { size: 1.0 }], ['planks', 15.0, Y.quad, -28, { yaw: 0.3 }], ['brokencrate', 26.6, Y.quad, 5.0, { yaw: 0.5 }], ['sack', 16.8, Y.quad, -12.5, {}],
    ['puddle', 30, Y.quad, 3.6, { radius: 1.5 }], ['puddle', 17, Y.quad, -3.6, { radius: 1.2 }], ['puddle', 41, Y.quad, -12, { radius: 1.4 }], ['weeds', 12.6, Y.quad, 5.4, {}], ['weeds', 43.2, Y.quad, 1.8, {}], ['tools', 40.2, Y.quad, -8, { yaw: 1 }],
    ['rustiron', 4.5, Y.quad, 1.2, {}], ['sack', 24.4, Y.quad, -0.8, {}],
  ],
  vault: [
    ['planks', 6.4, Y.vault, -18.4, { yaw: 0.2 }], ['rustiron', 20.4, Y.vault, -18.6, {}], ['brokencrate', 26.4, Y.vault, -26.2, {}], ['sack', 30, Y.vault, -27, {}],
  ],
  tower: [
    ['brokencrate', 55.4, Y.quad, -27.4, { yaw: 0.2 }], ['sack', 49.2, Y.quad, -28.2, {}], ['rustiron', 49, Y.quad, -18, {}], ['planks', 54, Y.quad, -18.6, { yaw: 0.6 }],
    ['rubbleheap', 52, Y.walk, -33.4, { size: 0.7 }],
  ],
  chapel: [
    ['rubbleheap', -3.9, Y.ladderRoom, -32.6, { size: 0.9 }], ['brokencrate', -17.2, Y.ladderRoom, -44.2, {}], ['planks', -12, Y.ladderRoom, -31.4, { yaw: 0.5 }], ['rustiron', -6.6, Y.ladderRoom, -45.4, {}], ['sack', -17, Y.ladderRoom, -31.6, {}],
  ],
};

/** What a solid prop is to the physics: [length along its own x, width along its z, height (m)]; a man walks round it. (Small litter, weapons, bones, straw, banners, puddles and torches are not here: they are walked over or hang on a wall.) */
const DN_PROP_SOLIDS = {
  barrel: (p) => (p.tipped ? [1.0, 0.85, 0.85] : [0.9, 0.9, 1.0]),
  powderkeg: () => [0.62, 0.62, 0.6],
  crate: () => [0.85, 0.85, 0.75],
  brokencrate: () => [0.9, 0.9, 0.5],
  table: () => [1.75, 0.9, 0.85],
  bench: () => [1.5, 0.4, 0.5],
  stool: () => [0.4, 0.4, 0.45],
  bed: () => [2.0, 1.0, 0.65],
  hearth: () => [2.4, 0.9, 2.6],
  cart: () => [2.5, 1.6, 1.2],
  trebuchet: (p) => [7 * (p.scale ?? 1), 2.7 * (p.scale ?? 1), 5],
  ram: () => [5.4, 2.4, 2.4],
  siegeram: () => [5.4, 2.4, 2.4],
  altar: () => [1.8, 3.2, 1.3],
  pew: () => [0.55, 2.8, 0.9],
  pillar: (p) => [1.2, 1.2, p.height ?? 11],
  rack: () => [2.4, 1.1, 0.8],
  sarcophagus: () => [2.2, 0.9, 0.9],
  chest: () => [0.9, 0.6, 0.6],
  skullpile: (p) => [1.4 * (p.size ?? 1), 1.2 * (p.size ?? 1), 0.7],
  gravestone: () => [0.25, 0.8, 1.2],
  gunrest: () => [0.3, 0.3, 1.1],
  brazier: (p) => (p.rest ? [1.3, 1.3, 1.1] : [1.05, 1.05, 1.0]),
  rubble: (p) => [1.8 * (p.size ?? 1), 1.6 * (p.size ?? 1), 0.7],
  rubbleheap: (p) => [2.0 * (p.size ?? 1), 1.8 * (p.size ?? 1), 0.8],
};

/** The wall of a prop (a hidden box of its footprint, as tall as it is), or null for one a man walks over. */
export function dnPropSolid(decor) {
  const make = DN_PROP_SOLIDS[decor.what];
  if (!make) return null;
  const [length, width, height] = make(decor);
  return { ...wallOf([decor.at[0], decor.at[2]], [length, width], decor.at[1] - 0.1, decor.at[1] + height, { yaw: decor.yaw ?? 0 }), style: 'hidden', skin: false };
}

// Bodies that lie where they fell from the start (levelmode/level.js `dead`): a story to read, and a weapon or a coat to take.
const DN_DEAD = {
  cliff: [
    ['fallen1', 'dunnottarSoldier', 1, [-93, DN_L1(-93), -2.9], 2.1, 'A levy, dead a day'],
    ['fallen2', 'dunnottarSoldier', 1, [-28.2, Y.gorge, 49.6], 0.4, 'A levy, an arrow through his neck, dead where the bridge begins'],
  ],
  quad: [['fallen3', 'dunnottarGuard', 2, [27.4, Y.quad, 4.6], 1.2, 'A guard, a crossbow bolt in his back']],
  tower: [['fallen4', 'dunnottarGuard', 2, [36.6, Y.walk, -37], 0.1, 'A guard, who held the wall']],
  vault: [['fallen5', 'dunnottarGuard', 2, [6.6, Y.vault, -33.8], 2.6, 'A guard, killed at the rack: a poor man, the questioner\'s own sergeant']],
};
// The lit things the dark rooms want beyond their builders' (dunnottar-light.js).
dnLightDecor(DN_SECTIONS);
for (const section of DN_SECTIONS) {
  for (const [what, x, y, z, extra] of DN_CLUTTER[section.id] ?? []) dnProp(section, what, [x, y, z], extra);
  for (const decor of section.decor) {
    const solid = decor.kind === 'prop' ? dnPropSolid(decor) : null;
    if (solid) section.terrain.push(solid);
  }
}
for (const section of DN_SECTIONS) {
  for (const [id, preset, tier, post, facing, name] of DN_DEAD[section.id] ?? []) section.spawns.push({ id, preset, role: 'enemy', tier, post, facing, dead: true, inputs: { name } });
  section.light = DN_MIND.light[section.id];
  if (DN_MIND.rear[section.id]) section.rear = DN_MIND.rear[section.id];
  for (const spawn of section.spawns) if (DN_MIND.refuge[spawn.id]) spawn.refuge = DN_MIND.refuge[spawn.id];
}

// ==== The team (begin) ======================================================================================================
// The operative goes in alone: no comrades at his side (the user's call). The two weak Forgers who stood beside him where the cliff path begins (his
// start, [-114, 14, -4], facing east) are kept here and not spawned: `DN_TEAM`, their spawns, for a later stage or a test that puts them back
// (dunnottarWithTeam). The team's code (team.js, awareness.js followers, a rest's roster, the attempts' names) runs on whoever is an ally: in this
// stage nobody (the HUD's team panel is empty, the story says he went in alone).
export const DN_TEAM = [
  ['maren', 'forgerMaren', [-116.4, Y.start, -2.4], 'Maren'],
  ['tobin', 'forgerTobin', [-116.4, Y.start, -5.6], 'Old Tobin'],
].map(([id, preset, post, name]) => ({ id, preset, role: 'ally', tier: 2, post, facing: DN_FACE.E, inputs: { name }, team: true }));
// ==== The team (end) ========================================================================================================

export const DUNNOTTAR = {
  id: 'dunnottar',
  title: 'Memories of Dunnottar',
  // The garrison is in its own castle: nobody of it is frightened off (ai.js knowsNoFear); a man still gives ground as his weapon wants, and never breaks.
  homeGround: ['blue'],
  // The render.js place it is set in (a storm, levelmode/storm.js).
  place: 'dunnottar',
  sea: DN_Y.sea,
  // The floors, for the drawing's wear.
  levels: DN_LEVELS,
  start: { section: 'cliff', at: [-114, DN_Y.start, -4], facing: DN_FACE.E },
  sections: DN_SECTIONS,
  // The light under the roofs (stage.js interiorAt, levelmode/storm.js): the rooms and sections that are dark, lit by their flames (dunnottar-light.js).
  interiors: dnInteriorRooms(DN_SECTIONS),
  // Named places for what wants them (the plot twist's drop, a cutscene): the cesspool's arena under the inner cell (dunnottar-sewer.js).
  regions: { cesspool: DN_CESSPOOL_REGION },
  // After the boss: the inner cell's door opens, and near the prince (m) the scene begins; he shuffles into the corner (the straw's).
  ending: DN_ENDING,
  // The prisoners who follow him stop at the chapel gate.
  followStopsAt: { at: [1.5, -36], size: [7, 4.4], y: [DN_Y.ladderRoom - 1, DN_Y.ladderRoom + 3] },
  // For the drawing (levelmode/kit.js): the land round the castle, and the weather.
  landform: {
    extent: [-136, 78, -66, 84],
    cell: 2.5,
    // The mainland hillside: a plane y = a + b x + c (z - d) sloping to the gorge, capped at the plateau; paths and landings are cut into it.
    // Where the headland's rock is kept clear of a door at its foot: the great gate and the postern.
    clear: [[-12, -4.6, 43.6, 48.8, DN_Y.gorge - 0.35], [0.4, 4, 50.6, 53.6, DN_Y.gorge - 0.35], [-2, 11, -50, -39.2, DN_Y.crypt + 0.8]],
    // Where the hillside is cut away, for the sea cave's stair and landing under the shelf's edge: [x0, x1, z0, z1, top].
    // ...and the ravine between the shelf and the castle rock, down to the sea's bed.
    carve: [[-57, DN_CAVE_STAIR.head + 3.6, 55.4, 64, DN_Y.sea - 1], [DN_RAVINE.x0, DN_RAVINE.x1, 38.4, 84, DN_Y.sea - 6]],
    // Where the hillside is not drawn at all: over the grotto, under the shelf's plate (the plate, the face and the grotto's roof close it). Its slope
    // down to the carve stood in the cave's mouth, behind the arch, and the mouth looked walled up from the quay.
    holes: [[-56, -41, 44, 56]],
    mainland: { polygon: [[-136, -50], [-12, -50], [-12, 58], [-136, 58]], plane: [12, 0, -0.27, -4], cap: 16 },
  },
  weather: { kind: 'storm', seed: 1500 },
};

// The crags stand in the hillside as the kit draws it (landform.js mainlandHeight: the plane, drawn to the paths and the plateau), not in the bare
// plane: their feet sunk a little, by their size (a small boulder was sunk out of sight), the tufts at the ground (`ground`), the wall with them.
{
  const land = mainlandHeight(DUNNOTTAR);
  for (const [lump, wall] of DN_LUMPS) {
    const ground = land(lump.at[0], lump.at[2]);
    const base = ground - Math.min(1.4, 0.3 * lump.r[1] + 0.2);
    lump.at[1] = base;
    lump.ground = ground;
    wall.bottom = base - 1;
    wall.top = base + lump.r[1] * 1.3;
  }
}

// ---- The route ------------------------------------------------------------------------------------------

/** The winding stair's treads to aim at, every `every`th. */
const dnSpiralWaypoints = (every = 2) => {
  const points = [];
  for (let step = 0; step < DN_SPIRAL.steps; step += every) points.push(windingTread(DN_SPIRAL, step));
  points.push(windingTread(DN_SPIRAL, DN_SPIRAL.steps - 1));
  return points;
};

/** The well shaft's winding stair, from the landing down to the crypt: the treads to aim at. */
const dnShaftWaypoints = (every = 2) => {
  const points = [];
  for (let step = DN_SHAFT_SPIRAL.steps - 1; step >= 0; step -= every) points.push(windingTread(DN_SHAFT_SPIRAL, step));
  points.push(windingTread(DN_SHAFT_SPIRAL, 0));
  return points;
};

/**
 * Stage 1 as it was, with company: the two Forger comrades beside him at the start (DN_TEAM, appended last in the cliff section) and the vault's prisoners
 * following him once freed. For the team's tests (the code is kept for a stage that wants it).
 */
export function dunnottarWithTeam() {
  const follow = (spawn) => (spawn.follows === false ? { ...spawn, follows: true } : spawn);
  return { ...DUNNOTTAR, sections: DUNNOTTAR.sections.map((section) => ({ ...section, spawns: [...section.spawns.map(follow), ...(section.id === 'cliff' ? DN_TEAM : [])] })) };
}

/**
 * The way through the stage, as legs of waypoints [x, z] for a walker (test/walker.js): the main route in order, each leg
 * ending in the section named. `open` lists the mechanisms the leg needs set first (the chapel gate; the rest are walked
 * round or through, with the shortcuts tested apart, `DUNNOTTAR_SHORTCUTS`).
 */
export const DUNNOTTAR_ROUTE = [
  { name: 'cliff path', to: 'cliff', points: [[-100, -4], [-80, -4], [-64, -4], [-60.5, -2], [-60.5, 8], [-70, 8], [-90, 8], [-100, 8], [-102.5, 12], [-102.5, 20], [-90, 20], [-70, 20], [-62, 20], [-59, 24], [-58, 30], [-58, 34], [-58, 38], [-58, 44]] },
  { name: 'the drawbridge and the ledge', to: 'gate', points: [[-44, 44], [-34, 45], [-28, 46.2], [-22, 46.2], [-16, 46.2], [-10.4, 46.2], [-7.7, 46.2], [-7.8, 50.4], [-8.2, 54], [-3, 54.2], [2.2, 54], [2.2, 50], [2.2, 47]] },
  { name: 'the oillet stair', to: 'ascent', points: [[5, 46.2], [10, 46.2], [13, 46.2], [16.5, 46.2], [17.7, 42], [17.7, 37], [17.7, 30], [17.7, 26]] },
  { name: 'the tunnelled ascent', to: 'ascent', points: [[17, 22], [17, 14], [17, 9], [17, 6.5]] },
  // The court is a lane: east along the south band to the junction at the east wall, then west along the middle band (the Well, Rest 2) to the plaza and the stair-house.
  { name: 'the south band', to: 'quad', points: [[17, 4.4], [24, 3.6], [32, 3.6], [39, 3.4], [41.6, 1.6], [41.2, -2.6]] },
  { name: 'the middle band, west to the stair-house', to: 'quad', points: [[36, -3.4], [30, -3.4], [24, -3.2], [18, -3.2], [12.5, -2.6], [8.5, -1.4], [5.7, -1.4]] },
  { name: 'the quadrangle to the vault', to: 'vault', points: [[5.7, -2.4], [5.7, -6], [5.7, -12], [5.7, -17], [5.7, -20]] },
  // The cellar to the turnkey's desk (the keep's key), and back to the iron gate: its bar is lifted from the cellar side, and its stair comes up in the court.
  { name: 'the long cellar', to: 'vault', points: [[6, -22.5], [14, -22.5], [22, -22.5], [28, -22.5], [32, -24.4]] },
  { name: 'the iron gate', to: 'vault', points: [[27, -22.5], [24.7, -21]], open: ['irongate'] },
  { name: 'the iron-gate stair', to: 'quad', points: [[24.7, -18.6], [24.7, -14], [24.7, -9], [24.7, -5.8]] },
  { name: 'lane C to the keep\'s door', to: 'quad', points: [[30, -3.2], [36, -3.0], [40.4, -3.4], [41.2, -8], [41.2, -14], [41.2, -20], [41.2, -22.5]], open: ['keepdoor'] },
  { name: 'the keep to the stair tower', to: 'tower', points: [[46, -22.5], [48, -22.5], [52, -23.8], [56, -23.8], [59, -23.8]] },
  { name: 'the winding stair', to: 'tower', points: dnSpiralWaypoints(2) },
  { name: 'the wall walk', to: 'tower', points: [[63.4, -28.4], [63.4, -31], [63.4, -36], [50, -36], [44, -36], [37, -36], [30, -36], [24, -36], [20, -36], [10, -36], [5, -36], [0, -36]], open: ['chapelgate'] },
  { name: 'the chapel', to: 'chapel', points: [[-6, -36], [-14, -36], [-22, -36]] },
];

/**
 * The way round the guarded gate, as DUNNOTTAR_ROUTE is the way through it: down the cliff path as before, then not east to the postern but along
 * the shelf to the head of the sea cave's stair, down it, in at the cave and along the old drain (the grotto, the first drain, the cistern's
 * causeway, the second drain and its stair, the long drain, the cesspool and the stair after it) to the sea-gate chamber; then through the crypt (the
 * flooded way north, the gallery east past the ossuary's door) to the well shaft, up its winding stair into the cellar, where it joins the main route.
 * (It went up the stair behind the heavy door, opened by a lever at the sea-gate: the lever is gone, the user's call, and the door stays shut.)
 */
export const DUNNOTTAR_SEWER_ROUTE = [
  DUNNOTTAR_ROUTE[0],
  { name: 'the shelf to the sea cave stair', to: 'cliff', points: [[-58, 46], [-57, 50], [-53, 52.8], [-46, 53.4], [-40, 53.8], [-34, 54.0], [DN_CAVE_STAIR.head + 1.6, 54.8], [DN_CAVE_STAIR.head + 1.7, 56.6], [DN_CAVE_STAIR.head + 1.4, 57.6]] },
  { name: 'down the stair to the landing', to: 'cliff', points: [[DN_CAVE_STAIR.head - 2, 57.6], [DN_CAVE_STAIR.foot + 2, 57.6], [DN_CAVE_STAIR.foot - 2, 57.6], [-44, 57.6], [-47.8, 57.6], [-48.5, 56.6]] },
  { name: 'the grotto and the first drain', to: 'sewer', points: [[-48.5, 53], [-48.5, 48], [-48.5, 44], [-48.5, 38], [-48.5, 30], [-48.5, 24]] },
  { name: 'the cistern causeway', to: 'sewer', points: [[-48.5, 20], [-48.5, 14], [-48.5, 8], [-48.5, 2]] },
  { name: 'the second drain and its stair', to: 'sewer', points: [[-48.5, -4], [-48.5, -8], [-48.5, -12], [-48.5, -16], [-48.5, -24], [-48.5, -32], [-48.5, -36.4]] },
  { name: 'the long drain', to: 'sewer', points: [[-46, -37.9], [-40, -37.9], [-30, -37.9], [-20, -37.9], [-13, -37.9], [-9, -37.9], [-4, -37.9]] },
  { name: 'the sea-gate', to: 'crypt', points: [[0.8, -37.9], [4, -37.7], [5.8, -37.2]] },
  { name: 'the flooded way and the gallery', to: 'crypt', points: [[6.2, -34.2], [6.2, -31.5], [6.2, -28], [6.2, -25.6], [8.5, -24.4], [12, -24.4], [18, -24.4], [26, -24.4], [28.6, -25.2], [28.6, -27.4]] },
  { name: 'up the well shaft', to: 'vault', points: [...dnShaftWaypoints(2).reverse(), [27.2, -29.4], [28.6, -27.6], [28.6, -25], [28.6, -22.5]] },
  ...DUNNOTTAR_ROUTE.slice(DUNNOTTAR_ROUTE.findIndex((leg) => leg.name === 'the long cellar')),
];

/** The three shortcuts and the doors: what to set, and a short way to walk to show it open. */
export const DUNNOTTAR_SHORTCUTS = [
  { name: 'the cliff gate (from the gatehouse side)', mechanism: 'cliffgate', start: [-3, DN_Y.gorge, 46.2], facing: DN_FACE.W, points: [[-10, 46.2], [-20, 46.2]], blockedWhenClosed: true },
  { name: 'the ladder, kicked down from the upper wall', mechanism: 'ladder1', state: 'down', start: [14.3, DN_Y.quad, -22], facing: DN_FACE.N, points: [[14.3, -26], [14.3, -28], [14.3, -30], [14.3, -31], [14.3, -32.5], [14.3, -33.5], [14.3, -36]], blockedWhenClosed: true },
  { name: 'the iron gate up from the vault (the way out of the cellar, with the west stair the way in)', mechanism: 'irongate', start: [24.7, DN_Y.vault, -21], facing: DN_FACE.S, points: [[24.7, -18.6], [24.7, -14], [24.7, -9], [24.7, -5]], blockedWhenClosed: true },
  { name: 'the keep\'s door in the east wall', mechanism: 'keepdoor', start: [41.2, DN_Y.quad, -14], facing: DN_FACE.N, points: [[41.2, -20], [41.2, -22.5], [44.2, -22.5], [48, -22.5]], blockedWhenClosed: true },
  { name: 'the cell door', mechanism: 'celldoor', start: [16.7, DN_Y.vault, -23.5], facing: DN_FACE.N, points: [[16.7, -27], [16.7, -31]], blockedWhenClosed: true },
  { name: 'the chapel gate', mechanism: 'chapelgate', start: [1, DN_Y.ladderRoom, -36], facing: DN_FACE.W, points: [[-3, -36], [-8, -36]], blockedWhenClosed: true },
  { name: 'the heavy door on the stair up from the sea-gate', mechanism: 'cryptgate', start: [1.7, DN_Y.crypt, -36.0], facing: DN_FACE.S, points: [[1.7, -34.6], [1.7, -32], [1.7, -31], [1.7, -29.8], [2.4, -28.4]], blockedWhenClosed: true },
  { name: 'the inner cell door', mechanism: 'innerdoor', start: [-30.4, DN_Y.ladderRoom, -36], facing: DN_FACE.W, points: [[-34.4, -36], [-38, -36], [-42, -36]], blockedWhenClosed: true },
];

/**
 * The optional ways off the main route, each a walk from a start (a point [x, y, z] and a facing) that a man can make: `to` is the section he is in
 * at the end (and `seen` the sections that wake along it), `open` the mechanisms to set first. They are the vault's branches: the torture chamber,
 * the stores, the well shaft down to the crypt (its gallery, the ossuary, the keepers' tombs, the flooded way, the sea-gate).
 */
export const DUNNOTTAR_BRANCHES = [
  { name: 'the torture chamber', start: [20, DN_Y.vault, -22.5], facing: DN_FACE.W, to: 'vault', points: [[9, -22.5], [6.6, -23.8], [6.6, -26.6], [6.6, -29], [5.4, -31], [5.2, -34], [9, -34.4], [9.2, -30.6], [7, -29.4]] },
  { name: 'the stores', start: [20, DN_Y.vault, -22.5], facing: DN_FACE.W, to: 'vault', points: [[15.2, -22.5], [15.2, -19.5], [15.2, -16], [15.2, -14.6], [15.2, -12.5], [16.4, -10], [17.4, -8.6], [13.4, -8.4]] },
  { name: 'the well shaft, the crypt and the sea-gate', start: [20, DN_Y.vault, -22.5], facing: DN_FACE.E, to: 'crypt', seen: ['crypt'], points: [[28.6, -22.5], [28.6, -25], [28.6, -27.6], [27.2, -29.4], ...dnShaftWaypoints(2), [28.6, -27.4], [28.6, -25.2], [26, -24.4], [18, -24.4], [16.9, -23.4], [16.9, -20.2], [16.6, -24.4], [16.6, -26.4], [16.6, -28.4], [15.4, -30.4], [16.6, -28.4], [16.6, -25.6], [12, -24.4], [8.5, -24.4], [6.2, -25.6], [6.2, -28], [6.2, -31.5], [6.2, -34.2], [5.8, -37.2]] },
];
