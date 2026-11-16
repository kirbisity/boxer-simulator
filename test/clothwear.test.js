// Whole-garment wear (clothwear.js): every outfit has a station, a peasant's clothes wear more than a noble's and court
// clothes hardly at all, and on a built body the mud sits low, the sweat under the arms, the skin and steel untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS, buildBody } from '../src/body.js';
import { buildLoftBody } from '../src/loftbody.js';
import { OUTFITS } from '../src/outfits.js';
import { OUTFIT_STATION, STATION_WEAR, clothWearOf, drapeWear, wearCloth } from '../src/clothwear.js';

test('every outfit has a known station, and the stations are ordered', () => {
  for (const kind of Object.keys(OUTFITS)) {
    const station = OUTFIT_STATION[kind];
    assert.ok(station, `${kind} has no station`);
    for (const named of [station].flat()) assert.ok(named in STATION_WEAR, `${kind}: ${named}`);
  }
  assert.ok(clothWearOf({ kind: 'rags' }) > clothWearOf({ kind: 'commoner' }));
  assert.ok(clothWearOf({ kind: 'commoner' }) > clothWearOf({ kind: 'ashigaru' }));
  assert.ok(clothWearOf({ kind: 'ashigaru' }) > clothWearOf({ kind: 'knight' }));
  assert.ok(clothWearOf({ kind: 'knight' }) > clothWearOf({ kind: 'gothNoble' }));
  assert.ok(clothWearOf({ kind: 'gothNoble' }) > clothWearOf({ kind: 'tournament' }));
  assert.equal(clothWearOf({ kind: 'incaNoble', design: 4 }), STATION_WEAR.parade);
  assert.equal(clothWearOf({ kind: 'combatBot' }), 0);
});

test('a peasant body: soiled low, sweat under the arms, skin unchanged, nothing when clean', () => {
  const inputs = { ...structuredClone(PRESETS.light), outfit: { kind: 'commoner', design: 0 } };
  const built = buildLoftBody(buildBody(inputs), { lowDetail: true });
  const plain = new Float32Array(built.positions.length).fill(0.7);
  const worn = wearCloth(plain.slice(), built, clothWearOf(inputs.outfit), P);
  assert.deepEqual(wearCloth(plain.slice(), built, 0, P), plain);
  const shade = (vertex) => worn[vertex * 3] + worn[vertex * 3 + 1] + worn[vertex * 3 + 2];
  const mean = (pick) => {
    const chosen = built.regions.map((region, vertex) => (pick(region, vertex) ? shade(vertex) : null)).filter((value) => value !== null);
    return chosen.reduce((sum, value) => sum + value, 0) / chosen.length;
  };
  const y = (vertex) => built.positions[vertex * 3 + 1];
  const cloth = (region) => region === 'kit' || region === 'top';
  built.regions.forEach((region, vertex) => {
    if (region === 'skin') assert.deepEqual([...worn.slice(vertex * 3, vertex * 3 + 3)], [...plain.slice(vertex * 3, vertex * 3 + 3)], 'skin worn');
  });
  const shins = mean((region, vertex) => cloth(region) && y(vertex) < 0.3);
  const chest = mean((region, vertex) => cloth(region) && y(vertex) > 1.1 && y(vertex) < 1.2);
  assert.ok(shins < chest - 0.2, `shins ${shins} chest ${chest}`);
});

test('a hung mantle: muddier at the hem than at the top, white where the wear is nil', () => {
  const base = () => ({ r: 0.9, g: 0.9, b: 0.9 });
  const worn = drapeWear({ rows: 10, width: 4, length: 1.2, hemAbove: 0.1, base, amount: 0.45 });
  assert.ok(worn[9 * 4 * 3] < worn[0], 'hem darker than the top');
  assert.equal(drapeWear({ rows: 10, width: 4, length: 1.2, hemAbove: 0.1, base, amount: 0 }), null);
});
