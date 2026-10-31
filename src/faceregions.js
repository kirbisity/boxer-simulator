// Who is cast with which average face (photoface.js): the source regions of the
// average-face composites, where they are on the map, and which regions each
// culture or faction of the game draws its faces from. Plain data, to be
// edited: a fighter or an outfit may name its own (`faceRegion`: a region or a
// list), which wins over these tables.
//
// The composites: one average face per region and sex. Not every region has
// both: a region missing for a sex falls back to the nearest one that has it
// (by the map, REGION_PLACES).

import { SKIN_TONES } from './skintones.js';

/** Each source region's place (latitude, longitude, degrees), for the nearest-region fallback. */
export const REGION_PLACES = {
  england: [52, -1], ireland: [53, -8], france: [47, 2], germany: [51, 10], netherlands: [52, 5], switzerland: [47, 8], austria: [47, 14],
  sweden: [60, 15], poland: [52, 19], czechRepublic: [50, 15], hungary: [47, 19], romania: [46, 25], serbia: [44, 21], ukraine: [49, 32], russia: [56, 38],
  italy: [42, 12], spain: [40, -4], greece: [39, 22], turkey: [39, 35], israel: [31, 35], lebanon: [34, 36], iraq: [33, 44], iran: [32, 53],
  saudiArabia: [24, 45], afghanistan: [34, 66], uzbekistan: [41, 64], mongolia: [47, 105], tibet: [31, 91], china: [35, 110], taiwan: [24, 121],
  korea: [37, 127], japan: [36, 138], india: [23, 79], southIndia: [12, 78], burma: [21, 96], thailand: [15, 101], cambodia: [12, 105],
  vietnam: [16, 107], philippines: [13, 122], samoa: [-14, -172], ethiopia: [9, 39], chadCameroon: [8, 15], westAfrica: [8, -2], southAfrica: [-29, 25],
  africanAmerican: [33, -84], whiteAmerican: [39, -95], mexico: [23, -102], puertoRico: [18, -66], peru: [-10, -76], brazil: [-14, -51], argentina: [-34, -64],
};

/** The regions each outfit kind (outfits.js) draws faces from: the first is the commonest; a fighter gets one or two of them, blended. */
export const KIT_REGIONS = {
  // Japan
  samurai: ['japan'], ashigaru: ['japan'], samuraiTosei: ['japan'], oyoroi: ['japan'], ronin: ['japan'], yakuza: ['japan'], sohei: ['japan'], sumo: ['japan'],
  wokou: ['japan', 'china'], wokouArmoured: ['japan', 'china'],
  // China
  mingGarrison: ['china', 'taiwan'], mingBrigandine: ['china', 'taiwan'], mingElite: ['china', 'taiwan'], mingIronLamellar: ['china', 'taiwan'],
  hanSoldier: ['china'], hanCavalry: ['china', 'mongolia'], kungfu: ['china', 'taiwan'], wuxia: ['china', 'taiwan'], guanYu: ['china'], monk: ['china'],
  ironPagoda: ['china', 'mongolia'],
  // Korea
  dobok: ['korea'],
  // The steppe
  steppeLight: ['mongolia', 'uzbekistan', 'tibet'], steppeMedium: ['mongolia', 'uzbekistan'], kheshig: ['mongolia', 'tibet'],
  xiongnu: ['mongolia', 'uzbekistan'], hun: ['uzbekistan', 'mongolia'], hunNoble: ['uzbekistan', 'mongolia'],
  // Rome and the arena
  legionary: ['italy', 'greece', 'spain'], republicanLegionary: ['italy'], centurion: ['italy', 'greece'], romanAuxiliary: ['spain', 'france', 'greece'], lateRoman: ['italy', 'greece', 'serbia'],
  maximus: ['spain', 'italy'], commodus: ['italy'], secutor: ['italy', 'greece'], murmillo: ['italy', 'france'], thraex: ['romania', 'serbia', 'greece'],
  hoplomachus: ['greece'], retiarius: ['italy', 'greece'], lorarius: ['italy'], scissor: ['italy', 'greece'],
  goth: ['germany', 'poland', 'ukraine'], gothNoble: ['germany', 'sweden'],
  cataphract: ['iran', 'greece'], parthianArcher: ['iran', 'iraq'],
  // Medieval and early modern Europe
  knight: ['england', 'france', 'germany'], templar: ['france', 'england'], tournament: ['germany', 'austria'], joan: ['france'],
  footman: ['england', 'france', 'germany'], archer: ['england', 'ireland'], commoner: ['england', 'france', 'germany'], levy: ['england', 'france'],
  forger: ['germany', 'czechRepublic'], rags: ['england', 'ireland'],
  conquistadorPlate: ['spain'], conquistadorQuilted: ['spain'],
  // The Islamic world
  azap: ['turkey', 'greece'], janissary: ['turkey', 'serbia', 'greece'], ottomanHeavy: ['turkey'], gaziAlp: ['turkey', 'iran'], saladin: ['iraq', 'saudiArabia'],
  // The Americas
  mexicaWarrior: ['mexico', 'peru'], mexicaElite: ['mexico', 'peru'], incaUncu: ['peru'], incaNoble: ['peru'],
  // Victorian London
  victorianLady: ['england'], victorianGent: ['england'],
};

