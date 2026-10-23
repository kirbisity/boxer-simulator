// The fight's attack controls (the player picks between tapping his man and the
// buttons: see fightui/index.js): what each move of a style is on screen,
// its kind and the colour of that kind, and how each way of asking picks
// one. No DOM here: tests drive it directly.
//
// Screen coordinates here are x right and y UP, −1 to 1 about the middle,
// as the attack pad's (control.js attackLayout): a move's place is where it
// is seen to come from by a man behind the fighter.

import { attackLayout, moveName } from '../control.js';
import { MOVES, STYLES } from '../moves.js';
import { WORLD } from '../physics/config.js';
import { handling } from '../handling.js';

export const FIGHT_UI = {
  // The groups of the action buttons, in the order they sit round the guard.
  groups: ['straight', 'side', 'down', 'rising', 'low', 'push'],
  groupNames: { straight: 'Straight', side: 'Swing', down: 'From above', rising: 'Rising', low: 'Low', push: 'Push' },
  // One colour for each kind of blow, everywhere it is shown (the buttons, the
  // figure, the marks in the fight, the word): Okabe and Ito's colour-blind-safe
  // set, lifted a little to read on a night scene. Each kind has its own icon
  // shape too (a target, a sweep, a fall, a climb, a floor line, chevrons).
  colours: { straight: '#56b4e9', side: '#e69f00', down: '#cc79a7', rising: '#2bc48a', low: '#f0e442', push: '#e3622b' },
  // How a blow went: a hit flashes white round the kind's colour; a block is steel; a glance a spark; a miss grey.
  outcomeColours: { hit: '#ffffff', glance: '#ffe9a8', blocked: '#b7c3d0', parried: '#b7c3d0', miss: '#8a93a6' },
  // A move whose travel climbs (or falls) more than this share is rising (or from above).
  steep: 0.5,
  // Target on the body: where each zone of him lies on the pad.
  zoneHeight: { head: 0.55, body: 0, legs: -0.75 },
  zoneSide: 0.55,
  // A second tap on the same zone within this (s) takes the next move that reaches it.
  againWithin: 0.7,
};

const fightUiUnit = (x, y) => {
  const length = Math.hypot(x, y) || 1;
  return [x / length, y / length];
};

/** The hand a move is made with, for its icon: 'fist', 'foot', 'knee', 'elbow', 'blade', 'club', 'gun', 'shield' or 'body'. */
export function fightUiLimb(spec) {
  if (spec.kind === 'rush') return 'body';
  if (spec.bash) return 'shield';
  if (spec.path === 'aim') return 'gun';
  if (spec.path === 'blade') return 'blade';
  if (spec.path === 'club' || spec.path === 'swipe') return 'club';
  if (spec.path === 'knee') return 'knee';
  if (spec.path === 'elbow' || spec.path === 'upElbow') return 'elbow';
  if (/Foot$/.test(spec.limb ?? '')) return 'foot';
  return 'fist';
}

/** The way a move travels across the screen ([x, y], unit), or null for one that goes straight in. */
export function fightUiTravel(spec, place) {
  if (spec.kind === 'rush' || spec.path === 'straight' || spec.path === 'aim' || spec.path === 'teep' || spec.path === 'pushBoth') return null;
  if (spec.path === 'blade') {
    if (spec.mode === 'thrust' || !spec.from || !spec.to) return null;
    // Local z is to his left: the right of the screen is −z.
    return fightUiUnit(spec.to.hand[2] * -1 - spec.from.hand[2] * -1, spec.to.hand[1] - spec.from.hand[1]);
  }
  const side = place.x < 0 ? -1 : 1;
  const legsOnly = spec.zones?.length === 1 && spec.zones[0] === 'legs';
  const ways = {
    hook: [-side, 0], swipe: [-side, -0.15], upper: [-0.3 * side, 1], elbow: [-side, -0.3], upElbow: [0, 1], knee: [0, 1],
    roundhouse: legsOnly ? [-side, 0.1] : [-side, 0.55], club: [-0.3 * side, -1],
  };
  return fightUiUnit(...(ways[spec.path] ?? [-place.x, -place.y]));
}

/** The group of the action buttons a move belongs to. */
export function fightUiGroup(spec, travel) {
  if (spec.kind === 'rush' || spec.push || spec.bash) return 'push';
  if (spec.zones?.length === 1 && spec.zones[0] === 'legs') return 'low';
  if (spec.path === 'roundhouse' || spec.path === 'knee') return 'low';
  if (!travel) return 'straight';
  if (travel[1] > FIGHT_UI.steep) return 'rising';
  if (travel[1] < -FIGHT_UI.steep) return 'down';
  return 'side';
}

/**
 * The moves of a style as the new controls show them: each attack the pad
 * throws (not the clinch: that is the special button), with its place, the
 * way it travels, its hand, its group, its name.
 */
