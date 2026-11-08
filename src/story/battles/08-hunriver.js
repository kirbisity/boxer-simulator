// Story mode, Level 8 (天启元年三月十三, about 3 May 1621): the Hun River (浑河之战), the southern troops' last stand.
// Nurhaci had taken Shenyang the day before. Its relief came too late: the Sichuan troops (川兵: the white-staff men, 白杆兵, of
// Shizhu under Qin Bangping 秦邦屏, with Zhou Dunji 周敦吉), more than ten thousand, crossed the Hun River first and camped on
// its north bank by the bridge; the Zhejiang troops (浙兵) under Tong Zhongkui 童仲揆 and Chen Ce 陈策, with the deputy general
// Qi Jin 戚金 (Qi Jiguang's nephew) and Zhang Mingshi 张明世, camped on the south bank: 3,000 Zhejiang men and 2,000 household
// troops (家丁), their camp ringed with war carts, guns, a trench and a palisade of sorghum stalks plastered with mud. The
// Sichuan camp broke the White banner and then the Yellow before the Jin, attacking again and again and turning cannon on it,
// overran it; Qin Bangping and Zhou Dunji fell, and a few of their men (Deng Qilong 邓起龙, Yuan Jianlong 袁见龙) took the
// bridge and got into the Zhejiang camp. Then the Jin crossed and surrounded that camp "several rings deep" (数匝). Its guns
// killed many of them until the powder was gone; then it was hand to hand, the southern men in thick cotton armour with
// bamboo spears and waist sabres. Chen Ce was killed; Tong Zhongkui was for breaking out and Qi Jin held him; both died there.
// (zh.wikipedia 渾河之戰 (1621年), after 明史 卷271, 明熹宗实录 卷7-8, 明史纪事本末补遗 卷2, 旧满洲档 张字档; the Gregorian day from
// the lunar date, ±1. Qin Bangping's 3,000 white-staff men: en.wikipedia Qin Liangyu.)
//
// The sides, scaled to what the game runs, the ratio kept: the camp's 5,000 (and a handful of Sichuan men) against the Jin
// army that surrounded it. Its size is given only as "tens of thousands" (数万); at the least reading of that, 20,000, it is
// 1 to 4. At about one man to 280: 18 in the camp and 68 round it.
// - Zhejiang men (3,000 of 5,000): 10, in the brigandine (outfits.js mingBrigandine, the cloth-faced coat standing for their thick
//   cotton armour), spears, sabres, a wolf-brush and a shield, and a folangji's crew; Qi Jin's men in his uncle's tradition, built and
//   trained as Qi Jiguang's (peoples.js PEOPLES.qi) and holding to his discipline.
// - Household troops (2,000): 6, the officers' own men in the elite's coat: Qi Jin, Tong Zhongkui and Chen Ce among them.
// - Sichuan survivors through the bridge: 2, in the levy's hemp vest, with the long spear (the white staff is a hooked spear; the
//   game's spear stands for it).
// - The Jin round the camp: 56 banner men on foot (the spears, sabres and guandao before, the archers behind) and 12 on horse
//   further out (the Bayara's kit, the game's one mounted Jurchen kit), all the colours.
// The camp's guns: two folangji in its carts' intervals, served by the Zhejiang and household men there (HUNRIVER.artillery),
// their charges running out as the day's powder did. What the game cannot show: the war carts (their line is the palisade's),
// and the Jin's own cannon (turned on the Sichuan camp, not this one). The river is five li from the camp, off this field.
// The approach: the camp stood five li (~2.9 km) from the river (浙兵布阵于浑河五里之外: zh.wikipedia 渾河之戰, after 明史 卷271);
// the Jin crossed it and came on across the open plain, surrounding the camp, and its guns fired on them "until the powder
// was gone". Here the battle opens with the Jin already round it, `formUp` m out (the walk across the plain under the guns'
// long fire is left out: at the drill's pace from the guns' 300 m reach it was six minutes of men walking), and they close
// on it under the guns' canister range; the battle's time is that short walk and the fight.
// The ground: the camp's two cart lines, on the main face and the rear, each with the gap the guns stand in; its sides
// open (the trench, the palisade's other faces and its daub are left out: a plain field fights faster, and its open sides
// make it the surrounded hand-to-hand fight the sources tell of). The hero is one of the camp's leaders, where his rank stands
// him. Whether he dies is the battle's: nothing here is tuned to an outcome.

import { bannerman, mingSoldier } from '../../cast.js';
import { BATTLE_END } from '../../battleend.js';
import { DRILL } from '../../formation.js';
import { seededRandom } from '../../physics.js';
import { northName, northPlace, northSides, northStyles } from './north.js';

