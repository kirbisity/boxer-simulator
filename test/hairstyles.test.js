import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Photo heads' hair styles (hairmass.js HAIR_STYLES): every style offered has a shape of its own, read from the real cut.

import { HAIR_STYLES } from '../src/hairmass.js';

const offered = JSON.parse(readFileSync(new URL('../src/face.js', import.meta.url), 'utf8').match(/hairStyle: (\[[^\]]*\])/)[1].replace(/'/g, '"'));
const parts = (style) => (HAIR_STYLES[style].parts ?? []).map((part) => part.kind);

test('every style offered has a shape, and no two shapes are the same', () => {
  for (const style of offered) assert.ok(HAIR_STYLES[style], `${style} has a shape`);
  const drawn = offered.filter((style) => !['buzz', 'bald'].includes(style)).map((style) => JSON.stringify(HAIR_STYLES[style]));
  assert.equal(new Set(drawn).size, drawn.length, 'each drawn style differs');
});

test('the silhouettes: crops on the scalp, a fade bare at the sides, lengths where the cuts end', () => {
  assert.equal(HAIR_STYLES.buzz.cap, undefined, 'a buzz is painted on the scalp');
  assert.ok(HAIR_STYLES.fade.cap.top < 1.2 && HAIR_STYLES.fade.cap.crown > HAIR_STYLES.cleanShort.cap.crown, 'a fade: a raised top, the sides shaved');
  assert.deepEqual(parts('cornrows'), ['cornrows']);
  assert.deepEqual(parts('ponytail'), ['tail']);
  assert.deepEqual(parts('dreads'), ['ropes']);
  assert.ok(parts('ringlets').includes('ringlets') && parts('ringletPigtails').includes('pigtails') && parts('ringletUpdo').includes('updo'));
  const { midLong, long, hime } = HAIR_STYLES;
  assert.ok(midLong.hang.sides < -0.6 && midLong.hang.back > -1.2, 'a bob ends at the jaw');
  assert.ok(long.hang.back < -3.2, 'long hair reaches the shoulder blades');
  assert.ok(hime.hang.blunt && hime.hang.fringe > 0 && hime.hang.sides > -1.3 && hime.hang.back < -3.2, 'hime: blunt bangs, side locks at the chin, long behind');
});
