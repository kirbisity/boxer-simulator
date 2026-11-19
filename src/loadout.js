// A man's weapons, by slot. The first is his style's (the weapon he fights with: STYLES[style].weapon). The second is carried on
// his belt, where his kit has one to hang it on (a sword in its scabbard, a dagger in its sheath, a mace on its hook): drawn when
// the first is lost or put by. The third hangs at the saddle (a horseman's mace, his second sword), for a man who rides.
//
// What may go in each is what men in that kit carried (KIT_ARMS, by the kit: its people and its day), never any weapon at all: a
// samurai carries a katana and a wakizashi, not a mace; a Ming soldier a dao; a knight his sword, a rondel dagger, a mace at his
// saddle. A kit not listed (the ring, the arena, the street's clothes, the machines) has no belt for a second weapon.
//
// The second's default is by the first (secondFor): a man whose own weapon is not a sword carries his kit's sword (`sword`: the
// knight with the war hammer, a longsword; the samurai with the kanabo or the odachi, a katana; the archer, his short sword); a man
// whose weapon is that sword carries the short blade (`short`: the knight's dagger, the samurai's wakizashi). A man's own choice
// (`inputs.arms`: { second, third }, a weapon kind or 'none') stands where his kit allows it; the old `inputs.sidearm` is read as
// his second.

import { STYLES } from './moves.js';
import { WEAPONS } from './weapons.js';

// How each weapon that can be carried is carried: in a scabbard at the left hip (`sword`, drawn with its sheath: wardrobe.js),
// in a sheath at the belt (`dagger`), or hung by a loop (`hung`: a mace, a baton, a club through the belt).
export const CARRY = {
  sword: ['longsword', 'armingSword', 'katana', 'wakizashi', 'shortSword', 'espada', 'rapier', 'saber', 'kilij', 'yatagan', 'dao', 'changdao', 'jian', 'sayf', 'spatha', 'gladius', 'sica'],
  dagger: ['dagger', 'knife'],
  hung: ['flangedMace', 'langya', 'baton', 'macuahuitl', 'clava', 'champi'],
};
const CARRIED = Object.fromEntries(Object.entries(CARRY).flatMap(([how, kinds]) => kinds.map((kind) => [kind, how])));

/** How a weapon is carried ('sword', 'dagger', 'hung'), or null for one that is not carried at the belt (a spear, a bow). */
export function carriedAs(kind) {
  return CARRIED[kind] ?? null;
}

// The style a weapon carried is fought in when it is drawn (the weapon's own where it has one without a shield of its own: a
// shield comes with its own kit, not with the sword drawn).
const DRAWN_STYLE = { flangedMace: 'mace', armingSword: 'templar', sayf: 'saladin', gladius: 'gladius', macuahuitl: 'macuahuitl' };

/** The style a carried weapon is fought in once drawn (a style key). */
export function drawnStyle(kind) {
  if (!kind) return null;
  if (STYLES[kind]?.weapon === kind) return kind;
  return DRAWN_STYLE[kind] ?? Object.keys(STYLES).find((key) => STYLES[key].weapon === kind && !STYLES[key].shield) ?? Object.keys(STYLES).find((key) => STYLES[key].weapon === kind) ?? null;
}

