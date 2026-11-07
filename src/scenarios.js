// Scenarios: set fights in set places. Each is data for the same world, the
// same bodies, physics and AI as the sandbox — only the place, the people
// and what they wear differ.

import { FRAMES, normaliseInputs, PRESETS } from './body.js';
import { caloriesForBodyFat, caloriesForWeight } from './physiology.js';
import { createWorld, seededRandom } from './physics.js';
import { STYLES } from './moves.js';
import { SUBWAY_ARENA } from './props/subway.js';
import { atahualpa, bannerman, conquistadorHorseman, drilledSoldier, englishArcher, englishManAtArms, europeanSoldier, footSoldier, frenchFoot, frenchKnight, pikeman, hanHorseman, hospitaller, incaMan, mingHorseman, mingSoldier, mountedKnight, nobleKnight, ottomanSoldier, rebel, romanHorseman, roninWarrior, samuraiHorseman, sengokuWarrior, swatOfficer, wokouRaider, wokouSamurai, yakuza } from './cast.js';
import { gallicHorseman, gothWarrior, hunRider, infantrySoldier, lateRomanSoldier, parthianRider, republicanLegionary, xiongnuRider } from './cast.js';

// Rome against Han: thirty-five a side (every level's armies are kept to about seventy men in all: the
// physics steps every one of them every frame), ten to a rank; a centurion to every
// eighty legionaries (a century), Li Ling among his crossbowmen.
export const LEGION = { perSide: 35, arena: { halfX: 26, halfZ: 12 }, wingsArena: { halfX: 42, halfZ: 17 }, ranks: { spacing: 0.95, rowSpacing: 1.2, perRow: 10 }, romanFront: 14, hanFront: 3, century: 80 };

// The horse of Rome against Han: an ala of auxiliaries (spatha and spear) for the legion, and for
// the Han a troop of frontier cavalry: sabre and spear, and two horse archers (Li Ling's men met the
// Xiongnu's). They take the place of a rear rank of foot, so a side stays thirty-five.
const LEGION_HORSE = { roman: { longsword: 3, spear: 3 }, han: { dao: 2, spear: 2, steppeBow: 2 } };
const total = (styles) => Object.values(styles).reduce((sum, count) => sum + count, 0);

/** The two armies of Rome against Han, `count` a side. */
export function legionSides(random, count = LEGION.perSide) {
  const red = Array.from({ length: count }, (_, index) => drilledSoldier(index % LEGION.century === 0 ? PRESETS.centurion : PRESETS.legionary, random, index === 0 ? { name: PRESETS.centurion.name } : {}));
  const blue = Array.from({ length: count }, (_, index) => drilledSoldier(PRESETS.hanCrossbow, random, index === Math.floor(LEGION.ranks.perRow / 2) ? { name: PRESETS.hanCrossbow.name } : {}));
  return { red, blue };
}

/**
 * Morning mist for the levels that have it (a scenario's `weather`; render.js
 * applyWeather): fog [near, far] in metres from the camera, light — at the
 * far edge of the fighting the haze is a fifth to a third, the land beyond
 * goes soft and the far hills are silhouettes. The wokou came up the canals
 * at first light; the morning of Sekigahara was famously foggy; Maidstone's
 * square, a June dawn. Pyongyang uses the same place as Sekigahara, clear.
 * (Agincourt's grey morning after a night's rain is given with its level.)
 */
export const WEATHER_MIST = { wokou: [5, 75], rebellion: [6, 75], sekigahara: [12, 120], port: [8, 45], sarhu: [8, 80] };

/**
 * Pier 9's sea fog at 2 a.m.: a light fog off the water, dim warm grey where
 * the sodium lamps light it, from 8 m gone by 45 (the cranes and the far
 * stacks fade into it); the lamps glow in it. A light breeze off the water
 * carries it in (wind.js).
 */
const WEATHER_SEA_FOG = { fog: WEATHER_MIST.port, colour: 0x3c362e, sky: 0.85, halos: true, wind: { speed: 2.5, gust: 0.2 } };

/**
 * A scenario: where (an arena's floor half-sizes and the scene drawn round
 * it), and who, as ordinary fighter inputs plus what they wear. A body is
 * given by its weight: the calories that settle at it are worked out when
 * the bout is built, as the builder's slider would.
 */

// Sekigahara, 21 October 1600: Tokugawa Ieyasu's Eastern army (some 75-90,000) against the Western army of Ishida
// Mitsunari and the Toyotomi lords (about as many, a little more on paper) in a valley in the morning fog; the guns
// and the spears fought it out in the middle until Kobayakawa turned on his own side. Here, as nearly even as the
// armies were, the West one more: thirty-five to thirty-four, each with its mounted samurai on a flank to charge when
// the lines close (`wings` below). Blades and polearms first (the front ranks), the bows and guns last.
const SEKIGAHARA_SIDE = {
  east: {
    samurai: { katana: 3, naginata: 2, spear: 2, bow: 1 },
    ashigaru: { spear: 8, bow: 3, matchlock: 5, katana: 3, naginata: 1 },
  },
  west: {
    samurai: { katana: 3, naginata: 2, spear: 2, bow: 2 },
    ashigaru: { spear: 8, bow: 3, matchlock: 5, katana: 3, naginata: 1 },
  },
};

// Each army's colours: the East (Tokugawa) in red, the West (Ishida's, Toyotomi's) in black and blue (the Japanese army's colours at Pyongyang).
const SEKIGAHARA_EAST = { tint: { armor: '#9a1f18', lace: '#1a1a1d' }, banner: '#b3161b' };
const SEKIGAHARA_WEST = { tint: { armor: '#1c2030', lace: '#2a4a9a' }, banner: '#1f3f8a' };
// A side's mounted samurai: spears (the yari from the saddle), a sword and the bow.
const SEKIGAHARA_HORSE = { spear: 3, katana: 1, bow: 2 };

function sekigaharaSide(random, army, colours) {
  const warriors = [];
  for (const [rank, styles] of Object.entries(SEKIGAHARA_SIDE[army])) {
    for (const [style, count] of Object.entries(styles)) {
      for (let index = 0; index < count; index += 1) warriors.push(sengokuWarrior(random, colours, style, rank));
    }
  }
  const shooter = (warrior) => (STYLES[warrior.style]?.ranged ? 1 : 0);
  return warriors.sort((a, b) => shooter(a) - shooter(b));
}

// Pyongyang, 1593: the Ming army storms the city held by Konishi
// Yukinaga. Fifteen Ming foot and forty-four Japanese; the Ming regulars
// only — brigandine and elite — led by an elite with the guandao; gun and bow
// men behind on both sides. Li Rusong's Liaodong horse ride with them (below):
// the Ming came south with the northern cavalry the Japanese did not have; here
// the Japanese hold the city with more men than the Ming bring to this part of the wall.
const PYONGYANG_MING = {
  elite: { guandao: 2, threeEyed: 1 },
  brigandine: { swordShield: 5, spear: 4, matchlock: 3 },
};
const PYONGYANG_JAPANESE = {
  samurai: { katana: 6, naginata: 2, spear: 4 },
  ashigaru: { spear: 14, matchlock: 11, bow: 7 },
};
// The Ming horse: northern heavy cavalry, sabres and spears with a few three-eyed guns; the Japanese had none in the field.
const PYONGYANG_HORSE = { dao: 4, spear: 5, threeEyed: 2 };

/** Blades and polearms first (the front ranks), bows and guns last. */
// Where the bows and guns open a battle: in the front rows, shooting, the
// blades and spears this far (m) behind them, to go through when it comes to hand strokes.
const SHOOTERS_FRONT_GAP = 4;

function shootersBehind(warriors) {
  const shooter = (warrior) => (STYLES[warrior.style]?.ranged ? 1 : 0);
  return warriors.sort((a, b) => shooter(a) - shooter(b));
}

function pyongyangSides(random) {
  const ming = [];
  for (const [rank, styles] of Object.entries(PYONGYANG_MING)) for (const [style, count] of Object.entries(styles)) for (let index = 0; index < count; index += 1) ming.push(mingSoldier(random, style, rank));
  const japanese = [];
  for (const [rank, styles] of Object.entries(PYONGYANG_JAPANESE)) for (const [style, count] of Object.entries(styles)) for (let index = 0; index < count; index += 1) japanese.push(sengokuWarrior(random, SEKIGAHARA_WEST, style, rank));
  const red = shootersBehind(ming);
  const blue = shootersBehind(japanese);
  // Led by the two commanders: Li Rusong for the Ming, Konishi Yukinaga in the city.
  red[0] = { ...red[0], name: 'Li Rusong' };
  blue[0] = { ...blue[0], name: 'Konishi Yukinaga' };
  return { red, blue };
}

// Sarhu, 14-15 April 1619 (Wanli 47, the third month). Yang Hao sent four Ming columns, some 88,000 men with Korean
// allies, by four roads into Nurhaci's country to meet at Hetu Ala; the season's late snow held them, and the
// columns could not keep together. Du Song's western column, the strongest, hurried ahead of the others, crossed the
// Hun River, left half his men in the camp at Sarhu and went on against the Jurchen at Jiefan. Nurhaci massed his
// eight banners (some 50-60,000) against that one column, broke the camp at Sarhu and then Du Song's men at Jiefan,
// and over the next days destroyed Ma Lin's and Liu Ting's columns one at a time; Li Rubai's turned back. The Ming
// had more guns than the banners, matchlocks, three-eyed guns and cannon, but the fighting went on in the dark and
// the mist (the Ming lit torches the Jurchen archers shot by), the powder in the wet, the columns apart; it was won
// by the banners' heavy foot and archers at close range and their armoured horse. Here, one fight of Du Song's
// column: a few of his household elite, many regulars in brigandine and some garrison men, a few gunners in front;
// against them the banners, every man in his banner's coat of plates, spear, saber and guandao before the archers
// with the heavy bow, and three Bayara of the guard on horse on the flank, their heavy spears couched
// (WEAPONS.manchuLance). The two sides here about even, as they were not that day: the banners won by being many where
// the Ming were few.
const SARHU = {
  ming: {
    elite: { guandao: 1, swordShield: 1, threeEyed: 1 },
    brigandine: { matchlock: 4, swordShield: 6, spear: 7 },
    garrison: { matchlock: 2, spear: 5, dao: 3 },
  },
  banners: { spear: 10, dao: 4, guandao: 4, manchuBow: 10 },
  bayara: { bayaraLance: 3 },
};
const SARHU_MING = 'ming';

/** Du Song's men and the banners at Sarhu: the Ming's shooters in front of their line, the banners' archers behind theirs. */
function sarhuSides(random) {
  const ming = [];
  for (const [rank, styles] of Object.entries(SARHU.ming)) for (const [style, count] of Object.entries(styles)) for (let index = 0; index < count; index += 1) ming.push(mingSoldier(random, style, rank, { people: SARHU_MING }));
  const banners = shootersBehind(company(SARHU.banners, (style) => bannerman(random, style)));
  const red = shootersBehind(ming);
  red[0] = { ...red[0], name: 'Du Song' };
  // Nurhaci under his own banner, the Plain Yellow (the kit's first design), sixty that spring.
  banners[0] = { ...bannerman(random, banners[0].style, 'banner', { design: 0 }), name: 'Nurhaci', age: 60 };
  return { red, blue: banners };
}

/** `count` men from `make(style)`, for each style. */
function company(styles, make) {
  const men = [];
  for (const [style, count] of Object.entries(styles)) for (let index = 0; index < count; index += 1) men.push(make(style));
  return men;
}

// Cajamarca, 16 November 1532. Pizarro's hundred and sixty-eight Spaniards
// (sixty-two of them horse, a few arquebusiers and two small falconets) hid
// in the long halls round the town's walled square; Atahualpa came in at the
// end of the afternoon on his litter with some five or six thousand of his
// people, by his own order without their arms (a few slings and small maces
// under their tunics, the Spaniards said). At Pizarro's signal Candia's gun
// fired, the trumpets sounded, and horse and foot burst out of the doorways
// on every side crying Santiago; the crowd broke and ran, threw down a stretch
// of the square's wall in the crush, and was cut down in the fields beyond.
// No Spaniard was killed. Atahualpa was dragged from his litter within the
// half hour, his lords holding it up as their arms were cut from them.
// Here at the game's scale: fourteen Spaniards (five of them horse, as the
// horse was a third of Pizarro's men) against fifty-two (MUSTER.cap) of the
// retinue, the same lopsided arms on both sides as there were. What panics
// them is the general morale: their fear of the strength before them (steel,
// armour, horses: ai.js AI.standing), and the shock of a gun or a charging
// horse among people who had never met either (AI.shock, FACTIONS inca
// `strangers`). Nothing here is the level's own but the men, where they
// stand and when the signal comes.
const CAJAMARCA = {
  // Each Spaniard in the order cast, and where he waits (world [x, z], m):
  // Pizarro, two hidalgos and the two arquebusiers (Candia's) at the west end
  // before the ushnu; the horse and the sword-and-buckler men in the doorways
  // of the long halls on the north and south sides. Names from the roll of Cajamarca.
  spanish: [
    ['hidalgo', null, [-14.8, 0], 'Francisco Pizarro'],
    ['hidalgo', null, [-14.8, -1.6], 'Miguel de Estete'],
    ['hidalgo', null, [-14.8, 1.6], 'Juan de Salcedo'],
    ['arquebusier', null, [-15, -3.6], 'Pedro de Candia'],
    ['arquebusier', null, [-15, 3.6], 'Alonso Pérez'],
    ['horse', 'lance', [-11, -9.4], 'Hernando Pizarro'],
    ['rodelero', null, [-7, -9.8], 'Diego de Trujillo'],
    ['horse', 'lance', [-3, -9.4], 'Juan Pizarro'],
    ['rodelero', null, [1, -9.8], 'Pedro Pizarro'],
    ['horse', 'lance', [-11, 9.4], 'Hernando de Soto'],
    ['rodelero', null, [-7, 9.8], 'Juan Ruiz de Arce'],
    ['horse', 'espada', [-3, 9.4], 'Sebastián de Benalcázar'],
    ['rodelero', null, [1, 9.8], 'Pedro Sancho'],
    ['horse', 'espada', [5, 9.4], 'Gonzalo Pizarro'],
  ],
  // The retinue: lords of the Inca's lineage round him, the commons round them;
  // most unarmed, a few with the champi under the tunic.
  inca: { noble: { unskilled: 6, champi: 3 }, commoner: { unskilled: 32, champi: 10 } },
  // The crowd stands round Atahualpa in the square's middle, a little east of
  // it (it came in at the east gate): `middle` [x, z], a man to `room` m² (a
  // packed crowd), `loose` m out of a sunflower's places.
  crowd: { middle: [4, 0], room: 1.1, loose: 0.25 },
  // Every `champiEvery`th of the commons from the middle out is one of the armed (as long as they last).
  champiEvery: 4,
  // The signal (s after the start): Candia's gun; till then the Spaniards are hidden (ai.js springAmbush).
  signal: 5,
};
// The red side faces +x from -x: a man at world [x, z] stands at [back, across] = [-x, -z] of a red layout from front 0; blue's is [x, z].
const cajamarcaLayout = (corner, spots) => spots.map(([x, z]) => (corner === 'red' ? [-x, -z] : [x, z]));
/** The crowd's places round its middle, from the middle out (a sunflower: even, unrowed), world [x, z]. */
function crowdSpots(count, { middle, room }) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const step = Math.sqrt(room / Math.PI);
  return Array.from({ length: count }, (_, index) => [middle[0] + step * Math.sqrt(index) * Math.cos(index * golden), middle[1] + step * Math.sqrt(index) * Math.sin(index * golden)]);
}
/** Atahualpa's retinue in order from the middle out: he, his lords, the commons with the armed among them. */
function cajamarcaInca(random) {
  const lords = company(CAJAMARCA.inca.noble, (style) => incaMan(random, style, 'noble'));
  const unarmed = company({ unskilled: CAJAMARCA.inca.commoner.unskilled }, (style) => incaMan(random, style, 'commoner'));
  const armed = company({ champi: CAJAMARCA.inca.commoner.champi }, (style) => incaMan(random, style, 'commoner'));
  const commons = [];
  while (unarmed.length || armed.length) commons.push(commons.length % CAJAMARCA.champiEvery === 1 && armed.length ? armed.shift() : unarmed.shift() ?? armed.shift());
  return [atahualpa(random), ...lords, ...commons];
}
/** Pizarro's men, in CAJAMARCA.spanish's order, each by name; Pizarro (about fifty-four) leads. */
function cajamarcaSpaniards(random) {
  return CAJAMARCA.spanish.map(([type, style, , name]) => ({ ...(type === 'horse' ? conquistadorHorseman(random, style) : europeanSoldier(random, type)), name, ...(name === 'Francisco Pizarro' ? { age: 54, leads: true } : {}) }));
}
// The retinue's men: Atahualpa and the rest.
const CAJAMARCA_INCA = 1 + Object.values(CAJAMARCA.inca).reduce((sum, styles) => sum + total(styles), 0);

