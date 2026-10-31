// Hair that swings (photo faces): a few spring chains per head, one for each
// sector round it where hair hangs free (below the ear line), simulated in
// the world (Verlet: what the head's turning, ducking and running leaves
// behind swings after it), pulled back towards its rest by a stiffness,
// damped, held to its segments' lengths and pushed out of the body's
// capsules (head, trunk, shoulders: render.js dangleColliders). The hair's
// vertices follow the two nearest chains by how far down the hanging part
// they are: what sits on the scalp, and short hair, does not move.
//
// Cheap: at most `sectors` chains of `nodes` points a head, and one pass over
// the hair's vertices a frame, for the fighters drawn in full only (a crowd's
// heads have no hair geometry).

/* global THREE */

export const HAIR_SWING = {
  sectors: 8,
  nodes: 5,
  // Pull back towards rest, per step (0..1); velocity kept per step (1 - damping); gravity (m/s²).
  stiffness: 0.06,
  damping: 0.1,
  gravity: 9.81,
  // How hard a blow to the head throws the hair (m/s at the tips).
  hitShare: 1.6,
  // Hair hangs free below this height (of the head's radius from its centre): at the face, and behind (the nape: hair above it
  // lies on the skull); a chain needs `shortest` of hanging hair to exist.
  freeFrom: [0.05, -0.7],
  shortest: 0.25,
  substeps: 2,
  maxStep: 1 / 30,
  // Pushed out to this share of a collider's radius.
  clearance: 1.06,
  // Each chain's swing eased this much towards each neighbour's (a sector without one counts as still), so a solid mass hung
  // over two chains of different lengths (a hime's side lock beside its long back) bends between them instead of tearing.
  neighbour: 0.25,
};

const hairSectorOf = (x, z, count) => {
  const angle = Math.atan2(z, x);
  return (((angle / (Math.PI * 2)) * count) % count + count) % count;
};

/**
 * Swing for the hair meshes of a head (`meshes`, children of the head's group, in its space; `r` the head's radius). Returns
 * null when nothing hangs (short hair). `update(dt, group, colliders)` each frame; `kick(direction, speed)` throws it.
 */
