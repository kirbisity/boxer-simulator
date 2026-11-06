// What a blow does to a body, measured with the real strokes (physics.js), no AI in the way:
// - limbs: blows of each weapon family (sword, dao/saber, polearm, mace/club, fists) aimed at the places on a limb (the wrist,
//   the forearm, the elbow, the upper arm, the shoulder, the hip, the thigh, the knee, the shank) of a man standing in his
//   guard, at three distances inside the weapon's reach: of the blows that land on a limb, and of the heavy ones (`HEAVY` J of
//   collision or more), the share that end in nothing / a cut / the limb broken (the bone cut into or broken) / the limb off;
// - second: the same blows on the same man with that limb's bone already broken (counterfactual: the same seed, the same
//   blow), and two blows in a row at one place (the second's outcome by what the first did);
// - blunt: a fist, a mace, a club, a kanabo, a war hammer and a bat at the head, the body and a limb: the injury per blow (the part's health it takes, % of
//   what kills (the head, the trunk) or breaks it (a limb)), the head's speed change;
// - finisher: the ground finisher (finisher.js) by a bare-handed man (the belt knife) and a knight (his dagger) on a man down
//   in no armour, in mail (a Templar's hauberk) and in plate (a knight's harness): the share killed, incapacitated (out, or
//   bleeding to collapse), the seconds to death, the health left, the point's energy;
// - battle: a couple of battles (AI on both sides), 2 seeds: the dead, the severings, the broken limbs, the length.
// Usage: node tools/wounds.js [sections=limbs,second,blunt,finisher,battle] [seeds=3] [battles=wokou,catalaunian]

import { P, PRESETS } from '../src/body.js';
import { MOVES, STYLES } from '../src/moves.js';
import { thinkAll } from '../src/ai.js';
import { advance, bodyHarm, createWorld, placeFighter, reachOf, seededRandom, throwPunch, WORLD } from '../src/physics.js';
import { directFighter, newOrders } from '../src/control.js';
import { startFinisher } from '../src/finisher.js';
import { normaliseInputs } from '../src/body.js';
import { judgeBattle } from '../src/battleend.js';
import { battleTally } from '../src/battletally.js';
import { battleOf } from '../src/scenarios.js';

export const FAMILIES = {
  sword: ['longsword', 'katana'],
  dao: ['dao', 'saber'],
  polearm: ['naginata', 'guandao'],
  mace: ['mace', 'kanabo'],
  fists: ['street'],
};
// J of collision energy from which a blow on a limb counts as heavy.
export const HEAVY = 60;
// The weapons that strike with a blunt head (battle: the blows they land).
const BLUNT_HEADS = new Set(['warhammer', 'kanabo', 'langya', 'flangedMace', 'champi', 'bat', 'clava', 'baton', 'staff', 'threeEyed', 'armShotgun']);

const lerp = (a, b, t) => a.map((value, index) => value + (b[index] - value) * t);
const at = (fighter, index) => [fighter.x[index * 3], fighter.x[index * 3 + 1], fighter.x[index * 3 + 2]];

// The places on a limb a blow is aimed at (both sides: the lead and the rear), and the joint whose bone it is.
const SPOTS = {
  wrist: { joint: 'Elbow', at: (f, s) => lerp(at(f, P[`${s}Elbow`]), at(f, P[`${s}Hand`]), 0.85) },
  forearm: { joint: 'Elbow', at: (f, s) => lerp(at(f, P[`${s}Elbow`]), at(f, P[`${s}Hand`]), 0.5) },
  elbow: { joint: 'Elbow', at: (f, s) => at(f, P[`${s}Elbow`]) },
  upperArm: { joint: 'Elbow', at: (f, s) => lerp(at(f, P[`${s}Shoulder`]), at(f, P[`${s}Elbow`]), 0.5) },
  shoulder: { joint: 'Elbow', at: (f, s) => lerp(at(f, P[`${s}Shoulder`]), at(f, P[`${s}Elbow`]), 0.15) },
  hip: { joint: 'Hip', at: (f, s) => lerp(at(f, P[`${s}Hip`]), at(f, P[`${s}Knee`]), 0.15) },
  thigh: { joint: 'Hip', at: (f, s) => lerp(at(f, P[`${s}Hip`]), at(f, P[`${s}Knee`]), 0.5) },
  knee: { joint: 'Knee', at: (f, s) => at(f, P[`${s}Knee`]) },
  shank: { joint: 'Knee', at: (f, s) => lerp(at(f, P[`${s}Knee`]), at(f, P[`${s}Foot`]), 0.5) },
};
const LIMB = /Arm|Forearm|Thigh|Shank/;

