import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { MOVES, STYLES } from '../src/moves.js';
import { advance, createWorld, perform, placeFighter, point, throwPunch, WORLD } from '../src/physics.js';
import { buildCurve, fatCurve, footworkDistance, speedCurve } from '../tools/speed-curve.js';

test('speed peaks at light to middle weight: lighter and heavier are both slower, from the physics alone', () => {
  const curve = speedCurve('jab').map((row) => row.peak);
  const best = curve.indexOf(Math.max(...curve));
  assert.ok(best >= 2 && best <= 5, `fastest class is ${best} of 0–8`);
  assert.ok(curve[0] < curve[best] * 0.97, 'the flyweight is slower');
  assert.ok(curve.at(-1) < curve[best] * 0.94, 'the super-heavyweight is slower still');
});

test('a thin build carries bone it cannot move fast; fat is weight with no force', () => {
  // The skeleton is sized by height and frame, not by the muscle on it: the
  // thin fighter carries the same bones, and they are more of his arm.
  const thin = buildBody({ sex: 'male', heightCm: 178, training: 0, bodyFat: 0.08 });
  const muscular = buildBody({ sex: 'male', heightCm: 178, training: 1, bodyFat: 0.08 });
  assert.equal(thin.boneKg, muscular.boneKg);
  const boneShare = (body) => body.segments.lUpperArm.tissue.bone / body.segments.lUpperArm.mass;
  assert.ok(boneShare(thin) > boneShare(muscular) * 1.15, 'bone is a bigger share of the thin arm');
  const builds = buildCurve('cross').map((row) => row.peak);
  assert.ok(builds[0] < builds[2] * 0.9, `thin ${builds[0].toFixed(2)} vs athletic ${builds[2].toFixed(2)} m/s`);
  const fat = fatCurve('cross').map((row) => row.peak);
  assert.ok(fat.at(-1) < fat[0] * 0.95, 'hands slow with fat');
  const lean = footworkDistance({ sex: 'male', heightCm: 180, training: 0.6, bodyFat: 0.1 });
  const heavy = footworkDistance({ sex: 'male', heightCm: 180, training: 0.6, bodyFat: 0.35 });
  assert.ok(heavy < lean * 0.85, `footwork ${heavy.toFixed(2)} vs ${lean.toFixed(2)} m in half a second`);
});

test('kicks reach the speeds measured in fighters, and peak at the same sizes', () => {
  const curve = speedCurve('roundhouse').map((row) => row.peak);
  assert.ok(Math.max(...curve) > 11 && Math.max(...curve) < 18, `roundhouse foot ${Math.max(...curve).toFixed(1)} m/s`);
  assert.ok(curve.at(-1) < Math.max(...curve), 'the heaviest kick slowest');
});

function charge(chargerPreset, targetPreset) {
  const world = createWorld([PRESETS[chargerPreset], PRESETS[targetPreset]], { seed: 2 });
  placeFighter(world.fighters[0], -1.1);
  placeFighter(world.fighters[1], 1.1);
  advance(world, 0.8);
  const [charger, target] = world.fighters;
  const start = point(target.x, P.pelvis)[0];
  assert.ok(perform(world, charger, 'rush'));
  // The knock: velocity the collision put into each trunk, at its height.
  const knock = { charger: 0, target: 0 };
  for (let frame = 0; frame < 90; frame += 1) {
    advance(world, 1 / 60);
    knock.charger = Math.max(knock.charger, Math.hypot(charger.knock[0], charger.knock[2]));
    knock.target = Math.max(knock.target, Math.hypot(target.knock[0], target.knock[2]));
  }
  const hit = world.events.find((event) => event.kind === 'collision');
  return { world, charger, target, hit, knock, pushed: point(target.x, P.pelvis)[0] - start };
}

test('a charge is a collision of masses: the heavy man drives the light one back; the light one bounces off', () => {
  const big = charge('heavy', 'amateur');
  assert.ok(big.hit, 'the charge landed');
  assert.ok(big.pushed > 0.3, `the amateur was driven back ${big.pushed.toFixed(2)} m`);
  assert.equal(big.target.state, 'down', 'and off his feet');
  assert.equal(big.charger.state, 'up');
  // The same collision the other way round: the lighter body's velocity
  // changes more, by about the ratio of their masses.
  const intoLight = charge('heavy', 'light');
  const intoHeavy = charge('light', 'heavy');
  assert.ok(intoLight.hit && intoHeavy.hit);
  // Knocked over counts as the strongest knock of all.
  const lightKnock = intoLight.target.state === 'down' ? Infinity : intoLight.knock.target;
  assert.ok(lightKnock > intoHeavy.knock.target * 1.3, `light man knocked ${intoLight.target.state === 'down' ? 'over' : `${lightKnock.toFixed(2)} m/s`}, heavyweight ${intoHeavy.knock.target.toFixed(2)} m/s`);
  assert.equal(intoHeavy.target.state, 'up', 'the heavyweight stays up');
  assert.equal(intoLight.charger.state, 'up', 'and a charger who meant to run into a man stays on his feet');
});

