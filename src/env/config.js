// The open air of a place, described once and drawn by one system (src/env/): the sun and the sky it lights, the
// haze between the eye and the hills, the wind, the weather, the land beyond the fighting floor, what grows on it
// and what drifts in the air over it.
//
// A place says what it is (PLACE_ENV below); nothing here or in the other env modules names a place. Converting
// another place is writing its description. A weather (ENV_WEATHER) is a change to the same description: more
// cloud, thicker air, a harder wind, rain or snow falling, the ground wet. `envSetWeather` (index.js) puts one on.
//
// Units are metres, seconds, radians unless a name says otherwise. Colours are the game's display values (the
// renderer does no colour management: looks.js), so every light sum is done in display space and the last step
// is a shoulder curve (air.js envInstallTone), not a physical exposure.
//
// Where a figure is physical it says what it is and how it was reached. None of them was looked up for this work:
// those marked "approximate" are commonly quoted values written from memory, to be checked before anything is
// built on their exactness. The rest are set by eye against the reference frames, and say so.

export const ENV = {
  // ---- the air --------------------------------------------------------------------------------------------
  air: {
    // Rayleigh optical depth of the whole atmosphere looking straight up, for red, green and blue light:
    // the scattering coefficients at sea level (approximate: 5.8, 13.5, 33.1 per 10^6 m at 680, 550, 440 nm)
    // times a scale height of about 8.4 km. Blue is scattered 5.7 times as much as red: the blue sky, the red sun.
    rayleighDepth: [0.049, 0.113, 0.278],
    // The same coefficients per metre at the ground, for the haze over the land: a hill 10 km off has lost
    // 6, 13 and 28 % of its red, green and blue to the air and gained the sky's in their place, which is why
    // far ridges go blue before they go pale.
    rayleighPerMetre: [5.8e-6, 13.5e-6, 33.1e-6],
    // Haze (water droplets, dust: Mie scattering) optical depth straight up on a clear day; a weather's
    // `turbidity` multiplies it. Approximate: clean country air is about 0.03 to 0.1, a hazy summer day 0.3.
    hazeDepth: 0.04,
    // Koschmieder: the eye loses a dark thing against the sky when its contrast falls to 2 %, so
    // visibility V = ln(1 / 0.02) / extinction = 3.912 / extinction. The haze's extinction per metre is this over V.
    koschmieder: 3.912,
    // Air masses toward the horizon: 1 / (cos z + 0.50572 (96.07995 - z)^-1.6364), z in degrees (the Kasten-Young
    // form, constants from memory; it gives 38 air masses at the horizon and 1 at the zenith, the known ends).
    airMass: [0.50572, 96.07995, 1.6364],
    // How forward the haze throws light (Henyey-Greenstein g): 0.76 is the usual figure for haze, approximate.
    // It is what makes the glow round a low sun.
    hazeForward: 0.76,
    // The share of the sun's own dimming that the light scattered into the sky has also suffered, looking along
    // the horizon and straight up: light seen overhead was scattered high, where the sun's path through the
    // air was short, so the zenith stays blue over an amber horizon at sunset. 1 would be the ground's own sun
    // colour everywhere (a brown zenith at dusk), 0 none. By eye.
    skyPathShare: [0.6, 0.16],
    // Light scattered more than once fills the sky in: this share of the single-scattered light, without the
    // sun's direction in it and as blue as the air scatters. By eye, so the sky opposite a low sun is not black.
    multiScatter: 0.3,
    // The sun's light before the air (display units; the light sums are display space), and how the sky's
    // radiance becomes a display value: (1 - exp(-skyExposure x radiance)) ^ (1 / skyGamma). A plain 2.2 gives
    // the sky's true, rather pale, blue; 1.45 is a photograph's contrast, and with 4.2 lands a noon zenith near
    // the 0x3a6fc0 of the panoramas the game wore and the horizon near white. Both by eye.
    sunPower: 1.0,
    skyExposure: 4.2,
    skyGamma: 1.45,
    // The sun's light on the ground: its colour through the air (per channel, to the 1 / 2.2 power, as a
    // display value) times this. 1.12 by eye: with the shoulder curve a sunlit white shirt just reaches it.
    sunGain: 1.12,
    // The ground's share of light thrown back up (grass and soil reflect about a fifth of what falls on them,
    // approximate): it lights the underside of things.
    bounce: 0.2,
    // Fighters and props are hazed by the renderer's own fog, which is exponential-squared where the haze here is
    // exponential: the two are made to agree at this distance (m), about the far side of a fighting floor.
    fogMatch: 40,
    // Looking up out of mist: the layer above the eye is `height` thick (e-folding), so the sky shows through
    // exp(-extinction x height / sin(elevation)): blue overhead, white at the horizon.
    // (No number here: it is the same integral as the land's haze taken to infinity.)
  },

  // ---- the last step: a shoulder, not a clip -----------------------------------------------------------------
  tone: {
    // Display values below `knee` are left exactly as authored (fighters, props and the interface read as
    // before); above it they bend toward 1 and never clip: knee + (1 - knee)(1 - exp(-(x - knee)/(1 - knee))).
    // 0.72 by eye: sunlit skin and linen sit just below it, so only the sun's glare, the cloud edges and
    // sunlit pale grass ride the shoulder.
    knee: 0.72,
    // The renderer's exposure in an env place (1 = as authored).
    exposure: 1.0,
  },

  // ---- the sky's picture: a table every part of the system reads ---------------------------------------------
  sky: {
    // The sky's colour by direction, baked from the model above whenever the sun or the weather changes:
    // `across` steps of angle from the sun round the horizon (0..pi, the sky is mirror-symmetric about the sun),
    // `up` steps of elevation, crowded toward the horizon (row = sqrt(sin elevation)) where the colour changes fastest.
    // The dome draws it, the haze takes its horizon row, the light probe is its sum: they cannot disagree.
    across: 64,
    up: 32,
    // The sun's disc: 0.27 degrees in radius (its real size), drawn `discGain` times the sky's ceiling so the
    // shoulder curve holds it as a glare; and a tight glow round it `glowGain` at 1 degree, falling off as a
    // power of the angle (lens and eye flare, by eye).
    discRadius: 0.0047,
    discGain: 6,
    glowGain: 0.35,
    // How bright a full overcast is beside the clear sky's zenith (display), before the weather's `gloom`.
    overcast: 0.82,
  },

  // ---- clouds: one sheet of noise, drifting with the wind ------------------------------------------------------
  clouds: {
    // The sheet's height (m) and the size of its largest masses (m). Fair-weather cumulus base is 600-2000 m
    // (approximate); 1500 and 2600 by eye give cumulus that reads the size it does in the reference frames.
    height: 1500,
    scale: 2600,
    // The wind aloft is stronger than at the ground and the clouds ride it: this many times the ground wind
    // (approximate: the power-law profile u ~ z^0.14 over grass gives about 2 at 1500 m from 2 m; 2.5 by eye,
    // so the drift is seen within a round).
    aloft: 2.5,
    // How far (in the sheet's own units) the density is read toward the sun to shade a cloud by its own depth.
    selfShadow: 0.035,
    // A cloud's shadow on the land: how much of the sun the thickest cloud takes.
    shadow: 0.75,
    // Below this elevation (sine) the sheet fades into the haze: no cloud is seen edge-on at the horizon.
    horizonFade: 0.09,
  },

  // ---- the wind over the ground --------------------------------------------------------------------------------
  wind: {
    // Gusts are parcels of faster air carried along by the wind itself (Taylor's frozen-turbulence picture):
    // the pattern below is fixed and moves downwind at the wind's own speed, so a gust is seen to cross the
    // field at the pace the air does. Two sizes of parcel: `long` m (a gust front, seconds apart at 5 m/s)
    // and `short` m (the cat's paws inside it). By eye against the reference clips: fronts 60 m apart, paws 14 m.
    long: 60,
    short: 14,
    // A front is wider across the wind than along it: its pattern is stretched this much across.
    across: 2.2,
    // The local speed is the mean times 1 + `depth` x gustiness x (pattern - 0.5) x 2: at a place's gust of
    // 0.5 the air between fronts falls to half and a front doubles it, about the 1.4-1.8 gust factors near
    // the ground the flame code (wind.js) already works to.
    depth: 1.1,
    // A stem bends by the drag on it, which goes as the square of the air's speed: this is the speed (m/s) at
    // which tall grass lies half over (45 degrees). By eye: a fresh breeze (8 m/s) flattens a hay meadow in gusts.
    grassFlat: 9,
    // A crown's sway: the tip of a 10 m tree moves this far (m) per (m/s)^2 of wind; real trees sway a few cm
    // in a breeze and half a metre in a gale (approximate), which is 0.004 at 10 m/s.
    treeSway: 0.004,
    // Leaves flutter at these rates (Hz) with an amplitude (m) per m/s of local wind.
    flutter: [2.3, 3.7],
    flutterReach: 0.012,
  },

  // ---- the land ------------------------------------------------------------------------------------------------
  terrain: {
    // The land is one disc of `rings` x `sectors` quads out to `reach` m, the rings growing by a constant
    // ratio from `inner` m, so a quad is about as wide as it is deep everywhere and about 8 % of its distance:
    // 2.4 m at 30 m, 80 m at 1 km. (56 000 triangles.)
    rings: 110,
    sectors: 256,
    inner: 2,
    reach: 9000,
    // The fighting floor is flat at y = 0 (the physics stands on it) out to the place's `keepOut` and this
    // much further (m); only beyond that does the land begin to rise or fall, with no slope where it starts.
    flatMargin: 3,
    // The near land's height, shade and cover, baked to one texture the grass and the ground shader read:
    // `mapHalf` m each way from the centre, `mapSize` texels across (0.75 m a texel).
    mapHalf: 192,
    mapSize: 512,
    // Baked sun shadow of the land on itself: a ray toward the sun is walked `shadowSteps` steps of
    // growing length to `shadowReach` m; `shadowSoft` is the penumbra's width as a share of the distance walked.
    shadowSteps: 20,
    shadowReach: 2400,
    shadowSoft: 0.06,
    // Ground steeper than `rockFrom` (slope, rise over run) shows rock, wholly by `rockTo`.
    rockFrom: 0.55,
    rockTo: 0.95,
    // Wet ground: soil darkens to about this share of its dry colour (approximate: wet soil albedo is
    // roughly half of dry), and takes a sheen of the sky at grazing angles.
    wetDarken: 0.58,
    wetSheen: 0.5,
    // What counts as standing on the ground (a post, a hut, a rack: no grass through it, no tree on it): a mesh
    // that reaches the ground, at least `standTall` m high and no more than `standWide` m half across (a wider
    // one is ground or a backdrop).
    standTall: 0.25,
    standWide: 8,
  },

  // ---- grass ----------------------------------------------------------------------------------------------------
  grass: {
    // Three rings of blades that follow the camera, each a square tile `tile` m wide of `count` blades
    // wrapped round the eye, each blade `width` m at the root. Near: single blades. Mid and far: the same
    // blade drawn wider and fewer, a tuft standing for the many it hides, over ground coloured as the grass is.
    // Counts by measurement (see the report): 240 000 blades cost about 1 ms on an M-series GPU.
    layers: [
      { tile: 30, count: 110000, width: 0.035, segments: 3, tall: 1 },
      { tile: 90, count: 90000, width: 0.11, segments: 2, tall: 1.05 },
      { tile: 300, count: 60000, width: 0.42, segments: 1, tall: 1.15 },
    ],
    // A blade's lean at rest (rad, random way) and how much each differs in height (share).
    lean: 0.32,
    vary: 0.45,
    // Colour: the root is this share of the tip's brightness (shaded by its neighbours), and a blade seen
    // against the sun glows by `through` (light through the leaf: by eye against the backlit grass of the references).
    rootShade: 0.42,
    through: 0.55,
    // A bent blade turns its glossy face to the sky: this much of the sky's light is added at full bend.
    // It is what makes a gust visible from far off (the pale wave crossing a hayfield).
    sheen: 0.38,
  },

  // ---- trees ----------------------------------------------------------------------------------------------------
  trees: {
    // A crown is a cloud of leaf cards; how many by distance band (m from the centre): full near, fewer and
    // larger far off, the far woods a handful each.
    bands: [
      { to: 140, cards: 150, trunk: true },
      { to: 520, cards: 30, trunk: true },
      { to: 2600, cards: 6, trunk: false },
    ],
    // The leaf-card picture: `atlas` x `atlas` tiles of `tile` px, drawn once per kind of tree.
    atlas: 2,
    tile: 128,
    // Shading inside a crown: the inside and the underside are darker (leaves shade leaves) by up to this share.
    inner: 0.55,
    // Light through the leaves when the sun is behind the crown.
    through: 0.6,
  },

  // ---- what falls and drifts --------------------------------------------------------------------------------------
  particles: {
    // Each kind lives in a box round the camera and wraps at its faces, carried by the same wind travel as
    // the gusts. `fall` m/s is the terminal speed (approximate: 2 mm raindrops about 6.5, large ones 9;
    // snowflakes 1 to 1.5; a leaf 1 to 2), `ride` the share of the wind it takes up, `size` m,
    // `streak` s of exposure a falling drop is smeared over (1/40 s: a drop at 8 m/s draws 0.2 m long).
    rain: { box: [28, 16, 28], count: 9000, fall: 8, ride: 1, size: 0.012, streak: 0.028, wander: 0 },
    snow: { box: [26, 14, 26], count: 7000, fall: 1.2, ride: 1, size: 0.022, streak: 0, wander: 0.35 },
    leaves: { box: [40, 12, 40], count: 260, fall: 0.9, ride: 0.9, size: 0.07, streak: 0, wander: 0.9 },
    petals: { box: [34, 9, 34], count: 420, fall: 0.5, ride: 0.95, size: 0.028, streak: 0, wander: 0.7 },
    motes: { box: [22, 7, 22], count: 900, fall: 0.02, ride: 1, size: 0.008, streak: 0, wander: 0.25 },
    dust: { box: [50, 9, 50], count: 1400, fall: 0.05, ride: 1, size: 0.5, streak: 0, wander: 0.5 },
  },

  // ---- what a weak device drops ---------------------------------------------------------------------------------------
  // The share of each thing drawn at each quality tier (levelmode/quality.js names them; adaptres.js steps
  // down when frames run long). Blades and cards are shuffled when built, so drawing a share leaves an even
  // sprinkle; grass blades widen by 1 / sqrt(share) so the ground stays covered.
  quality: {
    high: { grass: 1, far: 1, cards: 1, particles: 1, cloudShadow: true },
    medium: { grass: 0.5, far: 0.7, cards: 0.6, particles: 0.6, cloudShadow: true },
    low: { grass: 0.2, far: 0.4, cards: 0.3, particles: 0.35, cloudShadow: false },
  },

  // ---- choosing the tier ---------------------------------------------------------------------------------------------
  // index.js envAdapt, each frame. The thresholds are adaptres.js's own (a frame over `slowMs` is a missed 60 Hz
  // frame, under `fastMs` one made with room), but it waits longer than adaptres's 0.8 s before stepping down, so
  // a dense screen first gives up pixels (which costs nothing to look at) and only then grass.
  adapt: {
    tiers: ['high', 'medium', 'low'],
    slowMs: 21,
    fastMs: 17.6,
    // The weight of each new frame in the running interval, and the interval (ms) past which a frame is a stall.
    smoothing: 0.08,
    stallMs: 250,
    // s of long frames before a step down; s of short ones before a step up (doubled after a step up that failed).
    slowSeconds: 1.5,
    fastSeconds: 12,
    // The tier a touch device (coarse pointer: a phone, a tablet) starts at.
    touchStart: 'medium',
  },
};