/** The moves of a style a blow at a limb is made with (its strikes; for fists, the hand's). */
function movesOf(style) {
  return Object.keys(STYLES[style].attacks).filter((name) => MOVES[name]?.kind === 'strike' && !MOVES[name].limb.endsWith('Knee') && MOVES[name].path !== 'aim');
}

/** A man of `style` and a man standing in his guard (no AI either side), `distance` m apart, settled. */
export function pair(style, distance, seed, defender = {}, attacker = 'veteran') {
  const inputs = { ...structuredClone(PRESETS[attacker]), style };
  const world = createWorld([inputs, { ...structuredClone(PRESETS.amateur), style: 'boxing', ...defender }], { seed });
  const [me, him] = world.fighters;
  placeFighter(me, -distance / 2, 0);
  placeFighter(him, distance / 2, 0);
  advance(world, 0.6);
  world.events.length = 0;
  return { world, me, him };
}

/** One blow `move` at `point(him)`; what it did: the hit on a limb (or null), and whether he lost or broke a limb. */
export function blowAt(world, me, him, move, point) {
  const from = world.events.length;
  if (!throwPunch(world, me, move, null, { at: point(him) })) return null;
  advance(world, MOVES[move].duration + 0.25);
  const events = world.events.slice(from);
  const hit = events.find((event) => event.attacker === me.id && event.defender === him.id && (event.kind === 'landed' || event.kind === 'blocked'));
  if (!hit) return { hit: null };
  const severed = events.some((event) => event.kind === 'severed' && event.fighter === him.id);
  const broken = events.some((event) => event.kind === 'broken' && event.fighter === him.id);
  const cut = (hit.cut ?? 0) > 0.5 || (hit.pierce ?? 0) > 0.5;
  return { hit, outcome: severed ? 'severed' : broken ? 'broken' : cut ? 'cut' : 'nothing' };
}

/** Every blow of a family's styles at every spot, side, distance and seed: `prepare(him, spot, side)` before it. */
function limbTrials(family, seeds, prepare = null, twice = false) {
  const trials = [];
  for (const style of FAMILIES[family]) {
    for (const move of movesOf(style)) {
      for (const [spot, place] of Object.entries(SPOTS)) {
        for (const side of ['l', 'r']) {
          for (const share of [0.75, 0.88, 1]) {
            for (let seed = 1; seed <= seeds; seed += 1) {
              // (Fists: a brawler's bare hands.)
              const attacker = family === 'fists' ? 'street' : 'veteran';
              const probe = pair(style, 1, seed, {}, attacker);
              const distance = reachOf(probe.me) * share;
              const { world, me, him } = pair(style, distance, seed, {}, attacker);
              if (prepare) prepare(him, place, side);
              const first = blowAt(world, me, him, move, (man) => place.at(man, side));
              if (!first?.hit || !LIMB.test(first.hit.target)) continue;
              const trial = { style, move, spot, side, energy: first.hit.energy ?? 0, outcome: first.outcome, target: first.hit.target };
              if (twice && first.outcome !== 'severed' && him.state === 'up') {
                advance(world, 0.6);
                const second = blowAt(world, me, him, move, (man) => place.at(man, side));
                if (second?.hit && LIMB.test(second.hit.target)) trial.second = { energy: second.hit.energy ?? 0, outcome: second.outcome };
              }
              trials.push(trial);
            }
          }
        }
      }
    }
  }
  return trials;
}

