// A custom battle: the player's own, in Battle Mode. He picks the ground (one of the places a battle is fought in),
// a faction for each side (outfits.js FACTIONS), how many of each of its fighters (roster.js WARRIORS, on foot or, where
// his people rode, on horse) and where each man stands (the setup screen, musterview.js). Nothing here draws or fights:
// a battle is plain data (`battle`: map, factions, each side's men by unit with their places, the man played), kept in
// the browser between visits, and `customLevel(battle)` makes of it a level like any of scenarios.js's, which
// muster.js musterLevel sets up and main.js fights.

import { boltedOn, canRide, isMounted } from './horses.js';
import { STYLES } from './moves.js';
import { FACTIONS } from './outfits.js';
import { WARRIORS } from './roster.js';
import { drawUp, intoZone, MUSTER } from './muster.js';
import { tname } from './i18n.js';
import { SUBWAY_ARENA } from './props/subway.js';

export const CUSTOM_BATTLE = {
  // Its key where a level's would be (main.js state.scenario; the menu's card).
  key: 'custom',
  title: 'Custom Battle',
  storageKey: 'gladiator.customBattle.v1',
  // The men a side, and both together: no more than the biggest set battles field (Cajamarca's fifty-two Inca a side;
  // about seventy in all: the physics steps each man every frame).
  caps: { side: MUSTER.cap, total: 70 },
  // The ground: the places a battle is fought in, each with the floor and the camera its set battles have there
  // (scenarios.js, drawn apart: the riders' room to charge and wheel; the town, the water town and the port only as wide
  // as their house fronts, shops and containers leave), `glyph` for its card where it has no picture.
  maps: {
    field: { label: 'Open field', glyph: '🌾', arena: { halfX: 45, halfZ: 30 }, camera: { yaw: -0.5, pitch: 0.42, distance: 36, maxDistance: 52 } },
    plain: { label: 'The plain', glyph: '🏞️', arena: { halfX: 30, halfZ: 15 }, camera: { yaw: -0.5, pitch: 0.45, distance: 28, maxDistance: 38 } },
    meadow: { label: 'Meadow', glyph: '🌼', arena: { halfX: 12, halfZ: 8 }, camera: { yaw: -0.5, pitch: 0.42, distance: 13, maxDistance: 17 } },
    sengoku: { label: 'Sengoku valley', glyph: '🏯', arena: { halfX: 30, halfZ: 15 }, camera: { yaw: -0.5, pitch: 0.42, distance: 28, maxDistance: 36 } },
    sarhu: { label: 'Sarhu hills', glyph: '⛰️', arena: { halfX: 30.5, halfZ: 15 }, camera: { yaw: -0.5, pitch: 0.42, distance: 28, maxDistance: 36 } },
    town: { label: 'Market town', glyph: '🏘️', arena: { halfX: 11.5, halfZ: 8.5 }, camera: { yaw: -0.55, pitch: 0.42, distance: 10.5, maxDistance: 10.5 } },
    jiangnan: { label: 'Water town', glyph: '🛶', arena: { halfX: 18, halfZ: 9 }, camera: { yaw: -0.5, pitch: 0.42, distance: 19, maxDistance: 24 } },
    cajamarca: { label: 'Cajamarca square', glyph: '☀️', arena: { halfX: 16, halfZ: 11 }, camera: { yaw: -0.5, pitch: 0.48, distance: 19, maxDistance: 25 } },
    coastFort: { label: 'Coast fort', glyph: '⚓', arena: { halfX: 17.5, halfZ: 10 }, camera: { yaw: -0.5, pitch: 0.42, distance: 18.5, maxDistance: 23 } },
    port: { label: 'Harbour', glyph: '🚢', arena: { halfX: 11, halfZ: 6 }, camera: { yaw: -0.6, pitch: 0.36, distance: 10, maxDistance: 12 } },
    mobei: { label: 'Gobi steppe', glyph: '🐎', arena: { halfX: 45, halfZ: 30 }, camera: { yaw: -0.5, pitch: 0.42, distance: 36, maxDistance: 52 } },
    catalaunian: { label: 'Catalaunian plains', glyph: '🌿', arena: { halfX: 45, halfZ: 30 }, camera: { yaw: -0.5, pitch: 0.42, distance: 36, maxDistance: 52 } },
    carrhae: { label: 'Desert', glyph: '🏜️', arena: { halfX: 45, halfZ: 30 }, camera: { yaw: -0.5, pitch: 0.42, distance: 36, maxDistance: 52 } },
    // The other battles' grounds (each its level's floor, without its works: the stakes and ditches were that day's; render.js PLACE_ARENAS).
    agincourt: { label: 'Agincourt field', glyph: '🏹', arena: { halfX: 50, halfZ: 11.5 }, camera: { yaw: -0.5, pitch: 0.42, distance: 30, maxDistance: 46 } },
    cerignola: { label: 'Cerignola slope', glyph: '🍇', arena: { halfX: 32, halfZ: 11 }, camera: { yaw: -0.5, pitch: 0.42, distance: 22, maxDistance: 30 } },
    coastVillage: { label: 'Coast village', glyph: '🛖', arena: { halfX: 12, halfZ: 8 }, camera: { yaw: -0.5, pitch: 0.42, distance: 13, maxDistance: 17 } },
    subway: { label: 'Subway', glyph: '🚇', arena: SUBWAY_ARENA, camera: { yaw: -0.25, pitch: 0.3, distance: 8, maxDistance: 10 } },
    stadium: { label: 'Stadium', glyph: '🏟️', arena: { halfX: 10, halfZ: 7 }, camera: { yaw: -0.35, pitch: 0.36, distance: 12, maxDistance: 15 } },
  },
  // A side drawn up as the level has it: ten or twelve abreast, the bows and guns in front (formation.js), the riders on the flanks.
  order: { spacing: 1.2, rowSpacing: 1.5, perRow: 12, shootersFront: 4, frontShare: 0.3, frontMost: 14 },
  // A first visit: knights against samurai on the open field, the first kinds of each (the roster's most armoured first).
  first: { map: 'field', factions: { red: 'knights', blue: 'japanese' }, kinds: 3, each: 4 },
};

