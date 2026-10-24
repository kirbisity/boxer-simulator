// The run as a runner holds himself (physics.js runHand, carriedTargets, runSwing, heelRise; physics/gait.js; WORLD.runMode):
// legs under him and knees straight fore and aft, arms bent and close, a short weapon at the waist and a spear at the ready;
// the player's speed in proportion to how far the stick is pushed; the run's speed from his body.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { CONTROL, directFighter, keyStick, newOrders } from '../src/control.js';
import { advance, carryKind, createWorld, placeFighter } from '../src/physics.js';
import { gaitBody, jogSpeed, runSpeed } from '../src/physics/gait.js';
import { WEAPONS } from '../src/weapons.js';
import { LEVEL_PRESETS } from '../src/levelmode/presets.js';
import { caloriesForBodyFat } from '../src/physiology.js';

const DEG = 180 / Math.PI;
const at = (fighter, index) => [fighter.x[index * 3], fighter.x[index * 3 + 1], fighter.x[index * 3 + 2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (length(a) * length(b))))) * DEG;

/** A man (a preset of either list) on a wide open floor, a foe far off standing still; `foe` near him instead if asked. */
function field(key, { foe = null } = {}) {
  const inputs = structuredClone(PRESETS[key] ?? LEVEL_PRESETS[key]);
  const world = createWorld([{ inputs, corner: 'red' }, { inputs: structuredClone(PRESETS[foe ?? 'light']), corner: 'blue' }], { seed: 4, arena: { halfX: 80, halfZ: 80 } });
  const [me, him] = world.fighters;
  placeFighter(me, -60, 0);
  placeFighter(him, 60, 70);
  me.yaw = 0;
  const orders = newOrders();
  const step = (seconds, each) => advance(world, seconds, (current, dt) => {
    thinkAll(current, dt, new Set([0, 1]));
    directFighter(current, me, orders, dt);
    each?.(current, dt);
  });
  return { world, me, him, orders, step };
}

/** In his own frame: forward, up, left. */
function local(fighter, offset) {
  const forward = [Math.cos(fighter.yaw), 0, -Math.sin(fighter.yaw)];
  const left = [Math.sin(fighter.yaw), 0, Math.cos(fighter.yaw)];
  return [dot(offset, forward), offset[1], dot(offset, left)];
}

/** The worst of his run's spread over `seconds`: how far a knee, a foot, an elbow and a hand get out from his middle, the arms' abduction, the elbows' bend. */
function spread(game, seconds = 1.5) {
  const worst = { knee: 0, foot: 0, stepWidth: 0, elbow: 0, abduct: 0, elbowLeast: 180, elbowMost: 0 };
  game.step(seconds, () => {
    const me = game.me;
    const pelvis = at(me, P.pelvis);
    for (const side of ['l', 'r']) {
      const sign = side === 'l' ? 1 : -1;
      const out = (index) => sign * local(me, sub(at(me, index), pelvis))[2];
      worst.knee = Math.max(worst.knee, out(P[`${side}Knee`]));
      worst.foot = Math.max(worst.foot, out(P[`${side}Foot`]));
      if (me.weapon?.held && (me.intent.weaponArms ?? []).includes(side)) continue;
      if (me.shield && side === 'l') continue;
      worst.elbow = Math.max(worst.elbow, out(P[`${side}Elbow`]));
      const upper = local(me, sub(at(me, P[`${side}Elbow`]), at(me, P[`${side}Shoulder`])));
      worst.abduct = Math.max(worst.abduct, Math.atan2(sign * upper[2], Math.hypot(upper[0], upper[1])) * DEG);
      const bend = 180 - angle(sub(at(me, P[`${side}Shoulder`]), at(me, P[`${side}Elbow`])), sub(at(me, P[`${side}Hand`]), at(me, P[`${side}Elbow`])));
      worst.elbowLeast = Math.min(worst.elbowLeast, bend);
      worst.elbowMost = Math.max(worst.elbowMost, bend);
    }
    worst.stepWidth = Math.max(worst.stepWidth, Math.abs(local(me, sub(at(me, P.lFoot), at(me, P.rFoot)))[2]));
  });
  return worst;
}

