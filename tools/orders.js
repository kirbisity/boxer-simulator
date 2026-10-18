// The player's orders to his side (command.js), measured headless: in a
// level's battle, how near his men come to him after "To me", how far they
// go the way he gave after "Charge" (at their middle, and turned toward a
// flank; against the same battle left free),
// and how still they stand on "Hold".
// Usage: node tools/orders.js [level=legion] [seconds=10] [seed=1]

import { thinkAll } from '../src/ai.js';
import { advance } from '../src/physics.js';
import { scenarioWorld } from '../src/scenarios.js';
import { P } from '../src/body.js';
import { giveOrder } from '../src/command.js';

const at = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

/** The level's battle, the player its red side's lead (as main.js plays it), and his men. */
export function orderBattle(level, seed = 1) {
  const world = scenarioWorld(level, seed);
  const player = world.fighters.find((fighter) => fighter.corner === 'red');
  const men = world.fighters.filter((fighter) => fighter.corner === 'red' && fighter !== player);
  return { world, player, men };
}

/** Run with the player standing where he is (not thought for), `seconds` long. */
export function runOrders(world, player, seconds) {
  const players = new Set([player.id]);
  advance(world, seconds, (current, dt) => {
    thinkAll(current, dt, players);
    player.move = 0;
    player.strafe = 0;
  });
}

/** The way from the player to the middle of the enemy (as the camera behind him looks at the start). */
export function towardEnemy(world, player) {
  const enemies = world.fighters.filter((fighter) => fighter.corner !== player.corner);
  const middle = [mean(enemies.map((fighter) => at(fighter)[0])), mean(enemies.map((fighter) => at(fighter)[1]))];
  const length = apart(middle, at(player)) || 1;
  return [(middle[0] - at(player)[0]) / length, (middle[1] - at(player)[1]) / length];
}

// The flank charge: the way given turned this far (rad) off the enemy's middle, toward one end of their line.
const FLANK = 0.6;

/** Each order from the start of the battle: the numbers that say what it did. */
export function measureOrders(level, seconds = 10, seed = 1) {
  const rows = {};
  {
    const { world, player, men } = orderBattle(level, seed);
    const before = mean(men.map((fighter) => apart(at(fighter), at(player))));
    giveOrder(world, player, 'rally');
    runOrders(world, player, seconds);
    const up = men.filter((fighter) => fighter.state === 'up' && !fighter.panicked && !fighter.crawling);
    const after = up.map((fighter) => apart(at(fighter), at(player)));
    rows.rally = { meanBefore: before.toFixed(2), meanAfter: mean(after).toFixed(2), within6m: `${after.filter((distance) => distance < 6).length}/${up.length}` };
  }
  for (const [name, turn] of [['charge', 0], ['chargeFlank', FLANK]]) {
    const ordered = orderBattle(level, seed);
    const free = orderBattle(level, seed);
    const straight = towardEnemy(ordered.world, ordered.player);
    const way = [straight[0] * Math.cos(turn) - straight[1] * Math.sin(turn), straight[0] * Math.sin(turn) + straight[1] * Math.cos(turn)];
    const starts = new Map([...ordered.men, ...free.men].map((fighter) => [fighter, at(fighter)]));
    const along = (men) => mean(men.map((fighter) => (at(fighter)[0] - starts.get(fighter)[0]) * way[0] + (at(fighter)[1] - starts.get(fighter)[1]) * way[1]));
    giveOrder(ordered.world, ordered.player, 'charge', { dir: way });
    const marks = [];
    for (let t = 0; t < seconds; t += 2) {
      runOrders(ordered.world, ordered.player, 2);
      runOrders(free.world, free.player, 2);
      marks.push(`${t + 2}s ${along(ordered.men).toFixed(1)} m (free ${along(free.men).toFixed(1)})`);
    }
    rows[name] = { meanAlongDir: marks.join(', ') };
  }
  {
    const { world, player, men } = orderBattle(level, seed);
    giveOrder(world, player, 'hold');
    const starts = new Map(men.map((fighter) => [fighter, at(fighter)]));
    const anchor = world.formations?.red ? [...world.formations.red.anchor] : null;
    runOrders(world, player, seconds);
    const up = men.filter((fighter) => fighter.state === 'up');
    rows.hold = {
      meanMoved: mean(up.map((fighter) => apart(at(fighter), starts.get(fighter)))).toFixed(2),
      anchorMoved: anchor ? apart(anchor, world.formations.red.anchor).toFixed(2) : 'no formation',
    };
  }
  return rows;
}

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const level = process.argv[2] ?? 'legion';
  const seconds = Number(process.argv[3] ?? 10);
  const seed = Number(process.argv[4] ?? 1);
  console.log(level, JSON.stringify(measureOrders(level, seconds, seed), null, 1));
}
