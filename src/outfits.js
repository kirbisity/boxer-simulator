// Outfits: what a fighter wears, what it does to him, and how it looks.
//
// The traits are physics and harm, kept apart. Movement scales footwork and
// how fast the limbs can swing; balance scales how hard he is to knock over;
// gear weight is real mass, so a man in armour is knocked back as a heavier
// man is (and his muscles must move it); kick strength is weight behind the
// foot. Protection only reduces harm — damage, concussion, knockouts, broken
// bones, cuts — never the impulse or the knockback. It is given per kind of
// harm (blunt now; cut and pierce for blades and points to come), and
// `damageDealt` is the same for what a fighter's own strikes do.
//
// Each outfit has its chosen design (three were drawn; one was picked):
// garment pieces the body is built from (a top, a bottom, boots, a helmet,
// armour, tattoos, things that swing). `designs` stays a list, so more can
// be added and picked between again.
// Colours may be hex or 'corner' (red or blue by side).

export const DAMAGE_TYPES = ['blunt', 'cut', 'pierce'];

/** Movement classes: footwork speed, its acceleration, and limb swing speed. */
export const MOVEMENT = {
  excellent: { foot: 1, accel: 1, swing: 1 },
  good: { foot: 0.92, accel: 0.88, swing: 0.97 },
  // Heavy kit (plate, SWAT, a suit): slower, but not far behind (it was 0.72 / 0.62 / 0.88).
  limited: { foot: 0.82, accel: 0.75, swing: 0.92 },
};

// `bullet`: share of a pistol round's harm stopped, by region (see GUN).
const NO_PROTECTION = { blunt: 0, cut: 0, pierce: 0, bullet: { head: 0, torso: 0, limb: 0 } };

/** Cloth colours by name, for designs' palettes and the builder's pickers. */
export const CLOTH_COLORS = {
  navy: '#24324a', maroon: '#7a2230', black: '#1c1c20', charcoal: '#26262b', grey: '#6b6e74', white: '#e4e4e6',
  olive: '#4a5233', denim: '#2b3550', sand: '#b39a73', red: '#b8302c', blue: '#2a59c4', sky: '#2f7fd8',
  green: '#2aa86a', forest: '#2f5a3a', yellow: '#e0b030', ochre: '#b8902f', orange: '#d4612a', rust: '#9a4a2a',
  brown: '#6a4a30', wine: '#5a1a2a', purple: '#5a3a6a', slate: '#4a5560', linen: '#d8cfb8', undyed: '#c8bc9e', cream: '#ece4d0',
};

// ---- Armour designs, five of each type (three are kept; the game shuffles them) ----

/** Knight plate in another finish. */
function plateDesign(label, steel, fluted, pointed, under) {
  return { label, top: { kind: 'longsleeve', color: under }, bottom: { kind: 'tights', color: under }, armor: { kind: 'plate', color: steel, fluted }, head: { kind: 'bascinet', color: steel, pointed }, feet: { kind: 'sabaton', color: steel } };
}

/** A foot soldier's body armour (brigandine, mail shirt or breastplate) in its cloth, over a quilted coat, and a kettle hat. */
function footmanDesign(label, kind, cloth, quilt, hat) {
  return { label, top: { kind: 'longsleeve', color: quilt }, bottom: { kind: 'tights', color: '#3a3326' }, armor: { kind, color: '#9aa0a8', cloth, gold: '#c9a85a', mail: '#8d9097' }, head: { kind: 'kettleHat', color: '#9aa0a8', ...hat }, feet: { kind: 'compactBoot', color: '#3a2a1c' } };
}

/** Tōsei gusoku in a finish, with its crest and war mask. */
/**
 * An ō-yoroi design: the lacquer of the plates, the silk lacing, gilt
 * fittings, the stencilled leather breast (`leather`, `stencil`), the robe
 * (hitatare: its sleeves; `sleeve` a brocade one on the bow arm) and hakama,
 * and the kabuto's crest.
 */
function oyoroiDesign(label, { lacquer, lace, gold, leather, stencil, robe, hakama, sleeve = robe, crest }) {
  return {
    label,
    top: { kind: 'longsleeve', color: robe },
    bottom: { kind: 'hakama', color: hakama },
    armor: { kind: 'oyoroi', color: lacquer, lace, gold, leather, stencil, cloth2: sleeve, mail: '#34343a' },
    // The great fukigaeshi faced with the breast's stencilled leather (`leather`), gilt-edged.
    head: { kind: 'kabuto', color: lacquer, crest, lace, gold, flare: 0.16, tiers: 5, fukigaeshi: 1.5, leather, greatWings: true },
    feet: { kind: 'tabi', color: '#2a1d14' },
  };
}

/**
 * A Templar's design: the surcoat and mantle's cloth, the second colour (the
 * other half of the Beauséant), and how the field is laid out (`pale`:
 * halved down the middle; null: plain); on every one the red cross pattée
 * on the chest (`charge`: drawn sharp-edged over the field).
 */
function templarDesign(label, cloth, cloth2, heraldry) {
  return {
    label,
    top: { kind: 'longsleeve', color: '#4a4238' },
    bottom: { kind: 'tights', color: '#3a342c' },
    armor: { kind: 'templar', color: '#8d9097', mail: '#8d9097', cloth, cloth2, heraldry, charge: { kind: 'pattee', color: '#b0181a' }, leather: '#5a3a22' },
    head: { kind: 'greatHelm', color: '#b8bec6', breaths: true, crossCut: true, coif: '#4e5157' },
    feet: { kind: 'compactBoot', color: '#4a2e1a' },
    // The mantle in the surcoat's cloth (white for a knight, black for a sergeant), the red cross on its left shoulder.
    extras: [
      { kind: 'mantle', color: cloth, cross: '#b0181a', length: 1.32 },
    ],
  };
}

function toseiDesign(label, steel, lace, crest, mask, under) {
  return { label, top: { kind: 'longsleeve', color: under }, bottom: { kind: 'pants', color: under }, armor: { kind: 'toseiDo', color: steel, lace, gold: '#d6a743' }, head: { kind: 'kabuto', color: steel, crest, mask, lace, gold: '#d6a743' }, feet: { kind: 'tabi', color: '#1a1b22' } };
}

/** An ashigaru's lacquered do and jingasa, the mon in gold or white. */
function ashigaruDesign(label, lacquer, lace, mon, cloth) {
  return { label, top: { kind: 'longsleeve', color: cloth }, bottom: { kind: 'pants', color: cloth }, armor: { kind: 'okegawa', color: lacquer, lace, gold: mon }, head: { kind: 'jingasa', color: lacquer, gold: mon }, feet: { kind: 'tabi', color: '#1a1b22' } };
}

// Ming soldiers. Garrison: the padded coat in its colour, the red wrap.
function mingGarrisonDesign(label, coat, trousers) {
  return { label, top: { kind: 'longsleeve', color: coat }, bottom: { kind: 'pants', color: trousers }, armor: { kind: 'mingQuilt', color: coat, cloth: coat, cloth2: shade(coat, 0.78) }, head: { kind: 'clothWrap', color: '#b3161b' }, feet: { kind: 'compactBoot', color: '#17171c' } };
}
// Brigandine: the coat's cloth, gilt rivets, the iron hat.
// `look`: the same protection drawn as lamellar (`kind: 'mingLamellar'`, its `lace`).
function mingBrigandineDesign(label, cloth, iron, look = {}) {
  return { label, top: { kind: 'longsleeve', color: shade(cloth, 0.7) }, bottom: { kind: 'pants', color: '#22201e' }, armor: { kind: 'mingBrigandine', color: iron, cloth, gold: '#a8894e', ...look }, head: { kind: 'mingHat', color: iron, tassel: '#b3161b' }, feet: { kind: 'compactBoot', color: '#17171c' } };
}
// Elite: the coat, the coif's cloth, the steel.
// `helm`: a steel neck guard (`neck: 'steel'`) in place of the padded coif, and a steel face mask.
// `look`: the same protection drawn as scale armour (`kind: 'mingScale'`).
function mingEliteDesign(label, cloth, coif, steel, helm = {}, look = {}) {
  return { label, top: { kind: 'longsleeve', color: shade(cloth, 0.6) }, bottom: { kind: 'pants', color: '#1c1a18' }, armor: { kind: 'mingElite', color: steel, cloth, gold: '#a8894e', ...look }, head: { kind: 'mingHelm', color: steel, gold: '#d6a743', tassel: '#b3161b', coif, ...helm }, feet: { kind: 'compactBoot', color: '#141416' } };
}
// The steppe man's kit: his deel (the robe over all), its trim and sash, his hat or helmet.
function steppeDesign(label, armor, deel, trim, head, feet = '#3a2416') {
  return { label, top: { kind: 'longsleeve', color: deel }, bottom: { kind: 'pants', color: '#2a2622' }, armor: { cloth: deel, cloth2: trim, ...armor }, head, feet: { kind: 'compactBoot', color: feet } };
}
// A hex colour darker (or lighter) by a share.
function shade(hex, share) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (offset) => Math.max(0, Math.min(255, Math.round(((value >> offset) & 255) * share)));
  return `#${[16, 8, 0].map((offset) => channel(offset).toString(16).padStart(2, '0')).join('')}`;
}

// Conquistadors: the doublet, the breeches, the helmet (morion, cabasset, pot helmet).
function conquistadorDesign(label, doublet, breeches, helmet, sash = null) {
  return { label, top: { kind: 'longsleeve', color: doublet }, bottom: { kind: 'pants', color: breeches }, armor: { kind: 'conquistador', color: '#a7adb6', mail: '#8d9097', cloth: doublet, cloth2: sash ?? doublet }, head: { kind: helmet, color: '#a7adb6' }, feet: { kind: 'compactBoot', color: '#2a1d14' } };
}
function escaupilDesign(label, quilt, sleeves, helmet) {
  return { label, top: { kind: 'longsleeve', color: sleeves }, bottom: { kind: 'pants', color: '#3a2a22' }, armor: { kind: 'escaupil', color: quilt, cloth: quilt, cloth2: shade(quilt, 0.82) }, head: { kind: helmet, color: '#9aa0a8' }, feet: { kind: 'compactBoot', color: '#2a1d14' } };
}
// The Mexica warrior: the cotton armour, the loincloth, a feathered band (none if `band` is null).
function mexicaDesign(label, cotton, band) {
  return { label, bottom: { kind: 'loincloth', color: '#ece4d0' }, armor: { kind: 'ichcahuipilli', color: cotton, cloth: cotton, cloth2: shade(cotton, 0.85) }, head: band ? { kind: 'featherBand', color: band } : null, feet: { kind: 'sandal', color: '#5a3a22' } };
}

// A gladiator's five looks: his metal, his loincloth, his plume.
// The arena's armour, part by part: gladiators fought with the chest bare
// and the limbs most exposed in their stance covered, each kind differently
// (`regions` in an outfit's protection). Plate turns a blade (`deflects`).
const ARENA = {
  // A bronze helmet with a grilled visor over the whole head and face.
  helm: { blunt: 0.65, cut: 0.95, pierce: 0.85, deflects: true },
  // The secutor's and scissor's smooth egg: nothing to catch a trident's prong or an edge.
  smoothHelm: { blunt: 0.7, cut: 0.97, pierce: 0.9, deflects: true },
  // The manica: overlapping metal or hardened leather lames over padding.
  manica: { blunt: 0.45, cut: 0.85, pierce: 0.7, deflects: true },
  // A quilted manica or legging: thick linen, no metal.
  quilt: { blunt: 0.35, cut: 0.55, pierce: 0.35 },
  // A bronze greave (ocrea) from instep to knee.
  greave: { blunt: 0.55, cut: 0.95, pierce: 0.85, deflects: true },
  // The thraex's greaves run up over the quilted thigh.
  highGreave: { blunt: 0.45, cut: 0.8, pierce: 0.6, deflects: true },
  // The retiarius's galerus: a bronze plate standing up off the shoulder, guarding neck and arm.
  galerus: { blunt: 0.6, cut: 0.95, pierce: 0.85, deflects: true },
  // Wrappings (fasciae) round a shin: little.
  wrap: { blunt: 0.15, cut: 0.25, pierce: 0.15 },
  // The scissor's scale shirt over the trunk, and the steel tube over his left arm.
  scale: { blunt: 0.4, cut: 0.85, pierce: 0.6 },
  tube: { blunt: 0.7, cut: 1, pierce: 0.95, deflects: true },
  bare: { blunt: 0, cut: 0, pierce: 0 },
};

const GLADIATOR_LOOKS = [
  { label: 'Bronze, cream', metal: '#b98a3e', cloth: '#ece4d0', plume: '#b81d22', strap: '#6a4526' },
  { label: 'Brass, red', metal: '#c9a25a', cloth: '#8a1f22', plume: '#f0ece4', strap: '#4a2e1a' },
  { label: 'Steel, blue', metal: '#a7adb6', cloth: '#2a3a6a', plume: '#1a1a1d', strap: '#3a2a1c' },
  { label: 'Dark bronze, white', metal: '#8a6a3a', cloth: '#f2eee4', plume: '#d6a743', strap: '#5a3a22' },
  { label: 'Gilt, ochre', metal: '#d6b45a', cloth: '#b8862e', plume: '#2a4a9a', strap: '#6a4526' },
];

/** A gladiator of a kind in one of the looks; `helmet` null for none. */
function gladiatorDesign(kind, look, helmet, { barefoot = false } = {}) {
  return {
    label: look.label, bottom: { kind: 'loincloth', color: look.cloth }, top: { kind: 'sportsBra', color: look.cloth, female: true },
    armor: { kind, color: look.metal, lace: look.strap, gold: '#d6b45a' }, feet: barefoot ? { kind: 'bare' } : { kind: 'sandal', color: look.strap },
    ...(helmet ? { head: { ...helmet, color: look.metal } } : {}),
  };
}