/** Everyone else (modern kits, boxers) by skin tone (skintones.js). */
export const TONE_REGIONS = {
  porcelain: ['sweden', 'england', 'russia'],
  light: ['whiteAmerican', 'england', 'germany', 'ireland', 'poland'],
  lightTan: ['italy', 'spain', 'greece', 'israel'],
  medium: ['mexico', 'puertoRico', 'brazil', 'argentina'],
  tan: ['india', 'iran', 'brazil', 'mexico'],
  deep: ['africanAmerican', 'westAfrica', 'southAfrica', 'ethiopia'],
};

/** Great-circle distance between two regions (radians). */
export function regionDistance(a, b) {
  const [lat1, lon1] = (REGION_PLACES[a] ?? [0, 0]).map((value) => (value * Math.PI) / 180);
  const [lat2, lon2] = (REGION_PLACES[b] ?? [0, 0]).map((value) => (value * Math.PI) / 180);
  const cosine = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon1 - lon2);
  return Math.acos(Math.min(1, Math.max(-1, cosine)));
}

/** The region nearest `region` among `available` (itself if it is there). */
export function nearestRegion(region, available) {
  if (available.includes(region)) return region;
  let best = null;
  for (const candidate of available) if (best === null || regionDistance(region, candidate) < regionDistance(region, best)) best = candidate;
  return best;
}

/** The regions a fighter's face is drawn from: his own `faceRegion`, his outfit's, his kit's, or his skin tone's. */
export function regionsFor(inputs, outfitRegion = null) {
  const own = inputs.faceRegion ?? inputs.look?.faceRegion ?? outfitRegion;
  if (own) return Array.isArray(own) ? own : [own];
  return kitRegions(inputs);
}

/** The regions his kit (or, without a kit of a people, his skin tone) gives him: everything but a `faceRegion` of his own. */
const kitRegions = (inputs) => KIT_REGIONS[inputs.outfit?.kind] ?? TONE_REGIONS[inputs.look?.skinTone ?? 'medium'] ?? TONE_REGIONS.medium;

// ---- Choosing an origin: the character creator -------------------------------------------------------------------------
//
// In the character creator (menu.js) the player may say where a fighter is from: one of the composites' regions, for his sex,
// whatever he wears and whatever he fights with (a Korean in a knight's harness, an Englishman in a samurai's). It is kept as
// `look.faceRegion`, which wins over his kit's (regionsFor). Left alone, he is cast as before, from his kit: the creator shows
// that kit's commonest region (originOf) as the one chosen, and writes nothing until the player changes it.
//
// The skin is the origin's, within reason. Each region has a tone of the game's ladder (SKIN_TONES, lightest to deepest) that
// its composite stands for, and the player may move it a step or so either way (TONE_REACH): lighter or darker men of the same
// people, not a different people (that is what the origin is for). The photo face's own skin (the composite's, photoface.js) is
// shifted by the ratio of the chosen tone to the region's, so the region's own tone leaves the composite's skin exactly as it
// was. Only a fighter with an origin of his own is shifted: everyone else's `skinTone` (the presets', the dealt men's) never
// touched the photo skin, and still does not.

