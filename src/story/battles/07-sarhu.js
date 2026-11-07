// Story mode, Level 7 (18 April 1619, Wanli 47, 三月初五): Sarhu, Liu Ting's eastern column destroyed at Abdali (阿布达里冈).
// Yang Hao sent four columns by four roads at Nurhaci's capital, Hetu Ala; Liu Ting's, the eastern, set out from Kuandian on
// 二月二十五, slowed by the late snow and the felled trees across the mountain roads, won its first fights (Niumao and Majia
// stockades; at the Dong'e road, then against Tobo's camp), and by 三月初三 was some seventy li from Hetu Ala, near Abdali.
// It did not know Du Song's and Ma Lin's columns were already gone. Nurhaci sent Daišan, Manggūltai and Hong Taiji with some
// forty thousand (his own count; modern writers think fewer); Han men dressed as Du Song's soldiers carried word that Du Song
// was nearly at Hetu Ala, and Liu Ting, fearing to be left out of the victory, pushed his men on in file through the defile
// ("重峦叠嶂、隘路险夷", the column strung out). On 三月初五 Hong Taiji took the top of Abdali ridge and came down on it from
// above while Daišan struck its flank (from the west); it broke, and Liu Ting fell fighting (zh.wikipedia 薩爾滸之戰, after the
// 清太祖武皇帝实录 and 明史 卷247 刘綎传; en.wikipedia Battle of Sarhū; Gregorian day from 三月初一 = 14 April 1619 as scenarios.js
// SCENARIOS.sarhu has it). The Joseon army under Gang Hong-rip (姜弘立: 10,000 musketeers and 3,000 archers) marched with
// Kang Yingqian and Qiao Yiqi behind the column and was beaten the same day at Fuca (富察), apart from this field: it is not here.
// (The game has no Joseon kit either.)
//
// The sides, scaled to what the game runs, the ratio kept: the column at Abdali, 12,338 by its officers' rolls (zh.wikipedia's
// table: Liu Ting's own 1,838, Zu Tianding ~2,000, Yao Guofu 3,000, Zhou Wen 1,500, Jiang Wanhua ~2,000, Xu Jiusi ~500, Zhou
// Yiming's Zhejiang troops 1,500); against it the Jin's forty thousand, 1 to 3.2. At about one man to 590: 21 Ming and 68 Jin.
// - Liu Ting's household (家丁, his 1,838: 15%): 3, he and two of his men, on horse (mingHorseman: Liaodong iron lamellar; his own
//   cavalry). Liu Ting born c. 1558, sixty-one.
// - Zhou Yiming's Zhejiang troops (12%): 3, regulars in brigandine with gun, spear and shield (built as the south's).
// - The rest of the southern troops (Sichuan, Huguang, Fujian men: 73%): 15, half regulars in brigandine, half the levy's hemp
//   vest. The column had no great guns and few firearms (zh.wikipedia: "又无大炮火器"): bows, not guns, among them.
// - Hong Taiji's men on the ridge (his Plain White banner, 正白), 40: spears, sabres, guandao before the archers with the heavy bow.
// - Daišan's on the flank (his two Red banners, 正红 / 镶红), 28: 18 on foot and 10 on horse (the riders in the Bayara's kit, the
//   game's one mounted Jurchen kit). Hong Taiji was twenty-seven, Daišan thirty-six.
// The ground: the column in file along the valley floor; the ridge rising on its right (+x) to Abdali's top, the hillside on its
// left (-x) where Daišan came. The Jin wait hidden (formation `ambush`) until the signal, as the column marched in not knowing.
// Nothing is tuned to an outcome: the men as cast, the ratio as stated.

import { bannerman, mingHorseman, mingSoldier } from '../../cast.js';
import { seededRandom } from '../../physics.js';
import { northBlock, northName, northPlace, northSides, northStyles } from './north.js';

