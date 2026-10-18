// The sky of Stage 1, painted from a look's `sky` (stagelooks.js) on an equirectangular canvas: a gradient up from the horizon colour (which is
// also the fog's, so the sea, the haze and the sky meet without a band), banks of cloud, the glow of a low sun or the moon (with the cloud cleared
// round it), stars; and the soft beam of light that falls through a break in the cloud. The canvas is mapped on a sphere
// (THREE.SphereGeometry: u runs round from the -x side, v up), so a direction maps to a spot of it by `skyPoint`.

import { ktRandom } from './kitpaint.js';

/** Where in an equirectangular sky of `width` by `height` px lies the direction `az` degrees round (0 east, 90 south) and `el` degrees up. */
export function skyPoint(az, el, width, height) {
  const phi = Math.PI - (az * Math.PI) / 180;
  const u = (((phi / (2 * Math.PI)) % 1) + 1) % 1;
  return [u * width, ((90 - el) / 180) * height];
}

/** The direction (a unit vector, x east, z south, y up) at `az`, `el` degrees. */
export function skyDirection(az, el) {
  const a = (az * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  return [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)];
}

const rgba = (rgb, a) => `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${a})`;

/**
 * The sky as a canvas. `seed` makes the same clouds for the same look each time. (Painted into a float buffer by hand, not with canvas gradients: a canvas dithers its
 * gradients in a fixed pattern, and five hundred soft clouds laid over one another add that pattern up into a grid across the sky.)
 */
export function stageSkyCanvas(sky, width = 1024, height = 512, seed = 2024) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  const random = ktRandom(seed);
  const buffer = new Float32Array(width * height * 3);
  const stops = [[0, hexToRgb(sky.zenith)], [0.2, hexToRgb(sky.high)], [0.38, hexToRgb(sky.mid)], [0.5, hexToRgb(sky.horizon)], [1, hexToRgb(sky.horizon)]];
  for (let y = 0; y < height; y += 1) {
    const t = (y + 0.5) / height;
    let k = 0;
    while (k + 2 < stops.length && t > stops[k + 1][0]) k += 1;
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      buffer[i] = c0[0] + (c1[0] - c0[0]) * f;
      buffer[i + 1] = c0[1] + (c1[1] - c0[1]) * f;
      buffer[i + 2] = c0[2] + (c1[2] - c0[2]) * f;
    }
  }
  /** A soft ellipse at (cx, cy), radii (rx, ry), of `colour` at `alpha` (centre) falling to nothing at the rim, laid over (or added to, `add`) the buffer; wraps round the seam. */
  const splat = (cx, cy, rx, ry, colour, alpha, add = false, profile = null) => {
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(height - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y += 1) {
      const dy = (y - cy) / ry;
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x - cx) / rx;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 1) continue;
        const d = Math.sqrt(d2);
        const w = alpha * (profile ? profile(d) : (1 - d) * (1 - d * 0.5));
        const i = (y * width + (((x % width) + width) % width)) * 3;
        if (add) {
          buffer[i] += colour[0] * w;
          buffer[i + 1] += colour[1] * w;
          buffer[i + 2] += colour[2] * w;
        } else {
          buffer[i] += (colour[0] - buffer[i]) * w;
          buffer[i + 1] += (colour[1] - buffer[i + 1]) * w;
          buffer[i + 2] += (colour[2] - buffer[i + 2]) * w;
        }
      }
    }
  };
  const glow = sky.glow;
  const [gx, gy] = glow ? skyPoint(glow.az, glow.el, width, height) : [0, 0];
  const stretch = glow ? 1 / Math.max(0.25, Math.cos((glow.el * Math.PI) / 180)) : 1;
  // Stars, under everything: a few, brighter near the top.
  for (let k = 0; k < (sky.stars ?? 0); k += 1) {
    const x = Math.floor(random() * width);
    const y = Math.floor(height * (0.02 + random() * 0.42));
    const bright = 90 + random() * 150;
    const i = (y * width + x) * 3;
    buffer[i] += bright * 0.8;
    buffer[i + 1] += bright * 0.85;
    buffer[i + 2] += bright;
  }
  // The glow: a wide soft halo, tinted by the sun.
  if (glow) {
    const radius = (glow.size / 360) * width * 3.2;
    splat(gx, gy, radius * stretch, radius, glow.colour, glow.strength, true, (d) => (d < 0.3125 ? 0.6 - 0.35 * (d / 0.3125) : 0.25 * (1 - (d - 0.3125) / 0.6875)) * 1);
  }
  // Cloud banks: soft dark and lighter masses, flattened, thickest overhead, wrapped round the seam, thinned where the sun breaks through.
  const c = sky.clouds;
  const clear = (x, y) => {
    if (!glow) return 0;
    let dx = Math.abs(x - gx);
    dx = Math.min(dx, width - dx) / stretch;
    const radius = (glow.size / 360) * width * 2.6;
    return glow.hole * Math.exp(-((dx * dx + (y - gy) * (y - gy) * 1.6) / (radius * radius)));
  };
  for (let k = 0; k < c.count; k += 1) {
    const x = random() * width;
    const y = height * (c.from + random() * (c.to - c.from));
    const size = c.size[0] + random() * (c.size[1] - c.size[0]);
    const dark = random() < c.darkShare;
    const alpha = (dark ? c.aDark : c.aLight) * (1 - clear(x, y)) * 1.7;
    if (alpha < 0.008) continue;
    splat(x, y, size, size * c.flat, dark ? c.dark : c.light, alpha);
  }
  // The rims of cloud near the glow catch its light, and the disc (the moon, a low sun) sits over it, its edge soft.
  if (glow) {
    for (let k = 0; k < 60; k += 1) {
      const a = random() * Math.PI * 2;
      const d = (0.6 + random() * 1.2) * (glow.size / 360) * width * 1.6;
      const size = 14 + random() * 50;
      splat(gx + Math.cos(a) * d * stretch, gy + Math.sin(a) * d * 0.4, size, size * 0.34, glow.colour, 0.14 * glow.strength, true);
    }
    if (glow.disc > 0) {
      const radius = Math.max(3, (glow.size / 360) * width * 0.22) * 2.2;
      splat(gx, gy, radius * stretch, radius, [255, 255, 250], glow.disc * 1.4, true, (d) => (d < 0.45 ? 1 - 0.2 * (d / 0.45) : 0.8 * (1 - (d - 0.45) / 0.55)));
    }
  }
  // The haze at the horizon: the cloud thins into the fog's colour, so the seam is a distance, not a line; and below it, only that colour.
  const horizon = hexToRgb(sky.horizon);
  const hazeFrom = Math.floor(height * 0.34);
  const hazeTo = Math.floor(height * 0.5);
  const dither = ktRandom(seed + 1);
  const image = g.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    let f = 1;
    if (y < hazeFrom) f = 0;
    else if (y < hazeTo) {
      const t = (y - hazeFrom) / (hazeTo - hazeFrom);
      f = 0.9 * t * t * (3 - 2 * t);
    }
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      const k = (y * width + x) * 4;
      // (A whisper of random noise, not a pattern, to hide the banding of 8-bit colour.)
      const noise = dither() - 0.5;
      for (let ch = 0; ch < 3; ch += 1) image.data[k + ch] = Math.max(0, Math.min(255, buffer[i + ch] + (horizon[ch] - buffer[i + ch]) * f + noise));
      image.data[k + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  return canvas;
}

