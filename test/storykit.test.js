import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY_BATTLES } from '../src/story/battles/index.js';
import { koreaKitFor } from '../src/story/battles/korea.js';
import { storyNewLife } from '../src/story/life.js';

test('a man wears the better of his rank\'s kit and what his place in the line was issued', () => {
  assert.equal(koreaKitFor('mingGarrison', 'mingBrigandine'), 'mingBrigandine');
  assert.equal(koreaKitFor('mingElite', 'mingBrigandine'), 'mingElite');
  assert.equal(koreaKitFor('mingGarrison', undefined), 'mingGarrison');
});

test('a soldier hero is never the one unarmoured man in an armoured column', () => {
  const life = storyNewLife(1);
  for (const id of ['wokou', 'pyongyang', 'ulsan', 'liaodong']) {
    const setup = STORY_BATTLES[id].setup(life, 1);
    // (Qi's own company in the 1588 raid and his southern troops in Korea wear his elite infantry's kit, outfits.js
    // mingEliteInfantry; the Liaodong columns the brigandine.)
    assert.equal(setup.fighters[setup.player].inputs.outfit.kind, id === 'liaodong' ? 'mingBrigandine' : 'mingEliteInfantry', id);
  }
});
