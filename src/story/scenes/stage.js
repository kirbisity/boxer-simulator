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

import { P } from '../../body.js';
import { createFighter, dropWeapon, knockOut, placeOnFloor, WORLD } from '../../physics.js';
import { holdPlayer } from '../../levelmode/items.js';
import { storyText } from '../life.js';

export const STORY_SCENE = {
  // A line stays up as long as it takes to read it twice, slowly (s): a base and so much a character, by language; never past `most`.
  line: { base: 2.4, perChar: { en: 0.06, zh: 0.22 }, most: 7.5, empty: 2.2 },
  // The cut (s): the dark closes, holds while the scene is set, lifts.
  cut: { close: 0.7, hold: 0.4, lift: 1.1 },
  // The letterbox bars come in over this long (s), and go at the end.
  bars: 0.8,
  // A tap skips a line, but not before this (s into it).
  skipAfter: 0.6,
  // The turn (s): the stoop with the spear, then the roll of the body over this long, eased.
  turn: { stoop: 0.5, roll: 1.6 },
  // The kneel and the rise (s), eased.
  kneel: 1.2,
  // Where he stands over the body: this far (m) from its hips, on the side its face will turn to; the stoop's lean and how far (m)
  // over the body the spear's hands are held.
  standOff: 0.8,
  stoop: { share: 0.35, lean: 0.3, handsUp: 0.75 },
  // Kneeling: his lean forward over it, bowed.
  bow: { search: 0.35, still: 0.3 },
  // The scene's camera: a low, close shot across the two of them (rad of pitch, m away, m over the middle it looks at), from the
  // side, `turn` rad off the line from the body to him.
  camera: { pitch: 0.32, distance: 3.0, lift: 0.15, turn: 1.25 },
  // The last line held this long (s) after it is read, the bars still in.
  endHold: 1.6,
};

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

/** Turn a body about its own long axis through its hips by `angle` (rad), and set it on the floor (its lowest part at `floor`). */
export function rollBody(fighter, angle, floor = 0) {
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
  for (let index = 0; index < x.length / 3; index += 1) low = Math.min(low, x[index * 3 + 1] - (fighter.radius?.[index] ?? 0.05));
  for (let index = 1; index < x.length; index += 3) x[index] += floor - low;
  fighter.prev.set(x);
  fighter.v?.fill?.(0);
}

/**
 * Lay a body out straight where it lies, face down (the way a man falls forward into mud), its head the way it lay: his own
 * body's proportions (a fresh standing figure of his inputs, physics.js createFighter), the arms down at his sides and the legs
 * together, turned to lie along the ground; then left lying still (out past WORLD.goneSeconds: not simulated, as the long dead
 * of a battle are), so the scene alone moves it.
 */
