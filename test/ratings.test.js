import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { RATINGS } from '../src/ratings.js';
import { pairedOpponent, ratingOf, WARRIORS } from '../src/roster.js';
import { seededRandom } from '../src/physics.js';
import { fitStrength, kd } from '../tools/ratings.js';

test('every character in the roster has a rating, and every rating comes from the generated table', () => {
  for (const warrior of WARRIORS) {
    assert.ok(RATINGS.characters[warrior.key], `${warrior.title} is rated`);
    assert.ok(ratingOf(warrior.inputs) > 0, `${warrior.title} has a rating by type`);
  }
  assert.deepEqual(RATINGS.references, ['maximus', 'monk']);
});

test('a score is proportional to inferred K/D: even with Maximus is 100, twice his K/D is 200; the monk places the weak', () => {
  const strengths = RATINGS.strengths;
  assert.equal(strengths.maximus, 100);
  const even = fitStrength([{ record: { wins: 16, losses: 16, draws: 0 }, strength: strengths.maximus }, { record: { wins: 32, losses: 0, draws: 0 }, strength: strengths.monk }]);
  assert.ok(Math.abs(even - 100) < 8, `even with Maximus: ${even.toFixed(1)}`);
  const twice = fitStrength([{ record: { wins: 1000, losses: 500, draws: 0 }, strength: 100 }]);
  assert.ok(Math.abs(twice - 200) < 2, `twice his K/D: ${twice.toFixed(1)}`);
  // Beaten every time by Maximus, the monk's record tells the weak apart.
  const weak = fitStrength([{ record: { wins: 0, losses: 32, draws: 0 }, strength: strengths.maximus }, { record: { wins: 16, losses: 16, draws: 0 }, strength: strengths.monk }]);
  const weaker = fitStrength([{ record: { wins: 0, losses: 32, draws: 0 }, strength: strengths.maximus }, { record: { wins: 4, losses: 28, draws: 0 }, strength: strengths.monk }]);
  assert.ok(weak > weaker && weak < 10, `${weak.toFixed(2)} above ${weaker.toFixed(2)}`);
  assert.ok(kd({ wins: 3, losses: 1, draws: 0 }) === 3.5 / 1.5);
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
