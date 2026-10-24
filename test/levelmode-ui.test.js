import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { STYLE_KEYS, STYLES } from '../src/moves.js';
import { OUTFITS, PICKABLE_OUTFIT_KEYS } from '../src/outfits.js';
import { advance, boutWinner, createWorld } from '../src/physics.js';
import { WARRIORS } from '../src/roster.js';
import { SHIELDS, WEAPONS } from '../src/weapons.js';
import { LEVEL_PRESET_KEYS, LEVEL_PRESETS, levelPreset } from '../src/levelmode/presets.js';
import { endingLines, NOTE_KEYS, NOTES, STAGE_LIST, STAGE_ONE, STORY_TIMING } from '../src/levelmode/story.js';

const words = (text) => text.trim().split(/\s+/).length;
const sentences = (text) => text.split(/[.!?]["']?(?:\s|$)/).filter((part) => part.trim()).length;

test('the cast: every preset builds, in a known style and kit, with a weapon that exists', () => {
  for (const key of [
    'forger', 'dunnottarSoldier', 'dunnottarGuard', 'dunnottarCrossbow', 'dunnottarMatchlock', 'dunnottarKnight', 'dunnottarPlateKnight', 'turnkey',
    'cabyMiner', 'cabySoldier', 'cabyPrince', 'dunnottarServant', 'dunnottarPriest', 'vaelen',
  ]) assert.ok(LEVEL_PRESET_KEYS.includes(key), key);
  for (const key of LEVEL_PRESET_KEYS) {
    const inputs = levelPreset(key);
    const style = STYLES[inputs.style];
    assert.ok(style, `${key}: style ${inputs.style}`);
    assert.ok(OUTFITS[inputs.outfit.kind]?.designs[inputs.outfit.design], `${key}: outfit`);
    if (style.weapon) assert.ok(WEAPONS[style.weapon], `${key}: weapon ${style.weapon}`);
    if (style.shield) assert.ok(SHIELDS[style.shield], `${key}: shield`);
    const body = buildBody(inputs);
    assert.ok(body.massKg > 40 && body.massKg < 300, `${key}: ${body.massKg}`);
  }
});

test('Vaelen: 210 cm, a body of 150 kg, the jousting harness with its helm, a two-handed poleaxe, very skilled', () => {
  const inputs = levelPreset('vaelen');
  const body = buildBody(inputs);
  assert.ok(inputs.heightCm >= 205 && inputs.heightCm <= 215, `${inputs.heightCm} cm`);
  assert.ok(body.bodyMassKg >= 140 && body.bodyMassKg <= 160, `${body.bodyMassKg} kg`);
  assert.equal(inputs.outfit.kind, 'tournament');
  const design = OUTFITS.tournament.designs[inputs.outfit.design];
  assert.equal(design.head.kind, 'stechhelm');
  assert.equal(design.armor.joust, true);
  assert.equal(WEAPONS[STYLES[inputs.style].weapon].hands, 'two');
  assert.ok(inputs.skill >= 0.85);
  // Stronger than the operative by a distance: the muscle is what drives the blow.
  assert.ok(body.bodyMassKg > 1.8 * buildBody(levelPreset('forger')).bodyMassKg);
});

test('the Forger: an athletic operative with arming sword and buckler in a gambeson, skill about 0.75', () => {
  const inputs = levelPreset('forger');
  assert.equal(STYLES[inputs.style].weapon, 'armingSword');
  assert.equal(STYLES[inputs.style].shield, 'buckler');
  assert.equal(inputs.outfit.kind, 'forger');
  assert.ok(Math.abs(inputs.skill - 0.75) < 0.05);
  assert.ok(inputs.exercise >= 0.7);
  assert.equal(levelPreset('cabyPrince').style, 'passive');
  assert.equal(STYLES[levelPreset('turnkey').style].weapon, 'baton');
});

test('the cast stays out of every list that deals from the game\'s own characters', () => {
  for (const key of LEVEL_PRESET_KEYS) assert.equal(PRESETS[key], undefined, `${key} is a body.js preset`);
  const keys = new Set(WARRIORS.map((warrior) => warrior.key));
  for (const key of LEVEL_PRESET_KEYS) assert.ok(!keys.has(key), `${key} is in Deadliest Warrior`);
  assert.ok(!STYLE_KEYS.includes('armingBuckler'), 'the Forger\'s style is not one to pick');
  for (const kind of ['forger', 'levy']) {
    assert.ok(OUTFITS[kind].levelOnly);
    assert.ok(!PICKABLE_OUTFIT_KEYS.includes(kind));
    assert.equal(OUTFITS[kind].family, undefined, `${kind} must not be dealt at random`);
  }
});

test('each of the cast fights: a short bout against the Forger runs without throwing', () => {
  for (const key of LEVEL_PRESET_KEYS.filter((name) => name !== 'forger')) {
    const world = createWorld([levelPreset('forger'), levelPreset(key)], { seed: 7 });
    for (let step = 0; step < 6 && !boutWinner(world); step += 1) advance(world, 1, (current, dt) => thinkAll(current, dt));
    assert.equal(world.fighters.length, 2, key);
  }
});

test('the story: the lore is about 150 words and names who it should; nine notes; the ending has its variants', () => {
  const lore = STAGE_ONE.lore.join(' ');
  assert.ok(words(lore) >= 110 && words(lore) <= 170, `${words(lore)} words`);
  for (const name of ['Queen Alta of Albion', 'Caby', 'Prince of Caby', 'Forgers', 'Eileen of Okimo', 'scroll signed in blood', 'Lord Vaelen', 'chief jailer']) assert.ok(lore.includes(name), name);
  assert.equal(STAGE_ONE.chapter, 'Chapter 4 · The Murmurs of the Shattered Chalice');
  assert.equal(STAGE_ONE.title, 'Memories of Dunnottar');
  assert.equal(NOTE_KEYS.length, 10);
  for (const key of NOTE_KEYS) {
    assert.ok(NOTES[key].title.length > 4, key);
    assert.ok(sentences(NOTES[key].body) >= 2 && sentences(NOTES[key].body) <= 4, `${key}: ${sentences(NOTES[key].body)} sentences`);
  }
  assert.match(NOTES.powder.body, /redstone/i);
  assert.match(NOTES.servant.body, /boy/);
  assert.match(NOTES.ledger.title, /Whigs/);
  assert.match(NOTES.order.title, /Alta/);
  const spared = endingLines({ civiliansHarmed: false });
  const harmed = endingLines({ civiliansHarmed: true });
  assert.equal(spared.length, harmed.length);
  assert.equal(spared.filter((line, at) => line !== harmed[at]).length, 1, 'one line differs');
  // The plot twist's ending: the empty privy, Noname's face, the helmet; no prince rescued, no cell standing open.
  const before = endingLines({ slainBefore: true });
  assert.equal(before.length, spared.length);
  assert.equal(before.filter((line, at) => line !== spared[at]).length, 1, 'when he was killed is one line');
  assert.match(spared.join(' '), /privy/);
  assert.match(spared.join(' '), /helmet/);
  assert.match(before.join(' '), /on your way in/);
  // The epilogue's end is one line more: fallen, or standing.
  assert.equal(endingLines({ outcome: 'fell' }).length, spared.length + 1);
  assert.notEqual(endingLines({ outcome: 'fell' }).join(), endingLines({ outcome: 'cleared' }).join());
  for (const lines of [spared, harmed, before]) assert.ok(!/cell stood open|shards|walked out|rescue/i.test(lines.join(' ')), lines.join(' '));
  assert.ok(STORY_TIMING.deathIn > 0);
});

test('Level Mode lists Stage 1 (playable) and Stage 2 (coming soon)', () => {
  assert.equal(STAGE_LIST[0].key, 'dunnottar');
  assert.equal(STAGE_LIST[0].ready, true);
  assert.equal(STAGE_LIST[0].title, 'Stage 1 · Memories of Dunnottar');
  assert.equal(STAGE_LIST[1].ready, false);
  assert.equal(STAGE_LIST[1].title, 'Stage 2 · Coming soon');
  assert.equal(LEVEL_PRESETS.vaelen.name, 'Lord Vaelen');
});
