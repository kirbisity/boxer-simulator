import test from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { createWorld, seededRandom } from '../src/physics.js';
import { slotAt } from '../src/formation.js';
import { legionSides, SCENARIOS } from '../src/scenarios.js';
import { canCommand, COMMAND, giveOrder, keepOrders, obeyOrder, orderKeepsPlace, standingOrder } from '../src/command.js';
import { orderBattle, runOrders, towardEnemy } from '../tools/orders.js';

const at = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const hearing = (men) => men.filter((fighter) => fighter.state === 'up' && !fighter.panicked && !fighter.crawling);

/** Rome against Han, `count` a side (the player the legion's lead), quicker than the level's thirty-five. */
function legion(count = 12, seed = 3) {
  const sides = legionSides(seededRandom(seed), count);
  const level = SCENARIOS.legion;
  const world = createWorld([...sides.red.map((inputs) => ({ inputs, corner: 'red' })), ...sides.blue.map((inputs) => ({ inputs, corner: 'blue' }))], { seed, arena: level.arena, formation: level.formation });
  const player = world.fighters.find((fighter) => fighter.corner === 'red');
  return { world, player, men: world.fighters.filter((fighter) => fighter.corner === 'red' && fighter !== player) };
}

test('orders are for a side of four or more: not a one-on-one; every battle begins free', () => {
  const duel = createWorld([{ inputs: legionSides(seededRandom(1), 1).red[0], corner: 'red' }, { inputs: legionSides(seededRandom(1), 1).blue[0], corner: 'blue' }]);
  assert.equal(canCommand(duel, duel.fighters[0]), false);
  const { world, player } = legion();
  assert.equal(canCommand(world, player), true);
  assert.equal(standingOrder(world, 'red'), 'free');
  assert.equal(COMMAND.minSide, 4);
});

test('To me: his men leave the ranks and gather round him, all within a few metres, and stand there', () => {
  const { world, player, men } = legion();
  const before = mean(men.map((fighter) => apart(at(fighter), at(player))));
  giveOrder(world, player, 'rally');
  assert.equal(standingOrder(world, 'red'), 'rally');
  runOrders(world, player, 8);
  const up = hearing(men);
  const after = up.map((fighter) => apart(at(fighter), at(player)));
  assert.ok(mean(after) < 3.5 && mean(after) < before, `mean ${mean(after).toFixed(2)} m (was ${before.toFixed(2)})`);
  assert.ok(after.every((distance) => distance < 6), `all within 6 m: ${after.map((distance) => distance.toFixed(1)).join(' ')}`);
  // Arrived, they stand (not milling about).
  const speeds = up.map((fighter) => Math.hypot(...fighter.rootVelocity));
  assert.ok(mean(speeds) < 0.4, `standing: ${mean(speeds).toFixed(2)} m/s`);
});

test('To me in a loose crowd (no drill): the raiders gather round their man', () => {
  const { world, player, men } = orderBattle('wokou', 2);
  giveOrder(world, player, 'rally');
  runOrders(world, player, 6);
  const after = hearing(men).map((fighter) => apart(at(fighter), at(player)));
  assert.ok(mean(after) < 4, `mean ${mean(after).toFixed(2)} m`);
});

test('Charge: his men go the way he gave, far further than they would have', () => {
  const ordered = legion();
  const free = legion();
  const way = towardEnemy(ordered.world, ordered.player);
  const starts = new Map([...ordered.men, ...free.men].map((fighter) => [fighter, at(fighter)]));
  const along = (men) => mean(men.map((fighter) => (at(fighter)[0] - starts.get(fighter)[0]) * way[0] + (at(fighter)[1] - starts.get(fighter)[1]) * way[1]));
  giveOrder(ordered.world, ordered.player, 'charge', { dir: way });
  runOrders(ordered.world, ordered.player, 6);
  runOrders(free.world, free.player, 6);
  assert.ok(along(ordered.men) > along(free.men) + 4, `charged ${along(ordered.men).toFixed(1)} m, free ${along(free.men).toFixed(1)} m`);
  // Each goes for a man in that way.
  for (const fighter of hearing(ordered.men)) {
    if (fighter.order?.target === null || fighter.order?.target === undefined) continue;
    const target = ordered.world.fighters[fighter.order.target];
    const offset = [at(target)[0] - ordered.world.commands.red.at[0], at(target)[1] - ordered.world.commands.red.at[1]];
    assert.ok(offset[0] * way[0] + offset[1] * way[1] > -COMMAND.charge.behind, 'his man is ahead, the way given');
  }
});

