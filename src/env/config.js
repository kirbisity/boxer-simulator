// The open air of a place, described once and drawn by one system (src/env/): the sun and the sky it lights, the
// haze between the eye and the hills, the wind, the weather, the land beyond the fighting floor, what grows on it
// and what drifts in the air over it.
//
// A place says what it is (PLACE_ENV below); nothing here or in the other env modules names a place. Converting
// another place is writing its description. A weather (ENV_WEATHER) is a change to the same description: more
// cloud, thicker air, a harder wind, rain or snow falling, the ground wet. `envSetWeather` (index.js) puts one on.
//
// Units are metres, seconds, radians unless a name says otherwise. Colours are the game's display values (the
// renderer does no colour management: looks.js), so every light sum is done in display space, and may pass 1:
// the frame is ended by a camera's last steps (post.js: the sums are decoded to light, exposed, bent by one
// filmic curve and graded), so the sun can be several times the sky and neither clips.
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
    // Koschmieder: the eye loses a dark thing against the sky when its contrast falls to 2 %, so
    // visibility V = ln(1 / 0.02) / extinction = 3.912 / extinction. The haze's extinction per metre is this over V.
    // The same haze looked straight up through is that extinction times the height it thins over (its optical
    // depth: a place's 40 km and 1000 m give 0.1; approximate figures for comparison: clean country air 0.05 to
    // 0.1, a hazy summer day 0.3), and that depth is what whitens the sky and dims the sun: one haze, not two.
    koschmieder: 3.912,
    // Air masses toward the horizon: 1 / (cos z + 0.50572 (96.07995 - z)^-1.6364), z in degrees (the Kasten-Young
    // form, constants from memory; it gives 38 air masses at the horizon and 1 at the zenith, the known ends).
    airMass: [0.50572, 96.07995, 1.6364],
    // How forward the haze throws light (Henyey-Greenstein g): 0.76 is the usual figure for haze, approximate.
    // It is what makes the glow round a low sun.
    hazeForward: 0.76,
    // The haze's light is tabled along the horizon only (the sky table's lowest row), but the sun stands over
    // it: a sight line nearer the sun than the level line under it is brighter by the ratio of the phase
    // function at the two angles, which is the bright patch of mist round a low sun. `aureole`: the share of
    // the haze's light that follows that ratio (light scattered once; the rest has been scattered about and
    // comes evenly). By eye against the second reference, where the mist toward the sun burns white.
    aureole: 0.45,
    // The share of the sun's own dimming that the light scattered into the sky has also suffered, looking along
    // the horizon and straight up: light seen overhead was scattered high, where the sun's path through the
    // air was short, so the zenith stays blue over an amber horizon at sunset. 1 would be the ground's own sun
    // colour everywhere (a brown zenith at dusk), 0 none. By eye.
    skyPathShare: [0.6, 0.16],
    // Light scattered more than once fills the sky in: this share of the single-scattered light, without the
    // sun's direction in it and as blue as the air scatters. By eye, so the sky opposite a low sun is not black.
    multiScatter: 0.3,
    // The sun's light before the air (display units; the light sums are display space), and how the sky's
    // radiance becomes a display value: (1 - exp(-skyExposure x radiance)) ^ (1 / skyGamma). A plain gamma of
    // 2.2 and an exposure of 4 give the sky the eye sees at noon, pale to the horizon; the reference frames hold
    // their skies down as a film grade does (deep blue from 15 degrees up, the horizon grey-blue and not white),
    // and 2.2 with 1.1 lands there: a late-afternoon sky 0x5a89b6 at 15 degrees, 0x29477f overhead. Both by eye.
    sunPower: 1.0,
    skyExposure: 2.2,
    skyGamma: 1.1,
    // The sky's light on the ground beside its picture's brightness. 1: the ground is lit by the sky that is
    // drawn, no more (it was 1.6 while the frame had no exposure of its own, to hold the shade up by hand). With
    // `sunGain` this sets how much stronger sunlit ground is than shaded ground: measured outdoors under a clear
    // sky the whole light on level ground is about 5 times the sky's alone with the sun at 30 degrees and 6 to 8
    // near noon (approximate figures from memory: direct sun about 100 klx square-on, the clear sky's own 10 to
    // 20 klx). What these two give here, as luminance (the display sum to the 2.2 power): 5.1 at the meadow's
    // 30 degrees, 5.6 at the field's 34, 2.4 under the 15 degree sun of the sengoku place (the light probe's figures).
    skyFill: 1.0,
    // A cloud's shaded base beside the sky's light on the ground (by eye: the slate-blue bases of the references).
    cloudBase: 0.6,
    // The most a sunlit cloud top is drawn (display; over 1 it is rolled off by the frame's curve and spreads a
    // little in the lens: a cumulus in the sun is the brightest thing in a landscape but the sun). By eye.
    cloudMost: 1.6,
    // Under a full overcast the lid's thick parts are this share darker and its thin parts as much lighter
    // than its mean (by eye: a stratus base is nearly even).
    lidGrain: 0.1,
    // Red, green and blue light (nm), for what depends on wavelength, and how haze dims by it: extinction goes as
    // wavelength ^ -fine. A weather says how fine its haze is (ENV_WEATHER `fine`): about 1.3 for the fine dry
    // haze of clear country air (the Angstrom exponent, approximate), 0 for droplets (mist, rain, snow dim every
    // colour alike, which is why fog is white and distant hills on a fine day are blue).
    wavelengths: [680, 550, 440],
    // The sun's light on the ground: its colour through the air (per channel, to the 1 / 2.2 power, as a
    // display value) times this. Set with `skyFill` against the sun-to-sky ratio above.
    sunGain: 1.25,
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

  // ---- the last steps: exposure, one filmic curve, a grade (post.js) -------------------------------------------
  tone: {
    // The frame's display sums are decoded to light (x ^ 2.2), multiplied by the exposure and bent by
    //   y = gain L^n / (L^n + sigma^n)
    // (Naka and Rushton's curve, an S on a logarithmic scale of light: how film and the retina both answer it),
    // with sigma and gain solved so that `grey` stays where it is and light `white` times a white card's reaches
    // the display's ceiling. n is the grade's `contrast`: at 1 it is Reinhard's curve; above 1 the darks go
    // down faster than the lights come up (a toe). Mid-grey is 0.18 of a white card's light (the photographic
    // convention), so colours near the middle keep their authored values and only the ends are bent.
    grey: 0.18,
    // The fill on a face's ambient light (photoface.js PHOTO_FACES.fill, 1.8) was set against places whose
    // ambient is a fraction of what a sky gives and whose frame has no exposure: under this sky, metered, 1.8
    // bleached a pale face under overcast (its middle at 0.78 of the display). This is the fill while an open-air
    // place is shown: by eye against close-ups under clear sky and overcast, between a pale face bleaching under
    // overcast (above) and a face turned from a clear sun going grey, a man's eye sockets a brown band (below).
    faceFill: 1.5,
    // The exposure is metered as a camera does it (post.js envMeter), off what the view holds: the land (a grey
    // card's worth of the light falling on level ground, sun x sin elevation + sky, as luminance) and, through
    // thick air, the haze's own light the way the camera looks, by the share of a sight line `view` m long that
    // the haze fills (60 by eye: about the depth of a view across a floor to the trees; on a clear day that
    // share is under 1 % and the land alone is metered). `meter`: how many times mid-grey that metered light is
    // placed at (1 would put a grey card in the sun at mid-grey, where a light meter puts it; grass and earth are
    // darker than a grey card and the references hold their pictures' middle near 0.3 to 0.4 of full scale,
    // which 1.7 reaches: by eye). `adapt`: how much of the difference between one light and another the
    // exposure takes up. At 1 every weather would come out as bright as every other; at 0 an overcast would be
    // as dark as its light is. 0.7 by eye: a grey day is still a grey day.
    meter: 1.7,
    adapt: 0.7,
    view: 60,
    // The grade, where a weather does not say otherwise (ENV_WEATHER `grade`): `ev` stops over the metered
    // exposure, `contrast` the curve's n, `saturation` (1 as the curve leaves it), `white` the light (in white
    // cards) that just reaches the ceiling, `warmth` moved from blue to red (0.02: 2 % each way). All by eye
    // against the two reference frames' tone ranges (their darkest 5 % under 0.13 of full scale, their median
    // near 0.3 to 0.4, measured from the files), and so that a fighter in shade is never under about 0.15.
    grade: { ev: 0, contrast: 1.28, saturation: 1.06, white: 6, warmth: 0 },
  },

  // ---- light past the lens: glare, shafts, the lens's own falloff (post.js) -----------------------------------
  post: {
    // Bloom: light over `bloomFrom` white cards (after exposure) spreads as a lens and the eye spread it, over
    // `bloomLevels` halvings of the picture, each added back at `bloomSpread` of the one above; `bloom` of the
    // sum is added to the frame. Only the sun, its glare, sunlit cloud edges, wet ground toward the sun and
    // steel pass the threshold: a sunlit white wall is about 1 and does not. By eye.
    bloomFrom: 1.15,
    // (No light counts for more than `bloomMost` cards: a glint a pixel wide would otherwise flare and flicker.)
    bloomMost: 24,
    bloomLevels: 5,
    bloomSpread: 0.85,
    bloom: 0.11,
    // Sun shafts: the picture's bright parts over `shaftFrom` white cards are drawn out along the lines from
    // the sun's place on (or beyond) the screen, over `shaftReach` of the way to it in `shaftSteps` samples,
    // fading by exp(-distance x shaftFade) (distance in picture heights). They are light scattered toward the eye
    // by lit air, so their strength is the share of light the haze scatters over `shaftPath` m,
    // 1 - exp(-extinction x path), times the weather's share of sun: 0.6 in the mist, under 0.01 on a clear day.
    // The path is by eye (about the depth of a view through the trees); the rest follows from the air.
    shaftFrom: 0.55,
    shaftReach: 0.85,
    shaftSteps: 28,
    shaftFade: 1.5,
    shaftPath: 60,
    shafts: 0.5,
    // The shafts fade as the sun leaves the picture and are gone with it this many half-pictures from the middle.
    shaftOff: 2.6,
    // A simple lens lights the film's corners less than its middle, by cos^4 of the angle off its axis (the
    // cos-fourth law); real lenses correct most of it. This share of that falloff is drawn, by the camera's
    // own field of view, so a wide view darkens more at the corners than a close-up. By eye.
    vignette: 0.3,
  },

  // Sunlight through an opening into a dark space (particles.js envBuildBeams): a gate's mouth seen from inside
  // the passage, a gap between eaves, a smoke hole. The air the sun reaches through the opening is lit and the
  // air beside it is not; what is seen is the lit air's own scattering, so the beam is as bright as the air is
  // thick: next to nothing on a clear day, plain in mist, in falling snow, and in the dust of a trodden passage.
  beams: {
    // A beam too thick to see through, seen from the side, as a share of the sun's light on a white card: the
    // haze throws most of its light forward (air.hazeForward), little sideways. By eye.
    side: 0.4,
    // Looking up a beam toward the sun it is brighter by the haze's forward lobe, by no more than this many
    // times (the lobe's own peak is a glare the bloom already draws).
    most: 5,
    // Dust hanging in still, sheltered, trodden air, as extinction per metre, for an opening that does not give
    // its own: 0.012 is a visibility of about 330 m. By eye.
    dust: 0.012,
    // No beam is drawn longer than this (m): past it the opening's light is a patch on the ground, not a shaft.
    reach: 40,
  },

  // ---- shadows ---------------------------------------------------------------------------------------------------
  shadow: {
    // The sun is a disc, not a point: 1.39 million km across at 149.6 million km, 0.0093 rad. A shadow's edge is
    // that wide per metre between what casts it and what it falls on: sharp at a foot, 3 cm soft from a head on
    // level ground under a 30 degree sun. `soften` times that is drawn (2 by eye: the shadow map's own texels,
    // 9 mm, would otherwise show at the sharp end), never narrower than `least` nor wider than `most` texels
    // (the filter is 17 taps: wider than that and they show as steps).
    sunWidth: 0.0093,
    soften: 2,
    least: 0.9,
    most: 4.5,
    // How far (texels) the map is searched for what stands between a point and the sun.
    search: 5,
    // Tree shade: under a crown the near map's shade is broken into flecks of sun the size of the gaps between
    // leaves' masses (`dapple` m), moving as the crown sways (the gust where it stands, `dappleSway` m per m/s).
    // The flecks are sharp where the shade is thin and close up as it deepens. By eye.
    dapple: 0.55,
    dappleSway: 0.06,
    // The sky's light under a crown, beside open ground (a broadleaf canopy passes a few per cent of the light
    // over it; a single tree's shade still sees the sky to its sides: 0.45 by eye), and at the foot of a wall
    // or a stack, which hides half the sky from the ground beside it (a plane's form factor: exactly one half at
    // the foot of a tall wall, fading over about the wall's reach; `wallReach` m by eye).
    underCrown: 0.45,
    atWall: 0.5,
    wallReach: 1.4,
    // What a body hides of the sky from the ground it stands on: each foot and the hips as a sphere of this
    // radius (m), hiding (r / d)^2 cos(angle from straight up) of the sky's light from a point d away (the form
    // factor of a small sphere, exact while it is clear of the horizon). `contact` times that: the legs and the
    // trunk between the spheres hide as much again (by eye).
    bodies: [0.11, 0.22],
    contact: 1.6,
    // How many spheres the shaders take: three a fighter, the four fighters nearest the camera.
    bodyCount: 12,
    // How far from the farthest of them the shaders still count them (m): 2.5 m from the hips' sphere a metre up
    // hides 0.22^2 x 1 / 2.5^3 x contact = half a hundredth of the sky, under what an eye sees; the rest of the
    // field skips the count, which at a million blades was a third of the frame.
    bodyReach: 2.5,
    // Grass under a foot: blades within `tread` m of one are pressed over, away from it.
    tread: 0.3,
  },

  // ---- the sky's picture: a table every part of the system reads ---------------------------------------------
  sky: {
    // The sky's colour by direction, baked from the model above whenever the sun or the weather changes:
    // `across` steps of angle from the sun round the horizon (0..pi, the sky is mirror-symmetric about the sun),
    // `up` steps of elevation, crowded toward the horizon (row = sqrt(sin elevation)) where the colour changes fastest.
    // The dome draws it, the haze takes its horizon row, the light probe is its sum: they cannot disagree.
    across: 64,
    up: 32,
    // The brightest the table holds (a display value; its 8 bits are spread over 0..most). Toward a low sun
    // the sky is brighter than anything on the ground, and a table that stopped at 1 was one flat white there:
    // with the range kept, the last pass's curve rolls it off and the brightening toward the sun is drawn.
    most: 2,
    // The sun's disc: 0.27 degrees in radius (its real size), drawn `discGain` times the sky's ceiling so the
    // shoulder curve holds it as a glare; and a tight glow round it `glowGain` at 1 degree, falling off as a
    // power of the angle (lens and eye flare, by eye).
    discRadius: 0.0047,
    discGain: 6,
    glowGain: 0.35,
    // A full overcast overhead, before the weather's `gloom` and the lid's own grey (air.js; a display value,
    // 1 the ceiling): the lid is the brightest thing in the picture, as it is to a camera set for the ground
    // under it (by eye; at 0.82 the lid was darker than the grass it lights).
    overcast: 1.15,
  },

  // ---- clouds: one sheet of noise, drifting with the wind ------------------------------------------------------
  clouds: {
    // The sheet's height (m) and the size of its largest masses (m). Fair-weather cumulus base is 600-2000 m
    // (approximate); 1500 and 2600 by eye give cumulus that reads the size it does in the reference frames.
    height: 1500,
    scale: 2600,
    // A cumulus is as deep as it is broad or less (fair-weather ones a few hundred metres to a kilometre:
    // approximate). The sheet is drawn at `levels` heights from its base to `deep` m over it, each level's
    // clouds narrower by `taper` of the noise (a cloud's top is smaller than its base). By eye.
    deep: 700,
    levels: 3,
    taper: 0.09,
    // The wind aloft is stronger than at the ground and the clouds ride it: this many times the ground wind
    // (approximate: the power-law profile u ~ z^0.14 over grass gives about 2 at 1500 m from 2 m; 2.5 by eye,
    // so the drift is seen within a round).
    aloft: 2.5,
    // How far (in the sheet's own units) the density is read toward the sun to shade a cloud by its own depth.
    selfShadow: 0.035,
    // How far inside a cloud (in the sheet's noise, 0 its edge, about 0.35 the middle of a large one) its base is
    // wholly dark: seen from below a cumulus is a grey base with bright edges. 0.2 by eye against the references.
    baseAt: 0.2,
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
    // A wet built surface (stone, tile, planks: air.js envDress) is this share as rough as dry: the film of
    // water fills its grain and mirrors the sky. By eye.
    wetRough: 0.4,
    // Snow lying, as a display colour in full light: new snow throws back eight or nine tenths of what falls on it
    // (approximate), a little more of the blue. One figure for the land and for a place's own surfaces
    // (air.js envDress), so a drift against a wall and the ground it lies on agree.
    snowColour: [0.9, 0.92, 0.96],
    // How fast the ground takes and loses its wet where the rain comes and goes (seconds to cover 63 % of the
    // way): a shower darkens stone and earth in well under a minute; drying takes a good part of an hour in
    // life and is shortened here to a few minutes so that a fight sees the ground lighten (by eye). Under a gap
    // the ground dries no further than `dryTo` of the weather's wet.
    wetIn: 25,
    dryOut: 240,
    dryTo: 0.45,
    // What counts as standing on the ground (a post, a hut, a rack: no grass through it, no tree on it): a mesh
    // that reaches the ground, at least `standTall` m high and no more than `standWide` m half across (a wider
    // one is ground or a backdrop).
    standTall: 0.25,
    standWide: 8,
  },

  // ---- grass ----------------------------------------------------------------------------------------------------
  grass: {
    // Rings of blades that follow the camera, each a square tile `tile` m wide of `count` blades wrapped round
    // the eye, each blade `width` m at the root and `segments` quads up its length. Nearest: single blades (a
    // grass leaf is 5 to 20 mm wide; 18 holds a pixel at the floor's far side). Further: the same blade drawn
    // wider and fewer, a tuft standing for the many it hides, over ground coloured as the grass is.
    // `root`: the root's share of the tip's brightness. Near, a blade is seen down to its root in its
    // neighbours' shade; far off only the top of the sward is seen, the tips of the blades in front hiding the
    // roots of those behind, so a tuft that stands for many is shaded less (by eye, until the rings stopped
    // showing as bands of different green from above).
    layers: [
      { tile: 16, count: 110000, width: 0.018, segments: 3, tall: 1, root: 0.3 },
      { tile: 46, count: 130000, width: 0.04, segments: 2, tall: 1, root: 0.5 },
      { tile: 150, count: 90000, width: 0.15, segments: 1, tall: 1.08, root: 0.75 },
      { tile: 460, count: 50000, width: 0.55, segments: 1, tall: 1.2, root: 0.9 },
    ],
    // A blade's lean at rest (rad, random way) and how much each differs in height (share).
    lean: 0.32,
    vary: 0.45,
    // A blade seen against the sun glows by `through` (light through the leaf: by eye against the backlit
    // grass of the references).
    through: 0.55,
    // Under standing grass the ground is in the blades' shade: this share of the open ground's light at the
    // place's full height (by eye; without it the blades have nothing darker to stand against). Only as far
    // as the eye sees down between the blades (the nearest ring's reach, gone by the second's): beyond, the
    // ground stands for the top of the sward and is lit as it.
    underShade: 0.5,
    // A bent blade turns its glossy face to the sky: this much of the sky's light is added at full bend.
    // It is what makes a gust visible from far off (the pale wave crossing a hayfield).
    sheen: 0.38,
    // No sward is even: this `share` of the ground carries rank tussocks about `size` m across (ungrazed
    // patches, wetter hollows), `taller` by this share of the place's grass and `darker` (greener, less gone
    // to straw). By eye against the first reference's mixed long grass.
    rank: { size: 3.4, share: 0.3, taller: 0.55, darker: 0.14 },
  },

  // ---- trees ----------------------------------------------------------------------------------------------------
  trees: {
    // A crown is a cloud of leaf cards; how many by distance band (m from the centre): full near, fewer and
    // larger far off, the far woods a handful each.
    // `limbs`: the limbs under the crown are drawn too (near, where they are seen between the leaves).
    bands: [
      { to: 140, cards: 340, trunk: true, limbs: true },
      { to: 520, cards: 44, trunk: true, limbs: false },
      { to: 2600, cards: 6, trunk: false, limbs: false },
    ],
    // The leaf-card picture: `atlas` x `atlas` tiles of `tile` px (two sprays of broad leaves, two of needles), and
    // how many leaves a spray holds: a card on a 13 m tree is 1.7 m across, so a leaf drawn 7 % of it is 12 cm.
    atlas: 2,
    tile: 256,
    leaves: 130,
    // The share of a spray's opacity below which a pixel of a card is open air, by band: half near, where a
    // card is seen leaf by leaf; lower far off, where the picture is shrunk to a blur of leaf and gap and a
    // crown must still close (by eye: at a half the hill woods fell to tatters).
    cut: [0.5, 0.3, 0.2],
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
    // `gusts`: [the share of the kind in the air whatever the wind, then the wind where it is (m/s, or with
    // `ofMean` as a multiple of the mean wind) at which the rest begin to come and at which all of it is there]:
    // the rest ride the gust pattern, so a gust is seen arriving as a thicker curtain of it.
    rain: { box: [28, 16, 28], count: 9000, fall: 8, ride: 1, size: 0.012, streak: 0.028, wander: 0 },
    // Snow is smeared over the same exposure as rain: at its own fall it stays a flake (3 cm), on a 10 m/s wind
    // it draws a quarter of a metre long. Six tenths of a snowfall comes in the gusts (by eye, against how a
    // squall is seen crossing open ground: the fall itself is no thicker there, but the wind brings its curtains
    // and what it has lifted with them).
    snow: { box: [26, 14, 26], count: 7000, fall: 1.2, ride: 1, size: 0.022, streak: 0.028, wander: 0.35, gusts: [0.4, 0.85, 1.45], ofMean: true },
    // Snow lifted off where it lies: loose dry snow begins to drift along the ground at about 5 m/s and blows
    // in sheets by 9 or 10 (approximate, from memory of the figures for dry new snow; wet or crusted snow needs
    // much more). Drawn wherever a weather leaves snow lying (particles.js envParticlesSet).
    spindrift: { box: [44, 3.2, 44], count: 1100, fall: 0.25, ride: 1, size: 0.6, streak: 0, wander: 0.4, gusts: [0, 5, 9.5] },
    leaves: { box: [40, 12, 40], count: 260, fall: 0.9, ride: 0.9, size: 0.07, streak: 0, wander: 0.9 },
    petals: { box: [34, 9, 34], count: 420, fall: 0.5, ride: 0.95, size: 0.028, streak: 0, wander: 0.7 },
    motes: { box: [22, 7, 22], count: 900, fall: 0.02, ride: 1, size: 0.008, streak: 0, wander: 0.25 },
    dust: { box: [50, 9, 50], count: 1400, fall: 0.05, ride: 1, size: 0.5, streak: 0, wander: 0.5 },
    // What lies on the ground until the wind lifts it (dead leaves, chaff, torn grass). `lift`: the wind where
    // it lies (m/s) at which the lightest piece stirs and at which it is flying, how high it is carried (m) and
    // how far downwind (m). Beaufort's own marks: at force 3 (3.4-5.4 m/s) leaves are in constant motion, at
    // force 4 (5.5-7.9) dust and loose paper are raised (approximate, from memory of the scale). `ride` is here
    // the share of the wind's pace at which the litter creeps along the ground between gusts. Heights by eye.
    litter: { box: [36, 3, 36], count: 700, fall: 0, ride: 0.06, size: 0.06, streak: 0, wander: 0.5, lift: [4.2, 7.5, 1.7, 3.2] },
  },

  // ---- what a weak device drops ---------------------------------------------------------------------------------------
  // The share of each thing drawn at each quality tier (levelmode/quality.js names them; adaptres.js steps
  // down when frames run long). Blades and cards are shuffled when built, so drawing a share leaves an even
  // sprinkle; grass blades widen by 1 / sqrt(share) so the ground stays covered.
  // `post`: the camera's last passes (post.js): 2 glare and shafts, 1 glare alone, 0 none: the frame is drawn
  // straight to the screen and each material bends its own light by the same curve at the weather's exposure,
  // with the default grade (no glare, no shafts, no vignette, and edges smoothed by the screen's own samples).
  quality: {
    high: { grass: 1, far: 1, cards: 1, particles: 1, cloudShadow: true, post: 2 },
    medium: { grass: 0.5, far: 0.7, cards: 0.6, particles: 0.6, cloudShadow: true, post: 1 },
    low: { grass: 0.2, far: 0.4, cards: 0.3, particles: 0.35, cloudShadow: false, post: 0 },
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
// its middle stands, `shape` how the crown is built (trees.js envCrownMasses: 'round' masses of foliage on spreading
// limbs, 'boughs' a spire of flat boughs), `limbs` how many masses or boughs, `fork` how far below the crown's middle
// (in crown half-heights) the trunk divides, `card` a leaf card's size as a share of the height, `leaf` and `bark`
// colours (display), `trunk` the trunk's radius at the foot as a share of the height, `picture` which leaf-card drawing.
export const ENV_TREES = {
  // An English oak or ash in a hedgerow: 12-20 m, as broad as it is tall, the trunk dividing a third of the way up
  // (a field oak 15 m high is about 0.8 m through at the foot: approximate).
  broadleaf: { height: [9, 17], crown: { wide: 0.44, tall: 0.36, at: 0.62 }, shape: 'round', limbs: 7, fork: 0.85, card: 0.125, leaf: [0x3a5a26, 0x4f7030, 0x2a4520], bark: 0x4b3d2c, trunk: 0.027, picture: 'leaf' },
  // Japanese cedar and red pine on a valley side: 15-25 m, a narrow dark spire of boughs, bare at the foot.
  pine: { height: [12, 22], crown: { wide: 0.21, tall: 0.37, at: 0.61 }, shape: 'boughs', limbs: 17, fork: 0, card: 0.085, leaf: [0x25402c, 0x335034, 0x1b3022], bark: 0x4a3626, trunk: 0.018, picture: 'needle' },
  // Autumn broadleaf among the pines (maple, zelkova): the valley's colour in October.
  // What grows at a wood's edge and along a fence where nothing grazes it: hawthorn, bramble, hazel, a few
  // metres high and as broad, leafy to the ground.
  shrub: { height: [1.3, 3.4], crown: { wide: 0.6, tall: 0.46, at: 0.5 }, shape: 'round', limbs: 4, fork: 1.0, card: 0.3, leaf: [0x41602a, 0x56702e, 0x2e4a22], bark: 0x40352a, trunk: 0.02, picture: 'leaf' },
  autumn: { height: [8, 14], crown: { wide: 0.42, tall: 0.34, at: 0.62 }, shape: 'round', limbs: 6, fork: 0.85, card: 0.125, leaf: [0xa8642a, 0xb8862e, 0x8a3a22], bark: 0x43352a, trunk: 0.027, picture: 'leaf' },
};

// ---- weathers --------------------------------------------------------------------------------------------------------
// Each is laid over the place's own description. `cover` 0..1 of the sky in cloud, `gloom` how dark the cloud's
// underside (0 white cumulus .. 1 slate), `sun` the share of direct sun reaching the ground, `visibility` m (null:
// the place's own), `hazeHeight` m the haze thins by 1/e (null: the place's),
// `fine` how fine the haze is (ENV.air.wavelengths),
// `wind` times the place's speed and `gust` added to its gustiness, `wet` 0..1 of the ground, `fall` what falls
// (a kind in ENV.particles) and how much of its count, `snow` 0..1 of the ground whitened, `tint` the haze's own
// colour where it has one (dust). A `fall` with `under` [from, to] comes only out of thick cloud: none where the
// sheet overhead (the one drawn, and the one that shades the land) is thinner than `from`, all of it by `to`
// (air.js envCloudDepth's measure: 0 a cloud's edge, about 0.3 its middle), so it starts and stops as the cloud
// passes; `least` is the share that falls even under a gap, and `thick` the visibility in the thick of it (m).
// (Sampled over an hour of drift at covers near 0.65, the depth over one spot has a median near 0.1 and is past
// 0.25 a tenth of the time: `under` [0.09, 0.17] falls a little under half the time, in spells of one to five
// minutes at a 9 to 15 m/s wind aloft, which is what a showery day does: approximate.)
// `grade` what the weather's picture differs by from ENV.tone.grade (all by eye:
// a clear day a little warm and full; a lid flat light, so the curve is steepened to keep a picture, and cooler
// and greyer; mist bright and pale, held up half a stop as a camera's meter is fooled by fog, its darks left in).
export const ENV_WEATHER = {
  clear: { label: 'Clear', grade: { warmth: 0.015 }, fine: 1.3, cover: null, gloom: 0, sun: 1, visibility: null, hazeHeight: null, wind: 1, gust: 0, wet: 0, fall: null, snow: 0 },
  // Broken cloud racing over: the light comes and goes.
  cloudy: { label: 'Broken cloud', grade: { contrast: 1.32 }, fine: 1.3, cover: 0.62, gloom: 0.35, sun: 0.9, visibility: null, hazeHeight: null, wind: 1.3, gust: 0.1, wet: 0, fall: null, snow: 0 },
  // A low grey lid: no shadows, flat light (the sun's share is what gets through thick stratus, a few per cent direct).
  overcast: { label: 'Overcast', grade: { contrast: 1.4, saturation: 0.94, warmth: -0.015, ev: -0.3 }, fine: 0.8, cover: 1, gloom: 0.4, sun: 0.06, visibility: 12000, hazeHeight: null, wind: 1.2, gust: 0.05, wet: 0, fall: null, snow: 0 },
  // Steady rain: visibility a few km (approximate for moderate rain), everything wet.
  rain: { label: 'Rain', grade: { contrast: 1.42, saturation: 0.86, warmth: -0.03, ev: -0.5 }, fine: 0, cover: 1, gloom: 0.65, sun: 0.03, visibility: 2600, hazeHeight: 900, wind: 1.5, gust: 0.15, wet: 1, fall: { kind: 'rain', share: 1 }, snow: 0 },
  // Ground mist at dawn: a layer some tens of metres deep, the sun and the sky above it clear, the air near still.
  // (Mist is by definition visibility over 1 km and fog under; a valley's dawn fog is 100-400 m. 260 by eye, so the
  // far side of the floor is soft and the trees beyond are shapes.)
  mist: { label: 'Mist', grade: { contrast: 1.36, saturation: 0.9 }, fine: 0.15, cover: 0.2, gloom: 0, sun: 0.85, visibility: 260, hazeHeight: 26, wind: 0.3, gust: 0, wet: 0.35, fall: null, snow: 0 },
  // Snow driving on a hard wind: visibility under a km in moderate snow (approximate), the ground white.
  snow: { label: 'Snow', grade: { contrast: 1.3, saturation: 0.85, warmth: -0.02, ev: 0.3 }, fine: 0, cover: 1, gloom: 0.25, sun: 0.05, visibility: 700, hazeHeight: 600, wind: 1.6, gust: 0.15, wet: 0, fall: { kind: 'snow', share: 1 }, snow: 0.85 },
  // Showers: heavy cloud with gaps, rain out of the thick of it and sun through the gaps, the ground wet between.
  showers: { label: 'Showers', grade: { contrast: 1.36, saturation: 0.94, ev: -0.15 }, fine: 0.6, cover: 0.66, gloom: 0.6, sun: 0.9, visibility: 14000, hazeHeight: null, wind: 1.4, gust: 0.2, wet: 1, fall: { kind: 'rain', share: 1, under: [0.09, 0.17], least: 0, thick: 3200 }, snow: 0 },
  // Snow showers on a cold wind: flurries out of each cloud that passes, the sun between them on new snow.
  flurries: { label: 'Snow showers', grade: { contrast: 1.3, saturation: 0.9, warmth: -0.01, ev: 0.15 }, fine: 0.3, cover: 0.64, gloom: 0.4, sun: 0.85, visibility: 9000, hazeHeight: 900, wind: 1.5, gust: 0.2, wet: 0, fall: { kind: 'snow', share: 1, under: [0.04, 0.16], least: 0.12, thick: 900 }, snow: 0.85 },
  // Dust lifted off dry ground by a hard wind: an ochre haze near the ground.
  dust: { label: 'Dust', grade: { saturation: 0.95, warmth: 0.03 }, fine: 0.3, cover: 0.15, gloom: 0, sun: 0.7, visibility: 1200, hazeHeight: 120, wind: 1.8, gust: 0.2, wet: 0, fall: { kind: 'dust', share: 1 }, snow: 0, tint: 0xc9ab7a },
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
//
// A place that draws itself (a town, a length of wall, a yard between halls) joins with `own: true`, at run time
// (index.js envRegisterPlace(name, description)): no land, grass or trees are built for it and nothing of it is
// hidden; it is given the sky, the sun and its shadow, the haze, the camera's last passes, the wind, the weather,
// and what falls and drifts. It may leave out everything but what differs from ENV_PLACE_PLAIN, and may add
//   height: (x, z) => m, its own ground (what lies on the ground lies on it; level at 0 if left out);
//   shadowBox: { half, depth } (m): the sun's shadow box is carried with the camera, `half` each way round the
//     ground it looks at and `depth` deep, for a place whose fighters may stand anywhere on it (left out: the
//     look's own box round the middle of the floor);
//   far: m, the camera's far plane (left out: as the place's own lighting set it);
//   wind: { toward: [x, z], speed m/s, gust 0..1 }, its own wind where wind.js PLACE_WIND has none for it;
//   cover: what stands over the ground (roofs, a vault, a bridge), so nothing falls through it and blown snow
//     starts from its top: { at: (x, z) => m, the top of the highest thing over the point, min: [x, z], size:
//     [w, d], texel: m } sampled here, or a texture the place has baked: { texture, min, size, scale: m per
//     unit of the texel, base: m at 0, channel: 0..3 };
//   openings: where the sun comes into a dark space, each { at: [x, y, z] a corner, a: [x, y, z], b: [x, y, z]
//     the two edges from it (m), floor: m the ground the light lands on, dust: extinction per metre of the air
//     inside (left out: ENV.beams.dust) }; the light passes the way of a x b (the other way: no beam).
// Its own materials take the haze, the wet and the snow through air.js envDress.
export const ENV_PLACE_PLAIN = {
  weather: 'clear',
  sun: { azimuth: -2.3, elevation: 35 },
  air: { visibility: 30000, hazeHeight: 900 },
  clouds: { cover: 0.4 },
  // (Nothing is drawn from these two for a place that draws itself: the near map is laid out from them.)
  ground: { grass: 0x55802c, dry: 0x9a9248, soil: 0x74603e, rock: 0x7d7a70, floor: 0, worn: [] },
  grass: { height: [0.3, 0.6], floorHeight: 0.3, dry: 0, flowers: 0, flowerColours: [] },
  trees: [],
  drift: [],
};

export const PLACE_ENV = {
  // A village green on the brow of a down, a summer afternoon, the sun over the left shoulder: the grass uncut beyond the fence, the land
  // falling away to wooded hills that fade ridge behind ridge into the haze (the first reference).
  meadow: {
    weather: 'clear',
    sun: { azimuth: 2.75, elevation: 30 },
    air: { visibility: 42000, hazeHeight: 1000 },
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
    ground: { grass: 0x4a7326, dry: 0x8c8c40, soil: 0x6b5638, rock: 0x7d7a70, floor: 0.2, worn: [{ x: 0, z: 0, rx: 8, rz: 2, turn: 0.2, by: 0.55 }] },
    grass: { height: [0.3, 0.62], floorHeight: 0.09, dry: 0.2, flowers: 0.1, flowerColours: [0xf2efe0, 0xe8c83a, 0xc58ad0] },
    trees: [
      { kind: 'broadleaf', count: 26, from: 24, to: 120, clump: 0.6 },
      { kind: 'shrub', count: 16, from: 24, to: 110, clump: 0.75 },
      { kind: 'broadleaf', count: 260, from: 120, to: 520, clump: 0.8 },
      { kind: 'broadleaf', count: 2600, from: 480, to: 2600, clump: 0.97 },
    ],
    woods: { cover: 0.6, colour: 0x34502a },
    drift: [{ kind: 'motes', share: 1, colours: [0xfff4d0] }, { kind: 'petals', share: 0.5, colours: [0xf4f0e2, 0xe8d77a] }, { kind: 'litter', share: 0.5, colours: [0x8a7a3a, 0x6a6a2c, 0x9a8a52] }],
  },
  // Open pasture for horsemen under a driven sky: a wide level floor, long low swells, a scarp far off, the
  // grass running in waves before a fresh breeze.
  field: {
    weather: 'cloudy',
    sun: { azimuth: -2.3, elevation: 34 },
    air: { visibility: 32000, hazeHeight: 900 },
    clouds: { cover: 0.55 },
    terrain: {
      seed: 23,
      layers: [
        { from: 0, full: 90, height: 2.4, length: 90, shape: 'roll' },
        { from: 200, full: 900, height: 38, length: 800, shape: 'roll' },
        { from: 1500, full: 4200, height: 440, length: 3000, shape: 'ridge' },
      ],
    },
    ground: { grass: 0x55802c, dry: 0x9a9248, soil: 0x74603e, rock: 0x7d7a70, floor: 0.22, worn: [{ x: 0, z: 0, rx: 30, rz: 8, turn: 0, by: 0.35 }] },
    grass: { height: [0.32, 0.7], floorHeight: 0.1, dry: 0.4, flowers: 0.03, flowerColours: [0xf2efe0, 0xe8c83a] },
    trees: [
      { kind: 'broadleaf', count: 34, from: 62, to: 240, clump: 0.85 },
      { kind: 'shrub', count: 14, from: 40, to: 200, clump: 0.85 },
      { kind: 'broadleaf', count: 300, from: 240, to: 700, clump: 0.9 },
      { kind: 'broadleaf', count: 1800, from: 650, to: 2600, clump: 0.97 },
    ],
    woods: { cover: 0.4, colour: 0x38522c },
    drift: [{ kind: 'motes', share: 0.4, colours: [0xe8e4d0] }, { kind: 'litter', share: 0.8, colours: [0xb0a060, 0x8a7a3a, 0xa09050] }],
  },
  // Sekigahara at first light, 21 October 1600: a valley floor shut in by steep wooded mountains, the night's fog
  // still lying in it (the battle opened in fog), the sun low through the pines (the second reference).
  sengoku: {
    weather: 'mist',
    sun: { azimuth: -1.15, elevation: 15 },
    air: { visibility: 24000, hazeHeight: 800 },
    clouds: { cover: 0.25 },
    terrain: {
      seed: 37,
      layers: [
        // (The hills that shut the valley in stand 200 to 300 m over its floor a kilometre or two off, and the
        // mountain to the north over a thousand at about ten: approximate, from memory of the map.)
        { from: 0, full: 50, height: 1.2, length: 40, shape: 'roll' },
        { from: 70, full: 520, height: 170, length: 620, shape: 'ridge' },
        { from: 500, full: 2200, height: 560, length: 2000, shape: 'ridge' },
        { from: 2600, full: 7000, height: 1250, length: 4600, shape: 'ridge' },
      ],
    },
    ground: { grass: 0x6a7836, dry: 0xa08c46, soil: 0x6a553a, rock: 0x77756e, floor: 0.6, worn: [{ x: 0, z: 0, rx: 12, rz: 6, turn: 0, by: 0.7 }] },
    grass: { height: [0.35, 0.8], floorHeight: 0.05, dry: 0.6, flowers: 0, flowerColours: [] },
    trees: [
      { kind: 'pine', count: 46, from: 21, to: 110, clump: 0.5 },
      { kind: 'autumn', count: 12, from: 24, to: 110, clump: 0.3 },
      { kind: 'shrub', count: 18, from: 22, to: 110, clump: 0.4 },
      { kind: 'pine', count: 420, from: 110, to: 520, clump: 0.6 },
      { kind: 'pine', count: 2600, from: 480, to: 2400, clump: 0.5 },
    ],
    woods: { cover: 0.9, colour: 0x2c4430 },
    drift: [{ kind: 'leaves', share: 1, colours: [0xa8642a, 0xb8862e, 0x8a3a22, 0x6a5a2a] }, { kind: 'motes', share: 0.6, colours: [0xfff0c8] }, { kind: 'litter', share: 1, colours: [0xa8642a, 0xb8862e, 0x8a3a22, 0x6a5a2a] }],
  },
};
