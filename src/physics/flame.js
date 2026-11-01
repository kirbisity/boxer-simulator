// The flamethrower's fire (weapons.js FLAMER, moves.js STYLES.flamethrower; drawn by flameview.js, heard by audio/flamesound.js).
// Removing it is this file, those three entries and the hooks that name `flame`.
//
// The trigger held (the automatic fire of physics.js), each "round" opens the valve a tenth of a second longer (`flamePulse`). While it is
// open, lumps of thickened fuel leave the nozzle (`FLAME.blobs` a second, pooled, capped) aimed up for the range (`aimJet`: gravity and
// the air's drag solved for the mark), and fly under gravity. A lump that meets a man (the line from his feet to his head, `radius`)
// leaves part of its fuel on him, the rest at his feet; one that meets a horse or a robot dog (its capsules), the same on it; one that
// meets the floor leaves a burning patch there (merged with one near).
//
// A man with fuel on him, or whose clothes caught from a patch underfoot, burns (`fighter.burning`): heat 0..1 by the fuel on him
// (plate over most of him keeps most of it off), harm a share of each part's injury capacity a second through physics.js addDamage (the
// trunk's mark kills, as any injury does), a cry every second or so. Caught well alight, a man drops and rolls (the drilled more often:
// rolling smothers it `roll` times as fast, rolled by pushes side to side) or panics and runs (`burning.running`: ai.js runs him from
// it), letting go of his weapon. Water under him puts it out faster. A man on fire, a man burning near him, or the stream going past
// frightens him (`flameFright`, read by ai.js shockFear: fear as any other, so men break and run from it).
//
// A machine (a robot, a robot dog) has no flesh to burn and nothing to fear: the fuel on it burns off all the same, and what of the
// fire's heat goes into it warms it (`heatC`, K over the air, by its mass's heat capacity). A burst it shrugs off; kept burning, it
// overheats past its cut-outs' limit and stops (FLAME.machine). A horse burns as a man's trunk does, against its own limit.

import { soundVoice } from '../audio/log.js';
import { surfaceAt } from '../audio/surface.js';
import { BODY, buildBody, P } from '../body.js';
import { OUTFITS } from '../outfits.js';
import { addDamage, dropWeapon, fall, knockOut, point, toWorld } from '../physics.js';
import { vec } from '../pose.js';
import { WORLD } from './config.js';
import { bringDown } from './mounted.js';
import { floorAt } from './terrain.js';

