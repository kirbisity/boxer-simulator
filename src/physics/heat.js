// Body heat and the cost of carrying armour (WORLD.heat). Every fighter has a core temperature (fighter.heat.core, °C):
// what he spends of his stamina is metabolic energy, four fifths of it heat; moving his body warms him as well; the air
// takes heat off his skin and his sweat off as it evaporates, as far as his kit lets it. Past ~38.5 °C his wind comes back
// slower, past 39 his muscles weaken, both the more as he nears 40. Armour costs breath to move in (Askew et al. 2012),
// keeps heat in and sweat from evaporating, and a breastplate or a closed visor hampers his breathing.
//
// The stamina drawn each step is read from the bar itself (what it lost since the last step, less the wind blows knocked
// out of him, which is no work): every cost in the game, wherever it is taken, warms him without each one knowing of it.

import { WORLD } from './config.js';

/** A fighter's heat state, fresh: at the resting core, nothing drawn yet. (Declared on every fighter: physics.js createFighter.) */
export function freshHeat() {
  return { core: WORLD.heat.core, last: 1, debt: 0, kit: null };
}

/** Saturation vapour pressure of water (kPa) at `celsius` (Magnus formula). */
function saturation(celsius) {
  return 0.6108 * Math.exp((17.27 * celsius) / (celsius + 237.3));
}

/** The air of a place (WORLD.heat.climates): { air °C, humidity }, temperate where the place is not named. */
export function climateOf(place) {
  const climates = WORLD.heat.climates;
  return climates[place] ?? climates.temperate;
}

/** How readily sweat evaporates in this air, as a share of temperate air's: the vapour pressure gap from wet skin to the air. */
export function evaporationShare(climate) {
  const spec = WORLD.heat;
  const skin = saturation(spec.skin);
  const gap = (air) => Math.max(0, skin - air.humidity * saturation(air.air));
  return gap(climate) / gap(spec.reference);
}

/** A region's cover by his kit, 0..1: its armour's blunt or cut there (padding and plate both keep heat in). */
function coverAt(protection, region) {
  const own = protection.regions?.[region] ?? protection;
  return Math.max(0, Math.min(1, Math.max(own.blunt ?? 0, own.cut ?? 0)));
}

/**
 * What his kit does to his heat and his breath, worked out once per kit (and again when his helmet is knocked off):
 * `cover` (0..1, the skin's share under armour, by area), `conductance` (W/K from skin to air), `breath` (his recovery's share),
 * `armourKg` and `carriedKg` (what moving costs: physics/heat.js loadWatts).
 */
export function kitHeat(fighter) {
  const body = fighter.body;
  const gear = body.gear;
  const spec = WORLD.heat;
  const bare = Boolean(fighter.helmetOff);
  const key = bare ? 'bare' : 'worn';
  if (fighter.heat.kit?.key === key) return fighter.heat.kit;
  const protection = gear.protection ?? {};
  const share = spec.skinShare;
  const cover = (bare ? 0 : share.head * coverAt(protection, 'head')) + share.trunk * coverAt(protection, 'torso') + share.limb * coverAt(protection, 'limb');
  const clo = spec.clothes + spec.armour * cover;
  const heightCm = (body.heightM ?? 1.75) * 100;
  const area = 0.007184 * body.bodyMassKg ** 0.425 * heightCm ** 0.725;
  const closed = !bare && (gear.helmFace === 'closed' || gear.helmFace === 'sealed');
  const breath = ((gear.breastplate ?? 0) > 0 ? spec.breath.breastplate : 1) * (closed ? spec.breath.closedHelm : 1);
  // A load on the back is carried at the plain rate; a pack already lowers his aerobic (body.js `packed`) and is left out;
  // a powered frame carries its own weight; the rest of the kit's mass is armour on his limbs and trunk.
  const packKg = body.inputs?.outfit?.packKg ?? 0;
  const carriedKg = gear.assist ? 0 : Math.max(0, (gear.carriedShare ?? 0) * body.bodyMassKg);
  const armourKg = gear.assist ? 0 : Math.max(0, (body.gearKg ?? 0) - packKg - carriedKg);
  fighter.heat.kit = { key, cover, area, conductance: area / (spec.airInsulation + clo * spec.clo), breath, armourKg, carriedKg };
  return fighter.heat.kit;
}

/** Metabolic power (W) of moving at `speed` m/s, per kg moved: walking or running (WORLD.heat walk, run). */
function movingWattsPerKg(speed) {
  const spec = WORLD.heat;
  if (speed < spec.still) return 0;
  return (speed >= spec.runFrom ? spec.run : spec.walk) * speed;
}

