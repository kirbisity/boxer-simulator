// Whole mounted fights, headless: a horseman against men on foot and against
// other horsemen, many seeds each, to see that the mounted fight still works
// (who wins, how long it takes, riders thrown, horses down, men ridden down
// and put over, blows on horses).
// Usage: node tools/mounted-bouts.js [bouts] [seconds] [matchup ...]
//   matchups: knight-yari kheshig-yari kheshig-knight samurai-yari maximilian-street knight-saladin knight-wall
//   mounted against mounted, to see the circling (draws, passes) and the friendly horses: knight-kheshig knight-samurai saladin-kheshig knight-dodger 2v2 3v3 4v4 (and 2v2-foot 3v3-foot 4v4-foot against men on foot)
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
  'knight-kheshig': { label: 'mounted knight v mounted kheshig (sabre)', red: [rider('knight')], blue: [rider('saber')] },
  'knight-samurai': { label: 'mounted knight v mounted samurai', red: [rider('knight')], blue: [rider('samurai')] },
  'saladin-kheshig': { label: 'mounted Saladin v mounted kheshig (sabre)', red: [rider('saladin')], blue: [rider('saber')] },
  'knight-dodger': { label: 'mounted knight v a bare man who dodges', red: [rider('knight')], blue: [foot('street', { style: 'unskilled' })] },
  '2v2': { label: '2 v 2 mounted', red: [rider('knight'), rider('saladin')], blue: [rider('saber'), rider('samurai')] },
  '3v3': { label: '3 v 3 mounted', red: [rider('knight'), rider('saladin'), rider('samurai')], blue: [rider('saber'), rider('knight'), rider('saladin')] },
  '4v4': { label: '4 v 4 mounted', red: [rider('knight'), rider('saladin'), rider('samurai'), rider('saber')], blue: [rider('saber'), rider('knight'), rider('saladin'), rider('samurai')] },
  '2v2-foot': { label: '2 mounted v 2 on foot', red: [rider('knight'), rider('saladin')], blue: [foot('yari'), foot('street', { style: 'unskilled' })] },
  '3v3-foot': { label: '3 mounted v 3 on foot', red: [rider('knight'), rider('saladin'), rider('samurai')], blue: [foot('yari'), foot('yari'), foot('street', { style: 'unskilled' })] },
  '4v4-foot': { label: '4 mounted v 4 on foot', red: [rider('knight'), rider('saladin'), rider('samurai'), rider('saber')], blue: [foot('yari'), foot('yari'), foot('street', { style: 'unskilled' }), foot('knight')] },
  'knight-wall': { label: 'mounted knight v 4 yari men', red: [rider('knight')], blue: [foot('yari'), foot('yari'), foot('yari'), foot('yari')] },
};
const wanted = named.length ? named : Object.keys(MATCHUPS);
const fmt = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : '-');

