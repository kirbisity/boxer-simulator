import test from 'node:test';
import assert from 'node:assert/strict';
import { OUTFITS } from '../src/outfits.js';
import { headRadiusAt, HELM_SPAN } from '../src/helmforms.js';
import { CHINA_FINISHES, finialTop, HAN_HOOD, HONGYING_MOUNTS, MING_HELMS, shellGrid, shellRadius, swingStep, tasselStrands, TASSELS } from '../src/chinahelms.js';

const DESIGNS = { ...MING_HELMS, hanHood: HAN_HOOD };

/** The vertices of a grid as [x, y, z]. */
const points = ({ positions }) => Array.from({ length: positions.length / 3 }, (_, i) => positions.slice(i * 3, i * 3 + 3));

test('every Ming brigandine design wears one of the four helmets, in a finish; all four appear, raw steel and red 勇 among them', () => {
  const heads = OUTFITS.mingBrigandine.designs.map((design) => design.head);
  for (const head of heads) {
    assert.equal(head.kind, 'mingHat');
    assert.ok(MING_HELMS[head.design], `${head.design} is a design`);
    assert.ok(CHINA_FINISHES[head.finish], `${head.finish} is a finish`);
  }
  assert.deepEqual(new Set(heads.map((head) => head.design)), new Set(Object.keys(MING_HELMS)));
  assert.equal(Object.keys(MING_HELMS).length, 4);
  assert.ok(heads.some((head) => head.finish === 'steel'), 'a raw steel helmet');
  assert.ok(heads.some((head) => head.finish === 'red' && MING_HELMS[head.design].glyph === '勇'), 'a red helmet with 勇');
  assert.ok(CHINA_FINISHES.red.glyph, 'the red finish paints the glyph');
});

