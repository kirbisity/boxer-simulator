// A fat body's flesh following its frame (the user's call, 2026-11-10: "like a water bag", not a rigid object): the belly, the
// breasts and the buttocks each a mass on a spring and damper of its own, driven by the acceleration of the bone it hangs from.
// It lags behind a move and settles after it: a run shows a steady bounce with each stride, a landing a heavy drop and a few
// slow wobbles, a sidestep a swing the other way. Only for a trunk fat layer of an overweight build and up, and not in a crowd.
//
// The mass is not moved as a block. Each point of the skin (and the cloth over it) carries a weight per mass, set once at build
// time from where it lies in the mass (loftbody.js: most at its free front and foot, nothing where it joins the ribs and the
// pelvis), so it swings from its root. Under its offset it also changes shape, keeping its volume: squashed along the offset and
// bulging across it, so a drop after a landing flattens and widens it before it rebounds. The weight hangs in the mesh already
// (basebody.js: the belly's foot sags over the groin at rest); the spring carries only what the frame's acceleration adds, so in
// the air, falling with the body, the belly floats up out of its sag and lands back into it.
//
// The offsets are added to the skin's soft shell (soft.js SoftShell `extra`), on the same points as a blow's dent: the two add up.

export const SLOSH = {
  // The trunk's fat layer (m, skin radius over muscle radius: body.js) over which the masses move: from an overweight build's
  // (the comparison progression's overweight man carries 3.2 cm, its overweight woman 4.1) to a very obese one's (7.3 cm).
  from: 0.03,
  to: 0.073,
  // Natural frequency (Hz) and damping ratio, from the overweight end to the very obese: an overweight belly is firm and settles
  // at once (4-5 Hz, a damping ratio about 0.3); a very large one is a heavy slow mass that sloshes for three or four wobbles
  // after a landing (2-2.5 Hz, 0.12-0.15). Measured soft-tissue wobbling masses: abdominal and gluteal fat 2-5 Hz, lightly damped
  // (Pain and Challis 2001, wobbling-mass models of the human body; the user's figures, 2026-11-10).
  hz: [4.5, 2.25],
  damping: [0.3, 0.135],
  // The most a mass swings (m): about 1 cm on an overweight belly, 5-6 cm on a very obese one at a jump's landing (the tissue
  // stretches no further: its offset is eased into this limit).
  swing: [0.01, 0.055],
  // The share of the frame's acceleration that swings a mass: the rest is borne by what holds the fat to the frame (the
  // abdominal wall under the belly, the skin's own tension, the breasts' ligaments). Set so a jump's landing (0.5 m, stopped in
  // 0.12 s) swings a very obese belly 5-6 cm and an overweight one about 1 cm, within `swing` but not pressed against it: the
  // swing is a free, damped slosh; `swing` (times `limitMargin`) only eases a harder blow.
  drive: 0.4,
  limitMargin: 1.6,
  // The masses, each by the bones whose acceleration drives it (rig.js BONES): the belly between the chest and the pelvis, the
  // breasts on the chest, the buttocks on the pelvis.
  bones: { belly: ['pelvis', 'chest'], breast: ['chest'], buttock: ['pelvis'] },
  // How much the mass changes shape for its offset: its strain is the offset over its mean radius, times this (1: a water bag's
  // full give; volume kept, squashed along, bulging across by half each way).
  give: 1,
  // The most strain the give may reach (a small mass, a breast, at a landing's full swing would otherwise fold over itself):
  // subcutaneous fat stretches about a third before it stiffens sharply (Comley and Fleck 2010, adipose tissue in compression).
  mostStrain: 0.3,
  // A frame's acceleration is read from the bone's last three places; a step longer than this (s: a pause, a lost frame) starts
  // the reading again rather than taking a jump for a blow.
  longestStep: 0.1,
  // Below this (m and m/s, summed over the masses) the masses are at rest and the skin is left alone.
  rest: 1e-4,
};

const sClamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
/** Each mass's bones (SLOSH.bones), by the mass's name. */
export const SLOSH_BONES = SLOSH.bones;

/** How a body's fat moves: null under an overweight layer; else { share (0 overweight, 1 very obese), omega (rad/s), zeta, swing (m) }. */
export function sloshFigures(fatLayer) {
  if (fatLayer < SLOSH.from) return null;
  const share = sClamp((fatLayer - SLOSH.from) / (SLOSH.to - SLOSH.from));
  const lerp = ([a, b]) => a + (b - a) * share;
  return { share, omega: 2 * Math.PI * lerp(SLOSH.hz), zeta: lerp(SLOSH.damping), swing: lerp(SLOSH.swing) };
}

/**
 * Each point's weight in each mass (`masses`: { name, centre, radii: [across, up, out], axes: [across, up, out] unit vectors,
 * hang: (local [across, up, out] in units of the radii) => how free the point is there, 0 at the root to 1 at the front and foot }),
 * from where it lies (bind positions): a smooth fall to nothing at the mass's edge, times how free it is. `fixed` points (a rigid
 * breastplate, an arm lying against the chest) carry none.
 */
export function sloshWeights(positions, masses, fixed = null, share = null) {
  const count = positions.length / 3;
  return masses.map((mass) => {
    const weights = new Float32Array(count);
    for (let vertex = 0; vertex < count; vertex += 1) {
      if (fixed?.[vertex]) continue;
      const rel = [0, 1, 2].map((axis) => positions[vertex * 3 + axis] - mass.centre[axis]);
      const local = mass.axes.map((a, index) => (rel[0] * a[0] + rel[1] * a[1] + rel[2] * a[2]) / mass.radii[index]);
      const q = local[0] ** 2 + local[1] ** 2 + local[2] ** 2;
      if (q >= 1) continue;
      // (`share`: how much of the point the trunk's bones carry, so the masses fade out smoothly towards an arm or a thigh.)
      weights[vertex] = (1 - q) ** 2 * mass.hang(local) * (share ? share[vertex] : 1);
    }
    // The freest point swings by the mass's whole offset: the weights scaled so the greatest is 1.
    const most = weights.reduce((top, value) => Math.max(top, value), 0);
    if (most > 0) for (let vertex = 0; vertex < count; vertex += 1) weights[vertex] /= most;
    return weights;
  });
}