// ---- kinds of tree ---------------------------------------------------------------------------------------------------
// `height` m (least, most), `crown` the crown's half-width and half-height as shares of the tree's height and where
// its middle stands, `shape` the envelope the leaf cards fill ('round' an ellipsoid, 'cone' a spire), `card` a leaf
// card's size as a share of the height, `leaf` and `bark` colours (display), `picture` which leaf-card drawing.
export const ENV_TREES = {
  // An English oak or ash in a hedgerow: 12-20 m, as broad as it is tall.
  broadleaf: { height: [9, 17], crown: { wide: 0.38, tall: 0.34, at: 0.66 }, shape: 'round', card: 0.2, leaf: [0x41622a, 0x5a7a34, 0x2f4d22], bark: 0x4b3d2c, trunk: 0.035, picture: 'leaf' },
  // Japanese red pine and cedar on a valley side: 15-25 m, a narrow spire, dark.
  pine: { height: [12, 22], crown: { wide: 0.2, tall: 0.42, at: 0.56 }, shape: 'cone', card: 0.17, leaf: [0x2c4630, 0x3a5638, 0x1f3524], bark: 0x4a3626, trunk: 0.028, picture: 'needle' },
  // Autumn broadleaf among the pines (maple, zelkova): the valley's colour in October.
  autumn: { height: [8, 14], crown: { wide: 0.36, tall: 0.32, at: 0.66 }, shape: 'round', card: 0.2, leaf: [0xa8642a, 0xb8862e, 0x8a3a22], bark: 0x43352a, trunk: 0.035, picture: 'leaf' },
};

