// Level mode, the boss-defeat cutscene: when Lord Vaelen goes out (struck down, knocked out, bled out: whenever he is first out)
// the screen frames it for a few seconds so the player feels something happened, and then leads him to the prince:
//
//   blow    the killing blow: time slows to a quarter, the camera swings low onto the boss, the letterbox bars close in, the
//           boss's bar empties and his name is struck through
//   fall    the sim lets him stagger, kneel and fall (real physics, only slowed, never frozen); lightning strikes the windows
//           and the screen flashes white; thunder is a shake of the camera (the game has no audio)
//   title   'LORD VAELEN · FELLED' in gold on a black band, and under it a line of narration
//   return  the cards fade, the camera eases back to the player and control comes back; the inner doors are offered (a marker
//           and a toast, a guide light along the floor to the prince)
//
// This file is the pure part: a state machine over REAL seconds (the clock of the screen, not the world's, which is slowed) and
// what each frame should look like. No DOM, no camera. The thin layer that draws it is cutsceneview.js; the world's side (the door,
// holding the player) is ending.js. Timings are CUTSCENE below, each with its reason.

export const CUTSCENE = {
  // The phases in order, and how long each lasts (real s). All of it is 7.2 s: the brief asks for 6 to 9.
  phases: [
    // The slow-motion on the blow (the brief: a quarter speed for about 1.2 s).
    { id: 'blow', seconds: 1.2 },
    // Long enough for a 210 cm man in a 45 kg harness to kneel and go over at half speed; the strike comes just after the fall begins.
    { id: 'fall', seconds: 1.8 },
    // The title and its narration hold this long, the narration coming in after the title has settled.
    { id: 'title', seconds: 3.0 },
    // The camera's way back to the player.
    { id: 'return', seconds: 1.2 },
  ],
  // A tap or Esc skips, but not before this (real s): a card dismissed by the tap that struck the blow is no cutscene.
  skipAfter: 1.0,
  // A skipped scene goes straight to its return, shortened to this (real s).
  skipReturn: 0.5,
  // Simulated seconds per real second: on the blow; where the fall ends (it eases up from the blow's through the fall); and the title's start (full speed by its end).
  speed: { blow: 0.25, fall: 0.7, title: 0.9 },
  // When in the fall (s into the phase) the lightning strikes and the screen flashes: just after he starts to go, so the flash is on the fall.
  strikeAt: 0.2,
  // When in the title phase (s) the narration line comes in after the title (its fade is `fade.in`).
  lineAt: 1.2,
  // Fades (s): the cards in, the cards out (the end of the title phase), the letterbox bars in (the blow's start), the camera swinging in.
  fade: { in: 0.7, out: 0.6, bars: 0.6, swing: 1.0 },
  // The camera's shake (m of sway at the camera): on the blow, decaying; the spike of the strike (the thunder), decaying; how fast each dies (1/s).
  shake: { blow: 0.05, blowDecay: 2.2, strike: 0.16, strikeDecay: 1.4 },
  // The white of the strike's flash (0..1) and how long it takes to clear (s).
  flash: { strength: 0.85, seconds: 0.5 },
  // The words. The boss's name is his own (the card reads 'NAME · FELLED').
  words: {
    felled: 'FELLED',
    line: ['The Queen\'s jailer lies still.', 'Behind him, a door stands ajar.'],
    toast: 'The inner doors stand open',
  },
};

const csSmooth = (u) => {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
};
const csMix = (a, b, u) => a + (b - a) * u;

/** The cutscene's length if nobody skips it (real s). */
export const cutsceneLength = (config = CUTSCENE) => config.phases.reduce((sum, phase) => sum + phase.seconds, 0);

/** Begin one. */
export function createCutscene(config = CUTSCENE) {
  return {
    config, time: 0, phase: 0, into: 0, skipped: false, done: false,
    // What has happened, once each, in order: start, strike, title, line, return, done (read by `stepCutscene`).
    fired: new Set(),
    // The cards' opacity at the moment of a skip (they fade from there).
    held: { title: 0, line: 0 },
  };
}

/** The name of the phase now ('blow' | 'fall' | 'title' | 'return' | 'done'). */
export const cutscenePhase = (cutscene) => (cutscene.done ? 'done' : cutscene.config.phases[cutscene.phase].id);

/** The seconds the phase named takes in this cutscene (a skipped return is shorter). */
function phaseSeconds(cutscene, id) {
  const base = cutscene.config.phases.find((phase) => phase.id === id).seconds;
  return id === 'return' && cutscene.skipped ? Math.min(base, cutscene.config.skipReturn) : base;
}

/** Seconds into the named phase (0 before it, its whole length after). */
function intoPhase(cutscene, id) {
  const here = cutscene.done ? Infinity : cutscene.phase;
  const index = cutscene.config.phases.findIndex((phase) => phase.id === id);
  if (here < index) return 0;
  if (here > index) return phaseSeconds(cutscene, id);
  return cutscene.into;
}

/**
 * Advance by `dt` real seconds. Returns the events that fell due, in order: 'start', 'strike', 'title', 'line', 'return', 'done'
 * ('return' is when control comes back and the doors are offered; 'done' is when the last frame is over). A skipped scene's
 * strike, title and line that were not yet due are dropped.
 */
