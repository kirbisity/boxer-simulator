// The castle kit's standing water: the crypt's flooded way, the old drain's cistern, the cesspool's sludge (stage data: a section's `water` decor; levelmode/water.js
// says where it lies and what a man wading does to it). One flat mesh per body of water, in a standard material whose shader is given:
//   - a surface that moves: a few slow crossing swells (the slope of each, analytic) and the rings of the ripples alive now (`uKwRipples`: x, z, age, strength;
//     a ring spreading at WATER.speed, a crest with a trough behind it, fading as it spreads), as a normal: the torches' lights glint on it and the reflection wavers;
//   - a reflection of the room round it: a small cube map of the scene taken once from over the water when he first stands near it (a CubeCamera, 6 draws of
//     128 px, a few ms once), so the vault, the pillars and the flames lie in it; a tier without reflections (quality.js `waterReflect` 0) keeps the glints only;
//   - for the sludge, a scum that drifts (two reads of a value noise, no texture), rougher and paler where it lies.
// And the splashes: a pool of drops (one instanced mesh for the whole stage) thrown up by a running foot or a body dropping in, falling back under gravity.

import { P } from '../body.js';
import { ageRipples, addRipple, newRipples, rippleRing, stageWaters, WATER, waterSources } from './water.js';

/** How each kind of water looks. */
export const KWT_LOOKS = {
  // Black, still, clear water over flags: a mirror with a little murk in it.
  clear: { colour: 0x0a1012, roughness: 0.06, metalness: 0.0, reflect: 2.6, opacity: 0.9, scum: 0, scumColour: 0x404030, wave: 0.6 },
  // The drain's sewage: a brown-green sludge, a scum on it, a dull sheen.
  sludge: { colour: 0x24260e, roughness: 0.3, metalness: 0.0, reflect: 0.75, opacity: 1, scum: 0.75, scumColour: 0x4b4a24, wave: 0.35 },
};

const KWT_MAX = WATER.ripples;
const KWT_DROPS = 96;

/** The shader's ripple and swell code, shared by every water material: a value noise, the slope of the surface at a point. */
const KWT_GLSL = `
uniform float uKwTime;
uniform vec4 uKwRipples[${KWT_MAX}];
uniform float uKwCount;
uniform float uKwWave;
uniform float uKwScum;
uniform vec3 uKwScumColour;
varying vec3 vKwAt;
float kwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float kwNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(kwHash(i), kwHash(i + vec2(1.0, 0.0)), u.x), mix(kwHash(i + vec2(0.0, 1.0)), kwHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec2 kwSlope(vec2 p, out float crest) {
  float t = uKwTime;
  vec2 g = vec2(0.0);
  crest = 0.0;
  // Slow swells crossing: the slope of a sum of sines.
  g += vec2(0.8, 0.3) * cos(dot(p, vec2(1.6, 0.6)) + t * 0.9) * 0.022;
  g += vec2(-0.3, 0.9) * cos(dot(p, vec2(-0.5, 2.1)) + t * 1.3) * 0.016;
  g += vec2(0.6, -0.7) * cos(dot(p, vec2(3.1, -3.7)) + t * 2.1) * 0.008;
  g *= uKwWave;
  // The rings: a crest at radius c, a trough behind it, fading as they spread.
  for (int i = 0; i < ${KWT_MAX}; i++) {
    if (float(i) >= uKwCount) break;
    vec4 r = uKwRipples[i];
    vec2 d = p - r.xy;
    float dist = length(d) + 1e-4;
    float c = r.z * ${WATER.speed.toFixed(3)};
    float u = dist - c;
    float w = 0.16 + r.z * 0.1;
    float env = exp(-(u * u) / (w * w));
    float k = 14.0;
    float dh = r.w * (-2.0 * u / (w * w) * env * cos(k * u) - k * env * sin(k * u)) * 0.03;
    g += dh * d / dist;
    crest += r.w * env * max(0.0, cos(k * u));
  }
  return g;
}
`;

