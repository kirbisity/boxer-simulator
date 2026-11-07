// Chapter 3, 8 February 1593 (Wanli 21, the first month, the 8th day): the storming of Pyongyang's walls. The southern
// troops (南兵, the Zhejiang men of Qi Jiguang's drill) go up the ladders against Konishi Yukinaga's garrison.
//
// The history (sources):
//  - Li Rusong's army, ~43,000 Ming with 200+ guns, with ~10,000 Joseon troops and Hyujeong's 4,200 monks, against
//    Konishi's garrison (estimates 15,000-30,000; ~15,000 the usual figure). Wikipedia, "Siege of Pyongyang (1593)",
//    after Swope, A Dragon's Head and a Serpent's Tail (2009).
//  - 8 February: the gates pounded by the guns; the walls rushed with ladders. Li Rusong offered 5,000 taels of silver
//    to the first man up (先登上城牆的人，賞賜白銀五千兩); Luo Shangzhi (骆尚志), commanding southern troops, went up
//    first at the Hamgu gate (含毬门) with a long halberd (zh.wikipedia, 平壤之战 (1593年)). Wu Weizhong (吴惟忠), the
//    Yiwu officer of Qi's army who led the southern troops, attacked the Moranbong heights (牡丹峰) and was hit in the
//    chest and fought on (Mingshi 238: 中炮伤胸，犹奋呼督战; the Yiwu gazetteer has it in his left side).
//  - Afterwards the credit went to the northern troops and the promised silver was not paid to the southern men: a cause
//    of their bitterness and of the Shimen camp mutiny of 1595 (孙卫国, 万历乙未蓟镇石门寨兵变新考, aisixiang.com/data/178712).
//  - Ming losses 796 killed, 1,492 wounded; the Japanese lost some 1,300-1,700 in the fighting and left the city that
//    night over the frozen Daedong.
//  - The wall's height is not given in the sources checked; Joseon stone town walls ran ~4-6 m (Seoul's 5-8). Here 4.5 m.
//
// Numbers: one stretch of wall. The southern troops at three ladders, against the stretch's defenders: 60 Ming
// (three ladder columns of 17 - shields, spears, dao, wolf-brushes as Qi armed his squads -, eight fowling pieces behind,
// an officer) against 18 Japanese (8 guns and bows, 6 yari, 4 samurai), 3.3 : 1, as the whole army's 43,000 against
// ~15,000 (2.9 : 1; with the Joseon, 3.8). 78 men. The Joseon and the monks fought on other faces (the southwest, the
// northern hill): not on this stretch. Li Rusong's horse (Liaodong cavalry) was at the gates, not at the ladders.
//
// The hero: in the middle ladder's column, in its first row as a soldier in front (the shields go up first under
// cover), the second or the last as his place says; a squad leader at the column's flank; an officer behind it with
// the guns. His living comrades in the places nearest his.

import { mingSoldier, sengokuWarrior } from '../../cast.js';
import { seededRandom } from '../../physics.js';
import { wallWorks } from '../ground/walls.js';
import { koreaAssemble, koreaRowOf, koreaRows, koreaSeat, koreaStyles } from './korea.js';

