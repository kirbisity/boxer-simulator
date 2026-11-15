// The story's places that are walked (src/places, built with src/townkit): the kit's makers give finite geometry and
// solids, and each place can be walked from where a man comes in to where the battle musters and to where he stands
// after it, with nothing standing in the battle's court.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain, floorAt, pushOut } from '../src/physics/terrain.js';
import { reliefAt, worksOf } from '../src/physics/fieldworks.js';
import { storyNewLife } from '../src/story/life.js';
import { PYONGYANG_1593 } from '../src/story/battles/03-pyongyang.js';
import { wokouBattle } from '../src/story/battles/02-wokou.js';
import { pyongyangBattle } from '../src/story/battles/03-pyongyang.js';

// (The kit's modules name THREE only inside the functions that make meshes: none is called here.)
globalThis.THREE ??= {};
const { tkgBuilder, tkgFrame, tkgRoof, tkgVault, tkgWall } = await import('../src/townkit/geo.js');
const { tkHouse, tkRow, tkTree, tkArchBridge, tkArchBridgeSolids, tkLaneGateSolids } = await import('../src/townkit/build.js');
const { tkGatehouse, tkGatehouseSolids, tkPavilion, tkPavilionSolids, tkRampart, tkRampartSolids, tkRock, tkWorksStair, tkWorksStairSolid } = await import('../src/townkit/works.js');
const { CANAL_TOWN, canalTownSolids } = await import('../src/places/canaltown.js');
const { PYONGYANG_PLACE, pyongyangGround, pyongyangSolids } = await import('../src/places/pyongyang.js');
const { STORY_MUSTER_RADIUS, STORY_PLACES, storyPlaceWeather } = await import('../src/places/storyplaces.js');

/** Every number anywhere in `value` (arrays, typed arrays, objects), given to `each`. */
function numbersIn(value, each, depth = 0) {
  if (typeof value === 'number') each(value);
  else if (ArrayBuffer.isView(value)) for (const v of value) each(v);
  else if (value && typeof value === 'object' && depth < 8) for (const inner of Array.isArray(value) ? value : Object.values(value)) numbersIn(inner, each, depth + 1);
}

/** The triangles a builder holds, all finite, and how many. */
function finiteTriangles(builder, what) {
  let corners = 0;
  for (const batch of builder.batches()) {
    for (const key of ['position', 'normal', 'uv', 'colour']) for (const v of batch[key]) assert.ok(Number.isFinite(v), `${what}: ${batch.material} ${key} holds ${v}`);
    assert.equal(batch.position.length % 9, 0, `${what}: ${batch.material} is whole triangles`);
    assert.equal(batch.normal.length, batch.position.length, `${what}: a normal for every corner`);
    corners += batch.position.length / 3;
  }
  assert.ok(corners > 0, `${what} made something`);
  return corners / 3;
}

const finiteSolids = (solids, what) => {
  assert.ok(solids.length > 0, `${what} has solids`);
  // (A solid with no floor of its own says so with an infinite bottom or top: only NaN is a fault.)
  numbersIn(solids, (v) => assert.ok(!Number.isNaN(v), `${what} holds NaN`));
};

// ---- The makers ----------------------------------------------------------------------------------------------------------

test('the kit\'s makers lay whole, finite triangles', () => {
  const frame = tkgFrame(3, 0.5, -2, 0.4);
  for (const kind of ['gable', 'hip', 'hipgable', 'skirt', 'lean']) {
    const builder = tkgBuilder();
    tkgRoof(builder, frame, { kind, width: 10, depth: 6, eave: 5, rise: 2.2, sag: 0.3, lift: 0.4, inner: [7, 3.5] });
    finiteTriangles(builder, `a ${kind} roof`);
  }
  const made = {
    wall: (b) => tkgWall(b, frame, { material: 'brick', x0: -5, x1: 5, y0: 0, y1: 5, openings: [{ x: 0, width: 2, sill: 0, head: 2, arch: 1 }, { x: 3, width: 1, sill: 1, head: 2 }] }),
    house: (b) => tkHouse(b, tkRow({ from: [0, 0], to: [30, 0], seed: 4 })[0]),
    tree: (b) => { for (const kind of ['broad', 'willow', 'bare', 'pine']) tkTree(b, 0, 0, 0, { kind, seed: 3 }); },
    bridge: (b) => tkArchBridge(b, { at: [0, 15], span: 7, high: 1.9, flat: 2.6, water: -1.25 }),
    rampart: (b) => tkRampart(b, [[0, 0, 0, 4.5], [0, 30, 2, 6.5], [10, 50, 2, 6.5]], { gaps: [[5, 0.9]] }),
    gatehouse: (b) => tkGatehouse(b, frame, { wide: 20, deep: 10.5, high: 6.5 }),
    stair: (b) => tkWorksStair(b, [0, 0], [0, 9], 0, 4.5),
    pavilion: (b) => tkPavilion(b, frame, { storeys: PYONGYANG_PLACE.pavilion }),
    rock: (b) => tkRock(b, 0, 0, 0, { size: 2, seed: 9 }),
  };
  for (const [what, make] of Object.entries(made)) {
    const builder = tkgBuilder();
    make(builder);
    finiteTriangles(builder, `a ${what}`);
  }
});

