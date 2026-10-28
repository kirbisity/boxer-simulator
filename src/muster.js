// Mustering: a battle's armies as the player sets them up, before it starts
// (musterview.js is the screen). For either side, or both, he may keep the
// level's own, or choose how many of each kind of man it has (the side's
// armies in scenarios.js ARMIES: the level's own kinds and the others of the
// same people and period), how they are drawn up (the level's own order or
// one of MUSTER.formations), and where each man stands; and which man of
// either side he plays.
//
// Nothing here fights. A set-up battle is the level's own with the cast
// handed in (`setup.cast`) and, for a side set up by hand, every man's place
// on the floor given (`setup.places`): it becomes that side's formation
// `layout` (each man's own place, as Qi Jiguang's squads have theirs) with
// `placed` (physics.js createWorld: his riders too), the side keeping its
// level's drill, discipline and wings. The world is built from it as from any level.

import { canRide } from './horses.js';
import { STYLES } from './moves.js';
import { WORLD } from './physics.js';
import { WINGS, placeWings } from './formation.js';
import { ARMIES } from './scenarios.js';

export const MUSTER = {
  // Men a side at most: the biggest side of the levels (the Japanese at Pyongyang, fifty-two), so
  // a side set by hand is never bigger than one the game already fights.
  cap: 52,
  // The deployment zone: a side's own half of the floor, from this far (m) behind the middle
  // line (no man starts nearer the enemy) to `edge` m short of the floor's ends and sides.
  neutral: 3,
  edge: 0.6,
  // A man set in his place by hand starts up to this far (m) off it: a line of men, not of posts.
  loose: 0.1,
  // Behind the shooters who open a battle, the rest stand this much further back (m; scenarios.js SHOOTERS_FRONT_GAP).
  shootersGap: 4,
  // The ways a side may be drawn up, beside its level's own (`level`, listed first): `spacing` (m
  // between men in a row), `rowSpacing` (m between rows), the bows and guns in front or at the rear
  // (`shooters`), and its shape:
  // - line: as wide as the floor allows, two ranks or as many more as it takes;
  // - block: a deep column, as many ranks as files;
  // - wedge: the point toward the enemy, each rank two wider than the one before it;
  // - skirmish: open order, every other rank offset by half a place.
  formations: {
    line: { label: 'Line', glyph: '▬', spacing: 1.2, rowSpacing: 1.5, shooters: 'front', ranks: 2 },
    block: { label: 'Block', glyph: '■', spacing: 1.0, rowSpacing: 1.2, shooters: 'rear', square: true },
    wedge: { label: 'Wedge', glyph: '▲', spacing: 1.2, rowSpacing: 1.3, shooters: 'rear', wedge: true },
    skirmish: { label: 'Skirmish', glyph: '⁘', spacing: 2.2, rowSpacing: 2.4, shooters: 'front', ranks: 3, stagger: true },
  },
};

const MUSTER_SIGN = { red: -1, blue: 1 };
/** He shoots (a bow, a crossbow, a gun). */
const musterShoots = (inputs) => Boolean(STYLES[inputs.style]?.ranged);
/** He rides into this battle. */
const musterRides = (inputs) => Boolean(inputs.mounted) && canRide(inputs);

/**
 * A side's units: each kind of man its armies have, one to a rank and style
 * (`id` "army.rank.style"), with a `label`, whether he rides or shoots, and
 * `make(random)`: one of them.
 */
export function unitsOf(level, corner) {
  const units = [];
  for (const armyKey of level.armies?.[corner] ?? []) {
    for (const [rankKey, rank] of Object.entries(ARMIES[armyKey].ranks)) {
      for (const style of rank.styles) {
        units.push({
          id: `${armyKey}.${rankKey}.${style}`,
          army: armyKey,
          rank: rankKey,
          style,
          label: rank.styles.length > 1 ? `${rank.label} · ${STYLES[style]?.label ?? style}` : rank.label,
          mounted: Boolean(rank.mounted),
          shoots: Boolean(STYLES[style]?.ranged),
          make: (random) => rank.make(random, style),
        });
      }
    }
  }
  return units;
}

/** The unit a man is one of (his armour's kind, his style, on a horse or not), or null. */
export function unitOf(units, inputs) {
  for (const unit of units) {
    const rank = ARMIES[unit.army].ranks[unit.rank];
    const style = rank.same?.[inputs.style] ?? inputs.style;
    if (style === unit.style && rank.kinds.includes(inputs.outfit?.kind) && Boolean(rank.mounted) === Boolean(inputs.mounted)) return unit;
  }
  return null;
}

