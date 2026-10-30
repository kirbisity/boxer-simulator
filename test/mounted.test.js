import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { advance, aimPoint, bladeStrike, createWorld, handVelocityOf, placeFighter, point, throwPunch } from '../src/physics.js';
import { BARDING, canRide, HORSES, mountOf } from '../src/horses.js';
import { ladenMass, turnRadius } from '../src/physics/mounted.js';
import { ATTACKERS, firstBlow } from '../tools/couched.js';
import { thinkAll } from '../src/ai.js';
import { MOVES } from '../src/moves.js';
import { vec } from '../src/pose.js';
import { WORLD } from '../src/physics/config.js';
import { measure } from '../tools/riding-motion.js';

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

test('a blow from the saddle has the rider and a share of the horse behind it as rigidly as its weapon is coupled to them: a thrust held under the arm tens of kg, a cut a few, none on foot', () => {
  const mounted = world(rider('knight', { style: 'spear' }), footman('yari'));
  const onFoot = world({ ...footman('knight'), style: 'spear' }, footman('yari'));
  const gallop = mounted.horses[0].paces.gallop;
  const behind = (w, move, speed, direction, blade = [1, 0, 0]) => {
    const man = w.fighters[0];
    const weapon = man.weapon;
    weapon.dir = blade;
    return bladeStrike(man, weapon, { spec: MOVES[move], heavy: false }, vec.scale(direction, speed), weapon.spec.length * 0.9).strikeMass;
  };
  const ahead = [1, 0, 0];
  const across = [0, 0, 1];
  const thrust = behind(mounted, 'spearThrust', gallop, ahead);
  const cut = behind(mounted, 'gladiusCut', gallop, ahead, across);
  const lunge = behind(mounted, 'lunge', gallop, ahead);
  assert.ok(thrust > 30 && thrust < 120, `a spear thrust from the saddle: ${thrust.toFixed(0)} kg`);
  assert.ok(cut > 2 && cut < 12, `a cut: ${cut.toFixed(1)} kg`);
  assert.ok(thrust > lunge && lunge > cut, `a point held in both hands, in one, a cut: ${thrust.toFixed(0)}, ${lunge.toFixed(0)}, ${cut.toFixed(1)} kg`);
  // The share is less as the blow runs across the horse's own line (the thighs hold him there, not the stirrups and cantle).
  assert.ok(behind(mounted, 'spearThrust', gallop, across) < thrust * 0.7, 'across the horse\'s line');
  // The same moves on foot have only the arm and the body the move brings in: the thrust a third of it, the cut a few kg less.
  assert.ok(behind(onFoot, 'spearThrust', 5, ahead) < thrust / 2.5, 'a thrust on foot');
  assert.ok(cut - behind(onFoot, 'gladiusCut', 5, ahead, across) > 1.5, 'a cut on foot');
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
  // (A sabre: the cut a horseman makes in passing. A knight's long sword, by its style's weights, is often a lunge made while the man is still ahead.)
  // (Over a few bouts: whether a pass catches the man at the gallop's full speed depends on where he is, running or getting up, as the horse comes.)
  const cuts = [];
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const w = world(rider('saber'), footman('yari'), seed);
    advance(w, 20, thinkAll);
    const riderBlows = w.events.filter((event) => (event.kind === 'landed' || event.kind === 'blocked') && event.attacker === 0);
    const footBlows = w.events.filter((event) => (event.kind === 'landed' || event.kind === 'blocked' || event.kind === 'horseHit') && event.attacker === 1);
    assert.ok(riderBlows.length >= 1 || seed > 1, 'the rider lands');
    assert.ok(footBlows.length >= 1, `the spearman reaches him or his horse (seed ${seed})`);
    cuts.push(...riderBlows.map((event) => event.speed));
  }
  // At a gallop the cut closes faster than any arm alone swings (~10-12 m/s).
  assert.ok(cuts.some((speed) => speed > 9), cuts.map((speed) => speed.toFixed(1)).join(', '));
});

// ---- Momentum: the lance on foot and on horseback; horses against men and against each other ----

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];

