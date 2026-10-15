// Whole mounted fights, headless: a horseman against men on foot and against
// other horsemen, many seeds each, to see that the mounted fight still works
// (who wins, how long it takes, riders thrown, horses down, men ridden down
// and put over, blows on horses).
// Usage: node tools/mounted-bouts.js [bouts] [seconds] [matchup ...]
//   matchups: knight-yari kheshig-yari kheshig-knight samurai-yari maximilian-street knight-saladin knight-wall
//   and a weapon at a bare man standing: yari-street spear-street sabre-street sword-street mace-street hammer-street

import { PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { advance, boutWinner, createWorld } from '../src/physics.js';

const [boutsArg = '10', secondsArg = '60', ...named] = process.argv.slice(2);
const bouts = Number(boutsArg);
const seconds = Number(secondsArg);
const FIELD = { halfX: 30, halfZ: 20 };
const rider = (key, extra = {}) => ({ ...PRESETS[key], mounted: true, ...extra });
const foot = (key, extra = {}) => ({ ...PRESETS[key], ...extra });
const MATCHUPS = {
  'knight-yari': { label: 'mounted knight v ashigaru with a yari', red: [rider('knight')], blue: [foot('yari')] },
  'kheshig-yari': { label: 'mounted kheshig (sabre) v ashigaru with a yari', red: [rider('saber')], blue: [foot('yari')] },
  'kheshig-knight': { label: 'mounted kheshig (sabre) v knight on foot', red: [rider('saber')], blue: [foot('knight')] },
  'samurai-yari': { label: 'mounted samurai v ashigaru with a yari', red: [rider('samurai')], blue: [foot('yari')] },
  'maximilian-street': { label: 'mounted Maximilian (lance) v a bare man', red: [rider('maximilian')], blue: [foot('street')] },
  'yari-street': { label: 'mounted steppe horseman with a yari v a bare man', red: [rider('kheshig', { style: 'yari' })], blue: [foot('street', { style: 'unskilled' })] },
  'spear-street': { label: 'mounted knight with a spear v a bare man', red: [rider('knight', { style: 'spear' })], blue: [foot('street', { style: 'unskilled' })] },
  'sabre-street': { label: 'mounted kheshig (sabre) v a bare man', red: [rider('saber')], blue: [foot('street', { style: 'unskilled' })] },
  'sword-street': { label: 'mounted knight (long sword) v a bare man', red: [rider('knight')], blue: [foot('street', { style: 'unskilled' })] },
  'mace-street': { label: 'mounted knight with a flanged mace v a bare man', red: [rider('knight', { style: 'mace' })], blue: [foot('street', { style: 'unskilled' })] },
  'hammer-street': { label: 'mounted knight with a war hammer v a bare man', red: [rider('knight', { style: 'warhammer' })], blue: [foot('street', { style: 'unskilled' })] },
  'knight-saladin': { label: 'mounted knight v mounted Saladin', red: [rider('knight')], blue: [rider('saladin')] },
  'knight-wall': { label: 'mounted knight v 4 yari men', red: [rider('knight')], blue: [foot('yari'), foot('yari'), foot('yari'), foot('yari')] },
};
const wanted = named.length ? named : Object.keys(MATCHUPS);
const fmt = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : '-');

for (const key of wanted) {
  const spec = MATCHUPS[key];
  const tally = { red: 0, blue: 0, draw: 0, time: [], unhorsed: 0, horseDown: 0, trampled: 0, horseHit: 0, riderBlows: 0, crash: 0, knockdowns: 0, thrown: 0, landed: 0, blocked: 0, onHorses: 0, killed: 0 };
  for (let bout = 0; bout < bouts; bout += 1) {
    const sides = [...spec.red.map((inputs) => ({ inputs, corner: 'red' })), ...spec.blue.map((inputs) => ({ inputs, corner: 'blue' }))];
    const world = createWorld(sides, { seed: 1000 + bout, arena: FIELD });
    let elapsed = 0;
    while (elapsed < seconds && !boutWinner(world)) {
      advance(world, 1, (current, dt) => thinkAll(current, dt));
      elapsed += 1;
    }
    const winner = boutWinner(world);
    if (winner) tally[winner] += 1;
    else tally.draw += 1;
    tally.time.push(world.time);
    for (const event of world.events) {
      if (event.kind === 'unhorsed') tally.unhorsed += 1;
      else if (event.kind === 'horseDown') tally.horseDown += 1;
      else if (event.kind === 'trampled') tally.trampled += 1;
      else if (event.kind === 'horseHit') tally.horseHit += 1;
      else if (event.kind === 'horseCrash') tally.crash += 1;
      else if ((event.kind === 'landed' || event.kind === 'blocked') && world.fighters[event.attacker]?.corner === 'red') {
        tally.riderBlows += 1;
        if (event.kind === 'landed') tally.landed += 1;
        else tally.blocked += 1;
      }
      if (event.kind === 'horseHit' && world.fighters[event.attacker]?.corner === 'red') tally.onHorses += 1;
      if (event.kind === 'killed' && world.fighters[event.fighter]?.corner === 'blue') tally.killed += 1;
    }
    // (Blows thrown by the red side, whether or not the rider was still mounted.)
    tally.thrown += world.fighters.filter((fighter) => fighter.corner === 'red').reduce((sum, fighter) => sum + fighter.stats.thrown, 0);
    tally.knockdowns += world.fighters.reduce((sum, fighter) => sum + fighter.knockdowns, 0);
  }
  const mean = tally.time.reduce((sum, value) => sum + value, 0) / bouts;
  console.log(`${spec.label}: red ${tally.red} blue ${tally.blue} draw ${tally.draw} of ${bouts}; mean ${fmt(mean)} s; per bout: unhorsed ${fmt(tally.unhorsed / bouts)}, horses down ${fmt(tally.horseDown / bouts)}, ridden down ${fmt(tally.trampled / bouts)}, horse hit ${fmt(tally.horseHit / bouts)}, crashes ${fmt(tally.crash / bouts)}, red blows ${fmt(tally.riderBlows / bouts)}, knockdowns ${fmt(tally.knockdowns / bouts)}, blue killed ${fmt(tally.killed / bouts)}`);
  console.log(`    red blows thrown ${fmt(tally.thrown / bouts)} per bout: landed on a man ${fmt(tally.landed / bouts)}, blocked ${fmt(tally.blocked / bouts)}, on horses ${fmt(tally.onHorses / bouts)}; hit rate ${fmt((100 * (tally.landed + tally.blocked + tally.onHorses)) / Math.max(1, tally.thrown), 0)} % (landed on a man ${fmt((100 * tally.landed) / Math.max(1, tally.thrown), 0)} %)`);
}
