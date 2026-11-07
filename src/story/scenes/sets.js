// Story mode's staged sets: the places a scene or a remembered moment is played in when it is not the battle's own field (the
// drill ground at Shimenzhai, the Suns' yard outside Liaoyang, the camp's gate at Pyongyang by lantern, the river flats). A set
// is data: the place and its air, the props on the ground (story/ground/props.js: a pole, a lantern, a house front with its
// doorway, heads laid in rows, a sorghum rack …), and the figures, each by who he is in the life (the hero at that year, a
// named comrade from his own inputs, his brother as the battle cast him, his wife and children, or a role: an officer, the
// condemned, a northern trooper) and how he stands (standing, kneeling, bowed with his hands behind him, crouched, lying dead,
// walking). `storySetSetup` turns it into what a battle's setup is ({ fighters, options, view, player, comrades }) so the page
// shows it as it shows a battle, and the scene (stage.js) places and poses the figures on it.
//
// Every figure is the game's own man: built by cast.js from his people's build, dressed by outfits.js. Nobody fights: the
// whole cast stands on one side, and the scene holds every figure still (stage.js).

import { normaliseInputs } from '../../body.js';
import { mingHorseman, mingSoldier, starvedRebel, bannerman } from '../../cast.js';
import { seededRandom } from '../../physics.js';
import { storyComradeFighter, storyHeroInputs } from '../life.js';

export const STORY_SET = {
  // How a figure stands (physics.js kneelPose's { share, lean }, and the hands): kneeling upright, kneeling bowed (the condemned,
  // the hands behind the back as a bound man's), crouched to a child's height (the kneel most of the way), sitting back on the
  // heels (as a man sits on the ground to write or to mend).
  poses: {
    kneel: { share: 1, lean: 0.08 },
    bowed: { share: 1, lean: 0.55, behind: true },
    crouch: { share: 1, lean: 0.22 },
    sit: { share: 1, lean: -0.05 },
    hunch: { share: 1, lean: 0.4 },
  },
  // Where the hands of a man down on his knees rest (m from his hips: ahead, up, apart): on his thighs.
  rest: { ahead: 0.24, up: -0.2, apart: 0.14 },
  // A man standing in a scene stands at ease: nobody here is fighting (stage.js easeFor, physics.js easePose). Each place is in
  // his own frame, shares of his height (ahead, up, out to his side), each way a direction (ahead, up, out).
  // - hand: a free hand hanging by the thigh (`ahead`, `out` of height), the arm let down to `hang` of its length (the elbow
  //   soft, not locked); the walk's own swing held them at the hip and out, the elbows akimbo, as no one stands.
  // - grounded: a weapon as long as `from` m or more (a spear, a pike, a glaive) stood on its butt by his foot, the shaft up
  //   and leaning out a little (`lean` rad), the hand round it at the hip (`hand`, raised to where the butt meets the floor, no
  //   higher than `most`): how a man with a pole arm stands in the ranks when no one is coming, its weight on the ground,
  //   not on his arms (a 2.6 m pike is ~2-3 kg, held out level for long by no one). Shorter: `low`, a sword or a club held by
  //   his side point down, the point a little ahead of his foot (no scabbard is drawn: a drawn blade rests so).
  // - carried: on the march (walking), a long weapon at the slope, the hand at the shoulder and the shaft back over it
  //   (`dir`); a short one `low`.
  // - shield: its arm let down, the shield hung against the leg.
  // - stance: at ease, not in a guard (walk mode's own stance, physics/config.js WORLD.walk: upright, the knees straight, no
  //   turn of the body): the feet side by side (`even`), barely one before the other (`stagger`), a little apart (`width`).
  // - vary: no two men stand alike (sceneVary, seeded by who he is): the weight on one leg (`roll` rad of the trunk over it,
  //   `hipYaw` the hips turned with it), the shoulders turned (`twist`), the head tilted and turned (`head`, of height), a
  //   lean (`lean`), one foot ahead or the other; `sway`, the slow sway of a man standing (rad of roll, its Hz: a standing
  //   man's body sways ~0.1-0.3 Hz, a few mm to a cm).
  ease: {
    hand: { ahead: 0.03, out: 0.12, hang: 0.95 },
    grounded: { from: 1.5, hand: [0.07, 0.47, 0.15], most: 0.56, lean: 0.07, floor: 0.02 },
    low: { hand: { ahead: 0.05, out: 0.135, hang: 0.93 }, dir: [0.3, -1, 0.06] },
    carried: { hand: [0.06, 0.7, 0.13], dir: [-0.7, 1, 0.12] },
    shield: [0.05, 0.5, 0.17],
    stance: { blade: 0, crouch: 0, lean: 0.03, guardHeight: 0, width: 0.85, stagger: 0.25, even: 1 },
    vary: { roll: 0.05, hipYaw: 0.12, twist: 0.14, head: 0.012, lean: 0.035 },
    sway: { roll: 0.012, hz: 0.14 },
  },
  // A walking figure's pace (the share of his stride the gait is asked for: 0.5 comes to ~0.7 m/s, an unhurried walk; 0.9 a
  // run of ~3 m/s; past `run` he runs) and how close (m) he stops to where he goes; one who comes up to another (the stage word
  // `approach`) comes slowly (`slow`, ~0.55 m/s) and stops `short` m from him, at arm's length.
  walk: { pace: 0.5, stop: 0.75, run: 0.7, slow: 0.4, short: 0.55 },
  // A child's height by age (cm): a poor family's child of the 1600s, some 5% under today's medians (WHO: 7 y 122 cm, 10 y
  // 138 cm, 13 y 156 cm); a grown woman of the south ~150 cm (Ming skeletal series: ~150-153 cm).
  childHeight: [[3, 90], [5, 101], [7, 113], [9, 123], [11, 133], [13, 145], [15, 152]],
  womanHeight: 150,
  // A coal carrier's back and legs (his brother: a labourer's exercise), as the battle cast him (battles/01-suppression.js).
  carrierExercise: 0.45,
  // The arena of a set (m): room for the figures and the camera; a set's own may be bigger.
  arena: { halfX: 16, halfZ: 16 },
  // The colours of the people's clothes (outfits.js commoner: a tunic and a skirt or hose), undyed and indigo hemp, faded.
  clothes: {
    woman: { top: '#4f5a6a', bottom: '#2f3238' },
    girl: { top: '#9a6a5a', bottom: '#4a4038' },
    boy: { top: '#8a7a5e', bottom: '#4a4034' },
    child: { top: '#8a7a5e', bottom: '#4a4034' },
    old: { top: '#6a6458', bottom: '#3a3630' },
    official: { top: '#3a2e46', bottom: '#2a2430' },
  },
};

/** A child's height (cm) at an age. */
export function storyChildHeight(age) {
  const table = STORY_SET.childHeight;
  if (age <= table[0][0]) return table[0][1];
  for (let index = 1; index < table.length; index += 1) {
    const [a, h] = table[index];
    const [a0, h0] = table[index - 1];
    if (age <= a) return Math.round(h0 + ((h - h0) * (age - a0)) / (a - a0));
  }
  return table[table.length - 1][1];
}

