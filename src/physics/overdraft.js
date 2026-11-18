// The stamina overdraft: past empty a man keeps going, weaker, until he faints. The man played has it always (`fighter.player`:
// control.js directFighter, main.js); any other man only while he chooses to drive himself past his breath (`fighter.overdraw`:
// ai.js, under fire and short of his enemy, Agincourt's men-at-arms pushing on under the arrows). For a man not overdrawing, his
// stamina stops where it is (at empty, or where the overdraft he ran into left it) and his recovery brings it back up. The numbers
// are WORLD.overdraft's.
//
// Stamina is 0..1 above empty; below it, down to `floor`, is the overdraft. `depth` is 0 at empty to 1 at the floor.

import { WORLD } from './config.js';

/** Whether this man may draw past empty now: the man played, or one driving himself on (`overdraw`). */
export function overdraws(fighter) {
  return Boolean(fighter.player || fighter.overdraw);
}

/** How deep in the overdraft a stamina is: 0 at empty or above, 1 at the floor. */
export function overdraftDepth(stamina) {
  return Math.max(0, Math.min(1, stamina / WORLD.overdraft.floor));
}

/**
 * The muscles' share for a stamina (physics.js integrate): 0.55 + 0.45 × stamina from empty up, as it always was, and from
 * empty down a straight line on to `forceAtFloor` at the floor.
 */
export function fatigueScale(stamina) {
  if (stamina >= 0) return 0.55 + 0.45 * stamina;
  return 0.55 - (0.55 - WORLD.overdraft.forceAtFloor) * overdraftDepth(stamina);
}

/**
 * Draw `amount` of stamina. Anyone else stops at empty; the player goes on down to the floor, and a draw that would take him
 * past it holds him there and marks him to faint (`faintDue`: physics.js takes him down), unless he has only just woken
 * (`faintGrace`).
 */
export function drawStamina(fighter, amount) {
  if (!overdraws(fighter)) {
    fighter.stamina = Math.max(Math.min(0, fighter.stamina), fighter.stamina - amount);
    return;
  }
  const next = fighter.stamina - amount;
  if (next < WORLD.overdraft.floor) {
    if (!(fighter.faintGrace > 0)) fighter.faintDue = true;
    fighter.stamina = WORLD.overdraft.floor;
  } else fighter.stamina = next;
}

/**
 * The wind a blow to the body takes, `demand` being the old cost (speed change over mass, over fitness). A blow (a shove, `push`,
 * takes less) loses at most WORLD.wind's cap of the bar, and hits alone never bring him below its floor: a man is winded for a
 * moment by being hit, he is not tired out by it. Never faints the player (that is for work: drawStamina).
 */
export function takeWind(fighter, demand, push) {
  const wind = WORLD.wind;
  const cap = push ? wind.pushCap : wind.blowCap;
  const share = push ? wind.pushShare : 1;
  const loss = cap * (1 - Math.exp(-(demand * share) / cap));
  const after = Math.min(fighter.stamina, Math.max(wind.floor, fighter.stamina - loss));
  // (What it took is owed back: physics.js gives it back over `returnSeconds`.)
  fighter.windDebt = (fighter.windDebt ?? 0) + (fighter.stamina - after);
  fighter.stamina = after;
}

/** The share of the usual recovery he gets now: a quarter below empty, all of it from empty up. */
export function recoveryShare(stamina) {
  return stamina < 0 ? WORLD.overdraft.recoveryShare : 1;
}

/**
 * How much of the screen the overdraft takes, 0 (clear) to 1 (black): a function of stamina alone, rising with the depth.
 * Nothing at empty or above.
 */
export function overdraftScreen(stamina) {
  return overdraftDepth(stamina) ** WORLD.overdraft.screen.curve;
}

/** The screen as the player sees it: the overdraft's, or the black of a faint while it lasts (`blackout`), whichever is more. */
export function fadeOf(fighter) {
  return Math.max(overdraftScreen(fighter.stamina), fighter.blackout ?? 0);
}

/**
 * The stamina bar's two parts, shares of the bar: `fill` the stamina left above empty, `debt` how deep below it he is (the
 * second segment, red).
 */
export function staminaBar(stamina) {
  return { fill: Math.max(0, Math.min(1, stamina)), debt: overdraftDepth(stamina) };
}
