import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, PRESETS } from '../src/body.js';
import { HELM_MAP_DATA } from '../src/helmmaps-data.js';
import { HELM_STYLE, helmStyleFrom, setHelmStyle } from '../src/helmstyle.js';
import { formCuts, formPoint, HELM_HEAD, headRadiusAt } from '../src/helmforms.js';
import { KNIGHT_FORMS, KNIGHT_HELM_CHOICES, KNIGHT_HELM_KINDS, knightFormOf, knightGrid, knightPoint, knightTriangles } from '../src/knighthelms.js';
import { OUTFITS } from '../src/outfits.js';

// The head's radius (cm) as drawn, and the drawn head's scale over the body's head radius (render.js).
const R_CM = 11.5;
const HEAD_SCALE = 1.12;
// The knight's bascinet as drawn today (wardrobe.js): a sphere 20 x 14, a cone 14 round, a box, an open cylinder 18 round;
// the Templar's great helm: its lathe (6 spans x 28), the seam's torus (5 x 28), the ridge's tube (24 x 5), the sight (16),
// 36 breaths and the cross cut (boxes), its coif (20).
const OLD_BASCINET = 20 * 13 * 2 + 14 * 3 + 12 + 18 * 2;
const OLD_GREAT_HELM = 6 * 28 * 2 + 5 * 28 * 2 + 24 * 5 * 2 + 16 * 2 + 36 * 12 + 2 * 12 + 20 * 2;
// Each design's budget: no more than its drawing before (main 665fa12), and none over the Templar's great helm today.
const BUDGET = { hounskull: 1160, sallet: 1176, closeHelmet: 1236 };
// The eyes (HELM_HEAD: y about -0.07, either side of the middle at |z| about 0.3).
const EYES = { y: -0.07, z: 0.3 };

/** Every point of a part on a fine grid (leaned as its design leans). */
function points(form, part, steps = 96) {
  const out = [];
  for (let i = 0; i <= steps; i += 1) for (let j = 0; j <= steps; j += 1) out.push(knightPoint(form, part, -1 + (2 * i) / steps, j / steps));
  return out;
}

/** Whether a point falls in its part's face opening (cut away under the visor). */
function inOpening(part, [x, y, z]) {
  const opening = (part.bake ?? []).find((feature) => feature.kind === 'cutout');
  return !!opening && x > 0 && Math.abs(z) < opening.z[1] && y > opening.y[0] && y < opening.y[1];
}

/** How far forward (x) a part reaches down the middle of the face at height y, or null. */
function frontAt(form, part, y) {
  let last = knightPoint(form, part, 0, 0);
  let best = null;
  for (let step = 1; step <= 400; step += 1) {
    const point = knightPoint(form, part, 0, step / 400);
    if ((last[1] - y) * (point[1] - y) <= 0 && last[1] !== point[1]) {
      const x = last[0] + ((point[0] - last[0]) * (y - last[1])) / (point[1] - last[1]);
      best = best === null ? x : Math.max(best, x);
    }
    last = point;
  }
  return best;
}

const metalLofts = (form) => Object.entries(form.parts).filter(([, part]) => part.kind === 'loft' && part.look === 'metal');
const mainOf = (form) => form.parts.shell ?? form.parts.skull;

/** The metal's extent (cm) front to back, side to side and high, leaving out what hangs below or stands off (named). */
function extent(form, leave = ['aventail', 'bevor', 'rondel', 'liner', 'comb']) {
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const [name, part] of Object.entries(form.parts)) {
    if (leave.includes(name)) continue;
    const { positions } = knightGrid(form, part);
    for (let index = 0; index < positions.length; index += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        low[axis] = Math.min(low[axis], positions[index + axis]);
        high[axis] = Math.max(high[axis], positions[index + axis]);
      }
    }
  }
  return { length: (high[0] - low[0]) * R_CM, breadth: (high[2] - low[2]) * R_CM, height: (high[1] - low[1]) * R_CM, low, high };
}


