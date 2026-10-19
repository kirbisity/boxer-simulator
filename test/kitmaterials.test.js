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

test('the castle materials: mipmapped, trilinear, anisotropic textures; floors offset; decals off the stone', async () => {
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
