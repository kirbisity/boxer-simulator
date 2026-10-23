import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greyedHair, greyShare } from '../src/aging.js';

test('no grey before the mid-thirties, half grey at fifty, white by the eighties', () => {
  assert.equal(greyShare(25), 0);
  assert.equal(greyShare(34), 0);
  assert.ok(Math.abs(greyShare(50) - 0.5) < 0.03);
  assert.equal(greyShare(80), 1);
  assert.equal(greyShare(100), 1);
});

test('the grey share rises with age', () => {
  let last = -1;
  for (let age = 18; age <= 100; age += 1) {
    const share = greyShare(age);
    assert.ok(share >= last);
    last = share;
  }
});

test('dark hair greys toward white-grey with age, and young hair is unchanged', () => {
  const black = '#120d0a';
  assert.equal(greyedHair(black, 30), black);
  const lightness = (hex) => [1, 3, 5].reduce((sum, start) => sum + parseInt(hex.slice(start, start + 2), 16), 0);
  assert.ok(lightness(greyedHair(black, 45)) > lightness(black));
  assert.ok(lightness(greyedHair(black, 65)) > lightness(greyedHair(black, 45)));
  assert.equal(greyedHair(black, 80), '#d6d4ce');
});

test('a colour that is not a hex string is left alone', () => {
  assert.equal(greyedHair('red', 70), 'red');
});
