// The situational weapon arts (weaponarts.js ARTS.choices): each made at a man standing before the attacker from a few distances,
// as the player makes it (startArt: the art the moment asks for, or the one named), and what it did — whether it met him and
// with what (the part, the blow's impulse and the share of it that came through his armour, the cut, the point, a gap found),
// and what came of it (his weapon or shield gone, his feet taken, a throw). Measures the arts against each other and against
// their family's own (e.g. the mordhau's harm on plate against the pommel's).
// Usage: node tools/situational-arts.js [art] [seeds = 6]

import { PRESETS } from '../src/body.js';
import { MOVES } from '../src/moves.js';
import { advance, createWorld, placeFighter, throwPunch } from '../src/physics.js';
import { ARTS, artSituation, chooseArt } from '../src/weaponarts.js';

/**
 * One art made by `style` at a man (`defenderStyle`, in `outfit`) `distance` m off: the art's moves' contacts on him (its own
 * and a follow-up's, `then`), and what came of them. `art` forced (else the art chooseArt picks: `chosen`).
 */
export function artAt(style, art, distance, { outfit = null, defenderStyle = 'boxing', defender = 'contender', seed = 1, zone = null, settle = 0.8, after = 1.6, prepare = null } = {}) {
  const world = createWorld([{ ...PRESETS.contender, style }, { ...PRESETS[defender], style: defenderStyle, ...(outfit ? { outfit: { kind: outfit, design: 0 } } : {}) }], { seed });
  const [attacker, target] = world.fighters;
  placeFighter(attacker, -distance / 2, 0);
  placeFighter(target, distance / 2, 0);
  advance(world, settle);
  prepare?.(world, attacker, target);
  world.events.length = 0;
  const choice = chooseArt(world, attacker, target);
  const situation = artSituation(world, attacker, target);
  const name = art ?? choice.art;
  const spec = MOVES[name];
  let made;
  if (spec.kind === 'clinch') {
    made = throwPunch(world, attacker, name);
    if (made) attacker.clinch.art = { throw: Boolean(spec.throw), then: spec.then ?? null, zone };
  } else made = throwPunch(world, attacker, name, zone ?? spec.zones[0]);
  advance(world, (spec.duration ?? 1) + after);
  const moves = new Set([name, spec.then].filter(Boolean));
  const hits = world.events.filter((event) => event.attacker === attacker.id && (event.kind === 'landed' || event.kind === 'blocked') && (moves.has(event.punch) || MOVES[event.punch]?.art));
  return {
    made, chosen: choice.art, situation, hits,
    fell: world.events.some((event) => event.kind === 'fell' && event.fighter === target.id) || target.state !== 'up',
    disarmed: world.events.some((event) => event.kind === 'disarmed' && event.fighter === target.id),
    thrown: world.events.some((event) => event.kind === 'throw' && event.attacker === attacker.id),
    severed: world.events.some((event) => event.kind === 'severed' && event.fighter === target.id),
    world, attacker, target,
  };
}

/** A contact's blunt harm through his armour (impulse × the blunt share that came through), its cut and its point. */
export const harmOf = (hit) => ({ blunt: hit.impulse * (hit.harm ?? 0), cut: hit.cut ?? 0, pierce: hit.pierce ?? 0 });

/** Over `seeds` seeds and `distances`: how often it met him, the best and mean of each harm, and how often each outcome came. */
export function artSurvey(style, art, distances, options = {}, seeds = 6) {
  const tally = { tries: 0, met: 0, blunt: [], cut: [], pierce: [], gaps: 0, throat: 0, fell: 0, disarmed: 0, thrown: 0, severed: 0, parts: {}, chosen: {} };
  for (const distance of distances) for (let seed = 1; seed <= seeds; seed += 1) {
    const result = artAt(style, art, distance, { ...options, seed });
    tally.tries += 1;
    tally.chosen[result.chosen] = (tally.chosen[result.chosen] ?? 0) + 1;
    const own = result.hits;
    if (own.length) tally.met += 1;
    let best = { blunt: 0, cut: 0, pierce: 0 };
    for (const hit of own) {
      const harm = harmOf(hit);
      best = { blunt: Math.max(best.blunt, harm.blunt), cut: Math.max(best.cut, harm.cut), pierce: Math.max(best.pierce, harm.pierce) };
      tally.parts[hit.target] = (tally.parts[hit.target] ?? 0) + 1;
      if (hit.effects?.includes('into a gap in the armour')) tally.gaps += 1;
      // (At the throat: met where the neck's gap is, under the chin or at the collar, physics/gaps.js; only on armour that has one.)
      if (hit.gapZone === 'neck') tally.throat += 1;
    }
    for (const key of ['blunt', 'cut', 'pierce']) tally[key].push(best[key]);
    for (const key of ['fell', 'disarmed', 'thrown', 'severed']) if (result[key]) tally[key] += 1;
  }
  const mean = (list) => list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length);
  return { ...tally, blunt: { best: Math.max(...tally.blunt), mean: mean(tally.blunt) }, cut: { best: Math.max(...tally.cut), mean: mean(tally.cut) }, pierce: { best: Math.max(...tally.pierce), mean: mean(tally.pierce) } };
}