export const PYONGYANG_1593 = {
  year: 1593,
  wall: { x: 1, height: 4.5, ladders: [-6, 0, 6] },
  arena: { halfX: 15, halfZ: 9 },
  // A ladder's column: four abreast, 1.3 m apart (room to run with a shield; packed to a metre they trip on each other
  // as they set off), rows 1.6 m behind each other; the first row 8 m out from the wall's foot (the last of the run in
  // under fire), the shields first.
  column: { styles: ['swordShield', 'swordShield', 'swordShield', 'swordShield', 'spear', 'spear', 'spear', 'spear', 'langxian', 'dao', 'dao', 'langxian', 'spear', 'spear', 'spear', 'spear', 'dao'], abreast: 4, spacing: 1.3, rowSpacing: 1.6, front: -7 },
  // The fowling pieces behind the columns, shooting at the walk; the column's officer (a 把总) with them.
  guns: { count: 8, x: -12, from: -7, to: 7 },
  officer: [-11.5, 0],
  // The garrison on this stretch of the walk: shooters along the parapet between the ladders, yari at each ladder's
  // head, samurai behind them.
  defenders: {
    front: [['yari', -6.6], ['yari', -5.4], ['yari', -0.6], ['yari', 0.6], ['yari', 5.4], ['yari', 6.6], ['matchlock', -8.2], ['bow', -3.8], ['matchlock', -3], ['bow', -2.2], ['matchlock', 2.2], ['bow', 3], ['matchlock', 3.8], ['matchlock', 8.2]],
    back: [['katana', -6], ['naginata', -1], ['katana', 1], ['spear', 6]],
    // m behind the walk's outer edge.
    frontAt: 0.45,
    backAt: 1.9,
  },
  // Where a man of each rank and place stands in the middle column ([x, z]).
  rows: { front: [-7, -0.65], second: [-8.6, -0.65], rear: [-13.4, 0], squadLeader: [-8.6, 1.95], officer: [-11.5, 0] },
  // The southern troops' discipline (ai.js AI.morale; scenarios.js QI_DISCIPLINE): Qi Jiguang's law and drill, in
  // which Wu Weizhong's and Luo Shangzhi's men were raised.
  discipline: 1,
  // The Japanese army's colours at Pyongyang (scenarios.js SEKIGAHARA_WEST: black and blue).
  japanese: { tint: { armor: '#1c2030', lace: '#2a4a9a' }, banner: '#1f3f8a' },
  design: { mingBrigandine: 3, mingElite: 5, mingGarrison: 0 },
};

export const pyongyangBattle = {
  id: 'pyongyang',
  n: 3,
  year: PYONGYANG_1593.year,
  title: { zh: '平壤登城', en: 'The walls of Pyongyang' },
  view: { scene: 'sengoku', camera: { yaw: -0.9, pitch: 0.38, distance: 22, maxDistance: 30 } },
  seconds: 180,
  setup(life, seed = 1) {
    const random = seededRandom(seed);
    const spec = PYONGYANG_1593;
    const { works, walk } = wallWorks({ x: spec.wall.x, z: [-spec.arena.halfZ - 0.5, spec.arena.halfZ + 0.5], height: spec.wall.height, ladders: spec.wall.ladders });
    const southern = (style, rank = 'brigandine') => mingSoldier(random, style, rank, { people: 'qi', design: spec.design[rank === 'elite' ? 'mingElite' : 'mingBrigandine'] });
    const red = { men: [], places: [] };
    const add = (part) => {
      red.men.push(...part.men);
      red.places.push(...part.places);
    };
    for (const z of spec.wall.ladders) add(koreaRows({ at: [spec.column.front, z], styles: spec.column.styles, abreast: spec.column.abreast, spacing: spec.column.spacing, rowSpacing: spec.column.rowSpacing, make: (style) => southern(style) }));
    const gunsAt = (k) => spec.guns.from + ((spec.guns.to - spec.guns.from) * k) / (spec.guns.count - 1);
    for (let k = 0; k < spec.guns.count; k += 1) add({ men: [southern('matchlock')], places: [[spec.guns.x, gunsAt(k)]] });
    add({ men: [southern('dao', 'elite')], places: [spec.officer] });
    const seated = koreaSeat(life, red, { at: koreaRowOf(life, spec.rows), year: spec.year, design: spec.design });
    const blue = { men: [], places: [] };
    const rank = (style) => (style === 'katana' || style === 'naginata' || style === 'spear' ? 'samurai' : 'ashigaru');
    for (const [style, z] of spec.defenders.front) {
      blue.men.push(sengokuWarrior(random, spec.japanese, style, rank(style)));
      blue.places.push([walk[0] + spec.defenders.frontAt, z]);
    }
    for (const [style, z] of spec.defenders.back) {
      blue.men.push(sengokuWarrior(random, spec.japanese, style, 'samurai'));
      blue.places.push([walk[0] + spec.defenders.backAt, z]);
    }
    const built = koreaAssemble({ red, blue, heroCorner: 'red', hero: seated.hero, comrades: seated.comrades });
    const slot = red.places[seated.hero];
    return {
      fighters: built.fighters,
      options: {
        seed,
        arena: { ...spec.arena, works },
        place: 'pyongyang',
        formation: {
          red: { front: 0, layout: built.layouts.red, discipline: spec.discipline },
          // The garrison holds the walk (formation.js drill, advance false): each man at his place, fighting whoever comes up to it.
          blue: { front: 0, layout: built.layouts.blue, drill: { advance: false } },
        },
      },
      player: built.player,
      comrades: built.comrades,
      slot: { x: slot[0], z: slot[1] },
    };
  },
};
