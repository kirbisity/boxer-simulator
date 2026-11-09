// The roster: every named character the game offers (Deadliest Warrior's
// picks, grouped by faction), each a preset with any changes. Kept apart
// from the menus so tools (tools/ratings.js) can read it without a page.

import { normaliseInputs, PRESETS } from './body.js';
import { STYLES } from './moves.js';
import { factionOf, outfitOf, OUTFITS } from './outfits.js';
import { RATINGS } from './ratings.js';
import { WEAPONS } from './weapons.js';
import { withTanks } from './physics/flame.js';
import { getLang, tname } from './i18n.js';

/** A style's name, and its weapon when the name does not already say it. */
export const styleName = (style) => (style.weapon && WEAPONS[style.weapon].label.toLowerCase() !== style.label.toLowerCase() ? `${style.label} · ${WEAPONS[style.weapon].label}` : style.label);

/** styleName as shown, in the language in force (src/i18n.js): the style's and its weapon's names from the names catalogue. */
export const styleNameShown = (style) => (style.weapon && WEAPONS[style.weapon].label.toLowerCase() !== style.label.toLowerCase() ? `${tname(style.label)} · ${tname(WEAPONS[style.weapon].label)}` : tname(style.label));

/**
 * A warrior's line under his name (its `line`, how he fights and what he wears) in the language in force: the kit's name
 * past its dash ('Knight — full plate' → 'full plate', '骑士——全身板甲' → '全身板甲'), left off when the style already says it.
 */
export function lineShown(inputs) {
  const style = STYLES[inputs.style];
  const armour = OUTFITS[inputs.outfit?.kind]?.label ?? '';
  const worn = !armour || armour.startsWith(style.label) ? null : getLang() === 'en' ? armour.replace(/^.* — /, '') : tname(armour).split('——').pop();
  return [styleNameShown(style), worn].filter(Boolean).join(' · ');
}

/** The character who fights in a style. */
const preset = (style) => Object.values(PRESETS).find((entry) => entry.style === style);

const warrior = (key, title, base, changes = {}) => {
  const inputs = normaliseInputs(structuredClone({ ...base, ...changes, outfit: changes.outfit ?? base.outfit }));
  const style = STYLES[inputs.style];
  const armour = OUTFITS[inputs.outfit?.kind]?.label ?? '';
  return { key, title, base, inputs, faction: factionOf(inputs), line: [styleName(style), armour && !armour.startsWith(style.label) ? armour.replace(/^.* — /, '') : null].filter(Boolean).join(' · ') };
};

/**
 * The name a character goes by, in the roster and over his head in a fight: what he is (a unit's name), not who
 * (the user's choice, Dark Souls style). The legends and the machines keep their own names. Battles' soldiers
 * (cast.js) keep their personal names.
 */