// Baxemboy, Formosa, 1661: the VOC's musketeers and pikemen from Fort
// Zeelandia against Koxinga's army: his masked "iron men" in scale, his
// regulars in brigandine, garrison troops, and a few Japanese.
const ZEELANDIA = {
  dutch: { musketeer: 9, pikeman: 6, officer: 3 },
  // About a third of his regulars in iron lamellar with arm guards, units of their own (spears and shields); the rest in
  // the brigandine vest.
  koxinga: { elite: { guandao: 4, swordShield: 2 }, brigandine: { swordShield: 3, spear: 1, matchlock: 3 }, lamellar: { spear: 2, swordShield: 1 }, garrison: { spear: 8, dao: 2, matchlock: 2 }, ronin: { ronin: 2 } },
};

// A wokou raid on the Zhejiang coast, 1550s: rōnin and Chinese sea raiders
// against a garrison with one or two brigandine regulars among it.
// The coast garrisons on paper were a good many (a weisuo's rolls ran to hundreds),
// the raiding bands a few score: here the garrison has the numbers. What it lacks is
// the men: old, underfed and undrilled (cast.js PERIOD_BUILD mingCoast), with a few
// bows and nothing that fires powder. Whether they stand is for the general weighing
// of strength to say (ai.js AI.standing), not for this table.
const WOKOU = {
  // Japanese and Chinese together, as the raids were. The Ming accounts
  // (Zheng Ruozeng's Chouhai tubian, Qi Jiguang's own) describe the raiders
  // as swordsmen first: the long Japanese sword and the great two-handed
  // field sword (the ōdachi) leaping in at a run, the Chinese of the bands
  // with dao and spear. Few guns or bows among them: they came on and cut.
  // A few of the Japanese are rōnin, masterless swordsmen of the wars at
  // home (the raids' fighting core, as the Ming saw it): they lead the rush.
  // These are the raiders of Taizhou, 1561 (Qi Jiguang's level): by then the
  // bands were mostly Chinese, the Japanese a stiffening of swordsmen.
  raiders: { ronin: { ronin: 3 }, japanese: { katana: 6, odachi: 3 }, chinese: { dao: 8, spear: 6 } },
  // The raid of 1554 (the wokou level) is a Japanese band: rōnin and samurai
  // out of the wars at home (the raids' fighting core, as the Ming saw it),
  // some in full armour with their own swords and yari, the rest of the
  // Japanese in what they have; a few Chinese of the coast with them, guides
  // and pirates of the islands, who keep to the back (`samurai`: men of the
  // samurai class, armoured, cast.js sengokuWarrior, under no lord's colours).
  raid: { ronin: { ronin: 6 }, samurai: { katana: 4, yari: 2 }, japanese: { katana: 4, odachi: 3, naginata: 1 }, chinese: { dao: 4, spear: 2 } },
  // A coast garrison of the 1550s: mostly spears and swords, a few bows, no
  // firearms; the weisuo levy in its hemp vests, and a pair of regulars in brigandine.
  garrison: { garrison: { spear: 17, dao: 11, bow: 4 }, brigandine: { swordShield: 1, spear: 1 } },
  // One colour to a kind, the dynasty's red, so the two sides read apart
  // across the square (OUTFITS designs: the garrison's red coat, the
  // brigandine's red cloth); the raiders are in what they have.
  design: { garrison: 0, brigandine: 0 },
  // The lines start this far (m) from the middle of the square: open ground
  // between them for the raiders' run in, and for guns to be fired before it arrives.
  front: 8,
};

// The raiders as they come on: a loose crowd, nine abreast; the Japanese in the front rank, the rōnin first among them.
const WOKOU_RAIDERS_ORDER = { front: WOKOU.front, spacing: 1.3, rowSpacing: 1.6, perRow: 9, loose: 0.5 };
// The garrison drawn up across the square in two long ranks, the bows in a row of their own before them to loose as the raiders come
// on, the spears and dao close behind (the square is too shallow for the usual 4 m: `shootersFront` here 1.5 m).
const WOKOU_GARRISON_ORDER = { front: WOKOU.front, spacing: 1.2, rowSpacing: 1.6, perRow: 15, shootersFront: 1.5, loose: 0.25 };

/**
 * The raiders of a wokou level (`mix`: WOKOU.raiders, Qi's Taizhou band, or
 * WOKOU.raid, the 1554 raid): the Japanese first (the front rank, filled from
 * one end to the other; the samurai before the rest), the rōnin spread evenly
 * along it, then the Chinese, in the back rows.
 */
function wokouRaiders(random, mix = WOKOU.raiders) {
  const ronin = company(mix.ronin, (style) => roninWarrior(random, style));
  const samurai = company(mix.samurai ?? {}, (style) => wokouSamurai(random, style));
  const japanese = [...samurai, ...company(mix.japanese, (style) => wokouRaider(random, style, 'japanese'))];
  const every = WOKOU_RAIDERS_ORDER.perRow / ronin.length;
  ronin.forEach((man, index) => japanese.splice(Math.min(japanese.length, Math.floor(index * every + every / 2)), 0, man));
  return [...japanese, ...company(mix.chinese, (style) => wokouRaider(random, style, 'chinese'))];
}

// Qi Jiguang's army in the Taizhou campaign, 1561: sea raiders (WOKOU.raiders)
// against the army he had raised in Yiwu from miners and farmers and drilled
// himself. Not elite troops: men in the brigandine, in the mandarin-duck squad
// (yuanyang zhen) of his Jixiao xinshu, twelve men who fought as one: a
// leader; two shields (the rattan shield and the dao) in front; two langxian
// (the wolf-brush: a long bamboo with its branches left on, to entangle a
// sword and keep a man off) at the shields' shoulders; four spears striking
// past them; and fowling pieces firing past the shields' shoulders at the
// raiders as they come on and while the shields and the wolf-brushes hold
// them at the line. Qi's command is in the drill and the law, not in a man
// on the field: his household guards (jiading), standing idle behind the
// squads, are not drawn up here. What made them win nine battles in a
// month, with a handful of Ming dead against hundreds of raiders, was
// discipline (his law: a squad that let its leader fall, or ran, was put to
// death; drilled until they moved as one) and the squad's tactics, not
// better men or better steel: the raiders here are sea raiders as the wokou
// level's are (a band of 1561, more of them Chinese: WOKOU.raiders), and the soldiers wear the brigandine the garrison's regulars wear.
const QI = {
  // A squad's men as they stand, [style, back, across]: m behind the front
  // (the shields' line), m across from the squad's middle (+ to the squad's
  // right as it faces the enemy). Close order, the front a man every 0.7 m
  // or so (shoulder to shoulder, room to swing the dao): the two shields side
  // by side, the wolf-brushes (WEAPONS langxian) at their outer shoulders, the
  // spears in the shields' files a metre behind them, a second pair behind
  // those; the leader at the back. The fowling pieces stand in the gaps
  // between the files, a clear lane before each past the shoulders of the men
  // in front (physics/ranged.js FIRE_LANE), two ranks of them: the first a
  // metre behind the shields, in the gaps between the shields and the
  // brushes, the second behind it in the gap between the two shields. Each in
  // the middle of his gap as it truly is: a shield (WEAPONS roundShield, 0.3 m
  // across the rim) stands out on its bearer's left arm, and a gun is laid at
  // its gunner's right cheek, so the lanes lie a little to the right of the
  // middle between two men. They fire by ranks while the front holds
  // (formation.js volleyDue).
  squad: [
    ['swordShield', 0, -0.7], ['swordShield', 0, 0.7],
    ['langxian', 0.3, -2.1], ['langxian', 0.3, 2.1],
    ['matchlock', 1.0, -1.65], ['matchlock', 1.0, 1.25], ['matchlock', 1.8, -0.25],
    ['spear', 1.0, -0.7], ['spear', 1.0, 0.7], ['spear', 1.9, -0.7], ['spear', 1.9, 0.7],
    ['dao', 2.6, 0.25],
  ],
  // Squads side by side, this far (m) between their middles: the brushes of the two a gap of 0.7 m apart.
  squads: 2,
  squadWidth: 4.9,
  // One colour to a kind: his squad men in iron lamellar laced red, with its arm guards (OUTFITS mingBrigandine's
  // lamellar, the user's call: the sleeveless brigandine vest left their arms bare to the wokou's long swords), and the
  // iron lamellar laced in crimson for the guards of his household (OUTFITS mingElite's level design: the setup screen's, ARMIES.qi).
  design: { brigandine: 3, elite: 5 },
};

/** The mandarin-duck squad as Qi drilled it ([style, back, across] a man): the story's southern squads stand so (src/story/battles). */
export const MANDARIN_DUCK = QI.squad;

// How Qi's squads move and fight (formation.js drill): they stand and receive the raiders' rush, and
// do not run at them (`advance` false); each man of a squad goes for a raider come near his place (`squad`), not the front rank only;
// the fowling pieces behind the shields hold their fire until the raiders are within the range the gun carries true
// (`holdFire`: formation.js DRILL.holdFire), then fire by ranks past the shields' shoulders, loading and firing again
// while the front holds the raiders at the line; a gunner draws his dao only for a raider through to him.
const QI_DRILL = { advance: false, squad: true, holdFire: true };
// Qi's army's discipline (ai.js AI.morale): his law, and a year of drill.
const QI_DISCIPLINE = 1;

// Qi's trench. His Jixiao xinshu rings a camp with a ditch and its rampart, and his men dug in where they were to
// stand: a trench across the square before the squads, from the shops on its north side to the canal's embankment (so
// there is no way round it: the first and last points' z, the square's edges, props/jiangnan.js JIANGNAN_PLAN), the spoil
// thrown up on the squads' side into a bank. Not an engineer's work dug overnight (Cerignola's ditch, 1.2 m down behind a
// bank of 0.7) but what a few score men with spades dig through a town's paving in the hour or two before the raiders
// come: a ditch some 0.7 m down and a metre and a half across at the top, its sides fallen in to slopes (loose fill
// stands at about 35-45 degrees; the bottom half a metre wide), and the spoil heaped behind it into a low bank of about
// 0.35 m (`profile`: the ground's height by the metre across it, toward the Ming; the bank's earth is the ditch's, less
// what was spread behind it and the slabs prised up and stacked). Dug by many hands, each man's stretch his own, it
// does not run true: its line wanders a few tenths of a metre either way and it is dug a little deeper here, a
// little wider there (`points`: [z, x off the line, deep, wide], each the profile's heights × deep and offsets ×
// wide at that point). It does not stop a man (FIELDWORKS.climb: he goes down into it and up the bank at a
// scramble) but it takes the run out of a rush at the squads' feet, the guns firing as it comes to it (QI_DRILL),
// the squads waiting at the top. The Ming do not sally across it (formation `drill` advance false: they hold their
// places), so it has no gaps. The bank's back foot stands `before` m short of the shields' line, so the squads' places
// are on level ground, and the slabs are lifted `apron` m either side of what was dug (render.js leaves that unpaved).
const QI_TRENCH = {
  before: 0.8,
  apron: 0.3,
  profile: [[-1.25, 0], [-0.75, -0.65], [-0.25, -0.7], [0.2, 0.3], [0.85, 0.35], [1.5, 0]],
  points: [[-15.5, 0.3, 0.9, 1], [-10.2, -0.2, 1.1, 1.15], [-4.6, 0.35, 0.95, 0.9], [0.6, -0.3, 1.05, 1.05], [6.1, 0.1, 0.85, 1.1], [11.8, 0.4, 1, 0.92]],
};

/**
 * Qi's trench where the battle draws the squads' front (the shields' line) to (`frontAt`, m along x): its points moved so that the furthest
 * back of its bank's foot is QI_TRENCH.before m short of it.
 */
function qiTrench(frontAt) {
  const { profile, points, before, apron } = QI_TRENCH;
  const back = profile[profile.length - 1][0];
  const line = frontAt - before - Math.max(...points.map(([, off, , wide]) => off + back * wide));
  return { ditches: [{ points: points.map(([z, off, deep, wide]) => [line + off, z, deep, wide]), profile, apron }] };
}

// Without the squads' arms (qiJiguangLevel `weapons` off, for measuring): the
// same men armed as the coast garrison was (WOKOU.garrison's spears and dao,
// a few shields, no guns), in the same proportions.
const QI_UNARMED_MIX = ['spear', 'dao', 'spear', 'dao', 'spear', 'spear', 'dao', 'spear', 'dao', 'spear', 'swordShield', 'spear'];

/**
 * Qi Jiguang's army: its squads, and where each man stands (a formation
 * `layout`). `weapons` false: the squads armed as the garrison was
 * (QI_UNARMED_MIX), for measuring what the arms did.
 */
