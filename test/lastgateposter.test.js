// The Last Gate's end poster (lastgateview.js): its words (two numbers, the hero's name and what he is) and how it is shared.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastGatePosterWords } from '../src/lastgate.js';
import { lastGateShare } from '../src/lastgateview.js';

test('the poster says two numbers, the time held and his kills, with his name and what he is', () => {
  const words = lastGatePosterWords({ hero: 'samurai', seconds: 252, kills: 57, total: 90, waves: 7 }, 'Makara Naotaka');
  assert.equal(words.held, '4:12');
  assert.equal(words.fell, '57 FELL');
  assert.equal(words.name, 'MAKARA NAOTAKA');
  assert.equal(words.title, 'THE SAMURAI · ŌDACHI');
  assert.equal(words.mark, 'GLADIATOR · THE LAST GATE');
  // Only those: nothing of the defenders' total or the waves on it.
  assert.ok(!Object.values(words).some((text) => text.includes('90') || /\b7\b/.test(text)));
  assert.equal(lastGatePosterWords({ hero: 'knight', seconds: 61, kills: 0 }).name, 'KNIGHT');
  assert.equal(lastGatePosterWords({ hero: 'ironPagoda', seconds: 61, kills: 1 }).title, 'THE IRON PAGODA · GUANDAO');
});

test('sharing: the poster as an image where files share; else saved with the line copied; else the line shared, copied, or shown to copy', async () => {
  const blob = new Blob(['png'], { type: 'image/png' });
  const text = 'I held The Last Gate for 4:12 as the Samurai — 57 rebels cut down. Gladiator';
  const calls = [];
  const clip = (ok = true) => ({ writeText: async (line) => { if (!ok) throw new Error('denied'); calls.push(['copy', line]); } });
  const save = () => calls.push(['save']);
  // A phone that shares files: the image and the line together.
  const phone = { canShare: ({ files }) => files?.[0]?.type === 'image/png', share: async (data) => calls.push(['share', data.files?.length ?? 0, data.text]), clipboard: clip() };
  assert.equal(await lastGateShare({ blob, text, title: 'The Last Gate', save, nav: phone }), 'image');
  assert.deepEqual(calls.pop(), ['share', 1, text]);
  // A desktop browser (no file share): the poster saved, the line copied.
  assert.equal(await lastGateShare({ blob, text, title: 'x', save, nav: { clipboard: clip() } }), 'download');
  assert.deepEqual(calls.slice(-2), [['save'], ['copy', text]]);
  // Cancelled at the share sheet: nothing else happens.
  const cancelled = { canShare: () => true, share: async () => { throw Object.assign(new Error('no'), { name: 'AbortError' }); }, clipboard: clip() };
  const before = calls.length;
  assert.equal(await lastGateShare({ blob, text, title: 'x', save, nav: cancelled }), 'cancelled');
  assert.equal(calls.length, before);
  // No image: the line shared, or copied, or (no clipboard) shown to be copied by hand.
  assert.equal(await lastGateShare({ text, title: 'x', nav: { share: async () => {} } }), 'text');
  assert.equal(await lastGateShare({ text, title: 'x', nav: { clipboard: clip() } }), 'copied');
  assert.equal(await lastGateShare({ text, title: 'x', nav: { clipboard: clip(false) } }), 'select');
  assert.equal(await lastGateShare({ text, title: 'x', nav: {} }), 'select');
});
