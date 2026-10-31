// The flamethrower's fire drawn (a proof of concept: physics/flame.js is what burns). Nothing of its own to compile: every flame is a
// sprite of battlefx.js's additive glow batch (as a muzzle flash is drawn), handed over each frame, its smoke puffs of the shots' smoke
// batch (sooty: near black), and the flash's one light is lent to the brightest fire. Each lump of fuel in flight is a streak along its
// flight (a rope near the nozzle, not beads), white-yellow as it leaves, swelling into a billow and reddening as it burns; a patch on
// the floor is a few tongues of flame licking up; a man alight, tongues at his trunk, arms and legs as hot as he burns; the wand's
// pilot flame at its nozzle. Smoke rises off all of it. The tanks on the carrier's back are three plain meshes, placed each frame.

/* global THREE */

import { P } from './body.js';
import { yawRotate } from './pose.js';
import { battleFxAddFire, battleFxAddPuff, battleFxFireLight } from './battlefx.js';
import { FLAME, patchReach } from './physics/flame.js';

export const FLAME_VIEW = {
  // A lump's streak (s of its flight behind it), its size leaving the nozzle and swelling (m), and when it is fully red (s).
  streak: 0.03, size: 0.1, swell: 0.9, redden: 0.9,
  // The billow round a lump once it has flown `billowFrom` s: this much bigger, as bright.
  billowFrom: 0.12, billow: 2.1, billowGlow: 0.3,
  // A patch's tongues; a man's flames (m at full heat).
  tongues: 5, manFlame: 0.4,
  // At most this many sprites a frame (the glow batch is shared with sparks and flashes).
  most: 700,
  // The light lent: as bright for a stream, a patch's worth of fuel, a man alight.
  light: { stream: 5, patch: 2.5, man: 2.5 },
  // Smoke, puffs a second: a patch (at its full strength), a man (at full heat), a lump of the stream past `streamFrom` s; each puff's
  // life (s), rise (m/s), size (m, from and to) and opacity.
  smoke: { patch: 2, man: 3, stream: 0.5, streamFrom: 0.35, life: 4, rise: 1.1, from: 0.3, to: 1.5, alpha: 0.4 },
};

const FIRE_HOT = [2.4, 1.7, 0.7];
const FIRE_RED = [1.5, 0.45, 0.08];

/** A blend of the hot and the red colours, `share` red, times `scale`. */
function flameColour(share, scale) {
  return [0, 1, 2].map((c) => (FIRE_HOT[c] + (FIRE_RED[c] - FIRE_HOT[c]) * share) * scale);
}

/** A flicker 0..1 from a seed and the time: a few sines, cheap and never in step. */
const fireFlicker = (seed, time) => 0.5 + 0.25 * Math.sin(time * 13.1 + seed * 31.7) + 0.25 * Math.sin(time * 7.3 + seed * 17.9);

const flameParticleAt = (fighter, index) => [fighter.x[index * 3], fighter.x[index * 3 + 1], fighter.x[index * 3 + 2]];

/** Sooty smoke off a fire at `at`, `rate` puffs a second over `dt` s of the fight (none while it is paused). */
function smokeOff(view, at, rate, dt) {
  const spec = FLAME_VIEW.smoke;
  if (Math.random() >= rate * dt) return;
  const jitter = () => (Math.random() - 0.5) * 0.4;
  battleFxAddPuff(view, {
    at: [at[0] + jitter(), at[1] + 0.3, at[2] + jitter()], velocity: [jitter(), spec.rise, jitter()],
    size0: spec.from, size1: spec.to * (0.8 + Math.random() * 0.5), grow: 1.2, alpha: spec.alpha, life: spec.life * (0.8 + Math.random() * 0.4), rise: spec.rise, soot: 1,
  });
}

