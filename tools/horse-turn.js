// The player's horse turning under the stick, locked on a man and not: the heading's rate (deg/s) at each gait, the stick held
// square across the horse's line, or straight back. Before (CONTROL.ride.reins false: the old steering) and after.
// `node tools/horse-turn.js`.

import { PRESETS } from '../src/body.js';
import { advance, createWorld, placeFighter } from '../src/physics.js';
import { CONTROL, directFighter, newOrders } from '../src/control.js';

export const STICK_GAITS = { walk: 0.3, trot: 0.55, canter: 0.8, gallop: 1 };

/** A knight on his horse, a man on foot far off; the horse brought up to the stick's pace, then the stick put across. */
export function turnRate(locked, gait, { seconds = 1, key = 'knight', about = false } = {}) {
  const world = createWorld([{ inputs: { ...structuredClone(PRESETS[key]), mounted: true }, corner: 'red' }, { inputs: structuredClone(PRESETS.yari), corner: 'blue' }], { seed: 3, arena: { halfX: 200, halfZ: 200 } });
  const [me, foe] = world.fighters;
  // The man on foot far ahead of the horse, on its line: the stick is put square across it.
  placeFighter(foe, 60, 0);
  const orders = newOrders();
  const horse = me.mount;
  const amount = STICK_GAITS[gait];
  const ahead = [Math.cos(horse.yaw), -Math.sin(horse.yaw)];
  const step = (dir) => {
    orders.stick = { dir, amount };
    directFighter(world, me, orders, 1 / 60);
    advance(world, 1 / 60);
  };
  for (let t = 0; t < 4; t += 1 / 60) step(ahead);
  if (locked) orders.lock = foe.id;
  for (let t = 0; t < 0.5; t += 1 / 60) step(ahead);
  const speed = horse.speed;
  // Square across, or (about) straight back: turning away from the man ahead.
  const right = about ? [-ahead[0], -ahead[1]] : [-ahead[1], ahead[0]];
  const goal = about ? Math.PI * 0.95 : (Math.PI / 2) * 0.95;
  const from = horse.yaw;
  let least = speed;
  let peak = 0;
  let round = null;
  for (let t = 0; t < seconds; t += 1 / 60) {
    step(right);
    least = Math.min(least, horse.speed);
    peak = Math.max(peak, Math.abs(horse.yawRate));
    const turned = Math.abs(Math.atan2(Math.sin(horse.yaw - from), Math.cos(horse.yaw - from)));
    if (round === null && turned >= goal) round = t;
  }
  const turned = Math.atan2(Math.sin(horse.yaw - from), Math.cos(horse.yaw - from));
  return { speed, degPerSecond: (Math.abs(turned) * 180) / Math.PI / seconds, peak: (peak * 180) / Math.PI, round, least };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('after 4.5 s straight on, the stick turned for 4 s: speed before (m/s), peak turn (deg/s), s to come round (- never), least speed');
  for (const reins of [false, true]) {
  CONTROL.ride.reins = reins;
  console.log(reins ? '\n==== now: the stick is the reins (control.js rideStick)' : '\n==== before: the old steering (CONTROL.ride.reins false)');
  for (const about of [false, true]) {
    console.log(about ? '\nabout: the stick straight back, away from the man ahead (s to come round 171 deg)' : '\nacross: the stick square across (s to come round 85 deg)');
    console.log('gait     stick   free: m/s   peak  round  least   locked: m/s   peak  round  least');
    for (const gait of Object.keys(STICK_GAITS)) {
      const free = turnRate(false, gait, { seconds: 4, about });
      const lock = turnRate(true, gait, { seconds: 4, about });
      const row = (r) => `${r.speed.toFixed(2).padStart(6)} ${r.peak.toFixed(1).padStart(6)} ${(r.round === null ? '-' : r.round.toFixed(2)).padStart(6)} ${r.least.toFixed(2).padStart(6)}`;
      console.log(`${gait.padEnd(8)} ${STICK_GAITS[gait].toFixed(2)}   ${row(free)}      ${row(lock)}`);
    }
  }
  }
  CONTROL.ride.reins = true;
}
