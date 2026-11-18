// The red mark of a stroke that cannot be deflected (physics.js undeflectable): a glowing red "!" over the head of a man whose
// blow at the man played is too heavy for his blade to turn (a war hammer, a great club, a lance couched on a horse), from the
// moment the blow begins until it is spent, pulsing so it is seen at the edge of the eye. Only when the man played guards by
// deflecting (a weapon in hand): with a shield or his fists the guard is a block, and there is nothing to warn of.
// Light: a few sprites made once, reused; drawn over everything.

/* global THREE */

import { P } from './body.js';
import { undeflectable } from './physics.js';

export const PERIL_MARK = {
  // m over the top of his head, the sprite's size on the screen (a share of its height), how many at once, and the pulse (Hz).
  lift: 0.65,
  size: 0.075,
  most: 4,
  pulseHz: 5,
  colour: '#ff2a1a',
};

/** A red "!" with a soft red glow round it, on a canvas. */
function markTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const glow = context.createRadialGradient(32, 32, 4, 32, 32, 31);
  glow.addColorStop(0, 'rgba(255, 60, 30, 0.75)');
  glow.addColorStop(1, 'rgba(255, 20, 10, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);
  context.font = 'bold 44px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 6;
  context.strokeStyle = 'rgba(30, 0, 0, 0.9)';
  context.strokeText('!', 32, 34);
  context.fillStyle = PERIL_MARK.colour;
  context.fillText('!', 32, 34);
  return new THREE.CanvasTexture(canvas);
}

/** The marks, in the view's scene: `update(world, player, time)` each frame (time in s, for the pulse). */
export function createPerilMarks(view) {
  const texture = markTexture();
  const sprites = Array.from({ length: PERIL_MARK.most }, (_, index) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false, sizeAttenuation: false, toneMapped: false }));
    sprite.scale.setScalar(PERIL_MARK.size);
    // (Over everything, as the fight's own marks are: fightui/marker.js; and never culled, its size being the screen's.)
    sprite.renderOrder = 995;
    sprite.frustumCulled = false;
    sprite.visible = false;
    sprite.name = `peril-${index}`;
    view.scene.add(sprite);
    return sprite;
  });
  return {
    sprites,
    update(world, player, time) {
      let shown = 0;
      if (world && player && player.state === 'up') {
        for (const man of world.fighters) {
          if (shown >= sprites.length) break;
          if (man === player || man.state !== 'up' || !undeflectable(man, player)) continue;
          const sprite = sprites[shown];
          sprite.position.set(man.x[P.head * 3], man.x[P.head * 3 + 1] + PERIL_MARK.lift, man.x[P.head * 3 + 2]);
          const pulse = 0.5 + 0.5 * Math.sin(time * Math.PI * 2 * PERIL_MARK.pulseHz);
          sprite.scale.setScalar(PERIL_MARK.size * (0.9 + 0.25 * pulse));
          sprite.material.opacity = 0.7 + 0.3 * pulse;
          sprite.visible = true;
          shown += 1;
        }
      }
      for (let index = shown; index < sprites.length; index += 1) sprites[index].visible = false;
    },
  };
}
