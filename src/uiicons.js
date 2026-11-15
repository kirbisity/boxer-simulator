import { onLangChange } from './i18n.js';

// The interface's own icons: one hand for all of them (a 24 px square, a 1.5 px line, no fill), drawn here as inline SVG (no assets),
// in the colour of the text around them, each under a plain name. The game's words carry no pictures: where a label has one, the
// place that builds the label names it (static markup with `data-icon="name"`, code with `withIcon`, `uiIcon` or `uiIconHtml`),
// and it is drawn from here. A name with no drawing draws nothing.

const UI_ICON_PATHS = {
  // ---- The modes and the menus ----
  // Career: a cup.
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.2c0 2.2 1.2 3.6 3.1 4M16 6h2.8c0 2.2-1.2 3.6-3.1 4"/><path d="M12 13v4M9.5 17h5v3h-5zM7.5 20h9"/>',
  // Story: a bound book.
  book: '<path d="M6 6.5a2.5 2.5 0 0 1 2.5-2.5H18v12.5H8.5A2.5 2.5 0 0 0 6 19z"/><path d="M6 19a2.5 2.5 0 0 0 2.5 1.5H18v-4"/><path d="M10 8h5M10 11h5"/>',
  // Battles: a standard on its pole.
  banner: '<path d="M6 3v18"/><path d="M6 4.5h12.5l-3 3.5 3 3.5H6"/>',
  // The stage, and the knights: a gate tower.
  castle: '<path d="M5 4h3v2h2.5V4h3v2H16V4h3v4.5L17.5 10v11h-11V10L5 8.5z"/><path d="M10 21v-4.5a2 2 0 0 1 4 0V21"/>',
  // The last stand, and Rome: a shield.
  shield: '<path d="M12 3l7 2.5V11c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V5.5z"/><path d="M12 3v18M5 10.5h14"/>',
  // Who would win, and a death: a skull.
  skull: '<path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.6 1.3 4.6 3 5.8V19a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-2.7c1.7-1.2 3-3.2 3-5.8A7.5 7.5 0 0 0 12 3z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10.5 17.5V20M13.5 17.5V20"/>',
  // The quick fight: a bolt.
  bolt: '<path d="M13 3L5 13.5h6L10 21l8.5-11h-6z"/>',
  // The sandbox: a flask.
  flask: '<path d="M9.5 3h5M10.5 3v6.2L5.2 18.6A1.6 1.6 0 0 0 6.6 21h10.8a1.6 1.6 0 0 0 1.4-2.4L13.5 9.2V3"/><path d="M7.8 15h8.4"/>',
  // The prize fight, and the ring: a glove.
  glove: '<path d="M8 20v-3.5C6.2 15.6 5 13.6 5 11.2 5 7.8 7.6 5 11 5h1.5C15 5 17 7 17 9.5V12h.5a2 2 0 0 1 2 2c0 1.4-1.1 2.5-2.5 2.5H16V20z"/><path d="M8 17h8"/>',
  // Steel: two swords crossed.
  swords: '<path d="M4.5 4.5l14 14M19.5 4.5l-14 14M12 16l4-4M8 12l4 4"/><path d="M4.5 7.1V4.5h2.6M19.5 7.1V4.5h-2.6"/>',
  // The training yard, and a shot aimed: a butt.
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.7"/><circle cx="12" cy="12" r="1"/>',
  // Not open yet: a lock.
  lock: '<path d="M7 11h10v9H7z"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/>',
  // A way in to the menu: three lines.
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  // The settings, a setup: a cog.
  cog: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M5.6 18.4l2.2-2.2M16.2 7.8l2.2-2.2"/>',
  // Play it: the triangle.
  play: '<path d="M8 5l11 7-11 7z"/>',
  // The controls: a pad.
  pad: '<path d="M7 8h10a4 4 0 0 1 4 4v1.2a2.8 2.8 0 0 1-5.2 1.5L15 14H9l-.8.7A2.8 2.8 0 0 1 3 13.2V12a4 4 0 0 1 4-4z"/><path d="M7.5 10v3M6 11.5h3"/><circle cx="16.5" cy="11.5" r=".7"/>',
  // Only watch: an eye.
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  // Unseen: a ghost.
  ghost: '<path d="M6 20V10a6 6 0 0 1 12 0v10l-2-1.6-2 1.6-2-1.6-2 1.6-2-1.6z"/><circle cx="9.8" cy="10.5" r=".8"/><circle cx="14.2" cy="10.5" r=".8"/>',
  // The man played: a figure.
  figure: '<circle cx="12" cy="5.3" r="2.2"/><path d="M12 7.5v7.5M8.2 10.5h7.6M12 15l-2.5 6M12 15l2.5 6"/>',
  // On foot: a man walking.
  walker: '<circle cx="12.5" cy="4.8" r="2.1"/><path d="M12.5 7.5L11 14l3.5 3 .8 4.3M11 14l-1.3 3.5-3 3.3M7 12.5l2.5-3.5 3-1.5 2.5 3.5 3 1"/>',
  // At random: a die.
  die: '<rect x="4.5" y="4.5" width="15" height="15" rx="2"/><circle cx="8.6" cy="8.6" r=".7"/><circle cx="15.4" cy="15.4" r=".7"/><circle cx="12" cy="12" r=".7"/><circle cx="15.4" cy="8.6" r=".7"/><circle cx="8.6" cy="15.4" r=".7"/>',
  // The camera.
  camera: '<rect x="3.5" y="7.5" width="11.5" height="9.5" rx="1.5"/><path d="M15 11l5.5-3v8.5L15 13.5"/>',
  // The colours' key: a palette.
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 2-.9 2-1.9 0-1.4-1-1.8-1-3 0-1 .9-1.6 2-1.6h2.2c1.9 0 3.3-1.4 3.3-3.3 0-4-3.8-7.2-8.5-7.2z"/><circle cx="7.6" cy="12.8" r=".9"/><circle cx="9" cy="8.6" r=".9"/><circle cx="13" cy="7.2" r=".9"/><circle cx="16.6" cy="9.8" r=".9"/>',
  // Make your own: a pencil.
  pencil: '<path d="M4 20l1-4.5L16.5 4l3.5 3.5L8.5 19z"/><path d="M14 6.5l3.5 3.5M5 15.5L8.5 19"/>',
  // The sound bench: a headset.
  headset: '<path d="M5.5 14v-2a6.5 6.5 0 0 1 13 0v2"/><rect x="3.5" y="13.5" width="3.8" height="6.5" rx="1.2"/><rect x="16.7" y="13.5" width="3.8" height="6.5" rx="1.2"/>',
  // What a man wears: a breastplate.
  armour: '<path d="M8.5 4L12 6l3.5-2 3.5 3-2 3.2V18L12 20.5 7 18v-7.8L5 7z"/><path d="M12 6v14.5M7 14.5h10"/>',

  // ---- Arms, mounts and the things of a fight ----
  // The bow.
  bow: '<path d="M7 3c6.5 3 6.5 15 0 18"/><path d="M7 3v18"/><path d="M3.5 12h16.5M17 9l3 3-3 3"/>',
  // The blade.
  blade: '<path d="M12 2.5l2 3.5v8h-4V6z"/><path d="M8 14h8M12 14v5"/><circle cx="12" cy="20.2" r="1.2"/>',
  // The finishing stroke: a knife.
  knife: '<path d="M19.5 4c.3 5.5-2.7 9.8-8 12L9 13.5z"/><path d="M7.5 12l4.5 4.5M9.8 14.2L4.5 19.5"/>',
  // A gun.
  gun: '<path d="M3 7h18v3.5H10.5L9 19H5l1.5-8.5H3z"/><path d="M10.2 13.5h2a1.6 1.6 0 0 0 1.6-1.6v-1.4"/>',
  // A grenade to throw: a bomb.
  bomb: '<circle cx="10.5" cy="14.5" r="6"/><path d="M14.7 10.3l2-2M16.7 8.3c.8-1.8 2.3-2.3 3.8-1.6M19.5 3v1.2M22 5.5h-1.2"/>',
  // More arrows brought up: a crate.
  crate: '<path d="M4 8l8-4 8 4v8.5l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8.5"/>',
  // A horse: its head.
  horse: '<path d="M8 21c.2-3 1.3-5 3.2-6.5l-2.7.5-2.2 1.8-2.1-2.3 4.6-6.7.4-3.6 2.6 2.3c4.2 1 6.7 4.7 6.7 9.5v6z"/><path d="M10.2 10.2h.01M14.5 9c1.3 1.5 2 3.5 2 6"/>',
  // A machine: a robot's head.
  robot: '<rect x="5" y="8" width="14" height="11.5" rx="2"/><path d="M12 8V5"/><circle cx="12" cy="4" r="1"/><circle cx="9.2" cy="12.5" r="1.3"/><circle cx="14.8" cy="12.5" r="1.3"/><path d="M9.5 16.2h5M2.8 12v3.5M21.2 12v3.5"/>',
  // The general: a crown.
  crown: '<path d="M4.5 17.5L3 7.5l5 4.5 4-6.5 4 6.5 5-4.5-1.5 10z"/><path d="M4.5 20.5h15"/>',
  // The open hand: take it up, or move the map.
  hand: '<path d="M8.5 12.5V6a1.25 1.25 0 0 1 2.5 0v5M11 11V4.5a1.25 1.25 0 0 1 2.5 0V11M13.5 11V5.5a1.25 1.25 0 0 1 2.5 0v6M16 11.5V8.2a1.25 1.25 0 0 1 2.5 0v6.3c0 3.7-2.5 6.5-6 6.5-2.7 0-4.3-1-5.7-3.4L4.3 13.7a1.3 1.3 0 0 1 2.2-1.4l2 2.7"/>',
  // Break off: an arrow turned back.
  back: '<path d="M9 5.5L4.5 10 9 14.5"/><path d="M4.5 10h10a4.75 4.75 0 0 1 0 9.5H11"/>',
  // Load again: an arrow round.
  reload: '<path d="M19.5 12a7.5 7.5 0 1 1-2.3-5.4"/><path d="M19.5 3.5v4.8h-4.8"/>',
  // The weapon's art: a four-pointed spark.
  spark: '<path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/>',

  // ---- The peoples and the fields (a faction's tab, a battle's card, a level of the Last Stand) ----
  // Japan: a torii.
  torii: '<path d="M3.5 6c5.5 1.5 11.5 1.5 17 0"/><path d="M5 10h14"/><path d="M7.5 7v13.5M16.5 7v13.5M12 7.3V10"/>',
  // The law, a patrol: a beacon.
  beacon: '<path d="M7.5 16v-3.5a4.5 4.5 0 0 1 9 0V16"/><path d="M5 16h14v3.5H5z"/><path d="M12 3v2M5.2 5.8l1.4 1.4M18.8 5.8l-1.4 1.4"/>',
  // The Mexica: a stepped temple.
  pyramid: '<path d="M2.5 20.5h19M4.5 20.5v-4h3v-4h3v-4h3v4h3v4h3v4"/><path d="M10.5 8.5V5.5h3v3M12 12.5v8"/>',
  // The Inca, Cajamarca: the sun.
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  // China: a pagoda.
  pagoda: '<path d="M12 2.5v2.5M6.5 9.5c2.8-.5 4.5-2 5.5-4.5 1 2.5 2.7 4 5.5 4.5M9 9.5v4M15 9.5v4M4 17c3-.5 4.8-1.5 5.8-3.5h4.4c1 2 2.8 3 5.8 3.5M7.5 17v4M16.5 17v4M5.5 21h13"/>',
  // The Eight Banners, the pirates: a pennon.
  pennon: '<path d="M6 3v18"/><path d="M6 4.5l13.5 4.2L6 13"/>',
  // The sultanates: a crescent.
  moon: '<path d="M19.5 14.5A8.2 8.2 0 1 1 9.8 4.3a6.5 6.5 0 0 0 9.7 10.2z"/>',
  // The gladiators: a temple front.
  column: '<path d="M3.5 9L12 4l8.5 5zM6.5 9v9M10.2 9v9M13.8 9v9M17.5 9v9M4.5 18h15M3 21h18"/>',
  // The street: a skyline.
  city: '<path d="M3 21h18M5 21V11h4.5v10M9.5 21V5h5.5v16M15 21v-8h4v8"/><path d="M11.8 8.5h1M11.8 11.5h1M11.8 14.5h1M6.8 14h1M6.8 17h1"/>',
  // The Goths: an axe.
  axe: '<path d="M15 3v18"/><path d="M15 7.5h-3L6 4.5c-1.6 3.4-1.6 7.6 0 11l6-3h3"/>',
  // The apes: a face.
  ape: '<circle cx="12" cy="12.5" r="6.5"/><circle cx="4.3" cy="10.5" r="1.7"/><circle cx="19.7" cy="10.5" r="1.7"/><ellipse cx="12" cy="15.2" rx="3.4" ry="2.4"/><path d="M9.6 10.5h.01M14.4 10.5h.01"/>',
  // A rising of the fields: an ear of wheat.
  wheat: '<path d="M12 21V8.5"/><path d="M12 8.5c-1.6-1.5-1.6-3.5 0-5 1.6 1.5 1.6 3.5 0 5zM12 13c-2.6 0-4.2-1.6-4.2-4.2 2.6 0 4.2 1.6 4.2 4.2zM12 13c2.6 0 4.2-1.6 4.2-4.2-2.6 0-4.2 1.6-4.2 4.2zM12 17.5c-2.6 0-4.2-1.6-4.2-4.2 2.6 0 4.2 1.6 4.2 4.2zM12 17.5c2.6 0 4.2-1.6 4.2-4.2-2.6 0-4.2 1.6-4.2 4.2z"/>',
  // A harbour: a ship under sail.
  ship: '<path d="M3 15.5h18l-2.5 5h-13z"/><path d="M12 15.5V3M12 4.5l6.5 8H12M12 7l-5 5.5h5"/>',
  // A fort on the shore: an anchor.
  anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v13.5M8.5 10.5h7M4.5 13.5c.5 4.2 3.5 7 7.5 7s7-2.8 7.5-7M4.5 13.5L3 15.8M4.5 13.5l2.6.9M19.5 13.5l1.5 2.3M19.5 13.5l-2.6.9"/>',

  // ---- The weather of a ground (custombattleview.js) ----
  // Snow falling: a flake.
  snowflake: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.6 4.6L12 6.6l2.4-2M9.6 19.4l2.4-2 2.4 2M4.6 10.6l2.9-1.1-.5-3M19.4 13.4l-2.9 1.1.5 3M4.6 13.4l2.9 1.1-.5 3M19.4 10.6l-2.9-1.1.5-3"/>',
  // Showers: a cloud and its rain.
  rain: '<path d="M7.2 13.5a3.8 3.8 0 0 1 .4-7.6 4.9 4.9 0 0 1 9.2 1.6 3 3 0 0 1-.3 6z"/><path d="M8.5 16.5l-1 3M12.5 16.5l-1 3M16.5 16.5l-1 3"/>',
  // Broken cloud: a cloud with the sun behind it.
  cloud: '<path d="M8 19a3.6 3.6 0 0 1 .4-7.2 4.6 4.6 0 0 1 8.7 1.5 2.9 2.9 0 0 1-.3 5.7z"/><path d="M14 8.5a3.5 3.5 0 0 1 6.2 2.2M17.5 3.5v1.5M21.5 6.5l-1.1.9"/>',
  // A hazier sky: a cloud over the haze's bands.
  haze: '<path d="M7.2 13.5a3.8 3.8 0 0 1 .4-7.6 4.9 4.9 0 0 1 9.2 1.6 3 3 0 0 1-.3 6z"/><path d="M4 17h16M6.5 20.5h11"/>',

  // ---- The fight's moments (drama.js), over the man they happen to, and the fight log's lines ----
  // A knockout, a crash: a burst.
  burst: '<path d="M12 2.5L13.8 7.8L18.7 5.3L16.2 10.2L21.5 12L16.2 13.8L18.7 18.7L13.8 16.2L12 21.5L10.2 16.2L5.3 18.7L7.8 13.8L2.5 12L7.8 10.2L5.3 5.3L10.2 7.8z"/>',
  // Down: driven to the ground.
  down: '<path d="M7 5.5l5 5 5-5M7 11.5l5 5 5-5"/><path d="M5 20.5h14"/>',
  // Broken: a snapped shaft.
  snapped: '<path d="M3 16l7-2 1-3.5"/><path d="M13 14.5l1-3.5 7-2"/><path d="M11.5 5v2.2M8 6l1 1.9M15.5 6l-1 1.9"/>',
  // Blood: a drop.
  drop: '<path d="M12 3.5c3 4 5.5 6.8 5.5 10a5.5 5.5 0 0 1-11 0c0-3.2 2.5-6 5.5-10z"/>',
  // Staggered: reeling.
  reel: '<path d="M12 12.2a1.2 1.2 0 1 0-1.2-1.2c0 2 1.6 3.4 3.6 3.4a4 4 0 0 0 4-4c0-3.4-2.8-5.9-6.2-5.9a6.8 6.8 0 0 0-6.8 6.8c0 4.6 3.8 8.2 8.4 8.2"/>',
  // Panic: a face, mouth open.
  panic: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 9.5h1.2M14.3 9.5h1.2"/><ellipse cx="12" cy="15" rx="1.8" ry="2.6"/>',
  // Pain: a face screwed up.
  wince: '<circle cx="12" cy="12" r="8.5"/><path d="M7.6 8.5l2.4 1.3-2.4 1.3M16.4 8.5L14 9.8l2.4 1.3M8.5 16c1.2-1.3 2.3-1.3 3.5 0s2.3 1.3 3.5 0"/>',
  // Fights on: a flame.
  flame: '<path d="M12 3c.5 3.5 4.5 5.5 4.5 10.5a4.5 4.5 0 0 1-9 0c0-2 1-3.5 2-4.5.2 1.5.8 2.3 1.5 2.8C11 9 10.5 5.5 12 3z"/>',
  // Rage: the four corners drawn in.
  rage: '<path d="M9.5 4.5V8A1.5 1.5 0 0 1 8 9.5H4.5M14.5 4.5V8A1.5 1.5 0 0 0 16 9.5h3.5M9.5 19.5V16A1.5 1.5 0 0 0 8 14.5H4.5M14.5 19.5V16a1.5 1.5 0 0 1 1.5-1.5h3.5"/>',
  // A hold: two rings locked.
  hold: '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>',
  // Knocked off: a cap, off the head (the one drawing for whatever it was: a hat, a plume, a helmet).
  cap: '<path d="M5.5 15a6.5 6.5 0 0 1 13 0v1.5h-13z"/><path d="M4 20h16"/><path d="M12 4v2.2M6.2 6l1.3 1.7M17.8 6l-1.3 1.7"/>',
  // Drowned: water.
  wave: '<path d="M2.5 9.5c2.2-3 4.3-3 6.5 0s4.3 3 6.5 0 4.3-3 6 0M2.5 15.5c2.2-3 4.3-3 6.5 0s4.3 3 6.5 0 4.3-3 6 0"/>',
};

