// Fight AI: reads only what a boxer can see (distance, the opponent's punch
// starting, its own stamina) and issues the same commands a player would.

import { P } from './body.js';
import { nearestOpponent, point, throwPunch } from './physics.js';
import { vec } from './pose.js';

export const AI = {
  // Picks per punch; jabs dominate real bouts (CompuBox: ~45–55% of punches).
  punchWeights: { jab: 0.48, cross: 0.24, hook: 0.16, uppercut: 0.12 },
  bodyShotShare: 0.2,
  // Seconds between punches; pros throw ~40–60 a round (CompuBox), one
  // every 3–4 s, in bursts.
  restMin: 0.9,
  restRange: 2.0,
  defendChance: 0.35,
  rangeSlack: 0.12,
  // Pelvis-to-pelvis distance beyond arm reach: the lead hand then lands
  // near full extension, when it is fastest.
  rangeExtra: 0.2,
};

function pick(weights, random) {
  let roll = random() * Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  for (const [key, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return Object.keys(weights)[0];
}

/** One AI decision tick for every fighter not driven by the player. */
export function thinkAll(world, dt, playerIds = new Set()) {
  for (const fighter of world.fighters) {
    if (!playerIds.has(fighter.id)) think(world, fighter, dt);
  }
}

export function think(world, fighter, dt) {
  const random = world.random;
  if (fighter.state !== 'up') {
    fighter.move = 0;
    return;
  }
  const opponent = nearestOpponent(world, fighter);
  if (!opponent) {
    fighter.move = 0;
    return;
  }
  const distance = vec.length(vec.sub(point(opponent.x, P.pelvis), point(fighter.x, P.pelvis)));
  // Fight at the distance where the lead hand just lands.
  const range = fighter.body.reach + opponent.body.lengths.headRadius + AI.rangeExtra;
  if (distance > range + AI.rangeSlack) fighter.move = 1;
  else if (distance < range - AI.rangeSlack * 2) fighter.move = -0.7;
  else fighter.move = fighter.move * Math.exp(-dt * 4);
  if (fighter.stamina < 0.25 && distance < range + 0.4) fighter.move = -0.6;

  // React to a punch already on its way, the way a defensive fighter would.
  if (opponent.punch && opponent.punch.t < 0.06 && !fighter.reacted && !fighter.punch) {
    fighter.reacted = true;
    if (random() < AI.defendChance * (0.6 + 0.6 * fighter.body.inputs.training)) {
      if (random() < 0.5) {
        fighter.slip = 0.32;
        fighter.slipSide = random() < 0.5 ? 1 : -1;
      } else fighter.guardHigh = 0.45;
    }
  }
  if (!opponent.punch) fighter.reacted = false;

  if (fighter.cooldown > 0 || fighter.punch || distance > range + 0.25) return;
  const type = pick(AI.punchWeights, random);
  const zone = random() < AI.bodyShotShare ? 'body' : 'head';
  if (throwPunch(world, fighter, type, zone)) {
    const tired = 1.6 - fighter.stamina * 0.6;
    fighter.cooldown = (AI.restMin + random() * AI.restRange) * tired;
  }
}
