// Scenery variants: skyball (proof of concept). See src/scenery.js for the contract.
//
// The distant landscape is a picture on a ball round the camera (it follows
// the camera, so it never comes nearer: no parallax, no geometry, one draw):
//  - skyball-painted: a band round the horizon, painted per place at load from
//    PLACE_SCENERY (layered fBm ridgelines, volcanoes, forested ranges, hedged
//    pasture) with aerial perspective; transparent above the land so the
//    look's own sky shows through, its haze following the fog colour.
//  - skyball-photo: a real CC0 panorama (Poly Haven) with its own sky and land,
//    turned so its sun stands where the game's sun does; the look's dome is
//    hidden and the fog takes the photograph's horizon colour.

/* global THREE */
import { SKYBALL_PHOTO_DATA } from './skyball-photo-data.js';

const SKYBALL = {
  radius: 30,
  // What the painted band covers, in degrees of elevation from the camera.
  low: -10,
  high: 26,
  width: 4096,
  height: 460,
  // The eye the painting is drawn for (the vista camera stands about here).
  eye: 2,
  // The game's sun, as seen round the horizon (atan2(z, x) of probe-lite's sun).
  sun: [0.62, 0.62, 0.48],
};

const SKYBALL_DEG = Math.PI / 180;

// ---- the ball ---------------------------------------------------------------

const SKYBALL_VERTEX = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

// Painted: colour and coverage in uMap, the share of haze in uHaze.r; the haze is the live fog colour.
const SKYBALL_PAINTED_FRAGMENT = `
uniform sampler2D uMap; uniform sampler2D uHaze; uniform vec3 uHorizon; uniform float uLow; uniform float uHigh;
varying vec3 vDir;
void main() {
  vec3 d = normalize( vDir );
  float elevation = asin( clamp( d.y, -1.0, 1.0 ) );
  float v = ( elevation - uLow ) / ( uHigh - uLow );
  if ( v > 1.0 ) discard;
  vec2 uv = vec2( atan( d.z, d.x ) * 0.15915494 + 0.5, clamp( v, 0.001, 0.999 ) );
  vec4 paint = texture2D( uMap, uv );
  float haze = texture2D( uHaze, uv ).r;
  // Below the band (where the world's ground normally covers it): the horizon colour.
  float under = smoothstep( 0.0, -0.05, v );
  float alpha = mix( paint.a, 1.0, under );
  if ( alpha < 0.004 ) discard;
  gl_FragColor = vec4( mix( mix( paint.rgb, uHorizon, haze ), uHorizon, under ), alpha );
}`;

// Photo: a sharp band round the horizon, a small cap of sky above; below the horizon the photograph's own ground fades into the fog colour.
const SKYBALL_PHOTO_FRAGMENT = `
uniform sampler2D uBand; uniform sampler2D uSky; uniform vec3 uHorizon; uniform float uTurn;
uniform vec2 uBandRange; uniform vec2 uSkyRange; uniform vec2 uFade;
varying vec3 vDir;
void main() {
  vec3 d = normalize( vDir );
  float elevation = asin( clamp( d.y, -1.0, 1.0 ) );
  float u = fract( atan( d.z, d.x ) * 0.15915494 + 0.5 + uTurn );
  vec3 band = texture2D( uBand, vec2( u, clamp( ( elevation - uBandRange.x ) / ( uBandRange.y - uBandRange.x ), 0.002, 0.998 ) ) ).rgb;
  vec3 sky = texture2D( uSky, vec2( u, clamp( ( elevation - uSkyRange.x ) / ( uSkyRange.y - uSkyRange.x ), 0.004, 0.996 ) ) ).rgb;
  float toSky = smoothstep( uSkyRange.x + 0.01, uBandRange.y - 0.01, elevation );
  vec3 colour = mix( band, sky, toSky );
  colour = mix( uHorizon, colour, smoothstep( uFade.x, uFade.y, elevation ) );
  gl_FragColor = vec4( colour, 1.0 );
}`;

/** The ball, or only the part of it between two elevations (degrees): what is not covered costs no pixels. */
function skyballBall(material, low = -90, high = 90) {
  const thetaStart = (90 - high) * SKYBALL_DEG;
  const thetaLength = (high - low) * SKYBALL_DEG;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(SKYBALL.radius, 96, Math.max(4, Math.round((high - low) / 4)), 0, Math.PI * 2, thetaStart, thetaLength), material);
  // After the look's dome (-1000), before everything else; never hides what is drawn after it.
  ball.renderOrder = -990;
  ball.frustumCulled = false;
  ball.onBeforeRender = (renderer, scene, camera) => {
    camera.getWorldPosition(ball.position);
    ball.parent?.worldToLocal(ball.position);
    ball.updateMatrixWorld();
  };
  return ball;
}

function skyballTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  // No mips: the seam where atan wraps would pick the smallest one along a line.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** The colour the look gives the horizon now (the fog colour). */
const skyballHorizonOf = (view) => view.scene.fog?.color ?? new THREE.Color(view.light?.background ?? 0xbcd8f0);

// ---- noise ------------------------------------------------------------------

/** A 256 x 256 table of random values; value noise over it wraps every `period` cells across. */
function skyballNoiseTable(rng) {
  const table = new Float32Array(65536);
  for (let i = 0; i < table.length; i += 1) table[i] = rng();
  return table;
}

function skyballNoise(table, x, y, period = 256) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let fx = x - xi;
  let fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % period) + period) % period & 255;
  const x1 = (((xi + 1) % period) + period) % period & 255;
  const y0 = (yi & 255) << 8;
  const y1 = ((yi + 1) & 255) << 8;
  const a = table[y0 + x0] + (table[y0 + x1] - table[y0 + x0]) * fx;
  const b = table[y1 + x0] + (table[y1 + x1] - table[y1 + x0]) * fx;
  return a + (b - a) * fy;
}

/** fBm round the horizon: `turn` 0..1 round, `cells` the coarsest octave's cells round (wraps seamlessly). */
function skyballRidgeNoise(table, turn, cells, octaves, row, gain = 0.5) {
  let sum = 0;
  let amplitude = 1;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const period = cells << octave;
    sum += amplitude * skyballNoise(table, turn * period, row + octave * 17.3, period);
    norm += amplitude;
    amplitude *= gain;
  }
  return sum / norm;
}

/** fBm over the picture (x in pixels, y in pixels), wrapping across the width W. */
function skyballAreaNoise(table, x, y, width, scale, octaves) {
  let sum = 0;
  let amplitude = 1;
  let norm = 0;
  let cells = Math.max(1, Math.round(width / scale));
  let frequency = cells / width;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * skyballNoise(table, x * frequency, y * frequency + octave * 31.7, cells);
    norm += amplitude;
    amplitude *= 0.5;
    cells *= 2;
    frequency *= 2;
  }
  return sum / norm;
}

const skyballClamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const skyballSmooth = (a, b, x) => {
  const t = skyballClamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const skyballRgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const skyballMixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---- the painting -----------------------------------------------------------

/**
 * A painter for one band: layers are painted far to near, each a ridgeline
 * (height in metres at each turn round the horizon, at its distance) filled
 * down to the bottom, shaded by its slope against the sun and textured by
 * kind; nearer layers cover farther ones. Colour, coverage and haze are kept
 * apart so the haze can take the live fog colour in the shader.
 */
function skyballPainter(rng) {
  const W = SKYBALL.width;
  const H = SKYBALL.height;
  const colour = new Float32Array(W * H * 3);
  const cover = new Float32Array(W * H);
  const haze = new Float32Array(W * H);
  const table = skyballNoiseTable(rng);
  const lowRad = SKYBALL.low * SKYBALL_DEG;
  const highRad = SKYBALL.high * SKYBALL_DEG;
  const rowOf = (elevation) => ((highRad - elevation) / (highRad - lowRad)) * H;
  const elevationOf = (row) => highRad - (row / H) * (highRad - lowRad);
  const sunLength = Math.hypot(...SKYBALL.sun);
  const sun = SKYBALL.sun.map((c) => c / sunLength);
  // Smooth noise fields over the picture, made once at reduced size and sampled bilinearly (x wraps).
  const makeField = (shrink, scale, octaves, offset) => {
    const w = W / shrink;
    const h = Math.ceil(H / shrink) + 2;
    const values = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) values[y * w + x] = skyballAreaNoise(table, x, y + offset, w, scale / shrink, octaves);
    return (px, py) => {
      const fx = px / shrink;
      const fy = Math.min(h - 1.001, Math.max(0, py / shrink));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const a = ((x0 % w) + w) % w;
      const b = (a + 1) % w;
      const top = values[y0 * w + a] * (1 - tx) + values[y0 * w + b] * tx;
      const bottom = values[(y0 + 1) * w + a] * (1 - tx) + values[(y0 + 1) * w + b] * tx;
      return top + (bottom - top) * ty;
    };
  };
  const big = makeField(4, 160, 3, 0);
  const mid = makeField(2, 36, 3, 120);
  const fine = (x, y) => skyballNoise(table, x * 0.5, y * 0.8 + 77, W / 2);

  function put(index, rgb, alpha, hazeShare) {
    const keep = 1 - alpha;
    colour[index * 3] = colour[index * 3] * keep + rgb[0] * alpha;
    colour[index * 3 + 1] = colour[index * 3 + 1] * keep + rgb[1] * alpha;
    colour[index * 3 + 2] = colour[index * 3 + 2] * keep + rgb[2] * alpha;
    haze[index] = haze[index] * keep + hazeShare * alpha;
    cover[index] = cover[index] * keep + alpha;
  }

  /** Lambert of a face looking back at the eye from turn `turn`, tilted by slope (along the ridge) and lean (up). */
  function lightOf(turn, slope, lean) {
    const angle = (turn - 0.5) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    // Normal: back towards the eye, up by lean, sideways (along -tangent) by slope.
    let nx = -dx * 0.8 + dz * slope;
    let ny = lean;
    let nz = -dz * 0.8 - dx * slope;
    const length = Math.hypot(nx, ny, nz);
    nx /= length;
    ny /= length;
    nz /= length;
    return Math.max(0, nx * sun[0] + ny * sun[1] + nz * sun[2]);
  }

  /**
   * One layer: { distance, haze, profile(turn) -> metres, shade(x, y, depth, turn, light) -> rgb,
   * lean?, foot? } where depth is 0 at the crest and 1 at the layer's foot (its elevation at the ground).
   */
  function layer({ distance, haze: hazeShare, profile, shade, lean = 0.9, footHaze = 0.12, relief = 1, dabs }) {
    const tops = new Float32Array(W);
    const heights = new Float32Array(W);
    for (let x = 0; x < W; x += 1) {
      heights[x] = profile((x + 0.5) / W);
      tops[x] = rowOf(Math.atan2(heights[x] - SKYBALL.eye, distance));
    }
    const footRow = rowOf(Math.atan2(-SKYBALL.eye, distance));
    // The ridge's slope along the horizon, from the profile smoothed over a few metres (not its fine teeth).
    const reach = 12;
    const step = (Math.PI * 2 * distance) / W;
    const shift = (distance * 7.31) % W;
    for (let x = 0; x < W; x += 1) {
      const turn = (x + 0.5) / W;
      let ahead = 0;
      let behind = 0;
      for (let k = 1; k <= reach; k += 1) {
        ahead += heights[(x + k) % W];
        behind += heights[(x - k + W) % W];
      }
      const slope = ((ahead - behind) / reach / ((reach + 1) * step)) * 1.4;
      const top = tops[x];
      const first = Math.max(0, Math.floor(top));
      for (let y = first; y < H; y += 1) {
        const alpha = y === first ? skyballClamp(first + 1 - top) : 1;
        if (alpha <= 0) continue;
        const depth = skyballClamp((y - top) / Math.max(1, footRow - top));
        // Spurs and gullies: the noise fields' slopes tilt the face, across and up.
        const sx = x + shift;
        const m = mid(sx, y);
        const b = big(sx, y);
        const across = ((mid(sx + 2, y) - m) * 14 + (big(sx + 4, y) - b) * 16) * relief;
        const up = ((mid(sx, y + 2) - m) * 10 + (big(sx, y + 4) - b) * 10) * relief;
        const light = lightOf(turn, slope * (1 - depth * 0.5) + across, lean - depth * 0.3 + up);
        const rgb = shade(x, y, depth, turn, light, top);
        put(y * W + x, rgb, alpha, skyballClamp(hazeShare + footHaze * depth * depth));
      }
    }
    dabs?.({ tops, distance, hazeShare, footRow });
  }

  /** A soft round dab of colour (tree crowns, bushes) at (x, y), rx by ry pixels, lit from the sun's side. */
  function dab(cx, cy, rx, ry, rgb, hazeShare, litSide = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      if (y < 0 || y >= H) continue;
      for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i += 1) {
        const dx = (i - cx) / rx;
        const dy = (y - cy) / ry;
        const r = dx * dx + dy * dy;
        if (r > 1) continue;
        const alpha = skyballClamp((1 - r) * 3);
        const lit = 0.75 + 0.35 * skyballClamp(-dy * 0.8 + dx * 0.5 * litSide);
        const x = ((i % W) + W) % W;
        put(y * W + x, [rgb[0] * lit, rgb[1] * lit, rgb[2] * lit], alpha, hazeShare);
      }
    }
  }

  /** The canvases: colour with coverage as alpha, and haze in red. */
  function finish() {
    const paint = document.createElement('canvas');
    const mist = document.createElement('canvas');
    paint.width = mist.width = W;
    paint.height = mist.height = H;
    const paintData = paint.getContext('2d').createImageData(W, H);
    const mistData = mist.getContext('2d').createImageData(W, H);
    for (let i = 0; i < W * H; i += 1) {
      const alpha = cover[i];
      const k = i * 4;
      // Un-premultiply (coverage was accumulated over black).
      const inverse = alpha > 0 ? 1 / alpha : 0;
      paintData.data[k] = Math.min(255, colour[i * 3] * inverse * 255);
      paintData.data[k + 1] = Math.min(255, colour[i * 3 + 1] * inverse * 255);
      paintData.data[k + 2] = Math.min(255, colour[i * 3 + 2] * inverse * 255);
      paintData.data[k + 3] = alpha * 255;
      mistData.data[k] = mistData.data[k + 1] = mistData.data[k + 2] = Math.min(255, haze[i] * inverse * 255);
      mistData.data[k + 3] = 255;
    }
    paint.getContext('2d').putImageData(paintData, 0, 0);
    mist.getContext('2d').putImageData(mistData, 0, 0);
    return { paint, mist };
  }

  return { W, H, table, big, mid, fine, layer, dab, rowOf, elevationOf, finish };
}