// TRANSITION (removed once every label names its icon): the pictures the words still open with, and the drawing each one has.
const LEGACY = { '🏆': 'trophy', '📜': 'book', '🗺': 'banner', '🏰': 'castle', '🛡': 'shield', '☠': 'skull', '⚡': 'bolt', '🧪': 'flask', '🥊': 'glove', '⚔': 'swords', '🎯': 'target', '🔒': 'lock', '☰': 'menu', '⚙': 'cog', '▶': 'play', '🎮': 'pad', '👁': 'eye', '👻': 'ghost', '🧍': 'figure', '🎲': 'die', '🎥': 'camera', '🏹': 'bow', '🗡': 'blade', '⛩': 'torii', '🚓': 'beacon', '💥': 'burst', '💫': 'down', '🦴': 'snapped', '🩸': 'drop', '🌀': 'reel', '😱': 'panic', '🔥': 'flame', '💢': 'rage', '🤼': 'hold', '🎧': 'cap' };

/** The names drawn (a sheet of them, a test). */
export const UI_ICON_NAMES = Object.keys(UI_ICON_PATHS);

/** The drawn icon of a name (an SVG string), or null if it has none. */
export const uiIconMarkup = (name) => {
  const key = String(name ?? '').replace(/️/g, '');
  const paths = Object.hasOwn(UI_ICON_PATHS, key) ? UI_ICON_PATHS[key] : UI_ICON_PATHS[LEGACY[key]];
  return paths ? `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>` : null;
};