// Each kit's second and third weapons, as its men carried them: `second` the choices (the first its default where no rule picks),
// `sword` the kit's sword (a man who does not fight with it carries it), `short` its short blade (carried by a man who fights with
// the sword), `third` the saddle's choices (for a man who rides; none: no saddle weapon in that kit).
export const KIT_ARMS = {
  // The knight: a longsword or an arming sword at the hip, a rondel dagger, the flanged mace at the saddle (or at the belt on foot).
  knight: { second: ['longsword', 'dagger', 'armingSword', 'flangedMace'], sword: 'longsword', short: 'dagger', third: ['flangedMace', 'longsword'] },
  joan: { second: ['armingSword', 'dagger'], sword: 'armingSword', short: 'dagger', third: ['flangedMace'] },
  tournament: { second: ['longsword', 'dagger', 'flangedMace'], sword: 'longsword', short: 'dagger', third: ['flangedMace', 'longsword'] },
  templar: { second: ['armingSword', 'dagger', 'flangedMace'], sword: 'armingSword', short: 'dagger', third: ['flangedMace'] },
  // The foot of the 1400s-1500s: the archer's and bill-man's falchion or short sword, a dagger; the arquebusier's sword.
  footman: { second: ['shortSword', 'dagger', 'armingSword'], sword: 'shortSword', short: 'dagger' },
  archer: { second: ['shortSword', 'dagger'], sword: 'shortSword', short: 'dagger' },
  forger: { second: ['dagger', 'shortSword'], sword: 'shortSword', short: 'dagger' },
  levy: { second: ['dagger', 'shortSword'], sword: 'shortSword', short: 'dagger' },
  conquistadorPlate: { second: ['espada', 'dagger', 'rapier'], sword: 'espada', short: 'dagger', third: ['flangedMace', 'espada'] },
  conquistadorQuilted: { second: ['espada', 'dagger', 'rapier'], sword: 'espada', short: 'dagger', third: ['flangedMace'] },
  // Japan: the daisho (the katana and the wakizashi), the ashigaru's wakizashi alone (the katana a samurai's). No saddle mace.
  samurai: { second: ['katana', 'wakizashi'], sword: 'katana', short: 'wakizashi' },
  oyoroi: { second: ['katana', 'wakizashi'], sword: 'katana', short: 'wakizashi' },
  samuraiTosei: { second: ['katana', 'wakizashi'], sword: 'katana', short: 'wakizashi' },
  ashigaru: { second: ['wakizashi'], sword: 'wakizashi', short: 'wakizashi' },
  ronin: { second: ['wakizashi', 'katana'], sword: 'katana', short: 'wakizashi' },
  kensei: { second: ['wakizashi'], sword: 'katana', short: 'wakizashi' },
  sohei: { second: ['katana', 'wakizashi'], sword: 'katana', short: 'wakizashi' },
  // China and the Manchu: the dao (the Qi family's long sabre for his gunners), the jian of the Han; the iron mace at the saddle.
  mingBrigandine: { second: ['dao', 'dagger'], sword: 'dao', short: 'dagger' },
  mingEliteInfantry: { second: ['changdao', 'dao'], sword: 'changdao', short: 'dao' },
  mingElite: { second: ['dao', 'dagger'], sword: 'dao', short: 'dagger', third: ['langya', 'dao'] },
  bannerArmour: { second: ['dao', 'dagger'], sword: 'dao', short: 'dagger', third: ['langya', 'dao'] },
  bayara: { second: ['dao', 'dagger'], sword: 'dao', short: 'dagger', third: ['langya', 'dao'] },
  guanYu: { second: ['dao', 'dagger'], sword: 'dao', short: 'dagger', third: ['langya'] },
  ironPagoda: { second: ['langya', 'dao'], sword: 'langya', short: 'dao', third: ['langya', 'dao'] },
  hanSoldier: { second: ['jian', 'dagger'], sword: 'jian', short: 'dagger' },
  hanCavalry: { second: ['jian', 'dagger'], sword: 'jian', short: 'dagger', third: ['jian'] },
  mingIronLamellar: { second: ['saber', 'dao'], sword: 'saber', short: 'dao', third: ['flangedMace', 'saber'] },
  wokou: { second: ['dao', 'katana', 'wakizashi'], sword: 'dao', short: 'wakizashi' },
  wokouArmoured: { second: ['dao', 'katana', 'wakizashi'], sword: 'dao', short: 'wakizashi' },
  // Rome and its heirs: the pugio and the gladius; the spatha of the auxiliaries, the late army and the Goths and Huns.
  legionary: { second: ['dagger', 'gladius'], sword: 'gladius', short: 'dagger' },
  centurion: { second: ['dagger', 'gladius'], sword: 'gladius', short: 'dagger' },
  republicanLegionary: { second: ['dagger', 'gladius'], sword: 'gladius', short: 'dagger' },
  romanAuxiliary: { second: ['spatha', 'dagger'], sword: 'spatha', short: 'dagger' },
  lateRoman: { second: ['spatha', 'dagger'], sword: 'spatha', short: 'dagger', third: ['spatha'] },
  goth: { second: ['spatha', 'dagger'], sword: 'spatha', short: 'dagger' },
  gothNoble: { second: ['spatha', 'dagger'], sword: 'spatha', short: 'dagger', third: ['spatha'] },
  hun: { second: ['spatha', 'dagger'], sword: 'spatha', short: 'dagger', third: ['spatha'] },
  hunNoble: { second: ['spatha', 'dagger'], sword: 'spatha', short: 'dagger', third: ['spatha'] },
  cataphract: { second: ['spatha', 'flangedMace'], sword: 'spatha', short: 'dagger', third: ['flangedMace', 'spatha'] },
  parthianArcher: { second: ['shortSword', 'dagger'], sword: 'shortSword', short: 'dagger', third: ['shortSword'] },
  // The steppe: the sabre, the mace at the saddle.
  steppeLight: { second: ['saber', 'dagger'], sword: 'saber', short: 'dagger', third: ['flangedMace', 'saber'] },
  steppeMedium: { second: ['saber', 'flangedMace', 'dagger'], sword: 'saber', short: 'dagger', third: ['flangedMace', 'saber'] },
  kheshig: { second: ['saber', 'flangedMace', 'dagger'], sword: 'saber', short: 'dagger', third: ['flangedMace', 'saber'] },
  cumanHeavy: { second: ['kilij', 'saber', 'flangedMace'], sword: 'kilij', short: 'dagger', third: ['flangedMace', 'kilij'] },
  xiongnu: { second: ['shortSword', 'dagger'], sword: 'shortSword', short: 'dagger', third: ['shortSword'] },
  // The Ottomans: the kilij, the janissary's yatagan, the mace at the saddle; Saladin's sayf.
  azap: { second: ['kilij', 'yatagan', 'dagger'], sword: 'kilij', short: 'dagger' },
  janissary: { second: ['yatagan', 'kilij', 'dagger'], sword: 'yatagan', short: 'dagger' },
  ottomanHeavy: { second: ['kilij', 'flangedMace', 'dagger'], sword: 'kilij', short: 'dagger', third: ['flangedMace', 'kilij'] },
  gaziAlp: { second: ['kilij', 'flangedMace', 'dagger'], sword: 'kilij', short: 'dagger', third: ['flangedMace', 'kilij'] },
  saladin: { second: ['sayf', 'flangedMace', 'dagger'], sword: 'sayf', short: 'dagger', third: ['flangedMace', 'sayf'] },
  // The Mexica: the macuahuitl, an obsidian knife.
  mexicaWarrior: { second: ['macuahuitl', 'knife'], sword: 'macuahuitl', short: 'knife' },
  mexicaElite: { second: ['macuahuitl', 'knife'], sword: 'macuahuitl', short: 'knife' },
  // The law: the baton at the belt, a soldier's knife.
  police: { second: ['baton', 'knife'], sword: 'baton', short: 'knife' },
  riot: { second: ['baton', 'knife'], sword: 'baton', short: 'knife' },
  swat: { second: ['baton', 'knife'], sword: 'baton', short: 'knife' },
  specialForces: { second: ['dagger', 'baton'], sword: 'dagger', short: 'dagger' },
  infantry: { second: ['dagger', 'baton'], sword: 'dagger', short: 'dagger' },
  // The arena's whip-master, a knife at his belt; the yakuza's tanto.
  lorarius: { second: ['dagger'], sword: 'dagger', short: 'dagger' },
  yakuza: { second: ['knife'], sword: 'knife', short: 'knife' },
};

