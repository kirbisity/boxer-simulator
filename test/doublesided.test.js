// Armour and helmets are drawn from both sides (toon.js doubleSided): a thin shell seen from inside or behind (a camera under
// a brim, inside a pauldron, behind a shield) is never a hole. Every unit's headgear and shield is built here over a stand-in
// for three.js (only the scene graph and the materials are real: geometries, vectors and colours are inert), and each of its
// meshes' materials is checked; the body's armour (render.js skinParts) and the worn kit (attachments) are made double-sided
// where their materials are made, which the source is checked for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FrontSide = 0;
const BackSide = 1;
const DoubleSide = 2;

/** Anything: every property a function returning anything, every call anything; a number where one is wanted. */
function anything() {
  const target = function inert() {};
  const proxy = new Proxy(target, {
    get(_, key) {
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === Symbol.iterator) return function* empty() {};
      if (key === 'then') return undefined;
      if (key === 'length' || key === 'count' || key === 'x' || key === 'y' || key === 'z' || key === 'w') return 0;
      if (key === 'array') return new Float32Array(0);
      if (!(key in target)) target[key] = anything();
      return target[key];
    },
    set(_, key, value) {
      target[key] = value;
      return true;
    },
    apply: () => proxy,
    construct: () => anything(),
  });
  return proxy;
}

class Object3D {
  constructor() {
    this.children = [];
    this.parent = null;
    this.userData = {};
    this.position = anything();
    this.rotation = anything();
    this.scale = anything();
    this.quaternion = anything();
    this.matrix = anything();
    this.matrixWorld = anything();
    this.visible = true;
    // Any other property or method (an instanced mesh's setMatrixAt, a skinned mesh's skeleton...): inert.
    return new Proxy(this, { get: (target, key, receiver) => (key in target || typeof key === 'symbol' || /^is[A-Z]/.test(key) ? Reflect.get(target, key, receiver) : anything()) });
  }

  add(...objects) {
    for (const object of objects) {
      if (!object) continue;
      object.parent = this;
      this.children.push(object);
    }
    return this;
  }

  remove(object) {
    this.children = this.children.filter((child) => child !== object);
    return this;
  }

  traverse(visit) {
    visit(this);
    for (const child of [...this.children]) child.traverse(visit);
  }

  clone() {
    const copy = new this.constructor(this.geometry, this.material);
    copy.userData = { ...this.userData };
    for (const child of this.children) copy.add(child.clone());
    return copy;
  }

  updateMatrix() {}
  updateMatrixWorld() {}
  lookAt() {}
  applyMatrix4() { return this; }
  getWorldPosition(target) { return target ?? anything(); }
}

class Mesh extends Object3D {
  constructor(geometry = anything(), material = new Material()) {
    super();
    this.geometry = geometry;
    this.material = material;
    this.isMesh = true;
  }

  bind() {}
}

class Material {
  constructor(params = {}) {
    this.side = FrontSide;
    this.shadowSide = null;
    this.color = anything();
    this.userData = {};
    this.isMaterial = true;
    Object.assign(this, params);
    // (A colour given as a number or a string is a THREE.Color in three.js.)
    for (const key of ['color', 'emissive', 'specular']) if (this[key] !== undefined && typeof this[key] !== 'function') this[key] = anything();
  }

  clone() {
    const copy = new this.constructor();
    Object.assign(copy, this, { userData: { ...this.userData } });
    return copy;
  }

  setValues(params) { Object.assign(this, params); }
  dispose() {}
}

const material = (flag) => class extends Material {
  constructor(params) {
    super(params);
    this[flag] = true;
  }
};

const STAND_IN = {
  FrontSide, BackSide, DoubleSide,
  Object3D, Group: class extends Object3D {}, Scene: class extends Object3D {}, Bone: class extends Object3D {},
  Mesh, SkinnedMesh: class extends Mesh { constructor(g, m) { super(g, m); this.isSkinnedMesh = true; } },
  InstancedMesh: class extends Mesh {}, LineSegments: class extends Mesh {}, Line: class extends Mesh {}, Points: class extends Mesh {}, Sprite: class extends Mesh {},
  Material,
  MeshStandardMaterial: material('isMeshStandardMaterial'), MeshPhysicalMaterial: material('isMeshStandardMaterial'),
  MeshToonMaterial: material('isMeshToonMaterial'), MeshLambertMaterial: material('isMeshLambertMaterial'),
  MeshPhongMaterial: material('isMeshPhongMaterial'), MeshBasicMaterial: material('isMeshBasicMaterial'),
  MeshMatcapMaterial: material('isMeshMatcapMaterial'), ShaderMaterial: material('isShaderMaterial'),
  LineBasicMaterial: material('isLineBasicMaterial'), PointsMaterial: material('isPointsMaterial'), SpriteMaterial: material('isSpriteMaterial'),
};

