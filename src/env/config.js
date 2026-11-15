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
    // Thick haze glows on every side, not only round the sun: the light it throws wide of the beam (1 - g^2 of
    // its depth along the sun's path, the share that dims the sun on the ground) is scattered again and again
    // and comes from everywhere. As a source beside the sun's beam (whose phase function averages 1): the flux
    // strewn, sun x sin(elevation) x (1 - exp(-wide depth)), spread over the sphere is 4 / pi x pi = 4 times
    // itself in those units, of which about half is still in the layer and not gone out of its top or into the
    // ground (approximate; the half is a guess at a layer one or two depths thick). Without it a mist seen away
    // from a low sun was near black beside a white glow, where a real one is pale grey all round and brighter
    // sunward. On a clear day the term is a tenth of the sun and whitens the low sky a little.
    hazeStrewn: 2,
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
    // The same over lying snow (new snow throws back eight or nine tenths, approximate): what lights a face in
    // shade on a snowfield. A place may say what it stands on (`ground.albedo` in its description).
    snowBounce: 0.85,
    // Fighters and props are hazed by the renderer's own fog, which is exponential-squared where the haze here is
    // exponential: the two are made to agree at this distance (m), about the far side of a fighting floor.
    fogMatch: 40,
    // Shade in the air. The light a stretch of air sends the eye is the sun's on that stretch, so air in the shade
    // of a cloud, a crown or a trunk sends less: land under cloud goes dark together with the air before it, and
    // mist is bright only where the sun gets down into it, in shafts, with what stands sunward cut out of them
    // (air.js envAirShare, which walks each sight line on the high tier; below it the frame has one share, that
    // of the air before the camera). `shadeBeam`: of the air's light across the sun's way, the share that is the
    // beam scattered once, which shade takes away; the rest has been scattered about first and fills the shade
    // (toward the sun the once-scattered share rises to all of what the aureole adds). In thin haze nearly all
    // the light is scattered once, in fog well under half: 0.7 is by eye against the second reference, whose
    // shaded mist is about a third as bright as its shafts. Approximate, not from a measurement.
    shadeBeam: 0.7,
    // Steps along a sight line: for a pixel of the land, the sky or a place's own material; for what is worked
    // once a corner or once a fleck (trees, what falls and drifts); for a blade of grass, where each blade takes
    // its one step at its own depth and the sward averages them (three steps a blade were half the walk's whole
    // cost, 3 ms of 6 at 1600 x 900 in mist on the bench machine, a blade having many corners and a field many blades).
    shadeSteps: [8, 4, 1],
    // Where the frame can be drawn through passes (post.js) the lines are not walked in the materials at all:
    // one pass at half the frame's size walks the line of every point of the picture from its depth, this
    // many steps, and the light the shade takes is taken off the picture. It is the same walk over the same
    // cover, but once a point of the picture and not once a corner of a tree or a blade, so a shaft stands
    // before a far wood as it does before the ground (worked once a corner, the air before the trees had no
    // shafts in it: a glow only); and it is a quarter of the points, so it has the steps to spare. 14: the
    // least at which a trunk's band of shade in the air is not broken into grain at 20 m, by eye.
    frameSteps: 14,
    // Fewer steps where the haze has taken little by then (the share of the light behind it that it has put its
    // own in place of): under `shadeFrom` one step, under `shadeFull` half of them. On a clear day that is all the
    // land within a few hundred metres; in mist everything past the fighters is walked in full. (At 1600 x 900 the
    // full walk on every pixel cost 5 to 6 ms a frame on the bench machine; set so no step is seen in the picture.)
    shadeFrom: 0.04,
    shadeFull: 0.25,
    // The share of a step's stretch of the line that its read of the shade is spread over (a round on the
    // ground, where the true mean is along the line only: the whole stretch would take away the shafts seen
    // end on, toward the sun, with the grain). By eye: the least at which the far land seen through the wood in
    // mist shows no grain; a shaft 10 m off is softened by about a third of a metre, which mist's own
    // scattering of the light about does to a real one.
    shadeSpread: 0.3,
    // How a falling drop or flake throws the sunlight it meets (particles.js): [share, g]. A drop or a crystal
    // is many wavelengths across and diffracts and refracts most of its light forward, a lobe of asymmetry g
    // (0.7 to 0.9 is the usual range given for cloud droplets and ice, approximate: 0.7); a crystal's faces
    // also reflect light every way, and a flake drawn as a card stands for both. `share` of the light follows
    // the lobe (Henyey-Greenstein, mean 1 over all directions), the rest goes evenly: by eye, so snow and rain
    // shine against the sun's glow and stay white, dimmer, with the sun behind the eye (a lobe alone left them
    // grey there).
    flakeForward: [0.5, 0.7],
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
    // The meter averages what the frame holds, and about this share of a frame is the ground itself. Where the
    // ground is far from a grey card (lying snow, at ENV.air.snowBounce; a place's own `meter.albedo`) the
    // metered light moves that share of the way from the card's to the ground's, so a snowfield closes the
    // camera about a stop and sunlit snow sits under the curve's shoulder with its shadows told from it. (A
    // meter that took the snow whole would draw it grey, which is why a photographer opens up over snow: a half
    // leaves it white. By eye.) A place among walls says how much of the sky its ground sees (`meter.sky`).
    groundSeen: 0.5,
    // The haze's light is metered at no more than this many times the land's. Looking up the sun through mist
    // the air itself is some twenty times the land's light (measured in the Sengoku valley's mist: 0.9 against
    // 0.044), and an exposure set off it left a fighter nine metres off a murky shape, two stops under the same
    // fighter seen with the sun behind the camera. A camera's operator holds a backlit mist up and lets the air
    // round the sun burn out, as the wood-in-mist reference does. By eye on that view, between the fighters
    // going under (8 and over) and the whole frame going milky (3).
    hazeMost: 5,
    // The sky in the frame. `skyOver`: how many times the land's light the sky toward the view (the sky
    // table's horizon row) may be before the meter counts it. An ordinary day's sky is 3 to 6 times the
    // metered land (measured here: the meadow's broken cloud 3.3 to 5.6 off the sun, 8 at it) and the curve's
    // shoulder holds that with its structure; a 7 degree sun's is 11 at a right angle to the sun and 35 toward
    // it, which an exposure set by the land burnt to one yellow-white. `skyShare`: the share of a level frame
    // the sky fills, about a quarter to a third at the heights the camera works at (approximate): the excess
    // is metered by it, so toward an evening sun the camera closes one to two stops and the land goes to
    // silhouette under a sky that keeps its glow and cloud bars. Through thick air the haze's own term above
    // stands for the sky, and this one fades by the haze's share. A place shut in by walls or a wood says how
    // much of its level frame is sky (`meter.frame`).
    skyOver: 8,
    skyShare: 0.25,
    // The grade, where a weather does not say otherwise (ENV_WEATHER `grade`): `ev` stops over the metered
    // exposure, `contrast` the curve's n, `saturation` (1 as the curve leaves it), `white` the light (in white
    // cards) that just reaches the ceiling, `warmth` moved from blue to red (0.02: 2 % each way). All by eye
    // against the two reference frames' tone ranges (their darkest 5 % under 0.13 of full scale, their median
    // near 0.3 to 0.4, measured from the files), and so that a fighter in shade is never under about 0.15.
    // `hue`: how much of the curve is laid on the light as a whole (its brightness bent, its colour's proportions
    // kept) rather than on each of red, green and blue apart (post.js envFilm). Bent channel by channel, a bright
    // orange evening cloud had its red stop at the shoulder while green still rose, and came out mustard; the sky
    // toward a low sun went olive and a face in the sun bleached grey. 1 is the whole, 0 film's own bend channel
    // by channel; at 1 skin in the sun went ruddy. 0.7 by eye between, on the field's evening and the valley's
    // close face (the frames' luminance is the same at every value: only colour moves).
    hue: 0.7,
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
    // They are drawn only where the air's shade is not walked sight line by sight line (quality.airShade): where
    // it is, the shafts are in the air itself, in their places in depth, and these on top of them counted the
    // same light twice, as thin streaks fanned from the sun's place across whatever stood in front.
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
    // A crown is leaf in masses, a bough's worth each, with sky between them: `boughs` m the size of a mass
    // and of the gap beside it (a bough of a tree 10 to 20 m tall carries leaf 2 to 3 m across: approximate, by
    // eye off the crowns drawn here), `boughShare` how much of the pattern of sun and shade under a crown is the
    // boughs' and how much the leaves' own (`dapple`). The leaves' flecks are lost a few metres below the
    // crown, the sun being half a degree wide (a fleck half a metre across is all penumbra 60 m down its ray);
    // the boughs' gaps are not, so they are what the air shows: the shafts in mist are the gaps between
    // boughs, and each comes down on a patch of sunlit ground (air.js envSunwardOver, terrain.js envCover).
    boughs: 2.4,
    boughShare: 0.5,
    // A trunk's shade in the air ends at the trunk: the near map keeps, with each band on the ground, how high the
    // line to the sun has climbed where it meets the trunk (8 bits over `reachMost` m: 0.13 m a step, and above
    // any bare trunk here), and the air over the band is shaded below that height only (`reachSoft` m to fade
    // over, about a trunk's width). Without it a band also darkened the air sunward of its trunk, up to the crowns:
    // dark bars across the mist that nothing cast.
    reachMost: 32,
    reachSoft: 0.6,
    // A crown's shadow on the near map is three rounds up its height, each taking `crown` of the sun at its
    // middle: a tree in leaf lets a tenth or less of the direct sun through its whole depth (approximate; canopy
    // gap fractions of 5 to 15 per cent are the usual figures quoted), which three rounds of 0.55 one behind
    // another leave (0.45^3 = 0.09). `slantMost`: a shadow is drawn no longer than this many times the height
    // of what casts it (a sun under 7 degrees), so a setting sun does not shade the whole map from one tree.
    crown: 0.55,
    slantMost: 8,
    // What stands over the ground (crowns, trunks, walls) is kept `coverFine` times finer than the near map
    // itself: 0.375 m a texel, so the shadow of a trunk half a metre through is a band and not a smear.
    coverFine: 2,
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
    bodies: [0.11, 0.22, 0.2, 0.11],
    contact: 1.6,
    // `bodies`' third and fourth: the chest (at the neck's joint) and the head, which hide the sky from the
    // ground only when a man is down on it (standing, they are a metre and a half up and count for nothing).
    // How many spheres the shaders take: five a fighter, the four fighters nearest the camera.
    bodyCount: 20,
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
    // The sheet's height (m) and the size of its largest masses (m). Fair-weather cumulus base is 600-2000 m and a
    // cumulus or a roll of stratocumulus is one to two kilometres across (both approximate). At 2600 m one shadow
    // covered everything a view takes in and the light never changed inside a round; at 1500 a view holds lit and
    // shaded land together and the patches are seen to cross it.
    height: 1500,
    scale: 1500,
    // How much of the sheet's shape is small lumps (of about a third of `scale`) and how much the broad masses:
    // 0.32 by eye for a field of cumulus, which is all lumps.
    ragged: 0.32,
    // The lumps stand in fields with clear lanes between (cloud streets, the back of a front): how much a second,
    // slower reading of the noise (features about 3 km across at `scale`) adds to or takes from the lumps. It is
    // also what keeps the sky from repeating: the noise picture alone comes round every 12 km and the sheet is
    // seen for 16 km each way. 0.3 by eye: at 0.5 a view was all cloud or none for minutes on end.
    fields: 0.3,
    // A deck of stratocumulus is another form of the same sheet: broad soft slabs. A weather's `deck` (0 a field
    // of cumulus, 1 a deck) takes `ragged` down to `deck` of itself (few small lumps), `baseAt` to `deckBase` of
    // itself (a slab is deep nearly to its edge, so slate from below almost all over) and makes the edge itself
    // `deckEdge` times wider (it trails off in a veil the sky's light comes through, where a cumulus has an
    // outline). By eye against the first reference, whose sky is soft graded slate with a bright break: with a
    // cumulus's narrow edge the deck read as a two-tone cut-out, and with the base dark only in the middle
    // (deckBase 1.7) as an even pale grey.
    deck: 0.35,
    deckBase: 0.9,
    deckEdge: 3,
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
    // A cloud's shadow on the land: how much of the sun the thickest cloud takes. A cumulus a few hundred metres
    // deep passes next to none of the direct beam (its optical depth is in the tens: approximate, from memory of
    // the textbooks, not checked); what it does pass comes down as sky light, which the land keeps (uEnvSkyLight).
    // The few per cent left here are the thin veil such a cloud trails. At 0.75 the shaded land was three quarters
    // as bright as the lit and a broken sky read as an even one.
    shadow: 0.95,
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
    wetSheen: 0.25,
    // Wet leaves and blades: a film and beads of water over `wetFilm` of them (by eye, approximate), which
    // mirror the sky over the leaf's own colour. Leaves and blades face every way, so what they mirror is the
    // mean of water's Fresnel reflectance over the faces seen (Schlick's 0.02 + 0.98 (1 - cos)^5 averaged over
    // a cosine-weighted hemisphere: 0.02 + 0.98 x 2 / 42 = 0.067, `wetMirror`, derived) of the sky's mean light.
    // Under rain the sky is tens of times brighter than a dark leaf, so these few per cent double a dark
    // conifer's light: a wet wood goes grey-green under a grey sky (grass.js, trees.js). (Taken by the crown's
    // mass normal instead, a crown's edge mirrored the whole sky in white blotches.)
    wetFilm: 0.6,
    wetMirror: 0.02 + 0.98 * 2 / 42,
    // Water stands where the worn ground's hollows lie under this level (of a smooth noise, 0..1: under 0.4 is
    // about a third of the ground; by eye, against a trodden ring after rain: separate pools, not a sheet. With
    // every worn patch one pool and a sheen of 0.5 a rained-on floor was a single dark mirror).
    puddles: 0.4,
    // What standing water mirrors: the sky only above what stands round the floor (trees.js envBuildSkyline:
    // `skyline` texels round the compass, tangents up to `skylineMost`, 63 degrees); below that line the wood,
    // at `mirrorWood` of the sky's light on its colour (a crown seen from below and the side is mostly its own
    // shade: by eye). The line is the one seen from the centre, used out to `mirrorNear` m and let go by
    // `mirrorFar`. (Without it a rained-on floor in a wood mirrored the bright horizon behind the trunks and
    // came out a white sheet.)
    skyline: 32,
    skylineMost: 2,
    mirrorWood: 0.5,
    mirrorNear: 25,
    mirrorFar: 70,
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
    // The shade on the air before a blade is read at a point of its sight line that is the blade's own out to
    // the first of these (m), and the line's middle for every blade past the second (grass.js): the second and
    // third rings' tufts are few and wide, and each with its own point showed as a fleck against lit mist.
    shadeOwn: [10, 30],
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
    // How the land is used (terrain.js envBuildNearMap), the same rule over the whole place, the fought ground
    // included. A grazed or trodden sward is a mosaic: lawns kept short among patches left rank, each `mosaic` m
    // across (a place's `grass.grazed` is the lawns' share of the land, `grass.kept` their height). Where people
    // walk (a place's `ground.paths` and `ground.worn`) the sward is shorter still and the earth shows: a path's
    // or a yard's edge is ragged by `ragged` of its width, never a line.
    mosaic: 11,
    ragged: 0.8,
  },

  // ---- trees ----------------------------------------------------------------------------------------------------
  trees: {
    // The sky the middle of the fought ground sees past the crowns round it (trees.js envSkySeen): `skyRays`
    // [rings, sectors] of the hemisphere (14 x 36: the share settles to a hundredth, measured); `skyPast`, the
    // share of the sky's light a crown lets through where a ray crosses it, its gaps between leaves and boughs
    // (0.25 approximate, by eye: a wood's crowns seen from beneath show sky in about a quarter of their area).
    skyRays: [14, 36],
    skyPast: 0.25,
    // What grows no higher than this (m) is trodden through and stands on the fought ground as anywhere; a taller
    // plant, a bush or a tree would stand in the fight with no solid in the physics, and is kept off the level ground.
    underfoot: 0.4,
    // A crown is a cloud of leaf cards; how many by distance band (m from the centre): full near, fewer and
    // larger far off, the far woods a handful each.
    // `limbs`: the limbs under the crown are drawn too (near, where they are seen between the leaves).
    // (The full count only out to 70 m: past that a card is under ten pixels of a 900-line picture and a third
    // as many, larger, draw the same crown, which is what lets a wood stand as close as a wood does.)
    // `wood`: [sides, rings] of each trunk's and limb's tube. A trunk 0.4 m through is 30 pixels wide at 15 m
    // and 6 at 70 m (900 lines, 50 degree lens): six sides near and four past that leave its outline round to a
    // pixel, and its shading is by the smooth normal either way. At eight and five sides with four rings each
    // the valley's wood (17 boughs to a pine) was 612 thousand triangles, a quarter of the place's frame.
    bands: [
      { to: 70, cards: 340, trunk: true, limbs: true, wood: [6, 3] },
      { to: 140, cards: 120, trunk: true, limbs: true, wood: [4, 2] },
      { to: 520, cards: 44, trunk: true, limbs: false, wood: [4, 2] },
      { to: 2600, cards: 6, trunk: false, limbs: false },
    ],
    // The leaf-card picture: `atlas` x `atlas` tiles of `tile` px (two sprays of broad leaves, two of needles, two
    // plants of the ground: a rosette of broad blades and a fan of fronds, two twigs seen leaf by leaf, one spare),
    // and how many leaves a spray holds: a card on a 13 m tree is 1.7 m across, so a leaf drawn 7 % of it is 12 cm.
    atlas: 3,
    tile: 512,
    leaves: 130,
    // Up close a crown's outside is twigs whose leaves are seen one by one: this share of the outer cards of the
    // nearest band's broadleaves carry the twig pictures (a dozen leaves each, three times the size of a spray's:
    // a card 1.7 m across then shows 0.3 m of leaf, large for an oak's 0.1 m; by eye, and what a stylised crown
    // bears). Further off the picture is shrunk past telling them apart, so only the nearest band has them.
    twigs: 0.3,
    // The share of a spray's opacity below which a pixel of a card is open air, one for each band above: half
    // near, where a card is seen leaf by leaf; lower far off, where the picture is shrunk to a blur of leaf and
    // gap and a crown must still close (by eye: at a half the hill woods fell to tatters).
    cut: [0.5, 0.42, 0.3, 0.2],
    // Shading inside a crown: the inside and the underside are darker (leaves shade leaves) by up to this share.
    inner: 0.55,
    // Light through the leaves when the sun is behind the crown.
    through: 0.6,
  },

  // ---- rocks ----------------------------------------------------------------------------------------------------
  // Boulders and outcrop: a few lumps of the country's rock standing out of the grass, the dark near things a
  // wide view sits behind. Each is one of `forms`, made once: a ball pushed about by three slow waves (`lump` of
  // its radius each) and then cut flat by `cuts` planes `keep` (and up to a quarter more) of the radius out from
  // its middle, which is what gives rock its faces and edges; `scale` its width, height and depth beside its
  // size. A block, a weathered round, a slab lying flat and a shard on end. By eye throughout.
  rocks: {
    forms: [
      { cuts: 7, keep: 0.62, lump: 0.1, scale: [1, 0.72, 0.82] },
      { cuts: 3, keep: 0.8, lump: 0.14, scale: [1, 0.62, 0.9] },
      { cuts: 6, keep: 0.58, lump: 0.08, scale: [1.5, 0.3, 1.15] },
      { cuts: 6, keep: 0.56, lump: 0.1, scale: [0.7, 1.05, 0.56] },
    ],
    // How much of its height is in the ground (a boulder sits in the soil, it does not rest on the grass).
    sink: 0.3,
    // Its colour, the lichen that blotches it and the moss on its top (display values). A grey gneiss or granite
    // throws back 0.1 to 0.3 of the light (approximate, from memory, not checked); 0x5e5a52 squares to 0.10.
    colour: 0x5e5a52,
    lichen: 0x9a9880,
    moss: 0x34481f,
    // At its foot the grass and the ground hide the sky from it: the sky's light there is this share.
    foot: 0.45,
    // A stone no bigger than this (m, half its width) is set in the turf and stepped over: it lies on the fought
    // ground as anywhere. A larger one would trip a man and has no solid in the physics: kept off the level ground.
    underfoot: 0.13,
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
    high: { grass: 1, far: 1, cards: 1, particles: 1, cloudShadow: true, post: 2, airShade: true },
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
  // What grows at a wood's edge and along a fence where nothing grazes it: hawthorn, bramble, hazel, a few
  // metres high and as broad, leafy to the ground.
  shrub: { height: [1.3, 3.4], crown: { wide: 0.6, tall: 0.46, at: 0.5 }, shape: 'round', limbs: 4, fork: 1.0, card: 0.3, leaf: [0x41602a, 0x56702e, 0x2e4a22], bark: 0x40352a, trunk: 0.02, picture: 'leaf' },
  // The big-leaved plants of a damp bank and a wood's floor, a metre or so high and as wide, a handful of leaves each
  // (`cards`: how many leaf cards one plant has in the nearest band, where a tree has the band's own count). Dock and
  // burdock in an English meadow, butterbur (fuki) under Japanese cedar: blades 0.3-0.6 m long (approximate).
  dock: { height: [0.6, 1.2], crown: { wide: 0.5, tall: 0.42, at: 0.48 }, shape: 'tuft', limbs: 1, fork: 1.0, card: 0.95, cards: 7, leaf: [0x33501f, 0x44642a, 0x26401c], bark: 0x3a4a26, trunk: 0.012, picture: 'blade' },
  // The weeds of a grazed or trodden sward, a rosette of broad leaves flat to the ground that beasts leave and
  // feet do not kill (plantain, dandelion, young dock and thistle: a hand to a forearm across, approximate). Low
  // enough to be trodden through (ENV.trees.underfoot), so it grows on the fought ground as anywhere.
  rosette: { height: [0.14, 0.34], crown: { wide: 0.8, tall: 0.4, at: 0.42 }, shape: 'tuft', limbs: 1, fork: 1.0, card: 1.1, cards: 6, leaf: [0x3a5a22, 0x4a6a2c, 0x2c481e], bark: 0x3a4a26, trunk: 0.02, picture: 'blade' },
  // Bracken and fern: fronds fanning from the foot, to a man's waist or chest.
  bracken: { height: [0.7, 1.5], crown: { wide: 0.55, tall: 0.45, at: 0.5 }, shape: 'tuft', limbs: 1, fork: 1.0, card: 0.9, cards: 8, leaf: [0x3a5622, 0x4c6a2a, 0x2c441e], bark: 0x3a4a26, trunk: 0.01, picture: 'frond' },
  // Autumn broadleaf among the pines (maple, zelkova): the valley's colour in October.
  autumn: { height: [8, 14], crown: { wide: 0.42, tall: 0.34, at: 0.62 }, shape: 'round', limbs: 6, fork: 0.85, card: 0.125, leaf: [0xa8642a, 0xb8862e, 0x8a3a22], bark: 0x43352a, trunk: 0.027, picture: 'leaf' },
};