// Heels: how far the boot is pitched up (radians, toe on the floor) and how
// long its pointed toe is (a share of the foot). Footing is lost with the
// pitch: the weight rides on the ball of the foot and a stiletto's tip, and
// the ankle, pointed, has little range left to catch a sway.
const BUSINESS_HEELS = { pitch: 0.32, point: 0.42 };
// The lady's boot: a Louis heel, higher and more pointed than the business
// heel, so she goes over more easily, but not so high she cannot fight in it.
const LADY_HEELS = { pitch: 0.36, point: 0.56 };
// Gothic platforms: a thick sole under the whole foot (`platform`, m) and a
// chunky block heel, so the foot is pitched far less for the height it
// gains: steadier than the Louis heel. A round toe and Mary Jane straps
// with buckles (`round`, `block`, `straps`: how they are drawn).
const PLATFORM_HEELS = { pitch: 0.24, point: 0.28, platform: 0.045, round: true, block: true, straps: 3 };
export const HEEL_FOOTING_PER_RADIAN = 1.1;

// What the gothic designs share: the corset, the platforms, the face.
const GOTHIC = {
  // A small dark-red flower on one side of the head, over whatever her hair is.
  head: { kind: 'flower', color: '#5c0b16', lace: '#0d0c0f', side: 1 },
  armor: { kind: 'overbust', color: '#0f0f12', cloth: '#121216', cloth2: '#26262d', lace: '#2e2e36', gold: '#b8bcc4' },
  feet: { kind: 'platformShoe', color: '#0b0b0d', heels: PLATFORM_HEELS },
  face: { skinTone: 'porcelain', makeup: { eyes: 'smoky', liner: 'winged', lowerLash: 'heavy', lips: '#0b090b' } },
};
const GOTHIC_CHOKER = { kind: 'choker', color: '#111114', beads: '#24242b' };

// The heeled boot's sole lies this far below the ankle, and the foot (with
// its boot) is this long per metre of height; with the toe's point they set
// how far a heel lifts the body (see heelLift).
const HEEL_SOLE_BELOW_ANKLE = 0.0565;
const FOOT_PER_METRE = 0.25 / 1.8;

/**
 * How far heels lift the body (m): the boot pitched up about the tip of its
 * pointed toe, which stays on the floor, carrying the ankle up with it.
 */
export function heelLift(heels, heightM) {
  if (!heels) return 0;
  const toeTip = FOOT_PER_METRE * heightM * (0.65 + heels.point);
  // A platform sole lifts the whole foot by its thickness as well.
  return toeTip * Math.sin(heels.pitch) - HEEL_SOLE_BELOW_ANKLE * (1 - Math.cos(heels.pitch)) + (heels.platform ?? 0);
}

/** Footing (1 = flat shoes) in heels pitched this far. */
export function heelFooting(heels) {
  return heels ? Math.max(0.3, 1 - HEEL_FOOTING_PER_RADIAN * heels.pitch) : 1;
}

