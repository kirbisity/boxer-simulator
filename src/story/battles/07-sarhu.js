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
//   cavalry). (His age is not given: his birth year is not in the sources used here.)
// - Zhou Yiming's Zhejiang troops (12%): 3, regulars in brigandine with gun, spear and shield (built as the south's).
// - The rest of the southern troops (Sichuan, Huguang, Fujian men: 73%): 15, half regulars in brigandine, half the levy's hemp
//   vest. The column had no great guns and few firearms (zh.wikipedia: "又无大炮火器"): bows, not guns, among them.
// - Hong Taiji's men on the ridge (his Plain White banner, 正白), 40: spears, sabres, guandao before the archers with the heavy bow.
// - Daišan's on the flank (his two Red banners, 正红 / 镶红), 28: 18 on foot and 10 on horse (the riders in the Bayara's kit, the
//   game's one mounted Jurchen kit). Hong Taiji (born November 1592) was twenty-six, Daišan (born 1583) thirty-five.
// The ground: the column in file along the valley floor; the ridge rising on its right (+x) to Abdali's top, the hillside on its
// left (-x) where Daišan came. The Jin wait hidden (formation `ambush`) until the signal, as the column marched in not knowing.
// Nothing is tuned to an outcome: the men as cast, the ratio as stated.

import { bannerman, mingHorseman, mingSoldier } from '../../cast.js';
import { seededRandom } from '../../physics.js';
import { northBlock, northName, northPlace, northSides, northStyles } from './north.js';
import { storyDeployResolve } from '../deploy.js';

