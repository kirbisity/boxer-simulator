// No skeleton in the skin view: the body (V7, or the plain loft) draws its own bony landmarks, so the anatomical skeleton of bones.js
// is built only when the bone or muscle view first shows it (render.js ensureSkeleton). The skin view's hands and feet are not bones
// but pieces on the skin layer (wardrobe.js), and what hangs on `fighterView.skeleton` (a severed part, a broken joint) still works.
// (A stand-in for THREE, as the other tests of drawing code have: only what the skeleton and the layer switch touch, no GPU.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBody, PRESETS } from '../src/body.js';
import { buildLoftBody } from '../src/loftbody.js';
import { BONES, BONE } from '../src/rig.js';

class Vector {
  constructor(x = 0, y = 0, z = 0) {
    Object.assign(this, { x, y, z });
  }
  set(x, y, z) {
    Object.assign(this, { x, y, z });
    return this;
  }
}
class Node {
  constructor() {
    this.children = [];
    this.visible = true;
    this.userData = {};
    this.position = new Vector();
    this.scale = new Vector(1, 1, 1);
    this.rotation = new Vector();
    this.matrix = { fromArray: (array) => Object.assign(this, { matrixValues: array }).matrix };
  }
  add(...pieces) {
    for (const piece of pieces) {
      this.children.push(piece);
      piece.parent = this;
    }
    return this;
  }
  traverse(visit) {
    visit(this);
    for (const child of this.children) child.traverse(visit);
  }
}
class Mesh extends Node {
  constructor(geometry, material) {
    super();
    Object.assign(this, { geometry, material, isMesh: true });
  }
}
/** Every other THREE name (a geometry, a material, a curve, a texture) is a plain holder of its arguments. */
function stubThree() {
  const named = { Group: class extends Node {}, Mesh, SkinnedMesh: Mesh, Vector2: Vector, Vector3: Vector, DoubleSide: 2, BackSide: 1 };
  return new Proxy(named, {
    get: (target, name) => {
      if (name in target) return target[name];
      if (typeof name === 'string' && /^[A-Z]/.test(name)) {
        target[name] = class {
          constructor(...args) {
            this.args = args;
          }
          dispose() {}
        };
      } else target[name] = 1;
      return target[name];
    },
  });
}

// (Each test file runs in its own process: the stand-ins stay.)
globalThis.THREE = stubThree();
globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => ({}) }) }), querySelector: () => null };
const { buildSkeleton } = await import('../src/bones.js');
const render = await import('../src/render.js');

const meshesOf = (root) => {
  const found = [];
  root.traverse((object) => {
    if (object.isMesh) found.push(object);
  });
  return found;
};
const groups = () => BONES.map(() => new globalThis.THREE.Group());

test('buildSkeleton fills the groups it is given, one per rig bone, and makes its own when given none', () => {
  const body = buildBody(PRESETS.contender);
  const { bindFrames } = buildLoftBody(body, { lowDetail: true });
  const own = groups();
  const built = buildSkeleton(body, bindFrames, own);
  assert.equal(built, own, 'the same groups, filled');
  assert.equal(built.length, BONES.length);
  for (const name of ['pelvis', 'chest', 'head', 'lThigh', 'rUpperArm', 'lForearm', 'rShin', 'lFoot']) {
    assert.ok(meshesOf(built[BONE[name]]).length > 0, `${name} has its bones`);
  }
  assert.ok(built.every((group) => group.matrixAutoUpdate === false), 'each is moved by its rig bone');
  const fresh = buildSkeleton(body, bindFrames);
  assert.equal(fresh.length, BONES.length);
  assert.notEqual(fresh[0], own[0]);
  assert.ok(meshesOf(fresh[BONE.chest]).length > 10, 'ribs and spine on the chest');
});

/** A fighter's view as setLayer sees it: the layer groups, empty skeleton groups as the build leaves them, a body to build the bones from. */
function fakeView(inputs = PRESETS.contender, extra = {}) {
  const body = buildBody(inputs);
  const { bindFrames } = buildLoftBody(body, { lowDetail: true });
  const THREE = globalThis.THREE;
  const layers = Object.fromEntries(['skin', 'muscle', 'bone', 'physics'].map((name) => [name, new THREE.Group()]));
  return {
    fighter: { body, broken: new Set(), damageVersion: 0, damage: {} },
    layers, built: { bindFrames }, frames: bindFrames, skeleton: groups(), skeletonBuilt: false, muscle: {},
    skinMesh: new Mesh({}, { transparent: false, opacity: 1, depthWrite: true }), skinOutline: new THREE.Group(), steelMesh: null,
    head: { group: new THREE.Group() }, attachments: [{ object: new THREE.Group() }], machine: false,
    ...extra,
  };
}