test('Charge with nobody in the way: each halts where he got to and holds there', () => {
  const { world, player, men } = legion();
  // Away from the enemy altogether.
  const way = towardEnemy(world, player);
  giveOrder(world, player, 'charge', { dir: [-way[0], -way[1]] });
  runOrders(world, player, 1);
  const halted = hearing(men).filter((fighter) => fighter.order?.halted);
  assert.ok(halted.length >= men.length - 1, `${halted.length} of ${men.length} halted`);
  const starts = new Map(halted.map((fighter) => [fighter, at(fighter)]));
  runOrders(world, player, 3);
  const moved = mean(halted.map((fighter) => apart(at(fighter), starts.get(fighter))));
  assert.ok(moved < 0.6, `held: ${moved.toFixed(2)} m`);
});

test('Hold: the formation stops where it is and his men stand in their ranks; loose men stand on their ground', () => {
  const ranks = legion();
  giveOrder(ranks.world, ranks.player, 'hold');
  const anchor = [...ranks.world.formations.red.anchor];
  runOrders(ranks.world, ranks.player, 6);
  assert.ok(apart(anchor, ranks.world.formations.red.anchor) < 1e-9, 'the anchor held');
  for (const fighter of hearing(ranks.men)) {
    assert.equal(fighter.order.ranks, true);
    // In his place (closed up in the testudo as the ranks are).
    assert.ok(apart(at(fighter), slotAt(ranks.world.formations.red, fighter.slot)) < 1, `in his place: ${apart(at(fighter), slotAt(ranks.world.formations.red, fighter.slot)).toFixed(2)} m`);
  }
  const loose = orderBattle('wokou', 2);
  giveOrder(loose.world, loose.player, 'hold');
  const starts = new Map(loose.men.map((fighter) => [fighter, at(fighter)]));
  runOrders(loose.world, loose.player, 4);
  const moved = mean(hearing(loose.men).map((fighter) => apart(at(fighter), starts.get(fighter))));
  assert.ok(moved < 0.5, `held their ground: ${moved.toFixed(2)} m`);
});

test('Free: the order taken back, the side goes its own way again (back to the ranks)', () => {
  const { world, player, men } = legion();
  giveOrder(world, player, 'rally');
  runOrders(world, player, 5);
  const formation = world.formations.red;
  const fromSlots = () => mean(hearing(men).map((fighter) => apart(at(fighter), slotAt(formation, fighter.slot))));
  const rallied = fromSlots();
  giveOrder(world, player, 'free');
  assert.equal(standingOrder(world, 'red'), 'free');
  assert.ok(men.every((fighter) => !orderKeepsPlace(world, fighter)));
  runOrders(world, player, 5);
  assert.ok(fromSlots() < rallied * 0.5, `back toward their places: ${rallied.toFixed(2)} → ${fromSlots().toFixed(2)} m`);
});

test('a broken, crawling or fled man hears no order; the order lapses with its giver out', () => {
  const { world, player, men } = legion();
  giveOrder(world, player, 'rally');
  const [broken, crawling, fled, steady] = men;
  broken.panicked = true;
  crawling.crawling = true;
  fled.fled = true;
  const foe = world.fighters.find((fighter) => fighter.corner === 'blue');
  const style = { attacks: {} };
  for (const fighter of [broken, crawling, fled]) {
    assert.equal(obeyOrder(world, fighter, foe, style, 1 / 60), null);
    assert.equal(orderKeepsPlace(world, fighter), false);
  }
  assert.equal(obeyOrder(world, steady, foe, style, 1 / 60), 'obeyed');
  player.state = 'out';
  keepOrders(world);
  assert.equal(standingOrder(world, 'red'), 'free');
});
