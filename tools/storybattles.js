// Any story battle (src/story/battles/index.js, by id) fought headless over seeds, the hero AI-driven as every other man:
// who won, each side's dead, when it was decided. tools/storynorth.js's fight, for every battle by its id.
// Usage: node tools/storybattles.js <id, e.g. pyongyang> [seeds=10] [seconds=240] [rank=soldier] [place=front] [--no-guns]
// (--no-guns: the battle's artillery left out, its setup's `artillery: false`.)

import { STORY_BATTLES } from '../src/story/battles/index.js';
import { storyNorthBattle, storyNorthLife } from './storynorth.js';

/** What the world's guns and ladders did (physics/artillery.js and physics/ladders.js counts), if it had any. */
const siegeTally = (world) => {
  const guns = world.artillery?.pieces ?? [];
  const ladders = world.siegeLadders ?? [];
  if (!guns.length && !ladders.length) return null;
  return {
    shots: guns.reduce((sum, gun) => sum + gun.shots, 0),
    gunHits: guns.reduce((sum, gun) => sum + gun.hits, 0),
    gunKills: guns.reduce((sum, gun) => sum + gun.kills, 0),
    pushedOff: ladders.reduce((sum, ladder) => sum + ladder.pushedOff, 0),
    pushedLoaded: ladders.reduce((sum, ladder) => sum + ladder.pushedLoaded, 0),
    thrown: ladders.reduce((sum, ladder) => sum + ladder.thrown, 0),
    raised: ladders.reduce((sum, ladder) => sum + ladder.raised, 0),
    screened: world.screened ?? 0,
  };
};

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const noGuns = args.includes('--no-guns');
  const [id, seeds = '10', seconds = '240', rank = 'soldier', place = 'front'] = args.filter((arg) => !arg.startsWith('--'));
  const battle = STORY_BATTLES[id];
  const results = [];
  for (let seed = 1; seed <= Number(seeds); seed += 1) {
    const started = Date.now();
    const { world, setup, ...result } = storyNorthBattle(battle, storyNorthLife(battle, { rank, place }), { seed, seconds: Number(seconds), setupOptions: noGuns ? { artillery: false } : {} });
    const tally = siegeTally(world);
    results.push(result);
    console.log(JSON.stringify({ ...result, ...(tally ? { tally } : {}), wallMs: Date.now() - started }));
  }
  const count = results.length;
  const sum = (key) => results.reduce((total, each) => total + each[key].dead, 0);
  console.log(`${id}${noGuns ? ' (no guns)' : ''}: red won ${results.filter((each) => each.winner === 'red').length}, blue won ${results.filter((each) => each.winner === 'blue').length}, undecided ${results.filter((each) => !each.winner).length} of ${count}; red dead ${sum('red')}/${results[0].red.men * count}, blue dead ${sum('blue')}/${results[0].blue.men * count}; mean ${(results.reduce((t, e) => t + e.seconds, 0) / count).toFixed(0)} s`);
}
