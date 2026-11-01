// The flamethrower play-tested in Node: the operator (the special forces preset with the tanks) against one man at a time, from
// `apart` m, stepped as the page steps. Prints, per bout, what the fire did: bursts (count, lengths), the fuel's time, when it ran
// out and what he did then, how long his man burned, the fear, the outcome. Lean: a handful of bouts, not a stat sim.
//
//   node tools/flameduel.js [opponents=swordShield,knight,infantry,chimp,dogGo2] [seeds=1] [apart=20] [seconds=60]

import { PRESETS, P } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { boutWinner, createWorld, inFight, placeFighter, step } from '../src/physics.js';
import { aimJet, FLAME, withTanks } from '../src/physics/flame.js';
import { WORLD } from '../src/physics/config.js';
import { WEAPONS } from '../src/weapons.js';

/** How far a jet aimed `angle` up carries over flat ground from `height` m (flown as the lumps fly). */
export function jetLanding(angle, height = 1.4) {
  const dt = 1 / 240;
  const slow = Math.exp(-FLAME.drag * dt);
  const at = [0, height];
  const v = [Math.cos(angle) * FLAME.speed, Math.sin(angle) * FLAME.speed];
  for (let t = 0; t < 8; t += dt) {
    v[1] -= WORLD.gravity * dt;
    v[0] *= slow;
    v[1] *= slow;
    at[0] += v[0] * dt;
    at[1] += v[1] * dt;
    if (v[1] < 0 && at[1] <= 0) return at[0];
  }
  return at[0];
}

/** The operator: SSgt. Brooks with the M2 in place of his rifle and the tanks on his back. */
export const flamerInputs = () => withTanks({ ...structuredClone(PRESETS.rifle), name: 'Flamethrower', style: 'flamethrower' });

/** One bout: the operator against `preset`, `apart` m between them. */
export function flameDuel(preset, { seed = 1, apart = 20, seconds = 60 } = {}) {
  const world = createWorld([{ inputs: flamerInputs(), corner: 'red' }, { inputs: structuredClone(PRESETS[preset]), corner: 'blue' }], { seed, arena: { halfX: 30, halfZ: 30 } });
  const [flamer, man] = world.fighters;
  placeFighter(flamer, -apart / 2, 0);
  placeFighter(man, apart / 2, 0);
  const dt = 1 / 60;
  const record = { preset, seed, bursts: [], firstAt: null, firstRange: null, emptyAt: null, sidearmAt: null, burnSeconds: 0, ownBurn: 0, panicked: false, rolled: false, fright: 0, speed: [], stamina: 1 };
  let open = false;
  let openedAt = 0;
  let cursor = 0;
  let t = 0;
  let last = point2(flamer);
  for (; t < seconds && !boutWinner(world); t += dt) {
    thinkAll(world, dt);
    step(world, dt);
    const valve = world.flame?.valves.get(flamer.id);
    const nowOpen = Boolean(valve?.open);
    if (nowOpen && !open) {
      openedAt = t;
      if (record.firstAt === null) {
        record.firstAt = t;
        record.firstRange = Math.hypot(man.x[P.pelvis * 3] - flamer.x[P.pelvis * 3], man.x[P.pelvis * 3 + 2] - flamer.x[P.pelvis * 3 + 2]);
      }
    }
    if (!nowOpen && open) record.bursts.push(t - openedAt);
    open = nowOpen;
    if (man.burning?.heat > 0.05) record.burnSeconds += dt;
    if (flamer.burning?.heat > 0.05) record.ownBurn += dt;
    record.fright = Math.max(record.fright, man.flameFright ?? 0);
    record.stamina = Math.min(record.stamina, flamer.stamina);
    const here = point2(flamer);
    if (Math.round(t / dt) % 30 === 0) {
      record.speed.push(Math.hypot(here[0] - last[0], here[1] - last[1]) / 0.5);
      last = here;
    }
    for (; cursor < world.events.length; cursor += 1) {
      const event = world.events[cursor];
      if (event.kind === 'ammoEmpty' && event.fighter === flamer.id) record.emptyAt = event.time;
      if (event.fighter === man.id && event.effects?.some((effect) => /on fire: runs/.test(effect))) record.panicked = true;
      if (event.fighter === man.id && event.effects?.some((effect) => /drops and rolls/.test(effect))) record.rolled = true;
    }
    if (record.emptyAt !== null && record.sidearmAt === null && flamer.weapon?.held && !flamer.weapon.spec.shot?.flame) record.sidearmAt = t;
  }
  if (open) record.bursts.push(t - openedAt);
  record.winner = boutWinner(world) === 'red' ? 'flamer' : boutWinner(world) === 'blue' ? preset : 'none';
  record.seconds = t;
  record.fuelLeft = (flamer.rounds ?? WEAPONS.flamethrower.shot.rounds) / WEAPONS.flamethrower.shot.automatic.rate;
  record.flamerState = flamer.state;
  record.manState = man.state;
  record.manTrunk = man.trauma?.trunk ?? 0;
  record.weaponAfter = flamer.weapon?.held ? flamer.weapon.kind : 'none';
  record.topSpeed = Math.max(...record.speed);
  record.alive = inFight(man);
  return record;
}

function point2(fighter) {
  return [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [opponents = 'swordShield,knight,infantry,chimp,dogGo2', seeds = '1', apart = '20', seconds = '60'] = process.argv.slice(2);
  const shot = WEAPONS.flamethrower.shot;
  const most = jetLanding(aimJet(200, -1.4));
  console.log(`jet: ${FLAME.speed} m/s, drag ${FLAME.drag}/s; carries ${most.toFixed(1)} m at most; fuel ${(shot.rounds / shot.automatic.rate).toFixed(1)} s at ${FLAME.flow} kg/s (${(FLAME.flow * shot.rounds / shot.automatic.rate).toFixed(1)} kg); bursts ${(shot.automatic.burst[0] / shot.automatic.rate).toFixed(1)}-${(shot.automatic.burst[1] / shot.automatic.rate).toFixed(1)} s`);
  for (const preset of opponents.split(',')) {
    for (let seed = 1; seed <= Number(seeds); seed += 1) {
      const r = flameDuel(preset, { seed, apart: Number(apart), seconds: Number(seconds) });
      const fmt = (value, digits = 1) => (value === null ? '-' : value.toFixed(digits));
      console.log(`${preset} s${seed}: ${r.winner} in ${fmt(r.seconds)} s (him ${r.manState}, trunk ${fmt(r.manTrunk, 2)}); first burst at ${fmt(r.firstAt)} s from ${fmt(r.firstRange)} m; ${r.bursts.length} bursts [${r.bursts.map((b) => b.toFixed(1)).join(' ')}] s; fuel left ${fmt(r.fuelLeft)} s, empty at ${fmt(r.emptyAt)}, then ${r.weaponAfter} (at ${fmt(r.sidearmAt)}); he burned ${fmt(r.burnSeconds)} s (rolled ${r.rolled}, ran ${r.panicked}, fright ${fmt(r.fright, 2)}); operator burned ${fmt(r.ownBurn)} s, top ${fmt(r.topSpeed)} m/s, stamina low ${fmt(r.stamina, 2)}`);
    }
  }
}
