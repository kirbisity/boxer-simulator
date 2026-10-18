// Level mode, the markers on things to use: a faint glint over a lever, a gate or ladder not yet worked, a rest
// point's warm glow, a dead man whose harness could be taken and a weapon lying loose; gone once used or taken.
// (The items and notes carry their own, kit.js.) Soft, additive, dim: seen a few metres off, never garish. A small pool of
// sprites is placed on the nearest of the candidates a few times a second, so the cost does not grow with the stage.

import { P } from '../body.js';
import { levelOf } from './items.js';
import { bodiesWithin, looseWithin } from './loot.js';

export const MARKERS = {
  // m: the farthest a marker is shown, and the most at once.
  range: 9,
  pool: 14,
  // s between a pick of what to show (the glow's pulse runs every frame).
  every: 0.2,
  // Colours: a gold glint for things to work, a warm one for a rest, a cold one for things to take from the dead.
  color: { work: 0xe8c878, rest: 0xff9a48, take: 0xaec8e8 },
  // Sprite sizes (m) and the height over the thing's floor point (m).
  size: { work: 0.5, rest: 1.1, take: 0.42 },
  lift: { work: 0.9, rest: 1.6, take: 0.35 },
};

/** A soft round glow, a canvas map. */
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/**
 * What in the active sections of a stage is worth a marker now, near `me` ([x, z]): [{ at: [x, y, z], kind, distance }].
 * Pure (no drawing): the stage data and the run's state. Levers whose gate or ladder already stands as they set it, gates
 * and ladders worked, are left out.
 */
export function markerCandidates(world, me, range = MARKERS.range) {
  const stage = world.stage;
  const found = [];
  const add = (at, kind) => {
    const distance = Math.hypot(at[0] - me[0], at[2] - me[1]);
    if (distance <= range) found.push({ at, kind, distance });
  };
  for (const section of stage.def.sections) {
    if (!stage.active.includes(section.id)) continue;
    for (const lever of section.levers ?? []) if (stage.mechanisms[lever.target] !== lever.state) add(lever.at, 'work');
    for (const gate of section.gates ?? []) if ((gate.opensFrom || gate.key) && stage.mechanisms[gate.id] !== 'open') add(gate.at, 'work');
    for (const ladder of section.ladders ?? []) if (ladder.kickFrom && stage.mechanisms[ladder.id] !== 'down') add(ladder.at, 'work');
    if (section.rest) add(section.rest.at, 'rest');
  }
  return found;
}

/** The markers of a stage view: `update(world)` each frame; `dispose()`. They live in `parent` (a group of the scene). */
export function createLevelMarkers(parent) {
  const texture = glowTexture();
  const group = new THREE.Group();
  group.name = 'level-markers';
  const sprites = Array.from({ length: MARKERS.pool }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }));
    sprite.renderOrder = 5;
    sprite.visible = false;
    group.add(sprite);
    return sprite;
  });
  parent.add(group);
  let clock = 0;
  let last = null;
  let picked = [];

  function pick(world) {
    const level = levelOf(world);
    const me = world.fighters[0];
    const live = Boolean(level) && me.state === 'up';
    const hips = [me.x[P.pelvis * 3], me.x[P.pelvis * 3 + 2]];
    const found = live ? markerCandidates(world, hips) : [];
    if (live) {
      for (const { debris, distance } of looseWithin(world, me, MARKERS.range, 3)) found.push({ at: [debris.x[0], debris.x[1], debris.x[2]], kind: 'take', distance });
      for (const { dead, distance } of bodiesWithin(world, me, MARKERS.range, 3)) found.push({ at: [dead.x[P.pelvis * 3], dead.x[P.pelvis * 3 + 1] - 0.2, dead.x[P.pelvis * 3 + 2]], kind: 'take', distance });
    }
    found.sort((a, b) => a.distance - b.distance);
    picked = found.slice(0, sprites.length);
    sprites.forEach((sprite, index) => {
      const entry = picked[index];
      sprite.visible = Boolean(entry);
      if (!entry) return;
      sprite.position.set(entry.at[0], entry.at[1] + MARKERS.lift[entry.kind], entry.at[2]);
      sprite.material.color.setHex(MARKERS.color[entry.kind]);
      sprite.scale.setScalar(MARKERS.size[entry.kind]);
    });
  }

  return {
    group,
    update(world) {
      const now = performance.now() / 1000;
      const dt = last === null ? 0 : Math.min(0.1, now - last);
      last = now;
      clock -= dt;
      if (clock <= 0) {
        clock = MARKERS.every;
        pick(world);
      }
      picked.forEach((entry, index) => {
        const phase = now * (entry.kind === 'rest' ? 5 : 2.4) + entry.at[0] * 1.7 + entry.at[2];
        // Fades in toward the edge of its range (nothing pops), and breathes.
        const near = Math.min(1, (MARKERS.range - entry.distance) / 2.5);
        sprites[index].material.opacity = near * (entry.kind === 'rest' ? 0.5 + 0.2 * Math.sin(phase) + 0.08 * Math.sin(phase * 3.7) : 0.34 + 0.2 * Math.sin(phase));
      });
    },
    dispose() {
      parent.remove(group);
      for (const sprite of sprites) sprite.material.dispose();
      texture.dispose();
    },
  };
}