/** A name's icon as markup to write into a line built as HTML (the fight log's): a `span.glyph.drawn`, or '' with no drawing. */
export const uiIconHtml = (name, className = 'glyph label-glyph') => {
  const drawn = uiIconMarkup(name);
  return drawn ? `<span class="${className} drawn" aria-hidden="true">${drawn}</span>` : '';
};

/** A name's icon as an element (`span.glyph.drawn`), or null with no drawing (nothing is shown in its place). */
export function uiIcon(name, className = 'glyph') {
  const drawn = uiIconMarkup(name);
  if (!drawn || typeof document === 'undefined') return null;
  const node = document.createElement('span');
  node.ariaHidden = 'true';
  node.className = `${className} drawn`;
  node.innerHTML = drawn;
  return node;
}

// ---- A label's icon: `data-icon="name"` on the element, drawn in front of its words ----
// The icon is a child the dresser puts first (`span.label-glyph[data-icon-of]`). Whatever sets the label's words again (the page's
// translation on a change of language, a toggle that rewords its button) takes the icon out with the old words: each dressed
// label is watched for that alone, and dressed again as the new words land. Nothing here runs in a frame.

const iconOf = (node) => [...(node.children ?? [])].find((child) => child?.dataset?.iconOf !== undefined) ?? null;

