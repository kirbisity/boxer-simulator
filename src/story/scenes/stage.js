// Story mode's scenes, staged in the game's own 3D with the real men: a chapter's scene script (src/story/chapters/, the writer's)
// is lines, each with who says it and a `stage` word; this plays it on a world (the battle's field as the battle left it), on the
// world's clock. No DOM: the page draws the lines, the dark and the bars from `sceneLook` (src/story/scenes/view.js), and the
// camera from `sceneFocus`. Built on Level Mode's cutscene machinery: its timing helpers (levelmode/cutscene.js's way of phases on
// a clock, the skip after a moment) and its staging (physics.js's scene kneel, `fighter.kneel` { share, lean, hands }, the one the
// Dunnottar reveal kneels by).
//
// The stage words:
//   cut       the screen goes dark; in the dark the scene is set (the subject's body laid face down where it fell, the hero
//             standing over it, facing it); the dark lifts
//   approach  he steps up beside it (from where he stands)
//   turn      he turns the body over with the shaft of his spear: stooped, the spear down to it, the body rolled onto its back
//   kneel     he lays the spear down and goes down on both knees by it
//   search    his hands at the body's chest (what is in its shirt)
//   still     he kneels on, his hands on it, bowed
//   rise      he gets up
// A line with no stage word goes on as the last left it. The scene's `subject` is whose body it is (else the scene's id, if it
// names one of the cast, else the first of the cast spoken of).
//
// A scene with a `set` (scenes/sets.js: the drill ground, the yard, the gate by lantern) is played on that set's own world, its
// figures placed and held as the set says, and its stage words move whoever the line names (or `word:who`, or a list of them):
//   kneel / bowed / crouch / sit   down as the set's poses have it, eased       rise    back up
//   fall      laid down dead where he is (in the dark, if the screen is going dark)
//   approach  he walks to the hero (the hero: to the line's other speaker), and stops a little short
//   dark      the screen goes dark and stays so          lift    the dark lifts
//   shot:name the camera moves to the set's shot of that name (its `cameras`), and `shot:main` back to its own
// A set scene opens in the dark (the page builds its world under it) and lifts. A line may have its own `when(life)`.

import { P } from '../../body.js';
import { createFighter, dropWeapon, knockOut, placeFighter, placeOnFloor, WORLD } from '../../physics.js';
import { holdPlayer } from '../../levelmode/items.js';
import { worksOf } from '../../physics/fieldworks.js';
import { placeMounted } from '../../physics/mounted.js';
import { storyText } from '../life.js';
import { STORY_SET } from './sets.js';

export const STORY_SCENE = {
  // A line stays up as long as it takes to read it twice, slowly (s): a base and so much a character, by language; never past `most`.
  line: { base: 2.4, perChar: { en: 0.06, zh: 0.22 }, most: 7.5, empty: 2.2 },
  // The cut (s): the dark closes, holds while the scene is set, lifts.
  cut: { close: 0.7, hold: 0.4, lift: 1.1 },
  // The letterbox bars come in over this long (s), and go at the end.
  bars: 0.8,
  // A tap skips a line, but not before this (s into it).
  skipAfter: 0.6,
  // The turn (s): the stoop with the spear, then the roll of the body over this long, eased; rolled onto his back, his chest
  // turned `toward` him (the share of the way over to him from straight up: a body left half on its side rolls back over
  // as its own weight settles it, ~0.3 stays on its back).
  turn: { stoop: 0.5, roll: 1.6, toward: 0.3 },
  // The kneel and the rise (s), eased.
  kneel: 1.2,
  // Where he stands over the body: this far (m) from its hips, on the side its face will turn to; the stoop's lean and how far (m)
  // over the body the spear's hands are held.
  standOff: 1.1,
  stoop: { share: 0.35, lean: 0.3, handsUp: 0.75 },
  // Kneeling: his lean forward over it, bowed.
  bow: { search: 0.35, still: 0.3 },
  // The scene's camera: a low shot across the two of them (rad of pitch, m away, m over the middle it looks at), from the side,
  // `turn` rad off the line from the body to him; back far enough that the ground round them is in it, the two of them alone.
  // If a wall or screen of the field's works stands between (a fence he fell by), the first of `turns` (rad, from the same
  // line) that sees past it.
  camera: { pitch: 0.28, distance: 4.0, lift: 0.2, turn: 2.1, turns: [-2.1, 1.5, -1.5, 2.7, -2.7, 0.9, -0.9] },
  // The last line held this long (s) after it is read, the bars still in.
  endHold: 1.6,
  // Round the two of them (m from the middle of the body and where he stands over it): nobody else lies this close in the shot,
  // and no one stands within `standing` (the company drawn up further off, waiting to fall in); any other man of the field
  // there is moved out to it, and the weapons and hats lying there with him (in the dark), so the two of them have the ground
  // to themselves.
  clear: 4.2,
  clearStanding: 9,
  // A set scene: the dark it opens in held this long (s) before it lifts (the world drawn under it).
  openDark: 0.5,
  // How the dead lie (layOut): not laid out straight as on a bier but as a man falls, each his own way (seeded by who he is),
  // then left to the body's own weight a moment (`settle` s of the ragdoll, physics.js's limp body on the floor) before he is
  // left lying. In his own frame, rad: each arm thrown out from his side by `arm` [least, most] and bent at the elbow by
  // `elbow`; the legs a little apart (`leg`), one knee drawn up and out (`knee`: the one leg, as a man falls forward over a
  // bent knee); the head turned on the neck (`head`, as a face-down man's lies on its cheek). The ranges are what bodies
  // photographed where they fell show (an arm anywhere from along the side to flung out level with the shoulder, seldom
  // both alike).
  sprawl: { arm: [0.1, 1.6], elbow: [0.1, 1.1], leg: [0.04, 0.3], knee: [0.3, 1.1], head: 0.45, settle: 1.4 },
};

