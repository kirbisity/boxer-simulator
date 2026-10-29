// What a battle came to, side by side: for each side its men, how many were
// killed, wounded, knocked down, broke, crawled away, fled the field, came
// back, and were still standing at the end. Read from the world as the
// battle left it and from its events, so the end-of-battle summary on the
// page and the level tool (tools/levels.js), which fights the same battles
// headless over many seeds, count the same way and always agree.

import { hurtShare } from './ai.js';
import { inFight, legShare } from './physics.js';

/**
 * How hurt a man who lived must be to count as wounded (0..1, of hurtShare or
 * legShare: the worst of his concussion, blood lost, gunshot wounds and
 * knockdowns, or how far gone his legs are). A quarter: past the bruises and
 * scratches every man in a battle takes, a man who was really hurt. A broken
 * bone or a limb cut off counts whatever the rest of him is.
 */
export const WOUNDED_AT = 0.25;

/** The kinds of event that are a man's death: cut or shot down, bled out, drowned. */
const DEATHS = new Set(['killed', 'bledOut', 'drowned']);

/** Killed: a death among the events, or his head off (a severed neck goes down as 'out', but no man lives through it). */
function killedIds(events) {
  return new Set(events.filter((event) => DEATHS.has(event.kind) || (event.kind === 'severed' && event.joint === 'neck')).map((event) => event.fighter));
}

/** Wounded: lived, and hurt past WOUNDED_AT, or a bone broken or a limb lost. */
export function wounded(fighter) {
  return Math.max(hurtShare(fighter), legShare(fighter)) >= WOUNDED_AT || (fighter.broken?.size ?? 0) > 0;
}

/**
 * Each side's tally at the end of a battle: { red, blue }, each
 * - men: how many it had;
 * - killed: dead (DEATHS, or beheaded);
 * - wounded: alive and wounded (wounded()), wherever he is: still up, down, or gone;
 * - down: on the ground at the end and still on the field (the dead too: the level tool's figure);
 * - cold: down but alive: knocked cold, or past going on;
 * - broke: broke at some point (a 'panic' event);
 * - crawled: went down on his knees to crawl away as his side broke (the rout's crawl);
 * - crawling: still crawling off at the end, out of the fight, though neither down nor fled;
 * - fled: off the field (ran or crawled off it);
 * - rallied: each time one of them came back to the fight from the field's edge (a man may come back twice);
 * - standing: still in the fight at the end, and not broken.
 */
export function battleTally(world) {
  const events = world.events;
  const killed = killedIds(events);
  const broke = new Set(events.filter((event) => event.kind === 'panic').map((event) => event.fighter));
  // Broken in the rout (ai.js AI.rout): who went down to crawl, and each time one came back to the fight.
  const crawled = new Set(events.filter((event) => event.kind === 'crawl' && event.effects[0] === 'crawls away in the rout').map((event) => event.fighter));
  const rallies = events.filter((event) => event.kind === 'rally' && event.effects[0] === 'comes back to the fight').map((event) => event.fighter);
  const tally = {};
  for (const corner of ['red', 'blue']) {
    const men = world.fighters.filter((fighter) => fighter.corner === corner);
    const count = (test) => men.filter(test).length;
    const down = (fighter) => fighter.state === 'out' && !fighter.fled;
    tally[corner] = {
      men: men.length,
      killed: count((fighter) => killed.has(fighter.id)),
      wounded: count((fighter) => !killed.has(fighter.id) && wounded(fighter)),
      down: count(down),
      cold: count((fighter) => down(fighter) && !killed.has(fighter.id)),
      broke: count((fighter) => broke.has(fighter.id)),
      crawled: count((fighter) => crawled.has(fighter.id)),
      crawling: count((fighter) => fighter.crawling && fighter.state !== 'out' && !fighter.fled),
      fled: count((fighter) => fighter.fled),
      rallied: rallies.filter((id) => world.fighters[id].corner === corner).length,
      standing: count((fighter) => inFight(fighter) && !fighter.panicked),
    };
  }
  return tally;
}

/**
 * How the beaten side lost, in a few words. Half or more of it broke: it
 * broke and ran (and fled the field, if half or more got off it), whatever
 * then became of the runners; else by what took the most of its men: the
 * dead (cut down) or the knocked cold and the past going on (beaten down).
 */
export function howBeaten(side) {
  if (side.broke * 2 >= side.men && side.broke > 0) return side.fled * 2 >= side.men ? 'broke and fled the field' : 'broke and ran';
  if (side.killed >= side.cold) return side.killed === side.men ? 'were cut down to the last man' : 'were cut down';
  return 'were beaten down';
}

/** The summary's rows, in order: [field, label], each shown only when some side has any (men always). */
export const TALLY_ROWS = [
  ['men', 'Men'],
  ['killed', 'Killed'],
  ['wounded', 'Wounded'],
  ['cold', 'Down'],
  ['crawled', 'Crawled away'],
  ['fled', 'Fled the field'],
  ['rallied', 'Rallied'],
  ['standing', 'Still standing'],
];

/** The rows worth showing for a tally: men, and every other row some side has any of. */
export function tallyRows(tally) {
  return TALLY_ROWS.filter(([field]) => field === 'men' || tally.red[field] > 0 || tally.blue[field] > 0);
}

/**
 * One fact worth a line, or null: the man with the most kills (two or more),
 * else the most blows landed (three or more); and the arrows loosed and shots fired, if any were.
 * `nameOf(fighter)` names a man.
 */
export function notableFacts(world, nameOf = (fighter) => fighter.body.inputs.name) {
  const facts = [];
  const top = (kinds, least) => {
    const counts = new Map();
    for (const event of world.events) if (kinds(event) && world.fighters[event.attacker] && event.attacker !== event.fighter) counts.set(event.attacker, (counts.get(event.attacker) ?? 0) + 1);
    let best = null;
    for (const [id, count] of counts) if (count >= least && (!best || count > best.count)) best = { id, count };
    return best && { fighter: world.fighters[best.id], count: best.count };
  };
  const kills = top((event) => DEATHS.has(event.kind), 2);
  const blows = kills ? null : top((event) => event.kind === 'landed', 3);
  if (kills) facts.push({ label: 'Most kills', who: kills.fighter, name: nameOf(kills.fighter), count: kills.count });
  else if (blows) facts.push({ label: 'Most blows', who: blows.fighter, name: nameOf(blows.fighter), count: blows.count });
  const arrows = world.events.filter((event) => event.kind === 'loosed').length;
  const shots = world.events.filter((event) => event.kind === 'shot').length;
  // A general cut down, or broken, and command passed (ai.js AI.general).
  const generals = world.events.filter((event) => event.kind === 'generalFell').length;
  if (generals) facts.push({ label: generals > 1 ? 'Generals fallen' : 'A general fell', count: generals });
  if (arrows) facts.push({ label: 'Arrows loosed', count: arrows });
  if (shots) facts.push({ label: 'Shots fired', count: shots });
  return facts;
}

/** A battle's length as m:ss. */
export function clock(seconds) {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
