// The bards (horsebard.js): who rides in which, the pieces each is made of, that they are drawn double-sided wearing their
// tiles, what they weigh and keep out by part, and that no piece is struck by the legs at any pace.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BARDING, HORSES, bardingAt, mountOf } from '../src/horses.js';
import { HORSE_BUILD, buildHorseModel, horseLegTable } from '../src/horsemesh.js';
import { HORSE_SHAPE, horsePoint, poseHorse } from '../src/physics/mounted.js';
import { PRESETS } from '../src/body.js';
import { mountedKnight } from '../src/cast.js';
import { DETAIL_ARMOUR } from '../src/detailmaps.js';
import { DETAIL_MAP_DATA } from '../src/detailmaps-data.js';

const model = (breed, barding, extra = {}) => buildHorseModel({ breed, barding, coat: HORSES[breed].coats[0], seed: 3, detail: 'full', withers: HORSES[breed].withers, corner: 'red', ...extra });

test('the knights in full plate ride in the plate bard, finished as their harness is; the Iron Pagoda and the khan\'s guard in lamellar, laced in their colour', () => {
  for (const key of ['knight', 'joan', 'maximilian']) assert.equal(mountOf(PRESETS[key]).barding, 'plate', key);
  assert.equal(mountOf({ ...PRESETS.knight, outfit: { kind: 'tournament', design: 0 } }).barding, 'plate', 'the tournament knight');
  assert.equal(mountOf(mountedKnight(() => 0.3)).barding, 'plate', 'the noble knight of cast.js');
  assert.equal(mountOf({ ...PRESETS.knight, outfit: { kind: 'knight', design: 0 } }).finish.style, 'fluted', 'a fluted harness, a fluted bard');
  assert.equal(mountOf({ ...PRESETS.knight, outfit: { kind: 'tournament', design: 0 } }).finish.style, 'etched');
  assert.equal(mountOf(PRESETS.ironPagoda).barding, 'lamellar');
  assert.equal(mountOf(PRESETS.saber).barding, 'lamellar', 'the khan\'s guard');
  const red = mountOf(PRESETS.ironPagoda).finish.lace;
  assert.ok(parseInt(red.slice(1, 3), 16) > 2 * parseInt(red.slice(3, 5), 16), `the Jin lacing red: ${red}`);
});

test('the plate bard has every piece of the surviving bards; the lamellar bard the Song pieces; a crowd\'s is lighter', () => {
  const plate = model('destrier', 'plate', { style: 'fluted' });
  for (const piece of ['shaffron', 'eyeGuards', 'earCups', 'brow', 'plume', 'crinet', 'mail', 'peytral', 'bosses', 'flanchards', 'crupper']) assert.ok(plate.bard.pieces[piece] > 0, piece);
  // Each part carries its pieces: the shaffron on the head, the crinet on the neck, the rest on the body.
  assert.ok(plate.parts.head.detail.fluted && plate.parts.neck.detail.fluted && plate.parts.neck.detail.mail && plate.parts.body.detail.fluted);
  assert.ok(plate.parts.body.detail.harnessEdge, 'turned and roped edges');
  for (const geometry of [plate.parts.body.detail.fluted, plate.parts.neck.detail.mail]) assert.equal(geometry.uvs.length, (geometry.positions.length / 3) * 2);
  const lamellar = model('steppe', 'lamellar');
  for (const piece of ['face', 'crinet', 'peytral', 'skirt', 'crupper']) assert.ok(lamellar.bard.pieces[piece] > 0, piece);
  assert.ok(lamellar.parts.body.detail.lamellae && lamellar.parts.neck.detail.lamellae && lamellar.parts.head.detail.munitionPlate);
  // Under a bard the mane is hidden by the crinet.
  assert.ok(plate.rig.maneHidden && lamellar.rig.maneHidden && !model('arabian', 'bare').rig.maneHidden);
  // Triangles: a few thousand for the whole bard, a fifth of that for a crowd's horse.
  for (const [breed, barding] of [['destrier', 'plate'], ['steppe', 'lamellar']]) {
    const full = Object.values(model(breed, barding).bard.pieces).reduce((a, b) => a + b, 0);
    const low = Object.values(model(breed, barding, { detail: 'low' }).bard.pieces).reduce((a, b) => a + b, 0);
    assert.ok(full > 2500 && full < 6000, `${barding} full: ${full}`);
    assert.ok(low < full * 0.3, `${barding} low: ${low} of ${full}`);
  }
});

