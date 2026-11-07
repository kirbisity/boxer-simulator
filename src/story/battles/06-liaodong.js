// Story mode, Level 6 (autumn 1618): a skirmish on the Liaodong frontier. Nurhaci had declared his Seven Grievances and
// taken Fushun (May 1618) and Qinghe (August 1618); through the autumn his parties rode against the Ming's border forts,
// burning the harvest and taking men alive (捉生, "taking the living": the Later Jin's way of getting word of the Ming, the
// Ming's scouts, 夜不收, its quarry: Qi Meiqin 祁美琴, 《明清之际的"夜不收"与"捉生"》, 清史研究 2005.4, pp. 19-28). It was the
// season of the Ming's autumn watch (防秋), when the frontier expected raids. The southern troops called north for the
// coming campaign stood in the forts that autumn. A patrol (哨) goes out from one of them and meets such a party.
//
// A composite: this is no one recorded fight, but the kind the record of that autumn has many of (zh.wikipedia 抚清之战,
// 清河之战; the Ming Shilu's Wanli 46 entries). So no number is anyone's count of this day; each is a unit's size:
// - The patrol: one 哨 of the southern foot, four squads of twelve and its 哨长, 49 men. The squad of twelve is Qi Jiguang's
//   mandarin-duck squad (鸳鸯阵: two shields, two wolf-brushes, four spears, three fowling pieces and its leader as this game
//   draws it up, scenarios.js MANDARIN_DUCK); four squads to a 哨, 48 men and its chief ("四队为一哨，四哨为一官，四官为一总，
//   四总为一营": 《戚继光御倭的鸳鸯阵战术》, 文史知识 2015.9, p. 38, after the Jixiao xinshu 纪效新书). At full size: no scaling.
//   The southern regulars in brigandine (outfits.js mingBrigandine), built as the south's men (cast.js PERIOD_BUILD.mingSouth).
//   Their two scouts on horse have ridden back to the fort with the word: none on the field.
// - The raiders: a Later Jin party of a niru's men (a niru, 牛录, 300 men on its roll from 1601, never all out at once): a few
//   picked men on horse and the rest banner men come down off their horses to fight in their armour, as the Jurchen did. (The
//   riders wear the Bayara's kit, the banners' picked guard: the one mounted Jurchen kit the game has; banner armour does not ride.) No count survives for a party like this; forty, a
//   little under the patrol, is our assumption (a raiding party sent against a fort's patrol, not its walls).
// The ground: the frontier's hill country east of the Liao, a stream at the foot of a low rise; the raiders come down the rise
// and through the stream at the patrol. Nothing here is tuned to an outcome: the men are as cast, at the units' sizes.

import { bannerman, mingSoldier } from '../../cast.js';
import { seededRandom } from '../../physics.js';
import { MANDARIN_DUCK } from '../../scenarios.js';
import { northBlock, northName, northPlace, northSides, northStyles } from './north.js';

export const LIAODONG = {
  year: 1618,
  // The patrol: four squads side by side (m between their middles: the squads' outer brushes 0.7 m apart, as Qi's level stands
  // them), the shields' line `front` m from the middle of the field, the 哨长 `chief` m behind the middle of it.
  squads: 4,
  squadWidth: 4.9,
  front: -6,
  chief: 4.2,
  // One coat colour for the patrol's brigandine.
  design: 0,
  people: 'mingSouth',
  // The raiders: the banner men on foot, in loose rows on the rise (spacing, m), and the mounted Bayara on its two ends.
  banners: { spear: 9, dao: 7, guandao: 4, manchuBow: 14 },
  bayara: { bayaraBow: 4, bayaraLance: 2 },
  raiders: { at: [16, 0], perRow: 12, spacing: 2.0, rowSpacing: 2.2 },
  riders: { x: 20, z: 12, spacing: 2.5 },
  // The patrol forms its squads to receive them and holds (formation.js DRILL: the squads fight each man near his place, the
  // guns hold their fire until close), as Qi's drill had it.
  drill: { advance: false, squad: true, holdFire: true },
  // The ground: a rise (`ridge`: m in x where it starts and where it tops out, its height) and a stream at its foot (`stream`:
  // x from-to; shin-deep, its gravel bed firm under a little silt: soft ground as physics/fieldworks.js meets it).
  ridge: { from: 7, top: 15, height: 2.2 },
  stream: { x: [1, 3.5], depth: 0.08, firm: 0.15, viscosity: 1.2, footing: 0.8, surface: 'mud', edge: 0.6, water: 0.25 },
  arena: { halfX: 30, halfZ: 16 },
  seconds: 180,
  view: {
    scene: 'sarhu',
    // An overcast autumn day in the hills, a little haze on the far ridges.
    weather: { fog: [30, 140], sky: 0.7, pale: 0.6, sun: 0.75 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 26, maxDistance: 34 },
  },
};