test('every knight wears his harness\'s helmet: the hounskull, the sallet and bevor or the close helmet; #knighthelm compares them', () => {
  assert.equal(helmStyleFrom('').knight, 'own');
  assert.equal(HELM_STYLE.knight, 'own');
  assert.equal(helmStyleFrom('#knighthelm=5').knight, '5');
  for (const dropped of ['1', '3', '4', '9']) assert.equal(helmStyleFrom(`#knighthelm=${dropped}`).knight, 'own', dropped);
  assert.deepEqual(KNIGHT_HELM_CHOICES, { 2: 'hounskull', 5: 'sallet', 6: 'closeHelmet' });
  // The knight's harnesses each name one; the three spread across the designs in play.
  const knight = OUTFITS.knight;
  const worn = Object.fromEntries(knight.designs.map((design) => [design.label, design.head.design]));
  assert.deepEqual(worn, { 'Gothic plate': 'sallet', Milanese: 'hounskull', Blackened: 'sallet', 'Bright, wine arming coat': 'closeHelmet', Russeted: 'hounskull' });
  assert.deepEqual(new Set(knight.picked.map((index) => knight.designs[index].head.design)), new Set(['sallet', 'hounskull', 'closeHelmet']));
  for (const design of knight.designs) assert.equal(knightFormOf(design.head.kind, 'own', design.head.design), KNIGHT_FORMS[design.head.design], design.label);
  // The Templars (c. 1180-1300) keep their great helm; Joan of Arc goes bareheaded; the jousters keep the Stechhelm.
  for (const design of OUTFITS.templar.designs) assert.equal(knightFormOf(design.head.kind, 'own', design.head.design), null);
  assert.ok(OUTFITS.joan.designs.every((design) => !design.head));
  assert.ok(OUTFITS.tournament.designs.every((design) => design.head.kind === 'stechhelm'));
  // Comparison: every knight in one, or all as before.
  assert.equal(knightFormOf('bascinet', '6', 'sallet'), KNIGHT_FORMS.closeHelmet);
  assert.equal(knightFormOf('greatHelm', '2'), KNIGHT_FORMS.hounskull);
  assert.equal(knightFormOf('bascinet', 'now', 'sallet'), null);
  assert.equal(knightFormOf('kettleHat', '5', 'sallet'), null);
  assert.deepEqual(setHelmStyle({ knight: 5 }).knight, '5');
  setHelmStyle({ knight: 'own' });
  assert.equal(HELM_STYLE.knight, 'own');
});

