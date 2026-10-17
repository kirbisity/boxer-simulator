// The photo-hdri look: light and reflect with REAL captured HDR panoramas
// (Poly Haven, CC0; see docs/credits-photo-hdri.md) instead of a generated sky.
//
//  - Open-air places: a clear midday sky (kloofendal_43d_clear_puresky) is the
//    visible background (through PMREM, drawn infinitely far: no dome, no far
//    plane), the light the figures stand in (diffuse and specular image-based
//    lighting) and what the steel reflects. The sun is found in the picture
//    (the pixels brighter than a cap): the cap's worth stays in the picture
//    (a bright, blurred glint in the steel), the excess is moved to the
//    shadow-casting DirectionalLight, at the direction of the sun in the
//    photograph (its azimuth turned to the game's existing sun), with the
//    colour and the irradiance measured from the radiance.
//  - Indoor and night places (ring, subway, stadium, port): a photographed
//    studio (studio_small_08, softboxes and an octagonal lamp) lights and is
//    reflected by the steel, the key spot and its shadow kept; the background
//    stays the dark hall.
// ACES filmic tone mapping, sRGB output, linear colour workflow; MeshStandard
// skin, cloth and steel; no outlines.
//
// Tunables: PHOTO_HDRI (below). The pictures are src/looks/photo-hdri-data.js,
// made by tools/hdri-convert.js; they are decoded and turned into environments
// in prepare(), only when the look is first chosen. (In the single-file bundle
// the data is part of the file whether or not the look is used.)

/* global THREE */
import { defineLook, hidePaintedSky, replaceEnvironment, setRenderer, stateOf, TONE_MAPPING, OUTPUT_ENCODING } from './kit.js';
import { PHOTO_HDRI_DATA } from './photo-hdri-data.js';

const PHOTO_HDRI = {
  // Radiance (relative to the picture's units) above which a pixel is "the sun": it is capped to this in the image the steel reflects, the rest goes to the light.
  sunCap: 24,
  // Multiplies the measured sun irradiance (three's lights are irradiance / pi).
  sunGain: 1,
  // Exposure by kind of place.
  exposure: { open: 0.62, studio: 0.8, night: 0.5 },
  // The studio's picture is brightened or dimmed for the place.
  studioCap: 14,
  steel: { metalness: 0.95, roughness: 0.2, envMapIntensity: 1.3 },
  skin: { roughness: 0.58, envMapIntensity: 0.55 },
  // Where the sun stands over the game's ground: the azimuth of the old sun (6, 4 across x, z).
  sunAzimuth: Math.atan2(4, 6),
  // Fog starts and ends this share of the place's own values: the horizon of the photograph is hazier than the painted one.
  fogScale: [0.75, 0.7],
};

// ---- Decoding the data --------------------------------------------------------

async function photoHdriInflate(base64) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** { width, height, rgb: Float32Array } in file order (row 0 is the zenith). */
async function photoHdriDecode(entry) {
  const planes = await photoHdriInflate(entry.deflated);
  const { width, height } = entry;
  const count = width * height;
  const rgb = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const scale = 2 ** (planes[i] - 128 - 8);
    rgb[i * 3] = planes[count + i] * scale;
    rgb[i * 3 + 1] = planes[2 * count + i] * scale;
    rgb[i * 3 + 2] = planes[3 * count + i] * scale;
  }
  return { width, height, rgb };
}

