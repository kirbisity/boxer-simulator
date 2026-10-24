// Level mode, the ending's guide on the screen: the glow over where to go and the way-marks to it, once the boss is down (ending.js guideOf):
// from the opened doors behind the altar to the privy's hole in the back room, then, with the horde coming, over the hole alone.

import { guideOf } from './ending.js';

// ---- The guide: the way from the opened doors to the privy's hole ----------------------------------------------------------------

export const GUIDE = {
  // m between the way-marks on the floor, and the most of them (the way is door to hole: a short walk).
  spacing: 0.75,
  most: 20,
  // The marks' radius (m) and lift over the floor (m), and the colour: the gold of the markers' 'work' glint, a little warmer.
  radius: 0.17,
  lift: 0.05,
  color: 0xf0c060,
  // The beacon over the door or the hole: its height (m) and size (m); how fast the glow pulses and the chase of the marks goes (rad/s).
  beacon: { height: 1.8, size: 3.0 },
  pulse: 2.6,
  chase: 3.2,
};

/**
 * The glow over where to go and a trail of way-marks along the floor to the privy's hole, lit while the ending is `open` (the glow over the doors)
 * and while the horde comes (the glow over the hole, no marks): ending.js guideOf. `update(world)` each frame; `dispose()`. Additive and soft, like
 * the markers: no light, so no shader to build.
 */
export function createGuide(parent) {
  const group = new THREE.Group();
  group.name = 'ending-guide';
  group.visible = false;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: GUIDE.color, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }));
  beacon.renderOrder = 5;
  beacon.scale.setScalar(GUIDE.beacon.size);
  group.add(beacon);
  const disc = new THREE.CircleGeometry(GUIDE.radius, 14);
  const marks = Array.from({ length: GUIDE.most }, () => {
    const material = new THREE.MeshBasicMaterial({ map: texture, color: GUIDE.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false, side: THREE.DoubleSide });
    const mark = new THREE.Mesh(disc, material);
    mark.rotation.x = -Math.PI / 2;
    mark.renderOrder = 5;
    group.add(mark);
    return mark;
  });
  parent.add(group);
  let laid = '';
  return {
    group,
    update(world) {
      const guide = guideOf(world);
      group.visible = Boolean(guide);
      if (!guide) {
        laid = '';
        return;
      }
      const clock = performance.now() / 1000;
      const [dx, dy, dz] = guide.from;
      const [qx, qy, qz] = guide.to;
      // (Laid out again when the guide changes: the doors' glow, then the hole's.)
      const key = JSON.stringify(guide);
      if (laid !== key) {
        laid = key;
        beacon.position.set(guide.beacon[0], guide.beacon[1] + GUIDE.beacon.height, guide.beacon[2]);
        const length = Math.hypot(qx - dx, qz - dz);
        const count = Math.min(GUIDE.most, Math.max(0, Math.floor((length - 1.2) / GUIDE.spacing)));
        marks.forEach((mark, index) => {
          mark.visible = index < count;
          if (index >= count) return;
          const share = ((index + 1) * GUIDE.spacing) / length;
          mark.position.set(dx + (qx - dx) * share, dy + (qy - dy) * share + GUIDE.lift, dz + (qz - dz) * share);
        });
      }
      beacon.material.opacity = 0.7 + 0.25 * Math.sin(clock * GUIDE.pulse);
      // A pulse runs along the marks toward the hole, one after another.
      marks.forEach((mark, index) => {
        if (mark.visible) mark.material.opacity = 0.18 + 0.5 * Math.max(0, Math.sin(clock * GUIDE.chase - index * 0.55)) ** 3;
      });
    },
    dispose() {
      parent.remove(group);
      beacon.material.dispose();
      disc.dispose();
      for (const mark of marks) mark.material.dispose();
      texture.dispose();
    },
  };
}
