// Wear: weapons and shields are worn by what they meet, and break. An edge dulls on what is harder than flesh (armour, another
// edge), and a dull edge is a wider one, that cuts less of a blow and lands the rest as the flat. A metal blade bends or snaps
// under a blow across it past its strength, or once enough lesser blows have worked it to a crack. A wooden shaft snaps when
// its point is stopped harder than it can carry (the set spear's brace figure, WORLD.mount.brace.shaft) or when a blow across
// it bends it past its strength, and is hacked through by edges. A shield's board splits under enough hacking. What each
// part can take is its material's (weapons.js MATERIALS), scaled by its size and scattered from one piece to the next as a
// material's strength is (a Weibull spread); the scatter of each piece is fixed by who carries it and when it first takes a
// blow, so a bout replays exactly and draws nothing from the world's random stream.
// These are pure sums: they say what broke and why; physics.js breaks it (breakWeapon, breakShield).

import { WORLD } from './config.js';
import { MATERIALS, buildOf, freeShaft } from '../weapons.js';

/** A uniform draw in (0, 1) from a string: the same piece of wood or steel is always as strong. */
function pieceDraw(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return (((h ^ (h >>> 14)) >>> 0) + 0.5) / 4294967296;
}

/** One piece's strength over its material's median, from a Weibull spread of modulus `modulus`. */
function pieceScatter(key, modulus) {
  return (-Math.log(1 - pieceDraw(key)) / Math.LN2) ** (1 / modulus);
}

/** The wear of a weapon in `fighter`'s hands: begun the first time it takes anything. */
export function wearOf(weapon, fighter, time) {
  if (weapon.wear) return weapon.wear;
  const rule = WORLD.wear;
  const spec = weapon.spec;
  const build = buildOf(spec, rule.shaftFrom);
  const key = `${fighter?.id ?? 0}:${weapon.kind}:${Math.round((time ?? 0) * 1000)}`;
  const blade = build.blade ? MATERIALS[build.blade]?.blade : null;
  const shaft = build.shaft ? MATERIALS[build.shaft]?.shaft : null;
  // A blade's section cubed over its length; a shaft's radius cubed (and its cross-section, for what an edge must hack away).
  const bladeSize = blade ? (spec.radius / rule.blade.radius) ** 3 / (spec.length / rule.blade.length) : 0;
  const shaftSize = shaft ? build.shaftRadius / rule.shaft : 0;
  const bladeScatter = blade ? pieceScatter(`${key}:blade`, blade.scatter) : 1;
  const shaftScatter = shaft ? pieceScatter(`${key}:shaft`, shaft.scatter) : 1;
  // Along it, a column: a stockier one than the war spear's buckles only at Euler's r⁴/L², more than its section's r³ (WORLD.wear.column).
  const free = shaft ? freeShaft(spec, build) : null;
  const column = free ? Math.max(1, shaftSize * (rule.column / free) ** 2) : 1;
  const shaftBend = shaft ? WORLD.mount.brace.shaft * shaft.strength * shaftSize ** 3 * shaftScatter : Infinity;
  weapon.wear = {
    build,
    // The edge's width, × fresh.
    edge: 1,
    // Joules taken across the blade so far, and what it carries in one blow and in all.
    blade: 0,
    bladeStrength: blade ? blade.strength * bladeSize * bladeScatter : Infinity,
    bladeCapacity: blade ? blade.capacity * bladeSize * bladeScatter : Infinity,
    // What the shaft carries along its length driving a point into flesh (J), and the edge-on work hacked into it so far, of what
    // it takes to go through.
    shaftStrength: shaftBend * column,
    // What its section bears bent across it, as against along it (WORLD.wear.across of this): the column's length does not help it.
    shaftBend,
    chop: 0,
    chopCapacity: shaft ? shaft.chop * shaftSize ** 2 * shaftScatter : Infinity,
  };
  return weapon.wear;
}

/** How well an edge cuts, of a fresh one's: 1 / ((1 − press) + press·w), its width w × fresh (WORLD.wear.press). */
export function keenness(weapon) {
  const width = weapon?.wear?.edge ?? 1;
  if (width <= 1) return 1;
  const press = WORLD.wear.press;
  return 1 / (1 - press + press * width);
}

/**
 * A dull edge cuts less: of the cut in `mix`, what its width cannot part lands as the flat (WORLD.skill.flatBlunt of it as a
 * blow), as an edge turned off true does. In place; returns `mix`.
 */
export function bluntEdge(weapon, mix) {
  const keen = keenness(weapon);
  if (keen >= 1 || mix.cut <= 0) return mix;
  const lost = mix.cut * (1 - keen);
  mix.cut -= lost;
  mix.blunt += lost * WORLD.skill.flatBlunt;
  return mix;
}