/**
 * The masses' springs on one fighter's skin: `slosh` the built body's (loftbody.js: { figures, masses: [{ name, centre, radii,
 * bones, weights }] }), `shell` his soft shell (its `extra` takes the offsets, in the skin's bind space), `bindFrames` the bones'
 * bind frames. `update(dt, frames)` each drawn frame with the bones' frames.
 */
export class FatSlosh {
  constructor(slosh, shell, bindFrames, bones) {
    this.figures = slosh.figures;
    this.masses = slosh.masses.map((mass) => ({ ...mass, boneIndex: mass.bones.map((name) => bones.indexOf(name)), x: [0, 0, 0], v: [0, 0, 0], history: [] }));
    this.shell = shell;
    this.bindFrames = bindFrames;
    this.count = shell.offset.length;
    shell.extra = new Float32Array(this.count * 3);
    this.moving = false;
  }

  /** The bones' mean origin for a mass, and its frame's axes (the first bone's), from a set of frames. */
  static origin(mass, frames) {
    const point = [0, 0, 0];
    for (const index of mass.boneIndex) for (let axis = 0; axis < 3; axis += 1) point[axis] += frames[index].origin[axis] / mass.boneIndex.length;
    return point;
  }

  update(dt, frames) {
    if (!(dt > 0)) return;
    const { omega, zeta, swing } = this.figures;
    let energy = 0;
    for (const mass of this.masses) {
      // The frame's acceleration, from its last three places (world), into the bone's own axes.
      const history = mass.history;
      if (dt > SLOSH.longestStep) history.length = 0;
      history.push({ at: FatSlosh.origin(mass, frames), dt });
      if (history.length > 3) history.shift();
      const frame = frames[mass.boneIndex[0]];
      let local = [0, 0, 0];
      if (history.length === 3) {
        const [p0, p1, p2] = history;
        const accel = [0, 1, 2].map((axis) => ((p2.at[axis] - p1.at[axis]) / p2.dt - (p1.at[axis] - p0.at[axis]) / p1.dt) / ((p1.dt + p2.dt) / 2));
        local = [frame.x, frame.y, frame.z].map((a) => accel[0] * a[0] + accel[1] * a[1] + accel[2] * a[2]);
      }
      // The mass lags its frame: x'' = -omega² x - 2 zeta omega x' - a (semi-implicit Euler, split so omega dt stays small).
      const steps = Math.max(1, Math.ceil((omega * dt) / 0.3));
      const h = dt / steps;
      for (let step = 0; step < steps; step += 1) {
        for (let axis = 0; axis < 3; axis += 1) {
          mass.v[axis] += (-omega * omega * mass.x[axis] - 2 * zeta * omega * mass.v[axis] - SLOSH.drive * local[axis]) * h;
          mass.x[axis] += mass.v[axis] * h;
        }
      }
      energy += Math.hypot(...mass.x) + Math.hypot(...mass.v) * 0.05;
    }
    if (energy < SLOSH.rest && !this.moving) return;
    this.write(swing);
    this.moving = energy >= SLOSH.rest;
    this.shell.extraMoved = true;
  }

  /** The masses' offsets on the skin (bind space): each point by its weights, the mass squashed along its offset and bulging across. */
  write(swing) {
    const extra = this.shell.extra;
    extra.fill(0);
    const rest = this.shell.rest;
    for (const mass of this.masses) {
      // The offset in bind space (the first bone's bind axes), eased into the most the tissue swings.
      const bind = this.bindFrames[mass.boneIndex[0]];
      const raw = [0, 1, 2].map((axis) => mass.x[0] * bind.x[axis] + mass.x[1] * bind.y[axis] + mass.x[2] * bind.z[axis]);
      const length = Math.hypot(...raw);
      if (length < 1e-7) continue;
      // (A small mass swings less: no further than its own strain allows, a third of its size: a breast 3 cm, the belly the full swing.)
      const size = (mass.radii[0] + mass.radii[1] + mass.radii[2]) / 3;
      // (And no further than the mass's own `limit` where it has one: a breast or buttock by how far it stands out, loftbody.js.)
      const limit = Math.min(swing * SLOSH.limitMargin, size * SLOSH.mostStrain, mass.limit ?? Infinity);
      if (!(limit > 0)) continue;
      const eased = limit * Math.tanh(length / limit);
      const offset = raw.map((value) => (value * eased) / length);
      const e = raw.map((value) => value / length);
      const strain = Math.min(SLOSH.mostStrain, (SLOSH.give * eased) / size);
      const weights = mass.weights;
      for (let vertex = 0; vertex < this.count; vertex += 1) {
        const w = weights[vertex];
        if (!w) continue;
        const r = [0, 1, 2].map((axis) => rest[vertex * 3 + axis] - mass.centre[axis]);
        const along = r[0] * e[0] + r[1] * e[1] + r[2] * e[2];
        for (let axis = 0; axis < 3; axis += 1) {
          const across = r[axis] - along * e[axis];
          extra[vertex * 3 + axis] += w * (offset[axis] + strain * (-along * e[axis] + 0.5 * across));
        }
      }
    }
  }
}
