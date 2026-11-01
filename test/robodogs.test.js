// The robot dogs (src/robotdogs.js) as machines on their own legs: their electrics shorting out when a leg is cut off or
// they go down, how fast they run and turn, their jump, the Vision 60's turret laid by its motors, and its recoil.
import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { advance, createWorld, startJump } from '../src/physics.js';
import { fire } from '../src/physics/ranged.js';
import { harmHorse, ladenMass, mountJump, mountJumpBlocked, mountJumpLead, placeMounted } from '../src/physics/mounted.js';
import { MACHINE_FX, machineFxCreate, machineFxFor, machineFxHear } from '../src/machinefx.js';
import { ROBOT_DOGS } from '../src/robotdogs.js';
import { cartridgeRecoil, RIFLE, TURRET_RIFLE, WEAPONS } from '../src/weapons.js';

const DOGS = ['dogGo2', 'dogSpot', 'dogVision60'];

/** A robot dog and a man far off (or at `apart` m), on open ground. */
function field(key, { apart = 60, foe = 'street', seed = 1 } = {}) {
  const world = createWorld([{ inputs: structuredClone(PRESETS[key]), corner: 'red' }, { inputs: structuredClone(PRESETS[foe]), corner: 'blue' }], { seed, arena: { halfX: 40, halfZ: 40 } });
  const [core, man] = world.fighters;
  placeMounted(core, -apart / 2, 0, 0);
  shift(man, apart / 2 - man.x[P.pelvis * 3], -man.x[P.pelvis * 3 + 2]);
  return { world, core, man, horse: core.mount };
}

/** A man moved bodily (his particles and their last places together: no speed given him). */
function shift(fighter, dx, dz) {
  for (let index = 0; index < fighter.x.length; index += 3) {
    fighter.x[index] += dx;
    fighter.prev[index] += dx;
    fighter.x[index + 2] += dz;
    fighter.prev[index + 2] += dz;
  }
  fighter.root[0] += dx;
  fighter.root[1] += dz;
}

const hold = (horse, heading, speed) => {
  horse.goal = { heading, speed };
  horse.goalAt = Infinity;
};
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const heard = (world, type) => (world.sounds ?? []).slice(0, world.soundsCount ?? 0).filter((sound) => sound.type === type);

test('a robot dog\'s leg cut off at the hip shorts out there, and it goes down; down, it shorts out through its own body (robotSpark)', () => {
  const { world, core, horse } = field('dogVision60');
  world.ear = { x: 0, z: 0, radius: 200 };
  const store = machineFxCreate();
  const leg = horse.capsules.find((capsule) => capsule.key === 'lFore');
  const event = { time: 0, kind: 'horseHit', normal: [0, 0, 1], effects: [] };
  harmHorse(world, horse, leg, { blunt: 0, cut: horse.spec.harm.legSever * 0.9, pierce: 0 }, event);
  assert.ok(!horse.severed, 'short of its sever: no leg off');
  harmHorse(world, horse, leg, { blunt: 0, cut: horse.spec.harm.legSever * 1.2, pierce: 0 }, event);
  const cut = world.events.find((each) => each.kind === 'legSevered');
  assert.ok(cut && cut.leg === 'lFore' && cut.fighter === core.id, 'the leg cut off, told for what rides it');
  assert.ok(!horse.capsules.some((capsule) => capsule.key === 'lFore'), 'nothing left of it to strike');
  assert.equal(world.debris[cut.debris].kind, 'dogLeg', 'the piece thrown off');
  assert.equal(horse.state, 'falling', 'on three legs it goes down');
  // The stump shorts out at the hip, heard there.
  assert.equal(machineFxFor(cut, core), 'stump');
  const stump = machineFxHear(store, cut, world, 0);
  assert.equal(stump.leg, 'lFore');
  const sparks = heard(world, MACHINE_FX.sound);
  assert.equal(sparks.length, 1);
  assert.deepEqual([sparks[0].kind, Math.round(sparks[0].x * 100), Math.round(sparks[0].z * 100)], ['stump', Math.round(cut.point[0] * 100), Math.round(cut.point[2] * 100)]);
  // Down, what it carries is out ('disabled'): the robot shorts out once, in its own body (its chest, not the turret on top).
  advance(world, 0.3, () => {});
  const down = world.events.find((each) => each.kind === 'disabled');
  assert.ok(down, 'the robot down puts what it carries out');
  assert.equal(machineFxFor(down, core), 'death');
  assert.ok(machineFxHear(store, down, world, 0.3));
  assert.equal(machineFxHear(store, down, world, 0.4), null, 'once');
  const death = heard(world, MACHINE_FX.sound).find((sound) => sound.kind === 'death');
  const chest = horse.capsules.find((capsule) => capsule.key === 'chest');
  assert.ok(Math.abs(death.y - (chest.a[1] + chest.b[1]) / 2) < 0.05, 'heard from its body');
  // A horse's leg is never cut off (it breaks): only a machine's.
  const ride = createWorld([{ inputs: { ...structuredClone(PRESETS.knight), mounted: true }, corner: 'red' }, { inputs: structuredClone(PRESETS.street), corner: 'blue' }], { seed: 2, arena: { halfX: 30, halfZ: 30 } });
  const mare = ride.fighters[0].mount;
  harmHorse(ride, mare, mare.capsules.find((capsule) => capsule.key === 'rHind'), { blunt: 0, cut: 5000, pierce: 0 }, { effects: [] });
  assert.ok(!mare.severed && mare.lame);
});