export const UNIT_NAMES = {
  plate: 'Noble Knight',
  templar: 'Templar Grand Master',
  joan: 'Maid of Orléans',
  maximilian: 'Jousting King',
  crossbowman: 'Genoese Crossbowman',
  tosei: 'One-Eyed Dragon',
  hammer: 'Hammer Knight',
  oyoroi: 'Tiger of Kai',
  tametomo: 'Great-Bow Archer',
  naginata: 'Glaive Maiden',
  sohei: 'Warrior Monk',
  odachi: 'Ōdachi Champion',
  footSpear: 'Spear Footman',
  archer: 'Fan-Shooter Archer',
  teppo: 'Teppō Gunner',
  mingGuandao: "General's Retainer",
  mingThreeEyed: 'Three-Eyed Gunner',
  shaolin: 'Shaolin Staff Monk',
  taichi: 'Tai Chi Master',
  kanabo: 'Kanabō Brute',
  ironPagoda: 'Iron Pagoda',
  hanCrossbow: 'Han Crossbowman',
  wuxia: 'Wuxia Swordsman',
  kheshig: 'Old Orlok',
  esen: 'Oirat Warlord',
  mandukhai: 'Warrior Queen',
  steppeShield: 'Kheshig Archer',
  steppeArcher: 'Steppe Horse Archer',
  cuman: 'Iron-Faced Cuman',
  gaziAlp: 'Frontier Gazi',
  sipahi: 'Mace Sipahi',
  janissary: 'Wall-Storming Janissary',
  janissaryGun: 'Janissary Musketeer',
  azapArcher: 'Azap Archer',
  azapSpear: 'Azap Spearman',
  ronin: 'Two-Sword Rōnin',
  wokou: 'Wokou Pirate',
  hidalgo: 'Conquistador Captain',
  rodelero: 'Rodelero',
  arquebusier: 'Conquistador Arquebusier',
  vocMusketeer: 'Company Musketeer',
  vocPikeman: 'Company Pikeman',
  eagle: 'Eagle Warrior',
  jaguar: 'Jaguar Warrior',
  mexica: 'Mexica Warrior',
  taekwondo: 'Taekwondo Black Belt',
  judo: 'Judoka',
  mingEliteGun: 'Ming Elite Musketeer',
  mingShield: 'Ming Shield Soldier',
  mingBrigSpear: 'Ming Spearman',
  mingGun: 'Ming Musketeer',
  mingCrossbow: 'Garrison Crossbowman',
  mingSpear: 'Garrison Spearman',
  mingDao: 'Garrison Swordsman',
  bayara: 'Bayara Guard',
  bannerArcher: 'Banner Archer',
  bannerGuandao: 'Banner Glaive-Man',
  bannerSpear: 'Banner Spearman',
  arquebus: 'Arquebusier',
  footBow: 'English Longbowman',
  ashigaruSpear: 'Ashigaru Spearman',
  ashigaruBow: 'Ashigaru Archer',
  hoplomachus: 'Hoplomachus',
  murmillo: 'Murmillo',
  secutor: 'Secutor',
  thraex: 'Rebel Thraex',
  retiarius: 'Retiarius',
  scissor: 'Scissor Gladiator',
  lorarius: 'Arena Whip-Master',
  legionary: 'Legionary',
  centurion: 'Centurion',
  peasant: 'Pitchfork Peasant',
  starved: 'Starved Rebel',
  pistol: 'SWAT Pistoleer',
  baton: 'SWAT Baton Officer',
  riot: 'Riot Shield Officer',
  police: 'Patrol Officer',
  policeBaton: 'Baton Patrolwoman',
  swatShotgun: 'SWAT Breacher',
  specialForces: 'Special Forces Rifleman',
  infantry: 'Infantry Rifleman',
  flamer: 'Flame Trooper',
  firefighter: 'Fire-Suited Fireman',
  knife: 'Yakuza Knifeman',
  gorilla: 'Silverback',
  chimp: 'Chimpanzee',
  baboon: 'Chacma Baboon',
  macaque: 'Temple Monkey',
  boxer: 'Heavyweight Boxer',
  kickboxer: 'Kickboxer',
  muayThai: 'Muay Thai Fighter',
  street: 'Street Brawler',
  sumo: 'Sumo Grand Champion',
  bat: 'Back-Alley Thug',
  brawler: 'Cage Wrestler',
  mix: 'Mixed Martial Artist',
  unskilled: 'Rebel Peasant Leader',
};

/** A roster entry under its unit's name (UNIT_NAMES), where it has one. */
// The character he was built from (PRESETS) goes by the same name wherever it is listed on its own (the sandbox's
// pickers, the ghost), where he wears it as it is (no name of his own in the roster's changes).
const unitNamed = ({ base, ...entry }) => {
  const unit = UNIT_NAMES[entry.key];
  if (!unit) return entry;
  if (base && entry.inputs.name === base.name) base.name = unit;
  return { ...entry, title: unit, inputs: { ...entry.inputs, name: unit } };
};

