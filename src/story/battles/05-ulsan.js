// Chapter 5, winter 1597-98: the siege of Ulsan (蔚山之战; in the Ming calendar Wanli 25, the twelfth month). Katō
// Kiyomasa's garrison in the unfinished Japanese castle on Dosan (岛山, Tosan), the Ming and Joseon army storming its
// inner wall up the hill, in the cold.
//
// The history (sources):
//  - Yang Hao and Ma Gui (Ming) with Gwon Yul (Joseon) marched on Ulsan with ~50,000: ~40,000 Ming, ~10,000 Joseon.
//    The garrison under Katō Kiyomasa and Asano Yoshinaga: ~10,000 (Hawley; Japanese sources 20,000-23,000).
//    29 January 1598: a feigned retreat drew the garrison out, ~500 Japanese lost, the rest back into Dosan.
//    30 January: the outer wall taken after a bombardment; the allies held part of the inner wall for a time, with
//    heavy losses, and the assault was called off; a siege followed, a last assault on 19 February was thrown back, and
//    with Japanese relief coming Yang Hao withdrew. Ming losses 1,621 dead (798 in battle, 823 of wounds), 2,908
//    wounded. The castle was too high for the allied guns to reach. (Wikipedia, "Siege of Ulsan".)
//  - The Zhejiang troops (浙兵) of Mao Guoqi (茅国器) and Chen Yin's (陈寅) men broke the outer works; the hill was
//    higher than Ulsan town, the stone castle strong, and the Ming attacking uphill lost many (Mingshi 320, as
//    summarised; Wu Weizhong and Mao Guoqi covered the withdrawal: Mingshi 259).
//  - The castle: stone walls, the infobox's height 6 m (Wikipedia, "Ulsan Castle"); a Japanese castle's walls are battered
//    stone, the wall-top narrow. The defenders went short of water and food over the weeks of the siege (they drank
//    horses' blood, chewed paper: Japanese accounts, as summarised by the sources above); at the first assault of 30
//    January that had not yet set in: they are cast as fed men.
//  - The cold: WORLD.heat.climates.ulsan (physics/config.js): Ulsan's January mean ~2 °C less the Little Ice Age's.
//
// Numbers: the army's 4 : 1 (40,000 Ming against ~10,000) on one stretch of the inner wall: 64 Ming (three ladder
// columns of 18 - the middle one southern troops, the flanks northern regulars in brigandine -, eight gunners, two
// officers) against 16 of Katō's men on the wall (7 matchlocks - the Japanese castle was held by its guns -, 2 bows,
// 4 yari, 3 samurai). 80 men. The Joseon fifth of the army: the game has no Joseon soldier's kit (cast.js: none), so
// it is left out; the Ming alone keep the ratio.
//
// The ground: the hill's slope up to the wall (relief: ~3.5 m over the last 14 m, a 25% grade), the wall 6 m from its
// foot, ladders at three places (story/ground/walls.js: what it leaves out is said there). No gate: the inner castle's
// gates were not forced.
//
// The hero: in the middle (southern) column, its first row as a soldier in front, behind as his place says; a squad
// leader at its flank; an officer behind with the guns. His comrades in the places nearest his.

import { mingSoldier, sengokuWarrior } from '../../cast.js';
import { seededRandom } from '../../physics.js';
import { mergeWorks, wallWorks } from '../ground/walls.js';
import { koreaAssemble, koreaRowOf, koreaRows, koreaSeat } from './korea.js';

export const ULSAN_1598 = {
  year: 1598,
  arena: { halfX: 18, halfZ: 9 },
  // The hill below the wall: from `from` m (x) rising to `base` m at the wall's foot (x = wall.x).
  slope: { from: -14, base: 3.5 },
  wall: { x: 0, height: 6, walk: 2.5, ladders: [-5, 0, 5] },
  // A column: four abreast, rows behind (as at Pyongyang); its first row 6 m below the wall's foot on the slope.
  column: { abreast: 4, spacing: 1.3, rowSpacing: 1.6, front: -6 },
  southern: ['swordShield', 'swordShield', 'swordShield', 'swordShield', 'spear', 'spear', 'spear', 'spear', 'langxian', 'dao', 'dao', 'langxian', 'spear', 'spear', 'spear', 'spear', 'dao', 'dao'],
  northern: ['swordShield', 'swordShield', 'swordShield', 'swordShield', 'spear', 'spear', 'spear', 'spear', 'dao', 'dao', 'dao', 'dao', 'spear', 'spear', 'spear', 'spear', 'dao', 'dao'],
  guns: { count: 8, x: -14, from: -7, to: 7 },
  officers: [[-15, -2], [-15, 2]],
  defenders: {
    front: [['yari', -5.6], ['yari', -4.4], ['yari', -0.6], ['yari', 0.6], ['matchlock', 4.4], ['matchlock', 5.6], ['matchlock', -8], ['matchlock', -2.5], ['bow', -2], ['matchlock', 2.5], ['bow', 2], ['matchlock', 8], ['matchlock', -7]],
    back: [['katana', -5], ['naginata', 0], ['katana', 5]],
    frontAt: 0.4,
    backAt: 1.7,
  },
  rows: { front: [-6, -0.65], second: [-7.6, -0.65], rear: [-12.4, -0.65], squadLeader: [-7.6, 1.95], officer: [-15, 2] },
  // Katō's men under his colours: black lacquer, white (scenarios.js's sides carry no Katō: a plain dark tint).
  colours: { tint: { armor: '#18181c', lace: '#d8d4c8' }, banner: '#e8e4dc' },
  design: { mingBrigandine: 3, mingElite: 5, mingGarrison: 0 },
};