// Each kit's main weapons (styles: moves.js STYLES), as men in that kit fought with them: the weapons its army gave its men
// or its lords chose, never any weapon at all. A drilled soldier was given one and trained with it for years (a unit apiece:
// the roster's men keep theirs); a man made in the builders may take any of his kit's (`firstOptions`). A kit not listed (the
// ring, the street, the arena, the machines) keeps whatever style he chose.
// - Qi Jiguang's men: the mandarin-duck squad's shield and dao, langxian, long spear and dangpa, and the musketeers' gun
//   (Jixiao xinshu, 1560). The Ming army's regulars: the same weapons, the bow and the three-eyed gun besides.
// - Japan: the samurai's katana, yari, naginata, ōdachi and bow (the kanabō the rare big man's); the ashigaru's yari, teppō and
//   bow, never the katana; the rōnin's swords.
export const KIT_FIRST = {
  knight: ['longsword', 'warhammer', 'mace', 'lance'],
  joan: ['joan', 'longsword', 'lance'],
  tournament: ['lance', 'longsword', 'warhammer'],
  templar: ['templar', 'maceShield', 'longsword', 'lance'],
  footman: ['pike', 'spear', 'crossbow', 'matchlock', 'bow', 'armingBuckler'],
  archer: ['longbow', 'shortSword'],
  forger: ['shortSword', 'dagger'],
  levy: ['spear', 'longbow', 'shortSword'],
  conquistadorPlate: ['espada', 'espadaRodela', 'pike', 'spear', 'lance', 'rapier'],
  conquistadorQuilted: ['espadaRodela', 'matchlock', 'crossbow', 'espada', 'pike'],
  samurai: ['katana', 'naginata', 'yumi', 'bow'],
  oyoroi: ['yumi', 'katana', 'naginata'],
  samuraiTosei: ['katana', 'yari', 'naginata', 'odachi', 'yumi', 'kanabo'],
  ashigaru: ['yari', 'matchlock', 'archerYumi'],
  ronin: ['nito', 'ronin', 'katana'],
  kensei: ['katana', 'nito'],
  sohei: ['naginata', 'katana', 'staff'],
  mingBrigandine: ['swordShield', 'spear', 'matchlock', 'mingBow', 'threeEyed', 'dao'],
  mingEliteInfantry: ['langxian', 'swordShield', 'spear', 'dangpa', 'matchlock'],
  mingElite: ['guandao', 'dao', 'threeEyed', 'matchlock', 'mingLance', 'mingBow', 'langyaShield'],
  bannerArmour: ['manchuBow', 'spear', 'guandao', 'dao', 'mingLance'],
  bayara: ['bayaraLance', 'bayaraBow', 'dao', 'guandao'],
  guanYu: ['guanYu', 'dao'],
  ironPagoda: ['jinLance', 'langya', 'langyaShield'],
  hanSoldier: ['nu', 'jian', 'spear'],
  hanCavalry: ['jian', 'spear', 'nu'],
  mingIronLamellar: ['saber', 'mingLance', 'mingBow', 'dao'],
  wokou: ['dao', 'katana', 'spear', 'matchlock'],
  wokouArmoured: ['katana', 'dao', 'yari', 'matchlock'],
  legionary: ['legionary', 'gladius'],
  centurion: ['centurion', 'gladius'],
  republicanLegionary: ['legionary', 'gladius'],
  romanAuxiliary: ['spathaOval', 'spearOval', 'spatha'],
  lateRoman: ['spathaOval', 'spearOval', 'spatha'],
  goth: ['spearRound', 'spathaRound', 'spatha'],
  gothNoble: ['spathaRound', 'spearRound', 'spatha'],
  hun: ['steppeBow', 'spatha', 'saber'],
  hunNoble: ['steppeBow', 'spatha', 'saber'],
  cataphract: ['kontos', 'spatha', 'mace'],
  parthianArcher: ['steppeBow', 'shortSword'],
  steppeLight: ['steppeBow', 'saber'],
  steppeMedium: ['kheshigBow', 'saber', 'maceShield', 'saberShield'],
  kheshig: ['kheshigBow', 'saberShield', 'maceShield', 'saber'],
  cumanHeavy: ['cumanBow', 'kilij', 'kilijShield', 'mace'],
  xiongnu: ['steppeBow', 'shortSword'],
  azap: ['spear', 'steppeBow', 'kilij'],
  janissary: ['matchlock', 'yatagan', 'kilij'],
  ottomanHeavy: ['maceShield', 'kilijShield', 'kilij', 'mace'],
  gaziAlp: ['kilijShield', 'maceShield', 'kilij', 'steppeBow'],
  saladin: ['saladin', 'maceShield', 'steppeBow'],
  mexicaWarrior: ['macuahuitl', 'tepoztopilli'],
  mexicaElite: ['macuahuitl', 'tepoztopilli'],
};