export const OUTFITS = {
  boxing: {
    faction: 'ring',
    label: 'Boxing', movement: 'excellent', fists: 'gloved',
    // A padded glove spreads the blow: 10% less harm from punches.
    damageDealt: { hand: 0.9 },
    designs: [
      { label: 'Pro trunks', bottom: { kind: 'trunks', color: 'corner' }, top: { kind: 'sportsBra', color: 'corner', female: true }, feet: { kind: 'boxingBoot', color: '#17171c' } },
    ],
  },
  // Mixed martial arts: fight trunks, barefoot, bare fists (or the thin open
  // gloves, which spread a blow no more than a fist).
  mma: {
    faction: 'ring',
    label: 'MMA', movement: 'excellent', fists: 'bare',
    palette: [[null, 'black'], [null, 'navy'], [null, 'red'], [null, 'white'], [null, 'charcoal']],
    designs: [
      { label: 'Fight trunks', bottom: { kind: 'trunks', color: '#16161a' }, top: { kind: 'sportsBra', color: '#16161a', female: true }, feet: { kind: 'bare' } },
    ],
  },
  sports: {
    faction: 'ring',
    label: 'Sports', movement: 'excellent', fists: 'bare',
    headgear: ['cap'],
    palette: [['sky', 'black'], ['red', 'black'], ['green', 'charcoal'], ['yellow', 'navy'], ['white', 'black'], ['black', 'grey']],
    designs: [
      { label: 'Running', top: { kind: 'tank', color: '#2f7fd8' }, bottom: { kind: 'splitShorts', color: '#1c1c22' }, feet: { kind: 'trainer', color: '#f4f4f6', accent: '#ff6a2a' } },
    ],
  },
  sumo: {
    faction: 'ring',
    label: 'Sumo', movement: 'excellent', fists: 'bare',
    palette: [[null, 'black'], [null, 'purple'], [null, 'wine'], [null, 'navy'], [null, 'brown']],
    designs: [
      { label: 'Black mawashi', bottom: { kind: 'mawashi', color: '#1a1a1d' }, extras: [{ kind: 'sagari', color: '#1a1a1d' }], feet: { kind: 'bare' }, hair: 'topknot' },
    ],
  },
  hiking: {
    faction: 'street',
    label: 'Hiking', movement: 'good', fists: 'bare',
    headgear: ['boonie'],
    palette: [['orange', 'olive'], ['forest', 'brown'], ['sky', 'slate'], ['red', 'charcoal'], ['yellow', 'olive']],
    // A heavy-soled boot puts weight behind a kick.
    kick: 1.1,
    designs: [
      { label: 'Shell jacket', top: { kind: 'jacket', color: '#d4612a', zip: true, hood: false }, bottom: { kind: 'cargo', color: '#4a4f45' }, feet: { kind: 'hikingBoot', color: '#5a3d24' } },
    ],
  },
  casual: {
    faction: 'street',
    label: 'Casual', movement: 'good', fists: 'bare',
    palette: [['maroon', 'sand'], ['navy', 'denim'], ['forest', 'sand'], ['purple', 'charcoal'], ['rust', 'denim'], ['grey', 'black']],
    designs: [
      { label: 'Flannel & chinos', top: { kind: 'flannel', color: '#8a2a24', check: '#2a1a1a', under: '#e4e4e6' }, bottom: { kind: 'pants', color: '#b39a73' }, feet: { kind: 'trainer', color: '#3a2a20' } },
      // Worn in the subway level (as the brief there asked): not offered elsewhere.
      { label: 'T-shirt & jeans', levelOnly: true, top: { kind: 'tee', color: '#24324a' }, bottom: { kind: 'jeans', color: '#2b3550' }, feet: { kind: 'trainer', color: '#e9e9ec' } },
      { label: 'Hoodie & joggers', levelOnly: true, top: { kind: 'hoodie', color: '#7a2230' }, bottom: { kind: 'joggers', color: '#26262b' }, feet: { kind: 'trainer', color: '#e9e9ec' } },
    ],
  },
  // A street thug: a zipped track jacket, joggers, trainers, a beanie.
  thug: {
    faction: 'street',
    label: 'Street thug', movement: 'good', fists: 'bare',
    palette: [['black', 'black'], ['navy', 'charcoal'], ['maroon', 'black']],
    designs: [
      { label: 'Black track jacket', top: { kind: 'jacket', color: '#16171b', zip: true, trim: '#e9e9ec' }, bottom: { kind: 'joggers', color: '#1c1c20' }, head: { kind: 'beanie', color: '#26262b' }, feet: { kind: 'trainer', color: '#e9e9ec' } },
      { label: 'Red track jacket', top: { kind: 'jacket', color: '#7a1a20', zip: true, trim: '#e9e9ec' }, bottom: { kind: 'joggers', color: '#26262b' }, head: { kind: 'beanie', color: '#16171b' }, feet: { kind: 'trainer', color: '#16171b' } },
    ],
  },
  business: {
    faction: 'street',
    label: 'Business', movement: 'limited', fists: 'bare',
    palette: [['black', 'black'], ['charcoal', 'charcoal'], ['navy', 'navy'], ['slate', 'slate']],
    // Heels (see heelFooting): a woman in them goes over more easily, and kicks with the heel.
    female: { kick: 1.2 },
    designs: [
      // A black suit; for a woman the skirt suit, in black high-heeled ankle boots with pointed toes.
      { label: 'Black suit', top: { kind: 'suit', color: '#16171b', shirt: '#f2f2f4', tie: '#8a1f2a' }, bottom: { kind: 'slacks', color: '#16171b', skirt: true }, feet: { kind: 'dressShoe', color: '#0e0d0c' }, femaleFeet: { kind: 'heelAnkleBoot', color: '#0b0b0d', heels: BUSINESS_HEELS }, extras: [{ kind: 'tie', color: '#8a1f2a' }] },
    ],
  },
  yakuza: {
    faction: 'street',
    label: 'Yakuza', movement: 'good', fists: 'bare', kick: 1.1,
    headgear: ['hat'],
    palette: [[null, 'black'], [null, 'charcoal'], [null, 'white'], [null, 'navy']],
    designs: [
      { label: 'Bare back', tattoo: 'full', bottom: { kind: 'slacks', color: '#16161a' }, feet: { kind: 'compactBoot', color: '#0e0e10' }, top: { kind: 'sportsBra', color: '#16161a', female: true } },
    ],
  },
  swat: {
    faction: 'law', bulletRating: 1500, plated: true,
    label: 'SWAT', movement: 'limited', fists: 'gloved-tactical',
    palette: [['charcoal', 'charcoal'], ['olive', 'olive'], ['slate', 'slate']],
    balance: 1.5, extraMass: 0.2,
    // The ballistic vest guards the torso: against rounds; against a blade
    // its fabric turns some of a slash and little of a point. The helmet
    // takes blows; riot pads on the limbs spread a blow but not an edge.
    protection: {
      blunt: 0.5, cut: 0.5, pierce: 0.3, bullet: { head: 0.6, torso: 0.9, limb: 0.1 },
      regions: { head: { blunt: 0.7, cut: 0.8, pierce: 0.7 }, limb: { blunt: 0.6, cut: 0.3, pierce: 0.1 } },
    },
    designs: [
      { label: 'Heavy riot', top: { kind: 'longsleeve', color: '#202226' }, bottom: { kind: 'cargo', color: '#202226' }, armor: { kind: 'heavyRiot', color: '#121316', backPrint: 'SWAT' }, head: { kind: 'riotHelmet', color: '#121316', neck: true }, feet: { kind: 'tacticalBoot', color: '#0e0e10' } },
    ],
  },
  // A patrol officer: the uniform, a soft vest (NIJ IIIA) in its carrier
  // over the shirt, the duty belt, the peaked cap. The vest stops handgun
  // rounds over the torso and little of a blade; nothing else is covered.
  police: {
    faction: 'law', bulletRating: 500,
    label: 'Police — patrol uniform', movement: 'good', fists: 'bare',
    sidearm: 'baton',
    protection: {
      blunt: 0.1, cut: 0.1, pierce: 0, bullet: { head: 0, torso: 0.5, limb: 0 },
      regions: { head: { blunt: 0, cut: 0, pierce: 0 }, limb: { blunt: 0, cut: 0, pierce: 0 } },
    },
    designs: [
      { label: 'Navy uniform', top: { kind: 'longsleeve', color: '#1c2438' }, bottom: { kind: 'slacks', color: '#161c2c' }, armor: { kind: 'patrolVest', color: '#141a28', cloth: '#141a28', gold: '#d6a743' }, head: { kind: 'policeCap', color: '#141a28', gold: '#d6a743' }, feet: { kind: 'tacticalBoot', color: '#0e0e10' } },
      { label: 'Black uniform', top: { kind: 'longsleeve', color: '#1a1a1d' }, bottom: { kind: 'slacks', color: '#141416' }, armor: { kind: 'patrolVest', color: '#101012', cloth: '#101012', gold: '#c0c4cc' }, head: { kind: 'policeCap', color: '#101012', gold: '#c0c4cc' }, feet: { kind: 'tacticalBoot', color: '#0e0e10' } },
    ],
  },
  // A riot officer: a helmet with a clear visor and a neck guard, a padded
  // riot suit over a stab vest (torso, shoulders, forearms and shins padded
  // hard), heavy boots. It spreads a blow and turns an edge; not a round.
  riot: {
    faction: 'law', bulletRating: 300,
    label: 'Riot officer', movement: 'limited', fists: 'gloved-tactical',
    sidearm: 'baton',
    extraMass: 0.18,
    protection: {
      blunt: 0.55, cut: 0.6, pierce: 0.4, bullet: { head: 0.2, torso: 0.3, limb: 0 },
      regions: { head: { blunt: 0.7, cut: 0.85, pierce: 0.7 }, limb: { blunt: 0.55, cut: 0.35, pierce: 0.15 } },
    },
    courage: 0.4,
    designs: [
      { label: 'Black riot suit', top: { kind: 'longsleeve', color: '#1a1b1f' }, bottom: { kind: 'cargo', color: '#1a1b1f' }, armor: { kind: 'riot', color: '#121316', backPrint: 'POLICE' }, head: { kind: 'riotHelmet', color: '#121316', neck: true }, feet: { kind: 'tacticalBoot', color: '#0e0e10' } },
      { label: 'Navy riot suit', top: { kind: 'longsleeve', color: '#1c2438' }, bottom: { kind: 'cargo', color: '#161c2c' }, armor: { kind: 'riot', color: '#141a28', backPrint: 'POLICE' }, head: { kind: 'riotHelmet', color: '#141a28', neck: true }, feet: { kind: 'tacticalBoot', color: '#0e0e10' } },
    ],
  },
  // Modern special forces: combat uniform, a plate carrier (level IV rifle
  // plates front and back, soft armour round the sides), a high-cut
  // ballistic helmet, and the load — magazines, water, radio, aid kit: some
  // 25–30 kg. Very well protected against bullets over the torso and head;
  // the limbs bare to a round and nearly so to a blade. Slow under the load.
  specialForces: {
    faction: 'law', bulletRating: 4000, plated: true,
    label: 'Special forces — plate carrier', movement: 'limited', fists: 'gloved-tactical',
    sidearm: 'dagger',
    extraMass: 0.35,
    courage: 0.5,
    protection: {
      blunt: 0.4, cut: 0.55, pierce: 0.2, bullet: { head: 0.6, torso: 0.97, limb: 0 },
      regions: { head: { blunt: 0.55, cut: 0.6, pierce: 0.4 }, limb: { blunt: 0.05, cut: 0.1, pierce: 0.05 } },
    },
    designs: [
      { label: 'Coyote carrier, green uniform', top: { kind: 'longsleeve', color: '#5a5e44' }, bottom: { kind: 'cargo', color: '#4e523c' }, armor: { kind: 'plateCarrier', color: '#7a6a4a', cloth: '#7a6a4a', cloth2: '#4a3e2a' }, head: { kind: 'opsHelmet', color: '#6a5e44' }, feet: { kind: 'tacticalBoot', color: '#5a4a32' } },
      { label: 'Black carrier, grey uniform', top: { kind: 'longsleeve', color: '#4a4c50' }, bottom: { kind: 'cargo', color: '#3a3c40' }, armor: { kind: 'plateCarrier', color: '#1c1d20', cloth: '#1c1d20', cloth2: '#2c2d31' }, head: { kind: 'opsHelmet', color: '#1c1d20' }, feet: { kind: 'tacticalBoot', color: '#141416' } },
    ],
  },
  knight: {
    faction: 'knights', bulletRating: 650, plated: true,
    label: 'Knight — full plate',
    // The breastplate is curved (the globose breast of the 15th c., the peascod of the 16th): a blow or an arrow not square on it glances.
    breastplate: 0.8,
    // Arrows glance off it.
    arrowproof: true,
    sidearm: 'dagger',
    defaultHeadgear: 'plume', movement: 'limited', fists: 'gauntlet',
    headgear: ['plume'],
    palette: [['brown', 'brown'], ['wine', 'black'], ['navy', 'charcoal'], ['forest', 'brown']],
    extraMass: 0.5,
    // Plate against blunt force spreads it; against an edge it is proof,
    // against a point nearly so, and a blade that meets it glances off.
    protection: { blunt: 0.6, cut: 1, pierce: 0.9, bullet: { head: 0.4, torso: 0.7, limb: 0.3 } },
    // A full harness leaves no gap an edge can find (its gaps are for a point: BLADES.gaps).
    cutProof: true,
    courage: 0.4,
    deflects: true,
    family: 'knight',
    // The designs in play (picked from the five); the game shuffles among them.
    picked: [0, 1, 2],
    designs: [
      // The gothic shape — fluted plate, pointed bascinet — in bright polished steel.
      { label: 'Gothic plate', top: { kind: 'longsleeve', color: '#2a2622' }, bottom: { kind: 'tights', color: '#1e1b18' }, armor: { kind: 'plate', color: '#b7bcc4', fluted: true }, head: { kind: 'bascinet', color: '#b7bcc4', pointed: true }, feet: { kind: 'sabaton', color: '#b7bcc4' } },
      plateDesign('Milanese', '#a7adb6', false, false, '#3a2a22'),
      plateDesign('Blackened', '#3a3d42', true, true, '#1c1a18'),
      plateDesign('Bright, wine arming coat', '#c4c9d0', true, false, '#5a1a22'),
      plateDesign('Russeted', '#7a5a42', false, true, '#2a2622'),
    ],
  },
  // Joan of Arc: a full white harness (polished, unpainted plate: "armure
  // blanche", made for her at Tours in 1429), bareheaded as she is painted,
  // and over the plate the huque of crimson cloth the Duke of Orléans gave
  // her. The plate's protection, the head bare.
  joan: {
    faction: 'knights', bulletRating: 650, plated: true,
    label: 'Joan of Arc — white harness', arrowproof: true, sidearm: 'dagger', movement: 'limited', fists: 'gauntlet',
    // The breastplate is curved (the globose breast of the 15th c., the peascod of the 16th): a blow or an arrow not square on it glances.
    breastplate: 0.8,
    cutProof: true,
    extraMass: 0.45,
    protection: { blunt: 0.6, cut: 1, pierce: 0.9, bullet: { head: 0, torso: 0.7, limb: 0.3 }, regions: { head: ARENA.bare } },
    courage: 0.6,
    deflects: true,
    designs: [
      { label: 'White harness, crimson huque', special: true, top: { kind: 'longsleeve', color: '#4a1a1e' }, bottom: { kind: 'tights', color: '#2e2420' }, armor: { kind: 'plate', color: '#d4d8de', fluted: false, over: 'huque', cloth: '#8c1c26', cloth2: '#c9a24a' }, feet: { kind: 'sabaton', color: '#d4d8de' } },
    ],
  },
  // A brother-knight of the Temple (c. 1180–1300): a full mail hauberk with
  // its coif and mittens over a quilted gambeson, mail chausses with plain
  // steel greaves and knee cops, under the Order's long surcoat with its red
  // cross and the great mantle; on the head a padded arming cap, the coif,
  // and over all the flat-topped great helm. So: the head guarded against
  // everything (a steel box over padding and mail); the body and limbs well
  // against an edge (mail turns a cut), less against a point (rings part to
  // it), poorly against a blow (mail moves with it: only the gambeson takes
  // a little); the legs a little better for the greaves.
  templar: {
    faction: 'knights',
    // No `family`: never dealt at random (the flagship's own, too detailed for a crowd).
    label: 'Knights Templar — mail, surcoat and great helm', movement: 'limited', fists: 'gauntlet',
    arrowproof: true,
    sidearm: 'dagger',
    extraMass: 0.4,
    // The great helm: another man's head stays outside it in a clinch.
    headBulk: 1.45,
    protection: {
      blunt: 0.3, cut: 0.88, pierce: 0.5, bullet: { head: 0.35, torso: 0.05, limb: 0 },
      regions: {
        head: { blunt: 0.7, cut: 0.97, pierce: 0.85, deflects: true },
        Shank: { blunt: 0.45, cut: 0.95, pierce: 0.7 },
      },
    },
    courage: 0.55,
    designs: [
      templarDesign('Knight brother (white)', '#ece8dc', '#a2201e', null),
      templarDesign('Sergeant brother (black)', '#1c1a1c', '#a2201e', null),
      templarDesign('Beauséant (black and white)', '#ece8dc', '#1c1a1c', 'pale'),
    ],
  },
  // A foot soldier: whatever he could get — a brigandine (plates riveted
  // inside cloth), a mail shirt, or a breastplate — over a quilted coat,
  // and a kettle hat. Never full cover; light enough to march in.
  footman: {
    faction: 'knights',
    label: 'Foot soldier', family: 'knight', movement: 'good', fists: 'bare',
    sidearm: 'shortSword',
    extraMass: 0.22,
    protection: { blunt: 0.4, cut: 0.75, pierce: 0.6, bullet: { head: 0.35, torso: 0.35, limb: 0 } },
    courage: 0.25,
    designs: [
      footmanDesign('Brigandine, red velvet', 'brigandine', '#7a1a22', '#c8b48a', { brim: 1.9 }),
      footmanDesign('Brigandine, blue', 'brigandine', '#1f2f5a', '#b8a888', { brim: 1.75, tall: true }),
      footmanDesign('Mail shirt', 'haubergeon', '#5a4a30', '#b8a888', { brim: 2.0, coif: true }),
      footmanDesign('Breastplate', 'breastplate', '#6a1e22', '#a89070', { brim: 1.8, tall: true }),
      footmanDesign('Brigandine, black', 'brigandine', '#1c1c20', '#8a7a60', { brim: 1.85, tall: true, coif: true }),
    ],
  },
  // Lamellar: small lacquered steel scales laced in rows, in red. Proof
  // against most cuts, good against points; lighter than plate.
  samurai: {
    faction: 'japanese', plated: true,
    label: 'Samurai — ō-yoroi', family: 'samurai', movement: 'good', fists: 'bare',
    // Arrows glance off it.
    arrowproof: true,
    sidearm: 'wakizashi',
    picked: [0, 1, 2, 3],
    headgear: ['crest'],
    defaultHeadgear: 'crest',
    palette: [['black', 'black'], ['wine', 'wine'], ['navy', 'charcoal'], ['forest', 'black']],
    extraMass: 0.4,
    protection: { blunt: 0.7, cut: 0.9, pierce: 0.6, bullet: { head: 0.3, torso: 0.4, limb: 0 } },
    courage: 0.4,
    designs: [
      { label: 'Crescent', top: { kind: 'longsleeve', color: '#1c1d26' }, bottom: { kind: 'pants', color: '#23202b' }, armor: { kind: 'lamellar', color: '#b3161b', lace: '#1d2a4f', gold: '#d6a743', panel: true, leather: '#5a3a22', trim: true }, head: { kind: 'kabuto', color: '#b3161b', crest: 'crescent', lace: '#1d2a4f', gold: '#d6a743' }, feet: { kind: 'tabi', color: '#1a1b22' } },
      { label: 'Golden horns', top: { kind: 'longsleeve', color: '#141416' }, bottom: { kind: 'pants', color: '#1a1a1d' }, armor: { kind: 'lamellar', color: '#b3161b', lace: '#121214', gold: '#d6a743', sode: 1.25, panel: true, leather: '#3a2a3a', trim: true }, head: { kind: 'kabuto', color: '#b3161b', crest: 'kuwagata', mask: 'red', lace: '#121214', gold: '#d6a743' }, feet: { kind: 'tabi', color: '#141416' } },
      { label: 'Sun disc', top: { kind: 'longsleeve', color: '#2a2a30' }, bottom: { kind: 'pants', color: '#2a2a30' }, armor: { kind: 'lamellar', color: '#b3161b', lace: '#e8e4da', gold: '#d6a743', panel: true, leather: '#6a4a2a', trim: true }, head: { kind: 'kabuto', color: '#17171a', crest: 'sun', lace: '#e8e4da', gold: '#d6a743' }, feet: { kind: 'tabi', color: '#e8e4da' } },
      { label: 'Daimyo', top: { kind: 'longsleeve', color: '#3a1012' }, bottom: { kind: 'pants', color: '#2a0c0e' }, armor: { kind: 'lamellar', color: '#b3161b', lace: '#d6a743', gold: '#d6a743', sode: 1.3, panel: true, leather: '#2a3a5a', trim: true }, head: { kind: 'kabuto', color: '#b3161b', crest: 'tall', mask: 'red', lace: '#d6a743', gold: '#d6a743' }, feet: { kind: 'tabi', color: '#1a1b22' } },
      { label: 'Antlers', top: { kind: 'longsleeve', color: '#16201a' }, bottom: { kind: 'pants', color: '#1a221c' }, armor: { kind: 'lamellar', color: '#b3161b', lace: '#2f5a3a', gold: '#d6a743', panel: true, leather: '#4a3a1a', trim: true }, head: { kind: 'kabuto', color: '#b3161b', crest: 'antlers', mask: 'black', lace: '#2f5a3a', gold: '#d6a743' }, feet: { kind: 'tabi', color: '#16201a' } },
    ],
  },
  // Ō-yoroi, the great armour of the Heian and Kamakura mounted archer: a
  // box of lacquered lamellae laced in silk (odoshi) round the trunk, its
  // right side a separate plate (waidate); four great square skirt panels
  // (kusazuri); two broad flat shoulder boards (sode) hung from the shoulder
  // straps to shield the arms when the bow is drawn; a kabuto with a wide
  // flaring neck guard and its turnbacks. Made to turn arrows on a horse, not
  // to close every opening: the sword arm is in its robe sleeve alone, the
  // bow arm in a mailed sleeve (kote), the thighs bare under the skirt
  // (no haidate yet), only shin guards (suneate) below. So: the box and the
  // helmet proof against most cuts, the limbs open (`regions`), and a blade
  // finds the openings of the box (armpits, the waidate's seam, under the
  // skirt) more often than in later armour (`gaps`).
  oyoroi: {
    faction: 'japanese', plated: true,
    // No `family`: never dealt to a samurai at random (it is the flagship's own, too detailed for a crowd).
    label: 'Ō-yoroi (great armour)', movement: 'good', fists: 'bare',
    arrowproof: true,
    sidearm: 'wakizashi',
    headgear: ['crest'],
    defaultHeadgear: 'crest',
    extraMass: 0.42,
    protection: {
      blunt: 0.7, cut: 0.9, pierce: 0.6, bullet: { head: 0.3, torso: 0.4, limb: 0 },
      regions: {
        head: { blunt: 0.62, cut: 0.88, pierce: 0.55 },
        // The sode over the upper arms: a board hung beside the arm, not round it.
        UpperArm: { blunt: 0.3, cut: 0.45, pierce: 0.25 },
        lForearm: { blunt: 0.2, cut: 0.6, pierce: 0.3 },
        rForearm: { blunt: 0.05, cut: 0.08, pierce: 0.04 },
        Thigh: { blunt: 0.05, cut: 0.08, pierce: 0.04 },
        Shank: { blunt: 0.4, cut: 0.75, pierce: 0.4 },
      },
    },
    gaps: { thrust: 0.35, swing: 0.12 },
    courage: 0.45,
    designs: [
      oyoroiDesign('Scarlet laced (aka-ito)', { lacquer: '#16141a', lace: '#c0281e', gold: '#d6a743', leather: '#5a4430', stencil: '#d8c08a', robe: '#b83a1c', hakama: '#8e2a16', crest: 'kuwagataTall' }),
      oyoroiDesign('Gold and orange', { lacquer: '#3a2210', lace: '#d9822b', gold: '#e3b34c', leather: '#7a5636', stencil: '#e8c890', robe: '#5a2414', hakama: '#4a1c10', crest: 'kuwagataTall' }),
      oyoroiDesign('Red with a white breast', { lacquer: '#8e1c16', lace: '#c42a20', gold: '#d6a743', leather: '#f0ece0', stencil: '#7088b0', robe: '#d0562a', hakama: '#c4502a', sleeve: '#5f9a4a', crest: 'kuwagataTall' }),
    ],
  },
  // Tōsei gusoku: the later armour, a solid riveted cuirass of horizontal
  // steel lames, laced skirt and sleeves, and the menpo war mask. Better
  // than ō-yoroi against points and bullets, and heavier.
  samuraiTosei: {
    faction: 'japanese', bulletRating: 900, plated: true,
    label: 'Samurai — tōsei gusoku', family: 'samurai', movement: 'good', fists: 'bare',
    // Arrows glance off it.
    arrowproof: true,
    sidearm: 'wakizashi',
    headgear: ['crest'],
    defaultHeadgear: 'crest',
    palette: [['black', 'black'], ['wine', 'wine'], ['navy', 'charcoal'], ['forest', 'black']],
    extraMass: 0.45,
    protection: { blunt: 0.75, cut: 0.95, pierce: 0.7, bullet: { head: 0.4, torso: 0.55, limb: 0.15 } },
    courage: 0.4,
    designs: [
      toseiDesign('Iron', '#3b3e44', '#1d2a4f', 'crescent', 'black', '#1c1d26'),
      toseiDesign('Russet', '#6b4a32', '#2a1a10', 'kuwagata', 'red', '#2a1f18'),
      toseiDesign('Black lacquer', '#17171a', '#b3161b', 'tall', 'black', '#141416'),
      toseiDesign('Silver', '#9aa0a8', '#1d2a4f', 'sun', 'black', '#23202b'),
      toseiDesign('Blued steel', '#2c3a4a', '#d6a743', 'antlers', 'red', '#16201a'),
      // Kojima's own (`special`: his alone, never dealt at random; the same
      // tōsei gusoku, the same protection): red lacquer laced black, the
      // kabuto dressed all round in grey yak hair (shaguma, as Edo-period
      // helmets were), and a black oni face (a full somen).
      { ...toseiDesign('Oni', '#8e1c16', '#141416', null, 'oni', '#2a0c0e'), special: true, head: { kind: 'kabuto', color: '#8e1c16', mask: 'oni', hair: '#7a766f', lace: '#141416', gold: '#c9a24a' } },
    ],
  },
  // Ashigaru: a foot soldier's plain lacquered okegawa-do, short skirt,
  // cloth sleeves, the jingasa hat; less protection, lighter, quicker.
  ashigaru: {
    faction: 'japanese',
    label: 'Ashigaru', family: 'samurai', movement: 'good', fists: 'bare',
    sidearm: 'wakizashi',
    picked: [0, 1, 2],
    extraMass: 0.2,
    protection: { blunt: 0.5, cut: 0.7, pierce: 0.5, bullet: { head: 0.2, torso: 0.25, limb: 0.05 } },
    courage: 0.2,
    designs: [
      ashigaruDesign('Black', '#16161a', '#3a2a1c', '#d6a743', '#2a2a30'),
      ashigaruDesign('Vermilion', '#a8261c', '#1a1a1d', '#e8e2d2', '#2a2420'),
      ashigaruDesign('Brown', '#4a3020', '#1a1a1d', '#d6a743', '#3a3326'),
      ashigaruDesign('Indigo', '#1f2a4a', '#d8d0c0', '#e8e2d2', '#1f2430'),
      ashigaruDesign('Green', '#22382a', '#1a1a1d', '#d6a743', '#2a3026'),
    ],
  },
  // A gladiator armed as a Greek hoplite: little armour over a bare body.
  hoplomachus: {
    faction: 'gladiators',
    label: 'Gladiator — hoplomachus', movement: 'good', fists: 'bare',
    palette: [[null, 'cream'], [null, 'undyed'], [null, 'wine'], [null, 'rust']],
    extraMass: 0.3,
    // A quilted manica on the spear arm, quilted leggings and two high greaves; the chest bare.
    protection: { blunt: 0, cut: 0, pierce: 0, bullet: { head: 0.3, torso: 0, limb: 0.15 }, regions: { head: ARENA.helm, rUpperArm: ARENA.quilt, rForearm: ARENA.quilt, Thigh: ARENA.quilt, Shank: ARENA.greave } },
    courage: 0.25,
    family: 'gladiator',
    designs: GLADIATOR_LOOKS.map((look) => gladiatorDesign('hoplomachus', look, { kind: 'arenaHelm', style: 'hoplomachus', plume: look.plume, feather: '#f0ece4' }, { barefoot: true })),
  },
  // Murmillo: the big fish-crested helmet with its grille, a manica on the
  // sword arm, a short greave: the head well kept, the body bare.
  murmillo: {
    faction: 'gladiators',
    label: 'Gladiator — murmillo', family: 'gladiator', movement: 'good', fists: 'bare',
    palette: [[null, 'cream'], [null, 'undyed'], [null, 'wine'], [null, 'rust']],
    extraMass: 0.32,
    // The great helmet, the manica on the sword arm, one greave on the forward (left) leg; the rest bare.
    protection: { blunt: 0, cut: 0, pierce: 0, bullet: { head: 0.35, torso: 0, limb: 0.1 }, regions: { head: ARENA.helm, rUpperArm: ARENA.manica, rForearm: ARENA.manica, lShank: ARENA.greave, lThigh: ARENA.quilt, rShank: ARENA.wrap } },
    courage: 0.25,
    designs: GLADIATOR_LOOKS.map((look) => gladiatorDesign('murmillo', look, { kind: 'arenaHelm', style: 'murmillo', plume: look.plume })),
  },
  // Secutor: the smooth egg helmet that nothing catches on, manica, high greave.
  secutor: {
    faction: 'gladiators',
    label: 'Gladiator — secutor', family: 'gladiator', movement: 'good', fists: 'bare',
    palette: [[null, 'cream'], [null, 'undyed'], [null, 'wine'], [null, 'rust']],
    extraMass: 0.32,
    // The smooth helmet, the manica, one greave higher up the forward leg; the rest bare.
    protection: { blunt: 0, cut: 0, pierce: 0, bullet: { head: 0.4, torso: 0, limb: 0.1 }, regions: { head: ARENA.smoothHelm, rUpperArm: ARENA.manica, rForearm: ARENA.manica, lShank: ARENA.greave, lThigh: ARENA.quilt, rShank: ARENA.wrap } },
    courage: 0.25,
    designs: GLADIATOR_LOOKS.map((look) => gladiatorDesign('secutor', look, { kind: 'arenaHelm', style: 'secutor' })),
  },
  // Retiarius: the net-fighter, almost naked: no helmet, the galerus on the
  // left shoulder and a manica on that arm. Fast, and easily hurt.
  retiarius: {
    faction: 'gladiators',
    label: 'Gladiator — retiarius', family: 'gladiator', movement: 'excellent', fists: 'bare',
    palette: [[null, 'cream'], [null, 'undyed'], [null, 'wine'], [null, 'rust']],
    extraMass: 0.08,
    // No helmet: the galerus standing up from the left shoulder, a manica on that arm, wrapped shins; nothing else.
    protection: { blunt: 0, cut: 0, pierce: 0, bullet: { head: 0, torso: 0, limb: 0.05 }, regions: { lUpperArm: ARENA.galerus, lForearm: ARENA.manica, Shank: ARENA.wrap } },
    courage: 0.15,
    designs: GLADIATOR_LOOKS.map((look) => gladiatorDesign('retiarius', look, null, { barefoot: true })),
  },
  // Thraex: the griffin-crested brimmed helmet, quilted wraps and high
  // greaves on both legs, manica: the legs best kept of any.
  thraex: {
    faction: 'gladiators',
    label: 'Gladiator — thraex', family: 'gladiator', movement: 'good', fists: 'bare',
    palette: [[null, 'cream'], [null, 'undyed'], [null, 'wine'], [null, 'rust']],
    extraMass: 0.3,
    // The griffin helmet, the manica, quilted thighs under two high greaves; the chest bare.
    protection: { blunt: 0, cut: 0, pierce: 0, bullet: { head: 0.3, torso: 0, limb: 0.2 }, regions: { head: ARENA.helm, rUpperArm: ARENA.manica, rForearm: ARENA.manica, Thigh: ARENA.highGreave, Shank: ARENA.greave } },
    courage: 0.25,
    designs: GLADIATOR_LOOKS.map((look) => gladiatorDesign('thraex', look, { kind: 'arenaHelm', style: 'thraex', plume: look.plume, feather: look.plume }, { barefoot: true })),
  },
  // Maximus: a cuirass of dark leather, layered and strapped, buckled at
  // the shoulders and across the chest; a leather guard on the left
  // shoulder; three straps for a belt over studded hanging strips
  // (pteruges); a blue-grey tunic to the thigh; leather bracers. Leather
  // turns a cut, less a point, and a blow hardly at all; the head bare.
  maximus: {
    faction: 'gladiators',
    label: 'Gladiator — the general', movement: 'good', fists: 'bare',
    extraMass: 0.12,
    protection: { blunt: 0.3, cut: 0.6, pierce: 0.42, bullet: { head: 0, torso: 0.1, limb: 0 }, regions: { head: ARENA.bare, limb: ARENA.bare, lUpperArm: { blunt: 0.35, cut: 0.65, pierce: 0.45 }, Forearm: { blunt: 0.25, cut: 0.5, pierce: 0.3 }, Thigh: { blunt: 0.1, cut: 0.25, pierce: 0.1 } } },
    courage: 0.45,
    designs: [
      { label: 'Leather and blue-grey', special: true, top: { kind: 'tunic', color: '#6c7a87' }, bottom: { kind: 'loincloth', color: '#8e9aa6' }, armor: { kind: 'maximus', color: '#2b2420', lace: '#3d3127', gold: '#b98a3e' }, feet: { kind: 'sandal', color: '#2e2016' } },
    ],
  },
  // Commodus as Hercules Romanus, as his bust on the Capitoline shows him:
  // the lion's scalp over his head, its upper jaw on his brow, the pelt down
  // his back and its forelegs knotted on his chest; a white loincloth edged
  // in gold, gilt sandals. The pelt turns a little; the rest is bare.
  commodus: {
    faction: 'gladiators',
    label: 'Commodus — as Hercules', movement: 'good', fists: 'bare',
    extraMass: 0.06,
    protection: { blunt: 0.08, cut: 0.15, pierce: 0.08, bullet: { head: 0, torso: 0, limb: 0 }, regions: { head: { blunt: 0.2, cut: 0.4, pierce: 0.25 }, limb: ARENA.bare } },
    courage: 0.5,
    designs: [
      { label: 'Lion skin and club', special: true, bottom: { kind: 'loincloth', color: '#efe9dc', trim: '#c9a24a' }, armor: { kind: 'commodus', color: '#b8894a', lace: '#6e4a24', gold: '#c9a24a' }, head: { kind: 'lionHead', color: '#b8894a', mane: '#6e4a24' }, feet: { kind: 'sandal', color: '#8a6a32' } },
    ],
  },
  // A lorarius: one of the arena's attendants who drove reluctant fighters
  // on with the lash; a plain belted tunic, sandals, no armour.
  lorarius: {
    faction: 'gladiators',
    label: 'Lorarius — the arena\'s whip-man', movement: 'good', fists: 'bare',
    sidearm: 'dagger',
    protection: { blunt: 0.02, cut: 0.04, pierce: 0, bullet: { head: 0, torso: 0, limb: 0 } },
    courage: 0.2,
    designs: [
      { label: 'Undyed tunic', special: true, top: { kind: 'tunic', color: '#b9a57e' }, bottom: { kind: 'loincloth', color: '#a8936c' }, feet: { kind: 'sandal', color: '#3a2416' } },
    ],
  },
  // The scissor: a coat of bronze scales to the hips, the smooth helmet, the
  // left arm cased in the steel tube of the scissores, a manica on the sword
  // arm, greaves on both shins; the thighs bare.
  scissor: {
    faction: 'gladiators',
    label: 'Gladiator — scissor', family: 'gladiator', movement: 'good', fists: 'bare',
    palette: [[null, 'cream'], [null, 'undyed'], [null, 'wine'], [null, 'rust']],
    extraMass: 0.38,
    protection: { ...ARENA.scale, bullet: { head: 0.4, torso: 0.3, limb: 0.1 }, regions: { head: ARENA.smoothHelm, limb: ARENA.bare, rUpperArm: ARENA.manica, rForearm: ARENA.manica, lForearm: ARENA.tube, lUpperArm: ARENA.manica, Shank: ARENA.greave } },
    courage: 0.3,
    designs: GLADIATOR_LOOKS.map((look) => gladiatorDesign('scissor', look, { kind: 'arenaHelm', style: 'scissor' })),
  },
  // Ming garrison: a padded cotton coat and a red cloth head wrap. Little
  // protection beyond the padding; quick on his feet.
  mingGarrison: {
    faction: 'chinese',
    label: 'Ming — garrison', family: 'chinese', movement: 'good', fists: 'bare',
    // No sidearm: a garrison man who loses his weapon fights with his hands.
    extraMass: 0.06,
    protection: { blunt: 0.1, cut: 0.1, pierce: 0.05 },
    courage: 0,
    designs: [
      mingGarrisonDesign('Red coat', '#a3241e', '#2a2622'),
      mingGarrisonDesign('Blue coat', '#2a3a6a', '#2a2622'),
      mingGarrisonDesign('Ochre coat', '#b0862e', '#3a3326'),
      mingGarrisonDesign('Brown coat', '#6a4428', '#2a2622'),
      mingGarrisonDesign('Faded red', '#b5574a', '#3a3326'),
    ],
  },
  // Ming brigandine: plates riveted inside a long coat, steel bracers, an
  // iron helmet with a wide brim; a regular army's kit, better than a
  // levy's, never full cover.
  mingBrigandine: {
    faction: 'chinese',
    label: 'Ming — brigandine', family: 'chinese', movement: 'good', fists: 'bare',
    sidearm: 'dao',
    spare: 'dagger',
    extraMass: 0.26,
    protection: { blunt: 0.6, cut: 0.7, pierce: 0.5, bullet: { head: 0.3, torso: 0.5, limb: 0 } },
    courage: 0.2,
    designs: [
      mingBrigandineDesign('Red', '#9a1f1a', '#8f949b'),
      mingBrigandineDesign('Blue', '#22356a', '#8f949b'),
      mingBrigandineDesign('Black', '#1c1c20', '#6f747c'),
      mingBrigandineDesign('Iron lamellar, red lacing', '#2a2622', '#8f949b', { kind: 'mingLamellar', lace: '#9a1f1a' }),
      mingBrigandineDesign('Black lamellar, blue lacing', '#1c1c20', '#3a3c42', { kind: 'mingLamellar', lace: '#22356a' }),
    ],
  },
  // Ming elite: the long brigandine coat to the knee reinforced with plates,
  // a mirror plate on the chest, a throat collar, segmented arm guards, a
  // steel bowl helmet with a padded coif — or a steel neck guard and a steel
  // face mask. Covered from head to knee: a blade glances off it as off a
  // knight's plate, and so do arrows.
  mingElite: {
    faction: 'chinese', bulletRating: 650, plated: true,
    label: 'Ming — elite brigandine', family: 'chinese', movement: 'good', fists: 'bare',
    sidearm: 'dao',
    spare: 'dagger',
    deflects: true,
    arrowproof: true,
    extraMass: 0.45,
    protection: { blunt: 0.65, cut: 0.95, pierce: 0.8, bullet: { head: 0.4, torso: 0.5, limb: 0.2 } },
    courage: 0.35,
    designs: [
      mingEliteDesign('Crimson', '#8a1418', '#1f2a4a', '#a7adb6'),
      mingEliteDesign('Imperial blue, steel neck guard', '#1f2f6a', '#7a1418', '#a7adb6', { neck: 'steel' }),
      mingEliteDesign('Black and gold, masked', '#18181c', '#5a1a14', '#8f949b', { neck: 'steel', mask: true }),
      mingEliteDesign('Gilt scale', '#5a1a14', '#7a1418', '#b8a066', {}, { kind: 'mingScale', lace: '#3a2016' }),
      mingEliteDesign('Steel scale, masked', '#1c1c20', '#1f2a4a', '#a7adb6', { neck: 'steel', mask: true }, { kind: 'mingScale', lace: '#1a1c24' }),
    ],
  },
  // The Iron Pagoda (tiefutu): the Jurchen Jin's armoured heavy horse of the
  // 1120s–40s, a legend of an earlier age (not in the Ming levels). As the
  // reconstructions show it: lamellar of small dotted iron plates from the
  // shoulders to below the knee over a red robe, a tall pointed helmet with
  // a plume, and an aventail rolled up round the face so only the eyes show.
  // Fought here on foot, with the mace. The flagship of its faction, drawn in full.
  ironPagoda: {
    faction: 'chinese', plated: true,
    label: 'Iron Pagoda — Jin heavy armour', movement: 'limited', fists: 'gauntlet',
    sidearm: 'dao',
    spare: 'dagger',
    deflects: true,
    arrowproof: true,
    extraMass: 0.6,
    protection: { blunt: 0.66, cut: 0.95, pierce: 0.8, bullet: { head: 0.3, torso: 0.2, limb: 0.1 } },
    courage: 0.4,
    designs: [
      // Lamellar of dotted iron plates over a red robe, brown riding boots; the helmet a tall bowl with a plume or a horsehair tassel.
      { label: 'Polished steel, black plume', top: { kind: 'longsleeve', color: '#6a1418' }, bottom: { kind: 'pants', color: '#2a1a14' }, armor: { kind: 'ironPagoda', color: '#c3c8d0', lace: '#121214', leather: '#5a3a22', cloth: '#6a1418', cloth2: '#d8c89a', gold: '#9ea4ad' }, head: { kind: 'pagodaHelm', color: '#c3c8d0', gold: '#9ea4ad', plume: 'feathers', plumeColor: '#16161a', lace: '#111114' }, feet: { kind: 'jinBoot', color: '#4a2e1c' } },
      { label: 'Blued steel, brass edging', top: { kind: 'longsleeve', color: '#5a1014' }, bottom: { kind: 'pants', color: '#1c1a18' }, armor: { kind: 'ironPagoda', color: '#2f3846', lace: '#0e0e12', leather: '#3a2416', cloth: '#5a1014', cloth2: '#c9b27a', gold: '#c9a23a' }, head: { kind: 'pagodaHelm', color: '#2f3846', gold: '#c9a23a', plume: 'feathers', plumeColor: '#141416', lace: '#0e0e12' }, feet: { kind: 'jinBoot', color: '#3a2416' } },
      { label: 'Red horsehair tassel', top: { kind: 'longsleeve', color: '#7a1418' }, bottom: { kind: 'pants', color: '#2a1a14' }, armor: { kind: 'ironPagoda', color: '#b4bac3', lace: '#141416', leather: '#4a2e1c', cloth: '#7a1418', cloth2: '#d8c89a', gold: '#c9a23a' }, head: { kind: 'pagodaHelm', color: '#b4bac3', gold: '#c9a23a', plume: 'tassel', plumeColor: '#b3161b', lace: '#141416' }, feet: { kind: 'jinBoot', color: '#4a2e1c' } },
    ],
  },
  // Guan Yu, as the temples and the opera show him: the green robe
  // (zhanpao) over gilt scale armour, the scale at the shoulders and arms, a green soft cap tied at the
  // back, black boots. The scale is a general's; the head is in cloth.
  guanYu: {
    faction: 'chinese', plated: true,
    label: 'Guan Yu — green robe over gilt scale', movement: 'good', fists: 'bare',
    sidearm: 'dao',
    deflects: true,
    arrowproof: true,
    extraMass: 0.42,
    protection: { blunt: 0.62, cut: 0.92, pierce: 0.78, bullet: { head: 0.05, torso: 0.4, limb: 0.15 }, regions: { head: { blunt: 0.08, cut: 0.15, pierce: 0.05 } } },
    courage: 0.6,
    designs: [
      { label: 'Green robe, gilt scale', special: true, top: { kind: 'longsleeve', color: '#2a5636' }, bottom: { kind: 'pants', color: '#1c1a18' }, armor: { kind: 'guanYu', color: '#a8853e', cloth: '#2f6a3e', cloth2: '#1f4a2c', lace: '#4a3418', gold: '#d6a743' }, head: { kind: 'guanYuCap', color: '#2f6a3e', gold: '#d6a743' }, feet: { kind: 'compactBoot', color: '#141416' } },
    ],
  },
  // A Han soldier (2nd–1st century BC), as the Yangjiawan figures and the
  // tomb finds show him: a vest of small iron lamellae over a red robe to
  // the knee, a black cloth cap over the topknot, trousers and shoes. The
  // lamellae turn cuts and most points over the trunk; the rest is cloth.
  hanSoldier: {
    faction: 'chinese',
    label: 'Han soldier — iron lamellar', movement: 'good', fists: 'bare',
    // Han crossbowmen stood in ranks and shot, the ranks relieving each other; they held their ground.
    drill: { advance: false },
    sidearm: 'jian',
    extraMass: 0.18,
    // The head: an iron lamellar helmet over a padded cap (the Linzi helmet):
    // iron plates turn an edge almost as the coat does; a point finds the
    // lacing a little more often, and a blow is felt through the small
    // plates more than through a one-piece bowl. The face is open.
    protection: { blunt: 0.4, cut: 0.82, pierce: 0.62, bullet: { head: 0, torso: 0.15, limb: 0 }, regions: { head: { blunt: 0.3, cut: 0.75, pierce: 0.5 }, limb: { blunt: 0.04, cut: 0.08, pierce: 0.03 } } },
    courage: 0.3,
    designs: [
      { label: 'Red robe, iron lamellar', top: { kind: 'longsleeve', color: '#8a2a20' }, bottom: { kind: 'pants', color: '#2a2420' }, armor: { kind: 'hanLamellar', color: '#5d6066', cloth: '#8a2a20', cloth2: '#5a1a14', lace: '#3a2a20' }, head: { kind: 'hanHelm', color: '#5d6066', lace: '#3a2a20' }, feet: { kind: 'compactBoot', color: '#1a1614' } },
    ],
  },
  // The wuxia swordsman's dress: a light robe crossed over the breast and
  // open below the waist for the legs, a sash, cloth shoes; no armour.
  wuxia: {
    faction: 'chinese',
    label: 'Wuxia — robe and sash', movement: 'good', fists: 'bare',
    protection: { blunt: 0, cut: 0.05, pierce: 0, bullet: { head: 0, torso: 0, limb: 0 } },
    courage: 0.6,
    designs: [
      { label: 'White robe, blue sash', special: true, top: { kind: 'longsleeve', color: '#e9e4d8' }, bottom: { kind: 'pants', color: '#d9d3c4' }, armor: { kind: 'wuxiaRobe', color: '#e9e4d8', cloth: '#ebe6da', cloth2: '#3f5f82' }, feet: { kind: 'compactBoot', color: '#1a1614' } },
    ],
  },
  // ---- Rome: the legions of the early Empire (1st century AD) ----
  // A legionary: the segmented iron cuirass (lorica segmentata) over a red
  // tunic, the Imperial Gallic helmet with its cheek pieces and deep neck
  // guard, the belt and its studded apron, hobnailed caligae. Iron over the
  // trunk and shoulders, the head in iron; the arms and legs bare.
  legionary: {
    faction: 'romans', plated: true,
    label: 'Legionary — lorica segmentata', movement: 'good', fists: 'bare',
    // The legion walked up in its ranks (under missiles, in the testudo: shields locked in front and overhead) and went in at a run for the last stretch (Caesar, Gallic War I.52; Cassius Dio 49.30).
    drill: { advance: true, charge: 8, testudo: true },
    sidearm: 'dagger',
    deflects: true,
    extraMass: 0.28,
    protection: { blunt: 0.55, cut: 0.95, pierce: 0.8, bullet: { head: 0.3, torso: 0.3, limb: 0 }, regions: { head: { blunt: 0.6, cut: 0.95, pierce: 0.8, deflects: true }, limb: { blunt: 0, cut: 0, pierce: 0 }, UpperArm: { blunt: 0.45, cut: 0.85, pierce: 0.6 } } },
    courage: 0.4,
    designs: [
      { label: 'Segmentata, red tunic', top: { kind: 'tunic', color: '#8a2a22' }, bottom: { kind: 'loincloth', color: '#8a2a22' }, armor: { kind: 'segmentata', color: '#a7adb6', gold: '#b98a3e', lace: '#3a2416' }, head: { kind: 'galea', color: '#a7adb6', gold: '#b98a3e' }, feet: { kind: 'sandal', color: '#3a2416' } },
    ],
  },
  // A centurion, as Marcus Caelius's tombstone shows one: a mail shirt
  // (lorica hamata) to the thigh, on his harness the phalerae (his medals)
  // and torcs, greaves, the helmet with its crest worn side to side.
  centurion: {
    faction: 'romans', plated: true,
    label: 'Centurion — mail and phalerae', movement: 'good', fists: 'bare',
    drill: { advance: true, charge: 8, testudo: true },
    sidearm: 'dagger',
    extraMass: 0.3,
    protection: { blunt: 0.4, cut: 0.92, pierce: 0.55, bullet: { head: 0.3, torso: 0.2, limb: 0 }, regions: { head: { blunt: 0.6, cut: 0.95, pierce: 0.8, deflects: true }, limb: { blunt: 0, cut: 0, pierce: 0 }, UpperArm: { blunt: 0.3, cut: 0.85, pierce: 0.45 }, Shank: { blunt: 0.5, cut: 0.95, pierce: 0.8, deflects: true } } },
    courage: 0.55,
    designs: [
      { label: 'Mail, phalerae, transverse crest', top: { kind: 'tunic', color: '#7a1a1e' }, bottom: { kind: 'loincloth', color: '#7a1a1e' }, armor: { kind: 'centurion', color: '#a7adb6', mail: '#8d9097', gold: '#c9a24a', lace: '#3a2416' }, head: { kind: 'galea', color: '#b8bec6', gold: '#c9a24a', crest: 'transverse', plume: '#b3161b' }, feet: { kind: 'sandal', color: '#3a2416' } },
    ],
  },
  // ---- The steppe, 14th–17th centuries: Mongol, Oirat and Timurid warriors,
  // from the unarmoured archer in his deel to the iron-clad lancer; and the
  // legend of the 1200s, Chinggis Khan's guard. Fought on foot here. ----
  steppeLight: {
    faction: 'steppe',
    label: 'Steppe — deel and fur hat', movement: 'good', fists: 'bare',
    sidearm: 'saber',
    designs: [
      steppeDesign('Blue deel', { kind: 'deel', color: '#2f4a7a' }, '#2f4a7a', '#d6a743', { kind: 'furHat', color: '#2f4a7a' }),
      steppeDesign('Maroon deel', { kind: 'deel', color: '#6a1f2a' }, '#6a1f2a', '#2a3a5a', { kind: 'furHat', color: '#6a1f2a' }),
      steppeDesign('Ochre deel', { kind: 'deel', color: '#a8742a' }, '#a8742a', '#3a2416', { kind: 'furHat', color: '#3a2416' }),
    ],
  },
  // Hardened leather lamellar over the deel, an iron helmet: proof against a glancing cut.
  steppeMedium: {
    faction: 'steppe',
    label: 'Steppe — leather lamellar', movement: 'good', fists: 'bare',
    sidearm: 'saber',
    extraMass: 0.15,
    protection: { blunt: 0.3, cut: 0.6, pierce: 0.45, bullet: { head: 0.1, torso: 0.15, limb: 0.05 } },
    courage: 0.2,
    designs: [
      steppeDesign('Brown leather', { kind: 'steppeLeather', color: '#5a3a22', cloth: '#5a3a22', cloth2: '#3a2416' }, '#2f4a7a', '#3a2416', { kind: 'steppeHelm', color: '#7d8088', coif: '#4a3a2a' }),
      steppeDesign('Red-lacquered leather', { kind: 'steppeLeather', color: '#7a2418', cloth: '#7a2418', cloth2: '#3a1410' }, '#3a3020', '#1c1a18', { kind: 'steppeHelm', color: '#7d8088', coif: '#3a2a20' }),
      steppeDesign('Black-lacquered leather', { kind: 'steppeLeather', color: '#24201c', cloth: '#24201c', cloth2: '#6a4a2a' }, '#5a2a1a', '#24201c', { kind: 'steppeHelm', color: '#5a5d63', coif: '#2a2420' }),
    ],
  },
  // Iron lamellar to the knees, iron bracers, a helmet with a lamellar aventail.
  steppeHeavy: {
    faction: 'steppe',
    label: 'Steppe — iron lamellar', movement: 'good', fists: 'bare',
    sidearm: 'saber',
    arrowproof: true,
    extraMass: 0.32,
    protection: { blunt: 0.5, cut: 0.88, pierce: 0.72, bullet: { head: 0.3, torso: 0.35, limb: 0.15 } },
    courage: 0.3,
    designs: [
      steppeDesign('Iron, blue laces', { kind: 'steppeLamellar', color: '#7d8088', lace: '#2a3a6a' }, '#2f4a7a', '#d6a743', { kind: 'steppeHelm', color: '#7d8088', coif: '#5a5d63', plume: '#b3161b' }),
      steppeDesign('Iron, red laces', { kind: 'steppeLamellar', color: '#6a6d73', lace: '#8a1418' }, '#3a3020', '#8a1418', { kind: 'steppeHelm', color: '#6a6d73', coif: '#4a4d52', plume: '#1c1a18' }),
      steppeDesign('Blackened iron', { kind: 'steppeLamellar', color: '#34363a', lace: '#a8742a' }, '#5a2a1a', '#a8742a', { kind: 'steppeHelm', color: '#34363a', coif: '#2a2c30', plume: '#e8e0cc' }),
    ],
  },
  // The kheshig: Chinggis Khan's guard of the 1200s, a legend of an earlier
  // age (not in the levels): gilt-bossed iron scale with broad shoulder
  // guards, the masked helmet of the Khan's own men.
  kheshig: {
    faction: 'steppe',
    label: 'Kheshig — the Khan\'s guard', movement: 'good', fists: 'bare',
    sidearm: 'mace',
    arrowproof: true,
    extraMass: 0.38,
    protection: { blunt: 0.55, cut: 0.92, pierce: 0.8, bullet: { head: 0.4, torso: 0.4, limb: 0.2 } },
    courage: 0.4,
    designs: [
      steppeDesign('Gilt scale, black deel', { kind: 'kheshig', color: '#8f949b', lace: '#1c1a18' }, '#1c1a18', '#d6a743', { kind: 'steppeHelm', color: '#8f949b', coif: '#6a6d73', plume: '#1c1a18', mask: true, gold: '#d6a743' }),
      steppeDesign('Black scale, red deel', { kind: 'kheshig', color: '#34363a', lace: '#8a1418' }, '#7a1418', '#d6a743', { kind: 'steppeHelm', color: '#34363a', coif: '#2a2c30', plume: '#b3161b', mask: true, gold: '#d6a743' }),
    ],
  },
  // ---- The Ottomans, 15th–17th centuries: the azap (light infantry, bow
  // and spear), the Janissary (the Sultan's household infantry, its yatagan
  // and its guns), the heavy man in mail-and-plate; and the legend of the
  // 1300s, an alp of Osman's frontier warriors. ----
  azap: {
    faction: 'ottomans',
    label: 'Ottoman — azap', movement: 'good', fists: 'bare',
    sidearm: 'saber',
    designs: [
      { label: 'Red tunic, white turban', top: { kind: 'tunic', color: '#8a2a22' }, bottom: { kind: 'pants', color: '#3a2a22' }, head: { kind: 'turban', color: '#ece4d0', cap: '#8a2a22' }, feet: { kind: 'compactBoot', color: '#5a3a22' } },
      { label: 'Green tunic', top: { kind: 'tunic', color: '#3a5a32' }, bottom: { kind: 'pants', color: '#2a2622' }, head: { kind: 'turban', color: '#ece4d0', cap: '#3a5a32' }, feet: { kind: 'compactBoot', color: '#5a3a22' } },
      { label: 'Undyed tunic, red cap', top: { kind: 'tunic', color: '#c8bc9e' }, bottom: { kind: 'pants', color: '#3a2a22' }, head: { kind: 'turban', color: '#b3161b', cap: '#b3161b' }, feet: { kind: 'compactBoot', color: '#3a2416' } },
    ],
  },
  janissary: {
    faction: 'ottomans',
    label: 'Ottoman — Janissary', movement: 'good', fists: 'bare',
    sidearm: 'yatagan',
    spare: 'dagger',
    courage: 0.15,
    designs: [
      { label: 'Blue dolama', top: { kind: 'longsleeve', color: '#2a3a6a' }, bottom: { kind: 'pants', color: '#8a1418' }, armor: { kind: 'dolama', color: '#2a3a6a', cloth: '#2a3a6a', cloth2: '#1c2850', lace: '#b3161b' }, head: { kind: 'bork', color: '#f0ece4', gold: '#d6a743' }, feet: { kind: 'compactBoot', color: '#b08a2a' } },
      { label: 'Red dolama', top: { kind: 'longsleeve', color: '#8a1418' }, bottom: { kind: 'pants', color: '#2a3a6a' }, armor: { kind: 'dolama', color: '#8a1418', cloth: '#8a1418', cloth2: '#5a0e10', lace: '#2a3a6a' }, head: { kind: 'bork', color: '#f0ece4', gold: '#d6a743' }, feet: { kind: 'compactBoot', color: '#b08a2a' } },
      { label: 'Green dolama', top: { kind: 'longsleeve', color: '#2f5a3a' }, bottom: { kind: 'pants', color: '#e4dcc8' }, armor: { kind: 'dolama', color: '#2f5a3a', cloth: '#2f5a3a', cloth2: '#1c3a24', lace: '#8a1418' }, head: { kind: 'bork', color: '#f0ece4', gold: '#d6a743' }, feet: { kind: 'compactBoot', color: '#8a1418' } },
    ],
  },
  // Mail-and-plate (krug): rows of small plates riveted into a mail shirt,
  // mail to the thighs, iron vambraces, and the turban helmet (chichak).
  ottomanHeavy: {
    faction: 'ottomans',
    label: 'Ottoman — mail and plate', movement: 'good', fists: 'bare',
    sidearm: 'saber',
    arrowproof: true,
    extraMass: 0.3,
    protection: { blunt: 0.5, cut: 0.92, pierce: 0.75, bullet: { head: 0.3, torso: 0.4, limb: 0.2 } },
    courage: 0.3,
    designs: [
      { label: 'Steel, red kaftan', top: { kind: 'longsleeve', color: '#8a1418' }, bottom: { kind: 'pants', color: '#3a1012' }, armor: { kind: 'krug', color: '#a7adb6' }, head: { kind: 'chichak', color: '#a7adb6', gold: '#d6a743' }, feet: { kind: 'compactBoot', color: '#b08a2a' } },
      { label: 'Gilt, blue kaftan', top: { kind: 'longsleeve', color: '#2a3a6a' }, bottom: { kind: 'pants', color: '#1c2238' }, armor: { kind: 'krug', color: '#b8a066' }, head: { kind: 'chichak', color: '#b8a066', gold: '#d6a743' }, feet: { kind: 'compactBoot', color: '#5a3a22' } },
      { label: 'Dark steel, green kaftan', top: { kind: 'longsleeve', color: '#2f5a3a' }, bottom: { kind: 'pants', color: '#1c2a20' }, armor: { kind: 'krug', color: '#6a6d73' }, head: { kind: 'chichak', color: '#6a6d73', gold: '#b8a066' }, feet: { kind: 'compactBoot', color: '#3a2416' } },
    ],
  },
  // An alp of Osman's gazi band, c. 1300, a legend of an earlier age (not in
  // the levels): a mail hauberk, a conical helmet with a mail aventail and a
  // turban wound round it.
  gaziAlp: {
    faction: 'ottomans',
    label: 'Alp — Osman\'s gazi', movement: 'good', fists: 'bare',
    sidearm: 'saber',
    extraMass: 0.28,
    protection: { blunt: 0.45, cut: 0.85, pierce: 0.5, bullet: { head: 0.3, torso: 0.25, limb: 0.2 } },
    courage: 0.35,
    designs: [
      { label: 'Mail, green coat', top: { kind: 'longsleeve', color: '#2f5a3a' }, bottom: { kind: 'pants', color: '#3a2a22' }, armor: { kind: 'hauberk', color: '#8d9097' }, head: { kind: 'chichak', color: '#8d9097', gold: '#b8a066', turban: '#ece4d0' }, feet: { kind: 'compactBoot', color: '#5a3a22' } },
      { label: 'Mail, red coat', top: { kind: 'longsleeve', color: '#7a1418' }, bottom: { kind: 'pants', color: '#2a2622' }, armor: { kind: 'hauberk', color: '#8d9097' }, head: { kind: 'chichak', color: '#8d9097', gold: '#b8a066', turban: '#e8dcc0' }, feet: { kind: 'compactBoot', color: '#3a2416' } },
    ],
  },
  // A Chinese martial artist's silk suit (tai chi, kung fu): loose jacket and
  // trousers, cloth shoes. No protection; it moves.
  kungfu: {
    faction: 'chinese',
    label: 'Kung fu suit', movement: 'excellent', fists: 'bare',
    palette: [['white', 'white'], ['black', 'black'], ['navy', 'black'], ['wine', 'black']],
    designs: [
      { label: 'Silk suit', top: { kind: 'flannel', color: '#e8e4d8' }, bottom: { kind: 'pants', color: '#e8e4d8' }, feet: { kind: 'compactBoot', color: '#161616' } },
    ],
  },
  // A Shaolin monk: the robe, leggings bound at the shin, the head shaven.
  monk: {
    faction: 'chinese',
    label: 'Shaolin monk', movement: 'excellent', fists: 'bare',
    palette: [['ochre', 'brown'], ['grey', 'grey'], ['rust', 'brown']],
    designs: [
      { label: 'Robe', top: { kind: 'tunic', color: '#c47a1e' }, bottom: { kind: 'pants', color: '#6a4428' }, feet: { kind: 'compactBoot', color: '#2a2622' }, hair: 'bald' },
    ],
  },
  // A taekwondo dobok: the white uniform, a black belt, bare feet.
  dobok: {
    faction: 'ring',
    label: 'Taekwondo dobok', movement: 'excellent', fists: 'bare',
    designs: [
      { label: 'Dobok', top: { kind: 'jacket', color: '#f2f2f0' }, bottom: { kind: 'pants', color: '#f2f2f0' }, feet: { kind: 'bare' } },
    ],
  },
  // A conquistador of the 1510s–20s: a steel breastplate with mail sleeves
  // and collar under a morion; a doublet and breeches. Proof against most
  // cuts and points; a gun's ball goes through it unless it is proofed.
  conquistadorPlate: {
    faction: 'knights', plated: true,
    label: 'Conquistador — breastplate', family: 'conquistador', movement: 'good', fists: 'bare',
    // The breastplate is curved (the globose breast of the 15th c., the peascod of the 16th): a blow or an arrow not square on it glances.
    breastplate: 0.8,
    sidearm: 'espada',
    spare: 'dagger',
    extraMass: 0.3,
    protection: { blunt: 0.5, cut: 0.9, pierce: 0.8, bullet: { head: 0.4, torso: 0.55, limb: 0 } },
    courage: 0.35,
    designs: [
      conquistadorDesign('Black doublet', '#1c1c20', '#3a2a22', 'morion'),
      conquistadorDesign('Crimson doublet', '#7a1a22', '#2a2622', 'morion'),
      conquistadorDesign('Yellow doublet', '#b8922e', '#3a2a22', 'cabasset'),
      // The Dutch East India Company's pikemen of the 1660s: breastplate and a pot helmet.
      conquistadorDesign('VOC pikeman', '#3a3a40', '#2a2622', 'potHelmet', '#d06a1a'),
      conquistadorDesign('Russet doublet', '#6a3a22', '#2a2622', 'cabasset'),
    ],
  },
  // A conquistador in escaupil: the quilted cotton armour taken from the
  // Mexica, good against obsidian and arrows, under a morion or cabasset.
  conquistadorQuilted: {
    faction: 'knights',
    label: 'Conquistador — escaupil', family: 'conquistador', movement: 'good', fists: 'bare',
    sidearm: 'espada',
    spare: 'dagger',
    extraMass: 0.14,
    protection: { blunt: 0.3, cut: 0.6, pierce: 0.5, bullet: { head: 0.35, torso: 0.15, limb: 0.05 } },
    courage: 0.3,
    designs: [
      escaupilDesign('Undyed escaupil', '#d8cfb8', '#3a2a22', 'morion'),
      escaupilDesign('Escaupil, red sleeves', '#d8cfb8', '#7a1a22', 'cabasset'),
      escaupilDesign('Grey escaupil', '#a8a49a', '#2a2622', 'morion'),
      // A VOC musketeer of the 1660s: a buff coat, an orange sash, a broad felt hat.
      { label: 'VOC musketeer', top: { kind: 'longsleeve', color: '#b08a5a' }, bottom: { kind: 'pants', color: '#2a2622' }, armor: { kind: 'escaupil', color: '#b08a5a', cloth: '#b08a5a', cloth2: '#d06a1a' }, head: { kind: 'feltHat', color: '#1c1c20', plume: '#d06a1a' }, feet: { kind: 'compactBoot', color: '#2a1d14' } },
      escaupilDesign('Escaupil, blue sleeves', '#d8cfb8', '#22356a', 'cabasset'),
    ],
  },
  // A Mexica warrior: the ichcahuipilli (quilted cotton armour, soaked in
  // brine), a loincloth, sandals, a feathered band. Little against steel.
  mexicaWarrior: {
    faction: 'mexica',
    label: 'Mexica — warrior', family: 'mexica', movement: 'excellent', fists: 'bare',
    sidearm: 'macuahuitl',
    extraMass: 0.08,
    protection: { blunt: 0.2, cut: 0.2, pierce: 0.15, bullet: { head: 0, torso: 0.05, limb: 0 } },
    courage: 0.3,
    designs: [
      mexicaDesign('Ichcahuipilli, quetzal band', '#ece4d0', '#1f8a5a'),
      mexicaDesign('Ichcahuipilli, red band', '#ece4d0', '#b3161b'),
      mexicaDesign('Ichcahuipilli, blue band', '#e0d8c4', '#2a5aa8'),
      mexicaDesign('Ichcahuipilli, yellow band', '#e8e0cc', '#d6a743'),
      mexicaDesign('Ichcahuipilli, plain', '#d8cfb8', null),
    ],
  },
  // The Mexica's elite orders: the tlahuiztli suit over the cotton armour,
  // jaguar skin or eagle feathers, and a carved wooden helmet: a jaguar's
  // open jaws, an eagle's beak. A little better kept; prized captives.
  mexicaElite: {
    faction: 'mexica',
    label: 'Mexica — jaguar and eagle', family: 'mexica', movement: 'excellent', fists: 'bare',
    sidearm: 'macuahuitl',
    extraMass: 0.12,
    protection: { blunt: 0.2, cut: 0.2, pierce: 0.2, bullet: { head: 0.1, torso: 0.05, limb: 0 } },
    courage: 0.45,
    designs: [
      { label: 'Jaguar warrior', top: { kind: 'longsleeve', color: '#c8902e' }, bottom: { kind: 'pants', color: '#c8902e' }, armor: { kind: 'jaguarSuit', color: '#c8902e', cloth: '#c8902e', cloth2: '#2a1d14' }, head: { kind: 'jaguarHelm', color: '#c8902e' }, feet: { kind: 'sandal', color: '#5a3a22' } },
      { label: 'Eagle warrior', top: { kind: 'longsleeve', color: '#ece4d0' }, bottom: { kind: 'pants', color: '#6a4428' }, armor: { kind: 'featherSuit', color: '#ece4d0', cloth: '#ece4d0', cloth2: '#6a4428' }, head: { kind: 'eagleHelm', color: '#ece4d0' }, feet: { kind: 'sandal', color: '#5a3a22' } },
      { label: 'Black jaguar', top: { kind: 'longsleeve', color: '#2a2622' }, bottom: { kind: 'pants', color: '#2a2622' }, armor: { kind: 'jaguarSuit', color: '#2a2622', cloth: '#2a2622', cloth2: '#0f0f0f' }, head: { kind: 'jaguarHelm', color: '#2a2622' }, feet: { kind: 'sandal', color: '#5a3a22' } },
      { label: 'Brown eagle', top: { kind: 'longsleeve', color: '#8a5a32' }, bottom: { kind: 'pants', color: '#4a3020' }, armor: { kind: 'featherSuit', color: '#8a5a32', cloth: '#8a5a32', cloth2: '#ece4d0' }, head: { kind: 'eagleHelm', color: '#8a5a32' }, feet: { kind: 'sandal', color: '#5a3a22' } },
      { label: 'Red jaguar', top: { kind: 'longsleeve', color: '#a8401e' }, bottom: { kind: 'pants', color: '#a8401e' }, armor: { kind: 'jaguarSuit', color: '#a8401e', cloth: '#d08a2e', cloth2: '#2a1d14' }, head: { kind: 'jaguarHelm', color: '#d08a2e' }, feet: { kind: 'sandal', color: '#5a3a22' } },
    ],
  },
  // A rōnin: no lord, no armour; a kimono and hakama, a headband.
  ronin: {
    faction: 'japanese',
    label: 'Rōnin', movement: 'excellent', fists: 'bare',
    sidearm: 'wakizashi',
    // A masterless man keeps what armour he can carry and run in: a tōsei
    // cuirass and the haidate over his thighs, no helmet, no sleeves, no
    // greaves. The trunk as a samurai's dō; the thighs behind small plates
    // laced on cloth; head and the rest of the limbs bare (`regions`).
    extraMass: 0.18,
    protection: {
      blunt: 0.6, cut: 0.9, pierce: 0.65, bullet: { head: 0, torso: 0.5, limb: 0.05 },
      regions: { head: { blunt: 0.05, cut: 0.05, pierce: 0 }, limb: { blunt: 0.05, cut: 0.05, pierce: 0 }, Thigh: { blunt: 0.35, cut: 0.75, pierce: 0.45 } },
    },
    courage: 0.4,
    designs: [
      { label: 'Indigo kimono', top: { kind: 'flannel', color: '#1f2a4a' }, bottom: { kind: 'pants', color: '#3a3a40' }, armor: { kind: 'roninDo', color: '#3b3e44', lace: '#1d2a4f', gold: '#d6a743' }, head: { kind: 'clothWrap', color: '#ece4d0' }, feet: { kind: 'tabi', color: '#1a1b22' } },
      { label: 'Grey kimono', top: { kind: 'flannel', color: '#5a5a5e' }, bottom: { kind: 'pants', color: '#1c1c20' }, armor: { kind: 'roninDo', color: '#17171a', lace: '#b3161b', gold: '#d6a743' }, head: { kind: 'clothWrap', color: '#b3161b' }, feet: { kind: 'tabi', color: '#1a1b22' } },
      { label: 'Brown kimono', top: { kind: 'flannel', color: '#5a3a22' }, bottom: { kind: 'pants', color: '#2a2622' }, armor: { kind: 'roninDo', color: '#6b4a32', lace: '#2a1a10', gold: '#d6a743' }, feet: { kind: 'tabi', color: '#1a1b22' }, hair: 'topknot' },
    ],
  },
  // A Chinese sea raider (wokou): a loose jacket, rolled trousers, a cloth
  // round the head, bare feet. Nothing to stop a blade.
  // A raider in a piece of samurai armour: a laced dō-maru (and some, the
  // great shoulder plates) over a tucked-up robe, arms and legs bare, the
  // feet bare. The armour covers the trunk alone (`regions`): head and limbs
  // as a raider's.
  wokouArmoured: {
    faction: 'chinese',
    label: 'Wokou in a dō-maru', movement: 'good', fists: 'bare',
    sidearm: 'dao',
    spare: 'dagger',
    extraMass: 0.13,
    protection: {
      blunt: 0.45, cut: 0.7, pierce: 0.5, bullet: { head: 0, torso: 0.25, limb: 0 },
      regions: { head: { blunt: 0.05, cut: 0.05, pierce: 0 }, limb: { blunt: 0.05, cut: 0.05, pierce: 0 } },
    },
    courage: 0.3,
    designs: [
      { label: 'Black dō, red robe', top: { kind: 'tunic', color: '#a8402a' }, bottom: { kind: 'loincloth', color: '#e8e2d0' }, armor: { kind: 'doMaru', color: '#1c1c20', lace: '#a3241e' }, head: { kind: 'hachimaki', color: '#ece6d6' }, feet: { kind: 'bare' } },
      { label: 'Striped dō', top: { kind: 'tunic', color: '#2a3a5a' }, bottom: { kind: 'loincloth', color: '#e8e2d0' }, armor: { kind: 'doMaruSode', color: '#5a6a3a', lace: '#c9a23a' }, head: { kind: 'hachimaki', color: '#a3241e' }, feet: { kind: 'bare' } },
      { label: 'Russet dō, iron hat', top: { kind: 'tunic', color: '#6a4a30' }, bottom: { kind: 'loincloth', color: '#d8cfb8' }, armor: { kind: 'doMaru', color: '#6b4a32', lace: '#1d2a4f' }, head: { kind: 'jingasa', color: '#2a2622', gold: '#c9a23a' }, feet: { kind: 'bare' } },
      { label: 'Red dō, sode', top: { kind: 'tank', color: '#c9a23a' }, bottom: { kind: 'loincloth', color: '#e8e2d0' }, armor: { kind: 'doMaruSode', color: '#a8261c', lace: '#1a1a1d' }, head: { kind: 'clothWrap', color: '#1c1c20' }, feet: { kind: 'bare' } },
    ],
  },
  wokou: {
    faction: 'chinese',
    label: 'Wokou raider', movement: 'excellent', fists: 'bare',
    sidearm: 'dao',
    spare: 'dagger',
    protection: { blunt: 0.05, cut: 0.05, pierce: 0, bullet: { head: 0, torso: 0, limb: 0 } },
    courage: 0.25,
    designs: [
      // Mostly barefoot and bare-legged: a short robe tucked up over a
      // loincloth, a sleeveless shirt, a hide, or nothing above the waist;
      // a headband (hachimaki) or a cloth round the head. A few keep the
      // Chinese sailor's jacket and trousers.
      { label: 'Red robe', top: { kind: 'tunic', color: '#a8402a' }, bottom: { kind: 'loincloth', color: '#e8e2d0' }, head: { kind: 'hachimaki', color: '#ece6d6' }, feet: { kind: 'bare' } },
      { label: 'Yellow robe', top: { kind: 'tunic', color: '#c9a23a' }, bottom: { kind: 'loincloth', color: '#e8e2d0' }, feet: { kind: 'bare' }, hair: 'topknot' },
      { label: 'Indigo robe', top: { kind: 'tunic', color: '#2a3a5a' }, bottom: { kind: 'loincloth', color: '#e8e2d0' }, head: { kind: 'hachimaki', color: '#a3241e' }, feet: { kind: 'bare' } },
      { label: 'Hide', top: { kind: 'tunic', color: '#6a4a30' }, bottom: { kind: 'loincloth', color: '#5a4a38' }, feet: { kind: 'bare' } },
      { label: 'Bare chest', bottom: { kind: 'loincloth', color: '#e8e2d0' }, head: { kind: 'hachimaki', color: '#ece6d6' }, feet: { kind: 'bare' } },
      { label: 'Sleeveless', top: { kind: 'tank', color: '#8a3a2a' }, bottom: { kind: 'loincloth', color: '#d8cfb8' }, head: { kind: 'clothWrap', color: '#3a3326' }, feet: { kind: 'bare' } },
      { label: 'Sailor', top: { kind: 'flannel', color: '#1c1c20' }, bottom: { kind: 'pants', color: '#3a3326' }, head: { kind: 'clothWrap', color: '#3a3326' }, feet: { kind: 'bare' } },
    ],
  },
  // A Victorian lady: a corset under the bodice, a long gown, high-heeled
  // pointed boots (their heel sets her footing, see heelFooting). The
  // corset's boning turns a little of a cut (30%), nothing of a blow or a
  // point. The game shuffles her three silhouettes of the reign.
  victorianLady: {
    faction: 'street',
    label: 'Victorian — corset and gown', movement: 'limited', fists: 'bare',
    protection: { blunt: 0, cut: 0.3, pierce: 0, bullet: { head: 0, torso: 0, limb: 0 } },
    // Dealt: the three silhouettes of the reign, and the gothic high-low (design 4, chosen 2026-10-08).
    picked: [0, 1, 2, 4],
    designs: [
      { label: 'Ball gown (1860s)', top: { kind: 'bodice', color: '#e6eef2' }, bottom: { kind: 'gown', shape: 'ball', color: '#9ab8d0' }, armor: { kind: 'corset', color: '#5a7ea6', cloth: '#5a7ea6', cloth2: '#e6eef2', lace: '#e6eef2' }, feet: { kind: 'heelAnkleBoot', color: '#e6e0d4', heels: LADY_HEELS } },
      { label: 'Bustle dress (1880s)', top: { kind: 'longsleeve', color: '#5a1a2a' }, bottom: { kind: 'gown', shape: 'bustle', color: '#6a2234' }, armor: { kind: 'corset', color: '#16161a', cloth: '#16161a', cloth2: '#6a2234', lace: '#d6c7a3' }, head: { kind: 'tiltHat', color: '#2a0a12', plume: '#e8e0cc' }, feet: { kind: 'heelAnkleBoot', color: '#141416', heels: LADY_HEELS } },
      { label: 'Mourning black', top: { kind: 'longsleeve', color: '#1a1a1e' }, bottom: { kind: 'gown', color: '#141418' }, armor: { kind: 'corset', color: '#34343c', cloth: '#34343c', cloth2: '#141418', lace: '#8a8a92' }, head: { kind: 'widowCap', color: '#141418', cap: '#f2efe8' }, feet: { kind: 'heelAnkleBoot', color: '#141416', heels: LADY_HEELS } },
      // Victorian Gothic, all in black: a strapless overbust corset (brocade,
      // a steel busk's clasps, laced behind), platform Mary Janes, a beaded
      // lace choker; porcelain powder, smoky eyes, black lips (`face`, laid
      // over her own look: her hair stays her own), a small dark-red flower in
      // the hair. Three takes were drawn; B (the high-low) was chosen and is dealt, A and C are kept.
      { label: 'Gothic A — bubble bloomers', ...GOTHIC, bottom: { kind: 'bloomers', gown: 'bubble', color: '#141417', trim: '#2c2c33' }, extras: [GOTHIC_CHOKER, { kind: 'ribbons', color: '#0e0e11', count: 10, length: 0.55 }] },
      { label: 'Gothic B — high-low train', ...GOTHIC, bottom: { kind: 'bloomers', gown: 'drape', color: '#131316', trim: '#2a2a31' }, extras: [GOTHIC_CHOKER, { kind: 'train', color: '#121215', length: 0.62 }, { kind: 'ribbons', color: '#0e0e11', count: 4, length: 0.4 }] },
      { label: 'Gothic C — lace sleeves, tiered skirt', ...GOTHIC, armor: { ...GOTHIC.armor, kind: 'overbustSleeved' }, bottom: { kind: 'bloomers', gown: 'tiered', color: '#141417', trim: '#33333b' }, extras: [GOTHIC_CHOKER] },
    ],
  },
  // A Victorian gentleman: a frock coat to the knee, a top hat, polished shoes.
  victorianGent: {
    faction: 'street',
    label: 'Victorian — frock coat and top hat', movement: 'good', fists: 'bare',
    designs: [
      { label: 'Black frock coat', top: { kind: 'suit', color: '#1c1c20', shirt: '#f2f2f0', tie: '#1c1c20' }, bottom: { kind: 'pants', color: '#4a4a50' }, head: { kind: 'topHat', color: '#141416' }, feet: { kind: 'dressShoe', color: '#141416' } },
      { label: 'Grey frock coat', top: { kind: 'suit', color: '#5a5a62', shirt: '#f2f2f0', tie: '#7a1a22' }, bottom: { kind: 'pants', color: '#2a2a30' }, head: { kind: 'topHat', color: '#2a2a30' }, feet: { kind: 'dressShoe', color: '#141416' } },
      { label: 'Bottle-green frock coat', top: { kind: 'suit', color: '#24402c', shirt: '#f2f2f0', tie: '#d6a743' }, bottom: { kind: 'pants', color: '#3a3326' }, head: { kind: 'topHat', color: '#141416' }, feet: { kind: 'dressShoe', color: '#2a1d14' } },
    ],
  },
  // A medieval common man: a belted tunic, hose, bare feet. No traits.
  commoner: {
    faction: 'knights',
    label: 'Commoner', movement: 'good', fists: 'bare',
    headgear: ['headWrap'],
    palette: [['undyed', 'brown'], ['linen', 'slate'], ['rust', 'brown'], ['forest', 'undyed'], ['ochre', 'brown'], ['slate', 'undyed'], ['brown', 'grey']],
    designs: [
      { label: 'Tunic and hose', top: { kind: 'tunic', color: '#c8bc9e' }, bottom: { kind: 'pants', color: '#6a4a30', skirt: true }, feet: { kind: 'bare' } },
    ],
  },
};

