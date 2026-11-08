// Every story battle (src/story/battles/index.js) measured the one way, headless over seeds, so the eight can be set side by
// side and against the record: the hero AI-driven as every other man, at his chapter's usual rank, with three living comrades.
// Each battle is fought to its FULL time: to its verdict (battleend.js judgeBattle) and the winners' chase after it (main.js),
// the verdict at the latest the world's own `timeLimit` (a battle with a march, Pyongyang and the Hun River, has the march on
// top of BATTLE_END.timeLimit), never cut short. (tools/storybattles.js's default cap of 240 s ends Pyongyang inside its
// 375 s march: every seed "undecided". That cap, not the battle, was why it disagreed with the run that gave the Ming 10/10.)
// Beside the verdict it gives what the story itself would read when it stops at the battle's `seconds` (runner.js
// storyBattleOver), which for most battles comes before the judge's time limit.
// Usage: node tools/storymeasure.js [id ...] [--seeds=10] [--json]   (no id: all eight, in chapter order)

import { STORY_BATTLES } from '../src/story/battles/index.js';
import { storyNorthLife } from './storynorth.js';
import { storyBattleWorld } from '../src/story/runner.js';
import { stillFighting, thinkAll } from '../src/ai.js';
import { advance, inFight } from '../src/physics.js';
import { BATTLE_END, judgeBattle } from '../src/battleend.js';

export const STORY_MEASURE = {
  // The headless step (s), as runner.js STORY_RUN.step and tools/levels.js.
  step: 0.1,
  // After the verdict the winners still chase (main.js; tools/storynorth.js CHASE): this long (s) more before the count.
  chase: 30,
  // The hero's usual rank by chapter: a soldier in the first two, a squad leader through Korea and Liaodong, an officer at the end.
  rank: (n) => (n <= 2 ? 'soldier' : n <= 6 ? 'squadLeader' : 'officer'),
  place: 'front',
};

// The out kinds that are a death (battletally.js).
const DEATHS = new Set(['killed', 'bledOut', 'died', 'drowned']);
const isDeath = (event) => DEATHS.has(event.kind) || (event.kind === 'severed' && event.joint === 'neck');

/** How the loser went, at the verdict: 'time'; 'rout' (more of its men running than lying on the field); else 'annihilation'. */
function howDecided(world, verdict) {
  if (!verdict) return 'undecided';
  if (verdict.how === 'time') return 'time';
  if (!verdict.winner) return 'draw';
  const men = world.fighters.filter((fighter) => fighter.corner !== verdict.winner);
  const lying = men.filter((fighter) => fighter.state === 'out' && !fighter.fled).length;
  const running = men.filter((fighter) => !(fighter.state === 'out' && !fighter.fled) && (fighter.fled || fighter.panicked || fighter.crawling || !stillFighting(fighter))).length;
  return running > lying ? 'rout' : 'annihilation';
}

/**
 * One side's losses: dead (a death among the events), down (out on the field, no death: left there), fled (off the field), and
 * for the beaten side `left`: still on the field at the end but out of the fight (crawling, unable to rise, broken and caught),
 * whom the story counts with the fallen (runner.js storyFateOf: the winners go over the field after a battle).
 */
function sideLosses(world, corner, deaths) {
  const men = world.fighters.filter((fighter) => fighter.corner === corner);
  const beaten = world.verdict?.winner && world.verdict.winner !== corner;
  const dead = men.filter((fighter) => deaths.has(fighter.id)).length;
  const down = men.filter((fighter) => !deaths.has(fighter.id) && fighter.state === 'out' && !fighter.fled).length;
  const fled = men.filter((fighter) => !deaths.has(fighter.id) && fighter.fled).length;
  const left = beaten ? men.filter((fighter) => !deaths.has(fighter.id) && fighter.state !== 'out' && !fighter.fled && !inFight(fighter)).length : 0;
  return { men: men.length, dead, down, fled, left };
}

