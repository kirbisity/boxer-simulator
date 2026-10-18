import test from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/body.js';
import { BONE } from '../src/rig.js';
import { CROWD_VIEW, simplifyTemplate } from '../src/crowdview.js';
import { chooseDraw, pastLimit, protectedMen } from '../src/crowdlod.js';

/** A fighter with only the pelvis placed: all the choice of who is protected looks at. */
const man = (id, x, z = 0, y = 1) => {
  const at = new Float32Array(Object.keys(P).length * 3);
  at.set([x, y, z], P.pelvis * 3);
  return { id, x: at };
};

test('the player, his lock, his opponent and the man the camera follows are protected, wherever they are', () => {
  const men = [man(0, 0), man(1, 40), man(2, 80), man(3, -60), man(4, 200)];
  const safe = protectedMen({ player: men[0], lock: men[1], opponent: men[2], focus: men[3], fighters: men });
  assert.deepEqual([...safe].sort(), [0, 1, 2, 3]);
});

test('every man within the protect radius of the player is protected, and none beyond it', () => {
  const near = CROWD_VIEW.protectRadius - 0.2;
  const far = CROWD_VIEW.protectRadius + 0.2;
  const men = [man(0, 0), man(1, near), man(2, 0, -near), man(3, far), man(4, 0, far, 1)];
  const safe = protectedMen({ player: men[0], fighters: men });
  assert.deepEqual([...safe].sort(), [0, 1, 2]);
});

test('with no player (a watched battle) only the followed man is protected', () => {
  const men = [man(0, 0), man(1, 1), man(2, 2)];
  assert.deepEqual([...protectedMen({ fighters: men })], []);
  assert.deepEqual([...protectedMen({ focus: men[1], fighters: men })], [1]);
});

test('a man past a limit stays past it until he is a margin inside: no flicker on the line', () => {
  const [limit, margin] = [12, 1.5];
  assert.equal(pastLimit(11.9, false, limit, margin), false);
  assert.equal(pastLimit(12.1, false, limit, margin), true);
  // Drifting back across the line: still past until 1.5 m inside.
  assert.equal(pastLimit(11.9, true, limit, margin), true);
  assert.equal(pastLimit(10.6, true, limit, margin), true);
  assert.equal(pastLimit(10.4, true, limit, margin), false);
  // A man jittering about the line keeps one answer.
  let far = false;
  const answers = new Set();
  for (const distance of [11.8, 12.1, 11.9, 12.05, 11.7, 12.2, 11.95]) {
    far = pastLimit(distance, far, limit, margin);
    answers.add(far);
  }
  assert.equal(answers.size, 2);
  assert.equal(pastLimit(11.95, true, limit, margin), true);
});

const draw = () => ({ culled: false, far: false, shadow: true });
const seen = { distance: 5, fallen: false, safe: false, inView: true, inShadow: true };

test('near, in view and in the shadow box: drawn in full with his shadow', () => {
  assert.deepEqual(chooseDraw(draw(), seen), { culled: false, far: false, shadow: true });
});

test('beyond the lod distance the far body; beyond the shadow distance no shadow', () => {
  const far = chooseDraw(draw(), { ...seen, distance: CROWD_VIEW.lodDistance + 1 });
  assert.equal(far.far, true);
  assert.equal(far.shadow, true);
  const distant = chooseDraw(draw(), { ...seen, distance: CROWD_VIEW.shadowDistance + 1 });
  assert.equal(distant.shadow, false);
  assert.equal(chooseDraw(draw(), { ...seen, inShadow: false }).shadow, false);
});

test('off screen, he is culled; the protected are never culled, simplified or unshadowed', () => {
  assert.equal(chooseDraw(draw(), { ...seen, inView: false }).culled, true);
  const protectedMan = chooseDraw(draw(), { distance: 500, fallen: true, safe: true, inView: false, inShadow: false });
  assert.deepEqual(protectedMan, { culled: false, far: false, shadow: true });
});