const CUSTOM_CORNERS = ['red', 'blue'];

/** The factions a side may be: those with fighters in the roster, in FACTIONS' order ({ key, label, glyph }). */
export function customFactions() {
  return Object.entries(FACTIONS).filter(([key]) => WARRIORS.some((warrior) => warrior.faction === key)).map(([key, faction]) => ({ key, label: faction.label, glyph: faction.glyph }));
}

/**
 * A faction's units: each of its fighters (WARRIORS) on foot, and again on his horse where his people rode (a robot
 * bolted to its legs only so). `id` "warrior" or "warrior.horse"; `make()` one of them (his own inputs, tagged with his
 * roster key so the man is known for one of them again: `matches`).
 */
export function customUnitsOf(faction) {
  const units = [];
  for (const warrior of WARRIORS) {
    if (warrior.faction !== faction) continue;
    const rides = canRide(warrior.inputs);
    const bolted = boltedOn(warrior.inputs);
    for (const mounted of [false, true]) {
      if (mounted ? !rides : bolted) continue;
      units.push({
        id: mounted && !bolted ? `${warrior.key}.horse` : warrior.key,
        warrior: warrior.key,
        label: warrior.title,
        mounted,
        shoots: Boolean(STYLES[warrior.inputs.style]?.ranged),
        make: () => ({ ...structuredClone(warrior.inputs), mounted, rosterKey: warrior.key }),
        matches: (inputs) => inputs.rosterKey === warrior.key && isMounted(inputs) === mounted,
      });
    }
  }
  return units;
}

/** The ground a battle is fought on (its map's, else the first's). */
const mapOf = (battle) => CUSTOM_BATTLE.maps[battle.map] ?? CUSTOM_BATTLE.maps[CUSTOM_BATTLE.first.map];

