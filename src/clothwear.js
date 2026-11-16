// Whole-garment wear: what use does to a garment at the scale of the garment, painted into the body's vertex colours once
// when the body is built (no cost per frame; a crowd's baked body carries it too). The weave's own wear (dirt in the
// threads, pills, scuffs) is in the cloth atlas (tools/blender/wear.py); this is what reads from across a field:
//   - mud thrown up by the feet, thickest at the ankle and thinning up the shin (a walking stride throws wet ground
//     about knee high; `ground`), and ground into the knees' fronts by kneeling (`knees`);
//   - the hem and cuff: frayed (ragged, darker threads) and grimed by handling and by dragging (`hem`);
//   - sweat at the armpits, round the collar and down the upper back, where the cloth lies on the skin and is wetted
//     and dried again (salts and body oil: darker, yellowed on pale cloth; `sweat`);
//   - sun on the surfaces that face the sky (shoulders, the tops of the arms and of a hat-less hood): dye fades,
//     paler and greyer (`fade`);
//   - and a little grime over all of it (`grime`).
// One rule for every outfit: how much of each shows is the outfit's wear amount (CLOTH_WEAR_BY_OUTFIT, 0 to 1), set by its
// wearer's station: a peasant's or a common soldier's only clothes, worn every day of a campaign, are far more worn than a
// noble's, whose servants clean them and who has a change; court and parade clothes are put on clean for the occasion.

/** The wear amount of a station (0: put on clean; 1: the only clothes he has, worn to rags). */
export const STATION_WEAR = {
  // Rags, the destitute.
  destitute: 1,
  // A peasant's, a labourer's or a craftsman's working clothes; a levy called from the fields; a pirate's.
  labourer: 0.85,
  // A common soldier's issue or his own kit on campaign.
  soldier: 0.7,
  // A professional soldier with a servant or a paid uniform (a man-at-arms, a janissary, a samurai).
  professional: 0.45,
  // A noble or an officer on campaign: cleaned, changed, but in the field.
  noble: 0.25,
  // Arena and sports kit, washed for the bout; modern issued uniforms.
  laundered: 0.15,
  // Court, parade and the lists: put on clean for the occasion.
  parade: 0.05,
  // No cloth to wear (a machine, an animal).
  none: 0,
};

/**
 * Each outfit's station (outfits.js OUTFITS keys); a list gives a station per design. Not listed: a soldier.
 */
export const OUTFIT_STATION = {
  // Sports and the street.
  boxing: 'laundered', mma: 'laundered', sports: 'laundered', sumo: 'laundered', dobok: 'laundered', judogi: 'laundered',
  hiking: 'professional', casual: 'noble', thug: 'professional', business: 'parade', yakuza: 'noble',
  victorianLady: 'parade', victorianGent: 'parade', commoner: 'labourer', rags: 'destitute', forger: 'labourer',
  // Modern issue.
  swat: 'laundered', police: 'laundered', riot: 'laundered', specialForces: 'professional', infantry: 'soldier',
  proximity: 'laundered', fireEntry: 'professional', exoArmoured: 'laundered',
  // Europe.
  knight: 'professional', joan: 'noble', tournament: 'parade', templar: 'professional', footman: 'soldier', archer: 'soldier',
  levy: 'labourer', conquistadorPlate: 'professional', conquistadorQuilted: 'soldier',
  // The arena (washed between bouts; the editor of the games dressed the emperor).
  hoplomachus: 'laundered', murmillo: 'laundered', secutor: 'laundered', retiarius: 'laundered', thraex: 'laundered',
  scissor: 'laundered', maximus: 'laundered', commodus: 'parade', lorarius: 'soldier',
  // Rome and its neighbours.
  legionary: 'soldier', republicanLegionary: 'soldier', romanAuxiliary: 'soldier', centurion: 'professional',
  lateRoman: 'soldier', goth: 'soldier', gothNoble: 'noble', hun: 'soldier', hunNoble: 'noble', cataphract: 'professional',
  parthianArcher: 'soldier',
  // Japan.
  samurai: 'professional', oyoroi: 'noble', samuraiTosei: 'professional', ashigaru: 'soldier', ronin: 'labourer',
  sohei: 'soldier', wokou: 'labourer', wokouArmoured: 'soldier',
  // China and the steppe.
  mingGarrison: 'soldier', mingBrigandine: 'soldier', mingEliteInfantry: 'professional', mingElite: 'noble',
  mingIronLamellar: 'professional', bannerArmour: 'professional', bayara: 'professional', ironPagoda: 'professional',
  guanYu: 'noble', hanSoldier: 'soldier', hanCavalry: 'soldier', wuxia: 'professional', kungfu: 'laundered', monk: 'professional',
  steppeLight: 'soldier', steppeMedium: 'soldier', kheshig: 'professional', cumanHeavy: 'professional', xiongnu: 'soldier',
  // The Ottomans and their foes.
  azap: 'soldier', janissary: 'professional', ottomanHeavy: 'professional', gaziAlp: 'soldier', saladin: 'noble',
  // The Americas.
  mexicaWarrior: 'soldier', mexicaElite: 'noble', incaUncu: 'soldier', incaNoble: ['noble', 'noble', 'noble', 'noble', 'parade'],
  // No cloth.
  silverback: 'none', monkeyFur: 'none', go2Dog: 'none', spotDog: 'none', vision60Dog: 'none', humanoid: 'none',
  combatBot: 'none', miniHumanoid: 'none',
};