function lowKickInto(check) {
  const world = createWorld([{ ...PRESETS.contender, style: 'muayThai' }, PRESETS.light], { seed: 4 });
  placeFighter(world.fighters[0], -0.45);
  placeFighter(world.fighters[1], 0.45);
  advance(world, 0.6);
  const [kicker, target] = world.fighters;
  if (check) perform(world, target, 'check');
  assert.ok(throwPunch(world, kicker, 'lowKick', 'legs'));
  advance(world, 0.8);
  return { event: world.events.find((entry) => entry.punch === 'lowKick'), kicker, target };
}

test('low kicks hurt the leg; a check turns them away and hurts the kicker instead', () => {
  const open = lowKickInto(false);
  assert.ok(open.event, 'the kick connected');
  assert.equal(open.event.kind, 'landed');
  assert.ok(open.target.legDamage.l + open.target.legDamage.r > 0, 'the leg took damage');
  const checked = lowKickInto(true);
  assert.ok(checked.event?.effects.includes('checked'), 'the shin met the check');
  assert.equal(checked.event.kind, 'blocked');
  assert.ok(checked.kicker.legDamage.r > 0, 'and the kicker felt it');
});

test('in the clinch the hands lock behind the neck and hold it', () => {
  const world = createWorld([{ ...PRESETS.heavy, style: 'muayThai' }, PRESETS.light], { seed: 6 });
  placeFighter(world.fighters[0], -0.3);
  placeFighter(world.fighters[1], 0.3);
  advance(world, 0.5);
  const [holder, held] = world.fighters;
  assert.ok(perform(world, holder, 'clinch'), 'the clinch was taken');
  advance(world, 0.8);
  assert.ok(holder.clinch, 'and still held');
  for (const side of ['l', 'r']) {
    const gap = Math.hypot(...point(holder.x, P[`${side}Hand`]).map((value, axis) => value - point(held.x, P.neck)[axis]));
    assert.ok(gap < WORLD.clinch.lockDistance + 0.1, `${side} hand ${gap.toFixed(2)} m from the neck`);
  }
});

test('each style fights with its own moves, chosen by distance: a boxer never kicks; Muay Thai knees and elbows inside, kicks outside', () => {
  // A passive opponent at a fixed distance; count what the style throws.
  const thrown = (style, gap) => {
    const world = createWorld([{ ...PRESETS.light, style }, { ...PRESETS.veteran, style: 'boxing' }], { seed: 9 });
    placeFighter(world.fighters[0], -gap / 2);
    placeFighter(world.fighters[1], gap / 2);
    const types = new Set();
    for (let frame = 0; frame < 60 * 40; frame += 1) {
      const [fighter] = world.fighters;
      fighter.move = 0;
      advance(world, 1 / 60, (current, dt) => {
        thinkAll(current, dt, new Set([1]));
        current.fighters[0].move = 0;
        if (current.fighters[0].punch) types.add(current.fighters[0].punch.type);
      });
      if (fighter.state !== 'up') break;
    }
    return types;
  };
  for (const gap of [0.7, 1.1]) {
    const boxer = thrown('boxing', gap);
    assert.ok(![...boxer].some((type) => MOVES[type].limb?.match(/Foot|Knee|Elbow/)), `boxer at ${gap} m threw ${[...boxer]}`);
  }
  const inside = thrown('muayThai', 0.7);
  assert.ok([...inside].some((type) => MOVES[type].limb?.match(/Knee|Elbow/)), `Muay Thai inside threw ${[...inside]}`);
  const outside = thrown('muayThai', 1.1);
  assert.ok([...outside].some((type) => MOVES[type].limb?.endsWith('Foot')), `Muay Thai outside threw ${[...outside]}`);
  assert.ok(![...outside].some((type) => MOVES[type].reach === 'close'), 'and no close-range strikes from out there');
});
