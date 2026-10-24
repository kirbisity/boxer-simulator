// Stage 1, Dunnottar: no doorway looks shut that is open. Each walk-through opening of a wall run (the gates, the postern, the arches, the cellar's
// doors, the crypt's, the drain's, the sea cave's mouth, the tower's and the chapel's) is a box through the wall a little either side, from a hand over
// its sill to a man's height under its head: nothing drawn may stand in it (test/entrances.js: walls, floors, ceilings, the decor's vaults, faces and
// masses, and the land, the hillside's and the headland rock's heightfields, as kit.js draws them).
// Found and fixed when this was written: the hillside's slope stood in the sea cave's mouth (and rose in the gatehouse's stair tunnel and through two
// of the cellar's doors: the castle's cobbled stairs were taken for paths on the hill), the vestibule's east wall half across the gunners' door, and
// the well shaft's sides either side of its door in the cellar's doorway.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNNOTTAR } from '../src/levelmode/stages/dunnottar.js';
import { blockedDoorways, doorways } from './entrances.js';

test('entrances: every doorway of the stage is clear of drawn geometry (walls, floors, ceilings, vaults, the land)', () => {
  const doors = doorways(DUNNOTTAR);
  assert.ok(doors.length >= 30, `${doors.length} doorways`);
  for (const id of ['cliff', 'gate', 'quad', 'vault', 'crypt', 'sewer', 'tower', 'chapel']) assert.ok(doors.some((door) => door.section === id), `${id} has doorways`);
  assert.deepEqual(blockedDoorways(DUNNOTTAR).map((found) => `${found.door} <- ${found.what}`), []);
});

test('entrances: the check sees a doorway shut (a wall put in the great gate, the hillside raised through the sea cave\'s mouth)', () => {
  const gate = DUNNOTTAR.sections.find((section) => section.id === 'gate');
  const wall = { kind: 'wall', at: [-6, 46.2], size: [0.4, 1.0], yaw: 0, bottom: 0, top: 3, style: 'ashlar' };
  const walled = { ...DUNNOTTAR, sections: DUNNOTTAR.sections.map((section) => (section === gate ? { ...section, terrain: [...section.terrain, wall] } : section)) };
  assert.ok(blockedDoorways(walled).some((found) => found.door.startsWith('gate gate door')));
  const holeless = { ...DUNNOTTAR, landform: { ...DUNNOTTAR.landform, holes: [] } };
  assert.ok(blockedDoorways(holeless).some((found) => found.door.startsWith('cliff door at -48.5,55.4') && found.what.includes('hillside')));
});
