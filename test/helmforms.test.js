import test from 'node:test';
import assert from 'node:assert/strict';
import { formCuts, formFacing, formGrid, formPoint, formRegions, formTriangles, HELM_FORMS } from '../src/helmforms.js';

// The head's radius (m), as the game draws it: a helmet's measures in head radii times this are centimetres on the head.
const R_CM = 11.5;
// What each kind was drawn with before the remodel (the old default geometry's triangles, arenaview.js).
const BEFORE = { thraex: 4962, hoplomachus: 4536, murmillo: 4504, secutor: 5372, scissor: 2400 };

/** The lowest and highest points of a helmet's metal (its parts but the hair). */
function span(style) {
  let low = Infinity;
  let high = -Infinity;
  for (const part of Object.values(HELM_FORMS[style].parts)) {
    if (part.look === 'hair') continue;
    const { positions } = formGrid(part);
    for (let index = 1; index < positions.length; index += 3) {
      low = Math.min(low, positions[index]);
      high = Math.max(high, positions[index]);
    }
  }
  return { low, high };
}

test('the remodelled helmets are drawn with fewer triangles than before', () => {
  for (const [style, before] of Object.entries(BEFORE)) assert.ok(formTriangles(style) < before, `${style}: ${formTriangles(style)}`);
});

test('every part is symmetric about the middle of the face and lays its coordinates in a region of its sheet', () => {
  for (const [style, form] of Object.entries(HELM_FORMS)) {
    for (const [name, part] of Object.entries(form.parts)) {
      for (const [u, v] of [[0.3, 0.2], [0.7, 0.5], [0.9, 0.9]]) {
        const left = formPoint(part, u, v);
        const right = formPoint(part, -u, v);
        assert.ok(Math.abs(left[0] - right[0]) < 1e-9 && Math.abs(left[1] - right[1]) < 1e-9 && Math.abs(left[2] + right[2]) < 1e-9, `${style} ${name}`);
      }
      if (part.region) assert.ok(formRegions(style)[part.region], `${style} ${name}`);
      const [nu, nv] = formCuts(part);
      assert.equal(formGrid(part).indices.length, nu * nv * 6);
    }
  }
});

test('the helmets stand as tall as the surviving ones (about 40-46 cm from the visor\'s foot to the crest)', () => {
  for (const style of ['murmillo', 'thraex', 'hoplomachus']) {
    const { low, high } = span(style);
    const cm = (high - low) * R_CM;
    assert.ok(cm > 36 && cm < 50, `${style}: ${cm.toFixed(1)} cm`);
  }
});

test('the brims are turned up over the brow and fall to the nape; the murmillo\'s is the broadest', () => {
  const lip = (style, u) => formPoint(HELM_FORMS[style].parts.brim, u, 1);
  for (const style of ['murmillo', 'thraex', 'hoplomachus']) {
    assert.ok(lip(style, 0)[1] > lip(style, 0.5)[1] && lip(style, 0.5)[1] > lip(style, 1)[1], style);
    assert.ok(lip(style, 1)[1] < -0.8, `${style}: the back of the brim covers the nape`);
  }
  assert.ok(lip('murmillo', 0.5)[2] > lip('thraex', 0.5)[2]);
});

test('the secutor\'s eyeholes are small (about 3 cm) and its crest low; its shell closes over the whole head', () => {
  const { eyes, parts } = HELM_FORMS.secutor;
  assert.ok(eyes.r * 2 * R_CM < 3.5);
  const crestTop = Math.max(...parts.crest.stations.map((station) => station.top[1]));
  const shellTop = formPoint(parts.shell, 0, 1)[1];
  assert.ok((crestTop - shellTop) * R_CM < 5, 'a crest of a few centimetres');
  const eye = formFacing(parts.shell, eyes.y, eyes.z);
  assert.ok(eye.at[0] > 1.2 && eye.normal[0] > 0.8, 'the eyeholes look forward');
});
