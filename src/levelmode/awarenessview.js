// Level mode, a development overlay: a letter over each awake man's head for what he is doing
// (I idle, P patrol, A aggro, S search, R return, F flee, C cower, f follow, s stayed, x down).
// Off until asked: `boxer.stage().overlay(true)`. Plain DOM over the canvas; nothing in the game reads it.

import { P } from '../body.js';
import { stateLetter } from './awareness.js';

const COLOURS = { idle: '#9aa0a6', patrol: '#9aa0a6', aggro: '#ff5a4f', search: '#ffb347', return: '#e6d36a', flee: '#7fd1ff', cower: '#7fd1ff', follow: '#7be07b', stayed: '#7be07b', down: '#555' };

/** An overlay on `canvas`'s parent. Returns { update(world, camera), show(on), dispose() }. */
export function createAwarenessOverlay(canvas) {
  const layer = document.createElement('div');
  Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden', zIndex: '20' });
  layer.hidden = true;
  canvas.parentElement.appendChild(layer);
  const tags = [];
  const point = new THREE.Vector3();
  return {
    show(on) {
      layer.hidden = !on;
    },
    update(world, camera) {
      if (layer.hidden) return;
      const aware = world.stage?.aware;
      if (!aware) return;
      const box = canvas.getBoundingClientRect();
      const parent = layer.getBoundingClientRect();
      let used = 0;
      for (const mind of aware.minds) {
        if (!mind) continue;
        const fighter = world.fighters[mind.id];
        if (fighter.dormant) continue;
        point.set(fighter.x[P.head * 3], fighter.x[P.head * 3 + 1] + 0.45, fighter.x[P.head * 3 + 2]).project(camera);
        if (point.z > 1) continue;
        const tag = tags[used] ?? (tags[used] = layer.appendChild(Object.assign(document.createElement('div'), { })));
        Object.assign(tag.style, { position: 'absolute', font: 'bold 13px monospace', textShadow: '0 0 3px #000, 0 0 3px #000', transform: 'translate(-50%, -100%)' });
        tag.style.left = `${box.left - parent.left + ((point.x + 1) / 2) * box.width}px`;
        tag.style.top = `${box.top - parent.top + ((1 - point.y) / 2) * box.height}px`;
        tag.style.color = COLOURS[mind.state] ?? '#fff';
        tag.style.display = '';
        tag.textContent = stateLetter(mind.state);
        used += 1;
      }
      for (let index = used; index < tags.length; index += 1) tags[index].style.display = 'none';
    },
    dispose() {
      layer.remove();
    },
  };
}
