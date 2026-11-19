// The red dot of an execution to be had (finisher.js executable): a man broken open by the player's big deflect (physics.js
// throwDownOpen) shows a small glowing red point on his face, at the sights of his helm, blinking slowly and fading as his moment
// runs out: there, the point goes in. Strike or tap him while it shows and the player executes him (control.js finishOnAttack).
// Light: a few sprites made once, reused; drawn over everything.

/* global THREE */

import { P } from './body.js';
import { executable } from './finisher.js';
import { WORLD } from './physics.js';

export const EXECUTE_MARK = {
  // Out from the head's centre toward his face (head radii), the sprite's size on the screen (a share of its height), how many at
  // once, the blink (Hz, slow: a heartbeat's, not an alarm's), and the share of its brightness kept at the blink's low.
  forward: 1.05,
  size: 0.06,
  most: 2,
  blinkHz: 1.1,
  low: 0.25,
  colour: [255, 40, 25],
};

/** A small red point with a soft red glow round it, on a canvas. */
function dotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const [r, g, b] = EXECUTE_MARK.colour;
  const glow = context.createRadialGradient(32, 32, 2, 32, 32, 31);
  glow.addColorStop(0, `rgba(255, 230, 220, 1)`);
  glow.addColorStop(0.18, `rgba(${r}, ${g}, ${b}, 1)`);
  glow.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.45)`);
  glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/** The dots, in the view's scene: `update(world, player, time)` each frame (time in s, for the blink). */
export function createExecuteMarks(view) {
  const texture = dotTexture();
  const sprites = Array.from({ length: EXECUTE_MARK.most }, (_, index) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false, sizeAttenuation: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    sprite.scale.setScalar(EXECUTE_MARK.size);
    sprite.renderOrder = 996;
    sprite.frustumCulled = false;
    sprite.visible = false;
    sprite.name = `execute-${index}`;
    view.scene.add(sprite);
    return sprite;
  });
  return {
    sprites,
    update(world, player, time) {
      let shown = 0;
      if (world && player && player.state === 'up' && !player.finisher) {
        for (const man of world.fighters) {
          if (shown >= sprites.length) break;
          if (man === player || !executable(world, man)) continue;
          // On his face: from the head's centre toward where he faces (the neck to the head, turned flat), at eye height.
          const head = [man.x[P.head * 3], man.x[P.head * 3 + 1], man.x[P.head * 3 + 2]];
          const yaw = man.yaw ?? 0;
          const out = man.body.lengths.headRadius * EXECUTE_MARK.forward;
          const sprite = sprites[shown];
          sprite.position.set(head[0] + Math.cos(yaw) * out, head[1] + man.body.lengths.headRadius * 0.15, head[2] - Math.sin(yaw) * out);
          // Fading as his moment runs out (`executableUntil`), blinking slowly the while.
          const left = Math.max(0, Math.min(1, (man.executableUntil - world.time) / WORLD.deflect.big.open));
          const blink = EXECUTE_MARK.low + (1 - EXECUTE_MARK.low) * (0.5 + 0.5 * Math.cos(time * Math.PI * 2 * EXECUTE_MARK.blinkHz));
          sprite.material.opacity = blink * (0.25 + 0.75 * left);
          sprite.scale.setScalar(EXECUTE_MARK.size * (0.85 + 0.3 * blink));
          sprite.visible = true;
          shown += 1;
        }
      }
      for (let index = shown; index < sprites.length; index += 1) sprites[index].visible = false;
    },
  };
}
