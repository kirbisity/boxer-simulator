import test from 'node:test';
import assert from 'node:assert/strict';
import { BARDING, HORSES } from '../src/horses.js';
import { HORSE_BUILD, buildHorseModel, horseCoat } from '../src/horsemesh.js';
import { hairChain, stepHair } from '../src/horsehair.js';

const spec = (breed, barding, detail = 'full', extra = {}) => ({ breed, barding, coat: HORSES[breed].coats[0], seed: 3, detail, withers: HORSES[breed].withers, corner: 'red', ...extra });
const geometries = (model) => {
  const out = [];
  for (const key of ['body', 'neck', 'head', 'ear']) out.push(model.parts[key].soft, model.parts[key].metal);
  for (const leg of Object.values(model.parts.legs)) for (const segment of Object.values(leg)) out.push(segment.soft, segment.metal);
  return out.filter(Boolean);
};

test('every breed in every barding builds, full and low detail, with a bounded number of triangles and meshes', () => {
  for (const breed of Object.keys(HORSES)) {
    assert.ok(HORSE_BUILD[breed], `${breed} has a look`);
    for (const barding of Object.keys(BARDING)) {
      const full = buildHorseModel(spec(breed, barding));
      const low = buildHorseModel(spec(breed, barding, 'low'));
      assert.ok(full.triangles > 3000 && full.triangles < 20000, `${breed} ${barding} full: ${full.triangles} triangles`);
      assert.ok(full.pieces >= 20 && full.pieces <= 40, `${breed} ${barding} full: ${full.pieces} meshes`);
      // A crowd's horse is far lighter: well under half the triangles and the meshes.
      assert.ok(low.triangles < full.triangles * 0.5, `${breed} ${barding}: low ${low.triangles} of ${full.triangles} triangles`);
      assert.ok(low.pieces <= full.pieces * 0.5, `${breed} ${barding}: low ${low.pieces} of ${full.pieces} meshes`);
      assert.ok(low.triangles < 3500, `${breed} ${barding} low: ${low.triangles}`);
    }
  }
});

test('the meshes are sound: finite, indexed in range, normals unit length, and every part inside a horse-sized box', () => {
  for (const [breed, barding] of [['destrier', 'plate'], ['steppe', 'lamellar'], ['arabian', 'bare']]) {
    const model = buildHorseModel(spec(breed, barding, 'full', { caparison: true }));
    const W = HORSES[breed].withers;
    for (const geometry of geometries(model)) {
      const count = geometry.positions.length / 3;
      assert.equal(geometry.normals.length, geometry.positions.length);
      assert.equal(geometry.colors.length, geometry.positions.length);
      for (const value of geometry.positions) assert.ok(Number.isFinite(value));
      for (const index of geometry.indices) assert.ok(index < count);
      for (let v = 0; v < count; v += 1) {
        const length = Math.hypot(geometry.normals[v * 3], geometry.normals[v * 3 + 1], geometry.normals[v * 3 + 2]);
        // Degenerate corners (a point where a loft closes) may have none.
        assert.ok(length === 0 || Math.abs(length - 1) < 1e-3, `a normal of length ${length}`);
      }
      for (const value of geometry.positions) assert.ok(Math.abs(value) < 1.4 * W, `a vertex ${value} m from its pivot on a ${W} m horse`);
    }
    assert.ok(model.rig.trapper.indices.length > 0);
  }
});

test('the body is built to the horse: its height at the withers, and the legs hinge at the right places', () => {
  const model = buildHorseModel(spec('warhorse', 'bare'));
  const W = HORSES.warhorse.withers;
  const body = model.parts.body.soft.positions;
  let top = -Infinity;
  let bottom = Infinity;
  let front = -Infinity;
  let rear = Infinity;
  for (let v = 0; v < body.length; v += 3) {
    top = Math.max(top, body[v + 1]);
    bottom = Math.min(bottom, body[v + 1]);
    front = Math.max(front, body[v]);
    rear = Math.min(rear, body[v]);
  }
  // Withers at about a withers' height (the saddle and tail's dock may stand a little over), belly above half of it.
  assert.ok(top > 0.99 * W && top < 1.2 * W, `top ${top / W}`);
  assert.ok(bottom > 0.45 * W && bottom < 0.62 * W, `belly ${bottom / W}`);
  assert.ok(front - rear > 1.1 * W && front - rear < 1.5 * W, `length ${(front - rear) / W}`);
  // The head hangs from the poll, forward of and above the neck's base.
  assert.ok(model.rig.poll[0] > 0.2 * W && model.rig.poll[1] > 0.15 * W);
  // Lengths of the leg's segments make the physics' leg: upper and then cannon, pastern and hoof.
  const { upper, cannon, pastern, hoof } = model.rig.lengths;
  assert.ok(Math.abs(upper - 0.33 * W) < 1e-6);
  assert.ok(Math.abs(cannon + pastern + hoof - 0.42 * W) < 0.02 * W);
});