export const FLAME = {
  // The jet (the M2-2): thickened fuel leaves the nozzle at `speed` m/s, `flow` kg/s (its two tanks' ~18 L, ~14.4 kg of thickened
  // petrol at ~0.8 kg/L, in ~8 s: weapons.js FLAMER), drawn as `blobs` lumps a second, slowed by the air (`drag`, 1/s: the rope of
  // fuel breaking up as it goes): ~38 m at its best angle (`bestAngle` rad), ~21 m aimed nearly flat; `jitter` rad of wander; a lump
  // burns out in the air after `life` s (longer than the longest arc's flight). At most `maxBlobs` in flight.
  speed: 26, flow: 1.8, blobs: 50, drag: 0.35, bestAngle: 0.62, jitter: 0.025, life: 3.5, maxBlobs: 260,
  // A man is struck within `radius` m of the line from his feet to his head (ahead of a shooter's own nozzle after `clear` s of flight);
  // `stick` of the lump stays on him (thickened fuel clings), the rest falls at his feet.
  radius: 0.26, clear: 0.2, stick: 0.5,
  // A patch on the floor: burns its fuel at `burn` kg/s (`wet` times faster spread thin on water or mud), lumps within `merge` m join it,
  // its flames reach `reach` m round it (and more as it holds more fuel, to `reachMost`). At most `most`, the oldest put out first.
  patch: { burn: 0.035, wet: 1.6, merge: 0.6, reach: 0.35, reachMost: 0.8, most: 80 },
  man: {
    // The fuel on him burns off at `burn` kg/s (a pool fire's ~0.05 kg/m²·s over the ~0.5 m² of him alight); `cover` kg of it wraps
    // him (full heat). His clothes, once caught, burn `clothes` s at `clothesHeat`. Plate over most of him (a cutProof kit) keeps
    // `plate` of the heat off.
    burn: 0.025, cover: 0.3, clothes: 4, clothesHeat: 0.5, plate: 0.6,
    // The harm at full heat: a share of the part's injury capacity a second (physics.js addDamage; 2.5 of the trunk's kills).
    trunk: 0.14, limbs: 0.08, head: 0.06,
    // Alight past `catchFrom` (heat), he reacts once: drops and rolls (`rollShare` from the least skilled to the best), down `rollSeconds`
    // s, pushed over each `rollEvery` s by `rollPush` N·s; or runs. Rolling puts it out `roll` times as fast, water `wet` times.
    catchFrom: 0.25, rollShare: [0.2, 0.75], rollSeconds: 3, rollEvery: 0.45, rollPush: 9, roll: 3, wet: 4,
    // A cry every `cryEvery` s while he burns.
    cryEvery: 1.6,
  },
  // A machine: of the fire's heat (`fuelHeat` J a kg of fuel burned), `absorbed` goes into it (the rest goes up with the flame); its
  // body holds `specificHeat` J/kg·K (aluminium, steel, plastic) and sheds `cooling` W/K to the air. Past `limit` K over the air its
  // motors' and battery's thermal cut-outs stop it. Standing in a burning patch heats it at `patch` of full.
  machine: { fuelHeat: 43e6, absorbed: 0.05, specificHeat: 900, cooling: 15, limit: 60, patch: 0.3 },
  // Fear: himself on fire, `self`; a man burning within `near` m, up to `nearby`; the stream (another side's) within `stream` m,
  // `passing`. It fades with a half-life of `halfLife` s.
  fright: { self: 1, nearby: 0.4, near: 8, passing: 0.5, stream: 2, halfLife: 3 },
  // The full tanks on his back (kg: the M2-2's ~32 kg less its wand); `keptKg` of his own kit kept on under them (helmet, plate
  // carrier and plates; a rifleman's magazines and the rest of his fighting load left behind). His sidearm (a style): a pistol.
  tanksKg: 30, keptKg: 12, sidearm: 'handgun',
};

const BURNED_LIMBS = ['lUpperArm', 'rUpperArm', 'lThigh', 'rThigh', 'lShank', 'rShank'];

/** The fire's state on the world, made when first wanted. */
function flameStateOf(world) {
  return (world.flame ??= { blobs: [], free: [], patches: [], valves: new Map() });
}

/**
 * A man to carry the flamethrower: his kit's weight cut to what he keeps on under the tanks (FLAME.keptKg) and the full tanks
 * added, carried on his back (`packKg`: body.js, a load that costs him wind), a pistol for his sidearm.
 */
export function withTanks(inputs) {
  const own = buildBody({ ...inputs, outfit: { ...inputs.outfit, extraMass: 0 } }).bodyMassKg;
  const base = inputs.outfit?.extraMass ?? OUTFITS[inputs.outfit?.kind]?.extraMass ?? 0;
  const kept = Math.min(base, FLAME.keptKg / own);
  return { ...inputs, sidearm: inputs.sidearm ?? FLAME.sidearm, outfit: { ...inputs.outfit, extraMass: kept + FLAME.tanksKg / own, packKg: FLAME.tanksKg } };
}

/**
 * The elevation (rad) to put a jet leaving at `speed` with linear `drag` onto a mark `distance` m off and `rise` m above: the lower of the
 * two arcs, by bisection on the closed-form flight; the best angle when it is out of reach.
 */
