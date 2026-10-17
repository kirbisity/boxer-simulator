// TODO(look: physical-sky): replace this placeholder with the real look. The
// brief for it is in ARCHITECTURE.md (Looks); in short, a procedural
// physical sky (three's Sky example, loaded lazily) lighting standard
// materials with a matching sun, aerial-perspective fog and ACES tone mapping.
//
// For now it is the soft style under the full linear pipeline (linear
// workflow + ACES + sRGB output), which proves the colour plumbing: the
// colours must read as authored, not milky, and a swatch drawn unlit must
// come back as its own hex (__looks.colourCheck()).

import { defineLook, OUTPUT_ENCODING, TONE_MAPPING } from './kit.js';

export const PHYSICAL_SKY_LOOK = defineLook({
  id: 'physical-sky',
  label: 'Physical sky',
  blurb: 'Placeholder: soft standard materials, linear workflow, ACES tone mapping and sRGB output.',
  style: 'soft',
  linear: true,
  outlines: false,
  placeholder: true,
  renderer: { toneMapping: TONE_MAPPING.aces, toneMappingExposure: 1, outputEncoding: OUTPUT_ENCODING.srgb },
});