/** The turn (0..1 round the band) of an angle in the PLACE_SCENERY convention (radians from +x towards +z). */
const skyballTurnOf = (angle) => ((angle / (Math.PI * 2) + 0.5) % 1 + 1) % 1;
/** The shortest way round from turn a to turn b, in turns (-0.5..0.5). */
const skyballTurnDelta = (a, b) => ((b - a + 1.5) % 1) - 0.5;

/** Shading helpers by kind of land. */
function skyballGrass(painter, base, light, x, y, depth, variety) {
  const patch = painter.mid(x * 0.45 + 500, y);
  const fine = painter.fine(x, y);
  const tone = 0.62 + light * 0.62 + (patch - 0.5) * variety + (fine - 0.5) * 0.08 - depth * 0.08;
  return [base[0] * tone, base[1] * tone, base[2] * tone];
}

function skyballForest(painter, base, light, x, y, depth) {
  // Crowns: small bright dots on a dark mass.
  const crowns = painter.fine(x * 0.9, y * 1.1) * 0.6 + painter.fine(x * 1.8 + 7, y * 2.0) * 0.4;
  const stand = painter.big(x * 0.7 + 900, y);
  const tone = 0.45 + light * 0.6 + (crowns - 0.5) * 0.45 + (stand - 0.5) * 0.25 - depth * 0.05;
  return [base[0] * tone, base[1] * tone, base[2] * tone];
}

// ---- per place --------------------------------------------------------------

