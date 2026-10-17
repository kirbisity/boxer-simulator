// Blood in standing water: a drop that falls into a puddle or a pond does not
// lie on it as a stain; it sinks and spreads, a reddish-brown cloud that
// widens like diffusion and pales as it does, until a small puddle is tinted
// all over and a pond shows a fading cloud where the drops went in.
//
// Two halves. Where the water is: each ground style's built group carries
// userData.bloodDyeWater, a list of (x, z) -> { wet 0..1, reach m } (reach:
// how far a cloud in that water can spread), and only the visible groups of
// the place on show count. The clouds: a few (x, z, sigma, peak density),
// handed to every water shader through one shared uniform array; the shader
// sums a gaussian per cloud and tints the water by it.
//
// Pure JavaScript: no THREE here, so the tests can run it in node.

export const BLOOD_DYE = {
  maxClouds: 16,
  threshold: 0.35, // wetter than this is standing water: the drop dissolves
  startSigma: 0.04, // m: the cloud a drop makes as it sinks
  diffusion: 0.0045, // m²/s: sigma² grows by 2·D·t (about 0.6 m in 40 s)
  perDrop: 0.012, // peak density = perDrop · amount / sigma²
  mergeDistance: 0.12, // m: a drop this near a cloud (or within its sigma) joins it
};

/** The uniforms every water material shares: x, z, sigma, peak density per cloud, and how many. */
export const bloodDyeUniforms = {
  bloodDyeClouds: { value: new Float32Array(BLOOD_DYE.maxClouds * 4) },
  bloodDyeCount: { value: 0 },
};

/** GLSL: the uniforms and bloodDyeAt(xz) -> 0..1, how red the water is there. */
export const BLOOD_DYE_GLSL = `
uniform vec4 bloodDyeClouds[ ${BLOOD_DYE.maxClouds} ];
uniform float bloodDyeCount;
  const vec3 bloodDyeColour = vec3( 0.32, 0.03, 0.02 );
  const vec3 bloodDyeFilter = vec3( 1.0, 0.4, 0.33 );
float bloodDyeAt( vec2 p ) {
  float sum = 0.0;
  for ( int i = 0; i < ${BLOOD_DYE.maxClouds}; i ++ ) {
    if ( float( i ) >= bloodDyeCount ) break;
    vec4 cloud = bloodDyeClouds[ i ];
    vec2 d = p - cloud.xy;
    sum += cloud.w * exp( -dot( d, d ) / ( 2.0 * cloud.z * cloud.z ) );
  }
  return 1.0 - exp( -sum );
}
`;

/** Hand the shared uniforms to a shader in onBeforeCompile. */
export function bloodDyeShader(shader) {
  Object.assign(shader.uniforms, bloodDyeUniforms);
}

/** The visible water of the place on show at (x, z): the wettest, with its reach. */
export function bloodDyeWaterAt(view, x, z) {
  let best = { wet: 0, reach: 0 };
  const place = view.places?.[view.place];
  if (!place || place.visible === false) return best;
  for (const child of place.children ?? []) {
    if (!child.visible || !child.userData?.bloodDyeWater) continue;
    for (const water of child.userData.bloodDyeWater) {
      const found = water(x, z);
      if (found && found.wet > best.wet) best = found;
    }
  }
  return best;
}

/** A fresh, empty set of clouds for a view. */
export const bloodDyeCreate = () => ({ clouds: [], place: null });

export function bloodDyeClear(dye) {
  dye.clouds = [];
}

/** A cloud's spread and peak density at `now`. */
export function bloodDyeCloudAt(cloud, now) {
  const age = Math.max(0, now - cloud.born);
  const sigma = Math.min(cloud.reach, Math.sqrt(BLOOD_DYE.startSigma ** 2 + 2 * BLOOD_DYE.diffusion * age));
  return { sigma, density: (BLOOD_DYE.perDrop * cloud.amount) / (sigma * sigma) };
}

/** Pour cloud `from` into `into`: the middle by amount, the spread the blood already had, weighted by amount. */
function bloodDyeJoin(into, from, now) {
  const total = into.amount + from.amount;
  const variance = (into.amount * bloodDyeCloudAt(into, now).sigma ** 2 + from.amount * bloodDyeCloudAt(from, now).sigma ** 2) / total;
  into.x = (into.x * into.amount + from.x * from.amount) / total;
  into.z = (into.z * into.amount + from.z * from.amount) / total;
  into.amount = total;
  into.reach = Math.max(into.reach, from.reach);
  into.born = now - Math.max(0, variance - BLOOD_DYE.startSigma ** 2) / (2 * BLOOD_DYE.diffusion);
}

const bloodDyeTouch = (a, b, now) => Math.hypot(a.x - b.x, a.z - b.z) < Math.max(BLOOD_DYE.mergeDistance, bloodDyeCloudAt(a, now).sigma, bloodDyeCloudAt(b, now).sigma);

/**
 * Blood (`amount`, about 1 a drop) goes into the water at (x, z) at `now`:
 * it joins a cloud it falls in or starts one (with every cloud in use it
 * joins the nearest); clouds that have run into each other become one.
 */
export function bloodDyeAdd(dye, x, z, amount, reach, now) {
  const fresh = { x, z, amount, reach: Math.max(BLOOD_DYE.startSigma, reach), born: now };
  let nearest = null;
  let nearestDistance = Infinity;
  for (const cloud of dye.clouds) {
    const distance = Math.hypot(cloud.x - x, cloud.z - z);
    if (distance < nearestDistance) {
      nearest = cloud;
      nearestDistance = distance;
    }
  }
  if (!nearest || (!bloodDyeTouch(nearest, fresh, now) && dye.clouds.length < BLOOD_DYE.maxClouds)) {
    dye.clouds.push(fresh);
    return fresh;
  }
  bloodDyeJoin(nearest, fresh, now);
  bloodDyeGather(dye, now);
  return nearest;
}

/** Clouds that have spread into each other become one. */
export function bloodDyeGather(dye, now) {
  for (let index = 0; index < dye.clouds.length; index += 1) {
    for (let other = index + 1; other < dye.clouds.length; other += 1) {
      if (!bloodDyeTouch(dye.clouds[index], dye.clouds[other], now)) continue;
      bloodDyeJoin(dye.clouds[index], dye.clouds[other], now);
      dye.clouds.splice(other, 1);
      other = index;
    }
  }
}

/**
 * A drop of blood (`amount`) lands at (x, z): in standing water it joins
 * the clouds and the answer is true (no stain); on dry ground, false.
 * The clouds belong to the place they were made in: a new place clears them.
 */
export function bloodDyeLand(view, dye, x, z, amount, now) {
  if (dye.place !== view.place) {
    bloodDyeClear(dye);
    dye.place = view.place;
  }
  const water = bloodDyeWaterAt(view, x, z);
  if (water.wet <= BLOOD_DYE.threshold) return false;
  bloodDyeAdd(dye, x, z, amount, water.reach, now);
  return true;
}

/** Write the clouds into the shared uniforms (every frame). */
export function bloodDyeUpload(dye, now, place) {
  if (dye && place !== undefined && dye.place !== place) {
    bloodDyeClear(dye);
    dye.place = place;
  }
  if (dye) bloodDyeGather(dye, now);
  const data = bloodDyeUniforms.bloodDyeClouds.value;
  const clouds = dye?.clouds ?? [];
  clouds.forEach((cloud, index) => {
    const { sigma, density } = bloodDyeCloudAt(cloud, now);
    data.set([cloud.x, cloud.z, sigma, density], index * 4);
  });
  bloodDyeUniforms.bloodDyeCount.value = clouds.length;
}
