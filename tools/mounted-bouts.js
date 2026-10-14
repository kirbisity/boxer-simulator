// Whole mounted fights, headless: a horseman against men on foot and against
// other horsemen, many seeds each, to see that the mounted fight still works
// (who wins, how long it takes, riders thrown, horses down, men ridden down
// and put over, blows on horses).
// Usage: node tools/mounted-bouts.js [bouts] [seconds] [matchup ...]
//   matchups: knight-yari kheshig-yari kheshig-knight samurai-yari knight-saladin knight-wall

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
  'knight-saladin': { label: 'mounted knight v mounted Saladin', red: [rider('knight')], blue: [rider('saladin')] },
  'knight-wall': { label: 'mounted knight v 4 yari men', red: [rider('knight')], blue: [foot('yari'), foot('yari'), foot('yari'), foot('yari')] },
};
const wanted = named.length ? named : Object.keys(MATCHUPS);
const fmt = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : '-');

for (const key of wanted) {
  const spec = MATCHUPS[key];
  const tally = { red: 0, blue: 0, draw: 0, time: [], unhorsed: 0, horseDown: 0, trampled: 0, horseHit: 0, riderBlows: 0, crash: 0, knockdowns: 0 };
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
      else if ((event.kind === 'landed' || event.kind === 'blocked') && world.fighters[event.attacker]?.corner === 'red') tally.riderBlows += 1;
    }
    tally.knockdowns += world.fighters.reduce((sum, fighter) => sum + fighter.knockdowns, 0);
  }
  const mean = tally.time.reduce((sum, value) => sum + value, 0) / bouts;
  console.log(`${spec.label}: red ${tally.red} blue ${tally.blue} draw ${tally.draw} of ${bouts}; mean ${fmt(mean)} s; per bout: unhorsed ${fmt(tally.unhorsed / bouts)}, horses down ${fmt(tally.horseDown / bouts)}, ridden down ${fmt(tally.trampled / bouts)}, horse hit ${fmt(tally.horseHit / bouts)}, crashes ${fmt(tally.crash / bouts)}, red blows ${fmt(tally.riderBlows / bouts)}, knockdowns ${fmt(tally.knockdowns / bouts)}`);
}
