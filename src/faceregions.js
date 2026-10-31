// Who is cast with which average face (photoface.js): the source regions of the
// average-face composites, where they are on the map, and which regions each
// culture or faction of the game draws its faces from. Plain data, to be
// edited: a fighter or an outfit may name its own (`faceRegion`: a region or a
// list), which wins over these tables.
//
// The composites: one average face per region and sex. Not every region has
// both: a region missing for a sex falls back to the nearest one that has it
// (by the map, REGION_PLACES).

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
  return KIT_REGIONS[inputs.outfit?.kind] ?? TONE_REGIONS[inputs.look?.skinTone ?? 'medium'] ?? TONE_REGIONS.medium;
}
