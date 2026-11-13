// The story's three Liaodong battles (06-liaodong, 07-sarhu, 08-hunriver): what they share. Each battle lists its men as
// it really stood, every man with his place on the field (`at`: world x, z in m; red, the Ming, at -x as createWorld puts it)
// and his part there (`role`: 'front', 'second', 'rear' of his file, 'lead' of his squad or company, 'officer' over it); then
// the hero is stood in the place of a man of his rank and the comrades still living beside him (northPlace), each taking the
// place of a man the battle had there: the numbers are the battle's, never more for the hero having friends.
// Names here are prefixed `north`: the bundle is one scope (tools/bundle.js).

import { normaliseInputs } from '../../body.js';
import { greyedHair } from '../../aging.js';
import { kitRides } from '../../horses.js';
import { koreaKitFor } from './korea.js';

export const NORTH = {
  // The kit by rank, as the life gives it (src/story/life.js STORY.kit): the garrison man's padded coat, a squad leader's
  // brigandine, an officer's elite coat.
  kit: { soldier: 'mingGarrison', squadLeader: 'mingBrigandine', officer: 'mingElite' },
  // His age: never under a recruit's.
  youngest: 16,
  // The part of the field a man of each rank stands in: a soldier where his life says (front, second or rear of his file),
  // a squad leader at his squad's head, an officer over his company.
  roleOf: { squadLeader: 'lead', officer: 'officer' },
  // A comrade's place: the nearest to him, one in his own unit (his squad, his file) before one of another this much (m) nearer:
  // a man stands with his own squad, unless another squad's place is a whole man's width closer.
  sameUnit: 0.8,
};

const northClone = (value) => (value === undefined ? undefined : structuredClone(value));
const northAge = (born, year) => Math.max(NORTH.youngest, Math.round(year - born));

/** The hero as he goes into this battle: his body, his age in its year, greying, in his rank's kit. */
export function northHeroInputs(life, year) {
  const inputs = normaliseInputs(northClone(life.hero.inputs));
  if (life.hero.born) inputs.age = northAge(life.hero.born, year);
  inputs.name = life.hero.name?.en ?? inputs.name;
  if (life.hero.natural && inputs.look) inputs.look.hairColor = greyedHair(life.hero.natural, inputs.age);
  inputs.outfit = { ...inputs.outfit, kind: life.kit ?? NORTH.kit[life.rank] ?? NORTH.kit.soldier };
  return normaliseInputs(inputs);
}

/** A comrade as he goes into it: his age then, greying, in his rank's kit. */
export function northComradeInputs(comrade, year) {
  const inputs = normaliseInputs(northClone(comrade.inputs));
  if (comrade.born) inputs.age = northAge(comrade.born, year);
  inputs.name = comrade.name?.en ?? inputs.name;
  if (comrade.natural && inputs.look) inputs.look.hairColor = greyedHair(comrade.natural, inputs.age);
  inputs.outfit = { ...inputs.outfit, kind: NORTH.kit[comrade.rank] ?? inputs.outfit?.kind ?? NORTH.kit.soldier };
  return normaliseInputs(inputs);
}

/** The part of the field his rank stands him in. */
export function northRole(life) {
  return NORTH.roleOf[life.rank] ?? (['front', 'second', 'rear'].includes(life.place) ? life.place : 'front');
}

const northDistance = (a, b) => Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]);

/**
 * A man put in a place, in the better of his own kit and what that place was issued (korea.js koreaKitFor); and a place on
 * horse (a rider's: its man cast `mounted`) is a horse with it: the man put there rides it, the place's horse (its breed,
 * outfit `horse`), as the man he stands in for did. A coat that is no rider's (the garrison's hemp vest: its kit names no
 * horse, horses.js kitRides) gives way to the place's own, the rider's harness that went with the horse. A place is the
 * battle's, and so is its horse: never one more for him, nor one fewer.
 */
function northDressed(inputs, place) {
  const outfit = { ...inputs.outfit, kind: koreaKitFor(inputs.outfit?.kind, place.inputs?.outfit?.kind) };
  if (!place.inputs?.mounted) return normaliseInputs({ ...inputs, outfit });
  const horse = place.inputs.outfit?.horse ? { horse: place.inputs.outfit.horse } : {};
  const rides = kitRides({ ...inputs, outfit });
  return normaliseInputs({ ...inputs, mounted: true, outfit: { ...outfit, ...(rides ? {} : { kind: place.inputs.outfit.kind, design: place.inputs.outfit.design }), ...horse } });
}

/**
 * The hero and his comrades into the Ming's men (`men`: [{ inputs, name, at, role, unit, named? }], changed in place).
 * His place: the nearest to `near` ([x, z]) of the places of his part (northRole, or the `role` his post gives: the
 * deploy screen's, src/story/deploy.js), or of any part of one `unit` (a post with a unit of its own: the riders at a
 * column's head); a historical man (`named`) is never displaced. His living comrades, the closest bond first, each in the
 * free place nearest him (his own unit's first, within NORTH.beside). Returns { player, comrades: { id: index }, squad:
 * [indices of his unit], slot: { x, z } }.
 */
