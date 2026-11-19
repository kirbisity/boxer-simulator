// The colours an army wore, so that in a large battle each side can be told from the other at a distance: the Ming red, the
// Japanese black lacquer under white sashimono, the banner men's yellow, white and blue. Colour only. A theme changes the cloth,
// the lacing, a Japanese armour's lacquer, and the field sign every man of it wears (the sashimono and its crest, a cross on the
// chest and back, a sash); it never changes a man's kit, its armour or helmet, its steel, his weapons, his mass or how he is
// guarded: the outfit's `kind` and `design` stay his, and physics never reads what a theme writes (outfit `paint`, `colors`,
// `tint`, `banner`, `crest`, `badge`, `sash`; the inputs' `standardColour`).
//
// A theme (ARMY_THEMES) names the kits it dresses (`kinds`); a man in any other kit keeps his own colours: a unit's native dress
// (the Ming garrison's own clothes, the Qi elite infantry's, the elite guard's, an Inca lord's many-coloured uncu), and the heroes.
// For each kit: the look's colour fields it paints (`paint`, a path into the outfit's look: 'armor.cloth', 'head.tassel'; 'top' and
// 'bottom' the clothes), only where the design has that field, by role (`field`, `deep` a darker field, `accent`, `sign`) or a
// colour, or one of a `mix` picked for each man; and `designs` for the designs that need their own (a Plain Red banner coat turned
// white). A man's paint is shaded a step lighter or darker by his name, as the kits' own designs vary. A Japanese side's `lacquer`
// goes on lacquered armour only (never on a tōsei's bare iron or polished steel), its `lace` on every kit's lacing.
//
// Who wears which: a battle's sides (BATTLE_THEMES, by scenario key or story battle id, each corner its themes in order: a man
// takes the first that dresses his kit), an army set up on its own (ARMY_DEFAULT, by scenarios.js ARMIES key), a custom battle's
// factions (FACTION_THEMES: a main and an alternate; the blue corner wears its alternate where the two mains are too alike to tell
// apart: sameLook). A colour the player picked by hand (`outfit.handColors`) is never painted over.

import { outfitOf } from './outfits.js';

// The colours named in the brief, kept here once.
const THEME_COLOURS = {
  mingRed: '#9e1b1b', mingTassel: '#b3161b',
  lacquer: '#17171b', lacingBlue: '#1f2a4a', sashimono: '#ece5d3', redLacquer: '#a3241c', fanGold: '#d2aa4c', westBlue: '#23315a',
  bannerYellow: '#d9a524', bannerWhite: '#e6e1d4', bannerBlue: '#2b4a80', bannerTrim: '#b3161b',
  darkWool: '#2a2622', buff: '#b08a5a', spanishRed: '#a3161b', checkBlack: '#1c1c20', checkWhite: '#ece4d0', incaRed: '#a3241c',
  greyWool: '#3a3a3c', orange: '#d9731f',
  hospitallerRed: '#9e1b1b', crossWhite: '#ece5d3', janissaryBlue: '#2b4a80', feltWhite: '#ece5d3', ottomanGreen: '#2e6b3a',
  englishWhite: '#e6e1d4', stGeorge: '#b3161b', frenchBlue: '#2b3f80', frenchGold: '#d2aa4c',
  romanRed: '#9a1a1a', saffron: '#d09a2c', ochre: '#a8743a', lateWhite: '#e6e1d4', purple: '#4a2a5a', gothBlue: '#2f4468',
  felt: '#6b5238', undyed: '#b8a888', grey: '#6a6a66', hemp: '#b8a888', fadedIndigo: '#44506a', hanRed: '#9a1a1a',
  darkIron: '#2a2a2e', mongolBlue: '#2b4a80', mexicaWhite: '#e8e2d0', jaguar: '#c08a2a', eagle: '#5a3a22',
};