function qiArmy(random, { weapons = true } = {}) {
  const men = [];
  const layout = [];
  for (let squad = 0; squad < QI.squads; squad += 1) {
    const middle = (squad - (QI.squads - 1) / 2) * QI.squadWidth;
    for (const [index, [style, back, across]] of QI.squad.entries()) {
      men.push(mingSoldier(random, weapons ? style : QI_UNARMED_MIX[index], 'brigandine', { people: MING_PEOPLE.qi, design: QI.design.brigandine }));
      layout.push([back, middle + across]);
    }
  }
  return { men, layout };
}

/**
 * Qi Jiguang's level, with each of what won it (`levers`) or without, to
 * measure what each did (tools/levels.js `qiJiguang:morale,tactics`): the same
 * raiders and the same men in the same armour throughout.
 * - `morale`: Qi's discipline (world.discipline; ai.js AI.morale), or none (the garrison's);
 * - `tactics`: the squads drawn up and drilled as squads (formation `layout`
 *   and `drill`: places kept, the guns firing by ranks, the wounded relieved,
 *   several on one), or a crowd in rows as the garrison stood;
 * - `weapons`: the squad's arms (shields, spears, fowling pieces), or the garrison's;
 * - `trench`: the ditch and bank across the square before the squads (QI_TRENCH), or open ground.
 */
export function qiJiguangLevel({ morale = true, tactics = true, weapons = true, trench = true } = {}) {
  const drawnUp = tactics
    ? { front: WOKOU.front, layout: qiArmy(() => 0.5, { weapons }).layout, loose: 0.1, drill: QI_DRILL }
    : { front: WOKOU.front, spacing: 1.2, rowSpacing: 1.6, perRow: 8, loose: 0.25 };
  // The trench is dug before the squads where the battle draws them (SPREAD: the lines start further apart than a level's
  // own numbers put them, the works are not moved with them), the bank's back foot `before` m short of the shields.
  const frontAt = WOKOU.front * spreadScale({ red: WOKOU.front, blue: WOKOU.front });
  const works = trench ? qiTrench(frontAt) : null;
  return {
    title: "Qi Jiguang's army",
    place: 'Taizhou, Zhejiang · 1561',
    blurb: { en: "The same raiders, the same kind of town, seven years on. General Qi Jiguang's army of Yiwu miners and farmers, drilled under his law until they fought as one: in brigandine, in close-ordered mandarin-duck squads of twelve — shields in front, the wolf-brush bamboos thrust in the raiders' faces, spears past them, and the fowling pieces in two ranks behind the shields, holding their fire until the raiders are close, then firing by ranks past the shields' shoulders while the front holds the raiders at the line.", zh: '还是那帮倭寇，还是那样的江南小城，只是隔了七年。戚继光练出来的这支兵，是义乌的矿徒和庄稼汉，在他的军法底下操到能当一个人使：身披布面甲，十二人一队，结成鸳鸯阵——藤牌在前，狼筅迎面捅进倭寇脸上，长枪从筅后递出；两排鸟铳伏在牌后，倭寇不到跟前不放，到了跟前，贴着牌肩一排一排地打，前排就把人死死钉在阵线上。' },
    scene: 'jiangnan',
    weather: { fog: WEATHER_MIST.wokou, sky: 0.75, pale: 0.7, mistLine: [-1, 7], sun: 0.85 },
    arena: { halfX: 14, halfZ: 9, ...(works ? { works } : {}) },
    camera: { yaw: -0.5, pitch: 0.42, distance: 15, maxDistance: 19 },
    roster: { en: `Twenty-six raiders · ${QI.squads} squads of twelve`, zh: `倭寇二十六人 · 鸳鸯阵${QI.squads}队，每队十二人` },
    // Each man where his squad puts him; the squads drilled as a whole (formation.js), under Qi's discipline (ai.js AI.morale).
    formation: { red: WOKOU_RAIDERS_ORDER, blue: { ...drawnUp, discipline: morale ? QI_DISCIPLINE : 0 } },
    cast: (random) => ({ red: wokouRaiders(random), blue: qiArmy(random, { weapons }).men }),
    // The armies its sides may be set up from (ARMIES; muster.js).
    armies: { red: ['raiders'], blue: ['qi'] },
    fighters: [],
  };
}

// ---- The horse peoples: Mobei (119 BC), Carrhae (53 BC), the Catalaunian Plains (451) ----
// Battles of foot against horse archers, on open plains: the floors wide and long
// for riders who shoot, wheel off and come back (riding.js skirmish), the armies
// drawn up where the levels put them (`spread` 1: not drawn further apart, the
// gaps already a horse archer's range).

// A mass of horse archers as it comes onto the field: open order, a horse's length and more between
// riders (m) and between their rows, each a little off his place; packed closer, the first wheel throws
// them into each other.
const RIDERS_LOOSE = { spacing: 5, rowSpacing: 6, loose: 0.9 };

/**
 * Places in a block (`layout` entries, [back, across]: m behind the front, m
 * across), `perRow` abreast `spacing` m apart, rows `rowSpacing` m behind each
 * other, its first row `back` m behind the front and centred `across` m off the
 * middle: as many as `count`.
 */
function block(count, { back = 0, across = 0, perRow, spacing, rowSpacing }) {
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    return [back + row * rowSpacing, across + ((index % perRow) - (inRow - 1) / 2) * spacing];
  });
}

/**
 * A hollow square (the agmen quadratum, Crassus's plinthion at Carrhae: Plutarch,
 * Crassus 23), as many rings deep as `sides` has: each ring a square of `n` men
 * to a side, `spacing` m apart, all about the one middle (so a ring of fewer a
 * side stands inside the one before). Places [back, across] from the outer
 * ring's front side, round each ring from its front left corner (front, right
 * side, rear, left side): 4·(n − 1) men to a ring of n a side.
 */
function hollowSquare({ sides, spacing }) {
  const middle = ((sides[0] - 1) * spacing) / 2;
  const places = [];
  for (const n of sides) {
    const half = ((n - 1) * spacing) / 2;
    for (let t = 0; t < 4 * (n - 1); t += 1) {
      const along = (t % (n - 1)) * spacing - half;
      places.push([[middle - half, along], [middle + along, half], [middle + half, -along], [middle - along, -half]][Math.floor(t / (n - 1))]);
    }
  }
  return places;
}

// Mobei, 119 BC. Wei Qing crossed the Gobi with fifty thousand horse and met the
// chanyu Yizhixie's army on its northern edge. He ringed his wagons (the
// wugang che, hide-covered) into a laager and shot from it with the crossbow
// (the nu: a trigger, a bronze lock, a bolt that went through felt and leather
// at a hundred paces), sent his horse out against the Xiongnu's, fought until
// dusk and a sandstorm, and sent wings round both flanks: the chanyu broke away
// north with a few hundred, and the Han took or killed nineteen thousand
// (Shiji 111). Here: Wei Qing's crossbowmen in iron lamellar, drawn up at the
// floor's end (no wagons are drawn: the Han stand on the open Gobi), and his
// horse on both flanks, sabre, spear and bow; against the Xiongnu, every man
// of them a horse archer in felt and leather, a few with the spear.
const MOBEI = {
  crossbow: 23,
  horse: { dao: 4, spear: 4, steppeBow: 3 },
  xiongnu: { steppeBow: 32, spear: 3 },
  arena: { halfX: 60, halfZ: 38 },
  // The crossbowmen's front this far (m) from the middle, ten to a rank; the Xiongnu's first riders this far on the other side.
  hanFront: 52,
  xiongnuFront: 20,
};

// The Catalaunian Plains, 451. Aetius's Romans and Theoderic's Visigoths (with
// the Alans) against Attila's Huns and his Germanic subjects, the Ostrogoths and
// Gepids; fought over a ridge from the afternoon into the night. Theoderic fell;
// his son Thorismund's horse came down off the heights on the Huns; Attila drew
// back into his wagon laager and the next days left Gaul (Jordanes, Getica
// 36–41): a bloody day without a rout, held by the Romans and Goths. Here: the
// late Roman foot in mail with the oval shield and spear, holding (their kit's
// drill), the Visigoths beside them, and a troop of Visigoth horse on the flank;
// against Hun horse archers and a few of Attila's nobles, and behind them the
// greater part of his army, the Ostrogoth and Gepid foot (Jordanes has the subject
// peoples on both wings and the Huns, the smaller part, in the centre).
const CATALAUNIAN = {
  // The Roman foot (spear and spatha), and its archers on its flank (sagittarii: the late Roman army shot the
  // composite bow it had taken from the steppe).
  romans: { spearOval: 8, spathaOval: 4 },
  archers: { steppeBow: 6 },
  visigoths: { spearRound: 6, spathaRound: 5 },
  visigothHorse: { spear: 3, spatha: 3 },
  huns: { rider: { steppeBow: 8 }, noble: { steppeBow: 2, spatha: 1 } },
  germans: { spearRound: 14, spathaRound: 10 },
  arena: { halfX: 58, halfZ: 38 },
  front: 20,
};

// Carrhae, June 53 BC. Crassus's seven legions and four thousand horse, marching
// across the plain near Harran, were met by Surena's ten thousand horsemen: a
// thousand cataphracts and nine thousand horse archers, and a train of a thousand
// camels laden with arrows. Crassus formed a hollow square; the archers rode round
// it and shot, and the arrows never ran out; his son Publius broke out with his
// Gallic horse and eight cohorts and was cut off by the cataphracts and killed;
// the square stood under the arrows until dark and then broke (Plutarch, Crassus
// 23–27). Here: the legion of the Republic in a tight square, two ranks deep, the
// Gallic horse on its flanks; against horse archers with their camel train behind
// them (`train`: the floor's end, where render.js draws the camels) and a few cataphracts.
const CARRHAE = {
  legionaries: 40,
  gauls: { spear: 3, longsword: 2 },
  parthians: { archer: { steppeBow: 21 }, cataphract: { kontos: 3 } },
  arena: { halfX: 60, halfZ: 40 },
  // The square two deep: a ring of seven a side and, a pace within it, one of five; a pace and a quarter apart (the scutum's width and an elbow's room).
  square: { sides: [7, 5], spacing: 1.25 },
  // Crassus's square stood under the arrows (it marched on only at night, in retreat): it holds its ground, shields locked.
  drill: { advance: false, square: true },
  romanFront: 12,
  parthianFront: 24,
  // The camels this far (m) in from the Parthians' end of the floor (on its middle line).
  train: { back: 3 },
  // The horse held: Publius's Gauls on the square's flanks, Surena's cataphracts (only they: `styles`) behind his
  // archers' flanks; each goes when the other side's horse comes near it or it is struck (formation.js WINGS alarm),
  // and not before `by` s otherwise: Surena kept his heavy horse for the Romans who came out of the square.
  wings: { red: { back: 0, by: 120 }, blue: { styles: ['kontos'], back: 2, by: 120 } },
};

// Koxinga's army is given no discipline of its own: what holds it on the sand is what the men see
// (ai.js standingFear): his iron men and regulars outmatch the Dutch line man for man, and steady the rest.

// Rhodes, 24 September 1522: Süleyman's general assault on the breaches.
// The Knights of St John in plate, their sergeants and gunners, hold the
// Bastion of Aragon against Janissaries, azaps and heavy men in mail-and-plate.
const RHODES = {
  hospitallers: { knight: { longsword: 6, warhammer: 2 }, sergeant: { spear: 4, matchlock: 3 } },
  // The whole army was a hundred thousand, but a breach is narrow: these are the men of one wave who reach the defenders.
  ottomans: { heavy: { maceShield: 2, kilijShield: 1 }, janissary: { yatagan: 4, matchlock: 3 }, azap: { spear: 4, steppeBow: 3 } },
};

/**
 * The armies a battle's sides can be set up from (muster.js: the player's own
 * composition), one to a people at a time: the kinds of men a level's own
 * sides are drawn from, and the others of the same people and period the
 * game has (the garrison men beside the Ming regulars at Pyongyang, the bow
 * among the Maidstone commons, a samurai's horse for the Japanese); none from
 * another age (no gun before the matchlock came, no horse where the people had
 * none). A level names its sides' armies (`armies: { red, blue }`).
 * Each army's `ranks`: a `label`; the outfit `kinds` its men wear and whether
 * they ride (`mounted`), by which a level's own men are known as its; the
 * `styles` they fight in (the first the usual); and `make(random, style)`, a
 * man of it, made as the level's own cast makes him (so a set-up army's men are
 * built, dressed and fed as the level's are). `same`: a style the maker may
 * turn into another (a rōnin swordsman fights with both swords, nitō).
 */
const MING_PEOPLE = { pyongyang: 'ming', koxinga: 'mingSouth', coast: 'mingCoast', qi: 'qi' };
const mingRank = (rank, people, design = null) => (random, style) => mingSoldier(random, style, rank, { people, design });
// The banners' ranks: the banner men in the eight colours on foot, the Bayara of the guard on horse.
const bannerRank = (rank, mounted = false) => (random, style) => bannerman(random, style, rank, { mounted });
const sengokuArmy = (side) => ({
  ranks: {
    samurai: { label: 'Samurai', kinds: ['samurai', 'samuraiTosei'], styles: ['katana', 'naginata', 'yari', 'bow'], make: (random, style) => sengokuWarrior(random, side, style, 'samurai') },
    ashigaru: { label: 'Ashigaru', kinds: ['ashigaru'], styles: ['yari', 'bow', 'matchlock', 'katana', 'naginata'], make: (random, style) => sengokuWarrior(random, side, style, 'ashigaru') },
    horse: { label: 'Mounted samurai', kinds: ['samurai', 'samuraiTosei'], mounted: true, styles: ['yari', 'katana', 'bow'], make: (random, style) => samuraiHorseman(random, side, style) },
  },
});
// A sea raider wears whatever he has (cast.js WOKOU_KIT): any of these.
const RAIDER_KINDS = ['wokou', 'wokouArmoured', 'ashigaru', 'samurai'];

