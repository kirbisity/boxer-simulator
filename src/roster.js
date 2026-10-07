// The roster: every named character the game offers (Deadliest Warrior's
// picks, grouped by faction), each a preset with any changes. Kept apart
// from the menus so tools (tools/ratings.js) can read it without a page.

import { normaliseInputs, PRESETS } from './body.js';
import { STYLES } from './moves.js';
import { factionOf, OUTFITS } from './outfits.js';
import { RATINGS } from './ratings.js';
import { WEAPONS } from './weapons.js';

/** A style's name, and its weapon when the name does not already say it. */
export const styleName = (style) => (style.weapon && WEAPONS[style.weapon].label.toLowerCase() !== style.label.toLowerCase() ? `${style.label} · ${WEAPONS[style.weapon].label}` : style.label);

/** The character who fights in a style. */
const preset = (style) => Object.values(PRESETS).find((entry) => entry.style === style);

const warrior = (key, title, base, changes = {}) => {
  const inputs = normaliseInputs(structuredClone({ ...base, ...changes, outfit: changes.outfit ?? base.outfit }));
  const style = STYLES[inputs.style];
  const armour = OUTFITS[inputs.outfit?.kind]?.label ?? '';
  return { key, title, inputs, faction: factionOf(inputs), line: [styleName(style), armour && !armour.startsWith(style.label) ? armour.replace(/^.* — /, '') : null].filter(Boolean).join(' · ') };
};