// `legend`: shown in the intro on first load (intro.js), in `order`, with its
// `kicker` (an epithet over the name) and `line`; `legend: true` alone will do
// (after the numbered, his faction for the kicker, his kit for the line).
export const WARRIORS = [
  warrior('plate', 'Sir Edric', PRESETS.knight),
  // The knights' flagship: Deadliest Warrior opens the faction on him (`flagship`), whatever his rating.
  { ...warrior('templar', 'Knights Templar', PRESETS.templar), flagship: true, legend: { order: 1, kicker: { en: 'The Crusader', zh: '十字军' }, line: { en: 'A warrior monk of the Crusades: arming sword, heater shield, mail and the great helm.', zh: '十字军里的武装修士：佩剑、骑士盾、锁子甲，头上一顶桶盔。' } } },
  { ...warrior('joan', 'Joan of Arc', PRESETS.joan), legend: { order: 2, kicker: { en: 'Joan of Arc', zh: '贞德' }, line: { en: 'White plate, bareheaded, the arming sword; she bears the standard when she leads.', zh: '一身白甲，不戴头盔，手握佩剑；冲锋在前时，旗帜由她亲自扛。' } } },
  // Maximilian I, the great jouster, on foot in his Gestech harness with the lance: a legend, not the flagship.
  { ...warrior('maximilian', 'Maximilian I', PRESETS.maximilian), legend: { order: 2.5, kicker: { en: 'The Last Knight', zh: '最后的骑士' }, line: { en: 'The jousting emperor in his Stechzeug: the frog-mouthed helm bolted to the breast, and the lance.', zh: '爱比武的皇帝，披挂比武重甲：蛙嘴盔直接栓死在胸甲上，手里一杆骑枪。' } } },
  warrior('crossbowman', 'Ottone Doria', PRESETS.crossbow),
  warrior('tosei', 'Date Masamune', PRESETS.samurai, { name: 'Date Masamune', heightCm: 160, calories: 3525, outfit: { kind: 'samuraiTosei', design: 2 }, accessories: ['crest'] }),
  warrior('hammer', 'Gunnar Holt', PRESETS.warhammer),
  warrior('oyoroi', 'Takeda Shingen', PRESETS.samurai),
  // The Japanese flagship: Deadliest Warrior opens the faction on him (`flagship`), whatever his rating.
  { ...warrior('tametomo', 'Minamoto no Tametomo', PRESETS.tametomo), flagship: true, legend: { order: 3, kicker: { en: 'Great-armour samurai', zh: '大铠武士' }, line: { en: 'The great archer of the Hōgen war, in ō-yoroi: the long yumi, then the blade.', zh: '保元之乱的大弓手，身披大铠：先放长弓，再拔刀。' } } },
  warrior('naginata', 'Tomoe Gozen', PRESETS.naginata),
  warrior('sohei', 'Musashibō Benkei', PRESETS.sohei),
  warrior('odachi', 'Makara Naotaka', PRESETS.odachi),
  warrior('footSpear', 'Will Ward', PRESETS.contender, { name: 'Will Ward', calories: 4050, exercise: 0.75, sex: 'male', style: 'spear', outfit: { kind: 'footman', design: 0 }, accessories: [] }),
  warrior('archer', 'Nasu no Yoichi', PRESETS.bow),
  warrior('teppo', 'Suzuki Magoichi', PRESETS.matchlock),
  warrior('mingGuandao', 'Liu Ting', PRESETS.guandao),
  warrior('mingThreeEyed', 'Ma Lin', PRESETS.threeEyed),
  warrior('shaolin', 'Tanzong', PRESETS.staff),
  warrior('taichi', 'Chen Fake', PRESETS.taichi),
  warrior('kanabo', 'Kojima Yatarō', PRESETS.kanabo),
  { ...warrior('ironPagoda', 'Wanyan Wuzhu', PRESETS.ironPagoda), legend: { order: 5, kicker: { en: 'Wanyan Wuzhu', zh: '完颜兀术' }, line: { en: 'The Jin heavy guard: heavy spear, wolf-tooth mace at the saddle, armoured head to foot.', zh: '金国重甲亲军：手持重枪，鞍挂狼牙棒，从头裹到脚。' } } },
  { ...warrior('guanYu', 'Guan Yu', PRESETS.guanYu), legend: { order: 6, kicker: { en: 'God of War', zh: '武圣' }, line: { en: 'The Green Dragon Crescent Blade: great sweeping cuts from far off.', zh: '青龙偃月刀：隔着老远，大开大合地抡过来。' } } },
  warrior('hanCrossbow', 'Li Ling', PRESETS.hanCrossbow),
  warrior('wuxia', 'Pei Min', PRESETS.wuxia),
  { ...warrior('kheshig', 'Subutai', PRESETS.kheshig), legend: { order: 10, kicker: { en: 'The Khan\'s Guard', zh: '大汗宿卫' }, line: { en: 'Quick arrows from the composite bow, then straight in with the flanged mace.', zh: '复合弓连珠快箭，射完提骨朵直接冲进来。' } } },
  warrior('esen', 'Esen Taishi', PRESETS.maceShield),
  warrior('mandukhai', 'Mandukhai Khatun', PRESETS.saber),
  // An iron-clad horse archer: the bow, then the sabre (his kit's sidearm) up close.
  warrior('steppeShield', 'Ganbold', PRESETS.saberShield),
  warrior('steppeArcher', 'Bayar', PRESETS.steppeBow),
  // A Cuman (Kipchak) of the 12th-13th-century steppe: the bow, then the sabre, in plated mail and the masked helmet.
  warrior('cuman', 'Konchak', PRESETS.cuman),
  // The sultanates' flagship: Deadliest Warrior opens the faction on him (`flagship`), whatever his rating.
  { ...warrior('saladin', 'Saladin', PRESETS.saladin), flagship: true, legend: { order: 9, kicker: { en: 'Sultan of Egypt and Syria', zh: '埃及与叙利亚的苏丹' }, line: { en: 'The straight Ayyubid sword and round shield: patient, quick to answer.', zh: '阿尤布直剑配圆盾：沉得住气，还手极快。' } } },
  warrior('gaziAlp', 'Turgut Alp', PRESETS.gaziAlp),
  warrior('sipahi', 'Davud the sipahi', PRESETS.sipahi),
  warrior('janissary', 'Ulubatlı Hasan', PRESETS.yatagan),
  warrior('janissaryGun', 'Mehmed Çavuş', PRESETS.yatagan, { name: 'Mehmed Çavuş', style: 'matchlock', outfit: { kind: 'janissary', design: 1 } }),
  warrior('azapArcher', 'Ali the azap', PRESETS.azap),
  warrior('azapSpear', 'Yusuf the azap', PRESETS.azap, { name: 'Yusuf the azap', style: 'spear', outfit: { kind: 'azap', design: 1 } }),
  { ...warrior('ronin', 'Miyamoto Musashi', PRESETS.ronin), legend: { order: 4, kicker: { en: 'The Sword Saint', zh: '剑圣' }, line: { en: 'The masterless swordsman with two swords: one meets the blade while the other cuts.', zh: '无主的浪人，双刀在手：一把迎住来刀，另一把趁隙就砍。' } } },
  warrior('wokou', 'Wang Zhi', PRESETS.mingDao, { name: 'Wang Zhi', outfit: { kind: 'wokou', design: 0 } }),
  warrior('hidalgo', 'Hernán Cortés', PRESETS.hidalgo),
  warrior('rodelero', 'Bernal Díaz', PRESETS.rodelero),
  warrior('arquebusier', 'Diego de Ordaz', PRESETS.knight, { name: 'Diego de Ordaz', exercise: 0.66, heightCm: 175, calories: 4025, style: 'matchlock', outfit: { kind: 'conquistadorQuilted', design: 1 }, accessories: [] }),
  warrior('vocMusketeer', 'Hans Pedel', PRESETS.knight, { name: 'Hans Pedel', exercise: 0.66, heightCm: 175, calories: 4025, style: 'matchlock', outfit: { kind: 'conquistadorQuilted', design: 3 }, accessories: [] }),
  warrior('vocPikeman', 'Jan de Vries', PRESETS.knight, { name: 'Jan de Vries', exercise: 0.66, heightCm: 175, calories: 4025, style: 'spear', outfit: { kind: 'conquistadorPlate', design: 3 }, accessories: [] }),
  { ...warrior('eagle', 'Cuauhtémoc', PRESETS.macuahuitl), legend: { order: 11, kicker: { en: 'The Last Emperor', zh: '最后的皇帝' }, line: { en: 'The last tlatoani of Tenochtitlan: the obsidian-edged macuahuitl and a feathered shield.', zh: '特诺奇蒂特兰最后的君主：黑曜石剑棍，一面羽毛盾。' } } },
  warrior('jaguar', 'Ocelotl', PRESETS.tepoztopilli),
  warrior('mexica', 'Yaotl', PRESETS.contender, { name: 'Yaotl', heightCm: 160, calories: 3200, exercise: 0.75, sex: 'male', style: 'macuahuitl', outfit: { kind: 'mexicaWarrior', design: 0 }, accessories: [], look: { skinTone: 'medium', hairStyle: 'midLong', hairColor: '#120d0a', facialHair: 'none', eyeColor: 'brown' } }),
  warrior('taekwondo', 'Kim Min-jun', PRESETS.taekwondo),
  warrior('judo', 'Saigo Shiro', PRESETS.judo),
  warrior('mingEliteGun', 'Wu Weizhong', PRESETS.guandao, { name: 'Wu Weizhong', style: 'matchlock', outfit: { kind: 'mingElite', design: 1 } }),
  warrior('mingShield', 'Chen Bao', PRESETS.swordShield),
  warrior('mingBrigSpear', 'Sun Qi', PRESETS.swordShield, { name: 'Sun Qi', style: 'spear', outfit: { kind: 'mingBrigandine', design: 2 } }),
  warrior('mingGun', 'Zhao Liu', PRESETS.mingMatchlock),
  warrior('mingCrossbow', 'Li Si', PRESETS.mingCrossbow),
  warrior('mingSpear', 'Wang Er', PRESETS.mingSpear),
  warrior('mingDao', 'Zhang San', PRESETS.mingDao),
  // The Eight Banners of the Later Jin. The faction opens on the Bayara (`flagship`).
  { ...warrior('bayara', 'Yangguri', PRESETS.bayara), flagship: true },
  warrior('bannerArcher', 'Hūsun', PRESETS.bannerBow),
  warrior('bannerGuandao', 'Baturu', PRESETS.bannerGuandao),
  warrior('bannerSpear', 'Ilan', PRESETS.bannerBow, { name: 'Ilan', style: 'spear', outfit: { kind: 'bannerArmour', design: 6 } }),
  warrior('arquebus', 'Hans Brenner', PRESETS.contender, { name: 'Hans Brenner', calories: 4050, exercise: 0.75, sex: 'male', style: 'matchlock', outfit: { kind: 'footman', design: 1 }, accessories: [] }),
  warrior('footBow', 'Tom Fletcher', PRESETS.contender, { name: 'Tom Fletcher', calories: 4050, exercise: 0.75, sex: 'male', style: 'bow', outfit: { kind: 'footman', design: 2 }, accessories: [] }),
  warrior('ashigaruSpear', 'Gonbei', PRESETS.yari),
  warrior('ashigaruBow', 'Sakuzaemon', PRESETS.spear, { name: 'Sakuzaemon', heightCm: 157, calories: 2500, style: 'archerYumi', outfit: { kind: 'ashigaru', design: 1 }, accessories: [] }),
  warrior('hoplomachus', 'Priscus', PRESETS.hoplomachus),
  warrior('murmillo', 'Verus', PRESETS.murmillo),
  warrior('secutor', 'Flamma', PRESETS.secutor),
  warrior('thraex', 'Spartacus', PRESETS.thraex),
  warrior('retiarius', 'Kalendio', PRESETS.retiarius),
  warrior('scissor', 'Astacius', PRESETS.scissor),
  { ...warrior('maximus', 'Maximus', PRESETS.maximus), legend: { order: 7, kicker: { en: 'The General', zh: '将军' }, line: { en: 'A legion swordsman in the arena: gladius, no shield, a veteran\'s parries.', zh: '进了竞技场的军团剑士：一把短剑，不拿盾，老兵的格挡功夫。' } } },
  { ...warrior('commodus', 'Commodus', PRESETS.commodus), legend: { order: 8, kicker: { en: 'The Emperor', zh: '皇帝' }, line: { en: 'The emperor as Hercules: lion skin and club, heavy blows.', zh: '扮成赫拉克勒斯的皇帝：披狮皮，抡棍棒，下手沉。' } } },
  warrior('lorarius', 'Felix the lorarius', PRESETS.whip),
  warrior('legionary', 'Gaius Valerius Crispus', PRESETS.legionary),
  warrior('centurion', 'Marcus Caelius', PRESETS.centurion),
  warrior('peasant', 'Hob Miller', PRESETS.spear),
  warrior('starved', 'Starved Rebel', PRESETS.starved),
  warrior('pistol', 'Sgt. Dana Cole', PRESETS.handgun),
  warrior('ladyAshford', 'Lady Ashford', PRESETS.revolver),
  warrior('lordAshford', 'Lord Ashford', PRESETS.rapier),
  warrior('baton', 'Officer Reyes', PRESETS.baton),
  warrior('riot', 'Officer Dale Burke', PRESETS.riot),
  warrior('police', 'Officer Mike Kowalski', PRESETS.police),
  warrior('policeBaton', 'Officer Ana Ruiz', PRESETS.police, { name: 'Officer Ana Ruiz', sex: 'female', heightCm: 166, style: 'baton', calories: 2300, outfit: { kind: 'police', design: 1 }, look: { skinTone: 'tan', hairStyle: 'bun', hairColor: '#120d0a', facialHair: 'none', eyeColor: 'brown' } }),
  warrior('swatShotgun', 'Cpl. Marcus Hale', PRESETS.shotgun),
  warrior('specialForces', 'SSgt. Ryan Brooks', PRESETS.rifle),
  warrior('infantry', 'Spc. Luis Herrera', PRESETS.infantry),
  // An M2-2 flamethrower operator: SSgt. Brooks's build and training, a plate carrier and helmet under the tanks, a pistol at his belt.
  warrior('flamer', 'Sgt. Cal Rourke', withTanks({ ...structuredClone(PRESETS.rifle), name: 'Sgt. Cal Rourke', style: 'flamethrower', look: { ...PRESETS.rifle.look, facialHair: 'stubble', hairColor: '#2a1c12' } })),
  // A firefighter in a proximity suit, his pike pole fought as a staff.
  warrior('firefighter', 'Lt. Joe Brennan', PRESETS.firefighter),
  warrior('knife', 'Ryo Kanda', PRESETS.knife),
  // Apes and monkeys. The faction opens on the silverback (`flagship`).
  { ...warrior('gorilla', 'Silverback', PRESETS.gorilla), flagship: true },
  warrior('chimp', 'Chimpanzee', PRESETS.chimp),
  warrior('baboon', 'Chacma baboon', PRESETS.baboon),
  warrior('macaque', 'Rhesus macaque', PRESETS.macaque),
  // Machines, and a man in one. The faction opens on the combat bot (`flagship`).
  warrior('humanoid', 'Humanoid robot', PRESETS.humanoid),
  warrior('miniHumanoid', 'Mini humanoid robot', PRESETS.miniHumanoid),
  warrior('dogGo2', 'Go2 robot dog', PRESETS.dogGo2),
  warrior('dogSpot', 'Spot with arm', PRESETS.dogSpot),
  warrior('dogVision60', 'Vision 60, rifle turret', PRESETS.dogVision60),
  warrior('exoArmoured', 'Pvt. Owen Kade', PRESETS.exoArmoured),
  { ...warrior('combatBot', 'Combat bot', PRESETS.combatBot), flagship: true },
  warrior('boxer', 'Marcus "The Wall"', PRESETS.heavy),
  warrior('kickboxer', 'Leo Quickhands', PRESETS.light),
  warrior('muayThai', preset('muayThai')?.name ?? 'Muay Thai', preset('muayThai') ?? PRESETS.light, { style: 'muayThai' }),
  warrior('street', preset('street').name, preset('street')),
  warrior('sumo', preset('sumo').name, preset('sumo')),
  warrior('bat', 'Tony Marchetti', PRESETS.bat),
  warrior('brawler', 'Hank Doyle', PRESETS.clinchBrawl),
  warrior('mix', preset('mix').name, preset('mix')),
  warrior('unskilled', preset('unskilled').name, preset('unskilled')),
].map(unitNamed);