// ---- weathers --------------------------------------------------------------------------------------------------------
// Each is laid over the place's own description. `cover` 0..1 of the sky in cloud, `gloom` how dark the cloud's
// underside (0 white cumulus .. 1 slate), `sun` the share of direct sun reaching the ground, `visibility` m (null:
// the place's own), `hazeHeight` m the haze thins by 1/e (null: the place's), `turbidity` times the clear haze aloft,
// `wind` times the place's speed and `gust` added to its gustiness, `wet` 0..1 of the ground, `fall` what falls
// (a kind in ENV.particles) and how much of its count, `snow` 0..1 of the ground whitened, `tint` the haze's own
// colour where it has one (dust).
export const ENV_WEATHER = {
  clear: { label: 'Clear', cover: null, gloom: 0, sun: 1, visibility: null, hazeHeight: null, turbidity: 1, wind: 1, gust: 0, wet: 0, fall: null, snow: 0 },
  // Broken cloud racing over: the light comes and goes.
  cloudy: { label: 'Broken cloud', cover: 0.62, gloom: 0.35, sun: 0.9, visibility: null, hazeHeight: null, turbidity: 1.5, wind: 1.3, gust: 0.1, wet: 0, fall: null, snow: 0 },
  // A low grey lid: no shadows, flat light (the sun's share is what gets through thick stratus, a few per cent direct).
  overcast: { label: 'Overcast', cover: 1, gloom: 0.55, sun: 0.06, visibility: 12000, hazeHeight: null, turbidity: 3, wind: 1.2, gust: 0.05, wet: 0, fall: null, snow: 0 },
  // Steady rain: visibility a few km (approximate for moderate rain), everything wet.
  rain: { label: 'Rain', cover: 1, gloom: 0.8, sun: 0.03, visibility: 2600, hazeHeight: 900, turbidity: 4, wind: 1.5, gust: 0.15, wet: 1, fall: { kind: 'rain', share: 1 }, snow: 0 },
  // Ground mist at dawn: a layer some tens of metres deep, the sun and the sky above it clear, the air near still.
  // (Mist is by definition visibility over 1 km and fog under; a valley's dawn fog is 100-400 m. 260 by eye, so the
  // far side of the floor is soft and the trees beyond are shapes.)
  mist: { label: 'Mist', cover: 0.2, gloom: 0, sun: 0.85, visibility: 260, hazeHeight: 26, turbidity: 2.5, wind: 0.3, gust: 0, wet: 0.35, fall: null, snow: 0 },
  // Snow driving on a hard wind: visibility under a km in moderate snow (approximate), the ground white.
  snow: { label: 'Snow', cover: 1, gloom: 0.4, sun: 0.05, visibility: 700, hazeHeight: 600, turbidity: 3, wind: 1.6, gust: 0.15, wet: 0, fall: { kind: 'snow', share: 1 }, snow: 0.85 },
  // Dust lifted off dry ground by a hard wind: an ochre haze near the ground.
  dust: { label: 'Dust', cover: 0.15, gloom: 0, sun: 0.7, visibility: 1200, hazeHeight: 120, turbidity: 6, wind: 1.8, gust: 0.2, wet: 0, fall: { kind: 'dust', share: 1 }, snow: 0, tint: 0xc9ab7a },
};