export const ulsanBattle = {
  id: 'ulsan',
  n: 5,
  year: ULSAN_1598.year,
  title: { zh: '蔚山', en: 'Ulsan' },
  view: { scene: 'sarhu', weather: { fog: [12, 100], sky: 0.55, pale: 0.65, sun: 0.6 }, camera: { yaw: -0.9, pitch: 0.36, distance: 24, maxDistance: 32 } },
  seconds: 180,
  setup(life, seed = 1) {
    const random = seededRandom(seed);
    const spec = ULSAN_1598;
    const { wall, slope } = spec;
    const halfZ = spec.arena.halfZ + 0.5;
    const { works: wallPart, walk } = wallWorks({ x: wall.x, z: [-halfZ, halfZ], height: wall.height, base: slope.base, walk: wall.walk, ladders: wall.ladders });
    // The slope: a ditch along z whose profile rises from 0 at `from` to `base` at the wall's foot (its left, +x).
    const hill = { from: [slope.from, -halfZ], to: [slope.from, halfZ], profile: [[0, 0], [wall.x - slope.from, slope.base]] };
    const works = mergeWorks(wallPart, { ditches: [hill] });
    const red = { men: [], places: [] };
    const add = (part) => {
      red.men.push(...part.men);
      red.places.push(...part.places);
    };
    const ming = (people) => (style, rank = 'brigandine') => mingSoldier(random, style, rank, { people, design: spec.design[rank === 'elite' ? 'mingElite' : 'mingBrigandine'] });
    for (const z of wall.ladders) {
      const southern = z === 0;
      add(koreaRows({ at: [spec.column.front, z], styles: southern ? spec.southern : spec.northern, abreast: spec.column.abreast, spacing: spec.column.spacing, rowSpacing: spec.column.rowSpacing, make: ming(southern ? 'qi' : 'ming') }));
    }
    const gunsAt = (k) => spec.guns.from + ((spec.guns.to - spec.guns.from) * k) / (spec.guns.count - 1);
    for (let k = 0; k < spec.guns.count; k += 1) add({ men: [ming('ming')('matchlock')], places: [[spec.guns.x, gunsAt(k)]] });
    for (const at of spec.officers) add({ men: [ming('qi')('dao', 'elite')], places: [at] });
    const seated = koreaSeat(life, red, { at: koreaRowOf(life, spec.rows), year: spec.year, design: spec.design });
    const blue = { men: [], places: [] };
    const rank = (style) => (style === 'katana' || style === 'naginata' ? 'samurai' : 'ashigaru');
    for (const [style, z] of spec.defenders.front) {
      blue.men.push(sengokuWarrior(random, spec.colours, style, rank(style)));
      blue.places.push([walk[0] + spec.defenders.frontAt, z]);
    }
    for (const [style, z] of spec.defenders.back) {
      blue.men.push(sengokuWarrior(random, spec.colours, style, 'samurai'));
      blue.places.push([walk[0] + spec.defenders.backAt, z]);
    }
    const built = koreaAssemble({ red, blue, heroCorner: 'red', hero: seated.hero, comrades: seated.comrades });
    const slot = red.places[seated.hero];
    return {
      fighters: built.fighters,
      options: {
        seed,
        arena: { ...spec.arena, works },
        // The air of Ulsan in the siege's winter (WORLD.heat.climates.ulsan).
        place: 'ulsan',
        formation: {
          red: { front: 0, layout: built.layouts.red },
          blue: { front: 0, layout: built.layouts.blue, drill: { advance: false } },
        },
      },
      player: built.player,
      comrades: built.comrades,
      slot: { x: slot[0], z: slot[1] },
    };
  },
};