export function stepCutscene(cutscene, dt) {
  const events = [];
  const fire = (name) => {
    if (cutscene.fired.has(name)) return;
    cutscene.fired.add(name);
    events.push(name);
  };
  fire('start');
  if (cutscene.done) return events;
  const { phases, strikeAt, lineAt } = cutscene.config;
  cutscene.time += dt;
  cutscene.into += dt;
  while (!cutscene.done && cutscene.into >= phaseSeconds(cutscene, phases[cutscene.phase].id)) {
    cutscene.into -= phaseSeconds(cutscene, phases[cutscene.phase].id);
    if (cutscene.phase === phases.length - 1) {
      cutscene.done = true;
      cutscene.into = 0;
    } else cutscene.phase += 1;
  }
  const phase = cutscenePhase(cutscene);
  const past = (id, seconds) => cutscene.done || phases.findIndex((each) => each.id === phase) > phases.findIndex((each) => each.id === id) || (phase === id && cutscene.into >= seconds);
  if (!cutscene.skipped) {
    if (past('fall', strikeAt) && !cutscene.fired.has('strike')) cutscene.struckAt = cutscene.time;
    if (past('fall', strikeAt)) fire('strike');
    if (past('title', 0)) fire('title');
    if (past('title', lineAt)) fire('line');
  }
  if (past('return', 0)) fire('return');
  if (cutscene.done) fire('done');
  return events;
}

/** Skip it: allowed once `skipAfter` has gone, and only once. Returns whether it took. */
export function skipCutscene(cutscene) {
  if (cutscene.done || cutscene.skipped || cutscene.time < cutscene.config.skipAfter || cutscenePhase(cutscene) === 'return') return false;
  const look = cutsceneLook(cutscene);
  cutscene.held = { title: look.title, line: look.line };
  cutscene.skipped = true;
  cutscene.phase = cutscene.config.phases.findIndex((phase) => phase.id === 'return');
  cutscene.into = 0;
  return true;
}

/** Whether the player is held where he stands: until the return begins. */
export const cutsceneHolds = (cutscene) => !cutscene.done && cutscenePhase(cutscene) !== 'return';

/** Whether the scene is still on (its last frame not yet over). */
export const cutsceneOn = (cutscene) => !cutscene.done;

/** Simulated seconds per real second now (1 once the scene is through or skipped). */
export function cutsceneSpeed(cutscene) {
  if (cutscene.done || cutscene.skipped) return 1;
  const { speed } = cutscene.config;
  const phase = cutscenePhase(cutscene);
  const share = cutscene.into / phaseSeconds(cutscene, phase);
  if (phase === 'blow') return speed.blow;
  if (phase === 'fall') return csMix(speed.blow, speed.fall, csSmooth(share));
  if (phase === 'title') return csMix(speed.title, 1, csSmooth(share));
  return 1;
}

/**
 * What the screen shows now, each 0..1 unless said: { bars (the letterbox), swing (how far the camera is off the player and on the
 * boss), title, line, shake (m), flash (strike's white), hold (the narration's text is up) }.
 */
export function cutsceneLook(cutscene) {
  const { fade, shake, flash } = cutscene.config;
  const phase = cutscenePhase(cutscene);
  const total = cutscene.time;
  const blow = intoPhase(cutscene, 'blow');
  const titleLength = cutscene.config.phases.find((each) => each.id === 'title').seconds;
  const back = phase === 'return' ? cutscene.into / phaseSeconds(cutscene, 'return') : cutscene.done ? 1 : 0;
  const bars = csSmooth(blow / fade.bars) * (1 - csSmooth(back));
  const swing = csSmooth(blow / fade.swing) * (1 - csSmooth(back));
  const title = intoPhase(cutscene, 'title');
  let titleOpacity = csSmooth(title / fade.in) * (1 - csSmooth((title - (titleLength - fade.out)) / fade.out));
  let lineOpacity = csSmooth((title - cutscene.config.lineAt) / fade.in) * (1 - csSmooth((title - (titleLength - fade.out)) / fade.out));
  if (cutscene.skipped) {
    titleOpacity = cutscene.held.title * (1 - csSmooth(back));
    lineOpacity = cutscene.held.line * (1 - csSmooth(back));
  }
  // The shake: the blow's, dying away; the strike's thunder on top, from the moment it struck.
  const sinceStrike = cutscene.struckAt === undefined ? Infinity : total - cutscene.struckAt;
  const blowShake = cutscene.skipped || cutscene.done ? 0 : shake.blow * Math.exp(-total * shake.blowDecay);
  const strikeShake = cutscene.done ? 0 : shake.strike * Math.exp(-sinceStrike * shake.strikeDecay) * (cutscene.skipped ? Math.max(0, 1 - cutscene.into / phaseSeconds(cutscene, 'return')) : 1);
  return {
    bars, swing, title: Math.min(1, Math.max(0, titleOpacity)), line: Math.min(1, Math.max(0, lineOpacity)),
    shake: blowShake + (Number.isFinite(sinceStrike) ? strikeShake : 0),
    flash: Number.isFinite(sinceStrike) ? flash.strength * Math.max(0, 1 - sinceStrike / flash.seconds) ** 2 : 0,
    hold: !cutscene.done && phase !== 'return',
  };
}