/** The rise and the stream: the ridge a long bank across the field (its profile in x), the stream soft ground at its foot. */
function liaodongWorks() {
  const { ridge, stream, arena } = LIAODONG;
  // A straight bank along z (its left is +x), its profile the rise's height across it, flat on top to the field's end.
  const ditches = [{ from: [ridge.from, -arena.halfZ - 1], to: [ridge.from, arena.halfZ + 1], profile: [[0, 0], [ridge.top - ridge.from, ridge.height], [arena.halfX + 2 - ridge.from, ridge.height]] }];
  return { ditches, soft: [{ ...stream, z: [-arena.halfZ - 1, arena.halfZ + 1] }] };
}

/** The patrol, man by man: each squad as Qi drew it up, facing +x; its 哨长 behind. */
function liaodongPatrol(random) {
  const { squads, squadWidth, front, chief, design, people } = LIAODONG;
  const men = [];
  for (let squad = 0; squad < squads; squad += 1) {
    const middle = (squad - (squads - 1) / 2) * squadWidth;
    for (const [style, back, across] of MANDARIN_DUCK) {
      const inputs = mingSoldier(random, style, 'brigandine', { people, design });
      // His part: the shields and brushes in front, the spears and guns behind them, the rear pair, the leader at the back.
      const role = style === 'dao' ? 'lead' : back < 0.5 ? 'front' : back < 1.5 ? 'second' : 'rear';
      // Red faces +x from -x: a man `back` behind the front stands further toward -x; `across` is to the squad's right (-z facing +x).
      men.push({ inputs, name: northName(inputs), at: [front - back, middle - across], role, unit: squad });
    }
  }
  const head = mingSoldier(random, 'dao', 'brigandine', { people, design });
  men.push({ inputs: head, name: northName(head), at: [front - chief, 0], role: 'officer', unit: 'chief', leads: Array.from({ length: squads }, (_, squad) => squad) });
  return men;
}

/** The raiders: the banner men on foot in loose rows on the rise, the Bayara on horse at its two ends. */
function liaodongRaiders(random) {
  const { banners, bayara, raiders, riders } = LIAODONG;
  const foot = northStyles(banners).map((style) => bannerman(random, style));
  const places = northBlock(foot.length, { ...raiders });
  const men = foot.map((inputs, index) => ({ inputs, name: northName(inputs), at: places[index] }));
  northStyles(bayara).forEach((style, index) => {
    const inputs = bannerman(random, style, 'bayara', { mounted: true });
    const side = index % 2 ? -1 : 1;
    men.push({ inputs, name: northName(inputs), at: [riders.x + Math.floor(index / 2) * riders.spacing, side * riders.z] });
  });
  return men;
}

export const BATTLE_LIAODONG = {
  id: 'liaodong',
  n: 6,
  year: LIAODONG.year,
  title: { zh: '辽东边哨', en: 'A Patrol on the Liaodong Frontier' },
  seconds: LIAODONG.seconds,
  /** The patrol (the hero in it by his rank, his living comrades beside him) and the raiders, at a seed. */
  setup(life, seed = 1) {
    const random = seededRandom(seed);
    const year = life.year ?? LIAODONG.year;
    const red = liaodongPatrol(random);
    const blue = liaodongRaiders(random);
    // His squad: the second from the right of the line as it faces them (any squad would do; the middle ones are flanked by friends).
    const near = [LIAODONG.front, -(1 - (LIAODONG.squads - 1) / 2) * LIAODONG.squadWidth];
    const placed = northPlace(life, red, near, year);
    const { fighters, names, layouts } = northSides(red, blue);
    return {
      fighters,
      options: {
        seed,
        arena: { ...LIAODONG.arena, works: liaodongWorks() },
        formation: {
          red: { front: 0, layout: layouts.red, loose: 0.08, drill: LIAODONG.drill },
          blue: { front: 0, layout: layouts.blue, loose: 0.6 },
        },
        place: LIAODONG.view.scene,
        climate: 'liaodong1618',
      },
      view: LIAODONG.view,
      ...placed,
      names,
    };
  },
};