export const OUTFIT_KEYS = Object.keys(OUTFITS);

/**
 * Headgear and head decoration, one at a time, knocked off by a blow that
 * moves the head at least `knock` m/s (a headset by any clean shot; a crest
 * or plume fixed to a helmet only by a heavy one); `falls`: it comes off
 * when he goes down.
 */
export const HEADGEAR = {
  headset: { label: 'Headset', knock: 0, falls: true, icon: '🎧' },
  cap: { label: "Runner's cap", knock: 0.3, falls: true, icon: '🧢' },
  boonie: { label: 'Boonie hat', knock: 0.25, falls: true, icon: '👒' },
  hat: { label: 'Hat', knock: 0.25, falls: true, icon: '🎩' },
  headWrap: { label: 'Head wrap', knock: 0.4, falls: true, icon: '🧣' },
  plume: { label: 'Plume', knock: 0.45, falls: true, icon: '🪶' },
  // A cut on the helmet carrying at least `cutFrom` J of edge takes the crest off with it.
  crest: { label: 'Crest', knock: 0.5, falls: true, icon: '🌙', cutFrom: 6 },
};

/** What can be worn on the head with this outfit: a headset unless there is a helmet, and its own. */
export function headgearOptions(kind) {
  const outfit = OUTFITS[kind] ?? OUTFITS.boxing;
  const helmet = outfit.designs.some((design) => design.head);
  return ['none', ...(helmet ? [] : ['headset']), ...(outfit.headgear ?? [])];
}

