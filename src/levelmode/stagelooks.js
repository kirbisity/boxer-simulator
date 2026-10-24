// The looks of Stage 1: how Dunnottar is seen. One config object, one entry per look, each a whole picture and not a dial turned:
// the sky, the light on the stone, the fog (with the mist that lies low on the sea), the sea, the rain, the lightning and the
// torches. They differ in kind (a storm, a break in the cloud, a sea fog, a black night squall, a flat grey day, a dusk after
// the rain), not in degree. levelmode/storm.js reads this and draws it; `boxer.stageLook(name)` and the ghost bar's Look select
// change it at run time. Nothing here touches the DOM, so a test can read it.
//
// A look is:
//   label, blurb       what the menu calls it, and what it is, in a sentence.
//   sandboxOnly        true for the fair-weather looks: only the sandbox's ghost walk uses them (a run of the real stage keeps the storm).
//   sky                the painted sky (levelmode/stagesky.js): the colours down the sky, the cloud banks, the glow of the sun or moon, the stars.
//     zenith, high, mid  colours (hex) at the top, three-quarters up and half way up the vault; `horizon` the colour where it meets the fog.
//     clouds             { count: how many soft masses, size: [least, most] in px of the 1024 px sky, dark: their shadow colour, light: their lit colour,
//                          darkShare: how many are shadow (0..1), aDark, aLight: how thick, flat: how flattened (smaller is flatter), from, to: the band
//                          of the sky (0 top, 0.5 the horizon) they fill }.
//     glow               { az, el: degrees round and up the sky it stands at (az 0 is east, 90 south), colour [r,g,b] 0..255, size: its radius in degrees,
//                          strength: 0..1, hole: how much of the cloud round it is cleared (0..1), disc: a hard bright disc (the moon, a low sun), 0..1 } or null.
//     stars              how many (0 under cloud).
//     photo              optional: a real thunderstorm photograph instead of painted cloud (levelmode/stormsky-data.js, CC0 Poly Haven panoramas, credits in
//                        docs/credits-scenery-photo.md): { id: which, az: the azimuth its bright break (the sun, or the hole in the cloud) is turned to, mirror: flipped,
//                        grade: { gain: [at the horizon, overhead], rise: [from, to] degrees of elevation over which one turns into the other, far: { gain, from, to }
//                        (a further multiplier far from the break: the cloud is dark everywhere but round it), gamma (shadows deeper above 1), sat, tint [r,g,b] } }.
//                        The picture is graded (stagesky.js skyGrade), `glow` is laid over it where its break is, and `horizon` must be the graded picture's horizon
//                        band (photoHorizon: a test checks), which is also the fog's. A photographic look has no `clouds` (it paints none).
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
//   bakedShadow        how much of the sun the castle's own shadow takes (0..1, optional, 0 if absent): the shadow of the walls on themselves, the ground and the rock, drawn once
//                      from the look's sun when the look is put on (levelmode/kitshadow.js). It is the share of the sun's light, not of the sky's, that is lost in the shade,
//                      so it should follow how much of a real sun there is: strong where one shines through the cloud, faint where it is only a brighter place in the overcast,
//                      none where the light is the sky's own.
//   lightning          { gap: [least, most] seconds between strikes, strength: how hard the flash lights the scene (1 is the old storm's) } or null for none.
//   torch              how bright the torches and braziers burn (1: as built).
//   shaft              a shaft of light through the cloud onto the castle: { colour, opacity, width (m) } or null.
//   vignette           how dark the corners of the picture (0..1).

