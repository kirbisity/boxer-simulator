// Hair that swings (photo faces): chains of a few nodes hung from the head
// (hairmass.js gives them: a ring round the head for a hang, one for each
// ponytail, rope and ringlet), simulated in the world (Verlet: what the
// head's turning, ducking and running leaves behind swings after it), each
// link held to its length, bent back towards the shape it was cut to (its
// rest, carried round by the head: a stiffness that is strongest at the root
// and fades to the tips, so the ends swing most), damped, pulled down by
// gravity, and kept out of the head (an ellipsoid fitted to it), the neck
// and the body's capsules (trunk, shoulders, upper arms: render.js
// dangleColliders). Each hair vertex follows its chain (or the two either
// side of it, on a hang) by how far down it is: what lies on the scalp does
// not move.
//
// Cheap: chains of six nodes, no allocation a frame, one pass over the hair's
// vertices; only for the fighters drawn in full (a crowd's heads have no
// hair geometry), and off under a helmet unless something hangs below it.

/* global THREE */

export const HAIR_SWING = {
  // Bend back towards the rest shape, per substep (0..1), at the root; the tips keep `tipShare` of it (they swing freely).
  stiffness: 0.12,
  tipShare: 0.25,
  // Velocity lost per substep (air and the strands rubbing): a long hang settles in about a second, as real hair does.
  damping: 0.05,
  gravity: 9.81,
  // How hard a blow to the head throws the hair (m/s at the tips).
  hitShare: 1.6,
  // Two substeps a frame at 60 fps (a long hang's tip moves a link's length a frame on a fast turn: one step overshoots).
  substeps: 2,
  maxStep: 1 / 30,
  // Length passes a substep: two hold a six-node chain to within a few per cent.
  passes: 2,
  // Pushed out to this share of a collider's radius (and the head's ellipsoid grown by it): the hair lies on, not in.
  clearance: 1.06,
  // A hang's chain eased this much towards each neighbour's swing (a missing one counts as still), so the hang moves as one
  // mass in broad waves and a short side lock beside a long back (a hime's) bends with it instead of tearing.
  neighbour: 0.2,
  // The neck (not one of the body's colliders): a capsule from between the shoulders to the head, this share of the head
  // collider's radius.
  neck: 0.5,
  // A head moved more than this in one frame (m; a sprint's head moves 0.15 m a frame at 30 fps) was placed, not moved.
  jump: 0.4,
};

/**
 * Swing for a head's hair meshes (children of the head's group, in its space; each geometry's `userData.swing`: per vertex
 * chain a, chain b, b's share, how far down) on `chains` (local rest points, root first, optional `stiffness`, `damping`,
 * `ring`). `head`: the head's ellipsoid in local space ({ centre, radii }). Null when nothing hangs.
 * `update(dt, group, colliders)` each frame; `kick(direction, speed)` throws it.
 */
