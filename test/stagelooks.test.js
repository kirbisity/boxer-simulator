import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STAGE_LOOK, STAGE_LOOKS, stageLookNames, stageLookOf } from '../src/levelmode/stagelooks.js';
import { hexToRgb, skyDirection, skyPoint } from '../src/levelmode/stagesky.js';
import { ktField, ktMacroData } from '../src/levelmode/kitpaint.js';

const hex = /^#[0-9a-f]{6}$/i;

test('Stage 1 has at least five looks, and the default is one of them', () => {
  assert.ok(stageLookNames().length >= 5);
  assert.ok(STAGE_LOOKS[DEFAULT_STAGE_LOOK]);
  assert.equal(stageLookOf('no such look'), STAGE_LOOKS[DEFAULT_STAGE_LOOK], 'an unknown name is the default');
});

test('every look is whole: a sky, a light, a fog, a sea, rain, and a sentence about itself', () => {
  for (const [name, look] of Object.entries(STAGE_LOOKS)) {
    assert.ok(look.label && look.blurb.length > 60, `${name}: label and blurb`);
    for (const key of ['zenith', 'high', 'mid', 'horizon']) assert.match(look.sky[key], hex, `${name}: sky.${key}`);
    const clouds = look.sky.clouds;
    assert.ok(clouds.count > 0 && clouds.size[0] < clouds.size[1] && clouds.flat > 0 && clouds.flat <= 1, `${name}: clouds`);
    assert.ok(clouds.from < clouds.to && clouds.to <= 0.5, `${name}: clouds stay above the horizon`);
    assert.ok(look.sun.el > 0 && look.sun.el < 90 && look.sun.intensity > 0, `${name}: sun`);
    assert.equal(look.sun.colour.length, 3);
    assert.equal(look.ambient.tint.length, 3);
    assert.ok(look.ambient.gain > 0 && look.exposure > 0, `${name}: ambient and exposure`);
    assert.ok(look.fog.near < look.fog.far, `${name}: fog near < far`);
    assert.ok(look.fog.mist.density >= 0 && look.fog.mist.falloff > 0, `${name}: mist`);
    assert.ok(look.rain.opacity >= 0 && look.rain.share >= 0 && look.rain.share <= 1, `${name}: rain`);
    assert.ok(look.wet >= 0 && look.wet <= 1 && look.vignette >= 0 && look.vignette <= 1, `${name}: wet and vignette`);
    assert.ok(look.torch > 0, `${name}: torch`);
    assert.ok(look.lightning === null || (look.lightning.gap[0] < look.lightning.gap[1] && look.lightning.strength > 0), `${name}: lightning`);
    assert.ok(look.shaft === null || (look.shaft.opacity > 0 && look.shaft.width > 0), `${name}: shaft`);
  }
});

test('the sky meets the fog without a seam: its horizon colour is the fog colour', () => {
  for (const [name, look] of Object.entries(STAGE_LOOKS)) {
    const fog = look.fog.colour;
    const [r, g, b] = hexToRgb(look.sky.horizon);
    assert.equal((r << 16) | (g << 8) | b, fog, `${name}: sky.horizon is fog.colour`);
  }
});

test('the looks differ in kind: a storm, a break in the cloud, a fog, a night, a grey day, a dusk', () => {
  const looks = Object.values(STAGE_LOOKS);
  // At least one with a shaft, one with no strikes and thick mist, one near-dark with stars and hard rain, one dry.
  assert.ok(looks.some((look) => look.shaft && look.sun.intensity > 1.5), 'a look with a warm shaft of sun');
  assert.ok(looks.some((look) => !look.lightning && look.fog.mist.density >= 0.04), 'a sea fog');
  assert.ok(looks.some((look) => look.sky.stars > 0 && look.rain.opacity >= 0.3 && look.lightning && look.lightning.strength > 1), 'a night squall');
  assert.ok(looks.some((look) => look.rain.opacity === 0 || look.rain.share === 0), 'a dry one');
  const horizons = new Set(looks.map((look) => look.sky.horizon));
  assert.equal(horizons.size, looks.length, 'no two share a horizon');
});

test('a direction in the sky maps to a spot of the painted map and back', () => {
  const [x, y] = skyPoint(90, 0, 1024, 512);
  assert.ok(Math.abs(y - 256) < 1e-9, 'the horizon is half way down');
  assert.ok(x >= 0 && x < 1024);
  const [, up] = skyPoint(0, 90, 1024, 512);
  assert.ok(Math.abs(up) < 1e-9, 'overhead is the top row');
  const d = skyDirection(30, 20);
  assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9);
  assert.ok(d[1] > 0 && d[0] > 0 && d[2] > 0);
});

test('the noise the stone is painted from tiles, and the macro map has four channels that are not the same', () => {
  const size = 64;
  const field = ktField(size, 7, [[4, 1], [8, 0.5]]);
  // Periodic: the field one past the edge is the field at the start (the lattice wraps), so the seam is as smooth as any other row.
  let seam = 0;
  let inside = 0;
  for (let y = 0; y < size; y += 1) {
    seam += Math.abs(field[y * size] - field[y * size + size - 1]);
    inside += Math.abs(field[y * size + 31] - field[y * size + 30]);
  }
  assert.ok(seam < inside * 3 + 0.5, 'no seam where the tile wraps');
  const data = ktMacroData(64);
  assert.equal(data.length, 64 * 64 * 4);
  const mean = [0, 0, 0, 0];
  for (let k = 0; k < data.length; k += 1) mean[k % 4] += data[k] / (64 * 64);
  assert.ok(mean.every((m) => m > 5 && m < 250), `each channel has something in it: ${mean.map((m) => m.toFixed(0))}`);
});
