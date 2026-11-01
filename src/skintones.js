// The game's skin tones, by name (a design option of the fighter builder). Plain data, so
// tools and tests can draw a body in the colours the game uses.
export const SKIN_TONES = { porcelain: 0xd9c4c2, light: 0xe8b796, lightTan: 0xcc9a66, medium: 0xc58c64, tan: 0xa8704a, deep: 0x7a4a2e };

// A shade: a place on the ladder of tones (0 porcelain .. 5 deep), fractional for the shades between two of them. The
// character creator's Skin slider sets one (`look.skinShade`), with `look.skinTone` the nearest named tone, for whatever
// reads the name.
export const SKIN_LADDER = Object.keys(SKIN_TONES);

const channels = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

/** A shade's colour (hex number): the two tones either side of it blended. */
export function shadeColor(shade) {
  const at = Math.min(SKIN_LADDER.length - 1, Math.max(0, Number(shade) || 0));
  const below = Math.floor(at);
  const above = Math.min(SKIN_LADDER.length - 1, below + 1);
  const a = channels(SKIN_TONES[SKIN_LADDER[below]]);
  const b = channels(SKIN_TONES[SKIN_LADDER[above]]);
  const t = at - below;
  return a.reduce((hex, value, index) => (hex << 8) | Math.round(value + (b[index] - value) * t), 0);
}

/** The named tone nearest a shade. */
export const shadeTone = (shade) => SKIN_LADDER[Math.min(SKIN_LADDER.length - 1, Math.max(0, Math.round(Number(shade) || 0)))];

/** A named tone's place on the ladder (medium for none). */
export const toneShade = (tone) => Math.max(0, SKIN_LADDER.indexOf(SKIN_LADDER.includes(tone) ? tone : 'medium'));

/** A look's skin colour (hex number): its own colour, else its shade's, else its named tone's. */
export function lookSkinHex(look) {
  if (Number.isFinite(look?.skinShade)) return shadeColor(look.skinShade);
  return SKIN_TONES[look?.skinTone ?? 'medium'] ?? SKIN_TONES.medium;
}

/** How bright a colour is (relative luminance, 0..1). */
export function luminance(hex) {
  const [r, g, b] = channels(hex).map((value) => value / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A CSS gradient through the shades from `low` to `high` (a Skin slider's track), lightest at the left. */
export function shadeGradient(low, high) {
  const stops = Array.from({ length: 6 }, (_, at) => {
    const hex = shadeColor(low + ((high - low) * at) / 5);
    return `#${hex.toString(16).padStart(6, '0')} ${at * 20}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