export function aimJet(distance, rise, speed = FLAME.speed, drag = FLAME.drag, gravity = WORLD.gravity) {
  const heightAt = (angle) => {
    const across = speed * Math.cos(angle);
    const share = (distance * drag) / across;
    if (share >= 1) return -Infinity;
    const t = -Math.log(1 - share) / drag;
    return ((speed * Math.sin(angle) + gravity / drag) * distance) / across - (gravity * t) / drag;
  };
  const most = FLAME.bestAngle;
  if (heightAt(most) < rise) return most;
  let low = -0.6;
  let high = most;
  for (let pass = 0; pass < 22; pass += 1) {
    const middle = (low + high) / 2;
    if (heightAt(middle) < rise) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** The trigger held one more round: the valve open another 1/rate s (from fire(), physics/ranged.js), the jet's push back in his hands. */
export function flamePulse(world, fighter, weapon) {
  const flame = flameStateOf(world);
  const rate = weapon.spec.shot.automatic?.rate ?? 10;
  let valve = flame.valves.get(fighter.id);
  if (!valve) flame.valves.set(fighter.id, (valve = { until: -Infinity, open: false, burst: 0, carry: 0, at: [0, 0, 0] }));
  if (!(valve.until > world.time)) valve.burst += 1;
  valve.until = world.time + 1 / rate + 0.02;
  const hand = P[`${weapon.main}Hand`];
  world.pendingImpulses.push({ fighter, shares: [[hand, 1], [P[`${weapon.main}Elbow`], 0.5], [P[`${weapon.main}Shoulder`], 0.9]], direction: vec.scale(weapon.dir, -1), impulse: (FLAME.flow * FLAME.speed) / rate });
}

/** The fire, each step: the jets, the lumps in flight, the patches, what burns (men, machines, horses), and the fear of it. */
export function stepFlame(world, dt) {
  const flame = world.flame;
  for (const [id, valve] of flame.valves) {
    const fighter = world.fighters[id];
    valve.open = valve.until > world.time && Boolean(fighter?.weapon?.held && fighter.weapon.spec.shot?.flame) && fighter.state === 'up';
    if (valve.open) emitJet(world, flame, fighter, valve, dt);
  }
  if (flame.blobs.length) flyFuel(world, flame, dt);
  if (flame.patches.length) burnFirePatches(world, flame, dt);
  for (const fighter of world.fighters) {
    if (fighter.burning?.machine || fighter.heatC > 0) burnOnMachine(world, fighter, dt);
    else if (fighter.burning) burnOnMan(world, fighter, dt);
  }
  for (const horse of world.horses ?? []) if (horse.burning || horse.heatC > 0) burnOnHorse(world, horse, dt);
  frightenOfFire(world, flame, dt);
}

/** Lumps out of the nozzle this step, aimed up for the range to his mark. */
function emitJet(world, flame, fighter, valve, dt) {
  const weapon = fighter.weapon;
  const random = world.random;
  const muzzle = vec.add(point(fighter.x, P[`${weapon.main}Hand`]), vec.scale(weapon.dir, weapon.spec.muzzle[0]));
  valve.at = muzzle;
  // His mark: the blow's aim while he holds the trigger; else the man he has his weapon on (his trunk); else straight on.
  const on = fighter.aimAt === undefined ? null : world.fighters[fighter.aimAt];
  const mark = fighter.punch?.aim ? toWorld(fighter, fighter.punch.aim) : on ? vec.lerp(point(on.x, P.pelvis), point(on.x, P.neck), 0.5) : vec.add(muzzle, vec.scale(weapon.dir, 10));
  const flat = [mark[0] - muzzle[0], mark[2] - muzzle[2]];
  const distance = Math.max(0.5, Math.hypot(flat[0], flat[1]));
  const angle = aimJet(distance, mark[1] - muzzle[1]);
  valve.carry += FLAME.blobs * dt;
  while (valve.carry >= 1) {
    valve.carry -= 1;
    if (flame.blobs.length >= FLAME.maxBlobs) continue;
    const yaw = Math.atan2(flat[1], flat[0]) + (random() - 0.5) * 2 * FLAME.jitter;
    const pitch = angle + (random() - 0.5) * 2 * FLAME.jitter;
    const speed = FLAME.speed * (0.96 + random() * 0.08);
    const blob = flame.free.pop() ?? { x: [0, 0, 0], v: [0, 0, 0], fuel: 0, age: 0, owner: 0, corner: '' };
    blob.v[0] = Math.cos(pitch) * Math.cos(yaw) * speed;
    blob.v[1] = Math.sin(pitch) * speed;
    blob.v[2] = Math.cos(pitch) * Math.sin(yaw) * speed;
    // Spread along the step, so the jet is a rope and not beads.
    const lead = random() * dt;
    for (let axis = 0; axis < 3; axis += 1) blob.x[axis] = muzzle[axis] + blob.v[axis] * lead;
    blob.fuel = FLAME.flow / FLAME.blobs;
    blob.age = lead;
    blob.owner = fighter.id;
    blob.corner = fighter.corner;
    flame.blobs.push(blob);
  }
}

/** The floor's height under a point (the stage's terrain, or the flat floor). */
function floorUnderFlame(world, x, y, z) {
  const terrain = world.arena.terrain;
  return terrain ? floorAt(terrain, x, z, y + 0.5) ?? -Infinity : 0;
}

/** The part of a man a point is on (head, trunk, a thigh), or null: within FLAME.radius of the line from his feet to his head. */
export function struckPart(fighter, at) {
  const x = fighter.x;
  const dx = at[0] - x[P.pelvis * 3];
  const dz = at[2] - x[P.pelvis * 3 + 2];
  if (dx * dx + dz * dz > 1.7) return null;
  const feet = vec.scale(vec.add(point(x, P.lFoot), point(x, P.rFoot)), 0.5);
  const axis = vec.sub(point(x, P.head), feet);
  const along = Math.max(0, Math.min(1, vec.dot(vec.sub(at, feet), axis) / Math.max(1e-6, vec.dot(axis, axis))));
  const off = vec.sub(at, vec.add(feet, vec.scale(axis, along)));
  if (vec.dot(off, off) > FLAME.radius * FLAME.radius) return null;
  if (along > 0.86) return 'head';
  if (along > 0.48) return 'trunk';
  const left = vec.length(vec.sub(at, point(x, P.lKnee))) < vec.length(vec.sub(at, point(x, P.rKnee)));
  return left ? 'lThigh' : 'rThigh';
}

/** The horse (or robot dog) standing that a point is in (within one of its capsules), or null. */
export function struckHorse(world, at) {
  for (const horse of world.horses ?? []) {
    if (horse.state === 'down') continue;
    const dx = at[0] - horse.at[0];
    const dz = at[2] - horse.at[1];
    if (dx * dx + dz * dz > 9 * horse.withers * horse.withers) continue;
    for (const capsule of horse.capsules) {
      const along = vec.sub(capsule.b, capsule.a);
      const share = Math.max(0, Math.min(1, vec.dot(vec.sub(at, capsule.a), along) / Math.max(1e-9, vec.dot(along, along))));
      const off = vec.sub(at, vec.add(capsule.a, vec.scale(along, share)));
      if (vec.dot(off, off) < capsule.radius * capsule.radius) return horse;
    }
  }
  return null;
}

function flyFuel(world, flame, dt) {
  const blobs = flame.blobs;
  const slow = Math.exp(-FLAME.drag * dt);
  for (let index = blobs.length - 1; index >= 0; index -= 1) {
    const blob = blobs[index];
    blob.v[1] -= WORLD.gravity * dt;
    for (let axis = 0; axis < 3; axis += 1) {
      blob.v[axis] *= slow;
      blob.x[axis] += blob.v[axis] * dt;
    }
    blob.age += dt;
    let done = blob.age > FLAME.life;
    if (!done) {
      for (const fighter of world.fighters) {
        if (fighter.dormant || fighter.hidden || (fighter.id === blob.owner && blob.age < FLAME.clear)) continue;
        const part = struckPart(fighter, blob.x);
        if (!part) continue;
        // A robot dog's load (its sensor head, its turret) is the robot's own: the fuel on it is on the dog.
        if (fighter.mount?.spec?.machine && fighter.mount.state !== 'down') igniteHorse(world, fighter.mount, blob.fuel * FLAME.stick, blob.owner);
        else igniteMan(world, fighter, blob.fuel * FLAME.stick, part, blob.owner);
        addFirePatch(world, flame, [blob.x[0], floorUnderFlame(world, blob.x[0], fighter.x[P.pelvis * 3 + 1], blob.x[2]), blob.x[2]], blob.fuel * (1 - FLAME.stick));
        done = true;
        break;
      }
    }
    if (!done && world.horses?.length) {
      const horse = struckHorse(world, blob.x);
      if (horse && !(horse.rider === blob.owner && blob.age < FLAME.clear)) {
        igniteHorse(world, horse, blob.fuel * FLAME.stick, blob.owner);
        addFirePatch(world, flame, [blob.x[0], floorUnderFlame(world, blob.x[0], blob.x[1], blob.x[2]), blob.x[2]], blob.fuel * (1 - FLAME.stick));
        done = true;
      }
    }
    if (!done) {
      const floor = floorUnderFlame(world, blob.x[0], blob.x[1], blob.x[2]);
      if (blob.x[1] <= floor) {
        addFirePatch(world, flame, [blob.x[0], floor, blob.x[2]], blob.fuel);
        done = true;
      }
    }
    if (done) {
      blobs[index] = blobs[blobs.length - 1];
      blobs.pop();
      flame.free.push(blob);
    }
  }
}

function addFirePatch(world, flame, at, fuel) {
  if (!Number.isFinite(at[1])) return;
  const spec = FLAME.patch;
  for (const patch of flame.patches) {
    const dx = patch.x[0] - at[0];
    const dz = patch.x[2] - at[2];
    if (dx * dx + dz * dz < spec.merge * spec.merge && Math.abs(patch.x[1] - at[1]) < 0.3) {
      patch.fuel += fuel;
      return;
    }
  }
  if (flame.patches.length >= spec.most) flame.patches.shift();
  const ground = surfaceAt(world, at[0], at[1], at[2]);
  flame.patches.push({ x: at, fuel, age: 0, wet: ground === 'water' || ground === 'mud', seed: world.random() });
}

/** How far a patch's flames reach (m): more as it holds more fuel. */
export const patchReach = (patch) => Math.min(FLAME.patch.reachMost, FLAME.patch.reach + patch.fuel);

function burnFirePatches(world, flame, dt) {
  const spec = FLAME.patch;
  for (const patch of flame.patches) {
    patch.fuel -= spec.burn * (patch.wet ? spec.wet : 1) * dt;
    patch.age += dt;
    const reach = patchReach(patch);
    for (const fighter of world.fighters) {
      if (fighter.dormant || fighter.mount || fighter.burning?.clothes > 0) continue;
      for (const foot of [P.lFoot, P.rFoot]) {
        const dx = fighter.x[foot * 3] - patch.x[0];
        const dz = fighter.x[foot * 3 + 2] - patch.x[2];
        if (dx * dx + dz * dz < reach * reach && fighter.x[foot * 3 + 1] - patch.x[1] < 0.4) {
          igniteMan(world, fighter, 0, foot === P.lFoot ? 'lThigh' : 'rThigh');
          break;
        }
      }
    }
  }
  flame.patches = flame.patches.filter((patch) => patch.fuel > 0);
}

/**
 * Fuel on a man (kg; 0: only his clothes caught, or a machine stood in the fire), on a part of him, by `by` (who threw it). A
 * machine has no clothes to catch: the fuel burns on its shell (burnOnMachine).
 */
function igniteMan(world, fighter, fuel, part, by) {
  const machine = Boolean(fighter.body.gear.machine);
  const burning = (fighter.burning ??= { fuel: 0, clothes: 0, heat: 0, part, reacted: false, rolling: false, running: false, rollClock: 0, cryClock: 0, side: 1, since: world.time, machine });
  burning.fuel += fuel;
  // (A machine in a burning patch: its legs in the flames this moment, `clothes` its time left there.)
  burning.clothes = machine ? 0.1 : FLAME.man.clothes;
  if (by !== undefined) burning.by = by;
  if (part === 'trunk' || part === 'head') burning.part = part;
}

/** Fuel on a horse or a robot dog (kg). */
function igniteHorse(world, horse, fuel, by) {
  const burning = (horse.burning ??= { fuel: 0, heat: 0, since: world.time });
  burning.fuel += fuel;
  if (by !== undefined) horse.lastHitBy = by;
}

/** The share of the heat that reaches him: plate over most of him keeps much of it off. */
const fireExposure = (fighter) => 1 - (fighter.body.gear.cutProof ? FLAME.man.plate : 0);

/** Whether he stands or lies in water. */
function inWaterNow(world, fighter) {
  if (fighter.wading) return true;
  const ground = surfaceAt(world, fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 1] - 0.9, fighter.x[P.pelvis * 3 + 2]);
  return ground === 'water';
}

function burnOnMan(world, fighter, dt) {
  const spec = FLAME.man;
  const burning = fighter.burning;
  const down = fighter.state === 'down' || fighter.state === 'out';
  const smother = (down ? spec.roll : 1) * (inWaterNow(world, fighter) ? spec.wet : 1);
  burning.fuel = Math.max(0, burning.fuel - spec.burn * smother * dt);
  burning.clothes = Math.max(0, burning.clothes - smother * dt);
  burning.heat = Math.min(1, Math.max(burning.fuel / spec.cover, burning.clothes > 0 ? spec.clothesHeat : 0)) * fireExposure(fighter);
  if (burning.heat <= 0.01) {
    fighter.burning = undefined;
    return;
  }
  if (fighter.state === 'out') return;
  // The burns: the trunk, the limbs, the head, as much as the heat.
  for (const [key, rate] of [['trunk', spec.trunk], ['head', spec.head], ...BURNED_LIMBS.map((limb) => [limb, spec.limbs])]) {
    const capacity = (WORLD.damageCapacity[key.replace(/^[lr](?=[A-Z])/, '')] ?? 20) * BODY.toughness;
    addDamage(fighter, key, burning.heat * rate * dt * capacity, false);
  }
  burning.cryClock -= dt;
  if (burning.cryClock <= 0) {
    burning.cryClock = spec.cryEvery;
    soundVoice(world, fighter, 'struck', burning.heat, { striker: 'burn' });
  }
  if (!burning.reacted && burning.heat >= spec.catchFrom && fighter.state === 'up' && !fighter.player) catchAlight(world, fighter, burning);
  if (burning.rolling && fighter.state === 'down') rollOver(world, fighter, burning, dt);
}

/** The heat a fire puts into a machine this moment (W): its share of the fire's, as much as it burns (`heat` 0..1). */
const machineHeating = (heat) => heat * FLAME.man.burn * FLAME.machine.fuelHeat * FLAME.machine.absorbed;

/** A machine's heat (K over the air) after `dt` s taking `watts` in, its heat capacity `capacity` J/K, cooling as it does. */
function warmed(heatC, watts, capacity, dt) {
  return Math.max(0, (heatC ?? 0) + ((watts - FLAME.machine.cooling * (heatC ?? 0)) * dt) / capacity);
}

/** Fuel burning on a robot (or one stood in the fire): it burns off; the robot warms; past its limit, it cuts out. */
function burnOnMachine(world, fighter, dt) {
  const spec = FLAME.machine;
  const burning = fighter.burning;
  let heat = 0;
  if (burning) {
    burning.fuel = Math.max(0, burning.fuel - FLAME.man.burn * (inWaterNow(world, fighter) ? FLAME.man.wet : 1) * dt);
    burning.clothes = Math.max(0, burning.clothes - dt);
    heat = Math.min(1, Math.max(burning.fuel / FLAME.man.cover, burning.clothes > 0 ? spec.patch : 0));
    burning.heat = heat;
    if (heat <= 0.01) fighter.burning = undefined;
  }
  fighter.heatC = warmed(fighter.heatC, machineHeating(heat), fighter.body.massKg * spec.specificHeat, dt);
  if (fighter.heatC < 0.05 && !fighter.burning) fighter.heatC = 0;
  if (fighter.heatC > spec.limit && (fighter.state === 'up' || fighter.state === 'rising' || fighter.state === 'down')) {
    knockOut(world, fighter, { attacker: burning?.by ?? -1, effects: [] }, 'overheats: its cut-outs stop it');
  }
}

/** Fuel burning on a horse (as a man's trunk, against its own limit) or a robot dog (it warms, and past its limit goes down). */
function burnOnHorse(world, horse, dt) {
  const burning = horse.burning;
  let heat = 0;
  if (burning) {
    burning.fuel = Math.max(0, burning.fuel - FLAME.man.burn * dt);
    heat = Math.min(1, burning.fuel / FLAME.man.cover);
    burning.heat = heat;
    if (heat <= 0.01) horse.burning = undefined;
  }
  if (horse.state !== 'up') return;
  if (horse.spec?.machine) {
    const riderKg = world.fighters[horse.rider]?.body.massKg ?? 0;
    horse.heatC = warmed(horse.heatC, machineHeating(heat), (horse.mass + riderKg) * FLAME.machine.specificHeat, dt);
    if (horse.heatC < 0.05 && !horse.burning) horse.heatC = 0;
    if (horse.heatC > FLAME.machine.limit) bringDown(world, horse, 'overheats: its cut-outs stop it');
    return;
  }
  const limit = { ...WORLD.mount.horse, ...horse.spec?.harm }.trunkFatal * BODY.toughness;
  horse.trauma += heat * FLAME.man.trunk * limit * dt;
  if (horse.trauma > limit) bringDown(world, horse, 'burned');
}

/** Alight: he drops and rolls (the drilled, the skilled the more often), or panics and runs, letting his weapon go. */
function catchAlight(world, fighter, burning) {
  const [least, most] = FLAME.man.rollShare;
  burning.reacted = true;
  if (world.random() < least + (most - least) * (fighter.body.skill ?? 0.5)) {
    fall(world, fighter, 'on fire: drops and rolls');
    fighter.downTimer = FLAME.man.rollSeconds;
    burning.rolling = true;
    return;
  }
  fighter.panicked = true;
  fighter.panics = (fighter.panics ?? 0) + 1;
  fighter.calmFor = 0;
  fighter.punch = null;
  fighter.clinch = null;
  burning.running = true;
  if (fighter.weapon?.held) dropWeapon(world, fighter, 'dropped');
  world.events.push({ time: world.time, kind: 'panic', fighter: fighter.id, effects: ['on fire: runs'] });
}

/** Rolling on the floor: pushed over one way and back, kept down while it still burns and his time to roll lasts. */
function rollOver(world, fighter, burning, dt) {
  const spec = FLAME.man;
  burning.rollClock -= dt;
  if (world.time - burning.since < spec.rollSeconds * 2 && burning.heat > 0.1) fighter.downTimer = Math.max(fighter.downTimer ?? 0, 0.3);
  if (burning.rollClock > 0) return;
  burning.rollClock = spec.rollEvery;
  burning.side = -burning.side;
  const across = vec.sub(point(fighter.x, P.rShoulder), point(fighter.x, P.lShoulder));
  const direction = vec.normalize([across[0] * burning.side, 0.25, across[2] * burning.side]);
  world.pendingImpulses.push({ fighter, shares: [[P.lShoulder, 1], [P.rShoulder, 1], [P.pelvis, 0.6], [P.lHip, 0.5], [P.rHip, 0.5]], direction, impulse: spec.rollPush });
}

/** The fear of fire on each man: on him, near him, going past him; fading as it goes. */
function frightenOfFire(world, flame, dt) {
  const spec = FLAME.fright;
  const fade = 0.5 ** (dt / spec.halfLife);
  const burning = world.fighters.filter((fighter) => fighter.burning?.heat > 0.1 && fighter.state !== 'out');
  for (const fighter of world.fighters) {
    if (fighter.state === 'out' || fighter.body.gear.machine) continue;
    const pelvis = point(fighter.x, P.pelvis);
    let felt = fighter.burning?.heat > 0.1 ? spec.self : 0;
    for (const other of burning) {
      if (other === fighter) continue;
      const apart = Math.hypot(other.x[P.pelvis * 3] - pelvis[0], other.x[P.pelvis * 3 + 2] - pelvis[2]);
      if (apart < spec.near) felt = Math.max(felt, spec.nearby * (1 - apart / spec.near));
    }
    if (felt < spec.passing) {
      for (let index = 0; index < flame.blobs.length; index += 4) {
        const blob = flame.blobs[index];
        if (blob.corner === fighter.corner) continue;
        const dx = blob.x[0] - pelvis[0];
        const dy = blob.x[1] - pelvis[1];
        const dz = blob.x[2] - pelvis[2];
        if (dx * dx + dy * dy + dz * dz < spec.stream * spec.stream) {
          felt = spec.passing;
          break;
        }
      }
    }
    if (felt > 0 || fighter.flameFright) fighter.flameFright = Math.max((fighter.flameFright ?? 0) * fade, felt);
  }
}
