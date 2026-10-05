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

/** Mail under a surcoat in a coat of arms. */
function mailDesign(label, cloth, cloth2, heraldry) {
  return { label, top: { kind: 'longsleeve', color: '#5a5040' }, bottom: { kind: 'tights', color: '#4a4238' }, armor: { kind: 'mail', color: '#8d9097', mail: '#8d9097', cloth, cloth2, heraldry }, head: { kind: 'greatHelm', color: '#a7adb6' }, feet: { kind: 'compactBoot', color: '#3a2a1c' } };
}

/** A foot soldier's body armour (brigandine, mail shirt or breastplate) in its cloth, over a quilted coat, and a kettle hat. */
function footmanDesign(label, kind, cloth, quilt, hat) {
  return { label, top: { kind: 'longsleeve', color: quilt }, bottom: { kind: 'tights', color: '#3a3326' }, armor: { kind, color: '#9aa0a8', cloth, gold: '#c9a85a', mail: '#8d9097' }, head: { kind: 'kettleHat', color: '#9aa0a8', ...hat }, feet: { kind: 'compactBoot', color: '#3a2a1c' } };
}

/** Tōsei gusoku in a finish, with its crest and war mask. */
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
const GLADIATOR_LOOKS = [
  { label: 'Bronze, cream', metal: '#b98a3e', cloth: '#ece4d0', plume: '#b81d22', strap: '#6a4526' },
  { label: 'Brass, red', metal: '#c9a25a', cloth: '#8a1f22', plume: '#f0ece4', strap: '#4a2e1a' },
  { label: 'Steel, blue', metal: '#a7adb6', cloth: '#2a3a6a', plume: '#1a1a1d', strap: '#3a2a1c' },
  { label: 'Dark bronze, white', metal: '#8a6a3a', cloth: '#f2eee4', plume: '#d6a743', strap: '#5a3a22' },
  { label: 'Gilt, ochre', metal: '#d6b45a', cloth: '#b8862e', plume: '#2a4a9a', strap: '#6a4526' },
];

/** A gladiator of a kind in one of the looks; `helmet` null for none. */
function gladiatorDesign(kind, look, helmet) {
  return {
    label: look.label, bottom: { kind: 'loincloth', color: look.cloth }, top: { kind: 'sportsBra', color: look.cloth, female: true },
    armor: { kind, color: look.metal, lace: look.strap, gold: '#d6b45a' }, feet: { kind: 'sandal', color: look.strap },
    ...(helmet ? { head: { ...helmet, color: look.metal } } : {}),
  };
}

// Heels: how far the boot is pitched up (radians, toe on the floor) and how
// long its pointed toe is (a share of the foot). Footing is lost with the
// pitch: the weight rides on the ball of the foot and a stiletto's tip, and
// the ankle, pointed, has little range left to catch a sway.
const BUSINESS_HEELS = { pitch: 0.32, point: 0.42 };
const LADY_HEELS = { pitch: 0.48, point: 0.56 };
export const HEEL_FOOTING_PER_RADIAN = 1.1;

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
  return toeTip * Math.sin(heels.pitch) - HEEL_SOLE_BELOW_ANKLE * (1 - Math.cos(heels.pitch));
}

/** Footing (1 = flat shoes) in heels pitched this far. */
export function heelFooting(heels) {
  return heels ? Math.max(0.3, 1 - HEEL_FOOTING_PER_RADIAN * heels.pitch) : 1;
}