/** The origins offered, grouped by continent, each labelled as its source composite is (a country, or a people). */
export const REGION_ORIGINS = [
  { label: 'Europe', regions: {
    england: 'England', ireland: 'Ireland', france: 'France', netherlands: 'Netherlands', germany: 'Germany', switzerland: 'Switzerland', austria: 'Austria',
    sweden: 'Sweden', poland: 'Poland', czechRepublic: 'Czech Republic', hungary: 'Hungary', romania: 'Romania', serbia: 'Serbia', ukraine: 'Ukraine',
    russia: 'Russia', italy: 'Italy', spain: 'Spain', greece: 'Greece',
  } },
  { label: 'Middle East', regions: { turkey: 'Turkey', israel: 'Israel', lebanon: 'Lebanon', iraq: 'Iraq', iran: 'Iran', saudiArabia: 'Saudi Arabia' } },
  { label: 'Central & South Asia', regions: { afghanistan: 'Afghanistan', uzbekistan: 'Uzbekistan', tibet: 'Tibet', india: 'India', southIndia: 'South India' } },
  { label: 'East Asia', regions: { mongolia: 'Mongolia', china: 'China', taiwan: 'Taiwan', korea: 'Korea', japan: 'Japan' } },
  { label: 'Southeast Asia & Pacific', regions: { burma: 'Burma', thailand: 'Thailand', cambodia: 'Cambodia', vietnam: 'Vietnam', philippines: 'Philippines', samoa: 'Samoa' } },
  { label: 'Africa', regions: { ethiopia: 'Ethiopia', chadCameroon: 'Chad & Cameroon', westAfrica: 'West Africa', southAfrica: 'South Africa' } },
  { label: 'The Americas', regions: {
    whiteAmerican: 'White American', africanAmerican: 'African American', mexico: 'Mexico', puertoRico: 'Puerto Rico', peru: 'Peru', brazil: 'Brazil', argentina: 'Argentina',
  } },
];

/** A region's name, as the creator shows it. */
export const regionName = (region) => REGION_ORIGINS.find((group) => group.regions[region])?.regions[region] ?? region;

/**
 * The tone of the game's ladder (SKIN_TONES) each region's composite stands for: the middle of the range the player may pick
 * from. Read off the composites' cheeks (manifest.json `skin`) against the ladder, rounded to the tone a player would call it,
 * the two sexes together. Light for northern and central Europe; light tan round the Mediterranean and in East Asia (the
 * composites there are as light as southern Europe's, with more yellow); medium for the Middle East, the Andes, the Caribbean and
 * most of Southeast Asia; tan for India and Cambodia; deep for Africa and African Americans.
 */
export const REGION_TONES = {
  england: 'light', ireland: 'light', france: 'light', netherlands: 'light', germany: 'light', switzerland: 'light', austria: 'light', sweden: 'light',
  poland: 'light', czechRepublic: 'light', hungary: 'light', romania: 'light', serbia: 'light', ukraine: 'light', russia: 'light', whiteAmerican: 'light',
  italy: 'lightTan', spain: 'lightTan', greece: 'lightTan', argentina: 'lightTan', turkey: 'lightTan', israel: 'lightTan', lebanon: 'lightTan',
  uzbekistan: 'lightTan', tibet: 'lightTan', mongolia: 'lightTan', china: 'lightTan', taiwan: 'lightTan', korea: 'lightTan', japan: 'lightTan',
  iraq: 'medium', iran: 'medium', saudiArabia: 'medium', afghanistan: 'medium', burma: 'medium', thailand: 'medium', vietnam: 'medium', philippines: 'medium',
  samoa: 'medium', mexico: 'medium', puertoRico: 'medium', peru: 'medium', brazil: 'medium',
  india: 'tan', southIndia: 'tan', cambodia: 'tan',
  ethiopia: 'deep', chadCameroon: 'deep', westAfrica: 'deep', southAfrica: 'deep', africanAmerican: 'deep',
};