// Test units: built and rated, but not in the game's pickers until they are approved. `#flamer` in the address (with any other
// flags: `#maps=off&flamer`) puts them in, for a test build; approved, they move up into WARRIORS (none waits now: the flag does nothing).
export const TEST_WARRIORS = [];

/** Whether this page shows the test units (`flamer` among the address's # flags). */
export const testUnitsOn = (hash = globalThis.location?.hash ?? '') => /^#(.*&)?flamer(&|$)/.test(hash);

if (testUnitsOn()) WARRIORS.push(...TEST_WARRIORS.filter((unit) => !WARRIORS.some((warrior) => warrior.key === unit.key)));

// ---- Ratings ------------------------------------------------------------------
// From src/ratings.js (generated by tools/ratings.js): a type's fitted
// strength against Maximus (100) and Tanzong the staff monk; proportional to
// inferred K/D (against Maximus, 100 × it).

const geometricMean = (values) => Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);

/** A fighter's rating by his type (style and armour), else his style's; null if neither was rated. */
export function ratingOf(inputs) {
  // (A style not yet in the generated table is rated as the one it stands for until the ratings are next made: `ratedAs`.)
  const style = STYLES[inputs.style]?.ratedAs ?? inputs.style;
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

// ---- Stars and order (Deadliest Warrior) ----------------------------------------

// A rating as one to five stars: each band about three times the last
// (ratings are proportional to K/D, so a log scale). Maximus (100) has four.
export const STARS = { bands: [5, 20, 60, 150] };

/** A fighter's strength as 1-5 stars (by his rating); 0 if unrated. */
export function starsOf(inputs) {
  const rating = ratingOf(inputs);
  if (!rating) return 0;
  return 1 + STARS.bands.filter((band) => rating >= band).length;
}

// A kit is armour if it weighs this share of the body or more, or turns this much of a cut.
// (`mass` 0.055, was 0.1: all armour was cut to 0.55 of its weight, and the same kits stay armour.)
const ARMOURED = { mass: 0.055, cut: 0.5 };

/** How heavily a fighter is armoured: his kit's weight (share of his body's); 0 for no armour. */
export function armourWeight(inputs) {
  if (!OUTFITS[inputs.outfit?.kind]) return 0;
  // As worn: the set of his design (outfitsets.js).
  const outfit = outfitOf(inputs).spec;
  const mass = outfit.extraMass ?? 0;
  const cut = outfit.protection?.cut ?? 0;
  return mass >= ARMOURED.mass || cut >= ARMOURED.cut ? Math.max(mass, 0.01) : 0;
}

// The roster's order: the armoured first, heaviest armour to lightest (the stronger first at a weight);
// then the unarmoured, strongest to weakest.
WARRIORS.sort((a, b) => armourWeight(b.inputs) - armourWeight(a.inputs) || (ratingOf(b.inputs) ?? 0) - (ratingOf(a.inputs) ?? 0));