const OUTCOMES = ['nothing', 'cut', 'broken', 'severed'];
const percent = (part, whole) => (whole ? `${((100 * part) / whole).toFixed(0)}%` : '—').padStart(5);

function shares(trials) {
  return OUTCOMES.map((outcome) => percent(trials.filter((trial) => trial.outcome === outcome).length, trials.length)).join(' ');
}

function limbsSection(seeds) {
  console.log(`\nLIMB HITS (share ending in ${OUTCOMES.join(' / ')}; heavy: ${HEAVY} J of collision or more)`);
  console.log(`${'family'.padEnd(8)} ${'n'.padStart(4)}  ${'all hits'.padEnd(23)} ${'nh'.padStart(4)}  heavy hits`);
  const all = {};
  for (const family of Object.keys(FAMILIES)) {
    const trials = limbTrials(family, seeds);
    all[family] = trials;
    const heavy = trials.filter((trial) => trial.energy >= HEAVY);
    console.log(`${family.padEnd(8)} ${String(trials.length).padStart(4)}  ${shares(trials)}  ${String(heavy.length).padStart(4)}  ${shares(heavy)}`);
  }
  return all;
}

function secondSection(seeds) {
  console.log('\nSECOND BLOW: the same blows on the limb whole vs its bone already broken (severed share); two blows in a row at one place');
  console.log(`${'family'.padEnd(8)} ${'n'.padStart(4)}  whole: sev  broken bone: sev | 2nd blow severs, after a 1st that broke it / left it whole (n)`);
  for (const family of ['sword', 'dao', 'polearm']) {
    const whole = limbTrials(family, seeds);
    // The bone of the limb aimed at broken before the blow (no limp: the arm is where it was, only the bone is gone).
    const broken = limbTrials(family, seeds, (him, place, side) => {
      him.broken.add(`${side}${place.joint}`);
      for (const segment of place.joint === 'Elbow' ? ['Forearm', 'UpperArm'] : ['Thigh', 'Shank']) (him.fractured ??= new Set()).add(`${side}${segment}`);
    });
    const severs = (trials) => percent(trials.filter((trial) => trial.outcome === 'severed').length, trials.length);
    const twice = limbTrials(family, seeds, null, true).filter((trial) => trial.second);
    const afterBreak = twice.filter((trial) => trial.outcome === 'broken');
    const afterWhole = twice.filter((trial) => trial.outcome === 'nothing' || trial.outcome === 'cut');
    const severed = (trials) => `${percent(trials.filter((trial) => trial.second.outcome === 'severed').length, trials.length)} (${trials.length})`;
    console.log(`${family.padEnd(8)} ${String(whole.length).padStart(4)}  ${severs(whole)}  ${severs(broken).padStart(14)}      | ${severed(afterBreak)} / ${severed(afterWhole)}`);
  }
}

/**
 * One blow at the head, the body or a limb: the injury it did (each part's trauma, as a share of its mark) and the head's speed
 * change, by the part it landed on (whatever it was aimed at), the weapon's head only (a blow that met him with the haft first
 * is left out: it is round wood, not the head, WORLD.haft).
 */