for (const key of wanted) {
  const spec = MATCHUPS[key];
  const tally = { knocked: 0, thrownWithHorse: 0, stalled: 0, friendlyTrampled: 0, passes: 0, friendly: 0, friendlyFalls: 0, riderSeen: 0, riderLanded: 0, red: 0, blue: 0, draw: 0, time: [], unhorsed: 0, horseDown: 0, trampled: 0, horseHit: 0, riderBlows: 0, crash: 0, knockdowns: 0, thrown: 0, landed: 0, blocked: 0, onHorses: 0, killed: 0 };
  for (let bout = 0; bout < bouts; bout += 1) {
    const sides = [...spec.red.map((inputs) => ({ inputs, corner: 'red' })), ...spec.blue.map((inputs) => ({ inputs, corner: 'blue' }))];
    const world = createWorld(sides, { seed: 1000 + bout, arena: FIELD });
    let elapsed = 0;
    // (Passes counted from outside: each time a rider's phase turns to 'past'.)
    const phases = new Map();
    const watch = (current, dt) => {
      thinkAll(current, dt);
      for (const fighter of current.fighters) {
        const phase = fighter.mount ? fighter.ride?.phase : null;
        if (phase === 'past' && phases.get(fighter.id) !== 'past') tally.passes += 1;
        phases.set(fighter.id, phase);
      }
    };
    while (elapsed < seconds && !boutWinner(world)) {
      advance(world, 1, watch);
      elapsed += 1;
    }
    const winner = boutWinner(world);
    if (winner) tally[winner] += 1;
    else tally.draw += 1;
    tally.time.push(world.time);
    // A drawn bout is circling if nobody has struck a blow for the last 30 s.
    const blows = world.events.filter((event) => event.kind === 'landed' || event.kind === 'blocked' || event.kind === 'horseHit').map((event) => event.time);
    if (!winner && world.time - Math.max(0, ...blows) > 30) tally.stalled += 1;
    const cornerOf = (horseId) => world.horses[horseId]?.corner;
    const friendlyHit = new Map();
    for (const event of world.events) {
      if (event.kind === 'horseCrash' && event.other !== undefined && cornerOf(event.horse) === cornerOf(event.other)) {
        tally.friendly += 1;
        friendlyHit.set(event.horse, event.time);
      }
      if (event.kind === 'horseDown' && friendlyHit.has(event.horse) && event.time - friendlyHit.get(event.horse) < 1) tally.friendlyFalls += 1;
    }
    for (const event of world.events) {
      if (event.kind === 'unhorsed') {
        tally.unhorsed += 1;
        if (/knocked from/.test(event.effects[0])) tally.knocked += 1;
        else if (/horse goes down|comes off/.test(event.effects[0])) tally.thrownWithHorse += 1;
      }
      else if (event.kind === 'horseDown') tally.horseDown += 1;
      else if (event.kind === 'trampled') {
        tally.trampled += 1;
        if (world.horses[event.horse]?.corner === world.fighters[event.fighter]?.corner) tally.friendlyTrampled += 1;
      }
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
    for (const fighter of world.fighters.filter((one) => one.body.inputs.mounted)) tally.riderSeen += fighter.stats.thrown;
    tally.riderLanded += world.events.filter((event) => event.kind === 'landed' && world.fighters[event.attacker]?.body.inputs.mounted).length;
    tally.knockdowns += world.fighters.reduce((sum, fighter) => sum + fighter.knockdowns, 0);
  }
  const mean = tally.time.reduce((sum, value) => sum + value, 0) / bouts;
  console.log(`${spec.label}: red ${tally.red} blue ${tally.blue} draw ${tally.draw} of ${bouts}; mean ${fmt(mean)} s; per bout: unhorsed ${fmt(tally.unhorsed / bouts)}, horses down ${fmt(tally.horseDown / bouts)}, ridden down ${fmt(tally.trampled / bouts)}, horse hit ${fmt(tally.horseHit / bouts)}, crashes ${fmt(tally.crash / bouts)}, red blows ${fmt(tally.riderBlows / bouts)}, knockdowns ${fmt(tally.knockdowns / bouts)}, blue killed ${fmt(tally.killed / bouts)}`);
  console.log(`    draws ${tally.draw} (circling, no blow in the last 30 s: ${tally.stalled}), passes per bout ${fmt(tally.passes / bouts)}, friendly horse crashes ${fmt(tally.friendly / bouts, 2)} per bout, friendly falls ${fmt(tally.friendlyFalls / bouts, 2)}, unhorsed ${fmt(tally.unhorsed / bouts, 2)} (knocked out of the saddle ${fmt(tally.knocked / bouts, 2)}, with a horse going down ${fmt(tally.thrownWithHorse / bouts, 2)}), own men ridden down ${fmt(tally.friendlyTrampled / bouts, 2)}; all riders' blows thrown ${fmt(tally.riderSeen / bouts)}, landed on men ${fmt(tally.riderLanded / bouts)}`);
  console.log(`    red blows thrown ${fmt(tally.thrown / bouts)} per bout: landed on a man ${fmt(tally.landed / bouts)}, blocked ${fmt(tally.blocked / bouts)}, on horses ${fmt(tally.onHorses / bouts)}; hit rate ${fmt((100 * (tally.landed + tally.blocked + tally.onHorses)) / Math.max(1, tally.thrown), 0)} % (landed on a man ${fmt((100 * tally.landed) / Math.max(1, tally.thrown), 0)} %)`);
}