test('the same lance couched from a destrier at the gallop spends an order of magnitude more than on foot at a run: the saddle and lance rest put the horse behind the point', () => {
  const [foot, saddle] = ATTACKERS;
  const blows = (entry, seeds) => seeds.map((seed) => firstBlow(entry[1], 'street', 3000 + seed, entry[2])).filter(Boolean).map((row) => row.hit);
  const onFoot = blows(foot, [0, 1, 2, 3]);
  const mounted = blows(saddle, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(onFoot.length >= 3 && mounted.length >= 3, `landed ${onFoot.length}, ${mounted.length}`);
  const energy = (hits) => median(hits.map((hit) => hit.energy));
  // The mass behind the point: the man's weight and the horse's share, against a quarter of the man on foot.
  assert.ok(median(mounted.map((hit) => hit.strikeMass)) > 3 * median(onFoot.map((hit) => hit.strikeMass)));
  // Its speed: the horse's gallop, against a laden man's run.
  assert.ok(median(mounted.map((hit) => hit.speed)) > 2 * median(onFoot.map((hit) => hit.speed)));
  assert.ok(energy(mounted) >= 8 * energy(onFoot), `${energy(mounted).toFixed(0)} J from the saddle, ${energy(onFoot).toFixed(0)} J on foot`);
  assert.ok(median(mounted.map((hit) => hit.pierce)) >= 8 * median(onFoot.map((hit) => hit.pierce)));
  // On foot it is still tens of joules; from the saddle hundreds, kilojoule class when it meets square at the gallop.
  assert.ok(energy(onFoot) < 160 && energy(mounted) > 400, `${energy(mounted).toFixed(0)} J v ${energy(onFoot).toFixed(0)} J`);
});

/** A rider at the gallop straight at men standing where they are put (no blow struck): what the horse and the men did, to 3 s after the first contact. */
function chargeInto(riderInputs, men, places, seed = 4000) {
  const sides = [{ inputs: riderInputs, corner: 'red' }, ...men.map((inputs) => ({ inputs, corner: 'blue' }))];
  const w = createWorld(sides, { seed, arena: FIELD, formation: {} });
  const foes = w.fighters.slice(1);
  places.forEach(([x, z], index) => placeFighter(foes[index], x, z));
  const horse = w.horses[0];
  const knight = w.fighters[0];
  const start = foes.map((man) => point(man.x, P.pelvis));
  let before = 0;
  let low = Infinity;
  let contact = null;
  let peak = 0;
  for (let t = 0; t < 9; t += 1 / 60) {
    horse.goal = { heading: 0, speed: horse.paces.gallop };
    horse.goalAt = w.time + 1;
    knight.cooldown = 1;
    advance(w, 1 / 60, () => {
      for (const man of foes) man.move = 0;
    });
    if (contact === null && w.events.some((event) => event.kind === 'trampled' || event.kind === 'horseCrash')) contact = w.time;
    if (contact === null) before = Math.max(before, horse.speed);
    else if (w.time - contact < 0.5) low = Math.min(low, horse.speed);
    if (contact !== null) peak = Math.max(peak, ...foes.map((man) => Math.hypot(...point(man.v, P.pelvis))));
    if (contact !== null && w.time - contact > 3) break;
  }
  return { w, horse, knight, foes, before, low, peak, thrown: foes.map((man, index) => Math.hypot(point(man.x, P.pelvis)[0] - start[index][0], point(man.x, P.pelvis)[2] - start[index][2])) };
}
const row = (key, count, extra = {}) => Array.from({ length: count }, () => ({ ...footman(key), ...extra }));
const block = (files, ranks, across = 0.7, deep = 0.8) => Array.from({ length: files * ranks }, (_, index) => [12 + Math.floor(index / files) * deep, ((index % files) - (files - 1) / 2) * across]);

test('a horse at the gallop bowls a man over and carries him, the reaction slowing it by his share of the momentum; in plate he goes over all the same but is hurt less', () => {
  const bare = chargeInto(rider('knight'), row('street', 1, { style: 'unskilled' }), [[12, 0]]);
  const plate = chargeInto(rider('knight'), row('knight', 1, { style: 'unskilled' }), [[12, 0]]);
  for (const run of [bare, plate]) {
    const event = run.w.events.find((e) => e.kind === 'trampled');
    assert.ok(event && event.fell, 'ridden down and put over');
    assert.ok(event.speed > 8, `closing ${event.speed.toFixed(1)} m/s`);
    // Carried at the horse's own speed and thrown several metres, a ragdoll.
    assert.ok(run.peak > 0.8 * run.before, `flung at ${run.peak.toFixed(1)} m/s by a horse at ${run.before.toFixed(1)}`);
    assert.ok(run.thrown[0] > 3, `thrown ${run.thrown[0].toFixed(1)} m`);
    // Equal and opposite: the horse lost his impulse over its laden mass, a tenth of its speed.
    const lost = run.before - run.low;
    assert.ok(Math.abs(lost - event.impulse / ladenMass(run.w, run.horse)) < 0.3 * lost + 0.15, `lost ${lost.toFixed(2)} m/s`);
    assert.ok(lost > 0.4 && run.low > 0.7 * run.before, `slowed ${run.before.toFixed(1)} -> ${run.low.toFixed(1)}`);
  }
  assert.ok(ladenMass(bare.w, bare.horse) > bare.horse.mass + 100, 'the rider and his kit are in the mass');
  // Harm of the blow, through his armour.
  assert.ok(bare.foes[0].trauma.trunk > 0.8, `bare ${bare.foes[0].trauma.trunk.toFixed(2)}`);
  assert.ok(plate.foes[0].trauma.trunk < 0.6 * bare.foes[0].trauma.trunk, `plate ${plate.foes[0].trauma.trunk.toFixed(2)}`);
  assert.equal(bare.w.events.filter((e) => e.kind === 'horseDown').length, 0);
});

test('men in close order are one block to the horse and stop it where it rides down one man; spaced out they are bowled singly', () => {
  const one = chargeInto(rider('knight'), row('hoplomachus', 1), [[12, 0]]);
  const spaced = chargeInto(rider('knight'), row('hoplomachus', 3), block(3, 1, 1.8));
  const wall = chargeInto(rider('knight'), row('hoplomachus', 9), block(3, 3));
  // (Six men in plate: the median of seven runs, a third of its speed in half a second against a tenth for one man: which of them the horse meets second, and so how soon, depends on how the first men were crashed into each other and reeled.)
  const platesRuns = [4000, 4001, 4002, 4003, 4004, 4005, 4006].map((seed) => chargeInto(rider('knight'), row('knight', 6, { style: 'unskilled' }), block(3, 2, 0.8), seed));
  const plates = platesRuns[0];
  const lostBy = (run) => (run.before - run.low) / run.before;
  assert.ok(lostBy(one) < 0.2, `one man ${lostBy(one).toFixed(2)}`);
  assert.ok(lostBy(spaced) < 0.3, `spaced ${lostBy(spaced).toFixed(2)}`);
  assert.ok(lostBy(wall) > 0.6, `a wall of nine ${lostBy(wall).toFixed(2)}`);
  assert.ok(median(platesRuns.map(lostBy)) > 0.35, `six in plate ${platesRuns.map((run) => lostBy(run).toFixed(2))}`);
  // The rider goes over the horse's neck when it stops, and the men take less each than a lone man.
  for (const run of [wall, plates]) assert.ok(run.w.events.some((e) => e.kind === 'unhorsed' && e.fighter === 0), 'the rider is thrown');
  // (How fast a man is flung depends on where on his shield the horse meets him: the median of five seeds, a wall no worse for each man than a lone man.)
  const flung = (count, places) => median([4000, 4001, 4002, 4003, 4004].map((seed) => chargeInto(rider('knight'), row('hoplomachus', count), places, seed).peak));
  assert.ok(flung(9, block(3, 3)) < flung(1, [[12, 0]]) * 1.1, 'the men of a wall take no more each than a lone man');
  // (The median of five seeds: the front men driven back into the ranks behind hand on their momentum, now through the shields of the men behind as well, and how many of those go over depends on how they were thrown: three seeds ran 4-7 of 9 either way.)
  const standing = median([wall, ...[4001, 4002, 4003, 4004].map((seed) => chargeInto(rider('knight'), row('hoplomachus', 9), block(3, 3), seed))].map((run) => run.foes.filter((man) => man.state === 'up').length));
  assert.ok(standing >= 5, `most of the wall stays on its feet (${standing} of 9)`);
});

test('a man lying in a horse\'s path is trodden on by its hooves', () => {
  const w = world(rider('knight'), footman('street', { style: 'unskilled' }));
  const [horse] = w.horses;
  const man = w.fighters[1];
  w.fighters[0].cooldown = 1;
  man.state = 'down';
  man.downTimer = 30;
  placeFighter(man, -6, 0);
  advance(w, 0.1);
  for (let t = 0; t < 7; t += 1 / 60) {
    horse.goal = { heading: 0, speed: 3 };
    horse.goalAt = w.time + 1;
    advance(w, 1 / 60);
  }
  assert.ok(w.events.some((event) => event.kind === 'trampled' && event.effects[0] === 'trodden by a hoof'), 'a hoof came down on him');
});

test('two horses meeting exchange momentum by their laden masses; head-on at a canter or more both go down and throw their riders, a brush only shoves', () => {
  const meet = (blue, offset = 0, angle = 0) => {
    const w = createWorld([{ inputs: rider('knight'), corner: 'red' }, { inputs: rider(blue), corner: 'blue' }], { seed: 4000, arena: FIELD });
    const [a, b] = w.horses;
    const at = [12 * Math.cos(angle), -12 * Math.sin(angle) - offset];
    placeFighter(w.fighters[1], at[0], at[1]);
    b.at = at;
    b.yaw = Math.PI + angle;
    w.fighters[1].yaw = b.yaw;
    const masses = [ladenMass(w, a), ladenMass(w, b)];
    let momentum = null;
    for (let t = 0; t < 8; t += 1 / 60) {
      a.goal = { heading: 0, speed: a.paces.gallop };
      b.goal = { heading: Math.PI + angle, speed: b.paces.gallop };
      for (const h of w.horses) h.goalAt = w.time + 1;
      for (const f of w.fighters) f.cooldown = 1;
      const along = (h) => h.speed * Math.cos(h.yaw);
      const before = masses[0] * along(a) + masses[1] * along(b);
      advance(w, 1 / 60);
      if (!momentum && w.events.some((e) => e.kind === 'horseCrash')) momentum = { before, after: masses[0] * along(a) + masses[1] * along(b) };
      if (momentum && t > 3) break;
    }
    return { w, momentum };
  };
  const head = meet('saladin');
  assert.ok(head.momentum, 'they met');
  // Their momentum along the line is what it was (the legs' own push in a few thousandths of a second aside).
  assert.ok(Math.abs(head.momentum.after - head.momentum.before) < 0.06 * Math.abs(head.momentum.before) + 150, `${head.momentum.before.toFixed(0)} -> ${head.momentum.after.toFixed(0)} kg m/s`);
  assert.equal(head.w.events.filter((e) => e.kind === 'horseDown').length, 2, 'both horses fall');
  assert.equal(head.w.events.filter((e) => e.kind === 'unhorsed').length, 2, 'both riders are thrown');
  // The lighter horse is knocked back the more (it takes the larger share of the speed change).
  const first = (horse) => head.w.events.find((e) => e.kind === 'horseCrash' && e.horse === horse);
  const [heavy, light] = [first(0), first(1)];
  assert.ok(light.dv > heavy.dv, `${light.dv.toFixed(1)} v ${heavy.dv.toFixed(1)} m/s`);
  // Barrels brushing: a shove, both stay up and seated.
  const brush = meet('knight', 0.66);
  assert.equal(brush.w.events.filter((e) => e.kind === 'horseDown').length, 0);
  assert.equal(brush.w.events.filter((e) => e.kind === 'unhorsed').length, 0);
  // Crossing at an angle is worse than a brush.
  const across = meet('knight', 0, 0.7);
  assert.equal(across.w.events.filter((e) => e.kind === 'horseDown').length, 2);
});

test('a lance set against the charge has the man behind it, and pushes the horse back by the blow\'s momentum', () => {
  const w = createWorld([{ inputs: rider('knight'), corner: 'red' }, { inputs: footman('maximilian'), corner: 'blue' }], { seed: 4000, arena: FIELD });
  const horse = w.horses[0];
  const man = w.fighters[1];
  w.fighters[0].cooldown = 1;
  placeFighter(man, 3, 0);
  let hit = null;
  let thrown = false;
  for (let t = 0; t < 10 && !hit; t += 1 / 60) {
    horse.goal = { heading: 0, speed: horse.paces.gallop };
    horse.goalAt = w.time + 1;
    advance(w, 1 / 60, () => {
      // He stands, the point levelled at its chest and thrust as it comes (what the AI's standToRider does, timed to land).
      man.move = 0;
      const chest = aimPoint(w.fighters[0], 'horse');
      if (!thrown && !man.punch && chest[0] > point(man.x, P.pelvis)[0] - 6) thrown = throwPunch(w, man, 'lanceThrust', 'body', { at: vec.add(chest, vec.scale(horse.velocity, 0.45)) });
    });
    hit = w.events.find((event) => event.kind === 'horseHit' && event.attacker === 1);
  }
  assert.ok(hit, 'the lance struck the horse');
  assert.ok(hit.strikeMass > 0.5 * man.body.massKg, `${hit.strikeMass.toFixed(0)} kg behind the point`);
  assert.ok(hit.pushed > 0.1, `the horse pushed back ${hit.pushed.toFixed(2)} m/s`);
  assert.ok(hit.pierce > 0, 'and run on to it');
});

// ---- Circling, friends, the seat and the gait ----

/** Whether a blow has been struck, on a man or on a horse. */
const engaged = (w) => w.events.some((event) => event.kind === 'landed' || event.kind === 'blocked' || event.kind === 'horseHit');

test('a rider does not ride round his man for ever: a man standing in his turning circle is struck, and two alike on horseback engage, at every seed', () => {
  // A man on foot who stands where he is: the horse cannot turn inside the circle at a gallop's turning pace, so it slows to turn.
  for (const seed of [11, 12, 13, 14]) {
    const w = world(rider('saber'), footman('street', { style: 'unskilled' }), seed);
    advance(w, 40, thinkAll);
    assert.ok(w.events.some((event) => event.kind === 'landed' && event.attacker === 0), `seed ${seed}: the rider struck his man`);
  }
  // Two the same, each trying to get at the other: symmetric, until their draws differ.
  for (const seed of [21, 22, 23, 24]) {
    const w = world(rider('knight'), rider('knight'), seed);
    advance(w, 45, thinkAll);
    assert.ok(engaged(w), `seed ${seed}: they engaged`);
  }
});

test('a rider who has ridden past without striking rides in beside his man (patience), and each pass is drawn on its own', () => {
  const w = world(rider('saber'), footman('street', { style: 'unskilled' }), 5);
  const man = w.fighters[0];
  advance(w, 0.5, thinkAll);
  const first = { ...man.ride.plan };
  man.ride.passes = 3;
  advance(w, 1, thinkAll);
  // Rides in at a pace that lets him strike: nothing like a gallop at the man's side.
  assert.equal(man.ride.phase, 'charge');
  assert.ok(Math.abs(w.horses[0].goal.speed) <= w.horses[0].paces.canter + 1e-6, `${w.horses[0].goal.speed}`);
  assert.ok(first.pace <= 1 && first.pace >= 0.9 && Math.abs(first.aim) <= 0.3 && Math.abs(first.side) === 1, 'a pass is drawn with a pace, an aim and a side');
});

test('horses of one side brushing, or crowded together at a pace, only ease apart: no knock, no fall, no harm; friends meeting hard head-on crash all the same', () => {
  const meet = (offset, opposite) => {
    const w = createWorld([{ inputs: rider('knight'), corner: 'red' }, { inputs: rider('knight'), corner: 'red' }], { seed: 4000, arena: FIELD });
    const [a, b] = w.horses;
    placeFighter(w.fighters[0], 0, 0);
    a.at = [0, 0];
    const at = opposite ? [12, -offset] : [0, -offset];
    placeFighter(w.fighters[1], at[0], at[1]);
    b.at = at;
    b.yaw = opposite ? Math.PI : 0;
    w.fighters[1].yaw = b.yaw;
    for (let t = 0; t < 5; t += 1 / 60) {
      a.goal = { heading: 0, speed: a.paces.gallop };
      b.goal = { heading: b.yaw, speed: b.paces.gallop };
      for (const h of w.horses) h.goalAt = w.time + 1;
      for (const f of w.fighters) f.cooldown = 1;
      advance(w, 1 / 60);
    }
    return w;
  };
  // Parallel at the same pace, barrels overlapping a little: nothing.
  const brush = meet(0.7, false);
  assert.equal(brush.events.filter((e) => ['horseDown', 'unhorsed', 'horseCrash'].includes(e.kind)).length, 0);
  // Friends head-on at a gallop: both go down.
  const head = meet(0, true);
  assert.equal(head.events.filter((e) => e.kind === 'horseDown').length, 2);
  assert.ok(WORLD.mount.crash.alliedFrom > 1 && WORLD.mount.crash.alliedFrom < WORLD.mount.crash.fall);
});

test('a team of horsemen holds its line: no friendly horse crashes in a 3 v 3 charge, whatever the seed', () => {
  for (const seed of [31, 32, 33]) {
    const sides = [...['knight', 'saladin', 'samurai'].map((key) => ({ inputs: rider(key), corner: 'red' })), ...['saber', 'knight', 'saladin'].map((key) => ({ inputs: rider(key), corner: 'blue' }))];
    const w = createWorld(sides, { seed, arena: FIELD });
    advance(w, 25, thinkAll);
    // Two horses with their riders up (loose horses, their riders down, wander where they will).
    const ridden = (e) => e.rider !== undefined && w.events.some((pair) => pair.kind === 'horseCrash' && pair.time === e.time && pair.horse === e.other && pair.rider !== undefined);
    const friendly = w.events.filter((e) => e.kind === 'horseCrash' && e.other !== undefined && w.horses[e.horse].corner === w.horses[e.other].corner && ridden(e));
    assert.equal(friendly.length, 0, `seed ${seed}: friends crashed at ${friendly.map((e) => e.speed.toFixed(1))}`);
  }
});

test('the line of a team of horsemen is spaced for horses: 3 m between them across', () => {
  const w = createWorld([...['knight', 'saladin', 'samurai'].map((key) => ({ inputs: rider(key), corner: 'red' })), { inputs: rider('saber'), corner: 'blue' }], { seed: 1, arena: FIELD });
  const zs = w.horses.filter((h) => h.corner === 'red').map((h) => h.at[1]).sort((a, b) => a - b);
  for (let i = 1; i < zs.length; i += 1) assert.ok(zs[i] - zs[i - 1] >= 2.9, `${zs[i] - zs[i - 1]} m`);
});

test('a rider is harder to unseat: a knock short of the saddle\'s 3.8 m/s does not throw him, a harder one does; a horse going down slowly does not fling him', () => {
  assert.ok(WORLD.mount.seat.speed >= 3.6 && WORLD.mount.seat.speed <= 4.2);
  const knocked = (speed) => {
    const w = world(rider('knight'), footman('yari'));
    w.fighters[1].state = 'out';
    ride(w, w.horses[0], { heading: 0, speed: 6 }, 1);
    const man = w.fighters[0];
    man.knock = [speed, 0, 0];
    advance(w, 1 / 60);
    return man.mount === null;
  };
  assert.equal(knocked(3.4), false, 'a 3.4 m/s knock (a man was thrown by 3.0) he sits');
  assert.equal(knocked(4.6), true);
  // A horse that goes down slowly: he comes off at a share of the speed it had.
  const fall = (speed) => {
    const w = world(rider('samurai'), footman('yari'));
    w.fighters[1].state = 'out';
    const [horse] = w.horses;
    ride(w, horse, { heading: 0, speed }, 3);
    horse.bleed = 1;
    advance(w, 0.05);
    advance(w, 1.2);
    return w.events.find((e) => e.kind === 'unhorsed');
  };
  const slow = fall(2);
  assert.ok(slow && /comes off/.test(slow.effects[0]), slow?.effects[0]);
});

test('on the move the rider rises and falls with the horse: the withers, his seat and his head move together with a bounded bounce, and nothing pops', () => {
  const trot = measure('saber', 'trot', 3.6, 6);
  const gallop = measure('saber', 'gallop', 11, 6);
  const range = (values) => Math.max(...values) - Math.min(...values);
  const jump = (values) => Math.max(...values.slice(1).map((value, index) => Math.abs(value - values[index])));
  // The trot bounces twice a stride: a few cm, more than at a gallop's smooth run.
  assert.ok(range(trot.series.withers) > 0.03 && range(trot.series.withers) < 0.12, `${range(trot.series.withers)}`);
  assert.ok(range(trot.series.withers) > range(gallop.series.withers));
  // His seat and head follow it (the lower back taking some of it), neither the full jolt nor still.
  assert.ok(range(trot.series.pelvis) > 0.008 && range(trot.series.pelvis) < range(trot.series.withers), `hips ${range(trot.series.pelvis)}`);
  assert.ok(range(trot.series.head) < range(trot.series.withers) * 1.2 && range(trot.series.head) > 0.005, `head ${range(trot.series.head)}`);
  // Following: his hips rise when the withers do.
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const a = trot.series.withers.map((value) => value - mean(trot.series.withers));
  const b = trot.series.pelvis.map((value) => value - mean(trot.series.pelvis));
  const energy = (values) => values.reduce((sum, value) => sum + value * value, 0);
  let best = -1;
  for (let lag = 0; lag < 12; lag += 1) {
    let sum = 0;
    for (let i = 0; i + lag < a.length; i += 1) sum += a[i] * b[i + lag];
    best = Math.max(best, sum / Math.sqrt(energy(a) * energy(b)));
  }
  assert.ok(best > 0.6, `correlation ${best.toFixed(2)}`);
  for (const run of [trot, gallop]) for (const key of ['pelvis', 'neck', 'head', 'tip']) assert.ok(jump(run.series[key]) < 0.04, `${key} jumped ${jump(run.series[key])} m in a frame`);
});
