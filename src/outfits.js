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
// Each outfit has three designs: garment pieces the body is built from (a
// top, a bottom, boots, a helmet, armour, tattoos, things that swing).
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
      { label: 'Amateur vest', top: { kind: 'tank', color: 'corner' }, bottom: { kind: 'trunks', color: 'corner' }, head: { kind: 'headguard', color: 'corner' }, feet: { kind: 'boxingBoot', color: '#f2f2f2' } },
      { label: 'Long shorts', bottom: { kind: 'longShorts', color: '#1a1a1f', trim: 'corner' }, top: { kind: 'sportsBra', color: '#1a1a1f', female: true }, feet: { kind: 'boxingBoot', color: '#1a1a1f', high: true } },
    ],
  },
  sports: {
    label: 'Sports', movement: 'excellent', fists: 'bare',
    designs: [
      { label: 'Running', top: { kind: 'tank', color: '#2f7fd8' }, bottom: { kind: 'splitShorts', color: '#1c1c22' }, feet: { kind: 'trainer', color: '#f4f4f6', accent: '#ff6a2a' } },
      { label: 'Compression', top: { kind: 'compression', color: '#22252c', trim: '#46d38a' }, bottom: { kind: 'tights', color: '#22252c' }, feet: { kind: 'trainer', color: '#22252c', accent: '#46d38a' } },
      { label: 'Track suit', top: { kind: 'jacket', color: '#1d3f8f', stripe: '#f2f2f2', zip: true }, bottom: { kind: 'trackPants', color: '#1d3f8f', stripe: '#f2f2f2' }, feet: { kind: 'trainer', color: '#f4f4f6', accent: '#1d3f8f' } },
    ],
  },
  sumo: {
    label: 'Sumo', movement: 'excellent', fists: 'bare',
    designs: [
      { label: 'Black mawashi', bottom: { kind: 'mawashi', color: '#1a1a1d' }, extras: [{ kind: 'sagari', color: '#1a1a1d' }], feet: { kind: 'bare' }, hair: 'topknot' },
      { label: 'Silk mawashi', bottom: { kind: 'mawashi', color: '#5b2a86' }, extras: [{ kind: 'sagari', color: '#5b2a86' }], feet: { kind: 'bare' }, hair: 'topknot' },
      { label: 'Amateur', bottom: { kind: 'mawashi', color: '#efe9dc', under: '#1c1c22' }, top: { kind: 'tank', color: '#1c1c22', female: true }, feet: { kind: 'bare' } },
    ],
  },
  hiking: {
    label: 'Hiking', movement: 'good', fists: 'bare',
    // A heavy-soled boot puts weight behind a kick.
    kick: 1.1,
    designs: [
      { label: 'Shell jacket', top: { kind: 'jacket', color: '#d4612a', zip: true, hood: false }, bottom: { kind: 'cargo', color: '#4a4f45' }, feet: { kind: 'hikingBoot', color: '#5a3d24' } },
      { label: 'Softshell & shorts', top: { kind: 'jacket', color: '#2f5f4f', zip: true }, bottom: { kind: 'hikingShorts', color: '#6b6352' }, feet: { kind: 'hikingBoot', color: '#3d3b38', socks: '#9a8f7a' }, head: { kind: 'beanie', color: '#c7a24a' } },
      { label: 'Puffer vest', top: { kind: 'puffer', color: '#2a4a8a', under: '#7a7f88' }, bottom: { kind: 'pants', color: '#3a3a40' }, feet: { kind: 'hikingBoot', color: '#6b4a2e' } },
    ],
  },
  casual: {
    label: 'Casual', movement: 'good', fists: 'bare',
    designs: [
      { label: 'T-shirt & jeans', top: { kind: 'tee', color: '#24324a' }, bottom: { kind: 'jeans', color: '#2b3550' }, feet: { kind: 'trainer', color: '#e9e9ec' } },
      { label: 'Hoodie & joggers', top: { kind: 'hoodie', color: '#7a2230' }, bottom: { kind: 'joggers', color: '#26262b' }, feet: { kind: 'trainer', color: '#e9e9ec' } },
      { label: 'Flannel & chinos', top: { kind: 'flannel', color: '#8a2a24', check: '#2a1a1a', under: '#e4e4e6' }, bottom: { kind: 'pants', color: '#b39a73' }, feet: { kind: 'trainer', color: '#3a2a20' } },
    ],
  },
  business: {
    label: 'Business', movement: 'limited', fists: 'bare',
    // Heels: a woman in them goes over very easily, and kicks with the heel.
    female: { balance: 0.45, kick: 1.2 },
    designs: [
      { label: 'Navy suit', top: { kind: 'suit', color: '#1f2a44', shirt: '#f2f2f4', tie: '#8a1f2a' }, bottom: { kind: 'slacks', color: '#1f2a44', skirt: true }, feet: { kind: 'dressShoe', color: '#120f0d', heels: true }, extras: [{ kind: 'tie', color: '#8a1f2a' }] },
      { label: 'Grey three-piece', top: { kind: 'suit', color: '#55585e', shirt: '#dfe7f2', tie: '#2a3a6a', waistcoat: true }, bottom: { kind: 'slacks', color: '#55585e', skirt: true }, feet: { kind: 'dressShoe', color: '#3a2216', heels: true }, extras: [{ kind: 'tie', color: '#2a3a6a' }] },
      { label: 'Shirt-sleeves', top: { kind: 'waistcoat', color: '#26262c', shirt: '#f2f2f4', tie: '#6a5a1f' }, bottom: { kind: 'slacks', color: '#26262c', skirt: false }, feet: { kind: 'dressShoe', color: '#120f0d', heels: true }, extras: [{ kind: 'tie', color: '#6a5a1f', loose: true }] },
    ],
  },
  yakuza: {
    label: 'Yakuza', movement: 'good', fists: 'bare', kick: 1.1,
    designs: [
      { label: 'Bare back', tattoo: 'full', bottom: { kind: 'slacks', color: '#16161a' }, feet: { kind: 'compactBoot', color: '#0e0e10' }, top: { kind: 'sportsBra', color: '#16161a', female: true } },
      { label: 'Open aloha shirt', tattoo: 'full', top: { kind: 'aloha', color: '#c23a2a', pattern: '#f2c94c' }, bottom: { kind: 'slacks', color: '#e8e4da' }, feet: { kind: 'compactBoot', color: '#e8e4da' } },
      { label: 'Haramaki', tattoo: 'full', top: { kind: 'haramaki', color: '#e9e5da' }, bottom: { kind: 'slacks', color: '#2a2a30' }, feet: { kind: 'compactBoot', color: '#0e0e10' } },
    ],
  },
  swat: {
    label: 'SWAT', movement: 'limited', fists: 'gloved-tactical',
    balance: 1.5, extraMass: 0.2,
    protection: { blunt: 0.8, cut: 0.9, pierce: 0.7 },
    designs: [
      { label: 'Black riot', top: { kind: 'longsleeve', color: '#1a1b1f' }, bottom: { kind: 'cargo', color: '#1a1b1f' }, armor: { kind: 'riot', color: '#0f1013' }, head: { kind: 'riotHelmet', color: '#0f1013' }, feet: { kind: 'tacticalBoot', color: '#0e0e10' } },
      { label: 'Navy tactical', top: { kind: 'longsleeve', color: '#1c2638' }, bottom: { kind: 'cargo', color: '#1c2638' }, armor: { kind: 'carrier', color: '#2b3245' }, head: { kind: 'riotHelmet', color: '#1c2638', visor: false }, feet: { kind: 'tacticalBoot', color: '#0e0e10' } },
      { label: 'Heavy riot', top: { kind: 'longsleeve', color: '#202226' }, bottom: { kind: 'cargo', color: '#202226' }, armor: { kind: 'heavyRiot', color: '#121316' }, head: { kind: 'riotHelmet', color: '#121316', neck: true }, feet: { kind: 'tacticalBoot', color: '#0e0e10' } },
    ],
  },
  knight: {
    label: 'Knight armour', movement: 'limited', fists: 'gauntlet',
    extraMass: 0.5,
    // Plate against blunt force spreads it; against an edge or a point it is
    // nearly proof (when there are such things to fight with).
    protection: { blunt: 0.6, cut: 0.95, pierce: 0.85 },
    designs: [
      { label: 'Polished plate', top: { kind: 'longsleeve', color: '#4a3a2c' }, bottom: { kind: 'tights', color: '#3a2e25' }, armor: { kind: 'plate', color: '#c9ced6' }, head: { kind: 'greatHelm', color: '#c9ced6' }, feet: { kind: 'sabaton', color: '#c9ced6' } },
      { label: 'Plate & tabard', top: { kind: 'longsleeve', color: '#5a2a2a' }, bottom: { kind: 'tights', color: '#3a2e25' }, armor: { kind: 'plate', color: '#b7bcc4' }, head: { kind: 'bascinet', color: '#b7bcc4' }, feet: { kind: 'sabaton', color: '#b7bcc4' }, extras: [{ kind: 'tabard', color: 'corner', emblem: '#f2d24a' }] },
      { label: 'Blackened gothic', top: { kind: 'longsleeve', color: '#2a2622' }, bottom: { kind: 'tights', color: '#1e1b18' }, armor: { kind: 'plate', color: '#3a3d44', fluted: true }, head: { kind: 'bascinet', color: '#3a3d44', pointed: true }, feet: { kind: 'sabaton', color: '#3a3d44' } },
    ],
  },
};

export const OUTFIT_KEYS = Object.keys(OUTFITS);

/** The outfit a fighter wears: kind and design, defaulting to boxing's first. */
export function outfitOf(inputs) {
  const kind = OUTFITS[inputs.outfit?.kind] ? inputs.outfit.kind : 'boxing';
  const design = Math.max(0, Math.min(2, inputs.outfit?.design ?? 0));
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
