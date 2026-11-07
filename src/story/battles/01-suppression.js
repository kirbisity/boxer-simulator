// Story mode, Level 1 (c. 1587): the "bandit" suppression. The famine of the Wanli fifteenth and sixteenth years (1587-88) drove
// the hungry of the Yangtze delta and Zhejiang onto the roads; a gentleman frightened by a column of them reports bandits, and a
// garrison company is sent out to put them down. They are not bandits: starving families on the move, a few men with a carrying
// pole or a sickle, nobody drilled. The hero is a new spearman of the company, in its line. (The event's record and the famine's:
// src/story/text/sources.md, the writer's; the chapter is the user's story, an event of a kind the record has many of.)
//
// The sides, as they were, scaled to what the game runs (about ninety men), the ratio kept:
// - The garrison company: the Ming weisuo's hundred-household company (百户所), 112 men on paper, two banner-chiefs (总旗) and
//   ten small-banner chiefs (小旗) over ten-man files (Mingshi 明史, 兵志二, 卫所: "百十有二人为百户所，所设总旗二，小旗十").
//   At one man in four: 28. Its arms the garrison's (Ming huidian 会典 issue for weisuo men: the long spear, the waist sabre,
//   the bow): spears in the front ranks, sabres and bows behind; a few riders, the company commander (百户) and his household
//   men, for a southern garrison had few horses. Its kit the garrison's padded coat (outfits.js mingGarrison), its men
//   built as the south's (peoples.js PEOPLES.mingSouth). Drawn up in ranks and walked at them (formation.js drill).
// - The refugees: no count survives for an event like this; a column of famine refugees from a few villages ran to some
//   hundreds, most of them women, children and the old. Its men of an age to stand against a company: about 240, two to
//   each soldier. At the same one in four: 60. Starved (cast.js starvedRebel: a BMI of 14-15.5, which takes their strength
//   and wind), untrained (skill 0.05-0.2), most bare-handed; some with the carrying pole they walked with (WEAPONS staff) or
//   a sickle (the nearest blade the game has is the knife: WEAPONS knife, a short edge on a short haft, as a sickle's is).
//   A crowd, not a line. Their courage is a starving man's own (no `desperate` here: they are not rebels; they break and run).
// - The ground: the dry plain of a drought year, with the bed of a stream gone to mud behind the refugees (they had come down
//   to it for water): soft ground as physics/fieldworks.js meets it.
// Nothing here is tuned to an outcome: the men are as cast, the ratio as stated.

import { normaliseInputs } from '../../body.js';
import { mingHorseman, mingSoldier, starvedRebel } from '../../cast.js';
import { inFight, seededRandom } from '../../physics.js';
import { storyComradeFighter, storyHeroInputs } from '../life.js';

export const SUPPRESSION = {
  // The company at one man in four (112 / 4): the foot in three ranks, and the riders.
  scale: 4,
  // The ranks of the foot, front to back: [count, styles drawn in turn]. 9 + 8 + 8 = 25 foot.
  ranks: [
    [9, ['spear']],
    [8, ['spear']],
    [8, ['dao', 'bow', 'dao', 'bow']],
  ],
  // The commander and two of his household on horse (a southern garrison's few horses).
  riders: ['dao', 'spear', 'spear'],
  // The men of the column: 240 / 4.
  refugees: 60,
  // Their arms (shares): most bare-handed, some with the carrying pole, some with a sickle.
  arms: [[0.7, 'unskilled'], [0.15, 'staff'], [0.15, 'knife']],
  // The company's ranks: shoulder to shoulder (a spear's room, m) and a pace between ranks.
  spacing: 1.1,
  rowSpacing: 1.3,
  // Where each side stands (m from the middle to its front): the company walks up to them.
  front: { garrison: 9, refugees: 7 },
  // The column bunched where it had stopped: a crowd, each a metre or so off where a row would put him.
  crowd: { spacing: 1.1, rowSpacing: 1.3, perRow: 12, loose: 0.75 },
  // The floor: room for the riders to go round (WINGS) and for the column to run.
  arena: { halfX: 26, halfZ: 13 },
  // The stream's bed behind the column (m along x), gone to mud in the drought: calf-deep on a man, a firm bed under it.
  mud: { x: [15, 21], z: [-13, 13], depth: 0.22, firm: 0.4, viscosity: 2, footing: 0.65, surface: 'mud', edge: 0.8, water: 0.03 },
  // The company is drilled to walk up in its ranks and go in at a run for the last few metres (formation.js DRILL).
  drill: { advance: true, charge: 5 },
  // The riders held on the flank until the lines meet (formation.js WINGS: released then, or by `by` s).
  wings: { side: 1, release: 12, by: 30 },
  seconds: 150,
  view: {
    scene: 'plain',
    // A dry haze over a drought year's fields.
    weather: { fog: [24, 120], sky: 0.7, pale: 0.8, sun: 1.0 },
    camera: { yaw: -0.5, pitch: 0.42, distance: 22, maxDistance: 28 },
  },
};