/** The fire this frame: the jets, the patches, the men alight, the pilots, their smoke; the tanks on the carriers' backs. */
export function updateFlames(view, world) {
  placeFlameTanks(view, world);
  const flame = world.flame;
  const time = world.time;
  // The fight's own time since the last frame: smoke goes up at the fight's pace.
  const dt = Math.max(0, Math.min(0.1, time - (view.flameTime ?? time)));
  view.flameTime = time;
  const smoke = FLAME_VIEW.smoke;
  let drawn = 0;
  let light = null;
  const lend = (where, intensity) => {
    if (!light || intensity > light.intensity) light = { at: where, intensity };
  };
  const add = (where, size, colour, tail) => {
    if (drawn >= FLAME_VIEW.most) return;
    drawn += 1;
    battleFxAddFire(view, where, size, colour, tail);
  };
  // The men alight first (the sprites are capped: a man on fire is never the one left out).
  const spots = [[P.pelvis, P.neck], [P.neck, P.pelvis], [P.lShoulder, P.lElbow], [P.rShoulder, P.rElbow], [P.lHip, P.lKnee], [P.rHip, P.rKnee], [P.lKnee, P.lFoot], [P.rKnee, P.rFoot], [P.neck, P.head]];
  for (const fighter of world.fighters) {
    const burning = fighter.burning;
    if (!burning || fighter.dormant) continue;
    const heat = burning.heat;
    for (let spot = 0; spot < spots.length; spot += 1) {
      const lick = fireFlicker(fighter.id * 7 + spot, time);
      if (lick > 0.35 + 0.65 * heat) continue;
      const a = flameParticleAt(fighter, spots[spot][0]);
      const b = flameParticleAt(fighter, spots[spot][1]);
      const where = [a[0] + (b[0] - a[0]) * 0.35, a[1] + (b[1] - a[1]) * 0.35 + 0.08, a[2] + (b[2] - a[2]) * 0.35];
      add(where, FLAME_VIEW.manFlame * (0.45 + 0.55 * heat) * (0.7 + 0.5 * lick), flameColour(0.4 + 0.4 * lick, 0.5), [0, (0.25 + 0.45 * lick) * (0.5 + heat), 0]);
    }
    const neck = flameParticleAt(fighter, P.neck);
    smokeOff(view, neck, smoke.man * heat, dt);
    lend(neck, FLAME_VIEW.light.man * heat);
  }
  if (flame) {
    let streamAt = null;
    for (const blob of flame.blobs) {
      const red = Math.min(1, blob.age / FLAME_VIEW.redden);
      const fade = 1 - Math.max(0, (blob.age - FLAME.life * 0.6) / (FLAME.life * 0.4));
      const size = FLAME_VIEW.size + FLAME_VIEW.swell * Math.min(1, blob.age / FLAME_VIEW.redden);
      const tail = [-blob.v[0] * FLAME_VIEW.streak, -blob.v[1] * FLAME_VIEW.streak, -blob.v[2] * FLAME_VIEW.streak];
      add([...blob.x], size, flameColour(red, 0.55 * fade), tail);
      if (blob.age > FLAME_VIEW.billowFrom) {
        const lick = fireFlicker(blob.x[0] * 3.1 + blob.x[2] * 1.7, time);
        add([blob.x[0], blob.x[1] + 0.2 * lick, blob.x[2]], size * FLAME_VIEW.billow * (0.7 + 0.5 * lick), flameColour(Math.min(1, red + 0.3), FLAME_VIEW.billowGlow * fade), [0, 0.3 * lick, 0]);
      }
      if (blob.age > smoke.streamFrom) smokeOff(view, blob.x, smoke.stream, dt);
      if (!streamAt && blob.age > 0.3) streamAt = [...blob.x];
    }
    if (streamAt) lend(streamAt, FLAME_VIEW.light.stream);
    for (const patch of flame.patches) {
      const strength = Math.min(1, patch.fuel / 0.08);
      const reach = patchReach(patch);
      for (let tongue = 0; tongue < FLAME_VIEW.tongues; tongue += 1) {
        const seed = patch.seed * 10 + tongue;
        const lick = fireFlicker(seed, time);
        const angle = seed * 2.4;
        const out = reach * 0.6 * (tongue / FLAME_VIEW.tongues);
        const where = [patch.x[0] + Math.cos(angle) * out, patch.x[1] + 0.15 + 0.15 * lick, patch.x[2] + Math.sin(angle) * out];
        add(where, reach * (0.8 + 0.5 * lick) * strength, flameColour(0.5 + 0.35 * lick, 0.45 * strength), [0, (0.35 + 0.6 * lick) * strength, 0]);
      }
      smokeOff(view, patch.x, smoke.patch * strength, dt);
      lend([patch.x[0], patch.x[1] + 0.5, patch.x[2]], FLAME_VIEW.light.patch * strength);
    }
    // The pilot flame at the nozzle of each wand held.
    for (const [id, valve] of flame.valves) {
      const fighter = world.fighters[id];
      if (!fighter?.weapon?.held || !fighter.weapon.spec.shot?.flame || valve.open) continue;
      const weapon = fighter.weapon;
      const tip = flameParticleAt(fighter, P[`${weapon.main}Hand`]).map((value, axis) => value + weapon.dir[axis] * weapon.spec.muzzle[0]);
      add(tip, 0.05 + 0.02 * fireFlicker(id, time), flameColour(0.3, 0.5), [0, 0.04, 0]);
    }
  }
  if (light) battleFxFireLight(view, light.at, light.intensity);
}


/** The full tanks on each flamethrower man's back (his kit's: `inputs.style`), placed on his trunk this frame. */
function placeFlameTanks(view, world) {
  const tanks = (view.flameTanks ??= new Map());
  for (const [fighter, group] of tanks) {
    if (world.fighters[fighter.id] === fighter) continue;
    view.scene.remove(group);
    tanks.delete(fighter);
  }
  for (const fighter of world.fighters) {
    if (fighter.body.inputs?.style !== 'flamethrower' || fighter.dormant) continue;
    let group = tanks.get(fighter);
    if (!group) {
      group = flameTankMeshes();
      tanks.set(fighter, group);
      view.scene.add(group);
    }
    const pelvis = new THREE.Vector3(...flameParticleAt(fighter, P.pelvis));
    const neck = new THREE.Vector3(...flameParticleAt(fighter, P.neck));
    const up = neck.clone().sub(pelvis).normalize();
    const across = new THREE.Vector3(...flameParticleAt(fighter, P.rShoulder)).sub(new THREE.Vector3(...flameParticleAt(fighter, P.lShoulder))).normalize();
    // His back: square to his shoulders and spine, on the side away from where he faces.
    const back = across.clone().cross(up).normalize();
    const ahead = new THREE.Vector3(...yawRotate([1, 0, 0], fighter.yaw));
    if (back.dot(ahead) > 0) back.negate();
    const forward = back.clone().negate();
    const side = up.clone().cross(forward).normalize();
    group.matrix.makeBasis(side, up, forward);
    group.matrix.setPosition(pelvis.lerp(neck, 0.55).addScaledVector(back, 0.2));
    group.matrixAutoUpdate = false;
    group.matrixWorldNeedsUpdate = true;
  }
}

/** Two fuel tanks and the nitrogen bottle between them, on a frame (local: x across, y up, z ahead). */
function flameTankMeshes() {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x5a6446, roughness: 0.55, metalness: 0.1 });
  for (const x of [-0.11, 0.11]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.52, 14), steel);
    tank.position.set(x, -0.02, 0);
    tank.castShadow = true;
    group.add(tank);
  }
  const bottle = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), steel);
  bottle.position.set(0, 0.06, -0.07);
  group.add(bottle);
  return group;
}