export const ARMIES = {
  legion: {
    label: 'The legion',
    ranks: {
      legionary: { label: 'Legionary', kinds: ['legionary'], styles: ['legionary'], make: (random) => drilledSoldier(PRESETS.legionary, random) },
      centurion: { label: 'Centurion', kinds: ['centurion'], styles: ['centurion'], make: (random) => drilledSoldier(PRESETS.centurion, random) },
      ala: { label: 'Auxiliary horse', kinds: ['romanAuxiliary'], mounted: true, styles: ['longsword', 'spear'], make: (random, style) => romanHorseman(random, style) },
    },
  },
  han: {
    label: 'The Han army',
    ranks: {
      crossbow: { label: 'Crossbowman', kinds: ['hanSoldier'], styles: ['nu'], make: (random) => drilledSoldier(PRESETS.hanCrossbow, random) },
      horse: { label: 'Han horse', kinds: ['hanCavalry'], mounted: true, styles: ['dao', 'spear', 'steppeBow'], make: (random, style) => hanHorseman(random, style) },
    },
  },
  lords: {
    label: 'The lords and their men',
    ranks: {
      knight: { label: 'Knight, mounted', kinds: ['knight'], mounted: true, styles: ['longsword', 'warhammer'], make: (random, style) => mountedKnight(random, style) },
      knightFoot: { label: 'Knight', kinds: ['knight'], styles: ['longsword', 'warhammer'], make: (random, style) => nobleKnight(random, style) },
      foot: { label: 'Foot soldier', kinds: ['footman'], styles: ['spear', 'bow', 'longsword'], make: (random, style) => footSoldier(random, style) },
    },
  },
  commons: {
    label: 'The commons',
    // The rising of 1381: villagers with the fork and the spear, and the longbow every Englishman was bound to practise with.
    ranks: { rebel: { label: 'Rebel', kinds: ['commoner'], styles: ['pitchfork', 'spear', 'bow'], make: (random, style) => normaliseInputs({ ...rebel(random), style }) } },
  },
  east: { label: 'The East', ...sengokuArmy(SEKIGAHARA_EAST) },
  west: { label: 'The West', ...sengokuArmy(SEKIGAHARA_WEST) },
  ming: {
    label: 'The Ming army',
    ranks: {
      elite: { label: 'Elite', kinds: ['mingElite'], styles: ['guandao', 'matchlock', 'threeEyed', 'swordShield'], make: mingRank('elite', MING_PEOPLE.pyongyang) },
      brigandine: { label: 'Brigandine', kinds: ['mingBrigandine'], styles: ['swordShield', 'spear', 'matchlock'], make: mingRank('brigandine', MING_PEOPLE.pyongyang) },
      garrison: { label: 'Garrison', kinds: ['mingGarrison'], styles: ['spear', 'dao', 'matchlock'], make: mingRank('garrison', MING_PEOPLE.pyongyang) },
      horse: { label: 'Liaodong horse', kinds: ['mingIronLamellar'], mounted: true, styles: ['dao', 'spear', 'threeEyed'], make: (random, style) => mingHorseman(random, style) },
    },
  },
  banners: {
    label: 'The Eight Banners',
    ranks: {
      banner: { label: 'Banner man', kinds: ['bannerArmour'], styles: ['spear', 'manchuBow', 'dao', 'guandao'], make: bannerRank('banner') },
      bayara: { label: 'Bayara, mounted', kinds: ['bayara'], mounted: true, styles: ['bayaraLance', 'bayaraBow', 'spear', 'dao'], make: bannerRank('bayara', true) },
      bayaraFoot: { label: 'Bayara', kinds: ['bayara'], styles: ['bayaraLance', 'bayaraBow', 'spear', 'dao'], make: bannerRank('bayara') },
    },
  },
  spanish: {
    label: 'The Spaniards',
    ranks: {
      hidalgo: { label: 'Hidalgo', kinds: ['conquistadorPlate'], styles: ['espada'], make: (random) => europeanSoldier(random, 'hidalgo') },
      rodelero: { label: 'Rodelero', kinds: ['conquistadorQuilted'], styles: ['espadaRodela'], make: (random) => europeanSoldier(random, 'rodelero') },
      arquebusier: { label: 'Arquebusier', kinds: ['conquistadorQuilted'], styles: ['matchlock'], make: (random) => europeanSoldier(random, 'arquebusier') },
      horse: { label: 'Jinete', kinds: ['conquistadorPlate'], mounted: true, styles: ['lance', 'espada'], make: (random, style) => conquistadorHorseman(random, style) },
    },
  },
  inca: {
    label: "Atahualpa's retinue",
    // No horse, no steel, no gun: the commons and the lords of 1532, unarmed or with the champi (the sling is not in the game).
    ranks: {
      lord: { label: 'Lord', kinds: ['incaNoble'], styles: ['unskilled', 'champi'], make: (random, style) => incaMan(random, style, 'noble') },
      commoner: { label: 'Attendant', kinds: ['incaUncu'], styles: ['unskilled', 'champi'], make: (random, style) => incaMan(random, style, 'commoner') },
    },
  },
  dutch: {
    label: 'The VOC',
    ranks: {
      musketeer: { label: 'Musketeer', kinds: ['conquistadorQuilted'], styles: ['matchlock'], make: (random) => europeanSoldier(random, 'musketeer') },
      pikeman: { label: 'Pikeman', kinds: ['conquistadorPlate'], styles: ['spear'], make: (random) => europeanSoldier(random, 'pikeman') },
      officer: { label: 'Officer', kinds: ['conquistadorPlate'], styles: ['espada'], make: (random) => europeanSoldier(random, 'officer') },
    },
  },
  koxinga: {
    label: "Koxinga's army",
    ranks: {
      // His iron men, every one masked, in scale (the elite's masked scale design).
      elite: { label: 'Iron man', kinds: ['mingElite'], styles: ['guandao', 'swordShield'], make: mingRank('elite', MING_PEOPLE.koxinga, 4) },
      brigandine: { label: 'Brigandine', kinds: ['mingBrigandine'], designs: [0, 1, 2], styles: ['swordShield', 'spear', 'matchlock'], make: mingRank('brigandine', MING_PEOPLE.koxinga) },
      lamellar: { label: 'Iron lamellar', kinds: ['mingBrigandine'], designs: [3, 4], styles: ['spear', 'swordShield'], make: mingRank('brigandine', MING_PEOPLE.koxinga, 3) },
      garrison: { label: 'Garrison', kinds: ['mingGarrison'], styles: ['spear', 'dao', 'matchlock'], make: mingRank('garrison', MING_PEOPLE.koxinga) },
      ronin: { label: 'Rōnin', kinds: ['ronin'], styles: ['ronin'], same: { nito: 'ronin' }, make: (random, style) => roninWarrior(random, style) },
    },
  },
  hospitallers: {
    label: 'The Order of St John',
    ranks: {
      knight: { label: 'Knight', kinds: ['knight'], styles: ['longsword', 'warhammer'], make: (random, style) => hospitaller(random, style, 'knight') },
      sergeant: { label: 'Sergeant', kinds: ['footman'], styles: ['spear', 'matchlock'], make: (random, style) => hospitaller(random, style, 'sergeant') },
    },
  },
  ottomans: {
    label: 'The Ottomans',
    ranks: {
      heavy: { label: 'Heavy', kinds: ['ottomanHeavy'], styles: ['maceShield', 'kilijShield'], make: (random, style) => ottomanSoldier(random, style, 'heavy') },
      janissary: { label: 'Janissary', kinds: ['janissary'], styles: ['yatagan', 'matchlock'], make: (random, style) => ottomanSoldier(random, style, 'janissary') },
      azap: { label: 'Azap', kinds: ['azap'], styles: ['spear', 'steppeBow'], make: (random, style) => ottomanSoldier(random, style, 'azap') },
    },
  },
  raiders: {
    label: 'The wokou',
    ranks: {
      ronin: { label: 'Rōnin', kinds: ['ronin'], styles: ['ronin'], make: (random, style) => roninWarrior(random, style) },
      samurai: { label: 'Samurai', kinds: ['samurai', 'samuraiTosei'], styles: ['katana', 'yari', 'naginata'], make: (random, style) => wokouSamurai(random, style) },
      japanese: { label: 'Japanese raider', kinds: RAIDER_KINDS, styles: ['katana', 'odachi', 'naginata', 'bow'], make: (random, style) => wokouRaider(random, style, 'japanese') },
      chinese: { label: 'Chinese raider', kinds: RAIDER_KINDS, styles: ['dao', 'spear', 'matchlock'], make: (random, style) => wokouRaider(random, style, 'chinese') },
    },
  },
  coast: {
    label: 'The coast garrison',
    ranks: {
      garrison: { label: 'Garrison', kinds: ['mingGarrison'], styles: ['spear', 'dao', 'bow'], make: mingRank('garrison', MING_PEOPLE.coast, WOKOU.design.garrison) },
      brigandine: { label: 'Brigandine', kinds: ['mingBrigandine'], styles: ['swordShield', 'spear', 'bow'], make: mingRank('brigandine', MING_PEOPLE.coast, WOKOU.design.brigandine) },
    },
  },
  qi: {
    label: "Qi Jiguang's army",
    ranks: {
      brigandine: { label: 'Squad man', kinds: ['mingBrigandine'], styles: ['swordShield', 'langxian', 'spear', 'matchlock', 'dao'], make: mingRank('brigandine', MING_PEOPLE.qi, QI.design.brigandine) },
      elite: { label: 'Guard', kinds: ['mingElite'], styles: ['guandao', 'swordShield', 'spear'], make: mingRank('elite', MING_PEOPLE.qi, QI.design.elite) },
    },
  },
  swat: {
    label: 'SWAT',
    ranks: { officer: { label: 'Officer', kinds: ['swat'], styles: ['handgun', 'baton'], make: (random, style) => swatOfficer(random, style) } },
  },
  // Modern infantry: riflemen with the M4, each carrying one frag grenade (outfits.js infantry).
  infantry: {
    label: 'Infantry',
    ranks: { rifleman: { label: 'Rifleman', kinds: ['infantry'], styles: ['rifle'], make: (random) => infantrySoldier(random) } },
  },
  yakuza: {
    label: 'The yakuza',
    ranks: { soldier: { label: 'Yakuza', kinds: ['yakuza'], styles: ['knife', 'katana', 'handgun'], make: (random, style) => yakuza(random, style) } },
  },
  // ---- The horse peoples and the armies that met them (Mobei, Carrhae, the Catalaunian Plains) ----
  xiongnu: {
    label: 'The Xiongnu',
    ranks: { rider: { label: 'Xiongnu horseman', kinds: ['xiongnu'], mounted: true, styles: ['steppeBow', 'spear'], make: (random, style) => xiongnuRider(random, style) } },
  },
  crassus: {
    label: "Crassus's army",
    ranks: {
      legionary: { label: 'Legionary', kinds: ['republicanLegionary'], styles: ['legionary'], make: (random) => republicanLegionary(random) },
      gauls: { label: 'Gallic horse', kinds: ['romanAuxiliary'], mounted: true, styles: ['spear', 'longsword'], make: (random, style) => gallicHorseman(random, style) },
    },
  },
  parthians: {
    label: "Surena's army",
    ranks: {
      archer: { label: 'Horse archer', kinds: ['parthianArcher'], mounted: true, styles: ['steppeBow'], make: (random, style) => parthianRider(random, style, 'archer') },
      cataphract: { label: 'Cataphract', kinds: ['cataphract'], mounted: true, styles: ['kontos', 'spatha'], make: (random, style) => parthianRider(random, style, 'cataphract') },
    },
  },
  lateRome: {
    label: "Aetius's Romans",
    ranks: { soldier: { label: 'Late Roman foot', kinds: ['lateRoman'], styles: ['spearOval', 'spathaOval', 'steppeBow'], make: (random, style) => lateRomanSoldier(random, style) } },
  },
  visigoths: {
    label: 'The Visigoths',
    ranks: {
      warrior: { label: 'Visigoth', kinds: ['goth'], styles: ['spearRound', 'spathaRound'], make: (random, style) => gothWarrior(random, style) },
      noble: { label: 'Visigoth noble', kinds: ['gothNoble'], styles: ['spathaRound', 'spearRound'], make: (random, style) => gothWarrior(random, style, 'noble') },
      horse: { label: 'Visigoth horse', kinds: ['gothNoble'], mounted: true, styles: ['spear', 'spatha'], make: (random, style) => gothWarrior(random, style, 'noble', { mounted: true }) },
    },
  },
  huns: {
    label: 'The Huns',
    ranks: {
      rider: { label: 'Hun horse archer', kinds: ['hun'], mounted: true, styles: ['steppeBow', 'spatha'], make: (random, style) => hunRider(random, style) },
      noble: { label: "Attila's noble", kinds: ['hunNoble'], mounted: true, styles: ['steppeBow', 'spatha'], make: (random, style) => hunRider(random, style, 'noble') },
    },
  },
  // Attila's Germanic subjects, the Ostrogoths and Gepids, on foot.
  germans: {
    label: 'Ostrogoths and Gepids',
    ranks: { warrior: { label: 'Ostrogoth or Gepid', kinds: ['goth'], styles: ['spearRound', 'spathaRound'], make: (random, style) => gothWarrior(random, style) } },
  },
};

/**
 * Wings of horse. A battle map that history had cavalry in (`wings` on its
 * scenario) is played on a wider floor with a wing of horsemen to a side, in
 * the kit of the time, on the flanks of the foot line: they wait there
 * (formation.js) and charge the enemy's flank and shooters when the foot lines
 * close. A scenario's own `arena`, `formation` and `cast` are the line of
 * battle on foot (the sandbox's fixtures, and the fingerprint's: tools/fingerprint.js);
 * `battleOf` joins the wings to them:
 * - `arena`: the wider floor (the charge needs a run up, and room to wheel),
 * - `camera`: its framing,
 * - `formation`: per side, over the foot's, with `wings` (the placing and release
 *   of formation.js WINGS) to name the riders' place,
 * - `cast(random, sides)`: the sides as the foot cast made them, with the horse added
 *   (or the foot thinned where horse takes their place).
 */
export function battleOf(key) {
  const scenario = SCENARIOS[key];
  const wings = scenario.wings;
  if (!wings) return drawnApart(scenario);
  const formation = Object.fromEntries(['red', 'blue'].map((corner) => [corner, { ...scenario.formation?.[corner], ...wings.formation?.[corner] }]));
  return drawnApart({ ...scenario, arena: wings.arena, camera: wings.camera ?? scenario.camera, formation, cast: (random) => wings.cast(random, scenario.cast(random)) });
}

/**
 * The armies of a battle start further apart than a level's own numbers put
 * them: room for the bows and guns to shoot before the lines meet, and for a
 * line to be seen coming. Each side's `front` (m from the middle to its first
 * row) is drawn back by `factor` (so the gap between the two front lines is
 * that much wider), to at least `least` m between them; a `layout`'s men
 * (Qi Jiguang's squads) stand where they did, behind a front drawn back the
 * same. The floor is lengthened by as much as the further side went back, so
 * each army keeps the ground it had behind it (the width, across, is as it
 * was: the lines are no wider), but never past what the
 * place's fixed scenery leaves open (`room`: the town's house fronts, the
 * port's lane of containers, the water town's shops); the camera draws back
 * with the floor, short of a `room`'s `camera` (the square's house fronts).
 * A level may draw its armies apart by a factor of its own (`spread`): one
 * whose place is too small for the whole of it.
 * Only the battles: a duel (no `cast`) and the levels' own data
 * (SCENARIOS[key], the sandbox's fixtures and the fingerprint's) are left as they are.
 */