test('the run is not spread wide: knees and feet under him, arms bent and close (sprint and jog, men and a woman, armed and not, the AI\'s run too)', () => {
  const cases = [['light', 1], ['light', 0.75], ['contender', 1], ['heavy', 1], ['samurai', 1], ['forger', 1], ['yari', 1], ['amateur', 0.7]];
  for (const [key, amount] of cases) {
    const game = field(key);
    game.orders.stick = { dir: [1, 0], amount };
    game.step(2.5);
    assert.equal(game.me.runMode, true, `${key}: running`);
    const worst = spread(game);
    const H = game.me.body.heightM;
    const label = `${key} at ${amount}: ${JSON.stringify(Object.fromEntries(Object.entries(worst).map(([name, value]) => [name, +value.toFixed(2)])))}`;
    assert.ok(worst.knee < 0.15, `${label}: a knee no more than 15 cm out from his middle`);
    assert.ok(worst.foot < 0.12, `${label}: a foot no more than 12 cm out`);
    assert.ok(worst.stepWidth < 0.15, `${label}: the step width a runner's`);
    if (worst.elbowMost > 0) {
      assert.ok(worst.elbow < 0.17 * H, `${label}: the elbows by his sides`);
      assert.ok(worst.abduct < 22, `${label}: the arms not out from his sides`);
      assert.ok(worst.elbowLeast > 50 && worst.elbowMost < 130, `${label}: the elbows bent about a right angle, never straight`);
    }
  }
  // The AI's run (no run mode: a man running to his place with no foe near) is the same run.
  const ai = field('light');
  ai.step(0.3);
  ai.step(2.5, (world) => {
    Object.assign(ai.me, { running: true, move: 1, goTo: [ai.me.x[P.pelvis * 3] + 10, 0, ai.me.x[P.pelvis * 3 + 2]] });
  });
  assert.ok(ai.me.runPose > 0.9, 'the AI man is in the run pose');
  const worst = { knee: 0 };
  ai.step(1, () => {
    Object.assign(ai.me, { running: true, move: 1, goTo: [ai.me.x[P.pelvis * 3] + 10, 0, ai.me.x[P.pelvis * 3 + 2]] });
    const pelvis = at(ai.me, P.pelvis);
    for (const [side, sign] of [['l', 1], ['r', -1]]) worst.knee = Math.max(worst.knee, sign * local(ai.me, sub(at(ai.me, P[`${side}Knee`]), pelvis))[2]);
  });
  assert.ok(worst.knee < 0.15, `the AI runner's knees under him (${worst.knee.toFixed(2)} m)`);
});

test('the stick pushed further runs him faster: a slow walk, a walk, a jog, a run, his sprint', () => {
  const speeds = [];
  for (const amount of [0.2, 0.4, CONTROL.stick.fullFrom, CONTROL.stick.runFrom, 0.75, 0.9, 1]) {
    const game = field('forger');
    game.orders.stick = { dir: [1, 0], amount };
    game.step(3);
    const from = at(game.me, P.pelvis)[0];
    game.step(1.5);
    speeds.push({ amount, speed: (at(game.me, P.pelvis)[0] - from) / 1.5, run: game.me.runMode, me: game.me });
  }
  for (let index = 1; index < speeds.length; index += 1) {
    assert.ok(speeds[index].speed > speeds[index - 1].speed + 0.1, `faster further out: ${speeds.map(({ amount, speed }) => `${amount}: ${speed.toFixed(2)}`).join(', ')} m/s`);
  }
  const me = speeds[0].me;
  assert.ok(speeds[0].speed < 0.8, `a slight push is a slow walk (${speeds[0].speed.toFixed(2)} m/s)`);
  assert.equal(speeds[2].run, false, 'the walk is a walk');
  assert.equal(speeds[3].run, true, 'past the threshold, a run');
  assert.ok(Math.abs(speeds[3].speed / jogSpeed(me) - 1) < 0.15, `at the threshold, a jog (${speeds[3].speed.toFixed(2)} against ${jogSpeed(me).toFixed(2)} m/s)`);
  assert.ok(Math.abs(speeds.at(-1).speed / runSpeed(me, true) - 1) < 0.1, `full throw, his sprint (${speeds.at(-1).speed.toFixed(2)} against ${runSpeed(me, true).toFixed(2)} m/s)`);
  // The keys: W a walk at the walk's full pace, Shift his sprint, as before.
  const keys = keyStick(new Set(['w']), { ahead: [1, 0], right: [0, 1] });
  assert.equal(keys.amount, CONTROL.stick.fullFrom);
  assert.equal(keyStick(new Set(['w']), { ahead: [1, 0], right: [0, 1] }, true).amount, 1);
});

test('a jog costs less breath than a sprint', () => {
  const used = (amount) => {
    const game = field('forger');
    game.orders.stick = { dir: [1, 0], amount };
    game.step(4);
    return 1 - game.me.stamina;
  };
  const jog = used(0.7);
  const sprint = used(1);
  assert.ok(jog < sprint * 0.7, `a jog ${jog.toFixed(4)}, a sprint ${sprint.toFixed(4)}`);
});