/**
 * How far from its region's tone the player may move a fighter's skin, in steps of the ladder: one either way for most, the
 * ladder's ends cutting it short (a West African may be tan or deep). Two for the peoples whose composite averages a wide spread
 * of skins: a mixed population (Brazil, Puerto Rico, African Americans, South Africa) or a country of many peoples from the
 * fair north to the dark south (India).
 */
export const TONE_REACH = { steps: 1, wide: { brazil: 2, puertoRico: 2, africanAmerican: 2, southAfrica: 2, india: 2 } };

const TONE_LADDER = Object.keys(SKIN_TONES);

/** The tone a region's composite stands for (REGION_TONES), medium for one not listed. */
export const regionTone = (region) => REGION_TONES[region] ?? 'medium';

/** The tones a fighter of `region` may have, lightest first: the region's own, and TONE_REACH steps either way. */
export function toneRange(region) {
  const middle = TONE_LADDER.indexOf(regionTone(region));
  const reach = TONE_REACH.wide[region] ?? TONE_REACH.steps;
  return TONE_LADDER.slice(Math.max(0, middle - reach), middle + reach + 1);
}

/** `tone` kept within `region`'s range: itself if it is in it, else the nearer end; the region's own tone for none. */
export function clampTone(region, tone) {
  const range = toneRange(region);
  if (range.includes(tone)) return tone;
  if (!TONE_LADDER.includes(tone)) return regionTone(region);
  return TONE_LADDER.indexOf(tone) < TONE_LADDER.indexOf(range[0]) ? range[0] : range[range.length - 1];
}

/**
 * Where a fighter is from, as the creator shows it, among the `available` regions (the composites of his sex): his own
 * `faceRegion` (the first, if a list), else his kit's commonest (KIT_REGIONS' first, or his skin tone's), each the nearest of
 * those there are.
 */
export function originOf(inputs, available, outfitRegion = null) {
  const own = inputs.faceRegion ?? inputs.look?.faceRegion ?? outfitRegion;
  const regions = own ? (Array.isArray(own) ? own : [own]) : kitRegions(inputs);
  return nearestRegion(regions[0], available);
}

/**
 * The tone a photo face's skin is shifted from and to, or null to leave it as the composite's: only a fighter with an origin of
 * his own (`look.faceRegion`), whose tone (clamped to the origin's range) is not the origin's.
 */
export function toneShift(inputs) {
  const own = inputs.look?.faceRegion;
  const origin = Array.isArray(own) ? own[0] : own;
  if (!origin || !inputs.look?.skinTone) return null;
  const from = regionTone(origin);
  const to = clampTone(origin, inputs.look.skinTone);
  return to === from ? null : { from, to };
}

// ---- The head's shape by region ----------------------------------------------------------------------------------------
//
// Average tendencies of each region's face and skull, as gentle offsets (-1 .. 1, 0 the middle of all the regions) that
// photohead.js applies over the body-driven head: a fighter gets his regions' blend, a little jitter, and the composite's own
// measured nose width (avg_tiles.py). Moderate on purpose: tendencies, not types. Coarse readings of the anthropometric
// literature (README, "Photo faces"): Farkas et al. 2005 (facial measurements across ethnic groups), Zhuang et al. 2010 (US
// workers by ethnicity), Le et al. 2002 (Asian and North American Caucasian proportions), and the classic cephalic-index
// surveys summarised in Martin & Saller.
//   noseBridge  height of the bridge          noseWidth  width at the wings          brow   depth of the brow ridge
//   cheekbone   prominence of the cheekbones  cheekWidth how far apart they sit      socket depth of the eye sockets
//   lidFold     fullness of the upper lid (the epicanthic region: a flatter mid-face)   lips   fullness of the lips
//   jaw         width of the jaw              chin       projection of the chin        faceLength  long (+) or broad (-) face
//   cephalic    breadth of the skull for its length (+ broad, - long)

