// Chapter 2, c. 1588: a raid from the sea on a Zhejiang water town, met by a company of southern soldiers drilled in Qi
// Jiguang's mandarin-duck squads (鸳鸯阵), the hero among them.
//
// The history, and what is assumed:
//  - By the 1580s the great raids of the 1550s were over: the Ming eased the sea ban in 1567 (trade by licence from
//    Yuegang), Qi Jiguang and Yu Dayou had broken the big bands by 1565, and in 1588 Toyotomi Hideyoshi forbade piracy
//    from Japan (the "sword hunt" year's edict). Small raids went on along the coast. No particular raid of 1588 on
//    Zhejiang was found in the sources checked: this one stands for them, and its numbers are assumed (a few boats'
//    band against a company post), not recorded. (Wikipedia, "Jiajing wokou raids"; "Haijin"; Hideyoshi's 1588 edict:
//    Wikipedia "Wokou", "Sword hunt".) The writer's chapter should say "a raid", not name one.
//  - The bands of the later years were mostly Chinese, the Japanese a stiffening of swordsmen (Qi Jiguang's own
//    accounts of Taizhou, 1561; scenarios.js WOKOU.raiders, the Taizhou band's mix, kept here in its proportions).
//  - The defenders: a southern company drilled as Qi drilled his Yiwu men (Jixiao xinshu 纪效新书): squads of twelve,
//    two shields, two wolf-brushes (langxian 狼筅), four spears, three fowling pieces, the leader at the back
//    (scenarios.js qiJiguangLevel: its squad layout, drill and discipline, reused). No trench: a raid is not waited for.
//
// Numbers (assumed, stated): thirty-six raiders (the Taizhou mix ×1.4: 4 rōnin, 13 Japanese, 19 Chinese) against three
// squads (36), 1 : 1, 72 men. The water town of the wokou levels (scene 'jiangnan', its morning mist).
//
// The hero: in his squad's place by his rank (life.rank) and place in the line (life.place): a soldier in the front
// rank holds a shield (藤牌, the rattan shield and the dao), in the second a spear, at the back the rear spears; a squad
// leader at the squad's back with the dao (the Jixiao xinshu's 队长); an officer behind the company. His living comrades
// take the places of his squad nearest his, closest bond first, each with his place's weapon.

import { roninWarrior, wokouRaider } from '../../cast.js';
import { seededRandom } from '../../physics.js';
import { qiJiguangLevel, WEATHER_MIST } from '../../scenarios.js';
import { koreaAssemble, koreaHeroKit, KOREA_KIT, koreaFighter, koreaComrades, koreaKitFor, koreaStandIn } from './korea.js';

export const WOKOU_1588 = {
  year: 1588,
  // The raiders (rōnin, Japanese, Chinese), in the Taizhou band's proportions scaled to 36.
  raiders: { ronin: { ronin: 4 }, japanese: { katana: 9, odachi: 4 }, chinese: { dao: 10, spear: 9 } },
  squads: 3,
  // The squads' front (m from the middle of the square); the raiders' as far the other way (Qi's level drawn apart: 8 × 1.5).
  front: 12,
  // The square between the shops and the canal, lengthened as Qi's battle has it (scenarios.js SPREAD.room jiangnan).
  arena: { halfX: 18, halfZ: 9 },
  // The raiders as they come on: a loose crowd nine abreast (scenarios.js WOKOU_RAIDERS_ORDER).
  raiderOrder: { spacing: 1.3, rowSpacing: 1.6, perRow: 9, loose: 0.5 },
  // The squad's slot (index in Qi's squad of twelve) for each place: front the left shield, second a first-row spear,
  // rear a second-row spear, the squad leader his own place at the back.
  slot: { front: 0, second: 7, rear: 9, squadLeader: 11 },
  // An officer stands behind the middle squad (m behind its leader).
  officerBack: 2,
  // The squads' colours (scenarios.js QI.design: the red-laced lamellar, the household's crimson).
  design: { mingBrigandine: 3, mingElite: 5, mingGarrison: 0 },
};

/** Qi's squad of twelve: each man's [style, back, across] about his squad's middle (from qiJiguangLevel's layout). */
function koreaSquad() {
  const level = qiJiguangLevel({ trench: false });
  const styles = level.cast(() => 0.5).blue.map((man) => man.style);
  const layout = level.formation.blue.layout;
  const middle = -2.45;
  return { drill: level.formation.blue.drill, discipline: level.formation.blue.discipline, squad: layout.slice(0, 12).map(([back, across], index) => [styles[index], back, across - middle]) };
}