// The Ming soldier's red coat over the plates (the brigandine's facing, the horseman's deel); his tassel; the lamellar's cords.
const MING_KINDS = {
  mingBrigandine: { paint: { 'armor.cloth': 'field', 'armor.cloth2': 'deep', 'armor.cord': 'accent', 'head.tassel': 'accent' } },
  mingIronLamellar: { paint: { top: 'field', 'armor.cloth': 'field', 'head.tassel': 'accent' } },
};
// The Japanese: lacquer and lacing through the kit's `tint`, the sashimono on every man's back.
const JAPANESE_KINDS = { samurai: {}, samuraiTosei: {}, ashigaru: {}, oyoroi: {} };
// A Plain Red and a Bordered Red banner coat made a Plain White and a Bordered Blue (the bordered banners' trim is red), the
// Bayara's red a yellow: no red banner against the Ming (the Bordered Red and Plain Red were Nurhaci's too, but not at Sarhu here).
const BANNER_KINDS = {
  bannerArmour: {
    designs: {
      4: { 'armor.cloth': THEME_COLOURS.bannerWhite, 'armor.cloth2': '#d6d0c2', 'head.coif': THEME_COLOURS.bannerWhite, top: '#c4c0b6' },
      5: { 'armor.cloth': THEME_COLOURS.bannerBlue, 'armor.cloth2': THEME_COLOURS.bannerTrim, 'head.coif': THEME_COLOURS.bannerBlue, 'head.trim': THEME_COLOURS.bannerTrim, top: '#22396a' },
    },
  },
  bayara: { designs: { 3: { 'armor.cloth': THEME_COLOURS.bannerYellow, 'armor.cloth2': '#b88719', 'head.coif': THEME_COLOURS.bannerYellow, top: '#be8c1a' } } },
};
// The checkerboard military uncu: the plain uncus of the commons black and white with it (their weave is their design's).
const INCA_KINDS = {
  incaUncu: { paint: { 'armor.color': THEME_COLOURS.checkBlack, 'armor.cloth': THEME_COLOURS.checkBlack, 'armor.cloth2': THEME_COLOURS.checkWhite, 'armor.lace': THEME_COLOURS.incaRed } },
};

