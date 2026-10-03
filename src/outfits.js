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

const NO_PROTECTION = { blunt: 0, cut: 0, pierce: 0 };

export const OUTFITS = {
  boxing: {
    label: 'Boxing', movement: 'excellent', fists: 'gloved',
    // A padded glove spreads the blow: 10% less harm from punches.
    damageDealt: { hand: 0.9 },
    designs: [
      { label: 'Pro trunks', bottom: { kind: 'trunks', color: 'corner' }, top: { kind: 'sportsBra', color: 'corner', female: true }, feet: { kind: 'boxingBoot', color: '#17171c' } },
    ],
  },
  sports: {
    label: 'Sports', movement: 'excellent', fists: 'bare',
    designs: [
      { label: 'Running', top: { kind: 'tank', color: '#2f7fd8' }, bottom: { kind: 'splitShorts', color: '#1c1c22' }, feet: { kind: 'trainer', color: '#f4f4f6', accent: '#ff6a2a' } },
    ],
  },
  sumo: {
    label: 'Sumo', movement: 'excellent', fists: 'bare',
    designs: [
      { label: 'Black mawashi', bottom: { kind: 'mawashi', color: '#1a1a1d' }, extras: [{ kind: 'sagari', color: '#1a1a1d' }], feet: { kind: 'bare' }, hair: 'topknot' },
    ],
  },
  hiking: {
    label: 'Hiking', movement: 'good', fists: 'bare',
    // A heavy-soled boot puts weight behind a kick.
    kick: 1.1,
    designs: [
      { label: 'Shell jacket', top: { kind: 'jacket', color: '#d4612a', zip: true, hood: false }, bottom: { kind: 'cargo', color: '#4a4f45' }, feet: { kind: 'hikingBoot', color: '#5a3d24' } },
    ],
  },
  casual: {
    label: 'Casual', movement: 'good', fists: 'bare',
    designs: [
      { label: 'Flannel & chinos', top: { kind: 'flannel', color: '#8a2a24', check: '#2a1a1a', under: '#e4e4e6' }, bottom: { kind: 'pants', color: '#b39a73' }, feet: { kind: 'trainer', color: '#3a2a20' } },
      // Worn in the subway level (as the brief there asked): not offered elsewhere.
      { label: 'T-shirt & jeans', levelOnly: true, top: { kind: 'tee', color: '#24324a' }, bottom: { kind: 'jeans', color: '#2b3550' }, feet: { kind: 'trainer', color: '#e9e9ec' } },
      { label: 'Hoodie & joggers', levelOnly: true, top: { kind: 'hoodie', color: '#7a2230' }, bottom: { kind: 'joggers', color: '#26262b' }, feet: { kind: 'trainer', color: '#e9e9ec' } },
    ],
  },
  business: {
    label: 'Business', movement: 'limited', fists: 'bare',
    // Heels: a woman in them goes over very easily, and kicks with the heel.
    female: { balance: 0.45, kick: 1.2 },
    designs: [
      // A black suit; for a woman the skirt suit, in black high-heeled ankle boots with pointed toes.
      { label: 'Black suit', top: { kind: 'suit', color: '#16171b', shirt: '#f2f2f4', tie: '#8a1f2a' }, bottom: { kind: 'slacks', color: '#16171b', skirt: true }, feet: { kind: 'dressShoe', color: '#0e0d0c' }, femaleFeet: { kind: 'heelAnkleBoot', color: '#0b0b0d', heels: true }, extras: [{ kind: 'tie', color: '#8a1f2a' }] },
    ],
  },
  yakuza: {
    label: 'Yakuza', movement: 'good', fists: 'bare', kick: 1.1,
    designs: [
      { label: 'Bare back', tattoo: 'full', bottom: { kind: 'slacks', color: '#16161a' }, feet: { kind: 'compactBoot', color: '#0e0e10' }, top: { kind: 'sportsBra', color: '#16161a', female: true } },
    ],
  },
  swat: {
    label: 'SWAT', movement: 'limited', fists: 'gloved-tactical',
    balance: 1.5, extraMass: 0.2,
    protection: { blunt: 0.8, cut: 0.6, pierce: 0.4 },
    designs: [
      { label: 'Heavy riot', top: { kind: 'longsleeve', color: '#202226' }, bottom: { kind: 'cargo', color: '#202226' }, armor: { kind: 'heavyRiot', color: '#121316', backPrint: 'SWAT' }, head: { kind: 'riotHelmet', color: '#121316', neck: true }, feet: { kind: 'tacticalBoot', color: '#0e0e10' } },
    ],
  },
  knight: {
    label: 'Knight armour', movement: 'limited', fists: 'gauntlet',
    extraMass: 0.5,
    // Plate against blunt force spreads it; against an edge it is proof,
    // against a point nearly so, and a blade that meets it glances off.
    protection: { blunt: 0.6, cut: 1, pierce: 0.9 },
    deflects: true,
    designs: [
      // The gothic shape — fluted plate, pointed bascinet — in bright polished steel.
      { label: 'Gothic plate', top: { kind: 'longsleeve', color: '#2a2622' }, bottom: { kind: 'tights', color: '#1e1b18' }, armor: { kind: 'plate', color: '#b7bcc4', fluted: true }, head: { kind: 'bascinet', color: '#b7bcc4', pointed: true }, feet: { kind: 'sabaton', color: '#b7bcc4' } },
    ],
  },
  // Lamellar: small lacquered steel scales laced in rows, in red. Proof
  // against most cuts, good against points; lighter than plate.
  samurai: {
    label: 'Samurai armour', movement: 'good', fists: 'bare',
    extraMass: 0.4,
    protection: { blunt: 0.7, cut: 0.9, pierce: 0.8 },
    designs: [
      { label: 'Crescent', top: { kind: 'longsleeve', color: '#1c1d26' }, bottom: { kind: 'pants', color: '#23202b' }, armor: { kind: 'lamellar', color: '#b3161b', lace: '#1d2a4f', gold: '#d6a743' }, head: { kind: 'kabuto', color: '#b3161b', crest: 'crescent', lace: '#1d2a4f', gold: '#d6a743' }, feet: { kind: 'tabi', color: '#1a1b22' } },
      { label: 'Golden horns', top: { kind: 'longsleeve', color: '#141416' }, bottom: { kind: 'pants', color: '#1a1a1d' }, armor: { kind: 'lamellar', color: '#b3161b', lace: '#121214', gold: '#d6a743', sode: 1.25 }, head: { kind: 'kabuto', color: '#b3161b', crest: 'kuwagata', mask: 'red', lace: '#121214', gold: '#d6a743' }, feet: { kind: 'tabi', color: '#141416' } },
      { label: 'Sun disc', top: { kind: 'longsleeve', color: '#2a2a30' }, bottom: { kind: 'pants', color: '#2a2a30' }, armor: { kind: 'lamellar', color: '#b3161b', lace: '#e8e4da', gold: '#d6a743' }, head: { kind: 'kabuto', color: '#17171a', crest: 'sun', lace: '#e8e4da', gold: '#d6a743' }, feet: { kind: 'tabi', color: '#e8e4da' } },
      { label: 'Daimyo', top: { kind: 'longsleeve', color: '#3a1012' }, bottom: { kind: 'pants', color: '#2a0c0e' }, armor: { kind: 'lamellar', color: '#b3161b', lace: '#d6a743', gold: '#d6a743', sode: 1.3 }, head: { kind: 'kabuto', color: '#b3161b', crest: 'tall', mask: 'red', lace: '#d6a743', gold: '#d6a743' }, feet: { kind: 'tabi', color: '#1a1b22' } },
      { label: 'Antlers', top: { kind: 'longsleeve', color: '#16201a' }, bottom: { kind: 'pants', color: '#1a221c' }, armor: { kind: 'lamellar', color: '#b3161b', lace: '#2f5a3a', gold: '#d6a743' }, head: { kind: 'kabuto', color: '#b3161b', crest: 'antlers', mask: 'black', lace: '#2f5a3a', gold: '#d6a743' }, feet: { kind: 'tabi', color: '#16201a' } },
    ],
  },
  // A gladiator armed as a Greek hoplite: little armour over a bare body.
  hoplomachus: {
    label: 'Hoplomachus', movement: 'good', fists: 'bare',
    extraMass: 0.3,
    protection: { blunt: 0.4, cut: 0.4, pierce: 0.2 },
    designs: [
      { label: 'Hoplomachus', bottom: { kind: 'loincloth', color: '#ece4d0' }, armor: { kind: 'hoplomachus', color: '#b98a3e', lace: '#6a4526' }, head: { kind: 'gladiatorHelm', color: '#b98a3e', plume: '#b81d22' }, feet: { kind: 'sandal', color: '#6a4526' }, top: { kind: 'sportsBra', color: '#ece4d0', female: true } },
    ],
  },
};

export const OUTFIT_KEYS = Object.keys(OUTFITS);

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