// ---- places ----------------------------------------------------------------------------------------------------------
// sun: `azimuth` rad round from +x toward +z (scenery.js's convention: -pi/2 is the far side of the floor),
//   `elevation` degrees above the horizon.
// air: `visibility` m on this place's clear day, `hazeHeight` m.
// clouds: `cover` 0..1 on its clear day.
// terrain: `seed`; `fall` the floor stands on a height and the land drops `drop` m between `from` and `to` m out;
//   `layers` of relief, each { from, full: where it begins and is whole (m from the floor's edge), height, length
//   (m: the size of a hill), shape: 'roll' (soft) | 'ridge' (crested) }, added together.
// ground: `grass` and `dry` the two colours grass varies between, `soil`, `rock`; `floor` 0..1 how worn the fighting
//   floor is (1 bare earth); `worn` extra bare patches [{ x, z, rx, rz, turn, by }].
// grass: `height` m (least, most) outside the floor, `floorHeight` m on it, `dry` 0..1 share gone to straw,
//   `flowers` 0..1 share of far tufts in flower and their colours.
// trees: stands of ENV_TREES kinds, each { kind, count, from, to (m from the centre), clump 0..1 }.
// woods: 0..1 of the far hills wooded (drawn as colour on the land beyond the last tree), and its colour.
// drift: what is in the air on its clear day: [{ kind (ENV.particles), share of its count, colours }].
export const PLACE_ENV = {
  // A village green on the brow of a down, late on a summer afternoon: the grass uncut beyond the fence, the land
  // falling away to wooded hills that fade ridge behind ridge into the haze (the first reference).
  meadow: {
    weather: 'clear',
    sun: { azimuth: -0.95, elevation: 21 },
    air: { visibility: 26000, hazeHeight: 1100 },
    clouds: { cover: 0.42 },
    terrain: {
      seed: 11,
      fall: { from: 30, to: 420, drop: 46 },
      layers: [
        { from: 0, full: 60, height: 1.6, length: 46, shape: 'roll' },
        { from: 120, full: 500, height: 55, length: 520, shape: 'roll' },
        { from: 700, full: 2000, height: 190, length: 1500, shape: 'ridge' },
        { from: 2600, full: 5200, height: 520, length: 3600, shape: 'ridge' },
      ],
    },
    ground: { grass: 0x5b7a2c, dry: 0x9a9048, soil: 0x6b5638, rock: 0x7d7a70, floor: 0.3, worn: [{ x: 0, z: 0, rx: 9, rz: 2.2, turn: 0.2, by: 0.8 }] },
    grass: { height: [0.3, 0.62], floorHeight: 0.06, dry: 0.32, flowers: 0.1, flowerColours: [0xf2efe0, 0xe8c83a, 0xc58ad0] },
    trees: [
      { kind: 'broadleaf', count: 26, from: 24, to: 120, clump: 0.6 },
      { kind: 'broadleaf', count: 260, from: 120, to: 520, clump: 0.8 },
      { kind: 'broadleaf', count: 2600, from: 480, to: 2600, clump: 0.85 },
    ],
    woods: { cover: 0.6, colour: 0x34502a },
    drift: [{ kind: 'motes', share: 1, colours: [0xfff4d0] }, { kind: 'petals', share: 0.5, colours: [0xf4f0e2, 0xe8d77a] }],
  },
  // Open pasture for horsemen under a driven sky: a wide level floor, long low swells, a scarp far off, the
  // grass running in waves before a fresh breeze.
  field: {
    weather: 'cloudy',
    sun: { azimuth: -2.3, elevation: 34 },
    air: { visibility: 18000, hazeHeight: 900 },
    clouds: { cover: 0.62 },
    terrain: {
      seed: 23,
      layers: [
        { from: 0, full: 90, height: 2.4, length: 90, shape: 'roll' },
        { from: 200, full: 900, height: 38, length: 800, shape: 'roll' },
        { from: 1500, full: 4200, height: 260, length: 3000, shape: 'ridge' },
      ],
    },
    ground: { grass: 0x64803a, dry: 0xa39a52, soil: 0x74603e, rock: 0x7d7a70, floor: 0.22, worn: [{ x: 0, z: 0, rx: 38, rz: 12, turn: 0, by: 0.55 }] },
    grass: { height: [0.32, 0.7], floorHeight: 0.09, dry: 0.45, flowers: 0.03, flowerColours: [0xf2efe0, 0xe8c83a] },
    trees: [
      { kind: 'broadleaf', count: 34, from: 62, to: 240, clump: 0.85 },
      { kind: 'broadleaf', count: 300, from: 240, to: 700, clump: 0.9 },
      { kind: 'broadleaf', count: 1800, from: 650, to: 2600, clump: 0.9 },
    ],
    woods: { cover: 0.4, colour: 0x38522c },
    drift: [{ kind: 'motes', share: 0.4, colours: [0xe8e4d0] }],
  },
  // Sekigahara at first light, 21 October 1600: a valley floor shut in by steep wooded mountains, the night's fog
  // still lying in it (the battle opened in fog), the sun low through the pines (the second reference).
  sengoku: {
    weather: 'mist',
    sun: { azimuth: -1.15, elevation: 15 },
    air: { visibility: 16000, hazeHeight: 800 },
    clouds: { cover: 0.25 },
    terrain: {
      seed: 37,
      layers: [
        { from: 0, full: 50, height: 1.2, length: 40, shape: 'roll' },
        { from: 70, full: 520, height: 150, length: 620, shape: 'ridge' },
        { from: 500, full: 2400, height: 520, length: 2200, shape: 'ridge' },
      ],
    },
    ground: { grass: 0x76803c, dry: 0xa8924a, soil: 0x6a553a, rock: 0x77756e, floor: 0.6, worn: [{ x: 0, z: 0, rx: 12, rz: 6, turn: 0, by: 0.7 }] },
    grass: { height: [0.35, 0.8], floorHeight: 0.05, dry: 0.6, flowers: 0, flowerColours: [] },
    trees: [
      { kind: 'pine', count: 46, from: 21, to: 110, clump: 0.5 },
      { kind: 'autumn', count: 12, from: 24, to: 110, clump: 0.3 },
      { kind: 'pine', count: 420, from: 110, to: 520, clump: 0.6 },
      { kind: 'pine', count: 2600, from: 480, to: 2400, clump: 0.5 },
    ],
    woods: { cover: 0.9, colour: 0x2c4430 },
    drift: [{ kind: 'leaves', share: 1, colours: [0xa8642a, 0xb8862e, 0x8a3a22, 0x6a5a2a] }, { kind: 'motes', share: 0.6, colours: [0xfff0c8] }],
  },
};
