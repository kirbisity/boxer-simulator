// The big moments, as the viewer sees them: slow motion that lets a knockout
// play out, a camera that pushes in and shakes with the blow, a flash, and
// icons that pop over the body part where something happened. None of this
// touches the simulation: it only changes how fast it is stepped and drawn.

import { P } from './body.js';
import { spring } from './followcam.js';
import { t } from './i18n.js';
import { uiIconMarkup } from './uiicons.js';

export const DRAMA = {
  // Simulated seconds per real second at the slowest, how long the moment
  // lasts (real s), and the share of it held slow before easing back.
  knockout: { slowest: 0.15, seconds: 2.8, hold: 0.55, shake: 0.09, pushIn: 0.62, flash: 0.75 },
  knockdown: { slowest: 0.4, seconds: 1.4, hold: 0.4, shake: 0.045, pushIn: 0.85, flash: 0.3 },
  broken: { slowest: 0.5, seconds: 0.9, hold: 0.3, shake: 0.03, pushIn: 1, flash: 0 },
  // A blade ends it: slower, longer, nearer than a knockout.
  severed: { slowest: 0.12, seconds: 3.2, hold: 0.6, shake: 0.08, pushIn: 0.6, flash: 0.6 },
  killed: { slowest: 0.15, seconds: 2.8, hold: 0.55, shake: 0.06, pushIn: 0.62, flash: 0.5 },
  bledOut: { slowest: 0.4, seconds: 1.6, hold: 0.4, shake: 0, pushIn: 0.8, flash: 0 },
  disarmed: { slowest: 0.6, seconds: 0.8, hold: 0.3, shake: 0.02, pushIn: 1, flash: 0 },
  staggered: { slowest: 0.55, seconds: 0.9, hold: 0.3, shake: 0.04, pushIn: 0.85, flash: 0 },
  panic: { slowest: 1, seconds: 0.6, hold: 0.2, shake: 0, pushIn: 0.95, flash: 0 },
  rally: { slowest: 1, seconds: 0.6, hold: 0.2, shake: 0, pushIn: 0.95, flash: 0 },
  // Held down: no blow, so no shake or flash; the camera closes in.
  held: { slowest: 1, seconds: 1.2, hold: 0.2, shake: 0, pushIn: 0.85, flash: 0 },
  pinned: { slowest: 0.5, seconds: 1.6, hold: 0.4, shake: 0, pushIn: 0.75, flash: 0 },
  // A thing rising out of the filth to fight (levelmode/awareness.js `lurk`): the camera drawn in on him and a tremor as he comes up, a little slowed.
  rise: { slowest: 0.75, seconds: 2.6, hold: 0.6, shake: 0.035, pushIn: 0.8, flash: 0 },
  // The player's deflect: the fight slowed to a fifth for a moment, his man reeling, his art charged (weaponarts.js): time to press it.
  deflect: { slowest: 0.2, seconds: 1.4, hold: 0.6, shake: 0.02, pushIn: 0.9, flash: 0 },
  // The big deflect (WORLD.deflect.big): slower and longer, the camera in closer and a jolt, while the striker stands broken open.
  bigDeflect: { slowest: 0.12, seconds: 2.2, hold: 1.0, shake: 0.05, pushIn: 0.82, flash: 0 },
  // The execution after a big deflect (finisher.js): slower still, the camera closing hard on the man's head as the player kneels to
  // him (as Sekiro and Dark Souls frame theirs); then the blow home, a sharp shake, slowest of all for an instant.
  execution: { slowest: 0.1, seconds: 2.6, hold: 0.85, shake: 0.01, pushIn: 0.55, flash: 0 },
  executionBlow: { slowest: 0.06, seconds: 1.1, hold: 0.35, shake: 0.09, pushIn: 0.5, flash: 0 },
  // Real seconds to slow from full speed to the slowest: a slide, not a cut.
  easeIn: 0.18,
  // The push-in's lens (dramaLens): the share of the moment it takes to close in, and the share at its end it takes to let go, both
  // eased with no step in speed; what it looks at at most (a share of the way from the camera's own look point to the body part).
  pushRise: 0.3,
  pushFall: 0.5,
  // The share of the moment's own push (`pushIn`) reached at its height: the depth the push-in had before it was eased, whose
  // envelope (a quarter sine, cut by 1 − u) peaked at 0.69.
  pushPeak: 0.69,
  lookShare: 0.65,
  // Springs (1/s, critically damped) on the push-in's amount and on the point it closes in on: a moment that takes over from another
  // carries the camera on from where it is, and a head thrown back by the blow is followed, not tracked to the millimetre.
  lensRate: 9,
  focusRate: 7,
  shakeHz: 23,
  flashSeconds: 0.6,
  iconSeconds: 2.2,
  // A man's tags at once (updateIcons), fewer on a window narrower than narrowWidth (px), each older one iconStep (px) higher.
  iconsShown: 3,
  iconsShownNarrow: 2,
  narrowWidth: 640,
  iconStep: 26,
};

