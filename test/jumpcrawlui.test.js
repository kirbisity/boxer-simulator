// The Jump and Crawl buttons and keys: the icons, the wiring (touch.js, main.js), the tutorial's words, and the right-hand stack's
// layout as the style sheets place it, worked out from the CSS for a desktop, a phone upright and a phone on its side (no button
// over another, all inside the screen), in both attack controls (Body: the column; Buttons: round the cluster's slots).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIGHT_UI_CONTROL_ICONS } from '../src/fightui/icons.js';
import { TUTORIAL_STEPS } from '../src/tutorial.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the Jump and Crawl icons are drawn (inline SVG), and the buttons are made and wired in touch.js', () => {
  for (const key of ['jump', 'crawl']) assert.match(FIGHT_UI_CONTROL_ICONS[key], /^<svg[^>]*viewBox/);
  const touch = read('src/touch.js');
  assert.match(touch, /'fight-button jump-button'/);
  assert.match(touch, /'fight-button crawl-button'/);
  assert.match(touch, /jump\.addEventListener\('pointerdown'/);
  assert.match(touch, /crawl\.addEventListener\('pointerdown'/);
  assert.match(touch, /toggleCrawl\(world, me, hooks\.orders\(\)\)/, 'the button goes through the lock rule');
  assert.match(touch, /crawl\.classList\.toggle\('blocked', !crawlReady/);
  assert.match(touch, /jump\.classList\.toggle\('blocked', !canJump\)/);
});

test('the keys: Space jumps, C crawls, T guards (Space no longer does), and nothing else is on them', () => {
  const main = read('src/main.js');
  assert.match(main, /if \(key === 'c'\) return void fightControls\.toggleCrawl\(\);/);
  assert.match(main, /if \(press\.key === ' '\) \{\s*press\.preventDefault\(\);\s*fightControls\.jump\(\);/);
  assert.match(main, /const GUARD_KEY = 't';/);
  const keys = main.slice(main.indexOf('const KEYS = {'), main.indexOf('};', main.indexOf('const KEYS = {')));
  assert.doesNotMatch(keys, /\bt: '/, 'T is no move');
  assert.doesNotMatch(keys, /' ': '/);
});

test('the tutorial teaches both (a finger\'s words and the keys\'), and guarding is on T now', () => {
  const jump = TUTORIAL_STEPS.find((step) => step.key === 'jump');
  const crawl = TUTORIAL_STEPS.find((step) => step.key === 'crawl');
  assert.ok(jump && crawl);
  assert.match(jump.mouse, /Space/);
  assert.match(crawl.mouse, /\bC\b/);
  assert.match(jump.touch, /Jump/);
  assert.match(crawl.touch, /Crawl/);
  assert.match(TUTORIAL_STEPS.find((step) => step.key === 'guard').mouse, /Hold T/);
  assert.match(read('README.md'), /\*\*Space\*\* jumps, \*\*C\*\* crawls/);
});

// ---- The layout, from the style sheets --------------------------------------------------------------

/** The rules of a sheet: [{ media (the query or ''), selector, props }]. Only what this test reads (flat rules and @media blocks). */
function rules(css) {
  const out = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let index = 0;
  const parse = (body, media) => {
    for (const match of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const props = Object.fromEntries(match[2].split(';').map((pair) => pair.split(/:(.*)/s).map((part) => part?.trim())).filter(([key, value]) => key && value));
      for (const selector of match[1].split(',')) out.push({ media, selector: selector.trim(), props });
    }
  };
  while (index < text.length) {
    const at = text.indexOf('@media', index);
    if (at < 0) {
      parse(text.slice(index), '');
      break;
    }
    parse(text.slice(index, at), '');
    const open = text.indexOf('{', at);
    let depth = 1;
    let end = open + 1;
    for (; depth > 0; end += 1) depth += text[end] === '{' ? 1 : text[end] === '}' ? -1 : 0;
    parse(text.slice(open + 1, end - 1), text.slice(at + 6, open).trim());
    index = end;
  }
  return out;
}

/** Whether a media query applies to a screen of this size (the queries these sheets use). */
function applies(media, width, height) {
  if (!media) return true;
  return media.split(',').some((part) => {
    const max = [...part.matchAll(/\((max|min)-(width|height):\s*(\d+)px\)/g)];
    return max.every(([, kind, axis, value]) => {
      const size = axis === 'width' ? width : height;
      return kind === 'max' ? size <= Number(value) : size >= Number(value);
    });
  });
}

const px = (value, vars) => {
  if (!value) return null;
  let total = 0;
  for (const term of value.replace(/env\([^)]*\)/g, '0px').matchAll(/var\(--([\w-]+)(?:,\s*(\d+)px)?\)|(-?\d+(?:\.\d+)?)px/g)) {
    if (term[1]) total += vars[term[1]] ?? Number(term[2] ?? 0);
    else total += Number(term[3]);
  }
  return total;
};

/** The round buttons as placed for a screen and an attack control: { name: { x, y (centre, px from the right edge and the top), r } }. */
function layout(width, height, design) {
  const all = [...rules(read('boxer.css')), ...rules(read('fightui.css'))].filter((rule) => applies(rule.media, width, height));
  const vars = { 'controls-height': 56, 'fu-raise': 0, 'fu-s': 1 };
  const matches = (selector, name) => selector === name || (design === 'buttons' && selector === `.fight-ui[data-fightui="buttons"] ${name}`);
  for (const rule of all) {
    if (rule.selector === '.fu-buttons' && rule.props['--fu-s']) vars['fu-s'] = Number(rule.props['--fu-s']);
    if (design === 'buttons' && rule.selector === '.fight-ui[data-fightui="buttons"]' && rule.props['--fu-raise']) vars['fu-raise'] = px(rule.props['--fu-raise'], {});
  }
  const placed = {};
  for (const name of ['guard', 'lock', 'action', 'jump', 'crawl']) {
    const box = {};
    for (const rule of all) if (matches(rule.selector, `.${name}-button`)) for (const key of ['right', 'bottom', 'width']) if (rule.props[key]) box[key] = px(rule.props[key], vars);
    placed[name] = { x: box.right + box.width / 2, y: height - (box.bottom + box.width / 2), r: box.width / 2 };
  }
  if (design === 'buttons') {
    const slots = JSON.parse(read('src/fightui/buttons.js').match(/FIGHT_UI_SLOTS = (\[[^;]*\]);/)[1]);
    slots.forEach(([right, bottom], index) => {
      placed[`slot${index + 1}`] = { x: right * vars['fu-s'], y: height - (56 + vars['fu-raise'] + bottom * vars['fu-s']), r: 34 };
    });
  }
  return placed;
}

const SCREENS = { desktop: [1400, 700], laptop: [1280, 720], 'phone upright': [390, 844], 'small phone upright': [375, 667], 'phone on its side': [844, 390], 'small phone on its side': [667, 375] };

test('the right-hand stack: Jump over Lock, Crawl under Guard; no button over another and all on the screen, at every size, in both controls', () => {
  for (const [screen, [width, height]] of Object.entries(SCREENS)) {
    for (const design of ['target', 'buttons']) {
      const placed = layout(width, height, design);
      const names = Object.keys(placed);
      for (const name of names) {
        const { x, y, r } = placed[name];
        assert.ok(Number.isFinite(x) && Number.isFinite(y), `${screen} ${design}: ${name} placed`);
        assert.ok(x - r >= 0 && y - r >= 0 && x + r <= width && y + r <= height - 56, `${screen} ${design}: ${name} on the screen above the footer (${x}, ${y})`);
      }
      for (let i = 0; i < names.length; i += 1) {
        for (let j = i + 1; j < names.length; j += 1) {
          const a = placed[names[i]];
          const b = placed[names[j]];
          assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r - 0.5, `${screen} ${design}: ${names[i]} and ${names[j]} overlap`);
        }
      }
      if (design === 'target') {
        assert.ok(placed.jump.y < placed.lock.y, `${screen}: Jump above Lock`);
        assert.ok(placed.crawl.y > placed.guard.y, `${screen}: Crawl below Guard`);
      }
    }
  }
});