export function northPlace(life, men, near, year, { role: posted = null, unit = null } = {}) {
  const role = posted ?? northRole(life);
  const free = (index) => !men[index].named;
  const ofRole = (wanted) => men.map((man, index) => index).filter((index) => free(index) && men[index].role === wanted && (!unit || men[index].unit === unit));
  const ofUnit = unit && !posted ? men.map((man, index) => index).filter((index) => free(index) && men[index].unit === unit) : [];
  // A battle with no officer's place free (its officers history's own men) stands an officer at the head of a unit.
  const pool = (ofUnit.length ? ofUnit : null) ?? [role, role === 'officer' ? 'lead' : null].filter(Boolean).map(ofRole).find((places) => places.length) ?? men.map((man, index) => index).filter(free);
  const spot = { at: near };
  const player = pool.reduce((best, index) => (northDistance(men[index], spot) < northDistance(men[best], spot) ? index : best), pool[0]);
  const heroSlot = men[player];
  men[player] = { ...heroSlot, inputs: northDressed(northHeroInputs(life, year), heroSlot), name: northClone(life.hero.name), hero: true };
  const comrades = {};
  const taken = new Set([player]);
  const living = (life.comrades ?? []).filter((comrade) => comrade.alive).sort((a, b) => (b.bond ?? 0) - (a.bond ?? 0));
  // Nearest first; a man of his own unit before one of another unit up to NORTH.sameUnit m nearer.
  const nearness = (index) => northDistance(men[index], heroSlot) + (men[index].unit === heroSlot.unit ? 0 : NORTH.sameUnit);
  for (const comrade of living) {
    const options = men.map((man, index) => index).filter((index) => free(index) && !taken.has(index));
    if (!options.length) break;
    const index = options.reduce((best, each) => (nearness(each) < nearness(best) ? each : best), options[0]);
    taken.add(index);
    men[index] = { ...men[index], inputs: northDressed(northComradeInputs(comrade, year), men[index]), name: northClone(comrade.name), comrade: comrade.id };
    comrades[comrade.id] = index;
  }
  // The men he would command: his own unit's, or those his place leads (`leads`: an officer's place over several units).
  const commands = new Set(heroSlot.leads ?? [heroSlot.unit]);
  const squad = men.map((man, index) => index).filter((index) => index !== player && !men[index].named && commands.has(men[index].unit));
  return { player, comrades, squad, slot: { x: heroSlot.at[0], z: heroSlot.at[1] } };
}

/**
 * A side's places as a formation `layout` ([back, across] a man, in cast order, the front at 0): createWorld stands a
 * layout's man at x = sign × (front + back), z = sign × across (sign -1 for red), so the world place is undone into it.
 */
export function northLayout(corner, men) {
  const sign = corner === 'red' ? -1 : 1;
  return men.map(({ at: [x, z] }) => [sign * x, sign * z]);
}

/** The setup's fighters, formation layouts and names from the two sides' men (each { inputs, name, at }). */
export function northSides(red, blue) {
  const fighters = [...red.map(({ inputs }) => ({ inputs, corner: 'red' })), ...blue.map(({ inputs }) => ({ inputs, corner: 'blue' }))];
  const names = Object.fromEntries([...red, ...blue].map(({ name }, index) => [index, name]));
  return { fighters, names, layouts: { red: northLayout('red', red), blue: northLayout('blue', blue) } };
}

/** `count` places in a block: `perRow` abreast along z from `[x, z]` (its first row's middle), `spacing` apart, rows `rowSpacing` further along `back` (±1 in x). */
export function northBlock(count, { at: [x, z], perRow, spacing, rowSpacing, back = 1 }) {
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    return [x + back * row * rowSpacing, z + ((index % perRow) - (inRow - 1) / 2) * spacing];
  });
}

// The cast's names (cast.js mingSoldier, mingHorseman, bannerman) in characters: the Ming surnames and given names, and the
// Jurchen names as the Chinese record transcribes such names.
const NORTH_HANZI = {
  Wang: '王', Li: '李', Zhang: '张', Liu: '刘', Chen: '陈', Yang: '杨', Zhao: '赵', Huang: '黄', Zhou: '周', Wu: '吴', Qi: '戚', Luo: '罗',
  Zhu: '朱', Ma: '马', Sun: '孙', Qian: '钱', Xu: '徐', Tang: '唐', Gao: '高', Shen: '沈', Yu: '余',
  Da: '大', Er: '二', San: '三', Si: '四', Hu: '虎', Bao: '宝', Shun: '顺', Gui: '贵', Fu: '福', Ming: '明',
  Biao: '彪', Yong: '勇', Zhen: '振', Fei: '飞', Cheng: '成', Guo: '国', Kai: '凯', Lei: '雷', Meng: '猛', Tai: '泰', Wei: '威',
  Akdun: '阿克敦', Baturu: '巴图鲁', Mergen: '墨尔根', 'Hūsun': '扈逊', Erdemu: '额尔德穆', Fulu: '富禄', Sure: '舒尔', Kicebe: '奇车伯',
  Ilan: '伊兰', Duin: '杜音', Tulai: '图赖', Gaha: '噶哈',
};
// Given names that are written otherwise than the surname of the same sound (Wu: 吴 the surname, 五 "fifth"; Liu: 刘, 六).
const NORTH_GIVEN = { Wu: '五', Liu: '六' };

/** A name both ways ({ zh, en }) for a man as cast: his English one, and the characters for it (or `zh`, given). */
export function northName(inputs, zh = null) {
  const parts = String(inputs.name).split(' ');
  const known = parts.every((part) => NORTH_HANZI[part]);
  const hanzi = known ? parts.map((part, index) => (index > 0 && NORTH_GIVEN[part]) || NORTH_HANZI[part]).join('') : inputs.name;
  return { zh: zh ?? hanzi, en: inputs.name };
}

/** `[style, count]` pairs as a list of styles, in order. */
export function northStyles(mix) {
  return Object.entries(mix).flatMap(([style, count]) => Array.from({ length: count }, () => style));
}
