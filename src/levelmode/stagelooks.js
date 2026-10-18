// The looks of Stage 1: how Dunnottar is seen. One config object, one entry per look, each a whole picture and not a dial turned:
// the sky, the light on the stone, the fog (with the mist that lies low on the sea), the sea, the rain, the lightning and the
// torches. They differ in kind (a storm, a break in the cloud, a sea fog, a black night squall, a flat grey day, a dusk after
// the rain), not in degree. levelmode/storm.js reads this and draws it; `boxer.stageLook(name)` and the ghost bar's Look select
// change it at run time. Nothing here touches the DOM, so a test can read it.
//
// A look is:
//   label, blurb       what the menu calls it, and what it is, in a sentence.
//   sky                the painted sky (levelmode/stagesky.js): the colours down the sky, the cloud banks, the glow of the sun or moon, the stars.
//     zenith, high, mid  colours (hex) at the top, three-quarters up and half way up the vault; `horizon` the colour where it meets the fog.
//     clouds             { count: how many soft masses, size: [least, most] in px of the 1024 px sky, dark: their shadow colour, light: their lit colour,
//                          darkShare: how many are shadow (0..1), aDark, aLight: how thick, flat: how flattened (smaller is flatter), from, to: the band
//                          of the sky (0 top, 0.5 the horizon) they fill }.
//     glow               { az, el: degrees round and up the sky it stands at (az 0 is east, 90 south), colour [r,g,b] 0..255, size: its radius in degrees,
//                          strength: 0..1, hole: how much of the cloud round it is cleared (0..1), disc: a hard bright disc (the moon, a low sun), 0..1 } or null.
//     stars              how many (0 under cloud).
//   sun                the one directional light on the stone and the men: { az, el (degrees), colour [r,g,b] 0..1, intensity }.
//   ambient            the light of the sky itself, from every side: { tint: [r,g,b] what it is multiplied by (the baked sky is a cold violet-grey), gain }.
//   hemi               the same for the toon look, which has a hemisphere light instead: { sky, ground (hex), intensity }.
//   exposure           everything the lights give, times this (the look has no tone mapping, so the light is what is scaled).
//   fog                { colour (hex, also the horizon and the background), near, far: where plain distance fog starts and is complete (m),
//                        mist: { density: per metre at the base of it, base: the height (m) below which it is that dense, falloff: how fast it thins above that, per metre } }.
//   sea                { colour (hex), roughness, metalness, normal: how big the waves read (0..1), reflect: how much sky it mirrors, scroll: how fast it heaves }.
//   rain               { opacity: how visible the streaks, share: what part of the drops fall (0..1) } (opacity 0 is dry).
//   wet                how soaked the stone is (0..1): darker, glossier, moss greener.
//   pools              how much standing water lies on what faces up (0..1, optional): dark glassy patches that mirror the sky.
//   lightning          { gap: [least, most] seconds between strikes, strength: how hard the flash lights the scene (1 is the old storm's) } or null for none.
//   torch              how bright the torches and braziers burn (1: as built).
//   shaft              a shaft of light through the cloud onto the castle: { colour, opacity, width (m) } or null.
//   vignette           how dark the corners of the picture (0..1).