test('a fallen man is drawn simply and unshadowed sooner than one standing', () => {
  const between = (CROWD_VIEW.fallenLodDistance + CROWD_VIEW.lodDistance) / 2;
  assert.equal(chooseDraw(draw(), { ...seen, distance: between }).far, false);
  assert.equal(chooseDraw(draw(), { ...seen, distance: between, fallen: true }).far, true);
  const gap = (CROWD_VIEW.fallenShadowDistance + CROWD_VIEW.shadowDistance) / 2;
  assert.equal(chooseDraw(draw(), { ...seen, distance: gap }).shadow, true);
  assert.equal(chooseDraw(draw(), { ...seen, distance: gap, fallen: true }).shadow, false);
});

test('a man walking out and in over the lod line changes body once each way', () => {
  const state = draw();
  const changes = [];
  let last = false;
  for (const distance of [10, 11, 11.9, 12.2, 11.5, 11.9, 12.3, 11.4, 10.8, 10.3, 9]) {
    chooseDraw(state, { ...seen, distance });
    if (state.far !== last) changes.push(state.far);
    last = state.far;
  }
  assert.deepEqual(changes, [true, false]);
});

/** A template of two bones' worth of vertices: a grid of points on a sheet seen from both sides, and a lone one. */
function sheetTemplate() {
  const position = [];
  const normal = [];
  const skin = [];
  const colors = [];
  const indices = [];
  for (const side of [1, -1]) {
    const base = position.length / 3;
    for (let row = 0; row <= 10; row += 1) {
      for (let column = 0; column <= 10; column += 1) {
        position.push(column * 0.01, row * 0.01, 0);
        normal.push(0, 0, side);
        skin.push(BONE.chest, 0, 0, 0);
        colors.push(0.5, 0.2, 0.2);
      }
    }
    for (let row = 0; row < 10; row += 1) {
      for (let column = 0; column < 10; column += 1) {
        const a = base + row * 11 + column;
        indices.push(a, a + 1, a + 12, a, a + 12, a + 11);
      }
    }
  }
  const count = position.length / 3;
  return {
    attributes: {
      position: { array: Float32Array.from(position) },
      normal: { array: Float32Array.from(normal) },
      skinIndex: { array: Uint16Array.from(skin) },
      skinWeight: { array: Float32Array.from({ length: count * 4 }, (_, slot) => (slot % 4 === 0 ? 1 : 0)) },
    },
    colors: Float32Array.from(colors),
    bodyIndex: Uint32Array.from(indices),
    steelIndex: new Uint32Array(0),
    bodyOutlineIndex: Uint32Array.from(indices),
    steelOutlineIndex: new Uint32Array(0),
    vertexSegment: new Array(count).fill(null),
  };
}

test('a far template has fewer vertices and triangles, none degenerate, on the same bones', () => {
  const template = sheetTemplate();
  const far = simplifyTemplate(template, { cell: 0.04, colorStep: 0.12, facings: 6 });
  assert.ok(far.vertices < template.attributes.position.array.length / 3);
  assert.ok(far.bodyIndex.length > 0 && far.bodyIndex.length < template.bodyIndex.length / 4);
  for (let corner = 0; corner < far.bodyIndex.length; corner += 3) {
    const [a, b, c] = [far.bodyIndex[corner], far.bodyIndex[corner + 1], far.bodyIndex[corner + 2]];
    assert.ok(a !== b && b !== c && a !== c);
    assert.ok(Math.max(a, b, c) < far.vertices);
  }
  for (let vertex = 0; vertex < far.vertices; vertex += 1) {
    assert.equal(far.skinIndex[vertex * 4], BONE.chest);
    const sum = [0, 1, 2, 3].reduce((all, slot) => all + far.skinWeight[vertex * 4 + slot], 0);
    assert.ok(Math.abs(sum - 1) < 1e-5);
  }
});