function bluntSection(seeds) {
  console.log('\nBLUNT: injury per landed blow of the weapon\'s head, % of the part\'s mark (the head\'s and the trunk\'s fatal, a limb\'s break); head Δv m/s; (n)');
  const marks = { head: WORLD.injury.headFatal, trunk: WORLD.injury.trunkFatal, limb: WORLD.injury.limbBreak };
  console.log(`${'style'.padEnd(9)} ${'head'.padStart(14)} ${'Δv'.padStart(5)} ${'trunk'.padStart(14)} ${'limb'.padStart(14)}  haft first`);
  // (boxing: the veteran in his gloves; street: a brawler bare-handed, in his street clothes; then the blunt heads: the flanged
  // mace, Commodus's club, the kanabo, the war hammer, the bat.)
  for (const [style, attacker] of [['boxing', 'veteran'], ['street', 'street'], ['mace', 'veteran'], ['commodus', 'veteran'], ['kanabo', 'veteran'], ['warhammer', 'veteran'], ['bat', 'veteran']]) {
    const rows = { head: [], trunk: [], limb: [], dv: [] };
    let hafts = 0;
    for (const move of movesOf(style)) {
      for (const aim of [(man) => at(man, P.head), (man) => lerp(at(man, P.pelvis), at(man, P.neck), 0.55), (man) => lerp(at(man, P.lHip), at(man, P.lKnee), 0.5), (man) => SPOTS.upperArm.at(man, 'l')]) {
        for (const share of [0.8, 0.92, 1]) {
          for (let seed = 1; seed <= seeds; seed += 1) {
            const probe = pair(style, 1, seed, {}, attacker);
            const { world, me, him } = pair(style, reachOf(probe.me) * share, seed, {}, attacker);
            const before = structuredClone(him.trauma ?? {});
            const done = blowAt(world, me, him, move, aim);
            if (!done?.hit || done.hit.kind !== 'landed') continue;
            if (done.hit.haft) {
              hafts += 1;
              continue;
            }
            const key = done.hit.target;
            const kind = key === 'head' ? 'head' : key === 'trunk' ? 'trunk' : 'limb';
            rows[kind].push(((him.trauma?.[key] ?? 0) - (before[key] ?? 0)) / marks[kind]);
            if (kind === 'head') rows.dv.push(done.hit.headDeltaV ?? 0);
          }
        }
      }
    }
    const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
    const cell = (values) => `${(100 * mean(values)).toFixed(1)}% (${values.length})`.padStart(14);
    console.log(`${style.padEnd(9)} ${cell(rows.head)} ${mean(rows.dv).toFixed(1).padStart(5)} ${cell(rows.trunk)} ${cell(rows.limb)}  ${hafts}`);
  }
}

const ARMOUR = { none: { preset: 'light' }, mail: { preset: 'amateur', outfit: 'templar' }, plate: { preset: 'knight' } };

/** The finisher on a man down in `armour` by `attacker` ('light': the belt knife; 'knight': his dagger): what came of it. */
export function finish(attacker, armour, seed, watch = 10) {
  const spec = ARMOUR[armour];
  const inputs = structuredClone(PRESETS[spec.preset]);
  if (spec.outfit) inputs.outfit = { kind: spec.outfit, design: 0 };
  const world = createWorld([{ inputs: structuredClone(PRESETS[attacker]), corner: 'red' }, { inputs, corner: 'blue' }], { seed });
  world.armed = true;
  const orders = newOrders();
  const [me, him] = world.fighters;
  placeFighter(him, me.root[0] + 1, me.root[1] + 0.1 * (seed % 2));
  const step = (seconds) => advance(world, seconds, (w, dt) => {
    thinkAll(w, dt, new Set([0, 1]));
    directFighter(w, me, orders, dt);
  });
  step(0.3);
  him.state = 'down';
  him.downTimer = 60;
  him.knockdowns = 1;
  step(0.8);
  const t0 = world.time;
  const started = startFinisher(world, me, him);
  // Watched until he dies or `watch` s; the place he put the point to as it went (he looks again as he kneels), and what he expected it to meet.
  let region = me.finisher?.entry.region;
  let key = me.finisher?.entry.key;
  let plan = me.finisher?.plan;
  for (let t = 0; t < watch && him.diedAt === undefined; t += 0.1) {
    if (me.finisher) ({ entry: { region, key }, plan } = me.finisher);
    step(0.1);
  }
  const blow = world.events.find((event) => event.kind === 'landed' && event.attacker === me.id && event.defender === him.id && event.time >= t0);
  const killed = him.diedAt !== undefined;
  return { started, region, key, plan, blow, killed, out: him.state === 'out', bleeding: (him.bleed ?? 0) > 0.01, toDeath: killed ? him.diedAt - t0 : null, health: 1 - bodyHarm(him) };
}

