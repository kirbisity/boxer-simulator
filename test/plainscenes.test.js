// The horse-archer battles' three plains (Mobei, the Catalaunian Plains, Carrhae): each a place in every table an open-air place is
// in, and what stood at its edge (Wei Qing's wagon laager, the Parthian camel train) drawn beyond the fighting floor, never on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACE_AMBIENCE } from '../src/audio/ambience.js';
import { PLACE_SURFACE } from '../src/audio/surface.js';
import { SCENE_MUSIC } from '../src/audio/music/manifest.js';
import { PLAINS_LAAGER, PLAINS_TRAIN, plainsLaagerSpots, plainsTrainSpots } from '../src/props/plains.js';

// scenery.js comes with render.js, which makes a few THREE things at load: a THREE that answers anything, for the import.
const stub = new Proxy(function stand() {}, { get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : stub), apply: () => stub, construct: () => stub });
const kept = globalThis.THREE;
globalThis.THREE = stub;
const { PLACE_GROUND, PLACE_SCENERY } = await import('../src/scenery.js');
const { PLACE_ARENAS } = await import('../src/render.js');
globalThis.THREE = kept;

const PLAINS = ['mobei', 'catalaunian', 'carrhae'];
// The floors these battles are fought on are wider than the place's own (scenarios.js, drawn apart): try a few.
const FLOORS = [{ halfX: 30, halfZ: 20 }, { halfX: 48, halfZ: 24 }, { halfX: 60, halfZ: 30 }];

test('each plain is a place in every open-air table: its land, ground, footing, sound and music', () => {
  for (const place of PLAINS) {
    assert.ok(PLACE_ARENAS[place], `${place}: a floor of its own`);
    assert.ok(PLACE_SCENERY[place], `${place}: scenery`);
    assert.ok(PLACE_GROUND[place], `${place}: ground`);
    assert.ok(PLACE_SURFACE[place], `${place}: surface`);
    assert.ok(PLACE_AMBIENCE[place]?.wind > 0, `${place}: wind`);
    assert.ok(SCENE_MUSIC[place], `${place}: music`);
  }
});

test('Wei Qing\'s wagons stand beyond the Han (red, -x) end of the floor, across its whole width', () => {
  for (const floor of FLOORS) {
    const spots = plainsLaagerSpots(floor);
    // A wagon's half-length and its shafts reach this far from its middle.
    const reach = PLAINS_LAAGER.box[0] / 2 + 2;
    for (const [x] of spots) assert.ok(x + reach < -floor.halfX, `a wagon at x ${x.toFixed(1)} reaches the floor (${-floor.halfX})`);
    const zs = spots.map(([, z]) => z);
    assert.ok(Math.min(...zs) < -floor.halfZ && Math.max(...zs) > floor.halfZ, 'the line spans the floor\'s width');
  }
});

test('the Parthian camel train stands beyond the blue (+x) end of the floor', () => {
  for (const floor of FLOORS) {
    const { camels, handlers } = plainsTrainSpots(floor);
    assert.equal(camels.length, PLAINS_TRAIN.camels);
    assert.ok(camels.filter(([, , , laden]) => laden).length >= PLAINS_TRAIN.camels / 2, 'most of them laden');
    // A camel's body and neck reach about 2 m from its middle.
    for (const [x] of [...camels, ...handlers]) assert.ok(x - 2 > floor.halfX, `x ${x.toFixed(1)} reaches the floor (${floor.halfX})`);
  }
});