const photoHdriLuma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Elevation and azimuth of a pixel centre (azimuth as three's equirect lookup: atan2(z, x)). */
const photoHdriAngles = (x, y, width, height) => ({ phi: ((x + 0.5) / width - 0.5) * 2 * Math.PI, elevation: (0.5 - (y + 0.5) / height) * Math.PI });

/**
 * The sun of a panorama: every pixel brighter than `cap` gives its excess to
 * the sun (direction by excess-weighted mean, colour by mean excess, irradiance
 * as the sum of excess x solid angle) and is capped in place.
 */
function photoHdriExtractSun(image, cap) {
  const { width, height, rgb } = image;
  const sum = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, irradiance: 0, weight: 0 };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      const luma = photoHdriLuma(rgb[i], rgb[i + 1], rgb[i + 2]);
      if (luma <= cap) continue;
      const { phi, elevation } = photoHdriAngles(x, y, width, height);
      const solid = ((2 * Math.PI) / width) * (Math.PI / height) * Math.cos(elevation);
      const keep = cap / luma;
      const excess = luma - cap;
      sum.x += Math.cos(elevation) * Math.cos(phi) * excess;
      sum.y += Math.sin(elevation) * excess;
      sum.z += Math.cos(elevation) * Math.sin(phi) * excess;
      sum.r += rgb[i] * (1 - keep);
      sum.g += rgb[i + 1] * (1 - keep);
      sum.b += rgb[i + 2] * (1 - keep);
      sum.irradiance += excess * solid;
      sum.weight += excess;
      rgb[i] *= keep;
      rgb[i + 1] *= keep;
      rgb[i + 2] *= keep;
    }
  }
  if (!sum.weight) return null;
  const direction = new THREE.Vector3(sum.x, sum.y, sum.z).normalize();
  const peak = Math.max(sum.r, sum.g, sum.b);
  return { direction, colour: new THREE.Color(sum.r / peak, sum.g / peak, sum.b / peak), irradiance: sum.irradiance };
}

/** Turn the picture about the vertical so that azimuth `from` lands on `to` (whole pixels). */
function photoHdriTurn(image, from, to) {
  const { width, height, rgb } = image;
  const shift = Math.round(((from - to) / (2 * Math.PI)) * width);
  const out = new Float32Array(rgb.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + ((x + shift + width * 4) % width)) * 3;
      out.set(rgb.subarray(source, source + 3), (y * width + x) * 3);
    }
  }
  image.rgb = out;
  return (shift / width) * 2 * Math.PI;
}

const photoHdriHalfBuffer = new DataView(new ArrayBuffer(4));
function photoHdriHalf(value) {
  photoHdriHalfBuffer.setFloat32(0, value);
  const bits = photoHdriHalfBuffer.getUint32(0);
  const sign = (bits >>> 16) & 0x8000;
  const exponent = ((bits >>> 23) & 0xff) - 127 + 15;
  const mantissa = bits & 0x7fffff;
  if (exponent <= 0) return sign;
  if (exponent >= 31) return sign | 0x7bff;
  return sign | (exponent << 10) | (mantissa >>> 13);
}

/** A half-float equirect texture (rows flipped so row 0 is the nadir) made into a PMREM environment. */
function photoHdriEnvironment(renderer, { width, height, rgb }, gain = 1) {
  const data = new Uint16Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (y * width + x) * 3;
      const to = ((height - 1 - y) * width + x) * 4;
      data[to] = photoHdriHalf(rgb[from] * gain);
      data[to + 1] = photoHdriHalf(rgb[from + 1] * gain);
      data[to + 2] = photoHdriHalf(rgb[from + 2] * gain);
      data[to + 3] = 0x3c00;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromEquirectangular(texture);
  generator.dispose();
  texture.dispose();
  return target.texture;
}

/** Mean linear colour of the band just above the horizon (a tone-mapped, sRGB-coded colour for fog: three mixes fog after encoding). */
function photoHdriHorizon(image, exposure) {
  const { width, height, rgb } = image;
  const mean = [0, 0, 0];
  let count = 0;
  for (let y = Math.floor(height / 2) - Math.round(height / 45); y < Math.floor(height / 2); y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let c = 0; c < 3; c += 1) mean[c] += rgb[(y * width + x) * 3 + c];
      count += 1;
    }
  }
  return photoHdriDisplay(mean.map((v) => v / count), exposure);
}

