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
  limited: { foot: 0.72, accel: 0.62, swing: 0.88 },
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

/** A brigandine in its cloth, over a quilted coat, and a kettle hat. */
function footmanDesign(label, cloth, quilt, hat) {
  return { label, top: { kind: 'longsleeve', color: quilt }, bottom: { kind: 'tights', color: '#3a3326' }, armor: { kind: 'brigandine', color: '#9aa0a8', cloth, gold: '#c9a85a' }, head: { kind: 'kettleHat', color: '#9aa0a8', ...hat }, feet: { kind: 'compactBoot', color: '#3a2a1c' } };
}

/** Tōsei gusoku in a finish, with its crest and war mask. */
function toseiDesign(label, steel, lace, crest, mask, under) {
  return { label, top: { kind: 'longsleeve', color: under }, bottom: { kind: 'pants', color: under }, armor: { kind: 'toseiDo', color: steel, lace, gold: '#d6a743' }, head: { kind: 'kabuto', color: steel, crest, mask, lace, gold: '#d6a743' }, feet: { kind: 'tabi', color: '#1a1b22' } };
}

/** An ashigaru's lacquered do and jingasa, the mon in gold or white. */
function ashigaruDesign(label, lacquer, lace, mon, cloth) {
  return { label, top: { kind: 'longsleeve', color: cloth }, bottom: { kind: 'pants', color: cloth }, armor: { kind: 'okegawa', color: lacquer, lace, gold: mon }, head: { kind: 'jingasa', color: lacquer, gold: mon }, feet: { kind: 'tabi', color: '#1a1b22' } };
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
    // Heels: a woman in them goes over very easily, and kicks with the heel.
    female: { balance: 0.45, kick: 1.2 },
    designs: [
      // A black suit; for a woman the skirt suit, in black high-heeled ankle boots with pointed toes.
      { label: 'Black suit', top: { kind: 'suit', color: '#16171b', shirt: '#f2f2f4', tie: '#8a1f2a' }, bottom: { kind: 'slacks', color: '#16171b', skirt: true }, feet: { kind: 'dressShoe', color: '#0e0d0c' }, femaleFeet: { kind: 'heelAnkleBoot', color: '#0b0b0d', heels: true }, extras: [{ kind: 'tie', color: '#8a1f2a' }] },
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
  // A foot soldier: a brigandine (plates riveted inside cloth) over a quilted
  // coat, spaulders, vambraces, knee cops and a kettle hat. Limited cover,
  // light enough to march in.
  footman: {
    label: 'Foot soldier — brigandine', family: 'knight', movement: 'good', fists: 'bare',
    extraMass: 0.22,
    protection: { blunt: 0.5, cut: 0.75, pierce: 0.6, bullet: { head: 0.35, torso: 0.35, limb: 0.1 } },
    courage: 0.25,
    designs: [
      footmanDesign('Red velvet', '#7a1a22', '#c8b48a', { brim: 1.9 }),
      footmanDesign('Blue', '#1f2f5a', '#b8a888', { brim: 1.75, tall: true }),
      footmanDesign('Green', '#24402c', '#c8b48a', { brim: 2.0, coif: true }),
      footmanDesign('Brown leather', '#5a3a22', '#a89070', { brim: 1.8 }),
      footmanDesign('Black', '#1c1c20', '#8a7a60', { brim: 1.85, tall: true, coif: true }),
    ],
  },
  // Lamellar: small lacquered steel scales laced in rows, in red. Proof
  // against most cuts, good against points; lighter than plate.
  samurai: {
    label: 'Samurai — ō-yoroi', family: 'samurai', movement: 'good', fists: 'bare',
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
  const { spec } = outfitOf(inputs);
  const bySex = inputs.sex === 'female' ? spec.female ?? {} : {};
  return {
    ...MOVEMENT[spec.movement],
    balance: bySex.balance ?? spec.balance ?? 1,
    kick: bySex.kick ?? spec.kick ?? 1,
    extraMass: spec.extraMass ?? 0,
    protection: { ...NO_PROTECTION, ...spec.protection },
    deflects: Boolean(spec.deflects),
    // Courage from good armour: less fear, readier to close (0 to 1).
    courage: spec.courage ?? 0,
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