export const SARHU1619 = {
  year: 1619,
  // The column: two files (x, m) along z, `pitch` m between ranks, its head at `head` (z): Liu Ting and his riders before it.
  files: [-4, -2.4],
  pitch: 2.4,
  head: 12,
  // Its companies of foot, head to tail: [people's kit, styles in file order, name]. Each company two files abreast.
  companies: [
    { unit: 'zhejiang', rank: 'brigandine', people: 'mingSouth', styles: ['spear', 'matchlock', 'swordShield'] },
    { unit: 'south1', rank: 'brigandine', people: 'mingSouth', styles: ['spear', 'swordShield', 'spear', 'dao', 'swordShield', 'bow', 'spear'] },
    { unit: 'south2', rank: 'garrison', people: 'mingSouth', styles: ['spear', 'dao', 'spear', 'bow', 'spear', 'dao', 'spear', 'bow'] },
  ],
  // Liu Ting and two of his household on horse, at the column's head.
  household: ['dao', 'spear', 'dao'],
  riderGap: 3,
  // Hong Taiji's men on the ridge, Daišan's on the hillside and their horse.
  ridgeMen: { spear: 12, dao: 6, guandao: 6, manchuBow: 16 },
  ridgeAt: { at: [15, 0], perRow: 14, spacing: 2.4, rowSpacing: 2.4 },
  flankMen: { spear: 6, dao: 4, manchuBow: 8 },
  flankAt: { at: [-15, 0], perRow: 9, spacing: 2.4, rowSpacing: 2.4, back: -1 },
  flankHorse: { bayaraLance: 5, bayaraBow: 5 },
  flankHorseAt: { at: [-21, 0], perRow: 10, spacing: 3, rowSpacing: 3, back: -1 },
  // The banners (outfits.js bannerArmour designs): Plain White (2) for Hong Taiji's, Plain and Bordered Red (4, 5) for Daišan's.
  ridgeDesign: 2,
  flankDesigns: [4, 5],
  // The Jin wait unseen until this (s): the column walks into it.
  signal: 3,
  // The valley: the ridge on the right rising from `from` to its top (m in x, height m), the hillside on the left the same way.
  ridge: { from: 2, top: 14, height: 5 },
  hillside: { from: -8, top: -18, height: 3.5 },
  arena: { halfX: 30, halfZ: 20 },
  seconds: 240,
  view: {
    scene: 'sarhu',
    // The cold, damp morning of the thaw in the hills (the wind that troubled the Joseon guns at Fuca): a grey mist on the ridges.
    weather: { fog: [12, 95], sky: 0.6, pale: 0.6, sun: 0.65 },
    camera: { yaw: -0.5, pitch: 0.45, distance: 30, maxDistance: 38 },
  },
};

/** The valley: the ridge and the hillside, each a long bank along z (its profile the ground's height across it). */
function sarhu1619Works() {
  const { ridge, hillside, arena } = SARHU1619;
  const along = [[0, -arena.halfZ - 1], [0, arena.halfZ + 1]];
  // A bank's left (+x, going +z) is its profile's positive side.
  const bank = (from, top, height, end) => ({ from: [from, along[0][1]], to: [from, along[1][1]], profile: [[0, 0], [top - from, height], [end - from, height]].sort((a, b) => a[0] - b[0]) });
  return { ditches: [bank(ridge.from, ridge.top, ridge.height, arena.halfX + 2), bank(hillside.from, hillside.top, hillside.height, -arena.halfX - 2)] };
}