/** An outfit's wear amount (0 to 1): its station's (OUTFIT_STATION, STATION_WEAR). */
export function clothWearOf(outfit) {
  const station = OUTFIT_STATION[outfit?.kind] ?? 'soldier';
  const named = Array.isArray(station) ? station[Math.min(outfit.design ?? 0, station.length - 1)] : station;
  return STATION_WEAR[named] ?? STATION_WEAR.soldier;
}

/**
 * The marks at full wear (amount 1), each a share of the cloth's colour moved toward its mark. Distances in metres, on the
 * body in its bind pose (standing, arms hanging, the ground at y = 0, facing -x).
 */
export const CLOTH_WEAR = {
  // Soiling stains as a dye does (the cloth's colour times `stain`, darker and browner on any cloth), and dried earth
  // lies on it (toward `mud`, a grey brown: it lightens dark cloth, as dried mud on a black hem shows pale).
  stain: [0.5, 0.4, 0.28],
  mud: [0.5, 0.43, 0.34],
  mudCover: 0.6,
  // Thrown up by the feet: this much at the ground, falling to a third by `groundHeight` up.
  ground: 1.2,
  groundHeight: 0.38,
  // Ground into the front of the knee (within `kneeRadius` of the joint, on the faces turned forward).
  knees: 0.8,
  kneeRadius: 0.13,
  // The hem and cuff: within `hemBand` of a garment's lowest edge below a point, ragged darker threads (`fray`, a share
  // darker) and grime (`hem`, toward the mud) fading over `hemHeight`.
  hemBand: 0.035,
  fray: 0.55,
  hem: 0.7,
  hemHeight: 0.16,
  // How far round a point the garment's edge below it is looked for (about the cloth's vertex spacing).
  hemReach: 0.05,
  // Sweat: darker by this share, and yellowed (blue down by `sweatYellow` of it) where the cloth is pale.
  sweat: 0.38,
  sweatYellow: 0.5,
  armpitRadius: 0.11,
  collarRadius: 0.12,
  // The upper back, between the shoulder blades: this wide (each side of the spine) and from the shoulders this far down.
  backHalfWidth: 0.13,
  backDepth: 0.3,
  // Sun: faces turned to the sky go this much toward a paler grey of their own colour.
  fade: 0.5,
  // (Everything out in the light fades a little: this share of it, the rest on the faces turned up.)
  fadeAll: 0.35,
  // Grime over the whole garment.
  grime: 0.2,
  // Blotches: how big (m) and how much they vary the marks (so the mud and sweat are not smooth bands).
  blotchSize: 0.07,
  blotch: 0.55,
};

// The garment regions (render.js paintBody's region names) that are cloth; leather, steel, mail, skin and fur keep theirs.
const WORN_REGIONS = new Set(['kit', 'top', 'top2', 'trim', 'trim2', 'stripe', 'shirt', 'tie', 'pattern', 'under', 'mawashi', 'cloth', 'cloth2', 'pad', 'sock', 'band', 'rope']);

