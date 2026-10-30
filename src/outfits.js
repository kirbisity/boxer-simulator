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
  // A harness made for the lists, not the field (the Stechzeug): its wearer
  // walks, he does not skip; he turns his whole body to look round.
  slow: { foot: 0.66, accel: 0.55, swing: 0.84 },
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

/**
 * A jousting harness (Stechzeug) in its finish: the steel, the arming
 * clothes under it, the leather of the tilting targe, and the knight's two
 * colours for the mantling (lambrequin) down the back of his helm.
 */
function tournamentDesign(label, { steel, under, leather, colour, colour2, plume = '#f2efe6', style, gold = '#c9a23a' }) {
  return {
    label,
    top: { kind: 'longsleeve', color: under },
    bottom: { kind: 'tights', color: under },
    armor: { kind: 'plate', color: steel, joust: true, mail: '#8d9097', leather, gold, cloth: colour, cloth2: colour2 },
    // `style`: the helm's shape (STECHHELM_STYLES in stechzeug.js); none, the first drawing of it.
    head: { kind: 'stechhelm', color: steel, plume, mantling: [colour, colour2], gold, ...(style ? { style } : {}) },
    feet: { kind: 'sabaton', color: steel },
  };
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

/**
 * Saladin's design: the kazaghand's silk (`silk`) and its second colour
 * (`trim`: the hem, the front edge and the sash), the gold of the tiraz bands
 * and the plaque belt, the robe (qaba) that shows at the wrists, the turban
 * wound round the helmet.
 */
function saladinDesign(label, { silk, trim, gold = '#c9a23a', robe, turban }) {
  return {
    label,
    top: { kind: 'longsleeve', color: robe },
    // Wide trousers (sarawil) of undyed cotton, tucked into the boots.
    bottom: { kind: 'pants', color: '#cfc4a8' },
    armor: { kind: 'kazaghand', color: '#8d9097', mail: '#8d9097', cloth: silk, cloth2: trim, gold, leather: '#3a2618' },
    head: { kind: 'ayyubidHelm', color: '#9ea4ac', gold, turban, mail: '#7c8087', openFace: true },
    feet: { kind: 'ridingBoot', color: '#5a3a22' },
  };
}

function toseiDesign(label, steel, lace, crest, mask, under) {
  return { label, top: { kind: 'longsleeve', color: under }, bottom: { kind: 'pants', color: under }, armor: { kind: 'toseiDo', color: steel, lace, gold: '#d6a743' }, head: { kind: 'kabuto', color: steel, crest, mask, lace, gold: '#d6a743' }, feet: { kind: 'tabi', color: '#1a1b22' } };
}

/** An ashigaru's lacquered do and jingasa, the mon in gold or white. */
function ashigaruDesign(label, lacquer, lace, mon, cloth) {
  return { label, top: { kind: 'longsleeve', color: cloth }, bottom: { kind: 'pants', color: cloth }, armor: { kind: 'okegawa', color: lacquer, lace, gold: mon }, head: { kind: 'jingasa', color: lacquer, gold: mon }, feet: { kind: 'tabi', color: '#1a1b22' } };
}

// Ming soldiers. Garrison: the weisuo levy as he was, unpaid and unarmoured: a sleeveless hemp vest over bare arms, a cloth sash,
// loose dark trousers, a cloth wound round the head under the hair cap's knob.
function mingGarrisonDesign(label, vest, sash, wrap) {
  return { label, top: { kind: 'tank', color: vest }, bottom: { kind: 'pants', color: '#1c1b1d' }, armor: { kind: 'mingVest', color: vest, cloth: vest, cloth2: sash, leather: shade(vest, 0.7) }, head: { kind: 'clothWrap', color: wrap, topknot: '#cdb894' }, feet: { kind: 'compactBoot', color: '#17171c' } };
}
// Brigandine: the coat's cloth, gilt rivets, the iron hat.
// `look`: the same protection drawn as lamellar (`kind: 'mingLamellar'`, its `lace`).
function mingBrigandineDesign(label, cloth, iron, look = {}) {
  return { label, top: { kind: 'longsleeve', color: shade(cloth, 0.7) }, bottom: { kind: 'pants', color: '#22201e' }, armor: { kind: 'mingBrigandine', color: iron, cloth, cloth2: shade(cloth, 0.35), gold: '#c9a24a', leather: '#2a1d14', ...look }, head: { kind: 'mingHat', color: iron, tassel: '#b3161b' }, feet: { kind: 'compactBoot', color: '#17171c' } };
}
// Elite: the coat, the coif's cloth, the steel.
// `helm`: a steel neck guard (`neck: 'steel'`) in place of the padded coif, and a steel face mask.
// `look`: the same protection drawn as scale armour (`kind: 'mingScale'`), or as lamellar (`kind: 'mingEliteLamellar'`).
// The helm's flaps are of the coat: the brigandine's own cloth and gilt rivets, or steel where the coat is scale (`flapSteel`).
function mingEliteDesign(label, cloth, coif, steel, helm = {}, look = {}) {
  const scale = look.kind === 'mingScale';
  return { label, top: { kind: 'longsleeve', color: shade(cloth, 0.6) }, bottom: { kind: 'pants', color: '#1c1a18' }, armor: { kind: 'mingElite', color: steel, cloth, cloth2: shade(cloth, 0.35), gold: '#c9a24a', leather: '#2a1d14', ...look }, head: { kind: 'mingHelm', color: steel, gold: '#c9a24a', coif: scale ? steel : cloth, flapSteel: scale, tassel: '#b3161b', ...helm }, feet: { kind: 'compactBoot', color: '#141416' } };
}
// The steppe man's kit: his deel (the robe over all) and the robe under it
// at the hem (`trim`), his hat or helmet, the tall black boots (gutal).
function steppeDesign(label, armor, deel, trim, head, feet = '#141210') {
  return { label, top: { kind: 'longsleeve', color: deel }, bottom: { kind: 'pants', color: '#2a2622' }, armor: { cloth: deel, cloth2: trim, leather: '#4a2e1a', ...armor }, head, feet: { kind: 'jinBoot', color: feet } };
}
// A rōnin: kosode, hakama, the cloak and his pieces of armour (roninDo); his sugegasa is worn loose (HEADGEAR kasa).
// A sōhei, a warrior monk of the great temples (Enryakuji, Kōfukuji): the
// white katō-zukin hood wrapped over the head and across the face to the
// eyes, a dark monk's robe over a laced dō-maru with its shoulder boards,
// the hakama, straw sandals, and the prayer beads (juzu) round the neck.
function soheiDesign(label, { hood, robe, hakama, lacquer, lace, beads }) {
  return {
    label, top: { kind: 'kosode', color: robe }, bottom: { kind: 'hakama', color: hakama },
    armor: { kind: 'lamellar', color: lacquer, lace, gold: '#8a7a5a', leather: '#3a2a1c', trim: false, sode: 0.9 },
    head: { kind: 'katozukin', color: hood },
    feet: { kind: 'sandal', color: '#6a4a2a' },
    extras: [{ kind: 'mantle', color: robe, length: 1.05 }, { kind: 'juzu', color: beads }],
  };
}
function roninDesign(label, { kosode, hakama, cloak, steel, lace, sash, band, gaiters }) {
  return {
    label, top: { kind: 'kosode', color: kosode }, bottom: { kind: 'hakama', color: hakama },
    armor: { kind: 'roninDo', color: steel, lace, gold: band, cloth: gaiters, cloth2: sash },
    feet: { kind: 'sandal', color: '#5a3a22' },
    extras: [{ kind: 'mantle', color: cloak, length: 1.0 }],
  };
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

// An Inca man (Cajamarca, 1532): the uncu tunic (`weave`: plain, a tocapu band,
// the checkerboard, the royal tocapu all over: loftbody.js ARMOR_KINDS) in its
// colours, the loincloth beneath, usuta sandals of hide, the llautu wound round
// the head in two colours; a lord's gold earspools, the Sapa Inca's mascapaicha.
function incaDesign(label, weave, field, second, { cord = '#1c1c20', cord2 = '#b3161b', earspools = null, fringe = null, cloak = null, special = false } = {}) {
  return {
    label, ...(special ? { special: true } : {}),
    bottom: { kind: 'loincloth', color: '#d8cfb8' },
    armor: { kind: weave, color: field, cloth: field, cloth2: second, lace: '#1c1c20', gold: '#d6a743', leather: '#2f6a4a' },
    head: { kind: 'llautu', color: cord, lace: cord2, ...(earspools ? { earspools } : {}), ...(fringe ? { fringe } : {}) },
    feet: { kind: 'sandal', color: '#6a4a2a' },
    ...(cloak ? { extras: [{ kind: 'mantle', color: cloak, length: 0.9 }] } : {}),
  };
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

// What his kit's men are trained to (`skill`, 0..1; body.js normaliseInputs: a man's own, else his kit's, else 0.5): it places his
// blows (WORLD.skill) and reads the blows at him (WORLD.guardRead: under 0.3 a block is never brought onto a blow's line). The
// tiers: civilians and peasants 0.1 (never trained); levies, garrisons, raiders 0.2-0.3 (weeks of drill: they try to block and
// cannot); regulars 0.35-0.6 (drilled: they read a blow, late); elites 0.6-0.8 (trained from boyhood, or picked and drilled for
// years: samurai, knights, the Khan's guard, the Iron Pagoda, gladiators); masters and legends 0.85-1 (ronin, sohei; a preset's
// `hero`: 1). A kit without one is 0.5, the sports' (boxing, MMA, kung fu: trained, not soldiers).
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
      { label: 'Black mawashi', bottom: { kind: 'mawashi', color: '#1a1a1d' }, extras: [{ kind: 'sagari', color: '#1a1a1d' }], feet: { kind: 'bare' } },
    ],
  },
  hiking: {
    // Trained: a civilian: never trained to fight (`skill`: OUTFITS' tiers).
    skill: 0.1,
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
    // Trained: a civilian: never trained to fight (`skill`: OUTFITS' tiers).
    skill: 0.1,
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
    // Trained: street fights, no teacher (`skill`: OUTFITS' tiers).
    skill: 0.25,
    faction: 'street',
    label: 'Street thug', movement: 'good', fists: 'bare',
    palette: [['black', 'black'], ['navy', 'charcoal'], ['maroon', 'black']],
    designs: [
      { label: 'Black track jacket', top: { kind: 'jacket', color: '#16171b', zip: true, trim: '#e9e9ec' }, bottom: { kind: 'joggers', color: '#1c1c20' }, head: { kind: 'beanie', color: '#26262b' }, feet: { kind: 'trainer', color: '#e9e9ec' } },
      { label: 'Red track jacket', top: { kind: 'jacket', color: '#7a1a20', zip: true, trim: '#e9e9ec' }, bottom: { kind: 'joggers', color: '#26262b' }, head: { kind: 'beanie', color: '#16171b' }, feet: { kind: 'trainer', color: '#16171b' } },
    ],
  },
  business: {
    // Trained: a civilian: never trained to fight (`skill`: OUTFITS' tiers).
    skill: 0.1,
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
    // Trained: a gang's enforcer: fights often, untaught (`skill`: OUTFITS' tiers).
    skill: 0.3,
    faction: 'street',
    label: 'Yakuza', movement: 'good', fists: 'bare', kick: 1.1,
    headgear: ['hat'],
    palette: [[null, 'black'], [null, 'charcoal'], [null, 'white'], [null, 'navy']],
    designs: [
      { label: 'Bare back', tattoo: 'full', bottom: { kind: 'slacks', color: '#16161a' }, feet: { kind: 'compactBoot', color: '#0e0e10' }, top: { kind: 'sportsBra', color: '#16161a', female: true } },
    ],
  },
  swat: {
    // Trained: a tactical team's training (`skill`: OUTFITS' tiers).
    skill: 0.55,
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
    // Trained: academy defensive tactics (`skill`: OUTFITS' tiers).
    skill: 0.4,
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
    // Trained: drilled to the shield line (`skill`: OUTFITS' tiers).
    skill: 0.45,
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
    // Trained: selected and trained for years (`skill`: OUTFITS' tiers).
    skill: 0.7,
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
    // Trained: a knight: trained in arms from a page (`skill`: OUTFITS' tiers).
    skill: 0.75,
    // Rides (full plate: the great horse in a steel bard).
    horse: 'destrier', barding: 'plate',
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
    // Trained: in plate among knights (`skill`: OUTFITS' tiers).
    skill: 0.75,
    // Rides (full plate: the great horse in a steel bard).
    horse: 'destrier', barding: 'plate',
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
  // The German jousting harness of the 1480s–1500s (Stechzeug, for the
  // Gestech with crowned or sharp lances): the frog-mouthed helm (stechhelm)
  // bolted to the breastplate front and back, a thick reinforced breastplate
  // with the lance rest and the queue on the right, the tilting targe tied
  // to the left breast, laminated pauldrons over mail at the armpits, long
  // laminated tassets. Built to take a lance square on the helm and breast:
  // ~40–45 kg (the Vienna harnesses), against ~25 kg for field plate. So:
  // - the head: the helm alone weighs ~9 kg, stands well off the skull over
  //   a thick padded cap laced to it, and its smooth steel sweeps a point
  //   off; a blow there does half what it does to a knight in his bascinet
  //   (measured in test/tournament.test.js);
  // - completely proof against an edge, a point finds fewer gaps (the plates
  //   overlap and are bolted) and the steel is thicker: pierce 0.95;
  // - the helm bolted to the cuirass (`headLocked`): the head cannot turn,
  //   nod or duck apart from the body, and he sees only through the slit;
  //   he fights by feel more than sight (`skillFactor`: three quarters of his skill);
  // - the weight and the one rigid shell of helm and breast stand him
  //   against a blow (`poise`), and he moves slowly (`movement: 'slow'`).
  // Not dealt at random (no `family`); in no level.
  tournament: {
    // Trained: a knight: trained in arms from a page (`skill`: OUTFITS' tiers).
    skill: 0.75,
    // Rides (full plate: the great horse in a steel bard).
    horse: 'destrier', barding: 'plate',
    faction: 'knights', bulletRating: 1000, plated: true,
    label: 'Stechzeug — jousting harness',
    breastplate: 0.85,
    arrowproof: true,
    sidearm: 'longsword',
    movement: 'slow', fists: 'gauntlet',
    // ~0.5 of a knight's weight is field plate; the Stechzeug is ~1.7 times as heavy.
    extraMass: 0.8,
    // The helm and the reinforced breast bolted into one rigid shell: a blow anywhere on it is taken by the whole man.
    poise: 1,
    headLocked: true,
    skillFactor: 0.75,
    // The frog-mouth helm: another man's head stays well outside it in a clinch.
    headBulk: 1.5,
    // Overlapping plates bolted together: half the gaps a point finds in field plate; and under them
    // the thick quilted jousting doublet and mail (BLADES.gaps `under`: field plate's arming coat 0.25/0.3/0.2).
    gaps: { thrust: 0.12, under: { blunt: 0.35, cut: 0.5, pierce: 0.4 } },
    protection: {
      blunt: 0.65, cut: 1, pierce: 0.95, bullet: { head: 0.75, torso: 0.85, limb: 0.35 },
      regions: { head: { blunt: 0.7, cut: 1, pierce: 0.95, deflects: true } },
    },
    cutProof: true,
    courage: 0.55,
    deflects: true,
    designs: [
      tournamentDesign('Bright steel, red and white', { steel: '#c2c7ce', under: '#2a2622', leather: '#6b4528', colour: '#a8201e', colour2: '#ece6d8' }),
      tournamentDesign('Blued steel, black and gold', { steel: '#5d6672', under: '#1c1a18', leather: '#4a3020', colour: '#1c1c20', colour2: '#d4a83a' }),
      tournamentDesign('Bright steel, blue and white', { steel: '#c9ced5', under: '#26283a', leather: '#7a5434', colour: '#23408a', colour2: '#ece6d8' }),
      // The helm in three shapes nearer the surviving ones (the waisted, concave profile; ridged), to choose between.
      tournamentDesign('Augsburg helm: fluted, brass, red and white', { style: 'augsburg', steel: '#c2c7ce', under: '#2a2622', leather: '#6b4528', colour: '#a8201e', colour2: '#ece6d8' }),
      tournamentDesign('Frog helm: plain steel, green and white', { style: 'frog', steel: '#cfd3d9', under: '#26302a', leather: '#6b4528', colour: '#2f6a3a', colour2: '#ece6d8' }),
      tournamentDesign('Gothic helm: russet and brass, black and gold', { style: 'gothic', steel: '#6a4a3a', under: '#1c1a18', leather: '#4a3020', colour: '#1c1c20', colour2: '#d4a83a', gold: '#d0a640' }),
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
    // Trained: a brother-knight: a life of arms under a Rule (`skill`: OUTFITS' tiers).
    skill: 0.8,
    // Rides (a knight of the Temple: the great horse, unarmoured (the Rule kept the brothers plain)).
    horse: 'destrier',
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
    // Trained: a drilled foot soldier (`skill`: OUTFITS' tiers).
    skill: 0.35,
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
    // Trained: a warrior born, trained in arms from childhood (`skill`: OUTFITS' tiers).
    skill: 0.75,
    // Rides (the samurai fought from the saddle, the bow first).
    horse: 'japanese',
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
    // Trained: a warrior born, trained in arms from childhood (`skill`: OUTFITS' tiers).
    skill: 0.75,
    // Rides (the o-yoroi was made to be worn on horseback).
    horse: 'japanese',
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
    // Trained: a warrior born, trained in arms from childhood (`skill`: OUTFITS' tiers).
    skill: 0.7,
    // Rides (mounted samurai of the Sengoku).
    horse: 'japanese',
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
    // Trained: a drilled foot soldier, a season's training (`skill`: OUTFITS' tiers).
    skill: 0.35,
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
    // Trained: a gladiator: a professional, trained daily in the ludus (`skill`: OUTFITS' tiers).
    skill: 0.7,
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
    // Trained: a gladiator: a professional, trained daily in the ludus (`skill`: OUTFITS' tiers).
    skill: 0.7,
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
    // Trained: a gladiator: a professional, trained daily in the ludus (`skill`: OUTFITS' tiers).
    skill: 0.7,
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
    // Trained: a gladiator: a professional, trained daily in the ludus (`skill`: OUTFITS' tiers).
    skill: 0.7,
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
    // Trained: a gladiator: a professional, trained daily in the ludus (`skill`: OUTFITS' tiers).
    skill: 0.7,
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
    // Trained: a general made gladiator (`skill`: OUTFITS' tiers).
    skill: 0.85,
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
    // Trained: an emperor who trained with the gladiators (`skill`: OUTFITS' tiers).
    skill: 0.6,
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
    // Trained: an arena hand, not a fighter (`skill`: OUTFITS' tiers).
    skill: 0.35,
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
    // Trained: a gladiator: a professional, trained daily in the ludus (`skill`: OUTFITS' tiers).
    skill: 0.7,
    faction: 'gladiators',
    label: 'Gladiator — scissor', family: 'gladiator', movement: 'good', fists: 'bare',
    palette: [[null, 'cream'], [null, 'undyed'], [null, 'wine'], [null, 'rust']],
    extraMass: 0.38,
    protection: { ...ARENA.scale, bullet: { head: 0.4, torso: 0.3, limb: 0.1 }, regions: { head: ARENA.smoothHelm, limb: ARENA.bare, rUpperArm: ARENA.manica, rForearm: ARENA.manica, lForearm: ARENA.tube, lUpperArm: ARENA.manica, Shank: ARENA.greave } },
    courage: 0.3,
    designs: GLADIATOR_LOOKS.map((look) => gladiatorDesign('scissor', look, { kind: 'arenaHelm', style: 'scissor' })),
  },
  // Ming garrison: a hemp vest and a cloth head wrap, no armour (the weisuo
  // levy of the 16th century, unpaid and ill-kept); quick on his feet.
  mingGarrison: {
    skill: 0.25,
    faction: 'chinese',
    label: 'Ming — garrison', family: 'chinese', movement: 'good', fists: 'bare',
    // No sidearm: a garrison man who loses his weapon fights with his hands.
    extraMass: 0.06,
    protection: { blunt: 0.1, cut: 0.1, pierce: 0.05 },
    courage: 0,
    designs: [
      mingGarrisonDesign('Hemp vest, rose sash', '#7a6450', '#b77f86', '#6b5240'),
      mingGarrisonDesign('Dark hemp, red sash', '#5e4a3a', '#9a3a34', '#7a6046'),
      mingGarrisonDesign('Pale hemp, rose sash', '#8f7a62', '#c08a8e', '#5a4636'),
      mingGarrisonDesign('Hemp vest, faded blue sash', '#73604d', '#5d6f86', '#6b5240'),
      mingGarrisonDesign('Brown vest, ochre sash', '#6a4f3a', '#b08a4a', '#8a7052'),
    ],
  },
  // Ming brigandine: plates riveted inside a long coat, steel bracers, an
  // iron helmet with a wide brim; a regular army's kit, better than a
  // levy's, never full cover.
  mingBrigandine: {
    skill: 0.35,
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
      mingBrigandineDesign('Iron scale, red coat', '#9a1f1a', '#8f949b', { kind: 'mingScaleCoat', lace: '#3a1410' }),
    ],
  },
  // Ming elite: the long brigandine coat to the knee reinforced with plates,
  // a mirror plate on the chest, a throat collar, segmented arm guards, a
  // steel bowl helmet with a padded coif — or a steel neck guard and a steel
  // face mask. Covered from head to knee: a blade glances off it as off a
  // knight's plate, and so do arrows.
  mingElite: {
    // Rides (Ming elite cavalry on northern horses).
    horse: 'steppe',
    skill: 0.6,
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
      mingEliteDesign('Imperial blue', '#1f2f6a', '#e8e0cc', '#a7adb6'),
      mingEliteDesign('Black and gold, masked', '#18181c', '#5a1a14', '#8f949b', { mask: true }),
      mingEliteDesign('Gilt scale', '#5a1a14', '#7a1418', '#b8a066', {}, { kind: 'mingScale', lace: '#3a2016' }),
      mingEliteDesign('Steel scale, masked', '#1c1c20', '#e8e0cc', '#a7adb6', { mask: true }, { kind: 'mingScale', lace: '#1a1c24' }),
      // Qi Jiguang's and his household guards' (Qi Jiguang's level): the elite's protection drawn as
      // iron lamellar laced in crimson over the crimson coat. A level's, not dealt at random.
      { ...mingEliteDesign('Iron lamellar, crimson lacing', '#8a1418', '#8a1418', '#8f949b', {}, { kind: 'mingEliteLamellar', lace: '#8a1418' }), levelOnly: true },
    ],
  },
  // The Iron Pagoda (tiefutu): the Jurchen Jin's armoured heavy horse of the
  // 1120s–40s, a legend of an earlier age (not in the Ming levels). As the
  // reconstructions show it: lamellar of small dotted iron plates from the
  // shoulders to below the knee over a red robe, a tall pointed helmet with
  // a plume, and an aventail rolled up round the face so only the eyes show.
  // Fought here on foot, with the mace. The flagship of its faction, drawn in full.
  ironPagoda: {
    // Rides (the Jurchen iron pagoda: men and horses in iron lamellar).
    horse: 'steppe', barding: 'lamellar',
    skill: 0.7,
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
    // Trained: a legend (`skill`: OUTFITS' tiers).
    skill: 0.9,
    // Rides (Red Hare).
    horse: 'warhorse',
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
    skill: 0.3,
    faction: 'chinese',
    label: 'Han soldier — iron lamellar', movement: 'good', fists: 'bare',
    // Han crossbowmen stood in ranks and shot, the ranks relieving each other; they held their ground.
    drill: { advance: false },
    sidearm: 'jian',
    // Iron lamellae turn an arrow that does not find a gap, as any rigid iron does (`arrowproof`; ranged.js arrowHit):
    // Chao Cuo's memorial (169 BC) has the Xiongnu's leather and their arrows no match for Han iron. The arms and legs, cloth.
    arrowproof: true,
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
  // A Han horseman: the same iron lamellar coat and helmet as the crossbowmen
  // (Han cavalry wore the infantry's lamellar), but not in their ranks: the
  // Ferghana-bred horse of the frontier armies (HORSES.warhorse).
  hanCavalry: {
    // Rides (the Han army's horse: the "heavenly horses" bought from Ferghana, Wu Di's reign).
    horse: 'warhorse',
    skill: 0.3,
    faction: 'chinese',
    label: 'Han cavalry — iron lamellar', movement: 'good', fists: 'bare',
    sidearm: 'jian',
    arrowproof: true,
    extraMass: 0.18,
    protection: { blunt: 0.4, cut: 0.82, pierce: 0.62, bullet: { head: 0, torso: 0.15, limb: 0 }, regions: { head: { blunt: 0.3, cut: 0.75, pierce: 0.5 }, limb: { blunt: 0.04, cut: 0.08, pierce: 0.03 } } },
    courage: 0.3,
    designs: [
      { label: 'Red robe, iron lamellar', top: { kind: 'longsleeve', color: '#8a2a20' }, bottom: { kind: 'pants', color: '#2a2420' }, armor: { kind: 'hanLamellar', color: '#5d6066', cloth: '#8a2a20', cloth2: '#5a1a14', lace: '#3a2a20' }, head: { kind: 'hanHelm', color: '#5d6066', lace: '#3a2a20' }, feet: { kind: 'compactBoot', color: '#1a1614' } },
    ],
  },
  // The wuxia swordsman's dress: a light robe crossed over the breast and
  // open below the waist for the legs, a sash, cloth shoes; no armour.
  wuxia: {
    skill: 0.85,
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
    // Trained: a professional of 25 years' service, drilled at the post daily (`skill`: OUTFITS' tiers).
    skill: 0.55,
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
    // Trained: a centurion: risen through the ranks (`skill`: OUTFITS' tiers).
    skill: 0.75,
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
  // A trooper of an auxiliary cavalry wing (ala) of the early Empire: a mail
  // shirt (lorica hamata) to mid-thigh over a tunic, the Gallic trousers
  // (bracae) of the horse, a cavalry galea, and the spatha at his hip; the
  // alae were raised from Gauls, Thracians, Batavians and Spaniards, who
  // brought their own horses (HORSES.warhorse: the light Iberian and Gallic
  // riding horse).
  romanAuxiliary: {
    // Trained: a long-service auxiliary (`skill`: OUTFITS' tiers).
    skill: 0.5,
    // Rides (auxiliary cavalry).
    horse: 'warhorse',
    faction: 'romans',
    label: 'Auxiliary cavalry — mail and spatha', movement: 'good', fists: 'bare',
    sidearm: 'dagger',
    extraMass: 0.26,
    protection: { blunt: 0.35, cut: 0.9, pierce: 0.5, bullet: { head: 0.25, torso: 0.15, limb: 0 }, regions: { head: { blunt: 0.55, cut: 0.95, pierce: 0.75, deflects: true }, limb: { blunt: 0.03, cut: 0.1, pierce: 0.03 } } },
    courage: 0.45,
    designs: [
      { label: 'Mail, red tunic, bracae', top: { kind: 'tunic', color: '#7a2a22' }, bottom: { kind: 'pants', color: '#5a4c36' }, armor: { kind: 'hauberk', color: '#8d9097' }, head: { kind: 'galea', color: '#b8bec6', gold: '#9a7a3a' }, feet: { kind: 'compactBoot', color: '#3a2416' } },
      { label: 'Mail, blue tunic, bracae', top: { kind: 'tunic', color: '#2f4468' }, bottom: { kind: 'pants', color: '#4a4030' }, armor: { kind: 'hauberk', color: '#8d9097' }, head: { kind: 'galea', color: '#b8bec6', gold: '#9a7a3a' }, feet: { kind: 'compactBoot', color: '#3a2416' } },
    ],
  },
  // ---- The steppe, 14th–17th centuries: Mongol, Oirat and Timurid warriors,
  // the archer in his deel, the man in leather lamellar; and the Khan's own
  // guard in gilt iron scale. Fought on foot here. ----
  steppeLight: {
    // Trained: raised in the saddle and the hunt (`skill`: OUTFITS' tiers).
    skill: 0.45,
    // Rides (every steppe warrior rode).
    horse: 'steppe',
    faction: 'steppe',
    label: 'Steppe — deel and fur hat', movement: 'good', fists: 'bare',
    sidearm: 'saber',
    designs: [
      steppeDesign('Maroon deel', { kind: 'mongolDeel' }, '#6a1f2a', '#c41e22', { kind: 'loovuuz', color: '#b3161b' }),
      steppeDesign('Blue deel', { kind: 'mongolDeel' }, '#2f4a7a', '#d6a743', { kind: 'loovuuz', color: '#b3161b', fur: 0x4a3420 }),
      steppeDesign('Ochre deel', { kind: 'mongolDeel' }, '#a8742a', '#6a1f2a', { kind: 'loovuuz', color: '#1c1a18', fur: 0x5a3e24, plume: 0x1c1a18 }),
    ],
  },
  // Hardened leather lamellar over the deel, a fur stole, the fur hat: the
  // body proof against a glancing cut; the hat's thick fur and felt take the
  // edge off a blow but no more (`regions`).
  steppeMedium: {
    // Trained: a seasoned steppe warrior (`skill`: OUTFITS' tiers).
    skill: 0.5,
    // Rides (every steppe warrior rode).
    horse: 'steppe',
    faction: 'steppe',
    label: 'Steppe — leather lamellar, fur hat', movement: 'good', fists: 'bare',
    sidearm: 'saber',
    extraMass: 0.14,
    protection: { blunt: 0.3, cut: 0.6, pierce: 0.45, bullet: { head: 0, torso: 0.15, limb: 0.05 }, regions: { head: { blunt: 0.15, cut: 0.25, pierce: 0.1 } } },
    courage: 0.2,
    designs: [
      steppeDesign('Gilt leather, maroon deel', { kind: 'mongolLamellar', matte: true, color: '#8a5a2a', lace: '#2a1a12', fur: '#8a6438' }, '#6a1f2a', '#c41e22', { kind: 'loovuuz', color: '#b3161b' }),
      steppeDesign('Brown leather, blue deel', { kind: 'mongolLamellar', matte: true, color: '#6a4a2a', lace: '#1c1410', fur: '#5a4030' }, '#2f4a7a', '#7a2418', { kind: 'loovuuz', color: '#b3161b', fur: 0x4a3420 }),
      steppeDesign('Black leather, red deel', { kind: 'mongolLamellar', matte: true, color: '#2a2420', lace: '#8a1418', fur: '#3a3028' }, '#8a1418', '#24201c', { kind: 'loovuuz', color: '#d6a743' }),
    ],
  },
  // Ming heavy cavalry of the north (14th–16th centuries), armed and cut as
  // their steppe enemies were: iron lamellar to the knees over the robe, a fur
  // stole, iron bracers, a tall helmet with a lamellar aventail.
  mingIronLamellar: {
    // Rides (Ming northern heavy cavalry).
    horse: 'steppe',
    skill: 0.4,
    faction: 'chinese',
    label: 'Ming — iron lamellar cavalry', movement: 'good', fists: 'bare',
    sidearm: 'saber',
    arrowproof: true,
    extraMass: 0.32,
    protection: { blunt: 0.5, cut: 0.88, pierce: 0.72, bullet: { head: 0.3, torso: 0.35, limb: 0.15 } },
    courage: 0.3,
    designs: [
      steppeDesign('Iron, maroon deel', { kind: 'mongolIron', color: '#7d8088', lace: '#2a1a12', fur: '#7a5634' }, '#6a1f2a', '#c41e22', { kind: 'steppeHelm', color: '#7d8088', coif: '#5a5d63', tassel: '#b3161b' }),
      steppeDesign('Iron, blue deel', { kind: 'mongolIron', color: '#6a6d73', lace: '#8a1418', fur: '#4a3a2a' }, '#2f4a7a', '#8a1418', { kind: 'steppeHelm', color: '#6a6d73', coif: '#4a4d52', tassel: '#b3161b' }),
      steppeDesign('Blackened iron, red deel', { kind: 'mongolIron', color: '#34363a', lace: '#a8742a', fur: '#2a2420' }, '#8a1418', '#24201c', { kind: 'steppeHelm', color: '#34363a', coif: '#2a2c30', tassel: '#b3161b' }),
    ],
  },
  // The kheshig: the Khan's own guard, from Chinggis Khan's day on through
  // the Northern Yuan khans (Mandukhai's, Ganbold's): gilt-edged iron
  // scale with broad shoulder guards and a gilt boss, the masked helmet.
  kheshig: {
    // Trained: the Khan's picked guard (`skill`: OUTFITS' tiers).
    skill: 0.75,
    // Rides (the khan's guard: the heaviest steppe kit, its horses in lamellar).
    horse: 'steppe', barding: 'lamellar',
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
  // ---- The horse peoples and the armies that met them (the Battle Mode levels of
  // Mobei, the Catalaunian Plains and Carrhae): the Xiongnu and the Huns, horse
  // archers in felt and leather; the late Roman foot and the Visigoths of 451;
  // the Roman legion of the Republic (53 BC); the Parthians' cataphracts and
  // horse archers. ----
  // A Xiongnu horseman of the 2nd century BC (the Noin-Ula and Ivolga graves,
  // Sima Qian's account): a felt or leather coat belted over trousers, soft
  // boots, a fur hat; the composite bow and its quiver at the hip, a short iron
  // sword. No armour to speak of for most: what the felt and leather keep off
  // a glancing cut, little against a point. Raised to the bow in the saddle from
  // boyhood (the Shiji: 'the boys ride sheep and shoot birds and rats'): a
  // better shot than a levied crossbowman (`skill`).
  xiongnu: {
    // Rides (every Xiongnu man rode; the small hardy steppe horse).
    horse: 'steppe',
    skill: 0.55,
    faction: 'steppe',
    label: 'Xiongnu — felt coat, fur hat', movement: 'good', fists: 'bare',
    // A horse archer's quiver: thirty to forty arrows (the Strategikon's; a Mongol carried two such), and no more until he is resupplied.
    quiver: 36,
    sidearm: 'shortSword',
    extraMass: 0.06,
    protection: { blunt: 0.15, cut: 0.25, pierce: 0.12, bullet: { head: 0, torso: 0, limb: 0 }, regions: { head: { blunt: 0.12, cut: 0.18, pierce: 0.06 } } },
    courage: 0.25,
    designs: [
      steppeDesign('Undyed felt, fox hat', { kind: 'mongolDeel' }, '#9a8a6a', '#5a4030', { kind: 'furHat', color: '#6a5a44', fur: 0x8a5a2a }),
      steppeDesign('Brown leather, wolf hat', { kind: 'mongolDeel' }, '#6a4a2e', '#2a2018', { kind: 'furHat', color: '#4a3a2a', fur: 0x6a6258 }),
      steppeDesign('Dark felt, sable hat', { kind: 'mongolDeel' }, '#3a3430', '#8a2a1e', { kind: 'furHat', color: '#2a2420', fur: 0x2a2018 }),
    ],
  },
  // A Hun horseman of Attila's day (451): the same horse-people's dress, a
  // caftan of felt or leather over trousers, a cap; the composite bow (the
  // asymmetric Hunnic bow with its bone laths), and the long straight sword the
  // Huns carried, a spatha. Most unarmoured.
  hun: {
    horse: 'steppe',
    skill: 0.55,
    faction: 'steppe',
    label: 'Hun — caftan and cap', movement: 'good', fists: 'bare',
    quiver: 36,
    sidearm: 'spatha',
    extraMass: 0.06,
    protection: { blunt: 0.15, cut: 0.25, pierce: 0.12, bullet: { head: 0, torso: 0, limb: 0 }, regions: { head: { blunt: 0.12, cut: 0.18, pierce: 0.06 } } },
    courage: 0.25,
    designs: [
      steppeDesign('Grey felt, fur cap', { kind: 'mongolDeel' }, '#7a7468', '#3a2a1e', { kind: 'furHat', color: '#5a5044', fur: 0x5a4a38 }),
      steppeDesign('Red-brown caftan, fur cap', { kind: 'mongolDeel' }, '#7a3a24', '#d6a743', { kind: 'furHat', color: '#3a2a1e', fur: 0x3a2e24 }),
      steppeDesign('Ochre leather, felt cap', { kind: 'mongolDeel' }, '#9a7440', '#2a2420', { kind: 'bashlyk', color: '#6a5a44' }),
    ],
  },
  // A Hunnic noble, one of Attila's own (logades): what a lord of the
  // horse-peoples could buy or take: a mail shirt or leather lamellar, a
  // segmented iron helmet (the spangenhelm the Huns and Germans shared).
  hunNoble: {
    horse: 'steppe',
    skill: 0.6,
    faction: 'steppe',
    label: 'Hun noble — mail and spangenhelm', movement: 'good', fists: 'bare',
    quiver: 36,
    sidearm: 'spatha',
    extraMass: 0.2,
    protection: { blunt: 0.35, cut: 0.85, pierce: 0.48, bullet: { head: 0.2, torso: 0.15, limb: 0 }, regions: { head: { blunt: 0.5, cut: 0.92, pierce: 0.7, deflects: true }, limb: { blunt: 0.04, cut: 0.1, pierce: 0.04 } } },
    courage: 0.4,
    designs: [
      steppeDesign('Mail, red caftan', { kind: 'hauberk', color: '#8d9097' }, '#7a2a1e', '#d6a743', { kind: 'spangenhelm', color: '#7d8088', gold: '#b98a3e' }),
      steppeDesign('Leather lamellar, blue caftan', { kind: 'mongolLamellar', matte: true, color: '#5a3e24', lace: '#1c1410', fur: '#5a4030' }, '#2f4468', '#8a1418', { kind: 'spangenhelm', color: '#6a6d73', gold: '#9a7a3a' }),
    ],
  },
  // A soldier of the late Roman field army (comitatenses) in Aetius's Gaul,
  // 451: a mail shirt (lorica hamata) over the long-sleeved tunic, trousers
  // and closed boots (the army's dress by then), the ridge helmet (two iron
  // halves joined by a ridge, cheek pieces, a neck guard: the Berkasovo and
  // Intercisa type), and the big oval shield painted with his unit's device;
  // the spear (hasta) and the spatha. Mail turns a cut; a point or an arrow
  // goes through it more often than through plate (`pierce`).
  lateRoman: {
    faction: 'romans',
    skill: 0.4,
    label: 'Late Roman — mail and ridge helmet', movement: 'good', fists: 'bare',
    // The late Roman line received a charge standing, shields locked (the foulkon), and held.
    drill: { advance: false, testudo: true },
    sidearm: 'spatha',
    extraMass: 0.24,
    protection: { blunt: 0.35, cut: 0.88, pierce: 0.5, bullet: { head: 0.25, torso: 0.15, limb: 0 }, regions: { head: { blunt: 0.55, cut: 0.95, pierce: 0.75, deflects: true }, limb: { blunt: 0.03, cut: 0.08, pierce: 0.03 }, UpperArm: { blunt: 0.3, cut: 0.82, pierce: 0.45 } } },
    courage: 0.4,
    designs: [
      { label: 'Mail, white tunic, red shield', top: { kind: 'longsleeve', color: '#d8cfb8' }, bottom: { kind: 'pants', color: '#4a4036' }, armor: { kind: 'haubergeon', color: '#8d9097', cloth: '#b3161b' }, head: { kind: 'ridgeHelm', color: '#8d9097', gold: '#b98a3e' }, feet: { kind: 'compactBoot', color: '#2a1e16' } },
      { label: 'Mail, red tunic, blue shield', top: { kind: 'longsleeve', color: '#8a2a22' }, bottom: { kind: 'pants', color: '#3a342c' }, armor: { kind: 'haubergeon', color: '#8d9097', cloth: '#2a4a8a' }, head: { kind: 'ridgeHelm', color: '#7d8088', gold: '#9a7a3a' }, feet: { kind: 'compactBoot', color: '#2a1e16' } },
    ],
  },
  // A Visigoth warrior of Theoderic's army: a tunic and trousers, a cloak,
  // the round shield of planks with its iron boss, the spear or the spatha;
  // a helmet and mail only for the well-off (`gothNoble`).
  goth: {
    faction: 'goths',
    skill: 0.35,
    label: 'Visigoth — tunic and round shield', movement: 'good', fists: 'bare',
    sidearm: 'spatha',
    extraMass: 0.04,
    protection: { blunt: 0.08, cut: 0.12, pierce: 0.06, bullet: { head: 0, torso: 0, limb: 0 } },
    courage: 0.35,
    designs: [
      { label: 'Undyed tunic, green trousers', top: { kind: 'tunic', color: '#c8bc9e' }, bottom: { kind: 'pants', color: '#3f5a3a' }, armor: { kind: 'girdle', color: '#c8bc9e', cloth: '#3f5a3a' }, feet: { kind: 'compactBoot', color: '#3a2a1e' } },
      { label: 'Blue tunic, brown trousers', top: { kind: 'tunic', color: '#3a5276' }, bottom: { kind: 'pants', color: '#5a4430' }, armor: { kind: 'girdle', color: '#3a5276', cloth: '#9a2a1e' }, feet: { kind: 'compactBoot', color: '#3a2a1e' } },
      { label: 'Red tunic, grey trousers', top: { kind: 'tunic', color: '#8a3424' }, bottom: { kind: 'pants', color: '#6b6e74' }, armor: { kind: 'girdle', color: '#8a3424', cloth: '#d6a743' }, feet: { kind: 'compactBoot', color: '#3a2a1e' } },
    ],
  },
  // A Visigoth noble and his household men: mail, the spangenhelm, a riding
  // horse of his own (Thorismund's horse came down off the ridge on the Huns).
  gothNoble: {
    horse: 'warhorse',
    faction: 'goths',
    skill: 0.5,
    label: 'Visigoth noble — mail and spangenhelm', movement: 'good', fists: 'bare',
    sidearm: 'spatha',
    extraMass: 0.22,
    protection: { blunt: 0.35, cut: 0.88, pierce: 0.5, bullet: { head: 0.2, torso: 0.15, limb: 0 }, regions: { head: { blunt: 0.5, cut: 0.92, pierce: 0.7, deflects: true }, limb: { blunt: 0.04, cut: 0.1, pierce: 0.04 } } },
    courage: 0.5,
    designs: [
      { label: 'Mail, red cloak', top: { kind: 'longsleeve', color: '#8a2a22' }, bottom: { kind: 'pants', color: '#4a3e30' }, armor: { kind: 'hauberk', color: '#8d9097', cloth: '#8a2a22' }, head: { kind: 'spangenhelm', color: '#8d9097', gold: '#b98a3e' }, feet: { kind: 'compactBoot', color: '#2a1e16' } },
      { label: 'Mail, blue cloak', top: { kind: 'longsleeve', color: '#2f4468' }, bottom: { kind: 'pants', color: '#3a342c' }, armor: { kind: 'hauberk', color: '#8d9097', cloth: '#2f4468' }, head: { kind: 'spangenhelm', color: '#7d8088', gold: '#c9a24a' }, feet: { kind: 'compactBoot', color: '#2a1e16' } },
    ],
  },
  // A legionary of the late Republic (Crassus's legions, 53 BC): the mail
  // shirt (lorica hamata) to the hip with doubled shoulders, the bronze
  // Montefortino helmet with its knob and horsehair plume, the oval curved
  // scutum, the gladius (and the pilum, thrown before the charge: not here).
  // Mail over the trunk and shoulders, the arms and legs bare: at Carrhae the
  // arrows that came round and over the shields nailed hands to shields and feet
  // to the ground (Plutarch, Crassus 25).
  republicanLegionary: {
    // Trained: a professional, drilled at the post (`skill`: OUTFITS' tiers).
    skill: 0.55,
    faction: 'romans', plated: true,
    label: 'Legionary of the Republic — mail and Montefortino', movement: 'good', fists: 'bare',
    drill: { advance: true, charge: 8, testudo: true },
    sidearm: 'dagger',
    extraMass: 0.25,
    protection: { blunt: 0.35, cut: 0.9, pierce: 0.5, bullet: { head: 0.25, torso: 0.15, limb: 0 }, regions: { head: { blunt: 0.55, cut: 0.92, pierce: 0.72, deflects: true }, limb: { blunt: 0, cut: 0, pierce: 0 }, UpperArm: { blunt: 0.3, cut: 0.85, pierce: 0.45 } } },
    courage: 0.4,
    designs: [
      { label: 'Mail, red tunic, bronze helmet', top: { kind: 'tunic', color: '#8a2a22' }, bottom: { kind: 'loincloth', color: '#8a2a22' }, armor: { kind: 'hamata', color: '#8d9097', gold: '#b98a3e', lace: '#3a2416' }, head: { kind: 'montefortino', color: '#b98a3e', plume: '#1a1a1d' }, feet: { kind: 'sandal', color: '#3a2416' } },
    ],
  },
  // A Parthian cataphract (Surena's, at Carrhae): man and horse in armour,
  // the man in a coat of iron scales to the knee over a tunic, laminated
  // defences of iron hoops on arms and legs (as the Dura-Europos and Khalchayan
  // finds and the Tang-i Sarvak relief show), a conical helmet with a mail
  // hood over the face; the horse in a trapper of scales (drawn, and met, as
  // lamellar barding). The kontos in both hands. Plutarch has the Romans
  // dismayed by the glitter of the 'helmets and breastplates of Margianian
  // steel' when the Parthians threw off their coverings.
  cataphract: {
    horse: 'arabian', barding: 'lamellar',
    faction: 'parthians',
    skill: 0.65,
    label: 'Parthian cataphract — scale and kontos', movement: 'limited', fists: 'gauntlet',
    sidearm: 'spatha',
    arrowproof: true,
    extraMass: 0.4,
    protection: { blunt: 0.55, cut: 0.94, pierce: 0.82, bullet: { head: 0.4, torso: 0.4, limb: 0.3 } },
    courage: 0.55,
    designs: [
      { label: 'Iron scale, red tunic', top: { kind: 'longsleeve', color: '#7a1e1e' }, bottom: { kind: 'pants', color: '#4a2a22' }, armor: { kind: 'cataphract', color: '#7d8088', lace: '#2a1a12', cloth: '#7a1e1e' }, head: { kind: 'steppeHelm', color: '#7d8088', coif: '#5a5d63', mask: true, plume: '#b3161b' }, feet: { kind: 'compactBoot', color: '#1a1614' } },
      { label: 'Bright scale, dark tunic', top: { kind: 'longsleeve', color: '#2a2a30' }, bottom: { kind: 'pants', color: '#2a2622' }, armor: { kind: 'cataphract', color: '#a7adb6', lace: '#3a2416', cloth: '#2a2a30' }, head: { kind: 'steppeHelm', color: '#a7adb6', coif: '#7d8088', mask: true, gold: '#c9a24a' }, feet: { kind: 'compactBoot', color: '#1a1614' } },
    ],
  },
  // A Parthian horse archer: the belted tunic and baggy trousers of the
  // Iranian horseman, a soft felt cap (bashlyk) or bare-headed; no armour;
  // the composite bow and a full quiver, a dagger or short sword. The bulk of
  // Surena's ten thousand.
  parthianArcher: {
    horse: 'arabian',
    faction: 'parthians',
    skill: 0.55,
    label: 'Parthian horse archer — tunic and bashlyk', movement: 'good', fists: 'bare',
    // The same quiver; at Carrhae Surena's camel train brought them fresh arrows (Plutarch, Crassus 25): a level's `train`.
    quiver: 36,
    sidearm: 'shortSword',
    extraMass: 0.03,
    protection: { blunt: 0.06, cut: 0.1, pierce: 0.05, bullet: { head: 0, torso: 0, limb: 0 } },
    courage: 0.3,
    designs: [
      { label: 'Ochre tunic, felt cap', top: { kind: 'longsleeve', color: '#b8862e' }, bottom: { kind: 'pants', color: '#6a3a24' }, armor: { kind: 'deel', color: '#b8862e', cloth: '#b8862e', cloth2: '#7a1e1e' }, head: { kind: 'bashlyk', color: '#c8bc9e' }, feet: { kind: 'compactBoot', color: '#3a2416' } },
      { label: 'Red tunic, felt cap', top: { kind: 'longsleeve', color: '#8a2a22' }, bottom: { kind: 'pants', color: '#d8cfb8' }, armor: { kind: 'deel', color: '#8a2a22', cloth: '#8a2a22', cloth2: '#d6a743' }, head: { kind: 'bashlyk', color: '#8a2a22' }, feet: { kind: 'compactBoot', color: '#3a2416' } },
      { label: 'Blue tunic, bare head', top: { kind: 'longsleeve', color: '#2f4a7a' }, bottom: { kind: 'pants', color: '#6a5a44' }, armor: { kind: 'deel', color: '#2f4a7a', cloth: '#2f4a7a', cloth2: '#d6a743' }, feet: { kind: 'compactBoot', color: '#3a2416' } },
    ],
  },
  // ---- The Ottomans, 15th–17th centuries: the azap (light infantry, bow
  // and spear), the Janissary (the Sultan's household infantry, its yatagan
  // and its guns), the heavy man in mail-and-plate; and the legend of the
  // 1300s, an alp of Osman's frontier warriors. ----
  azap: {
    skill: 0.25,
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
    skill: 0.5,
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
    // Rides (the sipahi: the Sultan's horsemen).
    horse: 'arabian',
    skill: 0.6,
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
    // Trained: a frontier raider of a warrior band (`skill`: OUTFITS' tiers).
    skill: 0.7,
    // Rides (the gazi raiders rode Turkoman horses).
    horse: 'arabian',
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
  // Salah ad-Din Yusuf ibn Ayyub (1137–1193), as the Ayyubid and Syrian
  // pictures of his century show a sultan armed: a mail hauberk (zardiyya)
  // to the knee, over it the kazaghand (a coat of mail sewn between padded
  // layers, faced with silk, its sleeves to the elbow with tiraz bands of
  // gold), the emir's belt of gilt plaques (mintaqa) and a silk sash; a
  // pointed iron helmet of riveted segments on a quilted cap, a mail
  // aventail over the neck, a turban wound round its foot; riding boots. A
  // legend of an earlier age (not in the levels): the faction's flagship.
  // So: two layers of mail and the padding between them turn an edge well
  // and a point fairly (rings part to it, the quilting holds it), and take
  // more of a blow than bare mail, not much (it moves with the body); the
  // head guarded by steel over quilting and the turban's wraps, the face
  // open; the shins only in boot leather.
  saladin: {
    // Trained: a sultan's mamluk household (`skill`: OUTFITS' tiers).
    skill: 0.8,
    // Rides (Saladin's Arab horses).
    horse: 'arabian',
    faction: 'ottomans',
    // No `family`: never dealt at random (the flagship's own, too detailed for a crowd).
    label: 'Saladin — kazaghand over mail, turbaned helmet', movement: 'good', fists: 'bare',
    arrowproof: true,
    // The horseman's mace (dabbus) at the saddle, the Ayyubid emir's second weapon.
    sidearm: 'mace',
    // Hauberk ~10 kg, kazaghand ~7 kg, helmet and aventail ~2.5 kg: ~0.3 of a 67 kg man.
    extraMass: 0.3,
    // The turban wound round the helmet: another man's head stays outside it in a clinch.
    headBulk: 1.25,
    protection: {
      blunt: 0.4, cut: 0.9, pierce: 0.6, bullet: { head: 0.3, torso: 0.3, limb: 0.15 },
      regions: {
        head: { blunt: 0.6, cut: 0.92, pierce: 0.75, deflects: true },
        Shank: { blunt: 0.1, cut: 0.35, pierce: 0.15 },
      },
    },
    courage: 0.4,
    designs: [
      // Saladin's own colour: the yellow of the Ayyubid banners.
      saladinDesign('Ayyubid yellow', { silk: '#c8a23a', trim: '#8a1e1a', robe: '#e8dcc0', turban: '#f0ebe0' }),
      // Black, the Abbasid caliph's colour, in which the caliph's robes of honour came to him.
      saladinDesign('Abbasid black', { silk: '#1e1c1e', trim: '#c9a23a', robe: '#e8dcc0', turban: '#f0ebe0' }),
      saladinDesign('Crimson and green', { silk: '#7e1a1e', trim: '#2f5a3a', robe: '#d8cfb8', turban: '#ece4d0' }),
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
    // Trained: veterans of the Italian wars (`skill`: OUTFITS' tiers).
    skill: 0.6,
    // Rides (the conquistadors' Andalusian horses).
    horse: 'warhorse',
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
    // Trained: veterans of the Caribbean and Mexico (`skill`: OUTFITS' tiers).
    skill: 0.5,
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
  // ---- The battle maps of 1415: Agincourt ----
  // An English or Welsh archer of Henry V's army: a padded jack (linen or fustian stuffed and quilted, a dozen
  // layers or more: proof against a spent arrow and a glancing cut, not against a blow), in the livery colours a
  // company was clothed in, hose, and a kettle hat or a sallet, or nothing (many fought bareheaded, and some barefoot
  // in the mud). Light and free: the archers ran in among the French men-at-arms. At his belt a falchion or a
  // short sword (`sidearm`); a lead mallet for the stakes, and a dagger.
  archer: {
    // Trained: trained to the bow, not to the hand-stroke (`skill`: OUTFITS' tiers).
    skill: 0.35,
    faction: 'knights',
    label: 'Archer — padded jack', movement: 'excellent', fists: 'bare',
    sidearm: 'shortSword',
    extraMass: 0.08,
    protection: { blunt: 0.2, cut: 0.45, pierce: 0.3, bullet: { head: 0.1, torso: 0.08, limb: 0 } },
    courage: 0.3,
    designs: [
      { label: 'White jack, kettle hat', top: { kind: 'longsleeve', color: '#d8d0bc' }, bottom: { kind: 'tights', color: '#5a2a22' }, armor: { kind: 'escaupil', color: '#d2c8b0', cloth: '#d2c8b0', cloth2: '#b8ad94' }, head: { kind: 'kettleHat', color: '#8a8e95', brim: 1.7 }, feet: { kind: 'compactBoot', color: '#2a1d14' } },
      { label: 'Russet jack, bare head', top: { kind: 'longsleeve', color: '#7a4a2a' }, bottom: { kind: 'tights', color: '#3a3326' }, armor: { kind: 'escaupil', color: '#8a5a36', cloth: '#8a5a36', cloth2: '#6e4628' }, head: null, feet: { kind: 'compactBoot', color: '#2a1d14' } },
      { label: 'Green-and-white livery', top: { kind: 'longsleeve', color: '#2f5a32' }, bottom: { kind: 'tights', color: '#d8d0bc' }, armor: { kind: 'escaupil', color: '#d2c8b0', cloth: '#d2c8b0', cloth2: '#2f5a32' }, head: { kind: 'kettleHat', color: '#7d8087', brim: 1.85 }, feet: { kind: 'compactBoot', color: '#2a1d14' } },
      { label: 'Red jack, sallet', top: { kind: 'longsleeve', color: '#8a2a22' }, bottom: { kind: 'tights', color: '#2a2622' }, armor: { kind: 'escaupil', color: '#9a3a2c', cloth: '#9a3a2c', cloth2: '#7a2a20' }, head: { kind: 'kettleHat', color: '#9aa0a8', brim: 1.55, tall: true }, feet: { kind: 'compactBoot', color: '#2a1d14' } },
    ],
  },
  // ---- Level Mode (Dunnottar): kits no random deal and no picker offers (`levelOnly`) ----
  // The Forgers' operative: a padded gambeson over a dark arming doublet, hose and boots, the head bare.
  // Light and quiet: some cut and point protection from the quilting, none against a blow.
  forger: {
    levelOnly: true,
    faction: 'knights',
    label: 'Forger — gambeson', movement: 'excellent', fists: 'bare',
    sidearm: 'dagger',
    extraMass: 0.1,
    protection: { blunt: 0.2, cut: 0.4, pierce: 0.25, bullet: { head: 0, torso: 0.05, limb: 0 } },
    courage: 0.4,
    designs: [
      { label: 'Storm-grey gambeson', top: { kind: 'longsleeve', color: '#2f3438' }, bottom: { kind: 'pants', color: '#26282a' }, armor: { kind: 'escaupil', color: '#6a6446', cloth: '#6a6446', cloth2: '#4a452f' }, head: null, feet: { kind: 'compactBoot', color: '#2a1d14' } },
    ],
  },
  // The garrison's levy: a quilted jack and a kettle hat, the cheapest kit a lord could issue.
  levy: {
    // Trained: a few weeks' drill (`skill`: OUTFITS' tiers).
    skill: 0.2,
    levelOnly: true,
    faction: 'knights',
    label: 'Levy — quilted jack', movement: 'good', fists: 'bare',
    sidearm: 'dagger',
    extraMass: 0.06,
    protection: { blunt: 0.12, cut: 0.25, pierce: 0.12, bullet: { head: 0.1, torso: 0.05, limb: 0 } },
    courage: 0.05,
    designs: [
      { label: 'Faded jack', top: { kind: 'longsleeve', color: '#6a5a46' }, bottom: { kind: 'pants', color: '#3a3326' }, armor: { kind: 'escaupil', color: '#8a7b62', cloth: '#8a7b62', cloth2: '#6b5e49' }, head: { kind: 'kettleHat', color: '#7d8087', brim: 1.7 }, feet: { kind: 'compactBoot', color: '#2a1d14' } },
      { label: 'Wool-stained jack', top: { kind: 'longsleeve', color: '#4a4a52' }, bottom: { kind: 'pants', color: '#2a2622' }, armor: { kind: 'escaupil', color: '#6e6a5a', cloth: '#6e6a5a', cloth2: '#524f43' }, head: { kind: 'kettleHat', color: '#6a6d74', brim: 1.8 }, feet: { kind: 'compactBoot', color: '#2a1d14' } },
    ],
  },
  // A Mexica warrior: the ichcahuipilli (quilted cotton armour, soaked in
  // brine), a loincloth, sandals, a feathered band. Little against steel.
  mexicaWarrior: {
    // Trained: schooled for war from boyhood (the telpochcalli), a commoner's (`skill`: OUTFITS' tiers).
    skill: 0.4,
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
    // Trained: the jaguar and eagle orders: proven in captures (`skill`: OUTFITS' tiers).
    skill: 0.75,
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
  // Atahualpa's people at Cajamarca, 16 November 1532: by his order they came
  // into the square without their arms (the chroniclers have some with slings
  // and small maces under their tunics), in their finest, singing, sweeping
  // the way before the litter. No armour of any kind: cloth over the body.
  // The commons (`incaUncu`): bearers, sweepers, attendants, in the plain uncu
  // or the checkerboard the Inca gave his guards; the lords (`incaNoble`):
  // the orejones of the Inca's own lineage, in the tocapu-banded uncu with the
  // gold earspools, the Sapa Inca alone in the royal tocapu (a design of its
  // own, `special`: not dealt to another). They never saw a horse or a gun
  // before that year (FACTIONS inca `strangers`).
  incaUncu: {
    // Trained: bearers and attendants, come unarmed (`skill`: OUTFITS' tiers).
    skill: 0.1,
    faction: 'inca',
    label: 'Inca — uncu', family: 'inca', movement: 'excellent', fists: 'bare',
    extraMass: 0.02,
    protection: { blunt: 0.04, cut: 0.05, pierce: 0.03, bullet: { head: 0, torso: 0, limb: 0 } },
    courage: 0.05,
    designs: [
      incaDesign('Undyed uncu', 'uncu', '#c8b89a', '#6a4428'),
      incaDesign('Brown uncu', 'uncu', '#6a4a32', '#d8cfb8', { cord: '#d8cfb8' }),
      incaDesign('Checkerboard uncu', 'uncuChecks', '#1c1c20', '#ece4d0', { cord2: '#d6a743' }),
      incaDesign('Red uncu', 'uncu', '#9a2a1e', '#ece4d0', { cord: '#d6a743' }),
      incaDesign('Checkerboard, gold cord', 'uncuChecks', '#1c1c20', '#ece4d0', { cord: '#b3161b', cord2: '#d6a743' }),
    ],
  },
  incaNoble: {
    // Trained: lords at a ceremony, not a war band (`skill`: OUTFITS' tiers).
    skill: 0.2,
    faction: 'inca',
    label: 'Inca — lord', family: 'inca', movement: 'excellent', fists: 'bare',
    extraMass: 0.03,
    protection: { blunt: 0.04, cut: 0.05, pierce: 0.03, bullet: { head: 0, torso: 0, limb: 0 } },
    // The lords of the Inca's lineage held up the litter while their arms were cut from them (Xerez, Pedro Pizarro): bound to him, not to the fight.
    courage: 0.2,
    designs: [
      incaDesign('Red uncu, tocapu band', 'uncuTocapu', '#9a2a1e', '#ece4d0', { cord: '#d6a743', earspools: '#d6a743' }),
      incaDesign('Blue uncu, tocapu band', 'uncuTocapu', '#2a3f7a', '#ece4d0', { cord: '#b3161b', cord2: '#d6a743', earspools: '#d6a743' }),
      incaDesign('Checkerboard, red yoke', 'uncuChecks', '#1c1c20', '#ece4d0', { cord2: '#d6a743', earspools: '#d6a743' }),
      incaDesign('Brown uncu, tocapu band', 'uncuTocapu', '#6a4a32', '#d6a743', { cord: '#ece4d0', earspools: '#d6a743' }),
      // The Sapa Inca: the royal tocapu, the mascapaicha's red fringe, a cloak of fine vicuña.
      incaDesign('Sapa Inca', 'uncuRoyal', '#9a2a1e', '#ece4d0', { cord: '#b3161b', cord2: '#d6a743', earspools: '#d6a743', fringe: '#c41a1a', cloak: '#3a2a5a', special: true }),
    ],
  },
  // A rōnin: no lord, no armour; a kimono and hakama, a headband.
  ronin: {
    skill: 0.85,
    faction: 'japanese',
    label: 'Rōnin', movement: 'excellent', fists: 'bare',
    sidearm: 'wakizashi',
    headgear: ['kasa'],
    defaultHeadgear: 'kasa',
    // A masterless man on the road: the kosode and the hakama tied at the
    // knee, a straw kasa low over the eyes, a travelling cloak, sandals; and
    // what armour he can carry and still run in, a tōsei cuirass and the
    // haidate over his thighs, no helmet, no sleeves, no greaves. The trunk
    // as a samurai's dō; the thighs behind small plates laced on cloth;
    // head and the rest of the limbs bare (`regions`).
    extraMass: 0.2,
    protection: {
      blunt: 0.6, cut: 0.9, pierce: 0.65, bullet: { head: 0, torso: 0.5, limb: 0.05 },
      regions: { head: { blunt: 0.05, cut: 0.05, pierce: 0 }, limb: { blunt: 0.05, cut: 0.05, pierce: 0 }, Thigh: { blunt: 0.35, cut: 0.75, pierce: 0.45 } },
    },
    courage: 0.4,
    designs: [
      roninDesign('Brown cloak, white kosode', { kosode: '#e4dfd2', hakama: '#4a3e34', cloak: '#4a3020', steel: '#2a2a2e', lace: '#2a3a6a', sash: '#e8e2d2', band: '#c9a23a', gaiters: '#5a6270' }),
      roninDesign('Grey cloak, indigo kosode', { kosode: '#2a3550', hakama: '#3a3a40', cloak: '#55534e', steel: '#3b3e44', lace: '#b3161b', sash: '#e8e2d2', band: '#b3161b', gaiters: '#2a2c30' }),
      roninDesign('Black cloak, grey kosode', { kosode: '#8a8780', hakama: '#2a2622', cloak: '#1c1a18', steel: '#6b4a32', lace: '#c9a23a', sash: '#d8cfb8', band: '#3a2416', gaiters: '#4a4a50' }),
    ],
  },
  // Sōhei, the warrior monks: armoured as a samurai but for the helmet (the
  // hood is cloth: a cut through it is a cut), the naginata their weapon
  // and the katana at the hip; trained all their lives in the temple yards
  // (`skill`), and steadied by their faith (`courage`).
  sohei: {
    skill: 0.95,
    faction: 'japanese', plated: true,
    label: 'Sōhei — warrior monk', movement: 'good', fists: 'bare',
    arrowproof: true,
    sidearm: 'katana',
    extraMass: 0.3,
    protection: {
      blunt: 0.65, cut: 0.88, pierce: 0.6, bullet: { head: 0, torso: 0.4, limb: 0.05 },
      regions: { head: { blunt: 0.08, cut: 0.12, pierce: 0.02 }, Forearm: { blunt: 0.1, cut: 0.2, pierce: 0.05 }, Shank: { blunt: 0.1, cut: 0.15, pierce: 0.05 } },
    },
    courage: 0.5,
    designs: [
      soheiDesign('White hood, black robe', { hood: '#ece7da', robe: '#1e1c22', hakama: '#3a3630', lacquer: '#1a1a1e', lace: '#2a2e3a', beads: '#6a3a2a' }),
      soheiDesign('White hood, ochre kesa', { hood: '#e4ddcc', robe: '#7a5a22', hakama: '#2a2620', lacquer: '#2a1e14', lace: '#4a3a22', beads: '#7a3e2c' }),
      soheiDesign('Grey hood, indigo robe', { hood: '#b8b4aa', robe: '#1f2a44', hakama: '#e8e2d2', lacquer: '#16161a', lace: '#5a1c1c', beads: '#4a2a20' }),
    ],
  },
  // A Chinese sea raider (wokou): a loose jacket, rolled trousers, a cloth
  // round the head, bare feet. Nothing to stop a blade.
  // A raider in a piece of samurai armour: a laced dō-maru (and some, the
  // great shoulder plates) over a tucked-up robe, arms and legs bare, the
  // feet bare. The armour covers the trunk alone (`regions`): head and limbs
  // as a raider's.
  wokouArmoured: {
    skill: 0.3,
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
    skill: 0.25,
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
    // Trained: a civilian: never trained to fight (`skill`: OUTFITS' tiers).
    skill: 0.1,
    faction: 'street',
    label: 'Victorian — corset and gown', movement: 'limited', fists: 'bare',
    // Her hair decoration (the gothic flower, the tilted hat's plume, the widow's cap) is hers to wear or leave off: the headgear choice; on to begin with.
    optionalHead: 'hairDecor', headgear: ['hairDecor'], defaultHeadgear: 'hairDecor',
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
    // Trained: a gentleman's fencing lessons (`skill`: OUTFITS' tiers).
    skill: 0.4,
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
    // Trained: a peasant: never drilled (`skill`: OUTFITS' tiers).
    skill: 0.1,
    faction: 'knights',
    label: 'Commoner', movement: 'good', fists: 'bare',
    headgear: ['headWrap'],
    palette: [['undyed', 'brown'], ['linen', 'slate'], ['rust', 'brown'], ['forest', 'undyed'], ['ochre', 'brown'], ['slate', 'undyed'], ['brown', 'grey']],
    designs: [
      { label: 'Tunic and hose', top: { kind: 'tunic', color: '#c8bc9e' }, bottom: { kind: 'pants', color: '#6a4a30', skirt: true }, feet: { kind: 'bare' } },
    ],
  },
  // A starving rebel's rags: a linen shirt worn to tatters, torn open over the ribs at the front and under the arms, one
  // sleeve gone (how, each man's own: `outfit.tear`, see RAGS), strips of it hanging; breeches cut off below the knee and
  // held up with a rope; bare feet or feet wrapped in rags. No traits: cloth turns nothing.
  rags: {
    // Trained: a starving peasant: never drilled (`skill`: OUTFITS' tiers).
    skill: 0.1,
    faction: 'knights',
    label: 'Rags', movement: 'good', fists: 'bare',
    headgear: ['headWrap'],
    // Washed out and dirty: undyed and faded linen over earth-brown or grey breeches.
    palette: [['undyed', 'brown'], ['linen', 'brown'], ['sand', 'brown'], ['undyed', 'slate'], ['linen', 'olive']],
    designs: [
      { label: 'Torn shirt, bare feet', top: { kind: 'rags', color: '#b9ad8e' }, bottom: { kind: 'ragTrousers', color: '#5a4a36' }, feet: { kind: 'bare' }, extras: [{ kind: 'tatters' }] },
      { label: 'Torn shirt, wrapped feet', top: { kind: 'rags', color: '#b9ad8e' }, bottom: { kind: 'ragTrousers', color: '#5a4a36' }, feet: { kind: 'footRags', color: '#8a7f66' }, extras: [{ kind: 'tatters' }] },
    ],
  },
  // Beasts and machines. A silverback: nothing worn; his black fur is his
  // skin's colour, the grey saddle over his back and hips, the ape's head.
  // A gorilla's hide is thick, but it turns nothing an armour would.
  silverback: {
    faction: 'specials',
    label: 'Silverback', movement: 'excellent', fists: 'bare', courage: 0.6, unarmed: true,
    protection: { blunt: 0.05, cut: 0.05, pierce: 0, bullet: { head: 0, torso: 0, limb: 0 } },
    designs: [
      { label: 'Silverback', armor: { kind: 'silverback', color: '#8c8c89', cloth: '#232226', matte: true }, head: { kind: 'gorillaHead', color: '#232226' }, feet: { kind: 'bare' } },
    ],
  },
  // A humanoid robot (Unitree's G1 and H1): rigid shells of brushed
  // aluminium over each part, white panels on the chest and thighs, dark
  // actuators bare at every joint and the waist, black hands and shoes; a
  // dark helmet with a ring of blue light for a face (`armor.robot`, drawn
  // by robotview.js). Thin aluminium (a few mm) and plastic: it turns some
  // of an edge and a little of a blow, almost nothing of a round. But it is
  // hard and smooth as plate is, and rounded: an edge that meets it skids
  // off (`deflects`), a blow or an arrow not square on the domed chest
  // shell or the round head shell glances (`breastplate`, `helmet`: a light
  // shell, little padding behind it). Its joints are bare actuators: an
  // edge finds them as it finds plate's gaps. No fear, and no blood
  // (`machine`: no morale at all, nothing to bleed; ai.js, physics.js).
  humanoid: {
    faction: 'specials', bulletRating: 500, machine: true,
    label: 'Humanoid robot', movement: 'good', fists: 'gloved-tactical', courage: 1,
    breastplate: 0.6,
    helmet: { mass: 0.8, padding: 0.25, curve: 0.8 },
    deflects: true,
    protection: {
      blunt: 0.3, cut: 0.7, pierce: 0.5, bullet: { head: 0.1, torso: 0.15, limb: 0.1 },
      regions: { head: { blunt: 0.35, cut: 0.75, pierce: 0.55 }, limb: { blunt: 0.25, cut: 0.6, pierce: 0.4 } },
    },
    designs: [
      { label: 'Silver and white', armor: { kind: 'robot', color: '#c3c8cf', mail: '#eef0f3', robot: { metal: true, led: '#46b4ff' } }, head: { kind: 'robotHead', color: '#4a4d54', visor: '#0d0e11', trim: '#c3c8cf', led: '#46b4ff' }, feet: { kind: 'compactBoot', color: '#17181b' } },
    ],
  },
  // The combat bot: the humanoid built thick, its shells steel and ceramic
  // composite plate, thicker than before (rated well past the AR-15's own
  // round: it holds nearly all of one over the trunk, most at the head and
  // limbs), a great battery box on its back, ~55 kg of kit on a 115 kg
  // frame. As a knight's harness: a blade glances off (`deflects`), and
  // there is no gap for an edge, its joints shrouded (`cutProof`; a point
  // may still find one); the chest a curved plate and the helmet a domed
  // steel shell on a padded mount, so a blow or an arrow not square on
  // either skids off (`breastplate`, `helmet`); the steel spreads a blow
  // as plate does (`blunt`). Its forearms are its guns (`mounted`: an
  // AR-15 on the right, a shotgun on the left; never dropped). Dark grey,
  // picked out in #D97757.
  combatBot: {
    // Its neck in an armoured collar (`arrowproof`: the throat covered as the trunk; an arrow glances off the plate).
    // A machine (`machine`): no morale, no blood, as the humanoid.
    faction: 'specials', bulletRating: 3500, plated: true, arrowproof: true, machine: true,
    label: 'Combat bot — armoured', movement: 'limited', fists: 'gauntlet', courage: 1,
    extraMass: 55 / 115, balance: 1.5,
    mounted: { r: 'armRifle', l: 'armShotgun' },
    breastplate: 0.8,
    helmet: { mass: 2.5, padding: 0.55, curve: 0.85 },
    cutProof: true,
    protection: {
      blunt: 0.6, cut: 1, pierce: 0.9, bullet: { head: 0.85, torso: 0.95, limb: 0.75 },
      regions: { head: { blunt: 0.65, cut: 1, pierce: 0.9 }, limb: { blunt: 0.55, cut: 0.95, pierce: 0.85 } },
    },
    deflects: true,
    designs: [
      { label: 'Dark grey', armor: { kind: 'robot', color: '#43464c', mail: '#2a2b2f', cloth: '#d97757', backBox: true, robot: { bulk: 1.3, led: '#ff8a5c' } }, head: { kind: 'robotHead', color: '#383b40', visor: '#0b0c0e', trim: '#d97757', led: '#ff8a5c' }, feet: { kind: 'tacticalBoot', color: '#2a2b2f' } },
    ],
  },
};

export const OUTFIT_KEYS = Object.keys(OUTFITS);
/** The outfits the builders offer: not Level Mode's own (`levelOnly`). */
export const PICKABLE_OUTFIT_KEYS = OUTFIT_KEYS.filter((key) => !OUTFITS[key].levelOnly);

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
  // A straw hat tied loosely under the chin: a hard blow or a fall takes it off.
  kasa: { label: 'Kasa', knock: 0.3, falls: true, icon: '👒' },
  // A cut on the helmet carrying at least `cutFrom` J of edge takes the crest off with it.
  // A lady's hair decoration (the design's own head piece, shown or not: OUTFITS optionalHead); never knocked off.
  hairDecor: { label: 'Hair decoration', knock: 0, falls: false, icon: '🌸' },
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
 * choosing them in the menus. In the fight a faction is only its standard and its strangers (below).
 */
// A faction's `strangers`: what its people had never met before the
// Spaniards brought it ('horse', 'gun'): the Americas had no horse and no
// powder. A man of it feels the shock of such a thing the more (ai.js AI.shock
// `strange`): a general rule, the faction only says who.
// A faction's `standard`: what its leader carries in a group fight (a
// weapon in WEAPONS with a `flag`), in his hands, or `worn` on his back
// (a samurai commander's great sashimono) leaving his hands to his weapon;
// `colour`, its field's usual colour (where both sides' would differ).
export const FACTIONS = {
  knights: { label: 'Knights', glyph: '🏰', standard: { weapon: 'banner', colour: '#b3161b' }, blurb: 'Medieval Europe: knights in plate and mail, foot soldiers, the commons.' },
  japanese: { label: 'Japanese', glyph: '⛩️', standard: { weapon: 'nobori', worn: true }, blurb: 'Samurai and ashigaru: katana, naginata, yari, bows and teppō.' },
  mexica: { label: 'Mexica', glyph: '🦅', standard: { weapon: 'pamitl', worn: true }, strangers: ['horse', 'gun'], blurb: 'The Aztec army: warriors in quilted cotton, jaguar and eagle knights, obsidian blades.' },
  inca: { label: 'Inca', glyph: '☀️', strangers: ['horse', 'gun'], blurb: 'Atahualpa\'s people at Cajamarca: lords and attendants in the woven uncu, the llautu round the head, the champi star mace.' },
  chinese: { label: 'Chinese', glyph: '🐉', standard: { weapon: 'lingQi', colour: '#c0392b' }, blurb: 'Ming soldiers: garrison spearmen, brigandine sword-and-shield men and gunners, elite guandao; the Iron Pagoda of legend.' },
  steppe: { label: 'Steppe', glyph: '🐎', standard: { weapon: 'tug' }, blurb: 'Mongol, Oirat and Timurid warriors: archers in the deel, hardened leather lamellar, sabre, mace and composite bow; the Khan\'s kheshig in gilt scale.' },
  // Keyed `ottomans` (saves and levels name it); it holds the Turkish and Kurdish sultanates both, Saladin's Ayyubids of the 1100s and the Ottomans after them.
  ottomans: { label: 'Sultanates', glyph: '🌙', standard: { weapon: 'sancak', colour: '#2e6b3a' }, blurb: 'Saladin\'s Ayyubids and the Ottoman Turks: Saladin in kazaghand and turbaned helmet; the Sultan\'s azaps, Janissaries with yatagan and gun, heavy men in mail-and-plate; an alp of Osman\'s gazis of legend.' },
  gladiators: { label: 'Gladiators', glyph: '🏛️', blurb: 'The arena of Rome: hoplomachus, murmillo, secutor, thraex, retiarius.' },
  ring: { label: 'Ring', glyph: '🥊', blurb: 'Fighting sports: boxing, kickboxing, Muay Thai, MMA, sumo.' },
  street: { label: 'Street', glyph: '🏙️', blurb: 'Ordinary people and the underworld: brawlers, yakuza, office workers.' },
  // The Goths of the migrations (the Visigoths of Toulouse, the Ostrogoths and Gepids under Attila).
  goths: { label: 'Goths', glyph: '🪓', standard: { weapon: 'banner', colour: '#2f4468' }, blurb: 'The Visigoths of 451 and the Germanic peoples under Attila: tunic and round shield, spear and spatha; their nobles in mail and spangenhelm, on horse.' },
  // Parthia (Surena's army at Carrhae, 53 BC): Iranian horsemen.
  parthians: { label: 'Parthia', glyph: '🏹', standard: { weapon: 'tug' }, blurb: 'The Parthian horse of Carrhae: cataphracts, man and horse in iron scale, with the kontos; horse archers in tunic and felt cap with the composite bow.' },
  romans: { label: 'Rome', glyph: '🛡️', standard: { weapon: 'vexillum', colour: '#9a1a1a' }, blurb: 'The legions of the early Empire: legionaries in segmented iron with scutum and gladius, their centurions in mail and medals; the red vexillum.' },
  law: { label: 'Law', glyph: '🚓', blurb: 'Police, SWAT and special forces: the baton, the service pistol, the shotgun and the AR-15.' },
  specials: { label: 'Beasts & Machines', glyph: '🦍', blurb: 'Not men: a silverback gorilla, a humanoid robot, and a combat bot whose forearms are an AR-15 and a shotgun.' },
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
  // Level mode (a boss's second phase): `outfit.bareHead`, the helm taken off; the rest of the kit as it was.
  // (And `outfit.helm` { kind, design }: another kit's helm put on over this one, a dead man's taken up: levelmode/ending.js.)
  const helm = wornHelm(inputs);
  const look = inputs.outfit?.bareHead ? { ...OUTFITS[kind].designs[design], head: null } : helm ? { ...OUTFITS[kind].designs[design], head: helm.head } : OUTFITS[kind].designs[design];
  return { kind, design, spec: OUTFITS[kind], look };
}

/** The helm of another kit worn over this one (`outfit.helm`: { kind, design }), as { head (its look), spec (its kit) }, or null. */
function wornHelm(inputs) {
  const from = inputs.outfit?.helm;
  const spec = from && OUTFITS[from.kind];
  if (!spec) return null;
  const head = spec.designs[Math.max(0, Math.min(spec.designs.length - 1, from.design ?? 0))].head;
  return head ? { head, spec } : null;
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
  // The stechhelm (frog-mouthed jousting helm): ~9 kg of thick steel (the
  // Vienna and Nuremberg examples run 8–10 kg) standing well off the head on
  // a thick padded cap laced into it; its smooth, sweeping planes turn a
  // point aside.
  stechhelm: { mass: 9, padding: 0.95, curve: 0.8 },
  // The Iron Pagoda: a tall bowl and its rolled lamellar aventail (~4 kg together) over a padded cap.
  pagodaHelm: { mass: 4.0, padding: 0.6, curve: 0.8 },
  // Steppe and Ottoman pointed bowls (the chichak with its brim and nasal).
  steppeHelm: { mass: 1.8, padding: 0.45, curve: 0.85 },
  chichak: { mass: 2.0, padding: 0.45, curve: 0.85 },
  // The Ayyubid helmet: a pointed bowl of riveted segments (~1.6 kg) and its mail aventail (~0.8 kg) on a
  // quilted cap, the turban's wraps round its foot padding it further; steel above the turban, cloth over the rest.
  ayyubidHelm: { mass: 2.6, padding: 0.65, curve: 0.75 },
  // Ming: the brimmed iron hat of the brigandine man; the elite's tall bowl. Han: an iron lamellar cap (Linzi), lightly lined.
  mingHat: { mass: 1.4, padding: 0.35, curve: 0.7 },
  mingHelm: { mass: 2.0, padding: 0.45, curve: 0.85 },
  hanHelm: { mass: 1.5, padding: 0.3, curve: 0.6 },
  // The Republic's bronze Montefortino (1–1.5 kg, a cast knob, a short brim) on a felt cap; the late Roman
  // ridge helmet (two iron halves on a ridge, broad cheek pieces, ~1.5 kg) on a padded lining; the Germanic and
  // Hunnic spangenhelm, a pointed bowl of riveted plates.
  montefortino: { mass: 1.3, padding: 0.35, curve: 0.85 },
  ridgeHelm: { mass: 1.5, padding: 0.4, curve: 0.75 },
  spangenhelm: { mass: 1.6, padding: 0.4, curve: 0.85 },
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
  // The llautu: a few turns of braided wool cord round the head.
  llautu: { mass: 0.08, padding: 0.06, curve: 0 },
  policeCap: { mass: 0.2, padding: 0.1, curve: 0 },
  topHat: { mass: 0.15, padding: 0.1, curve: 0 },
  feltHat: { mass: 0.15, padding: 0.1, curve: 0 },
};
const NO_HELMET = { mass: 0, padding: 0, curve: 0 };

/** A kit's protection with nothing over the head (its helm off): a bare head takes a blow, a cut and a ball as skin does. */
function bareHeaded(protection) {
  return { ...protection, bullet: { ...protection.bullet, head: 0 }, regions: { ...protection.regions, head: { blunt: 0, cut: 0, pierce: 0, deflects: false } } };
}

/** A kit's protection with another kit's helm over the head (`outfit.helm`): the head as that kit guards it; the rest as it was. */
function helmedBy(protection, helm) {
  const head = helm?.spec.protection?.regions?.head;
  if (!head) return protection;
  return { ...protection, regions: { ...protection.regions, head } };
}

export function gearTraits(inputs) {
  const { spec, look } = outfitOf(inputs);
  const female = inputs.sex === 'female';
  const bySex = female ? spec.female ?? {} : {};
  const feet = (female && look.femaleFeet) || look.feet;
  return {
    ...MOVEMENT[spec.movement],
    // (A man's own `outfit.balance` before the kit's: a giant who swings a poleaxe and keeps his feet.)
    balance: (inputs.outfit?.balance ?? bySex.balance ?? spec.balance ?? 1) * heelFooting(feet?.heels),
    // Heels stand the body higher by this much (m).
    heelLift: heelLift(feet?.heels, (inputs.heightCm ?? 175) / 100),
    kick: bySex.kick ?? spec.kick ?? 1,
    // The kit's weight as a share of the body's; a man's own (`outfit.extraMass`) before the kit's (a giant in a harness that weighs what a harness weighs).
    extraMass: inputs.outfit?.extraMass ?? spec.extraMass ?? 0,
    protection: inputs.outfit?.bareHead ? bareHeaded({ ...NO_PROTECTION, ...spec.protection }) : helmedBy({ ...NO_PROTECTION, ...spec.protection }, wornHelm(inputs)),
    deflects: Boolean(spec.deflects),
    // The helm bolted to the cuirass: the head moves only with the trunk (physics lockHead, pose, rig), and he sees only ahead.
    headLocked: Boolean(spec.headLocked) && !inputs.outfit?.bareHead,
    // His skill in this kit, as a share of his own (a man who cannot turn his head fights by feel).
    skillFactor: spec.skillFactor ?? 1,
    // Poise beyond the armour's weight and shell (physics poiseOf): one rigid shell bolted together.
    poise: spec.poise ?? 0,
    // Courage from good armour: less fear, readier to close (0 to 1); a man's own (`outfit.courage`: one who never breaks) before the kit's.
    courage: inputs.outfit?.courage ?? spec.courage ?? 0,
    // A machine (a robot): no morale (never afraid, never runs; ai.js feelFear) and no blood (never bleeds, nothing spilt; physics.js, weaponview.js).
    machine: Boolean(spec.machine),
    // Trained to fight in ranks (formation.js): { advance, charge, testudo } — the line moves up to the enemy (closed under its shields if `testudo`; the last `charge` m at a run), or holds.
    drill: spec.drill ?? null,
    // A full plate harness: no gap for an edge (a point may still find one).
    cutProof: Boolean(spec.cutProof),
    // How often a blade finds a gap in the rigid armour (BLADES.gaps), when the kit has more (or fewer) than most.
    gaps: spec.gaps ?? null,
    // How much wider than the head what is worn on it is, where heads and bodies meet (not where blows land).
    headBulk: spec.headBulk ?? 1,
    // What is on his head, as a blow there meets it (HELMETS): its mass, padding and curve; or the kit's own (`helmet`: a machine's head shell).
    helmet: inputs.outfit?.bareHead ? NO_HELMET : (wornHelm(inputs) ? null : spec.helmet) ?? HELMETS[look.head?.kind] ?? NO_HELMET,
    // A plate breastplate's curve (0 none, 1 a full globose breast): a blow or an arrow not square on it skids off, as off a helmet.
    breastplate: spec.breastplate ?? 0,
    // A second weapon carried with this kit (a style key), drawn once when the first is lost; a man's own (`inputs.sidearm`) before the kit's.
    sidearm: inputs.sidearm ?? spec.sidearm ?? null,
    // Weapons built into the forearms, by side (`mounted`: { r, l }, weapon kinds): one in use at a time, the other drawn on its arm.
    mounted: spec.mounted ?? null,
    // Never takes up a weapon off the floor (a beast).
    unarmed: Boolean(spec.unarmed),
    spare: spec.spare ?? null,
    arrowproof: Boolean(spec.arrowproof),
    // The arrows he carries for his bow (a kit's `quiver`), or none counted (a foot archer's sheaves are brought up to him in the line).
    quiver: spec.quiver ?? null,
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

// ---- Rags: where a torn shirt is gone (the `rags` kit) ------------------------------------------------

/**
 * Where the rags are torn away, in the loft's own coordinates (loftbody.js): u up the trunk (0 the hips, 1 the base of the
 * neck), t along a limb (0 its root, 1 its far joint), the angle round it 0 at the front. Each man's tear is his own
 * (`outfit.tear`): `seed` (where the edges jag and the rips wander), `amount` (0..1, how much of the front is gone) and `sleeve`
 * (the side whose sleeve is torn off: 'l', 'r', 'both' or 'none'). The ribs show where the shirt is gone: the skin there is
 * drawn bare (nothing counts it covered), the V7 skin's ribs and all.
 */
export const RAGS = {
  // The hem (u) and how far it jags up and down.
  hem: 0.12, hemJag: 0.05,
  // The front torn away over the belly and the cage, from the hem up to `top` (u; lower towards its sides by `topFall`):
  // `width` rad either side of a middle that wanders `wander` rad, `widen` more per unit of u below the top, times the man's
  // `amount`; its edges jagged by `jag` rad.
  front: { top: 0.83, topFall: 0.12, width: 0.78, widen: 0.5, wander: 0.16, jag: 0.2 },
  // Under each arm a hole over the side of the cage: centred `at` rad off the front, `half` rad and `span` (u) across, jagged by `jag` of its size.
  side: { at: 1.9, half: 0.55, span: [0.38, 0.7], jag: 0.15 },
  // A hole worn through the back (at most `count`), its size (rad, u).
  back: { count: 1, half: 0.3, tall: 0.1 },
  // Sleeves: the one torn off leaves a stub to `stub` of the upper arm; the other ends ragged at `end` (± `jag`).
  sleeve: { stub: 0.12, end: 0.7, jag: 0.12 },
  // The breeches cut off down the shin (a share of it), ± `jag`.
  trousers: { hem: 0.4, jag: 0.08 },
  // Strips of the shirt left hanging from the torn edges: length (m, for a 1.8 m man) at most and at least.
  strips: { longest: 0.24, shortest: 0.1 },
  // A man's tear when none is given.
  plain: { seed: 1, amount: 0.8, sleeve: 'l' },
};

/** A seeded share 0..1 of a number (the same seed, salt and index give the same share). */
const ragHash = (seed, salt, index = 0) => {
  const x = Math.sin(seed * 12.9898 + salt * 78.233 + index * 37.719) * 43758.5453;
  return x - Math.floor(x);
};
/** A ragged wave round a circle (periodic in 2π), about −1..1: sines of whole frequencies `from`..`to` in seeded phases. */
function ragWave(x, seed, salt, from = 2, to = 7) {
  let sum = 0;
  let norm = 0;
  for (let k = from; k <= to; k += 1) {
    sum += Math.sin(k * x + ragHash(seed, salt, k) * Math.PI * 2) / k;
    norm += 1 / k;
  }
  return (sum / norm) * 1.6;
}

/** A man's tear, completed. */
export const ragTear = (outfit) => ({ ...RAGS.plain, ...outfit?.tear });

/** Whether the shirt is torn away at (u, angle) on the trunk. */
export function ragTorn(tear, u, angle) {
  const { seed, amount } = tear;
  const a = Math.atan2(Math.sin(angle), Math.cos(angle));
  if (u < RAGS.hem + RAGS.hemJag * ragWave(angle * 3, seed, 1, 2, 9)) return true;
  // The front: open from the hem up over the belly and the cage, its top rounded.
  const f = RAGS.front;
  const middle = f.wander * ragWave(u * 5, seed, 2, 1, 4);
  const half = amount * (f.width + f.widen * Math.max(0, f.top - u)) + f.jag * ragWave(u * 16, seed, 3, 2, 8);
  const off = Math.abs(a - middle);
  if (off < half && u < f.top - f.topFall * (off / Math.max(0.1, half)) ** 2 + 0.03 * ragWave(a * 4, seed, 4)) return true;
  // Under the arms.
  const s = RAGS.side;
  for (const sign of [1, -1]) {
    const across = (a * sign - s.at) / (s.half * (0.6 + 0.4 * amount));
    const up = (u - (s.span[0] + s.span[1]) / 2) / ((s.span[1] - s.span[0]) / 2);
    if (across * across + up * up < 1 + s.jag * ragWave(Math.atan2(up, across), seed, sign > 0 ? 5 : 6, 2, 7)) return true;
  }
  // Worn through at the back: the more torn the man's shirt, the more holes.
  const b = RAGS.back;
  for (let hole = 0; hole < Math.round(b.count * amount); hole += 1) {
    const at = Math.PI + (ragHash(seed, 9, hole) - 0.5) * 1.6;
    const high = 0.3 + ragHash(seed, 10, hole) * 0.45;
    const across = Math.atan2(Math.sin(angle - at), Math.cos(angle - at)) / b.half;
    const up = (u - high) / b.tall;
    if (across * across + up * up < 1 + 0.4 * ragWave(Math.atan2(up, across), seed, 11 + hole, 2, 6)) return true;
  }
  return false;
}

/** Whether a sleeve (side 'l' or 'r') is torn away at (t, angle) down the upper arm. */
export function ragSleeveTorn(tear, side, t, angle) {
  const gone = tear.sleeve === side || tear.sleeve === 'both';
  const end = gone ? RAGS.sleeve.stub : RAGS.sleeve.end;
  return t > end + RAGS.sleeve.jag * ragWave(angle, tear.seed, side === 'l' ? 7 : 8, 2, 8);
}

/** Whether the breeches are torn away at (t, angle) down the shin. */
export function ragHemTorn(tear, side, t, angle) {
  return t > RAGS.trousers.hem + RAGS.trousers.jag * ragWave(angle, tear.seed, side === 'l' ? 12 : 13, 2, 8);
}

/**
 * The strips of the shirt left hanging, each { u, angle, length (share of `strips.longest`) }: from the hem at the torn
 * front's edges, and behind; how many by how torn the shirt is.
 */
export function ragStrips(tear) {
  const { seed, amount } = tear;
  const f = RAGS.front;
  const half = amount * (f.width + f.widen * (f.top - RAGS.hem));
  const strips = [
    { u: RAGS.hem + 0.02, angle: half + 0.05, length: 0.55 + 0.45 * ragHash(seed, 20) },
    { u: RAGS.hem + 0.02, angle: -half - 0.05, length: 0.45 + 0.5 * ragHash(seed, 21) },
    { u: RAGS.hem + 0.01, angle: Math.PI + (ragHash(seed, 22) - 0.5) * 1.2, length: 0.4 + 0.5 * ragHash(seed, 23) },
  ];
  if (amount > 0.6) strips.push({ u: RAGS.hem + 0.01, angle: (ragHash(seed, 24) < 0.5 ? 1 : -1) * (2.3 + ragHash(seed, 25) * 0.5), length: 0.4 + 0.4 * ragHash(seed, 26) });
  return strips;
}