/** The themes, each: a `label`, its `field` (its main colour, by which two sides are told apart), `accent`, `sign`, the kits it dresses, what every man of it wears (`every`). */
export const ARMY_THEMES = {
  // ---- The Ming, and the Japanese in Korea ----
  mingRed: { label: 'Ming red', field: THEME_COLOURS.mingRed, accent: THEME_COLOURS.mingTassel, sign: THEME_COLOURS.mingTassel, kinds: MING_KINDS },
  mingDark: { label: 'Dark iron, red trim', field: THEME_COLOURS.darkIron, accent: THEME_COLOURS.mingTassel, sign: THEME_COLOURS.mingTassel, kinds: {
    mingBrigandine: { paint: { 'armor.cloth': 'field', 'armor.cloth2': 'deep', 'armor.cord': 'accent', 'head.tassel': 'accent' } },
    mingIronLamellar: { paint: { top: 'field', 'armor.cloth': 'field', 'armor.cloth2': 'accent', 'head.tassel': 'accent' } },
  } },
  konishi: { label: 'Black lacquer, white sashimono', field: THEME_COLOURS.lacquer, accent: THEME_COLOURS.lacingBlue, sign: THEME_COLOURS.sashimono, lacquer: THEME_COLOURS.lacquer, lace: THEME_COLOURS.lacingBlue, kinds: JAPANESE_KINDS,
    every: { banner: THEME_COLOURS.sashimono, crest: { mark: 'disc', color: THEME_COLOURS.lacquer } } },
  // Katō Kiyomasa's men at Ulsan: the Nichiren prayer (Namu Myōhō Renge Kyō) down a white sashimono, his black ring (janome) above it.
  kato: { label: 'Katō Kiyomasa', field: THEME_COLOURS.lacquer, accent: THEME_COLOURS.lacingBlue, sign: THEME_COLOURS.sashimono, lacquer: THEME_COLOURS.lacquer, lace: THEME_COLOURS.lacingBlue, kinds: JAPANESE_KINDS,
    every: { banner: THEME_COLOURS.sashimono, crest: { mark: 'prayer', color: THEME_COLOURS.lacquer } } },
  // ---- Sekigahara ----
  // Tokugawa's East: black lacquer, white sashimono with the hollyhock (aoi), the great gold fan his standard; Ii Naomasa's men
  // all in red (the akazonae), here his horse.
  east: { label: 'The East', field: THEME_COLOURS.lacquer, accent: THEME_COLOURS.fanGold, sign: THEME_COLOURS.sashimono, lacquer: THEME_COLOURS.lacquer, kinds: JAPANESE_KINDS,
    every: { banner: THEME_COLOURS.sashimono, crest: { mark: 'hollyhock', color: THEME_COLOURS.lacquer }, standard: THEME_COLOURS.fanGold } },
  ii: { label: "Ii's red", field: THEME_COLOURS.redLacquer, accent: THEME_COLOURS.fanGold, sign: THEME_COLOURS.redLacquer, lacquer: THEME_COLOURS.redLacquer, only: { mounted: true }, kinds: JAPANESE_KINDS,
    every: { banner: THEME_COLOURS.redLacquer, crest: { mark: 'none' }, standard: THEME_COLOURS.fanGold } },
  west: { label: 'The West', field: THEME_COLOURS.westBlue, accent: THEME_COLOURS.lacingBlue, sign: THEME_COLOURS.westBlue, lace: THEME_COLOURS.lacingBlue, kinds: JAPANESE_KINDS,
    every: { banner: THEME_COLOURS.westBlue, crest: { mark: 'disc', color: THEME_COLOURS.sashimono } } },
  // ---- The Eight Banners ----
  banners: { label: 'Yellow, white and blue banners', field: THEME_COLOURS.bannerYellow, accent: THEME_COLOURS.bannerBlue, sign: THEME_COLOURS.bannerYellow, kinds: BANNER_KINDS },
  redBanners: { label: 'The red banners', field: '#b0262a', accent: THEME_COLOURS.bannerWhite, sign: '#b0262a', kinds: {
    bannerArmour: { paint: { 'armor.cloth': 'field', 'head.coif': 'field', top: '#962024' } },
    bayara: { paint: { 'armor.cloth': 'field', 'head.coif': 'field', top: '#962024' } },
  } },
  // ---- Cajamarca ----
  spaniards: { label: 'The Spaniards', field: THEME_COLOURS.darkWool, accent: THEME_COLOURS.buff, sign: THEME_COLOURS.spanishRed, kinds: {
    conquistadorPlate: { paint: { top: { mix: [THEME_COLOURS.darkWool, THEME_COLOURS.buff] }, 'armor.cloth': 'top', 'armor.cloth2': 'top' } },
    conquistadorQuilted: { paint: { top: THEME_COLOURS.darkWool, 'armor.color': THEME_COLOURS.buff, 'armor.cloth': THEME_COLOURS.buff, 'armor.cloth2': '#957450' } },
  }, every: { sash: THEME_COLOURS.spanishRed } },
  inca: { label: 'The checkerboard uncu', field: THEME_COLOURS.checkWhite, accent: THEME_COLOURS.incaRed, sign: THEME_COLOURS.checkBlack, kinds: INCA_KINDS },
  incaLords: { label: "The lords' colours", field: THEME_COLOURS.incaRed, accent: '#d6a743', sign: THEME_COLOURS.incaRed, kinds: {
    incaUncu: { paint: { 'armor.color': { mix: [THEME_COLOURS.incaRed, '#2a3f7a', '#d6a743'] }, 'armor.cloth': 'armor.color', 'armor.cloth2': THEME_COLOURS.checkWhite } },
  } },
  // ---- Fort Zeelandia ----
  dutch: { label: 'The VOC', field: THEME_COLOURS.buff, accent: THEME_COLOURS.greyWool, sign: THEME_COLOURS.orange, kinds: {
    conquistadorPlate: { paint: { top: THEME_COLOURS.greyWool, 'armor.cloth': THEME_COLOURS.greyWool } },
    conquistadorQuilted: { paint: { top: THEME_COLOURS.buff, 'armor.color': THEME_COLOURS.buff, 'armor.cloth': THEME_COLOURS.buff } },
  }, every: { sash: THEME_COLOURS.orange } },
  // ---- The Hospitallers and the Ottomans ----
  hospitallers: { label: 'The Order of St John', field: THEME_COLOURS.hospitallerRed, accent: THEME_COLOURS.crossWhite, sign: THEME_COLOURS.crossWhite, kinds: {
    knight: { paint: { top: 'field', bottom: 'deep' } },
    footman: { paint: { 'armor.cloth': 'field' } },
  }, every: { badge: { field: THEME_COLOURS.hospitallerRed, mark: 'cross', color: THEME_COLOURS.crossWhite, tabard: true } } },
  ottomans: { label: 'Janissary blue', field: THEME_COLOURS.janissaryBlue, accent: THEME_COLOURS.feltWhite, sign: THEME_COLOURS.ottomanGreen, kinds: {
    janissary: { paint: { top: 'field', 'armor.color': 'field', 'armor.cloth': 'field', 'armor.cloth2': 'deep' },
      designs: { 3: { 'head.color': THEME_COLOURS.feltWhite }, 4: { 'head.color': THEME_COLOURS.feltWhite }, 5: { 'head.color': THEME_COLOURS.feltWhite } } },
  } },
  ottomanRed: { label: 'Cavalry red', field: '#9e1b1b', accent: THEME_COLOURS.feltWhite, sign: THEME_COLOURS.ottomanGreen, kinds: {
    janissary: { paint: { top: 'field', 'armor.color': 'field', 'armor.cloth': 'field', 'armor.cloth2': 'deep' } },
    ottomanHeavy: { paint: { top: 'field', bottom: 'deep' } },
  } },
  // ---- Agincourt ----
  english: { label: 'White jacks, the red cross', field: THEME_COLOURS.englishWhite, accent: THEME_COLOURS.stGeorge, sign: THEME_COLOURS.stGeorge, kinds: {
    archer: { paint: { 'armor.color': 'field', 'armor.cloth': 'field', 'armor.cloth2': '#cfc8b6' } },
    knight: { paint: { top: 'field' } },
    footman: { paint: { 'armor.cloth': 'field' } },
  }, every: { badge: { field: THEME_COLOURS.englishWhite, mark: 'cross', color: THEME_COLOURS.stGeorge } } },
  french: { label: 'Blue and gold, the white cross', field: THEME_COLOURS.frenchBlue, accent: THEME_COLOURS.frenchGold, sign: THEME_COLOURS.crossWhite, kinds: {
    knight: { paint: { top: 'field', bottom: 'deep' } },
    footman: { paint: { 'armor.cloth': 'field' } },
    archer: { paint: { 'armor.color': 'field', 'armor.cloth': 'field', 'armor.cloth2': 'accent' } },
  }, every: { badge: { field: THEME_COLOURS.frenchBlue, mark: 'cross', color: THEME_COLOURS.crossWhite, border: THEME_COLOURS.frenchGold, tabard: true } } },
  // ---- Rome, Parthia, the Huns and the Goths ----
  romans: { label: 'Roman red', field: THEME_COLOURS.romanRed, accent: '#b98a3e', sign: THEME_COLOURS.romanRed, kinds: {
    legionary: { paint: { top: 'field', bottom: 'field' } },
    republicanLegionary: { paint: { top: 'field', bottom: 'field' } },
    centurion: { paint: { top: 'field', bottom: 'field' } },
    romanAuxiliary: { paint: { top: 'field' } },
  } },
  lateRomans: { label: 'Late-Roman white', field: THEME_COLOURS.lateWhite, accent: THEME_COLOURS.purple, sign: THEME_COLOURS.purple, kinds: {
    lateRoman: { paint: { top: 'field', 'armor.cloth': 'accent' } },
    legionary: { paint: { top: 'field', bottom: 'field' } },
    centurion: { paint: { top: 'field', bottom: 'field' } },
  } },
  parthians: { label: 'Saffron and ochre', field: THEME_COLOURS.saffron, accent: THEME_COLOURS.ochre, sign: THEME_COLOURS.saffron, kinds: {
    parthianArcher: { paint: { top: { mix: [THEME_COLOURS.saffron, THEME_COLOURS.ochre] }, 'armor.color': 'top', 'armor.cloth': 'top' } },
  } },
  parthiansUndyed: { label: 'Undyed', field: THEME_COLOURS.undyed, accent: THEME_COLOURS.ochre, sign: THEME_COLOURS.undyed, kinds: {
    parthianArcher: { paint: { top: 'field', 'armor.color': 'field', 'armor.cloth': 'field' } },
  } },
  visigoths: { label: 'Visigoth blue', field: THEME_COLOURS.gothBlue, accent: '#d6a743', sign: THEME_COLOURS.gothBlue, kinds: {
    goth: { paint: { top: 'field', 'armor.cloth': 'field' } },
    gothNoble: { paint: { top: 'field', 'armor.cloth': 'field' } },
  } },
  germans: { label: 'Undyed', field: THEME_COLOURS.undyed, accent: THEME_COLOURS.felt, sign: THEME_COLOURS.undyed, kinds: {
    goth: { paint: { top: 'field', 'armor.cloth': 'field' } },
    gothNoble: { paint: { top: 'field', 'armor.cloth': 'field' } },
  } },
  huns: { label: 'Felt and fur', field: THEME_COLOURS.felt, accent: THEME_COLOURS.ochre, sign: THEME_COLOURS.felt, kinds: {
    hun: { paint: { top: { mix: [THEME_COLOURS.felt, THEME_COLOURS.ochre] }, 'armor.color': 'top', 'armor.cloth': 'top' } },
    hunNoble: { paint: { top: { mix: [THEME_COLOURS.felt, THEME_COLOURS.ochre] }, 'armor.cloth': 'top' } },
  } },
  // ---- The Han and the Xiongnu ----
  han: { label: 'Han red', field: THEME_COLOURS.hanRed, accent: '#5a1a14', sign: THEME_COLOURS.hanRed, kinds: {
    hanSoldier: { paint: { top: 'field', 'armor.cloth': 'field', 'armor.cloth2': 'deep' } },
    hanCavalry: { paint: { top: 'field', 'armor.cloth': 'field', 'armor.cloth2': 'deep' } },
  } },
  xiongnu: { label: 'Felt and fur', field: THEME_COLOURS.felt, accent: THEME_COLOURS.grey, sign: THEME_COLOURS.felt, kinds: {
    xiongnu: { paint: { top: { mix: [THEME_COLOURS.felt, THEME_COLOURS.grey] }, 'armor.color': 'top', 'armor.cloth': 'top' } },
  } },
  // ---- The sea raiders: whatever they had, undyed hemp, browns and faded indigo, no sign ----
  raiders: { label: 'Hemp, brown and faded indigo', field: THEME_COLOURS.hemp, accent: THEME_COLOURS.felt, sign: null, kinds: {
    wokou: { paint: { top: { mix: [THEME_COLOURS.hemp, THEME_COLOURS.felt, THEME_COLOURS.fadedIndigo] } } },
    wokouArmoured: { paint: { top: { mix: [THEME_COLOURS.hemp, THEME_COLOURS.felt, THEME_COLOURS.fadedIndigo] } } },
  } },
  // ---- The steppe and the Mexica (custom battles) ----
  steppe: { label: 'Felt browns', field: THEME_COLOURS.felt, accent: THEME_COLOURS.ochre, sign: THEME_COLOURS.felt, kinds: {
    steppeLight: { paint: { top: { mix: [THEME_COLOURS.felt, THEME_COLOURS.ochre, THEME_COLOURS.grey] }, 'armor.color': 'top', 'armor.cloth': 'top' } },
    steppeMedium: { paint: { top: { mix: [THEME_COLOURS.felt, THEME_COLOURS.ochre] }, 'armor.cloth': 'top' } },
  } },
  mongolBlue: { label: 'Mongol blue', field: THEME_COLOURS.mongolBlue, accent: '#d6a743', sign: THEME_COLOURS.mongolBlue, kinds: {
    steppeLight: { paint: { top: 'field', 'armor.color': 'field', 'armor.cloth': 'field' } },
    steppeMedium: { paint: { top: 'field', 'armor.cloth': 'field' } },
  } },
  mexica: { label: 'White quilted cotton', field: THEME_COLOURS.mexicaWhite, accent: '#2f7a5a', sign: THEME_COLOURS.mexicaWhite, kinds: {
    mexicaWarrior: { paint: { 'armor.color': 'field', 'armor.cloth': 'field' } },
  } },
  jaguarEagle: { label: 'Jaguar and eagle', field: THEME_COLOURS.jaguar, accent: THEME_COLOURS.eagle, sign: THEME_COLOURS.jaguar, kinds: {
    mexicaWarrior: { paint: { 'armor.color': { mix: [THEME_COLOURS.jaguar, THEME_COLOURS.eagle] }, 'armor.cloth': 'armor.color' } },
  } },
  knightsRed: { label: 'Red and white', field: '#9e1b1b', accent: THEME_COLOURS.crossWhite, sign: THEME_COLOURS.crossWhite, kinds: {
    knight: { paint: { top: 'field', bottom: 'deep' } },
    footman: { paint: { 'armor.cloth': 'field' } },
  }, every: { badge: { field: '#9e1b1b', mark: 'cross', color: THEME_COLOURS.crossWhite, tabard: true } } },
};