export const WARRIORS = [
  warrior('plate', 'Sir Edric', PRESETS.knight),
  warrior('joan', 'Joan of Arc', PRESETS.joan),
  warrior('crossbowman', 'Ottone Doria', PRESETS.crossbow),
  warrior('tosei', 'Date Masamune', PRESETS.samurai, { name: 'Date Masamune', outfit: { kind: 'samuraiTosei', design: 2 }, accessories: ['crest'] }),
  warrior('hammer', 'Gunnar Holt', PRESETS.warhammer),
  warrior('oyoroi', 'Takeda Shingen', PRESETS.samurai),
  warrior('mail', 'Sir Aldous', PRESETS.knight, { name: 'Sir Aldous', outfit: { kind: 'knightMail', design: 0 }, accessories: [] }),
  warrior('naginata', 'Tomoe Gozen', PRESETS.naginata),
  warrior('odachi', 'Makara Naotaka', PRESETS.odachi),
  warrior('footSpear', 'Will Ward', PRESETS.contender, { name: 'Will Ward', sex: 'male', style: 'spear', outfit: { kind: 'footman', design: 0 }, accessories: [] }),
  warrior('archer', 'Nasu no Yoichi', PRESETS.bow),
  warrior('teppo', 'Suzuki Magoichi', PRESETS.matchlock),
  warrior('mingGuandao', 'Liu Ting', PRESETS.guandao),
  warrior('mingThreeEyed', 'Ma Lin', PRESETS.threeEyed),
  warrior('shaolin', 'Tanzong', PRESETS.staff),
  warrior('taichi', 'Chen Fake', PRESETS.taichi),
  warrior('kanabo', 'Kojima Yatarō', PRESETS.kanabo),
  warrior('ironPagoda', 'Wanyan Wuzhu', PRESETS.ironPagoda),
  warrior('guanYu', 'Guan Yu', PRESETS.guanYu),
  warrior('hanCrossbow', 'Li Ling', PRESETS.hanCrossbow),
  warrior('wuxia', 'Pei Min', PRESETS.wuxia),
  warrior('kheshig', 'Subutai', PRESETS.kheshig),
  warrior('esen', 'Esen Taishi', PRESETS.maceShield),
  warrior('mandukhai', 'Mandukhai Khatun', PRESETS.saber),
  warrior('steppeLancer', 'Temür', PRESETS.maceShield, { name: 'Temür', style: 'spear', outfit: { kind: 'steppeHeavy', design: 1 } }),
  warrior('steppeShield', 'Ganbold', PRESETS.saberShield),
  warrior('steppeArcher', 'Bayar', PRESETS.steppeBow),
  warrior('gaziAlp', 'Turgut Alp', PRESETS.gaziAlp),
  warrior('sipahi', 'Davud the sipahi', PRESETS.sipahi),
  warrior('janissary', 'Ulubatlı Hasan', PRESETS.yatagan),
  warrior('janissaryGun', 'Mehmed Çavuş', PRESETS.yatagan, { name: 'Mehmed Çavuş', style: 'matchlock', outfit: { kind: 'janissary', design: 1 } }),
  warrior('azapArcher', 'Ali the azap', PRESETS.azap),
  warrior('azapSpear', 'Yusuf the azap', PRESETS.azap, { name: 'Yusuf the azap', style: 'spear', outfit: { kind: 'azap', design: 1 } }),
  warrior('ronin', 'Miyamoto Musashi', PRESETS.samurai, { name: 'Miyamoto Musashi', outfit: { kind: 'ronin', design: 2 }, accessories: [] }),
  warrior('wokou', 'Wang Zhi', PRESETS.mingDao, { name: 'Wang Zhi', outfit: { kind: 'wokou', design: 0 } }),
  warrior('hidalgo', 'Hernán Cortés', PRESETS.hidalgo),
  warrior('rodelero', 'Bernal Díaz', PRESETS.rodelero),
  warrior('arquebusier', 'Diego de Ordaz', PRESETS.knight, { name: 'Diego de Ordaz', style: 'matchlock', outfit: { kind: 'conquistadorQuilted', design: 1 }, accessories: [] }),
  warrior('vocMusketeer', 'Hans Pedel', PRESETS.knight, { name: 'Hans Pedel', style: 'matchlock', outfit: { kind: 'conquistadorQuilted', design: 3 }, accessories: [] }),
  warrior('vocPikeman', 'Jan de Vries', PRESETS.knight, { name: 'Jan de Vries', style: 'spear', outfit: { kind: 'conquistadorPlate', design: 3 }, accessories: [] }),
  warrior('eagle', 'Cuauhtémoc', PRESETS.macuahuitl),
  warrior('jaguar', 'Ocelotl', PRESETS.tepoztopilli),
  warrior('mexica', 'Yaotl', PRESETS.contender, { name: 'Yaotl', sex: 'male', style: 'macuahuitl', outfit: { kind: 'mexicaWarrior', design: 0 }, accessories: [], look: { skinTone: 'medium', hairStyle: 'midLong', hairColor: '#120d0a', facialHair: 'none', eyeColor: 'brown' } }),
  warrior('taekwondo', 'Kim Min-jun', PRESETS.taekwondo),
  warrior('mingEliteGun', 'Wu Weizhong', PRESETS.guandao, { name: 'Wu Weizhong', style: 'matchlock', outfit: { kind: 'mingElite', design: 1 } }),
  warrior('mingShield', 'Chen Bao', PRESETS.swordShield),
  warrior('mingBrigSpear', 'Sun Qi', PRESETS.swordShield, { name: 'Sun Qi', style: 'spear', outfit: { kind: 'mingBrigandine', design: 2 } }),
  warrior('mingGun', 'Zhao Liu', PRESETS.mingMatchlock),
  warrior('mingCrossbow', 'Li Si', PRESETS.mingCrossbow),
  warrior('mingSpear', 'Wang Er', PRESETS.mingSpear),
  warrior('mingDao', 'Zhang San', PRESETS.mingDao),
  warrior('arquebus', 'Hans Brenner', PRESETS.contender, { name: 'Hans Brenner', sex: 'male', style: 'matchlock', outfit: { kind: 'footman', design: 1 }, accessories: [] }),
  warrior('footBow', 'Tom Fletcher', PRESETS.contender, { name: 'Tom Fletcher', sex: 'male', style: 'bow', outfit: { kind: 'footman', design: 2 }, accessories: [] }),
  warrior('ashigaruSpear', 'Gonbei', PRESETS.spear, { name: 'Gonbei', outfit: { kind: 'ashigaru', design: 0 }, accessories: [] }),
  warrior('ashigaruBow', 'Sakuzaemon', PRESETS.spear, { name: 'Sakuzaemon', style: 'bow', outfit: { kind: 'ashigaru', design: 1 }, accessories: [] }),
  warrior('hoplomachus', 'Priscus', PRESETS.hoplomachus),
  warrior('murmillo', 'Verus', PRESETS.murmillo),
  warrior('secutor', 'Flamma', PRESETS.secutor),
  warrior('thraex', 'Spartacus', PRESETS.thraex),
  warrior('retiarius', 'Kalendio', PRESETS.retiarius),
  warrior('scissor', 'Astacius', PRESETS.scissor),
  warrior('maximus', 'Maximus', PRESETS.maximus),
  warrior('commodus', 'Commodus', PRESETS.commodus),
  warrior('legionary', 'Gaius Valerius Crispus', PRESETS.legionary),
  warrior('centurion', 'Marcus Caelius', PRESETS.centurion),
  warrior('peasant', 'Hob Miller', PRESETS.spear),
  warrior('pistol', 'Sgt. Dana Cole', PRESETS.handgun),
  warrior('ladyAshford', 'Lady Ashford', PRESETS.duelPistol),
  warrior('lordAshford', 'Lord Ashford', PRESETS.rapier),
  warrior('baton', 'Officer Reyes', PRESETS.baton),
  warrior('riot', 'Officer Dale Burke', PRESETS.riot),
  warrior('police', 'Officer Mike Kowalski', PRESETS.police),
  warrior('policeBaton', 'Officer Ana Ruiz', PRESETS.police, { name: 'Officer Ana Ruiz', sex: 'female', heightCm: 166, style: 'baton', calories: 2300, outfit: { kind: 'police', design: 1 }, look: { skinTone: 'tan', hairStyle: 'bun', hairColor: '#120d0a', facialHair: 'none', eyeColor: 'brown' } }),
  warrior('swatShotgun', 'Cpl. Marcus Hale', PRESETS.shotgun),
  warrior('specialForces', 'SSgt. Ryan Brooks', PRESETS.rifle),
  warrior('knife', 'Ryo Kanda', PRESETS.knife),
  warrior('boxer', 'Marcus "The Wall"', PRESETS.heavy),
  warrior('kickboxer', 'Leo Quickhands', PRESETS.light),
  warrior('muayThai', preset('muayThai')?.name ?? 'Muay Thai', preset('muayThai') ?? PRESETS.light, { style: 'muayThai' }),
  warrior('street', preset('street').name, preset('street')),
  warrior('sumo', preset('sumo').name, preset('sumo')),
  warrior('bat', 'Tony Marchetti', PRESETS.bat),
  warrior('brawler', 'Hank Doyle', PRESETS.clinchBrawl),
  warrior('mix', preset('mix').name, preset('mix')),
  warrior('unskilled', preset('unskilled').name, preset('unskilled')),
];