test('a vault is seen from inside it: its soffit faces down', () => {
  const builder = tkgBuilder();
  tkgVault(builder, tkgFrame(0, 0, 0, 0), { material: 'ashlar', width: 4, spring: 2.6, rise: 2, z0: -5, z1: 0 });
  let crown = 0;
  for (const batch of builder.batches()) {
    for (let i = 0; i < batch.position.length; i += 9) {
      const high = Math.min(batch.position[i + 1], batch.position[i + 4], batch.position[i + 7]);
      // (The crown's panels: the top fifth of the rise.)
      if (high < 2.6 + 2 * 0.8) continue;
      crown += 1;
      assert.ok(batch.normal[i + 1] < -0.5, `a crown panel's normal points down (${batch.normal[i + 1]})`);
    }
  }
  assert.ok(crown > 0, 'the vault has a crown');
});

test('the works\' solids are finite and stand where they are drawn', () => {
  const nodes = [[0, 0, 0, 4.5], [0, 30, 2, 6.5]];
  finiteSolids(tkRampartSolids(nodes), 'a rampart');
  finiteSolids(tkGatehouseSolids(tkgFrame(0, 0, 0, 0), { wide: 20, deep: 10.5, high: 6.5 }), 'a gatehouse');
  finiteSolids([tkWorksStairSolid([0, 0], [0, 9], 0, 4.5)].flat(), 'a stair');
  finiteSolids(tkPavilionSolids(tkgFrame(0, 0, 0, 0), { storeys: PYONGYANG_PLACE.pavilion }, 6.5), 'a pavilion');
  finiteSolids(tkArchBridgeSolids({ at: [0, 15], span: 7, high: 1.9, flat: 2.6 }), 'a bridge');
  finiteSolids(tkLaneGateSolids([0, 0], [4, 0]), 'a lane gate');
  // The rampart's walk is a floor at its top, the gatehouse's passage a way through at the ground.
  const rampart = createTerrain(tkRampartSolids(nodes));
  assert.ok(Math.abs(floorAt(rampart, 2.2, 1) - 4.5) < 0.2, `the walk is the wall's top at its low end (${floorAt(rampart, 2.2, 1)})`);
  const gate = createTerrain(tkGatehouseSolids(tkgFrame(0, 0, 0, 0), { wide: 20, deep: 10.5, high: 6.5 }));
  assert.equal(pushOut(gate, [0, -5], 0.3, 0, 1.7), false, 'the passage is open at its middle');
  assert.equal(pushOut(gate, [6, -5], 0.3, 0, 1.7), true, 'the masonry beside the passage is solid');
});

// ---- The places ----------------------------------------------------------------------------------------------------------

/** Whether a man can stand at (x, z) on a floor near `y`: the floor there, or null (no floor, or a wall where he would be). */
function standing(terrain, x, z, y) {
  const floor = floorAt(terrain, x, z, y + 0.6);
  if (!Number.isFinite(floor) || floor < y - 0.6) return null;
  // (pushOut says whether a solid moved him.)
  return pushOut(terrain, [x, z], 0.3, floor, floor + 1.7) ? null : floor;
}

/** The floors reached on foot from `from` ([x, y, z]) over a grid of `step` m, as a map 'i,j' -> floor. */
function reached(terrain, from, step, bounds) {
  const key = (x, z) => `${Math.round(x / step)},${Math.round(z / step)}`;
  const seen = new Map([[key(from[0], from[2]), from[1]]]);
  const queue = [[Math.round(from[0] / step) * step, Math.round(from[2] / step) * step, from[1]]];
  while (queue.length) {
    const [x, z, y] = queue.pop();
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const [nx, nz] = [x + dx, z + dz];
      if (Math.abs(nx) > bounds[0] || Math.abs(nz) > bounds[1] || seen.has(key(nx, nz))) continue;
      const floor = standing(terrain, nx, nz, y);
      if (floor === null) continue;
      seen.set(key(nx, nz), floor);
      queue.push([nx, nz, floor]);
    }
  }
  return { at: (x, z) => seen.get(key(x, z)), size: seen.size };
}