export const STAGE_LOOKS = {
  stormBreak: {
    label: 'Storm breaking',
    blurb: 'The bruised storm with a tear in it: purple-grey banks and rain, a warm low sun breaking through over the sea, thick mist on the water and the low ground, and standing water on the cobbles and flags.',
    sky: {
      zenith: '#14121e', high: '#232231', mid: '#3a3848', horizon: '#56535e',
      clouds: { count: 560, size: [28, 120], dark: [11, 10, 18], light: [140, 132, 148], darkShare: 0.66, aDark: 0.21, aLight: 0.11, flat: 0.32, from: 0.02, to: 0.47 },
      glow: { az: 50, el: 7, colour: [250, 206, 150], size: 18, strength: 0.9, hole: 0.85, disc: 0.4 },
      stars: 0,
    },
    // A warm low sun, weaker than the open break (the storm is still over it), and a cool violet fill from the cloud.
    sun: { az: 50, el: 12, colour: [0.96, 0.76, 0.54], intensity: 1.7 },
    ambient: { tint: [0.9, 0.94, 1.12], gain: 0.9 },
    hemi: { sky: 0x625e78, ground: 0x26242c, intensity: 0.54 },
    exposure: 1,
    // Thicker than either parent: the far rock goes grey at a couple of hundred metres, and a sea mist lies on the water and the gorge.
    fog: { colour: 0x56535e, near: 22, far: 240, mist: { density: 0.03, base: 2, falloff: 0.1 } },
    sea: { colour: 0x18222e, roughness: 0.36, metalness: 0.32, normal: 0.52, reflect: 1.3, scroll: 0.9 },
    rain: { opacity: 0.28, share: 0.8 },
    wet: 0.8,
    pools: 0.75,
    lightning: { gap: [7, 16], strength: 0.75 },
    torch: 0.9,
    shaft: { colour: [255, 206, 150], opacity: 0.15, width: 70 },
    vignette: 0.34,
  },

  bruised: {
    label: 'Bruised storm',
    blurb: 'Purple-grey cloud banks over a black sea, one pale break low in the west, rain and a bolt every few seconds. The old storm, with a real cloud sky and less grey on the stone.',
    sky: {
      zenith: '#14121e', high: '#252232', mid: '#3d394b', horizon: '#4a4556',
      clouds: { count: 520, size: [26, 110], dark: [12, 10, 20], light: [124, 116, 140], darkShare: 0.62, aDark: 0.2, aLight: 0.1, flat: 0.34, from: 0.03, to: 0.47 },
      glow: { az: 40, el: 6, colour: [226, 192, 150], size: 20, strength: 0.7, hole: 0.5, disc: 0 },
      stars: 0,
    },
    sun: { az: 40, el: 11, colour: [0.66, 0.62, 0.7], intensity: 0.8 },
    ambient: { tint: [1, 0.98, 1.02], gain: 1 },
    hemi: { sky: 0x78748f, ground: 0x2a2530, intensity: 0.58 },
    exposure: 1,
    fog: { colour: 0x4a4556, near: 45, far: 380, mist: { density: 0.006, base: -2, falloff: 0.09 } },
    sea: { colour: 0x17202c, roughness: 0.42, metalness: 0.3, normal: 0.55, reflect: 1.1, scroll: 1 },
    rain: { opacity: 0.32, share: 1 },
    wet: 0.55,
    lightning: { gap: [4, 11], strength: 1 },
    torch: 1,
    shaft: null,
    vignette: 0.38,
  },

  breakClouds: {
    label: 'Break in the clouds',
    blurb: 'A dark, heavy sky torn open low over the sea: a warm shaft of low sun lands on the castle and the water below it, a cold fill in the shade, the rain thinning. Only thunder far off.',
    sky: {
      zenith: '#10131c', high: '#1d2330', mid: '#343a47', horizon: '#4e5560',
      clouds: { count: 560, size: [30, 120], dark: [8, 10, 16], light: [150, 150, 158], darkShare: 0.7, aDark: 0.22, aLight: 0.12, flat: 0.3, from: 0.02, to: 0.47 },
      glow: { az: 50, el: 7, colour: [255, 214, 150], size: 17, strength: 1, hole: 0.95, disc: 0.55 },
      stars: 0,
    },
    sun: { az: 50, el: 13, colour: [1, 0.78, 0.5], intensity: 2.5 },
    ambient: { tint: [0.8, 0.94, 1.18], gain: 0.8 },
    hemi: { sky: 0x4e5a74, ground: 0x242a30, intensity: 0.5 },
    exposure: 1,
    fog: { colour: 0x4e5560, near: 60, far: 420, mist: { density: 0.004, base: -4, falloff: 0.1 } },
    sea: { colour: 0x1a2a38, roughness: 0.3, metalness: 0.35, normal: 0.5, reflect: 1.5, scroll: 0.8 },
    rain: { opacity: 0.2, share: 0.45 },
    wet: 0.75,
    lightning: { gap: [14, 28], strength: 0.3 },
    torch: 0.8,
    shaft: { colour: [255, 210, 150], opacity: 0.2, width: 70 },
    vignette: 0.3,
  },

  seaFog: {
    label: 'Sea fog',
    blurb: 'A haar: thick grey-white mist rolling in off the sea and lying on the low path and the water, thinning up the rock so the top of the castle stands out of it. Flat, soft, nearly colourless; no rain to speak of.',
    sky: {
      zenith: '#8d979c', high: '#a3acb0', mid: '#b4bcbe', horizon: '#bcc3c3',
      clouds: { count: 260, size: [60, 160], dark: [96, 104, 110], light: [214, 218, 218], darkShare: 0.45, aDark: 0.08, aLight: 0.1, flat: 0.5, from: 0.03, to: 0.5 },
      glow: { az: 40, el: 22, colour: [244, 244, 236], size: 26, strength: 0.4, hole: 0.15, disc: 0 },
      stars: 0,
    },
    sun: { az: 40, el: 40, colour: [0.9, 0.92, 0.92], intensity: 0.45 },
    ambient: { tint: [1.22, 1.28, 1.16], gain: 1.7 },
    hemi: { sky: 0xb8c0c4, ground: 0x646c6e, intensity: 0.9 },
    exposure: 1,
    fog: { colour: 0xbcc3c3, near: 25, far: 260, mist: { density: 0.05, base: 5, falloff: 0.13 } },
    sea: { colour: 0x7a8a8e, roughness: 0.55, metalness: 0.1, normal: 0.35, reflect: 0.6, scroll: 0.5 },
    rain: { opacity: 0.1, share: 0.25 },
    wet: 0.85,
    lightning: null,
    torch: 1.4,
    shaft: null,
    vignette: 0.12,
  },

  squall: {
    label: 'Black squall night',
    blurb: 'Near night under moving cloud with a few cold stars and a moon behind it; blue-black water, hard rain, a bolt every few seconds that is the only real light, and the torches burning warm.',
    sky: {
      zenith: '#04060d', high: '#080c18', mid: '#101828', horizon: '#18233a',
      clouds: { count: 520, size: [28, 120], dark: [2, 3, 8], light: [44, 62, 100], darkShare: 0.7, aDark: 0.28, aLight: 0.12, flat: 0.32, from: 0.02, to: 0.48 },
      glow: { az: 215, el: 32, colour: [150, 180, 255], size: 11, strength: 0.7, hole: 0.4, disc: 0.45 },
      stars: 90,
    },
    sun: { az: 215, el: 32, colour: [0.36, 0.5, 0.9], intensity: 0.45 },
    ambient: { tint: [0.5, 0.68, 1.15], gain: 1.0 },
    hemi: { sky: 0x2a3a60, ground: 0x0a0c14, intensity: 0.32 },
    exposure: 1,
    fog: { colour: 0x18233a, near: 30, far: 300, mist: { density: 0.008, base: -3, falloff: 0.1 } },
    sea: { colour: 0x080e1a, roughness: 0.25, metalness: 0.4, normal: 0.7, reflect: 1.4, scroll: 1.7 },
    rain: { opacity: 0.36, share: 0.9 },
    wet: 1,
    lightning: { gap: [2.5, 6.5], strength: 1.5 },
    torch: 1.7,
    shaft: null,
    vignette: 0.5,
  },

  greyDay: {
    label: 'Grey Scottish day',
    blurb: 'Flat overcast daylight with no drama: soft light from everywhere, wet green grass and dark rock, a fine drizzle, a haze that only dims the far headland. The castle as it would look from the car park.',
    sky: {
      zenith: '#6f7780', high: '#848c94', mid: '#9aa2a8', horizon: '#a6adb1',
      clouds: { count: 420, size: [50, 150], dark: [70, 76, 86], light: [190, 194, 198], darkShare: 0.5, aDark: 0.1, aLight: 0.1, flat: 0.45, from: 0.03, to: 0.5 },
      glow: { az: 40, el: 40, colour: [236, 236, 230], size: 30, strength: 0.25, hole: 0.1, disc: 0 },
      stars: 0,
    },
    sun: { az: 40, el: 58, colour: [0.86, 0.88, 0.9], intensity: 0.55 },
    ambient: { tint: [1.2, 1.26, 1.12], gain: 1.5 },
    hemi: { sky: 0xa8b0b8, ground: 0x5c6258, intensity: 0.85 },
    exposure: 1,
    fog: { colour: 0xa6adb1, near: 80, far: 520, mist: { density: 0.002, base: -6, falloff: 0.08 } },
    sea: { colour: 0x2c3a3c, roughness: 0.55, metalness: 0.05, normal: 0.4, reflect: 0.3, scroll: 0.7 },
    rain: { opacity: 0.16, share: 0.4 },
    wet: 0.6,
    lightning: null,
    torch: 0.6,
    shaft: null,
    vignette: 0.1,
  },

  dusk: {
    label: 'Golden dusk after the storm',
    blurb: 'The last of the storm clearing: a low gold sun, rose-lit cloud edges breaking up, long warm light down the path and on the wet stone, the sea burnished, the air hazed amber. No rain; the torches just lit.',
    sky: {
      zenith: '#1e2a45', high: '#46506a', mid: '#a0707a', horizon: '#d89868',
      clouds: { count: 420, size: [30, 120], dark: [34, 32, 52], light: [246, 170, 110], darkShare: 0.4, aDark: 0.16, aLight: 0.18, flat: 0.28, from: 0.05, to: 0.48 },
      glow: { az: 50, el: 4, colour: [255, 190, 110], size: 24, strength: 1, hole: 0.9, disc: 0.8 },
      stars: 0,
    },
    sun: { az: 50, el: 7, colour: [1, 0.66, 0.34], intensity: 2.6 },
    ambient: { tint: [1.05, 0.85, 0.95], gain: 1.1 },
    hemi: { sky: 0x8a7890, ground: 0x30262a, intensity: 0.55 },
    exposure: 1,
    fog: { colour: 0xd89868, near: 70, far: 480, mist: { density: 0.005, base: -2, falloff: 0.08 } },
    sea: { colour: 0x2a2a3a, roughness: 0.28, metalness: 0.35, normal: 0.5, reflect: 1.6, scroll: 0.7 },
    rain: { opacity: 0, share: 0 },
    wet: 0.8,
    lightning: null,
    torch: 0.9,
    shaft: { colour: [255, 190, 120], opacity: 0.14, width: 90 },
    vignette: 0.25,
  },
};

/** The look the stage opens with, and why: see the report; the one that reads as Dunnottar at a glance and still gives the lightning its place. */
export const DEFAULT_STAGE_LOOK = 'stormBreak';

/** The looks' names, in the order the menu shows them. */
export const stageLookNames = () => Object.keys(STAGE_LOOKS);

/** A look by name (the default for one that is not known). */
export const stageLookOf = (name) => STAGE_LOOKS[name] ?? STAGE_LOOKS[DEFAULT_STAGE_LOOK];