export const SPREAD = {
  factor: 1.5,
  least: 12,
  room: {
    // Maidstone's square: the house fronts stand at 12.5 m (render.js buildTown); the camera never further out than they are.
    town: { halfX: 11.5, camera: 10.5 },
    // The water town's square: its shops at ±19.5 m (props/jiangnan.js JIANGNAN_PLAN), wine jars before them.
    jiangnan: { halfX: 18 },
    // The lane between the container stacks: their ends at ±11.3 m (props/harbour.js).
    port: { halfX: 11 },
  },
};

/** How much each front is drawn back (SPREAD): by `factor`, to at least SPREAD.least between the lines, both sides drawn back alike. */
function spreadScale(fronts, factor = SPREAD.factor) {
  const gap = fronts.red + fronts.blue;
  return gap > 0 ? Math.max(factor, SPREAD.least / gap) : factor;
}

/** A battle with its armies drawn apart (SPREAD). */
export function drawnApart(level) {
  if (!level.cast || !level.formation) return level;
  // An ambush (a side's `ambush`: Cajamarca) is laid where it was laid: its men are not in lines to draw apart.
  if (level.formation.red?.ambush || level.formation.blue?.ambush) return level;
  const fronts = Object.fromEntries(['red', 'blue'].map((corner) => [corner, level.formation[corner]?.front ?? 0]));
  const scale = spreadScale(fronts, level.spread);
  const formation = Object.fromEntries(['red', 'blue'].map((corner) => [corner, level.formation[corner]?.front === undefined ? level.formation[corner] : { ...level.formation[corner], front: fronts[corner] * scale }]));
  const back = Math.max(...['red', 'blue'].map((corner) => fronts[corner] * (scale - 1)));
  const room = SPREAD.room[level.scene];
  const halfX = Math.min(room?.halfX ?? Infinity, level.arena.halfX + back);
  const grown = halfX / level.arena.halfX;
  const camera = level.camera && {
    ...level.camera,
    distance: Math.min(room?.camera ?? Infinity, level.camera.distance * grown),
    ...(level.camera.maxDistance !== undefined ? { maxDistance: Math.min(room?.camera ?? Infinity, level.camera.maxDistance * grown) } : {}),
  };
  return { ...level, arena: { ...level.arena, halfX }, camera, formation };
}

// ---- Agincourt and Cerignola: battles won from behind what was dug, planted and soaked ----
//
// Two defenders' victories, each fought on ground that did half the work: the field, its mud and its
// fieldworks are the level's `arena.works` (physics/fieldworks.js: stakes, walls, ditches, soft ground),
// as they were there; the armies are what they were, in proportion, thirty-five or so a side
// (the game keeps every level to about seventy men in all: the physics steps each of them every frame).
// The defender stands (formation `drill`, advance false: formation.js) and shoots; the attacker comes on,
// his horse released from the flanks first, as each battle opened. (Qi Jiguang's trench, with the same works, is with his level.)
// Red attacks from -x, blue holds at +x. These levels keep their own spacing (`spread` 1): the works stand
// where the lines are drawn up, and a battle map's drawing apart (SPREAD) would leave them behind.

// Agincourt, 25 October 1415. Henry V's ~8,500 (five archers to every man-at-arms) across the end of a
// ploughed field between the woods of Agincourt and Tramecourt, ~750 m wide where he stood; the French
// host of some 12–15,000, most of it men-at-arms dismounted in plate, came on across ~300 m of fresh
// ploughland soaked by a night's rain, the woods crowding them together as the field narrowed. The
// cavalry on their wings rode first at the archers and were stopped by the stakes; the men-at-arms of
// the vanguard reached the English line spent, pressed so tight they could not lift their arms, and went
// down in heaps in the mud, where the archers fell on them with mallets, swords and daggers.
const AGINCOURT = {
  // The field's length is part of what it did: the French came on across some 250-300 m of it, under the arrows and
  // sinking at every step. Here 55 m of it (the floor's length, `front.french`): as long as a battle can be drawn.
  arena: { halfX: 50, halfZ: 11.5 },
  // Thirty-five: thirty archers and five men-at-arms (the war hammer stands for the poleaxe): six archers to a man-at-arms,
  // as the host had five or six.
  english: { archer: 30, men: { longsword: 3, warhammer: 2 } },
  // Thirty-five: twenty-eight men-at-arms on foot, three lances on the wings (the cavalry wings were ~1,000 of the host,
  // and fewer mounted when the charge went in), four crossbowmen behind. Of the men-at-arms, the knights and esquires
  // in full harness (`foot`) and the men of their retinues in what a lesser man-at-arms had in 1415, a brigandine or a
  // mail shirt with plate at the limbs and a kettle hat or a bascinet (`retinue`: the foot soldier's kit).
  french: { foot: { longsword: 11, warhammer: 7 }, retinue: { longsword: 6, spear: 4 }, horse: { lance: 3 }, crossbow: 4 },
  // The English line's first rank and the French vanguard's, m from the middle.
  front: { english: 7, french: 43 },
  // The archers on the wings, three ranks deep (`rows` back, m), a man every `every` m across from `inner` m out;
  // the men-at-arms in the middle, two ranks of three. (Five archers to a rank: fifteen to a wing in three ranks, a man
  // every metre, so a wing still reaches the woods.)
  archers: { inner: 3.2, every: 1.0, rows: [0, 1.1, 2.2], perRow: 5 },
  men: { every: 1.15, rows: [0, 1.2], perRow: 3 },
  // The field, as it was that morning: fresh plough soaked by a night's rain and churned by the horse. The reference
  // man sinks calf-deep (0.26 m); a man in plate, pressing half as hard again, to the knee; nothing past the plough's
  // pan (0.5 m). Wet clay: a stiff mud (viscosity of the castle's sludge) with little grip. And a film of rain-water standing on it, in the furrows and over
  // the trodden ground (`water`, 4 cm: a puddled field, not a lake): it is over the men's feet as the mud is, drawn, rung and splashed as the castle's water
  // is (worksview.js), and heard as a splash with the squelch (audio/sfx/step.js).
  mud: { x: [-50, 50], z: [-11.5, 11.5], depth: 0.26, firm: 0.5, viscosity: 2, footing: 0.7, surface: 'mud', edge: 0.1, water: 0.04 },
  // The woods' edges: the field ~23 m across where the French formed, narrowing to ~17 where the English stood (some
  // 1,200 yards across at the French end, 900 at the English: the French were squeezed together as they came on).
  woods: [[-50, 11.6], [-20, 11.2], [-8, 10.2], [3, 8.5], [50, 8.5]],
  // The archers' stakes before each wing: two staggered rows, the points leaning out at a horse's chest.
  stakes: { first: 1.6, rows: 2, every: 0.95, rowGap: 0.9, height: 1.05, reach: 0.95 },
};

/** Agincourt's English line: its men-at-arms in the middle, the archers on both wings (formation `layout`, in cast order). */
function agincourtLayout() {
  const layout = [];
  const { archers, men } = AGINCOURT;
  for (let index = 0; index < AGINCOURT.english.archer; index += 1) {
    const wing = index % 2 === 0 ? 1 : -1;
    const at = Math.floor(index / 2);
    const row = Math.floor(at / archers.perRow);
    const file = at % archers.perRow;
    layout.push([archers.rows[row] ?? row * 1.1, wing * (archers.inner + (file + (row % 2) * 0.5) * archers.every)]);
  }
  const count = Object.values(AGINCOURT.english.men).reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / men.perRow);
    layout.push([men.rows[row] ?? row * 1.2, ((index % men.perRow) - (men.perRow - 1) / 2) * men.every]);
  }
  return layout;
}

/** Agincourt's works: the mud over the whole field, the woods closing it in, the stakes before the archers. */
function agincourtWorks() {
  const { front, stakes, archers } = AGINCOURT;
  const x = front.english - stakes.first;
  const outer = archers.inner + (archers.perRow - 0.5) * archers.every + 0.3;
  const stakeLine = (sign) => ({ from: [x, sign * (archers.inner - 0.3)], to: [x, sign * outer], rows: stakes.rows, every: stakes.every, rowGap: stakes.rowGap, toward: -1, height: stakes.height, reach: stakes.reach, stagger: 0.5 });
  return {
    soft: [AGINCOURT.mud],
    walls: [1, -1].map((sign) => ({ points: AGINCOURT.woods.map(([wx, wz]) => [wx, sign * wz]), height: 6, kind: 'wood' })),
    stakes: [stakeLine(1), stakeLine(-1)],
  };
}

// Cerignola, 28 April 1503. Gonzalo Fernández de Córdoba's ~6,300 Spaniards and Germans stood on a vineyard
// slope behind a ditch they had deepened that afternoon, its spoil thrown up into a bank; ~1,000
// arquebusiers lined it, the Landsknecht pikes and the sword-and-buckler men behind. The French (~9,000:
// the gendarmes in plate on barded horses, the Swiss columns, Gascon crossbowmen) attacked at dusk: Nemours
// led the gendarmes at the ditch, could not cross it and was shot dead before it; the Swiss came on, stalled
// at the ditch and the bank under the volleys, and broke. The first battle won by hand guns.
const CERIGNOLA = {
  // The French came on across the open plain below the slope under the guns: room for that (`front.french`).
  arena: { halfX: 32, halfZ: 11 },
  spanish: { arquebusier: 12, pike: 15, rodelero: 8 },
  french: { gendarme: 8, swiss: 22, crossbow: 5 },
  front: { spanish: 7.2, french: 24 },
  // The ditch: its line at x = 4 across the whole front; across it (m toward the Spanish, the ground's height): the
  // French side's lip, down 1.2 m to a bottom a metre wide, up the inner face to the bank's top 0.7 m over the field
  // (1.9 m from the bottom), the bank's back sloping down to the field. Dug by hand in an afternoon: a ditch a horse
  // could not cross, and a man only climbing.
  ditch: { x: 4, reach: 75, profile: [[-2.4, 0], [-1.6, -1.2], [-0.5, -1.2], [0.3, 0.7], [1.5, 0.7], [2.6, 0]] },
  // The Spanish line, close-ordered: a rank of Landsknecht pikes along the back of the bank (`pikes` abreast, a file
  // every `files` m: shoulder to shoulder, as pike files stood, a metre to a man), the pikes levelled over the ditch;
  // the arquebusiers close behind them (`shot`: `ranks` deep, the first `behind` m behind the pikes, `rankSpacing` m
  // between ranks), a file of guns in every `every`th gap between two pikes' files, firing between them past the
  // pikemen's shoulders (physics/ranged.js FIRE_LANE) and changing places by ranks (formation.js volleyDue); the rest
  // of the pikes and the sword-and-buckler men a body `reserve` m behind the guns, in the pikes' files, to step up into
  // the front rank as it thins (formation.js closeRanks).
  line: { pikes: 8, files: 1.0, shot: { ranks: 3, behind: 1.0, rankSpacing: 0.9, every: 2 }, reserve: 1.5, reserveSpacing: 1.0 },
};

/**
 * The Spanish line at Cerignola (CERIGNOLA.line), a formation `layout` in cast order: the pikes (the front rank, then
 * the reserve), the sword-and-buckler men (the reserve), the arquebusiers (in the gaps behind the pikes).
 */
function cerignolaLayout() {
  const { spanish, line } = CERIGNOLA;
  const fileAt = (file) => (file - (line.pikes - 1) / 2) * line.files;
  const lanes = [];
  for (let gap = 0; gap < line.pikes - 1; gap += line.shot.every) lanes.push(fileAt(gap + 0.5));
  const shotRanks = Math.ceil(spanish.arquebusier / lanes.length);
  const reserveFront = line.shot.behind + (shotRanks - 1) * line.shot.rankSpacing + line.reserve;
  const layout = [];
  const reserve = spanish.pike + spanish.rodelero - line.pikes;
  for (let index = 0; index < line.pikes; index += 1) layout.push([0, fileAt(index)]);
  for (let index = 0; index < reserve; index += 1) layout.push([reserveFront + Math.floor(index / line.pikes) * line.reserveSpacing, fileAt(index % line.pikes)]);
  for (let index = 0; index < spanish.arquebusier; index += 1) layout.push([line.shot.behind + Math.floor(index / lanes.length) * line.shot.rankSpacing, lanes[index % lanes.length]]);
  return layout;
}

/** Cerignola's works: the ditch and its bank before the Spanish line. */
function cerignolaWorks() {
  // (Dug right across the field and on beyond the floor's sides, out of sight: the place's ground is open over all of it.)
  const { ditch } = CERIGNOLA;
  return { ditches: [{ from: [ditch.x, -ditch.reach], to: [ditch.x, ditch.reach], profile: ditch.profile }] };
}

// The defenders hold their ground and shoot (formation.js: drilled, not advancing).
const HOLD_GROUND = { advance: false };
// Gonzalo's arquebusiers, behind his pikes: they hold their fire until the French are within its effective range
// (`holdFire`: formation.js DRILL.holdFire), then fire by ranks, each man who has fired changing places with a loaded
// man behind him in his file (the countermarch: formation.js volleyDue, relieveShooters), the pikes before them
// holding the enemy off while they load and fire.
const HOLD_AND_VOLLEY = { advance: false, holdFire: true };
// The attackers' horse goes first, as it did in both: released from the flanks almost at once (formation.js WINGS).
const HORSE_FIRST = { by: 3, release: 40 };

const AGINCOURT_LEVEL = {
  title: 'Agincourt',
  place: 'Agincourt, Artois · 25 October 1415',
  blurb: { en: "King Henry's archers stand behind their stakes at the narrow end of a ploughed field, soaked by a night's rain, between two woods. The French men-at-arms come on across it on foot in plate, sinking to the knee, crowded together as the woods close in; their horse rides first at the archers. Thirty archers and five men-at-arms against twenty-eight men-at-arms, three lances and four crossbows.", zh: '亨利五世的弓手站在木桩后面，守着一块刚犁过的田的窄头，两边是树林，昨夜一场雨浇了个透。法国重甲兵披着板甲，徒步踩过这片烂泥，一脚陷到膝盖；越往前林子越收，人越挤成一团；他们的骑兵先朝弓手冲了过去。三十名弓手、五名重甲兵，对二十八名重甲兵、三名骑枪手、四名弩手。' },
  scene: 'agincourt',
  weather: { fog: [28, 120], sky: 0.8, pale: 0.75, sun: 0.55 },
  arena: { ...AGINCOURT.arena, works: agincourtWorks() },
  spread: 1,
  // From behind the English line, looking down the field between the woods (further round, the woods stand in the way).
  camera: { yaw: 1.25, pitch: 1.0, distance: 44, maxDistance: 46 },
  roster: { en: 'Thirty-two French on foot and three on horse · thirty English archers and five men-at-arms', zh: '法军步行三十二人、骑马三人 · 英格兰弓手三十人、重甲兵五人' },
  formation: {
    // The vanguard packed close, shoulder to shoulder and rank on rank (so tight, the chroniclers say, they could hardly raise their arms).
    red: { front: AGINCOURT.front.french, spacing: 0.85, rowSpacing: 1.0, perRow: 12, loose: 0.15, wings: HORSE_FIRST },
    blue: { front: AGINCOURT.front.english, layout: agincourtLayout(), loose: 0.08, drill: HOLD_GROUND },
  },
  cast: (random) => ({
    red: [...company(AGINCOURT.french.foot, (style) => frenchKnight(random, style)), ...company(AGINCOURT.french.retinue, (style) => frenchFoot(random, style)), ...company({ crossbow: AGINCOURT.french.crossbow }, (style) => frenchFoot(random, style)), ...company(AGINCOURT.french.horse, (style) => frenchKnight(random, style, { mounted: true }))],
    blue: [...company({ longbow: AGINCOURT.english.archer }, (style) => englishArcher(random, style)), ...company(AGINCOURT.english.men, (style) => englishManAtArms(random, style))],
  }),
  armies: { red: ['france1415'], blue: ['england'] },
  fighters: [],
};

