import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STAGE_LOOK, STAGE_LOOKS, stageLookNames, stageLookOf } from '../src/levelmode/stagelooks.js';
import { hexToRgb, photoHorizon, rgbToHex, skyAngle, skyDirection, skyGrade, skyPoint, skySmooth } from '../src/levelmode/stagesky.js';
import { STORM_SKY_DATA } from '../src/levelmode/stormsky-data.js';
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
    if (look.sky.photo) assert.equal(clouds, undefined, `${name}: a photographic sky paints no clouds`);
    else {
      assert.ok(clouds.count > 0 && clouds.size[0] < clouds.size[1] && clouds.flat > 0 && clouds.flat <= 1, `${name}: clouds`);
      assert.ok(clouds.from < clouds.to && clouds.to <= 0.5, `${name}: clouds stay above the horizon`);
    }
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

test('the castle shadows itself in the looks that have a sun, and not in those that have only sky', () => {
  for (const [name, look] of Object.entries(STAGE_LOOKS)) {
    const strength = look.bakedShadow ?? 0;
    assert.ok(strength >= 0 && strength <= 1, `${name}: bakedShadow is 0..1`);
    // A shadow is a share of the sun's light: a look whose sun is weak cannot have a hard one, and one with a real sun (a shaft through the cloud) has it deep.
    if (look.sun.intensity < 0.6) assert.ok(strength <= 0.35, `${name}: a weak sun, a faint shadow`);
    if (look.shaft && look.sun.intensity > 1.5) assert.ok(strength >= 0.8, `${name}: a hard sun, a deep shadow`);
  }
  assert.ok(STAGE_LOOKS[DEFAULT_STAGE_LOOK].bakedShadow > 0, 'the default look has the shadow it was asked for');
});

test('a photographic look names a photograph that exists, a sane grade, and a horizon that is the graded photograph\'s own', () => {
  const photographic = Object.entries(STAGE_LOOKS).filter(([, look]) => look.sky.photo);
  assert.ok(photographic.length >= 4, 'the storm default and three more are photographic');
  assert.ok(STAGE_LOOKS[DEFAULT_STAGE_LOOK].sky.photo, 'the default is a photograph');
  for (const [name, look] of photographic) {
    const { id, az, grade } = look.sky.photo;
    const data = STORM_SKY_DATA[id];
    assert.ok(data && data.jpeg.length > 1000 && data.rows * 4 === data.width, `${name}: photograph ${id}`);
    assert.ok(az >= 0 && az < 360, `${name}: azimuth`);
    assert.ok(grade.gain[0] > 0 && grade.gain[1] > 0, `${name}: gain`);
    assert.ok(grade.rise[0] < grade.rise[1] && grade.gamma > 0 && grade.sat >= 0 && grade.tint.length === 3, `${name}: grade`);
    const graded = photoHorizon(look.sky.photo);
    const seen = hexToRgb(look.sky.horizon);
    for (let k = 0; k < 3; k += 1) assert.ok(Math.abs(graded[k] - seen[k]) <= 3, `${name}: sky.horizon ${look.sky.horizon} is the graded photograph's horizon ${rgbToHex(graded)}`);
  }
});

test('the grade darkens the sky overhead and far from the break, and keeps every channel in range', () => {
  const grade = STAGE_LOOKS.stormBreak.sky.photo.grade;
  const grey = [150, 150, 160];
  const horizon = skyGrade(grey, 2, 0, grade);
  const overhead = skyGrade(grey, 85, 90, grade);
  const luma = (c) => c[0] + c[1] + c[2];
  assert.ok(luma(overhead) < luma(horizon) * 0.35, 'black overhead, bright low down');
  assert.ok(luma(skyGrade(grey, 40, 100, grade)) < luma(skyGrade(grey, 40, 5, grade)), 'darker far from the break');
  for (const c of skyGrade([255, 255, 255], 0, 0, grade)) assert.ok(c >= 0 && c <= 255);
});

test('the sky maths: the smooth step, and the angle between two directions', () => {
  assert.equal(skySmooth(0, 10, -5), 0);
  assert.equal(skySmooth(0, 10, 15), 1);
  assert.ok(Math.abs(skySmooth(0, 10, 5) - 0.5) < 1e-9);
  assert.ok(Math.abs(skyAngle(0, 0, 90, 0) - 90) < 1e-9);
  assert.ok(Math.abs(skyAngle(37, 20, 37, 80) - 60) < 1e-9);
  assert.ok(skyAngle(10, 10, 10, 10) < 1e-6);
});

test('the default keeps a strong sun and a dim shade: only a break in the cloud', () => {
  const look = STAGE_LOOKS[DEFAULT_STAGE_LOOK];
  assert.ok(look.sun.intensity >= 2.4 && look.sun.intensity <= 3, 'sun 2.4..3');
  assert.ok(look.bakedShadow >= 0.9, 'the walls shade themselves in a real sun');
  assert.ok(look.ambient.gain * look.hemi.intensity < 0.5, 'the shade stays dim');
});

test('the fair-weather looks are for the sandbox only, bright, dry and lit by a real sun; the real stage keeps the storm', () => {
  const fair = Object.entries(STAGE_LOOKS).filter(([, look]) => look.sandboxOnly);
  assert.ok(fair.length >= 3, 'at least three fair-weather looks');
  assert.ok(!STAGE_LOOKS[DEFAULT_STAGE_LOOK].sandboxOnly, 'the default is not one of them');
  for (const [name, look] of fair) {
    assert.ok(look.sky.photo, `${name}: a photographic sky`);
    assert.equal(look.rain.opacity, 0, `${name}: dry`);
    assert.equal(look.lightning, null, `${name}: no lightning`);
    assert.ok(look.pools === 0 && look.wet <= 0.2, `${name}: no puddles, the stone nearly dry`);
    assert.ok(look.bakedShadow >= 0.9, `${name}: the sun is real, so the walls cast shadows`);
    assert.ok(look.sun.intensity >= 1.8 && look.sun.el >= 20, `${name}: a sun well up`);
    assert.ok(look.torch <= 0.4, `${name}: the torches are pale in daylight`);
    // The sun stands where the photograph's own sun does.
    const data = STORM_SKY_DATA[look.sky.photo.id];
    assert.ok(Math.abs(look.sun.el - data.breakEl) < 1, `${name}: the sun's elevation is the photograph's`);
    assert.ok(Math.abs(look.sun.az - look.sky.photo.az) < 1e-9, `${name}: and its azimuth is where the picture is turned`);
  }
});