const wearFract = (value) => value - Math.floor(value);
// A value in 0..1 fixed to a point (each vertex its own, the same each build).
const wearGrain = (x, y, z) => wearFract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453);
// Soft blotches about `size` across, 0..1.
function wearBlotches(x, y, z, size) {
  const k = (2 * Math.PI) / size;
  const value = Math.sin(x * k + 1.3 * Math.sin(y * k * 0.7)) * Math.sin(y * k * 0.83 + 2.1) + Math.sin(z * k * 1.1 + y * k * 0.4 + 0.7);
  return Math.min(1, Math.max(0, 0.5 + value * 0.3));
}
const wearSmooth = (edge0, edge1, value) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Where each cloth vertex's garment ends below it: for each vertex the lowest point of its own region within `hemReach`
 * across (a hanging garment's hem or cuff), by a grid of cells that size. Returns the height above that edge per vertex.
 */
function heightsAboveHem(positions, regions, reach) {
  const count = regions.length;
  const cells = new Map();
  const cellKey = (region, i, k) => `${region}|${i}|${k}`;
  for (let vertex = 0; vertex < count; vertex += 1) {
    if (!WORN_REGIONS.has(regions[vertex])) continue;
    const key = cellKey(regions[vertex], Math.floor(positions[vertex * 3] / reach), Math.floor(positions[vertex * 3 + 2] / reach));
    const y = positions[vertex * 3 + 1];
    if (!(cells.get(key) <= y)) cells.set(key, y);
  }
  const above = new Float32Array(count);
  for (let vertex = 0; vertex < count; vertex += 1) {
    if (!WORN_REGIONS.has(regions[vertex])) continue;
    const i = Math.floor(positions[vertex * 3] / reach);
    const k = Math.floor(positions[vertex * 3 + 2] / reach);
    const y = positions[vertex * 3 + 1];
    let lowest = y;
    for (let di = -1; di <= 1; di += 1) for (let dk = -1; dk <= 1; dk += 1) {
      const low = cells.get(cellKey(regions[vertex], i + di, k + dk));
      if (low !== undefined && low < lowest) lowest = low;
    }
    above[vertex] = y - lowest;
  }
  return above;
}

/**
 * The body's cloth worn: `colors` (RGB per vertex, changed in place) of a body mesh in its bind pose (`positions`,
 * `normals`, `regions`; `points`: its joints by body.js P), by `amount` (clothWearOf). `P`: body.js P.
 */
export function wearCloth(colors, { positions, normals, regions, bindPoints: points }, amount, P, spec = CLOTH_WEAR) {
  if (!(amount > 0) || !regions || !points) return colors;
  const above = heightsAboveHem(positions, regions, spec.hemReach);
  const neck = points[P.neck];
  const shoulders = [points[P.lShoulder], points[P.rShoulder]];
  const knees = [points[P.lKnee], points[P.rKnee]];
  const shoulderY = (shoulders[0][1] + shoulders[1][1]) / 2;
  // The armpit: below the shoulder joint and in toward the chest.
  const armpits = shoulders.map(([x, y, z]) => [x, y - 0.1, z * 0.75]);
  const distance = (vertex, [x, y, z]) => Math.hypot(positions[vertex * 3] - x, positions[vertex * 3 + 1] - y, positions[vertex * 3 + 2] - z);
  for (let vertex = 0; vertex < regions.length; vertex += 1) {
    if (!WORN_REGIONS.has(regions[vertex])) continue;
    const x = positions[vertex * 3];
    const y = positions[vertex * 3 + 1];
    const z = positions[vertex * 3 + 2];
    const nx = normals[vertex * 3];
    const ny = normals[vertex * 3 + 1];
    const blotch = 1 - spec.blotch + spec.blotch * 2 * wearBlotches(x, y, z, spec.blotchSize);
    const grain = wearGrain(x, y, z);
    // Mud: from the ground, at the knees, and at a hem (dragged, handled).
    const fromGround = spec.ground * Math.exp((-y / spec.groundHeight) * Math.log(3));
    const kneeling = spec.knees * Math.max(...knees.map((knee) => 1 - wearSmooth(spec.kneeRadius * 0.4, spec.kneeRadius, distance(vertex, knee)))) * wearSmooth(-0.1, -0.5, nx);
    const nearHem = above[vertex];
    const hemGrime = spec.hem * Math.exp((-nearHem / spec.hemHeight) * Math.log(3));
    const mud = Math.min(0.85, amount * blotch * (fromGround + kneeling + hemGrime));
    // Fray: ragged threads along the edge (every other vertex or so, by its grain).
    const fray = amount * spec.fray * (1 - wearSmooth(spec.hemBand * 0.3, spec.hemBand, nearHem)) * (grain > 0.35 ? 1 : 0.3);
    // Sweat: armpits, collar, the upper back.
    const armpit = Math.max(...armpits.map((pit) => 1 - wearSmooth(spec.armpitRadius * 0.35, spec.armpitRadius, distance(vertex, pit))));
    const collar = (1 - wearSmooth(spec.collarRadius * 0.45, spec.collarRadius, distance(vertex, neck))) * wearSmooth(shoulderY - 0.08, shoulderY - 0.02, y);
    const back = wearSmooth(0.1, 0.5, nx) * (1 - wearSmooth(spec.backHalfWidth * 0.5, spec.backHalfWidth, Math.abs(z))) * wearSmooth(shoulderY - spec.backDepth, shoulderY - spec.backDepth * 0.5, y) * (1 - wearSmooth(shoulderY - 0.02, shoulderY + 0.05, y));
    const sweat = amount * spec.sweat * Math.min(1, Math.max(armpit, collar, back)) * (0.6 + 0.4 * blotch);
    // Sun: a little everywhere, most on the faces turned up.
    const sun = amount * spec.fade * (spec.fadeAll + (1 - spec.fadeAll) * Math.max(0, ny) ** 1.5);
    wornColour(colors, vertex * 3, { mud, grime: amount * spec.grime, fray, sweat, sun }, spec);
  }
  return colors;
}

/**
 * One colour (`colors` at `at`, RGB, changed in place) worn by its marks, each 0..1: `sun` (the dye faded), `mud` and
 * `grime` (soiled), `sweat`, `fray` (threads darkened at an edge).
 */
export function wornColour(colors, at, { mud = 0, grime = 0, fray = 0, sweat = 0, sun = 0 }, spec = CLOTH_WEAR) {
  let r = colors[at];
  let g = colors[at + 1];
  let b = colors[at + 2];
  // Fading first (the dye), then what lies on it.
  const grey = 0.3 * r + 0.59 * g + 0.11 * b;
  const faded = (channel) => (channel * 0.45 + grey * 0.55) * 0.85 + 0.12;
  r += (faded(r) - r) * sun;
  g += (faded(g) - g) * sun;
  b += (faded(b) - b) * sun;
  const soil = Math.min(0.9, mud + grime);
  r *= 1 + (spec.stain[0] - 1) * soil;
  g *= 1 + (spec.stain[1] - 1) * soil;
  b *= 1 + (spec.stain[2] - 1) * soil;
  const cover = mud * spec.mudCover;
  r += (spec.mud[0] - r) * cover;
  g += (spec.mud[1] - g) * cover;
  b += (spec.mud[2] - b) * cover;
  const pale = Math.min(1, Math.max(0, (grey - 0.35) / 0.4));
  r *= 1 - sweat;
  g *= 1 - sweat * 1.05;
  b *= 1 - sweat * (1 + spec.sweatYellow * pale);
  colors[at] = r * (1 - fray);
  colors[at + 1] = g * (1 - fray);
  colors[at + 2] = b * (1 - fray);
}

/**
 * A hung sheet's wear (a mantle: wardrobe.js clothSheet), as colours to multiply its material's by (RGB per vertex):
 * `rows` of `width` vertices from the top (row 0) to the hem, `length` (m) long, its hem `hemAbove` (m) over the ground,
 * `base(u)` the cloth's colour at a column of vertices ({ r, g, b }), `amount` its wear (clothWearOf). Null when it is not worn.
 */
export function drapeWear({ rows, width, length, hemAbove, base, amount }, spec = CLOTH_WEAR) {
  if (!(amount > 0)) return null;
  const colors = new Float32Array(rows * width * 3);
  const one = new Float32Array(3);
  for (let v = 0; v < rows; v += 1) {
    const nearHem = (1 - v / (rows - 1)) * length;
    const y = hemAbove + nearHem;
    for (let u = 0; u < width; u += 1) {
      // (The sheet's own coordinates, in metres, for the blotches and the grain.)
      const x = u * 0.05;
      const blotch = 1 - spec.blotch + spec.blotch * 2 * wearBlotches(x, y, 0, spec.blotchSize);
      const grain = wearGrain(x, y, 0.37);
      const mud = Math.min(0.85, amount * blotch * (spec.ground * Math.exp((-y / spec.groundHeight) * Math.log(3)) + spec.hem * Math.exp((-nearHem / spec.hemHeight) * Math.log(3))));
      const fray = amount * spec.fray * (1 - wearSmooth(spec.hemBand * 0.3, spec.hemBand, nearHem)) * (grain > 0.35 ? 1 : 0.3);
      // (Over the shoulders the sheet faces up.)
      const sun = amount * spec.fade * (spec.fadeAll + (1 - spec.fadeAll) * (v === 0 ? 0.6 : 0));
      const { r, g, b } = base(u);
      one.set([r, g, b]);
      wornColour(one, 0, { mud, grime: amount * spec.grime, fray, sun }, spec);
      const at = (v * width + u) * 3;
      colors[at] = one[0] / Math.max(r, 1e-3);
      colors[at + 1] = one[1] / Math.max(g, 1e-3);
      colors[at + 2] = one[2] / Math.max(b, 1e-3);
    }
  }
  return colors;
}