const CERIGNOLA_LEVEL = {
  title: 'Cerignola',
  place: 'Cerignola, Apulia · 28 April 1503',
  blurb: { en: "Gonzalo de Córdoba's men stand behind a fresh ditch and its bank on a vineyard slope: a rank of German pikes along the bank, his arquebusiers three deep close behind them firing between the pikemen's files, the rest of the pikes and the sword-and-buckler men behind. At dusk the French gendarmes in plate on barded horses charge it, and the Swiss columns follow them in: the ditch stops the horse, the pikes hold the bank, and the volleys come rank after rank. Thirty-five of Spain against eight gendarmes, twenty-two Swiss and five crossbowmen.", zh: '贡萨洛·德·科尔多瓦的人马守在葡萄园坡上一道新挖的壕沟和土堤后面：堤上一排德意志长枪，火绳枪手三排紧贴其后，从枪兵的行列缝里开火；其余的长枪和圆盾剑士压在后头。黄昏时分，法兰西重骑披着板甲、骑着披甲马冲了上来，瑞士方阵跟着压上：壕沟挡住了马，长枪守住了堤，排枪一排接一排。西班牙三十五人，对八名法兰西重骑、二十二名瑞士枪兵、五名弩手。' },
  scene: 'cerignola',
  weather: { fog: [18, 110], sky: 0.35, pale: 0.3, sun: 0.7 },
  arena: { ...CERIGNOLA.arena, works: cerignolaWorks() },
  spread: 1,
  camera: { yaw: -0.5, pitch: 0.42, distance: 22, maxDistance: 30 },
  roster: { en: 'Eight gendarmes, twenty-two Swiss pikes and five crossbowmen · twelve arquebusiers, fifteen pikes and eight sword-and-buckler men', zh: '法兰西重骑八人、瑞士长枪二十二人、弩手五人 · 火绳枪手十二人、长枪十五人、圆盾剑士八人' },
  formation: {
    red: { front: CERIGNOLA.front.french, spacing: 0.95, rowSpacing: 1.0, perRow: 8, loose: 0.2, wings: HORSE_FIRST },
    blue: { front: CERIGNOLA.front.spanish, layout: cerignolaLayout(), drill: HOLD_AND_VOLLEY },
  },
  cast: (random) => ({
    red: [...company({ pike: CERIGNOLA.french.swiss }, (style) => pikeman(random, 'swiss', style)), ...company({ crossbow: CERIGNOLA.french.crossbow }, (style) => frenchFoot(random, style)), ...company({ lance: CERIGNOLA.french.gendarme }, (style) => frenchKnight(random, style, { mounted: true }))],
    // In the order of their places (cerignolaLayout): the pikes, the sword-and-buckler men, the arquebusiers.
    blue: [...company({ pike: CERIGNOLA.spanish.pike }, (style) => pikeman(random, 'landsknecht', style)), ...company({ rodelero: CERIGNOLA.spanish.rodelero }, (type) => europeanSoldier(random, type)), ...company({ arquebusier: CERIGNOLA.spanish.arquebusier }, (type) => europeanSoldier(random, type))],
  }),
  armies: { red: ['france1503'], blue: ['gonzalo'] },
  fighters: [],
};

// Their armies, for the setup screen (muster.js): each the kinds of men the level's own side is drawn from.
Object.assign(ARMIES, {
  england: {
    label: 'The English, 1415',
    ranks: {
      archer: { label: 'Archer', kinds: ['archer'], styles: ['longbow', 'shortSword'], make: (random, style) => englishArcher(random, style) },
      manAtArms: { label: 'Man-at-arms', kinds: ['knight'], styles: ['longsword', 'warhammer'], make: (random, style) => englishManAtArms(random, style) },
    },
  },
  france1415: {
    label: 'The French, 1415',
    ranks: {
      knight: { label: 'Man-at-arms', kinds: ['knight'], styles: ['longsword', 'warhammer'], make: (random, style) => frenchKnight(random, style) },
      horse: { label: 'Man-at-arms, mounted', kinds: ['knight'], mounted: true, styles: ['lance', 'longsword'], make: (random, style) => frenchKnight(random, style, { mounted: true }) },
      retinue: { label: 'Man-at-arms of a retinue', kinds: ['footman'], styles: ['longsword', 'spear', 'crossbow'], make: (random, style) => frenchFoot(random, style) },
    },
  },
  gonzalo: {
    label: "Gonzalo's army",
    ranks: {
      arquebusier: { label: 'Arquebusier', kinds: ['conquistadorQuilted'], styles: ['matchlock'], make: (random) => europeanSoldier(random, 'arquebusier') },
      pike: { label: 'Landsknecht', kinds: ['footman'], styles: ['pike'], make: (random, style) => pikeman(random, 'landsknecht', style) },
      rodelero: { label: 'Rodelero', kinds: ['conquistadorQuilted'], styles: ['espadaRodela'], make: (random) => europeanSoldier(random, 'rodelero') },
    },
  },
  france1503: {
    label: 'The French, 1503',
    ranks: {
      gendarme: { label: 'Gendarme', kinds: ['knight'], mounted: true, styles: ['lance', 'longsword'], make: (random, style) => frenchKnight(random, style, { mounted: true }) },
      swiss: { label: 'Swiss pike', kinds: ['footman'], styles: ['pike'], make: (random, style) => pikeman(random, 'swiss', style) },
      crossbow: { label: 'Gascon crossbowman', kinds: ['footman'], styles: ['crossbow', 'spear'], make: (random, style) => frenchFoot(random, style) },
    },
  },
});