/** His horizontal speed over the ground (m/s); nothing in the saddle (the horse carries him). */
function groundSpeed(fighter) {
  if (fighter.mount || fighter.state !== 'up') return 0;
  const v = fighter.rootVelocity ?? [0, 0];
  return Math.hypot(v[0], v[1]);
}

/** The extra metabolic power (W) his armour and load cost him to move at his speed now (Askew 2012: WORLD.heat.armourPerKg). */
export function loadWatts(fighter) {
  const kit = kitHeat(fighter);
  const spec = WORLD.heat;
  return movingWattsPerKg(groundSpeed(fighter)) * (kit.armourKg * spec.armourPerKg + kit.carriedKg * spec.carriedPerKg);
}

/**
 * Before his recovery this step: the stamina his load costs him to move (drawn, never past empty) and the heat of everything
 * he has drawn since the last step. A machine neither tires nor warms.
 */
export function stepHeat(world, fighter, dt) {
  const heat = fighter.heat;
  if (fighter.body.gear.machine || fighter.state === 'out') {
    heat.last = fighter.stamina;
    heat.debt = fighter.windDebt ?? 0;
    return;
  }
  const spec = WORLD.heat;
  const kit = kitHeat(fighter);
  const aerobic = Math.max(1e-6, fighter.body.aerobic);
  const bodyKg = fighter.body.bodyMassKg;
  const speed = groundSpeed(fighter);
  // What he drew since the last step, less the wind knocked out of him (owed back, not spent). While he sprints (the player's
  // run mode) what he draws is the run's, and its heat is reckoned below from his speed.
  const knocked = Math.max(0, (fighter.windDebt ?? 0) - heat.debt);
  const drawn = fighter.runMode ? 0 : Math.max(0, heat.last - fighter.stamina - knocked);
  // The armour's cost to move, on the game's scale for moving a body (WORLD.heat.loadDraw). Not in the player's sprint: its
  // cost (control.js CONTROL.run) was set for a man in plate as well as out of it, and is paid there.
  const loadKg = kit.armourKg * spec.armourPerKg + kit.carriedKg * spec.carriedPerKg;
  if (loadKg > 0 && speed >= spec.still && !fighter.runMode) {
    const draw = (spec.loadDraw * (loadKg / bodyKg) * Math.min(1, speed / spec.sprint) * dt) / aerobic;
    fighter.stamina = Math.max(Math.min(0, fighter.stamina), fighter.stamina - draw);
  }
  // Moving his body and his load, in watts (the load's heat whatever its stamina).
  const metabolic = (drawn * aerobic * spec.staminaJoules) / dt + movingWattsPerKg(speed) * bodyKg + loadWatts(fighter);
  const made = spec.restWatts * bodyKg + metabolic * (1 - spec.efficiency);
  const climate = world.climate ?? climateOf(null);
  const dry = kit.conductance * (spec.skin - climate.air);
  const sweat = Math.min(spec.sweatMost, Math.max(0, spec.sweatPerDegree * (heat.core - spec.sweatFrom)));
  const evaporated = sweat * (1 - spec.evapBlocked * kit.cover) * evaporationShare(climate);
  heat.core = Math.max(spec.core, heat.core + ((made - dry - evaporated) * dt) / (spec.heatCapacity * bodyKg));
  // (Read after his recovery: physics.js marks the bar as it leaves the step, heatMark.)
}

/** The bar as it leaves this step, for the next step's reading of what was drawn. */
export function heatMark(fighter) {
  fighter.heat.last = fighter.stamina;
  fighter.heat.debt = fighter.windDebt ?? 0;
}

/** How far into heat strain he is, 0 (≤ strainFrom) to 1 (at the limit or past it). */
export function heatStrain(fighter) {
  const spec = WORLD.heat;
  return Math.max(0, Math.min(1, ((fighter.heat?.core ?? spec.core) - spec.strainFrom) / (spec.limit - spec.strainFrom)));
}

/** His recovery's share for his heat and his breathing in his kit. */
export function heatRecovery(fighter) {
  const spec = WORLD.heat;
  const breath = fighter.heat?.kit?.breath ?? 1;
  return breath * (1 - (1 - spec.recoveryAtLimit) * heatStrain(fighter));
}

/** His muscles' drive for his heat: 1 to `weakFrom`, falling to `strengthAtLimit` at the limit. */
export function heatStrength(fighter) {
  const spec = WORLD.heat;
  const core = fighter.heat?.core ?? spec.core;
  if (core <= spec.weakFrom) return 1;
  return 1 - (1 - spec.strengthAtLimit) * Math.min(1, (core - spec.weakFrom) / (spec.limit - spec.weakFrom));
}
