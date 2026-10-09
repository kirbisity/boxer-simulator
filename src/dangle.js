// Things that hang and swing: locks of hair, a hood, drawstrings. Each is a
// pendulum hung from a point on a moving body part: its tip is a particle in
// the world, pulled by gravity, by a spring back towards where it rests on
// the part (cloth and hair have some stiffness), damped, and held at its
// length from the pivot. When the head snaps round, the locks are left
// behind and catch up; when it stops, they swing past and settle.

export const DANGLE = {
  gravity: 9.81,
  substeps: 3,
  maxStep: 1 / 30,
};

const tmp = new THREE.Vector3();
const down = new THREE.Vector3(0, -1, 0);
const axis = new THREE.Vector3();
const closest = new THREE.Vector3();

/**
 * Move a point out to the surface of a capsule if it is inside. With
 * `outward` (a world direction: the side the point hangs on), a point that
 * has got behind the capsule as seen from that side (in its shadow, up to a
 * few radii deep) comes out in front of it, not through it: a skirt caught
 * by a thigh swinging forward lies over the thigh, not between the legs.
 */
function pushOutOfCapsule(point, { a, b, radius }, outward = null) {
  axis.subVectors(b, a);
  const span = axis.lengthSq() || 1e-9;
  const t = Math.max(0, Math.min(1, closest.subVectors(point, a).dot(axis) / span));
  closest.copy(a).addScaledVector(axis, t);
  const offset = point.clone().sub(closest);
  if (outward) {
    const along = offset.dot(outward);
    const lateral = offset.clone().addScaledVector(outward, -along);
    const across = lateral.length();
    if (along < 0 && along > -3 * radius && across < radius) {
      point.copy(closest).add(lateral).addScaledVector(outward, Math.sqrt(radius * radius - across * across));
      return;
    }
  }
  const distance = offset.length();
  if (distance >= radius || distance < 1e-6) return;
  point.copy(closest).addScaledVector(offset, radius / distance);
}

/** Closest points between segments p1–q1 and p2–q2: their parameters along each. */
function closestOnSegments(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1);
  const d2 = q2.clone().sub(p2);
  const r = p1.clone().sub(p2);
  const a = d1.lengthSq() || 1e-9;
  const e = d2.lengthSq() || 1e-9;
  const f = d2.dot(r);
  const c = d1.dot(r);
  const b = d1.dot(d2);
  const denominator = a * e - b * b;
  let s = denominator > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / denominator)) : 0;
  let t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    s = Math.max(0, Math.min(1, -c / a));
  } else if (t > 1) {
    t = 1;
    s = Math.max(0, Math.min(1, (b - c) / a));
  }
  return { s, t, onFirst: p1.clone().addScaledVector(d1, s), onSecond: p2.clone().addScaledVector(d2, t) };
}

/**
 * A link of cloth (pivot to tip) may not pass through a capsule either, only
 * hang round it: a thigh raised into a skirt carries the cloth up and out on
 * `outward`'s side instead of coming through it. The tip is swung out until
 * the link clears.
 */
function swingLinkClear(pivot, tip, { a, b, radius }, outward) {
  const { s, onFirst, onSecond } = closestOnSegments(pivot, tip, a, b);
  if (s < 0.05) return;
  const offset = onFirst.clone().sub(onSecond);
  if (offset.dot(outward) < 0) offset.addScaledVector(outward, -2 * offset.dot(outward));
  const distance = offset.length();
  if (distance >= radius) return;
  const direction = distance > 1e-6 ? offset.divideScalar(distance) : outward.clone();
  // Moving the tip by x moves the link's nearest point by s·x.
  tip.addScaledVector(direction, Math.min(radius * 2, (radius - distance) / s));
}