// ---- Ratings ------------------------------------------------------------------
// From src/ratings.js (generated by tools/ratings.js): a type's fitted
// strength against Maximus (100) and Tanzong the staff monk; proportional to
// inferred K/D (against Maximus, 100 × it).

const geometricMean = (values) => Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);

/** A fighter's rating by his type (style and armour), else his style's; null if neither was rated. */
export function ratingOf(inputs) {
  const style = inputs.style;
  const exact = RATINGS.types[`${style}|${inputs.outfit?.kind ?? 'boxing'}`];
  if (exact) return exact;
  const same = Object.entries(RATINGS.types).filter(([type]) => type.startsWith(`${style}|`)).map(([, value]) => value);
  if (!same.length) return null;
  const mean = geometricMean(same);
  return mean < 10 ? Math.round(mean * 10) / 10 : Math.round(mean);
}

// Quick battle pairing: an opponent's chance falls off with how far his
// rating is from yours, by this spread of the log of the ratio (×1.8 is
// one spread away).
export const PAIRING = { spread: Math.log(1.8) };

/**
 * Of these candidates (inputs), one to face `player`: picked at random,
 * weighted toward ratings near his. Unrated, all alike.
 */
export function pairedOpponent(player, candidates, random = Math.random) {
  const own = ratingOf(player);
  const weights = candidates.map((candidate) => {
    const theirs = ratingOf(candidate);
    if (!own || !theirs) return 1;
    return Math.exp(-(Math.log(theirs / own) ** 2) / (2 * PAIRING.spread ** 2));
  });
  let pick = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < candidates.length; index += 1) {
    pick -= weights[index];
    if (pick <= 0) return candidates[index];
  }
  return candidates[candidates.length - 1];
}