/** What a fighter in this outfit wears on his head to begin with. */
export function defaultHeadgear(kind) {
  const first = OUTFITS[kind]?.defaultHeadgear;
  return first ? [first] : [];
}

/**
 * Colours for a fighter in this outfit, drawn from the outfit's palette:
 * combinations that suit it (a suit's jacket and trousers alike, a
 * peasant's undyed and earth tones). Boxing keeps its corner colours.
 */
export function randomColors(kind, random = Math.random) {
  const palette = OUTFITS[kind]?.palette;
  if (!palette?.length) return {};
  const [top, bottom] = palette[Math.floor(random() * palette.length)];
  return { ...(top ? { top: CLOTH_COLORS[top] } : {}), ...(bottom ? { bottom: CLOTH_COLORS[bottom] } : {}) };
}

/**
 * A design for a fighter in an armour of this kind, at random among those
 * picked for the game (`picked`, design indices), else among them all.
 */
export function randomDesign(kind, random = Math.random) {
  const spec = OUTFITS[kind];
  if (!spec) return 0;
  const pool = spec.picked ?? spec.designs.map((design, index) => (design.levelOnly || design.special ? null : index)).filter((index) => index !== null);
  return pool[Math.floor(random() * pool.length)] ?? 0;
}

/** The kinds of armour in a family (samurai, knight, gladiator). */
export function familyKinds(family) {
  return OUTFIT_KEYS.filter((key) => OUTFITS[key].family === family);
}

