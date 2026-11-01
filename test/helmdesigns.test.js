import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, PRESETS } from '../src/body.js';
import { HELM_MAP_DATA } from '../src/helmmaps-data.js';
import { HELM_STYLE, helmStyleFrom } from '../src/helmstyle.js';
import { DESIGN_FORMS, designFormOf, designTriangles, formCuts, formGrid, formPoint, HELM_DESIGNS, HELM_HEAD, headRadiusAt } from '../src/helmforms.js';

// The head's radius (cm) as the game draws it, and the drawn head's scale over the body's head radius (render.js).
const R_CM = 11.5;
const HEAD_SCALE = 1.12;
// The kettle hat as it was drawn (wardrobe.js): a half sphere 20 x 12, an open cone 26 round, a torus 6 x 20.
const OLD_KETTLE = 20 * 12 * 2 - 20 + 26 * 2 + 6 * 20 * 2;
// The museum pieces' measures (cm: front to back, side to side, high) the designs are drawn from.
const MUSEUM = {
  kettleRidged: [[30.3, 25.9, 17.5], [33.7, 33, 23.3]],
  kettleBurgundian: [[37.1, 24.8, 25.9]],
  salletGerman: [[37.4, 20.2, 24.8], [37.8, 22.9, 24.1]],
  barbute: [[27, 20, 28.9], [24.9, 19.7, 26.3]],
};

/** A loft's distance from the upright axis at `azimuth` (rad from the face) and height y, or null where it does not reach. */
function loftRadiusAt(part, azimuth, y) {
  const u = azimuth / (Math.PI * (part.span ?? 1));
  if (u > 1) return null;
  let last = formPoint(part, u, 0);
  for (let step = 1; step <= 240; step += 1) {
    const point = formPoint(part, u, step / 240);
    if ((last[1] - y) * (point[1] - y) <= 0 && last[1] !== point[1]) {
      const t = (y - last[1]) / (point[1] - last[1]);
      return Math.hypot(last[0] + (point[0] - last[0]) * t, last[2] + (point[2] - last[2]) * t);
    }
    last = point;
  }
  return null;
}

/** The fitted part of a design (its bowl or shell). */
const fittedOf = (form) => form.parts.bowl ?? form.parts.shell;

/** The metal's extent (cm) front to back, side to side and high, the bevor apart. */
function extent(form) {
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const [name, part] of Object.entries(form.parts)) {
    if (name === 'bevor') continue;
    const { positions } = formGrid(part);
    for (let index = 0; index < positions.length; index += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        low[axis] = Math.min(low[axis], positions[index + axis]);
        high[axis] = Math.max(high[axis], positions[index + axis]);
      }
    }
  }
  return [0, 2, 1].map((axis) => (high[axis] - low[axis]) * R_CM);
}

test('the kettle hat is drawn as it was unless a design is asked for; any unit wearing one is drawn in it', () => {
  assert.equal(helmStyleFrom('').kettle, 'now');
  assert.equal(HELM_STYLE.kettle, 'now');
  assert.equal(helmStyleFrom('#kettle=c').kettle, 'c');
  assert.equal(helmStyleFrom('#kettle=z').kettle, 'now');
  assert.equal(designFormOf('kettleHat', 'now'), null);
  assert.equal(designFormOf('bascinet', 'a'), null);
  for (const [choice, name] of Object.entries(HELM_DESIGNS.kettleHat)) assert.equal(designFormOf('kettleHat', choice), DESIGN_FORMS[name], choice);
  assert.equal(new Set(Object.values(DESIGN_FORMS).map((form) => form.build)).size, 3, 'kettle hats, a sallet, a barbute: different kinds');
});

test('each design is drawn with no more triangles than the old kettle hat (752) and has its sheet baked', () => {
  assert.equal(OLD_KETTLE, 752);
  for (const [name, form] of Object.entries(DESIGN_FORMS)) {
    assert.ok(designTriangles(name) <= OLD_KETTLE, `${name}: ${designTriangles(name)}`);
    const sheet = HELM_MAP_DATA[form.sheet];
    assert.ok(sheet && sheet.albedo && sheet.normal && sheet.orm, name);
    for (const part of Object.values(form.parts)) assert.ok(form.regions[part.region], `${name}: ${part.region}`);
  }
});

test('every design is symmetric about the middle of the face', () => {
  for (const [name, form] of Object.entries(DESIGN_FORMS)) {
    for (const [partName, part] of Object.entries(form.parts)) {
      for (const [u, v] of [[0.2, 0.1], [0.5, 0.5], [0.85, 0.9]]) {
        const left = formPoint(part, u, v);
        const right = formPoint(part, -u, v);
        assert.ok(Math.abs(left[0] - right[0]) < 1e-9 && Math.abs(left[1] - right[1]) < 1e-9 && Math.abs(left[2] + right[2]) < 1e-9, `${name} ${partName}`);
      }
      const [nu, nv] = formCuts(part);
      assert.equal(formGrid(part).indices.length, nu * nv * 6);
    }
  }
});