const ICONS = {
  knockout: { glyph: 'burst', label: 'KO', tone: 'ko' },
  knockdown: { glyph: 'down', label: 'DOWN', tone: 'down' },
  broken: { glyph: 'snapped', label: 'BROKEN', tone: 'bone' },
  accessory: { glyph: 'cap', label: 'KNOCKED OFF', tone: 'gear' },
  severed: { glyph: 'drop', label: 'SEVERED', tone: 'ko' },
  killed: { glyph: 'skull', label: 'KILLED', tone: 'ko' },
  bledOut: { glyph: 'drop', label: 'BLED OUT', tone: 'ko' },
  disarmed: { glyph: 'blade', label: 'DISARMED', tone: 'gear' },
  staggered: { glyph: 'reel', label: 'STAGGERED', tone: 'down' },
  panic: { glyph: 'panic', label: 'PANIC', tone: 'down' },
  rally: { glyph: 'flame', label: 'FIGHTS ON', tone: 'gear' },
  // A comrade cut down and he goes for the killer (ai.js AI.rage).
  rage: { glyph: 'rage', label: 'RAGE', tone: 'gear' },
  held: { glyph: 'hold', label: 'HOLD', tone: 'down' },
  pinned: { glyph: 'hold', label: 'HELD DOWN', tone: 'ko' },
};

/** What a world event means for the viewer: a moment kind and the particle it centres on, or null. */
export function momentFor(event) {
  if (event.kind === 'knockout') return { kind: 'knockout', fighter: event.fighter, particle: P.head };
  if (event.kind === 'broken') return { kind: 'broken', fighter: event.fighter, particle: P[event.joint] ?? P.neck, label: event.joint };
  if (event.kind === 'severed') return { kind: 'severed', fighter: event.fighter, particle: event.joint === 'neck' ? P.neck : P[`${event.side}${{ shoulder: 'Shoulder', elbow: 'Elbow', wrist: 'Hand', hip: 'Hip', knee: 'Knee', ankle: 'Foot' }[event.joint]}`] };
  if (event.kind === 'held' || event.kind === 'pinned') return { kind: event.kind, fighter: event.fighter, particle: P.neck };
  if (event.kind === 'panic' || event.kind === 'rally' || event.kind === 'rage') return { kind: event.kind, fighter: event.fighter, particle: P.head };
  // (Played whoever else is about: `always`, a stage's crowd notwithstanding.)
  if (event.kind === 'rise') return { kind: 'rise', fighter: event.fighter, particle: P.head, always: true };
  // Thrown from the saddle: as a knockdown.
  if (event.kind === 'unhorsed' && !event.effects[0]?.startsWith('slumps')) return { kind: 'knockdown', fighter: event.fighter, particle: P.neck };
  // Ridden down and put over by a horse: as a knockdown.
  if (event.kind === 'trampled' && event.fell) return { kind: 'knockdown', fighter: event.fighter, particle: P.neck };
  if (event.kind === 'staggered') return { kind: 'staggered', fighter: event.fighter, particle: P.head };
  // The player's deflect, in any fight (`always`): on his blade's hand.
  if (event.kind === 'deflect' && event.byPlayer) return { kind: event.big ? 'bigDeflect' : 'deflect', fighter: event.fighter, particle: P.rHand, always: true };
  // The execution after a big deflect, in any fight (`always`): on the man's head.
  if (event.kind === 'execution' || event.kind === 'executionBlow') return { kind: event.kind, fighter: event.fighter, particle: P.head, always: true };
  if (event.kind === 'killed') return { kind: 'killed', fighter: event.fighter, particle: P.neck };
  if (event.kind === 'bledOut') return { kind: 'bledOut', fighter: event.fighter, particle: P.neck };
  if (event.kind === 'disarmed' && event.effects[0]?.includes('knocked away')) return { kind: 'disarmed', fighter: event.fighter, particle: P.rHand };
  if (event.kind === 'accessory') return { kind: 'accessory', fighter: event.fighter, particle: P.head, icon: event.icon };
  if ((event.kind === 'landed' || event.kind === 'blocked') && !event.knockout && event.effects.some((effect) => effect.startsWith('knockdown'))) {
    return { kind: 'knockdown', fighter: event.defender, particle: event.target === 'head' ? P.head : P.neck };
  }
  return null;
}

