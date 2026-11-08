// What the Korea battles (02-05) share: the hero and his living comrades made into fighters of the battle, placed where a
// man of his rank stood, and the armies set down where the battle had them. Each battle file has its own history; this
// is only the placing.
//
// Places are given in the world's own metres (x along the field, red at -x, blue at +x; z across), and turned into each
// side's formation `layout` (physics.js createWorld: [back, across] behind a `front` of 0, which is x = sign × back,
// z = sign × across). No side here is drawn apart (scenarios.js SPREAD): the works stand where the lines are put.

import { normaliseInputs } from '../../body.js';
import { mingSoldier } from '../../cast.js';

/** The outfit kind by a man's rank (the life's `kit` for the hero, where it gives one). */
export const KOREA_KIT = { soldier: 'mingGarrison', squadLeader: 'mingBrigandine', officer: 'mingElite' };
// The rank each kit is cast as (cast.js mingSoldier), for a stand-in man's build.
const KOREA_CAST_RANK = { mingGarrison: 'garrison', mingBrigandine: 'brigandine', mingElite: 'elite' };

/** His age in a battle's year, from the year he was born (aging.js reads `age`). */
const koreaAge = (born, year) => (Number.isFinite(born) ? Math.max(16, year - born) : undefined);

/**
 * A man of the life (the hero, or a comrade) as a fighter of this battle: his own body, in his rank's kit, with the
 * weapon of the place he stands in (the army armed a man for his place in the line: a shield in the squad's front, a
 * spear behind it). `design`: the army's colour for each kit.
 */
export function koreaFighter(man, { year, kit, style, design = {} }) {
  const inputs = structuredClone(man.inputs ?? {});
  const kind = kit ?? inputs.outfit?.kind ?? 'mingGarrison';
  const age = koreaAge(man.born, year) ?? inputs.age;
  return normaliseInputs({
    ...inputs,
    name: man.name?.en ?? inputs.name,
    style: style ?? inputs.style,
    ...(age === undefined ? {} : { age }),
    outfit: { ...inputs.outfit, kind, design: design[kind] ?? inputs.outfit?.design ?? 0 },
  });
}

/** The comrades still living, closest first (bond, then rank), as they would stand by him. */
export function koreaComrades(life) {
  const rankOrder = { officer: 0, squadLeader: 1, soldier: 2 };
  return (life.comrades ?? []).filter((comrade) => comrade.alive !== false).sort((a, b) => (b.bond ?? 0) - (a.bond ?? 0) || (rankOrder[a.rank] ?? 3) - (rankOrder[b.rank] ?? 3));
}

/** The hero's own kit: the life's, else his rank's. */
export const koreaHeroKit = (life) => life.kit ?? KOREA_KIT[life.rank] ?? 'mingGarrison';

// The Ming kits from least to most protection (outfits.js): the hemp vest, the brigandine, the elite's.
const KOREA_KIT_ORDER = ['mingGarrison', 'mingBrigandine', 'mingElite'];
/**
 * What a man wears in the place he is given: what that place in the line was issued (the column's armour, where the army
 * armoured it), or his rank's kit where that is better. A soldier put in a brigandine column wears the brigandine too.
 */
export function koreaKitFor(rankKit, placeKit) {
  const rank = KOREA_KIT_ORDER.indexOf(rankKit);
  const place = KOREA_KIT_ORDER.indexOf(placeKit);
  return place > rank ? placeKit : rankKit;
}

/** A side's layout from world places ([x, z] each, in the side's cast order). */
export function koreaLayout(corner, places) {
  const sign = corner === 'red' ? -1 : 1;
  return places.map(([x, z]) => [sign * x, sign * z]);
}

/**
 * The battle's fighters and the indices the engine reads, from each side's men and places in order: `red` and `blue`
 * each { men: [inputs], places: [[x, z]] }; the hero is `hero` (an index into his side's men), his comrades `comrades`
 * ({ id: index into his side }). Returns { fighters, layouts, player, comrades } (indices into `fighters`).
 */
export function koreaAssemble({ red, blue, heroCorner, hero, comrades }) {
  const fighters = [...red.men.map((inputs) => ({ inputs, corner: 'red' })), ...blue.men.map((inputs) => ({ inputs, corner: 'blue' }))];
  const offset = heroCorner === 'red' ? 0 : red.men.length;
  return {
    fighters,
    layouts: { red: koreaLayout('red', red.places), blue: koreaLayout('blue', blue.places) },
    player: offset + hero,
    comrades: Object.fromEntries(Object.entries(comrades).map(([id, index]) => [id, offset + index])),
  };
}

/** A stand-in Ming soldier of the same army, for a place the life does not fill. */
export const koreaStandIn = (random, style, kit, { people = 'qi', design = {} } = {}) => mingSoldier(random, style, KOREA_CAST_RANK[kit] ?? 'brigandine', { people, design: design[kit] ?? null });

/**
 * A body of men in rows: `styles` in order, `abreast` to a row `spacing` m apart, rows `rowSpacing` m behind each other
 * (`back`: the way behind, -1 for a side facing +x), the first row's middle at `at`. Each man from `make(style)`.
 * Returns { men, places } (append to a side's).
 */
export function koreaRows({ at, styles, abreast, spacing, rowSpacing, back = -1, make }) {
  const men = [];
  const places = [];
  styles.forEach((style, index) => {
    const row = Math.floor(index / abreast);
    const inRow = Math.min(abreast, styles.length - row * abreast);
    men.push(make(style));
    places.push([at[0] + back * row * rowSpacing, at[1] + ((index % abreast) - (inRow - 1) / 2) * spacing]);
  });
  return { men, places };
}

/** Styles from counts ({ style: n }), in the order given. */
export const koreaStyles = (counts) => Object.entries(counts).flatMap(([style, n]) => Array.from({ length: n }, () => style));

/**
 * The hero and his living comrades seated in a side already cast and placed (`side`: { men, places }, changed in
 * place): the hero in the place nearest `at` (on foot; a rider's place is not his), each comrade in the next nearest to
 * the hero's, closest bond first; each takes his place's weapon. Returns { hero, comrades: { id: index } } into the side.
 */
export function koreaSeat(life, side, { at, year, design = {} }) {
  const onFoot = (index) => !side.men[index].mounted;
  const distance = (index, to) => Math.hypot(side.places[index][0] - to[0], side.places[index][1] - to[1]);
  const indices = side.men.map((_, index) => index).filter(onFoot);
  const hero = indices.reduce((best, index) => (distance(index, at) < distance(best, at) ? index : best), indices[0]);
  const seat = side.places[hero];
  side.men[hero] = koreaFighter(life.hero, { year, kit: koreaKitFor(koreaHeroKit(life), side.men[hero].outfit?.kind), style: side.men[hero].style, design });
  const near = indices.filter((index) => index !== hero).sort((a, b) => distance(a, seat) - distance(b, seat));
  const comrades = {};
  for (const [k, comrade] of koreaComrades(life).slice(0, near.length).entries()) {
    const index = near[k];
    side.men[index] = koreaFighter(comrade, { year, kit: koreaKitFor(KOREA_KIT[comrade.rank] ?? 'mingGarrison', side.men[index].outfit?.kind), style: side.men[index].style, design });
    comrades[comrade.id] = index;
  }
  return { hero, comrades };
}

/** How far back of the front a man of this rank and place stands (m): the hero's row in an attack. */
export function koreaRowOf(life, rows) {
  if (life.rank === 'officer') return rows.officer;
  if (life.rank === 'squadLeader') return rows.squadLeader;
  return rows[life.place] ?? rows.front;
}