// Each place's solids, where a man comes in, the bounds the walk must stay within (half sizes, m) and the battle's own
// court (the old battleground: half sizes, m).
const PLACES = {
  canaltown: { solids: canalTownSolids, start: CANAL_TOWN.start.at, bounds: [160, 60], court: CANAL_TOWN.court, step: 0.5 },
  // (Pyongyang's walk runs over the river to its far bank: its grid is coarser, for time.)
  pyongyang: { solids: pyongyangSolids, start: PYONGYANG_PLACE.start.at, bounds: [170, PYONGYANG_PLACE.river.field.to + 20], court: PYONGYANG_1593.arena, step: 1 },
};

for (const [key, entry] of Object.entries(STORY_PLACES)) {
  test(`${key}: a man stands at its start, its muster point and where he is after the battle, and walks between them`, () => {
    const place = PLACES[key];
    const solids = place.solids();
    finiteSolids(solids, key);
    const terrain = createTerrain(solids);
    const stage = entry.stage();
    assert.deepEqual(stage.start.at, place.start);
    const points = { start: stage.start.at, muster: entry.muster, ...(entry.after ? { after: entry.after.at } : {}) };
    for (const [name, at] of Object.entries(points)) {
      const floor = standing(terrain, at[0], at[2], at[1]);
      assert.ok(floor !== null && Math.abs(floor - at[1]) < 0.3, `${name} [${at}] is on a floor at its height (${floor})`);
    }
    // The muster ring is clear ground all round.
    for (let k = 0; k < 8; k += 1) {
      const [x, z] = [entry.muster[0] + Math.cos(k * Math.PI / 4) * STORY_MUSTER_RADIUS, entry.muster[2] + Math.sin(k * Math.PI / 4) * STORY_MUSTER_RADIUS];
      assert.ok(standing(terrain, x, z, entry.muster[1]) !== null, `the ring's edge at [${x.toFixed(1)}, ${z.toFixed(1)}] is clear`);
    }
    const walk = reached(terrain, stage.start.at, place.step, place.bounds);
    for (const [name, at] of Object.entries(points)) {
      const floor = walk.at(at[0], at[2]);
      assert.ok(floor !== undefined && Math.abs(floor - at[1]) < 0.4, `${name} is reached on foot from the start (${floor})`);
    }
    // The ground that can be walked (lanes, quays, streets, fields: the houses and the water are not counted) is at least
    // three times the battle's court, and the walk stays inside the place (nothing reached at the bounds given).
    const court = 4 * place.court.halfX * place.court.halfZ;
    assert.ok(walk.size * place.step * place.step > 3 * court, `${walk.size * place.step * place.step} m2 is walked, the court being ${court} m2`);
    for (let x = -place.bounds[0]; x <= place.bounds[0]; x += 0.5) {
      for (const z of [-place.bounds[1], place.bounds[1]]) assert.equal(walk.at(x, z), undefined, `the walk does not reach the bound at [${x}, ${z}]`);
    }
    for (let z = -place.bounds[1]; z <= place.bounds[1]; z += 0.5) {
      for (const x of [-place.bounds[0], place.bounds[0]]) assert.equal(walk.at(x, z), undefined, `the walk does not reach the bound at [${x}, ${z}]`);
    }
  });
}

test('canaltown: the battle\'s court is clear, level paving', () => {
  const terrain = createTerrain(canalTownSolids());
  const { halfX, halfZ } = CANAL_TOWN.court;
  for (let x = -halfX; x <= halfX; x += 1) {
    for (let z = -halfZ; z <= halfZ; z += 1) assert.equal(standing(terrain, x, z, 0), 0, `the court at [${x}, ${z}] is clear and level`);
  }
  assert.equal(wokouBattle.view.roam, 'canaltown');
});