export const STAGE_LOOKS = {
  stormBreak: {
    label: 'Storm breaking',
    blurb: 'A real thunderstorm sky: a black, heavy cloud deck overhead, the air brightening to a luminous pale band low over the sea, and one torn place where a hot low sun breaks through and strikes the castle. Thick mist on the water and the low ground, standing water on the cobbles and flags.',
    sky: {
      zenith: '#14121e', high: '#232231', mid: '#3a3848', horizon: '#707380',
      photo: { id: 'stormA', az: 50, grade: { gain: [0.82, 0.3], rise: [3, 70], far: { gain: 0.58, from: 12, to: 95 }, gamma: 1.3, sat: 0.84, tint: [0.97, 0.97, 1.05] } },
      glow: { az: 50, el: 7.3, colour: [255, 200, 140], size: 14, strength: 0.7, hole: 0.85, disc: 0.3 },
      stars: 0,
    },
    // A hot low sun through the tear (only a break in the cloud: the sky above it is black), and a cool dim fill from the deck, so the sunlit stone stands out of the storm shade.
    sun: { az: 50, el: 10, colour: [1, 0.78, 0.54], intensity: 2.6 },
    ambient: { tint: [0.86, 0.92, 1.14], gain: 0.78 },
    hemi: { sky: 0x58566e, ground: 0x22202a, intensity: 0.46 },
    exposure: 1,
    // Thick for the start: from the cliff path the castle is a dim silhouette in the mist (its shape, not its stones), clearer as he nears; a sea mist lies on the water and the gorge. The fog is the colour of the bright band at the horizon.
    fog: { colour: 0x707380, near: 16, far: 175, mist: { density: 0.05, base: 2, falloff: 0.1 } },
    sea: { colour: 0x18222e, roughness: 0.36, metalness: 0.32, normal: 0.52, reflect: 1.3, scroll: 0.9 },
    rain: { opacity: 0.28, share: 0.8 },
    wet: 0.8,
    pools: 0.75,
    // A hot sun through the tear, the storm over the rest of the sky: the shade is deep, not black (the cloud fills it).
    bakedShadow: 1,
    lightning: { gap: [15, 35], strength: 0.75 },
    torch: 0.9,
    shaft: { colour: [255, 206, 150], opacity: 0.22, width: 70 },
    vignette: 0.34,
  },

  squallLine: {
    label: 'Squall line',
    blurb: 'The leading edge of a squall: a long, hard-edged shelf of black cloud over the sea, ragged scud under it, a curtain of rain hanging from it, and a pale washed-out band of daylight along the whole horizon. No sun, only the grey light under the cloud edge; hard rain, a bolt now and then.',
    sky: {
      zenith: '#1a1c28', high: '#2c3042', mid: '#4a4f62', horizon: '#6e738a',
      photo: { id: 'stormB', az: 55, grade: { gain: [0.92, 0.5], rise: [3, 80], far: { gain: 0.9, from: 30, to: 110 }, gamma: 1.12, sat: 0.9, tint: [0.96, 0.98, 1.06] } },
      glow: { az: 55, el: 25.9, colour: [235, 232, 222], size: 20, strength: 0.4, hole: 0.4, disc: 0 },
      stars: 0,
    },
    sun: { az: 55, el: 16, colour: [0.82, 0.84, 0.9], intensity: 1.2 },
    ambient: { tint: [0.92, 0.96, 1.1], gain: 0.9 },
    hemi: { sky: 0x6a6e84, ground: 0x24242c, intensity: 0.52 },
    exposure: 1,
    fog: { colour: 0x6e738a, near: 20, far: 200, mist: { density: 0.04, base: 2, falloff: 0.1 } },
    sea: { colour: 0x1a2430, roughness: 0.4, metalness: 0.3, normal: 0.6, reflect: 1.2, scroll: 1.2 },
    rain: { opacity: 0.34, share: 1 },
    wet: 0.9,
    pools: 0.8,
    // The light is the cloud edge's own, soft: the walls shade themselves only a little.
    bakedShadow: 0.4,
    lightning: { gap: [9, 22], strength: 0.95 },
    torch: 1,
    shaft: null,
    vignette: 0.36,
  },

  supercell: {
    label: 'Supercell base',
    blurb: 'Under the base of a supercell: the whole sky one dark, lumpy, green-grey deck that hangs low and close, the horizon a sick pale yellow-green, the light thin and strange, hard rain and a bolt every few seconds.',
    sky: {
      zenith: '#0e1210', high: '#1a201c', mid: '#2c352f', horizon: '#607260',
      photo: { id: 'stormA', az: 215, mirror: true, grade: { gain: [0.8, 0.26], rise: [2, 65], far: { gain: 0.6, from: 15, to: 95 }, gamma: 1.38, sat: 0.65, tint: [0.88, 1.02, 0.84] } },
      glow: { az: 215, el: 7.3, colour: [208, 222, 150], size: 20, strength: 0.4, hole: 0.6, disc: 0 },
      stars: 0,
    },
    sun: { az: 215, el: 9, colour: [0.78, 0.84, 0.58], intensity: 0.9 },
    ambient: { tint: [0.84, 1, 0.9], gain: 0.85 },
    hemi: { sky: 0x4c5a4e, ground: 0x1c2420, intensity: 0.42 },
    exposure: 1,
    fog: { colour: 0x607260, near: 18, far: 190, mist: { density: 0.045, base: 2, falloff: 0.1 } },
    sea: { colour: 0x16221e, roughness: 0.38, metalness: 0.3, normal: 0.62, reflect: 1.2, scroll: 1.3 },
    rain: { opacity: 0.34, share: 1 },
    wet: 0.95,
    pools: 0.85,
    bakedShadow: 0.3,
    lightning: { gap: [7, 16], strength: 1.1 },
    torch: 1.1,
    shaft: null,
    vignette: 0.42,
  },

  sunHole: {
    label: 'Sun hole',
    blurb: 'The same storm with the cloud shut almost everywhere: a single small hole low over the sea, a hard white sun in it, its rays fanning down onto the castle and a bright patch on the water, the whole rest of the sky black and heavy. The sun at its hardest; the rain thin.',
    sky: {
      zenith: '#0c0d14', high: '#181a26', mid: '#2a2c3a', horizon: '#5b5e6a',
      photo: { id: 'stormA', az: 50, grade: { gain: [0.7, 0.22], rise: [3, 70], far: { gain: 0.4, from: 10, to: 70 }, gamma: 1.4, sat: 0.85, tint: [0.96, 0.97, 1.06] } },
      glow: { az: 50, el: 7.3, colour: [255, 214, 150], size: 11, strength: 1, hole: 0.95, disc: 0.75 },
      stars: 0,
    },
    sun: { az: 50, el: 10, colour: [1, 0.8, 0.56], intensity: 2.9 },
    ambient: { tint: [0.8, 0.9, 1.16], gain: 0.7 },
    hemi: { sky: 0x4a4c64, ground: 0x1e1e26, intensity: 0.4 },
    exposure: 1,
    fog: { colour: 0x5b5e6a, near: 24, far: 220, mist: { density: 0.035, base: 1.5, falloff: 0.1 } },
    sea: { colour: 0x16202c, roughness: 0.3, metalness: 0.35, normal: 0.5, reflect: 1.45, scroll: 0.85 },
    rain: { opacity: 0.2, share: 0.5 },
    wet: 0.8,
    pools: 0.7,
    bakedShadow: 1,
    lightning: { gap: [28, 55], strength: 0.4 },
    torch: 0.85,
    shaft: { colour: [255, 210, 150], opacity: 0.3, width: 60 },
    vignette: 0.38,
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
    // Only a pale break low in the west, a weak sun (0.8): the walls shade themselves a little.
    bakedShadow: 0.35,
    lightning: { gap: [9, 24], strength: 1 },
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
    // The open break: a hard low sun (2.5) on the castle; the shade is only the cold fill.
    bakedShadow: 1,
    lightning: { gap: [28, 55], strength: 0.3 },
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
    // A haar: the light is all the sky's, nothing casts.
    bakedShadow: 0,
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
    // Night: the moon is behind the cloud and the only hard light is the lightning, which has no one direction for a baked shadow to hold.
    bakedShadow: 0,
    lightning: { gap: [6, 15], strength: 1.5 },
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
    // Flat overcast: soft light from everywhere, nothing casts.
    bakedShadow: 0,
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
    // A real low gold sun (2.6) after the storm: long clean shadows down the path.
    bakedShadow: 1,
    lightning: null,
    torch: 0.9,
    shaft: { colour: [255, 190, 120], opacity: 0.14, width: 90 },
    vignette: 0.25,
  },

  // ---- Fair weather (for the sandbox's ghost walk: the castle in full sun). Real daylight panoramas (CC0, Poly Haven), the sun of each where its photograph has it. ----

  clearMorning: {
    sandboxOnly: true,
    label: 'Clear morning',
    blurb: 'A clean bright morning: deep blue sky and a few small clouds low down, a warm sun a third of the way up casting long soft-edged shadows across the castle, dew-bright grass and green moss, a blue-green sea with the sun glittering on it, only a thin haze in the distance.',
    sky: {
      zenith: '#1a3f8f', high: '#2f5da8', mid: '#6d9ad0', horizon: '#b7ccde',
      photo: { id: 'dayClear', az: 125, grade: { gain: [1, 0.92], rise: [3, 60], far: { gain: 1, from: 30, to: 100 }, gamma: 1.02, sat: 1.05, tint: [1, 1, 1] } },
      glow: { az: 125, el: 28.2, colour: [255, 232, 190], size: 12, strength: 0.28, hole: 0.5, disc: 0.7 },
      stars: 0,
    },
    sun: { az: 125, el: 28.2, colour: [1, 0.9, 0.74], intensity: 2.3 },
    ambient: { tint: [1.12, 1.1, 1], gain: 1.15 },
    hemi: { sky: 0x9ab8e8, ground: 0x586244, intensity: 0.7 },
    exposure: 1,
    fog: { colour: 0xb7ccde, near: 80, far: 520, mist: { density: 0.004, base: -1, falloff: 0.1 } },
    sea: { colour: 0x0a2f42, roughness: 0.34, metalness: 0.04, normal: 0.4, reflect: 0.5, scroll: 0.8 },
    rain: { opacity: 0, share: 0 },
    wet: 0.1,
    pools: 0,
    bakedShadow: 1,
    lightning: null,
    torch: 0.3,
    shaft: null,
    vignette: 0.1,
  },

  brightNoon: {
    sandboxOnly: true,
    label: 'Bright noon',
    blurb: 'High summer sun in a deep, clear blue sky with a thread of cloud: hard black-edged shadows straight down the walls, the stone pale and dry, the sea a hard blue with a white glitter under the sun, the air clear to the headland.',
    sky: {
      zenith: '#1a3f8f', high: '#2a58a4', mid: '#6a98d0', horizon: '#a1b4cf',
      photo: { id: 'dayNoon', az: 100, grade: { gain: [1, 0.95], rise: [3, 60], far: { gain: 1, from: 30, to: 100 }, gamma: 1.05, sat: 1.1, tint: [0.98, 1, 1.04] } },
      glow: { az: 100, el: 43, colour: [255, 244, 224], size: 10, strength: 0.2, hole: 0.5, disc: 0.5 },
      stars: 0,
    },
    sun: { az: 100, el: 43, colour: [1, 0.96, 0.88], intensity: 2.6 },
    ambient: { tint: [1.1, 1.1, 1.04], gain: 1.1 },
    hemi: { sky: 0x9cbcf0, ground: 0x646a4c, intensity: 0.75 },
    exposure: 1,
    fog: { colour: 0xa1b4cf, near: 100, far: 700, mist: { density: 0.002, base: -2, falloff: 0.1 } },
    sea: { colour: 0x0a2f42, roughness: 0.34, metalness: 0.04, normal: 0.4, reflect: 0.5, scroll: 0.8 },
    rain: { opacity: 0, share: 0 },
    wet: 0.05,
    pools: 0,
    bakedShadow: 1,
    lightning: null,
    torch: 0.25,
    shaft: null,
    vignette: 0.08,
  },

  hazyMorning: {
    sandboxOnly: true,
    label: 'Hazy summer morning',
    blurb: 'A warm hazy morning: a milky gold sky with the sun a soft bright blur in it, a golden mist lying on the sea and in the gorge, soft pale shadows, the far headland fading into the glow, rays of light through the haze, the grass wet with dew.',
    sky: {
      zenith: '#6c7080', high: '#8c8c90', mid: '#b0a898', horizon: '#e5cd9f',
      photo: { id: 'dayHaze', az: 140, grade: { gain: [1.25, 1.2], rise: [3, 60], far: { gain: 1, from: 30, to: 100 }, gamma: 0.88, sat: 1.25, tint: [1.14, 1, 0.74] } },
      glow: { az: 140, el: 28.6, colour: [255, 220, 150], size: 18, strength: 0.35, hole: 0.5, disc: 0.4 },
      stars: 0,
    },
    sun: { az: 140, el: 28.6, colour: [1, 0.86, 0.62], intensity: 1.9 },
    ambient: { tint: [1.16, 1.08, 1], gain: 1.3 },
    hemi: { sky: 0xd8caa8, ground: 0x6a6a4c, intensity: 0.85 },
    exposure: 1,
    fog: { colour: 0xe5cd9f, near: 45, far: 420, mist: { density: 0.018, base: 3, falloff: 0.1 } },
    sea: { colour: 0x2e5260, roughness: 0.42, metalness: 0.12, normal: 0.35, reflect: 0.8, scroll: 0.7 },
    rain: { opacity: 0, share: 0 },
    wet: 0.15,
    pools: 0,
    bakedShadow: 0.9,
    lightning: null,
    torch: 0.35,
    shaft: { colour: [255, 226, 170], opacity: 0.12, width: 100 },
    vignette: 0.14,
  },

  fairClouds: {
    sandboxOnly: true,
    label: 'Fair clouds',
    blurb: 'A breezy fair-weather day: a deep blue sky with big white cumulus drifting over, the sun high and bright between them, the castle in strong light and the sea sparkling; the sky fills the shade with bright blue.',
    sky: {
      zenith: '#1a3f8f', high: '#3a68b4', mid: '#7aa4d6', horizon: '#a5a7b5',
      photo: { id: 'dayCloud', az: 110, grade: { gain: [1, 0.96], rise: [3, 60], far: { gain: 1, from: 30, to: 100 }, gamma: 1.04, sat: 1.08, tint: [1, 1, 1] } },
      glow: { az: 110, el: 47.9, colour: [255, 244, 224], size: 9, strength: 0.15, hole: 0.5, disc: 0.4 },
      stars: 0,
    },
    sun: { az: 110, el: 47.9, colour: [1, 0.95, 0.86], intensity: 2.4 },
    ambient: { tint: [1.1, 1.1, 1.04], gain: 1.2 },
    hemi: { sky: 0xa4c0ee, ground: 0x646a4c, intensity: 0.8 },
    exposure: 1,
    fog: { colour: 0xa5a7b5, near: 90, far: 600, mist: { density: 0.003, base: -2, falloff: 0.1 } },
    sea: { colour: 0x0a2f42, roughness: 0.34, metalness: 0.04, normal: 0.4, reflect: 0.5, scroll: 0.8 },
    rain: { opacity: 0, share: 0 },
    wet: 0.1,
    pools: 0,
    bakedShadow: 0.95,
    lightning: null,
    torch: 0.3,
    shaft: null,
    vignette: 0.1,
  },
};

