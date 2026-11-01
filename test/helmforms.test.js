import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, PRESETS } from '../src/body.js';
import { HELM_MAP_DATA } from '../src/helmmaps-data.js';
import { formCuts, formFacing, formGrid, formPoint, formRegions, formTriangles, HELM_FORMS, HELM_HEAD, HELM_HEAD_BREADTH, headRadiusAt, KABUTO_FORM, MASK_FITS, maskOnFace } from '../src/helmforms.js';

// The head's radius (m), as the game draws it: a helmet's measures in head radii times this are centimetres on the head.
const R_CM = 11.5;
// What each kind was drawn with before the remodel (the old default geometry's triangles, arenaview.js).
const BEFORE = { thraex: 4962, hoplomachus: 4536, murmillo: 4504, secutor: 5372, scissor: 2400 };
// The remodel's first (ball-shaped) bowls' triangles: fitting them to the head adds none.
const BALL_BOWLS = { thraex: 3168, hoplomachus: 2560, murmillo: 3024, secutor: 2784, scissor: 1424 };
// The drawn head is HEAD_SCALE (render.js) times the body's head radius.
const HEAD_SCALE = 1.12;
const bowlOf = (style) => HELM_FORMS[style].parts.bowl ?? HELM_FORMS[style].parts.shell;

/** A loft's distance from the upright axis at `azimuth` (rad from the face) and height y, or null where it does not reach. */
function loftRadiusAt(part, azimuth, y) {
  const u = azimuth / (Math.PI * (part.span ?? 1));
  if (u > 1) return null;
  const steps = 240;
  let last = formPoint(part, u, 0);
  for (let step = 1; step <= steps; step += 1) {
    const point = formPoint(part, u, step / steps);
    if ((last[1] - y) * (point[1] - y) <= 0 && last[1] !== point[1]) {
      const t = (y - last[1]) / (point[1] - last[1]);
      return Math.hypot(last[0] + (point[0] - last[0]) * t, last[2] + (point[2] - last[2]) * t);
    }
    last = point;
  }
  return null;
}

/** The least room (head radii) between a loft and the head inside it over the head's heights from `from` up; the most round the cranium's sides. */
function room(part, from = -1.3) {
  let least = Infinity;
  let most = -Infinity;
  for (let y = from; y <= HELM_HEAD.crown - 0.05; y += 0.05) {
    for (let k = 0; k <= 32; k += 1) {
      const azimuth = (Math.PI * k) / 32;
      const outside = loftRadiusAt(part, azimuth, y);
      if (outside === null) continue;
      const gap = outside - headRadiusAt(azimuth, y);
      least = Math.min(least, gap);
      if (y >= 0 && y <= 0.8) most = Math.max(most, gap);
    }
  }
  return { least, most };
}

/** A loft's length front to back and breadth side to side over the cranium (y from 0 up). */
function cranial(part) {
  const { positions } = formGrid(part);
  let [front, back, side] = [-Infinity, Infinity, 0];
  for (let index = 0; index < positions.length; index += 3) {
    if (positions[index + 1] < 0) continue;
    front = Math.max(front, positions[index]);
    back = Math.min(back, positions[index]);
    side = Math.max(side, Math.abs(positions[index + 2]));
  }
  return { length: front - back, breadth: 2 * side };
}

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

test('the remodelled helmets are drawn with fewer triangles than before, and no more than the ball-shaped bowls had', () => {
  for (const [style, before] of Object.entries(BEFORE)) assert.ok(formTriangles(style) < before, `${style}: ${formTriangles(style)}`);
  for (const [style, before] of Object.entries(BALL_BOWLS)) assert.ok(formTriangles(style) <= before, `${style}: ${formTriangles(style)}`);
});

test('the head the helmets are fitted over is a skull\'s shape: longer than broad, the occiput full, the brow sloping back', () => {
  const at = (y) => HELM_HEAD.rows.find(([height]) => Math.abs(height - y) < 1e-6)[1];
  const widest = at(0.1);
  const length = widest[0] + widest[8];
  const index = (2 * HELM_HEAD_BREADTH) / length;
  assert.ok(index > 0.68 && index < 0.82, `cranial index ${index.toFixed(2)}`);
  assert.ok(at(0.5)[0] < at(0.5)[8], 'the brow slopes back further than the occiput');
  assert.ok(at(0.0)[8] >= at(0.6)[8] + 0.1, 'the occiput fullest low, at the ears');
});

test('every bowl follows the head: longer than broad as a skull is, not a ball', () => {
  for (const style of Object.keys(HELM_FORMS)) {
    const { length, breadth } = cranial(bowlOf(style));
    assert.ok(breadth / length < 0.86 && breadth / length > 0.7, `${style}: ${(breadth / length).toFixed(2)}`);
  }
  const kabuto = cranial(KABUTO_FORM.bowl);
  assert.ok(kabuto.breadth / kabuto.length < 0.86, `kabuto: ${(kabuto.breadth / kabuto.length).toFixed(2)}`);
  assert.ok(KABUTO_FORM.front + KABUTO_FORM.back > 2.4 * KABUTO_FORM.side, 'the hachi is an oval dome');
});