/** The outfit a fighter wears: kind and design, defaulting to boxing's first. */
// ---- Factions -----------------------------------------------------------------

/**
 * The factions characters are grouped under, by culture and era: for
 * choosing them in the menus. A faction has no effect on the fight.
 */
// A faction's `standard`: what its leader carries in a group fight (a
// weapon in WEAPONS with a `flag`), in his hands, or `worn` on his back
// (a samurai commander's great sashimono) leaving his hands to his weapon;
// `colour`, its field's usual colour (where both sides' would differ).
export const FACTIONS = {
  knights: { label: 'Knights', glyph: '🏰', standard: { weapon: 'banner', colour: '#b3161b' }, blurb: 'Medieval Europe: knights in plate and mail, foot soldiers, the commons.' },
  japanese: { label: 'Japanese', glyph: '⛩️', standard: { weapon: 'nobori', worn: true }, blurb: 'Samurai and ashigaru: katana, naginata, yari, bows and teppō.' },
  mexica: { label: 'Mexica', glyph: '🦅', standard: { weapon: 'pamitl', worn: true }, blurb: 'The Aztec army: warriors in quilted cotton, jaguar and eagle knights, obsidian blades.' },
  chinese: { label: 'Chinese', glyph: '🐉', standard: { weapon: 'lingQi', colour: '#c0392b' }, blurb: 'Ming soldiers: garrison spearmen, brigandine sword-and-shield men and gunners, elite guandao; the Iron Pagoda of legend.' },
  steppe: { label: 'Steppe', glyph: '🐎', standard: { weapon: 'tug' }, blurb: 'Mongol, Oirat and Timurid warriors: archers in the deel, leather and iron lamellar, sabre, mace and composite bow; the Khan\'s kheshig of legend.' },
  ottomans: { label: 'Ottomans', glyph: '🌙', standard: { weapon: 'sancak', colour: '#2e6b3a' }, blurb: 'The Sultan\'s army: azaps, Janissaries with yatagan and gun, heavy men in mail-and-plate; an alp of Osman\'s gazis of legend.' },
  gladiators: { label: 'Gladiators', glyph: '🏛️', blurb: 'The arena of Rome: hoplomachus, murmillo, secutor, thraex, retiarius.' },
  ring: { label: 'Ring', glyph: '🥊', blurb: 'Fighting sports: boxing, kickboxing, Muay Thai, MMA, sumo.' },
  street: { label: 'Street', glyph: '🏙️', blurb: 'Ordinary people and the underworld: brawlers, yakuza, office workers.' },
  romans: { label: 'Rome', glyph: '🛡️', standard: { weapon: 'vexillum', colour: '#9a1a1a' }, blurb: 'The legions of the early Empire: legionaries in segmented iron with scutum and gladius, their centurions in mail and medals; the red vexillum.' },
  law: { label: 'Law', glyph: '🚓', blurb: 'Police, SWAT and special forces: the baton, the service pistol, the shotgun and the AR-15.' },
};
export const FACTION_KEYS = Object.keys(FACTIONS);