/** A number in [-1, 1] for a man and a key, the same each time: his own way of standing, his own way of lying. */
export function sceneVary(fighter, key) {
  let hash = 2166136261;
  for (const char of `${fighter.id}:${fighter.body?.inputs?.name ?? ''}:${key}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return (hash / 4294967295) * 2 - 1;
}
const sceneRange = ([least, most], vary) => least + ((most - least) * (vary + 1)) / 2;

const sceneSmooth = (u) => {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
};
const scenePoint = (fighter, index) => [fighter.x[index * 3], fighter.x[index * 3 + 1], fighter.x[index * 3 + 2]];
const sceneSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const sceneDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sceneCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sceneNorm = (a) => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** The long axis of a body (hips to neck) and the way its chest faces (physics.js: at yaw 0 a man faces +x, his left shoulder at +z). */
export function bodyAxes(fighter) {
  const pelvis = scenePoint(fighter, P.pelvis);
  const axis = sceneNorm(sceneSub(scenePoint(fighter, P.neck), pelvis));
  const across = sceneSub(scenePoint(fighter, P.lShoulder), scenePoint(fighter, P.rShoulder));
  const chest = sceneNorm(sceneCross(axis, across));
  return { pelvis, axis, chest };
}

// The trunk and head: what a body turned over rests on (its limbs fall where the roll leaves them).
const SCENE_TRUNK = [P.head, P.neck, P.lShoulder, P.rShoulder, P.pelvis, P.lHip, P.rHip];

/**
 * Turn a body about its own long axis through its hips by `angle` (rad), and set it on the floor (its lowest part at `floor`;
 * `trunk`: its trunk's lowest, the limbs left to the floor's own push, as a body being rolled over flops).
 */
export function rollBody(fighter, angle, floor = 0, { trunk = false } = {}) {
  const { pelvis, axis } = bodyAxes(fighter);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = fighter.x;
  for (let index = 0; index < x.length / 3; index += 1) {
    const v = [x[index * 3] - pelvis[0], x[index * 3 + 1] - pelvis[1], x[index * 3 + 2] - pelvis[2]];
    const k = sceneCross(axis, v);
    const along = sceneDot(axis, v) * (1 - cos);
    // Rodrigues: v cos + (k × v) sin + k (k · v)(1 − cos).
    for (let c = 0; c < 3; c += 1) x[index * 3 + c] = pelvis[c] + v[c] * cos + k[c] * sin + axis[c] * along;
  }
  let low = Infinity;
  for (const index of trunk ? SCENE_TRUNK : x.keys()) if (index < x.length / 3) low = Math.min(low, x[index * 3 + 1] - (fighter.radius?.[index] ?? 0.05));
  for (let index = 1; index < x.length; index += 3) x[index] += floor - low;
  fighter.prev.set(x);
  fighter.v?.fill?.(0);
}

/**
 * Lay a body down where it lies, face down (the way a man falls forward into mud), its head the way it lay: his own body's
 * proportions (a fresh standing figure of his inputs, physics.js createFighter), sprawled as STORY_SCENE.sprawl has it (the
 * arms thrown out, a knee drawn up, the head turned: his own way), turned to lie along the ground; then his own weight lets it
 * settle (the ragdoll on the floor, `sprawl.settle` s) before it is left lying still (out past WORLD.goneSeconds: not
 * simulated, as the long dead of a battle are), so the scene alone moves it.
 */
export function layOut(fighter, floor = 0, toward = null) {
  const stand = createFighter(fighter.body.inputs, { id: fighter.id, corner: fighter.corner, x: 0, facing: 0, random: () => 0.5 });
  const at = (index) => scenePoint(stand, index);
  const length = (a, b) => Math.hypot(...sceneSub(at(a), at(b)));
  const pelvis = at(P.pelvis);
  // The standing figure straightened, relative to its hips (x ahead, y up, z to his left).
  const local = Array.from({ length: stand.x.length / 3 }, (_, index) => sceneSub(at(index), pelvis));
  local[P.neck] = [0, length(P.pelvis, P.neck), 0];
  local[P.head] = [0, local[P.neck][1] + length(P.neck, P.head), 0];
  const sprawl = STORY_SCENE.sprawl;
  // A limb's way in the plane of his back (his frame: y up the body, z to his left), `angle` rad out from straight down.
  const outward = (angle, side) => [0, -Math.cos(angle), side * Math.sin(angle)];
  const reach = (from, way, by) => from.map((value, c) => value + way[c] * by);
  const headTurn = sceneVary(fighter, 'head') * sprawl.head;
  local[P.head] = reach(local[P.neck], [0, Math.cos(headTurn), Math.sin(headTurn)], length(P.neck, P.head));
  for (const [shoulder, elbow, hand, side] of [[P.lShoulder, P.lElbow, P.lHand, 1], [P.rShoulder, P.rElbow, P.rHand, -1]]) {
    const width = Math.abs(local[shoulder][2]) || 0.17;
    // (Seldom both alike: the right arm mostly the other way from the left.)
    const vary = side === 1 ? sceneVary(fighter, 'arm') : -0.6 * sceneVary(fighter, 'arm') + 0.4 * sceneVary(fighter, 'armOther');
    const thrown = sceneRange(sprawl.arm, vary);
    const bent = thrown + sceneRange(sprawl.elbow, sceneVary(fighter, `elbow${side}`));
    local[shoulder] = [0, local[P.neck][1] - 0.04, side * width];
    local[elbow] = reach(local[shoulder], outward(thrown, side), length(shoulder, elbow));
    local[hand] = reach(local[elbow], outward(bent, side), length(elbow, hand));
  }
  // (The one knee drawn up: the left or the right, as he fell.)
  const drawn = sceneVary(fighter, 'knee') > 0 ? 1 : -1;
  for (const [hip, knee, foot, side] of [[P.lHip, P.lKnee, P.lFoot, 1], [P.rHip, P.rKnee, P.rFoot, -1]]) {
    const width = Math.abs(local[hip][2]) || 0.09;
    const apart = sceneRange(sprawl.leg, sceneVary(fighter, `leg${side}`));
    const bend = side === drawn ? sceneRange(sprawl.knee, sceneVary(fighter, 'kneeBend')) : 0;
    local[hip] = [0, local[hip][1], side * width];
    local[knee] = reach(local[hip], outward(apart + bend, side), length(hip, knee));
    local[foot] = reach(local[knee], outward(apart - bend * 0.4, side), length(knee, foot));
  }
  // Lying: his up along the ground the way his head lay, his front down; his left (a proper turn, not a mirror) across.
  const now = scenePoint(fighter, P.pelvis);
  const head = scenePoint(fighter, P.head);
  // (Or the way the scene lays him: `toward`, his head that way.)
  const flat = toward ? [toward[0], 0, toward[2]] : [head[0] - now[0], 0, head[2] - now[2]];
  const along = Math.hypot(flat[0], flat[2]) > 0.05 ? sceneNorm(flat) : [1, 0, 0];
  const left = [-along[2], 0, along[0]];
  const x = fighter.x;
  local.forEach(([ahead, rise, across], index) => {
    for (let c = 0; c < 3; c += 1) x[index * 3 + c] = now[c] + ahead * [0, -1, 0][c] + rise * along[c] + across * left[c];
  });
  let low = Infinity;
  for (let index = 0; index < x.length / 3; index += 1) low = Math.min(low, x[index * 3 + 1] - (fighter.radius?.[index] ?? 0.05));
  for (let index = 1; index < x.length; index += 3) x[index] += floor - low;
  fighter.prev.set(x);
  fighter.v?.fill?.(0);
  settleBody(fighter);
}

/** A body left to its own weight a moment (STORY_SCENE.sprawl.settle s of the ragdoll), then lying still, unsimulated. */
export function settleBody(fighter) {
  fighter.outFor = WORLD.goneSeconds - STORY_SCENE.sprawl.settle;
  // (Woken, if he had come to rest: physics.js lets a still body sleep.)
  fighter.stillFor = 0;
}

/** The angle (rad) about its long axis that turns a body's chest to face `toward` (a direction: [0, -1, 0] face down). */
export function rollToward(fighter, toward) {
  const { axis, chest } = bodyAxes(fighter);
  const want = sceneNorm(sceneSub(toward, axis.map((value) => value * sceneDot(toward, axis))));
  return Math.atan2(sceneDot(sceneCross(chest, want), axis), sceneDot(chest, want));
}

/** How long a line stays up (s), by its length in the language shown. */
export function lineSeconds(line, language = 'en') {
  const spec = STORY_SCENE.line;
  const text = storyText(line?.line, language);
  if (!text) return spec.empty;
  return Math.min(spec.most, spec.base + text.length * (spec.perChar[language] ?? spec.perChar.en));
}

/**
 * Whose body the scene is about: its `subject`, else its id if that is one of the cast, else the first of the cast spoken of,
 * else (a scene of mourning: a kneel in it) the first of the battle's named men who fell (`fallen`, in the setup's order).
 */
function sceneSubject(scene, cast, fallen = []) {
  if (scene.subject && cast[scene.subject] !== undefined) return scene.subject;
  if (cast[scene.id] !== undefined) return scene.id;
  const spoken = scene.script?.map((line) => line.who).find((who) => cast[who] !== undefined && who !== 'hero');
  if (spoken) return spoken;
  const mourns = scene.script?.some((line) => sceneWords(line).some(({ word }) => ['kneel', 'search', 'still', 'turn'].includes(word)));
  return mourns ? fallen.find((id) => cast[id] !== undefined) ?? null : null;
}

/**
 * A line's stage words, each with whom it moves (null: as the scene has it) and, for `approach`, to whom: 'kneel', 'fall:jin',
 * ['dark', 'fall:jin'], 'approach:hero:daughter'.
 */
export function sceneWords(line) {
  const words = Array.isArray(line?.stage) ? line.stage : line?.stage ? [line.stage] : [];
  return words.map((entry) => {
    const [word, who, to] = String(entry).split(':');
    return { word, who: who ?? null, to: to ?? null };
  });
}

/** A line is for this life (its own `when`, if it has one; a `when` that throws is not). */
function sceneLineFor(line, life) {
  if (typeof line.when !== 'function') return true;
  try {
    return Boolean(line.when(life));
  } catch {
    return false;
  }
}

/**
 * The lines as staged: a scene about a body opens in the dark (its first line a `cut`, unless it stages something itself), and
 * a body that is to be knelt by is first turned over (a silent `turn` after the opening line, if the script has none). A set
 * scene's lines are as written.
 */
function sceneLines(scene, subject, life, staged) {
  const lines = (scene.script ?? []).filter((line) => sceneLineFor(line, life)).map((line) => ({ ...line }));
  if (staged || subject === null || !lines.length) return lines;
  if (!sceneWords(lines[0]).length) lines[0].stage = 'cut';
  if (!lines.some((line) => sceneWords(line).some(({ word }) => word === 'turn'))) lines.splice(1, 0, { who: 'narrator', stage: 'turn', line: { zh: '', en: '' } });
  return lines;
}

/** How long a line holds (s): read, its dark closing first if it brings one, and the last held on. */
function sceneLineLength(play, index) {
  const line = play.lines[index];
  if (!line) return 0;
  const words = sceneWords(line).map(({ word }) => word);
  const dark = words.includes('cut') ? STORY_SCENE.cut.close + STORY_SCENE.cut.hold : words.includes('dark') ? STORY_SCENE.cut.close : 0;
  const opening = play.staged && index === 0 ? STORY_SCENE.openDark : 0;
  return line.seconds + dark + opening + (index === play.lines.length - 1 ? STORY_SCENE.endHold : 0);
}

/**
 * Begin a scene on a world: `hero` the index of the man played, `cast` { id: index } (the battle's named men, or a set's
 * figures), `fallen` the ids of those who fell in it, `language`, `life` (for the lines' own `when`), `figures` (a set's: from
 * storySetSetup, placed and posed by the scene), `camera` (a set's).
 * Returns the play's state; `stepScene` moves it on.
 */
export function createScenePlay(world, scene, { hero, cast = {}, fallen = [], language = 'en', life = null, figures = null, camera = null, cameras = {} } = {}) {
  const staged = Boolean(figures);
  const subjectId = staged ? null : sceneSubject(scene, cast, fallen);
  const lines = sceneLines(scene, subjectId, life, staged).map((line) => ({ ...line, seconds: lineSeconds(line, language) }));
  return {
    world, scene, hero, cast, language, lines, subjectId, subject: subjectId !== null ? cast[subjectId] : null,
    index: 0, into: 0, time: 0, set: false, done: false, roll: null, stage: null, stageSince: 0, cut: null, ending: 0,
    // A set's figures, each { index, who, at, yaw, pose, since, share, walk }, and its camera; the screen's own dark
    // ({ from, to, at, seconds }: a set scene opens in it); the men to lay down once it is dark.
    staged, figures: staged ? figures.map((figure) => ({ ...figure })) : null, camera, cameras: { main: camera, ...cameras }, cameraAt: 0,
    dark: staged ? { from: 1, to: 0, at: STORY_SCENE.openDark, seconds: STORY_SCENE.cut.lift } : null,
    falls: [],
    cameraTurn: undefined,
  };
}

const sceneHeroOf = (play) => play.world.fighters[play.hero];
const sceneSubjectOf = (play) => (play.subject !== null ? play.world.fighters[play.subject] : null);

/**
 * Clear the ground round the body: every other man of the field within STORY_SCENE.clear of the middle of the two of them moved
 * straight out to that distance (in the dark: the shot is of the two of them alone).
 */
function clearRound(play, body, standAt) {
  const pelvis = scenePoint(body, P.pelvis);
  const centre = [(pelvis[0] + standAt[0]) / 2, (pelvis[2] + standAt[1]) / 2];
  const hero = sceneHeroOf(play);
  // How far a thing at `at` must go straight out from the middle to be `reach` from it ([dx, dz]), or null if it is far enough.
  const outTo = (at, reach) => {
    const off = [at[0] - centre[0], at[1] - centre[1]];
    const distance = Math.hypot(off[0], off[1]);
    if (distance >= reach) return null;
    const way = distance > 0.05 ? [off[0] / distance, off[1] / distance] : [1, 0];
    return [centre[0] + way[0] * reach - at[0], centre[1] + way[1] * reach - at[1]];
  };
  for (const other of play.world.fighters) {
    if (other === body || other === hero) continue;
    const by = outTo([other.x[P.pelvis * 3], other.x[P.pelvis * 3 + 2]], other.state === 'out' ? STORY_SCENE.clear : STORY_SCENE.clearStanding);
    if (!by) continue;
    // (A man on his horse goes with it, the two set down together.)
    if (other.mount && other.state !== 'out') placeMounted(other, other.mount.at[0] + by[0], other.mount.at[1] + by[1], other.yaw);
    else placeFighter(other, other.root[0] + by[0], other.root[1] + by[1]);
    other.v?.fill?.(0);
  }
  // What lies on the ground there (dropped weapons, hats knocked off), but his own.
  for (const thing of [...(play.world.debris ?? []), ...(play.world.props ?? [])]) {
    if (thing.owner === hero?.id || !Array.isArray(thing.x) || thing.attached) continue;
    const by = outTo([thing.x[0], thing.x[2]], STORY_SCENE.clear);
    if (!by) continue;
    thing.x[0] += by[0];
    thing.x[2] += by[1];
  }
}

/** The scene set, in the dark of a cut: the subject laid face down where he lies (out, if he was not), the hero over him. */
function setScene(play) {
  play.set = true;
  if (play.staged) {
    stageSetFigures(play.world, play.figures);
    return;
  }
  const world = play.world;
  const hero = sceneHeroOf(play);
  const body = sceneSubjectOf(play);
  if (!hero || !body) return;
  // (Fallen in the story: if the battle left him crawling or senseless, he lies still now.)
  if (body.state !== 'out') knockOut(world, body, { time: world.time, effects: [], attacker: null }, 'lies dead in the mud', 'killed');
  layOut(body);
  // Where he stands: beside the hips, on the side the chest will face when turned up (the roll goes toward him), facing the body.
  const { pelvis, axis } = bodyAxes(body);
  const side = sceneNorm(sceneCross([0, 1, 0], axis));
  const at = [pelvis[0] + side[0] * STORY_SCENE.standOff, pelvis[2] + side[2] * STORY_SCENE.standOff];
  const yaw = Math.atan2(-(pelvis[2] - at[1]), pelvis[0] - at[0]);
  hero.punch = null;
  hero.rush = null;
  hero.clinch = null;
  hero.kneel = undefined;
  placeOnFloor(hero, at[0], at[1], 0, yaw);
  hero.yaw = yaw;
  hero.prev.set(hero.x);
  hero.v?.fill?.(0);
  play.side = side;
  clearRound(play, body, at);
}

// ---- A set's figures --------------------------------------------------------------------------------------------------------

/** Lay a man down dead where he stands: out, laid straight (face down, or face up: `up`). */
export function layDead(world, fighter, { up = false, reason = 'lies dead', yaw = null } = {}) {
  if (fighter.state !== 'out') knockOut(world, fighter, { time: world.time, effects: [], attacker: null }, reason, 'killed');
  fighter.kneel = undefined;
  // (Laid along the way he faced, his head that way: a set's `face`.)
  layOut(fighter, 0, yaw === null ? null : [Math.cos(yaw), 0, -Math.sin(yaw)]);
  if (up) rollBody(fighter, rollToward(fighter, [0, 1, 0]));
}

/**
 * Put a set's figures where it says, before the first step (in the dark): each on his spot facing his way; the dead laid down;
 * the kneeling already down (a set opens on the moment, not on the getting there).
 */
export function stageSetFigures(world, figures) {
  for (const figure of figures) {
    const fighter = world.fighters[figure.index];
    if (!fighter) continue;
    placeOnFloor(fighter, figure.at[0], figure.at[1], 0, figure.yaw);
    fighter.yaw = figure.yaw;
    fighter.prev.set(fighter.x);
    fighter.v?.fill?.(0);
    holdPlayer(fighter);
    // Standing at ease (walk mode's stance: the guard down, the hands by his sides), not on guard: nobody here is fighting.
    fighter.walking = true;
    figure.since = -Infinity;
    figure.share = STORY_SET.poses[figure.pose] ? 1 : 0;
    fighter.ease = STORY_SET.poses[figure.pose] ? undefined : easeFor(fighter, { walking: figure.pose === 'walk' });
    if (figure.pose === 'lie' || figure.pose === 'lieUp') layDead(world, fighter, { up: figure.pose === 'lieUp', yaw: figure.yaw });
  }
  return figures;
}

/**
 * How a man stands at ease (STORY_SET.ease; physics.js easePose takes it): his free hands down by his thighs, a long weapon
 * grounded by his foot or a short one held point down (`walking`: only the weapon, at the slope or low, his arms left to the
 * stride), the shield hung at his side, the feet side by side; his own lean, weight shift and turn of the head, and the slow
 * sway of a man standing (`time`, s).
 */
export function easeFor(fighter, { walking = false, time = 0 } = {}) {
  const spec = STORY_SET.ease;
  const toSide = ([ahead, up, out], side) => [ahead, up, side === 'l' ? out : -out];
  // A hand let down by his side (`ahead`, `out` of height, the arm `hang` of its length below the shoulder: his own body's).
  const H = fighter.body.heightM;
  const L = fighter.body.lengths;
  const shoulder = [0, L.ankle + L.shank + L.thigh + L.trunk - 0.025 * H, L.shoulderSpan / 2];
  const hanging = ({ ahead, out, hang }) => {
    const arm = (L.upperArm + L.forearmToFist) * hang;
    const across = out * H - shoulder[2];
    const down = Math.sqrt(Math.max(0, arm * arm - (ahead * H) ** 2 - across * across));
    return [ahead, (shoulder[1] - down) / H, out];
  };
  const hands = walking ? {} : { l: toSide(hanging(spec.hand), 'l'), r: toSide(hanging(spec.hand), 'r') };
  if (fighter.shield && !walking) hands.l = toSide(spec.shield, 'l');
  let bladeDir = null;
  const weapon = fighter.weapon?.held ? fighter.weapon : null;
  if (weapon) {
    const side = weapon.main;
    const long = weapon.spec.length + weapon.spec.handle >= spec.grounded.from;
    if (long && !walking) {
      // Stood on its butt: the hand as high up the shaft as its grip is from the butt (on the floor), within his reach.
      const grounded = spec.grounded;
      const up = Math.min(grounded.most, Math.max(grounded.hand[1], (weapon.spec.handle * Math.cos(grounded.lean) + grounded.floor) / H));
      hands[side] = toSide([grounded.hand[0], up, grounded.hand[2]], side);
      bladeDir = toSide([Math.sin(grounded.lean) * 0.4, Math.cos(grounded.lean), Math.sin(grounded.lean)], side);
    } else {
      const carry = long ? spec.carried : spec.low;
      hands[side] = toSide(Array.isArray(carry.hand) ? carry.hand : hanging(carry.hand), side);
      bladeDir = toSide(carry.dir, side);
    }
  }
  if (walking) return { hands, bladeDir };
  const vary = spec.vary;
  const weight = sceneVary(fighter, 'weight');
  return {
    hands, bladeDir,
    stance: { ...spec.stance, stagger: spec.stance.stagger * Math.sign(sceneVary(fighter, 'foot') || 1) },
    roll: vary.roll * weight + spec.sway.roll * Math.sin(Math.PI * 2 * spec.sway.hz * time + (fighter.id ?? 0) * 1.7),
    hipYaw: vary.hipYaw * weight,
    twist: vary.twist * sceneVary(fighter, 'twist'),
    lean: vary.lean * sceneVary(fighter, 'lean'),
    headOffset: [0, -Math.abs(vary.head * sceneVary(fighter, 'nod')), vary.head * sceneVary(fighter, 'head')],
  };
}

/** A figure's hands for his pose: behind his back (bound), or held out before him to meet another's (a child's round his). */
function setHands(fighter, figure, share) {
  const pelvis = scenePoint(fighter, P.pelvis);
  const forward = [Math.cos(fighter.yaw), 0, -Math.sin(fighter.yaw)];
  const left = [-forward[2], 0, forward[0]];
  if (STORY_SET.poses[figure.pose]?.behind) {
    const back = [pelvis[0] - forward[0] * 0.2, pelvis[1] + 0.05, pelvis[2] - forward[2] * 0.2];
    return [back.map((v, i) => v + left[i] * 0.06), back.map((v, i) => v - left[i] * 0.06)];
  }
  if (figure.hands === 'meet') {
    const neck = scenePoint(fighter, P.neck);
    const out = [pelvis[0] + forward[0] * 0.42, (neck[1] + pelvis[1]) / 2 - 0.02 * share, pelvis[2] + forward[2] * 0.42];
    return [out.map((v, i) => v + left[i] * 0.05), out.map((v, i) => v - left[i] * 0.05)];
  }
  return restHands(fighter);
}

/** A kneeling man's hands at rest on his thighs, as a man kneels or squats with nothing in his hands (STORY_SET.rest). */
function restHands(fighter) {
  const pelvis = scenePoint(fighter, P.pelvis);
  const forward = [Math.cos(fighter.yaw), 0, -Math.sin(fighter.yaw)];
  const left = [-forward[2], 0, forward[0]];
  const rest = STORY_SET.rest;
  const knee = [pelvis[0] + forward[0] * rest.ahead, pelvis[1] + rest.up, pelvis[2] + forward[2] * rest.ahead];
  return [knee.map((v, i) => v + left[i] * rest.apart), knee.map((v, i) => v - left[i] * rest.apart)];
}

/** Each step: every figure held where he is and posed as the set or the line says (the walkers walked), the dead left lying. */
export function poseSetFigures(world, figures, time) {
  const spec = STORY_SET.walk;
  for (const figure of figures) {
    const fighter = world.fighters[figure.index];
    // (Not yet placed: the page may step the world once before the scene sets it.)
    if (!fighter || fighter.state === 'out' || figure.since === undefined) continue;
    if (figure.pose === 'walk' && figure.walk) {
      const to = figure.walk.to;
      const distance = Math.hypot(to[0] - fighter.root[0], to[1] - fighter.root[1]);
      const pace = figure.walk.pace ?? spec.pace;
      if (distance > (figure.walk.stop ?? spec.stop)) {
        fighter.goTo = [to[0], 0, to[1]];
        fighter.move = pace;
        fighter.strafe = 0;
        fighter.running = pace > spec.run;
        fighter.kneel = undefined;
        fighter.ease = easeFor(fighter, { walking: true });
        continue;
      }
      Object.assign(figure, { pose: figure.walk.then ?? 'stand', since: time, share: 0 });
    }
    holdPlayer(fighter);
    const pose = STORY_SET.poses[figure.pose];
    const eased = sceneSmooth((time - figure.since) / STORY_SCENE.kneel);
    // (Standing, at ease; down on his knees, the kneel has his hands.)
    fighter.ease = pose ? undefined : easeFor(fighter, { time: world.time });
    if (pose) {
      figure.share = Math.max(figure.share ?? 0, eased);
      const share = pose.share * figure.share;
      fighter.kneel = { share, lean: figure.lean ?? pose.lean, hands: setHands(fighter, figure, share) };
    } else if (fighter.kneel) {
      // Getting up: the kneel let go, eased.
      const share = (1 - eased) * (figure.from ?? fighter.kneel.share ?? 0);
      figure.from ??= fighter.kneel.share ?? 0;
      fighter.kneel = share > 0.02 ? { ...fighter.kneel, share, hands: null } : undefined;
      if (!fighter.kneel) figure.from = undefined;
    }
  }
}

/** A figure is told a stage word (`who` a figure's name, or a role's: every figure of that role, as the row of the condemned). */
function setWord(play, word, who, to = null) {
  const named = play.figures.filter((each) => each.who === who);
  const figures = named.length ? named : play.figures.filter((each) => String(each.who).startsWith(`${who}-`));
  for (const figure of figures) setFigureWord(play, figure, word, to);
}

function setFigureWord(play, figure, word, to = null) {
  const index = figure.index;
  const fighter = play.world.fighters[index];
  if (STORY_SET.poses[word]) Object.assign(figure, { pose: word, since: play.time, share: 0 });
  else if (word === 'rise') Object.assign(figure, { pose: 'stand', since: play.time, from: undefined });
  else if (word === 'fall') play.falls.push(figure);
  else if (word === 'approach') {
    // To the one named (`approach:who:to`), else to the hero (the hero himself: to the first other figure who is not lying).
    const toward = to ? play.figures.find((each) => each.who === to) : figure.index === play.hero ? play.figures.find((each) => each.index !== index && !['lie', 'lieUp'].includes(each.pose)) : play.figures.find((each) => each.index === play.hero);
    const target = toward ? play.world.fighters[toward.index] : null;
    if (!target || !fighter) return;
    const at = [target.root[0], target.root[1]];
    const off = [fighter.root[0] - at[0], fighter.root[1] - at[1]];
    const distance = Math.hypot(off[0], off[1]) || 1;
    const short = STORY_SET.walk.short;
    Object.assign(figure, { pose: 'walk', walk: { to: [at[0] + (off[0] / distance) * short, at[1] + (off[1] / distance) * short], pace: STORY_SET.walk.slow, stop: 0.1 } });
  }
}

/** A line's words begin: the screen's (dark, lift) and the figures' (each word to the one it names, else the line's speaker if he is a figure, else the hero). */
function setLineWords(play, line) {
  for (const { word, who, to } of sceneWords(line)) {
    if (word === 'dark') play.dark = { from: sceneDark(play), to: 1, at: play.time, seconds: STORY_SCENE.cut.close };
    else if (word === 'lift') play.dark = { from: sceneDark(play), to: 0, at: play.time, seconds: STORY_SCENE.cut.lift };
    else if (word === 'shot') {
      if (play.cameras[who]) Object.assign(play, { camera: play.cameras[who], cameraAt: play.time });
    } else setWord(play, word, who ?? (play.cast[line.who] !== undefined ? line.who : 'hero'), to);
  }
}

/** The screen's own dark now (0..1): a set scene's opening, and its `dark` and `lift`. */
function sceneDark(play) {
  if (!play.dark) return 0;
  const u = sceneSmooth((play.time - play.dark.at) / play.dark.seconds);
  return play.dark.from + (play.dark.to - play.dark.from) * u;
}

// ---- The play ----------------------------------------------------------------------------------------------------------------

/** A stage word begins. */
function beginStage(play, stage) {
  play.stage = stage;
  play.stageSince = play.time;
  const hero = sceneHeroOf(play);
  const body = sceneSubjectOf(play);
  if (stage === 'cut') play.cut = { at: play.time };
  if (stage === 'turn' && body) {
    // Face up, the chest turned toward where he stands.
    const lean = STORY_SCENE.turn.toward;
    const toward = play.side ? [play.side[0] * lean, 1, play.side[2] * lean] : [0, 1, 0];
    play.roll = { from: 0, total: rollToward(body, sceneNorm(toward)), done: 0, at: play.time + STORY_SCENE.turn.stoop };
  }
  if (stage === 'kneel' && hero?.weapon) dropWeapon(play.world, hero, 'dropped');
}

/** A line comes up: its stage words begin. */
function beginLine(play, line) {
  if (!line) return;
  if (play.staged) {
    setLineWords(play, line);
    return;
  }
  const [first] = sceneWords(line);
  if (first) beginStage(play, first.word);
}

/** The hero's pose for the stage now, each step. */
function poseHero(play) {
  const hero = sceneHeroOf(play);
  const body = sceneSubjectOf(play);
  if (!hero || hero.state === 'out') return;
  holdPlayer(hero);
  const since = play.time - play.stageSince;
  const stage = play.stage;
  const kneel = hero.kneel ?? { share: 0 };
  if (stage === 'turn' && body) {
    const { pelvis } = bodyAxes(body);
    const shoulder = scenePoint(body, P.rShoulder);
    const over = [(pelvis[0] + shoulder[0]) / 2, Math.max(pelvis[1], shoulder[1]) + STORY_SCENE.stoop.handsUp, (pelvis[2] + shoulder[2]) / 2];
    hero.kneel = { share: STORY_SCENE.stoop.share * sceneSmooth(since / STORY_SCENE.turn.stoop), lean: STORY_SCENE.stoop.lean, hands: [over, over] };
  } else if (stage === 'kneel' || stage === 'search' || stage === 'still') {
    const share = stage === 'kneel' ? Math.max(kneel.share ?? 0, sceneSmooth(since / STORY_SCENE.kneel)) : 1;
    const chest = body ? scenePoint(body, P.neck).map((value, index) => (value + scenePoint(body, P.pelvis)[index] * 0.6) / 1.6) : null;
    // (Kneeling, his hands on his thighs; searching and still, on the body.)
    const hands = stage === 'kneel' || !chest ? restHands(hero) : [[chest[0], chest[1] + 0.04, chest[2] - 0.1], [chest[0], chest[1] + 0.04, chest[2] + 0.1]];
    hero.kneel = { share, lean: STORY_SCENE.bow[stage] ?? 0.2, hands };
  } else if (stage === 'rise') {
    const share = 1 - sceneSmooth(since / STORY_SCENE.kneel);
    hero.kneel = share > 0.02 ? { ...kneel, share, hands: null } : undefined;
  }
}

/** The body's roll during a turn, eased over its seconds. */
function rollStep(play) {
  const body = sceneSubjectOf(play);
  if (!play.roll || !body) return;
  const u = sceneSmooth((play.time - play.roll.at) / STORY_SCENE.turn.roll);
  const wanted = play.roll.total * u;
  const by = wanted - play.roll.done;
  if (Math.abs(by) > 1e-4) {
    // (Turned over by the trunk, his limbs left to fall where they will, his own weight on them as he goes.)
    rollBody(body, by, 0, { trunk: true });
    settleBody(body);
    play.roll.done = wanted;
  }
  if (u >= 1) play.roll = null;
}

/** The men to lay down in the dark: laid once it is dark (or at once, with no dark coming). */
function fallStep(play) {
  if (!play.falls.length) return;
  if (play.dark && play.dark.to === 1 && sceneDark(play) < 0.98) return;
  for (const figure of play.falls.splice(0)) {
    const fighter = play.world.fighters[figure.index];
    if (fighter) layDead(play.world, fighter);
    figure.pose = 'lie';
  }
}

/**
 * Move the scene on by `dt` s of the world's clock. Returns what fell due: { line } when a line comes up (its index), 'done' at
 * the end. The world itself is stepped by the page (or the test), the scene's posing each step through `sceneThink`.
 */
export function stepScene(play, dt) {
  const due = [];
  if (play.done) return due;
  if (play.time === 0 && play.index === 0 && !play.started) {
    play.started = true;
    due.push({ line: 0 });
    const first = play.lines[0];
    beginLine(play, first);
    if (play.staged || sceneWords(first)[0]?.word !== 'cut') setScene(play);
  }
  play.time += dt;
  play.into += dt;
  // In a cut, the scene is set once the dark has closed.
  if (play.cut && !play.set && play.time - play.cut.at >= STORY_SCENE.cut.close) setScene(play);
  fallStep(play);
  rollStep(play);
  const line = play.lines[play.index];
  if (line && play.into >= sceneLineLength(play, play.index)) {
    play.index += 1;
    play.into = 0;
    if (play.index >= play.lines.length) {
      play.done = true;
      // (At ease no longer: whatever comes next has them as it finds them.)
      for (const fighter of play.world.fighters) fighter.ease = undefined;
      due.push('done');
    } else {
      due.push({ line: play.index });
      beginLine(play, play.lines[play.index]);
    }
  }
  if (!play.lines.length && !play.done) {
    play.done = true;
    due.push('done');
  }
  return due;
}

/** Each step of the world while the scene plays: the poses as the stage has them (the page or the test calls it in the world's think). */
export function sceneThink(play) {
  if (!play || play.done) return;
  if (play.staged) {
    poseSetFigures(play.world, play.figures, play.time);
    return;
  }
  // (The fighting over: every man still on his feet stands at ease, the hero too while he is not stooped or down by the body.)
  for (const fighter of play.world.fighters) if (fighter.state === 'up' && !fighter.kneel) fighter.ease = easeFor(fighter, { time: play.world.time });
  poseHero(play);
}

/**
 * The world's men the scene holds (they think nothing of their own while it plays): a set's every figure; on a battle's field,
 * everyone (the fighting is over while he kneels: nobody walks back into the shot, or at him).
 */
export function sceneHeld(play) {
  if (!play || play.done) return [];
  const indices = play.staged ? play.figures.map((figure) => figure.index) : play.world.fighters.map((_, index) => index);
  return indices.map((index) => play.world.fighters[index]?.id).filter((id) => id !== undefined);
}

/** Skip to the next line (a tap), once the line has been up a moment. */
export function skipSceneLine(play) {
  if (play.done || play.into < STORY_SCENE.skipAfter) return false;
  play.into = sceneLineLength(play, play.index);
  return true;
}

/** What the screen shows now: { black (0..1), bars (0..1), line: { who, text } | null }. */
export function sceneLook(play) {
  const spec = STORY_SCENE;
  let black = 0;
  if (play.cut) {
    const t = play.time - play.cut.at;
    black = t < spec.cut.close ? sceneSmooth(t / spec.cut.close) : 1 - sceneSmooth((t - spec.cut.close - spec.cut.hold) / spec.cut.lift);
  }
  black = Math.max(black, sceneDark(play));
  const bars = play.done ? 0 : sceneSmooth(play.time / spec.bars);
  const line = play.lines[play.index];
  const cutting = sceneWords(line).some(({ word }) => word === 'cut');
  const opening = play.staged && play.index === 0 && play.time < spec.openDark;
  const shown = line && !opening && (!cutting || play.time - (play.cut?.at ?? 0) >= spec.cut.close);
  return { black: Math.max(0, Math.min(1, black)), bars, line: shown ? { who: line.who, text: storyText(line.line, play.language) } : null };
}

/** A set's camera at `time` s into it: its own shot, drifting as it says (`drift`: rad of yaw a second, a share of its distance in ten). */
export function setFocus(camera, time) {
  if (!camera?.target) return null;
  const drift = camera.drift ?? {};
  return {
    target: [...camera.target],
    yaw: camera.yaw + (drift.yaw ?? 0) * time,
    pitch: camera.pitch,
    distance: camera.distance * Math.max(0.5, 1 + ((drift.distance ?? 0) * time) / 10),
  };
}

/** Where the scene's camera looks, and from where: { target [x, y, z], yaw, pitch, distance } (the page eases its orbit to it). */
export function sceneFocus(play) {
  if (play.staged) return setFocus(play.camera, play.time - play.cameraAt);
  const hero = sceneHeroOf(play);
  const body = sceneSubjectOf(play);
  if (!hero) return null;
  const head = scenePoint(hero, P.pelvis);
  const lying = body ? scenePoint(body, P.pelvis) : head;
  const middle = [(head[0] + lying[0]) / 2, Math.min(head[1], 0.9) * 0.5 + STORY_SCENE.camera.lift, (head[2] + lying[2]) / 2];
  const across = Math.atan2(head[2] - lying[2], head[0] - lying[0]);
  // (The side chosen once the scene is set, and kept: the camera does not jump from side to side as he moves.)
  if (play.set && play.cameraTurn === undefined) play.cameraTurn = sceneCameraTurn(play.world, middle, across);
  return { target: middle, yaw: across + (play.cameraTurn ?? STORY_SCENE.camera.turn), pitch: STORY_SCENE.camera.pitch, distance: STORY_SCENE.camera.distance };
}

/** The way round the two of them the camera stands (rad off the line from the body to him): its own, else one no wall hides. */
function sceneCameraTurn(world, middle, across) {
  const spec = STORY_SCENE.camera;
  const turns = [spec.turn, ...spec.turns];
  const yaw = sceneClearYaw(world, [middle[0], middle[2]], spec.distance * Math.cos(spec.pitch), turns.map((turn) => across + turn));
  return yaw === null ? spec.turn : turns[turns.findIndex((turn) => across + turn === yaw)];
}

/**
 * Of the camera's ways round a point on the floor (`yaws`, rad, in the order wanted; the camera `reach` m out on the floor),
 * the first from which no wall or screen of the field's works stands between it and the point; null if every one is hidden.
 */
export function sceneClearYaw(world, at, reach, yaws) {
  const works = worksOf(world?.arena);
  const walls = works ? [...(works.walls ?? []), ...(works.screens ?? [])] : [];
  // Whether the floor's line from a to b crosses the wall's (2D: a wall stands taller than the shot's low eye).
  const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const crosses = (a, b, wall) => side(a, b, wall.a) * side(a, b, wall.b) < 0 && side(wall.a, wall.b, a) * side(wall.a, wall.b, b) < 0;
  for (const yaw of yaws) {
    const eye = [at[0] + Math.cos(yaw) * reach, at[1] + Math.sin(yaw) * reach];
    if (!walls.some((wall) => crosses(at, eye, wall))) return yaw;
  }
  return null;
}