export function fightUiMoves(styleKey) {
  return attackLayout(styleKey).map((place) => {
    const spec = MOVES[place.move];
    const travel = fightUiTravel(spec, place);
    const { name, gloss } = moveName(place.move);
    return {
      move: place.move, name, gloss, place: { x: place.x, y: place.y },
      travel, straight: !travel, limb: fightUiLimb(spec), group: fightUiGroup(spec, travel),
      zones: spec.zones ?? [], side: place.x < -0.2 ? -1 : place.x > 0.2 ? 1 : 0,
    };
  });
}

/** The colour of a kind of blow (a move's group). */
export const fightUiColour = (group) => FIGHT_UI.colours[group] ?? '#ffffff';

/** The action buttons of a style: [{ group, moves }] in the groups' order, empty groups left out. */
export function fightUiButtons(moves) {
  return FIGHT_UI.groups.map((group) => ({ group, moves: moves.filter((entry) => entry.group === group) })).filter((button) => button.moves.length);
}

/** The zone a move goes at: the one wanted if it can, else the body, else its first. */
export function fightUiZone(move, wanted) {
  const zones = MOVES[move]?.zones ?? [];
  if (zones.includes(wanted)) return wanted;
  return zones.includes('body') ? 'body' : zones[0] ?? null;
}

/** The zone a move goes at by its own height on the pad (as a tap there would). */
export const fightUiZoneOf = (entry) => fightUiZone(entry.move, entry.place.y > 0.25 ? 'head' : entry.place.y < -0.55 ? 'legs' : 'body');

// ---- Target on the body -----------------------------------------------------

/**
 * The moves that reach a zone of him (head, body, legs) on a side of the
 * screen (−1 left, 1 right, 0 the middle), best first: those that can go
 * there, nearest the place where it lies.
 */
export function fightUiReaching(moves, zone, side) {
  const strikes = moves.filter((entry) => MOVES[entry.move]?.kind === 'strike');
  const can = strikes.filter((entry) => entry.zones.includes(zone));
  const pool = can.length ? can : strikes;
  const x = side * FIGHT_UI.zoneSide;
  const y = FIGHT_UI.zoneHeight[zone] ?? 0;
  // A move from the far side is a worse fit than its height alone says.
  const fit = (entry) => Math.hypot(entry.place.x - x, entry.place.y - y) + (side && entry.side === -side ? 0.6 : 0);
  return pool.slice().sort((a, b) => fit(a) - fit(b));
}

/** The move a tap on a zone throws: the best that reaches it (the next one on a quick second tap): { move, zone, entry } or null. */
export function fightUiTarget(moves, zone, side, again = 0) {
  const reaching = fightUiReaching(moves, zone, side);
  if (!reaching.length) return null;
  const entry = reaching[again % Math.min(reaching.length, 3)];
  return { move: entry.move, zone: fightUiZone(entry.move, zone), entry, reaches: entry.zones.includes(zone) };
}

// ---- Whether a move can be thrown now --------------------------------------

/**
 * Whether he can throw a move now: { ok, why, cooling } — `why` 'down', 'busy'
 * (a blow in flight; `cooling` 0..1 of the way through it), 'tired' (not the
 * wind for it), 'empty' (a gun to load: asking loads it) or 'none'.
 */
export function fightUiReady(fighter, move) {
  const spec = MOVES[move];
  if (!fighter || !spec) return { ok: false, why: 'none', cooling: 0 };
  if (fighter.state !== 'up' || fighter.netted || fighter.crawling) return { ok: false, why: 'down', cooling: 0 };
  if (spec.bash && !fighter.shield) return { ok: false, why: 'none', cooling: 0 };
  const blade = spec.path === 'blade' && fighter.weapon?.held ? fighter.weapon : null;
  const lift = blade ? Math.max(1, blade.spec.mass / WORLD.weapons.heavyFrom) / (handling(fighter.body, blade.spec).speed ?? 1) : 1;
  const drain = ((spec.cost ?? 0) * lift) / (fighter.body.aerobic || 1);
  // (The player is never too tired: he goes on into the overdraft, weaker, physics/overdraft.js.)
  if (fighter.stamina < drain && !fighter.player) return { ok: false, why: 'tired', cooling: 0 };
  const busy = fighter.punch ?? fighter.rush ?? null;
  if (busy || fighter.pain || fighter.pickup) {
    const duration = busy?.spec?.duration ?? 1;
    return { ok: false, why: 'busy', cooling: busy ? Math.max(0, Math.min(1, (busy.t ?? busy.age ?? 0) / duration)) : 0 };
  }
  if (spec.path === 'aim' && fighter.weapon?.held && fighter.weapon.spec.shot && !fighter.weapon.loaded) return { ok: true, why: 'empty', cooling: 0 };
  return { ok: true, why: null, cooling: 0 };
}

/** The styles' names, for a check that every style has something to throw. */
export const fightUiStyles = () => Object.keys(STYLES);