test('robot dogs run as fast as the real ones and turn far quicker than they did: their feet\'s grip, a top yaw rate and its twist', () => {
  const top = {};
  for (const key of DOGS) {
    const { world, horse } = field(key);
    const spec = horse.spec;
    assert.ok(Math.abs(spec.lateral - spec.grip * 9.81) < 1e-9 && spec.yawAccel > 20, `${key}: the turn from its feet`);
    hold(horse, 0, 99);
    let fastest = 0;
    for (let step = 0; step < 300; step += 1) {
      advance(world, 1 / 60);
      fastest = Math.max(fastest, horse.speed);
    }
    top[key] = fastest;
    // On the spot, an about-face: the yaw rate never past its controller's top, changed no faster than its twist allows.
    placeMounted(world.fighters[0], -20, 0, 0);
    hold(horse, Math.PI - 1e-3, 0);
    let seconds = null;
    let before = horse.yawRate;
    for (let step = 0; step < 300 && seconds === null; step += 1) {
      advance(world, 1 / 60);
      assert.ok(Math.abs(horse.yawRate) <= spec.spin + 1e-9, 'within its top yaw rate');
      assert.ok(Math.abs(horse.yawRate - before) <= spec.yawAccel / 60 + 1e-6, 'its turn eased in and out');
      before = horse.yawRate;
      if (Math.abs(wrap(horse.yaw - Math.PI)) < 0.05) seconds = (step + 1) / 60;
    }
    assert.ok(seconds !== null && seconds < Math.PI / spec.spin + 0.35, `${key}: about-face in ${seconds} s`);
    top[`${key}Turn`] = seconds;
  }
  assert.ok(top.dogGo2 > 3.5 && top.dogGo2 < 5, `Go2 ${top.dogGo2.toFixed(2)} m/s (real: 3.5-5)`);
  assert.ok(top.dogSpot <= 1.6 && top.dogSpot > 1.3, `Spot ${top.dogSpot.toFixed(2)} m/s (real: 1.6 at most)`);
  assert.ok(top.dogVision60 > 2.5 && top.dogVision60 <= 3.3, `Vision 60 ${top.dogVision60.toFixed(2)} m/s laden (real: ~3)`);
  // Turning on the spot, 2-4.5 rad/s: an about-face in well under a second and a half (it took 1.5-2.8 s).
  for (const key of DOGS) assert.ok(ROBOT_DOGS[PRESETS[key].outfit.kind.replace('Dog', '')].spin >= 2 && top[`${key}Turn`] < 1.7, key);
  assert.ok(top.dogGo2Turn < 0.8, `Go2 about-face ${top.dogGo2Turn} s`);
});

test('a robot dog jumps on its legs\' motors: the Go2 ~0.5 m up and ~1 m in a leap, the heavier dogs less; it lands, and cannot jump again at once', () => {
  const jumpOf = (key, kind) => {
    const { world, core, horse } = field(key);
    hold(horse, 0, 0);
    advance(world, 0.3);
    assert.equal(mountJumpBlocked(world, horse), null);
    assert.ok(mountJump(world, horse, { kind }));
    assert.ok(!mountJump(world, horse, { kind }), 'not twice at once');
    let height = 0;
    let seatTop = 0;
    const seat = core.x[P.pelvis * 3 + 1];
    for (let step = 0; step < 120 && !world.events.some((each) => each.kind === 'touchdown'); step += 1) {
      advance(world, 1 / 60);
      height = Math.max(height, horse.lift ?? 0);
      seatTop = Math.max(seatTop, core.x[P.pelvis * 3 + 1] - seat);
    }
    const landed = world.events.find((each) => each.kind === 'touchdown');
    assert.ok(landed && world.events.some((each) => each.kind === 'jump' && each.horse === horse.id), 'off and down again');
    assert.ok(Math.abs(seatTop - height) < 0.03, 'what it carries goes up with it');
    advance(world, 0.3);
    assert.ok(!horse.air && Math.abs(horse.lift) < 1e-9, 'landed and standing');
    assert.equal(mountJumpBlocked(world, horse), 'recovering', 'its legs back under it first');
    return { height, distance: landed.distance, ratio: landed.ratio };
  };
  const go2 = { up: jumpOf('dogGo2', 'up'), leap: jumpOf('dogGo2', 'leap') };
  assert.ok(go2.up.height > 0.4 && go2.up.height < 0.65, `Go2 up ${go2.up.height.toFixed(2)} m`);
  assert.ok(go2.leap.distance > 0.75 && go2.leap.distance < 1.25, `Go2 leap ${go2.leap.distance.toFixed(2)} m`);
  assert.ok(go2.up.ratio < 1, 'a landing on the level its legs take easily');
  const heavy = { spot: jumpOf('dogSpot', 'up'), vision60: jumpOf('dogVision60', 'up') };
  assert.ok(heavy.spot.height < go2.up.height && heavy.vision60.height < go2.up.height && heavy.spot.height > 0.15, 'heavier and slower-legged, lower');
  // The man playing it: the jump button (startJump) jumps the robot.
  const { world, core, horse } = field('dogGo2');
  hold(horse, 0, 0);
  advance(world, 0.3);
  assert.ok(startJump(world, core) && horse.air, 'the player\'s jump is the robot\'s');
});