// Names both ways: the company's men and the column's (a surname and a given or village name).
const SUPPRESSION_NAMES = {
  surnames: [['王', 'Wang'], ['李', 'Li'], ['张', 'Zhang'], ['刘', 'Liu'], ['陈', 'Chen'], ['杨', 'Yang'], ['赵', 'Zhao'], ['黄', 'Huang'], ['周', 'Zhou'], ['吴', 'Wu'], ['徐', 'Xu'], ['朱', 'Zhu'], ['楼', 'Lou'], ['金', 'Jin'], ['何', 'He'], ['郭', 'Guo']],
  soldiers: [['大', 'Da'], ['二', 'Er'], ['三', 'San'], ['四', 'Si'], ['五', 'Wu'], ['阿六', 'Aliu'], ['虎', 'Hu'], ['宝', 'Bao'], ['顺', 'Shun'], ['贵', 'Gui'], ['福', 'Fu'], ['明', 'Ming']],
  refugees: [['老三', 'Laosan'], ['二郎', 'Erlang'], ['小六', 'Xiaoliu'], ['大狗', 'Dagou'], ['拴柱', 'Shuanzhu'], ['铁柱', 'Tiezhu'], ['狗蛋', 'Goudan'], ['老五', 'Laowu'], ['阿根', 'Agen'], ['水生', 'Shuisheng'], ['长生', 'Changsheng'], ['来福', 'Laifu']],
};

const suppressionPick = (list, random) => list[Math.floor(random() * list.length)];

/** A name both ways from the tables: { zh, en }. */
function suppressionName(random, given) {
  const [zhSur, enSur] = suppressionPick(SUPPRESSION_NAMES.surnames, random);
  const [zhGiven, enGiven] = suppressionPick(given, random);
  return { zh: `${zhSur}${zhGiven}`, en: `${enSur} ${enGiven}` };
}

/** One of [share, value] pairs by its share. */
function suppressionDraw(pairs, random) {
  let roll = random();
  for (const [share, value] of pairs) {
    if (roll < share) return value;
    roll -= share;
  }
  return pairs[pairs.length - 1][1];
}

/** The slots of the foot in the formation's `layout` ([back, across], m), in cast order, and the index of each rank's first. */
function suppressionLayout() {
  const layout = [];
  const firsts = [];
  SUPPRESSION.ranks.forEach(([count], row) => {
    firsts.push(layout.length);
    for (let index = 0; index < count; index += 1) layout.push([row * SUPPRESSION.rowSpacing, (index - (count - 1) / 2) * SUPPRESSION.spacing]);
  });
  return { layout, firsts };
}

/** The slots beside the hero's in his rank, nearest first: right, left, two right, two left, … (indices into the rank's men). */
function suppressionBeside(rank, at) {
  const [count] = SUPPRESSION.ranks[rank];
  const order = [];
  for (let step = 1; order.length < count - 1; step += 1) {
    if (at + step < count) order.push(at + step);
    if (at - step >= 0) order.push(at - step);
    if (step > count) break;
  }
  return order;
}

/** The brother (life.family.brother): a coal carrier gone hungry with the column, empty-handed. As cast if the life gives none. */
function suppressionBrother(life, random) {
  const family = life.family?.brother ?? {};
  const man = starvedRebel(random);
  const name = family.name ?? { zh: '陈大', en: 'Chen Da' };
  // A carrier's back and legs (he carried coal on a pole all his life: `exercise` a labourer's), starved as the rest.
  const inputs = normaliseInputs({ ...man, ...(family.inputs ?? {}), name: name.en, style: 'unskilled', age: life.year && family.born ? life.year - family.born : man.age, exercise: Math.max(man.exercise, 0.45) });
  return { inputs, name };
}