/** A character's faction: as set (`inputs.faction`), else by what he wears. */
export function factionOf(inputs) {
  if (FACTIONS[inputs.faction]) return inputs.faction;
  return outfitOf(inputs).spec.faction ?? 'ring';
}

export function outfitOf(inputs) {
  const kind = OUTFITS[inputs.outfit?.kind] ? inputs.outfit.kind : 'boxing';
  const design = Math.max(0, Math.min(OUTFITS[kind].designs.length - 1, inputs.outfit?.design ?? 0));
  return { kind, design, spec: OUTFITS[kind], look: OUTFITS[kind].designs[design] };
}

/**
 * The outfit's effect on the fighter, resolved for his sex: movement,
 * balance, kick strength, gear weight (share of body weight), protection
 * from harm by kind, and his own strikes' harm by limb.
 */
/**
 * What a fighter wears on his head does three things to a blow there:
 * - `mass` (kg): a fitted helmet moves with the head, so a blow's impulse
 *   must speed up head and helmet together (Δv = J / (head + helmet)): a
 *   2.5 kg helm on a ~5 kg head takes a third off the head's speed change.
 * - `padding` (0–1): the arming cap, lining, quilting or suspension under it
 *   draws the blow out over a longer contact (WORLD.helmet.paddingStretch):
 *   the same momentum, a lower peak, and peak acceleration is what strains
 *   the brain (head-injury criteria are peak-acceleration measures).
 * - `curve` (0–1): how much of it is smooth, rounded steel: a blow that is
 *   not square to it skids off (only its part along the surface normal goes
 *   in) and the slide does not wrench the head round, where skin would grip.
 *   A domed or pointed bowl is high; a flat-sided can or a soft cap low.
 * Masses from surviving pieces and reconstructions; kinds not listed are no helmet.
 */