// ---- weathers --------------------------------------------------------------------------------------------------------
// Each is laid over the place's own description. `cover` 0..1 of the sky in cloud, `gloom` how dark the cloud's
// underside (0 white cumulus .. 1 slate), `deck` 0..1 from a field of cumulus to a deck of slabs (ENV.clouds.deck;
// none: 0), `sun` the share of direct sun reaching the ground, `visibility` m (null:
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
  // Heavy broken cloud: a deck of stratocumulus in broad slate slabs (`deck`) with a few breaks, the land
  // in its shade with patches of sun crossing it. `cover` is the sheet's threshold, not an area: 0.72 leaves about
  // a tenth of the sky open, and is just short of where the sky turns to a lid (air.js). The air under such a deck
  // is damp and shallow: a visibility of 4.5 km in a layer 300 m deep (both approximate, in the range given for
  // moist haze) dissolves the ridges one behind another into blue, a wood at 2 km already a silhouette, yet
  // leaves the sky above 10 degrees clear of it, so the cloud keeps its form; a deep layer of the same air
  // turned the whole sky one flat slate, and 7 km left the far land green and crisp to the skyline. The picture is a
  // low-key one: the curve is left nearly straight (a steep one drove the shaded land to black under a mid-grey
  // sky) and the frame held up half a stop, so the land sits at a third of the way up and the breaks are
  // the brightest thing in it; cooled, as light through deep cloud and blue air is, and as a camera left on
  // its daylight balance under it draws it. All against the first reference's measured values (luminance
  // percentiles, sky top, horizon, mid-ground, foreground; its mean saturation 0.45 and its greens at a hue of
  // 110 degrees, where a warmth of -0.04 and a saturation of 0.96 gave 0.31 and 102, and these 0.44 to 0.47
  // and 110 to 112 over three views).
  heavy: { label: 'Heavy cloud', grade: { contrast: 1.08, saturation: 1.25, warmth: -0.27, ev: 0.5 }, fine: 1.1, cover: 0.72, deck: 1, gloom: 0.85, sun: 1, visibility: 4500, hazeHeight: 300, wind: 1.25, gust: 0.12, wet: 0, fall: null, snow: 0 },
  // A low grey lid: no shadows, flat light (the sun's share is what gets through thick stratus, a few per cent direct).
  overcast: { label: 'Overcast', grade: { contrast: 1.4, saturation: 0.94, warmth: -0.015, ev: -0.3 }, fine: 0.8, cover: 1, gloom: 0.4, sun: 0.06, visibility: 12000, hazeHeight: null, wind: 1.2, gust: 0.05, wet: 0, fall: null, snow: 0 },
  // Steady rain: visibility a few km (approximate for moderate rain), everything wet. (`ev`: a third of a stop
  // under, by eye; at half a stop, with the ground wet and the lid's gloom, a wood in rain measured a median
  // of 0.12 of full scale and its fighters were lost.)
  rain: { label: 'Rain', grade: { contrast: 1.42, saturation: 0.86, warmth: -0.03, ev: -0.3 }, fine: 0, cover: 1, gloom: 0.65, sun: 0.03, visibility: 2600, hazeHeight: 900, wind: 1.5, gust: 0.15, wet: 1, fall: { kind: 'rain', share: 1 }, snow: 0 },
  // Ground mist at dawn: a layer some tens of metres deep, the sun and the sky above it clear, the air near still.
  // (Mist is by definition visibility over 1 km and fog under; a valley's dawn fog is 100-400 m. 150, set against
  // a wood: at 260 trees 40 and 120 m off stood at nearly one tone and the wood read as a wash; at 150 each
  // rank of trunks steps a clear tone back from the one before, and the far side of the floor is still plain.)
  // The grade: under a warm low sun a camera balanced for the mist's light draws the shade cool and the greens
  // quiet (saturation and warmth by measurement against a reference frame of a misted wood: mean saturation
  // 0.19 there, 0.32 here at 0.9 and 0.25 at 0.8).
  mist: { label: 'Mist', grade: { contrast: 1.36, saturation: 0.8, warmth: -0.03 }, fine: 0.15, cover: 0.2, gloom: 0, sun: 0.85, visibility: 150, hazeHeight: 26, wind: 0.3, gust: 0, wet: 0.35, fall: null, snow: 0 },
  // Snow driving on a hard wind: visibility under a km in moderate snow (approximate), the ground white.
  snow: { label: 'Snow', grade: { contrast: 1.3, saturation: 0.85, warmth: -0.02, ev: 0.3 }, fine: 0, cover: 1, gloom: 0.25, sun: 0.05, visibility: 700, hazeHeight: 600, wind: 1.6, gust: 0.15, wet: 0, fall: { kind: 'snow', share: 1 }, snow: 0.85 },
  // Showers: heavy cloud with gaps, rain out of the thick of it and sun through the gaps, the ground wet between.
  showers: { label: 'Showers', grade: { contrast: 1.36, saturation: 0.94, ev: 0.1 }, fine: 0.6, cover: 0.66, gloom: 0.6, sun: 0.9, visibility: 14000, hazeHeight: null, wind: 1.4, gust: 0.2, wet: 1, fall: { kind: 'rain', share: 1, under: [0.09, 0.17], least: 0, thick: 3200 }, snow: 0 },
  // Snow showers on a cold wind: flurries out of each cloud that passes, the sun between them on new snow.
  flurries: { label: 'Snow showers', grade: { contrast: 1.3, saturation: 0.9, warmth: -0.01, ev: 0.15 }, fine: 0.3, cover: 0.64, gloom: 0.4, sun: 0.85, visibility: 9000, hazeHeight: 900, wind: 1.5, gust: 0.2, wet: 0, fall: { kind: 'snow', share: 1, under: [0.04, 0.16], least: 0.12, thick: 900 }, snow: 0.85 },
  // Dust lifted off dry ground by a hard wind: an ochre haze near the ground.
  dust: { label: 'Dust', grade: { saturation: 0.95, warmth: 0.03 }, fine: 0.3, cover: 0.15, gloom: 0, sun: 0.7, visibility: 1200, hazeHeight: 120, wind: 1.8, gust: 0.2, wet: 0, fall: { kind: 'dust', share: 1 }, snow: 0, tint: 0xc9ab7a },
};

