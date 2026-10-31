// Hand grenades on the page (physics/throwable.js): the grenade in the thrower's hand and in the air, and its going off: the
// flash, the light, the smoke and dust (battlefx.js battleFxBlast), the hot fragments and earth thrown out (weaponview.js's
// sparks), a fragment's wound (blood, or sparks off a plate); and for the man played, near and looking, the white of a
// flashbang over the whole screen fading as his eyes come back, and his ears ringing (audio engine `deafen`).

/* global THREE */

import { P } from './body.js';
import { battleFxBlast } from './battlefx.js';
import { point } from './physics.js';
import { THROWABLES } from './weapons.js';
import { spawnBlood, spawnSparks } from './weaponview.js';

export const BLAST_VIEW = {
  // Drawn: an olive steel sphere (the M67), a dark grey tube (the M84), each as big as it is.
  colour: { frag: 0x4a5236, flashbang: 0x2c2e30 },
  // The white-out (`flash` of the burst a man took, 0..1, physics/throwable.js): its most (a little less with reduced
  // motion), held a moment, then fading over `seconds` × flash (the eyes' bleached rods coming back: up to ~5 s).
  whiteMost: 1, whiteReduced: 0.6, hold: 0.25, seconds: 5,
  // A frag near (within `near` m): a warm glare for a moment, the ears ringing by how near.
  near: 10, glare: 0.35, glareSeconds: 0.35,
  // Fragments and earth thrown out: so many sparks for a frag, so few for a flashbang.
  sparks: { frag: 60, flashbang: 12 },
};

/** The drawn grenade of a kind (built once, shared). */
function grenadeGeometry(view, kind) {
  view.grenadeGeometries ??= {};
  if (!view.grenadeGeometries[kind]) {
    const spec = THROWABLES[kind];
    view.grenadeGeometries[kind] = kind === 'frag' ? new THREE.SphereGeometry(spec.radius, 12, 8) : new THREE.CylinderGeometry(spec.radius, spec.radius, 0.13, 10);
  }
  return view.grenadeGeometries[kind];
}

/** Draw every grenade: in a thrower's hand from the pin to the release, and those thrown until they go off. */
export function updateThrown(view, world) {
  const drawn = view.grenades ?? (view.grenades = new Map());
  const live = new Set();
  const place = (key, kind, at) => {
    live.add(key);
    let mesh = drawn.get(key);
    if (!mesh) {
      mesh = new THREE.Mesh(grenadeGeometry(view, kind), new THREE.MeshStandardMaterial({ color: BLAST_VIEW.colour[kind], roughness: 0.6, metalness: 0.3 }));
      mesh.castShadow = true;
      view.scene.add(mesh);
      drawn.set(key, mesh);
    }
    mesh.position.set(at[0], at[1], at[2]);
  };
  for (const fighter of world.fighters) {
    const throwing = fighter.throwing;
    if (throwing && !throwing.released && !fighter.dormant) place(`hand:${fighter.id}:${throwing.lit}`, throwing.kind, point(fighter.x, P[`${throwing.hand}Hand`]));
  }
  for (const item of world.thrown ?? []) if (!item.done) place(`thrown:${item.owner}:${item.fuseAt}`, item.kind, item.x);
  for (const [key, mesh] of drawn) {
    if (live.has(key)) continue;
    view.scene.remove(mesh);
    mesh.material.dispose();
    drawn.delete(key);
  }
}

/** The white-out and glare layer over the stage, and how it fades. */
export function createBlastScreen(element, { reduced = false } = {}) {
  const state = { level: 0, hold: 0, fade: 1, warm: false };
  return {
    /** A burst felt: `white` (0..1) a flashbang's white, else a frag's warm glare. */
    flash(white, warm) {
      const most = reduced ? BLAST_VIEW.whiteReduced : BLAST_VIEW.whiteMost;
      const level = warm ? BLAST_VIEW.glare * white : Math.min(most, white * most);
      if (level <= state.level) return;
      state.level = level;
      state.warm = warm;
      state.hold = warm ? 0 : BLAST_VIEW.hold;
      state.fade = warm ? BLAST_VIEW.glareSeconds : Math.max(0.4, BLAST_VIEW.seconds * white);
      element.style.background = warm ? 'radial-gradient(ellipse at 50% 55%, rgba(255, 220, 170, 0.9), rgba(255, 170, 90, 0.3))' : '#fff';
    },
    /** Each frame (real seconds). */
    update(dt) {
      if (state.level <= 0) return;
      if (state.hold > 0) state.hold -= dt;
      else state.level = Math.max(0, state.level - (dt / state.fade) * Math.max(0.15, state.level));
      element.style.opacity = state.level.toFixed(3);
    },
    clear() {
      state.level = 0;
      element.style.opacity = '0';
    },
  };
}

/**
 * A grenade gone off (the 'blast' event): its burst drawn; for the man played (`playerId`), the white of a flashbang he took
 * (`felt.flash`) or the glare of a frag near him, and his ears ringing (`audio.deafen`, by how near and how much of it).
 */
export function blastEvent(view, event, { playerId = null, screen = null, audio = null } = {}) {
  const frag = event.throwable === 'frag';
  battleFxBlast(view, event.point, frag);
  spawnSparks(view, event.point, BLAST_VIEW.sparks[event.throwable] ?? 12, { flash: false });
  const felt = playerId === null ? null : event.felt?.find((entry) => entry.id === playerId);
  if (!felt) return;
  if (frag) {
    const near = Math.max(0, 1 - felt.distance / BLAST_VIEW.near);
    if (near > 0) {
      screen?.flash(near, true);
      audio?.deafen?.(near * 0.7);
    }
  } else if (felt.flash > 0) {
    screen?.flash(felt.flash, false);
    audio?.deafen?.(Math.min(1, felt.flash * 1.2));
  }
}

/** A fragment's strike: blood where it went in, sparks off a plate, a flicker where it struck a shield. */
export function fragmentEvent(view, event) {
  if (event.plate) spawnSparks(view, event.point, 5);
  else if (event.harm > 0.02) spawnBlood(view, event.point, event.normal, Math.min(14, 3 + Math.round(event.harm * 16)), 2);
  else if (event.target) spawnSparks(view, event.point, 4, { flash: false });
}