export const OUTFITS = {
  boxing: {
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
    label: 'MMA', movement: 'excellent', fists: 'bare',
    palette: [[null, 'black'], [null, 'navy'], [null, 'red'], [null, 'white'], [null, 'charcoal']],
    designs: [
      { label: 'Fight trunks', bottom: { kind: 'trunks', color: '#16161a' }, top: { kind: 'sportsBra', color: '#16161a', female: true }, feet: { kind: 'bare' } },
    ],
  },
  sports: {
    label: 'Sports', movement: 'excellent', fists: 'bare',
    headgear: ['cap'],
    palette: [['sky', 'black'], ['red', 'black'], ['green', 'charcoal'], ['yellow', 'navy'], ['white', 'black'], ['black', 'grey']],
    designs: [
      { label: 'Running', top: { kind: 'tank', color: '#2f7fd8' }, bottom: { kind: 'splitShorts', color: '#1c1c22' }, feet: { kind: 'trainer', color: '#f4f4f6', accent: '#ff6a2a' } },
    ],
  },
  sumo: {
    label: 'Sumo', movement: 'excellent', fists: 'bare',
    palette: [[null, 'black'], [null, 'purple'], [null, 'wine'], [null, 'navy'], [null, 'brown']],
    designs: [
      { label: 'Black mawashi', bottom: { kind: 'mawashi', color: '#1a1a1d' }, extras: [{ kind: 'sagari', color: '#1a1a1d' }], feet: { kind: 'bare' }, hair: 'topknot' },
    ],
  },
  hiking: {
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
    label: 'Casual', movement: 'good', fists: 'bare',
    palette: [['maroon', 'sand'], ['navy', 'denim'], ['forest', 'sand'], ['purple', 'charcoal'], ['rust', 'denim'], ['grey', 'black']],
    designs: [
      { label: 'Flannel & chinos', top: { kind: 'flannel', color: '#8a2a24', check: '#2a1a1a', under: '#e4e4e6' }, bottom: { kind: 'pants', color: '#b39a73' }, feet: { kind: 'trainer', color: '#3a2a20' } },
      // Worn in the subway level (as the brief there asked): not offered elsewhere.
      { label: 'T-shirt & jeans', levelOnly: true, top: { kind: 'tee', color: '#24324a' }, bottom: { kind: 'jeans', color: '#2b3550' }, feet: { kind: 'trainer', color: '#e9e9ec' } },
      { label: 'Hoodie & joggers', levelOnly: true, top: { kind: 'hoodie', color: '#7a2230' }, bottom: { kind: 'joggers', color: '#26262b' }, feet: { kind: 'trainer', color: '#e9e9ec' } },
    ],
  },
  business: {
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
    label: 'Yakuza', movement: 'good', fists: 'bare', kick: 1.1,
    headgear: ['hat'],
    palette: [[null, 'black'], [null, 'charcoal'], [null, 'white'], [null, 'navy']],
    designs: [
      { label: 'Bare back', tattoo: 'full', bottom: { kind: 'slacks', color: '#16161a' }, feet: { kind: 'compactBoot', color: '#0e0e10' }, top: { kind: 'sportsBra', color: '#16161a', female: true } },
    ],
  },
  swat: {
    label: 'SWAT', movement: 'limited', fists: 'gloved-tactical',
    palette: [['charcoal', 'charcoal'], ['olive', 'olive'], ['slate', 'slate']],
    balance: 1.5, extraMass: 0.2,
    protection: { blunt: 0.8, cut: 0.6, pierce: 0.4, bullet: { head: 0.6, torso: 0.9, limb: 0.5 } },
    designs: [
      { label: 'Heavy riot', top: { kind: 'longsleeve', color: '#202226' }, bottom: { kind: 'cargo', color: '#202226' }, armor: { kind: 'heavyRiot', color: '#121316', backPrint: 'SWAT' }, head: { kind: 'riotHelmet', color: '#121316', neck: true }, feet: { kind: 'tacticalBoot', color: '#0e0e10' } },
    ],
  },
  knight: {
    label: 'Knight — full plate',
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
    courage: 0.35,
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
  // Mail and a great helm: rings to the knees under a surcoat in his
  // colours. Proof against most cuts, poor against a point, little help
  // against a blow; lighter than plate, and an edge bites rather than glances.
  knightMail: {
    label: 'Knight — mail and great helm', family: 'knight', movement: 'good', fists: 'gauntlet',
    sidearm: 'shortSword',
    picked: [0, 1, 2, 3],
    extraMass: 0.3,
    protection: { blunt: 0.45, cut: 0.85, pierce: 0.5, bullet: { head: 0.4, torso: 0.25, limb: 0.2 } },
    courage: 0.3,
    designs: [
      mailDesign('Gules', '#a2201e', '#e8e2d2', 'plain'),
      mailDesign('Per pale', '#1f3f8a', '#e8e2d2', 'pale'),
      mailDesign('Quarterly', '#d6a743', '#1a1a1d', 'quarterly'),
      mailDesign('Crusader cross', '#e8e2d2', '#a2201e', 'cross'),
      mailDesign('Chief', '#2f5a3a', '#e8e2d2', 'chief'),
    ],
  },
  // A foot soldier: whatever he could get — a brigandine (plates riveted
  // inside cloth), a mail shirt, or a breastplate — over a quilted coat,
  // and a kettle hat. Never full cover; light enough to march in.
  footman: {
    label: 'Foot soldier', family: 'knight', movement: 'good', fists: 'bare',
    sidearm: 'shortSword',
    extraMass: 0.22,
    protection: { blunt: 0.5, cut: 0.75, pierce: 0.6, bullet: { head: 0.35, torso: 0.35, limb: 0.1 } },
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
    label: 'Samurai — ō-yoroi', family: 'samurai', movement: 'good', fists: 'bare',
    // Arrows glance off it.
    arrowproof: true,
    sidearm: 'wakizashi',
    picked: [0, 1, 2, 3],
    headgear: ['crest'],
    defaultHeadgear: 'crest',
    palette: [['black', 'black'], ['wine', 'wine'], ['navy', 'charcoal'], ['forest', 'black']],
    extraMass: 0.4,
    protection: { blunt: 0.7, cut: 0.9, pierce: 0.8, bullet: { head: 0.3, torso: 0.4, limb: 0.1 } },
    courage: 0.3,
    designs: [
      { label: 'Crescent', top: { kind: 'longsleeve', color: '#1c1d26' }, bottom: { kind: 'pants', color: '#23202b' }, armor: { kind: 'lamellar', color: '#b3161b', lace: '#1d2a4f', gold: '#d6a743', panel: true, leather: '#5a3a22', trim: true }, head: { kind: 'kabuto', color: '#b3161b', crest: 'crescent', lace: '#1d2a4f', gold: '#d6a743' }, feet: { kind: 'tabi', color: '#1a1b22' } },
      { label: 'Golden horns', top: { kind: 'longsleeve', color: '#141416' }, bottom: { kind: 'pants', color: '#1a1a1d' }, armor: { kind: 'lamellar', color: '#b3161b', lace: '#121214', gold: '#d6a743', sode: 1.25, panel: true, leather: '#3a2a3a', trim: true }, head: { kind: 'kabuto', color: '#b3161b', crest: 'kuwagata', mask: 'red', lace: '#121214', gold: '#d6a743' }, feet: { kind: 'tabi', color: '#141416' } },
      { label: 'Sun disc', top: { kind: 'longsleeve', color: '#2a2a30' }, bottom: { kind: 'pants', color: '#2a2a30' }, armor: { kind: 'lamellar', color: '#b3161b', lace: '#e8e4da', gold: '#d6a743', panel: true, leather: '#6a4a2a', trim: true }, head: { kind: 'kabuto', color: '#17171a', crest: 'sun', lace: '#e8e4da', gold: '#d6a743' }, feet: { kind: 'tabi', color: '#e8e4da' } },
      { label: 'Daimyo', top: { kind: 'longsleeve', color: '#3a1012' }, bottom: { kind: 'pants', color: '#2a0c0e' }, armor: { kind: 'lamellar', color: '#b3161b', lace: '#d6a743', gold: '#d6a743', sode: 1.3, panel: true, leather: '#2a3a5a', trim: true }, head: { kind: 'kabuto', color: '#b3161b', crest: 'tall', mask: 'red', lace: '#d6a743', gold: '#d6a743' }, feet: { kind: 'tabi', color: '#1a1b22' } },
      { label: 'Antlers', top: { kind: 'longsleeve', color: '#16201a' }, bottom: { kind: 'pants', color: '#1a221c' }, armor: { kind: 'lamellar', color: '#b3161b', lace: '#2f5a3a', gold: '#d6a743', panel: true, leather: '#4a3a1a', trim: true }, head: { kind: 'kabuto', color: '#b3161b', crest: 'antlers', mask: 'black', lace: '#2f5a3a', gold: '#d6a743' }, feet: { kind: 'tabi', color: '#16201a' } },
    ],
  },
  // Tōsei gusoku: the later armour, a solid riveted cuirass of horizontal
  // steel lames, laced skirt and sleeves, and the menpo war mask. Better
  // than ō-yoroi against points and bullets, and heavier.
  samuraiTosei: {
    label: 'Samurai — tōsei gusoku', family: 'samurai', movement: 'good', fists: 'bare',
    // Arrows glance off it.
    arrowproof: true,
    sidearm: 'wakizashi',
    headgear: ['crest'],
    defaultHeadgear: 'crest',
    palette: [['black', 'black'], ['wine', 'wine'], ['navy', 'charcoal'], ['forest', 'black']],
    extraMass: 0.45,
    protection: { blunt: 0.75, cut: 0.95, pierce: 0.88, bullet: { head: 0.4, torso: 0.55, limb: 0.15 } },
    courage: 0.3,
    designs: [
      toseiDesign('Iron', '#3b3e44', '#1d2a4f', 'crescent', 'black', '#1c1d26'),
      toseiDesign('Russet', '#6b4a32', '#2a1a10', 'kuwagata', 'red', '#2a1f18'),
      toseiDesign('Black lacquer', '#17171a', '#b3161b', 'tall', 'black', '#141416'),
      toseiDesign('Silver', '#9aa0a8', '#1d2a4f', 'sun', 'black', '#23202b'),
      toseiDesign('Blued steel', '#2c3a4a', '#d6a743', 'antlers', 'red', '#16201a'),
    ],
  },
  // Ashigaru: a foot soldier's plain lacquered okegawa-do, short skirt,
  // cloth sleeves, the jingasa hat; less protection, lighter, quicker.
  ashigaru: {
    label: 'Ashigaru', family: 'samurai', movement: 'good', fists: 'bare',
    sidearm: 'wakizashi',
    picked: [0, 1, 2],
    extraMass: 0.2,
    protection: { blunt: 0.5, cut: 0.7, pierce: 0.55, bullet: { head: 0.2, torso: 0.25, limb: 0.05 } },
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
    label: 'Gladiator — hoplomachus', movement: 'good', fists: 'bare',
    palette: [[null, 'cream'], [null, 'undyed'], [null, 'wine'], [null, 'rust']],
    extraMass: 0.3,
    protection: { blunt: 0.4, cut: 0.4, pierce: 0.2, bullet: { head: 0.3, torso: 0, limb: 0.1 } },
    courage: 0.25,
    family: 'gladiator',
    designs: GLADIATOR_LOOKS.map((look) => gladiatorDesign('hoplomachus', look, { kind: 'gladiatorHelm', plume: look.plume })),
  },
  // Murmillo: the big fish-crested helmet with its grille, a manica on the
  // sword arm, a short greave: the head well kept, the body bare.
  murmillo: {
    label: 'Gladiator — murmillo', family: 'gladiator', movement: 'good', fists: 'bare',
    palette: [[null, 'cream'], [null, 'undyed'], [null, 'wine'], [null, 'rust']],
    extraMass: 0.32,
    protection: { blunt: 0.45, cut: 0.5, pierce: 0.3, bullet: { head: 0.45, torso: 0, limb: 0.15 } },
    courage: 0.25,
    designs: GLADIATOR_LOOKS.map((look) => gladiatorDesign('murmillo', look, { kind: 'gladiatorHelm', crest: 'fin' })),
  },
  // Secutor: the smooth egg helmet that nothing catches on, manica, high greave.
  secutor: {
    label: 'Gladiator — secutor', family: 'gladiator', movement: 'good', fists: 'bare',
    palette: [[null, 'cream'], [null, 'undyed'], [null, 'wine'], [null, 'rust']],
    extraMass: 0.32,
    protection: { blunt: 0.5, cut: 0.5, pierce: 0.35, bullet: { head: 0.5, torso: 0, limb: 0.15 } },
    courage: 0.25,
    designs: GLADIATOR_LOOKS.map((look) => gladiatorDesign('secutor', look, { kind: 'secutorHelm' })),
  },
  // Retiarius: the net-fighter, almost naked: no helmet, the galerus on the
  // left shoulder and a manica on that arm. Fast, and easily hurt.
  retiarius: {
    label: 'Gladiator — retiarius', family: 'gladiator', movement: 'excellent', fists: 'bare',
    palette: [[null, 'cream'], [null, 'undyed'], [null, 'wine'], [null, 'rust']],
    extraMass: 0.08,
    protection: { blunt: 0.15, cut: 0.2, pierce: 0.1, bullet: { head: 0, torso: 0, limb: 0.05 } },
    courage: 0.15,
    designs: GLADIATOR_LOOKS.map((look) => gladiatorDesign('retiarius', look, null)),
  },
  // Thraex: the griffin-crested brimmed helmet, quilted wraps and high
  // greaves on both legs, manica: the legs best kept of any.
  thraex: {
    label: 'Gladiator — thraex', family: 'gladiator', movement: 'good', fists: 'bare',
    palette: [[null, 'cream'], [null, 'undyed'], [null, 'wine'], [null, 'rust']],
    extraMass: 0.3,
    protection: { blunt: 0.4, cut: 0.45, pierce: 0.25, bullet: { head: 0.35, torso: 0, limb: 0.2 } },
    courage: 0.25,
    designs: GLADIATOR_LOOKS.map((look) => gladiatorDesign('thraex', look, { kind: 'gladiatorHelm', crest: 'griffin', plume: look.plume })),
  },
  // Ming garrison: a padded cotton coat and a red cloth head wrap. Little
  // protection beyond the padding; quick on his feet.
  mingGarrison: {
    label: 'Ming — garrison', family: 'chinese', movement: 'good', fists: 'bare',
    // The dao at his side; for the man who fights with the dao, a knife as well.
    sidearm: 'dao',
    spare: 'dagger',
    extraMass: 0.06,
    protection: { blunt: 0.15, cut: 0.2, pierce: 0.1 },
    courage: 0.1,
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
    label: 'Ming — brigandine', family: 'chinese', movement: 'good', fists: 'bare',
    sidearm: 'dao',
    spare: 'dagger',
    extraMass: 0.26,
    protection: { blunt: 0.55, cut: 0.85, pierce: 0.7, bullet: { head: 0.4, torso: 0.45, limb: 0.15 } },
    courage: 0.25,
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
    label: 'Ming — elite brigandine', family: 'chinese', movement: 'good', fists: 'bare',
    sidearm: 'dao',
    spare: 'dagger',
    deflects: true,
    arrowproof: true,
    extraMass: 0.45,
    protection: { blunt: 0.62, cut: 1, pierce: 0.88, bullet: { head: 0.45, torso: 0.6, limb: 0.3 } },
    courage: 0.35,
    designs: [
      mingEliteDesign('Crimson', '#8a1418', '#1f2a4a', '#a7adb6'),
      mingEliteDesign('Imperial blue, steel neck guard', '#1f2f6a', '#7a1418', '#a7adb6', { neck: 'steel' }),
      mingEliteDesign('Black and gold, masked', '#18181c', '#5a1a14', '#8f949b', { neck: 'steel', mask: true }),
      mingEliteDesign('Gilt scale', '#5a1a14', '#7a1418', '#b8a066', {}, { kind: 'mingScale', lace: '#3a2016' }),
      mingEliteDesign('Steel scale, masked', '#1c1c20', '#1f2a4a', '#a7adb6', { neck: 'steel', mask: true }, { kind: 'mingScale', lace: '#1a1c24' }),
    ],
  },
  // A Chinese martial artist's silk suit (tai chi, kung fu): loose jacket and
  // trousers, cloth shoes. No protection; it moves.
  kungfu: {
    label: 'Kung fu suit', movement: 'excellent', fists: 'bare',
    palette: [['white', 'white'], ['black', 'black'], ['navy', 'black'], ['wine', 'black']],
    designs: [
      { label: 'Silk suit', top: { kind: 'flannel', color: '#e8e4d8' }, bottom: { kind: 'pants', color: '#e8e4d8' }, feet: { kind: 'compactBoot', color: '#161616' } },
    ],
  },
  // A Shaolin monk: the robe, leggings bound at the shin, the head shaven.
  monk: {
    label: 'Shaolin monk', movement: 'excellent', fists: 'bare',
    palette: [['ochre', 'brown'], ['grey', 'grey'], ['rust', 'brown']],
    designs: [
      { label: 'Robe', top: { kind: 'tunic', color: '#c47a1e' }, bottom: { kind: 'pants', color: '#6a4428' }, feet: { kind: 'compactBoot', color: '#2a2622' }, hair: 'bald' },
    ],
  },
  // A taekwondo dobok: the white uniform, a black belt, bare feet.
  dobok: {
    label: 'Taekwondo dobok', movement: 'excellent', fists: 'bare',
    designs: [
      { label: 'Dobok', top: { kind: 'jacket', color: '#f2f2f0' }, bottom: { kind: 'pants', color: '#f2f2f0' }, feet: { kind: 'bare' } },
    ],
  },
  // A conquistador of the 1510s–20s: a steel breastplate with mail sleeves
  // and collar under a morion; a doublet and breeches. Proof against most
  // cuts and points; a gun's ball goes through it unless it is proofed.
  conquistadorPlate: {
    label: 'Conquistador — breastplate', family: 'conquistador', movement: 'good', fists: 'bare',
    sidearm: 'espada',
    spare: 'dagger',
    extraMass: 0.3,
    protection: { blunt: 0.5, cut: 0.9, pierce: 0.8, bullet: { head: 0.4, torso: 0.55, limb: 0.15 } },
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
    label: 'Mexica — warrior', family: 'mexica', movement: 'excellent', fists: 'bare',
    sidearm: 'macuahuitl',
    extraMass: 0.08,
    protection: { blunt: 0.2, cut: 0.45, pierce: 0.35, bullet: { head: 0, torso: 0.05, limb: 0 } },
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
    label: 'Mexica — jaguar and eagle', family: 'mexica', movement: 'excellent', fists: 'bare',
    sidearm: 'macuahuitl',
    extraMass: 0.12,
    protection: { blunt: 0.25, cut: 0.5, pierce: 0.4, bullet: { head: 0.1, torso: 0.05, limb: 0 } },
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
    label: 'Rōnin', movement: 'excellent', fists: 'bare',
    sidearm: 'wakizashi',
    protection: { blunt: 0.05, cut: 0.05, pierce: 0, bullet: { head: 0, torso: 0, limb: 0 } },
    courage: 0.4,
    designs: [
      { label: 'Indigo kimono', top: { kind: 'flannel', color: '#1f2a4a' }, bottom: { kind: 'pants', color: '#3a3a40' }, head: { kind: 'clothWrap', color: '#ece4d0' }, feet: { kind: 'tabi', color: '#1a1b22' } },
      { label: 'Grey kimono', top: { kind: 'flannel', color: '#5a5a5e' }, bottom: { kind: 'pants', color: '#1c1c20' }, head: { kind: 'clothWrap', color: '#b3161b' }, feet: { kind: 'tabi', color: '#1a1b22' } },
      { label: 'Brown kimono', top: { kind: 'flannel', color: '#5a3a22' }, bottom: { kind: 'pants', color: '#2a2622' }, feet: { kind: 'tabi', color: '#1a1b22' }, hair: 'topknot' },
    ],
  },
  // A Chinese sea raider (wokou): a loose jacket, rolled trousers, a cloth
  // round the head, bare feet. Nothing to stop a blade.
  wokou: {
    label: 'Wokou raider', movement: 'excellent', fists: 'bare',
    sidearm: 'dao',
    spare: 'dagger',
    protection: { blunt: 0.05, cut: 0.05, pierce: 0, bullet: { head: 0, torso: 0, limb: 0 } },
    courage: 0.25,
    designs: [
      { label: 'Black jacket', top: { kind: 'flannel', color: '#1c1c20' }, bottom: { kind: 'pants', color: '#3a3326' }, head: { kind: 'clothWrap', color: '#3a3326' }, feet: { kind: 'bare' } },
      { label: 'Undyed jacket', top: { kind: 'tee', color: '#c8bc9e' }, bottom: { kind: 'pants', color: '#2a2622' }, head: { kind: 'clothWrap', color: '#1c1c20' }, feet: { kind: 'bare' } },
      { label: 'Blue jacket', top: { kind: 'flannel', color: '#2a3a5a' }, bottom: { kind: 'pants', color: '#2a2622' }, head: { kind: 'clothWrap', color: '#a3241e' }, feet: { kind: 'bare' } },
    ],
  },
  // A Victorian lady: a corset under the bodice, a long gown, high-heeled
  // pointed boots (their heel sets her footing, see heelFooting). The
  // corset's boning turns a little of a cut (30%), nothing of a blow or a
  // point. The game shuffles her three silhouettes of the reign.
  victorianLady: {
    label: 'Victorian — corset and gown', movement: 'limited', fists: 'bare',
    protection: { blunt: 0, cut: 0.3, pierce: 0, bullet: { head: 0, torso: 0, limb: 0 } },
    picked: [0, 1, 2],
    designs: [
      { label: 'Ball gown (1860s)', top: { kind: 'bodice', color: '#e6eef2' }, bottom: { kind: 'gown', shape: 'ball', color: '#9ab8d0' }, armor: { kind: 'corset', color: '#5a7ea6', cloth: '#5a7ea6', cloth2: '#e6eef2', lace: '#e6eef2' }, feet: { kind: 'heelAnkleBoot', color: '#e6e0d4', heels: LADY_HEELS } },
      { label: 'Bustle dress (1880s)', top: { kind: 'longsleeve', color: '#5a1a2a' }, bottom: { kind: 'gown', shape: 'bustle', color: '#6a2234' }, armor: { kind: 'corset', color: '#16161a', cloth: '#16161a', cloth2: '#6a2234', lace: '#d6c7a3' }, head: { kind: 'tiltHat', color: '#2a0a12', plume: '#e8e0cc' }, feet: { kind: 'heelAnkleBoot', color: '#141416', heels: LADY_HEELS } },
      { label: 'Mourning black', top: { kind: 'longsleeve', color: '#1a1a1e' }, bottom: { kind: 'gown', color: '#141418' }, armor: { kind: 'corset', color: '#34343c', cloth: '#34343c', cloth2: '#141418', lace: '#8a8a92' }, head: { kind: 'widowCap', color: '#141418', cap: '#f2efe8' }, feet: { kind: 'heelAnkleBoot', color: '#141416', heels: LADY_HEELS } },
    ],
  },
  // A Victorian gentleman: a frock coat to the knee, a top hat, polished shoes.
  victorianGent: {
    label: 'Victorian — frock coat and top hat', movement: 'good', fists: 'bare',
    designs: [
      { label: 'Black frock coat', top: { kind: 'suit', color: '#1c1c20', shirt: '#f2f2f0', tie: '#1c1c20' }, bottom: { kind: 'pants', color: '#4a4a50' }, head: { kind: 'topHat', color: '#141416' }, feet: { kind: 'dressShoe', color: '#141416' } },
      { label: 'Grey frock coat', top: { kind: 'suit', color: '#5a5a62', shirt: '#f2f2f0', tie: '#7a1a22' }, bottom: { kind: 'pants', color: '#2a2a30' }, head: { kind: 'topHat', color: '#2a2a30' }, feet: { kind: 'dressShoe', color: '#141416' } },
      { label: 'Bottle-green frock coat', top: { kind: 'suit', color: '#24402c', shirt: '#f2f2f0', tie: '#d6a743' }, bottom: { kind: 'pants', color: '#3a3326' }, head: { kind: 'topHat', color: '#141416' }, feet: { kind: 'dressShoe', color: '#2a1d14' } },
    ],
  },
  // A medieval common man: a belted tunic, hose, bare feet. No traits.
  commoner: {
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
  crest: { label: 'Crest', knock: 0.5, falls: true, icon: '🌙' },
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
  const pool = spec.picked ?? spec.designs.map((design, index) => (design.levelOnly ? null : index)).filter((index) => index !== null);
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
export const FACTIONS = {
  knights: { label: 'Knights', glyph: '🏰', blurb: 'Medieval Europe: knights in plate and mail, foot soldiers, the commons.' },
  japanese: { label: 'Japanese', glyph: '⛩️', blurb: 'Samurai and ashigaru: katana, naginata, yari, bows and teppō.' },
  mexica: { label: 'Mexica', glyph: '🦅', blurb: 'The Aztec army: warriors in quilted cotton, jaguar and eagle knights, obsidian blades.' },
  chinese: { label: 'Chinese', glyph: '🐉', blurb: 'Ming soldiers: garrison spearmen, brigandine sword-and-shield men and gunners, elite guandao.' },
  gladiators: { label: 'Gladiators', glyph: '🏛️', blurb: 'The arena of Rome: hoplomachus, murmillo, secutor, thraex, retiarius.' },
  ring: { label: 'Ring', glyph: '🥊', blurb: 'Fighting sports: boxing, kickboxing, Muay Thai, MMA, sumo.' },
  street: { label: 'Street', glyph: '🏙️', blurb: 'Ordinary people and the underworld: brawlers, yakuza, office workers.' },
  law: { label: 'Law', glyph: '🚓', blurb: 'Police and SWAT: the baton and the service pistol.' },
};
export const FACTION_KEYS = Object.keys(FACTIONS);

// What an outfit says about who wears it; an armour family covers its kinds.
// An armour family's kinds may be swapped for one another when a fighter is redressed;
// an outfit outside one (a rōnin's kimono, a monk's robe) keeps to itself.
const FACTION_OF_FAMILY = { knight: 'knights', conquistador: 'knights', samurai: 'japanese', gladiator: 'gladiators', chinese: 'chinese', mexica: 'mexica' };
const FACTION_OF_OUTFIT = { victorianLady: 'street', victorianGent: 'street', ronin: 'japanese', wokou: 'chinese', kungfu: 'chinese', monk: 'chinese', dobok: 'ring', commoner: 'knights', swat: 'law', yakuza: 'street', casual: 'street', business: 'street', hiking: 'street', boxing: 'ring', mma: 'ring', sports: 'ring', sumo: 'ring' };

/** A character's faction: as set (`inputs.faction`), else by what he wears. */
export function factionOf(inputs) {
  if (FACTIONS[inputs.faction]) return inputs.faction;
  const { kind, spec } = outfitOf(inputs);
  return FACTION_OF_FAMILY[spec.family] ?? FACTION_OF_OUTFIT[kind] ?? 'ring';
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