/** What the battle's mechanics did, from the events and the world's guns and ladders. */
function mechanics(world, stalls) {
  const events = world.events;
  const count = (test) => events.filter(test).length;
  const ladders = world.siegeLadders ?? [];
  const guns = world.artillery?.pieces ?? [];
  return {
    shots: count((event) => event.kind === 'shot' && !event.gun),
    shotHits: count((event) => event.kind === 'shot' && !event.gun && Number.isInteger(event.defender)),
    misfires: count((event) => event.kind === 'misfire'),
    arrows: count((event) => event.kind === 'loosed'),
    cannon: guns.reduce((sum, gun) => sum + gun.shots, 0),
    cannonHits: guns.reduce((sum, gun) => sum + gun.hits, 0),
    cannonKills: guns.reduce((sum, gun) => sum + gun.kills, 0),
    laddersRaised: count((event) => event.kind === 'ladder' && event.up && !event.onto),
    climbedOnto: count((event) => event.kind === 'ladder' && event.onto),
    pushedOff: count((event) => event.kind === 'ladder' && event.up === false),
    fellOffLadder: ladders.reduce((sum, ladder) => sum + (ladder.fell ?? 0), 0),
    pressFalls: count((event) => event.kind === 'fell' && event.effects[0] === 'borne down by the press'),
    falls: count((event) => event.kind === 'fell'),
    rages: count((event) => event.kind === 'rage'),
    stalls,
    panics: count((event) => event.kind === 'panic'),
  };
}

/** One battle at a seed, fought to its verdict and the chase (or its time limit's verdict), and measured. */
export function storyMeasureBattle(battle, seed = 1, { step = STORY_MEASURE.step } = {}) {
  const rank = STORY_MEASURE.rank(battle.n);
  const life = storyNorthLife(battle, { rank, place: STORY_MEASURE.place });
  const setup = battle.setup(life, seed);
  const world = storyBattleWorld(setup, life);
  const timeLimit = world.timeLimit ?? BATTLE_END.timeLimit;
  // A stall is one hesitation (ai.js AI.hesitation) that stalled: each its own object on the man while it lasts.
  const stalled = new WeakSet();
  let stalls = 0;
  let atStory = null;
  while (!(world.verdict && world.time >= world.verdict.time + STORY_MEASURE.chase) && world.time < timeLimit + STORY_MEASURE.chase + 1) {
    advance(world, step, (current, dt) => thinkAll(current, dt));
    const verdict = judgeBattle(world);
    for (const fighter of world.fighters) {
      if (fighter.hesitant?.stalled && !stalled.has(fighter.hesitant)) {
        stalled.add(fighter.hesitant);
        stalls += 1;
      }
    }
    // What the story reads when it stops at the battle's `seconds` (decided by then, or not).
    if (atStory === null && world.time >= battle.seconds) atStory = verdict ? verdict.winner ?? 'draw' : 'undecided';
  }
  const deaths = new Set(world.events.filter(isDeath).map((event) => event.fighter));
  const verdict = world.verdict;
  const comradeIds = life.comrades.map((comrade) => comrade.id).filter((id) => Number.isInteger(setup.comrades?.[id]));
  const fell = (index) => deaths.has(index) || (world.fighters[index].state === 'out' && !world.fighters[index].fled);
  return {
    id: battle.id,
    seed,
    rank,
    winner: verdict?.winner ?? null,
    how: howDecided(world, verdict),
    decidedAt: verdict ? Number(verdict.time.toFixed(1)) : null,
    storySeconds: battle.seconds,
    timeLimit,
    atStory: atStory ?? (verdict ? verdict.winner ?? 'draw' : 'undecided'),
    red: sideLosses(world, 'red', deaths),
    blue: sideLosses(world, 'blue', deaths),
    hero: { corner: world.fighters[setup.player].corner, fell: fell(setup.player), dead: deaths.has(setup.player), fled: Boolean(world.fighters[setup.player].fled) },
    // (His three comrades of the life only: a setup's other named men, the suppression's brother among the refugees, are not.)
    comradesFell: comradeIds.filter((id) => fell(setup.comrades[id])).length,
    comrades: comradeIds.length,
    mechanics: mechanics(world, stalls),
  };
}

