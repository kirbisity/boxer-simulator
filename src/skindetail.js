// The fine anatomy as shading, for the 'detail' body style: ribs, ab blocks,
// collarbones, spine, the knobs of the joints, the muscles' separations and
// the skin's folds, drawn into a bump map and an occlusion map instead of the
// mesh. The loft keeps its low-poly silhouette (with only the broad forms
// bent: pecs, bust, belly, buttocks), and each skin loft carries texture
// coordinates that unwrap it as a cylinder (the angle round it, the length
// along it), so a texel is a place on the body, not a place on the screen:
// nothing swims when he moves, and the map is read by the renderer's own
// bump and ambient-occlusion lookups (no custom shader, so every look and
// material that supports a bump map takes it).
//
// The rules are the sculpt style's (sculpt.js), evaluated once per body into
// one atlas, so a thin man's map has his ribs and a heavy man's his folds.
// What a map cannot do is change the outline: a starved man's ribs do not
// show against the sky, and a hollow belly is only a hollow in the shading.
// No Three.js here but in `detailMaterial`.

import { limbShapes, neckOffsets, sculptTraits, trunkShapes } from './sculpt.js';

export const DETAIL = {
  // The atlas, in texels, and the height (m) its 0 to 255 spans: half either side of flat.
  atlas: [1024, 512],
  // Texels round each tile that carry on its pattern, so the filter never reaches into the next tile.
  gutter: 2,
  range: 0.05,
  // How much of a groove's depth also darkens it (occlusion), and over how many metres of depth it is complete.
  occlusion: 0.45,
  occlusionDepth: 0.011,
  // Along-the-part span each tile covers (the loft's own t), by kind.
  spans: { trunk: [-0.2, 1.15], neck: [-0.08, 0.62], upper: [-0.25, 1.0], fore: [-0.06, 1.0], thigh: [-0.16, 1.0], shin: [-0.14, 1.0] },
  // Under this (u of the trunk) the belly's apron hangs and nothing is drawn on it.
  apronFade: [-0.125, -0.06],
};

const [DETAIL_WIDTH, DETAIL_HEIGHT] = DETAIL.atlas;
// Tile rectangles in the atlas: the trunk takes the left of it, the neck below that, the eight limb parts the right.
const DETAIL_TILES = {
  trunk: { x: 0, y: 0, w: 512, h: 384, span: 'trunk' },
  neck: { x: 0, y: 384, w: 192, h: 128, span: 'neck' },
};
['l', 'r'].forEach((side, row) => ['upper', 'fore', 'thigh', 'shin'].forEach((kind, column) => {
  DETAIL_TILES[`${side}${kind[0].toUpperCase()}${kind.slice(1)}`] = { x: 512 + column * 128, y: row * 192, w: 128, h: 192, span: kind, side, kind };
}));
// A patch of the map that is flat and unlit by folds: where everything without its own coordinates (cloth, steel) looks up.
const DETAIL_FLAT = { x: DETAIL_WIDTH - 8, y: DETAIL_HEIGHT - 8, w: 8, h: 8 };
export const FLAT_UV = [(DETAIL_FLAT.x + 4) / DETAIL_WIDTH, (DETAIL_FLAT.y + 4) / DETAIL_HEIGHT];

const detailClamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const detailSmooth = (low, high, x) => {
  const t = detailClamp((x - low) / (high - low));
  return t * t * (3 - 2 * t);
};

/** A loft's texture coordinates for a tile: `(ring, share of the way round) => [u, v]` (a ring's `t` is its place along the part). */
export function detailUv(name) {
  const tile = DETAIL_TILES[name];
  const [from, to] = DETAIL.spans[tile.span];
  const inner = tile.w - 2 * DETAIL.gutter;
  const tall = tile.h - 2 * DETAIL.gutter;
  return (ring, around) => [
    (tile.x + DETAIL.gutter + 0.5 + around * (inner - 1)) / DETAIL_WIDTH,
    (tile.y + DETAIL.gutter + 0.5 + detailClamp((ring.t - from) / (to - from)) * (tall - 1)) / DETAIL_HEIGHT,
  ];
}

/**
 * The bump and occlusion maps of one body: `{ width, height, bump, occlusion, range }`
 * (one byte a texel; bump 128 is flat, each step `range / 255` metres).
 */
export function buildDetailMap(body) {
  const traits = sculptTraits(body);
  const trunk = trunkShapes(body, traits).detail;
  const neck = neckOffsets(traits).detail;
  const limbPart = { upper: 'arm', fore: 'fore', thigh: 'thigh', shin: 'shank' };
  const sources = { trunk: (t, angle) => trunk(t, angle) * detailSmooth(DETAIL.apronFade[0], DETAIL.apronFade[1], t), neck };
  for (const [name, tile] of Object.entries(DETAIL_TILES)) if (tile.kind) sources[name] = limbShapes(traits, limbPart[tile.kind], tile.side).detail;

  const bump = new Uint8Array(DETAIL_WIDTH * DETAIL_HEIGHT).fill(128);
  const occlusion = new Uint8Array(DETAIL_WIDTH * DETAIL_HEIGHT).fill(255);
  for (const [name, tile] of Object.entries(DETAIL_TILES)) {
    const [from, to] = DETAIL.spans[tile.span];
    const source = sources[name];
    const inner = tile.w - 2 * DETAIL.gutter;
    const tall = tile.h - 2 * DETAIL.gutter;
    for (let row = 0; row < tile.h; row += 1) {
      // The gutter past the ends repeats the end rows (clamped), so a lookup at the edge never meets the next tile.
      const t = from + ((to - from) * detailClamp((row - DETAIL.gutter) / (tall - 1)));
      for (let column = 0; column < tile.w; column += 1) {
        // The first and last columns are the same line round the part, so the seam closes; the gutter either side goes on round it.
        const offset = source(t, ((column - DETAIL.gutter) / (inner - 1)) * Math.PI * 2);
        const at = (tile.y + row) * DETAIL_WIDTH + tile.x + column;
        bump[at] = Math.round(detailClamp(0.5 + offset / DETAIL.range) * 255);
        occlusion[at] = Math.round((1 - DETAIL.occlusion * detailSmooth(0, DETAIL.occlusionDepth, -offset)) * 255);
      }
    }
  }
  return { width: DETAIL_WIDTH, height: DETAIL_HEIGHT, bump, occlusion, range: DETAIL.range };
}

const detailTextures = new WeakMap();

/**
 * The material with the body's maps: a bump map (the shading of every rib and
 * fold) and an occlusion map, read through the skin loft's coordinates
 * (`uv`; the occlusion map wants the same set as `uv2`, see `detailGeometry`).
 * `strength` scales the relief: 1 is the true height, fainter for a body seen from far.
 */
export function detailMaterial(material, detail, strength = 1) {
  /* global THREE */
  let pair = detailTextures.get(detail);
  if (!pair) {
    const make = (data) => {
      const texture = new THREE.DataTexture(data, detail.width, detail.height, THREE.LuminanceFormat, THREE.UnsignedByteType);
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
      return texture;
    };
    pair = { bump: make(detail.bump), occlusion: make(detail.occlusion) };
    detailTextures.set(detail, pair);
  }
  material.bumpMap = pair.bump;
  material.bumpScale = detail.range * strength;
  material.aoMap = pair.occlusion;
  material.aoMapIntensity = 1;
  material.needsUpdate = true;
  return material;
}