/** A side's order: CUSTOM_BATTLE.order, its front a share of the floor's half-length (formation.js `front`). */
function customOrder(arena) {
  const { spacing, rowSpacing, perRow, shootersFront, frontShare, frontMost } = CUSTOM_BATTLE.order;
  return { front: Math.max(MUSTER.neutral, Math.min(frontMost, arena.halfX * frontShare)), spacing, rowSpacing, perRow, shootersFront, wings: {} };
}

/**
 * The level a custom battle is (as scenarios.js battleOf's): its place and floor, each side drawn up as CUSTOM_BATTLE.order
 * (for musterview.js's "as the level"), its own units (muster.js unitsOf), caps, sides' names, and `cast(random)` its men;
 * `places` each side's men where he put them.
 */
export function customLevel(battle) {
  const map = mapOf(battle);
  const units = Object.fromEntries(CUSTOM_CORNERS.map((corner) => [corner, customUnitsOf(battle.factions[corner])]));
  const sideNames = Object.fromEntries(CUSTOM_CORNERS.map((corner) => [corner, FACTIONS[battle.factions[corner]]?.label ?? corner]));
  const level = {
    title: CUSTOM_BATTLE.title,
    place: map.label,
    blurb: { en: `${sideNames.red} against ${sideNames.blue}, on the ${map.label.toLowerCase()}.`, zh: `${tname(sideNames.red)}对阵${tname(sideNames.blue)}，战于${tname(map.label)}。` },
    scene: battle.map in CUSTOM_BATTLE.maps ? battle.map : CUSTOM_BATTLE.first.map,
    arena: { ...map.arena },
    camera: { ...map.camera },
    formation: { red: customOrder(map.arena), blue: customOrder(map.arena) },
    units,
    caps: { ...CUSTOM_BATTLE.caps },
    sideNames,
    custom: true,
    fighters: [],
  };
  const men = Object.fromEntries(CUSTOM_CORNERS.map((corner) => [corner, battle.sides[corner].men.map((man) => units[corner].find((unit) => unit.id === man.unit)).filter(Boolean)]));
  level.cast = () => Object.fromEntries(CUSTOM_CORNERS.map((corner) => [corner, men[corner].map((unit) => unit.make())]));
  level.places = Object.fromEntries(CUSTOM_CORNERS.map((corner) => [corner, battle.sides[corner].men.filter((man) => units[corner].some((unit) => unit.id === man.unit)).map((man) => man.at)]));
  return level;
}

/** How many of each unit a side has: { [unit id]: count }. */
export function customCounts(side) {
  const counts = {};
  for (const man of side.men) counts[man.unit] = (counts[man.unit] ?? 0) + 1;
  return counts;
}

/**
 * A battle kept inside its bounds: a known map and factions, each side's men only of its faction's units, every man in his
 * side's ground, and no more men than the caps (a side over its cap, then the bigger side over the total, loses its last).
 */
export function settleBattle(battle) {
  const first = CUSTOM_BATTLE.first;
  const factions = new Set(customFactions().map((faction) => faction.key));
  const settled = {
    version: 1,
    map: battle?.map in CUSTOM_BATTLE.maps ? battle.map : first.map,
    factions: Object.fromEntries(CUSTOM_CORNERS.map((corner) => [corner, factions.has(battle?.factions?.[corner]) ? battle.factions[corner] : first.factions[corner]])),
    sides: {},
    lead: null,
  };
  const level = customLevel({ ...settled, sides: { red: { men: [] }, blue: { men: [] } } });
  for (const corner of CUSTOM_CORNERS) {
    const known = new Set(level.units[corner].map((unit) => unit.id));
    const men = (Array.isArray(battle?.sides?.[corner]?.men) ? battle.sides[corner].men : [])
      .filter((man) => known.has(man?.unit) && Array.isArray(man.at) && man.at.every(Number.isFinite))
      .slice(0, CUSTOM_BATTLE.caps.side)
      .map((man) => ({ unit: man.unit, at: intoZone(level, corner, man.at) }));
    const formation = battle?.sides?.[corner]?.formation;
    settled.sides[corner] = { men, formation: formation === 'level' || formation === 'hand' || formation in MUSTER.formations ? formation : 'level' };
  }
  while (settled.sides.red.men.length + settled.sides.blue.men.length > CUSTOM_BATTLE.caps.total) {
    const bigger = settled.sides.red.men.length >= settled.sides.blue.men.length ? 'red' : 'blue';
    settled.sides[bigger].men.pop();
  }
  const lead = battle?.lead;
  if (lead && CUSTOM_CORNERS.includes(lead.corner) && Number.isInteger(lead.index) && lead.index >= 0 && lead.index < settled.sides[lead.corner].men.length) settled.lead = { corner: lead.corner, index: lead.index };
  return settled;
}

