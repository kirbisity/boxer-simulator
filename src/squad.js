// Last Stand Squad's muster (lastgate.js is the run): who the player brings to the gate. His hero is the level's
// champion (LAST_GATE_MODES[mode].hero, always there, never paid for); the rest of his squad he buys out of a budget of
// points, each man priced by how good he is (roster.js ratingOf: a type's fitted strength, ∝ K/D) on a square-root scale,
// so a squad is a handful of men whichever way it is spent: a few champions or more common soldiers. The level's own
// people are offered first (its `factions`); any other fighter of the roster may be hired as a mercenary, on foot, at the
// same price (the player's choice: an odd squad is part of the fun, and the budget keeps it fair). Machines bolted to
// their legs (no man on foot) and the unrated (no price) are not offered.
// No DOM here: lastgateview.js draws the builder; musterview.js places the men (on lastStandLevel, the gate's ground as a level).

import { normaliseInputs } from './body.js';
import { boltedOn, isMounted } from './horses.js';
import { LAST_GATE, LAST_GATE_MODES, lastGateDefaultPlaces, lastGateZone } from './lastgate.js';
import { STYLES } from './moves.js';
import { FACTIONS } from './outfits.js';
import { ratingOf, starsOf, WARRIORS } from './roster.js';
import { t, tname } from './i18n.js';

export const SQUAD = {
  // Points to spend on the comrades: ~60 buys five ashigaru, three samurai, two footmen and a knight, or seven bowmen.
  budget: 60,
  // A man's price: `scale` × √rating, rounded, at least `least` (Maximus, 100, is 10; the Ōdachi Champion, 385, 20).
  scale: 1,
  least: 2,
  // The most comrades beside the hero (the squad 8 at most: a phone's frame, and the gate's width), and the fewest (none: alone).
  most: 7,
  // Where the last squad bought for each level is kept in this browser (a level's key after it).
  storageKey: 'gladiator/laststand-squad',
};

/** A fighter's price in points (by his rating; one unrated is priced as the cheapest). */
export function squadCost(inputs) {
  const rating = ratingOf(inputs);
  return Math.max(SQUAD.least, Math.round(SQUAD.scale * Math.sqrt(rating ?? 0)));
}

/**
 * The men offered for a level (`factions`: its own people, first): each roster fighter, on foot, as { key, label, faction,
 * own (one of the level's), cost, stars, shoots, make() } — the level's own first (cheapest first), then the rest of the
 * roster by faction (FACTIONS' order), cheapest first.
 */
export function squadUnits(factions = []) {
  const order = Object.keys(FACTIONS);
  const units = WARRIORS.filter((warrior) => !boltedOn(warrior.inputs) && ratingOf(warrior.inputs)).map((warrior) => ({
    key: warrior.key,
    label: warrior.title,
    line: warrior.line,
    faction: warrior.faction,
    own: factions.includes(warrior.faction),
    cost: squadCost(warrior.inputs),
    stars: starsOf(warrior.inputs),
    shoots: Boolean(STYLES[warrior.inputs.style]?.ranged),
    make: () => ({ ...structuredClone(warrior.inputs), mounted: false, rosterKey: warrior.key }),
  }));
  const rank = (unit) => (unit.own ? factions.indexOf(unit.faction) : factions.length + order.indexOf(unit.faction));
  return units.sort((a, b) => rank(a) - rank(b) || a.cost - b.cost || a.label.localeCompare(b.label));
}

/** What a squad (`picks`: { [unit key]: count }) costs, and how many men it is. */
export function squadSpent(units, picks) {
  let points = 0;
  let men = 0;
  for (const unit of units) {
    const count = picks[unit.key] ?? 0;
    points += count * unit.cost;
    men += count;
  }
  return { points, men };
}

/** Whether one more of this unit fits the squad: the points left and the room for one more man. */
export function squadCanAdd(units, picks, key, budget = SQUAD.budget) {
  const unit = units.find((each) => each.key === key);
  if (!unit) return false;
  const { points, men } = squadSpent(units, picks);
  return men < SQUAD.most && points + unit.cost <= budget;
}

/** The squad with one more (`step` 1) or one fewer (−1) of a unit, if it fits; else as it was. */
export function squadStep(units, picks, key, step, budget = SQUAD.budget) {
  if (step > 0 && !squadCanAdd(units, picks, key, budget)) return picks;
  const count = Math.max(0, (picks[key] ?? 0) + step);
  const next = { ...picks, [key]: count };
  if (!count) delete next[key];
  return next;
}

/** The comrades of a squad, made (each unit's men in the units' order). */
export function squadMen(units, picks) {
  return units.flatMap((unit) => Array.from({ length: picks[unit.key] ?? 0 }, () => unit.make()));
}