export const SCENARIOS = {
  // A what-if, not a battle that was: a legion of the early Empire against
  // a Han army of crossbowmen, as Li Ling's five thousand (99 BC) stood
  // against the Xiongnu. Two drilled armies of thirty-five, in ranks
  // (formation.js): the legion walks up in its lines, the Han hold theirs
  // and shoot, the ranks relieving each other.
  legion: {
    title: 'Rome against Han',
    place: 'A what-if · the 1st century',
    blurb: { en: 'A legion of the early Empire meets a Han army of crossbowmen: twenty-nine legionaries in segmented iron with scutum and gladius, closed up under their shields in the testudo as they walk up into twenty-nine crossbows; the front ranks meet, the rest hold their places. Six auxiliary horse in mail ride on one flank and six Han horsemen on the other, and charge it when the lines close.', zh: '帝国初年的一个罗马军团，撞上一支汉军弩兵：二十九名军团兵身披环片甲，手持大盾短剑，把盾叠成龟甲阵，一步步顶着二十九张弩往前走；前排接战，其余原地不动。一侧是六名披锁甲的辅助骑兵，另一侧是六名汉骑，两军一接上，就从侧翼冲进去。' },
    scene: 'plain',
    arena: LEGION.arena,
    camera: { yaw: -0.5, pitch: 0.45, distance: 20, maxDistance: 26 },
    roster: { en: 'Thirty-five a side: twenty-nine legionaries and six auxiliary horse · twenty-nine Han crossbowmen and six horsemen', zh: '每方三十五人：军团兵二十九人、辅助骑兵六人 · 汉军弩手二十九人、骑兵六人' },
    formation: { red: { ...LEGION.ranks, front: LEGION.romanFront }, blue: { ...LEGION.ranks, front: LEGION.hanFront } },
    cast: (random) => legionSides(random),
    // Six horse of an auxiliary ala to the legion's side, six Han horsemen to theirs, in place of the rear rank of the foot.
    wings: {
      arena: LEGION.wingsArena,
      camera: { yaw: -0.5, pitch: 0.45, distance: 31, maxDistance: 40 },
      formation: { red: { wings: { side: 1 } }, blue: { wings: { side: -1 } } },
      cast: (random, sides) => ({
        red: [...sides.red.slice(0, LEGION.perSide - total(LEGION_HORSE.roman)), ...company(LEGION_HORSE.roman, (style) => romanHorseman(random, style))],
        blue: [...sides.blue.slice(0, LEGION.perSide - total(LEGION_HORSE.han)), ...company(LEGION_HORSE.han, (style) => hanHorseman(random, style))],
      }),
    },
    // The armies its sides may be set up from (ARMIES; muster.js).
    armies: { red: ['legion'], blue: ['han'] },
    fighters: [],
  },
  mobei: {
    title: 'Mobei',
    place: 'North of the Gobi · 119 BC',
    blurb: { en: "Wei Qing has crossed the desert to the chanyu's own ground. Twenty-three Han crossbowmen in iron lamellar stand at the edge of the plain, his horse — sabre, spear and bow — on both flanks; against them come thirty-five Xiongnu, every man a horse archer in felt and leather, riding in to shoot and wheeling away.", zh: '卫青穿过大漠，打到了单于的老巢。二十三名汉军弩手身披铁札甲，列在平原边上，刀、枪、弓骑分护两翼；对面来的是三十五名匈奴人，个个是穿毡裹皮的骑射手，冲上来放一轮箭，拨马就走。' },
    scene: 'mobei',
    arena: MOBEI.arena,
    spread: 1,
    camera: { yaw: -0.5, pitch: 0.42, distance: 40, maxDistance: 60 },
    roster: { en: 'Twenty-three Han crossbowmen and eleven horse · thirty-five Xiongnu horsemen', zh: '汉军弩手二十三人、骑兵十一人 · 匈奴骑兵三十五人' },
    // The crossbowmen ten to a rank at the floor's end, the horse on both flanks; the Xiongnu a loose mass of riders.
    formation: {
      red: { front: MOBEI.hanFront, facing: 'ahead', spacing: LEGION.ranks.spacing, rowSpacing: LEGION.ranks.rowSpacing, perRow: LEGION.ranks.perRow, wings: { back: 0 } },
      blue: { front: MOBEI.xiongnuFront, spacing: RIDERS_LOOSE.spacing, rowSpacing: RIDERS_LOOSE.rowSpacing, perRow: 9, loose: RIDERS_LOOSE.loose },
    },
    cast: (random) => {
      const crossbowmen = Array.from({ length: MOBEI.crossbow }, (_, index) => drilledSoldier(PRESETS.hanCrossbow, random, index === Math.floor(LEGION.ranks.perRow / 2) ? { name: 'Wei Qing' } : {}));
      const xiongnu = company(MOBEI.xiongnu, (style) => xiongnuRider(random, style));
      xiongnu[0] = { ...xiongnu[0], name: 'Yizhixie' };
      return { red: [...crossbowmen, ...company(MOBEI.horse, (style) => hanHorseman(random, style))], blue: xiongnu };
    },
    armies: { red: ['han'], blue: ['xiongnu'] },
    fighters: [],
  },
  carrhae: {
    title: 'Carrhae',
    place: 'The plain by Harran, Mesopotamia · June 53 BC',
    blurb: { en: "Crassus's legion stands in a square under a sky of arrows. Forty legionaries of the Republic in mail and bronze, shields locked, and five of Publius Crassus's Gallic horse; round them ride twenty-one Parthian horse archers, who never close and never run short — the camel train behind them brings fresh arrows — and three cataphracts, man and horse in iron scale, held back for anyone who breaks out.", zh: '克拉苏的军团结成方阵，头顶是遮天的箭雨。四十名共和国军团兵，锁甲青铜，盾牌相扣，外加小克拉苏麾下五名高卢骑兵；绕着他们打转的是二十一名帕提亚骑射手，从不近身，箭也从不见底——后头的骆驼队一驮一驮地往上送——还有三名人马俱披铁鳞甲的具装骑兵，专等谁沉不住气冲出阵来。' },
    scene: 'carrhae',
    arena: CARRHAE.arena,
    spread: 1,
    camera: { yaw: -0.5, pitch: 0.42, distance: 40, maxDistance: 60 },
    roster: { en: 'Forty legionaries and five Gallic horse · twenty-one horse archers and three cataphracts', zh: '军团兵四十人、高卢骑兵五人 · 骑射手二十一人、具装骑兵三人' },
    formation: {
      // The square stands (`drill`: over the legion's own, which walks up to the enemy), its outer ring facing out every way, shields a wall, the inner ring's a roof (formation.js).
      red: { front: CARRHAE.romanFront, facing: 'ahead', layout: hollowSquare(CARRHAE.square), spacing: CARRHAE.square.spacing, perRow: CARRHAE.square.sides[0], loose: 0.05, drill: CARRHAE.drill, wings: CARRHAE.wings.red },
      blue: { front: CARRHAE.parthianFront, spacing: RIDERS_LOOSE.spacing, rowSpacing: RIDERS_LOOSE.rowSpacing, perRow: 8, loose: RIDERS_LOOSE.loose, train: CARRHAE.train, wings: CARRHAE.wings.blue },
    },
    cast: (random) => {
      const parthians = [...company(CARRHAE.parthians.archer, (style) => parthianRider(random, style, 'archer')), ...company(CARRHAE.parthians.cataphract, (style) => parthianRider(random, style, 'cataphract'))];
      parthians[CARRHAE.parthians.archer.steppeBow] = { ...parthians[CARRHAE.parthians.archer.steppeBow], name: 'Surena' };
      const legion = Array.from({ length: CARRHAE.legionaries }, (_, index) => republicanLegionary(random, index === 0 ? { name: 'Marcus Licinius Crassus' } : {}));
      const gauls = company(CARRHAE.gauls, (style) => gallicHorseman(random, style));
      gauls[0] = { ...gauls[0], name: 'Publius Licinius Crassus' };
      return { red: [...legion, ...gauls], blue: parthians };
    },
    armies: { red: ['crassus'], blue: ['parthians'] },
    fighters: [],
  },
  catalaunian: {
    title: 'The Catalaunian Plains',
    place: 'Champagne, Gaul · 20 June 451',
    blurb: { en: "Aetius's Romans and Theoderic's Visigoths stand against Attila. Twelve Roman foot in mail with oval shields and spears, and six Roman archers on their flank, hold the line beside eleven Visigoths, six Visigoth horse on the flank; eleven Huns ride round them shooting — horse archers and a few of Attila's nobles — and twenty-four Ostrogoths and Gepids, Attila's subject peoples, come on behind them on foot.", zh: '埃提乌斯的罗马人和狄奥多里克的西哥特人，一同迎战阿提拉。十二名罗马步兵，锁甲、椭圆盾、长矛，侧翼六名罗马弓手，和十一名西哥特人并肩守住阵线，另有六名西哥特骑兵护翼；十一名匈人绕阵放箭——骑射手，外加几名阿提拉的贵族——身后，二十四名东哥特人和格皮德人，阿提拉治下的附庸，徒步压了上来。' },
    scene: 'catalaunian',
    arena: CATALAUNIAN.arena,
    spread: 1,
    camera: { yaw: -0.5, pitch: 0.42, distance: 40, maxDistance: 60 },
    roster: { en: 'Eighteen Romans (six of them archers), eleven Visigoths and six Visigoth horse · eleven Huns on horse, twenty-four Ostrogoths and Gepids', zh: '罗马人十八名（其中弓手六名）、西哥特人十一名、西哥特骑兵六名 · 匈人骑兵十一名、东哥特与格皮德人二十四名' },
    // The Romans and the Visigoths side by side, three deep, the Visigoth horse on the Goths' flank; the Huns in a loose mass of riders, their Germans behind.
    formation: {
      red: {
        front: CATALAUNIAN.front,
        facing: 'ahead',
        layout: [...block(total(CATALAUNIAN.romans), { across: -4, perRow: 6, spacing: 1, rowSpacing: 1.2 }), ...block(total(CATALAUNIAN.archers), { across: -10.5, perRow: 6, spacing: 1, rowSpacing: 1.2 }), ...block(total(CATALAUNIAN.visigoths), { across: 4, perRow: 6, spacing: 1, rowSpacing: 1.2 })],
        spacing: 1, perRow: 14, loose: 0.1, wings: { side: 1, back: 0 },
      },
      blue: {
        front: CATALAUNIAN.front,
        layout: [...block(total(CATALAUNIAN.huns.rider) + total(CATALAUNIAN.huns.noble), { perRow: 9, spacing: RIDERS_LOOSE.spacing, rowSpacing: RIDERS_LOOSE.rowSpacing }), ...block(total(CATALAUNIAN.germans), { back: 25, perRow: 7, spacing: 1.2, rowSpacing: 1.5 })],
        loose: 0.5,
      },
    },
    cast: (random) => {
      const romans = company(CATALAUNIAN.romans, (style) => lateRomanSoldier(random, style));
      romans[0] = { ...romans[0], name: 'Flavius Aetius' };
      const horse = company(CATALAUNIAN.visigothHorse, (style) => gothWarrior(random, style, 'noble', { mounted: true }));
      horse[0] = { ...horse[0], name: 'Theoderic' };
      horse[1] = { ...horse[1], name: 'Thorismund' };
      const nobles = company(CATALAUNIAN.huns.noble, (style) => hunRider(random, style, 'noble'));
      nobles[0] = { ...nobles[0], name: 'Attila' };
      return {
        red: [...romans, ...company(CATALAUNIAN.archers, (style) => lateRomanSoldier(random, style)), ...company(CATALAUNIAN.visigoths, (style) => gothWarrior(random, style)), ...horse],
        blue: [...nobles, ...company(CATALAUNIAN.huns.rider, (style) => hunRider(random, style)), ...company(CATALAUNIAN.germans, (style) => gothWarrior(random, style))],
      };
    },
    armies: { red: ['lateRome', 'visigoths'], blue: ['huns', 'germans'] },
    fighters: [],
  },
  rebellion: {
    title: 'Peasant Rebellion',
    place: 'The market square, Maidstone, Kent · June 1381',
    blurb: { en: 'The town has risen. Two lords in plate ride in on their destriers, with three of their foot soldiers behind them, to put it down — and meet twenty peasants with spears in the market square.', zh: '镇子反了。两位身披板甲的老爷骑着战马进城来镇压，身后跟着三个家兵——在集市广场上，迎面是二十个攥着长矛的农民。' },
    scene: 'town',
    weather: { fog: WEATHER_MIST.rebellion, sky: 0.55, pale: 0.55, sun: 0.9 },
    arena: { halfX: 9, halfZ: 7 },
    // Never further out than the house fronts.
    camera: { yaw: -0.55, pitch: 0.42, distance: 10, maxDistance: 10.5 },
    roster: { en: 'Two mounted knights and three foot soldiers · twenty rebels with spears', zh: '骑士两名（骑马）、步卒三名 · 持矛乱民二十名' },
    // Drawn apart a quarter (not SPREAD's half): the square holds no more between its house fronts, the lords' horses behind their foot.
    spread: 1.25,
    // Knights in a tight line, shoulder to shoulder; the rebels a loose crowd, well across the square.
    formation: { red: { front: 4.5, spacing: 0.85 }, blue: { front: 5, spacing: 1.5, rowSpacing: 1.6, loose: 0.55 } },
    // The whole cast, made fresh for each visit (the rebels differ every time).
    cast: (random) => ({
      red: [nobleKnight(random, 'longsword'), footSoldier(random, 'spear'), nobleKnight(random, 'warhammer'), footSoldier(random, 'bow'), footSoldier(random, 'longsword')],
      blue: Array.from({ length: 20 }, () => rebel(random)),
    }),
    // The lords ride in on their destriers, the foot behind them (the square is only so wide between the house fronts).
    wings: {
      arena: { halfX: 11, halfZ: 8.5 },
      formation: { red: { front: 7.5, spacing: 1.2, wings: { out: 2, back: 1, spacing: 3, release: 14, by: 6 } } },
      cast: (random, sides) => ({ red: sides.red.map((inputs) => (inputs.outfit.kind === 'knight' ? { ...inputs, mounted: true } : inputs)), blue: sides.blue }),
    },
    // The armies its sides may be set up from (ARMIES; muster.js).
    armies: { red: ['lords'], blue: ['commons'] },
    fighters: [],
  },
  agincourt: AGINCOURT_LEVEL,
  cerignola: CERIGNOLA_LEVEL,
  sekigahara: {
    title: 'Sekigahara',
    place: 'Sekigahara, Mino · 21 October 1600',
    blurb: { en: 'The battle that ends the Sengoku. Thirty-four of the East in red against thirty-five of the West in black and blue, in the morning fog: bows and teppō in front, spears, blades and polearms behind, and six mounted samurai on a flank of each army to charge when the lines close.', zh: '终结战国的一战。东军三十四人着红，西军三十五人着黑蓝，在晨雾里对阵：弓和铁炮在前，长枪、刀和长柄兵器在后，两军侧翼各有六名骑马武士，等阵线一接，就冲进去。' },
    scene: 'sengoku',
    weather: { fog: WEATHER_MIST.sekigahara, sky: 0.65, pale: 0.6, mistLine: [-1, 6], sun: 0.85 },
    arena: { halfX: 17, halfZ: 11 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 17, maxDistance: 22 },
    roster: { en: 'Thirty-four of the East and thirty-five of the West: samurai and ashigaru, six of the samurai on horse a side', zh: '东军三十四人、西军三十五人：武士与足轻，每方六名武士骑马' },
    // Ten abreast: the bows and teppō in the front rows, the blades and polearms behind them.
    formation: { red: { front: 6, spacing: 1.3, rowSpacing: 1.6, shootersFront: SHOOTERS_FRONT_GAP, perRow: 10, loose: 0.3 }, blue: { front: 6, spacing: 1.3, rowSpacing: 1.6, shootersFront: SHOOTERS_FRONT_GAP, perRow: 10, loose: 0.3 } },
    cast: (random) => ({ red: sekigaharaSide(random, 'east', SEKIGAHARA_EAST), blue: sekigaharaSide(random, 'west', SEKIGAHARA_WEST) }),
    // Each army's mounted samurai on its flanks: six a side, in the armies' colours.
    wings: {
      arena: { halfX: 30, halfZ: 16 },
      camera: { yaw: -0.5, pitch: 0.42, distance: 28, maxDistance: 36 },
      formation: { red: { wings: { side: 1 } }, blue: { wings: { side: -1 } } },
      cast: (random, sides) => ({
        red: [...sides.red, ...company(SEKIGAHARA_HORSE, (style) => samuraiHorseman(random, SEKIGAHARA_EAST, style))],
        blue: [...sides.blue, ...company(SEKIGAHARA_HORSE, (style) => samuraiHorseman(random, SEKIGAHARA_WEST, style))],
      }),
    },
    // The armies its sides may be set up from (ARMIES; muster.js).
    armies: { red: ['east'], blue: ['west'] },
    fighters: [],
  },
  pyongyang: {
    title: 'Pyongyang',
    place: 'Pyongyang, Joseon · 8 February 1593',
    blurb: { en: 'The Ming army retakes the city from the Japanese. Fifteen Ming regulars — elites in plated brigandine with guandao and guns, brigandine men with sword and shield, spear and gun — and eleven of Li Rusong\'s horsemen in iron lamellar on the flank, against forty-four Japanese samurai and ashigaru.', zh: '明军从日军手里夺回平壤。十五名明军——精锐披钉甲，使大刀、放火铳；布面甲兵持刀牌、长枪和鸟铳——侧翼是李如松的十一名铁札甲骑兵，对阵四十四名日本武士和足轻。' },
    scene: 'sengoku',
    arena: { halfX: 14, halfZ: 9 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 15, maxDistance: 19 },
    roster: { en: 'Twenty-six Ming (eleven on horse) · forty-four Japanese', zh: '明军二十六人（十一骑） · 日军四十四人' },
    formation: { red: { front: 5, spacing: 1.3, rowSpacing: 1.6, shootersFront: SHOOTERS_FRONT_GAP, perRow: 8, loose: 0.3 }, blue: { front: 5, spacing: 1.3, rowSpacing: 1.6, shootersFront: SHOOTERS_FRONT_GAP, perRow: 8, loose: 0.3 } },
    cast: (random) => pyongyangSides(random),
    wings: {
      arena: { halfX: 28, halfZ: 15 },
      camera: { yaw: -0.5, pitch: 0.42, distance: 26, maxDistance: 33 },
      formation: { red: { wings: { side: 1 } } },
      cast: (random, sides) => ({ red: [...sides.red, ...company(PYONGYANG_HORSE, (style) => mingHorseman(random, style))], blue: sides.blue }),
    },
    // The armies its sides may be set up from (ARMIES; muster.js).
    armies: { red: ['ming'], blue: ['west'] },
    fighters: [],
  },
  sarhu: {
    title: 'Sarhu',
    place: 'Sarhu and Jiefan, by the Hun River, Liaodong · 14 April 1619',
    blurb: { en: "Du Song's column has crossed the Hun River ahead of the other three, and Nurhaci has brought his eight banners against it alone. Thirty of the Ming — a few of Du Song's household elite, regulars in brigandine and garrison men, a handful of gunners in front — meet twenty-eight banner men in studded coats of plates, spears, sabres and guandao before the archers with the heavy Manchu bow, and three Bayara of the guard riding on the flank with the heavy spear. The Ming had more guns; the fight went on into the dusk and the mist, and wet powder and the columns' distance from each other did the rest.", zh: '杜松这一路抢在另外三路前头渡过了浑河，努尔哈赤便把八旗兵全压到他一路上。明军三十人——杜松的几名家丁精锐、布面甲兵、卫所兵，前头一小撮火铳手——迎面是二十八名八旗兵，身披钉甲，长枪、腰刀、大刀在前，后面是拉重弓的弓手，侧翼还有三名巴牙喇护军，提着重枪骑马包抄。明军的火器更多；可仗一直打到黄昏起雾，火药受了潮，四路兵又隔得老远——剩下的，不用多说。' },
    scene: 'sarhu',
    weather: { fog: WEATHER_MIST.sarhu, sky: 0.6, pale: 0.6, sun: 0.7 },
    arena: { halfX: 14, halfZ: 9 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 15, maxDistance: 19 },
    roster: { en: 'Thirty Ming: three elite, seventeen in brigandine, ten garrison men · thirty-one of the Eight Banners, three of them Bayara on horse', zh: '明军三十人：精锐三人、布面甲兵十七人、卫所兵十人 · 八旗兵三十一人，其中巴牙喇三骑' },
    formation: { red: { front: 5, spacing: 1.3, rowSpacing: 1.6, shootersFront: SHOOTERS_FRONT_GAP, perRow: 8, loose: 0.3 }, blue: { front: 5, spacing: 1.2, rowSpacing: 1.5, perRow: 8, loose: 0.2 } },
    cast: (random) => sarhuSides(random),
    wings: {
      arena: { halfX: 28, halfZ: 15 },
      camera: { yaw: -0.5, pitch: 0.42, distance: 26, maxDistance: 33 },
      formation: { blue: { wings: { side: -1 } } },
      cast: (random, sides) => {
        const bayara = company(SARHU.bayara, (style) => bannerman(random, style, 'bayara', { mounted: true }));
        bayara[0] = { ...bayara[0], name: 'Yangguri' };
        return { red: sides.red, blue: [...sides.blue, ...bayara] };
      },
    },
    // The armies its sides may be set up from (ARMIES; muster.js).
    armies: { red: ['ming'], blue: ['banners'] },
    fighters: [],
  },
  cajamarca: {
    title: 'Cajamarca',
    place: 'The square of Cajamarca, Peru · 16 November 1532',
    blurb: { en: "Late in the afternoon Atahualpa is carried into the walled square among his lords and attendants, unarmed by his own order, in their finest woven tunics. Pizarro's men wait out of sight in the doorways of the long halls round it: steel, horses and guns these people have never seen. At the signal Candia's gun fires and horse and foot burst out from every side.", zh: '日头偏西，阿塔瓦尔帕坐着肩舆，被抬进四面围墙的广场，身边簇拥着贵族和侍从，个个穿着最好的织袍——按他自己的命令，谁都没带兵器。皮萨罗的人藏在四周长厅的门洞里，看不见：钢铁、马、火枪，这些人一样都没见过。信号一到，坎迪亚的炮一响，骑兵步兵从四面八方一齐杀出。' },
    scene: 'cajamarca',
    arena: { halfX: 16, halfZ: 11 },
    camera: { yaw: -0.5, pitch: 0.48, distance: 19, maxDistance: 25 },
    roster: { en: 'Fourteen Spaniards, five of them on horse · Atahualpa and fifty-one of his retinue', zh: '西班牙人十四名，五名骑马 · 阿塔瓦尔帕及扈从五十一人' },
    // Each man where the ambush put him (`layout`, from no front); the Spaniards hidden till the signal (`ambush`: ai.js springAmbush).
    formation: {
      red: { front: 0, layout: cajamarcaLayout('red', CAJAMARCA.spanish.map(([, , spot]) => spot)), loose: 0.1, ambush: { signal: CAJAMARCA.signal } },
      blue: { front: 0, layout: cajamarcaLayout('blue', crowdSpots(CAJAMARCA_INCA, CAJAMARCA.crowd)), loose: CAJAMARCA.crowd.loose },
    },
    cast: (random) => ({ red: cajamarcaSpaniards(random), blue: cajamarcaInca(random) }),
    // The armies its sides may be set up from (ARMIES; muster.js).
    armies: { red: ['spanish'], blue: ['inca'] },
    fighters: [],
  },
  zeelandia: {
    title: 'Fort Zeelandia',
    place: 'Baxemboy, Formosa · 1661',
    blurb: { en: "Koxinga lands to take Fort Zeelandia. The VOC's musketeers and pikemen march out to meet his army on the sand: masked iron men in scale, regulars in the brigandine vest and in iron lamellar, garrison troops and a few Japanese.", zh: '郑成功登陆，要拿下热兰遮城。荷兰东印度公司的火枪手和长枪兵开出城来，在沙滩上迎战：对面是戴铁面、披鳞甲的铁人，穿布面甲背心和铁札甲的正兵，营兵，还有几个日本人。' },
    scene: 'coastFort',
    arena: { halfX: 15, halfZ: 10 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 16, maxDistance: 20 },
    roster: { en: 'Eighteen Dutch · thirty-two of Koxinga\'s army', zh: '荷兰人十八名 · 郑成功部三十二人' },
    formation: { red: { front: 5, spacing: 1.2, rowSpacing: 1.5, shootersFront: SHOOTERS_FRONT_GAP, perRow: 9, loose: 0.15 }, blue: { front: 5, spacing: 1.2, rowSpacing: 1.6, shootersFront: SHOOTERS_FRONT_GAP, perRow: 10, loose: 0.35 } },
    cast: (random) => {
      const army = ZEELANDIA.koxinga;
      // The iron men, every one masked, in scale (the elite's masked scale design).
      const ironMen = company(army.elite, (style) => mingSoldier(random, style, 'elite', { people: 'mingSouth', design: 4 }));
      const regulars = company(army.brigandine, (style) => mingSoldier(random, style, 'brigandine', { people: 'mingSouth' }));
      const lamellar = company(army.lamellar, (style) => mingSoldier(random, style, 'brigandine', { people: 'mingSouth', design: 3 + Math.floor(random() * 2) }));
      const garrison = company(army.garrison, (style) => mingSoldier(random, style, 'garrison', { people: 'mingSouth' }));
      return {
        red: shootersBehind(company(ZEELANDIA.dutch, (type) => europeanSoldier(random, type))),
        blue: shootersBehind([...ironMen, ...regulars, ...lamellar, ...garrison, ...company(army.ronin, (style) => roninWarrior(random, style))]),
      };
    },
    // The armies its sides may be set up from (ARMIES; muster.js).
    armies: { red: ['dutch'], blue: ['koxinga'] },
    fighters: [],
  },
  rhodes: {
    title: 'Siege of Rhodes',
    place: 'Bastion of Aragon, Rhodes · 24 September 1522',
    blurb: { en: "Süleyman's general assault on the breaches. The Knights of St John in plate, with their sergeants and gunners, meet the Janissaries with yatagan and gun, the azaps' spears and bows, and heavy men in mail-and-plate.", zh: '苏莱曼对城墙缺口发起总攻。圣约翰骑士团的骑士身披板甲，带着军士和炮手，迎战手持弯刀和火枪的耶尼切里、阿扎普的长矛和弓，还有披锁子板甲的重甲兵。' },
    scene: 'coastFort',
    arena: { halfX: 15, halfZ: 10 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 16, maxDistance: 20 },
    roster: { en: 'Fifteen of the Order · a wave of seventeen Ottomans', zh: '骑士团十五人 · 奥斯曼军一波十七人' },
    formation: { red: { front: 5, spacing: 1.2, rowSpacing: 1.5, shootersFront: SHOOTERS_FRONT_GAP, perRow: 8, loose: 0.15 }, blue: { front: 5, spacing: 1.2, rowSpacing: 1.6, shootersFront: SHOOTERS_FRONT_GAP, perRow: 10, loose: 0.4 } },
    cast: (random) => ({
      red: shootersBehind([...company(RHODES.hospitallers.knight, (style) => hospitaller(random, style, 'knight')), ...company(RHODES.hospitallers.sergeant, (style) => hospitaller(random, style, 'sergeant'))]),
      blue: shootersBehind([...company(RHODES.ottomans.heavy, (style) => ottomanSoldier(random, style, 'heavy')), ...company(RHODES.ottomans.janissary, (style) => ottomanSoldier(random, style, 'janissary')), ...company(RHODES.ottomans.azap, (style) => ottomanSoldier(random, style, 'azap'))]),
    }),
    // The armies its sides may be set up from (ARMIES; muster.js).
    armies: { red: ['hospitallers'], blue: ['ottomans'] },
    fighters: [],
  },
  wokou: {
    title: 'Wokou raid',
    place: 'A water town, Zhejiang · 1554',
    blurb: { en: 'Sea raiders come up the canals in the morning mist, a Japanese band: rōnin at their head and samurai in their armour, the rest barefoot, some in pieces of armour, a few Chinese pirates hanging back behind them: long swords and great two-handed swords, yari, dao and spears, and hardly a gun among them. In the market square by the bridge they meet the town\'s garrison, more of them than the raiders: old men, thin boys and the underfed in hemp vests, spears and dao and a few bows, no guns, and a pair of brigandine regulars among them.', zh: '晨雾里，一伙海寇顺着河道摸了上来，是一帮日本人：打头的是浪人，后面跟着披甲的武士，其余的光着脚，有的身上挂着几片甲，几个中国海盗缩在最后：长刀、野太刀、长枪、腰刀，几乎看不见一杆火器。在桥边的集市广场上，他们撞上了镇上的守军，人数比倭寇多：老头、瘦小子、吃不饱的穷汉，穿着麻布坎肩，拿着长枪腰刀，几张弓，没有火器，当中夹着两个穿布面甲的正兵。' },
    scene: 'jiangnan',
    weather: { fog: WEATHER_MIST.wokou, sky: 0.75, pale: 0.7, mistLine: [-1, 7], sun: 0.85 },
    arena: { halfX: 14, halfZ: 9 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 15, maxDistance: 19 },
    roster: { en: 'Twenty-six raiders · thirty-four garrison', zh: '倭寇二十六人 · 守军三十四人' },
    formation: { red: WOKOU_RAIDERS_ORDER, blue: WOKOU_GARRISON_ORDER },
    cast: (random) => ({
      red: wokouRaiders(random, WOKOU.raid),
      blue: shootersBehind([...company(WOKOU.garrison.brigandine, (style) => mingSoldier(random, style, 'brigandine', { people: 'mingCoast', design: WOKOU.design.brigandine })), ...company(WOKOU.garrison.garrison, (style) => mingSoldier(random, style, 'garrison', { people: 'mingCoast', design: WOKOU.design.garrison }))]),
    }),
    // The armies its sides may be set up from (ARMIES; muster.js).
    armies: { red: ['raiders'], blue: ['coast'] },
    fighters: [],
  },
  qiJiguang: qiJiguangLevel(),
  port: {
    title: 'Pier 9',
    place: 'Container port, Yokohama · 2:15 a.m.',
    blurb: { en: 'A raid on a handover between the containers. Four SWAT officers — two pistols, two batons — against six yakuza: four knives, a katana, and one gun.', zh: '集装箱之间一场交易，被堵了个正着。四名特警——两把手枪、两根警棍——对六个极道：四把刀、一把武士刀、一支枪。' },
    scene: 'port',
    arena: { halfX: 10, halfZ: 6 },
    camera: { yaw: -0.6, pitch: 0.36, distance: 9, maxDistance: 11 },
    weather: WEATHER_SEA_FOG,
    roster: { en: 'Four SWAT officers · six yakuza', zh: '特警四名 · 极道六人' },
    formation: { red: { front: 4.5, spacing: 1.4 }, blue: { front: 4.5, spacing: 1.3, loose: 0.4 } },
    cast: (random) => ({
      red: [swatOfficer(random, 'handgun'), swatOfficer(random, 'baton'), swatOfficer(random, 'baton'), swatOfficer(random, 'handgun')],
      blue: [yakuza(random, 'knife'), yakuza(random, 'katana'), yakuza(random, 'knife'), yakuza(random, 'handgun'), yakuza(random, 'knife'), yakuza(random, 'knife')],
    }),
    // The armies its sides may be set up from (ARMIES; muster.js).
    armies: { red: ['swat', 'infantry'], blue: ['yakuza'] },
    fighters: [],
  },
  pride: {
    title: 'Frye vs. Takayama',
    place: 'Saitama Super Arena, Japan · 23 June 2002',
    blurb: { en: 'Two big men, one hand each on the back of the other\'s neck, trading punches face to face until one of them drops.', zh: '两个大块头，各用一只手扣住对方后颈，脸贴着脸对轰，直到有一个先倒下。' },
    scene: 'stadium',
    arena: { halfX: 3, halfZ: 3 },
    // Stood up again after a knockdown, as the referee would: it ends standing.
    rules: { noPins: true },
    camera: { yaw: -0.35, pitch: 0.14, distance: 4.6 },
    // Bodies given by fat, not weight: the training sets the muscle, and the weight follows.
    fighters: [
      {
        name: 'Don Frye', style: 'clinchBrawl', sex: 'male', heightCm: 185, bodyFat: 0.12, frame: 'large', age: 36, exercise: 0.82,
        outfit: { kind: 'mma', design: 0, colors: { bottom: '#16161a' } }, accessories: [],
        look: { skinTone: 'lightTan', hairStyle: 'buzz', hairColor: '#3a2a1c', facialHair: 'handlebar', eyeColor: 'brown', faceShape: 'seinen' },
      },
      {
        name: 'Yoshihiro Takayama', style: 'clinchBrawl', sex: 'male', heightCm: 196, bodyFat: 0.14, frame: 'large', age: 35, exercise: 0.65,
        outfit: { kind: 'mma', design: 0, colors: { bottom: '#1f2a52' } }, accessories: [],
        look: { skinTone: 'lightTan', hairStyle: 'long', hairColor: '#c9a25e', facialHair: 'none', eyeColor: 'brown', faceShape: 'seinen' },
      },
    ],
  },
  subway: {
    title: 'Last Train',
    place: 'New York subway platform, 1:40 a.m.',
    blurb: { en: 'A shoulder barged on the stairs. No ring, no gloves, no referee — a strip of platform between the pillars and the yellow edge.', zh: '楼梯上撞了一下肩膀。没有擂台，没有拳套，没有裁判——只有柱子和黄线之间的一窄条站台。' },
    scene: 'subway',
    // The platform between the stair wall and the edge strip; past the strip, the edge drops to the tracks.
    arena: SUBWAY_ARENA,
    camera: { yaw: -0.25, pitch: 0.14, distance: 5.4 },
    fighters: [
      {
        name: 'Simon', style: 'street', sex: 'male', heightCm: 183, weightKg: 72, frame: 'medium', age: 27, exercise: 0.35,
        outfit: { kind: 'casual', design: 1, colors: { top: '#24324a', bottom: '#2b3550' } }, accessories: ['headset'],
        look: { skinTone: 'lightTan', hairStyle: 'midLong', hairColor: '#120d0a', facialHair: 'none', eyeColor: 'brown' },
      },
      {
        name: 'Dre', style: 'street', sex: 'male', heightCm: 180, weightKg: 75, frame: 'medium', age: 25, exercise: 0.4,
        outfit: { kind: 'casual', design: 2, colors: { top: '#7a2230', bottom: '#26262b' } }, accessories: [],
        look: { skinTone: 'deep', hairStyle: 'dreads', hairColor: '#1a120c', facialHair: 'stubble', eyeColor: 'brown' },
      },
    ],
    // Each side's friends, for a team fight: changes to that side's lead.
    crews: {
      red: [
        { name: 'Tomo', heightCm: 176, weightKg: 68, age: 24, outfit: { kind: 'casual', design: 2, colors: { top: '#1c1c20', bottom: '#2b3550' } }, accessories: [], look: { hairStyle: 'spiky', skinTone: 'lightTan' } },
        { name: 'Jae', heightCm: 185, weightKg: 84, age: 29, exercise: 0.5, outfit: { kind: 'casual', design: 1, colors: { top: '#e4e4e6', bottom: '#26262b' } }, accessories: [], look: { hairStyle: 'fade', skinTone: 'light' } },
      ],
      blue: [
        { name: 'Marco', heightCm: 174, weightKg: 79, age: 30, outfit: { kind: 'casual', design: 1, colors: { top: '#4a5233', bottom: '#2b3550' } }, look: { hairStyle: 'buzz', skinTone: 'tan', facialHair: 'beard' } },
        { name: 'Kofi', heightCm: 188, weightKg: 82, age: 23, exercise: 0.45, outfit: { kind: 'casual', design: 2, colors: { top: '#6b6e74', bottom: '#1c1c20' } }, look: { hairStyle: 'cornrows', skinTone: 'deep' } },
      ],
    },
  },
};

