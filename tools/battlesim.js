// A historical battle (scenarios.js, by key) fought headless over seeds, every man AI-driven: who won, each side's dead
// (and of a kit's men, `--kit`), the exchange (the other side's dead per one of this side's), and when it was decided.
// Usage: node tools/battlesim.js <key, e.g. nanjing> [seeds=10] [seconds=240] [--kit=ironMan] [--foot] (`--foot`: the
// battle's line alone, without its wings of horse).
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, seededRandom } from '../src/physics.js';
import { judgeBattle } from '../src/battleend.js';
import { battleOf, SCENARIOS } from '../src/scenarios.js';

const DEATHS = new Set(['killed', 'bledOut', 'died', 'drowned']);
// Seconds fought on after the battle is decided (the chase: a broken side's men cut down as they go).
const CHASE = 30;

/** One battle at a seed: { seed, seconds, winner, sides: { corner: { men, dead, kit: { men, dead } } } }. */
export function fightBattle(key, { seed = 1, seconds = 240, step = 0.1, kit = null, foot = false } = {}) {
  const scenario = foot ? { ...battleOf(key), ...SCENARIOS[key] } : battleOf(key);
  const cast = scenario.cast(seededRandom(seed));
  const fighters = Object.entries(cast).flatMap(([corner, side]) => side.map((inputs) => ({ inputs, corner })));
  const world = createWorld(fighters, { seed, arena: scenario.arena, rules: scenario.rules, formation: scenario.formation, place: scenario.scene, climate: scenario.climate });
  let time = 0;
  let decided = null;
  while (time < seconds && !(decided !== null && time > decided + CHASE)) {
    advance(world, step, (current, dt) => thinkAll(current, dt));
    time += step;
    if (decided === null && judgeBattle(world)) decided = time;
  }
  const deaths = new Set(world.events.filter((event) => DEATHS.has(event.kind) || (event.kind === 'severed' && event.joint === 'neck')).map((event) => event.fighter));
  const dead = (fighter) => deaths.has(fighter.id) || (fighter.state === 'out' && !fighter.fled);
  const sides = {};
  for (const corner of ['red', 'blue']) {
    const men = world.fighters.filter((fighter) => fighter.corner === corner);
    const kitMen = kit ? men.filter((fighter) => fighter.body.inputs.outfit?.kind === kit) : [];
    sides[corner] = { men: men.length, dead: men.filter(dead).length, kit: { men: kitMen.length, dead: kitMen.filter(dead).length } };
  }
  // Who killed whom (the last man to hurt him before he fell: a blow, an arrow, a ball, a horse's crash), when (before the
  // battle was decided, or in the chase after), and by what.
  const HURTS = new Set(['landed', 'arrow', 'shot', 'crash', 'collision']);
  const lastHurt = new Map();
  const deathAt = new Map();
  for (const event of world.events) {
    if (HURTS.has(event.kind) && event.defender !== undefined && event.attacker !== undefined && !deathAt.has(event.defender)) lastHurt.set(event.defender, event);
    if ((DEATHS.has(event.kind) || (event.kind === 'severed' && event.joint === 'neck')) && !deathAt.has(event.fighter)) deathAt.set(event.fighter, event.time);
  }
  const kitOf = (fighter) => `${fighter.body.inputs.outfit?.kind}${fighter.mount ? '+horse' : ''}`;
  const kits = {};
  const entry = (fighter) => (kits[`${fighter.corner} ${kitOf(fighter)}`] ??= { men: 0, dead: 0, beforeDecided: 0, inChase: 0, kills: 0, killedBy: {} });
  for (const fighter of world.fighters) {
    const own = entry(fighter);
    own.men += 1;
    if (!dead(fighter)) continue;
    own.dead += 1;
    const at = deathAt.get(fighter.id) ?? time;
    if (decided !== null && at > decided) own.inChase += 1;
    else own.beforeDecided += 1;
    const hurt = lastHurt.get(fighter.id);
    const killer = hurt ? world.fighters[hurt.attacker] : null;
    if (killer && killer.corner !== fighter.corner) {
      entry(killer).kills += 1;
      const how = `${kitOf(killer)} ${hurt.kind === 'landed' ? hurt.weapon ?? 'blow' : hurt.kind}`;
      own.killedBy[how] = (own.killedBy[how] ?? 0) + 1;
    }
  }
  return { seed, seconds: Number(time.toFixed(1)), decided: decided === null ? null : Number(decided.toFixed(1)), winner: world.verdict?.winner ?? null, sides, kits };
}

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const flags = Object.fromEntries(args.filter((arg) => arg.startsWith('--')).map((arg) => { const [name, value] = arg.slice(2).split('='); return [name, value ?? true]; }));
  const [key, seeds = '10', seconds = '240'] = args.filter((arg) => !arg.startsWith('--'));
  const results = [];
  for (let seed = 1; seed <= Number(seeds); seed += 1) {
    const result = fightBattle(key, { seed, seconds: Number(seconds), kit: flags.kit ?? null, foot: Boolean(flags.foot) });
    results.push(result);
    const line = ['red', 'blue'].map((corner) => `${corner} ${result.sides[corner].dead}/${result.sides[corner].men}${flags.kit && result.sides[corner].kit.men ? ` (${flags.kit} ${result.sides[corner].kit.dead}/${result.sides[corner].kit.men})` : ''}`).join(' · ');
    console.log(`seed ${seed}: ${result.winner ?? 'none'} won at ${result.decided ?? '-'} s · ${line}`);
  }
  if (flags.detail) {
    const total = {};
    for (const result of results) for (const [key, kit] of Object.entries(result.kits)) {
      const into = (total[key] ??= { men: 0, dead: 0, beforeDecided: 0, inChase: 0, kills: 0, killedBy: {} });
      for (const field of ['men', 'dead', 'beforeDecided', 'inChase', 'kills']) into[field] += kit[field];
      for (const [how, count] of Object.entries(kit.killedBy)) into.killedBy[how] = (into.killedBy[how] ?? 0) + count;
    }
    for (const [key, kit] of Object.entries(total).sort()) {
      const causes = Object.entries(kit.killedBy).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([how, count]) => `${how} ${count}`).join(', ');
      console.log(`  ${key}: ${kit.dead}/${kit.men} dead (${kit.beforeDecided} in the fight, ${kit.inChase} in the chase), ${kit.kills} kills; killed by ${causes}`);
    }
  }
  const sum = (corner, field) => results.reduce((total, result) => total + result.sides[corner][field], 0);
  const red = sum('red', 'dead');
  const blue = sum('blue', 'dead');
  console.log(`${key}: red won ${results.filter((result) => result.winner === 'red').length}, blue won ${results.filter((result) => result.winner === 'blue').length} of ${results.length}; dead red ${red}, blue ${blue}; blue dead per red dead ${(blue / Math.max(1, red)).toFixed(2)}`);
}