/** A side of `faction` as a first visit has it: its first kinds (CUSTOM_BATTLE.first), so many of each, drawn up on `map`. */
export function freshSide(map, faction, corner) {
  const { kinds, each } = CUSTOM_BATTLE.first;
  const units = customUnitsOf(faction).filter((unit) => !unit.mounted).slice(0, kinds);
  const picked = units.flatMap((unit) => Array.from({ length: each }, () => unit));
  const level = customLevel({ map, factions: { red: faction, blue: faction }, sides: { red: { men: [] }, blue: { men: [] } } });
  const places = drawUp(level, corner, picked.map((unit) => unit.make()), 'level');
  return { men: picked.map((unit, index) => ({ unit: unit.id, at: places[index] })), formation: 'level' };
}

/** The battle a first visit opens on. */
export function firstBattle() {
  const { map, factions } = CUSTOM_BATTLE.first;
  return settleBattle({ map, factions, sides: Object.fromEntries(CUSTOM_CORNERS.map((corner) => [corner, freshSide(map, factions[corner], corner)])) });
}

/** The last custom battle set up in this browser (settled), or a first visit's; a storage that cannot be read is no memory. */
export function readCustomBattle(storage = globalThis.localStorage) {
  try {
    const text = storage?.getItem(CUSTOM_BATTLE.storageKey);
    if (text) return settleBattle(JSON.parse(text));
  } catch {
    // (Private browsing, storage blocked or a garbled entry: start afresh.)
  }
  return firstBattle();
}

/** Keep a custom battle in this browser, for the next visit; false where the browser will not keep it. */
export function writeCustomBattle(battle, storage = globalThis.localStorage) {
  try {
    storage.setItem(CUSTOM_BATTLE.storageKey, JSON.stringify(settleBattle(battle)));
    return true;
  } catch {
    return false;
  }
}

/** The battle with its map or a side's faction changed: a side of a new faction starts as a first visit's; any side moved onto a new map kept in its ground. */
export function changeBattle(battle, { map = battle.map, factions = {} } = {}) {
  const sides = Object.fromEntries(CUSTOM_CORNERS.map((corner) => {
    const faction = factions[corner] ?? battle.factions[corner];
    return [corner, faction === battle.factions[corner] ? battle.sides[corner] : freshSide(map, faction, corner)];
  }));
  const fresh = Object.fromEntries(CUSTOM_CORNERS.map((corner) => [corner, factions[corner] ?? battle.factions[corner]]));
  const changed = settleBattle({ map, factions: fresh, sides, lead: battle.lead });
  // A floor of another size: each side drawn up again in its own order (places on the old floor mean little on the new).
  if (map !== battle.map) {
    const level = customLevel(changed);
    for (const corner of CUSTOM_CORNERS) {
      const side = changed.sides[corner];
      const made = side.men.map((man) => level.units[corner].find((unit) => unit.id === man.unit).make());
      const places = drawUp(level, corner, made, side.formation === 'hand' ? 'level' : side.formation);
      side.men = side.men.map((man, index) => ({ unit: man.unit, at: places[index] }));
      if (side.formation === 'hand') side.formation = 'level';
    }
  }
  return changed;
}

/** A battle as the setup screen hands one over to be fought (muster.js musterLevel's setup): its men, every one placed, the man played, and the battle itself (`battle`: main.js makes its level of it). */
export function customSetup(battle) {
  const level = customLevel(battle);
  return { cast: level.cast(), places: level.places, lead: battle.lead, battle };
}