export function buildHairSwing(meshes, chainSpecs, head) {
  const config = HAIR_SWING;
  if (!chainSpecs.length) return null;
  const chains = chainSpecs.map((spec) => {
    const count = spec.rest.length;
    const rest = new Float32Array(count * 3);
    spec.rest.forEach((p, k) => rest.set([p.x, p.y, p.z], k * 3));
    const segments = new Float32Array(count);
    let length = 0;
    for (let k = 1; k < count; k += 1) {
      segments[k] = spec.rest[k].distanceTo(spec.rest[k - 1]);
      length += segments[k];
    }
    return {
      count, rest, segments, length, ring: Boolean(spec.ring),
      stiffness: spec.stiffness ?? config.stiffness, damping: spec.damping ?? config.damping,
      world: new Float32Array(count * 3), previous: new Float32Array(count * 3), raw: new Float32Array(count * 3), offsets: new Float32Array(count * 3),
      started: false,
    };
  });
  // The ring's neighbours (the hang's chains, in order round the head).
  const ring = chains.filter((chain) => chain.ring);
  ring.forEach((chain, i) => Object.assign(chain, { left: ring[(i + ring.length - 1) % ring.length], right: ring[(i + 1) % ring.length] }));
  const entries = meshes.filter((mesh) => mesh.geometry.userData.swing).map((mesh) => ({
    mesh,
    rest: Float32Array.from(mesh.geometry.attributes.position.array),
    binding: mesh.geometry.userData.swing,
  }));
  const matrix = new THREE.Matrix4();
  const inverse = new THREE.Matrix4();
  const e = matrix.elements;
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  const q = new THREE.Vector3();
  const neck = { a: new THREE.Vector3(), b: new THREE.Vector3(), radius: 0 };
  let scale = 1;
  const lastHead = new THREE.Vector3(Infinity, 0, 0);
  let enabled = true;

  // The head's ellipsoid (local): a point inside is pushed out along its scaled direction.
  function pushOutOfHead(position) {
    v.copy(position).applyMatrix4(inverse).sub(head.centre);
    const [ax, ay, az] = head.radii;
    const c = config.clearance;
    const inside = (v.x / (ax * c)) ** 2 + (v.y / (ay * c)) ** 2 + (v.z / (az * c)) ** 2;
    if (inside >= 1 || inside < 1e-9) return;
    v.multiplyScalar(1 / Math.sqrt(inside)).add(head.centre).applyMatrix4(matrix);
    position.copy(v);
  }
  function pushOutOfCapsule(position, a, b, radius) {
    w.subVectors(b, a);
    const span = w.lengthSq();
    const t = span > 1e-12 ? Math.max(0, Math.min(1, q.subVectors(position, a).dot(w) / span)) : 0;
    q.copy(a).addScaledVector(w, t);
    v.subVectors(position, q);
    const distance = v.length();
    const wanted = radius * config.clearance;
    if (distance < wanted && distance > 1e-6) position.copy(q).addScaledVector(v, wanted / distance);
  }

  const x = new THREE.Vector3();
  const target = new THREE.Vector3();
  function step(h, colliders) {
    const gravity = -config.gravity * h * h;
    for (const chain of chains) {
      const { count, rest, world, previous, segments } = chain;
      if (!chain.started) {
        for (let k = 0; k < count; k += 1) {
          v.fromArray(rest, k * 3).applyMatrix4(matrix);
          v.toArray(world, k * 3);
          v.toArray(previous, k * 3);
        }
        chain.started = true;
      }
      // The root rides the head.
      v.fromArray(rest, 0).applyMatrix4(matrix).toArray(world, 0);
      const keep = 1 - chain.damping;
      for (let k = 1; k < count; k += 1) {
        const i = k * 3;
        for (let axis = 0; axis < 3; axis += 1) {
          const now = world[i + axis];
          world[i + axis] = now + (now - previous[i + axis]) * keep + (axis === 1 ? gravity : 0);
          previous[i + axis] = now;
        }
      }
      for (let pass = 0; pass < config.passes; pass += 1) {
        for (let k = 1; k < count; k += 1) {
          const i = k * 3;
          x.fromArray(world, i);
          q.fromArray(world, i - 3);
          if (pass === 0) {
            // Bent back towards the cut: the rest link (turned with the head) from the node above.
            target.fromArray(rest, i).sub(v.fromArray(rest, i - 3)).transformDirection(matrix).multiplyScalar(segments[k] * scale).add(q);
            const bend = chain.stiffness * (1 - (1 - config.tipShare) * ((k - 1) / Math.max(1, count - 2)));
            x.lerp(target, bend);
          }
          // Held to the link's length.
          v.subVectors(x, q);
          const span = v.length() || 1e-6;
          x.copy(q).addScaledVector(v, (segments[k] * scale) / span);
          pushOutOfHead(x);
          if (neck.radius) pushOutOfCapsule(x, neck.a, neck.b, neck.radius);
          for (const collider of colliders) if (collider.a !== collider.b && collider.part !== 'leg') pushOutOfCapsule(x, collider.a, collider.b, collider.radius);
          x.toArray(world, i);
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
      // Back on (a helmet knocked off): start again from the rest, not from where it was left.
      if (value) for (const chain of chains) chain.started = false;
    },
    /** One frame: `group` is the head's group (its world matrix places the rest), `colliders` the body's capsules. */
    update(dt, group, colliders = []) {
      // (The body's capsules kept even when paused: a bench steps the hair by hand, tools/photofaces/harness.js.)
      this.colliders = colliders;
      if (!enabled || dt <= 0) return;
      group.updateMatrixWorld(true);
      matrix.copy(group.matrixWorld);
      // The head moved further than it can in a frame (placed, respawned, a cut): the hair starts again from its rest.
      v.set(e[12], e[13], e[14]);
      if (v.distanceTo(lastHead) > config.jump) for (const chain of chains) chain.started = false;
      lastHead.copy(v);
      inverse.copy(matrix).invert();
      scale = Math.hypot(e[0], e[1], e[2]);
      // The neck: from between the shoulders up to the head collider's centre.
      const headCollider = colliders.find((collider) => collider.a === collider.b);
      const shoulders = colliders.find((collider) => collider.part === 'shoulders');
      if (headCollider && shoulders) {
        neck.a.copy(shoulders.a).add(shoulders.b).multiplyScalar(0.5);
        neck.b.copy(headCollider.a);
        neck.radius = headCollider.radius * config.neck;
      }
      const steps = config.substeps;
      const h = Math.min(dt, config.maxStep) / steps;
      for (let s = 0; s < steps; s += 1) step(h, colliders);
      // Each node's swing, in the head's space (its world place brought back, less its rest), eased towards its neighbours'.
      for (const chain of chains) {
        for (let k = 0; k < chain.count; k += 1) {
          v.fromArray(chain.world, k * 3).applyMatrix4(inverse).sub(w.fromArray(chain.rest, k * 3));
          v.toArray(chain.raw, k * 3);
        }
      }
      const share = config.neighbour;
      for (const chain of chains) {
        const { raw, offsets } = chain;
        if (!chain.ring || ring.length < 2) {
          offsets.set(raw);
          continue;
        }
        const { left, right } = chain;
        for (let i = 0; i < raw.length; i += 1) offsets[i] = raw[i] * (1 - 2 * share) + share * ((left.raw[i] ?? 0) + (right.raw[i] ?? 0));
      }
      for (const { mesh, rest, binding } of entries) {
        const position = mesh.geometry.attributes.position;
        const array = position.array;
        for (let vertex = 0, i = 0; i < rest.length; vertex += 1, i += 3) {
          const down = binding[vertex * 4 + 3];
          if (down <= 0) continue;
          let dx = 0;
          let dy = 0;
          let dz = 0;
          const share = binding[vertex * 4 + 2];
          for (let pick = 0; pick < 2; pick += 1) {
            const weight = pick ? share : 1 - share;
            if (weight <= 0) continue;
            const chain = chains[binding[vertex * 4 + pick]];
            const last = chain.count - 1;
            const along = Math.min(last, (down / (chain.length || 1)) * last);
            const k = Math.min(last - 1, Math.floor(along));
            const f = along - k;
            const o = chain.offsets;
            dx += weight * (o[k * 3] + (o[k * 3 + 3] - o[k * 3]) * f);
            dy += weight * (o[k * 3 + 1] + (o[k * 3 + 4] - o[k * 3 + 1]) * f);
            dz += weight * (o[k * 3 + 2] + (o[k * 3 + 5] - o[k * 3 + 2]) * f);
          }
          array[i] = rest[i] + dx;
          array[i + 1] = rest[i + 1] + dy;
          array[i + 2] = rest[i + 2] + dz;
        }
        position.needsUpdate = true;
      }
    },
    /** Throw the hanging hair: `direction` (world), `speed` (m/s at the tips). */
    kick(direction, speed) {
      for (const chain of chains) {
        if (!chain.started) continue;
        for (let k = 1; k < chain.count; k += 1) {
          const push = -speed * (k / (chain.count - 1)) * (1 / 60);
          for (let axis = 0; axis < 3; axis += 1) chain.previous[k * 3 + axis] += direction.getComponent(axis) * push;
        }
      }
    },
  };
}