// m from the camp's middle the Jin form up (above): inside the folangji's canister reach (some 100 m), and a minute and a
// quarter's walk at the drill's pace.
const HUNRIVER_FORM_UP = 60;
// s: the walk in from there at a drilled line's steady pace (formation.js DRILL).
const HUNRIVER_MARCH = Math.round(HUNRIVER_FORM_UP / DRILL.pace);

export const HUNRIVER = {
  year: 1621,
  formUp: HUNRIVER_FORM_UP,
  // The camp's men, each [unit, kit rank, style, x, z, part]: x toward the Jin's main side (+x, the river's), z across.
  camp: [
    // The Zhejiang men: four at the palisade on the main face, a folangji's crew of two behind them, the squad's leader; the side faces.
    ['zhejiang', 'brigandine', 'spear', 6.6, -4.5, 'front'], ['zhejiang', 'brigandine', 'langxian', 6.6, -1.5, 'front'],
    ['zhejiang', 'brigandine', 'swordShield', 6.6, 1.5, 'front'], ['zhejiang', 'brigandine', 'spear', 6.6, 4.5, 'front'],
    ['zhejiang', 'brigandine', 'dao', 6.1, -0.8, 'second'], ['zhejiang', 'brigandine', 'dao', 6.1, 0.8, 'second'],
    ['zhejiang', 'brigandine', 'dao', 4.4, 0, 'lead'],
    ['zhejiang', 'brigandine', 'spear', 3, -6.6, 'front'], ['zhejiang', 'brigandine', 'dao', -3, -6.6, 'front'],
    ['zhejiang', 'brigandine', 'spear', 0, 6.6, 'front'],
    // The household men: an officer's place behind the main face, a folangji's crew on the rear face; the commanders (named below).
    ['household', 'elite', 'guandao', 3.4, 1.6, 'officer'],
    ['household', 'elite', 'dao', -6.1, -0.8, 'front'], ['household', 'elite', 'dao', -6.1, 0.8, 'front'],
    ['household', 'elite', 'guandao', 3.4, -1.6, 'named:qiJin'], ['household', 'elite', 'swordShield', 0, 1.2, 'named:tong'],
    ['household', 'elite', 'guandao', -1.2, -1, 'named:chen'],
    // The Sichuan men who got in by the bridge.
    ['sichuan', 'garrison', 'spear', -6.6, 0, 'front'], ['sichuan', 'garrison', 'spear', -3, 6.6, 'front'],
  ],
  // The camp's guns (physics/artillery.js): "列置战车枪炮" (it set out war carts and guns), and "明军以火器射击，杀伤相枕" (its
  // guns' dead and wounded lay piled) until the powder was spent (zh.wikipedia 渾河之戰, after 明史 卷271 and 明熹宗实录). Qi
  // Jiguang's cart camp, in which Qi Jin's men were raised, carried two folangji on each war cart (练兵实纪 杂集, its cart camp
  // of ~3,100 men and 128 carts: one gun to ~12 men; the camp's 18 here, two guns). Each in a cart's interval (the palisade's gap)
  // on the main face and the rear, its crew of two the Zhejiang and household men there (`crew`: their places in `camp`),
  // loading canister for the Jin come within its reach. The camp's charges, `rounds` a gun, are an estimate (none is given).
  artillery: [
    { kind: 'folangji', at: [7, 0], facing: [1, 0], arc: 1.1, crew: [4, 5] },
    { kind: 'folangji', at: [-7, 0], facing: [-1, 0], arc: 1.1, crew: [11, 12] },
  ],
  named: {
    qiJin: { zh: '戚金', en: 'Qi Jin' },
    tong: { zh: '童仲揆', en: 'Tong Zhongkui' },
    chen: { zh: '陈策', en: 'Chen Ce' },
  },
  // Each unit's people (peoples.js PEOPLES) and coat (outfits.js designs).
  people: { zhejiang: 'qi', household: 'mingSouth', sichuan: 'mingSouth' },
  design: { brigandine: 0, elite: 0, garrison: 1 },
  // Qi Jiguang's discipline (as his own level's: scenarios.js qiJiguangLevel), the camp holding its ground (formation.js DRILL).
  discipline: 1,
  drill: { advance: false },
  // The Jin: the banner men in two rings round the camp (m from its middle) at the form-up line, the horse further out.
  banners: { spear: 18, dao: 9, guandao: 7, manchuBow: 22 },
  rings: [HUNRIVER_FORM_UP, HUNRIVER_FORM_UP + 3],
  inner: 30,
  bayara: { bayaraLance: 6, bayaraBow: 6 },
  horseRing: HUNRIVER_FORM_UP + 6.5,
  // The camp's works: its two cart lines (half the camp's side, m, from its middle: each line that long both ways across the
  // face; the carts' height; the gap in its middle the gun stands in, m wide).
  carts: { half: 7.5, height: 1.5, gap: 2 },
  // The plain round the camp out past the horse's ring.
  arena: { halfX: HUNRIVER_FORM_UP + 15, halfZ: HUNRIVER_FORM_UP + 15 },
  // The walk in from the form-up line, and the fight's five minutes.
  seconds: 300 + HUNRIVER_MARCH,
  view: {
    scene: 'sarhu',
    // A dry spring day on the Liaodong plain, the smoke of Shenyang's fall and the Sichuan camp's in the air.
    weather: { fog: [20, 110], sky: 0.65, pale: 0.7, sun: 0.8 },
    camera: { yaw: -0.5, pitch: 0.55, distance: 30, maxDistance: 40 },
  },
};

