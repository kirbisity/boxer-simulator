import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { advance, aimPoint, bladeStrike, createWorld, handVelocityOf, placeFighter, point, throwPunch } from '../src/physics.js';
import { BARDING, canRide, HORSES, mountOf } from '../src/horses.js';
import { turnRadius } from '../src/physics/mounted.js';
import { thinkAll } from '../src/ai.js';
import { MOVES } from '../src/moves.js';
import { vec } from '../src/pose.js';

const FIELD = { halfX: 30, halfZ: 20 };
const rider = (key, extra = {}) => ({ ...structuredClone(PRESETS[key]), mounted: true, ...extra });
const footman = (key) => structuredClone(PRESETS[key]);
const world = (red, blue, seed = 1) => createWorld([{ inputs: red, corner: 'red' }, { inputs: blue, corner: 'blue' }], { seed, arena: FIELD });
// Hold a horse to a goal (a heading and a speed) for `seconds`, nobody thinking.
const ride = (w, horse, goal, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 60) {
    horse.goal = goal;
    horse.goalAt = w.time + 1;
    for (const other of w.horses) other.goalAt = w.time + 1;
    advance(w, 1 / 60);
  }
};

test('riding is the kit\'s: knights, samurai and the steppe ride; gladiators and boxers do not, and are not put on a horse', () => {
  for (const key of ['knight', 'templar', 'maximilian', 'samurai', 'tametomo', 'kheshig', 'ironPagoda', 'saladin', 'sipahi', 'gaziAlp', 'guanYu', 'hidalgo']) assert.ok(canRide(PRESETS[key]), key);
  for (const key of ['murmillo', 'heavy', 'police', 'macuahuitl', 'legionary', 'yari', 'street']) assert.ok(!canRide(PRESETS[key]), key);
  const w = world(rider('murmillo'), rider('knight'));
  assert.equal(w.horses.length, 1);
  assert.equal(w.fighters[0].mount ?? null, null);
  assert.ok(w.fighters[1].mount);
});

test('barding: steel plate for knights in full plate (not the Templar), steel lamellar for the Iron Pagoda and the kheshig, the rest bare', () => {
  assert.equal(mountOf(PRESETS.knight).barding, 'plate');
  assert.equal(mountOf(PRESETS.maximilian).barding, 'plate');
  assert.equal(mountOf(PRESETS.templar).barding, 'bare');
  assert.equal(mountOf(PRESETS.ironPagoda).barding, 'lamellar');
  assert.equal(mountOf(PRESETS.saber).barding, 'lamellar');
  assert.equal(mountOf(PRESETS.saladin).barding, 'bare');
  assert.ok(BARDING.plate.parts.chest.cut > 0.9 && BARDING.lamellar.parts.chest.cut > 0.8 && BARDING.bare.parts.chest.cut === 0);
});

test('a horse gets away no faster than its legs allow, holds no more than its gallop laden, and turns no tighter than it can lean', () => {
  const w = world(rider('knight'), rider('saladin'));
  const [destrier, arab] = w.horses;
  ride(w, destrier, { heading: 0, speed: 30 }, 1);
  // ~3 m/s² from a stand: about 3 m/s after a second, not 30.
  assert.ok(destrier.speed > 2 && destrier.speed < 4.5, `after 1 s ${destrier.speed}`);
  ride(w, destrier, { heading: 0, speed: 30 }, 2.4);
  assert.ok(destrier.speed <= HORSES.destrier.gallop + 1e-9, `gallop ${destrier.speed}`);
  assert.ok(destrier.speed > HORSES.destrier.gallop * 0.8, 'laden, still near its gallop');
  // Turning at a gallop: its yaw rate no more than lateral / speed.
  const speed = destrier.speed;
  const before = destrier.yaw;
  ride(w, destrier, { heading: Math.PI, speed }, 0.5);
  const rate = Math.abs(destrier.yaw - before) / 0.5;
  assert.ok(rate <= HORSES.destrier.lateral / (speed * 0.95) + 1e-6, `turn rate ${rate}`);
  assert.ok(turnRadius(destrier, 10) >= 100 / HORSES.destrier.lateral - 1e-6);
  // A light horse turns tighter than the great horse at the same speed.
  assert.ok(turnRadius(arab, 10) < turnRadius(destrier, 10));
});

test('the rider sits his saddle at the horse\'s speed: his hips held there, his hand and blade moving with the horse', () => {
  const w = world(rider('samurai'), footman('yari'));
  const horse = w.horses[0];
  const man = w.fighters[0];
  ride(w, horse, { heading: 0, speed: 12 }, 4);
  const pelvis = point(man.x, P.pelvis);
  assert.ok(pelvis[1] > horse.withers, `seated high: ${pelvis[1]}`);
  assert.ok(Math.hypot(pelvis[0] - horse.at[0], pelvis[2] - horse.at[1]) < 0.4, 'over the horse');
  const hand = handVelocityOf(man, P.rHand);
  const along = vec.dot(hand, horse.velocity) / vec.length(horse.velocity);
  assert.ok(Math.abs(along - horse.speed) < 3, `the hand carried at ${along.toFixed(1)} m/s, the horse at ${horse.speed.toFixed(1)}`);
  assert.ok(man.weapon.tipVelocity[0] > horse.speed * 0.6, 'the blade too');
});