/** Rolling pasture (meadow, field): far blue downs, nearer hedged hills with treelines and copses. */
function skyballPaintRolling(painter, spec, rng) {
  const { W, table, layer, dab } = painter;
  const hills = spec.hills;
  const grass = skyballRgb(hills.colour);
  const wood = skyballRgb(spec.trees.colour ?? 0x3f6a2a);
  const [lowest, highest] = hills.height;
  const ranges = [
    { distance: hills.to * 2.4, height: highest * 3.4, haze: 0.7, cells: 5, hedges: false, trees: 0 },
    { distance: hills.to * 1.5, height: highest * 1.6, haze: 0.52, cells: 8, hedges: true, trees: 60 },
    { distance: hills.to, height: highest * 0.85, haze: 0.36, cells: 12, hedges: true, trees: 110 },
    { distance: (hills.from + hills.to) / 2, height: lowest * 1.0, haze: 0.2, cells: 18, hedges: true, trees: 150 },
  ];
  ranges.forEach((range, index) => {
    const row = index * 23.1 + rng() * 50;
    const tint = skyballMixRgb(grass, [0.42, 0.52, 0.36], 0.25 + index * 0.05);
    layer({
      distance: range.distance,
      haze: range.haze,
      footHaze: 0.1,
      lean: 1.0,
      relief: 0.4,
      profile: (turn) => {
        const swell = skyballRidgeNoise(table, turn, range.cells, 4, row, 0.42);
        return range.height * (0.1 + 1.4 * Math.pow(swell, 1.7));
      },
      shade: (x, y, depth, turn, light) => {
        let rgb = skyballGrass(painter, tint, light, x, y, depth, 0.35);
        if (range.hedges) {
          // Fields: cells of slightly different greens and straw, bounded by dark hedgerows.
          const fieldX = x / (W / (range.cells * 9));
          const fieldY = y / (3 + index * 2.5);
          const warp = skyballNoise(table, fieldX * 0.7, fieldY * 0.7 + 90) * 1.4;
          const cellX = fieldX + warp;
          const cellY = fieldY + warp * 0.6;
          const hue = skyballNoise(table, Math.floor(cellX) * 3.1, Math.floor(cellY) * 5.3 + 40);
          if (hue > 0.74) rgb = skyballMixRgb(rgb, [rgb[0] * 1.3, rgb[1] * 1.15, rgb[2] * 0.85], 0.55);
          else if (hue < 0.25) rgb = skyballMixRgb(rgb, [rgb[0] * 0.88, rgb[1] * 0.96, rgb[2] * 0.85], 0.6);
          const edge = Math.min(Math.abs(cellX - Math.round(cellX)) * (W / (range.cells * 7)) * 0.25, Math.abs(cellY - Math.round(cellY)) * 3);
          if (edge < 0.3) rgb = skyballMixRgb(rgb, [wood[0] * (0.7 + light * 0.4), wood[1] * (0.7 + light * 0.4), wood[2] * (0.7 + light * 0.4)], 0.35 + index * 0.1);
        }
        return rgb;
      },
      dabs: ({ tops, hazeShare }) => {
        // Copses and hedgerow trees sitting on the hill, some on the skyline.
        for (let count = 0; count < range.trees; count += 1) {
          const x = Math.floor(rng() * W);
          const clump = 1 + Math.floor(rng() * 5);
          const sink = rng() < 0.35 ? 0 : 2 + rng() * 26;
          const size = (1.6 + rng() * 2.0) * (60 / range.distance) * 2;
          for (let tree = 0; tree < clump; tree += 1) {
            const at = x + (tree - clump / 2) * size * 1.3 + rng() * size;
            const top = tops[((Math.floor(at) % W) + W) % W];
            const shade = 0.7 + rng() * 0.3;
            dab(at, top + sink - size * 0.55, size * (0.8 + rng() * 0.4), size * (0.9 + rng() * 0.3), [wood[0] * shade, wood[1] * shade, wood[2] * shade], hazeShare);
          }
        }
      },
    });
  });
}

