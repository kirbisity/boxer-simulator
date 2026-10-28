// Scenarios: set fights in set places. Each is data for the same world, the
// same bodies, physics and AI as the sandbox — only the place, the people
// and what they wear differ.

import { FRAMES, normaliseInputs, PRESETS } from './body.js';
import { caloriesForBodyFat, caloriesForWeight } from './physiology.js';
import { createWorld, seededRandom } from './physics.js';
import { STYLES } from './moves.js';
import { SUBWAY_ARENA } from './props/subway.js';
import { conquistadorHorseman, drilledSoldier, europeanSoldier, footSoldier, hanHorseman, hospitaller, mexicaWarrior, mingHorseman, mingSoldier, mountedKnight, nobleKnight, ottomanSoldier, rebel, romanHorseman, roninWarrior, samuraiHorseman, sengokuWarrior, swatOfficer, wokouRaider, yakuza } from './cast.js';
import { gallicHorseman, gothWarrior, hunRider, lateRomanSoldier, parthianRider, republicanLegionary, xiongnuRider } from './cast.js';

// Rome against Han: fifty a side, ten to a rank; a centurion to every
// eighty legionaries (a century), Li Ling among his crossbowmen.
export const LEGION = { perSide: 50, arena: { halfX: 26, halfZ: 12 }, wingsArena: { halfX: 42, halfZ: 17 }, ranks: { spacing: 0.95, rowSpacing: 1.2, perRow: 10 }, romanFront: 14, hanFront: 3, century: 80 };

// The horse of Rome against Han: an ala of auxiliaries (spatha and spear) for the legion, and for
// the Han a troop of frontier cavalry: sabre and spear, and two horse archers (Li Ling's men met the
// Xiongnu's). They take the place of a rear rank of foot, so a side stays fifty.
const LEGION_HORSE = { roman: { longsword: 4, spear: 4 }, han: { dao: 3, spear: 3, steppeBow: 2 } };
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
 */
export const WEATHER_MIST = { wokou: [5, 75], rebellion: [6, 75], sekigahara: [12, 120], port: [8, 45] };

/**
 * Pier 9's sea fog at 2 a.m.: a light fog off the water, dim warm grey where
 * the sodium lamps light it, from 8 m gone by 45 (the cranes and the far
 * stacks fade into it); the lamps glow in it.
 */
const WEATHER_SEA_FOG = { fog: WEATHER_MIST.port, colour: 0x3c362e, sky: 0.85, halos: true };

/**
 * A scenario: where (an arena's floor half-sizes and the scene drawn round
 * it), and who, as ordinary fighter inputs plus what they wear. A body is
 * given by its weight: the calories that settle at it are worked out when
 * the bout is built, as the builder's slider would.
 */

// One side at Sekigahara, thirty strong: a samurai leads; the ashigaru are
// mostly yari, with bows and teppō. Blades and polearms first (the front
// ranks), the bows and guns last.
const SEKIGAHARA_SIDE = {
  samurai: { katana: 3, naginata: 2, spear: 2, bow: 2 },
  ashigaru: { spear: 9, bow: 4, matchlock: 3, katana: 4, naginata: 1 },
};

// Each army's colours: the East (Tokugawa) in red, the West (Ishida's, Toyotomi's) in black and blue.
const SEKIGAHARA_EAST = { tint: { armor: '#9a1f18', lace: '#1a1a1d' }, banner: '#b3161b' };
const SEKIGAHARA_WEST = { tint: { armor: '#1c2030', lace: '#2a4a9a' }, banner: '#1f3f8a' };
// A side's mounted samurai: spears (the yari from the saddle), a sword and the bow.
const SEKIGAHARA_HORSE = { spear: 3, katana: 1, bow: 2 };

function sekigaharaSide(random, side) {
  const warriors = [];
  for (const [rank, styles] of Object.entries(SEKIGAHARA_SIDE)) {
    for (const [style, count] of Object.entries(styles)) {
      for (let index = 0; index < count; index += 1) warriors.push(sengokuWarrior(random, side, style, rank));
    }
  }
  const shooter = (warrior) => (STYLES[warrior.style]?.ranged ? 1 : 0);
  return warriors.sort((a, b) => shooter(a) - shooter(b));
}