test('a couched lance from the saddle strikes with the braced rider and a share of the horse behind it, and the horse\'s speed in it: far more than on foot', () => {
  const mounted = world(rider('maximilian'), footman('yari'));
  const onFoot = world(footman('maximilian'), footman('yari'));
  const energy = (w, closing) => {
    const man = w.fighters[0];
    const punch = { spec: MOVES.lanceCharge, heavy: false };
    const relative = vec.scale(man.weapon.dir, closing);
    const { strikeMass } = bladeStrike(man, man.weapon, punch, relative, man.weapon.spec.length * 0.95);
    const struck = w.fighters[1].body.massKg * 0.35;
    const reduced = (strikeMass * struck) / (strikeMass + struck);
    return { strikeMass, energy: 0.5 * reduced * closing * closing };
  };
  // The same arm's drive (~5 m/s run and thrust on foot); the horse's gallop added in the saddle.
  const foot = energy(onFoot, 5);
  const saddle = energy(mounted, 5 + mounted.horses[0].paces.gallop);
  assert.ok(saddle.strikeMass > foot.strikeMass * 2, `${saddle.strikeMass.toFixed(0)} kg v ${foot.strikeMass.toFixed(0)} kg`);
  assert.ok(saddle.energy > foot.energy * 5, `${saddle.energy.toFixed(0)} J v ${foot.energy.toFixed(0)} J`);
});

test('a rider who takes a knock past what the saddle holds is thrown, falls, gets up and fights on foot', () => {
  const w = world(rider('knight'), footman('yari'));
  const man = w.fighters[0];
  w.fighters[1].state = 'out';
  ride(w, w.horses[0], { heading: 0, speed: 6 }, 1);
  man.knock = [6, 0, 0];
  advance(w, 1 / 60);
  assert.equal(man.mount, null);
  assert.equal(man.state, 'down');
  assert.ok(w.events.some((event) => event.kind === 'unhorsed' && event.fighter === man.id));
  advance(w, 12);
  assert.equal(man.state, 'up');
  assert.ok(point(man.x, P.pelvis)[1] < 1.3, 'on his own feet');
});

test('a horse that bleeds out falls and throws its rider, who gets up', () => {
  const w = world(rider('samurai'), footman('yari'));
  const [horse] = w.horses;
  const man = w.fighters[0];
  w.fighters[1].state = 'out';
  ride(w, horse, { heading: 0, speed: 8 }, 2);
  horse.bleed = 1;
  advance(w, 1.2);
  assert.notEqual(horse.state, 'up');
  assert.equal(man.mount, null);
  assert.ok(w.events.some((event) => event.kind === 'horseDown'));
  assert.ok(w.events.some((event) => event.kind === 'unhorsed' && /horse goes down/.test(event.effects[0])));
  advance(w, 12);
  assert.equal(horse.state, 'down');
  assert.equal(man.state, 'up');
});

test('barding keeps out the edge: the same cut at a horse\'s chest bleeds a bare horse, not a horse in plate', () => {
  const bleed = (key) => {
    const w = world(footman('samurai'), rider(key));
    const [horse] = w.horses;
    const man = w.fighters[0];
    // Beside the horse's chest, cutting at it.
    const chest = aimPoint(w.fighters[1], 'horse');
    placeFighter(man, chest[0] - 1.25, chest[2]);
    man.yaw = 0;
    advance(w, 0.3);
    let hit = null;
    for (let tries = 0; tries < 6 && !hit; tries += 1) {
      if (!throwPunch(w, man, 'yokogiri', 'body')) {
        advance(w, 0.2);
        continue;
      }
      man.punch.at = aimPoint(w.fighters[1], 'horse');
      for (let t = 0; t < 1 && !hit; t += 1 / 60) {
        horse.goalAt = w.time + 1;
        advance(w, 1 / 60);
        hit = w.events.find((event) => event.kind === 'horseHit');
      }
    }
    return { hit, bleed: horse.bleed };
  };
  const bare = bleed('templar');
  const plate = bleed('knight');
  assert.ok(bare.hit && plate.hit, 'both struck');
  assert.ok(bare.bleed > 0 && bare.hit.cut > 1, `bare: ${bare.hit.cut}`);
  assert.ok(plate.hit.cut < 1e-6, `plate: ${plate.hit.cut}`);
});

test('mounted bouts run: a rider strikes in passing with the horse\'s speed in the blow, and the man on foot meets him', () => {
  const w = world(rider('knight'), footman('yari'), 1);
  advance(w, 20, thinkAll);
  const riderBlows = w.events.filter((event) => (event.kind === 'landed' || event.kind === 'blocked') && event.attacker === 0);
  const footBlows = w.events.filter((event) => (event.kind === 'landed' || event.kind === 'blocked' || event.kind === 'horseHit') && event.attacker === 1);
  assert.ok(riderBlows.length >= 1, 'the rider lands');
  assert.ok(footBlows.length >= 1, 'the spearman reaches him or his horse');
  // At a gallop the cut closes faster than any arm alone swings (~10-12 m/s).
  assert.ok(riderBlows.some((event) => event.speed > 9), riderBlows.map((event) => event.speed.toFixed(1)).join(', '));
});