const SHAPE_GROUPS = {
  northEurope: { noseBridge: 0.6, noseWidth: -0.4, brow: 0.5, cheekbone: 0, cheekWidth: -0.2, socket: 0.4, lidFold: -0.5, lips: -0.4, jaw: 0, chin: 0.3, faceLength: 0.3, cephalic: -0.1 },
  centralEurope: { noseBridge: 0.5, noseWidth: -0.3, brow: 0.4, cheekbone: 0.1, cheekWidth: 0, socket: 0.3, lidFold: -0.4, lips: -0.3, jaw: 0.2, chin: 0.2, faceLength: 0.1, cephalic: 0.5 },
  mediterranean: { noseBridge: 0.7, noseWidth: -0.1, brow: 0.5, cheekbone: 0, cheekWidth: -0.1, socket: 0.4, lidFold: -0.3, lips: 0, jaw: 0, chin: 0.1, faceLength: 0.4, cephalic: -0.2 },
  westAsia: { noseBridge: 0.8, noseWidth: 0, brow: 0.6, cheekbone: 0, cheekWidth: -0.1, socket: 0.5, lidFold: -0.3, lips: 0, jaw: 0, chin: 0, faceLength: 0.4, cephalic: 0.1 },
  southAsia: { noseBridge: 0.3, noseWidth: 0.2, brow: 0.2, cheekbone: 0, cheekWidth: -0.2, socket: 0.3, lidFold: -0.2, lips: 0.3, jaw: -0.1, chin: 0, faceLength: 0.2, cephalic: -0.4 },
  centralAsia: { noseBridge: 0, noseWidth: 0.1, brow: 0.1, cheekbone: 0.4, cheekWidth: 0.4, socket: 0, lidFold: 0.3, lips: 0, jaw: 0.3, chin: 0, faceLength: -0.2, cephalic: 0.6 },
  eastAsia: { noseBridge: -0.7, noseWidth: 0.3, brow: -0.4, cheekbone: 0.6, cheekWidth: 0.6, socket: -0.6, lidFold: 0.8, lips: 0.1, jaw: 0.3, chin: -0.3, faceLength: -0.2, cephalic: 0.6 },
  southeastAsia: { noseBridge: -0.6, noseWidth: 0.6, brow: -0.2, cheekbone: 0.3, cheekWidth: 0.3, socket: -0.4, lidFold: 0.5, lips: 0.4, jaw: 0.1, chin: -0.2, faceLength: -0.3, cephalic: 0.4 },
  westAfrica: { noseBridge: -0.3, noseWidth: 0.9, brow: 0.2, cheekbone: 0.2, cheekWidth: 0, socket: 0, lidFold: -0.2, lips: 0.9, jaw: 0.2, chin: -0.1, faceLength: 0, cephalic: -0.6 },
  eastAfrica: { noseBridge: 0.3, noseWidth: 0.3, brow: 0.2, cheekbone: 0.2, cheekWidth: -0.2, socket: 0.1, lidFold: -0.2, lips: 0.5, jaw: -0.2, chin: 0, faceLength: 0.5, cephalic: -0.5 },
  andes: { noseBridge: 0.2, noseWidth: 0.3, brow: 0.1, cheekbone: 0.5, cheekWidth: 0.4, socket: 0, lidFold: 0.2, lips: 0.2, jaw: 0.3, chin: 0, faceLength: 0, cephalic: 0.4 },
  caribbeanBrazil: { noseBridge: 0, noseWidth: 0.5, brow: 0.2, cheekbone: 0.1, cheekWidth: 0, socket: 0.1, lidFold: -0.2, lips: 0.5, jaw: 0.1, chin: 0, faceLength: 0, cephalic: -0.2 },
  polynesia: { noseBridge: 0, noseWidth: 0.6, brow: 0.3, cheekbone: 0.3, cheekWidth: 0.3, socket: 0, lidFold: 0, lips: 0.5, jaw: 0.6, chin: 0.2, faceLength: 0.1, cephalic: 0.4 },
};