/** How hard a face armour of this proof is to an edge (WORLD.wear: its proof against a cut squared; bone under nothing). */
export function armourHardness(protection) {
  return Math.max(WORLD.wear.bone, (protection?.cut ?? 0) ** 2);
}

/** How hard the part of a weapon met at `part` (audio/log.js weaponPart: haft, blade, blunt) is to an edge. */
export function partHardness(weapon, part, fighter, time) {
  const build = wearOf(weapon, fighter, time).build;
  const material = part === 'haft' ? build.shaft : build.edge ?? build.blade;
  return MATERIALS[material]?.hardness ?? 1;
}

/** An edge takes `joules` edge on against a face this hard (1: good steel): it grows wider by its metal's `dulls`. */
export function dullEdge(weapon, fighter, time, joules, hardness) {
  const wear = wearOf(weapon, fighter, time);
  const metal = MATERIALS[wear.build.edge];
  if (!metal?.dulls || joules <= 0) return;
  wear.edge = Math.min(WORLD.wear.flat, wear.edge + metal.dulls * joules * hardness);
}

/**
 * A blade takes `joules` across it: past its strength in the one blow, it bends or snaps (its metal's `fails`); else the
 * blow is added to what it has taken, and past its capacity it cracks through. Returns why it broke, or null.
 */
export function strainBlade(weapon, fighter, time, joules) {
  const wear = wearOf(weapon, fighter, time);
  if (!wear.build.blade || joules <= 0) return null;
  const fails = MATERIALS[wear.build.blade].blade.fails;
  if (joules >= wear.bladeStrength) return fails;
  wear.blade += joules;
  return wear.blade >= wear.bladeCapacity ? 'cracked' : null;
}

/**
 * A point driven home along the shaft, stopped over `stop` m (WORLD.wear.stop): the shaft carries up to its strength over
 * that distance (a set shaft gives at the brace's force, whatever stops the point) and snaps past it. Returns what it
 * carried (J: all of `joules`, or what it bore before it went) and whether it snapped.
 */
export function driveShaft(weapon, fighter, time, joules, stop) {
  const wear = wearOf(weapon, fighter, time);
  if (!wear.build.shaft) return { carried: joules, snapped: false };
  const bears = wear.shaftStrength * (stop / WORLD.wear.stop.flesh);
  return joules > bears ? { carried: bears, snapped: true } : { carried: joules, snapped: false };
}

/** How far a point's drive is stopped in on what it met (WORLD.wear.stop): flesh it goes into, or plate it cannot. */
export function stopIn(protection) {
  const stop = WORLD.wear.stop;
  return protection?.deflects || (protection?.pierce ?? 0) >= stop.proof ? stop.plate : stop.flesh;
}

/**
 * A blow across a shaft (`joules` of it; `edge` J of it an edge's, hacking in): past its strength across
 * (WORLD.wear.across of what its section carries along, `shaftBend`: no column's gain) it snaps; the edges' work, summed, hacks it through. Returns why, or null.
 */
export function strikeShaft(weapon, fighter, time, joules, edge = 0) {
  const wear = wearOf(weapon, fighter, time);
  if (!wear.build.shaft || joules <= 0) return null;
  if (joules >= wear.shaftBend * WORLD.wear.across) return 'snapped';
  wear.chop += edge;
  return wear.chop >= wear.chopCapacity ? 'hacked through' : null;
}

/** A shield's wear: its board's hacking so far, and what it takes to split it (Infinity: a metal shield, dented only). */
export function shieldWearOf(shield, fighter, time) {
  if (shield.wear) return shield.wear;
  const material = MATERIALS[shield.spec.material];
  const board = material?.board;
  const key = `${fighter?.id ?? 0}:${shield.kind}:${Math.round((time ?? 0) * 1000)}:board`;
  shield.wear = { hacked: 0, blows: 0, capacity: board ? board.perKg * shield.spec.mass * pieceScatter(key, board.scatter) : Infinity };
  return shield.wear;
}

/**
 * A blow of `joules` on a shield, by the harm it carries (`mix`: cut, blunt, pierce shares; WORLD.wear.split of each hacks
 * the board). Returns true when the board splits apart.
 */
export function hackShield(shield, fighter, time, joules, mix) {
  const wear = shieldWearOf(shield, fighter, time);
  if (wear.capacity === Infinity || joules <= 0) return false;
  const split = WORLD.wear.split;
  const total = (mix.cut ?? 0) + (mix.blunt ?? 0) + (mix.pierce ?? 0);
  const share = total > 0 ? ((mix.cut ?? 0) * split.cut + (mix.blunt ?? 0) * split.blunt + (mix.pierce ?? 0) * split.pierce) / total : split.blunt;
  wear.hacked += joules * share;
  wear.blows += 1;
  return wear.hacked >= wear.capacity;
}

/** How hard a shield's face is to an edge. */
export function shieldHardness(shield) {
  return MATERIALS[shield?.spec.material]?.hardness ?? 1;
}