// Pyongyang, 1593: the Ming army storms the city held by Konishi
// Yukinaga. Eighteen Ming foot and fifty-two Japanese; the Ming regulars
// only — brigandine and elite — led by an elite with the guandao; gun and bow
// men behind on both sides. Li Rusong's Liaodong horse ride with them (below):
// the Ming came south with the northern cavalry the Japanese did not have; here
// the Japanese hold the city with more men than the Ming bring to this part of the wall.
const PYONGYANG_MING = {
  elite: { guandao: 2, matchlock: 1, threeEyed: 1 },
  brigandine: { swordShield: 6, spear: 4, matchlock: 4 },
};
const PYONGYANG_JAPANESE = {
  samurai: { katana: 7, naginata: 3, spear: 4 },
  ashigaru: { spear: 17, matchlock: 13, bow: 8 },
};
// The Ming horse: northern heavy cavalry, sabres and spears with a few three-eyed guns; the Japanese had none in the field.
const PYONGYANG_HORSE = { dao: 4, spear: 5, threeEyed: 3 };

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

/** `count` men from `make(style)`, for each style. */
function company(styles, make) {
  const men = [];
  for (const [style, count] of Object.entries(styles)) for (let index = 0; index < count; index += 1) men.push(make(style));
  return men;
}

// Otumba, 1520: the Spaniards, few and worn from the Noche Triste, with
// their Tlaxcalan allies (warriors armed as the Mexica were), meet the
// Mexica host on the plain. Steel against obsidian and cotton.
const OTUMBA = {
  spanish: { hidalgo: 4, rodelero: 7, arquebusier: 3 },
  // The jinetes of Cortés's horse: lances first, as at Otumba, where he rode the Mexica commander down.
  horse: { lance: 5, espada: 2 },
  tlaxcalan: { macuahuitl: 15, tepoztopilli: 10 },
  mexica: { warrior: { macuahuitl: 18, tepoztopilli: 10, bow: 4 }, elite: { macuahuitl: 5, tepoztopilli: 3 } },
};

// Baxemboy, Formosa, 1661: the VOC's musketeers and pikemen from Fort
// Zeelandia against Koxinga's army: his masked "iron men" in scale, his
// regulars in brigandine, garrison troops, and a few Japanese.
const ZEELANDIA = {
  dutch: { musketeer: 9, pikeman: 6, officer: 3 },
  koxinga: { elite: { guandao: 4, swordShield: 2 }, brigandine: { swordShield: 4, spear: 3, matchlock: 3 }, garrison: { spear: 8, dao: 2, matchlock: 2 }, ronin: { ronin: 2 } },
};