/** A battle's sides, each corner its themes in order (scenarios.js SCENARIOS keys; story battles by `story:<id>`). */
export const BATTLE_THEMES = {
  pyongyang: { red: ['mingRed'], blue: ['konishi'] },
  sarhu: { red: ['mingRed'], blue: ['banners'] },
  sekigahara: { red: ['ii', 'east'], blue: ['west'] },
  cajamarca: { red: ['spaniards'], blue: ['inca'] },
  zeelandia: { red: ['dutch'], blue: ['mingRed'] },
  // The Siege of Rhodes (1522) is the same Order and the same enemy as Malta (1565): the same colours.
  rhodes: { red: ['hospitallers'], blue: ['ottomans'] },
  agincourt: { red: ['french'], blue: ['english'] },
  carrhae: { red: ['romans'], blue: ['parthians'] },
  catalaunian: { red: ['lateRomans', 'visigoths'], blue: ['huns', 'germans'] },
  mobei: { red: ['han'], blue: ['xiongnu'] },
  // The Wokou raids: the Qi side's men keep their native dress (the elite infantry's own); only the raiders and the coast's
  // brigandine men are dressed.
  wokou: { red: ['raiders'], blue: ['mingRed'] },
  qiJiguang: { red: ['raiders'], blue: ['mingRed'] },
  'story:wokou': { red: ['raiders'], blue: ['mingRed'] },
  'story:pyongyang': { red: ['mingRed'], blue: ['konishi'] },
  'story:byeokjegwan': { red: ['mingRed'], blue: ['konishi'] },
  'story:ulsan': { red: ['mingRed'], blue: ['kato'] },
  'story:liaodong': { red: ['mingRed'], blue: ['banners'] },
  'story:sarhu': { red: ['mingRed'], blue: ['banners'] },
  'story:hunriver': { red: ['mingRed'], blue: ['banners'] },
};