/** Begin a moment; a bigger one already playing is not cut short by a smaller. */
export function startMoment(drama, moment, now) {
  const spec = DRAMA[moment.kind];
  if (!spec) return;
  const current = drama.active;
  if (current && now < current.start + DRAMA[current.kind].seconds && DRAMA[current.kind].slowest <= spec.slowest) return;
  drama.active = { ...moment, start: now };
  if (spec.flash > 0) drama.flash = { start: now, strength: spec.flash };
}

/** Simulated seconds per real second now: slow, held, then easing back to normal. */
export function timeScale(drama, now) {
  const active = drama.active;
  if (!active) return 1;
  const spec = DRAMA[active.kind];
  const u = (now - active.start) / spec.seconds;
  if (u >= 1) {
    drama.active = null;
    return 1;
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  const into = Math.min(1, (now - active.start) / DRAMA.easeIn);
  if (u < spec.hold) return 1 + (spec.slowest - 1) * smooth(into);
  const ease = (u - spec.hold) / (1 - spec.hold);
  return spec.slowest + (1 - spec.slowest) * smooth(ease);
}

/** True while a moment is still playing out: the result waits for it. */
export function momentPlaying(drama, now) {
  return Boolean(drama.active) && now < drama.active.start + DRAMA[drama.active.kind].seconds;
}

/** smoothstep: 0 at 0 and 1 at 1, with no speed at either end. */
const smooth01 = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/** How far into its push-in a moment is (0..pushPeak) at `u` of its length: in over `pushRise`, held, out over the last `pushFall`. */
export function pushEnvelope(u) {
  if (!(u > 0) || u >= 1) return 0;
  return DRAMA.pushPeak * smooth01(u / DRAMA.pushRise) * smooth01((1 - u) / DRAMA.pushFall);
}

/**
 * The push-in's lens at `now` (real s): { amount (0..1 of the moment's push), focus [x, y, z] }, its state kept on `drama.lens`.
 * `wanted` { amount, focus } is what the moment playing asks for (amount 0 when none is). The amount and the point are springs, so
 * that a moment that begins, ends or takes over from another moves the camera with no step in place or speed.
 */
export function dramaLens(drama, wanted, now) {
  const lens = (drama.lens ??= { amount: 0, speed: 0, focus: null, velocity: [0, 0, 0], at: now });
  const dt = Math.max(0, Math.min(0.1, now - lens.at));
  lens.at = now;
  if (wanted.focus) {
    if (!lens.focus || lens.amount < 1e-3) {
      lens.focus = wanted.focus.slice();
      lens.velocity = [0, 0, 0];
    } else for (let axis = 0; axis < 3; axis += 1) [lens.focus[axis], lens.velocity[axis]] = spring(lens.focus[axis], lens.velocity[axis], wanted.focus[axis], DRAMA.focusRate, dt);
  }
  [lens.amount, lens.speed] = spring(lens.amount, lens.speed, wanted.amount, DRAMA.lensRate, dt);
  if (!wanted.focus && lens.amount < 1e-4) {
    lens.amount = 0;
    lens.speed = 0;
  }
  return lens;
}

/**
 * After the camera is placed: push in towards the moment's body part and shake, both dying away as the moment ends. The push and the
 * turn of the view to the body part rise from nothing (pushEnvelope, through dramaLens's springs): before, the view turned two-thirds
 * of the way to the body part in the moment's first frame, and a moment that took over from another threw the camera back to where it
 * stood. The shake is the blow's own jolt and starts with it.
 */
export function dramaCamera(view, drama, world, now) {
  const active = drama.active;
  const spec = active ? DRAMA[active.kind] : null;
  const fighter = active ? world.fighters[active.fighter] : null;
  const u = spec ? Math.min(1, (now - active.start) / spec.seconds) : 1;
  const base = fighter ? active.particle * 3 : 0;
  const wanted = fighter && u < 1
    ? { amount: pushEnvelope(u), focus: [fighter.x[base], fighter.x[base + 1], fighter.x[base + 2]] }
    : { amount: 0, focus: null };
  const lens = dramaLens(drama, wanted, now);
  if (!(lens.amount > 0) || !lens.focus) return;
  const focus = new THREE.Vector3(...lens.focus);
  const camera = view.camera;
  // Pull the camera along its line to the focus: at the full amount, `1 - pushIn` of the way (the moment's own depth).
  const depth = spec ? 1 - spec.pushIn : drama.lensDepth ?? 0;
  if (spec) drama.lensDepth = depth;
  camera.position.lerp(focus, depth * lens.amount);
  if (spec && fighter && u < 1) {
    // Shake: two unrelated wobbles, strongest at the blow.
    const t = (now - active.start) * DRAMA.shakeHz;
    const amount = spec.shake * Math.exp(-u * 5);
    camera.position.x += Math.sin(t * 1.3) * amount;
    camera.position.y += Math.sin(t * 1.7 + 1) * amount * 0.7;
    camera.position.z += Math.cos(t * 1.1 + 2) * amount;
  }
  camera.lookAt(view.orbit.target.clone().lerp(focus, DRAMA.lookShare * lens.amount));
}

/** Drawn each frame from the moment's own clock, like everything else on screen. */
function drawFlash(drama, now) {
  const layer = document.querySelector('#flash');
  if (!layer) return;
  const flash = drama.flash;
  const left = flash ? Math.max(0, 1 - (now - flash.start) / DRAMA.flashSeconds) : 0;
  layer.style.opacity = String(flash ? flash.strength * left * left : 0);
  if (left === 0) drama.flash = null;
}

// ---- Icons ------------------------------------------------------------------

/** Pop an icon over a body part; it follows that part until it fades. */
export function addIcon(drama, moment, now) {
  const spec = ICONS[moment.kind];
  const holder = document.querySelector('#icons');
  if (!spec || !holder) return;
  const element = document.createElement('div');
  element.className = `event-icon ${spec.tone}`;
  // Drawn in the interface's own line (uiicons.js), by the moment's kind. A thing knocked off keeps the one drawing whatever it
  // was (a crown, a plume, a cap). A kind with no drawing shows its word alone.
  const drawn = uiIconMarkup(spec.glyph);
  element.innerHTML = `${drawn ? `<span class="glyph drawn">${drawn}</span>` : ''}<b>${t(`drama.${moment.kind}`)}</b>`;
  holder.append(element);
  drama.icons.push({ element, fighter: moment.fighter, particle: moment.particle, start: now });
}

/** Place every icon over its body part on screen, rising and fading. */
export function updateIcons(drama, view, world, canvas, now) {
  drawFlash(drama, now);
  const box = canvas.getBoundingClientRect();
  const projected = new THREE.Vector3();
  drama.icons = drama.icons.filter((icon) => {
    const age = (now - icon.start) / DRAMA.iconSeconds;
    const fighter = world.fighters[icon.fighter];
    if (age >= 1 || !fighter) {
      icon.element.remove();
      return false;
    }
    return true;
  });
  // A man's tags do not pile on one spot: the newest at his body part, each older one a plate's height above it, and no more
  // than DRAMA.iconsShown (fewer on a phone's width) at once; the oldest beyond that are hidden until they fade.
  const shown = box.width < DRAMA.narrowWidth ? DRAMA.iconsShownNarrow : DRAMA.iconsShown;
  const above = new Map();
  for (let index = drama.icons.length - 1; index >= 0; index -= 1) {
    const icon = drama.icons[index];
    icon.rank = above.get(icon.fighter) ?? 0;
    above.set(icon.fighter, icon.rank + 1);
  }
  drama.icons.forEach((icon) => {
    const age = (now - icon.start) / DRAMA.iconSeconds;
    const fighter = world.fighters[icon.fighter];
    const base = icon.particle * 3;
    projected.set(fighter.x[base], fighter.x[base + 1] + 0.25 + age * 0.25, fighter.x[base + 2]).project(view.camera);
    icon.element.style.left = `${box.left + ((projected.x + 1) / 2) * box.width}px`;
    icon.element.style.top = `${box.top + ((1 - projected.y) / 2) * box.height}px`;
    icon.element.style.opacity = icon.rank >= shown ? '0' : String(age < 0.1 ? age / 0.1 : 1 - Math.max(0, (age - 0.6) / 0.4));
    icon.element.style.transform = `translate(-50%, calc(-100% - ${icon.rank * DRAMA.iconStep}px)) scale(${0.7 + 0.3 * Math.min(1, age * 8)})`;
  });
}

/** Forget every moment and icon: a new bout. */
export function resetDrama(drama) {
  for (const icon of drama.icons) icon.element.remove();
  drama.icons = [];
  drama.active = null;
  drama.flash = null;
  drama.lens = null;
  drama.lensDepth = 0;
}