// Each new art at the man it is for (and, for a comparison, its family's own there).
export const CASES = [
  { art: 'artMordhau', style: 'longsword', distances: [0.9, 1.1, 1.3, 1.5], outfit: 'knight', defenderStyle: 'longsword', compare: 'artPommel' },
  { art: 'artHalfSword', style: 'longsword', distances: [0.8, 0.95, 1.1, 1.25], outfit: 'knight', defenderStyle: 'longsword', zone: 'throat', compare: 'artPommel' },
  { art: 'artKesagiri', style: 'katana', distances: [1.0, 1.15, 1.3], compare: 'artIai' },
  { art: 'artTsuki', style: 'katana', distances: [1.9, 2.1, 2.3], outfit: 'samurai', defenderStyle: 'katana', compare: 'artIai' },
  { art: 'artWristCut', style: 'dao', distances: [1.1, 1.3, 1.5, 1.7], defenderStyle: 'saber', compare: 'artDrawCut' },
  { art: 'artBackhand', style: 'dao', distances: [1.2, 1.5, 1.8], compare: 'artDrawCut' },
  { art: 'artLegSweep', style: 'spear', distances: [2.0, 2.3, 2.6], compare: 'artSpear' },
  { art: 'artButt', style: 'spear', distances: [0.9, 1.1, 1.3], compare: 'artSpear' },
  { art: 'artCleave', style: 'naginata', distances: [1.4, 1.7, 2.0], compare: 'artWheel' },
  { art: 'artBeak', style: 'warhammer', distances: [1.2, 1.5, 1.8], outfit: 'knight', compare: 'artCrush' },
  { art: 'artHook', style: 'warhammer', distances: [1.3, 1.6, 1.9], zone: 'shins', compare: 'artCrush' },
  { art: 'artHook', style: 'maceShield', distances: [1.0, 1.2, 1.4], zone: 'shield', defenderStyle: 'swordShield', compare: 'artCrushOne' },
  { art: 'artGrapple', style: 'dagger', distances: [0.5, 0.6, 0.65], outfit: 'knight', defenderStyle: 'longsword', zone: 'throat', compare: 'artFleche' },
  { art: 'artLiverHook', style: 'boxing', distances: [0.6, 0.75, 0.9], defenderStyle: 'street', compare: 'artOverhand' },
  { art: 'artHipThrow', style: 'judo', distances: [0.5, 0.6, 0.7], compare: 'artOverhand' },
  { art: 'artHipThrow', style: 'sumo', distances: [0.5, 0.6, 0.7], compare: 'artOverhand' },
  { art: 'artSpinKick', style: 'kickboxing', distances: [0.9, 1.0, 1.15], compare: 'artRoundhouse' },
  { art: 'artTeep', style: 'muayThai', distances: [0.6, 0.75, 0.9], compare: 'artRoundhouse' },
  { art: 'artShieldBash', style: 'swordShield', distances: [0.9, 1.1, 1.3], defenderStyle: 'dao', compare: 'artDrawCut' },
  { art: 'artShieldBashThrust', style: 'legionary', distances: [0.9, 1.1, 1.3], defenderStyle: 'dao', compare: 'artFleche' },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv[2];
  const seeds = Number(process.argv[3] ?? 6);
  const line = (label, survey) => `${label.padEnd(22)} met ${survey.met}/${survey.tries}  blunt ${survey.blunt.best.toFixed(1).padStart(6)} (${survey.blunt.mean.toFixed(1).padStart(5)})  cut ${survey.cut.best.toFixed(0).padStart(4)} (${survey.cut.mean.toFixed(0).padStart(3)})  pierce ${survey.pierce.best.toFixed(0).padStart(4)} (${survey.pierce.mean.toFixed(0).padStart(3)})  gaps ${survey.gaps} throat ${survey.throat} fell ${survey.fell} disarmed ${survey.disarmed} thrown ${survey.thrown} severed ${survey.severed}  ${JSON.stringify(survey.parts)}`;
  for (const { art, style, distances, compare, ...options } of CASES) {
    if (only && only !== art) continue;
    console.log(`${ARTS.labels[art]} (${style}${options.outfit ? ` vs ${options.outfit}` : ''}${options.defenderStyle ? ` vs ${options.defenderStyle}` : ''}) at ${distances.join(', ')} m`);
    console.log(`  ${line(art, artSurvey(style, art, distances, options, seeds))}`);
    if (compare) console.log(`  ${line(compare, artSurvey(style, compare, distances, { ...options, zone: null }, seeds))}`);
  }
}