export const SARHU1619 = {
  year: 1619,
  // The column: two files (x, m) along z, `pitch` m between ranks, its head at `head` (z): Liu Ting and his riders before it.
  files: [-4, -2.4],
  pitch: 2.4,
  head: 12,
  // The column closed up (the deploy screen's `closed`: a 把总's to order, src/story/deploy.js): its foot four files abreast
  // across the valley floor (between the hillside's foot at -8 and the ridge's at +2, below: a file every 1.6 m, as the two
  // files' spacing), half as long, its tail within call of its head. Liu Ting pushed on strung out in file through the
  // defile (above); a column that long cannot turn to a flank as one, and its head is lost before its tail knows.
  closedFiles: [-5.6, -4, -2.4, -0.8],
  // Its companies of foot, head to tail: [people's kit, styles in file order, name]. Each company two files abreast.
  companies: [
    { unit: 'zhejiang', rank: 'brigandine', people: 'mingSouth', styles: ['spear', 'matchlock', 'swordShield'] },
    { unit: 'south1', rank: 'brigandine', people: 'mingSouth', styles: ['spear', 'swordShield', 'spear', 'dao', 'swordShield', 'mingBow', 'spear'] },
    { unit: 'south2', rank: 'garrison', people: 'mingSouth', styles: ['spear', 'dao', 'spear', 'mingBow', 'spear', 'dao', 'spear', 'mingBow'] },
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

/** The column: its riders at the head, then each company two abreast (or, `closed`, four), head to tail; each man's part in it. */
function sarhu1619Column(random, formation = 'file') {
  const { files: riderFiles, pitch, head, companies, household, riderGap } = SARHU1619;
  const files = formation === 'closed' ? SARHU1619.closedFiles : riderFiles;
  const abreast = files.length;
  const men = household.map((style, index) => {
    const inputs = mingHorseman(random, style);
    const at = [riderFiles[index % 2], head + riderGap + Math.floor(index / 2) * riderGap];
    if (index === 0) return { inputs: { ...inputs, name: 'Liu Ting' }, name: { zh: '刘綎', en: 'Liu Ting' }, at, role: 'officer', unit: 'household', named: true };
    return { inputs, name: northName(inputs), at, role: 'rear', unit: 'household' };
  });
  let rank = 0;
  for (const company of companies) {
    company.styles.forEach((style, index) => {
      const inputs = mingSoldier(random, style, company.rank, { people: company.people });
      const row = rank + Math.floor(index / abreast);
      // His part: the company's first man leads it; the first file its front, the others its second; its last rank its rear.
      const last = Math.floor((company.styles.length - 1) / abreast);
      const file = (index + 1) % abreast;
      const role = index === 0 ? 'lead' : Math.floor(index / abreast) === last ? 'rear' : file === 0 ? 'front' : 'second';
      men.push({ inputs, name: northName(inputs), at: [files[file], head - row * pitch], role, unit: company.unit });
    });
    rank += Math.ceil(company.styles.length / abreast);
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
  // Hong Taiji among his men on the ridge top (born November 1592: twenty-six).
  ridge[0] = { ...ridge[0], inputs: { ...ridge[0].inputs, name: 'Hong Taiji', age: 26 }, name: { zh: '皇太极', en: 'Hong Taiji' } };
  const flank = block(northStyles(flankMen), flankAt, (style, index) => bannerman(random, style, 'banner', { design: flankDesigns[index % flankDesigns.length] }));
  const horse = block(northStyles(flankHorse), flankHorseAt, (style) => bannerman(random, style, 'bayara', { mounted: true }));
  // Daišan at the head of his horse (born 1583: thirty-five).
  horse[0] = { ...horse[0], inputs: { ...horse[0].inputs, name: 'Daišan', age: 35 }, name: { zh: '代善', en: 'Daišan' } };
  return [...ridge, ...flank, ...horse];
}

export const BATTLE_SARHU = {
  id: 'sarhu',
  n: 7,
  year: SARHU1619.year,
  title: { zh: '萨尔浒·阿布达里冈', en: 'Sarhu: the Ridge of Abdali' },
  seconds: SARHU1619.seconds,
  // The deploy screen (src/story/deploy.js). The column's order of march is its commander's: a 把总 (the column's foot is
  // his command as the game draws it) may close it up; below him it marches in file as Liu Ting had it. Where he goes in it
  // is an officer's to choose: at its head on horse, in the place of one of Liu Ting's riders (an officer of the column rode
  // where it could see him: the household's horse is the place's, north.js northDressed; our assumption, as the record does
  // not say where the column's junior officers were), with its middle company, or with its tail.
  deploy: {
    formations: {
      from: 'bazong',
      default: 'file',
      options: [
        { id: 'file', name: { zh: '两列行军', en: 'In file' }, note: { zh: '两人一排沿谷底走，如刘綎催着全军走的那样：队伍拉得很长。', en: 'Two abreast along the valley floor, as Liu Ting pushed the column on: strung out long.' } },
        { id: 'closed', name: { zh: '四列收拢', en: 'Closed up' }, note: { zh: '四人一排，长度减半，队尾听得见队首。', en: 'Four abreast, half as long: its tail within call of its head.' } },
      ],
    },
    posts: {
      from: 'shaoguan',
      default: 'middle',
      options: [
        { id: 'head', name: { zh: '骑马在前', en: 'At the head, mounted' }, note: { zh: '骑着马跟刘綎的家丁在队首。', en: 'On horse at the column\'s head with Liu Ting\'s household riders.' } },
        { id: 'middle', name: { zh: '中间一部', en: 'The middle company' }, note: { zh: '在南兵正兵当中，队伍的中段。', en: 'Among the southern regulars, the column\'s middle.' } },
        { id: 'tail', name: { zh: '队尾', en: 'The tail' }, note: { zh: '和最后一部在一起。', en: 'With the last company.' } },
      ],
    },
  },
  /** Liu Ting's column in file in the valley (the hero in it by his rank or at his post, his comrades beside him) and the Jin above it. */
  setup(life, seed = 1, options = {}) {
    const random = seededRandom(seed);
    const year = life.year ?? SARHU1619.year;
    const { formation, post } = storyDeployResolve(BATTLE_SARHU, life, options.deploy);
    const red = sarhu1619Column(random, formation);
    const blue = sarhu1619Jin(random);
    // A junior man of the column: in its middle company, the southern regulars'; at a post he chose, that post's unit (the
    // riders nearest Liu Ting; the last company's head).
    const unit = { head: 'household', middle: 'south1', tail: 'south2' }[post] ?? 'south1';
    const ofUnit = red.filter((man) => man.unit === unit);
    const near = post === 'head' ? red[0].at : post === 'tail' ? ofUnit[0].at : ofUnit[Math.floor(ofUnit.length / 2)].at;
    const placed = northPlace(life, red, near, year, post === 'head' ? { unit } : post === 'tail' ? { unit, role: 'lead' } : {});
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
      deploy: { formation, post },
      ...placed,
      names,
    };
  },
};