test('the skin view builds no skeleton; the bone and muscle views build it once, on demand', () => {
  const view = fakeView();
  assert.ok(view.skeleton.every((group) => group.children.length === 0), 'empty groups at the build');
  render.setLayer(view, 'skin');
  assert.equal(view.skeletonBuilt, false);
  assert.equal(meshesOf(view.layers.bone).length, 0, 'no bone mesh in the scene in the skin view');
  assert.equal(view.layers.bone.visible, false);
  render.setLayer(view, 'physics');
  assert.equal(view.skeletonBuilt, false, 'the physics view does not need it either');
  assert.equal(view.layers.bone.visible, false);

  render.setLayer(view, 'bone');
  assert.equal(view.skeletonBuilt, true);
  assert.equal(view.layers.bone.children.length, BONES.length, 'a group per rig bone in the layer');
  assert.ok(meshesOf(view.layers.bone).length > 100, 'filled with the anatomy');
  assert.equal(view.layers.bone.visible, true);
  assert.equal(view.layers.skin.visible, true);
  const made = meshesOf(view.layers.bone);
  render.setLayer(view, 'skin');
  assert.equal(view.layers.bone.visible, false, 'back to the skin view: hidden, whatever was built');
  render.setLayer(view, 'muscle');
  assert.equal(view.layers.bone.visible, true, 'the muscle view shows the bones too');
  assert.equal(view.layers.skin.visible, false);
  assert.deepEqual(meshesOf(view.layers.bone), made, 'built once, not again');
});

test('a skeleton built late is posed where the rig is, keeps a severed part hidden and shows a broken joint red', () => {
  const view = fakeView(PRESETS.contender, { severedBones: new Set([BONE.lForearm]) });
  view.fighter.broken.add('rElbow');
  render.setLayer(view, 'bone');
  assert.ok(view.skeleton.every((group) => Array.isArray(group.matrixValues) || group.matrixValues?.length), 'posed at once');
  assert.equal(view.skeleton[BONE.lForearm].visible, false, 'the forearm cut off stays out');
  assert.equal(view.skeleton[BONE.lThigh].visible, true);
  const red = (bone) => meshesOf(view.skeleton[BONE[bone]]).filter((mesh) => !mesh.userData.outline).map((mesh) => mesh.material);
  assert.ok(red('rUpperArm').every((material) => material === view.brokenBone), 'the broken elbow\'s arm bone');
  assert.ok(red('rForearm').every((material) => material === view.brokenBone));
  assert.ok(red('lUpperArm').every((material) => material !== view.brokenBone), 'the sound arm keeps its colour');
});

test('a crowd man (baked) and a simple body get no skeleton of their own', () => {
  const crowd = fakeView(PRESETS.contender, { baked: true, particles: null });
  assert.doesNotThrow(() => render.setLayer(crowd, 'skin'));
  assert.equal(crowd.skeletonBuilt, false);
  assert.equal(meshesOf(crowd.skeleton[BONE.chest]).length, 0);
  const source = readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  assert.match(source, /skeleton: boneGroups,/, 'the crowd path still has its empty groups');
  assert.match(source, /function ensureCrowdLayers\(fighterView\) \{\n  if \(fighterView\.particles\) return;\n  for \(const piece of fighterView\.skeleton\) fighterView\.layers\.bone\.add\(piece\);/);
});

test('the skeleton is built only in ensureSkeleton, and nothing paints it as skin any more', () => {
  const source = readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  assert.equal(source.match(/buildSkeleton\(/g).length, 1, 'one call');
  const at = source.indexOf('buildSkeleton(');
  assert.ok(source.lastIndexOf('function ', at) === source.indexOf('function ensureSkeleton('), 'and it is in ensureSkeleton');
  assert.equal([...source.matchAll(/ensureSkeleton\(/g)].length, 2, 'its definition and its one call, in setLayer');
  assert.match(source, /if \(layer === 'muscle' \|\| layer === 'bone'\) ensureSkeleton\(fighterView\);/);
  for (const gone of ['paintSkeleton', 'coveredBones', 'SKIN_BONE_INSET', 'skinBone']) assert.ok(!source.includes(gone), `${gone} is gone`);
});

test('hands and feet are skin-layer pieces on their bones, not parts of the skeleton', () => {
  const source = readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  assert.match(source, /layers\.skin\.add\(hand\);\n\s+attachments\.push\(\{ object: hand, bone: BONE\[`\$\{side\}Forearm`\], at: P\[`\$\{side\}Hand`\] \}\);/);
  assert.match(source, /layers\.skin\.add\(shoe\);\n\s+attachments\.push\(\{ object: shoe, bone: BONE\[`\$\{side\}Foot`\], at: P\[`\$\{side\}Foot`\] \}\);/);
  // Worn things hang from the collar and hips groups on the skin layer, never from a skeleton group.
  assert.match(source, /layers\.skin\.add\(collar\);\n\s+attachments\.push\(\{ object: collar, bone: BONE\.chest, at: P\.neck \}\);/);
  assert.match(source, /layers\.skin\.add\(hips\);\n\s+attachments\.push\(\{ object: hips, bone: BONE\.pelvis, at: P\.pelvis \}\);/);
  const weaponview = readFileSync(new URL('../src/weaponview.js', import.meta.url), 'utf8');
  assert.match(weaponview, /for \(const bone of boneIndices\) fighterView\.skeleton\[bone\]\.visible = false;/, 'a part cut off hides its bones: the groups are always there');
});