/** The look the stage opens with, and why: see the report; the one that reads as Dunnottar at a glance and still gives the lightning its place. */
export const DEFAULT_STAGE_LOOK = 'stormBreak';

/** The looks' names, in the order the menu shows them. */
export const stageLookNames = () => Object.keys(STAGE_LOOKS);

/** A look by name (the default for one that is not known). */
export const stageLookOf = (name) => STAGE_LOOKS[name] ?? STAGE_LOOKS[DEFAULT_STAGE_LOOK];

// ---- Interiors ---------------------------------------------------------------------------------------------------
// A section's `interior` (stage data: levelmode/stages/dunnottar-chapel.js) is how a room that is not under the sky is lit: the storm's look is the outside, and
// as the player walks in it is blended toward this over `blend` seconds, as `k` goes 0 to 1. Nothing here touches the DOM.
//
//   interior = {
//     sun       how much of the look's sun is left (0..1; the weather outside is a glimmer in glass: 0.03)
//     ambient   how much of the look's sky light (hemisphere) is left; `probe` of the probe the realistic look lights with (default: ambient)
//     tint      [r, g, b] the probe's light is multiplied by (the baked sky is a cold violet-grey; a nave of candles is amber)
//     hemi      { sky, ground } hex colours of the hemisphere light, for the toon look and the hemisphere
//     exposure  everything the lights give, times this (default 1)
//     fog       { colour (hex, also the background), near, far (m), mist (the low mist's density; 0: none) }
//     wet       how soaked the stone looks (default: the look's); torch: how bright the flames burn (default: the look's)
//     reach     how far the torches' light carries, times their own range (default 1): a dark room's flames light a wider pool
//     flash     how much of a lightning strike's flash gets in (0..1; the look's own strength is kept times this)
//     blend     seconds to blend over (default 1.5)
//   }

