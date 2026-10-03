// A soft shell: a mesh whose vertices are damped springs about their rest
// places, so a blow dents the flesh and the dent rings out and springs back
// at the speed the tissue under it allows.

/* global THREE */

export const SOFT = {
  // Natural frequency of the flesh springs (rad/s): firm muscle rings fast,
  // fat slow and deep. Damping ratio low enough to see one wobble.
  omegaFirm: 34,
  omegaSoft: 15,
  damping: 0.22,
  dentPerImpulse: 0.0016, // m of dent per N·s on the softest flesh
  maxDent: 0.05,
  spread: 0.09, // m radius of a dent
};

/** Mesh whose vertices are damped springs about their rest positions. */
export class SoftShell {
  constructor(geometry, material, firmness) {
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    const positions = geometry.attributes.position;
    geometry.computeVertexNormals();
    this.rest = Float32Array.from(positions.array);
    this.normals = Float32Array.from(geometry.attributes.normal.array);
    this.offset = new Float32Array(positions.count);
    this.velocity = new Float32Array(positions.count);
    this.active = false;
    this.omega = SOFT.omegaSoft + (SOFT.omegaFirm - SOFT.omegaSoft) * firmness;
    this.depthScale = 1.6 - firmness;
  }

  /** Push the shell in around a world point by an impulse (N·s). */
  dent(worldPoint, impulse) {
    const local = this.mesh.worldToLocal(worldPoint.clone());
    const scale = this.mesh.scale;
    const depth = Math.min(SOFT.maxDent, impulse * SOFT.dentPerImpulse * this.depthScale);
    const rest = this.rest;
    for (let index = 0; index < this.offset.length; index += 1) {
      const dx = (rest[index * 3] - local.x) * scale.x;
      const dy = (rest[index * 3 + 1] - local.y) * scale.y;
      const dz = (rest[index * 3 + 2] - local.z) * scale.z;
      const distanceSquared = dx * dx + dy * dy + dz * dz;
      const falloff = Math.exp(-distanceSquared / (SOFT.spread * SOFT.spread));
      if (falloff < 0.02) continue;
      // An impulse sets the flesh moving inward; the spring does the rest.
      this.velocity[index] -= depth * this.omega * falloff;
    }
    this.active = true;
  }

  update(dt) {
    if (!this.active) return;
    const positions = this.mesh.geometry.attributes.position.array;
    const stiffness = this.omega * this.omega;
    const damping = 2 * SOFT.damping * this.omega;
    let energy = 0;
    for (let index = 0; index < this.offset.length; index += 1) {
      // Semi-implicit Euler is stable here: ω·dt ≤ 34 / 30 ≈ 1.1 < 2.
      this.velocity[index] += (-stiffness * this.offset[index] - damping * this.velocity[index]) * dt;
      this.offset[index] += this.velocity[index] * dt;
      energy += Math.abs(this.offset[index]) + Math.abs(this.velocity[index]) * 0.05;
      for (let axis = 0; axis < 3; axis += 1) {
        positions[index * 3 + axis] = this.rest[index * 3 + axis] + this.normals[index * 3 + axis] * this.offset[index];
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    if (energy < 1e-5 * this.offset.length) {
      this.offset.fill(0);
      this.velocity.fill(0);
      this.mesh.geometry.attributes.position.array.set(this.rest);
      this.mesh.geometry.attributes.position.needsUpdate = true;
      this.mesh.geometry.computeVertexNormals();
      this.active = false;
    }
  }
}