export const wokouBattle = {
  id: 'wokou',
  n: 2,
  year: WOKOU_1588.year,
  title: { zh: '倭寇犯境', en: 'Raiders from the sea' },
  // What the engine draws it in (render.js place, its mist).
  view: { scene: 'jiangnan', weather: { fog: WEATHER_MIST.wokou, sky: 0.75, pale: 0.7, mistLine: [-1, 7], sun: 0.85 }, camera: { yaw: -0.5, pitch: 0.42, distance: 22, maxDistance: 28 } },
  seconds: 180,
  setup(life, seed = 1) {
    const random = seededRandom(seed);
    const spec = WOKOU_1588;
    const { squad, drill, discipline } = koreaSquad();
    // Raiders: the Japanese at the front, the rōnin among them, the Chinese behind (scenarios.js wokouRaiders' order).
    const japanese = [...Object.entries(spec.raiders.ronin).flatMap(([style, n]) => Array.from({ length: n }, () => roninWarrior(random, style))), ...Object.entries(spec.raiders.japanese).flatMap(([style, n]) => Array.from({ length: n }, () => wokouRaider(random, style, 'japanese')))];
    const chinese = Object.entries(spec.raiders.chinese).flatMap(([style, n]) => Array.from({ length: n }, () => wokouRaider(random, style, 'chinese')));
    // The company: three squads side by side, each man at his place (blue, at +x: x = front + back, z = across).
    const men = [];
    const places = [];
    for (let s = 0; s < spec.squads; s += 1) {
      const middle = (s - (spec.squads - 1) / 2) * 4.9;
      for (const [style, back, across] of squad) {
        men.push(koreaStandIn(random, style, 'mingBrigandine', { people: 'qi', design: spec.design }));
        places.push([spec.front + back, middle + across]);
      }
    }
    // His squad: the middle one. His place by rank and place in the line.
    const first = Math.floor(spec.squads / 2) * 12;
    const kit = koreaHeroKit(life);
    let heroIndex;
    if (life.rank === 'officer') {
      heroIndex = men.length;
      men.push(null);
      places.push([spec.front + squad[11][1] + spec.officerBack, 0]);
    } else heroIndex = first + (spec.slot[life.rank === 'squadLeader' ? 'squadLeader' : life.place] ?? spec.slot.front);
    const heroStyle = life.rank === 'officer' ? 'dao' : squad[heroIndex - first][0];
    men[heroIndex] = koreaFighter(life.hero, { year: spec.year, kit: koreaKitFor(kit, men[heroIndex]?.outfit?.kind), style: heroStyle, design: spec.design });
    // His comrades in the places of his squad nearest his.
    const at = places[heroIndex];
    const near = Array.from({ length: 12 }, (_, k) => first + k).filter((index) => index !== heroIndex).sort((a, b) => Math.hypot(places[a][0] - at[0], places[a][1] - at[1]) - Math.hypot(places[b][0] - at[0], places[b][1] - at[1]));
    const comrades = {};
    for (const [k, comrade] of koreaComrades(life).slice(0, near.length).entries()) {
      const index = near[k];
      men[index] = koreaFighter(comrade, { year: spec.year, kit: koreaKitFor(KOREA_KIT[comrade.rank] ?? 'mingGarrison', men[index].outfit?.kind), style: squad[index - first][0], design: spec.design });
      comrades[comrade.id] = index;
    }
    const built = koreaAssemble({ red: { men: [...japanese, ...chinese], places: [] }, blue: { men, places }, heroCorner: 'blue', hero: heroIndex, comrades });
    return {
      fighters: built.fighters,
      options: {
        seed,
        arena: spec.arena,
        place: 'jiangnan',
        formation: {
          red: { front: spec.front, ...spec.raiderOrder },
          blue: { front: 0, layout: built.layouts.blue, loose: 0.1, drill, discipline },
        },
      },
      player: built.player,
      comrades: built.comrades,
      slot: { x: at[0], z: at[1] },
      // The men of his squad, nearest him first (a file leader orders the nearest four, a squad leader all eleven), and the
      // man over him: his squad's leader, while he is under one (the runner reads his fall as a place opened).
      squad: near.map((index) => built.fighters.length - men.length + index),
      ...(life.rank === 'soldier' ? { superior: built.fighters.length - men.length + first + spec.slot.squadLeader } : {}),
    };
  },
};