// ---- places ----------------------------------------------------------------------------------------------------------
// weather: its own, an ENV_WEATHER name; `weatherHere`: any of that weather's entries as they are on this place
//   (its mist thinner, its cloud lower), laid over it while the place's own weather is the one shown and not
//   where the same weather is picked by name.
// other: a place whose own day is a mood (a low sun, a set sky) says how it stands under any other weather:
//   { than: its own weather's name, and any of sun, air, clouds, meter }. A weather picked by name, or brought
//   by a battle, then looks like itself there (snow under a snow sky, not an evening with snow in it); under
//   `than` the place is its own day. Left out: the place has one sun for every weather.
// sun: `azimuth` rad round from +x toward +z (scenery.js's convention: -pi/2 is the far side of the floor),
//   `elevation` degrees above the horizon.
// air: `visibility` m on this place's clear day, `hazeHeight` m.
// clouds: `cover` 0..1 on its clear day.
// terrain: `seed`; `fall` the floor stands on a height and the land drops `drop` m between `from` and `to` m out;
//   `layers` of relief, each { from, full: where it begins and is whole (m from the floor's edge), height, length
//   (m: the size of a hill), shape: 'roll' (soft) | 'ridge' (crested) }, added together.
// ground: `grass` and `dry` the two colours grass varies between, `soil`, `rock`; `wear` 0..1 how much of the
//   land is bare earth in patches, everywhere on the place (0: a patch here and there; 1: mostly earth); where
//   people walk, by rule: `paths` [{ points: [[x, z], ...], width (m), by 0..1 }] trodden lines, and `worn`
//   [{ x, z, rx, rz, turn, by }] trodden yards, both ragged-edged and broken by the ground's own patches.
//   Nothing is cleared for the fight: the fought ground is the same land as the rest.
// grass: `height` m (least, most) where it is left to grow, `grazed` 0..1 the share of the land kept short (by
//   beasts, a scythe or feet) in lawns among the rank patches, `kept` m its height there and where it is trodden,
//   `dry` 0..1 share gone to straw, `flowers` 0..1 share of far tufts in flower and their colours.
//   (Before the fought ground was made one with the land these were `ground.floor` and `grass.floorHeight`, the
//   wear and the height of a cleared floor: still read where the new ones are left out.)
// trees: stands of ENV_TREES kinds, each { kind, count, from, to (m from the centre), clump 0..1 }.
// rocks: stands of boulders, each { count, from, to (m from the middle), clump 0..1, size: [least, most] (m, half a
// rock's width) }, laid as trees are planted; outcrops: knots of rock at a point, each { at: [x, z], radius (m),
// rocks, plants (how many of each), size, kinds (the plants: ENV_TREES names; dock and bracken if left out) }.
// rides: lanes through the trees from the floor outward, each { azimuth (rad, as the sun's), width, length (m),
//   standards, kind }: no tree stands in one but its `standards`, that many tall trees of `kind` (pine if not
//   given) left standing in it where they fall. Where the sun comes down a ride the floor at its end is lit and the
//   wood either side is not; the standards' trunks are what bands that light, on the ground and in the air.
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
//   sunMap: the place's own shadow map of the sun, where it casts its own shadows: { matrix: a THREE.Matrix4,
//     world to the map's [0, 1] cube (the light's shadow.matrix, kept up by three.js), texture: the map's
//     texture or a function giving it (a light's is made at its first frame), bias: depth, left out 0.002 }.
//     The air's walk and what falls through the air then take the place's walls and roofs for shade as they
//     take crowns (air.js envPlaceSun). A map packed as three.js packs depth (not VSM).
//   meter: { sky: the share of the sky its ground sees (left out: worked out from its trees and hills, trees.js
//   envSkySeen), frame: the share of a level frame that is sky }.
// Its own materials take the haze, the wet and the snow through air.js envDress.
export const ENV_PLACE_PLAIN = {
  weather: 'clear',
  sun: { azimuth: -2.3, elevation: 35 },
  air: { visibility: 30000, hazeHeight: 900 },
  clouds: { cover: 0.4 },
  // (Nothing is drawn from these two for a place that draws itself: the near map is laid out from them.)
  ground: { grass: 0x55802c, dry: 0x9a9248, soil: 0x74603e, rock: 0x7d7a70, wear: 0, paths: [], worn: [] },
  grass: { height: [0.3, 0.6], grazed: 0, kept: 0.3, dry: 0, flowers: 0, flowerColours: [] },
  trees: [],
  drift: [],
};