test('every design is fitted over the head: a lining\'s room (1 cm at least) all round, close round the cranium\'s sides (a tall skull may rise above it), longer than broad', () => {
  const small = buildBody({ ...structuredClone(PRESETS.crossbow), heightCm: 152, frame: 'small' }).lengths.headRadius;
  const large = buildBody({ ...structuredClone(PRESETS.crossbow), heightCm: 200, frame: 'large' }).lengths.headRadius;
  for (const [name, form] of Object.entries(DESIGN_FORMS)) {
    const part = fittedOf(form);
    const foot = Math.max(...part.stations[0].y);
    let least = Infinity;
    let most = -Infinity;
    for (let y = foot + 0.05; y <= HELM_HEAD.crown - 0.05; y += 0.05) {
      for (let k = 0; k <= 32; k += 1) {
        const azimuth = (Math.PI * k) / 32;
        const outside = loftRadiusAt(part, azimuth, y);
        if (outside === null) continue;
        const gap = outside - headRadiusAt(azimuth, y);
        least = Math.min(least, gap);
        if (y >= 0.2 && y <= 0.5) most = Math.max(most, gap);
      }
    }
    for (const r of [small, large]) {
      const cm = (gap) => gap * r * HEAD_SCALE * 100;
      assert.ok(cm(least) >= 1.0, `${name}: ${cm(least).toFixed(2)} cm at the closest`);
      assert.ok(cm(most) <= 3.5, `${name}: ${cm(most).toFixed(2)} cm at the furthest round the cranium`);
    }
    const front = formPoint(part, 0, 0.6);
    const side = formPoint(part, 0.5, 0.6);
    const back = formPoint(part, 1, 0.6);
    assert.ok(2 * side[2] < 0.86 * (front[0] - back[0]), `${name}: an oval, not a ball`);
  }
});

test('each design stands within the measures of the pieces it is drawn from (the game\'s broad head allowed for)', () => {
  for (const [name, form] of Object.entries(DESIGN_FORMS)) {
    const [length, breadth, height] = extent(form);
    const near = (value, index, slack) => MUSEUM[name].some((piece) => value > piece[index] * (1 - slack) && value < piece[index] * (1 + slack));
    assert.ok(near(length, 0, 0.12), `${name}: ${length.toFixed(1)} cm long`);
    assert.ok(near(breadth, 1, 0.32), `${name}: ${breadth.toFixed(1)} cm broad`);
    assert.ok(near(height, 2, 0.2), `${name}: ${height.toFixed(1)} cm high`);
    assert.ok(length > breadth, `${name}: longer than broad`);
  }
});

test('the brims slope down; the Burgundian hat\'s and the sallet\'s sights are at the eyes, the barbute open at the face', () => {
  for (const name of ['kettleRidged', 'kettleBurgundian']) {
    const brim = DESIGN_FORMS[name].parts.brim;
    for (const u of [0, 0.5, 1]) assert.ok(formPoint(brim, u, 1)[1] < formPoint(brim, u, 0)[1] - 0.15, `${name}: the brim falls`);
  }
  const burgundian = DESIGN_FORMS.kettleBurgundian;
  const brimFront = burgundian.parts.brim;
  assert.ok(formPoint(brimFront, 0, 1)[1] < burgundian.sight.y - burgundian.sight.h, 'the brim comes down past the eyes, the sight in it');
  for (const name of ['kettleBurgundian', 'salletGerman']) assert.ok(Math.abs(DESIGN_FORMS[name].sight.y - -0.05) < 0.08 && DESIGN_FORMS[name].sight.z > 0.4, `${name}: the sight across both eyes`);
  const { bar, slot, wide } = DESIGN_FORMS.barbute.opening;
  assert.ok(bar[0] < -0.07 && bar[1] > -0.07 && wide > 0.4 && slot > 0.1, 'the T: the eyes across, the mouth down');
});

test('the sallet has its tail behind and its bevor clear of the face, tucked under the sallet\'s front', () => {
  const { shell, bevor } = DESIGN_FORMS.salletGerman.parts;
  const tail = formPoint(shell, 1, 0);
  const brow = formPoint(shell, 0, 0);
  assert.ok(-tail[0] - brow[0] > 0.4, 'the tail reaches out further behind than the face plate before');
  for (const y of [-1.2, -0.9, -0.6]) assert.ok(loftRadiusAt(bevor, 0, y) - headRadiusAt(0, y) > 0.08, `the bevor stands off the face at ${y}`);
  const top = formPoint(bevor, 0, 1);
  assert.ok(top[1] > brow[1], 'its top rises above the sallet\'s front edge');
  assert.ok(top[0] < loftRadiusAt(shell, 0, top[1]), 'inside the sallet');
});