/** The two cart lines (on the main face, +x, and the rear), each with its gun's gap in the middle. */
function hunriverWorks() {
  const { half, height, gap } = HUNRIVER.carts;
  const gaps = [[half - gap / 2, half + gap / 2]];
  const line = (x) => ({ points: [[x, -half], [x, half]], height, kind: 'palisade', gaps });
  return { walls: [line(half), line(-half)] };
}

/** The camp's men, each in his place. */
function hunriverCamp(random) {
  const { camp, named, people, design } = HUNRIVER;
  return camp.map(([unit, rank, style, x, z, part]) => {
    const inputs = mingSoldier(random, style, rank, { people: people[unit], design: design[rank] });
    if (part.startsWith('named:')) {
      const name = named[part.slice(6)];
      return { inputs: { ...inputs, name: name.en }, name, at: [x, z], role: 'officer', unit, named: true };
    }
    // The officer's place behind the main face commands the Zhejiang men there (and the camp's others: its few, all his to hold).
    const leads = part === 'officer' ? ['zhejiang', 'household', 'sichuan'] : undefined;
    return { inputs, name: northName(inputs), at: [x, z], role: part, unit, ...(leads ? { leads } : {}) };
  });
}

/** The Jin round it: the banner men in two rings (the hand-to-hand men inside, the archers out), the horse beyond. */
function hunriverJin(random) {
  const { banners, rings, inner, bayara, horseRing } = HUNRIVER;
  const styles = northStyles(banners).sort((a, b) => (a === 'manchuBow') - (b === 'manchuBow'));
  const ring = (count, radius, offset = 0) => Array.from({ length: count }, (_, index) => {
    const angle = ((index + offset) / count) * Math.PI * 2;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
  const places = [...ring(inner, rings[0]), ...ring(styles.length - inner, rings[1], 0.5)];
  const foot = styles.map((style, index) => {
    const inputs = bannerman(random, style);
    return { inputs, name: northName(inputs), at: places[index] };
  });
  const riders = northStyles(bayara);
  const horsePlaces = ring(riders.length, horseRing, 0.25);
  const horse = riders.map((style, index) => {
    const inputs = bannerman(random, style, 'bayara', { mounted: true });
    return { inputs, name: northName(inputs), at: horsePlaces[index] };
  });
  return [...foot, ...horse];
}

export const BATTLE_HUNRIVER = {
  id: 'hunriver',
  n: 8,
  year: HUNRIVER.year,
  title: { zh: '浑河血战', en: 'The Hun River' },
  seconds: HUNRIVER.seconds,
  /** The Zhejiang camp (the hero among its leaders by his rank, his comrades beside him) and the Jin round it. */
  setup(life, seed = 1, options = {}) {
    const random = seededRandom(seed);
    const year = life.year ?? HUNRIVER.year;
    const red = hunriverCamp(random);
    const blue = hunriverJin(random);
    // His place: on the main face, where Qi Jin stood.
    const placed = northPlace(life, red, [4.4, 0], year);
    const { fighters, names, layouts } = northSides(red, blue);
    return {
      fighters,
      options: {
        seed,
        arena: { ...HUNRIVER.arena, works: hunriverWorks() },
        formation: {
          red: { front: 0, layout: layouts.red, loose: 0.1, drill: HUNRIVER.drill, discipline: HUNRIVER.discipline },
          blue: { front: 0, layout: layouts.blue, loose: 0.5 },
        },
        place: HUNRIVER.view.scene,
        climate: 'hunriver1621',
        // (Judged on strength left only after the walk in and the battle's own time: battleend.js.)
        timeLimit: BATTLE_END.timeLimit + HUNRIVER_MARCH,
        // (The camp is cast first: a crew man's place in `camp` is his fighter's index.)
        artillery: options.artillery === false ? [] : HUNRIVER.artillery,
      },
      view: HUNRIVER.view,
      ...placed,
      names,
    };
  },
};
