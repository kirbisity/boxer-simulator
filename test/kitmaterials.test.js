// The castle's surfaces as made (a stand-in for THREE and the canvas: only what the kit touches): its textures are filtered for distance (mipmaps, trilinear,
// anisotropic) so that nothing shimmers as the camera moves, the floors' dressing wins a tie with the face under it, and the wear decals are
// off the stone and offset toward the camera.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KIT_FLOOR_OFFSET } from '../src/depthrange.js';

/** A 2D context that draws nothing and answers whatever is asked of it. */
function quietContext() {
  const handler = {
    get(target, name) {
      if (name === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (name === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (name === 'createLinearGradient' || name === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (name in target) return target[name];
      return () => {};
    },
    set(target, name, value) {
      target[name] = value;
      return true;
    },
  };
  return new Proxy({}, handler);
}

function stubThree() {
  class Texture {
    constructor(image) {
      Object.assign(this, { image, generateMipmaps: true, minFilter: 1008, magFilter: 1006, anisotropy: 1, repeat: { set() {} } });
    }
    dispose() {}
  }
  class Material {
    constructor(options = {}) {
      Object.assign(this, { polygonOffset: false, polygonOffsetFactor: 0, polygonOffsetUnits: 0, side: 0, transparent: false, depthWrite: true }, options);
    }
    dispose() {}
  }
  class Vector {
    constructor(...values) {
      this.values = values;
    }
    set() {
      return this;
    }
  }
  return {
    CanvasTexture: class extends Texture {},
    DataTexture: class extends Texture {},
    MeshStandardMaterial: Material,
    MeshBasicMaterial: Material,
    Vector2: Vector,
    Vector3: Vector,
    Vector4: Vector,
    Matrix4: class {},
    LinearMipmapLinearFilter: 1008,
    LinearFilter: 1006,
    RepeatWrapping: 1000,
    RGBAFormat: 1023,
    DoubleSide: 2,
    AdditiveBlending: 2,
    ShaderChunk: {},
  };
}

test('the castle materials: mipmapped, trilinear, anisotropic textures; floors offset; decals toward the camera', async () => {
  const kept = { THREE: globalThis.THREE, document: globalThis.document };
  globalThis.THREE = stubThree();
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => quietContext() }) };
  try {
    const { ktMaterials } = await import('../src/levelmode/kittex.js');
    const m = ktMaterials();
    for (const name of ['ashlar', 'ruin', 'rubble', 'rock', 'cobble', 'flags', 'grass', 'path', 'boards', 'wood', 'iron']) {
      const map = m[name].map;
      assert.ok(map, `${name} has a map`);
      assert.equal(map.generateMipmaps, true, `${name} makes mipmaps`);
      assert.equal(map.minFilter, THREE.LinearMipmapLinearFilter, `${name} filters trilinear in the distance`);
      assert.ok(map.anisotropy > 1, `${name} is anisotropic`);
    }
    for (const name of ['path', 'flags', 'cobble', 'boards']) {
      const material = m[name];
      assert.equal(material.polygonOffset, true, `${name} is depth-offset`);
      assert.equal(material.polygonOffsetFactor, KIT_FLOOR_OFFSET[name].factor);
      assert.equal(material.polygonOffsetUnits, KIT_FLOOR_OFFSET[name].units);
    }
    for (const name of ['ashlar', 'ruin', 'rubble', 'rock']) assert.equal(m[name].polygonOffset, false, `${name}, the walls, are not`);
    // The wear decals: toward the camera, not written to the depth buffer, drawn blended.
    assert.equal(m.wear.polygonOffset, true);
    assert.ok(m.wear.polygonOffsetFactor < 0 && m.wear.polygonOffsetUnits < 0);
    assert.equal(m.wear.depthWrite, false);
    assert.equal(m.wear.transparent, true);
    assert.ok(m.wear.map.generateMipmaps && m.wear.map.anisotropy > 1);
  } finally {
    for (const [name, value] of Object.entries(kept)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
});

test('the castle stone is coarse and dirty, not smooth: rough, no mirror in the dry, a relief in the shader, and only the stone', async () => {
  const kept = { THREE: globalThis.THREE, document: globalThis.document };
  globalThis.THREE = stubThree();
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => quietContext() }) };
  try {
    globalThis.THREE.ShaderChunk.lights_fragment_begin = '#include <lights_fragment_begin>';
    const { ktMaterials } = await import('../src/levelmode/kittex.js');
    const m = ktMaterials();
    // Every masonry and paving stone was glossy (roughness 0.5 to 0.76: the sky mirrored in the wet, a sheen from every torch); now they are rough.
    for (const name of ['ashlar', 'ruin', 'rubble', 'rock', 'cobble', 'flags']) {
      assert.ok(m[name].roughness >= 0.92, `${name} roughness ${m[name].roughness}`);
      assert.equal(m[name].metalness, 0, `${name} is no metal`);
    }
    // The iron stays metal, the cloth, wood and the rest are not the stone's business.
    assert.ok(m.iron.metalness > 0.4 && m.iron.roughness < 0.6, 'iron is untouched');
    assert.ok(m.wood.roughness >= 0.8 && m.cloth.roughness >= 0.9);
    assert.ok(m.water.roughness < 0.1, 'the water is still a mirror');
    // The shader: the stone's own program (relief, grime, the cut sky), the others' not.
    const compile = (material) => {
      const shader = { uniforms: {}, vertexShader: 'void main() {\n#include <begin_vertex>\n}', fragmentShader: 'void main() {\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <lights_fragment_maps>\n#include <fog_fragment>\n}' };
      material.onBeforeCompile(shader);
      return shader;
    };
    for (const name of ['ashlar', 'ruin', 'rubble', 'rock', 'cobble', 'flags']) {
      const shader = compile(m[name]);
      assert.ok(shader.fragmentShader.includes('kitBump(-vViewPosition'), `${name} has a relief`);
      assert.ok(shader.fragmentShader.includes('uKitGrit') && shader.fragmentShader.includes('kitSalt') && shader.fragmentShader.includes('kitGrime'), `${name} is dirty`);
      assert.ok(shader.fragmentShader.includes('roughnessFactor = mix(roughnessFactor, 0.6, 0.35 * kitShine)'), `${name}: wet is a little glossier, never a mirror`);
      assert.ok(shader.fragmentShader.includes('radiance *= mix(1.0, 0.1 + 0.9 * kitShine, kitStoneOn)'), `${name}: dry stone does not mirror the sky`);
      assert.ok(m[name].customProgramCacheKey().includes('S'), `${name} has its own program`);
      assert.ok(shader.uniforms.uKitStone.value.values[0] > 0 && shader.uniforms.uKitGrit.value, `${name} has its grit`);
    }
    for (const name of ['grass', 'path', 'boards', 'wood', 'iron']) {
      const shader = compile(m[name]);
      assert.ok(!shader.fragmentShader.includes('kitBump(') && !shader.uniforms.uKitGrit, `${name} is not stone`);
      assert.ok(!m[name].customProgramCacheKey().includes('S'));
    }
  } finally {
    for (const [name, value] of Object.entries(kept)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
});

test('the grit map is the stone\'s coarseness: it tiles, is made the same each time, and has its relief, its salt and its grime', async () => {
  const { ktGritData } = await import('../src/levelmode/kitpaint.js');
  const size = 256;
  const a = ktGritData(size);
  const b = ktGritData(size);
  assert.deepEqual(a, b, 'deterministic');
  assert.equal(a.length, size * size * 4);
  const mean = [0, 0, 0, 0];
  const spread = [0, 0, 0, 0];
  for (let k = 0; k < a.length; k += 4) for (let c = 0; c < 4; c += 1) mean[c] += a[k + c] / (size * size);
  for (let k = 0; k < a.length; k += 4) for (let c = 0; c < 4; c += 1) spread[c] += (a[k + c] - mean[c]) ** 2 / (size * size);
  for (let c = 0; c < 4; c += 1) assert.ok(Math.sqrt(spread[c]) > 8, `channel ${c} varies (${Math.sqrt(spread[c]).toFixed(1)})`);
  // The salt is in patches, not everywhere.
  let salty = 0;
  for (let k = 0; k < a.length; k += 4) if (a[k + 2] > 90) salty += 1;
  assert.ok(salty / (size * size) > 0.01 && salty / (size * size) < 0.4, `salt covers ${(salty / (size * size)).toFixed(2)}`);
  // It tiles: the step across the seam is no bigger than the steps within the field (relief, the roughest channel).
  let inside = 0;
  let seam = 0;
  for (let y = 0; y < size; y += 1) {
    inside += Math.abs(a[(y * size + 100) * 4] - a[(y * size + 101) * 4]);
    seam += Math.abs(a[(y * size + size - 1) * 4] - a[(y * size) * 4]);
  }
  assert.ok(seam < inside * 1.5 + size, `seam ${seam} against ${inside} within`);
});

test('the quality tiers give the stone\'s relief a reach: the best furthest, the lowest none', async () => {
  const { QUALITY_TIERS } = await import('../src/levelmode/quality.js');
  assert.ok(QUALITY_TIERS.high.relief > QUALITY_TIERS.medium.relief && QUALITY_TIERS.medium.relief > QUALITY_TIERS.low.relief);
  assert.equal(QUALITY_TIERS.low.relief, 0);
});