// three r128's ACESFilmicToneMapping and the sRGB curve, in JS.
function photoHdriDisplay([r, g, b], exposure) {
  const k = exposure / 0.6;
  r *= k;
  g *= k;
  b *= k;
  const mix = [
    0.59719 * r + 0.35458 * g + 0.04823 * b,
    0.076 * r + 0.90834 * g + 0.01566 * b,
    0.0284 * r + 0.13383 * g + 0.83777 * b,
  ].map((v) => {
    const a = v * (v + 0.0245786) - 0.000090537;
    const d = v * (0.983729 * v + 0.432951) + 0.238081;
    return a / d;
  });
  const out = [
    1.60475 * mix[0] - 0.53108 * mix[1] - 0.07367 * mix[2],
    -0.10208 * mix[0] + 1.10813 * mix[1] - 0.00605 * mix[2],
    -0.00327 * mix[0] - 0.07276 * mix[1] + 1.07602 * mix[2],
  ].map((v) => Math.min(1, Math.max(0, v)));
  return new THREE.Color(out[0], out[1], out[2]);
}

// ---- The look ---------------------------------------------------------------

export const PHOTO_HDRI_LOOK = defineLook({
  id: 'photo-hdri',
  label: 'Photo HDRI',
  blurb: 'Captured CC0 HDR panoramas (a clear midday sky, a photographed studio) light the figures, make the sky and are reflected by the steel; the sun is read off the photograph. ACES, standard materials, no outlines; about 210 KB of data.',
  style: 'soft',
  outlines: false,
  linear: true,
  renderer: { toneMapping: TONE_MAPPING.aces, outputEncoding: OUTPUT_ENCODING.srgb },

  async prepare(view) {
    const state = stateOf(view, 'photo-hdri');
    const [sky, studio] = await Promise.all([photoHdriDecode(PHOTO_HDRI_DATA.sky), photoHdriDecode(PHOTO_HDRI_DATA.studio)]);
    const sun = photoHdriExtractSun(sky, PHOTO_HDRI.sunCap);
    const azimuth = Math.atan2(sun.direction.z, sun.direction.x);
    photoHdriTurn(sky, azimuth, PHOTO_HDRI.sunAzimuth);
    const elevation = Math.asin(sun.direction.y);
    sun.direction.set(Math.cos(elevation) * Math.cos(PHOTO_HDRI.sunAzimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(PHOTO_HDRI.sunAzimuth));
    photoHdriExtractSun(studio, PHOTO_HDRI.studioCap);
    state.sun = sun;
    state.skyImage = sky;
    state.sky = photoHdriEnvironment(view.renderer, sky);
    state.studio = photoHdriEnvironment(view.renderer, studio);
  },

  apply(view, place) {
    const state = stateOf(view, 'photo-hdri');
    const light = view.light;
    const open = Boolean(light.sun);
    const night = !open && place === 'port';
    const exposure = open ? PHOTO_HDRI.exposure.open : night ? PHOTO_HDRI.exposure.night : PHOTO_HDRI.exposure.studio;
    setRenderer(view, { toneMappingExposure: exposure });
    const environment = open ? state.sky : state.studio;
    view.scene.environment = environment;
    replaceEnvironment(view, environment);
    const { hemi, key, rim, sun } = view.lights;
    hemi.intensity = 0;
    if (open) {
      view.scene.background = state.sky;
      hidePaintedSky(view);
      const horizon = photoHdriHorizon(state.skyImage, exposure);
      view.scene.fog.color.copy(horizon);
      view.scene.fog.near *= PHOTO_HDRI.fogScale[0];
      view.scene.fog.far *= PHOTO_HDRI.fogScale[1];
      key.intensity = 0;
      rim.intensity = 0;
      sun.position.copy(state.sun.direction).multiplyScalar(13.2);
      sun.color.copy(state.sun.colour);
      sun.intensity = (state.sun.irradiance / Math.PI) * PHOTO_HDRI.sunGain;
    } else {
      rim.intensity *= 0.5;
    }
  },

  surface(color, { skinning, vertexColors, roughness, opacity }) {
    const { skin } = PHOTO_HDRI;
    return new THREE.MeshStandardMaterial({ color, skinning, vertexColors, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, roughness: Math.max(roughness, skin.roughness), metalness: 0, envMapIntensity: skin.envMapIntensity });
  },

  steel(envMap, options) {
    const { steel } = PHOTO_HDRI;
    return new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, metalness: steel.metalness, roughness: steel.roughness, envMap, envMapIntensity: steel.envMapIntensity, ...options });
  },
});