const REGION_GROUP = {
  england: 'northEurope', ireland: 'northEurope', sweden: 'northEurope', netherlands: 'northEurope', whiteAmerican: 'northEurope', france: 'northEurope',
  germany: 'centralEurope', austria: 'centralEurope', switzerland: 'centralEurope', czechRepublic: 'centralEurope', poland: 'centralEurope', hungary: 'centralEurope',
  russia: 'centralEurope', ukraine: 'centralEurope', romania: 'centralEurope', serbia: 'centralEurope',
  italy: 'mediterranean', spain: 'mediterranean', greece: 'mediterranean', argentina: 'mediterranean',
  turkey: 'westAsia', israel: 'westAsia', lebanon: 'westAsia', iraq: 'westAsia', iran: 'westAsia', saudiArabia: 'westAsia', afghanistan: 'westAsia',
  india: 'southAsia', southIndia: 'southAsia',
  uzbekistan: 'centralAsia', tibet: 'centralAsia', mongolia: 'eastAsia', china: 'eastAsia', taiwan: 'eastAsia', korea: 'eastAsia', japan: 'eastAsia',
  burma: 'southeastAsia', thailand: 'southeastAsia', cambodia: 'southeastAsia', vietnam: 'southeastAsia', philippines: 'southeastAsia',
  westAfrica: 'westAfrica', southAfrica: 'westAfrica', chadCameroon: 'westAfrica', africanAmerican: 'westAfrica', ethiopia: 'eastAfrica',
  mexico: 'andes', peru: 'andes', puertoRico: 'caribbeanBrazil', brazil: 'caribbeanBrazil', samoa: 'polynesia',
};

/** A few regions' own departures from their group. */
const REGION_TWEAKS = {
  mongolia: { faceLength: -0.4, cheekWidth: 0.8, cheekbone: 0.8 },
  korea: { cephalic: 0.8 },
  japan: { faceLength: 0, cephalic: 0.4 },
  serbia: { cephalic: 0.7, faceLength: 0.4 },
  southIndia: { noseWidth: 0.4, lips: 0.4 },
  africanAmerican: { noseBridge: -0.1, noseWidth: 0.7, lips: 0.7 },
  sweden: { faceLength: 0.4 },
  ireland: { faceLength: 0.2, chin: 0.2 },
};

/** The shape offsets of a region (its group's, and its own tweaks). */
export function regionShape(region) {
  return { ...(SHAPE_GROUPS[REGION_GROUP[region]] ?? {}), ...(REGION_TWEAKS[region] ?? {}) };
}

/** The region's group (SHAPE_GROUPS), or null. */
export const regionGroup = (region) => REGION_GROUP[region] ?? null;

/** Detail the photo shader paints, 0..1: freckle-prone regions, and how heavy a man's beard shadow is by group. */
export const REGION_DETAIL = {
  freckles: { ireland: 1, england: 0.7, sweden: 0.6, netherlands: 0.5, whiteAmerican: 0.5, germany: 0.4, russia: 0.4, poland: 0.4, ukraine: 0.3, france: 0.3, czechRepublic: 0.3, austria: 0.3, switzerland: 0.3, hungary: 0.2 },
  beard: { westAsia: 1, mediterranean: 0.85, southAsia: 0.8, centralEurope: 0.75, northEurope: 0.7, latin: 0.6, andes: 0.35, caribbeanBrazil: 0.5, westAfrica: 0.5, eastAfrica: 0.5, centralAsia: 0.45, polynesia: 0.5, eastAsia: 0.3, southeastAsia: 0.25 },
};