test('every bowl stands off the head by its lining (1 cm at least) and close round the cranium, on a small man and a big one', () => {
  const small = buildBody({ ...structuredClone(PRESETS.murmillo), heightCm: 152, frame: 'small' }).lengths.headRadius;
  const large = buildBody({ ...structuredClone(PRESETS.murmillo), heightCm: 200, frame: 'large' }).lengths.headRadius;
  assert.ok(large > small * 1.25);
  const parts = { ...Object.fromEntries(Object.keys(HELM_FORMS).map((style) => [style, bowlOf(style)])), kabuto: KABUTO_FORM.bowl };
  for (const [name, part] of Object.entries(parts)) {
    // A visored helmet's face is its visor's; its bowl covers the head from the brim up.
    const { least, most } = room(part, HELM_FORMS[name]?.parts.visor ? 0.35 : -1.3);
    for (const r of [small, large]) {
      const cm = (gap) => gap * r * HEAD_SCALE * 100;
      assert.ok(cm(least) >= 1.0, `${name}: ${cm(least).toFixed(2)} cm at the closest`);
      assert.ok(cm(most) <= 3.5, `${name}: ${cm(most).toFixed(2)} cm at the furthest round the cranium (floating)`);
    }
  }
  for (const style of ['murmillo', 'thraex', 'hoplomachus']) assert.ok(room(HELM_FORMS[style].parts.visor, -1.3).least > 0.1, `${style}'s visor clears the face`);
});

test('the crests stand on their bowls; the feather holders on the bowl\'s side', () => {
  for (const [style, form] of Object.entries(HELM_FORMS)) {
    const bowl = bowlOf(style);
    for (const station of form.parts.crest.stations) {
      const [x, y] = station.bottom;
      let near = Infinity;
      for (let step = 0; step <= 400; step += 1) {
        const point = formPoint(bowl, x >= 0 ? 0 : 1, step / 400);
        near = Math.min(near, Math.hypot(point[0] - x, point[1] - y));
      }
      assert.ok(near < 0.05, `${style}: crest foot at x ${x.toFixed(2)} y ${y.toFixed(2)}, ${near.toFixed(3)} from the bowl`);
    }
    if (form.feathers) {
      const [x, y, z] = form.feathers.at;
      const side = loftRadiusAt(bowl, Math.atan2(z, x), y);
      assert.ok(Math.abs(Math.hypot(x, z) - side) < 0.08, `${style}: the feather holder on the bowl`);
    }
  }
});

test('the samurai\'s masks sit on the face: off it by their gap, the chin cupped, as drawn on their sheets', () => {
  // The oni and ressei are narrow over the eyes, broad and square at the jaw, the jaw guard standing out in front.
  for (const name of ['oni', 'ressei']) {
    const fit = MASK_FITS[name];
    const at = (y) => maskOnFace(fit, [fit.R * Math.cos(1.2) * Math.sqrt(Math.max(0, 1 - (y / fit.R) ** 2)) / Math.cos(1.2) * Math.cos(1.2), y, fit.R * Math.sin(1.2) * Math.sqrt(Math.max(0, 1 - (y / fit.R) ** 2))]);
    assert.ok(Math.abs(Math.atan2(at(0.2)[2], at(0.2)[0])) < Math.abs(Math.atan2(at(-0.9)[2], at(-0.9)[0])), `${name}: narrower above than at the jaw`);
    const front = maskOnFace(fit, [Math.sqrt(fit.R ** 2 - 0.81), -0.9, 0]);
    assert.ok(front[0] - headRadiusAt(0, front[1]) > fit.gap + 0.05, `${name}: the jaw guard stands out`);
  }
  for (const [name, fit] of Object.entries(MASK_FITS)) {
    for (const polar of [0.55, 0.65, 0.75, 0.85]) {
      for (const azimuth of [0, 0.3, 0.6, 0.9]) {
        const a = polar * Math.PI;
        const point = maskOnFace(fit, [fit.R * Math.sin(a) * Math.cos(azimuth), fit.R * Math.cos(a), fit.R * Math.sin(a) * Math.sin(azimuth)]);
        const off = Math.hypot(point[0], point[2]) - headRadiusAt(Math.atan2(point[2], point[0]), point[1]);
        // At least the gap everywhere; more only where the jaw guard stands out in front of the chin (`chin`).
        const jutAllowed = (fit.chin ?? 0) + 1e-6;
        assert.ok(off >= fit.gap - 1e-6 && off <= fit.gap + jutAllowed, `${name}`);
      }
    }
    const chin = maskOnFace(fit, [0, -fit.R, 0]);
    assert.ok(chin[1] < -1.33, `${name}: the mask's foot under the chin`);
  }
  for (const [style, sheet] of [['oni', 'maskOni'], ['ressei', 'maskRessei'], ['tengu', 'maskTengu']]) assert.equal(MASK_FITS[style].R, HELM_MAP_DATA[sheet].grid.R, style);
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
  assert.ok(eye.at[0] > 1.05 && eye.normal[0] > 0.8, 'the eyeholes look forward');
  assert.ok(Math.abs(eyes.y - -0.07) < 0.05, 'at the eyes\' height');
});