test('the helmets are symmetric side to side', () => {
  for (const [name, design] of Object.entries(DESIGNS)) {
    const keys = new Set(points(shellGrid(design)).map(([x, y, z]) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`));
    for (const key of keys) {
      const [x, y, z] = key.split(',').map(Number);
      assert.ok(keys.has(`${x.toFixed(4)},${y.toFixed(4)},${(-z === 0 ? 0 : -z).toFixed(4)}`), `${name}: (${key}) mirrored`);
    }
  }
});

test('the helmets fit over the head with a lining between, longer than broad', () => {
  for (const [name, design] of Object.entries(DESIGNS)) {
    let long = 0;
    let broad = 0;
    for (const [x, y, z] of points(shellGrid(design))) {
      const theta = Math.atan2(z, x);
      if (y > -1.25 && y < 1.05) assert.ok(Math.hypot(x, z) >= headRadiusAt(theta, y) + design.gap * 0.9, `${name}: clear of the head at y ${y.toFixed(2)}, θ ${theta.toFixed(2)}`);
      if (y > 0) {
        long = Math.max(long, Math.abs(x));
        broad = Math.max(broad, Math.abs(z));
      }
    }
    assert.ok(long > broad * 1.1, `${name}: ${long.toFixed(2)} long, ${broad.toFixed(2)} broad`);
  }
});

test('the Han hood is narrower than the old helmet and leaves the face open below the brow', () => {
  // The old hood: a round cap of 1.2 head radii, its curtain to 1.56 (wardrobe.js HAN_HELM, before).
  const half = Math.max(...points(shellGrid(HAN_HOOD)).filter(([, y]) => y > -0.2).map(([, , z]) => Math.abs(z)));
  assert.ok(half < 1.0 && half < 1.2 * 0.85, `half-breadth ${half.toFixed(2)}`);
  // Nothing of the shell in front of the eyes and the mouth.
  for (const [x, y, z] of points(shellGrid(HAN_HOOD))) assert.ok(!(y < 0 && y > -1 && x > 0.7 && Math.abs(z) < 0.35), `shell over the face at ${[x, y, z].map((v) => v.toFixed(2))}`);
});

test('the Ming elite helmet is drawn a little narrower side to side, its height and length kept', () => {
  const [length, height, side] = HELM_SPAN.mingHelm;
  assert.equal(length, 1);
  assert.equal(height, 1);
  assert.ok(side >= 0.92 && side <= 0.96);
});

test('each tassel and plume is bound at its finial or spike, and hangs clear of the helmet at rest', () => {
  for (const [name, design] of Object.entries(DESIGNS)) {
    if (!design.plume) continue;
    assert.ok(TASSELS[design.plume], `${name}: ${design.plume}`);
    const top = design.profile.at(-1)[0];
    const bind = finialTop(design) - 0.03;
    assert.ok(bind > top && bind <= finialTop(design), `${name}: bound in its tube's mouth`);
  }
  for (const [kind, mount] of Object.entries(HONGYING_MOUNTS)) {
    assert.ok(mount.top > mount.spike[0] && mount.top < mount.spike[1], `${kind}: bound on the spike`);
    const strands = tasselStrands({ ...TASSELS.hongying, length: mount.length });
    // Its roots at the binding; at rest it hangs down.
    for (let i = 0; i < strands.weights.length; i += 1) {
      if (strands.weights[i] === 0) assert.ok(Math.hypot(strands.positions[i * 3], strands.positions[i * 3 + 2]) < 0.12, `${kind}: rooted at the spike`);
    }
    assert.ok(strands.rest[1] < -0.9, `${kind}: hangs down`);
    // Not inside the bowl where it falls over it.
    for (let i = 0; i < strands.positions.length; i += 3) {
      const y = strands.positions[i + 1] + mount.top;
      const radius = Math.hypot(strands.positions[i], strands.positions[i + 2]);
      const [low] = mount.hull[0];
      if (y > low && y < 2.1 && kind === 'mingHelm') assert.ok(radius > 0.15, `${kind}: clear of the bowl at ${y.toFixed(2)}`);
    }
  }
});

test('a tassel swings after the head: left behind as it sets off, swinging back and settling when it stops', () => {
  const spec = TASSELS.hongying;
  const length = 0.08;
  let state = swingStep(null, { pivot: [0, 1.8, 0], target: [0, -1, 0], length, ...spec }, 0);
  const run = (seconds, speedAt, dt = 1 / 60) => {
    const turns = [];
    for (let t = 0; t < seconds; t += dt) {
      const pivot = state.pivot.map((value, axis) => value + (axis === 0 ? speedAt(t) * dt : 0));
      state = swingStep(state, { pivot, target: [0, -1, 0], length, stiffness: spec.stiffness, damping: spec.damping }, dt);
      turns.push((state.tip[0] - pivot[0]) / length);
    }
    return turns;
  };
  // Setting off forward (+x) at 5 m/s² to a run of 5 m/s: the tip lags behind (−x).
  const start = run(1, (t) => Math.min(5, 5 * t));
  assert.ok(Math.min(...start.slice(0, 40)) < -0.03, `left behind: ${Math.min(...start).toFixed(3)}`);
  // Stopping dead: it swings forward past rest, then settles within two seconds.
  const stop = run(3, () => 0);
  assert.ok(Math.max(...stop.slice(0, 30)) > 0.03, `swings on: ${Math.max(...stop).toFixed(3)}`);
  assert.ok(Math.abs(stop.at(-1)) < 0.01, `settled: ${stop.at(-1).toFixed(4)}`);
  // Rates per second: the same motion at 30 and 144 frames a second.
  const at = (dt) => {
    let s = swingStep(null, { pivot: [0, 0, 0], target: [0, -1, 0], length, ...spec }, 0);
    for (let t = 0; t < 0.5 - 1e-9; t += dt) s = swingStep(s, { pivot: [Math.min(t + dt, 0.25) * 2, 0, 0], target: [0, -1, 0], length, stiffness: spec.stiffness, damping: spec.damping }, dt);
    return s.tip[0] - s.pivot[0];
  };
  assert.ok(Math.abs(at(1 / 30) - at(1 / 144)) < 0.004, `${at(1 / 30).toFixed(4)} vs ${at(1 / 144).toFixed(4)}`);
  // Paused (no time): it does not move.
  const held = JSON.stringify(state);
  swingStep(state, { pivot: [5, 5, 5], target: [0, -1, 0], length, ...spec }, 0);
  assert.equal(JSON.stringify(state), held);
});

test('the shell is the head fit where the head is broader than the design', () => {
  // Low on the hood, at the sides, the jaw and ears push it out: never inside the head and its lining.
  for (const theta of [Math.PI / 2, Math.PI * 0.75]) for (const y of [-0.9, -0.3, 0.1]) assert.ok(shellRadius(HAN_HOOD, theta, y) >= headRadiusAt(theta, y) + HAN_HOOD.gap * 0.95);
});
