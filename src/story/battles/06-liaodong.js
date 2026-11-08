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
//   The southern regulars in brigandine (outfits.js mingBrigandine), built as the south's men (peoples.js PEOPLES.mingSouth).
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
import { storyDeployResolve } from '../deploy.js';

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
  // How the four squads may stand (the deploy screen's, src/story/deploy.js: the 哨长's choice, who leads the patrol; below
  // him it stands as the first). Each squad stands as Qi drew it up (MANDARIN_DUCK); what changes is where the squads are.
  //  - line: the four abreast, the whole patrol's front to the raiders (Qi's squads in the open field, side by side; the
  //    patrol as it stood before this screen).
  //  - support: two squads forward and two `supportGap` m behind them, in the same files: depth for width. A squad's wounded
  //    and blown men are relieved by the first fresh man behind them in their file (formation.js DRILL woundedAt, spentBelow),
  //    so the second line feeds the first fresh men; the front is half as wide, and the raiders' riders can lap round it.
  //    The gap: room for the forward squads' guns to fall back through them and stand DRILL.retireBehind (1 m) behind their
  //    rearmost man, and for a man going back past one coming up: a rank's pitch (2.4 m, as a column's: 07-sarhu.js).
  //  - square: the four squads back to back, each facing out (left, front, right, rear), the 哨长 in the middle: no flank
  //    to ride round, as the north's camps stood against horse (Qi's northern manual, 练兵实纪, draws its cart camp facing all
  //    four ways), at the cost of a quarter of the patrol to each face. `squareInside`: m from the middle to each squad's
  //    rearmost man (its leader), room for the 哨长 there and no squad's corner men in another's places (their outer brushes
  //    2.1 m out from their middles: a squad's back corner and the next squad's 1.9 m in are a full pace apart).
  supportGap: 2.4,
  squareInside: 1.9,
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

// A squad's depth (m): its leader's place behind its shields (MANDARIN_DUCK).
const LIAODONG_DEPTH = Math.max(...MANDARIN_DUCK.map(([, back]) => back));

/**
 * Where each squad stands in a formation (LIAODONG's line, support, square): its shields' middle `[x, z]` and the way it
 * faces (`face`: a unit [x, z], the raiders' way +x), and the 哨长's place. The squads are numbered from the line's left
 * (-z) to its right (+z): facing +x a man's right hand is +z (forward × up, as runner.js reads a line's right).
 */
export function liaodongSquads(formation = 'line') {
  const { squads, squadWidth, front, chief, supportGap, squareInside } = LIAODONG;
  const across = (k, count) => (k - (count - 1) / 2) * squadWidth;
  if (formation === 'support') {
    const behind = LIAODONG_DEPTH + supportGap;
    const placed = Array.from({ length: squads }, (_, k) => ({ at: [k < 2 ? front : front - behind, across(k % 2, 2)], face: [1, 0] }));
    return { squads: placed, chief: [front - behind - chief, 0] };
  }
  if (formation === 'square') {
    const half = LIAODONG_DEPTH + squareInside;
    const middle = [front - half, 0];
    // Left (-z), front (+x), right (+z), rear (-x): squad k's face.
    const faces = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    return { squads: faces.map((face) => ({ at: [middle[0] + face[0] * half, middle[1] + face[1] * half], face })), chief: middle };
  }
  return { squads: Array.from({ length: squads }, (_, k) => ({ at: [front, across(k, squads)], face: [1, 0] })), chief: [front - chief, 0] };
}