test('coats: each of the breeds\' hides is a bay, chestnut, grey, black or dun, and a seed gives its markings', () => {
  const kinds = new Set();
  for (const breed of Object.values(HORSES)) for (const hex of breed.coats) kinds.add(horseCoat(hex, 1).type);
  for (const kind of ['bay', 'chestnut', 'grey', 'black', 'dun']) assert.ok(kinds.has(kind), `a ${kind} coat`);
  assert.equal(horseCoat('#8a6a42', 1).type, 'dun');
  assert.equal(horseCoat('#d8d2c6', 1).type, 'grey', 'a near-white hide is a grey');
  assert.equal(horseCoat('#b8a888', 1).type, 'dun');
  assert.ok(horseCoat('#8a6a42', 1).stripe, 'a dun has a dorsal stripe');
  // Different seeds do not all give the same face and legs; the same seed always does.
  const looks = new Set();
  for (let seed = 1; seed <= 12; seed += 1) looks.add(JSON.stringify([horseCoat('#5a3a22', seed).blaze, horseCoat('#5a3a22', seed).socks]));
  assert.ok(looks.size > 3, 'markings vary with the seed');
  assert.deepEqual(horseCoat('#5a3a22', 5), horseCoat('#5a3a22', 5));
});

test('breeds look different: an Arabian is dished and carries its tail high, a destrier is heavier and feathered', () => {
  const arab = HORSE_BUILD.arabian;
  const destrier = HORSE_BUILD.destrier;
  assert.ok(arab.head.dish > 0 && destrier.head.dish < 0);
  assert.ok(arab.tail.carriage[0] < 0 && destrier.tail.carriage[0] > 0);
  assert.ok(destrier.bulk > arab.bulk && destrier.feather > 0 && arab.feather === 0);
  const feathered = buildHorseModel(spec('destrier', 'bare')).parts.legs.lFore.pastern.soft.triangles;
  const clean = buildHorseModel(spec('arabian', 'bare')).parts.legs.lFore.pastern.soft.triangles;
  assert.ok(feathered > clean, 'feathered fetlocks have more hair');
});

test('barding is drawn: plate and lamellar add steel to the head, neck and body; a bare horse has none', () => {
  const bare = buildHorseModel(spec('destrier', 'bare'));
  const plate = buildHorseModel(spec('destrier', 'plate'));
  const lamellar = buildHorseModel(spec('steppe', 'lamellar'));
  for (const part of ['head', 'neck', 'body']) {
    // (A bare horse's only steel is its bit's rings.)
    assert.ok((bare.parts[part].metal?.triangles ?? 0) < 300, `${part} bare`);
    assert.ok(plate.parts[part].metal.triangles > (bare.parts[part].metal?.triangles ?? 0) * 2, `${part} plate`);
    assert.ok(plate.parts[part].metal, `${part} in plate`);
    assert.ok(lamellar.parts[part].metal, `${part} in lamellar`);
  }
  // Lamellae are many small plates: far more triangles than the plate bard's few large ones.
  assert.ok(lamellar.parts.body.metal.triangles > plate.parts.body.metal.triangles * 2);
});

test('a hair chain follows its pin, keeps its links, and settles hanging', () => {
  const chain = hairChain(5, 0.1);
  const rest = new Float64Array(15);
  const lay = (x) => {
    for (let k = 0; k < 5; k += 1) rest.set([x - k * 0.1, 1, 0], k * 3);
  };
  lay(0);
  stepHair(chain, 1 / 60, rest, { stiff: [0, 50, 30, 20, 10] });
  for (let step = 0; step < 120; step += 1) {
    lay(step * 0.05);
    stepHair(chain, 1 / 60, rest, { stiff: [0, 50, 30, 20, 10] });
  }
  assert.ok(Math.abs(chain.p[0] - rest[0]) < 1e-9, 'the root is where it is pinned');
  for (let k = 1; k < 5; k += 1) {
    const d = Math.hypot(chain.p[k * 3] - chain.p[k * 3 - 3], chain.p[k * 3 + 1] - chain.p[k * 3 - 2], chain.p[k * 3 + 2] - chain.p[k * 3 - 1]);
    assert.ok(Math.abs(d - 0.1) < 1e-6, `link ${k}: ${d}`);
  }
  // Pulled along at 3 m/s it trails behind the pin, not ahead of it.
  assert.ok(chain.p[12] < chain.p[0]);
  // Left alone with nothing pulling it back it hangs: the tip below the root.
  const hanging = hairChain(5, 0.1);
  for (let step = 0; step < 300; step += 1) stepHair(hanging, 1 / 60, new Float64Array([0, 1, 0, 0.1, 1, 0, 0.2, 1, 0, 0.3, 1, 0, 0.4, 1, 0]), { stiff: [] });
  assert.ok(hanging.p[13] < 0.7, `tip at ${hanging.p[13]}`);
});