export class Dangle {
  /**
   * @param anchor an Object3D the pivot rides on (its matrix is kept current)
   * @param pivot the hanging point, in the anchor's own coordinates
   * @param rest the direction it hangs at rest, in the anchor's coordinates
   * @param length pivot to tip, in the anchor's own units (a scaled head scales its hair)
   * @param sag how far it droops from rest under its own weight, as a share
   *   of its length: stiff gelled hair little, a loose hood a lot
   * @param damping share of critical damping: low swings on, high settles
   */
  constructor(anchor, pivot, rest, length, { sag = 0.35, damping = 0.25, collides = null, outward = null } = {}) {
    this.anchor = anchor;
    // The side it hangs on, in the anchor's coordinates (cloth round a body: out from it), or null.
    this.outward = outward ? new THREE.Vector3(...outward).normalize() : null;
    // Which colliders it rests on (their `part`: 'trunk', 'shoulders', 'arm', 'leg'); null, all of them.
    // A cloak is held off the trunk and legs but not flung by an arm swinging inside it.
    this.collides = collides;
    this.length = length;
    this.sag = sag;
    this.dampingShare = damping;
    this.rest = new THREE.Vector3(...rest).normalize();
    this.group = new THREE.Group();
    this.group.position.set(...pivot);
    anchor.add(this.group);
    this.tip = null;
    this.velocity = new THREE.Vector3();
  }

  /** The pivot and the resting tip in the world, from the anchor as it is now. */
  placeInWorld() {
    this.anchor.updateWorldMatrix(true, false);
    const pivot = this.group.position.clone().applyMatrix4(this.anchor.matrixWorld);
    const rotation = new THREE.Matrix3().setFromMatrix4(this.anchor.matrixWorld);
    const restWorld = this.rest.clone().applyMatrix3(rotation).normalize();
    const length = this.length * this.anchor.matrixWorld.getMaxScaleOnAxis();
    return { pivot, length, restTip: pivot.clone().addScaledVector(restWorld, length) };
  }

  /**
   * @param colliders capsules the tip may not enter: { a, b, radius }, world
   *   Vector3s — the head and the trunk, so hair lies on the back and the
   *   shoulders instead of hanging through them
   */
  update(dt, colliders = []) {
    const { pivot, length, restTip } = this.placeInWorld();
    if (!this.tip) this.tip = restTip.clone();
    // Spring and damper from the sag: gravity alone would bend it sag × length.
    const stiffness = DANGLE.gravity / (this.sag * length);
    const damping = 2 * Math.sqrt(stiffness) * this.dampingShare;
    const outward = this.outward ? this.outward.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(this.anchor.matrixWorld)).normalize() : null;
    const steps = DANGLE.substeps;
    const h = Math.min(dt, DANGLE.maxStep) / steps;
    for (let step = 0; step < steps && h > 0; step += 1) {
      tmp.subVectors(restTip, this.tip).multiplyScalar(stiffness);
      tmp.y -= DANGLE.gravity;
      tmp.addScaledVector(this.velocity, -damping);
      this.velocity.addScaledVector(tmp, h);
      const before = this.tip.clone();
      this.tip.addScaledVector(this.velocity, h);
      // Held at its length from the pivot; its speed is what it actually moved.
      tmp.subVectors(this.tip, pivot);
      const distance = tmp.length() || 1e-6;
      this.tip.copy(pivot).addScaledVector(tmp, length / distance);
      for (const capsule of colliders) {
        if (this.collides && !this.collides.includes(capsule.part)) continue;
        pushOutOfCapsule(this.tip, capsule, outward);
        if (outward) swingLinkClear(pivot, this.tip, capsule, outward);
      }
      tmp.subVectors(this.tip, pivot);
      this.tip.copy(pivot).addScaledVector(tmp, length / (tmp.length() || 1e-6));
      if (h > 0) this.velocity.subVectors(this.tip, before).divideScalar(h);
    }
    this.aim(pivot);
  }

  /**
   * Point the hanging piece (built along −y from its pivot) at the tip. Called
   * again after something else has moved the tip (cloth held to its neighbours),
   * with the tip first put back at its length from the pivot.
   */
  aim(pivot = this.placeInWorld().pivot, length = null) {
    if (length !== null) {
      tmp.subVectors(this.tip, pivot);
      this.tip.copy(pivot).addScaledVector(tmp, length / (tmp.length() || 1e-6));
    }
    const world = tmp.subVectors(this.tip, pivot).normalize();
    const inverse = new THREE.Matrix4().copy(this.anchor.matrixWorld).invert();
    const local = world.applyMatrix3(new THREE.Matrix3().setFromMatrix4(inverse)).normalize();
    this.group.quaternion.setFromUnitVectors(down, local);
    this.group.updateMatrix();
  }
}
