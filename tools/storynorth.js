// The story's Liaodong battles (src/story/battles/06-liaodong, 07-sarhu, 08-hunriver) fought headless over seeds, the hero
// AI-driven as every other man: how often he died, how many of his three comrades, each side's dead, who won.
// Usage: node tools/storynorth.js <battle file, e.g. 07-sarhu> [seeds=10] [seconds=240] [rank=squadLeader] [place=front]
// (A man is dead as battletally.js counts him: a death among the events, or down on the field at the end.)

import { normaliseInputs } from '../src/body.js';
import { mingSoldier } from '../src/cast.js';
import { thinkAll } from '../src/ai.js';
import { advance, createWorld, seededRandom } from '../src/physics.js';
import { judgeBattle } from '../src/battleend.js';

// After the battle is decided the winners still chase (main.js); this long (s) more, as the game would show it.
const CHASE = 30;
const DEATHS = new Set(['killed', 'bledOut', 'died', 'drowned']);

/** A life to try a battle with: a southern spearman born 1568 (the spec), three comrades of bond 3, 2, 1. */
export function storyNorthLife(battle, { rank = 'squadLeader', place = 'front' } = {}) {
  const random = seededRandom(7);
  const man = (style, name) => normaliseInputs({ ...mingSoldier(random, style, 'garrison', { people: 'mingSouth' }), name });
  const comrades = ['a', 'b', 'c'].map((id, index) => ({ id, name: { zh: `同袍${id}`, en: `Comrade ${id}` }, inputs: man(['spear', 'swordShield', 'dao'][index], `Comrade ${id}`), born: 1575, rank: 'soldier', alive: true, bond: 3 - index, diedAt: null }));
  const kit = { soldier: 'mingGarrison', squadLeader: 'mingBrigandine', officer: 'mingElite' }[rank];
  return { hero: { name: { zh: '吴二', en: 'Wu Er' }, born: 1568, inputs: man('spear', 'Wu Er') }, rank, place, kit, comrades, year: battle.year, chapter: battle.n, flags: {}, family: {} };
}

/** One battle of it at a seed: built from the setup as the engine would, fought to its decision and the chase. */
export function storyNorthBattle(battle, life, { seed = 1, seconds = 240, step = 0.1 } = {}) {
  const setup = battle.setup(life, seed);
  const world = createWorld(setup.fighters.map(({ inputs, corner }) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner })), setup.options);
  let time = 0;
  let decided = null;
  while (time < seconds && !(decided !== null && time > decided + CHASE)) {
    advance(world, step, (current, dt) => thinkAll(current, dt));
    time += step;
    if (decided === null && judgeBattle(world)) decided = time;
  }
  const deaths = new Set(world.events.filter((event) => DEATHS.has(event.kind) || (event.kind === 'severed' && event.joint === 'neck')).map((event) => event.fighter));
  const dead = (index) => deaths.has(index) || (world.fighters[index].state === 'out' && !world.fighters[index].fled);
  const side = (corner) => {
    const men = world.fighters.filter((fighter) => fighter.corner === corner);
    return { men: men.length, dead: men.filter((fighter) => dead(fighter.id)).length };
  };
  return { seed, seconds: Number(time.toFixed(1)), winner: world.verdict?.winner ?? null, hero: dead(setup.player), comrades: Object.values(setup.comrades).filter(dead).length, red: side('red'), blue: side('blue'), world, setup };
}

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const [file, seeds = '10', seconds = '240', rank = 'squadLeader', place = 'front'] = process.argv.slice(2);
  // (Each battle file exports its battle under a name of its own, BATTLE_<ID>: the one export of that name.)
  const module = await import(`../src/story/battles/${file}.js`);
  const battle = Object.entries(module).find(([name]) => name.startsWith('BATTLE_'))[1];
  const results = [];
  for (let seed = 1; seed <= Number(seeds); seed += 1) {
    const started = Date.now();
    const { world, setup, ...result } = storyNorthBattle(battle, storyNorthLife(battle, { rank, place }), { seed, seconds: Number(seconds) });
    results.push(result);
    console.log(JSON.stringify({ ...result, wallMs: Date.now() - started }));
  }
  const count = results.length;
  console.log(`${file} (${rank}, ${place}): hero died ${results.filter((each) => each.hero).length}/${count}; comrades dead ${results.reduce((sum, each) => sum + each.comrades, 0)}/${3 * count}; Ming won ${results.filter((each) => each.winner === 'red').length}, Jin won ${results.filter((each) => each.winner === 'blue').length}`);
}