test('the two faces of a sheet stay apart in the far template, each facing as it did', () => {
  const far = simplifyTemplate(sheetTemplate(), { cell: 0.04, colorStep: 0.12, facings: 6 });
  const faces = new Set();
  for (let vertex = 0; vertex < far.vertices; vertex += 1) faces.add(Math.sign(far.normal[vertex * 3 + 2]));
  assert.deepEqual([...faces].sort(), [-1, 1]);
  // Merged into one (no facing split) their normals would cancel.
  const merged = simplifyTemplate(sheetTemplate(), { cell: 0.04, colorStep: 0.12, facings: 1 });
  assert.ok(merged.vertices < far.vertices);
});

// The view's pose, frame after frame (rig.js): the arrays-free fast path must answer as the vector one does.
test('coherentFrames keeps a bone within its turn and turns one past it, as the plain vector sum does', async () => {
  const { coherentFrames, RIG } = await import('../src/rig.js');
  const { vec } = await import('../src/pose.js');
  const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const random = seeded(7);
  const direction = () => vec.normalize([random() - 0.5, random() - 0.5, random() - 0.5]);
  const frameAbout = (y, x) => {
    const across = vec.normalize(vec.sub(x, vec.scale(y, vec.dot(x, y))));
    return { origin: [0, 0, 0], x: across, y, z: vec.cross(across, y) };
  };
  // The sum before the fast path was added, kept here to answer to.
  const swing = (v, a, b) => {
    const cos = Math.max(-1, Math.min(1, vec.dot(a, b)));
    const axisRaw = vec.cross(a, b);
    const sin = vec.length(axisRaw);
    const axis = vec.scale(axisRaw, 1 / sin);
    return vec.add(vec.add(vec.scale(v, cos), vec.scale(vec.cross(axis, v), sin)), vec.scale(axis, vec.dot(axis, v) * (1 - cos)));
  };
  const reference = (frame, before, maxTurn) => {
    const carried = vec.normalize(swing(before.x, before.y, frame.y));
    const angle = Math.atan2(vec.dot(vec.cross(carried, frame.x), frame.y), vec.dot(carried, frame.x));
    if (Math.abs(angle) <= maxTurn) return frame;
    const turn = Math.sign(angle) * maxTurn;
    const axis = frame.y;
    const x = vec.normalize(vec.add(vec.add(vec.scale(carried, Math.cos(turn)), vec.scale(vec.cross(axis, carried), Math.sin(turn))), vec.scale(axis, vec.dot(axis, carried) * (1 - Math.cos(turn)))));
    return { ...frame, x, z: vec.cross(x, frame.y) };
  };
  let turned = 0;
  for (let trial = 0; trial < 400; trial += 1) {
    const before = frameAbout(direction(), direction());
    // A new direction near the old, and a twist of any size about it.
    const y = vec.normalize(vec.add(before.y, vec.scale(direction(), 0.3)));
    const twist = (random() - 0.5) * 2 * Math.PI;
    const base = frameAbout(y, direction());
    const frame = { ...base, x: vec.add(vec.scale(base.x, Math.cos(twist)), vec.scale(base.z, Math.sin(twist))) };
    frame.z = vec.cross(frame.x, frame.y);
    const [drawn] = coherentFrames([frame], [before]);
    if (drawn !== frame) turned += 1;
    const expected = reference(frame, before, RIG.maxTurnPerFrame);
    assert.equal(drawn === frame, expected === frame);
    for (let axis = 0; axis < 3; axis += 1) {
      assert.ok(Math.abs(drawn.x[axis] - expected.x[axis]) < 1e-12);
      assert.ok(Math.abs(drawn.z[axis] - expected.z[axis]) < 1e-12);
    }
  }
  assert.ok(turned > 50 && turned < 350, `${turned} of 400 held back`);
  assert.equal(coherentFrames([{ origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }], null).length, 1);
  assert.ok(RIG.maxTurnPerFrame > 0);
});