/** '#rrggbb' as [r, g, b] 0..255. */
export function hexToRgb(hex) {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** The map of a shaft of light's card: bright along its axis and soft to the sides, in faint streaks, gone at its foot (u across, v along: 0 at the sky end). */
export function stageShaftCanvas(width = 128, height = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  const image = g.createImageData(width, height);
  const random = ktRandom(77);
  const streak = new Float32Array(width);
  for (let x = 0; x < width; x += 1) streak[x] = random();
  for (let x = 1; x < width - 1; x += 1) streak[x] = (streak[x - 1] + streak[x] * 2 + streak[x + 1]) / 4;
  for (let y = 0; y < height; y += 1) {
    const along = y / (height - 1);
    const fade = Math.min(1, along * 6) * (1 - Math.pow(along, 1.6));
    for (let x = 0; x < width; x += 1) {
      const across = (x / (width - 1)) * 2 - 1;
      const profile = Math.exp(-across * across * 3.4);
      const value = profile * fade * (0.55 + 0.9 * streak[x]);
      const k = (y * width + x) * 4;
      image.data[k] = 255;
      image.data[k + 1] = 255;
      image.data[k + 2] = 255;
      image.data[k + 3] = Math.min(255, value * 255);
    }
  }
  g.putImageData(image, 0, 0);
  return canvas;
}

/** A soft round pool of light (white, fading to nothing at its edge), for the sun's patch on the sea. */
export function stagePoolCanvas(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  return canvas;
}
