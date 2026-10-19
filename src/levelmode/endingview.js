// Level mode, the ending's one prop: the shards of the false chalice in the prince's hands (a few small gold slivers
// that go where his hands go). Drawn from the simulation's hand particles, so it follows him as he cowers and crawls.

import { P } from '../body.js';
import { guideOf, princeOf } from './ending.js';

/** A few broken gold shards in a group; `update(world)` puts them in the prince's hands, hidden when he is asleep or gone. */
export function createShards(parent) {
  const group = new THREE.Group();
  group.name = 'chalice-shards';
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b24a, metalness: 0.85, roughness: 0.32, emissive: 0x3a2a08, flatShading: true });
  const slivers = [
    [0.03, 0.1, [0, 0, 0.3], [0, 0.02, 0]],
    [0.026, 0.08, [0.4, 1.2, -0.5], [0.05, -0.01, 0.02]],
    [0.022, 0.07, [-0.5, 0.2, 1.1], [-0.04, 0.0, -0.03]],
    [0.03, 0.06, [1.2, 0.4, 0.2], [0.02, 0.04, 0.03]],
    [0.02, 0.09, [0.2, -0.8, 0.7], [-0.02, -0.03, 0.04]],
  ];
  for (const [radius, length, rotation, offset] of slivers) {
    const shard = new THREE.Mesh(new THREE.ConeGeometry(radius, length, 3), gold);
    shard.rotation.set(...rotation);
    shard.position.set(...offset);
    group.add(shard);
  }
  group.visible = false;
  parent.add(group);
  return {
    group,
    update(world) {
      const prince = princeOf(world);
      const on = Boolean(prince) && !prince.dormant && prince.state !== 'out';
      group.visible = on;
      if (!on) return;
      const left = P.lHand * 3;
      const right = P.rHand * 3;
      const x = prince.x;
      // Between his hands, a little toward his chest.
      group.position.set((x[left] + x[right]) / 2, (x[left + 1] + x[right + 1]) / 2 + 0.05, (x[left + 2] + x[right + 2]) / 2);
    },
    dispose() {
      parent.remove(group);
      gold.dispose();
      group.traverse((object) => object.geometry?.dispose());
    },
  };
}

// ---- The guide: the way from the opened inner door to the prince --------------------------------------------------------------

export const GUIDE = {
  // m between the way-marks on the floor, and the most of them (the way is door to prince: a short walk).
  spacing: 0.75,
  most: 20,
  // The marks' radius (m) and lift over the floor (m), and the colour: the gold of the markers' 'work' glint, a little warmer.
  radius: 0.17,
  lift: 0.05,
  color: 0xf0c060,
  // The beacon over the door: its height (m) and size (m); how fast the glow pulses and the chase of the marks goes (rad/s).
  beacon: { height: 1.8, size: 3.0 },
  pulse: 2.6,
  chase: 3.2,
};

/**
 * The glow over the opened inner door and a trail of way-marks along the floor from it to the prince, lit while the ending is `open`
 * (ending.js guideOf; hidden once the scene begins). `update(world)` each frame; `dispose()`. Additive and soft, like the markers:
 * no light, so no shader to build.
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
  let laid = false;
  return {
    group,
    update(world) {
      const guide = guideOf(world);
      group.visible = Boolean(guide);
      if (!guide) {
        laid = false;
        return;
      }
      const clock = performance.now() / 1000;
      const [dx, dy, dz] = guide.door;
      const [qx, qy, qz] = guide.prince;
      if (!laid) {
        laid = true;
        beacon.position.set(dx, dy + GUIDE.beacon.height, dz);
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
      // A pulse runs along the marks toward the prince, one after another.
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