function dressIcon(node) {
  const name = node.dataset?.icon ?? '';
  let icon = iconOf(node);
  if (icon && (icon.dataset.iconOf !== name || (node.firstChild !== undefined && node.firstChild !== icon))) {
    icon.remove?.();
    icon = null;
  }
  if (!icon) {
    icon = uiIcon(name, 'glyph label-glyph');
    if (icon) {
      icon.dataset.iconOf = name;
      node.prepend(icon);
    }
  }
  // (A button of the icon alone has no gap to keep beside it: boxer.css `.glyph-only`.)
  if (icon && !String(node.textContent ?? '').trim()) node.classList?.add('glyph-only');
  else node.classList?.remove('glyph-only');
}

const labelWatch = typeof MutationObserver === 'function' ? new MutationObserver((records) => {
  for (const node of new Set(records.map((record) => record.target))) dressIcon(node);
}) : null;

/** Give a label its icon by name (and keep it through any later change of its words): returns the label. */
export function withIcon(node, name) {
  if (!node?.dataset) return node;
  node.dataset.icon = name ?? '';
  dressIcon(node);
  if (labelWatch && typeof Node === 'function' && node instanceof Node) labelWatch.observe(node, { childList: true, attributes: true, attributeFilter: ['data-icon'] });
  return node;
}