/** The Valley of Mexico: bare blue ranges far off, the two volcanoes (snow on their crowns), dry ridges nearer. */
function skyballPaintPlain(painter, spec, rng) {
  const { W, table, layer, rowOf } = painter;
  const dry = skyballRgb(spec.hills.colour);
  const rock = [0.42, 0.42, 0.46];
  const snow = [0.95, 0.96, 1.0];
  const volcanoes = spec.mountains.map((mountain) => ({ ...mountain, turn: skyballTurnOf(mountain.angle) }));
  const volcanoDistance = Math.max(...volcanoes.map((mountain) => mountain.distance)) * 1.7;
  // The volcano's height round the horizon (in metres at volcanoDistance).
  const volcanoHeight = (turn) => {
    let best = 0;
    for (const mountain of volcanoes) {
      const scale = volcanoDistance / mountain.distance;
      const height = mountain.height * scale * 0.6;
      const halfWidth = (mountain.radius * 0.95) / (Math.PI * 2 * mountain.distance);
      const along = Math.abs(skyballTurnDelta(mountain.turn, turn)) / halfWidth;
      if (along > 1.6) continue;
      let shape;
      if (mountain.shape === 'cone') {
        // Concave flanks, a flat crater rim.
        shape = Math.pow(skyballClamp(1 - along / 1.6), 1.7);
        shape = Math.min(shape, 0.97) + skyballRidgeNoise(table, turn, 64, 3, 300, 0.5) * 0.04 * shape;
      } else {
        // Iztaccíhuatl: a long ridge of several summits (the sleeping woman).
        const body = skyballSmooth(1.6, 0.55, along);
        const summits = 0.78 + 0.22 * skyballRidgeNoise(table, turn, 96, 3, 340, 0.55);
        shape = Math.pow(body, 1.2) * summits;
      }
      best = Math.max(best, height * shape);
    }
    return best;
  };
  const volcanoHeights = new Float32Array(W);
  for (let x = 0; x < W; x += 1) volcanoHeights[x] = volcanoHeight((x + 0.5) / W);
  // A blue range round the far horizon.
  layer({
    distance: 260,
    haze: 0.66,
    footHaze: 0.15,
    profile: (turn) => 8 + 40 * Math.pow(skyballRidgeNoise(table, turn, 5, 5, 200, 0.5), 2.2),
    shade: (x, y, depth, turn, light) => skyballGrass(painter, [0.4, 0.42, 0.44], light, x, y, depth, 0.2),
  });
  // The volcanoes.
  layer({
    distance: volcanoDistance,
    haze: 0.4,
    footHaze: 0.25,
    lean: 0.6,
    profile: (turn) => volcanoHeights[Math.min(W - 1, Math.floor(turn * W))],
    shade: (x, y, depth, turn, light, top) => {
      const elevation = painter.elevationOf(y);
      const height = volcanoHeights[x];
      let snowShare = 0;
      let nearest = Infinity;
      for (const mountain of volcanoes) {
        const peak = Math.atan2(mountain.height * (volcanoDistance / mountain.distance) * 0.6 - SKYBALL.eye, volcanoDistance);
        const line = peak * (1 - mountain.snow * 0.75);
        // Snow reaches down the gullies.
        const fingers = (painter.mid(x * 1.6, y * 0.5) - 0.5) * 0.03;
        const near = Math.abs(skyballTurnDelta(mountain.turn, turn));
        if (near < nearest) {
          nearest = near;
          snowShare = skyballSmooth(line - 0.005, line + 0.01, elevation + fingers);
        }
      }
      const streak = painter.mid(x * 1.5 + 300, y * 0.3);
      const tone = 0.5 + light * 0.75 + (streak - 0.5) * 0.35;
      let rgb = [rock[0] * tone, rock[1] * tone, rock[2] * tone];
      // Lower down the volcano wears scrub and forest.
      rgb = skyballMixRgb(rgb, [0.3 * tone, 0.36 * tone, 0.28 * tone], skyballSmooth(0.35, 0.8, depth));
      const snowTone = 0.62 + light * 0.45;
      return skyballMixRgb(rgb, [snow[0] * snowTone, snow[1] * snowTone, snow[2] * snowTone], snowShare * (height > 0 ? 1 : 0));
    },
  });
  // Dry ridges, nearer and nearer.
  const [lowest, highest] = spec.hills.height;
  [
    { distance: spec.hills.to * 1.5, height: highest * 2.0, haze: 0.38, cells: 10 },
    { distance: spec.hills.to, height: highest * 1.2, haze: 0.24, cells: 14 },
    { distance: spec.hills.from, height: lowest * 0.9, haze: 0.12, cells: 22 },
  ].forEach((range, index) => {
    const row = 400 + index * 41;
    layer({
      distance: range.distance,
      haze: range.haze,
      lean: 0.75,
      profile: (turn) => {
        // Gaps where the volcanoes stand, so the nearer ridges do not bury them.
        let open = 1;
        for (const mountain of volcanoes) open = Math.min(open, skyballSmooth(0.02, 0.09, Math.abs(skyballTurnDelta(mountain.turn, turn))));
        const ridge = skyballRidgeNoise(table, turn, range.cells, 5, row, 0.5);
        return range.height * (0.15 + Math.pow(ridge, 2) * 1.5) * (0.35 + 0.65 * open);
      },
      shade: (x, y, depth, turn, light) => {
        let rgb = skyballGrass(painter, dry, light, x, y, depth, 0.45);
        // Scrub specks and bare earth.
        const speck = painter.fine(x * 1.3, y * 1.6 + 200);
        if (speck > 0.78) rgb = skyballMixRgb(rgb, [0.28, 0.32, 0.22], 0.55);
        const bare = painter.mid(x * 0.4 + 1300, y);
        if (bare > 0.62) rgb = skyballMixRgb(rgb, [rgb[0] * 1.25, rgb[1] * 1.1, rgb[2] * 0.95], 0.6);
        return rgb;
      },
    });
  });
  return rowOf;
}