const pct = (part, whole) => `${Math.round((100 * part) / Math.max(1, whole))}%`;
const mean = (list, get) => list.reduce((sum, each) => sum + get(each), 0) / Math.max(1, list.length);

/** The seeds of one battle summed up, one block of plain lines. */
export function storyMeasureSummary(results) {
  const first = results[0];
  const count = results.length;
  const heroSide = first.hero.corner;
  const tally = (key) => results.reduce((sum, each) => sum + each[key], 0);
  const wins = (corner) => results.filter((each) => each.winner === corner).length;
  const hows = {};
  for (const each of results) hows[`${each.winner ?? 'none'}:${each.how}`] = (hows[`${each.winner ?? 'none'}:${each.how}`] ?? 0) + 1;
  const atStory = {};
  for (const each of results) atStory[each.atStory] = (atStory[each.atStory] ?? 0) + 1;
  const side = (corner) => {
    const men = first[corner].men;
    const sum = (key) => results.reduce((total, each) => total + each[corner][key], 0);
    const lost = sum('dead') + sum('down');
    const each = (key) => `${key} ${(sum(key) / count).toFixed(1)} (${pct(sum(key), men * count)})`;
    return `${corner} ${men} men: ${['dead', 'down', 'fled', 'left'].map(each).join(', ')}; fallen (dead+down) ${(lost / count).toFixed(1)} (${pct(lost, men * count)}), as the story counts (+left) ${((lost + sum('left')) / count).toFixed(1)} (${pct(lost + sum('left'), men * count)})`;
  };
  const mech = Object.keys(first.mechanics).map((key) => `${key} ${mean(results, (each) => each.mechanics[key]).toFixed(1)}`).join(', ');
  const lost = (corner) => results.reduce((sum, each) => sum + each[corner].dead + each[corner].down, 0);
  return [
    `== ${first.id} (rank ${first.rank}, hero ${heroSide}; story seconds ${first.storySeconds}, judge's limit ${first.timeLimit} s) ==`,
    `winner: red ${wins('red')}, blue ${wins('blue')}, none ${count - wins('red') - wins('blue')} of ${count}; how ${JSON.stringify(hows)}`,
    `at the story's ${first.storySeconds} s: ${JSON.stringify(atStory)}`,
    side('red'),
    side('blue'),
    `loss ratio red:blue (dead+down) ${(lost('red') / Math.max(1, lost('blue'))).toFixed(2)} : 1`,
    `decided at mean ${mean(results.filter((each) => each.decidedAt !== null), (each) => each.decidedAt).toFixed(0)} s (range ${Math.min(...results.map((each) => each.decidedAt ?? Infinity))}-${Math.max(...results.map((each) => each.decidedAt ?? 0))})`,
    `hero fell ${results.filter((each) => each.hero.fell).length}/${count} (dead ${results.filter((each) => each.hero.dead).length}, fled ${results.filter((each) => each.hero.fled).length}); comrades fell ${tally('comradesFell')}/${tally('comrades')}`,
    `mechanics (mean a battle): ${mech}`,
  ].join('\n');
}

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const seeds = Number(args.find((arg) => arg.startsWith('--seeds='))?.split('=')[1] ?? 10);
  const json = args.includes('--json');
  const ids = args.filter((arg) => !arg.startsWith('--'));
  const battles = (ids.length ? ids : Object.keys(STORY_BATTLES)).map((id) => STORY_BATTLES[id] ?? (() => { throw new Error(`no story battle ${id}`); })());
  for (const battle of battles) {
    const results = [];
    for (let seed = 1; seed <= seeds; seed += 1) {
      const started = Date.now();
      const result = storyMeasureBattle(battle, seed);
      results.push(result);
      if (json) console.log(JSON.stringify({ ...result, wallMs: Date.now() - started }));
    }
    console.log(storyMeasureSummary(results));
  }
}