/** The stand-in THREE: the classes above, anything else inert. */
const THREE_STAND_IN = new Proxy(STAND_IN, {
  get(target, key) {
    if (!(key in target)) target[key] = anything();
    return target[key];
  },
});

/** Every mesh under a root whose material is drawn one side only (outlines, the inverted hulls, apart). */
function oneSided(root) {
  const found = [];
  root.traverse((object) => {
    if (!object.isMesh || object.userData.outline) return;
    for (const piece of [].concat(object.material ?? [])) if (piece && piece.side === FrontSide) found.push(object.name || piece.constructor.name);
  });
  return found;
}

test('doubleSided draws a mesh\'s material from both sides, its shadow from the back as before, and leaves outlines alone', async () => {
  const kept = globalThis.THREE;
  globalThis.THREE = THREE_STAND_IN;
  try {
    const { doubleSided } = await import('../src/toon.js');
    const group = new STAND_IN.Group();
    const shell = new Mesh(anything(), new STAND_IN.MeshStandardMaterial());
    const outline = new Mesh(anything(), new STAND_IN.MeshBasicMaterial({ side: BackSide }));
    outline.userData.outline = true;
    shell.add(outline);
    group.add(shell);
    doubleSided(group);
    assert.equal(shell.material.side, DoubleSide);
    assert.equal(shell.material.shadowSide, BackSide);
    assert.equal(outline.material.side, BackSide);
    const alone = doubleSided(new STAND_IN.MeshToonMaterial());
    assert.equal(alone.side, DoubleSide);
  } finally {
    globalThis.THREE = kept;
  }
});

test('every unit\'s helmet and headgear, in every design, and every shield is drawn from both sides', async () => {
  const kept = globalThis.THREE;
  const keptDocument = globalThis.document;
  globalThis.THREE = THREE_STAND_IN;
  // (A painted shield draws on a canvas.)
  globalThis.document = { createElement: () => anything() };
  try {
    const { OUTFITS } = await import('../src/outfits.js');
    const { buildHeadgear } = await import('../src/wardrobe.js');
    const { buildShieldMesh } = await import('../src/weaponview.js');
    const { SHIELDS } = await import('../src/weapons.js');
    const body = { lengths: { headRadius: 0.1 }, inputs: {} };
    const steel = new STAND_IN.MeshStandardMaterial({ metalness: 0.9, roughness: 0.26 });
    let heads = 0;
    for (const [kind, outfit] of Object.entries(OUTFITS)) {
      for (const design of outfit.designs) {
        if (!design.head) continue;
        for (const lowDetail of [false, true]) {
          const made = buildHeadgear(body, design.head, {}, steel, '#ff0000', { lowDetail });
          if (!made) continue;
          heads += 1;
          assert.deepEqual(oneSided(made.group), [], `${kind} '${design.label}' (${design.head.kind}${lowDetail ? ', in a crowd' : ''})`);
        }
      }
    }
    assert.ok(heads > 100, `${heads} helmets and hats built`);
    for (const [name, spec] of Object.entries(SHIELDS)) assert.deepEqual(oneSided(buildShieldMesh(spec, null, '#884422')), [], `shield ${name}`);
  } finally {
    globalThis.THREE = kept;
    if (keptDocument === undefined) delete globalThis.document;
    else globalThis.document = keptDocument;
  }
});

test('the body\'s armour and the worn kit are made double-sided where their materials are made', () => {
  const render = readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  // The body's steel, its detail-mapped armour, its cloth and the rest worn over the skin (skinParts).
  assert.match(render, /const steel = doubleSided\(steelMaterial\(/);
  assert.match(render, /doubleSided\(armourDetailMaterial\(/);
  assert.match(render, /material: doubleSided\(clothMaterial\(\)\)/);
  assert.match(render, /doubleSided\(mesh\.material\);\s*mesh\.userData\.detailMaps = 'worn'/);
  // The helmet, its knocked-off copy, and everything attached to the bones (hands, feet, chest, hips, machines' shells).
  assert.match(render, /doubleSided\(headgear\?\.group\)/);
  assert.match(render, /doubleSided\(prop\.loose\)/);
  assert.match(render, /for \(const \{ object \} of attachments\) doubleSided\(object\)/);
  // Barding.
  const horse = readFileSync(new URL('../src/horseview.js', import.meta.url), 'utf8');
  assert.match(horse, /metal: doubleSided\(steelMaterial\(/);
});