test('three designs, each with its period, its museum piece and its sheet baked with cut-outs', () => {
  assert.deepEqual(Object.keys(KNIGHT_FORMS), ['hounskull', 'sallet', 'closeHelmet']);
  for (const [name, form] of Object.entries(KNIGHT_FORMS)) {
    assert.ok(form.label && form.period && form.museum && /^https:\/\//.test(form.link) && form.line, name);
    const sheet = HELM_MAP_DATA[form.sheet];
    assert.ok(sheet && sheet.albedo && sheet.normal && sheet.orm, name);
    assert.ok(form.cut, `${name}: its sights cut through`);
    for (const part of Object.values(form.parts)) if (part.region) assert.ok(form.regions[part.region], `${name}: ${part.region}`);
  }
});

test(`each design is drawn with no more triangles than before, none over the Templar's great helm today (${OLD_GREAT_HELM}; the bascinet ${OLD_BASCINET})`, () => {
  for (const name of Object.keys(KNIGHT_FORMS)) {
    assert.ok(knightTriangles(name) <= BUDGET[name] && knightTriangles(name) <= OLD_GREAT_HELM, `${name}: ${knightTriangles(name)}`);
  }
});

test('every design is symmetric about the middle of the face', () => {
  for (const [name, form] of Object.entries(KNIGHT_FORMS)) {
    for (const [partName, part] of Object.entries(form.parts)) {
      for (const [u, v] of [[0.2, 0.1], [0.5, 0.5], [0.85, 0.9]]) {
        const left = knightPoint(form, part, u, v);
        const right = knightPoint(form, part, -u, v);
        assert.ok(Math.abs(left[0] - right[0]) < 1e-9 && Math.abs(left[1] - right[1]) < 1e-9 && Math.abs(left[2] + right[2]) < 1e-9, `${name} ${partName}`);
      }
      const [nu, nv] = formCuts(part);
      assert.equal(knightGrid(form, part).indices.length, nu * nv * 6);
    }
  }
});

test('every design is fitted over the head on a small and a large man: a lining\'s room all round, close round the cranium, longer than broad', () => {
  const small = buildBody({ ...structuredClone(PRESETS.crossbow), heightCm: 152, frame: 'small' }).lengths.headRadius;
  const large = buildBody({ ...structuredClone(PRESETS.crossbow), heightCm: 200, frame: 'large' }).lengths.headRadius;
  for (const [name, form] of Object.entries(KNIGHT_FORMS)) {
    let least = Infinity;
    let most = -Infinity;
    for (const [, part] of metalLofts(form)) {
      for (const point of points(form, part)) {
        const [x, y, z] = point;
        if (y < -1.3 || y > HELM_HEAD.crown - 0.04 || inOpening(part, point)) continue;
        const gap = Math.hypot(x, z) - headRadiusAt(Math.atan2(Math.abs(z), x), y);
        least = Math.min(least, gap);
        if (part === mainOf(form) && y >= 0.2 && y <= 0.5) most = Math.max(most, gap);
      }
    }
    for (const r of [small, large]) {
      const cm = (gap) => gap * r * HEAD_SCALE * 100;
      assert.ok(cm(least) >= 1.0, `${name}: ${cm(least).toFixed(2)} cm at the closest`);
      assert.ok(cm(most) <= form.standoff + 0.3, `${name}: ${cm(most).toFixed(2)} cm off the cranium`);
    }
    const { length, breadth } = extent(form);
    assert.ok(breadth < 0.86 * length, `${name}: narrow side to side (${breadth.toFixed(1)} against ${length.toFixed(1)} cm)`);
  }
});


/** The part the face looks out of at eye height (the foremost there). */
function facing(form) {
  const parts = metalLofts(form).map(([, part]) => part).filter((part) => frontAt(form, part, EYES.y) !== null);
  return parts.reduce((a, b) => (frontAt(form, b, EYES.y) > frontAt(form, a, EYES.y) ? b : a));
}

test('the hounskull\'s sights are at the eyes, cut through the visor', () => {
  const form = KNIGHT_FORMS.hounskull;
  const [y0, y1] = form.sight.y;
  assert.ok(y0 < EYES.y && y1 > EYES.y - 0.06 && Math.abs((y0 + y1) / 2 - EYES.y) < 0.06);
  const front = facing(form);
  assert.equal(front, form.parts.visor);
  assert.ok(front.bake.some((feature) => feature.kind === 'slot' && feature.cut && feature.y[0] === y0));
});

test('the sallet\'s and the close helmet\'s sight is one long narrow slit at the eyes, nearly ear to ear, in the plate before them', () => {
  for (const name of ['sallet', 'closeHelmet']) {
    const form = KNIGHT_FORMS[name];
    const front = facing(form);
    const cuts = front.bake.filter((feature) => feature.cut || feature.kind === 'vue');
    // One opening at eye height: the vue, continuous across the middle of the face (no bar, no pair of holes).
    const atEyes = cuts.filter((feature) => feature.y && feature.y[0] < EYES.y + 0.1 && feature.y[1] > EYES.y - 0.1);
    assert.equal(atEyes.length, 1, `${name}: one opening at the eyes`);
    const [vue] = atEyes;
    assert.equal(vue.kind, 'vue', `${name}: a slit across the middle`);
    assert.deepEqual(vue.y, form.sight.y);
    assert.equal(vue.to, form.sight.to);
    const [y0, y1] = vue.y;
    const high = (y1 - y0) * R_CM;
    assert.ok(high >= 0.9 && high <= 1.6, `${name}: ${high.toFixed(2)} cm high`);
    assert.ok(Math.abs((y0 + y1) / 2 - EYES.y) < 0.06, `${name}: at eye height`);
    // Its ends far round the face: well past the eyes, towards the ears.
    let end = null;
    for (let step = 0; step <= 400; step += 1) {
      const point = knightPoint(form, front, vue.to, step / 400);
      if (!end || Math.abs(point[1] - EYES.y) < Math.abs(end[1] - EYES.y)) end = point;
    }
    assert.ok(Math.abs(end[2]) > 0.75, `${name}: the slit reaches round to |z| ${Math.abs(end[2]).toFixed(2)}`);
    assert.ok(frontAt(form, front, EYES.y) > headRadiusAt(0, EYES.y) + 0.1, `${name}: in front of the eyes`);
  }
});

test('the sallet and the close helmet are two pieces: the upper laps over the lower in a step, each with its own edges and pivot or strap', () => {
  for (const [name, upperName, lowerName] of [['sallet', 'shell', 'bevor'], ['closeHelmet', 'visor', 'bevor']]) {
    const form = KNIGHT_FORMS[name];
    assert.equal(form.pieces.length, 2, name);
    assert.ok(form.pieces[0].includes(upperName) && form.pieces[1].includes(lowerName), name);
    const upper = form.parts[upperName];
    const lower = form.parts[lowerName];
    // The lower piece is a surface of its own with its own turned edges, its shadow under the upper's edge, and its
    // strap or pivot.
    const edges = lower.bake.filter((feature) => feature.kind === 'edge').map((feature) => feature.at);
    assert.ok(['start', 'end', 'side'].every((at) => edges.includes(at)), `${name}: the lower piece's edges turned`);
    assert.ok(lower.bake.some((feature) => feature.kind === 'shade'), `${name}: in shadow under the upper's edge`);
    assert.ok(lower.bake.some((feature) => feature.kind === 'rivets' || feature.kind === 'boss'), `${name}: strapped or pivoted`);
    // They overlap in height down the middle of the face, and there the upper stands out over the lower (the step).
    const upperLow = Math.min(...points(form, upper).filter((p) => Math.abs(p[2]) < 0.05 && p[0] > 0).map((p) => p[1]));
    const lowerHigh = Math.max(...points(form, lower).filter((p) => Math.abs(p[2]) < 0.05 && p[0] > 0).map((p) => p[1]));
    assert.ok(lowerHigh > upperLow + 0.05, `${name}: the lower piece's top runs up under the upper's edge`);
    const y = upperLow + 0.03;
    assert.ok(frontAt(form, upper, y) - frontAt(form, lower, y) > 0.05, `${name}: the upper's edge stands over the lower in a step`);
  }
});

test('each design stands within the measures of the piece it is drawn from (the game\'s broad head allowed for)', () => {
  // Front to back and high (cm), from the museums' records: Musée de l'Armée H 21 (29 high), Met 04.3.229 (37.1 deep, 24.8
  // high), Met 42.50.47 (33.7 deep, 29.8 high). The broad game head (about 21-24 cm across inside) makes each a little bigger.
  const MUSEUM = { hounskull: [36, 31], sallet: [37.1, 26], closeHelmet: [33.7, 31] };
  for (const [name, form] of Object.entries(KNIGHT_FORMS)) {
    // (The sallet's bevor a piece of its own, strapped on.)
    const { length, height } = extent(form, ['aventail', 'rondel', 'liner', 'comb', ...(name === 'sallet' ? ['bevor'] : [])]);
    assert.ok(Math.abs(length / MUSEUM[name][0] - 1) < 0.15, `${name}: ${length.toFixed(1)} cm long`);
    assert.ok(Math.abs(height / MUSEUM[name][1] - 1) < 0.15, `${name}: ${height.toFixed(1)} cm high`);
  }
});

test('each kind\'s silhouette: the hounskull\'s apex over the back and its snout, the sallet\'s tail, the close helmet\'s comb and beak', () => {
  const { hounskull, sallet, closeHelmet } = KNIGHT_FORMS;
  const apex = (form) => knightPoint(form, mainOf(form), 0, 1);
  assert.ok(apex(hounskull)[0] < -0.6 && apex(hounskull)[1] > 1.55, `the hounskull's apex over the back (${apex(hounskull)[0].toFixed(2)})`);
  const snout = Math.max(...points(hounskull, hounskull.parts.visor).map((p) => p[0]));
  assert.ok(snout - 1.15 > 0.75, `the snout stands ${(snout - 1.15).toFixed(2)} r before the nose`);
  const tip = points(hounskull, hounskull.parts.visor).reduce((a, b) => (b[0] > a[0] ? b : a));
  assert.ok(tip[1] < -0.4 && tip[1] > -0.8, 'pointed at the mouth');
  // The sallet: its face down past the nose and clear of it, its tail reaching well behind the head and below the ears.
  assert.ok(frontAt(sallet, sallet.parts.shell, -0.5) > 1.15 + 0.1, 'the sallet\'s face clear of the nose');
  const tail = knightPoint(sallet, sallet.parts.shell, 1, 0);
  assert.ok(tail[0] < -1.8 && tail[1] < -0.9, 'the long tail');
  const comb = Math.max(...points(closeHelmet, closeHelmet.parts.comb, 24).map((p) => p[1]));
  assert.ok(comb - apex(closeHelmet)[1] > 0.3, 'a tall comb');
  assert.ok(Math.max(...points(closeHelmet, closeHelmet.parts.visor).map((p) => p[0])) > 1.6, 'the beak');
});