/** The column: its riders at the head, then each company two abreast, head to tail; each man's part in it. */
function sarhu1619Column(random) {
  const { files, pitch, head, companies, household, riderGap } = SARHU1619;
  const men = household.map((style, index) => {
    const inputs = mingHorseman(random, style);
    const at = [files[index % 2], head + riderGap + Math.floor(index / 2) * riderGap];
    if (index === 0) return { inputs: { ...inputs, name: 'Liu Ting', age: 61 }, name: { zh: '刘綎', en: 'Liu Ting' }, at, role: 'officer', unit: 'household', named: true };
    return { inputs, name: northName(inputs), at, role: 'rear', unit: 'household' };
  });
  let rank = 0;
  for (const company of companies) {
    company.styles.forEach((style, index) => {
      const inputs = mingSoldier(random, style, company.rank, { people: company.people });
      const row = rank + Math.floor(index / 2);
      // His part: the company's first man leads it; the right file (toward the ridge) is its front, the left its second; its last rank its rear.
      const last = Math.floor((company.styles.length - 1) / 2);
      const role = index === 0 ? 'lead' : Math.floor(index / 2) === last ? 'rear' : index % 2 === 1 ? 'front' : 'second';
      men.push({ inputs, name: northName(inputs), at: [files[(index + 1) % 2], head - row * pitch], role, unit: company.unit });
    });
    rank += Math.ceil(company.styles.length / 2);
  }
  // A junior officer of the column walks with his company's head: its lead's place serves an officer too (northPlace falls back).
  return men;
}

/** The Jin: Hong Taiji's on the ridge, Daišan's on the hillside, his horse behind them. */
function sarhu1619Jin(random) {
  const { ridgeMen, ridgeAt, flankMen, flankAt, flankHorse, flankHorseAt, ridgeDesign, flankDesigns } = SARHU1619;
  const block = (styles, placing, make) => {
    const places = northBlock(styles.length, placing);
    return styles.map((style, index) => {
      const inputs = make(style, index);
      return { inputs, name: northName(inputs), at: places[index] };
    });
  };
  const ridge = block(northStyles(ridgeMen), ridgeAt, (style) => bannerman(random, style, 'banner', { design: ridgeDesign }));
  // Hong Taiji among his men on the ridge top (born 1592).
  ridge[0] = { ...ridge[0], inputs: { ...ridge[0].inputs, name: 'Hong Taiji', age: 27 }, name: { zh: '皇太极', en: 'Hong Taiji' } };
  const flank = block(northStyles(flankMen), flankAt, (style, index) => bannerman(random, style, 'banner', { design: flankDesigns[index % flankDesigns.length] }));
  const horse = block(northStyles(flankHorse), flankHorseAt, (style) => bannerman(random, style, 'bayara', { mounted: true }));
  // Daišan at the head of his horse (born 1583).
  horse[0] = { ...horse[0], inputs: { ...horse[0].inputs, name: 'Daišan', age: 36 }, name: { zh: '代善', en: 'Daišan' } };
  return [...ridge, ...flank, ...horse];
}

export const battle = {
  id: 'sarhu',
  n: 7,
  year: SARHU1619.year,
  title: { zh: '萨尔浒·阿布达里冈', en: 'Sarhu: the Ridge of Abdali' },
  seconds: SARHU1619.seconds,
  /** Liu Ting's column in file in the valley (the hero in it by his rank, his comrades beside him) and the Jin above it. */
  setup(life, seed = 1) {
    const random = seededRandom(seed);
    const year = life.year ?? SARHU1619.year;
    const red = sarhu1619Column(random);
    const blue = sarhu1619Jin(random);
    // A junior man of the column: in its middle company, the southern regulars'.
    const middle = red.filter((man) => man.unit === 'south1');
    const near = middle[Math.floor(middle.length / 2)].at;
    const placed = northPlace(life, red, near, year);
    const { fighters, names, layouts } = northSides(red, blue);
    return {
      fighters,
      options: {
        seed,
        arena: { ...SARHU1619.arena, works: sarhu1619Works() },
        formation: {
          red: { front: 0, layout: layouts.red, loose: 0.3 },
          blue: { front: 0, layout: layouts.blue, loose: 0.6, ambush: { signal: SARHU1619.signal } },
        },
        place: SARHU1619.view.scene,
        climate: 'abdali1619',
      },
      view: SARHU1619.view,
      ...placed,
      names,
    };
  },
};