test('pyongyang: the place draws the wall the battle is fought on, and its ground is the battle\'s', () => {
  // The battle's own wall (story/battles/03-pyongyang.js) and the place's are the same wall.
  assert.equal(PYONGYANG_PLACE.wall.x, PYONGYANG_1593.wall.x);
  assert.equal(PYONGYANG_PLACE.wall.high, PYONGYANG_1593.wall.height);
  assert.deepEqual(PYONGYANG_PLACE.wall.ladders, PYONGYANG_1593.wall.ladders);
  assert.equal(pyongyangBattle.view.roam, 'pyongyang');
  const terrain = createTerrain(pyongyangSolids());
  // The strip the columns cross, from behind the form-up line to the wall's foot: the land as it lies, clear, and the
  // battle's physics stands on the ground the place draws (fieldworks `ground`), walked or fought on alike.
  const { halfX, halfZ } = PYONGYANG_1593.arena;
  const battle = pyongyangBattle.setup(storyNewLife(1), 1);
  const works = worksOf(battle.options.arena);
  let [stripLow, stripHigh] = [Infinity, -Infinity];
  for (let x = -halfX; x <= PYONGYANG_PLACE.wall.x - 1.5; x += 1) {
    for (let z = -halfZ; z <= halfZ; z += 1) {
      const drawn = pyongyangGround(x, z);
      [stripLow, stripHigh] = [Math.min(stripLow, drawn), Math.max(stripHigh, drawn)];
      assert.ok(Math.abs(reliefAt(works, x, z) - drawn) < 1e-6, `the battle's ground at [${x}, ${z}] is the drawn ground`);
      assert.ok(Math.abs((standing(terrain, x, z, drawn) ?? 99) - drawn) < 1e-6, `the strip at [${x}, ${z}] is clear, on the drawn ground`);
    }
  }
  assert.ok(stripHigh - stripLow > 0.5, `the strip is not levelled (${stripLow.toFixed(2)} to ${stripHigh.toFixed(2)} m)`);
  assert.ok(Math.abs(pyongyangGround(PYONGYANG_PLACE.wall.x, 0)) < 1e-6, 'the berm at the wall\'s foot is at the foot\'s level');
  // The wall bars the way at the ground and carries a walk at its top.
  const wall = PYONGYANG_PLACE.wall;
  for (const z of wall.ladders) {
    assert.equal(standing(terrain, wall.x + 0.2, z, 0), null, 'the wall is solid at a ladder\'s foot');
    assert.ok(Math.abs(standing(terrain, wall.x + 2.2, z, wall.high) - wall.high) < 0.05, 'the walk is at the wall\'s height behind a ladder');
  }
  // Away from the strip the ground rises and falls.
  let [low, high] = [Infinity, -Infinity];
  for (let x = -140; x <= -10; x += 5) for (let z = -120; z <= 120; z += 5) { const y = pyongyangGround(x, z); low = Math.min(low, y); high = Math.max(high, y); }
  assert.ok(high - low > 6, `the country outside has relief (${low.toFixed(1)} to ${high.toFixed(1)} m)`);
});

test('a place\'s weather on a day is one of its own, whatever the draw', () => {
  for (const [key, entry] of Object.entries(STORY_PLACES)) {
    const met = new Set();
    for (let roll = 0; roll < 1; roll += 0.01) {
      const weather = storyPlaceWeather(key, roll);
      assert.ok(weather.name in entry.weathers, `${key} ${weather.name}`);
      for (const part of ['wet', 'snow', 'rain']) assert.ok(weather[part] >= 0 && weather[part] <= 1, `${key} ${weather.name} ${part} ${weather[part]}`);
      met.add(weather.name);
    }
    assert.deepEqual([...met].sort(), Object.keys(entry.odds).sort(), `${key} meets each of its weathers`);
  }
  // Jiangnan: wet stone more days than dry.
  const wet = Array.from({ length: 100 }, (_, k) => storyPlaceWeather('canaltown', k / 100)).filter((weather) => weather.wet > 0.3).length;
  assert.ok(wet > 50, `the water town is wet on most days (${wet} in 100)`);
});

test('pyongyang: the frozen river is reached on foot, the feet on the drawn bank and ice the whole way, and bounded past its far bank', () => {
  const terrain = createTerrain(pyongyangSolids());
  const { river } = PYONGYANG_PLACE;
  for (const x of [-120, -60, -10]) {
    let y = pyongyangGround(x, 100);
    let lowest = Infinity;
    let z = 100;
    for (; z <= river.field.to + 10; z += 0.5) {
      const floor = standing(terrain, x, z, y);
      if (floor === null) break;
      assert.ok(Math.abs(floor - pyongyangGround(x, z)) < 0.02, `at [${x}, ${z}] the feet stand on the drawn ground (${floor.toFixed(3)} against ${pyongyangGround(x, z).toFixed(3)})`);
      y = floor;
      lowest = Math.min(lowest, floor);
    }
    assert.ok(z > river.z[3], `from [${x}, 100] the walk goes over the river and up its far bank (stopped at z ${z})`);
    assert.ok(z < river.field.to, `and is bounded before the field's end (z ${z})`);
    assert.ok(Math.abs(lowest - river.ice) < 0.05, `on the way it is on the ice (${lowest.toFixed(2)} m)`);
  }
});