test('a sword is carried at the waist in a run, and an enemy close by does not stop the run; stopped, it comes up to the guard', () => {
  for (const key of ['samurai', 'forger', 'knight']) {
    const game = field(key, { foe: 'heavy' });
    const { me, him } = game;
    assert.equal(carryKind(me.weapon.spec), 'waist', `${key}: ${me.weapon.spec.label} is carried at the waist`);
    // The enemy stands 0.9 m beside the line he runs, 5 m on.
    placeFighter(him, -54, 0.9);
    him.yaw = Math.PI;
    game.orders.stick = { dir: [1, 0], amount: 1 };
    let stopped = false;
    let worstHand = -Infinity;
    let worstTip = -Infinity;
    let nearest = Infinity;
    game.step(2.2, () => {
      if (!me.runMode) stopped = true;
      const pelvis = at(me, P.pelvis);
      nearest = Math.min(nearest, Math.hypot(him.x[P.pelvis * 3] - pelvis[0], him.x[P.pelvis * 3 + 2] - pelvis[2]));
      if (me.runPose > 0.9) {
        const hand = at(me, P[`${me.weapon.main}Hand`]);
        worstHand = Math.max(worstHand, hand[1] - pelvis[1]);
        worstTip = Math.max(worstTip, me.weapon.tip[1] - hand[1]);
      }
    });
    assert.ok(nearest < 1.3, `${key}: he passed the enemy (${nearest.toFixed(2)} m)`);
    assert.equal(stopped, false, `${key}: the run went on past the enemy`);
    assert.ok(Math.abs(Math.sin(me.yaw)) < 0.2, `${key}: still facing his way, not turned to the enemy`);
    assert.ok(worstHand < 0.08, `${key}: the sword hand at the waist (${worstHand.toFixed(2)} m above the hips at most)`);
    assert.ok(worstTip < -0.2, `${key}: the blade down along the thigh (tip ${worstTip.toFixed(2)} m from the hand)`);
    if (me.weapon.spec.hands !== 'one') assert.equal(me.intent.twoHanded, false, `${key}: a two-hander carried in the one hand`);
    // Let go of the stick: he stops, and the weapon comes up to the guard.
    const hand = () => at(me, P[`${me.weapon.main}Hand`])[1] - at(me, P.pelvis)[1];
    const low = hand();
    game.orders.stick = null;
    game.step(1.5);
    assert.equal(me.runMode, false);
    assert.ok(me.runPose < 0.05, `${key}: out of the run pose`);
    assert.ok(hand() > low + 0.1, `${key}: the weapon up in the guard (${low.toFixed(2)} → ${hand().toFixed(2)} m over the hips)`);
  }
});

test('a spear is carried at the ready in a run: forward and up, the butt behind him, steady', () => {
  for (const key of ['yari', 'mingSpear', 'naginata']) {
    const game = field(key);
    const { me } = game;
    assert.equal(carryKind(me.weapon.spec), 'pole');
    game.orders.stick = { dir: [1, 0], amount: 1 };
    game.step(2.5);
    const rise = [];
    game.step(1, () => {
      const dir = local(me, me.weapon.dir);
      rise.push(Math.atan2(dir[1], Math.hypot(dir[0], dir[2])) * DEG);
      assert.ok(dir[0] > 0.6, `${key}: the point forward (${dir.map((value) => value.toFixed(2))})`);
    });
    const least = Math.min(...rise);
    const most = Math.max(...rise);
    assert.ok(least > 15 && most < 45, `${key}: the shaft ${least.toFixed(0)}-${most.toFixed(0)} degrees up`);
    assert.ok(most - least < 12, `${key}: it rides steady, not swung with the stride`);
    const pelvis = at(me, P.pelvis);
    const hand = at(me, P[`${me.weapon.main}Hand`]);
    const butt = sub(hand, me.weapon.dir.map((value) => value * me.weapon.spec.handle));
    assert.ok(local(me, sub(butt, pelvis))[0] < 0.1, `${key}: the butt at or behind his hips`);
  }
});

test('how weapons are carried: short ones at the waist, polearms at the ready, long guns, flags and the heaviest two-handers on the shoulder', () => {
  const kinds = Object.fromEntries(['katana', 'armingSword', 'longsword', 'dagger', 'gladius', 'saber', 'pistol', 'bat', 'yari', 'naginata', 'spear', 'staff', 'trident', 'matchlock', 'banner', 'odachi', 'kanabo', 'yumi', 'compositeBow'].map((kind) => [kind, carryKind(WEAPONS[kind])]));
  assert.deepEqual(kinds, {
    katana: 'waist', armingSword: 'waist', longsword: 'waist', dagger: 'waist', gladius: 'waist', saber: 'waist', pistol: 'waist', bat: 'waist',
    yari: 'pole', naginata: 'pole', spear: 'pole', staff: 'pole', trident: 'pole',
    matchlock: 'shoulder', banner: 'shoulder', odachi: 'shoulder', kanabo: 'shoulder', yumi: 'shoulder', compositeBow: 'waist',
  });
});

test('his run is his legs\': more leg muscle runs faster, more fat or a heavier frame on the same legs slower', () => {
  // (Each fed to the same share of fat: what differs is the muscle the training has put on him, or the fat on the same muscle.)
  const at = (exercise, fat) => {
    const inputs = { ...structuredClone(PRESETS.amateur), exercise };
    return gaitBody(buildBody({ ...inputs, calories: caloriesForBodyFat(inputs, fat) })).top;
  };
  const trained = at(0.9, 0.15);
  const idle = at(0.1, 0.15);
  assert.ok(trained > idle * 1.1, `trained ${trained.toFixed(2)} against idle ${idle.toFixed(2)} m/s`);
  const fat = at(0.5, 0.35);
  const lean = at(0.5, 0.15);
  assert.ok(fat < lean * 0.95, `more fat: ${fat.toFixed(2)} against ${lean.toFixed(2)} m/s`);
});