/** The patrol, man by man: each squad as Qi drew it up, where its formation stands it (liaodongSquads); its 哨长. */
function liaodongPatrol(random, formation = 'line') {
  const { squads, design, people } = LIAODONG;
  const plan = liaodongSquads(formation);
  const men = [];
  for (let squad = 0; squad < squads; squad += 1) {
    const { at: [x, z], face } = plan.squads[squad];
    // The squad's right hand (forward × up): +z facing +x.
    const right = [-face[1], face[0]];
    for (const [style, back, across] of MANDARIN_DUCK) {
      const inputs = mingSoldier(random, style, 'brigandine', { people, design });
      // His part: the shields and brushes in front, the spears and guns behind them, the rear pair, the leader at the back.
      const role = style === 'dao' ? 'lead' : back < 0.5 ? 'front' : back < 1.5 ? 'second' : 'rear';
      // A man `back` behind the shields stands that far against the squad's face, `across` to its left: the patrol as first
      // drawn stood MANDARIN_DUCK mirrored (its + across toward -z), and so it still does (a squad is near enough symmetric).
      men.push({ inputs, name: northName(inputs), at: [x - face[0] * back - right[0] * across, z - face[1] * back - right[1] * across], role, unit: squad });
    }
  }
  const head = mingSoldier(random, 'dao', 'brigandine', { people, design });
  men.push({ inputs: head, name: northName(head), at: plan.chief, role: 'officer', unit: 'chief', leads: Array.from({ length: squads }, (_, squad) => squad) });
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
  // The deploy screen (src/story/deploy.js): the patrol's formation and his place in it, a 哨长's to choose (he leads it).
  deploy: {
    formations: {
      from: 'shaozhang',
      default: 'line',
      options: [
        { id: 'line', name: { zh: '四队并列', en: 'Four abreast' }, note: { zh: '四个鸳鸯阵并排，全哨的正面对着他们。', en: 'The four mandarin-duck squads side by side: the whole patrol\'s front to the raiders.' } },
        { id: 'support', name: { zh: '两前两后', en: 'Two up, two back' }, note: { zh: '两队在前，两队在后同一列上接替伤者和力竭的人；正面窄了一半，骑兵能绕过来。', en: 'Two squads forward, two behind in the same files to relieve the hurt and the blown; half the front, and their riders can go round it.' } },
        { id: 'square', name: { zh: '四面方阵', en: 'Square' }, note: { zh: '四队背靠背各朝一面，哨长居中：没有可绕的侧翼，每面只有一队。', en: 'The squads back to back, one to each face, the platoon leader in the middle: no flank to ride round, one squad to a face.' } },
      ],
    },
    posts: {
      from: 'shaozhang',
      default: 'chief',
      options: [
        { id: 'chief', name: { zh: '阵后居中', en: 'Behind the middle' }, note: { zh: '哨长的位置：看得见全哨，全哨也看得见他。', en: 'The platoon leader\'s place: he sees the whole patrol, and it sees him.' } },
        { id: 'right', name: { zh: '右队队首', en: 'Right squad' }, note: { zh: '站在右边一队的队长位置上，带着它打。', en: 'In the right-hand squad\'s leader\'s place, fighting with it.' } },
        { id: 'left', name: { zh: '左队队首', en: 'Left squad' }, note: { zh: '站在左边一队的队长位置上，带着它打。', en: 'In the left-hand squad\'s leader\'s place, fighting with it.' } },
        { id: 'second', formations: ['support'], name: { zh: '后队', en: 'Second line' }, note: { zh: '和后面两队在一起，看准了再把他们送上去。', en: 'With the two squads behind, to send them up where the front needs them.' } },
      ],
    },
  },
  /** The patrol (the hero in it by his rank, or at the post he chose; his living comrades beside him) and the raiders, at a seed. */
  setup(life, seed = 1, options = {}) {
    const random = seededRandom(seed);
    const year = life.year ?? LIAODONG.year;
    const { formation, post } = storyDeployResolve(BATTLE_LIAODONG, life, options.deploy);
    const red = liaodongPatrol(random, formation);
    const blue = liaodongRaiders(random);
    // His squad: the second from the right of the line as it faces them (any squad would do; the middle ones are flanked by
    // friends); at a post he chose, the 哨长's place, or the leader's place of that post's squad (liaodongSquads' numbering:
    // the right the line's last squad, the square's right face, the support's forward right; the left squad 0; the second
    // line's left squad).
    const postSquad = { right: formation === 'square' ? 2 : formation === 'support' ? 1 : LIAODONG.squads - 1, left: 0, second: 2 }[post];
    const near = post === 'chief' ? liaodongSquads(formation).chief
      : postSquad !== undefined ? red.find((man) => man.unit === postSquad && man.role === 'lead').at
        : [LIAODONG.front, -(1 - (LIAODONG.squads - 1) / 2) * LIAODONG.squadWidth];
    const placed = northPlace(life, red, near, year, post ? { role: post === 'chief' ? 'officer' : 'lead' } : {});
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
      deploy: { formation, post },
      ...placed,
      names,
    };
  },
};