function finisherSection(seeds) {
  console.log('\nFINISHER on a man down (killed / incapacitated within 10 s; s to death, median; health left, mean; the point\'s pierce J, mean; where)');
  for (const attacker of ['light', 'knight']) {
    for (const armour of Object.keys(ARMOUR)) {
      const runs = Array.from({ length: seeds * 2 }, (_, index) => finish(attacker, armour, index + 1));
      const n = runs.length;
      const deaths = runs.filter((run) => run.killed).map((run) => run.toDeath).sort((a, b) => a - b);
      const mean = (pick) => runs.reduce((sum, run) => sum + pick(run), 0) / n;
      // (Off: the point met another part of him than the one it was put to — his own arm or leg lying across it.)
      const off = runs.filter((run) => run.blow && run.key && run.blow.target !== (run.plan?.key ?? run.key)).length;
      const regions = [...new Set(runs.map((run) => `${run.region}:${run.blow?.target ?? 'miss'}${run.blow?.gapZone ? '(gap)' : ''}`))].join(' ');
      console.log(`${attacker.padEnd(7)} ${armour.padEnd(6)} killed ${percent(deaths.length, n)} incap ${percent(runs.filter((run) => run.out || run.bleeding).length, n)}  to death ${deaths.length ? deaths[Math.floor(deaths.length / 2)].toFixed(2) : '—'} s  health ${mean((run) => run.health).toFixed(2)}  pierce ${mean((run) => run.blow?.pierce ?? 0).toFixed(0).padStart(4)} J  E ${mean((run) => run.blow?.energy ?? 0).toFixed(0).padStart(4)} J  off ${off}/${n}  ${regions}`);
    }
  }
}

/** A battle (scenarios.js battleOf) at a seed, fought out by the AI: the dead, severings, broken limbs, length. */
function battle(key, seed, seconds = 180) {
  const level = battleOf(key);
  const sides = level.cast(seededRandom(seed));
  const entries = ['red', 'blue'].flatMap((corner) => sides[corner].map((inputs) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner })));
  const world = createWorld(entries, { seed, arena: level.arena, rules: level.rules, formation: level.formation });
  let elapsed = 0;
  while (elapsed < seconds && !judgeBattle(world)) {
    advance(world, 0.1, (current, dt) => thinkAll(current, dt));
    elapsed += 0.1;
  }
  const tally = battleTally(world);
  const count = (kind, test = () => true) => world.events.filter((event) => event.kind === kind && test(event)).length;
  // (The blows the blunt heads landed: a mace's, a club's, a hammer's, a kanabo's, a champi's, a bat's.)
  const blunt = world.events.filter((event) => event.kind === 'landed' && !event.haft && BLUNT_HEADS.has(event.weapon)).length;
  return { blunt, men: entries.length, seconds: elapsed, killed: tally.red.killed + tally.blue.killed, down: tally.red.down + tally.blue.down, severed: count('severed'), heads: count('severed', (event) => event.joint === 'neck'), broken: count('broken'), winner: judgeBattle(world)?.winner ?? '-' };
}

function battleSection(keys = ['wokou', 'catalaunian']) {
  console.log('\nBATTLES (2 seeds): men, seconds, killed, down, severed (heads), broken limbs, blows landed by blunt heads, winner');
  for (const key of keys) {
    for (const seed of [1, 2]) {
      const row = battle(key, seed);
      console.log(`${key.padEnd(12)} seed ${seed}: ${row.men} men ${row.seconds.toFixed(0).padStart(4)} s  killed ${row.killed} down ${row.down} severed ${row.severed} (${row.heads}) broken ${row.broken} blunt ${row.blunt} won ${row.winner}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sections = (process.argv[2] ?? 'limbs,second,blunt,finisher,battle').split(',');
  const seeds = Number(process.argv[3] ?? 3);
  if (sections.includes('limbs')) limbsSection(seeds);
  if (sections.includes('second')) secondSection(seeds);
  if (sections.includes('blunt')) bluntSection(seeds);
  if (sections.includes('finisher')) finisherSection(seeds);
  // (The battles: `keys` comma-separated, the 4th argument; the blunt heads' are cajamarca (champi) and rhodes (maces, hammers).)
  if (sections.includes('battle')) battleSection(process.argv[4] ? process.argv[4].split(',') : undefined);
}