/** Sekigahara: forested ranges all round (a gap kept for the castle on its hill), forested foothills nearer. */
function skyballPaintForested(painter, spec, rng) {
  const { W, table, layer } = painter;
  const ring = spec.mountains.find((mountain) => mountain.ring) ?? { from: 42, to: 70, height: [9, 18], colour: 0x6a7a88 };
  const forest = skyballRgb(spec.trees.colour ?? 0x2a4430);
  const foothill = skyballRgb(spec.hills.colour);
  const clear = (spec.keepClear ?? []).map(({ at, radius }) => ({ turn: skyballTurnOf(Math.atan2(at[1], at[0])), half: radius / (Math.PI * 2 * Math.hypot(at[0], at[1])) }));
  const [lowest, highest] = ring.height;
  const ranges = [
    { distance: ring.to * 2.6, height: highest * 2.5, haze: 0.62, cells: 5, kind: 'far' },
    { distance: ring.to * 1.6, height: highest * 2.0, haze: 0.42, cells: 8, kind: 'forest' },
    { distance: ring.to, height: highest * 1.15, haze: 0.28, cells: 11, kind: 'forest' },
    { distance: ring.from * 1.05, height: lowest * 0.8, haze: 0.15, cells: 18, kind: 'foothill', keepClear: true },
  ];
  ranges.forEach((range, index) => {
    const row = 600 + index * 37;
    layer({
      distance: range.distance,
      haze: range.haze,
      lean: 0.7,
      profile: (turn) => {
        let height = range.height * (0.2 + 1.1 * Math.pow(skyballRidgeNoise(table, turn, range.cells, 5, row, 0.52), 1.8));
        // A serrated treeline on the forested crests.
        if (range.kind !== 'far') height += (skyballNoise(table, turn * 2048, row + 5, 2048) - 0.5) * range.height * 0.035 + skyballNoise(table, turn * 512, row + 9, 512) * range.height * 0.03;
        if (range.keepClear) for (const gap of clear) height *= 0.25 + 0.75 * skyballSmooth(gap.half * 0.9, gap.half * 2.2, Math.abs(skyballTurnDelta(gap.turn, turn)));
        return height;
      },
      shade: (x, y, depth, turn, light) => {
        if (range.kind === 'far') return skyballGrass(painter, [0.36, 0.42, 0.46], light, x, y, depth, 0.2);
        const base = range.kind === 'foothill' ? skyballMixRgb(forest, foothill, 0.35) : skyballMixRgb(forest, [0.3, 0.38, 0.4], 0.15);
        let rgb = skyballForest(painter, base, light, x, y, depth);
        // Clearings, terraced fields and bare rock on the slopes.
        const glade = painter.mid(x * 1.3 + 2100, y * 1.2);
        if (glade > 0.7) rgb = skyballMixRgb(rgb, [foothill[0] * (0.6 + light * 0.4), foothill[1] * (0.6 + light * 0.4), foothill[2] * (0.55 + light * 0.35)], 0.6 * skyballSmooth(0.7, 0.76, glade));
        if (range.kind === 'forest' && depth < 0.18 && glade < 0.3) rgb = skyballMixRgb(rgb, [0.5 * (0.6 + light), 0.5 * (0.6 + light), 0.48 * (0.6 + light)], 0.4);
        return rgb;
      },
    });
  });
}

function skyballPaint(place, spec, rng) {
  const painter = skyballPainter(rng);
  if (place === 'plain') skyballPaintPlain(painter, spec, rng);
  else if (place === 'sengoku') skyballPaintForested(painter, spec, rng);
  else skyballPaintRolling(painter, spec, rng);
  return painter.finish();
}

// ---- photo ------------------------------------------------------------------

// Which panorama each place wears, and how far (in turns) to turn it past lining its sun up with the game's.
const SKYBALL_PHOTO_PLACES = {
  meadow: { photo: 'meadow', turn: 0 },
  field: { photo: 'meadow', turn: 0 },
  plain: { photo: 'plain', turn: 0 },
  sengoku: { photo: 'valley', turn: 0 },
};

const skyballPhotoTextures = {};

function skyballPhotoTexture(key, part) {
  const id = `${key}:${part}`;
  if (skyballPhotoTextures[id]) return skyballPhotoTextures[id];
  const texture = new THREE.Texture();
  const image = new Image();
  const started = performance.now();
  image.onload = () => {
    texture.image = image;
    texture.needsUpdate = true;
    texture.userData = { decodeMs: performance.now() - started };
  };
  image.src = `data:image/jpeg;base64,${SKYBALL_PHOTO_DATA[key][part].jpeg}`;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  skyballPhotoTextures[id] = texture;
  return texture;
}

