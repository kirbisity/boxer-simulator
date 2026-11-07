// One gun's shot into a body of men (physics/artillery.js): a file (men one behind another on the line) or a rank (men
// side by side across it), of Japanese ashigaru in their armour, `range` m off; how many it struck and put down, and what
// energy the ball came on into each man with. Usage: node tools/gunshot.js [gun=folangji] [load=ball] [shape=file]
// [range=15] [shots=10]. (Each shot a fresh world: the same men, stood again.)

import { P } from '../src/body.js';
import { mingSoldier, sengokuWarrior } from '../src/cast.js';
import { advance, createWorld, placeFighter, point, seededRandom } from '../src/physics.js';
import { ARTILLERY, firePiece } from '../src/physics/artillery.js';

/** One shot of `gun` (`load`) into ten men in a `shape` at `range` m: { struck, down, energies }. */
export function gunShot({ gun = 'folangji', load = 'ball', shape = 'file', range = 15, seed = 1, men = 10 } = {}) {
  const random = seededRandom(seed);
  const cast = [{ inputs: mingSoldier(random, 'dao', 'brigandine'), corner: 'red' }];
  for (let k = 0; k < men; k += 1) cast.push({ inputs: sengokuWarrior(random, { tint: {} }, 'yari', 'ashigaru'), corner: 'blue' });
  const world = createWorld(cast, { seed, arena: { halfX: 60, halfZ: 20 }, artillery: [{ kind: gun, at: [-range, 0], facing: [1, 0], crew: [0], load }] });
  placeFighter(world.fighters[0], -range - 1, 0);
  // A file 1.2 m from back to chest (a close order's depth), a rank 0.8 m from man to man.
  for (let k = 0; k < men; k += 1) placeFighter(world.fighters[1 + k], shape === 'file' ? k * 1.2 : 0, shape === 'file' ? 0 : (k - (men - 1) / 2) * 0.8);
  const piece = world.artillery.pieces[0];
  const target = world.fighters[shape === 'file' ? 1 : 1 + Math.floor(men / 2)];
  piece.mark = point(target.x, P.neck);
  piece.mark[1] -= 0.25;
  piece.elevation = Math.atan2(piece.mark[1] - ARTILLERY.pieces[gun].muzzleUp, range);
  firePiece(world, piece, world.fighters[0], load);
  advance(world, 0.5, () => {});
  const hits = world.events.filter((event) => event.kind === 'shot' && event.gun);
  return { struck: new Set(hits.map((event) => event.defender)).size, down: world.fighters.slice(1).filter((fighter) => fighter.state === 'out').length, energies: hits.filter((event) => event.load === 'ball').map((event) => Math.round(event.energy)) };
}

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const [gun = 'folangji', load = 'ball', shape = 'file', range = '15', shots = '10'] = process.argv.slice(2);
  const results = Array.from({ length: Number(shots) }, (_, k) => gunShot({ gun, load, shape, range: Number(range), seed: k + 1 }));
  for (const result of results) console.log(JSON.stringify(result));
  const mean = (key) => (results.reduce((sum, each) => sum + each[key], 0) / results.length).toFixed(1);
  console.log(`${gun} ${load} into a ${shape} of 10 at ${range} m: struck ${mean('struck')}, down ${mean('down')} a shot (${results.length} shots)`);
}