export function layOut(fighter, floor = 0) {
  const stand = createFighter(fighter.body.inputs, { id: fighter.id, corner: fighter.corner, x: 0, facing: 0, random: () => 0.5 });
  const at = (index) => scenePoint(stand, index);
  const length = (a, b) => Math.hypot(...sceneSub(at(a), at(b)));
  const pelvis = at(P.pelvis);
  // The standing figure straightened, relative to its hips (x ahead, y up, z to his left).
  const local = Array.from({ length: stand.x.length / 3 }, (_, index) => sceneSub(at(index), pelvis));
  const up = (from, by) => [local[from][0] * 0, local[from][1] + by, local[from][2]];
  local[P.neck] = [0, length(P.pelvis, P.neck), 0];
  local[P.head] = [0, local[P.neck][1] + length(P.neck, P.head), 0];
  for (const [shoulder, elbow, hand, side] of [[P.lShoulder, P.lElbow, P.lHand, 1], [P.rShoulder, P.rElbow, P.rHand, -1]]) {
    const width = Math.abs(local[shoulder][2]) || 0.17;
    local[shoulder] = [0, local[P.neck][1] - 0.04, side * width];
    local[elbow] = [0, local[shoulder][1] - length(shoulder, elbow), side * (width + 0.03)];
    local[hand] = [0, local[elbow][1] - length(elbow, hand), side * (width + 0.05)];
  }
  for (const [hip, knee, foot, side] of [[P.lHip, P.lKnee, P.lFoot, 1], [P.rHip, P.rKnee, P.rFoot, -1]]) {
    const width = Math.abs(local[hip][2]) || 0.09;
    local[hip] = [0, local[hip][1], side * width];
    local[knee] = up(hip, -length(hip, knee));
    local[foot] = up(knee, -length(knee, foot));
  }
  // Lying: his up along the ground the way his head lay, his front down; his left (a proper turn, not a mirror) across.
  const now = scenePoint(fighter, P.pelvis);
  const head = scenePoint(fighter, P.head);
  const flat = [head[0] - now[0], 0, head[2] - now[2]];
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
  fighter.outFor = WORLD.goneSeconds + 1;
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

/** Whose body the scene is about: its `subject`, else its id if that is one of the cast, else the first of the cast spoken of. */
function sceneSubject(scene, cast) {
  if (scene.subject && cast[scene.subject] !== undefined) return scene.subject;
  if (cast[scene.id] !== undefined) return scene.id;
  return scene.script?.map((line) => line.who).find((who) => cast[who] !== undefined && who !== 'hero') ?? null;
}

/**
 * Begin a scene on a world: `hero` the index of the man played, `cast` { id: index } (the battle's named men), `language`.
 * Returns the play's state; `stepScene` moves it on.
 */
export function createScenePlay(world, scene, { hero, cast = {}, language = 'en' } = {}) {
  const subjectId = sceneSubject(scene, cast);
  const lines = (scene.script ?? []).map((line) => ({ ...line, seconds: lineSeconds(line, language) }));
  return {
    world, scene, hero, cast, language, lines, subjectId, subject: subjectId !== null ? cast[subjectId] : null,
    index: 0, into: 0, time: 0, set: false, done: false, roll: null, stage: null, stageSince: 0, cut: null, ending: 0,
  };
}

const sceneHeroOf = (play) => play.world.fighters[play.hero];
const sceneSubjectOf = (play) => (play.subject !== null ? play.world.fighters[play.subject] : null);

/** The scene set, in the dark of a cut: the subject laid face down where he lies (out, if he was not), the hero over him. */
function setScene(play) {
  play.set = true;
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
}

/** A stage word begins. */
function beginStage(play, stage) {
  play.stage = stage;
  play.stageSince = play.time;
  const hero = sceneHeroOf(play);
  const body = sceneSubjectOf(play);
  if (stage === 'cut') play.cut = { at: play.time };
  if (stage === 'turn' && body) {
    // Face up, the chest turned toward where he stands.
    const toward = play.side ? [play.side[0], 0.6, play.side[2]] : [0, 1, 0];
    play.roll = { from: 0, total: rollToward(body, sceneNorm(toward)), done: 0, at: play.time + STORY_SCENE.turn.stoop };
  }
  if (stage === 'kneel' && hero?.weapon) dropWeapon(play.world, hero, 'dropped');
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
    const hands = stage === 'kneel' || !chest ? null : [[chest[0], chest[1] + 0.04, chest[2] - 0.1], [chest[0], chest[1] + 0.04, chest[2] + 0.1]];
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
    rollBody(body, by);
    play.roll.done = wanted;
  }
  if (u >= 1) play.roll = null;
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
    if (first?.stage) beginStage(play, first.stage);
    if (first?.stage !== 'cut') setScene(play);
  }
  play.time += dt;
  play.into += dt;
  // In a cut, the scene is set once the dark has closed.
  if (play.cut && !play.set && play.time - play.cut.at >= STORY_SCENE.cut.close) setScene(play);
  rollStep(play);
  const line = play.lines[play.index];
  const length = (line?.seconds ?? 0) + (line?.stage === 'cut' ? STORY_SCENE.cut.close + STORY_SCENE.cut.hold : 0) + (play.index === play.lines.length - 1 ? STORY_SCENE.endHold : 0);
  if (line && play.into >= length) {
    play.index += 1;
    play.into = 0;
    if (play.index >= play.lines.length) {
      play.done = true;
      due.push('done');
    } else {
      due.push({ line: play.index });
      const next = play.lines[play.index];
      if (next.stage) beginStage(play, next.stage);
    }
  }
  return due;
}

/** Each step of the world while the scene plays: his pose as the stage has it (the page or the test calls it in the world's think). */
export function sceneThink(play) {
  if (!play || play.done) return;
  poseHero(play);
}

/** Skip to the next line (a tap), once the line has been up a moment. */
export function skipSceneLine(play) {
  if (play.done || play.into < STORY_SCENE.skipAfter) return false;
  const line = play.lines[play.index];
  play.into = (line?.seconds ?? 0) + (line?.stage === 'cut' ? STORY_SCENE.cut.close + STORY_SCENE.cut.hold : 0) + (play.index === play.lines.length - 1 ? STORY_SCENE.endHold : 0);
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
  const bars = play.done ? 0 : sceneSmooth(play.time / spec.bars);
  const line = play.lines[play.index];
  const shown = line && (line.stage !== 'cut' || play.time - (play.cut?.at ?? 0) >= spec.cut.close);
  return { black: Math.max(0, Math.min(1, black)), bars, line: shown ? { who: line.who, text: storyText(line.line, play.language) } : null };
}

/** Where the scene's camera looks, and from where: { target [x, y, z], yaw, pitch, distance } (the page eases its orbit to it). */
export function sceneFocus(play) {
  const hero = sceneHeroOf(play);
  const body = sceneSubjectOf(play);
  if (!hero) return null;
  const head = scenePoint(hero, P.pelvis);
  const lying = body ? scenePoint(body, P.pelvis) : head;
  const middle = [(head[0] + lying[0]) / 2, Math.min(head[1], 0.9) * 0.5 + STORY_SCENE.camera.lift, (head[2] + lying[2]) / 2];
  const across = Math.atan2(head[2] - lying[2], head[0] - lying[0]);
  return { target: middle, yaw: across + STORY_SCENE.camera.turn, pitch: STORY_SCENE.camera.pitch, distance: STORY_SCENE.camera.distance };
}
