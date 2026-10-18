// Level mode, the ending's one prop: the shards of the false chalice in the prince's hands (a few small gold slivers
// that go where his hands go). Drawn from the simulation's hand particles, so it follows him as he cowers and crawls.

import { P } from '../body.js';
import { princeOf } from './ending.js';

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
