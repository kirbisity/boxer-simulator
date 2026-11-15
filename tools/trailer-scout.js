// Trailer take scouting (launch video spec 2026-11-14): a scene fought headless over seeds, each run scored by how many of the game's
// mechanics show (glances off plate, arrows and balls in gaps, misfires, parries, disarms, falls), and its busiest 5 s window found for the camera.
// Not part of the game; nothing imports it.
//   node tools/trailer-scout.js story <wokou|pyongyang> [seeds=6] [seconds=120]
//   node tools/trailer-scout.js battle <agincourt|sekigahara> [seeds=6] [seconds=120]

import { thinkAll } from '../src/ai.js';
import { advance, createWorld } from '../src/physics.js';
import { judgeBattle } from '../src/battleend.js';
import { scenarioWorld } from '../src/scenarios.js';
import { STORY_BATTLES } from '../src/story/battles/index.js';
import { storyNorthLife } from './storynorth.js';
import { normaliseInputs } from '../src/body.js';

// What each kind is worth on screen: rare, legible mechanics high; the bookkeeping kinds (drew, pickup, reloaded) nothing.
const WEIGHT = {
  glance: 3, parry: 3, bladeBlock: 3, clash: 2, blocked: 2, caught: 4, disarmed: 4, shieldBroke: 4, weaponBroke: 4, helmet: 4,
  misfire: 5, hangfire: 4, shot: 2, matchlock: 2, arrow: 1, staggered: 2, floored: 3, fell: 2, thrown: 3, throw: 3, knockout: 4,
  severed: 2, legSevered: 2, dazed: 2, jump: 3, landed: 1, clinch: 3, beatenThrough: 4, splinter: 2, chipped: 2, broken: 2, cannon: 2, cannonHit: 3,
};
const SKIP = new Set(['drew', 'pickup', 'reloaded', 'sheathed', 'resupplied', 'bled', 'pain', 'injuries', 'stairs', 'ramp', 'trod']);
const WINDOW = 5;

function run(world, seconds, step = 0.1) {
  let time = 0;
  let decided = null;
  while (time < seconds && !(decided !== null && time > decided + 15)) {
    advance(world, step, (current, dt) => thinkAll(current, dt));
    time += step;
    if (decided === null && judgeBattle(world)) decided = time;
  }
  return time;
}

function score(world, extra = () => ({})) {
  const events = world.events.filter((event) => !SKIP.has(event.kind));
  const counts = {};
  for (const event of events) counts[event.kind] = (counts[event.kind] ?? 0) + 1;
  // Armour that turned a missile, and missiles that found a way past it (the gaps): the trailer's point.
  const missiles = events.filter((event) => event.kind === 'arrow' || event.kind === 'shot');
  const turned = missiles.filter((event) => (event.kept ?? 1) < 0.2 || event.effects?.some((text) => /glanc|turned|stopped|deflect/i.test(text))).length;
  const gaps = missiles.filter((event) => event.effects?.some((text) => /gap|throat|armpit|visor|face/i.test(text))).length;
  const kinds = Object.keys(counts).filter((kind) => WEIGHT[kind]);
  const total = kinds.length * 2 + kinds.reduce((sum, kind) => sum + WEIGHT[kind] * Math.min(3, counts[kind]), 0) + Math.min(3, gaps) * 3 + Math.min(3, turned) * 2;
  // The busiest window: the most distinct weighted kinds in WINDOW s, ties to the higher weight.
  let best = { at: 0, kinds: [], worth: -1 };
  for (let start = 0; start < world.time; start += 1) {
    const inside = events.filter((event) => event.time >= start && event.time < start + WINDOW && WEIGHT[event.kind]);
    const distinct = [...new Set(inside.map((event) => event.kind))];
    const worth = distinct.reduce((sum, kind) => sum + WEIGHT[kind], 0);
    if (worth > best.worth) best = { at: start, kinds: distinct, worth };
  }
  return { score: total, kinds: kinds.length, gaps, turned, window: best, subjects: subjects(world, events), ...extra(events) };
}

/** The camera's subjects: each man's richest WINDOW s of his own events (as fighter, attacker or defender), the best few overall. */
function subjects(world, events) {
  const mine = new Map();
  for (const event of events) {
    if (!WEIGHT[event.kind]) continue;
    for (const id of new Set([event.fighter, event.attacker, event.defender])) {
      if (id == null || id < 0) continue;
      if (!mine.has(id)) mine.set(id, []);
      mine.get(id).push(event);
    }
  }
  const found = [];
  for (const [id, own] of mine) {
    let best = null;
    for (const first of own) {
      const inside = own.filter((event) => event.time >= first.time && event.time < first.time + WINDOW);
      const distinct = [...new Set(inside.map((event) => event.kind))];
      const worth = distinct.reduce((sum, kind) => sum + WEIGHT[kind], 0);
      if (!best || worth > best.worth) best = { at: Number(first.time.toFixed(1)), kinds: distinct, worth, point: first.point?.map((v) => Number(v.toFixed(1))) };
    }
    const man = world.fighters[id];
    found.push({ id, corner: man.corner, weapon: man.weapon?.kind ?? man.offWeapon?.kind ?? 'none', ...best });
  }
  return found.sort((a, b) => b.worth - a.worth).slice(0, 4);
}

const [mode, id, seeds = '6', seconds = '120'] = process.argv.slice(2);
const rows = [];
for (let seed = 1; seed <= Number(seeds); seed += 1) {
  const started = Date.now();
  let world;
  if (mode === 'story') {
    const battle = STORY_BATTLES[id];
    const setup = battle.setup(storyNorthLife(battle, { rank: 'soldier', place: 'front' }), seed, {});
    world = createWorld(setup.fighters.map(({ inputs, corner }) => ({ inputs: normaliseInputs(structuredClone(inputs)), corner })), setup.options);
    world.perceiver = setup.player;
  } else {
    world = scenarioWorld(id, seed);
  }
  const ran = run(world, Number(seconds));
  const row = { id, seed, seconds: Number(ran.toFixed(1)), wallS: Math.round((Date.now() - started) / 1000), ...score(world) };
  rows.push(row);
  console.log(JSON.stringify(row));
}
rows.sort((a, b) => b.score - a.score);
console.log(`BEST ${id}: ${rows.slice(0, 3).map((row) => `seed ${row.seed} score ${row.score} (${row.kinds} kinds, gaps ${row.gaps}, window ${row.window.at}-${row.window.at + WINDOW}s: ${row.window.kinds.join(' ')})`).join(' | ')}`);