/** Fighter inputs for a scenario: each body fed to its stated weight. */
export function scenarioFighters(scenario) {
  return scenario.fighters.map((entry, index) => {
    const { weightKg, bodyFat, ...rest } = entry;
    const inputs = normaliseInputs(rest);
    const lean = (FRAMES[inputs.frame] ?? FRAMES.medium).lean;
    inputs.calories = Math.round(bodyFat ? caloriesForBodyFat(inputs, bodyFat, lean) : caloriesForWeight(inputs, weightKg, lean));
    return { inputs, corner: index === 0 ? 'red' : 'blue' };
  });
}

/** A crew member: the side's lead, changed as the crew entry says, fed to its weight. */
export function crewFighter(lead, entry) {
  const { weightKg, ...changes } = entry;
  const inputs = normaliseInputs({ ...lead, ...changes, outfit: { ...lead.outfit, ...changes.outfit }, look: { ...lead.look, ...changes.look } });
  inputs.calories = Math.round(caloriesForWeight(inputs, weightKg, (FRAMES[inputs.frame] ?? FRAMES.medium).lean));
  return inputs;
}

/** A world for a scenario: its fighters on its floor. */
export function scenarioWorld(key, seed = 1) {
  const scenario = battleOf(key);
  // A battle's armies are drawn from its cast, at the same seed.
  const fighters = scenario.cast ? Object.entries(scenario.cast(seededRandom(seed))).flatMap(([corner, side]) => side.map((inputs) => ({ inputs, corner }))) : scenarioFighters(scenario);
  return createWorld(fighters, { seed, arena: scenario.arena, rules: scenario.rules, formation: scenario.formation, place: scenario.scene });
}