export const HELMETS = {
  // Boxing headgear: foam, light, thick.
  headguard: { mass: 0.45, padding: 0.9, curve: 0.3 },
  // Modern: a riot helmet (thick liner, smooth shell); a combat helmet (pads, rounded aramid shell).
  riotHelmet: { mass: 1.5, padding: 0.85, curve: 0.75 },
  opsHelmet: { mass: 1.4, padding: 0.85, curve: 0.85 },
  // The great helm (2–3 kg) over a mail coif and a padded arming cap: the best padded of all; flat sides, a low crown.
  greatHelm: { mass: 2.6, padding: 0.85, curve: 0.35 },
  // The bascinet: a pointed globular bowl on a padded lining and a mail aventail.
  bascinet: { mass: 2.3, padding: 0.65, curve: 0.85 },
  // A kabuto: a riveted bowl (2.5–3 kg with its neck guard) on a cloth lining and a hachimaki.
  kabuto: { mass: 2.8, padding: 0.55, curve: 0.7 },
  jingasa: { mass: 1.0, padding: 0.3, curve: 0.85 },
  // Gladiators' helmets were heavy (3–4 kg, Pompeii finds), brimmed and grilled; the secutor's smooth egg made to turn the trident.
  arenaHelm: { mass: 3.0, padding: 0.5, curve: 0.55 },
  gladiatorHelm: { mass: 3.0, padding: 0.5, curve: 0.55 },
  secutorHelm: { mass: 3.2, padding: 0.5, curve: 0.95 },
  galea: { mass: 1.6, padding: 0.4, curve: 0.7 },
  // Sixteenth-century infantry: the combed morion, the almond cabasset, the pot helmet, the kettle hat.
  morion: { mass: 2.0, padding: 0.4, curve: 0.75 },
  cabasset: { mass: 1.8, padding: 0.4, curve: 0.8 },
  potHelmet: { mass: 2.2, padding: 0.4, curve: 0.7 },
  kettleHat: { mass: 2.0, padding: 0.45, curve: 0.6 },
  // The Iron Pagoda: a tall bowl and its rolled lamellar aventail (~4 kg together) over a padded cap.
  pagodaHelm: { mass: 4.0, padding: 0.6, curve: 0.8 },
  // Steppe and Ottoman pointed bowls (the chichak with its brim and nasal).
  steppeHelm: { mass: 1.8, padding: 0.45, curve: 0.85 },
  chichak: { mass: 2.0, padding: 0.45, curve: 0.85 },
  // Ming: the brimmed iron hat of the brigandine man; the elite's tall bowl. Han: an iron lamellar cap (Linzi), lightly lined.
  mingHat: { mass: 1.4, padding: 0.35, curve: 0.7 },
  mingHelm: { mass: 2.0, padding: 0.45, curve: 0.85 },
  hanHelm: { mass: 1.5, padding: 0.3, curve: 0.6 },
  // Mexica war helmets: carved wood and quilted cotton, animal-headed (flat planes, little curve).
  jaguarHelm: { mass: 1.0, padding: 0.45, curve: 0.35 },
  eagleHelm: { mass: 1.0, padding: 0.45, curve: 0.35 },
  // Soft headwear: little mass; a turban's many wraps and a fur hat pad a little.
  lionHead: { mass: 0.6, padding: 0.3, curve: 0.15 },
  turban: { mass: 0.6, padding: 0.45, curve: 0.2 },
  furHat: { mass: 0.4, padding: 0.4, curve: 0 },
  bork: { mass: 0.4, padding: 0.3, curve: 0 },
  guanYuCap: { mass: 0.2, padding: 0.15, curve: 0 },
  beanie: { mass: 0.1, padding: 0.1, curve: 0 },
  clothWrap: { mass: 0.1, padding: 0.1, curve: 0 },
  hachimaki: { mass: 0.05, padding: 0.05, curve: 0 },
  policeCap: { mass: 0.2, padding: 0.1, curve: 0 },
  topHat: { mass: 0.15, padding: 0.1, curve: 0 },
  feltHat: { mass: 0.15, padding: 0.1, curve: 0 },
};
const NO_HELMET = { mass: 0, padding: 0, curve: 0 };

export function gearTraits(inputs) {
  const { spec, look } = outfitOf(inputs);
  const female = inputs.sex === 'female';
  const bySex = female ? spec.female ?? {} : {};
  const feet = (female && look.femaleFeet) || look.feet;
  return {
    ...MOVEMENT[spec.movement],
    balance: (bySex.balance ?? spec.balance ?? 1) * heelFooting(feet?.heels),
    // Heels stand the body higher by this much (m).
    heelLift: heelLift(feet?.heels, (inputs.heightCm ?? 175) / 100),
    kick: bySex.kick ?? spec.kick ?? 1,
    extraMass: spec.extraMass ?? 0,
    protection: { ...NO_PROTECTION, ...spec.protection },
    deflects: Boolean(spec.deflects),
    // Courage from good armour: less fear, readier to close (0 to 1).
    courage: spec.courage ?? 0,
    // Trained to fight in ranks (formation.js): { advance, charge, testudo } — the line moves up to the enemy (closed under its shields if `testudo`; the last `charge` m at a run), or holds.
    drill: spec.drill ?? null,
    // A full plate harness: no gap for an edge (a point may still find one).
    cutProof: Boolean(spec.cutProof),
    // How often a blade finds a gap in the rigid armour (BLADES.gaps), when the kit has more (or fewer) than most.
    gaps: spec.gaps ?? null,
    // How much wider than the head what is worn on it is, where heads and bodies meet (not where blows land).
    headBulk: spec.headBulk ?? 1,
    // What is on his head, as a blow there meets it (HELMETS): its mass, padding and curve.
    helmet: HELMETS[look.head?.kind] ?? NO_HELMET,
    // A plate breastplate's curve (0 none, 1 a full globose breast): a blow or an arrow not square on it skids off, as off a helmet.
    breastplate: spec.breastplate ?? 0,
    // A second weapon carried with this kit (a style key), drawn once when the first is lost.
    sidearm: spec.sidearm ?? null,
    spare: spec.spare ?? null,
    arrowproof: Boolean(spec.arrowproof),
    damageDealt: { hand: 1, foot: 1, ...spec.damageDealt },
  };
}

/** Whether the fighter's fists are padded: an explicit choice, or the outfit's. */
export function glovedFists(inputs) {
  if (inputs.gloves !== undefined) return inputs.gloves !== false;
  return outfitOf(inputs).spec.fists === 'gloved';
}

/**
 * The colours of a design, for one fighter: 'corner' becomes his side's
 * colour, and any colours he has chosen override the design's own.
 */
export function resolveColor(value, cornerHex) {
  if (value === 'corner') return cornerHex;
  return value;
}