/** An army set up on its own (muster.js), where its battle names none: by scenarios.js ARMIES key. */
export const ARMY_DEFAULT = {
  ming: 'mingRed', koxinga: 'mingRed', coast: 'mingRed', banners: 'banners', east: 'east', west: 'west', spanish: 'spaniards', inca: 'inca',
  dutch: 'dutch', hospitallers: 'hospitallers', ottomans: 'ottomans', legion: 'romans', crassus: 'romans', parthians: 'parthians',
  lateRome: 'lateRomans', visigoths: 'visigoths', huns: 'huns', germans: 'germans', han: 'han', xiongnu: 'xiongnu', raiders: 'raiders',
  france1415: 'french', england: 'english',
};

/** A custom battle's factions (outfits.js FACTIONS keys): a main theme and an alternate. The rest keep their own colours. */
export const FACTION_THEMES = {
  knights: { main: 'knightsRed', alt: 'french' },
  japanese: { main: 'konishi', alt: 'west' },
  chinese: { main: 'mingRed', alt: 'mingDark' },
  manchu: { main: 'banners', alt: 'redBanners' },
  mexica: { main: 'mexica', alt: 'jaguarEagle' },
  inca: { main: 'inca', alt: 'incaLords' },
  steppe: { main: 'steppe', alt: 'mongolBlue' },
  ottomans: { main: 'ottomans', alt: 'ottomanRed' },
  romans: { main: 'romans', alt: 'lateRomans' },
  goths: { main: 'visigoths', alt: 'germans' },
  parthians: { main: 'parthians', alt: 'parthiansUndyed' },
};