// A wokou raid on the Zhejiang coast, 1550s: rōnin and Chinese sea raiders
// against a garrison with one or two brigandine regulars among it.
// The raiding bands were large and the coast garrisons thin: here the raiders outnumber them.
const WOKOU = {
  // Japanese and Chinese together, as the raids were. The Ming accounts
  // (Zheng Ruozeng's Chouhai tubian, Qi Jiguang's own) describe the raiders
  // as swordsmen first: the long Japanese sword and the great two-handed
  // field sword (the ōdachi) leaping in at a run, the Chinese of the bands
  // with dao and spear. Few guns or bows among them: they came on and cut.
  // A few of the Japanese are rōnin, masterless swordsmen of the wars at
  // home (the raids' fighting core, as the Ming saw it): they lead the rush.
  raiders: { ronin: { ronin: 3 }, japanese: { katana: 6, odachi: 3 }, chinese: { dao: 8, spear: 6 } },
  // A coast garrison of the 1550s: spears and swords, no guns to speak of;
  // the weisuo levy in its hemp vests, and a pair of regulars in brigandine.
  garrison: { garrison: { spear: 8, dao: 5 }, brigandine: { swordShield: 1, spear: 1 } },
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

/**
 * The raiders of a wokou level, the same in both: the Japanese first (the
 * front rank, filled from one end to the other), the rōnin spread evenly
 * along it, then the Chinese.
 */
function wokouRaiders(random) {
  const ronin = company(WOKOU.raiders.ronin, (style) => roninWarrior(random, style));
  const japanese = company(WOKOU.raiders.japanese, (style) => wokouRaider(random, style, 'japanese'));
  const every = Math.ceil(WOKOU_RAIDERS_ORDER.perRow / ronin.length);
  ronin.forEach((man, index) => japanese.splice(Math.min(japanese.length, index * every + Math.floor(every / 2)), 0, man));
  return [...japanese, ...company(WOKOU.raiders.chinese, (style) => wokouRaider(random, style, 'chinese'))];
}

// Qi Jiguang's army in the Taizhou campaign, 1561: the same raiders (WOKOU)
// against the army he had raised in Yiwu from miners and farmers and drilled
// himself. Not elite troops: men in the brigandine, in the mandarin-duck squad
// (yuanyang zhen) of his Jixiao xinshu, twelve men who fought as one: a
// leader; two shields (the rattan shield and the dao) in front; two langxian
// (the wolf-brush: a long bamboo with its branches left on, to entangle a
// sword and keep a man off) at the shields' shoulders; four spears striking
// past them; and fowling pieces that fire before the raiders reach the line
// and fall back behind it. Qi himself, in elite armour, with his household
// guards (jiading) behind his squads. What made them win nine battles in a
// month, with a handful of Ming dead against hundreds of raiders, was
// discipline (his law: a squad that let its leader fall, or ran, was put to
// death; drilled until they moved as one) and the squad's tactics, not
// better men or better steel: the raiders here are the wokou level's, man
// for man, and the soldiers wear the brigandine the garrison's regulars wear.
const QI = {
  // A squad's men as they stand, [style, back, across]: m behind the front
  // (the guns' line), m across from the squad's middle. The two shields
  // side by side, the wolf-brushes (WEAPONS langxian) at their outer
  // shoulders, the spears in the gaps behind; the leader behind the spears;
  // the guns 2.4 m before the shields.
  squad: [
    ['matchlock', 0, -1.8], ['matchlock', 0, 0], ['matchlock', 0, 1.8],
    ['swordShield', 2.4, -0.7], ['swordShield', 2.4, 0.7],
    ['langxian', 2.9, -1.9], ['langxian', 2.9, 1.9],
    ['spear', 3.5, -0.6], ['spear', 3.5, 0.6], ['spear', 4.5, -1.3], ['spear', 4.5, 1.3],
    ['dao', 4.6, 0],
  ],
  // Squads side by side, this far (m) between their middles.
  squads: 2,
  squadWidth: 5,
  // Qi Jiguang and his guards, behind the squads' middle: [style, back, across].
  general: ['guandao', 6.2, 0],
  guards: [['guandao', 5.8, -1.6], ['swordShield', 5.8, 1.6], ['spear', 6.8, 0]],
  // One colour to a kind: the brigandine's red cloth (as the garrison's
  // regulars, WOKOU.design), and the iron lamellar laced in crimson for Qi
  // and his guards (OUTFITS mingElite's level design).
  design: { brigandine: 0, elite: 5 },
};

// How Qi's squads move and fight (formation.js drill): they stand and receive the raiders' rush, and
// do not run at them (`advance` false); each man of a squad goes for a raider come near his place (`squad`), not the front rank only.
const QI_DRILL = { advance: false, squad: true };
// Qi's army's discipline (ai.js AI.morale): his law, and a year of drill.
const QI_DISCIPLINE = 1;

// Without the squads' arms (qiJiguangLevel `weapons` off, for measuring): the
// same men armed as the coast garrison was (WOKOU.garrison's spears and dao,
// a few shields, no guns), in the same proportions.
const QI_UNARMED_MIX = ['spear', 'dao', 'spear', 'dao', 'spear', 'spear', 'dao', 'spear', 'dao', 'spear', 'swordShield', 'spear'];

/**
 * Qi Jiguang's army: its squads, then Qi and his guards, and where each man
 * stands (a formation `layout`). `weapons` false: the squads armed as the
 * garrison was (QI_UNARMED_MIX), for measuring what the arms did.
 */
function qiArmy(random, { weapons = true } = {}) {
  const men = [];
  const layout = [];
  for (let squad = 0; squad < QI.squads; squad += 1) {
    const middle = (squad - (QI.squads - 1) / 2) * QI.squadWidth;
    for (const [index, [style, back, across]] of QI.squad.entries()) {
      men.push(mingSoldier(random, weapons ? style : QI_UNARMED_MIX[index], 'brigandine', { people: 'mingSouth', design: QI.design.brigandine }));
      layout.push([back, middle + across]);
    }
  }
  for (const [index, [style, back, across]] of [QI.general, ...QI.guards].entries()) {
    const man = mingSoldier(random, style, 'elite', { people: 'mingSouth', design: QI.design.elite });
    men.push(index === 0 ? { ...man, name: 'Qi Jiguang' } : man);
    layout.push([back, across]);
  }
  return { men, layout };
}

/**
 * Qi Jiguang's level, with each of what won it (`levers`) or without, to
 * measure what each did (tools/levels.js `qiJiguang:morale,tactics`): the same
 * raiders and the same men in the same armour throughout.
 * - `morale`: Qi's discipline (world.discipline; ai.js AI.morale), or none (the garrison's);
 * - `tactics`: the squads drawn up and drilled as squads (formation `layout`
 *   and `drill`: places kept, shooters falling back, the wounded relieved,
 *   several on one), or a crowd in rows as the garrison stood;
 * - `weapons`: the squad's arms (shields, spears, fowling pieces), or the garrison's.
 */
export function qiJiguangLevel({ morale = true, tactics = true, weapons = true } = {}) {
  const drawnUp = tactics
    ? { front: WOKOU.front - 2.4, layout: qiArmy(() => 0.5, { weapons }).layout, loose: 0.1, drill: QI_DRILL }
    : { front: WOKOU.front, spacing: 1.2, rowSpacing: 1.6, perRow: 8, loose: 0.25 };
  return {
    title: "Qi Jiguang's army",
    place: 'Taizhou, Zhejiang · 1561',
    blurb: "The same raiders, the same kind of town, seven years on. General Qi Jiguang's army of Yiwu miners and farmers, drilled under his law until they fought as one: in brigandine, in mandarin-duck squads of twelve — shields in front, the wolf-brush bamboos thrust in the raiders' faces, spears past them, fowling pieces firing as the raiders come on. Qi stands behind them with his guards, in iron lamellar, with the guandao.",
    scene: 'jiangnan',
    weather: { fog: WEATHER_MIST.wokou, sky: 0.75, pale: 0.7, mistLine: [-1, 7], sun: 0.85 },
    arena: { halfX: 14, halfZ: 9 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 15, maxDistance: 19 },
    roster: `Twenty-six raiders · ${QI.squads} squads of twelve, Qi Jiguang and ${QI.guards.length} guards`,
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
const RIDERS_LOOSE = { spacing: 5, rowSpacing: 6, loose: 1.2 };

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
// (Shiji 111). Here: Wei Qing's crossbowmen in iron lamellar, drawn up before
// the laager (the floor's end at their backs: the wagons, render.js), and his
// horse on both flanks, sabre, spear and bow; against the Xiongnu, every man
// of them a horse archer in felt and leather, a few with the spear.
const MOBEI = {
  crossbow: 30,
  horse: { dao: 6, spear: 6, steppeBow: 4 },
  xiongnu: { steppeBow: 44, spear: 4 },
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
// against Hun horse archers and a few of Attila's nobles, and Ostrogoth and Gepid
// foot behind them.
const CATALAUNIAN = {
  // The Roman foot (spear and spatha), and its archers on its flank (sagittarii: the late Roman army shot the
  // composite bow it had taken from the steppe).
  romans: { spearOval: 12, spathaOval: 6 },
  archers: { steppeBow: 6 },
  visigoths: { spearRound: 10, spathaRound: 8 },
  visigothHorse: { spear: 4, spatha: 4 },
  huns: { rider: { steppeBow: 30 }, noble: { steppeBow: 3, spatha: 3 } },
  germans: { spearRound: 8, spathaRound: 6 },
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
  legionaries: 44,
  gauls: { spear: 4, longsword: 2 },
  parthians: { archer: { steppeBow: 24 }, cataphract: { kontos: 6 } },
  arena: { halfX: 60, halfZ: 40 },
  // The square two deep: a ring of eight a side and, two metres within it, one of five; a pace and a quarter apart (the scutum's width and an elbow's room).
  square: { sides: [8, 5], spacing: 1.25 },
  // Crassus's square stood under the arrows (it marched on only at night, in retreat): it holds its ground, shields locked.
  drill: { advance: false, square: true },
  romanFront: 12,
  parthianFront: 24,
  // The camels this far (m) in from the Parthians' end of the floor (on its middle line).
  train: { back: 3 },
};

// Koxinga's army is given no discipline of its own: what holds it on the sand is what the men see
// (ai.js standingFear): his iron men and regulars outmatch the Dutch line man for man, and steady the rest.

// Rhodes, 24 September 1522: Süleyman's general assault on the breaches.
// The Knights of St John in plate, their sergeants and gunners, hold the
// Bastion of Aragon against Janissaries, azaps and heavy men in mail-and-plate.
const RHODES = {
  hospitallers: { knight: { longsword: 6, warhammer: 2 }, sergeant: { spear: 4, matchlock: 3 } },
  // The whole army was a hundred thousand, but a breach is narrow: these are the men of one wave who reach the defenders.
  ottomans: { heavy: { maceShield: 2, saberShield: 1 }, janissary: { yatagan: 4, matchlock: 3 }, azap: { spear: 4, steppeBow: 3 } },
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
const MING_PEOPLE = { pyongyang: 'ming', koxinga: 'mingSouth', coast: 'mingCoast', qi: 'mingSouth' };
const mingRank = (rank, people, design = null) => (random, style) => mingSoldier(random, style, rank, { people, design });
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
  spanish: {
    label: 'The Spaniards',
    ranks: {
      hidalgo: { label: 'Hidalgo', kinds: ['conquistadorPlate'], styles: ['espada'], make: (random) => europeanSoldier(random, 'hidalgo') },
      rodelero: { label: 'Rodelero', kinds: ['conquistadorQuilted'], styles: ['espadaRodela'], make: (random) => europeanSoldier(random, 'rodelero') },
      arquebusier: { label: 'Arquebusier', kinds: ['conquistadorQuilted'], styles: ['matchlock'], make: (random) => europeanSoldier(random, 'arquebusier') },
      horse: { label: 'Jinete', kinds: ['conquistadorPlate'], mounted: true, styles: ['lance', 'espada'], make: (random, style) => conquistadorHorseman(random, style) },
    },
  },
  tlaxcala: {
    label: 'Tlaxcala',
    ranks: { warrior: { label: 'Tlaxcalan', kinds: ['mexicaWarrior'], styles: ['macuahuitl', 'tepoztopilli', 'bow'], make: (random, style) => mexicaWarrior(random, style, 'warrior', { people: 'Tlaxcala', band: 1 }) } },
  },
  mexica: {
    label: 'The Mexica',
    ranks: {
      warrior: { label: 'Warrior', kinds: ['mexicaWarrior'], styles: ['macuahuitl', 'tepoztopilli', 'bow'], make: (random, style) => mexicaWarrior(random, style, 'warrior') },
      elite: { label: 'Jaguar or eagle', kinds: ['mexicaElite'], styles: ['macuahuitl', 'tepoztopilli'], make: (random, style) => mexicaWarrior(random, style, 'elite') },
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
      brigandine: { label: 'Brigandine', kinds: ['mingBrigandine'], styles: ['swordShield', 'spear', 'matchlock'], make: mingRank('brigandine', MING_PEOPLE.koxinga) },
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
      heavy: { label: 'Heavy', kinds: ['ottomanHeavy'], styles: ['maceShield', 'saberShield'], make: (random, style) => ottomanSoldier(random, style, 'heavy') },
      janissary: { label: 'Janissary', kinds: ['janissary'], styles: ['yatagan', 'matchlock'], make: (random, style) => ottomanSoldier(random, style, 'janissary') },
      azap: { label: 'Azap', kinds: ['azap'], styles: ['spear', 'steppeBow'], make: (random, style) => ottomanSoldier(random, style, 'azap') },
    },
  },
  raiders: {
    label: 'The wokou',
    ranks: {
      ronin: { label: 'Rōnin', kinds: ['ronin'], styles: ['ronin'], make: (random, style) => roninWarrior(random, style) },
      japanese: { label: 'Japanese raider', kinds: RAIDER_KINDS, styles: ['katana', 'odachi', 'naginata', 'bow'], make: (random, style) => wokouRaider(random, style, 'japanese') },
      chinese: { label: 'Chinese raider', kinds: RAIDER_KINDS, styles: ['dao', 'spear', 'matchlock'], make: (random, style) => wokouRaider(random, style, 'chinese') },
    },
  },
  coast: {
    label: 'The coast garrison',
    ranks: {
      garrison: { label: 'Garrison', kinds: ['mingGarrison'], styles: ['spear', 'dao', 'matchlock'], make: mingRank('garrison', MING_PEOPLE.coast, WOKOU.design.garrison) },
      brigandine: { label: 'Brigandine', kinds: ['mingBrigandine'], styles: ['swordShield', 'spear', 'matchlock'], make: mingRank('brigandine', MING_PEOPLE.coast, WOKOU.design.brigandine) },
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

/** A battle with its armies drawn apart (SPREAD). */
function drawnApart(level) {
  if (!level.cast || !level.formation) return level;
  const factor = level.spread ?? SPREAD.factor;
  const fronts = Object.fromEntries(['red', 'blue'].map((corner) => [corner, level.formation[corner]?.front ?? 0]));
  const gap = fronts.red + fronts.blue;
  // To at least SPREAD.least between the lines: both sides drawn back alike.
  const scale = gap > 0 ? Math.max(factor, SPREAD.least / gap) : factor;
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

export const SCENARIOS = {
  // A what-if, not a battle that was: a legion of the early Empire against
  // a Han army of crossbowmen, as Li Ling's five thousand (99 BC) stood
  // against the Xiongnu. Two drilled armies of fifty, in ranks
  // (formation.js): the legion walks up in its lines, the Han hold theirs
  // and shoot, the ranks relieving each other.
  legion: {
    title: 'Rome against Han',
    place: 'A what-if · the 1st century',
    blurb: 'A legion of the early Empire meets a Han army of crossbowmen: forty-two legionaries in segmented iron with scutum and gladius, closed up under their shields in the testudo as they walk up into forty-two crossbows; the front ranks meet, the rest hold their places. Eight auxiliary horse in mail ride on one flank and eight Han horsemen on the other, and charge it when the lines close.',
    scene: 'plain',
    arena: LEGION.arena,
    camera: { yaw: -0.5, pitch: 0.45, distance: 20, maxDistance: 26 },
    roster: 'Fifty a side: forty-two legionaries and eight auxiliary horse · forty-two Han crossbowmen and eight horsemen',
    formation: { red: { ...LEGION.ranks, front: LEGION.romanFront }, blue: { ...LEGION.ranks, front: LEGION.hanFront } },
    cast: (random) => legionSides(random),
    // Eight horse of an auxiliary ala to the legion's side, eight Han horsemen to theirs, in place of the rear rank of the foot.
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
    blurb: "Wei Qing has crossed the desert to the chanyu's own ground. Thirty Han crossbowmen in iron lamellar stand before the ring of wagons, his horse — sabre, spear and bow — on both flanks; against them come forty-eight Xiongnu, every man a horse archer in felt and leather, riding in to shoot and wheeling away.",
    scene: 'mobei',
    arena: MOBEI.arena,
    spread: 1,
    camera: { yaw: -0.5, pitch: 0.42, distance: 40, maxDistance: 60 },
    roster: 'Thirty Han crossbowmen and sixteen horse · forty-eight Xiongnu horsemen',
    // The crossbowmen ten to a rank before the wagons (the floor's end behind them), the horse on both flanks; the Xiongnu a loose mass of riders.
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
    blurb: "Crassus's legion stands in a square under a sky of arrows. Forty-four legionaries of the Republic in mail and bronze, shields locked, and six of Publius Crassus's Gallic horse; round them ride twenty-four Parthian horse archers, who never close and never run short — the camel train behind them brings fresh arrows — and six cataphracts, man and horse in iron scale, waiting for anyone who breaks out.",
    scene: 'carrhae',
    arena: CARRHAE.arena,
    spread: 1,
    camera: { yaw: -0.5, pitch: 0.42, distance: 40, maxDistance: 60 },
    roster: 'Forty-four legionaries and six Gallic horse · twenty-four horse archers and six cataphracts',
    formation: {
      // The square stands (`drill`: over the legion's own, which walks up to the enemy), its outer ring facing out every way, shields a wall, the inner ring's a roof (formation.js).
      red: { front: CARRHAE.romanFront, facing: 'ahead', layout: hollowSquare(CARRHAE.square), spacing: CARRHAE.square.spacing, perRow: CARRHAE.square.sides[0], loose: 0.05, drill: CARRHAE.drill, wings: { back: 0 } },
      blue: { front: CARRHAE.parthianFront, spacing: RIDERS_LOOSE.spacing, rowSpacing: RIDERS_LOOSE.rowSpacing, perRow: 8, loose: RIDERS_LOOSE.loose, train: CARRHAE.train },
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
    blurb: "Aetius's Romans and Theoderic's Visigoths stand against Attila. Eighteen Roman foot in mail with oval shields and spears, and six Roman archers on their flank, hold the line beside eighteen Visigoths, eight Visigoth horse on the flank; thirty-six Huns ride in shooting — horse archers and a few of Attila's nobles — with fourteen Ostrogoths and Gepids on foot behind them.",
    scene: 'catalaunian',
    arena: CATALAUNIAN.arena,
    spread: 1,
    camera: { yaw: -0.5, pitch: 0.42, distance: 40, maxDistance: 60 },
    roster: 'Twenty-four Romans (six of them archers), eighteen Visigoths and eight Visigoth horse · thirty-six Huns on horse, fourteen Ostrogoths and Gepids',
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
    blurb: 'The town has risen. Two lords in plate ride in on their destriers, with three of their foot soldiers behind them, to put it down — and meet twenty peasants with spears in the market square.',
    scene: 'town',
    weather: { fog: WEATHER_MIST.rebellion, sky: 0.55, pale: 0.55, sun: 0.9 },
    arena: { halfX: 9, halfZ: 7 },
    // Never further out than the house fronts.
    camera: { yaw: -0.55, pitch: 0.42, distance: 10, maxDistance: 10.5 },
    roster: 'Two mounted knights and three foot soldiers · twenty rebels with spears',
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
  sekigahara: {
    title: 'Sekigahara',
    place: 'Sekigahara, Mino · 21 October 1600',
    blurb: 'The battle that ends the Sengoku. Thirty-six of the East in red against thirty-six of the West in black and blue: bows and teppō in front, spears, blades and polearms behind, and six mounted samurai on a flank of each army to charge when the lines close.',
    scene: 'sengoku',
    weather: { fog: WEATHER_MIST.sekigahara, sky: 0.65, pale: 0.6, mistLine: [-1, 6], sun: 0.85 },
    arena: { halfX: 17, halfZ: 11 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 17, maxDistance: 22 },
    roster: 'Thirty-six a side: samurai and ashigaru, six of the samurai on horse',
    // Ten abreast: the bows and teppō in the front rows, the blades and polearms behind them.
    formation: { red: { front: 6, spacing: 1.3, rowSpacing: 1.6, shootersFront: SHOOTERS_FRONT_GAP, perRow: 10, loose: 0.3 }, blue: { front: 6, spacing: 1.3, rowSpacing: 1.6, shootersFront: SHOOTERS_FRONT_GAP, perRow: 10, loose: 0.3 } },
    cast: (random) => {
      return { red: sekigaharaSide(random, SEKIGAHARA_EAST), blue: sekigaharaSide(random, SEKIGAHARA_WEST) };
    },
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
    blurb: 'The Ming army retakes the city from the Japanese. Eighteen Ming regulars — elites in plated brigandine with guandao and guns, brigandine men with sword and shield, spear and gun — and twelve of Li Rusong\'s horsemen in iron lamellar on the flank, against fifty-two Japanese samurai and ashigaru.',
    scene: 'sengoku',
    arena: { halfX: 14, halfZ: 9 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 15, maxDistance: 19 },
    roster: 'Thirty Ming (twelve on horse) · fifty-two Japanese',
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
  otumba: {
    title: 'Otumba',
    place: 'Otumba, Valley of Mexico · 7 July 1520',
    blurb: 'Days after the Noche Triste, the Spaniards and their Tlaxcalan allies are caught on the open plain by the Mexica host: steel breastplates, espadas and arquebuses, and the few horse Cortés had left, against obsidian blades and quilted cotton.',
    scene: 'plain',
    arena: { halfX: 15, halfZ: 10 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 16, maxDistance: 20 },
    roster: 'Fourteen conquistadors on foot and seven on horse, and twenty-five Tlaxcalans · forty Mexica',
    formation: { red: { front: 5, spacing: 1.2, rowSpacing: 1.5, perRow: 10, loose: 0.3 }, blue: { front: 5, spacing: 1.2, rowSpacing: 1.6, perRow: 10, loose: 0.5 } },
    cast: (random) => ({
      red: shootersBehind([...company(OTUMBA.spanish, (type) => europeanSoldier(random, type)), ...company(OTUMBA.tlaxcalan, (style) => mexicaWarrior(random, style, 'warrior', { people: 'Tlaxcala', band: 1 }))]),
      blue: shootersBehind([...company(OTUMBA.mexica.elite, (style) => mexicaWarrior(random, style, 'elite')), ...company(OTUMBA.mexica.warrior, (style) => mexicaWarrior(random, style, 'warrior'))]),
    }),
    // Cortés's few horse (about twenty survived the Noche Triste) ride on the Spanish flanks: no Tlaxcalan or Mexica horse (the Americas had none).
    wings: {
      arena: { halfX: 30, halfZ: 16 },
      camera: { yaw: -0.5, pitch: 0.42, distance: 28, maxDistance: 36 },
      formation: { red: { wings: { side: 1 } } },
      cast: (random, sides) => ({ red: [...sides.red, ...company(OTUMBA.horse, (style) => conquistadorHorseman(random, style))], blue: sides.blue }),
    },
    // The armies its sides may be set up from (ARMIES; muster.js).
    armies: { red: ['spanish', 'tlaxcala'], blue: ['mexica'] },
    fighters: [],
  },
  zeelandia: {
    title: 'Fort Zeelandia',
    place: 'Baxemboy, Formosa · 1661',
    blurb: "Koxinga lands to take Fort Zeelandia. The VOC's musketeers and pikemen march out to meet his army on the sand: masked iron men in scale, brigandine regulars, garrison troops and a few Japanese.",
    scene: 'coastFort',
    arena: { halfX: 15, halfZ: 10 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 16, maxDistance: 20 },
    roster: 'Eighteen Dutch · thirty-two of Koxinga\'s army',
    formation: { red: { front: 5, spacing: 1.2, rowSpacing: 1.5, shootersFront: SHOOTERS_FRONT_GAP, perRow: 9, loose: 0.15 }, blue: { front: 5, spacing: 1.2, rowSpacing: 1.6, shootersFront: SHOOTERS_FRONT_GAP, perRow: 10, loose: 0.35 } },
    cast: (random) => {
      const army = ZEELANDIA.koxinga;
      // The iron men, every one masked, in scale (the elite's masked scale design).
      const ironMen = company(army.elite, (style) => mingSoldier(random, style, 'elite', { people: 'mingSouth', design: 4 }));
      const regulars = company(army.brigandine, (style) => mingSoldier(random, style, 'brigandine', { people: 'mingSouth' }));
      const garrison = company(army.garrison, (style) => mingSoldier(random, style, 'garrison', { people: 'mingSouth' }));
      return {
        red: shootersBehind(company(ZEELANDIA.dutch, (type) => europeanSoldier(random, type))),
        blue: shootersBehind([...ironMen, ...regulars, ...garrison, ...company(army.ronin, (style) => roninWarrior(random, style))]),
      };
    },
    // The armies its sides may be set up from (ARMIES; muster.js).
    armies: { red: ['dutch'], blue: ['koxinga'] },
    fighters: [],
  },
  rhodes: {
    title: 'Siege of Rhodes',
    place: 'Bastion of Aragon, Rhodes · 24 September 1522',
    blurb: "Süleyman's general assault on the breaches. The Knights of St John in plate, with their sergeants and gunners, meet the Janissaries with yatagan and gun, the azaps' spears and bows, and heavy men in mail-and-plate.",
    scene: 'coastFort',
    arena: { halfX: 15, halfZ: 10 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 16, maxDistance: 20 },
    roster: 'Fifteen of the Order · a wave of seventeen Ottomans',
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
    blurb: 'Sea raiders come up the canals in the morning mist, Japanese and Chinese together, rōnin at their head, barefoot, some in pieces of samurai armour: long swords and great two-handed swords, dao and spears, and hardly a gun among them. In the market square by the bridge they meet the town\'s garrison: old men and boys in hemp vests, and a pair of brigandine regulars among them.',
    scene: 'jiangnan',
    weather: { fog: WEATHER_MIST.wokou, sky: 0.75, pale: 0.7, mistLine: [-1, 7], sun: 0.85 },
    arena: { halfX: 14, halfZ: 9 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 15, maxDistance: 19 },
    roster: 'Twenty-six raiders · fifteen garrison',
    formation: { red: WOKOU_RAIDERS_ORDER, blue: { front: WOKOU.front, spacing: 1.2, rowSpacing: 1.6, perRow: 8, loose: 0.25 } },
    cast: (random) => ({
      red: wokouRaiders(random),
      blue: [...company(WOKOU.garrison.brigandine, (style) => mingSoldier(random, style, 'brigandine', { people: 'mingCoast', design: WOKOU.design.brigandine })), ...company(WOKOU.garrison.garrison, (style) => mingSoldier(random, style, 'garrison', { people: 'mingCoast', design: WOKOU.design.garrison }))],
    }),
    // The armies its sides may be set up from (ARMIES; muster.js).
    armies: { red: ['raiders'], blue: ['coast'] },
    fighters: [],
  },
  qiJiguang: qiJiguangLevel(),
  port: {
    title: 'Pier 9',
    place: 'Container port, Yokohama · 2:15 a.m.',
    blurb: 'A raid on a handover between the containers. Four SWAT officers — two pistols, two batons — against six yakuza: four knives, a katana, and one gun.',
    scene: 'port',
    arena: { halfX: 10, halfZ: 6 },
    camera: { yaw: -0.6, pitch: 0.36, distance: 9, maxDistance: 11 },
    weather: WEATHER_SEA_FOG,
    roster: 'Four SWAT officers · six yakuza',
    formation: { red: { front: 4.5, spacing: 1.4 }, blue: { front: 4.5, spacing: 1.3, loose: 0.4 } },
    cast: (random) => ({
      red: [swatOfficer(random, 'handgun'), swatOfficer(random, 'baton'), swatOfficer(random, 'baton'), swatOfficer(random, 'handgun')],
      blue: [yakuza(random, 'knife'), yakuza(random, 'katana'), yakuza(random, 'knife'), yakuza(random, 'handgun'), yakuza(random, 'knife'), yakuza(random, 'knife')],
    }),
    // The armies its sides may be set up from (ARMIES; muster.js).
    armies: { red: ['swat'], blue: ['yakuza'] },
    fighters: [],
  },
  pride: {
    title: 'Frye vs. Takayama',
    place: 'Saitama Super Arena, Japan · 23 June 2002',
    blurb: 'Two big men, one hand each on the back of the other\'s neck, trading punches face to face until one of them drops.',
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
    blurb: 'A shoulder barged on the stairs. No ring, no gloves, no referee — a strip of platform between the pillars and the yellow edge.',
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
  return createWorld(fighters, { seed, arena: scenario.arena, rules: scenario.rules, formation: scenario.formation });
}