// ---- the variants -----------------------------------------------------------

/** Variants: { id, label, blurb, replaces: [tags], build({ place, view, spec, rng }) -> THREE.Group, apply?({ place, view, spec, group }) }. */
export const SKYBALL_VARIANTS = [
  {
    id: 'skyball-painted',
    label: 'Skyball: painted band',
    blurb: 'A band round the horizon painted at load from the place\'s description (ridges, volcanoes, forests, hedged hills), hazed to the fog colour; the look\'s sky shows above it.',
    replaces: ['hills', 'mountains'],
    build({ place, spec, rng }) {
      const started = performance.now();
      const { paint, mist } = skyballPaint(place, spec, rng);
      const material = new THREE.ShaderMaterial({
        vertexShader: SKYBALL_VERTEX,
        fragmentShader: SKYBALL_PAINTED_FRAGMENT,
        uniforms: {
          uMap: { value: skyballTexture(paint) },
          uHaze: { value: skyballTexture(mist) },
          uHorizon: { value: new THREE.Color() },
          uLow: { value: SKYBALL.low * SKYBALL_DEG },
          uHigh: { value: SKYBALL.high * SKYBALL_DEG },
        },
        side: THREE.BackSide,
        // Blended, but drawn in the opaque pass (by renderOrder, first), so the world is drawn over it.
        blending: THREE.CustomBlending,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        depthWrite: false,
        depthTest: false,
        fog: false,
      });
      const group = new THREE.Group();
      // Only the band: the sky above and the ground below cost nothing.
      group.add(skyballBall(material, SKYBALL.low, SKYBALL.high));
      group.userData.buildMs = performance.now() - started;
      return group;
    },
    apply({ view, group }) {
      group.children[0].material.uniforms.uHorizon.value.copy(skyballHorizonOf(view));
    },
  },
  {
    id: 'skyball-photo',
    label: 'Skyball: photo panorama',
    blurb: 'A real CC0 panorama (Poly Haven) with its own sky and land, turned so its sun stands where the game\'s does; the look\'s sky dome is hidden and the fog takes the photograph\'s horizon.',
    replaces: ['hills', 'mountains'],
    build({ place }) {
      const started = performance.now();
      const choice = SKYBALL_PHOTO_PLACES[place] ?? SKYBALL_PHOTO_PLACES.meadow;
      const data = SKYBALL_PHOTO_DATA[choice.photo];
      // Line the picture's sun (at u = sunU) up with the game's sun round the horizon.
      const sunTurn = skyballTurnOf(Math.atan2(SKYBALL.sun[2], SKYBALL.sun[0]));
      const turn = data.sunU - sunTurn + choice.turn;
      const material = new THREE.ShaderMaterial({
        vertexShader: SKYBALL_VERTEX,
        fragmentShader: SKYBALL_PHOTO_FRAGMENT,
        uniforms: {
          uBand: { value: skyballPhotoTexture(choice.photo, 'band') },
          uSky: { value: skyballPhotoTexture(choice.photo, 'sky') },
          uHorizon: { value: new THREE.Color() },
          uTurn: { value: turn },
          uBandRange: { value: new THREE.Vector2(data.band.low * SKYBALL_DEG, data.band.high * SKYBALL_DEG) },
          uSkyRange: { value: new THREE.Vector2(data.sky.low * SKYBALL_DEG, data.sky.high * SKYBALL_DEG) },
          uFade: { value: new THREE.Vector2(-7 * SKYBALL_DEG, -1.5 * SKYBALL_DEG) },
        },
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
      });
      const group = new THREE.Group();
      // Down to just below the horizon; under that the background (the same horizon colour) shows.
      const ball = skyballBall(material, data.band.low + 2, 90);
      // Under the look's dome (which is hidden while this shows).
      ball.renderOrder = -1001;
      group.add(ball);
      group.userData.buildMs = performance.now() - started;
      group.userData.photo = choice.photo;
      return group;
    },
    apply({ view, group }) {
      const data = SKYBALL_PHOTO_DATA[group.userData.photo];
      const dome = view.lookState?.['probe-lite']?.dome;
      if (dome) dome.visible = false;
      const horizon = new THREE.Color().fromArray(data.horizon);
      view.scene.background = horizon.clone();
      view.scene.fog?.color.copy(horizon);
      const uniforms = group.children[0].material.uniforms;
      uniforms.uHorizon.value.copy(horizon);
    },
  },
];