export const PLACE_ENV = {
  // A village green on the brow of a down late on a summer afternoon under heavy broken cloud, the sun low over the
  // left shoulder: the grass uncut beyond the fence, the land in shade with light crossing it and falling away to
  // wooded hills that fade ridge behind ridge into the haze (the first reference).
  // (Grass colours, here and below: green vegetation reflects about a tenth of visible light, some 0.05 in the red,
  // 0.10 to 0.15 in the green and 0.04 in the blue; straw about a quarter. Approximate, from memory of published
  // reflectance curves and not checked against one. The colours are display values that square to those, a
  // luminance of 0.09 to 0.10 for green; they were 0.14 to 0.18, which is why a lawn in full sun glared.)
  meadow: {
    weather: 'heavy',
    sun: { azimuth: 2.75, elevation: 22 },
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
    // A pasture: about half of it grazed to a lawn a hand high among rank patches the beasts leave (round dung
    // and in the wet), earth showing where they tread it, and a footpath across it that the fight happens to
    // stand on: nothing is cleared for the fight. (The lawn's height is set where a boot's top still shows in
    // it, so a planted foot and a man down are read; in the rank patches he parts the grass instead.)
    ground: { grass: 0x425c2c, dry: 0x86843e, soil: 0x6b5638, rock: 0x7d7a70, wear: 0.2, paths: [{ points: [[-90, 15], [-34, 8], [-10, 4.6], [10, 3.2], [40, -3], [100, -9]], width: 1.1, by: 0.8 }], worn: [] },
    grass: { height: [0.3, 0.62], grazed: 0.5, kept: 0.1, dry: 0.2, flowers: 0.1, flowerColours: [0xf2efe0, 0xe8c83a, 0xc58ad0] },
    // Stones lie about a chalk-and-flint down thinly; on the brow to the east the rock comes out of the turf,
    // with dock and bracken in its cracks: the near things the long view over the vale sits behind.
    rocks: [{ count: 16, from: 30, to: 320, clump: 0.5, size: [0.3, 1.4] }, { count: 260, from: 0, to: 70, clump: 0.5, size: [0.03, 0.12] }],
    outcrops: [{ at: [87, 13], radius: 6, rocks: 9, plants: 12, size: [0.4, 1.7] }],
    trees: [
      { kind: 'dock', count: 34, from: 13, to: 120, clump: 0.5 },
      { kind: 'bracken', count: 26, from: 20, to: 140, clump: 0.6 },
      { kind: 'broadleaf', count: 26, from: 24, to: 120, clump: 0.6 },
      { kind: 'shrub', count: 16, from: 24, to: 110, clump: 0.75 },
      { kind: 'broadleaf', count: 260, from: 120, to: 520, clump: 0.95 },
      { kind: 'broadleaf', count: 9000, from: 480, to: 2600, clump: 0.995 },
      { kind: 'broadleaf', count: 900, from: 260, to: 640, clump: 0.995 },
      { kind: 'rosette', count: 150, from: 0, to: 60, clump: 0.5 },
    ],
    // The far slopes are wooded: the land is painted the wood's colour wherever trees may stand (`cover` 1) and
    // the trees keep to it (`clump` above), so a hillside reads as a dark wood with a broken edge. At 0.6 with a
    // fifth of the trees in the open the vale was green down with single dark crowns dotted over it. Its colour
    // is a canopy's seen from outside, which is the leaf's (ENV_TREES.broadleaf) in the shade of the crowns'
    // own depth: about 0.6 of it. Painted the leaf's own colour the wood was as light as the grass round it and
    // the crowns standing on it showed as dots.
    woods: { cover: 1, colour: 0x24381a },
    drift: [{ kind: 'motes', share: 1, colours: [0xfff4d0] }, { kind: 'petals', share: 0.5, colours: [0xf4f0e2, 0xe8d77a] }, { kind: 'litter', share: 0.5, colours: [0x8a7a3a, 0x6a6a2c, 0x9a8a52] }],
  },
  // Open pasture for horsemen half an hour before sunset: a wide level floor, long low swells, a scarp far off,
  // the grass running in waves before a breeze. The sun stands 7 degrees up in a sky with a few soft bars of
  // evening cloud (`deck`: the place's own cloud takes the slab form), so the light is warm and comes in level:
  // the blades glow against it, every figure throws a shadow eight times its height, and the day's dust (18 km:
  // approximate, a dry summer evening) hangs gold toward the sun. Under broken cloud at 12 degrees, the earlier
  // setting, the sun seldom reached the floor and the place was an evenly lit green lawn under a white sky.
  field: {
    weather: 'clear',
    sun: { azimuth: -2.3, elevation: 7 },
    air: { visibility: 18000, hazeHeight: 900 },
    clouds: { cover: 0.36, deck: 1 },
    // The evening is the field's own day, and only that: under any weather picked by name the sun stands at
    // mid-afternoon height on the same bearing, so that the weather's own light is what is seen (at 7 degrees
    // every weather was amber, and a low sun's long cloud shadows cut mist and flurries into a lit half and a
    // dark half).
    other: { than: 'clear', sun: { azimuth: -2.3, elevation: 34 }, clouds: { cover: 0.4 } },
    terrain: {
      seed: 23,
      layers: [
        { from: 0, full: 90, height: 2.4, length: 90, shape: 'roll' },
        { from: 200, full: 900, height: 38, length: 800, shape: 'roll' },
        { from: 1500, full: 4200, height: 440, length: 3000, shape: 'ridge' },
      ],
    },
    // Horse pasture at the end of summer: grazed close over a little more than half of it, the rest standing
    // in seed and gone to straw, and a ridden track across it worn to the earth by hooves.
    ground: { grass: 0x48622e, dry: 0x8e8844, soil: 0x74603e, rock: 0x7d7a70, wear: 0.16, paths: [{ points: [[-170, 16], [-60, 1], [-14, -4.4], [26, -6], [90, -7], [180, -24]], width: 1.8, by: 0.65 }], worn: [] },
    grass: { height: [0.32, 0.7], grazed: 0.55, kept: 0.11, dry: 0.4, flowers: 0.03, flowerColours: [0xf2efe0, 0xe8c83a] },
    rocks: [{ count: 6, from: 30, to: 200, clump: 0.3, size: [0.3, 0.8] }, { count: 160, from: 0, to: 80, clump: 0.4, size: [0.03, 0.1] }],
    trees: [
      { kind: 'dock', count: 24, from: 14, to: 120, clump: 0.5 },
      { kind: 'broadleaf', count: 34, from: 62, to: 240, clump: 0.85 },
      { kind: 'shrub', count: 14, from: 40, to: 200, clump: 0.85 },
      { kind: 'broadleaf', count: 300, from: 240, to: 700, clump: 0.9 },
      { kind: 'broadleaf', count: 1800, from: 650, to: 2600, clump: 0.97 },
      { kind: 'rosette', count: 110, from: 0, to: 70, clump: 0.5 },
    ],
    woods: { cover: 0.4, colour: 0x38522c },
    drift: [{ kind: 'motes', share: 0.4, colours: [0xe8e4d0] }, { kind: 'litter', share: 0.8, colours: [0xb0a060, 0x8a7a3a, 0xa09050] }],
  },
  // Sekigahara at first light, 21 October 1600: a valley floor shut in by steep wooded mountains, the night's fog
  // still lying in it (the battle opened in fog), the sun low through the pines (the second reference). The floor
  // is a clearing at the end of a ride the sun comes down: the fighters stand in its light with the dark of the
  // wood behind them, and the wood either side is shade cut by the shafts that get between the crowns. The sun
  // stands well to the right of where a fight is first watched from (the camera looks along -z, azimuth -1.57), so
  // the fighters are lit from the side and their shadows and the trunks' lie across the picture; with the sun
  // nearly ahead (-1.15) they were two dark shapes on bright mist at any exposure. The reference's own view, into
  // the sun past black trunks, is the one from the wood behind the floor looking up the ride.
  sengoku: {
    weather: 'mist',
    // A wood's morning mist is thin and lies low: the sun comes into it under the crowns nearly whole, so trunks
    // lay bands of shade across the ground and through the air, and the gaps between crowns are shafts (the
    // second reference). At 200 m in a layer 16 m deep the sun at 15 degrees crosses an optical depth of
    // 3.9 / 200 x 16 / sin 15 = 1.2 of mist and keeps exp(-0.42 x 1.2) = 0.6 of its key on the ground
    // (ENV.air.hazeForward: most of what the mist scatters still goes on down the beam); in the weather's
    // own 150 m and 26 m it keeps 0.33 and the bands were lost in the mist's own light. By eye between the two.
    weatherHere: { visibility: 200, hazeHeight: 16 },
    sun: { azimuth: -0.4, elevation: 15 },
    air: { visibility: 24000, hazeHeight: 800 },
    clouds: { cover: 0.25 },
    // The floor is a clearing some 16 m across each way in a wood 20 m tall: what its middle sees of the sky is
    // worked out from the crowns planted round it (trees.js envSkySeen: 0.735 here, where three quarters had
    // been set by hand), and the meter opens up under a lid of cloud for it. `frame`: the
    // share of a level frame that is sky (ENV.tone.skyShare where a place does not say): none here, the wood
    // standing 40 to 50 degrees up all round, so a bright lid over it does not close the camera on the wood.
    meter: { frame: 0 },
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
    // A camp, not a ring: nothing is grazed, and what is short is what the camp treads. The way between the two
    // curtained camps (they stand at either end, along x), the way out through the palisade toward the wood,
    // and the middle, where men gather: worn by rule, ragged at the edges, grass standing in what nobody crosses.
    ground: {
      grass: 0x3e5a2a, dry: 0x8a7c40, soil: 0x5a4832, rock: 0x77756e, wear: 0.24,
      paths: [
        { points: [[-46, 5], [-15, 0.8], [0, 0], [15, -0.8], [46, -6]], width: 3.4, by: 0.9 },
        { points: [[0, 0], [1.5, -9.5], [5, -22], [3, -42]], width: 1.8, by: 0.75 },
        { points: [[-1, 0], [-3, 9.5], [-9, 30]], width: 1.4, by: 0.6 },
      ],
      worn: [{ x: 0, z: 0, rx: 7.5, rz: 4.5, turn: 0.1, by: 0.45 }],
    },
    // (Little dry grass: a damp valley floor in a wood's shade stays green; at 0.2 the lit grass measured a
    // hue of 73 degrees, olive, against 88 in the reference wood; at 0.06, 78.)
    grass: { height: [0.35, 0.8], grazed: 0.2, kept: 0.08, dry: 0.06, flowers: 0, flowerColours: [] },
    // The valley's own rock shows through the wood's floor, mossed; butterbur and fern grow under the cedars.
    rocks: [{ count: 36, from: 16, to: 120, clump: 0.5, size: [0.3, 1.4] }, { count: 380, from: 0, to: 60, clump: 0.5, size: [0.03, 0.13] }],
    // The wood stands close: 490 stems between 19 and 90 m is about 200 to the hectare, against several hundred
    // in a planted cedar wood and one to three hundred in old mixed forest (both approximate), so trunks rank
    // behind trunks into the mist; thinner past 90 m, where the mist has taken the gaps anyway. The ride is the
    // one opening, cut toward the default sun so the low light comes down it.
    trees: [
      { kind: 'dock', count: 70, from: 12, to: 100, clump: 0.45 },
      { kind: 'bracken', count: 60, from: 13, to: 110, clump: 0.5 },
      { kind: 'pine', count: 330, from: 19, to: 90, clump: 0.4 },
      { kind: 'broadleaf', count: 130, from: 19, to: 90, clump: 0.4 },
      { kind: 'autumn', count: 26, from: 22, to: 110, clump: 0.3 },
      { kind: 'shrub', count: 30, from: 20, to: 110, clump: 0.4 },
      { kind: 'pine', count: 300, from: 90, to: 150, clump: 0.5 },
      { kind: 'pine', count: 420, from: 150, to: 520, clump: 0.6 },
      { kind: 'pine', count: 2600, from: 480, to: 2400, clump: 0.5 },
      { kind: 'rosette', count: 160, from: 0, to: 50, clump: 0.5 },
    ],
    rides: [{ azimuth: -0.4, width: 12, length: 130, standards: 7 }],
    woods: { cover: 0.9, colour: 0x2c4430 },
    drift: [{ kind: 'leaves', share: 1, colours: [0xa8642a, 0xb8862e, 0x8a3a22, 0x6a5a2a] }, { kind: 'motes', share: 0.6, colours: [0xfff0c8] }, { kind: 'litter', share: 1, colours: [0xa8642a, 0xb8862e, 0x8a3a22, 0x6a5a2a] }],
  },
};