// How far a man's paint is shaded a step lighter or darker (his name picks the step: -1, 0, 1), and how much darker `deep` is
// than the field. Three steps, so a side's men are still few crowd templates (crowdview.js crowdKey).
export const THEME_SHADE = { step: 0.06, deep: 0.45 };
// Two themes too alike to tell apart: their fields' hues within `hue` degrees and their lightness within `light`, or both
// greys (saturation under `grey`) within `light`.
export const THEME_CONTRAST = { hue: 35, light: 0.25, grey: 0.15 };

// ---- Colour arithmetic ----

function rgbOf(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function hexOf([r, g, b]) {
  return `#${[r, g, b].map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('')}`;
}

/** A colour made lighter (amount > 0, toward white) or darker (< 0, toward black). */
export function shadeOf(hex, amount) {
  const target = amount > 0 ? 255 : 0;
  return hexOf(rgbOf(hex).map((channel) => channel + (target - channel) * Math.abs(amount)));
}

/** Hue (degrees), saturation and lightness (0-1). */
export function hslOf(hex) {
  const [r, g, b] = rgbOf(hex).map((channel) => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  if (max === min) return { hue: 0, sat: 0, light };
  const span = max - min;
  const sat = light > 0.5 ? span / (2 - max - min) : span / (max + min);
  const hue = max === r ? ((g - b) / span + (g < b ? 6 : 0)) : max === g ? (b - r) / span + 2 : (r - g) / span + 4;
  return { hue: hue * 60, sat, light };
}

/** Whether two themes' fields are too alike to tell two sides apart by (THEME_CONTRAST). */
export function sameLook(themeA, themeB) {
  const a = hslOf(ARMY_THEMES[themeA].field);
  const b = hslOf(ARMY_THEMES[themeB].field);
  const near = Math.abs(a.light - b.light) < THEME_CONTRAST.light;
  if (a.sat < THEME_CONTRAST.grey && b.sat < THEME_CONTRAST.grey) return near;
  if (a.sat < THEME_CONTRAST.grey || b.sat < THEME_CONTRAST.grey) return false;
  const hue = Math.abs(a.hue - b.hue);
  return Math.min(hue, 360 - hue) < THEME_CONTRAST.hue && near;
}

// A lacquered armour's colour, not bare iron or steel: a grey of little saturation and some lightness is metal.
function lacquered(hex) {
  if (!hex) return false;
  const { sat, light } = hslOf(hex);
  return !(sat < 0.18 && light > 0.2);
}

// A small hash of a man's name and kit, for his shade step and his pick of a mix: the same man the same each time.
function hashOf(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function valueAt(object, path) {
  return path.split('.').reduce((at, key) => (at && typeof at === 'object' ? at[key] : undefined), object);
}

// ---- Dressing a man ----

/** The theme of these (in order) that dresses this man: the first naming his kit (and its `only`, if it says one), else null. */
function themeFor(inputs, themeKeys) {
  const kind = inputs.outfit?.kind;
  for (const key of themeKeys ?? []) {
    const theme = ARMY_THEMES[key];
    if (!theme?.kinds?.[kind]) continue;
    if (theme.only?.mounted && !inputs.mounted) continue;
    return { key, theme };
  }
  return null;
}

/**
 * A man in his side's theme (the first of `themeKeys` that dresses his kit): his inputs with the theme's colours written into his
 * outfit (`paint`, `colors`, `tint`, `banner`, `crest`, `badge`, `sash`) and `standardColour`. A man no theme dresses comes back as he
 * was. Done again it gives the same (his own colours are read without any earlier theme's).
 */
export function themedMan(inputs, themeKeys) {
  const found = themeFor(inputs, themeKeys);
  if (!found) return inputs;
  const { theme } = found;
  const kind = inputs.outfit.kind;
  const { paint: _old, ...outfit } = inputs.outfit;
  const own = outfitOf({ ...inputs, outfit }).look;
  const hash = hashOf(`${inputs.name ?? ''}|${kind}|${inputs.outfit.design ?? 0}|${inputs.heightCm ?? 0}`);
  const step = ((hash % 3) - 1) * THEME_SHADE.step;
  const spec = theme.kinds[kind];
  const design = outfitOf({ ...inputs, outfit }).design;
  const wanted = { ...spec.paint, ...spec.designs?.[design] };
  const roles = { field: theme.field, deep: shadeOf(theme.field, -THEME_SHADE.deep), accent: theme.accent, sign: theme.sign };
  const paint = {};
  const picked = {};
  for (const [path, value] of Object.entries(wanted)) {
    // Only a colour the design has: a theme adds no piece.
    const current = path === 'top' || path === 'bottom' ? own[path]?.color : valueAt(own, path);
    if (typeof current !== 'string') continue;
    // (A value naming another path takes that path's pick: a doublet's sleeves the colour of the doublet.)
    const colour = typeof value === 'object' ? value.mix[(hash >>> 3) % value.mix.length] : roles[value] ?? picked[value] ?? value;
    if (typeof colour !== 'string' || !colour.startsWith('#')) continue;
    picked[path] = colour;
    paint[path] = shadeOf(colour, step);
  }
  const { top, bottom, ...look } = paint;
  const handColors = Boolean(outfit.handColors);
  const colors = handColors ? outfit.colors : { ...outfit.colors, ...(top ? { top } : {}), ...(bottom ? { bottom } : {}) };
  // The lacquer: the theme's, else the side's own (scenarios.js SEKIGAHARA_WEST), on lacquered armour only.
  const lacquer = theme.lacquer ?? outfit.tint?.armor;
  const tint = theme.lacquer || theme.lace
    ? { ...(lacquer && lacquered(own.armor?.color) ? { armor: lacquer } : {}), ...(theme.lace ? { lace: theme.lace } : {}) }
    : outfit.tint;
  const every = theme.every ?? {};
  const themed = {
    ...outfit,
    ...(Object.keys(look).length ? { paint: look } : {}),
    ...(colors && Object.keys(colors).length ? { colors } : {}),
    ...(tint ? { tint } : {}),
    ...(every.banner ? { banner: every.banner } : {}),
    ...(every.crest ? { crest: every.crest } : {}),
    ...(every.badge ? { badge: every.badge } : {}),
    ...(every.sash ? { sash: every.sash } : {}),
    theme: found.key,
  };
  return { ...inputs, outfit: themed, ...(every.standard ? { standardColour: every.standard } : {}) };
}

/** Each side's men ({ red: [inputs], blue: [inputs] }) in its themes (`themes`: { red: [keys], blue: [keys] }). */
export function themedSides(cast, themes) {
  if (!themes) return cast;
  return Object.fromEntries(Object.entries(cast).map(([corner, side]) => [corner, side.map((inputs) => themedMan(inputs, themes[corner]))]));
}

/** Fighters ([{ inputs, corner }], a story battle's) in their sides' themes. */
export function themedFighters(fighters, themes) {
  if (!themes) return fighters;
  return fighters.map((fighter) => ({ ...fighter, inputs: themedMan(fighter.inputs, themes[fighter.corner]) }));
}

/**
 * A battle's sides' themes: its own (BATTLE_THEMES), else each side's armies' (ARMY_DEFAULT), unless the two sides' would look
 * alike (Rome's red against the Han's: then neither, each keeps its own); null where none.
 */
export function battleThemes(key, armies = null) {
  if (BATTLE_THEMES[key]) return BATTLE_THEMES[key];
  if (!armies) return null;
  const sides = Object.fromEntries(Object.entries(armies).map(([corner, keys]) => [corner, keys.map((army) => ARMY_DEFAULT[army]).filter(Boolean)]));
  if (!Object.values(sides).some((keys) => keys.length)) return null;
  const [red, blue] = [sides.red?.[0], sides.blue?.[0]];
  return red && blue && sameLook(red, blue) ? null : sides;
}

/** A custom battle's sides' themes from their factions: each its main; the blue its alternate where the two mains look alike. */
export function factionThemes(factions) {
  const main = (faction) => FACTION_THEMES[faction]?.main;
  const red = main(factions.red);
  let blue = main(factions.blue);
  if (red && blue && sameLook(red, blue) && FACTION_THEMES[factions.blue]?.alt) blue = FACTION_THEMES[factions.blue].alt;
  return { red: red ? [red] : [], blue: blue ? [blue] : [] };
}
