// Trailer: a skirmish out of Sekigahara's own cast (the East's teppō rank with spears behind it, against the West's masked samurai and
// their ashigaru), fought headless over seeds; the seeds where an East teppō's ball drops a West samurai. Not part of the game.
//   node tools/trailer-skirmish.js [seed0=1] [seeds=6] [seconds=25]
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, seededRandom } from '../src/physics.js';
import { battleOf } from '../src/scenarios.js';
import { placeMounted } from '../src/physics/mounted.js';

const MASK = { samurai: { 0: 3, 2: 4 } };
export const masked = (i) => { const s = MASK[i.outfit?.kind]?.[i.outfit.design]; return s == null ? i : { ...i, outfit: { ...i.outfit, design: s } }; };

/** The skirmish's men from the battle's cast at `castSeed`: East 5 teppō + 5 spears + 2 samurai; West 6 samurai + 6 ashigaru. */
export function skirmish(castSeed = 1, { mounted = 0 } = {}) {
  const cast = battleOf('sekigahara').cast(seededRandom(castSeed));
  const pick = (side, test, n) => cast[side].filter(test).slice(0, n);
  const red = [...pick('red', (i) => i.style === 'matchlock', 5), ...pick('red', (i) => i.outfit.kind === 'ashigaru' && i.style !== 'matchlock', 5), ...pick('red', (i) => /samurai/.test(i.outfit.kind), 2)];
  const blue = [...pick('blue', (i) => /samurai/.test(i.outfit.kind), 6), ...pick('blue', (i) => i.outfit.kind === 'ashigaru' && i.style !== 'matchlock', 6)];
  // `mounted`: that many of the West's lamellar-armoured samurai on horseback, charging the guns.
  // (Lacquered lamellar, `samurai`, not the tōsei harness: that one is proof against a teppō ball, OUTFITS.samuraiTosei bulletRating.)
  // `mounted: 'all'`: every samurai of the West on horseback (the tōsei harness too: a ball only dents it).
  let left = mounted === 'all' ? Infinity : mounted;
  const rides = (i) => (mounted === 'all' ? /samurai/.test(i.outfit.kind) : i.outfit.kind === 'samurai');
  return { red: red.map(masked), blue: blue.map(masked).map((i) => (left > 0 && rides(i) ? (left -= 1, { ...i, mounted: true }) : i)) };
}
export const SKIRMISH_ARENA = { halfX: 22, halfZ: 12 };

/** The West's riders stood clear of the formation (one in formation is unhorsed at the first step: reported to the games session,
 *  branch rider-start), `ahead` m before the West's line, spread across it, facing the guns; `speed` (m/s) a running start: already
 *  charging at that pace (the charge seen, not its first strides). */
export function placeRiders(world, { ahead = 6, speed = 0 } = {}) {
  const riders = world.fighters.filter((f) => f.corner === 'blue' && f.mount);
  const line = Math.min(...world.fighters.filter((f) => f.corner === 'blue' && !f.mount).map((f) => f.root[0]));
  riders.forEach((f, k) => {
    placeMounted(f, line - ahead, (k - (riders.length - 1) / 2) * 4, Math.PI);
    if (speed) Object.assign(f.mount, { speed, goal: { heading: Math.PI, speed } });
  });
  return riders.map((f) => f.id);
}

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const [seed0 = '1', seeds = '6', seconds = '25', mounted = '0'] = process.argv.slice(2);
  const scenario = battleOf('sekigahara');
  for (let seed = Number(seed0); seed < Number(seed0) + Number(seeds); seed += 1) {
    const sides = skirmish(1, { mounted: mounted === 'all' ? 'all' : Number(mounted) });
    const fighters = Object.entries(sides).flatMap(([corner, side]) => side.map((inputs) => ({ inputs: structuredClone(inputs), corner })));
    const world = createWorld(fighters, { seed, arena: SKIRMISH_ARENA, rules: scenario.rules, formation: scenario.formation, place: 'sengoku' });
    placeRiders(world);
    for (let t = 0; t < Number(seconds); t += 0.1) advance(world, 0.1, (c, dt) => thinkAll(c, dt));
    const hits = world.events.filter((e) => e.kind === 'shot' && e.defender != null && world.fighters[e.attacker]?.corner === 'red' && world.fighters[e.defender].corner === 'blue' && /samurai/.test(fighters[e.defender].inputs.outfit.kind))
      .map((e) => ({ t: +e.time.toFixed(2), gunner: e.attacker, victim: e.defender, rider: Boolean(fighters[e.defender].inputs.mounted), kit: fighters[e.defender].inputs.outfit.kind, target: e.target, fx: (e.effects ?? []).join('; ') }));
    const fallen = world.events.filter((e) => ['unhorsed', 'horseDown'].includes(e.kind)).map((e) => `${e.kind}@${e.time.toFixed(1)}:${e.fighter ?? ''}`);
    const shots = world.events.filter((e) => e.kind === 'shot').length;
    console.log(JSON.stringify({ seed, shots, hits: hits.filter((h) => h.rider), fallen }));
  }
}
