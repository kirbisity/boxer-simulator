// The mark over each side's general (ai.js AI.general): a small crown in his
// side's colour, floating over his head, so the man his side forms on and
// guards can be found in the crowd, and the moment command passes is seen.
// Light: one sprite a side, made once; hidden when a side has no general in
// the fight (a duel, a small fight, a level's stage, or nobody left to lead).

/* global THREE */

import { P } from './body.js';
import { generalOf } from './ai.js';

export const GENERAL_MARK = {
  // m over the top of his head, and the sprite's size on the screen (a share of its height: the same near or far, to be found in a crowd).
  lift: 0.55,
  size: 0.035,
  // Each side's colour (lighter than the standards', to read against the field).
  colour: { red: '#ff6a5c', blue: '#79a6ff' },
};

/** A crown drawn on a canvas in `colour`, with a dark outline to read on a bright field. */
function crownTexture(colour) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  context.beginPath();
  context.moveTo(10, 48);
  context.lineTo(6, 18);
  context.lineTo(20, 32);
  context.lineTo(32, 12);
  context.lineTo(44, 32);
  context.lineTo(58, 18);
  context.lineTo(54, 48);
  context.closePath();
  context.lineJoin = 'round';
  context.lineWidth = 6;
  context.strokeStyle = 'rgba(10, 12, 18, 0.85)';
  context.stroke();
  context.fillStyle = colour;
  context.fill();
  return new THREE.CanvasTexture(canvas);
}

/** The marks, in the view's scene: `update(world)` each frame. */
export function createGeneralMarks(view) {
  const sprites = {};
  for (const corner of ['red', 'blue']) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: crownTexture(GENERAL_MARK.colour[corner]), transparent: true, depthTest: false, depthWrite: false, fog: false, sizeAttenuation: false }));
    sprite.scale.setScalar(GENERAL_MARK.size);
    sprite.renderOrder = 6;
    sprite.visible = false;
    sprite.name = `general-${corner}`;
    view.scene.add(sprite);
    sprites[corner] = sprite;
  }
  return {
    update(world) {
      for (const corner of ['red', 'blue']) {
        // (Not over the man played: the camera is at his shoulder, and he knows he leads; the log says so.)
        const found = world && !world.stage ? generalOf(world, corner) : null;
        const general = found && !found.player ? found : null;
        const sprite = sprites[corner];
        sprite.visible = Boolean(general);
        if (!general) continue;
        sprite.position.set(general.x[P.head * 3], general.x[P.head * 3 + 1] + GENERAL_MARK.lift, general.x[P.head * 3 + 2]);
      }
    },
  };
}