test('a robot dog jumps a low wall it can clear rather than pulling up for it; a high one it pulls up for', () => {
  const run = (height) => {
    const world = createWorld([{ inputs: structuredClone(PRESETS.dogGo2), corner: 'red' }, { inputs: structuredClone(PRESETS.street), corner: 'blue' }], { seed: 1, arena: { halfX: 30, halfZ: 30, works: { walls: [{ points: [[0, -10], [0, 10]], height, kind: 'wood' }] } } });
    const [core, man] = world.fighters;
    placeMounted(core, -6, 0, 0);
    shift(man, 20 - man.x[P.pelvis * 3], 15 - man.x[P.pelvis * 3 + 2]);
    const horse = core.mount;
    hold(horse, 0, 99);
    let jumped = false;
    for (let step = 0; step < 240; step += 1) {
      // (Its rider's part, riding.js robotJumps: a hurdle within its jump's lead, it jumps, at a run keeping its run.)
      if (horse.hurdle && horse.hurdle.distance <= mountJumpLead(world, horse) && !horse.air) jumped = mountJump(world, horse, { kind: 'up' }) || jumped;
      advance(world, 1 / 60);
    }
    return { jumped, past: horse.at[0] > 1 };
  };
  const low = run(0.2);
  assert.ok(low.jumped && low.past, 'over the low wall');
  const high = run(1.8);
  assert.ok(!high.jumped && !high.past, 'stopped short of the palisade');
});

test('the turret is laid by its motors: never faster than it slews, its angles its own (no wrap round), nothing of the hidden arm in it', () => {
  const { world, core, man, horse } = field('dogVision60', { apart: 8 });
  const spec = WEAPONS.turretRifle.turret;
  hold(horse, 0, 0);
  core.aimAt = man.id;
  advance(world, 0.5);
  let last = null;
  let crossed = 0;
  // The man walked round the robot, twice, through behind it (where its pan stops either side meet).
  for (let step = 0; step < 60 * 10; step += 1) {
    const angle = (step / 600) * Math.PI * 4;
    const want = [Math.cos(angle) * 6 + horse.at[0], Math.sin(angle) * 6 + horse.at[1]];
    shift(man, want[0] - man.x[P.pelvis * 3], want[1] - man.x[P.pelvis * 3 + 2]);
    core.aimAt = man.id;
    advance(world, 1 / 60);
    const turret = core.weapon.turret;
    assert.ok(Math.abs(turret.pan) <= spec.pan + 1e-9 && turret.tilt >= spec.tilt[0] - 1e-9 && turret.tilt <= spec.tilt[1] + 1e-9, 'within its stops');
    if (last) {
      assert.ok(Math.abs(turret.pan - last.pan) <= (spec.slew / 60) * 1.0001, `pan ${(turret.pan - last.pan).toFixed(4)} in a step`);
      assert.ok(Math.abs(turret.tilt - last.tilt) <= (spec.slew / 60) * 1.0001, 'tilt as smooth');
      assert.ok(Math.abs(turret.panV - last.panV) <= (spec.accel / 60) * 1.0001 || Math.abs(turret.pan) >= spec.pan - 1e-9, `its rate eased (${turret.panV.toFixed(3)} from ${last.panV.toFixed(3)} at ${turret.pan.toFixed(3)})`);
      if (Math.sign(turret.panWanted) !== Math.sign(last.panWanted) && Math.abs(turret.panWanted) > 2) crossed += 1;
      // The barrel's line in the world never jumps (the robot stands; no kick here).
      const turn = Math.acos(Math.min(1, core.weapon.dir.reduce((sum, value, axis) => sum + value * last.dir[axis], 0)));
      assert.ok(turn <= (spec.slew / 60) * Math.SQRT2 * 1.01, `the barrel turned ${turn.toFixed(4)} rad in a step`);
    }
    // The receiver (the rider's gun hand) held on the trunnion.
    const hand = [core.x[P.rHand * 3], core.x[P.rHand * 3 + 1], core.x[P.rHand * 3 + 2]];
    const off = hand.map((value, axis) => value - turret.receiver[axis]);
    assert.ok(Math.hypot(...off) < 1e-6, 'the hand on the receiver');
    last = { pan: turret.pan, tilt: turret.tilt, panV: turret.panV, panWanted: turret.panWanted, dir: [...core.weapon.dir] };
  }
  assert.ok(crossed >= 1, 'the man went round behind it');
  // Standing still, the man still: it lies on him.
  shift(man, horse.at[0] + 7 - man.x[P.pelvis * 3], horse.at[1] + 2 - man.x[P.pelvis * 3 + 2]);
  for (let step = 0; step < 90; step += 1) {
    core.aimAt = man.id;
    advance(world, 1 / 60);
  }
  const mark = core.weapon.turretMark;
  const toMark = mark.map((value, axis) => value - core.weapon.turret.receiver[axis]);
  const length = Math.hypot(...toMark);
  assert.ok(toMark.reduce((sum, value, axis) => sum + (value / length) * core.weapon.dir[axis], 0) > Math.cos(spec.lay), 'laid on him');
});