/** A water material of a look (KWT_LOOKS), its shader given the moving surface; `uniforms` are the stage's shared ones. */
function kwtMaterial(look, uniforms) {
  const material = new THREE.MeshStandardMaterial({
    color: look.colour, roughness: look.roughness, metalness: look.metalness, envMapIntensity: look.reflect,
    transparent: look.opacity < 1, opacity: look.opacity, depthWrite: true,
  });
  const own = { uKwScum: { value: look.scum }, uKwScumColour: { value: new THREE.Color(look.scumColour) }, uKwWave: { value: look.wave } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vKwAt;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKwAt = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${KWT_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  float kwScum = uKwScum * smoothstep(0.52, 0.78, kwNoise(vKwAt.xz * 0.55 + vec2(uKwTime * 0.021, uKwTime * 0.013)) * 0.65 + kwNoise(vKwAt.xz * 2.7 - uKwTime * 0.01) * 0.35);
  diffuseColor.rgb = mix(diffuseColor.rgb, uKwScumColour, kwScum);
  float kwCrest;
  vec2 kwG = kwSlope(vKwAt.xz, kwCrest) * (1.0 - kwScum * 0.7);
  // (The crest of a ring is a little paler: froth on the sludge, a lit edge on the black water.)
  diffuseColor.rgb += vec3(0.05, 0.05, 0.04) * min(1.0, kwCrest);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.9, kwScum);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  normal = normalize((viewMatrix * vec4(normalize(vec3(-kwG.x, 1.0, -kwG.y)), 0.0)).xyz);`);
  };
  material.customProgramCacheKey = () => `kitwater-${look.scum > 0 ? 'sludge' : 'clear'}`;
  return material;
}

/** The mesh of a body of water: a plane (a rectangle, or an ellipse of 48 sides) at its surface. */
function kwtMesh(water, material) {
  const [w, d] = water.size;
  const geometry = water.shape === 'ellipse' ? new THREE.CircleGeometry(0.5, 48) : new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(w, d, 1);
  mesh.position.set(water.at[0], water.at[1], water.at[2]);
  mesh.name = `water:${water.id}`;
  mesh.renderOrder = 1;
  mesh.userData.water = water;
  return mesh;
}

/**
 * The stage's water: its meshes (added to each section's detail by `addSection`), the ripples and the drops. `update(world, time, dt, states, q)` each frame: what
 * the men do to the water (water.js waterSources), the shader's uniforms, the reflections taken when wanted, the drops moved. Returns the controller.
 */
export function kwtCreate(stage) {
  const waters = stageWaters(stage);
  const uniforms = { uKwTime: { value: 0 }, uKwRipples: { value: Array.from({ length: KWT_MAX }, () => new THREE.Vector4()) }, uKwCount: { value: 0 } };
  const pool = newRipples(KWT_MAX);
  const memory = new Map();
  const sections = new Map();
  const group = new THREE.Group();
  group.name = 'water-drops';
  // The drops: one instanced mesh, lit like the stone (they catch the torches).
  const dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.028, 6, 4), new THREE.MeshLambertMaterial({ color: 0x8c9488 }), KWT_DROPS);
  dropMesh.frustumCulled = false;
  dropMesh.count = 0;
  group.add(dropMesh);
  const drops = [];
  const tmp = new THREE.Object3D();
  let seed = 77;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const ctl = { waters, pool, group, renderer: null, scene: null, sections, drops };

  /** Put a section's water meshes in its detail group (`waters`: its `water` decor). */
  ctl.addSection = (sectionId, list, holder) => {
    if (!list.length) return;
    const meshes = list.map((water) => {
      const material = kwtMaterial(KWT_LOOKS[water.murk] ?? KWT_LOOKS.clear, uniforms);
      const mesh = kwtMesh(water, material);
      // (The renderer and the scene are known once a water is drawn: the reflection is taken with them.)
      mesh.onBeforeRender = (renderer, scene) => {
        ctl.renderer = renderer;
        ctl.scene = scene;
      };
      holder.add(mesh);
      return mesh;
    });
    const xs = list.map((water) => water.at[0]);
    const zs = list.map((water) => water.at[2]);
    const centre = [(Math.min(...xs) + Math.max(...xs)) / 2, Math.max(...list.map((water) => water.at[1])) + 0.6, (Math.min(...zs) + Math.max(...zs)) / 2];
    sections.set(sectionId, { meshes, centre, target: null, shownFor: 0 });
  };

  /** Take the reflection of a section's water: a cube map from over it, the water itself hidden. */
  const capture = (entry) => {
    const { renderer, scene } = ctl;
    if (!renderer || !scene) return false;
    entry.target ??= new THREE.WebGLCubeRenderTarget(128, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const cube = new THREE.CubeCamera(0.2, 90, entry.target);
    cube.position.set(...entry.centre);
    scene.add(cube);
    for (const mesh of entry.meshes) mesh.visible = false;
    group.visible = false;
    cube.update(renderer, scene);
    group.visible = true;
    for (const mesh of entry.meshes) mesh.visible = true;
    scene.remove(cube);
    for (const mesh of entry.meshes) {
      mesh.material.envMap = entry.target.texture;
      mesh.material.needsUpdate = true;
    }
    entry.captured = true;
    return true;
  };

  /** Throw up `count` drops from a point. */
  const splash = (at, count, speed) => {
    for (let k = 0; k < count; k += 1) {
      if (drops.length >= KWT_DROPS) drops.shift();
      const angle = random() * Math.PI * 2;
      const out = speed * (0.25 + random() * 0.45);
      drops.push({ x: at[0] + Math.cos(angle) * 0.12, y: at[1] + 0.02, z: at[2] + Math.sin(angle) * 0.12, vx: Math.cos(angle) * out, vy: speed * (0.6 + random() * 0.7), vz: Math.sin(angle) * out, floor: at[1], size: 0.6 + random() * 0.9 });
    }
  };

  ctl.update = (world, time, dt, states, q) => {
    uniforms.uKwTime.value = time;
    // The men: their feet and hips, for the water they wade in.
    if (waters.length) {
      const men = [];
      for (const fighter of world.fighters) {
        if (fighter.dormant) continue;
        const x = fighter.x;
        const point = (p) => [x[p * 3], x[p * 3 + 1], x[p * 3 + 2]];
        men.push({ id: fighter.id, feet: [point(P.lFoot), point(P.rFoot)], hips: point(P.pelvis) });
      }
      const made = waterSources(waters, men, memory, time);
      for (const ripple of made.ripples) addRipple(pool, ripple);
      if ((q.waterDrops ?? 1) > 0) for (const s of made.splashes) splash(s.at, Math.ceil(s.count * (q.waterDrops ?? 1)), s.speed);
    }
    ageRipples(pool, time);
    const most = Math.min(KWT_MAX, q.ripples ?? KWT_MAX);
    const live = pool.list.slice(-most);
    live.forEach((ripple, k) => {
      const ring = rippleRing(ripple, time);
      uniforms.uKwRipples.value[k].set(ripple.x, ripple.z, time - ripple.born, ring ? ring.strength : 0);
    });
    uniforms.uKwCount.value = live.length;
    // The reflections: a section's water that has been in detail for a second, taken once.
    for (const [id, entry] of sections) {
      const shown = states.get(id) === 'detail';
      entry.shownFor = shown ? entry.shownFor + dt : 0;
      if (shown && !entry.captured && (q.waterReflect ?? 1) > 0 && entry.shownFor > 1.0) capture(entry);
      if (entry.captured && (q.waterReflect ?? 1) <= 0) {
        for (const mesh of entry.meshes) {
          mesh.material.envMap = null;
          mesh.material.needsUpdate = true;
        }
        entry.captured = false;
        entry.shownFor = -Infinity;
      }
    }
    // The drops: thrown, falling, gone at the water.
    let n = 0;
    for (let k = drops.length - 1; k >= 0; k -= 1) {
      const d = drops[k];
      d.vy -= 9.8 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      if (d.y < d.floor && d.vy < 0) drops.splice(k, 1);
    }
    for (const d of drops) {
      tmp.position.set(d.x, d.y, d.z);
      tmp.scale.set(d.size, d.size * 1.6, d.size);
      tmp.updateMatrix();
      dropMesh.setMatrixAt(n, tmp.matrix);
      n += 1;
    }
    dropMesh.count = n;
    dropMesh.instanceMatrix.needsUpdate = true;
  };

  /** A ring and drops made by hand (tests, pictures): at [x, y, z] of strength `amp`, `count` drops. */
  ctl.poke = (at, amp = 1, count = 0, time = uniforms.uKwTime.value) => {
    addRipple(pool, { x: at[0], z: at[2], born: time, amp, water: null });
    if (count) splash(at, count, 3);
  };

  ctl.dispose = () => {
    for (const entry of sections.values()) {
      entry.target?.dispose();
      for (const mesh of entry.meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
    dropMesh.geometry.dispose();
    dropMesh.material.dispose();
  };
  return ctl;
}