/** A string hash, for a stable seed per figure. */
function setHash(text) {
  let hash = 2166136261;
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

/** Plain people's clothes and looks: the commoner's tunic, a woman's or a child's build. */
function setCivilian(random, { sex = 'male', age, heightCm, clothes, hair }) {
  const base = starvedRebel(random);
  return normaliseInputs({
    ...base,
    sex, age, heightCm,
    style: 'unskilled',
    // Fed as a poor household is fed, not starved.
    calories: undefined,
    bodyFat: sex === 'female' ? 0.24 : 0.13,
    exercise: 0.4,
    accessories: [],
    outfit: { kind: 'commoner', design: 0, colors: { ...clothes } },
    look: { ...base.look, hairStyle: hair ?? base.look.hairStyle, facialHair: sex === 'female' || age < 18 ? 'none' : base.look.facialHair, hairColor: age > 55 ? '#8a8680' : '#1c1612' },
  });
}

/** The life's people at a year: his brother, wife, son, daughter (life.family: kept inputs, else made from the life's seed). */
function setFamilyInputs(life, who, year) {
  const entry = life.family?.[who];
  const person = typeof entry === 'object' && entry ? entry : {};
  const random = seededRandom(setHash(`${life.seed}:${who}`));
  const born = person.born ?? { brother: 1559, wife: 1586, son: 1608, daughter: 1611 }[who] ?? 1580;
  const age = Math.max(2, year - born);
  const name = person.name?.en ?? who;
  if (who === 'brother') {
    // The man the battle cast (kept in the life), else one as it casts him: a starved carrier of the column.
    const base = person.inputs ? normaliseInputs(structuredClone(person.inputs)) : normaliseInputs({ ...starvedRebel(random), exercise: STORY_SET.carrierExercise });
    // Before the famine year he was not starving: fed as a labourer is.
    const fed = year < 1587 ? { calories: undefined, bodyFat: 0.12 } : {};
    return normaliseInputs({ ...base, ...fed, name, style: 'unskilled', age });
  }
  if (who === 'wife') return { ...setCivilian(random, { sex: 'female', age, heightCm: STORY_SET.womanHeight, clothes: STORY_SET.clothes.woman, hair: 'bun' }), name };
  if (who === 'son') return { ...setCivilian(random, { sex: 'male', age, heightCm: age < 16 ? storyChildHeight(age) : 162, clothes: STORY_SET.clothes.boy, hair: 'topknot' }), name };
  if (who === 'daughter') return { ...setCivilian(random, { sex: 'female', age, heightCm: storyChildHeight(age), clothes: STORY_SET.clothes.girl, hair: 'bun' }), name };
  return { ...setCivilian(random, { age, heightCm: 160, clothes: STORY_SET.clothes.old }), name };
}

/** A role's man (no one the life names): an officer, a soldier of the ranks, the condemned, a northern trooper, … */
function setRoleInputs(role, random, { year }) {
  const unarmed = (inputs) => normaliseInputs({ ...inputs, style: 'unskilled' });
  switch (role) {
    case 'officer': return mingSoldier(random, 'dao', 'elite', { people: 'mingSouth' });
    case 'executioner': return mingSoldier(random, 'dao', 'garrison', { people: 'ming' });
    case 'soldier': return mingSoldier(random, 'spear', 'garrison', { people: 'mingSouth' });
    case 'northSoldier': return mingSoldier(random, 'spear', 'garrison', { people: 'ming' });
    case 'squadLeader': return mingSoldier(random, 'swordShield', 'brigandine', { people: 'mingSouth' });
    case 'condemned': return unarmed(mingSoldier(random, 'spear', 'garrison', { people: 'mingSouth' }));
    case 'northTrooper': {
      const trooper = mingHorseman(random, 'dao');
      delete trooper.mounted;
      return normaliseInputs(trooper);
    }
    case 'jinSoldier': return bannerman(random, 'spear');
    case 'refugee': return normaliseInputs({ ...starvedRebel(random), style: 'unskilled' });
    case 'digger': return normaliseInputs({ ...starvedRebel(random), style: 'unskilled', calories: undefined, bodyFat: 0.1 });
    case 'oldMan': return setCivilian(random, { age: 63, heightCm: 160, clothes: STORY_SET.clothes.old });
    case 'oldWoman': return setCivilian(random, { sex: 'female', age: 58, heightCm: 147, clothes: STORY_SET.clothes.old, hair: 'bun' });
    case 'official': return setCivilian(random, { age: 46, heightCm: 167, clothes: STORY_SET.clothes.official, hair: 'topknot' });
    case 'boy': return setCivilian(random, { age: 9, heightCm: storyChildHeight(9), clothes: STORY_SET.clothes.boy, hair: 'topknot' });
    default: return mingSoldier(random, 'spear', 'garrison', { people: year < 1600 ? 'mingSouth' : 'ming' });
  }
}

/** The hero at a year as the figure asks: his age then, his kit (`rank`), his weapon (`style`); a boy (`child`: the age); or not yet a soldier (`civilian`). */
function setHeroInputs(life, figure, year) {
  if (figure.child) {
    const random = seededRandom(setHash(`${life.seed}:child`));
    const inputs = setCivilian(random, { age: figure.child, heightCm: storyChildHeight(figure.child), clothes: STORY_SET.clothes.child, hair: 'topknot' });
    // His own face and colouring, as a boy.
    return normaliseInputs({ ...inputs, look: { ...inputs.look, skinTone: life.hero.inputs.look?.skinTone ?? inputs.look.skinTone, eyeColor: life.hero.inputs.look?.eyeColor ?? inputs.look.eyeColor }, name: life.hero.name.en });
  }
  const inputs = storyHeroInputs({ ...life, rank: figure.rank ?? life.rank }, year);
  // Before the army: a poor man's own clothes, nothing in his hands.
  if (figure.civilian) return normaliseInputs({ ...inputs, style: 'unskilled', outfit: { kind: 'commoner', design: 0, colors: { ...STORY_SET.clothes.child } }, accessories: [] });
  return normaliseInputs({ ...inputs, ...(figure.style ? { style: figure.style } : {}) });
}

/**
 * A figure is in the set: a role always; the hero always; a named man if he is in the life: living, unless `always` (he is there
 * at the moment the scene shows, as Jin Aman is at the flagpole) or remembered (`memory`); `dead`: only if he fell in the battle
 * just fought (the chapter the life is in), as the field after it shows him.
 */
function setFigurePresent(life, figure, { memory }) {
  if (figure.who === 'hero' || figure.role) return true;
  if (['brother', 'wife', 'son', 'daughter'].includes(figure.who)) return figure.who === 'brother' || Boolean(life.family?.[figure.who]);
  const comrade = life.comrades?.find((each) => each.id === figure.who);
  if (!comrade) return false;
  if (figure.dead) return comrade.alive === false && comrade.diedAt?.chapter === life.chapter && comrade.diedAt?.how !== 'executed';
  return memory || figure.always || comrade.alive !== false;
}

/** A row of figures (`rows`): `count` of a role from `from`, `step` m apart, each as the row's figure says. */
function setRowFigures(row, rowIndex) {
  return Array.from({ length: row.count }, (_, index) => ({
    ...row,
    role: row.role,
    who: `${row.role}-${rowIndex}-${index}`,
    at: [row.from[0] + row.step[0] * index, row.from[1] + row.step[1] * index],
    face: row.face,
  }));
}

/** The direction (yaw, rad) from one point to another on the floor (physics.js: yaw 0 faces +x, and +yaw turns toward -z). */
export function setYaw(from, to) {
  return Math.atan2(-(to[1] - from[1]), to[0] - from[0]);
}

/**
 * The world for a set: `set` (a STORY_SETS entry, or one of its own), the life, the year of it, whether it is remembered
 * (`memory`: the dead are there as they were), the seed, `alias` (a set's stand-in names: { friend: 'zhu' }). Returns a battle setup's shape ({ fighters, options, view, player,
 * comrades: { who: index } }) and `figures` ([{ index, at, yaw, pose, … }]) for the scene to place and pose.
 */
export function storySetSetup(set, life, { year = life.year ?? 1587, memory = false, seed = 1, alias = {} } = {}) {
  const random = seededRandom(setHash(`${life.seed}:${set.id ?? 'set'}:${seed}`));
  // (A set's stand-in names, `friend`: whom the scene says it is.)
  const named = (figure) => (alias[figure.who] ? { ...figure, who: alias[figure.who] } : figure);
  const listed = [...(set.figures ?? []), ...(set.rows ?? []).flatMap((row, index) => setRowFigures(row, index))].map(named).filter((figure) => setFigurePresent(life, figure, { memory }));
  const fighters = [];
  const figures = [];
  const cast = {};
  let player = -1;
  for (const figure of listed) {
    let inputs;
    if (figure.who === 'hero') inputs = setHeroInputs(life, figure, year);
    else if (figure.role) inputs = setRoleInputs(figure.role, random, { year });
    else if (['brother', 'wife', 'son', 'daughter'].includes(figure.who)) inputs = setFamilyInputs(life, figure.who, year);
    else inputs = storyComradeFighter(life.comrades.find((each) => each.id === figure.who), year);
    if (figure.style && figure.who !== 'hero') inputs = normaliseInputs({ ...inputs, style: figure.style });
    // A bound man has nothing in his hands.
    if (STORY_SET.poses[figure.pose]?.behind) inputs = normaliseInputs({ ...inputs, style: 'unskilled' });
    // The dead lie bareheaded (a head wrap knocked loose would lie beside him as a cloth on the ground).
    if (figure.pose === 'lie' || figure.pose === 'lieUp') inputs = normaliseInputs({ ...inputs, accessories: [] });
    const index = fighters.length;
    fighters.push({ inputs, corner: 'red' });
    if (figure.who === 'hero') player = index;
    cast[figure.who] = index;
    if (figure.role && cast[figure.role] === undefined) cast[figure.role] = index;
    const face = Array.isArray(figure.face) ? setYaw(figure.at, figure.face) : figure.face ?? 0;
    figures.push({ index, who: figure.who ?? figure.role, at: [...figure.at], yaw: face, pose: figure.pose ?? 'stand', walk: figure.walk ?? null, hands: figure.hands ?? null, lean: figure.lean });
  }
  // A set with no hero in it (a remembered doorway he is not in): the first figure is the one the page follows.
  if (player < 0) player = 0;
  const arena = { ...(set.arena ?? STORY_SET.arena), works: { ...(set.works ?? {}), props: set.props ?? [] } };
  return {
    fighters,
    // (No side raises a standard: nobody here is an army in the field.)
    options: { seed, arena, place: set.place ?? 'plain', rules: { noStandards: true } },
    // (The page's orbit takes the view's yaw, pitch and distance; the scene's camera, its target and drift, is `camera`.)
    view: { scene: set.place ?? 'plain', weather: set.weather ?? null, camera: { yaw: set.camera?.yaw ?? 0, pitch: set.camera?.pitch ?? 0.2, distance: set.camera?.distance ?? 5 } },
    camera: set.camera ? structuredClone(set.camera) : null,
    // (Its other shots, by name, for a line's `shot:name`.)
    cameras: structuredClone(set.cameras ?? {}),
    player,
    comrades: cast,
    figures,
    set,
  };
}

// ---- The sets -------------------------------------------------------------------------------------------------------------
// Each: `place` (render.js's), `weather` (render.js applyWeather: fog [near, far], sky, pale, sun, colour, dim), `props`
// (story/ground/props.js), `figures` [{ who | role, at: [x, z], face: [x, z] | yaw, pose, walk: { to: [x, z], pace } }],
// `rows` (figures in a line), `camera` { target: [x, y, z], yaw, pitch, distance, drift: { yaw, distance } per s }.
// Night: the sun near nothing and the sky's light cut (`dim`), the fog the colour of the dark; the lanterns light it.

const SET_NIGHT = { fog: [5, 34], colour: 0x0d0f14, sky: 1, sun: 0.04, dim: 0.22 };
const SET_DUSK = { fog: [10, 60], colour: 0x3a3430, sky: 0.9, sun: 0.35, dim: 0.6 };
const SET_SNOW = { fog: [8, 55], colour: 0xd8dde2, sky: 1, sun: 0.55, dim: 0.95 };
const SET_HAZE = { fog: [14, 90], sky: 0.75, pale: 0.8, sun: 0.9 };
const SET_GREY = { fog: [10, 70], sky: 0.8, pale: 0.7, sun: 0.5, dim: 0.8 };
const SET_EARTH = '#7a6a52';
const SET_MUD = '#4e3e2c';
const SET_SNOWFIELD = '#e4e8ec';
const SET_YARD = '#a08a62';

export const STORY_SETS = {
  // The river flats, 1587: the mud, his brother face up in it, a few of the column lying further off.
  flats: {
    id: 'flats', place: 'plain', weather: { fog: [16, 90], sky: 0.85, pale: 0.85, sun: 0.6, dim: 0.85 },
    props: [{ kind: 'ground', at: [0, 0], radius: 14, colour: SET_MUD, wet: true }],
    figures: [
      { who: 'brother', at: [0, 0], face: [0, 3], pose: 'lieUp' },
      { who: 'hero', at: [0.2, -1.0], face: [0, 0.3], pose: 'kneel', rank: 'soldier' },
      { role: 'refugee', at: [-4.5, 3.2], face: 0.4, pose: 'lie' },
      { role: 'refugee', at: [5.5, 2.4], face: 2.4, pose: 'lie' },
      { role: 'refugee', at: [4.2, -5.6], face: -1.2, pose: 'lie' },
    ],
    camera: { target: [0.1, 0.45, -0.4], yaw: 0.35, pitch: 0.34, distance: 4.4, drift: { distance: -0.05 } },
  },
  // The flats, after: the bodies, him standing among them, not looking.
  flatsAfter: {
    id: 'flatsAfter', place: 'plain', weather: { fog: [14, 80], sky: 0.85, pale: 0.85, sun: 0.55, dim: 0.85 },
    props: [{ kind: 'ground', at: [0, 0], radius: 14, colour: SET_MUD, wet: true }],
    figures: [
      { who: 'hero', at: [0, 0], face: [4, -6], pose: 'stand', rank: 'soldier' },
      { role: 'refugee', at: [-1.6, 1.1], face: 0.6, pose: 'lie' },
      { role: 'refugee', at: [1.4, 1.8], face: 2.1, pose: 'lie' },
      { role: 'refugee', at: [-2.6, -1.4], face: -0.8, pose: 'lie' },
      { role: 'refugee', at: [2.8, -0.6], face: 3.0, pose: 'lie' },
      { role: 'refugee', at: [0.4, 3.4], face: 1.4, pose: 'lie' },
    ],
    camera: { target: [0, 0.9, 0], yaw: 2.2, pitch: 0.3, distance: 6.5, drift: { yaw: 0.01 } },
  },
  // One of the column lying still where he told him to.
  flatsSpared: {
    id: 'flatsSpared', place: 'plain', weather: { fog: [14, 80], sky: 0.85, pale: 0.85, sun: 0.55, dim: 0.85 },
    props: [{ kind: 'ground', at: [0, 0], radius: 14, colour: SET_MUD, wet: true }],
    figures: [
      { role: 'refugee', at: [0, 0], face: 1.2, pose: 'lie' },
      { who: 'hero', at: [0.9, -0.9], face: [0, 0], pose: 'stand', rank: 'soldier' },
    ],
    camera: { target: [0.45, 0.6, -0.45], yaw: 0.5, pitch: 0.3, distance: 4.4, drift: { distance: -0.05 } },
  },
  // Yiwu, the 1570s: his brother on the path home with the carrying pole, the boy beside him.
  carryingPole: {
    id: 'carryingPole', place: 'plain', weather: { fog: [18, 100], sky: 0.6, pale: 0.4, sun: 1.1 },
    props: [{ kind: 'ground', at: [0, 0], radius: 18, colour: '#8a7a56' }, { kind: 'rack', at: [-4.5, 3.5], yaw: 0.3, length: 3.2 }],
    figures: [
      { who: 'brother', at: [-3, 0], face: [6, 0], pose: 'walk', walk: { to: [6, 0], pace: 0.45 }, style: 'staff' },
      { who: 'hero', at: [-3.4, -0.9], face: [6, -0.9], pose: 'walk', walk: { to: [5.6, -0.9], pace: 0.45 }, child: 8 },
    ],
    camera: { target: [-1, 0.8, -0.4], yaw: -1.1, pitch: 0.16, distance: 6.5, drift: { yaw: 0.015 } },
  },
  // The house in Beilei, 1586: his brother sitting by the door counting the coppers out of the jar, him standing by (not yet
  // a soldier: his own clothes).
  coinJar: {
    id: 'coinJar', place: 'plain', weather: SET_DUSK,
    props: [{ kind: 'ground', at: [0, 0], radius: 12, colour: SET_YARD }, { kind: 'house', at: [0, 2.2], yaw: 0, width: 6, height: 2.6, door: 1.1, lit: true }, { kind: 'lantern', at: [-1.2, 1.4], height: 1.7, light: 1.1 }],
    figures: [
      { who: 'brother', at: [-0.3, 0.9], face: [0.6, 0.2], pose: 'sit' },
      { who: 'hero', at: [0.7, 0.4], face: [-0.3, 0.9], pose: 'stand', civilian: true },
    ],
    camera: { target: [0.2, 0.75, 0.6], yaw: -1.25, pitch: 0.22, distance: 4.0, drift: { distance: -0.04 } },
  },
  // The drill ground at Shimenzhai, the ninth day (1595): the flagpole, the condemned on their knees in a row by it, Jin Aman
  // at its foot, the executioner, the officer; the companies drawn up to watch; and him by the barracks.
  drillGround: {
    id: 'drillGround', place: 'sarhu', weather: { fog: [14, 80], sky: 0.85, pale: 0.6, sun: 0.55, dim: 0.85 },
    arena: { halfX: 22, halfZ: 22 },
    props: [{ kind: 'ground', at: [0, 0], radius: 20, colour: SET_EARTH }, { kind: 'pole', at: [0, 0], height: 9, flag: '#a23a2a' }],
    figures: [
      { who: 'jin', at: [0.9, 0], face: [6, 0], pose: 'bowed', always: true },
      { role: 'executioner', at: [1.2, -1.0], face: [1.0, 0], pose: 'stand' },
      { role: 'officer', at: [3.5, -3.2], face: [1, 0], pose: 'stand' },
      { who: 'hero', at: [9, 2.6], face: [0.9, 0.6], pose: 'stand', style: 'unskilled' },
    ],
    rows: [
      { role: 'condemned', count: 5, from: [0.9, 1.6], step: [0, 1.4], face: [6, 3], pose: 'bowed' },
      { role: 'soldier', count: 7, from: [1.5, -5.5], step: [1.1, 0], face: [3, 0], pose: 'stand' },
      { role: 'soldier', count: 7, from: [1.5, -6.8], step: [1.1, 0], face: [3, 0], pose: 'stand' },
    ],
    // Over his shoulder from the barracks' side: the row and the pole down the ground, the companies drawn up beside it.
    camera: { target: [4.5, 1.0, 1.3], yaw: 0.51, pitch: 0.075, distance: 8.6, drift: { distance: -0.04 } },
    cameras: {
      // Jin at the foot of the pole, low, the row beyond him.
      jin: { target: [0.9, 0.7, 0.4], yaw: 0.9, pitch: 0.12, distance: 3.2, drift: { distance: -0.03 } },
    },
  },
  // The same ground with no one he knows in the row (Jin dead in Korea already, or the scene of the strangers' deaths).
  drillGroundOthers: {
    id: 'drillGroundOthers', place: 'sarhu', weather: { fog: [14, 80], sky: 0.85, pale: 0.6, sun: 0.55, dim: 0.85 },
    arena: { halfX: 22, halfZ: 22 },
    props: [{ kind: 'ground', at: [0, 0], radius: 20, colour: SET_EARTH }, { kind: 'pole', at: [0, 0], height: 9, flag: '#a23a2a' }],
    figures: [
      { role: 'executioner', at: [1.2, -1.0], face: [1.0, 0], pose: 'stand' },
      { role: 'officer', at: [3.5, -3.2], face: [1, 0], pose: 'stand' },
      { who: 'hero', at: [9, 2.6], face: [0.9, 0.6], pose: 'stand', style: 'unskilled' },
    ],
    rows: [
      { role: 'condemned', count: 6, from: [0.9, 0], step: [0, 1.4], face: [6, 3], pose: 'bowed' },
      { role: 'soldier', count: 7, from: [1.5, -5.5], step: [1.1, 0], face: [3, 0], pose: 'stand' },
    ],
    camera: { target: [4.5, 1.0, 1.3], yaw: 0.51, pitch: 0.075, distance: 8.6, drift: { distance: -0.04 } },
  },
  // The same ground, and he is in the row (he went to the drill ground: the list of the beheaded).
  drillGroundSelf: {
    id: 'drillGroundSelf', place: 'sarhu', weather: { fog: [12, 70], sky: 0.85, pale: 0.6, sun: 0.5, dim: 0.8 },
    arena: { halfX: 22, halfZ: 22 },
    props: [{ kind: 'ground', at: [0, 0], radius: 20, colour: SET_EARTH }, { kind: 'pole', at: [0, 0], height: 9, flag: '#a23a2a' }],
    figures: [
      { who: 'hero', at: [0.9, 2.8], face: [6, 3], pose: 'bowed', style: 'unskilled' },
      { who: 'jin', at: [0.9, 4.2], face: [6, 4], pose: 'bowed' },
      { role: 'executioner', at: [1.4, 1.6], face: [1.0, 2.8], pose: 'stand' },
      { role: 'officer', at: [3.5, -3.2], face: [1, 0], pose: 'stand' },
    ],
    rows: [
      { role: 'condemned', count: 2, from: [0.9, 0], step: [0, 1.4], face: [6, 0], pose: 'bowed' },
      { role: 'condemned', count: 2, from: [0.9, 5.6], step: [0, 1.4], face: [6, 6], pose: 'bowed' },
      { role: 'soldier', count: 6, from: [7, -7], step: [0, -1.2], face: [0, -3], pose: 'stand' },
    ],
    camera: { target: [1.2, 0.7, 2.8], yaw: 0.25, pitch: 0.2, distance: 3.4, drift: { distance: -0.03 } },
  },
  // The Liaoyang drill ground, the second month of 1619: the pole, Bai Yunlong's head on it; the ranks; the civil official.
  poleHead: {
    id: 'poleHead', place: 'sarhu', weather: { fog: [12, 80], colour: 0xb9bcbf, sky: 1, sun: 0.4, dim: 0.8 },
    arena: { halfX: 22, halfZ: 22 },
    props: [{ kind: 'ground', at: [0, 0], radius: 20, colour: '#8c8478' }, { kind: 'pole', at: [0, 0], height: 6, head: true }, { kind: 'snow', at: [0, 0], radius: 22, cover: 0.35 }],
    figures: [
      { role: 'official', at: [1.6, -1.4], face: [6, -1], pose: 'stand' },
      { who: 'hero', at: [8, 0.4], face: [0, 0], pose: 'stand', style: 'spear' },
    ],
    rows: [
      { role: 'soldier', count: 7, from: [8, -4.4], step: [0, 1.1], face: [0, 0], pose: 'stand' },
      { role: 'northSoldier', count: 8, from: [9.4, -4.9], step: [0, 1.1], face: [0, 0], pose: 'stand' },
    ],
    // From the side of the ground, a man's height, looking up the pole: the head against the grey sky in the upper third
    // (~0.2 m across at ~5 m, near fifty pixels of the frame), the pole going down out of it (the official has his own shot;
    // from the ranks, looking up, the head was a speck at the top and the front rank's helmets crowded the frame).
    camera: { target: [0.3, 4.4, -0.3], yaw: 1.2, pitch: -0.42, distance: 6, drift: { distance: -0.03 } },
    cameras: {
      // Up at the head, close, against the grey sky.
      head: { target: [0.05, 5.1, 0.1], yaw: 0.5, pitch: -0.62, distance: 3.6, drift: { distance: -0.03 } },
      // The official under it, the pole rising out of the frame.
      official: { target: [1.6, 1.45, -1.2], yaw: 0.35, pitch: 0.02, distance: 4.2, drift: { distance: -0.03 } },
      // Him in the front rank, the men either side.
      ranks: { target: [8, 1.5, 0.3], yaw: 3.0, pitch: 0.05, distance: 3.4, drift: { distance: -0.03 } },
    },
  },
  // Wherever he is tied for it: the same pole, empty, and him at its foot (the Sarhu muster's fatal word).
  poleSelf: {
    id: 'poleSelf', place: 'sarhu', weather: { fog: [12, 80], colour: 0xb9bcbf, sky: 1, sun: 0.4, dim: 0.8 },
    arena: { halfX: 22, halfZ: 22 },
    props: [{ kind: 'ground', at: [0, 0], radius: 20, colour: '#8c8478' }, { kind: 'pole', at: [0, 0], height: 7.5 }, { kind: 'snow', at: [0, 0], radius: 22, cover: 0.35 }],
    figures: [
      { who: 'hero', at: [0.8, 0], face: [6, 0], pose: 'bowed', style: 'unskilled' },
      { role: 'executioner', at: [1.2, -1.0], face: [0.8, 0], pose: 'stand' },
      { role: 'official', at: [4, -3], face: [0.8, 0], pose: 'stand' },
    ],
    rows: [{ role: 'soldier', count: 7, from: [8, -4.4], step: [0, 1.1], face: [0, 0], pose: 'stand' }],
    camera: { target: [1.0, 0.8, 0], yaw: 0.35, pitch: 0.18, distance: 4.2, drift: { distance: -0.03 } },
  },
  // The northern camp's gate at Pyongyang, the night after (1593): heads laid out in rows on the ground by lantern, a northern
  // trooper over them with the tally, He Ergou crouched among them, and him.
  gateHeads: {
    id: 'gateHeads', place: 'sarhu', weather: SET_NIGHT,
    props: [
      { kind: 'ground', at: [0, 0], radius: 12, colour: '#5a4c3c' },
      { kind: 'heads', at: [0, 0], rows: 4, perRow: 9, gap: [0.42, 0.55] },
      { kind: 'lantern', at: [-2.6, -1.4], height: 2.1, light: 1.4 },
      { kind: 'lantern', at: [2.8, 1.8], height: 2.1, light: 1.1 },
      { kind: 'gate', at: [0, 4.8], yaw: 0, width: 3.2, height: 3.4 },
    ],
    figures: [
      { role: 'northTrooper', at: [-2.2, -0.6], face: [0, 0], pose: 'stand' },
      { who: 'he', at: [1.1, -1.25], face: [1.1, 0], pose: 'crouch', style: 'unskilled' },
      { who: 'hero', at: [-0.6, -1.4], face: [-0.6, 0], pose: 'crouch', style: 'unskilled' },
    ],
    // From over the heads, at the faces of the men counting them, the lanterns behind and beside.
    camera: { target: [-0.3, 0.75, -0.9], yaw: 1.25, pitch: 0.34, distance: 4.8, drift: { distance: -0.05 } },
  },
  // The same, and He Ergou alone among the heads (a memory of him).
  gateHeadsHe: {
    id: 'gateHeadsHe', place: 'sarhu', weather: SET_NIGHT,
    props: [
      { kind: 'ground', at: [0, 0], radius: 12, colour: '#5a4c3c' },
      { kind: 'heads', at: [0, 0], rows: 3, perRow: 7, gap: [0.42, 0.55] },
      { kind: 'lantern', at: [-1.6, -1.6], height: 2.0, light: 1.4 },
      { kind: 'gate', at: [0, 4], yaw: 0, width: 3.2, height: 3.4 },
    ],
    figures: [{ who: 'he', at: [0.2, -1.1], face: [0.2, 0], pose: 'crouch', style: 'unskilled' }],
    camera: { target: [0.1, 0.6, -0.7], yaw: 1.4, pitch: 0.32, distance: 3.8, drift: { distance: -0.05 } },
  },
  // Korea in winter, the road up Moranbong (1593): Jin Aman and him in the snow.
  snowRoad: {
    id: 'snowRoad', place: 'sarhu', weather: SET_SNOW,
    props: [{ kind: 'snow', at: [0, 0], radius: 30, cover: 1 }],
    figures: [
      { who: 'jin', at: [0.6, 0.4], face: [-0.4, -0.5], pose: 'stand' },
      { who: 'hero', at: [-0.5, -0.5], face: [0.6, 0.4], pose: 'stand', rank: 'soldier' },
    ],
    // Three-quarters off his shoulder, Jin's face to it (straight down the line between them, he hid Jin).
    camera: { target: [0, 1.25, 0], yaw: -1.76, pitch: 0.12, distance: 3.6, drift: { yaw: 0.012 } },
  },
  // A house in Chi'an: Jin's mother at the door.
  motherDoor: {
    id: 'motherDoor', place: 'plain', weather: { fog: [12, 70], sky: 0.85, pale: 0.7, sun: 0.6, dim: 0.85 },
    props: [{ kind: 'ground', at: [0, 0], radius: 12, colour: SET_YARD }, { kind: 'house', at: [0, 1.6], yaw: 0, width: 6, height: 2.6, door: 1.1 }],
    figures: [{ role: 'oldWoman', at: [0, 1.1], face: [0, -5], pose: 'stand' }],
    camera: { target: [0, 1.2, 1.0], yaw: -1.57, pitch: 0.1, distance: 6.0, drift: { distance: -0.08 } },
  },
  // The drill ground, 1587: Wang Laoqi reciting the law to the recruits, him among them.
  recite: {
    id: 'recite', place: 'plain', weather: SET_HAZE,
    props: [{ kind: 'ground', at: [0, 0], radius: 16, colour: SET_EARTH }],
    figures: [
      { who: 'wang', at: [2.2, 0], face: [0, 0], pose: 'stand', style: 'unskilled' },
      { who: 'hero', at: [0, 0.6], face: [2.2, 0], pose: 'stand', rank: 'soldier', style: 'unskilled' },
      { who: 'jin', at: [0, -0.6], face: [2.2, 0], pose: 'stand', style: 'unskilled' },
      { who: 'lou', at: [-0.2, 1.8], face: [2.2, 0], pose: 'stand', style: 'unskilled' },
    ],
    camera: { target: [1.2, 1.2, 0.2], yaw: -2.2, pitch: 0.14, distance: 4.6, drift: { yaw: 0.01 } },
  },
  // The fort, late: Wang Laoqi airing the drill manual in the sun, page by page.
  pagesSun: {
    id: 'pagesSun', place: 'sarhu', weather: { fog: [16, 90], sky: 0.5, pale: 0.4, sun: 1.15 },
    props: [{ kind: 'ground', at: [0, 0], radius: 14, colour: SET_EARTH }, { kind: 'pages', at: [0.3, 0], count: 14, spread: [1.6, 1.0] }],
    figures: [{ who: 'wang', at: [-0.9, -0.2], face: [0.5, 0], pose: 'sit', style: 'unskilled' }],
    camera: { target: [-0.1, 0.5, 0], yaw: -1.2, pitch: 0.42, distance: 3.4, drift: { distance: -0.04 } },
  },
  // On the march: Lou Dayou ahead with the wolf-brush on his shoulder, him behind.
  march: {
    id: 'march', place: 'sarhu', weather: SET_GREY,
    props: [{ kind: 'ground', at: [0, 0], radius: 18, colour: SET_EARTH }],
    figures: [
      { who: 'lou', at: [-2, 0], face: [8, 0], pose: 'walk', walk: { to: [8, 0], pace: 0.5 } },
      { who: 'hero', at: [-4, -0.2], face: [8, -0.2], pose: 'walk', walk: { to: [6, -0.2], pace: 0.5 }, rank: 'soldier' },
    ],
    camera: { target: [-1.5, 1.4, -0.2], yaw: 2.75, pitch: 0.12, distance: 5.0, drift: { yaw: -0.01 } },
  },
  // A night in camp: Ye Chunsheng writing by the lantern, a man sitting across from him, waiting for his letter.
  letters: {
    id: 'letters', place: 'sarhu', weather: SET_NIGHT,
    props: [{ kind: 'ground', at: [0, 0], radius: 10, colour: '#5a4c3c' }, { kind: 'lantern', at: [0, 0.2], height: 0.5, light: 1.2, standing: true }, { kind: 'pages', at: [0.2, -0.45], count: 3, spread: [0.3, 0.2] }],
    figures: [
      { who: 'ye', at: [0, -0.9], face: [0, 0.6], pose: 'sit', style: 'unskilled' },
      { role: 'soldier', at: [0.2, 1.1], face: [0, -0.9], pose: 'sit', style: 'unskilled' },
    ],
    camera: { target: [0, 0.6, 0], yaw: -0.3, pitch: 0.3, distance: 3.4, drift: { distance: -0.04 } },
  },
  // Ulsan's siege lines in the snow: a northern trooper crouched alone with a frozen toe in his hand.
  toe: {
    id: 'toe', place: 'sarhu', weather: SET_SNOW,
    props: [{ kind: 'snow', at: [0, 0], radius: 30, cover: 1 }, { kind: 'fire', at: [0.9, 0.4], light: 0.6, out: true }],
    figures: [{ role: 'northTrooper', at: [0, 0], face: [1, 0.3], pose: 'crouch' }],
    camera: { target: [0.2, 0.6, 0], yaw: -1.9, pitch: 0.24, distance: 3.6, drift: { distance: -0.04 } },
  },
  // A camp's fire at dusk: one of his men sitting with him by it.
  fireside: {
    id: 'fireside', place: 'sarhu', weather: SET_DUSK,
    props: [{ kind: 'ground', at: [0, 0], radius: 10, colour: '#5a4c3c' }, { kind: 'fire', at: [0, 0], light: 1.3 }],
    figures: [
      { who: 'friend', at: [0.95, 0.35], face: [0, 0], pose: 'sit', style: 'unskilled' },
      { who: 'hero', at: [-0.9, 0.4], face: [0, 0], pose: 'sit', style: 'unskilled' },
    ],
    camera: { target: [0, 0.6, 0.3], yaw: -1.57, pitch: 0.2, distance: 3.6, drift: { distance: -0.04 } },
  },
  // The Hun River camp, the morning before (1621): the sorghum fence, Shen Xiaoyi asking his officer.
  shen: {
    id: 'shen', place: 'sarhu', weather: { fog: [16, 90], sky: 0.65, pale: 0.7, sun: 0.8 },
    props: [{ kind: 'ground', at: [0, 0], radius: 16, colour: SET_EARTH }, { kind: 'fence', from: [4, -6], to: [4, 6], height: 1.5 }],
    figures: [
      { who: 'shen', at: [0.7, 0.2], face: [-0.6, -0.2], pose: 'stand', style: 'unskilled' },
      { who: 'hero', at: [-0.6, -0.2], face: [0.7, 0.2], pose: 'stand', style: 'unskilled', rank: 'officer' },
    ],
    camera: { target: [0.1, 1.35, 0], yaw: -2.1, pitch: 0.08, distance: 3.4, drift: { yaw: 0.008 } },
  },
  // After Sarhu: lines of footprints in the snow going south, and the last few walking.
  footprints: {
    id: 'footprints', place: 'sarhu', weather: SET_SNOW,
    props: [
      { kind: 'snow', at: [0, 0], radius: 34, cover: 1 },
      { kind: 'tracks', from: [12, -1.5], to: [-14, -1.2] }, { kind: 'tracks', from: [12, 0.2], to: [-14, 0.6] },
      { kind: 'tracks', from: [12, 1.6], to: [-2.5, 2.0] }, { kind: 'tracks', from: [12, -3.0], to: [3.5, -3.4] },
    ],
    figures: [
      { role: 'soldier', at: [-6, -1.4], face: [-20, -1.4], pose: 'walk', walk: { to: [-20, -1.4], pace: 0.4 } },
      { role: 'soldier', at: [-8.5, 0.5], face: [-20, 0.6], pose: 'walk', walk: { to: [-20, 0.6], pace: 0.36 } },
      { role: 'soldier', at: [-2.4, 2.0], face: [-1, 2], pose: 'lie' },
    ],
    camera: { target: [0, 0.8, 0], yaw: 0.2, pitch: 0.2, distance: 9.5, drift: { distance: -0.08 } },
  },
  // The road in from Kuandian (1606): the dead along it, a cart, him standing.
  road: {
    id: 'road', place: 'sarhu', weather: SET_GREY,
    props: [{ kind: 'ground', at: [0, 0], radius: 18, colour: '#7a6c58' }, { kind: 'cart', at: [2.5, 0.6], yaw: 3.1 }],
    figures: [
      { role: 'refugee', at: [-1.4, 1.6], face: 0.3, pose: 'lie' },
      { role: 'refugee', at: [-4.2, -1.8], face: 2.1, pose: 'lie' },
      { role: 'oldWoman', at: [-7.5, 1.4], face: 1.0, pose: 'lie' },
      { role: 'refugee', at: [-10, -0.6], face: -0.4, pose: 'lie' },
      { who: 'hero', at: [0.6, -0.4], face: [-6, 0], pose: 'stand', style: 'spear' },
    ],
    camera: { target: [-2.5, 0.8, 0], yaw: 1.2, pitch: 0.18, distance: 7.0, drift: { yaw: -0.01 } },
  },
  // The same road: the old man on his cart, getting down, facing him.
  cart: {
    id: 'cart', place: 'sarhu', weather: SET_GREY,
    props: [{ kind: 'ground', at: [0, 0], radius: 18, colour: '#7a6c58' }, { kind: 'cart', at: [0.4, 1.4], yaw: 0 }],
    figures: [
      { role: 'oldMan', at: [-0.3, 0], face: [1.0, -0.6], pose: 'stand' },
      { who: 'hero', at: [1.0, -0.6], face: [-0.3, 0], pose: 'stand', style: 'spear' },
    ],
    camera: { target: [0.3, 1.2, -0.2], yaw: -2.0, pitch: 0.1, distance: 3.6, drift: { distance: -0.04 } },
  },
  // The ginseng diggers on their knees in the snow, the battalion officer, him.
  diggers: {
    id: 'diggers', place: 'sarhu', weather: SET_SNOW,
    props: [{ kind: 'snow', at: [0, 0], radius: 30, cover: 1 }, { kind: 'trees', from: [-6, 6], to: [8, 6], count: 9 }],
    figures: [
      { role: 'officer', at: [2.2, -1.6], face: [0, 0], pose: 'stand' },
      { who: 'hero', at: [-1.8, -1.8], face: [0, 0], pose: 'stand', style: 'spear' },
    ],
    rows: [{ role: 'digger', count: 3, from: [-1.0, 0.8], step: [1.0, 0], face: [0, -4], pose: 'bowed' }],
    camera: { target: [0, 0.9, 0], yaw: -1.35, pitch: 0.16, distance: 5.6, drift: { distance: -0.05 } },
  },
  // The diggers running into the trees.
  diggersFree: {
    id: 'diggersFree', place: 'sarhu', weather: SET_SNOW,
    props: [{ kind: 'snow', at: [0, 0], radius: 30, cover: 1 }, { kind: 'trees', from: [-6, 7], to: [8, 7], count: 9 }],
    figures: [
      { role: 'digger', at: [-0.6, 1.6], face: [-1, 9], pose: 'walk', walk: { to: [-1, 10], pace: 0.9 } },
      { role: 'digger', at: [0.6, 1.2], face: [1, 9], pose: 'walk', walk: { to: [1.2, 10], pace: 0.85 } },
      { role: 'digger', at: [1.6, 0.6], face: [3, 9], pose: 'walk', walk: { to: [3, 10], pace: 0.8 } },
      { who: 'hero', at: [0, -2.2], face: [0, 6], pose: 'stand', style: 'spear' },
    ],
    camera: { target: [0.4, 1.2, 1.0], yaw: -1.85, pitch: 0.12, distance: 5.4, drift: { distance: 0.04 } },
  },
  // The first winter (1607): Mrs Sun by the lamp in the doorway, sewing the cotton into his coat; him standing in the cold.
  cotton: {
    id: 'cotton', place: 'sarhu', weather: { ...SET_DUSK, fog: [8, 50] },
    props: [{ kind: 'ground', at: [0, 0], radius: 12, colour: SET_YARD }, { kind: 'snow', at: [0, 0], radius: 14, cover: 0.4 }, { kind: 'house', at: [0, 1.6], yaw: 0, width: 6, height: 2.6, door: 1.1, lit: true }, { kind: 'lantern', at: [0.9, 1.2], height: 0.5, light: 1.0, standing: true }],
    figures: [
      { who: 'wife', at: [0.45, 0.9], face: [-0.6, -0.4], pose: 'sit' },
      { who: 'hero', at: [-0.6, -0.4], face: [0.45, 0.9], pose: 'stand', style: 'unskilled' },
    ],
    camera: { target: [0, 0.85, 0.3], yaw: -0.55, pitch: 0.16, distance: 4.4, drift: { distance: -0.04 } },
  },
  // The Suns' yard outside Liaoyang: sorghum drying on the rack, the house, his wife in the doorway, Ahe behind her, and him in
  // the yard.
  yard: {
    id: 'yard', place: 'sarhu', weather: { fog: [16, 90], sky: 0.6, pale: 0.5, sun: 0.95 },
    props: [{ kind: 'ground', at: [0, 0], radius: 14, colour: SET_YARD }, { kind: 'house', at: [0, 2.4], yaw: 0, width: 7, height: 2.7, door: 1.1 }, { kind: 'rack', at: [3.0, 0.6], yaw: 1.57, length: 3.4 }],
    figures: [
      { who: 'wife', at: [0.1, 1.8], face: [-0.9, -1.2], pose: 'stand' },
      { who: 'daughter', at: [0.55, 2.0], face: [-0.9, -1.2], pose: 'stand' },
      { who: 'hero', at: [-0.9, -1.2], face: [0.2, 1.8], pose: 'stand', style: 'unskilled' },
    ],
    // Three-quarters from the side: him on the near side of the yard, the two of them at the door, the yard between.
    camera: { target: [-0.3, 0.85, 0.35], yaw: -0.72, pitch: 0.12, distance: 5.6, drift: { distance: -0.05 } },
  },
  // A winter night: Ahe holding his split hands, breathing on them, both on their knees by the lamp.
  hands: {
    id: 'hands', place: 'sarhu', weather: SET_NIGHT,
    props: [{ kind: 'ground', at: [0, 0], radius: 10, colour: '#4a3e30' }, { kind: 'house', at: [0, 1.9], yaw: 0, width: 6, height: 2.6, door: 1.1, lit: true }, { kind: 'lantern', at: [-0.8, 0.5], height: 0.5, light: 1.3, standing: true }],
    figures: [
      { who: 'daughter', at: [0.05, 0.55], face: [0, -0.6], pose: 'kneel', hands: 'meet' },
      { who: 'hero', at: [0, -0.35], face: [0, 0.55], pose: 'kneel', style: 'unskilled', hands: 'meet' },
    ],
    camera: { target: [0, 0.65, 0.1], yaw: -0.25, pitch: 0.18, distance: 2.8, drift: { distance: -0.03 } },
  },
  // The yard: Liaosheng facing his father.
  son: {
    id: 'son', place: 'sarhu', weather: { fog: [16, 90], sky: 0.6, pale: 0.5, sun: 0.9 },
    props: [{ kind: 'ground', at: [0, 0], radius: 14, colour: SET_YARD }, { kind: 'house', at: [0, 2.6], yaw: 0, width: 7, height: 2.7, door: 1.1 }, { kind: 'rack', at: [-3.2, 0.4], yaw: 1.57, length: 3.4 }],
    figures: [
      { who: 'son', at: [0.6, 0.4], face: [-0.6, -0.4], pose: 'stand' },
      { who: 'hero', at: [-0.7, -0.4], face: [0.6, 0.4], pose: 'stand', style: 'unskilled' },
    ],
    camera: { target: [0, 1.2, 0], yaw: -2.2, pitch: 0.08, distance: 3.6, drift: { yaw: 0.008 } },
  },
  // Outside Liaoyang, 1621, as he cannot help seeing it: his wife and the two children in the doorway, and no one else.
  doorway: {
    id: 'doorway', place: 'sarhu', weather: { fog: [9, 55], sky: 0.9, pale: 0.6, sun: 0.35, dim: 0.7 },
    props: [{ kind: 'ground', at: [0, 0], radius: 14, colour: SET_YARD }, { kind: 'house', at: [0, 1.6], yaw: 0, width: 7, height: 2.7, door: 1.1 }, { kind: 'rack', at: [-3, -0.4], yaw: 1.57, length: 3.4, bare: true }],
    figures: [
      { who: 'wife', at: [0, 1.15], face: [0, -6], pose: 'stand' },
      { who: 'son', at: [0.75, 1.0], face: [0.2, -6], pose: 'stand' },
      { who: 'daughter', at: [-0.6, 1.0], face: [-0.2, -6], pose: 'stand' },
    ],
    camera: { target: [0, 1.0, 0.9], yaw: -1.57, pitch: 0.06, distance: 6.4, drift: { distance: -0.1 } },
  },
  // A night at the fort: a lamp, and him alone by it.
  alone: {
    id: 'alone', place: 'sarhu', weather: SET_NIGHT,
    props: [{ kind: 'ground', at: [0, 0], radius: 10, colour: '#4a3e30' }, { kind: 'lantern', at: [0.6, 0.3], height: 0.5, light: 1.2, standing: true }],
    figures: [{ who: 'hero', at: [0, 0], face: [0.6, 0.3], pose: 'sit', style: 'unskilled' }],
    camera: { target: [0.2, 0.6, 0.1], yaw: -1.9, pitch: 0.22, distance: 3.2, drift: { distance: -0.04 } },
  },
  // The Hun River, as it ends: the fence burning, the company flag down, him on his back among his men.
  field: {
    id: 'field', place: 'sarhu', weather: { fog: [8, 60], colour: 0x8a8682, sky: 1, sun: 0.4, dim: 0.75 },
    props: [
      { kind: 'ground', at: [0, 0], radius: 16, colour: '#5e5244' },
      { kind: 'fence', from: [7, 3.4], to: [-7, 3.4], height: 1.5, burning: true },
      { kind: 'flag', at: [-0.9, 2.1], yaw: 2.7, fallen: true, colour: '#b03a2a' },
      // His waist tag (腰牌), come loose on its cord, by his hip.
      { kind: 'tag', at: [0.42, -0.12], yaw: 0.4 },
    ],
    // Him on his back, his head to the fence; the men of his who fell round him; the Jin standing beyond, in the smoke.
    figures: [
      { who: 'hero', at: [0, 0], face: [0, 3], pose: 'lieUp' },
      { who: 'shen', at: [1.4, -0.7], face: 2.4, pose: 'lie', dead: true, style: 'unskilled' },
      { who: 'lou', at: [-1.6, 0.9], face: -0.6, pose: 'lie', dead: true, style: 'unskilled' },
      { who: 'ma', at: [1.9, 1.7], face: 1.0, pose: 'lie', dead: true, style: 'unskilled' },
      { who: 'zhu', at: [-1.9, -1.2], face: 0.3, pose: 'lie', dead: true, style: 'unskilled' },
      { role: 'soldier', at: [-0.6, 2.4], face: 1.8, pose: 'lie' },
      { role: 'jinSoldier', at: [2.6, -2.4], face: 2.9, pose: 'lie' },
      { role: 'jinSoldier', at: [-2.5, 6.5], face: [0, 0], pose: 'stand' },
      { role: 'jinSoldier', at: [2.8, 7.5], face: [0, 0], pose: 'stand' },
    ],
    camera: { target: [0, 0.3, 0.5], yaw: -1.75, pitch: 0.55, distance: 4.8, drift: { distance: -0.05 } },
  },
};