test('its recoil is the 6.5 Creedmoor\'s, physically: the muzzle climbs on the cradle, the robot is pushed back and rocked, and both settle', () => {
  assert.ok(Math.abs(TURRET_RIFLE.recoil - cartridgeRecoil({ bulletKg: 0.00907, muzzle: 813, chargeKg: 0.00266, gasShare: 0.75 })) < 1e-9);
  assert.ok(TURRET_RIFLE.recoil > 9 && TURRET_RIFLE.recoil < 12, `${TURRET_RIFLE.recoil.toFixed(2)} N·s`);
  assert.ok(TURRET_RIFLE.recoil > 1.8 * RIFLE.recoil, 'about twice the AR-15\'s kick');
  assert.ok(TURRET_RIFLE.spread < RIFLE.spread * 0.8 && TURRET_RIFLE.spread > RIFLE.spread * 0.7, 'a quarter tighter');
  const { world, core, man, horse } = field('dogVision60', { apart: 10, foe: 'passive' });
  hold(horse, 0, 0);
  for (let step = 0; step < 60; step += 1) {
    core.aimAt = man.id;
    advance(world, 1 / 60);
  }
  const spec = WEAPONS.turretRifle.turret;
  const turret = core.weapon.turret;
  const before = { climbV: turret.climbV, shove: [...horse.shove], pitchV: horse.kick?.pitchV ?? 0 };
  core.weapon.loaded = true;
  fire(world, core, core.weapon, [man.x[P.pelvis * 3], 1.2, man.x[P.pelvis * 3 + 2]], man.id);
  assert.ok(world.events.some((each) => each.kind === 'shot'), 'fired');
  const J = TURRET_RIFLE.recoil;
  assert.ok(Math.abs(turret.climbV - before.climbV - (J * spec.bore) / spec.inertia) < 1e-9, 'the muzzle thrown up: J × bore / inertia');
  const pushed = Math.hypot(horse.shove[0] - before.shove[0], horse.shove[1] - before.shove[1]);
  const flat = Math.hypot(core.weapon.dir[0], core.weapon.dir[2]);
  assert.ok(Math.abs(pushed - (J * flat) / ladenMass(world, horse)) < 1e-9, `the robot pushed back ${pushed.toFixed(3)} m/s`);
  assert.ok(horse.kick.pitchV - before.pitchV > 0, 'firing ahead, it rocks nose up');
  let climb = 0;
  let pitch = 0;
  for (let step = 0; step < 15; step += 1) {
    advance(world, 1 / 60);
    climb = Math.max(climb, turret.climb);
    pitch = Math.max(pitch, horse.kick.pitch);
  }
  assert.ok(climb > 0.005 && climb < 0.04, `muzzle climb ${(climb * 57.3).toFixed(2)}°`);
  assert.ok(pitch > 0.003 && pitch < 0.04, `body rock ${(pitch * 57.3).toFixed(2)}°`);
  advance(world, 0.5);
  assert.ok(Math.abs(turret.climb) < 0.1 * climb && Math.abs(horse.kick.pitch) < 0.15 * pitch, 'rung down within half a second');
});
