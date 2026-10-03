// Fight AI: reads only what a fighter can see (distance, the opponent's strike
// starting, its own stamina) and issues the same commands a player would,
// choosing from its style's moves those that reach from where it stands.

import { P } from './body.js';
import { MOVES, STYLES, moveRange } from './moves.js';
import { nearestOpponent, perform, point, throwPunch } from './physics.js';
import { vec } from './pose.js';

export const AI = {
  bodyShotShare: 0.2,
  // Seconds between attacks; pros throw ~40–60 strikes a round, in bursts.
  restMin: 0.9,
  restRange: 2.0,
  rangeSlack: 0.12,
  // Pelvis-to-pelvis distance beyond arm reach the AI stands at: the lead
  // hand then lands near full extension, when it is fastest.
  rangeExtra: 0.2,
  // Kickers hold a little further out than punchers.
  kickerExtra: 0.15,
  // Charges per second at range, per unit of the style's rush weight: at
  // 0.006 about one every two minutes, more for the charging styles.
  rushPerWeight: 1.5,
  // Pressure spells: how long one lasts, and how often they start per
  // second per unit of the style's pressure share.
  pressureSeconds: 4,
  pressureSpellsPerShare: 0.25,
};

function pick(weights, random) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  let roll = random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return entries[0]?.[0] ?? null;
}

/** One AI decision tick for every fighter not driven by the player. */
export function thinkAll(world, dt, playerIds = new Set()) {
  for (const fighter of world.fighters) {
    if (!playerIds.has(fighter.id)) think(world, fighter, dt);
  }
}

/** The defence that answers this incoming strike, from the style's repertoire. */
function chooseDefence(style, incoming, random) {
  const answers = { ...style.defences };
  const spec = incoming.spec;
  if (incoming.zone === 'legs') return answers.check ? 'check' : answers.stepBack ? 'stepBack' : 'guard';
  if (spec.limb.endsWith('Foot')) {
    // Kicks are answered by distance or a high guard; nobody slips a shin.
    delete answers.slip;
    delete answers.roll;
    delete answers.parry;
    delete answers.check;
  } else {
    delete answers.check;
    if (!spec.limb.endsWith('Hand')) delete answers.parry;
  }
  return pick(answers, random) ?? 'guard';
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
  const style = STYLES[fighter.style];
  const distance = vec.length(vec.sub(point(opponent.x, P.pelvis), point(fighter.x, P.pelvis)));
  const kicker = (style.attacks.roundhouse ?? 0) + (style.attacks.teep ?? 0) > 0.15;
  // Spells of pressure: for a few seconds the fighter works inside.
  fighter.aiPressure = Math.max(0, (fighter.aiPressure ?? 0) - dt);
  if (fighter.aiPressure === 0 && random() < (style.pressure ?? 0) * AI.pressureSpellsPerShare * dt) fighter.aiPressure = AI.pressureSeconds;
  const inside = fighter.aiPressure > 0;
  const range = inside ? fighter.body.reach * 0.75 : fighter.body.reach + opponent.body.lengths.headRadius + AI.rangeExtra + (kicker ? AI.kickerExtra : 0);
  if (!fighter.defence || fighter.defence.name !== 'stepBack') {
    if (distance > range + AI.rangeSlack) fighter.move = 1;
    else if (distance < range - AI.rangeSlack * 2 && !fighter.clinch) fighter.move = -0.7;
    else fighter.move *= Math.exp(-dt * 4);
    if (fighter.stamina < 0.25 && distance < range + 0.4) fighter.move = -0.6;
  }

  // React to a strike already on its way, the way a trained fighter would.
  if (opponent.punch && opponent.punch.t < 0.07 && !fighter.reacted && !fighter.punch) {
    fighter.reacted = true;
    if (random() < style.defendChance * (0.6 + 0.6 * fighter.body.inputs.exercise)) perform(world, fighter, chooseDefence(style, opponent.punch, random));
  }
  if (!opponent.punch) fighter.reacted = false;

  if (fighter.cooldown > 0 || fighter.punch || fighter.rush) return;
  // Choose among the moves that reach from here; in the clinch, knees.
  const choices = {};
  for (const [name, weight] of Object.entries(style.attacks)) {
    const spec = MOVES[name];
    if (fighter.clinch) {
      if (name === 'knee') choices[name] = 1;
      continue;
    }
    if (spec.kind === 'rush') {
      // A charge is its own decision, not a fallback when nothing else reaches.
      if (distance > range - 0.1 && distance < range + 1.2 && random() < weight * AI.rushPerWeight * dt) {
        if (throwPunch(world, fighter, name)) fighter.cooldown = AI.restMin + random() * AI.restRange;
        return;
      }
      continue;
    }
    if (spec.kind === 'clinch') {
      if (distance < fighter.body.reach * 1.05) choices[name] = weight * 2;
      continue;
    }
    const reach = moveRange(spec, fighter.body) + opponent.body.lengths.headRadius;
    // Close-range moves only when close; long ones only when there is room.
    if (distance <= reach && (spec.reach !== 'leg' || distance > fighter.body.reach * 0.9)) choices[name] = weight;
  }
  const move = pick(choices, random);
  if (!move) return;
  const spec = MOVES[move];
  const zone = spec.zones ? (random() < AI.bodyShotShare ? spec.zones.at(-1) : spec.zones[0]) : null;
  if (throwPunch(world, fighter, move, zone)) {
    const tired = 1.6 - fighter.stamina * 0.6;
    fighter.cooldown = (AI.restMin + random() * AI.restRange) * tired * (fighter.clinch ? 0.4 : 1);
  }
}
