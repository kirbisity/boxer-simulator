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
// Each design's budget: no more than its first drawing (commit 802be01), and none over the Templar's great helm today.
const BUDGET = { greatHelm: 544, hounskull: 1160, greatBascinet: 1024, armet: 1236, sallet: 1248, closeHelmet: 1384 };
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

test('the knights\' helmets are drawn as they were unless a design is asked for; any knightly unit can wear one', () => {
  assert.equal(helmStyleFrom('').knight, 'now');
  assert.equal(HELM_STYLE.knight, 'now');
  assert.equal(helmStyleFrom('#knighthelm=4').knight, '4');
  assert.equal(helmStyleFrom('#kettle=b&knighthelm=9').knight, 'now');
  for (const kind of KNIGHT_HELM_KINDS) assert.equal(knightFormOf(kind, 'now'), null, kind);
  assert.equal(knightFormOf('kettleHat', '3'), null);
  assert.equal(Object.keys(KNIGHT_HELM_CHOICES).length, 6);
  for (const [choice, name] of Object.entries(KNIGHT_HELM_CHOICES)) {
    for (const kind of KNIGHT_HELM_KINDS) assert.equal(knightFormOf(kind, choice), KNIGHT_FORMS[name], `${kind} ${choice}`);
  }
  // A unit naming its design wears it whatever is asked; none does today.
  assert.equal(knightFormOf('bascinet', 'now', 'armet'), KNIGHT_FORMS.armet);
  const heads = ['knight', 'templar'].flatMap((unit) => OUTFITS[unit].designs.map((design) => design.head));
  assert.ok(heads.every((head) => KNIGHT_HELM_KINDS.includes(head.kind) && head.design === undefined));
  assert.deepEqual(setHelmStyle({ knight: 3 }).knight, '3');
  setHelmStyle({ knight: 'now' });
  assert.equal(HELM_STYLE.knight, 'now');
});

