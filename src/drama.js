// The big moments, as the viewer sees them: slow motion that lets a knockout
// play out, a camera that pushes in and shakes with the blow, a flash, and
// icons that pop over the body part where something happened. None of this
// touches the simulation: it only changes how fast it is stepped and drawn.

import { P } from './body.js';

export const DRAMA = {
  // Simulated seconds per real second at the slowest, how long the moment
  // lasts (real s), and the share of it held slow before easing back.
  knockout: { slowest: 0.15, seconds: 2.8, hold: 0.55, shake: 0.09, pushIn: 0.62, flash: 0.75 },
  knockdown: { slowest: 0.4, seconds: 1.4, hold: 0.4, shake: 0.045, pushIn: 0.85, flash: 0.3 },
  broken: { slowest: 0.5, seconds: 0.9, hold: 0.3, shake: 0.03, pushIn: 1, flash: 0 },
  shakeHz: 23,
  iconSeconds: 2.2,
};

const ICONS = {
  knockout: { glyph: '💥', label: 'KO', tone: 'ko' },
  knockdown: { glyph: '💫', label: 'DOWN', tone: 'down' },
  broken: { glyph: '🦴', label: 'BROKEN', tone: 'bone' },
  accessory: { glyph: '🎧', label: 'KNOCKED OFF', tone: 'gear' },
};

/** What a world event means for the viewer: a moment kind and the particle it centres on, or null. */
export function momentFor(event) {
  if (event.kind === 'knockout') return { kind: 'knockout', fighter: event.fighter, particle: P.head };
  if (event.kind === 'broken') return { kind: 'broken', fighter: event.fighter, particle: P[event.joint] ?? P.neck, label: event.joint };
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
  if (spec.flash > 0) flash(spec.flash);
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
  if (u < spec.hold) return spec.slowest;
  const ease = (u - spec.hold) / (1 - spec.hold);
  return spec.slowest + (1 - spec.slowest) * ease * ease * (3 - 2 * ease);
}

/** True while a moment is still playing out: the result waits for it. */
export function momentPlaying(drama, now) {
  return Boolean(drama.active) && now < drama.active.start + DRAMA[drama.active.kind].seconds;
}

/**
 * After the camera is placed: push in towards the moment's body part and
 * shake, both dying away as the moment ends.
 */
export function dramaCamera(view, drama, world, now) {
  const active = drama.active;
  if (!active) return;
  const spec = DRAMA[active.kind];
  const u = Math.min(1, (now - active.start) / spec.seconds);
  const fighter = world.fighters[active.fighter];
  if (!fighter) return;
  const base = active.particle * 3;
  const focus = new THREE.Vector3(fighter.x[base], fighter.x[base + 1], fighter.x[base + 2]);
  const fade = 1 - u;
  const camera = view.camera;
  // Pull the camera along its line to the focus.
  const push = 1 - (1 - spec.pushIn) * Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5) * fade;
  camera.position.lerp(focus, 1 - push);
  // Shake: two unrelated wobbles, strongest at the blow.
  const t = (now - active.start) * DRAMA.shakeHz;
  const amount = spec.shake * Math.exp(-u * 5);
  camera.position.x += Math.sin(t * 1.3) * amount;
  camera.position.y += Math.sin(t * 1.7 + 1) * amount * 0.7;
  camera.position.z += Math.cos(t * 1.1 + 2) * amount;
  camera.lookAt(focus.lerp(view.orbit.target, 0.35 + 0.65 * u));
}

function flash(strength) {
  const layer = document.querySelector('#flash');
  if (!layer) return;
  layer.style.transition = 'none';
  layer.style.opacity = String(strength);
  requestAnimationFrame(() => {
    layer.style.transition = 'opacity 0.6s ease-out';
    layer.style.opacity = '0';
  });
}

// ---- Icons ------------------------------------------------------------------

/** Pop an icon over a body part; it follows that part until it fades. */
export function addIcon(drama, moment, now) {
  const spec = ICONS[moment.kind];
  const holder = document.querySelector('#icons');
  if (!spec || !holder) return;
  const element = document.createElement('div');
  element.className = `event-icon ${spec.tone}`;
  element.innerHTML = `<span class="glyph">${moment.icon ?? spec.glyph}</span><b>${spec.label}</b>`;
  holder.append(element);
  drama.icons.push({ element, fighter: moment.fighter, particle: moment.particle, start: now });
}

/** Place every icon over its body part on screen, rising and fading. */
export function updateIcons(drama, view, world, canvas, now) {
  const box = canvas.getBoundingClientRect();
  const projected = new THREE.Vector3();
  drama.icons = drama.icons.filter((icon) => {
    const age = (now - icon.start) / DRAMA.iconSeconds;
    const fighter = world.fighters[icon.fighter];
    if (age >= 1 || !fighter) {
      icon.element.remove();
      return false;
    }
    const base = icon.particle * 3;
    projected.set(fighter.x[base], fighter.x[base + 1] + 0.25 + age * 0.25, fighter.x[base + 2]).project(view.camera);
    icon.element.style.left = `${box.left + ((projected.x + 1) / 2) * box.width}px`;
    icon.element.style.top = `${box.top + ((1 - projected.y) / 2) * box.height}px`;
    icon.element.style.opacity = String(age < 0.1 ? age / 0.1 : 1 - Math.max(0, (age - 0.6) / 0.4));
    icon.element.style.transform = `translate(-50%, -100%) scale(${0.7 + 0.3 * Math.min(1, age * 8)})`;
    return true;
  });
}

/** Forget every moment and icon: a new bout. */
export function resetDrama(drama) {
  for (const icon of drama.icons) icon.element.remove();
  drama.icons = [];
  drama.active = null;
}
