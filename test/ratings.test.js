import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { RATINGS } from '../src/ratings.js';
import { pairedOpponent, ratingOf, WARRIORS } from '../src/roster.js';
import { seededRandom } from '../src/physics.js';
import { fitAll, fitStrength, kd } from '../tools/ratings.js';

test('every character in the roster has a rating, and every rating comes from the generated table', () => {
  for (const warrior of WARRIORS) {
    assert.ok(RATINGS.characters[warrior.key], `${warrior.title} is rated`);
    assert.ok(ratingOf(warrior.inputs) > 0, `${warrior.title} has a rating by type`);
  }
  assert.deepEqual(RATINGS.references, ['maximus', 'monk']);
});

test('a score is proportional to inferred K/D: fitted to every bout at once, Maximus held at 100', () => {
  assert.equal(RATINGS.characters.maximus.score, 100);
  // Twice as many wins as losses against Maximus is twice his strength.
  const twice = fitAll([{ a: 'x', b: 'maximus', record: { wins: 1000, losses: 500, draws: 0 } }], 'maximus');
  assert.ok(Math.abs(twice.x - 200) < 2, `twice his K/D: ${twice.x.toFixed(1)}`);
  // Through a chain: x even with y, y twice Maximus: x about twice too.
  const chain = fitAll([{ a: 'x', b: 'y', record: { wins: 500, losses: 500, draws: 0 } }, { a: 'y', b: 'maximus', record: { wins: 1000, losses: 500, draws: 0 } }], 'maximus');
  assert.ok(Math.abs(chain.x - 200) < 5, `through a chain: ${chain.x.toFixed(1)}`);
  // The provisional fit against a single known strength agrees.
  assert.ok(Math.abs(fitStrength([{ record: { wins: 1000, losses: 500, draws: 0 }, strength: 100 }]) - 200) < 2);
  assert.ok(kd({ wins: 3, losses: 1, draws: 0 }) === 3.5 / 1.5);
  // Cross pairs were fought between near neighbours.
  assert.ok(RATINGS.cross.length > WARRIORS.length / 2);
});

test('the ratings order as the fights do: armed above bare-handed, the armoured knight above the man in his shirt', () => {
  const of = (key) => ratingOf(PRESETS[key]);
  assert.ok(of('maximus') > of('heavy'), 'a swordsman above a boxer');
  assert.ok(of('knight') > of('spear'), 'a knight in plate above a peasant with a spear');
});

test('quick battle pairs by rating: a strong man meets strong men more often than weak ones', () => {
  const candidates = ['knight', 'spear', 'heavy', 'maximus'].map((key) => ({ ...PRESETS[key], key }));
  const strong = [...candidates].sort((a, b) => ratingOf(b) - ratingOf(a))[0];
  const weak = [...candidates].sort((a, b) => ratingOf(a) - ratingOf(b))[0];
  const random = seededRandom(9);
  const met = { strong: 0, weak: 0 };
  for (let index = 0; index < 400; index += 1) {
    const opponent = pairedOpponent(strong, candidates, random);
    if (opponent.key === strong.key) met.strong += 1;
    if (opponent.key === weak.key) met.weak += 1;
  }
  assert.ok(met.strong > met.weak, `${strong.key} met his like ${met.strong} times, ${weak.key} ${met.weak}`);
});