test('six designs of different kinds, each with its period, its museum piece and its sheet baked with cut-outs', () => {
  assert.equal(Object.keys(KNIGHT_FORMS).length, 6);
  assert.deepEqual(Object.values(KNIGHT_FORMS).map((form) => form.number).sort(), [1, 2, 3, 4, 5, 6]);
  for (const [name, form] of Object.entries(KNIGHT_FORMS)) {
    assert.ok(form.label && form.period && form.museum && /^https:\/\//.test(form.link) && form.line, name);
    const sheet = HELM_MAP_DATA[form.sheet];
    assert.ok(sheet && sheet.albedo && sheet.normal && sheet.orm, name);
    assert.ok(form.cut, `${name}: its sights cut through`);
    for (const part of Object.values(form.parts)) if (part.region) assert.ok(form.regions[part.region], `${name}: ${part.region}`);
  }
});

test(`each design is drawn with no more triangles than its first drawing, none over the Templar's great helm today (${OLD_GREAT_HELM}; the bascinet ${OLD_BASCINET})`, () => {
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

test('the sights are at the eyes, across both of them, cut through the face the eyes look out of', () => {
  for (const [name, form] of Object.entries(KNIGHT_FORMS)) {
    const [y0, y1] = form.sight.y;
    const [z0, z1] = form.sight.z;
    assert.ok(y0 < EYES.y && y1 > EYES.y - 0.06 && Math.abs((y0 + y1) / 2 - EYES.y) < 0.06, `${name}: at eye height`);
    assert.ok(y1 - y0 >= 0.08 && y1 - y0 <= 0.16, `${name}: a slit 1-2 cm high`);
    assert.ok(z0 < EYES.z - 0.1 && z1 > EYES.z + 0.15, `${name}: across the eye`);
    // The sight is a cut-out of the part the face looks out of (the foremost at eye height).
    const facing = metalLofts(form).map(([, part]) => part).filter((part) => frontAt(form, part, EYES.y) !== null);
    const front = facing.reduce((a, b) => (frontAt(form, b, EYES.y) > frontAt(form, a, EYES.y) ? b : a));
    const slot = front.bake.find((feature) => feature.kind === 'slot' && feature.cut);
    assert.ok(slot && slot.y[0] === y0 && slot.y[1] === y1 && slot.z[0] === z0 && slot.z[1] === z1, `${name}: cut in the foremost plate`);
    assert.ok(frontAt(form, front, EYES.y) > headRadiusAt(0, EYES.y) + 0.1, `${name}: in front of the eyes`);
  }
});

test('each design stands within the measures of the piece it is drawn from (the game\'s broad head allowed for)', () => {
  // Front to back and high (cm), from the museums' records: Prankh helm (31 deep), Musée de l'Armée H 21 (29 high), British
  // Museum OA.2190 (26 deep, 44 high), Met 29.158.22 (28.6 deep, 29.2 high), Met 04.3.229 (37.1 deep, 24.8 high), Met
  // 42.50.47 (33.7 deep, 29.8 high). The broad game head (about 21-24 cm across inside) makes each a little bigger.
  const MUSEUM = { greatHelm: [31, 34], hounskull: [36, 31], greatBascinet: [34, 44], armet: [28.6, 31], sallet: [37.1, 26], closeHelmet: [33.7, 31] };
  for (const [name, form] of Object.entries(KNIGHT_FORMS)) {
    // (The sallet's bevor a piece of its own, strapped on.)
    const { length, height } = extent(form, ['aventail', 'rondel', 'liner', 'comb', ...(name === 'sallet' ? ['bevor'] : [])]);
    assert.ok(Math.abs(length / MUSEUM[name][0] - 1) < 0.15, `${name}: ${length.toFixed(1)} cm long`);
    assert.ok(Math.abs(height / MUSEUM[name][1] - 1) < 0.15, `${name}: ${height.toFixed(1)} cm high`);
  }
});

test('each kind\'s silhouette: the great helm\'s flat top and prow, the bascinets\' apex over the back, the snout, the armet\'s chin and rondel, the sallet\'s tail, the close helmet\'s comb and beak', () => {
  const { greatHelm, hounskull, greatBascinet, armet, sallet, closeHelmet } = KNIGHT_FORMS;
  // The great helm: a flat top plate (its crown within 0.6 cm of level across most of it), flat sides, a prow down the face.
  const top = points(greatHelm, greatHelm.parts.shell).filter(([x, y, z]) => y > 1.19 && Math.hypot(x, z) < 0.7);
  assert.ok(top.length && Math.max(...top.map((p) => p[1])) - Math.min(...top.map((p) => p[1])) < 0.06, 'a flat top');
  assert.ok(frontAt(greatHelm, greatHelm.parts.shell, -0.6) - knightPoint(greatHelm, greatHelm.parts.shell, 0.1, 0.25)[0] > 0.05, 'the face plates meet in a ridge');
  // The bascinets: the apex well behind the middle of the head, the hounskull's snout 0.7 r or more before the face.
  const apex = (form) => knightPoint(form, mainOf(form), 0, 1);
  assert.ok(apex(hounskull)[0] < -0.6 && apex(hounskull)[1] > 1.6, `the hounskull's apex over the back (${apex(hounskull)[0].toFixed(2)})`);
  assert.ok(apex(greatBascinet)[0] < -0.2, 'the great bascinet\'s apex leans back');
  const snout = Math.max(...points(hounskull, hounskull.parts.visor).map((p) => p[0]));
  assert.ok(snout - 1.15 > 0.75, `the snout stands ${(snout - 1.15).toFixed(2)} r before the nose`);
  const tip = points(hounskull, hounskull.parts.visor).reduce((a, b) => (b[0] > a[0] ? b : a));
  assert.ok(tip[1] < -0.4 && tip[1] > -0.8, 'pointed at the mouth');
  // The great bascinet: down over the neck, flaring out behind at the foot.
  const gb = greatBascinet.parts.shell;
  assert.ok(Math.min(...gb.stations[0].y) < -2.0 && -knightPoint(greatBascinet, gb, 1, 0)[0] > -knightPoint(greatBascinet, gb, 1, 0.12)[0] + 0.2, 'the flare behind');
  // The armet: its chin standing before the neck, the neck drawn in behind, the rondel behind the nape.
  const chin = frontAt(armet, armet.parts.shell, -1.34);
  assert.ok(chin > 1.0 && -knightPoint(armet, armet.parts.shell, 1, 0.1)[0] < 0.8, 'the chin full, the neck drawn in');
  assert.ok(formPoint(armet.parts.rondel, 0, 0.7)[0] < -0.9, 'the rondel behind the nape');
  // The sallet: its tail reaching well behind the head and down below the ears.
  const tail = knightPoint(sallet, sallet.parts.shell, 1, 0);
  assert.ok(tail[0] < -1.8 && tail[1] < -0.9, 'the long tail');
  // The close helmet: the comb standing a third of a head radius or more above the skull; the visor's beak before the face.
  const comb = Math.max(...points(closeHelmet, closeHelmet.parts.comb, 24).map((p) => p[1]));
  assert.ok(comb - apex(closeHelmet)[1] > 0.3, 'a tall comb');
  assert.ok(Math.max(...points(closeHelmet, closeHelmet.parts.visor).map((p) => p[0])) > 1.6, 'the beak');
});