// What a kit's horsemen fought with in the saddle, where it is not what they fought with on foot (a style). The knight
// charged with the lance and, unhorsed or dismounted, fought with the sword (or the hammer, or the axe) he carried; so did the
// men-at-arms of every army that couched the lance: the Templars, the conquistadors' hidalgos, the Ayyubids and the
// Ottomans' sipahis; the cataphract with the kontos; the Jin's and the Ming's heavy horse with their heavy spears; the
// samurai of the Sengoku with the yari from the saddle (the bow before them). A rider of such a kit armed with a short
// weapon takes his kit's (ridingInputs); one with a spear, a bow or a gun rides with it.
export const KIT_RIDE = {
  knight: 'lance', joan: 'lance', tournament: 'lance', templar: 'lance', conquistadorPlate: 'lance',
  saladin: 'lance', ottomanHeavy: 'lance', gaziAlp: 'lance', cumanHeavy: 'lance',
  cataphract: 'kontos', ironPagoda: 'jinLance', mingIronLamellar: 'mingLance', samuraiTosei: 'yari',
};

/**
 * A man as he rides: his kit's saddle weapon (KIT_RIDE) in place of a short one, his own kept for when he is on his feet
 * (`footStyle`, physics.js afoot). A spear, a bow, a gun, a kit with no saddle weapon of its own, or a man who rides with his
 * own (`rideWith: 'own'`: a horseman who fights with the sword from the saddle): as he is.
 */