/**
 * A squad as a first visit has it: the level's soldier (`prefer`, a roster key), else its own cheapest kind that is not a
 * shooter, as many as the budget buys (up to SQUAD.most), so the first run is a squad of the level's soldiers.
 */
export function firstSquad(units, prefer = null, budget = SQUAD.budget) {
  const unit = units.find((each) => each.key === prefer) ?? units.find((each) => each.own && !each.shoots) ?? units[0];
  if (!unit) return {};
  return { [unit.key]: Math.min(SQUAD.most, Math.floor(budget / unit.cost)) };
}

/** A kept squad brought inside the rules: known units only, whole counts, within the budget and the room (the last over dropped). */
export function settleSquad(units, picks) {
  let settled = {};
  for (const unit of units) {
    const count = Math.floor(Number(picks?.[unit.key]) || 0);
    for (let k = 0; k < count; k += 1) settled = squadStep(units, settled, unit.key, 1);
  }
  return settled;
}

/** The last squad bought for a level in this browser (settled), or a first visit's; storage that throws keeps nothing. */
export function readSquad(mode, units, { storage = globalThis.localStorage, prefer = null } = {}) {
  try {
    const text = storage?.getItem(`${SQUAD.storageKey}/${mode}`);
    if (text) return settleSquad(units, JSON.parse(text));
  } catch {
    // (Private browsing, storage blocked or a garbled entry: start afresh.)
  }
  return firstSquad(units, prefer);
}

/** Keep a level's squad in this browser; false where the browser will not keep it. */
export function writeSquad(mode, picks, storage = globalThis.localStorage) {
  try {
    storage.setItem(`${SQUAD.storageKey}/${mode}`, JSON.stringify(picks));
    return true;
  } catch {
    return false;
  }
}

/**
 * The squad's placing as a level for musterview.js (locked, its one side red): the gate's field (`zones`: the squad's
 * ground before the gate; the foes' out in the mist), the wall and the gateway drawn on it (`marks`), the hero and his men
 * (`men`, squad.js squadMen) at their default places (lastgate.js), and the gate's own formation for "At the gate" (a
 * `layout` of those places: muster.js drawUp). `units` tell the hero and each roster fighter apart for the map's words.
 */
export function lastStandLevel(mode, men) {
  const spec = LAST_GATE_MODES[mode] ?? LAST_GATE_MODES.samurai;
  const hero = normaliseInputs(spec.hero());
  const { gate, arena, spawn } = LAST_GATE;
  const rides = isMounted(hero);
  const places = lastGateDefaultPlaces(men.length, rides);
  // The front of a formation drawn up here (m from the middle line toward red's end: x = −(front + back)), 3.5 m out from
  // the gate: a line or a block across the gateway's mouth; "At the gate" places each foot man `back` from it.
  const front = -(gate.x + 3.5);
  const foot = places.filter((_, index) => !(index === 0 && rides));
  const units = [
    { id: 'hero', label: t('squad.you', { label: tname(spec.label) }), mounted: rides, shoots: Boolean(STYLES[hero.style]?.ranged), make: () => structuredClone(hero), matches: (inputs) => inputs.name === hero.name && !inputs.rosterKey },
    ...squadUnits(spec.factions).map((unit) => ({ id: unit.key, label: unit.label, mounted: false, shoots: unit.shoots, make: unit.make, matches: (inputs) => inputs.rosterKey === unit.key })),
  ];
  const zone = lastGateZone();
  const across = arena.halfZ - LAST_GATE.zone.edge;
  return {
    title: `${spec.glyph} ${tname(spec.title)}`,
    place: 'The gate',
    scene: LAST_GATE.place,
    arena: { halfX: arena.halfX, halfZ: arena.halfZ },
    zones: { red: zone, blue: { x: [spawn.x - 1, arena.halfX - LAST_GATE.zone.edge], z: [-across, across] } },
    marks: [
      { from: [gate.x, -arena.halfZ], to: [gate.x, -gate.halfWidth], width: 0.5, colour: 'rgba(214, 208, 192, 0.85)' },
      { from: [gate.x, gate.halfWidth], to: [gate.x, arena.halfZ], width: 0.5, colour: 'rgba(214, 208, 192, 0.85)' },
    ],
    formation: { red: { front, spacing: 1.4, rowSpacing: 1.4, layout: foot.map(([x, z]) => [-x - front, -z]) } },
    formationLabel: 'At the gate',
    units: { red: units, blue: [] },
    caps: { side: SQUAD.most + 1, total: SQUAD.most + 1 },
    sideNames: { red: 'Your squad', blue: spec.foes },
    cast: () => ({ red: [structuredClone(hero), ...men.map((inputs) => structuredClone(inputs))], blue: [] }),
    places: { red: places, blue: [] },
  };
}
