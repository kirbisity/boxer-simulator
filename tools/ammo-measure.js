// Shooters in one battle: shots each, how many ran out and drew their sidearms, when they first struck in hand,
// and missile hits on their own side (friendly fire). Horse archers: how long they rode before closing.
// Usage: node tools/ammo-measure.js <level> [seconds=300] [seed=1]
import { normaliseInputs, P } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, seededRandom } from '../src/physics.js';
import { judgeBattle } from '../src/battleend.js';
import { battleTally } from '../src/battletally.js';
import { levelOf } from './levels.js';

const [key, secondsArg = '300', seedArg = '1'] = process.argv.slice(2);
const seconds = Number(secondsArg);
const seed = Number(seedArg);
const level = levelOf(key);
const sides = level.cast(seededRandom(seed));
const entries = ['red', 'blue'].flatMap((corner) => sides[corner].map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner })));
const world = createWorld(entries, { seed, arena: level.arena, rules: level.rules, formation: level.formation });
const shooters = new Map(world.fighters.filter((f) => f.weapon?.spec.ranged && !f.weapon.spec.mounted).map((f) => [f.id, { id: f.id, kind: f.weapon.kind, mounted: Boolean(f.mount), shots: 0, empty: null, drew: null, firstMelee: null }]));
const isMissile = (e) => e.kind === 'arrow' || e.kind === 'shot';
let cursor = 0;
let elapsed = 0;
let friendly = 0;
let hits = 0;
while (elapsed < seconds && (process.env.NOEND || !judgeBattle(world))) {
  advance(world, 0.1, (current, dt) => thinkAll(current, dt));
  elapsed += 0.1;
  for (; cursor < world.events.length; cursor += 1) {
    const e = world.events[cursor];
    const s = shooters.get(e.attacker ?? e.fighter);
    if ((e.kind === 'loosed' || (e.kind === 'shot' && e.attacker !== undefined)) && s) s.shots += 1;
    if (isMissile(e) && e.defender !== undefined && e.attacker !== undefined && e.attacker >= 0) {
      hits += 1;
      if (world.fighters[e.attacker].corner === world.fighters[e.defender].corner) {
        friendly += 1;
        const by = shooters.get(e.attacker);
        if (by) by.friendly = (by.friendly ?? 0) + 1;
        if (process.env.WHY) {
          const shooter = world.fighters[e.attacker];
          const victim = world.fighters[e.defender];
          const mark = world.fighters[shooter.focus];
          const flat = (a, b) => Math.hypot(a.x[3 * P.pelvis] - b.x[3 * P.pelvis], a.x[3 * P.pelvis + 2] - b.x[3 * P.pelvis + 2]);
          console.log(`t ${e.time.toFixed(1)} ${shooter.weapon?.kind ?? '-'} slot ${Boolean(shooter.slot)} -> own man ${victim.mount ? 'rider' : 'foot'} ${flat(shooter, victim).toFixed(1)} m off; his mark ${mark ? `${mark.mount ? 'rider' : 'foot'} ${flat(shooter, mark).toFixed(1)} m, ${flat(victim, mark).toFixed(1)} m from victim` : 'none'}`);
        }
      }
    }
    if ((e.kind === 'quiverEmpty' || e.kind === 'ammoEmpty') && s && s.empty === null) s.empty = e.time;
    if (e.kind === 'drew' && s && s.drew === null) s.drew = e.time;
    if (e.kind === 'resupplied' && s) s.resupplied = (s.resupplied ?? 0) + 1;
    if (s && e.attacker !== undefined && !isMissile(e) && e.kind !== 'loosed' && e.punch && s.firstMelee === null) s.firstMelee = e.time;
  }
}
const groups = {};
for (const s of shooters.values()) {
  const g = (groups[`${s.kind}${s.mounted ? ' (horse)' : ''}`] ??= { men: 0, shots: [], empty: 0, drew: 0, melee: [], friendly: 0 });
  g.friendly += s.friendly ?? 0;
  g.men += 1;
  g.shots.push(s.shots);
  if (s.empty !== null) g.empty += 1;
  if (s.drew !== null) g.drew += 1;
  g.resupplied = (g.resupplied ?? 0) + (s.resupplied ?? 0);
  if (s.firstMelee !== null) g.melee.push(s.firstMelee);
  if (s.drew !== null) (g.drewAt ??= []).push(s.drew);
  const man = world.fighters[s.id];
  if (man.state === 'up' && !man.fled && man.weapon?.held && man.weapon.spec.ranged) g.stillShooting = (g.stillShooting ?? 0) + 1;
}
const mean = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0) : '-');
const tally = battleTally(world);
console.log(`${key} seed ${seed}: ${elapsed.toFixed(0)} s, winner ${judgeBattle(world)?.winner ?? 'none'}; red standing ${tally.red.standing}/${tally.red.men}, blue ${tally.blue.standing}/${tally.blue.men}`);
console.log(`missile hits on men ${hits}, on their own side ${friendly}`);
for (const [kind, g] of Object.entries(groups)) {
  const sorted = g.shots.sort((a, b) => a - b);
  console.log(`${kind}: ${g.men} men, shots mean ${mean(sorted)} max ${sorted.at(-1)}; friendly hits ${g.friendly}; resupplied ${g.resupplied} times; ran out ${g.empty}, drew sidearm ${g.drew}, first blow in hand at mean ${mean(g.melee)} s (${g.melee.length} men); drew at mean ${mean(g.drewAt ?? [])} s; still up with the bow/gun at the end ${g.stillShooting ?? 0}`);
}