/** A colour in between two hex colours. */
export function lerpHex(a, b, t) {
  const channel = (shift) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * The numbers the weather sets when a look is `k` (0..1) of the way into an interior (eased): the light's strengths, the probe's tint, the fog and mist, the wetness, the torches
 * and how much of a lightning flash gets in. At k = 0 these are the look's own, exactly; at k = 1 the interior's.
 */
export function interiorLevels(look, spec, k) {
  const e = k * k * (3 - 2 * k);
  const mix = (a, b) => a + (b - a) * e;
  const exposure = mix(1, spec.exposure ?? 1) * look.exposure;
  const fog = spec.fog ?? { colour: look.fog.colour, near: look.fog.near, far: look.fog.far, mist: look.fog.mist.density };
  return {
    sun: look.sun.intensity * exposure * mix(1, spec.sun ?? 0.05),
    hemi: look.hemi.intensity * exposure * mix(1, spec.ambient ?? 0.4),
    probe: look.ambient.gain * exposure * mix(1, spec.probe ?? spec.ambient ?? 0.4),
    tint: look.ambient.tint.map((v, i) => mix(v, spec.tint?.[i] ?? v)),
    hemiSky: lerpHex(look.hemi.sky, spec.hemi?.sky ?? look.hemi.sky, e),
    hemiGround: lerpHex(look.hemi.ground, spec.hemi?.ground ?? look.hemi.ground, e),
    fogColour: lerpHex(look.fog.colour, fog.colour, e),
    fogNear: mix(look.fog.near, fog.near),
    fogFar: mix(look.fog.far, fog.far),
    mist: mix(look.fog.mist.density, fog.mist ?? 0),
    wet: mix(look.wet, spec.wet ?? look.wet),
    torch: mix(look.torch, spec.torch ?? look.torch),
    reach: mix(1, spec.reach ?? 1),
    flash: mix(1, spec.flash ?? 0.15),
    eased: e,
  };
}

/** The colour fields of `interiorLevels`, blended as colours (the rest are numbers, `tint` a triple). */
const LEVEL_COLOURS = ['hemiSky', 'hemiGround', 'fogColour'];

/**
 * The light now, moved a share `a` (0..1) of the way from `current` toward `target` (both `interiorLevels` results): the weather eases toward the light of where he
 * stands, from the open into a doorway and from one room into the next (the vault's torchlit dark into the crypt's blacker one), never in a step.
 */
export function approachLevels(current, target, a) {
  const t = Math.max(0, Math.min(1, a));
  const out = {};
  for (const [key, value] of Object.entries(target)) {
    const from = current?.[key] ?? value;
    if (LEVEL_COLOURS.includes(key)) out[key] = approachHex(from, value, t);
    else if (Array.isArray(value)) out[key] = value.map((v, i) => from[i] + (v - from[i]) * t);
    else out[key] = from + (value - from) * t;
  }
  return out;
}

/** A colour moved a share `t` of the way to another, each channel at least one step while it is not there (a small share would round back to where it was). */
function approachHex(a, b, t) {
  const channel = (shift) => {
    const from = (a >> shift) & 255;
    const to = (b >> shift) & 255;
    if (from === to || t <= 0) return from;
    const moved = Math.round(from + (to - from) * t);
    return moved === from ? from + Math.sign(to - from) : moved;
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Whether two `interiorLevels` results are the same light, near enough not to be worth setting again. */
export function levelsSettled(a, b, tolerance = 1e-3) {
  if (!a || !b) return false;
  return Object.entries(b).every(([key, value]) => {
    // (A colour eased a share of the way at a time stops a step short, rounded: within two of 255 in each channel is there.)
    if (LEVEL_COLOURS.includes(key)) return [16, 8, 0].every((shift) => Math.abs(((a[key] >> shift) & 255) - ((value >> shift) & 255)) <= 2);
    if (Array.isArray(value)) return value.every((v, i) => Math.abs(a[key][i] - v) < tolerance);
    return Math.abs(a[key] - value) < tolerance * Math.max(1, Math.abs(value));
  });
}
