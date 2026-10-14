// Things that hang from a horse and swing: the tail's hair, a trapper's
// columns, a stirrup on its leather. Each is a short chain of particles in
// the world (Verlet): the first pinned to a point that moves with the horse,
// the rest pulled by gravity, damped by the air, kept at their link lengths,
// and drawn gently back towards where the hair lies at rest (a stiffness that
// falls along the chain). Plain arrays, no three.js.

export const HORSE_HAIR = {
  gravity: 9.8,
  // The longest step taken at once (s) and the most steps in a frame.
  step: 1 / 90,
  most: 4,
};

/** A chain of `count` particles, `segment` m apart. */
export function hairChain(count, segment) {
  return { count, segment, p: new Float64Array(count * 3), q: new Float64Array(count * 3), ready: false };
}

/**
 * Advance a chain by `dt`. `rest` holds the count×3 world positions it would
 * lie at with no motion (the first the pin); `options`: `stiff` (1/s² per
 * particle, a pull towards its rest place), `drag` (1/s), `gravity` (share of
 * g), `collide(point)` pushing a particle out of what it may not enter,
 * `link` (per-particle link length, default `segment`).
 */
export function stepHair(chain, dt, rest, { stiff = [], drag = 3, gravity = 1, collide = null, link = null } = {}) {
  const { count, p, q } = chain;
  if (!chain.ready) {
    p.set(rest);
    q.set(rest);
    chain.ready = true;
    return;
  }
  // A chain left far behind (the horse jumped, the view was hidden) starts again.
  const dx = p[0] - rest[0];
  const dy = p[1] - rest[1];
  const dz = p[2] - rest[2];
  if (dx * dx + dy * dy + dz * dz > (chain.segment * count * 2) ** 2) {
    p.set(rest);
    q.set(rest);
    return;
  }
  const steps = Math.min(HORSE_HAIR.most, Math.max(1, Math.ceil(dt / HORSE_HAIR.step)));
  const h = Math.min(dt, HORSE_HAIR.step * HORSE_HAIR.most) / steps;
  if (dt <= 0) return;
  const damp = Math.exp(-drag * h);
  for (let step = 0; step < steps; step += 1) {
    // The pin follows the point it hangs from, through this step.
    const pin = (step + 1) / steps;
    for (let axis = 0; axis < 3; axis += 1) {
      q[axis] = p[axis];
      p[axis] = p[axis] + (rest[axis] - p[axis]) * pin;
    }
    for (let k = 1; k < count; k += 1) {
      const at = k * 3;
      const pull = (stiff[k] ?? 0) * h * h;
      for (let axis = 0; axis < 3; axis += 1) {
        const velocity = (p[at + axis] - q[at + axis]) * damp;
        q[at + axis] = p[at + axis];
        p[at + axis] += velocity + (rest[at + axis] - p[at + axis]) * pull;
      }
      p[at + 1] -= HORSE_HAIR.gravity * gravity * h * h;
    }
    for (let k = 1; k < count; k += 1) {
      const at = k * 3;
      const from = at - 3;
      let ax = p[at] - p[from];
      let ay = p[at + 1] - p[from + 1];
      let az = p[at + 2] - p[from + 2];
      const length = Math.sqrt(ax * ax + ay * ay + az * az) || 1e-9;
      const wanted = link ? link[k] : chain.segment;
      const scale = wanted / length;
      ax *= scale;
      ay *= scale;
      az *= scale;
      p[at] = p[from] + ax;
      p[at + 1] = p[from + 1] + ay;
      p[at + 2] = p[from + 2] + az;
      if (collide) {
        collide(p, at);
        // Back to its length from the link above, after being pushed.
        ax = p[at] - p[from];
        ay = p[at + 1] - p[from + 1];
        az = p[at + 2] - p[from + 2];
        const again = wanted / (Math.sqrt(ax * ax + ay * ay + az * az) || 1e-9);
        p[at] = p[from] + ax * again;
        p[at + 1] = p[from + 1] + ay * again;
        p[at + 2] = p[from + 2] + az * again;
      }
    }
  }
}