export const BATTLE_SUPPRESSION = {
  id: 'suppression',
  n: 1,
  year: 1587,
  title: { zh: '剿"匪"', en: 'The "Bandit" Suppression' },
  seconds: SUPPRESSION.seconds,
  // Over when the column is gone from the field: each of its men down, crawling off or fled (not when it first breaks, as a
  // battle is decided: battleend.js; the company rides and walks the runners down, and that is the day's work).
  ends: (world) => world.fighters.every((fighter) => fighter.corner !== 'blue' || !inFight(fighter)),
  /**
   * The battle for this life at a seed: the company (the hero in its line by his place, his living comrades beside him by
   * their bond), its riders, and the column (his brother in it).
   */
  setup(life, seed = 1) {
    const random = seededRandom(seed);
    const { layout, firsts } = suppressionLayout();
    const year = life.year ?? BATTLE_SUPPRESSION.year;
    const names = {};
    // The foot, rank by rank.
    const foot = [];
    SUPPRESSION.ranks.forEach(([count, styles]) => {
      for (let index = 0; index < count; index += 1) {
        const name = suppressionName(random, SUPPRESSION_NAMES.soldiers);
        foot.push({ inputs: normaliseInputs({ ...mingSoldier(random, styles[index % styles.length], 'garrison', { people: 'mingSouth' }), name: name.en }), name });
      }
    });
    // His place: the rank his life says (front, second, rear), the middle of it.
    const rank = Math.max(0, ['front', 'second', 'rear'].indexOf(life.place));
    const middle = Math.floor(SUPPRESSION.ranks[rank][0] / 2);
    const heroIndex = firsts[rank] + middle;
    foot[heroIndex] = { inputs: storyHeroInputs(life, year), name: life.hero.name };
    // His comrades still living, beside him in his rank, the closest bond nearest.
    const comrades = {};
    const beside = suppressionBeside(rank, middle);
    const living = life.comrades.filter((comrade) => comrade.alive).sort((a, b) => b.bond - a.bond);
    living.forEach((comrade, order) => {
      if (order >= beside.length) return;
      const index = firsts[rank] + beside[order];
      foot[index] = { inputs: storyComradeFighter(comrade, year), name: comrade.name };
      comrades[comrade.id] = index;
    });
    const riders = SUPPRESSION.riders.map((style, index) => {
      const name = index === 0 ? { zh: '百户', en: 'the Company Commander' } : suppressionName(random, SUPPRESSION_NAMES.soldiers);
      return { inputs: { ...mingHorseman(random, style), name: name.en }, name };
    });
    // The column: its men as the hungry are, armed as they came.
    const column = Array.from({ length: SUPPRESSION.refugees }, () => {
      const name = suppressionName(random, SUPPRESSION_NAMES.refugees);
      const style = suppressionDraw(SUPPRESSION.arms, random);
      return { inputs: normaliseInputs({ ...starvedRebel(random), name: name.en, style }), name };
    });
    // His brother among them, in the first rows of the crowd.
    const brother = suppressionBrother(life, random);
    const brotherAt = Math.floor(random() * SUPPRESSION.crowd.perRow * 2);
    column[brotherAt] = brother;
    const red = [...foot, ...riders];
    const fighters = [...red.map(({ inputs }) => ({ inputs, corner: 'red' })), ...column.map(({ inputs }) => ({ inputs, corner: 'blue' }))];
    [...red, ...column].forEach(({ name }, index) => { names[index] = name; });
    comrades.brother = red.length + brotherAt;
    const [back, across] = layout[heroIndex];
    return {
      fighters,
      options: {
        seed,
        arena: { ...SUPPRESSION.arena, works: { soft: [SUPPRESSION.mud] } },
        formation: {
          red: { front: SUPPRESSION.front.garrison, layout, loose: 0.08, drill: SUPPRESSION.drill, wings: SUPPRESSION.wings },
          blue: { front: SUPPRESSION.front.refugees, ...SUPPRESSION.crowd },
        },
        place: SUPPRESSION.view.scene,
      },
      view: SUPPRESSION.view,
      player: heroIndex,
      comrades,
      // His place in the line as it was drawn up (red stands at -x: createWorld puts a layout's man at x = -(front + back), z = -across).
      slot: { x: -(SUPPRESSION.front.garrison + back), z: -across },
      // The men of his file and rank he would lead as a squad leader: the rank's men either side of him (a ten-man file, 小旗).
      squad: beside.slice(0, 9).map((at) => firsts[rank] + at),
      names,
    };
  },
};