/** How many of each unit a side has: { [id]: count } (a man of no unit under `other`). */
export function countUnits(units, men) {
  const counts = {};
  for (const inputs of men) {
    const id = unitOf(units, inputs)?.id ?? 'other';
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** A side's deployment zone on the floor: x from `x[0]` to `x[1]`, z from `z[0]` to `z[1]` (m). */
export function zoneOf(level, corner) {
  const sign = MUSTER_SIGN[corner];
  const far = level.arena.halfX - MUSTER.edge;
  const near = Math.min(MUSTER.neutral, far);
  const across = level.arena.halfZ - MUSTER.edge;
  return { x: sign < 0 ? [-far, -near] : [near, far], z: [-across, across] };
}

/** A point brought inside a side's zone. */
export function intoZone(level, corner, [x, z]) {
  const zone = zoneOf(level, corner);
  return [Math.min(zone.x[1], Math.max(zone.x[0], x)), Math.min(zone.z[1], Math.max(zone.z[0], z))];
}

/** Inside a side's zone (within `slack` m). */
export function inZone(level, corner, [x, z], slack = 0) {
  const zone = zoneOf(level, corner);
  return x >= zone.x[0] - slack && x <= zone.x[1] + slack && z >= zone.z[0] - slack && z <= zone.z[1] + slack;
}

/** The formations a side may take: its level's own first, then MUSTER.formations ({ key, label, glyph }). */
export function formationsOf() {
  return [{ key: 'level', label: 'As the level has it', glyph: '★' }, ...Object.entries(MUSTER.formations).map(([key, spec]) => ({ key, label: spec.label, glyph: spec.glyph }))];
}

/**
 * Where each man of a side stands, drawn up in a formation (`key`: 'level' or
 * one of MUSTER.formations), in his side's zone: [x, z] for each, in order.
 * The level's own is its order as createWorld draws it up (rows, the shooters
 * in front, a `layout`'s places for as many as it has), without the
 * crowd's scatter. The riders wait on the flanks, as a level's wings do (formation.js placeWings).
 */
export function drawUp(level, corner, men, key = 'level') {
  const sign = MUSTER_SIGN[corner];
  const order = level.formation?.[corner] ?? {};
  const front = Math.max(MUSTER.neutral, order.front ?? WORLD.teamStartApart);
  const zone = zoneOf(level, corner);
  const places = new Array(men.length);
  const foot = men.map((inputs, index) => ({ inputs, index })).filter((man) => !musterRides(man.inputs));
  const riders = men.map((inputs, index) => ({ inputs, index })).filter((man) => musterRides(man.inputs));
  // Unclamped first (`back` m behind the front): the whole is moved up if it is deeper than the zone, then each man kept inside it.
  const put = (man, back, across) => { places[man.index] = [back, across]; };
  const room = zone.z[1] - zone.z[0];
  let width = 0;
  /** A group in rows `perRow(row)` wide from `back` m behind the front: the depth it took. */
  const rows = (group, back, { spacing, rowSpacing, perRow, stagger = false }) => {
    let row = 0;
    let placed = 0;
    while (placed < group.length) {
      const wide = Math.max(1, Math.min(perRow(row), group.length - placed));
      for (let file = 0; file < wide; file += 1) put(group[placed + file], back + row * rowSpacing, (file - (wide - 1) / 2 + (stagger && row % 2 ? 0.5 : 0)) * spacing);
      width = Math.max(width, (wide - 1) * spacing);
      placed += wide;
      row += 1;
    }
    return row * rowSpacing;
  };
  if (key === 'level') {
    const spacing = order.spacing ?? WORLD.teamSpacing;
    const rowSpacing = order.rowSpacing ?? WORLD.teamRowSpacing;
    const perRow = order.perRow ?? Math.max(1, Math.floor((2 * (level.arena.halfZ - 0.5)) / spacing) + 1);
    const shape = { spacing, rowSpacing, perRow: () => perRow };
    if (order.layout) {
      // Each man of the layout in his place (the squads as they stood); any more in rows behind them.
      const laid = foot.slice(0, order.layout.length);
      laid.forEach((man, index) => {
        const [back, across] = order.layout[index];
        put(man, back, sign * across);
        width = Math.max(width, 2 * Math.abs(across));
      });
      const deepest = Math.max(0, ...order.layout.map(([back]) => back));
      rows(foot.slice(laid.length), deepest + rowSpacing, shape);
    } else if (order.shootersFront !== undefined) {
      const shooters = foot.filter((man) => musterShoots(man.inputs));
      const rest = foot.filter((man) => !musterShoots(man.inputs));
      const depth = shooters.length ? rows(shooters, 0, shape) + order.shootersFront : 0;
      rows(rest, depth, shape);
    } else rows(foot, 0, shape);
  } else {
    const spec = MUSTER.formations[key];
    const most = Math.max(1, Math.floor(room / spec.spacing) + 1);
    const shooters = foot.filter((man) => musterShoots(man.inputs));
    const rest = foot.filter((man) => !musterShoots(man.inputs));
    const shapeFor = (group) => ({
      spacing: spec.spacing,
      rowSpacing: spec.rowSpacing,
      stagger: spec.stagger,
      perRow: spec.wedge ? (row) => Math.min(most, 2 * row + 1)
        : spec.square ? () => Math.min(most, Math.max(2, Math.round(Math.sqrt(group.length))))
          : () => Math.min(most, Math.max(1, Math.ceil(group.length / spec.ranks))),
    });
    if (spec.shooters === 'front' && shooters.length && rest.length) {
      const depth = rows(shooters, 0, shapeFor(shooters));
      rows(rest, depth - spec.rowSpacing + MUSTER.shootersGap, shapeFor(rest));
    } else {
      // The shooters (if any) behind the rest, in the same shape; a side all of shooters is its own body.
      const depth = rows(rest, 0, shapeFor(rest));
      rows(shooters, rest.length ? depth : 0, shapeFor(shooters));
    }
  }
  // Too deep for the zone (a block of fifty on a short floor): the whole drawn up nearer the middle, as far as it must and may.
  const deepest = Math.max(0, ...places.filter(Boolean).map(([back]) => back));
  const over = Math.max(0, front + deepest - Math.abs(sign < 0 ? zone.x[0] : zone.x[1]));
  const forward = Math.min(over, front - MUSTER.neutral);
  for (const man of foot) places[man.index] = intoZone(level, corner, [sign * (front - forward + places[man.index][0]), places[man.index][1]]);
  // The riders on the flanks of the foot (as a level's wings stand), or all abreast if there is no foot.
  if (riders.length) {
    const wings = { ...(order.wings ?? {}) };
    const fake = riders.map((man) => ({ man }));
    placeWings(fake, sign, { wings }, { front: foot.length ? front : front - (wings.back ?? WINGS.back), width }, level.arena, (rider, x, z) => {
      places[rider.man.index] = intoZone(level, corner, [x, z]);
    });
  }
  return places;
}

/**
 * The level as set up: its own, but for the cast (`setup.cast`: each side's
 * men, in order) and, for a side placed by hand (`setup.places[corner]`: [x, z]
 * for each man), that side's formation: every man's place given (a `layout`
 * from no front, `placed`), keeping its level's drill and discipline, and its
 * wings (held where they stand) if it had them or now has riders.
 */
export function musterLevel(level, setup) {
  const formation = { ...level.formation };
  for (const corner of ['red', 'blue']) {
    const places = setup.places?.[corner];
    if (!places) continue;
    const sign = MUSTER_SIGN[corner];
    const own = level.formation?.[corner] ?? {};
    const riders = setup.cast[corner].some(musterRides);
    formation[corner] = {
      ...(own.drill ? { drill: own.drill } : {}),
      ...(own.discipline !== undefined ? { discipline: own.discipline } : {}),
      ...(own.wings || riders ? { wings: own.wings ?? {} } : {}),
      front: 0,
      // createWorld puts a layout's man at x = sign·(front + back), z = sign·across.
      layout: places.map(([x, z]) => [sign * x, sign * z]),
      loose: MUSTER.loose,
      placed: true,
    };
  }
  const cast = (corner) => setup.cast[corner].map((inputs) => structuredClone(inputs));
  return { ...level, formation, cast: () => ({ red: cast('red'), blue: cast('blue') }), mustered: true };
}

/** The man a side plays as: the `index`th of that side (the first, if there is no such man). */
export function leadOf(fighters, corner, index = 0) {
  let first = null;
  let seen = 0;
  for (const fighter of fighters) {
    if (fighter.corner !== corner) continue;
    if (seen === index) return fighter;
    first ??= fighter;
    seen += 1;
  }
  return first;
}