test('the bards wear baked tiles that exist, and are drawn double-sided', () => {
  for (const tile of ['fluted', 'etched', 'plate', 'harnessEdge', 'mail', 'lamellae', 'munitionPlate']) {
    assert.ok(DETAIL_ARMOUR[tile] && DETAIL_MAP_DATA[tile], tile);
  }
  for (const style of ['fluted', 'etched', 'plain']) {
    const tiles = Object.keys(model('destrier', 'plate', { style }).parts.body.detail);
    assert.ok(tiles.includes({ fluted: 'fluted', etched: 'etched', plain: 'plate' }[style]), `${style}: ${tiles}`);
  }
  const view = readFileSync(new URL('../src/horseview.js', import.meta.url), 'utf8');
  assert.match(view, /doubleSided\(armourDetailMaterial\(base, tile/);
  assert.match(view, /metal: doubleSided\(steelMaterial\(/);
});

test('mass and protection by part: a bard of 30-45 kg; plate turns an edge where it covers, the legs and below the peytral\'s hem bare', () => {
  assert.ok(BARDING.plate.mass >= 30 && BARDING.plate.mass <= 45);
  assert.ok(BARDING.lamellar.mass >= 25 && BARDING.lamellar.mass <= 40);
  for (const barding of ['plate', 'lamellar']) {
    for (const part of ['head', 'neck', 'chest', 'body']) assert.ok(BARDING[barding].parts[part].cut > 0.8, `${barding} ${part}`);
    assert.equal(BARDING[barding].parts.legs.cut, 0);
  }
  // The crinet's mail under the throat lets a point through more than the peytral's plate.
  assert.ok(BARDING.plate.parts.neck.pierce < BARDING.plate.parts.chest.pierce);
  // Struck on the breast the peytral takes it; under its hem (between the forelegs) the horse is bare.
  assert.equal(bardingAt('plate', 'chest', 0.75 * 1.58, 1.58).cut, 1);
  assert.equal(bardingAt('plate', 'chest', 0.5 * 1.58, 1.58).cut, 0);
  assert.equal(bardingAt('plate', 'chest').cut, 1);
  // The lamellar skirt hangs below the belly: no bare band.
  assert.equal(bardingAt('lamellar', 'body', 0.5 * 1.34, 1.34).cut, BARDING.lamellar.parts.body.cut);
});

/** A leg's drawn segments at a moment, in the horse's own frame (units of the withers): [from, to, radii(s)] each. */
function legSegments(horse, build) {
  const W = horse.withers;
  // The body is drawn turned by the stride's pitch and rock about its pivot (horseview.js), and so are the legs (horsePoint):
  // undo that turn, which is affine, by reading it off three points.
  const origin = horsePoint(horse, [0, 0, 0]);
  const axes = [[W, 0, 0], [0, W, 0], [0, 0, W]].map((p) => horsePoint(horse, p).map((v, k) => (v - origin[k]) / W));
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const A = [[axes[0][0], axes[1][0], axes[2][0]], [axes[0][1], axes[1][1], axes[2][1]], [axes[0][2], axes[1][2], axes[2][2]]];
  const local = (world) => {
    const b = world.map((v, k) => v - origin[k]);
    const D = det(A);
    const solve = (col) => det(A.map((row, r) => row.map((v, c) => (c === col ? b[r] : v)))) / D;
    return [solve(0) / W, solve(1) / W, solve(2) / W];
  };
  const out = [];
  for (const leg of HORSE_SHAPE.legs) {
    const at = horse.legs[leg.key];
    const scale = build.legs * (leg.fore ? 1 : 1.04);
    const table = horseLegTable(leg.fore);
    out.push({ key: leg.key, a: local(at.root), b: local(at.knee), rows: table.upper, scale });
    out.push({ key: leg.key, a: local(at.knee), b: local(at.hoof), rows: table.cannon, scale });
  }
  return out;
}

const sectionAt = (rows, t) => {
  let k = 0;
  while (k < rows.length - 2 && t > rows[k + 1][0]) k += 1;
  const [t0, ...a] = rows[k];
  const [t1, ...b] = rows[k + 1];
  const f = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
  return a.map((v, i) => v + (b[i] - v) * f);
};

/** How far into the drawn leg a point goes (> 0 inside): the leg an elliptic tube, half-width across, front-to-back in its plane. */
function intrusion(point, segment) {
  const d = segment.b.map((v, k) => v - segment.a[k]);
  const length = Math.hypot(...d);
  const along = ((point[0] - segment.a[0]) * d[0] + (point[1] - segment.a[1]) * d[1] + (point[2] - segment.a[2]) * d[2]) / (length * length);
  if (along < 0 || along > 1) return -1;
  const [front, back, half] = sectionAt(segment.rows, along).map((v) => v * segment.scale);
  const foot = segment.a.map((v, k) => v + d[k] * along);
  const across = Math.abs(point[2] - foot[2]);
  const inPlane = Math.hypot(point[0] - foot[0], point[1] - foot[1]);
  return 1 - Math.hypot(across / half, inPlane / Math.max(front, back));
}

test('no piece of a bard is struck by the legs at a walk, trot, canter or gallop (the legs swept through their strides)', () => {
  for (const [breed, barding] of [['destrier', 'plate'], ['warhorse', 'plate'], ['steppe', 'lamellar'], ['arabian', 'lamellar']]) {
    const built = model(breed, barding);
    const build = HORSE_BUILD[breed];
    const W = HORSES[breed].withers;
    const pts = built.bard.points.body;
    let worst = { depth: -Infinity };
    for (const speed of [1.5, 3.5, 6.5, 10, HORSES[breed].gallop]) {
      for (let stride = 0; stride < 1; stride += 1 / 48) {
        const horse = { withers: W, at: [0, 0], yaw: 0, speed, stride, state: 'up', capsules: [], legs: {}, shape: HORSE_SHAPE, paces: { gallop: HORSES[breed].gallop } };
        poseHorse(horse);
        const segments = legSegments(horse, build);
        for (let v = 0; v < pts.length; v += 3) {
          const p = [pts[v], pts[v + 1], pts[v + 2]];
          // (Only what hangs where the legs go: under the barrel's line.)
          if (p[1] > 0.78) continue;
          for (const segment of segments) {
            const depth = intrusion(p, segment);
            if (depth > worst.depth) worst = { depth, p, speed, stride, leg: segment.key };
          }
        }
      }
    }
    assert.ok(worst.depth < 0, `${breed} ${barding}: a leg (${worst.leg}) into the bard at ${worst.p?.map((v) => v.toFixed(3))}, ${worst.speed} m/s, stride ${worst.stride?.toFixed(2)}: ${worst.depth.toFixed(3)}`);
  }
});