export function buildHairSwing(meshes, r) {
  const config = HAIR_SWING;
  const count = config.sectors;
  // The free line by azimuth (0 the face, π the back), and by sector.
  const topAt = (angle) => {
    const behind = Math.min(1, Math.max(0, (Math.abs(angle) / Math.PI - 0.3) / 0.7));
    return r * (config.freeFrom[0] + (config.freeFrom[1] - config.freeFrom[0]) * behind * behind * (3 - 2 * behind));
  };
  const sectorTop = Array.from({ length: count }, (_, sector) => topAt(Math.atan2(Math.sin((sector / count) * Math.PI * 2), Math.cos((sector / count) * Math.PI * 2))));
  // Every vertex: its rest place, its sector (fractional), how far down the hanging hair.
  const entries = meshes.map((mesh) => ({ mesh, rest: Float32Array.from(mesh.geometry.attributes.position.array) }));
  const lowest = [...sectorTop];
  const reach = new Array(count).fill(0);
  for (const { rest } of entries) {
    for (let i = 0; i < rest.length; i += 3) {
      const sector = Math.round(hairSectorOf(rest[i], rest[i + 2], count)) % count;
      lowest[sector] = Math.min(lowest[sector], rest[i + 1]);
      reach[sector] = Math.max(reach[sector], Math.hypot(rest[i], rest[i + 2]));
    }
  }
  const chains = [];
  for (let sector = 0; sector < count; sector += 1) {
    const top = sectorTop[sector];
    const length = top - lowest[sector];
    if (length < config.shortest * r) {
      chains.push(null);
      continue;
    }
    const angle = (sector / count) * Math.PI * 2;
    const out = Math.max(reach[sector] * 0.9, 1.0 * r);
    const restLocal = [];
    for (let node = 0; node < config.nodes; node += 1) restLocal.push(new THREE.Vector3(Math.cos(angle) * out, top - (length * node) / (config.nodes - 1), Math.sin(angle) * out));
    chains.push({ length, top, restLocal, world: null, previous: null, raw: restLocal.map(() => new THREE.Vector3()), offsets: restLocal.map(() => new THREE.Vector3()) });
  }
  if (!chains.some(Boolean)) return null;
  // Bindings: for each vertex, two sectors' weights and its depth down the hanging hair (0 at the free line).
  for (const entry of entries) {
    const { rest } = entry;
    const binding = new Float32Array((rest.length / 3) * 4);
    for (let v = 0, i = 0; i < rest.length; v += 1, i += 3) {
      const at = hairSectorOf(rest[i], rest[i + 2], count);
      const a = Math.floor(at) % count;
      const b = (a + 1) % count;
      const share = at - Math.floor(at);
      const depth = topAt(Math.atan2(rest[i + 2], rest[i])) - rest[i + 1];
      binding.set([a, b, share, depth], v * 4);
    }
    entry.binding = binding;
  }
  const inverse = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const gravityStep = new THREE.Vector3();
  let enabled = true;

  function push(position, colliders) {
    for (const { a, b, radius } of colliders) {
      const axis = point.subVectors(b, a);
      const span = axis.lengthSq() || 1e-9;
      const t = Math.max(0, Math.min(1, position.clone().sub(a).dot(axis) / span));
      const closest = a.clone().addScaledVector(axis, t);
      const offset = position.clone().sub(closest);
      const distance = offset.length();
      const wanted = radius * config.clearance;
      if (distance < wanted && distance > 1e-6) position.copy(closest).addScaledVector(offset, wanted / distance);
    }
  }

  function step(h, matrix, colliders) {
    gravityStep.set(0, -config.gravity * h * h, 0);
    for (const chain of chains) {
      if (!chain) continue;
      const rest = chain.restLocal.map((p) => p.clone().applyMatrix4(matrix));
      if (!chain.world) {
        chain.world = rest.map((p) => p.clone());
        chain.previous = rest.map((p) => p.clone());
      }
      const segment = chain.length / (config.nodes - 1);
      chain.world[0].copy(rest[0]);
      chain.previous[0].copy(rest[0]);
      for (let node = 1; node < config.nodes; node += 1) {
        const x = chain.world[node];
        const velocity = x.clone().sub(chain.previous[node]).multiplyScalar(1 - config.damping);
        chain.previous[node].copy(x);
        x.add(velocity).add(gravityStep);
        x.lerp(rest[node], config.stiffness);
      }
      for (let pass = 0; pass < 2; pass += 1) {
        for (let node = 1; node < config.nodes; node += 1) {
          const x = chain.world[node];
          const pivot = chain.world[node - 1];
          const link = x.clone().sub(pivot);
          const span = link.length() || 1e-6;
          x.copy(pivot).addScaledVector(link, segment / span);
          push(x, colliders);
        }
      }
    }
  }

  return {
    chains,
    get enabled() {
      return enabled;
    },
    set enabled(value) {
      enabled = value;
    },
    /** One frame: `group` is the head's group (its world matrix places the rest), `colliders` the body's capsules. */
    update(dt, group, colliders = []) {
      if (!enabled || dt <= 0) return;
      group.updateMatrixWorld(true);
      const matrix = group.matrixWorld;
      const steps = config.substeps;
      const h = Math.min(dt, config.maxStep) / steps;
      for (let s = 0; s < steps; s += 1) step(h, matrix, colliders);
      inverse.copy(matrix).invert();
      for (const chain of chains) {
        if (!chain) continue;
        chain.world.forEach((world, node) => chain.raw[node].copy(world).applyMatrix4(inverse).sub(chain.restLocal[node]));
      }
      const share = config.neighbour;
      chains.forEach((chain, sector) => {
        if (!chain) return;
        const left = chains[(sector + count - 1) % count];
        const right = chains[(sector + 1) % count];
        chain.offsets.forEach((offset, node) => {
          offset.copy(chain.raw[node]).multiplyScalar(1 - 2 * share);
          if (left) offset.addScaledVector(left.raw[Math.min(node, left.raw.length - 1)], share);
          if (right) offset.addScaledVector(right.raw[Math.min(node, right.raw.length - 1)], share);
        });
      });
      const last = config.nodes - 1;
      for (const { mesh, rest, binding } of entries) {
        const position = mesh.geometry.attributes.position;
        const array = position.array;
        for (let v = 0, i = 0; i < rest.length; v += 1, i += 3) {
          const depth = binding[v * 4 + 3];
          if (depth <= 0) continue;
          let x = 0;
          let y = 0;
          let z = 0;
          for (const [sector, weight] of [[binding[v * 4], 1 - binding[v * 4 + 2]], [binding[v * 4 + 1], binding[v * 4 + 2]]]) {
            const chain = chains[sector];
            if (!chain || weight <= 0) continue;
            const along = Math.min(last, (depth / chain.length) * last);
            const k = Math.min(last - 1, Math.floor(along));
            const f = along - k;
            const o0 = chain.offsets[k];
            const o1 = chain.offsets[k + 1];
            x += weight * (o0.x + (o1.x - o0.x) * f);
            y += weight * (o0.y + (o1.y - o0.y) * f);
            z += weight * (o0.z + (o1.z - o0.z) * f);
          }
          array[i] = rest[i] + x;
          array[i + 1] = rest[i + 1] + y;
          array[i + 2] = rest[i + 2] + z;
        }
        position.needsUpdate = true;
      }
    },
    /** Throw the hanging hair: `direction` (world), `speed` (m/s at the tips). */
    kick(direction, speed) {
      for (const chain of chains) {
        if (!chain?.world) continue;
        for (let node = 1; node < config.nodes; node += 1) chain.previous[node].addScaledVector(direction, -speed * (node / (config.nodes - 1)) * (1 / 60));
      }
    },
  };
}