export function ridingInputs(inputs) {
  const riding = inputs?.rideWith === 'own' ? null : KIT_RIDE[inputs?.outfit?.kind];
  const style = STYLES[inputs?.style];
  const weapon = WEAPONS[style?.weapon];
  if (!riding || !STYLES[riding] || !weapon || weapon.ranged || style.ranged || inputs.style === riding) return inputs;
  // Short: what is held within arm's reach (a sword, a mace, a hammer, a club), not a polearm.
  if (weapon.length + weapon.handle > 1.6) return inputs;
  return { ...inputs, style: riding, footStyle: inputs.style };
}

/** The main weapons (styles) his kit may fight with, its own first; none for a kit not listed (any style stands). */
export function firstOptions(inputs) {
  return (KIT_FIRST[inputs?.outfit?.kind] ?? []).filter((style) => STYLES[style]);
}

/** His first weapon's kind (his style's), or null (bare hands, a mix of styles). */
export function firstWeapon(inputs) {
  return STYLES[inputs?.style]?.weapon ?? null;
}

/** The second weapons his kit lets him carry (weapon kinds), none where it has no belt for one; his first never among them. */
export function secondOptions(inputs) {
  const arms = KIT_ARMS[inputs?.outfit?.kind];
  if (!arms) return [];
  const first = firstWeapon(inputs);
  return arms.second.filter((kind) => kind !== first && WEAPONS[kind]);
}

/** The saddle weapons his kit lets him carry, for a man who rides (`mounted`); none on foot. */
export function thirdOptions(inputs) {
  const arms = KIT_ARMS[inputs?.outfit?.kind];
  if (!arms?.third || !inputs?.mounted) return [];
  const first = firstWeapon(inputs);
  return arms.third.filter((kind) => kind !== first && WEAPONS[kind]);
}

/** The second his kit gives him by his first (the kit's sword if he does not fight with it, else its short blade), or null. */
export function secondFor(inputs) {
  const options = secondOptions(inputs);
  if (!options.length) return null;
  const arms = KIT_ARMS[inputs.outfit.kind];
  const first = firstWeapon(inputs);
  const wanted = first === arms.sword || carriedAs(first) === 'sword' ? arms.short : arms.sword;
  return options.includes(wanted) ? wanted : options[0];
}

/** The saddle weapon his kit gives a rider: its first that is not his second, or null. */
export function thirdFor(inputs, second = resolveArms(inputs).second) {
  const options = thirdOptions(inputs).filter((kind) => kind !== second);
  return options[0] ?? null;
}

/**
 * His weapons by slot: { first, second, third } (weapon kinds, or null). His own choice where his kit allows it (`inputs.arms`,
 * `none` for nothing), else the old `inputs.sidearm` (a style key or a weapon kind) as his second, else the kit's by his first.
 */
export function resolveArms(inputs) {
  const first = firstWeapon(inputs);
  const own = inputs?.arms ?? {};
  const options = secondOptions(inputs);
  const legacy = inputs?.sidearm ? (STYLES[inputs.sidearm]?.weapon ?? inputs.sidearm) : null;
  let second;
  if (own.second === 'none') second = null;
  else if (own.second && options.includes(own.second)) second = own.second;
  else if (legacy && (options.includes(legacy) || !KIT_ARMS[inputs?.outfit?.kind])) second = legacy;
  else second = secondFor(inputs);
  const saddle = thirdOptions(inputs);
  let third;
  if (own.third === 'none') third = null;
  else if (own.third && saddle.includes(own.third) && own.third !== second) third = own.third;
  else third = saddle.find((kind) => kind !== second) ?? null;
  return { first, second, third };
}