/** Dress every label under `root` that names an icon (`data-icon`). Safe to run again. */
export function dressIcons(root = globalThis.document?.body) {
  if (typeof root?.querySelectorAll !== 'function') return;
  for (const node of root.querySelectorAll('[data-icon]')) withIcon(node, node.dataset.icon);
}

// TRANSITION: a label that still opens with a picture, dressed as before.
const LEADING_GLYPH = /^\s*((?:[\u{1F300}-\u{1FAFF}]|[☀-➿]|▶)️?)(?:\s+|$)/u;
export function dressLabels(root = globalThis.document?.body, selector = 'button, [data-glyph-label]') {
  if (typeof root?.querySelectorAll !== 'function') return;
  dressIcons(root);
  for (const node of root.querySelectorAll(selector)) {
    const first = node.firstChild;
    if (!first || first.nodeType !== 3) continue;
    const found = LEADING_GLYPH.exec(first.nodeValue);
    if (!found) continue;
    const glyph = found[1];
    if (!uiIconMarkup(glyph) && glyph.codePointAt(0) < 0x1F000) continue;
    first.nodeValue = first.nodeValue.slice(found[0].length);
    const icon = uiIcon(glyph, 'glyph label-glyph');
    if (icon) node.insertBefore(icon, first);
    if (icon && !first.nodeValue && node.childNodes.length === 2) node.classList.add('glyph-only');
  }
}

// The page's own labels (index.html) are dressed once the page's script has run, and again after each change of language (the
// watch has usually done it by then: this is the belt to its braces).
const WATCHED = ['#side-pick', '.banner-actions', '#home', '.controls', '#lastgate-screen'];
const WATCHED_LABELS = { '#lastgate-screen': 'button, h1, h2, h3, b, [data-glyph-label]' };
if (typeof document !== 'undefined' && typeof queueMicrotask === 'function') {
  const dressPage = () => queueMicrotask(() => dressLabels());
  dressPage();
  onLangChange(dressPage);
  queueMicrotask(() => {
    if (typeof MutationObserver !== 'function' || typeof document.querySelector !== 'function') return;
    for (const selector of WATCHED) {
      const place = document.querySelector(selector);
      if (place) new MutationObserver(() => dressLabels(place, WATCHED_LABELS[selector])).observe(place, { childList: true, subtree: true });
    }
  });
}
